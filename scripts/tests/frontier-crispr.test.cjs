'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRuntimeModel } = require('./frontier-life-test-helpers.cjs');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-crispr');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-crispr/content.mjs');
const statePromise = import('../../その他/frontier-atlas-crispr/state.mjs');

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
  const api = loadRuntimeModel(appRoot, 'model.mjs', 'createCrisprModel', {
    BASE_PAIRS: content.BASE_PAIRS,
    HOTSPOTS: content.HOTSPOTS,
    MODE_IDS: content.MODE_IDS,
    ORIGINAL_SEQUENCE: content.ORIGINAL_SEQUENCE,
    TARGET_INDEX: content.TARGET_INDEX,
    TAU: state.TAU,
    basePairPoint: state.basePairPoint,
    calculateCrisprState: state.calculateCrisprState,
    sampleParticleSystem: state.sampleParticleSystem,
  });
  return { ...api, state, content };
}

test('content covers four editing stages and distinguishes DSB cutting from base editing', async () => {
  const { ATLAS, MODE_IDS, MODES, MECHANISMS, CYCLE_SECONDS } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['recognition', 'edit', 'repair', 'edited']);
  assert.deepEqual(MODES.map(mode => mode.id), MODE_IDS);
  assert.equal(CYCLE_SECONDS, 24);
  for (const mode of MODES) {
    assert.ok(mode.summary.length > 40, mode.id);
    assert.ok(mode.detail.length > 60, mode.id);
    assert.ok(mode.study.length > 30, mode.id);
    assert.equal(mode.flow.length, 3, mode.id);
  }
  assert.equal(MECHANISMS.cut.doubleStrandBreak, true);
  assert.equal(MECHANISMS.base.doubleStrandBreak, false);
  assert.match(MECHANISMS.cut.description, /二本鎖/);
  assert.match(MECHANISMS.cut.description, /NHEJ/);
  assert.match(MECHANISMS.base.description, /二本鎖切断/);
  assert.match(MECHANISMS.base.description, /A·T→G·C/);
  assert.match(MODES[1].detail, /HNH/);
  assert.match(MODES[1].detail, /RuvC/);
  assert.match(MODES[1].detail, /DSBは作りません/);
  assert.match(ATLAS.modelNotice, /教育用の近似/);
});

test('the 2026 source is correctly identified as prime editing rather than base editing', async () => {
  const { SOURCES, MODES, EVIDENCE } = await contentPromise;
  assert.deepEqual(SOURCES.map(source => source.href), [
    'https://www.nature.com/articles/s41467-025-63609-6',
    'https://www.nature.com/articles/s41587-026-03261-7',
  ]);
  assert.match(SOURCES[0].title, /base editor/);
  assert.match(SOURCES[0].note, /TadA-NW1/);
  assert.match(SOURCES[1].title, /prime editing/);
  assert.match(SOURCES[1].note, /ベース編集の実測論文ではありません/);
  assert.match(MODES[2].study, /プライム編集/);
  assert.match(MODES[2].study, /ベース編集の実測値として扱いません/);
  assert.match(JSON.stringify(EVIDENCE), /bystander/);
  assert.match(JSON.stringify(EVIDENCE), /オフターゲット/);
});

test('five molecular hotspots include guide RNA, Cas9, deaminase and repair', async () => {
  const { HOTSPOTS, MODE_IDS } = await contentPromise;
  assert.deepEqual(Object.keys(HOTSPOTS), ['helix', 'guide', 'cas9', 'deaminase', 'repair']);
  for (const [id, node] of Object.entries(HOTSPOTS)) {
    assert.ok(MODE_IDS.includes(node.mode), id);
    assert.ok(node.title && node.english && node.role, id);
    assert.ok(node.description.length > 45, id);
    assert.equal(node.specs.length, 3, id);
  }
  assert.match(HOTSPOTS.guide.description, /20塩基/);
  assert.match(HOTSPOTS.cas9.description, /HNH/);
  assert.match(HOTSPOTS.deaminase.description, /A → I → G/);
  assert.match(HOTSPOTS.repair.description, /NHEJ/);
});

