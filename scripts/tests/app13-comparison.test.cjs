/**
 * site/app13 「地球と比較」オーバーレイのオフライン回帰テスト。
 * 実行: node --test scripts/tests/app13-comparison.test.cjs
 *
 * 外部API・ブラウザ・three.js には接続しない。comparison-layout.mjs の
 * 純粋な配置計算と、viewer/HTML/CSS の契約だけを検証する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const APP = join(__dirname, '..', '..', 'site', 'app13');
const layout = import('../../site/app13/comparison-layout.mjs');
const read = name => readFileSync(join(APP, name), 'utf8');
const DEG = Math.PI / 180;
const MARGIN = .88;

const earthRadius = km => km / 149597870.7 * 1000;
const EARTH = earthRadius(6371);
const SATURN = earthRadius(58232);
const DEIMOS = earthRadius(6.2);

function edgeAngle(offset, radius, depth) {
  return Math.atan(offset / depth) + Math.asin(radius / Math.hypot(offset, depth));
}

test('the comparison Earth is tangent to the target right edge with a gap', async () => {
  const { comparisonLayout, COMPARISON_GAP_RATIO } = await layout;
  const pair = comparisonLayout({ targetRadius: EARTH, earthRadius: EARTH });
  assert.equal(pair.targetExtent, EARTH);
  assert.ok(Math.abs(pair.clearance - EARTH * COMPARISON_GAP_RATIO) < 1e-12);
  assert.ok(pair.offset > pair.targetExtent + EARTH, 'gap keeps the discs apart');
  assert.ok(pair.offset < pair.targetExtent + EARTH * 2);
  assert.ok(Math.abs(pair.halfSpan - (pair.offset + EARTH)) < 1e-12);
});

test('rings and irregular silhouettes widen the target extent', async () => {
  const { comparisonLayout } = await layout;
  const plain = comparisonLayout({ targetRadius: SATURN, earthRadius: EARTH });
  const ringed = comparisonLayout({ targetRadius: SATURN, earthRadius: EARTH, ringExtent: 2.34 });
  assert.ok(Math.abs(ringed.targetExtent - SATURN * 2.34) < 1e-12);
  assert.ok(ringed.offset > plain.offset);
  // The comparison Earth starts outside the modelled ring outer edge.
  assert.ok(ringed.offset > SATURN * 2.34 + EARTH);
  // An irregular moon uses its longest axis through viewingRadius upstream;
  // a larger target radius always pushes the comparison further right.
  const doubled = comparisonLayout({ targetRadius: EARTH * 2, earthRadius: EARTH });
  const single = comparisonLayout({ targetRadius: EARTH, earthRadius: EARTH });
  assert.ok(doubled.offset > single.offset);
  // Degenerate input must not produce NaN offsets for the viewer.
  assert.deepEqual(comparisonLayout({ targetRadius: 0, earthRadius: EARTH }),
    { targetExtent: 0, clearance: 0, offset: 0, halfSpan: 0 });
});

test('the fit distance contains the off-axis Earth silhouette inside the frame', async () => {
  const { comparisonLayout, comparisonFitDistance } = await layout;
  for (const [fov, aspect] of [[51, 1.7], [55, .46], [51, 3.2], [55, .8]]) {
    const pair = comparisonLayout({ targetRadius: EARTH, earthRadius: EARTH });
    const distance = comparisonFitDistance({
      halfSpan: pair.halfSpan, offset: pair.offset, targetExtent: pair.targetExtent,
      earthRadius: EARTH, fov, aspect,
    });
    const halfHorizontal = Math.atan(Math.tan(fov * DEG / 2) * aspect * MARGIN);
    const halfVertical = Math.atan(Math.tan(fov * DEG / 2) * MARGIN);
    // The right silhouette is inside the margin, and not pulled much further.
    assert.ok(edgeAngle(pair.offset, EARTH, distance) <= halfHorizontal + 1e-9);
    assert.ok(edgeAngle(pair.offset, EARTH, distance) > halfHorizontal - 2e-3);
    assert.ok(Math.asin(EARTH / distance) <= halfVertical + 1e-9);
    // The target itself stays inside the left half.
    assert.ok(Math.atan(pair.targetExtent / distance) < halfHorizontal);
  }
});

test('the camera pulls back only as far as the pair needs, and never shrinks', async () => {
  const { comparisonDistance, comparisonFitDistance, comparisonLayout } = await layout;
  const sunPair = comparisonLayout({ targetRadius: earthRadius(695700), earthRadius: EARTH });
  const sunFit = comparisonFitDistance({
    halfSpan: sunPair.halfSpan, offset: sunPair.offset, targetExtent: sunPair.targetExtent,
    earthRadius: EARTH, fov: 51, aspect: 1.7,
  });
  const sunBase = earthRadius(695700) * 4.05;
  assert.ok(sunFit < sunBase, 'the Sun already fills the view');
  assert.equal(comparisonDistance({
    baseDistance: sunBase, targetRadius: earthRadius(695700), earthRadius: EARTH, fov: 51, aspect: 1.7,
  }), sunBase);

  // A tiny moon cannot be enlarged: the Earth is fitted instead, so the moon
  // becomes correspondingly small (no minimum pixel size is forced).
  const deimosBase = DEIMOS * 4.05;
  const deimosPair = comparisonLayout({ targetRadius: DEIMOS, earthRadius: EARTH });
  const deimosFit = comparisonFitDistance({
    halfSpan: deimosPair.halfSpan, offset: deimosPair.offset, targetExtent: deimosPair.targetExtent,
    earthRadius: EARTH, fov: 51, aspect: 1.7,
  });
  assert.ok(deimosFit > deimosBase * 1000, 'the camera is pulled far enough for Earth');
  assert.equal(comparisonDistance({
    baseDistance: deimosBase, targetRadius: DEIMOS, earthRadius: EARTH, fov: 51, aspect: 1.7,
  }), deimosFit);
  // Portrait needs more distance than landscape for the same pair.
  const landscape = comparisonDistance({
    baseDistance: .01, targetRadius: EARTH, earthRadius: EARTH, fov: 51, aspect: 1.7,
  });
  const portrait = comparisonDistance({
    baseDistance: .01, targetRadius: EARTH, earthRadius: EARTH, fov: 55, aspect: .46,
  });
  assert.ok(portrait > landscape);
  assert.ok(portrait > 0 && Number.isFinite(portrait));
});

test('the fade-in waits until the pair fits the real frame', async () => {
  const { comparisonLayout, comparisonFitDistance } = await layout;
  const { observationDistance } = await import('../../site/app13/views.mjs');
  const pair = comparisonLayout({ targetRadius: EARTH, earthRadius: EARTH });
  // Must match the fade gate in viewer.mjs.
  assert.match(read('viewer.mjs'), /compareFade = fitUnits > baseUnits \* 1\.002 \? \.92 : 0/);
  for (const [fov, aspect] of [[51, 1.7], [51, 1.3], [55, .46], [55, .8]]) {
    const fit = comparisonFitDistance({
      halfSpan: pair.halfSpan, offset: pair.offset, targetExtent: pair.targetExtent,
      earthRadius: EARTH, fov, aspect,
    });
    const base = observationDistance(EARTH, 1, aspect, fov);
    const depth = base + .92 * (Math.max(base, fit) - base);
    const actualHalfHorizontal = Math.atan(Math.tan(fov * DEG / 2) * aspect);
    assert.ok(edgeAngle(pair.offset, EARTH, depth) <= actualHalfHorizontal + 1e-9,
      `Earth silhouette inside the frame at fade-in (${fov}/${aspect})`);
  }
});

test('the caption states the mean diameter ratio in a short phrase', async () => {
  const { comparisonCaption } = await layout;
  assert.equal(comparisonCaption('地球', 6371), '地球と同じ大きさの地球を右に表示');
  assert.equal(comparisonCaption('太陽', 695700), '太陽の直径は地球の約109倍');
  assert.equal(comparisonCaption('木星', 69911), '木星の直径は地球の約11倍');
  assert.equal(comparisonCaption('土星', 58232), '土星の直径は地球の約9.1倍');
  assert.equal(comparisonCaption('月', 1737.4), '月の直径は地球の約0.27倍');
  assert.equal(comparisonCaption('水星', 2439.7), '水星の直径は地球の約0.38倍');
  assert.match(comparisonCaption('ダイモス', 6.2), /^ダイモスの直径は地球の約1\/\d+$/);
  assert.match(comparisonCaption('フォボス', 11.08), /^フォボスの直径は地球の約1\/\d+$/);
  assert.equal(comparisonCaption('', 0), '比較用の地球を右に表示');
});

test('the viewer keeps the overlay out of world data and places it on the camera right', () => {
  const viewer = read('viewer.mjs');
  const comparison = read('comparison.mjs');
  const world = read('world.mjs');
  // Only the settled arrival view shows it; everything else hides it.
  assert.match(viewer, /if \(mode !== 'follow'\) setComparison\(false\)/);
  assert.match(viewer, /compareVisibility > \.004/);
  assert.match(viewer, /comparison\.hide\(\)/);
  // The disc fades in only when the pair has been fitted into the frame.
  assert.match(viewer, /compareFade = fitUnits > baseUnits \* 1\.002 \? \.92 : 0/);
  // Reduced-motion users get the final distance immediately, with no tween.
  assert.match(viewer, /if \(reduced\.matches\) compareBlend = wantCompare;/);
  // Placement uses the camera right vector and the target's camera-relative
  // position, which keeps the same view-space depth (and therefore scale).
  assert.match(comparison, /setFromMatrixColumn\(camera\.matrixWorld, 0\)/);
  assert.match(comparison, /addScaledVector\(right, offset\)/);
  assert.match(viewer, /targetScene\.copy\(bodyAU\)\.sub\(cameraAU\)/);
  // Fit distances are computed in scene units while the pose is in AU.
  assert.match(viewer, /baseUnits = distance \* SCENE_UNITS_PER_AU/);
  assert.match(viewer, /\/ SCENE_UNITS_PER_AU/);
  // Display-only: a dedicated group, never appended to world.models.
  assert.match(viewer, /scene\.add\(comparison\.group\)/);
  assert.match(comparison, /group\.name = COMPARISON_NAME/);
  assert.doesNotMatch(world, /comparison/i);
  // The existing 1024 Earth map is fetched lazily, not bundled eagerly.
  assert.match(comparison, /earth-1024\.webp/);
  assert.match(comparison, /if \(requested\) return/);
  // A texture that arrives after context loss must release itself.
  assert.match(comparison, /if \(disposed\) \{ loaded\.dispose\(\); return; \}/);
  // Rim/view vectors must share the view-space frame with the normal.
  assert.match(comparison, /vec3 view = normalize\(mat3\(viewMatrix\) \* \(-worldPoint\)\)/);
  // The fit bisection is cached rather than solved every frame.
  assert.match(viewer, /compareFit\.units = comparisonDistance/);
  // The overlay must not be lost behind rings or a parent planet, while the
  // real bodies keep their normal depth behaviour.
  assert.match(comparison, /depthTest = false/);
  // Marks and time stay untouched by the overlay.
  assert.match(viewer, /const positions = world\.models\.map/);
});

test('the toggle is hidden outside follow mode and wired to the viewer', () => {
  const html = read('index.html');
  const css = read('app.css');
  const viewer = read('viewer.mjs');
  const app = read('app.mjs');
  assert.match(html, /id="compare-earth"[^>]*aria-pressed="false"[^>]*hidden/);
  assert.match(html, /id="compare-note"[^>]*hidden/);
  assert.match(viewer, /\$\('compare-earth'\)\.addEventListener\('click'/);
  assert.match(viewer, /\$\('compare-earth'\)\.hidden = mode !== 'follow'/);
  // "3D unavailable" fallback must also hide the comparison UI.
  assert.match(app, /\$\('compare-earth'\)\.hidden = true/);
  assert.match(app, /\$\('compare-note'\)\.hidden = true/);
  // The comparison places an Earth that is not the actual position: the help
  // text has to say so.
  assert.match(html, /実際の位置関係や距離を示すものではありません/);
  // The note lives above the stage and cannot overlap the bottom controls.
  const note = /\.compare-note \{[^}]*\}/.exec(css);
  assert.ok(note, '.compare-note rule');
  assert.match(note[0], /position: absolute/);
  assert.match(note[0], /pointer-events: none/);
  const actions = /\.view-actions \{[^}]*\}/.exec(css);
  assert.ok(actions, '.view-actions rule');
  assert.match(actions[0], /flex-wrap: wrap/);
  assert.match(actions[0], /max-width: calc\(100% - var\(--edge\) \* 2\)/);
});
