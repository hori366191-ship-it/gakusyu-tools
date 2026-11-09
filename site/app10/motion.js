/*
 * 有機化学ビルダー（app10-next）— 高さアニメーションの共通ヘルパー
 *
 * - 依存なし。window.OCMotion として公開し、Nodeテストでは require する。
 * - 高さの変更は「対象要素の高さ」だけをWAAPIで補間する。gridの外枠や
 *   親のレイアウトはそのまま伸縮させ、二重補間しない。
 * - prefers-reduced-motion / WAAPI未対応 / hidden のときは即時反映し、
 *   inline の height・overflow を必ず解除する。
 * - 連打時は「いま見えている高さ」から続ける。cancel 時も style を残さない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OCMotion = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MOTION_MS = 190;
  var EASING = 'cubic-bezier(.4, 0, .2, 1)';

  function create(win) {
    win = win || (typeof window !== 'undefined' ? window : null);
    var anims = new Map();      // 要素 -> 実行中の Animation
    var disclosures = new Map();// details -> 実行中の Animation
    var motionQuery = null;
    var reduceHandlers = [];

    if (win && typeof win.matchMedia === 'function') {
      try { motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { motionQuery = null; }
    }

    function reduced() {
      return !!(motionQuery && motionQuery.matches);
    }

    function waapi() {
      var proto = win && win.Element && win.Element.prototype;
      return !!(proto && typeof proto.animate === 'function');
    }

    function canAnimate() {
      return waapi() && !reduced();
    }

    function hidden(el) {
      if (!el) return true;
      if (el.hidden) return true;
      if (el.closest) {
        try { if (el.closest('[hidden]')) return true; } catch (e) {}
      }
      if (typeof el.getClientRects === 'function') {
        try { if (!el.getClientRects().length) return true; } catch (e) {}
      }
      return false;
    }

    function style(el) {
      return (el && el.style) || {};
    }

    function reset(el) {
      if (!el) return;
      style(el).height = '';
      style(el).overflow = '';
    }

    function computedHeight(el) {
      try {
        if (win && typeof win.getComputedStyle === 'function') {
          var h = parseFloat(win.getComputedStyle(el).height);
          if (isFinite(h)) return h;
        }
      } catch (e) {}
      return rectHeight(el);
    }

    function rectHeight(el) {
      try {
        if (el && typeof el.getBoundingClientRect === 'function') {
          var r = el.getBoundingClientRect();
          if (r && isFinite(r.height)) return r.height;
        }
      } catch (e) {}
      return 0;
    }

    function animatableNumber(el, fallback) {
      var h = computedHeight(el);
      return isFinite(h) ? h : fallback;
    }

    function stop(el) {
      var a = anims.get(el);
      if (!a) return false;
      anims.delete(el);
      try { a.cancel(); } catch (e) {}
      return true;
    }

    function finish(el, anim, done) {
      if (anims.get(el) !== anim) return;
      anims.delete(el);
      reset(el);
      if (done) done();
    }

    /* 高さアニメーションの共通処理。
     * items: [{ el: Element, render: Function }]
     * options: { animate: boolean }
     *
     * 1) 全対象の「いま見えている高さ」を先に取得
     * 2) 実行中のアニメーションをすべて cancel して style を戻す
     * 3) render を1回ずつ実行
     * 4) 全対象の高さを測ってから、同じ duration / easing で同時に再生
     */
    function animateMany(items, options) {
      options = options || {};
      var list = (items || []).filter(function (item) { return item && item.el; });

      // 今回対象でない要素（別モードへ切り替わって hidden になった等）は
      // アニメーションを止め、inline style を残さない。
      anims.forEach(function (a, el) {
        var keep = list.some(function (item) { return item.el === el; });
        if (keep) return;
        stop(el);
        reset(el);
      });

      var before = list.map(function (item) {
        var el = item.el;
        var running = anims.has(el);
        // 呼び出し側が「切替前の見えている高さ」を渡した場合はそれを使う
        // （モード切替でhiddenを切り替えた後に測ると、一瞬で新しい高さへ飛ぶため）。
        var h = (typeof item.before === 'number' && isFinite(item.before))
          ? item.before
          : (running ? animatableNumber(el, rectHeight(el)) : rectHeight(el));
        stop(el);
        reset(el);
        return h;
      });

      list.forEach(function (item) {
        if (typeof item.render === 'function') item.render();
      });

      var animate = options.animate !== false && canAnimate();
      if (!animate) {
        list.forEach(function (item) { reset(item.el); });
        return false;
      }

      var after = list.map(function (item) { return rectHeight(item.el); });
      var played = 0;
      list.forEach(function (item, i) {
        var el = item.el;
        if (hidden(el)) { reset(el); return; }
        var from = before[i];
        var to = after[i];
        if (!isFinite(from) || !isFinite(to) || Math.abs(to - from) < 0.5) { reset(el); return; }
        style(el).overflow = 'hidden';
        style(el).height = from + 'px';
        if (typeof el.animate !== 'function') { reset(el); return; }
        var anim = el.animate(
          [{ height: from + 'px' }, { height: to + 'px' }],
          { duration: MOTION_MS, easing: EASING }
        );
        anims.set(el, anim);
        played++;
        anim.onfinish = function () { finish(el, anim); };
        anim.oncancel = function () { finish(el, anim); };
      });
      return played > 0;
    }

    /* details（oc-help）の開閉。body の高さだけを滑らかに変える。
     * 開いている間は details.open を維持し、閉じ切った時点で open=false。 */
    function animateDisclosure(details, body, open, done) {
      if (!details || !body) {
        if (details) details.open = !!open;
        if (done) done();
        return false;
      }
      var running = disclosures.get(details);
      var current = 0;
      if (running) {
        current = animatableNumber(body, rectHeight(body));
        disclosures.delete(details);
        try { running.anim.cancel(); } catch (e) {}
      } else if (details.open) {
        current = rectHeight(body);
      }
      reset(body);

      if (open) {
        details.open = true;
      } else if (!details.open) {
        reset(body);
        if (done) done();
        return false;
      }
      var target = open ? rectHeight(body) : 0;
      if (!canAnimate() || hidden(body) || Math.abs(target - current) < 1) {
        details.open = !!open;
        reset(body);
        if (done) done();
        return false;
      }
      style(body).overflow = 'hidden';
      style(body).height = current + 'px';
      if (typeof body.animate !== 'function') {
        details.open = !!open;
        reset(body);
        if (done) done();
        return false;
      }
      var anim = body.animate(
        [{ height: current + 'px' }, { height: target + 'px' }],
        { duration: MOTION_MS, easing: EASING }
      );
      disclosures.set(details, { anim: anim, open: !!open });
      var settle = function () {
        var entry = disclosures.get(details);
        if (!entry || entry.anim !== anim) return;
        disclosures.delete(details);
        details.open = !!open;
        reset(body);
        if (done) done();
      };
      anim.onfinish = settle;
      anim.oncancel = settle;
      return true;
    }

    function restoreAll() {
      anims.forEach(function (a, el) {
        try { a.cancel(); } catch (e) {}
        reset(el);
      });
      anims.clear();
      disclosures.forEach(function (entry, details) {
        try { entry.anim.cancel(); } catch (e) {}
        // cancelでも操作の意図した状態へ即時に確定し、途中の高さを残さない。
        details.open = !!entry.open;
        var body = details.querySelector ? details.querySelector('.oc-help__body') : null;
        if (body) reset(body);
        else reset(details);
      });
      disclosures.clear();
    }

    function onReducedChange(fn) {
      if (typeof fn === 'function') reduceHandlers.push(fn);
    }

    if (motionQuery) {
      var listener = function () {
        if (!motionQuery.matches) return;
        restoreAll();
        reduceHandlers.forEach(function (fn) { try { fn(); } catch (e) {} });
      };
      try {
        if (typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', listener);
        else if (typeof motionQuery.addListener === 'function') motionQuery.addListener(listener);
      } catch (e) {}
    }

    return {
      MOTION_MS: MOTION_MS,
      EASING: EASING,
      reduced: reduced,
      canAnimate: canAnimate,
      animateMany: animateMany,
      animateDisclosure: animateDisclosure,
      restoreAll: restoreAll,
      onReducedChange: onReducedChange,
      reset: reset,
      hidden: hidden,
      running: function () { return anims.size; }
    };
  }

  return {
    MOTION_MS: MOTION_MS,
    EASING: EASING,
    create: create
  };
});
