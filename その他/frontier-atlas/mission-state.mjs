import { STAGES } from './content.mjs';

export const MISSION_DURATION = STAGES.at(-1).end;
export const BOOSTER_STACK_HEIGHT = 71;
export const ASCENT_START_ALTITUDE = 80;
export const SEPARATION_START_ALTITUDE = 320;
export const SEPARATION_END_ALTITUDE = 360;
export const BOOSTER_RETURN_HIGH_Y = 390;
export const SHIP_RETURN_HIGH_Y = 660;
export const GROUND_Y = -2.25;
export const GROUND_CLEARANCE = 3;
export const BOOSTER_CATCH_BASE_Y = GROUND_Y + 10.25;
export const SHIP_CATCH_BASE_Y = GROUND_Y + 85.25;
export const BOOSTER_CATCH_SUPPORT_OFFSET = 61.5;
export const SHIP_CATCH_SUPPORT_OFFSET = 16;

export const STAGE_BOUNDS = Object.freeze({
  // Radius includes grid fins / flaps so the clearance calculation is conservative.
  booster: Object.freeze({ minY: 2.45, maxY: 70.9, radius: 7.15 }),
  ship: Object.freeze({ minY: -.4, maxY: 50, radius: 6.45 }),
});

const DEG = Math.PI / 180;
const clamp01 = value => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;

function smooth(value) {
  const t = clamp01(value);
  return t === 0 || t === 1 ? t : t * t * (3 - 2 * t);
}

function smoother(value) {
  const t = clamp01(value);
  return t === 0 || t === 1 ? t : t * t * t * (t * (t * 6 - 15) + 10);
}

export function normalizeMissionTime(value) {
  return Number.isFinite(value) ? Math.min(MISSION_DURATION, Math.max(0, value)) : 0;
}

export function missionStageAt(value) {
  const time = normalizeMissionTime(value);
  const index = STAGES.findIndex(stage => time < stage.end);
  return index < 0 ? STAGES.length - 1 : index;
}

