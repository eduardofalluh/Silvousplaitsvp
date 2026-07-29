/**
 * Contact form -> emails the message to the support inbox.
 * Body (JSON): { name, email, subject, message, website }  (website = honeypot)
 */
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.activehosted.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'spectacles@silvousplaitsvp.com';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};
function esc(s) { return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  if (String(body.website || '').trim()) return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Courriel valide et message requis' }) };
  }

  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  try {
    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: CONTACT_INBOX,
      replyTo: email,
      subject: `Contact site — ${subject || name || email}`,
      text: `Nom: ${name}\nCourriel: ${email}\nSujet: ${subject}\n\n${message}`,
      html: `<div style="font-family:Arial,sans-serif"><p><strong>Nom:</strong> ${esc(name)}</p><p><strong>Courriel:</strong> ${esc(email)}</p><p><strong>Sujet:</strong> ${esc(subject)}</p><p style="white-space:pre-wrap">${esc(message)}</p></div>`,
    });
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "L'envoi a échoué. Réessaie." }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
};
