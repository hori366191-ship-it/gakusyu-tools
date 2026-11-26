'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-quantum');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-quantum/content.mjs');
const statePromise = import('../../その他/frontier-atlas-quantum/state.mjs');
const closeTo = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} ≈ ${b}`);

function parseCssRules(css) {
  const rules = [];
  let cursor = 0;
  function findClose(open) {
    let depth = 1;
    for (let index = open + 1; index < css.length; index++) {
      if (css[index] === '{') depth++;
      if (css[index] === '}' && --depth === 0) return index;
    }
    throw new Error('Unbalanced CSS brace');
  }
  function parseRegion(end, contexts = []) {
    while (cursor < end) {
      while (cursor < end && /\s/.test(css[cursor])) cursor++;
      if (cursor >= end) return;
      const open = css.indexOf('{', cursor);
      if (open < 0 || open >= end) return;
      const header = css.slice(cursor, open).trim();
      const close = findClose(open);
      if (header.startsWith('@media') || header.startsWith('@supports')) {
        cursor = open + 1;
        parseRegion(close, [...contexts, header]);
      } else if (!header.startsWith('@')) {
        rules.push({
          selectors: header.split(',').map(selector => selector.trim()),
          body: css.slice(open + 1, close),
          contexts,
        });
      }
      cursor = close + 1;
    }
  }
  parseRegion(css.length);
  return rules;
}

function ruleBodies(css, selector) {
  return parseCssRules(css)
    .filter(rule => rule.selectors.includes(selector))
    .map(rule => rule.body);
}

function numericValues(css, selector, property) {
  const escaped = property.replace(/[.*+?^${}()|[]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}:\\s*(\\d+(?:\\.\\d+)?)px`, 'g');
  return ruleBodies(css, selector).flatMap(body => [...body.matchAll(pattern)].map(match => Number(match[1])));
}

function minFont(css, selector) {
  const values = numericValues(css, selector, 'font-size');
  assert.ok(values.length, `font-size rule exists for ${selector}`);
  return Math.min(...values);
}

function minLine(css, selector) {
  const values = ruleBodies(css, selector).flatMap(body => [...body.matchAll(/line-height:\s*(\d+(?:\.\d+)?)/g)].map(match => Number(match[1])));
  assert.ok(values.length, `line-height rule exists for ${selector}`);
  return Math.min(...values);
}

test('quantum entry has five distinct modes and evidence boundaries', async () => {
  const { ATLAS, ENTRY, MODES, MODE_ORDER, RESEARCH_STATUS, SOURCES } = await contentPromise;
  assert.equal(ENTRY.id, 'superconducting-quantum');
  assert.equal(ATLAS.entryNumber, 3);
  assert.deepEqual(MODE_ORDER, ['superposition', 'error', 'syndrome', 'correction', 'logical']);
  assert.equal(MODES.length, 5);
  for (const mode of MODES) {
    assert.ok(mode.title && mode.summary.length > 40, mode.id);
    assert.ok(mode.study.length > 20, mode.id);
    assert.equal(mode.flow.length, 4, mode.id);
  }
  assert.equal(RESEARCH_STATUS.hardware.status, '実測・実験');
  assert.equal(RESEARCH_STATUS.faultTolerant.status, '研究・構想');
  assert.match(JSON.stringify(MODES), /物理量子ビットと論理量子ビット/);
  assert.match(JSON.stringify(MODES), /RCS/);
  assert.equal(SOURCES[0].href, 'https://blog.google/technology/research/google-willow-quantum-chip/');
});

test('quantum copy distinguishes physical qubits, syndrome measurement and practical use', async () => {
  const { MODES, HOTSPOTS, CHALLENGES, SPECIFICATIONS } = await contentPromise;
  const copy = JSON.stringify({ MODES, HOTSPOTS, CHALLENGES, SPECIFICATIONS });
  assert.match(copy, /105物理量子ビット/);
  assert.match(copy, /データ量子ビットと論理量子ビット/);
  assert.match(copy, /測定量子ビット/);
  assert.match(copy, /商用用途/);
  assert.match(copy, /超伝導/);
  assert.match(copy, /希釈冷凍機/);
  assert.deepEqual(Object.keys(HOTSPOTS), ['chip', 'qubit', 'resonator', 'code', 'cryostat']);
  for (const [id, entry] of Object.entries(HOTSPOTS)) {
    assert.ok(MODES.some(mode => mode.id === entry.mode), id);
    assert.ok(entry.description.length > 35, id);
    assert.equal(entry.specs.length, 3, id);
  }
});

