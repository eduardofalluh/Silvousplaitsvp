const { google } = require('googleapis');

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const PREMIUM_OFFERS_SHEET_ID = process.env.PREMIUM_OFFERS_SHEET_ID || process.env.GOOGLE_SHEET_ID;
const PREMIUM_OFFERS_TAB = process.env.PREMIUM_OFFERS_TAB || 'premium_offers';
const PREMIUM_OFFERS_REGIONS_TAB = process.env.PREMIUM_OFFERS_REGIONS_TAB || 'premium_regions';
const PREMIUM_OFFERS_TYPES_TAB = process.env.PREMIUM_OFFERS_TYPES_TAB || 'premium_offer_types';
const FREE_SIGNUP_LOCATIONS_TAB = process.env.FREE_SIGNUP_LOCATIONS_TAB || 'free_signup_locations';
const PREMIUM_OFFERS_SHOWCASE_TAB = process.env.PREMIUM_OFFERS_SHOWCASE_TAB || 'premium_showcase';
const PREMIUM_OFFERS_ACCESS_LOGS_TAB = process.env.PREMIUM_OFFERS_ACCESS_LOGS_TAB || 'premium_access_logs';
const SPREADSHEET_META_CACHE_TTL_MS = 30 * 1000;

const OFFER_HEADERS = [
  'id',
  'title',
  'region',
  'offer_type',
  'venue',
  'event_date',
  'image_url',
  'description',
  'promo_code',
  'ticket_url',
  'is_active',
  'created_at',
  'updated_at',
  'filtre_offre',
];
const LEGACY_OFFER_HEADERS = [
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
const OFFER_TYPE_HEADERS = ['id', 'label', 'created_at', 'updated_at'];
const FREE_SIGNUP_LOCATION_HEADERS = [
  'id',
  'label',
  'u',
  'f',
  's',
  'c',
  'm',
  'act',
  'v',
  'or',
  'is_default',
  'created_at',
  'updated_at',
];
const ACCESS_LOG_HEADERS = ['id', 'email', 'created_at'];
const LEGACY_ACCESS_LOG_HEADERS = ['id', 'email', 'event_type', 'ip_address', 'user_agent', 'created_at'];
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
const DEFAULT_OFFER_TYPES = [
  'Billets gratuits',
  'Rabais',
  '2 pour 1',
  'Places VIP',
  'Invitations',
];
const DEFAULT_FREE_SIGNUP_LOCATIONS = [
  {
    id: 'montreal',
    label: 'Montréal',
    u: '1',
    f: '1',
    s: '',
    c: '0',
    m: '0',
    act: 'sub',
    v: '2',
    or: '3984880d-52e1-445d-99b0-09aeef208544',
    is_default: true,
  },
  {
    id: 'quebec',
    label: 'Québec',
    u: '69ED120690823',
    f: '9',
    s: '',
    c: '0',
    m: '0',
    act: 'sub',
    v: '2',
    or: '0b035bc1-fee2-41ea-b49c-c65e19a08016',
    is_default: false,
  },
  {
    id: 'trois_rivieres',
    label: 'Trois-Rivières',
    u: '69ED1206F0DD6',
    f: '11',
    s: '',
    c: '0',
    m: '0',
    act: 'sub',
    v: '2',
    or: '77d982e4-b8c2-4a43-b59a-d54646f9c9ee',
    is_default: false,
  },
  {
    id: 'sherbrooke',
    label: 'Sherbrooke',
    u: '69ED12076A999',
    f: '13',
    s: '',
    c: '0',
    m: '0',
    act: 'sub',
    v: '2',
    or: 'cbe7d463-4a76-4436-9d41-64003c44e753',
    is_default: false,
  },
];
const OFFER_HEADER_ALIASES = {
  id: ['id'],
  title: ['title', 'titre'],
  region: ['region', 'ville'],
  offer_type: ['offer_type', 'type_offre', 'type_d_offre'],
  venue: ['venue', 'lieu', 'salle'],
  event_date: ['event_date', 'date_evenement', 'date'],
  image_url: ['image_url', 'image', 'image_link'],
  description: ['description'],
  promo_code: ['promo_code', 'code_promo'],
  ticket_url: ['ticket_url', 'billetterie_url', 'ticket_link'],
  is_active: ['is_active', 'active'],
  created_at: ['created_at'],
  updated_at: ['updated_at'],
  filtre_offre: ['filtre_offre', 'filter_tag', 'offer_filter', 'tag_offre', 'tag'],
};
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
let cachedSheetsClient = null;
let cachedSpreadsheetMeta = null;
let cachedSpreadsheetMetaAt = 0;

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

function looksLikeDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/.test(normalize(value));
}