test('phase, mechanism and speed normalization reject invalid values', async () => {
  const { SPEEDS, normalizePhase, normalizeMechanism, normalizeSpeed, advancePhase } = await statePromise;
  assert.deepEqual(SPEEDS, [.5, 1, 2]);
  assert.equal(normalizePhase(-.2), .8);
  assert.equal(normalizePhase(2.2), .2);
  assert.equal(normalizePhase(NaN), 0);
  assert.equal(normalizePhase('0.5'), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.2, Infinity), .2);
  assert.equal(normalizeMechanism('cut'), 'cut');
  assert.equal(normalizeMechanism('unknown'), 'base');
  assert.equal(normalizeMechanism(null), 'base');
  assert.equal(normalizeSpeed(2), 2);
  assert.equal(normalizeSpeed(4), 1);
  assert.equal(normalizeSpeed('1'), 1);
});

test('stage boundaries and preview poses are finite and mode-accurate', async () => {
  const { MODES } = await contentPromise;
  const { calculateCrisprState, sampleMode, modePreviewPhase } = await statePromise;
  assert.deepEqual([0, .25, .50, .75].map(phase => sampleMode(phase).mode.id), ['recognition', 'edit', 'repair', 'edited']);
  assert.equal(sampleMode(.999).mode.id, 'edited');
  assert.equal(sampleMode(.25).local, 0);
  assert.equal(sampleMode(.50).local, 0);
  assert.equal(sampleMode(.75).local, 0);
  assert.ok(calculateCrisprState(modePreviewPhase('recognition')).recognition > .2);
  assert.ok(calculateCrisprState(modePreviewPhase('edit'), 'cut').cutAmount > .3);
  assert.ok(calculateCrisprState(modePreviewPhase('edit'), 'base').deamination > .1);
  assert.ok(calculateCrisprState(modePreviewPhase('repair')).repairAmount > .6);
  assert.equal(calculateCrisprState(modePreviewPhase('edited')).completed, true);
  for (const mode of MODES) assert.ok(modePreviewPhase(mode.id) >= mode.start && modePreviewPhase(mode.id) < mode.end, mode.id);
});

test('base conversion and complement logic preserve the intended A·T to G·C edit', async () => {
  const { BASE_PAIRS, CUT_SEQUENCE, EDITED_SEQUENCE, ORIGINAL_SEQUENCE, TARGET_INDEX } = await contentPromise;
  const { complementSequence, editSequence, targetPair, calculateCrisprState } = await statePromise;
  assert.equal(BASE_PAIRS, 32);
  assert.equal(TARGET_INDEX, 8);
  assert.equal(ORIGINAL_SEQUENCE.length, 20);
  assert.equal(ORIGINAL_SEQUENCE[TARGET_INDEX], 'A');
  assert.equal(complementSequence(ORIGINAL_SEQUENCE), 'CGATTGCATGCAATCGATCG');
  assert.equal(editSequence(ORIGINAL_SEQUENCE, 'base'), EDITED_SEQUENCE);
  assert.equal(EDITED_SEQUENCE.length, 20);
  assert.equal(EDITED_SEQUENCE[TARGET_INDEX], 'G');
  assert.equal(complementSequence(EDITED_SEQUENCE)[TARGET_INDEX], 'C');
  assert.equal(editSequence(ORIGINAL_SEQUENCE, 'cut'), CUT_SEQUENCE);
  assert.equal(CUT_SEQUENCE.length, 19);
  assert.equal(targetPair(ORIGINAL_SEQUENCE), 'A·T');
  assert.equal(targetPair(EDITED_SEQUENCE), 'G·C');
  assert.equal(calculateCrisprState(.9, 'cut').editedPair, '—（1塩基欠失）');
});

test('cut and base edit states have distinct DSB, chemistry and repair signals', async () => {
  const { calculateCrisprState } = await statePromise;
  const cut = calculateCrisprState(.37, 'cut');
  const base = calculateCrisprState(.37, 'base');
  assert.equal(cut.isCut, true);
  assert.equal(cut.doubleStrandBreak, true);
  assert.ok(cut.cutAmount > .3);
  assert.ok(cut.strandSeparation > 0);
  assert.equal(cut.deamination, 0);
  assert.equal(base.isCut, false);
  assert.equal(base.doubleStrandBreak, false);
  assert.equal(base.cutAmount, 0);
  assert.equal(base.strandSeparation, 0);
  assert.ok(base.deamination > 0);
  assert.equal(base.intermediate, true);
  assert.equal(cut.intermediate, false);
  assert.match(cut.structureLabel, /DSB PATHWAY/);
  assert.match(base.structureLabel, /NO DOUBLE-STRAND BREAK/);
});

