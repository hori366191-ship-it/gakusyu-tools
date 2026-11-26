'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-perovskite');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-perovskite/content.mjs');
const statePromise = import('../../その他/frontier-atlas-perovskite/state.mjs');

function chainable() {
  const cache = new Map();
  let proxy;
  proxy = new Proxy(function () {}, {
    get(target, key) {
      if (['x', 'y', 'z', 'w'].includes(key)) return 1;
      if (key === Symbol.toPrimitive) return () => 1;
      if (!cache.has(key)) cache.set(key, chainable());
      return cache.get(key);
    },
    set(target, key, value) { cache.set(key, value); return true; },
    apply() { return proxy; },
    construct() { return proxy; },
  });
  return proxy;
}

function fakeThree() {
  return new Proxy({}, {
    get(target, key) {
      if (key === 'MathUtils') return {
        lerp: (a, b, amount) => typeof a === 'number' && typeof b === 'number' ? a + (b - a) * amount : 1,
        clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      };
      if (key === 'DynamicDrawUsage') return 1;
      return chainable();
    },
  });
}

async function runtimeModel() {
  const content = await contentPromise;
  const state = await statePromise;
  const source = read('model.mjs').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '').replace(/^export\s+/gm, '');
  const context = vm.createContext({
    THREE: fakeThree(), COMPONENT_IDS: content.COMPONENT_IDS, BAND_STRUCTURE: state.BAND_STRUCTURE,
    TAU: state.TAU, photonSample: state.photonSample, carrierSample: state.carrierSample,
  });
  vm.runInContext(`${source}\nthis.model = createPerovskiteModel(); this.inventory = MODEL_STATS;`, context);
  return context;
}

test('tandem content separates research cells, modules, commercialization and concepts', async () => {
  const { MODE_IDS, MODES, COMPONENT_IDS, COMPONENTS, SOURCES, EXHIBIT, EVIDENCE_LEVELS } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['absorption', 'separation', 'extraction', 'degradation']);
  assert.deepEqual(COMPONENT_IDS, ['perovskite', 'silicon', 'lattice', 'transport', 'stability']);
  assert.deepEqual(COMPONENTS.map(component => component.id), COMPONENT_IDS);
  assert.ok(MODES.every(mode => mode.summary.length > 70 && mode.boundary.length > 50));
  assert.match(MODES[2].boundary, /研究セルの効率記録/);
  assert.match(MODES[2].boundary, /長期発電量は別/);
  assert.match(MODES[3].boundary, /鉛/);
  assert.match(EXHIBIT.distinction, /モジュール寿命/);
  assert.match(EXHIBIT.distinction, /量産歩留まり/);
  assert.match(EXHIBIT.modelNotice, /教育用の近似/);
  assert.deepEqual(EVIDENCE_LEVELS.map(level => level.label), ['実測', '研究', '実用化', '構想']);
  assert.deepEqual(SOURCES.map(source => source.organization), ['NREL', 'MIT News', 'MIT News', 'Nature Energy']);
  assert.deepEqual(SOURCES.map(source => source.href), [
    'https://nrel.gov/pv/perovskite-solar-cells.html',
    'https://news.mit.edu/2022/perovskites-solar-cells-explained-0715',
    'https://news.mit.edu/2024/study-unlocks-nanoscale-secrets-tuning-perovskites-0228',
    'https://www.nature.com/articles/s41560-024-01470-5',
  ]);
});

