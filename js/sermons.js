/* Static, manually maintained sermon videos. No backend or autoplay. */
(() => {
  'use strict';

  const ids = ['sermon-list', 'sermon-filters', 'sermon-search', 'sermon-category',
    'sermon-category-field', 'sermon-results-status', 'sermon-empty',
    'sermon-empty-title', 'sermon-empty-description', 'sermon-reset',
    'sermon-invitation', 'sermon-featured-section', 'sermon-featured',
    'sermon-player', 'sermon-player-title', 'sermon-player-meta',
    'sermon-player-media', 'sermon-player-error', 'sermon-player-close'];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  if (ids.some(id => !elements[id])) return;
  const [list, filters, search, category, categoryField, status, empty, emptyTitle,
    emptyDescription, reset, invitation, featuredSection, featuredHost, player,
    playerTitle, playerMeta, playerMedia, playerError, playerClose] = ids.map(id => elements[id]);
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(value))) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const hasDisplayDate = record => validDate(clean(record.date)) ||
    (!clean(record.date) && record.dateType === 'publication' && Boolean(clean(record.approximatePublicationLabel)));
  // Project-relative paths only: no protocols, traversal, query strings or remote photos.
  const pathPattern = (folder, extensions) => new RegExp(`^${folder}/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\\.(?:${extensions})$`, 'i');
  const imagePath = pathPattern('assets/images', 'jpe?g|png|webp|avif');
  const videoPath = pathPattern('assets/videos/sermons', 'mp4|webm');
  const captionPath = pathPattern('assets/videos/sermons', 'vtt');
  const youtubeId = value => {
    if (!clean(value)) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(url.hostname)) return '';
      const id = url.hostname === 'youtu.be' ? url.pathname.slice(1)
        : url.pathname === '/watch' ? url.searchParams.get('v')
        : /^\/(?:shorts|embed)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ? url.pathname.split('/')[2] : '';
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '';
    } catch { return ''; }
  };
  const raw = Array.isArray(window.VisionHouseData?.sermons) ? window.VisionHouseData.sermons : [];
  const counts = new Map();
  raw.forEach(record => { const id = clean(record?.id); counts.set(id, (counts.get(id) || 0) + 1); });
  const records = raw.filter(record => record?.published === true &&
    ['id', 'title', 'preacher', 'description', 'thumbnail'].every(key => clean(record[key])) &&
    counts.get(clean(record.id)) === 1 && hasDisplayDate(record) && imagePath.test(clean(record.thumbnail)) &&
    (!clean(record.preacherPhoto) || imagePath.test(clean(record.preacherPhoto))) &&
    (!clean(record.captionsSrc) || captionPath.test(clean(record.captionsSrc))) &&
    ((videoPath.test(clean(record.videoSrc)) && !clean(record.youtubeUrl)) ||
     (!clean(record.videoSrc) && youtubeId(record.youtubeUrl))))
    .map(record => ({ ...record, id: clean(record.id), title: clean(record.title),
      preacher: clean(record.preacher), preacherPhoto: clean(record.preacherPhoto),
      thumbnail: clean(record.thumbnail), description: clean(record.description),
      date: clean(record.date), approximatePublicationLabel: clean(record.approximatePublicationLabel),
      videoSrc: clean(record.videoSrc), youtubeId: youtubeId(record.youtubeUrl),
      category: clean(record.category), passage: clean(record.passage), captionsSrc: clean(record.captionsSrc) }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

  // Keep the exact static empty state when no real, complete videos are published.
  if (!records.length) return;
  const dateFormat = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dateText = record => {
    if (!record.date) return record.approximatePublicationLabel;
    const formatted = dateFormat.format(new Date(`${record.date}T00:00:00Z`));
    if (record.dateType === 'publication') {
      return `${record.dateApproximate === true ? 'Published around' : 'Published'} ${formatted}`;
    }
    return formatted;
  };
  const normalize = value => value.toLocaleLowerCase('en-NG').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = name => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('class', 'icon'); node.setAttribute('aria-hidden', 'true'); node.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`); node.append(use); return node;
  };
  const videoHref = record => record.videoSrc || `https://www.youtube.com/watch?v=${record.youtubeId}`;
  let lastTrigger;
  const stopPlayback = () => {
    playerMedia.querySelectorAll('video').forEach(video => {
      video.pause(); video.removeAttribute('src'); video.load();
    });
    playerMedia.replaceChildren(); // Removing a YouTube iframe also stops its playback.
    playerError.hidden = true;
    document.body.classList.remove('modal-open');
  };
  const watch = (record, trigger, event) => {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof player.showModal !== 'function') return;
    stopPlayback();
    playerTitle.textContent = record.title;
    playerMeta.textContent = `${record.preacher} ? ${dateText(record)}`;
    if (record.videoSrc) {
      const video = create('video', 'sermon-video');
      video.controls = true; video.playsInline = true; video.preload = 'metadata';
      video.poster = record.thumbnail; video.src = record.videoSrc;
      video.setAttribute('aria-label', `${record.title}, preached by ${record.preacher}`);
      if (record.captionsSrc) {
        const track = create('track'); track.kind = 'captions'; track.srclang = 'en';
        track.label = 'English'; track.src = record.captionsSrc; video.append(track);
      }
      const fallback = create('a', '', 'Open the video'); fallback.href = record.videoSrc;
      video.append(document.createTextNode('Your browser does not support this video. '), fallback);
      video.addEventListener('error', () => { playerError.hidden = false; });
      playerMedia.append(video);
    } else {
      const iframe = create('iframe', 'sermon-youtube');
      iframe.src = `https://www.youtube-nocookie.com/embed/${record.youtubeId}?autoplay=0&playsinline=1`;
      iframe.title = `${record.title}, preached by ${record.preacher}`;
      iframe.allow = 'encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      playerMedia.append(iframe);
    }
    try { player.showModal(); } catch { stopPlayback(); return; }
    event.preventDefault(); lastTrigger = trigger;
    document.body.classList.add('modal-open'); playerClose.focus();
  };
  const watchLink = (record, className, label) => {
    const link = create('a', className, label);
    link.href = videoHref(record);
    link.setAttribute('aria-label', `Watch ${record.title}, preached by ${record.preacher}`);
    link.addEventListener('click', event => watch(record, link, event));
    return link;
  };
  const preacher = record => {
    const row = create('div', 'sermon-preacher');
    const avatar = create('span', 'sermon-preacher-avatar');
    const initials = create('span', 'sermon-preacher-initials', record.preacher.split(/\s+/).slice(0, 2).map(word => word[0]).join(''));
    initials.setAttribute('aria-hidden', 'true'); avatar.append(initials);
    if (record.preacherPhoto) {
      const photo = create('img'); photo.src = record.preacherPhoto; photo.alt = `Portrait of ${record.preacher}`;
      photo.width = 44; photo.height = 44; photo.loading = 'lazy'; photo.decoding = 'async';
      photo.addEventListener('error', () => photo.remove(), { once: true }); avatar.append(photo);
    }
    row.append(avatar, create('span', 'sermon-preacher-name', record.preacher));
    return row;
  };
  const card = (record, index, featured = false) => {
    const article = create('article', `sermon-card${featured ? ' sermon-card--featured' : ''}`);
    const thumbnail = watchLink(record, 'sermon-thumbnail');
    const image = create('img'); image.src = record.thumbnail; image.alt = ''; image.width = 1280; image.height = 720;
    image.loading = featured ? 'eager' : 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => image.remove(), { once: true });
    const play = create('span', 'sermon-play'); play.append(icon('play'));
    thumbnail.append(image, play, create('span', 'sermon-thumbnail-label', record.youtubeId ? 'YouTube' : 'Sermon video'));
    const body = create('div', 'sermon-card-body');
    const meta = create('div', 'sermon-meta');
    const date = create(record.date ? 'time' : 'span', '', dateText(record));
    if (record.date) date.dateTime = record.date;
    meta.append(date);
    if (record.category) meta.append(create('span', 'sermon-category-label', record.category));
    const title = create('h3', '', record.title); title.id = `sermon-${featured ? 'featured-' : ''}title-${index}`;
    article.setAttribute('aria-labelledby', title.id);
    body.append(meta, title, preacher(record));
    if (record.passage) body.append(create('p', 'sermon-passage', record.passage));
    body.append(create('p', 'sermon-description', record.description));
    const link = watchLink(record, `button ${featured ? 'button-white' : 'button-primary'} sermon-watch`, 'Watch Sermon');
    link.append(icon('arrow')); body.append(link); article.append(thumbnail, body);
    return article;
  };
  const lead = records.find(record => record.featured === true) || records[0];
  featuredHost.append(card(lead, 0, true)); featuredSection.hidden = false;
  const categories = [...new Set(records.map(record => record.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  categories.forEach(name => { const option = create('option', '', name); option.value = name; category.append(option); });
  categoryField.hidden = categories.length === 0;
  filters.hidden = false; status.hidden = false;
  const render = () => {
    const query = normalize(search.value.trim());
    const matches = records.filter(record => (!category.value || record.category === category.value) &&
      (!query || normalize([record.title, record.preacher, record.description, record.category, record.passage].join(' ')).includes(query)));
    const fragment = document.createDocumentFragment();
    matches.forEach((record, index) => { const item = create('li'); item.append(card(record, index)); fragment.append(item); });
    list.replaceChildren(fragment); list.hidden = !matches.length; empty.hidden = matches.length > 0;
    featuredSection.hidden = Boolean(query || category.value);
    status.textContent = `${matches.length} ${matches.length === 1 ? 'sermon' : 'sermons'} found.`;
    if (!matches.length) {
      emptyTitle.textContent = 'No sermons match your search.';
      emptyDescription.textContent = 'Try another title, preacher or topic, or clear your filters.';
      reset.hidden = false; invitation.hidden = true;
    }
  };
  search.addEventListener('input', render); category.addEventListener('change', render);
  reset.addEventListener('click', () => { search.value = ''; category.value = ''; render(); search.focus(); });
  playerClose.addEventListener('click', () => player.close());
  player.addEventListener('close', () => { stopPlayback(); if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true }); });
  player.addEventListener('click', event => {
    if (event.target !== player) return;
    const rect = player.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) player.close();
  });
  render();
})();
