/**
 * Tag a known ActiveCampaign contact by email. Used for funnel signals such as
 * the Premium-click tag (`a-cliqué-premium-siteweb`) that feed the conversion
 * funnel. Only tags contacts that ALREADY exist — a click never creates a new
 * contact (that would pollute the audience with anonymous rows).
 *
 * Body (JSON): { email, tag? }  (tag defaults to the premium-click tag)
 */
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';

const ALLOWED_TAGS = new Set([
  'a-cliqué-premium-siteweb',
  'refusé-premium-site',
]);
const DEFAULT_TAG = 'a-cliqué-premium-siteweb';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function acApi(path, options = {}) {
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
  if (!AC_API_URL || !AC_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ActiveCampaign not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email required' }) };
  }
  const tagName = ALLOWED_TAGS.has(body.tag) ? body.tag : DEFAULT_TAG;

  // Only tag existing contacts.
  const found = await acApi(`contacts?email=${encodeURIComponent(email)}`);
  const contact = (found.data.contacts || [])[0];
  if (!contact) {
    return { statusCode: 200, headers, body: JSON.stringify({ tagged: false, reason: 'unknown-contact' }) };
  }

  // Resolve tag id (create if missing so the funnel signal is never lost).
  const search = await acApi(`tags?search=${encodeURIComponent(tagName)}&limit=100`);
  let tag = (search.data.tags || []).find((t) => String(t.tag).toLowerCase() === tagName.toLowerCase());
  if (!tag) {
    const created = await acApi('tags', { method: 'POST', body: JSON.stringify({ tag: { tag: tagName, tagType: 'contact' } }) });
    tag = created.data && created.data.tag;
  }
  if (!tag || !tag.id) return { statusCode: 502, headers, body: JSON.stringify({ tagged: false, reason: 'tag-resolve-failed' }) };

  const applied = await acApi('contactTags', { method: 'POST', body: JSON.stringify({ contactTag: { contact: contact.id, tag: tag.id } }) });
  return { statusCode: 200, headers, body: JSON.stringify({ tagged: Boolean(applied.ok), tag: tagName }) };
};
