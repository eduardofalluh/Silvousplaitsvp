const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const TRACKING_FILE = path.join(__dirname, '..', 'tickets-sent.csv');

/**
 * Initialize tracking file if it doesn't exist
 */
function initializeTrackingFile() {
  if (!fs.existsSync(TRACKING_FILE)) {
    const headers = 'ticket_number,recipient_email,event_name,sent_date,status\n';
    fs.writeFileSync(TRACKING_FILE, headers, 'utf8');
    console.log('Created tracking file:', TRACKING_FILE);
  }
}

/**
 * Check if a ticket has already been sent to a recipient
 * @param {string} ticketNumber - The ticket number
 * @param {string} recipientEmail - The recipient's email
 * @returns {boolean} - True if ticket was already sent
 */
function isTicketSent(ticketNumber, recipientEmail) {
  initializeTrackingFile();

  try {
    const fileContent = fs.readFileSync(TRACKING_FILE, 'utf8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    // Check if this ticket/email combination exists
    const found = records.some(
      (record) =>
        record.ticket_number === ticketNumber &&
        record.recipient_email.toLowerCase() === recipientEmail.toLowerCase() &&
        record.status === 'sent'
    );

    return found;
  } catch (error) {
    console.error('Error reading tracking file:', error);
    return false; // If error, allow sending (fail open)
  }
}

/**
 * Mark a ticket as sent
 * @param {string} ticketNumber - The ticket number
 * @param {string} recipientEmail - The recipient's email
 * @param {string} eventName - The event name
 * @param {string} status - Status (default: 'sent')
 */
function markTicketSent(ticketNumber, recipientEmail, eventName, status = 'sent') {
  initializeTrackingFile();

  try {
    const fileContent = fs.readFileSync(TRACKING_FILE, 'utf8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    // Add new record
    records.push({
      ticket_number: ticketNumber,
      recipient_email: recipientEmail,
      event_name: eventName,
      sent_date: new Date().toISOString(),
      status: status,
    });

    // Write back to file
    const csv = stringify(records, {
      header: true,
      columns: ['ticket_number', 'recipient_email', 'event_name', 'sent_date', 'status'],
    });

    fs.writeFileSync(TRACKING_FILE, csv, 'utf8');
    console.log(`✓ Tracked ticket ${ticketNumber} for ${recipientEmail}`);
  } catch (error) {
    console.error('Error marking ticket as sent:', error);
  }
}

/**
 * Mark a ticket as failed
 * @param {string} ticketNumber - The ticket number
 * @param {string} recipientEmail - The recipient's email
 * @param {string} eventName - The event name
 */
function markTicketFailed(ticketNumber, recipientEmail, eventName) {
  markTicketSent(ticketNumber, recipientEmail, eventName, 'failed');
}

/**
 * Get all sent tickets for a specific recipient
 * @param {string} recipientEmail - The recipient's email
 * @returns {Array} - Array of sent ticket records
 */
function getSentTicketsForRecipient(recipientEmail) {
  initializeTrackingFile();

  try {
    const fileContent = fs.readFileSync(TRACKING_FILE, 'utf8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    return records.filter(
      (record) =>
        record.recipient_email.toLowerCase() === recipientEmail.toLowerCase()
    );
  } catch (error) {
    console.error('Error getting sent tickets:', error);
    return [];
  }
}

/**
 * Get statistics about sent tickets
 * @returns {Object} - Statistics object
 */
function getStatistics() {
  initializeTrackingFile();

  try {
    const fileContent = fs.readFileSync(TRACKING_FILE, 'utf8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    const stats = {
      total: records.length,
      sent: records.filter((r) => r.status === 'sent').length,
      failed: records.filter((r) => r.status === 'failed').length,
      uniqueRecipients: new Set(records.map((r) => r.recipient_email)).size,
      uniqueEvents: new Set(records.map((r) => r.event_name)).size,
    };

    return stats;
  } catch (error) {
    console.error('Error getting statistics:', error);
    return {
      total: 0,
      sent: 0,
      failed: 0,
      uniqueRecipients: 0,
      uniqueEvents: 0,
    };
  }
}

module.exports = {
  isTicketSent,
  markTicketSent,
  markTicketFailed,
  getSentTicketsForRecipient,
  getStatistics,
  initializeTrackingFile,
};
