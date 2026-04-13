const { verifyAdminSessionToken } = require('../../utils/premium-offers-auth');
const {
  getMissingSheetEnvVars,
  deletePremiumOfferType,
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
  if (event.httpMethod !== 'POST') {
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

  const tokenResult = verifyAdminSessionToken(getBearerToken(event));
  if (!tokenResult.valid) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Admin session invalide' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  try {
    const result = await deletePremiumOfferType(body.id);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    const isNotFound = error.message === 'Offer type not found';
    const isConflict = error.message === "Impossible de supprimer un type d'offre utilise par une offre";
    return {
      statusCode: isNotFound ? 404 : isConflict ? 409 : 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to delete premium offer type' }),
    };
  }
};
