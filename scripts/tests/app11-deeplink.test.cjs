/**
 * 有機化学ビルダー（site/app10）↔ 有機反応マップ（site/app11）の深いリンクの回帰テスト
 *
 * 実行: node --test scripts/tests/app11-deeplink.test.cjs
 *
 * - app10 は app11 の coverage-ids.js（生成 manifest）だけを読み、収録済み ID にだけ
 *   「反応経路マップで表示」リンクを出す。未収録・manifest 不在はリンクなし（fail-closed）。
 * - app11 は ?focus=ID を初期表示で1回だけ同期し、gotoEntity のスクロール・アニメーション・
 *   フォーカス復帰を使わない。以後の resize は現在の view を保持する。
 * - ブラウザ・外部API・CDNには接続しない（関数を抽出して fake DOM で駆動する）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP10 = path.join(ROOT, 'site', 'app10');
const APP11 = path.join(ROOT, 'site', 'app11');

const D10 = require(path.join(APP10, 'data.js'));
const D11 = require(path.join(APP11, 'data.js'));
const Core = require(path.join(APP11, 'map-core.js'));
const COVERED = require(path.join(APP11, 'coverage-ids.js'));
const BUILDER = require(path.join(ROOT, 'scripts', 'app11', 'build-map-data.cjs'));

function read10(name) {
  return fs.readFileSync(path.join(APP10, name), 'utf8');
}

function read11(name) {
  return fs.readFileSync(path.join(APP11, name), 'utf8');
}

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

function escHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/* ------------------------------------------------------------------
 * 生成 manifest
 * ------------------------------------------------------------------ */

test('[data] coverage-ids.js は app11 の全427物質と app10 の全427物質に一致する', () => {
  const keys = Object.keys(COVERED);
  assert.equal(keys.length, 427, '収録物質は427');
  assert.ok(keys.every((id) => COVERED[id] === true), '値はすべて true');
  assert.equal(keys.length, new Set(keys).size, 'IDが重複しない');
  assert.deepEqual(keys.slice().sort(), D11.compounds.map((c) => c.id).sort(), 'app11 data.js の全物質');
  assert.deepEqual(keys.slice().sort(), Object.keys(D10.COMPOUNDS).sort(), 'app10 data.js の全物質');
  assert.deepEqual(keys, D11.compounds.map((c) => c.id), '出力順は data.compounds と同じ');
});

test('[data] manifest は生成物と一致し、--check の対象になっている', () => {
  assert.equal(BUILDER.renderCoverageIds(BUILDER.build().compounds), read11('coverage-ids.js'),
    'coverage-ids.js が生成物と一致する（再生成が必要）');
  const file = read11('coverage-ids.js');
  assert.ok(file.includes('root.RP_COVERED_COMPOUND_IDS = factory();'), 'window へ UMD 公開');
  assert.ok(file.includes("if (typeof module === 'object' && module.exports) module.exports = factory();"),
    'CommonJS からも読める');
  assert.ok(file.includes('このファイルは scripts/app11/build-map-data.cjs が生成する'));
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'app11', 'build-map-data.cjs'), 'utf8');
  assert.ok(build.includes('OUT_COVERED_IDS'), '生成先が定義されている');
  assert.ok(build.includes('coverage-ids.js が最新ではありません'), '--check が manifest も検査する');
});

/* ------------------------------------------------------------------
 * app10: リンク生成（fake DOM）
 * ------------------------------------------------------------------ */

function loadApp10Link(covered, scriptSrcs) {
  const app = read10('app.js');
  const start = app.indexOf('// app11-coverage-link-start');
  const end = app.indexOf('// app11-coverage-link-end');
  assert.ok(start >= 0 && end > start, 'app10 のリンク処理ブロック');
  const block = app.slice(start, end);
  const factory = new Function(
    'window', 'document', 'COVERED_IDS', 'esc', 'doc',
    block + '\nreturn {' +
      'coveredCompound: coveredCompound,' +
      'mapLinkBase: function () { return mapLinkBase(doc); },' +
      'mapLinkHref: function (id) { return mapLinkHref(id, doc); },' +
      'mapLinkHtml: function (id) { return mapLinkHtml(id, doc); }' +
      '};'
  );
  const doc = {
    getElementsByTagName(name) {
      assert.equal(name, 'script');
      return scriptSrcs.map((src) => ({ getAttribute: (attr) => (attr === 'src' ? src : '') }));
    }
  };
  return factory({ RP_COVERED_COMPOUND_IDS: covered }, doc, covered, escHtml, doc);
}

