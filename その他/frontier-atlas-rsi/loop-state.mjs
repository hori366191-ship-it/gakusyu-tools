import { MODE_IDS, NODE_IDS, NODES, getMode } from './content.mjs';

export const CONTROL_DEFAULTS = Object.freeze({
  automation: 45,
  evaluation: 70,
  oversight: 65,
});

export const CONTROL_LABELS = Object.freeze({
  automation: '自動化の範囲',
  evaluation: '評価の信頼性',
  oversight: '人間の監督',
});

export const TAU = Math.PI * 2;

// Every renderer uses this convention: code → experiment → evaluation → model.
// Negative angular motion matches the physical node order in the XZ plane.
export const FLOW_DIRECTION = Object.freeze({
  angleSign: -1,
  startAngle: Math.PI,
  radiansPerLoop: TAU,
  order: Object.freeze([...NODE_IDS]),
});

export const RADIAL_COLORS = Object.freeze({
  outbound: '#72e4ed',
  inbound: '#c39cff',
});

export const ASSISTED_STAGE_IDS = Object.freeze(['code', 'experiment', 'evaluation', 'review', 'model']);
const ASSISTED_NODE_INDEX = Object.freeze([0, 1, 2, 2, 3]);
const ASSISTED_ANGLES = Object.freeze([Math.PI, Math.PI / 2, 0, -Math.PI / 4, -Math.PI / 2]);

const clamp01 = value => Math.min(1, Math.max(0, value));
const round = (value, places = 3) => Number(value.toFixed(places));
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function normalizeControl(name, value, fallback = CONTROL_DEFAULTS[name] ?? 0) {
  const defaultValue = Number.isFinite(CONTROL_DEFAULTS[name]) ? CONTROL_DEFAULTS[name] : fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue;
  return Math.min(100, Math.max(0, value));
}

export function normalizeControls(controls = {}) {
  const source = controls && typeof controls === 'object' ? controls : {};
  return {
    automation: normalizeControl('automation', source.automation),
    evaluation: normalizeControl('evaluation', source.evaluation),
    oversight: normalizeControl('oversight', source.oversight),
  };
}

export function normalizePhase(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = ((value % 1) + 1) % 1;
  if (normalized < 1e-12 || 1 - normalized < 1e-12) return 0;
  return Number(normalized.toFixed(6));
}

function normalizeAngle(value) {
  return ((value % TAU) + TAU) % TAU;
}

export function loopAngle(phase) {
  return normalizeAngle(FLOW_DIRECTION.startAngle + FLOW_DIRECTION.angleSign * normalizePhase(phase) * FLOW_DIRECTION.radiansPerLoop);
}

export function tangentAtAngle(angle) {
  const sign = FLOW_DIRECTION.angleSign;
  return { x: -Math.sin(angle) * sign, z: Math.cos(angle) * sign };
}

export function loopTangent(phase) {
  return tangentAtAngle(loopAngle(phase));
}

/** Open assisted path includes a human review gate and stops after model improvement. */
export function loopPose(phase, mode = 'assisted') {
  const normalized = normalizePhase(phase);
  if (mode === 'hypothesis') {
    const angle = loopAngle(normalized);
    return { angle, tangent: tangentAtAngle(angle), opacity: 1, closed: true, arcProgress: normalized };
  }
  if (normalized < .8) {
    const scaled = normalized / .8 * (ASSISTED_ANGLES.length - 1);
    const index = Math.min(ASSISTED_ANGLES.length - 2, Math.floor(scaled));
    const amount = scaled - index;
    const angle = ASSISTED_ANGLES[index] + (ASSISTED_ANGLES[index + 1] - ASSISTED_ANGLES[index]) * amount;
    return {
      angle,
      tangent: tangentAtAngle(angle),
      opacity: smooth(normalized / .035),
      closed: false,
      arcProgress: normalized / .8,
    };
  }
  return {
    angle: ASSISTED_ANGLES.at(-1),
    tangent: tangentAtAngle(ASSISTED_ANGLES.at(-1)),
    opacity: 1 - smooth((normalized - .8) / .2),
    closed: false,
    arcProgress: 1,
  };
}

export function loopStageAt(phase, mode = 'assisted') {
  const normalized = normalizePhase(phase);
  const hypothetical = mode === 'hypothesis';
  const stageIds = hypothetical ? NODE_IDS : ASSISTED_STAGE_IDS;
  const index = Math.min(stageIds.length - 1, Math.floor(normalized * stageIds.length));
  const nodeIndex = hypothetical ? index : ASSISTED_NODE_INDEX[index];
  return {
    index,
    stageId: stageIds[index],
    nodeIndex,
    nodeId: NODE_IDS[nodeIndex],
    title: stageIds[index] === 'review' ? '人間レビュー' : NODES[nodeIndex].title,
  };
}

