import { MODE_IDS, getMode } from './content.mjs';

export const CONTROL_DEFAULTS = Object.freeze({ photons: 70, interface: 75, encapsulation: 60 });
export const CONTROL_LABELS = Object.freeze({ photons: '光子フラックス', interface: '界面品質', encapsulation: '封止・安定性' });
export const TAU = Math.PI * 2;
export const BAND_STRUCTURE = Object.freeze({ perovskiteGapEV: 1.68, siliconGapEV: 1.12, perovskiteConductionEV: -4.2, perovskiteValenceEV: -5.88, siliconConductionEV: -4.05, siliconValenceEV: -5.17 });

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

export function photonSample(progress, index = 0) {
  const travel = clamp01(progress);
  const column = index % 8;
  const row = Math.floor(index / 8) % 4;
  return {
    x: (column - 3.5) * .56 + Math.sin(index * 1.9) * .08,
    y: 4.1 - travel * 5.2,
    z: (row - 1.5) * .62,
    travel,
    wavelength: index % 3,
  };
}

export function carrierSample(progress, kind = 'electron', index = 0) {
  const travel = clamp01(progress);
  const column = index % 8;
  const row = Math.floor(index / 8) % 4;
  const x = (column - 3.5) * .48;
  const z = (row - 1.5) * .5;
  return {
    x,
    y: kind === 'electron' ? 1.2 + travel * 1.08 : 1.2 - travel * 1.08,
    z,
    kind,
    travel,
  };
}

/** A bounded visualization model, not a device simulator or PCE/lifetime forecast. */
export function calculatePerovskiteState(mode = 'absorption', controls = {}, phase = 0) {
  const safeMode = MODE_IDS.includes(mode) ? mode : 'absorption';
  const values = normalizeControls(controls);
  const entry = getMode(safeMode);
  const normalizedPhase = normalizePhase(phase);
  const flux = values.photons / 100;
  const quality = values.interface / 100;
  const protection = values.encapsulation / 100;
  const degradation = safeMode === 'degradation'
    ? clamp01(normalizedPhase * (1 - protection))
    : clamp01(normalizedPhase * (1 - protection) * .08);
  const absorption = clamp01(.34 + flux * .52 + quality * .12);
  const collection = clamp01(absorption * (.52 + quality * .43) * (1 - degradation * .58));
  const retainedOutput = collection * (.48 + protection * .52);
  const illustrativePce = retainedOutput * 32;
  return {
    mode: safeMode,
    modeLabel: entry.label,
    status: entry.status,
    photons: values.photons,
    interface: values.interface,
    encapsulation: values.encapsulation,
    absorption: round(absorption, 3),
    collection: round(collection, 3),
    degradation: round(degradation, 3),
    retainedOutput: round(retainedOutput, 3),
    illustrativePce: round(illustrativePce, 2),
    perovskiteGapEV: BAND_STRUCTURE.perovskiteGapEV,
    siliconGapEV: BAND_STRUCTURE.siliconGapEV,
    phase: normalizedPhase,
    weights: entry.weights,
    animationSpeed: round(.48 + flux * .65 + quality * .25, 3),
    educational: true,
  };
}

export const sampleTandem = calculatePerovskiteState;

export function getPerovskiteGuidance(state = calculatePerovskiteState()) {
  if (state.mode === 'degradation') return `模式上の劣化進行は${Math.round(state.degradation * 100)}%です。寿命・時間・実発電量の予測ではありません。封止・組成・界面・欠陥制御を組み合わせます。`;
  if (state.interface < 45) return '界面品質が低く、キャリアの再結合ロスが増える模式です。輸送層やパッシベーションの重要性を示します。';
  return '上側のwide-bandgapペロブスカイトと下側シリコンが波長を分担します。研究セル効率とモジュールの長期実績は別です。';
}
