const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLAN_PRICE_IDS = {
  monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
  yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || process.env.STRIPE_PREMIUM_PRICE_ID || '',
  trial: process.env.STRIPE_PREMIUM_TRIAL_PRICE_ID || '',
};

const PLAN_DEFINITIONS = {
  monthly: {
    mode: 'subscription',
    lineItem: {
      price_data: {
        currency: 'cad',
        unit_amount: 800,
        recurring: { interval: 'month' },
        product_data: {
          name: 'Silvousplait Premium 8$',
        },
      },
      quantity: 1,
    },
  },
  yearly: {
    mode: 'subscription',
    lineItem: {
      price_data: {
        currency: 'cad',
        unit_amount: 6000,
        recurring: { interval: 'year' },
        product_data: {
          name: 'Silvousplait Premium annuel',
          description: 'Equivalent a 5$ / mois, facture annuellement.',
        },
      },
      quantity: 1,
    },
  },
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

function resolveLineItem(planKey, explicitPriceId) {
  const resolvedPriceId = resolvePriceId(planKey, explicitPriceId);
  if (resolvedPriceId) {
    return {
      lineItem: {
        price: resolvedPriceId,
        quantity: 1,
      },
      mode: 'subscription',
      source: 'price_id',
    };
  }

  const normalizedPlan = String(planKey || '').trim().toLowerCase();
  if (PLAN_DEFINITIONS[normalizedPlan]) {
    return {
      lineItem: PLAN_DEFINITIONS[normalizedPlan].lineItem,
      mode: PLAN_DEFINITIONS[normalizedPlan].mode,
      source: 'inline_price_data',
    };
  }

  return {
    lineItem: null,
    mode: 'subscription',
    source: 'missing',
  };
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
    const resolvedCheckout = resolveLineItem(planKey, priceId);

    // Validate input
    if (!resolvedCheckout.lineItem) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'A valid Stripe price configuration is required',
          planKey: String(planKey || '').trim().toLowerCase() || null,
        })
      };
    }

    const successBaseUrl = process.env.URL || 'https://silvousplaitsvp.com';

    // Create Stripe Checkout Session
    const normalizedPlanKey = String(planKey || '').trim().toLowerCase() || 'custom';

    const sessionConfig = {
      payment_method_types: ['card'],
      mode: resolvedCheckout.mode,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      automatic_tax: {
        enabled: true,
      },
      line_items: [
        resolvedCheckout.lineItem,
      ],
      success_url: `${successBaseUrl}/premium-confirmation.html?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(normalizedPlanKey)}`,
      cancel_url: `${successBaseUrl}/premium.html?canceled=true`,
      metadata: {
        selected_plan: normalizedPlanKey,
        checkout_price_source: resolvedCheckout.source,
      },
      subscription_data: {
        metadata: {
          selected_plan: normalizedPlanKey,
          checkout_price_source: resolvedCheckout.source,
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
