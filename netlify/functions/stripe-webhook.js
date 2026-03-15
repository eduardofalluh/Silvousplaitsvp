const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');
const PREMIUM_TAG = process.env.ACTIVECAMPAIGN_PREMIUM_TAG || 'premium_active';
const SUBSCRIPTION_TYPE_FIELD_ID = process.env.ACTIVECAMPAIGN_SUBSCRIPTION_TYPE_FIELD_ID || '';
const POSTAL_CODE_FIELD_ID = process.env.ACTIVECAMPAIGN_POSTAL_CODE_FIELD_ID || '';
const fieldIdCache = {
  subscriptionType: null,
  postalCode: null,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing webhook signature or webhook secret' }),
    };
  }

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
      body: JSON.stringify({ error: `Webhook Error: ${err.message}` }),
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

      case 'invoice.paid':
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
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error('Webhook handling error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Webhook processing failed' }),
    };
  }
};

// Handle successful checkout
async function handleCheckoutCompleted(session) {
  console.log('Checkout completed:', session.id);
  const customerEmail = await resolveCustomerEmail(session);
  const postalCode = extractPostalCodeFromSession(session);

  // Add to ActiveCampaign premium list
  if (process.env.ACTIVECAMPAIGN_API_KEY && customerEmail) {
    await addToPremiumList(customerEmail, session.customer);
    await addPremiumTag(customerEmail, PREMIUM_TAG);
    await addContactToPremiumList(customerEmail);
    await updateSubscriptionTypeField(customerEmail, await resolveSubscriptionTypeForCheckoutSession(session));
    await updatePostalCodeField(customerEmail, postalCode);
  } else {
    console.log(`Checkout completed but no resolvable customer email for session ${session.id}`);
  }

  // Log the new premium member
  console.log(`New premium member: ${customerEmail}`);
}

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
  console.log('Subscription created:', subscription.id);
  const customerEmail = await resolveCustomerEmail(subscription);

  // Add premium tag in ActiveCampaign
  if (process.env.ACTIVECAMPAIGN_API_KEY && customerEmail) {
    await addPremiumTag(customerEmail, PREMIUM_TAG);
    await addContactToPremiumList(customerEmail);
    await updateSubscriptionTypeField(customerEmail, await resolveSubscriptionType(subscription));
    await updatePostalCodeField(customerEmail, await resolvePostalCode(subscription));
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  const customerEmail = await resolveCustomerEmail(subscription);

  if (!customerEmail) return;

  // Update status based on subscription status
  if (subscription.status === 'active') {
    await addPremiumTag(customerEmail, PREMIUM_TAG);
    await addContactToPremiumList(customerEmail);
    await updateSubscriptionTypeField(customerEmail, await resolveSubscriptionType(subscription));
    await updatePostalCodeField(customerEmail, await resolvePostalCode(subscription));
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    await removePremiumTag(customerEmail, PREMIUM_TAG);
    await removeContactFromPremiumList(customerEmail);
    await updateSubscriptionTypeField(customerEmail, '');
  }
}

