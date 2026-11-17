/**
 * app11 配置切替（現在の配置 / 新しい配置案）の UI 回帰テスト
 *
 * 実行: node --test scripts/tests/app11-layout-switch-ui.test.cjs
 *
 * 担当範囲は site/app11/app.js / index.html の runtime 切替（配置選択・投影・選択維持・
 * fail-closed）と読み込み順。化学データ（data.js）と配置案そのもの（B 担当の生成物）の妥当性は
 * ここでは検証しない（生成物が無い間も現在の配置だけで動くことを確かめる）。
 *
 * - 初期は「現在の配置」。URL パラメータ・localStorage へは保存しない。
 * - 配置切替コントロールは内部試作。公開 UI では hidden（ID・イベント・API は残す）。
 * - 新しい配置案は通常表示だけ。学術表示は専用配置なので配置ボタンは disabled。
 * - 投影しても data.js の物質・反応（ID・化学名・出典・反応式）は書き換えない。
 * - 欠落・破損した配置案では何も有効化せず、現在の配置をそのまま使う。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');

const D = require(path.join(APP, 'data.js'));
const Contract = require(path.join(APP, 'proposal-contract.js'));
const Core = require(path.join(APP, 'map-core.js'));
// 実ファイル（B の生成物・A の学術データ）。fixture との取り違えを避けるため [real] テストだけで使う。
const P_REAL = require(path.join(APP, 'proposed-layout-data.js'));
const A_DATA = require(path.join(APP, 'academic-data.js'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

const APP_JS = read('app.js');
const APP_CSS = read('app.css');
const INDEX_HTML = read('index.html');

/* ------------------------------------------------------------------
 * 配置案の fake fixture（B の生成物が無くても UI 契約を検証できるようにする）
 * ------------------------------------------------------------------ */

function fakeProposal() {
  const positions = {};
  D.compounds.forEach((c) => {
    positions[c.id] = {
      x: c.x,
      y: c.y + 40,
      w: c.w == null ? D.meta.nodeW : c.w,
      h: c.h == null ? D.meta.nodeH : c.h
    };
  });
  const markers = {};
  const routes = {};
  D.reactions.forEach((r) => {
    let label;
    if (r.label) {
      label = Object.assign({}, r.label, {
        anchor: 'center',
        type: { x: r.label.type.x, y: r.label.type.y + 40 },
        box: { x: r.label.box.x, y: r.label.box.y + 40, w: r.label.box.w, h: r.label.box.h }
      });
    } else {
      // 新しい配置案は 162 すべてにラベルを持つ（現在の配置で label が無い反応も含む）。
      label = {
        side: 'E',
        type: { x: r.x + 22, y: r.y + 40 },
        cond: null,
        box: { x: r.x + 30, y: r.y + 32, w: 64, h: 16 }
      };
    }
    markers[r.id] = { x: r.x, y: r.y + 40, tier: r.tier, label: label };
    r.edges.forEach((e) => {
      routes[r.id + '|' + e.dir + '|' + e.id] = {
        reaction: r.id,
        dir: e.dir,
        compound: e.id,
        tier: e.tier,
        points: e.points.map((p) => [p[0], p[1] + 40]),
        gaps: [],
        bridges: []
      };
    });
  });
  return {
    version: 1,
    kind: 'normal-proposed',
    base: Contract.buildBase(D),
    positions: positions,
    markers: markers,
    routes: routes,
    canvas: { x: 0, y: 0, w: 6400, h: 3600 },
    regionFocus: {},
    stats: {},
    warnings: []
  };
}

const PROPOSAL = fakeProposal();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------------
 * 投影・配置 getter のハーネス（mode / layoutChoice を切り替える）
 * ------------------------------------------------------------------ */

function layoutHarness(initial, opts) {
  const options = opts || {};
  const contract = options.contract === undefined ? Contract : options.contract;
  const names = [
    'projectCompound', 'projectNormalRoute', 'projectNormalReaction',
    'activeLayout', 'activeLayoutName', 'projectionKey',
    'activeCompoundById', 'activeCompounds', 'compoundAt', 'positionOf', 'activeRegions',
    'activeReactions', 'activeReactionIndex', 'activeEdgeIndex', 'activeConnectors',
    'activeHitCandidates', 'activeIncoming', 'activeOutgoing', 'proposedLayoutProblem',
    'initProposedLayout', 'findReaction'
  ];
  const code = names.map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  const factory = new Function(
    'D', 'Contract', 'P', 'state',
    [
      'var mode = state.mode;',
      'var layoutChoice = state.layoutChoice;',
      'var academic = state.academic;',
      'var academicEnabled = state.academicEnabled;',
      'var proposed = state.proposed;',
      'var proposedEnabled = state.proposedEnabled;',
      'var proposedAll = [];',
      'var proposedAllById = {};',
      'var proposedReactionIndex = {};',
      'var proposedAllEdgeIndex = {};',
      'var proposedConnectors = {};',
      'var proposedHitCandidates = [];',
      'var proposedIncoming = {};',
      'var proposedOutgoing = {};',
      'var reactionIndex = {};',
      'var edgeIndex = {};',
      'var reactionConnectors = {};',
      'var hitCandidates = [];',
      'var incoming = {};',
      'var outgoing = {};',
      'var academicAll = [];',
      'var academicReactionIndex = {};',
      'var academicAllEdgeIndex = {};',
      'var academicConnectors = {};',
      'var academicHitCandidates = [];',
      'var academicIncoming = {};',
      'var academicOutgoing = {};',
      'var classHitCandidates = [];',
      'var projectedCache = null;',
      'var proposedDisabledReason = "";',
      'var errors = [];',
      'var ACADEMIC_LAYOUT_VERSION = 2;',
      'var NODE_W = D.meta.nodeW, NODE_H = D.meta.nodeH;',
      'function nodeW(c) { return c.w || NODE_W; }',
      'function nodeH(c) { return c.h || NODE_H; }',
      'function errMsg(text) { errors.push(String(text)); }',
      code,
      'function loadProposed(p) {',
      '  var problem = proposedLayoutProblem(p);',
      '  if (problem) return { ok: false, problem: problem };',
      '  proposed = {',
      '    positions: p.positions, regionFocus: p.regionFocus || {}, canvas: p.canvas,',
      '    normalMarkers: p.markers || {}, normalRoutes: p.routes || {},',
      '    markers: p.markers || {}, routes: p.routes || {}, stats: p.stats || {}',
      '  };',
      '  proposedAll = D.reactions.map(function (r) { return projectNormalReaction(r, proposed, "proposed"); });',
      '  proposedAll.forEach(function (r) {',
      '    proposedAllById[r.id] = r;',
      '    r.products.forEach(function (id) { (proposedIncoming[id] = proposedIncoming[id] || []).push(r); });',
      '    r.substrates.forEach(function (id) { (proposedOutgoing[id] = proposedOutgoing[id] || []).push(r); });',
      '  });',
      '  proposedEnabled = true;',
      '  projectedCache = null;',
      '  return { ok: true };',
      '}',
      'function loadAcademic(layout) {',
      '  academic = layout;',
      '  academicEnabled = !!layout;',
      '  if (!layout) return;',
      '  academicAll = D.reactions.map(function (r) { return projectNormalReaction(r, layout, "academic"); });',
      '  projectedCache = null;',
      '}',
      'return {',
      '  loadProposed: loadProposed, loadAcademic: loadAcademic,',
      '  initProposedLayout: initProposedLayout,',
      '  proposedProblem: proposedLayoutProblem,',
      "  projectReaction: function (r, layout, name) { return projectNormalReaction(r, layout, name); },",
      '  setMode: function (next) { mode = next; projectedCache = null; },',
      '  setChoice: function (next) { layoutChoice = next; projectedCache = null; },',
      '  state: function () { return { mode: mode, layoutChoice: layoutChoice, name: activeLayoutName(), layout: activeLayout() }; },',
      '  proposed: function () {',
      '    return {',
      '      enabled: proposedEnabled,',
      '      reason: proposedDisabledReason,',
      '      errors: errors,',
      '      all: proposedAll,',
      '      byId: proposedAllById,',
      '      incoming: proposedIncoming,',
      '      outgoing: proposedOutgoing',
      '    };',
      '  },',
      '  compoundAt: compoundAt, compounds: activeCompounds, positionOf: positionOf,',
      '  findReaction: findReaction,',
      '  regions: activeRegions, reactions: activeReactions, reactionIndex: activeReactionIndex,',
      '  edges: activeEdgeIndex, connectors: activeConnectors, hits: activeHitCandidates,',
      '  incoming: activeIncoming, outgoing: activeOutgoing',
      '};'
    ].join('\n')
  );
  const state = {
    mode: initial.mode || 'normal',
    layoutChoice: initial.layoutChoice || 'current',
    academic: null,
    academicEnabled: false,
    proposed: null,
    proposedEnabled: false
  };
  const api = factory(D, contract, options.proposal === undefined ? PROPOSAL : options.proposal, state);
  return { api: api, state: state };
}

