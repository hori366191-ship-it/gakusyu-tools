import { MODE_ORDER } from './content.mjs';

export const NEUTRINO_DURATION = 42;
export const ENTRY_POINT = Object.freeze([10, 10, -5]);
export const VERTEX = Object.freeze([0, -5, 0]);
export const SECONDARY_DIRECTION = Object.freeze([-.42, -.88, .22]);
export const CAMERA_TARGET = Object.freeze([0, -3, 0]);

const TAU = Math.PI * 2;
export const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
export const fract = value => value - Math.floor(value);
export const mix = (a, b, amount) => a + (b - a) * amount;
export const pointOnLine = (start, end, amount) => start.map((value, index) => mix(value, end[index], clamp01(amount)));
export const normalizeMode = value => MODE_ORDER.includes(value) ? value : MODE_ORDER[0];
export const isKnownMode = value => MODE_ORDER.includes(value);

export function normalizeNeutrinoTime(value) {
  return Number.isFinite(value) ? Math.min(NEUTRINO_DURATION, Math.max(0, value)) : 0;
}

export function formatNeutrinoTime(value) {
  const total = Math.floor(normalizeNeutrinoTime(value));
  return `T+ ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Deterministic educational state; it does not simulate interaction probabilities. */
export function sampleNeutrinoState(value, mode = MODE_ORDER[0]) {
  const time = normalizeNeutrinoTime(value);
  const progress = time / NEUTRINO_DURATION;
  const selectedMode = normalizeMode(mode);
  const pass = fract(progress * 2);
  const collision = clamp01(progress * 1.15);
  const light = fract(progress * 3 + .08);
  const detection = fract(progress * 4 + .25);
  const reconstruction = clamp01(progress * 1.15);
  const angle = progress * TAU;
  const trackProgress = selectedMode === 'neutrino-pass' ? pass : selectedMode === 'interaction' ? collision : 1;
  const neutrinoPosition = pointOnLine(ENTRY_POINT, VERTEX, trackProgress);
  const active = selectedMode === 'neutrino-pass' ? 0 : selectedMode === 'interaction' ? 1 : selectedMode === 'cherenkov' ? 2 : selectedMode === 'sensors' ? 3 : 4;

  return {
    mode: selectedMode,
    time,
    duration: NEUTRINO_DURATION,
    progress,
    loopProgress: progress,
    active,
    neutrinoPosition,
    vertex: [...VERTEX],
    secondaryDirection: [...SECONDARY_DIRECTION],
    trackProgress,
    collisionProgress: collision,
    lightProgress: light,
    detectionProgress: detection,
    reconstructionProgress: reconstruction,
    photonPhase: light,
    sensorPhase: detection,
    scanAngle: angle,
    weights: {
      neutrino: selectedMode === 'neutrino-pass' ? 1.5 : .32,
      vertex: ['interaction', 'cherenkov'].includes(selectedMode) ? 1.55 : .35,
      light: selectedMode === 'cherenkov' ? 1.7 : .3,
      sensors: selectedMode === 'sensors' ? 1.65 : .5,
      reconstruction: selectedMode === 'reconstruction' ? 1.6 : .25,
    },
    educational: true,
  };
}

export function advanceNeutrinoTime(time, deltaSeconds, rate = 1) {
  if (!Number.isFinite(deltaSeconds) || !Number.isFinite(rate) || deltaSeconds < 0 || rate <= 0) return normalizeNeutrinoTime(time);
  return fract((normalizeNeutrinoTime(time) + deltaSeconds * rate) / NEUTRINO_DURATION) * NEUTRINO_DURATION;
}
