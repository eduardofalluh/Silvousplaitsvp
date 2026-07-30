# Silvousplait — Promotion & Post-Promotion Testing Checklist

Everything built on the `redesign` branch / staging (`silvousplait-accueil-cd-260034f03b`)
that needs to be re-tested once promoted to the **live production site**.

Legend: **⚠️ NOT verifiable on staging** = only mocked or partially tested; must be
tested for real on prod. ✅ = already verified on staging (still worth a quick sanity check).

---

## PART 0 — Promotion steps (do these first)

- [ ] Merge `redesign` → `main` (or deploy the `site/` build to the prod site).
- [ ] Confirm prod has all required env vars (it's the live backend, so most exist):
      `ACTIVECAMPAIGN_API_URL/KEY`, Google Sheets creds (`PREMIUM_OFFERS_SHEET_ID` +
      service-account key), `PREMIUM_ACCESS_SECRET`, `SMTP_USER/PASS`, `SENDER_EMAIL`,
      admin auth secret, `STRIPE_SECRET_KEY`, and a Stripe **yearly price id**
      (`STRIPE_PREMIUM_YEARLY_PRICE_ID` or `STRIPE_PREMIUM_PRICE_ID`).
      - Note: on staging the yearly price id used is **`price_1Sr3mfRiXUzwt55BNCxwCjTN`**
        ($60/yr, "Silvousplait Premium 60$"). Prod should already have its own — verify it resolves.
- [ ] **`video_url` sheet column:** on the first admin login after promotion, the code
      auto-adds a `video_url` header to column **O** of the `premium_offers` sheet.
      Confirm the column appears and no error shows (it's additive/empty — safe).
- [ ] **Archive storage decision** (currently NOT working — see Part 8): either add a
      `NETLIFY_BLOBS_TOKEN` + `NETLIFY_SITE_ID` env, or switch the archive to a Google
      Sheet tab. Until then the archive page shows empty.
- [ ] **Rotate exposed keys** (surfaced in earlier CLI output): ActiveCampaign API key
      and the Stripe read key.
- [ ] Remove/ignore the neutralized `_tmp-list-stripe-prices` endpoint — it's absent from
      git source, so prod won't have it (staging returns 410).

---

## PART 1 — Home page & loader

- [ ] ✅ Intro loader plays: 3s white screen, title "Trouve ton prochain spectacle à petit
      prix" + trompette, then slide-down reveal. **Test on mobile too.**
- [ ] ✅ No flash of the page before the loader; can't scroll to see the loader mid-animation.
- [ ] ✅ Reloading any page returns to the top.
- [ ] ✅ Trust-logo links open (Radio-Canada, Espace GO, La Vitrine, etc.).
- [ ] ✅ "Comment ça marche" step cards + free-plan "S'inscrire gratuitement" scroll to top.
- [ ] ✅ Homepage FAQ ("Questions fréquentes") accordion opens/closes.

## PART 2 — Free newsletter signup (hero + funnel)

- [ ] ⚠️ Homepage hero email → goes to tunnel with email pre-filled → complete the quiz
      (ville / interests / tranche / prénom / premium-interest) → submit.
- [ ] ⚠️ **Verify in ActiveCampaign** the new contact has: correct **city list**
      (Montréal→4, Québec→8, Trois-Rivières→9, Sherbrooke→10), **interest tags**,
      **tranche tag**, and premium-interest tag (`intérêt premium` or `refusé-premium-site`).
- [ ] ⚠️ Meta pixel `Lead` fires only on a real successful subscribe (not double-counting).
- [ ] Incomplete-inscription popup appears if you start the funnel and try to leave.

## PART 3 — Premium & Stripe  ⚠️ (biggest thing to test for real)

- [ ] ⚠️ "Passer en Premium" / "Commencer à économiser" → real Stripe Checkout opens.
- [ ] ⚠️ Complete a **real purchase** (use a real card, then cancel/refund) OR your normal
      test method → confirm:
      - [ ] Redirects to `premium-confirmation.html`.
      - [ ] Subscription created in Stripe.
      - [ ] Webhook fires → contact gets the **Premium tag** in AC + correct **interval tag**
            (monthly vs yearly — this was a bug fixed on the branch; verify it's right).
- [ ] ✅ Checkout button resets from "Redirection…" when you hit **Back** from Stripe.
- [ ] ⚠️ Premium-click tag `a-cliqué-premium-siteweb` applied when a known contact clicks.

## PART 4 — Connexion / Compte  ⚠️

- [ ] ⚠️ Request login code → **email arrives** → enter code → logged in.
- [ ] ⚠️ Compte shows the member's **real** name / info (not a placeholder).
- [ ] ⚠️ A **non-premium** subscriber can also log in and see their info.
- [ ] ⚠️ "Se désinscrire de l'infolettre" → confirm the contact's AC list status becomes
      unsubscribed (2).
- [ ] Compte offer **filters** (search / type / region) work.
- [ ] "Se déconnecter" + "Retour au site" links work.

## PART 5 — Premium offers + VIDEO  ⚠️

- [ ] ⚠️ Admin → add/edit an offer with a **video URL** (YouTube/Vimeo/.mp4) and/or an
      **image**, plus the drag-and-drop file zone → **Save** → confirm it persists to the sheet
      (and the `video_url` column is populated).
- [ ] ⚠️ On premium carousel + compte grid, that offer shows the **video** (autoplay, muted,
      loop) — YouTube/Vimeo as embed, .mp4 as native video, else the image.
- [ ] ⚠️ Offer-view tracking tag `a-vu-offre-premium` applied for a known contact.
- [ ] Premium page urgency bar text ("… abonne toi avant l'envoi !") + countdown.

## PART 6 — Admin (full CRUD against the live sheet)  ⚠️

- [ ] ⚠️ Admin password gate → opens (this is also what auto-adds the `video_url` column).
- [ ] ⚠️ Regions add/remove, offer-types add/remove, cities (free-signup locations) add/edit/remove.
- [ ] ⚠️ Offers add / edit / delete — all persist correctly to `premium_offers`.

## PART 7 — Partenariat & Contact  ⚠️

- [ ] ⚠️ Partenariat form (interest selector + fields) → email arrives at
      **promotion@silvousplaitsvp.com** with the selected interests included.
- [ ] ⚠️ Contact form → email arrives at **spectacles@silvousplaitsvp.com**.

## PART 8 — Archive (currently NOT working — needs a decision)

- [ ] ⚠️ Archive page (`archive.html`) — will stay **empty** until either:
      - a Netlify Blobs token is configured, **or**
      - it's switched to a Google-Sheet-tab archive (recommended, more robust).
      Then: verify an offer whose date has passed appears in the archive.

## PART 9 — Cross-cutting

- [ ] ✅ Mobile responsive on every page (no horizontal overflow, content reflows).
- [ ] ✅ FAQ accordions on `faq.html` and `premium.html`.
- [ ] ✅ Page-to-page transitions + hover animations (respect reduced-motion).
- [ ] GTM / Meta pixel loads; Microsoft Clarity records.
- [ ] No console errors on any page; no broken links / 404s (note: Netlify "Pretty URLs"
      serves `/premium` instead of `premium.html` — that's expected).
- [ ] Countdown timer counts down to next Monday.

---

### Known items carried into promotion
- Archive storage (Part 8) is the one feature not functioning yet.
- Video persistence depends on the `video_url` column being added (auto on first admin login).
- Real payment / real email / real sheet-write flows were only mocked or partially tested on
  staging — Parts 2–8 marked ⚠️ are the priority to test for real on prod.