function looksLikeUrl(value) {
  const raw = normalize(value);
  return /^https?:\/\//i.test(raw) || /^assets\//i.test(raw);
}

function isLegacyOfferRow(row) {
  return looksLikeDateTime(row[4]);
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

function slugifyLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalizeOfferTypeLabel(value) {
  return normalize(value);
}

function canonicalizeFilterLabel(value) {
  return normalize(value);
}

function buildHeaderIndexMap(headerRow) {
  const normalizedHeaders = headerRow.map((value) => normalizeForCompare(value));
  return Object.keys(OFFER_HEADER_ALIASES).reduce((acc, key) => {
    const aliases = OFFER_HEADER_ALIASES[key].map((alias) => normalizeForCompare(alias));
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (index >= 0) acc[key] = index;
    return acc;
  }, {});
}

function getCanonicalHeaderKey(header) {
  const normalizedHeader = normalizeForCompare(header);
  for (const [key, aliases] of Object.entries(OFFER_HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeForCompare(alias) === normalizedHeader)) {
      return key;
    }
  }
  return '';
}

function extractOfferExtraFields(headerRow, row) {
  return headerRow.reduce((acc, header, index) => {
    const headerLabel = normalize(header);
    if (!headerLabel) return acc;
    if (getCanonicalHeaderKey(headerLabel)) return acc;
    acc[headerLabel] = normalize(row[index]);
    return acc;
  }, {});
}

function columnNumberToLetter(columnNumber) {
  let value = Number(columnNumber) || 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result || 'A';
}

function mapOfferRowWithHeaderMap(row, rowNumber, headerMap) {
  const headerRow = Object.keys(headerMap)
    .sort((a, b) => headerMap[a] - headerMap[b]);
  const rawValues = OFFER_HEADERS.reduce((acc, header) => {
    const index = Object.prototype.hasOwnProperty.call(headerMap, header) ? headerMap[header] : -1;
    acc[header] = index >= 0 ? normalize(row[index]) : '';
    return acc;
  }, {});
  const values =
    !looksLikeUrl(rawValues.image_url) &&
    looksLikeUrl(rawValues.event_date) &&
    looksLikeDateTime(rawValues.venue)
      ? {
          ...rawValues,
          offer_type: canonicalizeOfferTypeLabel(rawValues.filtre_offre),
          venue: rawValues.offer_type,
          event_date: rawValues.venue,
          image_url: rawValues.event_date,
          description: rawValues.image_url,
          promo_code: rawValues.description,
          ticket_url: rawValues.promo_code,
          is_active: rawValues.ticket_url,
          created_at: rawValues.is_active,
          updated_at: rawValues.created_at,
        }
      : rawValues;

  const filterLabel = canonicalizeFilterLabel(values.filtre_offre);
  const offerTypeLabel = canonicalizeOfferTypeLabel(values.offer_type);

  return {
    rowNumber,
    id: values.id,
    title: values.title,
    region: canonicalizeRegionLabel(values.region),
    offer_type: offerTypeLabel,
    venue: values.venue,
    event_date: values.event_date,
    image_url: values.image_url,
    description: values.description,
    promo_code: values.promo_code,
    ticket_url: values.ticket_url,
    is_active: normalizeBoolean(values.is_active, true),
    created_at: values.created_at,
    updated_at: values.updated_at,
    filtre_offre: filterLabel || offerTypeLabel,
    extra_fields: extractOfferExtraFields(headerRow, row),
  };
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
  if (cachedSheetsClient) {
    return cachedSheetsClient;
  }
  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();
  cachedSheetsClient = google.sheets({ version: 'v4', auth });
  return cachedSheetsClient;
}

function invalidateSpreadsheetMetaCache() {
  cachedSpreadsheetMeta = null;
  cachedSpreadsheetMetaAt = 0;
}

async function getSpreadsheetMeta(sheets, { forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedSpreadsheetMeta &&
    cachedSpreadsheetMetaAt &&
    now - cachedSpreadsheetMetaAt < SPREADSHEET_META_CACHE_TTL_MS
  ) {
    return cachedSpreadsheetMeta;
  }

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: PREMIUM_OFFERS_SHEET_ID });
    cachedSpreadsheetMeta = meta;
    cachedSpreadsheetMetaAt = now;
    return meta;
  } catch (error) {
    throw formatSheetsError(error, 'spreadsheet lookup');
  }
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
    invalidateSpreadsheetMetaCache();
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
    invalidateSpreadsheetMetaCache();
  } catch (error) {
    throw formatSheetsError(error, stage);
  }
}

