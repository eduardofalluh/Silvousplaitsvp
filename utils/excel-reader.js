const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Read tickets from an Excel file (.xlsx)
 * @param {string} filePath - Path to the Excel file
 * @returns {Array<Object>} - Array of ticket objects
 */
function readExcelFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the workbook
    const workbook = XLSX.readFile(filePath);

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false, // Convert dates and numbers to strings
      defval: '', // Default value for empty cells
    });

    // Validate and normalize column names
    const tickets = data.map((row, index) => {
      // Try different possible column name variations
      const eventName =
        row.event_name || row['Event Name'] || row.eventName || row.Event || '';
      const ticketNumber =
        row.ticket_number ||
        row['Ticket Number'] ||
        row.ticketNumber ||
        row.Ticket ||
        '';
      const recipientEmail =
        row.recipient_email ||
        row['Recipient Email'] ||
        row.recipientEmail ||
        row.Email ||
        row.email ||
        '';
      const recipientName =
        row.recipient_name ||
        row['Recipient Name'] ||
        row.recipientName ||
        row.Name ||
        row.name ||
        '';
      const pdfUrl =
        row.pdf_url || row['PDF URL'] || row.pdfUrl || row.URL || row.url || '';

      // Validate required fields
      if (!recipientEmail) {
        console.warn(`Row ${index + 2}: Missing recipient_email, skipping...`);
        return null;
      }

      if (!ticketNumber) {
        console.warn(`Row ${index + 2}: Missing ticket_number, skipping...`);
        return null;
      }

      return {
        event_name: eventName,
        ticket_number: ticketNumber,
        recipient_email: recipientEmail.trim(),
        recipient_name: recipientName,
        pdf_url: pdfUrl,
      };
    });

    // Filter out null entries (invalid rows)
    const validTickets = tickets.filter((ticket) => ticket !== null);

    console.log(`✓ Read ${validTickets.length} tickets from Excel file`);
    return validTickets;
  } catch (error) {
    console.error('Error reading Excel file:', error);
    throw error;
  }
}

/**
 * Create an Excel template file
 * @param {string} outputPath - Path to save the template
 */
function createExcelTemplate(outputPath) {
  // Sample data for template
  const templateData = [
    {
      event_name: 'Concert Example',
      ticket_number: 'TICKET-001',
      recipient_email: 'example@email.com',
      recipient_name: 'John Doe',
      pdf_url: 'https://example.com/ticket.pdf',
    },
    {
      event_name: 'Theatre Show',
      ticket_number: 'TICKET-002',
      recipient_email: 'jane@email.com',
      recipient_name: 'Jane Smith',
      pdf_url: 'https://example.com/ticket2.pdf',
    },
  ];

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(templateData);

  // Set column widths
  const wscols = [
    { wch: 20 }, // event_name
    { wch: 15 }, // ticket_number
    { wch: 25 }, // recipient_email
    { wch: 20 }, // recipient_name
    { wch: 40 }, // pdf_url
  ];
  worksheet['!cols'] = wscols;

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');

  // Write to file
  XLSX.writeFile(workbook, outputPath);
  console.log(`✓ Excel template created at: ${outputPath}`);
}

/**
 * Validate Excel file structure
 * @param {string} filePath - Path to the Excel file
 * @returns {Object} - { valid: boolean, errors: array, warnings: array }
 */
function validateExcelFile(filePath) {
  const errors = [];
  const warnings = [];

  try {
    if (!fs.existsSync(filePath)) {
      errors.push('File does not exist');
      return { valid: false, errors, warnings };
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      errors.push('File is empty');
      return { valid: false, errors, warnings };
    }

    // Check for required columns
    const firstRow = data[0];
    const hasEmail =
      'recipient_email' in firstRow ||
      'Email' in firstRow ||
      'email' in firstRow;
    const hasTicketNumber =
      'ticket_number' in firstRow ||
      'Ticket Number' in firstRow ||
      'ticketNumber' in firstRow;

    if (!hasEmail) {
      errors.push('Missing required column: recipient_email (or Email)');
    }

    if (!hasTicketNumber) {
      errors.push('Missing required column: ticket_number (or Ticket Number)');
    }

    // Check for common issues
    data.forEach((row, index) => {
      const email =
        row.recipient_email || row.Email || row.email || '';
      const ticketNum =
        row.ticket_number || row['Ticket Number'] || row.ticketNumber || '';

      if (email && !email.includes('@')) {
        warnings.push(`Row ${index + 2}: Invalid email format: ${email}`);
      }

      if (!ticketNum) {
        warnings.push(`Row ${index + 2}: Missing ticket number`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      rowCount: data.length,
    };
  } catch (error) {
    errors.push(`Error reading file: ${error.message}`);
    return { valid: false, errors, warnings };
  }
}

module.exports = {
  readExcelFile,
  createExcelTemplate,
  validateExcelFile,
};
