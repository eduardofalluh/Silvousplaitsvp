/**
 * Update the logged-in member's account details.
 * Body (JSON): { session, firstName, lastName, phone, ville }
 */
const { verifySignedToken } = require('../../utils/premium-access-token');

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

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function slugCity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-');
}

async function ac(path, options = {}) {
  const res = await fetch(`${AC_API_URL}/api/3/${path}`, {
    ...options,
    headers: { 'Api-Token': AC_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

async function findContactByEmail(email) {
  const found = await ac(`contacts?email=${encodeURIComponent(email)}`);
  const contacts = (found.data && found.data.contacts) || [];
  const normalized = String(email || '').trim().toLowerCase();
  return contacts.find((contact) => String(contact.email || '').trim().toLowerCase() === normalized) || contacts[0] || null;
}

async function updateCityList(contactId, ville) {
  const selectedList = CITY_LIST[ville];
  if (!selectedList) return { updated: false };

  const cityListIds = new Set(Object.values(CITY_LIST).filter(Boolean).map((id) => String(id).trim()));
  const current = await ac(`contacts/${encodeURIComponent(contactId)}/contactLists`);
  const memberships = (current.data && current.data.contactLists) || [];
  let touched = 0;

  for (const membership of memberships) {
    const listId = String(membership.list || '').trim();
    if (!cityListIds.has(listId) || listId === String(selectedList).trim() || String(membership.status || '') !== '1') continue;
    const res = await ac('contactLists', {
      method: 'POST',
      body: JSON.stringify({ contactList: { list: listId, contact: contactId, status: 2 } }),
    });
    if (res.ok) touched += 1;
  }

  const added = await ac('contactLists', {
    method: 'POST',
    body: JSON.stringify({ contactList: { list: selectedList, contact: contactId, status: 1 } }),
  });
  if (added.ok) touched += 1;
  return { updated: Boolean(added.ok), touched, listId: selectedList };
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

  const email = String(check.payload.e || '').trim().toLowerCase();
  const contact = await findContactByEmail(email);
  if (!contact || !contact.id) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Contact not found' }) };

  const payload = {
    firstName: cleanText(body.firstName, 80),
    lastName: cleanText(body.lastName, 80),
    phone: cleanText(body.phone, 40),
  };

  const updated = await ac(`contacts/${encodeURIComponent(contact.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ contact: payload }),
  });
  if (!updated.ok) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Account update failed' }) };
  }

  const ville = slugCity(body.ville);
  const city = ville ? await updateCityList(contact.id, ville) : { updated: false };
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, contactId: contact.id, city }) };
};
