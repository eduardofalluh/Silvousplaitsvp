const premiumChecker = require('../../utils/premium-checker');
const {
  getOffersSecret,
  createPremiumOffersSessionToken,
} = require('../../utils/premium-offers-auth');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!getOffersSecret()) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Premium offers login is not fully configured on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const email = normalize(body.email);
  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
  }

  const premiumStatus = await premiumChecker.isPremiumMember(email, false);
  if (!premiumStatus.isPremium) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Premium membership required' }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      accessToken: createPremiumOffersSessionToken(email),
      email,
    }),
  };
};
