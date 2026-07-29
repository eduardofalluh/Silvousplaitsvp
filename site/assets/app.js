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

  function init() { wireHero(); wirePremiumCtas(); wireOfferViews(); wireFunnel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
