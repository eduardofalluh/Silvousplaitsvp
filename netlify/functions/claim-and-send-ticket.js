const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const premiumChecker = require('../../utils/premium-checker');
const { hashToken } = require('../../utils/premium-access-token');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TICKET_INVENTORY_TAB = process.env.TICKET_INVENTORY_TAB || 'ticket_inventory';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
const PREMIUM_EVENT_CLAIM_TAG_PREFIX = process.env.PREMIUM_EVENT_CLAIM_TAG_PREFIX || 'claimed_event';

function normalize(value) {
  return String(value || '').trim();
}

function normalizeEventKey(value) {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function getSheetsClient() {
  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
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

function extractDiscountCodeRow(rows) {
  if (!rows.length) return null;
  const header = rows[0].map((h) => normalize(h).toLowerCase());

  const idx = {
    event_name: header.indexOf('event_name'),
    discount_code: header.indexOf('discount_code'),
  };

  // Backward-compatible aliases
  if (idx.discount_code === -1) idx.discount_code = header.indexOf('code');
  if (idx.discount_code === -1) idx.discount_code = header.indexOf('promo_code');
  if (idx.discount_code === -1) idx.discount_code = header.indexOf('coupon_code');

  if (idx.event_name === -1 || idx.discount_code === -1) {
    return { error: 'Missing required columns: event_name and discount_code' };
  }

  return { idx };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const missing = [];
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
  if (!GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');
  if (!SMTP_HOST) missing.push('SMTP_HOST');
  if (!SMTP_USER) missing.push('SMTP_USER');
  if (!SMTP_PASS) missing.push('SMTP_PASS');
  if (!SENDER_EMAIL) missing.push('SENDER_EMAIL');

  if (missing.length > 0) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const email = normalize(body.email).toLowerCase();
  const firstName = normalize(body.first_name || body.firstName || '');
  const lastName = normalize(body.last_name || body.lastName || '');
  const fullName = normalize([firstName, lastName].filter(Boolean).join(' ')) || normalize(body.name || 'Client');
  const eventName = normalize(body.event_name || body.eventName || '');

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
  }
  if (!eventName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'event_name is required to claim a specific offer' }),
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
  if (!AC_API_URL || !AC_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'ActiveCampaign config missing for per-event claim lock' }),
    };
  }

  try {
    const sheets = await getSheetsClient();
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${TICKET_INVENTORY_TAB}!A:Z`,
    });

    const rows = read.data.values || [];
    if (rows.length < 2) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'No discount-code data found' }) };
    }

    const extracted = extractDiscountCodeRow(rows);
    if (extracted.error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: extracted.error }) };
    }

    const requestedEventKey = normalizeEventKey(eventName);
    let selected = null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowEvent = normalize(row[extracted.idx.event_name]);
      const rowCode = normalize(row[extracted.idx.discount_code]);
      if (!rowEvent || !rowCode) continue;
      if (normalizeEventKey(rowEvent) !== requestedEventKey) continue;

      selected = {
        event_name: rowEvent,
        discount_code: rowCode,
      };
      break;
    }

    if (!selected) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: `No discount code found for event: ${eventName}`,
          code: 'event_not_found',
          event_name: eventName,
        }),
      };
    }

    // One-time claim per user + event
    const eventHash = hashToken(normalizeEventKey(selected.event_name)).slice(0, 12);
    const claimTagName = `${PREMIUM_EVENT_CLAIM_TAG_PREFIX}_${eventHash}`;
    const claimTagId = await getOrCreateTagIdByName(claimTagName);
    const contactTagIds = await getContactTagIds(contactId);
    if (contactTagIds.includes(String(claimTagId))) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: `Discount code already claimed for event: ${selected.event_name}`,
          code: 'already_claimed_for_event',
          event_name: selected.event_name,
        }),
      };
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const message = await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: email,
      subject: `Votre code promo 100% pour ${selected.event_name}`,
      html: `
        <p>Bonjour ${fullName},</p>
        <p>Voici votre code promo pour <strong>${selected.event_name}</strong>:</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:1px;">${selected.discount_code}</p>
        <p>Utilisez ce code au moment du paiement pour obtenir 100% de rabais.</p>
        <p>Cordialement,<br/>${SENDER_NAME}</p>
      `,
    });

    // Mark as claimed only after successful email delivery.
    await addTagToContact(contactId, claimTagId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email,
        event_name: selected.event_name,
        discount_code: selected.discount_code,
        messageId: message.messageId,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to send discount code' }),
    };
  }
};
