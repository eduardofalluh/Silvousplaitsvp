const {
  getOffersSecret,
  PREMIUM_OFFERS_ADMIN_PASSWORD,
  isAdminPasswordValid,
  createAdminSessionToken,
} = require('../../utils/premium-offers-auth');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');
const { checkRateLimit } = require('../../utils/rate-limit');

function getClientIp(event) {
  const raw =
    event.headers['x-forwarded-for'] ||
    event.headers['client-ip'] ||
    event.headers['x-nf-client-connection-ip'] ||
    '';
  return String(raw).split(',')[0].trim() || 'unknown';
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { noStore: true });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (!isAllowedOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!getOffersSecret() || !PREMIUM_OFFERS_ADMIN_PASSWORD) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Admin auth is not fully configured on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const rateLimit = checkRateLimit(`admin-login:${getClientIp(event)}`, {
    windowMs: 15 * 60 * 1000,
    max: 8,
  });
  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' }),
    };
  }

  if (!isAdminPasswordValid(body.password)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Mot de passe invalide' }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      accessToken: createAdminSessionToken(),
    }),
  };
};
