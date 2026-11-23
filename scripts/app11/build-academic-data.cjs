/**
 * 有機反応マップ（app11）— アカデミック（大学レベル追加反応）データの生成
 *
 * 実行:
 *   node scripts/app11/build-academic-data.cjs            # site/app11/academic-data.js を更新
 *   node scripts/app11/build-academic-data.cjs --check    # 生成物が最新かを確認
 *
 * - 正本は site-src/app11/academic-reactions.json。通常の reactions.json / layout.json /
 *   routes.json / data.js は読むだけで書き換えない。
 * - 通常 427 物質の ID だけを参照する overlay。compounds 配列は複製しない。
 * - 反応 ID は academic-* 名前空間。通常 86 反応・held 81 反応の ID と衝突させない。
 * - 既存の S.projectEquation / S.loadSpecies を再利用し、未知の compound・species・
 *   元素収支（B/N）を fail-closed で止める。
 * - 一般則の適用（evidenceKind: general-rule-application）と、資料が個別例として示す
 *   変換（source-illustrated-transformation）を区別して保存する。
 * - 多段階（stepKind: multi-step）は direct と区別し、steps の説明を必須にする。
 * - 出典の URL は正本にだけ保持し、公開データには資料名・節・確認日だけを出す。
 * - 通常データとの整合（meta.version / 件数 / ノード座標ハッシュ）を base に保存し、
 *   実行時に一致しなければアカデミックモードを無効化する（fail-closed）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const S = require('./source-data.cjs');
const N = require('./academic-network-layout.cjs');
const Q = require('./label-quality.cjs');
const G = require('./geometry.cjs');
const X = require('./academic-crossing-relief.cjs');
const P = require('./academic-paint.cjs');

// ラベル後処理の優先対象（通常モードの代表 + 強5件）。
const LABEL_PRIORITY = [
  'ethanol-dehydration-ethene',
  'ethanol-sodium',
  'ethanol-cuo-oxidation',
  'ethyne-full-hydrogenation',
  'acetic-acid-sodium-carbonate',
  'methanol-cuo-oxidation',
  'ethene-hydrogenation',
  'ethene-hydration'
];

let ROUTE_REPAIR = null;
try {
  ROUTE_REPAIR = require('./label-route-repair.cjs');
} catch (error) {
  ROUTE_REPAIR = null;
}

function summarizeLengths(pointsList) {
  const lengths = pointsList.map((points) => {
    let sum = 0;
    for (let i = 0; i < points.length - 1; i++) sum += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    return sum;
  }).sort((a, b) => a - b);
  if (!lengths.length) return { count: 0, total: 0, mean: 0, median: 0, p95: 0, max: 0, ge1000: 0 };
  const total = lengths.reduce((s, v) => s + v, 0);
  const median = lengths.length % 2 ? lengths[(lengths.length - 1) / 2]
    : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2;
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    count: lengths.length,
    total: r2(total),
    mean: r2(total / lengths.length),
    median: r2(median),
    p95: r2(lengths[Math.min(lengths.length - 1, Math.ceil(lengths.length * 0.95) - 1)]),
    max: r2(lengths[lengths.length - 1]),
    ge1000: lengths.filter((v) => v >= 1000).length
  };
}

/** reroute 後に stats.after の長さ系を実測へ合わせる（crossingPairs は元の集計を保持）。 */
function recomputeAcademicStats(placed) {
  const normalPoints = Object.keys(placed.normalRoutes || {}).map((key) => placed.normalRoutes[key].points);
  const academicPoints = Object.keys(placed.routes || {}).map((key) => placed.routes[key].points);
  const normal = summarizeLengths(normalPoints);
  const academic = summarizeLengths(academicPoints);
  const combined = summarizeLengths(normalPoints.concat(academicPoints));
  const stats = placed.stats || {};
  const after = stats.after || {};
  const previous = {
    combined: after.combined || {},
    normal: after.normal || {},
    academic: after.academic || {}
  };
  stats.after = Object.assign({}, after, {
    combined: Object.assign({}, previous.combined, combined),
    normal: Object.assign({}, previous.normal, normal),
    academic: Object.assign({}, previous.academic, academic)
  });
  const baseline = stats.before || {};
  if (baseline.combined) {
    const r2 = (v) => Math.round(v * 100) / 100;
    stats.after.reduction = Object.assign({}, after.reduction, {
      total: r2(1 - combined.total / baseline.combined.total),
      p95: r2(1 - combined.p95 / baseline.combined.p95),
      max: r2(1 - combined.max / baseline.combined.max),
      ge1000: combined.ge1000
    });
  }
  placed.stats = stats;
}

/**
 * 学術の「真の逆転かつ leader 無し」だけ、B helper で foreign route を局所 reroute し、
 * その後にラベル/leader を実描画 geometry で再検証する。
 * own route・ノード・facts・class map は変更しない。
 */
