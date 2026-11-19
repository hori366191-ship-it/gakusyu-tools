/*
 * app11-3d — 投影とカメラ（純関数・DOM なし）
 *
 * 目的:
 *   - 3D の物質位置を、透視投影で画面座標へ落とす
 *   - パン / オービット / ズーム / リセット / フォーカスの計算を一箇所に閉じる
 *   - カードは「画面に正対した矩形」として扱う（3D で傾けない）
 *
 * 座標系:
 *   world: x = 右, y = 上, z = 手前（右手系）
 *   camera: right / up / forward（forward は視線の先）
 *   screen: CSS px。x 右、y 下。
 *
 * 角度はすべて度で受け取り、内部ではラジアン。
 * Node では require、ブラウザでは window.RP3DProjection。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DProjection = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEG = Math.PI / 180;
  var WORLD_UP = { x: 0, y: 1, z: 0 };
  var DEFAULT_FOV = 50;
  var MIN_ELEVATION = -85;
  var MAX_ELEVATION = 85;
  var MIN_DISTANCE = 8;
  var MAX_DISTANCE = 2000;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }
  function toRad(deg) { return deg * DEG; }
  function toDeg(rad) { return rad / DEG; }

  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function mul(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function normalize(a) {
    var len = length(a);
    if (!(len > 1e-9)) return { x: 0, y: 1, z: 0 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
  }
  function distance(a, b) { return length(sub(a, b)); }

  function createCamera(options) {
    options = options || {};
    var target = options.target || { x: 0, y: 0, z: 0 };
    var azimuth = options.azimuth == null ? -35 : options.azimuth;
    var elevation = options.elevation == null ? 22 : options.elevation;
    return {
      target: { x: target.x || 0, y: target.y || 0, z: target.z || 0 },
      distance: clamp(options.distance == null ? 100 : options.distance, MIN_DISTANCE, MAX_DISTANCE),
      azimuth: normalizeAngle(toRad(azimuth)),
      elevation: clamp(toRad(elevation), toRad(MIN_ELEVATION), toRad(MAX_ELEVATION)),
      fov: toRad(clamp(options.fov == null ? DEFAULT_FOV : options.fov, 10, 100)),
      near: options.near == null ? 0.5 : options.near,
      far: options.far == null ? 4000 : options.far
    };
  }

  function cloneCamera(camera) {
    return {
      target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
      distance: camera.distance,
      azimuth: camera.azimuth,
      elevation: camera.elevation,
      fov: camera.fov,
      near: camera.near,
      far: camera.far
    };
  }

  function normalizeAngle(rad) {
    var twoPi = Math.PI * 2;
    var value = rad % twoPi;
    if (value > Math.PI) value -= twoPi;
    if (value < -Math.PI) value += twoPi;
    return value;
  }

  // カメラの基底。right / up は画面の +x / +y。forward は視線の先。
  function cameraBasis(camera) {
    var ce = Math.cos(camera.elevation);
    var se = Math.sin(camera.elevation);
    // target から eye へ向かう方向
    var offset = {
      x: ce * Math.sin(camera.azimuth),
      y: se,
      z: ce * Math.cos(camera.azimuth)
    };
    var eye = {
      x: camera.target.x + offset.x * camera.distance,
      y: camera.target.y + offset.y * camera.distance,
      z: camera.target.z + offset.z * camera.distance
    };
    var forward = normalize(mul(offset, -1));
    var right = normalize(cross(forward, WORLD_UP));
    var up = normalize(cross(right, forward));
    return {
      eye: eye,
      forward: forward,
      right: right,
      up: up,
      tanHalfFov: Math.tan(camera.fov / 2)
    };
  }

  // 基底を計算済みなら使い回す版。多数の点を投影するとき cameraBasis の再計算を避ける。
  function cameraViewWithBasis(camera, basis, point, viewport) {
    var rel = sub(point, basis.eye);
    var z = dot(rel, basis.forward);
    var aspect = viewport && viewport.height > 0 ? viewport.width / viewport.height : 1;
    if (!(z > camera.near)) return null;
    var x = dot(rel, basis.right);
    var y = dot(rel, basis.up);
    var ndcX = x / (z * basis.tanHalfFov * aspect);
    var ndcY = y / (z * basis.tanHalfFov);
    return {
      x: (ndcX * 0.5 + 0.5) * viewport.width,
      y: (0.5 - ndcY * 0.5) * viewport.height,
      z: z,
      ndcX: ndcX,
      ndcY: ndcY,
      scale: viewport.height / (2 * basis.tanHalfFov * z),
      onScreen: Math.abs(ndcX) <= 1.08 && Math.abs(ndcY) <= 1.08
    };
  }

  function cameraView(camera, point, viewport) {
    return cameraViewWithBasis(camera, cameraBasis(camera), point, viewport);
  }

  function projectPoints(camera, points, viewport) {
    var basis = cameraBasis(camera);
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var projected = cameraViewWithBasis(camera, basis, p, viewport);
      out.push({ index: i, source: p, projected: projected });
    }
    return out;
  }

  function orbitCamera(camera, dxPx, dyPx, sensitivityDeg) {
    var sens = sensitivityDeg == null ? 0.32 : sensitivityDeg;
    var next = cloneCamera(camera);
    next.azimuth = normalizeAngle(next.azimuth - dxPx * sens * DEG);
    next.elevation = clamp(
      next.elevation - dyPx * sens * DEG,
      toRad(MIN_ELEVATION),
      toRad(MAX_ELEVATION)
    );
    return next;
  }

  function zoomCamera(camera, factor) {
    var next = cloneCamera(camera);
    next.distance = clamp(next.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    return next;
  }

  // ターゲット平面の 1px あたりの world 量。
  function worldPerPixel(camera, viewport) {
    var basis = cameraBasis(camera);
    return (2 * basis.tanHalfFov * camera.distance) / viewport.height;
  }

  // ドラッグした方向に「地図が付いてくる」パン。
  function panCamera(camera, dxPx, dyPx, viewport) {
    var basis = cameraBasis(camera);
    var perPx = worldPerPixel(camera, viewport);
    var next = cloneCamera(camera);
    next.target = add(
      next.target,
      add(mul(basis.right, -dxPx * perPx), mul(basis.up, dyPx * perPx))
    );
    return next;
  }

  // 投影済みの点をまとめて画面内へ収めるホームカメラ。
  function fitCamera(points, viewport, options) {
    options = options || {};
    var fov = options.fov == null ? DEFAULT_FOV : options.fov;
    var margin = options.margin == null ? 1.14 : options.margin;
    var azimuth = options.azimuth == null ? -35 : options.azimuth;
    var elevation = options.elevation == null ? 22 : options.elevation;
    if (!points || !points.length) {
      return createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 100, fov: fov, azimuth: azimuth, elevation: elevation });
    }
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }
    var target = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
    var radius = 0;
    for (var j = 0; j < points.length; j++) {
      var d = distance(points[j], target);
      if (d > radius) radius = d;
    }
    radius = Math.max(radius, 1);
    var vertical = viewport.height / viewport.width;
    var effective = fov;
    if (vertical > 1) {
      // 縦長画面では水平方向が厳しくなるので、実効 fov を少し広げる。
      effective = toDeg(2 * Math.atan(Math.tan(toRad(fov) / 2) / vertical));
    }
    var fit = radius / Math.sin(toRad(effective) / 2) * margin;
    return createCamera({
      target: target,
      distance: clamp(fit, MIN_DISTANCE, MAX_DISTANCE),
      fov: fov,
      azimuth: azimuth,
      elevation: elevation
    });
  }

  function focusCamera(camera, point, radius) {
    var next = cloneCamera(camera);
    next.target = { x: point.x, y: point.y, z: point.z };
    var r = radius == null ? 14 : radius;
    var fit = r / Math.sin(camera.fov / 2) * 1.35;
    next.distance = clamp(fit, MIN_DISTANCE, MAX_DISTANCE);
    return next;
  }

  // 画面に正対したカード矩形。常に軸平行・幅高さ正・ミラーなし。
  function cardQuad(screen, width, height) {
    var w = Math.max(1, width);
    var h = Math.max(1, height);
    var hw = w / 2;
    var hh = h / 2;
    return {
      x: screen.x - hw,
      y: screen.y - hh,
      width: w,
      height: h,
      corners: [
        { x: screen.x - hw, y: screen.y - hh },
        { x: screen.x + hw, y: screen.y - hh },
        { x: screen.x + hw, y: screen.y + hh },
        { x: screen.x - hw, y: screen.y + hh }
      ]
    };
  }

  function quadArea(quad) {
    var c = quad.corners;
    var sum = 0;
    for (var i = 0; i < c.length; i++) {
      var a = c[i];
      var b = c[(i + 1) % c.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }

  function isFrontFacing(camera, point, viewport) {
    var p = cameraView(camera, point, viewport);
    return !!(p && p.z > camera.near);
  }

  function sortByDepth(entries, getZ) {
    var out = entries.slice();
    out.sort(function (a, b) { return getZ(b) - getZ(a); }); // 遠い順
    return out;
  }

  // ---------------- 画面の「使える矩形」と自動センタリング ----------------
  //
  // 選択物質を「詳細パネルに隠れない実表示領域」の中心へ置く。
  // パネル類（ヘッダ・ツールバー・詳細）を除いた最大の矩形を求め、
  // その中心へ投影が来るよう camera.target を画面空間で平行移動する。
  // 距離（ズーム）は変えない。

  function rectIntersection(a, b) {
    var x = Math.max(a.x, b.x);
    var y = Math.max(a.y, b.y);
    var x2 = Math.min(a.x + a.width, b.x + b.width);
    var y2 = Math.min(a.y + a.height, b.y + b.height);
    if (x2 <= x || y2 <= y) return null;
    return { x: x, y: y, width: x2 - x, height: y2 - y };
  }

  function subtractRect(rect, cut) {
    var hit = rectIntersection(rect, cut);
    if (!hit) return [rect];
    var out = [];
    if (hit.x > rect.x) {
      out.push({ x: rect.x, y: rect.y, width: hit.x - rect.x, height: rect.height });
    }
    if (hit.x + hit.width < rect.x + rect.width) {
      out.push({ x: hit.x + hit.width, y: rect.y, width: rect.x + rect.width - hit.x - hit.width, height: rect.height });
    }
    if (hit.y > rect.y) {
      out.push({ x: hit.x, y: rect.y, width: hit.width, height: hit.y - rect.y });
    }
    if (hit.y + hit.height < rect.y + rect.height) {
      out.push({ x: hit.x, y: hit.y + hit.height, width: hit.width, height: rect.y + rect.height - hit.y - hit.height });
    }
    return out;
  }

  // panels: { header, toolbar, detail } の矩形（canvas 座標）または null。
  // パネルの辺で区切ったセル格子を作り、空セルだけで作れる最大矩形を返す。
  // これで「ツールバーの上・詳細の左」のような横断した空き領域も 1 つの矩形として扱える。
  function computeUsableViewport(viewport, panels) {
    var full = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    var rects = [];
    var keys = ['header', 'toolbar', 'detail'];
    for (var k = 0; k < keys.length; k++) {
      var cut = panels && panels[keys[k]];
      if (!cut || !(cut.width > 0) || !(cut.height > 0)) continue;
      rects.push({
        x: Math.max(0, cut.x),
        y: Math.max(0, cut.y),
        width: Math.min(cut.width, viewport.width - Math.max(0, cut.x)),
        height: Math.min(cut.height, viewport.height - Math.max(0, cut.y))
      });
    }
    if (!rects.length) return full;

    var xs = [0, viewport.width];
    var ys = [0, viewport.height];
    function addUnique(list, value) {
      if (value <= 0 || value >= (list === xs ? viewport.width : viewport.height)) return;
      if (list.indexOf(value) === -1) list.push(value);
    }
    rects.forEach(function (rect) {
      addUnique(xs, rect.x);
      addUnique(xs, rect.x + rect.width);
      addUnique(ys, rect.y);
      addUnique(ys, rect.y + rect.height);
    });
    xs.sort(function (a, b) { return a - b; });
    ys.sort(function (a, b) { return a - b; });

    var cols = xs.length - 1;
    var rows = ys.length - 1;
    var free = [];
    for (var r = 0; r < rows; r++) {
      free.push([]);
      for (var c = 0; c < cols; c++) {
        var cx = (xs[c] + xs[c + 1]) / 2;
        var cy = (ys[r] + ys[r + 1]) / 2;
        var blocked = false;
        for (var ri = 0; ri < rects.length; ri++) {
          var cutRect = rects[ri];
          if (cx > cutRect.x && cx < cutRect.x + cutRect.width &&
            cy > cutRect.y && cy < cutRect.y + cutRect.height) {
            blocked = true;
            break;
          }
        }
        free[r][c] = !blocked;
      }
    }

    // 最大矩形（ヒストグラム法）。空セルだけを対象にする。
    var best = null;
    var bestArea = 0;
    var heights = new Array(cols).fill(0);
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        heights[col] = free[row][col] ? heights[col] + (ys[row + 1] - ys[row]) : 0;
      }
      var stack = [];
      for (var i = 0; i <= cols; i++) {
        var h = i < cols ? heights[i] : 0;
        while (stack.length && heights[stack[stack.length - 1]] > h) {
          var top = stack.pop();
          var rectHeight = heights[top];
          var left = stack.length ? stack[stack.length - 1] + 1 : 0;
          var rectWidth = xs[i] - xs[left];
          var area = rectHeight * rectWidth;
          if (area > bestArea) {
            bestArea = area;
            best = { x: xs[left], y: ys[row + 1] - rectHeight, width: rectWidth, height: rectHeight };
          }
        }
        if (i < cols) {
          if (stack.length && heights[stack[stack.length - 1]] === h) continue;
          stack.push(i);
        }
      }
    }
    return bestArea > 0 ? best : full;
  }

  // 投影が rect の中心に来るよう target を平行移動する（距離・角度は不変）。
  function centerCameraOnPoint(camera, point, viewport, rect) {
    var basis = cameraBasis(camera);
    var rel = sub(point, basis.eye);
    var z = dot(rel, basis.forward);
    if (!(z > camera.near)) return cloneCamera(camera);
    var aspect = viewport && viewport.height > 0 ? viewport.width / viewport.height : 1;
    var cx = rect.x + rect.width / 2;
    var cy = rect.y + rect.height / 2;
    var ndcX = (cx / viewport.width) * 2 - 1;
    var ndcY = 1 - (cy / viewport.height) * 2;
    var wantX = ndcX * z * basis.tanHalfFov * aspect;
    var wantY = ndcY * z * basis.tanHalfFov;
    var dx = dot(rel, basis.right) - wantX;
    var dy = dot(rel, basis.up) - wantY;
    var next = cloneCamera(camera);
    next.target = add(
      camera.target,
      add(mul(basis.right, dx), mul(basis.up, dy))
    );
    return next;
  }

  // 投影が rect の中心から tolerance px 以内にあるか。
  function isPointCentered(camera, point, viewport, rect, tolerance) {
    var tol = tolerance == null ? 24 : tolerance;
    var projected = cameraView(camera, point, viewport);
    if (!projected) return false;
    var cx = rect.x + rect.width / 2;
    var cy = rect.y + rect.height / 2;
    var dx = projected.x - cx;
    var dy = projected.y - cy;
    return dx * dx + dy * dy <= tol * tol;
  }

  // 指定した world 点を軸にしたカメラ。target をその点へ置く（投影は画面中央）。
  function cameraAroundPoint(camera, point) {
    var base = cloneCamera(camera);
    base.target = { x: point.x, y: point.y, z: point.z };
    return base;
  }

  // フォーカス固定: 点を usableRect の中心に保ったままオービットする。
  function orbitCameraAroundPoint(camera, point, dxPx, dyPx, viewport, rect) {
    var base = cameraAroundPoint(camera, point);
    var rotated = orbitCamera(base, dxPx, dyPx);
    return centerCameraOnPoint(rotated, point, viewport, rect);
  }

  // フォーカス固定: 点を usableRect の中心に保ったままズームする。
  function zoomCameraAroundPoint(camera, point, factor, viewport, rect) {
    var base = cameraAroundPoint(camera, point);
    var zoomed = zoomCamera(base, factor);
    return centerCameraOnPoint(zoomed, point, viewport, rect);
  }

  // 画面座標の下にある「ターゲット平面」（カメラから distance の平面）の world 点。
  // ホバー対象のカードがないときのズームアンカーに使う。
  function screenToWorldOnTargetPlane(camera, screenX, screenY, viewport) {
    var basis = cameraBasis(camera);
    var aspect = viewport && viewport.height > 0 ? viewport.width / viewport.height : 1;
    var ndcX = (screenX / viewport.width) * 2 - 1;
    var ndcY = 1 - (screenY / viewport.height) * 2;
    var z = camera.distance;
    return add(
      basis.eye,
      add(
        mul(basis.forward, z),
        add(
          mul(basis.right, ndcX * z * basis.tanHalfFov * aspect),
          mul(basis.up, ndcY * z * basis.tanHalfFov)
        )
      )
    );
  }

  // カーソル下の world アンカーを保ったままズームする。
  // 距離だけ変えた後、アンカーが画面上の同じ座標へ来るよう target を平行移動する
  // （回転・ズーム量の追加・選択はしない）。
  function zoomCameraAt(camera, factor, anchor, screenX, screenY, viewport) {
    var next = zoomCamera(camera, factor);
    return centerCameraOnPoint(next, anchor, viewport, {
      x: screenX,
      y: screenY,
      width: 0,
      height: 0
    });
  }

  function zoomCameraAtScreen(camera, factor, screenX, screenY, viewport, anchor) {
    var point = anchor || screenToWorldOnTargetPlane(camera, screenX, screenY, viewport);
    return zoomCameraAt(camera, factor, point, screenX, screenY, viewport);
  }

  // ---------------- 起動時の最大ズーム ----------------

  function nearestPointTo(points, center) {
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var dx = p.x - center.x;
      var dy = p.y - center.y;
      var dz = p.z - center.z;
      var d = dx * dx + dy * dy + dz * dz;
      if (d < bestDistance) {
        bestDistance = d;
        best = p;
      }
    }
    return best;
  }

  // 起動用: 対応する最小距離（最大ズーム）で、地図中心付近にカードがあるかを確認する。
  // 中心付近に何も無ければ、中心に最も近い実在の物質を透明なアンカーにする
  // （選択はしない。距離は絶対に下げない）。
  function startupCamera(points, center, viewport, rect, options) {
    options = options || {};
    var azimuth = options.azimuth == null ? -35 : options.azimuth;
    var elevation = options.elevation == null ? 22 : options.elevation;
    var fov = options.fov == null ? 52 : options.fov;
    var base = centerCameraOnPoint(createCamera({
      target: center,
      distance: MIN_DISTANCE,
      azimuth: azimuth,
      elevation: elevation,
      fov: fov
    }), center, viewport, rect);
    var cx = rect.x + rect.width / 2;
    var cy = rect.y + rect.height / 2;
    var threshold = Math.min(rect.width, rect.height) * (options.centerRatio == null ? 0.28 : options.centerRatio);
    var hasCardNearCenter = false;
    for (var i = 0; i < points.length; i++) {
      var projected = cameraView(base, points[i], viewport);
      if (!projected) continue;
      var dx = projected.x - cx;
      var dy = projected.y - cy;
      if (dx * dx + dy * dy <= threshold * threshold) {
        hasCardNearCenter = true;
        break;
      }
    }
    var anchor = center;
    var anchorId = null;
    if (!hasCardNearCenter) {
      var nearest = nearestPointTo(points, center);
      if (nearest) {
        anchor = { x: nearest.x, y: nearest.y, z: nearest.z };
        anchorId = nearest.id || null;
      }
    }
    var camera = createCamera({
      target: anchor,
      distance: MIN_DISTANCE,
      azimuth: azimuth,
      elevation: elevation,
      fov: fov
    });
    camera = centerCameraOnPoint(camera, anchor, viewport, rect);
    return {
      camera: camera,
      anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
      anchorId: anchorId,
      exactCenter: anchor === center,
      distance: MIN_DISTANCE,
      distanceChanged: false
    };
  }

  // ---------------- カメラ遷移（プレビュー + イージング） ----------------

  function easeInOutCubic(t) {
    var v = clamp(t, 0, 1);
    return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
  }

  // 表示フェーズ。プレビュー中は 'preview'、移動中は 'travel'、着地後は null。
  // 画面側はこの値だけで「分離表示をまだ出さない」判定をする（タイマーは使わない）。
  function transitionPhase(elapsedMs, previewMs, durationMs) {
    var preview = Math.max(0, previewMs || 0);
    var duration = Math.max(1, durationMs || 1);
    if (elapsedMs < preview) return 'preview';
    if (elapsedMs >= preview + duration) return null;
    return 'travel';
  }

  // 0..previewMs は 0（前のポーズのまま）、その後 durationMs で 0→1。
  function transitionProgress(elapsedMs, previewMs, durationMs) {
    var preview = Math.max(0, previewMs || 0);
    var duration = Math.max(1, durationMs || 1);
    if (elapsedMs <= preview) return 0;
    return easeInOutCubic((elapsedMs - preview) / duration);
  }

  // 着地後の減光（0→1）。カメラ移動が終わった時点を 0 とし、fadeMs で 1 へ。
  // 線形で十分（無関係の物質・経路の alpha をこの値から 1-値 で落とす）。
  function transitionFade(elapsedMs, fadeMs) {
    var duration = Math.max(1, fadeMs || 1);
    return clamp(elapsedMs / duration, 0, 1);
  }

  function interpolateCamera(from, to, t) {
    var k = clamp(t, 0, 1);
    var next = cloneCamera(from);
    next.target = {
      x: from.target.x + (to.target.x - from.target.x) * k,
      y: from.target.y + (to.target.y - from.target.y) * k,
      z: from.target.z + (to.target.z - from.target.z) * k
    };
    // 距離は正のまま対数スケールで補間する（ズームの見え方が自然）。
    if (from.distance > 0 && to.distance > 0) {
      next.distance = Math.exp(
        Math.log(from.distance) + (Math.log(to.distance) - Math.log(from.distance)) * k
      );
    } else {
      next.distance = from.distance + (to.distance - from.distance) * k;
    }
    next.distance = clamp(next.distance, MIN_DISTANCE, MAX_DISTANCE);
    next.elevation = clamp(
      from.elevation + (to.elevation - from.elevation) * k,
      toRad(MIN_ELEVATION),
      toRad(MAX_ELEVATION)
    );
    next.fov = from.fov + (to.fov - from.fov) * k;
    var deltaAzimuth = normalizeAngle(to.azimuth - from.azimuth);
    next.azimuth = normalizeAngle(from.azimuth + deltaAzimuth * k);
    return next;
  }

  // Liang–Barsky。rect の外に出た線分を切り詰める。交差しなければ null。
  function clipSegment(x1, y1, x2, y2, rect) {
    var t0 = 0;
    var t1 = 1;
    var dx = x2 - x1;
    var dy = y2 - y1;
    function edge(p, q) {
      if (p === 0) return q >= 0;
      var r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }
    if (!edge(-dx, x1 - rect.x)) return null;
    if (!edge(dx, rect.x + rect.width - x1)) return null;
    if (!edge(-dy, y1 - rect.y)) return null;
    if (!edge(dy, rect.y + rect.height - y1)) return null;
    return {
      x1: x1 + t0 * dx,
      y1: y1 + t0 * dy,
      x2: x1 + t1 * dx,
      y2: y1 + t1 * dy
    };
  }

  return {
    DEG: DEG,
    WORLD_UP: WORLD_UP,
    MIN_ELEVATION: MIN_ELEVATION,
    MAX_ELEVATION: MAX_ELEVATION,
    MIN_DISTANCE: MIN_DISTANCE,
    MAX_DISTANCE: MAX_DISTANCE,
    clamp: clamp,
    toRad: toRad,
    toDeg: toDeg,
    add: add,
    sub: sub,
    mul: mul,
    dot: dot,
    cross: cross,
    length: length,
    normalize: normalize,
    distance: distance,
    createCamera: createCamera,
    cloneCamera: cloneCamera,
    cameraBasis: cameraBasis,
    cameraView: cameraView,
    cameraViewWithBasis: cameraViewWithBasis,
    projectPoints: projectPoints,
    orbitCamera: orbitCamera,
    zoomCamera: zoomCamera,
    worldPerPixel: worldPerPixel,
    panCamera: panCamera,
    fitCamera: fitCamera,
    focusCamera: focusCamera,
    cardQuad: cardQuad,
    quadArea: quadArea,
    isFrontFacing: isFrontFacing,
    sortByDepth: sortByDepth,
    rectIntersection: rectIntersection,
    subtractRect: subtractRect,
    computeUsableViewport: computeUsableViewport,
    centerCameraOnPoint: centerCameraOnPoint,
    isPointCentered: isPointCentered,
    nearestPointTo: nearestPointTo,
    startupCamera: startupCamera,
    cameraAroundPoint: cameraAroundPoint,
    orbitCameraAroundPoint: orbitCameraAroundPoint,
    zoomCameraAroundPoint: zoomCameraAroundPoint,
    screenToWorldOnTargetPlane: screenToWorldOnTargetPlane,
    zoomCameraAt: zoomCameraAt,
    zoomCameraAtScreen: zoomCameraAtScreen,
    easeInOutCubic: easeInOutCubic,
    transitionPhase: transitionPhase,
    transitionProgress: transitionProgress,
    transitionFade: transitionFade,
    interpolateCamera: interpolateCamera,
    clipSegment: clipSegment
  };
});
