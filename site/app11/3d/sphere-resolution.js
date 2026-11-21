/*
 * app11/3d 球ビュー — 操作中だけ Canvas 内部解像度を落とす方針（純関数・DOM なし）
 *
 * 正本の契約は変えない:
 *   sphere-app.js の viewport() が返す dpr から canvas.width/height と
 *   ctx.setTransform(dpr, …) を「同じ値」で作るため、dpr だけを差し替えれば
 *   変形行列とバッキングバッファは常に一致する。CSS サイズ・pointer 座標・
 *   投影・pick・fit には触れない（変わるのはバッキングの画素数だけ）。
 *
 * 方針:
 *   - 常時は従来どおり min(2, ネイティブ dpr)。停止後もこの正確な値へ戻す
 *   - 操作中（ドラッグ / ホイール / ピンチ）だけ、次を満たす範囲で dpr を下げる
 *       * 常時解像度が 3M ピクセル以下なら何もしない（小さいスマホは無影響）
 *       * 操作中の上限 1.25（opCap）かつピクセル予算 3M（budgetPx）
 *       * 0.75 未満にはしない（画質の下限）
 *       * 節約が 12% 未満なら切り替えない（往復のちらつき防止）
 *   - 操作が終わったら onIdle を 1 回だけ呼ぶ。呼び出し側（sphere-app）は
 *     既存の scheduler（requestRender → render → resizeCanvas）でフル解像度の
 *     再描画をちょうど 1 回行う。常駐 rAF / setInterval は持たない
 *     （ホイールの収束待ちだけ単発タイマーを都度 clear する）。
 *   - `?res=full` で無効化、`?res=cap` で reduced-motion でも明示的に有効化。
 *     既定は reduced-motion で無効（ちらつきを避ける）。
 *   - window.devicePixelRatio や Canvas のアクセサは書き換えない（DOM 非依存）。
 *
 * Node では require、ブラウザでは window.RP3DSphereResolution。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RP3DSphereResolution = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = {
    budgetPx: 3.0e6, // 操作中に許すバッキングバッファの画素数
    opCap: 1.25, // 操作中の dpr 上限
    nativeCap: 2, // 常時の上限（従来どおり）
    minDpr: 0.75, // 操作中の dpr 下限（画質の床）
    minGain: 0.12, // これ未満の節約なら切り替えない
    settleMs: 160, // ホイールの収束待ち
    quantizeStep: 0.05 // dpr の量子化（往復のちらつき防止）
  };

  function optionsOf(options) {
    var out = {};
    var key;
    for (key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) out[key] = DEFAULTS[key];
    }
    if (options) {
      for (key in options) {
        if (Object.prototype.hasOwnProperty.call(options, key) && options[key] != null) {
          out[key] = options[key];
        }
      }
    }
    return out;
  }

  function toPositive(value, fallback) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function pxSize(value) {
    return Math.max(1, toPositive(value, 1));
  }

  function pixelCount(width, height, dpr) {
    return pxSize(width) * pxSize(height) * dpr * dpr;
  }

  // 常時の dpr（従来と同じ値）。「停止後に戻す正確なベースライン」。
  function baselineDpr(nativeDpr, options) {
    var o = optionsOf(options);
    return Math.min(o.nativeCap, toPositive(nativeDpr, 1));
  }

  function quantize(value, step) {
    var s = toPositive(step, 0.05);
    return Math.floor(value / s + 1e-9) * s;
  }

  // 純関数: 操作中かどうかと CSS サイズ・ネイティブ dpr から実効 dpr を返す。
  // operating=false のときは常に baselineDpr（正確な復帰値）。
  function effectiveDpr(cssWidth, cssHeight, nativeDpr, operating, options) {
    var o = optionsOf(options);
    var base = baselineDpr(nativeDpr, o);
    if (!operating) return base;
    var w = pxSize(cssWidth);
    var h = pxSize(cssHeight);
    if (pixelCount(w, h, base) <= o.budgetPx) return base; // 小さい画面は無影響
    var fromBudget = Math.sqrt(o.budgetPx / (w * h));
    var next = Math.min(base, o.opCap, fromBudget);
    next = Math.max(Math.min(o.minDpr, base), next);
    next = Math.min(base, quantize(next, o.quantizeStep));
    if (base - next < o.minGain * base) return base; // 節約が小さいなら触らない
    return next;
  }

  // 純関数: ?res=cap / ?res=full と reduced-motion からモードを決める。
  //   cap  … 操作中の解像度低下を使う
  //   full … 従来どおり（常にネイティブ解像度）
  function resolveMode(search, reducedMotion) {
    var query = String(search == null ? '' : search);
    var match = /[?&]res=([^&]+)/i.exec(query.indexOf('?') === 0 ? query : '?' + query);
    var value = match ? decodeURIComponent(match[1]).toLowerCase() : '';
    if (value === 'cap' || value === 'on' || value === '1') return 'cap';
    if (value === 'full' || value === 'off' || value === '0') return 'full';
    // 既定: reduced-motion では解像度を動かさない（ちらつきを避ける）。
    return reducedMotion ? 'full' : 'cap';
  }

  // 入力イベント（pointer / wheel / abort）を渡すだけの小さな状態機械。
  // DOM には触らない（配線は sphere-app.js の既存ハンドラが行う）。
  function createController(options) {
    options = options || {};
    var o = optionsOf(options.options);
    var mode = options.mode === 'full' ? 'full' : 'cap';
    var timers = options.timers || {};
    var setTimer = timers.setTimeout ||
      (typeof setTimeout === 'function' ? setTimeout : null);
    var clearTimer = timers.clearTimeout ||
      (typeof clearTimeout === 'function' ? clearTimeout : null);
    var onIdle = typeof options.onIdle === 'function' ? options.onIdle : null;

    var pointers = [];
    var operating = false;
    var settleTimer = 0;
    var reason = '';
    // 操作中に実際に低い dpr が使われたか（復帰の再描画が要るか）。
    var capped = false;

    // このページの実効 dpr。常時は従来と同じ、操作中だけ cap。
    function dprFor(cssWidth, cssHeight, nativeDpr) {
      var base = baselineDpr(nativeDpr, o);
      if (mode !== 'cap' || !operating) return base;
      var next = effectiveDpr(cssWidth, cssHeight, nativeDpr, true, o);
      if (next < base) capped = true;
      return next;
    }

    function clearSettle() {
      if (!settleTimer) return;
      if (clearTimer) clearTimer(settleTimer);
      settleTimer = 0;
    }

    function begin(nextReason) {
      if (mode !== 'cap') return false;
      if (operating) return false;
      operating = true;
      reason = nextReason || '';
      capped = false;
      return true;
    }

    function finish(nextReason) {
      if (!operating) return false;
      operating = false;
      reason = nextReason || '';
      clearSettle();
      // 低解像度で描いたときだけ復帰を要求する（無駄なフル再描画をしない）。
      var needsRestore = capped;
      capped = false;
      if (needsRestore && onIdle) onIdle();
      return needsRestore;
    }

    function indexOfPointer(id) {
      for (var i = 0; i < pointers.length; i++) {
        if (pointers[i] === id) return i;
      }
      return -1;
    }

    function pointerDown(id) {
      if (id == null) return false;
      if (indexOfPointer(id) < 0) pointers.push(id);
      clearSettle();
      return begin('drag');
    }

    function pointerEnd(id, nextReason) {
      if (id != null) {
        var index = indexOfPointer(id);
        if (index >= 0) pointers.splice(index, 1);
      }
      if (pointers.length) return false; // ピンチで指が残っている間は操作中
      return finish(nextReason || 'pointerup');
    }

    // ホイールは収束待ちの単発タイマーで閉じる（ドラッグ中なら pointerup に任せる）。
    function wheel() {
      if (mode !== 'cap') return false;
      clearSettle();
      begin('wheel');
      if (!setTimer) {
        finish('wheel-idle');
        return true;
      }
      settleTimer = setTimer(function () {
        settleTimer = 0;
        if (pointers.length) return;
        finish('wheel-idle');
      }, o.settleMs);
      return true;
    }

    function abort() {
      pointers.length = 0;
      return finish('abort');
    }

    function stop() {
      pointers.length = 0;
      clearSettle();
      operating = false;
    }

    return {
      mode: mode,
      dprFor: dprFor,
      begin: begin,
      finish: finish,
      pointerDown: pointerDown,
      pointerUp: function (id) { return pointerEnd(id, 'pointerup'); },
      pointerCancel: function (id) { return pointerEnd(id, 'cancel'); },
      wheel: wheel,
      abort: abort,
      stop: stop,
      isOperating: function () { return operating; },
      getState: function () {
        return {
          mode: mode,
          operating: operating,
          reason: reason,
          pointers: pointers.slice()
        };
      }
    };
  }

  return {
    DEFAULTS: DEFAULTS,
    baselineDpr: baselineDpr,
    effectiveDpr: effectiveDpr,
    pixelCount: pixelCount,
    quantize: quantize,
    resolveMode: resolveMode,
    createController: createController
  };
});
