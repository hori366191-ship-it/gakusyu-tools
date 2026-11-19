/*
 * app11/3d 球ビュー — 公開 renderer への橋渡し（純関数・DOM なし）
 *
 * 公開 renderer.js（site/app11/3d/renderer.js）をそのまま使い、球ビューに
 * 必要な差分だけを外側で行う:
 *   - 球の外では、視線の反対側（裏側）のカード・点・経路を計画から外す。
 *   - 床グリッドの代わりに、球の緯線・経線・輪郭（シルエット）を薄く描く。
 *   - 選択中に描けない直接の反応相手を、縁の名前付き仮想カードと破線の続きで補う。
 *
 * カードの軸平行・不透明オクルージョン・当たり判定・検索/選択の計画は
 * 公開 renderer のものをそのまま使う（ローカル fork しない）。
 *
 * Node では require、ブラウザでは window.RP3DSphereRender。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sphere-camera.js')(require('./projection.js')));
  } else {
    root.RP3DSphereRender = factory(root.RP3DProjection);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  var WORLD_UP = { x: 0, y: 1, z: 0 };

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function normalize(a) {
    var len = length(a);
    if (!(len > 1e-9)) return { x: 0, y: 0, z: 1 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
  }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

  function isInside(camera) {
    return !!(camera && camera.mode === 'inside');
  }

  // 球の外向き視線（outside の eye 方向 / inside の見ている方向）。
  function outwardDirection(camera) {
    var ce = Math.cos(camera.elevation);
    return {
      x: ce * Math.sin(camera.azimuth),
      y: Math.sin(camera.elevation),
      z: ce * Math.cos(camera.azimuth)
    };
  }

  // 点がカメラ側の半球にあるか。inside では常に true（投影が behind を弾く）。
  function isFrontFacing(point, center, camera, threshold) {
    if (isInside(camera)) return true;
    var dir = outwardDirection(camera);
    var normal = normalize(sub(point, center));
    var limit = threshold == null ? 0 : threshold;
    return dot(normal, dir) >= limit;
  }

  // 公開 renderer.planScene に渡す layout。裏側の点を除くだけで、
  // スロット座標そのものは変えない。
  // keepIds に選択中の直接グラフ端点を渡すと、その端点だけは裏半球でも
  // layout に残す（renderer が実投影位置の通常カードとして描けるようにする）。
  function visibleLayout(model, layout, camera, options) {
    options = options || {};
    if (isInside(camera)) return layout;
    var center = options.center || layout.center;
    var keepIds = options.keepIds || null;
    var points = Object.create(null);
    var list = [];
    for (var i = 0; i < model.compounds.length; i++) {
      var compound = model.compounds[i];
      var point = layout.points[compound.id];
      if (!point) continue;
      var keep = !!(keepIds && keepIds[compound.id]);
      if (!keep && !isFrontFacing(point, center, camera, options.threshold)) continue;
      points[compound.id] = point;
      list.push(point);
    }
    var next = {};
    Object.keys(layout).forEach(function (key) { next[key] = layout[key]; });
    next.points = points;
    next.list = list;
    next.stats = Object.assign({}, layout.stats, {
      visible: list.length,
      hidden: model.compounds.length - list.length
    });
    return next;
  }

  function guideCircle(camera, center, radius, axisA, axisB, segments, viewport, clipRect, out) {
    var prev = null;
    for (var i = 0; i <= segments; i++) {
      var t = (i / segments) * Math.PI * 2;
      var point = {
        x: center.x + radius * (Math.cos(t) * axisA.x + Math.sin(t) * axisB.x),
        y: center.y + radius * (Math.cos(t) * axisA.y + Math.sin(t) * axisB.y),
        z: center.z + radius * (Math.cos(t) * axisA.z + Math.sin(t) * axisB.z)
      };
      var projected = P.cameraView(camera, point, viewport);
      if (prev && projected) {
        var clipped = P.clipSegment(prev.x, prev.y, projected.x, projected.y, clipRect);
        if (clipped) out.push(clipped);
      }
      prev = projected;
    }
    return out;
  }

  // 球のガイド（緯線・経線・outside は輪郭）。薄い 1 本のストロークで描ける形。
  function buildGuideSegments(camera, center, radius, viewport, options) {
    options = options || {};
    var out = [];
    var clipRect = {
      x: -40,
      y: -40,
      width: viewport.width + 80,
      height: viewport.height + 80
    };
    var segments = options.segments == null ? 64 : options.segments;
    var latitudes = [-60, -30, 0, 30, 60];
    var i;
    for (i = 0; i < latitudes.length; i++) {
      var lat = latitudes[i] * Math.PI / 180;
      var ring = Math.cos(lat) * radius * 1.001;
      var y = Math.sin(lat) * radius * 1.001;
      var prev = null;
      for (var k = 0; k <= segments; k++) {
        var t = (k / segments) * Math.PI * 2;
        var point = {
          x: center.x + Math.cos(t) * ring,
          y: center.y + y,
          z: center.z + Math.sin(t) * ring
        };
        var projected = P.cameraView(camera, point, viewport);
        if (prev && projected) {
          var clipped = P.clipSegment(prev.x, prev.y, projected.x, projected.y, clipRect);
          if (clipped) out.push(clipped);
        }
        prev = projected;
      }
    }
    var meridians = 6;
    for (i = 0; i < meridians; i++) {
      var lon = (i / meridians) * Math.PI;
      var axisA = { x: Math.cos(lon), y: 0, z: Math.sin(lon) };
      var axisB = { x: 0, y: 1, z: 0 };
      guideCircle(camera, center, radius * 1.001, axisA, axisB, segments, viewport, clipRect, out);
    }
    if (!isInside(camera)) {
      var dir = outwardDirection(camera);
      var helper = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : WORLD_UP;
      var right = normalize(cross(dir, helper));
      var up = normalize(cross(right, dir));
      guideCircle(camera, center, radius * 1.001, right, up, Math.max(segments, 96), viewport, clipRect, out);
    }
    return out;
  }

  // 公開 renderer の床グリッドを球のガイドへ差し替える。
  function replaceFloorSegments(plan, segments) {
    if (!plan) return plan;
    plan.floorSegments = segments || [];
    if (plan.stats) plan.stats.floorSegments = plan.floorSegments.length;
    return plan;
  }

  // ================== 選択中の直接グラフ（裏側・画面外） ==================
  //
  // 公開 renderer.planScene は layout（visibleLayout で裏面を間引いたもの）に
  // 無い点の projection を作らず、clipSegment で画面外の辺も落とす。
  // そのため「選択物質の直接の反応相手が裏半球・画面外」だと、カードも経路も
  // 消える。ここでは選択グループの全端点・全辺を別に集計し、通常カードとして
  // 描けないものだけを「名前付きの仮想カード」として usable 領域の縁へ並べる。
  //
  // - 1 物質 = 1 枚。番号マーカーや別ダイアログは作らない。
  // - カードは縁に沿って詰め、入りきらなければ内側のレーンへ送る。
  // - 辺は「実際の投影線分を usable 領域で切った点」と仮想カードを破線で結ぶ。
  //   投影できない（カメラの後ろ・反対側）ときだけ球面の向き（bearing）を使う。
  // - 矢じりは常に基質 → 生成物の実方向。無関係な辺は作らない。
  // - 完全な非重なりが不可能な密度では、落とさずレーン配置のまま
  //   stats.layoutLimited / overlapPairs で正直に報告する。

  var REASON_LABEL = {
    far: '球の裏',
    behind: 'カメラの後ろ',
    offscreen: '画面の外',
    panel: 'パネルの外',
    unplaced: '未配置'
  };

  var VIRTUAL_STYLE = {
    fontSize: 12,
    lineHeight: 15,
    padX: 9,
    padY: 6,
    gap: 8,
    edgeInset: 10,
    minWidth: 84,
    maxWidth: 178,
    laneGap: 8
  };

  function pointInRectLocal(x, y, rect) {
    return !!rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  function rectCenter(rect) {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  function cardLike(rect) {
    if (!rect) return null;
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      center: rectCenter(rect)
    };
  }

  function rectFullyInside(rect, container) {
    return !!rect && !!container &&
      rect.x >= container.x - 1e-6 &&
      rect.y >= container.y - 1e-6 &&
      rect.x + rect.width <= container.x + container.width + 1e-6 &&
      rect.y + rect.height <= container.y + container.height + 1e-6;
  }

  function clampPointToRect(point, rect) {
    return {
      x: clamp(point.x, rect.x + 1, rect.x + rect.width - 1),
      y: clamp(point.y, rect.y + 1, rect.y + rect.height - 1)
    };
  }

  function rectsHit(a, b, pad) {
    var p = pad || 0;
    return a.x < b.x + b.width + p && a.x + a.width + p > b.x &&
      a.y < b.y + b.height + p && a.y + a.height + p > b.y;
  }

  function normalizeAngleDiff(angle) {
    var twoPi = Math.PI * 2;
    var value = angle % twoPi;
    if (value > Math.PI) value -= twoPi;
    if (value < -Math.PI) value += twoPi;
    return value;
  }

  // 投影が使えない点の画面方向。カメラ基底への射影、退化（ちょうど反対側）時は
  // 球面の方位・仰角差へフォールバックする。id による固定の最後の逃げ道も持ち、
  // 反対側（antipode）でも NaN にせず決定的に並ぶ。
  function endpointDirection(point, projected, camera, basis, center, origin, fallbackKey) {
    if (projected && isFinite(projected.x) && isFinite(projected.y)) {
      var dx = projected.x - origin.x;
      var dy = projected.y - origin.y;
      if (Math.hypot(dx, dy) > 1e-3) {
        return { x: dx, y: dy, angle: Math.atan2(dy, dx), bearing: false };
      }
    }
    var normal = normalize(sub(point, center));
    var sx = dot(normal, basis.right);
    var sy = -dot(normal, basis.up);
    if (Math.hypot(sx, sy) > 1e-4) {
      return { x: sx, y: sy, angle: Math.atan2(sy, sx), bearing: true };
    }
    var lon = Math.atan2(normal.x, normal.z);
    var lat = Math.asin(clamp(normal.y, -1, 1));
    var dLon = normalizeAngleDiff(lon - camera.azimuth);
    var dLat = lat - camera.elevation;
    var angle = Math.atan2(-dLat, Math.sin(dLon));
    if (!isFinite(angle) || (Math.abs(dLon) < 1e-6 && Math.abs(dLat) < 1e-6)) {
      var hash = 0;
      var key = String(fallbackKey == null ? '' : fallbackKey);
      for (var i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 8;
      angle = hash * Math.PI / 4;
    }
    return { x: Math.cos(angle), y: Math.sin(angle), angle: angle, bearing: true };
  }

  // 方向ベクトルが矩形の縁に当たる点。
  function boundaryForDirection(rect, origin, dir) {
    var dx = dir.x;
    var dy = dir.y;
    if (!(Math.abs(dx) + Math.abs(dy) > 1e-9)) return { x: rect.x, y: rect.y };
    var tx = dx > 0 ? (rect.x + rect.width - origin.x) / dx
      : (dx < 0 ? (rect.x - origin.x) / dx : Infinity);
    var ty = dy > 0 ? (rect.y + rect.height - origin.y) / dy
      : (dy < 0 ? (rect.y - origin.y) / dy : Infinity);
    var t = Math.min(tx, ty);
    if (!(t > 0) || !isFinite(t)) t = 0;
    return {
      x: clamp(origin.x + dx * t, rect.x, rect.x + rect.width),
      y: clamp(origin.y + dy * t, rect.y, rect.y + rect.height)
    };
  }

  // 文字幅の見積もり（DOM なしでテストできるよう決定的に計算する）。
  function estimateTextWidth(text, fontSize) {
    var value = String(text == null ? '' : text);
    var width = 0;
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code >= 0x2e80) width += fontSize;
      else if (code === 32) width += fontSize * 0.32;
      else if (code >= 65 && code <= 90) width += fontSize * 0.68;
      else width += fontSize * 0.56;
    }
    return width;
  }

  function wrapCardText(text, maxWidth, fontSize) {
    var value = String(text == null ? '' : text);
    if (!value) return [''];
    var lines = [];
    var line = '';
    function pushWord(word) {
      var candidate = line ? line + ' ' + word : word;
      if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      if (estimateTextWidth(word, fontSize) <= maxWidth) {
        line = word;
        return;
      }
      var chunk = '';
      for (var i = 0; i < word.length; i++) {
        var next = chunk + word.charAt(i);
        if (chunk && estimateTextWidth(next, fontSize) > maxWidth) {
          lines.push(chunk);
          chunk = word.charAt(i);
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }
    value.split(/\s+/).filter(Boolean).forEach(pushWord);
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function measureVirtualCard(member, maxWidth) {
    var style = VIRTUAL_STYLE;
    var inner = Math.max(24, maxWidth - style.padX * 2 - 3);
    var natural = estimateTextWidth(member.name, style.fontSize);
    var width = clamp(Math.ceil(natural) + style.padX * 2 + 3, style.minWidth, maxWidth);
    var lines = wrapCardText(member.name, width - style.padX * 2 - 3, style.fontSize);
    var height = style.padY * 2 + lines.length * style.lineHeight;
    return { width: width, height: height, lines: lines };
  }

  function candidatePositions(min, max, step) {
    var out = [];
    for (var v = min; v <= max + 1e-6; v += step) {
      out.push(Math.min(v, max));
    }
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }

  // 1 レーン内で、目標位置に最も近い非衝突の置き場所を探す。
  function searchCardSlot(card, desired, edge, bounds, laneWidth, lane, occupied, gap) {
    var minX = bounds.x;
    var maxX = bounds.x + bounds.width - card.width;
    var minY = bounds.y;
    var maxY = bounds.y + bounds.height - card.height;
    if (maxX < minX || maxY < minY) return null;
    var i;
    if (edge === 'left' || edge === 'right') {
      var fixedX = edge === 'right' ? maxX - lane * laneWidth : minX + lane * laneWidth;
      if (fixedX < minX - 1e-6 || fixedX > maxX + 1e-6) return null;
      var wantY = clamp(desired.y - card.height / 2, minY, maxY);
      var ys = candidatePositions(minY, maxY, 4);
      var bestY = null;
      for (i = 0; i < ys.length; i++) {
        var rectY = { x: fixedX, y: ys[i], width: card.width, height: card.height };
        if (!occupied.some(function (other) { return rectsHit(rectY, other, gap); })) {
          var dy = Math.abs(ys[i] + card.height / 2 - desired.y);
          if (!bestY || dy < bestY.dy) bestY = { x: fixedX, y: ys[i], dy: dy };
        }
      }
      return bestY ? { x: bestY.x, y: bestY.y } : null;
    }
    var fixedY = edge === 'top' ? minY + lane * laneWidth : maxY - lane * laneWidth;
    if (fixedY < minY - 1e-6 || fixedY > maxY + 1e-6) return null;
    var wantX = clamp(desired.x - card.width / 2, minX, maxX);
    var xs = candidatePositions(minX, maxX, 4);
    var bestX = null;
    for (i = 0; i < xs.length; i++) {
      var rectX = { x: xs[i], y: fixedY, width: card.width, height: card.height };
      if (!occupied.some(function (other) { return rectsHit(rectX, other, gap); })) {
        var dx = Math.abs(xs[i] + card.width / 2 - desired.x);
        if (!bestX || dx < bestX.dx) bestX = { x: xs[i], y: fixedY, dx: dx };
      }
    }
    return bestX ? { x: bestX.x, y: bestX.y } : null;
  }

  // レーンが埋まったときの最終位置（落とさない。重なりは stats で報告）。
  function forcedCardSlot(card, desired, edge, bounds) {
    var minX = bounds.x;
    var maxX = Math.max(bounds.x, bounds.x + bounds.width - card.width);
    var minY = bounds.y;
    var maxY = Math.max(bounds.y, bounds.y + bounds.height - card.height);
    if (edge === 'left') return { x: minX, y: clamp(desired.y - card.height / 2, minY, maxY) };
    if (edge === 'right') return { x: maxX, y: clamp(desired.y - card.height / 2, minY, maxY) };
    if (edge === 'top') return { x: clamp(desired.x - card.width / 2, minX, maxX), y: minY };
    return { x: clamp(desired.x - card.width / 2, minX, maxX), y: maxY };
  }

  function placeVirtualCards(virtuals, usable, origin, occupied) {
    var style = VIRTUAL_STYLE;
    var inset = style.edgeInset;
    var bounds = {
      x: usable.x + inset,
      y: usable.y + inset,
      width: Math.max(1, usable.width - inset * 2),
      height: Math.max(1, usable.height - inset * 2)
    };
    var maxWidth = clamp(Math.round(usable.width * 0.42), 96, style.maxWidth);
    var groups = { left: [], right: [], top: [], bottom: [] };
    virtuals.forEach(function (member) {
      member.card = measureVirtualCard(member, maxWidth);
    });
    virtuals.forEach(function (member) {
      var dir = member.direction || { x: 0, y: -1 };
      var edge;
      if (Math.abs(dir.x) >= Math.abs(dir.y)) edge = dir.x >= 0 ? 'right' : 'left';
      else edge = dir.y >= 0 ? 'bottom' : 'top';
      member.edge = edge;
      member.target = boundaryForDirection(bounds, origin, dir);
      groups[edge].push(member);
    });
    var limited = false;
    ['left', 'right', 'top', 'bottom'].forEach(function (edge) {
      var list = groups[edge];
      if (!list.length) return;
      var vertical = edge === 'left' || edge === 'right';
      var laneWidth = 0;
      list.forEach(function (member) {
        laneWidth = Math.max(laneWidth, vertical ? member.card.width : member.card.height);
      });
      laneWidth += style.laneGap;
      list.sort(function (a, b) {
        var av = vertical ? a.target.y : a.target.x;
        var bv = vertical ? b.target.y : b.target.x;
        if (av !== bv) return av - bv;
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
      list.forEach(function (member) {
        var slot = null;
        for (var lane = 0; lane < 12 && !slot; lane++) {
          slot = searchCardSlot(member.card, member.target, edge, bounds, laneWidth, lane, occupied, style.gap);
        }
        if (!slot) {
          limited = true;
          slot = forcedCardSlot(member.card, member.target, edge, bounds);
        }
        member.card.x = slot.x;
        member.card.y = slot.y;
        member.card.center = {
          x: slot.x + member.card.width / 2,
          y: slot.y + member.card.height / 2
        };
        occupied.push({
          x: slot.x,
          y: slot.y,
          width: member.card.width,
          height: member.card.height
        });
      });
    });
    var overlapPairs = 0;
    for (var i = 0; i < virtuals.length; i++) {
      for (var j = i + 1; j < virtuals.length; j++) {
        if (rectsHit(virtuals[i].card, virtuals[j].card, 0)) overlapPairs++;
      }
    }
    return { limited: limited || overlapPairs > 0, overlapPairs: overlapPairs };
  }

  // 投影が極端に大きい（near 面ぎりぎり）とき、そのまま使うと精度が落ちる。
  // 方向は保ったまま十分大きい有限値へ丸める（clipSegment の取りこぼし防止）。
  var MAX_PROJECTION = 1e7;

  function capProjection(target, from) {
    if (!target || !isFinite(target.x) || !isFinite(target.y)) return null;
    var dx = target.x - from.x;
    var dy = target.y - from.y;
    if (Math.abs(dx) <= MAX_PROJECTION && Math.abs(dy) <= MAX_PROJECTION) {
      return { x: target.x, y: target.y };
    }
    var len = Math.hypot(dx, dy);
    if (!(len > 0)) return { x: target.x, y: target.y };
    var scale = MAX_PROJECTION / len;
    return { x: from.x + dx * scale, y: from.y + dy * scale };
  }

  // 実際の投影線分を usable 領域で切った、仮想側の接続点。
  function attachmentAnchor(virtual, usable, origin, actual) {
    var projected = virtual.projected;
    var target = projected && isFinite(projected.x) && isFinite(projected.y)
      ? projected
      : {
        x: origin.x + (virtual.direction ? virtual.direction.x : 0) * 4000,
        y: origin.y + (virtual.direction ? virtual.direction.y : -1) * 4000
      };
    // 投影点が仮想カード自身の下にあると、カードを後から描くぶん線が消える。
    // その場合はカード中心から投影方向へ usable の縁まで逃がす。
    if (virtual.card && pointInRectLocal(target.x, target.y, virtual.card)) {
      var away = {
        x: target.x - virtual.card.center.x,
        y: target.y - virtual.card.center.y
      };
      if (!(Math.hypot(away.x, away.y) > 1e-6) && virtual.direction) {
        away = { x: virtual.direction.x, y: virtual.direction.y };
      }
      target = boundaryForDirection(usable, virtual.card.center, away);
    }
    target = capProjection(target, actual) || target;
    if (pointInRectLocal(target.x, target.y, usable)) {
      return { point: { x: target.x, y: target.y }, clipped: false };
    }
    var clip = P.clipSegment(actual.x, actual.y, target.x, target.y, usable);
    if (clip) {
      return { point: { x: clip.x2, y: clip.y2 }, clipped: true };
    }
    return {
      point: boundaryForDirection(usable, actual, { x: target.x - actual.x, y: target.y - actual.y }),
      clipped: true
    };
  }

  // カード中心から相手方向へ伸ばした線がカードの縁に当たる点。
  function cardEdgePoint(card, tx, ty) {
    var cx = card.center.x;
    var cy = card.center.y;
    var dx = tx - cx;
    var dy = ty - cy;
    if (!(Math.abs(dx) + Math.abs(dy) > 1e-9)) return { x: cx, y: cy };
    var sx = dx !== 0 ? (card.width / 2) / Math.abs(dx) : Infinity;
    var sy = dy !== 0 ? (card.height / 2) / Math.abs(dy) : Infinity;
    var s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  // ============ 合成コネクタの可視保証（Canvas の実描画順に合わせる） ============
  //
  // drawXray は「破線 → 仮想カード」の順に描く。そのため、2 枚の仮想カードが
  // 重なっている・同じ縁に並んでいる場合、中心同士を結ぶ直線はカード塗りに
  // 完全に隠れて経路が見えないことがある。実データ（球の中・狭 FOV）で再現する。
  // ここではカードの縁から縁へを基本にし、可視部分が足りなければ内側レーンへ
  // 明示的なジョグを作る。UI パネル（exclusion）も不透明として避ける。

  var MIN_VISIBLE_CONNECTOR = 6;

  function pointBlocked(x, y, blockers) {
    for (var i = 0; i < blockers.length; i++) {
      if (pointInRectLocal(x, y, blockers[i])) return true;
    }
    return false;
  }

  function polylineVisibleLength(path, blockers) {
    if (!path || path.length < 2) return 0;
    var visible = 0;
    for (var i = 1; i < path.length; i++) {
      var a = path[i - 1];
      var b = path[i];
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > 0) || !isFinite(len)) continue;
      var samples = Math.max(6, Math.ceil(len / 4));
      var open = 0;
      for (var k = 0; k <= samples; k++) {
        var t = k / samples;
        if (!pointBlocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, blockers)) open += 1;
      }
      visible += len * (open / (samples + 1));
    }
    return visible;
  }

  // 端点（仮想カードの縁）から 16px 以内に不透明領域の外へ出る点があるか。
  // 「線はあるが相手カードの下で終わって見えない」を弾く。
  function endpointReachable(path, blockers, atStart) {
    if (!path || path.length < 2) return false;
    var endpoint = atStart ? path[0] : path[path.length - 1];
    var next = atStart ? path[1] : path[path.length - 2];
    var len = Math.hypot(next.x - endpoint.x, next.y - endpoint.y);
    if (!(len > 0)) return false;
    var probe = Math.min(16, len);
    var steps = Math.max(4, Math.ceil(probe / 2));
    for (var i = 1; i <= steps; i++) {
      var t = (probe * (i / steps)) / len;
      if (!pointBlocked(endpoint.x + (next.x - endpoint.x) * t,
        endpoint.y + (next.y - endpoint.y) * t, blockers)) {
        return true;
      }
    }
    return false;
  }

  function pathConnected(path, blockers, checkStart, checkEnd) {
    if (checkStart && !endpointReachable(path, blockers, true)) return false;
    if (checkEnd && !endpointReachable(path, blockers, false)) return false;
    return true;
  }

  function sanitizePath(path) {
    var out = [];
    (path || []).forEach(function (point) {
      if (!point || !isFinite(point.x) || !isFinite(point.y)) return;
      var last = out[out.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1e-6) return;
      out.push({ x: point.x, y: point.y });
    });
    return out.length >= 2 ? out : null;
  }

  // カードの指定した辺で、外側 6px が塞がっていない点を選ぶ（重なりで縁が
  // 他のカードに覆われている場合の逃げ）。見つからなければ中心側の縁。
  function clearSidePoint(card, side, want, blockers) {
    var vertical = side === 'left' || side === 'right';
    var half = vertical ? card.height / 2 : card.width / 2;
    var center = vertical ? card.center.y : card.center.x;
    var best = null;
    var bestDistance = Infinity;
    for (var delta = -half + 2; delta <= half - 2; delta += 3) {
      var along = center + delta;
      var point = vertical
        ? { x: side === 'left' ? card.x : card.x + card.width, y: along }
        : { x: along, y: side === 'top' ? card.y : card.y + card.height };
      var probe = {
        x: point.x + (side === 'right' ? 6 : (side === 'left' ? -6 : 0)),
        y: point.y + (side === 'bottom' ? 6 : (side === 'top' ? -6 : 0))
      };
      if (pointBlocked(probe.x, probe.y, blockers)) continue;
      var distance = Math.abs(along - want);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    if (best) return best;
    return vertical
      ? { x: side === 'left' ? card.x : card.x + card.width, y: card.center.y }
      : { x: card.center.x, y: side === 'top' ? card.y : card.y + card.height };
  }

  function clearBorderTowards(card, tx, ty, blockers) {
    var dx = tx - card.center.x;
    var dy = ty - card.center.y;
    var side;
    var want;
    if (Math.abs(dx) >= Math.abs(dy)) {
      side = dx >= 0 ? 'right' : 'left';
      want = ty;
    } else {
      side = dy >= 0 ? 'bottom' : 'top';
      want = tx;
    }
    return clearSidePoint(card, side, want, blockers);
  }

  // 2 枚の仮想カードの外側に回り込む直交ジョグ。縁の内側だけでなく左右・上下の
  // 4 方向を試す（同じ列に他のカードが積まれている場合、内側レーンだけでは
  // 必ずそのカードの下を通ってしまうため）。
  function lanePath(a, b, lane, off, usable, blockers) {
    if (lane === 'left') {
      var lx = Math.min(a.x, b.x) - off;
      if (lx < usable.x + 2) return null;
      var paL = clearSidePoint(a, 'left', b.center.y, blockers);
      var pbL = clearSidePoint(b, 'left', a.center.y, blockers);
      return sanitizePath([paL, { x: lx, y: paL.y }, { x: lx, y: pbL.y }, pbL]);
    }
    if (lane === 'right') {
      var rx = Math.max(a.x + a.width, b.x + b.width) + off;
      if (rx > usable.x + usable.width - 2) return null;
      var paR = clearSidePoint(a, 'right', b.center.y, blockers);
      var pbR = clearSidePoint(b, 'right', a.center.y, blockers);
      return sanitizePath([paR, { x: rx, y: paR.y }, { x: rx, y: pbR.y }, pbR]);
    }
    if (lane === 'top') {
      var ty = Math.min(a.y, b.y) - off;
      if (ty < usable.y + 2) return null;
      var paT = clearSidePoint(a, 'top', b.center.x, blockers);
      var pbT = clearSidePoint(b, 'top', a.center.x, blockers);
      return sanitizePath([paT, { x: paT.x, y: ty }, { x: pbT.x, y: ty }, pbT]);
    }
    var by = Math.max(a.y + a.height, b.y + b.height) + off;
    if (by > usable.y + usable.height - 2) return null;
    var paB = clearSidePoint(a, 'bottom', b.center.x, blockers);
    var pbB = clearSidePoint(b, 'bottom', a.center.x, blockers);
    return sanitizePath([paB, { x: paB.x, y: by }, { x: pbB.x, y: by }, pbB]);
  }

  function sameEdgeJog(a, b, blockers, usable) {
    var direct = sanitizePath([
      cardEdgePoint(a, b.center.x, b.center.y),
      cardEdgePoint(b, a.center.x, a.center.y)
    ]);
    var target = Math.min(48, Math.max(12, polylineVisibleLength(direct, blockers) * 0.9 + 12));
    var lanes = ['left', 'right', 'top', 'bottom'];
    var best = null;
    var bestVisible = -1;
    var bestLength = Infinity;
    var bestAdequate = null;
    var bestAdequateLength = Infinity;
    var offsets = [6, 14, 26, 42, 62, 88, 120, 156];
    for (var l = 0; l < lanes.length; l++) {
      for (var oi = 0; oi < offsets.length; oi++) {
        var off = offsets[oi];
        var path = lanePath(a, b, lanes[l], off, usable, blockers);
        if (!path) continue;
        var visible = polylineVisibleLength(path, blockers);
        var total = 0;
        for (var i = 1; i < path.length; i++) {
          total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        }
        if (visible > bestVisible || (visible === bestVisible && total < bestLength)) {
          best = path;
          bestVisible = visible;
          bestLength = total;
        }
        var connected = endpointReachable(path, blockers, true) &&
          endpointReachable(path, blockers, false);
        if (visible >= target && connected) {
          if (total < bestAdequateLength) {
            bestAdequate = path;
            bestAdequateLength = total;
          }
          // 同じレーンではオフセットを増やすほど長くなる。最初の可視候補で打ち切る。
          break;
        }
      }
    }
    return bestAdequate || best;
  }

  // 同じ縁でない場合の汎用ジョグ。直線の中点を法線方向へずらした 3 点経路。
  function bentConnector(start, end, blockers, usable) {
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var len = Math.hypot(dx, dy);
    if (!(len > 0)) return null;
    var nx = -dy / len;
    var ny = dx / len;
    var best = null;
    var bestVisible = polylineVisibleLength([start, end], blockers);
    var bestLength = len;
    var adequate = null;
    var adequateLength = Infinity;
    [14, 26, 40, 58, 80, 110].forEach(function (off) {
      [1, -1].forEach(function (sign) {
        var mid = {
          x: clamp((start.x + end.x) / 2 + nx * off * sign, usable.x + 2, usable.x + usable.width - 2),
          y: clamp((start.y + end.y) / 2 + ny * off * sign, usable.y + 2, usable.y + usable.height - 2)
        };
        var path = sanitizePath([start, mid, end]);
        if (!path) return;
        var visible = polylineVisibleLength(path, blockers);
        var total = Math.hypot(mid.x - start.x, mid.y - start.y) +
          Math.hypot(end.x - mid.x, end.y - mid.y);
        if (visible > bestVisible || (visible === bestVisible && total < bestLength)) {
          best = path;
          bestVisible = visible;
          bestLength = total;
        }
        if (visible >= Math.max(12, Math.min(48, len * 0.5)) && total < adequateLength) {
          adequate = path;
          adequateLength = total;
        }
      });
    });
    return adequate || best;
  }

  // 実 plan 辺（solid）が、実カードの縁から usable の出口まで、他のカードや
  // UI パネルに遮られずに連続して見えるか。端点カード自身は遮り扱いしない。
  function solidUsableContinuity(planEdge, actualSide, actualCard, virtualCard, blockers, usable) {
    if (!planEdge || !actualCard) return null;
    var clip = P.clipSegment(planEdge.x1, planEdge.y1, planEdge.x2, planEdge.y2, usable);
    if (!clip) return null;
    var a = actualSide === 'from'
      ? { x: clip.x1, y: clip.y1 }
      : { x: clip.x2, y: clip.y2 };
    var b = actualSide === 'from'
      ? { x: clip.x2, y: clip.y2 }
      : { x: clip.x1, y: clip.y1 };
    // usable に入った点が実カードの上/縁でなければ、実カードから連続していない。
    if (!pointInRectLocal(a.x, a.y, actualCard)) return null;
    var len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 8)) return null;
    var localBlockers = blockers.filter(function (rect) {
      return rect !== actualCard && rect !== virtualCard;
    });
    var samples = Math.max(10, Math.ceil(len / 2));
    var leftCard = false;
    var visible = 0;
    var touchesVirtual = false;
    for (var i = 0; i <= samples; i++) {
      var t = i / samples;
      var x = a.x + (b.x - a.x) * t;
      var y = a.y + (b.y - a.y) * t;
      if (!leftCard) {
        if (pointInRectLocal(x, y, actualCard)) continue;
        leftCard = true;
      }
      if (pointInRectLocal(x, y, virtualCard)) touchesVirtual = true;
      if (pointBlocked(x, y, localBlockers)) return null;
      visible += len / (samples + 1);
    }
    if (!leftCard || visible < 8) return null;
    return {
      exit: { x: b.x, y: b.y },
      visible: visible,
      touchesVirtual: touchesVirtual
    };
  }

  function pointNearRect(point, rect, pad) {
    var p = pad == null ? 0 : pad;
    return !!point && !!rect &&
      point.x >= rect.x - p && point.x <= rect.x + rect.width + p &&
      point.y >= rect.y - p && point.y <= rect.y + rect.height + p;
  }

  // 共有 renderer は編集せず、このローカル plan から抑制した辺だけを外して
  // 同じバッチ規則で組み直す（fade/highlight は plan のフラグを尊重）。
  function rebuildPlanEdgeBatches(plan) {
    var anySelected = !!plan.selectedId;
    var byKey = Object.create(null);
    var batches = [];
    (plan.edges || []).forEach(function (item) {
      var key;
      if (item.fade) key = item.academic ? 'academic' : 'normal';
      else if (item.selected) key = item.academic ? 'sel-academic' : 'sel-normal';
      else if (item.searchLink) key = item.academic ? 'academic' : 'normal';
      else if (item.academic) key = anySelected ? 'academic-dim' : 'academic';
      else key = anySelected ? 'normal-dim' : 'normal';
      var band = item.depth < 1 / 3 ? 0 : (item.depth < 2 / 3 ? 1 : 2);
      var batchKey = key + '|' + band + (item.fade ? '|fade' : '');
      if (!byKey[batchKey]) {
        byKey[batchKey] = { key: key, band: band, fade: !!item.fade, highlight: false, edges: [] };
        batches.push(byKey[batchKey]);
      }
      byKey[batchKey].edges.push(item);
      if (item.highlightFade) {
        var highlightKey = (item.academic ? 'sel-academic' : 'sel-normal') + '|' + band + '|hl';
        if (!byKey[highlightKey]) {
          byKey[highlightKey] = {
            key: item.academic ? 'sel-academic' : 'sel-normal',
            band: band,
            fade: false,
            highlight: true,
            edges: []
          };
          batches.push(byKey[highlightKey]);
        }
        byKey[highlightKey].edges.push(item);
      }
    });
    plan.edgeBatches = batches;
    if (plan.stats) {
      plan.stats.edges = (plan.edges || []).length;
      plan.stats.edgeBatches = batches.length;
    }
    return batches;
  }

  function pathLength(path) {
    var total = 0;
    for (var i = 1; i < (path || []).length; i++) {
      total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return total;
  }

  // 経路の 6 割以上が不透明カード/パネルの外で見え、両端まで届くことを要求する。
  // 途中のカードで分断される直線は、可視でも「つながって見えない」ためジョグへ送る。
  function pathAdequate(path, blockers, checkStart, checkEnd) {
    var total = pathLength(path);
    if (!(total > 0)) return false;
    var visible = polylineVisibleLength(path, blockers);
    return visible >= Math.max(MIN_VISIBLE_CONNECTOR, total * 0.6) &&
      pathConnected(path, blockers, checkStart, checkEnd);
  }

  function buildConnectorPath(record, startCard, endCard, checkStart, checkEnd, blockers, usable) {
    var direct = sanitizePath(record.points) || sanitizePath([
      { x: record.x1, y: record.y1 },
      { x: record.x2, y: record.y2 }
    ]);
    // 直線が十分見え、両端のカード縁まで届いているならジョグへ差し替えない。
    if (pathAdequate(direct, blockers, checkStart, checkEnd)) return direct;
    var candidates = [];
    if (startCard && endCard) {
      candidates.push(sameEdgeJog(startCard, endCard, blockers, usable));
    }
    if (direct && direct.length) {
      candidates.push(bentConnector(direct[0], direct[direct.length - 1], blockers, usable));
    }
    var best = direct;
    var bestVisible = polylineVisibleLength(direct, blockers);
    var bestLength = Infinity;
    var adequate = null;
    var adequateLength = Infinity;
    candidates.forEach(function (path) {
      if (!path || path.length < 2) return;
      var visible = polylineVisibleLength(path, blockers);
      var total = pathLength(path);
      if (visible > bestVisible || (visible === bestVisible && total < bestLength)) {
        best = path;
        bestVisible = visible;
        bestLength = total;
      }
      if (visible >= Math.max(MIN_VISIBLE_CONNECTOR, total * 0.6) &&
        pathConnected(path, blockers, checkStart, checkEnd) &&
        total < adequateLength) {
        adequate = path;
        adequateLength = total;
      }
    });
    // 可視・接続できる候補のうち、最短のものを選ぶ（巨大な外周ループを避ける）。
    return adequate || best || direct;
  }

  function buildSelectedXray(model, layout, camera, plan, options) {
    options = options || {};
    var selectedId = options.selectedId || (plan && plan.selectedId) || null;
    if (!selectedId || !model || !layout || !layout.points) return null;
    var layer = options.layer === 'academic' ? 'academic' : 'normal';
    var viewport = options.viewport || (plan && plan.viewport) || { width: 1, height: 1 };
    var center = options.center || layout.center || { x: 0, y: 0, z: 0 };
    var groups = model.groupsForCompound ? model.groupsForCompound(selectedId, layer) : [];
    if (!groups.length) return null;
    var exclusions = Array.isArray(options.exclusions) ? options.exclusions : [];
    var usable = options.usableRect || { x: 0, y: 0, width: viewport.width, height: viewport.height };
    var basis = P.cameraBasis(camera);
    var points = layout.points;
    var groupIds = Object.create(null);
    var endpointIds = Object.create(null);
    endpointIds[selectedId] = true;
    groups.forEach(function (group) {
      groupIds[group.id] = true;
      group.substrateIds.concat(group.productIds).forEach(function (id) {
        if (model.byId[id]) endpointIds[id] = true;
      });
    });

    var planById = Object.create(null);
    if (plan && plan.nodes) {
      plan.nodes.forEach(function (node) { planById[node.id] = node; });
    }
    var planEdgeIds = Object.create(null);
    var planEdgeById = Object.create(null);
    if (plan && plan.edges) {
      plan.edges.forEach(function (edge) {
        planEdgeIds[edge.id] = true;
        planEdgeById[edge.id] = edge;
      });
    }

    var selectedNode = planById[selectedId];
    var selectedProjected = selectedNode
      ? (selectedNode.card && selectedNode.rect
        ? { x: selectedNode.rect.x + selectedNode.rect.width / 2, y: selectedNode.rect.y + selectedNode.rect.height / 2 }
        : { x: selectedNode.x, y: selectedNode.y })
      : (points[selectedId] ? P.cameraView(camera, points[selectedId], viewport) : null);
    var origin = selectedProjected && isFinite(selectedProjected.x)
      ? selectedProjected
      : { x: usable.x + usable.width / 2, y: usable.y + usable.height / 2 };

    var members = [];
    var virtuals = [];
    Object.keys(endpointIds).forEach(function (id) {
      var compound = model.byId[id];
      var point = points[id];
      if (!compound || !point) return;
      var projected = P.cameraView(camera, point, viewport);
      var node = planById[id];
      var hasCard = !!(node && node.card && !node.fade);
      var member = {
        id: id,
        name: compound.name || compound.label || id,
        label: compound.label || compound.name || id,
        point: point,
        projected: projected,
        visible: hasCard,
        node: node || null,
        reason: null,
        reasonLabel: '',
        direction: null,
        academic: false,
        palette: 'normal'
      };
      if (!hasCard) {
        var reason;
        if (!projected || !isFinite(projected.x) || !isFinite(projected.y)) reason = 'behind';
        else if (projected.x < 0 || projected.x > viewport.width ||
          projected.y < 0 || projected.y > viewport.height) reason = 'offscreen';
        else if (exclusions.some(function (rect) { return pointInRectLocal(projected.x, projected.y, rect); })) reason = 'panel';
        else if (!isFrontFacing(point, center, camera, 0)) reason = 'far';
        else reason = 'unplaced';
        member.reason = reason;
        member.reasonLabel = REASON_LABEL[reason] || '画面の外';
        member.direction = endpointDirection(point, projected, camera, basis, center, origin, id);
        virtuals.push(member);
      }
      members.push(member);
    });

    var allEdges = model.edgesForLayer ? model.edgesForLayer(layer) : [];
    var selectedEdges = allEdges.filter(function (edge) { return !!groupIds[edge.groupId]; });
    var academicIds = Object.create(null);
    selectedEdges.forEach(function (edge) {
      if (edge.academicOnly) {
        academicIds[edge.from] = true;
        academicIds[edge.to] = true;
      }
    });
    virtuals.forEach(function (member) {
      member.academic = !!academicIds[member.id];
      member.palette = member.academic ? 'academic' : 'normal';
    });

    var occupied = [];
    exclusions.forEach(function (rect) {
      occupied.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    });
    (plan && plan.nodes ? plan.nodes : []).forEach(function (node) {
      if (node.card && node.rect && !node.fade) occupied.push(node.rect);
    });
    var placement = placeVirtualCards(virtuals, usable, origin, occupied);

    var virtualById = Object.create(null);
    virtuals.forEach(function (member) { virtualById[member.id] = member; });

    // 実際の描画順（破線 → 仮想カード）で不透明なもの。
    // 参照を保つ（solid 連続性で端点カード自身だけを除外できるようにする）。
    var blockers = virtuals.map(function (member) { return member.card; }).concat(exclusions);
    // solid の可視連続性は、実カード（renderer が後から塗る）も遮りとして見る。
    var solidBlockers = blockers.slice();
    (plan && plan.nodes ? plan.nodes : []).forEach(function (node) {
      if (node.card && node.rect && !node.fade) solidBlockers.push(node.rect);
    });
    var suppressEdgeIds = Object.create(null);

    // 選択グループの全辺を、公開 renderer の描画か合成の破線で必ず覆う。
    var records = [];
    selectedEdges.forEach(function (edge) {
      var fromVirtual = virtualById[edge.from] || null;
      var toVirtual = virtualById[edge.to] || null;
      var fromNode = planById[edge.from];
      var toNode = planById[edge.to];
      var fromCard = fromNode && fromNode.card && !fromNode.fade ? fromNode.rect : null;
      var toCard = toNode && toNode.card && !toNode.fade ? toNode.rect : null;
      var fromCardLike = cardLike(fromCard);
      var toCardLike = cardLike(toCard);
      var planEdge = planEdgeById[edge.id] || null;
      var inPlan = !!planEdge;
      if (!fromVirtual && !toVirtual && inPlan) return;
      var suppressPlanEdge = false;
      var suppressArrow = false;
      var continuationExit = null;
      var actualCard = null;
      var actualSide = null;
      var virtualMember = null;
      if (fromVirtual && toVirtual) {
        // 両端が仮想: 実線（隠れた投影間）は使わず、破線コネクタだけにする。
        suppressPlanEdge = inPlan;
      } else if (toVirtual && fromCard) {
        actualCard = fromCard;
        actualSide = 'from';
        virtualMember = toVirtual;
      } else if (fromVirtual && toCard) {
        actualCard = toCard;
        actualSide = 'to';
        virtualMember = fromVirtual;
      }
      if (planEdge && actualCard && virtualMember) {
        var solid = solidUsableContinuity(
          planEdge, actualSide, actualCard, virtualMember.card, solidBlockers, usable);
        if (solid) {
          if (solid.touchesVirtual || pointNearRect(solid.exit, virtualMember.card, 2)) {
            // 実線が実カードから仮想カードの縁まで見えている → 破線を足さない。
            return;
          }
          // 実線の出口から先だけを破線で補う（分岐・二重矢印なし）。
          continuationExit = solid.exit;
          suppressArrow = true;
        } else {
          // 実線が usable 内で実カードから連続しない → 誤誘導の実線を抑制し、
          // 実カード縁から仮想カード縁までを 1 本の破線で結ぶ。
          suppressPlanEdge = true;
        }
      }
      if (suppressPlanEdge) suppressEdgeIds[edge.id] = true;
      // 実線が無い、または実カードが usable からはみ出しているときは、
      // 実カード縁 → 仮想カード縁の全長コネクタにする（途中の境界スタブだけにしない）。
      // 実線が既に内側を覆っている（inPlan かつ両カードが usable 内）ときは
      // 従来の境界スタブを残し、二重描画を避ける。
      var endToEnd = !inPlan ||
        !!((fromCardLike && !rectFullyInside(fromCard, usable)) ||
          (toCardLike && !rectFullyInside(toCard, usable)));
      if (continuationExit) endToEnd = false;
      else if (suppressPlanEdge && (fromVirtual || toVirtual)) endToEnd = true;
      var fromCenter = fromVirtual
        ? fromVirtual.card.center
        : (fromCard ? rectCenter(fromCard) : null);
      var toCenter = toVirtual
        ? toVirtual.card.center
        : (toCard ? rectCenter(toCard) : null);
      if (!fromCenter && points[edge.from]) {
        var fp = P.cameraView(camera, points[edge.from], viewport);
        if (fp && isFinite(fp.x) && isFinite(fp.y)) fromCenter = fp;
      }
      if (!toCenter && points[edge.to]) {
        var tp = P.cameraView(camera, points[edge.to], viewport);
        if (tp && isFinite(tp.x) && isFinite(tp.y)) toCenter = tp;
      }
      if (!fromCenter || !toCenter) return;
      var x1;
      var y1;
      var x2;
      var y2;
      var boundaryClipped = false;
      var startCard = null;
      var endCard = null;
      var checkStart = false;
      var checkEnd = false;
      if (continuationExit) {
        boundaryClipped = true;
        if (fromVirtual) {
          var virtualBorder = clearBorderTowards(
            fromVirtual.card, continuationExit.x, continuationExit.y, blockers);
          startCard = fromVirtual.card;
          checkStart = true;
          x1 = virtualBorder.x;
          y1 = virtualBorder.y;
          x2 = continuationExit.x;
          y2 = continuationExit.y;
        } else {
          var virtualBorderTo = clearBorderTowards(
            toVirtual.card, continuationExit.x, continuationExit.y, blockers);
          endCard = toVirtual.card;
          checkEnd = true;
          x1 = continuationExit.x;
          y1 = continuationExit.y;
          x2 = virtualBorderTo.x;
          y2 = virtualBorderTo.y;
        }
      } else if (fromVirtual && toVirtual) {
        // 中心同士ではなく、相手方向のカード縁から縁へ。重なり時は finalize で
        // 内側レーンのジョグへ差し替える。
        endToEnd = true;
        startCard = fromVirtual.card;
        endCard = toVirtual.card;
        checkStart = true;
        checkEnd = true;
        var fromBorder = clearBorderTowards(fromVirtual.card, toCenter.x, toCenter.y, blockers);
        var toBorder = clearBorderTowards(toVirtual.card, fromCenter.x, fromCenter.y, blockers);
        x1 = fromBorder.x;
        y1 = fromBorder.y;
        x2 = toBorder.x;
        y2 = toBorder.y;
      } else if (endToEnd && fromVirtual && toCardLike) {
        // 仮想（from）→ 実カード（to）。実線が無い/実カードがはみ出すときの全長。
        startCard = fromVirtual.card;
        endCard = toCardLike;
        checkStart = true;
        checkEnd = true;
        var fromBorderFull = clampPointToRect(
          clearBorderTowards(fromVirtual.card, toCenter.x, toCenter.y, blockers), usable);
        var toBorderFull = clampPointToRect(
          clearBorderTowards(toCardLike, fromCenter.x, fromCenter.y, blockers), usable);
        x1 = fromBorderFull.x;
        y1 = fromBorderFull.y;
        x2 = toBorderFull.x;
        y2 = toBorderFull.y;
      } else if (endToEnd && toVirtual && fromCardLike) {
        // 実カード（from）→ 仮想（to）。benzene → BHC / propene → cumene の本経路。
        startCard = fromCardLike;
        endCard = toVirtual.card;
        checkStart = true;
        checkEnd = true;
        var fromCardBorder = clampPointToRect(
          clearBorderTowards(fromCardLike, toCenter.x, toCenter.y, blockers), usable);
        var toCardBorder = clampPointToRect(
          clearBorderTowards(toVirtual.card, fromCenter.x, fromCenter.y, blockers), usable);
        x1 = fromCardBorder.x;
        y1 = fromCardBorder.y;
        x2 = toCardBorder.x;
        y2 = toCardBorder.y;
      } else if (fromVirtual) {
        checkStart = true;
        var fromAttach = attachmentAnchor(fromVirtual, usable, origin, toCenter);
        var fromEdge = cardEdgePoint(fromVirtual.card, fromAttach.point.x, fromAttach.point.y);
        x1 = fromEdge.x;
        y1 = fromEdge.y;
        x2 = fromAttach.point.x;
        y2 = fromAttach.point.y;
        boundaryClipped = fromAttach.clipped;
      } else if (toVirtual) {
        checkEnd = true;
        var toAttach = attachmentAnchor(toVirtual, usable, origin, fromCenter);
        var toEdgePoint = cardEdgePoint(toVirtual.card, toAttach.point.x, toAttach.point.y);
        x1 = toAttach.point.x;
        y1 = toAttach.point.y;
        x2 = toEdgePoint.x;
        y2 = toEdgePoint.y;
        boundaryClipped = toAttach.clipped;
      } else {
        if (endToEnd && fromCardLike && toCardLike) {
          startCard = fromCardLike;
          endCard = toCardLike;
          checkStart = true;
          checkEnd = true;
          var fromCardPoint = clampPointToRect(
            clearBorderTowards(fromCardLike, toCenter.x, toCenter.y, blockers), usable);
          var toCardPoint = clampPointToRect(
            clearBorderTowards(toCardLike, fromCenter.x, fromCenter.y, blockers), usable);
          x1 = fromCardPoint.x;
          y1 = fromCardPoint.y;
          x2 = toCardPoint.x;
          y2 = toCardPoint.y;
        } else {
          x1 = fromCenter.x;
          y1 = fromCenter.y;
          x2 = toCenter.x;
          y2 = toCenter.y;
        }
      }
      if (endToEnd) {
        if (fromCardLike && !rectFullyInside(fromCard, usable)) boundaryClipped = true;
        if (toCardLike && !rectFullyInside(toCard, usable)) boundaryClipped = true;
        if (fromVirtual && !fromCardLike && fromCenter &&
          !pointInRectLocal(fromCenter.x, fromCenter.y, usable)) boundaryClipped = true;
        if (toVirtual && !toCardLike && toCenter &&
          !pointInRectLocal(toCenter.x, toCenter.y, usable)) boundaryClipped = true;
      }
      records.push({
        id: edge.id,
        groupId: edge.groupId,
        from: edge.from,
        to: edge.to,
        academic: !!edge.academicOnly,
        typeLabel: edge.typeLabel || '',
        synthetic: true,
        boundaryClipped: boundaryClipped,
        fromVirtual: !!fromVirtual,
        toVirtual: !!toVirtual,
        missingPlan: !inPlan,
        endToEnd: endToEnd,
        continuation: !!continuationExit,
        suppressPlanEdge: suppressPlanEdge,
        suppressArrow: suppressArrow,
        startCard: startCard,
        endCard: endCard,
        checkStart: checkStart,
        checkEnd: checkEnd,
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        points: [
          { x: x1, y: y1 },
          { x: x2, y: y2 }
        ]
      });
    });

    // 実際の描画順（破線 → 仮想カード）で可視部分が残るようコネクタを確定する。
    records.forEach(function (record) {
      var path = buildConnectorPath(record, record.startCard, record.endCard,
        record.checkStart, record.checkEnd, blockers, usable);
      if (!path || path.length < 2) return;
      record.points = path;
      var first = path[0];
      var last = path[path.length - 1];
      record.x1 = first.x;
      record.y1 = first.y;
      record.x2 = last.x;
      record.y2 = last.y;
      record.jog = path.length > 2;
      var minX = Infinity;
      var minY = Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;
      var allFinite = true;
      path.forEach(function (point) {
        if (!isFinite(point.x) || !isFinite(point.y)) allFinite = false;
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      record.connected = pathConnected(path, blockers, record.checkStart, record.checkEnd);
      record.visibleLength = polylineVisibleLength(path, blockers);
      record.drawable = allFinite &&
        Math.hypot(record.x2 - record.x1, record.y2 - record.y1) > 0.5 &&
        record.visibleLength >= MIN_VISIBLE_CONNECTOR &&
        record.connected;
    });

    // 誤誘導・重複になる実線だけをローカル plan から外し、同じ規則でバッチを再構築。
    var suppressedCount = Object.keys(suppressEdgeIds).length;
    if (suppressedCount && plan && plan.edges) {
      plan.edges = plan.edges.filter(function (edge) { return !suppressEdgeIds[edge.id]; });
      rebuildPlanEdgeBatches(plan);
      if (plan.stats) plan.stats.suppressedEdges = suppressedCount;
    }

    var covered = Object.create(null);
    var planEdgeCount = 0;
    (plan && plan.edges ? plan.edges : []).forEach(function (edge) {
      if (groupIds[edge.groupId]) {
        covered[edge.id] = true;
        planEdgeCount += 1;
      }
    });
    records.forEach(function (record) { covered[record.id] = true; });
    var coveredCount = selectedEdges.filter(function (edge) { return !!covered[edge.id]; }).length;

    return {
      selectedId: selectedId,
      origin: origin,
      members: members,
      virtuals: virtuals,
      // 旧名（番号マーカー時代）との互換。中身は名前付き仮想カード。
      hidden: virtuals,
      edges: records,
      hitAreas: [],
      stats: {
        endpoints: members.length,
        visibleEndpoints: members.length - virtuals.length,
        virtuals: virtuals.length,
        selectedEdges: selectedEdges.length,
        planEdges: planEdgeCount,
        syntheticEdges: records.length,
        coveredEdges: coveredCount,
        overlapPairs: placement.overlapPairs,
        layoutLimited: placement.limited,
        suppressedPlanEdges: suppressedCount
      }
    };
  }

  function buildXrayHitAreas(overlay) {
    if (!overlay) return [];
    var areas = [];
    (overlay.virtuals || []).forEach(function (member) {
      var card = member.card;
      areas.push({
        type: 'member',
        id: member.id,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        cx: card.center.x,
        cy: card.center.y
      });
    });
    overlay.hitAreas = areas;
    return areas;
  }

  function pickXray(overlay, x, y) {
    if (!overlay) return null;
    var areas = overlay.hitAreas && overlay.hitAreas.length ? overlay.hitAreas : buildXrayHitAreas(overlay);
    for (var i = areas.length - 1; i >= 0; i--) {
      var area = areas[i];
      if (pointInRectLocal(x, y, area)) {
        return { type: area.type, id: area.id, index: undefined, virtual: true };
      }
    }
    return null;
  }

  function drawArrowHead(ctx, x, y, angle, color) {
    var size = 7.5;
    var spread = 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - Math.cos(angle) * size + Math.sin(angle) * size * spread,
      y - Math.sin(angle) * size - Math.cos(angle) * size * spread
    );
    ctx.lineTo(
      x - Math.cos(angle) * size - Math.sin(angle) * size * spread,
      y - Math.sin(angle) * size + Math.cos(angle) * size * spread
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawVirtualCard(ctx, member) {
    var card = member.card;
    var academic = member.palette === 'academic';
    var accent = academic ? 'rgba(103, 232, 249, 0.94)' : 'rgba(251, 191, 36, 0.94)';
    var border = academic ? 'rgba(103, 232, 249, 0.55)' : 'rgba(251, 191, 36, 0.5)';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(9, 14, 24, 0.94)';
    ctx.fillRect(card.x, card.y, card.width, card.height);
    ctx.fillStyle = accent;
    ctx.fillRect(card.x, card.y, 3, card.height);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(card.x + 0.5, card.y + 0.5, Math.max(0, card.width - 1), Math.max(0, card.height - 1));
    ctx.fillStyle = '#e8eef8';
    ctx.font = VIRTUAL_STYLE.fontSize + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    card.lines.forEach(function (line, index) {
      ctx.fillText(line, card.x + VIRTUAL_STYLE.padX + 3,
        card.y + VIRTUAL_STYLE.padY + VIRTUAL_STYLE.lineHeight * (index + 0.5));
    });
  }

  function drawXray(ctx, overlay, viewport) {
    if (!ctx || !overlay) return;
    var virtuals = overlay.virtuals || [];
    var edges = overlay.edges || [];
    if (!virtuals.length && !edges.length) return;
    ctx.save();
    // 1) 合成の破線（実際の投影線分の続き。無関係な辺は作らない）。
    edges.forEach(function (record) {
      var path = record.points && record.points.length >= 2
        ? record.points
        : [{ x: record.x1, y: record.y1 }, { x: record.x2, y: record.y2 }];
      var last = path[path.length - 1];
      var before = path[path.length - 2];
      if (!before || !(Math.hypot(last.x - before.x, last.y - before.y) > 0.5)) return;
      var color = record.academic
        ? 'rgba(103, 232, 249, 0.74)'
        : 'rgba(251, 191, 36, 0.7)';
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.setLineDash([]);
      if (!record.suppressArrow) {
        drawArrowHead(ctx, last.x, last.y,
          Math.atan2(last.y - before.y, last.x - before.x), color);
      }
    });

    // 2) 名前付き仮想カード。
    virtuals.forEach(function (member) {
      if (member.card) drawVirtualCard(ctx, member);
    });
    ctx.restore();
  }

  // ================== 選択解除時のフェードイン（復帰） ==================
  //
  // 選択中は「選択物質 + 直接の反応相手」だけが計画に残り、無関係は消えている。
  // 選択解除で全体表示へ戻すとき、いきなり全カードを出すのではなく、
  // 直前に見えていなかった物質・経路だけを 900ms でフェードインさせる。
  // 直前に見えていたものは alpha 1 のまま（steady）。カメラは app 側で補間し、
  // ここでは計画の fade フラグとグローバル alpha だけを扱う（同じ RAF）。
  var REVEAL_MS = 900;

  function easeInOutCubic(t) {
    var v = clamp(t, 0, 1);
    return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
  }

  function revealDuration(reduced) {
    return reduced ? 0 : REVEAL_MS;
  }

  function buildRevealSnapshot(plan) {
    var nodes = Object.create(null);
    var edges = Object.create(null);
    if (plan) {
      (plan.nodes || []).forEach(function (node) {
        if (node && !node.fade && node.id != null) nodes[node.id] = true;
      });
      (plan.edges || []).forEach(function (edge) {
        if (edge && !edge.fade && edge.id != null) edges[edge.id] = true;
      });
    }
    return { nodes: nodes, edges: edges };
  }

  function rebuildEdgeBatches(plan) {
    var byKey = Object.create(null);
    var batches = [];
    (plan.edges || []).forEach(function (edge) {
      var key;
      if (edge.fade) key = edge.academic ? 'academic' : 'normal';
      else if (edge.academic) key = 'academic';
      else key = 'normal';
      var band = edge.depth < 1 / 3 ? 0 : (edge.depth < 2 / 3 ? 1 : 2);
      var batchKey = key + '|' + band + (edge.fade ? '|fade' : '');
      if (!byKey[batchKey]) {
        byKey[batchKey] = { key: key, band: band, fade: !!edge.fade, highlight: false, edges: [] };
        batches.push(byKey[batchKey]);
      }
      byKey[batchKey].edges.push(edge);
    });
    plan.edgeBatches = batches;
    return batches;
  }

  // 直前に見えていなかったノード・辺にだけ fade を立て、alpha を 0..1 で進める。
  function applyReveal(plan, snapshot, alpha) {
    if (!plan) return plan;
    var a = clamp(alpha == null ? 1 : alpha, 0, 1);
    var known = snapshot || { nodes: Object.create(null), edges: Object.create(null) };
    var fadedEdges = 0;
    function markNode(node) {
      if (!node || node.id == null) return;
      node.fade = !known.nodes[node.id];
    }
    (plan.nodes || []).forEach(markNode);
    // cards / markers は nodes と同じ参照だが、念のため両方にも適用する。
    (plan.cards || []).forEach(markNode);
    (plan.markers || []).forEach(markNode);
    (plan.edges || []).forEach(function (edge) {
      if (known.edges[edge.id]) {
        edge.fade = false;
      } else {
        edge.fade = true;
        fadedEdges += 1;
      }
    });
    var fadedNodes = (plan.nodes || []).filter(function (node) { return !!node.fade; }).length;
    rebuildEdgeBatches(plan);
    plan.fadeAlpha = a;
    plan.reveal = {
      alpha: a,
      nodes: (plan.nodes || []).length,
      fadedNodes: fadedNodes,
      edges: (plan.edges || []).length,
      fadedEdges: fadedEdges
    };
    return plan;
  }

  function revealCamera(from, to, progress) {
    if (!from || !to) return to || from;
    return P.interpolateCamera(from, to, easeInOutCubic(progress));
  }

  return {
    outwardDirection: outwardDirection,
    isFrontFacing: isFrontFacing,
    visibleLayout: visibleLayout,
    buildGuideSegments: buildGuideSegments,
    replaceFloorSegments: replaceFloorSegments,
    buildSelectedXray: buildSelectedXray,
    buildXrayHitAreas: buildXrayHitAreas,
    pickXray: pickXray,
    drawXray: drawXray,
    REVEAL_MS: REVEAL_MS,
    revealDuration: revealDuration,
    buildRevealSnapshot: buildRevealSnapshot,
    applyReveal: applyReveal,
    revealCamera: revealCamera
  };
});
