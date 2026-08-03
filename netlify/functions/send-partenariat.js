/**
 * Partenariat form -> emails a new partnership request to promotions@silvousplaitsvp.com.
 * Body (JSON): { name, email, organisation, message, website }  (website = honeypot)
 */
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.activehosted.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';
const PARTNER_INBOX = process.env.PARTENARIAT_INBOX || 'promotion@silvousplaitsvp.com';
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';
const AC_PARTNER_LIST_ID = process.env.ACTIVECAMPAIGN_PARTENARIAT_LIST_ID || process.env.PARTENARIAT_LIST_ID || '';
const AC_PARTNER_TAG = process.env.ACTIVECAMPAIGN_PARTENARIAT_TAG || 'partenariat-site';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function esc(s) { return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function norm(s) { return String(s || '').trim().toLowerCase(); }
function arr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (!v) return [];
  return [String(v).trim()].filter(Boolean);
}
function fieldMap() {
  let parsed = {};
  try {
    parsed = JSON.parse(process.env.PARTENARIAT_FIELD_MAP || process.env.AC_PARTNER_FIELD_MAP || '{}');
  } catch {
    parsed = {};
  }
  return {
    organisation: parsed.organisation || process.env.AC_PARTNER_ORGANISATION_FIELD_ID || '',
    role: parsed.role || process.env.AC_PARTNER_ROLE_FIELD_ID || '',
    interests: parsed.interests || process.env.AC_PARTNER_INTERESTS_FIELD_ID || '',
    cities: parsed.cities || process.env.AC_PARTNER_CITIES_FIELD_ID || '',
    dates: parsed.dates || process.env.AC_PARTNER_DATES_FIELD_ID || '',
    offerType: parsed.offerType || process.env.AC_PARTNER_OFFER_TYPE_FIELD_ID || '',
    ticketQuantity: parsed.ticketQuantity || process.env.AC_PARTNER_TICKET_QTY_FIELD_ID || '',
    message: parsed.message || process.env.AC_PARTNER_MESSAGE_FIELD_ID || '',
  };
}

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
  try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

const tagCache = {};
async function resolveTagId(tagName) {
  const key = norm(tagName);
  if (!key) return null;
  if (tagCache[key]) return tagCache[key];
  const found = await acApi(`tags?search=${encodeURIComponent(tagName)}&limit=100`);
  let tag = ((found.data && found.data.tags) || []).find((t) => norm(t.tag) === key);
  if (!tag) {
    const created = await acApi('tags', {
      method: 'POST',
      body: JSON.stringify({ tag: { tag: tagName, tagType: 'contact' } }),
    });
    tag = created.data && created.data.tag;
  }
  if (tag && tag.id) tagCache[key] = tag.id;
  return tag && tag.id ? tag.id : null;
}

async function applyTag(contactId, tagName) {
  const tagId = await resolveTagId(tagName);
  if (!tagId) return false;
  const applied = await acApi('contactTags', {
    method: 'POST',
    body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
  });
  return applied.ok;
}

async function setFieldValue(contactId, fieldId, value) {
  if (!fieldId || value == null || value === '') return false;
  const response = await acApi('fieldValues', {
    method: 'POST',
    body: JSON.stringify({ fieldValue: { contact: contactId, field: fieldId, value: String(value) } }),
  });
  return response.ok;
}

function buildPartnerSummary(data) {
  return [
    'Nouvelle demande de partenariat Silvousplait',
    '',
    `Nom: ${data.name || '(non précisé)'}`,
    `Courriel: ${data.email}`,
    `Organisation: ${data.organisation || '(non précisée)'}`,
    `Rôle: ${data.role || '(non précisé)'}`,
    `Intérêts: ${data.interestLine}`,
    `Villes: ${data.cityLine}`,
    `Dates: ${data.dateLine}`,
    `Offre Premium: ${data.offerLine}`,
    '',
    'Message:',
    data.fullMessage || '(aucun message libre)',
  ].join('\n');
}

