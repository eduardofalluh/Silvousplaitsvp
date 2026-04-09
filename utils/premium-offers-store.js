const { google } = require('googleapis');

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PREMIUM_OFFERS_SHEET_ID = process.env.PREMIUM_OFFERS_SHEET_ID || process.env.GOOGLE_SHEET_ID;
const PREMIUM_OFFERS_TAB = process.env.PREMIUM_OFFERS_TAB || 'premium_offers';
const PREMIUM_OFFERS_REGIONS_TAB = process.env.PREMIUM_OFFERS_REGIONS_TAB || 'premium_regions';
const PREMIUM_OFFERS_SHOWCASE_TAB = process.env.PREMIUM_OFFERS_SHOWCASE_TAB || 'premium_showcase';

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
const REGION_HEADERS = ['id', 'label', 'created_at', 'updated_at'];
const SHOWCASE_HEADERS = [
  'id',
  'title',
  'badge',
  'image_url',
  'description',
  'sort_order',
  'is_active',
  'created_at',
  'updated_at',
];
const PREMIUM_OFFERS_TIME_ZONE = 'America/Toronto';
const DEFAULT_REGIONS = ['Montreal', 'Quebec', 'Sherbrooke', 'Trois-Rivieres'];
const DEFAULT_SHOWCASE_ITEMS = [
  {
    id: 'showcase_bleu_jeans_bleu',
    title: 'Bleu Jeans Bleu',
    badge: 'Billets gratuits',
    image_url: 'assets/image1.avif',
    description: 'Accès offert à nos membres Premium pour une soirée complète.',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'showcase_visages',
    title: 'Visages',
    badge: '32 % de rabais',
    image_url: 'assets/image2.avif',
    description: 'Un deal théâtre exclusif réservé aux abonnés Premium.',
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'showcase_soiree_humour',
    title: 'Soirée humour',
    badge: '2 pour 1',
    image_url: 'assets/image3.avif',
    description: 'Des billets à partager sans te casser la tête.',
    sort_order: 3,
    is_active: true,
  },
  {
    id: 'showcase_experience_scene',
    title: 'Expérience scène',
    badge: 'Places VIP à rabais',
    image_url: 'assets/image4.avif',
    description: 'Des offres premium repérées pour sortir mieux, sans payer plus.',
    sort_order: 4,
    is_active: true,
  },
  {
    id: 'showcase_soiree_decouverte',
    title: 'Soirée découverte',
    badge: 'Spectacle gratuit',
    image_url: 'assets/premium_image.avif',
    description: 'Des invitations gratuites dans les meilleures salles de la ville.',
    sort_order: 5,
    is_active: true,
  },
];

function normalize(value) {
  return String(value || '').trim();
}

function normalizeForCompare(value) {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeBoolean(value, fallback = true) {
  const raw = String(value == null ? fallback : value).trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'non' || raw === 'inactive');
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value == null ? fallback : value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugifyRegionLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalizeRegionLabel(value) {
  const raw = normalize(value);
  if (!raw) return '';

  const key = slugifyRegionLabel(raw);
  const knownLabels = {
    montreal: 'Montreal',
    quebec: 'Quebec',
    sherbrooke: 'Sherbrooke',
    trois_rivieres: 'Trois-Rivieres',
  };
  return knownLabels[key] || raw;
}

function dedupeRegionsForCleanup(regions) {
  const seen = new Set();
  const kept = [];
  const duplicates = [];

  for (const region of regions) {
    const key = normalizeForCompare(region && region.label);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push(region);
      continue;
    }
    seen.add(key);
    kept.push(region);
  }

  return { kept, duplicates };
}

function getTimeZoneOffsetMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = parts.reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (zonedAsUtc - date.getTime()) / 60000;
}

function parseLocalDateTimeInTimeZone(value, timeZone = PREMIUM_OFFERS_TIME_ZONE) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

function parseEventStartDate(value) {
  const raw = normalize(value);
  if (!raw) return null;

  const hasExplicitTimezone =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ||
    /GMT|UTC/i.test(raw);
  const parsed = hasExplicitTimezone ? new Date(raw) : parseLocalDateTimeInTimeZone(raw);
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function isExpiredOffer(offer, now = new Date()) {
  const eventStart = parseEventStartDate(offer && offer.event_date);
  return !!eventStart && eventStart.getTime() <= now.getTime();
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

async function safeReadRange(sheets, range, stage) {
  try {
    return await sheets.spreadsheets.values.get({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      range,
    });
  } catch (error) {
    throw formatSheetsError(error, stage);
  }
}

async function safeWriteRange(sheets, range, values, stage) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });
  } catch (error) {
    throw formatSheetsError(error, stage);
  }
}

