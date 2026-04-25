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
  // COMING SOON LINKS
  // =====================================================
  const comingSoonLinks = document.querySelectorAll('[data-coming-soon-message]');

  comingSoonLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const message =
        link.getAttribute('data-coming-soon-message') ||
        'Cette fonctionnalite sera disponible prochainement.';
      window.alert(message);
    });
  });

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
  // TESTIMONIAL CAROUSEL – 3D arc desktop, swipe mobile, infinite loop
  // =====================================================
  (function initTestimonialCarousel() {
    const viewport = document.getElementById('testimonial-viewport');
    const dotsContainer = document.getElementById('testimonial-dots');
    const prevButton = document.getElementById('testimonial-prev');
    const nextButton = document.getElementById('testimonial-next');
    if (!viewport || !dotsContainer || !prevButton || !nextButton) return;

    const slides = Array.from(viewport.querySelectorAll('.testimonial-slide'));
    const slideCount = slides.length;
    if (!slideCount) return;

    let currentIndex = 0;
    let autoAdvanceInterval = null;
    let resumeTimeout = null;
    let gestureStartX = 0;
    let gestureStartY = 0;
    let gestureCurrentX = 0;
    let gestureCurrentY = 0;
    let gestureActive = false;

    dotsContainer.innerHTML = '';
    const dots = slides.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot';
      dot.setAttribute('aria-label', 'Aller au témoignage ' + (index + 1));
      dot.addEventListener('click', function () {
        goToSlide(index, true);
      });
      dotsContainer.appendChild(dot);
      return dot;
    });

    function isMobileView() {
      return window.innerWidth < 768;
    }

    function getRelativeOffset(index) {
      let offset = index - currentIndex;
      const half = Math.floor(slideCount / 2);

      if (offset > half) offset -= slideCount;
      if (offset < -half) offset += slideCount;

      return offset;
    }

    function syncViewportHeight() {
      const activeSlide = slides[currentIndex];
      if (!activeSlide) return;
      viewport.style.height = activeSlide.offsetHeight + 'px';
    }

    function updateDots() {
      dots.forEach(function (dot, index) {
        dot.classList.toggle('active', index === currentIndex);
        dot.setAttribute('aria-current', index === currentIndex ? 'true' : 'false');
      });
    }

    function updateSlides() {
      const mobile = isMobileView();

      slides.forEach(function (slide, index) {
        const offset = getRelativeOffset(index);
        slide.classList.remove(
          'is-active',
          'is-prev',
          'is-next',
          'is-hidden-left',
          'is-hidden-right',
          'is-mobile-hidden'
        );

        if (mobile) {
          if (offset === 0) {
            slide.classList.add('is-active');
            slide.removeAttribute('aria-hidden');
          } else {
            slide.classList.add('is-mobile-hidden');
            slide.setAttribute('aria-hidden', 'true');
          }
          return;
        }

        slide.removeAttribute('aria-hidden');

        if (offset === 0) {
          slide.classList.add('is-active');
        } else if (offset === -1) {
          slide.classList.add('is-prev');
        } else if (offset === 1) {
          slide.classList.add('is-next');
        } else if (offset < 0) {
          slide.classList.add('is-hidden-left');
          slide.setAttribute('aria-hidden', 'true');
        } else {
          slide.classList.add('is-hidden-right');
          slide.setAttribute('aria-hidden', 'true');
        }
      });

      updateDots();
      requestAnimationFrame(syncViewportHeight);
    }

    function stopAutoAdvanceTemporarily() {
      if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
        autoAdvanceInterval = null;
      }

      if (resumeTimeout) clearTimeout(resumeTimeout);
      resumeTimeout = setTimeout(startAutoAdvance, 5000);
    }

    function goToSlide(index, userInitiated) {
      currentIndex = (index + slideCount) % slideCount;
      updateSlides();

      if (userInitiated) {
        stopAutoAdvanceTemporarily();
      }
    }

    function nextSlide(userInitiated) {
      goToSlide(currentIndex + 1, userInitiated);
    }

    function previousSlide(userInitiated) {
      goToSlide(currentIndex - 1, userInitiated);
    }

    function startAutoAdvance() {
      if (autoAdvanceInterval) clearInterval(autoAdvanceInterval);
      autoAdvanceInterval = setInterval(function () {
        nextSlide(false);
      }, 5000);
    }

    prevButton.addEventListener('click', function () {
      previousSlide(true);
    });

    nextButton.addEventListener('click', function () {
      nextSlide(true);
    });

    viewport.addEventListener('mouseenter', stopAutoAdvanceTemporarily);
    viewport.addEventListener('focusin', stopAutoAdvanceTemporarily);

    function beginGesture(x, y) {
      gestureStartX = x;
      gestureStartY = y;
      gestureCurrentX = x;
      gestureCurrentY = y;
      gestureActive = true;
      stopAutoAdvanceTemporarily();
    }

    function updateGesture(x, y) {
      if (!gestureActive) return;
      gestureCurrentX = x;
      gestureCurrentY = y;
    }

    function endGesture(x, y) {
      if (!gestureActive) return;

      gestureCurrentX = typeof x === 'number' ? x : gestureCurrentX;
      gestureCurrentY = typeof y === 'number' ? y : gestureCurrentY;

      const deltaX = gestureCurrentX - gestureStartX;
      const deltaY = gestureCurrentY - gestureStartY;

      if (Math.abs(deltaX) >= 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          nextSlide(true);
        } else {
          previousSlide(true);
        }
      }

      gestureActive = false;
    }

    viewport.addEventListener('pointerdown', function (event) {
      if (!isMobileView()) return;
      beginGesture(event.clientX, event.clientY);
    });

    viewport.addEventListener('pointermove', function (event) {
      if (!isMobileView()) return;
      updateGesture(event.clientX, event.clientY);
    });

    viewport.addEventListener('pointerup', function (event) {
      if (!isMobileView()) return;
      endGesture(event.clientX, event.clientY);
    });

    viewport.addEventListener('pointercancel', function () {
      gestureActive = false;
    });

    viewport.addEventListener('touchstart', function (event) {
      if (!isMobileView()) return;
      const touch = event.changedTouches[0];
      beginGesture(touch.clientX, touch.clientY);
    }, { passive: true });

    viewport.addEventListener('touchmove', function (event) {
      if (!isMobileView()) return;
      const touch = event.changedTouches[0];
      updateGesture(touch.clientX, touch.clientY);
    }, { passive: true });

    viewport.addEventListener('touchend', function (event) {
      if (!isMobileView()) return;
      const touch = event.changedTouches[0];
      endGesture(touch.clientX, touch.clientY);
    }, { passive: true });

    viewport.addEventListener('touchcancel', function () {
      gestureActive = false;
    }, { passive: true });

    window.addEventListener('resize', function () {
      updateSlides();
    });

    updateSlides();
    startAutoAdvance();
  })();

  // =====================================================
  // PREMIUM DEALS CAROUSEL – drag/swipe horizontal showcase
  // =====================================================
  function initPremiumDealsCarouselInstance(options) {
    const viewport = document.getElementById(options.viewportId);
    const track = document.getElementById(options.trackId);
    const dotsContainer = document.getElementById(options.dotsId);
    const prevButton = document.getElementById(options.prevButtonId);
    const nextButton = document.getElementById(options.nextButtonId);
    const forceRebuild = !!options.forceRebuild;
    if (!viewport || !track || !dotsContainer || !prevButton || !nextButton) return;
    if (viewport.dataset.carouselReady === 'true' && !forceRebuild) return;

    const cards = Array.from(track.querySelectorAll('.premium-deal-card'));
    if (!cards.length) return;
    if (viewport.dataset.carouselAutoplayTimer) {
      window.clearInterval(Number(viewport.dataset.carouselAutoplayTimer));
      delete viewport.dataset.carouselAutoplayTimer;
    }

    let currentIndex = 0;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;
    let isDragging = false;
    let hasDragged = false;
    let activePointerId = null;
    let scrollTicking = false;

    dotsContainer.innerHTML = '';
    viewport.dataset.carouselReady = 'true';
    const dots = cards.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Aller a l offre ' + (index + 1));
      dot.addEventListener('click', () => {
        applyIndex(index, true);
        restartAutoplay();
      });
      dotsContainer.appendChild(dot);
      return dot;
    });

    function isMobileView() {
      return window.innerWidth < 768;
    }

    function shouldAutoplay() {
      return !isMobileView()
        && cards.length > 1
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function updateDots() {
      dots.forEach((dot, index) => {
        const isActive = index === currentIndex;
        dot.classList.toggle('is-active', isActive);
        dot.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    }

    function updateCards() {
      const half = Math.floor(cards.length / 2);

      cards.forEach((card, index) => {
        let offset = index - currentIndex;
        if (offset > half) offset -= cards.length;
        if (offset < -half) offset += cards.length;

        card.classList.remove(
          'is-active',
          'is-prev',
          'is-next',
          'is-far-prev',
          'is-far-next',
          'is-off-left',
          'is-off-right'
        );

        if (isMobileView()) {
          card.classList.toggle('is-active', index === currentIndex);
          return;
        }

        if (offset === 0) {
          card.classList.add('is-active');
        } else if (offset === -1) {
          card.classList.add('is-prev');
        } else if (offset === 1) {
          card.classList.add('is-next');
        } else if (offset === -2) {
          card.classList.add('is-far-prev');
        } else if (offset === 2) {
          card.classList.add('is-far-next');
        } else if (offset < 0) {
          card.classList.add('is-off-left');
        } else {
          card.classList.add('is-off-right');
        }
      });
    }

    function updateButtons() {
      const disabled = cards.length <= 1;
      prevButton.disabled = disabled;
      nextButton.disabled = disabled;
    }

    function getScrollTarget(index) {
      const card = cards[index];
      if (!card) return 0;
      const centeredOffset = card.offsetLeft - Math.max(0, (viewport.clientWidth - card.offsetWidth) / 2);
      return Math.max(0, centeredOffset);
    }

    function applyIndex(index, animate = true) {
      currentIndex = Math.max(0, Math.min(cards.length - 1, index));
      updateCards();
      updateDots();
      updateButtons();
      viewport.scrollTo({
        left: getScrollTarget(currentIndex),
        behavior: animate ? 'smooth' : 'auto',
      });
    }

    function stopAutoplay() {
      if (!viewport.dataset.carouselAutoplayTimer) return;
      window.clearInterval(Number(viewport.dataset.carouselAutoplayTimer));
      delete viewport.dataset.carouselAutoplayTimer;
    }

    function startAutoplay() {
      stopAutoplay();
      if (!shouldAutoplay()) return;
      const timer = window.setInterval(() => {
        if (document.hidden || isDragging) return;
        const nextIndex = currentIndex >= cards.length - 1 ? 0 : currentIndex + 1;
        applyIndex(nextIndex, true);
      }, 3600);
      viewport.dataset.carouselAutoplayTimer = String(timer);
    }

    function restartAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    function getNearestIndex() {
      const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      return bestIndex;
    }

    function startDrag(clientX, pointerId) {
      isDragging = true;
      hasDragged = false;
      activePointerId = pointerId;
      dragStartX = clientX;
      dragStartScrollLeft = viewport.scrollLeft;
      viewport.classList.add('is-dragging');
    }

    function moveDrag(clientX) {
      if (!isDragging) return;
      const delta = clientX - dragStartX;
      if (Math.abs(delta) > 4) hasDragged = true;
      viewport.scrollLeft = dragStartScrollLeft - delta;
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      activePointerId = null;
      viewport.classList.remove('is-dragging');
      applyIndex(getNearestIndex(), true);
    }

    function syncFromScroll() {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        currentIndex = getNearestIndex();
        updateCards();
        updateDots();
        updateButtons();
        scrollTicking = false;
      });
    }

    prevButton.onclick = () => {
      applyIndex(currentIndex <= 0 ? cards.length - 1 : currentIndex - 1, true);
      restartAutoplay();
    };
    nextButton.onclick = () => {
      applyIndex(currentIndex >= cards.length - 1 ? 0 : currentIndex + 1, true);
      restartAutoplay();
    };

    viewport.onpointerdown = (event) => {
      if (event.button !== 0 || isMobileView()) return;
      stopAutoplay();
      startDrag(event.clientX, event.pointerId);
      viewport.setPointerCapture(event.pointerId);
    };

    viewport.onpointermove = (event) => {
      if (!isDragging || event.pointerId !== activePointerId) return;
      moveDrag(event.clientX);
    };

    viewport.onpointerup = (event) => {
      if (event.pointerId !== activePointerId) return;
      endDrag();
      restartAutoplay();
    };

    viewport.onpointercancel = () => {
      endDrag();
      restartAutoplay();
    };
    viewport.onmouseleave = () => {
      if (isDragging) {
        endDrag();
      }
      startAutoplay();
    };

    viewport.onmouseenter = stopAutoplay;
    viewport.onfocusin = stopAutoplay;
    viewport.onfocusout = startAutoplay;

    viewport.onclick = (event) => {
      if (!hasDragged) return;
      event.preventDefault();
      event.stopPropagation();
      hasDragged = false;
    };

    viewport.onscroll = syncFromScroll;

    if (!window.__premiumDealsCarouselResizeBound) {
      window.addEventListener('resize', () => {
        if (typeof window.initPremiumDealsCarousel === 'function') {
          window.initPremiumDealsCarousel(true);
        }
        if (typeof window.initHomePremiumDealsCarousel === 'function') {
          window.initHomePremiumDealsCarousel(true);
        }
      });
      window.__premiumDealsCarouselResizeBound = true;
    }

    applyIndex(0, false);
    startAutoplay();
  }

  window.initPremiumDealsCarousel = function initPremiumDealsCarousel(forceRebuild) {
    initPremiumDealsCarouselInstance({
      viewportId: 'premium-deals-viewport',
      trackId: 'premium-deals-track',
      dotsId: 'premium-deals-dots',
      prevButtonId: 'premium-deals-prev',
      nextButtonId: 'premium-deals-next',
      forceRebuild,
    });
  };

  window.initHomePremiumDealsCarousel = function initHomePremiumDealsCarousel(forceRebuild) {
    initPremiumDealsCarouselInstance({
      viewportId: 'home-premium-deals-viewport',
      trackId: 'home-premium-deals-track',
      dotsId: 'home-premium-deals-dots',
      prevButtonId: 'home-premium-deals-prev',
      nextButtonId: 'home-premium-deals-next',
      forceRebuild,
    });
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatOfferDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('fr-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  (function initHomePremiumOffersCarousel() {
    const track = document.getElementById('home-premium-deals-track');
    const dots = document.getElementById('home-premium-deals-dots');
    const prevButton = document.getElementById('home-premium-deals-prev');
    const nextButton = document.getElementById('home-premium-deals-next');
    if (!track) return;

    function renderOffers(offers) {
      if (!Array.isArray(offers) || !offers.length) return renderError();
      track.classList.remove('premium-deals-track--loading');
      track.innerHTML = offers.map((offer) => {
        const meta = [offer.venue, formatOfferDate(offer.event_date)].filter(Boolean).join(' · ');
        return (
          '<article class="premium-deal-card">' +
            '<img src="' + escapeHtml(offer.image_url || 'assets/premium_image.avif') + '" alt="' + escapeHtml(offer.title || '') + '" onerror="this.onerror=null;this.src=\'assets/premium_image.avif\';" />' +
            '<div class="premium-deal-card-body">' +
              '<div class="premium-deal-tags">' +
                '<p class="premium-deal-tag">' + escapeHtml(offer.region || '') + '</p>' +
                (offer.offer_type ? '<p class="premium-deal-tag premium-deal-tag--secondary">' + escapeHtml(offer.offer_type) + '</p>' : '') +
              '</div>' +
              '<h3>' + escapeHtml(offer.title || '') + '</h3>' +
              (meta ? '<p class="premium-deal-meta premium-deal-meta--public">' + escapeHtml(meta) + '</p>' : '') +
            '</div>' +
          '</article>'
        );
      }).join('');
      window.initHomePremiumDealsCarousel(true);
    }

    function renderError() {
      track.classList.remove('premium-deals-track--loading');
      track.innerHTML =
        '<article class="premium-deal-card premium-deal-card--loading premium-deal-card--message">' +
          '<div class="premium-deal-loading">' +
            '<img class="premium-deal-loading-logo" src="assets/trompette.avif" alt="" />' +
            '<p class="premium-deal-loading-kicker">Offres premium</p>' +
            '<p>Les offres premium arrivent dans un instant.</p>' +
          '</div>' +
        '</article>';
      if (dots) dots.innerHTML = '';
      if (prevButton) prevButton.disabled = true;
      if (nextButton) nextButton.disabled = true;
    }

    fetch('/.netlify/functions/list-public-premium-offers')
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error((data && data.error) || 'Erreur de chargement');
        renderOffers(data && data.offers);
      })
      .catch((error) => {
        console.error('Home premium offers load error:', error);
        renderError();
      });
  })();

  window.initPremiumDealsCarousel();

  // =====================================================
  // FAQ SCROLL ANIMATION (STAGGERED + RELIABLE)
  // =====================================================
  // Initialize FAQ animations after a brief delay to ensure CSS is loaded
  setTimeout(initFAQAnimations, 100);

  // =====================================================
  // SMOOTH SCROLL FOR "JE M'INSCRIS" BUTTON
  // =====================================================
  function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function smoothScrollTo(targetEl, offset = 100) {
    if (!targetEl) return;
    const targetPosition = targetEl.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({
      top: Math.max(0, targetPosition),
      behavior: 'smooth',
    });
  }

  const jeMinscrisBtn = document.getElementById('je-minscris-btn');
  if (jeMinscrisBtn) {
    jeMinscrisBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('contact-form') || document.querySelector('.cta');
      if (target) {
        smoothScrollTo(target, 100);
        const input = target.querySelector('input[type="email"]');
        if (input && !isMobileViewport()) {
          setTimeout(() => {
            input.focus();
          }, 700);
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
      if (input && !isMobileViewport()) {
        setTimeout(() => {
          input.focus();
        }, 700);
      }
    });
  }

  // =====================================================
  // ACTIVE CAMPAIGN SIGNUP (TOP + BOTTOM FORMS)
  // =====================================================
  const fallbackFreeSignupLocations = [
    {
      id: 'montreal',
      label: 'Montréal',
      u: '1',
      f: '1',
      s: '',
      c: '0',
      m: '0',
      act: 'sub',
      v: '2',
      or: '3984880d-52e1-445d-99b0-09aeef208544',
      is_default: true,
    },
    {
      id: 'quebec',
      label: 'Québec',
      u: '69ED120690823',
      f: '9',
      s: '',
      c: '0',
      m: '0',
      act: 'sub',
      v: '2',
      or: '0b035bc1-fee2-41ea-b49c-c65e19a08016',
      is_default: false,
    },
    {
      id: 'trois_rivieres',
      label: 'Trois-Rivières',
      u: '69ED1206F0DD6',
      f: '11',
      s: '',
      c: '0',
      m: '0',
      act: 'sub',
      v: '2',
      or: '77d982e4-b8c2-4a43-b59a-d54646f9c9ee',
      is_default: false,
    },
    {
      id: 'sherbrooke',
      label: 'Sherbrooke',
      u: '69ED12076A999',
      f: '13',
      s: '',
      c: '0',
      m: '0',
      act: 'sub',
      v: '2',
      or: 'cbe7d463-4a76-4436-9d41-64003c44e753',
      is_default: false,
    },
  ];
  const freeSignupForms = Array.from(document.querySelectorAll('form[data-free-signup-form="true"]'));
  const freeSignupLocationSelects = Array.from(document.querySelectorAll('[data-free-signup-location]'));
  let freeSignupLocations = fallbackFreeSignupLocations.slice();

  function getDefaultFreeSignupLocation() {
    return freeSignupLocations.find((item) => item.is_default) || freeSignupLocations[0] || null;
  }

  function renderFreeSignupLocationOptions(selectedId) {
    if (!freeSignupLocationSelects.length) return;
    const fallbackSelected = selectedId || (getDefaultFreeSignupLocation() && getDefaultFreeSignupLocation().id) || 'montreal';
    freeSignupLocationSelects.forEach(function (select) {
      select.innerHTML = freeSignupLocations.map(function (item) {
        return '<option value="' + item.id + '">' + item.label + '</option>';
      }).join('');
      select.value = freeSignupLocations.some(function (item) { return item.id === fallbackSelected; })
        ? fallbackSelected
        : (getDefaultFreeSignupLocation() ? getDefaultFreeSignupLocation().id : '');
    });
  }

  function applyFreeSignupLocation(locationId) {
    const location = freeSignupLocations.find(function (item) { return item.id === locationId; }) || getDefaultFreeSignupLocation();
    if (!location) return;

    freeSignupLocationSelects.forEach(function (select) {
      select.value = location.id;
    });

    freeSignupForms.forEach(function (form) {
      Array.from(form.querySelectorAll('[data-signup-config]')).forEach(function (input) {
        const key = input.getAttribute('data-signup-config');
        input.value = location[key] || '';
      });
    });
  }

  async function initFreeSignupLocations() {
    if (!freeSignupForms.length || !freeSignupLocationSelects.length) return;

    renderFreeSignupLocationOptions();
    applyFreeSignupLocation((getDefaultFreeSignupLocation() || {}).id);

    freeSignupLocationSelects.forEach(function (select) {
      select.addEventListener('change', function () {
        applyFreeSignupLocation(select.value);
      });
    });

    try {
      const response = await fetch('/.netlify/functions/list-free-signup-locations');
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !Array.isArray(data.locations) || !data.locations.length) return;

      freeSignupLocations = data.locations
        .map(function (item) {
          return {
            id: String(item.id || '').trim(),
            label: String(item.label || '').trim(),
            u: String(item.u || '').trim(),
            f: String(item.f || '').trim(),
            s: String(item.s || '').trim(),
            c: String(item.c || '0').trim(),
            m: String(item.m || '0').trim(),
            act: String(item.act || 'sub').trim(),
            v: String(item.v || '2').trim(),
            or: String(item.or || '').trim(),
            is_default: !!item.is_default,
          };
        })
        .filter(function (item) {
          return item.id && item.label && item.u && item.f && item.or;
        });

      if (!freeSignupLocations.length) {
        freeSignupLocations = fallbackFreeSignupLocations.slice();
      }

      renderFreeSignupLocationOptions();
      applyFreeSignupLocation((getDefaultFreeSignupLocation() || {}).id);
    } catch (error) {
      console.error('Free signup locations load error:', error);
    }
  }

  initFreeSignupLocations();

  const formFeedbackTimeouts = new WeakMap();

  function setFormFeedback(form, message, type = 'info') {
    const feedback = form.querySelector('.form-feedback');
    if (!feedback) return;
    
    // Keep timeout state scoped per form to avoid cross-form interference
    const existingTimeout = formFeedbackTimeouts.get(form);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      formFeedbackTimeouts.delete(form);
    }
    
    feedback.textContent = message || '';
    feedback.classList.toggle('is-error', type === 'error');
    
    // Auto-dismiss after 15 seconds if there's a message
    if (message) {
      const timeoutId = setTimeout(() => {
        feedback.textContent = '';
        feedback.classList.remove('is-error');
      }, 5000);
      formFeedbackTimeouts.set(form, timeoutId);
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

        if (data && data.alreadyRegistered) {
          setFormFeedback(form, "Cette adresse est déjà inscrite à notre liste. Tu recevras nos prochains emails.", 'error');
        } else if (response.ok && isActiveCampaignSuccess(data)) {
          setFormFeedback(form, "Merci ! Un email de confirmation t'a été envoyé. Clique sur le lien dans le message pour confirmer ton inscription et rejoindre la liste.");
          if (emailInput) emailInput.value = '';
        } else if (response.ok && data) {
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
  // PREMIUM CHECKOUT
  // =====================================================
  const premiumButton = document.getElementById('premium-button');
  const premiumModal = document.getElementById('premium-modal');
  const premiumClose = premiumModal?.querySelector('.modal-close');
  const premiumModalSignup = document.getElementById('premium-modal-signup');
  const premiumCheckoutButtons = Array.from(document.querySelectorAll('[data-stripe-plan]'));

  function normalizeStripeReturnPath(pathname) {
    if (pathname === '/' || pathname === '/index.html') return '/index.html';
    if (pathname === '/premium.html') return pathname;
    return '/premium.html';
  }

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

  async function startStripeCheckout(button) {
    const planKey = button?.getAttribute('data-stripe-plan');
    const fallbackUrl = button?.getAttribute('data-stripe-fallback-url');
    if (!planKey) return;

    sessionStorage.setItem('stripeCheckoutPending', '1');
    sessionStorage.setItem('stripeCheckoutReturnPath', normalizeStripeReturnPath(window.location.pathname));
    sessionStorage.removeItem('stripeCheckoutReloaded');

    try {
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planKey,
          returnPath: normalizeStripeReturnPath(window.location.pathname),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        throw new Error(data.error || data.details || 'Impossible de lancer le paiement.');
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Stripe checkout error:', error);
      sessionStorage.removeItem('stripeCheckoutPending');
      sessionStorage.removeItem('stripeCheckoutReloaded');
      sessionStorage.removeItem('stripeCheckoutReturnPath');
      if (fallbackUrl) {
        window.location.href = fallbackUrl;
        return;
      }
      window.alert("Le paiement ne peut pas etre lance pour le moment. Reessaie dans quelques instants.");
    }
  }

  function resetPremiumCheckoutButtons() {
    premiumCheckoutButtons.forEach((button) => {
      button.disabled = false;
    });
  }

  function completeStripeReturnCleanup(currentUrl) {
    const url = currentUrl || new URL(window.location.href);
    sessionStorage.removeItem('stripeCheckoutPending');
    sessionStorage.removeItem('stripeCheckoutReloaded');
    sessionStorage.removeItem('stripeCheckoutReturnPath');
    document.documentElement.classList.remove('stripe-return-reload-pending');
    resetPremiumCheckoutButtons();

    if (url.searchParams.get('canceled') === 'true') {
      url.searchParams.delete('canceled');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }
  }

  function triggerSmoothStripeReload() {
    if (sessionStorage.getItem('stripeCheckoutPending') !== '1') return;

    const currentUrl = new URL(window.location.href);
    const currentPath = normalizeStripeReturnPath(currentUrl.pathname);
    const storedReturnPath = normalizeStripeReturnPath(sessionStorage.getItem('stripeCheckoutReturnPath') || '');
    const isPremiumConfirmationPage =
      currentUrl.pathname.endsWith('/premium-confirmation.html') ||
      currentUrl.pathname.endsWith('premium-confirmation.html');
    const shouldReloadSourcePage = storedReturnPath === currentPath && !isPremiumConfirmationPage;
    const hasReloadedAfterStripeReturn = sessionStorage.getItem('stripeCheckoutReloaded') === '1';

    if (!shouldReloadSourcePage) {
      completeStripeReturnCleanup(currentUrl);
      return;
    }

    if (hasReloadedAfterStripeReturn) {
      completeStripeReturnCleanup(currentUrl);
      return;
    }

    sessionStorage.setItem('stripeCheckoutReloaded', '1');
    document.documentElement.classList.add('stripe-return-reload-pending');
    document.body.classList.add('page-exiting');
    resetPremiumCheckoutButtons();

    if (overlay && !prefersReducedMotion) {
      overlay.classList.remove('exit');
      overlay.classList.add('active');
    }

    window.setTimeout(() => {
      window.location.reload();
    }, prefersReducedMotion ? 0 : 180);
  }

  if (premiumButton) {
    premiumButton.addEventListener('click', (e) => {
      e.preventDefault();
      startStripeCheckout(premiumButton);
    });
  }

  premiumCheckoutButtons.forEach((button) => {
    if (button === premiumButton) return;
    button.addEventListener('click', (e) => {
      e.preventDefault();
      startStripeCheckout(button);
    });
  });

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

  window.addEventListener('pageshow', triggerSmoothStripeReload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') triggerSmoothStripeReload();
  });
  window.addEventListener('focus', triggerSmoothStripeReload);
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
    document.body.classList.add('intro-fading');
  }, 2550);
  setTimeout(function() {
    document.body.classList.add('intro-complete');
  }, 3225);
})();
