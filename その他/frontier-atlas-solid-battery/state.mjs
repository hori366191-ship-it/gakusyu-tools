import { MODE_IDS, getMode } from './content.mjs';

export const CONTROL_DEFAULTS = Object.freeze({ current: 60, density: 88, interface: 75 });
export const CONTROL_LABELS = Object.freeze({ current: '電流密度', density: '電解質の相対密度', interface: '界面品質' });
export const TAU = Math.PI * 2;
export const LAYERS = Object.freeze({ collectorTop: 2.08, cathode: 1.35, electrolyte: .05, anode: -1.28, collectorBottom: -2.08 });

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

/** An illustrative, material-agnostic risk index — explicitly not a short-circuit probability. */
export function dendriteRiskIndex(density = CONTROL_DEFAULTS.density, interfaceQuality = CONTROL_DEFAULTS.interface, current = CONTROL_DEFAULTS.current) {
  const d = normalizeControl('density', density);
  const quality = normalizeControl('interface', interfaceQuality);
  const j = normalizeControl('current', current);
  // The LPS paper found faster pore filling as density rose through its percolating regime,
  // then suppression after pore networks closed. This non-monotonic shape is educational,
  // not a universal threshold or a quantitative fit.
  const poreFactor = d < 95 ? d / 95 : Math.max(0, 1 - (d - 95) / 5);
  const raw = poreFactor * .4 + (1 - quality / 100) * .34 + j / 100 * .4;
  return Math.round(clamp01(raw) * 100);
}

export function ionSample(progress, lane = 0, seed = 0) {
  const travel = clamp01(progress);
  const columns = 6;
  const rows = 4;
  const x = (lane % columns - (columns - 1) / 2) * .62 + Math.sin(seed * 2.3) * .045;
  const z = (Math.floor(lane / columns) - (rows - 1) / 2) * .54;
  return { x, y: LAYERS.cathode - travel * (LAYERS.cathode - LAYERS.anode), z, travel };
}

export function calculateSolidBatteryState(mode = 'charge', controls = {}, phase = 0) {
  const safeMode = MODE_IDS.includes(mode) ? mode : 'charge';
  const values = normalizeControls(controls);
  const entry = getMode(safeMode);
  const normalizedPhase = normalizePhase(phase);
  const currentDensity = .2 + values.current / 100 * 3;
  const conductivity = clamp01(.12 + values.density / 100 * .72 + values.interface / 100 * .18);
  const resistance = Math.round(clamp01(1.12 - conductivity * .82 - values.interface / 100 * .18) * 100);
  const risk = dendriteRiskIndex(values.density, values.interface, values.current);
  const growth = round(clamp01(risk / 100 * (.4 + currentDensity / 3.2 * .85)), 3);
  const charging = safeMode === 'charge' || safeMode === 'dendrite';
  return {
    mode: safeMode,
    modeLabel: entry.label,
    status: entry.status,
    current: values.current,
    density: values.density,
    interface: values.interface,
    currentDensity: round(currentDensity, 2),
    conductivity: round(conductivity, 3),
    resistance,
    risk,
    growth,
    suppression: 100 - risk,
    migrationDirection: charging ? -1 : 1,
    electronDirection: charging ? -1 : 1,
    stateOfCharge: safeMode === 'charge' ? normalizedPhase : safeMode === 'discharge' ? 1 - normalizedPhase : .5,
    phase: normalizedPhase,
    weights: entry.weights,
    animationSpeed: round(.5 + values.current / 100 * .8 + conductivity * .35, 3),
    educational: true,
  };
}

export const sampleBattery = calculateSolidBatteryState;

export function getBatteryGuidance(state = calculateSolidBatteryState()) {
  if (state.mode === 'dendrite') return `模式上のリスク指数は${state.risk} / 100です。確率・寿命ではありません。密度と界面だけでなく、電流、粒界、割れ、電子漏れ、圧力も考えます。`;
  if (state.resistance > 65) return '界面品質や電解質密度が低い設定です。イオン移動が遅く、電圧損失や析出の不均一さにつながる可能性があります。';
  return 'Liイオンは電解質内、電子は外部回路という別経路です。模式上の伝導・抵抗は材料選定の目安にはなりません。';
}
