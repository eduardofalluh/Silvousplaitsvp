/**
 * Netlify Function: verify reCAPTCHA (v2 or Enterprise), then forward signup to ActiveCampaign.
 * - Enterprise: RECAPTCHA_SECRET_KEY = Google Cloud API key (AIza...), RECAPTCHA_PROJECT_ID = your project ID.
 * - v2: RECAPTCHA_SECRET_KEY = reCAPTCHA v2 secret from https://www.google.com/recaptcha/admin
 */

const AC_URL = 'https://silvousplait.activehosted.com/proc.php';
const SITE_KEY = '6LdfG2csAAAAABhrVDaPSFqMj_mILqeiZrC0byfE';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function stripForAC(body) {
  const { website, 'g-recaptcha-response': _token, ...rest } = body;
  return rest;
}

function isEnterpriseKey(key) {
  return typeof key === 'string' && key.trim().startsWith('AIza');
}

async function verifyRecaptchaEnterprise(token, apiKey, projectId) {
  const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: { token, siteKey: SITE_KEY, expectedAction: 'signup' },
    }),
  });
  if (!res.ok) {
    console.error('reCAPTCHA Enterprise error:', res.status, await res.text());
    return false;
  }
  const data = await res.json();
  return !!(data.tokenProperties && data.tokenProperties.valid === true);
}

async function verifyRecaptchaV2(token, secretKey) {
  const params = new URLSearchParams({ secret: secretKey, response: token });
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    console.error('reCAPTCHA siteverify HTTP error:', res.status, await res.text());
    return { valid: false };
  }

  const data = await res.json();
  if (data.success === true) return { valid: true };
  console.error('reCAPTCHA siteverify failed:', JSON.stringify(data));
  return { valid: false, errorCodes: data['error-codes'] };
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

  const secretKey = (process.env.RECAPTCHA_SECRET_KEY || '').trim();
  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY not set in Netlify');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Server configuration error',
        hint: 'In Netlify add RECAPTCHA_SECRET_KEY. For Enterprise use your Google Cloud API key (AIza...); for v2 use the reCAPTCHA secret key.',
      }),
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

  if (isEnterpriseKey(secretKey)) {
    const projectId = (process.env.RECAPTCHA_PROJECT_ID || '').trim();
    if (!projectId) {
      console.error('RECAPTCHA_PROJECT_ID not set (required for Enterprise)');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Server configuration error',
          hint: 'For reCAPTCHA Enterprise, set RECAPTCHA_PROJECT_ID in Netlify (your Google Cloud project ID).',
        }),
      };
    }
    const valid = await verifyRecaptchaEnterprise(token, secretKey, projectId);
    if (!valid) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Verification failed', hint: 'Complete the reCAPTCHA and try again.' }) };
    }
  } else {
    const result = await verifyRecaptchaV2(token, secretKey);
    if (!result.valid) {
      const hint = result.errorCodes && result.errorCodes.includes('invalid-input-secret')
        ? 'Wrong RECAPTCHA_SECRET_KEY in Netlify.'
        : 'Complete the reCAPTCHA and try again.';
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Verification failed', hint }) };
    }
  }

  const { ok, data } = await forwardToActiveCampaign(body);
  return {
    statusCode: ok ? 200 : 400,
    headers,
    body: JSON.stringify(data),
  };
};
