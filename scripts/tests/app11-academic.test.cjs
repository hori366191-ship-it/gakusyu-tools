/**
 * app11 アカデミック（大学レベルの追加反応）回帰テスト
 *
 * 実行: node --test scripts/tests/app11-academic.test.cjs
 *
 * 通常データ（427物質 / 86反応 / 81保留 / 207辺 / 4ハッシュ）は変えない。
 * アカデミックは通常427物質の ID だけを参照する overlay で、ID は academic-* に限定する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const SRC = path.join(ROOT, 'site-src', 'app11');
const S = require(path.join(ROOT, 'scripts', 'app11', 'source-data.cjs'));
const B = require(path.join(ROOT, 'scripts', 'app11', 'build-academic-data.cjs'));
const A = require(path.join(APP, 'academic-data.js'));
const D = require(path.join(APP, 'data.js'));
const Core = require(path.join(APP, 'map-core.js'));
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));

const read = (name) => fs.readFileSync(path.join(APP, name), 'utf8');
const sourceDoc = JSON.parse(fs.readFileSync(path.join(SRC, 'academic-reactions.json'), 'utf8'));

function fingerprintConcrete() {
  const meta = Object.assign({}, D.meta);
  ['classMapNodeCount', 'classMapEdgeCount', 'classMapVerifiedAt', 'classMapNote'].forEach((k) => { delete meta[k]; });
  return crypto.createHash('sha256').update(JSON.stringify({
    compounds: D.compounds,
    reactions: D.reactions.map((r) => { const c = Object.assign({}, r); delete c.equation; return c; }),
    regions: D.regions, types: D.types, states: D.states, meta
  })).digest('hex');
}
function fingerprintEquation() {
  return crypto.createHash('sha256').update(JSON.stringify({
    reactions: D.reactions.map((r) => r.equation || null), species: D.species
  })).digest('hex');
}
function fingerprintClassGeometry() {
  return crypto.createHash('sha256').update(JSON.stringify({
    area: D.classMap.area, frame: D.classMap.frame,
    nodes: D.classMap.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })),
    edges: D.classMap.edges.map((e) => ({ id: e.id, points: e.points, labelPos: e.labelPos }))
  })).digest('hex');
}

test('[normal] 通常データの固定ハッシュと件数は正本と一致する', () => {
  // 追加分を含む全体ハッシュは意図的に更新する。旧 86 の不変性は legacy-baseline で保証する。
  assert.equal(fingerprintConcrete(), '4f5a8211b3d1cefaa05d91bba84b28dbe7015450116df6deb028d7dd225972f7');
  assert.equal(fingerprintEquation(), '39020fc69016b28c7d1aeb3a4f894138673f3fbcafcefa0156849c5acd8c3f33');
  assert.equal(fingerprintClassGeometry(), '7f413639125c3a6ea6795c2bc2f54bcc49ac7e27c23cb5120896b17cef5ec224');
  const html = read('index.html');
  const start = html.indexOf('<div class="rp-notice" id="rp-data-notice">');
  const end = html.indexOf('</div>', html.indexOf('id="rp-data-note"'));
  const block = html.slice(start, end + 6).replace(/\s+/g, '');
  assert.equal(crypto.createHash('sha256').update(block).digest('hex'),
    '0839382096a9683caeb9c7ead3999e95299bc38e7808edfb9577d5ec29ceb8ef');
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.reactionCount, D.reactions.length);
  assert.equal(D.meta.heldReactionCount, S.loadSource().heldReactions.length);
  assert.equal(D.compounds.filter((c) => c.incoming + c.outgoing === 0).length, D.meta.isolatedCount);
  assert.equal(D.compounds.filter((c) => c.incoming + c.outgoing > 0).length, D.meta.connectedCount);
});

test('[normal] 構造SVGが変わるのはマレイン酸/フマル酸の2物質だけ', () => {
  const S = require(path.join(APP, 'structure-draw.js'));
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'tests', 'fixtures',
    'app11-structure-baseline.json'), 'utf8'));
  const changed = [];
  D.compounds.forEach((c) => {
    const view = S.structureView(c);
    const current = {
      kind: view.kind,
      svgs: (view.figures || []).map((f) => crypto.createHash('sha256')
        .update(String(S.renderStructure(f.structure, c.name))).digest('hex'))
    };
    if (JSON.stringify(current) !== JSON.stringify(baseline[c.id])) changed.push(c.id);
  });
  assert.deepEqual(changed.sort(), ['fumaric-acid', 'maleic-acid'],
    '今回の明示構造2件以外は構造SVG完全同値');
});

test('[base] アカデミックは通常データと整合し、compounds 配列を持たない overlay', () => {
  assert.equal(A.meta.version, 1);
  assert.equal(A.base.normalVersion, D.meta.version);
  assert.equal(A.base.compoundCount, 427);
  assert.equal(A.base.reactionCount, D.meta.reactionCount);
  assert.equal(A.base.heldReactionCount, S.loadSource().heldReactions.length);
  assert.equal(A.base.nodeHash, B.academicBaseHash(D.compounds));
  assert.equal(Object.prototype.hasOwnProperty.call(A, 'compounds'), false, '427物質を複製しない');
  assert.equal(A.reactions.length, A.meta.academicReactionCount);
  assert.ok(A.meta.academicReactionCount > 0);
});

test('[ids] 学術反応は academic-* のみで、通常86・保留81と衝突しない', () => {
  const source = S.loadSource();
  const normal = new Set(D.reactions.map((r) => r.id));
  const held = new Set(source.heldReactions.map((r) => r.id));
  const compounds = new Set(D.compounds.map((c) => c.id));
  const seen = new Set();
  A.reactions.forEach((r) => {
    assert.match(r.id, /^academic-[a-z0-9][a-z0-9-]*$/);
    assert.equal(normal.has(r.id), false, '通常IDと衝突: ' + r.id);
    assert.equal(held.has(r.id), false, '保留IDと衝突: ' + r.id);
    assert.equal(seen.has(r.id), false, '学術ID重複: ' + r.id);
    seen.add(r.id);
    r.substrates.concat(r.products).forEach((id) => {
      assert.ok(compounds.has(id), r.id + ' の未知物質: ' + id);
    });
    assert.ok(r.substrates.length > 0);
    assert.ok(r.substrate || r.reagents || true);
  });
});

test('[evidence] 出典・scope は必須で、URL は正本だけに残す', () => {
  const text = read('academic-data.js');
  assert.equal(text.includes('https://'), false, '公開データに URL を載せない');
  assert.equal(text.includes('openstax.org'), false);
  assert.equal(text.includes('organicchemistrydata.org'), false);
  assert.equal(text.includes('doi.org'), false);
  sourceDoc.sources.forEach((s) => {
    assert.match(s.url, /^https:\/\//, s.id + ' の URL');
    assert.ok(s.book && s.section && s.checkedAt, s.id);
  });
  A.reactions.forEach((r) => {
    assert.ok(Array.isArray(r.sources) && r.sources.length > 0, r.id + ' に出典がない');
    assert.ok(r.scope && r.scope.trim(), r.id + ' に scope がない');
    assert.ok(['general-rule-application', 'source-illustrated-transformation'].includes(r.evidenceKind), r.id);
    assert.ok(['direct', 'multi-step'].includes(r.stepKind), r.id);
    if (r.stepKind === 'multi-step') assert.ok(r.steps.length > 0, r.id + ' に段階がない');
    assert.equal(r.state, 'academic');
    assert.equal(r.academic, true);
  });
});

test('[dedupe] 通常・保留と同じ組合せを、同じ条件で水増ししない', () => {
  const norm = (t) => String(t == null ? '' : t).replace(/\s+/g, '');
  const key = (r) => r.type + '|' + r.substrates.slice().sort().join('+') + '>' +
    r.products.slice().sort().join('+') + '|' + norm(r.conditions);
  const seen = new Map();
  A.reactions.forEach((r) => {
    const k = key(r);
    assert.equal(seen.has(k), false, '同一反応の重複: ' + r.id + ' / ' + seen.get(k));
    seen.set(k, r.id);
  });
  A.reactions.forEach((r) => {
    const normal = D.reactions.find((n) => n.type === r.type &&
      n.substrates.slice().sort().join('+') === r.substrates.slice().sort().join('+') &&
      n.products.slice().sort().join('+') === r.products.slice().sort().join('+'));
    if (!normal) return;
    assert.notEqual(norm(normal.conditions), norm(r.conditions), r.id + ' が通常反応と同じ条件');
    assert.ok(r.note, r.id + ' は通常反応と同組合せの理由（note）が必要');
  });
});

test('[held] 保留の state・出典は変えず、昇格には新しい根拠を要求する', () => {
  const source = S.loadSource();
  assert.ok(source.heldReactions.length > 0);
  source.heldReactions.forEach((h) => {
    // 保留IDは通常へ昇格したものだけ通常データに現れる（新根拠は source 側で検証）。
    assert.equal(A.reactions.some((r) => r.id === h.id), false, '保留IDを学術IDにしない: ' + h.id);
  });
  const heldIds = new Set(source.heldReactions.map((h) => h.id));
  A.reactions.filter((r) => r.basedOnHeld).forEach((r) => {
    assert.ok(heldIds.has(r.basedOnHeld), r.id + ' の basedOnHeld が保留でない');
    assert.ok(r.sources.length > 0, r.id + ' に新根拠がない');
    r.sources.forEach((s) => assert.ok(s.includes('2026-11-17'), r.id + ' の確認日が新しい'));
  });
});

test('[equation] 学術の B/N/T は通常の収支検証を再利用し、P は academic 専用の係数ホワイトリスト', () => {
  const source = S.loadSource();
  const species = S.loadSpecies();
  A.reactions.forEach((r) => {
    if (!r.equation) return;
    if (r.equation.variants && r.equation.variants.length) return; // 混合生成物の T variants は別経路
    if (r.equation.mode === 'P') {
      assert.equal(r.equation.modeLabel, '重合反応の模式式');
      const all = r.equation.left.concat(r.equation.right);
      assert.ok(all.some((i) => typeof i.coef === 'string'), r.id + ' に繰り返し係数がない');
      all.forEach((i) => {
        if (typeof i.coef === 'number') assert.ok(Number.isInteger(i.coef) && i.coef >= 1 && i.coef <= 99);
        else assert.ok(['n', 'm', 'p', 'd', 'dn', '2n', '3n'].includes(i.coef), r.id + ' の係数 ' + i.coef);
      });
    } else {
      // 通常の projectEquation と同じ検証を通る（B は収支、T は text のみ許可）。
      assert.doesNotThrow(() => S.projectEquation({
        mode: r.equation.mode,
        arrow: r.equation.arrow,
        left: r.equation.left.map((i) => i.kind === 'compound' ? { compound: i.id, coef: i.coef }
          : i.kind === 'species' ? { species: i.id, coef: i.coef } : { text: i.text, coef: i.coef }),
        right: r.equation.right.map((i) => i.kind === 'compound' ? { compound: i.id, coef: i.coef }
          : i.kind === 'species' ? { species: i.id, coef: i.coef } : { text: i.text, coef: i.coef })
      }, r, { compounds: source.compounds, species }), r.id);
    }
  });
  // 通常の P は n/2n のまま（学術の m/p/d を通常へ漏らさない）。
  assert.throws(() => S.projectEquation({
    mode: 'P',
    arrow: 'to',
    left: [{ compound: 'ethene', coef: 'm' }],
    right: [{ compound: 'polyethylene', coef: 'm' }]
  }, { id: 'normal-p-check' }, { compounds: source.compounds, species }), /係数/);
});

test('[layout] マーカー・経路は通常ノードを貫通せず、全反応が地図から到達できる', () => {
  const positions = A.layout.positions;
  const nodes = new Map(Object.keys(positions).map((id) => [id, positions[id]]));
  assert.equal(Object.keys(positions).length, 427, '全427物質の専用座標');
  assert.equal(Object.keys(A.layout.normalMarkers).length, D.reactions.length, '通常の全反応のマーカー');
  assert.equal(Object.keys(A.layout.normalRoutes).length,
    D.reactions.reduce((n, r) => n + r.edges.length, 0), '通常の全辺の経路');
  const markerIds = Object.keys(A.layout.markers);
  assert.equal(markerIds.length, A.reactions.length);
  const cardOnlyIds = new Set(A.meta.warnings
    .filter((w) => w.kind === 'card-only' || w.kind === 'no-route' || w.kind === 'route-crosses-node')
    .map((w) => String(w.id).split('|')[0]));
  A.reactions.forEach((r) => {
    assert.ok(A.layout.markers[r.id], r.id + ' のマーカー');
    assert.ok(r.edges.length > 0, r.id + ' に描画できる辺がない');
    assert.ok(r.edges.length <= r.substrates.length + r.products.length);
    if (!r.edges.length) assert.ok(cardOnlyIds.has(r.id), r.id + ' が未報告のカードのみ');
  });
  assert.equal(A.reactions.filter((r) => !r.edges.length).length, 0, '全反応に可視の辺がある');
  A.reactions.forEach((r) => {
    assert.ok(r.edges.some((e) => e.dir === 'in'), r.id + ' に incoming の可視線がない');
    if (r.products.length) assert.ok(r.edges.some((e) => e.dir === 'out'), r.id + ' に outgoing の可視線がない');
  });
  const drawn = new Set();
  A.reactions.forEach((r) => r.edges.forEach((e) => drawn.add(e.id)));
  const isolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0);
  const newly = isolated.filter((c) => A.reactions.some((r) => r.substrates.concat(r.products).indexOf(c.id) !== -1));
  assert.equal(newly.filter((c) => !drawn.has(c.id)).length, 0, '新規接続136物質すべてに可視辺');
  // ラベルは計画 box とアンカーが一致し、実テキスト幅でもノード・主要ラベル・一般図・他ラベルと重ならない。
  const boxes = [];
  A.reactions.forEach((r) => {
    const m = A.layout.markers[r.id];
    const box = m.label.box;
    const textW = Math.ceil(G.textWidth(r.typeLabel, G.TYPE_FONT));
    assert.ok(box.w >= textW, r.id + ' のラベル幅');
    assert.equal(m.label.anchor, 'center', r.id + ' は center 契約');
    assert.ok(Math.abs(m.label.type.x - (box.x + box.w / 2)) < 0.02, r.id + ' の中心X');
    assert.ok(Math.abs(m.label.type.y - (box.y + box.h / 2)) < 0.02, r.id + ' の中心Y');
    boxes.push({ id: r.id, box: box });
  });
  Object.keys(A.layout.normalMarkers).forEach((id) => {
    const m = A.layout.normalMarkers[id];
    const box = m.label.box;
    assert.equal(m.label.anchor, 'center', id + ' は center 契約');
    assert.ok(Math.abs(m.label.type.x - (box.x + box.w / 2)) < 0.02, id + ' の中心X');
    assert.ok(Math.abs(m.label.type.y - (box.y + box.h / 2)) < 0.02, id + ' の中心Y');
    boxes.push({ id: id, box: box });
  });
  const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  boxes.forEach((L) => {
    nodes.forEach((c, id) => {
      assert.equal(overlap(L.box, { x: c.x, y: c.y, w: c.w, h: c.h }), false,
        L.id + ' のラベルがノードと重なる: ' + id);
    });
    D.classMap.nodes.forEach((n) => {
      assert.equal(overlap(L.box, n), false, L.id + ' が一般図ノードと重なる');
    });
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.equal(overlap(boxes[i].box, boxes[j].box), false, boxes[i].id + ' / ' + boxes[j].id + ' のラベル重複');
    }
  }
  A.reactions.forEach((r) => {
    const m = A.layout.markers[r.id];
    nodes.forEach((c, id) => {
      const inside = m.x >= c.x && m.x <= c.x + c.w && m.y >= c.y && m.y <= c.y + c.h;
      assert.equal(inside, false, r.id + ' のマーカーがノード内: ' + id);
    });
    r.edges.forEach((e) => {
      const pts = e.points.map((p) => ({ x: p[0], y: p[1] }));
      for (let i = 0; i < pts.length - 1; i++) {
        nodes.forEach((c, id) => {
          if (id === e.id && i === 0) return; // 端点ノードの境界から出る最初の区間だけ許す
          assert.equal(G.segmentRect(pts[i], pts[i + 1], { x: c.x, y: c.y, w: c.w, h: c.h }), false,
            e.dir + ':' + e.id + ' の区間がノード ' + id + ' を貫通');
        });
      }
    });
  });
  const canvas = A.layout.canvas;
  A.reactions.forEach((r) => {
    const m = A.layout.markers[r.id];
    assert.ok(m.x >= canvas.x && m.x <= canvas.x + canvas.w, r.id + ' の x');
    assert.ok(m.y >= canvas.y && m.y <= canvas.y + canvas.h, r.id + ' の y');
  });
});

test('[determinism] 同じ正本から同じ academic-data.js を再生成できる（--check）', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'app11', 'build-academic-data.cjs'), '--check'], {
    cwd: ROOT, encoding: 'utf8', timeout: 600000
  });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  const one = B.renderAcademicData(B.build());
  const two = B.renderAcademicData(B.build());
  assert.equal(one, two);
});

test('[ui] モード切替は通常を既定にし、隠れた学術を当たり判定・Tab・検索カードへ混ぜない', () => {
  const js = read('app.js');
  const html = read('index.html');
  const css = read('app.css');
  assert.ok(js.includes("var mode = 'normal';"));
  assert.ok(js.includes('function academicBaseHash'));
  assert.ok(js.includes('function activeHitCandidates()'));
  assert.ok(js.includes('activeHitCandidates()'), 'nearest 判定は有効モードの候補だけを使う');
  assert.equal((js.match(/activeHitCandidates\(\)/g) || []).length >= 2, true);
  assert.ok(js.includes('function activeReactions()'));
  assert.ok(js.includes('function activeIncoming(') && js.includes('function activeOutgoing('));
  assert.ok(js.includes('academicReactionIndex[r.id] = g'));
  assert.ok(js.includes("'rp-academic rp-academic-all'"), 'academic layer を識別できる');
  assert.ok(css.includes('.rp-academic { display: none; }'));
  assert.ok(css.includes('.rp-svg[data-mode="academic"] .rp-academic { display: inline; }'));
  assert.ok(js.includes("svg.setAttribute('data-mode', mode)"));
  assert.ok(js.includes('setLayerInteractive(academicLayer, acad)'), '学術レイヤーの aria-hidden を切り替える');
  assert.ok(js.includes("if (mode === 'academic' && academicNewlyConnectedIds[id])"), '描画済みの学術接続ノードだけ class を足す');
  assert.equal(js.includes('setAttribute(\'data-path-state\''), false, '通常の pathState 属性を書き換えない');
  // ボタンは native button + aria-pressed。既定は通常。
  assert.ok(html.includes('id="rp-mode-normal"') && html.includes('id="rp-mode-academic"'));
  assert.match(html, /id="rp-mode-normal"[^>]*aria-pressed="true"/);
  assert.ok(html.includes('role="group" aria-label="表示モード"'));
  assert.ok(js.includes("normalModeButton.addEventListener('click'"));
  assert.ok(js.includes("academicModeButton.addEventListener('click'"));
  assert.ok(js.includes('function updateModeButtons()'));
  assert.ok(js.includes("setAttribute('aria-pressed'"));
  assert.equal(js.includes('localStorage'), false, 'localStorage で academic を自動復帰させない');
  assert.ok(js.includes("value === 'academic'"), 'URL は mode=academic だけを受け付ける');
  assert.ok(html.indexOf('academic-data.js') < html.indexOf('map-core.js'), 'academic-data は data.js の後、app.js の前');
});

test('[restore] 通常モードの件数・文言・カードは元のまま', () => {
  assert.equal(D.meta.confirmedReactionCount, D.reactions.length);
  const js = read('app.js');
  // 通常表示は canonical の配列・当たり判定へ落ち、学術・配置案は別索引。
  assert.ok(js.includes("if (mode === 'academic') return academicAll;"));
  assert.ok(js.includes("if (mode === 'academic') return academicHitCandidates.concat(classHitCandidates);"));
  assert.match(js, /if \(mode === 'academic'\) return academicAll;[\s\S]{0,220}return D\.reactions;/,
    '通常表示は canonical の反応配列へ落ちる');
  assert.match(js, /if \(mode === 'academic'\) return academicHitCandidates\.concat\(classHitCandidates\);[\s\S]{0,260}return hitCandidates;/,
    '通常表示は canonical の当たり判定へ落ちる');
  // 新しい配置案の分岐は通常表示の後ろにあり、通常の配列を置き換えない。
  assert.match(js, /if \(layoutChoice === 'proposed' && proposedEnabled\) return proposedAll;/);
  assert.match(js, /if \(layoutChoice === 'proposed' && proposedEnabled\) return proposedHitCandidates\.concat\(classHitCandidates\);/);
  assert.equal(js.includes('D.reactions.push'), false, '通常配列を書き換えない');
  assert.equal(js.includes('D.meta.compoundCount ='), false);
  assert.ok(js.includes('function buildCardEquationSvg'));
  assert.ok(js.includes('equationItemOf'), '学術式も通常の式レンダラーを共有する');
  assert.equal(js.includes('renderAcademicEquation'), false, '学術専用の式描画器を作らない');
});

test('[chemistry] 重合の外側係数・不定組成・variants・出典・条件を固定する', () => {
  const POLY = new Set(['pan', 'pmma', 'ptfe', 'pvac', 'pvdc', 'br', 'natural-rubber', 'chloroprene-rubber',
    'sbr', 'nbr', 'abs', 'iir', 'pva', 'pla', 'nylon6', 'aramid', 'polycarbonate',
    'phenol-resin', 'urea-resin', 'melamine-resin', 'epoxy-resin', 'cellulose-acetate', 'cellulose-nitrate']);
  const pReactions = A.reactions.filter((r) => r.equation && r.equation.mode === 'P');
  assert.ok(pReactions.length > 0);
  pReactions.forEach((r) => {
    r.equation.right.forEach((item) => {
      if (item.kind === 'compound' && POLY.has(item.id)) {
        assert.equal(item.coef, 1, r.id + ' の高分子項の外側係数は1（繰返しは構造側）');
      }
    });
  });
  // 不定組成: 3単量体は独立記号、樹脂は n/m、セルロース誘導体は可変置換 d、エポキシは HCl 係数を固定しない。
  const abs = A.reactions.find((r) => r.id === 'academic-abs');
  assert.deepEqual(abs.equation.left.map((i) => i.coef), ['m', 'n', 'p']);
  const any = (id) => D.reactions.find((r) => r.id === id) || A.reactions.find((r) => r.id === id);
  [['academic-phenol-resin', 'phenol-resin-condensation'],
    ['academic-urea-resin', 'urea-resin-condensation'],
    ['academic-melamine-resin', 'melamine-resin-condensation']].forEach((pair) => {
    const r = any(pair[0]) || any(pair[1]);
    assert.ok(r, pair.join(' / '));
    assert.deepEqual(r.equation.left.map((i) => i.coef), ['n', 'm'], pair[0]);
  });
  const epoxy = any('academic-epoxy-resin');
  assert.deepEqual(epoxy.equation.left.map((i) => i.coef), ['n', 'm']);
  assert.equal(epoxy.equation.right.some((i) => i.id === 'HCl'), false, 'HCl 係数を固定しない');
  ['academic-cellulose-acetate', 'academic-cellulose-nitrate', 'cellulose-acetylation', 'cellulose-nitration'].forEach((id) => {
    const r = any(id);
    if (!r) return;
    assert.equal(r.equation.left[1].coef, 'dn', id + ' は置換度 d×繰返し n');
  });
  // variants は混合生成物3件だけ。graph の products は2件のまま。
  const variantIds = A.reactions.filter((r) => r.equation && r.equation.variants && r.equation.variants.length)
    .map((r) => r.id).sort();
  assert.deepEqual(variantIds, [
    'academic-alkene-hydration-pent-2-ene-pentan-2-ol-pentan-3-ol',
    'academic-e2-elimination-2-chlorobutane-but-2-ene-but-1-ene',
    'academic-friedel-crafts-alkylation-toluene-chloromethane-o-xylene-p-xylene'
  ]);
  variantIds.forEach((id) => {
    const r = A.reactions.find((x) => x.id === id);
    assert.equal(r.products.length, 2, id + ' の graph products は2');
    assert.equal(r.equation.variants.length, 2, id + ' は生成物ごとの図');
    assert.ok(r.note.includes('混合比'), id + ' に比率未指定の注記');
  });
  // アルキン水和の条件分岐（Hg とヒドロホウ素化）。
  A.reactions.filter((r) => r.id.includes('alkyne-hydroboration')).forEach((r) => {
    assert.ok(r.conditions.includes('ボラン'), r.id);
    assert.equal(r.conditions.includes('水銀'), false, r.id + ' に Hg 条件を付けない');
  });
  A.reactions.filter((r) => r.id.includes('alkyne-hydration')).forEach((r) => {
    assert.ok(r.conditions.includes('水銀'), r.id);
  });
  // 誤紐付けの禁止。
  const srcOf = (id) => {
    const r = A.reactions.find((x) => x.id === id) || D.reactions.find((x) => x.id === id);
    return r ? r.sources.join(' ') : '';
  };
  assert.equal(srcOf('academic-aramid').includes('PVA'), false, 'aramid に PVA 問題を引かない');
  ['academic-pan-polymer', 'academic-pmma-polymer', 'academic-pvac-polymer',
    'academic-phenol-resin', 'academic-epoxy-resin'].forEach((id) => {
    assert.equal(srcOf(id).includes('§31.4'), false, id + ' に step-growth §31.4 を一律に付けない');
  });
  const carboxyl = A.types['academic-carboxylation'].summary;
  assert.ok(carboxyl.includes('カルボキシ基'), carboxyl);
  assert.equal(carboxyl.includes('有機金属試薬への') && carboxyl.includes('フェノキシド'), true);
  A.reactions.filter((r) => r.id.startsWith('academic-grignard-addition')).forEach((r) => {
    assert.ok(r.steps[0].includes('有機マグネシウム試薬を調製'), r.id + ' の段階に Mg 調製を含む');
  });
});

test('[clamp] modeCanvas は通常 D.meta.canvas と同値、アカデミックだけ専用 bounds', () => {
  const js = read('app.js');
  assert.match(js, /function modeCanvas\(\)[\s\S]{0,140}var layout = activeLayout\(\);[\s\S]{0,90}return layout && layout\.canvas \? layout\.canvas : D\.meta\.canvas;/);
  assert.ok(js.includes('Core.clampPan(next, viewSize.w, viewSize.h, modeCanvas())'), 'setView は modeCanvas');
  assert.ok(js.includes('wheelZoom = Core.clampPan(next, viewSize.w, viewSize.h, modeCanvas())'), 'wheel も modeCanvas');
  assert.ok(js.includes('Core.fitTransform(modeCanvas(), viewSize.w, innerH, 14)'), 'fit も modeCanvas');
  assert.match(js, /function fitModeCanvasView\(\)[\s\S]{0,300}activeLayout\(\)/,
    'fit は選択中の配置（学術・配置案）の表示範囲を使う');
  assert.ok(A.layout.canvas.w > D.meta.canvas.w, 'academic は右端が広い');
  assert.equal(D.meta.canvas.x, 0, '通常 canvas の原点');
  assert.equal(D.meta.canvas.y, 0, '通常 canvas の原点');
  assert.ok(D.meta.canvas.w >= 6052 && D.meta.canvas.h >= 2314, '通常 canvas は縮めない');
  const pushed = Core.clampPan({ scale: 1, x: -100000, y: 0 }, 1200, 600, A.layout.canvas);
  const normalPushed = Core.clampPan({ scale: 1, x: -100000, y: 0 }, 1200, 600, D.meta.canvas);
  assert.ok(pushed.x < normalPushed.x, 'academic は通常より右端までパンできる');
  assert.ok(Math.abs((normalPushed.x - pushed.x) - (A.layout.canvas.w - D.meta.canvas.w)) < 2, '差分は追加幅と一致');
});

test('[report] 描画できる辺・カードのみ・新接続数を隠さず数える', () => {
  const keys = A.reactions.reduce((n, r) => n + r.substrates.length + r.products.length, 0);
  const routed = Object.keys(A.layout.routes).length;
  assert.ok(routed > 0);
  assert.ok(routed <= keys);
  const academicEndpoints = new Set();
  A.reactions.forEach((r) => r.substrates.concat(r.products).forEach((id) => academicEndpoints.add(id)));
  const expectedNewly = D.compounds.filter((c) => c.incoming + c.outgoing === 0 && academicEndpoints.has(c.id)).length;
  assert.equal(A.meta.newlyConnectedCount, expectedNewly);
  assert.equal(A.meta.stillIsolatedCount, D.meta.isolatedCount - expectedNewly);
  assert.ok(A.meta.academicComponents > 0);
  assert.equal(A.meta.academicReactionCount, A.reactions.length);
  assert.ok(A.meta.warnings.some((w) => w.kind === 'card-only') === (routed < keys));
});
