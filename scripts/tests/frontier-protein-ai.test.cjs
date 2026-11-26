'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-protein-ai');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-protein-ai/content.mjs');
const statePromise = import('../../その他/frontier-atlas-protein-ai/state.mjs');

class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}

function runtimePdbTools() {
  const source = read('model.mjs')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
  const context = vm.createContext({
    THREE: { Vector3: FakeVector3 },
    HOTSPOT_IDS: ['chain', 'helix', 'sheet', 'diffusion', 'interaction'],
    confidenceRGB: value => [value / 100, .5, .5],
    normalizeSpecimen: value => ['1crn', '1ubq'].includes(value) ? value : '1crn',
    sampleDockingPose: (phase, candidate = 0) => ({ phase, candidate }),
  });
  vm.runInContext(`${source}\nthis.parsePdb = parsePdb; this.buildModelStats = buildModelStats;`, context);
  return context;
}

test('content exposes five ordered modes and separates evidence classes', async () => {
  const { MODE_IDS, MODES, HOTSPOT_IDS, SOURCES, EXHIBIT, SPECIMENS } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['sequence', 'denoise', 'fold', 'docking', 'interaction']);
  assert.deepEqual(MODES.map(mode => mode.id), MODE_IDS);
  assert.deepEqual(HOTSPOT_IDS, ['chain', 'helix', 'sheet', 'diffusion', 'interaction']);
  assert.equal(SPECIMENS.length, 2);
  for (const mode of MODES) {
    assert.ok(mode.observed.length >= 2, mode.id);
    assert.ok(mode.research.length >= 1, mode.id);
    assert.ok(mode.conceptual.length >= 1, mode.id);
    assert.ok(mode.specs.length >= 3, mode.id);
    assert.ok(mode.challenges.length >= 2, mode.id);
    assert.ok(mode.detail.length > 70, mode.id);
  }
  assert.match(MODES[1].detail, /AIによる推論は行っていません/);
  assert.match(MODES[3].detail, /特定の薬剤/);
  assert.match(MODES[4].detail, /結合相手ではない/);
  assert.ok(SOURCES.some(source => source.href === 'https://www.nature.com/articles/s41586-024-07487-w'));
  assert.ok(SOURCES.some(source => source.href === 'https://www.nature.com/articles/d41586-026-00787-3'));
  assert.match(EXHIBIT.modelNotice, /教育用の近似/);
  assert.match(EXHIBIT.modelNotice, /実測pLDDTではありません/);
});

test('state normalization is bounded and marks every result as educational', async () => {
  const { calculateProteinState, normalizePhase, advancePhase, normalizeMode, normalizeRepresentation, normalizeSpecimen } = await statePromise;
  assert.equal(normalizePhase(-.25), .75);
  assert.equal(normalizePhase(2.25), .25);
  assert.equal(normalizePhase(Infinity), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.2, NaN), .2);
  assert.equal(normalizeMode('unknown'), 'sequence');
  assert.equal(normalizeRepresentation('unknown'), 'experimental');
  assert.equal(normalizeSpecimen('unknown'), '1crn');
  assert.deepEqual(calculateProteinState('unknown', NaN, null), calculateProteinState());
  const state = calculateProteinState('fold', .5, { specimen: '1ubq', representation: 'compare', confidence: true });
  assert.equal(state.specimen, '1ubq');
  assert.equal(state.representation, 'compare');
  assert.equal(state.predictionProxy, true);
  assert.equal(state.inferencePerformed, false);
  assert.equal(state.educational, true);
  assert.equal(state.cycleSeconds, 9);
});

test('mode geometry progresses from sequence to interactions without claiming inference', async () => {
  const { calculateProteinState } = await statePromise;
  const sequence = calculateProteinState('sequence', .8);
  const denoise = calculateProteinState('denoise', .8);
  const fold = calculateProteinState('fold', .8);
  const docking = calculateProteinState('docking', .8);
  const interaction = calculateProteinState('interaction', .8);
  assert.equal(sequence.fold, 0);
  assert.ok(denoise.fold > .8 && denoise.noise < .2);
  assert.ok(fold.fold > .8 && fold.noise === 0);
  assert.equal(docking.fold, 1);
  assert.ok(docking.docking > .8);
  assert.equal(interaction.fold, 1);
  assert.ok(interaction.interaction > .8);
  assert.equal(sequence.next, 'denoise');
  assert.equal(interaction.next, 'sequence');
});

test('confidence colors and docking poses are deterministic display-only values', async () => {
  const { confidenceAt, confidenceRGB, confidenceLabel, sampleDockingPose } = await statePromise;
  for (let index = 0; index < 76; index++) {
    const value = confidenceAt(index, 76);
    assert.ok(value >= 0 && value <= 100);
    const rgb = confidenceRGB(value);
    assert.equal(rgb.length, 3);
    assert.ok(rgb.every(channel => channel >= 0 && channel <= 1));
  }
  assert.deepEqual(confidenceRGB(-10), confidenceRGB(0));
  assert.deepEqual(confidenceRGB(120), confidenceRGB(100));
  assert.match(confidenceLabel(95), /とても高い/);
  assert.match(confidenceLabel(55), /やや低い/);
  const early = sampleDockingPose(.1, 0);
  const late = sampleDockingPose(.9, 0);
  assert.ok(late.progress > early.progress);
  assert.ok(Math.hypot(late.x, late.y, late.z) < Math.hypot(early.x, early.y, early.z));
  assert.equal(sampleDockingPose(.3, 99).candidate, 4);
  assert.equal(sampleDockingPose(.3, 99).displayRank, 1);
});

