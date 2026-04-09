const crypto = require('crypto');
const {
  createSignedToken,
  verifySignedToken,
  normalizeEmail,
} = require('./premium-access-token');

const PREMIUM_OFFERS_SECRET = process.env.PREMIUM_OFFERS_SECRET || process.env.PREMIUM_ACCESS_SECRET || '';
const PREMIUM_OFFERS_ADMIN_PASSWORD = process.env.PREMIUM_OFFERS_ADMIN_PASSWORD || '';
const PREMIUM_OFFERS_SESSION_DAYS = Number(process.env.PREMIUM_OFFERS_SESSION_DAYS || 7);
const PREMIUM_OFFERS_OTP_TTL_MINUTES = Number(process.env.PREMIUM_OFFERS_OTP_TTL_MINUTES || 10);

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getOffersSecret() {
  return String(PREMIUM_OFFERS_SECRET || '').trim();
}

function createPremiumOffersOtpToken(email, otpCode) {
  return createSignedToken(
    {
      type: 'premium_offers_otp',
      email: normalizeEmail(email),
      code_hash: hashValue(otpCode),
      exp: Math.floor(Date.now() / 1000) + PREMIUM_OFFERS_OTP_TTL_MINUTES * 60,
    },
    getOffersSecret()
  );
}

function verifyPremiumOffersOtpToken(token, email, otpCode) {
  const result = verifySignedToken(token, getOffersSecret());
  if (!result.valid) return result;

  const payload = result.payload || {};
  if (
    payload.type !== 'premium_offers_otp' ||
    normalizeEmail(payload.email) !== normalizeEmail(email) ||
    String(payload.code_hash) !== hashValue(otpCode)
  ) {
    return { valid: false, reason: 'invalid_otp' };
  }

  return { valid: true, payload };
}

function createPremiumOffersSessionToken(email) {
  return createSignedToken(
    {
      type: 'premium_offers_session',
      email: normalizeEmail(email),
      exp: Math.floor(Date.now() / 1000) + PREMIUM_OFFERS_SESSION_DAYS * 24 * 60 * 60,
    },
    getOffersSecret()
  );
}

function verifyPremiumOffersSessionToken(token) {
  const result = verifySignedToken(token, getOffersSecret());
  if (!result.valid) return result;
  if ((result.payload || {}).type !== 'premium_offers_session') {
    return { valid: false, reason: 'invalid_session' };
  }
  return result;
}

function createAdminSessionToken() {
  return createSignedToken(
    {
      type: 'premium_offers_admin',
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    },
    getOffersSecret()
  );
}

function verifyAdminSessionToken(token) {
  const result = verifySignedToken(token, getOffersSecret());
  if (!result.valid) return result;
  if ((result.payload || {}).type !== 'premium_offers_admin') {
    return { valid: false, reason: 'invalid_admin_session' };
  }
  return result;
}

function isAdminPasswordValid(password) {
  if (!PREMIUM_OFFERS_ADMIN_PASSWORD) return false;

  const providedBuffer = Buffer.from(String(password || ''), 'utf8');
  const expectedBuffer = Buffer.from(PREMIUM_OFFERS_ADMIN_PASSWORD, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = {
  PREMIUM_OFFERS_ADMIN_PASSWORD,
  PREMIUM_OFFERS_OTP_TTL_MINUTES,
  getOffersSecret,
  createPremiumOffersOtpToken,
  verifyPremiumOffersOtpToken,
  createPremiumOffersSessionToken,
  verifyPremiumOffersSessionToken,
  createAdminSessionToken,
  verifyAdminSessionToken,
  isAdminPasswordValid,
};
