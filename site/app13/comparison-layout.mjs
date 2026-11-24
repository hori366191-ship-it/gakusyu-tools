// Pure placement math for the "compare with Earth" overlay. No three.js import:
// the viewer uses these results with the live camera, tests use them directly.
import { RAD } from './bodies.mjs';

// The comparison disc is Earth's real radius, so the horizontal gap has to
// look like a deliberate inset rather than two touching spheres.
export const COMPARISON_NAME = 'earth-comparison';
export const EARTH_MEAN_RADIUS_KM = 6371;
export const COMPARISON_GAP_RATIO = .9;

// Target centre stays where the observation view put it (normally the middle
// of the stage); the comparison Earth is tangent to the target's right edge,
// rings included, plus a small gap.
export function comparisonLayout({
  targetRadius, earthRadius, ringExtent = 1, gap = COMPARISON_GAP_RATIO,
}) {
  if (!(targetRadius > 0) || !(earthRadius > 0)) {
    return { targetExtent: 0, clearance: 0, offset: 0, halfSpan: 0 };
  }
  const targetExtent = targetRadius * (ringExtent > 1 ? ringExtent : 1);
  const clearance = earthRadius * gap;
  const offset = targetExtent + clearance + earthRadius;
  return { targetExtent, clearance, offset, halfSpan: offset + earthRadius };
}

// Rightmost screen angle of a sphere of `radius` centred at (offset, depth).
// A plain span/distance division under-estimates this once the sphere sits
// off-axis, so solve the real tangent angle instead of clipping the Earth.
function sphereEdgeAngle(offset, radius, depth) {
  return Math.atan(offset / depth) + Math.asin(radius / Math.hypot(offset, depth));
}

function fitDepth(offset, radius, limit) {
  let low = 1e-9;
  let high = (Math.max(offset, radius) / Math.tan(Math.max(limit, 1e-3))) * 2 + radius;
  for (let i = 0; i < 80 && sphereEdgeAngle(offset, radius, high) > limit; i++) high *= 2;
  for (let i = 0; i < 44; i++) {
    const middle = (low + high) / 2;
    if (sphereEdgeAngle(offset, radius, middle) > limit) low = middle;
    else high = middle;
  }
  return high;
}

// Smallest camera distance (same scene units as the layout) at which the whole
// pair fits horizontally, including the Earth's silhouette. The Earth's
// vertical extent is checked too because wide screens run out of height first.
export function comparisonFitDistance({
  halfSpan, offset, targetExtent, earthRadius, fov, aspect, margin = .88,
}) {
  const halfVertical = Math.atan(Math.tan(fov * RAD / 2) * margin);
  const halfHorizontal = Math.atan(Math.tan(fov * RAD / 2) * Math.max(.15, aspect) * margin);
  if (!(targetExtent > 0)) return Math.max(halfSpan / Math.tan(halfHorizontal), earthRadius / Math.sin(halfVertical));
  return Math.max(
    earthRadius / Math.sin(halfVertical),
    fitDepth(offset, earthRadius, halfHorizontal),
    targetExtent / Math.tan(halfHorizontal),
  );
}

// The camera only ever moves outward for the comparison, and only as far as
// the pair needs: a target that already fills the view keeps its distance.
export function comparisonDistance({
  baseDistance, targetRadius, earthRadius, ringExtent = 1, gap = COMPARISON_GAP_RATIO,
  fov, aspect, margin = .88,
}) {
  if (!(baseDistance > 0)) return baseDistance;
  const { targetExtent, offset, halfSpan } = comparisonLayout({
    targetRadius, earthRadius, ringExtent, gap,
  });
  if (!(halfSpan > 0)) return baseDistance;
  return Math.max(baseDistance, comparisonFitDistance({
    halfSpan, offset, targetExtent, earthRadius, fov, aspect, margin,
  }));
}

const decimals = [0, 1, 2].map(digits =>
  new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }));

// Short caption for the comparison. Mean diameters scale with the mean radii,
// so the ratio of radii is already the diameter ratio.
export function comparisonCaption(name, km, earthKm = EARTH_MEAN_RADIUS_KM) {
  if (!(km > 0) || !(earthKm > 0)) return '比較用の地球を右に表示';
  const ratio = km / earthKm;
  if (Math.abs(ratio - 1) < .015) return `${name}と同じ大きさの地球を右に表示`;
  if (ratio < .01) return `${name}の直径は地球の約1/${Math.round(1 / ratio)}`;
  const digits = ratio >= 10 ? 0 : ratio >= 1 ? 1 : 2;
  return `${name}の直径は地球の約${decimals[digits].format(ratio)}倍`;
}
