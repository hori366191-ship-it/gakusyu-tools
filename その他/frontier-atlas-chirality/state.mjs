export const DURATION = 40;
export const TAU = Math.PI * 2;
export const OVERALL_DISTANCE = 20;
export const OVERALL_TARGET = Object.freeze([0, 1.5, 0]);

const MODEL_SPEC_BASE = Object.freeze({
  heroPartNames: Object.freeze([
    'catalyst support plate', 'metal surface', 'porous support layer', 'thermal base',
    'active site array', 'binding pocket array', 'chiral ridge array', 'surface groove array',
    'ligand array', 'metal center array', 'ligand backbone array', 'ligand substituent array',
    'anchor bolt array', 'support pin array', 'reactant molecule A', 'reactant molecule B',
    'product molecule A', 'product molecule B', 'mirror plane', 'mirror frame',
    'approach path A', 'approach path B', 'reaction path A', 'reaction path B',
    'major barrier', 'minor barrier', 'transition marker A', 'transition marker B',
    'product collector A', 'product collector B', 'autocatalytic loop', 'amplification ring',
    'surface scan', 'binding halo', 'reaction glow', 'molecular orbit', 'energy baseline',
    'reference axis', 'display plinth', 'catalyst label plate', 'interactive outline',
    'reactant reservoir A', 'reactant reservoir B', 'flow channel A', 'flow channel B',
    'temperature control block', 'mixing paddle', 'solvent field', 'reaction vessel rim',
  ]),
  activeSites: 32,
  bindingPockets: 32,
  ligands: 12,
  metalCenters: 12,
  ligandSubstituents: 36,
  supportLayers: 8,
  surfaceRidges: 24,
  moleculeAtoms: 64,
  moleculeBonds: 60,
  catalystPins: 16,
  particles: 144,
  pbrMaterials: 9,
  lodLevels: 3,
  hotspots: 5,
});

export const MODEL_SPEC = Object.freeze({
  ...MODEL_SPEC_BASE,
  instancedDetails: MODEL_SPEC_BASE.activeSites + MODEL_SPEC_BASE.bindingPockets + MODEL_SPEC_BASE.ligands
    + MODEL_SPEC_BASE.metalCenters + MODEL_SPEC_BASE.ligandSubstituents + MODEL_SPEC_BASE.supportLayers
    + MODEL_SPEC_BASE.surfaceRidges + MODEL_SPEC_BASE.moleculeAtoms + MODEL_SPEC_BASE.moleculeBonds
    + MODEL_SPEC_BASE.catalystPins,
});

export const CAMERA_PRESETS = Object.freeze({
  overall: Object.freeze({ target: OVERALL_TARGET, distance: OVERALL_DISTANCE, yaw: .52, pitch: .38 }),
  achiral: Object.freeze({ target: [0, 1.7, 0], distance: 15, yaw: .25, pitch: .35 }),
  binding: Object.freeze({ target: [0, 1.4, 0], distance: 13, yaw: .58, pitch: .55 }),
  reaction: Object.freeze({ target: [0, 2.2, 0], distance: 14, yaw: .62, pitch: .42 }),
  product: Object.freeze({ target: [0, 1.6, 0], distance: 16, yaw: -.38, pitch: .36 }),
});

export const HOTSPOT_CAMERA = Object.freeze({
  mirror: Object.freeze({ target: [-3.8, 2.7, 0], distance: 8, yaw: .25, pitch: .2 }),
  catalyst: Object.freeze({ target: [0, .55, 0], distance: 11, yaw: .55, pitch: .62 }),
  ligand: Object.freeze({ target: [1.25, 1.05, 0], distance: 6, yaw: .65, pitch: .4 }),
  pathway: Object.freeze({ target: [0, 3, 0], distance: 10, yaw: .35, pitch: .25 }),
  product: Object.freeze({ target: [3.8, 2.6, 0], distance: 8, yaw: -.2, pitch: .2 }),
});

const clamp01 = value => Math.min(1, Math.max(0, value));
const smoothstep = (from, to, value) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

export function normalizeTime(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(DURATION, Math.max(0, value)) : 0;
}

export function formatTime(value) {
  const seconds = Math.floor(normalizeTime(value));
  return `T+ ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function isKnownMode(value) {
  return ['achiral', 'binding', 'reaction', 'product'].includes(value);
}

export function modeWeight(mode, system, selected = false) {
  if (mode === 'achiral') return selected ? 1.25 : 1;
  return mode === system ? (selected ? 1.6 : 1.4) : selected ? 1.08 : .55;
}

/**
 * Pure educational state. ee values and barrier heights are illustrative,
 * deliberately not measurements of a named chemical reaction.
 */
export function sampleChiralityScene(value, requestedMode = 'achiral') {
  const time = normalizeTime(value);
  const mode = isKnownMode(requestedMode) ? requestedMode : 'achiral';
  const progress = time / DURATION;
  const cycle = (progress * 4) % 1;
  const bindingProgress = ['binding', 'reaction', 'product'].includes(mode) ? smoothstep(.08, .78, cycle) : 0;
  const reactionProgress = mode === 'reaction' ? smoothstep(.28, .88, cycle) : mode === 'product' ? smoothstep(.05, .8, progress) : 0;
  const amplification = mode === 'product' ? smoothstep(.05, .92, progress) : 0;
  const eeByMode = { achiral: 0, binding: .38, reaction: .76, product: .94 };
  const enantiomericExcess = eeByMode[mode];
  return {
    time, duration: DURATION, mode, progress, cycle,
    bindingProgress,
    reactionProgress,
    amplification,
    enantiomericExcess,
    majorShare: (1 + enantiomericExcess) * .5,
    barrierMajor: 1.25,
    barrierMinor: mode === 'achiral' ? 1.25 : 1.25 + .45 + .3 * amplification,
    autocatalytic: mode === 'product',
    flows: Object.freeze({
      approach: cycle,
      reaction: (progress * 5) % 1,
      product: (progress * 3 + .22) % 1,
      surface: (progress * 2) % 1,
    }),
    educational: true,
  };
}