const SITE_SCRIPTS = [
  './data.js', './draw.js', './chain-descriptor.js', './catalog.js',
  './motion.js', '../app11/coverage-ids.js', './app.js'
];

test('[app10] 収録済みIDだけリンクし、未収録・prototype・manifest不在はリンクなし', () => {
  const api = loadApp10Link(COVERED, SITE_SCRIPTS);
  assert.equal(api.mapLinkHref('benzene'), '../app11/?focus=benzene', '収録済みIDの相対リンク');
  assert.equal(api.mapLinkHref('no-such-compound'), '', '未収録はリンクなし');
  assert.equal(api.mapLinkHref(''), '', '空IDはリンクなし');
  assert.equal(api.mapLinkHref('__proto__'), '', '__proto__ は除外');
  assert.equal(api.mapLinkHref('constructor'), '', 'constructor は除外');
  assert.equal(api.mapLinkHref('toString'), '', '継承プロパティは除外');
  const html = api.mapLinkHtml('benzene');
  assert.ok(html.includes('target="_blank"'), '別タブで開く');
  assert.ok(html.includes('rel="noopener"'));
  assert.ok(html.includes('反応経路マップで表示'), 'リンクの用途をラベルに出す');
  assert.ok(html.includes('href="../app11/?focus=benzene"'));
  assert.equal(api.mapLinkHtml('no-such-compound'), '', '未収録はHTMLを出さない');

  const missing = loadApp10Link(null, SITE_SCRIPTS);
  assert.equal(missing.mapLinkHtml('benzene'), '', 'manifest 不在はリンクなし（fail-closed）');
  assert.equal(missing.coveredCompound('benzene'), false);

  const noScript = loadApp10Link(COVERED, ['./data.js', './app.js']);
  assert.equal(noScript.mapLinkHtml('benzene'), '', 'manifest の script が無ければリンクなし');
});

test('[app10] 全427物質のhrefはapp11でfocusとして復元でき、IDはエスケープされる', () => {
  const api = loadApp10Link(COVERED, SITE_SCRIPTS);
  for (const c of D11.compounds) {
    const href = api.mapLinkHref(c.id);
    assert.ok(href, c.id + ' のリンクがない');
    assert.equal(href.indexOf('../app11/?focus='), 0, c.id + ' のリンク先');
    assert.equal(decodeURIComponent(href.slice('../app11/?focus='.length)), c.id, c.id + ' のID復元');
  }
  const probe = Object.assign({}, COVERED);
  probe["a&b'c<d"] = true;
  const special = loadApp10Link(probe, SITE_SCRIPTS);
  const html = special.mapLinkHtml("a&b'c<d");
  assert.ok(html.includes('%26'), '& をURLエンコードする');
  assert.ok(html.includes('%3C'), '< をURLエンコードする');
  assert.ok(html.includes('&#39;'), "' をHTMLエスケープする");
  assert.equal(html.includes("href=\"../app11/?focus=a&b"), false, 'href に生の & を残さない');
});

test('[app10] design-lab から配信してもリンク先は site/app11 になる', () => {
  const lab = loadApp10Link(COVERED, [
    './data.js', './motion.js', '../../site/app11/coverage-ids.js', './app.js'
  ]);
  assert.equal(lab.mapLinkHref('benzene'), '../../site/app11/?focus=benzene');
  assert.ok(lab.mapLinkHtml('benzene').includes('href="../../site/app11/?focus=benzene"'));
});

test('[app10] 物質カードのfooterだけにリンクを足し、family/材料カードには足さない', () => {
  const app = read10('app.js');
  const card = app.slice(app.indexOf('function renderCard(c, opts)'), app.indexOf('function routeHref(id)'));
  assert.ok(card.includes('mapLinkHtml(c.id, document)'), '物質カードfooterにリンク');
  assert.ok(card.includes('oc-verify'), '既存の検証表示を残す');
  assert.ok(card.includes('PubChem') || card.includes('pubchem'), '既存のPubChem表記を残す');
  assert.ok(card.includes('ledger.html#c-'), '既存の台帳リンクを残す');
  const family = app.slice(app.indexOf('function renderFamilyCard(f)'), app.indexOf('function renderMaterialCard(m)'));
  assert.equal(family.includes('mapLinkHtml'), false, 'familyカードには足さない');
  const material = app.slice(app.indexOf('function renderMaterialCard(m)'), app.indexOf('function renderMaterialCard(m)') + 2600);
  assert.equal(material.includes('mapLinkHtml'), false, '材料カードには足さない');

  const html = read10('index.html');
  const coveredAt = html.indexOf('../app11/coverage-ids.js');
  const appAt = html.lastIndexOf('src="./app.js"');
  assert.ok(coveredAt > 0 && coveredAt < appAt, 'manifestはapp.jsより先に読み込む');
  assert.equal(html.includes('src="../app11/data.js"'), false, 'app11のdata.jsは読み込まない');
  assert.ok(read10('app.js').includes('window.RP_COVERED_COMPOUND_IDS'), 'manifestのwindow変数だけを使う');
});

