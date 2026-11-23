/*
 * app11-3d-opaque — ローカル比較専用（design-lab のみ・Pages 非配信）
 *
 * 「操作中だけ」Canvas の内部解像度（バッキングバッファ）を落とす薄いラッパー。
 * 正本 site/app11/3d/sphere-app.js は viewport() で
 *     dpr = Math.min(2, window.devicePixelRatio || 1)
 * を読み、canvas.width/height と ctx.setTransform(dpr,...) を同じ値から作る。
 * したがって、読み取り値だけを操作中に差し替えれば、
 * 変形行列とバッキングバッファは常に一致したまま（Desync しない）。
 *
 * 方針:
 *   - 常時は「正本と同じ」= min(2, ネイティブ dpr) をそのまま返す（ベースライン）
 *   - 操作中（ドラッグ / ホイール / ピンチ）だけ、次を満たす範囲で dpr を下げる
 *       * 常時解像度が 3M ピクセル以下なら何もしない（小さいスマホは無影響）
 *       * 操作中の上限は 1.25（opCap）かつピクセル予算 3M（budgetPx）
 *       * 0.75 未満にはしない（画質の下限）
 *       * 節約が 12% 未満なら切り替えない（解像度の往復を避ける）
 *   - 操作が終わったら、1 回だけ「ネイティブ解像度に戻した再描画」を要求する。
 *     再描画は正本の window resize ハンドラ（80ms デバウンス → resizeCanvas → render）
 *     に任せる。rAF / setInterval の常駐ループは持たない（ホイールの収束待ちだけ
 *     単発の setTimeout を 1 本使い、その都度 clear する）。
 *   - CSS の width/height・pointer 座標・投影・pick・fit には一切触れない。
 *     変わるのはバッキングバッファの画素数だけ。
 *
 * 比較方法（同一ページ・同一の不透明パネル/淡い境界のまま）:
 *   - 既定（縮小あり）: http://localhost:8000/design-lab/app11-3d-opaque/
 *   - 縮小なし（正本と同じ解像度）: ...?res=full
 *   - 縮小を明示（prefers-reduced-motion でも有効）: ...?res=cap
 *
 * Node では require（純関数をテスト用に公開）、ブラウザでは window.RPOpaqueResolution。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RPOpaqueResolution = api;
    api.boot(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULTS = {
    budgetPx: 3.0e6, // 操作中に許すバッキングバッファの画素数
    opCap: 1.25, // 操作中の dpr 上限
    nativeCap: 2, // 正本と同じ常時上限
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

  // 常時の dpr（正本と同じ値）。「停止後に戻す正確なベースライン」。
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
  //   full … 正本と同じ（常にネイティブ解像度）
  function resolveMode(search, reducedMotion) {
    var query = String(search == null ? '' : search);
    var match = /[?&]res=([^&]+)/i.exec(query.indexOf('?') === 0 ? query : '?' + query);
    var value = match ? decodeURIComponent(match[1]).toLowerCase() : '';
    if (value === 'cap' || value === 'on' || value === '1') return 'cap';
    if (value === 'full' || value === 'off' || value === '0') return 'full';
    // 既定: reduced-motion では解像度を動かさない（ちらつきを避ける）。
    return reducedMotion ? 'full' : 'cap';
  }

  function createController(options) {
    options = options || {};
    var o = optionsOf(options.options);
    var scope = options.root || (typeof window !== 'undefined' ? window : null);
    var document_ = options.document || (scope && scope.document) || null;
    var canvas = options.canvas || (document_ && document_.getElementById
      ? document_.getElementById('r3d-canvas')
      : null);
    var mode = options.mode || 'cap';

    var state = {
      mode: mode,
      operating: false,
      pointerIds: [],
      settleTimer: 0,
      started: false,
      dprPatched: false,
      bound: false,
      nativeDesc: null,
      nativeSnapshot: 1
    };

    function nativeDpr() {
      var desc = state.nativeDesc;
      if (desc && typeof desc.get === 'function') {
        try {
          return toPositive(desc.get.call(scope), state.nativeSnapshot);
        } catch (error) {
          /* 取得できない環境は初期値へ */
        }
      }
      return state.nativeSnapshot;
    }

    function cssWidth() {
      var value = canvas && (canvas.clientWidth || canvas.width);
      if (value) return value;
      return scope && scope.innerWidth ? scope.innerWidth : 1;
    }

    function cssHeight() {
      var value = canvas && (canvas.clientHeight || canvas.height);
      if (value) return value;
      return scope && scope.innerHeight ? scope.innerHeight : 1;
    }

    function currentDpr() {
      if (state.mode !== 'cap' || !state.operating) return baselineDpr(nativeDpr(), o);
      return effectiveDpr(cssWidth(), cssHeight(), nativeDpr(), true, o);
    }

    // ネイティブ dpr の読み取り経路を保存してから、このページ内だけ差し替える。
    function patchDpr() {
      if (state.dprPatched) return true;
      var holder = scope;
      var desc = null;
      while (holder && !desc) {
        desc = Object.getOwnPropertyDescriptor(holder, 'devicePixelRatio');
        holder = Object.getPrototypeOf(holder);
      }
      state.nativeDesc = desc;
      state.nativeSnapshot = desc
        ? (typeof desc.get === 'function'
          ? toPositive(desc.get.call(scope), 1)
          : toPositive(desc.value, 1))
        : toPositive(scope && scope.devicePixelRatio, 1);
      try {
        Object.defineProperty(scope, 'devicePixelRatio', {
          configurable: true,
          enumerable: true,
          get: function () {
            return currentDpr();
          },
          set: function () {
            // 正本の値は読み取り専用。このページ内の上書きも保存しない。
          }
        });
        state.dprPatched = true;
        return true;
      } catch (error) {
        return false;
      }
    }

    function expectedNativeWidth() {
      return Math.max(1, Math.round(cssWidth() * baselineDpr(nativeDpr(), o)));
    }

    function expectedNativeHeight() {
      return Math.max(1, Math.round(cssHeight() * baselineDpr(nativeDpr(), o)));
    }

    // 操作終了後、バッキングバッファがネイティブ解像度に戻っていなければ
    // 1 回だけ resize を投げる。正本は resize で resizeCanvas → render を行うため、
    // 「フル解像度での再描画がちょうど 1 回」になる。
    function requestNativeRedraw() {
      if (!canvas) return false;
      if (canvas.width === expectedNativeWidth() && canvas.height === expectedNativeHeight()) {
        return false;
      }
      if (scope && typeof scope.dispatchEvent === 'function') {
        try {
          var event = typeof scope.Event === 'function'
            ? new scope.Event('resize')
            : { type: 'resize' };
          scope.dispatchEvent(event);
          return true;
        } catch (error) {
          return false;
        }
      }
      return false;
    }

    function clearSettle() {
      if (!state.settleTimer) return;
      if (scope && typeof scope.clearTimeout === 'function') {
        scope.clearTimeout(state.settleTimer);
      } else if (typeof clearTimeout === 'function') {
        clearTimeout(state.settleTimer);
      }
      state.settleTimer = 0;
    }

    function begin(reason) {
      if (state.mode !== 'cap') return false;
      if (state.operating) return false;
      state.operating = true;
      state.reason = reason || '';
      return true;
    }

    function finish(reason) {
      if (!state.operating) return false;
      state.operating = false;
      state.reason = reason || '';
      clearSettle();
      return requestNativeRedraw();
    }

    function pointerIds() {
      return state.pointerIds;
    }

    function onPointerDown(event) {
      if (!event || event.pointerId == null) return;
      if (pointerIds().indexOf(event.pointerId) < 0) pointerIds().push(event.pointerId);
      clearSettle();
      begin('drag');
    }

    function onPointerEnd(event) {
      if (event && event.pointerId != null) {
        var index = pointerIds().indexOf(event.pointerId);
        if (index >= 0) pointerIds().splice(index, 1);
      }
      if (pointerIds().length) return; // ピンチで指が残っている間は操作中
      finish('pointerup');
    }

    function onWheel() {
      clearSettle();
      begin('wheel');
      if (state.mode !== 'cap') return;
      var setTimer = scope && typeof scope.setTimeout === 'function'
        ? scope.setTimeout.bind(scope)
        : setTimeout;
      state.settleTimer = setTimer(function () {
        state.settleTimer = 0;
        if (pointerIds().length) return; // ドラッグ中なら pointerup に任せる
        finish('wheel-idle');
      }, o.settleMs);
    }

    function onAbort() {
      state.pointerIds.length = 0;
      finish('abort');
    }

    function bind() {
      if (state.bound || !canvas || typeof canvas.addEventListener !== 'function') return false;
      canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
      canvas.addEventListener('pointerup', onPointerEnd, { passive: true });
      canvas.addEventListener('pointercancel', onPointerEnd, { passive: true });
      canvas.addEventListener('lostpointercapture', onPointerEnd, { passive: true });
      canvas.addEventListener('wheel', onWheel, { passive: true });
      if (scope && typeof scope.addEventListener === 'function') {
        scope.addEventListener('blur', onAbort, false);
        scope.addEventListener('pagehide', onAbort, false);
      }
      if (document_ && typeof document_.addEventListener === 'function') {
        document_.addEventListener('visibilitychange', function () {
          if (document_.hidden) onAbort();
        }, false);
      }
      state.bound = true;
      return true;
    }

    function start() {
      if (state.started) return state.started;
      if (state.mode !== 'cap') {
        state.started = true;
        return state.started;
      }
      if (!canvas) return false;
      if (!patchDpr()) return false;
      bind();
      state.started = true;
      return state.started;
    }

    function stop() {
      state.pointerIds.length = 0;
      clearSettle();
      state.operating = false;
      state.started = false;
      return requestNativeRedraw();
    }

    return {
      start: start,
      stop: stop,
      begin: begin,
      finish: finish,
      bind: bind,
      patchDpr: patchDpr,
      currentDpr: currentDpr,
      nativeDpr: nativeDpr,
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      requestNativeRedraw: requestNativeRedraw,
      getState: function () {
        return {
          mode: state.mode,
          operating: state.operating,
          started: state.started,
          reason: state.reason || '',
          dpr: currentDpr(),
          baseline: baselineDpr(nativeDpr(), o),
          canvasWidth: canvas ? canvas.width : 0,
          canvasHeight: canvas ? canvas.height : 0
        };
      }
    };
  }

  function boot(scope) {
    if (!scope || !scope.document) return null;
    var matchMedia = scope.matchMedia;
    var reduced = false;
    try {
      reduced = !!(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      reduced = false;
    }
    var mode = resolveMode(scope.location ? scope.location.search : '', reduced);
    if (mode !== 'cap') return null;
    var controller = createController({ root: scope, mode: mode });
    controller.start();
    return controller;
  }

  return {
    DEFAULTS: DEFAULTS,
    baselineDpr: baselineDpr,
    effectiveDpr: effectiveDpr,
    pixelCount: pixelCount,
    quantize: quantize,
    resolveMode: resolveMode,
    createController: createController,
    boot: boot
  };
});
