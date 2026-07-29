/**
 * Archive snapshot: read current premium offers from the Sheet (RAW, read-only,
 * NO pruning — never calls listPremiumOffers which deletes expired rows) and
 * upsert each into a Netlify Blobs store. The Blobs store is separate from the
 * Sheet, so this never changes any live Sheet value. Over time the archive
 * accumulates offers so they survive after they expire and are pruned.
 */
const { getStore } = require('@netlify/blobs');
const { getSheetsClient } = require('../../utils/premium-offers-store');

const SHEET_ID = process.env.PREMIUM_OFFERS_SHEET_ID || process.env.GOOGLE_SHEET_ID;
const TAB = process.env.PREMIUM_OFFERS_TAB || 'premium_offers';

// Blobs auto-configures on a normal Netlify (build/git) deploy. Under manual
// CLI deploys it needs explicit siteID + token via env.
function archiveStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
  return siteID && token
    ? getStore({ name: 'premium-offers-archive', siteID, token })
    : getStore('premium-offers-archive');
}

const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!SHEET_ID) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Sheet not configured' }) };

  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: TAB });
    const rows = (res.data && res.data.values) || [];
    if (rows.length < 2) return { statusCode: 200, headers, body: JSON.stringify({ snapshotted: 0 }) };
    const cols = rows[0].map((h) => String(h || '').trim().toLowerCase());
    const idx = (name) => cols.indexOf(name);
    const store = archiveStore();
    let n = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (name) => { const i = idx(name); return i >= 0 ? (row[i] || '') : ''; };
      const id = String(get('id') || '').trim();
      if (!id) continue;
      const offer = {
        id,
        title: get('title'),
        region: get('region'),
        offer_type: get('offer_type') || get('offer type'),
        venue: get('venue'),
        event_date: get('event_date') || get('date_evenement') || get('date'),
        image_url: get('image_url') || get('image'),
        archived_at: new Date().toISOString(),
      };
      await store.setJSON(id, offer);
      n += 1;
    }
    return { statusCode: 200, headers, body: JSON.stringify({ snapshotted: n }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message || 'snapshot failed' }) };
  }
};
