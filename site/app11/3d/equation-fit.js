/*
 * app11/3d 球ビュー — 反応式カードの「初期は幅に収める／明示的に拡大」補助
 *
 * detail.js（公開・変更しない）が作る .rp3d-eq には、もともと
 * .rp3d-eq__scroll（overflow-x:auto）と min-width 付きの SVG があり、
 * 狭いパネルでは横スクロールが発生する。この画面では CSS 側で
 * 「初期状態は横スクロールなし（幅に収める）」に上書きし、ここで
 * 各反応式カードに明示的な「拡大」ボタンを足す。拡大時だけカード内が
 * 横スクロールになる（パネル全体は縦スクロールのまま）。
 *
 * detail.js の DOM（caption / svg / note）は書き換えず、ボタンを追加するだけ。
 * 反応式そのもの（係数・複数基質/生成物・条件・出典）は共有 canonical の
 * 出力をそのまま保持する。
 *
 * Node では require、ブラウザでは window.RP3DEquationFit。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DEquationFit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ZOOM_LABEL = '拡大';
  var RESTORE_LABEL = '元の幅';

  function figuresOf(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    var nodes = container.querySelectorAll('.rp3d-eq');
    return nodes ? Array.prototype.slice.call(nodes) : [];
  }

  function setZoomed(figure, button, zoomed) {
    if (figure.classList && typeof figure.classList.toggle === 'function') {
      figure.classList.toggle('is-zoomed', zoomed);
    } else if (figure.classList) {
      var classes = String(figure.className || '').split(/\s+/).filter(Boolean);
      var index = classes.indexOf('is-zoomed');
      if (zoomed && index === -1) classes.push('is-zoomed');
      if (!zoomed && index !== -1) classes.splice(index, 1);
      figure.className = classes.join(' ');
    }
    button.setAttribute('aria-expanded', zoomed ? 'true' : 'false');
    button.textContent = zoomed ? RESTORE_LABEL : ZOOM_LABEL;
  }

  // 各反応式カードに「拡大 / 元の幅」ボタンを 1 つだけ足す（冪等）。
  function enhanceEquations(container, doc) {
    var documentRef = doc || (container && container.ownerDocument) || null;
    if (!documentRef || typeof documentRef.createElement !== 'function') {
      return { enhanced: 0, buttons: 0 };
    }
    var enhanced = 0;
    figuresOf(container).forEach(function (figure) {
      if (figure.getAttribute && figure.getAttribute('data-eqfit') === '1') return;
      if (!figure.appendChild) return;
      var button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'rp3d-eq__zoom';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', '反応式を拡大表示');
      button.textContent = ZOOM_LABEL;
      button.addEventListener('click', function () {
        var zoomed = !(figure.classList && typeof figure.classList.contains === 'function' &&
          figure.classList.contains('is-zoomed'));
        setZoomed(figure, button, zoomed);
      });
      figure.appendChild(button);
      if (figure.setAttribute) figure.setAttribute('data-eqfit', '1');
      enhanced += 1;
    });
    return { enhanced: enhanced, buttons: figuresOf(container).length };
  }

  return {
    ZOOM_LABEL: ZOOM_LABEL,
    RESTORE_LABEL: RESTORE_LABEL,
    enhanceEquations: enhanceEquations
  };
});
