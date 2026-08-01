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
const CITY_LIST = (() => {
  try {
    if (process.env.AC_CITY_LIST_MAP) return JSON.parse(process.env.AC_CITY_LIST_MAP);
  } catch {
    /* ignore */
  }
  return { montreal: '4', quebec: '8', 'trois-rivieres': '9', sherbrooke: '10' };
})();

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const CITY_LABELS = {
  montreal: 'Montréal',
  quebec: 'Québec',
  'trois-rivieres': 'Trois-Rivières',
  sherbrooke: 'Sherbrooke',
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

function activeCityFromLists(contactLists) {
  const byListId = Object.entries(CITY_LIST).reduce((acc, entry) => {
    acc[String(entry[1]).trim()] = entry[0];
    return acc;
  }, {});
  const active = (contactLists || []).find((cl) => {
    const listId = String(cl.list || '').trim();
    return String(cl.status || '').trim() === '1' && byListId[listId];
  });
  if (!active) return { ville: '', cityLabel: '' };
  const ville = byListId[String(active.list).trim()] || '';
  return { ville, cityLabel: CITY_LABELS[ville] || '' };
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

  try {
    const r = await ac(`contacts?email=${encodeURIComponent(email)}`);
    const c = ((r.data && r.data.contacts) || [])[0] || {};
    const lists = c.id ? await ac(`contacts/${encodeURIComponent(c.id)}/contactLists`) : { data: { contactLists: [] } };
    const city = activeCityFromLists((lists.data && lists.data.contactLists) || []);
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
        ville: city.ville,
        cityLabel: city.cityLabel,
        isPremium: Boolean(status.isPremium),
      }),
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'lookup-failed' }) };
  }
};
