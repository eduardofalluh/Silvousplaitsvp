const crypto = require('crypto');

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payloadString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSignedToken(payload, secret) {
  if (!secret) {
    throw new Error('Missing token secret');
  }
  const payloadString = JSON.stringify(payload || {});
  const payloadPart = base64UrlEncode(payloadString);
  const signaturePart = signPayload(payloadPart, secret);
  return `${payloadPart}.${signaturePart}`;
}

function verifySignedToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing_token' };
  }
  if (!secret) {
    return { valid: false, reason: 'missing_secret' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid_format' };
  }

  const [payloadPart, signaturePart] = parts;
  const expectedSignature = signPayload(payloadPart, secret);
  if (signaturePart !== expectedSignature) {
    return { valid: false, reason: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (payload.exp && Date.now() > Number(payload.exp) * 1000) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createPremiumAccessToken(payload, secret) {
  if (!secret) {
    throw new Error('Missing PREMIUM_ACCESS_SECRET');
  }

  const normalizedPayload = {
    e: normalizeEmail(payload.email),
    t: String(payload.ticketNumber || ''),
    ev: String(payload.eventName || ''),
    exp: Number(payload.exp || 0),
  };

  const payloadString = JSON.stringify(normalizedPayload);
  const payloadPart = base64UrlEncode(payloadString);
  const signaturePart = signPayload(payloadPart, secret);

  return `${payloadPart}.${signaturePart}`;
}

function verifyPremiumAccessToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing_token' };
  }
  if (!secret) {
    return { valid: false, reason: 'missing_secret' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid_format' };
  }

  const [payloadPart, signaturePart] = parts;
  const expectedSignature = signPayload(payloadPart, secret);
  if (signaturePart !== expectedSignature) {
    return { valid: false, reason: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (!payload || !payload.e || !payload.exp) {
    return { valid: false, reason: 'missing_claims' };
  }

  if (Date.now() > Number(payload.exp) * 1000) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {
  createSignedToken,
  verifySignedToken,
  createPremiumAccessToken,
  verifyPremiumAccessToken,
  normalizeEmail,
  hashToken,
};
