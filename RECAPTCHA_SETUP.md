# Bot protection (reCAPTCHA v2 + honeypot)

The signup forms use:

1. **Honeypot** – A hidden field; if a bot fills it, the submission is ignored.
2. **Google reCAPTCHA v2** – The “I’m not a robot” checkbox. When needed, users get the image challenge (“Select all images with…”). The response is verified on the server before the email is sent to ActiveCampaign.

## Production setup

### 1. Get reCAPTCHA keys

1. Go to [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin).
2. Register a new site:
   - **Label:** e.g. Silvousplait signup
   - **reCAPTCHA type:** reCAPTCHA v2 → “I’m not a robot” Checkbox
   - **Domains:** `silvousplaitsvp.com` (and `localhost` if you test locally)
3. Accept the terms and submit. Copy the **Site key** and **Secret key**.

### 2. Use your keys

- **Site key (public):** In `index.html`, replace the reCAPTCHA `data-sitekey` in both forms:
  - Find: `data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"` (test key)
  - Replace with your **Site key**.
- **Secret key:** In Netlify:
  - **Site configuration** → **Environment variables**
  - Add: **RECAPTCHA_SECRET_KEY** = your **Secret key**
  - Redeploy so the function gets the new variable.

### 3. Test keys (development only)

The project uses Google’s **test keys** so the checkbox works without configuration:

- **Site key (in HTML):** `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`
- **Secret key (for Netlify):** `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`

Use these only for testing. For production, switch to your own keys as above.

### 4. Local testing

Signup goes through `/.netlify/functions/submit-signup`. Run `netlify dev` and set `RECAPTCHA_SECRET_KEY` in Netlify (or in `.env` for `netlify dev`) to the test secret so the function can verify the token.
