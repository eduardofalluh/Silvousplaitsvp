/**
 * Netlify Function: block bots via honeypot, then forward signup to ActiveCampaign.
 * No reCAPTCHA – no keys or env vars required.
 */

const AC_URL = 'https://silvousplait.activehosted.com/proc.php';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function stripForAC(body) {
  const { website, ...rest } = body;
  return rest;
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

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // Honeypot: if "website" is filled, treat as bot – don't forward, return fake success
  const honeypot = (body.website || '').trim();
  if (honeypot) {
    return { statusCode: 200, headers, body: JSON.stringify({ result: 'success', result_message: 'Thank you' }) };
  }

  const { ok, data } = await forwardToActiveCampaign(body);
  return {
    statusCode: ok ? 200 : 400,
    headers,
    body: JSON.stringify(data),
  };
};
