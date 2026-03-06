const fetch = require('node-fetch');
const premiumChecker = require('../../utils/premium-checker');
const {
  verifyPremiumAccessToken,
  verifySignedToken,
  normalizeEmail,
  hashToken,
} = require('../../utils/premium-access-token');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
const PREMIUM_ACCESS_SECRET = process.env.PREMIUM_ACCESS_SECRET;
const PREMIUM_REDEEMED_TAG_PREFIX = process.env.PREMIUM_REDEEMED_TAG_PREFIX || 'redeemed';
const PREMIUM_TALLY_FORM_URL = process.env.PREMIUM_TALLY_FORM_URL || 'https://tally.so/r/682j2B';

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
  if (!searchResponse.ok) {
    throw new Error(`Tag search failed (${searchResponse.status})`);
  }
  const searchData = await searchResponse.json();
  const existing = (searchData.tags || []).find(
    (tag) => String(tag.tag || '').toLowerCase() === tagName.toLowerCase()
  );
  if (existing && existing.id) {
    return String(existing.id);
  }

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
  if (!createResponse.ok) {
    throw new Error(`Tag creation failed (${createResponse.status})`);
  }
  const createData = await createResponse.json();
  return String(createData.tag.id);
}

async function getContactTagIds(contactId) {
  const response = await fetch(`${AC_API_URL}/api/3/contacts/${contactId}/contactTags`, {
    headers: { 'Api-Token': AC_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`Contact tags fetch failed (${response.status})`);
  }
  const data = await response.json();
  return (data.contactTags || []).map((ct) => String(ct.tag));
}

async function addTagToContact(contactId, tagId) {
  const response = await fetch(`${AC_API_URL}/api/3/contactTags`, {
    method: 'POST',
    headers: {
      'Api-Token': AC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contactTag: {
        contact: String(contactId),
        tag: String(tagId),
      },
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Add tag failed (${response.status}): ${err}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!AC_API_URL || !AC_API_KEY || !PREMIUM_ACCESS_SECRET) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'OTP verification is not configured on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const token = String(body.token || '').trim();
  const otpCode = String(body.otpCode || '').trim();
  const otpToken = String(body.otpToken || '').trim();
  const eventName = String(body.event_name || body.eventName || '').trim();

  if (!token || !otpCode || !otpToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'token, otpCode and otpToken are required' }),
    };
  }
  if (!/^\d{6}$/.test(otpCode)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'otpCode must be a 6-digit code' }),
    };
  }

  const accessTokenResult = verifyPremiumAccessToken(token, PREMIUM_ACCESS_SECRET);
  if (!accessTokenResult.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or expired access token', reason: accessTokenResult.reason }),
    };
  }
  const email = normalizeEmail(accessTokenResult.payload.e);
  const providedEmail = normalizeEmail(body.email);
  if (providedEmail && providedEmail !== email) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'This access token is bound to a different email address' }),
    };
  }

  const otpResult = verifySignedToken(otpToken, PREMIUM_ACCESS_SECRET);
  if (!otpResult.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or expired OTP token', reason: otpResult.reason }),
    };
  }
  const otpPayload = otpResult.payload || {};
  if (
    otpPayload.type !== 'premium_otp' ||
    normalizeEmail(otpPayload.e) !== email ||
    String(otpPayload.th) !== hashToken(token) ||
    String(otpPayload.ch) !== hashToken(otpCode)
  ) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Invalid OTP code' }),
    };
  }

  const premiumStatus = await premiumChecker.isPremiumMember(email, false);
  if (!premiumStatus.isPremium) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Premium membership required' }),
    };
  }
  const contactId = premiumStatus.details && premiumStatus.details.contactId;
  if (!contactId) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact not found' }) };
  }

  try {
    const redeemedHash = hashToken(token).slice(0, 16);
    const eventHash = eventName ? hashToken(normalizeEventKey(eventName)).slice(0, 10) : 'generic';
    const redeemedTagName = `${PREMIUM_REDEEMED_TAG_PREFIX}_${redeemedHash}_${eventHash}`;
    const redeemedTagId = await getOrCreateTagIdByName(redeemedTagName);
    const contactTagIds = await getContactTagIds(contactId);
    if (contactTagIds.includes(String(redeemedTagId))) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Code already redeemed', redeemed: true }),
      };
    }

    await addTagToContact(contactId, redeemedTagId);
    const nextUrl = `${PREMIUM_TALLY_FORM_URL}${PREMIUM_TALLY_FORM_URL.includes('?') ? '&' : '?'}email=${encodeURIComponent(email)}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Premium access granted',
        nextUrl,
        redeemed: true,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'OTP verification failed' }),
    };
  }
};