// Handle subscription canceled/deleted
async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);
  const customerEmail = await resolveCustomerEmail(subscription);

  // Remove premium status
  if (process.env.ACTIVECAMPAIGN_API_KEY && customerEmail) {
    await removePremiumTag(customerEmail, PREMIUM_TAG);
    await removeContactFromPremiumList(customerEmail);
    await updateSubscriptionTypeField(customerEmail, '');
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded:', invoice.id);
  const customerEmail = await resolveCustomerEmail(invoice);
  if (!customerEmail) return;
  await addPremiumTag(customerEmail, PREMIUM_TAG);
  await addContactToPremiumList(customerEmail);
  await updateSubscriptionTypeField(customerEmail, await resolveSubscriptionType(invoice.subscription));
  await updatePostalCodeField(customerEmail, await resolvePostalCode(invoice));
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  console.log('Payment failed:', invoice.id);
  const customerEmail = await resolveCustomerEmail(invoice);
  // Optionally notify customer via email or AC automation
  console.log(`Payment failed for: ${customerEmail || 'unknown-email'}`);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getACConfig() {
  return {
    apiUrl: process.env.ACTIVECAMPAIGN_API_URL,
    apiKey: process.env.ACTIVECAMPAIGN_API_KEY,
    premiumListId: process.env.ACTIVECAMPAIGN_PREMIUM_LIST_ID,
    subscriptionTypeFieldId: SUBSCRIPTION_TYPE_FIELD_ID,
    postalCodeFieldId: POSTAL_CODE_FIELD_ID,
  };
}

function normalizeSubscriptionType(interval, intervalCount) {
  const normalizedInterval = String(interval || '').trim().toLowerCase();
  const count = Number(intervalCount || 1);
  if (!normalizedInterval) return '';
  if (normalizedInterval === 'month' && count === 1) return 'monthly';
  if (normalizedInterval === 'year' && count === 1) return 'yearly';
  return count > 1 ? `${normalizedInterval}_${count}` : normalizedInterval;
}

function extractSubscriptionTypeFromObject(subscription) {
  const firstItem = subscription &&
    subscription.items &&
    Array.isArray(subscription.items.data) &&
    subscription.items.data.length > 0
      ? subscription.items.data[0]
      : null;

  const recurring =
    (firstItem && firstItem.price && firstItem.price.recurring) ||
    (firstItem && firstItem.plan && firstItem.plan.interval
      ? { interval: firstItem.plan.interval, interval_count: firstItem.plan.interval_count }
      : null);

  if (!recurring) return '';
  return normalizeSubscriptionType(recurring.interval, recurring.interval_count);
}

function extractSubscriptionTypeFromLineItems(lineItems) {
  const firstItem =
    Array.isArray(lineItems) && lineItems.length > 0 ? lineItems[0] : null;
  const recurring =
    firstItem &&
    firstItem.price &&
    firstItem.price.recurring;
  if (!recurring) return '';
  return normalizeSubscriptionType(recurring.interval, recurring.interval_count);
}

async function resolveSubscriptionType(subscriptionOrId) {
  if (!subscriptionOrId) return '';

  if (typeof subscriptionOrId === 'object') {
    const fromPayload = extractSubscriptionTypeFromObject(subscriptionOrId);
    if (fromPayload) return fromPayload;
    if (!subscriptionOrId.id) return '';
  }

  const subscriptionId =
    typeof subscriptionOrId === 'string' ? subscriptionOrId : String(subscriptionOrId.id || '');
  if (!subscriptionId) return '';

  try {
    const full = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    return extractSubscriptionTypeFromObject(full);
  } catch (error) {
    console.error('Unable to resolve subscription type from Stripe:', error);
    return '';
  }
}

async function resolveSubscriptionTypeForCheckoutSession(session) {
  if (!session) return '';

  if (session.subscription) {
    const fromSubscription = await resolveSubscriptionType(session.subscription);
    if (fromSubscription) return fromSubscription;
  }

  const fromSessionItems = extractSubscriptionTypeFromLineItems(
    session &&
      session.line_items &&
      Array.isArray(session.line_items.data)
      ? session.line_items.data
      : null
  );
  if (fromSessionItems) return fromSessionItems;

  if (!session.id) return '';
  try {
    const expanded = await stripe.checkout.sessions.retrieve(String(session.id), {
      expand: ['line_items.data.price'],
    });
    return extractSubscriptionTypeFromLineItems(
      expanded && expanded.line_items && Array.isArray(expanded.line_items.data)
        ? expanded.line_items.data
        : null
    );
  } catch (error) {
    console.error('Unable to resolve subscription type from checkout session:', error);
    return '';
  }
}

function normalizePostalCode(value) {
  return String(value || '').trim();
}

async function resolveCustomerEmail(source) {
  if (!source) return '';

  const direct =
    source.customer_email ||
    (source.customer_details && source.customer_details.email) ||
    source.receipt_email ||
    (source.billing_details && source.billing_details.email) ||
    (source.metadata && (source.metadata.customer_email || source.metadata.email));
  if (direct) return normalizeEmail(direct);

  const customerId =
    (typeof source.customer === 'string' && source.customer) ||
    (source.customer && source.customer.id) ||
    '';
  if (!customerId) return '';

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return normalizeEmail(customer && customer.email);
  } catch (error) {
    console.error('Unable to resolve customer email from Stripe customer:', error);
    return '';
  }
}

function extractPostalCodeFromSession(session) {
  const fromCustomerDetails =
    session &&
    session.customer_details &&
    session.customer_details.address &&
    session.customer_details.address.postal_code;
  if (fromCustomerDetails) return normalizePostalCode(fromCustomerDetails);
  const fromShipping =
    session && session.shipping_details && session.shipping_details.address && session.shipping_details.address.postal_code;
  if (fromShipping) return normalizePostalCode(fromShipping);
  return '';
}

function extractPostalCodeFromCustomer(customer) {
  if (!customer) return '';
  const fromAddress = customer.address && customer.address.postal_code;
  if (fromAddress) return normalizePostalCode(fromAddress);
  const fromShipping = customer.shipping && customer.shipping.address && customer.shipping.address.postal_code;
  if (fromShipping) return normalizePostalCode(fromShipping);
  return '';
}

