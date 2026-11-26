export const DURATION = 40;
export const TAU = Math.PI * 2;
export const OVERALL_DISTANCE = 18;
export const OVERALL_TARGET = Object.freeze([.8, 2.2, 0]);

export const JOINT_NAMES = Object.freeze([
  'leftHipPitch', 'leftKnee', 'leftAnkle', 'rightHipPitch', 'rightKnee', 'rightAnkle',
  'leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow', 'waistYaw', 'neckPitch',
]);

const MODEL_SPEC_BASE = Object.freeze({
  heroPartNames: Object.freeze([
    'head shell', 'face visor', 'depth camera', 'LiDAR turret', 'microphone array', 'neck joint',
    'torso shell', 'chest frame', 'spine joint', 'waist joint', 'pelvis frame', 'battery pack',
    'left hip actuator', 'right hip actuator', 'left thigh link', 'right thigh link',
    'left knee actuator', 'right knee actuator', 'left shank link', 'right shank link',
    'left ankle actuator', 'right ankle actuator', 'left foot shell', 'right foot shell',
    'left sole sensor', 'right sole sensor', 'left shoulder actuator', 'right shoulder actuator',
    'left upper arm', 'right upper arm', 'left elbow actuator', 'right elbow actuator',
    'left forearm', 'right forearm', 'left wrist', 'right wrist', 'left palm', 'right palm',
    'left finger set', 'right finger set', 'IMU module', 'policy compute module', 'cooling channel',
    'emergency stop', 'joint encoder array', 'cable harness', 'fastener array', 'chest status light',
    'head scanning field', 'LiDAR scan plane', 'policy board', 'policy node array', 'policy edge array',
    'planned route', 'obstacle field', 'support polygon', 'center of mass marker', 'balance vector',
    'learning signal', 'quadruped body', 'quadruped hip array', 'quadruped leg links',
    'quadruped feet', 'quadruped sensor mast', 'display plinth', 'reference grid',
  ]),
  joints: 12,
  policyNodes: 26,
  policyEdges: 84,
  sensorPoints: 180,
  bodyFasteners: 48,
  fingerJoints: 30,
  obstacleTiles: 18,
  routeMarkers: 12,
  quadrupedJoints: 8,
  particles: 220,
  pbrMaterials: 10,
  lodLevels: 3,
  hotspots: 5,
});

export const MODEL_SPEC = Object.freeze({
  ...MODEL_SPEC_BASE,
  instancedDetails: MODEL_SPEC_BASE.policyNodes + MODEL_SPEC_BASE.policyEdges + MODEL_SPEC_BASE.sensorPoints
    + MODEL_SPEC_BASE.bodyFasteners + MODEL_SPEC_BASE.fingerJoints + MODEL_SPEC_BASE.obstacleTiles
    + MODEL_SPEC_BASE.routeMarkers,
});

export const CAMERA_PRESETS = Object.freeze({
  overall: Object.freeze({ target: OVERALL_TARGET, distance: OVERALL_DISTANCE, yaw: .62, pitch: .3 }),
  perception: Object.freeze({ target: [.1, 3.1, 0], distance: 12, yaw: .48, pitch: .34 }),
  planning: Object.freeze({ target: [2.5, 2.4, -.2], distance: 16, yaw: .5, pitch: .4 }),
  actuation: Object.freeze({ target: [0, 1.8, 0], distance: 10, yaw: .72, pitch: .12 }),
  balance: Object.freeze({ target: [0, 1.1, 0], distance: 12, yaw: -.48, pitch: .28 }),
  learning: Object.freeze({ target: [3.5, 3.2, -.5], distance: 15, yaw: .62, pitch: .28 }),
});

