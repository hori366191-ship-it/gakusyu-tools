/**
 * app11-3d-sphere — カメラ（球の外 / 球の中）の回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-camera.test.cjs
 *
 * 対象: site/app11/3d/sphere-camera.js
 *   - outside は常に球の外（距離 >= radius * 1.08）。オービットで距離が変わらない
 *   - inside は視点が球の中心に固定され、オービット・ズームで位置が動かない
 *   - 選択点は usableRect（実測パネル矩形から算出）の中心へ投影される
 *   - モード切替後も選択点のフレーミングとモード制約が保たれる
 *   - 方位の補間は最短回り、距離は対数、reduced-motion では切替時間 0
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PUB = path.join(ROOT, 'site', 'app11', '3d', 'projection.js');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const Base = require(PUB);
const extend = require(path.join(LAB, 'sphere-camera.js'));
const C = extend(Base);

const CENTER = { x: 0, y: 0, z: 0 };
const RADIUS = 100;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

function rectFor(viewport, panels) {
  return Base.computeUsableViewport(viewport, panels);
}

function pointAt(x, y, z) {
  const n = Math.hypot(x, y, z) || 1;
  return { x: RADIUS * x / n, y: RADIUS * y / n, z: RADIUS * z / n };
}

test('[outside] 初期カメラは球全体を収め、常に球の外にいる', () => {
  const camera = C.createOutsideCamera(CENTER, RADIUS, {});
  assert.equal(camera.mode, 'outside');
  assert.ok(camera.distance >= RADIUS * 1.08);
  assert.ok(C.isOutside(camera, RADIUS));
  const basis = C.cameraBasis(camera);
  const eyeRadius = Math.hypot(basis.eye.x, basis.eye.y, basis.eye.z);
  assert.ok(Math.abs(eyeRadius - camera.distance) < 1e-9);
  // 全スロットが視錐台の手前にある（near より奥）。
  const slot = { x: 0, y: 0, z: RADIUS };
  const view = C.cameraView(camera, slot, DESKTOP);
  assert.ok(view && view.z > 0);
});

test('[outside] オービットしても距離が変わらず、ズームは球の中へ入らない', () => {
  let camera = C.createOutsideCamera(CENTER, RADIUS, { azimuth: 20, elevation: 35 });
  const distance = camera.distance;
  for (let i = 0; i < 40; i++) {
    camera = C.orbitCamera(camera, (i % 2 ? 1 : -1) * 37, (i % 3 ? 1 : -1) * 21);
    const eye = C.cameraBasis(camera).eye;
    const eyeRadius = Math.hypot(eye.x, eye.y, eye.z);
    assert.ok(Math.abs(eyeRadius - distance) < 1e-9, 'orbit が距離を変えた');
    assert.ok(eyeRadius >= RADIUS * 1.08 - 1e-9);
  }
  for (let i = 0; i < 60; i++) camera = C.zoomCamera(camera, 0.75, { radius: RADIUS });
  assert.ok(camera.distance >= RADIUS * 1.08 - 1e-9, 'ズームで球に入った: ' + camera.distance);
  assert.ok(C.isOutside(camera, RADIUS));
  for (let i = 0; i < 80; i++) camera = C.zoomCamera(camera, 1.6, { radius: RADIUS });
  assert.ok(camera.distance <= RADIUS * 12 + 1e-9);
  const eye = C.cameraBasis(camera).eye;
  assert.ok(Math.hypot(eye.x, eye.y, eye.z) >= RADIUS * 1.08 - 1e-9);
});

test('[outside] 仰角は範囲内にクランプされる', () => {
  let camera = C.createOutsideCamera(CENTER, RADIUS, {});
  for (let i = 0; i < 100; i++) camera = C.orbitCamera(camera, 0, 50);
  assert.ok(C.toDeg(camera.elevation) >= -88 - 1e-9);
  for (let i = 0; i < 200; i++) camera = C.orbitCamera(camera, 0, -50);
  assert.ok(C.toDeg(camera.elevation) <= 88 + 1e-9);
});

test('[frame] 極に近いスロット（|y| < 1）でも選択点を中心へ置ける', () => {
  // Fibonacci 球の最大 |y| は 1 - 1/n。固定スロットを選んでも仰角クランプで
  // 中心からずれないことを確認する。
  const nearPole = pointAt(0.02, 0.9976, 0.03);
  const rect = { x: 0, y: 120, width: 1000, height: 700 };
  for (const camera of [
    C.createOutsideCamera(CENTER, RADIUS, {}),
    C.createInsideCamera(CENTER, RADIUS, {})
  ]) {
    const framed = C.framePoint(camera, nearPole, CENTER, rect, DESKTOP, { radius: RADIUS });
    const view = C.cameraView(framed, nearPole, DESKTOP);
    assert.ok(Math.abs(view.x - (rect.x + rect.width / 2)) < 1e-6);
    assert.ok(Math.abs(view.y - (rect.y + rect.height / 2)) < 1e-6);
  }
});

test('[inside] 視点は球の中心に固定され、オービットでもズームでも動かない', () => {
  let camera = C.createInsideCamera(CENTER, RADIUS, {});
  assert.equal(camera.mode, 'inside');
  assert.equal(camera.distance, 0);
  const eye0 = C.cameraBasis(camera).eye;
  assert.ok(Math.abs(eye0.x) < 1e-12 && Math.abs(eye0.y) < 1e-12 && Math.abs(eye0.z) < 1e-12);

  for (let i = 0; i < 30; i++) {
    camera = C.orbitCamera(camera, (i % 2 ? 1 : -1) * 41, (i % 3 ? 1 : -1) * 17);
    const eye = C.cameraBasis(camera).eye;
    assert.ok(Math.abs(eye.x) < 1e-12 && Math.abs(eye.y) < 1e-12 && Math.abs(eye.z) < 1e-12);
    assert.equal(camera.distance, 0);
  }
  const fov = camera.fov;
  camera = C.zoomCamera(camera, 0.5, { radius: RADIUS });
  assert.ok(camera.fov < fov, 'ズームで画角が狭くならない');
  assert.equal(camera.distance, 0);
  for (let i = 0; i < 40; i++) camera = C.zoomCamera(camera, 0.5, { radius: RADIUS });
  assert.ok(C.toDeg(camera.fov) >= C.INSIDE_FOV_MIN - 1e-9);
  for (let i = 0; i < 80; i++) camera = C.zoomCamera(camera, 1.6, { radius: RADIUS });
  assert.ok(C.toDeg(camera.fov) <= C.INSIDE_FOV_MAX + 1e-9);
  const eye = C.cameraBasis(camera).eye;
  assert.ok(Math.abs(eye.x) + Math.abs(eye.y) + Math.abs(eye.z) < 1e-12);
});

test('[inside] 視線の裏側の点は投影されない', () => {
  const camera = C.createInsideCamera(CENTER, RADIUS, { azimuth: 0, elevation: 0 });
  const front = C.cameraView(camera, { x: 0, y: 0, z: RADIUS }, DESKTOP);
  const back = C.cameraView(camera, { x: 0, y: 0, z: -RADIUS }, DESKTOP);
  assert.ok(front && front.z > 0);
  assert.equal(back, null);
});

test('[frame] outside の選択点は usableRect の中心へ投影される（desktop / mobile）', () => {
  const desktopRect = rectFor(DESKTOP, {
    header: { x: 0, y: 0, width: 1440, height: 120 },
    toolbar: { x: 0, y: 790, width: 1440, height: 110 },
    detail: { x: 1040, y: 150, width: 400, height: 620 }
  });
  const mobileRect = rectFor(MOBILE, {
    header: { x: 0, y: 0, width: 390, height: 150 },
    toolbar: { x: 0, y: 660, width: 390, height: 100 },
    detail: { x: 0, y: 420, width: 390, height: 240 }
  });
  const camera = C.createOutsideCamera(CENTER, RADIUS, {});
  const point = pointAt(0.3, 0.5, 0.8);
  for (const [viewport, rect] of [[DESKTOP, desktopRect], [MOBILE, mobileRect]]) {
    const framed = C.framePoint(camera, point, CENTER, rect, viewport, { radius: RADIUS });
    const view = C.cameraView(framed, point, viewport);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    assert.ok(Math.abs(view.x - cx) < 1e-6, 'x=' + view.x + ' cx=' + cx);
    assert.ok(Math.abs(view.y - cy) < 1e-6, 'y=' + view.y + ' cy=' + cy);
    // 距離（ズーム）は変えない。球の外のまま。
    assert.ok(Math.abs(framed.distance - camera.distance) < 1e-9);
    assert.ok(C.isOutside(framed, RADIUS));
  }
});

test('[frame] inside の選択点も usableRect の中心へ投影され、視点は中心のまま', () => {
  const rect = rectFor(DESKTOP, {
    header: { x: 0, y: 0, width: 1440, height: 120 },
    detail: { x: 1040, y: 150, width: 400, height: 620 }
  });
  const camera = C.createInsideCamera(CENTER, RADIUS, {});
  const point = pointAt(-0.6, 0.2, 0.77);
  const framed = C.framePoint(camera, point, CENTER, rect, DESKTOP, { radius: RADIUS });
  const view = C.cameraView(framed, point, DESKTOP);
  assert.ok(Math.abs(view.x - (rect.x + rect.width / 2)) < 1e-6);
  assert.ok(Math.abs(view.y - (rect.y + rect.height / 2)) < 1e-6);
  const eye = C.cameraBasis(framed).eye;
  assert.ok(Math.abs(eye.x) + Math.abs(eye.y) + Math.abs(eye.z) < 1e-12);
});

test('[switch] outside → inside で選択点を保持し、inside → outside で球の外へ戻る', () => {
  const point = pointAt(0.2, 0.4, 0.9);
  const rect = { x: 0, y: 120, width: 1000, height: 700 };
  const outside = C.createOutsideCamera(CENTER, RADIUS, { azimuth: -35, elevation: 18 });
  const inside = C.switchModeCamera(outside, 'inside', {
    center: CENTER,
    radius: RADIUS,
    point: point,
    rect: rect,
    viewport: DESKTOP
  });
  assert.equal(inside.mode, 'inside');
  const view = C.cameraView(inside, point, DESKTOP);
  assert.ok(Math.abs(view.x - (rect.x + rect.width / 2)) < 1e-6);
  assert.ok(Math.abs(view.y - (rect.y + rect.height / 2)) < 1e-6);
  assert.ok(Math.abs(C.cameraBasis(inside).eye.x) < 1e-12);

  const back = C.switchModeCamera(inside, 'outside', {
    center: CENTER,
    radius: RADIUS,
    point: point,
    rect: rect,
    viewport: DESKTOP,
    distance: 260
  });
  assert.equal(back.mode, 'outside');
  assert.ok(C.isOutside(back, RADIUS));
  assert.ok(Math.abs(back.distance - 260) < 1e-9);
  const view2 = C.cameraView(back, point, DESKTOP);
  assert.ok(Math.abs(view2.x - (rect.x + rect.width / 2)) < 1e-6);
  assert.ok(Math.abs(view2.y - (rect.y + rect.height / 2)) < 1e-6);
});

test('[interpolate] 方位は最短回り・距離は対数・screenOffset も補間される', () => {
  const from = C.createOutsideCamera(CENTER, RADIUS, { azimuth: 170, elevation: -10, distance: 200 });
  const to = C.createOutsideCamera(CENTER, RADIUS, { azimuth: -170, elevation: 30, distance: 800 });
  to.screenOffset = { x: -220, y: 20 };
  const mid = C.interpolateCamera(from, to, 0.5);
  assert.equal(mid.mode, 'outside');
  // 170° → -170° は +20° 回る（340° 回らない）。
  const delta = Math.abs(Base.toDeg(mid.azimuth) - 180) < 1e-6 ? 180 : Math.abs(Base.toDeg(mid.azimuth));
  assert.ok(delta <= 180 + 1e-6);
  assert.ok(Math.abs(Base.toDeg(mid.azimuth) - 180) < 1e-6 || Math.abs(Base.toDeg(mid.azimuth) + 180) < 1e-6);
  const expectedDistance = Math.exp((Math.log(200) + Math.log(800)) / 2);
  assert.ok(Math.abs(mid.distance - expectedDistance) < 1e-9);
  assert.ok(Math.abs(mid.screenOffset.x + 110) < 1e-9);
  assert.ok(Math.abs(mid.screenOffset.y - 10) < 1e-9);

  const insideFrom = C.createInsideCamera(CENTER, RADIUS, { fov: 60 });
  const insideTo = C.createInsideCamera(CENTER, RADIUS, { fov: 90 });
  const insideMid = C.interpolateCamera(insideFrom, insideTo, 0.5);
  assert.equal(insideMid.mode, 'inside');
  assert.ok(Math.abs(C.toDeg(insideMid.fov) - 75) < 1e-9);
  assert.equal(insideMid.distance, 0);
});

test('[reduced-motion] 切替時間は 0（即時）', () => {
  assert.deepEqual(C.switchTiming(true), { fadeOut: 0, hold: 0, fadeIn: 0 });
  const normal = C.switchTiming(false);
  assert.ok(normal.fadeOut > 0 && normal.hold >= 0 && normal.fadeIn > 0);
  assert.ok(normal.fadeOut + normal.hold + normal.fadeIn < 700, '切替が長すぎる');
});

test('[no-pan] このカメラ層は平行移動 API を持たず、中心が動かない', () => {
  const outside = C.createOutsideCamera(CENTER, RADIUS, {});
  const orbited = C.orbitCamera(outside, 120, 80);
  assert.ok(Math.abs(orbited.target.x - CENTER.x) < 1e-12);
  assert.ok(Math.abs(orbited.target.y - CENTER.y) < 1e-12);
  assert.ok(Math.abs(orbited.target.z - CENTER.z) < 1e-12);
  assert.equal(typeof C.panSphereCamera, 'undefined');
});

/* ------------------------------------------------------------------ *
 * 掴んで運ぶドラッグ（Google Earth 風）
 * ------------------------------------------------------------------ */

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 }
};

