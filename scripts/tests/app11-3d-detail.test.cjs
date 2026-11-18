/**
 * app11-3d 詳細本文（detail.js）の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-detail.test.cjs
 *
 * 対象: site/app11/3d/detail.js
 *   - 2D カードと同じ入力（site/app11 の宣言データ）から情報を作る
 *   - 酢酸（23 グループ）を 14 件で打ち切らない
 *   - 条件別グループの複数 member を保持する
 *   - 大学レベル member の scope / evidence / steps を落とさない
 *   - native <details> と遅延 SVG（最初に開くまで renderEquation を呼ばない）
 *   - builder href の制限
 *
 * ブラウザは起動しない。fake DOM で DOM 契約だけを確認する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const G = require(path.join(APP, 'reaction-groups.js'));
const S = require(path.join(LAB, 'scene-model.js'));
const Detail = require(path.join(LAB, 'detail.js'));
const Renderer = require(path.join(LAB, 'renderer.js'));
const shared = require(path.join(ROOT, 'site', 'shared', 'organic-structure.js')).canonical;

function model() {
  return S.createModel(D, A, G);
}

function deps(overrides) {
  return Object.assign({ normalData: D, academicData: A, structure: shared }, overrides || {});
}

/* ------------------------------------------------------------------
 * fake DOM（detail.js が使う範囲だけ）
 * ------------------------------------------------------------------ */

function makeDocument() {
  const doc = {
    createElement(tag) {
      return makeNode(doc, tag);
    },
    createTextNode(text) {
      return { nodeType: 3, childNodes: [], _text: String(text), get textContent() { return this._text; } };
    }
  };
  return doc;
}

function makeNode(doc, tag) {
  const node = {
    ownerDocument: doc,
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    attributes: Object.create(null),
    listeners: Object.create(null),
    className: '',
    hidden: false,
    open: false,
    _text: '',
    _html: '',
    get firstChild() { return this.childNodes.length ? this.childNodes[0] : null; },
    appendChild(child) { this.childNodes.push(child); return child; },
    removeChild(child) {
      const index = this.childNodes.indexOf(child);
      if (index >= 0) this.childNodes.splice(index, 1);
      return child;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    },
    dispatchEvent(event) {
      const list = this.listeners[event.type] || [];
      list.forEach((handler) => handler.call(this, event));
    },
    set textContent(value) {
      this._text = String(value == null ? '' : value);
      this.childNodes.length = 0;
    },
    get textContent() {
      if (this.childNodes.length) {
        return this.childNodes.map((child) => child.textContent || '').join('');
      }
      if (this._html) return this._html.replace(/<[^>]+>/g, ' ');
      return this._text;
    },
    set innerHTML(value) { this._html = String(value == null ? '' : value); },
    get innerHTML() { return this._html; }
  };
  return node;
}

function walk(node, out) {
  out = out || [];
  out.push(node);
  (node.childNodes || []).forEach((child) => {
    if (child && child.nodeType === 1) walk(child, out);
  });
  return out;
}

function byTag(root, tag) {
  return walk(root).filter((node) => node.tagName === String(tag).toUpperCase());
}

/* ------------------------------------------------------------------
 * 表示モデル
 * ------------------------------------------------------------------ */

test('[model] 酢酸は 14 件を超える全グループを持つ（打ち切りなし）', () => {
  const m = model();
  const compound = m.byId['acetic-acid'];
  assert.ok(compound);
  const view = Detail.buildView(compound, m, 'academic', deps());
  const modelGroups = m.groupsForCompound('acetic-acid', 'academic');
  assert.ok(modelGroups.length > 14, String(modelGroups.length));
  assert.equal(view.groups.length, modelGroups.length);
  assert.deepEqual(view.groups.map((group) => group.id), modelGroups.map((group) => group.id));
  assert.equal(view.compound.formula, 'C₂H₄O₂');
  assert.equal(view.compound.curriculum, true);
  assert.equal(view.compound.regionName, 'アルデヒド・ケトン・カルボン酸');
  assert.equal(view.counts.groups, modelGroups.length);
  assert.ok(view.counts.in > 0);
  assert.ok(view.counts.out > 0);
  assert.ok(view.structure.figures.length > 0);
});

