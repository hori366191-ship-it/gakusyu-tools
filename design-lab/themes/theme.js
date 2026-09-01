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
  var theme = '';
  if (stored && VALID[stored]) {
    theme = stored;
    // URLが古いparamのままなら stored に合わせて書き換え（リロード時の巻き戻り防止）
    if (param && param !== stored) {
      updateHistoryTheme(theme);
    }
  } else if (param && VALID[param]) {
    theme = param;
    setStored(theme);
  } else {
    theme = stored || 'default';
    if (!VALID[theme]) theme = 'default';
  }
  // Normalize: pop/forest are non-default
  if (theme === 'pop' || theme === 'forest') applyTheme(theme);
  else applyTheme('default');
  // 初回表示時もURLを正規化（stored優先で書き換えた場合や param が無い場合）
  if (stored && VALID[stored]) {
    // 既に上で書き換え済みだが、paramが無い場合もURLに反映しておく（共有時の混乱を避けるため初回のみ）
    // ただし stored が default の場合は URL から theme を除去
    // ここでは既に updateHistoryTheme で処理済みのため追加処理なし
  } else if (theme === 'pop' || theme === 'forest') {
    updateHistoryTheme(theme);
  } else {
    updateHistoryTheme('default');
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
          updateHistoryTheme(v || 'default');
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