async function ensurePremiumOffersSheet(sheets) {
  let meta = await getSpreadsheetMeta(sheets);
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
    invalidateSpreadsheetMetaCache();
    meta = await getSpreadsheetMeta(sheets, { forceRefresh: true });
  }

  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_TAB}!A1:N2`, 'header read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const legacyHeaders = [
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
  const matchesLegacyHeaders =
    headerRow.length >= legacyHeaders.length &&
    legacyHeaders.every((header, index) => String(headerRow[index] || '').trim() === header);
  const matches =
    headerRow.length >= OFFER_HEADERS.length &&
    OFFER_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);
  const hasAllCurrentHeaders = OFFER_HEADERS.every((header) =>
    headerRow.some((cell) => normalizeForCompare(cell) === normalizeForCompare(header))
  );

  if (matchesLegacyHeaders && !matches) {
    const migratedRows = rows.slice(1).map((row) => [
      normalize(row[0]),
      normalize(row[1]),
      normalize(row[2]),
      '',
      normalize(row[3]),
      normalize(row[4]),
      normalize(row[5]),
      normalize(row[6]),
      normalize(row[7]),
      normalize(row[8]),
      normalize(row[9]),
      normalize(row[10]),
      normalize(row[11]),
      '',
    ]);
    await safeWriteRange(sheets, `${PREMIUM_OFFERS_TAB}!A1:N1`, [OFFER_HEADERS], 'header migration write');
    if (migratedRows.length) {
      await safeWriteRange(
        sheets,
        `${PREMIUM_OFFERS_TAB}!A2:N${migratedRows.length + 1}`,
        migratedRows,
        'row migration write'
      );
    }
    return;
  }

  if (!matches && !hasAllCurrentHeaders) {
    await safeWriteRange(sheets, `${PREMIUM_OFFERS_TAB}!A1:N1`, [OFFER_HEADERS], 'header write');
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

  const hasAnyRegion = rows.slice(1).some((row) => row && normalize(row[1]));
  if (!hasAnyRegion) {
    const timestamp = new Date().toISOString();
    await safeAppendRows(
      sheets,
      `${PREMIUM_OFFERS_REGIONS_TAB}!A:D`,
      DEFAULT_REGIONS.map((label) => [slugifyRegionLabel(label), label, timestamp, timestamp]),
      'regions seed write'
    );
  }

  return targetSheet;
}

async function ensureOfferTypesSheet(sheets) {
  await getOrCreateSheet(sheets, PREMIUM_OFFERS_TYPES_TAB);
  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_TYPES_TAB}!A1:D200`, 'offer types read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const hasExpectedHeaders =
    headerRow.length >= OFFER_TYPE_HEADERS.length &&
    OFFER_TYPE_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!hasExpectedHeaders) {
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_TYPES_TAB}!A1:D1`,
      [OFFER_TYPE_HEADERS],
      'offer types header write'
    );
  }

  const hasAnyType = rows.slice(1).some((row) => row && normalize(row[1]));
  if (!hasAnyType) {
    const timestamp = new Date().toISOString();
    await safeAppendRows(
      sheets,
      `${PREMIUM_OFFERS_TYPES_TAB}!A:D`,
      DEFAULT_OFFER_TYPES.map((label) => [slugifyLabel(label), label, timestamp, timestamp]),
      'offer types seed write'
    );
  }
}

async function ensureFreeSignupLocationsSheet(sheets) {
  await getOrCreateSheet(sheets, FREE_SIGNUP_LOCATIONS_TAB);
  const read = await safeReadRange(sheets, `${FREE_SIGNUP_LOCATIONS_TAB}!A1:M200`, 'free signup locations read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const hasExpectedHeaders =
    headerRow.length >= FREE_SIGNUP_LOCATION_HEADERS.length &&
    FREE_SIGNUP_LOCATION_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!hasExpectedHeaders) {
    await safeWriteRange(
      sheets,
      `${FREE_SIGNUP_LOCATIONS_TAB}!A1:M1`,
      [FREE_SIGNUP_LOCATION_HEADERS],
      'free signup locations header write'
    );
  }

  const hasAnyLocation = rows.slice(1).some((row) => row && normalize(row[1]));
  if (!hasAnyLocation) {
    const timestamp = new Date().toISOString();
    await safeAppendRows(
      sheets,
      `${FREE_SIGNUP_LOCATIONS_TAB}!A:M`,
      DEFAULT_FREE_SIGNUP_LOCATIONS.map((location) => [
        location.id,
        location.label,
        location.u,
        location.f,
        location.s,
        location.c,
        location.m,
        location.act,
        location.v,
        location.or,
        location.is_default ? 'true' : 'false',
        timestamp,
        timestamp,
      ]),
      'free signup locations seed write'
    );
  }
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

async function ensureAccessLogsSheet(sheets) {
  await getOrCreateSheet(sheets, PREMIUM_OFFERS_ACCESS_LOGS_TAB);
  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_ACCESS_LOGS_TAB}!A1:F10`, 'access logs read');
  const rows = read.data.values || [];
  const headerRow = rows[0] || [];
  const hasExpectedHeaders =
    headerRow.length >= ACCESS_LOG_HEADERS.length &&
    ACCESS_LOG_HEADERS.every((header, index) => String(headerRow[index] || '').trim() === header);

  if (!hasExpectedHeaders) {
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_ACCESS_LOGS_TAB}!A1:C1`,
      [ACCESS_LOG_HEADERS],
      'access logs header write'
    );
  }
}

async function getPremiumOffersSheet(sheets) {
  return getOrCreateSheet(sheets, PREMIUM_OFFERS_TAB, false);
}

async function getOrCreateSheet(sheets, title, allowCreate = true) {
  let meta = await getSpreadsheetMeta(sheets);
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

  invalidateSpreadsheetMetaCache();

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

function mapAccessLogRow(row, rowNumber) {
  const createdAtIndex = row.length >= LEGACY_ACCESS_LOG_HEADERS.length ? 5 : 2;
  return {
    rowNumber,
    id: normalize(row[0]) || `access_log_${rowNumber}`,
    email: normalize(row[1]),
    created_at: normalize(row[createdAtIndex]),
  };
}

function mapOfferRow(row, rowNumber) {
  const headers = isLegacyOfferRow(row) ? LEGACY_OFFER_HEADERS : OFFER_HEADERS;
  const values = headers.reduce((acc, header, index) => {
    acc[header] = normalize(row[index]);
    return acc;
  }, {});

  return {
    rowNumber,
    id: values.id,
    title: values.title,
    region: canonicalizeRegionLabel(values.region),
    offer_type: canonicalizeOfferTypeLabel(values.offer_type),
    venue: values.venue,
    event_date: values.event_date,
    image_url: values.image_url,
    description: values.description,
    promo_code: values.promo_code,
    ticket_url: values.ticket_url,
    is_active: normalizeBoolean(values.is_active, true),
    created_at: values.created_at,
    updated_at: values.updated_at,
    filtre_offre: canonicalizeFilterLabel(normalize(row[13])) || canonicalizeOfferTypeLabel(values.offer_type),
    extra_fields: {},
  };
}

async function readPremiumOffersSheetData(sheets) {
  await ensurePremiumOffersSheet(sheets);
  const read = await safeReadRange(sheets, `${PREMIUM_OFFERS_TAB}!A:ZZ`, 'offers read');
  const rows = read.data.values || [];
  const headerRow = (rows[0] || []).map((cell) => normalize(cell));
  const headerMap = buildHeaderIndexMap(headerRow);
  return { rows, headerRow, headerMap };
}

async function listPremiumOffers({ includeInactive = false, sheets: providedSheets } = {}) {
  const sheets = providedSheets || await getSheetsClient();
  const { rows, headerRow, headerMap } = await readPremiumOffersSheetData(sheets);
  if (rows.length < 2) return [];

  const offers = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const offer = Object.keys(headerMap).length
      ? mapOfferRowWithHeaderMap(row, i + 1, headerMap)
      : mapOfferRow(row, i + 1);
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

function createOfferRow(offer, existingOffer, headerRow) {
  const timestamp = new Date().toISOString();
  const current = existingOffer || {};
  const id = normalize(offer.id) || current.id || `offer_${Date.now()}`;
  const extraFields = Object.assign({}, current.extra_fields || {}, offer.extra_fields || {});
  const targetHeaders = headerRow && headerRow.length ? headerRow : OFFER_HEADERS;

  return targetHeaders.map((header) => {
    const headerLabel = normalize(header);
    const canonicalKey = getCanonicalHeaderKey(headerLabel);
    switch (canonicalKey) {
      case 'id':
        return id;
      case 'title':
        return normalize(offer.title || current.title);
      case 'region':
        return canonicalizeRegionLabel(offer.region || current.region);
      case 'offer_type':
        return canonicalizeOfferTypeLabel(offer.offer_type || current.offer_type);
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
      case 'filtre_offre':
        return canonicalizeFilterLabel(offer.filtre_offre || current.filtre_offre || offer.offer_type || current.offer_type);
      default:
        return normalize(extraFields[headerLabel]);
    }
  });
}

async function savePremiumOffer(offer) {
  const sheets = await getSheetsClient();
  const { rows, headerRow } = await readPremiumOffersSheetData(sheets);
  const offers = rows.length < 2 ? [] : await listPremiumOffers({ includeInactive: true, sheets });
  const existingOffer = offers.find((item) => item.id === normalize(offer.id));
  const values = [createOfferRow(offer, existingOffer, headerRow)];
  const endColumn = columnNumberToLetter((headerRow && headerRow.length) || OFFER_HEADERS.length);

  if (existingOffer) {
    await safeWriteRange(
      sheets,
      `${PREMIUM_OFFERS_TAB}!A${existingOffer.rowNumber}:${endColumn}${existingOffer.rowNumber}`,
      values,
      'offer update'
    );
    return { id: existingOffer.id, updated: true };
  }

  // Find the last row that has a non-empty id (column A) to avoid
  // appending to wrong columns when the sheet has empty rows in the middle.
  const lastDataRow = rows.reduce((max, row, index) => {
    return normalize(row && row[0]) ? index + 1 : max;
  }, 0);
  const newRowNumber = Math.max(lastDataRow, rows.length, 1) + 1;
  await safeWriteRange(
    sheets,
    `${PREMIUM_OFFERS_TAB}!A${newRowNumber}:${endColumn}${newRowNumber}`,
    values,
    'offer append'
  );

  return { id: values[0][0], created: true };
}

async function deletePremiumOffer(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Offer id is required');
  }

  const sheets = await getSheetsClient();
  const offers = await listPremiumOffers({ includeInactive: true, sheets });
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

function mapOfferTypeRow(row, rowNumber) {
  const id = normalize(row[0]) || `offer_type_${rowNumber}`;
  const label = canonicalizeOfferTypeLabel(row[1]);
  return {
    rowNumber,
    id,
    label,
    created_at: normalize(row[2]),
    updated_at: normalize(row[3]),
  };
}

function mapFreeSignupLocationRow(row, rowNumber) {
  return {
    rowNumber,
    id: normalize(row[0]) || `free_signup_location_${rowNumber}`,
    label: normalize(row[1]),
    u: normalize(row[2]),
    f: normalize(row[3]),
    s: normalize(row[4]),
    c: normalize(row[5]),
    m: normalize(row[6]),
    act: normalize(row[7]) || 'sub',
    v: normalize(row[8]) || '2',
    or: normalize(row[9]),
    is_default: normalizeBoolean(row[10], false),
    created_at: normalize(row[11]),
    updated_at: normalize(row[12]),
  };
}

function buildFreeSignupEmbedUrlFromFormId(formId) {
  const normalizedFormId = normalize(formId);
  if (!normalizedFormId) return '';
  return `https://silvousplait.activehosted.com/f/embed.php?id=${encodeURIComponent(normalizedFormId)}`;
}

