/*
 * app11/3d 球ビュー — detail のドック判定（純関数・DOM なし）
 *
 * 判定に使うのは「地図として実際に使える領域」だけ:
 *   canvas 全体 − 上部ヘッダ − 下部ツールバー/フッター
 * detail 自身の矩形は含めない（right/bottom を切り替えても判定が変わらず、
 * ハンチングしない）。ヘッダやツールバー（凡例の開閉を含む）の実測が
 * 変われば、そのぶん net 領域も変わる。
 *
 * 高さが幅より厳密に大きいときだけ bottom。等しい正方形は right。
 *
 * Node では require、ブラウザでは window.RP3DSphereDock。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RP3DSphereDock = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function positive(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  // viewport: canvas の CSS px。headRect/toolbarRect は canvas 左上基準。
  function netMapRect(viewport, headRect, toolbarRect) {
    var width = positive(viewport && viewport.width, 1);
    var height = positive(viewport && viewport.height, 1);
    var top = 0;
    var bottom = height;
    if (headRect && headRect.height > 0) {
      top = Math.max(top, Math.min(height, headRect.y + headRect.height));
    }
    if (toolbarRect && toolbarRect.height > 0) {
      bottom = Math.min(bottom, Math.max(0, toolbarRect.y));
    }
    if (!(bottom > top)) {
      // パネル同士が重なって空きが無い場合は canvas 全体へ戻す（0 幅にしない）。
      top = 0;
      bottom = height;
    }
    return {
      x: 0,
      y: top,
      width: width,
      height: Math.max(1, bottom - top)
    };
  }

  // 厳密に縦長のときだけ bottom。正方形・横長は right。
  function chooseDock(netRect) {
    if (!netRect) return 'right';
    return netRect.height > netRect.width ? 'bottom' : 'right';
  }

  // 下部ドックの detail 下端位置（アプリ下端からの px）。ツールバーの上に置く。
  function bottomOffset(viewportHeight, toolbarRect, gap) {
    var height = positive(viewportHeight, 1);
    var spacing = gap == null ? 10 : positive(gap, 10);
    if (toolbarRect && toolbarRect.height > 0) {
      var offset = height - toolbarRect.y + spacing;
      if (Number.isFinite(offset) && offset > 0) {
        return Math.min(height - spacing, offset);
      }
    }
    return spacing;
  }

  return {
    netMapRect: netMapRect,
    chooseDock: chooseDock,
    bottomOffset: bottomOffset
  };
});
