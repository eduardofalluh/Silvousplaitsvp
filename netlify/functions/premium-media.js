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

function rangeHeader(event) {
  return String(event.headers.range || event.headers.Range || '').trim();
}

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || !Number.isFinite(size) || size <= 0) return null;

  let start;
  let end;
  if (match[1] === '' && match[2] === '') return null;

  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
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
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
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
    const data = Buffer.from(item.data);
    const size = data.length;
    // Falling back to application/octet-stream broke playback in Firefox, which
    // honours Content-Type strictly — and this response also sends
    // X-Content-Type-Options: nosniff, so the browser is explicitly forbidden
    // from guessing. Chrome played it anyway, which is why it looked fine there.
    // Derive the type from the key's extension when metadata is missing, so a
    // blob written without it (a migration, a future upload path) still plays
    // everywhere instead of silently working in one browser only.
    headers['Content-Type'] = String(metadata.contentType || contentTypeFromKey(key));
    headers['Accept-Ranges'] = 'bytes';

    const requestedRange = rangeHeader(event);
    if (requestedRange) {
      const range = parseByteRange(requestedRange, size);
      if (!range) {
        return {
          statusCode: 416,
          headers: Object.assign({}, headers, { 'Content-Range': `bytes */${size}` }),
          body: '',
        };
      }

      const chunk = data.subarray(range.start, range.end + 1);
      const rangeHeaders = Object.assign({}, headers, {
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(chunk.length),
      });
      return {
        statusCode: 206,
        headers: rangeHeaders,
        isBase64Encoded: true,
        body: event.httpMethod === 'HEAD' ? '' : chunk.toString('base64'),
      };
    }

    headers['Content-Length'] = String(size);
    return {
      statusCode: 200,
      headers,
      isBase64Encoded: true,
      body: event.httpMethod === 'HEAD' ? '' : data.toString('base64'),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: 'Media unavailable' };
  }
};
