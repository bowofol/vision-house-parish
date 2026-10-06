(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const header = document.querySelector('.site-header');
  const menuToggle = document.querySelector('.menu-toggle');
  const siteNav = document.querySelector('.site-nav');
  const desktopQuery = window.matchMedia('(min-width: 1024px)');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let heroIntroTimer;

  const finishHeroIntro = () => {
    document.documentElement.classList.remove('hero-intro');
    window.clearTimeout(heroIntroTimer);
    heroIntroTimer = undefined;
  };

  if (!motionQuery.matches) {
    document.documentElement.classList.add('hero-intro');
    heroIntroTimer = window.setTimeout(finishHeroIntro, 1500);
  }

  const closeMenu = ({ returnFocus = false } = {}) => {
    if (!siteNav || !menuToggle) return;
    const wasOpen = siteNav.classList.contains('open');
    siteNav.classList.remove('open');
    document.body.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
    if (returnFocus && wasOpen) menuToggle.focus();
  };

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = !siteNav.classList.contains('open');
      siteNav.classList.toggle('open', isOpen);
      document.body.classList.toggle('menu-open', isOpen);
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });

    siteNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (event) => {
        const wasOpen = siteNav.classList.contains('open');
        closeMenu();
        if (!wasOpen || event.defaultPrevented || event.button !== 0 || event.metaKey ||
            event.ctrlKey || event.shiftKey || event.altKey || link.hash.length < 2) return;
        const destination = document.getElementById(link.hash.slice(1));
        if (!destination) return;
        if (!destination.hasAttribute('tabindex')) {
          destination.setAttribute('tabindex', '-1');
          destination.addEventListener('blur', () => destination.removeAttribute('tabindex'), { once: true });
        }
        destination.focus({ preventScroll: true });
      });
    });

    document.addEventListener('click', (event) => {
      if (!siteNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });

    document.addEventListener('focusin', (event) => {
      if (siteNav.classList.contains('open') && !siteNav.contains(event.target) &&
          !menuToggle.contains(event.target) && !header?.contains(event.target)) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && siteNav.classList.contains('open')) {
        closeMenu({ returnFocus: true });
      }
    });

    const handleDesktopChange = (event) => {
      if (event.matches) closeMenu();
    };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', handleDesktopChange);
    else desktopQuery.addListener(handleDesktopChange);
  }

  if (header) {
    let scrollFramePending = false;
    const updateHeader = () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
      scrollFramePending = false;
    };
    updateHeader();
    window.addEventListener('scroll', () => {
      if (!scrollFramePending) {
        scrollFramePending = true;
        window.requestAnimationFrame(updateHeader);
      }
    }, { passive: true });
  }

  const sectionLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')]
    .filter((link) => link.hash.length > 1);
  const linkedSections = sectionLinks.map((link) => ({
    link,
    section: document.getElementById(link.hash.slice(1))
  })).filter(({ section }) => section);

  const setActiveSection = (id) => {
    linkedSections.forEach(({ link, section }) => {
      const isActive = section.id === id;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  linkedSections.forEach(({ link, section }) => {
    link.addEventListener('click', () => setActiveSection(section.id));
  });

  if ('IntersectionObserver' in window && linkedSections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveSection(entry.target.id);
      });
    }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
    linkedSections.forEach(({ section }) => sectionObserver.observe(section));
  }

  const revealElements = [...document.querySelectorAll('.reveal')];
  const revealOrder = new Map(revealElements.map((element, index) => [element, index]));
  const revealGroups = new Map();
  const revealLayout = new Map();
  const programmeRevealStarts = new WeakMap();
  let revealObserver;
  let revealResizeObserver;
  let revealResizeFrame;

  const showReveal = (element, delay = 0, immediate = false) => {
    element.style.setProperty('--reveal-delay', `${immediate ? 0 : delay}ms`);
    element.classList.toggle('reveal-immediate', immediate);
    element.classList.add('visible');
    element.classList.remove('reveal-pending');
    revealObserver?.unobserve(element);
  };

  const showAllReveals = () => {
    revealObserver?.disconnect();
    revealResizeObserver?.disconnect();
    revealElements.forEach((element) => showReveal(element, 0, true));
  };

  // Read row positions only during setup or a layout resize, never on scroll.
  const updateRevealRows = () => {
    revealGroups.forEach((elements, group) => {
      const step = Math.min(120, Math.max(0, Number(group.dataset.stagger) || 80));
      const rows = [...elements].sort((a, b) =>
        a.offsetTop - b.offsetTop || revealOrder.get(a) - revealOrder.get(b));
      let row = -1;
      let rowTop = -Infinity;
      rows.forEach((element) => {
        if (Math.abs(element.offsetTop - rowTop) > 12) {
          row += 1;
          rowTop = element.offsetTop;
        }
        revealLayout.set(element, {
          group,
          row: group.dataset.staggerMode === 'batch' ? 'batch' : row,
          step,
          maxDelay: step * 3,
          sequential: step === 120 && group.classList.contains('schedule')
        });
      });
    });
  };

  revealElements.forEach((element) => {
    const group = element.closest('[data-reveal-group]');
    if (!group || group === element) return;
    if (!revealGroups.has(group)) revealGroups.set(group, []);
    revealGroups.get(group).push(element);
  });

  if ('IntersectionObserver' in window && !motionQuery.matches) {
    try {
      updateRevealRows();
      revealObserver = new IntersectionObserver((entries) => {
        try {
          const batches = new Map();
          entries.forEach(({ target, isIntersecting }) => {
            if (!isIntersecting || target.classList.contains('visible')) return;
            const layout = revealLayout.get(target);
            const group = layout?.group || target;
            if (!batches.has(group)) batches.set(group, new Map());
            const groupBatches = batches.get(group);
            const row = layout?.row ?? 0;
            if (!groupBatches.has(row)) groupBatches.set(row, []);
            groupBatches.get(row).push(target);
          });
          batches.forEach((groupBatches) => {
            groupBatches.forEach((elements) => {
              elements.sort((a, b) => revealOrder.get(a) - revealOrder.get(b));
              const now = window.performance.now();
              elements.forEach((element, index) => {
                const layout = revealLayout.get(element);
                const step = layout?.step || 0;
                let delay = Math.min(index * step, layout?.maxDelay || 0);
                if (layout?.sequential) {
                  // Keep programme order across fast-scroll observer batches.
                  const lastStart = programmeRevealStarts.get(layout.group);
                  delay = Math.min(Math.max(0, (lastStart ?? now - step) + step - now), layout.maxDelay);
                  programmeRevealStarts.set(layout.group, now + delay);
                }
                showReveal(element, delay);
              });
            });
          });
        } catch {
          showAllReveals();
        }
      }, { threshold: 0.08, rootMargin: '0px 0px 32px 0px' });

      revealElements.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        // Keep initially visible and already-passed content readable immediately.
        if (bounds.top < window.innerHeight + 32 || bounds.height === 0) {
          showReveal(element, 0, true);
        } else {
          revealObserver.observe(element);
          element.classList.add('reveal-pending');
        }
      });

      if ('ResizeObserver' in window) {
        revealResizeObserver = new ResizeObserver(updateRevealRows);
        revealGroups.forEach((_, group) => revealResizeObserver.observe(group));
      } else {
        window.addEventListener('resize', () => {
          if (revealResizeFrame || motionQuery.matches) return;
          revealResizeFrame = window.requestAnimationFrame(() => {
            updateRevealRows();
            revealResizeFrame = undefined;
          });
        }, { passive: true });
      }
    } catch {
      // Observer support or setup failure must never leave content hidden.
      showAllReveals();
    }
  } else {
    showAllReveals();
  }

  const revealDestination = (destination) => {
    if (!destination || destination === document.body || destination === document.documentElement) return;
    const enclosingReveal = destination.closest('.reveal');
    if (enclosingReveal) showReveal(enclosingReveal, 0, true);
    destination.querySelectorAll('.reveal').forEach((element) => showReveal(element, 0, true));
  };

  const revealHashDestination = () => {
    if (window.location.hash.length < 2) return;
    try {
      revealDestination(document.getElementById(decodeURIComponent(window.location.hash.slice(1))));
    } catch {
      // An invalid fragment is harmless and should retain normal browser behavior.
    }
  };

  // Keyboard focus and section links should never land on a faded-out control.
  document.addEventListener('focusin', (event) => revealDestination(event.target));
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey || link.hash.length < 2 ||
        link.origin !== window.location.origin || link.pathname !== window.location.pathname ||
        link.search !== window.location.search) return;
    try {
      revealDestination(document.getElementById(decodeURIComponent(link.hash.slice(1))));
    } catch {
      // Keep malformed fragments from interrupting other page interactions.
    }
  });
  window.addEventListener('hashchange', revealHashDestination);
  revealHashDestination();

  const handleRevealMotionChange = (event) => {
    if (event.matches) {
      finishHeroIntro();
      showAllReveals();
    }
  };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleRevealMotionChange);
  else motionQuery.addListener(handleRevealMotionChange);

  const lightbox = document.querySelector('#gallery-lightbox');
  const lightboxImage = lightbox?.querySelector('.lightbox-image');
  const lightboxCaption = lightbox?.querySelector('.lightbox-caption');
  const lightboxCount = lightbox?.querySelector('.lightbox-count');
  const lightboxClose = lightbox?.querySelector('.lightbox-close');
  const lightboxPrevious = lightbox?.querySelector('.lightbox-prev');
  const lightboxNext = lightbox?.querySelector('.lightbox-next');
  const galleryItems = [...document.querySelectorAll('a.gallery-item[href]')];
  const videoLightbox = document.querySelector('#video-lightbox');

  const updateModalLock = () => {
    document.body.classList.toggle('modal-open', Boolean(lightbox?.open || videoLightbox?.open));
  };

  if (lightbox && typeof lightbox.showModal === 'function' && lightboxImage &&
      lightboxCaption && lightboxClose && galleryItems.length) {
    let activeGalleryIndex = 0;
    let lastFocusedGalleryItem;

    const showGalleryItem = (index) => {
      activeGalleryIndex = (index + galleryItems.length) % galleryItems.length;
      const item = galleryItems[activeGalleryIndex];
      const thumbnail = item.querySelector('img');
      const caption = item.dataset.caption || thumbnail?.alt || '';
      lightboxImage.src = item.href;
      lightboxImage.alt = thumbnail?.alt || caption;
      lightboxCaption.textContent = caption;
      if (lightboxCount) lightboxCount.textContent = `${activeGalleryIndex + 1} / ${galleryItems.length}`;
    };

    galleryItems.forEach((item, index) => {
      item.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) return;
        event.preventDefault();
        lastFocusedGalleryItem = item;
        closeMenu();
        showGalleryItem(index);
        if (!lightbox.open) lightbox.showModal();
        updateModalLock();
        lightboxClose.focus();
      });
    });

    lightboxClose.addEventListener('click', () => lightbox.close());
    lightboxPrevious?.addEventListener('click', () => showGalleryItem(activeGalleryIndex - 1));
    lightboxNext?.addEventListener('click', () => showGalleryItem(activeGalleryIndex + 1));

    if (galleryItems.length < 2) {
      if (lightboxPrevious) lightboxPrevious.hidden = true;
      if (lightboxNext) lightboxNext.hidden = true;
    }

    document.addEventListener('keydown', (event) => {
      if (!lightbox.open || (videoLightbox?.open && !lightbox.contains(document.activeElement))) return;
      if (event.key === 'Tab') {
        const focusable = [...lightbox.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
          .filter((element) => !element.matches(':disabled') && element.tabIndex >= 0 &&
            element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) return;
        const active = document.activeElement;
        if (!lightbox.contains(active) || active === lightbox) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        showGalleryItem(activeGalleryIndex + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    });

    lightbox.addEventListener('click', (event) => {
      if (event.target !== lightbox) return;
      const bounds = lightbox.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) lightbox.close();
    });

    lightbox.addEventListener('close', () => {
      updateModalLock();
      if (!videoLightbox?.open && lastFocusedGalleryItem?.isConnected) {
        lastFocusedGalleryItem.focus({ preventScroll: true });
      }
    });
  }

  const video = videoLightbox?.querySelector('.video-player[data-source]');
  const videoClose = videoLightbox?.querySelector('.video-close');
  const videoTriggers = [...document.querySelectorAll('[data-video-open]')];
  const videoSource = video?.dataset.source?.trim();

  if (videoLightbox && typeof videoLightbox.showModal === 'function' &&
      video && videoClose && videoSource && videoTriggers.length) {
    let lastFocusedVideoTrigger;
    const videoStartGuard = document.createElement('span');
    const videoEndGuard = document.createElement('span');

    [videoStartGuard, videoEndGuard].forEach((guard) => {
      guard.className = 'modal-focus-guard';
      guard.tabIndex = -1;
    });
    videoLightbox.prepend(videoStartGuard);
    videoLightbox.append(videoEndGuard);

    const setVideoFocusGuards = (enabled) => {
      videoStartGuard.tabIndex = enabled ? 0 : -1;
      videoEndGuard.tabIndex = enabled ? 0 : -1;
    };

    // Boundary guards keep browser-specific video shadow controls in the loop.
    // Intercepting Tab on the video host would skip those native controls.
    videoStartGuard.addEventListener('focus', () => {
      if (videoLightbox.open) video.focus({ preventScroll: true });
    });
    videoEndGuard.addEventListener('focus', () => {
      if (videoLightbox.open) videoClose.focus({ preventScroll: true });
    });

    const closeVideo = () => {
      video.pause();
      setVideoFocusGuards(false);
      if (videoLightbox.open) videoLightbox.close();
    };

    videoTriggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) return;
        closeMenu();
        // Loading and playback begin only after an explicit visitor action.
        if (!video.hasAttribute('src')) video.src = videoSource;
        try {
          if (!videoLightbox.open) videoLightbox.showModal();
        } catch {
          // Preserve the anchor's direct-video fallback if modal opening fails.
          return;
        }
        event.preventDefault();
        lastFocusedVideoTrigger = trigger;
        setVideoFocusGuards(true);
        updateModalLock();
        videoClose.focus();
        try {
          video.play()?.catch(() => {
            // Native controls remain available if browser playback is deferred.
          });
        } catch {
          // Browsers without programmatic playback can still use native controls.
        }
      });
    });

    videoClose.addEventListener('click', closeVideo);
    videoLightbox.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeVideo();
    });
    videoLightbox.addEventListener('click', (event) => {
      if (event.target !== videoLightbox) return;
      const bounds = videoLightbox.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) closeVideo();
    });
    videoLightbox.addEventListener('close', () => {
      video.pause();
      setVideoFocusGuards(false);
      updateModalLock();
      if (!lightbox?.open && lastFocusedVideoTrigger?.isConnected) {
        lastFocusedVideoTrigger.focus({ preventScroll: true });
      }
    });
  }

  const copyrightYear = document.getElementById('copyright-year');
  if (copyrightYear) copyrightYear.textContent = String(new Date().getFullYear());
})();
