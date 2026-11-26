'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../../その他/frontier-atlas-rsi');
const read = name => fs.readFileSync(path.join(appRoot, name), 'utf8');
const contentPromise = import('../../その他/frontier-atlas-rsi/content.mjs');
const statePromise = import('../../その他/frontier-atlas-rsi/loop-state.mjs');

const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

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
  const source = read('rsi-model.mjs')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
  const context = vm.createContext({
    THREE: fakeThree(),
    NODE_IDS: content.NODE_IDS,
    NODES: content.NODES,
    getMode: content.getMode,
    FLOW_DIRECTION: state.FLOW_DIRECTION,
    RADIAL_COLORS: state.RADIAL_COLORS,
    TAU: state.TAU,
    calculateLoopState: state.calculateLoopState,
    loopAngle: state.loopAngle,
    loopPose: state.loopPose,
    sampleRadialParticle: state.sampleRadialParticle,
    tangentAtAngle: state.tangentAtAngle,
  });
  vm.runInContext(`${source}\nthis.model = createRSIModel();`, context);
  return { model: context.model, state };
}

test('content separates current assistance, open-loop structure and unverified RSI', async () => {
  const { EXHIBIT, MODE_IDS, MODES } = await contentPromise;
  assert.deepEqual(MODE_IDS, ['assisted', 'hypothesis']);
  assert.deepEqual(MODES.map(mode => mode.id), MODE_IDS);
  assert.equal(MODES[0].status, '実装されている用途');
  assert.equal(MODES[0].structureLabel, 'HUMAN IN THE LOOP · OPEN LOOP');
  assert.match(MODES[0].structureNote, /人間レビュー/);
  assert.match(MODES[0].lead, /人が目的と承認/);
  assert.equal(MODES[1].status, '未実証の仮説');
  assert.equal(MODES[1].structureLabel, 'CLOSED LOOP / UNVERIFIED');
  assert.match(MODES[1].structureNote, /生成Nから生成N\+1/);
  assert.match(MODES[0].summary, /コード生成/);
  assert.match(MODES[0].summary, /モデル評価/);
  assert.match(MODES[0].boundary, /公開情報/);
  assert.match(MODES[0].boundary, /後継モデル/);
  assert.match(MODES[1].summary, /自己目標設定/);
  assert.match(MODES[1].summary, /知能爆発/);
  assert.match(MODES[1].summary, /断定しません/);
  assert.ok(MODES.every(mode => mode.observed.length >= 3 && mode.unverified.length >= 3));
  assert.match(EXHIBIT.definition, /自らの改善/);
  assert.match(EXHIBIT.modelNotice, /教育用の概念モデル/);
  assert.match(EXHIBIT.endorsementNotice, /承認・推奨/);
});

test('the loop has four attributable components and the required risk topics', async () => {
  const { NODE_IDS, NODES, CHALLENGES, SAFEGUARDS, SOURCE } = await contentPromise;
  assert.deepEqual(NODE_IDS, ['code', 'experiment', 'evaluation', 'model']);
  assert.deepEqual(NODES.map(node => node.id), NODE_IDS);
  assert.deepEqual(NODES.map(node => node.title), ['コード生成', '実験', '評価', 'モデル改善']);
  for (const node of NODES) {
    assert.ok(node.current.length > 40, node.id);
    assert.ok(node.hypothesis.length > 40, node.id);
    assert.ok(node.role && node.english && node.color, node.id);
  }
  assert.deepEqual(CHALLENGES.map(challenge => challenge.title), [
    '評価の信頼性', '目標のずれ', '評価ハック', '内部セキュリティ', '監督の遅れ', 'loss of control',
  ]);
  assert.ok(CHALLENGES.every(challenge => challenge.text.length > 25));
  assert.ok(SAFEGUARDS.length >= 5);
  assert.deepEqual(SOURCE, {
    organization: 'RAND',
    title: 'Recursive Self-Improvement and Automated AI Research and Development',
    year: '2026',
    href: 'https://www.rand.org/pubs/perspectives/PEA5068-1.html',
    citation: 'RAND, Recursive Self-Improvement and Automated AI Research and Development, 2026.',
  });
});

