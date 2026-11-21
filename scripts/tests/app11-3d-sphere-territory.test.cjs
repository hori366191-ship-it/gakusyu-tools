/**
 * app11-3d-sphere — 球面の分野テリトリーの回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-territory.test.cjs
 *
 * 対象:
 *   site/app11/3d/sphere-territory.js
 *   site/app11/3d/renderer.js（テリトリーの描画順・スタイル）
 *
 * 検証:
 *   - 427 スロット / 10 分野の最近傍（球面ボロノイ近似）被覆と決定性
 *   - 境界が必ず異分野の間だけにでき、境界グラフが閉じていること
 *   - 球の外は手前半球だけ、球の中は視線の前だけをフレームに載せること
 *   - 分類フィルタ・選択時の減光
 *   - Canvas の描画順（面 → 境界 → 経路 → カード）と低彩度・低不透明度
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
const ST = require(path.join(LAB, 'sphere-territory.js'));

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
const geometry = ST.buildGeometry(layout);
const VP = { width: 1440, height: 900 };

/* ---------------- Canvas の記録用スタブ ---------------- */

function recordingCtx() {
  const calls = [];
  const state = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    shadowColor: 'rgba(0,0,0,0)',
    shadowBlur: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };
  const gradient = { addColorStop() {} };
  const ctx = {
    canvas: { width: VP.width, height: VP.height },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    measureText() { return { width: 42 }; },
    save() { calls.push({ op: 'save' }); },
    restore() { calls.push({ op: 'restore' }); },
    clearRect() { calls.push({ op: 'clearRect' }); },
    fillRect() { calls.push({ op: 'fillRect', fillStyle: state.fillStyle, globalAlpha: state.globalAlpha }); },
    beginPath() { calls.push({ op: 'beginPath' }); },
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    arc() { calls.push({ op: 'arc', globalAlpha: state.globalAlpha }); },
    clip() { calls.push({ op: 'clip' }); },
    fill() {
      calls.push({
        op: 'fill',
        fillStyle: state.fillStyle,
        globalAlpha: state.globalAlpha,
        shadowBlur: state.shadowBlur
      });
    },
    stroke() {
      calls.push({
        op: 'stroke',
        strokeStyle: state.strokeStyle,
        lineWidth: state.lineWidth,
        globalAlpha: state.globalAlpha,
        shadowBlur: state.shadowBlur
      });
    },
    setLineDash(dash) { state.lineDash = dash; },
    fillText() {},
    strokeRect() {},
    drawImage() {},
    translate() {},
    transform() {},
    setTransform() {}
  };
  Object.keys(state).forEach((key) => {
    Object.defineProperty(ctx, key, {
      get() { return state[key]; },
      set(value) { state[key] = value; }
    });
  });
  return { ctx, calls };
}

function outsideCamera() {
  return P.createOutsideCamera(layout.center, layout.radius, {});
}

function planWithTerritory(camera, frameOptions, planOptions) {
  const visible = require(path.join(LAB, 'sphere-render.js'))
    .visibleLayout(model, layout, camera, { center: layout.center });
  const plan = R.planScene(Object.assign({
    model,
    layout: visible,
    camera,
    viewport: VP,
    layer: 'academic'
  }, planOptions || {}));
  plan.territory = ST.buildFrame(geometry, camera, VP, Object.assign({
    center: layout.center
  }, frameOptions || {}));
  return plan;
}

function firstIndex(calls, predicate) {
  for (let i = 0; i < calls.length; i++) {
    if (predicate(calls[i])) return i;
  }
  return -1;
}

/* ---------------- 形状 ---------------- */

