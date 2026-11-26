import {
  BASE_PAIRS,
  CUT_SEQUENCE,
  CYCLE_SECONDS,
  EDITED_SEQUENCE,
  MECHANISM_IDS,
  MODE_IDS,
  MODES,
  ORIGINAL_SEQUENCE,
  TARGET_INDEX,
  getMechanism,
  getMode,
} from './content.mjs';

export const TAU = Math.PI * 2;
export const SPEEDS = Object.freeze([.5, 1, 2]);
export const COMPLEMENT = Object.freeze({ A: 'T', T: 'A', G: 'C', C: 'G' });

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

export function normalizeMechanism(value) {
  return MECHANISM_IDS.includes(value) ? value : 'base';
}

export function advancePhase(phase, cycles) {
  return normalizePhase(normalizePhase(phase) + finite(cycles));
}

export function normalizeSpeed(value) {
  return SPEEDS.includes(value) ? value : 1;
}

export function modeStart(id) {
  const mode = MODES.find(entry => entry.id === id);
  return mode ? mode.start : 0;
}

export function modePreviewPhase(id) {
  const mode = MODES.find(entry => entry.id === id);
  return mode ? mode.start + (mode.end - mode.start) * (mode.id === 'recognition' ? .36 : .48) : 0;
}

export function sampleMode(phase = 0) {
  const normalized = normalizePhase(phase);
  const index = MODES.findIndex(mode => normalized >= mode.start && normalized < mode.end);
  const safeIndex = index < 0 ? MODES.length - 1 : index;
  const mode = MODES[safeIndex];
  const local = clamp01((normalized - mode.start) / (mode.end - mode.start));
  return { mode, index: safeIndex, local, phase: normalized };
}

export function complementSequence(sequence) {
  return [...String(sequence)].map(base => COMPLEMENT[base] || 'N').join('');
}

export function targetPair(sequence = ORIGINAL_SEQUENCE) {
  const target = String(sequence)[TARGET_INDEX] || 'N';
  return `${target}·${COMPLEMENT[target] || 'N'}`;
}

export function editSequence(sequence, mechanism = 'base', index = TARGET_INDEX) {
  const safeMechanism = normalizeMechanism(mechanism);
  const bases = [...String(sequence)];
  if (safeMechanism === 'base') {
    if (bases[index] === 'A') bases[index] = 'G';
    else if (bases[index] === 'G') bases[index] = 'A';
    else if (bases[index] === 'C') bases[index] = 'T';
    else if (bases[index] === 'T') bases[index] = 'C';
    return bases.join('');
  }
  bases.splice(Math.max(0, Math.min(bases.length - 1, index)), 1);
  return bases.join('');
}

function strandPoint(index, strand = 0) {
  const t = index / (BASE_PAIRS - 1);
  const angle = t * TAU * 3.25 - TARGET_INDEX / (BASE_PAIRS - 1) * TAU * 3.25 + strand * Math.PI;
  return { t, angle, x: Math.cos(angle), z: Math.sin(angle), y: (t - .5) * 8.4 };
}

export function basePairPoint(index, strand = 0) {
  return strandPoint(Math.max(0, Math.min(BASE_PAIRS - 1, index)), strand);
}

function sampleRepairParticle(time, amount, index, count, mechanism) {
  const travel = ((time * (.25 + amount * .45) + index / count) % 1 + 1) % 1;
  const angle = index * 2.399963229728653 + time * .3;
  const radius = .65 + (index % 5) * .22;
  return {
    travel,
    angle,
    radius,
    amount,
    scale: amount * Math.sin(travel * Math.PI),
    y: (travel - .5) * 2.8,
  };
}

/** Deterministic teaching state; no measured efficiency or clinical prediction. */
export function calculateCrisprState(phase = 0, mechanism = 'base') {
  const { mode, index, local, phase: normalized } = sampleMode(phase);
  const safeMechanism = normalizeMechanism(mechanism);
  const isCut = safeMechanism === 'cut';
  const recognition = index === 0 ? smooth(local * 1.5) : 1;
  const engagement = index === 0 ? smooth((local - .35) / .65) : 1;
  const editAmount = index === 1 ? smooth(local * 1.8) : index > 1 ? 1 : 0;
  const repairAmount = index === 2 ? smooth(local * 1.4) : index > 2 ? 1 : 0;
  const editing = index === 1 && local > .36;
  const deamination = !isCut && editing ? smooth((local - .36) / .48) : index > 1 ? 1 : 0;
  const cutAmount = isCut && index === 1 ? smooth((local - .30) / .42) : isCut && index > 1 ? 1 : 0;
  const strandSeparation = isCut && index < 3 ? cutAmount * .48 : 0;
  const intermediate = !isCut && index === 1 && local > .42;
  const finalSequence = isCut ? CUT_SEQUENCE : EDITED_SEQUENCE;
  const currentSequence = index >= 3 ? finalSequence : ORIGINAL_SEQUENCE;
  return {
    mode: mode.id,
    modeIndex: index,
    modeTitle: mode.title,
    modeLabel: getMechanism(safeMechanism).label,
    structureLabel: isCut ? 'DSB PATHWAY / CELL REPAIR' : 'BASE EDITING / NO DOUBLE-STRAND BREAK',
    phase: normalized,
    local,
    progress: normalized,
    mechanism: safeMechanism,
    isCut,
    doubleStrandBreak: isCut && cutAmount > 0,
    recognition,
    engagement,
    editAmount,
    repairAmount,
    editing,
    deamination,
    cutAmount,
    strandSeparation,
    intermediate,
    completed: index === 3,
    originalSequence: ORIGINAL_SEQUENCE,
    editedSequence: finalSequence,
    currentSequence,
    originalComplement: complementSequence(ORIGINAL_SEQUENCE),
    editedComplement: complementSequence(finalSequence),
    originalPair: targetPair(ORIGINAL_SEQUENCE),
    editedPair: isCut ? '—（1塩基欠失）' : targetPair(finalSequence),
    targetIndex: TARGET_INDEX,
    basePairs: BASE_PAIRS,
    cycleSeconds: CYCLE_SECONDS,
    educational: true,
  };
}

export function sampleParticleSystem(state, clock = 0) {
  const source = calculateCrisprState(state?.phase, state?.mechanism);
  const time = finite(clock) + source.phase * CYCLE_SECONDS;
  return {
    repair: (index, count) => sampleRepairParticle(time, source.repairAmount, index, count, source.mechanism),
    guide: (index, count) => ({
      travel: (index + 1) / (count + 1),
      engagement: source.recognition,
      pulse: .75 + .25 * Math.sin(time * 2 + index * .7),
    }),
  };
}

export function formatTime(phase = 0, seconds = CYCLE_SECONDS) {
  const safeSeconds = Math.max(1, finite(seconds, CYCLE_SECONDS));
  return `${(normalizePhase(phase) * safeSeconds).toFixed(1)} / ${safeSeconds.toFixed(0)} s`;
}

export const sampleCrisprState = calculateCrisprState;
export { getMechanism, getMode };
