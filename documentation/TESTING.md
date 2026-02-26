# Testing Guide

Complete guide for testing all features of the Silvousplait system.

## Overview

This guide covers testing:
- Website pages and forms
- Stripe payment integration
- Ticket automation system
- Premium member verification
- ActiveCampaign integration

---

## Part 1: Test Mode Setup

### Enable Test Mode

All testing should be done in **TEST MODE** first to avoid real charges.

1. **Stripe Test Mode**:
   - Use test API keys (pk_test_... and sk_test_...)
   - All payments are simulated
   - No real money is charged

2. **Mock Premium Status**:
   ```env
   USE_MOCK_PREMIUM=true
   ENABLE_PREMIUM_CHECK=true
   ```

3. **Test Email Addresses**:
   - Use `+test` notation: `your email+test@gmail.com`
   - Or use temporary email services

---

## Part 2: Website Testing

### Test All Pages

1. **Homepage** (`index.html`):
   - [ ] Page loads correctly
   - [ ] Hero form is visible
   - [ ] Submit email form works
   - [ ] Bottom signup form works
   - [ ] All links work
   - [ ] Scroll animations work
   - [ ] Mobile menu works

2. **Premium Page** (`premium.html`):
   - [ ] Video background plays
   - [ ] No watermark visible
   - [ ] Pricing card displays correctly
   - [ ] "Accéder aux offres Premium" buttons open modal
   - [ ] Modal closes with X button
   - [ ] Modal closes with ESC key
   - [ ] Modal closes clicking outside
   - [ ] Icons display correctly

3. **Contact Page** (`contact.html`):
   - [ ] Form loads
   - [ ] All fields work
   - [ ] Form submits successfully
   - [ ] Error messages display correctly

4. **FAQ Page** (`faq.html`):
   - [ ] All questions expand/collapse
   - [ ] Scroll animations work
   - [ ] Content readable

5. **Terms & Policy Pages**:
   - [ ] Content loads
   - [ ] Formatting correct
   - [ ] Links work

### Test Navigation

- [ ] Logo links to homepage
- [ ] Premium link goes to premium page
- [ ] Contact link goes to contact page
- [ ] Footer links work
- [ ] Mobile menu opens/closes
- [ ] All page transitions work

### Test Forms

#### Homepage Signup Form

1. **Test Valid Email**:
   ```
   Input: test@example.com
   Expected: Success message
   ```

2. **Test Invalid Email**:
   ```
   Input: notanemail
   Expected: Validation error
   ```

3. **Test Empty Field**:
   ```
   Input: (empty)
   Expected: Required field error
   ```

4. **Test Already Subscribed**:
   ```
   Input: existing@example.com
   Expected: "Vous êtes déjà inscrit" message
   ```

#### Contact Form

1. **Test Complete Form**:
   ```
   Name: Test User
   Email: test@example.com
   Message: This is a test message
   Expected: Success message
   ```

2. **Test Missing Fields**:
   - Try submitting with empty fields
   - Expected: Field validation errors

---

## Part 3: Stripe Payment Testing

### Test Cards

Use these test card numbers:

| Card | Result | Use Case |
|------|--------|----------|
| `4242 4242 4242 4242` | Success | Normal payment |
| `4000 0000 0000 0002` | Declined | Test error handling |
| `4000 0027 6000 3184` | Authentication required | 3D Secure |
| `4000 0000 0000 9995` | Insufficient funds | Failed payment |
| `4000 0000 0000 0069` | Expired card | Expired card error |

**For all test cards:**
- Expiry: Any future date (12/25)
- CVC: Any 3 digits (123)
- ZIP: Any 5 digits (12345)

### Test Payment Flow

#### Test 1: Successful Payment

1. Go to premium page
2. Click "Accéder aux offres Premium"
3. Modal should open
4. *(When Stripe integration is active on page)*:
   - Enter test email: `premium@test.com`
   - Click payment button
   - Use card: `4242 4242 4242 4242`
   - Complete payment
5. **Verify**:
   - [ ] Redirected to success page
   - [ ] Check Stripe Dashboard for subscription
   - [ ] Check ActiveCampaign for new contact with premium tag
   - [ ] Check Netlify function logs (no errors)

#### Test 2: Declined Payment

1. Use card: `4000 0000 0000 0002`
2. **Expected**:
   - Payment fails
   - Error message displayed
   - User stays on payment page
   - No subscription created

#### Test 3: Authentication Required (3D Secure)

1. Use card: `4000 0027 6000 3184`
2. **Expected**:
   - Authentication modal appears
   - Click "Complete" or "Fail"
   - If complete: subscription created
   - If fail: returns to payment page

