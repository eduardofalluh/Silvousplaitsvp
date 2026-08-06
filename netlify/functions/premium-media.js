const { connectLambda, getStore } = require('@netlify/blobs');
const { isAllowedOrigin } = require('../../utils/http-security');

function connectBlobs(event) {
  if (event && event.blobs) connectLambda(event);
}

// Last-resort content type when a blob carries no metadata. Only extensions
// the admin upload accepts are mapped; anything unknown stays octet-stream so
// we never mislabel a file.
const EXT_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
};
function contentTypeFromKey(key) {
  const m = /\.([a-z0-9]+)$/i.exec(String(key || ''));
  return (m && EXT_TYPES[m[1].toLowerCase()]) || 'application/octet-stream';
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  if (isAllowedOrigin(event) && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (!isAllowedOrigin(event)) {
    return { statusCode: 403, headers, body: 'Forbidden origin' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  const key = String((event.queryStringParameters || {}).key || '').trim();
  if (!key || !/^media\/[a-z0-9_.-]+$/i.test(key)) {
    return { statusCode: 400, headers, body: 'Invalid media key' };
  }

  try {
    connectBlobs(event);
    const store = getStore('premium-media');
    const item = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!item || !item.data) {
      return { statusCode: 404, headers, body: 'Media not found' };
    }

    const metadata = item.metadata || {};
    // Falling back to application/octet-stream broke playback in Firefox, which
    // honours Content-Type strictly — and this response also sends
    // X-Content-Type-Options: nosniff, so the browser is explicitly forbidden
    // from guessing. Chrome played it anyway, which is why it looked fine there.
    // Derive the type from the key's extension when metadata is missing, so a
    // blob written without it (a migration, a future upload path) still plays
    // everywhere instead of silently working in one browser only.
    headers['Content-Type'] = String(metadata.contentType || contentTypeFromKey(key));
    return {
      statusCode: 200,
      headers,
      isBase64Encoded: true,
      body: Buffer.from(item.data).toString('base64'),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: 'Media unavailable' };
  }
};