export const HOTSPOT_CAMERA = Object.freeze({
  sensors: Object.freeze({ target: [0, 4.1, .12], distance: 6, yaw: .35, pitch: .18 }),
  joints: Object.freeze({ target: [.45, 2.1, .05], distance: 6.5, yaw: .8, pitch: .1 }),
  policy: Object.freeze({ target: [3.5, 3.1, -.7], distance: 10, yaw: .3, pitch: .2 }),
  obstacle: Object.freeze({ target: [-2.7, .35, .1], distance: 9, yaw: -.4, pitch: .42 }),
  balance: Object.freeze({ target: [0, .3, .2], distance: 8, yaw: .55, pitch: .55 }),
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
  return ['perception', 'planning', 'actuation', 'balance', 'learning'].includes(value);
}

export function modeWeight(mode, system, selected = false) {
  if (mode === 'perception') return selected ? 1.25 : 1;
  return mode === system ? (selected ? 1.6 : 1.4) : selected ? 1.08 : .56;
}

/** Pure, deterministic teaching state: not a controller or policy execution. */
export function samplePhysicalScene(value, requestedMode = 'perception') {
  const time = normalizeTime(value);
  const mode = isKnownMode(requestedMode) ? requestedMode : 'perception';
  const progress = time / DURATION;
  const gait = progress * TAU * 10;
  const gaitAmplitude = ['actuation', 'balance'].includes(mode) ? 1 : .3;
  const recovery = mode === 'balance' ? smoothstep(0, .9, progress) : .25;
  const jointAngles = [
    Math.sin(gait) * .42 * gaitAmplitude,
    .2 + Math.max(0, Math.sin(gait)) * .55 * gaitAmplitude,
    Math.sin(gait + .5) * .18 * gaitAmplitude,
    Math.sin(gait + Math.PI) * .42 * gaitAmplitude,
    .2 + Math.max(0, Math.sin(gait + Math.PI)) * .55 * gaitAmplitude,
    Math.sin(gait + Math.PI + .5) * .18 * gaitAmplitude,
    -Math.sin(gait) * .34 * gaitAmplitude,
    .22 + Math.sin(gait) * .14 * gaitAmplitude,
    Math.sin(gait + Math.PI) * .34 * gaitAmplitude,
    .22 - Math.sin(gait) * .14 * gaitAmplitude,
    Math.sin(gait * .5) * .08,
    Math.sin(gait * .5 + .4) * .05,
  ];
  const sway = Math.sin(gait * .5) * .075 * (1 - recovery);
  return {
    time, duration: DURATION, mode, progress,
    gait,
    body: Object.freeze({
      position: [0, .05 * Math.cos(gait * 2), 0],
      rotation: [0, 0, sway],
    }),
    jointAngles: Object.freeze(jointAngles),
    contacts: Object.freeze([
      Math.sin(gait) < 0, Math.sin(gait) >= 0,
      Math.sin(gait + Math.PI) < 0, Math.sin(gait + Math.PI) >= 0,
    ]),
    quadrupedPhase: gait * .8,
    perception: Object.freeze({
      scanPhase: (progress * 6) % 1,
      pointPhase: (progress * 9) % 1,
      confidence: clamp01(.66 + .22 * smoothstep(0, .3, progress)),
    }),
    planning: Object.freeze({
      progress: (progress * 2) % 1,
      routeVisible: mode === 'planning',
      replans: mode === 'planning' ? Math.floor(progress * 2) : 0,
    }),
    balance: Object.freeze({
      recovery,
      error: clamp01(.62 * (1 - recovery)),
      supportWidth: 1.15 - .08 * Math.sin(gait),
      centerOfMass: [sway * 2, 1.05, 0],
    }),
    learning: Object.freeze({
      reward: clamp01(.42 + progress * .52),
      exploration: 1 - progress,
      updatePulse: (progress * 5) % 1,
    }),
    flows: Object.freeze({
      policy: (progress * 7) % 1,
      sensor: (progress * 4) % 1,
      motor: (progress * 8) % 1,
      contact: (progress * 10) % 1,
    }),
    educational: true,
  };
}