async function safeAppendRows(sheets, range, values, stage) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  } catch (error) {
    throw formatSheetsError(error, stage);
  }
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

  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_TAB}!A1:L2`, 'header read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const matches =
    headerRow.length >= OFFER_HEADERS.length &&
    OFFER_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!matches) {
    await safeWriteRange(sheets, `${PREMIUM_OFFERS_TAB}!A1:L1`, [OFFER_HEADERS], 'header write');
  }
}

async function ensureRegionsSheet(sheets) {
  const targetSheet = await getOrCreateSheet(sheets, PREMIUM_OFFERS_REGIONS_TAB);
  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_REGIONS_TAB}!A1:D200`, 'regions read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const hasExpectedHeaders =
    headerRow.length >= REGION_HEADERS.length &&
    REGION_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!hasExpectedHeaders) {
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_REGIONS_TAB}!A1:D1`,
      [REGION_HEADERS],
      'regions header write'
    );
  }

  const existingLabels = new Set(
    rows
      .slice(1)
      .map((row) => normalizeForCompare(canonicalizeRegionLabel(row[1])))
      .filter(Boolean)
  );
  const missingDefaults = DEFAULT_REGIONS.filter(
    (label) => !existingLabels.has(normalizeForCompare(label))
  );
  if (missingDefaults.length) {
    const timestamp = new Date().toISOString();
    await safeAppendRows(
      sheets,
      `${PREMIUM_OFFERS_REGIONS_TAB}!A:D`,
      missingDefaults.map((label) => [slugifyRegionLabel(label), label, timestamp, timestamp]),
      'regions seed write'
    );
  }

  return targetSheet;
}

async function ensureShowcaseSheet(sheets) {
  await getOrCreateSheet(sheets, PREMIUM_OFFERS_SHOWCASE_TAB);
  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_SHOWCASE_TAB}!A1:I200`, 'showcase read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const hasExpectedHeaders =
    headerRow.length >= SHOWCASE_HEADERS.length &&
    SHOWCASE_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!hasExpectedHeaders) {
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_SHOWCASE_TAB}!A1:I1`,
      [SHOWCASE_HEADERS],
      'showcase header write'
    );
  }

  if (rows.length < 2) {
    const timestamp = new Date().toISOString();
    await safeAppendRows(
      sheets,
      `${PREMIUM_OFFERS_SHOWCASE_TAB}!A:I`,
      DEFAULT_SHOWCASE_ITEMS.map((item) => [
        item.id,
        item.title,
        item.badge,
        item.image_url,
        item.description,
        String(item.sort_order),
        item.is_active ? 'true' : 'false',
        timestamp,
        timestamp,
      ]),
      'showcase seed write'
    );
  }
}

async function getPremiumOffersSheet(sheets) {
  return getOrCreateSheet(sheets, PREMIUM_OFFERS_TAB, false);
}

async function getOrCreateSheet(sheets, title, allowCreate = true) {
  let meta;
  try {
    meta = await sheets.spreadsheets.get({ spreadsheetId: PREMIUM_OFFERS_SHEET_ID });
  } catch (error) {
    throw formatSheetsError(error, 'spreadsheet lookup');
  }
  const existing = (meta.data.sheets || []).find(
    (sheet) => String(sheet.properties && sheet.properties.title) === title
  );
  if (existing || !allowCreate) {
    if (!existing) throw new Error(`Sheet not found: ${title}`);
    return existing;
  }

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  } catch (error) {
    throw formatSheetsError(error, `${title} tab creation`);
  }

  return getOrCreateSheet(sheets, title, false);
}

function buildDeleteRowsRequests(sheetId, offers) {
  return offers
    .map((offer) => Number(offer.rowNumber))
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1)
    .sort((a, b) => b - a)
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));
}

async function deleteOfferRows(sheets, offers, tabName = PREMIUM_OFFERS_TAB) {
  const targetSheet = await getOrCreateSheet(sheets, tabName, false);
  const requests = buildDeleteRowsRequests(targetSheet.properties.sheetId, offers);
  if (!requests.length) return 0;

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: PREMIUM_OFFERS_SHEET_ID,
      requestBody: {
        requests,
      },
    });
  } catch (error) {
    throw formatSheetsError(error, 'expired row cleanup');
  }

  return requests.length;
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
    region: canonicalizeRegionLabel(values.region),
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
  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_TAB}!A:L`, 'offers read');

  const rows = read.data.values || [];
  if (rows.length < 2) return [];

  const offers = [];
  for (let i = 1; i < rows.length; i++) {
    const offer = mapOfferRow(rows[i] || [], i + 1);
    if (!offer.id || !offer.title) continue;
    offers.push(offer);
  }

  const expiredOffers = offers.filter((offer) => isExpiredOffer(offer));
  if (expiredOffers.length) {
    await deleteOfferRows(sheets, expiredOffers);
  }

  const availableOffers = offers.filter((offer) => !isExpiredOffer(offer));

  return availableOffers.filter((offer) => includeInactive || offer.is_active).sort((a, b) => {
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
        return canonicalizeRegionLabel(offer.region || current.region);
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
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_TAB}!A${existingOffer.rowNumber}:L${existingOffer.rowNumber}`,
      values,
      'offer update'
    );
    return { id: existingOffer.id, updated: true };
  }

  await safeAppendRows(sheets, `${PREMIUM_OFFERS_TAB}!A:L`, values, 'offer append');

  return { id: values[0][0], created: true };
}

async function deletePremiumOffer(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Offer id is required');
  }

  const sheets = await getSheetsClient();
  await ensurePremiumOffersSheet(sheets);
  const offers = await listPremiumOffers({ includeInactive: true });
  const existingOffer = offers.find((item) => item.id === normalizedId);
  if (!existingOffer) {
    throw new Error('Offer not found');
  }

  await deleteOfferRows(sheets, [existingOffer]);

  return { deleted: true, id: normalizedId };
}

function mapRegionRow(row, rowNumber) {
  const id = normalize(row[0]) || `region_${rowNumber}`;
  const label = canonicalizeRegionLabel(row[1]);
  return {
    rowNumber,
    id,
    label,
    created_at: normalize(row[2]),
    updated_at: normalize(row[3]),
  };
}

function mapShowcaseRow(row, rowNumber) {
  const values = SHOWCASE_HEADERS.reduce((acc, header, index) => {
    acc[header] = normalize(row[index]);
    return acc;
  }, {});

  return {
    rowNumber,
    id: values.id || `showcase_${rowNumber}`,
    title: values.title,
    badge: values.badge,
    image_url: values.image_url,
    description: values.description,
    sort_order: normalizeInteger(values.sort_order, rowNumber - 1),
    is_active: normalizeBoolean(values.is_active, true),
    created_at: values.created_at,
    updated_at: values.updated_at,
  };
}

async function listPremiumOfferRegions() {
  const sheets = await getSheetsClient();
  await ensureRegionsSheet(sheets);
  const read = await safeReadRange(
    sheets,
    `${PREMIUM_OFFERS_REGIONS_TAB}!A:D`,
    'regions list read'
  );
  const rows = read.data.values || [];
  if (rows.length < 2) return DEFAULT_REGIONS.map((label, index) => ({
    rowNumber: index + 2,
    id: slugifyRegionLabel(label),
    label,
  }));

  const regions = rows
    .slice(1)
    .map((row, index) => mapRegionRow(row, index + 2))
    .filter((region) => region.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr-CA', { sensitivity: 'base' }));

  const { kept, duplicates } = dedupeRegionsForCleanup(regions);
  if (duplicates.length) {
    await deleteOfferRows(sheets, duplicates, PREMIUM_OFFERS_REGIONS_TAB);
  }

  return kept;
}

async function savePremiumOfferRegion(region) {
  const label = canonicalizeRegionLabel(region && region.label);
  if (!label) {
    throw new Error('Le nom de la region est requis');
  }

  const sheets = await getSheetsClient();
  await ensureRegionsSheet(sheets);
  const regions = await listPremiumOfferRegions();
  const existingRegion = regions.find(
    (item) => normalizeForCompare(item.label) === normalizeForCompare(label)
  );
  if (existingRegion) {
    return { id: existingRegion.id, updated: false };
  }

  const timestamp = new Date().toISOString();
  const values = [[slugifyRegionLabel(label), label, timestamp, timestamp]];
  await safeAppendRows(
    sheets,
    `${PREMIUM_OFFERS_REGIONS_TAB}!A:D`,
    values,
    'region append'
  );
  return { id: values[0][0], created: true };
}

async function deletePremiumOfferRegion(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Region id is required');
  }

  const sheets = await getSheetsClient();
  await ensureRegionsSheet(sheets);
  const [regions, offers] = await Promise.all([
    listPremiumOfferRegions(),
    listPremiumOffers({ includeInactive: true }),
  ]);
  const existingRegion = regions.find((region) => region.id === normalizedId);
  if (!existingRegion) {
    throw new Error('Region not found');
  }

  const usedByOffer = offers.some(
    (offer) => normalizeForCompare(offer.region) === normalizeForCompare(existingRegion.label)
  );
  if (usedByOffer) {
    throw new Error('Impossible de supprimer une region utilisee par une offre');
  }

  await deleteOfferRows(
    sheets,
    [{ rowNumber: existingRegion.rowNumber }],
    PREMIUM_OFFERS_REGIONS_TAB
  );

  return { deleted: true, id: normalizedId };
}

async function listPremiumShowcaseItems({ includeInactive = false } = {}) {
  const sheets = await getSheetsClient();
  await ensureShowcaseSheet(sheets);
  const read = await safeReadRange(
    sheets,
    `${PREMIUM_OFFERS_SHOWCASE_TAB}!A:I`,
    'showcase list read'
  );
  const rows = read.data.values || [];
  if (rows.length < 2) return DEFAULT_SHOWCASE_ITEMS.slice();

  return rows
    .slice(1)
    .map((row, index) => mapShowcaseRow(row, index + 2))
    .filter((item) => item.id && item.title)
    .filter((item) => includeInactive || item.is_active)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.title.localeCompare(b.title, 'fr-CA', { sensitivity: 'base' });
    });
}

function createShowcaseRow(item, existingItem) {
  const timestamp = new Date().toISOString();
  const current = existingItem || {};
  const id = normalize(item.id) || current.id || `showcase_${Date.now()}`;

  return SHOWCASE_HEADERS.map((header) => {
    switch (header) {
      case 'id':
        return id;
      case 'title':
        return normalize(item.title || current.title);
      case 'badge':
        return normalize(item.badge || current.badge);
      case 'image_url':
        return normalize(item.image_url || current.image_url);
      case 'description':
        return normalize(item.description || current.description);
      case 'sort_order':
        return String(normalizeInteger(item.sort_order, current.sort_order || 0));
      case 'is_active':
        return normalizeBoolean(
          item.is_active != null ? item.is_active : current.is_active,
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

async function savePremiumShowcaseItem(item) {
  const sheets = await getSheetsClient();
  await ensureShowcaseSheet(sheets);
  const items = await listPremiumShowcaseItems({ includeInactive: true });
  const existingItem = items.find((entry) => entry.id === normalize(item.id));
  const values = [createShowcaseRow(item, existingItem)];

  if (existingItem) {
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_SHOWCASE_TAB}!A${existingItem.rowNumber}:I${existingItem.rowNumber}`,
      values,
      'showcase update'
    );
    return { id: existingItem.id, updated: true };
  }

  await safeAppendRows(sheets, `${PREMIUM_OFFERS_SHOWCASE_TAB}!A:I`, values, 'showcase append');
  return { id: values[0][0], created: true };
}

