/**
 * 有機反応マップ（site/app11）— 反応式の段組みと拡大ダイアログの再発防止テスト
 *
 * 実行: node --test scripts/tests/app11-equation-dialog.test.cjs
 *
 * 対象: structure-draw.js の renderEquation({stack:true})、app.js の式figure配線・
 *       拡大dialogの開閉、index.html の dialog、CSS のカード内preview。
 * ブラウザ起動・スクリーンショット・目視は行わない（親テストの担当）。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const D = require(path.join(APP, 'data.js'));
const S = require(path.join(APP, 'structure-draw.js'));
const APP_JS = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(APP, 'structure.css'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');

const OPTS = { row: 200, maxWidth: 300, minScale: 0.55 };
const STACK_OPTS = { row: 200, maxWidth: 300, minScale: 0.55, stack: true };
const THRESHOLD = 600;

function resolveItems(items) {
  return items.map((item) => {
    if (item.kind === 'species') {
      const s = D.species[item.id];
      return { coef: item.coef, name: s.name, structure: s.structure };
    }
    if (item.kind === 'text') return { coef: item.coef, name: item.text, structure: null };
    const c = D.compounds.find((x) => x.id === item.id);
    assert.ok(c && c.structure, item.id);
    return { coef: item.coef, name: c.name, structure: c.structure };
  });
}

function viewBox(svg) {
  const m = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg);
  assert.ok(m, 'viewBox');
  return { w: Number(m[1]), h: Number(m[2]) };
}

function storedEquations() {
  const list = [];
  D.reactions.forEach((r) => {
    const eq = r.equation;
    if (eq.variants && eq.variants.length) {
      eq.variants.forEach((v) => {
        list.push({
          id: r.id + ':' + v.label,
          eq: { arrow: v.arrow, above: eq.above, below: eq.below, left: resolveItems(v.left), right: resolveItems(v.right) }
        });
      });
    } else {
      list.push({
        id: r.id,
        eq: { arrow: eq.arrow, above: eq.above, below: eq.below, left: resolveItems(eq.left), right: resolveItems(eq.right) }
      });
    }
  });
  return list;
}

function texts(svg, cls) {
  const out = [];
  const re = new RegExp('<text[^>]*class="' + cls + '"[^>]*>([^<]*)</text>', 'g');
  let m;
  while ((m = re.exec(svg))) out.push(m[1]);
  return out;
}

/* ---- 段組みの描画 ---- */

test('[layout] 短い式は1段のままで、既定のSVGは従来どおり', () => {
  const short = {
    arrow: 'to', above: '', below: '',
    left: [{ coef: 1, name: 'x', structure: D.compounds.find((c) => c.id === 'methane').structure }],
    right: []
  };
  const svg = S.renderEquation(short, 'x');
  assert.equal(viewBox(svg).h, 152, '既定の行の高さ');
  assert.equal(svg.includes('rp-eq-svg--stack'), false, '既定は段組みしない');
  const stored = storedEquations();
  const inlineWidths = stored.map(({ eq }) => viewBox(S.renderEquation(eq, 'x', OPTS)).w);
  const shortCount = inlineWidths.filter((w) => w <= THRESHOLD).length;
  assert.equal(shortCount, 7, 'カード1段のままにする短い式の数');
  assert.ok(Math.min.apply(null, inlineWidths) > 500, '最短でも501px程度');
});

