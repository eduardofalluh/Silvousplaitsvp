/**
 * Netlify Function: block bots via honeypot, then forward signup to the contact system.
 *
 * Primary path: the classic hosted form endpoint (proc.php).
 * Safety net: if proc.php does not clearly confirm the subscription, add the
 * contact to the form's list directly through the contact API (status
 * active). This guarantees genuine signups reach the list even if proc.php ever
 * fails or returns an ambiguous response.
 *
 * The response always includes an authoritative `subscribed` boolean so the
 * front end only fires the Meta "Lead" pixel when a contact actually entered
 * the list (never for bots, duplicates, or failures).
 */

const AC_URL =
  process.env.ACTIVECAMPAIGN_FORM_URL ||
  'https://silvousplait.activehosted.com/proc.php';

const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';
// List used when the form id cannot be resolved to a list (general free list).
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

// Fields that belong to the proc.php form protocol, not the contact record.
const AC_PROTOCOL_FIELDS = new Set(['u', 'f', 's', 'c', 'm', 'act', 'v', 'or', 'website']);

function stripForAC(body) {
  const { website, ...rest } = body;
  return rest;
}

function isProcSuccess(data) {
  if (!data || typeof data !== 'object') return false;
  const resultCode =
    data.result_code !== undefined
      ? Number(data.result_code)
      : data.result === 'success' || data.result === 1
      ? 1
      : 0;
  if (resultCode === 1) return true;
  if (data.success === 1 || data.success === true) return true;
  if (typeof data.js === 'string' && data.js.indexOf('_show_thank_you') !== -1) return true;
  return false;
}

async function forwardToSignupProvider(formData) {
  const params = new URLSearchParams(stripForAC(formData));
  const res = await fetch(AC_URL + '?jsonp=true', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    const jsonpMatch = text.match(/^\s*[^(]*\((\{[\s\S]*\})\)\s*;?\s*$/);
    if (jsonpMatch) data = JSON.parse(jsonpMatch[1]);
  }
  const resultMsg = (
    data.result_message ||
    data.message ||
    data.result_message_message ||
    data.msg ||
    ''
  ).toLowerCase();
  const resultCode =
    data.result_code !== undefined
      ? data.result_code
      : data.result === 'success' || data.result === 1
      ? 1
      : 0;
  const alreadyKeywords = ['already', 'déjà', 'exist', 'duplicate', 'subscribed', 'inscrit', 'inscrite', 'liste', 'list'];
  const alreadyRegistered =
    alreadyKeywords.some((k) => resultMsg.includes(k)) && (resultCode === 0 || !res.ok);
  return { ok: res.ok, data: { ...data, alreadyRegistered }, success: isProcSuccess(data) };
}

// --- Contact API safety net ------------------------------------------------

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
  const contacts = (found.data && found.data.contacts) || [];
  const normalized = String(email || '').trim().toLowerCase();
  return contacts.find((c) => String(c.email || '').trim().toLowerCase() === normalized) || contacts[0] || null;
}

async function contactActiveSubscriptions(contactId) {
  if (!contactId) return [];
  const lists = await acApi(`contacts/${encodeURIComponent(contactId)}/contactLists`);
  return ((lists.data && lists.data.contactLists) || []).filter((cl) => {
    const listId = String(cl.list || '').trim();
    const status = String(cl.status || '').trim();
    return status === '1' && AC_SUBSCRIPTION_LIST_IDS.has(listId);
  });
}

async function contactHasPremiumTag(contactId) {
  if (!contactId || !AC_PREMIUM_TAG) return false;
  const tagLinks = await acApi(`contacts/${encodeURIComponent(contactId)}/contactTags`);
  const tagIds = [...new Set(((tagLinks.data && tagLinks.data.contactTags) || []).map((ct) => ct.tag).filter(Boolean))];
  const expected = String(AC_PREMIUM_TAG || '').trim().toLowerCase();
  for (const tagId of tagIds) {
    const tagRes = await acApi(`tags/${encodeURIComponent(tagId)}`);
    const tagName = tagRes.data && tagRes.data.tag && tagRes.data.tag.tag;
    if (String(tagName || '').trim().toLowerCase() === expected) return true;
  }
  return false;
}

// Resolve the list id(s) a form subscribes to, from the form's configured actions.
async function resolveListIdsForForm(formId) {
  if (!formId) return [AC_FALLBACK_LIST_ID];
  try {
    const { ok, data } = await acApi(`forms/${encodeURIComponent(formId)}`);
    const actions = (ok && data.form && data.form.actions && data.form.actions.actions) || [];
    const ids = actions
      .filter((a) => a && a.type === 'subscribe-to-list' && a.list)
      .map((a) => String(a.list));
    if (ids.length) return Array.from(new Set(ids));
  } catch {
    /* fall through to default list */
  }
  return [AC_FALLBACK_LIST_ID];
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

/**
 * Force the contact onto the form's list with an active status via the API.
 * Returns true if the contact is confirmed on at least one list.
 */
async function subscribeViaApi(body) {
  if (!AC_API_URL || !AC_API_KEY) return false;
  const email = (body.email || '').trim();
  if (!email) return false;

  const sync = await acApi('contact/sync', {
    method: 'POST',
    body: JSON.stringify({ contact: contactPayloadFromBody(body) }),
  });
  const contactId = sync.data && sync.data.contact && sync.data.contact.id;
  if (!contactId) return false;

  const listIds = await resolveListIdsForForm(body.f);
  let added = false;
  for (const listId of listIds) {
    const membership = await acApi('contactLists', {
      method: 'POST',
      body: JSON.stringify({ contactList: { list: listId, contact: contactId, status: 1 } }),
    });
    if (membership.ok) added = true;
  }
  return added;
}

// --------------------------------------------------------------------------

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

  // Honeypot: if "website" is filled, treat as bot – don't forward, return a
  // "success" the bot can't distinguish, but flag it so the pixel does NOT fire.
  const honeypot = (body.website || '').trim();
  if (honeypot) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: 'success', result_message: 'Thank you', botBlocked: true, subscribed: false }),
    };
  }

  const email = (body.email || '').trim().toLowerCase();
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

  const { ok, data, success } = await forwardToSignupProvider(body);

  if (data.alreadyRegistered) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...data, subscribed: false }) };
  }

  // proc.php confirmed the subscription – done.
  if (ok && success) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...data, subscribed: true }) };
  }

  // proc.php failed or was ambiguous – use the API safety net so the contact
  // still lands on the list.
  const subscribed = await subscribeViaApi(body);
  return {
    statusCode: subscribed ? 200 : ok ? 200 : 400,
    headers,
    body: JSON.stringify({ ...data, subscribed, viaApiFallback: subscribed }),
  };
};
