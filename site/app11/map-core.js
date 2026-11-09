/*
 * 有機反応マップ（試験版）— 表示計算の純関数
 *
 * DOM に触らない部分だけを集め、Node の回帰テストから同じ関数を検証できるようにする。
 * 位置・倍率の計算、semantic zoom の段階、検索の正規化、エッジの描画経路を扱う。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPMapCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // semantic zoom の境界。位置は動かさず、表示する要素だけを切り替える。
  var DETAIL_THRESHOLDS = [0.5, 1.0];
  var SCALE_MIN = 0.12;
  var SCALE_MAX = 3;
  var LABEL_HIDE_LEVEL = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function detailLevel(scale) {
    if (!(scale > 0)) return 0;
    if (scale < DETAIL_THRESHOLDS[0]) return 0;
    if (scale < DETAIL_THRESHOLDS[1]) return 1;
    return 2;
  }

  function levelNote(level) {
    if (level === 0) return '分野名のみ';
    if (level === 1) return '物質名を表示';
    return '反応種別と条件を表示';
  }

  // 全体が入る倍率と位置。余白は画面座標の px。
  function fitTransform(canvas, viewW, viewH, pad) {
    var p = typeof pad === 'number' ? pad : 14;
    var w = Math.max(1, viewW - p * 2);
    var h = Math.max(1, viewH - p * 2);
    var raw = Math.min(w / canvas.w, h / canvas.h);
    var scale = clamp(raw, SCALE_MIN, SCALE_MAX);
    return {
      scale: scale,
      x: (viewW - canvas.w * scale) / 2 - canvas.x * scale,
      y: (viewH - canvas.h * scale) / 2 - canvas.y * scale
    };
  }

  // ノード（左上座標 + 幅・高さ）を画面中央に置く。
  function centerOn(node, size, scale, viewW, viewH) {
    var cx = node.x + size.w / 2;
    var cy = node.y + size.h / 2;
    return { scale: scale, x: viewW / 2 - cx * scale, y: viewH / 2 - cy * scale };
  }

  function zoomAt(t, factor, sx, sy) {
    var next = clamp(t.scale * factor, SCALE_MIN, SCALE_MAX);
    var ratio = next / t.scale;
    return { scale: next, x: sx - (sx - t.x) * ratio, y: sy - (sy - t.y) * ratio };
  }

  // 地図が画面から完全に消えないように移動範囲を制限する。
  function clampPan(t, viewW, viewH, canvas, keep) {
    var guard = typeof keep === 'number' ? keep : 90;
    var left = canvas.x * t.scale + t.x;
    var top = canvas.y * t.scale + t.y;
    var right = left + canvas.w * t.scale;
    var bottom = top + canvas.h * t.scale;
    var x = t.x;
    var y = t.y;
    if (left > viewW - guard) x -= left - (viewW - guard);
    if (right < guard) x += guard - right;
    if (top > viewH - guard) y -= top - (viewH - guard);
    if (bottom < guard) y += guard - bottom;
    return { scale: t.scale, x: x, y: y };
  }

  function screenToWorld(t, sx, sy) {
    return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale };
  }

  function worldToScreen(t, wx, wy) {
    return { x: wx * t.scale + t.x, y: wy * t.scale + t.y };
  }

  function regionAt(regions, wx, wy) {
    for (var i = 0; i < regions.length; i++) {
      var p = regions[i].panel;
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) return regions[i];
    }
    return null;
  }

  // 分野ごとの表示に切り替えるときの倍率と位置。
  function regionView(region, viewW, viewH, pad) {
    var p = typeof pad === 'number' ? pad : 24;
    var raw = Math.min((viewW - p * 2) / region.panel.w, (viewH - p * 2) / region.panel.h);
    var scale = clamp(raw, DETAIL_THRESHOLDS[0], 1.6);
    return {
      scale: scale,
      x: viewW / 2 - (region.panel.x + region.panel.w / 2) * scale,
      y: viewH / 2 - (region.panel.y + region.panel.h / 2) * scale
    };
  }

  // 分野横断のエッジは弧にして、俯瞰でも埋もれないようにする。
  function edgePath(a, b, cross) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    if (!cross) {
      return 'M' + round(a.x) + ' ' + round(a.y) + 'L' + round(b.x) + ' ' + round(b.y);
    }
    var dist = Math.hypot(dx, dy) || 1;
    var bend = Math.min(140, 26 + dist * 0.08);
    var cx = (a.x + b.x) / 2 + (-dy / dist) * bend;
    var cy = (a.y + b.y) / 2 + (dx / dist) * bend;
    return 'M' + round(a.x) + ' ' + round(a.y) +
      'Q' + round(cx) + ' ' + round(cy) + ' ' + round(b.x) + ' ' + round(b.y);
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  function normalize(text) {
    var s = String(text == null ? '' : text);
    if (s.normalize) s = s.normalize('NFKC');
    return s.toLowerCase().replace(/[\s\u3000]+/g, '');
  }

  // 名称・別名・示性式・ID のいずれかに含まれれば一致とする。
  function matchCompounds(compounds, query) {
    var q = normalize(query);
    if (!q) return [];
    return compounds.filter(function (c) {
      if (normalize(c.name).indexOf(q) !== -1) return true;
      if (normalize(c.label).indexOf(q) !== -1) return true;
      if (normalize(c.formula).indexOf(q) !== -1) return true;
      return normalize(c.id).indexOf(q) !== -1;
    });
  }

  // 現在位置の表示文。全体表示か、どの分野・物質を見ているかを返す。
  function positionText(t, regions, selected, canvas, viewW, viewH) {
    var zoom = Math.round(t.scale * 100) + '%';
    if (isOverview(t, canvas, viewW, viewH)) return '全体表示（' + zoom + '）';
    var center = screenToWorld(t, viewW / 2, viewH / 2);
    var region = regionAt(regions, center.x, center.y);
    var parts = [];
    if (region) parts.push(region.name);
    if (selected) parts.push(selected.name);
    if (!parts.length) parts.push('地図の外側');
    return parts.join(' / ') + '（' + zoom + '）';
  }

  function isOverview(t, canvas, viewW, viewH) {
    var fit = fitTransform(canvas, viewW, viewH, 14);
    return Math.abs(t.scale - fit.scale) < 0.02 &&
      Math.abs(t.x - fit.x) < 24 && Math.abs(t.y - fit.y) < 24;
  }

  function shorten(text, max) {
    var s = String(text == null ? '' : text);
    if (s.length <= max) return s;
    return s.slice(0, Math.max(1, max - 1)) + '…';
  }

  function listJoin(items, empty) {
    if (!items || !items.length) return empty;
    return items.join('・');
  }

  // 0件の理由を状態区分と結びつける（未確認を不可能として扱わない）。
  function emptyReason(pathState, direction, states) {
    if (pathState === 'out-of-scope') {
      return '収録外: この分野の反応経路は、この地図の収録対象にしていません。';
    }
    if (pathState === 'impossible') {
      return '該当しない: 明確な根拠により成立しないと確認できた経路です（理由は個別情報を参照）。';
    }
    if (pathState === 'confirmed') {
      return direction === 'in'
        ? '確認済みの範囲では、この物質を生成する反応は見つかっていません。'
        : '確認済みの範囲では、この物質から進む反応は見つかっていません。';
    }
    return direction === 'in'
      ? '未確認: この地図に収録した確認済みの反応の中には、この物質を生成する経路が見つかっていません（「生成しない」という意味ではありません）。'
      : '未確認: この地図に収録した確認済みの反応の中には、この物質から進む経路が見つかっていません（「生成しない」という意味ではありません）。';
  }

  return {
    DETAIL_THRESHOLDS: DETAIL_THRESHOLDS,
    SCALE_MIN: SCALE_MIN,
    SCALE_MAX: SCALE_MAX,
    LABEL_HIDE_LEVEL: LABEL_HIDE_LEVEL,
    clamp: clamp,
    detailLevel: detailLevel,
    levelNote: levelNote,
    fitTransform: fitTransform,
    centerOn: centerOn,
    regionView: regionView,
    zoomAt: zoomAt,
    clampPan: clampPan,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    regionAt: regionAt,
    edgePath: edgePath,
    normalize: normalize,
    matchCompounds: matchCompounds,
    positionText: positionText,
    isOverview: isOverview,
    shorten: shorten,
    listJoin: listJoin,
    emptyReason: emptyReason
  };
});
