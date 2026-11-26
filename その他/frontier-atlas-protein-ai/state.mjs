import {
  MODE_IDS,
  REPRESENTATIONS,
  SPECIMENS,
  getMode,
  getRepresentation,
  getSpecimen,
} from './content.mjs';

export const PLAYBACK_RATES = Object.freeze([0.5, 1, 2]);
export const CYCLE_SECONDS = Object.freeze(9);
export const CONFIDENCE_STOPS = Object.freeze([
  [0, [1.0, 0.34, 0.18]],
  [50, [1.0, 0.77, 0.24]],
  [70, [0.23, 0.91, 0.94]],
  [90, [0.20, 0.48, 1.0]],
  [100, [0.16, 0.29, 0.82]],
]);

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

export function normalizeMode(value) {
  return MODE_IDS.includes(value) ? value : 'sequence';
}

export function normalizeRepresentation(value) {
  return REPRESENTATIONS.some(entry => entry.id === value) ? value : 'experimental';
}

export function normalizeSpecimen(value) {
  return SPECIMENS.some(entry => entry.id === value) ? value : '1crn';
}

/**
 * Deterministic educational confidence values. These are intentionally not
 * presented as measured pLDDT or as an output of any prediction model.
 */
export function confidenceAt(residueIndex, residueCount) {
  const index = Math.max(0, Math.min(Math.max(0, residueCount - 1), Math.floor(residueIndex)));
  const count = Math.max(1, Math.floor(residueCount));
  const terminal = Math.min(index, count - 1 - index) / Math.max(1, count * .18);
  const secondary = .78 + .17 * Math.sin(index * .61) ** 2;
  const local = .88 + .07 * Math.cos(index * 1.73) ** 2;
  return round(clamp01(terminal * .48 + secondary * .27 + local * .25) * 100, 1);
}

export function confidenceRGB(value) {
  const score = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  for (let index = 1; index < CONFIDENCE_STOPS.length; index++) {
    const [upper, upperColor] = CONFIDENCE_STOPS[index];
    const [lower, lowerColor] = CONFIDENCE_STOPS[index - 1];
    if (score <= upper) {
      const amount = (score - lower) / (upper - lower);
      return lowerColor.map((channel, channelIndex) => round(channel + (upperColor[channelIndex] - channel) * amount));
    }
  }
  return [...CONFIDENCE_STOPS.at(-1)[1]];
}

export function confidenceLabel(value) {
  if (value < 50) return '低い（表示上の目安）';
  if (value < 70) return 'やや低い（表示上の目安）';
  if (value < 90) return '高い（表示上の目安）';
  return 'とても高い（表示上の目安）';
}

export function sampleDockingPose(phase, candidate = 0) {
  const progress = smooth(normalizePhase(phase));
  const index = Math.max(0, Math.min(4, Math.floor(candidate))) % 5;
  const angle = index / 5 * Math.PI * 2 + progress * Math.PI * .35;
  const radius = (1 - progress) * 6.2 + .75;
  return {
    progress,
    candidate: index,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * 1.4 + index) * radius * .42,
    z: Math.sin(angle) * radius,
    rotation: angle + index * .41,
    // A display-only ordinal. It is not a docking score or affinity.
    displayRank: 5 - index,
  };
}

export function calculateProteinState(mode = 'sequence', phase = 0, options = {}) {
  const safeMode = normalizeMode(mode);
  const safePhase = normalizePhase(phase);
  const safeOptions = options && typeof options === 'object' ? options : {};
  const representation = normalizeRepresentation(safeOptions.representation);
  const specimen = normalizeSpecimen(safeOptions.specimen);
  const confidence = safeOptions.confidence !== false;
  const entry = getMode(safeMode);
  const folded = smooth(safePhase);

  let fold = 0;
  let noise = 0;
  let docking = 0;
  let interaction = 0;
  if (safeMode === 'denoise') {
    fold = .18 + folded * .82;
    noise = 1 - folded;
  } else if (safeMode === 'fold') {
    fold = folded;
  } else if (safeMode === 'docking') {
    fold = 1;
    docking = folded;
  } else if (safeMode === 'interaction') {
    fold = 1;
    interaction = folded;
  }

  const specimenEntry = getSpecimen(specimen);
  const meanConfidence = Array.from({ length: specimenEntry.residues }, (_, index) => confidenceAt(index, specimenEntry.residues))
    .reduce((sum, value) => sum + value, 0) / specimenEntry.residues;

  return {
    mode: safeMode,
    modeLabel: entry.shortTitle,
    modeTitle: entry.title,
    stage: entry.stage,
    status: entry.status,
    phase: safePhase,
    progress: folded,
    fold,
    noise,
    docking,
    interaction,
    representation,
    representationLabel: getRepresentation(representation).label,
    specimen,
    specimenLabel: `${specimenEntry.pdb} · ${specimenEntry.name}`,
    confidence,
    meanConfidence: round(meanConfidence, 1),
    confidenceNotice: confidence ? '教育用の疑似pLDDTカラー' : '元素別CPK色',
    cycleSeconds: CYCLE_SECONDS,
    educational: true,
    predictionProxy: representation !== 'experimental',
    experimentalSource: 'RCSB PDB',
    inferencePerformed: false,
    next: safeMode === 'sequence' ? 'denoise' : safeMode === 'denoise' ? 'fold' : safeMode === 'fold' ? 'docking' : safeMode === 'docking' ? 'interaction' : 'sequence',
  };
}

export const sampleProteinState = calculateProteinState;

export function getModeGuidance(state) {
  const current = calculateProteinState(state?.mode, state?.phase, state);
  if (current.mode === 'sequence') return '配列は構造の入力です。機能や折りたたみ経路を直接断定するものではありません。';
  if (current.mode === 'denoise') return 'ノイズ除去の模式化です。実際のAF3推論や学習済みモデルはブラウザ内にありません。';
  if (current.mode === 'fold') return 'PDBの二次構造記録を強調しています。補間は動きやフォールディング経路の再現ではありません。';
  if (current.mode === 'docking') return '自作リガンドの候補配置です。ドッキングスコアや結合自由エネルギーは計算していません。';
  return 'DNAと接触線は一般概念の模式図です。1CRN / 1UBQの結合相手ではありません。';
}