test('[group] 条件別 member の条件・反応式・出典を保持する', () => {
  const m = model();
  const compound = m.byId['acetic-acid'];
  const view = Detail.buildView(compound, m, 'academic', deps());
  const group = view.groups.find((item) => item.size === 2
    && item.substrateIds.indexOf('ethanol') !== -1
    && item.productIds.indexOf('acetic-acid') !== -1);
  assert.ok(group, 'エタノール→酢酸の条件別グループ');
  assert.equal(group.members.length, 2);
  assert.deepEqual(group.members.map((member) => member.id).sort(), [
    'ethanol-dichromate-oxidation-acetic-acid',
    'ethanol-oxidation-acetic'
  ]);
  const conditions = group.members.map((member) => member.conditions);
  assert.equal(new Set(conditions).size, 2);
  for (const member of group.members) {
    assert.ok(member.equation, member.id);
    assert.ok(Array.isArray(member.reagents));
    assert.ok(member.sources.length > 0, member.id);
    assert.equal(typeof member.evidenceKind, 'string');
    assert.ok(member.tier, member.id);
  }
});

test('[academic] 大学レベル member の scope・steps・evidence を落とさない', () => {
  const m = model();
  const compound = m.byId['acetic-acid'];
  const view = Detail.buildView(compound, m, 'academic', deps());
  const academicGroups = view.groups.filter((group) => group.academicOnly);
  assert.ok(academicGroups.length > 0);
  const withScope = academicGroups.find((group) => group.members.some((member) => member.scope));
  assert.ok(withScope, 'scope を持つ大学レベルグループ');
  const member = withScope.members.find((item) => item.scope);
  assert.equal(member.academic, true);
  assert.ok(member.scope.length > 0);
  assert.equal(member.evidenceKind, 'general-rule-application');
  const withSteps = academicGroups.find((group) => group.members.some((item) => item.stepKind === 'multi-step' && item.steps.length));
  assert.ok(withSteps, 'steps を持つ大学レベルグループ');
  assert.ok(withSteps.members.some((item) => item.steps.length > 0));
  assert.equal(view.layer, 'academic');
  assert.equal(view.layerLabel, '通常＋大学レベル');

  const normalView = Detail.buildView(compound, m, 'normal', deps());
  assert.equal(normalView.groups.every((group) => !group.academicOnly), true);
  assert.ok(normalView.groups.length < view.groups.length);
});

/* ------------------------------------------------------------------
 * DOM 契約: 全グループが details、SVG は最初に開いたときだけ
 * ------------------------------------------------------------------ */

test('[dom] 全グループを native details にし、反応式 SVG は初回 open まで生成しない', () => {
  const m = model();
  const compound = m.byId['acetic-acid'];
  const doc = makeDocument();
  const container = makeNode(doc, 'div');
  container.ownerDocument = doc;

  const calls = { structure: 0, equation: 0 };
  const structure = {
    structureView: shared.structureView,
    renderStructure(...args) {
      calls.structure++;
      return shared.renderStructure(...args);
    },
    renderEquation(...args) {
      calls.equation++;
      return shared.renderEquation(...args);
    }
  };
  const view = Detail.renderBody(container, compound, m, 'academic', deps({ structure }));
  assert.ok(view);
  assert.equal(calls.equation, 0, '開く前は反応式 SVG を生成しない');
  assert.ok(calls.structure > 0, '常時見える構造は描画してよい');

  const detailRoots = byTag(container, 'div')
    .filter((node) => String(node.className || '').split(/\s+/).indexOf('rp3d-detail') !== -1);
  assert.equal(detailRoots.length, 1);
  const details = byTag(container, 'details');
  assert.equal(details.length, view.groups.length);
  assert.ok(details.length > 14);
  for (const item of details) {
    const summary = byTag(item, 'summary');
    assert.equal(summary.length, 1);
  }

  const target = details.find((item) => {
    const text = item.textContent || '';
    return text.indexOf('エタノール') !== -1 && text.indexOf('酢酸') !== -1;
  }) || details[0];
  target.open = true;
  target.dispatchEvent({ type: 'toggle' });
  assert.ok(calls.equation > 0, '初回 open で反応式 SVG を生成する');

  const afterFirst = calls.equation;
  target.dispatchEvent({ type: 'toggle' });
  assert.equal(calls.equation, afterFirst, '同じグループを再度開いても再生成しない');
});