test('state normalization and defaults are deterministic and explicitly illustrative', async () => {
  const { CONTROL_DEFAULTS, calculatePerovskiteState, normalizeControls, normalizePhase, advancePhase } = await statePromise;
  assert.deepEqual(CONTROL_DEFAULTS, { photons: 70, interface: 75, encapsulation: 60 });
  assert.deepEqual(normalizeControls({ photons: 120, interface: -10, encapsulation: NaN }), { photons: 100, interface: 0, encapsulation: 60 });
  assert.deepEqual(normalizeControls(null), CONTROL_DEFAULTS);
  assert.equal(normalizePhase(-.25), .75);
  assert.equal(normalizePhase(2.25), .25);
  assert.equal(normalizePhase(Infinity), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.2, Infinity), .2);
  const state = calculatePerovskiteState();
  assert.equal(state.mode, 'absorption');
  assert.equal(state.absorption, .794);
  assert.equal(state.collection, .669);
  assert.equal(state.retainedOutput, .53);
  assert.equal(state.illustrativePce, 16.95);
  assert.equal(state.perovskiteGapEV, 1.68);
  assert.equal(state.siliconGapEV, 1.12);
  assert.equal(state.educational, true);
  assert.deepEqual(calculatePerovskiteState('unknown', null, NaN), state);
});

test('photon flux and interface quality raise collection while encapsulation suppresses illustrative degradation', async () => {
  const { calculatePerovskiteState } = await statePromise;
  const base = calculatePerovskiteState('separation');
  assert.ok(calculatePerovskiteState('separation', { photons: 100 }).collection > base.collection);
  assert.ok(calculatePerovskiteState('separation', { interface: 100 }).collection > base.collection);
  const exposed = calculatePerovskiteState('degradation', { encapsulation: 0 }, .8);
  const protectedState = calculatePerovskiteState('degradation', { encapsulation: 100 }, .8);
  assert.ok(exposed.degradation > protectedState.degradation);
  assert.equal(protectedState.degradation, 0);
  assert.ok(exposed.collection < protectedState.collection);
  assert.ok(calculatePerovskiteState('extraction', { encapsulation: 100 }).retainedOutput > calculatePerovskiteState('extraction', { encapsulation: 0 }).retainedOutput);
  assert.match((await statePromise).getPerovskiteGuidance(exposed), /寿命・時間・実発電量の予測ではありません/);
});

test('photon and carrier paths are bounded and electrons/holes move to opposite transport layers', async () => {
  const { photonSample, carrierSample, BAND_STRUCTURE } = await statePromise;
  for (const progress of [-1, 0, .5, 1, 2]) {
    const photon = photonSample(progress, 4);
    assert.ok(photon.y >= -1.2 && photon.y <= 4.2);
    assert.ok(Math.abs(photon.x) < 2.2 && Math.abs(photon.z) < 1.2);
    assert.ok(photon.wavelength >= 0 && photon.wavelength <= 2);
  }
  assert.ok(carrierSample(1, 'electron').y > carrierSample(0, 'electron').y);
  assert.ok(carrierSample(1, 'hole').y < carrierSample(0, 'hole').y);
  assert.ok(BAND_STRUCTURE.perovskiteGapEV > BAND_STRUCTURE.siliconGapEV);
  assert.ok(Math.abs((BAND_STRUCTURE.perovskiteConductionEV - BAND_STRUCTURE.perovskiteValenceEV) - BAND_STRUCTURE.perovskiteGapEV) < 1e-9);
});