function repairAcademicRoutes(placed, classMap, reactionMeta) {
  if (!ROUTE_REPAIR) return { available: false, targets: 0, changed: [], unresolved: [], invalidLeaders: null };
  const H = ROUTE_REPAIR;
  const geometry = Q.academicRepairGeometry(placed, classMap, reactionMeta);
  const targets = Q.collectRepairTargets(geometry);
  if (!targets.length) {
    return { available: true, targets: 0, changed: [], unresolved: [], invalidLeaders: 0, remaining: [] };
  }
  const allMarkers = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
  const labels = {};
  const markers = {};
  for (const id of Object.keys(allMarkers)) {
    const marker = allMarkers[id];
    markers[id] = { x: marker.x, y: marker.y };
    if (marker.label && marker.label.box) {
      labels[id] = { box: marker.label.box, leader: marker.label.leader || null };
    }
  }
  const protect = {};
  for (const target of targets) {
    const box = target.box;
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const nearest = H.nearestPointOnPolylines(geometry.ownerLines[target.id] || [], center);
    if (!nearest) continue;
    const p = nearest.point;
    const q = {
      x: Math.min(box.x + box.w, Math.max(box.x, p.x)),
      y: Math.min(box.y + box.h, Math.max(box.y, p.y))
    };
    protect[target.id] = { corridor: [[q.x, q.y], [p.x, p.y]] };
  }
  const classRects = [];
  if (classMap) {
    if (classMap.frame) classRects.push(classMap.frame);
    (classMap.nodes || []).forEach((node) => classRects.push(node));
  }
  const routesIn = {};
  for (const key of Object.keys(placed.normalRoutes || {})) routesIn[key] = placed.normalRoutes[key];
  for (const key of Object.keys(placed.routes || {})) routesIn[key] = placed.routes[key];
  const result = H.repair({
    labels: labels,
    routes: routesIn,
    compounds: placed.positions,
    markers: markers,
    classRects: classRects,
    protect: protect
  }, { clearance: 8, cell: 6, passes: 2 });

  for (const key of result.changed) {
    const route = result.routes[key];
    if (!route) continue;
    if (placed.routes && placed.routes[key]) placed.routes[key].points = route.points;
    else if (placed.normalRoutes && placed.normalRoutes[key]) placed.normalRoutes[key].points = route.points;
  }
  if (result.changed.length) recomputeAcademicStats(placed);

  // reroute 後は実描画 geometry でラベル/leader を再 solve・再検証する。
  let labelSummary = Q.applyAcademicLabelLayout(placed, classMap, reactionMeta, {
    nodeW: 136,
    nodeH: 34,
    priority: LABEL_PRIORITY,
    repairPasses: 1
  }).summary;
  const changedAll = result.changed.slice();
  const passReports = [];

  function buildProtect(geometry, list) {
    const out = {};
    for (const target of list) {
      const box = target.box;
      const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const nearest = H.nearestPointOnPolylines(geometry.ownerLines[target.id] || [], center);
      if (!nearest) continue;
      const p = nearest.point;
      const q = {
        x: Math.min(box.x + box.w, Math.max(box.x, p.x)),
        y: Math.min(box.y + box.h, Math.max(box.y, p.y))
      };
      out[target.id] = { corridor: [[q.x, q.y], [p.x, p.y]] };
    }
    return out;
  }
  function currentRoutes() {
    const routesIn = {};
    for (const key of Object.keys(placed.normalRoutes || {})) routesIn[key] = placed.normalRoutes[key];
    for (const key of Object.keys(placed.routes || {})) routesIn[key] = placed.routes[key];
    return routesIn;
  }
  function currentLabelsAndMarkers() {
    const all = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
    const labelsOut = {};
    const markersOut = {};
    for (const id of Object.keys(all)) {
      markersOut[id] = { x: all[id].x, y: all[id].y };
      if (all[id].label && all[id].label.box) labelsOut[id] = { box: all[id].label.box, leader: all[id].label.leader || null };
    }
    return { labels: labelsOut, markers: markersOut };
  }
  function applyChanged(resultObj) {
    let count = 0;
    for (const key of resultObj.changed) {
      const route = resultObj.routes[key];
      if (!route) continue;
      if (placed.routes && placed.routes[key]) placed.routes[key].points = route.points;
      else if (placed.normalRoutes && placed.normalRoutes[key]) placed.normalRoutes[key].points = route.points;
      count++;
    }
    return count;
  }

  // 残件だけ、より広い局所探索（searchMargin / passes / maxCells）で 1 回だけ再探索。
  // 現行 helper は保護矩形が過大で反復すると全体 reroute が増えるため、
  // B の精密 helper（capsule/正確帯）受領後に反復へ拡張する。
  let remainingNow = Q.collectRepairTargets(Q.academicRepairGeometry(placed, classMap, reactionMeta));
  for (let iteration = 1; iteration <= 2 && remainingNow.length; iteration++) {
    const geometryN = Q.academicRepairGeometry(placed, classMap, reactionMeta);
    const protectN = buildProtect(geometryN, remainingNow);
    const lmN = currentLabelsAndMarkers();
    const options = iteration === 1
      ? { clearance: 8, cell: 6, passes: 2, searchMargin: 36, maxCells: 60000 }
      : { clearance: 8, corridorClearance: 4, cell: 3, passes: 3, searchMargin: 56, maxCells: 200000 };
    const resultN = H.repair({
      labels: lmN.labels,
      routes: currentRoutes(),
      compounds: placed.positions,
      markers: lmN.markers,
      classRects: classRects,
      protect: protectN
    }, options);
    const applied = applyChanged(resultN);
    if (applied) recomputeAcademicStats(placed);
    changedAll.push(...resultN.changed);
    labelSummary = Q.applyAcademicLabelLayout(placed, classMap, reactionMeta, {
      nodeW: 136,
      nodeH: 34,
      priority: LABEL_PRIORITY,
      repairPasses: 1
    }).summary;
    const nextRemaining = Q.collectRepairTargets(Q.academicRepairGeometry(placed, classMap, reactionMeta));
    passReports.push({
      iteration: iteration,
      targets: remainingNow.length,
      changed: resultN.changed.length,
      remaining: nextRemaining.length,
      helperUnresolved: resultN.unresolved.length
    });
    if (!applied || nextRemaining.length >= remainingNow.length) {
      remainingNow = nextRemaining;
      break;
    }
    remainingNow = nextRemaining;
  }

  const finalGeometry = Q.academicRepairGeometry(placed, classMap, reactionMeta);
  const finalMarkers = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
  const finalLabels = {};
  for (const other of Object.keys(finalMarkers)) {
    if (finalMarkers[other].label) finalLabels[other] = finalMarkers[other].label;
  }
  let invalidLeaders = 0;
  for (const id of Object.keys(finalMarkers)) {
    const label = finalMarkers[id].label;
    if (!label || !label.leader || label.leader.length < 2) continue;
    const check = Q.validateLeaderGeometry({
      id: id,
      label: label,
      ownerLines: finalGeometry.ownerLines,
      obstacleLines: finalGeometry.lines,
      labels: finalLabels,
      reactions: finalGeometry.reactions,
      compounds: placed.positions
    });
    if (!check.valid) invalidLeaders++;
  }
  // 全 visible line とラベル box の貫通 0 を最終確認（actual visible のみ）。
  let labelLineHits = 0;
  for (const id of Object.keys(finalLabels)) {
    const box = finalLabels[id].box;
    let hit = false;
    for (const rid of Object.keys(finalGeometry.ownerLines)) {
      for (const poly of finalGeometry.ownerLines[rid]) {
        for (let i = 0; i < poly.length - 1; i++) {
          if (G.segmentRect(poly[i], poly[i + 1], G.inflate(box, -0.5))) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) break;
    }
    if (hit) labelLineHits++;
  }
  return {
    available: true,
    targets: targets.length,
    changed: changedAll,
    unresolved: result.unresolved,
    remaining: Q.collectRepairTargets(finalGeometry).map((t) => t.id),
    invalidLeaders: invalidLeaders,
    labelLineHits: labelLineHits,
    passes: passReports,
    labelSummary: labelSummary
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 交差低減（crossing relief）。物質座標・マーカー座標・ラベル箱・反応・出典は変えず、
 * 辺の点列だけを、他辺を soft cost にした格子 A* の候補へ差し替える。
 *
 * 1. 交差低減: 交差が減り、総延長を増やさない候補だけを採る（伸ばす候補は 2% 以内・
 *    1000px 未満・交差 10% 減かつ累積短縮の範囲内に限る）。
 * 2. 短縮: 交差を増やさず 3%（最低 20px）以上短くなる候補だけを採る。
 * 3. ラベル箱は動かさない。leader は実描画（Core paint）の線へ付け替え、検証に通らなければ
 *    その反応の辺を元へ戻す。leader を持たないラベルは、帰属が壊れる（箱の貫通 /
 *    自分の線なし / 異名の逆転）辺を元へ戻す。
 * 4. 差し戻しで空いた余地を 1 回だけ再探索する（小さめの 2 巡目）。
 */
function relieveAcademicCrossings(placed, classMap, reactionMeta) {
  const markers = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
  const routes = {};
  for (const key of Object.keys(placed.normalRoutes || {})) routes[key] = placed.normalRoutes[key];
  for (const key of Object.keys(placed.routes || {})) routes[key] = placed.routes[key];
  const saved = {};
  const savedLeaders = {};
  Object.keys(routes).forEach((key) => {
    saved[key] = routes[key].points.map((p) => p.slice());
  });
  Object.keys(markers).forEach((id) => {
    const label = markers[id].label;
    if (label && Array.isArray(label.leader) && label.leader.length > 1) {
      savedLeaders[id] = label.leader.map((p) => p.slice());
    }
  });
  const restoreLeader = (id) => {
    if (!savedLeaders[id]) return;
    markers[id].label.leader = savedLeaders[id].map((p) => p.slice());
  };
  const beforeCombined = Object.assign({}, (placed.stats.after && placed.stats.after.combined) || {});
  const beforeReport = X.crossingReport(routes);
  const beforeCrossings = beforeReport.raw;
  const beforeCrossingsDifferentReaction = beforeReport.differentReaction;
  const beforeLength = X.lengthOfAll(routes);
  const normalizeType = (id) => {
    const meta = reactionMeta[id] || {};
    return String(meta.typeLabel == null ? '' : meta.typeLabel).replace(/\s+/g, '');
  };

  // 実描画線での「自分の線までの距離」を 1 回だけ測り、候補の帰属ガードに使う
  // （ラベル箱を動かさないので、この距離は差し替え対象の辺が自分の反応でない限り不変）。
  const beforeGeometry = Q.academicRepairGeometry(placed, classMap, reactionMeta);
  const beforeLabels = {};
  Object.keys(markers).forEach((id) => {
    if (markers[id].label) beforeLabels[id] = markers[id].label;
  });
  const beforeMeasured = Q.measureLabels(beforeLabels, beforeGeometry.lines, { ownerLines: beforeGeometry.lines });
  const ownDistanceOf = (id, fallback) => {
    const entry = beforeMeasured[id];
    if (!entry || entry.ownerDistance == null) return fallback;
    return entry.ownerDistance;
  };

  const done = new Set();
  const reverted = [];
  const guardRounds = [];
  const rounds = [];

    const revertRoutes = (keys) => {
    let count = 0;
    keys.forEach((key) => {
      if (done.has(key) || !saved[key]) return;
      routes[key].points = saved[key];
      restoreLeader(routes[key].reaction);
      done.add(key);
      reverted.push(key);
      count++;
    });
    return count;
  };
  const revertReactions = (targets) => {
    const keys = new Set();
    touchedAll.forEach((key) => {
      if (!done.has(key) && targets.has(routes[key].reaction)) keys.add(key);
    });
    return revertRoutes(keys);
  };

  let touchedAll = [];
  const runRound = (reliefOptions, roundLabel) => {
    const relief = X.relieve({
      routes: routes,
      markers: markers,
      positions: placed.positions,
      bounds: placed.canvas
    }, Object.assign({
      margins: [160, 260],
      maxTargets: 250,
      minCrossings: 6,
      passes: 2,
      extraLongest: 10,
      lastPassTargets: 60,
      labelPad: 3,
      typeLabelOf: normalizeType,
      ownDistanceOf: ownDistanceOf,
      skipKeys: done
    }, reliefOptions));

    const touched = relief.changed.map((entry) => entry.key)
      .concat(relief.shortened.map((entry) => entry.key))
      .filter((key) => !done.has(key));
    touchedAll = touchedAll.concat(touched);
    if (touched.length) {
      // 0. leader を実描画（Core paint）の線へ付け替える。付け替えが検証に通らなければ辺を戻す。
      const paintEdges = {};
      Object.keys(routes).forEach((key) => { paintEdges[key] = routes[key]; });
      const paint = P.buildPaint({
        positions: placed.positions,
        markers: markers,
        edges: paintEdges,
        nodeW: 136,
        nodeH: 34
      });
      const labelsNow = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
      const labelMap = {};
      Object.keys(labelsNow).forEach((id) => { if (labelsNow[id].label) labelMap[id] = labelsNow[id].label; });
      const brokenLeaders = new Set();
      touched.forEach((key) => {
        if (done.has(key)) return;
        const id = routes[key].reaction;
        const label = markers[id] && markers[id].label;
        if (!label || !savedLeaders[id]) return;
        const built = P.buildLeader(paint, id, label);
        if (!built.leader) { brokenLeaders.add(id); return; }
        const candidate = Object.assign({}, label, { leader: built.leader });
        const check = P.validateLeader({ paint: paint, id: id, label: candidate, labels: labelMap, markers: markers, positions: placed.positions });
        if (!check.valid) { brokenLeaders.add(id); return; }
        label.leader = built.leader;
      });
      if (brokenLeaders.size) revertReactions(brokenLeaders);

      // ラベルは動かさない。差し替えた辺が帰属を壊していないかだけを測り、壊す辺を戻す。
      //    a. ラベル箱の貫通  b. 持ち主線の喪失（own なし / leader 無しで 25px 超）
      //    c. 異なる typeLabel の線の方が近い（leader 無し）＝実描画の真逆転ゲート相当
      for (let round = 0; round < 3; round++) {
        let revertedNow = 0;
        const pending = touched.filter((key) => !done.has(key));
        const hits = X.labelHits(routes, Object.assign({}, placed.normalMarkers || {}, placed.markers || {}), pending);
        const hitKeys = new Set();
        hits.forEach((_labels, key) => { if (!done.has(key)) hitKeys.add(key); });
        revertedNow += revertRoutes(hitKeys);
        const geometry = Q.academicRepairGeometry(placed, classMap, reactionMeta);
        const labelsNow = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
        const labelMap = {};
        Object.keys(labelsNow).forEach((id) => { if (labelsNow[id].label) labelMap[id] = labelsNow[id].label; });
        const measured = Q.measureLabels(labelMap, geometry.lines, { ownerLines: geometry.lines });
        const targets = new Set();
        Object.keys(measured).forEach((id) => {
          const own = measured[id].ownerDistance;
          const margin = measured[id].margin;
          const label = labelsNow[id] && labelsNow[id].label;
          const hasLeader = !!(label && Array.isArray(label.leader) && label.leader.length > 1);
          if (own == null) targets.add(id);
          else if (own > 25 && !hasLeader) targets.add(id);
          if (margin != null && margin < 0 && !hasLeader && measured[id].foreignId &&
              normalizeType(measured[id].foreignId) !== normalizeType(id)) {
            targets.add(id);
            targets.add(measured[id].foreignId);
          }
        });
        if (targets.size) revertedNow += revertReactions(targets);
        guardRounds.push({
          round: roundLabel + "." + round,
          targets: targets.size,
          reverted: revertedNow,
          labelHits: hitKeys.size
        });
        if (!revertedNow) break;
      }
    }

rounds.push({
      round: roundLabel,
      evaluated: relief.evaluated,
      changed: relief.changed.length,
      shortened: relief.shortened.length,
      crossings: relief.after.crossings,
      length: relief.after.length
    });
  };

  runRound({}, 'pass1');
  // 差し戻しで戻った辺の余地を、小さめの 2 巡目で拾う。
  runRound({
    maxTargets: 120,
    passes: 1,
    lastPassTargets: 120,
    extraLongest: 6,
    shortenTargets: 20,
    minShortenLength: 1100,
    minCrossings: 8
  }, 'pass2');
  // 最終整合: 経路が確定した後、leader を実描画線へ合わせる。
  // separateSharedPorts / enforcePaintClearance は全体最適なので、途中の巡目で作った leader は
  // 別の辺の差し替えでずれる。ここで全 leader を検証し、直せない反応は辺ごと元へ戻して繰り返す。
  const reconcileLeaders = () => {
    let updated = 0;
    let unfixable = [];
    for (let iter = 0; iter < 3; iter++) {
      const paintEdges = {};
      Object.keys(routes).forEach((key) => { paintEdges[key] = routes[key]; });
      const paint = P.buildPaint({
        positions: placed.positions,
        markers: markers,
        edges: paintEdges,
        nodeW: 136,
        nodeH: 34
      });
      const labelsNow = Object.assign({}, placed.normalMarkers || {}, placed.markers || {});
      const labelMap = {};
      Object.keys(labelsNow).forEach((id) => { if (labelsNow[id].label) labelMap[id] = labelsNow[id].label; });
      const broken = new Set();
      updated = 0;
      Object.keys(savedLeaders).sort().forEach((id) => {
        const label = markers[id] && markers[id].label;
        if (!label) return;
        const check = P.validateLeader({ paint: paint, id: id, label: label, labels: labelMap, markers: markers, positions: placed.positions });
        if (check.valid) return;
        const candidates = P.leaderCandidates(paint, id, label, 60);
        let chosen = null;
        for (const leader of candidates) {
          const probe = P.validateLeader({
            paint: paint,
            id: id,
            label: Object.assign({}, label, { leader: leader }),
            labels: labelMap,
            markers: markers,
            positions: placed.positions
          });
          if (probe.valid) { chosen = leader; break; }
        }
        if (chosen) {
          label.leader = chosen;
          updated++;
        } else {
          broken.add(id);
        }
      });
      if (!broken.size) { unfixable = []; break; }
      // 直せない leader の反応は、差し替えた辺を元へ戻して元の leader に戻す。
      const revertedNow = revertReactions(broken);
      unfixable = Array.from(broken);
      if (!revertedNow) break;
    }
    return { updated: updated, unfixable: unfixable };
  };
  const leaderReconcile = reconcileLeaders();

  recomputeAcademicStats(placed);

  const finalReport = X.crossingReport(routes);
  return {
    definition: X.CROSSING_DEFINITION,
    evaluated: rounds.reduce((sum, round) => sum + round.evaluated, 0),
    changed: touchedAll.length - reverted.length,
    changedKeys: touchedAll.filter((key) => !done.has(key)),
    shortened: rounds.reduce((sum, round) => sum + round.shortened, 0),
    reverted: reverted.length,
    revertedKeys: reverted,
    guardRounds: guardRounds,
    leaderUpdates: leaderReconcile.updated,
    leaderUnfixable: leaderReconcile.unfixable,
    rounds: rounds,
    before: {
      crossings: beforeCrossings,
      crossingsDifferentReaction: beforeCrossingsDifferentReaction,
      length: round2(beforeLength),
      p95: beforeCombined.p95 == null ? 0 : beforeCombined.p95
    },
    after: {
      crossings: finalReport.raw,
      crossingsDifferentReaction: finalReport.differentReaction,
      length: X.lengthOfAll(routes),
      pairs: finalReport.pairCount
    }
  };
}

const ROOT = S.ROOT;const SRC = S.SRC;
const ACADEMIC_PATH = path.join(SRC, 'academic-reactions.json');
const NORMAL_DATA_PATH = path.join(ROOT, 'site', 'app11', 'data.js');
const LAYOUT_PATH = path.join(SRC, 'layout.json');
const CLASS_MAP_PATH = path.join(SRC, 'class-map.json');
const OUT_DATA = path.join(ROOT, 'site', 'app11', 'academic-data.js');

const EVIDENCE_KINDS = ['general-rule-application', 'source-illustrated-transformation'];
const STEP_KINDS = ['direct', 'multi-step'];
const ID_RE = /^academic-[a-z0-9][a-z0-9-]*$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 実行時（app.js）と同じ FNV-1a 32bit。ノードの座標・寸法だけで作る。
function academicBaseHash(compounds) {
  const lines = compounds
    .map((c) => c.id + ':' + c.x + ',' + c.y + ',' + (c.w == null ? '' : c.w) + ',' + (c.h == null ? '' : c.h))
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < lines.length; i++) {
    hash ^= lines.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ('0000000' + hash.toString(16)).slice(-8);
}

function normalizeTerm(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '');
}

function pairKey(reaction) {
  const subs = reaction.substrates.slice().sort().join('+');
  const prods = reaction.products.slice().sort().join('+');
  return reaction.type + '|' + subs + '>' + prods;
}

function dedupeKey(reaction) {
  return pairKey(reaction) + '|' + normalizeTerm(reaction.conditions);
}

/* ---------------- 正本の展開（group + rows） ---------------- */

// "sodium-methoxide+chloromethane>dimethyl-ether" / "benzaldehyde*2>benzyl-alcohol+sodium-benzoate"
function parseRow(text) {
  const arrow = String(text).indexOf('>');
  if (arrow < 0) throw new Error('academic-reactions.json の行の形式が不正: ' + text);
  const parseSide = (side, owner) => side.split('+').map((raw) => {
    const item = raw.trim();
    const m = /^([a-z0-9][a-z0-9,()-]*?)(?:\*(\d+))?$/i.exec(item);
    if (!m) throw new Error(owner + ' の物質の書き方が不正: ' + item);
    return { id: m[1], coef: m[2] ? parseInt(m[2], 10) : 1 };
  });
  return {
    substrates: parseSide(String(text).slice(0, arrow), 'academic row'),
    products: parseSide(String(text).slice(arrow + 1), 'academic row')
  };
}

function slugOf(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function expandRows(doc) {
  const out = [];
  const groups = doc.groups || [];
  const seen = new Set();
  groups.forEach((group) => {
    const owner = 'academic group ' + group.key;
    if (!group.key || !group.type) throw new Error(owner + ' に key/type がない');
    if (!Array.isArray(group.rows) || !group.rows.length) throw new Error(owner + ' に行がない');
    if (!group.conditions) throw new Error(owner + ' に conditions がない');
    if (!group.scope) throw new Error(owner + ' に scope がない');
    if (EVIDENCE_KINDS.indexOf(group.evidenceKind) === -1) throw new Error(owner + ' の evidenceKind が不正');
    if (STEP_KINDS.indexOf(group.stepKind) === -1) throw new Error(owner + ' の stepKind が不正');
    if (group.stepKind === 'multi-step' && (!Array.isArray(group.steps) || !group.steps.length)) {
      throw new Error(owner + ' の多段階に steps がない');
    }
    group.rows.forEach((rowEntry, index) => {
      const rowText = typeof rowEntry === 'string' ? rowEntry : rowEntry.row;
      const rowVariants = typeof rowEntry === 'object' && rowEntry.variants === true;
      const parsed = parseRow(rowText);
      const id = 'academic-' + slugOf(group.key) + '-' + slugOf(parsed.substrates.map((s) => s.id).join('-')) +
        '-' + slugOf(parsed.products.map((p) => p.id).join('-'));
      if (!ID_RE.test(id)) throw new Error(owner + ' のIDが不正: ' + id);
      if (seen.has(id)) throw new Error('アカデミック反応IDが重複: ' + id);
      seen.add(id);
      out.push({
        id: id,
        groupKey: group.key,
        type: group.type,
        substrates: parsed.substrates.map((s) => s.id),
        products: parsed.products.map((p) => p.id),
        substrateCoefs: parsed.substrates.map((s) => s.coef),
        productCoefs: parsed.products.map((p) => p.coef),
        reagents: group.reagents || [],
        conditions: rowNoteOf(group, index) || group.conditions,
        note: group.note || '',
        productNote: group.productNote || '',
        scope: group.scope,
        evidenceKind: group.evidenceKind,
        stepKind: group.stepKind,
        steps: group.steps || [],
        sourceIds: group.sourceIds || [],
        basedOnHeld: group.basedOnHeld || null,
        variants: rowVariants || !!group.variants,
        tier: 'academic'
      });
    });
  });
  (doc.reactions || []).forEach((reaction) => {
    if (!reaction.id || !ID_RE.test(reaction.id)) throw new Error('明示反応のIDが不正: ' + reaction.id);
    if (seen.has(reaction.id)) throw new Error('アカデミック反応IDが重複: ' + reaction.id);
    seen.add(reaction.id);
    out.push(Object.assign({ substrateCoefs: reaction.substrates.map(() => 1), productCoefs: reaction.products.map(() => 1), variants: false, tier: 'academic' }, reaction));
  });
  // 高分子・共重合・ネットワークは、係数 n/m/p/d とモード P を明示できる形で持つ。
  (doc.polymerReactions || []).forEach((reaction) => {
    if (!reaction.id || !ID_RE.test(reaction.id)) throw new Error('高分子反応のIDが不正: ' + reaction.id);
    if (seen.has(reaction.id)) throw new Error('アカデミック反応IDが重複: ' + reaction.id);
    seen.add(reaction.id);
    const subs = reaction.substrates.map((s) => (typeof s === 'string' ? { id: s, coef: 1 } : s));
    const prods = reaction.products.map((p) => (typeof p === 'string' ? { id: p, coef: 1 } : p));
    out.push(Object.assign({}, reaction, {
      substrates: subs.map((s) => s.id),
      products: prods.map((p) => p.id),
      substrateCoefs: subs.map((s) => s.coef),
      productCoefs: prods.map((p) => p.coef),
      variants: false,
      tier: 'academic'
    }));
  });
  return out;
}

function rowNoteOf(group, index) {
  if (!Array.isArray(group.rowNotes)) return '';
  return group.rowNotes[index] || '';
}

/* ---------------- 検証と公開データ化 ---------------- */

function build(opts) {
  const options = opts || {};
  const doc = readJson(options.sourcePath || ACADEMIC_PATH);
  if (doc.version !== 1) throw new Error('academic-reactions.json の版が未対応: ' + doc.version);
  const D = options.baseData || require(NORMAL_DATA_PATH);
  const layout = readJson(LAYOUT_PATH);
  const classMap = readJson(CLASS_MAP_PATH);
  const source = options.source || S.loadSource();
  const species = S.loadSpecies();

  const compoundById = new Map(source.compounds);
  const normalReactionById = new Map(D.reactions.map((r) => [r.id, r]));
  const heldIds = new Set(source.heldReactions.map((r) => r.id));
  const normalIds = new Set(D.reactions.map((r) => r.id));

  const sourceById = new Map();
  (doc.sources || []).forEach((s) => {
    if (!s.id || sourceById.has(s.id)) throw new Error('academic-reactions.json の資料IDが重複/欠落: ' + s.id);
    if (!s.book || !s.section || !s.checkedAt) throw new Error('資料情報が不足: ' + s.id);
    if (!/^https:\/\//.test(String(s.url || ''))) throw new Error('資料URLが正本にない: ' + s.id);
    sourceById.set(s.id, s);
  });

  const academicTypes = {};
  Object.keys(doc.types || {}).forEach((key) => {
    const t = doc.types[key];
    if (!t || !t.label || !t.summary) throw new Error('academic type の情報が不足: ' + key);
    if (source.types[key]) throw new Error('academic type が通常 type と重複: ' + key);
    academicTypes[key] = { label: t.label, summary: t.summary, schematic: t.schematic || '' };
  });

  const publicSourceOf = (entry, owner) => {
    if (!entry.book || !entry.section || !entry.checkedAt) throw new Error(owner + ' の資料情報が不足');
    return entry.book + ' ' + entry.section + '（' + entry.checkedAt + ' 確認）';
  };

  const reactions = [];
  const warnings = [];
  const seenIds = new Set();
  const normalPairKeys = new Set();
  D.reactions.forEach((r) => normalPairKeys.add(pairKey(r)));
  const heldPairKeys = new Set(source.heldReactions.map((r) => pairKey({ type: r.type, substrates: r.substrates || [], products: r.products || [] })));
  const seenPairs = new Map();

  const rawList = expandRows(doc);
  // 高分子の式には H2O / HCl などの無機speciesを含む。グラフの端点は既存427物質だけにする。
  rawList.forEach((raw) => {
    if (!raw.equation) return;
    raw.substrates = raw.substrates.filter((id) => compoundById.has(id));
    raw.products = raw.products.filter((id) => compoundById.has(id));
  });
  rawList.forEach((raw) => {
    const owner = 'アカデミック反応 ' + raw.id;
    if (normalIds.has(raw.id)) throw new Error(owner + ' が通常の反応IDと衝突');
    if (heldIds.has(raw.id)) throw new Error(owner + ' が保留反応IDと衝突');
    if (seenIds.has(raw.id)) throw new Error(owner + ' のIDが重複');
    seenIds.add(raw.id);
    if (!source.types[raw.type] && !academicTypes[raw.type]) throw new Error(owner + ' の種別が未定義: ' + raw.type);
    if (!Array.isArray(raw.substrates) || !raw.substrates.length) throw new Error(owner + ' に基質がない');
    if (!Array.isArray(raw.products)) throw new Error(owner + ' の生成物が配列でない');
    if (!raw.products.length && !raw.productNote) throw new Error(owner + ' に生成物も説明もない');
    raw.substrates.concat(raw.products).forEach((id) => {
      if (!compoundById.has(id)) throw new Error(owner + ' の物質IDが既存427にない: ' + id);
    });
    if (!raw.scope || !String(raw.scope).trim()) throw new Error(owner + ' に scope がない');
    if (EVIDENCE_KINDS.indexOf(raw.evidenceKind) === -1) throw new Error(owner + ' の evidenceKind が不正');
    if (STEP_KINDS.indexOf(raw.stepKind) === -1) throw new Error(owner + ' の stepKind が不正');
    if (raw.stepKind === 'multi-step' && (!Array.isArray(raw.steps) || !raw.steps.length)) {
      throw new Error(owner + ' の多段階に steps がない');
    }
    if (!Array.isArray(raw.sourceIds) || !raw.sourceIds.length) throw new Error(owner + ' に資料がない');
    const verification = raw.sourceIds.map((id) => {
      const entry = sourceById.get(id);
      if (!entry) throw new Error(owner + ' の資料IDが未定義: ' + id);
      return entry;
    });
    if (raw.basedOnHeld) {
      if (!heldIds.has(raw.basedOnHeld)) throw new Error(owner + ' の basedOnHeld が保留反応でない: ' + raw.basedOnHeld);
      // 保留は出典が空。新しい根拠（通常データの確認日より後の確認日）を必須にする。
      const older = verification.filter((entry) => entry.checkedAt <= (D.meta.verifiedAt || ''));
      if (older.length) throw new Error(owner + ' が保留を新しい根拠なしに昇格している: ' + raw.basedOnHeld);
    }
    const key = dedupeKey(raw);
    if (seenPairs.has(key)) throw new Error(owner + ' が同一の反応として重複: ' + seenPairs.get(key));
    seenPairs.set(key, raw.id);
    if (normalPairKeys.has(pairKey(raw)) && !raw.note) {
      throw new Error(owner + ' が通常の確認済み反応と同じ組合せ（条件が異なる場合は note で理由を示す）');
    }
    if (heldPairKeys.has(pairKey(raw)) && !raw.basedOnHeld && !raw.note) {
      throw new Error(owner + ' が保留反応と同じ組合せ（新根拠か note が必要）');
    }

    const typeLabel = (source.types[raw.type] && source.types[raw.type].label) ||
      (academicTypes[raw.type] && academicTypes[raw.type].label);
    const equation = raw.equation ? projectAcademicEquation(raw.equation, raw, {
      compounds: source.compounds,
      species: species
    }) : planAcademicEquation(raw, verification, compoundById);
    const regions = new Set();
    raw.substrates.concat(raw.products).forEach((id) => regions.add(compoundById.get(id).region));

    const record = {
      id: raw.id,
      type: raw.type,
      typeLabel: typeLabel,
      state: 'academic',
      academic: true,
      tier: 'academic',
      evidenceKind: raw.evidenceKind,
      stepKind: raw.stepKind,
      steps: raw.steps || [],
      scope: raw.scope,
      basedOnHeld: raw.basedOnHeld || null,
      substrates: raw.substrates,
      reagents: raw.reagents || [],
      products: raw.products,
      productNote: raw.productNote || '',
      conditions: raw.conditions,
      note: raw.note || '',
      sources: verification.map((entry) => publicSourceOf(entry, owner)),
      cross: regions.size > 1,
      equation: equation
    };
    // 高校標準から昇格した行だけが持つ任意メタデータ。既存の学術行の出力は変えない。
    if (raw.educationLevel) record.educationLevel = raw.educationLevel;
    reactions.push(record);
  });
  reactions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 専用レイアウト（layout version 2）。通常 427 物質の座標は読むだけで、ここでは
  // 「アカデミック表示専用」の座標一式を作る。通常データ（site/app11/data.js）は変えない。
  const normalForLayout = D.compounds.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    w: c.w || layout.nodeW,
    h: c.h || layout.nodeH,
    region: c.region,
    regionIndex: c.regionIndex,
    incoming: c.incoming,
    outgoing: c.outgoing
  }));
  const allReactionInputs = D.reactions.map((r) => ({
    id: r.id,
    tier: r.tier,
    typeLabel: r.typeLabel || r.type,
    substrates: r.substrates,
    products: r.products
  })).concat(reactions.map((r) => ({
    id: r.id,
    tier: 'academic',
    typeLabel: r.typeLabel || r.type,
    substrates: r.substrates,
    products: r.products
  })));
  const placed = N.buildLayout({
    compounds: normalForLayout,
    reactions: allReactionInputs,
    classMap: {
      frame: classMap.frame,
      nodes: classMap.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }))
    },
    nodeW: layout.nodeW,
    nodeH: layout.nodeH,
    opts: { spacing: options.academicSpacing || 1.06, netGrow: options.academicNetGrow }
  });

  placed.warnings.forEach((w) => warnings.push(w));

  // ラベル後処理: マーカー座標・経路・物質座標は動かさず、ラベル矩形だけを
  // 実描画線（stored + drawn）に沿って改善する。共通ソルバの出力は center 規約。
  const reactionMeta = {};
  allReactionInputs.forEach((r) => {
    reactionMeta[r.id] = {
      tier: r.tier,
      typeLabel: r.typeLabel,
      substrates: r.substrates,
      products: r.products
    };
  });
  const labelReport = options.skipLabels ? null : Q.applyAcademicLabelLayout(placed, classMap, reactionMeta, {
    nodeW: layout.nodeW,
    nodeH: layout.nodeH,
    priority: LABEL_PRIORITY,
    repairPasses: 1
  });

  // B helper による academic の foreign route 局所救済 → ラベル/leader 再検証。
  const routeRepair = options.skipLabels ? null : repairAcademicRoutes(placed, classMap, reactionMeta);
  if (routeRepair && routeRepair.labelSummary) {
    labelReport.summary = routeRepair.labelSummary;
  }

  // 交差低減: 端点・座標・事実はそのままに、辺の点列だけを交差の少ない候補へ差し替える。
  // 差し替え後はラベルを実描画線へ追従させ、最終経路から hard/交差を測り直す。
  const crossingRelief = options.skipLabels ? null : relieveAcademicCrossings(placed, classMap, reactionMeta);
  if (crossingRelief && crossingRelief.labelSummary) {
    labelReport.summary = crossingRelief.labelSummary;
  }

  // 最終計測: reroute 後の実ジオメトリで衝突と交差を数え直す（build 時の値は reroute 前なので使わない）。
  const finalRoutes = {};
  for (const key of Object.keys(placed.normalRoutes || {})) finalRoutes[key] = placed.normalRoutes[key];
  for (const key of Object.keys(placed.routes || {})) finalRoutes[key] = placed.routes[key];
  const classRectsFinal = [];
  if (classMap) {
    if (classMap.frame) classRectsFinal.push(classMap.frame);
    (classMap.nodes || []).forEach((node) => classRectsFinal.push(node));
  }
  const finalCollisions = X.finalCollisions({
    routes: finalRoutes,
    markers: Object.assign({}, placed.normalMarkers || {}, placed.markers || {}),
    positions: placed.positions,
    classRects: classRectsFinal
  });
  Object.assign(placed.stats.collisions, finalCollisions.counts);
  placed.stats.crossings = finalCollisions.crossings;
  placed.stats.crossingRelief = crossingRelief ? {
    definition: crossingRelief.definition,
    evaluated: crossingRelief.evaluated,
    changed: crossingRelief.changed,
    reverted: crossingRelief.reverted,
    before: crossingRelief.before,
    after: crossingRelief.after
  } : null;
  const hardKeys = [
    'nodeNodeOverlaps', 'labelLabelOverlaps', 'labelNodeOverlaps', 'labelClassMapOverlaps',
    'markerNodeOverlaps', 'markerMarkerOverlaps',
    'routeNodePenetrations', 'routeLabelPenetrations', 'routeMarkerPenetrations'
  ];
  const hardLeft = hardKeys.filter((key) => placed.stats.collisions[key] !== 0);
  if (hardLeft.length) {
    throw new Error('学術レイアウト: 衝突が残る: ' +
      hardLeft.map((key) => key + '=' + placed.stats.collisions[key]).join(', '));
  }

  reactions.forEach((r) => {
    const marker = placed.markers[r.id];
    if (!marker) throw new Error('アカデミック反応のマーカーがない: ' + r.id);
    const edges = [];
    const pushEdge = (dir, id) => {
      const key = r.id + '|' + dir + '|' + id;
      const route = placed.routes[key];
      if (!route) {
        warnings.push({ id: key, kind: 'card-only' });
        return;
      }
      edges.push({ dir: dir, id: id, tier: 'academic', points: route.points, gaps: [], bridges: [] });
    };
    r.substrates.forEach((id) => pushEdge('in', id));
    r.products.forEach((id) => pushEdge('out', id));
    r.x = marker.x;
    r.y = marker.y;
    r.label = marker.label;
    r.edges = edges;
  });

  const academicCount = reactions.length;
  const academicConnected = new Set();
  reactions.forEach((r) => r.substrates.concat(r.products).forEach((id) => academicConnected.add(id)));
  const normalIsolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0);
  const newlyConnected = normalIsolated.filter((c) => academicConnected.has(c.id));
  const stillIsolated = normalIsolated.length - newlyConnected.length;
  const drawnIds = new Set(Object.keys(placed.routes).map((key) => placed.routes[key].compound));
  const newlyDrawn = newlyConnected.filter((c) => drawnIds.has(c.id)).length;
  const reactionsWithoutIncoming = reactions.filter((r) => !r.edges.some((e) => e.dir === 'in')).length;
  const reactionsWithoutOutgoing = reactions.filter((r) => !r.edges.some((e) => e.dir === 'out')).length;
  const cardOnlyCount = allReactionInputs
    .filter((r) => r.tier === 'academic')
    .reduce((n, r) => n + r.substrates.length + r.products.length, 0) - Object.keys(placed.routes).length;

  // アカデミック反応だけの弱連結成分（通常ネットワークとは別に数える）。
  const parent = new Map();
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; }
    return root;
  };
  academicConnected.forEach((id) => parent.set(id, id));
  reactions.forEach((r) => {
    const all = r.substrates.concat(r.products);
    for (let i = 1; i < all.length; i++) {
      const a = find(all[0]);
      const b = find(all[i]);
      if (a !== b) parent.set(a, b);
    }
  });
  const components = new Set(academicConnected.has ? [...academicConnected].map(find) : []).size;

  const evidenceCount = {};
  EVIDENCE_KINDS.forEach((kind) => { evidenceCount[kind] = 0; });
  const stepCount = {};
  STEP_KINDS.forEach((kind) => { stepCount[kind] = 0; });
  reactions.forEach((r) => {
    evidenceCount[r.evidenceKind] += 1;
    stepCount[r.stepKind] += 1;
  });

  const meta = {
    version: 1,
    generatedAt: '2026-11-17',
    verifiedAt: '2026-11-17',
    sourceBook: doc.sourceBook || 'OpenStax Organic Chemistry (McMurry)',
    title: doc.title || 'アカデミック（大学レベルの追加反応）',
    scopeNote: doc.scopeNote || '',
    tierLabel: '大学レベル',
    academicReactionCount: academicCount,
    typeCount: Object.keys(academicTypes).length,
    evidenceCount: evidenceCount,
    stepCount: stepCount,
    newlyConnectedCount: newlyConnected.length,
    stillIsolatedCount: stillIsolated,
    academicComponents: components,
    drawnConnectedCount: drawnIds.size,
    drawnNewlyConnectedCount: newlyDrawn,
    drawnRouteCount: Object.keys(placed.routes).length,
    cardOnlyCount: cardOnlyCount,
    reactionsWithoutIncoming: reactionsWithoutIncoming,
    reactionsWithoutOutgoing: reactionsWithoutOutgoing,
    warnings: warnings,
    enabled: academicCount > 0,
    normalCounts: {
      compoundCount: D.meta.compoundCount,
      reactionCount: D.meta.reactionCount,
      heldReactionCount: D.meta.heldReactionCount
    }
  };

  return {
    meta: meta,
    base: {
      normalVersion: D.meta.version,
      normalGeneratedAt: D.meta.generatedAt,
      compoundCount: D.compounds.length,
      reactionCount: D.reactions.length,
      heldReactionCount: D.meta.heldReactionCount,
      nodeHash: academicBaseHash(D.compounds),
      priorityHash: D.meta.priorityHash
    },
    types: academicTypes,
    reactions: reactions,
    labelReport: labelReport,
    routeRepair: routeRepair,
    crossingRelief: crossingRelief,
    layout: {
      version: placed.version,
      positions: placed.positions,
      normalMarkers: placed.normalMarkers,
      normalRoutes: placed.normalRoutes,
      markers: placed.markers,
      routes: placed.routes,
      canvas: placed.canvas,
      regionFocus: placed.regionFocus,
      stats: placed.stats,
      warnings: placed.warnings
    }
  };
}

