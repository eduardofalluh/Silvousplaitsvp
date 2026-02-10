# Bot protection (reCAPTCHA Enterprise + honeypot)

The signup forms use:

1. **Honeypot** – A hidden field; if a bot fills it, the submission is ignored.
2. **reCAPTCHA Enterprise** – Verification runs when the user clicks “S’inscrire”. No visible checkbox; the challenge may appear only when Google deems it necessary. The token is verified on the server via the Enterprise Assessment API before the email is sent to ActiveCampaign.

## What you need in Netlify

- **RECAPTCHA_SECRET_KEY** – In reCAPTCHA Enterprise this is the **Google Cloud API key** used to call the Assessment API (not the “secret key” from the key pair).
  - In [Google Cloud Console](https://console.cloud.google.com): **APIs & Services** → **Credentials** → **Create credentials** → **API key**.
  - Enable **reCAPTCHA Enterprise API** for the project (APIs & Services → Library → search “reCAPTCHA Enterprise”).
  - Put that API key in Netlify as **RECAPTCHA_SECRET_KEY**.
- **RECAPTCHA_PROJECT_ID** (optional) – Your Google Cloud project ID (e.g. `silvousplaitsvp-1770746538963`). The function has a default; set this only if you use a different project.

## Flow

1. User enters email and clicks **S’inscrire**.
2. Page shows “Vérification en cours…”, then calls `grecaptcha.enterprise.execute(SITE_KEY, { action: 'signup' })`.
3. Google returns a token (and may show a challenge if needed).
4. The token is sent to `/.netlify/functions/submit-signup`.
5. The function calls the reCAPTCHA Enterprise Assessment API to verify the token.
6. If verification succeeds, the function forwards the signup to ActiveCampaign and returns the result; the user sees success or an error message.

## Local testing

Run `netlify dev` and set **RECAPTCHA_SECRET_KEY** (and **RECAPTCHA_PROJECT_ID** if needed) in Netlify or in a `.env` file so the function can call the Assessment API.
