/**
 * app11-3d-sphere — 反応式カードの実構造（detail.js の出力）の回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-equation.test.cjs
 *
 * 球ビューは反応式を自作せず、公開 detail.js の出力をそのまま使う。
 * ここでは実データ（酢酸）で detail.js を描画し、
 *   - 反応式カード（.rp3d-eq）が caption / SVG ラッパー / 条件注記を持つ
 *   - 複数の基質・生成物をもつグループの端点名が本文に残る
 *   - equation-fit.js が既存ノードを置き換えず、拡大ボタンだけを足す
 * を確認する。ブラウザは起動しない（fake DOM）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const LAB = path.join(ROOT, 'site', 'app11', '3d');

const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, '3d', 'academic-facts.js'));
const G = require(path.join(APP, 'reaction-groups.js'));
const S = require(path.join(APP, '3d', 'scene-model.js'));
const Detail = require(path.join(APP, '3d', 'detail.js'));
const shared = require(path.join(ROOT, 'site', 'shared', 'organic-structure.js')).canonical;
const EQ = require(path.join(LAB, 'equation-fit.js'));

/* ------------------------------------------------------------------ *
 * fake DOM（detail.js / equation-fit.js が使う範囲だけ）
 * ------------------------------------------------------------------ */

function makeDocument() {
  const doc = {
    createElement(tag) { return makeNode(doc, tag); },
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
    appendChild(child) { this.childNodes.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    },
    dispatchEvent(event) {
      (this.listeners[event.type] || []).forEach((handler) => handler.call(this, event));
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

function hasClass(node, name) {
  return String(node.className || '').split(/\s+/).includes(name);
}

function byClass(root, name) {
  return walk(root).filter((node) => hasClass(node, name));
}

function buildBody(compoundId) {
  const model = S.createModel(D, A, G);
  const compound = model.byId[compoundId];
  assert.ok(compound, compoundId);
  const doc = makeDocument();
  const container = makeNode(doc, 'div');
  container.querySelectorAll = function (selector) {
    const name = String(selector || '').replace(/^\./, '');
    return byClass(this, name);
  };
  Detail.renderBody(container, compound, model, 'academic', {
    normalData: D,
    academicData: A,
    structure: shared
  });
  // details はネイティブ開閉。開いたときだけ反応式 SVG が生成される。
  byClass(container, 'rp3d-group').forEach((details) => {
    if (details.tagName !== 'DETAILS') return;
    details.open = true;
    details.dispatchEvent({ type: 'toggle', target: details });
  });
  return { model, compound, doc, container };
}

test('[structure] 実データの反応式カードが caption / SVG / 条件注記を持つ', () => {
  const { container } = buildBody('acetic-acid');
  const figures = byClass(container, 'rp3d-eq');
  assert.ok(figures.length > 0, '反応式カードがない');
  for (const figure of figures) {
    const caption = byClass(figure, 'rp3d-eq__caption');
    assert.equal(caption.length, 1, 'caption がない');
    const scroll = byClass(figure, 'rp3d-eq__scroll');
    assert.equal(scroll.length, 1, 'SVG ラッパーがない');
    assert.ok(/<svg/.test(scroll[0].innerHTML), 'SVG が生成されていない');
    assert.ok(/oc-eq-svg/.test(scroll[0].innerHTML), '共有 canonical の SVG でない');
    const note = byClass(figure, 'rp3d-eq__note');
    assert.equal(note.length, 1, '条件・出典の注記がない');
  }
});

test('[structure] 複数の基質・生成物をもつグループの端点名が本文に残る', () => {
  const { model, compound, container } = buildBody('acetic-acid');
  const groups = model.groupsForCompound(compound.id, 'academic');
  const multi = groups.find((group) => (
    group.substrateIds.length + group.productIds.length >= 3
  ));
  assert.ok(multi, '多端点のグループがない');
  const text = container.textContent;
  for (const id of multi.substrateIds.concat(multi.productIds)) {
    const name = model.byId[id].label || model.byId[id].name;
    assert.ok(text.includes(name), '端点名が消えている: ' + name);
  }
});

test('[equation-fit] 実際の反応式カードに適用しても既存ノードを壊さない', () => {
  const { doc, container } = buildBody('acetic-acid');
  const figures = byClass(container, 'rp3d-eq');
  const before = figures.map((figure) => figure.childNodes.slice());
  const result = EQ.enhanceEquations(container, doc);
  assert.equal(result.enhanced, figures.length);
  figures.forEach((figure, index) => {
    const original = before[index];
    assert.equal(figure.childNodes.length, original.length + 1);
    original.forEach((node, position) => {
      assert.equal(figure.childNodes[position], node, '既存ノードが置き換わった');
    });
    const button = figure.childNodes[figure.childNodes.length - 1];
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.className, 'rp3d-eq__zoom');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
  });
  // 拡大しても SVG と注記は同じノードのまま。
  const first = figures[0];
  const svgWrap = byClass(first, 'rp3d-eq__scroll')[0];
  const note = byClass(first, 'rp3d-eq__note')[0];
  const button = first.childNodes[first.childNodes.length - 1];
  button.dispatchEvent({ type: 'click' });
  assert.equal(first.getAttribute('data-eqfit'), '1');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(byClass(first, 'rp3d-eq__scroll')[0], svgWrap);
  assert.equal(byClass(first, 'rp3d-eq__note')[0], note);
});