// 通常の projectEquation は P の係数を n/2n に限定する。通常データは変えず、
// アカデミックの高分子・共重合・可変置換だけ、係数トークンを厳密なホワイトリストで許可する。
const ACADEMIC_P_COEFS = ['n', 'm', 'p', 'd', 'dn', '2n', '3n'];

function projectAcademicEquation(raw, reaction, ctx) {
  const owner = 'アカデミック反応 ' + reaction.id + ' の反応式';
  if (!raw || raw.mode !== 'P') {
    // B / N / T は通常の検証（元素・電荷収支、未知ID）をそのまま使う。
    return S.projectEquation(raw, reaction, ctx);
  }
  const arrow = raw.arrow || 'to';
  if (arrow !== 'to' && arrow !== 'equilibrium') throw new Error(owner + ' の矢印が不正');
  const text = (value, at) => {
    if (value == null) return '';
    const s = String(value).trim();
    if (s.length > 160) throw new Error(at + ' が長すぎる');
    return s;
  };
  const resolveSide = (items, side) => {
    if (!Array.isArray(items) || !items.length) throw new Error(owner + ' の' + side + 'がない');
    return items.map((item, index) => {
      const at = owner + ' の' + side + '#' + (index + 1);
      const coef = item.coef == null ? 1 : item.coef;
      const ok = (typeof coef === 'number' && Number.isInteger(coef) && coef >= 1 && coef <= 99) ||
        (typeof coef === 'string' && ACADEMIC_P_COEFS.indexOf(coef) !== -1);
      if (!ok) throw new Error(at + ' の係数が不正（1〜99 か ' + ACADEMIC_P_COEFS.join('/') + '）: ' + coef);
      if (item.text != null) {
        const value = text(item.text, at + ' の text');
        if (!value) throw new Error(at + ' の text が空');
        return { kind: 'text', text: value, coef: coef };
      }
      if (item.compound != null) {
        const c = ctx.compounds.get(item.compound);
        if (!c) throw new Error(at + ' の物質IDが未収録: ' + item.compound);
        if (!c.formula) throw new Error(at + ' の物質に化学式がない: ' + item.compound);
        return { kind: 'compound', id: item.compound, coef: coef, formula: c.formula, label: c.label || '' };
      }
      const sp = ctx.species.get(item.species);
      if (!sp) throw new Error(at + ' の無機speciesが未定義: ' + item.species);
      return { kind: 'species', id: item.species, coef: coef, formula: sp.formula, charge: sp.charge, label: sp.name };
    });
  };
  const left = resolveSide(raw.left, '左辺');
  const right = resolveSide(raw.right, '右辺');
  const all = left.concat(right);
  if (!all.some((item) => typeof item.coef === 'string' && item.coef !== '' && item.coef !== 'd')) {
    throw new Error(owner + ' の重合模式式に繰り返し係数（n など）がない');
  }
  if (all.some((item) => item.kind === 'text') && raw.mode !== 'T' && raw.mode !== 'P') {
    throw new Error(owner + ' の text は T / P だけで使う');
  }
  return {
    mode: 'P',
    modeLabel: S.EQUATION_MODE_LABELS.P,
    title: text(raw.title, owner + ' のtitle'),
    arrow: arrow,
    above: text(raw.above, owner + ' のabove'),
    below: text(raw.below, owner + ' のbelow'),
    explanation: text(raw.explanation, owner + ' のexplanation'),
    sources: (raw.verification || []).map((entry) => S.publicSource(entry)),
    left: left,
    right: right,
    variants: []
  };
}

