#!/usr/bin/env node

/**
 * Automated Ticket Sender via ActiveCampaign SMTP
 * Reads tickets from CSV and sends emails with PDF attachments
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

// Configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.activehosted.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';
const CSV_FILE = process.env.CSV_FILE || 'tickets.csv';

// Optional: ActiveCampaign API for contact tracking
const AC_API_URL = process.env.AC_API_URL;
const AC_API_KEY = process.env.AC_API_KEY;

// Validate configuration
if (!SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) {
  console.error('❌ Missing required environment variables!');
  console.error('Required: SMTP_USER, SMTP_PASS, SENDER_EMAIL');
  console.error('Optional (for contact tracking): AC_API_URL, AC_API_KEY');
  process.exit(1);
}

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Download PDF from cloud storage URL
 */
async function downloadPDF(url) {
  try {
    console.log(`  📥 Downloading PDF...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    const buffer = await response.buffer();
    console.log(`  ✅ PDF downloaded (${Math.round(buffer.length / 1024)}KB)`);
    return buffer;
  } catch (error) {
    console.error(`  ❌ Error downloading PDF: ${error.message}`);
    throw error;
  }
}

/**
 * Track contact in ActiveCampaign (optional)
 */
async function trackInActiveCampaign(ticket) {
  if (!AC_API_URL || !AC_API_KEY) {
    return null; // Tracking disabled
  }

  const { event_name, ticket_number, recipient_email, recipient_name } = ticket;

  try {
    // Create/sync contact
    const contactData = {
      contact: {
        email: recipient_email,
        firstName: recipient_name.split(' ')[0],
        lastName: recipient_name.split(' ').slice(1).join(' ') || '',
      }
    };

    const contactResponse = await fetch(`${AC_API_URL}/api/3/contact/sync`, {
      method: 'POST',
      headers: {
        'Api-Token': AC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactData),
    });

    if (!contactResponse.ok) {
      throw new Error(`Contact sync failed: ${contactResponse.statusText}`);
    }

    const contactResult = await contactResponse.json();
    const contactId = contactResult.contact.id;

    // Add a tag to track ticket sent
    const tagData = {
      contactTag: {
        contact: contactId,
        tag: 'ticket-sent'
      }
    };

    await fetch(`${AC_API_URL}/api/3/contactTags`, {
      method: 'POST',
      headers: {
        'Api-Token': AC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tagData),
    });

    return contactId;
  } catch (error) {
    console.log(`  ⚠️  Tracking skipped: ${error.message}`);
    return null;
  }
}

/**
 * Send email with PDF attachment via SMTP
 */
async function sendTicketEmail(ticket) {
  const { event_name, ticket_number, recipient_email, recipient_name, pdf_url } = ticket;

  console.log(`\n📧 Processing Ticket #${ticket_number} for ${recipient_name} (${recipient_email})`);

  try {
    // Download the PDF
    const pdfBuffer = await downloadPDF(pdf_url);

    // Track in ActiveCampaign (optional)
    if (AC_API_URL && AC_API_KEY) {
      console.log(`  👤 Tracking in ActiveCampaign...`);
      await trackInActiveCampaign(ticket);
    }

    // Prepare email
    const emailSubject = `Votre billet pour ${event_name}`;
    const emailBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Bonjour ${recipient_name},</h2>
          <p>Voici votre billet pour <strong>${event_name}</strong>.</p>
          <p>Vous trouverez votre billet en pièce jointe de cet email.</p>
          <p>Nous avons hâte de vous voir au spectacle!</p>
          <br>
          <p>Cordialement,<br>${SENDER_NAME}</p>
        </body>
      </html>
    `;

    const mailOptions = {
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: recipient_email,
      subject: emailSubject,
      html: emailBody,
      attachments: [
        {
          filename: `Billet-${ticket_number}-${event_name.replace(/[^a-z0-9]/gi, '-')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    // Send email
    console.log(`  📨 Sending email via SMTP...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`  ✅ Email sent! Message ID: ${info.messageId}`);

    return {
      success: true,
      ticket_number,
      recipient_email,
      messageId: info.messageId
    };

  } catch (error) {
    console.error(`  ❌ Error processing ticket #${ticket_number}: ${error.message}`);
    return {
      success: false,
      ticket_number,
      recipient_email,
      error: error.message
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🎫 Silvousplait Ticket Automation');
  console.log('=================================\n');

  // Verify SMTP connection
  try {
    console.log('🔌 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
  } catch (error) {
    console.error('❌ SMTP connection failed:', error.message);
    console.error('Please check your SMTP credentials in .env file\n');
    process.exit(1);
  }

  // Check if CSV file exists
  const csvPath = path.resolve(CSV_FILE);
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.error('Please create a CSV file with ticket data.');
    console.error('Use tickets-template.csv as a reference.\n');
    process.exit(1);
  }

  // Read and parse CSV
  console.log(`📂 Reading tickets from: ${csvPath}\n`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const tickets = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`📋 Found ${tickets.length} tickets to process\n`);

  if (tickets.length === 0) {
    console.log('No tickets to process. Exiting.\n');
    process.exit(0);
  }

  // Confirm before sending
  console.log('⚠️  About to send emails to:');
  tickets.forEach(t => {
    console.log(`   - ${t.recipient_name} (${t.recipient_email}) - Ticket #${t.ticket_number}`);
  });
  console.log('');

  // Process each ticket
  const results = [];
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    console.log(`[${i + 1}/${tickets.length}]`);
    const result = await sendTicketEmail(ticket);
    results.push(result);

    // Add a small delay between emails to avoid rate limiting
    if (i < tickets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n=================================');
  console.log('📊 Processing Summary:');
  console.log('=================================');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📧 Total: ${results.length}`);

  if (failed > 0) {
    console.log('\n❌ Failed tickets:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - Ticket #${r.ticket_number} (${r.recipient_email}): ${r.error}`);
    });
  }

  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