test('[summary] 折りたたみ summary に全端点（基質→生成物）を省略なしで表示する', () => {
  const m = model();
  const compound = m.byId['acrylonitrile'];
  const doc = makeDocument();
  const container = makeNode(doc, 'div');
  container.ownerDocument = doc;
  let equationCalls = 0;
  const structure = {
    structureView: shared.structureView,
    renderStructure: shared.renderStructure,
    renderEquation(...args) {
      equationCalls++;
      return shared.renderEquation(...args);
    }
  };
  const view = Detail.renderBody(container, compound, m, 'academic', deps({ structure }));
  const multi = view.groups.find((group) => group.substrateIds.length >= 3 && group.productIds.length >= 1);
  assert.ok(multi, '多端点の実データ経路がない');
  const details = byTag(container, 'details');
  const target = details.find((item) => {
    const summary = byTag(item, 'summary')[0];
    if (!summary) return false;
    const text = summary.textContent;
    return text.indexOf(multi.typeLabel) !== -1 &&
      text.indexOf('→ 生成物:') !== -1 &&
      multi.products.every((product) => text.indexOf(product.label) !== -1);
  });
  assert.ok(target, '対象グループの details が見つからない');
  const summary = byTag(target, 'summary')[0];
  const text = summary.textContent;
  // 選択物質を含む全端点の表示名が summary に出る
  for (const endpoint of multi.substrates.concat(multi.products)) {
    assert.ok(text.indexOf(endpoint.label) !== -1, endpoint.label + ' が summary にない: ' + text);
  }
  assert.ok(text.indexOf('基質:') !== -1);
  assert.ok(text.indexOf('→ 生成物:') !== -1);
  // summary 内の専用要素に全端点が入っている（別の本文ではない）
  const endpointSpans = byTag(target, 'span')
    .filter((node) => String(node.className).indexOf('rp3d-group__endpoints') !== -1);
  assert.equal(endpointSpans.length, 1);
  assert.ok(endpointSpans[0].textContent.indexOf(multi.products[0].label) !== -1);
  // 閉じたままでは反応式 SVG を生成しない（遅延のまま）
  assert.equal(equationCalls, 0);
  // 開いても summary の端点表示は残る
  target.open = true;
  target.dispatchEvent({ type: 'toggle' });
  assert.ok(equationCalls > 0);
  assert.ok(byTag(target, 'summary')[0].textContent.indexOf('→ 生成物:') !== -1);
});

test('[summary] 生成物 ID がない経路は productNote を折りたたみに出す', () => {
  const m = model();
  const compound = m.byId['protein'];
  const doc = makeDocument();
  const container = makeNode(doc, 'div');
  container.ownerDocument = doc;
  const view = Detail.renderBody(container, compound, m, 'normal', deps());
  const group = view.groups.find((item) => item.productIds.length === 0 && item.substrateIds.length > 0);
  assert.ok(group);
  assert.ok(group.productNote);
  const details = byTag(container, 'details');
  const target = details.find((item) => {
    const summary = byTag(item, 'summary')[0];
    return summary && summary.textContent.indexOf(group.productNote) !== -1;
  });
  assert.ok(target, 'productNote が折りたたみ summary に出ていない');
  const text = byTag(target, 'summary')[0].textContent;
  assert.ok(text.indexOf('→ 生成物:') !== -1);
  assert.ok(text.indexOf(group.productNote) !== -1);
});