// 明示の equation がない場合も、通常カードと同じ描画器で読める T（構造変換図）を持つ。
function planAcademicEquation(raw, verification, compoundById) {
  const itemOf = (id, coef) => {
    const c = compoundById.get(id);
    return { kind: 'compound', id: id, coef: coef, formula: c.formula || '', label: c.label || '' };
  };
  const left = raw.substrates.map((id, i) => itemOf(id, raw.substrateCoefs[i] || 1));
  const right = raw.products.map((id, i) => itemOf(id, raw.productCoefs[i] || 1));
  const verificationPublic = verification.map((entry) => ({ source: entry.book, section: entry.section, date: entry.checkedAt }));
  const base = {
    mode: 'T',
    arrow: 'to',
    title: '構造変換図',
    explanation: '大学レベルの一般則に基づく構造変換です。係数・副生成物・中間体は省略しています。',
    verification: verificationPublic
  };
  if (raw.variants) {
    return Object.assign({}, base, {
      arrow: 'equilibrium',
      explanation: '代表的な競合生成物のうち1つを示す構造変換です。混合比・全生成物は主張しません。',
      left: left,
      right: [],
      variants: raw.products.map((id, i) => ({
        label: '生成物' + (i + 1) + '（代表）',
        arrow: 'to',
        left: left,
        right: [itemOf(id, raw.productCoefs[i] || 1)]
      }))
    });
  }
  if (!right.length) {
    // 生成物が文字列でしか示せない反応は、左辺の構造変換だけを式にし、右辺は text 1件。
    return Object.assign({}, base, {
      left: left,
      right: [{ kind: 'text', text: raw.productNote || '生成物の記載なし', coef: 1 }]
    });
  }
  return Object.assign({}, base, { left: left, right: right });
}

