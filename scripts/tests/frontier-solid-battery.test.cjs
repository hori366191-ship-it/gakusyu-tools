'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-solid-battery');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-solid-battery/content.mjs');
const statePromise = import('../../その他/frontier-atlas-solid-battery/state.mjs');

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
    THREE: fakeThree(), COMPONENT_IDS: content.COMPONENT_IDS, LAYERS: state.LAYERS, TAU: state.TAU, ionSample: state.ionSample,
  });
  vm.runInContext(`${source}\nthis.model = createSolidBatteryModel(); this.inventory = MODEL_STATS;`, context);
  return context;
}

test('solid battery content distinguishes measured papers, research and product claims', async () => {
  const { MODE_IDS, MODES, COMPONENT_IDS, COMPONENTS, SOURCES, EXHIBIT, EVIDENCE_LEVELS } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['charge', 'migration', 'discharge', 'dendrite']);
  assert.deepEqual(COMPONENT_IDS, ['cathode', 'electrolyte', 'anode', 'collectors', 'dendrite']);
  assert.deepEqual(COMPONENTS.map(component => component.id), COMPONENT_IDS);
  assert.ok(MODES.every(mode => mode.summary.length > 70 && mode.boundary.length > 50));
  assert.match(MODES[3].boundary, /約95%/);
  assert.match(MODES[3].boundary, /普遍保証ではありません/);
  assert.match(EXHIBIT.distinction, /Liイオン/);
  assert.match(EXHIBIT.distinction, /外部回路/);
  assert.match(EXHIBIT.endorsementNotice, /企業発表/);
  assert.deepEqual(EVIDENCE_LEVELS.map(level => level.label), ['実測', '研究', '実用化', '構想']);
  assert.deepEqual(SOURCES.map(source => source.organization), ['Nature Energy', 'Nature Communications', 'Nature Communications']);
  assert.deepEqual(SOURCES.map(source => source.href), [
    'https://www.nature.com/articles/s41560-023-01231-w',
    'https://www.nature.com/articles/s41467-024-45030-7',
    'https://www.nature.com/articles/s41467-022-29531-x',
  ]);
});

test('controls, phase and state normalize deterministically', async () => {
  const { CONTROL_DEFAULTS, calculateSolidBatteryState, normalizeControls, normalizePhase, advancePhase } = await statePromise;
  assert.deepEqual(CONTROL_DEFAULTS, { current: 60, density: 88, interface: 75 });
  assert.deepEqual(normalizeControls({ current: 200, density: -1, interface: '80' }), { current: 100, density: 0, interface: 75 });
  assert.deepEqual(normalizeControls(null), CONTROL_DEFAULTS);
  assert.equal(normalizePhase(-.1), .9);
  assert.equal(normalizePhase(3.2), .2);
  assert.equal(normalizePhase(NaN), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.4, Infinity), .4);
  const state = calculateSolidBatteryState();
  assert.equal(state.currentDensity, 2);
  assert.equal(state.conductivity, .889);
  assert.equal(state.resistance, 26);
  assert.equal(state.risk, 70);
  assert.equal(state.migrationDirection, -1);
  assert.equal(state.electronDirection, -1);
  assert.equal(state.educational, true);
  assert.deepEqual(calculateSolidBatteryState('unknown', null, NaN), state);
});

