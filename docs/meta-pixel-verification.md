# Meta pixel audit — October 1, 2026

Pixel: `930964623159302`.

Today's reports covered a pixel inactivity warning, missing events beyond PageView,
and a failed final signup. Review found an early Lead regression in commit
555c930, duplicate PremiumClick listeners after offers loaded, and fallback
requests that could overlap with the SDK or disappear during navigation.
The trial Payment Link also ended on Stripe's hosted confirmation screen.

## Event contract

| Event | Trigger |
| --- | --- |
| PageView | Page initialization, once per document |
| Lead | Successful final newsletter form response, once per submission |
| PremiumClick | Premium CTA click or confirmed checkout choice |
| OfferView | Offer card becomes visible |
| InitiateCheckout | Checkout destination is available, immediately before navigation |
| StartTrial | Server verifies a completed Stripe subscription checkout with a trial |
| Subscribe | Server verifies a completed Stripe subscription checkout without a trial |
| PremiumView | Premium page load, once per document (restored from the pre-redesign site) |
| PremiumTrialClick | Trial CTA, immediately before the Stripe Payment Link (restored) |
| Purchase | Alongside StartTrial/Subscribe, with `value` (session amount, or 68.99 for a $0 trial) and `currency` (restored); also on a trial return without a session ID when this browser started a checkout in the last two hours |

Entering an email still saves a partial signup. It does not fire Lead. Failed
responses, bot responses, and already-subscribed responses do not fire Lead.
Repeated clicks on Finish/Skip cannot submit concurrently. Existing event names
are preserved; no historical conversions are fabricated or replayed.

The Meta SDK owns event delivery when loaded. If it cannot load, the fallback
removes the event from the SDK queue before using a keepalive request. This
prevents late SDK loading from replaying it. Pending fallbacks flush when leaving
the page. Loaded SDK privacy decisions are not overridden by fallback requests.
Payment completion events use an ID derived from the verified session and a
browser marker to avoid repeating conversions on refresh.

## Validation

- `npm test`: 35 backend tests passed, including all city forms, provider failure,
  transient read retries, no automatic form-write retries, and verified checkout states.
- `npm run test:e2e`: 46 desktop/mobile browser tests passed.
- Pixel tests cover ready, unavailable, and delayed SDK loading; no early Lead;
  failed signup/retry; bots; existing subscribers; concurrent completion buttons;
  checkout navigation; offer visibility; and payment confirmation reloads.
- Real ActiveCampaign reads confirmed all four city forms have double opt-in and
  the expected list. The reported account returns already subscribed with writes
  blocked during the audit. The earlier provider error could not be reproduced.
- Real Stripe session reads verified both StartTrial and Subscribe classification.
  No payment was created or charged for testing.

## Deployment configuration

The trial Payment Link must redirect after completion to:
`https://silvousplaitsvp.com/premium-confirmation.html?session_id={CHECKOUT_SESSION_ID}&plan=trial`.
Stripe documents this mechanism at
https://docs.stripe.com/payment-links/post-payment.
The paid checkout already uses a confirmation URL with a session ID.

## Verification limits

Browser event generation and transport are distinct from Meta's dashboard
processing and attribution. Events Manager access is needed to confirm the
account's final reporting. Blockers can prevent Meta requests. Live signup-flow
browser checks intercept contact writes so the audit creates no contacts or
confirmation emails. Those checks verify frontend behavior, while backend tests
verify response handling separately.
