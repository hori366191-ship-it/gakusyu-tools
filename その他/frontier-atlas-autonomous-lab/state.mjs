import { MODE_IDS, getAutomationLevel, getMode } from './content.mjs';

export const PLAYBACK_RATES = Object.freeze([0.5, 1, 2]);
export const CYCLE_SECONDS = Object.freeze(11);
export const DEFAULT_AUTONOMY = Object.freeze(45);
export const CONCEPTUAL_AUTONOMY_THRESHOLD = Object.freeze(80);

const clamp01 = value => Math.min(1, Math.max(0, value));
const round = (value, places = 4) => Number(value.toFixed(places));
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function normalizePhase(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = ((value % 1) + 1) % 1;
  return normalized < 1e-10 || 1 - normalized < 1e-10 ? 0 : round(normalized, 6);
}

export function advancePhase(phase, cycles) {
  const current = normalizePhase(phase);
  if (typeof cycles !== 'number' || !Number.isFinite(cycles)) return current;
  return normalizePhase(current + cycles);
}

export function normalizeAutonomy(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_AUTONOMY;
  return Math.round(Math.min(100, Math.max(0, value)) / 5) * 5;
}

export function normalizeMode(value) {
  return MODE_IDS.includes(value) ? value : 'hypothesis';
}

export function sampleRobotPose(phase, active = 1) {
  const progress = normalizePhase(phase);
  const reach = smooth(Math.min(1, progress * 1.7));
  const dispense = smooth(clamp01((progress - .28) / .42));
  const returnHome = smooth(clamp01((progress - .76) / .24));
  const amount = reach * (1 - returnHome) * active;
  return {
    shoulder: -.32 - amount * .58,
    elbow: .48 + amount * .82,
    wrist: -.24 - amount * .46 + Math.sin(progress * Math.PI * 4) * amount * .08,
    base: -.18 + amount * .72,
    reach: amount,
    dispense,
    drop: active * Math.sin(clamp01((progress - .34) / .36) * Math.PI),
  };
}

export function sampleFlowParticle(life, index = 0) {
  const normalized = normalizePhase(life);
  const offset = (index % 7) / 7;
  const travel = (normalized + offset) % 1;
  return {
    travel,
    x: Math.sin(travel * Math.PI * 2) * .035,
    y: Math.cos(travel * Math.PI * 2 + index) * .035,
    speed: .6 + (index % 5) * .12,
  };
}

export function sampleAnalysisData(progress = 0) {
  const amount = smooth(normalizePhase(progress));
  return Array.from({ length: 12 }, (_, index) => {
    const target = .24 + .68 * (.5 + .5 * Math.sin(index * 1.71 + .4));
    return round(target * amount + .06 * (1 - amount), 3);
  });
}

export function calculateLabState(mode = 'hypothesis', phase = 0, options = {}) {
  const safeMode = normalizeMode(mode);
  const safePhase = normalizePhase(phase);
  const safeOptions = options && typeof options === 'object' ? options : {};
  const autonomy = normalizeAutonomy(safeOptions.autonomy);
  const iteration = Math.max(0, Math.floor(Number.isFinite(safeOptions.iteration) ? safeOptions.iteration : 0));
  const entry = getMode(safeMode);
  const level = getAutomationLevel(autonomy);
  const loopClosed = autonomy >= CONCEPTUAL_AUTONOMY_THRESHOLD;
  const progress = smooth(safePhase);
  const experiment = safeMode === 'experiment' ? 1 : safeMode === 'next-design' ? .22 : 0;
  const measurement = safeMode === 'measurement' ? progress : 0;
  const analysis = safeMode === 'analysis' ? progress : safeMode === 'next-design' ? .55 : 0;
  const planning = safeMode === 'hypothesis' ? progress : safeMode === 'next-design' ? progress : 0;
  const flowOpacity = loopClosed ? 1 : 1 - smooth(clamp01((safePhase - .88) / .12));

  return {
    mode: safeMode,
    modeLabel: entry.shortTitle,
    modeTitle: entry.title,
    stage: entry.stage,
    status: entry.status,
    phase: safePhase,
    progress,
    autonomy,
    automationLabel: level.label,
    evidenceLabel: level.evidence,
    loopClosed,
    loopType: loopClosed ? 'closed' : 'open',
    humanGateVisible: !loopClosed,
    conceptualFullAutonomy: loopClosed,
    iteration,
    cycleSeconds: CYCLE_SECONDS,
    planning,
    experiment,
    measurement,
    analysis,
    nextDesign: safeMode === 'next-design' ? progress : 0,
    robot: sampleRobotPose(safePhase, experiment),
    data: sampleAnalysisData(analysis),
    flowOpacity,
    flowSpeed: .55 + autonomy / 100 * 1.2,
    educational: true,
    physicalExperimentPerformed: false,
    aiAgentRunning: false,
    next: safeMode === 'hypothesis' ? 'experiment' : safeMode === 'experiment' ? 'measurement' : safeMode === 'measurement' ? 'analysis' : safeMode === 'analysis' ? 'next-design' : 'hypothesis',
  };
}

export const sampleLabState = calculateLabState;

export function getModeGuidance(state) {
  const current = calculateLabState(state?.mode, state?.phase, state);
  if (current.loopClosed) return '完全自律の構想表示です。自律度80%は安全・信頼性・倫理の実証値ではありません。';
  if (current.mode === 'hypothesis') return '計画は自動化できますが、問いの設定や優先順位は研究者が判断します。';
  if (current.mode === 'experiment') return 'ロボット用コードの生成と、無人での完全自律運営は区別する必要があります。';
  if (current.mode === 'measurement') return '測定値の品質は、較正・対照・再現性の設計に依存します。';
  if (current.mode === 'analysis') return '相関、因果、統計的有意性を区別し、独立した検証が必要です。';
  return '結果を次の条件へ戻す部分的な閉ループは研究されています。安全判断と目標設定は未解決です。';
}
