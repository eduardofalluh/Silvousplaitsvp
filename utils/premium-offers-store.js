const { google } = require('googleapis');

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PREMIUM_OFFERS_SHEET_ID = process.env.PREMIUM_OFFERS_SHEET_ID || process.env.GOOGLE_SHEET_ID;
const PREMIUM_OFFERS_TAB = process.env.PREMIUM_OFFERS_TAB || 'premium_offers';

const OFFER_HEADERS = [
  'id',
  'title',
  'region',
  'venue',
  'event_date',
  'image_url',
  'description',
  'promo_code',
  'ticket_url',
  'is_active',
  'created_at',
  'updated_at',
];

function normalize(value) {
  return String(value || '').trim();
}

function normalizeBoolean(value, fallback = true) {
  const raw = String(value == null ? fallback : value).trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'non' || raw === 'inactive');
}

function getMissingSheetEnvVars() {
  const missing = [];
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
  if (!PREMIUM_OFFERS_SHEET_ID) missing.push('PREMIUM_OFFERS_SHEET_ID');
  return missing;
}

async function getSheetsClient() {
  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

function formatSheetsError(error, stage) {
  const apiMessage =
    error &&
    error.response &&
    error.response.data &&
    error.response.data.error &&
    error.response.data.error.message;
  const message = apiMessage || (error && error.message) || 'Unknown Google Sheets error';
  const sheetId = PREMIUM_OFFERS_SHEET_ID || '';
  const sheetIdHint = sheetId ? `${sheetId.slice(0, 6)}...${sheetId.slice(-6)}` : 'missing';
  return new Error(
    `Google Sheets ${stage} failed for sheet ${sheetIdHint} tab ${PREMIUM_OFFERS_TAB}: ${message}`
  );
}

async function ensurePremiumOffersSheet(sheets) {
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId: PREMIUM_OFFERS_SHEET_ID });
  } catch (error) {
    throw formatSheetsError(error, 'spreadsheet lookup');
  }
  const existing = (meta.data.sheets || []).find(
    (sheet) => String(sheet.properties && sheet.properties.title) === PREMIUM_OFFERS_TAB
  );

  if (!existing) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: PREMIUM_OFFERS_TAB,
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      throw formatSheetsError(error, 'tab creation');
    }
  }

  let read;
  try {
    read = await sheets.spreadsheets.values.get({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      range: `${PREMIUM_OFFERS_TAB}!A1:L2`,
    });
  } catch (error) {
    throw formatSheetsError(error, 'header read');
  }
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const matches =
    headerRow.length >= OFFER_HEADERS.length &&
    OFFER_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!matches) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
        range: `${PREMIUM_OFFERS_TAB}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [OFFER_HEADERS],
        },
      });
    } catch (error) {
      throw formatSheetsError(error, 'header write');
    }
  }
}

function mapOfferRow(row, rowNumber) {
  const values = OFFER_HEADERS.reduce((acc, header, index) => {
    acc[header] = normalize(row[index]);
    return acc;
  }, {});

  return {
    rowNumber,
    id: values.id,
    title: values.title,
    region: values.region,
    venue: values.venue,
    event_date: values.event_date,
    image_url: values.image_url,
    description: values.description,
    promo_code: values.promo_code,
    ticket_url: values.ticket_url,
    is_active: normalizeBoolean(values.is_active, true),
    created_at: values.created_at,
    updated_at: values.updated_at,
  };
}

async function listPremiumOffers({ includeInactive = false } = {}) {
  const sheets = await getSheetsClient();
  await ensurePremiumOffersSheet(sheets);
  let read;
  try {
    read = await sheets.spreadsheets.values.get({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      range: `${PREMIUM_OFFERS_TAB}!A:L`,
    });
  } catch (error) {
    throw formatSheetsError(error, 'offers read');
  }

  const rows = read.data.values || [];
  if (rows.length < 2) return [];

  const offers = [];
  for (let i = 1; i < rows.length; i++) {
    const offer = mapOfferRow(rows[i] || [], i + 1);
    if (!offer.id || !offer.title) continue;
    if (!includeInactive && !offer.is_active) continue;
    offers.push(offer);
  }

  return offers.sort((a, b) => {
    const dateA = a.event_date || '9999-12-31';
    const dateB = b.event_date || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.title.localeCompare(b.title, 'fr-CA', { sensitivity: 'base' });
  });
}

function createOfferRow(offer, existingOffer) {
  const timestamp = new Date().toISOString();
  const current = existingOffer || {};
  const id = normalize(offer.id) || current.id || `offer_${Date.now()}`;

  return OFFER_HEADERS.map((header) => {
    switch (header) {
      case 'id':
        return id;
      case 'title':
        return normalize(offer.title || current.title);
      case 'region':
        return normalize(offer.region || current.region);
      case 'venue':
        return normalize(offer.venue || current.venue);
      case 'event_date':
        return normalize(offer.event_date || current.event_date);
      case 'image_url':
        return normalize(offer.image_url || current.image_url);
      case 'description':
        return normalize(offer.description || current.description);
      case 'promo_code':
        return normalize(offer.promo_code || current.promo_code);
      case 'ticket_url':
        return normalize(offer.ticket_url || current.ticket_url);
      case 'is_active':
        return normalizeBoolean(
          offer.is_active != null ? offer.is_active : current.is_active,
          true
        )
          ? 'true'
          : 'false';
      case 'created_at':
        return current.created_at || timestamp;
      case 'updated_at':
        return timestamp;
      default:
        return '';
    }
  });
}

async function savePremiumOffer(offer) {
  const sheets = await getSheetsClient();
  await ensurePremiumOffersSheet(sheets);
  const offers = await listPremiumOffers({ includeInactive: true });
  const existingOffer = offers.find((item) => item.id === normalize(offer.id));
  const values = [createOfferRow(offer, existingOffer)];

  if (existingOffer) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      range: `${PREMIUM_OFFERS_TAB}!A${existingOffer.rowNumber}:L${existingOffer.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    return { id: existingOffer.id, updated: true };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
    range: `${PREMIUM_OFFERS_TAB}!A:L`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  return { id: values[0][0], created: true };
}

async function deletePremiumOffer(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Offer id is required');
  }

  const sheets = await getSheetsClient();
  await ensurePremiumOffersSheet(sheets);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: PREMIUM_OFFERS_SHEET_ID });
  const targetSheet = (meta.data.sheets || []).find(
    (sheet) => String(sheet.properties && sheet.properties.title) === PREMIUM_OFFERS_TAB
  );
  if (!targetSheet) {
    throw new Error(`Sheet not found: ${PREMIUM_OFFERS_TAB}`);
  }

  const offers = await listPremiumOffers({ includeInactive: true });
  const existingOffer = offers.find((item) => item.id === normalizedId);
  if (!existingOffer) {
    throw new Error('Offer not found');
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: targetSheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: existingOffer.rowNumber - 1,
              endIndex: existingOffer.rowNumber,
            },
          },
        },
      ],
    },
  });

  return { deleted: true, id: normalizedId };
}

module.exports = {
  PREMIUM_OFFERS_TAB,
  OFFER_HEADERS,
  normalize,
  getMissingSheetEnvVars,
  listPremiumOffers,
  savePremiumOffer,
  deletePremiumOffer,
};
