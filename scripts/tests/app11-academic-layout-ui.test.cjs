/**
 * app11 アカデミック専用配置（layout.version 2）の UI 回帰テスト
 *
 * 実行: node --test scripts/tests/app11-academic-layout-ui.test.cjs
 *
 * 担当範囲は site/app11/app.js / app.css の runtime 切替（投影・レイヤー・選択・LOD）。
 * 幾何（positions / normalRoutes / routes の妥当性）は scripts/tests/app11-academic.test.cjs が担当する。
 *
 * - 通常モードの 427 / 86 / 207 と D の座標は一切変えない（投影は複製）。
 * - 学術モードは 264 反応（通常 86 投影＋追加 178）・628 辺を 1 つの専用レイヤーで描く。
 * - 通常レイヤーは data-mode="academic" で隠し、当たり判定・キーボード・カードも学術索引へ切り替える。
 * - layout.version が 2 でない / positions が欠けている場合は学術を無効化し、v1 overlay へ黙って落ちない。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');

const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const Core = require(path.join(APP, 'map-core.js'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}').exec(css);
  assert.ok(match, selector + ' の規則');
  return ' ' + match[1].replace(/\s+/g, ' ').trim() + ' ';
}

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

const APP_JS = read('app.js');
const APP_CSS = read('app.css');

/* ------------------------------------------------------------------
 * 配置データ（v2）。未生成のキャッシュでも UI 側の契約は fake fixture で検証する。
 * ------------------------------------------------------------------ */

function isLayoutV2(layout) {
  return !!layout && layout.version === 2;
}

