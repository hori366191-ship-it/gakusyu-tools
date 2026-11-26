'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-mars');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-mars/content.mjs');
const statePromise = import('../../その他/frontier-atlas-mars/state.mjs');

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

test('content exposes six mission modes and separates robotic facts, company concepts and settlement', async () => {
  const { ATLAS, ENTRY, MODES, MODE_ORDER, HOTSPOTS, RESEARCH_STATUS, SOURCES } = await contentPromise;
  assert.equal(ENTRY.id, 'earth-to-mars');
  assert.equal(ATLAS.entryNumber, 5);
  assert.equal(ATLAS.catalogCount, 5);
  assert.deepEqual(MODE_ORDER, ['launch', 'transit', 'entry', 'landing', 'isru', 'settlement']);
  assert.equal(MODES.length, 6);
  for (const mode of MODES) {
    assert.ok(mode.title && mode.summary.length > 45, mode.id);
    assert.ok(mode.study.length > 25, mode.id);
    assert.equal(mode.flow.length, 4, mode.id);
  }
  assert.match(MODES[1].summary, /恒星間航行/);
  assert.match(MODES[4].summary, /MOXIE/);
  assert.match(MODES[4].summary, /実用化されたわけではありません/);
  assert.match(MODES[5].summary, /閉鎖循環/);
  assert.equal(Object.keys(HOTSPOTS).length, 5);
  assert.ok(Object.values(HOTSPOTS).every(item => item.description.length > 35 && item.specs.length === 3));
  assert.deepEqual(RESEARCH_STATUS.map(item => item.status), ['実測・実績', '企業構想・開発', '未実現の構想', '月探査プログラム']);
  assert.match(RESEARCH_STATUS[3].detail, /月と火星の環境は同一ではありません/);
  assert.equal(SOURCES[0].href, 'https://www.spacex.com/humansspaceflight/mars');
  assert.equal(SOURCES[1].href, 'https://www.nasa.gov/humans-in-space/artemis/');
});

test('state is finite and bounded across all six phases with physically legible progress', async () => {
  const { MARS_DURATION, SURFACE_Y, SURFACE_Z, LANDED_SHIP_Y, STARSHIP_SCALE, normalizeMarsTime, formatMarsTime, sampleMarsState, advanceMarsTime, normalizeMode } = await statePromise;
  assert.equal(MARS_DURATION, 48);
  assert.equal(normalizeMarsTime(-1), 0);
  assert.equal(normalizeMarsTime(99), 48);
  assert.equal(normalizeMarsTime(Infinity), 0);
  assert.equal(normalizeMarsTime('3'), 0);
  assert.equal(normalizeMode('invalid'), 'launch');
  assert.equal(formatMarsTime(48), 'T+ 00:48');
  assert.deepEqual(sampleMarsState(NaN), sampleMarsState(0));
  for (const mode of ['launch', 'transit', 'entry', 'landing', 'isru', 'settlement']) {
    for (let time = 0; time <= MARS_DURATION; time += .5) {
      const state = sampleMarsState(time, mode);
      assert.equal(state.mode, mode);
      assert.ok(state.progress >= 0 && state.progress <= 1);
      assert.ok(state.shipPosition.every(Number.isFinite));
      assert.ok(state.boosterPosition.every(Number.isFinite));
      for (const key of ['launchProgress', 'transferProgress', 'entryProgress', 'landingProgress', 'isruProgress', 'settlementProgress', 'altitude', 'velocity', 'boosterThrust', 'shipThrust', 'engineThrust', 'heat', 'plasma', 'dust', 'plantGrowth']) assert.ok(Number.isFinite(state[key]), `${key} at ${time}`);
      for (const key of ['launchProgress', 'transferProgress', 'entryProgress', 'landingProgress', 'isruProgress', 'settlementProgress', 'engineThrust', 'heat', 'plasma', 'dust', 'plantGrowth']) assert.ok(state[key] >= 0 && state[key] <= 1, `${key} range at ${time}`);
      assert.ok(state.resourcePhase >= 0 && state.resourcePhase < 1);
      assert.ok(Object.values(state.weights).every(value => value > 0 && Number.isFinite(value)));
    }
  }
  assert.ok(sampleMarsState(40, 'launch').shipPosition[1] > sampleMarsState(0, 'launch').shipPosition[1]);
  assert.ok(sampleMarsState(48, 'transit').shipPosition[0] > sampleMarsState(0, 'transit').shipPosition[0]);
  assert.ok(sampleMarsState(20, 'entry').heat > 0);
  assert.ok(Math.abs(sampleMarsState(48, 'landing').shipPosition[1] - LANDED_SHIP_Y) < 1e-9);
  assert.ok(LANDED_SHIP_Y > SURFACE_Y && LANDED_SHIP_Y - SURFACE_Y < 2);
  assert.equal(sampleMarsState(48, 'landing').shipPosition[2], SURFACE_Z);
  assert.equal(sampleMarsState(48, 'settlement').shipPosition[2], SURFACE_Z);
  assert.equal(STARSHIP_SCALE, .07);
  assert.ok(sampleMarsState(0, 'launch').boosterThrust > sampleMarsState(48, 'launch').boosterThrust);
  assert.ok(sampleMarsState(48, 'launch').shipThrust > 0);
  assert.equal(sampleMarsState(48, 'settlement').plantGrowth, 1);
  assert.equal(advanceMarsTime(9, -2, 1), 9);
  assert.equal(advanceMarsTime(9, 1, 0), 9);
  assert.ok(advanceMarsTime(47.9, .3, 2) < 48);
});

