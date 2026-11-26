'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-autonomous-lab');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-autonomous-lab/content.mjs');
const statePromise = import('../../その他/frontier-atlas-autonomous-lab/state.mjs');

class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}

function runtimeStats() {
  const source = read('model.mjs')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
  const context = vm.createContext({
    THREE: { Vector3: FakeVector3 },
    HOTSPOT_IDS: ['ai-core', 'robot-arm', 'microplate', 'microscope', 'human-gate'],
  });
  vm.runInContext(`${source}\nthis.buildModelStats = buildModelStats;`, context);
  return context.buildModelStats();
}

test('content exposes five research stages and distinguishes partial automation from full autonomy', async () => {
  const { MODE_IDS, MODES, HOTSPOT_IDS, SOURCES, EXHIBIT, AUTOMATION_LEVELS } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['hypothesis', 'experiment', 'measurement', 'analysis', 'next-design']);
  assert.deepEqual(MODES.map(mode => mode.id), MODE_IDS);
  assert.deepEqual(HOTSPOT_IDS, ['ai-core', 'robot-arm', 'microplate', 'microscope', 'human-gate']);
  for (const mode of MODES) {
    assert.ok(mode.observed.length >= 2, mode.id);
    assert.ok(mode.research.length >= 1, mode.id);
    assert.ok(mode.conceptual.length >= 1, mode.id);
    assert.ok(mode.specs.length >= 3, mode.id);
    assert.ok(mode.challenges.length >= 2, mode.id);
  }
  assert.match(MODES[0].observed[0], /25領域/);
  assert.match(MODES[1].observed[1], /完全自律運営は同じではありません/);
  assert.match(MODES[3].observed[1], /無誤り/);
  assert.match(MODES[4].conceptual[0], /未実証/);
  assert.equal(AUTOMATION_LEVELS.at(-1).evidence, '構想・未実証');
  assert.ok(SOURCES.some(source => source.href === 'https://www.science.org/doi/10.1126/science.adz4351'));
  assert.match(EXHIBIT.modelNotice, /実際のAIエージェント/);
  assert.match(EXHIBIT.boundaryNotice, /現状の部分的自動化/);
});

test('state normalization is bounded, deterministic and educational', async () => {
  const { calculateLabState, normalizePhase, advancePhase, normalizeAutonomy, normalizeMode } = await statePromise;
  assert.equal(normalizePhase(-.2), .8);
  assert.equal(normalizePhase(2.2), .2);
  assert.equal(normalizePhase(NaN), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.2, Infinity), .2);
  assert.equal(normalizeAutonomy(-20), 0);
  assert.equal(normalizeAutonomy(83), 85);
  assert.equal(normalizeAutonomy(140), 100);
  assert.equal(normalizeAutonomy('80'), 45);
  assert.equal(normalizeMode('unknown'), 'hypothesis');
  assert.deepEqual(calculateLabState('unknown', NaN, null), calculateLabState());
  const state = calculateLabState('analysis', .4, { autonomy: 55, iteration: 3 });
  assert.equal(state.autonomy, 55);
  assert.equal(state.iteration, 3);
  assert.equal(state.loopClosed, false);
  assert.equal(state.humanGateVisible, true);
  assert.equal(state.physicalExperimentPerformed, false);
  assert.equal(state.aiAgentRunning, false);
  assert.equal(state.educational, true);
});

test('autonomy threshold opens human review and labels full autonomy as a concept', async () => {
  const { calculateLabState, CONCEPTUAL_AUTONOMY_THRESHOLD } = await statePromise;
  assert.equal(CONCEPTUAL_AUTONOMY_THRESHOLD, 80);
  const partial = calculateLabState('next-design', .7, { autonomy: 75 });
  const concept = calculateLabState('next-design', .7, { autonomy: 80 });
  assert.equal(partial.loopType, 'open');
  assert.equal(partial.humanGateVisible, true);
  assert.equal(partial.conceptualFullAutonomy, false);
  assert.match(partial.evidenceLabel, /人間レビュー/);
  assert.equal(concept.loopType, 'closed');
  assert.equal(concept.loopClosed, true);
  assert.equal(concept.humanGateVisible, false);
  assert.equal(concept.conceptualFullAutonomy, true);
  assert.equal(concept.flowOpacity, 1);
  assert.equal(concept.evidenceLabel, '構想・未実証');
});

