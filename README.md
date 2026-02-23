# Silvousplaitsvp

Landing page and ticket automation for Silvousplait events.

## Features

- **Landing Page**: Email signup with ActiveCampaign integration
- **Ticket Automation**: Automated email sending with PDF ticket attachments

## Ticket Automation

> **Note:** The files below are a backup/alternative solution. The primary automation is being handled via Zapier integration (in progress by Fiverr freelancer).

Send event tickets automatically via email with PDF attachments.

### Quick Start

```bash
# Install dependencies
npm install

# Configure credentials
cp .env.example .env
# Edit .env with your ActiveCampaign SMTP credentials

# Create your tickets CSV file
# Use tickets-template.csv as reference

# Send tickets
npm run send-tickets
```

📖 **[Full Setup Guide](TICKET_AUTOMATION_SETUP.md)**

## Project Structure

```
├── send-tickets.js           # Ticket automation script
├── tickets-template.csv      # CSV template for ticket data
├── TICKET_AUTOMATION_SETUP.md # Complete setup guide
├── index.html                # Landing page
├── netlify/functions/        # Netlify serverless functions
└── assets/                   # Images and scripts
```