test('HTML provides six modes, five hotspots, exact import map and accessible fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['exhibit', 'space-stage', 'webgl-host', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'fallback-ship', 'fallback-earth', 'fallback-mars', 'fallback-dust', 'fallback-flame', 'load-status', 'view-buttons', 'info-panel', 'info-toggle', 'info-content', 'mode-title', 'mode-description', 'flow-list', 'research-list', 'focus-card', 'hotspot-layer', 'play-toggle', 'orbit-timeline', 'reset-view', 'help-dialog', 'help-close']) assert.ok(ids.includes(id), id);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="view-button"/g) || []).length, 6);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.match(html, /<input id="orbit-timeline" type="range" min="0" max="48"/);
  assert.match(html, /https:\/\/www\.spacex\.com\/humansspaceflight\/mars" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /https:\/\/www\.nasa\.gov\/humans-in-space\/artemis\/" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|fetch\(|XMLHttpRequest/i);
});

test('CSS remains contained, collapsible, touch accessible and readable', () => {
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
  assert.match(app, /createMarsViewer/);
  assert.match(app, /function useFallback/);
  assert.match(app, /onContextLost:\s*useFallback/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /\.inert = collapsedOnMobile/);
  assert.match(app, /event\.code === 'Space'/);
  assert.match(app, /helpDialog\.showModal\(\)/);
  assert.match(viewer, /createMarsModel/);
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

test('model stats and source guarantee detailed hardware, PBR, shaders, particles and LOD', async () => {
  const state = await statePromise;
  const rawSource = read('model.mjs');
  const source = rawSource.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '').replace(/^export\s+/gm, '');
  const context = vm.createContext({ EARTH_POSITION: state.EARTH_POSITION, MARS_POSITION: state.MARS_POSITION, SURFACE_Y: state.SURFACE_Y, fract: state.fract });
  vm.runInContext(`${source}\nthis.stats = MODEL_STATS;`, context);
  const stats = context.stats;
  assert.ok(stats.meaningfulParts >= 40);
  assert.equal(stats.reusedStarship, true);
  assert.equal(stats.heatTiles, 722);
  assert.equal(stats.boosterEngines, 33);
  assert.equal(stats.shipEngines, 6);
  assert.equal(stats.gridFins, 4);
  assert.equal(stats.flaps, 4);
  assert.equal(stats.separationRings, true);
  assert.equal(stats.terrainRocks, 180);
  assert.equal(stats.plantInstances, 120);
  assert.equal(stats.exhaustParticles, 310);
  assert.equal(stats.instancedSystems, 6);
  assert.ok(stats.pbrMaterials >= 3 && stats.shaderMaterials >= 2);
  assert.ok(stats.dustInstances >= 100 && stats.lodLevels >= 2 && stats.qualityLevels >= 3);
  assert.match(rawSource, /import \{ createStarshipModel \} from '\.\.\/frontier-atlas\/starship-model\.mjs'/);
  assert.match(source, /createStarshipModel\(\)/);
  assert.match(source, /reference\.update\(/);
  assert.match(source, /STARSHIP_SCALE/);
  assert.match(source, /reused high-detail Starship LOD/);
  assert.doesNotMatch(source, /function makeStarship\(|function makeBooster\(/);
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new THREE\.MeshStandardMaterial/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.LOD/);
  assert.match(source, /function setQuality/);
  assert.match(source, /function dispose/);
  assert.doesNotMatch(source, /https?:\/\/|GLTFLoader/);
});

test('all required static files and README exist', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  assert.match(read('README.md'), /722個/);
  assert.match(read('README.md'), /createStarshipModel/);
  assert.match(read('README.md'), /MOXIE/);
  assert.match(read('README.md'), /実現時期/);
});
