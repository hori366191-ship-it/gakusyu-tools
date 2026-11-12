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
  var SCALE_MIN = 0.05;
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
      if (!p) continue;
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) return regions[i];
    }
    return null;
  }

  // 分野ごとの表示に切り替えるときの倍率と位置。分野はパネルではなく、
  // 反応に関与する物質＋反応ラベルの範囲（focus）でフィットする。
  function regionView(region, viewW, viewH, pad) {
    var r = region.focus || region.panel;
    if (!r) return fitTransform({ x: 0, y: 0, w: 1, h: 1 }, viewW, viewH, pad);
    var p = typeof pad === 'number' ? pad : 24;
    var raw = Math.min((viewW - p * 2) / r.w, (viewH - p * 2) / r.h);
    var scale = clamp(raw, 0.08, 1.8);
    return {
      scale: scale,
      x: viewW / 2 - (r.x + r.w / 2) * scale,
      y: viewH / 2 - (r.y + r.h / 2) * scale
    };
  }

  // 矩形（反応の端点など）を画面に収める。
  function fitRect(r, viewW, viewH, pad, minScale, maxScale) {
    var p = typeof pad === 'number' ? pad : 32;
    var lo = typeof minScale === 'number' ? minScale : SCALE_MIN;
    var hi = typeof maxScale === 'number' ? maxScale : 1.8;
    var raw = Math.min((viewW - p * 2) / Math.max(1, r.w), (viewH - p * 2) / Math.max(1, r.h));
    var scale = clamp(raw, lo, hi);
    return {
      scale: scale,
      x: viewW / 2 - (r.x + r.w / 2) * scale,
      y: viewH / 2 - (r.y + r.h / 2) * scale
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

  /*
   * 保存済みの折れ線を SVG パスにする。gaps は「下を通る辺」の切れ目（交差・重なりの分断）。
   * 位置は生成時に固定されているので、閲覧時に経路を計算し直さない。
   */
  function routePath(points, gaps, bridges) {
    var pts = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      pts.push(Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });
    }
    if (pts.length < 2) return '';
    var gapList = gaps || [];
    if (!gapList.length && bridges && bridges.length) return bumpPath(pts, bridges);
    var intervals = [];
    for (var g = 0; g < gapList.length; g++) {
      var gp = gapList[g];
      var target = Array.isArray(gp) ? { x: gp[0], y: gp[1] } : { x: gp.x, y: gp.y };
      var projected = projectOnPolyline(pts, target);
      if (projected.distance == null) continue;
      intervals.push([projected.distance - 3, projected.distance + 3]);
    }
    intervals.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    for (var k = 0; k < intervals.length; k++) {
      var cur = intervals[k];
      var last = merged[merged.length - 1];
      if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else merged.push([cur[0], cur[1]]);
    }
    if (!merged.length) return polylineD(pts);

    var samples = [];
    var total = 0;
    for (var s = 0; s < pts.length; s++) {
      samples.push({ d: total, p: pts[s], event: 'vertex' });
      if (s < pts.length - 1) {
        total += Math.hypot(pts[s + 1].x - pts[s].x, pts[s + 1].y - pts[s].y);
      }
    }
    for (var m = 0; m < merged.length; m++) {
      var a = pointAtDistance(pts, merged[m][0]);
      var b = pointAtDistance(pts, merged[m][1]);
      if (a) samples.push({ d: merged[m][0], p: a, event: 'gap-start' });
      if (b) samples.push({ d: merged[m][1], p: b, event: 'gap-end' });
    }
    samples.sort(function (x, y) {
      if (x.d !== y.d) return x.d - y.d;
      var order = { 'gap-start': 0, vertex: 1, 'gap-end': 2 };
      return order[x.event] - order[y.event];
    });

    var out = [];
    var current = [];
    for (var q = 0; q < samples.length; q++) {
      var sample = samples[q];
      if (sample.event === 'gap-start') {
        current.push(sample.p);
        if (current.length > 1) out.push(current);
        current = [];
      } else if (sample.event === 'gap-end') {
        current = [sample.p];
      } else if (current.length) {
        current.push(sample.p);
      } else {
        current = [sample.p];
      }
    }
    if (current.length > 1) out.push(current);
    return out.map(polylineD).join('');
  }

  function polylineD(pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return 'M' + round(pts[0].x) + ' ' + round(pts[0].y) + 'L' + round(pts[1].x) + ' ' + round(pts[1].y);
    var d = 'M' + round(pts[0].x) + ' ' + round(pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var prev = pts[i - 1];
      var cur = pts[i];
      var next = pts[i + 1];
      var l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      var l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
      var r = Math.min(2.5, l1 / 2, l2 / 2);
      if (r < 0.5) {
        d += 'L' + round(cur.x) + ' ' + round(cur.y);
        continue;
      }
      var ax = cur.x + ((prev.x - cur.x) / l1) * r;
      var ay = cur.y + ((prev.y - cur.y) / l1) * r;
      var bx = cur.x + ((next.x - cur.x) / l2) * r;
      var by = cur.y + ((next.y - cur.y) / l2) * r;
      d += 'L' + round(ax) + ' ' + round(ay) + 'Q' + round(cur.x) + ' ' + round(cur.y) + ' ' + round(bx) + ' ' + round(by);
    }
    var last = pts[pts.length - 1];
    return d + 'L' + round(last.x) + ' ' + round(last.y);
  }

  /*
   * 浅い交差に小さな橋（バンプ）を付ける。辺は分断しない。
   * bridges は保存済みの点列上の座標。前後の 4px を直線、中央を小さな円弧にする。
   */
  function bumpPath(pts, bridges) {
    var total = 0;
    var ds = [0];
    for (var i = 0; i < pts.length - 1; i++) {
      total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      ds.push(total);
    }
    var events = [];
    for (var b = 0; b < bridges.length; b++) {
      var bp = Array.isArray(bridges[b]) ? { x: bridges[b][0], y: bridges[b][1] } : bridges[b];
      var pr = projectOnPolyline(pts, bp);
      if (pr.distance == null || pr.offset > 12) continue;
      events.push(pr.distance);
    }
    if (!events.length) return polylineD(pts);
    events.sort(function (a, b) { return a - b; });
    var merged = [];
    for (var e = 0; e < events.length; e++) {
      if (!merged.length || events[e] - merged[merged.length - 1] > 9) merged.push(events[e]);
    }
    var d = 'M' + round(pts[0].x) + ' ' + round(pts[0].y);
    var vi = 1;
    for (var m = 0; m < merged.length; m++) {
      var center = merged[m];
      var d0 = Math.max(0, center - 4);
      var d1 = Math.min(total, center + 4);
      while (vi < pts.length && ds[vi] <= d0) {
        d += 'L' + round(pts[vi].x) + ' ' + round(pts[vi].y);
        vi++;
      }
      var p0 = pointAtDistance(pts, d0);
      var p1 = pointAtDistance(pts, d1);
      if (!p0 || !p1) continue;
      var mx = (p0.x + p1.x) / 2;
      var my = (p0.y + p1.y) / 2;
      var tx = p1.x - p0.x;
      var ty = p1.y - p0.y;
      var tl = Math.hypot(tx, ty) || 1;
      var cx = mx + (-ty / tl) * 3.2;
      var cy = my + (tx / tl) * 3.2;
      d += 'L' + round(p0.x) + ' ' + round(p0.y) +
        'Q' + round(cx) + ' ' + round(cy) + ' ' + round(p1.x) + ' ' + round(p1.y);
      while (vi < pts.length && ds[vi] <= d1) vi++;
    }
    while (vi < pts.length) {
      d += 'L' + round(pts[vi].x) + ' ' + round(pts[vi].y);
      vi++;
    }
    return d;
  }

  function pointAtDistance(pts, distance) {
    var remain = Math.max(0, distance);
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i];
      var b = pts[i + 1];
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-9) continue;
      if (remain <= len) {
        var t = remain / len;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      remain -= len;
    }
    return null;
  }

  function projectOnPolyline(pts, point) {
    var best = Infinity;
    var bestDistance = null;
    var walked = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i];
      var b = pts[i + 1];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var px = a.x + dx * t;
      var py = a.y + dy * t;
      var d = Math.hypot(point.x - px, point.y - py);
      if (d < best) {
        best = d;
        bestDistance = walked + Math.sqrt(len2) * t;
      }
      walked += Math.sqrt(len2);
    }
    return { distance: bestDistance, offset: best };
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

  // 現在位置の表示文。明示的に選んだ分類（activeRegionId）を最優先し、
  // なければ画面中央に最も近い物質の分野を返す。
  function positionText(t, regions, compounds, selected, canvas, viewW, viewH, activeRegionId) {
    var zoom = Math.round(t.scale * 100) + '%';
    var parts = [];
    if (activeRegionId) {
      for (var i = 0; i < regions.length; i++) {
        if (regions[i].id === activeRegionId) {
          parts.push(regions[i].name);
          break;
        }
      }
      if (!parts.length) parts.push('選択中の分類');
      if (selected) parts.push(selected.name);
      return parts.join(' / ') + '（' + zoom + '）';
    }
    if (isOverview(t, canvas, viewW, viewH)) return '全体表示（' + zoom + '）';
    var center = screenToWorld(t, viewW / 2, viewH / 2);
    var nearest = nearestCompound(compounds, center.x, center.y);
    var region = null;
    if (nearest) {
      for (var j = 0; j < regions.length; j++) {
        if (regions[j].id === nearest.region) {
          region = regions[j];
          break;
        }
      }
    }
    if (region) parts.push(region.name);
    if (selected) parts.push(selected.name);
    if (!parts.length) parts.push('地図の外側');
    return parts.join(' / ') + '（' + zoom + '）';
  }

  function nearestCompound(compounds, wx, wy) {
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < compounds.length; i++) {
      var c = compounds[i];
      var dx = c.x + 68 - wx;
      var dy = c.y + 17 - wy;
      var d = dx * dx + dy * dy;
      if (d < bestDistance) {
        bestDistance = d;
        best = c;
      }
    }
    return best;
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
    fitRect: fitRect,
    centerOn: centerOn,
    regionView: regionView,
    nearestCompound: nearestCompound,
    zoomAt: zoomAt,
    clampPan: clampPan,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    regionAt: regionAt,
    edgePath: edgePath,
    routePath: routePath,
    normalize: normalize,
    matchCompounds: matchCompounds,
    positionText: positionText,
    isOverview: isOverview,
    shorten: shorten,
    listJoin: listJoin,
    emptyReason: emptyReason
  };
});