export function formatMissionTime(value) {
  const total = Math.floor(normalizeMissionTime(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `T+ ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function rotatedStageMinY(position, rotation, profile) {
  const angle = Number.isFinite(rotation?.[2]) ? rotation[2] : 0;
  const cosine = Math.cos(angle);
  const radialDrop = profile.radius * Math.abs(Math.sin(angle));
  const lower = Math.min(
    cosine * profile.minY - radialDrop,
    cosine * profile.maxY - radialDrop,
  );
  return position[1] + lower;
}

export function constrainStageAboveGround(position, rotation, profile, margin = GROUND_CLEARANCE) {
  const nextPosition = [...position];
  const nextRotation = [...rotation];
  const minimum = rotatedStageMinY(nextPosition, nextRotation, profile);
  const required = GROUND_Y + margin;
  if (minimum < required) nextPosition[1] += required - minimum;
  return { position: nextPosition, rotation: nextRotation };
}

export function autoTrackingTarget(state) {
  if (state.caught?.booster && state.caught?.ship) return 'both';
  if (state.stageId === 'booster-return') return 'booster';
  if (state.stageId === 'orbit' || state.stageId === 'ship-return') return 'ship';
  if (state.separation > .02) return 'ship';
  return 'stack';
}

export function resolveTrackingTarget(state, selection = 'auto') {
  return ['stack', 'both', 'ship', 'booster'].includes(selection)
    ? selection
    : autoTrackingTarget(state);
}

export function payloadDeploymentAt(stageId, stageProgress) {
  if (stageId !== 'orbit') return { mode: 'stowed', doors: 0, deploy: 0, stowed: true, deployed: false };
  const q = clamp01(stageProgress);
  const doors = smooth(q / .16) * (1 - smooth((q - .78) / .2));
  const deploy = smooth((q - .12) / .25) * (1 - smooth((q - .68) / .22));
  const stowed = doors <= .001 && deploy <= .001;
  const deployed = doors >= .999 && deploy >= .999;
  const mode = stowed ? 'stowed' : deployed ? 'deployed' : q < .5 ? 'deploying' : 'stowing';
  return { mode, doors, deploy, stowed, deployed };
}

function stackPoint(base, pitch, localHeight) {
  return [
    base[0] + Math.sin(pitch) * localHeight,
    base[1] + Math.cos(pitch) * localHeight,
    base[2],
  ];
}

function fixedPose(time) {
  const stage = STAGES[missionStageAt(time)];
  const progress = clamp01((time - stage.start) / (stage.end - stage.start));
  let separation = 0;
  let boosterPosition = [0, 0, 0];
  let shipPosition = [0, BOOSTER_STACK_HEIGHT, 0];
  let boosterRotation = [0, 0, 0];
  let shipRotation = [0, 0, 0];
  let boosterThrust = 1;
  let shipThrust = 0;
  let pitchDegrees = 0;
  const catchProgress = { booster: 0, ship: 0 };
  const caught = { booster: false, ship: false };

  if (time < STAGES[1].start) {
    const rise = smoother(time / STAGES[0].end);
    boosterPosition = [0, ASCENT_START_ALTITUDE * rise, 0];
    shipPosition = [0, BOOSTER_STACK_HEIGHT + boosterPosition[1], 0];
  } else if (time < STAGES[2].start) {
    const q = (time - STAGES[1].start) / (STAGES[1].end - STAGES[1].start);
    const rise = smoother(q);
    pitchDegrees = 22 * rise;
    const pitch = -pitchDegrees * DEG;
    boosterPosition = [0, mix(ASCENT_START_ALTITUDE, SEPARATION_START_ALTITUDE, rise), 0];
    shipPosition = stackPoint(boosterPosition, pitch, BOOSTER_STACK_HEIGHT);
    boosterRotation = [0, 0, pitch];
    shipRotation = [0, 0, pitch];
  } else if (time < STAGES[3].start) {
    const q = (time - STAGES[2].start) / (STAGES[2].end - STAGES[2].start);
    separation = smooth((q - .04) / .88);
    pitchDegrees = mix(22, 38, smoother(q));
    const pitch = -pitchDegrees * DEG;
    boosterPosition = [0, mix(SEPARATION_START_ALTITUDE, SEPARATION_END_ALTITUDE, smoother(q)), 0];
    shipPosition = stackPoint(boosterPosition, pitch, BOOSTER_STACK_HEIGHT + 18 * separation);
    boosterRotation = [0, 0, pitch];
    shipRotation = [0, 0, pitch];
    boosterThrust = 1 - smooth((q - .78) / .18);
    shipThrust = smooth((q - .14) / .2);
  } else if (time < STAGES[4].start) {
    const q = (time - STAGES[3].start) / (STAGES[3].end - STAGES[3].start);
    separation = 1;
    const startPitch = -38 * DEG;
    const shipStart = stackPoint([0, SEPARATION_END_ALTITUDE, 0], startPitch, BOOSTER_STACK_HEIGHT + 18);
    const travel = smoother(q);

    // Move aside while high, finish the rotation, then descend vertically.
    if (q < .4) {
      boosterPosition = [mix(0, -55, smoother(q / .4)), mix(SEPARATION_END_ALTITUDE, BOOSTER_RETURN_HIGH_Y, smoother(q / .4)), 0];
    } else if (q < .6) {
      boosterPosition = [mix(-55, 0, smoother((q - .4) / .2)), BOOSTER_RETURN_HIGH_Y, 0];
    } else {
      boosterPosition = [0, mix(BOOSTER_RETURN_HIGH_Y, BOOSTER_CATCH_BASE_Y, smoother((q - .6) / .26)), 0];
    }
    const rotationProgress = smoother((q - .22) / .38);
    boosterRotation = [0, 0, mix(-38, 0, rotationProgress) * DEG];
    boosterThrust = smooth((q - .6) / .035) * (1 - smooth((q - .973) / .025));
    catchProgress.booster = smooth((q - .87) / .1);
    caught.booster = q >= .975;

    shipPosition = [mix(shipStart[0], 110, travel), mix(shipStart[1], 560, travel), 0];
    shipRotation = [0, 0, -mix(38, 65, smoother(q)) * DEG];
    shipThrust = 1;
    pitchDegrees = -shipRotation[2] / DEG;
  } else if (time < STAGES[5].start) {
    const q = (time - STAGES[4].start) / (STAGES[4].end - STAGES[4].start);
    separation = 1;
    boosterPosition = [0, BOOSTER_CATCH_BASE_Y, 0];
    boosterRotation = [0, 0, 0];
    boosterThrust = 0;
    catchProgress.booster = 1;
    caught.booster = true;
    shipPosition = [mix(110, 150, smoother(q)), mix(560, 610, smoother(q)), 0];
    shipRotation = [0, 0, -mix(65, 72, smoother(q)) * DEG];
    shipThrust = 1 - smooth((q - .75) / .2);
    pitchDegrees = -shipRotation[2] / DEG;
  } else {
    const q = (time - STAGES[5].start) / (STAGES[5].end - STAGES[5].start);
    separation = 1;
    boosterPosition = [0, BOOSTER_CATCH_BASE_Y, 0];
    boosterRotation = [0, 0, 0];
    boosterThrust = 0;
    catchProgress.booster = 1;
    caught.booster = true;

    // Re-entry attitude is completed high above the ground; the final drop is vertical.
    if (q < .6) {
      shipPosition = [
        q < .35 ? mix(150, -60, smoother(q / .35)) : mix(-60, 0, smoother((q - .35) / .25)),
        mix(610, SHIP_RETURN_HIGH_Y, smoother(q / .28)),
        0,
      ];
      let angle;
      if (q < .48) angle = mix(-72, -170, smoother((q - .18) / .3));
      else angle = mix(-170, 0, smoother((q - .48) / .12));
      shipRotation = [0, 0, angle * DEG];
    } else {
      shipPosition = [0, mix(SHIP_RETURN_HIGH_Y, SHIP_CATCH_BASE_Y, smoother((q - .6) / .26)), 0];
      shipRotation = [0, 0, 0];
    }
    shipThrust = smooth((q - .6) / .035) * (1 - smooth((q - .973) / .025));
    catchProgress.ship = smooth((q - .87) / .1);
    caught.ship = q >= .975;
    pitchDegrees = -shipRotation[2] / DEG;
  }

  const boosterPose = constrainStageAboveGround(boosterPosition, boosterRotation, STAGE_BOUNDS.booster);
  const shipPose = constrainStageAboveGround(shipPosition, shipRotation, STAGE_BOUNDS.ship);

  return {
    time,
    duration: MISSION_DURATION,
    stageId: stage.id,
    stageIndex: STAGES.indexOf(stage),
    stageProgress: progress,
    progress: time / MISSION_DURATION,
    separation,
    booster: boosterPose,
    ship: shipPose,
    engines: { booster: boosterThrust, ship: shipThrust },
    catch: catchProgress,
    caught,
    payload: payloadDeploymentAt(stage.id, progress),
    pitchDegrees,
    educational: true,
  };
}

export function sampleMission(value) {
  return fixedPose(normalizeMissionTime(value));
}
