# September 9, 2026 client updates

The Premium page trial popup now waits 30 seconds. The signup funnel trial popup has a wider, responsive layout with benefits, pricing and a distinct free-plan action. Dismissing it continues the free signup.

The protected admin page now shows free-token redemption history (email, unlocked offer, date), with search and refresh. It reads the existing `free_offer_redemptions` sheet, including historical records and deleted offers, and uses the same earliest-row winner as redemption. The allowance remains one token.

The partnership form accepts an optional phone number. It is included in the ActiveCampaign contact's standard phone field, the contact note and both versions of the notification email. Empty phone input does not overwrite an existing phone.

## Double opt-in

Both signup functions now pass `contact.form` to `POST /api/3/contact/sync`. They first verify that the selected form has double opt-in enabled and a subscribe-to-list action. The tunnel also verifies that the action targets the selected city's list. Neither function writes an active membership as a fallback. Existing active subscribers are not resubmitted; unconfirmed contacts may submit the form again. Enrichment failures do not turn an accepted signup into a retry.

`subscribed: true` means the provider accepted the form submission; `confirmationPending: true` tells clients confirmation is still required. It is not proof of inbox delivery. The success page instructs visitors to click the confirmation link.

Production form mapping, verified September 9:

| City | Form | List |
| --- | --- | --- |
| Montréal | 1 | 4 |
| Québec | 9 | 8 |
| Trois-Rivières | 11 | 9 |
| Sherbrooke | 13 | 10 |

Québec form 9 previously targeted list 4. Its action was corrected to list 8 through the ActiveCampaign API; its double opt-in settings were preserved. `AC_CITY_FORM_MAP` can override form IDs alongside `AC_CITY_LIST_MAP` for list IDs.

References: [contact sync and form behavior](https://developers.activecampaign.com/reference/sync-a-contacts-data), [form updates](https://developers.activecampaign.com/reference/update-a-form).

## Existing unconfirmed contacts

A read-only production query confirmed 466 unconfirmed contacts on September 9. Deploying the signup fix does not resend emails to these existing contacts or activate them. No recovery emails were sent in bulk during this update.

After verifying a new signup using an inbox controlled by the site owner, use ActiveCampaign's Contacts → Unconfirmed → contact dropdown → Resend Opt-in for the affected contacts. Verify the first recovery email's arrival and activity before continuing. Keep the contacts unconfirmed until they click their own link. ActiveCampaign documents individual resends and does not offer a bulk resend button: [resend instructions](https://help.activecampaign.com/hc/en-us/articles/220345728-How-do-I-resend-an-opt-in-confirmation-email).

## Verification

- `npm test`: isolated backend regressions; provider and SMTP calls are mocked.
- `npx playwright install chromium` (first run), then `npm run test:e2e`: desktop and mobile browser checks. External tracking and provider calls are blocked or mocked.
- `npm run test:live-bot`: production honeypot smoke check, which must not create a contact or send email.
- Live email acceptance, inbox arrival and confirmation require a test inbox. Mock tests alone cannot establish email delivery.

Production Netlify project: `silvousplaitsvp` (`f881f52f-2290-4f81-a610-f375a169f992`), serving `https://silvousplaitsvp.com`. The former local link pointed at a separate preview project. Publish `site/` with `netlify/functions/` using `netlify.toml`; do not deploy the repository root.
