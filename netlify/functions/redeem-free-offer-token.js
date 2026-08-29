const premiumChecker = require('../../utils/premium-checker');
const { verifySignedToken } = require('../../utils/premium-access-token');
const {
  getMissingSheetEnvVars,
  listPremiumOffers,
  redeemFreeOfferToken,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';

function sanitizeOffer(offer) {
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

async function findActiveOffer(offerId) {
  const offers = await listPremiumOffers({ includeInactive: false });
  return offers.find((offer) => offer.id === offerId) || null;
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

  const offerId = String(body.offerId || '').trim();
  if (!offerId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'offerId is required' }) };
  }

  try {
    const premiumStatus = await premiumChecker.isPremiumMember(session.email, false);
    if (premiumStatus && premiumStatus.isPremium) {
      const offer = await findActiveOffer(offerId);
      if (!offer) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Offer not found' }) };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          accessLevel: 'premium',
          offer: sanitizeOffer(offer),
        }),
      };
    }

    const result = await redeemFreeOfferToken({ email: session.email, offerId });
    if (result.alreadyRedeemed) {
      if (result.redemption && result.redemption.offer_id === offerId) {
        const offer = await findActiveOffer(offerId);
        if (!offer) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Offer not found' }) };
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            accessLevel: 'free',
            alreadyRedeemed: true,
            freeToken: freeTokenPayload(result.redemption),
            offer: sanitizeOffer(offer),
          }),
        };
      }

      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: 'Free offer token already used',
          code: 'free_token_used',
          freeToken: freeTokenPayload(result.redemption),
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accessLevel: 'free',
        redeemed: true,
        freeToken: freeTokenPayload(result.redemption),
        offer: sanitizeOffer(result.offer),
      }),
    };
  } catch (error) {
    const statusCode = error.message === 'Offer not found' ? 404 : 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to redeem free offer token' }),
    };
  }
};