test('density risk is non-monotonic through the percolating-pore regime and interface/current matter', async () => {
  const { dendriteRiskIndex, calculateSolidBatteryState } = await statePromise;
  const sparse = dendriteRiskIndex(80, 75, 60);
  const nearThreshold = dendriteRiskIndex(94, 75, 60);
  const dense = dendriteRiskIndex(99, 75, 60);
  assert.ok(nearThreshold > sparse, 'faster pore filling as density rises in the teaching regime');
  assert.ok(dense < nearThreshold, 'pore-network closure suppresses this pathway');
  assert.ok(dendriteRiskIndex(90, 20, 60) > dendriteRiskIndex(90, 95, 60));
  assert.ok(dendriteRiskIndex(90, 75, 100) > dendriteRiskIndex(90, 75, 20));
  for (const value of [-20, 0, 50, 100, 140]) assert.ok(dendriteRiskIndex(value) >= 0 && dendriteRiskIndex(value) <= 100);
  const charge = calculateSolidBatteryState('charge', {}, .25);
  const discharge = calculateSolidBatteryState('discharge', {}, .25);
  assert.equal(charge.migrationDirection, -1);
  assert.equal(discharge.migrationDirection, 1);
  assert.equal(charge.electronDirection, -1);
  assert.equal(discharge.electronDirection, 1);
  assert.equal(charge.stateOfCharge, .25);
  assert.equal(discharge.stateOfCharge, .75);
});

test('ion samples remain inside the electrolyte layer and preserve lane structure', async () => {
  const { LAYERS, ionSample } = await statePromise;
  for (const progress of [-1, 0, .5, 1, 2]) {
    for (const lane of [0, 7, 23]) {
      const point = ionSample(progress, lane, lane);
      assert.ok(point.y >= LAYERS.anode - 1e-9 && point.y <= LAYERS.cathode + 1e-9);
      assert.ok(Math.abs(point.x) < 2 && Math.abs(point.z) < 1);
      assert.ok(point.travel >= 0 && point.travel <= 1);
    }
  }
  assert.ok(Math.abs(ionSample(0).y - LAYERS.cathode) < 1e-9);
  assert.ok(Math.abs(ionSample(1).y - LAYERS.anode) < 1e-9);
});

test('HTML exposes four modes, five components, primary sources and static fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'structure-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-boundary', 'distinction-copy', 'current-value', 'current-slider-value',
    'conductivity-value', 'risk-value', 'direction-value', 'selected-component-card', 'spec-list',
    'evidence-list', 'fallback-ion', 'play-toggle', 'reset-view', 'zoom-in', 'zoom-out', 'current',
    'density', 'interface', 'announce', 'help-dialog', 'help-close', 'model-note',
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
  assert.equal((html.match(/data-fallback-component=/g) || []).length, 5);
  assert.match(html, /https:\/\/www\.nature\.com\/articles\/s41560-023-01231-w/);
  assert.match(html, /https:\/\/www\.nature\.com\/articles\/s41467-024-45030-7/);
  assert.match(html, /https:\/\/www\.nature\.com\/articles\/s41467-022-29531-x/);
  assert.match(html, /企業発表は企業発表として/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b|fetch\(|XMLHttpRequest/i);
});

test('CSS is responsive, collapsible, touch accessible and meets type-size minimums', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*360px/s);
  assert.match(css, /height:\s*min\(60dvh,\s*520px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
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

test('model stats and runtime update satisfy density, shader, instancing and comparison contracts', async () => {
  const { model, inventory } = await runtimeModel();
  assert.ok(inventory.logicalParts >= 40 && inventory.meshObjects >= 30);
  assert.ok(inventory.instancedDetails >= 40);
  assert.ok(inventory.pbrFamilies >= 3);
  assert.equal(inventory.lodLevels, 2);
  assert.equal(inventory.hotspots, 5);
  assert.equal(model.stats, inventory);
  const stateModule = await statePromise;
  model.setQuality(0);
  model.setSelected('electrolyte');
  assert.doesNotThrow(() => model.update(stateModule.calculateSolidBatteryState('charge', {}, .4), 1.2, .016));
  model.setQuality(3);
  model.update(stateModule.calculateSolidBatteryState('dendrite', { density: 99, interface: 95, current: 20 }, .8), 2, 1);
  const source = read('model.mjs');
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new THREE\.LOD/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /new THREE\.TubeGeometry/);
  assert.match(source, /28 branch segments/);
  assert.match(source, /24 near-uniform deposits/);
  assert.match(source, /electrons in the external circuit/);
});

test('viewer and app preserve CDN fallback, context-loss recovery and visibility safety', () => {
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
