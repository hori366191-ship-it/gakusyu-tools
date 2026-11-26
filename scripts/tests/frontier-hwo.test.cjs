'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-hwo');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-hwo/content.mjs');
const statePromise = import('../../その他/frontier-atlas-hwo/state.mjs');

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

test('content exposes five HWO modes and keeps the mission at plan/concept stage', async () => {
  const { ATLAS, ENTRY, MODES, MODE_ORDER, HOTSPOTS, RESEARCH_STATUS, SOURCES } = await contentPromise;
  assert.equal(ENTRY.id, 'habitable-worlds-observatory');
  assert.equal(ATLAS.entryNumber, 4);
  assert.equal(ATLAS.catalogCount, 5);
  assert.deepEqual(MODE_ORDER, ['mirror-deploy', 'starlight-suppression', 'direct-imaging', 'spectroscopy', 'biosignature']);
  assert.equal(MODES.length, 5);
  for (const mode of MODES) {
    assert.ok(mode.title && mode.summary.length > 45, mode.id);
    assert.ok(mode.study.length > 25, mode.id);
    assert.equal(mode.flow.length, 4, mode.id);
  }
  assert.match(MODES[0].summary, /確定仕様ではありません/);
  assert.match(MODES[1].summary, /coronagraph/);
  assert.match(MODES[1].summary, /starshade/);
  assert.match(MODES[4].summary, /非生物/);
  assert.equal(Object.keys(HOTSPOTS).length, 5);
  assert.ok(Object.values(HOTSPOTS).every(item => item.description.length > 35 && item.specs.length === 3));
  assert.deepEqual(RESEARCH_STATUS.map(item => item.status), ['実測・研究中', '計画・構想', '未解決']);
  assert.equal(SOURCES[0].href, 'https://science.nasa.gov/astrophysics/programs/habitable-worlds-observatory');
});

test('state is deterministic, bounded and advances deployment, suppression and spectroscopy independently', async () => {
  const { HWO_DURATION, PLANET_POSITION, normalizeHWOTime, formatHWOTime, sampleHWOState, advanceHWOTime, normalizeMode } = await statePromise;
  assert.equal(HWO_DURATION, 45);
  assert.equal(normalizeHWOTime(-2), 0);
  assert.equal(normalizeHWOTime(80), 45);
  assert.equal(normalizeHWOTime(NaN), 0);
  assert.equal(normalizeHWOTime('4'), 0);
  assert.equal(normalizeMode('invalid'), 'mirror-deploy');
  assert.equal(formatHWOTime(45), 'T+ 00:45');
  assert.deepEqual(sampleHWOState(NaN), sampleHWOState(0));
  for (const mode of ['mirror-deploy', 'starlight-suppression', 'direct-imaging', 'spectroscopy', 'biosignature']) {
    for (let time = 0; time <= HWO_DURATION; time += .5) {
      const state = sampleHWOState(time, mode);
      assert.equal(state.mode, mode);
      assert.ok(state.progress >= 0 && state.progress <= 1);
      for (const key of ['mirrorDeployment', 'suppression', 'starshadeDeployment', 'imaging', 'spectrum', 'planetReveal']) assert.ok(state[key] >= 0 && state[key] <= 1 && Number.isFinite(state[key]), `${key} at ${time}`);
      assert.ok(state.photonPhase >= 0 && state.photonPhase < 1);
      assert.deepEqual(state.planetPosition, [...PLANET_POSITION]);
      assert.ok(Object.values(state.weights).every(value => value > 0 && Number.isFinite(value)));
    }
  }
  assert.equal(sampleHWOState(0, 'mirror-deploy').mirrorDeployment, 0);
  assert.equal(sampleHWOState(45, 'mirror-deploy').mirrorDeployment, 1);
  assert.ok(sampleHWOState(20, 'starlight-suppression').suppression > sampleHWOState(5, 'starlight-suppression').suppression);
  assert.ok(sampleHWOState(30, 'biosignature').spectrum > sampleHWOState(30, 'direct-imaging').spectrum);
  assert.equal(advanceHWOTime(8, -1, 2), 8);
  assert.equal(advanceHWOTime(8, 1, 0), 8);
  assert.ok(advanceHWOTime(44.8, .4, 2) < 45);
});