test('local PDB files parse to the documented experimental structures', async () => {
  const tools = runtimePdbTools();
  const crambin = tools.parsePdb(read('data/1crn.pdb'));
  const ubiquitin = tools.parsePdb(read('data/1ubq.pdb'));
  assert.equal(crambin.id, '1crn');
  assert.equal(crambin.residues.length, 46);
  assert.equal(crambin.atoms.length, 327);
  assert.equal(crambin.sequence.length, 46);
  assert.match(crambin.sequence, /^TTCCPSIVAR/);
  assert.equal(crambin.helices.length, 2);
  assert.equal(crambin.sheets.length, 1);
  assert.equal(crambin.sheetStrands.length, 2);
  assert.equal(ubiquitin.id, '1ubq');
  assert.equal(ubiquitin.residues.length, 76);
  assert.equal(ubiquitin.atoms.length, 602);
  assert.match(ubiquitin.sequence, /^MQIFVKTLTG/);
  assert.equal(ubiquitin.helices.length, 2);
  assert.equal(ubiquitin.sheets.length, 1);
  assert.equal(ubiquitin.sheetStrands.length, 5);
  for (const structure of [crambin, ubiquitin]) {
    assert.ok(structure.residues.every(residue => residue.ca));
    assert.ok(structure.atoms.every(atom => [atom.x, atom.y, atom.z].every(Number.isFinite)));
    assert.ok(structure.smoothCA.length === structure.residues.length);
    assert.ok(Math.abs(structure.radius - 3.55) < 1e-9);
  }
  assert.throws(() => tools.parsePdb('not a pdb'), /ATOM records/);
});

test('model stats exceed the meaningful-part and instancing requirements', async () => {
  const tools = runtimePdbTools();
  const structures = [tools.parsePdb(read('data/1crn.pdb')), tools.parsePdb(read('data/1ubq.pdb'))];
  const stats = tools.buildModelStats(structures);
  assert.equal(stats.residues, 122);
  assert.equal(stats.heavyAtoms, 929);
  assert.equal(stats.helices, 4);
  assert.equal(stats.sheets, 2);
  assert.equal(stats.sheetStrands, 7);
  assert.equal(stats.meaningfulParts, 331);
  assert.equal(stats.instancedDetail, 1321);
  assert.equal(stats.instancedMeshes, 25);
  assert.equal(stats.shaderParticles, 320);
  assert.equal(stats.lodObjects, 4);
  assert.ok(stats.meaningfulParts >= 40);
  assert.ok(stats.instancedDetail >= 40);
  assert.ok(stats.pbrMaterials >= 3);
  assert.equal(stats.hotspots, 5);
});

test('HTML exposes five modes, five hotspots, sources and accessible transport controls', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'stage-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-detail', 'observed-list', 'research-list', 'conceptual-list',
    'selected-card', 'spec-list', 'comparison-body', 'source-list', 'confidence-toggle',
    'play-toggle', 'reset-sim', 'reset-view', 'zoom-in', 'zoom-out', 'progress-bar',
    'announce', 'help-dialog', 'help-close', 'model-note',
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
  assert.match(html, /role="progressbar"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="mode-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.equal((html.match(/data-specimen=/g) || []).length, 2);
  assert.equal((html.match(/<button type="button" data-representation=/g) || []).length, 3);
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
    '.selected-card h3', '.control-value', '.check-control', '.evidence h3', '.evidence ul',
    '.selected-evidence p', '.selected-caveat p', '.source-list a', '.sources p', '.sources h3',
    '.legend-list', '.details-block summary', '.help-content p', '.help-content ul', '.help-content h3',
  ]) assertType(selector, 15);

  for (const selector of [
    '.control-note', '.model-notice', '.challenge-list', '.compact-list li', '.boundary-note',
    '.rail-note', '.dock-note', '.transport-status small', '.selected-role', '.source-list small',
    '.look-hint', '.help-content .endorsement-note', '.segmented button', '.hotspot',
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
});

test('viewer, model and app implement density, controls and failure-safety contracts', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  const model = read('model.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /await import\('\.\/model\.mjs'\)/);
  assert.match(app, /fetch\(`\.\/data\/\$\{id\}\.pdb`/);
  assert.match(app, /onContextLost:\s*fallback/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /prefers-reduced-motion|reduced\.matches/);
  assert.match(app, /advancePhase\(phase, elapsed \* rate \/ CYCLE_SECONDS\)/);
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

test('all documented static assets and local PDB files exist', () => {
  for (const file of [
    'index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs',
    'favicon.svg', 'README.md', 'data/1crn.pdb', 'data/1ubq.pdb',
  ]) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
});
