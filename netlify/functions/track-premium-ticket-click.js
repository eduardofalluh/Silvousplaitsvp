const premiumChecker = require('../../utils/premium-checker');
const { verifySignedToken } = require('../../utils/premium-access-token');
const {
  getMissingSheetEnvVars,
  listPremiumOffers,
  normalize,
  recordPremiumOfferAccessLog,
} = require('../../utils/premium-offers-store');
const { buildJsonHeaders, isAllowedOrigin } = require('../../utils/http-security');

const SECRET = process.env.PREMIUM_ACCESS_SECRET || '';

function verifyAccountSession(session) {
  const result = verifySignedToken(String(session || ''), SECRET);
  if (!result.valid) return { ok: false, reason: result.reason };
  const payload = result.payload || {};
  if (payload.kind !== 'session' || !payload.e) return { ok: false, reason: 'invalid_session' };
  return { ok: true, email: String(payload.e || '').trim().toLowerCase() };
}

exports.handler = async (event) => {
  const headers = buildJsonHeaders(event, { noStore: true });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!isAllowedOrigin(event)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Account session secret missing on server' }) };

  const missing = getMissingSheetEnvVars();
  if (missing.length) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Missing env vars: ${missing.join(', ')}` }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const session = verifyAccountSession(body.session);
  if (!session.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired session', reason: session.reason }) };
  }

  const offerId = normalize(body.offerId || body.offer_id);
  if (!offerId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'offerId is required' }) };

  try {
    const premiumStatus = await premiumChecker.isPremiumMember(session.email, false);
    if (!premiumStatus || !premiumStatus.isPremium) {
      return { statusCode: 403, headers, body: JSON.stringify({ logged: false, reason: 'not-premium' }) };
    }

    const offers = await listPremiumOffers({ includeInactive: false });
    const offer = offers.find((item) => item.id === offerId);
    if (!offer) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Offer not found' }) };
    if (!normalize(offer.ticket_url)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Offer has no ticket URL' }) };

    const result = await recordPremiumOfferAccessLog({
      email: session.email,
      eventType: 'ticket_click',
      offerId: offer.id,
      offerTitle: offer.title,
      ticketUrl: offer.ticket_url,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, logged: true, ...result }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'Failed to track ticket click' }) };
  }
};