test('[layout] 長い式は反応物→矢印→生成物の2段で幅が縮む（87式すべて段組み可能）', () => {
  const stored = storedEquations();
  let stacked = 0;
  stored.forEach(({ id, eq }) => {
    const inline = S.renderEquation(eq, id, OPTS);
    const stack = S.renderEquation(eq, id, STACK_OPTS);
    assert.ok(stack.includes('rp-eq-arrow'), id + ' の矢印');
    assert.equal(stack.includes('data-error="1"'), false, id + ' の構造エラー');
    assert.equal(stack.includes('rp-eq-svg--stack'), true, id + ' は段組みクラスを持つ');
    if (viewBox(inline).w > THRESHOLD) {
      stacked++;
      assert.ok(viewBox(stack).w < viewBox(inline).w, id + ' の段組みで幅が縮む');
    }
  });
  assert.equal(stacked, 156, '600px超の式は156（代替経路を含む）');
  assert.equal(APP_JS.includes('var EQUATION_STACK_MIN_WIDTH = 600;'), true, 'カード側のthreshold');
  assert.equal(APP_JS.includes('if (svgViewBoxWidth(svg) > EQUATION_STACK_MIN_WIDTH)'), true);
});

test('[layout] 段組みでも係数・＋・条件・物質の順序と件数は1段と同じ', () => {
  const target = storedEquations().find((e) => e.id === 'glycerol-stearic-esterification');
  const inline = S.renderEquation(target.eq, target.id, OPTS);
  const stack = S.renderEquation(target.eq, target.id, STACK_OPTS);
  assert.deepEqual(texts(stack, 'rp-eq-coef'), texts(inline, 'rp-eq-coef'), '係数の順序');
  assert.deepEqual(texts(stack, 'rp-eq-cond'), texts(inline, 'rp-eq-cond'), '矢印の上下の条件');
  assert.equal((stack.match(/<g transform="translate\(/g) || []).length,
    (inline.match(/<g transform="translate\(/g) || []).length, '物質の数');
  assert.equal((stack.match(/class="rp-eq-op"/g) || []).length,
    (inline.match(/class="rp-eq-op"/g) || []).length, '＋の数');
  assert.deepEqual(texts(stack, 'rp-eq-cond'), texts(inline, 'rp-eq-cond').length ? texts(inline, 'rp-eq-cond') : []);
});

test('[layout] P/n 係数・矢印の上下・文字boxのfallbackでも段組みが崩れない', () => {
  const eq = {
    arrow: 'equilibrium', above: '触媒', below: '加熱',
    left: [
      { coef: 'n', name: 'エチレン', structure: D.compounds.find((c) => c.id === 'ethene').structure },
      { coef: 1, name: 'アミノ酸類', structure: null }
    ],
    right: [{ coef: '2n', name: '生成物', structure: null }]
  };
  const svg = S.renderEquation(eq, 'polymer', STACK_OPTS);
  assert.ok(svg.includes('>n</text>'));
  assert.ok(svg.includes('>2n</text>'));
  assert.ok(svg.includes('data-eq-text="1"'), '文字box');
  assert.ok(svg.includes('>触媒</text>'));
  assert.ok(svg.includes('>加熱</text>'));
  // 可逆は縦の往復矢印（上下段の向きが分かる）
  assert.equal((svg.match(/class="rp-eq-arrow-head"/g) || []).length, 2);
  const vb = viewBox(svg);
  const coords = [];
  const re = /<g transform="translate\(([0-9.]+) ([0-9.]+)\)/g;
  let m;
  while ((m = re.exec(svg))) coords.push({ x: Number(m[1]), y: Number(m[2]) });
  assert.equal(coords.length, 3, '反応物2 + 生成物1');
  coords.forEach((p) => {
    assert.ok(p.x >= 0 && p.x <= vb.w, 'x in viewBox');
    assert.ok(p.y >= 0 && p.y <= vb.h, 'y in viewBox');
  });
  // 反応物は上段、生成物は下段
  assert.ok(coords[0].y < coords[2].y && coords[1].y < coords[2].y, '上下の段');
  // 条件は矢印の右側に置き、矢印と重ねない
  const arrowX = Number(/d="M([0-9.]+),/.exec(svg)[1]);
  const condX = Number(/<text x="([0-9.]+)"[^>]*class="rp-eq-cond"/.exec(svg)[1]);
  assert.ok(condX > arrowX, '条件は矢印の横');
  assert.ok(condX < vb.w, '条件はviewBox内');
});

test('[layout] 全103図（87反応式 + 一般16）が1段または段組みで描ける', () => {
  const figures = storedEquations().map((e) => ({ id: e.id, eq: e.eq, opts: OPTS }));
  D.classMap.edges.forEach((edge) => {
    figures.push({ id: 'class:' + edge.id, eq: edge.equation, opts: undefined });
  });
  assert.equal(figures.length, 179);
  let stackCount = 0;
  figures.forEach((fig) => {
    const single = S.renderEquation(fig.eq, fig.id, fig.opts);
    const useStack = viewBox(single).w > THRESHOLD;
    const svg = useStack ? S.renderEquation(fig.eq, fig.id, Object.assign({}, fig.opts || {}, { stack: true })) : single;
    assert.ok(svg.startsWith('<svg'), fig.id);
    assert.ok(svg.includes('rp-eq-arrow'), fig.id);
    assert.equal(svg.includes('data-error="1"'), false, fig.id);
    if (useStack) stackCount++;
  });
  assert.equal(stackCount, figures.length - 7, '600px以下の7式以外は段組み');
});

test('[layout] 段組みの物質groupは左右PAD内に収まり、3〜4項の行が右端で切れない', () => {
  const figures = storedEquations().map((e) => ({ id: e.id, eq: e.eq, opts: OPTS }));
  D.classMap.edges.forEach((edge) => {
    figures.push({ id: 'class:' + edge.id, eq: edge.equation, opts: undefined });
  });
  const PAD = 16;
  let checkedGroups = 0;
  let wideRowGroups = 0;
  figures.forEach((fig) => {
    const svg = S.renderEquation(fig.eq, fig.id, Object.assign({}, fig.opts || {}, { stack: true }));
    const vb = viewBox(svg);
    const items = fig.eq.left.concat(fig.eq.right);
    const groupRe = /<g transform="translate\(([0-9.]+) ([0-9.]+)\) scale\(([0-9.]+)\) translate\((-?[0-9.]+) (-?[0-9.]+)\)">/g;
    const groups = [];
    let m;
    while ((m = groupRe.exec(svg))) groups.push({ x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]), index: m.index });
    assert.equal(groups.length, items.length, fig.id + ' の物質group数');
    if (fig.eq.left.length >= 3 || fig.eq.right.length >= 3) wideRowGroups++;
    groups.forEach((g, i) => {
      const item = items[i];
      let width;
      if (item.structure) {
        width = S.svgGeometry(S.renderStructure(item.structure, 'x')).width;
      } else {
        const end = groups[i + 1] ? groups[i + 1].index : svg.length;
        const inner = svg.slice(g.index, end);
        const xs = [];
        const textRe = /<text x="([0-9.]+)"[^>]*class="rp-struct-schematic-text"/g;
        let t;
        while ((t = textRe.exec(inner))) xs.push(Number(t[1]));
        assert.ok(xs.length, fig.id + ' の文字box');
        width = Math.max.apply(null, xs) * 2;
      }
      const left = g.x;
      const right = g.x + width * g.scale;
      assert.ok(left >= PAD - 1, fig.id + ' group' + i + ' の左端: ' + left.toFixed(1));
      assert.ok(right <= vb.w - PAD + 1, fig.id + ' group' + i + ' の右端: ' +
        right.toFixed(1) + ' > ' + (vb.w - PAD).toFixed(1));
      checkedGroups++;
    });
  });
  assert.equal(figures.length, 179);
  assert.ok(wideRowGroups >= 3, '3項以上の行を含む式がある: ' + wideRowGroups);
  const diazo = storedEquations().find((e) => e.id === 'aniline-diazotization');
  assert.ok(diazo.eq.left.length >= 3 && diazo.eq.right.length >= 3, '両辺3項の回帰対象');
  assert.equal(checkedGroups, figures.reduce((n, f) => n + f.eq.left.length + f.eq.right.length, 0));

  // 4項の行でも右端がclipされない（幅見積りとセンタリングのgapを一致させる回帰）。
  const methane = D.compounds.find((c) => c.id === 'methane').structure;
  const four = {
    arrow: 'to', above: '', below: '',
    left: [1, 2, 3, 4].map(() => ({ coef: 1, name: 'メタン', structure: methane })),
    right: [{ coef: 1, name: 'メタン', structure: methane }]
  };
  const svg4 = S.renderEquation(four, 'four-row', STACK_OPTS);
  const vb4 = viewBox(svg4);
  const geoW = S.svgGeometry(S.renderStructure(methane, 'x')).width;
  const fourGroups = [];
  const fourRe = /<g transform="translate\(([0-9.]+) [0-9.]+\) scale\(([0-9.]+)\)/g;
  let m4;
  while ((m4 = fourRe.exec(svg4))) fourGroups.push({ x: Number(m4[1]), scale: Number(m4[2]) });
  assert.equal(fourGroups.length, 5);
  fourGroups.forEach((g) => {
    const right = g.x + geoW * g.scale;
    assert.ok(g.x >= PAD - 1, '4項の左端: ' + g.x.toFixed(1));
    assert.ok(right <= vb4.w - PAD + 1, '4項の右端: ' + right.toFixed(1) + ' > ' + (vb4.w - PAD).toFixed(1));
  });
});


/* ---- ダイアログ配線（静的） ---- */

test('[dialog] カードの式はボタンで拡大でき、dialogはカードの後に置く', () => {
  assert.match(APP_JS, /function equationFigureMarkup[\s\S]*?data-eq-open="1"[\s\S]*?aria-label="'/);
  assert.match(APP_JS, /function equationFigureBlock[\s\S]*?equationFigureMarkup\(svg, caption, note, '反応式を拡大'\)/);
  assert.match(APP_JS, /function equationFigure[\s\S]*?equationFigureMarkup\(svg, '一般反応式（構造式）'/);
  assert.ok(HTML.indexOf('id="rp-card"') < HTML.indexOf('id="rp-eq-dialog"'), 'dialogは#rp-cardの後');
  assert.match(HTML, /<dialog class="rp-eq-dialog" id="rp-eq-dialog" aria-labelledby="rp-eq-dialog-title">/);
  assert.match(HTML, /id="rp-eq-dialog-close"/);
  // 常設の「拡大できます」注記は増やさない
  assert.equal(/拡大できます/.test(HTML) || /拡大できます/.test(APP_JS), false);
});

test('[dialog] 段組みSVGを同一cloneで渡し、再renderで1段へ戻さない', () => {
  assert.match(APP_JS, /var source = trigger\.querySelector \? trigger\.querySelector\('\.rp-struct__canvas svg'\) : null;/);
  assert.match(APP_JS, /eqDialogBody\.appendChild\(prepareEquationDialogSvg\(source\)\)/);
  assert.match(APP_JS, /function prepareEquationDialogSvg[\s\S]*?cloneNode\(true\)[\s\S]*?removeAttribute\('id'\)/);
  assert.match(APP_JS, /function buildCardEquationSvg[\s\S]*?svgViewBoxWidth\(svg\) > EQUATION_STACK_MIN_WIDTH[\s\S]*?REACTION_EQUATION_STACK_OPTS/);
});

test('[dialog] 背景cardの外側click・Escape・keydownから拡大dialogを壊さない', () => {
  const pointer = APP_JS.indexOf("document.addEventListener('pointerdown', function (e) {\n      if (card.hidden) return;\n      // 拡大ダイアログはモーダル。背景のカードを外側クリックで閉じない。\n      if (eqDialogEl && eqDialogEl.open) return;\n      if (card.contains(e.target)) return;");
  assert.ok(pointer > 0, 'カード外clickのguardがcontainsより前');
  assert.match(APP_JS, /if \(e\.key === 'Escape'\) \{\n        \/\/ ダイアログの Escape は native の閉じ処理に任せる（フォーカスも native が戻す）。\n        if \(eqDialogEl && eqDialogEl\.open\) return;/);
  assert.match(APP_JS, /eqDialogEl\.addEventListener\('close', onEquationDialogClose\)/);
  assert.match(APP_JS, /function onEquationDialogClose\(\)[\s\S]*?clearEquationDialogBody\(\)[\s\S]*?opener\.focus\(\)/);
});

test('[dialog] カードを閉じる経路では式dialogを閉じるが、隠れたopenerへfocusしない', () => {
  assert.match(APP_JS, /function closeCard\(restore\) \{\n    if \(card\.hidden\) return;\n    closeEquationDialog\(false\);/);
  assert.match(APP_JS, /function openCard\(kind, id\) \{\n    \/\/ 別の実体へ移るときは、前の式の拡大ダイアログを残さない。\n    closeEquationDialog\(false\);/);
  assert.match(APP_JS, /function openAbout\(\) \{\n    if \(!aboutEl\) return;\n    closeEquationDialog\(false\);/);
  assert.match(APP_JS, /function closeEquationDialog\(restoreFocus\) \{[\s\S]*?restoreFocus !== false && opener && !card\.hidden && document\.contains\(opener\)/);
  assert.match(APP_JS, /function onEquationDialogClose\(\) \{[\s\S]*?!card\.hidden && document\.contains\(opener\)/);
});

/* ---- 拡大dialogの開閉（fake DOMで実挙動） ---- */

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

function makeDialogHarness() {
  const calls = { focus: 0, popover: 0, clone: 0, removedIds: 0 };
  let closeHandler = null;

  const caption = { textContent: '反応式（構造式）' };
  const figure = { querySelector(sel) { return sel === '.rp-struct__caption' ? caption : null; } };

  const clone = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return name === 'viewBox' ? '0 0 640 480' : (this.attrs[name] || null); },
    removeAttribute(name) { delete this.attrs[name]; },
    querySelectorAll(sel) {
      if (sel !== '[id]') return [];
      calls.removedIds++;
      return [{ removeAttribute() { calls.removedIds++; } }];
    }
  };
  const source = {
    cloneNode(deep) {
      assert.equal(deep, true, 'SVGは深いclone');
      calls.clone++;
      return clone;
    }
  };
  const trigger = {
    querySelector(sel) { return sel === '.rp-struct__canvas svg' ? source : null; },
    closest(sel) { return sel === '.rp-eq-fig' ? figure : null; },
    focus() { calls.focus++; }
  };
  const closeButton = { focus() { calls.focus++; } };

  const body = {
    children: [],
    get firstChild() { return this.children[0] || null; },
    appendChild(node) { this.children.push(node); return node; },
    removeChild(node) { this.children = this.children.filter((c) => c !== node); return node; }
  };
  const title = { textContent: '' };
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() {
      this.open = false;
      if (closeHandler) closeHandler();
    },
    removeAttribute() { this.open = false; },
    addEventListener(name, fn) { if (name === 'close') closeHandler = fn; },
    dispatchClose() { if (closeHandler) closeHandler(); }
  };
  const card = { hidden: false };
  const documentStub = { contains() { return true; } };

  const src = ['clearEquationDialogBody', 'prepareEquationDialogSvg', 'equationFigureCaption',
    'openEquationDialog', 'closeEquationDialog', 'onEquationDialogClose']
    .map((name) => extractFunctionSource(APP_JS, name)).join('\n');
  const factory = new Function('document', 'eqDialogEl', 'eqDialogBody', 'eqDialogTitle', 'eqDialogClose',
    'closePositionPopover', 'card',
    'var eqDialogOpener = null;\n' + src +
    '\nreturn { openEquationDialog: openEquationDialog, closeEquationDialog: closeEquationDialog,' +
    ' onEquationDialogClose: onEquationDialogClose, getOpener: function () { return eqDialogOpener; } };');
  const api = factory(documentStub, dialog, body, title, closeButton, function () { calls.popover++; }, card);
  return { api, dialog, body, title, trigger, clone, card, calls, closeButton };
}

test('[dialog] tapでnative modalを開き、同じSVGのcloneを自然幅で置き、閉じると起点へ戻る', () => {
  const h = makeDialogHarness();
  assert.equal(h.api.getOpener(), null);
  h.api.openEquationDialog(h.trigger);
  assert.equal(h.dialog.open, true, 'showModalで開く');
  assert.equal(h.body.children.length, 1);
  assert.equal(h.body.children[0], h.clone, '同じcloneを置く（再renderしない）');
  assert.equal(h.clone.attrs.width, '640');
  assert.equal(h.clone.attrs.height, '480');
  assert.equal(h.title.textContent, '反応式（構造式）');
  assert.equal(h.calls.popover, 1, '現在位置popoverを閉じる');
  assert.equal(h.calls.focus, 1, '閉じるボタンへfocus');
  assert.equal(h.api.getOpener(), h.trigger, '起点を保持');

  h.api.closeEquationDialog(true);
  assert.equal(h.dialog.open, false);
  assert.equal(h.body.children.length, 0, 'cloneを破棄');
  assert.equal(h.api.getOpener(), null);
  assert.equal(h.calls.focus, 2, '起点へfocusを戻す');
});

test('[dialog] Escape相当のnative closeでも後始末し、カードが閉じていれば起点へfocusしない', () => {
  const h = makeDialogHarness();
  h.api.openEquationDialog(h.trigger);
  h.api.onEquationDialogClose();
  assert.equal(h.body.children.length, 0);
  assert.equal(h.calls.focus, 2, '開くとき+戻すとき');

  const h2 = makeDialogHarness();
  h2.api.openEquationDialog(h2.trigger);
  h2.card.hidden = true;
  h2.api.onEquationDialogClose();
  assert.equal(h2.calls.focus, 1, '隠れたカードのopenerへfocusしない');
  assert.equal(h2.body.children.length, 0);

  const h3 = makeDialogHarness();
  h3.api.openEquationDialog(h3.trigger);
  h3.card.hidden = true;
  h3.api.closeEquationDialog(false);
  assert.equal(h3.calls.focus, 1, 'closeCard経由（false）でもfocusしない');
});

/* ---- CSS ---- */

test('[css] カード内previewはoverflow hidden・全高表示、dialog本文だけ横スクロール可', () => {
  assert.match(CSS, /\.rp-eq-fig \.rp-struct__canvas\s*\{[^}]*overflow:\s*hidden/);
  assert.match(CSS, /\.rp-eq-fig \.rp-struct__canvas svg\s*\{[^}]*max-height:\s*none/);
  const eqMaxHeights = CSS.match(/\.rp-eq-fig[^{]*\{[^}]*max-height:[^;}]+/g) || [];
  assert.ok(eqMaxHeights.length > 0);
  eqMaxHeights.forEach((rule) => assert.match(rule, /max-height:\s*none/, '式previewで切らない'));
  assert.match(APP_CSS, /\.rp-eq-dialog__body\s*\{[^}]*overflow:\s*auto/);
  assert.match(APP_CSS, /\.rp-eq-dialog__body\s*\{[^}]*user-select:\s*text/);
  assert.match(APP_CSS, /\.rp-eq-dialog__body > svg\s*\{[^}]*width:\s*auto[^}]*max-width:\s*none/);
  assert.match(APP_CSS, /@media \(max-width: 760px\)[\s\S]*\.rp-eq-dialog\s*\{[^}]*width:\s*calc\(100vw - 12px\)/);
});
