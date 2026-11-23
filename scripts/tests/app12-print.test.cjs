/**
 * site/app12（学習プリント）のオフライン回帰テスト
 *
 * 実行: node --test scripts/tests/app12-print.test.cjs
 *
 * 外部API・GAS・Drive・CDN・ブラウザには接続しない。
 * 教材データ / 紙面HTML / 印刷CSS / テーマ / PDF生成（html2canvas・jsPDFはスタブ）/
 * 教室タブレット送信（request_id冪等・結果不明時の再送禁止）を検証する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.join(ROOT, 'site', 'app12');
const app = require(path.join(APP_DIR, 'app.js'));

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** materials.js と生成済み history-data.js を、ブラウザと同じ順（history-data → materials）で読み込む */
function loadMaterials(previous) {
  const sandbox = {};
  if (previous) sandbox.GakusyuPrintMaterials = previous;
  vm.runInNewContext(read('site/app12/history-data.js'), sandbox);
  vm.runInNewContext(read('site/app12/materials.js'), sandbox);
  const data = sandbox.GakusyuPrintMaterials || null;
  const history = sandbox.GakusyuPrintHistoryMaterial;
  if (!data || !history || data.fixture || !Array.isArray(data.materials)) return data;
  if (!data.materials.some((m) => m && m.id === 'tense-notes')) return data;
  if (data.materials.some((m) => m && m.id === history.id)) return data;
  return { version: data.version, materials: data.materials.concat([history]) };
}

const DATA = loadMaterials();
const MATERIAL = DATA.materials[0];
const ROWS = MATERIAL.pages[0].rows;
const IV = DATA.materials[1];
const HC = DATA.materials[2];

const EXPECTED_NAMES = [
  '過去形', '過去進行形', '過去完了形', '過去完了進行形',
  '現在形', '現在進行形', '現在完了形', '現在完了進行形',
  '未来形', '未来進行形', '未来完了形', '未来完了進行形'
];

const EXPECTED_FORMS = [
  'V-ed', 'was/were + V-ing', 'had + pp', 'had been + V-ing',
  'V', 'be + V-ing', 'have/has + pp', 'have/has been + V-ing',
  'will + V', 'will be + V-ing', 'will have + pp', 'will have been + V-ing'
];

const EXPECTED_MEANINGS = [
  ['～していた（習慣など）', '～した、～だった'],
  ['そのとき～していた'],
  ['～し続けていた（継続）', 'もう～していた（完了）', '～したことがあった（経験）'],
  ['～し続けていた(継続)'],
  ['～している(習慣・不変の真理)', '～である'],
  ['今、～している。'],
  ['～し続けている（継続）', 'もう～した（完了）', '～したことがある（経験）'],
  ['～し続けている(継続)'],
  ['～しているだろう(習慣)', '～なっているだろう'],
  ['ある時に～しているだろう'],
  ['～し続けているだろう（継続）', 'すでに～しているだろう（完了）', '～したことがあるであろう（経験）'],
  ['～し続けているだろう(継続)']
];

const EXPECTED_MARKERS = [
  ['', ''], [''],
  ['①', '②', '③'], [''],
  ['', ''], [''],
  ['①', '②', '③'], [''],
  ['', ''], [''],
  ['①', '②', '③'], ['']
];

const EXPECTED_NOTES = [
  ['', ''], [''],
  ['※状態動詞', '', ''], ['※動作動詞'],
  ['', ''], [''],
  ['※状態動詞', '', ''], ['※動作動詞'],
  ['', ''], [''],
  ['※状態動詞', '', ''], ['※動作動詞']
];

function count(haystack, needle) {
  return String(haystack).split(needle).length - 1;
}

/** vm コンテキスト越しの配列・オブジェクトを素の値に戻す（deepStrictEqual のプロトタイプ差を避ける） */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('[data] 教材は「時制のまとめノート」「不規則動詞」「中学歴史年表」の3件（時制は12行のまま）', () => {
  assert.deepEqual(Object.keys(DATA).sort(), ['materials', 'version']);
  assert.equal(DATA.materials.length, 3);
  assert.equal(DATA.materials[0].id, 'tense-notes');
  assert.equal(DATA.materials[1].id, 'irregular-verbs');
  assert.equal(DATA.materials[2].id, 'history-chronology');
  assert.equal(HC.title, '中学歴史年表');
  assert.equal(MATERIAL.title, '時制のまとめノート');
  assert.equal(MATERIAL.pages.length, 1, '時制教材はA4 1ページ');
  const page = MATERIAL.pages[0];
  assert.equal(page.kind, 'tense-table');
  assert.equal(page.rows.length, 12);
  assert.deepEqual(plain(ROWS.map((r) => r.group)), [
    'past', 'past', 'past', 'past',
    'present', 'present', 'present', 'present',
    'future', 'future', 'future', 'future'
  ]);
  assert.deepEqual(plain(ROWS.map((r) => r.name)), EXPECTED_NAMES);
  assert.deepEqual(plain(ROWS.map((r) => r.form)), EXPECTED_FORMS);
});

test('[data] 意味は原本の文言どおり（①②③の記号と※注記を保持）', () => {
  ROWS.forEach((row, i) => {
    assert.deepEqual(plain(row.meanings.map((m) => m.text)), EXPECTED_MEANINGS[i], row.name + ' の意味');
    assert.deepEqual(plain(row.meanings.map((m) => m.marker || '')), EXPECTED_MARKERS[i], row.name + ' の記号');
    assert.deepEqual(plain(row.meanings.map((m) => m.note || '')), EXPECTED_NOTES[i], row.name + ' の注記');
  });
});

test('[timeline] 現在は全行で中央・点/期間/習慣は相に応じて排他', () => {
  const pointAt = (id) => ROWS.find((r) => r.id === id).timeline;
  const simple = ['past-simple', 'present-simple', 'future-simple'];
  const progressive = ['past-progressive', 'present-progressive', 'future-progressive'];
  const perfect = [
    'past-perfect', 'present-perfect', 'future-perfect',
    'past-perfect-progressive', 'present-perfect-progressive', 'future-perfect-progressive'
  ];

  simple.forEach((id) => {
    const tl = pointAt(id);
    assert.equal(typeof tl.point, 'number', id + ' は点を持つ');
    assert.equal(typeof tl.habit, 'number', id + ' は習慣の記号を持つ');
    assert.equal(tl.block, null, id + ' は期間の帯を持たない');
    assert.ok(tl.arcs >= 1, id + ' は右へ伸びる弧を持つ');
  });
  progressive.forEach((id) => {
    const tl = pointAt(id);
    assert.equal(typeof tl.point, 'number', id + ' は点を持つ');
    assert.equal(tl.habit, null);
    assert.equal(tl.block, null);
  });
  perfect.forEach((id) => {
    const tl = pointAt(id);
    assert.equal(typeof tl.block === 'object' && tl.block !== null, true, id + ' は期間の帯を持つ');
    assert.equal(tl.point, null, id + ' は点を持たない');
    assert.equal(tl.habit, null);
  });

  // 過去 / 現在 / 未来の位置は各グループで統一され、現在は 0.5（中央）
  ['past-simple', 'past-progressive'].forEach((id) => assert.equal(pointAt(id).point, 0.18, id));
  ['present-simple', 'present-progressive'].forEach((id) => assert.equal(pointAt(id).point, 0.5, id));
  ['future-simple', 'future-progressive'].forEach((id) => assert.equal(pointAt(id).point, 0.78, id));
  assert.deepEqual(plain(pointAt('past-perfect').block), { from: 0.15, to: 0.37 });
  assert.deepEqual(plain(pointAt('past-perfect-progressive').block), plain(pointAt('past-perfect').block));
  assert.deepEqual(plain(pointAt('present-perfect').block), { from: 0.15, to: 0.5 });
  assert.deepEqual(plain(pointAt('present-perfect-progressive').block), plain(pointAt('present-perfect').block));
  assert.deepEqual(plain(pointAt('future-perfect').block), { from: 0.5, to: 0.87 });
  assert.deepEqual(plain(pointAt('future-perfect-progressive').block), plain(pointAt('future-perfect').block));

  // 過去完了の終点は現在（0.5）から全軸長の13%以上左に離し、現在完了系と見分けられるようにする
  const pastEnd = pointAt('past-perfect').block.to;
  assert.ok(pastEnd <= 0.5 - 0.13, '過去完了の終点は現在から13%以上左: ' + pastEnd);
  assert.ok(pastEnd > pointAt('past-perfect').block.from, '帯は正の長さを持つ');
  assert.equal(pastEnd, pointAt('past-perfect-progressive').block.to, '過去完了は2行で同じ終点');
  assert.equal(pointAt('present-perfect').block.to, 0.5, '現在完了の終点は現在のまま');
  assert.equal(pointAt('future-perfect').block.from, 0.5, '未来完了の開始は現在のまま');
});

