'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRuntimeModel } = require('./frontier-life-test-helpers.cjs');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-optogenetics');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-optogenetics/content.mjs');
const statePromise = import('../../その他/frontier-atlas-optogenetics/state.mjs');

function ruleBodies(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(match => match[1]);
}

function fontFloor(css, selector) {
  const sizes = ruleBodies(css, selector).flatMap(body => [...body.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])));
  assert.ok(sizes.length > 0, `${selector} has a font size`);
  return Math.min(...sizes);
}

function lineHeightFloor(css, selector) {
  const values = ruleBodies(css, selector).flatMap(body => [...body.matchAll(/line-height:\s*([\d.]+)/g)].map(match => Number(match[1])));
  assert.ok(values.length > 0, `${selector} has a line height`);
  return Math.min(...values);
}

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

async function runtimeModel() {
  const content = await contentPromise;
  const state = await statePromise;
  const api = loadRuntimeModel(appRoot, 'model.mjs', 'createOptogeneticsModel', {
    HOTSPOTS: content.HOTSPOTS,
    MODE_IDS: content.MODE_IDS,
    TAU: state.TAU,
    calculateOptogeneticsState: state.calculateOptogeneticsState,
    sampleParticleSystem: state.sampleParticleSystem,
  });
  return { ...api, state, content };
}

test('content covers the four optogenetic states and the 2026 Nobel primary source', async () => {
  const { ATLAS, MODE_IDS, MODES, SOURCES, RESEARCH_STAGE } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['off', 'channel', 'ions', 'potential']);
  assert.deepEqual(MODES.map(mode => mode.id), MODE_IDS);
  assert.equal(MODES.length, 4);
  for (const mode of MODES) {
    assert.ok(mode.summary.length > 40, mode.id);
    assert.ok(mode.detail.length > 60, mode.id);
    assert.ok(mode.study.length > 30, mode.id);
    assert.equal(mode.flow.length, 3, mode.id);
    assert.equal(mode.status, '研究実装');
  }
  assert.match(JSON.stringify(MODES), /2026年ノーベル医学賞/);
  assert.match(JSON.stringify(MODES), /Karl Deisseroth/);
  assert.match(JSON.stringify(MODES), /Peter Hegemann/);
  assert.match(JSON.stringify(MODES), /Georg Nagel/);
  assert.match(MODES[3].boundary, /治療/);
  assert.match(ATLAS.modelNotice, /教育用の近似/);
  assert.match(RESEARCH_STAGE.status, /研究実装は確立/);
  assert.match(RESEARCH_STAGE.detail, /治療/);
  assert.deepEqual(SOURCES.map(source => source.href), ['https://www.nobelprize.org/prizes/medicine/2026/press-release/']);
});

test('five attributable hotspots separate neuron anatomy from optical hardware', async () => {
  const { HOTSPOTS, MODE_IDS } = await contentPromise;
  assert.deepEqual(Object.keys(HOTSPOTS), ['soma', 'channel', 'fiber', 'axon', 'terminal']);
  for (const [id, node] of Object.entries(HOTSPOTS)) {
    assert.ok(MODE_IDS.includes(node.mode), id);
    assert.ok(node.title && node.english && node.role, id);
    assert.ok(node.description.length > 45, id);
    assert.equal(node.specs.length, 3, id);
    assert.ok(node.specs.every(([term, value]) => term && value), id);
  }
  assert.match(HOTSPOTS.channel.description, /7回膜を貫通/);
  assert.match(HOTSPOTS.fiber.description, /光ファイバー/);
  assert.match(HOTSPOTS.axon.description, /髄鞘/);
});

test('implementation, ongoing research and unsupported concepts are explicitly separated', async () => {
  const { EVIDENCE, SPECS, CHALLENGES } = await contentPromise;
  assert.deepEqual(EVIDENCE.map(entry => entry.kind), ['implementation', 'research', 'concept']);
  assert.ok(EVIDENCE.every(entry => entry.items.length >= 3));
  assert.match(JSON.stringify(EVIDENCE), /視覚回復/);
  assert.match(JSON.stringify(EVIDENCE), /無侵襲/);
  assert.ok(SPECS.length >= 5);
  assert.ok(CHALLENGES.length >= 5);
  assert.ok(CHALLENGES.every(entry => entry.text.length > 30));
});

