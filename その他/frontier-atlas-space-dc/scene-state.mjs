export const ORBIT_DURATION = 48;
export const EARTH_CENTER = Object.freeze([0, -24, -20]);
export const EARTH_RADIUS = 28;
export const EARTH_ROTATION = -.42;
export const EARTH_TEXTURE_PATHS = Object.freeze({
  high: './textures/earth-4096.webp',
  mobile: './textures/earth-2048.webp',
});
export const OVERALL_CAMERA_DISTANCE = 95;
export const OVERALL_CAMERA_TARGET = Object.freeze([0, -6, 2]);

export const SATELLITE_LAYOUT = Object.freeze([
  Object.freeze({ orbitRadius: 52, inclination: .24, ascendingNode: .18, phase: .78, scale: 3 }),
  Object.freeze({ orbitRadius: 58, inclination: -.38, ascendingNode: 1.18, phase: 2.18, scale: 2.9 }),
  Object.freeze({ orbitRadius: 55, inclination: .56, ascendingNode: 2.58, phase: 3.82, scale: 3.1 }),
  Object.freeze({ orbitRadius: 63, inclination: -.62, ascendingNode: 3.84, phase: 5.18, scale: 2.8 }),
  Object.freeze({ orbitRadius: 60, inclination: .36, ascendingNode: 5.22, phase: 1.52, scale: 3 }),
]);

const TAU = Math.PI * 2;
const clamp01 = value => Math.min(1, Math.max(0, value));
const fract = value => value - Math.floor(value);

export function normalizeOrbitTime(value) {
  return Number.isFinite(value)
    ? Math.min(ORBIT_DURATION, Math.max(0, value))
    : 0;
}

export function formatOrbitTime(value) {
  const total = Math.floor(normalizeOrbitTime(value));
  const seconds = total % 60;
  return `T+ ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function sampleFlowPhase(phase, speed = 1, offset = 0) {
  return fract(phase * speed + offset);
}

/** Position on an inclined circular orbit around the educational Earth center. */
export function orbitalPosition(layout, angle) {
  const radius = layout.orbitRadius;
  const node = layout.ascendingNode;
  const inclination = layout.inclination;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * Math.sin(inclination);
  const z = Math.sin(angle) * radius * Math.cos(inclination);
  return [
    EARTH_CENTER[0] + x * Math.cos(node) + z * Math.sin(node),
    EARTH_CENTER[1] + y,
    EARTH_CENTER[2] - x * Math.sin(node) + z * Math.cos(node),
  ];
}

/**
 * Pure educational state. Real orbital periods, link budgets and thermal values
 * are deliberately not implied: the cycle only keeps the four flows legible.
 */
export function sampleOrbitalScene(value) {
  const time = normalizeOrbitTime(value);
  const phase = time / ORBIT_DURATION;
  const angle = phase * TAU;
  const hero = {
    position: [
      Math.sin(angle) * .35,
      20 + Math.sin(angle * 2) * .18,
      28 + Math.cos(angle) * .22,
    ],
    rotation: [
      .06 + Math.sin(angle) * .025,
      -.16 + Math.sin(angle * .5) * .035,
      Math.cos(angle) * .025,
    ],
  };

  const satellites = SATELLITE_LAYOUT.map((layout, index) => {
    const a = layout.phase + Math.sin(angle + index * .2) * .1 * (index % 2 === 0 ? 1 : -1);
    return {
      id: `relay-${index + 1}`,
      position: orbitalPosition(layout, a),
      rotation: [
        layout.inclination * .16 + .08 * Math.sin(index + 1),
        -a + layout.ascendingNode + Math.PI / 2,
        .05 * Math.cos(index + angle),
      ],
      scale: layout.scale,
      orbitRadius: layout.orbitRadius,
      inclination: layout.inclination,
      link: true,
    };
  });

  return {
    time,
    duration: ORBIT_DURATION,
    phase,
    progress: phase,
    hero,
    satellites,
    earth: {
      center: [...EARTH_CENTER],
      radius: EARTH_RADIUS,
      rotation: EARTH_ROTATION,
    },
    flows: {
      power: sampleFlowPhase(phase, 6),
      optical: sampleFlowPhase(phase, 4, .18),
      downlink: sampleFlowPhase(phase, 3, .42),
      heat: sampleFlowPhase(phase, 2, .08),
      compute: sampleFlowPhase(phase, 8),
    },
    educational: true,
  };
}

export function modeWeight(mode, system, selected = false) {
  if (mode === 'overall') return selected ? 1.35 : 1;
  return mode === system ? (selected ? 1.72 : 1.55) : selected ? 1.15 : .62;
}

export function isKnownMode(value) {
  return ['overall', 'power', 'link', 'cooling', 'compute'].includes(value);
}

export function boundedPhase(value) {
  return clamp01(Number.isFinite(value) ? value : 0);
}
