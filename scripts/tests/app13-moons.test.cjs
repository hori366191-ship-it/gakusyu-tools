'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const bodies = import('../../site/app13/bodies.mjs');
const moons = import('../../site/app13/moons.mjs');
const memos = import('../../site/app13/moon-observations.mjs');
const views = import('../../site/app13/views.mjs');

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = ([x, y, z], [X, Y, Z]) => [y * Z - z * Y, z * X - x * Z, x * Y - y * X];

test('only the six planet menus have satellites, with unique targets and unchanged overview bodies', async () => {
  const { BODIES } = await bodies;
  const { MOONS, moonsOf } = await moons;
  assert.equal(BODIES.length, 9);
  const counts = { sun: 0, mercury: 0, venus: 0, earth: 1, mars: 2, jupiter: 4, saturn: 7, uranus: 5, neptune: 2 };
  for (const body of BODIES) {
    assert.equal(moonsOf(body.id).length, counts[body.id]);
    assert.ok(moonsOf(body.id).every(moon => moon.parentId === body.id));
  }
  assert.equal(MOONS.length, 21);
  assert.equal(new Set([...BODIES, ...MOONS].map(body => body.id)).size, 30);
  assert.deepEqual(moonsOf(undefined), []);
  assert.deepEqual(moonsOf('titan'), []);
});

test('mean orbit, periods and radii use one scale without intersecting the modeled planet and rings', async () => {
  const { BODIES, SCENE_UNITS_PER_AU, sceneRadius, sceneRadii } = await bodies;
  const { MOONS, moonOffsetAt, moonMeanAt, moonOrbitNormal } = await moons;
  const planetById = new Map(BODIES.map(p => [p.id, p]));
  const ringExtent = { saturn: 2.34, uranus: 2.03 };
  for (const moon of MOONS) {
    const parent = planetById.get(moon.parentId);
    const [r] = sceneRadii(parent);
    assert.ok(moon.a * (1 - moon.e) * SCENE_UNITS_PER_AU - sceneRadius(moon) > r * (ringExtent[parent.id] ?? 1), moon.id);
    const orbitNormal = moonOrbitNormal(moon);
    assert.ok(Math.abs(Math.hypot(...orbitNormal) - 1) < 1e-13);
    for (const t of [-1.5, 0, moon.period / 11, moon.period * .39]) {
      const p = moonOffsetAt(moon, t);
      const q = moonOffsetAt(moon, t + moon.period);
      assert.ok(Math.hypot(...sub(p, q)) < moon.a * 1e-11, moon.id);
      assert.ok(Math.abs(dot(p, orbitNormal)) < moon.a * 1e-12, moon.id);
    }
    const t0 = -moonMeanAt(moon, 0) * moon.period / (2 * Math.PI);
    const min = Math.hypot(...moonOffsetAt(moon, t0));
    const max = Math.hypot(...moonOffsetAt(moon, t0 + moon.period / 2));
    assert.ok(Math.abs(min / moon.a - (1 - moon.e)) < 1e-12, moon.id);
    assert.ok(Math.abs(max / moon.a - (1 + moon.e)) < 1e-12, moon.id);
  }
  const moon = MOONS.find(body => body.id === 'moon');
  assert.ok(Math.abs(moon.a * SCENE_UNITS_PER_AU / sceneRadius(moon) - 384400 / 1737.4) < 1e-9);
});

test('Triton is retrograde about the equatorial pole and Nereid has a strongly eccentric orbit', async () => {
  const { moonsOf, moonOffsetAt } = await moons;
  const [triton, nereid] = moonsOf('neptune');
  const angular = moon => cross(moonOffsetAt(moon, 0), moonOffsetAt(moon, moon.period / 50));
  assert.ok(angular(triton)[1] < 0);
  assert.ok(angular(nereid)[1] > 0);
  assert.ok((1 + nereid.e) / (1 - nereid.e) > 7);
});

test('parent to satellite camera arcs are continuous at the guide, keep clearance and preserve endpoints', async () => {
  const { satelliteTransferPoint } = await views;
  const start = [4, .8, 0], end = [-2.9, .3, -.05], guide = [0, 1, 0];
  for (const [a, b] of [[start, end], [end, start], [start, [0, 90000, 0]]]) {
    const at = t => satelliteTransferPoint(a, b, guide, t, 2.44);
    assert.deepEqual(at(0), a);
    assert.deepEqual(at(1), b);
    assert.ok(Math.hypot(...sub(at(.4 - 1e-7), at(.4 + 1e-7))) < .02);
    let last = at(0);
    for (let j = 1; j <= 100; j++) {
      const point = at(j / 100);
      assert.ok(point.every(Number.isFinite));
      assert.ok(Math.hypot(...point) >= 2.44);
      if (b === end || b === start) assert.ok(Math.hypot(...sub(point, last)) < .35);
      last = point;
    }
  }
});

test('all satellite observation memos are attributable and show centre distance and period', async () => {
  const { MOONS, moonReadings } = await moons;
  const { moonMemos } = await memos;
  for (const body of MOONS) {
    const { intro, task, why, items, sources } = moonMemos[body.id];
    assert.ok(intro && task && why, body.id);
    assert.equal(items.length, 2);
    assert.ok(items.every(({ title, text }) => title && text));
    assert.ok(sources.every(({ href }) => /^https:\/\/(science\.nasa\.gov|ssd\.jpl\.nasa\.gov)\//.test(href)));
    const values = moonReadings(body, '親惑星名');
    assert.equal(values.length, 4);
    assert.match(values[2][0], /親惑星中心/);
    assert.match(values[3][1], body.id === 'triton' ? /逆行/ : /日|時間/);
  }
});
