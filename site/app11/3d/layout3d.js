/*
 * app11-3d — 決定的な 3D 配置（純関数・DOM なし）
 *
 * 2D 版の宣言データ（site/app11/data.js）を出発点に、分野ごとの局所平面を
 * 決定的な向きへ傾け、反応グラフのばね + 近距離反発 + 分野アンカーで緩和する。
 * 乱数は使わない。同じ入力からは常に同じ座標になる。
 *
 * 重要:
 *   - 読むのは通常データ（compounds / reactions）だけ。
 *   - academic-data.js の x / y は一切使わない。大学層を再生成しても 3D 座標は変わらない。
 *   - 2D の XZ をそのまま押し出した「薄い板」にせず、Y・Z にも実体積を持たせる。
 *     ただし各分野の局所配置は回転・傾斜（剛体変換）で保ち、同じ分野は近くに残す。
 *   - 427 物質（未接続を含む）を落とさない。
 *
 * Node では require、ブラウザでは window.RP3DLayout。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DLayout = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_PER_PX = 0.022;      // 6052px の地図幅 → 約 133 world
  var REGION_BAND = 5.5;         // 分野ごとの高さの段（旧 2.8 から拡大）
  var JITTER_RANGE = 3.0;        // ID ハッシュによる微小な奥行き
  var TIER_Y = { primary: 1.2, secondary: 0.4, isolated: -0.8 };
  var DEGREE_Y = 0.2;
  var REGION_ROT = 3.0;          // 分野ごとの局所平面の回転（ラジアン上限）
  var REGION_TILT = 0.62;        // 分野ごとの局所平面の傾き（ラジアン上限）
  var REPULSION = 2.2;
  var REPULSION_RADIUS = 7;
  var SPRING = 0.3;
  var SPRING_LENGTH = 6.5;
  var ANCHOR_PULL = 0.02;
  var ITERATIONS = 110;
  var DAMPING = 0.75;
  var MAX_STEP = 1.4;

  // FNV-1a 32bit。安定した ID → 値。
  function hash32(text) {
    var h = 2166136261;
    var str = String(text == null ? '' : text);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function unitFromHash(text) {
    return hash32(text) / 4294967295;
  }

  function tierRank(tier) {
    if (tier === 'primary') return 2;
    if (tier === 'secondary') return 1;
    return 0;
  }

  function regionKey(compound) {
    return compound.regionIndex || 0;
  }

  // 反応データから無向ペア（重複なし）を作る。基質→生成物の向きは配置に不要。
  function buildSpringPairs(reactions, byId) {
    var seen = Object.create(null);
    var pairs = [];
    (reactions || []).forEach(function (reaction) {
      if (!reaction) return;
      var substrates = reaction.substrates || [];
      var products = reaction.products || [];
      substrates.forEach(function (a) {
        products.forEach(function (b) {
          if (a === b || !byId[a] || !byId[b]) return;
          var key = a < b ? a + '\u0000' + b : b + '\u0000' + a;
          if (seen[key]) return;
          seen[key] = true;
          pairs.push([a, b]);
        });
      });
    });
    return pairs;
  }

  // 分野ごとの局所平面を、決定的な回転・傾きで 3D に置く。
  function seedPositions(compounds, options) {
    var scale = options.scale;
    var regionBand = options.regionBand;
    var centers = [];
    var i;
    var minPxX = Infinity, minPxY = Infinity, maxPxX = -Infinity, maxPxY = -Infinity;
    var maxRegion = 0;
    for (i = 0; i < compounds.length; i++) {
      var c = compounds[i];
      var cx = (c.x || 0) + (c.w || 136) / 2;
      var cy = (c.y || 0) + (c.h || 34) / 2;
      centers.push({ x: cx, y: cy });
      if (cx < minPxX) minPxX = cx;
      if (cy < minPxY) minPxY = cy;
      if (cx > maxPxX) maxPxX = cx;
      if (cy > maxPxY) maxPxY = cy;
      if (regionKey(c) > maxRegion) maxRegion = regionKey(c);
    }
    var midX = (minPxX + maxPxX) / 2;
    var midY = (minPxY + maxPxY) / 2;

    var regionSums = Object.create(null);
    for (i = 0; i < compounds.length; i++) {
      var key = regionKey(compounds[i]);
      if (!regionSums[key]) regionSums[key] = { x: 0, y: 0, n: 0 };
      regionSums[key].x += centers[i].x;
      regionSums[key].y += centers[i].y;
      regionSums[key].n += 1;
    }

    var anchors = Object.create(null);
    var rotations = Object.create(null);
    var tilts = Object.create(null);
    Object.keys(regionSums).forEach(function (key) {
      var index = Number(key);
      var sum = regionSums[key];
      var rcX = sum.x / sum.n;
      var rcY = sum.y / sum.n;
      rotations[key] = (unitFromHash('rot|' + key) * 2 - 1) * REGION_ROT;
      tilts[key] = (unitFromHash('tilt|' + key) * 2 - 1) * REGION_TILT;
      anchors[key] = {
        x: (rcX - midX) * scale,
        y: (index - maxRegion / 2) * regionBand +
          (unitFromHash('depth|' + key) * 2 - 1) * regionBand * 0.35,
        z: (rcY - midY) * scale
      };
    });

    var nodes = [];
    for (i = 0; i < compounds.length; i++) {
      var compound = compounds[i];
      var rKey = regionKey(compound);
      var rc = regionSums[rKey];
      var localU = (centers[i].x - rc.x / rc.n) * scale; // 分野内の 2D x
      var localV = (centers[i].y - rc.y / rc.n) * scale; // 分野内の 2D y
      var theta = rotations[rKey];
      var tilt = tilts[rKey];
      var cosT = Math.cos(theta);
      var sinT = Math.sin(theta);
      var cosB = Math.cos(tilt);
      var sinB = Math.sin(tilt);
      // 局所平面の正規直交基底（回転 θ、傾き β）。距離は剛体変換で保たれる。
      var axisU = { x: cosT, y: 0, z: sinT };
      var axisV = { x: -sinT * cosB, y: sinB, z: cosT * cosB };
      var jitter = (unitFromHash(compound.id + '|z') - 0.5) * JITTER_RANGE;
      var degree = Math.min(6, (compound.incoming || 0) + (compound.outgoing || 0));
      var anchor = anchors[rKey];
      var tierY = TIER_Y[compound.tier || 'isolated'] || 0;
      nodes.push({
        id: compound.id,
        x: anchor.x + axisU.x * localU + axisV.x * localV,
        y: anchor.y + axisU.y * localU + axisV.y * localV + tierY + jitter + degree * DEGREE_Y,
        z: anchor.z + axisU.z * localU + axisV.z * localV + jitter * 0.5,
        anchor: anchor
      });
    }
    return { nodes: nodes, anchors: anchors };
  }

  // 決定的な緩和。近距離反発で密度を下げ、反応のばねで関連を保ち、
  // 分野アンカーでグループのまとまりを保つ。
  function relax(nodes, pairs) {
    var count = nodes.length;
    var indexById = Object.create(null);
    for (var i = 0; i < count; i++) indexById[nodes[i].id] = i;
    var springs = [];
    for (var p = 0; p < pairs.length; p++) {
      var a = indexById[pairs[p][0]];
      var b = indexById[pairs[p][1]];
      if (a == null || b == null) continue;
      springs.push([a, b]);
    }

    var fx = new Float64Array(count);
    var fy = new Float64Array(count);
    var fz = new Float64Array(count);
    var radius2 = REPULSION_RADIUS * REPULSION_RADIUS;
    var cell = REPULSION_RADIUS;

    for (var iter = 0; iter < ITERATIONS; iter++) {
      fx.fill(0);
      fy.fill(0);
      fz.fill(0);

      var grid = Object.create(null);
      for (i = 0; i < count; i++) {
        var node = nodes[i];
        var gx = Math.floor(node.x / cell);
        var gy = Math.floor(node.y / cell);
        var gz = Math.floor(node.z / cell);
        var gkey = gx + ',' + gy + ',' + gz;
        if (!grid[gkey]) grid[gkey] = [];
        grid[gkey].push(i);
      }
      for (i = 0; i < count; i++) {
        var n = nodes[i];
        var cx = Math.floor(n.x / cell);
        var cy = Math.floor(n.y / cell);
        var cz = Math.floor(n.z / cell);
        for (var dx = -1; dx <= 1; dx++) {
          for (var dy = -1; dy <= 1; dy++) {
            for (var dz = -1; dz <= 1; dz++) {
              var bucket = grid[(cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)];
              if (!bucket) continue;
              for (var bi = 0; bi < bucket.length; bi++) {
                var j = bucket[bi];
                if (j <= i) continue;
                var o = nodes[j];
                var ddx = n.x - o.x;
                var ddy = n.y - o.y;
                var ddz = n.z - o.z;
                var d2 = ddx * ddx + ddy * ddy + ddz * ddz;
                if (d2 > radius2 || d2 < 1e-9) continue;
                var d = Math.sqrt(d2);
                var f = REPULSION * (REPULSION_RADIUS - d) / d;
                fx[i] += ddx * f; fy[i] += ddy * f; fz[i] += ddz * f;
                fx[j] -= ddx * f; fy[j] -= ddy * f; fz[j] -= ddz * f;
              }
            }
          }
        }
      }

      for (var s = 0; s < springs.length; s++) {
        var ia = springs[s][0];
        var ib = springs[s][1];
        var na = nodes[ia];
        var nb = nodes[ib];
        var sx = nb.x - na.x;
        var sy = nb.y - na.y;
        var sz = nb.z - na.z;
        var dist = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1e-9;
        var force = SPRING * (dist - SPRING_LENGTH) / dist;
        fx[ia] += sx * force; fy[ia] += sy * force; fz[ia] += sz * force;
        fx[ib] -= sx * force; fy[ib] -= sy * force; fz[ib] -= sz * force;
      }

      for (i = 0; i < count; i++) {
        var item = nodes[i];
        fx[i] += (item.anchor.x - item.x) * ANCHOR_PULL;
        fy[i] += (item.anchor.y - item.y) * ANCHOR_PULL;
        fz[i] += (item.anchor.z - item.z) * ANCHOR_PULL;
        var magnitude = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i] + fz[i] * fz[i]) || 1;
        var scale = Math.min(MAX_STEP, magnitude) / magnitude * DAMPING;
        item.x += fx[i] * scale;
        item.y += fy[i] * scale;
        item.z += fz[i] * scale;
      }
    }
  }

  // 緩和後の分野ごとの平均 Y を、分野番号の段へ揃える（分野内の形は平行移動で保つ）。
  // これで「分野ごとの高低差」がはっきり残り、隣接分野が入り混じらない。
  function applyRegionBands(nodes, compounds, regionBand) {
    var maxRegion = 0;
    var sums = Object.create(null);
    var counts = Object.create(null);
    var i;
    for (i = 0; i < compounds.length; i++) {
      var r = regionKey(compounds[i]);
      if (r > maxRegion) maxRegion = r;
      sums[r] = (sums[r] || 0) + nodes[i].y;
      counts[r] = (counts[r] || 0) + 1;
    }
    var offsets = Object.create(null);
    Object.keys(sums).forEach(function (key) {
      var index = Number(key);
      var mean = sums[key] / counts[key];
      var target = (index - maxRegion / 2) * regionBand;
      offsets[key] = target - mean;
    });
    for (i = 0; i < compounds.length; i++) {
      nodes[i].y += offsets[regionKey(compounds[i])];
    }
  }

  // 決定的な最小間隔の後処理。緩和後に残った極端な近接だけを押し離す。
  function enforceMinSeparation(nodes, minDistance, passes) {
    var count = nodes.length;
    for (var pass = 0; pass < (passes || 6); pass++) {
      for (var i = 0; i < count; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < count; j++) {
          var b = nodes[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dz = b.z - a.z;
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= minDistance * minDistance) continue;
          var d = Math.sqrt(d2);
          if (d < 1e-6) {
            // 完全一致は ID から決定的な向きを作る（乱数なし）。
            var angle = unitFromHash(a.id + '|' + b.id) * Math.PI * 2;
            var lift = (unitFromHash(b.id + '|' + a.id) - 0.5);
            dx = Math.cos(angle);
            dy = lift;
            dz = Math.sin(angle);
            d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
          var push = (minDistance - (d < 1e-6 ? 0 : Math.sqrt(d2))) / 2;
          var ux = dx / d;
          var uy = dy / d;
          var uz = dz / d;
          a.x -= ux * push; a.y -= uy * push; a.z -= uz * push;
          b.x += ux * push; b.y += uy * push; b.z += uz * push;
        }
      }
    }
  }

  function buildLayout3D(compounds, options) {
    options = options || {};
    if (!Array.isArray(compounds)) throw new TypeError('RP3DLayout: compounds が配列でない');
    var scale = options.scale == null ? WORLD_PER_PX : options.scale;
    var regionBand = options.regionBand == null ? REGION_BAND : options.regionBand;

    var seeds = seedPositions(compounds, { scale: scale, regionBand: regionBand });
    var byId = Object.create(null);
    for (var i = 0; i < compounds.length; i++) {
      if (!compounds[i].id) throw new TypeError('RP3DLayout: id のない物質がある');
      byId[compounds[i].id] = true;
    }
    var pairs = buildSpringPairs(options.reactions, byId);
    relax(seeds.nodes, pairs);
    applyRegionBands(seeds.nodes, compounds, regionBand);
    enforceMinSeparation(seeds.nodes, 4.2, 6);
    // 最小間隔の押し離しで分野平均が少し動くので、段をもう一度だけ揃える。
    applyRegionBands(seeds.nodes, compounds, regionBand);

    var points = Object.create(null);
    var list = [];
    var min = { x: Infinity, y: Infinity, z: Infinity };
    var max = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (i = 0; i < compounds.length; i++) {
      var compound = compounds[i];
      var seed = seeds.nodes[i];
      var point = {
        id: compound.id,
        name: compound.name,
        label: compound.label || compound.name,
        formula: compound.formula,
        region: compound.region,
        regionIndex: compound.regionIndex || 0,
        category: compound.category,
        tier: compound.tier || 'isolated',
        tierRank: tierRank(compound.tier || 'isolated'),
        hub: !!compound.hub,
        incoming: compound.incoming || 0,
        outgoing: compound.outgoing || 0,
        degree: Math.min(6, (compound.incoming || 0) + (compound.outgoing || 0)),
        x: seed.x,
        y: seed.y,
        z: seed.z,
        px: (compound.x || 0) + (compound.w || 136) / 2,
        py: (compound.y || 0) + (compound.h || 34) / 2,
        cardW: (compound.w || 136) * scale,
        cardH: (compound.h || 34) * scale
      };
      points[point.id] = point;
      list.push(point);
      if (point.x < min.x) min.x = point.x;
      if (point.y < min.y) min.y = point.y;
      if (point.z < min.z) min.z = point.z;
      if (point.x > max.x) max.x = point.x;
      if (point.y > max.y) max.y = point.y;
      if (point.z > max.z) max.z = point.z;
    }

    var center = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2
    };
    var radius = 0;
    for (i = 0; i < list.length; i++) {
      var p = list[i];
      var ddx = p.x - center.x;
      var ddy = p.y - center.y;
      var ddz = p.z - center.z;
      var d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (d > radius) radius = d;
    }

    return {
      version: 2,
      scale: scale,
      regionBand: regionBand,
      points: points,
      list: list,
      center: center,
      radius: Math.max(radius, 1),
      bounds: {
        min: min,
        max: max,
        width: max.x - min.x,
        height: max.y - min.y,
        depth: max.z - min.z
      },
      count: list.length
    };
  }

  return {
    WORLD_PER_PX: WORLD_PER_PX,
    REGION_BAND: REGION_BAND,
    hash32: hash32,
    unitFromHash: unitFromHash,
    tierRank: tierRank,
    buildLayout3D: buildLayout3D
  };
});
