/**
 * Netlify Function: block bots via honeypot, then forward signup to ActiveCampaign.
 *
 * Primary path: the classic hosted form endpoint (proc.php).
 * Safety net: if proc.php does not clearly confirm the subscription, add the
 * contact to the form's list directly through the ActiveCampaign API v3 (status
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

async function forwardToActiveCampaign(formData) {
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

// --- ActiveCampaign API v3 safety net -------------------------------------

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

  const { ok, data, success } = await forwardToActiveCampaign(body);

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
