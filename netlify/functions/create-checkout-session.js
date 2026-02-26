const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { email, priceId } = JSON.parse(event.body);

    // Validate input
    if (!email || !priceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email and priceId are required' })
      };
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [
        {
          price: priceId, // e.g., 'price_xxxxxxxxxxxxx'
          quantity: 1,
        },
      ],
      success_url: `${process.env.URL}/premium.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/premium.html?canceled=true`,
      metadata: {
        customer_email: email,
      },
      subscription_data: {
        metadata: {
          customer_email: email,
        },
      },
    });

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
