export const DURATION = 40;
export const TAU = Math.PI * 2;
export const OVERALL_DISTANCE = 27;
export const OVERALL_TARGET = Object.freeze([0, 1.3, 0]);

export const SURFACE_CODE_LAYOUT = Object.freeze(Array.from({ length: 49 }, (_, index) => {
  const row = Math.floor(index / 7);
  const column = index % 7;
  return Object.freeze({
    index, row, column,
    kind: (row + column) % 2 === 0 ? 'data' : 'measurement',
    position: Object.freeze([(column - 3) * .82, 1.72, (row - 3) * .82]),
  });
}));

const MODEL_SPEC_BASE = Object.freeze({
  heroPartNames: Object.freeze([
    'silicon substrate', 'superconducting ground plane', 'data qubit array', 'measurement qubit array',
    'data capacitor pads', 'measurement capacitor pads', 'Josephson junction markers', 'coupler array',
    'horizontal couplers', 'vertical couplers', 'resonator traces', 'readout traces', 'wire bond array',
    'microwave control lines', 'chip edge contacts', 'mounting frame', 'copper thermal stage',
    'gold-plated cold stage', 'silver radiation shield', 'vacuum vessel', 'outer shell', 'cryostat lid',
    'bolt ring', 'service flange', 'mixer plate', 'still plate', 'cold finger', 'thermal vias',
    'coaxial feedthroughs', 'pump port', 'thermal radiation fins', 'chip pedestal', 'readout harness',
    'control harness', 'return harness', 'superposition sphere', 'bloch orbit rings', 'state vector',
    'error pulse', 'syndrome bus', 'decoder gate', 'correction pulse', 'logical encoding halo',
    'encoded site links', 'cooling vapor', 'magnetic shield', 'label plate', 'anchor frame',
    'reference axis', 'interactive outline', 'display pedestal',
  ]),
  dataSites: 25,
  measurementSites: 24,
  resonatorTraces: 49,
  couplers: 84,
  wireBonds: 48,
  controlLines: 16,
  cryostatBolts: 24,
  thermalVias: 60,
  edgeContacts: 48,
  radiationFins: 28,
  particles: 180,
  pbrMaterials: 9,
  lodLevels: 3,
  hotspots: 5,
});

export const MODEL_SPEC = Object.freeze({
  ...MODEL_SPEC_BASE,
  instancedDetails: MODEL_SPEC_BASE.dataSites * 4 + MODEL_SPEC_BASE.measurementSites
    + MODEL_SPEC_BASE.couplers + MODEL_SPEC_BASE.wireBonds + MODEL_SPEC_BASE.controlLines
    + MODEL_SPEC_BASE.cryostatBolts + MODEL_SPEC_BASE.thermalVias
    + MODEL_SPEC_BASE.edgeContacts + MODEL_SPEC_BASE.radiationFins,
});

export const CAMERA_PRESETS = Object.freeze({
  overall: Object.freeze({ target: OVERALL_TARGET, distance: OVERALL_DISTANCE, yaw: .58, pitch: .42 }),
  superposition: Object.freeze({ target: [0, 1.7, 0], distance: 15, yaw: .34, pitch: .68 }),
  error: Object.freeze({ target: [.25, 1.75, .5], distance: 12, yaw: .62, pitch: .76 }),
  syndrome: Object.freeze({ target: [0, 1.75, 0], distance: 14, yaw: -.2, pitch: .84 }),
  correction: Object.freeze({ target: [0, 1.8, 0], distance: 13, yaw: .38, pitch: .7 }),
  logical: Object.freeze({ target: [0, 1.7, 0], distance: 18, yaw: .7, pitch: .5 }),
});

export const HOTSPOT_CAMERA = Object.freeze({
  chip: Object.freeze({ target: [0, 1.5, 0], distance: 14, yaw: .35, pitch: .72 }),
  qubit: Object.freeze({ target: [.82, 1.85, .82], distance: 7, yaw: .45, pitch: .55 }),
  resonator: Object.freeze({ target: [0, 1.7, -1], distance: 9, yaw: -.35, pitch: .7 }),
  code: Object.freeze({ target: [0, 1.7, 0], distance: 13, yaw: .3, pitch: 1.02 }),
  cryostat: Object.freeze({ target: [0, .6, 0], distance: 22, yaw: .7, pitch: .22 }),
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
  return ['superposition', 'error', 'syndrome', 'correction', 'logical'].includes(value);
}

export function modeWeight(mode, system, selected = false) {
  if (mode === 'superposition') return selected ? 1.3 : 1;
  return mode === system ? (selected ? 1.65 : 1.45) : selected ? 1.1 : .58;
}

/**
 * Pure educational state. The 49 sites are not a claim about Willow's exact
 * topology. Syndrome bits form a small deterministic teaching decoder.
 */
export function sampleQuantumScene(value, requestedMode = 'superposition') {
  const time = normalizeTime(value);
  const mode = isKnownMode(requestedMode) ? requestedMode : 'superposition';
  const progress = time / DURATION;
  const angle = progress * TAU * 8;
  const errorActive = ['error', 'syndrome', 'correction', 'logical'].includes(mode);
  const errorIndex = errorActive ? 17 + (Math.floor(time * .25) % 5) : -1;
  const errorRow = errorIndex >= 0 ? Math.floor(errorIndex / 7) : 0;
  const errorColumn = errorIndex >= 0 ? errorIndex % 7 : 0;
  const correctionProgress = mode === 'correction' ? smoothstep(.2, .82, progress) : 0;
  const logicalProgress = mode === 'logical' ? smoothstep(0, .9, progress) : 0;
  const syndromeBits = errorActive ? [
    errorColumn % 2,
    (errorColumn + 1) % 2,
    errorRow % 2,
    (errorRow + 1) % 2,
  ] : [0, 0, 0, 0];
  const logicalError = errorActive ? 1 - logicalProgress * .72 - correctionProgress * .25 : 1;

  return {
    time, duration: DURATION, mode, progress,
    angle,
    bloch: Object.freeze({
      x: Math.cos(angle),
      y: Math.sin(angle),
      z: Math.cos(angle * .5),
      amplitude: .5 + .5 * Math.sin(angle),
    }),
    qubits: SURFACE_CODE_LAYOUT.map(site => Object.freeze({
      ...site,
      error: site.index === errorIndex,
      measured: mode === 'syndrome' && site.kind === 'measurement',
      corrected: mode === 'correction' && site.index === errorIndex && correctionProgress > .72,
      logical: mode === 'logical' && site.index >= 16 && site.index <= 18,
    })),
    errorIndex,
    errorActive,
    syndromeBits: Object.freeze(syndromeBits),
    correctionProgress,
    correctionTarget: mode === 'correction' && correctionProgress > .25 ? errorIndex : -1,
    logical: Object.freeze({
      physicalSitesShown: 49,
      highlightedSites: mode === 'logical' ? 3 : 0,
      relativeError: clamp01(logicalError),
      correctionCycles: mode === 'logical' ? Math.floor(progress * 8) : 0,
    }),
    flows: Object.freeze({
      microwave: (progress * 8) % 1,
      readout: (progress * 6 + .17) % 1,
      error: (progress * 4 + .31) % 1,
      cooling: (progress * 2 + .08) % 1,
    }),
    educational: true,
  };
}