test('phase, light and speed normalization are finite, bounded and deterministic', async () => {
  const { LIGHT_DEFAULT, SPEEDS, normalizePhase, normalizeLight, normalizeSpeed, advancePhase } = await statePromise;
  assert.equal(LIGHT_DEFAULT, 72);
  assert.deepEqual(SPEEDS, [.5, 1, 2]);
  assert.equal(normalizePhase(-.25), .75);
  assert.equal(normalizePhase(2.25), .25);
  assert.equal(normalizePhase(Infinity), 0);
  assert.equal(normalizePhase('0.5'), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.2, NaN), .2);
  assert.equal(normalizeLight(-20), 0);
  assert.equal(normalizeLight(160), 100);
  assert.equal(normalizeLight(NaN), 72);
  assert.equal(normalizeLight('50'), 72);
  assert.equal(normalizeSpeed(.5), .5);
  assert.equal(normalizeSpeed(3), 1);
  assert.equal(normalizeSpeed('2'), 1);
});

test('mode boundaries and preview poses represent the named biological state', async () => {
  const { MODES } = await contentPromise;
  const { calculateOptogeneticsState, sampleMode, modePreviewPhase } = await statePromise;
  assert.deepEqual([0, .18, .43, .70].map(phase => sampleMode(phase).mode.id), ['off', 'channel', 'ions', 'potential']);
  assert.equal(sampleMode(.999).mode.id, 'potential');
  assert.equal(sampleMode(.18).local, 0);
  assert.equal(sampleMode(.43).local, 0);
  assert.equal(sampleMode(.70).local, 0);
  assert.ok(calculateOptogeneticsState(modePreviewPhase('channel'), 100).channelOpen > .95);
  assert.ok(calculateOptogeneticsState(modePreviewPhase('ions'), 100).ionInflux > .95);
  assert.ok(calculateOptogeneticsState(modePreviewPhase('potential'), 100).actionPotential > .9);
  for (const mode of MODES) assert.ok(modePreviewPhase(mode.id) >= mode.start && modePreviewPhase(mode.id) < mode.end, mode.id);
});

test('zero light suppresses every light-dependent response without changing the selected mode', async () => {
  const { calculateOptogeneticsState } = await statePromise;
  for (const phase of [.3, .55, .85]) {
    const state = calculateOptogeneticsState(phase, 0);
    assert.equal(state.lightActive, false);
    assert.equal(state.channelOpen, 0);
    assert.equal(state.ionInflux, 0);
    assert.equal(state.actionPotential, 0);
    assert.equal(state.firing, false);
    assert.ok(state.membraneDepolarization < .1);
  }
  assert.equal(calculateOptogeneticsState(.85, 0).mode, 'potential');
});

test('the state progresses from closed channel to influx and propagation with bounded signals', async () => {
  const { calculateOptogeneticsState } = await statePromise;
  const off = calculateOptogeneticsState(.05);
  const open = calculateOptogeneticsState(.30);
  const ions = calculateOptogeneticsState(.56);
  const firing = calculateOptogeneticsState(.85);
  assert.equal(off.channelOpen, 0);
  assert.ok(open.channelOpen > off.channelOpen);
  assert.ok(ions.ionInflux > open.ionInflux);
  assert.ok(firing.actionPotential > ions.actionPotential);
  assert.equal(firing.firing, true);
  for (const phase of [0, .1, .2, .35, .5, .65, .8, .95]) {
    const state = calculateOptogeneticsState(phase);
    for (const key of ['intensity', 'channelOpen', 'ionInflux', 'membraneDepolarization', 'actionPotential', 'local', 'phase']) {
      assert.ok(Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1, `${key} at ${phase}`);
    }
    assert.equal(state.educational, true);
  }
  assert.deepEqual(calculateOptogeneticsState(.56, 72), calculateOptogeneticsState(.56, 72));
});

