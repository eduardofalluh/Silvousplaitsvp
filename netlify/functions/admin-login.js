const {
  getOffersSecret,
  PREMIUM_OFFERS_ADMIN_PASSWORD,
  isAdminPasswordValid,
  createAdminSessionToken,
} = require('../../utils/premium-offers-auth');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
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
