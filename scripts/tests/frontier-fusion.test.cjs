'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-fusion');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-fusion/content.mjs');
const statePromise = import('../../その他/frontier-atlas-fusion/state.mjs');

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
        lerp: (a, b, amount) => a + (b - a) * amount,
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
  const source = read('model.mjs')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
  const context = vm.createContext({
    THREE: fakeThree(),
    COMPONENT_IDS: content.COMPONENT_IDS,
    MAJOR_RADIUS: state.MAJOR_RADIUS,
    MINOR_RADIUS: state.MINOR_RADIUS,
    TAU: state.TAU,
    neutronSample: state.neutronSample,
    torusPoint: state.torusPoint,
  });
  vm.runInContext(`${source}\nthis.model = createFusionModel(); this.inventory = MODEL_STATS;`, context);
  return context;
}

test('fusion content separates ITER research, electricity generation and future concepts', async () => {
  const { EXHIBIT, MODE_IDS, MODES, COMPONENT_IDS, COMPONENTS, SOURCES, EVIDENCE_LEVELS } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['heating', 'confinement', 'reaction', 'blanket', 'power']);
  assert.deepEqual(MODES.map(mode => mode.id), MODE_IDS);
  assert.deepEqual(COMPONENT_IDS, ['vessel', 'coils', 'plasma', 'divertor', 'blanket']);
  assert.deepEqual(COMPONENTS.map(component => component.id), COMPONENT_IDS);
  assert.ok(COMPONENTS.every(component => component.text.length > 50));
  assert.equal(MODES.at(-1).status, '構想（DEMO等）');
  assert.match(MODES.at(-1).boundary, /実測発電量は0 MW/);
  assert.match(MODES[2].boundary, /Q=10/);
  assert.match(MODES[2].boundary, /電力量比・発電効率ではありません/);
  assert.match(EXHIBIT.distinction, /プラズマ温度/);
  assert.match(EXHIBIT.distinction, /発電/);
  assert.match(EXHIBIT.modelNotice, /教育用の近似/);
  assert.deepEqual(EVIDENCE_LEVELS.map(level => level.label), ['実測', '研究', '実用化', '構想']);
  assert.deepEqual(SOURCES.map(source => source.href), [
    'https://www.iter.org/project/road-iter',
    'https://www.iter.org/fusion-energy/making-it-work',
  ]);
});

test('fusion state normalizes invalid inputs and keeps ITER grid power at zero', async () => {
  const { CONTROL_DEFAULTS, calculateFusionState, normalizeControls, normalizePhase, advancePhase } = await statePromise;
  assert.deepEqual(CONTROL_DEFAULTS, { heating: 50, density: 65, confinement: 70 });
  assert.deepEqual(normalizeControls({ heating: 140, density: -5, confinement: NaN }), { heating: 100, density: 0, confinement: 70 });
  assert.deepEqual(normalizeControls(null), CONTROL_DEFAULTS);
  assert.equal(normalizePhase(-.25), .75);
  assert.equal(normalizePhase(2.25), .25);
  assert.equal(normalizePhase(Infinity), 0);
  assert.equal(advancePhase(.99, .02), .01);
  assert.equal(advancePhase(.2, Infinity), .2);
  const state = calculateFusionState();
  assert.equal(state.mode, 'heating');
  assert.equal(state.gridPowerMW, 0);
  assert.equal(state.powerConceptual, false);
  assert.equal(state.neutronFraction, .8);
  assert.equal(state.educational, true);
  assert.deepEqual(calculateFusionState('unknown', null, NaN), state);
});

test('temperature and illustrative fusion respond monotonically to the three plasma conditions', async () => {
  const { calculateFusionState } = await statePromise;
  const base = calculateFusionState('reaction');
  for (const name of ['heating', 'density', 'confinement']) {
    const low = calculateFusionState('reaction', { ...CONTROL(name, 20) });
    const high = calculateFusionState('reaction', { ...CONTROL(name, 100) });
    assert.ok(high.plasmaTemperature > low.plasmaTemperature, `${name} temperature`);
    assert.ok(high.reactionIntensity >= low.reactionIntensity, `${name} reaction`);
  }
  assert.ok(base.plasmaTemperature > 0);
  assert.equal(calculateFusionState('power').powerConceptual, true);
  assert.equal(calculateFusionState('power').gridPowerMW, 0);
  assert.ok(calculateFusionState('power').illustrativeGrossElectric > 0);
  assert.equal(calculateFusionState('reaction').illustrativeGrossElectric, 0);
  assert.match((await statePromise).getFusionGuidance(calculateFusionState('power')), /将来構想/);
});

