/* gakusyu-tools theme switcher — minimal, sync, no deps */
(function () {
  'use strict';
  var KEY = 'gakusyu-theme';
  var VALID = { 'motherduck': 1, 'default': 1 };
  function getStored() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function setStored(v) {
    try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {}
  }
  function getParam() {
    try {
      var m = location.search.match(/[?&]theme=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }
  function applyTheme(t) {
    if (t === 'motherduck') {
      document.documentElement.setAttribute('data-theme', 'motherduck');
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
  // Normalize: only 'motherduck' is non-default
  if (theme === 'motherduck') applyTheme('motherduck');
  else applyTheme('default');

  function updateCardHrefs(t) {
    try {
      var cards = document.querySelectorAll('a.card[href]');
      for (var i = 0; i < cards.length; i++) {
        var a = cards[i];
        // Keep original path without previous theme param to avoid duplication
        var raw = a.getAttribute('href');
        var url = new URL(raw, location.href);
        if (t === 'motherduck') url.searchParams.set('theme', 'motherduck');
        else url.searchParams.delete('theme');
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
  function updateFavicon(t) {
    try {
      var link = document.getElementById('favicon') || document.querySelector('link[rel="icon"]');
      if (!link) return;
      var href = link.getAttribute('href') || 'favicon.svg';
      var dir = '';
      var slash = href.lastIndexOf('/');
      if (slash !== -1) dir = href.substring(0, slash + 1);
      var base = t === 'motherduck' ? 'favicon-motherduck.svg' : 'favicon.svg';
      var v = t === 'motherduck' ? '?v=motherduck' : '?v=default';
      link.setAttribute('href', dir + base + v);
    } catch (e) {}
  }
  // Initial href/favicon sync after DOM is ready (for when theme is motherduck)
  if (theme === 'motherduck') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { updateCardHrefs('motherduck'); updateFavicon('motherduck'); });
    } else {
      updateCardHrefs('motherduck'); updateFavicon('motherduck');
    }
  } else {
    // Ensure favicon is default on first load (in case previous theme was motherduck but now default)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { updateFavicon('default'); });
    } else {
      updateFavicon('default');
    }
  }
  // Cross-tab sync
  try {
    window.addEventListener('storage', function (e) {
      if (e.key === KEY && VALID[e.newValue || 'default']) {
        applyTheme(e.newValue || 'default');
        updateCardHrefs(e.newValue || 'default');
        updateFavicon(e.newValue || 'default');
        // Dispatch custom event for UI to update
        try { window.dispatchEvent(new CustomEvent('gakusyu-theme-change', { detail: e.newValue })); } catch (_) {}
      }
    });
  } catch (e) {}

  // Expose global helper for UI
  window.setGakusyuTheme = function (t) {
    if (!VALID[t]) t = 'default';
    setStored(t);
    applyTheme(t);
    updateCardHrefs(t);
    updateFavicon(t);
    try { window.dispatchEvent(new CustomEvent('gakusyu-theme-change', { detail: t })); } catch (_) {}
    return t;
  };
  window.getGakusyuTheme = function () {
    return document.documentElement.getAttribute('data-theme') === 'motherduck' ? 'motherduck' : 'default';
  };
})();