test('[render] 12行の紙面HTML。時間軸は現在位置が全行一致し、形（点/帯/櫛形）で読み分けられる', () => {
  const html = app.pageHtml(MATERIAL.pages[0], MATERIAL, 0, 1);
  assert.equal(count(html, 'class="lp-sheet"'), 1);
  assert.equal(count(html, '<tr data-tense="'), 12);
  assert.equal(count(html, '<svg class="lp-tl"'), 12);
  assert.equal(count(html, 'x1="110" y1="24" x2="110" y2="31"'), 12, '現在の目盛りは全行同じ座標');
  assert.equal(count(html, '>過去</text>'), 12);
  assert.equal(count(html, '>現在</text>'), 12);
  assert.equal(count(html, '>未来</text>'), 12);
  assert.equal(count(html, 'data-marker="point"'), 6, '単純形・進行形の6行だけ点を持つ');
  assert.equal(count(html, 'data-marker="period"'), 6, '完了系の6行だけ期間の帯を持つ');
  assert.equal(count(html, 'data-marker="habit"'), 3, '習慣は単純形の3行だけ');
  assert.equal(count(html, 'clip-path="url(#'), 6, '帯の斜線は帯の内側にクリップする');

  // 色に頼らない: SVG内に色指定を置かない（黒一色はCSS側）
  assert.equal(/fill="#|stroke="#|rgb\(|hsl\(/.test(html), false, 'SVGに色を直接書かない');
  assert.equal(count(html, 'aria-label="時間軸: 過去・現在・未来。'), 12);
  assert.ok(html.includes('斜線を入れた帯で期間を示す'), '期間の読み上げ');
  assert.ok(html.includes('櫛形の記号でくり返し（習慣）を示す'), '習慣の読み上げ');

  // 原本の意味がすべて紙面に出ている
  EXPECTED_MEANINGS.forEach((list) => {
    list.forEach((text) => assert.ok(html.includes(text), '意味が出ている: ' + text));
  });
  assert.ok(html.includes('class="lp-c-name__f">was/were + V-ing</span>'));
  assert.ok(html.includes('<span class="lp-note">※動作動詞</span>'));
  assert.ok(html.includes('aria-label="時制のまとめノート 1ページ目"'));
  assert.equal(count(html, '<footer class="lp-sheet__foot">'), 1);
  assert.ok(html.includes('<span>1 / 1</span>'));
  // 紙面内に素の <header> を置かない（共通テーマの `header` 指定が紙面に当たるのを避ける）
  assert.equal(html.includes('<header'), false);
  assert.equal(count(html, '<div class="lp-sheet__head">'), 1);
});

test('[render] 過去/現在/未来の3ブロック見出しと、点/斜線帯/櫛形の凡例を紙面に持つ', () => {
  const html = app.pageHtml(MATERIAL.pages[0], MATERIAL, 0, 1);
  const groups = html.match(/<tr class="lp-group"><th scope="rowgroup" colspan="3">[^<]+<\/th><\/tr>/g) || [];
  assert.deepEqual(groups.map((g) => g.replace(/<[^>]+>/g, '')), ['過去', '現在', '未来'], '3群の見出し');
  assert.equal(count(html, '<tbody class="lp-group-body">'), 3, '群ごとにtbodyを分ける');
  const groupOrder = ['過去', '現在', '未来'].map((label) => html.indexOf('>' + label + '</th></tr>'));
  assert.deepEqual(groupOrder.slice().sort((a, b) => a - b), groupOrder, '過去→現在→未来の順');
  // 群の先頭行がその群の見出し直後にある
  ROWS.forEach((row, i) => {
    const rowAt = html.indexOf('data-tense="' + row.id + '"');
    const label = app.GROUP_LABELS[row.group] || '';
    if (i % 4 === 0) assert.ok(html.lastIndexOf('>' + label + '</th></tr>', rowAt) > 0, row.name + ' の群見出し');
  });

  // 凡例: 3記号＋ppの説明。色ではなく形で示す
  assert.equal(count(html, 'class="lp-legend__item"'), 3);
  ['点：その時点', '斜線の帯：期間', '櫛形：くり返し（習慣）'].forEach((text) => {
    assert.ok(html.includes(text), '凡例: ' + text);
  });
  assert.ok(html.includes('pp＝過去分詞'), 'ppの説明を凡例に含める');
  assert.equal(count(html, 'class="lp-legend__svg"'), 3);
  assert.ok(html.includes('class="is-point"'), '凡例の点は塗り');
  assert.equal(/rgb\(|hsl\(|#[0-9a-fA-F]{3,6}/.test(html.slice(html.indexOf('lp-legend'), html.indexOf('<table'))), false, '凡例に色指定なし');
});

test('[render] 期間の帯は右端（終端）だけ閉じ、左端は開く。斜線はclip内だけに切る', () => {
  const html = app.pageHtml(MATERIAL.pages[0], MATERIAL, 0, 1);
  const outlines = html.match(/<path class="lp-tl__period" d="([^"]+)" data-marker="period"\/>/g) || [];
  assert.equal(outlines.length, 6, '完了系6行だけが期間の帯を持つ');
  assert.equal(count(html, '<polygon class="lp-tl__period"'), 0, '閉じた四角形の輪郭は描かない');
  assert.equal(count(html, '<clipPath id='), 6, '斜線用のclipPathは残す');
  assert.equal(count(html, 'clip-path="url(#'), 6, '斜線だけを帯の内側に切る');

  outlines.forEach((tag) => {
    const d = tag.match(/d="([^"]+)"/)[1];
    assert.match(d, /^M [\d.]+ 9 H [\d.]+ V 31$/, '上辺＋終端の縦線だけの開いたpath: ' + d);
    assert.equal(/[LlZz]/.test(d), false, '左の縦線・閉じた輪郭を描かない');
  });
  // 既存の開始・終了座標は維持する（左端は開いたまま）
  assert.ok(html.includes('M 36 9 H 84 V 31'), '過去完了: 過去0.15〜0.37');
  assert.ok(html.includes('M 36 9 H 110 V 31'), '現在完了: 過去0.15〜現在');
  assert.ok(html.includes('M 106 9 H 184 V 31'), '未来完了: 現在〜0.87');

  // 過去完了の終点は現在の目盛り(110)から十分左（両過去完了行で同一）
  const pastOutlines = outlines.filter((tag) => tag.includes('H 84 V 31'));
  assert.equal(pastOutlines.length, 2, '過去完了形・過去完了進行形の2行');
  pastOutlines.forEach((tag) => {
    const endX = Number(tag.match(/H ([\d.]+) V 31/)[1]);
    assert.equal(endX, 84, '過去完了の終点x');
    assert.ok(110 - endX >= 26, '現在の目盛りから26px(=全軸長の13%)以上左: ' + (110 - endX));
  });
  pastOutlines.forEach((tag) => assert.equal(tag, pastOutlines[0], '過去完了の2行は同じ帯'));

  // 基線の目盛りは期間の帯と別に残り、3つとも読める
  assert.equal(count(html, 'x1="110" y1="24" x2="110" y2="31"'), 12, '現在の目盛り');
  assert.equal(count(html, 'x1="10" y1="22" x2="10" y2="31"'), 12, '過去の目盛り');
  assert.equal(count(html, 'x1="210" y1="22" x2="210" y2="31"'), 12, '未来の目盛り');

  // 凡例の期間記号も同じ慣例（上辺＋右の縦線、左端は開く）
  const legend = app.legendHtml();
  assert.ok(legend.includes('<path d="M 11 4 H 26 V 14"/>'), '凡例の期間記号');
  assert.equal(legend.includes('<polygon'), false, '凡例でも閉じた四角形にしない');
});

test('[render] 単純形の2本の弧は櫛形と点から別々に始まり、図の内側で滑らかに終わる', () => {
  const TL = app.timeline;
  const pctAt = (v) => TL.x0 + (TL.x1 - TL.x0) * v;

  function arcsOf(tl) {
    const svg = app.timelineSvg(tl);
    const group = svg.match(/<g class="lp-tl__arcs" aria-hidden="true">([\s\S]*?)<\/g>/);
    assert.ok(group, '弧のグループがある');
    const ds = Array.from(group[1].matchAll(/<path d="([^"]+)"/g)).map((m) => m[1]);
    assert.equal(ds.length, 2, '1行に2本');
    return ds.map((d) => {
      const m = d.match(/^M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)$/);
      assert.ok(m, '二次ベジェの放物線: ' + d);
      const n = m.slice(1).map(Number);
      return { x0: n[0], y0: n[1], cx: n[2], cy: n[3], x2: n[4], y2: n[5] };
    });
  }

  ['past-simple', 'present-simple', 'future-simple'].forEach((id) => {
    const row = ROWS.find((r) => r.id === id);
    const tl = row.timeline;
    const anchors = app.arcAnchors(tl);
    const [upper, lower] = arcsOf(tl);

    // 始点はそれぞれの記号の座標に対応する（上=櫛形の右端すぐ右、下=点の右上）
    assert.equal(upper.x0, anchors.upper.x, id + ' 上の始点x');
    assert.equal(lower.x0, anchors.lower.x, id + ' 下の始点x');
    assert.ok(Math.abs(upper.x0 - (pctAt(tl.habit) + 20)) < 0.6, id + ' 櫛形の右端+3');
    assert.ok(Math.abs(lower.x0 - (pctAt(tl.point) + 6)) < 0.6, id + ' 点の右上');
    assert.equal(upper.y0, TL.habitY + 2, id + ' 上の始点は櫛の高さ');
    assert.equal(lower.y0, TL.axisY - 3, id + ' 下の始点は点のすぐ上');
    assert.ok(upper.y0 < lower.y0, id + ' 上は下より上');

    // 終端は図の内側（はみ出して切れない）で、上下が十分に離れる
    [upper, lower].forEach((arc) => {
      assert.ok(arc.x2 <= TL.w - 4, id + ' 終端がSVG内: ' + arc.x2);
      assert.ok(arc.x2 > arc.x0 + 10, id + ' 弧の長さを確保');
      assert.ok(arc.cx > arc.x0 && arc.cx < arc.x2, id + ' 制御点は始点と終端の間');
      [arc.y0, arc.cy, arc.y2].forEach((y) => assert.ok(y >= 0 && y <= TL.h, id + ' yがSVG内: ' + y));
      // 終端の接線が縦に近くない（未来形でも「とがらない」）
      const slope = Math.abs(arc.y2 - arc.cy) / (arc.x2 - arc.cx);
      assert.ok(slope <= 1.5, id + ' 終端が滑らか: ' + slope.toFixed(2));
    });
    assert.ok(upper.y2 <= lower.y2 - 8, id + ' 終端でも上下が判別できる');
    assert.equal(upper.x2, lower.x2, id + ' 終端xは揃える');

    // 弧が立つ（制御点が上下に振れる）ことで、放物線として読める
    assert.ok(upper.cy <= 4, id + ' 上の制御点は上へ');
    assert.ok(lower.cy >= 18 && lower.cy <= 21, id + ' 下の制御点');
  });

  // 未来形は右の残距離が短いが、上・下とも弧として見える
  const future = ROWS.find((r) => r.id === 'future-simple').timeline;
  const [fu, fl] = arcsOf(future);
  assert.ok(fu.x2 - fu.x0 >= 20, '未来の上弧の長さ');
  assert.ok(fl.x2 - fl.x0 >= 35, '未来の下弧の長さ');
  assert.ok(fu.y2 < fl.cy, '上弧は下弧より上（交差しない）');
});

test('[iv-data] 不規則動詞は102語・2ページ・6表・各17行、番号は1〜102の連番', () => {
  assert.equal(IV.slug, 'irregular-verbs');
  assert.equal(IV.title, '不規則動詞');
  assert.equal(IV.orientation, 'landscape', 'A4横');
  assert.equal(IV.pages.length, 2, 'A4横2ページ');
  assert.deepEqual(plain(IV.pages.map((p) => p.kind)), ['irregular-verbs', 'irregular-verbs']);
  assert.deepEqual(plain(IV.pages.map((p) => p.caption)), ['基本 1/2', '基本・発展 2/2']);

  let tables = 0;
  let rows = 0;
  IV.pages.forEach((page) => {
    assert.equal(page.tables.length, 3, '1ページ3表');
    page.tables.forEach((table) => {
      tables += 1;
      assert.ok(Array.isArray(table.groups) && table.groups.length, '表にgroupsを持つ');
      let tableRows = 0;
      table.groups.forEach((group) => {
        assert.equal(typeof group.title, 'string');
        assert.ok(Array.isArray(group.rows) && group.rows.length);
        tableRows += group.rows.length;
      });
      assert.equal(tableRows, 17, '各表17行');
      rows += tableRows;
    });
  });
  assert.equal(tables, 6);
  assert.equal(rows, 102, '全102語');

  const all = IV.pages.flatMap((p) => p.tables.flatMap((t) => t.groups.flatMap((g) => g.rows)));
  assert.deepEqual(plain(all.map((r) => r.no)), Array.from({ length: 102 }, (_, i) => i + 1), '表示順1〜102');

  // 発音は全語に3形ぶんあり、語の下に出す
  all.forEach((row) => {
    assert.equal(row.pron.length, 3, row.b + ' の発音3形');
    row.pron.forEach((p) => assert.ok(typeof p === 'string' && p.length > 0, row.b + ' の発音が空でない'));
    ['b', 'p', 'pp', 'm'].forEach((k) => assert.ok(typeof row[k] === 'string' && row[k].length > 0, row.b + '.' + k));
  });
  // design-lab の DATA/PRON からの転記（begin は ビギン/ビギャン/ビガン）
  const begin = all.find((r) => r.b === 'begin');
  assert.deepEqual(plain(begin.pron), ['ビギン', 'ビギャン', 'ビガン']);
  assert.equal(begin.past === undefined, true);
  assert.equal(begin.p, 'began');
  assert.equal(begin.pp, 'begun');
  assert.equal(all.find((r) => r.b === 'get').pp, 'got / gotten', '「/」併記は原本どおり');
});

test('[iv-data] 型順（基本→発展／A-A-A→A-B-A→A-B-B→A-B-C→A-A-B→その他）と型内アルファベット順', () => {
  const groups = IV.pages.flatMap((p) => p.tables.flatMap((t) => t.groups));
  const meta = groups.map((g) => {
    const m = String(g.title).match(/^(基本|発展) ／ ([^　]+)/);
    assert.ok(m, '見出しにレベルと型: ' + g.title);
    return { level: m[1], type: m[2] };
  });
  const seq = [];
  meta.forEach((m) => {
    if (!seq.length || seq[seq.length - 1] !== m.level + '/' + m.type) seq.push(m.level + '/' + m.type);
  });
  assert.deepEqual(seq, [
    '基本/A-A-A', '基本/A-B-A', '基本/A-B-B', '基本/A-B-C', '基本/その他',
    '発展/A-A-A', '発展/A-B-B', '発展/A-B-C', '発展/A-A-B'
  ], '型の並び順と基本→発展');

  // 同じ型に属する語は（表をまたいでも）表示順がアルファベット順
  const buckets = {};
  groups.forEach((g, i) => {
    const key = meta[i].level + '/' + meta[i].type;
    buckets[key] = (buckets[key] || []).concat(g.rows.map((r) => r.b));
  });
  Object.keys(buckets).forEach((key) => {
    const words = buckets[key];
    assert.deepEqual(words, words.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), key + ' は型内アルファベット順');
  });

  // 語数の内訳（基本74・発展28）
  const countOf = (key) => (buckets[key] || []).length;
  assert.equal(countOf('基本/A-A-A'), 8);
  assert.equal(countOf('基本/A-B-A'), 3);
  assert.equal(countOf('基本/A-B-B'), 32);
  assert.equal(countOf('基本/A-B-C'), 30);
  assert.equal(countOf('基本/その他'), 1);
  assert.equal(countOf('発展/A-A-A'), 4);
  assert.equal(countOf('発展/A-B-B'), 15);
  assert.equal(countOf('発展/A-B-C'), 8);
  assert.equal(countOf('発展/A-A-B'), 1);
});

