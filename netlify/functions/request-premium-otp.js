const crypto = require('crypto');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const premiumChecker = require('../../utils/premium-checker');
const {
  verifyPremiumAccessToken,
  normalizeEmail,
  hashToken,
  createSignedToken,
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
const PREMIUM_OTP_TTL_MINUTES = Number(process.env.PREMIUM_OTP_TTL_MINUTES || 10);

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!AC_API_URL || !AC_API_KEY || !PREMIUM_ACCESS_SECRET || !SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'OTP flow is not fully configured on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const token = String(body.token || '').trim();
  const eventName = String(body.event_name || body.eventName || '').trim();
  if (!token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token is required' }) };
  }
  if (!eventName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'event_name is required' }) };
  }

  const tokenResult = verifyPremiumAccessToken(token, PREMIUM_ACCESS_SECRET);
  if (!tokenResult.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or expired token', reason: tokenResult.reason }),
    };
  }

  const tokenEmail = normalizeEmail(tokenResult.payload.e);
  const providedEmail = normalizeEmail(body.email);
  if (providedEmail && tokenEmail !== providedEmail) {
    return {
      statusCode: 403,
      headers, body: JSON.stringify({ error: 'This code is bound to a different email address' }),
    };
  }
  const email = tokenEmail;

  const premiumStatus = await premiumChecker.isPremiumMember(email, false);
  if (!premiumStatus.isPremium) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: 'Premium membership required',
        subscriptionStatus: premiumStatus.subscriptionStatus || null,
        details: premiumStatus.details || null,
      }),
    };
  }

  const contactId = premiumStatus.details && premiumStatus.details.contactId;
  if (!contactId) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact not found' }) };
  }

  const redeemedHash = hashToken(token).slice(0, 16);
  const eventHash = eventName ? hashToken(normalizeEventKey(eventName)).slice(0, 10) : 'generic';
  const redeemedTagName = `${PREMIUM_REDEEMED_TAG_PREFIX}_${redeemedHash}_${eventHash}`;

  try {
    const redeemedTagId = await getOrCreateTagIdByName(redeemedTagName);
    const contactTagIds = await getContactTagIds(contactId);
    if (contactTagIds.includes(String(redeemedTagId))) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Code already redeemed', redeemed: true }),
      };
    }

    const otpCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const otpExp = Math.floor(Date.now() / 1000) + PREMIUM_OTP_TTL_MINUTES * 60;
    const otpToken = createSignedToken(
      {
        type: 'premium_otp',
        e: email,
        th: hashToken(token),
        ch: hashToken(otpCode),
        exp: otpExp,
      },
      PREMIUM_ACCESS_SECRET
    );

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: email,
      subject: 'Code de verification - Billet gratuit premium',
      html: `
        <p>Bonjour,</p>
        <p>Voici votre code de verification premium:</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:2px;">${otpCode}</p>
        <p>Ce code expire dans ${PREMIUM_OTP_TTL_MINUTES} minutes.</p>
      `,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'OTP sent',
        otpToken,
        expiresInMinutes: PREMIUM_OTP_TTL_MINUTES,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to send OTP' }),
    };
  }
};
