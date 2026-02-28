# Ticket Automation Setup Guide

This guide will help you set up the automated ticket sending system for Silvousplait events.

## Overview

The ticket automation system:
- Reads ticket data from a CSV file
- Downloads PDF tickets from cloud storage (Google Drive, Dropbox, etc.)
- Sends personalized emails with PDF attachments via ActiveCampaign SMTP
- Optionally tracks contacts in ActiveCampaign

## Prerequisites

1. **ActiveCampaign Account** with:
   - SMTP credentials (for sending emails with attachments)
   - API credentials (optional, for contact tracking)

2. **PDF Tickets** stored in cloud storage:
   - Google Drive (public or shareable links)
   - Dropbox (direct download links)
   - Or any other accessible URL

3. **Node.js** installed (version 14 or higher)

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- `csv-parse` - for reading CSV files
- `dotenv` - for environment variables
- `node-fetch` - for downloading PDFs
- `nodemailer` - for sending emails with attachments
- `xlsx` - for Excel support (if needed)

### Step 2: Get Your ActiveCampaign SMTP Credentials

1. Log into your ActiveCampaign account
2. Go to **Settings** → **Advanced** → **SMTP**
3. Note down:
   - SMTP Host: `smtp.activehosted.com`
   - SMTP Port: `587`
   - Username: Your SMTP username
   - Password: Your SMTP password

### Step 3: (Optional) Get Your ActiveCampaign API Credentials

For contact tracking:

1. Go to **Settings** → **Developer**
2. Note down:
   - API URL: `https://youraccountname.api-us1.com`
   - API Key: Your API key

### Step 4: Configure Environment Variables

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your credentials:
   ```env
   # Required
   SMTP_HOST=smtp.activehosted.com
   SMTP_PORT=587
   SMTP_USER=your_smtp_username_here
   SMTP_PASS=your_smtp_password_here
   SENDER_EMAIL=contact@silvousplait.com
   SENDER_NAME=Silvousplait

   # Optional (for contact tracking)
   ACTIVECAMPAIGN_API_URL=https://youraccountname.api-us1.com
   ACTIVECAMPAIGN_API_KEY=your_api_key_here
   ACTIVECAMPAIGN_TICKET_SENT_TAG=ticket-sent

   # Tickets file path
   TICKETS_FILE=tickets.csv
   ```

