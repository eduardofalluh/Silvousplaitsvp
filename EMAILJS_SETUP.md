# EmailJS Setup Guide

## How to Set Up EmailJS for Contact Form

The contact form uses EmailJS to send emails directly from the browser without a backend server. Here's how to set it up:

### Step 1: Create an EmailJS Account

1. Go to https://www.emailjs.com/
2. Sign up for a free account (allows 200 emails/month for free)
3. Verify your email address

### Step 2: Create an Email Service

1. In your EmailJS dashboard, go to "Email Services"
2. Click "Add New Service"
3. Choose your email provider (Gmail, Outlook, etc.)
4. Follow the setup instructions to connect your email account
5. **Note down your Service ID** (e.g., `service_xxxxxxx`)

### Step 3: Create an Email Template

1. Go to "Email Templates" in the dashboard
2. Click "Create New Template"
3. Use this template structure:

**Template Name:** Contact Form

**Subject:** Nouveau message de contact - {{subject}}

**Content:**
```
Nouveau message reçu depuis le site Silvousplait

Nom: {{from_name}}
Email: {{from_email}}
Sujet: {{subject}}

Message:
{{message}}

---
Cet email a été envoyé depuis le formulaire de contact du site web.
```

**Note:** For testing, emails are currently set to go to `eduardofalluh@gmail.com`. Once testing is complete, you can change the `to_email` value in `contact.html` (line 88) back to `spectacles@silvousplaitsvp.com`.

4. **Note down your Template ID** (e.g., `template_xxxxxxx`)

### Step 4: Get Your Public Key

1. Go to "Account" → "General"
2. Find your "Public Key"
3. **Note down your Public Key** (e.g., `xxxxxxxxxxxxx`)

### Step 5: Update contact.html

Open `contact.html` and replace these three values:

1. **Line 15:** Replace `YOUR_PUBLIC_KEY` with your EmailJS Public Key
2. **Line 16:** Replace `YOUR_PUBLIC_KEY` with your EmailJS Public Key (in the emailjs.init function)
3. **Line 88:** Replace `YOUR_SERVICE_ID` with your Service ID
4. **Line 89:** Replace `YOUR_TEMPLATE_ID` with your Template ID

### Example:

```javascript
// Line 15
emailjs.init("abc123xyz789"); // Your Public Key

// Line 88-89
emailjs.send('service_abc123', 'template_xyz789', {
  // ... form data
})
```

### Step 6: Test the Form

1. Open `contact.html` in your browser
2. Fill out the form and submit
3. Check your email inbox (spectacles@silvousplaitsvp.com) for the message

### Important Notes:

- **Free Plan Limits:** 200 emails/month
- **Email Delivery:** Emails will be sent directly to spectacles@silvousplaitsvp.com
- **No Backend Required:** Everything works from the browser
- **Spam Protection:** EmailJS includes basic spam protection

### Troubleshooting:

- If emails don't arrive, check your spam folder
- Verify all IDs are correct in contact.html
- Check the browser console for any error messages
- Make sure your email service is properly connected in EmailJS dashboard

### Alternative: Formspree

If you prefer a different service, you can use Formspree instead:
1. Sign up at https://formspree.io/
2. Create a form endpoint
3. Update the form action in contact.html

