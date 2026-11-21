/*
 * app11/3d 球ビュー — 球面の分野テリトリー（純関数・DOM なし）
 *
 * 何をするか:
 *   - 427 個の固定スロット（sphere-layout.js の Fibonacci 球）を母点とする
 *     球面ボロノイ分割を、測地メッシュ（icosphere）上の最近傍割当で近似する。
 *   - 各メッシュ頂点を「最も近いスロット」に割り当て、スロットの分野
 *     （regionIndex）へ写す。面の所属は、3 頂点が同分野ならその分野、
 *     またがる面は面重心の最近傍で決める（境界の塗りは 1 面ぶんだけ粗い）。
 *   - 分野が変わるメッシュ辺の中点を結び、境界線分を作る。したがって
 *     境界は必ず「異なる分野どうし」の間にだけできる。
 *   - 面上の可視部分（球の外では手前半球、球の中では視線の前）だけを
 *     スクリーン座標の三角形に落とし、描画用のフレームを作る。
 *
 * 近似と限界（README にも記載）:
 *   - ボロノイ境界はメッシュ解像度（初期値 subdivision=5、面 20480）で
 *     折れ線近似する。境界線分の位置は辺中点で、真の等距離点ではない。
 *   - 球の外の可視判定は面重心の前後で行い、シルエットは投影した円で
 *     Canvas 側がクリップする。円の縁の 1 面ぶんは前後どちらにも寄る。
 *   - 球の中では、near 面をまたぐ三角形だけカメラ空間で近平面クリップする。
 *     視野の外はスクリーン矩形で落とす。
 *   - 形状は乱数を使わず、同じ layout からは常に同じ結果になる。
 *
 * Node では require、ブラウザでは window.RP3DSphereTerritory。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sphere-camera.js')(require('./projection.js')));
  } else {
    root.RP3DSphereTerritory = factory(root.RP3DProjection);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  var DEFAULT_SUBDIVISION = 5;
  var MAX_SUBDIVISION = 6;
  var MIN_SUBDIVISION = 1;
  var GOLDEN = (1 + Math.sqrt(5)) / 2;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function normalize3(x, y, z) {
    var len = Math.sqrt(x * x + y * y + z * z);
    if (!(len > 1e-12)) return null;
    return { x: x / len, y: y / len, z: z / len };
  }

  // ---------------- 測地メッシュ（icosphere） ----------------

  // 20 面体。頂点は正規化して単位球へ。
  function baseIcosahedron() {
    var raw = [
      [-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0],
      [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN],
      [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1]
    ];
    var vertices = raw.map(function (v) {
      var n = normalize3(v[0], v[1], v[2]);
      return { x: n.x, y: n.y, z: n.z };
    });
    var faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    return { vertices: vertices, faces: faces };
  }

  // 各面を 4 分割する。中点は辺キーで共有し、頂点配列の順序は決定的。
  function subdivideIcosahedron(level) {
    var mesh = baseIcosahedron();
    var vertices = mesh.vertices;
    var faces = mesh.faces;
    for (var l = 0; l < level; l++) {
      var midCache = Object.create(null);
      var nextFaces = [];
      for (var fi = 0; fi < faces.length; fi++) {
        var a = faces[fi][0];
        var b = faces[fi][1];
        var c = faces[fi][2];
        var ab = midpointIndex(vertices, a, b, midCache);
        var bc = midpointIndex(vertices, b, c, midCache);
        var ca = midpointIndex(vertices, c, a, midCache);
        nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = nextFaces;
    }
    return { vertices: vertices, faces: faces };
  }

  function midpointIndex(vertices, a, b, cache) {
    var key = a < b ? a + ',' + b : b + ',' + a;
    var cached = cache[key];
    if (cached !== undefined) return cached;
    var va = vertices[a];
    var vb = vertices[b];
    var n = normalize3(va.x + vb.x, va.y + vb.y, va.z + vb.z);
    var index = vertices.length;
    vertices.push({ x: n.x, y: n.y, z: n.z });
    cache[key] = index;
    return index;
  }

  // ---------------- スロット → 分野 ----------------

  function slotData(layout) {
    if (!layout || !Array.isArray(layout.slots) || !layout.slots.length) {
      throw new TypeError('RP3DSphereTerritory: layout.slots が必要');
    }
    if (!layout.assignment || layout.assignment.length !== layout.slots.length) {
      throw new TypeError('RP3DSphereTerritory: layout.assignment がスロット数と一致しない');
    }
    var count = layout.slots.length;
    var dirs = new Float64Array(count * 3);
    var slotRegion = new Int32Array(count);
    for (var i = 0; i < count; i++) {
      var slot = layout.slots[i];
      var dir = slot.dir || normalize3(slot.x, slot.y, slot.z);
      if (!dir) throw new TypeError('RP3DSphereTerritory: slot ' + i + ' の向きが不正');
      dirs[i * 3] = dir.x;
      dirs[i * 3 + 1] = dir.y;
      dirs[i * 3 + 2] = dir.z;
      slotRegion[i] = Number(layout.assignment[i]);
    }
    return { count: count, dirs: dirs, slotRegion: slotRegion };
  }

  // 最近傍スロット。同距離はスロット番号の小さい方（決定的）。
  function nearestSlot(x, y, z, slots, out) {
    var dirs = slots.dirs;
    var best = -1;
    var bestDot = -2;
    for (var i = 0; i < slots.count; i++) {
      var d = x * dirs[i * 3] + y * dirs[i * 3 + 1] + z * dirs[i * 3 + 2];
      if (best < 0 || d > bestDot + 1e-12 ||
        (Math.abs(d - bestDot) <= 1e-12 && i < best)) {
        bestDot = d;
        best = i;
      }
    }
    if (out) {
      out.slot = best;
      out.region = slots.slotRegion[best];
      out.dot = bestDot;
    }
    return best;
  }

  function regionIndexMap(layout) {
    var map = Object.create(null);
    var list = layout.list || [];
    for (var i = 0; i < list.length; i++) {
      var point = list[i];
      if (!point || point.regionIndex == null) continue;
      map[point.regionIndex] = point.region;
    }
    return map;
  }

  // メッシュ頂点・面に分野を割り当て、境界線分を抽出する。
  function buildGeometry(layout, options) {
    options = options || {};
    var subdivision = clamp(
      options.subdivision == null ? DEFAULT_SUBDIVISION : Math.round(options.subdivision),
      MIN_SUBDIVISION,
      MAX_SUBDIVISION
    );
    if (!(layout.radius > 0)) throw new TypeError('RP3DSphereTerritory: layout.radius が正でない');

    var slots = slotData(layout);
    var mesh = subdivideIcosahedron(subdivision);
    var vertexCount = mesh.vertices.length;
    var faceCount = mesh.faces.length;
    var vertexDirs = new Float64Array(vertexCount * 3);
    var vertexRegion = new Int32Array(vertexCount);
    var nearest = { slot: -1, region: 0, dot: 0 };
    var vertexNearestSlot = new Int32Array(vertexCount);
    var i;
    for (i = 0; i < vertexCount; i++) {
      var v = mesh.vertices[i];
      vertexDirs[i * 3] = v.x;
      vertexDirs[i * 3 + 1] = v.y;
      vertexDirs[i * 3 + 2] = v.z;
      nearestSlot(v.x, v.y, v.z, slots, nearest);
      vertexNearestSlot[i] = nearest.slot;
      vertexRegion[i] = nearest.region;
    }

    var faceVertices = new Int32Array(faceCount * 3);
    var faceRegion = new Int32Array(faceCount);
    var faceDir = new Float32Array(faceCount * 3);
    var regionFaceCounts = Object.create(null);
    for (i = 0; i < faceCount; i++) {
      var a = mesh.faces[i][0];
      var b = mesh.faces[i][1];
      var c = mesh.faces[i][2];
      faceVertices[i * 3] = a;
      faceVertices[i * 3 + 1] = b;
      faceVertices[i * 3 + 2] = c;
      var sx = vertexDirs[a * 3] + vertexDirs[b * 3] + vertexDirs[c * 3];
      var sy = vertexDirs[a * 3 + 1] + vertexDirs[b * 3 + 1] + vertexDirs[c * 3 + 1];
      var sz = vertexDirs[a * 3 + 2] + vertexDirs[b * 3 + 2] + vertexDirs[c * 3 + 2];
      faceDir[i * 3] = sx / 3;
      faceDir[i * 3 + 1] = sy / 3;
      faceDir[i * 3 + 2] = sz / 3;
      var ra = vertexRegion[a];
      var rb = vertexRegion[b];
      var rc = vertexRegion[c];
      var region;
      if (ra === rb && rb === rc) {
        region = ra;
      } else {
        var n = normalize3(sx, sy, sz);
        if (!n) {
          region = ra;
        } else {
          nearestSlot(n.x, n.y, n.z, slots, nearest);
          region = nearest.region;
        }
      }
      faceRegion[i] = region;
      regionFaceCounts[region] = (regionFaceCounts[region] || 0) + 1;
    }

    // ---------------- 境界（分野が変わる辺の中点を結ぶ） ----------------
    var radius = layout.radius;
    var boundaries = [];
    var pairCounts = Object.create(null);
    function pushBoundary(p0, p1, regionA, regionB) {
      if (regionA === regionB) return;
      var mx = (p0.x + p1.x) / 2;
      var my = (p0.y + p1.y) / 2;
      var mz = (p0.z + p1.z) / 2;
      var m = normalize3(mx, my, mz);
      if (!m) return;
      var lo = Math.min(regionA, regionB);
      var hi = Math.max(regionA, regionB);
      pairCounts[lo + '|' + hi] = (pairCounts[lo + '|' + hi] || 0) + 1;
      boundaries.push({
        ax: p0.x * radius,
        ay: p0.y * radius,
        az: p0.z * radius,
        bx: p1.x * radius,
        by: p1.y * radius,
        bz: p1.z * radius,
        mx: m.x,
        my: m.y,
        mz: m.z,
        regionA: regionA,
        regionB: regionB
      });
    }
    function crossing(u, w) {
      var x = (vertexDirs[u * 3] + vertexDirs[w * 3]) / 2;
      var y = (vertexDirs[u * 3 + 1] + vertexDirs[w * 3 + 1]) / 2;
      var z = (vertexDirs[u * 3 + 2] + vertexDirs[w * 3 + 2]) / 2;
      var n = normalize3(x, y, z);
      return n || { x: vertexDirs[u * 3], y: vertexDirs[u * 3 + 1], z: vertexDirs[u * 3 + 2] };
    }
    for (i = 0; i < faceCount; i++) {
      var v0 = faceVertices[i * 3];
      var v1 = faceVertices[i * 3 + 1];
      var v2 = faceVertices[i * 3 + 2];
      var r0 = vertexRegion[v0];
      var r1 = vertexRegion[v1];
      var r2 = vertexRegion[v2];
      if (r0 === r1 && r1 === r2) continue;
      var points = [];
      if (r0 !== r1) points.push({ p: crossing(v0, v1), a: r0, b: r1 });
      if (r1 !== r2) points.push({ p: crossing(v1, v2), a: r1, b: r2 });
      if (r2 !== r0) points.push({ p: crossing(v2, v0), a: r2, b: r0 });
      if (points.length === 2) {
        pushBoundary(points[0].p, points[1].p, points[0].a, points[0].b);
      } else if (points.length === 3) {
        // 3 分野が 1 面で出会う稀な点。境界は 3 本の短い線分で近似する。
        pushBoundary(points[0].p, points[1].p, points[0].a, points[0].b);
        pushBoundary(points[1].p, points[2].p, points[1].a, points[1].b);
        pushBoundary(points[2].p, points[0].p, points[2].a, points[2].b);
      }
    }

    var regionIds = regionIndexMap(layout);
    var regionIndexes = Object.keys(regionFaceCounts).map(Number).sort(function (a, b) { return a - b; });
    var slotCounts = Object.create(null);
    for (i = 0; i < slots.count; i++) {
      slotCounts[slots.slotRegion[i]] = (slotCounts[slots.slotRegion[i]] || 0) + 1;
    }
    var regionStats = Object.create(null);
    var areaTotal = 0;
    regionIndexes.forEach(function (key) {
      areaTotal += regionFaceCounts[key] || 0;
    });
    regionIndexes.forEach(function (key) {
      regionStats[key] = {
        id: regionIds[key] || null,
        faces: regionFaceCounts[key] || 0,
        slots: slotCounts[key] || 0,
        areaRatio: areaTotal ? (regionFaceCounts[key] || 0) / areaTotal : 0,
        slotRatio: slots.count ? (slotCounts[key] || 0) / slots.count : 0
      };
    });

    var pairs = Object.keys(pairCounts).map(function (key) {
      var parts = key.split('|').map(Number);
      return { a: parts[0], b: parts[1], count: pairCounts[key] };
    }).sort(function (x, y) {
      return x.a - y.a || x.b - y.b;
    });

    return {
      version: 1,
      kind: 'sphere-territory',
      radius: radius,
      center: layout.center || { x: 0, y: 0, z: 0 },
      subdivision: subdivision,
      vertexCount: vertexCount,
      faceCount: faceCount,
      // 単位方向（頂点）と分野。面は 3 頂点 index。
      vertexDirs: vertexDirs,
      vertexRegion: vertexRegion,
      vertexNearestSlot: vertexNearestSlot,
      faces: faceVertices,
      faceRegion: faceRegion,
      faceDir: faceDir,
      boundaries: boundaries,
      pairs: pairs,
      regionIds: regionIds,
      regionIndexes: regionIndexes,
      regionStats: regionStats,
      slotCount: slots.count,
      slotDirs: slots.dirs,
      slotRegion: slots.slotRegion,
      stats: {
        vertices: vertexCount,
        faces: faceCount,
        boundaries: boundaries.length,
        regions: regionIndexes.length,
        slots: slots.count
      }
    };
  }

  // 任意の球面方向が属する分野（テスト・検証用）。
  function regionAt(geometry, x, y, z) {
    var n = normalize3(x, y, z);
    if (!n) return -1;
    var slots = { dirs: geometry.slotDirs, count: geometry.slotCount, slotRegion: geometry.slotRegion };
    var nearest = { slot: -1, region: -1, dot: 0 };
    nearestSlot(n.x, n.y, n.z, slots, nearest);
    return nearest.region;
  }

  function nearestSlotAt(geometry, x, y, z) {
    var n = normalize3(x, y, z);
    if (!n) return -1;
    var slots = { dirs: geometry.slotDirs, count: geometry.slotCount, slotRegion: geometry.slotRegion };
    return nearestSlot(n.x, n.y, n.z, slots, null);
  }

  // ---------------- スクリーンフレーム（可視部分だけ） ----------------

  function rectsOverlapLocal(rect, minX, minY, maxX, maxY) {
    return !(maxX < rect.x || minX > rect.x + rect.width ||
      maxY < rect.y || minY > rect.y + rect.height);
  }

  function distancePointSegment2(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var qx = x1 + dx * t;
    var qy = y1 + dy * t;
    return (px - qx) * (px - qx) + (py - qy) * (py - qy);
  }

  // カメラ空間の点 → スクリーン。projection.cameraViewWithBasis と同じ式で、
  // 主点オフセット（screenOffset）も反映する。オブジェクト生成を避ける。
  function projectCameraSpace(camera, basis, viewport, cx, cy, cz, out) {
    if (!(cz > camera.near)) return false;
    var aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
    var ndcX = cx / (cz * basis.tanHalfFov * aspect);
    var ndcY = cy / (cz * basis.tanHalfFov);
    var offX = camera.screenOffset ? camera.screenOffset.x : 0;
    var offY = camera.screenOffset ? camera.screenOffset.y : 0;
    out.x = (ndcX * 0.5 + 0.5) * viewport.width + offX;
    out.y = (0.5 - ndcY * 0.5) * viewport.height + offY;
    out.z = cz;
    return true;
  }

  // 頂点のスクリーン座標は毎フレーム 1 回だけ計算し、面からは index で引く。
  // バッファは geometry ごとに使い回す（フレームごとの大きな確保をしない）。
  var scratchCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  var scratchFallback = null;
  function scratchFor(geometry) {
    var n = geometry.vertexCount;
    var scratch = scratchCache ? scratchCache.get(geometry) : scratchFallback;
    if (!scratch || scratch.n !== n) {
      scratch = {
        n: n,
        sx: new Float64Array(n),
        sy: new Float64Array(n),
        cx: new Float64Array(n),
        cy: new Float64Array(n),
        cz: new Float64Array(n),
        valid: new Uint8Array(n),
        // 面 1 枚ぶんの作業用（毎フレームの大量のオブジェクト生成を避ける）。
        poly: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]
      };
      if (scratchCache) scratchCache.set(geometry, scratch);
      else scratchFallback = scratch;
    }
    return scratch;
  }

  // カメラ空間の多角形を near 面でクリップする（Sutherland–Hodgman）。
  function clipNearPolygon(points, near) {
    if (!points.length) return [];
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      var aIn = a.z > near;
      var bIn = b.z > near;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        var t = (near - a.z) / (b.z - a.z);
        var z = near + 1e-6;
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: z
        });
      }
    }
    return out;
  }

  function buildFrame(geometry, camera, viewport, options) {
    options = options || {};
    if (!geometry || geometry.kind !== 'sphere-territory') {
      throw new TypeError('RP3DSphereTerritory: geometry が不正');
    }
    if (!camera || !viewport || !(viewport.width > 0) || !(viewport.height > 0)) {
      throw new TypeError('RP3DSphereTerritory: camera / viewport が必要');
    }
    var center = options.center || geometry.center || { x: 0, y: 0, z: 0 };
    var radius = geometry.radius;
    var basis = P.cameraBasis(camera);
    var inside = camera.mode === 'inside';
    var outward;
    if (inside) {
      outward = basis.forward;
    } else {
      var ex = basis.eye.x - center.x;
      var ey = basis.eye.y - center.y;
      var ez = basis.eye.z - center.z;
      var en = Math.sqrt(ex * ex + ey * ey + ez * ez);
      outward = en > 1e-9
        ? { x: ex / en, y: ey / en, z: ez / en }
        : { x: -basis.forward.x, y: -basis.forward.y, z: -basis.forward.z };
    }
    var threshold = options.threshold == null
      ? (inside ? 0.02 : 0.0)
      : Number(options.threshold);
    var margin = options.margin == null ? 24 : Math.max(0, Number(options.margin));
    var activeRegion = options.activeRegion == null ? null : Number(options.activeRegion);
    var clipRect = {
      x: -margin,
      y: -margin,
      width: viewport.width + margin * 2,
      height: viewport.height + margin * 2
    };

    // 球の外: シルエット（透視投影の円）を Canvas のクリップに使う。
    var disc = null;
    if (!inside) {
      var centerView = P.cameraViewWithBasis(camera, basis, center, viewport);
      var dxe = basis.eye.x - center.x;
      var dye = basis.eye.y - center.y;
      var dze = basis.eye.z - center.z;
      var eyeDistance = Math.sqrt(dxe * dxe + dye * dye + dze * dze);
      if (centerView && eyeDistance > radius + 1e-6) {
        var focal = viewport.height / (2 * basis.tanHalfFov);
        var rScreen = focal * radius / Math.sqrt(eyeDistance * eyeDistance - radius * radius);
        if (isFinite(rScreen) && rScreen > 0) {
          disc = { cx: centerView.x, cy: centerView.y, radius: rScreen };
        }
      }
    }

    var fillByRegion = Object.create(null);
    var fillOrder = [];
    var facesDrawn = 0;
    var backfaceSkipped = 0;
    var offscreenSkipped = 0;
    var nearClipped = 0;
    var degradedFaces = 0;

    var faces = geometry.faces;
    var faceDir = geometry.faceDir;
    var faceRegion = geometry.faceRegion;
    var vertexDirs = geometry.vertexDirs;
    var near = camera.near > 0 ? camera.near : 0.5;
    var scratch = scratchFor(geometry);
    var projectedPoint = { x: 0, y: 0, z: 0 };
    var vi;

    // 全頂点を 1 回だけカメラ空間・スクリーンへ落とす。
    for (vi = 0; vi < geometry.vertexCount; vi++) {
      var wx = vertexDirs[vi * 3] * radius + center.x;
      var wy = vertexDirs[vi * 3 + 1] * radius + center.y;
      var wz = vertexDirs[vi * 3 + 2] * radius + center.z;
      var rx = wx - basis.eye.x;
      var ry = wy - basis.eye.y;
      var rz = wz - basis.eye.z;
      var vcx = rx * basis.right.x + ry * basis.right.y + rz * basis.right.z;
      var vcy = rx * basis.up.x + ry * basis.up.y + rz * basis.up.z;
      var vcz = rx * basis.forward.x + ry * basis.forward.y + rz * basis.forward.z;
      scratch.cx[vi] = vcx;
      scratch.cy[vi] = vcy;
      scratch.cz[vi] = vcz;
      if (projectCameraSpace(camera, basis, viewport, vcx, vcy, vcz, projectedPoint)) {
        scratch.sx[vi] = projectedPoint.x;
        scratch.sy[vi] = projectedPoint.y;
        scratch.valid[vi] = 1;
      } else {
        scratch.valid[vi] = 0;
      }
    }

    function pushFill(region, points, count) {
      var list = fillByRegion[region];
      if (!list) {
        list = [];
        fillByRegion[region] = list;
        fillOrder.push(region);
      }
      // クリップ後の多角形は扇形分割して、常に三角形 3 点で持つ。
      for (var k = 1; k + 1 < count; k++) {
        list.push(points[0].x, points[0].y,
          points[k].x, points[k].y,
          points[k + 1].x, points[k + 1].y);
      }
    }

    for (var fi = 0; fi < geometry.faceCount; fi++) {
      var region = faceRegion[fi];
      if (activeRegion != null && region !== activeRegion) continue;
      var front = faceDir[fi * 3] * outward.x +
        faceDir[fi * 3 + 1] * outward.y +
        faceDir[fi * 3 + 2] * outward.z;
      if (front < threshold) {
        backfaceSkipped += 1;
        continue;
      }
      var f0 = faces[fi * 3];
      var f1 = faces[fi * 3 + 1];
      var f2 = faces[fi * 3 + 2];
      var polygon;
      var ok0 = scratch.valid[f0];
      var ok1 = scratch.valid[f1];
      var ok2 = scratch.valid[f2];
      if (ok0 && ok1 && ok2) {
        polygon = scratch.poly;
        polygon[0].x = scratch.sx[f0];
        polygon[0].y = scratch.sy[f0];
        polygon[1].x = scratch.sx[f1];
        polygon[1].y = scratch.sy[f1];
        polygon[2].x = scratch.sx[f2];
        polygon[2].y = scratch.sy[f2];
      } else if (inside && (ok0 || ok1 || ok2)) {
        // near 面をまたぐ三角形だけ、カメラ空間でクリップしてから投影する。
        var raw = [
          { x: scratch.cx[f0], y: scratch.cy[f0], z: scratch.cz[f0] },
          { x: scratch.cx[f1], y: scratch.cy[f1], z: scratch.cz[f1] },
          { x: scratch.cx[f2], y: scratch.cy[f2], z: scratch.cz[f2] }
        ];
        var clipped = clipNearPolygon(raw, near);
        nearClipped += 1;
        if (clipped.length < 3) {
          offscreenSkipped += 1;
          continue;
        }
        polygon = [];
        var projectedAll = true;
        for (var ci = 0; ci < clipped.length; ci++) {
          var clipPoint = clipped[ci];
          if (!projectCameraSpace(camera, basis, viewport,
            clipPoint.x, clipPoint.y, clipPoint.z, projectedPoint)) {
            projectedAll = false;
            break;
          }
          polygon.push({ x: projectedPoint.x, y: projectedPoint.y });
        }
        if (!projectedAll) { degradedFaces += 1; continue; }
      } else {
        offscreenSkipped += 1;
        continue;
      }
      var minX = Infinity;
      var minY = Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;
      for (var pi = 0; pi < polygon.length; pi++) {
        if (polygon[pi].x < minX) minX = polygon[pi].x;
        if (polygon[pi].y < minY) minY = polygon[pi].y;
        if (polygon[pi].x > maxX) maxX = polygon[pi].x;
        if (polygon[pi].y > maxY) maxY = polygon[pi].y;
      }
      if (!rectsOverlapLocal(clipRect, minX, minY, maxX, maxY)) {
        offscreenSkipped += 1;
        continue;
      }
      if (disc) {
        // 円の外側に完全にある三角形は落とす（円弧は Canvas クリップ）。
        var cx = disc.cx;
        var cy = disc.cy;
        var rr = (disc.radius + margin) * (disc.radius + margin);
        var insideCount = 0;
        for (var di = 0; di < polygon.length; di++) {
          var ddx = polygon[di].x - cx;
          var ddy = polygon[di].y - cy;
          if (ddx * ddx + ddy * ddy <= rr) insideCount += 1;
        }
        if (!insideCount) {
          // 辺が円を横切る場合だけ残す（中心からの最短距離で判定）。
          var crosses = false;
          for (var si = 0; si < polygon.length && !crosses; si++) {
            var s0 = polygon[si];
            var s1 = polygon[(si + 1) % polygon.length];
            if (distancePointSegment2(cx, cy, s0.x, s0.y, s1.x, s1.y) <= rr) crosses = true;
          }
          if (!crosses) {
            offscreenSkipped += 1;
            continue;
          }
        }
      }
      pushFill(region, polygon, polygon.length);
      facesDrawn += 1;
    }

    var fills = fillOrder.map(function (key) {
      return {
        region: key,
        regionId: geometry.regionIds[key] || null,
        points: fillByRegion[key]
      };
    });

    // ---------------- 境界線分 ----------------
    var borderByPair = Object.create(null);
    var borderOrder = [];
    var borderSegments = 0;
    var borderCulled = 0;
    var boundaries = geometry.boundaries;
    for (var bi = 0; bi < boundaries.length; bi++) {
      var seg = boundaries[bi];
      if (activeRegion != null && seg.regionA !== activeRegion && seg.regionB !== activeRegion) continue;
      var midFront = seg.mx * outward.x + seg.my * outward.y + seg.mz * outward.z;
      if (midFront < threshold) { borderCulled += 1; continue; }
      var pa = P.cameraViewWithBasis(camera, basis,
        { x: seg.ax + center.x, y: seg.ay + center.y, z: seg.az + center.z }, viewport);
      var pb = P.cameraViewWithBasis(camera, basis,
        { x: seg.bx + center.x, y: seg.by + center.y, z: seg.bz + center.z }, viewport);
      if (!pa || !pb) { borderCulled += 1; continue; }
      if (disc) {
        var rr2 = (disc.radius + margin) * (disc.radius + margin);
        if (distancePointSegment2(disc.cx, disc.cy, pa.x, pa.y, pb.x, pb.y) > rr2) {
          borderCulled += 1;
          continue;
        }
      }
      var clippedSeg = P.clipSegment(pa.x, pa.y, pb.x, pb.y, clipRect);
      if (!clippedSeg) { borderCulled += 1; continue; }
      var lo = Math.min(seg.regionA, seg.regionB);
      var hi = Math.max(seg.regionA, seg.regionB);
      var pairKey = lo + '|' + hi;
      var bucket = borderByPair[pairKey];
      if (!bucket) {
        bucket = {
          regionA: lo,
          regionB: hi,
          regionAId: geometry.regionIds[lo] || null,
          regionBId: geometry.regionIds[hi] || null,
          points: []
        };
        borderByPair[pairKey] = bucket;
        borderOrder.push(pairKey);
      }
      bucket.points.push(clippedSeg.x1, clippedSeg.y1, clippedSeg.x2, clippedSeg.y2);
      borderSegments += 1;
    }
    var borders = borderOrder.map(function (key) { return borderByPair[key]; });

    return {
      kind: 'sphere-territory-frame',
      mode: inside ? 'inside' : 'outside',
      activeRegion: activeRegion,
      dimmed: !!options.dimmed,
      disc: disc,
      fills: fills,
      borders: borders,
      stats: {
        facesTotal: geometry.faceCount,
        facesFront: facesDrawn + offscreenSkipped,
        facesDrawn: facesDrawn,
        backfaceSkipped: backfaceSkipped,
        offscreenSkipped: offscreenSkipped,
        nearClipped: nearClipped,
        degradedFaces: degradedFaces,
        triangles: fills.reduce(function (sum, item) { return sum + item.points.length / 6; }, 0),
        regions: fills.length,
        borders: borders.length,
        borderSegments: borderSegments,
        borderCulled: borderCulled
      }
    };
  }

  return {
    DEFAULT_SUBDIVISION: DEFAULT_SUBDIVISION,
    MAX_SUBDIVISION: MAX_SUBDIVISION,
    MIN_SUBDIVISION: MIN_SUBDIVISION,
    buildGeometry: buildGeometry,
    buildFrame: buildFrame,
    regionAt: regionAt,
    nearestSlotAt: nearestSlotAt,
    nearestSlot: nearestSlot,
    subdivideIcosahedron: subdivideIcosahedron,
    clipNearPolygon: clipNearPolygon
  };
});
