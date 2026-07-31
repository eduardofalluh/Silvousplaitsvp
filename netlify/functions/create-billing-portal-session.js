// Opens the Stripe Customer Portal for the logged-in member (view invoices +
// cancel subscription). Session-verified; finds the Stripe customer by email.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { verifySignedToken } = require('../../utils/premium-access-token');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.STRIPE_SECRET_KEY || !SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const check = verifySignedToken(String(body.session || ''), SECRET);
  if (!check.valid || (check.payload && check.payload.kind !== 'session') || !check.payload.e) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, reason: check.reason || 'invalid-session' }) };
  }
  const email = check.payload.e;

  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'no-subscription' }) };
    const returnUrl = (process.env.URL || 'https://silvousplaitsvp.com') + '/compte.html';
    const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: returnUrl });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, url: portal.url }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: e.message || 'portal-failed' }) };
  }
};
