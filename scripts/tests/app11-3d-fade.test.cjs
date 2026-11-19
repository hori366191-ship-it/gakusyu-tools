/**
 * app11-3d 着地後の減光（fade）回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-fade.test.cjs
 *
 * 対象: site/app11/3d/projection.js / renderer.js / app.js
 *   - カメラが着地してから、無関係の物質・カード・経路だけを約 900ms で徐々に落とす
 *   - 着地の瞬間は移動中の見え方（全体文脈＋焦点強調）から切り替えない
 *   - 選択/直接ネットワークは最後まで clear（alpha 1）のまま
 *   - 明示選択の最終表示は従来の選択分離と完全一致、検索は従来の最終検索表示と一致
 *   - 検索は「目立たなくなる強調」だけが薄れ、暗い点・通常経路は最終表示のまま残る
 *   - 減光中の背景はヒットしない（消えていくカードを誤って選ばない）
 *   - 連続切替・解除・reduced-motion で減光状態が残らない／発生しない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const APP3D = path.join(APP, '3d');
const LEGACY = path.join(ROOT, 'scripts', 'legacy', 'app11-3d');
const D = require(path.join(APP, 'data.js'));
const A = require(path.join(APP, 'academic-data.js'));
const G = require(path.join(APP, 'reaction-groups.js'));
const P = require(path.join(APP3D, 'projection.js'));
const L = require(path.join(LEGACY, 'layout3d.js'));
const S = require(path.join(APP3D, 'scene-model.js'));
const R = require(path.join(APP3D, 'renderer.js'));

const VIEW = { width: 1280, height: 900 };
const model = S.createModel(D, A, G);
const layout = L.buildLayout3D(D.compounds, { reactions: D.reactions });
const camera = P.fitCamera(layout.list, VIEW, { fov: 52, margin: 1.16, azimuth: -35, elevation: 22 });
const FADE_MS = 900;

function plan(extra) {
  return R.planScene(Object.assign({
    model,
    layout,
    camera,
    viewport: VIEW,
    layer: 'normal'
  }, extra || {}));
}

function fadePlan(extra) {
  return plan(Object.assign({ focusPhase: 'fade' }, extra || {}));
}

function focalSet(id) {
  const ids = new Set([id]);
  const groups = new Set();
  model.groupsForCompound(id, 'normal').forEach((group) => {
    groups.add(group.id);
    group.substrateIds.concat(group.productIds).forEach((other) => ids.add(other));
  });
  return { ids, groups };
}

function idsOf(list) {
  return list.map((item) => item.id).sort();
}

test('[fade/timing] 着地後 900ms で 0→1、既存の phase 判定とタイマーは増やさない', () => {
  assert.equal(P.transitionFade(0, FADE_MS), 0);
  assert.equal(P.transitionFade(FADE_MS / 2, FADE_MS), 0.5);
  assert.equal(P.transitionFade(FADE_MS, FADE_MS), 1);
  assert.equal(P.transitionFade(-50, FADE_MS), 0);
  assert.equal(P.transitionFade(FADE_MS * 3, FADE_MS), 1);
  assert.equal(P.transitionFade(0, 0), 0);

  // 3 引数の transitionPhase は従来どおり（着地で null）。減光は app 側が
  // 「着地から fadeMs の範囲」を別途見て 'fade' にする。
  assert.equal(P.transitionPhase(130 + 430, 130, 430), null);
  assert.equal(P.transitionPhase(130 + 430 + FADE_MS - 1, 130, 430), null);

  const js = fs.readFileSync(path.join(LEGACY, 'app.js'), 'utf8');
  assert.ok(js.includes('TRANSITION_FADE_MS = 900'));
  assert.ok(js.includes("transition.phase = 'fade'"));
  assert.ok(js.includes('P.transitionFade(elapsed - travelEnd, transition.fadeMs)'));
  assert.ok(js.includes('transition.fadeMs > 0'));
  assert.ok(js.includes("TRANSITION_EASE_MS, false, TRANSITION_FADE_MS"));
  assert.ok(js.includes("focusFade: state.transition && state.transition.phase === 'fade'"));
  // リサイズ/再レイアウトは減光の時計を進めたまま目標だけ差し替える
  assert.ok(js.includes("state.transition.phase === 'fade'"));
  assert.ok(js.includes('state.transition.fadeMs'));
  // 減光も既存の単一 rAF に相乗りする（タイマー・アイドルループを増やさない）
  assert.equal((js.match(/requestAnimationFrame/g) || []).length, 2);
  assert.equal((js.match(/setTimeout\(/g) || []).length, 2);
  assert.equal(/setInterval/.test(js), false);
});

test('[fade/select] 着地の瞬間は移動中の見え方のまま、無関係だけが徐々に落ちる', () => {
  const transit = plan({ selectedId: 'ethanol', focusPhase: 'travel' });
  const fade0 = fadePlan({ selectedId: 'ethanol', focusFade: 0 });
  const fadeMid = fadePlan({ selectedId: 'ethanol', focusFade: 0.5 });
  const final = plan({ selectedId: 'ethanol' });
  const focal = focalSet('ethanol');

  assert.equal(fade0.focusPhase, 'fade');
  assert.equal(fade0.fadeAlpha, 1);
  assert.equal(fadeMid.fadeAlpha, 0.5);
  assert.equal(final.fadeAlpha, 1);

  // 着地直後は移動中と同一の集合・強調（ここで切り替えると硬いフラッシュになる）
  assert.deepEqual(idsOf(fade0.nodes), idsOf(transit.nodes));
  assert.deepEqual(
    fade0.edges.map((edge) => [edge.id, edge.selected, edge.dimmed]),
    transit.edges.map((edge) => [edge.id, edge.selected, edge.dimmed])
  );
  // 無関係の経路は「減光済みスタイル」へ飛ばない（着地で暗くしない）
  for (const edge of fade0.edges) {
    if (!edge.selected) assert.equal(edge.dimmed, false, '着地で無関係の経路が急に暗くなっている');
  }

  // 減光中も無関係は計画に残り、fade フラグだけが立つ
  assert.equal(fadeMid.nodes.length, transit.nodes.length);
  assert.equal(fadeMid.edges.length, transit.edges.length);
  const fadingCards = fadeMid.cards.filter((card) => card.fade);
  assert.ok(fadingCards.length > 0);
  assert.ok(fadingCards.every((card) => !focal.ids.has(card.id)));
  const fadingEdges = fadeMid.edges.filter((edge) => edge.fade);
  assert.ok(fadingEdges.length > 0);
  assert.ok(fadingEdges.every((edge) => !focal.groups.has(edge.groupId)));

  // 選択・直接ネットワーク（カード・経路）は最後まで clear
  const selectedCard = fadeMid.nodes[fadeMid.nodes.length - 1];
  assert.equal(selectedCard.id, 'ethanol');
  assert.equal(selectedCard.selected, true);
  assert.ok(!selectedCard.fade);
  const neighbor = fadeMid.cards.find((card) => card.neighbor && !card.selected);
  assert.ok(neighbor);
  assert.ok(!neighbor.fade, '直接ネットワークのカードまで減光している');
  for (const edge of fadeMid.edges.filter((item) => item.selected)) {
    assert.ok(focal.groups.has(edge.groupId));
    assert.ok(!edge.fade);
  }

  // 明示選択の最終表示は従来の選択分離と完全一致（フェードの残骸なし）
  assert.deepEqual([...new Set(final.nodes.map((node) => node.id))].sort(), [...focal.ids].sort());
  assert.ok(final.cards.every((card) => !card.fade));
  assert.ok(final.edges.every((edge) => !edge.fade && !edge.highlightFade));
});

test('[fade/batches] 減光中の経路は通常スタイルの専用バッチで、焦点バッチは混ざらない', () => {
  const fadeMid = fadePlan({ selectedId: 'ethanol', focusFade: 0.5 });
  const fadingBatches = fadeMid.edgeBatches.filter((batch) => batch.fade);
  const plainBatches = fadeMid.edgeBatches.filter((batch) => !batch.fade && !batch.highlight);
  assert.ok(fadingBatches.length > 0);
  assert.ok(plainBatches.length > 0);
  for (const batch of fadingBatches) {
    assert.ok(batch.edges.length > 0);
    assert.ok(batch.edges.every((edge) => edge.fade && !edge.selected));
    assert.equal(batch.key.indexOf('-dim'), -1, '減光中の無関係経路が dim スタイルになっている');
  }
  for (const batch of plainBatches) {
    assert.ok(batch.edges.every((edge) => edge.selected), '焦点以外が通常バッチに混ざっている');
  }
  // バッチは従来の 3 バンド × スタイルの範囲に収まる
  assert.ok(fadeMid.edgeBatches.length <= 12);
});

test('[fade/search] 検索は暗い点・通常経路を残し、強調だけが薄れる', () => {
  const finalSearch = plan({ query: 'acrylonitrile' });
  const fade0 = fadePlan({ query: 'acrylonitrile', focusPivotId: 'acrylonitrile', focusFade: 0 });
  const fadeMid = fadePlan({ query: 'acrylonitrile', focusPivotId: 'acrylonitrile', focusFade: 0.5 });
  const focal = focalSet('acrylonitrile');

  for (const mid of [fade0, fadeMid]) {
    assert.equal(mid.focusPivotId, 'acrylonitrile');
    // 検索の最終表示（一致＋直接連結、無関係は暗い点）と同一集合
    assert.deepEqual(idsOf(mid.nodes), idsOf(finalSearch.nodes));
    assert.equal(mid.cards.length, finalSearch.cards.length);
    assert.equal(mid.markers.length, finalSearch.markers.length);
    assert.ok(mid.markers.some((marker) => marker.dimmed));
    // 点・カードは減光対象にしない（最終表示でも残るため）
    assert.ok(mid.nodes.every((node) => !node.fade));
    assert.deepEqual(idsOf(mid.edges), idsOf(finalSearch.edges));
    assert.ok(mid.edges.every((edge) => !edge.fade));
    // 目立たなくなる強調（直接ネットワーク）だけが highlightFade を持つ
    for (const edge of mid.edges) {
      assert.equal(!!edge.highlightFade, focal.groups.has(edge.groupId));
      assert.equal(edge.selected, false);
    }
    assert.ok(mid.edges.some((edge) => edge.highlightFade));
  }
  assert.equal(fade0.fadeAlpha, 1);
  assert.equal(fadeMid.fadeAlpha, 0.5);

  // 最終検索表示は従来どおり（強調なし・暗い点はそのまま）
  assert.ok(finalSearch.edges.every((edge) => !edge.selected && !edge.highlightFade && !edge.fade));

  // ハイライトは通常線の上に 1 バッチだけ重なる
  const highlightBatches = fadeMid.edgeBatches.filter((batch) => batch.highlight);
  assert.ok(highlightBatches.length >= 1);
  assert.ok(highlightBatches.every((batch) => batch.key.indexOf('sel-') === 0));
  assert.ok(highlightBatches.reduce((sum, batch) => sum + batch.edges.length, 0) ===
    fadeMid.edges.filter((edge) => edge.highlightFade).length);
});

test('[fade/draw] 無関係のカードと経路だけ alpha が落ち、焦点は clear のまま描かれる', () => {
  const fadeMid = fadePlan({ selectedId: 'ethanol', focusFade: 0.5 });
  const alphas = [];
  const cardAlphas = [];
  const labels = [];
  const ctx = {
    globalAlpha: 1,
    shadowBlur: 0,
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    arc() {},
    fill() {},
    stroke() { alphas.push(this.globalAlpha); },
    clip() {},
    save() {},
    restore() {},
    translate() {},
    transform() {},
    drawImage() {},
    setLineDash() {},
    fillText(text) { labels.push(text); cardAlphas.push(this.globalAlpha); },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  R.drawScene(ctx, fadeMid, {});
  assert.equal(labels.length, fadeMid.cards.length, '減光中もカードは全部描く（消えるのは alpha だけ）');
  // 減光中のカードは alpha 0.5、焦点カードは 1
  for (let i = 0; i < fadeMid.nodes.length; i++) {
    const node = fadeMid.nodes[i];
    if (!node.card) continue;
    const alpha = cardAlphas[fadeMid.nodes.slice(0, i).filter((item) => item.card).length];
    if (node.fade) assert.ok(Math.abs(alpha - 0.5) < 1e-9, '無関係カードの alpha: ' + alpha);
    else assert.equal(alpha, 1, '焦点カードの alpha が落ちている: ' + node.id);
  }
  const maxAlpha = Math.max.apply(null, alphas);
  const minAlpha = Math.min.apply(null, alphas);
  assert.ok(maxAlpha > 0.9, '焦点経路が clear で描かれていない');
  assert.ok(minAlpha < 0.2, '無関係経路の alpha が落ちていない');
});

test('[fade/pick] 消えていく背景はヒットせず、残る焦点だけ選べる', () => {
  const p = fadePlan({ selectedId: 'ethanol', focusFade: 0.2 });
  const selectedCard = p.cards.find((card) => card.id === 'ethanol');
  assert.ok(selectedCard);
  assert.equal(R.pickScene(p, selectedCard.x, selectedCard.y), 'ethanol');

  const focusedRects = p.nodes.filter((node) => !node.fade && node.card).map((node) => node.rect);
  const fadingCard = p.cards.find((card) => card.fade && !focusedRects.some((rect) => (
    card.x >= rect.x && card.x <= rect.x + rect.width &&
    card.y >= rect.y && card.y <= rect.y + rect.height
  )));
  assert.ok(fadingCard, '減光対象のカードが必要');
  assert.equal(R.pickScene(p, fadingCard.x, fadingCard.y), null, '消えていくカードを選べてしまう');
});

test('[fade/cancel] 新選択・解除で古い減光対象が残らない', () => {
  const base = plan();
  const first = fadePlan({ selectedId: 'ethanol', focusFade: 0.5 });
  const second = fadePlan({ selectedId: 'methane', focusFade: 0.5 });
  assert.ok(first.focusIds.ethanol);
  assert.equal(second.focusIds.ethanol, undefined);
  assert.ok(second.focusIds.methane);
  assert.equal(second.nodes.some((node) => node.id === 'ethanol' && !node.fade), false);

  // 選択解除は全体表示へ戻る（減光フラグ・旧焦点集合が残らない）
  const cancelled = plan({ focusPhase: 'final' });
  assert.equal(cancelled.nodes.length, base.nodes.length);
  assert.equal(cancelled.edges.length, base.edges.length);
  assert.ok(cancelled.nodes.every((node) => !node.fade));
  assert.ok(cancelled.edges.every((edge) => !edge.fade && !edge.highlightFade));
  assert.deepEqual(Object.keys(cancelled.focusIds), []);
});

test('[fade/motion] reduced-motion は減光せず即時の最終表示になる', () => {
  // enterCameraLock の即時分岐は transition を作らないため focusPhase は 'final'。
  const reduced = plan({ selectedId: 'ethanol' });
  const focal = focalSet('ethanol');
  assert.equal(reduced.focusPhase, 'final');
  assert.equal(reduced.fadeAlpha, 1);
  assert.ok(reduced.nodes.every((node) => !node.fade));
  assert.deepEqual([...new Set(reduced.nodes.map((node) => node.id))].sort(), [...focal.ids].sort());

  const js = fs.readFileSync(path.join(LEGACY, 'app.js'), 'utf8');
  const lockStart = js.indexOf('function enterCameraLock');
  const lockEnd = js.indexOf('function exitCameraLock', lockStart);
  const lockBody = js.slice(lockStart, lockEnd);
  assert.ok(lockBody.includes('animate && !prefersReducedMotion()'));
  assert.ok(lockBody.includes('TRANSITION_FADE_MS'));
  const reducedBranch = lockBody.slice(lockBody.indexOf('} else {'));
  assert.ok(reducedBranch.includes('cancelCameraTransition()'));
  assert.equal(reducedBranch.includes('TRANSITION_FADE_MS'), false);
});
