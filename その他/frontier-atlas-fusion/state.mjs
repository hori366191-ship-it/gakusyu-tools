import { MODE_IDS, getMode } from './content.mjs';

export const CONTROL_DEFAULTS = Object.freeze({ heating: 50, density: 65, confinement: 70 });
export const CONTROL_LABELS = Object.freeze({ heating: '加熱入力', density: 'プラズマ密度', confinement: '閉じ込め時間' });
export const TAU = Math.PI * 2;
export const MAJOR_RADIUS = 3.4;
export const MINOR_RADIUS = .72;
export const ITER_DESIGN = Object.freeze({ fusionPowerMW: 500, heatingPowerMW: 50, plasmaQ: 10, gridPowerMW: 0 });

const clamp01 = value => Math.min(1, Math.max(0, value));
const round = (value, places = 3) => Number(value.toFixed(places));
const fract = value => value - Math.floor(value);

export function normalizeControl(name, value) {
  const fallback = CONTROL_DEFAULTS[name] ?? 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

export function normalizeControls(controls = {}) {
  const source = controls && typeof controls === 'object' ? controls : {};
  return Object.fromEntries(Object.keys(CONTROL_DEFAULTS).map(name => [name, normalizeControl(name, source[name])]));
}

export function normalizePhase(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const phase = fract(value);
  return phase < 1e-10 || 1 - phase < 1e-10 ? 0 : round(phase, 6);
}

export function advancePhase(value, delta) {
  const current = normalizePhase(value);
  return typeof delta === 'number' && Number.isFinite(delta) ? normalizePhase(current + delta) : current;
}

/** Shared torus coordinates keep the shader, coils, fallback and neutron path coherent. */
export function torusPoint(u, v, majorRadius = MAJOR_RADIUS, minorRadius = MINOR_RADIUS) {
  const angle = u * TAU;
  const minor = v * TAU;
  const radial = majorRadius + minorRadius * Math.cos(minor);
  return { x: radial * Math.cos(angle), y: minorRadius * Math.sin(minor), z: radial * Math.sin(angle) };
}

export function neutronSample(progress, seed = 0) {
  const travel = clamp01(progress);
  const angle = seed / 96 * TAU;
  const radial = 1 - Math.abs(.5 - travel) * 2;
  return {
    progress: travel,
    angle,
    x: Math.cos(angle) * (MAJOR_RADIUS + radial * (MINOR_RADIUS + travel * 2.2)),
    y: Math.sin(seed * 2.17) * travel * 1.5,
    z: Math.sin(angle) * (MAJOR_RADIUS + radial * (MINOR_RADIUS + travel * 2.2)),
    opacity: Math.sin(travel * Math.PI),
  };
}

/**
 * A bounded teaching model. The numbers are deliberately labelled illustrative:
 * they are not a Lawson criterion, transport simulation, ITER forecast or plant gain.
 */
export function calculateFusionState(mode = 'heating', controls = {}, phase = 0) {
  const safeMode = MODE_IDS.includes(mode) ? mode : 'heating';
  const values = normalizeControls(controls);
  const heating = values.heating / 100;
  const density = values.density / 100;
  const confinement = values.confinement / 100;
  const tripleProduct = heating * density * confinement;
  const modeEntry = getMode(safeMode);
  const plasmaTemperature = 35 + heating * 105 + density * 14 + confinement * 16;
  const reactionIntensity = clamp01((tripleProduct * 1.75 + heating * .18) * modeEntry.weights.reaction);
  const neutronFraction = .8;
  const illustrativeHeat = reactionIntensity * 500;
  const illustrativeGrossElectric = safeMode === 'power' ? illustrativeHeat * .38 * modeEntry.weights.electric / 1.8 : 0;
  const normalizedPhase = normalizePhase(phase);
  return {
    mode: safeMode,
    modeLabel: modeEntry.label,
    status: modeEntry.status,
    heating: values.heating,
    density: values.density,
    confinement: values.confinement,
    tripleProduct: round(tripleProduct * 100, 1),
    plasmaTemperature: Math.round(plasmaTemperature),
    reactionIntensity: round(reactionIntensity, 3),
    plasmaQ: round(ITER_DESIGN.plasmaQ * reactionIntensity, 2),
    neutronFraction,
    illustrativeHeat: Math.round(illustrativeHeat),
    illustrativeGrossElectric: Math.round(illustrativeGrossElectric),
    gridPowerMW: ITER_DESIGN.gridPowerMW,
    powerConceptual: safeMode === 'power',
    weights: modeEntry.weights,
    phase: normalizedPhase,
    fieldAngle: normalizedPhase * TAU,
    animationSpeed: round(.55 + tripleProduct * .9 + (safeMode === 'reaction' ? .35 : 0), 3),
    educational: true,
  };
}

export const sampleFusion = calculateFusionState;

export function getFusionGuidance(state = calculateFusionState()) {
  if (state.mode === 'power') return '半透明の電化系は将来構想です。ITERの実測発電は0 MWで、熱から電気への変換損失も含めて考える必要があります。';
  if (state.plasmaTemperature >= 150) return '温度・密度・閉じ込め時間が模式上そろいました。ただし、これは実際の燃焼条件や発電量の予測ではありません。';
  return '融合には高温だけでなく、十分な密度と閉じ込め時間が必要です。3つのスライダーを組み合わせてください。';
}
