export const BODY_RADIUS = 4.5;
const DEG = Math.PI / 180;

export const STARSHIP_MODEL_STATS = Object.freeze({
  flaps: Object.freeze({
    forward: 2,
    aft: 2,
    total: 4,
    aftAngles: Object.freeze([0, 180 * DEG]),
    forwardAngles: Object.freeze([20 * DEG, 160 * DEG]),
    aftStep: 180 * DEG,
    forwardStep: 140 * DEG,
    leewardAngle: 90 * DEG,
  }),
  tiles: Object.freeze({
    coverage: 'windward-hemisphere',
    centerAngle: 0,
    halfAngle: Math.PI / 2,
    leeward: 'bare-stainless',
  }),
  payload: Object.freeze({
    stowedRadius: 2.4,
    deployedHalfSpan: 4.23,
    bodyRadius: BODY_RADIUS,
    deploymentStage: 'orbit',
  }),
  steel: Object.freeze({ metalness: .62, roughness: .3 }),
});

export const FLAP_LAYOUT = Object.freeze({
  aft: Object.freeze({
    count: 2,
    angle: 0,
    step: 180 * DEG,
    height: 6.4,
    y: 9.3,
    extension: 1.86,
    thickness: .17,
    mountRadius: BODY_RADIUS + .02,
    hingeTilt: 0,
    leewardOffset: 0,
  }),
  forward: Object.freeze({
    count: 2,
    angle: 20 * DEG,
    step: 140 * DEG,
    leewardAngle: 90 * DEG,
    height: 2.5,
    y: 23.2,
    extension: 1.22,
    thickness: .1,
    mountRadius: BODY_RADIUS - .12,
    hingeTilt: -.24,
    leewardOffset: -.38,
  }),
});

export const PAYLOAD_LAYOUT = Object.freeze({
  wingRoot: 1.45,
  wingLength: 2.65,
  wingWidth: 2.05,
  wingY: 36.5,
  doorHalfAngle: .78,
  doorBottom: 32.1,
  doorTop: 38.5,
});