test('[coverage] 427 スロットがすべて自分の分野のボロノイセルに入る', () => {
  assert.equal(geometry.kind, 'sphere-territory');
  assert.equal(geometry.slotCount, 427);
  assert.equal(geometry.regionIndexes.length, 10);
  assert.equal(geometry.faceCount, 20 * Math.pow(4, geometry.subdivision));
  assert.equal(geometry.vertexCount, 10242);

  let faces = 0;
  let areaDiff = 0;
  for (const key of geometry.regionIndexes) {
    const stat = geometry.regionStats[key];
    assert.ok(stat.faces > 0, 'region ' + key + ' に面がない');
    faces += stat.faces;
    areaDiff += Math.abs(stat.areaRatio - stat.slotRatio);
    assert.ok(stat.id, 'region ' + key + ' の id がない');
  }
  assert.equal(faces, geometry.faceCount);
  assert.ok(areaDiff < 0.02, '面積比とスロット比が離れすぎ: ' + areaDiff);

  for (const compound of D.compounds) {
    const point = layout.points[compound.id];
    assert.ok(point, compound.id);
    const region = ST.regionAt(geometry, point.nx, point.ny, point.nz);
    assert.equal(region, point.regionIndex, compound.id + ' の分野');
    const slot = ST.nearestSlotAt(geometry, point.nx, point.ny, point.nz);
    assert.equal(slot, point.slot, compound.id + ' の最近傍スロット');
  }

  // メッシュ頂点の分野も最近傍と一致する（決定的なサンプル）。
  for (let i = 0; i < geometry.vertexCount; i += 97) {
    const x = geometry.vertexDirs[i * 3];
    const y = geometry.vertexDirs[i * 3 + 1];
    const z = geometry.vertexDirs[i * 3 + 2];
    assert.equal(ST.regionAt(geometry, x, y, z), geometry.vertexRegion[i], 'vertex ' + i);
  }
});

test('[determinism] 同じ layout からは座標・分野・境界が完全に一致する', () => {
  const again = ST.buildGeometry(layout);
  assert.equal(again.faceCount, geometry.faceCount);
  assert.equal(again.boundaries.length, geometry.boundaries.length);
  assert.deepEqual(Array.from(again.vertexDirs), Array.from(geometry.vertexDirs));
  assert.deepEqual(Array.from(again.vertexRegion), Array.from(geometry.vertexRegion));
  assert.deepEqual(Array.from(again.faceRegion), Array.from(geometry.faceRegion));
  assert.equal(again.boundaries[0].ax, geometry.boundaries[0].ax);
  assert.equal(again.boundaries[0].regionA, geometry.boundaries[0].regionA);
  assert.deepEqual(again.pairs, geometry.pairs);
});