test('[iv-data] 表をまたぐグループは「（全N語・i/j）」「（続き・i/j）」で分割を示す', () => {
  const groups = IV.pages.flatMap((p) => p.tables.flatMap((t) => t.groups));
  const titles = groups.map((g) => g.title);

  // 分割しないグループは語数だけ
  assert.ok(titles.includes('基本 ／ A-A-A　3形同じ（8語）'), titles[0]);
  assert.ok(titles.includes('発展 ／ A-B-C　3形すべて異なる（8語）'));
  assert.ok(titles.includes('基本 ／ その他　型に当てはまらない（1語）'));

  // 分割したグループ（A-B-B基本32語=3分割 / A-B-C基本30語=3分割 / A-B-B発展15語=2分割）
  const split = plain(titles.filter((t) => /（(全\d+語・\d+\/\d+|続き・\d+\/\d+)）/.test(t)));
  assert.deepEqual(split, [
    '基本 ／ A-B-B　過去形＝過去分詞（全32語・1/3）',
    '基本 ／ A-B-B　過去形＝過去分詞（続き・2/3）',
    '基本 ／ A-B-B　過去形＝過去分詞（続き・3/3）',
    '基本 ／ A-B-C　3形すべて異なる（全30語・1/3）',
    '基本 ／ A-B-C　3形すべて異なる（続き・2/3）',
    '基本 ／ A-B-C　3形すべて異なる（続き・3/3）',
    '発展 ／ A-B-B　過去形＝過去分詞（全15語・1/2）',
    '発展 ／ A-B-B　過去形＝過去分詞（続き・2/2）'
  ]);

  // 分割されたグループの行の合計が見出しの全N語と一致する
  function partTotal(label) {
    return groups
      .filter((g) => g.title.indexOf(label) === 0)
      .reduce((n, g) => n + g.rows.length, 0);
  }
  assert.equal(partTotal('基本 ／ A-B-B'), 32);
  assert.equal(partTotal('基本 ／ A-B-C'), 30);
  assert.equal(partTotal('発展 ／ A-B-B'), 15);
});

test('[iv-render] 不規則動詞の紙面はA4横・3列・列見出し1回＋型グループごとの角丸カード', () => {
  const html = app.materialHtml(IV);
  assert.equal(count(html, 'class="lp-sheet lp-sheet--landscape"'), 2, '2ページとも横向き');
  assert.equal(count(html, 'data-orientation="landscape"'), 2);
  assert.equal(count(html, '<div class="lp-iv-grid">'), 2, 'ページごとに列のグリッド');
  assert.equal(count(html, '<div class="lp-iv-col">'), 6, '1ページ3列×2ページ');
  assert.equal(count(html, '<table class="lp-iv-headtbl">'), 6, '列見出しは1列に1回だけ');
  assert.equal(count(html, '<div class="lp-iv-card">'), 14, '型グループごとに1枚のカード');
  assert.equal(count(html, '<table class="lp-iv-cardtbl">'), 14, 'カード1枚＝table 1つ');
  assert.equal(count(html, '<thead>'), 6, 'theadは列見出しだけ（カードには付けない）');
  assert.equal(count(html, 'class="lp-iv-gap"'), 0, '旧・余白行は使わない');
  assert.equal(count(html, '<td class="lp-iv-no">'), 102, '全102行');
  assert.equal(count(html, '<span class="lp-iv-word">'), 306, '3形×102語');
  assert.equal(count(html, '<span class="lp-iv-pron">'), 306, 'カタカナも3形ぶん');
  const headers = html.match(/<thead><tr>(?:(?!<\/tr>).)*原形(?:(?!<\/tr>).)*過去分詞(?:(?!<\/tr>).)*意味(?:(?!<\/tr>).)*<\/tr><\/thead>/g) || [];
  assert.equal(headers.length, 6, '各列に # / 原形 / 過去形 / 過去分詞 / 意味 のヘッダ');
  assert.equal(count(html, '<tr class="lp-iv-grp">'), 14, 'グループ見出し行');
  assert.ok(html.includes('<th colspan="5" scope="colgroup">基本 ／ A-A-A'), '見出しはcolspan=5');
  // 見出しと各カードで同じ colgroup 幅（#5% / 3形 各24.5% / 意味21.5%）
  assert.equal(count(html, '<col class="lp-iv-col-no"><col class="lp-iv-col-form"><col class="lp-iv-col-form"><col class="lp-iv-col-form"><col class="lp-iv-col-mean">'), 20, '列見出し6＋カード14で同じ桁');
  const dataRows = html.match(/<tr>(?:(?!<\/tr>).)*?class="lp-iv-no"/g) || [];
  assert.equal(dataRows.length, 102, 'データ行は102行のまま');
  assert.ok(html.includes('<span class="lp-iv-word">be (am/is/are)</span>'));
  assert.ok(html.includes('<span class="lp-iv-pron">ビー</span>'));
  assert.ok(html.includes('<span>1 / 2</span>') && html.includes('<span>2 / 2</span>'));
  assert.ok(html.includes('aria-label="不規則動詞 1ページ目"'));

  // 凡例は1ページ目だけ
  const pages = html.split('<article ');
  assert.equal(count(pages[1], 'class="lp-iv-legend"'), 1, '1ページ目に凡例');
  assert.equal(count(pages[2], 'class="lp-iv-legend"'), 0, '2ページ目には凡例を出さない');
  assert.ok(pages[1].includes('型の見方'));
  assert.ok(pages[1].includes('A-A-A'));
  assert.ok(pages[1].includes('カタカナは代表的な発音の目安'));

  // 縦教材（時制）は従来どおり
  const portrait = app.materialHtml(MATERIAL);
  assert.equal(portrait.includes('lp-sheet--landscape'), false);
  assert.equal(portrait.includes('data-orientation'), false);
  assert.equal(count(portrait, 'class="lp-sheet"'), 1);
});

