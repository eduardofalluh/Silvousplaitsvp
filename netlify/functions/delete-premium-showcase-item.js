const { verifyAdminSessionToken } = require('../../utils/premium-offers-auth');
const {
  getMissingSheetEnvVars,
  deletePremiumShowcaseItem,
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
    const result = await deletePremiumShowcaseItem(body.id);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    return {
      statusCode: error.message === 'Showcase item not found' ? 404 : 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to delete premium showcase item' }),
    };
  }
};
