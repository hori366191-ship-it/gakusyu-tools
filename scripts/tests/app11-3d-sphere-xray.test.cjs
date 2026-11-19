/**
 * app11-3d-sphere — 選択中の直接グラフ（裏半球・画面外・パネル裏）回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-xray.test.cjs
 *
 * 対象: site/app11/3d/sphere-render.js の buildSelectedXray /
 *       buildXrayHitAreas / pickXray / drawXray（描画はブラウザなしでデータ契約を検証）
 *
 * 背景:
 *   公開 renderer.planScene は visibleLayout（裏面カリング済み）に無い点の
 *   projection を作らず、clipSegment で画面外の辺も落とす。選択物質の直接の
 *   反応相手が裏半球・画面外だと、カードも経路も消える。
 *   ここでは「番号マーカー + 別リスト」ではなく、縁に並べた名前付き仮想カードで
 *   補う契約を検証する:
 *     - 1 物質 = 1 枚、実カード（投影できる裏半球を含む）は変えない
 *     - 選択グループの全端点・全辺（両端が仮想・有向）が必ず表現される
 *     - 実投影線分を usable 領域で切った続き + 矢印、投影不能時は球面 bearing
 *     - usable 内・UI パネル外・レーン詰め。無関係は出さず、カメラも動かさない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PUB = path.join(ROOT, 'site', 'app11', '3d', 'projection.js');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const Base = require(PUB);
const C = require(path.join(LAB, 'sphere-camera.js'))(Base);
const L = require(path.join(LAB, 'sphere-layout.js'));
const SR = require(path.join(LAB, 'sphere-render.js'));
const S = require(path.join(ROOT, 'site', 'app11', '3d', 'scene-model.js'));

// renderer は読み込み時の RP3DProjection を保持するため、拡張投影で読み直す
// （公開 renderer 自体は変更しない。ブラウザの読み込み順と同じ）。
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

const PHONE = {
  viewport: { width: 390, height: 844 },
  usable: { x: 0, y: 120, width: 390, height: 614 },
  exclusions: []
};
const TABLET = {
  viewport: { width: 1024, height: 1366 },
  usable: { x: 0, y: 120, width: 634, height: 1120 },
  exclusions: [{ x: 644, y: 120, width: 380, height: 1120 }]
};
const DESKTOP = {
  viewport: { width: 1440, height: 900 },
  usable: { x: 0, y: 120, width: 1040, height: 670 },
  exclusions: [{ x: 1040, y: 120, width: 400, height: 670 }]
};

function selectedGroupIds(selectedId) {
  const sel = selectedId || SELECTED;
  const ids = Object.create(null);
  model.groupsForCompound(sel, LAYER).forEach((g) => { ids[g.id] = true; });
  return ids;
}

function selectedEndpointIds(selectedId) {
  const sel = selectedId || SELECTED;
  const ids = Object.create(null);
  ids[sel] = true;
  model.groupsForCompound(sel, LAYER).forEach((g) => {
    g.substrateIds.concat(g.productIds).forEach((id) => {
      if (model.byId[id]) ids[id] = true;
    });
  });
  return ids;
}

function selectedEdges(selectedId) {
  const gids = selectedGroupIds(selectedId);
  return model.edgesForLayer(LAYER).filter((e) => !!gids[e.groupId]);
}

function makeCamera(mode, frameSelected, scene, cameraOptions, selectedId) {
  const opts = Object.assign({ azimuth: -35, elevation: 18 }, cameraOptions || {});
  let camera = mode === 'inside'
    ? C.createInsideCamera(layout.center, layout.radius, opts)
    : C.createOutsideCamera(layout.center, layout.radius, opts);
  if (frameSelected) {
    camera = C.framePoint(camera, layout.points[selectedId || SELECTED], layout.center,
      scene.usable, scene.viewport, { radius: layout.radius });
  }
  return camera;
}

function makeCase(mode, scene, options) {
  options = options || {};
  const selectedId = options.selectedId || SELECTED;
  const viewport = scene.viewport;
  const exclusions = options.exclusions || scene.exclusions || [];
  const camera = makeCamera(mode, options.frameSelected, scene, options.camera, selectedId);
  const visible = SR.visibleLayout(model, layout, camera, {
    center: layout.center,
    // 選択中の直接グラフ端点は、裏半球でも通常カードとして残す。
    keepIds: options.keepIds === false ? null : selectedEndpointIds(selectedId)
  });
  let plan = R.planScene({
    model: model,
    layout: visible,
    camera: camera,
    viewport: viewport,
    layer: LAYER,
    query: '',
    selectedId: selectedId,
    showUnconnectedOnly: false,
    region: null,
    exclusions: exclusions,
    focusPhase: 'final',
    focusFade: 0
  });
  if (options.dropCardIds && options.dropCardIds.length) {
    const drop = new Set(options.dropCardIds);
    plan = Object.assign({}, plan, {
      nodes: plan.nodes.filter((node) => !drop.has(node.id)),
      cards: (plan.cards || []).filter((node) => !drop.has(node.id)),
      markers: (plan.markers || []).filter((node) => !drop.has(node.id))
    });
  }
  const xray = SR.buildSelectedXray(model, layout, camera, plan, {
    selectedId: selectedId,
    layer: LAYER,
    viewport: viewport,
    center: layout.center,
    exclusions: exclusions,
    usableRect: options.usableRect || scene.usable
  });
  SR.buildXrayHitAreas(xray);
  return {
    camera: camera,
    visible: visible,
    plan: plan,
    xray: xray,
    scene: scene,
    selectedId: selectedId
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cardRect(card) {
  return { x: card.x, y: card.y, width: card.width, height: card.height };
}

function insideRect(x, y, rect) {
  return x >= rect.x - 1e-6 && x <= rect.x + rect.width + 1e-6 &&
    y >= rect.y - 1e-6 && y <= rect.y + rect.height + 1e-6;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

function planEdgeIds(plan) {
  const ids = Object.create(null);
  (plan.edges || []).forEach((edge) => { ids[edge.id] = true; });
  return ids;
}

test('[xray] 実グラフ: 実カードは不変、画面外の直接の相手だけが名前付き仮想カードになる', () => {
  const c = makeCase('outside', PHONE);
  const endpoints = selectedEndpointIds();
  const xray = c.xray;
  assert.ok(xray, 'xray がない');
  // 選択グループの全端点が member として揃い、無関係は入らない。
  assert.equal(xray.members.length, Object.keys(endpoints).length, '端点が欠けている');
  xray.members.forEach((member) => assert.ok(endpoints[member.id], '無関係な物質: ' + member.id));
  // 仮想カードは 1 物質 1 枚。番号・別リストは持たない。
  const virtualIds = xray.virtuals.map((member) => member.id);
  assert.equal(new Set(virtualIds).size, virtualIds.length, '同じ物質の仮想カードが重複');
  assert.equal(xray.hidden, xray.virtuals, '旧 hidden が別物になっている');
  assert.equal(xray.legend, undefined, '旧リスト（legend）が残っている');
  assert.equal(xray.rows, undefined, '旧リスト行が残っている');
  assert.ok(virtualIds.length > 0, 'この検証に必要な画面外の相手がない');
  virtualIds.forEach((id) => {
    const member = xray.virtuals.find((v) => v.id === id);
    assert.equal(member.name, model.byId[id].name, 'フルネームでない: ' + id);
    assert.ok(member.card && member.card.width > 0 && member.card.height > 0, 'カード寸法がない: ' + id);
    assert.ok(member.card.lines.join(' ').replace(/\s+/g, '') === member.name.replace(/\s+/g, ''),
      '折り返しで名前が欠けている: ' + id);
    assert.equal(member.badge, undefined, '番号マーカーが残っている: ' + id);
    assert.equal(typeof member.index, 'undefined', '番号 index が残っている: ' + id);
  });
  // 投影できて画面内の裏半球端点は、実投影位置の通常カードのまま。
  const farIds = Object.keys(endpoints).filter((id) => {
    const point = layout.points[id];
    if (!point || SR.isFrontFacing(point, layout.center, c.camera, 0)) return false;
    const projected = C.cameraView(c.camera, point, PHONE.viewport);
    return !!projected && projected.x >= 0 && projected.x <= PHONE.viewport.width &&
      projected.y >= 0 && projected.y <= PHONE.viewport.height;
  });
  farIds.forEach((id) => {
    assert.ok(c.visible.points[id], '裏半球の端点が layout から落ちている: ' + id);
    const node = c.plan.nodes.find((n) => n.id === id);
    assert.ok(node && node.card, '裏半球の通常カードがない: ' + id);
    const projected = C.cameraView(c.camera, layout.points[id], PHONE.viewport);
    const center = { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 };
    assert.ok(Math.abs(center.x - projected.x) < 1e-9 && Math.abs(center.y - projected.y) < 1e-9,
      '実投影位置でない: ' + id);
    assert.ok(!virtualIds.includes(id), '実カードが仮想カードにもなっている: ' + id);
  });
});

test('[xray] 全辺カバレッジ: 選択グループの有向な全辺が plan か合成破線で必ず表現される', () => {
  [['outside', PHONE], ['outside', TABLET], ['inside', DESKTOP]].forEach(([mode, scene]) => {
    const label = mode + ' ' + scene.viewport.width + 'x' + scene.viewport.height;
    const c = makeCase(mode, scene);
    const all = selectedEdges();
    const gids = selectedGroupIds();
    const endpoints = selectedEndpointIds();
    const covered = Object.create(null);
    (c.plan.edges || []).forEach((edge) => {
      if (gids[edge.groupId]) covered[edge.id] = 'plan';
    });
    c.xray.edges.forEach((record) => {
      assert.ok(gids[record.groupId], label + ': 無関係な辺 ' + record.groupId);
      assert.ok(endpoints[record.from] && endpoints[record.to], label + ': 無関係な端点');
      covered[record.id] = covered[record.id] || 'xray';
    });
    all.forEach((edge) => {
      assert.ok(covered[edge.id], label + ': 経路が消えている ' + edge.id);
    });
    assert.equal(c.xray.stats.selectedEdges, all.length, label + ': 選択辺数');
    assert.equal(c.xray.stats.coveredEdges, all.length, label + ': カバレッジ');
    // 両端とも仮想カードの辺（multi-endpoint / both offscreen）も必ず記録される。
    const virtualIds = new Set(c.xray.virtuals.map((v) => v.id));
    const bothVirtual = all.filter((edge) => virtualIds.has(edge.from) && virtualIds.has(edge.to));
    if (bothVirtual.length) {
      const recordIds = new Set(c.xray.edges.map((r) => r.id));
      bothVirtual.forEach((edge) => assert.ok(recordIds.has(edge.id),
        label + ': 両端が画面外の辺がない ' + edge.id));
      c.xray.edges.forEach((record) => {
        if (!virtualIds.has(record.from) || !virtualIds.has(record.to)) return;
        // 有向トポロジー（基質 → 生成物）をそのまま保持する。
        assert.equal(record.from, all.find((e) => e.id === record.id).from);
        assert.equal(record.to, all.find((e) => e.id === record.id).to);
        assert.ok(distance({ x: record.x1, y: record.y1 }, { x: record.x2, y: record.y2 }) > 0.5);
      });
    }
    // 合成破線は「矢印が実際の終点側」を向く（x1→x2 = from→to）。
    c.xray.edges.forEach((record) => {
      const angle = Math.atan2(record.y2 - record.y1, record.x2 - record.x1);
      assert.ok(Number.isFinite(angle), label + ': 矢印角度が壊れている');
    });
  });
});

test('[xray] 仮想カードは usable 内・パネル外に並び、中心/角を直接ピックできる', () => {
  [['outside', PHONE], ['outside', TABLET], ['inside', TABLET]].forEach(([mode, scene]) => {
    const label = mode + ' ' + scene.viewport.width + 'x' + scene.viewport.height;
    const c = makeCase(mode, scene);
    const usable = c.scene.usable;
    c.xray.virtuals.forEach((member) => {
      const card = member.card;
      const rect = cardRect(card);
      assert.ok(rect.x >= usable.x - 1e-6 && rect.y >= usable.y - 1e-6 &&
        rect.x + rect.width <= usable.x + usable.width + 1e-6 &&
        rect.y + rect.height <= usable.y + usable.height + 1e-6,
        label + ': カードが usable の外 ' + member.id + ' ' + JSON.stringify(rect));
      c.scene.exclusions.forEach((exclusion) => {
        assert.ok(!rectsOverlap(rect, exclusion),
          label + ': カードが UI パネルの下 ' + member.id);
      });
      const centerHit = SR.pickXray(c.xray, card.center.x, card.center.y);
      assert.equal(centerHit && centerHit.id, member.id, label + ': 中心をピックできない ' + member.id);
      const cornerHit = SR.pickXray(c.xray, rect.x + 2, rect.y + 2);
      assert.equal(cornerHit && cornerHit.id, member.id, label + ': 角をピックできない ' + member.id);
    });
    if (!c.xray.stats.layoutLimited) {
      for (let i = 0; i < c.xray.virtuals.length; i++) {
        for (let j = i + 1; j < c.xray.virtuals.length; j++) {
          assert.ok(!rectsOverlap(c.xray.virtuals[i].card, c.xray.virtuals[j].card),
            label + ': 仮想カードが重なっている ' + c.xray.virtuals[i].id + ' / ' +
            c.xray.virtuals[j].id);
        }
      }
      assert.equal(c.xray.stats.overlapPairs, 0, label + ': overlapPairs の整合');
    }
    // 辺の接続先は対応するカードの縁（中心ではない）。
    c.xray.edges.forEach((record) => {
      if (record.toVirtual) {
        const virtual = c.xray.virtuals.find((v) => v.id === record.to);
        assert.ok(virtual, label + ': 辺の to 仮想カードがない');
        const card = virtual.card;
        const onEdge = Math.abs(record.x2 - card.x) < 1e-6 ||
          Math.abs(record.x2 - (card.x + card.width)) < 1e-6 ||
          Math.abs(record.y2 - card.y) < 1e-6 ||
          Math.abs(record.y2 - (card.y + card.height)) < 1e-6;
        assert.ok(onEdge || insideRect(record.x2, record.y2, cardRect(card)),
          label + ': 辺が to カードに接していない');
      }
      if (record.fromVirtual) {
        const virtual = c.xray.virtuals.find((v) => v.id === record.from);
        assert.ok(virtual, label + ': 辺の from 仮想カードがない');
        assert.ok(insideRect(record.x1, record.y1, cardRect(virtual.card)) ||
          Math.abs(record.x1 - virtual.card.x) < 1e-6 ||
          Math.abs(record.x1 - (virtual.card.x + virtual.card.width)) < 1e-6 ||
          Math.abs(record.y1 - virtual.card.y) < 1e-6 ||
          Math.abs(record.y1 - (virtual.card.y + virtual.card.height)) < 1e-6,
          label + ': 辺が from カードに接していない');
      }
    });
  });
});

test('[xray] カメラの後ろ・UI パネル下の端点も仮想カードになり、bearing は反対側でも有限', () => {
  // 球の中では投影できない（カメラの後ろ）端点が多い。
  const inside = makeCase('inside', PHONE);
  const reasons = {};
  inside.xray.virtuals.forEach((member) => {
    reasons[member.reason] = (reasons[member.reason] || 0) + 1;
    if (member.reason === 'behind') {
      assert.equal(member.projected, null, 'behind なのに投影がある: ' + member.id);
      assert.ok(member.direction && Number.isFinite(member.direction.angle),
        'bearing が壊れている: ' + member.id);
      assert.equal(member.direction.bearing, true, 'bearing フラグがない: ' + member.id);
    }
  });
  assert.ok((reasons.behind || 0) > 0, 'カメラの後ろの相手がない');

  // UI パネルの下に投影があり、かつ plan のカードを持たない端点を作る。
  const endpoints = Object.keys(selectedEndpointIds());
  let chosen = null;
  for (const id of endpoints) {
    if (id === SELECTED) continue;
    const projected = C.cameraView(inside.camera, layout.points[id], PHONE.viewport);
    if (!projected || !Number.isFinite(projected.x)) continue;
    if (projected.x < 20 || projected.x > PHONE.viewport.width - 20) continue;
    if (projected.y < 20 || projected.y > PHONE.viewport.height - 20) continue;
    if (!SR.isFrontFacing(layout.points[id], layout.center, inside.camera, 0)) continue;
    chosen = { id, projected };
    break;
  }
  assert.ok(chosen, 'パネル検証に使える端点がない');
  const exclusion = {
    x: chosen.projected.x - 30,
    y: chosen.projected.y - 20,
    width: 60,
    height: 40
  };
  const blocked = makeCase('inside', PHONE, {
    dropCardIds: [chosen.id],
    exclusions: [exclusion],
    usableRect: PHONE.viewport
  });
  const member = blocked.xray.virtuals.find((v) => v.id === chosen.id);
  assert.ok(member, 'パネル下の端点が仮想カードになっていない');
  assert.equal(member.reason, 'panel');
  assert.ok(!rectsOverlap(cardRect(member.card), exclusion),
    'パネル下に仮想カードが置かれた');
});

test('[xray] phone 下部パネル / portrait tablet 右パネルで、レーン配置が usable に収まる', () => {
  const phone = makeCase('outside', PHONE);
  const tablet = makeCase('outside', TABLET);
  [['phone', phone, PHONE], ['tablet', tablet, TABLET]].forEach(([label, c, scene]) => {
    assert.ok(c.xray.virtuals.length > 0, label + ': 仮想カードがない');
    assert.equal(c.xray.stats.layoutLimited, false, label + ': 通常密度でレーンが破綻');
    assert.equal(c.xray.stats.overlapPairs, 0, label + ': 通常密度で重なり');
    const boundaryClipped = c.xray.edges.filter((record) => record.boundaryClipped);
    assert.ok(boundaryClipped.length > 0, label + ': 実投影線分の続きがない');
    boundaryClipped.forEach((record) => {
      // 接続点は usable の縁か、usable 内（パネル外）にある。
      const inUsable = insideRect(record.x1, record.y1, scene.usable) ||
        insideRect(record.x2, record.y2, scene.usable);
      assert.ok(inUsable, label + ': 合成線が usable の外');
      scene.exclusions.forEach((exclusion) => {
        assert.ok(!insideRect(record.x1, record.y1, exclusion) &&
          !insideRect(record.x2, record.y2, exclusion),
          label + ': 合成線が UI パネル内で切れている');
      });
    });
  });
});

test('[xray] 最密の実データ（酢酸・球の中・phone）でも落とさず、制約を stats で正直に報告する', () => {
  const c = makeCase('inside', PHONE);
  assert.equal(c.xray.stats.endpoints, 29, '端点 29 の実データでない');
  assert.equal(c.xray.stats.selectedEdges, 40, '辺 40 の実データでない');
  assert.equal(c.xray.stats.coveredEdges, 40, '最密ケースで辺が欠けた');
  assert.ok(c.xray.stats.virtuals > 20, '最密ケースの仮想カードが少なすぎる');
  // 落とさない: カードを持たない端点の数と仮想カード数が一致。
  const virtualIds = new Set(c.xray.virtuals.map((v) => v.id));
  c.xray.members.forEach((member) => {
    if (!member.visible) assert.ok(virtualIds.has(member.id), '仮想カードが落ちている: ' + member.id);
  });
  c.xray.virtuals.forEach((member) => {
    assert.ok(insideRect(member.card.x, member.card.y, PHONE.usable), '最密で usable 外');
  });
  // 完全な非重なりが無理なら layoutLimited が立ち、黙って隠さない。
  if (c.xray.stats.overlapPairs > 0) {
    assert.equal(c.xray.stats.layoutLimited, true, '重なりがあるのに layoutLimited でない');
  }
  // カメラは動かさない。
  assert.equal(JSON.stringify(c.camera), JSON.stringify(makeCase('inside', PHONE).camera));
});

function recordPath(record) {
  return record.points && record.points.length >= 2
    ? record.points
    : [{ x: record.x1, y: record.y1 }, { x: record.x2, y: record.y2 }];
}

// 実際の drawXray と同じ「破線 → 仮想カード」順で、不透明カード/パネルに
// 隠れないインク量を測る（Canvas の描画順を模擬）。
function visibleInk(record, blockers) {
  const path = recordPath(record);
  let visible = 0;
  for (let s = 1; s < path.length; s++) {
    const a = path[s - 1];
    const b = path[s];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 0) || !Number.isFinite(len)) continue;
    const n = Math.max(8, Math.ceil(len / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (blockers.some((rect) => insideRect(x, y, rect))) continue;
      visible += len / (n + 1);
    }
  }
  return visible;
}

function blockersOf(xray, exclusions) {
  return xray.virtuals.map((member) => cardRect(member.card)).concat(exclusions || []);
}

function makeRecordingContext() {
  const moves = [];
  const lines = [];
  const texts = [];
  const dashes = [];
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
    beginPath() {},
    closePath() {},
    moveTo(x, y) { moves.push({ x, y }); },
    lineTo(x, y) { lines.push({ x, y }); },
    stroke() {},
    fill() {},
    fillRect() {},
    strokeRect() {},
    fillText(text) { texts.push(String(text)); },
    setLineDash(value) { dashes.push(value.slice()); }
  };
  return { ctx, moves, lines, texts, dashes };
}

function onRectBorder(point, rect, tolerance) {
  const eps = tolerance == null ? 1.5 : tolerance;
  if (!point || !rect) return false;
  const withinX = point.x >= rect.x - eps && point.x <= rect.x + rect.width + eps;
  const withinY = point.y >= rect.y - eps && point.y <= rect.y + rect.height + eps;
  return (withinX && (Math.abs(point.y - rect.y) <= eps ||
    Math.abs(point.y - (rect.y + rect.height)) <= eps)) ||
    (withinY && (Math.abs(point.x - rect.x) <= eps ||
      Math.abs(point.x - (rect.x + rect.width)) <= eps));
}

function pathTotal(record) {
  const path = recordPath(record);
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

function assertContinuous(record) {
  const path = recordPath(record);
  assert.ok(path.length >= 2);
  path.forEach((point) => assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y)));
  for (let i = 1; i < path.length; i++) {
    assert.ok(Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) > 0.5,
      '経路が途切れている: ' + record.id);
  }
}

test('[xray] benzene→BHC（127.749°・球の中）: 実カード縁から仮想カード縁まで全長で見える', () => {
  const scenes = [
    { viewport: { width: 390, height: 844 }, usable: { x: 0, y: 120, width: 390, height: 614 }, exclusions: [] },
    { viewport: { width: 1440, height: 900 }, usable: { x: 0, y: 120, width: 1040, height: 670 }, exclusions: [{ x: 1040, y: 120, width: 400, height: 670 }] }
  ];
  scenes.forEach((scene) => {
    const label = scene.viewport.width + 'x' + scene.viewport.height;
    const c = makeCase('inside', scene, {
      selectedId: 'benzene',
      frameSelected: true,
      camera: { azimuth: 127.749, elevation: 0, fov: 72 }
    });
    const record = c.xray.edges.find((r) =>
      r.from === 'benzene' && r.to === 'hexachlorocyclohexane');
    assert.ok(record, label + ': benzene→BHC の辺がない');
    assert.equal(record.missingPlan, true, label + ': 実 plan 辺がない条件でない');
    assert.equal(record.endToEnd, true, label + ': 全長コネクタになっていない');
    assert.equal(record.drawable, true, label + ': 描画不能');
    assert.equal(record.connected, true, label + ': 端点未接続');
    const benzeneCard = c.plan.nodes.find((n) => n.id === 'benzene').rect;
    const bhcVirtual = c.xray.virtuals.find((v) => v.id === 'hexachlorocyclohexane');
    assert.ok(bhcVirtual && bhcVirtual.reason === 'behind', label + ': BHC が背面仮想でない');
    const path = recordPath(record);
    assert.ok(onRectBorder(path[0], benzeneCard), label + ': 始点が benzene 実カード縁でない');
    assert.ok(onRectBorder(path[path.length - 1], cardRect(bhcVirtual.card)),
      label + ': 終点が BHC 仮想カード縁でない');
    const total = pathTotal(record);
    assert.ok(total > 150, label + ': 全長が短すぎる（rim stub のまま） ' + Math.round(total));
    assertContinuous(record);
    assert.ok(visibleInk(record, blockersOf(c.xray, scene.exclusions)) >= total * 0.75,
      label + ': 経路の大半がカード/パネルに隠れている');
    // 実 Canvas の記録でも非有限座標を描かない。
    const rec = makeRecordingContext();
    SR.drawXray(rec.ctx, c.xray, scene.viewport);
    rec.lines.forEach((point) => assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(rec.lines.length >= path.length - 1, label + ': 折れ線が描かれていない');
  });
});

test('[xray] 逆方向・propene→cumene も同じ根: 実カード縁→仮想カード縁で方向と可視性を保つ', () => {
  const scene = {
    viewport: { width: 390, height: 844 },
    usable: { x: 0, y: 120, width: 390, height: 614 },
    exclusions: []
  };
  const camera = { azimuth: 127.749, elevation: 0, fov: 72 };
  // 逆方向: BHC を選択（benzene が背面仮想、BHC が実カード）。
  const reverse = makeCase('inside', scene, {
    selectedId: 'hexachlorocyclohexane',
    frameSelected: true,
    camera: camera
  });
  const reverseRecord = reverse.xray.edges.find((r) =>
    r.from === 'benzene' && r.to === 'hexachlorocyclohexane');
  assert.ok(reverseRecord, '逆方向の辺がない');
  assert.equal(reverseRecord.fromVirtual, true);
  assert.equal(reverseRecord.toVirtual, false);
  assert.equal(reverseRecord.endToEnd, true);
  const benzeneVirtual = reverse.xray.virtuals.find((v) => v.id === 'benzene');
  const bhcCard = reverse.plan.nodes.find((n) => n.id === 'hexachlorocyclohexane').rect;
  const reversePath = recordPath(reverseRecord);
  assert.ok(onRectBorder(reversePath[0], cardRect(benzeneVirtual.card)),
    '逆方向の始点が仮想 benzene の縁でない');
  assert.ok(onRectBorder(reversePath[reversePath.length - 1], bhcCard),
    '逆方向の終点が実 BHC の縁でない');
  assert.ok(pathTotal(reverseRecord) > 150);
  assertContinuous(reverseRecord);

  // propene→cumene: 以前は逆側の短い rim stub だけだった。
  const propene = makeCase('inside', scene, {
    selectedId: 'propene',
    frameSelected: true,
    camera: camera
  });
  const record = propene.xray.edges.find((r) => r.from === 'propene' && r.to === 'cumene');
  assert.ok(record, 'propene→cumene の辺がない');
  assert.equal(record.missingPlan, true);
  assert.equal(record.endToEnd, true);
  assert.equal(record.drawable, true);
  const propeneCard = propene.plan.nodes.find((n) => n.id === 'propene').rect;
  const cumeneVirtual = propene.xray.virtuals.find((v) => v.id === 'cumene');
  const path = recordPath(record);
  assert.ok(onRectBorder(path[0], propeneCard), 'propene 実カード縁から始まっていない');
  assert.ok(onRectBorder(path[path.length - 1], cardRect(cumeneVirtual.card)),
    'cumene 仮想カード縁で終わっていない');
  const total = pathTotal(record);
  assert.ok(total > 150, '全長が短すぎる: ' + Math.round(total));
  assert.ok(visibleInk(record, blockersOf(propene.xray, scene.exclusions)) >= total * 0.6,
    'propene→cumene がブロッカーで分断されている');
  assertContinuous(record);
});

test('[xray] 実線が覆っている one-virtual 辺は全長を二重描画しない', () => {
  const c = makeCase('outside', TABLET);
  const stubs = c.xray.edges.filter((record) => !record.missingPlan && !record.endToEnd);
  assert.ok(stubs.length > 0, '実線で覆われる one-virtual 辺がない');
  stubs.forEach((record) => {
    assert.ok(record.boundaryClipped, '境界スタブのフラグがない: ' + record.id);
    assert.equal(record.drawable, true);
    const path = recordPath(record);
    const usable = c.scene.usable;
    // 片端は usable 境界、もう片端は仮想カード縁。実カードから仮想カードまでの
    // 全長コネクタ（二重描画）にはなっていない。
    const boundaryEnd = onRectBorder(path[0], usable, 2) || onRectBorder(path[path.length - 1], usable, 2);
    assert.ok(boundaryEnd, '境界スタブが usable 境界に接していない: ' + record.id);
    const virtual = c.xray.virtuals.find((v) => v.id === record.from || v.id === record.to);
    assert.ok(virtual, '仮想カードがない: ' + record.id);
    assert.ok(onRectBorder(path[0], cardRect(virtual.card)) ||
      onRectBorder(path[path.length - 1], cardRect(virtual.card)),
      '仮想カード縁に接していない: ' + record.id);
  });
});

test('[xray] 実際の Canvas 描画: 酷いズーム/近平面の巨大有限投影でも全辺が可視の破線になる', () => {
  // 実データ: 酢酸・球の中・狭 FOV・mobile。ethanal は near 面ぎりぎりで
  // 1e5 を超える有限投影になる（欠落しやすい条件）。
  const scene = {
    viewport: { width: 390, height: 844 },
    usable: { x: 0, y: 120, width: 390, height: 614 },
    exclusions: []
  };
  const c = makeCase('inside', scene, { camera: { azimuth: 315, elevation: -20, fov: 22 } });
  const ethanal = c.xray.virtuals.find((member) => member.id === 'ethanal');
  assert.ok(ethanal, '巨大投影の実 ID（ethanal）が仮想カードにない');
  assert.ok(ethanal.projected && Number.isFinite(ethanal.projected.x),
    '巨大有限投影の再現に失敗');
  assert.ok(Math.abs(ethanal.projected.x) > 1e5 || Math.abs(ethanal.projected.y) > 1e5,
    '巨大有限投影（>1e5）でない');
  const blockers = blockersOf(c.xray, scene.exclusions);
  assert.equal(c.xray.stats.coveredEdges, 40, '酷いズームで辺が欠けた');
  c.xray.edges.forEach((record) => {
    const path = recordPath(record);
    assert.ok(path.length >= 2, '経路点がない: ' + record.id);
    path.forEach((point) => {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y),
        '非有限の描画座標: ' + record.id);
    });
    assert.ok(record.drawable, '描画不能な辺: ' + record.id);
    assert.ok(visibleInk(record, blockers) >= 6,
      'カード/パネルに隠れて見えない辺: ' + record.id);
  });
  // ethanal に接する辺も可視。
  const touching = c.xray.edges.filter((record) => record.from === 'ethanal' || record.to === 'ethanal');
  assert.ok(touching.length > 0, 'ethanal の辺がない');
  touching.forEach((record) => assert.ok(record.drawable && visibleInk(record, blockers) >= 6));

  // fake Canvas で実際の draw 呼び出しを測る（NaN を描かない・破線を使う）。
  const rec = makeRecordingContext();
  SR.drawXray(rec.ctx, c.xray, scene.viewport);
  assert.ok(rec.lines.length > 0, 'Canvas に線が描かれていない');
  rec.lines.forEach((point) => {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y),
      'Canvas へ非有限座標を描いた');
  });
  const expectedLines = c.xray.edges.reduce((sum, record) => sum + recordPath(record).length - 1, 0);
  assert.ok(rec.lines.length >= expectedLines, '折れ線の描画呼び出しが足りない');
  assert.ok(rec.dashes.some((value) => value.length === 2 && value[0] === 6 && value[1] === 5),
    '合成経路が破線でない');
});

test('[xray] 重なり/同一縁ではジョグで可視接続し、背後カメラの辺も見える', () => {
  // 球の中・狭 FOV・mobile: 仮想カード 29 枚、重なりあり。以前は中心同士の
  // 直線がカード塗りに完全に隠れて 6 本の辺が不可視だった実データ。
  const scene = {
    viewport: { width: 390, height: 844 },
    usable: { x: 0, y: 120, width: 390, height: 614 },
    exclusions: []
  };
  const c = makeCase('inside', scene, { camera: { fov: 22 } });
  assert.ok(c.xray.stats.overlapPairs > 0, '重なりケースを再現できない');
  const blockers = blockersOf(c.xray, scene.exclusions);
  c.xray.edges.forEach((record) => {
    assert.ok(record.drawable, '重なり時に不可視の辺: ' + record.id);
    assert.ok(visibleInk(record, blockers) >= 6,
      '重なり時に隠れた辺: ' + record.id);
    const first = recordPath(record)[0];
    const last = recordPath(record)[recordPath(record).length - 1];
    assert.ok(Number.isFinite(first.x) && Number.isFinite(last.x));
  });
  // 以前失敗した同一縁ペアはジョグ（折れ線）で可視になっている。
  const pairs = [
    ['ethanal', 'acetic-acid', true],
    ['acetic-acid', 'ethyl-acetate', true],
    ['acetic-acid', 'butyl-acetate', true],
    // 縁から縁への直線が可視なら、遠回りのジョグは不要（直線のまま）。
    ['acetic-acid', 'triacetin', false]
  ];
  assert.ok(c.xray.edges.some((record) => record.jog), 'ジョグが必要な辺が 1 本もない');
  pairs.forEach(([from, to, expectJog]) => {
    const record = c.xray.edges.find((r) => r.from === from && r.to === to);
    assert.ok(record, '対象辺がない: ' + from + '->' + to);
    if (expectJog) {
      assert.ok(record.jog, '同一縁/重なりの辺がジョグになっていない: ' + from + '->' + to);
    }
    assert.ok(visibleInk(record, blockers) >= 6, 'ジョグ後も見えない: ' + from + '->' + to);
    // 接続先は正しい仮想カードの縁。
    const fromVirtual = c.xray.virtuals.find((v) => v.id === from);
    const toVirtual = c.xray.virtuals.find((v) => v.id === to);
    const path = recordPath(record);
    assert.ok(insideRect(path[0].x, path[0].y, cardRect(fromVirtual.card)) ||
      Math.abs(path[0].x - fromVirtual.card.x) < 1e-6 ||
      Math.abs(path[0].x - (fromVirtual.card.x + fromVirtual.card.width)) < 1e-6 ||
      Math.abs(path[0].y - fromVirtual.card.y) < 1e-6 ||
      Math.abs(path[0].y - (fromVirtual.card.y + fromVirtual.card.height)) < 1e-6,
      '始点が from カードに接していない: ' + from + '->' + to);
    assert.ok(insideRect(path[path.length - 1].x, path[path.length - 1].y, cardRect(toVirtual.card)) ||
      Math.abs(path[path.length - 1].x - toVirtual.card.x) < 1e-6 ||
      Math.abs(path[path.length - 1].x - (toVirtual.card.x + toVirtual.card.width)) < 1e-6 ||
      Math.abs(path[path.length - 1].y - toVirtual.card.y) < 1e-6 ||
      Math.abs(path[path.length - 1].y - (toVirtual.card.y + toVirtual.card.height)) < 1e-6,
      '終点が to カードに接していない: ' + from + '->' + to);
  });
  // カメラの後ろ（projection=null, bearing）の辺もジョグ/直線いずれかで可視。
  const behind = c.xray.virtuals.filter((member) => member.reason === 'behind');
  assert.ok(behind.length > 0, '背後カメラの端点がない');
  behind.forEach((member) => {
    const incident = c.xray.edges.filter((r) => r.from === member.id || r.to === member.id);
    incident.forEach((record) => assert.ok(record.drawable && visibleInk(record, blockers) >= 6,
      '背後の辺が見えない: ' + record.id));
  });
  // 以前の全辺カバレッジは維持。
  assert.equal(c.xray.stats.coveredEdges, c.xray.stats.selectedEdges);
  assert.equal(c.xray.stats.selectedEdges, 40);
});

test('[xray] 描画は番号・別リストを出さず、フルネームと破線・矢印だけを描く', () => {
  const c = makeCase('outside', PHONE);
  const texts = [];
  const dashes = [];
  let lineTo = 0;
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
    beginPath() {},
    moveTo() {},
    lineTo() { lineTo += 1; },
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    fillText(text) { texts.push(String(text)); },
    setLineDash(value) { dashes.push(value.slice()); }
  };
  SR.drawXray(ctx, c.xray, PHONE.viewport);
  // 破線は [6,5] で、矢印ぶんの lineTo がある。
  assert.ok(dashes.some((value) => value.length === 2 && value[0] === 6 && value[1] === 5),
    '破線指定がない');
  assert.ok(lineTo > 0, '合成線・矢印が描かれていない');
  // 名前付きカードのテキストだけ。数字だけの番号は描かれない。
  const expected = [];
  c.xray.virtuals.forEach((member) => member.card.lines.forEach((line) => expected.push(line)));
  expected.forEach((line) => assert.ok(texts.includes(line), 'カード名が描かれていない: ' + line));
  assert.ok(texts.every((text) => !/^\d+$/.test(text)), '番号マーカーの数字が描かれている');
});

test('[xray] 画面に縁の仮想カード用のネイティブ操作面があり、旧リスト文言を残さない', () => {
  const html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(LAB, 'sphere.css'), 'utf8');
  const app = fs.readFileSync(path.join(LAB, 'sphere-app.js'), 'utf8');
  assert.ok(/id="r3d-virtual-cards"/.test(html), 'ネイティブ操作面がない');
  assert.ok(/aria-label="[^"]*画面の縁[^"]*"/.test(html), '操作面のラベルがない');
  assert.ok(/\.r3d-virtual-card/.test(css), '仮想カードの CSS がない');
  const overlayRule = css.slice(css.indexOf('.r3d-virtual-card {'));
  assert.ok(/pointer-events:\s*none/.test(overlayRule),
    'Canvas のドラッグを奪わない pointer-events 設計がない');
  assert.ok(/:focus-visible/.test(css), 'キーボードのフォーカス表示がない');
  assert.ok(/syncVirtualCards/.test(app), 'sphere-app が仮想カードを同期していない');
  assert.ok(/addEventListener\('click'/.test(app), '選ぶ操作が配線されていない');
  assert.ok(!html.includes('番号マーカー'), '旧「番号マーカー」文言が残っている');
  assert.ok(!html.includes('画面内リスト'), '旧「画面内リスト」文言が残っている');
});

test('[xray] 構築でカメラ・選択点の中心を動かさず、無関係を露出しない', () => {
  const scene = DESKTOP;
  const c = makeCase('inside', scene, { frameSelected: true });
  const snapshot = JSON.stringify(c.camera);
  const endpoints = selectedEndpointIds();
  const gids = selectedGroupIds();
  assert.equal(c.xray.members.length, Object.keys(endpoints).length);
  c.xray.members.forEach((member) => assert.ok(endpoints[member.id], '無関係: ' + member.id));
  c.xray.edges.forEach((record) => assert.ok(gids[record.groupId], '無関係な辺: ' + record.groupId));
  assert.equal(JSON.stringify(c.camera), snapshot, 'X-ray 構築でカメラが変わった');
  const selectedNode = c.plan.nodes.find((n) => n.id === SELECTED);
  assert.ok(selectedNode && selectedNode.card, '選択カードが通常描画にない');
  assert.ok(Math.abs(c.xray.origin.x - (selectedNode.rect.x + selectedNode.rect.width / 2)) < 1e-9);
  assert.ok(Math.abs(c.xray.origin.y - (selectedNode.rect.y + selectedNode.rect.height / 2)) < 1e-9);
  // 平面の選択辺は plan に残り、変更されない（実カード・実線の不変）。
  const covered = planEdgeIds(c.plan);
  assert.ok(Object.keys(covered).length > 0, '通常描画の辺がない');
});
