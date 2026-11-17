/**
 * app11 label-route-repair helper の単体テスト
 * node --test scripts/tests/app11-label-route-repair.test.cjs
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require(path.join(__dirname, '..', 'app11', 'label-route-repair.cjs'));
const G = require(path.join(__dirname, '..', 'app11', 'geometry.cjs'));

function route(reaction, points, compound) {
  return { reaction: reaction, compound: compound || 'c', dir: 'in', tier: 'primary',
    points: points, gaps: [], bridges: [] };
}
function labels(id, box, leader) {
  return { [id]: { box: box, leader: leader || null } };
}
function distToCorridor(points, corridor) {
  const toP = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, G.segSegDistance(toP(points[i]), toP(points[i + 1]), toP(corridor[0]), toP(corridor[1])));
  }
  return min;
}

test('[options] searchMargin と旧 margin の優先順位', () => {
  assert.equal(H.resolveOptions({}).searchMargin, 36);
  assert.equal(H.resolveOptions({ margin: 12 }).searchMargin, 12);
  assert.equal(H.resolveOptions({ searchMargin: 20, margin: 12 }).searchMargin, 20);
  assert.equal(H.resolveOptions({ searchMargin: 0 }).searchMargin, 0);
});

test('[corridor] 斜め corridor の過大 bbox で不要に塞がない', () => {
  const labelsMap = labels('r', { x: 0, y: 0, w: 10, h: 10 });
  const routes = {
    'r|in|c': route('r', [[0, 0], [0, 10], [10, 0]], 'c'),
    'q|in|c2': route('q', [[80, 10], [90, 20]], 'c2')
  };
  const result = H.repair({
    labels: labelsMap,
    routes: routes,
    compounds: { c: { x: -20, y: -20, w: 10, h: 10 }, c2: { x: 70, y: 0, w: 10, h: 10 } },
    markers: { r: { x: 0, y: 0 }, q: { x: 100, y: 20 } },
    classRects: [],
    protect: { r: { corridor: [[0, 0], [100, 100]] } }
  });
  assert.equal(result.changed.length, 0, 'box の外接矩形だけで誤検出しない');
});

test('[stub] 先頭 stub が保護 box に掛かる場合は明示的に不達', () => {
  const labelsMap = labels('r', { x: 0, y: 0, w: 20, h: 10 });
  const points = [[0, 15], [10, 15], [40, 15]];
  const result = H.repair({
    labels: labelsMap,
    routes: { 'q|in|c': route('q', points, 'c') },
    compounds: { c: { x: -20, y: 0, w: 10, h: 30 } },
    markers: { r: { x: 5, y: 5 }, q: { x: 50, y: 15 } },
    classRects: [],
    protect: { r: {} }
  });
  assert.ok(result.unresolved.some((u) => u.reason === 'stub-hard'));
  assert.deepEqual(result.routes['q|in|c'].points, points, 'stub は動かさない');
});

test('[multi] corridor へ複数回交差する経路を反復で解消する', () => {
  const corridor = [[45, 50], [100, 50]];
  const labelsMap = labels('r', { x: 45, y: 45, w: 10, h: 10 });
  const points = [[0, 20], [30, 20], [30, 60], [60, 60], [60, 20], [100, 20]];
  const result = H.repair({
    labels: labelsMap,
    routes: { 'q|in|c': route('q', points, 'c') },
    compounds: { c: { x: -20, y: 30, w: 10, h: 20 } },
    markers: { r: { x: 50, y: 50 }, q: { x: 100, y: 20 } },
    classRects: [],
    protect: { r: { corridor: corridor } }
  });
  const repaired = result.routes['q|in|c'];
  assert.ok(result.changed.length >= 1, '局所 reroute が行われる');
  assert.ok(distToCorridor(repaired.points, [[45, 50], [100, 50]]) >= 7.4, 'corridor から離れている');
});

test('[multi2] U字で corridor を2回横切る経路も解消する', () => {
  const corridor = [[60, 50], [160, 50]];
  const points = [[0, 30], [20, 30], [20, 80], [100, 80], [100, 20], [140, 20]];
  const result = H.repair({
    labels: labels('r', { x: 55, y: 45, w: 10, h: 10 }),
    routes: { 'q|in|c': route('q', points, 'c') },
    compounds: { c: { x: -20, y: 20, w: 10, h: 20 } },
    markers: { r: { x: 60, y: 50 }, q: { x: 160, y: 20 } },
    classRects: [],
    protect: { r: { corridor } }
  });
  assert.ok(result.changed.length >= 1);
  assert.ok(distToCorridor(result.routes['q|in|c'].points, corridor) >= 7.4);
});

test('[stub-corridor] 先頭 segment が corridor を横切る場合は stub-corridor', () => {
  const result = H.repair({
    labels: labels('r', { x: 0, y: 0, w: 20, h: 10 }),
    routes: { 'q|in|c': route('q', [[30, 50], [45, 50], [120, 50]], 'c') },
    compounds: { c: { x: 20, y: 40, w: 10, h: 20 } },
    markers: { r: { x: 50, y: 50 }, q: { x: 130, y: 50 } },
    classRects: [],
    protect: { r: { corridor: [[40, 50], [100, 50]] } }
  });
  assert.ok(result.unresolved.some((u) => u.reason === 'stub-corridor'));
});

test('[no-change] 既に保護帯から離れた経路は変更しない', () => {
  const result = H.repair({
    labels: labels('r', { x: 0, y: 0, w: 10, h: 10 }),
    routes: { 'q|in|c': route('q', [[0, 100], [50, 100]], 'c') },
    compounds: { c: { x: -10, y: 90, w: 10, h: 20 } },
    markers: { r: { x: 5, y: 5 }, q: { x: 60, y: 100 } },
    classRects: [],
    protect: { r: { corridor: [[0, 0], [100, 100]] } }
  });
  assert.deepEqual(result.changed, []);
});