test('HTML has four modes, five hotspots, accessible controls and static sources/fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'structure-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-boundary', 'distinction-copy', 'absorption-value', 'collection-value',
    'pce-value', 'retained-value', 'selected-component-card', 'spec-list', 'evidence-list',
    'fallback-photon', 'play-toggle', 'reset-view', 'zoom-in', 'zoom-out', 'photons',
    'photons-slider-value', 'interface', 'encapsulation', 'announce', 'help-dialog', 'help-close', 'model-note',
  ]) assert.ok(ids.includes(id), id);
  for (const className of ['description', 'study', 'evidence', 'source-note', 'flow-note']) assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`));
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.equal((html.match(/class="mode-button"/g) || []).length, 4);
  assert.equal((html.match(/class="component-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  const fallbackComponents = [...html.matchAll(/data-fallback-component="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(fallbackComponents).size, 5);
  assert.match(html, /https:\/\/nrel\.gov\/pv\/perovskite-solar-cells\.html/);
  assert.match(html, /https:\/\/news\.mit\.edu\/2022\/perovskites-solar-cells-explained-0715/);
  assert.match(html, /https:\/\/news\.mit\.edu\/2024\/study-unlocks-nanoscale-secrets-tuning-perovskites-0228/);
  assert.match(html, /https:\/\/www\.nature\.com\/articles\/s41560-024-01470-5/);
  assert.match(html, /研究セルの記録、モジュールの歩留まり、長期安定性、実発電量は別/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b|fetch\(|XMLHttpRequest/i);
});

test('CSS supports central 3D, collapsible right explanation, touch controls and readable type', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*360px/s);
  assert.match(css, /height:\s*min\(60dvh,\s*520px\)/);
  assert.match(css, /\.hotspot\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.slider-control input\[type="range"\]\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const rules = selector => blocks.filter(([, selectors]) => selectors.split(',').map(value => value.trim()).includes(selector)).map(match => match[2]);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(read('index.html'), /font-size="(?:[0-9]|1[01])"/);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*340px/s);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*min\(360px,\s*calc\(100vw - 20px\)\)/s);
  assert.match(css, /\.info-content\s*\{[^}]*overflow-y:\s*auto/s);
  const major = [
    '.mode-copy > p:not(.eyebrow)', '.mode-copy .focus-note', '.mode-copy .boundary-note',
    '.description', '.metric-guidance', '.selected-component-card p:not(.eyebrow)',
    '.study .spec-list dd', '.study .evidence-list dd', '.source-note', '.sources p',
    '.sources a', '.details-block summary', '.help-content p', '.help-content .endorsement-note',
  ];
  const supporting = [
    '.flow-note', '.challenge-list', '.spec-list dd small', '.sources a small',
    '.metric-grid small', '.metric-grid span', '.dock-note', '.rail-note',
    '.evidence-badge', '.look-hint', '.fallback-diagram figcaption',
  ];
  for (const [selector, minimum] of [...major.map(selector => [selector, 15]), ...supporting.map(selector => [selector, 12])]) {
    const declarations = rules(selector);
    assert.ok(declarations.length, selector);
    for (const rule of declarations) {
      for (const match of rule.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(match[1]) >= minimum, `${selector} font-size ${match[1]}`);
    }
    assert.ok(rules(selector).some(rule => Number(rule.match(/line-height:\s*([\d.]+)/)?.[1] || 0) >= 1.8), `${selector} line-height`);
  }
});

test('model stats, runtime updates, shader, lattice and particle contracts are complete', async () => {
  const { model, inventory } = await runtimeModel();
  assert.ok(inventory.logicalParts >= 40 && inventory.meshObjects >= 30);
  assert.ok(inventory.instancedDetails >= 40);
  assert.ok(inventory.pbrFamilies >= 3);
  assert.equal(inventory.lodLevels, 2);
  assert.equal(inventory.hotspots, 5);
  assert.equal(model.stats, inventory);
  const stateModule = await statePromise;
  model.setQuality(0);
  model.setSelected('lattice');
  assert.doesNotThrow(() => model.update(stateModule.calculatePerovskiteState('separation', {}, .4), 1.2, .016));
  model.setQuality(3);
  model.update(stateModule.calculatePerovskiteState('degradation', { encapsulation: 0 }, .8), 2, 1);
  const source = read('model.mjs');
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new THREE\.LOD/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /27 A \+ 27 B \+ 81 X/);
  assert.match(source, /incoming \$\{/);
  assert.match(source, /photogenerated electrons moving to ETL/);
  assert.match(source, /moisture and interface degradation patches/);
});

test('viewer and app preserve CDN fallback, context loss, visibility and automatic quality', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /onContextLost:\s*fallbackTo2D/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /function resetAll\(\)/);
  assert.match(app, /sliderOutput/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /previousNow = undefined/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /setPointerCapture/);
  assert.match(viewer, /tuneQuality/);
  assert.doesNotMatch(viewer, /TextureLoader|GLTFLoader|fetch\(/);
});

test('all required static files exist', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) {
    assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
  }
});
