import { MODE_ORDER } from './content.mjs';

export const MARS_DURATION = 48;
export const CAMERA_TARGET = Object.freeze([0, .5, 0]);
export const EARTH_POSITION = Object.freeze([-8, 3, 0]);
export const MARS_POSITION = Object.freeze([8, -1.8, 0]);
export const SURFACE_Y = -4.2;
export const SURFACE_Z = 3.8;
export const STARSHIP_SCALE = .07;
export const SHIP_CENTER_LOCAL = 25;
export const LANDED_SHIP_Y = SURFACE_Y + 1.78;
export const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
export const fract = value => value - Math.floor(value);
export const ease = value => 1 - (1 - clamp01(value)) ** 3;
export const mix = (a, b, amount) => a + (b - a) * amount;
export const normalizeMode = value => MODE_ORDER.includes(value) ? value : MODE_ORDER[0];
export const isKnownMode = value => MODE_ORDER.includes(value);

export function normalizeMarsTime(value) {
  return Number.isFinite(value) ? Math.min(MARS_DURATION, Math.max(0, value)) : 0;
}
export function formatMarsTime(value) {
  const total = Math.floor(normalizeMarsTime(value));
  return `T+ ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function sampleMarsState(value, mode = MODE_ORDER[0]) {
  const time = normalizeMarsTime(value);
  const progress = time / MARS_DURATION;
  const selectedMode = normalizeMode(mode);
  const launchProgress = selectedMode === 'launch' ? progress : 1;
  const transferProgress = selectedMode === 'transit' ? progress : 1;
  const entryProgress = selectedMode === 'entry' ? progress : 1;
  const landingProgress = selectedMode === 'landing' ? progress : 1;
  const isruProgress = selectedMode === 'isru' ? progress : 0;
  const settlementProgress = selectedMode === 'settlement' ? progress : 0;
  let shipPosition;
  let boosterPosition = [-12, -8, -5];
  let boosterThrust = 0;
  let shipThrust = 0;
  let heat = 0;
  let plasma = 0;
  let dust = 0;
  let velocity = 0;

  if (selectedMode === 'launch') {
    const shipBase = mix(-3.3, 4.6, ease(progress));
    const separation = ease(clamp01(progress * 1.35 - .35));
    shipPosition = [-8, shipBase + SHIP_CENTER_LOCAL * STARSHIP_SCALE, 0];
    boosterPosition = [-8, shipBase - 71 * STARSHIP_SCALE - separation * 5.5, separation * 2.5];
    boosterThrust = 1 - separation;
    shipThrust = ease(clamp01((progress - .62) * 3.2));
    velocity = mix(.1, 2.8, progress);
  } else if (selectedMode === 'transit') {
    shipPosition = [mix(-8, 8, ease(progress)), mix(3, -.7, progress) + Math.sin(progress * Math.PI) * 1.2, mix(0, SURFACE_Z, progress) + Math.sin(progress * Math.PI) * 1.5];
    velocity = mix(3.2, 5.8, progress);
  } else if (selectedMode === 'entry') {
    shipPosition = [8, mix(8, 1.5, ease(progress)), SURFACE_Z];
    heat = Math.sin(clamp01(progress * 1.08) * Math.PI) ** .65;
    plasma = heat;
    shipThrust = ease(clamp01((progress - .72) * 3)) * .35;
    velocity = mix(5.8, 1.4, ease(progress));
  } else if (selectedMode === 'landing') {
    shipPosition = [8, mix(4.2, LANDED_SHIP_Y, ease(progress)), SURFACE_Z];
    shipThrust = .95 - ease(clamp01((progress - .8) * 5)) * .65;
    dust = Math.sin(clamp01(progress * 1.1) * Math.PI) * .95;
    velocity = mix(1.4, .02, ease(progress));
  } else {
    shipPosition = [8, LANDED_SHIP_Y, SURFACE_Z];
  }

  return {
    mode: selectedMode, time, duration: MARS_DURATION, progress, phase: MODE_ORDER.indexOf(selectedMode),
    launchProgress, transferProgress, entryProgress, landingProgress, isruProgress, settlementProgress,
    shipPosition, boosterPosition,
    earthPosition: [...EARTH_POSITION], marsPosition: [...MARS_POSITION], surfaceY: SURFACE_Y,
    altitude: shipPosition[1] - SURFACE_Y, velocity, boosterThrust, shipThrust, engineThrust: Math.max(boosterThrust, shipThrust), heat, plasma, dust,
    resourcePhase: fract(progress * 3 + .1),
    plantGrowth: ease(settlementProgress * 1.15),
    weights: {
      launch: selectedMode === 'launch' ? 1.7 : .2,
      transit: selectedMode === 'transit' ? 1.6 : .2,
      entry: selectedMode === 'entry' ? 1.7 : .25,
      landing: selectedMode === 'landing' ? 1.65 : .25,
      isru: selectedMode === 'isru' ? 1.7 : .2,
      settlement: selectedMode === 'settlement' ? 1.7 : .15,
    },
    educational: true,
  };
}

export function advanceMarsTime(time, deltaSeconds, rate = 1) {
  if (!Number.isFinite(deltaSeconds) || !Number.isFinite(rate) || deltaSeconds < 0 || rate <= 0) return normalizeMarsTime(time);
  return fract((normalizeMarsTime(time) + deltaSeconds * rate) / MARS_DURATION) * MARS_DURATION;
}