function makeCamera(mode) {
  return mode === 'inside'
    ? C.createInsideCamera(CENTER, RADIUS, { azimuth: -35, elevation: 18 })
    : C.createOutsideCamera(CENTER, RADIUS, { azimuth: -35, elevation: 18 });
}

function assertProjection(camera, point, target, viewport, label) {
  const view = C.cameraView(camera, point, viewport);
  assert.ok(view, (label || '') + ': 掴んだ点が投影されない');
  const error = Math.hypot(view.x - target.x, view.y - target.y);
  assert.ok(error < 1e-6, (label || '') + ': 投影誤差 ' + error + 'px');
  return error;
}

test('[grab] outside / inside の水平・垂直ドラッグで、掴んだ球面点がポインタ直下に残る', () => {
  const errors = [];
  for (const mode of ['outside', 'inside']) {
    for (const viewport of Object.values(VIEWPORTS)) {
      const start = { x: viewport.width / 2, y: viewport.height / 2 };
      const targets = [
        { x: start.x + 90, y: start.y },
        { x: start.x - 90, y: start.y },
        { x: start.x, y: start.y + 90 },
        { x: start.x, y: start.y - 90 }
      ];
      for (const target of targets) {
        const camera = makeCamera(mode);
        const anchor = C.createGrabAnchor(camera, start.x, start.y, viewport, {
          center: CENTER,
          radius: RADIUS
        });
        assert.ok(anchor && anchor.point, mode + ': アンカーが取れない');
        assert.equal(anchor.mode, mode);
        const next = C.dragSphereCamera(camera, anchor, target.x, target.y, viewport, {
          center: CENTER,
          radius: RADIUS
        });
        errors.push(assertProjection(next, anchor.point, target, viewport,
          mode + ' ' + viewport.width + 'x' + viewport.height));
        // 掴んだ点がポインタ直下に残ること自体が上下反転の不在を意味する。
        if (mode === 'outside') {
          assert.ok(Math.abs(next.distance - camera.distance) < 1e-9, '距離が変わった');
          assert.ok(C.isOutside(next, RADIUS));
        } else {
          assert.equal(next.distance, 0);
          const eye = C.cameraBasis(next).eye;
          assert.ok(Math.abs(eye.x) + Math.abs(eye.y) + Math.abs(eye.z) < 1e-12);
        }
      }
    }
  }
  const maxError = Math.max.apply(null, errors);
  assert.ok(maxError < 1e-6, '最大投影誤差 ' + maxError);
});

