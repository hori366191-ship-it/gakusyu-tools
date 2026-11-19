/**
 * app11-3d-sphere — ページ構成・反応式の収め方・アクセシビリティの回帰テスト
 * 実行: node --test scripts/tests/app11-3d-sphere-page.test.cjs
 *
 * 対象:
 *   site/app11/3d/index.html
 *   site/app11/3d/sphere.css
 *   site/app11/3d/equation-fit.js
 *   site/app11/3d/sphere-app.js（静的な契約）
 *
 * ブラウザは起動しない。DOM は equation-fit が必要とする最小の fake DOM で検証する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LAB = path.join(ROOT, 'site', 'app11', '3d');
const html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(LAB, 'sphere.css'), 'utf8');
const appSource = fs.readFileSync(path.join(LAB, 'sphere-app.js'), 'utf8');
const EQ = require(path.join(LAB, 'equation-fit.js'));

/* ------------------------------------------------------------------ *
 * 最小 fake DOM（equation-fit.js が使う API だけ）
 * ------------------------------------------------------------------ */

function makeClassList(owner) {
  const set = new Set();
  return {
    add(name) { set.add(name); },
    remove(name) { set.delete(name); },
    contains(name) { return set.has(name); },
    toggle(name, force) {
      const next = force === undefined ? !set.has(name) : !!force;
      if (next) set.add(name); else set.delete(name);
      return next;
    },
    get _set() { return set; }
  };
}

function makeElement(doc, tag) {
  const element = {
    ownerDocument: doc,
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    attributes: Object.create(null),
    listeners: Object.create(null),
    textContent: '',
    _classes: new Set(),
    appendChild(child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(handler);
    },
    dispatch(type) {
      (this.listeners[type] || []).forEach((handler) => handler({ type, target: this }));
    },
    click() { this.dispatch('click'); }
  };
  element.classList = {
    add(name) { element._classes.add(name); },
    remove(name) { element._classes.delete(name); },
    contains(name) { return element._classes.has(name); },
    toggle(name, force) {
      const next = force === undefined ? !element._classes.has(name) : !!force;
      if (next) element._classes.add(name); else element._classes.delete(name);
      return next;
    }
  };
  Object.defineProperty(element, 'className', {
    get() { return Array.from(element._classes).join(' '); },
    set(value) {
      element._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
    }
  });
  return element;
}

function makeDocument() {
  const doc = {
    createElement(tag) { return makeElement(doc, tag); }
  };
  return doc;
}

function makeContainer(doc, figures) {
  const container = makeElement(doc, 'div');
  figures.forEach((figure) => container.appendChild(figure));
  container.querySelectorAll = function (selector) {
    if (selector !== '.rp3d-eq') return [];
    return this.childNodes.filter((node) => node.classList.contains('rp3d-eq'));
  };
  return container;
}

function makeFigure(doc) {
  const figure = makeElement(doc, 'figure');
  figure.className = 'rp3d-eq';
  const caption = makeElement(doc, 'figcaption');
  caption.className = 'rp3d-eq__caption';
  caption.textContent = '反応式';
  const scroll = makeElement(doc, 'div');
  scroll.className = 'rp3d-eq__scroll';
  const svg = makeElement(doc, 'svg');
  svg.className = 'oc-eq-svg';
  scroll.appendChild(svg);
  const note = makeElement(doc, 'p');
  note.className = 'rp3d-eq__note';
  note.textContent = '条件: 触媒';
  figure.appendChild(caption);
  figure.appendChild(scroll);
  figure.appendChild(note);
  return figure;
}

/* ------------------------------------------------------------------ *
 * index.html
 * ------------------------------------------------------------------ */

