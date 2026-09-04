/* Silvousplait — front-end wiring for the flattened static site.
   Connects the new design to the Netlify functions.
   Vanilla JS, no dependencies, CSP-safe (served from 'self'). */
(function () {
  'use strict';
  var FN = '/.netlify/functions/';
  var EMAIL_KEY = 'svp_email';
  var STRIPE_BILLING_LOGIN_URL = 'https://billing.stripe.com/p/login/14AaEZ2PRgeD4Hogmkb7y00';
  // The 14-day free trial is sold through a Stripe Payment Link, not a
  // server-created Checkout Session: every trial CTA on the site lands here.
  var STRIPE_TRIAL_CHECKOUT_URL = 'https://buy.stripe.com/aFafZj3TV7I7c9Q4DCb7y01';

  function getEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } }
  function setEmail(v) { try { localStorage.setItem(EMAIL_KEY, v); } catch (e) {} }
  function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

  // ---- branded dialog (replaces the browser's native alert) ----
  // window.alert renders the OS/browser chrome — grey box, "silvousplaitsvp.com
  // says…", a system OK button — which looks broken next to the rest of the
  // site and is the first thing a visitor sees when a payment fails. This is the
  // same card treatment the funnel's exit modal uses.
  function svpDialog(opts) {
    var o = opts || {};
    var locked = Boolean(o.locked);
    var prev = document.querySelector('[data-svp-dialog]');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    var overlay = document.createElement('div');
    overlay.setAttribute('data-svp-dialog', '');
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(22,24,43,.55);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .16s ease';

    var card = document.createElement('div');
    card.style.cssText = "background:#FFFEF5;max-width:400px;width:100%;border:1.5px solid #16182B;border-radius:18px;box-shadow:6px 6px 0 #3347CA;padding:26px 24px;text-align:center;transform:translateY(6px) scale(.99);transition:transform .18s cubic-bezier(.2,.8,.2,1)";

    // Optional blue kicker above the title, for dialogs that are an offer
    // rather than a warning.
    if (o.kicker) {
      var kick = document.createElement('div');
      kick.style.cssText = "font:800 11px 'Instrument Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#3347CA;margin-bottom:7px";
      kick.textContent = o.kicker;
      card.appendChild(kick);
    }

    var h = document.createElement('div');
    h.style.cssText = "font:800 19px/1.2 'Bricolage Grotesque',sans-serif;color:#16182B;margin-bottom:8px";
    h.textContent = o.title || 'Oups';

    var p = document.createElement('div');
    p.style.cssText = "font:500 14px/1.5 'Instrument Sans',sans-serif;color:#4A4D66;margin-bottom:18px";
    p.textContent = o.message || '';

    card.appendChild(h); card.appendChild(p);

    // Optional highlighted detail — used to show WHICH address is already
    // subscribed, so the visitor can tell whether it is even their account.
    if (o.detail) {
      var det = document.createElement('div');
      det.style.cssText = "display:block;background:#EEF0FD;color:#3347CA;border-radius:10px;padding:10px 12px;margin-bottom:16px;font:700 13.5px 'Instrument Sans',sans-serif;word-break:break-all";
      det.textContent = o.detail;
      card.appendChild(det);
    }

    // Optional input — used to collect the email before checkout so the
    // duplicate-subscription check can run on it.
    var field = null, fieldErr = null;
    if (o.input) {
      field = document.createElement('input');
      field.type = o.input.type || 'text';
      field.placeholder = o.input.placeholder || '';
      field.value = o.input.value || '';
      field.setAttribute('autocomplete', o.input.autocomplete || 'email');
      field.style.cssText = "box-sizing:border-box;width:100%;border:1.5px solid #E1E0D4;border-radius:10px;padding:13px 14px;font:500 16px 'Instrument Sans',sans-serif;color:#16182B;background:#fff;margin-bottom:8px";
      card.appendChild(field);
      fieldErr = document.createElement('div');
      fieldErr.style.cssText = "min-height:16px;font:600 12px 'Instrument Sans',sans-serif;color:#b00020;margin-bottom:8px;text-align:left";
      card.appendChild(fieldErr);
      field.addEventListener('input', function () { fieldErr.textContent = ''; field.style.borderColor = '#E1E0D4'; });
    }

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.style.cssText = "display:block;width:100%;background:#3347CA;color:#FFFEF5;border:none;border-radius:100px;padding:13px;font:800 14.5px 'Instrument Sans',sans-serif;cursor:pointer";
    ok.textContent = o.confirmLabel || 'Compris';
    if (o.busy || o.confirmDisabled) {
      ok.disabled = true;
      ok.setAttribute('aria-busy', 'true');
      ok.style.cursor = 'wait';
      ok.style.opacity = '.78';
    }
    card.appendChild(ok);

    // Optional secondary action, e.g. "Utiliser une autre adresse".
    if (o.secondaryLabel) {
      var sec = document.createElement('button');
      sec.type = 'button';
      sec.style.cssText = "display:block;width:100%;background:none;border:none;margin-top:10px;font:600 13px 'Instrument Sans',sans-serif;color:#8B8DA0;text-decoration:underline;cursor:pointer";
      sec.textContent = o.secondaryLabel;
      sec.addEventListener('click', function () {
        resolved = true;
        close();
        if (typeof o.onSecondary === 'function') o.onSecondary();
      });
      card.appendChild(sec);
    }
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      card.style.transform = 'none';
    });

    var resolved = false;                        // a button was used
    function close() {
      if (locked) return;
      overlay.style.opacity = '0';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 160);
      document.removeEventListener('keydown', onKey);
      if (!resolved) {
        resolved = true;
        if (typeof o.onDismiss === 'function') o.onDismiss();
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' && field) confirm();
    }
    function confirm() {
      if (field) {
        var v = String(field.value || '').trim();
        var validation = o.input.validate ? o.input.validate(v) : Boolean(v);
        var validationMessage = typeof validation === 'string' ? validation : '';
        var bad = validationMessage ? true : !validation;
        if (bad) {
          fieldErr.textContent = validationMessage || o.input.error || 'Entrée invalide.';
          field.style.borderColor = '#b00020';
          try { field.focus(); } catch (e) {}
          return;                                   // keep the dialog open
        }
        resolved = true;
        close();
        if (typeof o.onConfirm === 'function') o.onConfirm(v);
        return;
      }
      resolved = true;
      close();
      if (typeof o.onConfirm === 'function') o.onConfirm();
    }
    ok.addEventListener('click', confirm);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    try { (field || ok).focus({ preventScroll: true }); } catch (e) {}
  }

  // ---- required-field validation ----
  // The flattened design has no <form> elements at all: every field is a bare
  // input and every submit is a type="button" with a click handler. So the
  // `required` attribute would be inert here — the browser only enforces it on a
  // real form submission — and each handler only spot-checked one or two fields,
  // letting people submit half-empty contact and partenariat requests.
  //
  // Validate explicitly instead: mark the fields, flag the empty ones, focus the
  // first, and report how many are missing. Hidden fields are skipped so the
  // conditional partenariat inputs (other-city, ticket quantity) only count when
  // they are actually on screen.
  function markInvalid(el, bad) {
    if (!el) return;
    if (bad) {
      if (!el.hasAttribute('data-orig-border')) el.setAttribute('data-orig-border', el.style.borderColor || '');
      el.style.borderColor = '#b00020';
      el.setAttribute('aria-invalid', 'true');
    } else {
      el.style.borderColor = el.getAttribute('data-orig-border') || '';
      el.removeAttribute('aria-invalid');
    }
  }
  function isVisible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  // fields: [{ sel, label, email }]  -> returns an error string, or '' when valid
  function checkRequired(fields) {
    var missing = [], firstBad = null;
    fields.forEach(function (f) {
      var el = document.querySelector(f.sel);
      if (!el || !isVisible(el)) return;             // not on screen -> not required
      var val = String(el.value || '').trim();
      var bad = !val || (f.email && !validEmail(val));
      markInvalid(el, bad);
      if (bad) {
        missing.push(f.label);
        if (!firstBad) firstBad = el;
        // clear the flag as soon as they start fixing it
        if (!el.hasAttribute('data-req-wired')) {
          el.setAttribute('data-req-wired', '1');
          el.addEventListener('input', function () { markInvalid(el, false); });
        }
      }
    });
    if (!missing.length) return '';
    try { if (firstBad) firstBad.focus({ preventScroll: false }); } catch (e) {}
    if (missing.length === 1) return 'Champ requis : ' + missing[0] + '.';
    return 'Champs requis : ' + missing.join(', ') + '.';
  }
  function pixel(kind, name) { if (typeof window.fbq === 'function') { try { window.fbq(kind, name); } catch (e) {} } }
  function tagPremiumClick(email) {
    var knownEmail = String(email || getEmail() || '').trim().toLowerCase();
    pixel('trackCustom', 'PremiumClick');
    if (!validEmail(knownEmail)) return;
    try {
      fetch(FN + 'tag-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: knownEmail, tag: 'a-cliqué-premium-siteweb' }),
        keepalive: true,
      });
    } catch (e) {}
  }

  var SEL = { borderColor: '#3347CA', background: '#EEF0FD', color: '#3347CA', fontWeight: '700' };
  var UNSEL = { borderColor: '#E1E0D4', background: '#FFFFFF', color: '#16182B', fontWeight: '500' };
  function paint(el, on) {
    var s = on ? SEL : UNSEL;
    el.style.borderColor = s.borderColor;
    el.style.background = s.background;
    el.style.color = s.color;
    el.style.fontWeight = s.fontWeight;
  }

  function markSelected(el, on) {
    if (!el) return;
    if (on) el.setAttribute('data-selected', '1');
    else el.removeAttribute('data-selected');
  }

  function setAllText(root, selector, text) {
    [].slice.call(root.querySelectorAll(selector)).forEach(function (el) { el.textContent = text; });
  }

  function slugify(s) {
    return String(s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ami';
  }

  // ---- Hero signup (accueil): capture email, continue to the funnel ----
  function wireHero() {
    var emails = Array.prototype.slice.call(document.querySelectorAll('[data-svp="hero-email"]'));
    var submits = Array.prototype.slice.call(document.querySelectorAll('[data-svp="hero-submit"]'));
    if (!submits.length) return;
    // pair each submit with the nearest hero-email that precedes it in the DOM
    function emailFor(btn) {
      var best = null;
      emails.forEach(function (inp) {
        if (inp.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) best = inp;
      });
      return best || emails[0] || null;
    }
    submits.forEach(function (btn) {
      var input = emailFor(btn);
      btn.addEventListener('click', function (ev) {
        var email = (input && input.value || '').trim();
        if (!validEmail(email)) { if (ev) ev.preventDefault(); if (input) input.focus(); return false; }
        setEmail(email);
        pixel('track', 'Lead');
        // let the anchor's href="tunnel.html" carry the navigation
      });
    });
  }

  // ---- Premium CTA tagging (P2): tag known contacts on click ----
  function wirePremiumCtas() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-svp="premium-cta"]');
      if (!el) return;
      tagPremiumClick();
    });
  }

  // ---- Offer-visit tracking (P2): fired when an offer becomes visible ----
  function wireOfferViews() {
    var offers = document.querySelectorAll('[data-svp="offer"]');
    if (!offers.length || typeof IntersectionObserver === 'undefined') return;
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.getAttribute('data-offer-id') || en.target.getAttribute('data-svp-offer') || '';
        if (seen[id]) return;
        seen[id] = true;
        pixel('trackCustom', 'OfferView');
        var email = getEmail();
        if (email && id) {
          try {
            fetch(FN + 'track-offer-view', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email, offerId: id }), keepalive: true,
            });
          } catch (e) {}
        }
      });
    }, { threshold: 0.5 });
    offers.forEach(function (o) { io.observe(o); });
  }

  function wireFunnelV2(funnel) {
    var state = { ville: 'montreal', cityLabel: 'Montréal', interests: [], tranche: '2-3', premium: '' };
    var current = 1;
    var submitted = false;
    var exitShown = false;
    var steps = [].slice.call(funnel.querySelectorAll('[data-funnel-step]'));
    var tabs = [].slice.call(funnel.querySelectorAll('[data-step-tab]'));
    var progress = funnel.querySelector('[data-funnel-progress]');
    var badge = funnel.querySelector('[data-funnel-badge]');
    var emailInput = funnel.querySelector('[data-svp="funnel-email"]');
    var nameInput = funnel.querySelector('[data-svp="prenom"]');
    var feedback = funnel.querySelector('[data-svp="funnel-feedback"]');
    var submit = funnel.querySelector('[data-svp="funnel-submit"]');
    var exitModal = funnel.querySelector('[data-funnel-exit]');

    function say(msg, isErr) {
      if (!feedback) return;
      feedback.textContent = msg || '';
      feedback.style.color = isErr ? '#b00020' : '#3347CA';
    }
    function firstName() {
      var v = (nameInput && nameInput.value || '').trim();
      return v || 'Alex';
    }
    function cityName() { return state.cityLabel || 'Montréal'; }
    function interestsPhrase() {
      var arts = { 'Théâtre': 'le théâtre', 'Musique': 'la musique', 'Humour': "l'humour", 'Cinéma': 'le cinéma', 'Arts visuels': 'les arts visuels', 'Festivals': 'les festivals' };
      var picked = state.interests.filter(function (x) { return x !== 'Sport'; }).slice(0, 2).map(function (x) { return arts[x] || x; });
      return picked.length ? picked.join(' et ') : 'les sorties culturelles';
    }
    function inviteUrl() {
      return 'https://silvousplaitsvp.com/i/' + slugify(firstName());
    }
    function updateCopy() {
      setAllText(funnel, '[data-funnel-name]', firstName());
      setAllText(funnel, '[data-funnel-city]', cityName());
      setAllText(funnel, '[data-funnel-interests]', interestsPhrase());
      setAllText(funnel, '[data-funnel-invite]', inviteUrl().replace(/^https?:\/\//, ''));
      var pct = current === 4 || current === 'already' ? 100 : Math.max(33, current * 33);
      if (progress) progress.style.width = Math.min(100, pct) + '%';
      if (badge) {
        if (current === 4) badge.textContent = '✓ INSCRIT';
        else if (current === 'already') badge.textContent = 'DÉJÀ INSCRIT';
        else badge.textContent = 'ÉTAPE ' + current + ' / 3';
      }
      tabs.forEach(function (tab) {
        tab.setAttribute('aria-selected', String(Number(tab.getAttribute('data-step-tab')) === current));
      });
    }
    function showStep(n) {
      current = n;
      steps.forEach(function (step) {
        step.hidden = step.getAttribute('data-funnel-step') !== String(n);
      });
      say('');
      updateCopy();
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      if (String(n) === '2' && typeof window.__svpFunnelArchiveUpdate === 'function') {
        requestAnimationFrame(function () { window.__svpFunnelArchiveUpdate(); });
      }
      var activeStep = steps.filter(function (step) { return !step.hidden; })[0];
      applyRevealTargets(activeStep);
    }
    function validateStep1() {
      // Prénom is required too: it is not decorative — the welcome step and the
      // invite preview both address the person by name ("Bienvenue, Alex !"),
      // and it is written to ActiveCampaign. Previously it could be skipped,
      // which produced empty names downstream.
      var err = checkRequired([
        { sel: '[data-svp="prenom"]', label: 'Prénom' },
        { sel: '[data-svp="funnel-email"]', label: 'Courriel', email: true }
      ]);
      if (err) { say(err, true); return false; }
      var email = ((emailInput && emailInput.value) || '').trim();
      if (!validEmail(email)) {
        say('Entre une adresse courriel valide pour continuer.', true);
        if (emailInput) emailInput.focus();
        return false;
      }
      if (!state.ville) state.ville = 'montreal';
      if (!state.cityLabel) state.cityLabel = 'Montréal';
      return true;
    }
    function setSingle(selector, attr, el) {
      funnel.querySelectorAll(selector).forEach(function (x) { markSelected(x, x === el); });
      state[attr] = el.getAttribute(selector.indexOf('ville') >= 0 ? 'data-svp-ville' : 'data-svp-tranche') || '';
    }

    funnel.querySelectorAll('[data-svp-ville]').forEach(function (el) {
      if (el.getAttribute('data-selected') === '1') {
        state.ville = el.getAttribute('data-svp-ville') || state.ville;
        state.cityLabel = el.getAttribute('data-city-label') || el.textContent.trim() || state.cityLabel;
      }
      el.addEventListener('click', function () {
        setSingle('[data-svp-ville]', 'ville', el);
        state.cityLabel = el.getAttribute('data-city-label') || el.textContent.trim();
        updateCopy();
      });
    });
    funnel.querySelectorAll('[data-svp-interest]').forEach(function (el) {
      var v = el.getAttribute('data-svp-interest');
      if (el.getAttribute('data-selected') === '1' && state.interests.indexOf(v) < 0) state.interests.push(v);
      el.addEventListener('click', function () {
        var i = state.interests.indexOf(v);
        if (i >= 0) { state.interests.splice(i, 1); markSelected(el, false); }
        else { state.interests.push(v); markSelected(el, true); }
        updateCopy();
      });
    });
    funnel.querySelectorAll('[data-svp-tranche]').forEach(function (el) {
      if (el.getAttribute('data-selected') === '1') state.tranche = el.getAttribute('data-svp-tranche');
      el.addEventListener('click', function () { setSingle('[data-svp-tranche]', 'tranche', el); });
    });
    if (nameInput) nameInput.addEventListener('input', updateCopy);
    var known = getEmail();
    if (known && emailInput && !emailInput.value) emailInput.value = known;

    funnel.querySelectorAll('[data-funnel-next]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = Number(btn.getAttribute('data-funnel-next') || 1);
        if (next > 1 && !validateStep1()) return;
        showStep(next);
      });
    });
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var next = Number(tab.getAttribute('data-step-tab'));
        if (next > 1 && !validateStep1()) return;
        if (next === 4 && !submitted) return;
        showStep(next);
      });
    });
    funnel.querySelectorAll('[data-premium-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.premium = btn.getAttribute('data-premium-choice') || '';
        if (state.premium === 'yes' || state.premium === 'trial') {
          if (!validateStep1()) return;
          var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
          setEmail(email);
          startPremiumCheckout(btn, { email: email, plan: btn.getAttribute('data-plan') || (state.premium === 'trial' ? 'trial' : 'yearly'), returnPath: '/tunnel.html' });
          return;
        }
        offerTrialBeforeDecline(btn);
      });
    });

    // "Non merci, je reste au forfait gratuit" gets one last offer of the free
    // trial before the free flow continues (client request). Declining, closing
    // with Escape, or clicking the backdrop all continue to step 3 exactly as
    // the bare button used to, so the funnel can never stall behind this.
    var trialOfferShown = false;
    function offerTrialBeforeDecline(declineBtn) {
      if (trialOfferShown) { showStep(3); return; }
      trialOfferShown = true;
      var goFree = function () { state.premium = 'no'; showStep(3); };
      svpDialog({
        kicker: '14 jours gratuits',
        title: 'Essaie Premium avant de décider',
        message: "Tu peux voir toutes les offres Premium pendant 14 jours, sans payer. Annule en tout temps avant la fin de l'essai.",
        detail: '14 jours gratuits, puis 60 $ par année',
        confirmLabel: "Commencer l'essai gratuit",
        secondaryLabel: 'Non merci, je reste au forfait gratuit',
        onConfirm: function () {
          if (!validateStep1()) { showStep(1); return; }
          var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
          setEmail(email);
          // Keep the tag honest: they accepted the trial from here, so the
          // enriched submit must not report them as having refused Premium.
          state.premium = 'trial';
          startPremiumCheckout(declineBtn, { email: email, plan: 'trial', returnPath: '/tunnel.html' });
        },
        onSecondary: goFree,
        onDismiss: goFree
      });
    }
    var copy = funnel.querySelector('[data-funnel-copy]');
    if (copy) copy.addEventListener('click', function () {
      var url = inviteUrl();
      function copied() {
        try { navigator.clipboard.writeText(url); } catch (e) {}
        copy.textContent = 'Copié ✓';
        setTimeout(function () { copy.textContent = 'Copier le lien'; }, 1800);
      }
      if (navigator.share) {
        navigator.share({
          title: 'Silvousplait',
          text: "Je t'invite à rejoindre Silvousplait.",
          url: url,
        }).then(function () {
          copy.textContent = 'Invitation prête ✓';
          setTimeout(function () { copy.textContent = 'Copier le lien'; }, 1800);
        }).catch(copied);
        return;
      }
      copied();
    });
    funnel.querySelectorAll('[data-faq-item]').forEach(function (item) {
      item.addEventListener('click', function () {
        var answer = item.querySelector('span[hidden], span:not(:first-child)');
        var chev = item.querySelector('span span');
        var open = answer && !answer.hidden;
        if (answer) answer.hidden = open;
        if (chev) chev.textContent = open ? '⌄' : '⌃';
      });
    });

    function openExit() { if (exitModal) { updateCopy(); exitModal.hidden = false; } }
    function closeExit() { if (exitModal) exitModal.hidden = true; }
    var openExitBtn = funnel.querySelector('[data-funnel-open-exit]');
    if (openExitBtn) openExitBtn.addEventListener('click', function (e) { e.preventDefault(); openExit(); });
    funnel.querySelectorAll('[data-funnel-close-exit]').forEach(function (btn) { btn.addEventListener('click', closeExit); });
    funnel.querySelectorAll('a[href="accueil.html"]').forEach(function (link) {
      if (link.hasAttribute('data-funnel-confirm-exit')) return;
      link.addEventListener('click', function (e) {
        if (submitted || current === 4 || current === 'already') return;
        e.preventDefault();
        openExit();
      });
    });
    if (exitModal) {
      exitModal.addEventListener('click', function (e) { if (e.target === exitModal) closeExit(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeExit(); });
    }
    document.addEventListener('mouseleave', function (e) {
      if (e.clientY > 0 || exitShown || submitted || current === 4 || current === 'already') return;
      exitShown = true;
      openExit();
    });

    function finishSignup() {
      if (!validateStep1()) return;
      var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
      var honeypot = (funnel.querySelector('[name="website"]') || {}).value || '';
      if (!submit) return;
      submit.disabled = true;
      var original = submit.textContent;
      submit.textContent = 'Envoi…';
      say('');
      fetch(FN + 'submit-enriched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          firstName: (nameInput && nameInput.value || '').trim(),
          ville: state.ville,
          cityLabel: state.cityLabel,
          interests: state.interests,
          tranche: state.tranche,
          premiumInterest: state.premium,
          inviteLink: inviteUrl(),
          website: honeypot,
        }),
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          submit.disabled = false;
          submit.textContent = original;
          if (d && d.alreadySubscribed) {
            setEmail(email);
            showStep('already');
            return;
          }
          if (d && d.subscribed) {
            submitted = true;
            setEmail(email);
            pixel('track', 'Lead');
            showStep(4);
            wirePremiumCtas();
            return;
          }
          say((d && d.error) || "L'inscription n'a pas fonctionné. Réessaie.", true);
        }).catch(function () {
          submit.disabled = false;
          submit.textContent = original;
          say("Impossible d'envoyer pour le moment. Réessaie plus tard.", true);
        });
    }
    if (submit) submit.addEventListener('click', finishSignup);
    var skip = funnel.querySelector('[data-funnel-submit-skip]');
    if (skip) skip.addEventListener('click', finishSignup);
    updateCopy();
  }

  // ---- Enriched signup funnel (P3): tunnel.html ----
  function wireFunnel() {
    var funnel = document.querySelector('[data-svp="funnel"]');
    if (!funnel) return;
    if (funnel.hasAttribute('data-svp-funnel-v2')) { wireFunnelV2(funnel); return; }
    var state = { ville: '', interests: [], tranche: '', premium: '' };

    funnel.querySelectorAll('[data-svp-ville]').forEach(function (el) {
      if (el.getAttribute('data-selected') === '1') { state.ville = el.getAttribute('data-svp-ville'); }
      el.addEventListener('click', function () {
        state.ville = el.getAttribute('data-svp-ville');
        funnel.querySelectorAll('[data-svp-ville]').forEach(function (x) { paint(x, x === el); });
      });
    });
    funnel.querySelectorAll('[data-svp-interest]').forEach(function (el) {
      if (el.getAttribute('data-selected') === '1') { state.interests.push(el.getAttribute('data-svp-interest')); }
      el.addEventListener('click', function () {
        var v = el.getAttribute('data-svp-interest');
        var i = state.interests.indexOf(v);
        if (i >= 0) { state.interests.splice(i, 1); paint(el, false); }
        else { state.interests.push(v); paint(el, true); }
      });
    });
    funnel.querySelectorAll('[data-svp-tranche]').forEach(function (el) {
      if (el.getAttribute('data-selected') === '1') { state.tranche = el.getAttribute('data-svp-tranche'); }
      el.addEventListener('click', function () {
        state.tranche = el.getAttribute('data-svp-tranche');
        funnel.querySelectorAll('[data-svp-tranche]').forEach(function (x) { paint(x, x === el); });
      });
    });

    // premium-interest chips (single-select yes/no)
    funnel.querySelectorAll('[data-svp-premium]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.premium = el.getAttribute('data-svp-premium');
        funnel.querySelectorAll('[data-svp-premium]').forEach(function (x) { paint(x, x === el); });
      });
    });

    var emailInput = funnel.querySelector('[data-svp="funnel-email"]');
    var known = getEmail();
    if (known && emailInput && !emailInput.value) emailInput.value = known;

    // "not finished" popup — if they engaged with the funnel but try to leave
    var funnelSubmitted = false;
    var engaged = false;
    funnel.addEventListener('click', function () { engaged = true; });
    if (emailInput) emailInput.addEventListener('input', function () { engaged = true; });
    document.addEventListener('mouseout', function (e) {
      if (e.clientY > 0 || e.relatedTarget) return;
      if (!engaged || funnelSubmitted) return;
      if (funnel.__warned) return; funnel.__warned = true;
      var o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(22,24,43,.55);display:flex;align-items:center;justify-content:center;padding:20px';
      o.innerHTML = '<div style="background:#FFFEF5;max-width:400px;width:100%;border:1.5px solid #16182B;border-radius:18px;box-shadow:6px 6px 0 #3347CA;padding:26px;text-align:center;position:relative">'
        + '<button data-x style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:22px;cursor:pointer;color:#8B8DA0">×</button>'
        + '<h3 style="font:800 21px \'Bricolage Grotesque\',sans-serif;margin:0 0 8px">Ton inscription n\'est pas finie&nbsp;! ⏳</h3>'
        + '<p style="font:500 14px \'Instrument Sans\',sans-serif;color:#4A4D66;margin:0 0 18px;line-height:1.5">Encore une étape et tu reçois nos meilleurs spectacles pas chers chaque lundi.</p>'
        + '<button data-stay style="background:#3347CA;color:#FFFEF5;border:none;border-radius:100px;padding:13px 22px;font:700 14px \'Instrument Sans\',sans-serif;cursor:pointer">Terminer mon inscription</button></div>';
      document.body.appendChild(o);
      var close = function () { o.remove(); };
      o.querySelector('[data-x]').addEventListener('click', close);
      o.addEventListener('click', function (e2) { if (e2.target === o) close(); });
      o.querySelector('[data-stay]').addEventListener('click', function () { close(); if (submit) submit.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }); });
    });

    var feedback = funnel.querySelector('[data-svp="funnel-feedback"]');
    function say(msg, isErr) { if (feedback) { feedback.textContent = msg || ''; feedback.style.color = isErr ? '#b00020' : '#3347CA'; } }

    var submit = funnel.querySelector('[data-svp="funnel-submit"]');
    if (!submit) return;
    submit.addEventListener('click', function () {
      var email = ((emailInput && emailInput.value) || getEmail() || '').trim();
      var prenom = (funnel.querySelector('[data-svp="prenom"]') || {}).value || '';
      var honeypot = (funnel.querySelector('[name="website"]') || {}).value || '';
      if (!validEmail(email)) { say('Entre une adresse email valide.', true); if (emailInput) emailInput.focus(); return; }
      submit.disabled = true;
      var original = submit.textContent;
      submit.textContent = 'Envoi…';
      say('');
      fetch(FN + 'submit-enriched', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, firstName: prenom.trim(), ville: state.ville, interests: state.interests, tranche: state.tranche, premiumInterest: state.premium, website: honeypot }),
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.subscribed) {
            funnelSubmitted = true;
            setEmail(email);
            pixel('track', 'Lead');
            var card = funnel.querySelector('[data-svp="funnel-card"]') || funnel;
            card.innerHTML = '<div style="text-align:center;padding:20px 8px"><div style="font:800 24px \'Bricolage Grotesque\',sans-serif;color:#3347CA;margin-bottom:10px">Merci' + (prenom ? ' ' + prenom.trim() : '') + '&nbsp;! 🎉</div><p style="font:500 15px \'Instrument Sans\',sans-serif;color:#4A4D66;line-height:1.5">Ton inscription est confirmée. Ta première infolettre arrive lundi.</p><a href="accueil.html" style="display:inline-block;margin-top:18px;background:#3347CA;color:#FFFEF5;text-decoration:none;border-radius:100px;padding:14px 24px;font:700 15px \'Instrument Sans\',sans-serif">Retour au site →</a></div>';
          } else {
            submit.disabled = false; submit.textContent = original;
            say((d && d.error) || "L'inscription n'a pas fonctionné. Réessaie.", true);
          }
        }).catch(function () {
          submit.disabled = false; submit.textContent = original;
          say("Impossible d'envoyer pour le moment. Réessaie plus tard.", true);
        });
    });
  }

  // ---- Live countdowns to weekly send times ----
  function nextWeeklyTarget(dayOfWeek, hour, minute) {
    var now = new Date();
    var t = new Date(now);
    t.setHours(hour, minute || 0, 0, 0);
    var add = (dayOfWeek - t.getDay() + 7) % 7; // getDay: 0=Sun..6=Sat
    if (add === 0 && now.getTime() >= t.getTime()) add = 7;
    t.setDate(t.getDate() + add);
    return t;
  }
  function countdownTargetFor(el) {
    if (el && el.getAttribute('data-countdown-target') === 'sunday-noon') return nextWeeklyTarget(0, 12, 0);
    return nextWeeklyTarget(1, 9, 0);
  }
  function wireCountdown() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-svp="countdown"]'));
    if (!els.length) return;
    function tick() {
      els.forEach(function (el) {
        var target = countdownTargetFor(el).getTime();
        var diff = Math.max(0, target - Date.now());
        var d = Math.floor(diff / 86400000);
        var h = Math.floor((diff % 86400000) / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        var txt = d + 'j ' + h + 'h ' + m + 'min';
        if (el.getAttribute('data-countdown-seconds') === '1') txt += ' ' + s + 's';
        el.textContent = txt;
      });
    }
    tick();
    var anySeconds = els.some(function (el) { return el.getAttribute('data-countdown-seconds') === '1'; });
    setInterval(tick, anySeconds ? 1000 : 30000);
  }

  var SESSION_KEY = 'svp_session';
  function getSession() { try { return localStorage.getItem(SESSION_KEY) || ''; } catch (e) { return ''; } }
  function setSession(v) { try { localStorage.setItem(SESSION_KEY, v); } catch (e) {} }

  // ---- P4: passwordless email-code login (connexion.html) ----
  function wireConnexion() {
    var emailInput = document.querySelector('[data-svp="login-email"]');
    var submit = document.querySelector('[data-svp="login-submit"]');
    if (!emailInput || !submit) return;
    var msg = document.querySelector('[data-svp="login-msg"]');
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    var challenge = '';

    // Arriving from the already-Premium dialog ("Voir mon compte") carries the
    // address in ?email=, so the visitor only has to request and type the code
    // rather than retype an address we already know.
    if (!emailInput.value) {
      var pre = '';
      try { pre = new URLSearchParams(location.search).get('email') || ''; } catch (e) {}
      if (!pre) pre = getEmail() || '';
      if (validEmail(pre)) {
        emailInput.value = pre;
        try { submit.focus({ preventScroll: true }); } catch (e2) {}
      }
    }

    function showCodeStep() {
      if (document.querySelector('[data-svp="login-code"]')) return;
      var wrap = document.createElement('div');
      wrap.style.marginTop = '12px';
      wrap.innerHTML = '<input data-svp="login-code" inputmode="numeric" maxlength="6" placeholder="Code à 6 chiffres" style="box-sizing:border-box;width:100%;border:1.5px solid #E1E0D4;border-radius:10px;padding:14px;font:500 14.5px \'Instrument Sans\',sans-serif;letter-spacing:4px;text-align:center;margin-bottom:12px"><button data-svp="login-verify" style="display:block;width:100%;background:#3347CA;color:#FFFEF5;border:none;border-radius:100px;padding:15px;font-weight:700;font-size:15px;cursor:pointer">Se connecter</button>';
      submit.parentNode.insertBefore(wrap, submit.nextSibling);
      var codeInput = wrap.querySelector('[data-svp="login-code"]');
      codeInput.focus();
      wrap.querySelector('[data-svp="login-verify"]').addEventListener('click', function () {
        var code = (codeInput.value || '').trim();
        if (!/^\d{6}$/.test(code)) { say('Entre le code à 6 chiffres.', true); return; }
        say('Vérification…');
        fetch(FN + 'verify-login-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: challenge, code: code }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.success) { setSession(d.session); setEmail(d.email); say('Connecté ! Redirection…'); window.location.href = 'compte.html'; }
            else { say('Code invalide ou expiré. Réessaie.', true); }
          }).catch(function () { say('Erreur. Réessaie.', true); });
      });
    }

    submit.addEventListener('click', function () {
      var email = (emailInput.value || '').trim();
      var cerr = checkRequired([{ sel: '[data-svp="login-email"]', label: 'Courriel', email: true }]);
      if (cerr) { say(cerr, true); return; }
      submit.disabled = true; say('Envoi du code…');
      fetch(FN + 'request-login-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          submit.disabled = false;
          if (d && d.sent) { challenge = d.challenge; setEmail(email); say('Code envoyé ! Vérifie ton courriel.'); showCodeStep(); }
          else { say('Aucun compte trouvé pour ce courriel.', true); }
        }).catch(function () { submit.disabled = false; say('Erreur. Réessaie plus tard.', true); });
    });
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ---- compte: require a session, then populate REAL account data ----
  function wireAccount() {
    if (!document.querySelector('[data-svp="compte"]')) return;
    var session = getSession();
    if (!session) { window.location.href = 'connexion.html'; return; }
    setPremiumOnlyVisible(false);
    setAccountCatalogVisible(true);
    var grid0 = document.querySelector('[data-svp="offers-grid"]');
    if (grid0) grid0.innerHTML = rep(skeletonGridCard(), 6);
    [].slice.call(document.querySelectorAll('[data-svp-free-only]')).forEach(function (el) { el.style.display = 'none'; });
    // Show a skeleton for the name + badge immediately (never the fake "Alex").
    var greet0 = document.querySelector('[data-svp="compte"] h1');
    if (greet0) greet0.innerHTML = 'Bonjour, <span class="svp-skel" style="display:inline-block;width:140px;height:24px;border-radius:8px;vertical-align:-3px"></span>';
    var badge0 = [].slice.call(document.querySelectorAll('span')).filter(function (s) { return (s.textContent || '').trim() === 'Membre Premium'; })[0];
    if (badge0) { badge0.setAttribute('data-svp-badge', '1'); badge0.textContent = ''; badge0.classList.add('svp-skel'); badge0.style.minWidth = '120px'; badge0.style.minHeight = '24px'; badge0.style.background = '#E9ECF5'; }
    fetch(FN + 'get-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: session }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.ok) { setSession(''); window.location.href = 'connexion.html'; return; }
        var a = res.d; setEmail(a.email);
        var greet = document.querySelector('[data-svp="compte"] h1');
        if (greet) greet.textContent = 'Bonjour, ' + (a.firstName || a.email.split('@')[0]);
        var badgeR = document.querySelector('[data-svp-badge]');
        if (badgeR) { badgeR.classList.remove('svp-skel'); badgeR.style.minWidth = ''; badgeR.style.minHeight = ''; badgeR.style.background = a.isPremium ? '#F5E642' : '#EEF0FD'; badgeR.style.color = a.isPremium ? '#16182B' : '#3347CA'; badgeR.textContent = a.isPremium ? 'Membre Premium' : 'Membre gratuit'; }
        setPremiumOnlyVisible(Boolean(a.isPremium));
        var ln = document.querySelector('[data-svp-account-field="lastName"]') || document.querySelector('input[placeholder="Nom"]'); if (ln) ln.value = a.lastName || '';
        var fn = document.querySelector('[data-svp-account-field="firstName"]') || document.querySelector('input[placeholder="Prénom"]'); if (fn) fn.value = a.firstName || '';
        var ph = document.querySelector('[data-svp-account-field="phone"]') || document.querySelector('input[type="tel"]'); if (ph) ph.value = a.phone || '';
        var ville = document.querySelector('[data-svp-account-field="ville"]'); if (ville && a.ville) ville.value = a.ville;
        // Personalise the free-member premium call-back (compte.html), which
        // reuses the funnel's step-2 copy: "<Prénom>, les membres Premium
        // économisent…" and "…ont reçu à <ville>". Nothing else fills these on
        // this page — updateCopy() only runs inside the funnel.
        var upsellName = a.firstName || (a.email || '').split('@')[0];
        [].slice.call(document.querySelectorAll('.svp-upsell [data-funnel-name]'))
          .forEach(function (el) { el.textContent = upsellName; });
        var villeLabel = '';
        if (ville && ville.options && ville.selectedIndex >= 0) {
          villeLabel = (ville.options[ville.selectedIndex].textContent || '').trim();
        }
        if (villeLabel) {
          [].slice.call(document.querySelectorAll('.svp-upsell [data-funnel-city]'))
            .forEach(function (el) { el.textContent = villeLabel; });
        }
        loadAccountOffers(session);
      })
      .catch(function () {
        var greet = document.querySelector('[data-svp="compte"] h1');
        if (greet) greet.textContent = 'Connexion interrompue';
        var badge = document.querySelector('[data-svp-badge]');
        if (badge) { badge.classList.remove('svp-skel'); badge.style.minWidth = ''; badge.style.minHeight = ''; badge.style.background = '#EEF0FD'; badge.style.color = '#3347CA'; badge.textContent = 'À réessayer'; }
        setAccountCatalogVisible(true);
        var grid = document.querySelector('[data-svp="offers-grid"]');
        if (grid) grid.innerHTML = '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Impossible de charger ton compte pour le moment.</p>';
        svpDialog({
          title: 'Connexion interrompue',
          message: "On n'a pas pu charger ton compte. Vérifie ta connexion et réessaie.",
          confirmLabel: 'Réessayer',
          onConfirm: function () { window.location.reload(); },
          secondaryLabel: 'Se reconnecter',
          onSecondary: function () { setSession(''); window.location.href = 'connexion.html'; }
        });
      });
  }

  function setAccountCatalogVisible(visible) {
    var title = document.querySelector('[data-svp-account-offers-title]');
    var filters = document.querySelector('[data-svp-account-offers-filters]');
    var grid = document.querySelector('[data-svp="offers-grid"]');
    if (title) title.style.display = visible ? (title.getAttribute('data-svp-display') || 'block') : 'none';
    if (filters) filters.style.display = visible ? (filters.getAttribute('data-svp-display') || 'flex') : 'none';
    if (grid) grid.style.display = visible ? (grid.getAttribute('data-svp-display') || 'grid') : 'none';
  }

  function setPremiumOnlyVisible(isPremium) {
    if (document.body && document.body.getAttribute('data-svp') === 'compte') {
      document.body.setAttribute('data-svp-account-premium', isPremium ? 'true' : 'false');
    }
    [].slice.call(document.querySelectorAll('[data-svp-premium-only]')).forEach(function (el) {
      el.style.display = isPremium ? (el.getAttribute('data-svp-display') || '') : 'none';
    });
    [].slice.call(document.querySelectorAll('[data-svp-free-only]')).forEach(function (el) {
      el.style.display = isPremium ? 'none' : (el.getAttribute('data-svp-display') || '');
    });
  }

  var TRANSIENT_BUTTONS = [
    '[data-svp="checkout"]',
    '[data-svp="hero-submit"]',
    '[data-svp="funnel-submit"]',
    '[data-funnel-submit-skip]',
    '[data-premium-choice]',
    '[data-svp="login-submit"]',
    '[data-svp="login-verify"]',
    '[data-svp="contact-submit"]',
    '[data-svp="partner-submit"]',
    '[data-svp="account-save"]',
    '[data-svp="admin-submit"]'
  ].join(',');
  var TRANSIENT_FALLBACK_LABELS = [
    ['[data-svp="login-submit"]', 'Recevoir mon code'],
    ['[data-svp="login-verify"]', 'Se connecter'],
    ['[data-svp="contact-submit"]', 'Envoyer le message'],
    ['[data-svp="partner-submit"]', 'Continuer →'],
    ['[data-svp="account-save"]', 'Enregistrer les informations'],
    ['[data-svp="admin-submit"]', "Ouvrir l'admin"],
    ['[data-svp="funnel-submit"]', 'Terminer mon inscription →'],
    ['[data-funnel-submit-skip]', 'Passer cette étape'],
    ['[data-premium-choice="yes"]', 'Je veux économiser sur mes shows'],
    ['[data-premium-choice="trial"]', 'Essai gratuit de 14 jours'],
    ['[data-premium-choice="no"]', 'Non merci, je reste au forfait gratuit']
  ];
  function fallbackButtonLabel(el) {
    for (var i = 0; i < TRANSIENT_FALLBACK_LABELS.length; i += 1) {
      if (el.matches && el.matches(TRANSIENT_FALLBACK_LABELS[i][0])) return TRANSIENT_FALLBACK_LABELS[i][1];
    }
    return '';
  }
  function rememberTransientButtonLabels(root) {
    [].slice.call((root || document).querySelectorAll(TRANSIENT_BUTTONS)).forEach(function (el) {
      if (el.getAttribute('data-svp-initial-label') == null) {
        el.setAttribute('data-svp-initial-label', (el.textContent || '').trim() || fallbackButtonLabel(el));
      }
    });
  }
  function resetTransientButtons(root) {
    rememberTransientButtonLabels(root || document);
    [].slice.call((root || document).querySelectorAll(TRANSIENT_BUTTONS)).forEach(function (el) {
      var label = el.getAttribute('data-orig-label') || el.getAttribute('data-svp-initial-label') || fallbackButtonLabel(el);
      if (label) el.textContent = label;
      if ('disabled' in el) el.disabled = false;
      el.removeAttribute('aria-busy');
      el.removeAttribute('data-loading');
    });
  }
  function wireTransientButtonReset() {
    rememberTransientButtonLabels(document);
    window.addEventListener('pageshow', function () {
      setTimeout(function () { resetTransientButtons(document); }, 0);
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) setTimeout(function () { resetTransientButtons(document); }, 0);
    });
  }

  function wireAccountSave() {
    var btn = document.querySelector('[data-svp="account-save"]');
    if (!btn) return;
    var msg = document.querySelector('[data-svp="account-msg"]');
    function field(name) {
      var el = document.querySelector('[data-svp-account-field="' + name + '"]');
      return el ? String(el.value || '').trim() : '';
    }
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    btn.addEventListener('click', function () {
      var session = getSession();
      if (!session) { window.location.href = 'connexion.html'; return; }
      // Only Prénom is required. Deliberately NOT Nom: the signup funnel never
      // collects a last name, so every existing subscriber has an empty one —
      // requiring it here would lock them out of saving their own profile.
      // Phone stays optional too.
      var aerr = checkRequired([
        { sel: '[data-svp-account-field="firstName"]', label: 'Prénom' }
      ]);
      if (aerr) { say(aerr, true); return; }
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = 'Enregistrement…';
      say('');
      fetch(FN + 'update-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: session,
          firstName: field('firstName'),
          lastName: field('lastName'),
          phone: field('phone'),
          ville: field('ville'),
        }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }).catch(function () { return { ok: r.ok, d: {} }; }); })
        .then(function (res) {
          btn.disabled = false;
          btn.textContent = original;
          if (res.ok && res.d && res.d.ok) {
            say('Informations enregistrées.');
            var greet = document.querySelector('[data-svp="compte"] h1');
            var first = field('firstName');
            if (greet && first) greet.textContent = 'Bonjour, ' + first;
            return;
          }
          say((res.d && res.d.error) || "Impossible d'enregistrer pour le moment.", true);
        }).catch(function () {
          btn.disabled = false;
          btn.textContent = original;
          say('Erreur. Réessaie plus tard.', true);
        });
    });
  }

  // ---- compte: newsletter unsubscribe (désinscription) ----
  function wireUnsubscribe() {
    var link = document.querySelector('[data-svp="unsubscribe"]');
    if (!link) return;
    var msg = document.querySelector('[data-svp="unsubscribe-msg"]');
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (!window.confirm('Te désinscrire de l\'infolettre ? Tu ne recevras plus nos courriels.')) return;
      var session = getSession();
      if (!session) { window.location.href = 'connexion.html'; return; }
      say('Traitement…');
      fetch(FN + 'unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: session }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.ok) say('Tu es désinscrit·e. Tu peux te réinscrire quand tu veux.');
          else say("La désinscription a échoué. Réessaie.", true);
        }).catch(function () { say('Erreur. Réessaie plus tard.', true); });
    });
  }

  // ---- compte: Stripe billing portal (invoices + cancel subscription) ----
  function wireBilling() {
    var links = document.querySelectorAll('[data-svp="billing"]');
    if (!links.length) return;
    var msg = document.querySelector('[data-svp="billing-msg"]');
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    [].forEach.call(links, function (link) {
      link.href = STRIPE_BILLING_LOGIN_URL;
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var session = getSession();
        if (!session) { window.location.href = 'connexion.html'; return; }
        say('Ouverture…');
        window.location.href = STRIPE_BILLING_LOGIN_URL;
      });
    });
    // Coming back from the Stripe portal (Back button, incl. bfcache restore)
    // left "Ouverture…" sitting under the links forever — the page was never
    // re-initialised, so nothing ever cleared it. Same fix as the checkout
    // buttons above: reset the status line every time the page is shown.
    window.addEventListener('pageshow', function () { say(''); });
  }

  // ---- compte: client-side offer filters ----
  function wireCompteFilters() {
    if (!document.querySelector('[data-svp="offers-grid"]')) return;
    var search = document.querySelector('input[placeholder^="Rechercher"]');
    var selects = [].slice.call(document.querySelectorAll('[data-svp="compte"] select'));
    // type select has "Type d'offre" option; region select has "Région"
    var type = selects.filter(function (s) { return /type d'offre/i.test(s.textContent); })[0];
    var region = selects.filter(function (s) { return /r[ée]gion/i.test(s.textContent); })[0];
    function tokens(s) { return norm(s).split(/[^a-z0-9%]+/).filter(function (w) { return w.length >= 4; }); }
    function apply() {
      var q = norm(search && search.value);
      var tv = type && type.value; var tSel = tv && !/^tous$/i.test(tv);
      var rv = region && region.value; var rSel = rv && !/^toutes$/i.test(rv);
      var tTokens = tSel ? tokens(tv) : [];
      document.querySelectorAll('[data-svp="offer"]').forEach(function (card) {
        var hay = norm(card.getAttribute('data-offer-search'));
        var ct = norm(card.getAttribute('data-offer-type'));
        var cr = norm(card.getAttribute('data-offer-region'));
        var okQ = !q || hay.indexOf(q) !== -1;
        var okT = !tSel || tTokens.some(function (w) { return ct.indexOf(w.replace(/s$/, '')) !== -1; });
        var okR = !rSel || cr.indexOf(norm(rv)) !== -1 || norm(rv).indexOf(cr) !== -1;
        card.style.display = (okQ && okT && okR) ? '' : 'none';
      });
    }
    [search, type, region].forEach(function (el) { if (el) { el.addEventListener('input', apply); el.addEventListener('change', apply); } });
    window.__svpApplyFilters = apply;
  }

  // ---- contact form (inputs aren't in a <form>, so drive off the button) ----
  function wireContact() {
    var btn = document.querySelector('[data-svp="contact-submit"]');
    if (!btn) return;
    var msg = document.querySelector('[data-svp="contact-msg"]');
    var v = function (sel) { var el = document.querySelector(sel); return el ? el.value : ''; };
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var data = { name: v('[name="name"]'), email: v('[name="email"]'), subject: v('[name="subject"]'), message: v('[name="message"]'), website: v('[name="website"]') };
      var err = checkRequired([
        { sel: '[name="name"]', label: 'Nom complet' },
        { sel: '[name="email"]', label: 'Courriel', email: true },
        { sel: '[name="subject"]', label: 'Sujet' },
        { sel: '[name="message"]', label: 'Message' }
      ]);
      if (err) { say(err, true); return; }
      btn.disabled = true; say('Envoi…');
      fetch(FN + 'send-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); }).then(function (d) {
          btn.disabled = false;
          if (d && d.sent) {
            ['[name="name"]', '[name="email"]', '[name="subject"]', '[name="message"]'].forEach(function (s) { var el = document.querySelector(s); if (el) el.value = ''; });
            say('Message envoyé ! On te revient rapidement.');
          } else { say((d && d.error) || "L'envoi a échoué.", true); }
        }).catch(function () { btn.disabled = false; say('Erreur. Réessaie plus tard.', true); });
    });
  }

  // ---- premium Stripe checkout ----
  function resetCheckoutButton(btn) {
    var o = btn && btn.getAttribute && btn.getAttribute('data-orig-label');
    if (btn && o != null) btn.textContent = o;
    if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }

  // Send someone to their account. compte.html redirects out when there is no
  // session, so an unauthenticated visitor has to pass the emailed-code login
  // first — carry the address over so connexion pre-fills it and they only
  // have to request and type the code.
  // Send someone to their account. compte.html redirects out when there is no
  // session, so an unauthenticated visitor has to pass the emailed-code login
  // first — carry the address over so connexion pre-fills it and they only
  // have to request and type the code.
  function goToAccount(emailForLogin) {
    // ALWAYS through the emailed code — never straight into compte.html, even
    // when a session already exists. Two reasons:
    //  - the address in the dialog is whichever one we just blocked, which is
    //    not necessarily the session's owner, so jumping to the account could
    //    show somebody else's; and
    //  - reaching a Premium account must require proving control of the inbox,
    //    not merely sharing a browser with someone who logged in once.
    var e = String(emailForLogin || '').trim().toLowerCase();
    if (e) setEmail(e);
    window.location.href = 'connexion.html' + (e ? '?email=' + encodeURIComponent(e) : '');
  }

  function checkoutEmailError(email) {
    var value = String(email || '').trim().toLowerCase();
    if (!validEmail(value)) return 'Entre une adresse courriel valide.';
    var domain = value.split('@')[1] || '';
    var commonTypos = {
      'gmal.com': 'gmail.com',
      'gmial.com': 'gmail.com',
      'gmai.com': 'gmail.com',
      'gmail.co': 'gmail.com',
      'gmaill.com': 'gmail.com',
      'hotmial.com': 'hotmail.com',
      'hotmai.com': 'hotmail.com',
      'hotmail.co': 'hotmail.com',
      'outlok.com': 'outlook.com',
      'outloo.com': 'outlook.com',
      'outlook.co': 'outlook.com'
    };
    return commonTypos[domain] ? 'Vérifie le domaine du courriel. Tu voulais peut-être écrire ' + commonTypos[domain] + '.' : '';
  }

  function askCheckoutEmail(btn, options, prefill) {
    options = options || {};
    var initial = prefill != null ? prefill : (options.email || getEmail() || '');
    svpDialog({
      title: 'Confirme ton courriel',
      message: "Vérifie bien l'adresse: elle sera utilisée pour le paiement et pour vérifier si ce compte a déjà Premium.",
      input: {
        type: 'email',
        placeholder: 'ton.courriel@exemple.com',
        value: String(initial || '').trim().toLowerCase(),
        validate: function (value) { return checkoutEmailError(value) || true; },
        error: 'Entre une adresse courriel valide.'
      },
      confirmLabel: 'Continuer avec ce courriel',
      onConfirm: function (value) {
        var next = String(value || '').trim().toLowerCase();
        setEmail(next);
        startPremiumCheckout(btn, Object.assign({}, options, { email: next, skipEmailPrompt: true }));
      }
    });
  }

  // Both checkout paths (server-created Session for the paid plans, Stripe
  // Payment Link for the trial) hit the same duplicate-subscription guard, so
  // they share the dialog that explains it.
  function showAlreadyPremiumDialog(btn, options, d, email) {
    // Branch on WHY we blocked. A comped member (Premium granted
    // directly, no Stripe customer) has nothing in the billing portal —
    // sending them there lands on a login page that can never resolve.
    var blockedEmail = d.email || email || '';
    var comped = d.source !== 'stripe_active';
    // Changing the address is an edit, not a detour: reopen the same
    // prompt pre-filled so they can correct it and be re-checked.
    var reEnter = function () { askCheckoutEmail(btn, Object.assign({}, options, { skipEmailPrompt: false }), blockedEmail); };
    svpDialog(comped ? {
      title: 'Tu as déjà accès à Premium',
      message: 'Cet accès a été activé directement pour :',
      detail: blockedEmail,
      confirmLabel: 'Voir mon compte',
      // compte.html is session-gated and would bounce a logged-out
      // visitor straight back out, so go through the emailed-code
      // login with the address already filled in.
      onConfirm: function () { goToAccount(blockedEmail); },
      secondaryLabel: 'Changer de courriel',
      onSecondary: reEnter
    } : {
      title: 'Cette adresse est déjà Premium',
      message: 'Un abonnement Premium actif existe déjà pour :',
      detail: blockedEmail,
      confirmLabel: 'Gérer mon abonnement',
      onConfirm: function () { window.location.href = STRIPE_BILLING_LOGIN_URL; },
      secondaryLabel: 'Changer de courriel',
      onSecondary: reEnter
    });
  }

  function trialCheckoutUrl(email) {
    if (!validEmail(email)) return STRIPE_TRIAL_CHECKOUT_URL;
    // Payment Links accept prefilled_email, so the address we just confirmed
    // carries over instead of being typed a second time on Stripe.
    return STRIPE_TRIAL_CHECKOUT_URL + (STRIPE_TRIAL_CHECKOUT_URL.indexOf('?') === -1 ? '?' : '&')
      + 'prefilled_email=' + encodeURIComponent(email);
  }

  // There is no session to create for the trial — the Payment Link IS the
  // checkout. We still ask the backend the one question it alone can answer
  // (does this address already have Premium?) so a member can't start a second
  // subscription. A failed check never blocks the link: our outage must not
  // cost a signup, and Stripe stays the source of truth either way.
  function startTrialCheckout(btn, email, options) {
    var go = function () {
      pixel('track', 'InitiateCheckout');
      window.location.href = trialCheckoutUrl(email);
    };
    if (!validEmail(email)) { go(); return; }
    fetch(FN + 'create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkOnly: true, planKey: 'trial', email: email }),
    })
      .then(function (r) { return r.json().then(function (d) { return d; }).catch(function () { return {}; }); })
      .then(function (d) {
        if (d && d.code === 'already_premium') {
          resetCheckoutButton(btn);
          showAlreadyPremiumDialog(btn, options, d, email);
          return;
        }
        go();
      })
      .catch(go);
  }

  function startPremiumCheckout(btn, options) {
    options = options || {};
    if (!btn) return;
    if (btn.getAttribute('aria-busy') === 'true') return;
    if (btn.getAttribute('data-orig-label') == null) btn.setAttribute('data-orig-label', btn.textContent);
    var plan = options.plan || btn.getAttribute('data-plan') || 'yearly';
    var email = String(options.email || getEmail() || '').trim().toLowerCase();
    if (!options.skipEmailPrompt) {
      askCheckoutEmail(btn, Object.assign({}, options, { plan: plan }), email);
      return;
    }
    var emailError = checkoutEmailError(email);
    if (emailError) {
      askCheckoutEmail(btn, Object.assign({}, options, { plan: plan, skipEmailPrompt: false }), email);
      return;
    }
    if (email) setEmail(email);
    tagPremiumClick(email);
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Redirection…';
    if (plan === 'trial') { startTrialCheckout(btn, email, options); return; }
    fetch(FN + 'create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planKey: plan,
        returnPath: options.returnPath || '/premium.html',
        email: validEmail(email) ? email : undefined,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }).catch(function () { return { ok: r.ok, d: {} }; }); })
      .then(function (res) {
        var d = res.d || {};
        if (d && d.url) { pixel('track', 'InitiateCheckout'); window.location.href = d.url; }
        else {
          resetCheckoutButton(btn);
          if (d.code === 'already_premium') showAlreadyPremiumDialog(btn, options, d, email);
          else svpDialog({ title: "Le paiement n'a pas pu démarrer", message: "Quelque chose a bloqué l'ouverture de la page de paiement. Réessaie dans un instant — si ça persiste, écris-nous à spectacles@silvousplaitsvp.com.", confirmLabel: 'Réessayer' });
        }
      }).catch(function () { resetCheckoutButton(btn); svpDialog({ title: 'Connexion interrompue', message: "On n'a pas pu joindre le service de paiement. Vérifie ta connexion et réessaie.", confirmLabel: 'Réessayer' }); });
  }

  function wirePremiumCheckout() {
    var btns = document.querySelectorAll('[data-svp="checkout"]');
    if (!btns.length) return;
    btns.forEach(function (btn) {
      if (btn.getAttribute('data-orig-label') == null) btn.setAttribute('data-orig-label', btn.textContent);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        startPremiumCheckout(btn);
      });
    });
    // Returning to the page (e.g. Back from Stripe, incl. bfcache) restores the button.
    window.addEventListener('pageshow', function () { btns.forEach(resetCheckoutButton); });
  }

  function wirePremiumTrialOffer() {
    if (currentPageName() !== 'premium.html') return;
    var key = 'svp_premium_trial_popup_seen';
    try {
      if (sessionStorage.getItem(key) === '1') return;
    } catch (e) {}
    setTimeout(function () {
      if (document.querySelector('[data-svp-dialog], .svp-offer-modal')) return;
      try { sessionStorage.setItem(key, '1'); } catch (e2) {}
      svpDialog({
        kicker: '14 jours gratuits',
        title: 'Essai gratuit de 14 jours',
        message: "Découvre les offres Premium pendant 14 jours. Tu peux lancer l'essai maintenant et choisir tes sorties ensuite.",
        confirmLabel: "Commencer l'essai gratuit",
        secondaryLabel: 'Plus tard',
        onConfirm: function () {
          var btn = document.querySelector('[data-svp="checkout"][data-plan="trial"]') || document.querySelector('[data-plan="trial"]');
          startPremiumCheckout(btn, { plan: 'trial', returnPath: '/premium.html' });
        }
      });
    }, 5200);
  }

  // ---- P5: admin gate ----
  function wireAdmin() {
    var pass = document.querySelector('[data-svp="admin-pass"]');
    var submit = document.querySelector('[data-svp="admin-submit"]');
    if (!pass || !submit) return;
    var msg = document.querySelector('[data-svp="admin-msg"]');
    submit.addEventListener('click', function () {
      submit.disabled = true; if (msg) msg.textContent = 'Vérification…';
      fetch(FN + 'admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass.value || '' }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          submit.disabled = false;
          if (res.ok && res.d && res.d.success) {
            try { if (res.d.token) sessionStorage.setItem('svp_admin', res.d.token); } catch (e) {}
            window.location.href = 'premium-offers-admin.html';
          } else if (msg) { msg.textContent = 'Mot de passe invalide.'; msg.style.color = '#b00020'; }
        }).catch(function () { submit.disabled = false; if (msg) msg.textContent = 'Erreur. Réessaie.'; });
    });
  }

  function wirePartnerFunnel(form) {
    var state = {
      step: 1,
      types: [],
      cities: [],
      dates: [],
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
    };
    var steps = [].slice.call(form.querySelectorAll('[data-partner-step]'));
    var progress = form.querySelector('[data-partner-progress]');
    var msg = form.querySelector('[data-svp="partner-msg"]');
    var submit = form.querySelector('[data-svp="partner-submit"]');
    var back = form.querySelector('[data-partner-back]');
    var feeNote = form.querySelector('[data-partner-fee-note]');
    var sent = form.querySelector('[data-partner-sent]');
    var card = form.querySelector('[data-partner-card]');
    var actions = form.querySelector('[data-partner-actions]');
    var monthLabel = form.querySelector('[data-partner-month]');
    var daysWrap = form.querySelector('[data-partner-days]');
    var datesText = form.querySelector('[data-partner-dates]');
    var months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    function say(t, err) {
      if (!msg) return;
      msg.textContent = t || '';
      msg.style.color = err ? '#b00020' : '#3347CA';
    }
    function val(n) {
      var el = form.querySelector('[name="' + n + '"]');
      return el ? String(el.value || '').trim() : '';
    }
    function lastStep() {
      return 6;
    }
    function visibleStep(n) {
      if (n === 5 && state.types.indexOf('premium') < 0) return 6;
      return n;
    }
    function showStep(n) {
      state.step = visibleStep(n);
      steps.forEach(function (step) { step.hidden = step.getAttribute('data-partner-step') !== String(state.step); });
      var total = state.types.indexOf('premium') >= 0 ? 6 : 5;
      var normalized = state.types.indexOf('premium') >= 0 ? state.step : (state.step > 5 ? 5 : state.step);
      if (progress) progress.style.width = Math.max(20, Math.round((normalized / total) * 100)) + '%';
      if (back) back.hidden = state.step <= 1;
      if (submit) submit.textContent = state.step >= lastStep() ? 'Envoyer ma demande de partenariat' : 'Continuer →';
      say('');
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    function selectedLabels(selector, attr) {
      return [].slice.call(form.querySelectorAll(selector + '[data-selected="1"]')).map(function (el) {
        return el.getAttribute(attr) || el.textContent.trim();
      });
    }
    function validate() {
      if (state.step === 1 && !state.types.length) {
        say('Choisissez au moins une option de partenariat.', true);
        return false;
      }
      if (state.step === 2) {
        // Was `!organisation && !name` — an OR, so either one alone let you
        // through and partnership requests arrived with no contact person (or no
        // organisation) to reply to. Both are needed, plus a valid email.
        var e2 = checkRequired([
          { sel: '[name="organisation"]', label: 'Nom (artiste ou organisation)' },
          { sel: '[name="name"]', label: 'Nom du contact' },
          { sel: '[name="email"]', label: 'Courriel', email: true }
        ]);
        if (e2) { say(e2, true); return false; }
      }
      if (state.step === 3 && !state.cities.length && !val('otherCity')) {
        say('Choisissez au moins une ville ou indiquez une autre ville.', true);
        return false;
      }
      if (state.step === 4 && !state.dates.length) {
        say('Choisissez au moins une date.', true);
        return false;
      }
      if (state.step === 5 && state.types.indexOf('premium') >= 0 && !val('offerType') && !val('message')) {
        say("Décrivez l'offre Premium ou le type d'avantage proposé.", true);
        return false;
      }
      return true;
    }
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function dateKey(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
    function formatDate(key) {
      var parts = String(key).split('-');
      return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1].toLowerCase() + ' ' + parts[0];
    }
    function renderDates() {
      if (monthLabel) monthLabel.textContent = months[state.month] + ' ' + state.year;
      if (!daysWrap) return;
      var first = (new Date(state.year, state.month, 1).getDay() + 6) % 7;
      var count = new Date(state.year, state.month + 1, 0).getDate();
      daysWrap.innerHTML = '';
      for (var i = 0; i < first; i++) {
        var blank = document.createElement('button');
        blank.type = 'button'; blank.className = 'partner-day'; blank.disabled = true; blank.textContent = '.';
        daysWrap.appendChild(blank);
      }
      for (var d = 1; d <= count; d++) {
        (function (day) {
          var key = dateKey(state.year, state.month, day);
          var btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'partner-day'; btn.textContent = String(day);
          markSelected(btn, state.dates.indexOf(key) >= 0);
          btn.addEventListener('click', function () {
            var ix = state.dates.indexOf(key);
            if (ix >= 0) state.dates.splice(ix, 1); else state.dates.push(key);
            renderDates();
          });
          daysWrap.appendChild(btn);
        })(d);
      }
      if (datesText) {
        var sorted = state.dates.slice().sort();
        datesText.textContent = sorted.length ? 'Dates choisies : ' + sorted.map(formatDate).join(', ') : 'Dates choisies : aucune';
      }
    }
    function submitPartner() {
      var data = {
        name: val('name'),
        email: val('email'),
        organisation: val('organisation'),
        role: val('role'),
        interests: selectedLabels('[data-svp-partner-interest]', 'data-svp-partner-interest'),
        types: state.types.slice(),
        cities: state.cities.slice(),
        otherCity: val('otherCity'),
        dates: state.dates.slice().sort(),
        offerType: val('offerType'),
        ticketQuantity: val('ticketQuantity'),
        message: val('message'),
        generalMessage: val('generalMessage'),
        website: val('website'),
      };
      if (!submit) return;
      submit.disabled = true;
      var original = submit.textContent;
      submit.textContent = 'Envoi…';
      say('');
      fetch(FN + 'send-partenariat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }).catch(function () { return { ok: r.ok, d: {} }; }); })
        .then(function (res) {
          submit.disabled = false;
          submit.textContent = original;
          if (res.ok && res.d && res.d.sent) {
            if (card) card.hidden = true;
            if (sent) sent.hidden = false;
            if (actions) actions.hidden = true;
            if (progress) progress.style.width = '100%';
            applyRevealTargets(sent);
            say('');
            window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
          } else {
            say((res.d && res.d.error) || "L'envoi a échoué. Réessaie.", true);
          }
        }).catch(function () {
          submit.disabled = false;
          submit.textContent = original;
          say('Erreur. Réessaie plus tard.', true);
        });
    }

    form.querySelectorAll('[data-svp-partner-interest]').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var type = opt.getAttribute('data-partner-type') || opt.getAttribute('data-svp-partner-interest') || '';
        var i = state.types.indexOf(type);
        if (i >= 0) state.types.splice(i, 1); else state.types.push(type);
        markSelected(opt, state.types.indexOf(type) >= 0);
        if (feeNote) feeNote.hidden = state.types.indexOf('edito') < 0;
        showStep(state.step);
      });
    });
    form.querySelectorAll('[data-partner-city]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var city = chip.getAttribute('data-partner-city') || chip.textContent.trim();
        var i = state.cities.indexOf(city);
        if (i >= 0) state.cities.splice(i, 1); else state.cities.push(city);
        markSelected(chip, state.cities.indexOf(city) >= 0);
      });
    });
    var prev = form.querySelector('[data-partner-prev]');
    var nextMonth = form.querySelector('[data-partner-next-month]');
    if (prev) prev.addEventListener('click', function () {
      if (state.month === 0) { state.month = 11; state.year -= 1; } else state.month -= 1;
      renderDates();
    });
    if (nextMonth) nextMonth.addEventListener('click', function () {
      if (state.month === 11) { state.month = 0; state.year += 1; } else state.month += 1;
      renderDates();
    });
    if (back) back.addEventListener('click', function () {
      var next = state.step - 1;
      if (next === 5 && state.types.indexOf('premium') < 0) next = 4;
      showStep(Math.max(1, next));
    });
    if (submit) submit.addEventListener('click', function (e) {
      e.preventDefault();
      if (!validate()) return;
      if (state.step >= lastStep()) { submitPartner(); return; }
      showStep(state.step + 1);
    });
    renderDates();
    showStep(1);
  }

  // ---- P5: partenariat form (interest selector + fields) ----
  function wirePartenariat() {
    var form = document.querySelector('[data-svp="partner-form"]');
    if (!form) return;
    if (form.hasAttribute('data-svp-partner-funnel')) { wirePartnerFunnel(form); return; }
    var msg = form.querySelector('[data-svp="partner-msg"]');
    var btn = form.querySelector('[data-svp="partner-submit"]');
    var interests = [];
    form.querySelectorAll('[data-svp-partner-interest]').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var v = opt.getAttribute('data-svp-partner-interest');
        var i = interests.indexOf(v);
        if (i >= 0) { interests.splice(i, 1); opt.removeAttribute('data-selected'); }
        else { interests.push(v); opt.setAttribute('data-selected', '1'); }
      });
    });
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value : ''; }
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var data = { name: val('name'), email: val('email'), organisation: val('organisation'), message: val('message'), website: val('website'), interests: interests };
      // otherCity / offerType / ticketQuantity are deliberately absent: they are
      // conditional inputs and checkRequired only enforces what is on screen,
      // but they are also genuinely optional even when shown.
      var perr = checkRequired([
        { sel: '[name="organisation"]', label: 'Nom (artiste ou organisation)' },
        { sel: '[name="name"]', label: 'Nom du contact' },
        { sel: '[name="email"]', label: 'Courriel', email: true },
        { sel: '[name="message"]', label: 'Votre spectacle ou votre offre' }
      ]);
      if (perr) { say(perr, true); return; }
      btn.disabled = true; say('Envoi…');
      fetch(FN + 'send-partenariat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); }).then(function (d) {
          btn.disabled = false;
          if (d && d.sent) {
            ['name', 'email', 'organisation', 'message'].forEach(function (n) { var el = form.querySelector('[name="' + n + '"]'); if (el) el.value = ''; });
            interests = []; form.querySelectorAll('[data-svp-partner-interest]').forEach(function (o) { o.removeAttribute('data-selected'); });
            say('Merci ! On vous revient rapidement.');
          } else { say((d && d.error) || "L'envoi a échoué. Réessaie.", true); }
        }).catch(function () { btn.disabled = false; say('Erreur. Réessaie plus tard.', true); });
    });
  }

  // ---- exit-intent popup (home page only, once per session, after 45s) ----
  function wireExitIntent() {
    // HOME PAGE ONLY. It's the newsletter pitch; showing it on premium /
    // archive / form pages is what made it feel like it popped up at random.
    var p = location.pathname;
    if (!(p === '/' || /(^|\/)(accueil|index)(\.html)?$/i.test(p))) return;
    if (document.querySelector('[data-svp="funnel"]') || document.querySelector('[data-svp="compte"]')) return;
    try { if (sessionStorage.getItem('svp_exit')) return; } catch (e) {}
    if (getEmail()) return;                     // already gave us their email
    var shown = false;
    // Arm ONLY after 45s spent ON the page. Time while the tab is hidden does
    // not count, and there is no scroll shortcut anymore — before the 45s mark
    // no exit signal can trigger it, so it can never feel early or random.
    var DWELL_MS = 45000, armed = false, spent = 0, since = 0, timer = null;
    function startDwell() {
      if (armed || timer || document.hidden) return;
      since = Date.now();
      timer = setTimeout(function () { armed = true; timer = null; }, Math.max(0, DWELL_MS - spent));
    }
    function pauseDwell() {
      if (!timer) return;
      clearTimeout(timer); timer = null;
      spent += Date.now() - since;
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseDwell(); else startDwell();
    });
    startDwell();
    function show() {
      if (shown) return; shown = true;
      try { sessionStorage.setItem('svp_exit', '1'); } catch (e) {}
      var o = document.createElement('div');
      o.setAttribute('data-svp', 'exit-modal');
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(22,24,43,.55);display:flex;align-items:center;justify-content:center;padding:20px';
      o.innerHTML = '<div style="background:#FFFEF5;max-width:420px;width:100%;border:1.5px solid #16182B;border-radius:18px;box-shadow:6px 6px 0 #3347CA;padding:28px;text-align:center;position:relative">'
        + '<button aria-label="Fermer" data-x style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:22px;cursor:pointer;color:#8B8DA0">×</button>'
        + '<h3 style="font:800 22px \'Bricolage Grotesque\',sans-serif;margin:0 0 8px;color:#16182B">Attends&nbsp;! 🎭</h3>'
        + '<p style="font:500 14.5px \'Instrument Sans\',sans-serif;color:#4A4D66;margin:0 0 18px;line-height:1.5">Reçois chaque lundi les meilleurs spectacles pas chers de ta ville. Gratuit, 2 secondes.</p>'
        + '<input data-x-email type="email" placeholder="ton.courriel@exemple.com" style="box-sizing:border-box;width:100%;border:1.5px solid #E1E0D4;border-radius:10px;padding:13px 14px;font:500 14px \'Instrument Sans\',sans-serif;margin-bottom:10px">'
        + '<button data-x-go style="display:block;width:100%;background:#3347CA;color:#FFFEF5;border:none;border-radius:100px;padding:14px;font-weight:700;font-size:15px;cursor:pointer">Je m\'inscris gratuitement</button>'
        + '</div>';
      document.body.appendChild(o);
      var close = function () { o.remove(); };
      o.querySelector('[data-x]').addEventListener('click', close);
      o.addEventListener('click', function (e) { if (e.target === o) close(); });
      o.querySelector('[data-x-go]').addEventListener('click', function () {
        var em = (o.querySelector('[data-x-email]').value || '').trim();
        if (!validEmail(em)) { o.querySelector('[data-x-email]').focus(); return; }
        setEmail(em); pixel('track', 'Lead'); window.location.href = 'tunnel.html';
      });
    }
    document.addEventListener('mouseout', function (e) {
      if (!armed) return;                               // < 45s on page — ignore
      if (e.clientY <= 0 && !e.relatedTarget) show();
    });
  }

  // ---- P2b/B: render live + archived premium offers from the backend ----
  var FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function frDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getUTCDate() + ' ' + FR_MONTHS[d.getUTCMonth()];
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function observeOffer(card) {
    if (typeof IntersectionObserver === 'undefined') return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        pixel('trackCustom', 'OfferView');
        var email = getEmail();
        if (email) { try { fetch(FN + 'track-offer-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, offerId: en.target.getAttribute('data-offer-id') || '' }), keepalive: true }); } catch (e) {} }
      });
    }, { threshold: 0.5 });
    io.observe(card);
  }
  // Video helpers: YouTube/Vimeo -> autoplay embed, direct files -> <video>.
  function videoEmbed(url) {
    url = String(url || '').trim(); if (!url) return null;
    var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&mute=1&loop=1&playlist=' + m[1] + '&controls=0&modestbranding=1&playsinline=1&rel=0';
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1&muted=1&loop=1&background=1';
    return null;
  }
  function isVideoFile(url) {
    var raw = String(url || '');
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(raw)) return true;
    try {
      var parsed = new URL(raw, location.href);
      var name = parsed.searchParams.get('name') || parsed.searchParams.get('filename') || '';
      return /\.(mp4|webm|ogg|mov)$/i.test(name);
    } catch (e) {
      return false;
    }
  }
  // A still frame so a card is never blank before playback starts (or if it is
  // refused). Uses the offer's own image when it has one.
  function posterAttr(o) {
    var img = o && o.image_url && String(o.image_url).trim();
    return img ? ' poster="' + esc(offerMediaUrl(img)) + '"' : '';
  }
  var autoplayVideosWired = false;
  var autoplayVideoObserver = null;
  var autoplayVideoTicking = false;
  function isVideoInViewport(video) {
    var r = video.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight) && r.left < (window.innerWidth || document.documentElement.clientWidth);
  }
  function tryPlayVideo(video) {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('preload', 'auto');
    if (!video.getAttribute('src')) return;
    try {
      if (video.readyState === 0) video.load();
      var p = video.play();
      if (p && p.catch) p.catch(function () {
        video.setAttribute('data-svp-video-waiting', '1');
      });
    } catch (e) {
      video.setAttribute('data-svp-video-waiting', '1');
    }
  }
  function playVisibleAutoplayVideos(root) {
    [].slice.call((root || document).querySelectorAll('video[autoplay]')).forEach(function (video) {
      if (isVideoInViewport(video)) tryPlayVideo(video);
    });
  }
  function scheduleVisibleVideoPlay() {
    if (autoplayVideoTicking) return;
    autoplayVideoTicking = true;
    requestAnimationFrame(function () {
      autoplayVideoTicking = false;
      playVisibleAutoplayVideos(document);
    });
  }
  function ensureAutoplayVideoWakeups() {
    if (autoplayVideosWired) return;
    autoplayVideosWired = true;
    if ('IntersectionObserver' in window) {
      autoplayVideoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) tryPlayVideo(entry.target);
        });
      }, { threshold: 0.15, rootMargin: '120px 0px' });
    }
    ['touchstart', 'pointerdown', 'click'].forEach(function (type) {
      document.addEventListener(type, function () { playVisibleAutoplayVideos(document); }, { passive: true });
    });
    window.addEventListener('scroll', scheduleVisibleVideoPlay, { passive: true });
    window.addEventListener('resize', scheduleVisibleVideoPlay);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) setTimeout(function () { playVisibleAutoplayVideos(document); }, 80);
    });
    window.addEventListener('pageshow', function () {
      setTimeout(function () { playVisibleAutoplayVideos(document); }, 120);
    });
  }
  function startAutoplayVideos(root) {
    ensureAutoplayVideoWakeups();
    [].slice.call((root || document).querySelectorAll('video[autoplay]')).forEach(function (video) {
      if (video.getAttribute('data-svp-video-wired') !== '1') {
        video.setAttribute('data-svp-video-wired', '1');
        video.addEventListener('canplay', function () { tryPlayVideo(video); }, { once: true });
        video.addEventListener('playing', function () { video.removeAttribute('data-svp-video-waiting'); });
        if (autoplayVideoObserver) autoplayVideoObserver.observe(video);
      }
      tryPlayVideo(video);
    });
    setTimeout(function () { playVisibleAutoplayVideos(root || document); }, 250);
    setTimeout(function () { playVisibleAutoplayVideos(root || document); }, 900);
  }

  function premiumMediaFallback(o) {
    var img = o && o.image_url && String(o.image_url).trim();
    if (img) {
      return '<div style="position:absolute;inset:0;z-index:0;background:#16182B center/cover no-repeat;background-image:url(' + esc(offerMediaUrl(img)) + ')"></div>';
    }
    return '<div style="position:absolute;inset:0;z-index:0;background:#2536C8;display:flex;align-items:center;justify-content:center">'
      + '<div style="width:96px;height:96px;opacity:.5;background:url(' + esc(funnelOfferIcon(o)) + ') center/contain no-repeat"></div></div>';
  }
  function premiumMedia(o) {
    var v = o.video_url && String(o.video_url).trim();
    if (v) {
      var emb = videoEmbed(v);
      if (emb) return '<iframe src="' + esc(emb) + '" allow="autoplay;encrypted-media" tabindex="-1" style="position:absolute;inset:0;width:100%;height:100%;border:0;z-index:0;pointer-events:none"></iframe>';
      if (isVideoFile(v)) return '<video src="' + esc(offerMediaUrl(v)) + '" autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture' + posterAttr(o) + ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0"></video>';
    }
    return '';
  }
  function compteMedia(o) {
    var v = o.video_url && String(o.video_url).trim();
    if (v) {
      var emb = videoEmbed(v);
      if (emb) return '<div style="height:110px;position:relative;overflow:hidden"><iframe src="' + esc(emb) + '" allow="autoplay;encrypted-media" tabindex="-1" style="position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none"></iframe></div>';
      if (isVideoFile(v)) return '<div style="height:110px;position:relative;overflow:hidden"><video src="' + esc(offerMediaUrl(v)) + '" autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture' + posterAttr(o) + ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video></div>';
    }
    return o.image_url ? '<div style="height:110px;background:#EEF0FD center/cover no-repeat;background-image:url(' + esc(offerMediaUrl(o.image_url)) + ')"></div>'
      : '<div style="height:110px;background:#EEF0FD;display:flex;align-items:center;justify-content:center"><div style="width:70px;height:70px;background:url(assets/icon-mic-circle.png) center/contain no-repeat;mix-blend-mode:multiply"></div></div>';
  }
  var offerDetailById = {};
  var accountOfferAccess = {
    loaded: false,
    isPremium: false,
    freeToken: { used: false },
    session: ''
  };
  var FREE_TOKEN_TRIAL_PROMPT_KEY = 'svp_free_token_trial_prompt_seen';
  function rememberOffer(offer, archived) {
    if (!offer || !offer.id) return;
    offerDetailById[String(offer.id)] = Object.assign({}, offer, { archived: !!archived });
  }
  function hasOfferSpecifics(offer) {
    if (!offer) return false;
    if (offer.details_unlocked) return true;
    var extra = offer.extra_fields || {};
    return Boolean(
      offer.description ||
      offer.promo_code ||
      offer.ticket_url ||
      Object.keys(extra).some(function (key) { return String(extra[key] || '').trim(); })
    );
  }
  function redeemedFreeOfferId() {
    return accountOfferAccess.freeToken && accountOfferAccess.freeToken.used
      ? String(accountOfferAccess.freeToken.offerId || '')
      : '';
  }
  function goToPremiumOffer() {
    storePremiumScrollIntent();
    window.location.href = 'premium.html#premium-offer';
  }
  function showFreeTokenUsedDialog() {
    var token = accountOfferAccess.freeToken || {};
    svpDialog({
      title: 'Jeton gratuit déjà utilisé',
      message: 'Tu as déjà utilisé ton jeton gratuit unique. Passe à Premium pour débloquer toutes les offres et continuer à voir les codes.',
      detail: token.offerTitle ? 'Utilisé pour : ' + token.offerTitle : '',
      confirmLabel: 'Passer à Premium',
      secondaryLabel: 'Plus tard',
      onConfirm: goToPremiumOffer
    });
  }
  function showFreeTokenBusyDialog(offer) {
    svpDialog({
      title: 'Déblocage en cours',
      message: "On vérifie ton jeton gratuit et on prépare les détails de l'offre.",
      detail: offer && offer.title ? offer.title : '',
      confirmLabel: 'Déblocage...',
      busy: true,
      locked: true
    });
  }
  function updateFreeTokenNotice() {
    var notice = document.querySelector('[data-svp-free-token-notice]');
    if (!notice) return;
    if (accountOfferAccess.isPremium) {
      notice.style.display = 'none';
      return;
    }
    var title = notice.querySelector('[data-svp-free-token-title]');
    var copy = notice.querySelector('[data-svp-free-token-copy]');
    var token = accountOfferAccess.freeToken || {};
    if (title) title.textContent = token.used ? 'Ton jeton gratuit a été utilisé' : 'Ton jeton gratuit est prêt';
    if (copy) {
      copy.textContent = token.used
        ? 'Tu peux revoir les détails de l’offre choisie. Pour débloquer les autres codes et billets, passe à Premium.'
        : 'Comme membre gratuit, tu peux débloquer une seule offre Premium de ton choix. Choisis bien: ce jeton ne peut être utilisé qu’une fois.';
    }
    notice.style.display = '';
  }
  function freeTokenPromptId(token) {
    return String((token && (token.redeemedAt || token.offerId)) || 'used');
  }
  function maybePromptTrialAfterFreeToken() {
    if (!document.querySelector('[data-svp="compte"]') || accountOfferAccess.isPremium) return;
    var token = accountOfferAccess.freeToken || {};
    if (!token.used) return;
    var promptId = freeTokenPromptId(token);
    try {
      if (localStorage.getItem(FREE_TOKEN_TRIAL_PROMPT_KEY) === promptId) return;
    } catch (e) {}
    setTimeout(function () {
      if (document.querySelector('[data-svp-dialog], .svp-offer-modal')) return;
      try { localStorage.setItem(FREE_TOKEN_TRIAL_PROMPT_KEY, promptId); } catch (e2) {}
      svpDialog({
        kicker: '14 jours gratuits',
        title: 'Envie de continuer avec Premium ?',
        message: "Ton jeton gratuit t'a donné accès à une offre. Avec l'essai gratuit de 14 jours, tu peux débloquer toutes les prochaines offres Premium.",
        detail: token.offerTitle ? 'Jeton utilisé pour : ' + token.offerTitle : '',
        confirmLabel: "Démarrer l'essai gratuit",
        secondaryLabel: 'Plus tard',
        onConfirm: function () {
          var btn = document.querySelector('[data-svp="checkout"]');
          startPremiumCheckout(btn, { plan: 'trial', returnPath: '/compte.html' });
        }
      });
    }, 1300);
  }
  function claimFreeOfferToken(offer) {
    var session = accountOfferAccess.session || getSession();
    if (!session) {
      window.location.href = 'connexion.html';
      return;
    }
    showFreeTokenBusyDialog(offer);
    fetch(FN + 'redeem-free-offer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: session, offerId: offer.id })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }).catch(function () { return { ok: r.ok, status: r.status, d: {} }; });
    }).then(function (res) {
      var d = res.d || {};
      if (!res.ok) {
        if (d.code === 'free_token_used') {
          accountOfferAccess.freeToken = d.freeToken || accountOfferAccess.freeToken || { used: true };
          updateFreeTokenNotice();
          showFreeTokenUsedDialog();
          return;
        }
        svpDialog({
          title: "L'offre n'a pas pu être débloquée",
          message: d.error || 'Réessaie dans un instant. Si ça persiste, écris-nous à spectacles@silvousplaitsvp.com.',
          confirmLabel: 'Compris'
        });
        return;
      }
      if (d.freeToken) accountOfferAccess.freeToken = d.freeToken;
      if (d.accessLevel === 'premium') {
        accountOfferAccess.isPremium = true;
        setPremiumOnlyVisible(true);
      }
      if (d.offer && d.offer.id) rememberOffer(d.offer, false);
      updateFreeTokenNotice();
      showOfferDetail(offer.id);
    }).catch(function () {
      svpDialog({
        title: 'Connexion interrompue',
        message: "On n'a pas pu débloquer l'offre pour le moment. Vérifie ta connexion et réessaie.",
        confirmLabel: 'Compris'
      });
    });
  }
  function askFreeOfferTokenConfirmation(offer) {
    svpDialog({
      title: 'Utiliser ton jeton gratuit ?',
      message: 'Tu peux débloquer une seule offre Premium avec ton jeton gratuit. En confirmant, il sera utilisé pour ce spectacle et ce choix est définitif.',
      detail: offer.title || '',
      confirmLabel: 'Utiliser mon jeton',
      secondaryLabel: 'Annuler',
      onConfirm: function () { claimFreeOfferToken(offer); }
    });
  }
  function offerDetailMedia(o) {
    var v = o.video_url && String(o.video_url).trim();
    if (v) {
      var emb = videoEmbed(v);
      if (emb) return '<iframe class="svp-offer-modal__media-frame" src="' + esc(emb) + '" allow="autoplay;encrypted-media" title="' + esc(o.title || 'Offre Premium') + '"></iframe>';
      if (isVideoFile(v)) return '<video class="svp-offer-modal__media-frame" src="' + esc(offerMediaUrl(v)) + '" autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture' + posterAttr(o) + '></video>';
    }
    if (o.image_url) return '<img class="svp-offer-modal__media-img" src="' + esc(offerMediaUrl(o.image_url)) + '" alt="">';
    return '<div class="svp-offer-modal__media-fallback"><img src="' + esc(funnelOfferIcon(o)) + '" alt=""></div>';
  }
  function safeHttpUrl(url) {
    try {
      var u = new URL(String(url || '').trim(), location.href);
      return /^https?:$/i.test(u.protocol) ? u.href : '';
    } catch (e) {
      return '';
    }
  }
  function extraFieldLabel(key) {
    return String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function showOfferDetail(id) {
    var offer = offerDetailById[String(id || '')];
    if (!offer) return;
    var existingDialog = document.querySelector('[data-svp-dialog]');
    if (existingDialog && existingDialog.parentNode) existingDialog.parentNode.removeChild(existingDialog);
    var isAccountPage = document.body && document.body.getAttribute('data-svp') === 'compte';
    var isFreeAccount = isAccountPage && document.body.getAttribute('data-svp-account-premium') !== 'true';
    if (isFreeAccount) {
      var redeemedId = redeemedFreeOfferId();
      if (redeemedId && redeemedId === String(offer.id || '')) {
        if (!hasOfferSpecifics(offer)) {
          claimFreeOfferToken(offer);
          return;
        }
      } else if (redeemedId) {
        showFreeTokenUsedDialog();
        return;
      } else {
        askFreeOfferTokenConfirmation(offer);
        return;
      }
    }
    if (isAccountPage && !hasOfferSpecifics(offer)) {
      svpDialog({ title: 'Détails indisponibles', message: "Les détails de cette offre ne sont pas encore disponibles. Réessaie un peu plus tard.", confirmLabel: 'Compris' });
      return;
    }
    var ticketUrl = safeHttpUrl(offer.ticket_url);
    var meta = [offer.venue || '', regionLabel(offer.region || ''), frDate(offer.event_date)].filter(Boolean).join(' · ');
    var extraFields = Object.keys(offer.extra_fields || {}).filter(function (key) {
      return String((offer.extra_fields || {})[key] || '').trim();
    }).map(function (key) {
      return '<div class="svp-offer-modal__extra"><span>' + esc(extraFieldLabel(key) || 'Détail') + '</span><strong>' + esc(String(offer.extra_fields[key] || '').trim()) + '</strong></div>';
    }).join('');
    var modal = document.createElement('div');
    modal.className = 'svp-offer-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', offer.title || 'Offre Premium');
    modal.innerHTML = '<div class="svp-offer-modal__card">'
      + '<button type="button" class="svp-offer-modal__close" aria-label="Fermer">×</button>'
      + '<div class="svp-offer-modal__media">' + offerDetailMedia(offer) + '</div>'
      + '<div class="svp-offer-modal__body">'
      + '<div class="svp-offer-modal__badges"><span>' + esc(offer.offer_type || 'Offre Premium') + '</span>' + (offer.archived ? '<span>Offre passée</span>' : '') + '</div>'
      + '<h2>' + esc(offer.title || 'Offre Premium') + '</h2>'
      + (meta ? '<p class="svp-offer-modal__meta">' + esc(meta) + '</p>' : '')
      + (offer.description ? '<p class="svp-offer-modal__description">' + esc(offer.description) + '</p>' : '<p class="svp-offer-modal__description">Tous les détails de cette offre sont envoyés aux membres Premium.</p>')
      + extraFields
      + (offer.promo_code ? '<div class="svp-offer-modal__code"><span>Code promo</span><strong>' + esc(offer.promo_code) + '</strong></div>' : '')
      + (ticketUrl && !offer.archived ? '<a class="svp-offer-modal__cta" href="' + esc(ticketUrl) + '" target="_blank" rel="noopener">Ouvrir la billetterie</a>' : '')
      + '</div></div>';
    function close() {
      document.removeEventListener('keydown', onKey);
      modal.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('.svp-offer-modal__close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    startAutoplayVideos(modal);
    var closeBtn = modal.querySelector('.svp-offer-modal__close');
    if (closeBtn) closeBtn.focus();
  }
  function wireOfferDetailButtons() {
    [].slice.call(document.querySelectorAll('[data-svp-offer-detail]')).forEach(function (btn) {
      if (btn.getAttribute('data-offer-detail-wired') === '1') return;
      btn.setAttribute('data-offer-detail-wired', '1');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        showOfferDetail(btn.getAttribute('data-offer-id'));
      });
    });
  }
  function premiumCard(o, archived) {
    var img = o.image_url ? 'background:#0b1030 url(' + esc(offerMediaUrl(o.image_url)) + ') center/cover no-repeat;' : 'background:repeating-linear-gradient(135deg,#4155DE,#4155DE 14px,#3347CA 14px,#3347CA 28px);';
    return '<div data-svp="offer" data-offer-id="' + esc(o.id) + '" style="position:relative;flex:0 0 auto;width:290px;max-width:86vw;height:400px;scroll-snap-align:start;border-radius:20px;overflow:hidden;box-shadow:rgba(142,160,245,.3) 5px 6px 0;' + img + 'display:flex;flex-direction:column;justify-content:space-between;padding:18px">'
      + premiumMediaFallback(o)
      + premiumMedia(o)
      + '<div style="position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(8,10,26,0) 42%,rgba(8,10,26,.85) 74%)"></div>'
      + '<div style="position:relative;z-index:2;display:flex;justify-content:flex-end"><div style="background:#F5E642;color:#16182B;font:800 12px \'Instrument Sans\',sans-serif;padding:5px 11px;border-radius:100px">' + esc(o.offer_type || 'Premium') + '</div></div>'
      + '<div style="position:relative;z-index:2">'
      + '<div style="font:700 16.5px/1.3 \'Bricolage Grotesque\',sans-serif;color:#FFFEF5;margin-bottom:4px">' + esc(o.title) + '</div>'
      + '<div style="font:400 13px \'Instrument Sans\',sans-serif;color:#C3C8E4;margin-bottom:12px">' + esc(o.venue || '') + (o.event_date ? ' · ' + esc(frDate(o.event_date)) : '') + '</div>'
      + (archived
        ? '<span style="display:inline-block;font:700 12.5px \'Instrument Sans\',sans-serif;color:#C3C8E4;background:rgba(255,254,245,.1);padding:9px 17px;border-radius:100px">Offre passée</span>'
        : '<a href="#premium-offer" data-svp="premium-cta" style="display:inline-block;font:700 12.5px \'Instrument Sans\',sans-serif;color:#16182B;background:#F5E642;padding:9px 17px;border-radius:100px;text-decoration:none">Réserver</a>')
      + '</div></div>';
  }
  function compteCard(o, archived) {
    var img = compteMedia(o);
    return '<div data-svp="offer" data-offer-id="' + esc(o.id) + '" data-offer-type="' + esc(o.offer_type || '') + '" data-offer-region="' + esc(o.region || '') + '" data-offer-search="' + esc((o.title || '') + ' ' + (o.venue || '')) + '" style="background:#fff;border:1.5px solid #ECEAE0;border-radius:16px;overflow:hidden;display:flex;flex-direction:column">'
      + '<div style="position:relative">' + img
      + '<span style="position:absolute;top:10px;left:10px;background:#F5E642;color:#16182B;font:700 11px \'Instrument Sans\',sans-serif;padding:4px 11px;border-radius:100px">' + esc(o.offer_type || 'Offre') + '</span>'
      + '<span style="position:absolute;top:10px;right:10px;background:#fff;color:#4A4D66;font:600 11px \'Instrument Sans\',sans-serif;padding:4px 11px;border-radius:100px;border:1px solid #ECEAE0">' + esc(o.region || '') + '</span></div>'
      + '<div style="padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px;flex:1">'
      + '<div style="font:700 15px/1.25 \'Bricolage Grotesque\',sans-serif">' + esc(o.title) + '</div>'
      + '<div style="font:500 12.5px \'Instrument Sans\',sans-serif;color:#8B8DA0;flex:1">' + esc(o.venue || '') + (o.event_date ? ' · ' + esc(frDate(o.event_date)) : '') + '</div>'
      + (archived
        ? '<span style="margin-top:10px;text-align:center;background:#EEF0FD;color:#8B8DA0;border-radius:100px;padding:11px;font:700 13px \'Instrument Sans\',sans-serif">Offre passée</span>'
        : '<button type="button" data-svp-offer-detail data-offer-id="' + esc(o.id) + '" style="margin-top:10px;text-align:center;background:#3347CA;color:#FFFEF5;border:none;border-radius:100px;padding:11px;font:700 13px \'Instrument Sans\',sans-serif;text-decoration:none;cursor:pointer">Voir l\'offre</button>')
      + '</div></div>';
  }
  function loadAccountOffers(session) {
    if (!document.querySelector('[data-svp="compte"]')) return;
    var grid = document.querySelector('[data-svp="offers-grid"]');
    if (!grid) return;
    accountOfferAccess.session = session || getSession();
    accountOfferAccess.loaded = false;
    setAccountCatalogVisible(true);
    grid.innerHTML = rep(skeletonGridCard(), 6);
    fetch(FN + 'list-account-premium-offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: accountOfferAccess.session })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }).catch(function () { return { ok: r.ok, status: r.status, d: {} }; });
    }).then(function (res) {
      var d = res.d || {};
      if (!res.ok || !d.success) {
        if (res.status === 401) {
          setSession('');
          window.location.href = 'connexion.html';
          return;
        }
        grid.innerHTML = '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Impossible de charger les offres pour le moment.</p>';
        return;
      }
      accountOfferAccess.loaded = true;
      accountOfferAccess.isPremium = d.accessLevel === 'premium';
      accountOfferAccess.freeToken = d.freeToken || { used: false };
      if (document.body) document.body.setAttribute('data-svp-account-premium', accountOfferAccess.isPremium ? 'true' : 'false');
      setPremiumOnlyVisible(accountOfferAccess.isPremium);
      setAccountCatalogVisible(true);
      updateFreeTokenNotice();
      maybePromptTrialAfterFreeToken();

      var offers = Array.isArray(d.offers) ? d.offers : [];
      offerDetailById = {};
      offers.forEach(function (offer) { rememberOffer(offer, false); });
      grid.innerHTML = offers.map(function (offer) { return compteCard(offer, false); }).join('')
        || '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Aucune offre pour le moment — reviens lundi pour la nouvelle sélection.</p>';
      startAutoplayVideos(grid);
      [].slice.call(grid.querySelectorAll('[data-svp="offer"]')).forEach(observeOffer);
      wireOfferDetailButtons();
      applyRevealTargets(grid);
      if (typeof window.__svpApplyFilters === 'function') window.__svpApplyFilters();
    }).catch(function () {
      grid.innerHTML = '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Impossible de charger les offres pour le moment.</p>';
    });
  }
  // ---- Archive (past offers, read-only) ----
  function wireArchive() {
    var grid = document.querySelector('[data-svp="archive-grid"]');
    if (!grid) return;
    var empty = document.querySelector('[data-svp="archive-empty"]');
    // Loading state: shimmering placeholder cards while the offers are fetched,
    // so the page never sits visibly blank on a slow connection.
    grid.innerHTML = rep(skeletonGridCard(), 6);
    function fail(text) {
      grid.innerHTML = '';
      if (!empty) return;
      if (text) empty.textContent = text;
      empty.style.display = 'block';
    }
    fetch(FN + 'list-archived-offers').then(function (r) { return r.json(); }).then(function (d) {
      var offers = (d && d.offers) || [];
      if (!offers.length) { fail(''); return; }
      grid.innerHTML = offers.map(function (offer) { return compteCard(offer, true); }).join('');
      applyRevealTargets(grid);
    }).catch(function () { fail("Impossible de charger l'archive pour le moment. Réessaie plus tard."); });
  }
  // ---- Testimonial sections become swipeable carousels on small screens ----
  // Both testimonial blocks stacked into a tall column on a phone: accueil's is
  // a max-content marquee (responsive.css unwraps it into a wrapped stack) and
  // premium's is a 3-column grid (collapsed to 1fr). Neither reads well, and on
  // a narrow phone it is a lot of scrolling.
  //
  // Tag the track instead of restyling it here, so it reuses the SAME
  // [data-scroller] carousel CSS the offers list already uses — one behaviour to
  // maintain, and it stays a plain stack wherever that CSS does not apply.
  // Matched on the heading text rather than the generated inline styles, which
  // survive re-flattening; wireOffersCarousel only binds [data-scroller="offres"]
  // so these are left alone by it.
  function wireTestimonialCarousels() {
    var WANTED = /notre motivation|ce que disent nos membres/i;
    [].slice.call(document.querySelectorAll('h2, h3')).forEach(function (h) {
      if (!WANTED.test((h.textContent || '').replace(/\s+/g, ' ').trim())) return;
      var block = h.nextElementSibling;
      if (!block) return;
      // accueil wraps the marquee track in a mask/overflow box; premium's grid IS
      // the track. Prefer an inner max-content flex row when there is one.
      var track = block.querySelector('[style*="max-content"]') || block;
      if (!track || track.hasAttribute('data-scroller')) return;
      if (!track.children.length) return;
      track.setAttribute('data-scroller', 'temoignages');
      // The mask fade is tuned for a marquee sliding past; on a carousel the
      // visitor controls the position, so it just dims the card they swiped to.
      if (block !== track) block.setAttribute('data-scroller-shell', '');
      // A marquee repeats its cards so the loop can seam invisibly — accueil
      // carries 6 testimonials as 12 nodes. That is invisible while it slides,
      // but as a carousel it means swiping past every quote twice. Flag the
      // repeats so the mobile rule can drop them; the duplicates stay in the DOM
      // for the desktop marquee, which still needs them to loop.
      var seen = {};
      [].slice.call(track.children).forEach(function (card) {
        var key = (card.textContent || '').replace(/\s+/g, ' ').trim();
        if (!key) return;
        if (seen[key]) card.setAttribute('data-scroller-dupe', '');
        else seen[key] = true;
      });
    });
  }

  // ---- Offers carousel: scroll-progress thumb + arrow buttons ----
  function wireOffersCarousel() {
    var scroller = document.querySelector('[data-scroller="offres"]');
    if (!scroller) return;
    var fill = document.querySelector('[data-svp="offers-progress"]');
    // Align the carousel's first card exactly with the section title's content
    // (measured live, so it's correct at every width), then cards bleed right.
    function alignCarousel() {
      var section = scroller.closest('#offres');
      if (!section) return;
      var header = [].slice.call(section.children).filter(function (c) { return c !== scroller && c.querySelector && c.querySelector('h2'); })[0];
      if (!header) return;
      var cs = getComputedStyle(header);
      var left = header.getBoundingClientRect().left + parseFloat(cs.paddingLeft || 0);
      if (left > 0) {
        scroller.style.setProperty('padding-left', left + 'px', 'important');
        // `scroll-snap-type: x mandatory` snaps the first card to the SCROLLPORT
        // edge, which ignores padding — so the padding alone did nothing: the
        // browser just scrolled it away and the cards stayed flush with the
        // section edge, left of the title. Inset the snapport by the same amount
        // so "scrolled to the start" IS the aligned position.
        scroller.style.setProperty('scroll-padding-left', left + 'px', 'important');
      }
      // Undo any snap offset left over from before the padding was applied — but
      // only while the visitor is still at the start of the carousel, so we never
      // yank them back once they've swiped through it.
      if (scroller.scrollLeft > 0 && scroller.scrollLeft <= left + 48) scroller.scrollLeft = 0;
    }
    alignCarousel();
    window.addEventListener('resize', alignCarousel);
    setTimeout(alignCarousel, 400);
    function update() {
      if (!fill) return;
      var track = fill.parentElement;
      var container = track && track.parentElement;
      var max = scroller.scrollWidth - scroller.clientWidth;
      if (max <= 4) { // nothing to scroll — hide the bar (keep layout)
        if (container) container.style.visibility = 'hidden';
        return;
      }
      if (container) container.style.visibility = 'visible';
      var thumb = Math.max(8, Math.min(100, (scroller.clientWidth / scroller.scrollWidth) * 100));
      var progress = scroller.scrollLeft / max;
      fill.style.width = thumb + '%';
      fill.style.marginLeft = (progress * (100 - thumb)) + '%';
    }
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // arrow buttons (← / →) sit in the offers section header
    var section = scroller.closest('#offres') || document;
    var btns = [].slice.call(section.querySelectorAll('button')).filter(function (b) {
      var t = (b.textContent || '').trim(); return t === '←' || t === '→';
    });
    function step(dir) {
      var card = scroller.querySelector('[data-svp="offer"], [data-card]');
      var dx = card ? card.getBoundingClientRect().width + 20 : scroller.clientWidth * 0.8;
      scroller.scrollBy({ left: dir * dx, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    if (btns[0]) btns[0].addEventListener('click', function () { step(-1); });
    if (btns[1]) btns[1].addEventListener('click', function () { step(1); });
    // re-measure after live offers render (scrollWidth changes)
    update();
    setTimeout(update, 900);
    setTimeout(update, 2200);
  }

  function skeletonGridCard() {
    return '<div style="background:#fff;border:1.5px solid #ECEAE0;border-radius:16px;overflow:hidden;display:flex;flex-direction:column">'
      + '<div class="svp-skel" style="height:110px;border-radius:0"></div>'
      + '<div style="padding:14px 16px 16px;display:flex;flex-direction:column;gap:9px">'
      + '<div class="svp-skel" style="height:15px;width:78%"></div>'
      + '<div class="svp-skel" style="height:12px;width:52%"></div>'
      + '<div class="svp-skel" style="height:38px;border-radius:100px;margin-top:6px"></div>'
      + '</div></div>';
  }
  function skeletonCarouselCard() {
    return '<div class="svp-skel" style="flex:0 0 auto;width:290px;max-width:86vw;height:400px;border-radius:20px"></div>';
  }
  function rep(html, n) { var s = ''; for (var i = 0; i < n; i++) s += html; return s; }

  function skeletonFunnelArchiveCard() {
    return '<article class="funnel-archive-card svp-skel" aria-hidden="true"></article>';
  }
  function regionLabel(value) {
    var raw = String(value || '').trim();
    var labels = {
      Montreal: 'Montréal',
      Quebec: 'Québec',
      Sherbrooke: 'Sherbrooke',
      'Trois-Rivieres': 'Trois-Rivières',
    };
    return labels[raw] || raw;
  }
  function funnelOfferIcon(o) {
    var label = norm((o && (o.offer_type || o.filtre_offre || o.title)) || '');
    if (/humour|comedie|comedy/.test(label)) return 'assets/icon-curtain.png';
    if (/theatre|scene|spectacle|danse/.test(label)) return 'assets/icon-stage.png';
    if (/rabais|promo|2 pour|reduction/.test(label)) return 'assets/icon-tickets.png';
    if (/musique|concert|chanson/.test(label)) return 'assets/icon-mic-dance.png';
    return 'assets/icon-mic-circle.png';
  }
  function offerMediaUrl(url) {
    url = String(url || '').trim();
    if (/^assets\//i.test(url) && /\/site\//.test(location.pathname)) return '../' + url;
    return url;
  }
  function offerVisibilityFlag(offer, key) {
    var value = offer && offer[key];
    if (value == null || value === '') return true;
    return !/^(false|0|non|no|inactive)$/i.test(String(value).trim());
  }
  function showOnPremiumCarousel(offer) {
    return offerVisibilityFlag(offer, 'show_on_premium_carousel');
  }
  function showOnFormCarousel(offer) {
    return offerVisibilityFlag(offer, 'show_on_form_carousel');
  }
  function funnelArchiveCard(o) {
    var meta = [o.offer_type || '', o.venue || '', regionLabel(o.region || ''), frDate(o.event_date)].filter(Boolean).join(' · ');
    var video = o.video_url && String(o.video_url).trim();
    var media = '';
    if (video) {
      var emb = videoEmbed(video);
      if (emb) media = '<iframe src="' + esc(emb) + '" allow="autoplay;encrypted-media" tabindex="-1"></iframe>';
      else if (isVideoFile(video)) media = '<video src="' + esc(offerMediaUrl(video)) + '" autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture' + posterAttr(o) + '></video>';
    }
    if (!media) {
      media = o.image_url
        ? '<img class="funnel-archive-photo" src="' + esc(offerMediaUrl(o.image_url)) + '" alt="">'
        : '<img src="' + esc(funnelOfferIcon(o)) + '" alt="">';
    }
    return '<article class="funnel-archive-card" data-funnel-archive-card data-offer-id="' + esc(o.id || '') + '">'
      + '<div class="funnel-archive-media">' + media + '</div>'
      + '<div class="funnel-archive-body">'
      + '<div class="funnel-archive-card-title">' + esc(o.title || 'Offre passée') + '</div>'
      + '<div class="funnel-archive-meta">' + esc(meta || 'Offre passée') + '</div>'
      + '<span class="funnel-archive-badge">Offre passée</span>'
      + '</div></article>';
  }
  function wireFunnelArchivedOffers() {
    var track = document.querySelector('[data-svp="funnel-archived-offers"]');
    if (!track) return;
    var shell = track.closest('.funnel-archive') || document;
    var empty = shell.querySelector('[data-funnel-archive-empty]');
    var progress = shell.querySelector('[data-funnel-archive-progress]');
    var prev = shell.querySelector('[data-funnel-archive-prev]');
    var next = shell.querySelector('[data-funnel-archive-next]');

    track.innerHTML = rep(skeletonFunnelArchiveCard(), 3);
    function update() {
      if (!progress) return;
      var max = track.scrollWidth - track.clientWidth;
      if (prev) prev.disabled = max <= 4 || track.scrollLeft <= 2;
      if (next) next.disabled = max <= 4 || track.scrollLeft >= max - 2;
      if (max <= 4) {
        progress.style.width = '100%';
        progress.style.marginLeft = '0%';
        return;
      }
      var thumb = Math.max(22, Math.min(100, (track.clientWidth / track.scrollWidth) * 100));
      var pct = track.scrollLeft / max;
      progress.style.width = thumb + '%';
      progress.style.marginLeft = (pct * (100 - thumb)) + '%';
    }
    function step(dir) {
      var card = track.querySelector('[data-funnel-archive-card], .funnel-archive-card');
      var dx = card ? card.getBoundingClientRect().width + 10 : track.clientWidth * 0.8;
      track.scrollBy({ left: dir * dx, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.__svpFunnelArchiveUpdate = update;

    fetch(FN + 'list-archived-offers').then(function (r) {
      return r.json();
    }).then(function (d) {
      var offers = ((d && d.offers) || []).filter(function (offer) { return offer && offer.title && showOnFormCarousel(offer); }).slice(0, 12);
      if (!offers.length) {
        track.innerHTML = '';
        if (empty) {
          empty.textContent = 'Les offres passées apparaîtront ici dès que l’archive sera disponible.';
          empty.style.display = 'block';
        }
        update();
        return;
      }
      if (empty) empty.style.display = 'none';
      track.innerHTML = offers.map(funnelArchiveCard).join('');
      startAutoplayVideos(track);
      applyRevealTargets(track);
      update();
      setTimeout(update, 250);
    }).catch(function () {
      track.innerHTML = '';
      if (empty) {
        empty.textContent = "Impossible de charger les offres passées pour le moment.";
        empty.style.display = 'block';
      }
      update();
    });
    update();
    setTimeout(update, 400);
  }

  function wireLiveOffers() {
    var carousel = document.querySelector('[data-scroller="offres"]');
    var grid = document.querySelector('[data-svp="compte"]') ? null : document.querySelector('[data-svp="offers-grid"]');
    if (!carousel && !grid) return;
    // Replace the design's sample cards with skeletons immediately so users never
    // see fake placeholder offers while the real ones load.
    if (carousel) carousel.innerHTML = rep(skeletonCarouselCard(), 4);
    if (grid) grid.innerHTML = rep(skeletonGridCard(), 6);
    var liveRequest = fetch(FN + 'list-public-premium-offers').then(function (r) { return r.json(); }).catch(function () { return { offers: [] }; });
    var archivedRequest = fetch(FN + 'list-archived-offers').then(function (r) { return r.json(); }).catch(function () { return { offers: [] }; });
    Promise.all([liveRequest, archivedRequest]).then(function (results) {
      var offers = (results[0] && results[0].offers) || [];
      var archivedOffers = ((results[1] && results[1].offers) || []).filter(showOnPremiumCarousel);
      offerDetailById = {};
      offers.forEach(function (offer) { rememberOffer(offer, false); });
      archivedOffers.forEach(function (offer) { rememberOffer(offer, true); });
      var carouselHtml = offers.map(function (offer) { return premiumCard(offer, false); })
        .concat(archivedOffers.map(function (offer) { return premiumCard(offer, true); })).join('');
      var gridHtml = offers.map(function (offer) { return compteCard(offer, false); }).join('');
      if (carousel) carousel.innerHTML = carouselHtml;
      if (grid) grid.innerHTML = gridHtml || '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Aucune offre pour le moment — reviens lundi pour la nouvelle sélection.</p>';
      if (carousel) startAutoplayVideos(carousel);
      if (grid) startAutoplayVideos(grid);
      document.querySelectorAll('[data-svp="offer"]').forEach(observeOffer);
      wirePremiumCtas();
      wireOfferDetailButtons();
      if (carousel) applyRevealTargets(carousel);
      if (grid) applyRevealTargets(grid);
      if (typeof window.__svpApplyFilters === 'function') window.__svpApplyFilters();
    }).catch(function () {
      if (carousel) carousel.innerHTML = '';
      if (grid) grid.innerHTML = '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Impossible de charger les offres pour le moment.</p>';
    });
  }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- scroll-reveal for headings, cards, forms, and loaded content ----
  var revealObserver = null;
  var revealSelector = [
    'h1',
    'h2',
    'h3',
    '#inscription',
    '#premium-offer',
    '[data-svp="offer"]',
    '[data-card]',
    '[data-svp="step"]',
    '[data-partner-card]',
    '[data-partner-sent]',
    '[data-svp="funnel-card"]',
    '.partner-hero',
    '.partner-option',
    '.partner-note',
    '.funnel-archive',
    '.funnel-archive-card',
    '[data-svp="archive-grid"] > *',
    '[data-svp="offers-grid"] > *',
    '[data-scroller="temoignages"] > *',
    '[style*="border: 1.5px solid rgb(236, 234, 224)"][style*="border-radius"]',
    '[style*="border: 1.5px solid rgb(22, 24, 43)"][style*="border-radius"]',
    '[style*="box-shadow: rgb(51, 71, 202)"]',
    '[style*="box-shadow: rgba(142, 160, 245"]'
  ].join(',');
  function shouldReveal(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.classList.contains('svp-reveal') || el.classList.contains('svp-in')) return false;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    if (!el.getClientRects().length) return false;
    if (el.matches && el.matches('input, textarea, select, button, a, nav, header, footer')) return false;
    if (el.closest('[style*="position: sticky"], [style*="position: fixed"], .svp-mobile-header, .svp-mobile-premium-footer, .page-intro, .svp-offer-modal, .funnel-modal, [data-funnel-exit]')) return false;
    var funnelCard = el.closest('[data-svp="funnel-card"]');
    if (funnelCard && funnelCard !== el && !el.matches('.funnel-archive, .funnel-archive-card')) return false;
    return true;
  }
  function isStaggeredReveal(el) {
    return !!(el && el.matches && el.matches('[data-svp="offer"], [data-card], [data-svp="step"], .partner-option, .funnel-archive-card, [data-svp="archive-grid"] > *, [data-svp="offers-grid"] > *, [data-scroller="temoignages"] > *'));
  }
  function revealNow(el) {
    if (!el || el.classList.contains('svp-in')) return;
    el.classList.add('svp-in');
    if (revealObserver) revealObserver.unobserve(el);
    var delay = parseFloat(el.style.transitionDelay || '0') || 0;
    setTimeout(function () {
      var previous = el.getAttribute('data-svp-reveal-transition');
      if (previous !== null) {
        el.style.transition = previous;
        el.removeAttribute('data-svp-reveal-transition');
      } else {
        el.style.transition = '';
      }
      el.style.transitionDelay = '';
    }, 760 + (delay * 1000));
  }
  function applyRevealTargets(root) {
    if (reducedMotion || !('IntersectionObserver' in window) || !revealObserver) return;
    var scope = root && root.querySelectorAll ? root : document;
    var targets = [];
    if (scope.matches && scope.matches(revealSelector)) targets.push(scope);
    targets = targets.concat([].slice.call(scope.querySelectorAll(revealSelector)));
    var staggerIndex = 0;
    targets = targets.filter(shouldReveal);
    targets.forEach(function (el) {
      var currentTransition = el.style.transition || '';
      if (currentTransition) el.setAttribute('data-svp-reveal-transition', currentTransition);
      el.style.transition = 'opacity .6s cubic-bezier(.2,.7,.2,1), transform .6s cubic-bezier(.2,.7,.2,1)';
      if (isStaggeredReveal(el)) {
        el.style.transitionDelay = (Math.min(staggerIndex, 6) * 0.06) + 's';
        staggerIndex++;
      }
      el.classList.add('svp-reveal');
      revealObserver.observe(el);
    });
    // safety: only force-reveal elements already at/above the fold (in case the
    // observer missed them). Below-the-fold elements stay hidden so they still
    // animate when you scroll to them.
    setTimeout(function () {
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || document.documentElement.clientHeight)) revealNow(el);
      });
    }, 1200);
  }
  function wireReveal() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) revealNow(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    applyRevealTargets(document);
  }

  // ---- Count-up animation for stat numbers (data-svp="countup") ----
  function wireCountUp() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('[data-svp="countup"]');
    if (!els.length) return;
    function animate(el) {
      var full = (el.textContent || '').trim();
      var m = full.match(/^(\D*)(\d+(?:[.,]\d+)?)(.*)$/);
      if (!m) return;
      var prefix = m[1], numStr = m[2], suffix = m[3];
      var decimals = /[.,]/.test(numStr) ? numStr.split(/[.,]/)[1].length : 0;
      var target = parseFloat(numStr.replace(',', '.'));
      var dur = 1200, start = null;
      function fmt(v) { var s = v.toFixed(decimals); if (decimals) s = s.replace('.', ','); return prefix + s + suffix; }
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * eased);
        if (p < 1) requestAnimationFrame(frame); else el.textContent = full;
      }
      el.textContent = fmt(0);
      requestAnimationFrame(frame);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); animate(en.target); } });
    }, { threshold: 0.5 });
    [].forEach.call(els, function (el) { io.observe(el); });
  }

  // ---- smooth page-to-page transitions for internal links ----
  // One consistent crossfade for EVERY browser: intercept same-origin link
  // clicks, fade the current page out to the cream background, then navigate.
  // The next page fades itself back in via the svp-page-in entrance animation
  // (animations.css). We intentionally do NOT rely on native cross-document
  // View Transitions — they get "skipped" unpredictably and leave a hard cut.
  function wirePageTransitions() {
    if (reducedMotion) return;
    var leaving = false, overlay = null, spinTimer = null, navTimer = null;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (!href || href.charAt(0) === '#' || /^(mailto:|tel:)/i.test(href)) return;
      var url;
      try { url = new URL(href, window.location.href); } catch (e2) { return; }
      if (url.origin !== window.location.origin) return;          // external link
      if (url.pathname === window.location.pathname && (url.hash || url.href === window.location.href)) return; // same page
      e.preventDefault();
      if (leaving) return;                                        // ignore double-clicks
      leaving = true;
      // Flag this as a click navigation so the NEXT page fades itself in (the
      // nav-gate script reads this before first paint). Fresh loads never set
      // it, so the entrance fade is strictly a click-to-switch-page effect.
      try { sessionStorage.setItem('svp-nav', '1'); } catch (e3) {}

      // Fade a cream cover IN over the current page — this is the fade-out half
      // of the crossfade, and the surface that carries a loading spinner if the
      // next page is slow to arrive. Cream (never white) = no flash. It sits on
      // the outgoing page, which the browser keeps painted (paint holding) while
      // the next page loads, so the cover + spinner stay visible during the wait.
      overlay = document.createElement('div');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#FFFEF5;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .14s ease;pointer-events:none;will-change:opacity;transform:translateZ(0);-webkit-tap-highlight-color:transparent';
      var spin = document.createElement('div');
      spin.style.cssText = 'width:40px;height:40px;border-radius:50%;border:3px solid rgba(51,71,202,.2);border-top-color:#3347CA;opacity:0;transition:opacity .3s ease';
      overlay.appendChild(spin);
      document.body.appendChild(overlay);
      void overlay.offsetWidth;                                   // commit opacity:0 as the start
      overlay.style.opacity = '1';                                // fade the page out to cream
      try { spin.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 750, iterations: Infinity }); } catch (e4) {}
      // Reveal the spinner ONLY if the next page is still loading after ~0.5s,
      // so it never flashes on a fast navigation but reassures on slow ones
      // (equally on mobile). The outgoing document's timers keep running until
      // the new page commits, so this fires precisely when the load is slow.
      spinTimer = setTimeout(function () { spin.style.opacity = '1'; }, 500);
      // Start the navigation as soon as the cream cover is in place — kept short
      // so the blank/cream gap between pages is minimal (snappy on desktop too).
      navTimer = setTimeout(function () { window.location.href = url.href; }, 150);
    }, false);
    // If the page is restored from the bfcache (Safari/Firefox back-forward), it
    // may still carry the cream cover from when we navigated away — tear it down
    // so the restored page isn't stuck under the loading screen.
    window.addEventListener('pageshow', function (ev) {
      if (!ev.persisted) return;
      leaving = false;
      if (spinTimer) { clearTimeout(spinTimer); spinTimer = null; }
      if (navTimer) { clearTimeout(navTimer); navTimer = null; }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    });
  }

  // ---- smooth in-page scrolling for hash links (#offres, #faq-premium…) ----
  // Desktop got its smooth scroll for free from `html{scroll-behavior:smooth}`;
  // mobile jumped instantly because <body> was the scroll container there (see
  // the overflow note in responsive.css, now fixed). We animate in JS anyway so
  // the motion is identical on every viewport and browser, works whichever
  // element scrolls, and lands the section BELOW the sticky bar instead of
  // hidden underneath it.

  // Whatever element actually scrolls the page. Normally the document element,
  // but a page whose <body> carries a scrollable overflow scrolls on BODY
  // instead (and then window.pageYOffset stays 0) — so read and write through
  // the same element rather than assuming the viewport.
  function scrollBox() {
    var de = document.documentElement, b = document.body;
    if (de && de.scrollHeight > de.clientHeight + 1) return de;
    if (b && b.scrollHeight > b.clientHeight + 1) return b;
    return de;
  }
  function scrollTop() {
    var el = scrollBox();
    if (el !== document.documentElement) return el.scrollTop || 0;
    return window.pageYOffset != null ? window.pageYOffset : (el.scrollTop || 0);
  }
  function setScrollTop(v) {
    var el = scrollBox();
    // `html { scroll-behavior: smooth }` (animations.css) applies to PROGRAMMATIC
    // scrolls too, so each write below would start its own smooth scroll and the
    // queued animations would fight our easing (landing short / overshooting).
    // Force instant for our own writes, then restore the CSS behaviour.
    var prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    if (el === document.documentElement) window.scrollTo(0, v);
    else el.scrollTop = v;
    try { document.documentElement.scrollTop = v; } catch (e) {}
    try { if (document.body) document.body.scrollTop = v; } catch (e2) {}
    el.style.scrollBehavior = prev || '';
  }
  function isMobileViewport() {
    return !window.matchMedia || window.matchMedia('(max-width: 760px)').matches;
  }
  function isReloadNavigation() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav && nav.type) return nav.type === 'reload';
    } catch (e) {}
    try { return performance.navigation && performance.navigation.type === 1; } catch (e2) {}
    return false;
  }
  function wireMobileReloadTop() {
    if (!isMobileViewport()) return;
    var isReload = isReloadNavigation();
    if (!isReload) return;
    if (isReload && location.hash) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
    if (hashTargetEl()) return;
    var stopped = false;
    function stop() { stopped = true; }
    ['touchstart', 'wheel', 'keydown', 'mousedown'].forEach(function (name) {
      window.addEventListener(name, stop, { passive: true, once: true });
    });
    function put() {
      if (stopped || hashTargetEl()) return;
      setScrollTop(0);
    }
    put();
    requestAnimationFrame(put);
    [40, 120, 260, 520, 900].forEach(function (ms) { setTimeout(put, ms); });
    window.addEventListener('load', function () {
      put();
      setTimeout(put, 80);
      setTimeout(put, 260);
    });
    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) return;
      put();
      setTimeout(put, 80);
    });
  }
  function stickyTopOffset() {
    var off = 0;
    [].slice.call(document.querySelectorAll('.svp-mobile-header, [style*="position: sticky"], [style*="position:sticky"]'))
      .forEach(function (el) {
        var cs = getComputedStyle(el);
        if ((cs.position !== 'sticky' && cs.position !== 'fixed') || parseFloat(cs.top) !== 0) return;   // skip bottom-stuck bars
        off = Math.max(off, el.getBoundingClientRect().height);
      });
    return off + 12;
  }
  function targetForEl(el) {
    return Math.max(0, el.getBoundingClientRect().top + scrollTop() - stickyTopOffset());
  }
  var scrollAnim = 0;
  function animateScrollToEl(el) {
    var mine = ++scrollAnim;                           // a new click cancels the previous run
    var start = scrollTop(), goal = targetForEl(el);
    if (reducedMotion || Math.abs(goal - start) < 2) { setScrollTop(goal); return; }
    var dur = Math.min(900, Math.max(340, Math.abs(goal - start) * 0.45)), t0 = null;
    function frame(ts) {
      if (mine !== scrollAnim) return;
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;  // easeInOutCubic
      // Re-measure the destination every frame instead of committing to the
      // position it had at click time: long pages reflow while we travel (images
      // settling, sticky bar changing height) and a stale target lands short.
      goal = targetForEl(el);
      setScrollTop(start + (goal - start) * eased);
      if (p < 1) { requestAnimationFrame(frame); return; }
      var fix = targetForEl(el);                       // final correction
      if (Math.abs(fix - scrollTop()) > 2) setScrollTop(fix);
    }
    requestAnimationFrame(frame);
  }
  function hashTargetEl() {
    var h = (location.hash || '').slice(1);
    if (!h) return null;
    try { return document.getElementById(h) || document.querySelector('[name="' + h + '"]'); } catch (e) { return null; }
  }
  // Arriving WITH a hash (e.g. archive → premium.html#offres): land on that
  // section, offset below the sticky bar, instead of the forced top-of-page.
  function landOnHash() {
    if (!hashTargetEl()) return;
    var y = null;
    function put() {
      var el = hashTargetEl();
      if (!el) return;
      y = targetForEl(el);
      setScrollTop(y);
    }
    put();
    // Late-loading images/fonts shift the layout — re-land once, but only if the
    // visitor hasn't already scrolled away.
    window.addEventListener('load', function () {
      if (y != null && Math.abs(scrollTop() - y) < 4) put();
    });
  }
  function wireAnchorScroll() {
    function pagePath(path) {
      var p = String(path || '/').replace(/\/+$/, '');
      if (!p || p === '' || p === '/index.html' || p === '/index') return '/accueil.html';
      if (/\/index(\.html)?$/i.test(p)) return p.replace(/\/index(\.html)?$/i, '/accueil.html');
      return p;
    }
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank') return;
      var href = a.getAttribute('href') || '';
      var link;
      try { link = new URL(href, location.href); } catch (err) { return; }
      if (!link.hash || link.hash.length < 2) return;
      if (link.origin !== location.origin || pagePath(link.pathname) !== pagePath(location.pathname)) return;
      var id = decodeURIComponent(link.hash.slice(1));
      var target = document.getElementById(id) || document.querySelector('[name="' + id.replace(/"/g, '\\"') + '"]');
      if (!target) return;
      e.preventDefault();
      animateScrollToEl(target);
      try { history.replaceState(null, '', link.hash); } catch (err2) {}   // keep the hash, no jump
    }, false);
  }

  // ---- S'inscrire: always send people to the 5$/mois Premium offer ----
  var PREMIUM_SCROLL_KEY = 'svp_scroll_to_premium_offer';
  function currentPageName() {
    var file = String(location.pathname || '').split('/').pop() || 'accueil.html';
    if (!file || /^index(\.html)?$/i.test(file)) return 'accueil.html';
    if (file.indexOf('.') < 0) file += '.html';
    return file;
  }
  function premiumOfferTarget() {
    return document.getElementById('premium-offer') ||
      (currentPageName() === 'premium.html' ? document.getElementById('pricing') : document.getElementById('premium'));
  }
  function storePremiumScrollIntent() {
    try { sessionStorage.setItem(PREMIUM_SCROLL_KEY, '1'); } catch (e) {}
  }
  function consumePremiumScrollIntent() {
    try {
      if (sessionStorage.getItem(PREMIUM_SCROLL_KEY) !== '1') return false;
      sessionStorage.removeItem(PREMIUM_SCROLL_KEY);
      return true;
    } catch (e) { return false; }
  }
  function waitThenScrollToPremiumOffer() {
    var tries = 0;
    setScrollTop(0);
    function go() {
      var intro = document.getElementById('page-intro');
      if (intro && !document.body.classList.contains('intro-complete') && tries++ < 70) {
        setScrollTop(0);
        setTimeout(go, 100);
        return;
      }
      var target = premiumOfferTarget();
      if (!target && tries++ < 70) { setTimeout(go, 100); return; }
      if (!target) return;
      requestAnimationFrame(function () { animateScrollToEl(target); });
    }
    if (document.readyState === 'complete') setTimeout(go, 80);
    else window.addEventListener('load', function () { setTimeout(go, 120); }, { once: true });
    setTimeout(go, 4600);
  }
  function runPendingPremiumScroll() {
    if (!consumePremiumScrollIntent()) return;
    if (!/^(accueil|premium)\.html$/i.test(currentPageName())) return;
    waitThenScrollToPremiumOffer();
  }
  function wirePremiumSignupIntent() {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var label = String(a.textContent || '').replace(/\s+/g, ' ').trim();
      if (a.matches('[data-svp="checkout"]')) return;
      if (a.matches('[data-svp="hero-submit"]') && !/^S['’]inscrire$/i.test(label)) return;
      var isSignup = a.getAttribute('data-svp-nav-signup') === 'true' || /^S['’]inscrire$/i.test(label);
      if (!isSignup) return;

      var page = currentPageName();
      if (page === 'premium.html' || page === 'accueil.html') {
        e.preventDefault();
        e.stopPropagation();
        var header = a.closest && a.closest('.svp-mobile-header');
        if (header) {
          header.setAttribute('data-open', 'false');
          var toggle = header.querySelector('[data-svp-mobile-menu-toggle]');
          var menu = header.querySelector('[data-svp-mobile-menu]');
          if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Ouvrir le menu'); }
          if (menu) menu.setAttribute('data-open', 'false');
        }
        var target = premiumOfferTarget();
        if (!target) return;
        animateScrollToEl(target);
        try { history.replaceState(null, '', page === 'premium.html' ? '#premium-offer' : '#premium-offer'); } catch (err) {}
        return;
      }

      storePremiumScrollIntent();
      a.setAttribute('href', 'accueil.html');
    }, true);
  }

  function wirePremiumStepCtas() {
    if (currentPageName() !== 'premium.html') return;
    function go() {
      var target = premiumOfferTarget();
      if (!target) return false;
      tagPremiumClick();
      animateScrollToEl(target);
      try { history.replaceState(null, '', '#premium-offer'); } catch (err) {}
      return true;
    }
    [].slice.call(document.querySelectorAll('[data-svp="step"]')).forEach(function (el) {
      if (el.getAttribute('data-svp-step-cta') === 'true') return;
      el.setAttribute('data-svp-step-cta', 'true');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', "Voir l'abonnement Premium à 5$ par mois");
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('a,button,input,select,textarea')) return;
        e.preventDefault();
        go();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        go();
      });
    });
  }

  // ---- universal public mobile header ----
  function wireUniversalMobileHeader() {
    if (document.querySelector('.svp-mobile-header')) return;

    function pageNameFromPath(pathname) {
      var file = String(pathname || '').split('/').pop() || 'accueil';
      if (!file || file === '/') file = 'accueil';
      if (/^index(\.html)?$/i.test(file)) file = 'accueil';
      if (file.indexOf('.') < 0) file += '.html';
      return file;
    }
    var currentPage = pageNameFromPath(location.pathname);
    if (/^(admin|premium-offers-admin)\.html$/i.test(currentPage)) return;

    function isBrandLogo(img) {
      if (!img || !img.getAttribute) return false;
      var src = img.getAttribute('src') || '';
      var alt = String(img.getAttribute('alt') || '').trim();
      return src.indexOf('logo-mot') >= 0 || /^Silvousplait$/i.test(alt);
    }
    function containsBrandLogo(el) {
      return !!(el && el.querySelector && [].some.call(el.querySelectorAll('img'), isBrandLogo));
    }
    function closestForbiddenLogoContext(img) {
      return img.closest && img.closest('.svp-mobile-header, .page-intro, [data-svp="funnel-card"], .funnel-card');
    }
    function headerCandidateForLogo(img) {
      if (closestForbiddenLogoContext(img)) return null;
      var best = null;
      var bestScore = -1;
      var n = img.parentElement;
      while (n && n !== document.body && n.nodeType === 1) {
        if (n.matches && n.matches('main, section, form, .page-intro')) break;
        var rect = n.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.height <= 360 && rect.top < 300 && containsBrandLogo(n)) {
          var css = window.getComputedStyle ? getComputedStyle(n) : null;
          var style = String(n.getAttribute('style') || '').toLowerCase();
          var className = String(n.className || '').toLowerCase();
          var tag = String(n.tagName || '').toLowerCase();
          var linkCount = n.querySelectorAll ? n.querySelectorAll('a[href]').length : 0;
          var score = 0;
          if (tag === 'header') score += 20;
          if (className.indexOf('header') >= 0) score += 12;
          if ((css && css.position === 'sticky') || style.indexOf('sticky') >= 0) score += 9;
          if ((css && parseFloat(css.borderBottomWidth || '0') > 0) || style.indexOf('border-bottom') >= 0) score += 7;
          if (linkCount > 1) score += 6;
          else if (linkCount === 1) score += 2;
          if (css && css.display.indexOf('flex') >= 0) score += 2;
          if (!best || score > bestScore || (score === bestScore && rect.height > best.getBoundingClientRect().height)) {
            best = n;
            bestScore = score;
          }
        }
        n = n.parentElement;
      }
      return best;
    }
    function uniquePush(list, el) {
      if (el && list.indexOf(el) < 0) list.push(el);
    }

    var candidates = [];
    [].slice.call(document.querySelectorAll('header')).forEach(function (header) {
      if (!header.classList.contains('svp-mobile-header')) uniquePush(candidates, header);
    });
    [].slice.call(document.querySelectorAll('img')).forEach(function (img) {
      if (isBrandLogo(img)) uniquePush(candidates, headerCandidateForLogo(img));
    });
    candidates.sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });

    function normalizedHref(href) {
      if (!href) return '';
      var a = document.createElement('a');
      a.href = href;
      if (a.origin !== location.origin) return href;
      return pageNameFromPath(a.pathname) + (a.hash || '');
    }
    function labelForLink(a) {
      return String((a && a.textContent) || '').replace(/\s+/g, ' ').trim();
    }
    function isCurrent(href) {
      var a = document.createElement('a');
      a.href = href;
      return a.origin === location.origin && pageNameFromPath(a.pathname) === currentPage && !a.hash;
    }

    var items = [];
    var seen = {};
    var suppressPremiumCallback = /^(connexion|compte|tunnel)\.html$/i.test(currentPage);
    var suppressSignupCallback = /^(connexion|compte|tunnel)\.html$/i.test(currentPage);
    function addItem(label, href, primary, kind) {
      label = String(label || '').replace(/\s+/g, ' ').trim();
      if (!label || !href) return;
      if (suppressPremiumCallback && /^premium$/i.test(label)) return;
      if (suppressSignupCallback && /s'?inscrire|inscription/i.test(label)) return;
      var key = normalizedHref(href);
      if (/s'?inscrire|inscription/i.test(label)) { key = 'signup'; kind = 'signup'; }
      if (/^connexion$/i.test(label)) key = 'connexion';
      if (key === 'accueil.html' && /retour|accueil/i.test(label)) key = 'home';
      if (seen[key]) return;
      seen[key] = true;
      items.push({ label: label, href: href, primary: !!primary, kind: kind || '' });
    }

    addItem('Accueil', 'accueil.html', false);
    candidates.forEach(function (header) {
      [].slice.call(header.querySelectorAll('a[href]')).forEach(function (a) {
        if (a.closest && a.closest('.svp-mobile-header')) return;
        if (a.querySelector('img') && !labelForLink(a)) return;
        var label = labelForLink(a);
        if (!label) return;
        addItem(label, a.getAttribute('href'), /s'?inscrire|inscription|commencer|choisir|je veux/i.test(label));
      });
    });
    if (!suppressPremiumCallback) addItem('Premium', 'premium.html', false);
    addItem('Contact', 'contact.html', false);
    addItem('Partenariat', 'partenariat.html', false);
    addItem('Connexion', 'connexion.html', false);
    if (!suppressSignupCallback) addItem("S'inscrire", currentPage === 'premium.html' ? '#premium-offer' : (currentPage === 'accueil.html' ? '#premium-offer' : 'accueil.html'), true, 'signup');

    var headerEl = document.createElement('header');
    headerEl.className = 'svp-mobile-header';
    headerEl.setAttribute('data-open', 'false');
    if (document.getElementById('page-intro')) {
      headerEl.setAttribute('data-wait-for-intro', 'true');
    }
    var menuId = 'svp-mobile-menu';
    var bar = document.createElement('div');
    bar.className = 'svp-mobile-header__bar';
    var logo = document.createElement('a');
    logo.className = 'svp-mobile-header__logo';
    logo.href = 'accueil.html';
    logo.setAttribute('aria-label', "Retour à l'accueil");
    logo.innerHTML = '<img src="assets/logo-mot.png" alt="Silvousplait">';
    var toggle = document.createElement('button');
    toggle.className = 'svp-mobile-header__toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', menuId);
    toggle.setAttribute('data-svp-mobile-menu-toggle', '');
    toggle.innerHTML = '<span class="svp-mobile-header__icon" aria-hidden="true"><span></span><span></span><span></span></span>';
    bar.appendChild(logo);
    bar.appendChild(toggle);

    var nav = document.createElement('nav');
    nav.className = 'svp-mobile-header__panel';
    nav.id = menuId;
    nav.setAttribute('aria-label', 'Navigation principale');
    nav.setAttribute('data-svp-mobile-menu', '');
    nav.setAttribute('data-open', 'false');
    items.forEach(function (item, i) {
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      a.style.setProperty('--svp-i', i);
      if (item.primary) a.setAttribute('data-primary', 'true');
      if (item.kind === 'signup') a.setAttribute('data-svp-nav-signup', 'true');
      if (isCurrent(item.href)) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    headerEl.appendChild(bar);
    headerEl.appendChild(nav);

    candidates.forEach(function (el) { el.setAttribute('data-svp-mobile-hide', 'header'); });
    var anchor = candidates[0] || [].slice.call(document.body.children).filter(function (el) {
      return !/^(script|noscript)$/i.test(el.tagName || '');
    })[0] || null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(headerEl, anchor);
    else document.body.insertBefore(headerEl, document.body.firstChild);

    var spacer = document.createElement('div');
    spacer.className = 'svp-mobile-header-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    if (headerEl.parentNode) headerEl.parentNode.insertBefore(spacer, headerEl.nextSibling);
    document.body.classList.add('svp-mobile-header-ready');

    function updateHeaderState() {
      headerEl.setAttribute('data-scrolled', scrollTop() > 8 ? 'true' : 'false');
    }
    updateHeaderState();
    window.addEventListener('scroll', updateHeaderState, { passive: true });
  }

  function wirePremiumMobileFooter() {
    if (currentPageName() !== 'premium.html') return;
    if (document.querySelector('.svp-mobile-premium-footer')) return;
    var target = premiumOfferTarget();
    if (!target) return;

    var legacy = document.querySelector('.svp-premium-footer-legacy') ||
      document.querySelector('[style*="position: sticky"][style*="bottom: 0px"]');
    if (legacy) legacy.setAttribute('data-svp-mobile-hide', 'premium-footer');

    var footer = document.createElement('div');
    footer.className = 'svp-mobile-premium-footer';
    footer.setAttribute('data-scrolled', 'false');
    footer.innerHTML = ''
      + '<div class="svp-mobile-premium-footer__inner">'
      + '<div class="svp-mobile-premium-footer__copy" aria-hidden="true">'
      + '<div class="svp-mobile-premium-footer__price">Premium 5$/mois</div>'
      + '<div class="svp-mobile-premium-footer__note">Annule en tout temps</div>'
      + '</div>'
      + '<a class="svp-mobile-premium-footer__cta" href="#premium-offer" data-svp="premium-cta">Je veux économiser</a>'
      + '</div>';

    var spacer = document.createElement('div');
    spacer.className = 'svp-mobile-premium-footer-spacer';
    spacer.setAttribute('aria-hidden', 'true');

    if (legacy && legacy.parentNode) {
      legacy.parentNode.insertBefore(footer, legacy.nextSibling);
      legacy.parentNode.insertBefore(spacer, footer.nextSibling);
    } else {
      document.body.appendChild(footer);
      document.body.appendChild(spacer);
    }
    document.body.classList.add('svp-mobile-premium-footer-ready');

    var cta = footer.querySelector('a[href]');
    if (cta) {
      cta.addEventListener('click', function (e) {
        var freshTarget = premiumOfferTarget();
        if (!freshTarget) return;
        e.preventDefault();
        tagPremiumClick();
        animateScrollToEl(freshTarget);
        try { history.replaceState(null, '', '#premium-offer'); } catch (err) {}
      });
    }

    function updateFooterState() {
      footer.setAttribute('data-scrolled', scrollTop() > 8 ? 'true' : 'false');
    }
    updateFooterState();
    window.addEventListener('scroll', updateFooterState, { passive: true });
  }

  // ---- uniform "back to main page" affordance: the header logo ----
  // On the flattened pages some logos aren't links (premium/tunnel/archive), so
  // there was no way home — especially on mobile where the text nav is hidden.
  // Make the header logo a link to the home page everywhere except home itself.
  // The logo stays visible on mobile (responsive.css), giving every page a
  // consistent top-left home button.
  function wireHomeLink() {
    var path = location.pathname;
    if (/(^|\/)(accueil|index)(\.html)?$/i.test(path) || path === '/') return; // already home

    // 1) Make the header logo a home link (if it isn't already).
    var logo = document.querySelector('img[src*="logo-mot"], img[alt="Silvousplait"]');
    var logoLink = logo && logo.closest('a');
    if (logo && !logoLink) {
      logoLink = document.createElement('a');
      logoLink.href = 'accueil.html';
      logoLink.setAttribute('aria-label', "Retour à l'accueil");
      logoLink.style.cssText = 'display:inline-flex;align-items:center;text-decoration:none;cursor:pointer';
      logo.parentNode.insertBefore(logoLink, logo);
      logoLink.appendChild(logo);
    }

    // 2) Guarantee a visible home button IN THE HEADER. Skipped when the header
    //    already carries a back affordance (the sub-pages' "← Retour" pill) —
    //    but NOT for a footer "Accueil" link (premium has one in the footer,
    //    which isn't reachable without scrolling: exactly the complaint).
    if (document.querySelector('[data-svp="home"]')) return;
    // The signup funnel is deliberately a closed funnel — no way back from it.
    if (document.querySelector('[data-svp="funnel"]')) return;
    var hasHeaderBack = [].some.call(document.querySelectorAll('a[href]'), function (x) {
      var t = (x.textContent || '').trim();
      if (!t || !/accueil|retour/i.test(t)) return false;   // visible text, not just the logo image
      var r = x.getBoundingClientRect();
      return r.width > 0 && r.top < 240;                   // sits in the header area
    });
    if (hasHeaderBack) return;

    // 2a) If there's a top nav (detected via an in-page hash link), add "Accueil"
    //     as the first item, styled like its siblings.
    var sample = document.querySelector('a[href="#offres"], a[href="#faq-premium"], a[href="#faq"], a[href="#tarifs"]');
    if (sample && sample.parentNode) {
      var navHome = document.createElement('a');
      navHome.href = 'accueil.html';
      navHome.textContent = 'Accueil';
      navHome.setAttribute('data-svp', 'home');
      navHome.setAttribute('style', sample.getAttribute('style') || 'color:#4A4D66;text-decoration:none');
      sample.parentNode.insertBefore(navHome, sample.parentNode.firstChild);
      return;
    }

    // 2b) Otherwise drop a small "← Accueil" pill next to the logo.
    if (logoLink) {
      var pill = document.createElement('a');
      pill.href = 'accueil.html';
      pill.textContent = '← Accueil';
      pill.setAttribute('data-svp', 'home');
      pill.setAttribute('style', "display:inline-flex;align-items:center;gap:6px;background:#EEF0FD;color:#3347CA;font:700 13px 'Instrument Sans',sans-serif;padding:9px 16px;border-radius:100px;text-decoration:none;white-space:nowrap");
      // Placement matters: dropping the pill in as a bare sibling of the logo
      // left it floating in the MIDDLE of headers that use
      // `justify-content: space-between` (logo | pill | nav) — it read as
      // randomly placed. And logos often sit in a fixed-width `overflow:hidden`
      // clip box, where a sibling pill is simply clipped away (invisible).
      // So: climb out of any clip box, then group the logo + pill in one flex
      // box, which stays pinned as a single unit next to the logo on the left.
      var unit = logoLink;
      while (unit.parentNode && unit.parentNode.nodeType === 1 && unit.parentNode !== document.body) {
        var pcs = getComputedStyle(unit.parentNode);
        if (pcs.overflowX === 'hidden' || pcs.overflowY === 'hidden') unit = unit.parentNode;
        else break;
      }
      var group = document.createElement('div');
      group.setAttribute('data-svp', 'home-group');
      group.setAttribute('style', 'display:flex;align-items:center;gap:14px;flex:0 0 auto;min-width:0');
      unit.parentNode.insertBefore(group, unit);
      group.appendChild(unit);
      group.appendChild(pill);
    }
  }

  // ---- prettify "Retour au site" / "Se déconnecter" links as pill buttons ----
  function wireBackLinks() {
    var pill = "display:inline-flex;align-items:center;gap:6px;background:#EEF0FD;color:#3347CA;font:700 13px 'Instrument Sans',sans-serif;padding:9px 16px;border-radius:100px;text-decoration:none;white-space:nowrap";
    [].slice.call(document.querySelectorAll('a')).forEach(function (a) {
      // Skip the JS-built mobile dropdown, whose items carry their own list
      // styling. This used to skip ANY [data-svp-mobile-menu] — but partenariat
      // is the one page whose DESKTOP nav doubles as its mobile menu (it marks
      // the same <nav> with data-svp-mobile-menu), so its "← Retour au site"
      // was silently left as plain text while every other page rendered it as
      // the blue pill. That single missing pill is what made the partenariat
      // header look off next to the rest.
      if (a.closest('.svp-mobile-header__panel')) return;
      var t = (a.textContent || '').trim();
      if (/Retour au site/i.test(t) || /Se d[ée]connecter/i.test(t)) a.setAttribute('style', pill);
    });
  }

  // ---- mobile-only dropdown menus ----
  function wireMobileMenus() {
    var toggles = [].slice.call(document.querySelectorAll('[data-svp-mobile-menu-toggle]'));
    if (!toggles.length) return;
    var mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
    function isMobile() { return !mq || mq.matches; }
    function setOpen(btn, menu, open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      if (menu) menu.setAttribute('data-open', open ? 'true' : 'false');
      var owner = btn.closest && btn.closest('.svp-mobile-header');
      if (owner) owner.setAttribute('data-open', open ? 'true' : 'false');
    }
    function closeAll(exceptBtn) {
      toggles.forEach(function (btn) {
        if (btn === exceptBtn) return;
        var menu = document.getElementById(btn.getAttribute('aria-controls') || '');
        setOpen(btn, menu, false);
      });
    }
    toggles.forEach(function (btn) {
      var menu = document.getElementById(btn.getAttribute('aria-controls') || '');
      if (!menu) return;
      setOpen(btn, menu, false);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!isMobile()) return;
        var next = btn.getAttribute('aria-expanded') !== 'true';
        closeAll(btn);
        setOpen(btn, menu, next);
      });
      menu.querySelectorAll('a[href]').forEach(function (a) {
        a.addEventListener('click', function () { setOpen(btn, menu, false); });
      });
    });
    document.addEventListener('click', function (e) {
      if (!isMobile()) return;
      toggles.forEach(function (btn) {
        var menu = document.getElementById(btn.getAttribute('aria-controls') || '');
        if (!menu || btn.contains(e.target) || menu.contains(e.target)) return;
        setOpen(btn, menu, false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeAll();
    });
    if (mq) {
      var onChange = function () { if (!mq.matches) closeAll(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // ---- FAQ accordion (design's toggle JS was lost in flattening) ----
  function wireFaq() {
    document.querySelectorAll('.faq-answer').forEach(function (ans) {
      var item = ans.parentElement;
      if (!item) return;
      item.style.cursor = 'pointer';
      // icon is either a "⌄" chevron (faq.html) or a "+/−" toggle (premium.html)
      var icon = [].slice.call(item.querySelectorAll('span')).filter(function (s) {
        var t = (s.textContent || '').trim(); return t === '⌄' || t === '+' || t === '−' || t === '-';
      })[0];
      if (icon) { icon.style.display = 'inline-block'; icon.style.transition = 'transform .18s'; }
      var isChevron = icon && (icon.textContent || '').trim() === '⌄';
      item.addEventListener('click', function (e) {
        if (e.target && e.target.tagName === 'A') return;
        var open = ans.style.display !== 'none';
        ans.style.display = open ? 'none' : 'block';
        if (icon) {
          if (isChevron) icon.style.transform = open ? '' : 'rotate(180deg)';
          else icon.textContent = open ? '+' : '−';
        }
      });
    });
  }

  // ---- scroll-to-top CTAs (step cards, free-plan button) ----
  function wireScrollTop() {
    document.querySelectorAll('[data-svp="scroll-top"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (el.closest && el.closest('#comment')) {
          var premiumTarget = premiumOfferTarget();
          if (premiumTarget) {
            tagPremiumClick();
            animateScrollToEl(premiumTarget);
            try { history.replaceState(null, '', '#premium-offer'); } catch (err) {}
            return;
          }
        }
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
        var em = document.querySelector('[data-svp="hero-email"]');
        if (em) setTimeout(function () { try { em.focus({ preventScroll: true }); } catch (er) {} }, reducedMotion ? 0 : 420);
      });
    });
  }

  // ---- Page intro: exact replica of the deployed home loader ----
  // 3s white screen (title + trompette), then slide-down reveal.
  function wireIntro() {
    var intro = document.getElementById('page-intro');
    if (!intro) return;
    if (reducedMotion) { document.body.classList.add('intro-complete'); return; }
    var root = document.documentElement;
    // Lock scroll + pin to top so the sliding intro can never be scrolled into view.
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    var done = false;
    function complete() { document.body.classList.add('intro-complete'); root.style.overflow = ''; document.body.style.overflow = ''; }
    var t1 = setTimeout(function () { document.body.classList.add('intro-fading'); }, 2550);
    var t2 = setTimeout(function () { if (!done) { done = true; complete(); } }, 3800);
    // Let visitors skip/close the loader — click anywhere or the "Entrer" button.
    function skip() { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); document.body.classList.add('intro-fading'); setTimeout(complete, 600); }
    intro.style.cursor = 'pointer';
    intro.addEventListener('click', skip);
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'Entrer →'; btn.setAttribute('aria-label', 'Entrer sur le site');
    btn.style.cssText = 'position:absolute;bottom:28px;left:50%;transform:translateX(-50%);z-index:2;background:rgba(51,71,202,.12);color:#3347CA;border:none;border-radius:100px;padding:10px 22px;font:700 13px \'Instrument Sans\',sans-serif;cursor:pointer';
    btn.addEventListener('click', function (e) { e.stopPropagation(); skip(); });
    intro.appendChild(btn);
  }

  function init() {
    // Always start at the top on (re)load — don't let the browser restore scroll.
    // Exception: a link that arrives with a hash must keep its target section.
    if ('scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) {} }
    wireMobileReloadTop();
    if (!hashTargetEl()) setScrollTop(0);
    wireTransientButtonReset();
    wireIntro();
    wireUniversalMobileHeader(); wirePremiumMobileFooter(); wireHomeLink(); wireBackLinks(); wireMobileMenus(); wireFaq(); wireScrollTop(); wireAnchorScroll(); wirePremiumSignupIntent(); wirePremiumStepCtas();
    wireHero(); wirePremiumCtas(); wireOfferViews(); wireFunnel(); wireCountdown();
    wireConnexion(); wireAccount(); wireAccountSave(); wireCompteFilters(); wireUnsubscribe(); wireBilling(); wireAdmin(); wirePartenariat();
    wireContact(); wirePremiumCheckout(); wirePremiumTrialOffer(); wireExitIntent(); wireFunnelArchivedOffers(); wireLiveOffers(); wireTestimonialCarousels(); wireOffersCarousel();
    wireArchive();
    runPendingPremiumScroll();
    wireReveal(); wireCountUp(); wirePageTransitions(); landOnHash();
    // Reveal the incoming-page cover (see animations.css html.svp-nav ::after)
    // only now — after all wiring ran and one more frame has painted — so the
    // fade never competes with this heavy init work. No-op unless we arrived via
    // a click navigation (html.svp-nav). Two rAFs = let a clean frame paint.
    if (!reducedMotion && document.documentElement.classList.contains('svp-nav')) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.classList.add('svp-revealed');
          dropNavCover();
        });
      });
    }
    // Failsafe: the per-page gate script also reveals on its own 1.6s timer if
    // init is slow or throws, so schedule the teardown independently too.
    dropNavCover(2200);
  }

  // ---- tear the incoming-page cover back down once it has faded ----
  // `svp-nav` used to stay on <html> for the life of the page, which left
  // `body::after` — a full-viewport position:fixed, will-change:opacity box —
  // permanently in the render tree of every click-navigated page. It was
  // invisible (opacity 0) but still a promoted compositing layer sitting above
  // the whole document, and WebKit resolves position:sticky/fixed bars against
  // the scrolling tree it belongs to: the sticky header and the premium sticky
  // footer came out mis-spaced on Safari, but only when you SWITCHED pages —
  // a reload never created the cover, so it always looked right. Removing the
  // classes after the fade leaves a click-navigated page in exactly the same
  // render state as a reloaded one, with no visual change (it is already
  // transparent by then) and no extra navigation or refresh.
  // init() arms a 2.2s failsafe first and the rAF reveal path asks for 420ms
  // right after, so keep whichever deadline lands EARLIEST rather than letting
  // the first caller win — otherwise the fast path would never apply.
  var navCoverTimer = 0, navCoverDue = Infinity;
  function dropNavCover(delay) {
    var root = document.documentElement;
    if (!root.classList.contains('svp-nav')) return;
    // Wait out the .25s opacity transition in animations.css before removing,
    // otherwise the cover would disappear in a hard cut instead of a fade.
    var ms = delay == null ? 420 : delay;
    var due = nowMs() + ms;
    if (due >= navCoverDue) return;
    navCoverDue = due;
    if (navCoverTimer) clearTimeout(navCoverTimer);
    navCoverTimer = setTimeout(function () {
      navCoverTimer = 0;
      navCoverDue = Infinity;
      root.classList.remove('svp-nav', 'svp-revealed');
    }, ms);
  }
  function nowMs() {
    try { return performance.now(); } catch (e) { return +new Date(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