test('[palette] 通常=アンバー / 大学=シアン が 3D 経路と詳細カードで一致する', () => {
  const fs = require('node:fs');
  const detailCss = fs.readFileSync(path.join(LAB, 'detail.css'), 'utf8');
  const appCss = fs.readFileSync(path.join(LAB, 'app3d.css'), 'utf8');
  // 3D 側の共通色
  assert.equal(Renderer.ROUTE_INK.normal, '#ffd166');
  assert.equal(Renderer.ROUTE_INK.academic, '#48e4ff');
  assert.equal(Renderer.edgePaint('sel-normal', 0, {}).stroke, '#ffd166');
  assert.equal(Renderer.edgePaint('sel-academic', 0, {}).stroke, '#48e4ff');
  // テーマ変数の値
  assert.ok(/--r3d-accent:\s*#ffd166/i.test(appCss));
  assert.ok(/--r3d-cyan:\s*#48e4ff/i.test(appCss));
  // 詳細カードの左アクセント: 通常は accent、academic は cyan
  assert.ok(/\.rp3d-group\s*\{[^}]*border-left-color:\s*var\(--rp3d-accent\)/s.test(detailCss));
  assert.ok(/\.rp3d-group\[data-academic="true"\]\s*\{[^}]*border-left-color:\s*var\(--rp3d-cyan\)/s.test(detailCss));
  // 大学バッジもシアン（アンバーではない）
  const academicBadge = detailCss.slice(
    detailCss.indexOf('.rp3d-badge--academic'),
    detailCss.indexOf('.rp3d-badge--mixed')
  );
  assert.ok(academicBadge.includes('72, 228, 255'));
  assert.equal(academicBadge.includes('255, 209, 102'), false);
  // 共通グループは二重アクセント + 明示バッジ
  assert.ok(/\[data-mixed="true"\][^}]*box-shadow:\s*inset 2px 0 0 var\(--rp3d-cyan\)/s.test(detailCss));
});

test('[palette] academic / mixed のカード属性と教育バッジが一致する', () => {
  const m = model();
  const compound = m.byId['acetic-acid'];
  const doc = makeDocument();
  const container = makeNode(doc, 'div');
  container.ownerDocument = doc;
  const view = Detail.renderBody(container, compound, m, 'academic', deps());
  const details = byTag(container, 'details');
  assert.equal(details.length, view.groups.length);
  let academicOnly = 0;
  let mixed = 0;
  view.groups.forEach((group, index) => {
    const item = details[index];
    const summaryText = byTag(item, 'summary')[0].textContent;
    if (group.academicOnly) {
      academicOnly++;
      assert.equal(item.getAttribute('data-academic'), 'true');
      assert.equal(item.getAttribute('data-mixed'), null);
      assert.ok(summaryText.includes('大学レベル追加'));
    } else if (group.hasAcademic && group.hasNormal) {
      mixed++;
      assert.equal(item.getAttribute('data-mixed'), 'true');
      assert.equal(item.getAttribute('data-academic'), null);
      assert.ok(summaryText.includes('共通グループ'));
    } else {
      assert.equal(item.getAttribute('data-academic'), null);
      assert.equal(item.getAttribute('data-mixed'), null);
    }
  });
  assert.ok(academicOnly > 0);
  // 現在の実データに mixed グループは無いが、将来出た場合は二重アクセント +
  // 「共通グループ」バッジになる（CSS/属性の契約で担保）。
  void mixed;
});

test('[summary] モバイルでも省略記号・横スクロールにせず折り返す CSS 契約', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(path.join(LAB, 'detail.css'), 'utf8');
  const summaryBlock = css.slice(css.indexOf('.rp3d-group__summary {'), css.indexOf('.rp3d-group__summary:focus-visible'));
  assert.ok(summaryBlock.includes('white-space: normal'));
  assert.ok(summaryBlock.includes('overflow-wrap: anywhere'));
  assert.equal(/text-overflow\s*:\s*ellipsis/.test(css), false);
  assert.equal(/white-space\s*:\s*nowrap/.test(summaryBlock), false);
  const endpointBlock = css.slice(css.indexOf('.rp3d-group__endpoints {'), css.indexOf('.rp3d-group__body {'));
  assert.ok(endpointBlock.includes('display: block'));
  assert.ok(endpointBlock.includes('overflow-wrap: anywhere'));
});

