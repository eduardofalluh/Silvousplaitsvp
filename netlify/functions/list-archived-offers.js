// Public: list archived (past) premium offers from the Google Sheet archive tab.
const {
  getMissingSheetEnvVars,
  listArchivedOffers,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

function sanitizePublicOffer(offer) {
  return {
    id: offer.id,
    title: offer.title,
    region: offer.region,
    offer_type: offer.filtre_offre || offer.offer_type,
    venue: offer.venue,
    event_date: offer.event_date,
    image_url: offer.image_url,
    video_url: offer.video_url,
    description: offer.description,
    show_on_premium_carousel: offer.show_on_premium_carousel !== false,
    show_on_form_carousel: offer.show_on_form_carousel !== false,
  };
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { noStore: true });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!isAllowedOrigin(event)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const missing = getMissingSheetEnvVars();
  if (missing.length) return { statusCode: 500, headers, body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }) };

  try {
    const offers = await listArchivedOffers({ includeInactive: false });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, offers: offers.map(sanitizePublicOffer) }) };
  } catch (error) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, offers: [], note: error.message || 'archive-unavailable' }) };
  }
};
