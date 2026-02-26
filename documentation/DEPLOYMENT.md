# Deployment Guide

Complete guide for deploying Silvousplait with all features enabled.

## Overview

Your Silvousplait site includes:
- ✅ Static website (HTML/CSS/JS)
- ✅ Netlify Functions (Stripe payment processing)
- ✅ Ticket automation system (send-tickets.js)
- ✅ ActiveCampaign integration

---

## Prerequisites

- GitHub account
- Netlify account
- Domain name (optional but recommended)
- Stripe account (for premium subscriptions)
- ActiveCampaign account
- Node.js installed locally (for ticket automation)

---

## Part 1: Deploy Website to Netlify

### Option A: Deploy from GitHub (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Netlify**:
   - Go to https://app.netlify.com
   - Click **"Add new site"** → **"Import an existing project"**
   - Choose **"Deploy with GitHub"**
   - Authorize Netlify to access your GitHub account
   - Select your repository: `Silvousplaitsvp`

3. **Configure build settings**:
   - **Build command**: *(leave empty)*
   - **Publish directory**: `.` (root directory)
   - Click **"Deploy site"**

4. **Wait for deployment** (usually takes 1-2 minutes)

### Option B: Manual Deploy

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Deploy:
   ```bash
   netlify deploy --prod
   ```

---

## Part 2: Configure Environment Variables

### Add Variables in Netlify Dashboard

1. Go to your site in Netlify
2. **Site settings** → **Environment variables**
3. Click **"Add a variable"**
4. Add each variable below:

#### Required for Stripe Payments

```
STRIPE_PUBLISHABLE_KEY=pk_test_your_key
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
STRIPE_PREMIUM_PRICE_ID=price_your_price_id
URL=https://your-site.netlify.app
```

#### Required for ActiveCampaign

```
ACTIVECAMPAIGN_API_URL=https://youraccountname.api-us1.com
ACTIVECAMPAIGN_API_KEY=your_api_key
ACTIVECAMPAIGN_PREMIUM_LIST_ID=your_list_id
ACTIVECAMPAIGN_PREMIUM_TAG=premium_active
```

5. Click **"Save"**
6. **Redeploy** the site for changes to take effect

---

## Part 3: Set Up Custom Domain (Optional)

### Add Custom Domain

1. In Netlify: **Domain settings** → **Add custom domain**
2. Enter your domain: `silvousplaitsvp.com`
3. Follow DNS configuration instructions:

   **If using Netlify DNS** (recommended):
   - Update nameservers at your registrar
   - Netlify handles everything automatically

   **If using external DNS**:
   - Add A record: `104.198.14.52`
   - Add CNAME record: `www` → `your-site.netlify.app`

4. Enable HTTPS (automatic with Netlify)

---

## Part 4: Configure Stripe Webhooks

### Create Production Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"+ Add endpoint"**
3. Enter endpoint URL:
   ```
   https://silvousplaitsvp.com/.netlify/functions/stripe-webhook
   ```

4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

5. Copy webhook signing secret
6. Update `STRIPE_WEBHOOK_SECRET` in Netlify

---

## Part 5: Test Production Deployment

### Run Full Integration Test

1. **Test Premium Page**:
   - Visit: `https://silvousplaitsvp.com/premium.html`
   - Click "Accéder aux offres Premium"
   - Modal should open

2. **Test Form Submission** (index page):
   - Enter email on homepage
   - Submit form
   - Check ActiveCampaign for new contact

3. **Test Stripe Payment** (use test mode):
   - Go to premium page
   - Use test card: `4242 4242 4242 4242`
   - Complete payment
   - Verify success redirect
   - Check Stripe Dashboard for subscription
   - Check ActiveCampaign for premium tag

4. **Test Navigation**:
   - All menu links work
   - Pages load correctly
   - Premium modal appears on both pages

---

## Part 6: Set Up Ticket Automation (Local Computer)

The ticket automation runs on **your local computer** (not on Netlify).

### Initial Setup

