const premiumChecker = require('../../utils/premium-checker');
const { verifyPremiumOffersSessionToken } = require('../../utils/premium-offers-auth');
const {
  getMissingSheetEnvVars,
  listPremiumOffers,
  listPremiumOfferRegions,
} = require('../../utils/premium-offers-store');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const missing = getMissingSheetEnvVars();
  if (missing.length) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }),
    };
  }

  const accessToken = getBearerToken(event);
  const tokenResult = verifyPremiumOffersSessionToken(accessToken);
  if (!tokenResult.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or expired premium offers session' }),
    };
  }

  const email = String((tokenResult.payload || {}).email || '').trim().toLowerCase();
  const premiumStatus = await premiumChecker.isPremiumMember(email, false);
  if (!premiumStatus.isPremium) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Premium membership required' }),
    };
  }

  try {
    const [offers, regions] = await Promise.all([
      listPremiumOffers({ includeInactive: false }),
      listPremiumOfferRegions(),
    ]);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, offers, regions }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to load premium offers' }),
    };
  }
};