### Verify Webhook Processing

1. Go to Stripe Dashboard → Webhooks
2. Find your webhook endpoint
3. Check "Attempts" section
4. **Verify**:
   - [ ] `checkout.session.completed` - 200 OK
   - [ ] `customer.subscription.created` - 200 OK
   - [ ] No failed attempts (or investigate errors)

---

## Part 4: Ticket Automation Testing

### Setup Test Environment

1. **Create test CSV**:
   ```csv
   event_name,ticket_number,recipient_email,recipient_name,pdf_url
   Test Concert,TEST-001,test1@example.com,Test User 1,https://example.com/ticket1.pdf
   Test Concert,TEST-002,test2@example.com,Test User 2,https://example.com/ticket2.pdf
   ```

2. **Configure `.env`**:
   ```env
   TICKETS_FILE=test-tickets.csv
   ENABLE_TRACKING=true
   ENABLE_PREMIUM_CHECK=false
   ```

### Test 1: Basic Ticket Sending

```bash
node send-tickets.js
```

**Expected Output**:
```
🎫 Silvousplait Ticket Automation
=================================

🔌 Verifying SMTP connection...
✅ SMTP connection successful!

📂 Reading tickets from: test-tickets.csv
📋 Found 2 tickets to process

⚙️  Feature Status:
  Duplicate Prevention: ✅ Enabled
  Premium Verification: ❌ Disabled
  ...

[1/2]
📧 Processing Ticket #TEST-001 for Test User 1 (test1@example.com)
  📥 Downloading PDF...
  ✅ PDF downloaded (XX KB)
  📨 Sending email via SMTP...
  ✅ Email sent! Message ID: <...>

[2/2]
📧 Processing Ticket #TEST-002 for Test User 2 (test2@example.com)
  ...
```

**Verify**:
- [ ] Emails received in inbox
- [ ] PDF attachments present
- [ ] Email content correct
- [ ] Tracking file created: `tickets-sent.csv`

### Test 2: Duplicate Prevention

1. Run the script twice with same CSV
2. **Expected on second run**:
   ```
   [1/2]
   📧 Processing Ticket #TEST-001...
     ⏭️  Skipping - already sent to test1@example.com
   ```

3. **Verify**:
   - [ ] No duplicate emails sent
   - [ ] Skipped tickets logged
   - [ ] Tracking file updated correctly

### Test 3: Premium Verification

1. **Enable premium check**:
   ```env
   ENABLE_PREMIUM_CHECK=true
   USE_MOCK_PREMIUM=true
   PREMIUM_ONLY=true
   ```

2. **Update test CSV** with mock premium email:
   ```csv
   event_name,ticket_number,recipient_email,recipient_name,pdf_url
   Test Concert,TEST-003,premium@test.com,Premium User,https://example.com/ticket.pdf
   Test Concert,TEST-004,regular@test.com,Regular User,https://example.com/ticket.pdf
   ```

3. **Run script**:
   ```bash
   node send-tickets.js
   ```

4. **Expected**:
   - `premium@test.com` → Email sent (⭐ Premium: Yes)
   - `regular@test.com` → Skipped (⏭️ not a premium member)

### Test 4: Excel File Support

1. **Create Excel file** (`test-tickets.xlsx`):
   - Use Excel template: `tickets-template.xlsx`
   - Fill in test data

2. **Update `.env`**:
   ```env
   TICKETS_FILE=test-tickets.xlsx
   ```

3. **Run script**:
   ```bash
   node send-tickets.js
   ```

4. **Verify**:
   - [ ] Excel file read successfully
   - [ ] Tickets processed
   - [ ] Same functionality as CSV

### Test 5: Error Handling

#### Test Invalid PDF URL

```csv
event_name,ticket_number,recipient_email,recipient_name,pdf_url
Test Event,TEST-ERR-001,test@example.com,Test User,https://invalid-url.com/404.pdf
```

**Expected**:
- Error caught and logged
- Ticket marked as failed
- Script continues with next ticket

#### Test Invalid Email Format

```csv
event_name,ticket_number,recipient_email,recipient_name,pdf_url
Test Event,TEST-ERR-002,not-an-email,Test User,https://example.com/ticket.pdf
```

**Expected**:
- SMTP error caught
- Error message displayed
- Ticket marked as failed

#### Test Missing Required Fields

```csv
event_name,ticket_number,recipient_email,recipient_name,pdf_url
Test Event,,test@example.com,Test User,https://example.com/ticket.pdf
```

**Expected**:
- Validation warning
- Row skipped

---

## Part 5: Integration Testing

### End-to-End Premium Flow

