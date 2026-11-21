/**
 * app11-3d-sphere — 選択時の必要分だけのズームアウト（回帰テスト）
 * 実行: node --test scripts/tests/app11-3d-sphere-fit.test.cjs
 *
 * 対象: site/app11/3d/sphere-fit.js
 *       （カード実寸は renderer.js の cardMetrics を共有）
 *
 * 方針:
 *   - 選択物質＋直接の反応グループ全端点（裏半球も含む）の名前カードが、
 *     ヘッダー・ツールバー・詳細パネルを除いた実測 usable 領域に収まるよう
 *     ズームアウトする。ただし今より内側へは動かさない。
 *   - 既に収まっていれば距離・FOV をそのまま返す。
 *   - 球の中（inside）の見え方は変えない（位置・FOV とも不変、報告のみ）。
 *   - 裏半球の端点や、どうズームしても収まらない端点は、選択描画と同じ
 *     全端点として評価し、収まらないものは縁の仮想カードに委ねて報告する。
 *   - 描画計画（renderer.planScene）の実カード矩形と一致することも確認する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'site', 'app11', '3d');
const Base = require(path.join(LAB, 'projection.js'));
const C = require(path.join(LAB, 'sphere-camera.js'))(Base);
const L = require(path.join(LAB, 'sphere-layout.js'));
const SR = require(path.join(LAB, 'sphere-render.js'));
const S = require(path.join(LAB, 'scene-model.js'));
const SF = require(path.join(LAB, 'sphere-fit.js'));

// renderer.js は読み込み時の RP3DProjection を保持するため、ブラウザと同じ
// 「screenOffset 付き」の拡張版へ差し替えて読み込む（既存テストと同じ手法）。
const projectionPath = require.resolve(path.join(LAB, 'projection.js'));
const rendererPath = require.resolve(path.join(LAB, 'renderer.js'));
const cachedProjection = require.cache[projectionPath];
const originalExports = cachedProjection ? cachedProjection.exports : null;
if (cachedProjection) cachedProjection.exports = C;
delete require.cache[rendererPath];
const R = require(rendererPath);
if (cachedProjection && originalExports) cachedProjection.exports = originalExports;

const data = require(path.join(ROOT, 'site', 'app11', 'data.js'));
const academic = require(path.join(LAB, 'academic-facts.js'));
const groups = require(path.join(ROOT, 'site', 'app11', 'reaction-groups.js'));

const model = S.createModel(data, academic, groups);
const layout = L.buildSphereLayout(data.compounds);
const LAYER = 'academic';
const RANGE = C.outsideDistanceRange(layout.radius);

const DESK = { width: 1440, height: 900 };
const DESK_RECT = { x: 0, y: 96, width: 1040, height: 780 };
const PHONE = { width: 390, height: 844 };
const PHONE_RECT = { x: 0, y: 110, width: 390, height: 500 };

function outsideCamera(distance) {
  return C.createOutsideCamera(layout.center, layout.radius, {
    azimuth: -35,
    elevation: 18,
    distance: distance
  });
}

function insideCamera() {
  return C.createInsideCamera(layout.center, layout.radius, { fov: C.DEFAULT_INSIDE_FOV });
}

function framed(camera, id, vp, rect) {
  return C.framePoint(camera, layout.points[id], layout.center, rect, vp, {
    radius: layout.radius
  });
}

function fit(camera, id, vp, rect, layer) {
  return SF.fitSelectionCamera(camera, {
    model: model,
    selectedId: id,
    layer: layer || LAYER,
    layout: layout,
    viewport: vp,
    usableRect: rect
  });
}

function cardsFor(id, vp) {
  return SF.measureCards(model, SF.collectSelectionIds(model, id, LAYER), vp, id);
}

function endpointIds(id) {
  return SF.collectSelectionIds(model, id, LAYER);
}

function planFor(camera, id, vp) {
  const keepIds = Object.create(null);
  endpointIds(id).forEach((key) => { keepIds[key] = true; });
  const visible = SR.visibleLayout(model, layout, camera, {
    center: layout.center,
    keepIds: keepIds
  });
  return R.planScene({
    model: model,
    layout: visible,
    camera: camera,
    viewport: vp,
    layer: LAYER,
    query: '',
    selectedId: id,
    showUnconnectedOnly: false,
    region: null,
    exclusions: []
  });
}

function plannedRect(plan, id) {
  for (const node of plan.nodes) {
    if (node.id === id) return node.card ? node.rect : null;
  }
  return null;
}

function inside(rect, usable, pad) {
  return rect.x >= usable.x + pad - 1e-6 &&
    rect.y >= usable.y + pad - 1e-6 &&
    rect.x + rect.width <= usable.x + usable.width - pad + 1e-6 &&
    rect.y + rect.height <= usable.y + usable.height - pad + 1e-6;
}

const CASES = [
  { id: 'acetic-acid', zoomedIn: RANGE.min },
  { id: 'ethanol', zoomedIn: 112 },
  { id: 'formaldehyde', zoomedIn: 130 }
];

test('[fit] ズームイン状態から、選択＋直接端点の全カードを実 usable 領域へ収める', () => {
  CASES.forEach((entry) => {
    const framedCamera = framed(outsideCamera(entry.zoomedIn), entry.id, DESK, DESK_RECT);
    const before = SF.evaluate(framedCamera, cardsFor(entry.id, DESK), layout.points, DESK, DESK_RECT, SF.FIT_PADDING);
    assert.ok(before.insideCount < before.total, `${entry.id}: 前提として収まっていない`);

    const result = fit(framedCamera, entry.id, DESK, DESK_RECT);
    assert.equal(result.camera.mode, 'outside');
    assert.ok(result.camera.distance > framedCamera.distance, `${entry.id}: ズームアウトする`);
    assert.equal(result.info.fitted, true);
    assert.deepEqual(result.info.missedIds, []);
    assert.equal(result.info.limited, false);
    assert.equal(result.info.targetCount, endpointIds(entry.id).length);

    // 描画計画の実カード（renderer の寸法・投影）で全枚が usable 内。
    const plan = planFor(result.camera, entry.id, DESK);
    endpointIds(entry.id).forEach((key) => {
      const rect = plannedRect(plan, key);
      assert.ok(rect, `${entry.id}: ${key} の実カードがある`);
      assert.ok(inside(rect, DESK_RECT, SF.FIT_PADDING - 1e-6), `${entry.id}: ${key} は usable 内`);
    });
  });
});

test('[fit] 投影オフセット: 選択カードは非対称 usable 領域の中心に来る', () => {
  const rect = { x: 0, y: 120, width: 860, height: 700 }; // 右に詳細パネル、下にツールバー
  const result = fit(framed(outsideCamera(RANGE.min), 'acetic-acid', DESK, rect), 'acetic-acid', DESK, rect);
  const plan = planFor(result.camera, 'acetic-acid', DESK);
  const selectedRect = plannedRect(plan, 'acetic-acid');
  assert.ok(selectedRect);
  assert.ok(Math.abs(selectedRect.x + selectedRect.width / 2 - (rect.x + rect.width / 2)) < 1e-6);
  assert.ok(Math.abs(selectedRect.y + selectedRect.height / 2 - (rect.y + rect.height / 2)) < 1e-6);
});

test('[fit] 既に収まる場合は距離・FOV をそのまま維持する', () => {
  const framedCamera = framed(outsideCamera(400), 'acetic-acid', DESK, DESK_RECT);
  const before = SF.evaluate(framedCamera, cardsFor('acetic-acid', DESK), layout.points, DESK, DESK_RECT, SF.FIT_PADDING);
  assert.equal(before.allInside, true);

  const result = fit(framedCamera, 'acetic-acid', DESK, DESK_RECT);
  assert.equal(result.camera.distance, framedCamera.distance);
  assert.equal(result.camera.fov, framedCamera.fov);
  assert.equal(result.info.zoomedOut, false);
  assert.equal(result.info.fitted, true);
});

test('[fit] リサイズ／パネル再ターゲットで内側へ戻らない（距離は単調・再フィットは不動点）', () => {
  const wide = { x: 0, y: 96, width: 1200, height: 780 };
  const narrow = { x: 0, y: 96, width: 860, height: 700 }; // 詳細パネルぶん狭い
  const first = fit(framed(outsideCamera(RANGE.min), 'acetic-acid', DESK, wide), 'acetic-acid', DESK, wide);
  const toNarrow = fit(first.camera, 'acetic-acid', DESK, narrow);
  assert.ok(toNarrow.camera.distance >= first.camera.distance, '狭くなってもズームインしない');
  assert.equal(toNarrow.info.fitted, true);

  // 広い領域へ戻す: 今の距離で収まるので、その距離をそのまま保つ。
  const backWide = fit(toNarrow.camera, 'acetic-acid', DESK, wide);
  assert.equal(backWide.camera.distance, toNarrow.camera.distance);
  assert.equal(backWide.info.zoomedOut, false);

  // 同じ入力の繰り返しでも距離が動かない（論理ループなし）。
  const again = fit(backWide.camera, 'acetic-acid', DESK, narrow);
  assert.equal(again.camera.distance, backWide.camera.distance);
  const repeated = fit(again.camera, 'acetic-acid', DESK, narrow);
  assert.equal(repeated.camera.distance, again.camera.distance);
});

test('[fit] 距離の探索は単調で、結果は「必要な最小距離」に収束する', () => {
  const entry = 'acetic-acid';
  const framedCamera = framed(outsideCamera(RANGE.min), entry, DESK, DESK_RECT);
  const cards = cardsFor(entry, DESK);
  let previous = -1;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const d = Math.exp(Math.log(RANGE.min) + (Math.log(RANGE.max) - Math.log(RANGE.min)) * (i / steps));
    const camera = C.cloneCamera(framedCamera);
    camera.distance = d;
    const evaluated = SF.evaluate(camera, cards, layout.points, DESK, DESK_RECT, SF.FIT_PADDING);
    assert.ok(evaluated.insideCount >= previous, `距離 ${d} で収まる枚数が減らない`);
    previous = evaluated.insideCount;
  }

  const result = fit(framedCamera, entry, DESK, DESK_RECT);
  assert.equal(result.camera.distance <= RANGE.max + 1e-9, true);
  // ほんの少しでも近づけると、収まる集合がまだ揃わない（最小性）。
  const closer = C.cloneCamera(result.camera);
  closer.distance = result.camera.distance * 0.995;
  const closerEval = SF.evaluate(closer, cards, layout.points, DESK, DESK_RECT, SF.FIT_PADDING);
  assert.ok(closerEval.insideCount < cards.length);
});

test('[fit] 裏半球の端点も評価対象（選択描画と同じ全端点・カリングなし）', () => {
  const entry = 'acetic-acid';
  const framedCamera = framed(outsideCamera(RANGE.min), entry, DESK, DESK_RECT);
  const ids = endpointIds(entry);
  const dir = SR.outwardDirection(framedCamera);
  const back = ids.filter((key) => {
    const p = layout.points[key];
    const length = Math.hypot(p.x, p.y, p.z) || 1;
    const normal = { x: p.x / length, y: p.y / length, z: p.z / length };
    return normal.x * dir.x + normal.y * dir.y + normal.z * dir.z < -0.1;
  });
  assert.ok(back.length > 0, '前提として裏半球の直接端点が存在する');

  const result = fit(framedCamera, entry, DESK, DESK_RECT);
  const plan = planFor(result.camera, entry, DESK);
  back.forEach((key) => {
    const rect = plannedRect(plan, key);
    assert.ok(rect, `${key} はズームアウト後の通常カードとして描かれる`);
    assert.ok(inside(rect, DESK_RECT, SF.FIT_PADDING - 1e-6));
  });
  assert.deepEqual(result.info.missedIds, []);
});

test('[fit] 実データ全 427 物質: 外では必ず全カードが収まり、範囲内・ズームインなし（desktop/phone）', () => {
  const configs = [
    { vp: DESK, rect: DESK_RECT, distance: RANGE.min },
    { vp: PHONE, rect: PHONE_RECT, distance: RANGE.min }
  ];
  configs.forEach((config) => {
    data.compounds.forEach((compound) => {
      const framedCamera = framed(
        C.createOutsideCamera(layout.center, layout.radius, { distance: config.distance }),
        compound.id, config.vp, config.rect);
      const result = fit(framedCamera, compound.id, config.vp, config.rect);
      const cards = cardsFor(compound.id, config.vp);
      const evaluated = SF.evaluate(
        result.camera, cards, layout.points, config.vp, config.rect, SF.FIT_PADDING);
      assert.equal(evaluated.allInside, true, `${compound.id}: 全カードが収まる`);
      assert.equal(result.info.limited, false, `${compound.id}: 取りこぼしなし`);
      assert.deepEqual(result.info.missedIds, []);
      assert.ok(result.camera.distance >= framedCamera.distance - 1e-9, `${compound.id}: ズームインしない`);
      assert.ok(result.camera.distance <= RANGE.max + 1e-9);
      assert.equal(Number.isFinite(result.camera.distance), true);
      // 収束済みのカメラをもう一度通しても動かない（論理ループなし）。
      const again = fit(result.camera, compound.id, config.vp, config.rect);
      assert.equal(again.camera.distance, result.camera.distance);
    });
  });
});

test('[fit] カード実寸は renderer.cardMetrics と一致する', () => {
  ['acetic-acid', 'ethanol', 'benzene'].forEach((id) => {
    const metrics = R.cardMetrics(model.byId[id], DESK, id === 'acetic-acid');
    const cards = SF.measureCards(model, [id], DESK, 'acetic-acid');
    assert.equal(cards[0].width, metrics.width);
    assert.equal(cards[0].height, metrics.height);
  });
});

test('[fit] inside は見え方を変えない（位置・FOV 不変、届かない端点は縁カードのまま）', () => {
  const id = 'acetic-acid';
  const framedCamera = framed(insideCamera(), id, DESK, DESK_RECT);
  const cards = cardsFor(id, DESK);
  const before = SF.evaluate(framedCamera, cards, layout.points, DESK, DESK_RECT, SF.FIT_PADDING);

  const result = fit(framedCamera, id, DESK, DESK_RECT);
  assert.equal(result.camera.mode, 'inside');
  assert.equal(result.camera.distance, 0);
  assert.equal(result.camera.fov, framedCamera.fov, 'inside の FOV は変えない');
  assert.equal(result.camera.azimuth, framedCamera.azimuth);
  assert.equal(result.camera.elevation, framedCamera.elevation);
  assert.equal(result.info.zoomedOut, false);
  assert.equal(result.info.unchanged, true);
  assert.equal(result.info.insideCount, before.insideCount, '収まる枚数の解釈も現状のまま');

  // 届かない端点は従来どおり「縁の仮想カード」側（ここでは報告のみ）。
  if (!before.allInside) {
    assert.equal(result.info.limited, true);
    assert.ok(result.info.missedIds.length > 0);
    const plan = planFor(result.camera, id, DESK);
    const xray = SR.buildSelectedXray(model, layout, result.camera, plan, {
      selectedId: id,
      layer: LAYER,
      viewport: DESK,
      center: layout.center,
      exclusions: [],
      usableRect: DESK_RECT
    });
    assert.ok(xray && xray.virtuals.length > 0, '縁カードのフォールバックが残る');
  }
});

test('[fit] inside: 既に収まるなら何も動かさない', () => {
  // 端点の少ない物質（中心付近だけで完結）を探し、初期 FOV で収まる場合を確認。
  let target = null;
  for (const compound of data.compounds.slice(0, 60)) {
    const camera = framed(insideCamera(), compound.id, DESK, DESK_RECT);
    const cards = cardsFor(compound.id, DESK);
    const evaluated = SF.evaluate(camera, cards, layout.points, DESK, DESK_RECT, SF.FIT_PADDING);
    if (evaluated.total > 0 && evaluated.allInside) {
      target = { id: compound.id, camera: camera };
      break;
    }
  }
  assert.ok(target, '前提: inside でも初期 FOV で収まる選択が存在する');
  const result = fit(target.camera, target.id, DESK, DESK_RECT);
  assert.equal(result.camera.fov, target.camera.fov);
  assert.equal(result.info.zoomedOut, false);
  assert.equal(result.info.fitted, true);
});

test('[fit] カード自体が入らない極小領域では現在ズームを維持して報告する', () => {
  const tiny = { x: 0, y: 0, width: 40, height: 20 };
  const framedCamera = framed(outsideCamera(RANGE.min), 'acetic-acid', DESK, tiny);
  const result = fit(framedCamera, 'acetic-acid', DESK, tiny);
  assert.equal(result.camera.distance, framedCamera.distance);
  assert.equal(result.info.limited, true);
  assert.equal(result.info.fitted, false);
  assert.equal(Number.isFinite(result.camera.distance), true);
  assert.ok(result.camera.distance <= RANGE.max + 1e-9);
});

test('[fit] スマートフォン（390x844・下ドック）でも全カードが収まる', () => {
  const framedCamera = framed(outsideCamera(RANGE.min), 'ethanol', PHONE, PHONE_RECT);
  const result = fit(framedCamera, 'ethanol', PHONE, PHONE_RECT);
  assert.equal(result.info.fitted, true);
  assert.ok(result.camera.distance > framedCamera.distance);
  const plan = planFor(result.camera, 'ethanol', PHONE);
  endpointIds('ethanol').forEach((key) => {
    const rect = plannedRect(plan, key);
    assert.ok(rect);
    assert.ok(inside(rect, PHONE_RECT, SF.FIT_PADDING - 1e-6));
  });
});

test('[fit] 評価矩形は描画計画のカード矩形と一致する（余白・オフセットのずれなし）', () => {
  const id = 'ethanol';
  const result = fit(framed(outsideCamera(RANGE.min), id, DESK, DESK_RECT), id, DESK, DESK_RECT);
  const evaluated = SF.evaluate(
    result.camera, cardsFor(id, DESK), layout.points, DESK, DESK_RECT, SF.FIT_PADDING);
  const plan = planFor(result.camera, id, DESK);
  evaluated.members.forEach((member) => {
    const rect = plannedRect(plan, member.id);
    assert.ok(rect);
    assert.ok(Math.abs(rect.x - member.rect.x) < 1e-6);
    assert.ok(Math.abs(rect.y - member.rect.y) < 1e-6);
    assert.ok(Math.abs(rect.width - member.rect.width) < 1e-6);
    assert.ok(Math.abs(rect.height - member.rect.height) < 1e-6);
  });
});

test('[integration] sphere-app / index.html が選択・再フォーカス・レイアウト追従で fit を通す', () => {
  const app = fs.readFileSync(path.join(LAB, 'sphere-app.js'), 'utf8');
  assert.match(app, /RP3DSphereFit/);
  assert.match(app, /function fitSelectionCamera\(/);
  // 選択・再フォーカス（framingCamera 経由）と resize/パネル追従の両方。
  const framing = app.slice(app.indexOf('function framingCamera('), app.indexOf('function framingCamera(') + 500);
  assert.match(framing, /fitSelectionCamera\(/);
  const refit = app.slice(app.indexOf('function refitForLayout('), app.indexOf('// ---------------- 描画'));
  assert.ok(refit.includes('fitSelectionCamera('), 'refitForLayout で fit する');
  // モード切替（選択中）も fit を通す。
  assert.match(app, /if \(point\) target = fitSelectionCamera\(target, usableArea\(\)\);/);
  // 手動ズーム・検索入力の経路は変えない。
  assert.ok(!/function zoomBy[\s\S]{0,400}fitSelectionCamera/.test(app));
  assert.ok(!/els\.search\.addEventListener\('input'[\s\S]{0,400}fitSelectionCamera/.test(app));

  const html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
  const fitAt = html.indexOf('./sphere-fit.js');
  const appAt = html.indexOf('./sphere-app.js');
  const rendererAt = html.indexOf('./renderer.js');
  assert.ok(fitAt > rendererAt && fitAt < appAt, 'fit は renderer の後・app の前に読み込む');
});