3. **IMPORTANT**: Never commit the `.env` file to git (it's already in `.gitignore`)

### Step 5: Prepare Your PDF Tickets

#### Option A: Google Drive

1. Upload PDFs to Google Drive
2. Right-click each PDF → **Get link** → **Anyone with the link can view**
3. Copy the file ID from the URL:
   - URL: `https://drive.google.com/file/d/1ABC123xyz/view`
   - File ID: `1ABC123xyz`
4. Use this format in CSV: `https://drive.google.com/uc?export=download&id=1ABC123xyz`

#### Option B: Dropbox

1. Upload PDFs to Dropbox
2. Right-click each PDF → **Share** → **Create link**
3. Change the link from `?dl=0` to `?dl=1` at the end
   - Original: `https://www.dropbox.com/s/abc123/ticket.pdf?dl=0`
   - Use: `https://www.dropbox.com/s/abc123/ticket.pdf?dl=1`

#### Option C: Other Cloud Storage

Any publicly accessible URL that directly downloads the PDF will work.

### Step 6: Create Your Tickets CSV File

1. Use `tickets-template.csv` as a reference
2. Create your own `tickets.csv` file with this structure:

```csv
event_name,ticket_number,recipient_email,recipient_name,pdf_url
SHOW XYZ - 2026-03-15,1,client1@example.com,Jean Dupont,https://drive.google.com/uc?export=download&id=YOUR_FILE_ID
SHOW XYZ - 2026-03-15,2,client2@example.com,Marie Martin,https://drive.google.com/uc?export=download&id=YOUR_FILE_ID
```

**Columns:**
- `event_name`: Name and date of the event
- `ticket_number`: Unique ticket number
- `recipient_email`: Email address of the recipient
- `recipient_name`: Full name of the recipient
- `pdf_url`: Direct download URL for the PDF ticket

---

## Usage

### Send All Tickets

```bash
npm run send-tickets
```

or

```bash
node send-tickets.js
```

The script will:
1. ✅ Verify SMTP connection
2. 📂 Read the CSV file
3. 📧 Process each ticket (download PDF, send email)
4. 📊 Show a summary of results

### Expected Output

```
🎫 Silvousplait Ticket Automation
=================================

🔌 Verifying SMTP connection...
✅ SMTP connection successful!

📂 Reading tickets from: /path/to/tickets.csv

📋 Found 5 tickets to process

⚠️  About to send emails to:
   - Jean Dupont (client1@example.com) - Ticket #1
   - Marie Martin (client2@example.com) - Ticket #2
   ...

[1/5]
📧 Processing Ticket #1 for Jean Dupont (client1@example.com)
  📥 Downloading PDF...
  ✅ PDF downloaded (245KB)
  👤 Tracking in ActiveCampaign...
  📨 Sending email via SMTP...
  ✅ Email sent! Message ID: <abc123@silvousplait.com>

...

=================================
📊 Processing Summary:
=================================
✅ Successful: 5
❌ Failed: 0
📧 Total: 5

✨ Done!
```

---

## Customization

### Customize Email Template

Edit [send-tickets.js:152-160](send-tickets.js#L152-L160) to change the email content:

```javascript
const emailSubject = `Votre billet pour ${event_name}`;
const emailBody = `
  <html>
    <body style="font-family: Arial, sans-serif;">
      <h2>Bonjour ${recipient_name},</h2>
      <p>Your custom message here...</p>
    </body>
  </html>
`;
```

### Customize PDF Filename

Edit [send-tickets.js:168](send-tickets.js#L168) to change how PDF attachments are named:

```javascript
filename: `Billet-${ticket_number}-${event_name.replace(/[^a-z0-9]/gi, '-')}.pdf`,
```

### Adjust Delay Between Emails

Edit [send-tickets.js:235](send-tickets.js#L235) to change the delay (default: 2 seconds):

```javascript
await new Promise(resolve => setTimeout(resolve, 2000)); // 2000ms = 2 seconds
```

---

## Troubleshooting

### Error: "SMTP connection failed"

**Solution:**
1. Verify your SMTP credentials in `.env`
2. Make sure you're using ActiveCampaign SMTP credentials (not API credentials)
3. Check that SMTP is enabled in your ActiveCampaign account

### Error: "Failed to download PDF"

**Solution:**
1. Verify the PDF URL is publicly accessible
2. For Google Drive: Make sure link sharing is set to "Anyone with the link"
3. For Dropbox: Make sure the URL ends with `?dl=1` (not `?dl=0`)
4. Test the URL in your browser to confirm it downloads

### Error: "CSV file not found"

**Solution:**
1. Make sure `tickets.csv` exists in the project directory
2. Or set `TICKETS_FILE` in `.env` to point to your file
3. Check the file path is correct

### Emails Not Being Received

**Solution:**
1. Check spam/junk folder
2. Verify sender email is not blacklisted
3. Make sure recipient email addresses are correct
4. Check ActiveCampaign sending limits
5. Review ActiveCampaign's email logs in the dashboard

### Rate Limiting Issues

**Solution:**
1. Increase delay between emails (edit line 235 in send-tickets.js)
2. Process tickets in smaller batches
3. Check ActiveCampaign account sending limits

---

## Best Practices

1. **Test First**: Send to your own email address before sending to clients
2. **Backup**: Keep a backup of your CSV file before running the script
3. **Small Batches**: For large events, process tickets in batches
4. **Verify PDFs**: Make sure all PDF links work before running
5. **Monitor**: Watch the script output for any errors
6. **Logs**: ActiveCampaign keeps email logs - check them if issues arise

---

## Advanced: Scheduling Emails

If you need to send tickets at specific times, you can:

### Option 1: Use System Cron (Mac/Linux)

```bash
# Edit crontab
crontab -e

# Add a line to run at specific time (example: daily at 9 AM)
0 9 * * * cd /path/to/project && /usr/local/bin/node send-tickets.js >> /path/to/log.txt 2>&1
```

### Option 2: Use Windows Task Scheduler

1. Open Task Scheduler
2. Create New Task
3. Set trigger (time/date)
4. Set action: Run `node send-tickets.js`

### Option 3: Add to CSV and Use node-cron

Modify the CSV to include a `send_time` column and update the script to use `node-cron` for scheduling.

---

## Support

If you encounter issues:

1. Check this documentation
2. Review the script output for error messages
3. Verify all configuration in `.env`
4. Test with a single ticket first
5. Check ActiveCampaign's SMTP/API documentation

---

## Security Notes

- **Never commit `.env` to git** - it contains sensitive credentials
- Store SMTP passwords securely
- Use environment variables for all sensitive data
- Regularly rotate API keys and passwords
- Keep PDF links private when possible (use expiring links if available)

---

## Files Reference

- `send-tickets.js` - Main automation script
- `tickets.csv` - Your ticket data (create from template)
- `tickets-template.csv` - Example CSV structure
- `.env` - Your configuration (copy from `.env.example`)
- `.env.example` - Configuration template
- `package.json` - Project dependencies