test('[grab] 極をまたいでも方位の折り返しだけで連続し、投影誤差が出ない（南北・両モード）', () => {
  for (const mode of ['outside', 'inside']) {
    for (const pole of [1, -1]) {
      const viewport = VIEWPORTS.desktop;
      const camera = makeCamera(mode);
      camera.azimuth = 0;
      camera.elevation = C.toRad(pole * 89);
      const anchorY = pole > 0 ? 480 : 420;
      const anchor = C.createGrabAnchor(camera, 720, anchorY, viewport, {
        center: CENTER,
        radius: RADIUS
      });
      assert.ok(anchor);
      let current = camera;
      let crossed = false;
      let previousAzimuth = C.toDeg(current.azimuth);
      let maxError = 0;
      const ys = pole > 0 ? [490, 500, 510, 520] : [410, 400, 390, 380];
      for (const y of ys) {
        const next = C.dragSphereCamera(current, anchor, 720, y, viewport, {
          center: CENTER,
          radius: RADIUS
        });
        assert.ok(Number.isFinite(C.toDeg(next.elevation)), '仰角が NaN');
        assert.ok(Number.isFinite(next.azimuth), '方位が NaN');
        maxError = Math.max(maxError, assertProjection(next, anchor.point, { x: 720, y }, viewport,
          mode + ' pole ' + pole + ' y=' + y));
        const azimuth = C.toDeg(next.azimuth);
        if (Math.abs(Math.abs(azimuth) - Math.abs(previousAzimuth)) > 90) crossed = true;
        // 極をまたいでも forward は連続（±1 を越えて NaN にしない）。
        const forward = C.cameraBasis(next).forward;
        assert.ok(Math.abs(forward.y) <= 1 + 1e-9);
        if (mode === 'outside') assert.ok(Math.abs(next.distance - camera.distance) < 1e-9);
        previousAzimuth = azimuth;
        current = next;
      }
      assert.ok(crossed, mode + ' pole ' + pole + ': 極をまたぐ方位の折り返しがない');
      assert.ok(maxError < 1e-6, '極越えの投影誤差 ' + maxError);
    }
  }
});

