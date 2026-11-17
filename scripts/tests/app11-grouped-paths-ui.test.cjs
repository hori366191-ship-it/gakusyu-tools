/**
 * 有機反応マップ（site/app11）— 反応グループ表示の UI 回帰
 *
 * 実行: node --test scripts/tests/app11-grouped-paths-ui.test.cjs
 *
 * 実データ（data.js / proposed-layout-data.js / academic-data.js）と実 map-core を使い、
 * fake DOM 上で buildReactions / buildProposed / buildAcademic を動かす。ブラウザ起動なし。
 *
 * 固定する内容:
 * - 通常 162 facts → 表示グループ 156、proposed 156、academic 314 → 308。
 * - SVG ラベルは current 75 / proposed 156 / academic 308（グループ代表だけ）。
 * - 透明ヒットは代表のみ（156 / 156 / 308）。索引は元の反応 ID の alias を保つ（162 / 314）。
 * - 非代表 member の選択・キーボード・カメラ・ストロークは代表へ追従する。
 * - グループカードは member ごとの節・式・条件・出典を持ち、各式を個別に拡大できる。
 * - 単独反応のカードは従来どおり。データは 1 バイトも変わらない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const D = require(path.join(APP, 'data.js'));
const P = require(path.join(APP, 'proposed-layout-data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const Core = require(path.join(APP, 'map-core.js'));
const Groups = require(path.join(APP, 'reaction-groups.js'));
const SD = require(path.join(APP, 'structure-draw.js'));
const APP_JS = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');

function extract(name) {
  const m = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(APP_JS);
  assert.ok(m, name + ' の関数定義');
  return m[0];
}

function makeFakeNode(tag) {
  return {
    tagName: tag, attrs: {}, children: [], textContent: '', style: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    insertBefore(child, ref) {
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(child);
      else this.children.splice(i, 0, child);
      child.parent = this;
      return child;
    },
    querySelector(sel) {
      let found = null;
      (function walk(n) {
        if (found) return;
        if (matches(n, sel)) { found = n; return; }
        n.children.forEach(walk);
      })(this);
      return found;
    },
    querySelectorAll(sel) {
      const out = [];
      (function walk(n) {
        if (matches(n, sel)) out.push(n);
        n.children.forEach(walk);
      })(this);
      return out;
    }
  };
}

function matches(node, sel) {
  if (sel === '.rp-reactions') return (node.attrs['class'] || '').split(/\s+/).includes('rp-reactions');
  if (sel === '.rp-reaction__dot') return (node.attrs['class'] || '').split(/\s+/).includes('rp-reaction__dot');
  return false;
}

function countClass(node, cls) {
  let n = 0;
  (function walk(x) {
    if ((x.attrs['class'] || '').split(/\s+/).includes(cls)) n++;
    x.children.forEach(walk);
  })(node);
  return n;
}

function countLabels(node) {
  let n = 0;
  (function walk(x) {
    const cls = x.attrs['class'] || '';
    if (cls.split(/\s+/).includes('rp-reaction__label') && cls.indexOf('--cond') === -1) n++;
    x.children.forEach(walk);
  })(node);
  return n;
}

function projectedCompounds(layout) {
  const map = {};
  D.compounds.forEach((c) => {
    const p = layout.positions[c.id];
    map[c.id] = Object.assign({}, c, { x: p.x, y: p.y });
  });
  return map;
}

function makeConnectors(list, compoundById) {
  const all = [];
  const byId = {};
  list.forEach((r) => {
    const conns = Core.reactionConnectors(r, {
      compoundById: compoundById,
      nodeW: D.meta.nodeW,
      nodeH: D.meta.nodeH
    });
    conns.forEach((c) => { c.rid = r.id; });
    byId[r.id] = conns;
    all.push.apply(all, conns);
  });
  Core.separateSharedPorts(all);
  Core.enforcePaintClearance(all);
  return byId;
}

const GROUPING_SRC = [
  'buildReactionGrouping', 'activeGrouping', 'displayReactionList',
  'displayReactions', 'displayGroupFor', 'displayIdFor', 'groupOfBuilt',
  'labelAnchorName', 'labelPoint', 'reactionLabelNodes', 'reactionLabel',
  'reactionAccessibleLabel', 'arrowHeadAttrs', 'hitPolylines',
  'connectorHitShape', 'hitCandidate'
].map(extract).join('\n');

// ---------------- 通常表示（buildReactions） ----------------

function buildNormal() {
  const viewport = makeFakeNode('g');
  const documentStub = { createElementNS: (ns, tag) => makeFakeNode(tag) };
  const compoundById = {};
  D.compounds.forEach((c) => { compoundById[c.id] = c; });
  const reactionConnectors = makeConnectors(D.reactions, compoundById);
  const src = GROUPING_SRC + '\n' + extract('buildReactions');
  const factory = new Function('D', 'Core', 'Groups', 'document', 'viewport', 'normalMarkerLayer',
    'compoundById', 'reactionConnectors',
    [
      'var mode = "normal", layoutChoice = "current", proposedEnabled = false;',
      'var normalGrouping = null, proposedGrouping = null, academicGrouping = null;',
      'var reactionIndex = {}, edgeIndex = {}, hitCandidates = [];',
      'var ARROW_TIER = { primary: "primary", secondary: "secondary" };',
      'var HIT_SAMPLE_STEP = 2;',
      'var SVG_NS = "http://www.w3.org/2000/svg";',
      'function nodeW(c) { return c.w || D.meta.nodeW; }',
      'function nodeH(c) { return c.h || D.meta.nodeH; }',
      'function el(tag, attrs) { var n = document.createElementNS(SVG_NS, tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }',
      'function errMsg(t) { throw new Error(t); }',
      src,
      'normalGrouping = buildReactionGrouping(D.reactions);',
      'buildReactions();',
      'return { viewport: viewport, marker: normalMarkerLayer, index: reactionIndex,',
      '  edgeIndex: edgeIndex, hits: hitCandidates, grouping: normalGrouping,',
      '  connectors: reactionConnectors };'
    ].join('\n')
  );
  return factory(D, Core, Groups, documentStub, viewport, null, compoundById, reactionConnectors);
}

test('[normal] 162 facts → 156 グループ DOM・75 ラベル・代表ヒットのみ、索引は元 ID を保つ', () => {
  const out = buildNormal();
  assert.equal(out.grouping.groupCount, 156);
  assert.equal(countClass(out.marker, 'rp-reaction'), 156, '反応マーカー DOM は代表だけ');
  assert.equal(countLabels(out.marker), 75, 'current の SVG ラベルは primary 代表 75');
  assert.equal(out.hits.length, 156, '透明ヒットは代表のみ');
  assert.equal(Object.keys(out.index).length, 162, 'reactionIndex は元 ID の alias を保つ');
  assert.equal(Object.keys(out.edgeIndex).length,
    D.reactions.reduce((n, r) => n + r.edges.length, 0), 'edgeIndex は元の edge key を保つ');

  const rep = 'ethanol-oxidation-ethanal';
  const members = out.grouping.groupById[out.grouping.byReactionId[rep]].memberIds;
  assert.deepEqual(members, [
    'ethanol-oxidation-ethanal', 'ethanol-cuo-oxidation', 'ethanol-dichromate-oxidation-ethanal'
  ]);
  members.forEach((id) => {
    assert.equal(out.index[id], out.index[rep], id + ' は代表 DOM を引く');
  });
  assert.equal(out.index[rep].getAttribute('data-id'), rep);
  assert.equal(out.index[rep].getAttribute('tabindex'), '0', 'キーボード対象は代表 DOM');

  // 代表の stroke は「全 162 をまとめて clearance した」計算結果と完全一致する。
  const repPath = out.edgeIndex[rep + '|in|ethanol'] || out.edgeIndex[rep + '|out|ethanal'];
  assert.ok(repPath, '代表の edge key が代表 path を指す');
  const expected = out.connectors[rep][0];
  assert.equal(repPath.getAttribute('d'), Core.routePath(expected.shaft || expected.points, expected.gaps, expected.bridges),
    '代表線は元全件計算時と同一');
  const aliasKey = 'ethanol-cuo-oxidation|in|ethanol';
  if (out.edgeIndex[aliasKey]) assert.equal(out.edgeIndex[aliasKey], repPath, 'member の edge key は代表 path へ alias');
});

// ---------------- 配置案（buildProposed） ----------------

function buildProposed() {
  const viewport = makeFakeNode('g');
  const normalMarkerLayer = makeFakeNode('g');
  normalMarkerLayer.setAttribute('class', 'rp-reactions rp-layout-normal');
  viewport.appendChild(normalMarkerLayer);
  const documentStub = { createElementNS: (ns, tag) => makeFakeNode(tag) };
  const compoundById = projectedCompounds(P);
  const list = D.reactions.map((r) => projectReaction(r, P, 'proposed'));
  const proposedConnectors = makeConnectors(list, compoundById);
  const proposedAll = list;
  const src = GROUPING_SRC + '\n' + extract('buildProposed');
  const factory = new Function('D', 'P', 'Core', 'Groups', 'document', 'viewport', 'normalMarkerLayer',
    'compoundById', 'proposedConnectors', 'proposedAll',
    [
      'var proposed = { positions: P.positions, canvas: P.canvas, normalMarkers: P.markers, normalRoutes: P.routes };',
      'var proposedEnabled = true, proposedBuilt = false, proposedLayer = null;',
      'var proposedGrouping = null, proposedAllEdgeIndex = {}, proposedHitCandidates = [], proposedReactionIndex = {};',
      'var mode = "normal", layoutChoice = "proposed", academicGrouping = null, normalGrouping = null;',
      'var NODE_W = D.meta.nodeW, NODE_H = D.meta.nodeH;',
      'var ARROW_TIER = { primary: "primary", secondary: "secondary" };',
      'var HIT_SAMPLE_STEP = 2;',
      'var SVG_NS = "http://www.w3.org/2000/svg";',
      'function nodeW(c) { return c.w || D.meta.nodeW; }',
      'function nodeH(c) { return c.h || D.meta.nodeH; }',
      'function el(tag, attrs) { var n = document.createElementNS(SVG_NS, tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }',
      'function errMsg(t) { throw new Error(t); }',
      'function projectCompound(c, pos) { return Object.assign({}, c, { x: pos.x, y: pos.y }); }',
      src,
      'proposedGrouping = buildReactionGrouping(proposedAll);',
      'buildProposed();',
      'return { layer: proposedLayer, index: proposedReactionIndex, edgeIndex: proposedAllEdgeIndex,',
      '  hits: proposedHitCandidates, grouping: proposedGrouping };'
    ].join('\n')
  );
  return factory(D, P, Core, Groups, documentStub, viewport, normalMarkerLayer,
    compoundById, proposedConnectors, proposedAll);
}

function projectReaction(r, layout, name) {
  const fn = new Function('r', 'layout', 'layoutName', 'Core',
    extract('projectNormalRoute') + '\n' + extract('projectNormalReaction') +
    '\nreturn projectNormalReaction(r, layout, layoutName);');
  return fn(r, {
    normalMarkers: layout.markers, normalRoutes: layout.routes
  }, name, Core);
}

test('[proposed] 表示 156・ラベル 156・代表ヒット 156、索引とリーダーは代表に残る', () => {
  const out = buildProposed();
  assert.equal(out.grouping.groupCount, 156);
  assert.equal(countClass(out.layer, 'rp-reaction'), 156);
  assert.equal(countLabels(out.layer), 156);
  assert.equal(out.hits.length, 156);
  assert.equal(Object.keys(out.index).length, 162);
  assert.equal(Object.keys(out.edgeIndex).length,
    D.reactions.reduce((n, r) => n + r.edges.length, 0), 'proposed edge key は元のまま');

  // 代表ラベルは既存 label.box/leader をそのまま使う（新規座標を作らない）。
  const rid = 'ethanol-oxidation-ethanal';
  const group = out.grouping.groupById[out.grouping.byReactionId[rid]];
  group.memberIds.forEach((id) => assert.equal(out.index[id], out.index[rid]));
  const g = out.index[rid];
  const label = g.children.find((c) => (c.attrs['class'] || '').indexOf('rp-reaction__label') !== -1 &&
    (c.attrs['class'] || '').indexOf('--cond') === -1);
  assert.ok(label, '代表ラベルがある');
  const m = P.markers[rid];
  assert.equal(Number(label.attrs.x), m.label.type.x);
  assert.equal(Number(label.attrs.y), m.label.type.y);
  const leaders = P.markers[rid].label.leader;
  if (Array.isArray(leaders) && leaders.length > 1) {
    const poly = g.children.find((c) => (c.attrs['class'] || '').indexOf('rp-reaction__leader') !== -1);
    assert.ok(poly, 'leader は代表に残る');
    assert.equal(poly.getAttribute('data-reaction'), rid);
  }
});

// ---------------- アカデミック（buildAcademic） ----------------

function academicReaction(raw) {
  const marker = A.layout.markers[raw.id];
  const edges = [];
  raw.substrates.concat(raw.products).forEach((id) => {
    const dir = raw.substrates.indexOf(id) !== -1 ? 'in' : 'out';
    const route = A.layout.routes[raw.id + '|' + dir + '|' + id];
    if (route) edges.push({ dir: dir, id: id, tier: 'academic', points: route.points, gaps: route.gaps || [], bridges: route.bridges || [] });
  });
  return Object.assign({}, raw, {
    academic: true, tier: 'academic', x: marker.x, y: marker.y, label: marker.label,
    substrates: raw.substrates, products: raw.products, reagents: raw.reagents || [],
    productNote: raw.productNote || '', conditions: raw.conditions || '',
    note: raw.note || '', sources: raw.sources || [], edges: edges
  });
}

function buildAcademic() {
  const viewport = makeFakeNode('g');
  const documentStub = { createElementNS: (ns, tag) => makeFakeNode(tag) };
  const normal = D.reactions.map((r) => projectReaction(r, {
    markers: A.layout.normalMarkers, routes: A.layout.normalRoutes
  }, 'academic'));
  const list = normal.concat(A.reactions.map(academicReaction));
  const compoundById = projectedCompounds(A.layout);
  const academicConnectors = makeConnectors(list, compoundById);
  const src = GROUPING_SRC + '\n' + extract('buildAcademic');
  const factory = new Function('D', 'A', 'Core', 'Groups', 'document', 'viewport',
    'compoundById', 'academicConnectors', 'academicAll',
    [
      'var academicEnabled = true, academicReactions = A.reactions;',
      'var academic = { positions: A.layout.positions };',
      'var academicGrouping = null, academicLayer = null;',
      'var academicAllEdgeIndex = {}, academicHitCandidates = [], academicReactionIndex = {};',
      'var mode = "academic", layoutChoice = "current", normalGrouping = null, proposedGrouping = null;',
      'var NODE_W = D.meta.nodeW, NODE_H = D.meta.nodeH;',
      'var ARROW_TIER = { primary: "primary", secondary: "secondary" };',
      'var HIT_SAMPLE_STEP = 2;',
      'var SVG_NS = "http://www.w3.org/2000/svg";',
      'function nodeW(c) { return c.w || D.meta.nodeW; }',
      'function nodeH(c) { return c.h || D.meta.nodeH; }',
      'function el(tag, attrs) { var n = document.createElementNS(SVG_NS, tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }',
      'function errMsg(t) { throw new Error(t); }',
      'function projectCompound(c, pos) { return Object.assign({}, c, { x: pos.x, y: pos.y }); }',
      src,
      'academicGrouping = buildReactionGrouping(academicAll);',
      'buildAcademic();',
      'return { layer: academicLayer, index: academicReactionIndex, edgeIndex: academicAllEdgeIndex,',
      '  hits: academicHitCandidates, grouping: academicGrouping };'
    ].join('\n')
  );
  return factory(D, A, Core, Groups, documentStub, viewport, compoundById, academicConnectors, list);
}

test('[academic] 314 facts → 308 グループ・308 ラベル・308 ヒット、索引は 314 ID', () => {
  const out = buildAcademic();
  assert.equal(out.grouping.reactionCount, 314);
  assert.equal(out.grouping.groupCount, 308);
  assert.equal(countClass(out.layer, 'rp-reaction'), 308);
  assert.equal(countLabels(out.layer), 308);
  assert.equal(out.hits.length, 308);
  assert.equal(Object.keys(out.index).length, 314);

  const rep = 'ethanol-oxidation-ethanal';
  const group = out.grouping.groupById[out.grouping.byReactionId[rep]];
  group.memberIds.forEach((id) => assert.equal(out.index[id], out.index[rep]));
  assert.equal(out.index[rep].getAttribute('data-id'), rep);

  // 通常・アカデミックで同じ複数グループは同じ代表 ID（canonical 順が同じ）。
  const normal = Groups.build(D.reactions);
  normal.groups.filter((g) => g.size > 1).forEach((ng) => {
    const ag = out.grouping.groupById[out.grouping.byReactionId[ng.memberIds[0]]];
    assert.equal(ag.representativeId, ng.representativeId, ng.memberIds[0] + ' の代表はモードで変わらない');
  });
});

test('[grouping] 逆向き・部分一致・片側空はグループにしない', () => {
  const mk = (id, subs, prods) => ({ id: id, substrates: subs, products: prods, typeLabel: '酸化' });
  const built = Groups.build([
    mk('fwd', ['a'], ['b']),
    mk('rev', ['b'], ['a']),
    mk('multi', ['a', 'c'], ['d']),
    mk('partial', ['a'], ['d']),
    mk('empty-out', ['a'], []),
    mk('empty-in', [], ['b'])
  ]);
  const ids = (id) => built.groupById[built.byReactionId[id]].memberIds;
  assert.deepEqual(ids('fwd'), ['fwd']);
  assert.deepEqual(ids('rev'), ['rev']);
  assert.deepEqual(ids('multi'), ['multi']);
  assert.deepEqual(ids('partial'), ['partial']);
  assert.deepEqual(ids('empty-out'), ['empty-out']);
  assert.deepEqual(ids('empty-in'), ['empty-in']);
  assert.equal(built.groupCount, 6);
});

// ---------------- 選択・キーボード・カメラ ----------------

function buildInteraction() {
  const viewport = makeFakeNode('g');
  const documentStub = { createElementNS: (ns, tag) => makeFakeNode(tag) };
  const compoundById = {};
  D.compounds.forEach((c) => { compoundById[c.id] = c; });
  const reactionConnectors = makeConnectors(D.reactions, compoundById);
  const grouping = Groups.build(D.reactions);
  const byId = {};
  D.reactions.forEach((r) => { byId[r.id] = r; });
  const calls = { animate: [], select: [], card: [] };
  const src = GROUPING_SRC + '\n' + extract('showReactionStroke') + '\n' +
    extract('ensureActiveLayer') + '\n' + extract('focusAfterLayoutSwitch') + '\n' +
    extract('gotoEntity');
  const factory = new Function('D', 'Core', 'Groups', 'document', 'viewport',
    'compoundById', 'reactionConnectors', 'grouping', 'byId', 'calls',
    [
      'var mode = "normal", layoutChoice = "current", proposedEnabled = false;',
      'var normalGrouping = grouping, proposedGrouping = null, academicGrouping = null;',
      'var activeEdgeLayer = null, view = { scale: 1, x: 0, y: 0 };',
      'var viewSize = { w: 1200, h: 900 }, returnFocus = null;',
      'function nodeW(c) { return c.w || D.meta.nodeW; }',
      'function nodeH(c) { return c.h || D.meta.nodeH; }',
      'function el(tag, attrs) { var n = document.createElementNS("http://www.w3.org/2000/svg", tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }',
      'function errMsg(t) { throw new Error(t); }',
      'function findReaction(id) { return byId[id] || null; }',
      'function compoundAt(id) { return compoundById[id] || null; }',
      'function activeConnectors() { return reactionConnectors; }',
      'function fitTopInset() { return 0; }',
      'function entityTarget(t, s, sc) { return { x: t.x, y: t.y, scale: sc }; }',
      'function fitModeCanvasView() { return { fit: true }; }',
      'function animateTo(t) { calls.animate.push(t); }',
      'function prefersReduce() { return true; }',
      'function selectNode(k, i) { calls.select.push([k, i]); }',
      'function openCard(k, i) { calls.card.push([k, i]); }',
      'var mapEl = { scrollIntoView: function () {} };',
      src,
      'return { showReactionStroke: showReactionStroke, focusAfterLayoutSwitch: focusAfterLayoutSwitch,',
      '  gotoEntity: gotoEntity, layer: function () { return activeEdgeLayer; },',
      '  displayId: displayIdFor, grouping: grouping, index: grouping, calls: calls };'
    ].join('\n')
  );
  return factory(D, Core, Groups, documentStub, viewport, compoundById, reactionConnectors, grouping, byId, calls);
}

test('[select] 非代表 member でも代表 stroke・代表座標・元 ID の選択を保つ', () => {
  const h = buildInteraction();
  const member = 'ethanol-cuo-oxidation';
  const rep = 'ethanol-oxidation-ethanal';
  assert.equal(h.displayId(member), rep, 'member → 代表 ID');
  assert.equal(h.displayId('methane-chlorination'), 'methane-chlorination', '単独は元 ID');

  h.showReactionStroke(member);
  const paths = h.layer().children.filter((c) => (c.attrs['class'] || '').indexOf('rp-edge-active') !== -1);
  assert.ok(paths.length > 0, '代表ストロークを描く');
  paths.forEach((p) => assert.equal(p.getAttribute('data-reaction'), rep, '代表 ID の stroke'));

  h.calls.animate.length = 0;
  h.focusAfterLayoutSwitch({ kind: 'reaction', id: member });
  assert.equal(h.calls.animate[0].x, D.reactions.find((r) => r.id === rep).x, 'カメラは代表座標');
  assert.equal(h.calls.animate[0].y, D.reactions.find((r) => r.id === rep).y);

  h.calls.select.length = 0;
  h.calls.card.length = 0;
  h.gotoEntity('reaction', member, null);
  assert.deepEqual(h.calls.select[0], ['reaction', member], '選択は元 member ID のまま');
  assert.deepEqual(h.calls.card[0], ['reaction', member], 'カードは元 member ID から開く');
  assert.equal(h.calls.animate[h.calls.animate.length - 1].x,
    D.reactions.find((r) => r.id === rep).x, 'gotoEntity のカメラも代表座標');
});

// ---------------- グループカード ----------------

const CARD_SRC = [
  'esc', 'stateBadge', 'reactionStateBadge', 'reactionEvidenceNote', 'reactionEducationLabel',
  'byTypeThenId', 'typeCommon', 'reactionMemberHeading', 'reactionMemberMeta',
  'reactionCard', 'reactionCardOne', 'reactionCardGroup',
  'compoundName', 'compoundInline', 'regionSpan',
  'reactionEquationFigure', 'reactionEquationPlan', 'equationFigureBlock', 'equationFigureMarkup',
  'buildCardEquationSvg', 'buildReactionEquationSvg', 'svgViewBoxWidth',
  'equationItems', 'equationItemOf', 'compoundEquationItem', 'derivedReactionEquation',
  'itemsHaveFallback'
].map(extract).join('\n');

function buildCardApi() {
  const compoundById = {};
  D.compounds.forEach((c) => { compoundById[c.id] = c; });
  const grouping = Groups.build(D.reactions);
  const byId = {};
  D.reactions.forEach((r) => { byId[r.id] = r; });
  const factory = new Function('D', 'SD', 'Groups', 'grouping', 'byId', 'compoundById',
    [
      'var REACTION_EQUATION_OPTS = { row: 200, maxWidth: 300, minScale: 0.55 };',
      'var REACTION_EQUATION_STACK_OPTS = { row: 200, maxWidth: 300, minScale: 0.55, stack: true };',
      'var EQUATION_STACK_MIN_WIDTH = 600;',
      'var EQUATION_MODE_NOTES = { B: "B", N: "N", T: "T", P: "P" };',
      'function typeFor(type) { return D.types[type] || null; }',
      'function regionName(id) { var r = D.regions.filter(function (x) { return x.id === id; })[0]; return r ? r.name : id; }',
      'function findReaction(id) { return byId[id] || null; }',
      'function displayGroupFor(id) { return Groups.getGroup(grouping, id); }',
      CARD_SRC,
      'return { card: reactionCard, grouping: grouping, byId: byId };'
    ].join('\n')
  );
  return factory(D, SD, Groups, grouping, byId, compoundById);
}

test('[card] 複数は 1 つの h2・member 節ごとの式/条件/出典・式ごとの拡大 opener を持つ', () => {
  const api = buildCardApi();
  const member = 'ethanol-cuo-oxidation';
  const group = Groups.getGroup(api.grouping, member);
  assert.equal(group.size, 3);
  const html = api.card(member);
  assert.equal((html.match(/<h2 id="rp-card-title">/g) || []).length, 1, 'h2 は 1 つ');
  assert.ok(html.indexOf('条件別の反応 3件') !== -1);
  const sections = html.match(/<section class="rp-card__group-member"[^>]*>/g) || [];
  assert.equal(sections.length, 3, 'member ごとの節');
  group.memberIds.forEach((id) => {
    assert.ok(html.indexOf('data-reaction-id="' + id + '"') !== -1, id + ' の節');
  });
  const openers = html.match(/data-eq-open="1"/g) || [];
  assert.equal(openers.length, 3, '各式に拡大 opener');
  assert.equal((html.match(/class="rp-common"/g) || []).length, 1, '共通説明は 1 回');
  assert.equal((html.match(/data-action="fit-reaction"/g) || []).length, 1, '共通端点ボタンは 1 回');

  // 各 member の条件・注意・出典・evidence が落ちていない。
  group.members.forEach((r) => {
    if (r.conditions) assert.ok(html.indexOf(r.conditions) !== -1, r.id + ' の条件');
    if (r.note) assert.ok(html.indexOf(r.note) !== -1, r.id + ' の注意');
    (r.sources || []).forEach((s) => assert.ok(html.indexOf(s) !== -1, r.id + ' の出典'));
  });

  // 式の aria は条件で区別される（dialog の opener ごとに別の説明）。
  const arias = [...html.matchAll(/class="rp-eq-open"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(arias.length, 3);
  assert.ok(arias.some((t) => t.indexOf('条件 ') !== -1), '条件付き aria');
  assert.equal(new Set(arias).size, 3, 'member ごとに異なる aria');
});

test('[card] 単独反応は従来の 1 反応カードのまま（グループ節・h2 を増やさない）', () => {
  const api = buildCardApi();
  const id = 'methane-chlorination';
  assert.equal(api.grouping.groupById[api.grouping.byReactionId[id]].size, 1);
  const html = api.card(id);
  assert.equal((html.match(/<h2 id="rp-card-title">/g) || []).length, 1);
  assert.equal(html.indexOf('rp-card__group-member'), -1);
  assert.equal((html.match(/data-eq-open="1"/g) || []).length, 1);
  assert.ok(html.indexOf('この反応の個別情報') !== -1);
});

// ---------------- データ不変 ----------------

test('[immutable] 表示を組み立てても data / P / A の化学データは変わらない', () => {
  const before = [JSON.stringify(D), JSON.stringify(P), JSON.stringify(A)];
  buildNormal();
  buildProposed();
  buildAcademic();
  buildCardApi();
  const after = [JSON.stringify(D), JSON.stringify(P), JSON.stringify(A)];
  assert.deepEqual(after, before, 'facts・座標・出典は byte 同一');
});