test('particle samplers are pure, bounded and suppress ions when light is off', async () => {
  const { calculateOptogeneticsState, sampleParticleSystem, formatTime } = await statePromise;
  const active = sampleParticleSystem(calculateOptogeneticsState(.56, 80), 2);
  for (const index of [0, 1, 17, 100]) {
    const ion = active.ion(index, 144);
    assert.ok(ion.travel >= 0 && ion.travel < 1);
    assert.ok(ion.lane >= 0 && ion.lane < 12);
    assert.ok(ion.scale >= 0 && ion.scale <= 1);
    assert.deepEqual(ion, active.ion(index, 144));
  }
  const dark = sampleParticleSystem(calculateOptogeneticsState(.56, 0), 2);
  assert.equal(dark.lightPulse(0, 20).scale, 0);
  assert.equal(dark.ion(0, 20).scale, 0);
  assert.equal(dark.potential(0, 20).scale, 0);
  assert.equal(formatTime(.5), '10.0 / 20 s');
  assert.equal(formatTime(Infinity), '0.0 / 20 s');
});

test('HTML exposes four modes, five hotspots, accessible controls and an inline SVG fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'structure-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-detail', 'panel-boundary', 'implementation-list', 'research-list', 'concept-list',
    'selected-node-card', 'node-specs', 'spec-list', 'challenge-list', 'source-list', 'research-status',
    'play-toggle', 'reset-view', 'reset-all', 'zoom-in', 'zoom-out', 'phase-timeline', 'light-intensity',
    'fallback-light', 'fallback-ions', 'fallback-potential', 'announce', 'help-dialog', 'help-close',
  ]) assert.ok(ids.includes(id), id);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="mode-button"/g) || []).length, 4);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.equal((html.match(/class="anatomy-button"/g) || []).length, 5);
  assert.match(html, /<input id="phase-timeline" type="range" min="0" max="1000"/);
  assert.match(html, /<input id="light-intensity" type="range" min="0" max="100"/);
  assert.match(html, /https:\/\/www\.nobelprize\.org\/prizes\/medicine\/2026\/press-release\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /教育用近似/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b|fetch\(|XMLHttpRequest/i);
});

test('CSS is contained, responsive, collapsible and touch accessible', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*360px/s);
  assert.match(css, /height:\s*min\(60dvh,\s*520px\)/);
  assert.match(css, /\.hotspot\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.anatomy-button\s*\{[^}]*min-height:\s*62px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.tool-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.fallback-diagram\[data-mode="potential"\] \.o-potential-particles/);
});

