/* gakusyu-tools theme switcher — design-lab (forest対応 3択) */
(function () {
  'use strict';
  var KEY = 'gakusyu-theme';
  var DEFAULT_THEME = 'pop';
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
  function updateHistoryTheme(t) {
    try {
      var url = new URL(location.href);
      if (t === 'pop' || t === 'forest') url.searchParams.set('theme', t);
      else url.searchParams.delete('theme');
      if (url.searchParams.has('motherduck')) url.searchParams.delete('motherduck');
      var newSearch = url.search;
      var curSearch = location.search;
      if (newSearch !== curSearch) {
        history.replaceState(null, '', url.pathname + newSearch + url.hash);
      }
    } catch (e) {}
  }
  // 優先順: 1) 保存済みテーマ（ユーザーの好み）を最優先、2) 無ければURLパラメータ、3) デフォルト
  // これにより ?theme=付きで開いた後に別タブでテーマ変更→リロードで巻き戻るのを防止
  var stored = getStored();
  var param = getParam();
  var theme = DEFAULT_THEME;
  // explicit: 保存値か ?theme= で明示された場合だけ true。
  // 既定へフォールバックした場合は storage/URL/カードリンクを一切書き換えない。
  var explicit = false;
  if (stored && VALID[stored]) {
    theme = stored;
    explicit = true;
    // URLが古いparamのままなら stored に合わせて書き換え（リロード時の巻き戻り防止）
    if (param && param !== stored) {
      updateHistoryTheme(theme);
    }
  } else if (param && VALID[param]) {
    theme = param;
    explicit = true;
    setStored(theme);
  } else {
    theme = DEFAULT_THEME;
  }
  // Normalize: pop/forest are non-default
  if (theme === 'pop' || theme === 'forest') applyTheme(theme);
  else applyTheme('default');
  // 初回表示時のURL正規化は明示時だけ（既定フォールバックではURLを触らない）
  if (explicit) {
    if (stored && VALID[stored]) {
      // 保存値優先。古い param は上の updateHistoryTheme で処理済み（param が無ければ何もしない）
    } else {
      updateHistoryTheme(theme === 'pop' || theme === 'forest' ? theme : 'default');
    }
  }

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
  // Initial href sync after DOM is ready (explicit pop/forest only)
  if (explicit && (theme === 'pop' || theme === 'forest')) {
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
        // キー削除（newValue null）は既定（ポップ）に戻す
        var v = e.newValue ? normalizeTheme(e.newValue) : DEFAULT_THEME;
        if (!VALID[v]) v = DEFAULT_THEME;
        applyTheme(v);
        var urlTheme = (v === DEFAULT_THEME) ? 'default' : v;
        updateCardHrefs(urlTheme);
        updateHistoryTheme(urlTheme);
        try { window.dispatchEvent(new CustomEvent('gakusyu-theme-change', { detail: v })); } catch (_) {}
      }
    });
  } catch (e) {}

  // Expose global helper for UI
  window.setGakusyuTheme = function (t) {
    t = normalizeTheme(t);
    if (!VALID[t]) t = DEFAULT_THEME;
    setStored(t);
    applyTheme(t);
    updateCardHrefs(t);
    updateHistoryTheme(t);
    try { window.dispatchEvent(new CustomEvent('gakusyu-theme-change', { detail: t })); } catch (_) {}
    return t;
  };
  window.getGakusyuTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme');
    if (cur === 'pop' || cur === 'forest') return cur;
    return 'default';
  };
})();
