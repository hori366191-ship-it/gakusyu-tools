/**
 * site/app13 の接近観察（到着後の手動周回）のオフライン回帰テスト。
 * 実行: node --test scripts/tests/app13-observation.test.cjs
 *
 * 外部API・ブラウザ・three.js には接続しない。views.mjs の純粋関数と、
 * ドラッグ面になる HTML/CSS の契約だけを扱う。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const APP = join(__dirname, '..', '..', 'site', 'app13');
const views = import('../../site/app13/views.mjs');
const read = name => readFileSync(join(APP, name), 'utf8');

const norm = ([x, y, z]) => Math.hypot(x, y, z);
const elevationOf = ([, y]) => Math.asin(Math.max(-1, Math.min(1, y)));

function near(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}

test('dragging orbits at a constant distance from the body centre', async () => {
  const { orbitAngles, orbitDirection } = await views;
  const bases = [
    [0, 0, 1], [0, 0, -1], [.4, .42, .81], [-.85, .1, .51], [0, 1, 0], [0, -1, 0],
  ];
  for (const base of bases) {
    const angles = orbitAngles(base);
    for (let yaw = -4; yaw <= 4; yaw += .37) {
      for (let pitch = -3; pitch <= 3; pitch += .29) {
        const direction = orbitDirection(angles, yaw, pitch);
        near(norm(direction), 1, 1e-12);
        assert.ok(Number.isFinite(direction[0]) && Number.isFinite(direction[1]) && Number.isFinite(direction[2]));
      }
    }
  }
});

test('manual elevation stops before the pole so the look-at stays stable', async () => {
  const { ORBIT_ELEVATION_LIMIT, orbitAngles, orbitDirection } = await views;
  assert.ok(ORBIT_ELEVATION_LIMIT < Math.PI / 2);
  const angles = orbitAngles([0, .3, 1]);
  near(elevationOf(orbitDirection(angles, 0, 9)), ORBIT_ELEVATION_LIMIT);
  near(elevationOf(orbitDirection(angles, 0, -9)), -ORBIT_ELEVATION_LIMIT);
  for (let yaw = -7; yaw <= 7; yaw += .5) {
    const elevation = elevationOf(orbitDirection(angles, yaw, 9));
    assert.ok(elevation <= ORBIT_ELEVATION_LIMIT + 1e-12);
  }
  // The azimuth keeps moving even while the elevation is pinned.
  const left = orbitDirection(angles, 5, 9), right = orbitDirection(angles, 6, 9);
  assert.ok(Math.abs(left[0] - right[0]) > 1e-6 || Math.abs(left[2] - right[2]) > 1e-6);
});

test('pitch bounds always include the unrotated pose and never exceed the limit', async () => {
  const { ORBIT_ELEVATION_LIMIT, orbitAngles, orbitDirection, orbitPitchBounds } = await views;
  for (const base of [[0, 0, 1], [0, .96, .28], [.1, -.72, .68], [0, .008, 1]]) {
    const angles = orbitAngles(base);
    const [low, high] = orbitPitchBounds(angles.elevation);
    assert.ok(low <= 0 && high >= 0);
    near(elevationOf(orbitDirection(angles, 0, low)), -ORBIT_ELEVATION_LIMIT);
    near(elevationOf(orbitDirection(angles, 0, high)), ORBIT_ELEVATION_LIMIT);
  }
});

test('a full turn returns the same view and a captured pose reproduces itself', async () => {
  const { orbitAngles, orbitDirection } = await views;
  const base = [-.6, .35, .72];
  const angles = orbitAngles(base);
  const start = orbitDirection(angles, 0, 0);
  const turned = orbitDirection(angles, 2 * Math.PI, 0);
  start.forEach((value, i) => near(turned[i], value, 1e-9));
  // Re-capturing a dragged pose (as travelTo does) must not jump the frame.
  for (let yaw = -3; yaw <= 3; yaw += .7) {
    const dragged = orbitDirection(angles, yaw, .4);
    const captured = orbitAngles(dragged);
    const replay = orbitDirection(captured, 0, 0);
    dragged.forEach((value, i) => near(replay[i], value, 1e-9));
  }
  // The base pose itself is preserved exactly at zero offset.
  const plain = orbitDirection(angles, 0, 0);
  const unit = norm(base);
  base.forEach((value, i) => near(plain[i], value / unit, 1e-12));
});

test('the arrival view is the only drag surface and touch gestures are scoped to it', () => {
  const html = read('index.html');
  const css = read('app.css');
  const viewer = read('viewer.mjs');
  assert.match(html, /<div id="flight-view" class="flight-view" aria-hidden="true"><\/div>/);
  assert.match(html, /<main id="mission" class="mission" data-mode="overview">/);
  assert.match(html, /<p id="announce" class="sr-only" role="status"><\/p>/);
  assert.match(html, /id="learn-dialog"/);
  assert.match(html, /id="edge-on"[^>]*hidden/);
  // The canvas layer sits behind the page; the shade must not swallow drags.
  assert.match(css, /\.screen-shade\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /#orbit-chart\s*\{[^}]*pointer-events:\s*none/);
  // Dragging is wired for pointer capture with a lost-capture cleanup.
  assert.match(viewer, /stage\.addEventListener\('pointerdown', startDrag\)/);
  assert.match(viewer, /stage\.setPointerCapture\(event\.pointerId\)/);
  assert.match(viewer, /stage\.addEventListener\('lostpointercapture', endDrag\)/);
  assert.match(viewer, /mode === 'follow' && !modal\(\)/);
});