test('[dom] 2D の主要情報（試薬・条件・出典・適用範囲）が本文に出る', () => {
  const m = model();
  const compound = m.byId['ethanol'];
  const doc = makeDocument();
  const container = makeNode(doc, 'div');
  container.ownerDocument = doc;
  const view = Detail.renderBody(container, compound, m, 'academic', deps());
  assert.ok(view.groups.length > 0);
  const textBefore = container.textContent;
  assert.ok(textBefore.indexOf('物質の情報') !== -1);
  assert.ok(textBefore.indexOf('分子式') !== -1);

  const details = byTag(container, 'details');
  details.forEach((item) => {
    item.open = true;
    item.dispatchEvent({ type: 'toggle' });
  });
  const text = container.textContent;
  assert.ok(text.indexOf('試薬') !== -1);
  assert.ok(text.indexOf('条件') !== -1);
  assert.ok(text.indexOf('検証記録') !== -1);
  assert.ok(text.indexOf('適用範囲') !== -1);
  assert.ok(text.indexOf('構造式') !== -1);
});

/* ------------------------------------------------------------------
 * 安全・リンク
 * ------------------------------------------------------------------ */

test('[safe] builder href は data.js の ../app10/ だけを許し、危険 URL を拒否する', () => {
  assert.equal(
    Detail.safeBuilderHref('../app10/index.html?mode=chain&focus=ethanol'),
    '../../app10/index.html?mode=chain&focus=ethanol'
  );
  assert.equal(Detail.safeBuilderHref('javascript:alert(1)'), null);
  assert.equal(Detail.safeBuilderHref('https://example.com/'), null);
  assert.equal(Detail.safeBuilderHref('//example.com/'), null);
  assert.equal(Detail.safeBuilderHref('../app10/../../secret.html'), null);
  assert.equal(Detail.safeBuilderHref('../app11/index.html'), null);
  assert.equal(Detail.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});

test('[product-note] 生成物 ID が空でも productNote を式と端点に残す', () => {
  const m = model();
  const compound = m.byId['protein'];
  assert.ok(compound);
  const view = Detail.buildView(compound, m, 'academic', deps());
  const group = view.groups.find((item) => item.id.indexOf('protein-hydrolysis') !== -1);
  assert.ok(group);
  assert.equal(group.products.length, 0);
  assert.ok(group.productNote.length > 0);
  const plan = Detail.equationPlan(group.members[0], group, Detail.__test.indexFor(deps()), deps());
  assert.equal(plan.equations[0].eq.right[0].name, 'アミノ酸類');
  assert.equal(plan.equations[0].eq.right[0].fallback, true);
  // 反応式が未収録の場合は、推測せず productNote をそのまま右辺に置く。
  const derived = Detail.equationPlan(
    { id: 'synthetic', equation: null, productNote: group.productNote, sources: [] },
    { substrateIds: ['protein'], productIds: [], productNote: group.productNote },
    Detail.__test.indexFor(deps()),
    deps()
  );
  assert.equal(derived.equations[0].eq.right[0].name, group.productNote);
  assert.equal(derived.equations[0].eq.right[0].fallback, true);
});

test('[data] scene-model の member に無い原文フィールドを反応 ID から補う', () => {
  const m = model();
  const compound = m.byId['acetaldehyde'] || m.byId['ethanal'];
  assert.ok(compound);
  const view = Detail.buildView(compound, m, 'academic', deps());
  const members = view.groups.flatMap((group) => group.members);
  assert.ok(members.length > 0);
  assert.ok(members.some((member) => member.steps.length > 0 || member.scope || member.basedOnHeld));
  assert.ok(members.every((member) => Array.isArray(member.sources)));
  assert.ok(members.every((member) => typeof member.evidenceKind === 'string'));
});
