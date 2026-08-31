/* gakusyu-tools theme switcher — minimal, sync, no deps */
(function () {
  'use strict';
  var KEY = 'gakusyu-theme';
  var VALID = { 'pop': 1, 'default': 1 };
  // backward compat: old value 'motherduck' -> 'pop'
  var LEGACY = { 'motherduck': 'pop' };
  function normalizeTheme(t) {
    if (LEGACY[t]) return LEGACY[t];
    return t;
  }
  function getStored() {
    try { return normalizeTheme(localStorage.getItem(KEY) || ''); } catch (e) { return ''; }
  }
  function setStored(v) {
    try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {}
  }
  function getParam() {
    try {
      var m = location.search.match(/[?&]theme=([^&]+)/);
      return m ? normalizeTheme(decodeURIComponent(m[1])) : '';
    } catch (e) { return ''; }
  }
  function applyTheme(t) {
    if (t === 'pop') {
      document.documentElement.setAttribute('data-theme', 'pop');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  // 1) URL param has highest priority (for sharing / first click)
  // 2) otherwise stored value
  var param = getParam();
  var theme = '';
  if (param && VALID[param]) {
    theme = param;
    setStored(theme);
  } else {
    theme = getStored();
  }
  // Normalize: only 'pop' is non-default
  if (theme === 'pop') applyTheme('pop');
  else applyTheme('default');

  function updateCardHrefs(t) {
    try {
      var cards = document.querySelectorAll('a.card[href]');
      for (var i = 0; i < cards.length; i++) {
        var a = cards[i];
        // Keep original path without previous theme param to avoid duplication
        var raw = a.getAttribute('href');
        var url = new URL(raw, location.href);
        if (t === 'pop') url.searchParams.set('theme', 'pop');
        else url.searchParams.delete('theme');
        // remove legacy param
        if (url.searchParams.has('motherduck')) url.searchParams.delete('motherduck');
        var newHref = url.pathname + url.search + url.hash;
        // Convert absolute pathname to relative if original was relative
        if (raw.indexOf('./') === 0 || raw.indexOf('../') === 0) {
          // Keep relative form for GitHub Pages (./app1/?theme=...)
          var rel = raw.split('?')[0].split('#')[0];
          newHref = rel + url.search + url.hash;
        }
        a.setAttribute('href', newHref);
      }
    } catch (e) {}
  }
  // Initial href sync after DOM is ready (for when theme is pop)
  if (theme === 'pop') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { updateCardHrefs('pop'); });
    } else {
      updateCardHrefs('pop');
    }
  }
  // Cross-tab sync
  try {
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) {
        var v = normalizeTheme(e.newValue || 'default');
        if (VALID[v || 'default']) {
          applyTheme(v || 'default');
          updateCardHrefs(v || 'default');
          // Dispatch custom event for UI to update
          try { window.dispatchEvent(new CustomEvent('gakusyu-theme-change', { detail: v })); } catch (_) {}
        }
      }
    });
  } catch (e) {}

  // Expose global helper for UI
  window.setGakusyuTheme = function (t) {
    t = normalizeTheme(t);
    if (!VALID[t]) t = 'default';
    setStored(t);
    applyTheme(t);
    updateCardHrefs(t);
    try { window.dispatchEvent(new CustomEvent('gakusyu-theme-change', { detail: t })); } catch (_) {}
    return t;
  };
  window.getGakusyuTheme = function () {
    return document.documentElement.getAttribute('data-theme') === 'pop' ? 'pop' : 'default';
  };
})();
