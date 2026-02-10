/**
 * Netlify Function: verify Google reCAPTCHA v2, then forward signup to ActiveCampaign.
 * Set RECAPTCHA_SECRET_KEY in Netlify env (use Google test secret for testing).
 */

const AC_URL = 'https://silvousplait.activehosted.com/proc.php';
const RECAPTCHA_VERIFY = 'https://www.google.com/recaptcha/api/siteverify';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function stripForAC(body) {
  const { website, 'g-recaptcha-response': _token, ...rest } = body;
  return rest;
}

async function verifyRecaptcha(token, secret) {
  const res = await fetch(RECAPTCHA_VERIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = await res.json();
  return data.success === true;
}

async function forwardToActiveCampaign(formData) {
  const params = new URLSearchParams(stripForAC(formData));
  const res = await fetch(AC_URL + '?jsonp=true', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.error('RECAPTCHA_SECRET_KEY not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const token = body['g-recaptcha-response'];
  if (!token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing verification' }) };
  }

  const valid = await verifyRecaptcha(token, secret);
  if (!valid) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Verification failed' }) };
  }

  const { ok, data } = await forwardToActiveCampaign(body);
  return {
    statusCode: ok ? 200 : 400,
    headers,
    body: JSON.stringify(data),
  };
};