function CONTROL(name, value) {
  return { heating: 50, density: 65, confinement: 70, [name]: value };
}

test('torus coordinates and neutron paths are coherent and bounded', async () => {
  const { MAJOR_RADIUS, MINOR_RADIUS, neutronSample, torusPoint } = await statePromise;
  for (const phase of [0, .13, .5, .92]) {
    const point = torusPoint(phase, .25);
    assert.ok(Math.abs(Math.hypot(point.x, point.z) - (MAJOR_RADIUS + MINOR_RADIUS * Math.cos(.25 * Math.PI * 2))) < 1e-9);
    assert.ok(Math.abs(point.y - MINOR_RADIUS * Math.sin(.25 * Math.PI * 2)) < 1e-9);
  }
  for (const progress of [-1, 0, .5, 1, 2]) {
    const sample = neutronSample(progress, 7);
    assert.ok(sample.opacity >= 0 && sample.opacity <= 1);
    assert.ok(Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z));
  }
});

test('HTML has five modes, five hotspots, accessible controls and a complete static fallback', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'structure-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-boundary', 'distinction-copy', 'temperature-value', 'fusion-value',
    'q-value', 'grid-value', 'selected-component-card', 'spec-list', 'evidence-list',
    'fallback-neutron', 'play-toggle', 'reset-view', 'zoom-in', 'zoom-out', 'heating', 'density',
    'confinement', 'announce', 'help-dialog', 'help-close', 'model-note',
  ]) assert.ok(ids.includes(id), id);
  for (const className of ['description', 'study', 'evidence', 'source-note', 'flow-note']) assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`));
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
  assert.equal((html.match(/class="mode-button"/g) || []).length, 5);
  assert.equal((html.match(/class="component-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.equal((html.match(/data-fallback-component=/g) || []).length, 5);
  assert.match(html, /https:\/\/www\.iter\.org\/project\/road-iter/);
  assert.match(html, /https:\/\/www\.iter\.org\/fusion-energy\/making-it-work/);
  assert.match(html, /ITER実測発電/);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b|fetch\(|XMLHttpRequest/i);
});

test('CSS supports a central stage, right panel, mobile collapse and readable Japanese text', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /\.info-panel\s*\{[^}]*width:\s*360px/s);
  assert.match(css, /height:\s*min\(60dvh,\s*520px\)/);
  assert.match(css, /\.hotspot\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.component-button\s*\{[^}]*min-height:\s*59px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.tool-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.slider-control input\[type="range"\]\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /touch-action:\s*none/);
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

test('model stats exceed the mechanical density requirement and runtime contracts are complete', async () => {
  const { model, inventory } = await runtimeModel();
  assert.ok(inventory.logicalParts >= 40);
  assert.ok(inventory.instancedDetails >= 40);
  assert.ok(inventory.pbrFamilies >= 3);
  assert.ok(inventory.lodLevels >= 2);
  assert.equal(inventory.hotspots, 5);
  assert.equal(model.stats, inventory);
  model.setQuality(0);
  model.setSelected('plasma');
  const state = (await statePromise).calculateFusionState('reaction', {}, .42);
  assert.doesNotThrow(() => model.update(state, 1.2, .016));
  model.setQuality(3);
  model.update((await statePromise).calculateFusionState('power', {}, .8), 2, 1);
  assert.doesNotThrow(() => model.setSelected(null));
  const source = read('model.mjs');
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new THREE\.LOD/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /new THREE\.TubeGeometry/);
  assert.match(source, /conceptual future steam turbine — not ITER/);
});

test('app and viewer implement dynamic CDN fallback, context loss, visibility and input safety', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /onContextLost:\s*fallbackTo2D/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /function resetAll\(\)/);
  assert.match(app, /function fallbackTo2D/);
  assert.match(app, /prefers-reduced-motion|reduced\.matches/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
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
