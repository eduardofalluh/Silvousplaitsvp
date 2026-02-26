#!/usr/bin/env node

/**
 * Automated Ticket Sender via ActiveCampaign SMTP
 * Reads tickets from CSV/Excel and sends emails with PDF attachments
 * Now with: Duplicate prevention, Premium verification, Excel support
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

// Import new utilities
const ticketTracker = require('./utils/ticket-tracker');
const premiumChecker = require('./utils/premium-checker');
const excelReader = require('./utils/excel-reader');

// Configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.activehosted.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || 'Silvousplait';
const TICKETS_FILE = process.env.TICKETS_FILE || 'tickets.csv';

// New features (can be disabled)
const ENABLE_TRACKING = process.env.ENABLE_TRACKING !== 'false'; // Default: enabled
const ENABLE_PREMIUM_CHECK = process.env.ENABLE_PREMIUM_CHECK === 'true'; // Default: disabled
const PREMIUM_ONLY = process.env.PREMIUM_ONLY === 'true'; // Default: disabled
const USE_MOCK_PREMIUM = process.env.USE_MOCK_PREMIUM === 'true'; // Default: disabled

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
    // Check if already sent (duplicate prevention)
    if (ENABLE_TRACKING && ticketTracker.isTicketSent(ticket_number, recipient_email)) {
      console.log(`  ⏭️  Skipping - already sent to ${recipient_email}`);
      return {
        success: false,
        ticket_number,
        recipient_email,
        skipped: true,
        reason: 'already_sent'
      };
    }

    // Check premium status if enabled
    if (ENABLE_PREMIUM_CHECK) {
      console.log(`  🔍 Checking premium status...`);
      const premiumStatus = await premiumChecker.isPremiumMember(recipient_email, USE_MOCK_PREMIUM);

      if (PREMIUM_ONLY && !premiumStatus.isPremium) {
        console.log(`  ⏭️  Skipping - not a premium member`);
        return {
          success: false,
          ticket_number,
          recipient_email,
          skipped: true,
          reason: 'not_premium'
        };
      }

      console.log(`  ${premiumStatus.isPremium ? '⭐' : '🆓'} Premium: ${premiumStatus.isPremium ? 'Yes' : 'No'}`);
    }

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

    // Mark as sent in tracking system
    if (ENABLE_TRACKING) {
      ticketTracker.markTicketSent(ticket_number, recipient_email, event_name);
    }

    return {
      success: true,
      ticket_number,
      recipient_email,
      messageId: info.messageId
    };

  } catch (error) {
    console.error(`  ❌ Error processing ticket #${ticket_number}: ${error.message}`);

    // Mark as failed in tracking system
    if (ENABLE_TRACKING) {
      ticketTracker.markTicketFailed(ticket_number, recipient_email, event_name);
    }

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

  // Check if file exists
  const filePath = path.resolve(TICKETS_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error('Please create a CSV or Excel file with ticket data.');
    console.error('Use tickets-template.csv or tickets-template.xlsx as a reference.\n');
    process.exit(1);
  }

  // Read and parse file (CSV or Excel)
  let tickets = [];
  const fileExt = path.extname(filePath).toLowerCase();

  console.log(`📂 Reading tickets from: ${filePath}`);

  if (fileExt === '.xlsx' || fileExt === '.xls') {
    console.log('📊 Detected Excel file format\n');
    tickets = excelReader.readExcelFile(filePath);
  } else {
    console.log('📄 Detected CSV file format\n');
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    tickets = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  }

  console.log(`📋 Found ${tickets.length} tickets to process\n`);

  // Show feature status
  console.log('⚙️  Feature Status:');
  console.log(`  Duplicate Prevention: ${ENABLE_TRACKING ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  Premium Verification: ${ENABLE_PREMIUM_CHECK ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  Premium Only Mode: ${PREMIUM_ONLY ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  ActiveCampaign Tracking: ${AC_API_URL && AC_API_KEY ? '✅ Enabled' : '❌ Disabled'}`);
  console.log('');

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
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success && !r.skipped).length;

  console.log(`✅ Successful: ${successful}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📧 Total: ${results.length}`);

  if (skipped > 0) {
    console.log('\n⏭️  Skipped tickets:');
    results.filter(r => r.skipped).forEach(r => {
      console.log(`  - Ticket #${r.ticket_number} (${r.recipient_email}): ${r.reason}`);
    });
  }

  if (failed > 0) {
    console.log('\n❌ Failed tickets:');
    results.filter(r => !r.success && !r.skipped).forEach(r => {
      console.log(`  - Ticket #${r.ticket_number} (${r.recipient_email}): ${r.error}`);
    });
  }

  // Show tracking statistics if enabled
  if (ENABLE_TRACKING) {
    const stats = ticketTracker.getStatistics();
    console.log('\n📈 Tracking Statistics:');
    console.log(`  Total tickets sent (all time): ${stats.sent}`);
    console.log(`  Failed tickets (all time): ${stats.failed}`);
    console.log(`  Unique recipients: ${stats.uniqueRecipients}`);
    console.log(`  Unique events: ${stats.uniqueEvents}`);
  }

  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