function extractActiveCampaignEmbedConfig(text) {
  const source = String(text || '');
  const keys = ['u', 'f', 's', 'c', 'm', 'act', 'v', 'or'];
  const config = {};

  for (const key of keys) {
    const patterns = [
      new RegExp(`name=["']${key}["'][^>]*value=["']([^"']*)["']`, 'i'),
      new RegExp(`name=\\\\["']${key}\\\\["'][^>]*value=\\\\["']([^\\\\"']*)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) {
        config[key] = match[1];
        break;
      }
    }
  }

  return config;
}

async function resolveFreeSignupEmbedConfig(location) {
  const embedUrl = normalize(location && location.embed_url);
  if (!embedUrl) {
    return {
      u: normalize(location && location.u),
      f: normalize(location && location.f),
      s: normalize(location && location.s),
      c: normalize(location && location.c || '0'),
      m: normalize(location && location.m || '0'),
      act: normalize(location && location.act || 'sub'),
      v: normalize(location && location.v || '2'),
      or: normalize(location && location.or),
    };
  }

  let url;
  try {
    url = new URL(embedUrl);
  } catch {
    throw new Error("L'URL embed est invalide");
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("L'URL embed est invalide");
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://silvousplaitsvp.com/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error("Impossible de lire l'URL embed ActiveCampaign");
  }

  const text = await response.text();
  const config = extractActiveCampaignEmbedConfig(text);
  const requiredKeys = ['u', 'f', 'c', 'm', 'act', 'v', 'or'];
  for (const key of requiredKeys) {
    if (!normalize(config[key])) {
      throw new Error("Impossible d'extraire la configuration de l'URL embed");
    }
  }

  return {
    u: normalize(config.u),
    f: normalize(config.f),
    s: normalize(config.s),
    c: normalize(config.c || '0'),
    m: normalize(config.m || '0'),
    act: normalize(config.act || 'sub'),
    v: normalize(config.v || '2'),
    or: normalize(config.or),
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

async function listPremiumOfferRegions({ sheets: providedSheets } = {}) {
  const sheets = providedSheets || await getSheetsClient();
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

async function listPremiumOfferTypes({ sheets: providedSheets } = {}) {
  const sheets = providedSheets || await getSheetsClient();
  await ensureOfferTypesSheet(sheets);
  const read = await safeReadRange(
    sheets,
    `${PREMIUM_OFFERS_TYPES_TAB}!A:D`,
    'offer types list read'
  );
  const rows = read.data.values || [];
  if (rows.length < 2) {
    return DEFAULT_OFFER_TYPES.map((label, index) => ({
      rowNumber: index + 2,
      id: slugifyLabel(label),
      label,
    }));
  }

  return rows
    .slice(1)
    .map((row, index) => mapOfferTypeRow(row, index + 2))
    .filter((item) => item.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr-CA', { sensitivity: 'base' }));
}

async function listFreeSignupLocations({ sheets: providedSheets } = {}) {
  const sheets = providedSheets || await getSheetsClient();
  await ensureFreeSignupLocationsSheet(sheets);
  const read = await safeReadRange(
    sheets,
    `${FREE_SIGNUP_LOCATIONS_TAB}!A:M`,
    'free signup locations list read'
  );
  const rows = read.data.values || [];
  if (rows.length < 2) {
    return DEFAULT_FREE_SIGNUP_LOCATIONS.slice();
  }

  const seen = new Set();
  let hasDefault = false;
  const items = rows
    .slice(1)
    .map((row, index) => mapFreeSignupLocationRow(row, index + 2))
    .filter((item) => item.label && item.u && item.f && item.or)
    .filter((item) => {
      const key = normalizeForCompare(item.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      if (item.is_default && !hasDefault) {
        hasDefault = true;
        return item;
      }
      if (item.is_default && hasDefault) {
        return Object.assign({}, item, { is_default: false });
      }
      return item;
    })
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.label.localeCompare(b.label, 'fr-CA', { sensitivity: 'base' });
    });

  if (!items.length) {
    return DEFAULT_FREE_SIGNUP_LOCATIONS.slice();
  }

  if (!items.some((item) => item.is_default)) {
    items[0].is_default = true;
  }

  return items;
}

async function savePremiumOfferRegion(region) {
  const label = canonicalizeRegionLabel(region && region.label);
  if (!label) {
    throw new Error('Le nom de la region est requis');
  }

  const sheets = await getSheetsClient();
  const regions = await listPremiumOfferRegions({ sheets });
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

async function savePremiumOfferType(offerType) {
  const label = canonicalizeOfferTypeLabel(offerType && offerType.label);
  if (!label) {
    throw new Error("Le type d'offre est requis");
  }

  const sheets = await getSheetsClient();
  const offerTypes = await listPremiumOfferTypes({ sheets });
  const existingItem = offerTypes.find(
    (item) => normalizeForCompare(item.label) === normalizeForCompare(label)
  );
  if (existingItem) {
    return { id: existingItem.id, updated: false };
  }

  const timestamp = new Date().toISOString();
  const values = [[slugifyLabel(label), label, timestamp, timestamp]];
  await safeAppendRows(
    sheets,
    `${PREMIUM_OFFERS_TYPES_TAB}!A:D`,
    values,
    'offer type append'
  );
  return { id: values[0][0], created: true };
}

async function writeFreeSignupLocationsSheet(sheets, items) {
  const timestamp = new Date().toISOString();
  const existingRead = await safeReadRange(
    sheets,
    `${FREE_SIGNUP_LOCATIONS_TAB}!A:M`,
    'free signup locations rewrite read'
  );
  const existingRowCount = Math.max((existingRead.data.values || []).length, 1);
  const normalizedItems = items.map((item, index) => ({
    id: normalize(item.id) || slugifyLabel(item.label) || `free_signup_location_${Date.now()}_${index}`,
    label: normalize(item.label),
    u: normalize(item.u),
    f: normalize(item.f),
    s: normalize(item.s),
    c: normalize(item.c || '0'),
    m: normalize(item.m || '0'),
    act: normalize(item.act || 'sub'),
    v: normalize(item.v || '2'),
    or: normalize(item.or),
    is_default: index === 0 ? true : normalizeBoolean(item.is_default, false),
    created_at: normalize(item.created_at) || timestamp,
    updated_at: timestamp,
  }));

  const rows = normalizedItems.map((item) => [
    item.id,
    item.label,
    item.u,
    item.f,
    item.s,
    item.c,
    item.m,
    item.act,
    item.v,
    item.or,
    item.is_default ? 'true' : 'false',
    item.created_at,
    item.updated_at,
  ]);
  const totalDataRows = Math.max(rows.length + 1, existingRowCount);
  const blankRow = new Array(FREE_SIGNUP_LOCATION_HEADERS.length).fill('');
  const paddedRows = rows.concat(
    Array.from({ length: Math.max(0, totalDataRows - (rows.length + 1)) }, () => blankRow.slice())
  );

  await safeWriteRange(
    sheets,
    `${FREE_SIGNUP_LOCATIONS_TAB}!A1:M${totalDataRows}`,
    [FREE_SIGNUP_LOCATION_HEADERS, ...paddedRows],
    'free signup locations overwrite'
  );
}

async function saveFreeSignupLocation(location) {
  const label = normalize(location && location.label);
  if (!label) {
    throw new Error('Le nom de la ville est requis');
  }

  const resolvedConfig = await resolveFreeSignupEmbedConfig(location);

  const sheets = await getSheetsClient();
  const existingItems = await listFreeSignupLocations({ sheets });
  const requestedId = normalize(location.id);
  const duplicateByLabel = existingItems.find(
    (item) =>
      normalizeForCompare(item.label) === normalizeForCompare(label) &&
      item.id !== requestedId
  );
  if (duplicateByLabel) {
    throw new Error('Une ville avec ce nom existe deja');
  }

  const nextItems = existingItems.map((item) => Object.assign({}, item));
  const existingIndex = nextItems.findIndex((item) => item.id === requestedId);
  const current = existingIndex >= 0 ? nextItems[existingIndex] : null;
  const nextItem = {
    id: requestedId || slugifyLabel(label) || `free_signup_location_${Date.now()}`,
    label,
    u: resolvedConfig.u,
    f: resolvedConfig.f,
    s: resolvedConfig.s,
    c: resolvedConfig.c,
    m: resolvedConfig.m,
    act: resolvedConfig.act,
    v: resolvedConfig.v,
    or: resolvedConfig.or,
    is_default: normalizeBoolean(location.is_default, current ? current.is_default : false),
    created_at: current ? current.created_at : '',
  };

  if (existingIndex >= 0) {
    nextItems[existingIndex] = Object.assign({}, current, nextItem);
  } else {
    nextItems.push(nextItem);
  }

  let finalItems = nextItems;
  if (nextItem.is_default) {
    finalItems = nextItems.map((item) =>
      Object.assign({}, item, { is_default: item.id === nextItem.id })
    );
  } else if (!nextItems.some((item) => item.is_default)) {
    finalItems = nextItems.map((item, index) =>
      Object.assign({}, item, { is_default: index === 0 })
    );
  }

  finalItems.sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.label.localeCompare(b.label, 'fr-CA', { sensitivity: 'base' });
  });

  await writeFreeSignupLocationsSheet(sheets, finalItems);
  return { id: nextItem.id, updated: existingIndex >= 0, created: existingIndex < 0 };
}

async function deletePremiumOfferRegion(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Region id is required');
  }

  const sheets = await getSheetsClient();
  const [regions, offers] = await Promise.all([
    listPremiumOfferRegions({ sheets }),
    listPremiumOffers({ includeInactive: true, sheets }),
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

async function deletePremiumOfferType(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Offer type id is required');
  }

  const sheets = await getSheetsClient();
  const [offerTypes, offers] = await Promise.all([
    listPremiumOfferTypes({ sheets }),
    listPremiumOffers({ includeInactive: true, sheets }),
  ]);
  const existingItem = offerTypes.find((item) => item.id === normalizedId);
  if (!existingItem) {
    throw new Error('Offer type not found');
  }

  const usedByOffer = offers.some(
    (offer) => normalizeForCompare(offer.filtre_offre || offer.offer_type) === normalizeForCompare(existingItem.label)
  );
  if (usedByOffer) {
    throw new Error("Impossible de supprimer un type d'offre utilise par une offre");
  }

  await deleteOfferRows(
    sheets,
    [{ rowNumber: existingItem.rowNumber }],
    PREMIUM_OFFERS_TYPES_TAB
  );

  return { deleted: true, id: normalizedId };
}

async function setDefaultFreeSignupLocation(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Free signup location id is required');
  }

  const sheets = await getSheetsClient();
  const items = await listFreeSignupLocations({ sheets });
  const existingItem = items.find((item) => item.id === normalizedId);
  if (!existingItem) {
    throw new Error('Free signup location not found');
  }

  const nextItems = items.map((item) =>
    Object.assign({}, item, { is_default: item.id === normalizedId })
  );
  nextItems.sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.label.localeCompare(b.label, 'fr-CA', { sensitivity: 'base' });
  });

  await writeFreeSignupLocationsSheet(sheets, nextItems);
  return { updated: true, id: normalizedId };
}

async function deleteFreeSignupLocation(id) {
  const normalizedId = normalize(id);
  if (!normalizedId) {
    throw new Error('Free signup location id is required');
  }

  const sheets = await getSheetsClient();
  const items = await listFreeSignupLocations({ sheets });
  const existingItem = items.find((item) => item.id === normalizedId);
  if (!existingItem) {
    throw new Error('Free signup location not found');
  }
  if (items.length <= 1) {
    throw new Error('Impossible de supprimer la derniere ville');
  }

  let nextItems = items.filter((item) => item.id !== normalizedId);
  if (existingItem.is_default && nextItems.length) {
    nextItems = nextItems.map((item, index) =>
      Object.assign({}, item, { is_default: index === 0 })
    );
  }
  nextItems.sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.label.localeCompare(b.label, 'fr-CA', { sensitivity: 'base' });
  });

  await writeFreeSignupLocationsSheet(sheets, nextItems);
  return { deleted: true, id: normalizedId };
}

async function listPremiumShowcaseItems({ includeInactive = false, sheets: providedSheets } = {}) {
  const sheets = providedSheets || await getSheetsClient();
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
  const items = await listPremiumShowcaseItems({ includeInactive: true, sheets });
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
  const items = await listPremiumShowcaseItems({ includeInactive: true, sheets });
  const existingItem = items.find((item) => item.id === normalizedId);
  if (!existingItem) {
    throw new Error('Showcase item not found');
  }

  await deleteOfferRows(sheets, [existingItem], PREMIUM_OFFERS_SHOWCASE_TAB);
  return { deleted: true, id: normalizedId };
}

async function listPremiumOfferAccessLogs({ limit = 100, sheets: providedSheets } = {}) {
  const sheets = providedSheets || await getSheetsClient();
  await ensureAccessLogsSheet(sheets);
  const read = await safeReadRange(
    sheets,
    `${PREMIUM_OFFERS_ACCESS_LOGS_TAB}!A:F`,
    'access logs list read'
  );
  const rows = read.data.values || [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .map((row, index) => mapAccessLogRow(row, index + 2))
    .filter((item) => item.email)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, Math.max(1, limit));
}

async function recordPremiumOfferAccessLog(entry) {
  const email = normalize(entry && entry.email).toLowerCase();
  if (!email) {
    throw new Error('Access log email is required');
  }

  const sheets = await getSheetsClient();
  await ensureAccessLogsSheet(sheets);
  const timestamp = new Date().toISOString();
  const values = [[
    `access_log_${Date.now()}`,
    email,
    timestamp,
  ]];
  await safeAppendRows(
    sheets,
    `${PREMIUM_OFFERS_ACCESS_LOGS_TAB}!A:C`,
    values,
    'access log append'
  );
  return { id: values[0][0], created: true };
}

module.exports = {
  PREMIUM_OFFERS_TAB,
  PREMIUM_OFFERS_REGIONS_TAB,
  PREMIUM_OFFERS_TYPES_TAB,
  FREE_SIGNUP_LOCATIONS_TAB,
  PREMIUM_OFFERS_SHOWCASE_TAB,
  PREMIUM_OFFERS_ACCESS_LOGS_TAB,
  OFFER_HEADERS,
  REGION_HEADERS,
  OFFER_TYPE_HEADERS,
  FREE_SIGNUP_LOCATION_HEADERS,
  SHOWCASE_HEADERS,
  ACCESS_LOG_HEADERS,
  DEFAULT_REGIONS,
  DEFAULT_OFFER_TYPES,
  DEFAULT_FREE_SIGNUP_LOCATIONS,
  DEFAULT_SHOWCASE_ITEMS,
  normalize,
  normalizeForCompare,
  canonicalizeRegionLabel,
  canonicalizeOfferTypeLabel,
  dedupeRegionsForCleanup,
  parseEventStartDate,
  isExpiredOffer,
  buildDeleteRowsRequests,
  getSheetsClient,
  getMissingSheetEnvVars,
  listPremiumOffers,
  listPremiumOfferRegions,
  listPremiumOfferTypes,
  listFreeSignupLocations,
  listPremiumOfferAccessLogs,
  listPremiumShowcaseItems,
  recordPremiumOfferAccessLog,
  savePremiumOffer,
  savePremiumOfferRegion,
  savePremiumOfferType,
  saveFreeSignupLocation,
  savePremiumShowcaseItem,
  deletePremiumOffer,
  deletePremiumOfferRegion,
  deletePremiumOfferType,
  setDefaultFreeSignupLocation,
  deleteFreeSignupLocation,
  deletePremiumShowcaseItem,
};