function renderAcademicData(data) {
  const lines = [];
  lines.push('/*');
  lines.push(' * 有機反応マップ（試験版）— アカデミック（大学レベルの追加反応）データ');
  lines.push(' *');
  lines.push(' * このファイルは scripts/app11/build-academic-data.cjs が生成する。直接編集しない。');
  lines.push(' * 正本は site-src/app11/academic-reactions.json。');
  lines.push(' * 通常 427 物質を参照する overlay で、compounds 配列は持たない。');
  lines.push(' * 通常の data.js / layout.json / routes.json は変更しない。');
  lines.push(' * 資料の URL は正本だけに残し、このファイルには資料名・節・確認日だけを出す。');
  lines.push(' */');
  lines.push('(function (root, factory) {');
  lines.push("  if (typeof module === 'object' && module.exports) module.exports = factory();");
  lines.push('  else root.RPMapAcademic = factory();');
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  lines.push("  'use strict';");
  lines.push('  var META = ' + JSON.stringify(data.meta) + ';');
  lines.push('  var BASE = ' + JSON.stringify(data.base) + ';');
  lines.push('  var TYPES = ' + JSON.stringify(data.types) + ';');
  lines.push('  var REACTIONS = [');
  data.reactions.forEach((r) => lines.push('    ' + JSON.stringify(r) + ','));
  lines.push('  ];');
  lines.push('  var LAYOUT = ' + JSON.stringify(data.layout) + ';');
  lines.push('  return { meta: META, base: BASE, types: TYPES, reactions: REACTIONS, layout: LAYOUT };');
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const data = build();
  const output = renderAcademicData(data);
  if (check) {
    const current = fs.existsSync(OUT_DATA) ? fs.readFileSync(OUT_DATA, 'utf8') : '';
    if (current !== output) {
      console.error('academic-data.js が最新ではありません: node scripts/app11/build-academic-data.cjs を実行してください。');
      process.exit(1);
    }
    console.log('academic-data.js は最新です（アカデミック反応 ' + data.meta.academicReactionCount +
      '、ルート ' + Object.keys(data.layout.routes).length + '、warnings ' + data.meta.warnings.length + '）。');
    return;
  }
  fs.writeFileSync(OUT_DATA, output, 'utf8');
  console.log('生成: site/app11/academic-data.js（アカデミック反応 ' + data.meta.academicReactionCount +
    '、種別 ' + data.meta.typeCount + '、経路 ' + Object.keys(data.layout.routes).length +
    '、通常 ' + Object.keys(data.layout.normalRoutes).length + '、card-only ' + data.meta.cardOnlyCount + '）');
  if (data.labelReport) {
    console.log('ラベル: direct ' + data.labelReport.summary.direct + ' / leader ' + data.labelReport.summary.leader +
      ' / unresolved ' + data.labelReport.summary.unresolved + '（変更 ' + data.labelReport.summary.changed + '）');
  }
  if (data.routeRepair) {
    console.log('学術route救済: targets ' + data.routeRepair.targets + ' / changed ' + data.routeRepair.changed.length +
      ' / 残 ' + (data.routeRepair.remaining || []).length + ' / 不正leader ' + data.routeRepair.invalidLeaders +
      ' / label-line貫通 ' + (data.routeRepair.labelLineHits == null ? '-' : data.routeRepair.labelLineHits));
  }
  if (data.crossingRelief) {
    const relief = data.crossingRelief;
    console.log('交差低減: 評価 ' + relief.evaluated + ' 辺 / 差し替え ' + relief.changed +
      ' / 差し戻し ' + relief.reverted +
      ' / 交差 ' + relief.before.crossings + ' → ' + relief.after.crossings +
      '（反応違い ' + relief.before.crossingsDifferentReaction + ' → ' + relief.after.crossingsDifferentReaction + '）' +
      ' / 総延長 ' + relief.before.length + ' → ' + relief.after.length);
  }
  const finalStats = data.layout.stats;
  if (finalStats && finalStats.crossings) {
    console.log('最終計測: 交差(raw) ' + finalStats.crossings.raw +
      ' / 反応違い ' + finalStats.crossings.differentReaction +
      ' / 総延長 ' + finalStats.after.combined.total + ' / p95 ' + finalStats.after.combined.p95);
  }
}

if (require.main === module) main();

module.exports = { build, renderAcademicData, academicBaseHash, projectAcademicEquation, ACADEMIC_PATH, OUT_DATA };
