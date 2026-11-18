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
const S = require(path.join(APP, 'structure-draw.js'));
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

const R_LABEL = /^R(?:\d+|′)?$/;

function rLabels(spec) {
  const labels = [];
  spec.atoms.forEach((a) => {
    if (R_LABEL.test(a.label) && labels.indexOf(a.label) === -1) labels.push(a.label);
  });
  return labels;
}

function rDefKeys(item) {
  return item.rDefs.map((text) => text.split('=')[0].trim());
}

function formulaCounts(spec) {
  const counts = {};
  const add = (el, n) => { if (n) counts[el] = (counts[el] || 0) + n; };
  spec.atoms.forEach((a) => {
    if (R_LABEL.test(a.label)) return;
    add(a.el, 1);
    add('H', a.h);
  });
  return counts;
}

function equationCounts(items) {
  const total = {};
  items.forEach((item) => {
    const counts = formulaCounts(item.structure);
    Object.keys(counts).forEach((el) => {
      total[el] = (total[el] || 0) + counts[el] * item.coef;
    });
  });
  return total;
}

function extractFunctionSource(source, name) {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}').exec(source);
  assert.ok(match, name + ' の関数定義');
  return match[0];
}

function extractFunction(source, name) {
  return new Function('return (' + extractFunctionSource(source, name) + ');')();
}

