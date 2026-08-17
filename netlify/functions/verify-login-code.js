/**
 * Passwordless login — step 2: verify the emailed code against the signed
 * challenge and, on success, return a long-lived session token ("stay
 * connected"). Fully stateless.
 *
 * Body (JSON): { challenge, code }
 * Returns: { success: true, session, email } or { success: false, reason }.
 */
const crypto = require('crypto');
const { verifySignedToken, createSignedToken } = require('../../utils/premium-access-token');
const premiumChecker = require('../../utils/premium-checker');
const { recordPremiumOfferAccessLog } = require('../../utils/premium-offers-store');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';
const SESSION_TTL_DAYS = Number(process.env.LOGIN_SESSION_TTL_DAYS || 30);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function codeHmac(email, code) { return crypto.createHmac('sha256', SECRET).update(email + '|' + code).digest('hex'); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Login is not configured on server' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const code = String(body.code || '').trim();
  const challenge = String(body.challenge || '');
  if (!/^\d{6}$/.test(code)) return { statusCode: 400, headers, body: JSON.stringify({ success: false, reason: 'bad-code-format' }) };

  const check = verifySignedToken(challenge, SECRET);
  if (!check.valid) return { statusCode: 401, headers, body: JSON.stringify({ success: false, reason: check.reason }) };
  const payload = check.payload || {};
  if (payload.kind !== 'login-challenge' || !payload.e || !payload.ch) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, reason: 'invalid-challenge' }) };
  }

  const expected = Buffer.from(codeHmac(payload.e, code), 'utf8');
  const provided = Buffer.from(String(payload.ch), 'utf8');
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, reason: 'wrong-code' }) };
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 86400;
  const session = createSignedToken({ e: payload.e, exp, kind: 'session' }, SECRET);

  try {
    const premiumStatus = await premiumChecker.isPremiumMember(payload.e, false);
    if (premiumStatus && premiumStatus.isPremium) {
      await recordPremiumOfferAccessLog({ email: payload.e });
    }
  } catch (error) {
    console.error('Premium account login log write error:', error);
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, session, email: payload.e }) };
};
