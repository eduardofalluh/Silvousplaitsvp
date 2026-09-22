const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL || '';
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY || '';
const FALLBACK_COUNT = Number(process.env.NEWSLETTER_FALLBACK_COUNT || 5627);
const CITY_LIST = (() => {
  try {
    if (process.env.AC_CITY_LIST_MAP) return JSON.parse(process.env.AC_CITY_LIST_MAP);
  } catch {
    /* ignore */
  }
  return { montreal: '4', quebec: '8', 'trois-rivieres': '9', sherbrooke: '10' };
})();
const LIST_IDS = [...new Set(Object.values(CITY_LIST).concat([process.env.ACTIVECAMPAIGN_FREE_LIST_ID || '4']).filter(Boolean).map((id) => String(id).trim()))];
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

async function acApi(path) {
  const res = await fetch(`${AC_API_URL}/api/3/${path}`, {
    headers: { 'Api-Token': AC_API_KEY, Accept: 'application/json' },
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error('ActiveCampaign count failed');
  return data;
}

function totalFrom(data) {
  const metaTotal = data && data.meta && Number(data.meta.total);
  if (Number.isFinite(metaTotal)) return metaTotal;
  const contacts = data && Array.isArray(data.contacts) ? data.contacts.length : 0;
  return contacts;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!AC_API_URL || !AC_API_KEY) return { statusCode: 200, headers, body: JSON.stringify({ count: FALLBACK_COUNT, fallback: true }) };
  try {
    let count = 0;
    let successes = 0;
    const failedLists = [];
    for (const listId of LIST_IDS) {
      try {
        const data = await acApi(`contacts?listid=${encodeURIComponent(listId)}&filters[status]=1&limit=1`);
        count += totalFrom(data);
        successes += 1;
      } catch (error) {
        failedLists.push(listId);
        console.warn(`Newsletter count skipped list ${listId}: ${error.message || 'ActiveCampaign error'}`);
      }
    }
    if (!successes) throw new Error('No ActiveCampaign list counts available');
    return { statusCode: 200, headers, body: JSON.stringify({ count, fallback: false, partial: failedLists.length > 0 }) };
  } catch (error) {
    console.error(error.message || 'Newsletter count failed');
    return { statusCode: 200, headers, body: JSON.stringify({ count: FALLBACK_COUNT, fallback: true }) };
  }
};
