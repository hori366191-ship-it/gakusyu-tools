/**
 * site/app13 の塵・小石（dust-field.mjs）のオフライン回帰テスト。
 * 実行: node --test scripts/tests/app13-dust.test.cjs
 *
 * three.js もブラウザも使わない。純粋関数だけを検証する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const field = import('../../site/app13/dust-field.mjs');

test('wrapOffset keeps every value inside [0, size)', async () => {
  const { wrapOffset } = await field;
  const size = 24;
  const values = [0, 1, 23.5, 24, 48, -0.5, -24, -24.5, -1e6, 1e9, 3.14159, -1e-9];
  for (const value of values) {
    const wrapped = wrapOffset(value, size);
    assert.ok(wrapped >= 0 && wrapped < size, `${value} -> ${wrapped}`);
    assert.ok(Math.abs(wrapOffset(value + size * 3, size) - wrapped) < 1e-9);
  }
  assert.equal(wrapOffset(-0.25, 4), 3.75);
  assert.equal(wrapOffset(0, 4), 0);
  // 壊れた入力では 0 を返し、範囲外を漏らさない。
  assert.equal(wrapOffset(NaN, 4), 0);
  assert.equal(wrapOffset(3, 0), 0);
});

test('approachStreak is zero at the ends and one through the middle of a new approach', async () => {
  const { approachStreak } = await field;
  assert.equal(approachStreak(0), 0);
  assert.equal(approachStreak(1), 0);
  assert.ok(Math.abs(approachStreak(.18) - 1) < 1e-9, 'fully on by 18%');
  assert.ok(Math.abs(approachStreak(.5) - 1) < 1e-9);
  assert.ok(Math.abs(approachStreak(.72) - 1) < 1e-9, 'still on until 72%');
  // 出発直後は単調に立ち上がり、到着前は単調に弱まる。
  let previous = 0;
  for (let t = 0; t <= .18; t += .005) {
    const value = approachStreak(t);
    assert.ok(value >= previous - 1e-12, `${t}: ${value} < ${previous}`);
    previous = value;
  }
  previous = approachStreak(.72);
  for (let t = .72; t <= 1; t += .005) {
    const value = approachStreak(t);
    assert.ok(value <= previous + 1e-12, `${t}: ${value} > ${previous}`);
    previous = value;
  }
  for (let t = 0; t <= 1; t += .01) {
    const value = approachStreak(t);
    assert.ok(value >= 0 && value <= 1, `${t}: ${value}`);
  }
  // 同じ天体の環視点切替では常に筋を出さない。
  for (const t of [0, .2, .5, .9, 1]) assert.equal(approachStreak(t, true), 0);
  // 範囲外・壊れた入力でも 0..1 に収まる。
  for (const t of [-2, -1e-9, 2, 1e9, NaN, Infinity, -Infinity]) {
    const value = approachStreak(t);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${t}: ${value}`);
  }
  assert.equal(approachStreak(NaN), 0);
});

test('quality grain counts start at zero and grow with the quality level', async () => {
  const { GRAIN_COUNTS } = await field;
  for (const key of ['near', 'mid', 'far']) {
    const counts = GRAIN_COUNTS[key];
    assert.equal(counts.length, 4);
    assert.equal(counts[0], 0, `${key}: lite must render nothing`);
    for (let i = 1; i < counts.length; i++) {
      assert.ok(counts[i] > counts[i - 1], `${key}: ${counts[i - 1]} -> ${counts[i]}`);
    }
  }
  assert.equal(GRAIN_COUNTS.near[3], 450);
  assert.equal(GRAIN_COUNTS.mid[3], 450);
  assert.equal(GRAIN_COUNTS.far[3], 900);
});

test('grainLayout is deterministic, inside the box, and inside the radius band', async () => {
  const { grainLayout } = await field;
  const options = { radius: [.25, 3.2], bias: 2.6, size: [1.1, 2.6], tone: [.35, 1], rocks: 24, rockSize: [4, 10] };
  const first = grainLayout(760, 5.2, 7741, options);
  const second = grainLayout(760, 5.2, 7741, options);
  for (const [key, array] of Object.entries(first)) {
    assert.ok(array instanceof Float32Array, key);
    assert.deepEqual(Array.from(array), Array.from(second[key]), `${key} must be deterministic`);
  }
  assert.equal(first.positions.length, 760 * 3);
  assert.equal(first.sizes.length, 760);
  let rocks = 0;
  for (let i = 0; i < 760; i++) {
    const [x, y, z] = [first.positions[i * 3], first.positions[i * 3 + 1], first.positions[i * 3 + 2]];
    assert.ok(Math.abs(x) <= 5.2 && Math.abs(y) <= 5.2 && Math.abs(z) <= 5.2, `grain ${i} left the box`);
    const radius = Math.hypot(x, y, z);
    assert.ok(radius >= .25 - 1e-6 && radius <= 3.2 + 1e-6, `grain ${i} radius ${radius}`);
    const rock = first.kinds[i] === 1;
    if (rock) {
      rocks++;
      assert.ok(first.sizes[i] >= 4 - 1e-6 && first.sizes[i] <= 10 + 1e-6, `rock ${i} size`);
    } else {
      assert.ok(first.sizes[i] >= 1.1 - 1e-6 && first.sizes[i] <= 2.6 + 1e-6, `grain ${i} size`);
    }
    assert.ok(first.tones[i] >= .35 && first.tones[i] <= 1);
    assert.ok(first.seeds[i] >= 0 && first.seeds[i] <= 1);
  }
  assert.equal(rocks, 24);
  // 種を変えると別の並びになる。
  const other = grainLayout(760, 5.2, 7742, options);
  assert.notDeepEqual(Array.from(other.positions), Array.from(first.positions));
  // 個数 0 は空。
  const empty = grainLayout(0, 5.2, 1, options);
  assert.equal(empty.positions.length, 0);
});

test('uniformBox spreads grains evenly over the whole box', async () => {
  const { grainLayout } = await field;
  const options = { uniformBox: true, size: [1.1, 2.6], tone: [.35, 1], rocks: 24, rockSize: [4, 10] };
  const first = grainLayout(450, 6, 7741, options);
  const second = grainLayout(450, 6, 7741, options);
  for (const [key, array] of Object.entries(first)) {
    assert.deepEqual(Array.from(array), Array.from(second[key]), `${key} must be deterministic`);
  }
  assert.equal(first.positions.length, 450 * 3);
  const axes = [[], [], []];
  for (let i = 0; i < 450; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = first.positions[i * 3 + axis];
      assert.ok(Math.abs(value) <= 6, `grain ${i} axis ${axis} = ${value}`);
      axes[axis].push(value);
    }
  }
  for (const values of axes) {
    const median = values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
    // 450 サンプルの中央値は揺らぐので、偏りがないことだけを緩く確かめる。
    assert.ok(Math.abs(median) < 1.2, `axis median ${median} should sit near 0`);
    // 半径ではなく箱全体に一様なので、|value| の平均は half/2 に近い。
    const meanAbs = values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length;
    assert.ok(Math.abs(meanAbs - 3) < .6, `mean |axis| ${meanAbs} should be about half/2`);
  }
  // 半径系オプションは無視される。
  const ignored = grainLayout(450, 6, 7741, { ...options, radius: [5.9, 6], bias: 9 });
  assert.deepEqual(Array.from(ignored.positions), Array.from(first.positions));
  let rocks = 0;
  for (let i = 0; i < 450; i++) {
    if (first.kinds[i] === 1) {
      rocks++;
      assert.ok(first.sizes[i] >= 4 - 1e-6 && first.sizes[i] <= 10 + 1e-6);
    } else {
      assert.ok(first.sizes[i] >= 1.1 - 1e-6 && first.sizes[i] <= 2.6 + 1e-6);
    }
  }
  assert.equal(rocks, 24);
});

test('logRadius keeps radii in range and pushes grains toward the camera', async () => {
  const { grainLayout } = await field;
  const base = { radius: [20, 10000], size: [1, 2.1], tone: [.25, .9] };
  const log = grainLayout(900, 11000, 20231, { ...base, logRadius: true });
  const again = grainLayout(900, 11000, 20231, { ...base, logRadius: true });
  assert.deepEqual(Array.from(log.positions), Array.from(again.positions), 'log layout is deterministic');
  assert.equal(log.positions.length, 900 * 3);
  const radii = [];
  for (let i = 0; i < 900; i++) {
    const radius = Math.hypot(log.positions[i * 3], log.positions[i * 3 + 1], log.positions[i * 3 + 2]);
    assert.ok(radius >= 20 - 1e-6 && radius <= 10000 + 1e-6, `grain ${i} radius ${radius}`);
    radii.push(radius);
  }
  // 対数分布なので中央値が算術平均より十分に近距離側へ寄る。
  const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  const median = radii.slice().sort((a, b) => a - b)[Math.floor(radii.length / 2)];
  assert.ok(median < mean * .6, `median ${median} vs mean ${mean}`);
  const geometric = Math.sqrt(20 * 10000);
  assert.ok(Math.abs(median / geometric - 1) < .35, `median ${median} vs log midpoint ${geometric}`);
  // radius 指定と reach 制限は従来どおり効く。
  const tight = grainLayout(64, 30, 11, { radius: [5, 900], logRadius: true });
  for (let i = 0; i < 64; i++) {
    assert.ok(Math.abs(tight.positions[i * 3]) <= 30 + 1e-6);
    assert.ok(Math.abs(tight.positions[i * 3 + 1]) <= 30 + 1e-6);
    assert.ok(Math.abs(tight.positions[i * 3 + 2]) <= 30 + 1e-6);
  }
});
