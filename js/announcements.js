(() => {
  'use strict';

  const host = document.querySelector('[data-announcements]');
  if (!host) return;
  const categories = ['General', 'Events', 'Special Programmes'];
  const empty = host.querySelector('[data-announcement-empty]');
  const filters = host.querySelector('[data-announcement-filters]');
  const featured = host.querySelector('[data-announcement-featured]');
  const list = host.querySelector('[data-announcement-list]');
  const listSection = host.querySelector('[data-announcement-list-section]');
  const count = host.querySelector('[data-announcement-count]');
  const dateFormat = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const clean = (value) => typeof value === 'string' ? value.trim() : '';
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(value))) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const source = Array.isArray(window.VisionHouseData?.announcements) ? window.VisionHouseData.announcements : [];
  const announcements = source.filter((item) => item && item.published === true && clean(item.id) &&
    clean(item.title) && clean(item.summary) && categories.includes(item.category) && validDate(item.date))
    .slice().sort((first, second) => second.date.localeCompare(first.date));

  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };

  const dateLabel = (date, label) => {
    const wrapper = element('span', 'announcement-date');
    wrapper.append(document.createTextNode(`${label} `));
    const time = element('time', '', dateFormat.format(new Date(`${date}T00:00:00Z`)));
    time.dateTime = date;
    wrapper.append(time);
    return wrapper;
  };

  const makeCard = (item, isFeatured = false) => {
    const card = element('article', isFeatured ? 'content-card announcement-card announcement-featured' : 'content-card announcement-card');
    // Only local, approved image paths are accepted; a missing optional image never breaks a card.
    const imagePath = clean(item.imageSrc);
    if (/^assets\/images\/[A-Za-z0-9_./ -]+\.(?:jpe?g|png|webp|avif)$/i.test(imagePath) &&
        !imagePath.split('/').includes('..') && clean(item.imageAlt)) {
      const image = element('img', 'announcement-image');
      image.src = imagePath;
      image.alt = clean(item.imageAlt);
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true });
      card.append(image);
    }
    const body = element('div', 'announcement-body');
    const meta = element('div', 'card-meta');
    meta.append(element('span', 'status-badge', item.category));
    if (isFeatured) meta.append(element('span', 'announcement-featured-label', 'Featured'));
    body.append(meta, element(isFeatured ? 'h2' : 'h3', '', clean(item.title)), element('p', 'announcement-summary', clean(item.summary)));
    const dates = element('div', 'announcement-dates');
    dates.append(dateLabel(item.date, 'Published'));
    if (validDate(item.eventDate)) dates.append(dateLabel(item.eventDate, 'Event:'));
    body.append(dates);
    card.append(body);
    return card;
  };

  const render = (category = 'All') => {
    const matches = announcements.filter((item) => category === 'All' || item.category === category);
    const lead = matches.find((item) => item.featured === true);
    featured.replaceChildren();
    list.replaceChildren();
    featured.hidden = !lead;
    if (lead) featured.append(makeCard(lead, true));
    const remaining = matches.filter((item) => item !== lead);
    remaining.forEach((item) => list.append(makeCard(item)));
    listSection.hidden = remaining.length === 0;
    empty.hidden = matches.length > 0;
    const emptyTitle = empty.querySelector('h2');
    const emptyText = empty.querySelector('p');
    if (announcements.length && !matches.length) {
      emptyTitle.textContent = 'No announcements in this category';
      emptyText.textContent = 'Choose another category to read the latest church updates.';
    }
    if (count) count.textContent = `${matches.length} ${matches.length === 1 ? 'announcement' : 'announcements'}`;
    filters.querySelectorAll('[data-announcement-category]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.announcementCategory === category));
    });
  };

  if (!announcements.length) return; // Keep the accessible, server-rendered empty state.
  filters.hidden = false;
  filters.querySelectorAll('[data-announcement-category]').forEach((button) => {
    button.addEventListener('click', () => render(button.dataset.announcementCategory));
  });
  render();
})();
