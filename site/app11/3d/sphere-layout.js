/*
 * app11/3d 球ビュー — 球面レイアウト（純関数・DOM なし）
 *
 * 目的:
 *   - 427 物質すべてを「1 つの球」の上に置く。
 *   - スロットは Fibonacci 球（黄金角スパイラル）。極を避けるため
 *     y = 1 - 2(i + 0.5)/n を使い、|y| < 1 を保証する（極点そのものは使わない）。
 *   - スロットは固定。物質はスロットへ代入するだけで、スロット同士の距離や
 *     エッジ長の最適化はしない（公開版 layout3d.js のばね・緩和は使わない）。
 *   - 分野（regionIndex）は、球面上の近傍グラフ上で「比例成長」させることで
 *     連続した測地領域にまとめる。乱数は使わず、同じ入力からは常に同じ結果。
 *
 * 公開版との違い:
 *   - 座標は 2D の x / y を一切読まない（data.js の id / regionIndex などだけ）。
 *   - 出力は layout3d.js と同じ形（points / list / center / radius / bounds）に
 *     球面用のフィールド（dir / slot / regionSlotCounts）を足したもの。
 *
 * Node では require、ブラウザでは window.RP3DSphereLayout。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP3DSphereLayout = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RADIUS = 100;
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 約 2.399963 rad
  var NEIGHBORS = 8;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function length(a) {
    return Math.sqrt(dot(a, a));
  }

  // Fibonacci 球のスロット。中心は原点、半径 radius。
  // i は 0..count-1。y は決して ±radius に一致しない（極を避ける）。
  function buildSlots(count, radius) {
    if (!(count > 0)) throw new TypeError('RP3DSphereLayout: count が正でない');
    var r = radius == null ? RADIUS : radius;
    var slots = [];
    for (var i = 0; i < count; i++) {
      var y = 1 - (2 * (i + 0.5)) / count;
      var ring = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = i * GOLDEN_ANGLE;
      var dir = {
        x: Math.cos(theta) * ring,
        y: y,
        z: Math.sin(theta) * ring
      };
      slots.push({
        index: i,
        dir: dir,
        x: dir.x * r,
        y: dir.y * r,
        z: dir.z * r
      });
    }
    return slots;
  }

  // 弦距離の 2 乗（単調なので近傍探索・測地距離の比較に使える）。
  function chord2(a, b) {
    var dx = a.dir.x - b.dir.x;
    var dy = a.dir.y - b.dir.y;
    var dz = a.dir.z - b.dir.z;
    return dx * dx + dy * dy + dz * dz;
  }

  function greatCircleDistance(a, b, radius) {
    var r = radius == null ? RADIUS : radius;
    return Math.acos(clamp(dot(a.dir, b.dir), -1, 1)) * r;
  }

  // k 近傍（相互でなくてよい）。同距離のときは index 昇順で決定的。
  function buildSlotGraph(slots, k) {
    var count = slots.length;
    var depth = Math.max(1, k == null ? NEIGHBORS : k);
    var graph = new Array(count);
    for (var i = 0; i < count; i++) {
      var best = [];
      for (var j = 0; j < count; j++) {
        if (i === j) continue;
        var d = chord2(slots[i], slots[j]);
        if (best.length < depth) {
          best.push({ index: j, d: d });
          best.sort(function (a, b) { return a.d - b.d || a.index - b.index; });
        } else if (d < best[best.length - 1].d - 1e-12 ||
          (Math.abs(d - best[best.length - 1].d) <= 1e-12 && j < best[best.length - 1].index)) {
          best[best.length - 1] = { index: j, d: d };
          best.sort(function (a, b) { return a.d - b.d || a.index - b.index; });
        }
      }
      graph[i] = best.map(function (entry) { return entry.index; });
    }
    return graph;
  }

  // 分野（regionIndex）ごとのスロット数を求める。入力順は固定。
  function regionSpecs(compounds) {
    var byIndex = Object.create(null);
    var order = [];
    for (var i = 0; i < compounds.length; i++) {
      var index = compounds[i].regionIndex || 0;
      if (!byIndex[index]) {
        byIndex[index] = { index: index, count: 0 };
        order.push(index);
      }
      byIndex[index].count += 1;
    }
    order.sort(function (a, b) { return a - b; });
    return order.map(function (index) { return byIndex[index]; });
  }

  // 比例成長。大きい分野ほど早く広がり、全体として面積が件数に比例する
  // 測地ブロブになる。成長は「種からの弦距離が最小の未割当スロット」を選ぶので、
  // 乱数も入力順への依存もない。
  // 分野（regionIndex）を球面上の連続した測地ブロブへ割り当てる。
  //
  // 手順（すべて決定的）:
  //   1. 種スロットを「重み付き最遠点サンプリング」で置く。距離を分野サイズの
  //      和で割るので、大きい分野ほど広い間隔を得る（容量と面積が釣り合う）。
  //   2. 全スロット×全分野の距離を昇順に並べ、空きスロットを最も近い
  //      容量残のある分野へ貪欲に割り当てる（容量は必ず使い切る）。
  //   3. 包囲などでできた小さな飛び地を repairFragments で本体へ戻す。
  //
  // スロット自体は Fibonacci 球の位置から動かさない。最適化もしない。
  function assignRegions(slots, specs, graph, options) {
    options = options || {};
    var count = slots.length;
    var assigned = new Int32Array(count);
    for (var z = 0; z < count; z++) assigned[z] = -1;

    var order = specs.slice().sort(function (a, b) {
      return b.count - a.count || a.index - b.index;
    });
    if (!order.length) {
      return { assigned: assigned, seeds: Object.create(null), blocked: 0, leftover: 0 };
    }

    // 1. 重み付き最遠点サンプリング（種スロット）。
    var seeds = Object.create(null);
    var chosen = [];
    // 最初の種は北極そのものではなく、既定カメラの正面付近に置く
    // （スロットは固定。種の選び方だけを決定的に決める）。
    var START_DIR = { x: 0.36, y: 0.22, z: 0.91 };
    var startLength = Math.hypot(START_DIR.x, START_DIR.y, START_DIR.z);
    START_DIR = {
      x: START_DIR.x / startLength,
      y: START_DIR.y / startLength,
      z: START_DIR.z / startLength
    };
    for (var oi = 0; oi < order.length; oi++) {
      var spec = order[oi];
      var seed = 0;
      if (!chosen.length) {
        var bestStart = -1;
        for (var ss = 0; ss < count; ss++) {
          var dd = slots[ss].dir.x * START_DIR.x + slots[ss].dir.y * START_DIR.y + slots[ss].dir.z * START_DIR.z;
          if (bestStart < 0 || dd > bestStart + 1e-15 ||
            (Math.abs(dd - bestStart) <= 1e-15 && ss < seed)) {
            bestStart = dd;
            seed = ss;
          }
        }
      } else {
        var bestSlot = -1;
        var bestScore = -1;
        for (var si = 0; si < count; si++) {
          var taken = false;
          for (var ci = 0; ci < chosen.length; ci++) {
            if (chosen[ci].slot === si) { taken = true; break; }
          }
          if (taken) continue;
          var score = Infinity;
          for (var cj = 0; cj < chosen.length; cj++) {
            var weighted = chord2(slots[si], slots[chosen[cj].slot]) /
              (spec.count + chosen[cj].count);
            if (weighted < score) score = weighted;
          }
          if (score > bestScore + 1e-15 ||
            (Math.abs(score - bestScore) <= 1e-15 && (bestSlot < 0 || si < bestSlot))) {
            bestScore = score;
            bestSlot = si;
          }
        }
        seed = bestSlot < 0 ? 0 : bestSlot;
      }
      seeds[spec.index] = seed;
      chosen.push({ slot: seed, count: spec.count, index: spec.index });
    }

    // 2. 距離順の貪欲割当（容量つき）。
    var pairs = [];
    for (var i = 0; i < count; i++) {
      for (var pi = 0; pi < specs.length; pi++) {
        pairs.push({
          slot: i,
          region: specs[pi].index,
          distance: chord2(slots[i], slots[seeds[specs[pi].index]])
        });
      }
    }
    pairs.sort(function (a, b) {
      return a.distance - b.distance || a.slot - b.slot || a.region - b.region;
    });
    var remaining = Object.create(null);
    for (var ri = 0; ri < specs.length; ri++) remaining[specs[ri].index] = specs[ri].count;
    var leftover = 0;
    for (var k = 0; k < pairs.length; k++) {
      var pair = pairs[k];
      if (assigned[pair.slot] !== -1) continue;
      if (!(remaining[pair.region] > 0)) continue;
      assigned[pair.slot] = pair.region;
      remaining[pair.region] -= 1;
    }
    for (i = 0; i < count; i++) if (assigned[i] === -1) leftover += 1;

    // 理論上、容量の合計＝スロット数なので leftover は 0。念のため近い分野へ寄せる。
    if (leftover > 0) {
      for (i = 0; i < count; i++) {
        if (assigned[i] !== -1) continue;
        var target = -1;
        var targetDist = Infinity;
        Object.keys(remaining).forEach(function (key) {
          var regionIndex = Number(key);
          if (!(remaining[regionIndex] > 0)) return;
          var d = chord2(slots[i], slots[seeds[regionIndex]]);
          if (d < targetDist - 1e-15 ||
            (Math.abs(d - targetDist) <= 1e-15 && (target < 0 || regionIndex < target))) {
            targetDist = d;
            target = regionIndex;
          }
        });
        if (target < 0) break;
        assigned[i] = target;
        remaining[target] -= 1;
        leftover -= 1;
      }
    }

    // 3. 飛び地の修復（容量・連結性を保つ交換だけ）。
    var repair = repairFragments(slots, graph, assigned);
    var blocked = 0;
    Object.keys(remaining).forEach(function (key) {
      if (remaining[key] > 0) blocked += 1;
    });
    return {
      assigned: assigned,
      seeds: seeds,
      blocked: blocked,
      leftover: repair.failed,
      repaired: repair.repairs
    };
  }

  // 分野ごとの連結成分（大きい順）。割当の連続性を測る／直すのに使う。
  function regionComponents(slots, graph, assigned, regionIndex) {
    var count = slots.length;
    var seen = new Uint8Array(count);
    var components = [];
    for (var i = 0; i < count; i++) {
      if (assigned[i] !== regionIndex || seen[i]) continue;
      var queue = [i];
      var list = [i];
      seen[i] = 1;
      while (queue.length) {
        var current = queue.shift();
        var nb = graph[current];
        for (var k = 0; k < nb.length; k++) {
          var next = nb[k];
          if (seen[next] || assigned[next] !== regionIndex) continue;
          seen[next] = 1;
          list.push(next);
          queue.push(next);
        }
      }
      components.push(list);
    }
    components.sort(function (a, b) {
      return b.length - a.length || a[0] - b[0];
    });
    return components;
  }

  function isConnectedWithout(slots, graph, assigned, regionIndex, removed) {
    var count = slots.length;
    var start = -1;
    var total = 0;
    for (var i = 0; i < count; i++) {
      if (assigned[i] !== regionIndex) continue;
      if (removed[i]) continue;
      total += 1;
      if (start < 0) start = i;
    }
    if (start < 0) return true;
    var seen = new Uint8Array(count);
    var queue = [start];
    seen[start] = 1;
    var reached = 1;
    while (queue.length) {
      var current = queue.shift();
      var nb = graph[current];
      for (var k = 0; k < nb.length; k++) {
        var next = nb[k];
        if (seen[next] || removed[next]) continue;
        if (assigned[next] !== regionIndex) continue;
        seen[next] = 1;
        reached += 1;
        queue.push(next);
      }
    }
    return reached === total;
  }

  // 断片の修復。比例成長の途中で包囲されてできた「小さな飛び地」を、
  // 隣接分野と同数の境界スロットを交換して本体内へ戻す。
  // 件数（分野の容量）は変えない。連結性を壊さない交換だけを行う。
  function repairFragments(slots, graph, assigned, options) {
    options = options || {};
    var count = slots.length;
    var passes = options.passes == null ? 4 : options.passes;
    var repairs = 0;
    var failed = 0;
    var regionIndexes = [];
    for (var i = 0; i < count; i++) {
      if (regionIndexes.indexOf(assigned[i]) === -1) regionIndexes.push(assigned[i]);
    }
    regionIndexes.sort(function (a, b) { return a - b; });

    for (var pass = 0; pass < passes; pass++) {
      var changed = false;
      for (var ri = 0; ri < regionIndexes.length; ri++) {
        var x = regionIndexes[ri];
        var components = regionComponents(slots, graph, assigned, x);
        if (components.length <= 1) continue;
        var main = components[0];
        var mainSet = Object.create(null);
        main.forEach(function (slot) { mainSet[slot] = true; });
        for (var ci = 1; ci < components.length; ci++) {
          var fragment = components[ci];
          var fragmentSet = Object.create(null);
          fragment.forEach(function (slot) { fragmentSet[slot] = true; });

          // 飛び地に隣接する分野（X 以外）を数える。
          var adjacency = Object.create(null);
          for (var fi = 0; fi < fragment.length; fi++) {
            var nb = graph[fragment[fi]];
            for (var nk = 0; nk < nb.length; nk++) {
              var owner = assigned[nb[nk]];
              if (owner === x || owner < 0) continue;
              adjacency[owner] = (adjacency[owner] || 0) + 1;
            }
          }
          var needed = fragment.length;
          var donors = Object.keys(adjacency).map(Number).sort(function (a, b) {
            return adjacency[b] - adjacency[a] || a - b;
          });
          var donor = -1;
          var take = [];
          var removed = Object.create(null);
          // 飛び地に隣接し、かつ X の本体にも接するスロットを必要数だけ安全に
          // 譲れる分野を探す（連結性を壊す交換はしない）。
          for (var dj = 0; dj < donors.length; dj++) {
            var candidateDonor = donors[dj];
            var donorTake = [];
            var donorRemoved = Object.create(null);
            var candidates = [];
            for (var si = 0; si < count; si++) {
              if (assigned[si] !== candidateDonor) continue;
              var touchesMain = false;
              var pair = graph[si];
              for (var pk = 0; pk < pair.length; pk++) {
                if (mainSet[pair[pk]]) { touchesMain = true; break; }
              }
              if (touchesMain) candidates.push(si);
            }
            candidates.sort(function (a, b) { return a - b; });
            for (var ki = 0; ki < candidates.length && donorTake.length < needed; ki++) {
              donorRemoved[candidates[ki]] = true;
              if (isConnectedWithout(slots, graph, assigned, candidateDonor, donorRemoved)) {
                donorTake.push(candidates[ki]);
              } else {
                donorRemoved[candidates[ki]] = false;
              }
            }
            if (donorTake.length === needed) {
              donor = candidateDonor;
              take = donorTake;
              removed = donorRemoved;
              break;
            }
          }
          if (donor < 0) { failed += 1; continue; }

          for (var fj = 0; fj < fragment.length; fj++) assigned[fragment[fj]] = donor;
          for (var tj = 0; tj < take.length; tj++) assigned[take[tj]] = x;
          repairs += 1;
          changed = true;
          break; // 成分を作り直してから次の飛び地へ
        }
      }
      if (!changed) break;
    }
    return { repairs: repairs, failed: failed };
  }

  // 分野内の連結性（種から同分野のスロットだけをたどって到達できるか）。
  function regionConnectivity(slots, graph, assigned, regionIndex) {
    var count = slots.length;
    var start = -1;
    for (var i = 0; i < count; i++) {
      if (assigned[i] === regionIndex) { start = i; break; }
    }
    if (start < 0) return { total: 0, reached: 0, ratio: 1 };
    var seen = new Uint8Array(count);
    var queue = [start];
    seen[start] = 1;
    var reached = 1;
    var total = 0;
    for (i = 0; i < count; i++) if (assigned[i] === regionIndex) total += 1;
    while (queue.length) {
      var current = queue.shift();
      var nb = graph[current];
      for (var k = 0; k < nb.length; k++) {
        var next = nb[k];
        if (seen[next]) continue;
        if (assigned[next] !== regionIndex) continue;
        seen[next] = 1;
        reached += 1;
        queue.push(next);
      }
    }
    return { total: total, reached: reached, ratio: total ? reached / total : 1 };
  }

  // 分野内の平均測地距離（region locality の指標）。
  function measureRegionLocality(slots, assigned, radius) {
    var sums = Object.create(null);
    var counts = Object.create(null);
    var byRegion = Object.create(null);
    var i;
    for (i = 0; i < slots.length; i++) {
      var r = assigned[i];
      if (!byRegion[r]) byRegion[r] = [];
      byRegion[r].push(i);
    }
    Object.keys(byRegion).forEach(function (key) {
      var list = byRegion[key];
      var total = 0;
      var pairs = 0;
      for (var a = 0; a < list.length; a++) {
        for (var b = a + 1; b < list.length; b++) {
          total += greatCircleDistance(slots[list[a]], slots[list[b]], radius);
          pairs += 1;
        }
      }
      sums[key] = pairs ? total / pairs : 0;
      counts[key] = list.length;
    });
    return { meanByRegion: sums, countByRegion: counts };
  }

  // 同じ分野のまとまりが、でたらめな割当より近いことを測るための比較値。
  // 決定的な並べ替え（hash ベース）で分野ラベルを入れ替えて平均を出す。
  function randomizedLocalityBaseline(slots, assigned, radius, rounds) {
    var count = slots.length;
    var total = 0;
    var runs = Math.max(1, rounds || 3);
    for (var round = 0; round < runs; round++) {
      var shuffled = new Int32Array(count);
      for (var i = 0; i < count; i++) shuffled[i] = assigned[i];
      // Fisher–Yates（決定的なキーで並べ替える）。
      var order = [];
      for (i = 0; i < count; i++) order.push(i);
      order.sort(function (a, b) {
        return hash32('shuffle|' + round + '|' + a) - hash32('shuffle|' + round + '|' + b) || a - b;
      });
      var values = [];
      for (i = 0; i < count; i++) values.push(assigned[i]);
      for (i = 0; i < count; i++) shuffled[order[i]] = values[i];
      var locality = measureRegionLocality(slots, shuffled, radius);
      var sum = 0;
      var size = 0;
      Object.keys(locality.meanByRegion).forEach(function (key) {
        sum += locality.meanByRegion[key] * locality.countByRegion[key];
        size += locality.countByRegion[key];
      });
      total += size ? sum / size : 0;
    }
    return total / runs;
  }

  function hash32(text) {
    var h = 2166136261;
    var str = String(text == null ? '' : text);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function tierRank(tier) {
    if (tier === 'primary') return 2;
    if (tier === 'secondary') return 1;
    return 0;
  }

  function buildSphereLayout(compounds, options) {
    options = options || {};
    if (!Array.isArray(compounds)) throw new TypeError('RP3DSphereLayout: compounds が配列でない');
    if (!compounds.length) throw new TypeError('RP3DSphereLayout: compounds が空');
    var radius = options.radius == null ? RADIUS : options.radius;
    var neighbors = options.neighbors == null ? NEIGHBORS : options.neighbors;

    var slots = buildSlots(compounds.length, radius);
    var graph = buildSlotGraph(slots, neighbors);
    var specs = regionSpecs(compounds);
    var assignment = assignRegions(slots, specs, graph);
    var repair = repairFragments(slots, graph, assignment.assigned);
    var assigned = assignment.assigned;

    // 分野ごとの物質リスト（id 昇順で決定的）。スロットは index 昇順。
    var compoundsByRegion = Object.create(null);
    var i;
    for (i = 0; i < compounds.length; i++) {
      var compound = compounds[i];
      if (!compound.id) throw new TypeError('RP3DSphereLayout: id のない物質がある');
      var regionIndex = compound.regionIndex || 0;
      if (!compoundsByRegion[regionIndex]) compoundsByRegion[regionIndex] = [];
      compoundsByRegion[regionIndex].push(compound);
    }
    var slotsByRegion = Object.create(null);
    for (i = 0; i < slots.length; i++) {
      var region = assigned[i];
      if (!slotsByRegion[region]) slotsByRegion[region] = [];
      slotsByRegion[region].push(i);
    }
    Object.keys(compoundsByRegion).forEach(function (key) {
      compoundsByRegion[key].sort(function (a, b) {
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
    });

    var points = Object.create(null);
    var list = [];
    var compoundToSlot = Object.create(null);
    var regionSlotCounts = Object.create(null);
    var min = { x: Infinity, y: Infinity, z: Infinity };
    var max = { x: -Infinity, y: -Infinity, z: -Infinity };

    Object.keys(compoundsByRegion).forEach(function (key) {
      var regionIndex = Number(key);
      var group = compoundsByRegion[key];
      var owned = slotsByRegion[regionIndex] || [];
      regionSlotCounts[regionIndex] = { compounds: group.length, slots: owned.length };
      // スロット数と物質数は同じ（割当は容量どおり）。念のため少ない方に合わせる。
      var limit = Math.min(group.length, owned.length);
      for (var k = 0; k < limit; k++) {
        var compound = group[k];
        var slot = slots[owned[k]];
        var point = {
          id: compound.id,
          name: compound.name,
          label: compound.label || compound.name,
          formula: compound.formula,
          region: compound.region,
          regionIndex: regionIndex,
          category: compound.category,
          tier: compound.tier || 'isolated',
          tierRank: tierRank(compound.tier || 'isolated'),
          hub: !!compound.hub,
          incoming: compound.incoming || 0,
          outgoing: compound.outgoing || 0,
          degree: Math.min(6, (compound.incoming || 0) + (compound.outgoing || 0)),
          x: slot.x,
          y: slot.y,
          z: slot.z,
          // 球面の外向き単位ベクトルと、固定スロット番号。
          nx: slot.dir.x,
          ny: slot.dir.y,
          nz: slot.dir.z,
          slot: slot.index,
          cardW: 3,
          cardH: 0.8
        };
        points[point.id] = point;
        list.push(point);
        compoundToSlot[compound.id] = slot.index;
        if (point.x < min.x) min.x = point.x;
        if (point.y < min.y) min.y = point.y;
        if (point.z < min.z) min.z = point.z;
        if (point.x > max.x) max.x = point.x;
        if (point.y > max.y) max.y = point.y;
        if (point.z > max.z) max.z = point.z;
      }
    });

    var locality = measureRegionLocality(slots, assigned, radius);
    var connectivity = {};
    Object.keys(compoundsByRegion).forEach(function (key) {
      connectivity[key] = regionConnectivity(slots, graph, assigned, Number(key));
    });

    return {
      version: 1,
      kind: 'sphere',
      radius: radius,
      slots: slots,
      graph: graph,
      assignment: assigned,
      seeds: assignment.seeds,
      regionSlotCounts: regionSlotCounts,
      points: points,
      list: list,
      compoundToSlot: compoundToSlot,
      center: { x: 0, y: 0, z: 0 },
      // 球の外接箱（公開 renderer が床グリッドを作るため。この画面では
      // 床セグメントを使わず、sphere-render 側で球のガイドに差し替える）。
      bounds: {
        min: min,
        max: max,
        width: max.x - min.x,
        height: max.y - min.y,
        depth: max.z - min.z
      },
      count: list.length,
      stats: {
        count: list.length,
        radius: radius,
        slots: slots.length,
        blockedRegions: assignment.blocked,
        repairedFragments: repair.repairs,
        unrepairedFragments: repair.failed,
        regionLocality: locality,
        regionConnectivity: connectivity
      }
    };
  }

  return {
    RADIUS: RADIUS,
    GOLDEN_ANGLE: GOLDEN_ANGLE,
    NEIGHBORS: NEIGHBORS,
    buildSlots: buildSlots,
    buildSlotGraph: buildSlotGraph,
    regionSpecs: regionSpecs,
    assignRegions: assignRegions,
    regionComponents: regionComponents,
    repairFragments: repairFragments,
    regionConnectivity: regionConnectivity,
    measureRegionLocality: measureRegionLocality,
    randomizedLocalityBaseline: randomizedLocalityBaseline,
    greatCircleDistance: greatCircleDistance,
    buildSphereLayout: buildSphereLayout
  };
});
