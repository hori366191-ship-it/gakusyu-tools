/**
 * 有機反応マップ（site/app11）— 12分類の一般図（classMap）の再発防止テスト
 *
 * 実行: node --test scripts/tests/app11-class-map.test.cjs
 *
 * 既存の 427 物質・86 反応には混ぜず、独立キー classMap のデータ・幾何・
 * 表示配線・LOD・資料の公開範囲だけを検証する。ブラウザ操作は test サブエージェントが担当。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const SRC = path.join(ROOT, 'site-src', 'app11');
const D = require(path.join(APP, 'data.js'));
const Core = require(path.join(APP, 'map-core.js'));
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));
const { build, renderData } = require(path.join(ROOT, 'scripts', 'app11', 'build-map-data.cjs'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function sourceDoc() {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'class-map.json'), 'utf8'));
}

const CM = D.classMap;
const CLASS_NAMES = [
  'アルカン', 'アルケン', 'アルキン', 'エーテル',
  '第一級アルコール', '第二級アルコール', '第三級アルコール',
  'アルデヒド', 'ケトン', 'カルボン酸', '酸無水物', 'エステル'
];

function nodeMap() {
  return new Map(CM.nodes.map((n) => [n.id, n]));
}

function labelBox(edge) {
  const lines = [edge.label, edge.conditions].filter(Boolean);
  const w = Math.max(...lines.map((text) => G.textWidth(text, 10.5))) + 4;
  const h = 12 * lines.length + 4;
  const x = edge.labelPos.anchor === 'middle'
    ? edge.labelPos.x - w / 2
    : edge.labelPos.anchor === 'end' ? edge.labelPos.x - w : edge.labelPos.x;
  return { x, y: edge.labelPos.y - 10, w, h };
}

function point(p) {
  return { x: p[0], y: p[1] };
}

function edgeSegments(edge) {
  return G.polylineSegments(edge.points.map(point));
}

function screenRect(t, r) {
  return {
    x: t.x + r.x * t.scale,
    y: t.y + r.y * t.scale,
    w: r.w * t.scale,
    h: r.h * t.scale
  };
}

test('[data] classMap は独立キーで12分類16変換を持ち、既存の物質・反応件数を変えない', () => {
  assert.ok(CM, 'classMap がある');
  assert.equal(CM.nodeCount, 12);
  assert.equal(CM.edgeCount, 16);
  assert.equal(CM.nodes.length, 12);
  assert.equal(CM.edges.length, 16);
  assert.equal(D.compounds.length, 427, '既存の物質を混ぜない');
  assert.equal(D.reactions.length, 86, '既存の反応を混ぜない');
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.confirmedReactionCount, 86);
  assert.equal(D.meta.reactionCount, 86);
  assert.equal(D.meta.classMapNodeCount, 12);
  assert.equal(D.meta.classMapEdgeCount, 16);
  assert.deepEqual(D.meta.canvas, { x: 0, y: 0, w: 6052, h: 2314 }, 'canvas を拡大しない');

  const compoundIds = new Set(D.compounds.map((c) => c.id));
  const reactionIds = new Set(D.reactions.map((r) => r.id));
  CM.nodes.forEach((n) => assert.equal(compoundIds.has(n.id), false, n.id + ' を物質IDに混ぜない'));
  CM.edges.forEach((e) => assert.equal(reactionIds.has(e.id), false, e.id + ' を反応IDに混ぜない'));
  assert.equal(CM.nodes.length + D.compounds.length, 439, '表示要素は別々に数える');
});

test('[data] 分類名は指定の12種だけで、変換は弱連結1成分・自己ループなし', () => {
  assert.deepEqual(CM.nodes.map((n) => n.name).slice().sort(), CLASS_NAMES.slice().sort());
  const ids = new Set(CM.nodes.map((n) => n.id));
  assert.equal(ids.size, 12);
  CM.edges.forEach((e) => {
    assert.ok(ids.has(e.from), e.id + ' の変換元');
    assert.ok(ids.has(e.to), e.id + ' の変換先');
    assert.notEqual(e.from, e.to, e.id + ' の自己変換');
    assert.ok(e.label.length > 0 && e.conditions.length > 0 && e.note.length > 0, e.id + ' の説明');
  });

  const parent = new Map(CM.nodes.map((n) => [n.id, n.id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    return root;
  };
  CM.edges.forEach((e) => {
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent.set(a, b);
  });
  assert.equal(new Set(CM.nodes.map((n) => find(n.id))).size, 1, '弱連結1成分');
  CM.nodes.forEach((n) => {
    const degree = CM.edges.filter((e) => e.from === n.id || e.to === n.id).length;
    assert.ok(degree > 0, n.name + ' が孤立している');
    assert.equal(n.incoming, CM.edges.filter((e) => e.to === n.id).length, n.id + ' incoming');
    assert.equal(n.outgoing, CM.edges.filter((e) => e.from === n.id).length, n.id + ' outgoing');
  });
});

test('[data] 具体物質名を含まず、資料名・節・確認日だけを公開する', () => {
  const text = JSON.stringify(CM);
  D.compounds.forEach((c) => {
    if (c.name && c.name.length >= 2) {
      assert.equal(text.includes(c.name), false, '具体物質名が一般図に混ざる: ' + c.name);
    }
    if (c.label && c.label.length >= 2) {
      assert.equal(text.includes(c.label), false, '具体物質のラベルが一般図に混ざる: ' + c.label);
    }
  });
  assert.equal(text.includes('https://'), false, '公開データにURLを含めない');
  assert.equal(text.includes('openstax.org'), false, '公開データに資料ドメインを含めない');
  assert.equal(text.includes('"url"'), false, '公開データにURLフィールドを含めない');
  assert.equal(text.includes('builder'), false, '一般図にビルダー導線を含めない');

  const sources = [];
  CM.nodes.concat(CM.edges).forEach((item) => {
    assert.ok(Array.isArray(item.sources) && item.sources.length > 0, item.id + ' の資料');
    item.sources.forEach((s) => {
      assert.ok(s.includes(CM.sourceBook), item.id + ' の資料名: ' + s);
      assert.ok(/\d+\.\d+/.test(s), item.id + ' の節番号: ' + s);
      assert.ok(s.includes(CM.verifiedAt), item.id + ' の確認日: ' + s);
      sources.push(s);
    });
  });
  assert.ok(sources.length >= 12);
  assert.ok(CM.sources.length >= 8, '公開する資料の一覧');
  CM.sources.forEach((s) => assert.equal(s.includes('http'), false, '一覧にもURLを出さない'));
});

test('[source] 正本の資料URLは確認済みの OpenStax 節だけを内部保存する', () => {
  const doc = sourceDoc();
  assert.equal(doc.verifiedAt, '2026-11-14');
  assert.equal(doc.sources.length, 11);
  const urls = new Map([
    ['8.1', 'https://openstax.org/books/organic-chemistry/pages/8-1-preparing-alkenes-a-preview-of-elimination-reactions'],
    ['8.4', 'https://openstax.org/books/organic-chemistry/pages/8-4-hydration-of-alkenes-addition-of-h2o-by-oxymercuration'],
    ['9.5', 'https://openstax.org/books/organic-chemistry/pages/9-5-reduction-of-alkynes'],
    ['17.4', 'https://openstax.org/books/organic-chemistry/pages/17-4-alcohols-from-carbonyl-compounds-reduction'],
    ['17.6', 'https://openstax.org/books/organic-chemistry/pages/17-6-reactions-of-alcohols'],
    ['17.7', 'https://openstax.org/books/organic-chemistry/pages/17-7-oxidation-of-alcohols'],
    ['18.2', 'https://openstax.org/books/organic-chemistry/pages/18-2-preparing-ethers'],
    ['19.3', 'https://openstax.org/books/organic-chemistry/pages/19-3-oxidation-of-aldehydes-and-ketones'],
    ['21.3', 'https://openstax.org/books/organic-chemistry/pages/21-3-reactions-of-carboxylic-acids'],
    ['21.5', 'https://openstax.org/books/organic-chemistry/pages/21-5-chemistry-of-acid-anhydrides']
  ]);
  doc.sources.forEach((s) => {
    assert.equal(s.book, 'OpenStax Organic Chemistry (McMurry)');
    assert.equal(s.checkedAt, '2026-11-14', s.id + ' の確認日');
    if (s.url) {
      assert.equal(s.url, urls.get(s.section), s.id + ' のURL');
    }
  });
  assert.equal(doc.sources.find((s) => s.section === '8.6').url, undefined, '未提示の節はURLを推測しない');
  assert.ok(doc.sources.every((s) => !s.url || s.url.startsWith('https://openstax.org/books/organic-chemistry/pages/')),
    'OpenStax 以外のURLを混ぜない');
});

test('[data] 一般図の確認は既存86反応へ加算せず、未検証の別データとも書かない', () => {
  assert.equal(D.meta.confirmedReactionCount, 86);
  assert.equal(D.meta.reactionCount, 86);
  assert.equal(D.meta.classMapEdgeCount, 16);
  assert.match(D.meta.classMapNote, /加算しない/);
  assert.match(D.meta.classMapNote, /未検証の別データではない/);
  assert.match(D.meta.classMapNote, /独立資料/);
  assert.equal(D.meta.classMapVerifiedAt, '2026-11-14');
});

test('[build] data.js は class-map.json から独立キーとして再生成できる', () => {
  assert.equal(renderData(build()), read('data.js'), 'data.js が生成物と一致する');
  const again = build();
  assert.deepEqual(again.classMap, CM, '同じ正本から同じ classMap を作る');
});

test('[geometry] 12ノードは枠内で重ならず、分類名がノード幅に収まる', () => {
  const frame = CM.frame;
  for (let i = 0; i < CM.nodes.length; i++) {
    const a = CM.nodes[i];
    assert.ok(a.x >= frame.x && a.y >= frame.y, a.id + ' の左上');
    assert.ok(a.x + a.w <= frame.x + frame.w, a.id + ' の右');
    assert.ok(a.y + a.h <= frame.y + frame.h, a.id + ' の下');
    assert.ok(G.textWidth(a.name, 14) + 12 <= a.w, a.id + ' の分類名が収まらない');
    for (let j = i + 1; j < CM.nodes.length; j++) {
      const b = CM.nodes[j];
      assert.equal(G.rectsOverlap(a, b), false, 'ノードが重なる: ' + a.id + ' / ' + b.id);
    }
  }
});

test('[geometry] 変換線は枠内・端点は分類の辺・ノード貫通と交差・重なりは0', () => {
  const frame = CM.frame;
  const nodes = nodeMap();
  const edges = CM.edges.map((e) => ({ ...e, segs: edgeSegments(e) }));
  edges.forEach((e) => {
    e.points.forEach((p) => {
      assert.ok(p[0] >= frame.x && p[0] <= frame.x + frame.w, e.id + ' の x');
      assert.ok(p[1] >= frame.y && p[1] <= frame.y + frame.h, e.id + ' の y');
    });
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    assert.ok(G.distPointRect(point(e.points[0]), from) <= 0.01, e.id + ' の始点');
    assert.ok(G.distPointRect(point(e.points[e.points.length - 1]), to) <= 0.01, e.id + ' の終点');
    CM.nodes.forEach((n) => {
      const inner = { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 };
      e.segs.forEach((s) => {
        assert.equal(G.segmentRect(s.a, s.b, inner), false, e.id + ' が ' + n.id + ' を貫通');
      });
    });
  });
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      a.segs.forEach((sa) => b.segs.forEach((sb) => {
        assert.equal(G.segSegIntersection(sa.a, sa.b, sb.a, sb.b), null, '線の交差: ' + a.id + ' / ' + b.id);
        assert.ok(G.collinearOverlap(sa.a, sa.b, sb.a, sb.b) <= 0.1, '線の重なり: ' + a.id + ' / ' + b.id);
      }));
    }
  }
});

test('[geometry] 矢印・ラベルはノード文字・線・他のラベルと衝突しない', () => {
  const frame = CM.frame;
  const nodes = nodeMap();
  const edges = CM.edges.map((e) => ({ ...e, segs: edgeSegments(e) }));
  const boxes = edges.map((e) => ({ id: e.id, ...labelBox(e) }));
  boxes.forEach((b) => {
    assert.ok(b.x >= frame.x && b.y >= frame.y, b.id + ' のラベル左上');
    assert.ok(b.x + b.w <= frame.x + frame.w, b.id + ' のラベル右');
    assert.ok(b.y + b.h <= frame.y + frame.h, b.id + ' のラベル下');
    CM.nodes.forEach((n) => {
      assert.equal(G.rectsOverlap(b, n), false, 'ラベルとノード: ' + b.id + ' / ' + n.id);
      const textBox = { x: n.x + 8, y: n.y + 8, w: n.w - 16, h: n.h - 16 };
      assert.equal(G.rectsOverlap(b, textBox), false, 'ラベルと分類名: ' + b.id + ' / ' + n.id);
    });
    edges.forEach((e) => {
      e.segs.forEach((s) => {
        assert.equal(G.segmentRect(s.a, s.b, b), false, 'ラベルと線: ' + b.id + ' / ' + e.id);
      });
    });
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.equal(G.rectsOverlap(boxes[i], boxes[j]), false,
        'ラベル同士: ' + boxes[i].id + ' / ' + boxes[j].id);
    }
  }
  // 矢印の先端は分類の辺に接し、分類名の矩形には入らない。
  edges.forEach((e) => {
    const to = nodes.get(e.to);
    const tip = point(e.points[e.points.length - 1]);
    const textBox = { x: to.x + 8, y: to.y + 8, w: to.w - 16, h: to.h - 16 };
    assert.equal(G.pointInRect(tip, textBox), false, e.id + ' の矢印が分類名へ入る');
  });
});

test('[geometry] 390pxでも一般図の外枠がviewport内に収まり、倍率下限で切らない', () => {
  const viewW = 364;
  const viewH = 354.47;
  const fit = Core.fitRect(CM.area, viewW, viewH, 14, 0, 1.2);
  assert.ok(fit.scale > 0.1, 'fit倍率: ' + fit.scale);
  assert.ok(fit.scale < 0.55, '旧下限0.55を強制しない: ' + fit.scale);
  const areaBox = screenRect(fit, CM.area);
  const frameBox = screenRect(fit, CM.frame);
  assert.ok(areaBox.x >= -0.5 && areaBox.y >= -0.5, 'area 左/上');
  assert.ok(areaBox.x + areaBox.w <= viewW + 0.5, 'area 右');
  assert.ok(areaBox.y + areaBox.h <= viewH + 0.5, 'area 下');
  assert.ok(frameBox.x >= 0 && frameBox.y >= 0, 'frame 左/上');
  assert.ok(frameBox.x + frameBox.w <= viewW, 'frame 右 ' + (frameBox.x + frameBox.w));
  assert.ok(frameBox.y + frameBox.h <= viewH, 'frame 下 ' + (frameBox.y + frameBox.h));
  // 画面幅が広い場合も frame は切れない（fit は area 基準）
  [1200, 1236].forEach((w) => {
    const h = w === 1200 ? 475 : 594;
    const wide = Core.fitRect(CM.area, w, h, 14, 0, 1.2);
    const box = screenRect(wide, CM.frame);
    assert.ok(box.x >= 0 && box.y >= 0, w + 'px 左/上');
    assert.ok(box.x + box.w <= w && box.y + box.h <= h, w + 'px 右/下');
  });
});

test('[core] 現在位置は一般図の枠内だけ図名を返し、選択中の分類を添える', () => {
  const area = CM.area;
  const t = Core.centerOn({ x: area.x, y: area.y }, { w: area.w, h: area.h }, 1, 1200, 600);
  const text = Core.classMapPosition(t, CM, 1200, 600);
  assert.ok(text.includes(CM.title), text);
  const withName = Core.classMapPosition(t, CM, 1200, 600, 'アルケン');
  assert.ok(withName.includes(CM.title), withName);
  assert.ok(withName.includes('アルケン'), withName);
  assert.equal(Core.classMapPosition({ scale: 1, x: 0, y: 0 }, CM, 1200, 600), '', '枠外では主張しない');
  const overview = Core.fitTransform(D.meta.canvas, 1200, 600, 14);
  assert.equal(Core.classMapPosition(overview, CM, 1200, 600), '', '全体表示では一般図を名乗らない');
});

test('[static] 既存の entity 処理を壊さず、分類ノードをキーボード・タップで開く', () => {
  const js = read('app.js');
  const html = read('index.html');
  assert.ok(html.includes('id="rp-classmap-jump"'), '右下の導線');
  assert.ok(html.includes('id="rp-classmap-note"'), '一般図の説明');
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['data.js', 'map-core.js', 'structure-draw.js', 'app.js'], '読み込み順を固定');

  assert.ok(js.includes('D.classMap') && js.includes('buildClassMap'), 'classMap を別レイヤーに描く');
  assert.ok(js.includes("'data-kind': 'class'"), '分類ノードの種別');
  assert.ok(js.includes("selected.kind === 'class'"), '選択状態を明示的に分岐');
  assert.ok(js.includes("kind === 'class'"), 'フォーカス・カードを明示的に分岐');
  assert.ok(js.includes('classCard'), '一般図のカード');
  assert.ok(js.includes('一般適用範囲') && js.includes('例外・注意') && js.includes('資料'), 'カードの必須節');
  assert.ok(js.includes('classMapPosition'), '現在位置の対応');
  assert.ok(js.includes('updateClassEdgeHighlight'), '分類選択時の変換線の強調');
  assert.ok(js.includes('focusClassMap'), '導線の移動処理');
  assert.ok(js.includes('Core.fitRect(classMapData.area, viewSize.w, viewSize.h, 14, 0, 1.2)'),
    '狭い画面でも切らないfit（倍率下限なし）');
  assert.equal(js.includes('28, 0.55, 1.2'), false, '旧fit下限を残さない');
  assert.ok(js.includes("document.getElementById('rp-classmap-jump')"), '導線の配線');
  assert.ok(js.includes("case 'Enter'"), 'Enter で開く既存処理を維持');
  assert.ok(js.includes("e.key === 'Escape'"), 'Escape で閉じる既存処理を維持');
  assert.ok(js.includes('returnFocus'), 'フォーカス復帰を維持');
  assert.ok(js.includes('card.contains(e.target)'), 'カード外クリックの判定を維持');
  assert.equal(js.includes("kind === 'compound' ? compoundCard(id) : reactionCard(id)"), false,
    'compound 以外を reaction とみなす分岐を残さない');
});

test('[static] LOD は低倍率で見出し、局所拡大で分類名・反応名を出し、3テーマの変数を使う', () => {
  const css = read('app.css');
  assert.ok(css.includes('.rp-classmap__frame'));
  assert.ok(css.includes('.rp-classmap__edge'));
  assert.ok(css.includes('.rp-classmap__node-label'));
  assert.ok(css.includes('.rp-classmap__label'));
  const edgeLabelRule = (css.match(/\.rp-classmap__label\s*\{([^}]*)\}/) || [])[1] || '';
  assert.equal(/text-anchor\s*:/.test(edgeLabelRule), false, 'CSSで正本のtext-anchorを上書きしない');
  assert.equal(/\.rp-overlay__classmap\s+span\s*\{\s*display:\s*none/.test(css), false,
    '注記をモバイルで消さない');
  assert.match(css, /\.rp-map\[data-level="0"\] \.rp-classmap__node-label[\s\S]*?display:\s*none/);
  assert.match(css, /\.rp-map\[data-level="0"\] \.rp-classmap__label[\s\S]*?display:\s*none/);
  assert.match(css, /\.rp-map\[data-level="1"\] \.rp-classmap__label\s*\{\s*opacity:/);
  assert.match(css, /\.rp-map\[data-level="2"\] \.rp-classmap__label\s*\{\s*opacity:/);
  const classBlock = css.slice(css.indexOf('.rp-classmap__frame'), css.indexOf('/* ---------- html overlay'));
  assert.ok(classBlock.includes('var(--rp-panel)'));
  assert.ok(classBlock.includes('var(--rp-accent)'));
  assert.ok(classBlock.includes('var(--rp-node-ink)'));
  assert.equal(/#[0-9a-f]{3,6}/i.test(classBlock), false, '一般図の色はテーマ変数だけで持つ');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('@media (max-width: 760px)'));
  assert.ok(css.includes('overflow-x: hidden'));
  assert.ok(css.includes('.rp-classmap-jump'));
  assert.match(css, /\.rp-map\[data-level="0"\] \.rp-classmap-jump\s*\{\s*display:\s*inline-block/);
  assert.match(css, /\.rp-classmap-jump\s*\{[^}]*max-width:\s*calc\(100% - 20px\)/);
  const mobile = css.split('@media (max-width: 760px)')[1].split('@media (max-width: 430px)')[0];
  assert.match(mobile, /\.rp-classmap-jump\s*\{/);
  assert.match(mobile, /\.rp-overlay__classmap\s*\{/);
});
