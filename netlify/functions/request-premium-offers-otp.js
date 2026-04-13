const crypto = require('crypto');
const nodemailer = require('nodemailer');
const premiumChecker = require('../../utils/premium-checker');
const {
  getOffersSecret,
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
const PREMIUM_OTP_TTL_MINUTES = Number(process.env.PREMIUM_OFFERS_OTP_TTL_MINUTES || 10);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function getClientIp(event) {
  const raw =
    event.headers['x-forwarded-for'] ||
    event.headers['client-ip'] ||
    event.headers['x-nf-client-connection-ip'] ||
    '';
  return String(raw).split(',')[0].trim();
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
      body: JSON.stringify({ error: 'Premium offers OTP is not fully configured on server' }),
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

  const rateLimit = checkRateLimit(`premium-offers-login:${getClientIp(event)}:${email}`, {
    windowMs: 10 * 60 * 1000,
    max: 10,
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

  try {
    const otpCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const otpToken = createPremiumOffersOtpToken(email, otpCode);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: email,
      subject: 'Code de verification - Offres Premium Silvousplait',
      html: `
        <p>Bonjour,</p>
        <p>Voici votre code de verification pour acceder aux offres premium :</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:2px;">${otpCode}</p>
        <p>Ce code expire dans ${PREMIUM_OTP_TTL_MINUTES} minutes.</p>
      `,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        otpToken,
        email,
        expiresInMinutes: PREMIUM_OTP_TTL_MINUTES,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Impossible d’envoyer le code OTP' }),
    };
  }
};