async function resolvePostalCode(source) {
  if (!source) return '';

  if (source.object === 'checkout.session') {
    const direct = extractPostalCodeFromSession(source);
    if (direct) return direct;
  }
  if (source.object === 'invoice') {
    const fromInvoiceAddress = source.customer_address && source.customer_address.postal_code;
    if (fromInvoiceAddress) return normalizePostalCode(fromInvoiceAddress);
  }

  const customerId =
    (typeof source.customer === 'string' && source.customer) ||
    (source.customer && source.customer.id) ||
    '';

  if (!customerId) return '';

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return extractPostalCodeFromCustomer(customer);
  } catch (error) {
    console.error('Unable to resolve postal code from Stripe customer:', error);
    return '';
  }
}

async function acFetch(path, options = {}) {
  const { apiUrl, apiKey } = getACConfig();
  if (!apiUrl || !apiKey) {
    throw new Error('ActiveCampaign config missing');
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Api-Token': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return response;
}

async function findContactByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const response = await acFetch(`/api/3/contacts?email=${encodeURIComponent(normalizedEmail)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Contact lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return (data.contacts || [])[0] || null;
}

async function getOrCreateTagId(tagName) {
  const normalizedTagName = String(tagName || '').trim();
  if (!normalizedTagName) {
    throw new Error('Tag name is required');
  }

  const searchResponse = await acFetch(`/api/3/tags?search=${encodeURIComponent(normalizedTagName)}`);
  if (!searchResponse.ok) {
    const text = await searchResponse.text();
    throw new Error(`Tag search failed (${searchResponse.status}): ${text}`);
  }
  const searchData = await searchResponse.json();
  const existingTag = (searchData.tags || []).find(
    (tag) => String(tag.tag || '').trim().toLowerCase() === normalizedTagName.toLowerCase()
  );
  if (existingTag && existingTag.id) return String(existingTag.id);

  const createResponse = await acFetch('/api/3/tags', {
    method: 'POST',
    body: JSON.stringify({
      tag: {
        tag: normalizedTagName,
        tagType: 'contact',
      },
    }),
  });
  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Tag create failed (${createResponse.status}): ${text}`);
  }
  const createData = await createResponse.json();
  return String(createData.tag.id);
}

async function findTagIdByName(tagName) {
  const normalizedTagName = String(tagName || '').trim();
  if (!normalizedTagName) return null;
  const searchResponse = await acFetch(`/api/3/tags?search=${encodeURIComponent(normalizedTagName)}`);
  if (!searchResponse.ok) {
    const text = await searchResponse.text();
    throw new Error(`Tag search failed (${searchResponse.status}): ${text}`);
  }
  const searchData = await searchResponse.json();
  const existingTag = (searchData.tags || []).find(
    (tag) => String(tag.tag || '').trim().toLowerCase() === normalizedTagName.toLowerCase()
  );
  return existingTag && existingTag.id ? String(existingTag.id) : null;
}

