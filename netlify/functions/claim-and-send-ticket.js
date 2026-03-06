const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
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

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';
const MAX_FREE_TICKETS_PER_EMAIL = Number(process.env.MAX_FREE_TICKETS_PER_EMAIL || 1);

function colToLetter(col) {
  let n = col;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
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

function normalize(str) {
  return String(str || '').trim();
}

function normalizeEventKey(str) {
  return normalize(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasEmailAlreadyClaimed(rows, idx, email, maxTickets) {
  const normalizedEmail = normalize(email).toLowerCase();
  if (!normalizedEmail) return false;

  let sentCount = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const rowEmail = normalize(row[idx.reserved_for_email]).toLowerCase();
    const rowStatus = normalize(row[idx.status]).toLowerCase();
    if (rowEmail !== normalizedEmail) continue;
    if (rowStatus === 'sent') {
      sentCount += 1;
      if (sentCount >= maxTickets) {
        return true;
      }
    }
  }
  return false;
}

async function updateSheetRow(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function getSheetRow(sheets, range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
  });
  return (response.data.values || [])[0] || [];
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
      body: JSON.stringify({ error: 'event_name is required to claim a specific ticket' }),
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

  let sheets = null;
  let reservationContext = null;
  try {
    sheets = await getSheetsClient();
    const range = `${TICKET_INVENTORY_TAB}!A:G`;
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range,
    });

    const rows = read.data.values || [];
    if (rows.length < 2) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'No ticket inventory found' }) };
    }

    const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
    const idx = {
      event_name: header.indexOf('event_name'),
      ticket_number: header.indexOf('ticket_number'),
      pdf_url: header.indexOf('pdf_url'),
      status: header.indexOf('status'),
      reserved_for_email: header.indexOf('reserved_for_email'),
      reserved_at: header.indexOf('reserved_at'),
      sent_at: header.indexOf('sent_at'),
    };

    const required = ['event_name', 'ticket_number', 'pdf_url', 'status', 'reserved_for_email', 'reserved_at', 'sent_at'];
    for (const key of required) {
      if (idx[key] === -1) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: `Missing column in sheet header: ${key}` }),
        };
      }
    }

    if (MAX_FREE_TICKETS_PER_EMAIL > 0 && hasEmailAlreadyClaimed(rows, idx, email, MAX_FREE_TICKETS_PER_EMAIL)) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: `Free ticket limit reached for this email (${MAX_FREE_TICKETS_PER_EMAIL})`,
          code: 'limit_reached',
        }),
      };
    }

    const requestedEventKey = normalizeEventKey(eventName);
    let selectedRowIndex = -1;
    let selected = null;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowEvent = normalize(row[idx.event_name]);
      const rowStatus = normalize(row[idx.status]).toLowerCase();
      if (rowStatus !== 'available') continue;
      if (normalizeEventKey(rowEvent) !== requestedEventKey) continue;
      selectedRowIndex = i + 1; // sheet row number (1-based)
      selected = {
        event_name: rowEvent,
        ticket_number: normalize(row[idx.ticket_number]),
        pdf_url: normalize(row[idx.pdf_url]),
      };
      break;
    }

    if (!selected) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: `No available ticket for event: ${eventName}`,
          code: 'sold_out',
          event_name: eventName,
        }),
      };
    }

    const nowIso = new Date().toISOString();
    const minCol = Math.min(idx.status, idx.reserved_for_email, idx.reserved_at) + 1;
    const maxCol = Math.max(idx.status, idx.reserved_for_email, idx.reserved_at) + 1;
    const reserveRange = `${TICKET_INVENTORY_TAB}!${colToLetter(minCol)}${selectedRowIndex}:${colToLetter(maxCol)}${selectedRowIndex}`;
    const reserveValues = Array(maxCol - minCol + 1).fill('');
    reserveValues[idx.status + 1 - minCol] = 'reserved';
    reserveValues[idx.reserved_for_email + 1 - minCol] = email;
    reserveValues[idx.reserved_at + 1 - minCol] = nowIso;

    await updateSheetRow(sheets, reserveRange, reserveValues);

    // Verify reservation still belongs to the same email to reduce race-condition risk.
    const reservedRow = await getSheetRow(sheets, reserveRange);
    const statusCheck = normalize(reservedRow[idx.status + 1 - minCol]).toLowerCase();
    const emailCheck = normalize(reservedRow[idx.reserved_for_email + 1 - minCol]).toLowerCase();
    if (statusCheck !== 'reserved' || emailCheck !== email) {
      throw new Error('Ticket reservation conflict. Please retry.');
    }

    reservationContext = {
      selectedRowIndex,
      idx,
      email,
      reservedRange: reserveRange,
      reservedMinCol: minCol,
      reservedMaxCol: maxCol,
    };

    const pdfResponse = await fetch(selected.pdf_url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF (${pdfResponse.status})`);
    }
    const pdfBuffer = await pdfResponse.buffer();

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const message = await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: email,
      subject: `Votre billet gratuit pour ${selected.event_name}`,
      html: `
        <p>Bonjour ${fullName},</p>
        <p>Votre billet gratuit est confirme pour <strong>${selected.event_name}</strong>.</p>
        <p>Le billet est en piece jointe.</p>
        <p>Cordialement,<br/>${SENDER_NAME}</p>
      `,
      attachments: [
        {
          filename: `Billet-${selected.ticket_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    const minColSent = Math.min(idx.status, idx.sent_at) + 1;
    const maxColSent = Math.max(idx.status, idx.sent_at) + 1;
    const sentRange = `${TICKET_INVENTORY_TAB}!${colToLetter(minColSent)}${selectedRowIndex}:${colToLetter(maxColSent)}${selectedRowIndex}`;
    const sentValues = Array(maxColSent - minColSent + 1).fill('');
    sentValues[idx.status + 1 - minColSent] = 'sent';
    sentValues[idx.sent_at + 1 - minColSent] = new Date().toISOString();

    await updateSheetRow(sheets, sentRange, sentValues);

    reservationContext = null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email,
        event_name: selected.event_name,
        ticket_number: selected.ticket_number,
        messageId: message.messageId,
      }),
    };
  } catch (error) {
    // Best-effort rollback only if the row is still reserved by the same email.
    if (sheets && reservationContext) {
      try {
        const {
          selectedRowIndex: rowNum,
          idx,
          email: reservedEmail,
          reservedRange,
          reservedMinCol,
          reservedMaxCol,
        } = reservationContext;
        const reservedRow = await getSheetRow(sheets, reservedRange);
        const statusCheck = normalize(reservedRow[idx.status + 1 - reservedMinCol]).toLowerCase();
        const emailCheck = normalize(reservedRow[idx.reserved_for_email + 1 - reservedMinCol]).toLowerCase();

        if (statusCheck === 'reserved' && emailCheck === reservedEmail) {
          const rollbackValues = Array(reservedMaxCol - reservedMinCol + 1).fill('');
          rollbackValues[idx.status + 1 - reservedMinCol] = 'available';
          rollbackValues[idx.reserved_for_email + 1 - reservedMinCol] = '';
          rollbackValues[idx.reserved_at + 1 - reservedMinCol] = '';
          await updateSheetRow(
            sheets,
            `${TICKET_INVENTORY_TAB}!${colToLetter(reservedMinCol)}${rowNum}:${colToLetter(reservedMaxCol)}${rowNum}`,
            rollbackValues
          );
        }
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError.message || rollbackError);
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to claim/send ticket' }),
    };
  }
};
