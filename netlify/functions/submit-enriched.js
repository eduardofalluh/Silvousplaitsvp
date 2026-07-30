/**
 * Enriched signup (the tunnel funnel): captures prénom, ville, interests and
 * outing frequency, then writes to ActiveCampaign via the API v3:
 *   - contact/sync (email + firstName)
 *   - add to the city's list (status active)
 *   - apply interest + frequency tags (resolved by name, created if missing)
 *
 * Body (JSON): { email, firstName, ville, interests: [], tranche, website }
 * `website` is a honeypot. `ville` may be "test" to route to the AC test list
 * (used by automated tests so real lists are never touched).
 */
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// City -> ActiveCampaign list id. Montréal uses the general free list (4).
const CITY_LIST = (() => {
  try {
    if (process.env.AC_CITY_LIST_MAP) return JSON.parse(process.env.AC_CITY_LIST_MAP);
  } catch { /* ignore */ }
  return { montreal: '4', quebec: '8', 'trois-rivieres': '9', sherbrooke: '10' };
})();
const DEFAULT_LIST = process.env.ACTIVECAMPAIGN_FREE_LIST_ID || '4';

// UI label -> existing AC tag name (so we reuse tags instead of duplicating).
const INTEREST_TAG = {
  'théâtre': 'Théâtre', theatre: 'Théâtre',
  musique: 'Musique',
  humour: 'Humour',
  'cinéma': 'Cinema', cinema: 'Cinema',
  'arts visuels': 'Arts visuels',
  festivals: 'Festivals', festival: 'Festivals',
  sport: 'sport', sports: 'sport',
};
const TRANCHE_TAG = {
  '0-1': 'sorties-0-1-mois', '0–1': 'sorties-0-1-mois',
  '2-3': 'sorties-2-3-mois', '2–3': 'sorties-2-3-mois',
  '4-6': 'sorties-4-6-mois', '4–6': 'sorties-4-6-mois',
  '7+': 'sorties-7-plus-mois',
};

function norm(s) { return String(s || '').trim().toLowerCase(); }
function slugCity(v) {
  return norm(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
}

async function acApi(path, options = {}) {
  const res = await fetch(`${AC_API_URL}/api/3/${path}`, {
    ...options,
    headers: { 'Api-Token': AC_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

// Resolve a tag id by name, creating the tag if it does not exist yet.
const tagIdCache = {};
async function resolveTagId(name) {
  const key = norm(name);
  if (tagIdCache[key]) return tagIdCache[key];
  const found = await acApi(`tags?search=${encodeURIComponent(name)}&limit=100`);
  const match = (found.data.tags || []).find((t) => norm(t.tag) === key);
  if (match) return (tagIdCache[key] = match.id);
  const created = await acApi('tags', { method: 'POST', body: JSON.stringify({ tag: { tag: name, tagType: 'contact' } }) });
  const id = created.data && created.data.tag && created.data.tag.id;
  if (id) tagIdCache[key] = id;
  return id || null;
}

async function applyTag(contactId, tagName) {
  const tagId = await resolveTagId(tagName);
  if (!tagId) return false;
  const r = await acApi('contactTags', { method: 'POST', body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }) });
  return r.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!AC_API_URL || !AC_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ActiveCampaign not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

  // Honeypot -> pretend success, do nothing.
  if (String(body.website || '').trim()) {
    return { statusCode: 200, headers, body: JSON.stringify({ subscribed: false, botBlocked: true }) };
  }

  const email = norm(body.email);
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Adresse email invalide' }) };
  }

  // 1) sync contact (email + prénom)
  const contact = { email };
  const firstName = String(body.firstName || '').trim();
  if (firstName) contact.firstName = firstName;
  const sync = await acApi('contact/sync', { method: 'POST', body: JSON.stringify({ contact }) });
  const contactId = sync.data && sync.data.contact && sync.data.contact.id;
  if (!contactId) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'ActiveCampaign sync failed', subscribed: false }) };
  }

  // 2) add to the city's list (active)
  const listId = CITY_LIST[slugCity(body.ville)] || DEFAULT_LIST;
  const listRes = await acApi('contactLists', { method: 'POST', body: JSON.stringify({ contactList: { list: listId, contact: contactId, status: 1 } }) });

  // 3) interest + frequency tags
  const appliedTags = [];
  const interests = Array.isArray(body.interests) ? body.interests : [];
  for (const label of interests) {
    const tagName = INTEREST_TAG[norm(label)] || String(label).trim();
    if (tagName && (await applyTag(contactId, tagName))) appliedTags.push(tagName);
  }
  const trancheName = TRANCHE_TAG[String(body.tranche || '').trim()];
  if (trancheName && (await applyTag(contactId, trancheName))) appliedTags.push(trancheName);

  // premium interest (yes -> "intérêt premium", no -> "refusé-premium-site")
  const pi = String(body.premiumInterest || '').trim().toLowerCase();
  if (pi === 'yes' || pi === 'oui') { if (await applyTag(contactId, 'intérêt premium')) appliedTags.push('intérêt premium'); }
  else if (pi === 'no' || pi === 'non') { if (await applyTag(contactId, 'refusé-premium-site')) appliedTags.push('refusé-premium-site'); }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ subscribed: Boolean(listRes.ok), contactId, listId, appliedTags }),
  };
};
