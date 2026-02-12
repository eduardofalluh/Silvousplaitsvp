// ActiveCampaign embed form 2 - double opt-in (client-provided script)
window.cfields = [];
window._form1FeedbackTimeout = null;
window._show_thank_you = function(id, message, trackcmp_url, email) {
  var form = document.getElementById('_form_' + id + '_'), thank_you = form.querySelector('._form-thank-you');
  if (!form || !thank_you) return;
  if (window._form1FeedbackTimeout) { clearTimeout(window._form1FeedbackTimeout); window._form1FeedbackTimeout = null; }
  var content = form.querySelector('._form-content');
  if (content) content.style.display = 'none';
  thank_you.innerHTML = message || "Merci ! Un email de confirmation t'a été envoyé. Clique sur le lien dans le message pour confirmer ton inscription et rejoindre la liste.";
  thank_you.style.display = 'block';
  var visitorObject = typeof visitorGlobalObjectAlias !== 'undefined' ? window[visitorGlobalObjectAlias] : window.vgo;
  if (email && typeof visitorObject !== 'undefined') {
    visitorObject('setEmail', email);
    visitorObject('update');
  } else if (typeof trackcmp_url !== 'undefined' && trackcmp_url) {
    _load_script(trackcmp_url);
  }
  if (typeof window._form_callback !== 'undefined') window._form_callback(id);
  thank_you.setAttribute('tabindex', '-1');
  thank_you.focus();
  window._form1FeedbackTimeout = setTimeout(function() {
    thank_you.style.display = 'none';
    thank_you.innerHTML = '';
    if (content) content.style.display = '';
    var fb = form.querySelector('.form-feedback');
    if (fb) { fb.textContent = ''; fb.classList.remove('is-error'); }
    window._form1FeedbackTimeout = null;
  }, 5000);
};
window._show_unsubscribe = function(id, message, trackcmp_url, email) {
  var form = document.getElementById('_form_' + id + '_'), unsub = form.querySelector('._form-thank-you');
  var branding = form.querySelector('._form-branding');
  if (branding) branding.style.display = 'none';
  if (form.querySelector('._form-content')) form.querySelector('._form-content').style.display = 'none';
  unsub.style.display = 'block';
  form.insertAdjacentHTML('afterend', message);
  var visitorObject = typeof visitorGlobalObjectAlias !== 'undefined' ? window[visitorGlobalObjectAlias] : window.vgo;
  if (email && typeof visitorObject !== 'undefined') {
    visitorObject('setEmail', email);
    visitorObject('update');
  } else if (typeof trackcmp_url !== 'undefined' && trackcmp_url) _load_script(trackcmp_url);
  if (typeof window._form_callback !== 'undefined') window._form_callback(id);
};
window._show_error = function(id, message, html) {
  var form = document.getElementById('_form_' + id + '_');
  if (!form) return;
  var err = document.createElement('div');
  var button = form.querySelector('button[type="submit"]');
  var old_error = form.querySelector('._form_error');
  if (old_error) old_error.parentNode.removeChild(old_error);
  var displayMessage = message;
  if (message && /already|déjà|already subscribed|duplicate|exist|subscribed|inscrit/i.test(String(message))) {
    displayMessage = "Cette adresse est déjà inscrite à notre liste. Tu recevras nos prochains emails.";
  }
  err.innerHTML = displayMessage || 'Une erreur est survenue. Réessaie.';
  err.className = '_error-inner _form_error _no_arrow';
  var wrapper = document.createElement('div');
  wrapper.className = '_form-inner _show_be_error';
  wrapper.appendChild(err);
  button.parentNode.insertBefore(wrapper, button);
  var submitButton = form.querySelector('[id^="_form"][id$="_submit"]');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.classList.remove('processing');
  }
  if (html) {
    var div = document.createElement('div');
    div.className = '_error-html';
    div.innerHTML = html;
    err.appendChild(div);
  }
  var feedback = form.querySelector('.form-feedback');
  if (feedback) {
    feedback.textContent = displayMessage;
    feedback.classList.add('is-error');
  }
  if (window._form1FeedbackTimeout) { clearTimeout(window._form1FeedbackTimeout); window._form1FeedbackTimeout = null; }
  window._form1FeedbackTimeout = setTimeout(function() {
    var errEl = form.querySelector('._form_error');
    if (errEl) {
      var wrapper = errEl.closest('._form-inner._show_be_error');
      if (wrapper) wrapper.parentNode.removeChild(wrapper);
    }
    if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }
    window._form1FeedbackTimeout = null;
  }, 5000);
};
window._show_pc_confirmation = function(id, header, detail, show, email) {
  var form = document.getElementById('_form_' + id + '_'), pc_confirmation = form.querySelector('._form-pc-confirmation');
  if (!form || !pc_confirmation) return;
  if (pc_confirmation.style.display === 'none') {
    if (form.querySelector('._form-content')) form.querySelector('._form-content').style.display = 'none';
    pc_confirmation.innerHTML = "<div class='_form-title'>" + header + "</div><p>" + detail + "</p><button class='_submit' id='hideButton'>Manage preferences</button>";
    pc_confirmation.style.display = 'block';
    var mp = document.querySelector('input[name="mp"]');
    if (mp) mp.value = '0';
  } else {
    if (form.querySelector('._form-content')) form.querySelector('._form-content').style.display = 'inline';
    pc_confirmation.style.display = 'none';
  }
  var hideButton = document.getElementById('hideButton');
  if (hideButton) {
    hideButton.addEventListener('click', function() {
      var submitButton = document.querySelector('#_form_1_submit');
      if (submitButton) { submitButton.disabled = false; submitButton.classList.remove('processing'); }
      var mp = document.querySelector('input[name="mp"]');
      if (mp) mp.value = '1';
      var cacheBuster = new URL(window.location.href);
      cacheBuster.searchParams.set('v', new Date().getTime());
      window.location.href = cacheBuster.toString();
    });
  }
  if (typeof window._form_callback !== 'undefined') window._form_callback(id);
};
window._load_script = function(url, callback, isSubmit) {
  var head = document.querySelector('head'), script = document.createElement('script'), r = false;
  var submitButton = document.querySelector('#_form_1_submit');
  script.charset = 'utf-8';
  script.src = url;
  if (callback) {
    script.onload = script.onreadystatechange = function() {
      if (!r && (!this.readyState || this.readyState === 'complete')) {
        r = true;
        callback();
      }
    };
  }
  script.onerror = function() {
    if (isSubmit) {
      if (script.src.length > 10000) {
        _show_error('1', "Désolé, ta soumission a échoué. Réessaie avec des réponses plus courtes.");
      } else {
        _show_error('1', "Désolé, l'envoi a échoué. Réessaie.");
      }
      if (submitButton) { submitButton.disabled = false; submitButton.classList.remove('processing'); }
    }
  };
  head.appendChild(script);
};