test('[grab] ちょうど極（forward = ±Y）の姿勢でも破綻せず、ドラッグで投影が一致する', () => {
  const viewport = VIEWPORTS.desktop;
  for (const mode of ['outside', 'inside']) {
    for (const sign of [1, -1]) {
      const camera = makeCamera(mode);
      // outside は eye 方向 = -forward、inside は視線 = forward。
      const forward = mode === 'outside'
        ? { x: 0, y: -sign, z: 0 }
        : { x: 0, y: sign, z: 0 };
      const right = { x: 1, y: 0, z: 0 };
      // right × forward が up。outside は forward = -eye 方向で符号が反転する。
      const up = { x: 0, y: 0, z: mode === 'inside' ? sign : -sign };
      camera.frame = { right, up, forward };
      camera.azimuth = 0;
      camera.elevation = C.toRad(sign * 90);
      const anchor = C.createGrabAnchor(camera, 720, 450, viewport, {
        center: CENTER,
        radius: RADIUS
      });
      assert.ok(anchor);
      for (const target of [{ x: 780, y: 450 }, { x: 660, y: 470 }, { x: 720, y: 390 }]) {
        const next = C.dragSphereCamera(camera, anchor, target.x, target.y, viewport, {
          center: CENTER,
          radius: RADIUS
        });
        assertProjection(next, anchor.point, target, viewport, mode + ' exact pole ' + sign);
        const basis = C.cameraBasis(next);
        assert.ok(Number.isFinite(basis.forward.y));
        assert.ok(Number.isFinite(basis.right.x) && Number.isFinite(basis.up.z));
      }
    }
  }
});

