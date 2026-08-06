const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const premiumChecker = require('../../utils/premium-checker');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

function normalizeReturnPath(inputPath) {
  const normalizedPath = String(inputPath || '').trim();

  if (!normalizedPath) {
    return '/premium.html';
  }

  if (normalizedPath === '/' || normalizedPath === '/index.html') {
    return '/index.html';
  }

  if (['/premium.html', '/tunnel.html', '/accueil.html'].includes(normalizedPath)) {
    return normalizedPath;
  }

  return '/premium.html';
}

function buildCancelUrl(baseUrl, returnPath) {
  const normalizedReturnPath = normalizeReturnPath(returnPath);
  const cancelUrl = new URL(normalizedReturnPath, baseUrl);
  cancelUrl.searchParams.set('canceled', 'true');
  return cancelUrl.toString();
}

function validEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim());
}

async function hasActiveStripeSubscription(email) {
  if (!validEmail(email)) return false;
  const customers = await stripe.customers.list({ email, limit: 10 });
  const activeStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid']);
  for (const customer of customers.data || []) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 100,
    });
    if ((subscriptions.data || []).some((sub) => activeStatuses.has(String(sub.status || '').toLowerCase()))) {
      return true;
    }
  }
  return false;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { email, priceId, planKey, returnPath } = JSON.parse(event.body);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const resolvedCheckout = resolveLineItem(planKey, priceId);
    const successBaseUrl = process.env.URL || 'https://silvousplaitsvp.com';
    const isProductionCheckout =
      /^https:\/\//.test(successBaseUrl) &&
      !/localhost|127\.0\.0\.1/i.test(successBaseUrl);

    // Validate input
    if (!resolvedCheckout.lineItem) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'A valid Stripe price configuration is required',
          planKey: String(planKey || '').trim().toLowerCase() || null,
        })
      };
    }

    if (isProductionCheckout && resolvedCheckout.source !== 'price_id') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'A live Stripe Price ID is required for this checkout flow',
          planKey: String(planKey || '').trim().toLowerCase() || null,
          checkoutSource: resolvedCheckout.source,
        })
      };
    }

    if (normalizedEmail && validEmail(normalizedEmail)) {
      // Stripe is the authority on whether someone is CURRENTLY subscribed: it
      // is the system actually billing them, and it only reports
      // active/trialing/past_due/unpaid.
      //
      // The ActiveCampaign record is a lagging mirror — its premium tag and list
      // membership are not cleared when a subscription ends, so anyone who had
      // ever subscribed was blocked from EVER resubscribing after cancelling.
      // That silently turned churned members into permanently lost revenue.
      //
      // So: trust Stripe when we can reach it, and only fall back to the AC
      // record when the Stripe lookup itself fails — losing the guard entirely
      // on a Stripe outage would risk genuine double subscriptions.
      let stripeAlreadySubscribed = null;   // null = lookup failed
      try {
        stripeAlreadySubscribed = await hasActiveStripeSubscription(normalizedEmail);
      } catch (err) {
        console.error('Stripe subscription lookup failed, falling back to membership record:', err.message);
      }

      let blocked = false;
      let source = 'stripe';
      if (stripeAlreadySubscribed === true) {
        blocked = true;
      } else if (stripeAlreadySubscribed === null) {
        const premiumStatus = await premiumChecker.isPremiumMember(normalizedEmail, false);
        blocked = Boolean(premiumStatus && premiumStatus.isPremium);
        source = 'membership_record_fallback';
      }

      if (blocked) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'This email already has an active Premium subscription.',
            code: 'already_premium',
            source,
            email: normalizedEmail,
          }),
        };
      }
    }

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
      cancel_url: buildCancelUrl(successBaseUrl, returnPath),
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

    if (normalizedEmail && validEmail(normalizedEmail)) {
      sessionConfig.customer_email = normalizedEmail;
      sessionConfig.metadata.customer_email = normalizedEmail;
      sessionConfig.subscription_data.metadata.customer_email = normalizedEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sessionId: session.id, url: session.url }),
    };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create checkout session',
        details: error.message
      }),
    };
  }
};