export function loopNodeAt(phase, mode = 'hypothesis') {
  return loopStageAt(phase, mode).nodeIndex;
}

export function advanceLoopPhase(phase, cycles) {
  const current = normalizePhase(phase);
  if (typeof cycles !== 'number' || !Number.isFinite(cycles)) return current;
  return normalizePhase(current + cycles);
}

export function sampleRadialParticle(life) {
  const normalized = normalizePhase(life);
  const wave = Math.sin(normalized * TAU);
  const direction = wave >= 0 ? 'outbound' : 'inbound';
  return {
    life: normalized,
    travel: .5 - .5 * Math.cos(normalized * TAU),
    direction,
    color: RADIAL_COLORS[direction],
  };
}

/**
 * A deterministic educational model, not a forecast or a risk probability.
 * Evaluation and oversight jointly provide capacity to review faster automation.
 */
export function calculateLoopState(mode = 'assisted', controls = {}, phase = 0) {
  const safeMode = MODE_IDS.includes(mode) ? mode : 'assisted';
  const values = normalizeControls(controls);
  const automation = values.automation / 100;
  const evaluation = values.evaluation / 100;
  const oversight = values.oversight / 100;
  const support = evaluation * .58 + oversight * .42;
  const gap = Math.max(0, automation - support);
  const hypothetical = safeMode === 'hypothesis';
  const rawRisk = (hypothetical ? .22 : .08)
    + gap * (hypothetical ? .92 : .72)
    + (hypothetical ? (1 - evaluation) * .12 : 0);
  const risk = clamp01(rawRisk);
  const instability = hypothetical ? clamp01((gap - .08) / .72) : 0;
  const loopSpeed = hypothetical ? .2 + automation * .0034 : .055 + automation * .00085;
  const particleSpeed = .72 + automation * 1.25 + (hypothetical ? .65 : 0);
  const normalizedPhase = normalizePhase(phase);
  const stage = loopStageAt(normalizedPhase, safeMode);
  const stageIds = hypothetical ? NODE_IDS : ASSISTED_STAGE_IDS;
  const lastAssistedStage = !hypothetical && stage.index === stageIds.length - 1;
  const nextIndex = (stage.index + 1) % stageIds.length;
  const nextStageId = lastAssistedStage ? null : stageIds[nextIndex];

  return {
    mode: safeMode,
    modeLabel: getMode(safeMode).shortTitle,
    automation: values.automation,
    evaluation: values.evaluation,
    evaluationReliability: values.evaluation,
    oversight: values.oversight,
    support: round(support * 100, 1),
    gap: round(gap * 100, 1),
    risk: round(risk * 100, 1),
    instability: round(instability, 3),
    stability: round(1 - instability, 3),
    loopSpeed: round(loopSpeed, 4),
    particleSpeed: round(particleSpeed, 3),
    phase: normalizedPhase,
    nodeIndex: stage.nodeIndex,
    nodeId: stage.nodeId,
    stageIndex: stage.index,
    stageId: stage.stageId,
    stageTitle: stage.title,
    nextStageId,
    nextStageTitle: nextStageId === 'review' ? '人間レビュー' : nextStageId ? NODES[NODE_IDS.indexOf(nextStageId)].title : null,
    loopType: hypothetical ? 'closed' : 'open',
    structureTarget: hypothetical ? 1 : 0,
    humanGateVisible: !hypothetical,
    innerRecursiveRingVisible: hypothetical,
    flow: loopPose(normalizedPhase, safeMode),
    riskLevel: risk < .25 ? 'low' : risk < .5 ? 'moderate' : risk < .75 ? 'high' : 'critical',
    educational: true,
  };
}

export const sampleLoop = calculateLoopState;

export function getRiskGuidance(state) {
  const current = calculateLoopState(state?.mode, state, state?.phase);
  if (current.instability > .6) {
    return '自動化が評価・監督を大きく上回る設定です。仮説モードでは不安定さと危険の増大を強調しています。';
  }
  if (current.gap > 15) {
    return '自動化の伸びが、評価・監督の支えを上回っています。赤い揺らぎは概念上の不均衡を示します。';
  }
  if (current.mode === 'hypothesis') {
    return '評価・監督は自動化を支える設定です。ただし、これは完全自律RSIの安全性が実証されたという意味ではありません。';
  }
  return '評価と監督が自動化を支える設定です。人のレビューと独立した検証を残すことが重要です。';
}

export function formatControl(value) {
  return `${Math.round(normalizeControl('automation', value))}%`;
}
