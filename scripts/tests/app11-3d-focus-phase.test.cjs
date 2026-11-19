/**
 * app11-3d 選択フォーカスのフェーズ（preview / travel / 着地）回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-focus-phase.test.cjs
 *
 * 対象: site/app11/3d/projection.js / renderer.js / app.js
 *   - カメラ移動中は無関係の物質・経路を隠さず、選択/一致/直接ネットワークだけ強調
 *   - 着地後にだけ従来の選択分離・検索の文脈表示へ切り替わる
 *   - 単一検索 pivot は検索の見え方を保ち、着地で従来の検索表示へ戻る
 *   - 複数一致・0 件は従来スコープのまま（移動なし・検索の減光のみ）
 *   - 連続キャンセル/新選択/解除で古いフィルタが残らない（状態ではなくフェーズ由来）
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const APP3D = path.join(APP, '3d');
const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const G = require(path.join(APP, 'reaction-groups.js'));
const P = require(path.join(ROOT, 'site', 'app11', '3d', 'projection.js'));
const L = require(path.join(ROOT, 'site', 'app11', '3d', 'layout3d.js'));
const S = require(path.join(ROOT, 'site', 'app11', '3d', 'scene-model.js'));
const R = require(path.join(ROOT, 'site', 'app11', '3d', 'renderer.js'));

const VIEW = { width: 1280, height: 900 };
const model = S.createModel(D, A, G);
const layout = L.buildLayout3D(D.compounds, { reactions: D.reactions });
const camera = P.fitCamera(layout.list, VIEW, { fov: 52, margin: 1.16, azimuth: -35, elevation: 22 });

const PREVIEW_MS = 130;
const EASE_MS = 430;

function plan(extra) {
  return R.planScene(Object.assign({
    model,
    layout,
    camera,
    viewport: VIEW,
    layer: 'normal'
  }, extra || {}));
}

function focalSet(id, layer) {
  const ids = new Set([id]);
  const groups = new Set();
  model.groupsForCompound(id, layer || 'normal').forEach((group) => {
    groups.add(group.id);
    group.substrateIds.concat(group.productIds).forEach((other) => ids.add(other));
  });
  return { ids, groups };
}

test('[phase] アニメーション状態だけで preview / travel / 着地を決める', () => {
  assert.equal(P.transitionPhase(0, PREVIEW_MS, EASE_MS), 'preview');
  assert.equal(P.transitionPhase(PREVIEW_MS - 1, PREVIEW_MS, EASE_MS), 'preview');
  assert.equal(P.transitionPhase(PREVIEW_MS, PREVIEW_MS, EASE_MS), 'travel');
  assert.equal(P.transitionPhase(PREVIEW_MS + EASE_MS / 2, PREVIEW_MS, EASE_MS), 'travel');
  assert.equal(P.transitionPhase(PREVIEW_MS + EASE_MS, PREVIEW_MS, EASE_MS), null);
  // preview なし（リサイズ振り直しなど）は即 travel、reduced-motion は遷移自体を作らない
  assert.equal(P.transitionPhase(0, 0, EASE_MS), 'travel');
});

test('[select/preview] 全体文脈を残したまま選択と直接ネットワークだけ強調する', () => {
  const base = plan();
  const preview = plan({ selectedId: 'ethanol', focusPhase: 'preview' });
  const focal = focalSet('ethanol');

  assert.equal(preview.focusPhase, 'preview');
  assert.equal(preview.nodes.length, base.nodes.length, '移動中に無関係の点/カードが消えている');
  assert.equal(preview.edges.length, base.edges.length, '移動中に無関係の経路が消えている');
  assert.deepEqual(
    preview.nodes.map((node) => node.id).sort(),
    base.nodes.map((node) => node.id).sort()
  );

  // 選択カードは最前面・強調
  const selected = preview.nodes[preview.nodes.length - 1];
  assert.equal(selected.id, 'ethanol');
  assert.equal(selected.selected, true);

  // 直接ネットワークの経路だけ強調、無関係は強調も減光もされない
  const highlighted = preview.edges.filter((edge) => edge.selected);
  assert.ok(highlighted.length > 0);
  for (const edge of highlighted) assert.ok(focal.groups.has(edge.groupId));
  for (const edge of preview.edges) {
    assert.equal(edge.dimmed, false, '移動中に無関係の経路が減光されている: ' + edge.id);
    if (!focal.groups.has(edge.groupId)) assert.equal(edge.selected, false);
  }

  // 直接ネットワークのカードは淡い強調。無関係カードは従来どおり。
  const unrelated = base.cards.find((card) => !focal.ids.has(card.id));
  assert.ok(unrelated);
  const unrelatedInPreview = preview.cards.find((card) => card.id === unrelated.id);
  assert.ok(unrelatedInPreview);
  assert.equal(unrelatedInPreview.linked, false);
  assert.equal(unrelatedInPreview.dimmed, false);
  const neighbor = preview.cards.find((card) => card.neighbor);
  assert.ok(neighbor);
  assert.equal(neighbor.linked, true);

  // 誤操作防止用の焦点集合も選択グラフと一致する
  assert.deepEqual(Object.keys(preview.focusIds).sort(), [...focal.ids].sort());
  assert.equal(preview.focusIds[unrelated.id], undefined);
});

test('[select/travel] 移動中も同じ文脈で、着地してから従来の選択分離になる', () => {
  const base = plan();
  const travel = plan({
    selectedId: 'ethanol',
    focusPhase: 'travel',
    camera: P.interpolateCamera(camera, camera, 0.5)
  });
  assert.equal(travel.focusPhase, 'travel');
  assert.equal(travel.nodes.length, base.nodes.length);
  assert.equal(travel.edges.length, base.edges.length);
  assert.equal(travel.cards.filter((card) => card.dimmed).length, 0);

  const landed = plan({ selectedId: 'ethanol', focusPhase: 'final' });
  const legacy = plan({ selectedId: 'ethanol' });
  assert.deepEqual(
    landed.nodes.map((node) => node.id).sort(),
    legacy.nodes.map((node) => node.id).sort()
  );
  const focal = focalSet('ethanol');
  assert.deepEqual([...new Set(landed.nodes.map((node) => node.id))].sort(), [...focal.ids].sort());
  assert.equal(landed.markers.length, 0);
  assert.ok(landed.edges.every((edge) => focal.groups.has(edge.groupId) && edge.selected && !edge.dimmed));
  assert.equal(landed.focusPhase, 'final');
});

test('[search/preview] 単一 pivot は検索の見え方を保ち、直接ネットワークだけ強調する', () => {
  const finalSearch = plan({ query: 'acrylonitrile' });
  const preview = plan({
    query: 'acrylonitrile',
    focusPivotId: 'acrylonitrile',
    focusPhase: 'preview'
  });
  const travel = plan({
    query: 'acrylonitrile',
    focusPivotId: 'acrylonitrile',
    focusPhase: 'travel'
  });

  for (const mid of [preview, travel]) {
    assert.equal(mid.focusPhase, mid === preview ? 'preview' : 'travel');
    assert.equal(mid.focusPivotId, 'acrylonitrile');
    // 検索の文脈表示（一致＋直接連結、無関係は暗い点）をそのまま保つ
    assert.deepEqual(
      mid.nodes.map((node) => node.id).sort(),
      finalSearch.nodes.map((node) => node.id).sort()
    );
    assert.equal(mid.cards.length, finalSearch.cards.length);
    assert.equal(mid.markers.length, finalSearch.markers.length);
    assert.ok(mid.markers.some((marker) => marker.dimmed));
    // 色分け・暗い点は従来どおり（無関係は強調されない）
    for (const node of mid.nodes) {
      if (node.id !== 'acrylonitrile' && !node.context) assert.equal(node.linked || false, false);
    }
  }

  const focal = focalSet('acrylonitrile');
  const highlighted = preview.edges.filter((edge) => edge.selected);
  assert.ok(highlighted.length > 0, '移動中に直接ネットワークが強調されていない');
  for (const edge of highlighted) assert.ok(focal.groups.has(edge.groupId));
  assert.ok(finalSearch.edges.every((edge) => edge.selected === false));

  // 着地で従来の検索表示（強調は searchLink の通常線）へ戻る
  const landed = plan({ query: 'acrylonitrile', focusPhase: 'final' });
  assert.deepEqual(
    landed.nodes.map((node) => node.id).sort(),
    finalSearch.nodes.map((node) => node.id).sort()
  );
  assert.ok(landed.edges.every((edge) => edge.selected === false));
});

test('[search] 検索結果の選択も preview では全体文脈、着地で選択分離', () => {
  const base = plan({ query: '' });
  const preview = plan({ query: 'メタン', selectedId: 'methane', focusPhase: 'preview' });
  assert.equal(preview.nodes.length, base.nodes.length);
  assert.equal(preview.edges.length, base.edges.length);
  const selected = preview.nodes[preview.nodes.length - 1];
  assert.equal(selected.id, 'methane');
  assert.equal(selected.selected, true);
  const focal = focalSet('methane');
  assert.ok(preview.edges.filter((edge) => edge.selected).every((edge) => focal.groups.has(edge.groupId)));
  assert.ok(preview.edges.some((edge) => !edge.selected && edge.dimmed === false));

  // 検索結果から選ぶと query は閉じる（app.js）ため、着地は選択分離そのもの
  const landed = plan({ selectedId: 'methane', focusPhase: 'final' });
  assert.deepEqual([...new Set(landed.nodes.map((node) => node.id))].sort(), [...focal.ids].sort());
});

test('[search] 複数一致・0 件は従来スコープのまま（preview でも検索表示を変えない）', () => {
  assert.ok(model.search('エ', 2).length >= 2, '複数一致のクエリが必要');
  for (const query of ['エ', '存在しない物質XYZ']) {
    const finalSearch = plan({ query });
    const noPivotPreview = plan({ query, focusPhase: 'preview' });
    assert.equal(noPivotPreview.cards.length, finalSearch.cards.length);
    assert.equal(noPivotPreview.markers.length, finalSearch.markers.length);
    assert.deepEqual(
      noPivotPreview.nodes.map((node) => node.id).sort(),
      finalSearch.nodes.map((node) => node.id).sort()
    );
    assert.deepEqual(
      noPivotPreview.edges.map((edge) => [edge.id, edge.selected, edge.dimmed]),
      finalSearch.edges.map((edge) => [edge.id, edge.selected, edge.dimmed])
    );
    // pivot が無ければ焦点集合も無い（遷移ガードの対象外＝通常の検索操作）
    assert.deepEqual(Object.keys(noPivotPreview.focusIds), []);
  }
});

test('[cancel] 新選択・解除・連続キャンセルで古いフィルタが残らない', () => {
  const base = plan();
  // 1 回目の選択は preview 中に新しい選択へ置き換わる（フェーズは最初から）
  assert.equal(P.transitionPhase(90, PREVIEW_MS, EASE_MS), 'preview');
  const first = plan({ selectedId: 'ethanol', focusPhase: 'preview' });
  const second = plan({ selectedId: 'methane', focusPhase: 'preview' });
  assert.equal(first.nodes[first.nodes.length - 1].id, 'ethanol');
  assert.equal(second.nodes[second.nodes.length - 1].id, 'methane');
  assert.equal(second.nodes.some((node) => node.id === 'ethanol' && node.selected), false);
  assert.equal(second.focusIds.ethanol, undefined);

  // 解除（キャンセル）後は全体表示。以前の焦点集合も残らない
  const cancelled = plan({ focusPhase: 'final' });
  assert.equal(cancelled.nodes.length, base.nodes.length);
  assert.equal(cancelled.edges.length, base.edges.length);
  assert.deepEqual(Object.keys(cancelled.focusIds), []);

  // 2 回目の着地は 2 回目の選択だけを分離する
  const landed = plan({ selectedId: 'methane', focusPhase: 'final' });
  const focal = focalSet('methane');
  assert.deepEqual([...new Set(landed.nodes.map((node) => node.id))].sort(), [...focal.ids].sort());
  assert.equal(landed.nodes.some((node) => node.id === 'ethanol' &&
    !focal.ids.has(node.id)), false);
});

test('[motion] reduced-motion は遷移を作らず、着地と同じ最終表示になる', () => {
  // app.js は animate && !prefersReducedMotion() のとき遷移を作らず camera を即時更新する。
  // そのとき render は focusPhase 'final' を渡すため、直前の全体文脈は挟まない。
  const reduced = plan({ selectedId: 'ethanol' }); // focusPhase 未指定 = final
  const focal = focalSet('ethanol');
  assert.deepEqual([...new Set(reduced.nodes.map((node) => node.id))].sort(), [...focal.ids].sort());
  assert.equal(reduced.markers.length, 0);
});

test('[wiring] app.js は phase を animation 状態から渡し、タイマーを増やさない', () => {
  const js = fs.readFileSync(path.join(APP3D, 'app.js'), 'utf8');
  assert.ok(js.includes("phase: previewMs > 0 ? 'preview' : 'travel'"));
  assert.ok(js.includes('P.transitionPhase(elapsed, transition.previewMs, transition.durationMs)'));
  assert.ok(js.includes('transition.phase = \'travel\''));
  assert.ok(js.includes("focusPhase: state.transition ? state.transition.phase : 'final'"));
  assert.ok(js.includes("focusPivotId: state.lock && state.lock.kind === 'search' ? state.lock.id : null"));
  assert.ok(js.includes('function focusLockedDuringTransition'));
  assert.ok(js.includes('function isFocusTarget'));
  // 遅延フィルタ用の新しいタイマーはない（既存の検索ロックとリサイズの 2 箇所だけ）
  assert.equal((js.match(/setTimeout\(/g) || []).length, 2);
  assert.equal((js.match(/requestAnimationFrame/g) || []).length, 2);
  assert.equal(/setInterval/.test(js), false);
});