test('all stages are bounded, deterministic and loop continuously', async () => {
  const { calculateCrisprState } = await statePromise;
  for (const mechanism of ['cut', 'base']) {
    for (const phase of [0, .1, .2, .3, .45, .6, .8, .95]) {
      const state = calculateCrisprState(phase, mechanism);
      for (const key of ['recognition', 'engagement', 'editAmount', 'repairAmount', 'deamination', 'cutAmount', 'strandSeparation', 'local', 'phase']) {
        assert.ok(Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1, `${mechanism}/${key}/${phase}`);
      }
      assert.equal(state.educational, true);
      assert.deepEqual(state, calculateCrisprState(phase, mechanism));
    }
  }
  const repaired = calculateCrisprState(.62, 'base');
  assert.ok(repaired.repairAmount > 0);
  assert.equal(repaired.completed, false);
  assert.equal(calculateCrisprState(.88, 'base').completed, true);
});

test('repair particle sampling is deterministic and bounded without predicting efficiency', async () => {
  const { calculateCrisprState, sampleParticleSystem, formatTime } = await statePromise;
  const system = sampleParticleSystem(calculateCrisprState(.62, 'base'), 3);
  for (const index of [0, 1, 31, 80]) {
    const particle = system.repair(index, 96);
    assert.ok(particle.travel >= 0 && particle.travel < 1);
    assert.ok(particle.amount > 0 && particle.amount <= 1);
    assert.ok(particle.scale >= 0 && particle.scale <= 1);
    assert.deepEqual(particle, system.repair(index, 96));
  }
  const guide = system.guide(4, 20);
  assert.ok(guide.travel > 0 && guide.travel < 1);
  assert.equal(guide.engagement, 1);
  assert.equal(formatTime(.5), '12.0 / 24 s');
  assert.equal(formatTime(NaN), '0.0 / 24 s');
});

test('DNA helix geometry places the target pair on the recognition axis', async () => {
  const { BASE_PAIRS, TARGET_INDEX } = await contentPromise;
  const { TAU, basePairPoint } = await statePromise;
  assert.equal(BASE_PAIRS, 32);
  const target = basePairPoint(TARGET_INDEX, 0);
  assert.ok(Math.abs(target.x - 1) < 1e-9);
  assert.ok(Math.abs(target.z) < 1e-9);
  assert.equal(target.y, (TARGET_INDEX / (BASE_PAIRS - 1) - .5) * 8.4);
  const complement = basePairPoint(TARGET_INDEX, 1);
  assert.ok(Math.abs(complement.x + 1) < 1e-9);
  for (let index = 0; index < BASE_PAIRS; index++) {
    const a = basePairPoint(index, 0);
    const b = basePairPoint(index, 1);
    assert.ok(Math.abs(a.y - b.y) < 1e-9);
    assert.ok(Math.abs(Math.hypot(a.x, a.z) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(b.x, b.z) - 1) < 1e-9);
  }
  assert.equal(TAU, Math.PI * 2);
});

test('HTML exposes four stages, two mechanisms, five hotspots and an inline SVG fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'structure-label', 'mechanism-title', 'mechanism-description', 'mechanism-change',
    'info-panel', 'info-toggle', 'info-content', 'panel-title', 'panel-summary', 'panel-detail', 'panel-boundary',
    'implementation-list', 'research-list', 'concept-list', 'selected-node-card', 'node-specs', 'spec-list',
    'sequence-original', 'sequence-edited', 'sequence-note', 'challenge-list', 'source-list', 'research-status',
    'play-toggle', 'reset-view', 'reset-all', 'zoom-in', 'zoom-out', 'phase-timeline',
    'fallback-helix', 'fallback-cut', 'fallback-repair', 'announce', 'help-dialog', 'help-close',
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
  assert.equal((html.match(/class="mechanism-button"/g) || []).length, 2);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.equal((html.match(/class="molecule-button"/g) || []).length, 5);
  assert.match(html, /<input id="phase-timeline" type="range" min="0" max="1000"/);
  for (const source of [
    'https://www.nature.com/articles/s41467-025-63609-6',
    'https://www.nature.com/articles/s41587-026-03261-7',
  ]) assert.match(html, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '" target="_blank" rel="noopener noreferrer"'));
  assert.match(html, /DSBなし/);
  assert.match(html, /A·T → G·C/);
  assert.match(html, /プライム編集/);
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
  assert.match(css, /\.mechanism-button\s*\{[^}]*min-height:\s*64px/s);
  assert.match(css, /\.molecule-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.tool-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.fallback-diagram\[data-mechanism="cut"\] \.c-cut/);
  assert.match(css, /\.sequence-bases \.is-edited/);
});

