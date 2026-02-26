# Stripe Integration Setup Guide

This guide will help you set up Stripe payments for Silvousplait Premium subscriptions.

## Overview

The Stripe integration allows users to subscribe to Silvousplait Premium directly from your website. When a user completes payment:
1. They are added to ActiveCampaign as a premium member
2. They receive access to premium features
3. You can track their subscription status

## Prerequisites

- A Stripe account (https://stripe.com)
- A Netlify account (for hosting the serverless functions)
- ActiveCampaign account (for member management)

---

## Step 1: Create a Stripe Account

1. Go to https://dashboard.stripe.com/register
2. Complete the registration
3. Verify your email and business details

---

## Step 2: Get Your Stripe API Keys

### For Testing (Recommended First)

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Publishable key** (starts with `pk_test_...`)
3. Copy your **Secret key** (starts with `sk_test_...`)
4. Add these to your `.env` file:

```env
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

### For Production (Go Live)

1. Complete Stripe account activation
2. Go to https://dashboard.stripe.com/apikeys
3. Copy your **Live** keys (start with `pk_live_...` and `sk_live_...`)
4. Replace test keys in `.env` with live keys

---

## Step 3: Create a Stripe Product and Price

1. Go to https://dashboard.stripe.com/test/products
2. Click **"+ Add product"**
3. Fill in:
   - **Name**: "Silvousplait Premium"
   - **Description**: "Accès à des spectacles exclusifs et des avantages premium"
   - **Pricing model**: Recurring
   - **Price**: $5.00 CAD
   - **Billing period**: Monthly (facturé annuellement = 12 months × $5 = $60/year)

   **OR if charging annually:**
   - **Price**: $60.00 CAD
   - **Billing period**: Yearly

4. Click **"Save product"**
5. Copy the **Price ID** (starts with `price_...`)
6. Add it to `.env`:

```env
STRIPE_PREMIUM_PRICE_ID=price_your_price_id_here
```

---

## Step 4: Set Up Stripe Webhooks

Webhooks allow Stripe to notify your site when payments succeed, fail, or subscriptions change.

### Create Webhook Endpoint

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **"+ Add endpoint"**
3. Enter your endpoint URL:
   ```
   https://silvousplaitsvp.com/.netlify/functions/stripe-webhook
   ```

   **Note**: Replace `silvousplaitsvp.com` with your actual domain

4. Select these events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

5. Click **"Add endpoint"**
6. Click on the webhook you just created
7. Copy the **Signing secret** (starts with `whsec_...`)
8. Add it to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

---

## Step 5: Deploy to Netlify

### Add Environment Variables to Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Add the following variables:
   ```
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PREMIUM_PRICE_ID=price_...
   URL=https://silvousplaitsvp.com
   ```

5. Click **"Save"**
6. **Redeploy your site** for changes to take effect

---

## Step 6: Test the Integration

### Test with Stripe Test Cards

Use these test card numbers in Stripe's test mode:

| Card Number | Result |
|------------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Card declined |
| `4000 0027 6000 3184` | Requires authentication (3D Secure) |

**For all test cards:**
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3 digits (e.g., 123)
- ZIP: Any 5 digits (e.g., 12345)

### Test the Full Flow

1. Go to your premium page: `https://silvousplaitsvp.com/premium.html`
2. Click **"Accéder aux offres Premium"**
3. Enter a test email: `test@example.com`
4. Use test card: `4242 4242 4242 4242`
5. Complete the payment
6. Verify:
   - You're redirected back to your site
   - Check Stripe Dashboard for the subscription
   - Check ActiveCampaign for the new premium member

---

## Step 7: Go Live

When ready to accept real payments:

1. Complete Stripe account activation
2. Update `.env` with **live** API keys
3. Create a **live** webhook endpoint
4. Update Netlify environment variables with live keys
5. Test with a small real payment first
6. Monitor your Stripe Dashboard

---

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook endpoint URL is correct
2. Verify webhook is enabled in Stripe Dashboard
3. Check Netlify function logs for errors
4. Test webhook with Stripe CLI:
   ```bash
   stripe listen --forward-to https://your-site.com/.netlify/functions/stripe-webhook
   ```

### Payment Succeeds but User Not Added to ActiveCampaign

1. Verify ActiveCampaign API credentials are set
2. Check Netlify function logs for API errors
3. Verify premium list ID exists in ActiveCampaign

### Users Can't Complete Payment

1. Check that Stripe keys match (test vs live)
2. Verify price ID is correct
3. Check browser console for JavaScript errors
4. Verify Netlify functions are deployed

---

## Stripe Dashboard Quick Links

- **Test Mode Dashboard**: https://dashboard.stripe.com/test/dashboard
- **Live Mode Dashboard**: https://dashboard.stripe.com/dashboard
- **API Keys**: https://dashboard.stripe.com/apikeys
- **Products**: https://dashboard.stripe.com/products
- **Webhooks**: https://dashboard.stripe.com/webhooks
- **Subscriptions**: https://dashboard.stripe.com/subscriptions
- **Customers**: https://dashboard.stripe.com/customers

---

## Security Best Practices

1. **Never commit `.env` file** - It contains secret keys
2. **Use test mode** during development
3. **Verify webhook signatures** - Already implemented in code
4. **Keep Stripe.js library up to date**
5. **Monitor failed payments** in Stripe Dashboard
6. **Set up Stripe fraud detection** (Radar)

---

## Cost Breakdown

Stripe fees for Canadian transactions:
- **2.9% + $0.30 CAD** per successful charge
- No monthly fees
- No setup fees

For a $60/year subscription:
- Stripe fee: $2.04
- Your revenue: $57.96

---

## Support

- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- This project's GitHub: [Your GitHub repo]

---

**Ready to activate premium subscriptions!** 🚀
