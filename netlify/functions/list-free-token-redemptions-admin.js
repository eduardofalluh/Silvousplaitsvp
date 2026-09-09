const { verifyAdminSessionToken } = require('../../utils/premium-offers-auth');
const {
  getMissingSheetEnvVars,
  listFreeOfferRedemptionsAdmin,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

function getBearerToken(event) {
  const header = (event.headers || {}).authorization || (event.headers || {}).Authorization || '';
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

  const tokenResult = verifyAdminSessionToken(getBearerToken(event));
  if (!tokenResult.valid) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Admin session invalide' }) };
  }
  if (getMissingSheetEnvVars().length) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Token history is not configured' }) };
  }

  try {
    const redemptions = await listFreeOfferRedemptionsAdmin();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, redemptions }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to load token redemptions' }),
    };
  }
};
