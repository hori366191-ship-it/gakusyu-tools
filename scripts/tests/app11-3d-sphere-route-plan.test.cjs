/**
 * app11-3d-sphere — 実 plan 辺（solid）と合成破線の統合テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-route-plan.test.cjs
 *
 * 対象: site/app11/3d/sphere-render.js の buildSelectedXray と
 *       site/app11/3d/renderer.js の plan Scene（実描画・バッチ・矢印）。
 *
 * ねらい:
 *   - 実カード同士を結ぶ solid は残し、破線を重ねない
 *   - one-virtual で solid が実カード縁から usable 出口まで連続するなら、
 *     solid を残し「同じ出口から先」の破線だけを足す（矢印は二重にしない）
 *   - usable 内で連続しない / 両端仮想の solid は抑制し、1 本の全長破線にする
 *   - 抑制後は plan.edgeBatches も組み直され、実描画に重複ストロークが残らない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'site', 'app11', '3d');
const PUB = path.join(ROOT, 'site', 'app11', '3d', 'projection.js');

const Base = require(PUB);
const C = require(path.join(LAB, 'sphere-camera.js'))(Base);
const L = require(path.join(LAB, 'sphere-layout.js'));
const SR = require(path.join(LAB, 'sphere-render.js'));
const S = require(path.join(ROOT, 'site', 'app11', '3d', 'scene-model.js'));

const projectionPath = require.resolve(PUB);
const rendererPath = require.resolve(path.join(ROOT, 'site', 'app11', '3d', 'renderer.js'));
const cachedProjection = require.cache[projectionPath];
const originalExports = cachedProjection ? cachedProjection.exports : null;
if (cachedProjection) cachedProjection.exports = C;
delete require.cache[rendererPath];
const R = require(rendererPath);
if (cachedProjection && originalExports) cachedProjection.exports = originalExports;

const data = require(path.join(ROOT, 'site', 'app11', 'data.js'));
const academic = require(path.join(ROOT, 'site', 'app11', '3d', 'academic-facts.js'));
const groups = require(path.join(ROOT, 'site', 'app11', 'reaction-groups.js'));
const model = S.createModel(data, academic, groups);
const layout = L.buildSphereLayout(data.compounds);

const PHONE = { viewport: { width: 390, height: 844 }, usable: { x: 0, y: 120, width: 390, height: 614 }, exclusions: [] };
const TABLET = { viewport: { width: 1024, height: 1366 }, usable: { x: 0, y: 120, width: 634, height: 1120 }, exclusions: [{ x: 644, y: 120, width: 380, height: 1120 }] };
const DESKTOP = { viewport: { width: 1440, height: 900 }, usable: { x: 0, y: 120, width: 1040, height: 670 }, exclusions: [{ x: 1040, y: 120, width: 400, height: 670 }] };

function endpointsFor(selectedId) {
  const ids = Object.create(null);
  ids[selectedId] = true;
  model.groupsForCompound(selectedId, 'academic').forEach((group) => {
    group.substrateIds.concat(group.productIds).forEach((id) => {
      if (model.byId[id]) ids[id] = true;
    });
  });
  return ids;
}

function makeScene(selectedId, scene, mode, cameraOptions, frame) {
  const keep = endpointsFor(selectedId);
  const opts = Object.assign({ azimuth: 0, elevation: 0, fov: 72 }, cameraOptions || {});
  let camera = mode === 'inside'
    ? C.createInsideCamera(layout.center, layout.radius, opts)
    : C.createOutsideCamera(layout.center, layout.radius, opts);
  if (frame) {
    camera = C.framePoint(camera, layout.points[selectedId], layout.center,
      scene.usable, scene.viewport, { radius: layout.radius });
  }
  const visible = SR.visibleLayout(model, layout, camera, {
    center: layout.center,
    keepIds: keep
  });
  const plan = R.planScene({
    model: model,
    layout: visible,
    camera: camera,
    viewport: scene.viewport,
    layer: 'academic',
    query: '',
    selectedId: selectedId,
    showUnconnectedOnly: false,
    region: null,
    exclusions: scene.exclusions,
    focusPhase: 'final',
    focusFade: 0
  });
  return { selectedId, scene, camera, plan };
}

function recordFor(xray, from, to) {
  return xray.edges.find((record) => record.from === from && record.to === to);
}

function pathOf(record) {
  return record.points && record.points.length ? record.points : [
    { x: record.x1, y: record.y1 },
    { x: record.x2, y: record.y2 }
  ];
}

function inside(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function onRectBorder(point, rect, tolerance) {
  const eps = tolerance == null ? 1.5 : tolerance;
  const withinX = point.x >= rect.x - eps && point.x <= rect.x + rect.width + eps;
  const withinY = point.y >= rect.y - eps && point.y <= rect.y + rect.height + eps;
  return (withinX && (Math.abs(point.y - rect.y) <= eps ||
    Math.abs(point.y - (rect.y + rect.height)) <= eps)) ||
    (withinY && (Math.abs(point.x - rect.x) <= eps ||
      Math.abs(point.x - (rect.x + rect.width)) <= eps));
}

// 連続可視ラン。単なる「合計インク」ではなく、途中でカード/パネルに
// 遮られずに続く最大長を測る（孤立した rim stub を通さない）。
function longestVisibleRun(record, blockers) {
  const path = pathOf(record);
  let best = 0;
  let run = 0;
  for (let s = 1; s < path.length; s++) {
    const a = path[s - 1];
    const b = path[s];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 0)) continue;
    const n = Math.max(8, Math.ceil(len / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (blockers.some((rect) => inside(x, y, rect))) {
        run = 0;
      } else {
        run += len / (n + 1);
        best = Math.max(best, run);
      }
    }
  }
  return best;
}

function totalPath(record) {
  const path = pathOf(record);
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

function createRecordingContext() {
  const strokes = [];
  const fills = [];
  let dash = [];
  let current = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    beginPath() { current = []; },
    moveTo(x, y) { current.push({ x, y }); },
    lineTo(x, y) { current.push({ x, y }); },
    closePath() {},
    stroke() {
      strokes.push({
        points: current.slice(),
        dash: dash.slice(),
        lineWidth: this.lineWidth,
        strokeStyle: this.strokeStyle
      });
    },
    fill() { fills.push({ points: current.slice(), fillStyle: this.fillStyle }); },
    setLineDash(value) { dash = (value || []).slice(); },
    fillRect() {},
    strokeRect() {},
    fillText() {}
  };
  return { ctx, strokes, fills };
}

function drawDashes(xray, viewport) {
  const rec = createRecordingContext();
  SR.drawXray(rec.ctx, xray, viewport);
  const dashed = rec.strokes.filter((stroke) => stroke.dash.length === 2 &&
    stroke.dash[0] === 6 && stroke.dash[1] === 5);
  const arrows = rec.fills.filter((fill) => fill.points.length === 3);
  return { rec, dashed, arrows };
}

function planHasEdge(plan, id) {
  if (plan.edges.some((edge) => edge.id === id)) return true;
  return plan.edgeBatches.some((batch) => batch.edges.some((edge) => edge.id === id));
}

function assertFinitePath(record) {
  pathOf(record).forEach((point) => {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y),
      '非有限座標: ' + record.id);
  });
}

test('[route-plan] benzene→BHC: plan 辺が無いので全長ダッシュのみ、実描画も 1 本', () => {
  const scene = makeScene('benzene', PHONE, 'inside', { azimuth: 127.749, elevation: 0, fov: 72 }, true);
  const beforePlan = planHasEdge(scene.plan, 'group:[["benzene"],["hexachlorocyclohexane"]]|benzene|hexachlorocyclohexane');
  assert.equal(beforePlan, false, '前提: fix 前から plan 辺がある');
  const xray = SR.buildSelectedXray(model, layout, scene.camera, scene.plan, {
    selectedId: 'benzene', layer: 'academic', viewport: scene.scene.viewport,
    center: layout.center, exclusions: scene.scene.exclusions, usableRect: scene.scene.usable
  });
  const record = recordFor(xray, 'benzene', 'hexachlorocyclohexane');
  assert.ok(record);
  assert.equal(record.missingPlan, true);
  assert.equal(record.endToEnd, true);
  assert.equal(record.suppressPlanEdge, false);
  assert.ok(totalPath(record) > 150, 'rim stub ではなく全長でない');
  const benzeneCard = scene.plan.nodes.find((n) => n.id === 'benzene').rect;
  const bhcCard = xray.virtuals.find((v) => v.id === 'hexachlorocyclohexane').card;
  const path = pathOf(record);
  assert.ok(onRectBorder(path[0], benzeneCard), '始点が benzene カード縁でない');
  assert.ok(onRectBorder(path[path.length - 1], bhcCard), '終点が BHC カード縁でない');
  const blockers = xray.virtuals.map((v) => v.card).concat(scene.scene.exclusions);
  assert.ok(longestVisibleRun(record, blockers) >= totalPath(record) * 0.7,
    '連続可視ランが短すぎる（孤立 stub）');
  const drawn = drawDashes(xray, scene.scene.viewport);
  assert.equal(drawn.dashed.length, xray.edges.length, '破線の数が記録と一致しない');
  assert.ok(drawn.arrows.length >= 1, '全長ダッシュの矢印がない');
});

test('[route-plan] tablet ethanol→acetic-acid: solid を残し、同じ出口から先だけ破線（矢印は 1 本）', () => {
  const scene = makeScene('ethanol', TABLET, 'outside', { azimuth: 45, elevation: -30, fov: 22 }, false);
  const edgeId = 'group:[["ethanol"],["acetic-acid"]]|ethanol|acetic-acid';
  assert.equal(planHasEdge(scene.plan, edgeId), true, '前提: 実線がない');
  const xray = SR.buildSelectedXray(model, layout, scene.camera, scene.plan, {
    selectedId: 'ethanol', layer: 'academic', viewport: TABLET.viewport,
    center: layout.center, exclusions: TABLET.exclusions, usableRect: TABLET.usable
  });
  const record = recordFor(xray, 'ethanol', 'acetic-acid');
  assert.ok(record);
  assert.equal(record.continuation, true, 'solid の続きになっていない');
  assert.equal(record.endToEnd, false);
  assert.equal(record.suppressPlanEdge, false);
  assert.equal(record.suppressArrow, true, '破線側に矢印を二重化している');
  // 実 plan 辺とバッチは残る。
  assert.equal(planHasEdge(scene.plan, edgeId), true, '実線が消えている');
  const path = pathOf(record);
  const virtual = xray.virtuals.find((v) => v.id === 'acetic-acid') ||
    xray.virtuals.find((v) => v.id === 'ethanol');
  assert.ok(virtual, '仮想端点がない');
  assert.ok(onRectBorder(path[0], virtual.card) || onRectBorder(path[path.length - 1], virtual.card),
    '破線が仮想カード縁に接していない');
  // 反対端は solid の usable 出口（境界）で、実カードまで二重に描いていない。
  const usable = TABLET.usable;
  const exit = onRectBorder(path[0], usable, 2) ? path[0] : path[path.length - 1];
  assert.ok(onRectBorder(exit, usable, 2), 'solid 出口から始まっていない');
  const blockers = xray.virtuals.map((v) => v.card).concat(TABLET.exclusions);
  assert.ok(longestVisibleRun(record, blockers) >= totalPath(record) * 0.7,
    '続きの破線が分断されている');
  const drawn = drawDashes(xray, TABLET.viewport);
  const continuationDraw = drawn.dashed.find((stroke) => stroke.points.length === path.length &&
    Math.abs(stroke.points[0].x - path[0].x) < 1e-6);
  assert.ok(continuationDraw, '破線が実描画されていない');
  // この破線の終点に矢印を出さない（solid 側の 1 本だけ）。
  const tip = path[path.length - 1];
  const duplicate = drawn.arrows.filter((fill) =>
    Math.hypot(fill.points[0].x - tip.x, fill.points[0].y - tip.y) < 1e-6);
  assert.equal(duplicate.length, 0, '破線側に矢印が重複している');
  assertFinitePath(record);
});

test('[route-plan] tablet acetanilide→aniline / mobile bromoethane→butanone: 連続しない solid を抑制し全長破線', () => {
  const cases = [
    {
      label: 'acetanilide tablet',
      selectedId: 'acetanilide', scene: TABLET, mode: 'outside',
      camera: { azimuth: 0, elevation: 0, fov: 22 }, frame: false,
      pair: ['acetanilide', 'aniline'],
      edgeId: 'group:[["acetanilide"],["acetic-acid","aniline"]]|acetanilide|aniline'
    },
    {
      label: 'bromoethane mobile',
      selectedId: 'bromoethane', scene: PHONE, mode: 'outside',
      camera: { azimuth: -35, elevation: 18 }, frame: false,
      pair: ['acetonitrile', 'butanone'],
      edgeId: 'group:[["acetonitrile","bromoethane"],["butanone"]]|acetonitrile|butanone'
    }
  ];
  cases.forEach((item) => {
    const scene = makeScene(item.selectedId, item.scene, item.mode, item.camera, item.frame);
    assert.equal(planHasEdge(scene.plan, item.edgeId), true, item.label + ': 前提の実線がない');
    const xray = SR.buildSelectedXray(model, layout, scene.camera, scene.plan, {
      selectedId: item.selectedId, layer: 'academic', viewport: item.scene.viewport,
      center: layout.center, exclusions: item.scene.exclusions,
      usableRect: item.scene.usable
    });
    const record = recordFor(xray, item.pair[0], item.pair[1]);
    assert.ok(record, item.label + ': 記録がない');
    assert.equal(record.suppressPlanEdge, true, item.label + ': solid を抑制していない');
    assert.equal(record.endToEnd, true, item.label + ': 全長破線でない');
    assert.equal(record.missingPlan, false);
    assert.equal(planHasEdge(scene.plan, item.edgeId), false,
      item.label + ': 抑制後も plan/バッチに実線が残る');
    assertFinitePath(record);
    const path = pathOf(record);
    const blockers = xray.virtuals.map((v) => v.card).concat(item.scene.exclusions);
    assert.ok(longestVisibleRun(record, blockers) >= totalPath(record) * 0.6,
      item.label + ': 全長破線が連続していない');
    assert.ok(path.length >= 2);
    const drawn = drawDashes(xray, item.scene.viewport);
    assert.ok(drawn.dashed.length > 0, item.label + ': 破線が描かれていない');
  });
});

test('[route-plan] 両端仮想 terephthalic-acid→pet: solid を抑制し破線だけ', () => {
  const scene = makeScene('terephthalic-acid', TABLET, 'inside',
    { azimuth: 45, elevation: 30, fov: 40 }, false);
  const edgeId = 'group:[["ethylene-glycol","terephthalic-acid"],["pet"]]|terephthalic-acid|pet';
  assert.equal(planHasEdge(scene.plan, edgeId), true, '前提: 両端仮想の実線がない');
  const xray = SR.buildSelectedXray(model, layout, scene.camera, scene.plan, {
    selectedId: 'terephthalic-acid', layer: 'academic', viewport: TABLET.viewport,
    center: layout.center, exclusions: TABLET.exclusions, usableRect: TABLET.usable
  });
  const record = recordFor(xray, 'terephthalic-acid', 'pet');
  assert.ok(record);
  assert.equal(record.fromVirtual, true);
  assert.equal(record.toVirtual, true);
  assert.equal(record.endToEnd, true);
  assert.equal(record.suppressPlanEdge, true);
  assert.equal(planHasEdge(scene.plan, edgeId), false, '両端仮想の実線が残っている');
  const fromCard = xray.virtuals.find((v) => v.id === 'terephthalic-acid').card;
  const toCard = xray.virtuals.find((v) => v.id === 'pet').card;
  const path = pathOf(record);
  assert.ok(onRectBorder(path[0], fromCard), 'from 仮想カード縁でない');
  assert.ok(onRectBorder(path[path.length - 1], toCard), 'to 仮想カード縁でない');
  const drawn = drawDashes(xray, TABLET.viewport);
  const tip = path[path.length - 1];
  const arrowsAtTip = drawn.arrows.filter((fill) =>
    Math.hypot(fill.points[0].x - tip.x, fill.points[0].y - tip.y) < 1e-6);
  assert.equal(arrowsAtTip.length, 1, '両端仮想の矢印が 1 本でない');
  assertFinitePath(record);
});

test('[route-plan] 実カード同士の solid は残し、破線を足さない', () => {
  const scene = makeScene('acetic-acid', PHONE, 'outside', { azimuth: -35, elevation: 18 }, false);
  const bothActual = scene.plan.edges.find((edge) => {
    const a = scene.plan.nodes.find((n) => n.id === edge.from);
    const b = scene.plan.nodes.find((n) => n.id === edge.to);
    return a && a.card && b && b.card;
  });
  assert.ok(bothActual, '両端実カードの実線がない');
  const xray = SR.buildSelectedXray(model, layout, scene.camera, scene.plan, {
    selectedId: 'acetic-acid', layer: 'academic', viewport: PHONE.viewport,
    center: layout.center, exclusions: PHONE.exclusions, usableRect: PHONE.usable
  });
  assert.equal(xray.edges.some((r) => r.id === bothActual.id), false,
    '実カード同士の辺に破線を足している');
  assert.equal(planHasEdge(scene.plan, bothActual.id), true,
    '実カード同士の solid が消えている');
});
