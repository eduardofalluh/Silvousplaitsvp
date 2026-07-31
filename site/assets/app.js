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
        var ln = document.querySelector('input[placeholder="Nom"]'); if (ln) ln.value = a.lastName || '';
        var fn = document.querySelector('input[placeholder="Prénom"]'); if (fn) fn.value = a.firstName || '';
        var ph = document.querySelector('input[type="tel"]'); if (ph) ph.value = a.phone || '';
      })
      .catch(function () { /* leave skeletons on network error */ });
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
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var session = getSession();
        if (!session) { window.location.href = 'connexion.html'; return; }
        say('Ouverture…');
        fetch(FN + 'create-billing-portal-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: session }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.ok && d.url) { window.location.href = d.url; }
            else if (d && d.reason === 'no-subscription') { say('Aucun abonnement Premium actif sur ce compte.', true); }
            else { say("Impossible d'ouvrir la facturation pour le moment.", true); }
          }).catch(function () { say('Erreur. Réessaie plus tard.', true); });
      });
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
    function resetBtn(btn) { var o = btn.getAttribute('data-orig-label'); if (o != null) btn.textContent = o; btn.disabled = false; }
    btns.forEach(function (btn) {
      if (btn.getAttribute('data-orig-label') == null) btn.setAttribute('data-orig-label', btn.textContent);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var plan = btn.getAttribute('data-plan') || 'yearly';
        var email = getEmail();
        if (email) { try { fetch(FN + 'tag-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, tag: 'a-cliqué-premium-siteweb' }), keepalive: true }); } catch (er) {} }
        pixel('track', 'InitiateCheckout');
        btn.textContent = 'Redirection…';
        fetch(FN + 'create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planKey: plan, returnPath: '/premium.html' }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.url) { window.location.href = d.url; }
            else { resetBtn(btn); alert("Le paiement n'a pas pu démarrer. Réessaie."); }
          }).catch(function () { resetBtn(btn); alert('Erreur. Réessaie plus tard.'); });
      });
    });
    // Returning to the page (e.g. Back from Stripe, incl. bfcache) restores the button.
    window.addEventListener('pageshow', function () { btns.forEach(resetBtn); });
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

  // ---- P5: partenariat form (interest selector + fields) ----
  function wirePartenariat() {
    var form = document.querySelector('[data-svp="partner-form"]');
    if (!form) return;
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
      if (!validEmail(data.email.trim()) || !data.message.trim()) { say('Courriel valide et message requis.', true); return; }
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
  // Video helpers: YouTube/Vimeo -> autoplay embed, direct files -> <video>.
  function videoEmbed(url) {
    url = String(url || '').trim(); if (!url) return null;
    var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&mute=1&loop=1&playlist=' + m[1] + '&controls=0&modestbranding=1&playsinline=1&rel=0';
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1&muted=1&loop=1&background=1';
    return null;
  }
  function isVideoFile(url) { return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(String(url || '')); }
  function premiumMedia(o) {
    var v = o.video_url && String(o.video_url).trim();
    if (v) {
      var emb = videoEmbed(v);
      if (emb) return '<iframe src="' + esc(emb) + '" allow="autoplay;encrypted-media" tabindex="-1" style="position:absolute;inset:0;width:100%;height:100%;border:0;z-index:0;pointer-events:none"></iframe>';
      if (isVideoFile(v)) return '<video src="' + esc(v) + '" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0"></video>';
    }
    return '';
  }
  function compteMedia(o) {
    var v = o.video_url && String(o.video_url).trim();
    if (v) {
      var emb = videoEmbed(v);
      if (emb) return '<div style="height:110px;position:relative;overflow:hidden"><iframe src="' + esc(emb) + '" allow="autoplay;encrypted-media" tabindex="-1" style="position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none"></iframe></div>';
      if (isVideoFile(v)) return '<div style="height:110px;position:relative;overflow:hidden"><video src="' + esc(v) + '" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video></div>';
    }
    return o.image_url ? '<div style="height:110px;background:#EEF0FD center/cover no-repeat;background-image:url(' + esc(o.image_url) + ')"></div>'
      : '<div style="height:110px;background:#EEF0FD;display:flex;align-items:center;justify-content:center"><div style="width:70px;height:70px;background:url(assets/icon-mic-circle.png) center/contain no-repeat;mix-blend-mode:multiply"></div></div>';
  }
  function premiumCard(o) {
    var img = o.image_url ? 'background:#0b1030 url(' + esc(o.image_url) + ') center/cover no-repeat;' : 'background:repeating-linear-gradient(135deg,#4155DE,#4155DE 14px,#3347CA 14px,#3347CA 28px);';
    return '<div data-svp="offer" data-offer-id="' + esc(o.id) + '" style="position:relative;flex:0 0 auto;width:290px;max-width:86vw;height:400px;scroll-snap-align:start;border-radius:20px;overflow:hidden;box-shadow:rgba(142,160,245,.3) 5px 6px 0;' + img + 'display:flex;flex-direction:column;justify-content:space-between;padding:18px">'
      + premiumMedia(o)
      + '<div style="position:absolute;inset:0;z-index:1;background:linear-gradient(rgba(8,10,26,0) 42%,rgba(8,10,26,.85) 74%)"></div>'
      + '<div style="position:relative;z-index:2;display:flex;justify-content:flex-end"><div style="background:#F5E642;color:#16182B;font:800 12px \'Instrument Sans\',sans-serif;padding:5px 11px;border-radius:100px">' + esc(o.offer_type || 'Premium') + '</div></div>'
      + '<div style="position:relative;z-index:2">'
      + '<div style="font:700 16.5px/1.3 \'Bricolage Grotesque\',sans-serif;color:#FFFEF5;margin-bottom:4px">' + esc(o.title) + '</div>'
      + '<div style="font:400 13px \'Instrument Sans\',sans-serif;color:#C3C8E4;margin-bottom:12px">' + esc(o.venue || '') + (o.event_date ? ' · ' + esc(frDate(o.event_date)) : '') + '</div>'
      + '<a href="#pricing" data-svp="premium-cta" style="display:inline-block;font:700 12.5px \'Instrument Sans\',sans-serif;color:#16182B;background:#F5E642;padding:9px 17px;border-radius:100px;text-decoration:none">Réserver</a>'
      + '</div></div>';
  }
  function compteCard(o) {
    var img = compteMedia(o);
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
  // ---- Offers carousel: scroll-progress thumb + arrow buttons ----
  function wireOffersCarousel() {
    var scroller = document.querySelector('[data-scroller="offres"]');
    if (!scroller) return;
    var fill = document.querySelector('[data-svp="offers-progress"]');
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

  function wireLiveOffers() {
    var carousel = document.querySelector('[data-scroller="offres"]');
    var grid = document.querySelector('[data-svp="offers-grid"]');
    if (!carousel && !grid) return;
    // Replace the design's sample cards with skeletons immediately so users never
    // see fake placeholder offers while the real ones load.
    if (carousel) carousel.innerHTML = rep(skeletonCarouselCard(), 4);
    if (grid) grid.innerHTML = rep(skeletonGridCard(), 6);
    // add the "offres passées" link once (independent of load result)
    var anchor = carousel || grid;
    if (anchor && !document.querySelector('[data-svp="archive-link"]')) {
      var a = document.createElement('a');
      a.setAttribute('data-svp', 'archive-link');
      a.href = 'archive.html';
      a.textContent = 'Voir les offres passées →';
      a.setAttribute('style', "display:inline-block;margin:16px 0 0;color:#3347CA;font:700 13.5px 'Instrument Sans',sans-serif;text-decoration:none");
      anchor.parentNode.insertBefore(a, anchor.nextSibling);
    }
    fetch(FN + 'list-public-premium-offers').then(function (r) { return r.json(); }).then(function (d) {
      var offers = (d && d.offers) || [];
      if (carousel) carousel.innerHTML = offers.length ? offers.map(premiumCard).join('') : '';
      if (grid) grid.innerHTML = offers.length ? offers.map(compteCard).join('')
        : '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Aucune offre pour le moment — reviens lundi pour la nouvelle sélection.</p>';
      document.querySelectorAll('[data-svp="offer"]').forEach(observeOffer);
      wirePremiumCtas();
      if (typeof window.__svpApplyFilters === 'function') window.__svpApplyFilters();
    }).catch(function () {
      if (carousel) carousel.innerHTML = '';
      if (grid) grid.innerHTML = '<p style="grid-column:1/-1;color:#8B8DA0;font:500 14px \'Instrument Sans\',sans-serif;padding:8px 2px">Impossible de charger les offres pour le moment.</p>';
    });
  }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- scroll-reveal for headings & cards ----
  function wireReveal() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    var targets = [].slice.call(document.querySelectorAll('h1, h2, h3, [data-svp="offer"], [data-card], [data-svp="step"]'));
    // skip anything inside a sticky header/urgency bar (should be instantly visible)
    targets = targets.filter(function (el) {
      return !el.closest('[style*="position: sticky"]') && !el.closest('[data-svp="funnel-card"]');
    });
    if (!targets.length) return;
    var stepIndex = 0;
    targets.forEach(function (el) {
      el.classList.add('svp-reveal');
      // stagger the "Comment ça marche" steps as they scroll in
      if (el.getAttribute('data-svp') === 'step') { el.style.transitionDelay = (stepIndex * 0.12) + 's'; stepIndex++; }
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('svp-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
    // safety: only force-reveal elements already at/above the fold (in case the
    // observer missed them). Below-the-fold elements stay hidden so they still
    // animate when you scroll to them.
    setTimeout(function () {
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || document.documentElement.clientHeight)) el.classList.add('svp-in');
      });
    }, 1200);
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

    // 2) Guarantee a visible home button IN THE HEADER. Skip only if one is
    //    already up top (the sub-pages' "← Retour" pill) — NOT a footer "Accueil"
    //    link (premium has one in the footer, but that's not reachable without
    //    scrolling, which is exactly the complaint).
    if (document.querySelector('[data-svp="home"]')) return;
    var hasHeaderHome = [].some.call(document.querySelectorAll('a[href*="accueil"]'), function (x) {
      if (!(x.textContent || '').trim()) return false;     // has visible text, not just the logo image
      var r = x.getBoundingClientRect();
      return r.width > 0 && r.top < 240;                   // sits in the header area
    });
    if (hasHeaderHome) return;

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
      pill.setAttribute('style', "display:inline-flex;align-items:center;gap:6px;background:#EEF0FD;color:#3347CA;font:700 13px 'Instrument Sans',sans-serif;padding:9px 16px;border-radius:100px;text-decoration:none;margin-left:14px;white-space:nowrap");
      if (logoLink.nextSibling) logoLink.parentNode.insertBefore(pill, logoLink.nextSibling);
      else logoLink.parentNode.appendChild(pill);
    }
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

  // ---- scroll-to-top CTAs (step cards, free-plan button) ----
  function wireScrollTop() {
    document.querySelectorAll('[data-svp="scroll-top"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
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
    setTimeout(function () { document.body.classList.add('intro-fading'); }, 2550);
    setTimeout(function () {
      document.body.classList.add('intro-complete');
      root.style.overflow = '';
      document.body.style.overflow = '';
    }, 3800);
  }

  function init() {
    // Always start at the top on (re)load — don't let the browser restore scroll.
    if ('scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) {} }
    try { window.scrollTo(0, 0); } catch (e) {}
    wireIntro();
    wireHomeLink(); wireBackLinks(); wireFaq(); wireScrollTop();
    wireHero(); wirePremiumCtas(); wireOfferViews(); wireFunnel(); wireCountdown();
    wireConnexion(); wireAccount(); wireCompteFilters(); wireUnsubscribe(); wireBilling(); wireAdmin(); wirePartenariat();
    wireContact(); wirePremiumCheckout(); wireExitIntent(); wireLiveOffers(); wireOffersCarousel();
    wireArchive();
    wireReveal(); wireCountUp(); wirePageTransitions();
    // Reveal the incoming-page cover (see animations.css html.svp-nav ::after)
    // only now — after all wiring ran and one more frame has painted — so the
    // fade never competes with this heavy init work. No-op unless we arrived via
    // a click navigation (html.svp-nav). Two rAFs = let a clean frame paint.
    if (!reducedMotion && document.documentElement.classList.contains('svp-nav')) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { document.documentElement.classList.add('svp-revealed'); });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
