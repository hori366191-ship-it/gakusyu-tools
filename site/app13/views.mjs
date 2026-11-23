import { BODIES, RAD } from './bodies.mjs';

export const OUTER_LIMIT_AU = Math.max(...BODIES.filter(body => body.a).map(body => body.a * (1 + body.e)));
const INNER_LIMIT_AU = 1.76;

// Orthographic projection onto Earth's orbital plane, with one linear unit
// in both directions. The only enlarged objects are non-physical UI markers.
export function chartProjection(width, height, inner) {
  const limit = inner ? INNER_LIMIT_AU : OUTER_LIMIT_AU;
  const padding = Math.min(29, Math.min(width, height) * .085);
  const unit = Math.max(1, Math.min(width, height) / 2 - padding) / limit;
  const x = width / 2, y = height / 2;
  return { unit, center: [x, y], point: ([auX, , auZ]) => [x + auX * unit, y + auZ * unit] };
}

export function observationDistance(radius, rings, aspect, fov) {
  const narrow = aspect < .82;
  const halfFov = Math.atan(Math.tan(fov * RAD / 2) * Math.min(1, aspect) * .88);
  return Math.max(radius * (rings > 1 ? 5.8 : 4.05), radius * rings / Math.sin(halfFov)) * (narrow ? 1.025 : 1);
}

export function overheadPose(viewWidth, viewHeight, frame, fov, inner) {
  const { unit } = chartProjection(frame.width, frame.height, inner);
  const altitude = viewHeight / (2 * Math.tan(fov * RAD / 2) * unit);
  return [
    (viewWidth / 2 - frame.left - frame.width / 2) / unit,
    altitude,
    (viewHeight / 2 - frame.top - frame.height / 2) / unit,
  ];
}

// Manual orbiting keeps the camera on a sphere around the body, so a drag
// changes only the direction. Elevation stops short of the poles: a
// body-centred look-at needs a stable world up vector.
export const ORBIT_ELEVATION_LIMIT = 1.4;

export function orbitAngles([x, y, z]) {
  const radius = Math.hypot(x, y, z) || 1;
  const elevation = Math.asin(Math.max(-1, Math.min(1, y / radius)));
  // At a pole the azimuth is arbitrary; fall back to 0 rather than NaN.
  const flat = Math.hypot(x, z);
  return { azimuth: flat < 1e-9 ? 0 : Math.atan2(x, z), elevation };
}

export function orbitDirection({ azimuth, elevation }, yaw, pitch, limit = ORBIT_ELEVATION_LIMIT) {
  const vertical = Math.max(-limit, Math.min(limit, elevation + pitch));
  const horizontal = Math.cos(vertical);
  const horizontalAngle = azimuth + yaw;
  return [Math.sin(horizontalAngle) * horizontal, Math.sin(vertical), Math.cos(horizontalAngle) * horizontal];
}

// Pitch range that keeps the original pose reachable while the total
// elevation stays inside the limit.
export function orbitPitchBounds(elevation, limit = ORBIT_ELEVATION_LIMIT) {
  return [-limit - elevation, limit - elevation];
}

export function easedTravel(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

export function travelDistance(start, end, progress) {
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  return Math.exp(Math.log(start) * (1 - progress) + Math.log(end) * progress);
}

const dot = ([ax, ay, az], [bx, by, bz]) => ax * bx + ay * by + az * bz;
const unit = vector => {
  const length = Math.hypot(...vector);
  return length > 0 ? vector.map(value => value / length) : [0, 1, 0];
};

function sphericalArc(from, to, t) {
  const dotProduct = Math.max(-1, Math.min(1, dot(from, to)));
  if (dotProduct > .999999) return unit(from.map((value, i) => value + (to[i] - value) * t));
  let tangent = to.map((value, i) => value - dotProduct * from[i]);
  if (Math.hypot(...tangent) < 1e-12) {
    const orthogonal = Math.abs(from[1]) < .8 ? [0, 1, 0] : [1, 0, 0];
    tangent = orthogonal.map((value, i) => value - dot(orthogonal, from) * from[i]);
  }
  tangent = unit(tangent);
  const angle = Math.acos(dotProduct) * t;
  return from.map((value, i) => value * Math.cos(angle) + tangent[i] * Math.sin(angle));
}

// In the parent-centred frame, a radial interpolation with a separate angular
// arc cannot go through the planet (or its rings) the way a straight chord can.
// The fixed guide keeps the arc away from an ambiguous antipodal shortcut.
export function satelliteTransferPoint(start, end, guide, progress, clearance) {
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  const radius = Math.max(clearance, travelDistance(Math.hypot(...start), Math.hypot(...end), easedTravel(progress)));
  const direction = progress < .4
    ? sphericalArc(unit(start), guide, easedTravel(progress / .4))
    : sphericalArc(guide, unit(end), easedTravel((progress - .4) / .6));
  return direction.map(value => value * radius);
}