/* ------------------------------------------------------------------
 * app11: ?focus= の初期同期
 * ------------------------------------------------------------------ */

function loadApp11Focus(search, options) {
  const opts = options || {};
  const app = read11('app.js');
  const source = ['fitTopInset', 'insetFitView', 'entityTarget', 'readFocusParam', 'ownsCompoundId', 'applyInitialFocus']
    .map((name) => extractFunctionSource(app, name)).join('\n');
  const compoundById = opts.compoundById || {};
  const state = {
    view: opts.view || { scale: 0.3, x: 12, y: 34 },
    setView: [],
    selected: null,
    card: null,
    initialReturnFocus: opts.returnFocus || null
  };
  const windowStub = opts.noLocation ? {} : { location: { search } };
  const factory = new Function(
    'Core', 'window', 'viewSize', 'mapTopInset', 'compoundById', 'compoundAt', 'view', 'nodeW', 'nodeH', 'state',
    [
      'var FOCUS_PARAM_MAX = 256;',
      'var returnFocus = state.initialReturnFocus;',
      'function setView(next, clamp) { state.setView.push({ next: next, clamp: clamp }); view = next; }',
      'function selectNode(kind, id) { state.selected = [kind, id]; }',
      'function openCard(kind, id) { state.card = [kind, id]; }',
      source,
      'return {',
      '  readFocusParam: readFocusParam,',
      '  ownsCompoundId: ownsCompoundId,',
      '  applyInitialFocus: applyInitialFocus,',
      '  returnFocus: function () { return returnFocus; }',
      '};'
    ].join('\n')
  );
  if (opts.rawSource) return { app: app, source: source };
  const api = factory(
    Core, windowStub, opts.viewSize || { w: 900, h: 600 }, opts.top == null ? 80 : opts.top,
    compoundById, (id) => compoundById[id] || null, state.view,
    (c) => c.w || D11.meta.nodeW,
    (c) => c.h || D11.meta.nodeH,
    state
  );
  return { api: api, state: state };
}

function compoundIndex() {
  const map = {};
  D11.compounds.forEach((c) => { map[c.id] = c; });
  return map;
}

test('[app11] ?focus= は収録IDだけを読み、空・長すぎる・壊れた値は無視する', () => {
  const { api } = loadApp11Focus('', { compoundById: compoundIndex() });
  assert.equal(api.readFocusParam('?focus=benzene'), 'benzene');
  assert.equal(api.readFocusParam('?theme=pop&focus=benzene'), 'benzene', '他のqueryと共存');
  assert.equal(api.readFocusParam('?focus=1%2C1%2C2%2C2-tetrabromoethane'), '1,1,2,2-tetrabromoethane', 'カンマ入りID');
  assert.equal(api.readFocusParam('?focus='), null, '空は無視');
  assert.equal(api.readFocusParam(''), null);
  assert.equal(api.readFocusParam(undefined), null);
  assert.equal(api.readFocusParam('?focus=' + 'a'.repeat(257)), null, '長すぎる値は無視');
  assert.equal(api.readFocusParam('?focus=' + 'a'.repeat(256)).length, 256, '上限ちょうどは許す');
  assert.doesNotThrow(() => api.readFocusParam('?focus=%E0%A4%A'), '壊れたエンコードで例外を出さない');
  assert.equal(api.ownsCompoundId('__proto__'), false);
  assert.equal(api.ownsCompoundId('constructor'), false);
  assert.equal(api.ownsCompoundId('benzene'), true);
});

