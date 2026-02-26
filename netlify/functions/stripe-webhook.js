const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    // Verify webhook signature
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Webhook Error: ${err.message}` })
    };
  }

  // Handle the event
  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(stripeEvent.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(stripeEvent.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  } catch (error) {
    console.error('Webhook handling error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Webhook processing failed' })
    };
  }
};

// Handle successful checkout
async function handleCheckoutCompleted(session) {
  console.log('Checkout completed:', session.id);
  const customerEmail = session.customer_email;

  // Add to ActiveCampaign premium list
  if (process.env.ACTIVECAMPAIGN_API_KEY) {
    await addToPremiumList(customerEmail, session.customer);
  }

  // Log the new premium member
  console.log(`New premium member: ${customerEmail}`);
}

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
  console.log('Subscription created:', subscription.id);
  const customerId = subscription.customer;

  // Get customer email
  const customer = await stripe.customers.retrieve(customerId);
  const customerEmail = customer.email;

  // Add premium tag in ActiveCampaign
  if (process.env.ACTIVECAMPAIGN_API_KEY) {
    await addPremiumTag(customerEmail, 'premium_active');
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  const customerId = subscription.customer;
  const customer = await stripe.customers.retrieve(customerId);
  const customerEmail = customer.email;

  // Update status based on subscription status
  if (subscription.status === 'active') {
    await addPremiumTag(customerEmail, 'premium_active');
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    await removePremiumTag(customerEmail, 'premium_active');
  }
}

// Handle subscription canceled/deleted
async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);
  const customerId = subscription.customer;
  const customer = await stripe.customers.retrieve(customerId);
  const customerEmail = customer.email;

  // Remove premium status
  if (process.env.ACTIVECAMPAIGN_API_KEY) {
    await removePremiumTag(customerEmail, 'premium_active');
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded:', invoice.id);
  // Additional logic if needed (e.g., send receipt)
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  console.log('Payment failed:', invoice.id);
  const customerId = invoice.customer;
  const customer = await stripe.customers.retrieve(customerId);

  // Optionally notify customer via email or AC automation
  console.log(`Payment failed for: ${customer.email}`);
}

// Add contact to ActiveCampaign premium list
async function addToPremiumList(email, stripeCustomerId) {
  const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
  const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
  const PREMIUM_LIST_ID = process.env.ACTIVECAMPAIGN_PREMIUM_LIST_ID;

  if (!AC_API_URL || !AC_API_KEY || !PREMIUM_LIST_ID) {
    console.log('ActiveCampaign not configured, skipping...');
    return;
  }

  try {
    // First, find or create contact
    const contactResponse = await fetch(`${AC_API_URL}/api/3/contacts`, {
      method: 'POST',
      headers: {
        'Api-Token': AC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact: {
          email: email,
          fieldValues: [
            {
              field: '1', // Adjust field ID for Stripe Customer ID
              value: stripeCustomerId,
            },
          ],
        },
      }),
    });

    const contactData = await contactResponse.json();
    const contactId = contactData.contact.id;

    // Add to premium list
    await fetch(`${AC_API_URL}/api/3/contactLists`, {
      method: 'POST',
      headers: {
        'Api-Token': AC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contactList: {
          list: PREMIUM_LIST_ID,
          contact: contactId,
          status: 1, // subscribed
        },
      }),
    });

    console.log(`Added ${email} to premium list`);
  } catch (error) {
    console.error('ActiveCampaign error:', error);
  }
}

// Add premium tag
async function addPremiumTag(email, tagName) {
  const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
  const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;

  if (!AC_API_URL || !AC_API_KEY) return;

  try {
    // Find contact by email
    const searchResponse = await fetch(
      `${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`,
      {
        headers: { 'Api-Token': AC_API_KEY },
      }
    );
    const searchData = await searchResponse.json();

    if (searchData.contacts && searchData.contacts.length > 0) {
      const contactId = searchData.contacts[0].id;

      // Create or get tag
      const tagResponse = await fetch(`${AC_API_URL}/api/3/tags`, {
        method: 'POST',
        headers: {
          'Api-Token': AC_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tag: {
            tag: tagName,
            tagType: 'contact',
          },
        }),
      });

      const tagData = await tagResponse.json();
      const tagId = tagData.tag.id;

      // Add tag to contact
      await fetch(`${AC_API_URL}/api/3/contactTags`, {
        method: 'POST',
        headers: {
          'Api-Token': AC_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contactTag: {
            contact: contactId,
            tag: tagId,
          },
        }),
      });

      console.log(`Tagged ${email} with ${tagName}`);
    }
  } catch (error) {
    console.error('Tag error:', error);
  }
}

// Remove premium tag
async function removePremiumTag(email, tagName) {
  const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
  const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;

  if (!AC_API_URL || !AC_API_KEY) return;

  try {
    // Find contact
    const searchResponse = await fetch(
      `${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`,
      {
        headers: { 'Api-Token': AC_API_KEY },
      }
    );
    const searchData = await searchResponse.json();

    if (searchData.contacts && searchData.contacts.length > 0) {
      const contactId = searchData.contacts[0].id;

      // Find tag
      const tagsResponse = await fetch(
        `${AC_API_URL}/api/3/contacts/${contactId}/contactTags`,
        {
          headers: { 'Api-Token': AC_API_KEY },
        }
      );
      const tagsData = await tagsResponse.json();

      // Find and remove the specific tag
      const contactTag = tagsData.contactTags.find(
        (ct) => ct.tag === tagName
      );

      if (contactTag) {
        await fetch(`${AC_API_URL}/api/3/contactTags/${contactTag.id}`, {
          method: 'DELETE',
          headers: { 'Api-Token': AC_API_KEY },
        });

        console.log(`Removed ${tagName} from ${email}`);
      }
    }
  } catch (error) {
    console.error('Remove tag error:', error);
  }
}
