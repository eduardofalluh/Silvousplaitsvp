const { createHash } = require('node:crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const sessionId = String(
    (event.queryStringParameters && event.queryStringParameters.session_id) || ''
  ).trim();

  if (!/^cs_(?:live|test)_[a-zA-Z0-9]+$/.test(sessionId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'session_id is required' }),
    };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    const amountTotal = Number.isFinite(session.amount_total)
      ? session.amount_total / 100
      : null;

    const completed = session.mode === 'subscription' && session.status === 'complete' &&
      ['paid', 'no_payment_required'].includes(session.payment_status) && Boolean(session.subscription);
    const isTrial = Boolean(session.subscription && session.subscription.trial_start);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        completed,
        conversionEvent: completed ? (isTrial ? 'StartTrial' : 'Subscribe') : null,
        eventId: completed ? 'svp_checkout_' + createHash('sha256').update(session.id).digest('hex') : null,
        sessionId: session.id,
        amountTotal,
        currency: String(session.currency || 'cad').toUpperCase(),
      }),
    };
  } catch (error) {
    return {
      statusCode: error.statusCode === 404 || error.type === 'StripeInvalidRequestError' ? 404 : 502,
      headers,
      body: JSON.stringify({
        error: 'Failed to retrieve checkout session',
      }),
    };
  }
};
