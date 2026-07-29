/**
 * Return the logged-in member's real account info, verified by their session
 * token (issued by verify-login-code). Read-only against ActiveCampaign.
 * Body (JSON): { session }
 * Returns: { ok, email, firstName, lastName, phone, isPremium }
 */
const { verifySignedToken } = require('../../utils/premium-access-token');
const premiumChecker = require('../../utils/premium-checker');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SECRET || !AC_API_URL || !AC_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const check = verifySignedToken(String(body.session || ''), SECRET);
  if (!check.valid || (check.payload && check.payload.kind !== 'session') || !check.payload.e) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, reason: check.reason || 'invalid-session' }) };
  }
  const email = check.payload.e;

  try {
    const r = await fetch(`${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`, { headers: { 'Api-Token': AC_API_KEY } });
    const d = await r.json();
    const c = (d.contacts || [])[0] || {};
    const status = await premiumChecker.isPremiumMember(email, false);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        email,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        phone: c.phone || '',
        isPremium: Boolean(status.isPremium),
      }),
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'lookup-failed' }) };
  }
};