async function getContactTagAssignments(contactId) {
  const response = await acFetch(`/api/3/contacts/${contactId}/contactTags`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Contact tags lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return data.contactTags || [];
}

async function getExistingFieldValue(contactId, fieldId) {
  const response = await acFetch(`/api/3/contacts/${contactId}/fieldValues`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Field values lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return (data.fieldValues || []).find((fv) => String(fv.field) === String(fieldId)) || null;
}

async function listActiveCampaignFields() {
  const response = await acFetch('/api/3/fields');
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fields lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return Array.isArray(data.fields) ? data.fields : [];
}

function normalizeFieldToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}

async function resolveFieldId(kind) {
  if (kind === 'subscriptionType') {
    if (SUBSCRIPTION_TYPE_FIELD_ID) return String(SUBSCRIPTION_TYPE_FIELD_ID);
    if (fieldIdCache.subscriptionType) return fieldIdCache.subscriptionType;
  }
  if (kind === 'postalCode') {
    if (POSTAL_CODE_FIELD_ID) return String(POSTAL_CODE_FIELD_ID);
    if (fieldIdCache.postalCode) return fieldIdCache.postalCode;
  }

  const fields = await listActiveCampaignFields();
  const candidates = fields.map((field) => ({
    id: String(field.id || ''),
    title: normalizeFieldToken(field.title),
    perstag: normalizeFieldToken(field.perstag),
  }));

  const matchOne = (matcher) => candidates.find(matcher);
  let match = null;

  if (kind === 'subscriptionType') {
    match =
      matchOne((f) => f.title === 'subscriptiontype' || f.perstag === 'subscriptiontype') ||
      matchOne((f) => f.title.includes('subscription') && f.title.includes('type')) ||
      matchOne((f) => f.perstag.includes('subscription') && f.perstag.includes('type'));
    if (match && match.id) fieldIdCache.subscriptionType = match.id;
  }

  if (kind === 'postalCode') {
    match =
      matchOne((f) => f.title === 'postalcode' || f.perstag === 'postalcode') ||
      matchOne((f) => f.title === 'postal_code' || f.perstag === 'postal_code') ||
      matchOne((f) => f.title.includes('postal') && f.title.includes('code')) ||
      matchOne((f) => f.perstag.includes('postal') && f.perstag.includes('code'));
    if (match && match.id) fieldIdCache.postalCode = match.id;
  }

  return match && match.id ? match.id : '';
}

async function createFieldValue(contactId, fieldId, value) {
  const response = await acFetch('/api/3/fieldValues', {
    method: 'POST',
    body: JSON.stringify({
      fieldValue: {
        contact: String(contactId),
        field: String(fieldId),
        value: String(value || ''),
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Field value create failed (${response.status}): ${text}`);
  }
}

async function updateFieldValue(fieldValueId, contactId, fieldId, value) {
  const response = await acFetch(`/api/3/fieldValues/${fieldValueId}`, {
    method: 'PUT',
    body: JSON.stringify({
      fieldValue: {
        contact: String(contactId),
        field: String(fieldId),
        value: String(value || ''),
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Field value update failed (${response.status}): ${text}`);
  }
}

async function updateSubscriptionTypeField(email, subscriptionTypeValue) {
  const normalizedEmail = normalizeEmail(email);
  const configuredFieldId = getACConfig().subscriptionTypeFieldId;
  const subscriptionTypeFieldId = configuredFieldId || (await resolveFieldId('subscriptionType'));
  if (!normalizedEmail || !subscriptionTypeFieldId) return;

  try {
    const contact = await findContactByEmail(normalizedEmail);
    if (!contact || !contact.id) return;

    const existing = await getExistingFieldValue(contact.id, subscriptionTypeFieldId);
    if (existing && existing.id) {
      await updateFieldValue(existing.id, contact.id, subscriptionTypeFieldId, subscriptionTypeValue);
    } else {
      await createFieldValue(contact.id, subscriptionTypeFieldId, subscriptionTypeValue);
    }
    console.log(`Subscription type updated for ${normalizedEmail}: ${subscriptionTypeValue || '(empty)'}`);
  } catch (error) {
    console.error('Subscription type field update error:', error);
  }
}

async function updatePostalCodeField(email, postalCodeValue) {
  const normalizedEmail = normalizeEmail(email);
  const configuredFieldId = getACConfig().postalCodeFieldId;
  const postalCodeFieldId = configuredFieldId || (await resolveFieldId('postalCode'));
  const value = normalizePostalCode(postalCodeValue);
  if (!normalizedEmail || !postalCodeFieldId || !value) return;

  try {
    const contact = await findContactByEmail(normalizedEmail);
    if (!contact || !contact.id) return;

    const existing = await getExistingFieldValue(contact.id, postalCodeFieldId);
    if (existing && existing.id) {
      await updateFieldValue(existing.id, contact.id, postalCodeFieldId, value);
    } else {
      await createFieldValue(contact.id, postalCodeFieldId, value);
    }
    console.log(`Postal code updated for ${normalizedEmail}: ${value}`);
  } catch (error) {
    console.error('Postal code field update error:', error);
  }
}

async function upsertContactListStatus(contactId, listId, status) {
  const lookup = await acFetch(`/api/3/contacts/${contactId}/contactLists`);
  if (!lookup.ok) {
    const text = await lookup.text();
    throw new Error(`Contact lists lookup failed (${lookup.status}): ${text}`);
  }
  const data = await lookup.json();
  const existing = (data.contactLists || []).find(
    (item) => String(item.list) === String(listId)
  );

  if (existing && existing.id) {
    const update = await acFetch(`/api/3/contactLists/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        contactList: {
          list: String(listId),
          contact: String(contactId),
          status: Number(status),
        },
      }),
    });
    if (!update.ok) {
      const text = await update.text();
      throw new Error(`Contact list update failed (${update.status}): ${text}`);
    }
    return;
  }

  const create = await acFetch('/api/3/contactLists', {
    method: 'POST',
    body: JSON.stringify({
      contactList: {
        list: String(listId),
        contact: String(contactId),
        status: Number(status),
      },
    }),
  });
  if (!create.ok && create.status !== 409) {
    const text = await create.text();
    throw new Error(`Contact list create failed (${create.status}): ${text}`);
  }
}

async function addContactToPremiumList(email) {
  const normalizedEmail = normalizeEmail(email);
  const { premiumListId } = getACConfig();
  if (!normalizedEmail || !premiumListId) return;

  try {
    const contact = await findContactByEmail(normalizedEmail);
    if (!contact || !contact.id) return;
    await upsertContactListStatus(contact.id, premiumListId, 1);
    console.log(`Premium list status set active for ${normalizedEmail}`);
  } catch (error) {
    console.error('Add to premium list error:', error);
  }
}

async function removeContactFromPremiumList(email) {
  const normalizedEmail = normalizeEmail(email);
  const { premiumListId } = getACConfig();
  if (!normalizedEmail || !premiumListId) return;

  try {
    const contact = await findContactByEmail(normalizedEmail);
    if (!contact || !contact.id) return;
    await upsertContactListStatus(contact.id, premiumListId, 2);
    console.log(`Premium list status set inactive for ${normalizedEmail}`);
  } catch (error) {
    console.error('Remove from premium list error:', error);
  }
}

// Add contact to ActiveCampaign premium list
async function addToPremiumList(email, stripeCustomerId) {
  const { premiumListId } = getACConfig();

  if (!premiumListId) {
    console.log('ActiveCampaign not configured, skipping...');
    return;
  }

  try {
    // Upsert contact so repeat webhook deliveries remain idempotent
    const contactResponse = await acFetch('/api/3/contact/sync', {
      method: 'POST',
      body: JSON.stringify({
        contact: {
          email: normalizeEmail(email),
          fieldValues: [
            {
              field: '1',
              value: String(stripeCustomerId || ''),
            },
          ],
        },
      }),
    });
    if (!contactResponse.ok) {
      const text = await contactResponse.text();
      throw new Error(`Contact sync failed (${contactResponse.status}): ${text}`);
    }

    const contactData = await contactResponse.json();
    const contactId = contactData.contact && contactData.contact.id;
    if (!contactId) {
      throw new Error('Contact sync succeeded but no contact ID was returned');
    }

    // Add to premium list
    const listResponse = await acFetch('/api/3/contactLists', {
      method: 'POST',
      body: JSON.stringify({
        contactList: {
          list: String(premiumListId),
          contact: contactId,
          status: 1,
        },
      }),
    });
    if (!listResponse.ok && listResponse.status !== 409) {
      const text = await listResponse.text();
      throw new Error(`Contact list update failed (${listResponse.status}): ${text}`);
    }

    console.log(`Added ${email} to premium list`);
  } catch (error) {
    console.error('ActiveCampaign error:', error);
  }
}

// Add premium tag
async function addPremiumTag(email, tagName) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  try {
    const contact = await findContactByEmail(normalizedEmail);
    if (!contact || !contact.id) return;

    const tagId = await getOrCreateTagId(tagName);
    const assignments = await getContactTagAssignments(contact.id);
    const alreadyAssigned = assignments.some((assignment) => String(assignment.tag) === String(tagId));
    if (alreadyAssigned) {
      console.log(`Tag ${tagName} already set for ${normalizedEmail}`);
      return;
    }

    const response = await acFetch('/api/3/contactTags', {
      method: 'POST',
      body: JSON.stringify({
        contactTag: {
          contact: String(contact.id),
          tag: String(tagId),
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Add tag failed (${response.status}): ${text}`);
    }

    console.log(`Tagged ${normalizedEmail} with ${tagName}`);
  } catch (error) {
    console.error('Tag error:', error);
  }
}

// Remove premium tag
async function removePremiumTag(email, tagName) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  try {
    const contact = await findContactByEmail(normalizedEmail);
    if (!contact || !contact.id) return;

    const tagId = await findTagIdByName(tagName);
    if (!tagId) {
      console.log(`Tag ${tagName} not found. Nothing to remove for ${normalizedEmail}`);
      return;
    }

    const assignments = await getContactTagAssignments(contact.id);
    const assignment = assignments.find((item) => String(item.tag) === String(tagId));
    if (!assignment || !assignment.id) {
      console.log(`Tag ${tagName} not assigned to ${normalizedEmail}`);
      return;
    }

    const response = await acFetch(`/api/3/contactTags/${assignment.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Remove tag failed (${response.status}): ${text}`);
    }

    console.log(`Removed ${tagName} from ${normalizedEmail}`);
  } catch (error) {
    console.error('Remove tag error:', error);
  }
}
