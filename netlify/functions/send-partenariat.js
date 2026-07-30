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

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function esc(s) { return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email is not configured on server' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  // Honeypot -> pretend success.
  if (String(body.website || '').trim()) return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const organisation = String(body.organisation || body.company || '').trim();
  const message = String(body.message || '').trim();
  const interests = Array.isArray(body.interests) ? body.interests.map((x) => String(x).trim()).filter(Boolean) : [];
  const interestLine = interests.length ? interests.join(', ') : '(non précisé)';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nom, courriel valide et message requis' }) };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: PARTNER_INBOX,
      replyTo: email,
      subject: `Nouvelle demande de partenariat — ${organisation || name || email}`,
      text: `Nom: ${name}\nCourriel: ${email}\nOrganisation: ${organisation}\nIntérêt: ${interestLine}\n\nMessage:\n${message}`,
      html: `<div style="font-family:Arial,sans-serif"><p><strong>Nom&nbsp;:</strong> ${esc(name)}</p><p><strong>Courriel&nbsp;:</strong> ${esc(email)}</p><p><strong>Organisation&nbsp;:</strong> ${esc(organisation)}</p><p><strong>Intérêt&nbsp;:</strong> ${esc(interestLine)}</p><p><strong>Message&nbsp;:</strong></p><p style="white-space:pre-wrap">${esc(message)}</p></div>`,
    });
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "L'envoi a échoué. Réessaie plus tard." }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
};
