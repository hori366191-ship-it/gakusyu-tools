import { CYCLE_SECONDS, MODE_IDS, MODES, getMode } from './content.mjs';

export const TAU = Math.PI * 2;
export const LIGHT_DEFAULT = 72;
export const SPEEDS = Object.freeze([.5, 1, 2]);

const clamp01 = value => Math.min(1, Math.max(0, value));
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function normalizePhase(value) {
  const normalized = ((finite(value) % 1) + 1) % 1;
  if (normalized < 1e-9 || 1 - normalized < 1e-9) return 0;
  return Number(normalized.toFixed(6));
}

export function normalizeLight(value) {
  return Math.round(clamp01(finite(value, LIGHT_DEFAULT) / 100) * 100);
}

export function advancePhase(phase, cycles) {
  return normalizePhase(normalizePhase(phase) + finite(cycles));
}

export function sampleMode(phase = 0) {
  const normalized = normalizePhase(phase);
  const index = MODES.findIndex(mode => normalized >= mode.start && normalized < mode.end);
  const safeIndex = index < 0 ? MODES.length - 1 : index;
  const mode = MODES[safeIndex];
  const local = clamp01((normalized - mode.start) / (mode.end - mode.start));
  return { mode, index: safeIndex, local, phase: normalized };
}

export function modeStart(id) {
  const mode = MODES.find(entry => entry.id === id);
  return mode ? mode.start : 0;
}

export function modePreviewPhase(id) {
  const mode = MODES.find(entry => entry.id === id);
  return mode ? mode.start + (mode.end - mode.start) * (mode.id === 'off' ? .12 : .46) : 0;
}

export function normalizeSpeed(value) {
  return SPEEDS.includes(value) ? value : 1;
}

function sampleLightPulse(time, intensity, index, count) {
  const travel = ((time * .48 + index / count) % 1 + 1) % 1;
  return { travel, intensity, scale: intensity * (.55 + .45 * Math.sin(travel * Math.PI)) };
}

function sampleIon(time, intensity, index, count) {
  const lane = index % 12;
  const travel = ((time * (.42 + intensity * .35) + Math.floor(index / 12) / Math.ceil(count / 12) + lane * .037) % 1 + 1) % 1;
  return {
    travel,
    lane,
    intensity,
    scale: intensity * Math.sin(travel * Math.PI),
    radialJitter: Math.sin(index * 12.9898) * .22,
  };
}

function samplePotential(time, intensity, index, count) {
  const travel = ((time * .34 + index / count) % 1 + 1) % 1;
  return { travel, intensity, scale: intensity * Math.sin(travel * Math.PI) };
}

/**
 * Deterministic teaching state. Timing, intensities and particle density are not
 * electrophysiological measurements or a clinical efficacy model.
 */
export function calculateOptogeneticsState(phase = 0, light = LIGHT_DEFAULT) {
  const sample = sampleMode(phase);
  const { mode, index, local } = sample;
  const intensity = normalizeLight(light) / 100;
  const lightActive = index > 0 && intensity > 0;
  const opticalDrive = lightActive ? intensity : 0;
  const channelOpen = index === 0 ? 0 : (index === 1 ? smooth(local * 2.2) : 1) * opticalDrive;
  const ionInflux = (index < 2 ? 0 : index === 2 ? smooth(local * 2) : 1 - smooth((local - .78) / .22)) * opticalDrive;
  const actionPotential = (index < 3 ? 0 : smooth((local - .16) / .36)) * opticalDrive;
  const membraneDepolarization = index === 0 ? .08 : Math.min(.96, channelOpen * .28 + ionInflux * .68);
  const firing = lightActive && index === 3 && local > .16 && local < .94;
  return {
    mode: mode.id,
    modeIndex: index,
    modeTitle: mode.title,
    modeLabel: mode.title,
    modeStatus: mode.status,
    structureLabel: mode.structureLabel,
    phase: sample.phase,
    local,
    progress: sample.phase,
    light: Math.round(intensity * 100),
    intensity,
    lightActive,
    channelOpen,
    ionInflux,
    membraneDepolarization,
    actionPotential,
    firing,
    pulsePhase: (sample.phase * 3.7) % 1,
    cycleSeconds: CYCLE_SECONDS,
    educational: true,
  };
}

export function sampleParticleSystem(state, clock = 0) {
  const source = calculateOptogeneticsState(state?.phase, state?.light);
  const time = finite(clock) + source.phase * CYCLE_SECONDS;
  return {
    lightPulse: (index, count) => sampleLightPulse(time, source.lightActive ? source.intensity : 0, index, count),
    ion: (index, count) => sampleIon(time, source.ionInflux, index, count),
    potential: (index, count) => samplePotential(time, source.actionPotential, index, count),
  };
}

export function formatTime(phase = 0, seconds = CYCLE_SECONDS) {
  const safeSeconds = Math.max(1, finite(seconds, CYCLE_SECONDS));
  const elapsed = normalizePhase(phase) * safeSeconds;
  return `${elapsed.toFixed(1)} / ${safeSeconds.toFixed(0)} s`;
}

export const sampleOptogeneticsState = calculateOptogeneticsState;
export { getMode };
