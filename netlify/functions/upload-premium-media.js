const crypto = require('crypto');
const { connectLambda, getStore } = require('@netlify/blobs');
const { verifyAdminSessionToken } = require('../../utils/premium-offers-auth');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^(image|video)\//i;

function connectBlobs(event) {
  if (event && event.blobs) connectLambda(event);
}

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function extensionFor(filename, contentType) {
  const fromName = String(filename || '').match(/\.([a-z0-9]{2,5})$/i);
  if (fromName) return fromName[1].toLowerCase();
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogg',
    'video/quicktime': 'mov',
  };
  return map[String(contentType || '').toLowerCase()] || 'bin';
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { allowAuthorization: true, noStore: true });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (!isAllowedOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const tokenResult = verifyAdminSessionToken(getBearerToken(event));
  if (!tokenResult.valid) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Admin session invalide' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const contentType = String(body.contentType || '').trim().toLowerCase();
  const dataUrl = String(body.dataUrl || '');
  const filename = String(body.filename || 'media').trim();
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);

  if (!ALLOWED_TYPES.test(contentType) || !match || !ALLOWED_TYPES.test(match[1])) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Format media non supporte.' }) };
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Fichier invalide.' }) };
  }

  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Fichier trop lourd. Utilise un lien YouTube, Vimeo ou mp4 heberge.' }),
    };
  }

  const ext = extensionFor(filename, contentType);
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const key = `media/${Date.now()}-${id}.${ext}`;

  try {
    connectBlobs(event);
    const store = getStore('premium-media');
    await store.set(key, buffer, {
      metadata: {
        contentType,
        filename,
      },
    });
    const url = `/.netlify/functions/premium-media?key=${encodeURIComponent(key)}&name=${encodeURIComponent(filename)}`;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, key, url }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Televersement impossible.' }),
    };
  }
};