test('[grab] screenOffset（usableRect の主点ずらし）があってもポインタ位置が一致する', () => {
  const viewport = { width: 1440, height: 900 };
  for (const mode of ['outside', 'inside']) {
    const camera = C.withUsableRect(makeCamera(mode), { x: 0, y: 120, width: 1000, height: 700 }, viewport);
    const start = { x: 500, y: 470 };
    const target = { x: 600, y: 540 };
    const anchor = C.createGrabAnchor(camera, start.x, start.y, viewport, {
      center: CENTER,
      radius: RADIUS
    });
    const next = C.dragSphereCamera(camera, anchor, target.x, target.y, viewport, {
      center: CENTER,
      radius: RADIUS
    });
    assertProjection(next, anchor.point, target, viewport, mode + ' screenOffset');
  }
});

test('[grab] 縁を外れたポインタでも破綻せず、outside は外側距離を保つ', () => {
  const viewport = VIEWPORTS.desktop;
  const camera = C.createOutsideCamera(CENTER, RADIUS, { azimuth: 0, elevation: 0 });
  const anchor = C.createGrabAnchor(camera, 720, 450, viewport, {
    center: CENTER,
    radius: RADIUS
  });
  const next = C.dragSphereCamera(camera, anchor, 50, 20, viewport, {
    center: CENTER,
    radius: RADIUS
  });
  assert.ok(Number.isFinite(next.azimuth) && Number.isFinite(next.elevation));
  assert.ok(Math.abs(next.distance - camera.distance) < 1e-9);
  assert.ok(C.isOutside(next, RADIUS));
});

test('[interpolate] ドラッグで生じたロール（frame）は遷移中に slerp され、切替の瞬間に飛ばない', () => {
  const viewport = VIEWPORTS.desktop;
  let camera = C.createOutsideCamera(CENTER, RADIUS, { azimuth: 0, elevation: 0 });
  const anchor = C.createGrabAnchor(camera, 720, 450, viewport, { center: CENTER, radius: RADIUS });
  camera = C.dragSphereCamera(camera, anchor, 820, 520, viewport, { center: CENTER, radius: RADIUS });
  assert.ok(camera.frame, 'ドラッグ後に frame がない');
  const target = C.facePoint(camera, pointAt(0.2, 0.3, 0.9), CENTER, { radius: RADIUS });
  const nearStart = C.interpolateCamera(camera, target, 0.01);
  const startFrame = C.cameraFrame(camera);
  const nearFrame = C.cameraFrame(nearStart);
  const dot = startFrame.forward.x * nearFrame.forward.x +
    startFrame.forward.y * nearFrame.forward.y +
    startFrame.forward.z * nearFrame.forward.z;
  assert.ok(dot > 0.9999, '遷移開始で姿勢が飛んだ: ' + dot);
});