/* ------------------------------------------------------------------
 * 初期状態と切替の入口
 * ------------------------------------------------------------------ */

test('[initial] 配置は既定で「現在の配置」。URL・localStorage へは保存しない', () => {
  assert.ok(APP_JS.includes("var layoutChoice = 'current';"));
  assert.ok(APP_JS.includes("layoutChoice = 'current';\n    svg.setAttribute('data-layout', 'current');"),
    '通常表示の初期配置は current');
  assert.equal(APP_JS.includes('localStorage'), false, 'localStorage で配置を復元しない');
  assert.equal(/get\('layout'\)|get\('proposed'\)/.test(APP_JS), false, '配置用の URL パラメータを増やさない');
  // 配置ボタンは「表示モード」とは別のグループ。
  assert.match(INDEX_HTML, /role="group" aria-label="反応と物質の配置"/);
  assert.match(INDEX_HTML, /id="rp-layout-current"[^>]*aria-pressed="true"/);
  assert.match(INDEX_HTML, /id="rp-layout-proposed"[^>]*aria-pressed="false"/);
  assert.ok(INDEX_HTML.includes('現在の配置') && INDEX_HTML.includes('新しい配置案'));
});

test('[hidden] 配置切替コントロールは公開 UI に出さない（初期 current・DOM / イベントは維持）', () => {
  // 初期配置は従来どおり current（表示だけを変え、初期挙動は変えない）。
  assert.ok(APP_JS.includes("layoutChoice = 'current';"));

  // グループごと hidden。ボタン DOM / ID / aria-pressed / 文言は残す（内部試作用）。
  assert.match(INDEX_HTML, /<div class="rp-layout"[^>]*\shidden[ >]/);
  assert.match(INDEX_HTML, /role="group" aria-label="反応と物質の配置"/);
  assert.match(INDEX_HTML, /id="rp-layout-current"[^>]*aria-pressed="true">現在の配置</);
  assert.match(INDEX_HTML, /id="rp-layout-proposed"[^>]*aria-pressed="false">新しい配置案</);
  const layoutDiv = /<div class="rp-layout"[^>]*>([\s\S]*?)<\/div>/.exec(INDEX_HTML);
  assert.ok(layoutDiv, '.rp-layout ブロック');
  assert.match(layoutDiv[1], /rp-layout-current/);
  assert.match(layoutDiv[1], /rp-layout-proposed/);

  // イベント・切替 API は残す（programmatic な内部テスト用）。
  assert.match(APP_JS, /layoutButton\('current'\)[\s\S]*?addEventListener\('click'/);
  assert.match(APP_JS, /layoutButton\('proposed'\)[\s\S]*?addEventListener\('click'/);
  assert.match(extractFunctionSource(APP_JS, 'setLayoutChoice'), /next === 'proposed'/);

  // .rp-layout の display:flex に負けないよう、hidden を CSS でも明示する。
  const hiddenRule = /\.rp-layout\[hidden\] \{ display: none; \}/;
  assert.match(APP_CSS, hiddenRule);
  assert.ok(APP_CSS.search(/\.rp-layout \{ display: flex;/) !== -1, '.rp-layout の display:flex');
  assert.ok(APP_CSS.search(/\.rp-layout \{ display: flex;/) < APP_CSS.search(hiddenRule),
    'hidden の上書きは display:flex より後ろに置く');

  // keyboard / a11y: hidden の子孫は tab 対象外・支援技術から不可視。JS で解除しない。
  assert.equal(layoutDiv[1].includes('tabindex'), false, 'ボタンに tabindex を与えない');
  assert.equal(/\.rp-layout[^\n]*removeAttribute\('hidden'\)/.test(APP_JS), false, 'hidden を解除しない');
  assert.equal(/layoutButton\([^)]*\)\.focus\(/.test(APP_JS), false, '非表示ボタンへ focus しない');
  assert.equal(INDEX_HTML.includes('非表示'), false, '画面に余計な説明文を出さない');
});

test('[switch] 通常は現在の配置、配置案を選ぶと投影座標へ切り替わり、canonical は不変', () => {
  const { api } = layoutHarness({});
  assert.equal(api.state().name, 'current');
  assert.equal(api.compoundAt('benzene'), D.compounds.find((c) => c.id === 'benzene'), '現在は同一参照');
  assert.equal(api.reactions(), D.reactions, '現在は canonical の反応');

  const loaded = api.loadProposed(PROPOSAL);
  assert.deepEqual(loaded, { ok: true });
  api.setChoice('proposed');
  assert.equal(api.state().name, 'proposed');

  const canonical = D.compounds.find((c) => c.id === 'benzene');
  const projected = api.compoundAt('benzene');
  assert.notEqual(projected, canonical, '配置案は複製');
  assert.equal(projected.y, canonical.y + 40, '配置案の座標で描く');
  assert.equal(projected.name, canonical.name, '化学データ（名称）は保つ');
  assert.equal(api.positionOf('benzene').y, canonical.y + 40);
  assert.equal(api.compounds().length, D.compounds.length);

  const all = api.reactions();
  assert.equal(all.length, D.reactions.length);
  assert.equal(all[0].typeLabel, D.reactions[0].typeLabel, '反応名は data.js のまま');
  assert.equal(all[0].x, D.reactions[0].x);
  assert.equal(all[0].y, D.reactions[0].y + 40);
  assert.equal(all.reduce((n, r) => n + r.edges.length, 0),
    D.reactions.reduce((n, r) => n + r.edges.length, 0), '辺数を減らさない');
});

test('[switch] 配置案の当たり判定・強調・カードは配置案の索引へ切り替わる', () => {
  const { api } = layoutHarness({});
  api.loadProposed(PROPOSAL);
  assert.ok(api.reactionIndex(), '現在の索引を返す');
  api.setChoice('proposed');
  // 索引そのものは buildProposed が埋める。参照先が切り替わることを型で確かめる。
  assert.ok(api.reactionIndex() && typeof api.reactionIndex() === 'object');
  for (const name of ['activeReactionIndex', 'activeEdgeIndex', 'activeConnectors',
    'activeHitCandidates', 'activeIncoming', 'activeOutgoing']) {
    const src = extractFunctionSource(APP_JS, name);
    assert.match(src, /proposedEnabled/, name + ' は配置案の索引を使う');
    assert.match(src, /proposed/, name + ' は現在の配置へ落ちない');
  }
  const entity = extractFunctionSource(APP_JS, 'entityElement');
  assert.match(entity, /activeReactionIndex\(\)\[id\]/);
  assert.match(extractFunctionSource(APP_JS, 'updateEdgeHighlight'), /activeEdgeIndex\(\)/);
  assert.match(extractFunctionSource(APP_JS, 'showReactionStroke'), /activeConnectors\(\)/);
  assert.match(extractFunctionSource(APP_JS, 'findReaction'), /proposedEnabled/);
  assert.match(extractFunctionSource(APP_JS, 'findReaction'), /mode === 'academic'\) return academicAllById\[id\]/);
});

test('[switch] 選択・カード・検索入力/結果を保ち、選択物質があれば新しい位置へ寄せる', () => {
  const src = extractFunctionSource(APP_JS, 'setLayoutChoice');
  assert.match(src, /logical = selected \? \{ kind: selected\.kind, id: selected\.id \}/, '論理選択を保つ');
  assert.match(src, /if \(keep\) \{\s*selectNode\(logical\.kind, logical\.id\)/);
  assert.match(src, /if \(cardOpen\) openCard\(logical\.kind, logical\.id\)/, 'カードを開き直す');
  assert.equal(/searchInput\.value = ''/.test(src), false, '検索入力を消さない');
  assert.equal(/applySearch\(/.test(src), false, '検索結果の DOM を作り直さない');
  assert.equal(/refreshLists\(\)/.test(src), false, '一覧を作り直さない');
  assert.match(src, /cancelWheelZoom\(\)/, 'ホイールの途中目標を捨てる');
  assert.match(src, /animToken \+= 1/, '進行中のアニメーションを無効化');
  assert.match(src, /ensureProposedLayer\(\)/, '初回選択時に DOM を作る');
  assert.match(src, /focusAfterLayoutSwitch\(/);

  const focus = extractFunctionSource(APP_JS, 'focusAfterLayoutSwitch');
  assert.match(focus, /kind === 'compound'/, '選択物質は新しい位置へ');
  assert.match(focus, /kind === 'reaction'/, '選択反応も新しい位置へ');
  assert.match(focus, /animateTo\(fitModeCanvasView\(\)\)/, '選択が無ければ全体表示');

  // 初回選択まで配置案 DOM を作らない。
  const init = APP_JS.slice(APP_JS.indexOf('function init()'), APP_JS.indexOf("if (document.readyState === 'loading')"));
  assert.match(init, /initProposedLayout\(\)/);
  assert.equal(/buildProposed\(\)/.test(init), false, '初期化では配置案 DOM を作らない');
});

test('[switch] setLayoutChoice は current → proposed → current を状態と data-layout 属性で切り替える', () => {
  // fakeDOM / VM: setLayoutChoice の依存だけを stub し、副作用の順序を確かめる。
  const code = ['setLayoutChoice', 'focusAfterLayoutSwitch'].map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  const calls = [];
  const attrs = { svg: {}, map: {} };
  const svg = { setAttribute: (k, v) => { attrs.svg[k] = v; } };
  const mapEl = { setAttribute: (k, v) => { attrs.map[k] = v; }, focus: () => calls.push('map.focus') };
  const selected = { kind: 'compound', id: 'benzene' };
  const card = { hidden: false };
  const view = { scale: 1, x: 0, y: 0 };
  const Core = { detailLevel: () => 2 };
  const state = {
    mode: 'normal', layoutChoice: 'current', proposedEnabled: true, proposedBuilt: false,
    cancelWheelZoom: () => calls.push('cancelWheelZoom'),
    animToken: 0,
    closeEquationDialog: () => calls.push('closeEquationDialog'),
    closePositionPopover: () => calls.push('closePositionPopover'),
    clearRegionSelection: () => calls.push('clearRegionSelection'),
    ensureProposedLayer: () => { state.proposedBuilt = true; calls.push('ensureProposedLayer'); },
    syncNodeProjection: () => calls.push('syncNodeProjection'),
    syncModeLayers: () => calls.push('syncModeLayers'),
    updateLayoutButtons: () => calls.push('updateLayoutButtons'),
    updateMarkers: () => calls.push('updateMarkers'),
    modeHasEntity: () => true,
    selectNode: (kind, id) => calls.push('selectNode:' + kind + ':' + id),
    openCard: (kind, id) => calls.push('openCard:' + kind + ':' + id),
    closeCard: () => calls.push('closeCard'),
    animateTo: () => calls.push('animateTo'),
    fitModeCanvasView: () => ({ scale: 0.2 }),
    entityTarget: () => ({ scale: 1 }),
    compoundAt: () => ({ x: 10, y: 20 }),
    findReaction: () => ({ x: 30, y: 40 }),
    nodeW: () => 136,
    nodeH: () => 34
  };
  const factory = new Function(
    'state', 'svg', 'mapEl', 'document', 'selected', 'card', 'view', 'Core',
    [
      'var mode = state.mode;',
      'var layoutChoice = state.layoutChoice;',
      'var proposedEnabled = state.proposedEnabled;',
      'var proposedBuilt = state.proposedBuilt;',
      'var selected = arguments[4];',
      'var card = arguments[5];',
      'var view = arguments[6];',
      'var Core = arguments[7];',
      'var animToken = state.animToken;',
      'var projectedCache = null;',
      'var returnFocus = null;',
      'var cancelWheelZoom = state.cancelWheelZoom;',
      'var closeEquationDialog = state.closeEquationDialog;',
      'var closePositionPopover = state.closePositionPopover;',
      'var clearRegionSelection = state.clearRegionSelection;',
      'var ensureProposedLayer = function () { state.ensureProposedLayer(); proposedBuilt = true; };',
      'function moveFocusOutOfHiddenLayer() { state.focusMoves = (state.focusMoves || 0) + 1; }',
      'var syncNodeProjection = state.syncNodeProjection;',
      'var syncModeLayers = state.syncModeLayers;',
      'var updateLayoutButtons = state.updateLayoutButtons;',
      'var updateMarkers = state.updateMarkers;',
      'var modeHasEntity = state.modeHasEntity;',
      'var selectNode = state.selectNode;',
      'var openCard = state.openCard;',
      'var closeCard = state.closeCard;',
      'var animateTo = state.animateTo;',
      'var fitModeCanvasView = state.fitModeCanvasView;',
      'var entityTarget = state.entityTarget;',
      'var compoundAt = state.compoundAt;',
      'var findReaction = state.findReaction;',
      'var nodeW = state.nodeW;',
      'var nodeH = state.nodeH;',
      'var window = { };',
      'function errMsg() {}',
      code,
      'return {',
      '  setLayoutChoice: setLayoutChoice,',
      '  state: function () { return { layoutChoice: layoutChoice, proposedBuilt: proposedBuilt, animToken: animToken }; },',
      '  setMode: function (m) { mode = m; }',
      '};'
    ].join('\n')
  );
  const api = factory(state, svg, mapEl, { activeElement: null }, selected, card, view, Core);

  api.setLayoutChoice('proposed');
  assert.equal(api.state().layoutChoice, 'proposed');
  assert.equal(api.state().proposedBuilt, true, '初回で遅延構築する');
  assert.equal(attrs.svg['data-layout'], 'proposed');
  assert.equal(attrs.map['data-layout'], 'proposed');
  assert.ok(calls.indexOf('cancelWheelZoom') !== -1);
  assert.ok(calls.indexOf('ensureProposedLayer') !== -1);
  assert.ok(calls.indexOf('selectNode:compound:benzene') !== -1, '選択を保つ');
  assert.ok(calls.indexOf('openCard:compound:benzene') !== -1, 'カードを保つ');
  assert.equal(api.state().animToken, 1, '進行中のアニメーションを捨てる');
  assert.ok(calls.indexOf('animateTo') !== -1, '選択物質の新しい位置へ寄せる');

  const before = calls.length;
  api.setLayoutChoice('proposed');
  assert.equal(calls.length, before, '同じ配置の再選択では何もしない');

  api.setLayoutChoice('current');
  assert.equal(api.state().layoutChoice, 'current');
  assert.equal(attrs.svg['data-layout'], 'current');

  api.setMode('academic');
  const inAcademic = calls.length;
  api.setLayoutChoice('proposed');
  assert.equal(api.state().layoutChoice, 'current', '学術表示中は配置を切り替えない');
  assert.equal(calls.length, inAcademic);
});

test('[mode] 学術表示は専用配置を使い、通常へ戻すと前の配置選択を復元する', () => {
  const { api } = layoutHarness({});
  const academicLayout = { positions: PROPOSAL.positions, regionFocus: {}, canvas: PROPOSAL.canvas, normalMarkers: PROPOSAL.markers, normalRoutes: PROPOSAL.routes, markers: PROPOSAL.markers, routes: PROPOSAL.routes };
  api.loadProposed(PROPOSAL);
  api.loadAcademic(academicLayout);
  api.setChoice('proposed');
  const before = api.state();
  assert.equal(before.name, 'proposed');

  api.setMode('academic');
  assert.equal(api.state().name, 'current', '学術表示は専用配置');
  assert.equal(api.state().layout, academicLayout, '学術レイアウトを使う');
  assert.equal(api.compoundAt('benzene').y, D.compounds.find((c) => c.id === 'benzene').y + 40,
    '学術表示でも学術座標');

  api.setMode('normal');
  assert.equal(api.state().name, 'proposed', '通常へ戻すと前の配置選択が復元される');

  const setModeSrc = extractFunctionSource(APP_JS, 'setMode');
  assert.match(setModeSrc, /mode === 'academic' \? 'current' : activeLayoutName\(\)/);
  assert.match(setModeSrc, /updateLayoutButtons\(\)/);
  assert.match(extractFunctionSource(APP_JS, 'updateLayoutButtons'), /学術表示は専用配置/);
});

test('[mode] 学術表示中は配置ボタンを disabled にし、理由を title / aria で示す', () => {
  const src = extractFunctionSource(APP_JS, 'updateLayoutButtons');
  assert.match(src, /current\.disabled = academicMode/);
  assert.match(src, /proposal\.disabled = academicMode \|\| !proposedEnabled/);
  assert.match(src, /setAttribute\('aria-label', '現在の配置（学術表示は専用配置）'\)/);
  assert.match(src, /setAttribute\('aria-label', '新しい配置案（学術表示は専用配置）'\)/);
  assert.match(src, /title = academicMode \? dedicated/);
});

test('[canvas] 表示範囲・fit・現在位置は選択中の配置の canvas を使う', () => {
  const canvasSrc = extractFunctionSource(APP_JS, 'modeCanvas');
  assert.match(canvasSrc, /activeLayout\(\)/);
  assert.match(canvasSrc, /layout\.canvas/);
  const fitSrc = extractFunctionSource(APP_JS, 'fitModeCanvasView');
  assert.match(fitSrc, /activeLayout\(\)/);
  assert.equal(/academic\.canvas/.test(fitSrc), false, '学術だけに固定しない');
  const positionSrc = extractFunctionSource(APP_JS, 'updatePosition');
  assert.match(positionSrc, /modeCanvas\(\)/, '現在位置に選択中 canvas を渡す');
});

test('[failclosed] 欠落・破損した配置案では現在の配置のまま（何も有効化しない）', () => {
  const { api } = layoutHarness({});
  assert.match(api.proposedProblem(null), /proposal-data がない/);
  assert.match(api.proposedProblem({ version: 2, kind: 'normal-proposed' }), /種別|版/);
  assert.match(api.proposedProblem({ version: 1, kind: 'other' }), /種別が normal-proposed ではない/);

  const wrongBase = clone(PROPOSAL);
  wrongBase.base.normalVersion = 'old';
  assert.match(api.proposedProblem(wrongBase), /提案データが通常データと一致しない/);

  const wrongCount = clone(PROPOSAL);
  wrongCount.base.compoundCount = 1;
  assert.match(api.proposedProblem(wrongCount), /提案データが通常データと一致しない/);

  const noPos = clone(PROPOSAL);
  delete noPos.positions.benzene;
  assert.match(api.proposedProblem(noPos), /positions の件数|positions が欠落/);

  const noMarker = clone(PROPOSAL);
  delete noMarker.markers[D.reactions[0].id];
  assert.match(api.proposedProblem(noMarker), /markers の件数|marker が欠落/);

  const noLabel = clone(PROPOSAL);
  delete noLabel.markers[D.reactions[0].id].label;
  assert.match(api.proposedProblem(noLabel), /全162ラベルが必要/);

  const noRoute = clone(PROPOSAL);
  delete noRoute.routes[Object.keys(noRoute.routes)[0]];
  assert.match(api.proposedProblem(noRoute), /route が欠落/);

  const badEndpoint = clone(PROPOSAL);
  const key = Object.keys(badEndpoint.routes)[0];
  badEndpoint.routes[key].compound = 'not-a-compound';
  assert.match(api.proposedProblem(badEndpoint), /端点が一致しません/);

  const extraRoute = clone(PROPOSAL);
  extraRoute.routes['unknown|in|unknown'] = { points: [[0, 0], [1, 1]] };
  assert.match(api.proposedProblem(extraRoute), /routes の件数/);

  const noCanvas = clone(PROPOSAL);
  noCanvas.canvas = null;
  assert.match(api.proposedProblem(noCanvas), /canvas がない/);

  const badHash = clone(PROPOSAL);
  badHash.base.nodeIdHash = '00000000';
  assert.match(api.proposedProblem(badHash), /提案データが通常データと一致しない/);

  // 検証器（proposal-contract.js）が無い場合も有効化しない。
  const noContract = layoutHarness({}, { contract: null });
  assert.match(noContract.api.proposedProblem(PROPOSAL), /検証器を読み込めない/);
  assert.deepEqual(noContract.api.loadProposed(PROPOSAL), {
    ok: false,
    problem: '配置案の検証器を読み込めないため、新しい配置案を使えません。'
  });

  // 壊れたデータでは有効化しない（proposedEnabled は検証成功後にだけ true）。
  const loaded = api.loadProposed(noPos);
  assert.equal(loaded.ok, false);
  assert.equal(api.state().name, 'current', '現在の配置のまま');
  assert.equal(api.compoundAt('benzene'), D.compounds.find((c) => c.id === 'benzene'));

  const initSrc = APP_JS.slice(APP_JS.indexOf('function initProposedLayout'), APP_JS.indexOf('function buildProposed'));
  assert.match(initSrc, /var problem = proposedLayoutProblem\(P\)/);
  assert.match(initSrc, /if \(problem\)/);
  assert.match(initSrc, /proposedEnabled = true/);
});

test('[labels] 反応名の文字は typeLabel のまま。現在の配置の label 有無も変えない', () => {
  const nodeSrc = extractFunctionSource(APP_JS, 'reactionLabelNodes');
  assert.match(nodeSrc, /label\.textContent = text/, '反応名は typeLabel を使う');
  assert.equal(/marker/.test(nodeSrc), false, 'マーカーの文字へ差し替えない');

  const { api } = layoutHarness({});
  api.loadProposed(PROPOSAL);
  api.setChoice('proposed');
  const projected = api.reactions();
  D.reactions.forEach((r, i) => {
    assert.equal(projected[i].id, r.id, '反応IDを保つ');
    assert.equal(projected[i].typeLabel, r.typeLabel, '反応名を変えない');
    assert.equal(projected[i].state, r.state, '確認区分を変えない');
    assert.deepEqual(projected[i].sources, r.sources, '出典を保つ');
    assert.equal(projected[i].equation, r.equation, '反応式を共有する');
  });
  assert.equal(D.reactions.filter((r) => r.label).length, 80, '現在の配置のラベルは 80 のまま');
  assert.equal(D.reactions.filter((r) => !r.label).length, D.reactions.length - 80,
    'label の無い反応は現在の配置では null のまま（HTML重ねラベルが使える）');

  // 配置案のマーカーにラベルが無い場合は canonical の label をそのまま使う（捏造しない）。
  const rid = D.reactions.find((r) => r.label).id;
  const canonical = D.reactions.find((r) => r.id === rid);
  const out = api.projectReaction(canonical, {
    normalMarkers: { [rid]: { x: 0, y: 0, tier: canonical.tier, label: null } },
    normalRoutes: {}
  }, 'proposed');
  assert.equal(out.label, canonical.label, 'canonical のラベルを維持');
  assert.equal(out.typeLabel, canonical.typeLabel);
  assert.equal(out.layout, 'proposed');
});

test('[overlay] 高倍率の HTML ラベルは label を持つ反応を重ねない（二重表示しない）', () => {
  const overlay = APP_JS.slice(APP_JS.indexOf('function updateOverlay'), APP_JS.indexOf('function tryPlace'));
  assert.match(overlay, /if \(r\.tier !== 'secondary' \|\| r\.label\) return;/, 'r.label 有りは HTML 重ねをしない');
  assert.match(overlay, /displayReactions\(\)/, '選択中の配置の代表反応だけを対象にする');
});

test('[lod] 補助ラベルと導線は LOD0/1 で隠し、LOD2 で表示する（既存規則を保つ）', () => {
  assert.match(APP_CSS, /\.rp-map\[data-level="0"\] \.rp-reaction--secondary \.rp-reaction__label,/);
  assert.match(APP_CSS, /\.rp-map\[data-level="1"\] \.rp-reaction--secondary \.rp-reaction__label/);
  assert.match(APP_CSS, /\.rp-map\[data-level="0"\] \.rp-reaction--secondary \.rp-reaction__leader,/);
  assert.match(APP_CSS, /\.rp-map\[data-level="1"\] \.rp-reaction--secondary \.rp-reaction__leader/);
  const nodeSrc = extractFunctionSource(APP_JS, 'reactionLabelNodes');
  assert.match(nodeSrc, /rp-reaction__leader/, 'leader は同じ反応グループに入れる');
});

test('[layers] 配置案レイヤーは data-layout で出し入れし、通常の層と同時に出さない', () => {
  assert.match(APP_CSS, /\.rp-proposed \{ display: none; \}/);
  assert.match(APP_CSS, /\.rp-svg\[data-layout="proposed"\] \.rp-proposed \{ display: inline; \}/);
  assert.match(APP_CSS, /\.rp-svg\[data-layout="proposed"\] \.rp-layout-normal \{ display: none; \}/);
  const build = APP_JS.slice(APP_JS.indexOf('function buildProposed'), APP_JS.indexOf('function ensureProposedLayer'));
  assert.match(build, /'class': 'rp-proposed'/, '専用レイヤー');
  assert.match(build, /data-layout': 'proposed'/);
  assert.match(build, /proposedLayer = /);
  const sync = extractFunctionSource(APP_JS, 'syncModeLayers');
  assert.match(sync, /setLayerInteractive\(proposedLayer, prop\)/);
  assert.match(sync, /setLayerInteractive\(normalMarkerLayer, !acad && !prop\)/);
});

/* ------------------------------------------------------------------
 * fake DOM + 実 map-core で buildProposed を動かすハーネス
 * fixture（合成データ）と実ファイル（D / P / Contract）の両方に使う。
 * ------------------------------------------------------------------ */

function makeFakeNode(tag) {
  return {
    tagName: tag, attrs: {}, children: [], textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    insertBefore(child, ref) {
      const i = this.children.indexOf(ref);
      if (i < 0) throw new Error('ref not found');
      this.children.splice(i, 0, child); child.parent = this; return child;
    },
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      const walk = (n) => {
        for (const c of n.children) {
          if ((c.attrs['class'] || '').split(/\s+/).includes(cls)) return c;
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    },
    get lastChild() { return this.children[this.children.length - 1] || null; }
  };
}

function buildProposedLayer(proposal) {
  const viewport = makeFakeNode('g');
  const normalMarkerLayer = makeFakeNode('g');
  normalMarkerLayer.setAttribute('class', 'rp-reactions rp-layout-normal');
  viewport.appendChild(normalMarkerLayer);
  const documentStub = { createElementNS: (ns, tag) => makeFakeNode(tag) };

  const compoundById = {};
  D.compounds.forEach((c) => { compoundById[c.id] = c; });
  const names = ['projectCompound', 'projectNormalRoute', 'projectNormalReaction', 'labelAnchorName',
    'labelPoint', 'reactionLabelNodes', 'reactionLabel', 'reactionAccessibleLabel',
    'buildReactionGrouping', 'displayReactionList', 'groupOfBuilt',
    'arrowHeadAttrs', 'hitPolylines',
    'connectorHitShape', 'hitCandidate', 'buildProposed'];
  const code = names.map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  const factory = new Function('D', 'P', 'Core', 'Groups', 'document', 'viewport', 'normalMarkerLayer',
    'LABEL_EDGE_OFFSET', 'compoundById', 'NODE_W', 'NODE_H',
    [
      'var proposed = null, proposedEnabled = false, proposedAll = [], proposedConnectors = {},',
      '    proposedGrouping = null,',
      '    proposedAllEdgeIndex = {}, proposedHitCandidates = [], proposedReactionIndex = {},',
      '    proposedLayer = null, proposedBuilt = false;',
      'var HIT_SAMPLE_STEP = 2, HIT_WIDTH = Core.HIT_WIDTH;',
      'var SVG_NS = "http://www.w3.org/2000/svg";',
      'function nodeW(c) { return c.w || NODE_W; }',
      'function nodeH(c) { return c.h || NODE_H; }',
      'function el(tag, attrs) { var n = document.createElementNS(SVG_NS, tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }',
      'function errMsg(t) { throw new Error(t); }',
      code,
      'proposed = { positions: P.positions, regionFocus: P.regionFocus || {}, canvas: P.canvas, normalMarkers: P.markers, normalRoutes: P.routes, markers: P.markers, routes: P.routes };',
      'proposedAll = D.reactions.map(function (r) { return projectNormalReaction(r, proposed, "proposed"); });',
      'proposedGrouping = buildReactionGrouping(proposedAll);',
      'proposedEnabled = true;',
      'buildProposed();',
      'return {',
      '  layer: proposedLayer, built: proposedBuilt, all: proposedAll,',
      '  counters: function () { return { edges: Object.keys(proposedAllEdgeIndex).length, hits: proposedHitCandidates.length, markers: Object.keys(proposedReactionIndex).length }; },',
      '  index: function () { return proposedReactionIndex; },',
      '  hits: function () { return proposedHitCandidates; },',
      '  edgeIndex: function () { return proposedAllEdgeIndex; }',
      '};'
    ].join('\n')
  );
  const api = factory(D, proposal, Core, require(path.join(APP, 'reaction-groups.js')), documentStub, viewport,
    normalMarkerLayer, 11, compoundById, D.meta.nodeW, D.meta.nodeH);
  return { api: api, viewport: viewport, normalMarkerLayer: normalMarkerLayer };
}

function countClasses(node, cls) {
  let count = 0;
  (function walk(n) {
    if ((n.attrs['class'] || '').split(/\s+/).includes(cls)) count++;
    n.children.forEach(walk);
  })(node);
  return count;
}

test('[fakedom] （合成 fixture）配置案レイヤーは 375 辺・162 マーカー・当たり判定を持つ', () => {
  const { api, viewport, normalMarkerLayer } = buildProposedLayer(PROPOSAL);

  assert.equal(api.built, true, '初回選択で構築する');
  assert.deepEqual(api.counters(), { edges: 375, hits: 156, markers: 162 });
  assert.equal(api.layer.getAttribute('class'), 'rp-proposed');
  assert.equal(api.layer.getAttribute('data-layout'), 'proposed');
  assert.equal(viewport.children[0], api.layer, '通常の反応マーカーより前に置く');
  assert.equal(viewport.children[1], normalMarkerLayer);

  // 反応マーカーは選択・キーボードの実体（data-kind / tabindex）を持つ。
  const groups = api.index();
  const sample = groups[D.reactions[0].id];
  assert.equal(sample.getAttribute('data-kind'), 'reaction');
  assert.equal(sample.getAttribute('data-id'), D.reactions[0].id);
  assert.equal(sample.getAttribute('tabindex'), '0');
  assert.ok(sample.getAttribute('aria-label').indexOf(D.reactions[0].typeLabel) !== -1,
    'aria-label に反応名（facts）を含む');
  assert.equal(Object.keys(groups).length, D.reactions.length, '反応 ID を保つ');

  // 辺の当たり判定から反応を解決できる（選択と同じ経路）。
  const hit = api.hits().find((c) => c.lines.length && c.kind === 'reaction');
  const p = hit.lines[0][0];
  const nearest = Core.nearestHit([hit], { x: p.x, y: p.y }, 9);
  assert.ok(nearest && nearest.id === hit.id, '線上の点で反応が返る');
  assert.ok(groups[nearest.id], '返った反応はマーカー索引にある');
});

/* ------------------------------------------------------------------
 * 実ファイル（D / P_REAL / Contract / A_DATA）での確認
 * 合成 fixture の pass と区別するため、テスト名を [real] で始める。
 * ------------------------------------------------------------------ */

test('[real] 実 P は本物 Contract で有効化され、base は facts のみ（geometry 非依存）', () => {
  assert.equal(P_REAL.version, 1);
  assert.equal(P_REAL.kind, 'normal-proposed');
  assert.equal(Object.keys(P_REAL.positions).length, D.compounds.length);
  assert.equal(Object.keys(P_REAL.markers).length, D.reactions.length);
  assert.equal(Object.keys(P_REAL.routes).length,
    D.reactions.reduce((n, r) => n + r.edges.length, 0));
  assert.deepEqual(Contract.verifyProposal(P_REAL, D), { ok: true }, '実 Contract で有効');
  assert.deepEqual(P_REAL.base, Contract.buildBase(D), 'base が現行 data.js と一致');

  // 座標・ラベル・経路（geometry）を全部変えても base は変わらない = A/B の再配置で P は陳腐化しない。
  const moved = {
    meta: D.meta,
    classMap: D.classMap,
    compounds: D.compounds.map((c) => Object.assign({}, c, { x: c.x + 137.5, y: c.y - 91.25 })),
    reactions: D.reactions.map((r) => Object.assign({}, r, {
      x: r.x + 137.5,
      y: r.y - 91.25,
      label: null,
      edges: r.edges.map((e) => Object.assign({}, e, {
        points: e.points.map((p) => [p[0] + 137.5, p[1] - 91.25])
      }))
    }))
  };
  assert.deepEqual(Contract.buildBase(moved), Contract.buildBase(D),
    'base は facts（id/region/濃度・反応の種類・基質生成物・条件）だけで決まる');
  // 事実が変われば検出できる。
  const changed = {
    meta: D.meta,
    classMap: D.classMap,
    compounds: D.compounds,
    reactions: D.reactions.map((r, i) => (i === 0 ? Object.assign({}, r, { conditions: '条件を変えた' }) : r))
  };
  assert.notDeepEqual(Contract.buildBase(changed), Contract.buildBase(D),
    'facts の変更は base に出る');
});

test('[real] initProposedLayout が実 P を有効化し、162 反応を実座標へ投影する（DOM は遅延）', () => {
  const { api } = layoutHarness({}, { proposal: P_REAL });
  assert.equal(api.proposed().enabled, false, '検証前は無効');

  assert.equal(api.initProposedLayout(), true);
  const st = api.proposed();
  assert.equal(st.enabled, true);
  assert.equal(st.reason, '');
  assert.equal(st.all.length, D.reactions.length);
  assert.equal(Object.keys(st.byId).length, D.reactions.length);

  let incoming = 0;
  let outgoing = 0;
  st.all.forEach((r) => {
    const m = P_REAL.markers[r.id];
    assert.equal(r.x, m.x, r.id + ' のマーカー x');
    assert.equal(r.y, m.y, r.id + ' のマーカー y');
    assert.equal(r.typeLabel, D.reactions.find((d) => d.id === r.id).typeLabel, '反応名は data.js のまま');
    r.edges.forEach((e) => {
      const route = P_REAL.routes[r.id + '|' + e.dir + '|' + e.id];
      assert.deepEqual(e.points, route.points, r.id + '|' + e.id + ' の経路点');
    });
  });
  const totalIncoming = Object.keys(st.incoming).reduce((n, id) => n + st.incoming[id].length, 0);
  const totalOutgoing = Object.keys(st.outgoing).reduce((n, id) => n + st.outgoing[id].length, 0);
  assert.equal(totalIncoming, D.reactions.reduce((n, r) => n + r.products.length, 0), 'incoming の総数が一致');
  assert.equal(totalOutgoing, D.reactions.reduce((n, r) => n + r.substrates.length, 0), 'outgoing の総数が一致');
  assert.equal(Object.keys(st.incoming).length, new Set(D.reactions.flatMap((r) => r.products)).size,
    'incoming の物質 ID が一致');
  const incomingId = D.reactions[0].products[0];
  assert.equal(st.incoming[incomingId].length,
    D.reactions.filter((r) => r.products.indexOf(incomingId) !== -1).length);

  // initProposedLayout は DOM を作らない（buildProposed は初回選択時）。
  const initSrc = extractFunctionSource(APP_JS, 'initProposedLayout');
  assert.equal(/buildProposed\(/.test(initSrc), false, '初期化で SVG を作らない');
});

test('[real] fakeDOM で 375 辺・162 マーカー・ヒット・ラベル・実座標を確認する', () => {
  const { api, viewport, normalMarkerLayer } = buildProposedLayer(P_REAL);

  assert.equal(api.built, true);
  assert.deepEqual(api.counters(), { edges: 375, hits: 156, markers: 162 });
  assert.equal(viewport.children[0], api.layer);
  assert.equal(viewport.children[1], normalMarkerLayer);
  assert.equal(api.layer.getAttribute('data-layout'), 'proposed');

  const labels = countClasses(api.layer, 'rp-reaction__label');
  assert.equal(labels, 156, '実 P の代表 156 ラベルを描く');
  const leaders = countClasses(api.layer, 'rp-reaction__leader');
  const expectedLeaders = Object.keys(P_REAL.markers)
    .filter((id) => Array.isArray(P_REAL.markers[id].label.leader) && P_REAL.markers[id].label.leader.length > 1)
    .length;
  assert.equal(leaders, expectedLeaders, 'leader は実データの数だけ描く');

  // ラベル位置は anchor=center の契約どおり label.type（= box 中心）に置く。
  const groups = api.index();
  const sampleId = D.reactions[0].id;
  const group = groups[sampleId];
  assert.equal(group.getAttribute('data-id'), sampleId);
  assert.equal(group.getAttribute('tabindex'), '0');
  let labelEl = group.children.find((c) => (c.attrs['class'] || '').includes('rp-reaction__label'));
  assert.ok(labelEl, '反応名の text がある');
  const m = P_REAL.markers[sampleId];
  assert.equal(Number(labelEl.attrs.x), m.label.type.x);
  assert.equal(Number(labelEl.attrs.y), m.label.type.y);
  assert.match(labelEl.attrs['class'], /rp-reaction__label--middle/);
  assert.equal(labelEl.textContent, D.reactions[0].typeLabel, '文字は typeLabel');

  // 全 162 のヒット候補から、線上の点で反応を解決できる。
  const hits = api.hits();
  assert.equal(hits.length, 156);
  hits.forEach((c) => {
    assert.ok(groups[c.id], 'ヒット候補の id はマーカー索引にある');
    assert.ok(c.lines.length > 0 && (c.box.maxX > c.box.minX || c.box.maxY > c.box.minY),
      c.id + ' の当たり判定形状');
  });
  const hit = hits[7];
  const p = hit.lines[0][0];
  assert.equal(Core.nearestHit([hit], { x: p.x, y: p.y }, 9).id, hit.id);
});

test('[real] current ↔ proposed ↔ academic ↔ normal 復帰で位置・選択・索引・検索がずれない', () => {
  const { api } = layoutHarness({}, { proposal: P_REAL });
  assert.equal(api.initProposedLayout(), true);

  // current は canonical のまま。
  assert.deepEqual(api.compounds().map((c) => [c.id, c.x, c.y]),
    D.compounds.map((c) => [c.id, c.x, c.y]), 'current の座標は厳密に元のまま');

  // proposed は実 P の座標。
  api.setChoice('proposed');
  assert.deepEqual(api.compounds().map((c) => [c.id, c.x, c.y]),
    D.compounds.map((c) => [c.id, P_REAL.positions[c.id].x, P_REAL.positions[c.id].y]));
  assert.equal(api.state().name, 'proposed');
  D.compounds.forEach((c) => {
    assert.ok(Number.isFinite(api.positionOf(c.id).x), '選択・カードの座標: ' + c.id);
  });

  // 選択した反応は配置案の座標と canonical の facts（式・出典・名前）を同時に持つ。
  const rid = D.reactions[3].id;
  const projectedReaction = api.findReaction(rid);
  const canonicalReaction = D.reactions[3];
  assert.equal(projectedReaction.x, P_REAL.markers[rid].x);
  assert.equal(projectedReaction.y, P_REAL.markers[rid].y);
  assert.equal(projectedReaction.typeLabel, canonicalReaction.typeLabel);
  assert.equal(projectedReaction.equation, canonicalReaction.equation, 'カードの式は canonical 共有');
  assert.deepEqual(projectedReaction.sources, canonicalReaction.sources);
  assert.deepEqual(projectedReaction.substrates, canonicalReaction.substrates);

  // 強調（辺）の索引キーは通常と同一（反応 ID・端点がずれない）。
  const expectedKeys = [];
  D.reactions.forEach((r) => r.edges.forEach((e) => expectedKeys.push(r.id + '|' + e.dir + '|' + e.id)));
  const { api: domApi } = buildProposedLayer(P_REAL);
  assert.deepEqual(Object.keys(domApi.edgeIndex()).sort(), expectedKeys.sort(),
    '375 辺のキーが通常データと一致（highlight がずれない）');

  // 検索は canonical の D.compounds と nodeIndex を使う（配置切替で結果が変わらない）。
  const search = extractFunctionSource(APP_JS, 'applySearch');
  assert.match(search, /Core\.matchCompounds\(D\.compounds, query\)/);
  assert.match(search, /nodeIndex\[c\.id\]/);
  assert.equal(/activeCompounds\(\)/.test(search), false, '検索は投影座標に依存しない');

  // academic は専用配置。
  const academicLayout = {
    positions: A_DATA.layout.positions,
    regionFocus: A_DATA.layout.regionFocus || {},
    canvas: A_DATA.layout.canvas,
    normalMarkers: A_DATA.layout.normalMarkers,
    normalRoutes: A_DATA.layout.normalRoutes,
    markers: A_DATA.layout.markers,
    routes: A_DATA.layout.routes
  };
  api.loadAcademic(academicLayout);
  api.setMode('academic');
  assert.equal(api.state().name, 'current', '学術表示は専用配置');
  assert.equal(api.compoundAt('benzene').y, A_DATA.layout.positions.benzene.y);

  // normal へ戻すと配置案の選択が復元される。
  api.setMode('normal');
  assert.equal(api.state().name, 'proposed');
  assert.equal(api.compoundAt('benzene').y, P_REAL.positions.benzene.y);

  // current へ戻すと canonical に完全一致。
  api.setChoice('current');
  assert.deepEqual(api.compounds().map((c) => [c.id, c.x, c.y]),
    D.compounds.map((c) => [c.id, c.x, c.y]));
});

test('[real] 実 P を壊すと fail-closed（現在の配置を維持し、DOM を作らない）', () => {
  const mutations = [];
  const noPos = clone(P_REAL);
  delete noPos.positions[D.compounds[0].id];
  mutations.push(['positions 欠落', noPos]);
  const noMarker = clone(P_REAL);
  delete noMarker.markers[D.reactions[0].id];
  mutations.push(['markers 欠落', noMarker]);
  const noLabel = clone(P_REAL);
  delete noLabel.markers[D.reactions[0].id].label;
  mutations.push(['label 欠落', noLabel]);
  const noRoute = clone(P_REAL);
  delete noRoute.routes[Object.keys(noRoute.routes)[0]];
  mutations.push(['routes 欠落', noRoute]);
  const extraRoute = clone(P_REAL);
  extraRoute.routes['unknown|in|unknown'] = { points: [[0, 0], [1, 1]] };
  mutations.push(['routes 余剰', extraRoute]);
  const badEndpoint = clone(P_REAL);
  const key = Object.keys(badEndpoint.routes)[0];
  badEndpoint.routes[key].compound = 'not-a-compound';
  mutations.push(['端点不一致', badEndpoint]);
  const badHash = clone(P_REAL);
  badHash.base.reactionHash = '00000000';
  mutations.push(['base 不一致', badHash]);
  const badVersion = clone(P_REAL);
  badVersion.version = 2;
  mutations.push(['version 不一致', badVersion]);
  const noCanvas = clone(P_REAL);
  noCanvas.canvas = null;
  mutations.push(['canvas 欠落', noCanvas]);

  mutations.forEach(([name, proposal]) => {
    const verdict = Contract.verifyProposal(proposal, D);
    const problem = layoutHarness({}, { proposal }).api.proposedProblem(proposal);
    const { api } = layoutHarness({}, { proposal });
    const ok = api.initProposedLayout();
    const st = api.proposed();
    assert.equal(ok, false, name + ' は有効化しない');
    assert.equal(st.enabled, false, name + ' は proposedEnabled=false');
    assert.ok(st.reason, name + ' は理由を残す');
    assert.equal(api.state().name, 'current', name + ' は current のまま');
    assert.equal(api.compoundAt(D.compounds[0].id).x, D.compounds[0].x, name + ' は canonical 座標');
    assert.equal(st.all.length, 0, name + ' は反応を投影しない');
    if (name !== '端点不一致') {
      assert.equal(verdict.ok, false, name + ' は Contract でも無効');
    }
    assert.equal(typeof problem, 'string');
  });
});

test('[focus] 切替後に隠れる層の focus だけ地図へ移す（表示される層の focus は動かさない）', () => {
  const code = extractFunctionSource(APP_JS, 'moveFocusOutOfHiddenLayer');
  let focusCalls = 0;
  const mapEl = { focus() { focusCalls++; } };
  const doc = { activeElement: null };
  const state = { mode: 'normal', layoutChoice: 'current', proposedEnabled: true };

  const factory = new Function('document', 'mapEl', 'state', [
    'var mode = state.mode;',
    'var layoutChoice = state.layoutChoice;',
    'var proposedEnabled = state.proposedEnabled;',
    'function errMsg() {}',
    code,
    'return {',
    '  run: moveFocusOutOfHiddenLayer,',
    '  set: function (next) { mode = next.mode; layoutChoice = next.layoutChoice; }',
    '};'
  ].join('\n'));
  const api = factory(doc, mapEl, state);
  const elementIn = (layers) => ({ closest: (sel) => (layers[sel] ? {} : null) });

  const cases = [
    // focus が隠れる層 → 地図へ移す
    [{ mode: 'normal', layoutChoice: 'proposed' }, '.rp-layout-normal', 1],
    [{ mode: 'normal', layoutChoice: 'current' }, '.rp-proposed', 1],
    [{ mode: 'academic', layoutChoice: 'current' }, '.rp-layout-normal', 1],
    [{ mode: 'academic', layoutChoice: 'current' }, '.rp-proposed', 1],
    [{ mode: 'normal', layoutChoice: 'proposed' }, '.rp-academic', 1],
    // focus が表示される層 → 動かさない
    [{ mode: 'normal', layoutChoice: 'proposed' }, '.rp-proposed', 0],
    [{ mode: 'normal', layoutChoice: 'current' }, '.rp-layout-normal', 0],
    [{ mode: 'academic', layoutChoice: 'current' }, '.rp-academic', 0],
    // 地図の外・地図自身 → 動かさない
    [{ mode: 'normal', layoutChoice: 'proposed' }, null, 0]
  ];
  cases.forEach(([next, selector, expected]) => {
    api.set(next);
    doc.activeElement = selector ? elementIn({ [selector]: true }) : { closest: () => null };
    focusCalls = 0;
    api.run();
    assert.equal(focusCalls, expected,
      JSON.stringify(next) + ' focus=' + selector + ' の map.focus 回数');
  });
  // 表示中（visible）判定は layoutChoice と proposedEnabled に従う。
  api.set({ mode: 'normal', layoutChoice: 'proposed' });
  doc.activeElement = elementIn({ '.rp-layout-normal': true });
  focusCalls = 0;
  api.run();
  assert.equal(focusCalls, 1, '配置案が有効なときの通常層は hidden');
});

test('[order] index.html は data.js → proposal-contract.js → proposed-layout-data.js → map-core.js → app.js の順で読む', () => {
  const scripts = [...INDEX_HTML.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data.js',
    'academic-data.js',
    'proposal-contract.js',
    'proposed-layout-data.js',
    'reaction-groups.js',
    'map-core.js',
    'structure-draw.js',
    'app.js'
  ]);
  assert.ok(INDEX_HTML.indexOf('proposal-contract.js') < INDEX_HTML.indexOf('app.js'));
  assert.ok(INDEX_HTML.indexOf('proposed-layout-data.js') > INDEX_HTML.indexOf('academic-data.js'));
  assert.ok(INDEX_HTML.indexOf('proposed-layout-data.js') < INDEX_HTML.indexOf('map-core.js'));
  assert.match(APP_JS, /window\.RPMapProposalContract/);
  assert.match(extractFunctionSource(APP_JS, 'proposedLayoutProblem'), /Contract\.verifyProposal\(layout, D\)/,
    '検証は共通 module を使う（重複実装しない）');
});
