/**
 * Read-only archive of PAST premium offers, from the Netlify Blobs store
 * populated by snapshot-offers. Returns offers whose event_date is in the past,
 * newest first. Never touches the Sheet.
 */
const { getStore } = require('@netlify/blobs');

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
  try {
    const store = archiveStore();
    const { blobs } = await store.list();
    const now = Date.now();
    const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' }).catch(() => null)));
    const past = all
      .filter((o) => o && o.event_date && !isNaN(new Date(o.event_date)) && new Date(o.event_date).getTime() < now)
      .sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, offers: past }) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, offers: [], note: 'archive-empty-or-unavailable' }) };
  }
};
