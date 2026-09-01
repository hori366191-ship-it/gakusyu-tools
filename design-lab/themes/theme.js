/* gakusyu-tools theme switcher — design-lab (forest対応 3択) */
(function () {
  'use strict';
  var KEY = 'gakusyu-theme';
  var VALID = { 'pop': 1, 'forest': 1, 'default': 1 };
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
    if (t === 'pop' || t === 'forest') {
      document.documentElement.setAttribute('data-theme', t);
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
  // Normalize: pop/forest are non-default
  if (theme === 'pop' || theme === 'forest') applyTheme(theme);
  else applyTheme('default');

  function updateCardHrefs(t) {
    try {
      var cards = document.querySelectorAll('a.card[href]');
      for (var i = 0; i < cards.length; i++) {
        var a = cards[i];
        var raw = a.getAttribute('href');
        var url = new URL(raw, location.href);
        if (t === 'pop' || t === 'forest') url.searchParams.set('theme', t);
        else url.searchParams.delete('theme');
        if (url.searchParams.has('motherduck')) url.searchParams.delete('motherduck');
        var newHref = url.pathname + url.search + url.hash;
        if (raw.indexOf('./') === 0 || raw.indexOf('../') === 0) {
          var rel = raw.split('?')[0].split('#')[0];
          newHref = rel + url.search + url.hash;
        }
        a.setAttribute('href', newHref);
      }
    } catch (e) {}
  }
  // Initial href sync after DOM is ready (for when theme is pop/forest)
  if (theme === 'pop' || theme === 'forest') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { updateCardHrefs(theme); });
    } else {
      updateCardHrefs(theme);
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
    var cur = document.documentElement.getAttribute('data-theme');
    if (cur === 'pop' || cur === 'forest') return cur;
    return 'default';
  };
})();
