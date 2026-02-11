// ActiveCampaign embed form 2 - double opt-in
window.cfields = [];
window._show_thank_you = function(id, message) {
  var form = document.getElementById('_form_' + id + '_');
  if (!form) return;
  var thank_you = form.querySelector('._form-thank-you');
  var content = form.querySelector('._form-content');
  if (content) content.style.display = 'none';
  if (thank_you) {
    thank_you.innerHTML = message || thank_you.innerHTML || "Merci ! Un email de confirmation t'a été envoyé. Clique sur le lien dans le message pour confirmer ton inscription et rejoindre la liste.";
    thank_you.style.display = 'block';
  }
};
window._show_error = function(id, message) {
  var form = document.getElementById('_form_' + id + '_');
  if (!form) return;
  var btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = false; btn.classList.remove('processing'); }
  var existing = form.querySelector('._form_error');
  if (existing) existing.remove();
  var err = document.createElement('div');
  err.className = '_error-inner _form_error _no_arrow';
  err.innerHTML = message || 'Une erreur est survenue. Réessaie.';
  var wrapper = document.createElement('div');
  wrapper.className = '_form-inner _show_be_error';
  wrapper.appendChild(err);
  btn.parentNode.insertBefore(wrapper, btn);
};
window._load_script = function(url, callback, isSubmit) {
  var head = document.querySelector('head');
  var script = document.createElement('script');
  script.charset = 'utf-8';
  script.src = url;
  if (callback) script.onload = callback;
  script.onerror = function() {
    if (isSubmit) {
      var btn = document.querySelector('#_form_1_submit');
      if (btn) { btn.disabled = false; btn.classList.remove('processing'); }
      window._show_error('1', "Désolé, l'envoi a échoué. Réessaie.");
    }
  };
  head.appendChild(script);
};

(function() {
  var form = document.getElementById('_form_1_');
  if (!form || window.location.search.indexOf('excludeform') !== -1) return;

  var serialize = function(f) {
    var q = [];
    for (var i = 0; i < f.elements.length; i++) {
      var el = f.elements[i];
      if (!el.name) continue;
      if (el.type === 'text' || el.type === 'email' || el.type === 'hidden') q.push(el.name + '=' + encodeURIComponent(el.value));
      else if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) q.push(el.name + '=' + encodeURIComponent(el.value)); }
    }
    return q.join('&');
  };

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var emailEl = form.querySelector('input[name="email"]');
    var email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      window._show_error('1', 'Indique ton adresse email.');
      return;
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      window._show_error('1', 'Entre une adresse email valide.');
      return;
    }
    var btn = form.querySelector('#_form_1_submit');
    if (btn) { btn.disabled = true; btn.classList.add('processing'); }
    var serialized = serialize(form);
    window._load_script('https://silvousplait.activehosted.com/proc.php?' + serialized + '&jsonp=true', null, true);
  });
})();
