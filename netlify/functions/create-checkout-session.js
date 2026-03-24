const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLAN_PRICE_IDS = {
  monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
  yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || process.env.STRIPE_PREMIUM_PRICE_ID || '',
  trial: process.env.STRIPE_PREMIUM_TRIAL_PRICE_ID || '',
};

function resolvePriceId(planKey, explicitPriceId) {
  if (explicitPriceId) {
    return String(explicitPriceId).trim();
  }

  const normalizedPlan = String(planKey || '').trim().toLowerCase();
  if (!normalizedPlan) {
    return '';
  }

  return PLAN_PRICE_IDS[normalizedPlan] || '';
}

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { email, priceId, planKey } = JSON.parse(event.body);
    const resolvedPriceId = resolvePriceId(planKey, priceId);

    // Validate input
    if (!resolvedPriceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'A valid Stripe price configuration is required' })
      };
    }

    const successBaseUrl = process.env.URL || 'https://silvousplaitsvp.com';

    // Create Stripe Checkout Session
    const sessionConfig = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: resolvedPriceId,
          quantity: 1,
        },
      ],
      success_url: `${successBaseUrl}/premium-confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successBaseUrl}/premium.html?canceled=true`,
      metadata: {
        selected_plan: String(planKey || '').trim().toLowerCase() || 'custom',
      },
      subscription_data: {
        metadata: {
          selected_plan: String(planKey || '').trim().toLowerCase() || 'custom',
        },
      },
    };

    if (email) {
      sessionConfig.customer_email = email;
      sessionConfig.metadata.customer_email = email;
      sessionConfig.subscription_data.metadata.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ sessionId: session.id, url: session.url }),
    };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create checkout session',
        details: error.message
      }),
    };
  }
};
