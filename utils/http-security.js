function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function getConfiguredOrigins() {
  return [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_URL,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);
}

function getRequestOrigin(event) {
  const headers = event && event.headers ? event.headers : {};
  return normalizeOrigin(headers.origin || headers.Origin || '');
}

function getHostOrigin(event) {
  const headers = event && event.headers ? event.headers : {};
  const host = String(
    headers['x-forwarded-host'] ||
      headers.host ||
      headers.Host ||
      ''
  ).trim();
  const proto = String(
    headers['x-forwarded-proto'] ||
      headers['X-Forwarded-Proto'] ||
      'https'
  ).trim();

  return host ? normalizeOrigin(`${proto}://${host}`) : '';
}

function isAllowedOrigin(event) {
  const requestOrigin = getRequestOrigin(event);
  if (!requestOrigin) return true;

  const configuredOrigins = getConfiguredOrigins();
  const hostOrigin = getHostOrigin(event);

  return configuredOrigins.includes(requestOrigin) || requestOrigin === hostOrigin;
}

function buildJsonHeaders(event, options = {}) {
  const {
    allowAuthorization = false,
    noStore = false,
  } = options;

  const requestOrigin = getRequestOrigin(event);
  const allowedOrigin = isAllowedOrigin(event) ? requestOrigin || getHostOrigin(event) : '';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': allowAuthorization
      ? 'Content-Type, Authorization'
      : 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  if (noStore) {
    headers['Cache-Control'] = 'no-store';
    headers.Pragma = 'no-cache';
  }

  return headers;
}

module.exports = {
  buildJsonHeaders,
  isAllowedOrigin,
};
