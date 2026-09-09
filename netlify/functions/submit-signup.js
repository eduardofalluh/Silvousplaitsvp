/** Newsletter signup through ActiveCampaign's double opt-in form. */
const { submitDoubleOptIn } = require('../../utils/newsletter-opt-in');
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';
// Include the general free list in the existing-subscription guard.
const AC_FALLBACK_LIST_ID = process.env.ACTIVECAMPAIGN_FREE_LIST_ID || '4';
const AC_PREMIUM_LIST_ID = process.env.ACTIVECAMPAIGN_PREMIUM_LIST_ID || '';
const AC_PREMIUM_TAG = process.env.ACTIVECAMPAIGN_PREMIUM_TAG || 'premium_active';
const AC_CITY_LIST = (() => {
  try {
    if (process.env.AC_CITY_LIST_MAP) return JSON.parse(process.env.AC_CITY_LIST_MAP);
  } catch {
    /* ignore */
  }
  return { montreal: '4', quebec: '8', 'trois-rivieres': '9', sherbrooke: '10' };
})();
const AC_SUBSCRIPTION_LIST_IDS = new Set(
  Object.values(AC_CITY_LIST)
    .concat([AC_FALLBACK_LIST_ID, AC_PREMIUM_LIST_ID])
    .filter(Boolean)
    .map((id) => String(id).trim())
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function acApi(path, options = {}) {
  const res = await fetch(`${AC_API_URL}/api/3/${path}`, {
    ...options,
    headers: {
      'Api-Token': AC_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

async function findContactByEmail(email) {
  if (!AC_API_URL || !AC_API_KEY || !email) return null;
  const found = await acApi(`contacts?email=${encodeURIComponent(email)}`);
  if (!found.ok) throw new Error('Contact lookup failed');
  const contacts = (found.data && found.data.contacts) || [];
  const normalized = String(email || '').trim().toLowerCase();
  return contacts.find((c) => String(c.email || '').trim().toLowerCase() === normalized) || null;
}

async function contactActiveSubscriptions(contactId) {
  if (!contactId) return [];
  const lists = await acApi(`contacts/${encodeURIComponent(contactId)}/contactLists`);
  if (!lists.ok) throw new Error('Subscription lookup failed');
  return ((lists.data && lists.data.contactLists) || []).filter((cl) => {
    const listId = String(cl.list || '').trim();
    const status = String(cl.status || '').trim();
    return status === '1' && AC_SUBSCRIPTION_LIST_IDS.has(listId);
  });
}

async function contactHasPremiumTag(contactId) {
  if (!contactId || !AC_PREMIUM_TAG) return false;
  const tagLinks = await acApi(`contacts/${encodeURIComponent(contactId)}/contactTags`);
  if (!tagLinks.ok) throw new Error('Premium lookup failed');
  const tagIds = [...new Set(((tagLinks.data && tagLinks.data.contactTags) || []).map((ct) => ct.tag).filter(Boolean))];
  const expected = String(AC_PREMIUM_TAG || '').trim().toLowerCase();
  for (const tagId of tagIds) {
    const tagRes = await acApi(`tags/${encodeURIComponent(tagId)}`);
    if (!tagRes.ok) throw new Error('Premium tag lookup failed');
    const tagName = tagRes.data && tagRes.data.tag && tagRes.data.tag.tag;
    if (String(tagName || '').trim().toLowerCase() === expected) return true;
  }
  return false;
}

function contactPayloadFromBody(body) {
  const contact = { email: (body.email || '').trim() };
  // Pass through common optional fields if the form ever collects them.
  const first = body.firstName || body.first_name || body['field[1]'];
  const last = body.lastName || body.last_name;
  const phone = body.phone;
  if (first) contact.firstName = String(first).trim();
  if (last) contact.lastName = String(last).trim();
  if (phone) contact.phone = String(phone).trim();
  return contact;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };

  // Honeypot: if "website" is filled, treat as bot – don't forward, return a
  // "success" the bot can't distinguish, but flag it so the pixel does NOT fire.
  const honeypot = String(body.website || '').trim();
  if (honeypot) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: 'success', result_message: 'Thank you', botBlocked: true, subscribed: false }),
    };
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Adresse courriel invalide', subscribed: false }) };
  if (!AC_API_URL || !AC_API_KEY) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Subscription service not configured', subscribed: false }) };
  try {
    const existing = await findContactByEmail(email);
    if (existing && existing.id) {
      const activeLists = await contactActiveSubscriptions(existing.id);
      const premiumTagged = await contactHasPremiumTag(existing.id);
      if (activeLists.length || premiumTagged) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            result: 'success',
            subscribed: false,
            alreadyRegistered: true,
            alreadySubscribed: true,
            alreadyPremium: premiumTagged || activeLists.some((cl) => String(cl.list) === String(AC_PREMIUM_LIST_ID)),
          }),
        };
      }
    }

    const result = await submitDoubleOptIn(acApi, contactPayloadFromBody({ ...body, email }), body.f);
    return { statusCode: 200, headers, body: JSON.stringify({ result: 'success', subscribed: true, ...result }) };
  } catch {
    console.error('Newsletter double opt-in submission failed');
    return { statusCode: 502, headers, body: JSON.stringify({ subscribed: false, error: "L'inscription n'a pas fonctionné. Réessaie dans quelques instants." }) };
  }
};
