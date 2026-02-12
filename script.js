// =====================================================
// Silvousplait – Main Script
// =====================================================

console.log("Silvousplait landing loaded");

// =====================================================
// ACTIVE CAMPAIGN EMBED – same look as .email-form (hero + CTA)
// Runs when AC injects form into ._form_1: placeholder + button text
// =====================================================
function styleACEmbedForms() {
  var containers = document.querySelectorAll('._form_1');
  containers.forEach(function (container) {
    var form = container.querySelector('form');
    if (!form || form.dataset.silvousplaitStyled) return;
    var emailInput = form.querySelector('input[name="email"], input[type="email"]');
    var submitBtn = form.querySelector('button[type="submit"], ._submit');
    if (emailInput) {
      emailInput.placeholder = 'nom@email.com';
      emailInput.setAttribute('placeholder', 'nom@email.com');
    }
    if (submitBtn) submitBtn.textContent = "S'inscrire";
    form.dataset.silvousplaitStyled = '1';
  });
}
function initACEmbedStyle() {
  styleACEmbedForms();
  setTimeout(styleACEmbedForms, 300);
  setTimeout(styleACEmbedForms, 1000);
  var root = document.querySelector('._form_1');
  if (root && typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(function () { styleACEmbedForms(); });
    mo.observe(root, { childList: true, subtree: true });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initACEmbedStyle);
} else {
  initACEmbedStyle();
}
setTimeout(styleACEmbedForms, 500);
setTimeout(styleACEmbedForms, 1500);

// =====================================================
// SCROLL TO TOP ON PAGE LOAD/REFRESH
// =====================================================
(function scrollToTopOnLoad() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);
})();

// =====================================================
// PAGE TRANSITIONS - Smooth slide and fade
// =====================================================
function initPageTransitions() {
  // Get all internal links
  const links = document.querySelectorAll('a[href]');
  const overlay = document.querySelector('.page-transition-overlay');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Skip if it's an anchor link, external link, mailto, or same page
      if (href.includes('#') || 
          href.startsWith('http') || 
          href.startsWith('mailto:') || 
          href === '#' ||
          href === '' ||
          !href.endsWith('.html')) {
        return;
      }
      
      // Only handle internal HTML page links
      const isInternalPage = href.includes('index.html') || 
                            href.includes('faq.html') || 
                            href.includes('politique.html') || 
                            href.includes('termes.html') || 
                            href.includes('contact.html');
      
      if (!isInternalPage) {
        return;
      }
      
      e.preventDefault();

      if (prefersReducedMotion) {
        window.location.href = href;
        return;
      }
      
      // Add exiting class to current page - slide left
      document.body.classList.add('page-exiting');
      
      // Show overlay sliding in from right
      if (overlay) {
        overlay.classList.remove('exit');
        overlay.classList.add('active');
      }
      
      // Store flag so next page can animate overlay out
      sessionStorage.setItem('pageTransition', '1');

      // Navigate quickly so the next page starts immediately
      // Use requestAnimationFrame for better performance
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.location.href = href;
        }, 200);
      });
    });
  });
  
  // Animate page content in on load
  function animatePageIn() {
    const shouldTransition = sessionStorage.getItem('pageTransition') === '1';
    if (shouldTransition) {
      sessionStorage.removeItem('pageTransition');
    }

    // Add entering class to body immediately
    document.body.classList.add('page-entering');
    
    // If coming from a transition, wipe overlay out to the left
    if (overlay && shouldTransition && !prefersReducedMotion) {
      overlay.classList.add('active');
      // Use double RAF for better browser paint timing
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('exit');
        });
      });
      setTimeout(() => {
        overlay.classList.remove('active', 'exit');
        overlay.style.willChange = 'auto';
      }, 450);
    } else if (overlay) {
      overlay.classList.remove('active', 'exit');
    }
    
    // Remove entering class and will-change after animation for better performance
    setTimeout(() => {
      document.body.classList.remove('page-entering');
      document.body.style.willChange = 'auto';
      document.body.style.backfaceVisibility = 'auto';
      document.body.style.transform = 'none';
    }, 350);
  }
  
  // Trigger on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', animatePageIn);
  } else {
    // Page already loaded
    animatePageIn();
  }
}

