/**
 * app11-3d-sphere — 選択解除時のフェードイン復帰の回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-reveal.test.cjs
 *
 * 対象: site/app11/3d/sphere-render.js の
 *       buildRevealSnapshot / applyReveal / revealCamera / revealDuration
 *
 * 方針:
 *   - 選択解除で全体表示へ戻すとき、直前に見えていなかったノード・辺だけを
 *     900ms（reduced-motion は 0ms）でフェードインする。
 *   - 直前に見えていた選択グラフは alpha 1 のまま（steady）。
 *   - フィルタ・検索の最終状態は変えない。カメラは app 側で補間（ここでは値のみ）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PUB = path.join(ROOT, 'site', 'app11', '3d', 'projection.js');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

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
const SELECTED = 'acetic-acid';
const LAYER = 'academic';
const VP = { width: 1440, height: 900 };
const RECT = { x: 0, y: 120, width: 1000, height: 700 };

function keepIds() {
  const ids = Object.create(null);
  ids[SELECTED] = true;
  model.groupsForCompound(SELECTED, LAYER).forEach((g) => {
    g.substrateIds.concat(g.productIds).forEach((id) => {
      if (model.byId[id]) ids[id] = true;
    });
  });
  return ids;
}

function camera() {
  return C.createOutsideCamera(layout.center, layout.radius, { azimuth: -35, elevation: 18 });
}

function planFor(selectedId, query, region) {
  const visible = SR.visibleLayout(model, layout, camera(), {
    center: layout.center,
    keepIds: selectedId ? keepIds() : null
  });
  return R.planScene({
    model: model,
    layout: visible,
    camera: camera(),
    viewport: VP,
    layer: LAYER,
    query: query || '',
    selectedId: selectedId,
    showUnconnectedOnly: false,
    region: region || null,
    exclusions: [{ x: 1040, y: 150, width: 400, height: 620 }],
    focusPhase: 'final',
    focusFade: 0
  });
}

test('[reveal] 直前に見えていなかったノード・辺だけが fade し、選択グラフは steady のまま', () => {
  const selectedPlan = planFor(SELECTED, '');
  const snapshot = SR.buildRevealSnapshot(selectedPlan);
  assert.ok(Object.keys(snapshot.nodes).length > 0, '選択グラフの snapshot が空');
  assert.ok(Object.keys(snapshot.edges).length > 0, '選択経路の snapshot が空');

  const full = planFor(null, '');
  const totalNodes = full.nodes.length;
  const totalEdges = full.edges.length;
  SR.applyReveal(full, snapshot, 0.25);

  assert.equal(full.fadeAlpha, 0.25);
  assert.ok(full.reveal.fadedNodes > 0, 'フェードインするノードがない');
  assert.ok(full.reveal.fadedEdges > 0, 'フェードインする辺がない');
  assert.ok(full.reveal.fadedNodes < totalNodes, '全ノードをフェードしている');
  assert.ok(full.reveal.fadedEdges < totalEdges, '全辺をフェードしている');

  // 直前に見えていたものは fade しない（alpha 1 のまま）。
  full.nodes.forEach((node) => {
    if (snapshot.nodes[node.id]) assert.equal(node.fade, false, '既存ノードが fade: ' + node.id);
  });
  full.edges.forEach((edge) => {
    if (snapshot.edges[edge.id]) assert.equal(edge.fade, false, '既存の辺が fade: ' + edge.id);
  });
  // 新しく出るものだけ fade。
  assert.ok(full.nodes.some((node) => node.fade && !snapshot.nodes[node.id]));
  assert.ok(full.edges.some((edge) => edge.fade && !snapshot.edges[edge.id]));

  // バッチにも fade 用と steady 用が両方ある（drawScene が alpha を掛ける）。
  assert.ok(full.edgeBatches.some((b) => b.fade), 'fade バッチがない');
  assert.ok(full.edgeBatches.some((b) => !b.fade), 'steady バッチがない');
});

test('[reveal] alpha を進めても steady/fade の分類は変わらず、fadeAlpha だけが動く', () => {
  const snapshot = SR.buildRevealSnapshot(planFor(SELECTED, ''));
  const full = planFor(null, '');
  SR.applyReveal(full, snapshot, 0.1);
  const faded = new Set(full.nodes.filter((n) => n.fade).map((n) => n.id));
  SR.applyReveal(full, snapshot, 0.8);
  assert.equal(full.fadeAlpha, 0.8);
  const faded2 = new Set(full.nodes.filter((n) => n.fade).map((n) => n.id));
  assert.deepEqual(Array.from(faded2).sort(), Array.from(faded).sort());
});

test('[reveal] フィルタ・検索の最終状態を変えない（fade は表示だけ）', () => {
  const query = '酢酸';
  const selectedPlan = planFor(SELECTED, '');
  const snapshot = SR.buildRevealSnapshot(selectedPlan);
  const full = planFor(null, query);
  const ids = full.nodes.map((n) => n.id).join('|');
  SR.applyReveal(full, snapshot, 0.5);
  assert.equal(full.query, query);
  assert.equal(full.searchActive, true);
  assert.equal(full.nodes.map((n) => n.id).join('|'), ids, '表示対象が変わった');
  assert.equal(full.fadeAlpha, 0.5);
});

test('[reveal] reduced-motion は 0ms、通常は 900ms', () => {
  assert.equal(SR.revealDuration(true), 0);
  assert.equal(SR.revealDuration(false), 900);
  assert.equal(SR.REVEAL_MS, 900);
});

test('[reveal] カメラは from→to を補間し、開始時にスナップしない', () => {
  const from = C.withUsableRect(camera(), RECT, VP);
  const to = C.withUsableRect(camera(), { x: 0, y: 0, width: VP.width, height: VP.height }, VP);
  assert.notEqual(from.screenOffset.x, to.screenOffset.x);
  const at0 = SR.revealCamera(from, to, 0);
  assert.ok(Math.abs(at0.screenOffset.x - from.screenOffset.x) < 1e-9, '開始で to へ飛んだ');
  const at1 = SR.revealCamera(from, to, 1);
  assert.ok(Math.abs(at1.screenOffset.x - to.screenOffset.x) < 1e-9);
  const mid = SR.revealCamera(from, to, 0.5);
  assert.ok(Math.abs(mid.screenOffset.x - from.screenOffset.x) > 1e-6);
  assert.ok(Math.abs(mid.screenOffset.x - to.screenOffset.x) > 1e-6);
  // 向き・距離は変えない。
  assert.ok(Math.abs(mid.azimuth - from.azimuth) < 1e-9);
  assert.ok(Math.abs(mid.distance - from.distance) < 1e-9);
});

test('[reveal] 古い reveal の fade フラグを snapshot に数えない（再選択・キャンセル時）', () => {
  const snapshot = SR.buildRevealSnapshot(planFor(SELECTED, ''));
  const full = planFor(null, '');
  SR.applyReveal(full, snapshot, 0.4);
  const fadedNow = full.nodes.filter((n) => n.fade);
  assert.ok(fadedNow.length > 0);
  // 進行中の plan をもう一度 snapshot にすると、fade 中のものは「見えていた」に含めない。
  const second = SR.buildRevealSnapshot(full);
  fadedNow.forEach((node) => {
    assert.ok(!second.nodes[node.id], 'fade 中のノードを steady と誤認: ' + node.id);
  });
  // 再選択で cancelReveal された後は、通常計画（fade なし）をそのまま使う。
  const fresh = planFor(SELECTED, '');
  assert.ok(fresh.nodes.every((n) => !n.fade));
});
