/**
 * Netlify Function: verify reCAPTCHA Enterprise token, then forward signup to ActiveCampaign.
 * Env: RECAPTCHA_SECRET_KEY (Google Cloud API key for reCAPTCHA Enterprise API),
 *      optional RECAPTCHA_PROJECT_ID (default: silvousplaitsvp-1770746538963).
 */

const AC_URL = 'https://silvousplait.activehosted.com/proc.php';
const SITE_KEY = '6LdfG2csAAAAABhrVDaPSFqMj_mILqeiZrC0byfE';
const DEFAULT_PROJECT_ID = 'silvousplaitsvp-1770746538963';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function stripForAC(body) {
  const { website, 'g-recaptcha-response': _token, ...rest } = body;
  return rest;
}

async function verifyRecaptchaEnterprise(token, apiKey, projectId) {
  const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        token: token,
        expectedAction: 'signup',
        siteKey: SITE_KEY,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('reCAPTCHA Enterprise error:', res.status, errText);
    return false;
  }

  const data = await res.json();
  const valid = data.tokenProperties && data.tokenProperties.valid === true;
  if (!valid && data.tokenProperties && data.tokenProperties.invalidReason) {
    console.error('reCAPTCHA invalid reason:', data.tokenProperties.invalidReason);
  }
  return valid;
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

  const apiKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!apiKey) {
    console.error('RECAPTCHA_SECRET_KEY not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  const projectId = process.env.RECAPTCHA_PROJECT_ID || DEFAULT_PROJECT_ID;

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

  const valid = await verifyRecaptchaEnterprise(token, apiKey, projectId);
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