test('Japanese explanations meet the 15px body and 12px supplementary floors', () => {
  const css = read('app.css');
  const bodyFloors = [
    ['.mode-copy > p:not(.eyebrow)', 15],
    ['.mode-details p', 15],
    ['.selected-node-card > p:not(.eyebrow)', 15],
    ['.flow-list', 15],
    ['.help-content p', 15],
    ['.help-content ul', 15],
  ];
  const supplementaryFloors = [
    ['.mode-copy .structure-note', 12], ['.mode-copy .boundary-note', 12],
    ['.research-stage p', 12], ['.evidence ul', 12], ['.selected-node-card > p:not(.eyebrow)', 12],
    ['.node-specs dd', 12], ['.spec-list dd', 12], ['.challenge-list', 12],
    ['.sources p', 12], ['.rail-note', 12], ['.dock-note', 12], ['.slider-control > small', 12],
  ];
  for (const [selector, floor] of [...bodyFloors, ...supplementaryFloors]) assert.ok(fontFloor(css, selector) >= floor, `${selector} font`);
  for (const selector of ['.mode-copy > p:not(.eyebrow)', '.mode-details p', '.research-stage p', '.evidence ul', '.selected-node-card > p:not(.eyebrow)', '.sources p', '.rail-note', '.dock-note', '.help-content p', '.help-content ul']) {
    assert.ok(lineHeightFloor(css, selector) >= 1.8, `${selector} line-height`);
  }
  const muted = css.match(/--muted:\s*(#[a-f\d]{6})/i)[1];
  const dim = css.match(/--dim:\s*(#[a-f\d]{6})/i)[1];
  assert.ok(contrast(muted, '#030810') >= 4.5);
  assert.ok(contrast(dim, '#030810') >= 4.5);
});

test('app and viewer implement playback, reset, visibility and failure-safety contracts', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  const model = read('model.mjs');
  assert.match(app, /const loadStatus = \$\('load-status'\)/);
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /modePreviewPhase\(id\)/);
  assert.match(app, /setPlaying\(false\)/);
  assert.match(app, /resetAll\(\)/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /onContextLost:\s*showFallback/);
  assert.match(app, /prefers-reduced-motion|reduced\.matches/);
  assert.match(app, /\.inert = mobile\.matches && !open/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /const MAX_DPR = \[\.75, 1, 1\.3, 1\.65\]/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /previousNow = undefined/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /resetAnimation\(\)\s*\{\s*clock = 0; previousNow = undefined;/);
  assert.match(viewer, /setPointerCapture/);
  assert.match(viewer, /ArrowLeft/);
  assert.match(viewer, /makeFloor/);
  assert.match(viewer, /makeDust/);
  assert.doesNotMatch(`${app}\n${viewer}`, /\bfetch\s*\(|XMLHttpRequest/);
  assert.match(model, /new THREE\.InstancedMesh/);
  assert.match(model, /new THREE\.MeshPhysicalMaterial/);
  assert.match(model, /new THREE\.MeshStandardMaterial/);
  assert.match(model, /new THREE\.ShaderMaterial/);
  assert.match(model, /new THREE\.LOD/);
  assert.match(model, /sampleParticleSystem\(/);
  assert.doesNotMatch(model, /https?:\/\/|TextureLoader|GLTFLoader/);
});

test('help dialog closes through button, Escape and backdrop while restoring playback', () => {
  const html = read('index.html');
  const app = read('app.mjs');
  assert.match(html, /<button id="help-close" class="icon-button" type="button" aria-label="操作ガイドを閉じる">×<\/button>/);
  assert.match(app, /function closeHelp\(\)\s*\{\s*helpDialog\.close\(\);\s*\}/);
  assert.match(app, /\$\('help-close'\)\.addEventListener\('click', closeHelp\)/);
  assert.match(app, /helpDialog\.addEventListener\('click'/);
  assert.match(app, /event\.target !== helpDialog/);
  assert.match(app, /getBoundingClientRect\(\)/);
  assert.match(app, /if \(outside\) closeHelp\(\)/);
  assert.match(app, /resumeAfterHelp = playing/);
  assert.match(app, /helpDialog\.addEventListener\('close'/);
  assert.match(app, /if \(resumeAfterHelp\) setPlaying\(true\)/);
  assert.doesNotMatch(app, /event\.key === 'Escape'|helpDialog\.addEventListener\('cancel'/);
});

test('runtime model has over 40 meaningful meshes, dense instancing, PBR, shader and LOD', async () => {
  const { createOptogeneticsModel, MODEL_STATS, state } = await runtimeModel();
  const model = createOptogeneticsModel();
  let meshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let lods = 0;
  model.root.traverse(object => {
    if (object.isMesh) meshes++;
    if (object.isInstancedMesh) { instancedMeshes++; instances += object.count; }
    if (object.isLOD) lods++;
  });
  assert.ok(meshes >= 40, `${meshes} meaningful meshes`);
  assert.ok(instancedMeshes >= 5);
  assert.ok(instances >= 500);
  assert.ok(lods >= 1);
  assert.ok(MODEL_STATS.pbrMaterials >= 3);
  assert.ok(MODEL_STATS.shaderMaterials >= 1);
  assert.equal(MODEL_STATS.lodLevels, 2);
  assert.equal(MODEL_STATS.dendrites, 40);
  assert.equal(MODEL_STATS.myelinSegments, 11);
  assert.equal(MODEL_STATS.channelrhodopsin, 18);
  assert.equal(MODEL_STATS.transmembraneHelices, 126);
  for (const mode of ['off', 'channel', 'ions', 'potential']) {
    for (const phase of [0, .2, .4, .6, .8, .95]) {
      assert.doesNotThrow(() => model.update(state.calculateOptogeneticsState(phase, 72), phase * 4, .016), `${mode}/${phase}`);
    }
  }
  for (const quality of [0, 1, 2, 3]) model.setQuality(quality);
  for (const id of Object.keys((await contentPromise).HOTSPOTS)) assert.doesNotThrow(() => model.nodeAnchor(id), id);
  assert.doesNotThrow(() => model.dispose());
});

test('all documented static assets exist without a build step', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) {
    assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  }
});