test('Japanese explanations meet the 15px body and 12px supplementary floors', () => {
  const css = read('app.css');
  const bodyFloors = [
    ['.mode-copy > p:not(.eyebrow)', 15], ['.mode-details p', 15],
    ['.selected-node-card > p:not(.eyebrow)', 15], ['.flow-list', 15],
    ['.help-content p', 15], ['.help-content ul', 15],
  ];
  const supplementaryFloors = [
    ['.mode-copy .structure-note', 12], ['.mode-copy .boundary-note', 12],
    ['.sequence-card > p', 12], ['.research-stage p', 12], ['.evidence ul', 12],
    ['.selected-node-card > p:not(.eyebrow)', 12], ['.node-specs dd', 12], ['.spec-list dd', 12],
    ['.challenge-list', 12], ['.sources p', 12], ['.rail-note', 12], ['.mechanism-summary p', 12],
    ['.dock-note', 12], ['.comparison-strip span', 12],
  ];
  for (const [selector, floor] of [...bodyFloors, ...supplementaryFloors]) assert.ok(fontFloor(css, selector) >= floor, `${selector} font`);
  for (const selector of ['.mode-copy > p:not(.eyebrow)', '.mode-details p', '.sequence-card > p', '.research-stage p', '.evidence ul', '.selected-node-card > p:not(.eyebrow)', '.sources p', '.rail-note', '.mechanism-summary p', '.dock-note', '.help-content p', '.help-content ul']) {
    assert.ok(lineHeightFloor(css, selector) >= 1.8, `${selector} line-height`);
  }
  const muted = css.match(/--muted:\s*(#[a-f\d]{6})/i)[1];
  const dim = css.match(/--dim:\s*(#[a-f\d]{6})/i)[1];
  assert.ok(contrast(muted, '#030811') >= 4.5);
  assert.ok(contrast(dim, '#030811') >= 4.5);
});

test('app and viewer implement mechanism switching, reset, visibility and failure safety', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  const model = read('model.mjs');
  assert.match(app, /const loadStatus = \$\('load-status'\)/);
  assert.match(app, /\$\('structure-label'\)\.textContent = currentState\.structureLabel/);
  assert.match(app, /\[\.\.\.hotspotButtons, \.\.\.moleculeButtons\]\)/);
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /modePreviewPhase\(id\)/);
  assert.match(app, /setMechanism\('base', false\)/);
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
  assert.match(model, /updateDNABaseColors\(/);
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

test('runtime model has 40 meshes, 32 base pairs, dense instancing, PBR, shader and LOD', async () => {
  const { createCrisprModel, MODEL_STATS, state, content } = await runtimeModel();
  const model = createCrisprModel();
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
  assert.ok(instances >= 250);
  assert.ok(lods >= 1);
  assert.ok(MODEL_STATS.pbrMaterials >= 3);
  assert.ok(MODEL_STATS.shaderMaterials >= 1);
  assert.equal(MODEL_STATS.lodLevels, 2);
  assert.equal(MODEL_STATS.basePairs, 32);
  assert.equal(MODEL_STATS.baseHalves, 64);
  assert.equal(MODEL_STATS.guideNucleotides, 20);
  for (const mechanism of ['cut', 'base']) {
    for (const phase of [0, .1, .2, .3, .45, .6, .8, .95]) {
      assert.doesNotThrow(() => model.update(state.calculateCrisprState(phase, mechanism), phase * 5, .016), `${mechanism}/${phase}`);
    }
  }
  for (const quality of [0, 1, 2, 3]) model.setQuality(quality);
  for (const id of Object.keys(content.HOTSPOTS)) assert.doesNotThrow(() => model.nodeAnchor(id), id);
  assert.doesNotThrow(() => model.dispose());
});

test('all documented static assets exist without a build step', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) {
    assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  }
});
