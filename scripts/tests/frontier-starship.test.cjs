'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas/content.mjs');
const missionPromise = import('../../その他/frontier-atlas/mission-state.mjs');
const modelSpecPromise = import('../../その他/frontier-atlas/starship-model-spec.mjs');

const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const angleDistance = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));

test('the atlas has an extensible 16-entry registry but ships only Starship', async () => {
  const { ATLAS, ATLAS_CAPACITY, CATALOG, ENTRY } = await contentPromise;
  assert.equal(ATLAS_CAPACITY, 16);
  assert.equal(ATLAS.capacity, 16);
  assert.equal(ATLAS.entryNumber, 1);
  assert.equal(CATALOG.length, 1);
  assert.deepEqual(CATALOG[0], ENTRY);
  assert.equal(ENTRY.id, 'starship');
  assert.equal(ENTRY.entryNumber, 1);
  assert.equal(ENTRY.status, '開発・飛行試験中');
  assert.match(ENTRY.summary, /Super Heavy/);
  assert.match(ATLAS.modelNotice, /121m/);
  assert.match(ATLAS.modelNotice, /9m/);
  assert.match(ATLAS.simulationNotice, /教育用モンタージュ/);
  assert.match(ATLAS.endorsementNotice, /承認・推奨/);
});

test('the brand counter follows the actual catalog size and current entry number', async () => {
  const { CATALOG, ENTRY } = await contentPromise;
  const expected = `${String(ENTRY.entryNumber).padStart(2, '0')} / ${String(CATALOG.length).padStart(2, '0')}`;
  const html = read('index.html');
  const app = read('app.mjs');
  assert.equal(expected, '01 / 01');
  assert.ok(html.includes(`<b id="catalog-count">${expected}</b>`));
  assert.doesNotMatch(html, /01 \/ 16/);
  assert.match(app, /ENTRY\.entryNumber/);
  assert.match(app, /CATALOG\.length/);
  assert.match(app, /\$\('catalog-count'\)\.textContent/);
});