test('[page] 公開版のデータと detail / renderer をそのまま読み、外部 CDN を使わない', () => {
  const required = [
    '../../shared/organic-structure.js',
    '../data.js',
    './academic-facts.js',
    '../reaction-groups.js',
    './projection.js',
    './sphere-camera.js',
    './scene-model.js',
    './renderer.js',
    './interaction.js',
    './detail.js',
    './sphere-layout.js',
    './sphere-render.js',
    './sphere-input.js',
    './sphere-dock.js',
    './equation-fit.js',
    './sphere-app.js'
  ];
  for (const src of required) {
    assert.ok(html.includes('src="' + src + '"'), src + ' が読み込まれていない');
  }
  assert.ok(!/src="https?:\/\//.test(html), '外部スクリプトを読み込んでいる');
  // 球カメラは公開投影の後、renderer の前（renderer は読み込み時の P を保持する）。
  const order = (needle) => html.indexOf('src="' + needle + '"');
  assert.ok(order('./projection.js') < order('./sphere-camera.js'));
  assert.ok(order('./sphere-camera.js') < order('./renderer.js'));
  assert.ok(order('../data.js') < order('./scene-model.js'));
  assert.ok(order('./academic-facts.js') < order('./sphere-app.js'));
  // CSS は公開版 → 球ビューの上書き順。
  const cssOrder = (needle) => html.indexOf('href="' + needle + '"');
  assert.ok(cssOrder('./app3d.css') < cssOrder('./sphere.css'));
  assert.ok(cssOrder('./detail.css') < cssOrder('./sphere.css'));
});

test('[page] 公開ページとして 2D へ戻れ、試作の noindex や design-lab 参照を持たない', () => {
  assert.ok(html.includes('id="r3d-back"') && html.includes('href="../"'));
  assert.ok(html.includes('2Dの全体マップ'));
  assert.equal(html.includes('noindex'), false, '公開ページに noindex が残っている');
  assert.equal(/ローカル試作/.test(html), false, '試作の文言が残っている');
  assert.equal(html.includes('design-lab'), false);
  assert.equal(/\.\.\/\.\.\/site\//.test(html), false, '設計ラボ前提の相対パスが残っている');
  assert.ok(html.includes('src="./academic-facts.js"'));
  assert.equal(/<script[^>]+src="[^"]*academic-data\.js"/.test(html), false);
  // 2D 学術データの入口は 3D。ビルダーリンクは 3D から 2 階層上（app10）へ。
  const detail = fs.readFileSync(path.join(LAB, 'detail.js'), 'utf8');
  assert.ok(detail.includes("var BUILDER_SAFE_PREFIX = '../../app10/'"));
  assert.equal(detail.includes('design-lab'), false);
});

test('[page] 球の外 / 球の中の明示的な切替・ARIA・ライブ領域がある', () => {
  assert.ok(/id="r3d-mode-outside"[^>]*aria-pressed="true"/.test(html));
  assert.ok(/id="r3d-mode-inside"[^>]*aria-pressed="false"/.test(html));
  assert.ok(html.includes('id="r3d-live"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(/id="r3d-canvas"[\s\S]*?aria-label="[^"]*球ビュー/.test(html));
  assert.ok(html.includes('id="s3d-fade"'));
  assert.ok(html.includes('aria-hidden="true"'));
  // 1本指の「移動」トグル（平行移動）は置かない。
  assert.ok(!html.includes('r3d-touch-move'));
});

test('[page] sphere-app.js が参照する ID はすべて index.html にある', () => {
  const ids = new Set();
  const regex = /\$\('([^']+)'\)/g;
  let match;
  while ((match = regex.exec(appSource))) ids.add(match[1]);
  ids.delete('r3d-result-');
  for (const id of ids) {
    assert.ok(html.includes('id="' + id + '"'), 'ID がない: ' + id);
  }
});

test('[page] カメラの平行移動を使わず、縮小拡大とモード切替だけを行う', () => {
  assert.ok(!/P\.panCamera/.test(appSource), 'panCamera を呼んでいる');
  assert.ok(!/touchMode|oneFingerMode/.test(appSource), '1本指の移動モードを持っている');
  assert.ok(/P\.orbitCamera|C\.orbitCamera/.test(appSource));
  assert.ok(/P\.zoomCamera|C\.zoomCamera/.test(appSource));
  assert.ok(/switchTiming/.test(appSource));
  assert.ok(/prefers-reduced-motion: reduce/.test(appSource));
  assert.ok(/enhanceEquations/.test(appSource));
});

test('[page] 掴みドラッグと X-ray がローカルモジュールに配線され、キャンセルも処理する', () => {
  assert.ok(/createGestureController/.test(appSource), 'gesture controller が配線されていない');
  assert.ok(/pointercancel/.test(appSource), 'pointercancel を処理していない');
  assert.ok(/buildSelectedXray/.test(appSource), 'X-ray overlay が配線されていない');
  assert.ok(/drawXray/.test(appSource), 'X-ray 描画が配線されていない');
  assert.ok(/pickXray/.test(appSource), 'X-ray ピックが配線されていない');
  assert.ok(/keepIds/.test(appSource), '選択関連の裏面カード保持が配線されていない');
  assert.ok(/buildRevealSnapshot/.test(appSource), 'reveal snapshot が配線されていない');
  assert.ok(/applyReveal/.test(appSource), 'reveal の fade 適用が配線されていない');
  assert.ok(/cancelReveal/.test(appSource), 'reveal のキャンセルが配線されていない');
  assert.ok(!/P\.panCamera/.test(appSource));
});

test('[page] 初期表示は球の外で、選択/検索/分類の状態をモード切替で消さない', () => {
  assert.ok(/state\.mode\s*=\s*'outside'/.test(appSource));
  // setMode は selectedId・query・region を書き換えない。
  const start = appSource.indexOf('function setMode(');
  const end = appSource.indexOf('function toggleMode(');
  const body = appSource.slice(start, end);
  assert.ok(body.length > 0);
  assert.ok(!/selectedId\s*=/.test(body), 'setMode が選択を消している');
  assert.ok(!/state\.query\s*=/.test(body), 'setMode が検索を消している');
  assert.ok(!/state\.region\s*=/.test(body), 'setMode が分類を消している');
});

/* ------------------------------------------------------------------ *
 * sphere.css（反応式カードの初期フィット）
 * ------------------------------------------------------------------ */

function ruleBodies(selector) {
  const out = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const regex = /([^{}]+)\{([^}]*)\}/g;
  let match;
  while ((match = regex.exec(source))) {
    if (match[1].split(',').map((s) => s.trim()).includes(selector)) out.push(match[2]);
  }
  return out;
}

test('[css] 反応式カードは初期状態で横スクロールせず、幅に収まる', () => {
  const scroll = ruleBodies('.rp3d-detail .rp3d-eq__scroll').join('\n');
  assert.ok(/overflow-x:\s*visible/.test(scroll), '初期の overflow-x が visible でない');
  assert.ok(!/overflow-x:\s*(auto|scroll)/.test(scroll));
  const svg = ruleBodies('.rp3d-detail .rp3d-eq__scroll .oc-eq-svg').join('\n');
  assert.ok(/min-width:\s*0/.test(svg), 'SVG に min-width が残っている');
  assert.ok(/width:\s*100%/.test(svg));
  const card = ruleBodies('.rp3d-detail .rp3d-eq').join('\n');
  assert.ok(/overflow:\s*hidden/.test(card), 'カードからのはみ出しを止めていない');
  assert.ok(/max-width:\s*100%/.test(card));
});

test('[css] 明示的に拡大したカードだけ横スクロールを許可する', () => {
  const zoomed = ruleBodies('.rp3d-eq.is-zoomed .rp3d-eq__scroll').join('\n');
  assert.ok(/overflow-x:\s*auto/.test(zoomed));
  const zoomedSvg = ruleBodies('.rp3d-detail .rp3d-eq.is-zoomed .rp3d-eq__scroll .oc-eq-svg').join('\n');
  assert.ok(/width:\s*max-content/.test(zoomedSvg));
  assert.ok(/min-width:\s*560px/.test(zoomedSvg));
  assert.ok(/\.rp3d-eq__zoom/.test(css), '拡大ボタンのスタイルがない');
});

test('[css] モード切替のフェードと reduced-motion の即時化がある', () => {
  const fade = ruleBodies('.s3d-fade').join('\n');
  assert.ok(/opacity:\s*0/.test(fade));
  assert.ok(/transition:\s*opacity/.test(fade));
  assert.ok(/\.s3d-fade\.is-on/.test(css));
  assert.ok(/prefers-reduced-motion: reduce/.test(css));
  const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
  assert.ok(/transition:\s*none/.test(reduced));
});

/* ------------------------------------------------------------------ *
 * equation-fit.js（DOM を壊さず、明示的な拡大だけを足す）
 * ------------------------------------------------------------------ */

test('[equation-fit] 既存の caption / SVG / 条件を残したまま拡大ボタンを 1 つ足す', () => {
  const doc = makeDocument();
  const figure = makeFigure(doc);
  const container = makeContainer(doc, [figure]);
  const before = figure.childNodes.slice();
  const result = EQ.enhanceEquations(container, doc);
  assert.deepEqual(result, { enhanced: 1, buttons: 1 });
  assert.equal(figure.childNodes.length, before.length + 1);
  assert.equal(figure.childNodes[0], before[0], 'caption が置き換わった');
  assert.equal(figure.childNodes[1], before[1], 'SVG ラッパーが置き換わった');
  assert.equal(figure.childNodes[2], before[2], '条件の注記が置き換わった');
  const button = figure.childNodes[figure.childNodes.length - 1];
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.textContent, EQ.ZOOM_LABEL);
  assert.equal(button.getAttribute('aria-label'), '反応式を拡大表示');
  assert.equal(figure.getAttribute('data-eqfit'), '1');
});

test('[equation-fit] 再度呼んでも二重に足さない（冪等）', () => {
  const doc = makeDocument();
  const figure = makeFigure(doc);
  const container = makeContainer(doc, [figure]);
  EQ.enhanceEquations(container, doc);
  const count = figure.childNodes.length;
  const second = EQ.enhanceEquations(container, doc);
  assert.deepEqual(second, { enhanced: 0, buttons: 1 });
  assert.equal(figure.childNodes.length, count);
});

test('[equation-fit] 拡大ボタンで is-zoomed と aria-expanded が切り替わる', () => {
  const doc = makeDocument();
  const figure = makeFigure(doc);
  const container = makeContainer(doc, [figure]);
  EQ.enhanceEquations(container, doc);
  const button = figure.childNodes[figure.childNodes.length - 1];
  button.click();
  assert.ok(figure.classList.contains('is-zoomed'));
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.textContent, EQ.RESTORE_LABEL);
  button.click();
  assert.ok(!figure.classList.contains('is-zoomed'));
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.textContent, EQ.ZOOM_LABEL);
});

test('[equation-fit] 複数の反応式カードすべてに適用し、要素がなければ 0', () => {
  const doc = makeDocument();
  const figures = [makeFigure(doc), makeFigure(doc), makeFigure(doc)];
  const container = makeContainer(doc, figures);
  const result = EQ.enhanceEquations(container, doc);
  assert.deepEqual(result, { enhanced: 3, buttons: 3 });
  for (const figure of figures) {
    assert.ok(figure.classList.contains('rp3d-eq'));
    assert.equal(figure.getAttribute('data-eqfit'), '1');
    assert.equal(figure.childNodes[figure.childNodes.length - 1].tagName, 'BUTTON');
  }
  assert.deepEqual(EQ.enhanceEquations(makeContainer(doc, []), doc), { enhanced: 0, buttons: 0 });
});