// Initialize page transitions immediately
initPageTransitions();

document.addEventListener('DOMContentLoaded', () => {

  // =====================================================
  // MOBILE MENU
  // =====================================================
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isActive = navMenu.classList.contains('active');
      
      if (isActive) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
      } else {
        menuToggle.classList.add('active');
        navMenu.classList.add('active');
        document.body.classList.add('menu-open');
      }
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    });

    // Close menu when clicking backdrop (body::before)
    document.body.addEventListener('click', (e) => {
      if (navMenu.classList.contains('active')) {
        // Check if click is on the backdrop (not on menu or toggle)
        if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
          menuToggle.classList.remove('active');
          navMenu.classList.remove('active');
          document.body.classList.remove('menu-open');
        }
      }
    }, true); // Use capture phase to catch backdrop clicks

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });
  }

  // =====================================================
  // TESTIMONIAL CAROUSEL – auto-advance every 8s with seamless infinite loop
  // =====================================================
  (function initTestimonialCarousel() {
    const track = document.getElementById('testimonial-track');
    if (!track) return;

    const originalSlides = Array.from(track.querySelectorAll('.testimonial-slide'));
    const originalCount = originalSlides.length;
    
    // Clone slides for seamless infinite loop
    originalSlides.forEach(slide => {
      const clone = slide.cloneNode(true);
      track.appendChild(clone);
    });
    
    const allSlides = Array.from(track.querySelectorAll('.testimonial-slide'));
    let currentIndex = 0;
    let autoAdvanceInterval = null;
    let userInteractionTimeout = null;
    let isTransitioning = false;

    // Dots indicator
    const dotsContainer = document.getElementById('testimonial-dots');
    const dots = dotsContainer ? Array.from(dotsContainer.querySelectorAll('.dot')) : [];
    
    function updateDots() {
      if (dots.length === 0) return;
      const activeIndex = currentIndex % originalCount;
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
      });
    }

    function getSlidePosition(index) {
      let position = 0;
      for (let i = 0; i < index; i++) {
        if (allSlides[i]) position += allSlides[i].offsetWidth + 24;
      }
      return position;
    }

    function scrollToSlide(index, smooth = true) {
      const position = getSlidePosition(index);
      track.scrollTo({
        left: position,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }

    function nextSlide() {
      if (isTransitioning) return;
      isTransitioning = true;
      
      currentIndex++;
      scrollToSlide(currentIndex, true);
      updateDots();
      
      if (currentIndex >= originalCount) {
        setTimeout(() => {
          currentIndex = 0;
          scrollToSlide(0, false);
          updateDots();
          isTransitioning = false;
        }, 800);
      } else {
        setTimeout(() => {
          isTransitioning = false;
        }, 800);
      }
    }

    // 3D curve effect
    function apply3DCurve() {
      const trackRect = track.getBoundingClientRect();
      const trackCenter = trackRect.left + trackRect.width / 2;
      
      allSlides.forEach(slide => {
        const slideRect = slide.getBoundingClientRect();
        const slideCenter = slideRect.left + slideRect.width / 2;
        const distanceFromCenter = slideCenter - trackCenter;
        const maxDistance = trackRect.width / 2;
        const normalizedDistance = Math.max(-1, Math.min(1, distanceFromCenter / maxDistance));
        
        const rotateY = normalizedDistance * 15;
        const scale = 1 - Math.abs(normalizedDistance) * 0.15;
        const opacity = 1 - Math.abs(normalizedDistance) * 0.3;
        
        slide.style.transform = `rotateY(${rotateY}deg) scale(${scale})`;
        slide.style.opacity = opacity;
      });
    }

    function startAutoAdvance() {
      if (autoAdvanceInterval) clearInterval(autoAdvanceInterval);
      autoAdvanceInterval = setInterval(nextSlide, 8000);
    }

    function stopAutoAdvance() {
      if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
        autoAdvanceInterval = null;
      }
      if (userInteractionTimeout) clearTimeout(userInteractionTimeout);
      userInteractionTimeout = setTimeout(startAutoAdvance, 5000);
    }

    // Scroll event for 3D effect
    let rafId = null;
    track.addEventListener('scroll', function() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function() {
        apply3DCurve();
        rafId = null;
      });
    }, { passive: true });

    // Update dots on manual scroll
    let scrollTimeout = null;
    track.addEventListener('scroll', function() {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!isTransitioning) {
          const slideWidth = allSlides[0] ? allSlides[0].offsetWidth + 24 : 500;
          const estimatedIndex = Math.round(track.scrollLeft / slideWidth);
          currentIndex = estimatedIndex % originalCount;
          updateDots();
        }
      }, 150);
    }, { passive: true });

    // User interaction handlers
    track.addEventListener('mousedown', stopAutoAdvance);
    track.addEventListener('touchstart', stopAutoAdvance, { passive: true });
    track.addEventListener('wheel', stopAutoAdvance, { passive: true });

    // Initialize
    track.style.touchAction = 'pan-x';
    startAutoAdvance();
    apply3DCurve();
    updateDots();
    
    window.addEventListener('resize', apply3DCurve);
  })();

  // =====================================================
  // FAQ SCROLL ANIMATION (STAGGERED + RELIABLE)
  // =====================================================
  // Initialize FAQ animations after a brief delay to ensure CSS is loaded
  setTimeout(initFAQAnimations, 100);

  // =====================================================
  // SMOOTH SCROLL FOR "JE M'INSCRIS" BUTTON
  // =====================================================
  function smoothScrollTo(targetEl, offset = 100) {
    if (!targetEl) return;

    const startPosition = window.pageYOffset;
    const targetPosition = targetEl.getBoundingClientRect().top + startPosition - offset;
    const distance = targetPosition - startPosition;
    const duration = 1500;
    let start = null;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function animation(currentTime) {
      if (start === null) start = currentTime;
      const timeElapsed = currentTime - start;
      const progress = Math.min(timeElapsed / duration, 1);
      const ease = easeInOutCubic(progress);

      window.scrollTo(0, startPosition + distance * ease);

      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      }
    }

    requestAnimationFrame(animation);
  }

  const jeMinscrisBtn = document.getElementById('je-minscris-btn');
  if (jeMinscrisBtn) {
    jeMinscrisBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('contact-form') || document.querySelector('.cta');
      if (target) {
        smoothScrollTo(target, 100);
        const input = target.querySelector('input[type="email"]');
        if (input) {
          setTimeout(() => {
            input.focus();
          }, 900);
        }
      }
    });
  }

  // =====================================================
  // SMOOTH SCROLL FOR "S'INSCRIRE GRATUITEMENT" BUTTON
  // =====================================================
  const signupScrollTrigger = document.getElementById('signup-scroll-trigger');
  if (signupScrollTrigger) {
    signupScrollTrigger.addEventListener('click', () => {
      const targetForm = document.getElementById('ac-signup-bottom');
      if (!targetForm) return;
      smoothScrollTo(targetForm, 100);
      const input = targetForm.querySelector('input[type="email"]');
      if (input) {
        setTimeout(() => {
          input.focus();
        }, 900);
      }
    });
  }

  // =====================================================
  // ACTIVE CAMPAIGN SIGNUP (TOP + BOTTOM FORMS)
  // =====================================================
  let formFeedbackTimeout = null;

  function setFormFeedback(form, message, type = 'info') {
    const feedback = form.querySelector('.form-feedback');
    if (!feedback) return;
    
    // Clear any existing timeout
    if (formFeedbackTimeout) {
      clearTimeout(formFeedbackTimeout);
      formFeedbackTimeout = null;
    }
    
    feedback.textContent = message || '';
    feedback.classList.toggle('is-error', type === 'error');
    
    // Auto-dismiss after 15 seconds if there's a message
    if (message) {
      formFeedbackTimeout = setTimeout(() => {
        feedback.textContent = '';
        feedback.classList.remove('is-error');
      }, 5000);
    }
  }

  function isActiveCampaignSuccess(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.success === 1 || data.success === true) return true;
    if (data.result === 'success' || data.status === 'success' || data.type === 'success') return true;
    if (data.result_code === 1) return true;
    if (typeof data.js === 'string' && data.js.includes('_show_thank_you')) return true;
    return false;
  }

  /** Build JSON body from form, POST to Netlify function (honeypot blocks bots) */
  async function submitActiveCampaign(form) {
    var honeypot = form.querySelector('input[name="website"]');
    if (honeypot && honeypot.value && honeypot.value.trim() !== '') {
      return { response: { ok: true }, data: { success: 1 } };
    }

    var body = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      body[key] = value;
    });

    var response = await fetch('/.netlify/functions/submit-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    return { response, data };
  }

  document.querySelectorAll('form[data-ac-signup="true"]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setFormFeedback(form, '');

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var submitButton = form.querySelector('button[type="submit"]');
      var emailInput = form.querySelector('input[name="email"]');
      if (submitButton) submitButton.disabled = true;
      setFormFeedback(form, "Envoi en cours…");

      submitActiveCampaign(form).then(function (result) {
        var response = result.response;
        var data = result.data;

        if (response.ok && data && data.alreadyRegistered) {
          setFormFeedback(form, "Cette adresse est déjà inscrite à notre liste. Tu recevras nos prochains emails.", 'error');
        } else if (response.ok && isActiveCampaignSuccess(data)) {
          setFormFeedback(form, "Merci ! Un email de confirmation t'a été envoyé. Clique sur le lien dans le message pour confirmer ton inscription et rejoindre la liste.");
          if (emailInput) emailInput.value = '';
        } else if (response.status === 500 && data && data.hint) {
          setFormFeedback(form, "Erreur serveur : " + (data.hint || data.error || "Réessaie plus tard."), 'error');
        } else {
          setFormFeedback(form, "L'inscription n'a pas fonctionné. Vérifie ton email et réessaie.", 'error');
        }
        if (submitButton) submitButton.disabled = false;
      }).catch(function (err) {
        console.error(err);
        setFormFeedback(form, "Impossible d'envoyer pour le moment. Réessaie plus tard.", 'error');
        if (submitButton) submitButton.disabled = false;
      });
    });
  });

  // =====================================================
  // PREMIUM MODAL
  // =====================================================
  const premiumButton = document.getElementById('premium-button');
  const premiumModal = document.getElementById('premium-modal');
  const premiumClose = premiumModal?.querySelector('.modal-close');
  const premiumModalSignup = document.getElementById('premium-modal-signup');

  function openPremiumModal() {
    if (!premiumModal) return;
    premiumModal.classList.add('open');
    premiumModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closePremiumModal() {
    if (!premiumModal) return;
    premiumModal.classList.remove('open');
    premiumModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  if (premiumButton) {
    premiumButton.addEventListener('click', (e) => {
      e.preventDefault();
      openPremiumModal();
    });
  }

  if (premiumClose) {
    premiumClose.addEventListener('click', closePremiumModal);
  }

  if (premiumModal) {
    premiumModal.addEventListener('click', (e) => {
      if (e.target === premiumModal) {
        closePremiumModal();
      }
    });
  }

  if (premiumModalSignup) {
    premiumModalSignup.addEventListener('click', () => {
      closePremiumModal();
      const targetForm = document.getElementById('ac-signup-bottom');
      if (targetForm) {
        smoothScrollTo(targetForm, 100);
        const input = targetForm.querySelector('input[type="email"]');
        if (input) {
          setTimeout(() => {
            input.focus();
          }, 900);
        }
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && premiumModal?.classList.contains('open')) {
      closePremiumModal();
    }
  });
});

// =====================================================
// FAQ ANIMATION FUNCTION
// =====================================================
function initFAQAnimations() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  let animatedIndex = 0;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (
        entry.isIntersecting &&
        !entry.target.classList.contains('animate-in')
      ) {
        const delay = animatedIndex * 180;
        animatedIndex++;

        setTimeout(() => {
          entry.target.classList.add('animate-in');
        }, delay);

        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '200px',
    threshold: 0.05
  });

  // Observe all items
  faqItems.forEach(item => observer.observe(item));

  // Check items already visible on page load immediately
  function checkInitialVisibility() {
    faqItems.forEach((item, index) => {
      if (!item.classList.contains('animate-in')) {
        const rect = item.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const isVisible = rect.top < windowHeight + 300 && rect.bottom > -300;
        
        if (isVisible) {
          const delay = animatedIndex * 180;
          animatedIndex++;
          setTimeout(() => {
            item.classList.add('animate-in');
          }, delay);
          observer.unobserve(item);
        }
      }
    });
  }

  // Check immediately and after a delay
  checkInitialVisibility();
  setTimeout(checkInitialVisibility, 100);
  setTimeout(checkInitialVisibility, 500);

  // Fallback: Show all items after 2 seconds if still hidden
  setTimeout(() => {
    faqItems.forEach((item, index) => {
      if (!item.classList.contains('animate-in')) {
        const delay = index * 180;
        setTimeout(() => {
          item.classList.add('animate-in');
        }, delay);
      }
    });
  }, 2000);
}