test('HTML exposes the exact import map, five modes, five hotspots and an accessible fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['exhibit', 'space-stage', 'webgl-host', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'fallback-star', 'fallback-shade', 'fallback-planet', 'load-status', 'view-buttons', 'info-panel', 'info-toggle', 'info-content', 'mode-title', 'mode-description', 'flow-list', 'research-list', 'focus-card', 'hotspot-layer', 'play-toggle', 'orbit-timeline', 'reset-view', 'help-dialog', 'help-close']) assert.ok(ids.includes(id), id);
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
  assert.match(html, /<input id="orbit-timeline" type="range" min="0" max="45"/);
  assert.match(html, /https:\/\/science\.nasa\.gov\/astrophysics\/programs\/habitable-worlds-observatory" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|fetch\(|XMLHttpRequest/i);
});

test('CSS keeps the exhibit contained, collapsible, touch accessible and readable', () => {
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

test('app and viewer implement dynamic loading, automatic quality, visibility and failure safety', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /createHWOViewer/);
  assert.match(app, /function useFallback/);
  assert.match(app, /onContextLost:\s*useFallback/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /\.inert = collapsedOnMobile/);
  assert.match(app, /event\.code === 'Space'/);
  assert.match(app, /helpDialog\.showModal\(\)/);
  assert.match(viewer, /createHWOModel/);
  assert.match(viewer, /RoomEnvironment/);
  assert.match(viewer, /scene\.environment = environmentTarget\.texture/);
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

test('model stats and source guarantee segmented optics, PBR, shaders, particles and LOD', async () => {
  const state = await statePromise;
  const source = read('model.mjs').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '').replace(/^export\s+/gm, '');
  const context = vm.createContext({ PLANET_POSITION: state.PLANET_POSITION, fract: state.fract });
  vm.runInContext(`${source}\nthis.stats = MODEL_STATS; this.layout = buildMirrorLayout();`, context);
  const stats = context.stats;
  assert.equal(context.layout.length, 37);
  assert.equal(context.layout.some(point => Math.abs(point.x) < 1e-9 && Math.abs(point.y) < 1e-9), false, 'central hole has no segment');
  assert.equal(new Set(context.layout.map(point => `${point.x},${point.y}`)).size, 37, 'segments do not overlap');
  assert.ok(stats.meaningfulParts >= 40);
  assert.equal(stats.mirrorSegments, 37);
  assert.equal(stats.mirrorRims, 37);
  assert.equal(stats.individualMirrorMaterials, 37);
  assert.equal(stats.actuatorInstances, 111);
  assert.equal(stats.hingeInstances, 74);
  assert.equal(stats.concaveMirror, true);
  assert.equal(stats.centralHole, true);
  assert.equal(stats.secondaryMirror, true);
  assert.equal(stats.supportTrusses, 3);
  assert.equal(stats.starshadePetals, 24);
  assert.equal(stats.sunshieldLayers, 5);
  assert.equal(stats.coronagraphOptics, 8);
  assert.equal(stats.spectrumBars, 32);
  assert.equal(stats.instancedSystems, 5);
  assert.ok(stats.pbrMaterials >= 37 && stats.shaderMaterials >= 1);
  assert.ok(stats.photonInstances >= 100 && stats.lodLevels >= 2 && stats.qualityLevels >= 3);
  assert.match(source, /function makeHexDishGeometry/);
  assert.match(source, /MIRROR_CURVATURE/);
  assert.match(source, /q === 0 && r === 0/);
  assert.match(source, /individualMirrorMaterials/);
  assert.match(source, /fullQuaternion/);
  assert.match(source, /secondary mirror and support trusses/);
  assert.match(source, /central hole and baffle/);
  assert.match(source, /coronagraph optical bench/);
  assert.match(source, /new THREE\.TubeGeometry\(opticalCurve/);
  assert.match(source, /opticalCurve\.getPointAt/);
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new THREE\.MeshStandardMaterial/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.LOD/);
  assert.match(source, /function setQuality/);
  assert.match(source, /function dispose/);
  assert.doesNotMatch(source, /https?:\/\/|GLTFLoader/);
});

test('all required static files and the README exist', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  assert.match(read('README.md'), /37枚/);
  assert.match(read('README.md'), /計画・構想/);
});