1. **User signs up for free**:
   - Go to homepage
   - Enter email: `e2e-test@example.com`
   - Submit form
   - **Verify**: Contact added to ActiveCampaign

2. **User upgrades to premium**:
   - Go to premium page
   - Click premium button
   - Complete Stripe payment (test card)
   - **Verify**:
     - Payment successful in Stripe
     - Contact tagged as premium in ActiveCampaign
     - Webhook processed successfully

3. **Send premium ticket**:
   - Add user to tickets CSV as premium member
   - Enable premium verification
   - Run send-tickets.js
   - **Verify**:
     - Ticket sent successfully
     - Not skipped (is premium)
     - Tracked in tickets-sent.csv

4. **Cancel subscription**:
   - Go to Stripe Dashboard
   - Cancel test subscription
   - **Verify**:
     - Webhook fires
     - Premium tag removed in ActiveCampaign

---

## Part 6: Performance Testing

### Page Load Speed

Use tools:
- Google PageSpeed Insights
- GTmetrix
- WebPageTest

**Target Metrics**:
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Total Blocking Time: < 200ms
- Cumulative Layout Shift: < 0.1

### Test on Multiple Devices

- [ ] Desktop (Chrome, Firefox, Safari)
- [ ] Mobile (iOS Safari)
- [ ] Mobile (Android Chrome)
- [ ] Tablet (iPad)

### Test Different Screen Sizes

- [ ] 1920x1080 (Desktop)
- [ ] 1366x768 (Laptop)
- [ ] 768x1024 (Tablet)
- [ ] 375x667 (Mobile)

---

## Part 7: Security Testing

### Test Form Validation

- [ ] SQL injection attempts blocked
- [ ] XSS attempts sanitized
- [ ] Honeypot catches bots
- [ ] Rate limiting works (if implemented)

### Test Stripe Security

- [ ] Webhook signature verified
- [ ] API keys not exposed in client code
- [ ] HTTPS enforced
- [ ] No sensitive data in URLs

### Test Environment Variables

- [ ] `.env` not committed to git
- [ ] Secrets not exposed in logs
- [ ] Production keys separate from test

---

## Part 8: Monitoring & Logging

### Check Netlify Function Logs

1. Go to Netlify Dashboard
2. Select site
3. Functions tab
4. Click on function name
5. View logs

**Look for**:
- Successful executions
- Error messages
- Webhook deliveries
- Performance metrics

### Check Stripe Dashboard

- Recent payments
- Failed payments
- Webhook delivery status
- Customer list

### Check ActiveCampaign

- New contacts added
- Tags applied correctly
- List memberships
- Automation triggers

---

## Testing Checklist

### Before Each Release

- [ ] All website pages load
- [ ] All forms work
- [ ] Premium modal functions
- [ ] Stripe test payment succeeds
- [ ] Webhooks process correctly
- [ ] Ticket automation works
- [ ] Duplicate prevention works
- [ ] Premium verification works
- [ ] Excel files supported
- [ ] Mobile responsive
- [ ] No console errors
- [ ] No broken links
- [ ] Analytics tracking works

### Post-Deployment

- [ ] Production Stripe payment test
- [ ] Real webhook delivery test
- [ ] ActiveCampaign integration verified
- [ ] SSL certificate active
- [ ] Domain configured correctly
- [ ] Performance acceptable
- [ ] No 404 errors in logs

---

## Troubleshooting Test Failures

### Stripe Payment Fails in Test

1. Verify test API keys are set
2. Check webhook endpoint URL
3. Review Netlify function logs
4. Ensure price ID is correct
5. Try different test card

### Ticket Sending Fails

1. Verify SMTP credentials
2. Check PDF URL accessibility
3. Review CSV/Excel format
4. Check tracking file permissions
5. Verify network connection

### Premium Verification Fails

1. Check ActiveCampaign API credentials
2. Verify list/tag IDs
3. Test API connection manually
4. Enable mock mode for testing

---

## Continuous Testing

### Automated Monitoring

Set up monitoring to catch issues early:

1. **Uptime Monitoring**:
   - UptimeRobot (free)
   - Pingdom

2. **Error Tracking**:
   - Sentry
   - Rollbar

3. **Synthetic Testing**:
   - Checkly
   - Ghost Inspector

---

## Test Data Cleanup

### After Testing

1. **Stripe**:
   - Archive test customers
   - Clear test subscriptions

2. **ActiveCampaign**:
   - Delete/archive test contacts
   - Remove test tags

3. **Local Files**:
   - Clear `tickets-sent.csv`
   - Delete test CSV/Excel files

---

**Test thoroughly, launch confidently!** 🚀