async function syncPartnerToContactSystem(data) {
  if (!AC_API_URL || !AC_API_KEY) return { ok: false, reason: 'not-configured' };
  const firstName = String(data.name || '').trim().split(/\s+/)[0] || undefined;
  const sync = await acApi('contact/sync', {
    method: 'POST',
    body: JSON.stringify({ contact: { email: data.email, ...(firstName ? { firstName } : {}) } }),
  });
  const contactId = sync.data && sync.data.contact && sync.data.contact.id;
  if (!contactId) return { ok: false, reason: 'contact-sync-failed' };

  if (AC_PARTNER_LIST_ID) {
    await acApi('contactLists', {
      method: 'POST',
      body: JSON.stringify({ contactList: { list: AC_PARTNER_LIST_ID, contact: contactId, status: 1 } }),
    });
  }

  const tagNames = [AC_PARTNER_TAG];
  if (data.types.includes('edito') || data.interests.includes('Mise en avant éditoriale')) tagNames.push('partenariat-editorial');
  if (data.types.includes('premium') || data.interests.includes('Partenariat Premium')) tagNames.push('partenariat-premium');
  for (const tagName of tagNames) await applyTag(contactId, tagName);

  const fields = fieldMap();
  await Promise.all([
    setFieldValue(contactId, fields.organisation, data.organisation),
    setFieldValue(contactId, fields.role, data.role),
    setFieldValue(contactId, fields.interests, data.interestLine),
    setFieldValue(contactId, fields.cities, data.cityLine),
    setFieldValue(contactId, fields.dates, data.dateLine),
    setFieldValue(contactId, fields.offerType, data.offerType),
    setFieldValue(contactId, fields.ticketQuantity, data.ticketQuantity),
    setFieldValue(contactId, fields.message, data.fullMessage),
  ]);

  const note = await acApi('notes', {
    method: 'POST',
    body: JSON.stringify({ note: { note: buildPartnerSummary(data), relid: contactId, reltype: 'Subscriber' } }),
  });

  return { ok: true, contactId, noted: note.ok };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  // Honeypot -> pretend success.
  if (String(body.website || '').trim()) return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const organisation = String(body.organisation || body.company || '').trim();
  const role = String(body.role || '').trim();
  const message = String(body.message || '').trim();
  const generalMessage = String(body.generalMessage || '').trim();
  const interests = arr(body.interests);
  const types = arr(body.types);
  const cities = arr(body.cities);
  const otherCity = String(body.otherCity || '').trim();
  const dates = arr(body.dates);
  const offerType = String(body.offerType || '').trim();
  const ticketQuantity = String(body.ticketQuantity || '').trim();
  const interestLine = interests.length ? interests.join(', ') : '(non précisé)';
  const cityLine = cities.concat(otherCity ? [otherCity] : []).join(', ') || '(non précisé)';
  const dateLine = dates.join(', ') || '(non précisé)';
  const offerLine = [offerType, ticketQuantity ? `${ticketQuantity} billet(s)` : ''].filter(Boolean).join(' — ') || '(non précisé)';
  const fullMessage = [message, generalMessage].filter(Boolean).join('\n\n');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || (!name && !organisation)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nom ou organisation, et courriel valide requis' }) };
  }
  if (!interests.length && !types.length && !fullMessage && !dates.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ajoutez au moins un détail sur votre demande' }) };
  }

  const payload = {
    name,
    email,
    organisation,
    role,
    interests,
    types,
    cities,
    otherCity,
    dates,
    offerType,
    ticketQuantity,
    interestLine,
    cityLine,
    dateLine,
    offerLine,
    fullMessage,
  };

  let acResult = { ok: false, reason: 'not-attempted' };
  try {
    acResult = await syncPartnerToContactSystem(payload);
  } catch (err) {
    acResult = { ok: false, reason: err.message || 'contact-sync-failed' };
  }

  let emailSent = false;
  let emailError = '';

  if (SMTP_USER && SMTP_PASS && SENDER_EMAIL) {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    try {
      const summary = buildPartnerSummary(payload);
      await transporter.sendMail({
        from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
        to: PARTNER_INBOX,
        replyTo: email,
        subject: `Nouvelle demande de partenariat — ${organisation || name || email}`,
        text: summary,
        html: `<div style="font-family:Arial,sans-serif"><p><strong>Nom&nbsp;:</strong> ${esc(name)}</p><p><strong>Courriel&nbsp;:</strong> ${esc(email)}</p><p><strong>Organisation&nbsp;:</strong> ${esc(organisation)}</p><p><strong>Rôle&nbsp;:</strong> ${esc(role)}</p><p><strong>Intérêt&nbsp;:</strong> ${esc(interestLine)}</p><p><strong>Villes&nbsp;:</strong> ${esc(cityLine)}</p><p><strong>Dates&nbsp;:</strong> ${esc(dateLine)}</p><p><strong>Offre Premium&nbsp;:</strong> ${esc(offerLine)}</p><p><strong>Message&nbsp;:</strong></p><p style="white-space:pre-wrap">${esc(fullMessage || '(aucun message libre)')}</p></div>`,
      });
      emailSent = true;
    } catch (err) {
      emailError = err.message || "L'envoi courriel a échoué.";
    }
  } else {
    emailError = 'Email is not configured on server';
  }

  if (!emailSent && !acResult.ok) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "L'envoi a échoué. Réessaie plus tard.", emailError, sync: acResult }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ sent: true, emailSent, sync: acResult }),
  };
};