test('quantum model stats exceed the detail, PBR, LOD and hotspot floors', async () => {
  const { MODEL_SPEC, SURFACE_CODE_LAYOUT } = await statePromise;
  assert.ok(MODEL_SPEC.heroPartNames.length >= 40);
  assert.ok(MODEL_SPEC.instancedDetails >= 40);
  assert.ok(MODEL_SPEC.pbrMaterials >= 3);
  assert.equal(MODEL_SPEC.lodLevels, 3);
  assert.equal(MODEL_SPEC.hotspots, 5);
  assert.equal(SURFACE_CODE_LAYOUT.length, 49);
  assert.equal(SURFACE_CODE_LAYOUT.filter(site => site.kind === 'data').length, 25);
  assert.equal(SURFACE_CODE_LAYOUT.filter(site => site.kind === 'measurement').length, 24);
  assert.equal(new Set(MODEL_SPEC.heroPartNames).size, MODEL_SPEC.heroPartNames.length);
  const model = read('model.mjs');
  assert.match(model, /new THREE\.InstancedMesh/);
  assert.match(model, /new THREE\.MeshStandardMaterial/);
  assert.match(model, /new THREE\.MeshPhysicalMaterial/);
  assert.match(model, /new THREE\.ShaderMaterial/);
  assert.match(model, /new THREE\.LOD/);
  assert.match(model, /setQuality\(/);
  assert.match(model, /function anchor\(/);
  assert.match(model, /function dispose\(/);
});

test('quantum state is finite, deterministic, bounded and loops cleanly', async () => {
  const { DURATION, normalizeTime, formatTime, sampleQuantumScene } = await statePromise;
  assert.equal(DURATION, 40);
  assert.equal(normalizeTime(-2), 0);
  assert.equal(normalizeTime(99), 40);
  assert.equal(normalizeTime(NaN), 0);
  assert.equal(normalizeTime('4'), 0);
  assert.equal(formatTime(40), 'T+ 00:40');
  assert.deepEqual(sampleQuantumScene(NaN), sampleQuantumScene(0));
  for (let time = 0; time <= DURATION; time += .5) {
    for (const mode of ['superposition', 'error', 'syndrome', 'correction', 'logical']) {
      const state = sampleQuantumScene(time, mode);
      assert.equal(state.mode, mode);
      assert.equal(state.qubits.length, 49);
      assert.ok([state.bloch.x, state.bloch.y, state.bloch.z, state.bloch.amplitude].every(Number.isFinite));
      assert.ok(Object.values(state.flows).every(value => value >= 0 && value < 1));
      assert.ok(state.qubits.filter(qubit => qubit.error).length <= 1);
      assert.equal(state.syndromeBits.length, 4);
      assert.ok(state.logical.relativeError >= 0 && state.logical.relativeError <= 1);
    }
  }
  for (const key of ['x', 'y', 'z', 'amplitude']) closeTo(sampleQuantumScene(0).bloch[key], sampleQuantumScene(40).bloch[key]);
});

test('syndrome and correction stay consistent with the injected error', async () => {
  const { sampleQuantumScene } = await statePromise;
  const error = sampleQuantumScene(10, 'error');
  const syndrome = sampleQuantumScene(10, 'syndrome');
  const correction = sampleQuantumScene(30, 'correction');
  assert.equal(error.errorIndex, syndrome.errorIndex);
  assert.equal(error.qubits.filter(qubit => qubit.error).length, 1);
  assert.ok(syndrome.syndromeBits.some(Boolean));
  assert.equal(correction.correctionTarget, correction.errorIndex);
  assert.ok(correction.correctionProgress > .5);
  const logical = sampleQuantumScene(20, 'logical');
  assert.equal(logical.logical.physicalSitesShown, 49);
  assert.ok(logical.logical.highlightedSites > 0 && logical.logical.highlightedSites < 49);
});

test('HTML exposes all controls, five hotspots, fallback and exact import map', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['exhibit', 'stage', 'fallback-diagram', 'load-status', 'briefing-rail', 'briefing-toggle', 'info-panel', 'info-toggle', 'mode-title', 'mode-description', 'research-detail-list', 'focus-card', 'reset-view', 'hotspot-layer', 'play-toggle', 'orbit-timeline', 'announce', 'help-dialog', 'help-close', 'model-stats']) assert.ok(ids.includes(id), id);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.equal((html.match(/class="view-button"/g) || []).length, 5);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 5);
  assert.match(html, /<input id="orbit-timeline" type="range" min="0" max="40"/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /https:\/\/blog\.google\/technology\/research\/google-willow-quantum-chip\//);
  assert.doesNotMatch(html, /<img\b|\.glb\b|\.gltf\b/i);
});

test('CSS enforces 15px body copy, 12px supplements, 1.8 line spacing and scrollable panels', () => {
  const css = read('app.css');
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.exhibit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.stage canvas\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.exhibit\[data-panel="closed"\] \.info-panel\s*\{[^}]*transform:/s);
  assert.match(css, /\.exhibit\[data-briefing="closed"\] \.briefing-rail\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  for (const selector of ['.hotspot', '.view-button', '.speed-control button', '.reset-button']) assert.match(ruleBodies(css, selector).join(''), /min-height:\s*44px/);

  const bodySelectors = [
    '.mode-copy > p', '.mode-copy .study-note', '#mode-description', '#mode-study',
    '.research-row p', '.help-content p', '.help-content ul',
  ];
  for (const selector of bodySelectors) {
    assert.ok(minFont(css, selector) >= 15, `${selector} must be at least 15px`);
    assert.ok(minLine(css, selector) >= 1.8, `${selector} must use at least 1.8 line-height`);
  }

  const supplementSelectors = [
    '.focus-card > p:not(.eyebrow)', '.flow-list small', '.pro-con ul', '.fine-print',
    '.sources p', '.sources a', '.rail-note', '.hotspot', '.focus-specs > div',
    '.spec-list dd small', '.comparison-list dd', '.help-content .endorsement-note',
  ];
  for (const selector of supplementSelectors) {
    assert.ok(minFont(css, selector) >= 12, `${selector} must be at least 12px`);
    assert.ok(minLine(css, selector) >= 1.8, `${selector} must use at least 1.8 line-height`);
  }

  const fixedFontSizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
  assert.ok(fixedFontSizes.every(size => size >= 12), 'no fixed text may be smaller than 12px');
  const panelWidths = numericValues(css, '.info-panel', 'width');
  assert.ok(panelWidths.length >= 2, 'desktop and compact panel widths are explicit');
  assert.ok(panelWidths.every(width => width >= 340 && width <= 360), 'panel width stays within 340-360px');
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?height:\s*min\(60dvh,\s*520px\)/);
  assert.match(ruleBodies(css, '.info-content').join(''), /overflow-y:\s*auto/);
  assert.match(css, /data-mode="logical"/);
});

test('app and viewer implement reset, dynamic loading, visibility and failure safety', () => {
  const app = read('app.mjs');
  const viewer = read('viewer.mjs');
  assert.match(app, /await import\('\.\/viewer\.mjs'\)/);
  assert.match(app, /function resetExhibit\(\)/);
  assert.match(app, /time = 0/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /onContextLost:\s*fallback/);
  assert.match(app, /function closeHelpDialog\(\)/);
  assert.match(app, /helpDialog\.close\(\)/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /pointerDistance\(\)/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /model\.dispose\(\)/);
  assert.doesNotMatch(`${app}\n${viewer}`, /\bfetch\s*\(|XMLHttpRequest/);
});

test('all required static files exist', () => {
  for (const file of ['index.html', 'app.css', 'app.mjs', 'content.mjs', 'state.mjs', 'model.mjs', 'viewer.mjs', 'favicon.svg', 'README.md']) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
});
