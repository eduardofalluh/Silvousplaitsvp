/* Silvousplait — front-end wiring for the flattened static site.
   Connects the new design to the Netlify functions (ActiveCampaign).
   Vanilla JS, no dependencies, CSP-safe (served from 'self'). */
(function () {
  'use strict';
  var FN = '/.netlify/functions/';
  var EMAIL_KEY = 'svp_email';

  function getEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } }
  function setEmail(v) { try { localStorage.setItem(EMAIL_KEY, v); } catch (e) {} }
  function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function pixel(kind, name) { if (typeof window.fbq === 'function') { try { window.fbq(kind, name); } catch (e) {} } }

  var SEL = { borderColor: '#3347CA', background: '#EEF0FD', color: '#3347CA', fontWeight: '700' };
  var UNSEL = { borderColor: '#E1E0D4', background: '#FFFFFF', color: '#16182B', fontWeight: '500' };
  function paint(el, on) {
    var s = on ? SEL : UNSEL;
    el.style.borderColor = s.borderColor;
    el.style.background = s.background;
    el.style.color = s.color;
    el.style.fontWeight = s.fontWeight;
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
    document.querySelectorAll('[data-svp="premium-cta"]').forEach(function (el) {
      el.addEventListener('click', function () {
        var email = getEmail();
        pixel('trackCustom', 'PremiumClick');
        if (!email) return; // anonymous click: nothing to tag
        try {
          fetch(FN + 'tag-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, tag: 'a-cliqué-premium-siteweb' }),
            keepalive: true,
          });
        } catch (e) {}
      });
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

  // ---- Enriched signup funnel (P3): tunnel.html ----
  function wireFunnel() {
    var funnel = document.querySelector('[data-svp="funnel"]');
    if (!funnel) return;
    var state = { ville: '', interests: [], tranche: '' };

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

    var emailInput = funnel.querySelector('[data-svp="funnel-email"]');
    var known = getEmail();
    if (known && emailInput && !emailInput.value) emailInput.value = known;

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
        body: JSON.stringify({ email: email, firstName: prenom.trim(), ville: state.ville, interests: state.interests, tranche: state.tranche, website: honeypot }),
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.subscribed) {
            setEmail(email);
            pixel('track', 'Lead');
            var card = funnel.querySelector('[data-svp="funnel-card"]') || funnel;
            card.innerHTML = '<div style="text-align:center;padding:20px 8px"><div style="font:800 24px \'Bricolage Grotesque\',sans-serif;color:#3347CA;margin-bottom:10px">Merci' + (prenom ? ' ' + prenom.trim() : '') + '&nbsp;! 🎉</div><p style="font:500 15px \'Instrument Sans\',sans-serif;color:#4A4D66;line-height:1.5">Ton inscription est confirmée. Ta première infolettre arrive lundi.</p><a href="premium.html" data-svp="premium-cta" style="display:inline-block;margin-top:18px;background:#3347CA;color:#FFFEF5;text-decoration:none;border-radius:100px;padding:14px 24px;font:700 15px \'Instrument Sans\',sans-serif">Découvre Premium →</a></div>';
            wirePremiumCtas();
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

  // ---- Live countdown to the next Monday 9:00 (newsletter send) ----
  function nextMondayNine() {
    var now = new Date();
    var t = new Date(now);
    t.setHours(9, 0, 0, 0);
    var add = (1 - t.getDay() + 7) % 7; // days until Monday (getDay: 0=Sun..6=Sat)
    if (add === 0 && now.getTime() >= t.getTime()) add = 7; // Monday after 9h -> next week
    t.setDate(t.getDate() + add);
    return t;
  }
  function wireCountdown() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-svp="countdown"]'));
    if (!els.length) return;
    function tick() {
      var target = nextMondayNine().getTime();
      var diff = Math.max(0, target - Date.now());
      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      els.forEach(function (el) {
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
      if (!validEmail(email)) { say('Entre une adresse email valide.', true); return; }
      submit.disabled = true; say('Envoi du code…');
      fetch(FN + 'request-login-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          submit.disabled = false;
          if (d && d.sent) { challenge = d.challenge; setEmail(email); say('Code envoyé ! Vérifie ton courriel.'); showCodeStep(); }
          else { say('Aucun compte Premium trouvé pour ce courriel.', true); }
        }).catch(function () { submit.disabled = false; say('Erreur. Réessaie plus tard.', true); });
    });
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ---- compte: require a session, then populate REAL account data ----
  function wireAccount() {
    if (!document.querySelector('[data-svp="compte"]')) return;
    var session = getSession();
    if (!session) { window.location.href = 'connexion.html'; return; }
    fetch(FN + 'get-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: session }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.ok) { setSession(''); window.location.href = 'connexion.html'; return; }
        var a = res.d; setEmail(a.email);
        var greet = document.querySelector('[data-svp="compte"] h1');
        if (greet) greet.textContent = 'Bonjour, ' + (a.firstName || a.email.split('@')[0]);
        var ln = document.querySelector('input[placeholder="Nom"]'); if (ln) ln.value = a.lastName || '';
        var fn = document.querySelector('input[placeholder="Prénom"]'); if (fn) fn.value = a.firstName || '';
        var ph = document.querySelector('input[type="tel"]'); if (ph) ph.value = a.phone || '';
        // badge: find element whose text is exactly "Membre Premium"
        var badge = [].slice.call(document.querySelectorAll('span')).filter(function (s) { return (s.textContent || '').trim() === 'Membre Premium'; })[0];
        if (badge && !a.isPremium) { badge.textContent = 'Membre gratuit'; badge.style.background = '#EEF0FD'; badge.style.color = '#3347CA'; }
      })
      .catch(function () { /* leave placeholders on network error */ });
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
      if (!validEmail(data.email.trim()) || !data.message.trim()) { say('Courriel valide et message requis.', true); return; }
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
  function wirePremiumCheckout() {
    var btns = document.querySelectorAll('[data-svp="checkout"]');
    if (!btns.length) return;
    btns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var plan = btn.getAttribute('data-plan') || 'yearly';
        var email = getEmail();
        if (email) { try { fetch(FN + 'tag-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, tag: 'a-cliqué-premium-siteweb' }), keepalive: true }); } catch (er) {} }
        pixel('track', 'InitiateCheckout');
        var original = btn.textContent; btn.textContent = 'Redirection…';
        fetch(FN + 'create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planKey: plan, returnPath: '/premium.html' }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.url) { window.location.href = d.url; }
            else { btn.textContent = original; alert("Le paiement n'a pas pu démarrer. Réessaie."); }
          }).catch(function () { btn.textContent = original; alert('Erreur. Réessaie plus tard.'); });
      });
    });
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

  // ---- P5: partenariat form ----
  function wirePartenariat() {
    var form = document.querySelector('[data-svp="partner-form"]');
    if (!form) return;
    var msg = form.querySelector('[data-svp="partner-msg"]');
    var btn = form.querySelector('[data-svp="partner-submit"]');
    function say(t, err) { if (msg) { msg.textContent = t || ''; msg.style.color = err ? '#b00020' : '#3347CA'; } }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        name: (form.querySelector('[name="name"]') || {}).value || '',
        email: (form.querySelector('[name="email"]') || {}).value || '',
        organisation: (form.querySelector('[name="organisation"]') || {}).value || '',
        message: (form.querySelector('[name="message"]') || {}).value || '',
        website: (form.querySelector('[name="website"]') || {}).value || '',
      };
      if (!validEmail(data.email.trim()) || !data.message.trim()) { say('Courriel valide et message requis.', true); return; }
      if (btn) btn.disabled = true; say('Envoi…');
      fetch(FN + 'send-partenariat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (btn) btn.disabled = false;
          if (d && d.sent) { form.reset(); say('Merci ! On te revient rapidement.'); }
          else { say((d && d.error) || "L'envoi a échoué. Réessaie.", true); }
        }).catch(function () { if (btn) btn.disabled = false; say('Erreur. Réessaie plus tard.', true); });
    });
  }

  // ---- exit-intent popup (once per session) ----
  function wireExitIntent() {
    if (document.querySelector('[data-svp="funnel"]') || document.querySelector('[data-svp="compte"]')) return;
    try { if (sessionStorage.getItem('svp_exit')) return; } catch (e) {}
    var shown = false;
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
      if (e.clientY <= 0 && !e.relatedTarget) show();
    });
  }

  // ---- P2b/B: render LIVE premium offers from the backend ----
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
  function premiumCard(o) {
    var img = o.image_url ? 'background:#0b1030 url(' + esc(o.image_url) + ') center/cover no-repeat;' : 'background:repeating-linear-gradient(135deg,#4155DE,#4155DE 14px,#3347CA 14px,#3347CA 28px);';
    return '<div data-svp="offer" data-offer-id="' + esc(o.id) + '" style="position:relative;flex:0 0 auto;width:290px;max-width:86vw;height:400px;scroll-snap-align:start;border-radius:20px;overflow:hidden;box-shadow:rgba(142,160,245,.3) 5px 6px 0;' + img + 'display:flex;flex-direction:column;justify-content:space-between;padding:18px">'
      + '<div style="position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(8,10,26,0) 42%,rgba(8,10,26,.85) 74%)"></div>'
      + '<div style="position:relative;z-index:2;display:flex;justify-content:flex-end"><div style="background:#F5E642;color:#16182B;font:800 12px \'Instrument Sans\',sans-serif;padding:5px 11px;border-radius:100px">' + esc(o.offer_type || 'Premium') + '</div></div>'
      + '<div style="position:relative;z-index:2">'
      + '<div style="font:700 16.5px/1.3 \'Bricolage Grotesque\',sans-serif;color:#FFFEF5;margin-bottom:4px">' + esc(o.title) + '</div>'
      + '<div style="font:400 13px \'Instrument Sans\',sans-serif;color:#C3C8E4;margin-bottom:12px">' + esc(o.venue || '') + (o.event_date ? ' · ' + esc(frDate(o.event_date)) : '') + '</div>'
      + '<a href="#pricing" data-svp="premium-cta" style="display:inline-block;font:700 12.5px \'Instrument Sans\',sans-serif;color:#16182B;background:#F5E642;padding:9px 17px;border-radius:100px;text-decoration:none">Réserver</a>'
      + '</div></div>';
  }
  function compteCard(o) {
    var img = o.image_url ? '<div style="height:110px;background:#EEF0FD center/cover no-repeat;background-image:url(' + esc(o.image_url) + ')"></div>'
      : '<div style="height:110px;background:#EEF0FD;display:flex;align-items:center;justify-content:center"><div style="width:70px;height:70px;background:url(assets/icon-mic-circle.png) center/contain no-repeat;mix-blend-mode:multiply"></div></div>';
    return '<div data-svp="offer" data-offer-id="' + esc(o.id) + '" data-offer-type="' + esc(o.offer_type || '') + '" data-offer-region="' + esc(o.region || '') + '" data-offer-search="' + esc((o.title || '') + ' ' + (o.venue || '')) + '" style="background:#fff;border:1.5px solid #ECEAE0;border-radius:16px;overflow:hidden;display:flex;flex-direction:column">'
      + '<div style="position:relative">' + img
      + '<span style="position:absolute;top:10px;left:10px;background:#F5E642;color:#16182B;font:700 11px \'Instrument Sans\',sans-serif;padding:4px 11px;border-radius:100px">' + esc(o.offer_type || 'Offre') + '</span>'
      + '<span style="position:absolute;top:10px;right:10px;background:#fff;color:#4A4D66;font:600 11px \'Instrument Sans\',sans-serif;padding:4px 11px;border-radius:100px;border:1px solid #ECEAE0">' + esc(o.region || '') + '</span></div>'
      + '<div style="padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px;flex:1">'
      + '<div style="font:700 15px/1.25 \'Bricolage Grotesque\',sans-serif">' + esc(o.title) + '</div>'
      + '<div style="font:500 12.5px \'Instrument Sans\',sans-serif;color:#8B8DA0;flex:1">' + esc(o.venue || '') + (o.event_date ? ' · ' + esc(frDate(o.event_date)) : '') + '</div>'
      + '<a href="premium.html" data-svp="premium-cta" style="margin-top:10px;text-align:center;background:#3347CA;color:#FFFEF5;border-radius:100px;padding:11px;font:700 13px \'Instrument Sans\',sans-serif;text-decoration:none">Voir l\'offre</a>'
      + '</div></div>';
  }
  // ---- Archive (past offers, from Netlify Blobs; read-only) ----
  function wireArchive() {
    var grid = document.querySelector('[data-svp="archive-grid"]');
    if (!grid) return;
    var empty = document.querySelector('[data-svp="archive-empty"]');
    fetch(FN + 'list-archived-offers').then(function (r) { return r.json(); }).then(function (d) {
      var offers = (d && d.offers) || [];
      if (!offers.length) { if (empty) empty.style.display = 'block'; return; }
      grid.innerHTML = offers.map(compteCard).join('');
    }).catch(function () { if (empty) empty.style.display = 'block'; });
  }
  // On the premium page, snapshot current offers to the archive (fire-and-forget,
  // read-only on the Sheet) so offers are captured before they expire.
  function triggerSnapshot() {
    if (!document.querySelector('[data-scroller="offres"]')) return;
    try { fetch(FN + 'snapshot-offers', { method: 'POST', keepalive: true }); } catch (e) {}
  }

  function wireLiveOffers() {
    var carousel = document.querySelector('[data-scroller="offres"]');
    var grid = document.querySelector('[data-svp="offers-grid"]');
    if (!carousel && !grid) return;
    fetch(FN + 'list-public-premium-offers').then(function (r) { return r.json(); }).then(function (d) {
      var offers = (d && d.offers) || [];
      if (!offers.length) return;
      if (carousel) { carousel.innerHTML = offers.map(premiumCard).join(''); }
      if (grid) { grid.innerHTML = offers.map(compteCard).join(''); }
      document.querySelectorAll('[data-svp="offer"]').forEach(observeOffer);
      wirePremiumCtas();
      if (typeof window.__svpApplyFilters === 'function') window.__svpApplyFilters();
      // link to the archive of past offers (once)
      var anchor = carousel || grid;
      if (anchor && !document.querySelector('[data-svp="archive-link"]')) {
        var a = document.createElement('a');
        a.setAttribute('data-svp', 'archive-link');
        a.href = 'archive.html';
        a.textContent = 'Voir les offres passées →';
        a.setAttribute('style', "display:inline-block;margin:16px 0 0;color:#3347CA;font:700 13.5px 'Instrument Sans',sans-serif;text-decoration:none");
        anchor.parentNode.insertBefore(a, anchor.nextSibling);
      }
    }).catch(function () {});
  }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- scroll-reveal for headings & cards ----
  function wireReveal() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    var targets = [].slice.call(document.querySelectorAll('h1, h2, h3, [data-svp="offer"], [data-card]'));
    // skip anything inside a sticky header/urgency bar (should be instantly visible)
    targets = targets.filter(function (el) {
      return !el.closest('[style*="position: sticky"]') && !el.closest('[data-svp="funnel-card"]');
    });
    if (!targets.length) return;
    targets.forEach(function (el) { el.classList.add('svp-reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('svp-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
    // safety: reveal everything after 1.2s in case observer misses (e.g., 0-height parents)
    setTimeout(function () { targets.forEach(function (el) { el.classList.add('svp-in'); }); }, 1200);
  }

  // ---- smooth page-to-page transitions for internal links ----
  function wirePageTransitions() {
    if (reducedMotion) return;
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
      if (url.pathname === window.location.pathname && url.hash) return; // same-page anchor
      e.preventDefault();
      document.documentElement.classList.add('svp-leaving');
      setTimeout(function () { window.location.href = url.href; }, 250);
    }, false);
  }

  // ---- prettify "Retour au site" / "Se déconnecter" links as pill buttons ----
  function wireBackLinks() {
    var pill = "display:inline-flex;align-items:center;gap:6px;background:#EEF0FD;color:#3347CA;font:700 13px 'Instrument Sans',sans-serif;padding:9px 16px;border-radius:100px;text-decoration:none;white-space:nowrap";
    [].slice.call(document.querySelectorAll('a')).forEach(function (a) {
      var t = (a.textContent || '').trim();
      if (/Retour au site/i.test(t) || /Se d[ée]connecter/i.test(t)) a.setAttribute('style', pill);
    });
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

  function init() {
    wireBackLinks(); wireFaq();
    wireHero(); wirePremiumCtas(); wireOfferViews(); wireFunnel(); wireCountdown();
    wireConnexion(); wireAccount(); wireCompteFilters(); wireUnsubscribe(); wireAdmin(); wirePartenariat();
    wireContact(); wirePremiumCheckout(); wireExitIntent(); wireLiveOffers();
    wireArchive(); triggerSnapshot();
    wireReveal(); wirePageTransitions();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
