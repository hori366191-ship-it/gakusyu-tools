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
  // 反応線・一般図の変換線の透明な当たり判定の幅（画面ピクセル）。CSS と必ず同じ値にする。
  var HIT_WIDTH = 18;
  var SCALE_MIN = 0.05;
  var SCALE_MAX = 3;
  var LABEL_HIDE_LEVEL = 0;

  /*
   * 接続（connector）の描画規則。データの保存点列は動かさず、描画時だけ端点を
   * 実際の角丸枠・stroke・arrow tip に合わせる。通常・選択・プレビュー・一般図で同じ値を使う。
   *
   * - 反応ハブの半径10の点は描画では使わず、内部モデルとしてハブ中心で連続させる。
   * - 物質側の端点は rx=9 の角丸輪郭から EDGE_GAP 離す。
   * - 矢印は marker-end ではなく、shaft と分離した triangle を別 path で描く。
   *   shaft は triangle の底まで trim するため、太い stroke の端が tip を追い越さない。
   * - 線端は butt（丸 cap の飛び出しなし）。source の実 gap は stroke 幅に依存しない。
   * - tip の基準 stroke は通常表示の実測（node 1.2/1.6, class 1.4）に合わせ、
   *   node 選択時（3 / 2.8）でも tip が枠に食い込まない値にする。
   */
  var CONNECTOR = {
    NODE_RX: 9,
    // ノード境界の stroke は全 state で一定。選択/フォーカスは色と halo で示す。
    // したがって gap は「実ストローク外周から」で全 state 同じ値になる。
    NODE_STROKE: 1.2,
    HUB_STROKE: 1.6,
    CLASS_STROKE: 1.4,
    EDGE_GAP: 0.75,
    // path 出力の丸め・ブラウザ描画の微小差を吸収する生成時マージン。
    PAINT_SAFETY: 0.01,
    // refX=8 は旧markerの名残。triangle tip を path 終点に置く考え方は維持する。
    ARROW_REF_X: 8,
    ARROW_SIZE: { primary: 7, secondary: 5.5, class: 6 },
    // 選択・preview を含む最大の線幅。paint外形の検査に使う。
    // showReactionStroke は tier に関係なく .rp-edge-active 4.4 を使う。
    MAX_PAINT_STROKE: { primary: 4.4, secondary: 4.4, class: 3.4 },
    TIER_STROKE: { primary: 3, secondary: 1.1, class: 1.6 },
    CAP_STROKE: { primary: 3, secondary: 1.1, class: 1.6 },
    PORT_SPACING: 7, // 別反応の近接port間隔（最大stroke4.4 + gap + 余裕）
    PORT_CLUSTER: 12 // この距離以内のportを同じclusterとして分離
  };

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

  /* ホイール1ノッチ（deltaY = 100px）で 1.35 倍。行・ページ単位は px へ正規化し、
     トラックパッドの微小 delta はそのまま比例させる（勝手に丸めない）。
     1イベントの変化は 3ノッチ分で頭打ちにし、行単位・ページ単位の入力でも飛ばさない。 */
  var WHEEL = {
    NOTCH_PX: 100,
    NOTCH_FACTOR: 1.35,
    MAX_NOTCHES: 3,
    LINE_PX: 100 / 3, // 3行 = 1ノッチ（Firefox の行単位入力）
    PAGE_PX: 800 // viewH が取れないときのページ単位の既定
  };

  function normalizeWheelDelta(deltaY, deltaMode, viewH) {
    var d = Number(deltaY);
    if (!isFinite(d) || d === 0) return 0;
    if (deltaMode === 1) return d * WHEEL.LINE_PX;
    if (deltaMode === 2) {
      var page = isFinite(viewH) && viewH > 0 ? viewH : WHEEL.PAGE_PX;
      return d * page;
    }
    return d;
  }

  function wheelZoomFactor(deltaY, deltaMode, viewH) {
    var px = normalizeWheelDelta(deltaY, deltaMode, viewH);
    if (!px) return 1;
    var notches = clamp(px / WHEEL.NOTCH_PX, -WHEEL.MAX_NOTCHES, WHEEL.MAX_NOTCHES);
    return Math.pow(WHEEL.NOTCH_FACTOR, -notches);
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
    // connector の paint gap を丸め誤差で崩さないため 0.01 world 精度で出力する。
    return Math.round(n * 100) / 100;
  }

  /* ---------------- connector geometry (pure) ---------------- */

  function inflateRoundRect(rect, rx, offset) {
    var off = Math.max(0, offset || 0);
    var r = Math.max(0, rx || 0) + off;
    return {
      x: rect.x - off,
      y: rect.y - off,
      w: rect.w + off * 2,
      h: rect.h + off * 2,
      rx: Math.min(r, Math.min(rect.w, rect.h) / 2 + off)
    };
  }

  // 角丸矩形の内側判定。境界は含む。
  function pointInRoundRect(p, r) {
    var rx = Math.max(0, Math.min(r.rx || 0, Math.min(r.w, r.h) / 2));
    var x = r.x;
    var y = r.y;
    var w = r.w;
    var h = r.h;
    if (p.x < x || p.x > x + w || p.y < y || p.y > y + h) return false;
    if (rx <= 0) return true;
    var cx = p.x < x + rx ? x + rx : p.x > x + w - rx ? x + w - rx : p.x;
    var cy = p.y < y + rx ? y + rx : p.y > y + h - rx ? y + h - rx : p.y;
    if (cx === p.x && cy === p.y) return true;
    return Math.hypot(p.x - cx, p.y - cy) <= rx + 1e-9;
  }

  // 角丸矩形の符号付き距離。外側正、内側負。境界は 0。
  function roundRectSdf(p, rect, rx) {
    var r = Math.max(0, Math.min(rx || 0, Math.min(rect.w, rect.h) / 2));
    var qx = Math.abs(p.x - rect.x - rect.w / 2) - (rect.w / 2 - r);
    var qy = Math.abs(p.y - rect.y - rect.h / 2) - (rect.h / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }

  // 枠の外側から枠の内側へ向かう線分が、角丸の外周と交わる点を返す。
  // 端点は保存点列（軸矩形の辺上）なので、同じ向きに数 px だけ延ばして内側点を作る。
  function roundRectCrossing(outside, borderPoint, rect, rx, offset) {
    var inflated = inflateRoundRect(rect, rx, offset);
    var dx = borderPoint.x - outside.x;
    var dy = borderPoint.y - outside.y;
    var len = Math.hypot(dx, dy);
    if (!(len > 1e-9)) return borderPoint;
    var ux = dx / len;
    var uy = dy / len;
    var inner = { x: borderPoint.x + ux * 6, y: borderPoint.y + uy * 6 };
    if (!pointInRoundRect(inner, inflated)) {
      // 角の外側を通る場合の保険。枠中心へ向かう内側点で必ず内側を作る。
      var c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      var cdx = c.x - borderPoint.x;
      var cdy = c.y - borderPoint.y;
      var clen = Math.hypot(cdx, cdy) || 1;
      inner = { x: borderPoint.x + (cdx / clen) * Math.min(6, rect.h / 2), y: borderPoint.y + (cdy / clen) * Math.min(6, rect.h / 2) };
    }
    var lo = 0;
    var hi = 1;
    var a = outside;
    for (var i = 0; i < 32; i++) {
      var t = (lo + hi) / 2;
      var p = { x: a.x + (inner.x - a.x) * t, y: a.y + (inner.y - a.y) * t };
      if (pointInRoundRect(p, inflated)) hi = t;
      else lo = t;
    }
    return { x: a.x + (inner.x - a.x) * hi, y: a.y + (inner.y - a.y) * hi };
  }

  // 端点（index 0 または末尾）を、相手側の点から見た角丸枠の外周へ寄せる。
  function snapEndpoint(points, index, rect, rx, offset) {
    if (!rect || points.length < 2) return points;
    var i = index === 0 ? 0 : points.length - 1;
    var neighbor = index === 0 ? points[1] : points[points.length - 2];
    var border = points[i];
    var hit = roundRectCrossing(neighbor, border, rect, rx, offset);
    var out = points.slice();
    out[i] = hit;
    return out;
  }

  function edgeLength(points) {
    var total = 0;
    for (var i = 0; i < points.length - 1; i++) {
      total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    }
    return total;
  }

  function toPoint(p) {
    return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
  }

  function normalizePoints(points) {
    return (points || []).map(toPoint);
  }

  function nodeRect(compound, nodeW, nodeH, stroke) {
    if (!compound) return null;
    return {
      x: compound.x,
      y: compound.y,
      w: compound.w || nodeW,
      h: compound.h || nodeH,
      stroke: typeof stroke === 'number' ? stroke : (compound.hub ? CONNECTOR.HUB_STROKE : CONNECTOR.NODE_STROKE)
    };
  }

  /*
   * gap は「枠の外側から矢印tip/線端まで」の距離。
   * capMode='butt' では線端が path 終点で止まる（round cap の stroke/2 はみ出しなし）。
   */
  function endpointOffsets(strokeWidth, nodeStrokeRef, gap, capMode) {
    var g = typeof gap === 'number' ? gap : CONNECTOR.EDGE_GAP;
    var ref = typeof nodeStrokeRef === 'number' ? nodeStrokeRef : CONNECTOR.NODE_STROKE;
    var maxHalf = ref / 2;
    var roundCap = capMode !== 'butt';
    var arrow = maxHalf + g + (CONNECTOR.PAINT_SAFETY || 0);
    return {
      arrow: arrow,
      cap: arrow + (roundCap ? (strokeWidth || 0) / 2 : 0),
      tipFromOutline: arrow,
      capEdgeFromOutline: maxHalf + g + (CONNECTOR.PAINT_SAFETY || 0)
    };
  }

  // 矢印tipの直前の線分から、triangle と trim した shaft を作る。
  function attachArrow(connector) {
    var pts = connector.points || [];
    if (!connector.arrow || pts.length < 2) {
      connector.shaft = pts;
      connector.arrowHead = null;
      return connector;
    }
    var tip = pts[pts.length - 1];
    var prev = pts[pts.length - 2];
    var dx = tip.x - prev.x;
    var dy = tip.y - prev.y;
    var seg = Math.hypot(dx, dy);
    if (!(seg > 1e-9)) {
      connector.shaft = pts;
      connector.arrowHead = null;
      return connector;
    }
    var ux = dx / seg;
    var uy = dy / seg;
    var tier = connector.tier || 'primary';
    var full = edgeLength(pts);
    var nominal = connector.headLengthOverride || CONNECTOR.ARROW_SIZE[tier] || 7;
    // 線が短い場合も head を潰さず、かつ shaft を残す。反応ごとの個別補正はしない。
    var headLength = Math.min(nominal, Math.max(1, full - 1.5));
    if (connector.headLengthOverride) headLength = Math.min(nominal, Math.max(1, full - 0.5));
    if (!(headLength > 0)) headLength = Math.max(1, full * 0.5);
    var half = headLength / 2;
    var base = { x: tip.x - ux * headLength, y: tip.y - uy * headLength };
    var px = -uy;
    var py = ux;
    connector.shaft = pts.slice();
    connector.shaft[connector.shaft.length - 1] = base;
    connector.arrowHead = {
      tip: { x: tip.x, y: tip.y },
      base: base,
      left: { x: base.x + px * half, y: base.y + py * half },
      right: { x: base.x - px * half, y: base.y - py * half },
      headLength: headLength,
      halfWidth: half,
      angle: Math.atan2(uy, ux)
    };
    connector.headLength = headLength;
    return connector;
  }

  function arrowHeadPath(head) {
    if (!head) return '';
    return 'M' + round(head.tip.x) + ' ' + round(head.tip.y) +
      'L' + round(head.left.x) + ' ' + round(head.left.y) +
      'L' + round(head.right.x) + ' ' + round(head.right.y) + 'Z';
  }

  // 画面差の検証用 metadata。gap 候補ごとに矢印先端・cap 端の枠からの距離を出す。
  function connectorMetadata(gaps) {
    var list = (gaps && gaps.length ? gaps : [CONNECTOR.EDGE_GAP, 1, 1.5]).map(function (g) {
      return {
        gap: g,
        node: endpointOffsets(0, CONNECTOR.NODE_STROKE, g, 'butt'),
        hub: endpointOffsets(0, CONNECTOR.HUB_STROKE, g, 'butt'),
        class: endpointOffsets(0, CONNECTOR.CLASS_STROKE, g, 'butt'),
        capMode: 'butt',
        // 外周 stroke からの実 gap。geometry の値そのもの。
        actualGap: {
          node: g + CONNECTOR.PAINT_SAFETY,
          hub: g + CONNECTOR.PAINT_SAFETY,
          class: g + CONNECTOR.PAINT_SAFETY
        }
      };
    });
    return {
      nodeRx: CONNECTOR.NODE_RX,
      nodeStroke: CONNECTOR.NODE_STROKE,
      hubStroke: CONNECTOR.HUB_STROKE,
      classStroke: CONNECTOR.CLASS_STROKE,
      arrowRefX: CONNECTOR.ARROW_REF_X,
      edgeGap: CONNECTOR.EDGE_GAP,
      paintSafety: CONNECTOR.PAINT_SAFETY,
      portSpacing: CONNECTOR.PORT_SPACING,
      arrowSize: CONNECTOR.ARROW_SIZE,
      variants: list
    };
  }

  /*
   * 反応1件の描画用 connector を作る。
   * 1入力1出力で同じ tier のときは、ハブ中心を経由する1本の連続 path にする。
   * それ以外はハブ中心で合流する分枝（入力は矢印なし、出力だけ矢印）にする。
   */
  function reactionConnectors(reaction, opts) {
    var o = opts || {};
    var byId = o.compoundById || {};
    var nw = o.nodeW || 136;
    var nh = o.nodeH || 34;
    var rx = typeof o.rx === 'number' ? o.rx : CONNECTOR.NODE_RX;
    var gap = typeof o.gap === 'number' ? o.gap : CONNECTOR.EDGE_GAP;
    var hub = { x: reaction.x, y: reaction.y };
    var ins = [];
    var outs = [];
    (reaction.edges || []).forEach(function (e) {
      if (e.dir === 'in') ins.push(e);
      else outs.push(e);
    });

    function prepare(e) {
      var pts = normalizePoints(e.points);
      if (pts.length < 2) return null;
      // 保存点列は常に物質→ハブ。描画は入力=物質→ハブ、出力=ハブ→物質。
      if (e.dir !== 'in') pts.reverse();
      if (e.dir === 'in') pts[pts.length - 1] = { x: hub.x, y: hub.y };
      else pts[0] = { x: hub.x, y: hub.y };
      return pts;
    }

    function snapFor(pts, e, arrow) {
      var rect = nodeRect(byId[e.id], nw, nh);
      var o = endpointOffsets(0, rect.stroke, gap, 'butt');
      var off = arrow ? o.arrow : o.cap;
      var index = e.dir === 'in' ? 0 : pts.length - 1;
      return { points: snapEndpoint(pts, index, rect, rx, off), offset: off, index: index, rect: rect };
    }

    function endInfo(edgeId, index, border, rect, offset, role) {
      return {
        compoundId: edgeId,
        index: index,
        border: { x: border.x, y: border.y },
        rect: rect,
        nodeStroke: rect.stroke,
        offset: offset,
        role: role
      };
    }

    var tierMatch = ins.length === 1 && outs.length === 1 && (ins[0].tier === outs[0].tier);
    if (tierMatch) {
      var a = prepare(ins[0]);
      var b = prepare(outs[0]);
      if (a && b) {
        var joined = a.concat(b.slice(1)); // ハブ中心の重複を除く
        var tier = ins[0].tier === 'primary' ? 'primary' : 'secondary';
        var rectIn = nodeRect(byId[ins[0].id], nw, nh);
        var rectOut = nodeRect(byId[outs[0].id], nw, nh);
        var offs = {
          arrow: endpointOffsets(0, rectOut.stroke, gap, 'butt').arrow,
          cap: endpointOffsets(0, rectIn.stroke, gap, 'butt').cap
        };
        var borderIn = joined[0];
        var borderOut = joined[joined.length - 1];
        var p0 = snapEndpoint(joined, 0, rectIn, rx, offs.cap);
        var p1 = snapEndpoint(p0, p0.length - 1, rectOut, rx, offs.arrow);
        var merged = {
          points: p1,
          ends: [
            endInfo(ins[0].id, 0, borderIn, rectIn, offs.cap, 'cap'),
            endInfo(outs[0].id, p1.length - 1, borderOut, rectOut, offs.arrow, 'arrow')
          ],
          tier: tier,
          arrow: true,
          dir: 'out',
          edgeId: outs[0].id,
          edgeKeys: [reaction.id + '|in|' + ins[0].id, reaction.id + '|out|' + outs[0].id],
          compounds: [ins[0].id, outs[0].id],
          gaps: (ins[0].gaps || []).concat(outs[0].gaps || []),
          bridges: (ins[0].bridges || []).concat(outs[0].bridges || []),
          length: edgeLength(p1)
        };
        attachArrow(merged);
        return [merged];
      }
    }

    var list = [];
    ins.forEach(function (e) {
      var pts = prepare(e);
      if (!pts) return;
      var snapped = snapFor(pts, e, false);
      list.push({
        points: snapped.points,
        ends: [endInfo(e.id, snapped.index, pts[snapped.index], snapped.rect, snapped.offset, 'cap')],
        tier: e.tier === 'primary' ? 'primary' : 'secondary',
        arrow: false,
        dir: 'in',
        edgeId: e.id,
        edgeKeys: [reaction.id + '|in|' + e.id],
        compounds: [e.id],
        gaps: e.gaps || [],
        bridges: e.bridges || [],
        length: edgeLength(snapped.points)
      });
    });
    outs.forEach(function (e) {
      var pts = prepare(e);
      if (!pts) return;
      var snapped = snapFor(pts, e, true);
      list.push({
        points: snapped.points,
        ends: [endInfo(e.id, snapped.index, pts[snapped.index], snapped.rect, snapped.offset, 'arrow')],
        tier: e.tier === 'primary' ? 'primary' : 'secondary',
        arrow: true,
        dir: 'out',
        edgeId: e.id,
        edgeKeys: [reaction.id + '|out|' + e.id],
        compounds: [e.id],
        gaps: e.gaps || [],
        bridges: e.bridges || [],
        length: edgeLength(snapped.points)
      });
    });
    list.forEach(attachArrow);
    return list;
  }

  // 一般図の変換1本。from 側は cap、to 側は矢印の先端を角丸枠に合わせる。
  function classConnector(edge, opts) {
    var o = opts || {};
    var byId = o.nodeById || {};
    var rx = typeof o.rx === 'number' ? o.rx : CONNECTOR.NODE_RX;
    var gap = typeof o.gap === 'number' ? o.gap : CONNECTOR.EDGE_GAP;
    var pts = normalizePoints(edge.points);
    if (pts.length < 2) return { points: pts, arrow: true, length: 0 };
    var from = byId[edge.from];
    var to = byId[edge.to];
    var rectFrom = nodeRect(from, 150, 40, CONNECTOR.CLASS_STROKE);
    var rectTo = nodeRect(to, 150, 40, CONNECTOR.CLASS_STROKE);
    var offs = {
      arrow: endpointOffsets(0, rectTo.stroke, gap, 'butt').arrow,
      cap: endpointOffsets(0, rectFrom.stroke, gap, 'butt').cap
    };
    var a = snapEndpoint(pts, 0, rectFrom, rx, offs.cap);
    var b = snapEndpoint(a, a.length - 1, rectTo, rx, offs.arrow);
    return attachArrow({
      points: b,
      arrow: true,
      tier: 'class',
      length: edgeLength(b),
      ends: [
        { compoundId: edge.from, index: 0, border: { x: pts[0].x, y: pts[0].y }, rect: rectFrom, nodeStroke: rectFrom.stroke, offset: offs.cap, role: 'cap' },
        { compoundId: edge.to, index: b.length - 1, border: { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }, rect: rectTo, nodeStroke: rectTo.stroke, offset: offs.arrow, role: 'arrow' }
      ]
    });
  }

  function maxPaintHalf(connector) {
    var w = CONNECTOR.MAX_PAINT_STROKE[connector.tier] || CONNECTOR.MAX_PAINT_STROKE.primary;
    return w / 2;
  }

  // 実際の DOM と同じノード境界 stroke 幅。未指定時は通常ノードの 1.2。
  function nodeStrokeOf(rect) {
    return typeof rect.stroke === 'number' ? rect.stroke : CONNECTOR.NODE_STROKE;
  }

  // SDF の唯一の基準: 角丸矩形中心線 - ノード境界 stroke/2。
  function nodePaintGap(p, rect, rx) {
    return roundRectSdf(p, rect, rx) - nodeStrokeOf(rect) / 2;
  }

  function facePoints(p, tangent, half) {
    var px = -tangent.y;
    var py = tangent.x;
    return [
      { x: p.x - px * half, y: p.y - py * half },
      { x: p.x + px * half, y: p.y + py * half }
    ];
  }

  /*
   * 線分上の SDF 最小値。SDF は凸なので三分探索で厳密に近づける。
   * 端点と内部最小の小さい方を返す（サンプル間隔に依存しない）。
   */
  function segmentMinSdf(a, b, rect, rx) {
    function f(t) {
      return roundRectSdf({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, rect, rx);
    }
    var lo = 0;
    var hi = 1;
    for (var i = 0; i < 80; i++) {
      var m1 = lo + (hi - lo) / 3;
      var m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) hi = m2;
      else lo = m1;
    }
    return Math.min(f(0), f(1), f((lo + hi) / 2));
  }

  // 線分の paint 外周 gap。ノード境界 stroke と線幅 stroke を一度ずつ引く。
  function segmentPaintGap(a, b, rect, rx, strokeWidth) {
    return segmentMinSdf(a, b, rect, rx) - nodeStrokeOf(rect) / 2 - (strokeWidth || 0) / 2;
  }

  function minFaceGap(p, tangent, half, rect, rx) {
    var fp = facePoints(p, tangent, half);
    return segmentPaintGap(fp[0], fp[1], rect, rx, 0);
  }

  function minTriangleGap(head, rect, rx) {
    if (!head) return Infinity;
    var edges = [
      [head.tip, head.left],
      [head.left, head.right],
      [head.right, head.tip]
    ];
    var min = Infinity;
    edges.forEach(function (e) {
      min = Math.min(min, segmentPaintGap(e[0], e[1], rect, rx, 0));
    });
    // contract: triangle 塗り全体は境界（辺）の最小で押さえられる。
    return min;
  }

  function sdfNormal(p, rect, rx) {
    var e = 0.05;
    var gx = roundRectSdf({ x: p.x + e, y: p.y }, rect, rx) - roundRectSdf({ x: p.x - e, y: p.y }, rect, rx);
    var gy = roundRectSdf({ x: p.x, y: p.y + e }, rect, rx) - roundRectSdf({ x: p.x, y: p.y - e }, rect, rx);
    var len = Math.hypot(gx, gy);
    if (len < 1e-9) {
      var cx = rect.x + rect.w / 2;
      var cy = rect.y + rect.h / 2;
      var dx = p.x - cx;
      var dy = p.y - cy;
      len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
    return { x: gx / len, y: gy / len };
  }

  /*
   * source の butt 端面（幅 = 最大paint幅）全体を、ノード外周 + gap の外へ出す。
   * 中心点だけでなく端面の両端・中間を SDF で検査し、必要なら線方向へ最小限押し出す。
   */
  function shaftGap(connector, rect, rx) {
    var pts = connector.shaft || connector.points;
    if (!pts || pts.length < 2) return Infinity;
    var width = maxPaintHalf(connector) * 2;
    var min = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      min = Math.min(min, segmentPaintGap(pts[i], pts[i + 1], rect, rx, width));
    }
    return min;
  }

  function capShapeGap(connector, end, rx) {
    var pts = connector.points;
    var p = pts[end.index];
    var neighbor = end.index === 0 ? pts[1] : pts[pts.length - 2];
    if (!neighbor) return Infinity;
    var dx = neighbor.x - p.x;
    var dy = neighbor.y - p.y;
    var len = Math.hypot(dx, dy) || 1;
    var tangent = { x: dx / len, y: dy / len };
    return Math.min(
      minFaceGap(p, tangent, maxPaintHalf(connector), end.rect, rx),
      shaftGap(connector, end.rect, rx)
    );
  }

  function arrowShapeGap(connector, end, rx) {
    return Math.min(
      minTriangleGap(connector.arrowHead, end.rect, rx),
      shaftGap(connector, end.rect, rx)
    );
  }

  function settleCapEndpoint(connector, end, rx, gap) {
    var pts = connector.points;
    var idx = end.index;
    var p = pts[idx];
    var neighbor = idx === 0 ? pts[1] : pts[pts.length - 2];
    if (!neighbor) return;
    var n = sdfNormal(p, end.rect, rx);
    var maxD = 15;
    var step = 0.02;
    var chosen = 0;
    for (var d = 0; d <= maxD; d += step) {
      var q = { x: p.x + n.x * d, y: p.y + n.y * d };
      pts[idx] = q;
      attachArrow(connector);
      if (capShapeGap(connector, end, rx) >= gap - 1e-6) {
        chosen = d;
        break;
      }
      chosen = d;
    }
    if (chosen > maxD) chosen = maxD;
    pts[idx] = { x: p.x + n.x * chosen, y: p.y + n.y * chosen };
    attachArrow(connector);
  }


  /*
   * destination triangle 全体をノード外周 + gap の外へ出す。
   * tip は共通 gap の位置に保ち、最終アプローチだけノード法線方向の局所 stub にする。
   */
  function settleArrowEndpoint(connector, end, rx, gap) {
    if (!connector.arrowHead) return;
    if (arrowShapeGap(connector, end, rx) >= gap - 1e-6) return;
    var tip = connector.points[connector.points.length - 1];
    var normal = sdfNormal(tip, end.rect, rx);
    var baseline = connector.points.slice();
    var full = connector.length || edgeLength(baseline);
    var start = connector.arrowHead.headLength;
    var maxL = Math.min(start + 12, Math.max(start, full - 0.5));
    for (var L = start; L <= maxL + 1e-9; L += 0.25) {
      var anchor = { x: tip.x + normal.x * L, y: tip.y + normal.y * L };
      var candidate = baseline.slice(0, baseline.length - 1).concat([anchor, tip]);
      var temp = {
        points: candidate,
        arrow: true,
        tier: connector.tier,
        length: edgeLength(candidate),
        headLengthOverride: L
      };
      attachArrow(temp);
      if (arrowShapeGap(temp, end, rx) >= gap - 1e-6) {
        connector.points = candidate;
        connector.shaft = temp.shaft;
        connector.arrowHead = temp.arrowHead;
        connector.headLength = temp.headLength;
        connector.headLengthOverride = L;
        connector.length = temp.length;
        end.index = candidate.length - 1;
        return;
      }
    }
  }

  function enforcePaintClearance(connectors, opts) {
    var o = opts || {};
    var rx = typeof o.rx === 'number' ? o.rx : CONNECTOR.NODE_RX;
    var gap = typeof o.gap === 'number' ? o.gap : CONNECTOR.EDGE_GAP + CONNECTOR.PAINT_SAFETY;
    (connectors || []).forEach(function (c) {
      (c.ends || []).forEach(function (end) {
        if (!end.rect) return;
        if (end.role === 'cap') settleCapEndpoint(c, end, rx, gap);
        else if (end.role === 'arrow') settleArrowEndpoint(c, end, rx, gap);
      });
    });
    return connectors;
  }

  // テスト・metadata用: 実際の paint 形状の最小 gap。
  function connectorShapeGap(connector, end) {
    if (!end || !end.rect) return null;
    var rx = CONNECTOR.NODE_RX;
    if (end.role === 'cap') return capShapeGap(connector, end, rx);
    if (end.role === 'arrow') return arrowShapeGap(connector, end, rx);
    return null;
  }

  function shiftBorderAlongSide(border, rect, delta, rx) {
    var eps = 0.6;
    var r = Math.max(0, rx || 0);
    if (Math.abs(border.x - rect.x) <= eps || Math.abs(border.x - (rect.x + rect.w)) <= eps) {
      return { x: border.x, y: clamp(border.y + delta, rect.y + r, rect.y + rect.h - r) };
    }
    return { x: clamp(border.x + delta, rect.x + r, rect.x + rect.w - r), y: border.y };
  }

  // 膨張した角丸輪郭上の、指定した辺座標に対応する点。
  // 角丸に入る位置でも半径方向へ正しく置き、同じ y へ潰れないようにする。
  function portPointOnOutline(sideId, rect, along, rx, offset) {
    var r = Math.max(0, rx || 0);
    var off = Math.max(0, offset || 0);
    var radius = r + off;
    if (sideId === 'L' || sideId === 'R') {
      var y = clamp(along, rect.y, rect.y + rect.h);
      var cx = sideId === 'L' ? rect.x + r : rect.x + rect.w - r;
      var dx;
      if (y <= rect.y + r) {
        var dt = rect.y + r - y;
        dx = Math.sqrt(Math.max(0, radius * radius - dt * dt));
      } else if (y >= rect.y + rect.h - r) {
        var db = y - (rect.y + rect.h - r);
        dx = Math.sqrt(Math.max(0, radius * radius - db * db));
      } else {
        dx = radius; // 直線部分
      }
      return { x: sideId === 'L' ? cx - dx : cx + dx, y: y };
    }
    var x = clamp(along, rect.x, rect.x + rect.w);
    var dy;
    if (x <= rect.x + r) {
      var dl = rect.x + r - x;
      dy = Math.sqrt(Math.max(0, radius * radius - dl * dl));
    } else if (x >= rect.x + rect.w - r) {
      var dr = x - (rect.x + rect.w - r);
      dy = Math.sqrt(Math.max(0, radius * radius - dr * dr));
    } else {
      dy = radius;
    }
    var cy = sideId === 'T' ? rect.y + r : rect.y + rect.h - r;
    return { x: x, y: sideId === 'T' ? cy - dy : cy + dy };
  }

  function portSide(border, rect) {
    var eps = 0.6;
    if (Math.abs(border.x - rect.x) <= eps) return { id: 'L', along: border.y };
    if (Math.abs(border.x - (rect.x + rect.w)) <= eps) return { id: 'R', along: border.y };
    if (Math.abs(border.y - rect.y) <= eps) return { id: 'T', along: border.x };
    return { id: 'B', along: border.x };
  }

  /*
   * 同じ物質の近接portに複数の反応線が集まると、向きが揃った区間が重なって
   * 1本に見えることがある。保存点列は変えず、描画端点だけを枠の辺に沿って
   * PORT_SPACING 間隔に分ける。同一反応内の合流（反応ハブ）は対象外。
   */
  function separateSharedPorts(connectors, separation) {
    var spacing = typeof separation === 'number' ? separation : CONNECTOR.PORT_SPACING;
    var groups = {};
    var order = [];
    (connectors || []).forEach(function (c) {
      (c.ends || []).forEach(function (end) {
        var side = portSide(end.border, end.rect);
        var key = end.compoundId + '@' + side.id;
        if (!groups[key]) {
          groups[key] = [];
          order.push(key);
        }
        var neighbor = end.index === 0 ? c.points[1] : c.points[c.points.length - 2];
        var tangent = neighbor
          ? (side.id === 'L' || side.id === 'R' ? neighbor.y : neighbor.x)
          : side.along;
        groups[key].push({ connector: c, end: end, along: side.along, sideId: side.id, tangent: tangent });
      });
    });
    order.forEach(function (key) {
      var group = groups[key].filter(function (item) { return item.end.rect; });
      if (group.length < 2) return;
      group.sort(function (a, b) { return a.along - b.along; });
      // 近接しているportだけをクラスタ化する（離れたportは動かさない）。
      var clusters = [];
      var current = [group[0]];
      for (var gi = 1; gi < group.length; gi++) {
        if (group[gi].along - current[current.length - 1].along <= CONNECTOR.PORT_CLUSTER) {
          current.push(group[gi]);
        } else {
          clusters.push(current);
          current = [group[gi]];
        }
      }
      clusters.push(current);
      clusters.forEach(function (cluster) {
        var reactions = {};
        cluster.forEach(function (item) { reactions[item.connector.rid || ''] = true; });
        if (cluster.length < 2 || Object.keys(reactions).length < 2) return;
        var center = cluster.reduce(function (sum, item) { return sum + item.along; }, 0) / cluster.length;
        var first = center - (spacing * (cluster.length - 1)) / 2;
        // 辺に沿った順ではなく、出て行く向き（隣接点）の順に lane を割り当てる。
        // これを逆にすると、近接portの線がノード直後で交差する。
        cluster.sort(function (a, b) {
          if (a.tangent !== b.tangent) return a.tangent - b.tangent;
          return a.along - b.along;
        });
        cluster.forEach(function (item, i) {
          var target = first + spacing * i;
          var c = item.connector;
          var end = item.end;
          // 目標位置に正確に置く（roundRectCrossing の投影誤差を残さない）。
          c.points[end.index] = portPointOnOutline(item.sideId, end.rect, target, CONNECTOR.NODE_RX, end.offset);
          c.length = edgeLength(c.points);
          attachArrow(c);
        });
      });
    });
    return connectors;
  }

  // 描画文字列（M/L/Q）を一定間隔でサンプリングする。実際に描かれる線の検査用。
  function samplePath(d, step) {
    var commands = String(d || '').match(/[MLQ][^MLQ]*/g) || [];
    var subpaths = [];
    var current = [];
    var i;
    function nums(text) {
      var found = String(text).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
      return found.map(Number);
    }
    for (i = 0; i < commands.length; i++) {
      var cmd = commands[i].charAt(0);
      var v = nums(commands[i].slice(1));
      if (cmd === 'M') {
        if (current.length > 1) subpaths.push(current);
        current = [{ x: v[0], y: v[1] }];
      } else if (cmd === 'L' && current.length) {
        current.push({ x: v[0], y: v[1] });
      } else if (cmd === 'Q' && current.length) {
        var p0 = current[current.length - 1];
        var c = { x: v[0], y: v[1] };
        var p1 = { x: v[2], y: v[3] };
        var seg = Math.hypot(c.x - p0.x, c.y - p0.y) + Math.hypot(p1.x - c.x, p1.y - c.y);
        var n = Math.max(2, Math.ceil(seg / (step || 4)));
        for (var k = 1; k <= n; k++) {
          var t = k / n;
          var mt = 1 - t;
          current.push({
            x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
            y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y
          });
        }
      }
    }
    if (current.length > 1) subpaths.push(current);
    return subpaths;
  }

  // 点が多角形の内側か（ray casting）。矢印 triangle の「塗り」を距離0で扱うために使う。
  function pointInPolygon(p, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i];
      var b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  // 透明な当たり判定（画面 18px 幅 = 半径 9px）の距離判定。
  // shape は折れ線の配列（旧形式）か { lines: [[点...]], fills: [[頂点...]] }。
  // 塗り（triangle 内部）は距離0、輪郭は折れ線として測る。
  function hitDistanceDetail(shape, p) {
    var lines = !shape ? [] : (Array.isArray(shape) ? shape : (shape.lines || shape.points || []));
    var fills = !shape || Array.isArray(shape) ? [] : (shape.fills || []);
    var best = Infinity;
    var i;
    var k;
    var onLine = false;
    for (i = 0; i < lines.length; i++) {
      var poly = lines[i];
      if (!poly || poly.length < 2) continue;
      for (k = 0; k < poly.length - 1; k++) {
        var a = poly[k];
        var b = poly[k + 1];
        var vx = b.x - a.x;
        var vy = b.y - a.y;
        var len2 = vx * vx + vy * vy;
        var t = len2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        var d = Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
        if (d <= 1e-9) onLine = true;
        if (d < best) best = d;
      }
    }
    var insideFill = false;
    for (i = 0; i < fills.length; i++) {
      var ring = fills[i];
      if (!ring || ring.length < 3) continue;
      if (pointInPolygon(p, ring)) insideFill = true;
      // 輪郭（全3辺）も距離に含める。samplePath は Z の閉じ辺を落とすため、ここで補う。
      for (k = 0; k < ring.length; k++) {
        var a2 = ring[k];
        var b2 = ring[(k + 1) % ring.length];
        var d2 = Math.hypot(p.x - a2.x, p.y - a2.y);
        var ex = b2.x - a2.x;
        var ey = b2.y - a2.y;
        var el2 = ex * ex + ey * ey;
        var t2 = el2 ? ((p.x - a2.x) * ex + (p.y - a2.y) * ey) / el2 : 0;
        if (t2 < 0) t2 = 0;
        else if (t2 > 1) t2 = 1;
        d2 = Math.hypot(p.x - a2.x - t2 * ex, p.y - a2.y - t2 * ey);
        if (d2 <= 1e-9) onLine = true;
        if (d2 < best) best = d2;
      }
    }
    var distance = insideFill ? 0 : best;
    return { distance: distance, via: onLine ? 'line' : (insideFill ? 'fill' : 'line') };
  }

  // 距離だけ欲しいときの薄いラッパ（既存の呼び出し・テストとの互換）。
  function hitDistance(shape, p) {
    return hitDistanceDetail(shape, p).distance;
  }

  // 重なった当たり判定の候補から、タップ位置に最も近い1本を選ぶ。
  // 同じ ID の枝は同じ反応として扱い（最短距離を採用）。同じ距離なら
  // 塗り（triangle 内部）より線を優先し、最後は order の小さい方で安定させる。
  function nearestHit(candidates, p, radius) {
    var limit = typeof radius === 'number' ? radius : 0;
    var best = null;
    if (!candidates) return best;
    var rank = function (via) { return via === 'line' ? 0 : 1; };
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var detail = hitDistanceDetail(c, p);
      var d = detail.distance;
      if (!(d <= limit + 1e-9)) continue;
      var order = typeof c.order === 'number' ? c.order : 0;
      var next = { kind: c.kind, id: c.id, distance: d, order: order, via: detail.via };
      if (!best) {
        best = next;
        continue;
      }
      if (d < best.distance - 1e-9) {
        best = next;
      } else if (Math.abs(d - best.distance) <= 1e-9) {
        if (next.id === best.id && next.kind === best.kind) {
          if (rank(next.via) < rank(best.via)) best = next;
        } else if (rank(next.via) < rank(best.via) || (rank(next.via) === rank(best.via) && order < best.order)) {
          best = next;
        }
      }
    }
    return best;
  }

  // タップ対象の決定。ラベル・ノードの直接ヒット（isHitPath=false）は無条件で優先し、
  // 透明ヒットのときだけ幾何的に最も近い候補へ置き換える。
  function resolveHitTarget(direct, isHitPath, nearest) {
    if (direct && !isHitPath) return { kind: direct.kind, id: direct.id, source: 'direct' };
    if (nearest) return { kind: nearest.kind, id: nearest.id, source: 'hit' };
    if (direct) return { kind: direct.kind, id: direct.id, source: 'direct' };
    return null;
  }

  // ダブルクリックの扱い。実体（線・矢印・ラベル・物質・一般図）の上では地図の拡大をせず、
  // 通常のクリック（カード）操作に任せる。背景だけ従来どおり拡大する。
  function dblclickAction(isEntity, isControl) {
    if (isControl) return 'none';
    return isEntity ? 'none' : 'zoom';
  }

  // 実座標での当たり対象の決定。candidates は「描画順（上から）」の
  // { role: 'control'|'node'|'label'|'line', kind, id, inside }。
  // inside=false はその形状の物理的な内側ではない（別要素のハロー等）ため無視する。
  // pointer capture やタッチ補正で event.target が変わっても、この物理判定だけで決める。
  function resolvePhysicalTarget(candidates) {
    if (!candidates) return { type: 'background' };
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c || !c.inside) continue;
      if (c.role === 'control') return { type: 'control', kind: c.kind || null, id: c.id || null };
      if (c.role === 'node') return { type: 'entity', kind: c.kind, id: c.id, via: 'node' };
      if (c.role === 'label') return { type: 'entity', kind: c.kind, id: c.id, via: 'label' };
      if (c.role === 'line') return { type: 'line', kind: c.kind, id: c.id };
    }
    return { type: 'background' };
  }

  // data-* の compound 一覧を厳密に復元する。ID 自体にカンマが入るため split(',') は使わない。
  function compoundList(rawList, rawSingle) {
    if (rawList) {
      try {
        var parsed = JSON.parse(rawList);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* legacy attribute */ }
    }
    if (rawSingle != null && rawSingle !== '') return [rawSingle];
    return [];
  }

  function connectorMatchesCompound(connector, id) {
    return !!(connector && connector.compounds && connector.compounds.indexOf(id) !== -1);
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

  // 12分類の一般図の現在位置。図の枠内に画面中央があるときだけ、図名と選択中の分類を返す。
  function classMapPosition(t, classMap, viewW, viewH, selectedName) {
    if (!classMap || !classMap.area) return '';
    var center = screenToWorld(t, viewW / 2, viewH / 2);
    var r = classMap.area;
    if (center.x < r.x || center.x > r.x + r.w || center.y < r.y || center.y > r.y + r.h) return '';
    var parts = [classMap.title || '官能基変換の一般図'];
    if (selectedName) parts.push(selectedName);
    return parts.join(' / ') + '（' + Math.round(t.scale * 100) + '%）';
  }

  function nearestCompound(compounds, wx, wy) {
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < compounds.length; i++) {
      var c = compounds[i];
      var dx = c.x + (c.w || 136) / 2 - wx;
      var dy = c.y + (c.h || 34) / 2 - wy;
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
    CONNECTOR: CONNECTOR,
    inflateRoundRect: inflateRoundRect,
    pointInRoundRect: pointInRoundRect,
    roundRectCrossing: roundRectCrossing,
    roundRectSdf: roundRectSdf,
    nodePaintGap: nodePaintGap,
    segmentMinSdf: segmentMinSdf,
    minTriangleGap: minTriangleGap,
    connectorShapeGap: connectorShapeGap,
    enforcePaintClearance: enforcePaintClearance,
    snapEndpoint: snapEndpoint,
    endpointOffsets: endpointOffsets,
    attachArrow: attachArrow,
    arrowHeadPath: arrowHeadPath,
    compoundList: compoundList,
    connectorMatchesCompound: connectorMatchesCompound,
    connectorMetadata: connectorMetadata,
    reactionConnectors: reactionConnectors,
    classConnector: classConnector,
    shiftBorderAlongSide: shiftBorderAlongSide,
    portPointOnOutline: portPointOnOutline,
    separateSharedPorts: separateSharedPorts,
    samplePath: samplePath,
    pointInPolygon: pointInPolygon,
    hitDistanceDetail: hitDistanceDetail,
    hitDistance: hitDistance,
    nearestHit: nearestHit,
    resolveHitTarget: resolveHitTarget,
    dblclickAction: dblclickAction,
    resolvePhysicalTarget: resolvePhysicalTarget,
    HIT_WIDTH: HIT_WIDTH,
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
    wheelZoomFactor: wheelZoomFactor,
    normalizeWheelDelta: normalizeWheelDelta,
    WHEEL: WHEEL,
    clampPan: clampPan,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    regionAt: regionAt,
    edgePath: edgePath,
    routePath: routePath,
    normalize: normalize,
    matchCompounds: matchCompounds,
    positionText: positionText,
    classMapPosition: classMapPosition,
    isOverview: isOverview,
    shorten: shorten,
    listJoin: listJoin,
    emptyReason: emptyReason
  };
});