test('each stage drives distinct planning, robot, measurement and analysis state', async () => {
  const { calculateLabState } = await statePromise;
  const hypothesis = calculateLabState('hypothesis', .8);
  const experiment = calculateLabState('experiment', .5);
  const measurement = calculateLabState('measurement', .8);
  const analysis = calculateLabState('analysis', .8);
  const next = calculateLabState('next-design', .8);
  assert.ok(hypothesis.planning > .8);
  assert.equal(experiment.experiment, 1);
  assert.ok(experiment.robot.reach > .5);
  assert.ok(experiment.robot.drop > .8);
  assert.ok(measurement.measurement > .8);
  assert.ok(analysis.analysis > .8);
  assert.ok(next.nextDesign > .8);
  assert.equal(next.next, 'hypothesis');
});

test('robot, flow and analysis samplers stay within deterministic display bounds', async () => {
  const { sampleRobotPose, sampleFlowParticle, sampleAnalysisData } = await statePromise;
  for (const phase of [0, .1, .35, .5, .75, .99]) {
    const pose = sampleRobotPose(phase, 1);
    for (const key of ['shoulder', 'elbow', 'wrist', 'base', 'reach', 'dispense', 'drop']) assert.ok(Number.isFinite(pose[key]), key);
    assert.ok(pose.reach >= 0 && pose.reach <= 1);
    assert.ok(pose.drop >= -1e-9 && pose.drop <= 1);
  }
  for (const life of [-.2, 0, .25, .7, 1.2]) {
    const particle = sampleFlowParticle(life, 9);
    assert.ok(particle.travel >= 0 && particle.travel < 1);
    assert.ok(particle.speed > 0);
  }
  const data = sampleAnalysisData(1);
  assert.equal(data.length, 12);
  assert.ok(data.every(value => value >= 0 && value <= 1));
  assert.deepEqual(sampleAnalysisData(.4), sampleAnalysisData(.4));
});

test('model stats satisfy mechanical density, instancing, PBR and LOD requirements', () => {
  const stats = runtimeStats();
  assert.equal(stats.meaningfulParts, 660);
  assert.equal(stats.instancedDetail, 435);
  assert.equal(stats.instancedMeshes, 10);
  assert.equal(stats.wells, 96);
  assert.equal(stats.chips, 95);
  assert.equal(stats.liquidParticles, 220);
  assert.equal(stats.flowParticles, 30);
  assert.equal(stats.pbrMaterials, 7);
  assert.equal(stats.shaderMaterials, 1);
  assert.equal(stats.lodObjects, 1);
  assert.equal(stats.hotspots, 5);
  assert.ok(stats.meaningfulParts >= 40);
  assert.ok(stats.instancedDetail >= 40);
});

test('HTML exposes five stages, five hotspots, autonomy control and accessible transport', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'stage-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-detail', 'observed-list', 'research-list', 'conceptual-list',
    'selected-card', 'automation-label', 'automation-evidence', 'loop-label', 'transport-loop-label',
    'autonomy', 'autonomy-value', 'autonomy-warning', 'spec-list', 'source-list',
    'play-toggle', 'reset-sim', 'reset-view', 'zoom-in', 'zoom-out', 'progress-bar',
    'iteration-label', 'progress-iteration-label', 'announce', 'help-dialog', 'help-close', 'model-note',
  ]) assert.ok(ids.includes(id), id);
  const appSource = read('app.mjs');
  for (const match of appSource.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `app DOM reference ${match[1]}`);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /<input id="autonomy" type="range" min="0" max="100" step="5" value="45"/);
  assert.match(html, /aria-describedby="autonomy-warning"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="mode-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b/i);
});

