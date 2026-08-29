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

  if (['/premium.html', '/tunnel.html', '/accueil.html', '/compte.html'].includes(normalizedPath)) {
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

// Returns { hasActive, hasAnyHistory }.
//
// The distinction matters: "has a subscription right now" and "has ever had
// one" answer different questions. Active means a second checkout would double
// bill. Any-history tells us whether an ActiveCampaign premium flag is stale
// (they subscribed and later cancelled) or was granted by hand (comped member
// who never went through Stripe at all).
async function getStripeSubscriptionState(email) {
  if (!validEmail(email)) return { hasActive: false, hasAnyHistory: false };
  const customers = await stripe.customers.list({ email, limit: 10 });
  const activeStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid']);
  let hasActive = false;
  let hasAnyHistory = false;
  for (const customer of customers.data || []) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 100,
    });
    const subs = subscriptions.data || [];
    if (subs.length) hasAnyHistory = true;
    if (subs.some((sub) => activeStatuses.has(String(sub.status || '').toLowerCase()))) {
      hasActive = true;
    }
  }
  return { hasActive, hasAnyHistory };
}

// Returns a ready-to-send 409 response when this address must not start a new
// subscription, or null when it is clear to check out.
//
// Split out of the handler because the 14-day trial is sold through a Stripe
// Payment Link: that path creates no Checkout Session here, but it still has to
// run exactly this guard before handing off (see `checkOnly` below).
async function findDuplicatePremium(normalizedEmail) {
  // Never let anyone subscribe twice, while still letting someone who
  // genuinely cancelled come back. Three cases, and they need different
  // answers:
  //
  //   Stripe says ACTIVE            -> block. A second checkout double bills.
  //   AC premium + Stripe history   -> allow. They subscribed once and
  //                                    cancelled; the AC tag is just stale,
  //                                    since nothing clears it on cancel.
  //   AC premium + NO Stripe history-> block. Premium was granted by hand
  //                                    (comped/imported). They already have
  //                                    it and must not be charged for it.
  //
  // Judging only on Stripe let comped members pay for what they already
  // had; judging only on AC locked churned members out for good.
  let stripeState = null;                       // null = lookup failed
  try {
    stripeState = await getStripeSubscriptionState(normalizedEmail);
  } catch (err) {
    console.error('Stripe subscription lookup failed, falling back to membership record:', err.message);
  }

  let blocked = false;
  let source = '';
  if (stripeState && stripeState.hasActive) {
    blocked = true;
    source = 'stripe_active';
  } else {
    const premiumStatus = await premiumChecker.isPremiumMember(normalizedEmail, false);
    const acPremium = Boolean(premiumStatus && premiumStatus.isPremium);
    if (acPremium && (!stripeState || !stripeState.hasAnyHistory)) {
      // No prior Stripe subscription to have cancelled -> not stale, real.
      // Also covers a failed Stripe lookup, where we must stay cautious.
      blocked = true;
      source = stripeState ? 'membership_record' : 'membership_record_fallback';
    }
  }

  if (!blocked) return null;

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
    const { email, priceId, planKey, returnPath, checkOnly } = JSON.parse(event.body);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    // The trial's Stripe Payment Link needs the duplicate guard without a
    // Session: answer that question alone and stop. No price is configured for
    // the trial plan, so this must run before the price validation below.
    if (checkOnly) {
      if (normalizedEmail && validEmail(normalizedEmail)) {
        const duplicate = await findDuplicatePremium(normalizedEmail);
        if (duplicate) return duplicate;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
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
      const duplicate = await findDuplicatePremium(normalizedEmail);
      if (duplicate) return duplicate;
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

    // Only when we know it. With no address Stripe collects one itself, which
    // also means the duplicate check above did not run for this session.
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
