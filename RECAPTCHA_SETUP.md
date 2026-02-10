# Bot protection (reCAPTCHA + honeypot)

The signup forms use:

1. **Honeypot** – A hidden field; if a bot fills it, the submission is ignored.
2. **reCAPTCHA** – “I'm not a robot” checkbox (and image challenge when needed). The site supports **reCAPTCHA Enterprise** (Google Cloud) and **reCAPTCHA v2** (classic).

---

## reCAPTCHA Enterprise (current setup)

Your key is an **Enterprise** key (from Google Cloud). The page loads `enterprise.js` and the backend verifies with the **Assessment API**.

### Netlify environment variables

- **RECAPTCHA_SECRET_KEY** = your **Google Cloud API key** (starts with `AIzaSy...`).  
  Create in [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create credentials → API key. Enable **reCAPTCHA Enterprise API** for the project.
- **RECAPTCHA_PROJECT_ID** = your **Google Cloud project ID** (e.g. `my-project-123`).  
  Find it in Google Cloud Console in the project selector or in Project settings.

If you see “Invalid key type” on the page, the HTML was using the classic script with an Enterprise key; the site now uses the Enterprise script so that error should be gone.

---

## reCAPTCHA v2 (alternative)

If you prefer the **classic** reCAPTCHA (no Cloud API key):

1. Create a key at [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin) → reCAPTCHA v2 → “I'm not a robot” Checkbox.
2. Put the **site key** in `index.html` in both `data-sitekey` attributes.
3. In Netlify set **RECAPTCHA_SECRET_KEY** to the **secret key** (the v2 secret, not an `AIza...` key).
4. Change the script in `index.html` back to:  
   `https://www.google.com/recaptcha/api.js`

The backend detects the key type: if `RECAPTCHA_SECRET_KEY` starts with `AIza`, it uses Enterprise; otherwise it uses v2 siteverify.

---

## Flow

1. User enters email, checks “I'm not a robot” (and completes the image challenge if shown).
2. User clicks **S'inscrire**; the token is sent to `/.netlify/functions/submit-signup`.
3. The function verifies the token (Enterprise or v2), then forwards the signup to ActiveCampaign.
4. The user sees success or an error message.
