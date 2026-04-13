const premiumChecker = require('../../utils/premium-checker');
const { verifyPremiumOffersSessionToken } = require('../../utils/premium-offers-auth');
const {
  getMissingSheetEnvVars,
  listPremiumOffers,
  listPremiumOfferRegions,
  listPremiumOfferTypes,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { allowAuthorization: true, noStore: true });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (!isAllowedOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
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
    const [offers, regions, offerTypes] = await Promise.all([
      listPremiumOffers({ includeInactive: false }),
      listPremiumOfferRegions(),
      listPremiumOfferTypes(),
    ]);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, offers, regions, offerTypes }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to load premium offers' }),
    };
  }
};