test('control normalization is bounded, deterministic and rejects invalid values', async () => {
  const { CONTROL_DEFAULTS, normalizeControl, normalizeControls, calculateLoopState } = await statePromise;
  assert.deepEqual(CONTROL_DEFAULTS, { automation: 45, evaluation: 70, oversight: 65 });
  assert.equal(normalizeControl('automation', -10), 0);
  assert.equal(normalizeControl('automation', 140), 100);
  assert.equal(normalizeControl('evaluation', NaN), 70);
  assert.equal(normalizeControl('oversight', '80'), 65);
  assert.deepEqual(normalizeControls({ automation: 120, evaluation: -5, oversight: Infinity }), {
    automation: 100, evaluation: 0, oversight: 65,
  });
  assert.deepEqual(normalizeControls(null), CONTROL_DEFAULTS);
  const state = calculateLoopState();
  assert.equal(state.mode, 'assisted');
  assert.equal(state.automation, 45);
  assert.equal(state.evaluation, 70);
  assert.equal(state.evaluationReliability, 70);
  assert.equal(state.oversight, 65);
  assert.equal(state.support, 67.9);
  assert.equal(state.gap, 0);
  assert.equal(state.risk, 8);
  assert.equal(state.nodeId, 'code');
  assert.equal(state.stageId, 'code');
  assert.equal(state.loopType, 'open');
  assert.equal(state.educational, true);
  assert.deepEqual(calculateLoopState('unknown', null, NaN), calculateLoopState());
});

test('automation outpacing evaluation and oversight increases conceptual risk', async () => {
  const { calculateLoopState, getRiskGuidance } = await statePromise;
  const controls = { evaluation: 25, oversight: 20 };
  const risks = [45, 65, 85, 100].map(automation => calculateLoopState('assisted', { ...controls, automation }).risk);
  for (let index = 1; index < risks.length; index++) assert.ok(risks[index] >= risks[index - 1]);
  assert.ok(risks.at(-1) > risks[0] + 30);

  const exposed = calculateLoopState('hypothesis', { automation: 95, evaluation: 15, oversight: 15 });
  const supported = calculateLoopState('hypothesis', { automation: 95, evaluation: 95, oversight: 95 });
  assert.ok(exposed.risk > supported.risk + 40);
  assert.ok(exposed.gap > supported.gap);
  assert.ok(exposed.instability > .9);
  assert.equal(exposed.stability, 0);
  assert.equal(supported.instability, 0);
  assert.match(getRiskGuidance(exposed), /自動化が評価・監督を大きく上回る/);
});

test('hypothesis mode is faster and structurally closed without claiming evidence', async () => {
  const { calculateLoopState } = await statePromise;
  const controls = { automation: 70, evaluation: 80, oversight: 75 };
  const assisted = calculateLoopState('assisted', controls, .2);
  const hypothesis = calculateLoopState('hypothesis', controls, .2);
  assert.ok(hypothesis.loopSpeed > assisted.loopSpeed * 2);
  assert.ok(hypothesis.particleSpeed > assisted.particleSpeed);
  assert.ok(hypothesis.risk > assisted.risk);
  assert.equal(assisted.instability, 0);
  assert.equal(assisted.loopType, 'open');
  assert.equal(assisted.humanGateVisible, true);
  assert.equal(assisted.innerRecursiveRingVisible, false);
  assert.equal(hypothesis.loopType, 'closed');
  assert.equal(hypothesis.humanGateVisible, false);
  assert.equal(hypothesis.innerRecursiveRingVisible, true);
  assert.equal(assisted.structureTarget, 0);
  assert.equal(hypothesis.structureTarget, 1);
  assert.equal(hypothesis.phase, .2);
  assert.equal(hypothesis.modeLabel, '完全自律RSI');
  assert.equal(hypothesis.educational, true);
});

test('loop phase wraps through nodes and the assisted human review stage', async () => {
  const { advanceLoopPhase, loopNodeAt, loopStageAt, normalizePhase } = await statePromise;
  assert.equal(normalizePhase(-.25), .75);
  assert.equal(normalizePhase(2.25), .25);
  assert.equal(normalizePhase(Infinity), 0);
  assert.equal(advanceLoopPhase(.99, .02), .01);
  assert.equal(advanceLoopPhase(.2, Infinity), .2);
  assert.equal(advanceLoopPhase(.2, -1), .2);
  assert.deepEqual([0, .25, .5, .75].map(phase => loopNodeAt(phase)), [0, 1, 2, 3]);
  assert.deepEqual([0, .2, .4, .6, .8].map(phase => loopStageAt(phase, 'assisted').stageId), [
    'code', 'experiment', 'evaluation', 'review', 'model',
  ]);
  const review = loopStageAt(.65, 'assisted');
  assert.equal(review.title, '人間レビュー');
  assert.equal(review.nodeId, 'evaluation');
  assert.equal(loopStageAt(.9, 'assisted').stageId, 'model');
});

