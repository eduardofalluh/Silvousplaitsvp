const crypto = require('crypto');
const nodemailer = require('nodemailer');
const premiumChecker = require('../../utils/premium-checker');
const {
  getOffersSecret,
  PREMIUM_OFFERS_OTP_TTL_MINUTES,
  createPremiumOffersOtpToken,
} = require('../../utils/premium-offers-auth');
const { checkRateLimit } = require('../../utils/rate-limit');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { noStore: true });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (!isAllowedOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!getOffersSecret() || !SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Premium offers login is not fully configured on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const email = normalize(body.email);
  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
  }

  const rateLimit = checkRateLimit(`premium-offers-login:${email}`, {
    windowMs: 10 * 60 * 1000,
    max: 5,
  });
  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Trop de tentatives. Réessaie dans quelques minutes.' }),
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

  const otpCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const otpToken = createPremiumOffersOtpToken(email, otpCode);

  try {
    await createTransporter().sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: email,
      subject: 'Code de verification - Offres premium Silvousplait',
      html: `
        <p>Bonjour,</p>
        <p>Voici ton code de verification pour acceder aux offres premium Silvousplait:</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:2px;">${otpCode}</p>
        <p>Ce code expire dans ${PREMIUM_OFFERS_OTP_TTL_MINUTES} minutes.</p>
        <p>Si tu n'as pas demande ce code, tu peux ignorer ce courriel.</p>
      `,
    });
  } catch (error) {
    console.error('Premium offers OTP email error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Impossible d’envoyer le code de verification pour le moment.' }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'OTP sent',
      otpToken,
      expiresInMinutes: PREMIUM_OFFERS_OTP_TTL_MINUTES,
      email,
    }),
  };
};
