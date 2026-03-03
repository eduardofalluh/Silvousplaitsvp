const fetch = require('node-fetch');
const {
  createPremiumAccessToken,
  normalizeEmail,
} = require('../../utils/premium-access-token');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  'Content-Type': 'application/json',
};

const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
const PREMIUM_ACCESS_SECRET = process.env.PREMIUM_ACCESS_SECRET;
const PREMIUM_ACCESS_BASE_URL = process.env.PREMIUM_ACCESS_BASE_URL || process.env.URL || '';
const PREMIUM_ACCESS_TTL_DAYS = Number(process.env.PREMIUM_ACCESS_TTL_DAYS || 30);
const PREMIUM_ACCESS_URL_FIELD_ID = process.env.PREMIUM_ACCESS_URL_FIELD_ID;
const PREMIUM_TOKEN_ADMIN_KEY = process.env.PREMIUM_TOKEN_ADMIN_KEY || '';

function requireConfig() {
  const missing = [];
  if (!AC_API_URL) missing.push('ACTIVECAMPAIGN_API_URL');
  if (!AC_API_KEY) missing.push('ACTIVECAMPAIGN_API_KEY');
  if (!PREMIUM_ACCESS_SECRET) missing.push('PREMIUM_ACCESS_SECRET');
  if (!PREMIUM_ACCESS_BASE_URL) missing.push('PREMIUM_ACCESS_BASE_URL');
  if (!PREMIUM_ACCESS_URL_FIELD_ID) missing.push('PREMIUM_ACCESS_URL_FIELD_ID');
  return missing;
}

async function acFetch(path, options = {}) {
  const response = await fetch(`${AC_API_URL}${path}`, {
    ...options,
    headers: {
      'Api-Token': AC_API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return response;
}

async function getContactByEmail(email) {
  const response = await acFetch(`/api/3/contacts?email=${encodeURIComponent(email)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Contact lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return (data.contacts || [])[0] || null;
}

async function getExistingFieldValue(contactId, fieldId) {
  const response = await acFetch(`/api/3/contacts/${contactId}/fieldValues`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Field values lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return (data.fieldValues || []).find((fv) => String(fv.field) === String(fieldId)) || null;
}

async function createFieldValue(contactId, fieldId, value) {
  const response = await acFetch('/api/3/fieldValues', {
    method: 'POST',
    body: JSON.stringify({
      fieldValue: {
        contact: String(contactId),
        field: String(fieldId),
        value,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Field value create failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function updateFieldValue(fieldValueId, contactId, fieldId, value) {
  const response = await acFetch(`/api/3/fieldValues/${fieldValueId}`, {
    method: 'PUT',
    body: JSON.stringify({
      fieldValue: {
        contact: String(contactId),
        field: String(fieldId),
        value,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Field value update failed (${response.status}): ${text}`);
  }
  return response.json();
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Missing server config: ${missing.join(', ')}` }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (PREMIUM_TOKEN_ADMIN_KEY) {
    const providedKey = (event.headers['x-admin-key'] || event.headers['X-Admin-Key'] || body.adminKey || '').trim();
    if (providedKey !== PREMIUM_TOKEN_ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const email = normalizeEmail(body.email);
  const eventName = String(body.eventName || body.event_name || '').trim();
  const ticketNumber = String(body.ticketNumber || body.ticket_number || '').trim();
  const ttlDays = Number(body.ttlDays || PREMIUM_ACCESS_TTL_DAYS);

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
  }
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ttlDays must be a positive number' }) };
  }

  try {
    const contact = await getContactByEmail(email);
    if (!contact) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact not found' }) };
    }

    const exp = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
    const token = createPremiumAccessToken(
      {
        email,
        ticketNumber,
        eventName,
        exp,
      },
      PREMIUM_ACCESS_SECRET
    );

    const baseUrl = PREMIUM_ACCESS_BASE_URL.replace(/\/+$/, '');
    const premiumAccessUrl = `${baseUrl}/premium-access.html?token=${encodeURIComponent(token)}`;

    const existing = await getExistingFieldValue(contact.id, PREMIUM_ACCESS_URL_FIELD_ID);
    if (existing) {
      await updateFieldValue(existing.id, contact.id, PREMIUM_ACCESS_URL_FIELD_ID, premiumAccessUrl);
    } else {
      await createFieldValue(contact.id, PREMIUM_ACCESS_URL_FIELD_ID, premiumAccessUrl);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email,
        contactId: String(contact.id),
        premiumAccessUrl,
        expiresAt: new Date(exp * 1000).toISOString(),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to upsert premium URL' }),
    };
  }
};
