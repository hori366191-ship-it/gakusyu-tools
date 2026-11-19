/**
 * app11-3d-sphere — 表示計画（裏面カリング・球ガイド・選択）の回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-plan.test.cjs
 *
 * 対象:
 *   site/app11/3d/sphere-render.js（visibleLayout / guides）
 *   site/app11/3d/renderer.js（公開 renderer をそのまま使うことの確認）
 *
 * renderer は読み込み時の RP3DProjection を保持するため、テストでは
 * projection の require キャッシュを拡張版に差し替えてから読み直す。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const PUB3D = path.join(APP, '3d');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const D = require(path.join(APP, 'data.js'));
const A = require(path.join(PUB3D, 'academic-facts.js'));
const G = require(path.join(APP, 'reaction-groups.js'));
const S = require(path.join(PUB3D, 'scene-model.js'));
const L = require(path.join(LAB, 'sphere-layout.js'));
const SR = require(path.join(LAB, 'sphere-render.js'));

const baseProjection = require(path.join(PUB3D, 'projection.js'));
const extendCamera = require(path.join(LAB, 'sphere-camera.js'));
const P = extendCamera(baseProjection);

// renderer を拡張投影で読み直す（公開 renderer 自体は変更しない）。
const projectionPath = require.resolve(path.join(PUB3D, 'projection.js'));
const rendererPath = require.resolve(path.join(PUB3D, 'renderer.js'));
const cached = require.cache[projectionPath];
const originalExports = cached ? cached.exports : null;
if (cached) cached.exports = P;
delete require.cache[rendererPath];
const R = require(rendererPath);
if (cached && originalExports) cached.exports = originalExports;

const model = S.createModel(D, A, G);
const layout = L.buildSphereLayout(D.compounds);
const VP = { width: 1440, height: 900 };
const RECT = { x: 0, y: 120, width: 1000, height: 700 };

function fakeCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === 'canvas') return { width: VP.width, height: VP.height };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'measureText') return () => ({ width: 42 });
      return () => undefined;
    },
    set() { return true; }
  });
}

function hubId() {
  let best = null;
  let bestCount = -1;
  for (const compound of model.compounds) {
    const count = model.groupsForCompound(compound.id, 'academic').length;
    if (count > bestCount) {
      bestCount = count;
      best = compound.id;
    }
  }
  return best;
}

test('[facts] 427 物質 / 314 反応 / 308 グループを保持している', () => {
  assert.equal(model.compounds.length, 427);
  assert.equal(model.reactionCount, 314);
  assert.equal(model.groupCount, 308);
  assert.equal(model.stats('academic').groups, 308);
});

test('[outside] 裏面（視線の反対側）の点を計画から外す', () => {
  const camera = P.createOutsideCamera(layout.center, layout.radius, { azimuth: 0, elevation: 0 });
  const visible = SR.visibleLayout(model, layout, camera, { center: layout.center });
  assert.ok(visible.list.length > 120 && visible.list.length < 320, 'visible=' + visible.list.length);
  assert.equal(visible.stats.hidden, 427 - visible.list.length);
  const dir = SR.outwardDirection(camera);
  for (const point of visible.list) {
    const dot = point.nx * dir.x + point.ny * dir.y + point.nz * dir.z;
    assert.ok(dot >= -1e-12, point.id + ' は裏面なのに残っている: ' + dot);
  }
  // 明示的に裏側の点は含まれない。
  for (const compound of model.compounds) {
    const point = layout.points[compound.id];
    const dot = point.nx * dir.x + point.ny * dir.y + point.nz * dir.z;
    if (dot < -0.01) assert.equal(visible.points[compound.id], undefined, compound.id);
  }
});

test('[outside] 公開 renderer の計画・描画・ピックがそのまま動く', () => {
  const camera = P.createOutsideCamera(layout.center, layout.radius, {});
  const visible = SR.visibleLayout(model, layout, camera, { center: layout.center });
  const plan = R.planScene({ model, layout: visible, camera, viewport: VP, layer: 'academic' });
  assert.equal(plan.nodes.length, visible.list.length);
  for (const node of plan.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
    assert.ok(node.rect ? node.rect.width > 0 && node.rect.height > 0 : node.radius > 0);
  }
  // すべての経路の両端が可視点にある。
  const ids = new Set(visible.list.map((p) => p.id));
  for (const edge of plan.edges) {
    assert.ok(ids.has(edge.from), edge.from);
    assert.ok(ids.has(edge.to), edge.to);
  }
  const guides = SR.buildGuideSegments(camera, layout.center, layout.radius, VP, {});
  assert.ok(guides.length > 100, 'guides=' + guides.length);
  for (const segment of guides) {
    assert.ok([segment.x1, segment.y1, segment.x2, segment.y2].every(Number.isFinite));
    assert.ok(segment.x1 > -60 && segment.x1 < VP.width + 60);
    assert.ok(segment.y1 > -60 && segment.y1 < VP.height + 60);
  }
  SR.replaceFloorSegments(plan, guides);
  assert.equal(plan.floorSegments.length, guides.length);
  const stats = R.drawScene(fakeCtx(), plan, {});
  assert.equal(stats.cards + stats.markers, plan.nodes.length);
  assert.ok(stats.floorSegments === guides.length);
  // 手前のカードをピックできる（重なりは手前が勝つので、返る ID は
  // その座標を覆うカードのいずれか）。
  const card = plan.cards[0];
  assert.ok(card);
  const picked = R.pickScene(plan, card.x, card.y);
  assert.ok(picked, 'ピック結果がない');
  const pickedNode = plan.nodes.find((node) => node.id === picked && node.card);
  assert.ok(pickedNode, '返った ID がカードでない: ' + picked);
  const px = card.x;
  const py = card.y;
  assert.ok(px >= pickedNode.rect.x && px <= pickedNode.rect.x + pickedNode.rect.width);
  assert.ok(py >= pickedNode.rect.y && py <= pickedNode.rect.y + pickedNode.rect.height);
});

test('[outside] 選択した物質と直接関係するグラフだけが最終表示に残る', () => {
  const id = hubId();
  const point = layout.points[id];
  assert.ok(point);
  const camera = P.framePoint(P.createOutsideCamera(layout.center, layout.radius, {}), point, layout.center, RECT, { ...VP }, { width: VP.width, height: VP.height });
  const visible = SR.visibleLayout(model, layout, camera, { center: layout.center });
  assert.ok(visible.points[id], '選択点が裏面扱いになっている');
  const plan = R.planScene({
    model,
    layout: visible,
    camera,
    viewport: VP,
    layer: 'academic',
    selectedId: id
  });
  const groups = model.groupsForCompound(id, 'academic');
  const allowed = new Set([id]);
  for (const group of groups) {
    for (const member of group.substrateIds.concat(group.productIds)) allowed.add(member);
  }
  assert.ok(groups.length > 0);
  for (const node of plan.nodes) {
    assert.ok(allowed.has(node.id), '無関係な物質が残っている: ' + node.id);
  }
  // 選択点は必ず含まれ、カード中心は選択点の投影と一致する。
  const view = P.cameraView(camera, point, VP);
  const selectedNode = plan.nodes.find((node) => node.id === id);
  assert.ok(selectedNode);
  assert.ok(Math.abs(selectedNode.x - view.x) < 1e-6);
  assert.ok(Math.abs(selectedNode.y - view.y) < 1e-6);
  for (const edge of plan.edges) {
    assert.ok(groups.some((group) => group.id === edge.groupId));
  }
});

test('[inside] 計画は視線の前方だけになり、視点位置は動かない', () => {
  let camera = P.createInsideCamera(layout.center, layout.radius, { azimuth: 40, elevation: 10 });
  camera = P.orbitCamera(camera, 90, -30);
  const visible = SR.visibleLayout(model, layout, camera, { center: layout.center });
  assert.equal(visible, layout, 'inside では裏面カリングを行わない');
  const plan = R.planScene({ model, layout: visible, camera, viewport: VP, layer: 'academic' });
  assert.ok(plan.nodes.length > 20 && plan.nodes.length < 150, 'inside nodes=' + plan.nodes.length);
  for (const node of plan.nodes) {
    assert.ok(node.projected && node.projected.z > 0, node.id);
  }
  const eye = P.cameraBasis(camera).eye;
  assert.ok(Math.abs(eye.x) + Math.abs(eye.y) + Math.abs(eye.z) < 1e-12);
  const guides = SR.buildGuideSegments(camera, layout.center, layout.radius, VP, {});
  assert.ok(guides.length > 0);
  const stats = R.drawScene(fakeCtx(), plan, {});
  assert.ok(stats.cards >= 0);
});

test('[inside] 選択点のフレーミングで、選択カードが usable 領域の中心に来る', () => {
  const id = hubId();
  const point = layout.points[id];
  const camera = P.framePoint(P.createInsideCamera(layout.center, layout.radius, {}), point, layout.center, RECT, VP, {});
  const view = P.cameraView(camera, point, VP);
  assert.ok(Math.abs(view.x - (RECT.x + RECT.width / 2)) < 1e-6);
  assert.ok(Math.abs(view.y - (RECT.y + RECT.height / 2)) < 1e-6);
  const plan = R.planScene({
    model,
    layout,
    camera,
    viewport: VP,
    layer: 'academic',
    selectedId: id
  });
  const node = plan.nodes.find((entry) => entry.id === id);
  assert.ok(node);
  assert.ok(Math.abs(node.rect.x + node.rect.width / 2 - view.x) < 1e-6);
  assert.ok(Math.abs(node.rect.y + node.rect.height / 2 - view.y) < 1e-6);
});

test('[switch] カメラを inside に切り替えても選択と詳細の前提（selectedId）は保持される', () => {
  const id = hubId();
  const point = layout.points[id];
  const outside = P.createOutsideCamera(layout.center, layout.radius, {});
  const framedOutside = P.framePoint(outside, point, layout.center, RECT, VP, { radius: layout.radius });
  const inside = P.switchModeCamera(framedOutside, 'inside', {
    center: layout.center,
    radius: layout.radius,
    point,
    rect: RECT,
    viewport: VP
  });
  for (const camera of [framedOutside, inside]) {
    const visible = SR.visibleLayout(model, layout, camera, { center: layout.center });
    const plan = R.planScene({
      model,
      layout: visible,
      camera,
      viewport: VP,
      layer: 'academic',
      selectedId: id
    });
    assert.ok(plan.nodes.some((node) => node.id === id));
    assert.equal(plan.selectedId, id);
    // 選択点は usable 領域の中心（±1px）。
    const view = P.cameraView(camera, point, VP);
    assert.ok(Math.abs(view.x - (RECT.x + RECT.width / 2)) < 1e-6);
    assert.ok(Math.abs(view.y - (RECT.y + RECT.height / 2)) < 1e-6);
  }
});