async function deletePremiumShowcaseItem(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Showcase item id is required');
  }

  const sheets = await getSheetsClient();
  await ensureShowcaseSheet(sheets);
  const items = await listPremiumShowcaseItems({ includeInactive: true });
  const existingItem = items.find((item) => item.id === normalizedId);
  if (!existingItem) {
    throw new Error('Showcase item not found');
  }

  await deleteOfferRows(sheets, [existingItem], PREMIUM_OFFERS_SHOWCASE_TAB);
  return { deleted: true, id: normalizedId };
}

module.exports = {
  PREMIUM_OFFERS_TAB,
  PREMIUM_OFFERS_REGIONS_TAB,
  PREMIUM_OFFERS_SHOWCASE_TAB,
  OFFER_HEADERS,
  REGION_HEADERS,
  SHOWCASE_HEADERS,
  DEFAULT_REGIONS,
  DEFAULT_SHOWCASE_ITEMS,
  normalize,
  normalizeForCompare,
  canonicalizeRegionLabel,
  dedupeRegionsForCleanup,
  parseEventStartDate,
  isExpiredOffer,
  buildDeleteRowsRequests,
  getMissingSheetEnvVars,
  listPremiumOffers,
  listPremiumOfferRegions,
  listPremiumShowcaseItems,
  savePremiumOffer,
  savePremiumOfferRegion,
  savePremiumShowcaseItem,
  deletePremiumOffer,
  deletePremiumOfferRegion,
  deletePremiumShowcaseItem,
};
