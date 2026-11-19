/**
 * app11-3d-sphere — ポインタ入力（掴みドラッグ・ピンチ・タップ）の回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-input.test.cjs
 *
 * 対象: site/app11/3d/sphere-input.js
 *   - マウス / 1本指タッチで、掴んだ球面点がポインタ直下に残る
 *   - ピンチはズームのみ。ピンチ → 1本指で残った指の位置にアンカーを取り直す
 *   - 動いていないタップだけ選択（ドラッグ後の up では選択しない）
 *   - モード・ビューポート変更、pointercancel で古いアンカーを使わない
 *   - イベントは clientX/clientY と pointerType で駆動する（canvas 矩形のオフセット込み）
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
const G = require(path.join(LAB, 'sphere-input.js'));

const CENTER = { x: 0, y: 0, z: 0 };
const RADIUS = 100;

function harness(mode, viewport) {
  let camera = mode === 'inside'
    ? C.createInsideCamera(CENTER, RADIUS, { azimuth: -35, elevation: 18 })
    : C.createOutsideCamera(CENTER, RADIUS, { azimuth: -35, elevation: 18 });
  const vp = Object.assign({ width: 1440, height: 900 }, viewport || {});
  const rect = { left: 24, top: 40 };
  const taps = [];
  const pinches = [];
  let manipulations = 0;
  const controller = G.createGestureController({
    getCamera: function () { return camera; },
    setCamera: function (next) { camera = next; },
    getViewport: function () { return vp; },
    getRect: function () { return rect; },
    getCenter: function () { return CENTER; },
    getRadius: function () { return RADIUS; },
    onTap: function (pos) { taps.push(pos); },
    onPinch: function (factor) { pinches.push(factor); },
    onManipulate: function () { manipulations += 1; },
    isInteractive: function () { return true; }
  });
  function event(id, x, y, type, button) {
    return {
      pointerId: id,
      clientX: x + rect.left,
      clientY: y + rect.top,
      pointerType: type || 'mouse',
      button: button == null ? 0 : button
    };
  }
  return {
    controller: controller,
    event: event,
    taps: taps,
    pinches: pinches,
    viewport: vp,
    get camera() { return camera; },
    set camera(value) { camera = value; },
    get manipulations() { return manipulations; }
  };
}

function assertProjection(camera, point, target, viewport, label) {
  const view = C.cameraView(camera, point, viewport);
  assert.ok(view, (label || '') + ': 投影なし');
  const error = Math.hypot(view.x - target.x, view.y - target.y);
  assert.ok(error < 1e-6, (label || '') + ': 投影誤差 ' + error + 'px');
}

test('[drag] マウスで掴んだ点がポインタ直下に残り、ドラッグ後はタップ扱いにならない', () => {
  const h = harness('outside');
  h.controller.pointerDown(h.event(1, 720, 450, 'mouse'));
  const anchor = h.controller.getState().anchor;
  assert.ok(anchor);
  h.controller.pointerMove(h.event(1, 820, 450, 'mouse'));
  assertProjection(h.camera, anchor.point, { x: 820, y: 450 }, h.viewport, 'mouse drag');
  assert.equal(h.taps.length, 0);
  assert.ok(h.manipulations > 0);
  h.controller.pointerUp(h.event(1, 820, 450, 'mouse'));
  const state = h.controller.getState();
  assert.equal(state.pointerCount, 0);
  assert.equal(state.anchor, null);
  assert.equal(h.taps.length, 0);
});

test('[drag] 1本指タッチもマウスと同じ掴み操作になる（pointerType=touch）', () => {
  for (const mode of ['outside', 'inside']) {
    const h = harness(mode);
    h.controller.pointerDown(h.event(1, 720, 450, 'touch'));
    const anchor = h.controller.getState().anchor;
    assert.ok(anchor);
    h.controller.pointerMove(h.event(1, 700, 380, 'touch'));
    assertProjection(h.camera, anchor.point, { x: 700, y: 380 }, h.viewport, mode + ' touch');
    h.controller.pointerUp(h.event(1, 700, 380, 'touch'));
    assert.equal(h.taps.length, 0);
  }
});

test('[tap] 動いていないタップだけ onTap を呼び、カメラは動かさない', () => {
  const h = harness('outside');
  const before = {
    azimuth: h.camera.azimuth,
    elevation: h.camera.elevation,
    distance: h.camera.distance
  };
  h.controller.pointerDown(h.event(1, 640, 420, 'mouse'));
  h.controller.pointerUp(h.event(1, 640, 420, 'mouse'));
  assert.equal(h.taps.length, 1);
  assert.deepEqual(h.taps[0], { x: 640, y: 420 });
  assert.equal(h.camera.azimuth, before.azimuth);
  assert.equal(h.camera.elevation, before.elevation);
  assert.equal(h.camera.distance, before.distance);
});

test('[pinch] 2本指はズームのみ。ピンチ→1本指で残った指の位置にアンカーを取り直す', () => {
  const h = harness('outside');
  h.controller.pointerDown(h.event(1, 700, 450, 'touch'));
  h.controller.pointerDown(h.event(2, 740, 450, 'touch'));
  assert.equal(h.controller.getState().anchor, null);
  h.controller.pointerMove(h.event(2, 780, 450, 'touch'));
  assert.equal(h.pinches.length, 1);
  assert.ok(h.pinches[0] < 1);
  h.controller.pointerUp(h.event(1, 700, 450, 'touch'));
  const state = h.controller.getState();
  assert.equal(state.pointerCount, 1);
  assert.ok(state.anchor, 'ピンチ後にアンカーが取り直されていない');
  assertProjection(h.camera, state.anchor.point, { x: 780, y: 450 }, h.viewport, 'pinch→one anchor');
  // 残った指を動かすと、その位置を新しい掴み点として追従する。
  h.controller.pointerMove(h.event(2, 800, 470, 'touch'));
  assertProjection(h.camera, state.anchor.point, { x: 800, y: 470 }, h.viewport, 'pinch→one drag');
  h.controller.pointerUp(h.event(2, 800, 470, 'touch'));
  assert.equal(h.taps.length, 0, 'ピンチ後にタップ扱いになった');
  assert.equal(h.controller.getState().pointerCount, 0);
});

test('[stale] モード変更後の最初の移動はアンカーを取り直し、カメラを飛ばさない', () => {
  const h = harness('outside');
  h.controller.pointerDown(h.event(1, 720, 450, 'mouse'));
  h.camera = C.createInsideCamera(CENTER, RADIUS, { azimuth: 0, elevation: 0 });
  const before = { azimuth: h.camera.azimuth, elevation: h.camera.elevation };
  h.controller.pointerMove(h.event(1, 760, 450, 'mouse'));
  assert.equal(h.camera.azimuth, before.azimuth, '古いアンカーで回転した');
  assert.equal(h.camera.elevation, before.elevation);
  const anchor = h.controller.getState().anchor;
  assert.ok(anchor);
  assert.equal(anchor.mode, 'inside');
  assertProjection(h.camera, anchor.point, { x: 760, y: 450 }, h.viewport, 'mode re-anchor');
  // 2回目の移動は新しいアンカーで回転する。
  h.controller.pointerMove(h.event(1, 800, 450, 'mouse'));
  assertProjection(h.camera, anchor.point, { x: 800, y: 450 }, h.viewport, 'mode drag');
});

test('[stale] ビューポート変更後の最初の移動もアンカーを取り直す', () => {
  const h = harness('outside');
  h.controller.pointerDown(h.event(1, 720, 450, 'mouse'));
  h.viewport.width = 1000;
  h.viewport.height = 700;
  const before = { azimuth: h.camera.azimuth, elevation: h.camera.elevation };
  h.controller.pointerMove(h.event(1, 650, 420, 'mouse'));
  assert.equal(h.camera.azimuth, before.azimuth);
  assert.equal(h.camera.elevation, before.elevation);
  const anchor = h.controller.getState().anchor;
  assert.equal(anchor.viewport.width, 1000);
  assert.equal(anchor.viewport.height, 700);
  assertProjection(h.camera, anchor.point, { x: 650, y: 420 }, h.viewport, 'viewport re-anchor');
});

test('[cancel] pointercancel でアンカーが残らず、タップにもならない', () => {
  const h = harness('outside');
  h.controller.pointerDown(h.event(1, 720, 450, 'touch'));
  h.controller.pointerMove(h.event(1, 760, 450, 'touch'));
  h.controller.pointerCancel(h.event(1, 760, 450, 'touch'));
  const state = h.controller.getState();
  assert.equal(state.pointerCount, 0);
  assert.equal(state.anchor, null);
  assert.equal(h.taps.length, 0);
  // 動かさないキャンセルもタップにしない。
  h.controller.pointerDown(h.event(2, 700, 400, 'touch'));
  h.controller.pointerCancel(h.event(2, 700, 400, 'touch'));
  assert.equal(h.taps.length, 0);
});

test('[tap] 4px を超える移動は選択にしない（ドラッグとタップの境界）', () => {
  const h = harness('outside');
  h.controller.pointerDown(h.event(1, 700, 450, 'mouse'));
  h.controller.pointerMove(h.event(1, 703, 451, 'mouse'));
  h.controller.pointerUp(h.event(1, 703, 451, 'mouse'));
  assert.equal(h.taps.length, 1);
  h.controller.pointerDown(h.event(2, 700, 450, 'mouse'));
  h.controller.pointerMove(h.event(2, 710, 450, 'mouse'));
  h.controller.pointerUp(h.event(2, 710, 450, 'mouse'));
  assert.equal(h.taps.length, 1, 'ドラッグをタップとして扱った');
});
