/**
 * 有機化学ビルダー（site/app10）— 化合物カードの2段階反応詳細
 *
 * 実行: node --test scripts/tests/app10-reaction-details.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。生成済みの公開データと、公開モジュール
 * （reaction-groups.js / organic-structure.js）だけを読み、実データで検証する。
 * 実際のクリック操作は test サブエージェントが担当する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app10');
const SHARED = path.join(ROOT, 'site', 'shared');

const D10 = require(path.join(APP, 'data.js'));
const D11 = require(path.join(ROOT, 'site', 'app11', 'data.js'));
const A11 = require(path.join(ROOT, 'site', 'app11', 'academic-data.js'));
const GROUPS = require(path.join(ROOT, 'site', 'app11', 'reaction-groups.js'));
const R = require(path.join(APP, 'draw.js'));

const COUNTS = require(path.join(SHARED, 'app10-reaction-detail-counts.js'));
const DETAILS = require(path.join(SHARED, 'app10-reaction-details.js'));
const EQUATIONS = require(path.join(SHARED, 'app10-reaction-equations.js'));

const APP_JS = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');

function readShared(name) {
  return fs.readFileSync(path.join(SHARED, name), 'utf8');
}

function allMembers() {
  const out = [];
  Object.keys(DETAILS.groups).forEach((gid) => {
    DETAILS.groups[gid].members.forEach((m) => out.push({ group: DETAILS.groups[gid], member: m }));
  });
  return out;
}

function groupOfReaction(reactionId) {
  const hit = Object.keys(DETAILS.groups)
    .map((gid) => DETAILS.groups[gid])
    .filter((g) => g.members.some((m) => m.id === reactionId))[0];
  return hit || null;
}

function compoundLevelRef(compoundId, groupId) {
  const record = DETAILS.byCompound[compoundId];
  if (!record) return null;
  for (const level of record.levels) {
    const ref = level.groups.filter((g) => g.groupId === groupId)[0];
    if (ref) return { level, ref };
  }
  return null;
}

test('[counts] 427化合物ぶんの件数があり、公開314反応と一致する', () => {
  const ids = Object.keys(D10.COMPOUNDS).sort();
  assert.equal(ids.length, 427);
  assert.deepEqual(Object.keys(COUNTS.byCompound).sort(), ids, '全化合物IDを件数表が持つ');
  assert.equal(COUNTS.totals.compounds, 427);
  assert.equal(COUNTS.totals.publishedReactions, 314);
  assert.equal(COUNTS.totals.normalReactions, 162);
  assert.equal(COUNTS.totals.academicReactions, 152);
  assert.equal(COUNTS.totals.highSchoolGroups, 156);
  assert.equal(COUNTS.totals.universityGroups, 152);
  assert.equal(COUNTS.totals.normalUntagged, 86);
  assert.equal(COUNTS.totals.normalStandard, 72);
  assert.equal(COUNTS.totals.normalExtension, 4);
  assert.equal(D11.reactions.length + A11.reactions.length, 314);

  for (const id of ids) {
    const value = COUNTS.byCompound[id];
    assert.ok(Array.isArray(value) && value.length === 2, id + ' は [高校, 大学] の2値');
    assert.ok(value[0] >= 0 && value[1] >= 0, id + ' の件数が負');
  }
});

test('[details] 314反応が重複なくグループ化され、各化合物から参照できる', () => {
  const members = allMembers();
  assert.equal(members.length, 314, '公開314反応がすべてグループに入る');
  const ids = members.map((entry) => entry.member.id);
  assert.equal(new Set(ids).size, 314, '同じ反応が複数グループに重複しない');

  const published = new Set([...D11.reactions, ...A11.reactions].map((r) => r.id));
  assert.deepEqual(new Set(ids), published, '保留（held）を含まず、公開分だけ');

  assert.deepEqual(Object.keys(DETAILS.byCompound).sort(), Object.keys(D10.COMPOUNDS).sort());
  for (const id of Object.keys(DETAILS.byCompound)) {
    const levels = DETAILS.byCompound[id].levels;
    const seenGroups = new Set();
    for (const level of levels) {
      assert.ok(level.key === 'high-school' || level.key === 'university', id + ' の教育段階キー');
      for (const ref of level.groups) {
        assert.ok(!seenGroups.has(ref.groupId), id + ' の同じグループを重複して持たない');
        seenGroups.add(ref.groupId);
        const group = DETAILS.groups[ref.groupId];
        assert.ok(group, id + ' のグループ参照が解決できる');
        const found = group.members.some((m) => m.id) && compoundLevelRef(id, ref.groupId);
        assert.ok(found, id + ' の参照が自身の化合物を含む');
      }
    }
  }
});

test('[index] 反応の基質・生成物は向きを保った役割で索引される', () => {
  const reactions = [...D11.reactions, ...A11.reactions];
  for (const r of reactions) {
    const group = groupOfReaction(r.id);
    assert.ok(group, r.id + ' のグループ');
    [...r.substrates, ...r.products].forEach((compoundId) => {
      const hit = compoundLevelRef(compoundId, group.id);
      assert.ok(hit, r.id + ': ' + compoundId + ' が化合物索引にない');
      const expected = r.substrates.includes(compoundId) ? 'substrate' : 'product';
      assert.equal(hit.ref.role, expected, r.id + ': ' + compoundId + ' の役割');
    });
  }

  const forward = groupOfReaction('ethene-hydration');
  const reverse = groupOfReaction('ethanol-dehydration-ethene');
  assert.notEqual(forward.id, reverse.id, '逆向きは別グループ');
  assert.equal(compoundLevelRef('ethanol', forward.id).ref.role, 'product');
  assert.equal(compoundLevelRef('ethanol', reverse.id).ref.role, 'substrate');
  assert.equal(compoundLevelRef('ethene', forward.id).ref.role, 'substrate');
  assert.equal(compoundLevelRef('ethene', reverse.id).ref.role, 'product');
});

test('[education] 2段階でまとめ、86/72/4/152の会員ラベルは保持する', () => {
  const buckets = { 'high-school': 0, university: 0 };
  const memberLabels = { '高校': 0, '高校標準': 0, '高校発展': 0, '大学レベル': 0 };
  Object.keys(DETAILS.groups).forEach((gid) => {
    const group = DETAILS.groups[gid];
    buckets[group.bucket] += group.members.length;
    group.members.forEach((m) => { memberLabels[m.education] += 1; });
    assert.ok(group.education === '高校' || group.education === '高校標準' ||
      group.education === '高校発展' || group.education === '大学レベル');
  });
  assert.deepEqual(buckets, { 'high-school': 162, university: 152 });
  assert.deepEqual(memberLabels, { '高校': 86, '高校標準': 72, '高校発展': 4, '大学レベル': 152 });
  assert.equal(new Set(Object.values(DETAILS.groups).map((g) => g.bucket)).size, 2);

  const mixed = DETAILS.groups['high-school|group:[["ethanol"],["ethanal"]]'];
  assert.ok(mixed, '高校内で段階が混在する実グループ');
  assert.equal(mixed.education, '高校', '混在グループの見出しは総称「高校」');
  assert.deepEqual(mixed.members.map((m) => m.education).sort(),
    ['高校', '高校標準', '高校標準'], '各会員は元の段階を保持');

  const levels = new Set();
  Object.values(DETAILS.byCompound).forEach((record) => {
    record.levels.forEach((level) => levels.add(level.key));
  });
  assert.deepEqual([...levels].sort(), ['high-school', 'university']);
});

test('[group] 同じ端点の反応だけをまとめ、別の反応は分ける', () => {
  const key = 'high-school|group:[["ethanol"],["ethanal"]]';
  const group = DETAILS.groups[key];
  assert.ok(group, 'エタノール→エタナールのグループ');
  assert.equal(group.size, 3);
  assert.deepEqual(group.members.map((m) => m.id).sort(), [
    'ethanol-cuo-oxidation',
    'ethanol-dichromate-oxidation-ethanal',
    'ethanol-oxidation-ethanal'
  ]);
  assert.deepEqual(group.substrates, ['ethanol']);
  assert.deepEqual(group.products, ['ethanal']);

  const larger = Object.values(DETAILS.groups).filter((g) => g.size > 1);
  assert.equal(larger.length, 5, '高校の同一端点5組（反応6件を圧縮）をまとめる');
  larger.forEach((g) => {
    assert.ok(g.members.length > 1);
    assert.equal(new Set(g.members.map((m) => m.id)).size, g.members.length);
  });
});

test('[parity] 高校は app11 共有グルーパーと同じ156グループ', () => {
  const built = GROUPS.build(D11.reactions);
  assert.equal(built.groupCount, 156);
  assert.equal(built.reactionCount, 162);

  const packGroups = Object.keys(DETAILS.groups)
    .filter((gid) => DETAILS.groups[gid].bucket === 'high-school')
    .map((gid) => DETAILS.groups[gid]);
  assert.equal(packGroups.length, 156);

  const byKey = new Map(packGroups.map((g) => [
    g.id.replace('high-school|', ''),
    g
  ]));
  built.groups.forEach((group) => {
    const mine = byKey.get(group.id);
    assert.ok(mine, '共有グルーパーのグループ: ' + group.id);
    assert.deepEqual(mine.substrates.slice().sort(), group.substrateIds.slice().sort());
    assert.deepEqual(mine.products.slice().sort(), group.productIds.slice().sort());
    assert.deepEqual(mine.members.map((m) => m.id).sort(), group.memberIds.slice().sort());
    assert.equal(mine.size, group.size);
  });

  const mixed = built.groups.filter((g) => g.memberIds.some((id) => {
    const r = D11.reactions.filter((x) => x.id === id)[0];
    return !r.educationLevel;
  }) && g.size > 1);
  assert.ok(mixed.length >= 1, '段階混在の実グループが存在する');
  const sample = mixed.filter((g) => g.substrateIds[0] === 'ethanol' && g.productIds[0] === 'ethanal')[0];
  assert.ok(sample, 'ethanol→ethanal の混在グループ');
  const mine = byKey.get(sample.id);
  assert.equal(mine.education, '高校');
  assert.equal(mine.members.length, 3);
});

test('[held] 保留反応の本文は持たず、根拠IDだけを注記する', () => {
  const members = allMembers().map((entry) => entry.member);
  const heldIds = new Set(members.map((m) => m.id).filter((id) => /-held$/.test(id)));
  assert.equal(heldIds.size, 0);
  assert.equal(members.some((m) => m.state === 'held'), false);

  const aramid = members.filter((m) => m.id === 'academic-aramid')[0];
  assert.ok(aramid, 'basedOnHeld を持つ大学反応');
  assert.equal(aramid.basedOnHeld, 'aramid-condensation');
  assert.equal(members.some((m) => m.id === aramid.basedOnHeld), false,
    '保留反応そのものは収録しない');
});

test('[equation] 314反応ぶんの式があり、変種・多段階・種・出典を保つ', () => {
  assert.deepEqual(Object.keys(EQUATIONS.byReactionId).sort(),
    allMembers().map((entry) => entry.member.id).sort());

  const members = allMembers();
  members.forEach(({ member }) => {
    assert.ok(member.sources.length > 0, member.id + ' の出典');
    assert.ok(member.conditions, member.id + ' の条件');
    assert.ok(DETAILS.types[member.typeKey], member.id + ' の反応型');
  });

  const multi = members.filter(({ member }) => member.id === 'ethyne-full-hydrogenation')[0].member;
  assert.equal(multi.stepKind, 'multi-step');
  assert.equal(multi.steps.length, 2, '多段階の段を保つ');

  const variant = members.filter(({ member }) => member.id === 'fructose-base-isomerization')[0].member;
  assert.equal(variant.equation.hasVariants, true);
  assert.equal(EQUATIONS.byReactionId['fructose-base-isomerization'].equations.length, 2);
  assert.deepEqual(variant.equation.variantLabels, ['グルコースへの異性化', 'マンノースへの異性化']);

  const speciesNames = new Set();
  Object.values(EQUATIONS.byReactionId).forEach((plan) => {
    plan.equations.forEach((eq) => {
      [...eq.left, ...eq.right].forEach((item) => speciesNames.add(item.name));
    });
  });
  assert.ok(speciesNames.has('塩素') || speciesNames.has('水素'), '種（species）の名称を保つ');

  const textFallback = EQUATIONS.byReactionId['sodium-phenoxide-carboxylation'];
  assert.ok(textFallback.equations[0].left.concat(textFallback.equations[0].right)
    .some((item) => item.fallback && !item.structure), '構造を持たない項目はfallbackで示す');
});

test('[equation] 共有レンダラで全318式が例外なく描画できる', () => {
  let rendered = 0;
  Object.keys(EQUATIONS.byReactionId).forEach((id) => {
    const plan = EQUATIONS.byReactionId[id];
    assert.ok(plan.equations.length >= 1, id + ' の式');
    plan.equations.forEach((entry) => {
      const svg = R.renderEquation({
        arrow: entry.arrow,
        above: entry.above,
        below: entry.below,
        left: entry.left,
        right: entry.right
      }, id, { stack: true });
      assert.ok(svg && svg.includes('oc-eq-svg'), id + ' のSVG');
      assert.equal(/data-error="1"/.test(svg), false, id + ' の描画エラー');
      rendered += 1;
    });
  });
  assert.equal(rendered, 318);
});

test('[laziness] 件数だけ即時、詳細と式は2段階で遅延読込する', () => {
  const countTag = INDEX_HTML.match(/app10-reaction-detail-counts\.js/g) || [];
  assert.equal(countTag.length, 1, '件数表を1回だけ読む');
  assert.equal(INDEX_HTML.includes('app10-reaction-details.js'), false,
    '詳細パックを index.html で即時読み込みしない');
  assert.equal(INDEX_HTML.includes('app10-reaction-equations.js'), false,
    '式パックを index.html で即時読み込みしない');
  assert.ok(INDEX_HTML.indexOf('app10-reaction-detail-counts.js') <
    INDEX_HTML.indexOf('./app.js'), '件数表を app.js より先に読む');

  assert.ok(APP_JS.includes("loadReactionScript('app10-reaction-details.js')"));
  assert.ok(APP_JS.includes("loadReactionScript('app10-reaction-equations.js')"));
  assert.ok(APP_JS.includes('ensureReactionDetails'));
  assert.ok(APP_JS.includes('ensureReactionEquations'));
  assert.equal(APP_JS.includes('app11/app.js'), false, 'app11 の app.js を読み込まない');
  assert.equal(APP_JS.includes("src=\"../app11/app.js\""), false);

  const countsSize = fs.statSync(path.join(SHARED, 'app10-reaction-detail-counts.js')).size;
  assert.ok(countsSize < 20000, '件数表は小さい: ' + countsSize);
  const detailText = readShared('app10-reaction-details.js');
  assert.equal(/"edges"/.test(detailText), false, 'マップ専用のedgesを含まない');
  assert.equal(/"cross"/.test(detailText), false, 'マップ専用のcrossを含まない');
});

test('[render] 反応ブロックは全カードに入り、未収録は明示する', () => {
  assert.ok(APP_JS.includes('reactionBlockHtml(c.id)'), 'renderCard が反応ブロックを出す');
  assert.ok(APP_JS.includes('関連反応は未収録'), '空のときの文言');
  assert.ok(APP_JS.includes("onReactionToggle"), 'details の開閉を拾う');
  assert.ok(APP_JS.includes("addEventListener('toggle'"), 'toggle を capture で受ける');
  assert.ok(APP_JS.includes('data-reaction-level'), 'レベルdetailsを直接開く');
  assert.ok(APP_JS.includes('data-level-body'), 'レベル本文だけを遅延充填する');
  assert.equal(APP_JS.includes('data-reaction-body'), false, '外側の詳細コンテナを持たない');
  assert.equal(APP_JS.includes('function reactionLevelHtml'), false, '3段目のレベル生成を残さない');

  const noReactions = Object.keys(COUNTS.byCompound).filter((id) => {
    const v = COUNTS.byCompound[id];
    return v[0] === 0 && v[1] === 0;
  });
  assert.ok(noReactions.length > 0, '未収録の化合物も存在する');
  noReactions.forEach((id) => {
    assert.equal(DETAILS.byCompound[id].levels.length, 0, id + ' は空のレベルを持つ');
  });
});

test('[pack] 3ファイルのversionとpackVersionが一致する', () => {
  [COUNTS, DETAILS, EQUATIONS].forEach((pack) => {
    assert.equal(pack.version, 1);
    assert.equal(typeof pack.packVersion, 'string');
    assert.ok(pack.packVersion.length > 0);
  });
  assert.equal(DETAILS.packVersion, COUNTS.packVersion);
  assert.equal(EQUATIONS.packVersion, COUNTS.packVersion);
  assert.equal(DETAILS.packVersion, EQUATIONS.packVersion);
});

test('[summary] 折りたたみにも全端点の完全名を出し、生成物IDが無いときはproductNote', () => {
  const groups = Object.values(DETAILS.groups);
  const cellulose = groups.filter((g) => g.members.some((m) => m.id === 'cellulose-acetylation'))[0];
  assert.deepEqual(cellulose.substrates, ['cellulose', 'acetic-anhydride']);
  assert.deepEqual(cellulose.products, ['cellulose-acetate', 'acetic-acid']);
  assert.equal(cellulose.members.length, 1);

  const abs = groups.filter((g) => g.members.some((m) => m.id === 'academic-abs'))[0];
  assert.deepEqual(abs.substrates, ['acrylonitrile', 'butadiene', 'styrene']);

  const protein = groups.filter((g) => g.members.some((m) => m.id === 'protein-hydrolysis'))[0];
  assert.deepEqual(protein.products, []);
  assert.ok(protein.members[0].productNote.includes('アミノ酸の混合物'));

  // renderCard と同じ関数を評価し、折りたたみの summary に全名称が入り、
  // SVG は開くまで出ないことを確認する。
  const start = APP_JS.indexOf('  /* ------------------------------------------------------------------\n   * 反応の詳細');
  const end = APP_JS.indexOf('  function renderCard(c, opts)');
  assert.ok(start > 0 && end > start, '反応詳細ブロックを抽出できる');
  const block = APP_JS.slice(start, end);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const factory = new Function('D', 'R', 'window', 'Promise', 'document', 'console', 'esc',
    block + '\nreturn { reactionBlockHtml, renderReactionLevel, setPacks: function (d, e) { reactionDetailPack = d; reactionEquationPack = e; } };');
  const api = factory(D10, R, { OCReactionCounts: COUNTS }, Promise, {}, console, esc);
  api.setPacks(DETAILS, EQUATIONS);

  const initial = api.reactionBlockHtml('ethanol');
  assert.equal(/<details class="oc-reactions"/.test(initial), false, '外側の「反応の詳細」details を置かない');
  assert.equal(initial.includes('data-reaction-body'), false, '外側の入れ物を持たない');
  assert.equal(initial.includes('class="oc-reactions__summary"'), false, '外側の要約を持たない');
  const levelDetails = initial.match(/<details class="oc-reactions__level"/g) || [];
  assert.equal(levelDetails.length, 2, '初期状態で高校内容・大学内容の2つだけが見える');
  assert.ok(initial.indexOf('高校内容') < initial.indexOf('大学内容'));

  const body = { innerHTML: '' };
  api.renderReactionLevel(body, 'cellulose', 'high-school');
  ['セルロース', '無水酢酸', 'セルロースアセテート（酢酸セルロース）', '酢酸（エタン酸）']
    .forEach((name) => assert.ok(body.innerHTML.includes(name), '全端点名: ' + name));
  assert.equal(body.innerHTML.includes('<svg'), false, '閉じた要約にSVGを出さない');
  assert.equal(body.innerHTML.includes('oc-reactions__level'), false, 'レベルを開いた中に別のレベルを挟まない');
  const summaries = body.innerHTML.match(/<summary class="oc-reactions__item-summary">[\s\S]*?<\/summary>/g) || [];
  assert.ok(summaries.length > 0);
  summaries.forEach((summary) => {
    assert.equal(summary.includes('…'), false, '端点名を省略しない');
  });

  const body2 = { innerHTML: '' };
  api.renderReactionLevel(body2, 'protein', 'high-school');
  assert.ok(body2.innerHTML.includes('アミノ酸の混合物（種類と割合はタンパク質によって異なる）'),
    '生成物IDが無い反応は productNote を出す');

  assert.ok(APP_JS.includes('reactionEndpointText(group.substrates)'), '基質の全IDを使う');
  assert.ok(APP_JS.includes('reactionEndpointText(group.products, productFallback)'), '生成物の全IDとproductNote');
});

test('[css] 3テーマ共通の接頭辞と、デスクトップ/モバイルの契約', () => {
  const required = [
    '.oc-reactions__head',
    '.oc-reactions__summary',
    '.oc-reactions__level',
    '.oc-reactions__item',
    '.oc-reactions__facts',
    '.oc-reactions__figure .oc-svg',
    'max-width: 100%',
    'html[data-theme="pop"] .oc-reactions',
    'html[data-theme="forest"] .oc-reactions',
    'html[data-theme="pop"] .oc-reactions__count--hs',
    'html[data-theme="forest"] .oc-reactions__count--hs',
    '@media (max-width: 760px)',
    '@media (max-width: 430px)'
  ];
  required.forEach((needle) => assert.ok(APP_CSS.includes(needle), 'CSS: ' + needle));
  assert.ok(/\.oc-reactions__figure \.oc-svg \{[^}]*max-height: 420px/.test(APP_CSS),
    'デスクトップの式の高さ');
  assert.ok(/@media \(max-width: 760px\)[\s\S]*?\.oc-reactions__figure \.oc-svg \{ max-height: 300px; \}/.test(APP_CSS),
    'モバイルの式の高さ');
  assert.ok(APP_CSS.includes('grid-template-columns: minmax(0, 1fr)'), '狭い画面で1列');
  assert.ok(APP_CSS.includes('.oc-reactions__item-path { flex-basis: 100%; }'),
    'モバイルでは端点名を全幅で折り返す');
  assert.ok(/\.oc-reactions__side \{[^}]*overflow-wrap: anywhere/.test(APP_CSS),
    '長い端点名を省略せず折り返す');
});

test('[repro] 生成物は --check で再現可能（差分なし）', () => {
  const result = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'app10', 'build-reaction-details.cjs'), '--check'], {
      cwd: ROOT,
      encoding: 'utf8'
    });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(result.stdout.includes('OK'), result.stdout);
});
