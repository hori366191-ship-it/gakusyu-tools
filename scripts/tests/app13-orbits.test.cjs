const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = import('../../site/app13/bodies.mjs');

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}

const norm = ([x, y, z]) => Math.hypot(x, y, z);
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];

test('the Kepler solver converges for all model eccentricities across the phase wrap', async () => {
  const { BODIES, TAU, eccentricAnomaly } = await source;
  for (const body of BODIES.slice(1)) {
    for (let j = -80; j <= 80; j++) {
      const m = j * .39;
      const e = eccentricAnomaly(m, body.e);
      near(e - body.e * Math.sin(e), ((m % TAU) + TAU) % TAU);
    }
  }
});

test('planetary distances and plane inclinations match the orbital elements', async () => {
  const { BODIES, RAD, orbitalPoint, positionAt } = await source;
  assert.deepEqual(positionAt(BODIES[0], 137), [0, 0, 0]);
  for (const body of BODIES.slice(1)) {
    const peri = orbitalPoint(body, 0);
    const apo = orbitalPoint(body, Math.PI);
    near(norm(peri), body.a * (1 - body.e));
    near(norm(apo), body.a * (1 + body.e));
    const normal = cross(peri, orbitalPoint(body, Math.PI / 2));
    near(normal[1] / norm(normal), Math.cos(body.i * RAD));
    const atStart = positionAt(body, 0), afterPeriod = positionAt(body, body.period);
    atStart.forEach((n, k) => near(n, afterPeriod[k]));
  }
});

test('in equal time intervals Mercury sweeps equal areas but travels faster at perihelion', async () => {
  const { BODIES, orbitalPoint } = await source;
  const mercury = BODIES[1];
  const segment = mean => {
    const a = orbitalPoint(mercury, mean);
    const b = orbitalPoint(mercury, mean + .0001);
    return { distance: norm(a.map((value, i) => value - b[i])), area: norm(cross(a, b)) / 2 };
  };
  const nearSun = segment(0), farFromSun = segment(Math.PI);
  near(nearSun.area, farFromSun.area, 1e-12);
  assert.ok(nearSun.distance > 1.45 * farFromSun.distance);
});

test('radii and orbits share the same physical unit', async () => {
  const { BODIES, AU_KM, SCENE_UNITS_PER_AU, sceneRadius, sceneRadii, orbitalPoint } = await source;
  const [sun, , , earth, , , saturn, , neptune] = BODIES;
  near(sceneRadius(sun) / sceneRadius(earth), 695700 / 6371);
  near(SCENE_UNITS_PER_AU / sceneRadius(earth), AU_KM / 6371);
  near(norm(orbitalPoint(neptune, Math.PI)) / (1 + neptune.e), 30.070);
  const [equatorial, polar] = sceneRadii(saturn);
  near(Math.cbrt(equatorial ** 2 * polar), sceneRadius(saturn));
  near(1 - polar / equatorial, saturn.flatten);
});

test('top view is not stretched, and a close view fits the rings by camera distance only', async () => {
  const { chartProjection, observationDistance, OUTER_LIMIT_AU } = await import('../../site/app13/views.mjs');
  const map = chartProjection(380, 415, false);
  const inner = chartProjection(380, 415, true);
  const [cx, cy] = map.center;
  near(map.point([1, 99, 0])[0] - cx, map.point([0, -12, 1])[1] - cy);
  assert.ok(map.point([OUTER_LIMIT_AU, 0, 0])[0] < 380);
  assert.ok(inner.unit > map.unit * 15);
  const aspect = 390 / 844;
  const distance = observationDistance(.4, 2.34, aspect, 55);
  assert.ok(Math.asin(.4 * 2.34 / distance) < Math.atan(Math.tan(55 * Math.PI / 360) * aspect));
  near(observationDistance(.04, 1, aspect, 55) / .04, observationDistance(.7, 1, aspect, 55) / .7);
});

test('overhead camera fits its UI frame without changing the view angle or the scale ratio', async () => {
  const { chartProjection, overheadPose } = await import('../../site/app13/views.mjs');
  const frame = { left: 280, top: 125, width: 660, height: 660 };
  const [x, y, z] = overheadPose(1280, 900, frame, 51, false);
  const unit = chartProjection(frame.width, frame.height, false).unit;
  near(900 / (2 * Math.tan(51 * Math.PI / 360) * y), unit);
  near(1280 / 2 - x * unit, frame.left + frame.width / 2);
  near(900 / 2 - z * unit, frame.top + frame.height / 2);
  assert.ok(overheadPose(1280, 900, frame, 51, true)[1] < y / 15);
});

test('camera travel changes the physical distance continuously in both directions', async () => {
  const { easedTravel, travelDistance } = await import('../../site/app13/views.mjs');
  const far = 108, near = .00017;
  assert.equal(travelDistance(far, near, easedTravel(0)), far);
  assert.equal(travelDistance(far, near, easedTravel(1)), near);
  let previous = far;
  for (let i = 1; i < 100; i++) {
    const approach = travelDistance(far, near, easedTravel(i / 100));
    assert.ok(approach > near && approach < previous);
    assert.ok(Math.abs(approach / travelDistance(near, far, easedTravel(1 - i / 100)) - 1) < 1e-12);
    previous = approach;
  }
});

test('the nine entries have labeled readings and the portal links the static science app', async () => {
  const { BODIES, readingsFor } = await source;
  assert.equal(new Set(BODIES.map(body => body.id)).size, 9);
  for (const body of BODIES) {
    assert.ok(body.name && body.task && body.why);
    assert.match(readingsFor(body)[0][1], /km/);
    if (body.a) assert.match(readingsFor(body)[1][1], /AU/);
  }
  const portal = readFileSync(join(__dirname, '../../site/index.html'), 'utf8');
  assert.match(portal, /section sec--sci[\s\S]*?class="card subj--sci" href="\.\/app13\/"/);
});
