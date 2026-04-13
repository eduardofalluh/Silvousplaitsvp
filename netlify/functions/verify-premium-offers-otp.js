const premiumChecker = require('../../utils/premium-checker');
const {
  getOffersSecret,
  verifyPremiumOffersOtpToken,
  createPremiumOffersSessionToken,
} = require('../../utils/premium-offers-auth');
const { recordPremiumOfferAccessLog } = require('../../utils/premium-offers-store');
const { checkRateLimit } = require('../../utils/rate-limit');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
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

  if (!getOffersSecret()) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Premium offers session secret missing on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const email = normalize(body.email);
  const otpCode = String(body.otpCode || '').trim();
  const otpToken = String(body.otpToken || '').trim();

  if (!email || !otpCode || !otpToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'email, otpCode and otpToken are required' }),
    };
  }

  const rateLimit = checkRateLimit(`premium-offers-verify:${email}`, {
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

  const otpResult = verifyPremiumOffersOtpToken(otpToken, email, otpCode);
  if (!otpResult.valid) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Invalid or expired OTP code', reason: otpResult.reason }),
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
    await recordPremiumOfferAccessLog({ email });
  } catch (error) {
    console.error('Premium access log write error:', error);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      accessToken: createPremiumOffersSessionToken(email),
      email,
    }),
  };
};
