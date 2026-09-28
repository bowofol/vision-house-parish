const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');

const closeMenu = () => {
  siteNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
};

menuToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

document.querySelectorAll('.site-nav a').forEach((link) => link.addEventListener('click', closeMenu));

const sectionLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')].filter((link) => link.hash !== '#contact');
const observedSections = sectionLinks
  .map((link) => document.querySelector(link.hash))
  .filter(Boolean);
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    sectionLinks.forEach((link) => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
  });
}, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
observedSections.forEach((section) => sectionObserver.observe(section));

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

const lightbox = document.querySelector('.lightbox');
const lightboxVisual = document.querySelector('.lightbox-visual');
const lightboxCaption = document.querySelector('.lightbox-caption');
const lightboxClose = document.querySelector('.lightbox-close');
const lightboxPrevious = document.querySelector('.lightbox-prev');
const lightboxNext = document.querySelector('.lightbox-next');
const galleryItems = [...document.querySelectorAll('.gallery-item')];
let lastFocusedGalleryItem;
let activeGalleryIndex = 0;

const closeLightbox = () => {
  lightbox.hidden = true;
  document.body.style.overflow = '';
  lastFocusedGalleryItem?.focus();
};

const showGalleryItem = (index) => {
  activeGalleryIndex = (index + galleryItems.length) % galleryItems.length;
  const item = galleryItems[activeGalleryIndex];
  const image = item.querySelector('.photo-surface');
  lightboxVisual.style.backgroundImage = getComputedStyle(image).backgroundImage;
  lightboxCaption.textContent = item.dataset.caption;
};

galleryItems.forEach((item, index) => {
  item.addEventListener('click', () => {
    lastFocusedGalleryItem = item;
    showGalleryItem(index);
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightboxClose.focus();
  });
});

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrevious.addEventListener('click', () => showGalleryItem(activeGalleryIndex - 1));
lightboxNext.addEventListener('click', () => showGalleryItem(activeGalleryIndex + 1));
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
  if (event.key === 'ArrowLeft' && !lightbox.hidden) showGalleryItem(activeGalleryIndex - 1);
  if (event.key === 'ArrowRight' && !lightbox.hidden) showGalleryItem(activeGalleryIndex + 1);
});
