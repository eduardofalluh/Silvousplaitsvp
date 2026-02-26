# Silvousplait - Complete System Documentation

Welcome to the complete Silvousplait system! This documentation covers all features of your website and automation tools.

## 🎯 System Overview

Silvousplait is a complete platform for managing cultural events with:
- **Public Website**: User signup, premium membership info
- **Premium Subscriptions**: Stripe-powered monthly/annual subscriptions
- **Ticket Automation**: Automated email delivery with PDF tickets
- **Member Management**: ActiveCampaign integration
- **Smart Features**: Duplicate prevention, premium verification, Excel support

---

## 📁 Project Structure

```
Silvousplaitsvp/
├── index.html                  # Homepage with signup form
├── premium.html                # Premium subscription page
├── contact.html                # Contact form page
├── faq.html                    # FAQ page
├── termes.html                 # Terms of service
├── politique.html              # Privacy policy
├── styles.css                  # Main stylesheet
├── script.js                   # Client-side JavaScript
├
│
├── netlify/
│   └── functions/
│       ├── create-checkout-session.js   # Stripe payment processing
│       ├── stripe-webhook.js            # Handle Stripe events
│       └── submit-signup.js             # Form submission handler
│
├── utils/
│   ├── ticket-tracker.js       # Track sent tickets (prevent duplicates)
│   ├── premium-checker.js      # Verify premium member status
│   └── excel-reader.js         # Read Excel ticket files
│
├── send-tickets.js             # Main ticket automation script
├── tickets-template.csv        # CSV template for tickets
├── tickets-template.xlsx       # Excel template for tickets
├── tickets-sent.csv            # Tracking database (auto-generated)
│
├── documentation/
│   ├── README.md               # This file
│   ├── STRIPE_SETUP.md         # Complete Stripe setup guide
│   ├── DEPLOYMENT.md           # Deployment instructions
│   └── TESTING.md              # Testing guide
│
├── assets/                     # Images, videos, icons
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
└── package.json                # Dependencies
```

---

## 🚀 Quick Start

### For Website Development

1. **Clone repository**:
   ```bash
   git clone git@github.com:eduardofalluh/Silvousplaitsvp.git
   cd Silvousplaitsvp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Open in browser**:
   ```bash
   open index.html
   ```

### For Ticket Automation

1. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. **Prepare ticket file**:
   - Use `tickets-template.csv` or `tickets-template.xlsx`
   - Fill in your ticket data

3. **Run automation**:
   ```bash
   node send-tickets.js
   ```

### For Stripe Integration

1. **Get Stripe test keys**:
   - Go to https://dashboard.stripe.com/test/apikeys
   - Copy pk_test_... and sk_test_...

2. **Set up environment variables** (see [STRIPE_SETUP.md](STRIPE_SETUP.md))

3. **Deploy to Netlify** (see [DEPLOYMENT.md](DEPLOYMENT.md))

---

## 📚 Documentation Guides

### 1. [Stripe Setup Guide](STRIPE_SETUP.md)
Complete step-by-step guide for setting up premium subscriptions with Stripe:
- Creating Stripe account
- Getting API keys
- Creating products and prices
- Setting up webhooks
- Testing payments
- Going live

### 2. [Deployment Guide](DEPLOYMENT.md)
Instructions for deploying to production:
- Netlify deployment
- Domain configuration
- Environment variables
- Testing production
- Monitoring and maintenance

### 3. [Testing Guide](TESTING.md)
Comprehensive testing procedures:
- Website testing
- Payment testing
- Ticket automation testing
- Integration testing
- Performance testing

---

## 🎫 Ticket Automation Features

### Core Features

✅ **Email with PDF Attachments**
- Sends personalized emails with ticket PDFs
- Customizable email templates
- SMTP via ActiveCampaign

✅ **Duplicate Prevention**
- Tracks all sent tickets
- Prevents sending same ticket twice
- CSV-based tracking database

✅ **Premium Member Verification**
- Checks if recipient is premium member
- Can filter to premium-only
- Mock mode for testing

✅ **Excel Support**
- Read both .csv and .xlsx files
- Automatic format detection
- Flexible column mapping

✅ **ActiveCampaign Integration**
- Tracks contacts
- Adds tags
- Updates lists

✅ **Error Handling**
- Catches and logs errors
- Continues processing after failures
- Detailed error reporting

### Usage Example

```bash
# Basic usage
node send-tickets.js

# With environment variables
TICKETS_FILE=premium-tickets.xlsx PREMIUM_ONLY=true node send-tickets.js
```

### Configuration Options

```env
# File to process
TICKETS_FILE=tickets.csv           # or .xlsx

# Feature toggles
ENABLE_TRACKING=true               # Prevent duplicates
ENABLE_PREMIUM_CHECK=false         # Verify premium status
PREMIUM_ONLY=false                 # Only send to premium members
USE_MOCK_PREMIUM=false             # Use test data