// fake fixture: 全 427 を +40px 下へずらしただけの決定的な v2 配置。
function fakeLayout(data, acad) {
  const positions = {};
  data.compounds.forEach((c) => {
    positions[c.id] = { x: c.x, y: c.y + 40, w: c.w || data.meta.nodeW, h: c.h || data.meta.nodeH };
  });
  const normalMarkers = {};
  const normalRoutes = {};
  data.reactions.forEach((r) => {
    normalMarkers[r.id] = {
      x: r.x,
      y: r.y + 40,
      tier: r.tier,
      label: r.label
        ? { side: r.label.side || 'E', type: { x: r.label.type.x, y: r.label.type.y + 40 }, cond: null, box: null }
        : null
    };
    r.edges.forEach((e) => {
      normalRoutes[r.id + '|' + e.dir + '|' + e.id] = {
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
  const v1 = (acad && acad.layout) || {};
  return {
    version: 2,
    positions,
    normalMarkers,
    normalRoutes,
    markers: v1.markers || {},
    routes: v1.routes || {},
    canvas: { x: 0, y: 0, w: 8000, h: 3400 },
    regionFocus: v1.regionFocus || {},
    stats: v1.stats || {}
  };
}

const LAYOUT = isLayoutV2(A.layout) ? A.layout : fakeLayout(D, A);

function layoutCompiler() {
  const code = ['projectCompound', 'projectNormalRoute', 'projectNormalReaction', 'buildAcademicAll', 'academicLayoutProblem']
    .map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  return new Function(
    'ACADEMIC_LAYOUT_VERSION',
    code + '\nreturn { projectCompound: projectCompound, projectNormalRoute: projectNormalRoute,' +
    ' projectNormalReaction: projectNormalReaction, buildAcademicAll: buildAcademicAll,' +
    ' academicLayoutProblem: academicLayoutProblem };'
  )(2);
}

// initAcademicData が作る「追加 178」の反応オブジェクトと同じ形を fixture から組み立てる。
function academicNewReactions(layout, acad, data) {
  const markers = layout.markers || {};
  const routes = layout.routes || {};
  return acad.reactions.map((raw) => {
    const marker = markers[raw.id];
    const subs = raw.substrates || [];
    const prods = raw.products || [];
    const edges = [];
    const push = (dir, id) => {
      const route = routes[raw.id + '|' + dir + '|' + id];
      if (!route || !Array.isArray(route.points) || route.points.length < 2) return;
      edges.push({ dir: dir, id: id, tier: 'academic', points: route.points, gaps: route.gaps || [], bridges: route.bridges || [] });
    };
    subs.forEach((id) => push('in', id));
    prods.forEach((id) => push('out', id));
    return {
      id: raw.id,
      type: raw.type,
      typeLabel: raw.typeLabel,
      state: raw.state || 'academic',
      academic: true,
      tier: 'academic',
      sources: raw.sources || [],
      substrates: subs,
      products: prods,
      x: marker ? marker.x : 0,
      y: marker ? marker.y : 0,
      label: marker ? marker.label : null,
      edges: edges,
      equation: raw.equation || null
    };
  });
}

/* ------------------------------------------------------------------
 * データ契約
 * ------------------------------------------------------------------ */

test('[layout] v2 配置は 427 positions・86 normalMarkers・207 normalRoutes・178 markers・421 routes を持つ', () => {
  const p = layoutCompiler().academicLayoutProblem(LAYOUT, D.compounds, D.reactions);
  assert.equal(p, null, '通常データと整合する v2 配置: ' + p);
  assert.equal(LAYOUT.version, 2);
  assert.equal(Object.keys(LAYOUT.positions).length, 427);
  assert.equal(Object.keys(LAYOUT.normalMarkers).length, 86);
  assert.equal(Object.keys(LAYOUT.normalRoutes).length, 207);
  assert.equal(Object.keys(LAYOUT.markers).length, 178);
  assert.equal(Object.keys(LAYOUT.routes).length, 421);
  assert.ok(LAYOUT.canvas.w > 0 && LAYOUT.canvas.h > 0, '学術表示範囲');
});

test('[layout] 学術の全 264 反応・628 辺を 1 レイヤーに投影し、通常 86 の内容を保つ', () => {
  const C = layoutCompiler();
  const all = C.buildAcademicAll(LAYOUT, D.reactions, academicNewReactions(LAYOUT, A, D));
  assert.equal(all.length, 264, '通常 86 ＋ 追加 178');
  assert.equal(all.reduce((n, r) => n + r.edges.length, 0), 628, '207 ＋ 421 辺');
  assert.equal(new Set(all.map((r) => r.id)).size, 264, 'IDが重複しない');

  D.reactions.forEach((r, i) => {
    const projected = all[i];
    assert.equal(projected.id, r.id, '通常 86 の順序と ID を保つ');
    assert.notEqual(projected, r, 'canonical を置き換えない（複製）');
    assert.equal(projected.state, r.state, '確認区分を保つ');
    assert.equal(projected.equation, r.equation, '化学データ（反応式）を共有');
    assert.deepEqual(projected.sources, r.sources, '検証記録を保つ');
    assert.equal(projected.academic, false, '通常反応を学術反応にしない');
    assert.equal(projected.tier, LAYOUT.normalMarkers[r.id].tier, '元 tier は学術マーカーが保持');
    assert.equal(projected.x, LAYOUT.normalMarkers[r.id].x, '学術座標で描く');
    assert.equal(projected.edges.length, r.edges.length, '辺数を減らさない');
  });
  for (let i = D.reactions.length; i < all.length; i++) {
    assert.equal(all[i].academic, true, '追加 178 は academic');
    assert.ok(all[i].id.startsWith('academic-'));
  }
});

test('[purity] 投影・レイヤー構築の前後で D.compounds / D.reactions は完全に不変', () => {
  const hash = () => crypto.createHash('sha256')
    .update(JSON.stringify({ compounds: D.compounds, reactions: D.reactions })).digest('hex');
  const before = hash();
  const C = layoutCompiler();
  D.compounds.forEach((c) => { C.projectCompound(c, LAYOUT.positions[c.id]); });
  const all = C.buildAcademicAll(LAYOUT, D.reactions, academicNewReactions(LAYOUT, A, D));
  // 投影結果を書き換えても canonical は動かない。
  all[0].x += 999;
  all[0].edges.forEach((e) => { if (e.points.length) e.points[0][0] += 999; });
  assert.equal(hash(), before, 'D を mutate しない');
  assert.equal(D.compounds.filter((c) => c.incoming + c.outgoing === 0).length, 326);
  assert.equal(D.reactions.reduce((n, r) => n + r.edges.length, 0), 207);
});

test('[connectivity] 新たに接続する 136 は反応網の中、未接続 190 は右の棚に分かれる', () => {
  const positions = LAYOUT.positions;
  const academicIn = new Set();
  const academicOut = new Set();
  A.reactions.forEach((r) => {
    r.products.forEach((id) => academicIn.add(id));
    r.substrates.forEach((id) => academicOut.add(id));
  });
  const newly = [];
  const still = [];
  D.compounds.forEach((c) => {
    if (c.incoming + c.outgoing !== 0) return;
    if (academicIn.has(c.id) || academicOut.has(c.id)) newly.push(c.id);
    else still.push(c.id);
  });
  assert.equal(newly.length, 136, '新規接続は 136');
  assert.equal(still.length, 190, '未接続は 190');
  const maxNewlyX = Math.max(...newly.map((id) => positions[id].x));
  const minStillX = Math.min(...still.map((id) => positions[id].x));
  assert.ok(maxNewlyX < minStillX,
    '新規接続を右の棚へ残さない: ' + maxNewlyX + ' < ' + minStillX);
  // 棚の矩形が生成物に含まれる場合は、未接続がその中に収まることも確かめる。
  const shelf = (LAYOUT.canvas && LAYOUT.canvas.shelf) || LAYOUT.shelf;
  if (shelf) {
    still.forEach((id) => {
      const p = positions[id];
      assert.ok(p.x >= shelf.x && p.y >= shelf.y &&
        p.x + 136 <= shelf.x + shelf.w && p.y + 34 <= shelf.y + shelf.h, '棚の内側: ' + id);
    });
  }
});

/* ------------------------------------------------------------------
 * runtime projection（mode getter）
 * ------------------------------------------------------------------ */

function loadProjection(initialMode) {
  const code = ['projectCompound', 'activeCompoundById', 'activeCompounds', 'compoundAt', 'positionOf', 'activeRegions']
    .map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  const state = { mode: initialMode, academic: { positions: LAYOUT.positions, regionFocus: LAYOUT.regionFocus || {} } };
  const factory = new Function(
    'D', 'state',
    [
      'var mode = state.mode;',
      'var academic = state.academic;',
      'var projectedCache = null;',
      'var NODE_W = D.meta.nodeW, NODE_H = D.meta.nodeH;',
      'function nodeW(c) { return c.w || NODE_W; }',
      'function nodeH(c) { return c.h || NODE_H; }',
      code,
      'return {',
      '  activeCompoundById: activeCompoundById,',
      '  activeCompounds: activeCompounds,',
      '  compoundAt: compoundAt,',
      '  positionOf: positionOf,',
      '  activeRegions: activeRegions,',
      '  setMode: function (next) { mode = next; projectedCache = null; },',
      '  mode: function () { return mode; }',
      '};'
    ].join('\n')
  );
  return { api: factory(D, state), state: state };
}

test('[getters] 通常は canonical、学術は複製を返し、戻すと元の座標へ完全一致する', () => {
  const hash = () => crypto.createHash('sha256').update(JSON.stringify(D.compounds)).digest('hex');
  const before = hash();
  const { api } = loadProjection('normal');

  assert.equal(api.compoundAt('benzene'), D.compounds.find((c) => c.id === 'benzene'), '通常は同一参照');
  assert.equal(api.activeCompounds().length, 427);
  assert.equal(api.activeRegions(), D.regions, '通常の分野は canonical');

  api.setMode('academic');
  const projected = api.compoundAt('benzene');
  const canonical = D.compounds.find((c) => c.id === 'benzene');
  assert.notEqual(projected, canonical, '学術は複製');
  assert.equal(projected.x, LAYOUT.positions.benzene.x);
  assert.equal(projected.y, LAYOUT.positions.benzene.y);
  assert.equal(projected.name, canonical.name, '化学データは保つ');
  assert.equal(api.positionOf('benzene').x, LAYOUT.positions.benzene.x);
  assert.equal(api.activeCompounds().length, 427, '264 反応でも物質は 427 のまま');

  // 全 427 ID が学術座標で解決できる（?focus= の対象）。
  D.compounds.forEach((c) => {
    const pos = api.positionOf(c.id);
    assert.ok(pos && Number.isFinite(pos.x) && Number.isFinite(pos.y), '学術座標: ' + c.id);
  });

  api.setMode('normal');
  assert.equal(api.compoundAt('benzene'), canonical, '通常へ戻すと同一参照');
  assert.deepEqual(
    api.activeCompounds().map((c) => [c.id, c.x, c.y]),
    D.compounds.map((c) => [c.id, c.x, c.y]),
    '通常の座標は厳密に元のまま'
  );
  assert.equal(hash(), before, 'D は不変');
});

test('[getters] 学術の分野は regionFocus の矩形と中心を使い、通常は変えない', () => {
  const { api } = loadProjection('academic');
  const regions = api.activeRegions();
  assert.equal(regions.length, D.regions.length);
  const focusIds = Object.keys(LAYOUT.regionFocus || {});
  if (!focusIds.length) return; // regionFocus 未生成の fixture では通常分野をそのまま返す
  regions.forEach((region) => {
    const box = LAYOUT.regionFocus[region.id];
    if (!box) return;
    assert.deepEqual(region.focus, box, 'focus を学術矩形へ差し替える: ' + region.id);
    assert.equal(region.center.x, box.x + box.w / 2);
    assert.equal(region.center.y, box.y + box.h / 2);
  });
  api.setMode('normal');
  assert.equal(api.activeRegions(), D.regions);
});

test('[selection] 学術だけの反応は通常へ戻すと落ち、物質と通常 86 は残る', () => {
  const compoundById = {};
  D.compounds.forEach((c) => { compoundById[c.id] = c; });
  const normalIndex = {};
  D.reactions.forEach((r) => { normalIndex[r.id] = {}; });
  const academicIndex = Object.assign({}, normalIndex);
  A.reactions.forEach((r) => { academicIndex[r.id] = {}; });
  const code = extractFunctionSource(APP_JS, 'modeHasEntity');
  const factory = new Function(
    'mode', 'compoundById', 'academicReactionIndex', 'reactionIndex',
    'function activeReactionIndex() { return mode === "academic" ? academicReactionIndex : reactionIndex; }\n' +
    code + '\nreturn modeHasEntity;'
  );
  const academicMode = factory('academic', compoundById, academicIndex, normalIndex);
  const normalMode = factory('normal', compoundById, academicIndex, normalIndex);
  const academicOnly = A.reactions[0].id;
  assert.equal(academicMode('reaction', academicOnly), true);
  assert.equal(normalMode('reaction', academicOnly), false, '学術だけの反応は通常で閉じる');
  const normalOnly = D.reactions[0].id;
  assert.equal(academicMode('reaction', normalOnly), true, '通常 86 は学術でも同じ反応として残る');
  assert.equal(normalMode('reaction', normalOnly), true);
  assert.equal(academicMode('compound', 'benzene'), true);
  assert.equal(normalMode('compound', 'benzene'), true);
  assert.equal(normalMode('compound', 'unknown-id'), false);
  assert.equal(normalMode('class', 'any'), true, '一般図は両モードで同じ');
});

test('[position] 現在位置の計算には学術座標の物質を渡す', () => {
  const { api } = loadProjection('academic');
  const compounds = api.activeCompounds();
  const target = compounds.find((c) => c.id === 'benzene');
  const view = Core.centerOn({ x: target.x, y: target.y }, { w: 136, h: 34 }, 1, 900, 600);
  const text = Core.positionText(view, api.activeRegions(), compounds, null, LAYOUT.canvas, 900, 600, null);
  const region = D.regions.find((r) => r.id === target.region);
  assert.ok(text.indexOf(region.name) !== -1, '学術座標の近傍分野を返す: ' + text);
});

/* ------------------------------------------------------------------
 * レイヤー・モード切替（静的契約）
 * ------------------------------------------------------------------ */

test('[layers] 通常レイヤーは data-layout="normal"、学術は専用レイヤーで data-mode により切替', () => {
  const buildReactions = APP_JS.slice(APP_JS.indexOf('function buildReactions()'), APP_JS.indexOf('function buildNodes()'));
  assert.match(buildReactions, /data-layout': 'normal'/);
  assert.match(buildReactions, /rp-layout-normal/);
  const buildAcademic = APP_JS.slice(APP_JS.indexOf('function buildAcademic()'), APP_JS.indexOf('function nodeCenter'));
  assert.match(buildAcademic, /rp-academic-all/);
  assert.match(buildAcademic, /data-layout': 'academic'/);
  assert.match(buildAcademic, /academicAll\.forEach/, '264 を 1 レイヤーで描く');
  assert.match(buildAcademic, /projectCompound\(c, academic\.positions\[c\.id\]\)/, '投影した物質で端点を解く');

  const hide = ruleBody(APP_CSS, '.rp-svg[data-mode="academic"] .rp-layout-normal');
  assert.match(hide, /display:\s*none/);
  const show = ruleBody(APP_CSS, '.rp-svg[data-mode="academic"] .rp-academic');
  assert.match(show, /display:\s*inline/);
});

test('[layers] 学術ラベルは level0 非表示・level1 は通常 primary のみ・level2 で全表示', () => {
  const base = ruleBody(APP_CSS, '.rp-map[data-mode="academic"] .rp-academic-all .rp-reaction__label');
  assert.match(base, /display:\s*none/);
  const level1 = ruleBody(APP_CSS,
    '.rp-map[data-mode="academic"][data-level="1"] .rp-academic-all .rp-reaction--primary .rp-reaction__label');
  assert.match(level1, /display:\s*inline/);
  const level2 = ruleBody(APP_CSS,
    '.rp-map[data-mode="academic"][data-level="2"] .rp-academic-all .rp-reaction__label');
  assert.match(level2, /display:\s*inline/);
});

test('[mode] setMode はホイール/アニメを止め、投影・レイヤー・論理選択・ダイアログを整合させる', () => {
  const src = APP_JS.slice(APP_JS.indexOf('function setMode('), APP_JS.indexOf('function readModeParam'));
  assert.match(src, /cancelWheelZoom\(\)/, '途中のホイール目標を捨てる');
  assert.match(src, /animToken \+= 1/, '進行中の fit を無効化');
  assert.match(src, /closeEquationDialog\(false\)/);
  assert.match(src, /closePositionPopover\(false\)/);
  assert.match(src, /syncNodeProjection\(\)/);
  assert.match(src, /syncModeLayers\(\)/);
  assert.match(src, /logical = selected \? \{ kind: selected\.kind, id: selected\.id \}/, '論理的な選択を保つ');
  assert.match(src, /modeHasEntity\(logical\.kind, logical\.id\)/);
  assert.match(src, /if \(cardOpen\) openCard\(logical\.kind, logical\.id\)/, 'カードを開き直す');
  assert.match(src, /else if \(cardOpen\) \{\s*closeCard\(false\)/, '学術だけの反応は閉じる');
  assert.match(src, /rp-layout-normal/, 'hidden 起点の focus を残さない');
  assert.match(src, /fitModeCanvasView\(\)/);
});

test('[mode] ノードは translate で投影し、通常へ戻すと transform を外す', () => {
  const src = APP_JS.slice(APP_JS.indexOf('function syncNodeProjection'), APP_JS.indexOf('function setLayerInteractive'));
  assert.match(src, /translate\('/);
  assert.match(src, /removeAttribute\('transform'\)/);
  assert.match(src, /querySelector\('\.rp-node__box'\)/);
  assert.match(src, /querySelector\('\.rp-node__label'\)/);
  assert.match(src, /pos\.x - c\.x/);
});

test('[mode] 当たり判定・強調・カード・移動はすべて現在モードの索引/座標を使う', () => {
  const entity = extractFunctionSource(APP_JS, 'entityElement');
  assert.match(entity, /activeReactionIndex\(\)\[id\]/, '非表示の通常マーカーを先に返さない');
  assert.equal(/reactionIndex\[id\] \|\|/.test(entity), false);
  assert.match(extractFunctionSource(APP_JS, 'updateEdgeHighlight'), /activeEdgeIndex\(\)/);
  assert.match(extractFunctionSource(APP_JS, 'showReactionStroke'), /activeConnectors\(\)/);
  assert.match(extractFunctionSource(APP_JS, 'findReaction'), /mode === 'academic'\) return academicAllById\[id\]/);
  assert.match(extractFunctionSource(APP_JS, 'fitReactionEndpoints'), /compoundAt\(cid\)/);
  assert.match(extractFunctionSource(APP_JS, 'onFocusIn'), /compoundAt\(id\)/);
  assert.match(extractFunctionSource(APP_JS, 'gotoEntity'), /compoundAt\(id\)/);
  assert.match(extractFunctionSource(APP_JS, 'applyInitialFocus'), /compoundAt\(id\)/);
  assert.match(extractFunctionSource(APP_JS, 'updatePosition'),
    /Core\.positionText\(view, activeRegions\(\), activeCompounds\(\)/, '現在位置へ投影を渡す');
  const overlay = APP_JS.slice(APP_JS.indexOf('function updateOverlay'), APP_JS.indexOf('function tryPlace'));
  assert.match(overlay, /activeCompounds\(\)/, 'node 障害物は active 位置');
  assert.match(overlay, /activeReactions\(\)/, '反応ラベルも active 索引');
  assert.match(overlay, /activeReactionIndex\(\)/);
  assert.match(extractFunctionSource(APP_JS, 'buildChips'), /activeRegionById\(region\.id\)/, 'チップは学術 focus へ');
  const lists = APP_JS.slice(APP_JS.indexOf('function buildLists'), APP_JS.indexOf('function compoundListItem'));
  assert.match(lists, /academicAll\.length/, '一覧の件数は 264');
});

test('[a11y] 学術レイヤーは aria-hidden と tabindex をモードで切り替える', () => {
  const src = APP_JS.slice(APP_JS.indexOf('function setLayerInteractive'), APP_JS.indexOf('function regionHubs'));
  assert.match(src, /aria-hidden/);
  assert.match(src, /setAttribute\('tabindex', enabled \? '0' : '-1'\)/);
  assert.match(src, /querySelectorAll\('\[data-kind\]\[role="button"\]'\)/);
  assert.match(APP_JS, /setLayerInteractive\(academicLayer, acad\)/);
  assert.match(APP_JS, /setLayerInteractive\(normalMarkerLayer, !acad\)/);
});

/* ------------------------------------------------------------------
 * fail-closed
 * ------------------------------------------------------------------ */

test('[failclosed] v1 配置・positions 欠け・normalRoutes 欠けは学術を無効化する', () => {
  const C = layoutCompiler();
  assert.equal(C.academicLayoutProblem(null, D.compounds, D.reactions), '配置データがありません。');
  assert.match(C.academicLayoutProblem({ version: 1 }, D.compounds, D.reactions), /版が古い/);

  const noPos = Object.assign({}, LAYOUT, { positions: Object.assign({}, LAYOUT.positions) });
  delete noPos.positions.benzene;
  assert.match(C.academicLayoutProblem(noPos, D.compounds, D.reactions), /位置データが欠けています: benzene/);

  const noRoute = Object.assign({}, LAYOUT, {
    normalRoutes: Object.assign({}, LAYOUT.normalRoutes)
  });
  const firstKey = Object.keys(LAYOUT.normalRoutes)[0];
  delete noRoute.normalRoutes[firstKey];
  assert.match(C.academicLayoutProblem(noRoute, D.compounds, D.reactions), /通常反応の経路がありません/);

  const noCanvas = Object.assign({}, LAYOUT, { canvas: null });
  assert.match(C.academicLayoutProblem(noCanvas, D.compounds, D.reactions), /範囲がありません/);

  // 古い v1 overlay へ黙って落ちない（meta.version では判定しない）。
  const init = APP_JS.slice(APP_JS.indexOf('function initAcademicData'), APP_JS.indexOf('function buildAcademic()'));
  assert.match(init, /academicLayoutProblem\(L, D\.compounds, D\.reactions\)/);
  assert.match(init, /academicDisabledReason = problem/);
  assert.equal(/A\.meta\.version !== 1/.test(APP_JS), false, 'v1 判定で overlay を使わない');
  assert.equal(/A\.layout && A\.layout\.markers\) \|\| \{\}/.test(APP_JS), false, 'v1 layout markers への fallback をしない');
});

test('[notice] 学術が無効な理由を画面に説明し、通常表示は維持する', () => {
  const src = APP_JS.slice(APP_JS.indexOf('function updateAcademicNotice'), APP_JS.indexOf('function refreshLists'));
  assert.match(src, /if \(!academicEnabled && academicDisabledReason\)/);
  assert.match(src, /note\.hidden = false/);
  assert.match(extractFunctionSource(APP_JS, 'updateModeButtons'), /academicDisabledReason/);
});
