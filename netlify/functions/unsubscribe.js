/**
 * Newsletter unsubscribe (désinscription) for the logged-in member.
 * Session-verified. Sets the contact's status to "unsubscribed" (2) on every
 * list they are currently active on. Writes to ActiveCampaign only (not the
 * offers sheet).
 * Body (JSON): { session }
 */
const { verifySignedToken } = require('../../utils/premium-access-token');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function ac(path, options = {}) {
  const res = await fetch(`${AC_API_URL}/api/3/${path}`, {
    ...options,
    headers: { 'Api-Token': AC_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, data };
}

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

  const found = await ac(`contacts?email=${encodeURIComponent(email)}`);
  const contact = (found.data.contacts || [])[0];
  if (!contact) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, unsubscribed: 0 }) };

  const cl = await ac(`contacts/${contact.id}/contactLists`);
  const active = (cl.data.contactLists || []).filter((l) => String(l.status) === '1');
  let count = 0;
  for (const l of active) {
    const r = await ac('contactLists', { method: 'POST', body: JSON.stringify({ contactList: { list: l.list, contact: contact.id, status: 2 } }) });
    if (r.ok) count += 1;
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, unsubscribed: count }) };
};