test('[iv-css] 横向き紙面・3列グリッド・カード・発音のスタイル（白地黒インク・太字/細字6pt）', () => {
  const css = read('site/app12/app.css');
  const landscape = css.match(/\.lp-sheet--landscape \{([\s\S]*?)\n\}/);
  assert.ok(landscape, '.lp-sheet--landscape の定義');
  assert.ok(/width:\s*297mm/.test(landscape[1]));
  assert.ok(/height:\s*210mm/.test(landscape[1]));
  assert.ok(/padding:\s*9mm 10mm 7mm/.test(landscape[1]), '試作と同じ余白');
  assert.equal(/var\(--lp-/.test(landscape[1]), false, '紙面の色はテーマ変数を使わない');

  const printAt = css.indexOf('@media print');
  const print = css.slice(printAt);
  assert.equal(/@page\s*\{/.test(print), false, '固定の@pageを置かない（向きはapp.jsが切り替える）');
  assert.ok(/\.lp-sheet\.lp-sheet--landscape\s*\{[^}]*width:\s*297mm/.test(print), '印刷もA4横');
  assert.ok(/\.lp-sheet\.lp-sheet--landscape\s*\{[^}]*height:\s*210mm/.test(print));

  assert.ok(/\.lp-iv-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/.test(css), '1ページ3列');
  assert.ok(/\.lp-iv-grid\s*\{[^}]*column-gap:\s*3\.5mm/.test(css), '列間3.5mm');
  assert.ok(/\.lp-iv-grid\s*\{[^}]*align-items:\s*start/.test(css));
  assert.ok(/\.lp-iv-(?:headtbl|cardtbl) \.lp-iv-col-no \{\s*width:\s*5%/.test(css));
  assert.ok(/\.lp-iv-(?:headtbl|cardtbl) \.lp-iv-col-form \{\s*width:\s*24\.5%/.test(css));
  assert.ok(/\.lp-iv-(?:headtbl|cardtbl) \.lp-iv-col-mean \{\s*width:\s*21\.5%/.test(css));
  assert.ok(/\.lp-iv-word \{[^}]*font-weight:\s*700/.test(css), '英単語は太字');
  assert.ok(/\.lp-iv-pron \{[^}]*font-weight:\s*300/.test(css), '発音は細字');
  assert.ok(/\.lp-iv-pron \{[^}]*font-size:\s*6pt/.test(css), '発音は6pt');
  assert.ok(/\.lp-iv-pron \{[^}]*text-align:\s*left/.test(css), '発音は左揃え');
  assert.ok(/\.lp-iv-cardtbl tr\.lp-iv-grp th \{[^}]*background:\s*#f2f2f2/.test(css), 'グループ見出しの帯');
  assert.ok(/\.lp-sheet \.lp-iv-cardtbl th,[\s\S]{0,200}color:\s*#111\s*!important/.test(css), '紙面は黒インク固定');
  assert.ok(/\.lp-iv-legend \{[\s\S]{0,120}display:\s*flex/.test(css), '凡例');
});

test('[iv-render] カード分割しても1ページ3列・各17行・2ページのまま（レイアウト維持）', () => {
  const html = app.materialHtml(IV);
  const pages = html.split('<article ');
  assert.equal(pages.length - 1, 2, '2ページ');
  pages.slice(1).forEach((page, i) => {
    const cols = page.split('<div class="lp-iv-col">').slice(1);
    assert.equal(cols.length, 3, (i + 1) + 'ページ目は3列');
    cols.forEach((col, j) => {
      const cardRows = (col.match(/<div class="lp-iv-card">/g) || []).length;
      const dataRows = (col.match(/<td class="lp-iv-no">/g) || []).length;
      const groupRows = (col.match(/<tr class="lp-iv-grp"/g) || []).length;
      assert.equal(dataRows, 17, (i + 1) + 'ページ目 ' + (j + 1) + '列目のデータ行');
      assert.equal((col.match(/<table class="lp-iv-headtbl">/g) || []).length, 1, '列見出しは列ごとに1回');
      assert.equal(cardRows, groupRows, 'カード1枚＝グループ見出し1行');
      assert.ok(cardRows >= 1 && cardRows <= 4, 'カードは1〜4枚に収まる: ' + cardRows);
      // カードは必ずグループ見出し行から始まる
      assert.equal((col.match(/<tbody><tr class="lp-iv-grp">/g) || []).length, cardRows);
    });
  });
});

test('[iv-css] カード間は罫線の通らない白余白・カードは角丸・外周0.2mm・横線のみ', () => {
  const css = read('site/app12/app.css');

  // 列＝縦積み。カード間（＝見出し下）の余白はgapだけで取り、罫線は引かない
  const colRule = css.match(/\.lp-iv-col \{([\s\S]*?)\n\}/);
  assert.ok(colRule, '.lp-iv-col の定義');
  assert.ok(/display:\s*flex/.test(colRule[1]));
  assert.ok(/flex-direction:\s*column/.test(colRule[1]));
  const gap = Number((colRule[1].match(/gap:\s*([\d.]+)mm/) || [])[1]);
  assert.ok(gap >= 1.4 && gap <= 1.8, 'カード間・見出し下は1.4〜1.8mm: ' + gap);
  assert.equal(/border/.test(colRule[1]), false, '列に罫線を引かない');

  // カード: 外周0.2mm #c9c9c9・角丸3mm・クリップ・白地
  const cardRule = css.match(/\.lp-iv-card \{([\s\S]*?)\n\}/);
  assert.ok(cardRule, '.lp-iv-card の定義');
  assert.ok(/border:\s*0\.2mm solid #c9c9c9/.test(cardRule[1]), '外周線');
  assert.ok(/border-radius:\s*3mm/.test(cardRule[1]), '角丸');
  assert.ok(/overflow:\s*hidden/.test(cardRule[1]), '角丸でクリップ');
  assert.ok(/background:\s*#ffffff/.test(cardRule[1]), '白地');

  // 列見出し: 外周線なし・下線だけ
  const headRule = css.match(/\.lp-sheet \.lp-iv-headtbl \{([\s\S]*?)\n\}/);
  assert.ok(headRule, '.lp-iv-headtbl の定義');
  assert.ok(/border:\s*0/.test(headRule[1]), '外周線なし');
  const headTh = css.match(/\.lp-sheet \.lp-iv-headtbl th \{([\s\S]*?)\n\}/);
  assert.ok(headTh, '列見出しセル');
  assert.ok(/border:\s*0;/.test(headTh[1]), 'セルの格子なし');
  assert.ok(/border-bottom:\s*0\.2mm solid #c9c9c9/.test(headTh[1]), '下線のみ');

  // カード内: 縦線なし・横線0.12mm・最下段は下線なし・ゼブラなし
  const cellRule = css.match(/\.lp-sheet \.lp-iv-cardtbl th,\n\.lp-sheet \.lp-iv-cardtbl td \{([\s\S]*?)\n\}/);
  assert.ok(cellRule, 'カード内セル');
  assert.ok(/border:\s*0;/.test(cellRule[1]), '格子を消す');
  assert.ok(/border-bottom:\s*0\.12mm solid #cfcfcf/.test(cellRule[1]), '横線のみ');
  assert.ok(/\.lp-sheet \.lp-iv-cardtbl tbody tr:last-child > \* \{ border-bottom: 0; \}/.test(css), '最下段は下線なし');
  assert.equal(/nth-of-type\(odd\)|nth-child\(odd\)|#f7f7f7/.test(css), false, 'ゼブラなし');
  // グループ見出しは背景のみ（左の黒アクセントなし）
  const grpRule = css.match(/\.lp-sheet \.lp-iv-cardtbl tr\.lp-iv-grp th \{([\s\S]*?)\n\}/);
  assert.ok(grpRule, 'グループ見出し');
  assert.ok(/border-left:\s*0/.test(grpRule[1]));
  assert.equal(/border-left:\s*1mm/.test(css), false, '太い黒アクセントを残さない');
  // 番号は #666
  assert.ok(/\.lp-sheet \.lp-iv-cardtbl td\.lp-iv-no \{[\s\S]{0,200}color:\s*#666 !important/.test(css));
});

test('[iv-page] 印刷の@pageは教材の向きで切り替える（縦/横）', () => {
  const js = read('site/app12/app.js');
  assert.ok(js.includes("var PAGE_SIZE_STYLE_ID = 'lp-page-size';"));
  assert.ok(/@page\{size:' \+ \(orientation === 'landscape' \? 'A4 landscape' : 'A4 portrait'\) \+ ';margin:0\}/.test(js), '@pageの切り替え');
  assert.ok(js.includes('setPrintPageSize(materials[index] && materials[index].orientation);'), 'タブ切替で向きを反映');
  assert.ok(/\(landscape \? 297 : 210\) \* 96 \/ 25\.4/.test(js), 'fitSheetsは向きに応じた基準幅');

  // 実挙動: 横→縦で同じ<style>を更新する
  const styles = [];
  const doc = {
    head: { appendChild: function (el) { styles.push(el); } },
    createElement: function () { return { id: '', textContent: '' }; },
    getElementById: function (id) { return styles.find((s) => s.id === id) || null; }
  };
  global.window = { document: doc };
  try {
    app.setPrintPageSize('landscape');
    assert.equal(styles.length, 1);
    assert.equal(styles[0].id, app.PAGE_SIZE_STYLE_ID);
    assert.equal(styles[0].textContent, '@page{size:A4 landscape;margin:0}');
    app.setPrintPageSize('portrait');
    assert.equal(styles.length, 1, 'styleは1つだけ');
    assert.equal(styles[0].textContent, '@page{size:A4 portrait;margin:0}');
    app.setPrintPageSize(undefined);
    assert.equal(styles[0].textContent, '@page{size:A4 portrait;margin:0}', '未指定は縦');
  } finally {
    delete global.window;
  }
});

test('[pdf] makePdfは横向き教材をA4横で出力し、縦の挙動は変えない', async () => {
  async function run(orientation, canvasSize) {
    const state = { opts: null, addPage: [], images: [] };
    const pdf = {
      addPage: function () { state.addPage.push(Array.prototype.slice.call(arguments)); },
      addImage: function (data, fmt, x, y, w, h) { state.images.push({ x: x, y: y, w: w, h: h }); },
      output: function () { return 'data:application/pdf;base64,JVBERi0='; }
    };
    global.window = {
      html2canvas: function () {
        return Promise.resolve({
          width: canvasSize[0],
          height: canvasSize[1],
          toDataURL: function () { return 'data:image/jpeg;base64,x'; }
        });
      },
      jspdf: { jsPDF: function (opts) { state.opts = opts; return pdf; } }
    };
    const sheets = [{ style: {} }, { style: {} }];
    try {
      await new Promise((resolve) => {
        app.makePdf(sheets, function () { resolve(); }, orientation);
      });
    } finally {
      delete global.window;
    }
    return state;
  }

  const land = await run('landscape', [2970, 2100]);
  assert.equal(land.opts.orientation, 'landscape');
  assert.equal(land.opts.unit, 'mm');
  assert.equal(land.opts.format, 'a4');
  assert.deepEqual(land.addPage, [['a4', 'landscape']], '2ページ目も横向きで追加');
  assert.equal(land.images.length, 2);
  land.images.forEach((img) => {
    assert.equal(img.y, 0);
    assert.ok(img.h <= 210 && img.w <= 297, 'A4横に収める: ' + img.w + 'x' + img.h);
    assert.ok(img.x >= 0 && Math.abs(img.x - (297 - img.w) / 2) < 0.01, '横方向は中央');
  });

  const port = await run(undefined, [1240, 1754]);
  assert.equal(port.opts.orientation, 'portrait', '省略時は従来どおり縦');
  assert.deepEqual(port.addPage, [['a4', 'portrait']]);
  assert.ok(port.images[0].h <= 297 && port.images[0].w <= 210);
  assert.ok(Math.abs(port.images[0].x - (210 - port.images[0].w) / 2) < 0.01);

  // 教室タブレット送信は教材の向きを渡す
  const js = read('site/app12/app.js');
  assert.ok(js.includes('}, material.orientation);'), '送信時のPDFも教材の向き');
});

test('[theme] 紙面タイトルは明朝を使わず、app12の範囲だけゴシックを保つ', () => {
  const css = read('site/app12/app.css');
  const titleRule = css.match(/\.lp-sheet__title \{\n([\s\S]*?)\n\}/);
  assert.ok(titleRule, '.lp-sheet__title の定義');
  assert.equal(/Mincho|(^|[^-])serif/.test(titleRule[1]), false, '明朝・serifを使わない');
  assert.ok(/Yu Gothic/.test(titleRule[1]), '和文ゴシック系');
  // 既存の視覚階層・余白は変えない（A4 1枚に収まる）
  assert.ok(/font-size: 15pt/.test(titleRule[1]));
  assert.ok(/line-height: 1\.25/.test(titleRule[1]));
  assert.ok(/letter-spacing: \.08em/.test(titleRule[1]));

  // 共通テーマの明朝指定より優先させるが、対象は app12 の紙面・画面ヘッダーだけ
  ['pop', 'forest'].forEach((theme) => {
    const scoped = new RegExp('html\\[data-theme="' + theme + '"\\] \\.lp-(sheet|header) [^{]*\\{');
    assert.ok(scoped.test(css), theme + ' のスコープ限定ルール');
  });
  assert.ok(/html\[data-theme="(?:pop|forest)"\] \.lp-sheet \.lp-sheet__title[\s\S]{0,400}font-family:[^;]*!important/.test(css));
  const themedSelectors = css.match(/html\[data-theme="(?:pop|forest)"\][^\n{]*\{/g) || [];
  themedSelectors.forEach((sel) => {
    assert.ok(
      /^html\[data-theme="(?:pop|forest)"\] \{$/.test(sel) || /\.lp-/.test(sel),
      'app12の要素に限定する: ' + sel
    );
  });
});

test('[render] 1教材=全ページ。紙面はページ数分・順序どおり・番号付き', () => {
  const fixture = {
    id: 'fixture-three-pages',
    slug: 'fixture-three-pages',
    title: 'テスト用プリント（3ページ）',
    pages: [1, 2, 3].map((n) => ({
      id: 'p' + n,
      kind: 'tense-table',
      caption: n + 'ページ目',
      rows: [{ id: 'r' + n, name: '行' + n, form: 'V', timeline: { point: 0.18, habit: null, block: null, arcs: 0 }, meanings: [{ marker: null, text: '意味' + n, note: '' }] }]
    }))
  };
  const html = app.materialHtml(fixture);
  assert.equal(count(html, 'class="lp-sheet"'), 3);
  assert.deepEqual(html.match(/data-page="(\d)"/g), ['data-page="1"', 'data-page="2"', 'data-page="3"']);
  assert.ok(html.includes('<span>1 / 3</span>'));
  assert.ok(html.includes('<span>3 / 3</span>'));
  const order = ['1ページ目', '2ページ目', '3ページ目'].map((t) => html.indexOf(t));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'ページ順が保たれる');

  // 本番教材は1ページのまま（fixtureなしで増えない）
  assert.equal(count(app.materialHtml(MATERIAL), 'class="lp-sheet"'), 1);
  // group を持たない fixture でも見出し行を捏造しない
  assert.equal(count(html, 'class="lp-group"'), 0, 'groupなしは群見出しを出さない');
  assert.equal(count(html, '<tbody>'), 3, 'ページごとに1つのtbody');
});

test('[static] 12行＋3群見出し＋凡例がA4 1ページに収まる（計算で確認）', () => {
  const css = read('site/app12/app.css');
  const num = (re) => {
    const m = css.match(re);
    assert.ok(m, 'CSS値が見つからない: ' + re);
    return Number(m[1]);
  };
  const sheetPadTop = num(/\.lp-sheet\s*\{[^}]*padding:\s*([\d.]+)mm/);
  const sheetPadBottom = num(/\.lp-sheet\s*\{[^}]*padding:\s*[\d.]+mm [\d.]+mm ([\d.]+)mm/);
  const rowH = num(/\.lp-tense tbody td \{[^}]*height:\s*([\d.]+)mm/);
  const groupH = num(/tr\.lp-group th \{[^}]*height:\s*([\d.]+)mm/);
  const legendH = num(/\.lp-legend__svg \{[^}]*height:\s*([\d.]+)mm/);
  const inner = 297 - sheetPadTop - sheetPadBottom;
  // 概算: 見出しブロック13mm + 凡例(4.7+2.4) + 表(12行 + 3群 + ヘッダ5) + フッター6
  const approx = 13 + (legendH + 2.4) + (rowH * 12 + groupH * 3 + 5) + 6;
  assert.ok(approx <= inner, '紙面内に収まる: ' + approx.toFixed(1) + 'mm <= ' + inner + 'mm');
  // 表の末尾とフッターの間に余裕を残す（6px以上）
  assert.ok(inner - approx >= 1.6, '余裕 ' + (inner - approx).toFixed(1) + 'mm >= 1.6mm(6px)');
  assert.ok(rowH >= 18 && rowH <= 19.5, '行高は12行を1ページに保つ範囲: ' + rowH);
  assert.equal(count(css, 'height: 20.1mm'), 0, '旧行高を残さない');
  assert.ok(/\.lp-c-name__f \{[^}]*white-space:\s*normal/.test(css), '長い式は折り返して切らない');
  assert.ok(/\.lp-tense thead th \{[^}]*line-height:\s*1\.3/.test(css), '表ヘッダの行高を固定');
  assert.ok(/tr\.lp-group th,[\s\S]{0,320}line-height:\s*1\.2/.test(css), '群見出しの行高を固定');
});

test('[static] 印刷CSSは画面UIを出さず、最後の紙面に余分な改ページを残さない', () => {
  const css = read('site/app12/app.css');
  const printAt = css.indexOf('@media print');
  assert.ok(printAt > 0);
  const print = css.slice(printAt);

  assert.equal(/@page\s*\{/.test(print), false, '固定の@pageを置かない（向きはapp.jsが切り替える）');
  assert.ok(/\.lp-sheet\.lp-sheet--landscape\s*\{[^}]*width:\s*297mm/.test(print), '横向き紙面もA4横で印刷');
  ['\.no-print', '\.lp-header', '\.lp-tabs', '\.lp-toolbar'].forEach((sel) => {
    assert.ok(new RegExp(sel + '[\\s\\S]*?display:\\s*none\\s*!important').test(print), '印刷で隠す: ' + sel);
  });
  assert.ok(/\.lp-sheet\s*\{[^}]*width:\s*210mm/.test(print), '紙面幅A4');
  assert.ok(/\.lp-sheet\s*\{[^}]*height:\s*297mm/.test(print), '紙面高A4');
  assert.ok(/\.lp-sheet\s*\{[^}]*zoom:\s*1\s*!important/.test(print), '画面ズームを印刷に持ち込まない');
  assert.ok(/\.lp-sheet\s*\{[^}]*break-after:\s*page/.test(print), '紙面ごとに改ページ');
  assert.ok(/\.lp-sheet:last-child\s*\{[^}]*break-after:\s*auto/.test(print), '最後の紙面で余分な白紙を作らない');
  assert.ok(/\.lp-sheet:last-child\s*\{[^}]*page-break-after:\s*auto/.test(print), '旧来プロパティも同様');
  assert.ok(/\.lp-panel\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(print), '非表示教材は印刷しない');

  // 画面側: 紙面は白固定・1枚=A4
  const sheetRule = css.match(/\.lp-sheet\s*\{([\s\S]*?)\n\}/);
  assert.ok(sheetRule, '.lp-sheet の定義がある');
  assert.ok(/width:\s*210mm/.test(sheetRule[1]));
  assert.ok(/height:\s*297mm/.test(sheetRule[1]));
  assert.ok(/background:\s*#ffffff/.test(sheetRule[1]), '紙面はテーマに関係なく白');
  assert.equal(/var\(--lp-/.test(sheetRule[1]), false, '紙面の色はテーマ変数を使わない');
});

test('[theme] 標準/ポップ/フォレストの3テーマと、紙面の白固定', () => {
  const css = read('site/app12/app.css');
  assert.ok(/:root\s*\{[\s\S]*?--lp-bg:/.test(css), '標準テーマ');
  assert.ok(/html\[data-theme="pop"\]\s*\{[\s\S]*?--lp-accent:/.test(css), 'ポップ');
  assert.ok(/html\[data-theme="forest"\]\s*\{[\s\S]*?--lp-accent:/.test(css), 'フォレスト');
  ['--lp-bg', '--lp-panel', '--lp-ink', '--lp-line', '--lp-accent', '--lp-header-bg', '--lp-header-ink'].forEach((name) => {
    assert.ok(css.includes(name + ':'), name + ' を定義する');
  });
  ['pop', 'forest'].forEach((theme) => {
    const block = css.match(new RegExp('html\\[data-theme="' + theme + '"\\]\\s*\\{([\\s\\S]*?)\\n\\}'));
    assert.ok(block, theme + ' のブロック');
    assert.ok(block[1].includes('--lp-header-bg:'), theme + ' のヘッダー色');
  });
  // 紙面内はテーマ変数を参照しない（=白黒印刷でも同じ）
  const sheetStart = css.indexOf('.lp-sheet {');
  const sheetEnd = css.indexOf('.lp-sheet__head', sheetStart);
  assert.equal(/var\(--lp-/.test(css.slice(sheetStart, sheetEnd)), false);

  const html = read('site/app12/index.html');
  assert.ok(html.includes('<meta name="viewport" content="width=device-width,initial-scale=1">'));
  assert.ok(html.includes('<script src="../themes/theme.js"></script>'));
  assert.ok(html.includes('href="../themes/pop.css"'));
  assert.ok(html.includes('href="../themes/forest.css"'));
  assert.ok(html.includes('href="./app.css"'));
  assert.ok(html.includes('<script src="../shared/transport.js"></script>'));
  assert.ok(html.includes('<script src="./materials.js"></script>'));
  assert.ok(html.includes('<script src="./app.js"></script>'));
  assert.ok(html.includes('data-lp-app'));
  assert.ok(fs.existsSync(path.join(APP_DIR, 'favicon.svg')));
});

test('[a11y] 教材タブはWAI-ARIA tabs（roving tabindex・左右/Home/End）', () => {
  const markup = app.appMarkup([
    { id: 'a', title: 'A教材', pages: [] },
    { id: 'b', title: 'B教材', pages: [] }
  ]);
  assert.ok(markup.includes('role="tablist"'));
  assert.equal(count(markup, 'role="tab"'), 2);
  assert.equal(count(markup, 'role="tabpanel"'), 2);
  assert.ok(markup.includes('aria-selected="true"'));
  assert.ok(markup.includes('aria-selected="false"'));
  assert.ok(markup.includes('tabindex="0"'));
  assert.ok(markup.includes('tabindex="-1"'));
  assert.ok(markup.includes('aria-controls="lp-panel-b"'));
  assert.ok(markup.includes('aria-labelledby="lp-tab-b"'));
  assert.ok(/id="lp-panel-b"[^>]*hidden/.test(markup), '非選択のパネルは hidden');

  assert.equal(app.nextTabIndex('ArrowRight', 0, 3), 1);
  assert.equal(app.nextTabIndex('ArrowRight', 2, 3), 0);
  assert.equal(app.nextTabIndex('ArrowLeft', 0, 3), 2);
  assert.equal(app.nextTabIndex('Home', 2, 3), 0);
  assert.equal(app.nextTabIndex('End', 0, 3), 2);
  assert.equal(app.nextTabIndex('Enter', 1, 3), null);
  assert.equal(app.nextTabIndex('ArrowRight', -1, 3), null);
  assert.equal(app.nextTabIndex('ArrowRight', 0, 0), null);

  const js = read('site/app12/app.js');
  assert.ok(js.includes("tablist.addEventListener('keydown'"), 'タブはキーボードで移動できる');
  assert.ok(js.includes("printBtn.addEventListener('click'"), '印刷ボタン');
  assert.ok(js.includes('w.print()'), 'ブラウザ印刷');
});

test('[pdf] ファイル名はASCII・.pdf・教材slug・ページ数・request_id入り（1教材=1PDF/1ジョブ）', () => {
  const name = app.buildPdfName(MATERIAL, 1, 'AbC123_-xyz', new Date(2026, 10, 23, 4, 5, 6));
  assert.equal(name, 'gakusyu-print_20261123-040506_tense-notes_p1_AbC123xyz.pdf');
  assert.match(name, /^[A-Za-z0-9._-]+\.pdf$/, 'PDFdropはASCII名のみ受け付ける');
  assert.ok(name.length <= 120);
  const multi = app.buildPdfName(MATERIAL, 3, 'zzz999', new Date(2026, 0, 2, 0, 0, 0));
  assert.ok(multi.includes('_p3_'), 'ページ数を名前に残す');
  assert.notEqual(app.buildPdfName(MATERIAL, 1, 'aaa111'), app.buildPdfName(MATERIAL, 1, 'bbb222'), 'request_idで一意');
  assert.equal(app.asciiSlug('時制のまとめノート'), 'print', '日本語slugは安全な既定値に落とす');
});

test('[pdf] makePdfは全ページを順番どおり1つのPDFにまとめ、callbackは1回・zoom復元', async () => {
  const state = { canvas: 0, addPage: 0, images: [], failure: null };

  function fakeSheet(id, zoom) {
    return { id: id, style: { zoom: zoom } };
  }

  async function run(sheets, options) {
    options = options || {};
    state.canvas = 0;
    state.addPage = 0;
    state.images = [];
    const pdf = {
      addPage: function () { state.addPage += 1; },
      addImage: function (data) { state.images.push(data); },
      output: function () { return 'data:application/pdf;base64,JVBERi0='; }
    };
    global.window = {
      html2canvas: function (el) {
        state.canvas += 1;
        if (options.reject) return Promise.reject(new Error('canvas failed'));
        return Promise.resolve({
          width: 1240,
          height: 1754,
          toDataURL: function () { return 'data:image/jpeg;base64,' + el.id; }
        });
      },
      jspdf: { jsPDF: function () { return pdf; } }
    };
    const calls = [];
    let pdfOut = null;
    try {
      await new Promise((resolve) => {
        app.makePdf(options.sheets || sheets, function (err, out) {
          calls.push(err);
          if (out) pdfOut = out;
          resolve();
        });
      });
      // 追加のマイクロタスクを流して「二重callbackが無い」ことを確認できるようにする
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      delete global.window;
    }
    return { calls: calls, pdf: pdfOut };
  }

  const sheets = [fakeSheet('p1', '0.5'), fakeSheet('p2', '0.5'), fakeSheet('p3', '0.5')];
  const ok = await run(sheets);
  assert.equal(ok.calls.length, 1, 'callbackは1回');
  assert.equal(ok.calls[0], null);
  assert.ok(ok.pdf, 'PDFが返る');
  assert.equal(state.canvas, 3, '紙面1枚につき1回描画');
  assert.equal(state.addPage, 2, '2ページ目以降にaddPage');
  assert.deepEqual(state.images.map((d) => d.replace('data:image/jpeg;base64,', '')), ['p1', 'p2', 'p3'], '順序どおり');
  assert.deepEqual(sheets.map((s) => s.style.zoom), ['0.5', '0.5', '0.5'], 'zoomを復元する');

  // 1ページだけのときは addPage しない
  const single = [fakeSheet('only', '')];
  const one = await run(single);
  assert.equal(one.calls.length, 1);
  assert.equal(state.addPage, 0);
  assert.equal(state.images.length, 1);
  assert.equal(single[0].style.zoom, '');

  // 失敗時もcallbackは1回・zoom復元
  const failing = [fakeSheet('f1', '0.4'), fakeSheet('f2', '0.4')];
  const bad = await run(failing, { reject: true });
  assert.equal(bad.calls.length, 1);
  assert.ok(bad.calls[0] instanceof Error);
  assert.deepEqual(failing.map((s) => s.style.zoom), ['0.4', '0.4']);

  // 空は明示エラー
  const none = await run([], {});
  assert.equal(none.calls.length, 1);
  assert.match(String(none.calls[0] && none.calls[0].message), /印刷するページがありません/);
});

// ---------------------------------------------------------------- 教室タブレット送信
function makeClock() {
  let now = 0;
  let seq = 0;
  let timers = [];
  return {
    now: function () { return now; },
    setTimeout: function (fn, ms) {
      seq += 1;
      const timer = { id: seq, fn: fn, at: now + Number(ms || 0) };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout: function (id) { timers = timers.filter((t) => t.id !== id); },
    pending: function () { return timers.length; },
    runNext: function () {
      if (!timers.length) return false;
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const timer = timers.shift();
      now = Math.max(now, timer.at);
      timer.fn();
      return true;
    }
  };
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function runSend(options) {
  options = options || {};
  const clock = makeClock();
  const posts = [];
  const polls = [];
  const storage = new Map();
  const requestId = options.requestId || 'request-id-abcdefg1';
  const transport = {
    messages: { unknownResult: 'UNKNOWN-RESULT' },
    newRequestId: function () { return requestId; },
    newNonce: function () { return 'nonce-abcdefghijklmnop'; },
    isRequestId: function (v) { return /^[A-Za-z0-9_-]{16,128}$/.test(String(v || '')); },
    getIdToken: function () { return options.noToken ? '' : 'id-token'; },
    postForm: function (opts) {
      posts.push(opts);
      if (options.post) return options.post(opts, posts.length);
      return Promise.resolve({ ok: false, error: 'timeout' });
    },
    jsonp: function (url) {
      polls.push(url);
      if (options.jsonp) return options.jsonp(url, polls.length);
      return Promise.resolve({ ok: false, error: 'timeout' });
    }
  };
  const sender = app.createPdfSender({
    transport: transport,
    workerUrl: 'https://proxy.example/pdfdrop',
    directUrl: 'https://script.google.com/exec',
    token: 'test-token',
    storage: {
      getItem: function (k) { return storage.has(k) ? storage.get(k) : null; },
      setItem: function (k, v) { storage.set(k, String(v)); }
    },
    onStatus: function () {},
    getIdToken: function () {
      if (options.noToken) return '';
      if (!options.tokens) return 'id-token';
      var at = Math.min(options.tokenCalls || 0, options.tokens.length - 1);
      options.tokenCalls = (options.tokenCalls || 0) + 1;
      return options.tokens[at];
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now
  });
  const results = [];
  sender.send('JVBERi0xLjQK', options.name || 'gakusyu-print_x.pdf', requestId, function (res) {
    results.push(res);
  }, options.expectToken ? { expectToken: options.expectToken } : undefined);
  let guard = 0;
  while (!results.length && guard < 500) {
    guard += 1;
    await flush();
    if (results.length) break;
    if (!clock.pending()) {
      await flush();
      if (!results.length) break;
      continue;
    }
    clock.runNext();
  }
  return { results, posts, polls, storage, sender, clock };
}

test('[sender] 成功時はrequest_idをWorker/Directで共有し、cooldownを残さない', async () => {
  const run = await runSend({
    post: function (opts, n) {
      if (n === 1) return Promise.resolve({ ok: false, error: 'timeout' }); // Worker不明
      return Promise.resolve({ ok: true, data: { ok: true, name: opts.payload.name } });
    }
  });
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].ok, true);
  assert.equal(run.posts.length, 2, 'Worker→Directの順に再送する');
  assert.equal(run.posts[0].payload.request_id, run.posts[1].payload.request_id, '同じrequest_idで再送');
  assert.equal(run.posts[0].rid, run.posts[1].rid, '同じridで送る');
  assert.ok(run.posts[0].payload.id_token, 'id_tokenを付ける');
  assert.equal(run.posts[0].kind, 'genko', 'PDFdropの既存kind');
  assert.equal(run.storage.get('gakusyuPrint:pdfPendingUnknown'), '0');
  assert.equal(run.storage.get('gakusyuPrint:pdfPendingUntil'), '0');
  assert.equal(run.storage.has('genko_pdf_pending_unknown'), false, 'app9のキーに書かない');
});

test('[sender] 応答不明＋poll失敗はauthではなくunknownで終了し、再送しない', async () => {
  const run = await runSend();
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].ok, false);
  assert.equal(run.results[0].unknown, true);
  assert.notEqual(run.results[0].auth, true);
  assert.equal(run.posts.length, 2, 'POSTはWorker/Directの2回まで（request_idは同一）');
  assert.ok(run.polls.length >= 3, 'pollで保存を確認する');
  assert.equal(run.storage.get('gakusyuPrint:pdfPendingUnknown'), '1', '次回押下を止めるフラグ');
  const until = Number(run.storage.get('gakusyuPrint:pdfPendingUntil'));
  assert.ok(until > run.clock.now(), 'クールダウンを設定する');
  assert.equal(run.sender.isCoolingDown(run.clock.now() + 1), true);
  assert.equal(run.sender.isCoolingDown(until + 1), false);

  // 再送ボタンを押しても、cooldown中は新しいジョブを始めない（ここでは状態だけ確認）
  assert.equal(run.sender.hasUnknown(), true);
  run.sender.clearPending();
  assert.equal(run.sender.hasUnknown(), false);
  assert.equal(run.storage.get('gakusyuPrint:pdfPendingUnknown'), '0');
});

test('[sender] pollで保存を確認できれば成功（POST応答不明でも二重送信しない）', async () => {
  const run = await runSend({
    jsonp: function () {
      return Promise.resolve({ ok: true, data: { genkoPoll: true, found: true, name: 'gakusyu-print_x.pdf' } });
    }
  });
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].ok, true);
  assert.equal(run.results[0].name, 'gakusyu-print_x.pdf');
  assert.equal(run.storage.get('gakusyuPrint:pdfPendingUnknown'), '0');
});

test('[sender] 明示的な権限エラーはauthとして返し、不明扱いにしない', async () => {
  const run = await runSend({
    post: function () {
      return Promise.resolve({ ok: true, data: { ok: false, error: 'not allowed', code: 'not_allowed' } });
    }
  });
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].auth, true);
  assert.notEqual(run.results[0].unknown, true);
  assert.equal(run.posts.length, 1, '権限エラーで再送しない');
});

test('[sender] id_tokenが無ければ送信せずauthを返す／request_id不正は送信しない', async () => {
  const noToken = await runSend({ noToken: true });
  assert.equal(noToken.results.length, 1);
  assert.equal(noToken.results[0].auth, true);
  assert.equal(noToken.posts.length, 0);

  const bad = await runSend({ requestId: 'short' });
  assert.equal(bad.results.length, 1);
  assert.equal(bad.results[0].ok, false);
  assert.match(String(bad.results[0].error), /request_id/);
  assert.equal(bad.posts.length, 0);
});

test('[sender] クリック時のトークンと不一致なら送信しない（別アカウントで同ジョブを再送しない）', async () => {
  const run = await runSend({ expectToken: 'click-token' }); // getIdToken() は 'id-token'
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].auth, true);
  assert.equal(run.results[0].ok, false);
  assert.equal(run.posts.length, 0, 'POSTを始めない（fail closed）');
  assert.match(String(run.results[0].error), /ログイン/);
});

test('[sender] 先行POSTが不明なままトークンが失効してもauth確定せずunknownで終わる', async () => {
  const run = await runSend({
    expectToken: 'id-token',
    tokens: ['id-token', 'id-token', 'id-token', ''], // 4回目以降は失効
    post: function () { return Promise.resolve({ ok: false, error: 'timeout' }); }
  });
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].unknown, true);
  assert.notEqual(run.results[0].auth, true, '保存済みの可能性を消さない');
  assert.equal(run.posts.length, 1, 'トークンが変わった後は再送しない');
  assert.equal(run.storage.get('gakusyuPrint:pdfPendingUnknown'), '1');
});

test('[pdf] 出力失敗・容量超過（10MiB上限）を送信前に止める', () => {
  assert.equal(app.PDF_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(app.pdfByteLength(''), 0);
  assert.equal(app.pdfByteLength('QUJD'), 3);
  assert.equal(app.pdfByteLength('QUJDRA=='), 4);
  const overB64 = 'A'.repeat(Math.ceil(app.PDF_MAX_BYTES / 3) * 4 + 8);
  assert.equal(app.isPdfTooLarge(overB64), true);
  assert.equal(app.isPdfTooLarge('A'.repeat(4000)), false);

  const js = read('site/app12/app.js');
  assert.ok(js.includes("pdf.output('datauristring')"), 'datauristringで取り出す');
  assert.ok(/try \{[\s\S]{0,200}pdf\.output\('datauristring'\)[\s\S]{0,300}catch \(e\)/.test(js), '同期失敗をcatchする');
  assert.ok(js.indexOf('isPdfTooLarge(b64)') > 0 && js.indexOf('isPdfTooLarge(b64)') < js.indexOf('sender.send(b64'), '送信前に容量確認');
  assert.ok(js.includes("release('PDFの出力に失敗しました')"), '失敗時はボタンを戻す');
  assert.ok(js.includes("release('PDFが大きすぎるため送信できません（上限10MB）。教材のページ数を減らしてください。')"));
});

test('[send] 送信中は教材タブを止め、クリック時の教材とシートだけを送る（最新probeのみ反映）', () => {
  const js = read('site/app12/app.js');
  assert.ok(/function setBusy\(busy\)[\s\S]{0,200}tabs\.forEach\(function \(tab\) \{ tab\.disabled = !!busy; \}\)/.test(js), 'タブを停止');
  assert.ok(js.includes('var sheets = sheetsOf(activeIndex).slice();'), 'クリック時点のシートを複製');
  assert.ok(js.indexOf('var sheets = sheetsOf(activeIndex).slice();') < js.indexOf('makePdf(sheets, function'), '捕捉後に生成する');
  assert.ok(js.includes('setBusy(true);') && js.includes('setBusy(false);'));
  assert.ok(js.includes('visibilitySeq') && /if \(seq !== visibilitySeq\) return;/.test(js), '古いprobe結果を捨てる');
  assert.ok(js.indexOf('visibilitySeq += 1') < js.indexOf('sender.probe('), '判定開始時に世代を進める');
  assert.ok(js.includes('{ expectToken: clickToken }'), 'クリック時のトークン文脈で送る');
  assert.ok(js.includes("if ((T.getIdToken() || '') !== clickToken)"), 'PDF生成後にもトークンを確認');
});

test('[isolation] sessionStorageはapp9（genko_*）と別名前空間、PDFdropは既存経路を再利用', () => {
  assert.equal(app.NS, 'gakusyuPrint:');
  assert.deepEqual(Object.keys(app.KEYS).sort(), ['pendingUnknown', 'pendingUntil']);
  Object.keys(app.KEYS).forEach((k) => assert.ok(app.KEYS[k].indexOf('gakusyuPrint:') === 0, k));

  const js = read('site/app12/app.js');
  assert.equal(js.includes('genko_pdf_pending'), false, 'app9のキーを参照しない');
  assert.ok(js.includes("kind: 'genko'"), 'PDFdropの既存kindを使う');
  assert.ok(js.includes('T.postForm(') && js.includes('T.jsonp('), 'shared transportを再利用する');
  assert.ok(js.includes('T.probeAuth('), '認証/権限確認を再利用する');
  assert.ok(js.includes('T.isRequestId('), 'request_idの検証を弱めない');
  assert.ok(js.includes('requestIdRequired: true'));
  assert.ok(js.includes('T.messages.unknownResult'), '結果不明の文言を共有する');
  assert.equal(/google\.script\.run|drive\.google\.com|fetch\(/.test(js), false, '新しい経路を作らない');

  // app9 と同じPDFdropデプロイを使う（新しいデプロイを増やさない）
  const app9 = read('site/app9/index.html');
  const app9Direct = app9.match(/DIRECT_PDFDROP_URL = '([^']+)'/);
  assert.ok(app9Direct, 'app9のDirect URL');
  assert.equal(app.directUrl, app9Direct[1]);
  const app9Worker = app9.match(/WORKER_BASE = '([^']+)'/);
  assert.equal(app.workerUrl, app9Worker[1].replace(/\/+$/, '') + '/pdfdrop');
  assert.equal(app.classroom.token, (app9.match(/token: '([^']+)'/) || [])[1], 'PDFdropのtokenも同一');
});

test('[auth] pdfdropのnoauthは保存トークンの状態で文言を分け、内部エラー文字列を出さない', () => {
  const valid = app.noauthHelpMessage({
    peekIdToken: () => 'stored-token',
    inspectToken: () => ({ valid: true, email: 'student@example.com' })
  });
  assert.match(valid, /印刷先の認証を確認できませんでした/, '有効なトークンをpdfdropが拒否した場合');
  assert.match(valid, /教室用アカウントでログインし直/);
  assert.equal(valid.includes('期限切れ'), false, 'ローカルで有効なトークンを期限切れと言わない');
  assert.equal(/noauth|bad token|tokeninfo/i.test(valid), false, '内部エラー文字列を出さない');

  const expired = app.noauthHelpMessage({
    peekIdToken: () => 'stored-token',
    inspectToken: () => ({ valid: false, reason: 'expired' })
  });
  assert.equal(expired, 'ログインの有効期限が切れています。');

  const none = app.noauthHelpMessage({
    peekIdToken: () => '',
    inspectToken: () => ({ valid: false, reason: 'empty' })
  });
  assert.equal(none, 'ログインの有効期限が切れています。', 'トークン無しも従来の文言');

  // 起動時probe・送信前probeの両経路が原因別の文言を使う
  const js = read('site/app12/app.js');
  assert.equal(count(js, 'showAuthHelp(noauthHelpMessage(T))'), 2, '起動時と送信前の両方');
  assert.equal(js.includes("showAuthHelp('Google にログインされていない可能性があります。')"), false);

  // app9（原稿用紙）も同じ判定・文言に揃える
  const app9 = read('site/app9/index.html');
  assert.equal(count(app9, 'showAuthHelp(noauthHelpMessage())'), 2, 'app9も起動時と送信前の両方');
  assert.ok(app9.includes('印刷先の認証を確認できませんでした'));
  assert.equal(app9.indexOf('function noauthHelpMessage()') < app9.indexOf('showAuthHelp(noauthHelpMessage())'), true);
});

test('[portal] ツールに「学習プリント」カードをapp9の直後に追加', () => {
  const portal = read('site/index.html');
  const toolStart = portal.indexOf('<section class="section sec--tool">');
  const engStart = portal.indexOf('<section class="section sec--eng">');
  assert.ok(toolStart > 0 && engStart > toolStart);
  const toolSection = portal.slice(toolStart, engStart);

  const app9At = toolSection.indexOf('href="./app9/"');
  const app12At = toolSection.indexOf('href="./app12/"');
  assert.ok(app9At > 0, 'app9カードがある');
  assert.ok(app12At > app9At, 'app9の後ろに置く');

  // カードの並び: 公式・暗記辞典 → 原稿用紙メーカー(app9) → 学習プリント(app12)
  const cards = toolSection.split('<a class="card').slice(1);
  assert.equal(cards.length, 3, 'ツールのカードは3枚');
  assert.ok(cards[1].includes('href="./app9/"'), '2枚目はapp9');
  assert.ok(cards[2].includes('href="./app12/"'), '3枚目が学習プリント（app9の直後）');
  assert.ok(cards[2].includes('<h3 class="card__title">学習プリント</h3>'), '名称は厳密に「学習プリント」');
  assert.ok(cards[2].startsWith(' subj--tool'), 'ツールの教科色');
  assert.equal(count(toolSection, 'href="./app12/"'), 1, 'カードは1枚だけ');
  assert.ok(cards[2].includes('タブで教材を選び、A4で印刷できます。'), '説明は簡潔に');
  assert.equal(cards[2].includes('タブレット'), false, 'タブレットから送る（逆向き）記述をしない');
});

test('[hc-data] 中学歴史年表は7章・226行・A4縦4ページ（各2段）で原稿順のまま', () => {
  assert.equal(HC.slug, 'history-chronology');
  assert.equal(HC.title, '中学歴史年表');
  assert.equal(HC.orientation, undefined, 'A4縦');
  assert.equal(HC.note, 'この語呂合わせは厳しいのでは？と思ったら、遠慮なくいってね！');
  assert.equal(HC.pages.length, 4, 'A4縦4ページ（片面4枚以内）');
  HC.pages.forEach((page) => {
    assert.equal(page.kind, 'history-chronology');
    assert.equal(page.columns.length, 2, '左右2段');
    assert.ok(page.caption, '段の範囲を示す見出しを持つ');
  });

  const columns = HC.pages.flatMap((page) => page.columns);
  assert.equal(columns.length, 8, '4ページ×2段');
  assert.deepEqual(
    plain(columns.map((column) => column.blocks.reduce((n, block) => n + block.rows.length, 0))),
    [31, 27, 28, 29, 27, 28, 28, 28],
    '実測割りの列末'
  );

  const blocks = columns.flatMap((column) => column.blocks);
  const chapterOrder = [];
  blocks.forEach((block) => {
    if (chapterOrder.indexOf(block.chapter) < 0) chapterOrder.push(block.chapter);
  });
  assert.deepEqual(chapterOrder, [
    '1. 古代', '2. 中世', '3. 近世①', '4. 近世②',
    '5. 近世③', '6. 近代・現代①', '7. 現代②'
  ], '章見出し7件（順序どおり）');
  assert.equal(blocks.filter((block) => block.continued).length, 7, '段をまたぐ章は「（続き）」');

  const rows = blocks.flatMap((block) => block.rows);
  assert.equal(rows.length, 226);
  assert.equal(rows[0].year, '紀元前4世紀頃');
  assert.equal(rows[225].year, '2022年');
  assert.equal(rows[225].event, 'ロシアがウクライナに軍事侵攻を開始する');
  // 句読点・複数文・注記を切り捨てない
  assert.ok(rows.some((row) => row.goro.includes('※なよせ(人・物・名所などの名を寄せ集めること。)')));
  assert.ok(rows.some((row) => row.event.includes('（〜1477年）')));
  assert.ok(rows.some((row) => row.goro.includes('※日本の要求は聞き入れなかった')));
});

test('[hc-gen] 生成物は原稿Markdownから決定的に再生成でき、全行・全文字が一致する', () => {
  const gen = require(path.join(ROOT, 'scripts', 'app12', 'build-history-chronology.cjs'));
  assert.equal(gen.build(), read('site/app12/history-data.js').replace(/\r\n/g, '\n'), 'history-data.js は再生成結果と一致');

  const source = fs.readFileSync(gen.SOURCE, 'utf8');
  const expected = source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|/.test(line) && !/^\|\s*-/.test(line) && !/^\|\s*西暦\s*\|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  assert.equal(expected.length, 226);
  const actual = HC.pages
    .flatMap((page) => page.columns)
    .flatMap((column) => column.blocks)
    .flatMap((block) => block.rows)
    .map((row) => [row.year, row.event, row.goro]);
  assert.deepEqual(plain(actual), expected, '西暦・出来事・語呂合わせの全文字が原稿と一致');
});

test('[hc-render] 4ページ・8段・226行。値はescし、注意文は初頁だけ、向きは縦のまま', () => {
  const html = app.materialHtml(HC);
  assert.equal(count(html, 'class="lp-sheet lp-sheet--history"'), 4);
  assert.equal(count(html, 'lp-sheet--landscape'), 0);
  assert.equal(count(html, '<div class="lp-hc-grid">'), 4);
  assert.equal(count(html, '<div class="lp-hc-col">'), 8);
  assert.equal(count(html, '<thead><tr><th scope="col">西暦</th><th scope="col">出来事</th><th scope="col">語呂合わせ</th></tr></thead>'), 8, '各段に原文どおりの列見出し');
  assert.equal(count(html, '<thead>'), 8);
  assert.equal(count(html, '<tr><th scope="row" class="lp-hc-year">'), 226);
  assert.equal(count(html, '<tr class="lp-hc-chapter">'), 14, '章見出しは段ごと（7章＋続き7）');
  assert.equal(count(html, '（続き）'), 7);
  assert.equal(count(html, 'class="lp-hc-note"'), 1, '冒頭の注意文は初頁だけ');
  const pages = html.split('<article ');
  assert.equal(count(pages[1], 'class="lp-hc-note"'), 1);
  assert.equal(count(pages[2], 'class="lp-hc-note"'), 0);
  ['<span>1 / 4</span>', '<span>2 / 4</span>', '<span>3 / 4</span>', '<span>4 / 4</span>']
    .forEach((foot) => assert.ok(html.includes(foot), foot));
  assert.ok(html.includes('aria-label="中学歴史年表 1ページ目"'));
  assert.equal(count(html, '<header'), 0, '紙面内に素のheaderを置かない');

  // レンダラーは必ずescを通す
  const evil = {
    id: 'evil', title: '<b>中学歴史</b>', note: '<script>x</script>',
    pages: [{
      id: 'e1', kind: 'history-chronology', caption: '<i>cap</i>',
      columns: [{ id: 'c1', blocks: [{ chapter: '<章>', continued: false, rows: [{ year: '<1>', event: 'a&b', goro: '"q" <img>' }] }] }]
    }]
  };
  const out = app.materialHtml(evil);
  assert.equal(out.includes('<b>中学歴史</b>'), false);
  assert.equal(out.includes('<script>'), false);
  assert.equal(out.includes('<img>'), false);
  assert.ok(out.includes('&lt;b&gt;中学歴史&lt;/b&gt;'));
  assert.ok(out.includes('&lt;章&gt;') && out.includes('&lt;1&gt;') && out.includes('a&amp;b'));
  assert.ok(out.includes('&quot;q&quot; &lt;img&gt;'));

  // 既存2教材の見た目・クラスは変えない
  assert.equal(count(app.materialHtml(MATERIAL), 'lp-sheet--history'), 0);
  assert.equal(count(app.materialHtml(MATERIAL), 'class="lp-sheet"'), 1);
  assert.equal(count(app.materialHtml(IV), 'lp-sheet--history'), 0);
  assert.equal(count(app.materialHtml(IV), 'class="lp-sheet lp-sheet--landscape"'), 2);
});

test('[hc-css] A4縦・余白8mmはこの教材だけ・2段5mm・15/43/42%・7.5pt/1.15', () => {
  const css = read('site/app12/app.css');
  const base = css.match(/\.lp-sheet \{([\s\S]*?)\n\}/)[1];
  assert.equal(/padding:\s*8mm/.test(base), false, '共通の紙面余白は変えない');

  const hist = css.match(/\.lp-sheet--history \{([\s\S]*?)\n\}/);
  assert.ok(hist, '.lp-sheet--history の定義');
  assert.ok(/padding:\s*8mm/.test(hist[1]));
  assert.ok(/font-size:\s*7\.5pt/.test(hist[1]));
  assert.ok(/line-height:\s*1\.15/.test(hist[1]));

  const grid = css.match(/\.lp-hc-grid \{([\s\S]*?)\n\}/);
  assert.ok(grid, '.lp-hc-grid の定義');
  assert.ok(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(grid[1]));
  assert.ok(/column-gap:\s*5mm/.test(grid[1]));

  const table = css.match(/\.lp-hc-tbl \{([\s\S]*?)\n\}/);
  assert.ok(table, '.lp-hc-tbl の定義');
  assert.ok(/table-layout:\s*fixed/.test(table[1]));
  assert.ok(/width:\s*100%/.test(table[1]));
  assert.ok(/\.lp-hc-tbl \.lp-hc-col-year \{ width: 15%; \}/.test(css));
  assert.ok(/\.lp-hc-tbl \.lp-hc-col-event \{ width: 43%; \}/.test(css));
  assert.ok(/\.lp-hc-tbl \.lp-hc-col-goro \{ width: 42%; \}/.test(css));

  const cell = css.match(/\.lp-sheet \.lp-hc-tbl th,\n\.lp-sheet \.lp-hc-tbl td \{([\s\S]*?)\n\}/);
  assert.ok(cell, '歴史年表のセル');
  assert.ok(/padding:\s*\.30mm 1\.1mm/.test(cell[1]));
  assert.ok(/position:\s*relative/.test(cell[1]), '疑似要素罫線の基準');
  assert.equal(/border-bottom/.test(cell[1]), false, '罫線は寸法を消費しない');
  assert.equal(/background-image/.test(cell[1]), false, 'html2canvasが失敗するgradientを使わない');
  assert.ok(/vertical-align:\s*top/.test(cell[1]));
  assert.ok(/overflow-wrap:\s*break-word/.test(cell[1]), '長文は折り返す');

  const rule = css.match(/\.lp-sheet \.lp-hc-tbl th::after,\n\.lp-sheet \.lp-hc-tbl td::after \{([\s\S]*?)\n\}/);
  assert.ok(rule, 'セルの水平罫線は疑似要素');
  assert.ok(/content:\s*""/.test(rule[1]));
  assert.ok(/position:\s*absolute/.test(rule[1]));
  assert.ok(/left:\s*0/.test(rule[1]) && /right:\s*0/.test(rule[1]) && /bottom:\s*0/.test(rule[1]));
  assert.ok(/height:\s*\.2mm/.test(rule[1]));
  assert.ok(/background:\s*#ddd/.test(rule[1]));
  assert.ok(/pointer-events:\s*none/.test(rule[1]));
  assert.ok(/tr\.lp-hc-chapter th::after \{\s*height:\s*\.3mm;\s*background:\s*#999;/.test(css), '章見出しの罫線');
  assert.ok(/thead th::after \{\s*height:\s*\.3mm;\s*background:\s*#bbb;/.test(css), '列見出しの罫線');
  assert.ok(/\.lp-sheet \.lp-hc-tbl thead th \{[^}]*white-space:\s*nowrap/.test(css), '列見出しは1行');

  const print = css.slice(css.indexOf('@media print'));
  assert.ok(/\.lp-sheet\.lp-sheet--history\s*\{[^}]*padding:\s*8mm/.test(print), '印刷/PDFでも8mm');
  assert.equal(/@page\s*\{/.test(print), false, '固定@pageは置かない（縦はapp.js）');
});

test('[hc-fixture] history-data.js が欠けても既存2教材とfixtureはそのまま動く', () => {
  const js = read('site/app12/app.js');
  assert.ok(js.includes('GakusyuPrintHistoryMaterial'), '生成データを教材一覧へ合成する');
  assert.ok(/if \(!history \|\| data\.fixture \|\| !Array\.isArray\(data\.materials\)\) return data;/.test(js), '欠落・fixture時は触らない');

  const sandbox = {};
  vm.runInNewContext(read('site/app12/materials.js'), sandbox);
  assert.equal(sandbox.GakusyuPrintMaterials.materials.length, 2, '生成物が無ければ2教材のまま');

  const html = read('site/app12/index.html');
  assert.ok(html.indexOf('./history-data.js') > 0);
  assert.ok(html.indexOf('./history-data.js') < html.indexOf('./materials.js'), 'materials.jsより先に読む');
  assert.ok(html.indexOf('./history-data.js') < html.indexOf('./app.js'));
});


test('[fixture] 本番教材を増やさずにfixtureで複数ページを差し替えられる', () => {
  const src = read('site/app12/materials.js');
  assert.ok(src.includes('if (!root || root.GakusyuPrintMaterials) return;'), '既存定義を上書きしない');

  const existing = { materials: [{ id: 'fixture-only' }] };
  const loaded = loadMaterials(existing);
  assert.equal(loaded, existing, 'fixtureが先に定義されていれば本番データで上書きしない');
  assert.equal(loaded.materials.length, 1);
  assert.equal(loaded.materials[0].id, 'fixture-only');

  const fixturePath = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app12', 'fixture-materials.js');
  assert.ok(fs.existsSync(fixturePath), '複数ページ用fixtureがある');
  const fixtureSandbox = {};
  vm.runInNewContext(fs.readFileSync(fixturePath, 'utf8'), fixtureSandbox);
  const fixture = fixtureSandbox.GakusyuPrintMaterials;
  assert.equal(fixture.fixture, true);
  assert.equal(fixture.materials[0].pages.length, 3);
  const html = app.materialHtml(fixture.materials[0]);
  assert.equal(count(html, 'class="lp-sheet"'), 3);
  assert.ok(html.includes('<span>2 / 3</span>'));

  const harnessPath = path.join(ROOT, 'scripts', 'tests', 'fixtures', 'app12', 'pdf-harness.html');
  assert.ok(fs.existsSync(harnessPath), 'ブラウザ確認用ハーネスがある');
  const harness = fs.readFileSync(harnessPath, 'utf8');
  assert.ok(harness.indexOf('fixture-materials.js') < harness.indexOf('site/app12/app.js'), 'fixtureを先に読む');
  assert.equal(/<script[^>]+src="[^"]*transport\.js"/.test(harness), false, 'ハーネスは通信しない');
  assert.ok(harness.includes('data-lp-app'));
  // 終端の検証は DOMContentLoaded（app.jsのbootが先に登録済み）の後に走る
  assert.ok(harness.includes("if (document.readyState === 'loading')"), 'readyStateで分岐する');
  assert.ok(harness.includes("document.addEventListener('DOMContentLoaded', verify)"), 'boot後に検証する');
  assert.ok(harness.indexOf('function verify()') < harness.indexOf("addEventListener('DOMContentLoaded', verify)"));
});

test('[theme] 紙面は共通テーマの header/li 指定を受けない（画面枠だけテーマ追従）', () => {
  const js = read('site/app12/app.js');
  const css = read('site/app12/app.css');
  assert.ok(js.includes('<div class="lp-sheet__head">'), '紙面内はdiv');
  assert.equal(js.includes('<header class="lp-sheet__head">'), false, '素のheaderを置かない');
  assert.ok(/\.lp-sheet \.lp-meanings li \{[^}]*color:\s*#111\s*!important/.test(css), '意味リストの文字色を固定');
  assert.ok(/\.lp-sheet \.lp-meanings li:hover \{[^}]*background:\s*none\s*!important/.test(css), '紙面でホバー背景を出さない');
  // 画面のヘッダーはテーマ対象のまま
  const html = read('site/app12/index.html');
  assert.ok(html.includes('<header class="lp-header no-print">'));
});

test('[credits] html2canvas/jsPDFの用途に学習プリントを併記（版・内容は変えない）', () => {
  const credits = read('site/credits.html');
  assert.ok(credits.includes('原稿用紙メーカー・学習プリント（1.4.1 / jsDelivr）'));
  assert.ok(credits.includes('原稿用紙メーカー・学習プリント（2.5.2 / jsDelivr）'));
  assert.ok(credits.includes('html2canvas.hertzen.com'));
  assert.ok(credits.includes('github.com/parallax/jsPDF'));
});
