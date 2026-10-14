(() => {
  'use strict';
  const data = window.VisionHouseData || {};
  const hasText = value => typeof value === 'string' && value.trim().length > 0;
  const dateLabel = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  };
  const addPreview = (list, title, subtitle, href) => {
    const item = document.createElement('article');
    item.className = 'preview-item';
    const heading = document.createElement('h3');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = title;
    heading.append(link);
    const detail = document.createElement('p');
    detail.textContent = subtitle;
    item.append(heading, detail);
    list.append(item);
  };
  const sermonList = document.getElementById('latest-sermon-list');
  if (sermonList) {
    const sermons = (Array.isArray(data.sermons) ? data.sermons : []).filter(item =>
      item?.published === true && ['id', 'title', 'preacher', 'passage', 'description', 'category'].every(key => hasText(item[key])) &&
      dateLabel(item.date) && /^assets\/audio\/(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(?:mp3|m4a|ogg|oga|wav|aac|flac|opus)$/i.test(item.audioSrc || '')
    ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    sermons.forEach(item => addPreview(sermonList, item.title, `${item.preacher} · ${dateLabel(item.date)}`, 'sermons.html'));
    if (sermons.length) document.getElementById('latest-sermon-empty').hidden = true;
  }
  const announcementList = document.getElementById('latest-announcement-list');
  if (announcementList) {
    const announcements = (Array.isArray(data.announcements) ? data.announcements : []).filter(item =>
      item?.published === true && hasText(item.id) && hasText(item.title) && hasText(item.summary) &&
      ['General', 'Events', 'Special Programmes'].includes(item.category) && dateLabel(item.date)
    ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    announcements.forEach(item => addPreview(announcementList, item.title, dateLabel(item.date), 'announcements.html'));
    if (announcements.length) document.getElementById('latest-announcement-empty').hidden = true;
  }
})();
