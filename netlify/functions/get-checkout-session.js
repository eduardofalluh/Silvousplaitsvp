const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
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

  if (!sessionId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'session_id is required' }),
    };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const amountTotal = Number.isFinite(session.amount_total)
      ? session.amount_total / 100
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sessionId: session.id,
        amountTotal,
        currency: String(session.currency || 'cad').toUpperCase(),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to retrieve checkout session',
        details: error.message || 'Unknown error',
      }),
    };
  }
};
