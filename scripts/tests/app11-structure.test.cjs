/**
 * app11 物質カードの構造図 — データ抽出・分類・描画coverageの回帰テスト
 *
 * 実行: node --test scripts/tests/app11-structure.test.cjs
 *
 * app10 の構造specをオフラインで抽出した data.js と、app11 に凍結コピーした
 * structure-draw.js だけを使う。app10 の実行時読み込みは行わない。
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
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function category(plan) {
  if (!plan) return 'missing';
  if (plan.mode === 'multi') return 'projection';
  if (plan.mode === 'dual') return 'structure';
  const type = plan.exception && plan.exception.type;
  if (type === 'stereo' || type === 'complex') return 'fallback';
  return type || 'missing';
}

function renderView(view, compound) {
  return (view.figures || []).map((fig) => S.renderStructure(fig.structure, compound.name));
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function bondInCycle(graph, bond) {
  const adj = graph.atoms.map(() => []);
  graph.bonds.forEach((b) => {
    if (b === bond) return;
    adj[b.a].push(b.b);
    adj[b.b].push(b.a);
  });
  const seen = new Set([bond.a]);
  const stack = [bond.a];
  while (stack.length) {
    const current = stack.pop();
    for (const next of adj[current]) {
      if (next === bond.b) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

test('[data] 427物質に構造specが入り、既存の反応・必須数は変わらない', () => {
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.requiredCount, 294);
  assert.equal(D.meta.confirmedReactionCount, 86);
  assert.equal(D.meta.reactionCount, 86);
  assert.equal(D.compounds.length, 427);
  assert.equal(D.reactions.length, 86);
  D.compounds.forEach((c) => {
    assert.ok(c.structure && c.structure.type, c.id + ' の構造spec');
    assert.equal(Object.prototype.hasOwnProperty.call(c, 'precursors'), false, c.id + ' の自由文');
    assert.equal(Object.prototype.hasOwnProperty.call(c, 'reactions'), false, c.id + ' の反応メモ');
    assert.equal(Object.prototype.hasOwnProperty.call(c, 'nature'), false, c.id + ' の自由文');
  });
  const withFigures = D.compounds.filter((c) => c.figures && c.figures.length);
  assert.equal(withFigures.length, 2, '複数図の物質は2件');
  assert.ok(withFigures.every((c) => c.figures.length > 1));
});

test('[coverage] figurePlan の区分が 298/17/6/4/58/39/5 に一致する', () => {
  const counts = {};
  D.compounds.forEach((c) => {
    const cat = category(S.figurePlan(c));
    counts[cat] = (counts[cat] || 0) + 1;
  });
  assert.deepEqual(counts, {
    structure: 298,
    'atom-limit': 17,
    projection: 6,
    triglyceride: 4,
    schematic: 58,
    polymer: 39,
    fallback: 5
  });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 427);
  const audit = S.figureAudit(Object.fromEntries(D.compounds.map((c) => [c.id, c])));
  assert.equal(audit.dual, 298);
  assert.equal(audit.multi, 2);
  assert.deepEqual(audit.byType, {
    'atom-limit': 17,
    schematic: 58,
    stereo: 3,
    complex: 2,
    triglyceride: 4,
    projection: 6,
    polymer: 39
  });
});

test('[coverage] 全427物質が renderStructure でSVGを返し、エラーSVGを出さない', () => {
  const failures = [];
  D.compounds.forEach((c) => {
    const view = S.structureView(c);
    const svgs = renderView(view, c);
    if (!svgs.length) failures.push(c.id + ': 図なし');
    svgs.forEach((svg, idx) => {
      if (!svg || !svg.includes('<svg')) failures.push(c.id + '#' + idx + ': svgなし');
      if (svg && (svg.includes('data-error="1"') || svg.includes('構造データ未登録'))) {
        failures.push(c.id + '#' + idx + ': エラーSVG');
      }
    });
  });
  assert.deepEqual(failures.slice(0, 10), []);
  assert.equal(failures.length, 0);
});

test('[coverage] structureView の実表示区分が 298/17/6/4/58/39/5 に一致する', () => {
  const counts = {};
  const empty = [];
  D.compounds.forEach((c) => {
    const view = S.structureView(c);
    counts[view.kind] = (counts[view.kind] || 0) + 1;
    if (!view.figures || !view.figures.length) empty.push(c.id + ':' + view.kind);
  });
  assert.deepEqual(counts, {
    structure: 298,
    skeletal: 17,
    projection: 6,
    triglyceride: 4,
    schematic: 58,
    polymer: 39,
    fallback: 5
  });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 427);
  assert.deepEqual(empty, []);
  const captions = {
    structure: '構造式',
    skeletal: '骨格式（水素原子省略）',
    projection: '投影式',
    triglyceride: '油脂の簡略図',
    schematic: '模式図',
    polymer: '繰り返し単位',
    fallback: null
  };
  D.compounds.forEach((c) => {
    const view = S.structureView(c);
    if (view.kind !== 'fallback') {
      assert.equal(view.caption, captions[view.kind], c.id + ' の見出し');
    }
  });
});

test('[coverage] 骨格式17件はcondensedではなく炭素結合graphで描く', () => {
  const skeletal = D.compounds.filter((c) => S.structureView(c).kind === 'skeletal');
  assert.equal(skeletal.length, 17);
  skeletal.forEach((c) => {
    const view = S.structureView(c);
    assert.equal(view.caption, '骨格式（水素原子省略）', c.id);
    view.figures.forEach((fig) => {
      const svg = S.renderStructure(fig.structure, c.name);
      assert.ok(svg.includes('data-kind="graph"'), c.id + ' はgraphで描く');
      assert.equal(svg.includes('data-kind="condensed"'), false, c.id + ' は示性式に落とさない');
      assert.ok((svg.match(/rp-struct-bond"(?!-)/g) || []).length > 0, c.id + ' に結合線がある');
      const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '';
      const nums = vb.trim().split(/\s+/).map(Number);
      assert.ok(nums.length === 4 && nums[2] > 0 && nums[3] > 0, c.id + ' の正のviewBox');
      assert.equal(svg.includes('data-error="1"'), false, c.id);
    });
  });
  ['eicosane', 'stearic-acid', 'oleic-acid', 'sds', 'sodium-stearate'].forEach((id) => {
    const c = D.compounds.find((x) => x.id === id);
    const view = S.structureView(c);
    assert.equal(view.kind, 'skeletal', id);
    assert.equal(view.figures[0].structure.skeletal, true, id + ' はH省略');
    const svg = S.renderStructure(view.figures[0].structure, c.name);
    assert.ok((svg.match(/rp-struct-bond"(?!-)/g) || []).length >= 10, id + ' の結合線');
  });
});

test('[coverage] 不飽和骨格の非環状C=Cは未検証のcis/transを示唆しない', () => {
  const tested = [];
  D.compounds.forEach((c) => {
    const view = S.structureView(c);
    if (view.kind !== 'skeletal') return;
    // 元graph（carminic-acid / carthamin / heme）は検証済み座標を保持する対象外。
    if (c.structure.type !== 'condensed') return;
    view.figures.forEach((fig) => {
      const graph = fig.structure;
      const adj = graph.atoms.map(() => []);
      graph.bonds.forEach((b) => {
        if (graph.atoms[b.a].el === 'C' && graph.atoms[b.b].el === 'C') {
          adj[b.a].push(b.b);
          adj[b.b].push(b.a);
        }
      });
      graph.bonds.forEach((bond) => {
        if (bond.order !== 2) return;
        if (graph.atoms[bond.a].el !== 'C' || graph.atoms[bond.b].el !== 'C') return;
        if (bondInCycle(graph, bond)) return;
        const left = adj[bond.a].filter((i) => i !== bond.b);
        const right = adj[bond.b].filter((i) => i !== bond.a);
        left.forEach((l) => right.forEach((r) => {
          const lc = cross(graph.atoms[bond.a], graph.atoms[bond.b], graph.atoms[l]);
          const rc = cross(graph.atoms[bond.a], graph.atoms[bond.b], graph.atoms[r]);
          assert.equal(lc * rc < 0, false,
            c.id + ' のC=C両側が反対側（E示唆）: ' + lc + ' / ' + rc);
          tested.push(c.id);
        }));
      });
    });
  });
  assert.ok(tested.includes('sodium-oleate'), 'sodium-oleate を検査');
  assert.ok(tested.includes('linoleic-acid'), 'linoleic-acid を検査');
  assert.ok(tested.includes('oleic-acid'), 'oleic-acid を検査');
  assert.ok(tested.length >= 20, '非環状C=Cの検査数: ' + tested.length);

  const sodium = D.compounds.find((c) => c.id === 'sodium-oleate');
  const view = S.structureView(sodium);
  assert.equal(S.hasSpecifiedStereo(sodium), false, 'sodium-oleate は立体未指定');
  assert.ok(view.figures[0].structure.atoms.filter((a) => a.vertex).length >= 18,
    '炭素位置の頂点を明示');
  const svg = S.renderStructure(view.figures[0].structure, sodium.name);
  assert.ok((svg.match(/rp-struct-vertex/g) || []).length >= 18, 'SVGに炭素頂点');
  assert.ok((svg.match(/>CH<\/text>/g) || []).length >= 2, 'C=C炭素をCH表示');
  assert.ok(view.figures[0].structure.atoms.some((a) => a.el === 'Na'), 'Na塩を保持');
  assert.ok(view.figures[0].structure.atoms.some((a) => a.el === 'O'), '酸素を保持');
  assert.equal(S._internal.checkValence(view.figures[0].structure).ok, true, '原子価を保持');
  assert.equal(view.figures[0].structure.bonds.filter((b) =>
    b.order === 2 &&
    view.figures[0].structure.atoms[b.a].el === 'C' &&
    view.figures[0].structure.atoms[b.b].el === 'C').length, 1,
  'C=Cの結合次数を保持');

  const linolenic = D.compounds.find((c) => c.id === 'linolenic-acid');
  const linView = S.structureView(linolenic);
  const linGraph = linView.figures[0].structure;
  const linCarbons = linGraph.atoms.filter((a) => a.el === 'C');
  assert.equal(linCarbons.length, 18, 'linolenic-acid の炭素数');
  assert.equal(new Set(linCarbons.map((a) => a.x.toFixed(2) + ',' + a.y.toFixed(2))).size, 18,
    'linolenic-acid の炭素座標が一意');
  assert.equal(linGraph.atoms.filter((a) => a.vertex).length, 18, 'linolenic-acid の炭素頂点');
  const linSvg = S.renderStructure(linGraph, linolenic.name);
  const linLines = [...linSvg.matchAll(/<line\s+([^>]+)>/g)];
  assert.ok(linLines.length > 0);
  linLines.forEach((m) => {
    const attrs = m[1];
    const get = (name) => Number((attrs.match(new RegExp(name + '="([^"]+)"')) || [])[1]);
    assert.ok(Math.hypot(get('x2') - get('x1'), get('y2') - get('y1')) > 0.5,
      'linolenic-acid のSVG line長0');
  });
  // 明示stereoをもつ既存データは変更対象にしない。
  const fumaric = D.compounds.find((c) => c.id === 'fumaric-acid');
  assert.equal(S.hasSpecifiedStereo(fumaric), true, 'トランス形の明示spec');
  const maleic = D.compounds.find((c) => c.id === 'maleic-acid');
  assert.equal(S.hasSpecifiedStereo(maleic), true, 'シス形の明示spec');
});

test('[geometry] 17骨格は全辺長>epsilon・接続・原子価・枝交差・ラベル衝突0', () => {
  const skeletal = D.compounds.filter((c) => S.structureView(c).kind === 'skeletal');
  assert.equal(skeletal.length, 17);
  skeletal.forEach((c) => {
    const view = S.structureView(c);
    const graph = view.figures[0].structure;
    const atoms = graph.atoms;
    const edges = graph.bonds.map((b, i) => ({
      i,
      a: atoms[b.a],
      b: atoms[b.b],
      ba: b.a,
      bb: b.b
    }));
    assert.ok(edges.length > 0, c.id);
    edges.forEach((e) => {
      const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
      assert.ok(len > 1, c.id + ' の辺長 > 1: ' + len);
      assert.ok(len >= 20, c.id + ' の辺長が短すぎる: ' + len);
    });

    // 主成分（炭素鎖）は連結。Na+ などの単原子イオンだけ別成分を許す。
    const adj = atoms.map(() => []);
    graph.bonds.forEach((b) => {
      adj[b.a].push(b.b);
      adj[b.b].push(b.a);
    });
    const seen = new Set();
    const components = [];
    atoms.forEach((a, i) => {
      if (seen.has(i)) return;
      const comp = [];
      const stack = [i];
      seen.add(i);
      while (stack.length) {
        const current = stack.pop();
        comp.push(current);
        adj[current].forEach((next) => {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        });
      }
      components.push(comp);
    });
    const main = components.slice().sort((a, b) => b.length - a.length)[0];
    const mainSet = new Set(main);
    atoms.forEach((a, i) => {
      if (a.el === 'C') assert.ok(mainSet.has(i), c.id + ' の炭素が主成分の外');
    });
    components.forEach((comp) => {
      if (comp === main || comp.length !== 1) return;
      assert.ok(['Na', 'Cl', 'K', 'Li'].includes(atoms[comp[0]].el),
        c.id + ' の非連結成分: ' + atoms[comp[0]].el);
    });
    assert.equal(S._internal.checkValence(graph).ok, true, c.id + ' の原子価');

    // 実SVGの線長も0でないこと（データ上だけでなく描画要素を検査）。
    const svg = S.renderStructure(graph, c.name);
    const lineTags = [...svg.matchAll(/<line\s+([^>]+)>/g)].map((m) => m[1]);
    assert.ok(lineTags.length > 0, c.id + ' のSVG line');
    lineTags.forEach((attrs) => {
      const get = (name) => {
        const m = attrs.match(new RegExp(name + '="([^"]+)"'));
        return m ? Number(m[1]) : NaN;
      };
      const x1 = get('x1');
      const y1 = get('y1');
      const x2 = get('x2');
      const y2 = get('y2');
      const len = Math.hypot(x2 - x1, y2 - y1);
      assert.ok(len > 0.5, c.id + ' のSVG line長: ' + len);
    });

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const A = edges[i];
        const B = edges[j];
        if (A.ba === B.ba || A.ba === B.bb || A.bb === B.ba || A.bb === B.bb) continue;
        assert.equal(G.segSegIntersection(A.a, A.b, B.a, B.b), null, c.id + ' の枝交差');
        assert.ok(G.collinearOverlap(A.a, A.b, B.a, B.b) <= 1, c.id + ' の非接続辺の重なり');
      }
    }
    edges.forEach((e) => {
      atoms.forEach((a, i) => {
        if (i === e.ba || i === e.bb) return;
        assert.ok(G.distPointSeg(a, e.a, e.b) >= 8, c.id + ' の非接続原子-辺');
      });
    });

    const labels = [];
    atoms.forEach((a, i) => {
      const text = a.label || (a.el === 'C' ? null : a.el);
      if (!text) return;
      const w = G.textWidth(text, 23);
      labels.push({ i, text, box: { x: a.x - w / 2 - 2, y: a.y - 13, w: w + 4, h: 26 } });
    });
    labels.forEach((label) => {
      edges.forEach((e) => {
        if (e.ba === label.i || e.bb === label.i) return;
        assert.equal(G.segmentRect(e.a, e.b, label.box), false,
          c.id + ' の ' + label.text + ' ラベルと非接続辺');
      });
    });
    // 実SVGの線端点が文字矩形へ入らない（ラベル用の端点padding）。
    lineTags.forEach((attrs) => {
      const get = (name) => Number((attrs.match(new RegExp(name + '="([^"]+)"')) || [])[1]);
      const endpoints = [{ x: get('x1'), y: get('y1') }, { x: get('x2'), y: get('y2') }];
      labels.forEach((label) => {
        endpoints.forEach((p) => {
          assert.equal(
            p.x >= label.box.x && p.x <= label.box.x + label.box.w &&
            p.y >= label.box.y && p.y <= label.box.y + label.box.h,
            false,
            c.id + ' の ' + label.text + ' ラベルへ線端点が入る'
          );
        });
      });
    });
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        assert.equal(G.rectsOverlap(labels[i].box, labels[j].box), false,
          c.id + ' のラベル衝突: ' + labels[i].text + ' / ' + labels[j].text);
      }
    }
  });
});

test('[geometry] 元graph3（carminic-acid / carthamin / heme）は座標を変更しない', () => {
  ['carminic-acid', 'carthamin', 'heme'].forEach((id) => {
    const c = D.compounds.find((x) => x.id === id);
    const plan = S.figurePlan(c);
    assert.ok(plan.single && plan.single.structure, id);
    const source = S.buildStructure(plan.single.structure);
    const view = S.structureView(c);
    assert.equal(view.kind, 'skeletal', id);
    const graph = view.figures[0].structure;
    assert.equal(graph.atoms.length, source.atoms.length, id);
    graph.atoms.forEach((a, i) => {
      assert.equal(a.x, source.atoms[i].x, id + ' atom ' + i + ' x');
      assert.equal(a.y, source.atoms[i].y, id + ' atom ' + i + ' y');
    });
    assert.equal(graph.bonds.length, source.bonds.length, id);
    graph.bonds.forEach((b, i) => {
      assert.equal(b.a, source.bonds[i].a, id + ' bond ' + i + ' a');
      assert.equal(b.b, source.bonds[i].b, id + ' bond ' + i + ' b');
      assert.equal(b.order, source.bonds[i].order, id + ' bond ' + i + ' order');
    });
  });
});

test('[idempotent] structureView/renderStructureは入力を変更せず2回で同一', () => {
  D.compounds.filter((c) => S.structureView(c).kind === 'skeletal').forEach((c) => {
    const before = JSON.stringify({ structure: c.structure, figures: c.figures || null });
    const v1 = S.structureView(c);
    const v2 = S.structureView(c);
    assert.deepEqual(v1, v2, c.id + ' のstructureViewが決定的');
    assert.equal(JSON.stringify({ structure: c.structure, figures: c.figures || null }), before,
      c.id + ' の入力specが不変');
    const svg1 = S.renderStructure(v1.figures[0].structure, c.name);
    const svg2 = S.renderStructure(v2.figures[0].structure, c.name);
    assert.equal(svg1, svg2, c.id + ' のSVGが冪等');
  });
});

test('[clone] graph specのringCenterを浅く共有しない', () => {
  const atoms = [];
  for (let i = 0; i < 41; i++) atoms.push({ el: 'C', x: i * 10, y: 100, h: i < 2 ? 3 : 4 });
  const ringCenter = { x: 123, y: 456 };
  const fake = {
    id: 'synthetic-ring-center',
    name: '合成テスト',
    formula: 'C41H164',
    structure: {
      type: 'custom',
      atoms,
      bonds: [{ a: 0, b: 1, order: 1, ringCenter }],
      mode: 'expanded'
    }
  };
  const view = S.structureView(fake);
  assert.equal(view.kind, 'skeletal');
  const out = view.figures[0].structure;
  assert.deepEqual(out.bonds[0].ringCenter, { x: 123, y: 456 });
  assert.notEqual(out.bonds[0].ringCenter, ringCenter, 'ringCenterを共有しない');
  ringCenter.x = 999;
  assert.equal(out.bonds[0].ringCenter.x, 123, '入力側の変更が出力へ波及しない');
});

test('[fallback] stereo/complex の5件は詳細構造なし・condensed示性式で、構造式と呼ばない', () => {
  const fallback = D.compounds.filter((c) => S.structureView(c).kind === 'fallback');
  assert.equal(fallback.length, 5);
  fallback.forEach((c) => {
    const view = S.structureView(c);
    assert.equal(view.kind, 'fallback', c.id);
    assert.ok(view.caption.indexOf('示性式') === 0, c.id + ' の見出し: ' + view.caption);
    assert.equal(view.caption.includes('構造式'), false, c.id + ' を構造式と呼ばない');
    assert.ok(view.figures.length === 1, c.id);
    assert.equal(view.figures[0].structure.type, 'condensed', c.id + ' は示性式spec');
    const svg = S.renderStructure(view.figures[0].structure, c.name + 'の示性式');
    assert.ok(svg.includes('data-kind="condensed"'), c.id + ' のcondensed描画');
    assert.equal(svg.includes('data-error="1"'), false, c.id);
  });
  // 構造specが無い場合は formula を構造式として出さない（app側の明示的な未整備表示）。
  const empty = S.figurePlan({ id: 'x', name: 'x', formula: 'CH4' });
  assert.equal(empty.single, null);
  assert.equal(empty.exception.type, 'missing');
});

test('[draw] 凍結コピーは RPStructure 名前空間で、app10 の実行時読み込みをしない', () => {
  const code = read('structure-draw.js');
  assert.ok(code.includes('root.RPStructure = factory();'));
  assert.equal(code.includes('root.OCDraw'), false);
  assert.ok(code.includes('コピー元 commit: 9ef5e0999a73022ed0351303ad2d4944b80df16f'));
  assert.ok(code.includes('コピー元 SHA256: 861e0fd9fed7593ed07e2adf0a9812168d9dda1130428b91fdd052ab3eeaf11d'));
  assert.equal(/class="oc-/.test(code), false, 'oc- クラスを残さない');
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['data.js', 'map-core.js', 'structure-draw.js', 'app.js']);
  assert.equal(html.includes('../app10/draw.js'), false, 'app10描画器を読み込まない');
  const app = read('app.js');
  assert.ok(app.includes('window.RPStructure'));
  assert.ok(app.includes('SD.structureView(c)'));
  assert.ok(app.includes('SD.renderStructure(spec, ariaLabel)'));
  assert.equal(app.includes('SD.renderCompound'), false, '拡大ボタン付きrenderCompoundを使わない');
});

test('[card] compoundCard は formula 行を構造図へ置換し、classCard は個別構造ではなく一般構造だけを出す', () => {
  const app = read('app.js');
  const compoundStart = app.indexOf('function structureFigure(');
  const compoundEnd = app.indexOf('function compoundCard(');
  const structureBlock = app.slice(compoundStart, compoundEnd);
  assert.ok(structureBlock.length > 1000);
  assert.equal(structureBlock.includes('c.formula'), false, 'formula fieldを構造図に使わない');
  assert.ok(structureBlock.includes('SD.structureView(c)'), '実表示メタデータで見出しを決める');
  assert.ok(structureBlock.includes('rp-struct--fallback'), '示性式fallbackの控えめな表示');
  const draw = read('structure-draw.js');
  ['構造式', '骨格式（水素原子省略）', '投影式', '油脂の簡略図', '模式図', '繰り返し単位',
    '示性式（詳細構造なし）', '示性式（結合図未対応）']
    .forEach((caption) => assert.ok(draw.includes(caption), caption + ' の区分'));
  const cardStart = app.indexOf('function compoundCard(');
  const cardEnd = app.indexOf('function classCard(');
  const compoundCard = app.slice(cardStart, cardEnd);
  assert.ok(compoundCard.includes('structureFigureBlock(c)'));
  assert.equal(compoundCard.includes('rp-card__formula'), false, '冒頭のformulaだけの行を残さない');
  const classStart = app.indexOf('function classCard(');
  const classEnd = app.indexOf('function equationHasFormal(');
  const classCard = app.slice(classStart, classEnd);
  assert.ok(classCard.includes('classStructureFigure(n)'), '分類の一般構造を出す');
  assert.ok(app.includes('rDefsList(n.rDefs)'), '式ごとのR定義を出す');
  assert.equal(classCard.includes('SD.structureView'), false, '個別物質の構造データを使わない');
  assert.equal(classCard.includes('structureFigureBlock'), false, '個別物質の構造図を混ぜない');
  assert.equal(classCard.includes('compoundById'), false, '具体物質名を引かない');
  assert.ok(classCard.includes("data-kind=\"class-edge\""), '入出変換を変換カードへのボタンにする');
  assert.ok(app.includes('function classEdgeCard('), '変換専用カード');
  assert.ok(app.includes('equationFigure(e)'), '一般反応式を構造式SVGで出す');
  assert.ok(app.includes('function typeCommon('), '共通説明のshared helper');
  assert.ok(app.includes('html += typeCommon(type);'), '個別reactionCardも共通説明を共有する');
});

test('[theme] 構造図CSSは既存テーマ変数だけを使い、横overflowをカード内に閉じる', () => {
  const css = read('structure.css');
  assert.ok(css.includes('.rp-struct__canvas'));
  assert.ok(css.includes('overflow-x: auto'));
  assert.ok(css.includes('--rp-struct-width'));
  assert.ok(css.includes('--rp-struct-max'));
  assert.ok(css.includes('var(--rp-node-ink)'));
  assert.ok(css.includes('var(--rp-panel-2)'));
  assert.match(css, /\.rp-struct-svg \.rp-struct-atom\s*\{[^}]*stroke:\s*var\(--rp-panel\)/,
    'SVG textの背景halo');
  assert.match(css, /\.rp-struct-svg \.rp-struct-atom\s*\{[^}]*paint-order:\s*stroke/,
    '文字背景を線の上に描く');
  assert.equal(/#[0-9a-f]{3,6}/i.test(css), false, '色はテーマ変数だけで持つ');
  assert.ok(css.includes('@media (max-width: 430px)'));
  const appCss = read('app.css');
  assert.ok(appCss.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(read('index.html').includes('./structure.css'));
});

test('[focus] タッチ外tap後の互換mousedownでも起点focusを守り、操作要素は壊さない', () => {
  const app = read('app.js');
  assert.ok(app.includes('var suppressCompatFocus = false;'));
  assert.ok(app.includes("document.addEventListener('mousedown'"));
  assert.ok(app.includes("e.pointerType === 'touch' || e.pointerType === 'pen'"));
  assert.ok(app.includes("closest('a,button,input,select,textarea,summary,[tabindex],[contenteditable],[role=\"button\"]')"));
  assert.ok(app.includes('if (interactive) return;'));
  assert.ok(app.includes('e.preventDefault();'));
  assert.ok(app.indexOf('target.focus();\n      // タッチの互換mousedown') > 0, '復帰focusの直後に互換mousedownガードを設定');
  assert.equal(/setTimeout\([^)]*focus/.test(app), false, 'setTimeoutのfocusループを作らない');
  // 既存のEscape・カード外クリック・位置popoverの復帰配線を残す
  assert.ok(app.includes('closeCard(true)'));
  assert.ok(app.includes('restoreAfterPointer = returnFocus;'));
  assert.ok(app.includes('closePositionPopover(true)'));
});