test('one flow direction orders nodes, arrow tangents and particle derivatives', async () => {
  const { FLOW_DIRECTION, TAU, loopAngle, loopTangent, tangentAtAngle } = await statePromise;
  const { NODE_IDS } = await contentPromise;
  assert.equal(FLOW_DIRECTION.angleSign, -1);
  assert.deepEqual(FLOW_DIRECTION.order, NODE_IDS);
  assert.deepEqual(NODE_IDS.map((_, index) => loopAngle(index / 4)), [Math.PI, Math.PI / 2, 0, Math.PI * 1.5]);
  for (const phase of [.04, .18, .36, .62, .82]) {
    const epsilon = 1e-5;
    const before = loopAngle(phase - epsilon);
    const after = loopAngle(phase + epsilon);
    const dx = Math.cos(after) - Math.cos(before);
    const dz = Math.sin(after) - Math.sin(before);
    const length = Math.hypot(dx, dz);
    const tangent = loopTangent(phase);
    const dot = (dx / length) * tangent.x + (dz / length) * tangent.z;
    assert.ok(dot > .9999, `particle derivative aligns with arrow tangent at ${phase}`);
    assert.ok(Math.abs(Math.hypot(tangent.x, tangent.z) - 1) < 1e-9);
  }
  const rightTangent = tangentAtAngle(0);
  assert.ok(Math.abs(rightTangent.x) < 1e-9 && rightTangent.z < 0, 'right side flows toward model improvement');
  assert.equal(FLOW_DIRECTION.radiansPerLoop, TAU);
});

test('assisted flow is open with a review gate while hypothesis flow closes recursively', async () => {
  const { calculateLoopState, loopPose } = await statePromise;
  const review = calculateLoopState('assisted', {}, .65);
  assert.equal(review.stageId, 'review');
  assert.equal(review.stageTitle, '人間レビュー');
  assert.equal(review.nextStageId, 'model');
  assert.equal(review.flow.closed, false);
  const stopped = calculateLoopState('assisted', {}, .96);
  assert.equal(stopped.stageId, 'model');
  assert.equal(stopped.nextStageId, null);
  assert.ok(stopped.flow.opacity < .2);
  const closed = calculateLoopState('hypothesis', {}, .9);
  assert.equal(closed.nextStageId, 'code');
  assert.equal(closed.flow.closed, true);
  assert.equal(closed.flow.opacity, 1);
  assert.equal(loopPose(.65, 'assisted').closed, false);
  assert.equal(loopPose(.65, 'hypothesis').closed, true);
});

test('radial particles use distinct outbound and inbound colors', async () => {
  const { RADIAL_COLORS, sampleRadialParticle } = await statePromise;
  assert.deepEqual(RADIAL_COLORS, { outbound: '#72e4ed', inbound: '#c39cff' });
  const outbound = sampleRadialParticle(.25);
  const inbound = sampleRadialParticle(.75);
  assert.equal(outbound.direction, 'outbound');
  assert.ok(Math.abs(outbound.travel - .5) < 1e-9);
  assert.equal(outbound.color, RADIAL_COLORS.outbound);
  assert.equal(inbound.direction, 'inbound');
  assert.ok(Math.abs(inbound.travel - .5) < 1e-9);
  assert.equal(inbound.color, RADIAL_COLORS.inbound);
  const model = read('rsi-model.mjs');
  assert.match(model, /sampleRadialParticle\(life\)/);
  assert.match(model, /radialParticles\.setColorAt/);
});