function _attachForm1Submit() {
  if (window.location.search.indexOf('excludeform') !== -1) return;
  var form_to_submit = document.getElementById('_form_1_');
  if (!form_to_submit) return;

  var getCookie = function(name) {
    var match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]+)'));
    return match ? match[2] : (typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null);
  };
  var addEvent = function(element, event, func) {
    if (element.addEventListener) {
      element.addEventListener(event, func);
    } else {
      var oldFunc = element['on' + event];
      element['on' + event] = function() {
        if (oldFunc) oldFunc.apply(this, arguments);
        func.apply(this, arguments);
      };
    }
  };

  var _form_serialize = function(form) {
    if (!form || form.nodeName !== 'FORM') return '';
    var i, j, q = [];
    for (i = 0; i < form.elements.length; i++) {
      if (form.elements[i].name === '') continue;
      switch (form.elements[i].nodeName) {
        case 'INPUT':
          switch (form.elements[i].type) {
            case 'text':
            case 'email':
            case 'number':
            case 'date':
            case 'time':
            case 'hidden':
            case 'password':
              q.push(form.elements[i].name + '=' + encodeURIComponent(form.elements[i].value));
              break;
            case 'checkbox':
            case 'radio':
              if (form.elements[i].checked) q.push(form.elements[i].name + '=' + encodeURIComponent(form.elements[i].value));
              break;
          }
          break;
        case 'TEXTAREA':
          q.push(form.elements[i].name + '=' + encodeURIComponent(form.elements[i].value));
          break;
        case 'SELECT':
          if (form.elements[i].type === 'select-one') {
            q.push(form.elements[i].name + '=' + encodeURIComponent(form.elements[i].value));
          }
          break;
      }
    }
    return q.join('&');
  };

  function formToBody(form) {
    var body = {};
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (!el.name) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) body[el.name] = el.value;
      } else {
        body[el.name] = el.value;
      }
    }
    return body;
  }

  var form_submit = function(e) {
    e.preventDefault();
    var emailEl = form_to_submit.querySelector('input[name="email"]');
    var email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      window._show_error('1', 'Indique ton adresse email.');
      return false;
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      window._show_error('1', 'Entre une adresse email valide.');
      return false;
    }
    var submitButton = form_to_submit.querySelector('#_form_1_submit');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add('processing');
    }
    var err = form_to_submit.querySelector('._form_error');
    if (err) err.parentNode.removeChild(err);
    var feedback = form_to_submit.querySelector('.form-feedback');
    if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }

    var body = formToBody(form_to_submit);
    fetch('/.netlify/functions/submit-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function(res) { return res.json().then(function(data) { return { res: res, data: data }; }); })
      .then(function(result) {
        var data = result.data;
        var ok = result.res.ok;
        if (data && data.alreadyRegistered) {
          window._show_error('1', "Cette adresse est déjà inscrite à notre liste. Tu recevras nos prochains emails.");
        } else if (ok && data && (data.result_code === 1 || data.result === 'success' || data.success === 1 || (data.js && data.js.indexOf('_show_thank_you') !== -1))) {
          window._show_thank_you('1', "Merci ! Un email de confirmation t'a été envoyé. Clique sur le lien dans le message pour confirmer ton inscription et rejoindre la liste.");
          if (emailEl) emailEl.value = '';
        } else if (ok && data) {
          window._show_thank_you('1', "Merci ! Un email de confirmation t'a été envoyé. Clique sur le lien dans le message pour confirmer ton inscription et rejoindre la liste.");
          if (emailEl) emailEl.value = '';
        } else {
          window._show_error('1', "L'inscription n'a pas fonctionné. Vérifie ton email et réessaie.");
        }
        if (submitButton) { submitButton.disabled = false; submitButton.classList.remove('processing'); }
      })
      .catch(function() {
        window._show_error('1', "Impossible d'envoyer pour le moment. Réessaie plus tard.");
        if (submitButton) { submitButton.disabled = false; submitButton.classList.remove('processing'); }
      });

    return false;
  };

  addEvent(form_to_submit, 'submit', form_submit);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _attachForm1Submit);
} else {
  _attachForm1Submit();
}
