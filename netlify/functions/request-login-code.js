/**
 * Passwordless login — step 1: email a 6-digit code to a premium member.
 * Stateless & secure: the returned `challenge` is a signed token whose payload
 * holds an HMAC(secret, email|code) of the code — so the code can't be brute
 * forced offline from the token without the server secret.
 *
 * Body (JSON): { email }
 * Returns: { sent: true, challenge } if a code was emailed, else { sent: false, reason }.
 */
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { createSignedToken } = require('../../utils/premium-access-token');
const premiumChecker = require('../../utils/premium-checker');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';
const CODE_TTL_MIN = Number(process.env.LOGIN_CODE_TTL_MINUTES || 10);
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.activehosted.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
function codeHmac(email, code) { return crypto.createHmac('sha256', SECRET).update(email + '|' + code).digest('hex'); }

async function sendCodeEmail(email, code) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: email,
    subject: `Ton code de connexion Silvousplait : ${code}`,
    text: `Voici ton code de connexion : ${code}\n\nIl expire dans ${CODE_TTL_MIN} minutes.\nSi tu n'as pas demandé ce code, ignore ce message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px"><p style="font-size:15px;color:#16182B">Voici ton code de connexion&nbsp;:</p><p style="font-size:34px;font-weight:800;letter-spacing:6px;color:#3347CA;margin:12px 0">${code}</p><p style="font-size:13px;color:#6b6f80">Il expire dans ${CODE_TTL_MIN} minutes. Si tu n'as pas demandé ce code, ignore ce message.</p></div>`,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SECRET || !SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Login is not fully configured on server' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }
  const email = normalizeEmail(body.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Adresse email invalide' }) };
  }

  // Any existing contact (premium OR free subscriber) can log in to see their
  // info. Only send a code if the email already exists in the contact system.
  try {
    const look = await fetch(`${process.env.ACTIVECAMPAIGN_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`, { headers: { 'Api-Token': process.env.ACTIVECAMPAIGN_API_KEY } });
    const data = await look.json();
    if (!((data.contacts || []).length)) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no-account' }) };
    }
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Lookup failed. Réessaie.' }) };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const exp = Math.floor(Date.now() / 1000) + CODE_TTL_MIN * 60;
  const challenge = createSignedToken({ e: email, ch: codeHmac(email, code), exp, kind: 'login-challenge' }, SECRET);

  try {
    await sendCodeEmail(email, code);
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "L'envoi du code a échoué. Réessaie." }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ sent: true, challenge }) };
};
