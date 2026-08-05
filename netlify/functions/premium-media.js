const { connectLambda, getStore } = require('@netlify/blobs');
const { isAllowedOrigin } = require('../../utils/http-security');

function connectBlobs(event) {
  if (event && event.blobs) connectLambda(event);
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
    headers['Content-Type'] = String(metadata.contentType || 'application/octet-stream');
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
