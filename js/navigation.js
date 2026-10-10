(() => {
  'use strict';
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  const groups = [...nav.querySelectorAll('.nav-dropdown')];
  const closeDropdowns = (except = null) => groups.forEach(group => {
    if (group !== except) group.open = false;
  });
  groups.forEach(group => group.addEventListener('toggle', () => {
    if (group.open) closeDropdowns(group);
  }));
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) closeDropdowns();
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target)) closeDropdowns();
  });
  document.addEventListener('focusin', event => {
    groups.forEach(group => {
      if (group.open && !group.contains(event.target)) group.open = false;
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const group = groups.find(item => item.open && item.contains(document.activeElement));
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    group.open = false;
    group.querySelector('summary').focus({ preventScroll: true });
  }, true);
  document.querySelector('.menu-toggle')?.addEventListener('click', () => {
    if (!nav.classList.contains('open')) closeDropdowns();
  });
  const desktop = window.matchMedia('(min-width: 1024px)');
  if (desktop.addEventListener) desktop.addEventListener('change', () => closeDropdowns());
  else desktop.addListener(() => closeDropdowns());
})();
