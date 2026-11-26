'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-neutrino');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-neutrino/content.mjs');
const statePromise = import('../../その他/frontier-atlas-neutrino/state.mjs');

function declarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(match => match[1]);
}

function resolved(css, value) {
  const variables = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*([^;{}]+)/g)].map(match => [match[1], match[2].trim()]));
  return value.replace(/var\(--([\w-]+)\)/g, (_, name) => variables[name] ?? '');
}
function minimumFont(css, selector) {
  const sizes = declarations(css, selector).flatMap(body => [...resolved(css, body).matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])));
  assert.ok(sizes.length, `${selector} has resolved font sizes`);
  return Math.min(...sizes);
}
function minimumLineHeight(css, selector) {
  const values = declarations(css, selector).flatMap(body => [...resolved(css, body).matchAll(/line-height:\s*([\d.]+)/g)].map(match => Number(match[1])));
  assert.ok(values.length, `${selector} has resolved line heights`);
  return Math.min(...values);
}

test('content exposes all five neutrino stages and separates observation from open questions', async () => {
  const { ATLAS, ENTRY, MODES, MODE_ORDER, HOTSPOTS, RESEARCH_STATUS, SOURCES } = await contentPromise;
  assert.equal(ENTRY.id, 'icecube-neutrino');
  assert.equal(ATLAS.entryNumber, 3);
  assert.equal(ATLAS.catalogCount, 5);
  assert.deepEqual(MODE_ORDER, ['neutrino-pass', 'interaction', 'cherenkov', 'sensors', 'reconstruction']);
  assert.equal(MODES.length, 5);
  for (const mode of MODES) {
    assert.ok(mode.summary.length > 40, mode.id);
    assert.ok(mode.study.length > 25, mode.id);
    assert.equal(mode.flow.length, 4, mode.id);
  }
  assert.equal(HOTSPOTS.surface.specs[0][1], '南極');
  assert.equal(HOTSPOTS.strings.specs[0][1], '5,160個');
  assert.match(HOTSPOTS.cone.description, /教育用/);
  assert.equal(Object.keys(HOTSPOTS).length, 5);
  assert.deepEqual(RESEARCH_STATUS.map(item => item.status), ['観測事実', '未解明', '研究・計画']);
  assert.match(RESEARCH_STATUS[1].detail, /全ての起源/);
  assert.equal(SOURCES[0].href, 'https://www.nobelprize.org/prizes/physics/2026/press-release/');
  assert.ok(SOURCES.some(source => source.href.includes('icecube.wisc.edu')));
});

test('state normalizes input and produces bounded deterministic values for every mode', async () => {
  const { NEUTRINO_DURATION, VERTEX, ENTRY_POINT, normalizeNeutrinoTime, formatNeutrinoTime, sampleNeutrinoState, advanceNeutrinoTime, normalizeMode } = await statePromise;
  assert.equal(NEUTRINO_DURATION, 42);
  assert.equal(normalizeNeutrinoTime(-4), 0);
  assert.equal(normalizeNeutrinoTime(90), 42);
  assert.equal(normalizeNeutrinoTime(Infinity), 0);
  assert.equal(normalizeNeutrinoTime('8'), 0);
  assert.equal(normalizeMode('unknown'), 'neutrino-pass');
  assert.equal(formatNeutrinoTime(42), 'T+ 00:42');
  assert.deepEqual(sampleNeutrinoState(NaN), sampleNeutrinoState(0));
  for (const mode of ['neutrino-pass', 'interaction', 'cherenkov', 'sensors', 'reconstruction']) {
    for (let time = 0; time <= NEUTRINO_DURATION; time += .5) {
      const state = sampleNeutrinoState(time, mode);
      assert.equal(state.mode, mode);
      assert.ok(state.progress >= 0 && state.progress <= 1);
      assert.ok(state.neutrinoPosition.every(Number.isFinite));
      assert.ok(state.lightProgress >= 0 && state.lightProgress < 1);
      assert.ok(state.detectionProgress >= 0 && state.detectionProgress < 1);
      assert.ok(Object.values(state.weights).every(value => value > 0 && Number.isFinite(value)));
    }
  }
  const passStart = sampleNeutrinoState(0, 'neutrino-pass');
  const passEnd = sampleNeutrinoState(42, 'neutrino-pass');
  passStart.neutrinoPosition.forEach((value, index) => assert.ok(Math.abs(value - passEnd.neutrinoPosition[index]) < 1e-9));
  assert.equal(sampleNeutrinoState(0, 'interaction').collisionProgress, 0);
  assert.equal(sampleNeutrinoState(42, 'interaction').collisionProgress, 1);
  assert.deepEqual(sampleNeutrinoState(12, 'cherenkov').vertex, [...VERTEX]);
  assert.ok(ENTRY_POINT.every(Number.isFinite));
  assert.equal(advanceNeutrinoTime(10, -1, 1), 10);
  assert.equal(advanceNeutrinoTime(10, 1, 0), 10);
  assert.ok(advanceNeutrinoTime(41.9, .3, 2) < 42);
});

