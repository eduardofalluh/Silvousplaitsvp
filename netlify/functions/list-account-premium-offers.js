const premiumChecker = require('../../utils/premium-checker');
const { verifySignedToken } = require('../../utils/premium-access-token');
const {
  getMissingSheetEnvVars,
  listPremiumOffers,
  getFreeOfferRedemption,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';

function fullOffer(offer) {
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
    promo_code: offer.promo_code,
    ticket_url: offer.ticket_url,
    extra_fields: offer.extra_fields || {},
    details_unlocked: true,
  };
}

function previewOffer(offer) {
  return {
    id: offer.id,
    title: offer.title,
    region: offer.region,
    offer_type: offer.filtre_offre || offer.offer_type,
    venue: offer.venue,
    event_date: offer.event_date,
    image_url: offer.image_url,
    video_url: offer.video_url,
    details_unlocked: false,
  };
}

function freeTokenPayload(redemption) {
  return redemption ? {
    used: true,
    offerId: redemption.offer_id,
    offerTitle: redemption.offer_title,
    redeemedAt: redemption.redeemed_at,
  } : {
    used: false,
  };
}

function verifyAccountSession(session) {
  const result = verifySignedToken(String(session || ''), SECRET);
  if (!result.valid) return { ok: false, reason: result.reason };
  const payload = result.payload || {};
  if (payload.kind !== 'session' || !payload.e) return { ok: false, reason: 'invalid_session' };
  return { ok: true, email: String(payload.e || '').trim().toLowerCase() };
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { noStore: true });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (!isAllowedOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Account session secret missing on server' }) };
  }

  const missing = getMissingSheetEnvVars();
  if (missing.length) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const session = verifyAccountSession(body.session);
  if (!session.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired session', reason: session.reason }) };
  }

  try {
    const premiumStatus = await premiumChecker.isPremiumMember(session.email, false);
    const isPremium = Boolean(premiumStatus && premiumStatus.isPremium);
    const [offers, redemption] = await Promise.all([
      listPremiumOffers({ includeInactive: false }),
      isPremium ? Promise.resolve(null) : getFreeOfferRedemption(session.email),
    ]);
    const redeemedOfferId = redemption && redemption.offer_id;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: session.email,
        accessLevel: isPremium ? 'premium' : 'free',
        freeToken: freeTokenPayload(redemption),
        offers: offers.map((offer) => {
          if (isPremium || (redeemedOfferId && offer.id === redeemedOfferId)) {
            return fullOffer(offer);
          }
          return previewOffer(offer);
        }),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to load account premium offers' }),
    };
  }
};