1. **Clone repository** (if not already):
   ```bash
   git clone git@github.com:eduardofalluh/Silvousplaitsvp.git
   cd Silvousplaitsvp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. **Configure `.env`**:
   ```env
   # SMTP (from ActiveCampaign)
   SMTP_USER=your_smtp_username
   SMTP_PASS=your_smtp_password
   SENDER_EMAIL=contact@silvousplait.com

   # ActiveCampaign API
   ACTIVECAMPAIGN_API_URL=https://youraccountname.api-us1.com
   ACTIVECAMPAIGN_API_KEY=your_api_key

   # Features
   ENABLE_TRACKING=true
   ENABLE_PREMIUM_CHECK=false
   TICKETS_FILE=tickets.csv
   ```

### Running Ticket Automation

1. **Prepare your ticket file**:
   - Use `tickets-template.csv` or `tickets-template.xlsx`
   - Fill in ticket data

2. **Run the script**:
   ```bash
   node send-tickets.js
   ```

3. **Monitor progress**:
   - Script shows real-time progress
   - Check for errors
   - Verify emails sent

---

## Part 7: Go Live Checklist

### Before Launching

- [ ] Test all forms with real email addresses
- [ ] Test Stripe payment with test cards
- [ ] Verify ActiveCampaign integration works
- [ ] Check all pages load correctly
- [ ] Test on mobile devices
- [ ] Verify SSL certificate is active (HTTPS)
- [ ] Test webhook delivery in Stripe
- [ ] Review Netlify function logs for errors

### Switch to Live Mode

1. **Update Stripe to Live Keys**:
   - Get live API keys from Stripe
   - Update Netlify environment variables
   - Update webhook endpoint to live mode
   - Remove test mode references

2. **Update ActiveCampaign**:
   - Verify production list IDs
   - Test with real contact

3. **Final Deployment**:
   ```bash
   git add .
   git commit -m "Go live"
   git push origin main
   ```

4. **Monitor**:
   - Watch Netlify deploy logs
   - Check Stripe Dashboard
   - Monitor ActiveCampaign for new contacts

---

## Ongoing Maintenance

### Regular Tasks

**Weekly**:
- Check Netlify function logs for errors
- Review failed payments in Stripe
- Monitor ActiveCampaign contact growth

**Monthly**:
- Review Stripe subscription metrics
- Update npm dependencies: `npm update`
- Check for Netlify platform updates

**As Needed**:
- Run ticket automation when needed
- Respond to failed payment webhooks
- Update content on website

---

## Troubleshooting

### Site Not Updating

1. Check Netlify deploy status
2. Clear browser cache
3. Verify git push succeeded
4. Check Netlify deploy logs

### Stripe Payments Failing

1. Verify API keys are correct
2. Check webhook is active
3. Review Netlify function logs
4. Test with Stripe test cards

### Emails Not Sending

1. Verify SMTP credentials
2. Check send-tickets.js for errors
3. Verify CSV/Excel format
4. Check tracking file (tickets-sent.csv)

### ActiveCampaign Not Tracking

1. Verify API credentials
2. Check list/tag IDs
3. Review Netlify function logs
4. Test API connection manually

---

## Monitoring & Analytics

### Netlify Analytics

- View in Netlify Dashboard
- Track page views, unique visitors
- Monitor bandwidth usage

### Stripe Dashboard

- Track MRR (Monthly Recurring Revenue)
- Monitor churn rate
- Review failed payments

### ActiveCampaign Reports

- Track email open rates
- Monitor list growth
- Track premium member count

---

## Backup Strategy

### What to Backup

1. **Code** (already on GitHub):
   - Automatic backup
   - Version controlled

2. **Environment Variables**:
   - Keep secure copy offline
   - Document all variables

3. **Ticket Tracking Data**:
   - Backup `tickets-sent.csv` weekly
   - Store in secure location

4. **ActiveCampaign Data**:
   - Export contacts monthly
   - Keep backup of custom fields

---

## Rollback Procedure

### If Something Breaks

1. **Quick Rollback**:
   ```bash
   # In Netlify Dashboard
   Deploys → Click on previous successful deploy → Publish deploy
   ```

2. **Revert Code**:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Restore Environment Variables**:
   - Use backup copy
   - Re-add in Netlify Dashboard

---

## Cost Breakdown

**Monthly Costs**:
- Netlify: $0 (Free tier)
- Domain: ~$15/year = $1.25/month
- Stripe fees: 2.9% + $0.30 per transaction
- ActiveCampaign: Your existing plan

**Example**: With 10 premium subscribers at $60/year each:
- Revenue: $600/year
- Stripe fees: ~$20/year
- Net: ~$580/year

---

## Support Resources

- **Netlify Docs**: https://docs.netlify.com
- **Stripe Docs**: https://stripe.com/docs
- **ActiveCampaign Docs**: https://help.activecampaign.com
- **Node.js Docs**: https://nodejs.org/docs

---

**Your site is now live!** 🎉

Monitor the dashboards and respond to any issues promptly.
