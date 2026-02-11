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
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    const jsonpMatch = text.match(/^\s*[^(]*\((\{[\s\S]*\})\)\s*;?\s*$/);
    if (jsonpMatch) data = JSON.parse(jsonpMatch[1]);
  }
  const resultMsg = (data.result_message || data.message || '').toLowerCase();
  const resultCode = data.result_code !== undefined ? data.result_code : (data.result === 'success' || data.result === 1 ? 1 : 0);
  const alreadyRegistered =
    resultCode === 0 && (resultMsg.includes('already') || resultMsg.includes('déjà') || resultMsg.includes('exist') || resultMsg.includes('duplicate') || resultMsg.includes('subscribed'));
  return { ok: res.ok, data: { ...data, alreadyRegistered } };
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