test('HTML provides the exact import map, five modes, five hotspots and an accessible SVG fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['exhibit', 'space-stage', 'webgl-host', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status', 'view-buttons', 'info-panel', 'info-toggle', 'info-content', 'mode-title', 'mode-description', 'flow-list', 'research-list', 'focus-card', 'hotspot-layer', 'play-toggle', 'orbit-timeline', 'reset-view', 'zoom-in', 'zoom-out', 'help-dialog', 'help-close']) assert.ok(ids.includes(id), id);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="view-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.match(html, /<input id="orbit-timeline" type="range" min="0" max="42"/);
  assert.match(html, /https:\/\/www\.nobelprize\.org\/prizes\/physics\/2026\/press-release\/" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|fetch\(|XMLHttpRequest/i);
});

test('CSS keeps copy readable, controls touch-sized and the mobile explanation collapsible', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*360px/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /height:\s*min\(60dvh,\s*520px\)/);
  for (const selector of ['.hotspot', '.view-button', '.speed-control button', '.reset-button']) assert.match(css, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*min-height:\\s*44px`, 's'), selector);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  for (const [selector, floor] of [['.mode-copy > p:not(.eyebrow)', 15], ['.exhibit-title>p:last-child', 15], ['.mode-copy .study-note', 12], ['.research-row p', 12], ['.focus-card > p:not(.eyebrow)', 12], ['.challenge-list', 12], ['.fine-print', 12], ['.sources p', 12], ['.help-content p', 15], ['.help-content ul', 15]]) assert.ok(minimumFont(css, selector) >= floor, selector);
  for (const selector of ['.mode-copy > p:not(.eyebrow)', '.exhibit-title>p:last-child', '.mode-copy .study-note', '.research-row p', '.focus-card > p:not(.eyebrow)', '.challenge-list', '.fine-print', '.spec-list dd', '.flow-list small', '.sources p', '.help-content p', '.help-content ul']) assert.ok(minimumLineHeight(css, selector) >= 1.8, selector);
  assert.match(css, /--copy-font:\s*15px/);
  assert.match(css, /--copy-leading:\s*1\.8/);
  assert.match(css, /--note-font:\s*12px/);
  assert.match(css, /--note-leading:\s*1\.8/);
  assert.match(css, /\.info-content\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.info-panel\s*\{width:\s*340px/);
  assert.ok([...css.matchAll(/font-size:\s*([\d.]+)px/g)].every(match => Number(match[1]) >= 12));
});

test('app and viewer retain controls and explanations through CDN, visibility and context-loss failures', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /function useFallback/);
  assert.match(app, /onContextLost:\s*useFallback/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /prefers-reduced-motion|reduced\.matches/);
  assert.match(app, /\.inert = collapsedOnMobile/);
  assert.match(app, /event\.code === 'Space'/);
  assert.match(app, /helpDialog\.showModal\(\)/);
  assert.match(app, /helpDialog\.close\(\)/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /previousNow = undefined/);
  assert.match(viewer, /prefers-reduced-motion/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /setPointerCapture/);
  assert.match(viewer, /renderer\.dispose/);
  assert.doesNotMatch(`${app}\n${viewer}`, /\bfetch\s*\(|XMLHttpRequest/);
});

test('model stats and source guarantee a dense instanced detector, PBR, shaders, particles and LOD', async () => {
  const state = await statePromise;
  const source = read('model.mjs').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '').replace(/^export\s+/gm, '');
  const context = vm.createContext({ THREE: { Vector3: class Vector3 {} }, VERTEX: state.VERTEX, SECONDARY_DIRECTION: state.SECONDARY_DIRECTION, ENTRY_POINT: state.ENTRY_POINT, fract: state.fract });
  vm.runInContext(`${source}\nthis.stats = MODEL_STATS;`, context);
  const stats = context.stats;
  assert.ok(stats.meaningfulParts >= 40);
  assert.equal(stats.detectorStrings, 86);
  assert.equal(stats.domInstances, 5160);
  assert.equal(stats.cableTieInstances, 600);
  assert.equal(stats.instancedSystems, 8);
  assert.ok(stats.pbrMaterials >= 3);
  assert.ok(stats.shaderMaterials >= 1);
  assert.ok(stats.photonInstances >= 100 && stats.cascadeInstances >= 20);
  assert.ok(stats.lodLevels >= 2 && stats.qualityLevels >= 3);
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new THREE\.MeshStandardMaterial/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.LOD/);
  assert.match(source, /function setQuality/);
  assert.match(source, /function dispose/);
  assert.doesNotMatch(source, /https?:\/\/|GLTFLoader/);
});

test('all required static files are present', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  assert.match(read('README.md'), /5,160/);
  assert.match(read('README.md'), /教育用近似/);
});
