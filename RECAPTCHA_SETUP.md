# Bot protection (honeypot only)

The signup forms use a **honeypot** to block basic bots:

- A hidden field (`website`) is in the form. Humans don’t see it and leave it empty.
- Bots often fill every field. If `website` is filled, the server treats the request as a bot: it does **not** send the email to ActiveCampaign and returns a fake success so the bot doesn’t retry.

**No reCAPTCHA, no API keys, no env vars.** Deploy and it works.

If you want stronger protection later (e.g. reCAPTCHA), you can add it and wire it to the same Netlify function.