# SMTP Settings
SMTP_USER=your_username
SMTP_PASS=your_password
SENDER_EMAIL=contact@silvousplait.com
```

---

## 💳 Stripe Integration Features

### Payment Processing

✅ **Secure Checkout**
- Stripe Checkout hosted pages
- PCI compliant
- 3D Secure support

✅ **Subscription Management**
- Monthly or annual billing
- Automatic renewals
- Proration handling

✅ **Webhook Processing**
- Real-time event handling
- Subscription status tracking
- Failed payment handling

✅ **ActiveCampaign Sync**
- Add premium tag on subscribe
- Remove tag on cancel
- Track in premium list

### Payment Flow

1. User clicks "Accéder aux offres Premium"
2. Modal opens (coming soon message OR payment form)
3. User enters email and payment info
4. Stripe processes payment
5. User redirected back to site
6. Webhook updates ActiveCampaign
7. User receives confirmation email

---

## 🔐 Security Features

### Built-in Security

✅ **Environment Variables**
- All secrets in `.env` file
- Never committed to git
- Separate test/live keys

✅ **Webhook Signature Verification**
- Stripe webhooks verified
- Prevents tampering
- Automatic validation

✅ **Form Validation**
- Client-side validation
- Server-side validation
- Honeypot spam protection

✅ **HTTPS Enforcement**
- SSL certificates via Netlify
- Secure payment processing
- Protected data transmission

---

## 📊 Analytics & Monitoring

### Track Performance

**Website Analytics**:
- Netlify Analytics (built-in)
- Google Analytics (add if needed)

**Payment Metrics**:
- Stripe Dashboard
- MRR (Monthly Recurring Revenue)
- Churn rate
- Failed payments

**Email Metrics**:
- ActiveCampaign reports
- Open rates
- Click rates
- List growth

**Ticket Automation**:
- Tracking database statistics
- Success/failure rates
- Duplicate prevention stats

---

## 🛠️ Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Inter font family
- Responsive design
- Scroll reveal animations

### Backend
- Netlify Functions (serverless)
- Node.js
- Stripe API
- ActiveCampaign API

### Tools & Services
- Stripe (payments)
- ActiveCampaign (CRM & email)
- Netlify (hosting & functions)
- GitHub (version control)

### Libraries
- nodemailer (email sending)
- stripe (Stripe SDK)
- csv-parse (CSV reading)
- xlsx (Excel reading)
- node-fetch (HTTP requests)

---

## 🔧 Configuration

### Environment Variables

See `.env.example` for all available options. Key variables:

```env
# Stripe (Required for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...

# ActiveCampaign (Required for CRM)
ACTIVECAMPAIGN_API_URL=https://...
ACTIVECAMPAIGN_API_KEY=...

# SMTP (Required for ticket emails)
SMTP_USER=...
SMTP_PASS=...
SENDER_EMAIL=contact@silvousplait.com
```

---

## 📈 Scaling Considerations

### Current Limits

**Netlify Free Tier**:
- 100GB bandwidth/month
- 300 build minutes/month
- 125k function requests/month
- Unlimited sites

**Stripe**:
- No limit on transactions
- Pay per successful charge
- 2.9% + $0.30 per transaction

**ActiveCampaign**:
- Based on your plan
- Contact limit varies

### When to Upgrade

- **Netlify Pro** ($19/month):
  - More bandwidth
  - Background functions
  - Better analytics

- **Stripe**:
  - No monthly fee
  - Only pay for transactions

- **ActiveCampaign**:
  - Upgrade as contact list grows

---

## 🐛 Troubleshooting

### Common Issues

**Website not updating**:
1. Clear browser cache
2. Check Netlify deploy status
3. Verify git push succeeded

**Stripe payments failing**:
1. Check API keys (test vs live)
2. Verify webhook is active
3. Check Netlify function logs

**Tickets not sending**:
1. Verify SMTP credentials
2. Check CSV/Excel format
3. Review tracking file
4. Check PDF URLs are accessible

**Premium verification not working**:
1. Check ActiveCampaign API key
2. Verify list/tag IDs
3. Try mock mode first

### Getting Help

1. Check documentation files
2. Review error messages in logs
3. Test in isolation
4. Check external service status pages

---

## 🎯 Roadmap

### Completed Features
- [x] Website with premium page
- [x] Stripe payment integration
- [x] Ticket automation system
- [x] Duplicate prevention
- [x] Premium member verification
- [x] Excel file support
- [x] ActiveCampaign integration
- [x] Comprehensive documentation

### Future Enhancements
- [ ] User dashboard for premium members
- [ ] Self-service subscription management
- [ ] Ticket history/archive
- [ ] Analytics dashboard
- [ ] Automated reminder emails
- [ ] Mobile app (?)

---

## 📝 License & Credits

**Built for**: Silvousplait
**Developer**: Eduardo Falluh
**Tech Stack**: Stripe, Netlify, ActiveCampaign, Node.js

---

## 🤝 Support

For questions or issues:
1. Check documentation files
2. Review TESTING.md for troubleshooting
3. Contact your developer: Eduardo

---

**Ready to launch! 🚀**

Next steps:
1. Review [STRIPE_SETUP.md](STRIPE_SETUP.md) to configure payments
2. Follow [DEPLOYMENT.md](DEPLOYMENT.md) to go live
3. Use [TESTING.md](TESTING.md) to verify everything works

---

*Last updated: 2026-02-26*