// Also initialize immediately if DOM is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initFAQAnimations, 100);
}

// =====================================================
// SCROLL REVEAL – smooth animations on scroll (all pages)
// iOS Safari: -webkit prefixes in CSS + scroll fallback so animations run
// =====================================================
function initScrollReveal() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.querySelectorAll('.scroll-reveal').forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const elements = document.querySelectorAll('.scroll-reveal');
  if (!elements.length) return;

  function reveal(el) {
    if (el.classList.contains('is-visible')) return;
    el.classList.add('is-visible');
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    const margin = 120;
    const h = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < h + margin && rect.bottom > -margin;
  }

  // More generous rootMargin helps Intersection Observer fire on iOS Safari
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { root: null, rootMargin: '80px 0px -40px 0px', threshold: 0 }
  );

  elements.forEach((el) => {
    const delay = el.getAttribute('data-reveal-delay');
    if (delay != null) el.style.setProperty('--reveal-delay', String(delay));
    observer.observe(el);
  });

  // Reveal elements already in view on load
  function checkInView() {
    elements.forEach((el) => {
      if (isInViewport(el)) reveal(el);
    });
  }

  requestAnimationFrame(checkInView);
  setTimeout(checkInView, 100);
  setTimeout(checkInView, 400);

  // iOS Safari: Intersection Observer can be flaky; scroll/resize fallback so reveals still run
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    var scrollFallback = function () {
      elements.forEach((el) => {
        if (el.classList.contains('is-visible')) return;
        if (isInViewport(el)) reveal(el);
      });
    };
    window.addEventListener('scroll', scrollFallback, { passive: true });
    window.addEventListener('resize', scrollFallback);
    setTimeout(scrollFallback, 600);
  }
}

function runScrollReveal() {
  try {
    initScrollReveal();
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('Scroll reveal error:', err);
    }
  }
}

// Run as soon as script executes (DOM is ready when script is at end of body)
runScrollReveal();
// Also run when DOM is officially ready (in case script was deferred or moved)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runScrollReveal);
} else {
  document.addEventListener('DOMContentLoaded', runScrollReveal);
}
// Fallback: run on full page load
window.addEventListener('load', runScrollReveal);

// Expose for inline fallback
window.initScrollReveal = initScrollReveal;

// =====================================================
// PAGE INTRO – 3s white screen + title + trompette, then fade in rest (index only)
// =====================================================
(function initPageIntro() {
  var intro = document.getElementById('page-intro');
  if (!intro) return;
  var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.body.classList.add('intro-complete');
    return;
  }
  setTimeout(function() {
    document.body.classList.add('intro-complete');
  }, 3000);
})();