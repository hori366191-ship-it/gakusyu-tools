/*
 * app11-3d-opaque — ローカル比較専用（design-lab のみ・Pages 非配信）
 *
 * 正本 site/app11/3d/renderer.js の drawTerritory は、分野境界を描くたびに
 * ctx.shadowColor（境界色の alpha 0.3）と ctx.shadowBlur = TERRITORY_STYLE.borderGlowBlur
 * を設定する。これが「常時グロー」で、再描画のたびに必ず点く。
 *
 * この薄いラッパーは、その Canvas 2D コンテキストの shadowBlur 代入だけを
 * 透過的に監視し、次の条件が「両方」そろったときだけ 0 に落とす:
 *   1. 直前の shadowColor が TERRITORY_STYLE.borderGlowAlpha（0.3）の rgba
 *   2. 代入する shadowBlur が TERRITORY_STYLE.borderGlowBlur（6）と同値
 * どちらかが違えば素通しする。選択カード(18/8)・選択経路(9)・選択マーカー(16)・
 * マッチカード(8) のグローは値が違うため一切抑制されない。
 *
 * さらに、同じシグネチャ（グロー色 + blur 6 の直後）で呼ばれる ctx.stroke() だけを
 * 分野境界の実線と見なし、線の見た目だけを差し替える:
 *   - 色はパレットの混色ではなく、白寄りの青灰色（rgb(214,224,238) など）
 *   - 細い実線 + 近不透明の芯（外側にだけ淡い縁を 1 回重ねる。ぼかしは使わない）
 *   - 選択中（dimmed）は芯だけを薄くして経路を目立たせる
 *   - 塗り（分野の半透明面）・経路・カード・ジオメトリ・線幅の意味は変えない
 * どの状態かは、正本が stroke 直前に代入する ctx.globalAlpha
 * （borderAlpha / borderAlphaActive / borderAlphaDimmed）で判定する。
 *
 * 正本モジュールは書き換えず、R.drawScene / drawTerritory の差し替えもしない
 *（ガード: このファイルに drawScene / drawTerritory の再代入は無い）。
 * 変形行列・バッキングバッファ（canvas.width/height）には触れない。
 *
 * Node では require（テスト用に純関数と install を公開）、ブラウザでは
 * window.RPOpaqueGlow として #r3d-canvas の getContext('2d') に自動適用する。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RPOpaqueGlow = api;
    api.boot(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;
  var DEFAULT_GLOW_BLUR = 6;
  var DEFAULT_GLOW_ALPHA = 0.3;

  // 分野境界の見た目（ローカル実験値）。塗りには適用しない。
  // 色は「白寄りの青灰色」で、暗い球面でも境界だけが輪郭として読める値。
  var BORDER_STYLE = {
    rest: { color: 'rgb(214, 224, 238)', alpha: 0.86, width: 1.1, edgeAlpha: 0.26, edgeWidth: 2.4 },
    active: { color: 'rgb(228, 238, 250)', alpha: 0.95, width: 1.3, edgeAlpha: 0.3, edgeWidth: 2.7 },
    dimmed: { color: 'rgb(168, 184, 204)', alpha: 0.34, width: 1, edgeAlpha: 0, edgeWidth: 0 }
  };

  // 'rgba(r,g,b,a)' / 'rgb(r,g,b)' の alpha。解釈できなければ null。
  function alphaOf(value) {
    var m = RGBA.exec(String(value == null ? '' : value).trim());
    if (!m) return null;
    if (m[4] == null) return 1;
    var a = parseFloat(m[4]);
    return isFinite(a) ? a : null;
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function near(a, b) {
    return isFinite(a) && isFinite(b) && Math.abs(a - b) < 1e-6;
  }

  // 純関数: 正本が stroke 直前に代入した globalAlpha から境界の状態を決める。
  function borderMode(alpha, territoryStyle) {
    var territory = territoryStyle || {};
    if (near(alpha, toNumber(territory.borderAlphaDimmed, NaN))) return 'dimmed';
    if (near(alpha, toNumber(territory.borderAlphaActive, NaN))) return 'active';
    return 'rest';
  }

  // 純関数: 実線の描画プラン（状態 + ローカル見た目）。塗りには使わない。
  function borderStrokePlan(alpha, options) {
    options = options || {};
    var mode = borderMode(alpha, options.style);
    var table = options.borderStyle || BORDER_STYLE;
    var paint = table[mode] || BORDER_STYLE.rest;
    return {
      mode: mode,
      color: paint.color,
      alpha: paint.alpha,
      width: paint.width,
      edgeAlpha: toNumber(paint.edgeAlpha, 0),
      edgeWidth: toNumber(paint.edgeWidth, 0)
    };
  }

  // 純関数: shadowColor / shadowBlur の代入を順に渡すだけの小さな状態機械。
  //  suppresses: 直前の shadowBlur で「境界グロー」を落としたか（= 次の stroke が境界）。
  function createGlowFilter(options) {
    options = options || {};
    var style = options.style || {};
    var glowBlur = toNumber(style.borderGlowBlur, DEFAULT_GLOW_BLUR);
    var glowAlpha = toNumber(style.borderGlowAlpha, DEFAULT_GLOW_ALPHA);
    var armed = false;
    var borderPending = false;
    function alphaMatches(value) {
      var a = alphaOf(value);
      return a != null && Math.abs(a - glowAlpha) < 1e-6;
    }
    return {
      shadowColor: function (value) {
        // 境界グロー色のときだけ「次は blur を落とす」候補にする。
        armed = alphaMatches(value);
      },
      shadowBlur: function (value) {
        var number = toNumber(value, NaN);
        var suppressed = armed && number === glowBlur;
        armed = false;
        borderPending = suppressed;
        return suppressed ? 0 : value;
      },
      // 次の stroke が分野境界か（読むと 1 回だけ消費する）。
      consumeBorder: function () {
        var pending = borderPending;
        borderPending = false;
        return pending;
      },
      isArmed: function () {
        return armed;
      },
      isBorderPending: function () {
        return borderPending;
      }
    };
  }

  // ctx 自身かプロトタイプ鎖からプロパティ記述子を探す。
  function findDescriptor(obj, prop) {
    var target = obj;
    while (target) {
      var desc = Object.getOwnPropertyDescriptor(target, prop);
      if (desc) return desc;
      target = Object.getPrototypeOf(target);
    }
    return null;
  }

  // 境界の stroke だけを「白寄りの青灰色・細い実線 + 近不透明の芯」で描き直す。
  // 呼び出し側（正本）が設定した strokeStyle / lineWidth / globalAlpha は
  // 描画後に必ず元へ戻す（後続の描画状態を汚さない）。
  function installStroke(ctx, filter, options) {
    var nativeStroke = ctx.stroke;
    if (typeof nativeStroke !== 'function') return false;
    try {
      Object.defineProperty(ctx, 'stroke', {
        configurable: true,
        writable: true,
        value: function () {
          if (!filter.consumeBorder()) return nativeStroke.apply(ctx, arguments);
          var plan = borderStrokePlan(ctx.globalAlpha, options || {});
          var prevStroke = ctx.strokeStyle;
          var prevWidth = ctx.lineWidth;
          var prevAlpha = ctx.globalAlpha;
          try {
            // 1) 外側の淡い縁（ぼかしではなく、細い実線の重ね描き）。
            if (plan.edgeAlpha > 0 && plan.edgeWidth > plan.width) {
              ctx.strokeStyle = plan.color;
              ctx.lineWidth = plan.edgeWidth;
              ctx.globalAlpha = plan.edgeAlpha;
              nativeStroke.apply(ctx, arguments);
            }
            // 2) 近不透明の芯。
            ctx.strokeStyle = plan.color;
            ctx.lineWidth = plan.width;
            ctx.globalAlpha = plan.alpha;
            nativeStroke.apply(ctx, arguments);
          } finally {
            ctx.strokeStyle = prevStroke;
            ctx.lineWidth = prevWidth;
            ctx.globalAlpha = prevAlpha;
          }
          return undefined;
        }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  // ctx に shadowBlur の抑制と境界線の見た目差し替えを「透過的に」差し込む。
  // ネイティブのアクセサはそのまま呼び出すので、他の描画状態は変わらない。
  function install(ctx, options) {
    if (!ctx) return false;
    if (ctx.__rpOpaqueGlow === true) return true;
    var filter = createGlowFilter(options);
    var colorDesc = findDescriptor(ctx, 'shadowColor');
    var blurDesc = findDescriptor(ctx, 'shadowBlur');
    var colorValue = colorDesc && typeof colorDesc.get === 'function'
      ? colorDesc.get.call(ctx)
      : ctx.shadowColor;
    var blurValue = blurDesc && typeof blurDesc.get === 'function'
      ? blurDesc.get.call(ctx)
      : ctx.shadowBlur;
    try {
      Object.defineProperty(ctx, 'shadowColor', {
        configurable: true,
        enumerable: true,
        get: function () {
          return colorDesc && typeof colorDesc.get === 'function'
            ? colorDesc.get.call(ctx)
            : colorValue;
        },
        set: function (value) {
          filter.shadowColor(value);
          if (colorDesc && typeof colorDesc.set === 'function') {
            colorDesc.set.call(ctx, value);
          } else {
            colorValue = value;
          }
        }
      });
      Object.defineProperty(ctx, 'shadowBlur', {
        configurable: true,
        enumerable: true,
        get: function () {
          return blurDesc && typeof blurDesc.get === 'function'
            ? blurDesc.get.call(ctx)
            : blurValue;
        },
        set: function (value) {
          var next = filter.shadowBlur(value);
          if (blurDesc && typeof blurDesc.set === 'function') {
            blurDesc.set.call(ctx, next);
          } else {
            blurValue = next;
          }
        }
      });
      installStroke(ctx, filter, options);
      Object.defineProperty(ctx, '__rpOpaqueGlow', {
        value: true,
        configurable: true
      });
      return true;
    } catch (error) {
      // コンテキストが拡張できない環境ではグローを残す（安全側）。
      return false;
    }
  }

  function styleOf(root) {
    var renderer = root && root.RP3DRenderer;
    return (renderer && renderer.TERRITORY_STYLE) || null;
  }

  // 対象 canvas の getContext だけを包む。他の canvas には影響しない。
  function patchCanvas(canvas, options) {
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    if (canvas.__rpOpaqueGlowPatched === true) return true;
    var original = canvas.getContext;
    try {
      canvas.getContext = function (type) {
        var ctx = original.apply(this, arguments);
        if (ctx && /^2d$/i.test(String(type))) install(ctx, options);
        return ctx;
      };
      Object.defineProperty(canvas, '__rpOpaqueGlowPatched', {
        value: true,
        configurable: true
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  function boot(root) {
    if (!root || !root.document) return;
    var doc = root.document;
    var apply = function () {
      var canvas = doc.getElementById && doc.getElementById('r3d-canvas');
      if (canvas) patchCanvas(canvas, { style: styleOf(root) });
    };
    if (doc.getElementById && doc.getElementById('r3d-canvas')) {
      apply();
    } else if (doc.addEventListener) {
      // 念のため: このスクリプトが canvas より前に読まれても初期化前に間に合う。
      doc.addEventListener('DOMContentLoaded', apply);
    }
  }

  return {
    BORDER_STYLE: BORDER_STYLE,
    alphaOf: alphaOf,
    borderMode: borderMode,
    borderStrokePlan: borderStrokePlan,
    createGlowFilter: createGlowFilter,
    install: install,
    patchCanvas: patchCanvas,
    boot: boot
  };
});