test('HTML exposes structural modes, unified fallback flow and accessible controls', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
  for (const id of [
    'exhibit', 'space-stage', 'fallback-diagram', 'fallback-title', 'fallback-desc', 'load-status',
    'entry-title', 'structure-label', 'info-panel', 'info-toggle', 'info-content', 'panel-title',
    'panel-summary', 'panel-detail', 'panel-structure-note', 'observed-list', 'unverified-list',
    'selected-node-card', 'risk-card', 'risk-bar', 'gate-label', 'generation-label',
    'fallback-particle', 'fallback-radial-out', 'fallback-radial-in',
    'play-toggle', 'reset-view', 'zoom-in', 'zoom-out', 'automation', 'evaluation', 'oversight',
    'announce', 'help-dialog', 'help-close', 'model-note',
  ]) assert.ok(ids.includes(id), id);
  const importMap = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  assert.ok(importMap);
  assert.deepEqual(JSON.parse(importMap[1]).imports, {
    three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="info-content"/);
  assert.match(html, /aria-label="再帰的自己改善ループの3D模式図/);
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-labelledby="fallback-title fallback-desc"/);
  assert.match(html, /HUMAN IN THE LOOP · OPEN LOOP/);
  assert.match(html, /class="f-loop f-loop-open"/);
  assert.match(html, /class="f-loop f-loop-closed"/);
  assert.match(html, /data-fallback-gate/);
  assert.match(html, /class="f-inner-loop"/);
  assert.match(html, /生成N → 生成N\+1/);
  assert.equal((html.match(/class="mode-button"/g) || []).length, 2);
  assert.equal((html.match(/class="loop-button"/g) || []).length, 4);
  assert.equal((html.match(/class="hotspot"/g) || []).length, 4);
  for (const name of ['automation', 'evaluation', 'oversight']) {
    assert.match(html, new RegExp(`<input id="${name}" type="range" min="0" max="100" step="5"`));
  }
  assert.match(html, /https:\/\/www\.rand\.org\/pubs\/perspectives\/PEA5068-1\.html" target="_blank" rel="noopener noreferrer"/);
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
  assert.match(css, /\.loop-button\s*\{[^}]*min-height:\s*64px/s);
  assert.match(css, /\.speed-control button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.tool-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.slider-control input\[type="range"\]\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /overflow-x:\s*hidden/);
});

test('major Japanese explanations meet minimum type sizes and line heights', () => {
  const css = read('app.css');
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rules = selector => {
    const pattern = new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`, 'g');
    return [...css.matchAll(pattern)].map(match => match[1]);
  };
  const minimums = [
    ['.mode-copy > p:not(.eyebrow)', 15],
    ['.mode-details p', 15],
    ['.evidence ul', 12],
    ['.node-evidence p', 13],
    ['.risk-card > p:not(.model-notice)', 13],
    ['.model-notice', 12],
    ['.challenge-list', 12],
    ['.safeguard-list', 12],
    ['.sources p', 12],
    ['.dock-note', 12],
    ['.slider-control > small', 12],
    ['.help-content p', 15],
  ];
  for (const [selector, minimum] of minimums) {
    const declarations = rules(selector);
    assert.ok(declarations.length > 0, `${selector} has a rule`);
    for (const declaration of declarations) {
      for (const match of declaration.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(match[1]) >= minimum, `${selector} font-size`);
    }
  }
  for (const selector of [
    '.mode-copy > p:not(.eyebrow)', '.evidence ul', '.node-evidence p', '.help-content p',
    '.rail-note', '.transport-status small', '.slider-control > small', '.dock-note', '.sources p',
  ]) {
    assert.ok(rules(selector).some(rule => Number(rule.match(/line-height:\s*([\d.]+)/)?.[1] || 0) >= 1.8), `${selector} line-height`);
  }
});

test('help dialog close controls preserve native Escape and playback restoration', () => {
  const html = read('index.html');
  const app = read('app.mjs');
  assert.match(html, /<button id="help-close" class="icon-button" type="button" aria-label="操作ガイドを閉じる">×<\/button>/);
  assert.match(app, /function closeHelp\(\)\s*\{\s*helpDialog\.close\(\);\s*\}/);
  assert.match(app, /\$\('help-close'\)\.addEventListener\('click', closeHelp\)/);
  assert.match(app, /helpDialog\.addEventListener\('click', event => \{/);
  assert.match(app, /event\.target !== helpDialog/);
  assert.match(app, /helpDialog\.getBoundingClientRect\(\)/);
  assert.match(app, /event\.clientX < bounds\.left/);
  assert.match(app, /event\.clientY > bounds\.bottom/);
  assert.match(app, /if \(outside\) closeHelp\(\)/);
  assert.match(app, /resumeAfterHelp = playing/);
  assert.match(app, /setPlaying\(false\);\s*helpDialog\.showModal\(\)/);
  assert.match(app, /helpDialog\.addEventListener\('close', \(\) => \{[\s\S]*?if \(resumeAfterHelp\) setPlaying\(true\);/);
  assert.doesNotMatch(app, /event\.key === 'Escape'|helpDialog\.addEventListener\('cancel'/);
});

test('viewer, model and app implement mechanical density and failure-safety contracts', () => {
  const app = read('app.mjs');
  const viewer = read('rsi-viewer.mjs');
  const model = read('rsi-model.mjs');
  assert.match(app, /await import\('\.\/rsi-viewer\.mjs'\)/);
  assert.match(app, /currentState\.flow\.angle/);
  assert.match(app, /fallback-radial-out/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /cancelAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /onContextLost:\s*fallback/);
  assert.match(app, /prefers-reduced-motion|reduced\.matches/);
  assert.match(viewer, /new ResizeObserver\(resize\)/);
  assert.match(viewer, /renderer\.setPixelRatio/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /previousNow = undefined/);
  assert.match(viewer, /prefers-reduced-motion/);
  assert.match(viewer, /model\.setQuality/);
  assert.match(viewer, /setPointerCapture/);
  assert.match(viewer, /makeNebula/);
  assert.match(viewer, /makeHoloFloor/);
  assert.match(viewer, /makeComputeModules/);
  assert.match(model, /new THREE\.InstancedMesh/);
  assert.match(model, /MeshPhysicalMaterial/);
  assert.match(model, /TubeGeometry/);
  assert.match(model, /human approval gate/);
  assert.match(model, /inner recursive generation loop/);
  assert.match(model, /makeCodeModule/);
  assert.match(model, /makeExperimentModule/);
  assert.match(model, /makeEvaluationModule/);
  assert.match(model, /makeModelModule/);
  assert.match(model, /loopPose\(/);
  assert.match(model, /lowerArc\.rotateZ\(Math\.PI \* 1\.5\)/);
  assert.match(model, /sampleRadialParticle\(/);
  assert.match(model, /tangentAtAngle\(/);
  assert.doesNotMatch(model, /https?:\/\/|TextureLoader|GLTFLoader/);
});

test('model factories return every helper object accessed during update', () => {
  const model = read('rsi-model.mjs');
  const between = (start, end) => {
    const from = model.indexOf(start);
    const to = model.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `${start} section exists`);
    return model.slice(from, to);
  };
  const returnedKeys = source => {
    const match = source.match(/return\s*\{([^}]+)\};/);
    assert.ok(match, 'factory has an object return');
    return new Set(match[1].split(',').map(entry => entry.trim().split(':')[0]).filter(Boolean));
  };
  const update = between('  function update(state, clock, delta = 0)', '  function nodeAnchor(id)');
  const contracts = [
    ['core', between('function makeCore()', 'function makeParticles(')],
    ['node', between('function makeNode(node, index)', 'function makeLoop()')],
    ['loop', between('function makeLoop()', 'function makeInnerLoop()')],
    ['inner', between('function makeInnerLoop()', 'function makeHumanGate()')],
    ['gate', between('function makeHumanGate()', 'function makeSafetyRing()')],
    ['safety', between('function makeSafetyRing()', 'export function createRSIModel()')],
  ];
  for (const [name, factory] of contracts) {
    const returned = returnedKeys(factory);
    const accessed = [...update.matchAll(new RegExp(`(?<![.\\w])${name}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(match => match[1]);
    assert.ok(accessed.length > 0, `${name} is exercised by update`);
    assert.deepEqual([...new Set(accessed)].filter(key => !returned.has(key)), [], `${name} return contract`);
  }
  assert.ok(returnedKeys(contracts[1][1]).has('cage'), 'node cage is returned for rotation updates');
});

test('runtime model creation and update satisfy component return contracts in both modes', async () => {
  const { model, state } = await runtimeModel();
  assert.equal(model.nodes.length, 4);
  assert.ok(model.nodes.every(node => node.cage && node.body && node.particles !== undefined));
  assert.ok(model.components.inner.group && model.components.gate.group && model.components.loop.arrows);
  model.setQuality(0);
  model.setSelectedNode('experiment');
  model.update(state.calculateLoopState('assisted', { automation: 90, evaluation: 20, oversight: 20 }, .65), 1.2, .016);
  assert.ok(model.structureBlend < .05);
  model.setQuality(3);
  model.update(state.calculateLoopState('hypothesis', { automation: 100, evaluation: 0, oversight: 0 }, .8), 2.4, 1);
  assert.ok(model.structureBlend > .9);
  assert.doesNotThrow(() => model.nodeAnchor('code'));
  assert.doesNotThrow(() => model.gateAnchor());
  assert.doesNotThrow(() => model.innerAnchor());
  model.update(state.calculateLoopState('assisted', {}, .9), 3, 1);
  assert.ok(model.structureBlend < .05);
});

test('all documented static assets exist without a build step', () => {
  for (const file of [
    'index.html', 'app.css', 'app.mjs', 'content.mjs', 'loop-state.mjs',
    'rsi-model.mjs', 'rsi-viewer.mjs', 'favicon.svg', 'README.md',
  ]) assert.ok(fs.statSync(path.join(appRoot, file)).isFile(), file);
});