test('model stats contract four real flaps, hemisphere tiles and a contained payload', async () => {
  const { STARSHIP_MODEL_STATS, FLAP_LAYOUT, PAYLOAD_LAYOUT } = await modelSpecPromise;
  const model = read('starship-model.mjs');
  assert.deepEqual(
    { forward: STARSHIP_MODEL_STATS.flaps.forward, aft: STARSHIP_MODEL_STATS.flaps.aft, total: STARSHIP_MODEL_STATS.flaps.total },
    { forward: 2, aft: 2, total: 4 },
  );
  assert.equal(FLAP_LAYOUT.aft.count, 2);
  assert.equal(FLAP_LAYOUT.forward.count, 2);
  const deg = Math.PI / 180;
  assert.equal(FLAP_LAYOUT.aft.angle, 0);
  assert.equal(FLAP_LAYOUT.aft.step, 180 * deg);
  assert.equal(FLAP_LAYOUT.forward.angle, 20 * deg);
  assert.equal(FLAP_LAYOUT.forward.step, 140 * deg);
  assert.equal(FLAP_LAYOUT.forward.leewardAngle, 90 * deg);
  assert.deepEqual(STARSHIP_MODEL_STATS.flaps.forwardAngles, [20 * deg, 160 * deg]);
  assert.deepEqual(STARSHIP_MODEL_STATS.flaps.aftAngles, [0, 180 * deg]);
  assert.equal(STARSHIP_MODEL_STATS.flaps.forwardStep, 140 * deg);
  assert.ok(FLAP_LAYOUT.forward.mountRadius < FLAP_LAYOUT.aft.mountRadius);
  assert.ok(FLAP_LAYOUT.forward.hingeTilt < 0);
  assert.match(model, /FLAP_LAYOUT\[kind\]\.angle \+ index \* FLAP_LAYOUT\[kind\]\.step/);
  assert.match(model, /axis\.position\.z = layout\.leewardOffset/);
  assert.match(model, /axis\.rotation\.z = layout\.hingeTilt/);
  assert.match(model, /axis\.add\(hinge\)/);
  assert.match(model, /axis\.add\(reinforcement\)/);
  assert.match(model, /axis\.add\(aerocover\)/);
  assert.ok(FLAP_LAYOUT.forward.height < FLAP_LAYOUT.aft.height);
  assert.ok(FLAP_LAYOUT.forward.thickness < FLAP_LAYOUT.aft.thickness);
  assert.ok(FLAP_LAYOUT.forward.leewardOffset < 0);
  assert.equal(STARSHIP_MODEL_STATS.tiles.coverage, 'windward-hemisphere');
  assert.equal(STARSHIP_MODEL_STATS.tiles.leeward, 'bare-stainless');
  assert.match(model, /isWindward\(angle\)/);
  assert.match(model, /if \(!isWindward\(angle\)\) continue/);
  assert.match(model, /stats:\s*\{[\s\S]*?forward:\s*forwardFlaps\.length[\s\S]*?aft:\s*aftFlaps\.length/);
  assert.ok(STARSHIP_MODEL_STATS.payload.stowedRadius < STARSHIP_MODEL_STATS.payload.bodyRadius);
  assert.ok(STARSHIP_MODEL_STATS.payload.deployedHalfSpan <= STARSHIP_MODEL_STATS.payload.bodyRadius + .05);
  assert.ok(PAYLOAD_LAYOUT.wingRoot + PAYLOAD_LAYOUT.wingLength < STARSHIP_MODEL_STATS.payload.bodyRadius);
  assert.match(model, /payloadDoors/);
  assert.match(model, /solarWings/);
  assert.match(model, /wing\.rotation\.z = side \* Math\.PI \/ 2/);
  assert.match(model, /side \* \(1 - payloadState\.deploy\) \* Math\.PI \/ 2/);
  assert.match(model, /dispenser/);
  assert.match(model, /aerocover/);
  assert.match(model, /reinforcement/);
  assert.match(model, /LineBasicMaterial\(\{ color: 0xc7b98f/);
});

test('payload doors and solar wings deploy only during the orbit stage', async () => {
  const { payloadDeploymentAt, sampleMission } = await missionPromise;
  for (const time of [0, 10, 22, 30, 44, 54, 57, 65, 70]) {
    const state = sampleMission(time);
    if (state.stageId !== 'orbit') {
      assert.deepEqual(state.payload, { mode: 'stowed', doors: 0, deploy: 0, stowed: true, deployed: false }, `stowed at ${time}`);
    }
  }
  const opening = payloadDeploymentAt('orbit', .3);
  const deployed = payloadDeploymentAt('orbit', .55);
  const stowing = payloadDeploymentAt('orbit', .9);
  assert.ok(opening.doors > 0 && opening.deploy > 0 && opening.deploy < 1);
  assert.deepEqual(deployed, { mode: 'deployed', doors: 1, deploy: 1, stowed: false, deployed: true });
  assert.ok(stowing.doors < 1 && stowing.deploy < 1 && !stowing.stowed);
  assert.equal(payloadDeploymentAt('orbit', 0).stowed, true);
  assert.equal(payloadDeploymentAt('orbit', 1).stowed, true);
  assert.equal(payloadDeploymentAt('ship-return', .5).deploy, 0);
});

test('mission stages form a continuous six-part schedule through both catches', async () => {
  const { STAGES } = await contentPromise;
  const { MISSION_DURATION, missionStageAt } = await missionPromise;
  assert.equal(STAGES.length, 6);
  assert.equal(STAGES[0].start, 0);
  assert.equal(STAGES.at(-1).end, 70);
  assert.equal(MISSION_DURATION, 70);
  assert.deepEqual(STAGES.map(stage => [stage.id, stage.start, stage.end]), [
    ['liftoff', 0, 10],
    ['ascent', 10, 22],
    ['hotstage', 22, 30],
    ['booster-return', 30, 44],
    ['orbit', 44, 54],
    ['ship-return', 54, 70],
  ]);
  STAGES.forEach((stage, index) => {
    assert.ok(stage.end > stage.start, stage.id);
    assert.equal(stage.number, index + 1);
    if (index) assert.equal(stage.start, STAGES[index - 1].end, stage.id);
    assert.equal(missionStageAt(stage.start), index, stage.id);
    assert.equal(missionStageAt(stage.end - .0001), index, stage.id);
  });
  assert.equal(missionStageAt(-10), 0);
  assert.equal(missionStageAt(1000), 5);
  assert.equal(missionStageAt(NaN), 0);
});

test('hot staging now happens at a visibly higher compressed educational altitude', async () => {
  const { sampleMission, SEPARATION_START_ALTITUDE, SEPARATION_END_ALTITUDE } = await missionPromise;
  assert.equal(SEPARATION_START_ALTITUDE, 320);
  assert.equal(SEPARATION_END_ALTITUDE, 360);
  assert.ok(sampleMission(22).booster.position[1] >= 320);
  assert.ok(sampleMission(30).booster.position[1] >= 360);
  assert.ok(sampleMission(16).booster.position[1] > 120);
});

test('mission poses, thrust and catch progress are finite and continuous across every boundary', async () => {
  const { STAGES } = await contentPromise;
  const { sampleMission } = await missionPromise;
  for (const boundary of STAGES.slice(1).map(stage => stage.start)) {
    const before = sampleMission(boundary - 1e-6);
    const after = sampleMission(boundary + 1e-6);
    assert.ok(distance(before.booster.position, after.booster.position) < .001, `booster position at ${boundary}`);
    assert.ok(distance(before.ship.position, after.ship.position) < .001, `ship position at ${boundary}`);
    assert.ok(angleDistance(before.booster.rotation, after.booster.rotation) < .001, `booster rotation at ${boundary}`);
    assert.ok(angleDistance(before.ship.rotation, after.ship.rotation) < .001, `ship rotation at ${boundary}`);
    assert.ok(Math.abs(before.engines.booster - after.engines.booster) < .001, `booster thrust at ${boundary}`);
    assert.ok(Math.abs(before.engines.ship - after.engines.ship) < .001, `ship thrust at ${boundary}`);
    assert.ok(Math.abs(before.catch.booster - after.catch.booster) < .001, `booster catch at ${boundary}`);
    assert.ok(Math.abs(before.catch.ship - after.catch.ship) < .001, `ship catch at ${boundary}`);
  }

  let priorSeparation = 0;
  let priorBoosterCatch = 0;
  let priorShipCatch = 0;
  for (let time = 0; time <= 70; time += .25) {
    const state = sampleMission(time);
    for (const stage of [state.booster, state.ship]) {
      assert.equal(stage.position.length, 3);
      assert.equal(stage.rotation.length, 3);
      assert.ok([...stage.position, ...stage.rotation].every(Number.isFinite), `finite pose at ${time}`);
    }
    assert.ok(state.engines.booster >= 0 && state.engines.booster <= 1);
    assert.ok(state.engines.ship >= 0 && state.engines.ship <= 1);
    assert.ok(state.separation >= priorSeparation, `separation at ${time}`);
    assert.ok(state.catch.booster >= priorBoosterCatch, `booster catch at ${time}`);
    assert.ok(state.catch.ship >= priorShipCatch, `ship catch at ${time}`);
    assert.ok(state.separation <= 1 && state.catch.booster <= 1 && state.catch.ship <= 1);
    assert.ok(state.stageProgress >= 0 && state.stageProgress <= 1);
    priorSeparation = state.separation;
    priorBoosterCatch = state.catch.booster;
    priorShipCatch = state.catch.ship;
  }
});

test('rotated stage bounds and every sampled pose stay above the shared ground clearance', async () => {
  const {
    GROUND_Y,
    GROUND_CLEARANCE,
    STAGE_BOUNDS,
    BOOSTER_CATCH_BASE_Y,
    SHIP_CATCH_BASE_Y,
    rotatedStageMinY,
    constrainStageAboveGround,
    sampleMission,
  } = await missionPromise;
  const required = GROUND_Y + GROUND_CLEARANCE;
  assert.equal(GROUND_Y, -2.25);
  assert.ok(GROUND_CLEARANCE > 0);
  for (let time = 0; time <= 70; time += .1) {
    const state = sampleMission(time);
    for (const name of ['booster', 'ship']) {
      const minimum = rotatedStageMinY(state[name].position, state[name].rotation, STAGE_BOUNDS[name]);
      assert.ok(minimum >= required - 1e-9, `${name} minimum ${minimum} at ${time}`);
      assert.ok(state[name].position[1] >= 0, `${name} base is not underground at ${time}`);
    }
  }
  const constrained = constrainStageAboveGround([0, -20, 0], [0, 0, Math.PI / 2], STAGE_BOUNDS.booster);
  assert.ok(rotatedStageMinY(constrained.position, constrained.rotation, STAGE_BOUNDS.booster) >= required - 1e-9);
  assert.equal(BOOSTER_CATCH_BASE_Y, 8);
  assert.equal(SHIP_CATCH_BASE_Y, 83);
});

test('booster and ship complete high rotation, vertical descent, arm closure and engine cutoff', async () => {
  const {
    BOOSTER_CATCH_BASE_Y,
    SHIP_CATCH_BASE_Y,
    BOOSTER_RETURN_HIGH_Y,
    SHIP_RETURN_HIGH_Y,
    STAGE_BOUNDS,
    sampleMission,
  } = await missionPromise;
  const boosterUpright = sampleMission(30 + 14 * .6);
  assert.ok(Math.abs(boosterUpright.booster.position[0]) < 1e-9);
  assert.equal(boosterUpright.booster.position[1], BOOSTER_RETURN_HIGH_Y);
  assert.ok(Math.abs(boosterUpright.booster.rotation[2]) < 1e-9);
  assert.equal(boosterUpright.catch.booster, 0);
  const boosterDescent = sampleMission(30 + 14 * .61);
  assert.ok(boosterDescent.booster.position[1] < BOOSTER_RETURN_HIGH_Y);
  assert.ok(boosterDescent.engines.booster > 0);
  const boosterClosing = sampleMission(30 + 14 * .971);
  assert.equal(boosterClosing.catch.booster, 1);
  assert.equal(boosterClosing.booster.position[1], BOOSTER_CATCH_BASE_Y);
  assert.ok(boosterClosing.engines.booster > 0, 'engines stop after the arms close');
  const boosterCaught = sampleMission(44);
  assert.equal(boosterCaught.caught.booster, true);
  assert.equal(boosterCaught.engines.booster, 0);
  assert.equal(boosterCaught.booster.rotation[2], 0);

  const shipUpright = sampleMission(54 + 16 * .6);
  assert.ok(Math.abs(shipUpright.ship.position[0]) < 1e-9);
  assert.equal(shipUpright.ship.position[1], SHIP_RETURN_HIGH_Y);
  assert.ok(Math.abs(shipUpright.ship.rotation[2]) < 1e-9);
  assert.equal(shipUpright.catch.ship, 0);
  const shipDescent = sampleMission(54 + 16 * .61);
  assert.ok(shipDescent.ship.position[1] < SHIP_RETURN_HIGH_Y);
  assert.ok(shipDescent.engines.ship > 0);
  const shipClosing = sampleMission(54 + 16 * .971);
  assert.equal(shipClosing.catch.ship, 1);
  assert.equal(shipClosing.ship.position[1], SHIP_CATCH_BASE_Y);
  assert.ok(shipClosing.engines.ship > 0, 'ship engines stop after the arms close');
  const final = sampleMission(70);
  assert.deepEqual(final.caught, { booster: true, ship: true });
  assert.deepEqual(final.catch, { booster: 1, ship: 1 });
  assert.deepEqual(final.engines, { booster: 0, ship: 0 });
  assert.deepEqual(final.booster.position, [0, BOOSTER_CATCH_BASE_Y, 0]);
  assert.deepEqual(final.ship.position, [0, SHIP_CATCH_BASE_Y, 0]);
  assert.ok(SHIP_CATCH_BASE_Y - (BOOSTER_CATCH_BASE_Y + STAGE_BOUNDS.booster.maxY) > 0, 'caught stages do not collide');
});

test('the montage demonstrates ignition, hot staging, both returns and final stacked catches', async () => {
  const { sampleMission } = await missionPromise;
  const launch = sampleMission(0);
  const ascent = sampleMission(16);
  const staging = sampleMission(27);
  const boosterReturn = sampleMission(35);
  const orbit = sampleMission(49);
  const shipReturn = sampleMission(57);
  const final = sampleMission(70);

  assert.equal(launch.engines.booster, 1);
  assert.equal(launch.engines.ship, 0);
  assert.equal(launch.separation, 0);
  assert.ok(ascent.booster.position[1] > launch.booster.position[1]);
  assert.ok(staging.separation > 0 && staging.separation < 1);
  assert.ok(staging.engines.booster > 0, 'booster keeps firing during hot staging');
  assert.ok(staging.engines.ship > 0, 'upper stage ignites during hot staging');
  assert.equal(boosterReturn.caught.booster, false);
  assert.ok(boosterReturn.booster.position[0] < 0, 'booster moves laterally while high');
  assert.ok(orbit.ship.position[1] > boosterReturn.ship.position[1]);
  assert.ok(distance(orbit.ship.position, orbit.booster.position) > 250);
  assert.equal(orbit.caught.booster, true);
  assert.equal(shipReturn.stageId, 'ship-return');
  assert.equal(shipReturn.caught.ship, false);
  assert.equal(final.stageId, 'ship-return');
  assert.equal(final.stageProgress, 1);
  assert.ok(final.separation > 0);
});

test('auto tracking is stage-aware and manual selection remains explicit', async () => {
  const { autoTrackingTarget, resolveTrackingTarget, sampleMission } = await missionPromise;
  assert.equal(autoTrackingTarget(sampleMission(0)), 'stack');
  assert.equal(autoTrackingTarget(sampleMission(27)), 'ship');
  assert.equal(autoTrackingTarget(sampleMission(38)), 'booster');
  assert.equal(autoTrackingTarget(sampleMission(49)), 'ship');
  assert.equal(autoTrackingTarget(sampleMission(60)), 'ship');
  assert.equal(autoTrackingTarget(sampleMission(70)), 'both');
  assert.equal(resolveTrackingTarget(sampleMission(38), 'ship'), 'ship');
  assert.equal(resolveTrackingTarget(sampleMission(70), 'booster'), 'booster');
  assert.equal(resolveTrackingTarget(sampleMission(0), 'invalid'), 'stack');
});

test('invalid mission input is deterministic and time formatting includes the 70-second montage', async () => {
  const { normalizeMissionTime, formatMissionTime, sampleMission } = await missionPromise;
  assert.equal(normalizeMissionTime(-1), 0);
  assert.equal(normalizeMissionTime(71), 70);
  assert.equal(normalizeMissionTime(Infinity), 0);
  assert.equal(normalizeMissionTime('12'), 0);
  assert.deepEqual(sampleMission(NaN), sampleMission(0));
  assert.equal(formatMissionTime(0), 'T+ 00:00');
  assert.equal(formatMissionTime(22.9), 'T+ 00:22');
  assert.equal(formatMissionTime(70), 'T+ 01:10');
  assert.equal(formatMissionTime(-5), 'T+ 00:00');
});

test('content distinguishes demonstrated catches from the planned upper-stage catch', async () => {
  const { STAGES, HOTSPOTS, SPECIFICATIONS, SOURCES, PRINCIPLES } = await contentPromise;
  for (const stage of STAGES) {
    assert.ok(stage.summary.length > 30, stage.id);
    assert.ok(stage.confirmed.length >= 2, stage.id);
    assert.ok(stage.planned.length >= 2, stage.id);
    assert.ok(stage.study.length > 10, stage.id);
  }
  const booster = STAGES.find(stage => stage.id === 'booster-return');
  const ship = STAGES.find(stage => stage.id === 'ship-return');
  assert.match(booster.summary, /アーム/);
  assert.match(booster.summary, /垂直降下/);
  assert.match(ship.summary, /開発・構想/);
  assert.ok(ship.planned.some(item => /上段のアームキャッチ/.test(item)));
  assert.ok(PRINCIPLES.some(([term]) => term === 'アームキャッチ'));
  assert.deepEqual(Object.keys(HOTSPOTS), ['engines', 'tanks', 'hotstage', 'flaps', 'payload']);
  for (const [id, entry] of Object.entries(HOTSPOTS)) {
    assert.ok(entry.title && entry.description.length > 40, id);
    assert.ok(entry.specs.length >= 3, id);
    assert.ok(entry.specs.every(([term, value]) => term.trim() && value), id);
  }
  assert.ok(SPECIFICATIONS.some(([term, value]) => term === 'エンジン' && value === '33 + 6基'));
  assert.deepEqual(SOURCES, [
    { label: 'SpaceX — Starship', href: 'https://www.spacex.com/vehicles/starship' },
    { label: 'SpaceX — Updates', href: 'https://www.spacex.com/updates' },
  ]);
});

test('help dialog closes explicitly, on backdrop click and natively on Escape while restoring playback', () => {
  const html = read('index.html');
  const app = read('app.mjs');
  assert.match(html, /<button id="help-close"[^>]*aria-label="操作ガイドを閉じる"/);
  assert.doesNotMatch(html, /<form method="dialog"><button[^>]*操作ガイドを閉じる/);
  assert.match(app, /function closeHelp\(\)\s*\{\s*if \(helpDialog\.open\) helpDialog\.close\(\);/);
  assert.match(app, /helpClose\.addEventListener\('click', closeHelp\)/);
  assert.match(app, /helpDialog\.addEventListener\('click'/);
  assert.match(app, /getBoundingClientRect\(\)/);
  assert.match(app, /event\.clientX < bounds\.left/);
  assert.match(app, /event\.clientY > bounds\.bottom/);
  assert.match(app, /helpDialog\.addEventListener\('close'[\s\S]*?resumeAfterHelp[\s\S]*?setPlaying\(true\)/);
  assert.match(app, /event\.key === 'Escape' && !observationDrawer\.hidden && !helpDialog\.open/);
});

test('Earth uses copied app13 Blue Marble textures at a larger proportional scale', () => {
  const viewer = read('starship-viewer.mjs');
  const html = read('index.html');
  const readme = read('README.md');
  assert.match(viewer, /EARTH_RADIUS = 1000/);
  assert.match(viewer, /EARTH_ATMOSPHERE_SCALE = 1\.018/);
  assert.match(viewer, /EARTH_TEXTURE_PATHS[\s\S]*?earth-4096\.webp[\s\S]*?earth-2048\.webp/);
  assert.match(viewer, /new THREE\.TextureLoader\(\)/);
  assert.match(viewer, /texture\.colorSpace = THREE\.SRGBColorSpace/);
  assert.match(viewer, /texture\.anisotropy = anisotropy/);
  assert.match(viewer, /texture\.generateMipmaps = false/);
  assert.match(viewer, /texture\.minFilter = THREE\.LinearFilter/);
  assert.match(viewer, /texture\.magFilter = THREE\.LinearFilter/);
  assert.match(viewer, /texture\.needsUpdate = true/);
  assert.match(viewer, /level >= 3 && !coarse \? 4096 : 2048/);
  assert.match(viewer, /SphereGeometry\(EARTH_RADIUS \* EARTH_ATMOSPHERE_SCALE/);
  assert.doesNotMatch(viewer, /function makeTerrain|makeTerrain\(|terrainMaterial|flatRadius|blendRadius|outerRadius/);
  assert.match(viewer, /function makeLaunchComplex/);
  assert.match(viewer, /new THREE\.CylinderGeometry\(15, 16\.5, 2\.5, 48\)/);
  assert.match(viewer, /EARTH_RADIUS \* 1\.8 \+ random\(\) \* EARTH_RADIUS \* 1\.2/);
  assert.match(viewer, /PerspectiveCamera\(50, 1, \.1, 6500\)/);
  assert.match(viewer, /Math\.max\(6500, actualDistance \+ 5000\)/);
  assert.doesNotMatch(viewer, /function earthTexture|new THREE\.CanvasTexture/);
  assert.match(html, /NASA Blue Marble: Next Generation, July 2004/);
  assert.match(readme, /NASA Blue Marble: Next Generation, July 2004/);
  for (const size of [4096, 2048]) {
    const name = `earth-${size}.webp`;
    const copied = fs.readFileSync(path.join(appRoot, 'textures', name));
    const source = fs.readFileSync(path.join(__dirname, '../../site/app13/textures', name));
    assert.deepEqual(copied, source, `${name} is an exact app13 copy`);
  }
});

test('Earth orientation quaternion maps Boca Chica, Texas to world +Y', () => {
  const viewer = read('starship-viewer.mjs');
  assert.match(viewer, /const lat = 26\.0 \* DEG/);
  assert.match(viewer, /const lon = -97\.2 \* DEG/);
  assert.match(viewer, /const phi = \(lon \+ 180 \* DEG\) \/ \(2 \* Math\.PI\) \* TAU/);
  assert.match(viewer, /const theta = Math\.PI \/ 2 - lat/);
  assert.match(viewer, /const dir = new THREE\.Vector3\(-Math\.cos\(phi\) \* Math\.sin\(theta\), Math\.cos\(theta\), Math\.sin\(phi\) \* Math\.sin\(theta\)\)/);
  assert.match(viewer, /surface\.quaternion\.setFromUnitVectors\(dir, new THREE\.Vector3\(0, 1, 0\)\)/);
  assert.doesNotMatch(viewer, /surface\.rotation\.[yz]/);

  const deg = Math.PI / 180;
  const lat = 26.0 * deg;
  const lon = -97.2 * deg;
  const phi = (lon + 180 * deg) / (2 * Math.PI) * (2 * Math.PI);
  const theta = Math.PI / 2 - lat;
  const dir = [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
  const cross = [-dir[2], 0, dir[0]];
  const quaternion = [...cross, 1 + dir[1]];
  const length = Math.hypot(...quaternion);
  const [x, y, z, w] = quaternion.map(value => value / length);
  const v = dir;
  const uv = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  const result = v.map((value, index) => value + 2 * (w * uv[index] + uuv[index]));
  assert.ok(Math.abs(result[0]) < 1e-12);
  assert.ok(Math.abs(result[1] - 1) < 1e-12);
  assert.ok(Math.abs(result[2]) < 1e-12);
});

test('Earth texture loading is cached, non-disposing on swaps and exposes stable DOM state', () => {
  const viewer = read('starship-viewer.mjs');
  assert.match(viewer, /function makeEarth\(host, renderer, initialLevel, isCoarse\)/);
  assert.match(viewer, /makeEarth\(host, renderer,/);
  assert.match(viewer, /const material = new THREE\.MeshBasicMaterial\(\{ color: 0x17384a, toneMapped: false \}\)/);
  assert.match(viewer, /material\.color\.setRGB\(2\.5, 2\.5, 2\.5\)/);
  assert.doesNotMatch(viewer, /emissiveMap|emissiveIntensity|material\.emissive/);
  assert.match(viewer, /const textureCache = new Map\(\)/);
  assert.match(viewer, /const loadCache = new Map\(\)/);
  assert.match(viewer, /if \(textureCache\.has\(size\)\) return Promise\.resolve\(textureCache\.get\(size\)\)/);
  assert.match(viewer, /if \(loadCache\.has\(size\)\) return loadCache\.get\(size\)/);
  assert.match(viewer, /const cached = textureCache\.get\(size\)/);
  assert.match(viewer, /if \(cached\)\s*\{\s*applyTexture\(cached, size\);/);
  assert.match(viewer, /material\.color\.setRGB\(2\.5, 2\.5, 2\.5\)/);
  assert.match(viewer, /host\.dataset\.earthTextureState = 'loading'/);
  assert.match(viewer, /host\.dataset\.earthTextureState = 'ready'/);
  assert.match(viewer, /host\.dataset\.earthTextureState = 'error'/);
  assert.match(viewer, /host\.dataset\.earthTextureSize = String\(size\)/);
  assert.doesNotMatch(viewer, /const previous = material\.map|previous\?\.dispose|material\.map\?\.dispose/);
  const failure = viewer.match(/\.catch\(error => \{([\s\S]*?)\n    \}\);/);
  assert.ok(failure, 'texture failure handler exists');
  assert.doesNotMatch(failure[1], /material\.map\s*=/, 'failure keeps the current map');
  assert.match(failure[1], /earthTextureState = 'error'/);
  assert.match(viewer, /dispose\(\)\s*\{\s*if \(disposed\) return;/);
  assert.match(viewer, /for \(const texture of textureCache\.values\(\)\) texture\.dispose\(\)/);
  assert.match(viewer, /textureCache\.clear\(\)/);
  assert.match(viewer, /loadCache\.clear\(\)/);
});

test('screen shade keeps the UI readable without dimming the central Earth', () => {
  const css = read('app.css');
  const viewer = read('starship-viewer.mjs');
  const base = css.match(/\.screen-shade\s*\{([^}]*)\}/);
  const mobile = css.match(/@media \(max-width: 760px\)[\s\S]*?\.screen-shade\s*\{([^}]*)\}/);
  assert.ok(base && mobile, 'desktop and mobile shade rules exist');
  assert.match(base[1], /pointer-events:\s*none/);
  const alphas = body => [...body.matchAll(/rgba\(3,\s*7,\s*13,\s*([0-9.]+)\)/g)].map(match => Number(match[1]));
  for (const body of [base[1], mobile[1]]) {
    const vertical = body.match(/linear-gradient\(180deg,[^\n]+/);
    const horizontal = body.match(/linear-gradient\(90deg,[^\n]+/);
    assert.ok(vertical && horizontal, 'both shade gradients exist');
    const [top, bottom] = alphas(vertical[0]);
    assert.ok(top >= .5, 'upper UI shade remains readable');
    assert.ok(bottom >= .35 && bottom <= .45, 'lower Earth shade stays weak');
    const sides = alphas(horizontal[0]);
    assert.equal(sides.length, 2);
    assert.ok(sides.every(alpha => alpha <= .25), 'side shades stay weak');
  }
  assert.doesNotMatch(css, /rgba\(3,\s*7,\s*13,\s*\.(?:78|8|86|92)\)/);
  assert.doesNotMatch(viewer, /__frontierDebug|debug=earth|EarthSurface|EarthAtmosphere/);
});

test('HTML exposes six stages, four tracking buttons and a 70-second timeline without the old select', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'load-status', 'entry-title', 'catalog-count', 'stage-list',
    'info-panel', 'info-toggle', 'phase-title', 'phase-description', 'focus-card', 'observation-open',
    'observation-drawer', 'observation-close', 'tracking-control', 'tracking-status',
    'section-toggle', 'explode-toggle', 'reset-view', 'hotspot-layer', 'play-toggle',
    'mission-timeline', 'timeline-stages', 'reset-mission', 'announce', 'help-dialog', 'help-close',
  ]) assert.ok(ids.includes(id), id);

  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.ok(importMap, 'import map is present');
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /id="observation-open"[^>]*aria-expanded="false"[^>]*aria-controls="observation-drawer"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="view-button"/g) || []).length, 4);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.equal((html.match(/data-track=/g) || []).length, 4);
  assert.equal((html.match(/data-stage-index=/g) || []).length, 12);
  assert.match(html, /<input id="mission-timeline" type="range" min="0" max="70"/);
  assert.match(html, /id="tracking-status" role="status">分離後に選択できます/);
  assert.ok(html.indexOf('id="tracking-control"') > html.indexOf('<section class="transport"'), 'tracking lives inside transport');
  assert.ok(html.indexOf('data-view="overall"') > html.indexOf('id="observation-drawer"'), 'view controls live in the drawer');
  assert.doesNotMatch(html, /view-dock|follow-target|<select[^>]*id="follow-target"/);
  assert.match(html, /https:\/\/www\.spacex\.com\/vehicles\/starship" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /https:\/\/www\.spacex\.com\/updates" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b|spacex\.com\/[^"']+\.(?:png|jpe?g|webp)/i);
});

test('CSS keeps tracking visible on mobile and preserves touch-sized six-stage controls', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.mission-rail\s*\{\s*display:\s*none;/);
  assert.match(css, /\.observation-drawer\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.observation-drawer\s*\{[^}]*bottom:/);
  assert.match(css, /\.transport > \.tracking-control/);
  assert.doesNotMatch(css, /\.view-dock/);
  assert.match(css, /\.tracking-control\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.tracking-buttons button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.tracking-control\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.hotspot\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.view-button,\s*\.tool-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /repeat\(6, minmax\(44px, 1fr\)\)/);
  assert.doesNotMatch(css, /\.follow-control/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /touch-action:\s*none/);
});

test('explanation typography meets readable font-size, line-height and contrast contracts', () => {
  const css = read('app.css');
  const rule = selector => {
    const marker = `${selector} {`;
    const start = css.indexOf(marker);
    assert.ok(start >= 0, `missing rule: ${selector}`);
    return css.slice(start + marker.length, css.indexOf('}', start));
  };
  const number = (body, property) => {
    const match = body.match(new RegExp(`${property}:\\s*([0-9.]+)`));
    assert.ok(match, `missing ${property}`);
    return Number(match[1]);
  };
  for (const [selector, minimumSize] of [
    ['.phase-copy > p:not(.eyebrow)', 15],
    ['.phase-copy .study-note', 12],
    ['.focus-card > p:not(.eyebrow)', 12],
    ['.evidence ul', 12],
    ['.principles dd', 12],
    ['.fine-print', 12],
    ['.sources p', 12],
    ['.help-content p', 15],
    ['.help-content ul', 15],
  ]) {
    const body = rule(selector);
    assert.ok(number(body, 'font-size') >= minimumSize, `${selector} font-size`);
    assert.ok(number(body, 'line-height') >= 1.8, `${selector} line-height`);
  }
  assert.match(rule('.info-panel'), /width:\s*350px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?height:\s*60dvh/);
  assert.match(css, /--muted:\s*#c4d4de/);
  assert.match(css, /--dim:\s*#96aab8/);
  assert.doesNotMatch(css, /--muted:\s*#a7b8c5|--dim:\s*#718493/);
});

test('hotstage auto camera centers both stages and keeps the fit distance between 240 and 360', () => {
  const viewer = read('starship-viewer.mjs');
  assert.match(viewer, /view === 'overall' && follow === 'auto' && state\.stageId === 'hotstage'/);
  assert.match(viewer, /centerB\.copy\(boosterCenter\)\.add\(shipCenter\)\.multiplyScalar\(\.5\)/);
  assert.match(viewer, /desiredTarget\.copy\(centerB\)/);
  assert.match(viewer, /Math\.min\(360, Math\.max\(240, fitDistance\(span, \.78\)\)\)/);
  assert.doesNotMatch(viewer, /centerB\.set\(0, 20, 0\)|Math\.min\(900, fitDistance/);
});

test('app and viewer implement stage-aware tracking, animated catch arms and shared ground height', () => {
  const app = read('app.mjs');
  const viewer = read('starship-viewer.mjs');
  const model = read('starship-model.mjs');
  assert.match(app, /resolveTrackingTarget/);
  assert.match(app, /data-track/);
  assert.match(app, /function seekStage[\s\S]*?setFollow\('auto'/);
  assert.match(app, /function updateTrackingUI/);
  assert.match(app, /function setObservationOpen/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.doesNotMatch(app, /follow-target/);
  assert.match(viewer, /GROUND_Y/);
  assert.match(viewer, /resolveTrackingTarget/);
  assert.doesNotMatch(viewer, /makeTerrain|terrainMaterial/);
  assert.match(viewer, /function makeCatchAssembly/);
  assert.match(viewer, /launchComplex\.update\(state\)/);
  assert.match(viewer, /BOOSTER_CATCH_SUPPORT_OFFSET/);
  assert.match(viewer, /SHIP_CATCH_SUPPORT_OFFSET/);
  assert.doesNotMatch(viewer, /-2\.25/);
  assert.match(model, /GROUND_Y/);
  assert.match(model, /groundY:\s*GROUND_Y/);
  assert.match(app, /await import\('\.\/starship-viewer\.mjs'\)/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /onContextLost:\s*fallback/);
  assert.match(viewer, /new THREE\.InstancedMesh|model\.setQuality/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /previousNow = undefined/);
  assert.match(viewer, /prefers-reduced-motion/);
  assert.match(viewer, /RoomEnvironment/);
  assert.match(viewer, /state\.stageId === 'hotstage'/);
  assert.match(model, /new THREE\.InstancedMesh/);
  assert.match(model, /engineCounts:\s*\{\s*booster:\s*engines\.booster\.length,\s*ship:\s*engines\.ship\.length\s*\}/);
  assert.doesNotMatch(model, /https?:\/\/|TextureLoader|GLTFLoader/);
});

test('all documented static assets exist without a build step', () => {
  for (const file of [
    'index.html', 'app.css', 'app.mjs', 'starship-model-spec.mjs', 'starship-model.mjs', 'starship-viewer.mjs',
    'mission-state.mjs', 'content.mjs', 'favicon.svg', 'README.md',
    'textures/earth-4096.webp', 'textures/earth-2048.webp',
  ]) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
});
