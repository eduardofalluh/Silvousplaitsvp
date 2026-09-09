/**
 * Enriched signup (the tunnel funnel): captures prénom, ville, interests and
 * outing frequency, then writes to the contact system:
 *   - contact/sync through the city's double opt-in form
 *   - apply interest + frequency tags (resolved by name, created if missing)
 *
 * Body (JSON): { email, firstName, ville, interests: [], tranche, website }
 * `website` is a honeypot. Unknown cities are rejected before any writes.
 */
const { cityForms, submitDoubleOptIn } = require('../../utils/newsletter-opt-in');
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// City -> list id. Montréal uses the general free list (4).
const CITY_LIST = (() => {
  try {
    if (process.env.AC_CITY_LIST_MAP) return JSON.parse(process.env.AC_CITY_LIST_MAP);
  } catch { /* ignore */ }
  return { montreal: '4', quebec: '8', 'trois-rivieres': '9', sherbrooke: '10' };
})();
const DEFAULT_LIST = process.env.ACTIVECAMPAIGN_FREE_LIST_ID || '4';
const PREMIUM_LIST_ID = process.env.ACTIVECAMPAIGN_PREMIUM_LIST_ID || '';
const PREMIUM_TAG = process.env.ACTIVECAMPAIGN_PREMIUM_TAG || 'premium_active';
const SUBSCRIPTION_LIST_IDS = new Set(
  Object.values(CITY_LIST)
    .concat([DEFAULT_LIST, PREMIUM_LIST_ID])
    .filter(Boolean)
    .map((id) => String(id).trim())
);

// UI label -> existing tag name (so we reuse tags instead of duplicating).
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

async function findContactByEmail(email) {
  const found = await acApi(`contacts?email=${encodeURIComponent(email)}`);
  if (!found.ok) throw new Error('Contact lookup failed');
  const contacts = (found.data && found.data.contacts) || [];
  return contacts.find((c) => norm(c.email) === norm(email)) || null;
}

async function activeSubscriptionLists(contactId) {
  const lists = await acApi(`contacts/${encodeURIComponent(contactId)}/contactLists`);
  if (!lists.ok) throw new Error('Subscription lookup failed');
  return ((lists.data && lists.data.contactLists) || []).filter((cl) => {
    const listId = String(cl.list || '').trim();
    const status = String(cl.status || '').trim();
    return status === '1' && SUBSCRIPTION_LIST_IDS.has(listId);
  });
}

async function hasPremiumTag(contactId) {
  if (!PREMIUM_TAG) return false;
  const tagLinks = await acApi(`contacts/${encodeURIComponent(contactId)}/contactTags`);
  if (!tagLinks.ok) throw new Error('Premium lookup failed');
  const tagIds = [...new Set(((tagLinks.data && tagLinks.data.contactTags) || []).map((ct) => ct.tag).filter(Boolean))];
  const expected = norm(PREMIUM_TAG);
  for (const tagId of tagIds) {
    const tagRes = await acApi(`tags/${encodeURIComponent(tagId)}`);
    if (!tagRes.ok) throw new Error('Premium tag lookup failed');
    const tagName = tagRes.data && tagRes.data.tag && tagRes.data.tag.tag;
    if (norm(tagName) === expected) return true;
  }
  return false;
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
  if (!AC_API_URL || !AC_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Subscription service not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };

  // Honeypot -> pretend success, do nothing.
  if (String(body.website || '').trim()) {
    return { statusCode: 200, headers, body: JSON.stringify({ subscribed: false, botBlocked: true }) };
  }

  const email = norm(body.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Adresse email invalide' }) };
  }

  const city = slugCity(body.ville || 'montreal');
  const listId = CITY_LIST[city];
  const formId = cityForms()[city];
  if (!listId || !formId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ville non prise en charge', subscribed: false }) };

  try {
    const existing = await findContactByEmail(email);
    if (existing && existing.id) {
      const activeLists = await activeSubscriptionLists(existing.id);
      const premiumTagged = await hasPremiumTag(existing.id);
      if (activeLists.length || premiumTagged) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            subscribed: false,
            alreadySubscribed: true,
            alreadyPremium: premiumTagged || activeLists.some((cl) => String(cl.list) === String(PREMIUM_LIST_ID)),
            contactId: existing.id,
          }),
        };
      }
    }

    const contact = { email };
    const firstName = String(body.firstName || '').trim();
    if (firstName) contact.firstName = firstName;
    const { contactId, confirmationPending } = await submitDoubleOptIn(acApi, contact, formId, listId);

    // Enrichment is best effort after the form succeeds. A tag outage must not
    // tell the visitor to repeat a successful confirmation request.
    // 3) interest + frequency tags
    const appliedTags = [];
    try {
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

    } catch { console.error('Newsletter submitted but enrichment failed'); }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ subscribed: true, confirmationPending, contactId, listId, appliedTags }),
    };
  } catch {
    console.error('Newsletter double opt-in submission failed');
    return { statusCode: 502, headers, body: JSON.stringify({ subscribed: false, error: "L'inscription n'a pas fonctionné. Réessaie dans quelques instants." }) };
  }
};