test('[topology] 境界は異分野の間だけにあり、境界グラフが閉じている', () => {
  const degree = new Map();
  const keyOf = (x, y, z) => x.toFixed(5) + ',' + y.toFixed(5) + ',' + z.toFixed(5);
  let midMatches = 0;
  for (const seg of geometry.boundaries) {
    assert.notEqual(seg.regionA, seg.regionB, '同分野の境界がある');
    assert.ok(geometry.regionIds[seg.regionA] && geometry.regionIds[seg.regionB]);
    const ra = Math.hypot(seg.ax, seg.ay, seg.az);
    const rb = Math.hypot(seg.bx, seg.by, seg.bz);
    assert.ok(Math.abs(ra - geometry.radius) < 1e-9);
    assert.ok(Math.abs(rb - geometry.radius) < 1e-9);
    const midRegion = ST.regionAt(geometry, seg.mx, seg.my, seg.mz);
    if (midRegion === seg.regionA || midRegion === seg.regionB) midMatches += 1;
    for (const point of [[seg.ax, seg.ay, seg.az], [seg.bx, seg.by, seg.bz]]) {
      const key = keyOf(point[0], point[1], point[2]);
      degree.set(key, (degree.get(key) || 0) + 1);
    }
  }
  // 辺中点はほぼ等距離点なので、最近傍は両側の分野のどちらか。
  assert.ok(midMatches / geometry.boundaries.length > 0.98,
    'midRegion 一致率 ' + (midMatches / geometry.boundaries.length));

  let odd = 0;
  for (const value of degree.values()) {
    assert.ok(value >= 2, '境界線分の端点が 1 本しかない');
    if (value % 2 === 1) odd += 1;
  }
  // 3 分野が 1 面で出会う点だけ奇数（Y 字）。線分の行き止まりはない。
  assert.ok(odd < geometry.boundaries.length * 0.1, '奇数次数が多すぎる: ' + odd);
  assert.ok(geometry.pairs.length > 5);

  // メッシュ辺から期待される分野ペアと境界ペアが一致する。
  const expected = new Set();
  for (let f = 0; f < geometry.faceCount; f++) {
    const ids = [geometry.faces[f * 3], geometry.faces[f * 3 + 1], geometry.faces[f * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const a = geometry.vertexRegion[ids[e]];
      const b = geometry.vertexRegion[ids[(e + 1) % 3]];
      if (a === b) continue;
      expected.add(Math.min(a, b) + '|' + Math.max(a, b));
    }
  }
  const actual = new Set(geometry.pairs.map((pair) => pair.a + '|' + pair.b));
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

/* ---------------- 可視フレーム ---------------- */

test('[outside] 手前半球だけを描き、シルエット円でクリップできる', () => {
  const camera = outsideCamera();
  const frame = ST.buildFrame(geometry, camera, VP, { center: layout.center });
  assert.equal(frame.kind, 'sphere-territory-frame');
  assert.equal(frame.mode, 'outside');
  assert.ok(frame.disc && frame.disc.radius > 0);
  assert.ok(frame.stats.backfaceSkipped > 0);
  assert.ok(frame.stats.facesDrawn > 0);
  assert.equal(frame.stats.facesDrawn + frame.stats.offscreenSkipped + frame.stats.backfaceSkipped,
    geometry.faceCount);
  assert.ok(frame.stats.facesDrawn < geometry.faceCount / 2 + 1, '裏面まで塗っている');
  assert.ok(frame.fills.length >= 8);
  assert.ok(frame.borders.length > 0);

  for (const fill of frame.fills) {
    assert.ok(fill.points.length >= 6);
    for (let i = 0; i < fill.points.length; i += 2) {
      const x = fill.points[i];
      const y = fill.points[i + 1];
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      const d = Math.hypot(x - frame.disc.cx, y - frame.disc.cy);
      assert.ok(d <= frame.disc.radius + 1e-6, '円外の塗り: ' + d);
    }
  }
  for (const border of frame.borders) {
    assert.notEqual(border.regionA, border.regionB);
    assert.ok(border.regionAId && border.regionBId);
    assert.ok(border.points.length >= 4);
    for (const value of border.points) assert.ok(Number.isFinite(value));
  }
});

test('[inside] 視線の前だけを描き、near 面をまたぐ面はクリップする', () => {
  for (const fov of [72, 110]) {
    const camera = P.createInsideCamera(layout.center, layout.radius, {
      azimuth: 40,
      elevation: 10,
      fov
    });
    const frame = ST.buildFrame(geometry, camera, VP, { center: layout.center });
    assert.equal(frame.mode, 'inside');
    assert.equal(frame.disc, null);
    assert.ok(frame.stats.backfaceSkipped > 0);
    assert.ok(frame.stats.facesDrawn > 0);
    assert.equal(frame.stats.degradedFaces, 0);
    assert.ok(frame.stats.nearClipped >= 0);
    assert.ok(frame.stats.facesDrawn <= frame.stats.facesFront);
    for (const fill of frame.fills) {
      for (let i = 0; i < fill.points.length; i += 2) {
        assert.ok(Number.isFinite(fill.points[i]));
        assert.ok(Number.isFinite(fill.points[i + 1]));
      }
    }
  }
  // near 面クリップの純関数。
  const near = 0.5;
  const clipped = ST.clipNearPolygon([
    { x: 0, y: 0, z: -1 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 1, z: 1 }
  ], near);
  assert.equal(clipped.length, 4);
  for (const point of clipped) assert.ok(point.z >= near);
});

test('[filter] 分類フィルタ中はその分野の面と境界だけになる', () => {
  const camera = outsideCamera();
  const full = ST.buildFrame(geometry, camera, VP, { center: layout.center });
  const target = geometry.regionIndexes[0];
  const filtered = ST.buildFrame(geometry, camera, VP, {
    center: layout.center,
    activeRegion: target
  });
  assert.equal(filtered.activeRegion, target);
  assert.ok(filtered.fills.length >= 1);
  assert.ok(filtered.fills.every((fill) => fill.region === target));
  assert.ok(filtered.borders.every((border) =>
    border.regionA === target || border.regionB === target));
  const fullTriangles = full.stats.triangles;
  assert.ok(filtered.stats.triangles < fullTriangles);
  assert.ok(filtered.stats.triangles > 0);
});

/* ---------------- 描画（Canvas スタブ） ---------------- */

test('[draw] 面 → 境界 → 経路 → カードの順に描き、低彩度・低不透明度にする', () => {
  const camera = outsideCamera();
  const plan = planWithTerritory(camera, { center: layout.center });
  const { ctx, calls } = recordingCtx();
  const stats = R.drawScene(ctx, plan, {});

  assert.ok(stats.territoryFills >= 1, 'テリトリーの塗りがない');
  assert.ok(stats.territoryBorders >= 1, 'テリトリーの境界がない');
  assert.equal(stats.territoryFills, plan.territory.fills.length);
  assert.equal(stats.territoryBorders, plan.territory.borders.length);

  const firstFill = firstIndex(calls, (call) =>
    call.op === 'fill' && /^rgb\(/.test(call.fillStyle) && call.globalAlpha < 0.2);
  const firstBorder = firstIndex(calls, (call) =>
    call.op === 'stroke' && /^rgb\(/.test(call.strokeStyle) && call.shadowBlur > 0);
  const firstEdge = firstIndex(calls, (call) =>
    call.op === 'stroke' && /^rgba\((?:150,175,205|72,228,255)/.test(call.strokeStyle));
  const firstCard = firstIndex(calls, (call) =>
    call.op === 'fill' && call.fillStyle.charAt(0) === '#' && call.globalAlpha === 1);

  assert.ok(firstFill >= 0 && firstBorder >= 0);
  assert.ok(firstFill < firstBorder, '面より先に境界を描いている');
  assert.ok(firstBorder < firstEdge, '経路より後に境界を描いている');
  assert.ok(firstEdge < firstCard, 'カードより後に経路を描いている');

  // 塗りは共有パレットの低不透明度。
  const regionId = plan.territory.fills[0].regionId;
  const fillPaint = R.territoryFillPaint(regionId, {});
  assert.ok(fillPaint.alpha <= 0.12);
  assert.equal(fillPaint.fillStyle, 'rgb(' + fillPaint.rgb.join(',') + ')');

  // 境界は低彩度・細線・控えめなグロー。
  const border = plan.territory.borders[0];
  const borderPaint = R.territoryBorderPaint(border.regionAId, border.regionBId, {});
  assert.ok(borderPaint.alpha <= 0.5);
  assert.ok(borderPaint.width <= 1.2);
  assert.ok(borderPaint.blur <= 6);
  const spread = Math.max(...borderPaint.rgb) - Math.min(...borderPaint.rgb);
  assert.ok(spread <= 80, '境界色の彩度が高い: ' + spread);
  const borderCall = calls[firstBorder];
  assert.equal(borderCall.lineWidth, borderPaint.width);
  assert.equal(borderCall.globalAlpha, borderPaint.alpha);
});

test('[draw] 選択中はテリトリーをさらに薄くし、カードはその上に残る', () => {
  const camera = outsideCamera();
  const hub = model.compounds.reduce((best, compound) => {
    const count = model.groupsForCompound(compound.id, 'academic').length;
    return count > best.count ? { id: compound.id, count } : best;
  }, { id: null, count: -1 });
  const plan = planWithTerritory(camera, { center: layout.center, dimmed: true }, {
    selectedId: hub.id
  });
  const { ctx, calls } = recordingCtx();
  const stats = R.drawScene(ctx, plan, {});
  assert.ok(stats.territoryFills >= 1);

  const dimFill = firstIndex(calls, (call) =>
    call.op === 'fill' && /^rgb\(/.test(call.fillStyle) && call.globalAlpha < 0.06);
  const cardFill = firstIndex(calls, (call) =>
    call.op === 'fill' && call.fillStyle.charAt(0) === '#' && call.globalAlpha === 1);
  assert.ok(dimFill >= 0);
  assert.ok(dimFill < cardFill, 'カードが面の下に隠れている');
  const paint = R.territoryFillPaint(plan.territory.fills[0].regionId, { dimmed: true });
  assert.equal(paint.alpha, R.TERRITORY_STYLE.fillAlphaDimmed);
  assert.ok(paint.alpha < R.TERRITORY_STYLE.fillAlpha);
});

test('[draw] テリトリーが無い計画では従来どおり描画できる', () => {
  const camera = outsideCamera();
  const visible = require(path.join(LAB, 'sphere-render.js'))
    .visibleLayout(model, layout, camera, { center: layout.center });
  const plan = R.planScene({ model, layout: visible, camera, viewport: VP, layer: 'academic' });
  const { ctx } = recordingCtx();
  const stats = R.drawScene(ctx, plan, {});
  assert.equal(stats.territoryFills, 0);
  assert.equal(stats.territoryBorders, 0);
  assert.ok(stats.cards + stats.markers > 0);
});