test('CSS keeps explanatory copy at 15px, notes at 12px and line-height at least 1.8', () => {
  const css = read('app.css');
  const rules = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1].split(',').map(entry => entry.trim()).includes(selector))
    .map(match => match[2]);
  const fontSize = declaration => Number(declaration.match(/font-size:\s*([\d.]+)px/)?.[1] || 0);
  const lineHeight = declaration => Number(declaration.match(/line-height:\s*([\d.]+)/)?.[1] || 0);
  const assertType = (selector, minimum) => {
    const declarations = rules(selector);
    assert.ok(declarations.length, selector);
    const finalSize = declarations.map(fontSize).filter(Boolean).at(-1);
    const finalHeight = declarations.map(lineHeight).filter(Boolean).at(-1);
    assert.ok(finalSize >= minimum, `${selector} final font-size ${finalSize}`);
    assert.ok(finalHeight >= 1.8, `${selector} final line-height ${finalHeight}`);
  };

  for (const selector of [
    '.mode-copy > p:not(.eyebrow)', '.mode-copy h2', '.selected-card > p:not(.eyebrow)',
    '.selected-card h3', '.automation-readout strong', '.evidence h3', '.evidence ul',
    '.selected-evidence p', '.selected-caveat p', '.source-list a', '.sources p', '.sources h3',
    '.legend-list', '.details-block summary', '.help-content p', '.help-content ul', '.help-content h3',
  ]) assertType(selector, 15);

  for (const selector of [
    '.control-note', '.model-notice', '.challenge-list', '.compact-list li', '.rail-note',
    '.dock-note', '.transport-status small', '.selected-role', '.source-list small',
    '.look-hint', '.help-content .endorsement-note', '.segmented button', '.hotspot',
    '.autonomy-row label', '.autonomy-row label small', '.automation-readout span',
  ]) assertType(selector, 12);

  for (const match of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
    assert.ok(Number(match[1]) >= 12, `no text below 12px: ${match[1]}px`);
  }
  const widths = rules('.info-panel').map(rule => rule.match(/width:\s*([^;]+)/)?.[1]).filter(Boolean);
  assert.deepEqual(widths, ['360px', '350px', '340px', 'auto']);
  assert.match(css, /height:\s*min\(60dvh,\s*520px\)/);
  assert.match(css, /\.info-content\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="open"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  for (const selector of ['.hotspot', '.mode-button', '.speed-control button', '.tool-button', '.reset-button']) {
    assert.ok(rules(selector).some(rule => Number(rule.match(/min-height:\s*([\d.]+)px/)?.[1] || 0) >= 44), `${selector} touch target`);
  }
  assert.match(css, /\.autonomy-row input\[type="range"\]\s*\{[^}]*height:\s*44px/s);
});

test('viewer, model and app implement density, controls and failure-safety contracts', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  const model = read('model.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /onContextLost:\s*fallback/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /prefers-reduced-motion|reduced\.matches/);
  assert.match(app, /advancePhase\(phase, elapsed \* rate \/ CYCLE_SECONDS\)/);
  assert.match(app, /calculateLabState\(mode, phase, \{ autonomy, iteration \}\)/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /setPointerCapture/);
  assert.match(viewer, /setCameraQuaternion/);
  assert.match(viewer, /setSelectedHotspot:\s*id => model\.setSelectedHotspot\(id\)/);
  assert.match(model, /new THREE\.InstancedMesh/);
  assert.match(model, /new THREE\.MeshPhysicalMaterial/);
  assert.match(model, /new THREE\.ShaderMaterial/);
  assert.match(model, /new THREE\.LOD/);
  assert.match(model, /new THREE\.TubeGeometry/);
  assert.match(model, /new THREE\.Points/);
  assert.match(model, /96-well microplate/);
  assert.match(model, /human review gate/);
  assert.doesNotMatch(model, /https?:\/\/|TextureLoader|GLTFLoader/);
  assert.doesNotMatch(viewer, /https?:\/\/|TextureLoader|GLTFLoader/);
});

test('help close controls preserve native Escape and playback restoration', () => {
  const html = read('index.html');
  const app = read('app.mjs');
  assert.match(html, /<button id="help-close" class="icon-button" type="button" aria-label="操作ガイドを閉じる">×<\/button>/);
  assert.match(app, /function closeHelp\(\)\s*\{\s*helpDialog\.close\(\);\s*\}/);
  assert.match(app, /\$\('help-close'\)\.addEventListener\('click', closeHelp\)/);
  assert.match(app, /helpDialog\.getBoundingClientRect\(\)/);
  assert.match(app, /resumeAfterHelp = playing/);
  assert.match(app, /setPlaying\(false\);\s*helpDialog\.showModal\(\)/);
  assert.doesNotMatch(app, /event\.key === 'Escape'|helpDialog\.addEventListener\('cancel'/);
});

test('all documented static assets exist', () => {
  for (const file of [
    'index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs',
    'favicon.svg', 'README.md',
  ]) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
});
