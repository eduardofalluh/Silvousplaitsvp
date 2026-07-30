// Admin: delete an archived premium offer from the archive tab.
const { verifyAdminSessionToken } = require('../../utils/premium-offers-auth');
const {
  getMissingSheetEnvVars,
  deleteArchivedOffer,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { allowAuthorization: true, noStore: true });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!isAllowedOrigin(event)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const missing = getMissingSheetEnvVars();
  if (missing.length) return { statusCode: 500, headers, body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }) };

  const tokenResult = verifyAdminSessionToken(getBearerToken(event));
  if (!tokenResult.valid) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Admin session invalide' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  try {
    const result = await deleteArchivedOffer(body.id);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, ...result }) };
  } catch (error) {
    return { statusCode: error.message === 'Archived offer not found' ? 404 : 500, headers, body: JSON.stringify({ error: error.message || 'Failed to delete archived offer' }) };
  }
};