test('[app11] 初期同期は対象を画面中央（toolbar余白を除いた領域）へ置き、fitへ巻き戻さない', () => {
  const compounds = compoundIndex();
  const initial = { scale: 0.3, x: 12, y: 34 };
  const { api, state } = loadApp11Focus('?focus=benzene', {
    compoundById: compounds, view: initial, viewSize: { w: 900, h: 600 }, top: 80
  });
  assert.equal(api.applyInitialFocus(), true);
  assert.equal(state.setView.length, 1, '表示の更新は1回');
  const next = state.setView[0].next;
  assert.equal(state.setView[0].clamp, true);
  assert.ok(next.scale >= 0.92, '拡大率は0.92以上: ' + next.scale);
  assert.notDeepEqual(next, initial, '俯瞰fitのままにしない');
  assert.notEqual(next.scale, initial.scale);
  const c = compounds.benzene;
  const screen = Core.worldToScreen(next, c.x + (c.w || D11.meta.nodeW) / 2, c.y + (c.h || D11.meta.nodeH) / 2);
  assert.ok(Math.abs(screen.x - 900 / 2) < 1e-6, '横は画面中央');
  assert.ok(Math.abs(screen.y - (600 + 80) / 2) < 1e-6, '縦はtoolbar余白の下の中央: ' + screen.y);
});

test('[app11] 初期同期はカードを開いて選択し、起点なしのフォーカス復帰を残さない', () => {
  const compounds = compoundIndex();
  const { api, state } = loadApp11Focus('?focus=1%2C1%2C2%2C2-tetrabromoethane', {
    compoundById: compounds, returnFocus: { marker: 'previous-trigger' }
  });
  assert.equal(api.applyInitialFocus(), true, 'カンマ入りIDも復元できる');
  assert.deepEqual(state.selected, ['compound', '1,1,2,2-tetrabromoethane']);
  assert.deepEqual(state.card, ['compound', '1,1,2,2-tetrabromoethane']);
  assert.equal(api.returnFocus(), null, '起点が無いので復帰先を持たない');

  const { app, source } = loadApp11Focus('', { rawSource: true });
  assert.equal(source.includes('scrollIntoView'), false, 'スクロールを起こさない');
  assert.equal(source.includes('animateTo'), false, 'アニメーションを起こさない');
  assert.equal(source.includes('gotoEntity'), false, 'gotoEntityを使わない');
  assert.ok(app.includes('function openCard(kind, id)'), 'openCardの2引数signatureを変えない');
  assert.ok(app.includes('card.hidden = false'), 'カードは非モーダルのまま');
  assert.equal(app.includes('hashchange'), false, 'hashchangeの新機能は足さない');
});

test('[app11] URL未指定・未収録・prototype・壊れた値では俯瞰表示を変えない', () => {
  const compounds = compoundIndex();
  const cases = [
    '', '?theme=pop', '?focus=', '?focus=no-such-compound',
    '?focus=__proto__', '?focus=constructor', '?focus=%E0%A4%A'
  ];
  for (const search of cases) {
    const { api, state } = loadApp11Focus(search, { compoundById: compounds });
    assert.equal(api.applyInitialFocus(), false, 'search=' + search);
    assert.equal(state.setView.length, 0, search + ' で表示を動かさない');
    assert.equal(state.card, null, search + ' でカードを開かない');
  }
  const noLocation = loadApp11Focus('', { compoundById: compounds, noLocation: true });
  assert.equal(noLocation.api.applyInitialFocus(), false, 'location が無くても落ちない');
});

test('[app11] 初期同期はinitの寸法実測後に1回だけ呼び、以後のresizeはviewを保持する', () => {
  const app = read11('app.js');
  const init = app.slice(app.indexOf('function init()'), app.indexOf("if (document.readyState === 'loading')"));
  assert.equal((init.match(/applyInitialFocus\(\)/g) || []).length, 1, '初期同期は1回だけ');
  assert.ok(init.indexOf('applyInitialFocus();') > init.indexOf('syncPositionInset();'),
    '寸法実測の後に同期する');
  const observer = init.slice(init.indexOf('new ResizeObserver'), init.indexOf('syncToolbarInset();\n    syncPositionInset();'));
  assert.ok(observer.includes('setView(view, true)'), 'resizeは現在のviewを保持する');
  assert.equal(observer.includes('fitCanvasView'), false, 'resizeでfitへ戻さない');
  assert.equal(observer.includes('applyInitialFocus'), false, 'resizeで初期同期を繰り返さない');
});
