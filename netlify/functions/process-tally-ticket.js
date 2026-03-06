const fetch = require('node-fetch');
const premiumChecker = require('../../utils/premium-checker');
const {
  verifyPremiumAccessToken,
  normalizeEmail,
  hashToken,
} = require('../../utils/premium-access-token');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Tally-Webhook-Signature',
  'Content-Type': 'application/json',
};

const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
const PREMIUM_ACCESS_SECRET = process.env.PREMIUM_ACCESS_SECRET;
const PREMIUM_REDEEMED_TAG_PREFIX = process.env.PREMIUM_REDEEMED_TAG_PREFIX || 'redeemed';
const TALLY_WEBHOOK_SECRET = process.env.TALLY_WEBHOOK_SECRET || '';
const SITE_URL = (process.env.URL || '').replace(/\/+$/, '');

function normalizeEventKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function getOrCreateTagIdByName(tagName) {
  const searchResponse = await fetch(
    `${AC_API_URL}/api/3/tags?search=${encodeURIComponent(tagName)}`,
    { headers: { 'Api-Token': AC_API_KEY } }
  );
  if (!searchResponse.ok) throw new Error(`Tag search failed (${searchResponse.status})`);
  const searchData = await searchResponse.json();
  const existing = (searchData.tags || []).find(
    (tag) => String(tag.tag || '').toLowerCase() === tagName.toLowerCase()
  );
  if (existing && existing.id) return String(existing.id);

  const createResponse = await fetch(`${AC_API_URL}/api/3/tags`, {
    method: 'POST',
    headers: {
      'Api-Token': AC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tag: { tag: tagName, tagType: 'contact' },
    }),
  });
  if (!createResponse.ok) throw new Error(`Tag creation failed (${createResponse.status})`);
  const createData = await createResponse.json();
  return String(createData.tag.id);
}

async function getContactTagIds(contactId) {
  const response = await fetch(`${AC_API_URL}/api/3/contacts/${contactId}/contactTags`, {
    headers: { 'Api-Token': AC_API_KEY },
  });
  if (!response.ok) throw new Error(`Contact tags fetch failed (${response.status})`);
  const data = await response.json();
  return (data.contactTags || []).map((ct) => String(ct.tag));
}

function collectValueCandidates(body) {
  const root = body || {};
  const rootData = root.data || {};
  const fields = Array.isArray(rootData.fields) ? rootData.fields : [];

  const output = {
    email: root.email || root.event_email || rootData.email || '',
    eventName: root.event_name || root.eventName || rootData.event_name || rootData.eventName || '',
    token: root.token || root.access_token || rootData.token || '',
  };

  for (const field of fields) {
    const key = String(field.key || field.label || field.name || field.title || '').trim().toLowerCase();
    const value =
      field.value !== undefined
        ? field.value
        : field.answer !== undefined
          ? field.answer
          : field.text !== undefined
            ? field.text
            : '';
    const textValue = Array.isArray(value) ? value.join(', ') : String(value || '').trim();
    if (!output.email && key.includes('email')) output.email = textValue;
    if (!output.eventName && (key.includes('event') || key.includes('evenement'))) output.eventName = textValue;
    if (!output.token && (key.includes('token') || key.includes('code'))) output.token = textValue;
  }

  return output;
}

function requireConfig() {
  const missing = [];
  if (!AC_API_URL) missing.push('ACTIVECAMPAIGN_API_URL');
  if (!AC_API_KEY) missing.push('ACTIVECAMPAIGN_API_KEY');
  if (!PREMIUM_ACCESS_SECRET) missing.push('PREMIUM_ACCESS_SECRET');
  if (!SITE_URL) missing.push('URL');
  return missing;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const missing = requireConfig();
  if (missing.length > 0) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Missing config: ${missing.join(', ')}` }) };
  }

  if (TALLY_WEBHOOK_SECRET) {
    const signature = event.headers['x-tally-webhook-signature'] || event.headers['X-Tally-Webhook-Signature'] || '';
    if (!signature || signature !== TALLY_WEBHOOK_SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid webhook signature' }) };
    }
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const extracted = collectValueCandidates(body);
  const email = normalizeEmail(extracted.email);
  const eventName = String(extracted.eventName || '').trim();
  const token = String(extracted.token || '').trim();

  if (!email || !eventName || !token) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'email, event_name and token are required in tally submission' }),
    };
  }

  const tokenResult = verifyPremiumAccessToken(token, PREMIUM_ACCESS_SECRET);
  if (!tokenResult.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or expired token', reason: tokenResult.reason }),
    };
  }
  if (normalizeEmail(tokenResult.payload.e) !== email) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Token is bound to a different email' }),
    };
  }

  const premiumStatus = await premiumChecker.isPremiumMember(email, false);
  if (!premiumStatus.isPremium) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Premium membership required' }) };
  }
  const contactId = premiumStatus.details && premiumStatus.details.contactId;
  if (!contactId) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact not found' }) };
  }

  const redeemedHash = hashToken(token).slice(0, 16);
  const eventHash = hashToken(normalizeEventKey(eventName)).slice(0, 10);
  const redeemedTagName = `${PREMIUM_REDEEMED_TAG_PREFIX}_${redeemedHash}_${eventHash}`;

  try {
    const redeemedTagId = await getOrCreateTagIdByName(redeemedTagName);
    const contactTagIds = await getContactTagIds(contactId);
    if (!contactTagIds.includes(String(redeemedTagId))) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'OTP verification for this event is required before tally submit' }),
      };
    }

    const claimResponse = await fetch(`${SITE_URL}/.netlify/functions/claim-and-send-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        event_name: eventName,
      }),
    });
    const claimData = await claimResponse.json().catch(() => ({}));
    if (!claimResponse.ok) {
      return {
        statusCode: claimResponse.status,
        headers,
        body: JSON.stringify({
          error: claimData.error || 'Ticket claim failed',
          details: claimData,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email,
        event_name: eventName,
        ticket_number: claimData.ticket_number || null,
        messageId: claimData.messageId || null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to process tally submission' }),
    };
  }
};
