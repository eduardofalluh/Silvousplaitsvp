const { google } = require('googleapis');
const premiumChecker = require('../../utils/premium-checker');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TICKET_INVENTORY_TAB = process.env.TICKET_INVENTORY_TAB || 'ticket_inventory';

function normalize(value) {
  return String(value || '').trim();
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const missing = [];
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
  if (!GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');
  if (missing.length) {
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
  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
  }

  const premiumStatus = await premiumChecker.isPremiumMember(email, false);
  if (!premiumStatus.isPremium) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Premium membership required' }),
    };
  }

  try {
    const sheets = await getSheetsClient();
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${TICKET_INVENTORY_TAB}!A:G`,
    });

    const rows = read.data.values || [];
    if (rows.length < 2) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, events: [], totalAvailable: 0 }),
      };
    }

    const header = rows[0].map((h) => normalize(h).toLowerCase());
    const eventIdx = header.indexOf('event_name');
    const statusIdx = header.indexOf('status');

    if (eventIdx === -1 || statusIdx === -1) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Missing required columns: event_name and status' }),
      };
    }

    const countsByEvent = new Map();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = normalize(row[statusIdx]).toLowerCase();
      if (status !== 'available') continue;
      const eventName = normalize(row[eventIdx]);
      if (!eventName) continue;
      countsByEvent.set(eventName, (countsByEvent.get(eventName) || 0) + 1);
    }

    const events = Array.from(countsByEvent.entries())
      .map(([event_name, available_count]) => ({ event_name, available_count }))
      .sort((a, b) => a.event_name.localeCompare(b.event_name, 'fr-CA', { sensitivity: 'base' }));

    const totalAvailable = events.reduce((sum, eventData) => sum + eventData.available_count, 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        events,
        totalAvailable,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to list available events' }),
    };
  }
};