function fakeKeyTarget(opts) {
  opts = opts || {};
  const target = {
    isContentEditable: !!opts.editable,
    closest(selector) {
      if (selector === '[data-kind]') return opts.kind ? target : null;
      if (opts.kind) return null;
      if (opts.native === 'button' && selector.indexOf('button') !== -1) return target;
      if (opts.native === 'input' && selector.indexOf('input') !== -1) return target;
      if (opts.native === 'link' && selector.indexOf('a[href]') !== -1) return target;
      if (opts.native === 'role-button' && selector.indexOf('[role="button"]:not([data-kind])') !== -1) return target;
      return null;
    }
  };
  return target;
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
  assert.equal(D.reactions.length, D.meta.reactionCount, '既存の反応を混ぜない');
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.confirmedReactionCount, D.reactions.length);
  assert.equal(D.meta.reactionCount, D.reactions.length);
  assert.equal(D.meta.classMapNodeCount, 12);
  assert.equal(D.meta.classMapEdgeCount, 16);
  assert.equal(D.meta.canvas.x, 0, 'canvas の原点を変えない');
  assert.equal(D.meta.canvas.y, 0, 'canvas の原点を変えない');
  assert.ok(D.meta.canvas.w >= 6052 && D.meta.canvas.h >= 2314, 'canvas は縮めない');

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
  assert.equal(doc.sources.length, 14);
  const urls = new Map([
    ['3.1', 'https://openstax.org/books/organic-chemistry/pages/3-1-functional-groups'],
    ['8.1', 'https://openstax.org/books/organic-chemistry/pages/8-1-preparing-alkenes-a-preview-of-elimination-reactions'],
    ['8.4', 'https://openstax.org/books/organic-chemistry/pages/8-4-hydration-of-alkenes-addition-of-h2o-by-oxymercuration'],
    ['9.5', 'https://openstax.org/books/organic-chemistry/pages/9-5-reduction-of-alkynes'],
    ['17.1', 'https://openstax.org/books/organic-chemistry/pages/17-1-naming-alcohols-and-phenols'],
    ['17.4', 'https://openstax.org/books/organic-chemistry/pages/17-4-alcohols-from-carbonyl-compounds-reduction'],
    ['17.6', 'https://openstax.org/books/organic-chemistry/pages/17-6-reactions-of-alcohols'],
    ['17.7', 'https://openstax.org/books/organic-chemistry/pages/17-7-oxidation-of-alcohols'],
    ['18.2', 'https://openstax.org/books/organic-chemistry/pages/18-2-preparing-ethers'],
    ['19.3', 'https://openstax.org/books/organic-chemistry/pages/19-3-oxidation-of-aldehydes-and-ketones'],
    ['21.3', 'https://openstax.org/books/organic-chemistry/pages/21-3-reactions-of-carboxylic-acids'],
    ['21.5', 'https://openstax.org/books/organic-chemistry/pages/21-5-chemistry-of-acid-anhydrides'],
    ['21.6', 'https://openstax.org/books/organic-chemistry/pages/21-6-chemistry-of-esters']
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

test('[structure] 12分類は一般構造のcustom specとR定義を持ち、実C・Oの結合価が正しい', () => {
  CM.nodes.forEach((n) => {
    assert.equal(n.structure.type, 'custom', n.id + ' の一般構造');
    assert.ok(Array.isArray(n.rDefs) && n.rDefs.length > 0, n.id + ' のR定義');
    const graph = S.buildStructure(n.structure);
    const valence = S._internal.checkValence(graph);
    assert.ok(valence.ok, n.id + ': ' + valence.errors.join(' / '));
    const labels = rLabels(n.structure);
    assert.ok(labels.length > 0, n.id + ' にR記号がない');
    const keys = rDefKeys(n);
    labels.forEach((label) => assert.ok(keys.includes(label), n.id + ' のR定義がない: ' + label));
    keys.forEach((key) => assert.ok(labels.includes(key), n.id + ' のR定義が式にない: ' + key));
    const svg = S.renderStructure(n.structure, n.name + 'の一般構造');
    assert.ok(svg.includes('data-kind="graph"'), n.id + ' の構造SVG');
    assert.equal(svg.includes('data-error="1"'), false, n.id + ' の構造SVGエラー');
    // 実C・OはRのダミーではなく、通常の原子価で描く。
    graph.atoms.forEach((a) => {
      if (a.skipValence) return;
      assert.ok(['C', 'O', 'H'].includes(a.el), n.id + ' の元素: ' + a.el);
    });
    n.structure.atoms.forEach((a) => {
      if (!R_LABEL.test(a.label)) return;
      assert.equal(a.el, 'C', n.id + ' のRは炭素として扱う');
      assert.equal(a.skipValence, true, n.id + ' のRは原子価検証の対象外');
    });
  });
});

test('[equation] 16変換は構造式の一般反応式・係数・矢印を持ち、元素収支が合う', () => {
  const signatures = new Set();
  CM.edges.forEach((e) => {
    assert.ok(D.types[e.type], e.id + ' の共通説明の種別: ' + e.type);
    assert.ok(['to', 'equilibrium'].includes(e.equation.arrow), e.id + ' の矢印');
    assert.ok(e.equation.left.length > 0 && e.equation.right.length > 0, e.id + ' の両辺');
    const all = e.equation.left.concat(e.equation.right);
    all.forEach((item) => {
      assert.ok(Number.isInteger(item.coef) && item.coef >= 1 && item.coef <= 9, e.id + ' の係数');
      assert.equal(item.structure.type, 'custom', e.id + ' の式の構造');
      const valence = S._internal.checkValence(S.buildStructure(item.structure));
      assert.ok(valence.ok, e.id + ': ' + valence.errors.join(' / '));
      const svg = S.renderStructure(item.structure, e.id + 'の一般構造');
      assert.equal(svg.includes('data-error="1"'), false, e.id + ' の構造SVG');
    });
    const left = equationCounts(e.equation.left);
    const right = equationCounts(e.equation.right);
    const keys = Object.keys(left).concat(Object.keys(right)).filter((el, i, arr) => arr.indexOf(el) === i);
    keys.forEach((el) => {
      assert.equal(left[el] || 0, right[el] || 0, e.id + ' の元素収支: ' + el);
    });
    signatures.add(JSON.stringify(e.equation));
  });
  assert.equal(signatures.size, 16, '同じ式をtypeへ一括流用しない');
});

test('[equation] R記号は式ごとに定義され、両辺で同じ意味になる', () => {
  CM.edges.forEach((e) => {
    const keys = rDefKeys(e);
    const labels = [];
    e.equation.left.concat(e.equation.right).forEach((item) => {
      rLabels(item.structure).forEach((label) => {
        if (labels.indexOf(label) === -1) labels.push(label);
        assert.ok(keys.includes(label), e.id + ' のR定義がない: ' + label);
      });
    });
    keys.forEach((key) => assert.ok(labels.includes(key), e.id + ' のR定義が式にない: ' + key));
    e.rDefs.forEach((text) => assert.match(text, /^R(?:\d+|′)?\s*=\s*\S/, e.id + ' のR定義: ' + text));
    // 一般図の式に具体物質名を混ぜない。
    D.compounds.forEach((c) => {
      if (c.name && c.name.length >= 2) {
        assert.equal(JSON.stringify(e.equation).includes(c.name), false, e.id + ' に具体物質名: ' + c.name);
      }
    });
  });
  CM.nodes.forEach((n) => {
    n.rDefs.forEach((text) => assert.match(text, /^R(?:\d+|′)?\s*=\s*\S/, n.id + ' のR定義: ' + text));
  });
});

test('[data] 一般図の確認は既存反応へ加算せず、未検証の別データとも書かない', () => {
  assert.equal(D.meta.confirmedReactionCount, D.reactions.length);
  assert.equal(D.meta.reactionCount, D.reactions.length);
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

test('[geometry] frameは詰めても余白を均し、面積25%以上・辺長を短縮し、具体図と棚から離す', () => {
  CM.nodes.forEach((n) => {
    assert.equal(n.w, 150, n.id + ' の幅は変えない');
    assert.equal(n.h, 40, n.id + ' の高さは変えない');
  });
  const frame = CM.frame;
  const area = CM.area;
  // area は frame の周囲6px
  assert.deepEqual(area, { x: frame.x - 6, y: frame.y - 6, w: frame.w + 12, h: frame.h + 12 });
  // 旧配置（4116,1526 1930x782 / 辺総長3575）からの削減
  const oldArea = 1930 * 782;
  assert.ok(frame.w * frame.h <= oldArea * 0.75, 'frame面積: ' + frame.w * frame.h);
  const edgeLength = CM.edges.reduce((sum, e) => sum + G.polylineLength(e.points.map(point)), 0);
  // 直前の配置（frame 1580x690 / 辺総長2950）からさらに25%以上短縮する。
  // 3575 だけを基準にすると今回の後退を検出できないため、2950 比で確かめる。
  assert.ok(edgeLength < 2950, '辺総長: ' + edgeLength);
  assert.ok(edgeLength <= 2950 * 0.75, '辺総長を2950から25%以上短縮: ' + edgeLength);
  // ノード範囲の余白は四辺とも明確に取る（旧 74/134/206/8 の偏りを残さない）
  const xs = CM.nodes.map((n) => n.x).concat(CM.nodes.map((n) => n.x + n.w));
  const ys = CM.nodes.map((n) => n.y).concat(CM.nodes.map((n) => n.y + n.h));
  const margins = {
    left: Math.min(...xs) - frame.x,
    top: Math.min(...ys) - frame.y,
    right: frame.x + frame.w - Math.max(...xs),
    bottom: frame.y + frame.h - Math.max(...ys)
  };
  Object.keys(margins).forEach((key) => {
    assert.ok(margins[key] >= 55, '余白 ' + key + ': ' + margins[key]);
  });
  // 近隣の具体図（右端 4103.5）と分野見出しの棚（下端 1512）から60以上離す
  assert.ok(frame.x - 4103.5 >= 60, '具体図との間隔: ' + (frame.x - 4103.5));
  assert.ok(frame.y - 1512 >= 60, '棚との間隔: ' + (frame.y - 1512));
  // canvas は広げない
  const canvas = D.meta.canvas;
  assert.equal(canvas.x, 0);
  assert.equal(canvas.y, 0);
  assert.ok(canvas.w >= 6052 && canvas.h >= 2314);
  assert.ok(frame.x >= canvas.x && frame.y >= canvas.y &&
    frame.x + frame.w <= canvas.x + canvas.w && frame.y + frame.h <= canvas.y + canvas.h);
  assert.ok(area.x >= canvas.x && area.y >= canvas.y &&
    area.x + area.w <= canvas.x + canvas.w && area.y + area.h <= canvas.y + canvas.h);
});

test('[geometry] 見出しはframe内のworld帯に固定され、ノード・変換線と重ならない', () => {
  const heading = { x: CM.frame.x + 28, y: CM.frame.y + 24, w: 250, h: 40 };
  assert.ok(heading.x > CM.frame.x && heading.y > CM.frame.y, '枠の内側');
  assert.ok(heading.x + heading.w < CM.frame.x + CM.frame.w, '枠の右内側');
  assert.ok(heading.y + heading.h < CM.frame.y + CM.frame.h, '枠の下内側');
  CM.nodes.forEach((n) => {
    assert.equal(G.rectsOverlap(heading, n), false, '見出しとノード: ' + n.id);
  });
  CM.edges.forEach((e) => {
    G.polylineSegments(e.points.map(point)).forEach((s) => {
      assert.equal(G.segmentRect(s.a, s.b, heading), false, '見出しと変換線: ' + e.id);
      assert.equal(G.segmentRect(s.a, s.b, G.inflate(heading, 6)), false, '見出しの余白と変換線: ' + e.id);
    });
  });
  const topNode = Math.min(...CM.nodes.map((n) => n.y));
  assert.ok(topNode >= heading.y + heading.h + 20, '見出し帯の下にノードを置く: ' + topNode);
});

test('[core] 見出しはパン・ズームで図と一緒に動き、画面の空き場所を探さない', () => {
  const app = read('app.js');
  assert.ok(app.includes("'rp-classmap__caption'"), 'world座標の見出しグループ');
  assert.ok(app.includes('frame.x + 28') && app.includes('frame.y + 24'), '枠内上帯の固定アンカー');
  assert.equal(/classMapCaptionSlot|captionBlockers|ensureReactionLabelBoxes|captionMetrics/.test(app), false,
    '画面位置の探索・障害物収集・ラベルbboxキャッシュを残さない');
  assert.equal(app.includes('is-title-only'), false, '題名だけへ縮める分岐を残さない');
  assert.equal(app.includes("heading.style.display = 'none'"), false, '見出しを消す分岐を残さない');
  assert.ok(app.includes('classMapData.title') && app.includes('classMapData.note'), 'タイトルと注記は同じ文言');
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

test('[geometry] 狭い画面の一般図fitで枠内見出し帯・右下フローティングが分類ノードを覆わない', () => {
  // focusClassMap と同じ予約（下: 12+現在位置50+導線24+10 のみ。上帯はworld固定なので予約しない）で
  // fit し、枠内の見出しbandがノード・現在位置と重ならないことを data 幾何で確かめる。
  const POSITION_H = 50;
  const JUMP_H = 24;
  const cases = [
    { w: 364, h: 354.47, label: '390px' },
    { w: 294, h: 280, label: '320px' },
    { w: 1236, h: 594, label: '1280px' }
  ];
  function hit(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  const headingWorld = { x: CM.frame.x + 28, y: CM.frame.y + 24, w: 250, h: 40 };
  cases.forEach((c) => {
    const reserveBottom = 12 + POSITION_H + JUMP_H + 10;
    const innerH = Math.max(140, c.h - reserveBottom);
    const fit = Core.fitRect(CM.area, c.w, innerH, 14, 0, 1.2);
    const screen = (r) => ({ x: fit.x + r.x * fit.scale, y: fit.y + r.y * fit.scale, w: r.w * fit.scale, h: r.h * fit.scale });
    const frame = screen(CM.frame);
    const heading = screen(headingWorld);
    const nodes = CM.nodes.map(screen);
    const position = { x: c.w - 12 - 300, y: c.h - 12 - POSITION_H, w: 300, h: POSITION_H };
    const jump = { x: c.w - 12 - 160, y: c.h - (12 + POSITION_H + 10) - JUMP_H, w: 160, h: JUMP_H };

    // area/frame と world 固定の見出しは viewport 内、右下フローティングと重ならない
    assert.ok(frame.x >= 0 && frame.y >= 0, c.label + ' frame 左上');
    assert.ok(frame.x + frame.w <= c.w && frame.y + frame.h <= c.h, c.label + ' frame 右下: ' + JSON.stringify(frame));
    assert.equal(hit(frame, position), false, c.label + ' frame と現在位置');
    assert.equal(hit(frame, jump), false, c.label + ' frame と導線');
    assert.ok(heading.x >= frame.x && heading.y >= frame.y, c.label + ' 見出しは枠内');
    assert.ok(heading.x + heading.w <= frame.x + frame.w, c.label + ' 見出しの右');
    assert.ok(heading.y + heading.h <= frame.y + frame.h, c.label + ' 見出しの下');
    nodes.forEach((n) => assert.equal(hit(heading, n), false, c.label + ' 見出しとノード'));
    assert.equal(hit(heading, position), false, c.label + ' 見出しと現在位置');
    assert.equal(hit(heading, jump), false, c.label + ' 見出しと導線');
  });
});

test('[static] 一般図のfitは見出しの画面帯を予約せず、枠内world見出しと浮遊コントロールだけを避ける', () => {
  const app = read('app.js');
  const css = read('app.css');
  assert.ok(app.includes('var innerH = Math.max(140, viewSize.h - bottom - top);'),
    '下帯（現在位置・導線）と上の浮遊コントロール分だけを予約する');
  assert.equal(app.includes('reserveTop'), false, '見出し用の上帯予約を残さない');
  assert.ok(app.includes('Core.fitRect(classMapData.area, viewSize.w, innerH, 14, 0, 1.2)'),
    '倍率下限なしのfitを維持');
  assert.ok(app.includes('var jumpH = jumpBox.h || 0;'), '右下の導線の実寸を使う');
  assert.ok(app.includes('var posH = positionBox.h || 48;'), '現在位置の実寸を予約に入れる');
  assert.ok(app.includes('var top = fitTopInset();'), '上部ツールバーの実寸を予約に入れる');
  assert.ok(app.includes('y: fit.y + top'), 'top を足して実表示領域の中心へ移す（top/2 では H/2 に戻る）');
  assert.ok(app.includes('Core.clampPan(insetFitView(fit, top), viewSize.w, viewSize.h, modeCanvas())'),
    'クランプは中心補正の後に行う');
  assert.match(css, /\.rp-classmap__caption\s*\{/);
  assert.match(css, /\.rp-classmap__caption-title\s*\{/);
  assert.match(css, /\.rp-classmap__caption-note\s*\{/);
  assert.equal(/\.rp-overlay__classmap/.test(css), false, '画面追従の見出しCSSを残さない');
  assert.equal(/titlePoint/.test(app), false, '旧world基準の位置定数を残さない');
  assert.ok(app.includes('classMapData.title') && app.includes('classMapData.note'), 'タイトルと注記は同じ文言');
});

test('[static] 既存の entity 処理を壊さず、分類ノードをキーボード・タップで開く', () => {
  const js = read('app.js');
  const html = read('index.html');
  assert.ok(html.includes('id="rp-classmap-jump"'), '右下の導線');
  assert.ok(html.includes('id="rp-classmap-note"'), '一般図の説明');
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data.js',
    'academic-data.js',
    'proposal-contract.js',
    'proposed-layout-data.js',
    'reaction-groups.js',
    'map-core.js',
    'structure-draw.js',
    'app.js'
  ], '読み込み順を固定');

  assert.ok(js.includes('D.classMap') && js.includes('buildClassMap'), 'classMap を別レイヤーに描く');
  assert.ok(js.includes("'data-kind': 'class'"), '分類ノードの種別');
  assert.ok(js.includes("selected.kind === 'class'"), '選択状態を明示的に分岐');
  assert.ok(js.includes("kind === 'class'"), 'フォーカス・カードを明示的に分岐');
  assert.ok(js.includes('classCard'), '一般図のカード');
  assert.ok(js.includes('一般適用範囲') && js.includes('例外・注意') && js.includes('資料'), 'カードの必須節');
  assert.ok(js.includes('classMapPosition'), '現在位置の対応');
  assert.ok(js.includes('updateClassEdgeHighlight'), '分類選択時の変換線の強調');
  assert.ok(js.includes('focusClassMap'), '導線の移動処理');
  assert.ok(js.includes('Core.fitRect(classMapData.area, viewSize.w, innerH, 14, 0, 1.2)'),
    '狭い画面でも切らないfit（倍率下限なし・下帯の予約込み）');
  assert.ok(js.includes('var innerH = Math.max(140, viewSize.h - bottom - top);'),
    '下の帯と上の浮遊コントロール分を予約する');
  assert.equal(js.includes('reserveTop'), false, '見出し用の上帯予約を残さない');
  assert.ok(js.includes('var top = fitTopInset();'), '上の浮遊コントロールの実寸を使う');
  assert.ok(js.includes('var jumpH = jumpBox.h || 0;'), '右下の導線の実寸を使う');
  assert.equal(js.includes('28, 0.55, 1.2'), false, '旧fit下限を残さない');
  assert.ok(js.includes("document.getElementById('rp-classmap-jump')"), '導線の配線');
  assert.ok(js.includes("if (entity && (e.key === 'Enter' || e.key === ' '))"),
    'Enter/Space で data-kind entity を開く');
  assert.ok(js.includes('openFromElement(entity)'), 'entity の open 配線を維持');
  assert.ok(js.includes("e.key === 'Escape'"), 'Escape で閉じる既存処理を維持');
  assert.ok(js.includes('returnFocus'), 'フォーカス復帰を維持');
  assert.ok(js.includes('card.contains(e.target)'), 'カード外クリックの判定を維持');
  assert.equal(js.includes("kind === 'compound' ? compoundCard(id) : reactionCard(id)"), false,
    'compound 以外を reaction とみなす分岐を残さない');
});

test('[static] 16変換は1本1タブストップで、透明ヒット・ラベル同一entity・aria-hiddenの外にある', () => {
  const js = read('app.js');
  const css = read('app.css');
  assert.ok(js.includes("'class': 'rp-classmap__edge-group'"), '変換グループ');
  assert.ok(js.includes("'data-kind': 'class-edge'"), '変換の種別');
  assert.ok(js.includes("role: 'button'") && js.includes("tabindex: '0'"), '1変換1タブストップ');
  assert.ok(js.includes("'class': 'rp-classmap__edge-hit'"), '透明な当たり判定');
  assert.equal(js.indexOf("'class': 'rp-classmap__edge-hit'") < js.indexOf('group.appendChild(label)'), true,
    'ラベルも同じグループに入れる');
  assert.equal(/rp-classmap__edges'\s*,\s*'aria-hidden'/.test(js), false, '変換レイヤーをaria-hiddenにしない');
  assert.equal(/rp-classmap__labels/.test(js), false, 'ラベルだけのaria-hiddenレイヤーを残さない');
  assert.ok(js.indexOf('classLayer.appendChild(edgeLayer)') < js.indexOf('classLayer.appendChild(nodeLayer)'),
    '変換よりノードを後に描き、重なりはノードを優先する');
  assert.match(css, /\.rp-classmap__edge-hit\s*\{[^}]*stroke:\s*transparent/);
  assert.match(css, /\.rp-classmap__edge-hit\s*\{[^}]*pointer-events:\s*stroke/);
  assert.match(css, /\.rp-classmap__edge-hit\s*\{[^}]*vector-effect:\s*non-scaling-stroke/);
  assert.match(css, /\.rp-classmap__edge-group\.is-selected\s+\.rp-classmap__edge\s*\{[^}]*stroke:/);
  assert.match(css, /\.rp-classmap__edge-group:focus-visible\s+\.rp-classmap__edge/);
  assert.ok(js.includes('classEdgePathIndex') && js.includes('classEdgeById'));
  assert.ok(js.includes('function classEdgeCard('));
  assert.ok(js.includes("kind === 'class-edge'") && js.includes("selected.kind === 'class-edge'"));
  assert.ok(js.includes('function equationFigure(') && js.includes('function buildEquationSvg('));
  assert.ok(js.includes('function typeCommon(') && js.includes('rDefsList'));
  assert.ok(js.includes('equationHasFormal(e.equation)'));
  assert.ok(js.includes('data-kind="class-edge"'), 'classCard の入出変換ボタン');
});

test('[keyboard] Enter/Spaceはdata-kind entityだけ開き、通常のbutton/input/linkはnative動作を保つ', () => {
  const app = read('app.js');
  const keyIntent = extractFunction(app, 'keyIntent');
  const isNativeKeyTarget = extractFunction(app, 'isNativeKeyTarget');
  const mapEntityFrom = extractFunction(app, 'mapEntityFrom');

  const plain = fakeKeyTarget({});
  const entity = fakeKeyTarget({ kind: 'class-edge' });
  const button = fakeKeyTarget({ native: 'button' });
  const input = fakeKeyTarget({ native: 'input' });
  const link = fakeKeyTarget({ native: 'link' });
  const roleButton = fakeKeyTarget({ native: 'role-button' });
  const editable = fakeKeyTarget({ editable: true });

  assert.equal(keyIntent('Enter', null), 'native', '通常要素のEnterは地図が奪わない');
  assert.equal(keyIntent(' ', null), 'native', '通常要素のSpaceは地図が奪わない');
  assert.equal(keyIntent('Enter', entity), 'open', 'entityのEnterは開く');
  assert.equal(keyIntent(' ', entity), 'open', 'entityのSpaceは開く');
  assert.equal(keyIntent('Tab', entity), 'native', 'Tabはブラウザへ返す');
  assert.equal(keyIntent('ArrowLeft', entity), 'map', 'entity上の矢印は地図操作を維持');
  assert.equal(keyIntent('+', null), 'map', '通常地図上のズームは維持');
  assert.equal(keyIntent('Home', null), 'map');
  assert.equal(keyIntent('a', null), 'native');

  assert.equal(mapEntityFrom(entity), entity);
  assert.equal(mapEntityFrom(plain), null);
  assert.equal(isNativeKeyTarget(button), true);
  assert.equal(isNativeKeyTarget(input), true);
  assert.equal(isNativeKeyTarget(link), true);
  assert.equal(isNativeKeyTarget(roleButton), true);
  assert.equal(isNativeKeyTarget(editable), true);
  assert.equal(isNativeKeyTarget(entity), false, 'SVG entityはnative扱いにしない');
  assert.equal(isNativeKeyTarget(plain), false);

  assert.ok(app.includes('if (keyIntent(e.key, entity) === \'native\') return;'));
  assert.ok(app.includes('if (!entity && isNativeKeyTarget(e.target)) return;'),
    'button/input/link上では矢印・ズームも地図へ奪わない');
  assert.ok(app.includes("if (entity && (e.key === 'Enter' || e.key === ' '))"));
  assert.ok(app.includes('openFromElement(entity);'));
  assert.equal(app.includes("case 'Enter'"), false, 'Enterを一律preventDefaultする分岐を残さない');
  assert.equal(app.includes('if (handled) e.preventDefault();'), false,
    '非entityのEnter/Spaceを一律preventDefaultしない');
  assert.ok(app.includes("classJump.addEventListener('click'"), '「一般図へ」のnative click配線');
  assert.ok(app.includes('focusClassMap(e.detail === 0)'), 'keyboard clickでも先頭へフォーカス');
});

test('[keyboard] 一般図へ直後のprogrammatic focusはreduce/animate両方でfitを維持し、通常Tabは追従する', () => {
  const app = read('app.js');
  const focusSrc = extractFunctionSource(app, 'focusClassMap');
  const focusInSrc = extractFunctionSource(app, 'onFocusIn');
  const insetSrc = extractFunctionSource(app, 'insetFitView');

  function run(reduce, top) {
    const view = { scale: 0.1993, x: 0, y: 0 };
    const fit = { scale: 0.45, x: 12, y: 20 };
    const topInset = typeof top === 'number' ? top : 0;
    const calls = [];
    let activeEl = null;
    let focusHandler = function () {};
    const first = {
      id: 'alkane',
      x: 4230,
      y: 2040,
      w: 150,
      h: 40,
      getAttribute(name) {
        if (name === 'data-kind') return 'class';
        if (name === 'data-id') return 'alkane';
        return null;
      },
      closest(selector) { return selector === '[data-kind]' ? this : null; },
      contains(other) { return other === this; },
      focus() { activeEl = this; focusHandler(this); }
    };
    const second = {
      id: 'alkene',
      x: 4490,
      y: 1880,
      w: 150,
      h: 40,
      getAttribute(name) {
        if (name === 'data-kind') return 'class';
        if (name === 'data-id') return 'alkene';
        return null;
      },
      closest(selector) { return selector === '[data-kind]' ? this : null; },
      contains(other) { return other === this; },
      focus() { activeEl = this; focusHandler(this); }
    };
    const Core = {
      fitRect() { return { scale: fit.scale, x: fit.x, y: fit.y }; },
      clampPan(target) { return target; },
      worldToScreen(v, x, y) { return { x: v.x + x * v.scale, y: v.y + y * v.scale }; },
      centerOn() { return { scale: 0.9, x: 100, y: 100 }; }
    };
    const documentStub = { get activeElement() { return activeEl; } };
    const animateTo = function (target) {
      calls.push(target);
      if (reduce) Object.assign(view, target);
    };
    const factory = new Function(
      'Core', 'viewSize', 'classMapData', 'D', 'animateTo', 'classNodeIndex',
      'classNodeById', 'view', 'activeRegion', 'clearRegionSelection', 'clearSelection',
      'compoundById', 'findReaction', 'nodeW', 'nodeH', 'document',
      'positionBox', 'jumpBox', 'fitTopInset', 'modeCanvas',
      'var programmaticFocusTarget = null;\nvar pointerFocusGuard = false;\n' + insetSrc + '\n' + focusSrc + '\n' + focusInSrc +
      '\nreturn { focusClassMap: focusClassMap, onFocusIn: onFocusIn };'
    );
    const api = factory(
      Core,
      { w: 364, h: 354.47 },
      { area: CM.area, nodes: [{ id: 'alkane' }] },
      { meta: { canvas: { x: 0, y: 0, w: 6052, h: 2314 } } },
      animateTo,
      { alkane: first, alkene: second },
      { alkane: first, alkene: second },
      view,
      null,
      function () {},
      function () {},
      {}, function () { return null; }, function () { return 150; }, function () { return 40; },
      documentStub,
      { w: 300, h: 50 },
      { w: 0, h: 0 },
      function () { return topInset; },
      function () { return { meta: { canvas: { x: 0, y: 0, w: 6052, h: 2314 } } }.meta.canvas; }
    );
    // 下帯（12+現在位置50）と上の浮遊コントロール分を予約した高さでfitし、上余白 top だけ下げる
    // （fitRect は innerH の中央へ置くため、実表示領域の中心へは top 加算）。
    const expected = { scale: fit.scale, x: fit.x, y: fit.y + topInset };
    focusHandler = function (el) { api.onFocusIn({ target: el }); };

    api.focusClassMap(true);
    assert.equal(calls.length, 1, (reduce ? 'reduce' : 'animate') + ': 全体fit以外へviewを書き換えない');
    assert.deepEqual(calls[0], expected, (reduce ? 'reduce' : 'animate') + ': fit先（上余白の予約込み）');
    assert.equal(activeEl, first, (reduce ? 'reduce' : 'animate') + ': 先頭nodeへfocusする');
    if (reduce) {
      assert.deepEqual(view, expected, 'reduceではfitが即時反映される');
    } else {
      Object.assign(view, calls[0]);
    }
    assert.deepEqual(view, expected, (reduce ? 'reduce' : 'animate') + ': fitを維持');

    const before = calls.length;
    api.onFocusIn({ target: second });
    assert.equal(calls.length, before + 1, '通常Tabの画面外nodeは従来どおり再センタリングする');
  }

  run(true, 0);
  run(false, 0);
  run(true, 40);
  run(false, 40);
  assert.ok(app.includes('programmaticFocusTarget = first;'), 'プログラムfocusの目印');
  assert.ok(app.includes('if (pending === target || (pending.contains && pending.contains(target))) return;'),
    'プログラムfocusだけonFocusInの再センタリングを抑止');
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
  assert.equal(/\.rp-classmap__caption[^{]*\{[^}]*display:\s*none/.test(css), false,
    '枠内見出しをCSSで消さない');
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
});
