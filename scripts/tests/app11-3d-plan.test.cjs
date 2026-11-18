/**
 * app11-3d 表示計画（不透明オクルージョン・奥行き・検索・選択・当たり判定）の回帰テスト
 *
 * 実行: node --test scripts/tests/app11-3d-plan.test.cjs
 *
 * 対象: site/app11/3d/renderer.js
 *   - 投影された物質は重なりを理由に間引かれない（カード枚数の上限なし）
 *   - カードは画面軸平行の不透明矩形で、奥から手前へ描かれる
 *   - 当たり判定は描画順の逆（手前が勝つ）
 *   - 選択時は選択物質の経路だけが強調され、方向は基質→生成物
 *   - 検索・層切替・未接続・除外矩形・床グリッド・構造式の面・バッチ数
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
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

function plan(extra) {
  return R.planScene(Object.assign({
    model,
    layout,
    camera,
    viewport: VIEW,
    layer: 'normal'
  }, extra || {}));
}

function overlapPoint(a, b) {
  const x1 = Math.max(a.rect.x, b.rect.x);
  const y1 = Math.max(a.rect.y, b.rect.y);
  const x2 = Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width);
  const y2 = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height);
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

test('[plan] 427 物質がカードか点として計画に入り、重なりで間引かれない', () => {
  const p = plan();
  assert.equal(p.animate, false);
  assert.equal(p.cards.length + p.markers.length, 427);
  assert.equal(p.stats.cards, p.cards.length);
  assert.equal(p.stats.markers, p.markers.length);
  assert.ok(p.cards.length > 400, '重なりを理由にカードを落としすぎている');
  for (const card of p.cards) {
    assert.equal(card.card, true);
    assert.ok(card.width > 0 && card.height > 0);
    assert.equal(card.rect.width, card.width);
    assert.equal(card.rect.height, card.height);
    assert.ok(card.rect.x <= card.x && card.x <= card.rect.x + card.rect.width);
    assert.ok(card.rect.y <= card.y && card.y <= card.rect.y + card.rect.height);
    assert.ok(card.text.length > 0);
    assert.ok(card.fontSize >= 12, '可読最小サイズを下回っている');
    assert.equal(typeof card.fill, 'string');
    assert.equal(card.fill.startsWith('rgb'), false);
  }
  for (const marker of p.markers) {
    assert.equal(marker.card, false);
    assert.ok(marker.radius > 0);
  }
});

test('[occlusion] カードは重なってよく、描画順は奥→手前・選択だけ最後', () => {
  const p = plan({ selectedId: 'ethanol' });
  assert.ok(p.cards.length > 1);
  for (let i = 1; i < p.nodes.length; i++) {
    const prev = p.nodes[i - 1];
    const next = p.nodes[i];
    if (prev.selected !== next.selected) {
      assert.equal(next.selected, true, '選択カードは最後に描かれるべき');
      continue;
    }
    assert.ok(prev.z >= next.z, '奥（z 大）から手前へ描く');
  }
  const selectedCard = p.nodes[p.nodes.length - 1];
  assert.equal(selectedCard.id, 'ethanol');
  assert.equal(selectedCard.selected, true);
});

test('[occlusion] 実際に重なったカードがあり、当たり判定は手前（z 小）が勝つ', () => {
  const p = plan();
  let found = null;
  for (let i = 0; i < p.cards.length && !found; i++) {
    for (let j = i + 1; j < p.cards.length; j++) {
      const a = p.cards[i];
      const b = p.cards[j];
      if (!R.rectsOverlap(a.rect, b.rect, 0)) continue;
      const point = overlapPoint(a, b);
      if (point) { found = { point, a, b }; break; }
    }
  }
  assert.ok(found, '重なったカードの組が見つからない');
  // その点を実際に覆っているカードのうち、最も手前（z 最小）が勝つ
  const covering = p.cards.filter((card) => (
    found.point.x >= card.rect.x && found.point.x <= card.rect.x + card.rect.width &&
    found.point.y >= card.rect.y && found.point.y <= card.rect.y + card.rect.height
  ));
  assert.ok(covering.length >= 2);
  const front = covering.reduce((best, card) => (card.z < best.z ? card : best), covering[0]);
  assert.equal(R.pickScene(p, found.point.x, found.point.y), front.id);
});

test('[occlusion] 既知の 2 カード部分重なり（決定的フィクスチャ）で手前が勝つ', () => {
  const stubModel = {
    compounds: [
      { id: 'back', name: '奥', label: '奥', region: 'x', tier: 'primary', incoming: 0, outgoing: 0 },
      { id: 'front', name: '手前', label: '手前', region: 'x', tier: 'primary', incoming: 0, outgoing: 0 }
    ],
    normalizeText(text) { return String(text || '').toLowerCase(); },
    search() { return []; },
    groupsForCompound() { return []; },
    connectedIds() { return {}; },
    edgesForLayer() { return []; }
  };
  const stubLayout = {
    points: {
      back: { id: 'back', x: -1, y: 0, z: -4 },
      front: { id: 'front', x: 1, y: 0, z: 4 }
    },
    bounds: { min: { x: -10, y: -2, z: -10 }, max: { x: 10, y: 2, z: 10 } }
  };
  const vp = { width: 800, height: 600 };
  const cam = P.createCamera({ target: { x: 0, y: 0, z: 0 }, distance: 60, azimuth: 0, elevation: 0, fov: 50 });
  const p = R.planScene({
    model: stubModel,
    layout: stubLayout,
    camera: cam,
    viewport: vp,
    layer: 'normal'
  });
  assert.equal(p.cards.length, 2, '重なる 2 枚ともカードとして残る');
  const back = p.cards.find((card) => card.id === 'back');
  const front = p.cards.find((card) => card.id === 'front');
  assert.ok(back && front);
  assert.ok(R.rectsOverlap(back.rect, front.rect, 0), '既知の部分重なり');
  assert.ok(front.z < back.z);
  // 描画順: 奥 → 手前
  assert.deepEqual(p.nodes.map((node) => node.id), ['back', 'front']);
  const point = overlapPoint(back, front);
  assert.ok(point);
  assert.equal(R.pickScene(p, point.x, point.y), 'front');
  // 手前だけを覆う点
  const frontOnly = { x: front.rect.x + 2, y: front.rect.y + 2 };
  assert.equal(R.pickScene(p, frontOnly.x, frontOnly.y), 'front');
  // 奥だけを覆う点（奥は左にずれているので、その左端は手前の矩形の外）
  const backOnly = { x: back.rect.x + 1, y: back.rect.y + back.rect.height / 2 };
  assert.ok(backOnly.x < front.rect.x, 'フィクスチャの位置関係が崩れている');
  assert.equal(R.pickScene(p, backOnly.x, backOnly.y), 'back');
});

test('[plan] 選択した物質の経路だけが強調され、向きはグループの基質→生成物', () => {
  const p = plan({ selectedId: 'ethanol' });
  const selectedCard = p.cards.find((card) => card.id === 'ethanol');
  assert.ok(selectedCard);
  assert.equal(selectedCard.selected, true);
  const selectedEdges = p.edges.filter((edge) => edge.selected);
  assert.ok(selectedEdges.length > 0);
  const groups = model.groupsForCompound('ethanol', 'normal');
  const groupIds = new Set(groups.map((group) => group.id));
  for (const edge of selectedEdges) {
    assert.ok(groupIds.has(edge.groupId));
  }
  assert.ok(selectedEdges.some((edge) => edge.from === 'ethanol' || edge.to === 'ethanol'));
  assert.equal(p.edges.filter((edge) => !edge.selected).every((edge) => edge.dimmed), true);
  for (const edge of selectedEdges) {
    assert.ok(Number.isFinite(edge.x1) && Number.isFinite(edge.y1));
    assert.ok(Number.isFinite(edge.x2) && Number.isFinite(edge.y2));
  }
  assert.equal(p.cards.filter((card) => card.id === 'ethanol').length, 1);
});

test('[plan] 検索中は一致＋直接連結の文脈だけ文字を出し、無関係は暗い点になる', () => {
  const p = plan({ query: 'エタノール' });
  assert.equal(p.searchActive, true);
  assert.ok(p.cards.length > 0);
  for (const card of p.cards) {
    assert.equal(card.match || card.context, true, card.id + ' は一致でも文脈でもない');
  }
  // 文脈カードは一致ではない
  assert.equal(p.cards.filter((card) => card.context).every((card) => card.match === false), true);
  assert.ok(p.markers.some((marker) => marker.dimmed));
  assert.ok(p.cards.some((card) => card.id === 'ethanol'));
});

test('[focus-search] 単一実一致・複数一致・なしの判定（2 件取得で区別）', () => {
  const unique = model.search('acrylonitrile', 2);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].id, 'acrylonitrile');
  assert.ok(model.search('エ', 2).length >= 2, '複数一致のクエリが必要');
  assert.equal(model.search('存在しない物質XYZ', 2).length, 0);
});

test('[focus] 選択中は選択物質＋直接関係グループの全端点だけを表示する', () => {
  const p = plan({ selectedId: 'ethanol' });
  const focal = new Set(['ethanol']);
  const groupIds = new Set();
  model.groupsForCompound('ethanol', 'normal').forEach((group) => {
    groupIds.add(group.id);
    group.substrateIds.concat(group.productIds).forEach((id) => focal.add(id));
  });
  assert.ok(groupIds.size > 0);
  const visible = new Set(p.nodes.map((node) => node.id));
  assert.deepEqual([...visible].sort(), [...focal].sort(), '表示物質が選択グラフと一致しない');
  assert.equal(p.markers.length, 0, '無関係の点が残っている');
  // 経路も関係グループだけ
  assert.ok(p.edges.length > 0);
  for (const edge of p.edges) {
    assert.ok(groupIds.has(edge.groupId), '無関係グループの経路が残っている: ' + edge.groupId);
    assert.equal(edge.selected, true, '直接関係の経路が強調されていない');
    assert.equal(edge.dimmed, false);
  }
  // 無関係の物質はヒット対象にもならない
  const unrelated = model.compounds.find((compound) => !focal.has(compound.id));
  assert.ok(unrelated);
  assert.equal(p.nodes.some((node) => node.id === unrelated.id), false);
  assert.equal(R.pickScene(p, 1, 1) === unrelated.id, false);
});

test('[focus] 孤立物質の選択はそれ自身だけで、経路も他物質も出ない', () => {
  const isolated = model.compounds.find((compound) => model.groupsForCompound(compound.id, 'normal').length === 0);
  assert.ok(isolated);
  const p = plan({ selectedId: isolated.id });
  assert.equal(p.cards.length, 1);
  assert.equal(p.cards[0].id, isolated.id);
  assert.equal(p.markers.length, 0);
  assert.equal(p.edges.length, 0);
  assert.equal(p.nodes.length, 1);
  // 選択解除（selectedId なし）で全物質へ戻る
  const cleared = plan({});
  assert.equal(cleared.cards.length + cleared.markers.length, 427);
  assert.ok(cleared.edges.length > 0);
});

test('[focus] 選択中の検索は一致より選択グラフを優先し、他一致を表示しない', () => {
  const p = plan({ query: 'メタン', selectedId: 'ethanol' });
  const focal = new Set(['ethanol']);
  model.groupsForCompound('ethanol', 'normal').forEach((group) => {
    group.substrateIds.concat(group.productIds).forEach((id) => focal.add(id));
  });
  for (const node of p.nodes) {
    assert.ok(focal.has(node.id), '選択と無関係な node が残っている: ' + node.id);
  }
  assert.equal(p.nodes.some((node) => node.id === 'methane'), false);
  assert.equal(p.markers.length, 0);
  assert.equal(p.matchIds.methane > 0, true); // 一致自体は保持（表示だけ選択優先）
});

test('[focus] 大学層の選択は academic 専用の関係だけを層内で表示する', () => {
  const academic = plan({ selectedId: 'acrylonitrile', layer: 'academic' });
  for (const id of ['butadiene', 'styrene', 'abs']) {
    assert.ok(academic.nodes.some((node) => node.id === id), id + ' が大学層の焦点に出ない');
  }
  assert.ok(academic.edges.some((edge) => edge.academic));
  const normal = plan({ selectedId: 'acrylonitrile', layer: 'normal' });
  assert.equal(normal.nodes.some((node) => node.id === 'abs'), false,
    '通常層で academic 専用の端点が出ている');
  assert.equal(normal.edges.some((edge) => edge.academic), false);
});

test('[search] 一致物質と直接つながる基質・生成物も文脈カードになり、無関係は暗い点のまま', () => {
  const p = plan({ query: 'メタン' });
  assert.ok(p.matchIds.methane, 'メタンが一致していない');
  // 可視層の反応で直接つながる端点（推移なし）
  const expected = new Set();
  model.groupsForCompound('methane', 'normal').forEach((group) => {
    group.substrateIds.concat(group.productIds).forEach((id) => {
      if (id !== 'methane' && !p.matchIds[id]) expected.add(id);
    });
  });
  assert.ok(expected.size > 0, 'メタンに直接つながる端点がない');
  for (const id of expected) {
    const card = p.cards.find((item) => item.id === id);
    assert.ok(card, id + ' の文脈カードがない');
    assert.equal(card.context, true, id);
    assert.equal(card.match, false, id);
  }
  // 文脈カードは暗い点にならない
  for (const id of expected) {
    assert.equal(p.markers.some((marker) => marker.id === id), false);
  }
  // 一致カードと文脈カードは区別される
  assert.ok(p.cards.filter((card) => card.match).every((card) => card.context === false));
  // 無関係の物質は従来どおり暗い点
  const unrelated = model.compounds.find((compound) => (
    compound.id !== 'methane' && !p.matchIds[compound.id] && !expected.has(compound.id)
  ));
  assert.ok(unrelated);
  const marker = p.markers.find((item) => item.id === unrelated.id);
  assert.ok(marker, unrelated.id + ' が点として残っていない');
  assert.equal(marker.dimmed, true);
  assert.equal(marker.card, false);
  // 連結経路は検索中も通常の可視下限で描かれる（過度に減光しない）
  const linkEdges = p.edges.filter((edge) => edge.searchLink);
  assert.ok(linkEdges.length > 0);
  assert.equal(linkEdges.every((edge) => edge.dimmed === false), true);
});

test('[search] academic 専用の連結は通常層では文脈に出ず、大学層で出る', () => {
  // アクリロニトリルは大学層の付加重合（→ ABS）にだけ現れる
  const academic = plan({ query: 'acrylonitrile', layer: 'academic' });
  const normal = plan({ query: 'acrylonitrile', layer: 'normal' });
  const absCard = academic.cards.find((card) => card.id === 'abs');
  assert.ok(absCard, '大学層で ABS の文脈カードが出ない');
  assert.equal(absCard.context, true);
  assert.equal(absCard.match, false);
  assert.equal(normal.cards.some((card) => card.id === 'abs'), false, '通常層で academic 専用の端点が出ている');
});

test('[search] 検索中に選択すると、その物質の直接関係グラフだけになる', () => {
  const p = plan({ query: 'メタン', selectedId: 'methane' });
  const expected = new Set(['methane']);
  model.groupsForCompound('methane', 'normal').forEach((group) => {
    group.substrateIds.concat(group.productIds).forEach((id) => expected.add(id));
  });
  assert.deepEqual([...new Set(p.nodes.map((node) => node.id))].sort(), [...expected].sort());
  assert.ok(p.edges.every((edge) => edge.selected && !edge.dimmed));
  // 選択カードは最前面のまま
  assert.equal(p.nodes[p.nodes.length - 1].id, 'methane');
});

test('[startup] 実データでも最小距離で中心付近にカードが見える', () => {
  for (const scenario of [
    { vp: { width: 1440, height: 900 }, rect: { x: 0, y: 104, width: 1050, height: 726 } },
    { vp: { width: 390, height: 844 }, rect: { x: 0, y: 150, width: 390, height: 268 } }
  ]) {
    const startup = P.startupCamera(layout.list, layout.center, scenario.vp, scenario.rect, {
      fov: 52, azimuth: -35, elevation: 22
    });
    assert.equal(startup.camera.distance, P.MIN_DISTANCE);
    assert.equal(startup.distanceChanged, false);
    const anchorScreen = P.cameraView(startup.camera, startup.anchor, scenario.vp);
    const cx = scenario.rect.x + scenario.rect.width / 2;
    const cy = scenario.rect.y + scenario.rect.height / 2;
    assert.ok(Math.hypot(anchorScreen.x - cx, anchorScreen.y - cy) < 1e-6);
    const threshold = Math.min(scenario.rect.width, scenario.rect.height) * 0.28;
    let visible = 0;
    for (const point of layout.list) {
      const projected = P.cameraView(startup.camera, point, scenario.vp);
      if (projected && Math.hypot(projected.x - cx, projected.y - cy) <= threshold) visible++;
    }
    assert.ok(visible >= 1, '中心付近にカードが 1 枚も見えない');
  }
});

test('[layout-crowding] 既定・回転視点でも投影カードの重なりが抑えられている', () => {
  const views = [
    { azimuth: -35, elevation: 22 },
    { azimuth: 15, elevation: 45 },
    { azimuth: -110, elevation: 10 }
  ];
  for (const view of views) {
    const cam = P.fitCamera(layout.list, VIEW, Object.assign({ fov: 52, margin: 1.16 }, view));
    const p = R.planScene({ model, layout, camera: cam, viewport: VIEW, layer: 'normal' });
    let overlaps = 0;
    for (let i = 0; i < p.cards.length; i++) {
      for (let j = i + 1; j < p.cards.length; j++) {
        if (R.rectsOverlap(p.cards[i].rect, p.cards[j].rect, 0)) overlaps++;
      }
    }
    // 旧レイアウトは同条件で 17,000〜29,000 組だった。体積配置で大幅に減らす。
    assert.ok(overlaps < 9000, JSON.stringify(view) + ' の重なりが多い: ' + overlaps);
    assert.ok(p.cards.length > 400);
  }
});

test('[plan] 大学層は通常層よりエッジが増え、academic の色分けフラグが立つ', () => {
  const normal = plan({ layer: 'normal' });
  const academic = plan({ layer: 'academic' });
  assert.ok(academic.edges.length > normal.edges.length);
  assert.ok(academic.edges.some((edge) => edge.academic));
  assert.equal(normal.edges.some((edge) => edge.academic), false);
});

test('[plan] 未接続の強調では接続済みの文字を出さない', () => {
  const p = plan({ showUnconnectedOnly: true });
  assert.ok(p.cards.length > 0);
  for (const card of p.cards) {
    assert.equal(p.connectedIds[card.id] || false, false, card.id + ' は接続済み');
  }
  const connectedMarkers = p.markers.filter((marker) => marker.connected);
  assert.equal(connectedMarkers.every((marker) => marker.dimmed), true);
});

test('[plan] 除外矩形（操作パネル）の中はカードも点も出さない', () => {
  const p = plan({ exclusions: [{ x: 0, y: 0, width: VIEW.width, height: VIEW.height }] });
  assert.equal(p.cards.length, 0);
  assert.equal(p.markers.length, 0);
  assert.equal(p.nodes.length, 0);
});

test('[plan] 奥行き: 遠いカードほど暗い塗り、遠い点ほど小さい', () => {
  const p = plan({ query: 'エタノール' });
  const sorted = p.cards.slice().sort((a, b) => a.depth - b.depth);
  assert.ok(sorted.length > 1);
  assert.ok(sorted[0].depth < sorted[sorted.length - 1].depth);
  assert.notEqual(sorted[0].fill, sorted[sorted.length - 1].fill);
  const farMarker = p.markers.reduce((best, item) => (item.depth > best.depth ? item : best), p.markers[0]);
  const nearMarker = p.markers.reduce((best, item) => (item.depth < best.depth ? item : best), p.markers[0]);
  assert.ok(farMarker.depth > nearMarker.depth);
  assert.ok(farMarker.radius < nearMarker.radius, '遠い点が小さくなっていない');
});

test('[plan] 床グリッドとバッチ描画の統計（通常/大学・ズームで変化）', () => {
  const normal = plan();
  assert.ok(normal.floorSegments.length > 10);
  assert.ok(normal.edgeBatches.length >= 1 && normal.edgeBatches.length <= 12);
  assert.equal(normal.stats.edgeBatches, normal.edgeBatches.length);
  // すべてのエッジがちょうど 1 つのバッチに入る
  const batched = normal.edgeBatches.reduce((sum, batch) => sum + batch.edges.length, 0);
  assert.equal(batched, normal.edges.length);
  // ズームインすると画面外のエッジが落ちて本数が減る
  const zoom = plan({ camera: P.zoomCamera(camera, 0.35) });
  assert.ok(zoom.stats.culledEdges > normal.stats.culledEdges);
  assert.ok(zoom.edges.length < normal.edges.length);
  const academic = plan({ layer: 'academic' });
  assert.ok(academic.edges.length > normal.edges.length);
  assert.ok(academic.edgeBatches.length <= 12);
});

test('[edges] 通常経路は選択がなくても遠景で消えず、選択経路は明確に強い', () => {
  const floor = 0.15; // 黒〜暗いグラデーション上で線として追える下限（実機の見た目は未検証）
  for (const band of [0, 1, 2]) {
    const normal = R.edgePaint('normal', band, {});
    const academic = R.edgePaint('academic', band, {});
    const normalDim = R.edgePaint('normal-dim', band, {});
    const academicDim = R.edgePaint('academic-dim', band, {});
    assert.ok(normal.alpha >= floor, `normal band ${band} が薄すぎる: ${normal.alpha}`);
    assert.ok(academic.alpha >= floor, `academic band ${band} が薄すぎる: ${academic.alpha}`);
    assert.ok(normalDim.alpha >= 0.08, `選択中の通常経路が消えている: ${normalDim.alpha}`);
    assert.ok(academicDim.alpha >= 0.1, `選択中の大学経路が消えている: ${academicDim.alpha}`);
    assert.ok(academic.dash && academic.dash.length === 2, '大学経路は破線のまま');
    assert.ok(academic.width > normal.width);
  }
  // 奥（band 2）でも手前の 0.7 倍以上を保つ（遠景で消えない）
  assert.ok(R.edgePaint('normal', 2, {}).alpha >= R.edgePaint('normal', 0, {}).alpha * 0.7);
  const selectedNormal = R.edgePaint('sel-normal', 0, {});
  const selectedAcademic = R.edgePaint('sel-academic', 0, {});
  const ordinary = R.edgePaint('normal', 0, {});
  for (const selected of [selectedNormal, selectedAcademic]) {
    assert.ok(selected.alpha > ordinary.alpha * 2);
    assert.ok(selected.width > ordinary.width * 1.8);
    assert.ok(selected.glow);
  }
  // 通常=アンバー / 大学=シアン（詳細カードのアクセントと同値）
  assert.equal(R.ROUTE_INK.normal, '#ffd166');
  assert.equal(R.ROUTE_INK.academic, '#48e4ff');
  assert.equal(selectedNormal.stroke, '#ffd166');
  assert.equal(selectedAcademic.stroke, '#48e4ff');
});

test('[plan] 選択物質の正規構造式はワールド位置に結び付いた面になる', () => {
  const sprite = { width: 200, height: 150 };
  const withPlane = plan({ selectedId: 'ethanol', structurePlane: { sprite } });
  assert.ok(withPlane.structurePlane);
  assert.equal(withPlane.structurePlane.sprite, sprite);
  assert.equal(withPlane.structurePlane.corners.length, 4);
  for (const corner of withPlane.structurePlane.corners) {
    assert.ok(Number.isFinite(corner.x) && Number.isFinite(corner.y) && Number.isFinite(corner.z));
  }
  // 選択していなければ面は出さない
  assert.equal(plan({ structurePlane: { sprite } }).structurePlane, null);
  // sprite がなければ面は出さない（代替は詳細パネル側）
  assert.equal(plan({ selectedId: 'ethanol' }).structurePlane, null);
});

test('[pick] カード中心・点・空白の当たり判定', () => {
  const p = plan({ selectedId: 'ethanol' });
  const card = p.cards.find((item) => item.id === 'ethanol');
  assert.ok(card);
  assert.equal(R.pickScene(p, card.x, card.y), 'ethanol');

  const marker = p.markers.find((item) => {
    if (item.connected) return false;
    return !p.cards.some((other) => (
      item.x >= other.rect.x && item.x <= other.rect.x + other.rect.width &&
      item.y >= other.rect.y && item.y <= other.rect.y + other.rect.height
    ));
  });
  if (marker) {
    assert.equal(R.pickScene(p, marker.x, marker.y), marker.id);
  }
  assert.equal(R.pickScene(p, 1, 1), null);
});

test('[draw] 不透明カードを描画順どおりに塗る（fake ctx）', () => {
  const p = plan({ selectedId: 'ethanol' });
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
    stroke() {},
    clip() {},
    save() {},
    restore() {},
    translate() {},
    transform() {},
    drawImage() {},
    setLineDash() {},
    fillText(text) { labels.push(text); },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  const stats = R.drawScene(ctx, p, {});
  assert.equal(labels.length, p.cards.length);
  const cardOrder = p.nodes.filter((node) => node.card).map((node) => node.text);
  assert.deepEqual(labels, cardOrder);
  assert.equal(stats.cards, p.cards.length);
  assert.equal(stats.edgeSegments, p.edges.length);
  assert.equal(stats.edgeBatches, p.edgeBatches.length);
  assert.ok(stats.drawCalls > 0);
});

test('[labels] 長い名前でも矩形が正のサイズで、文字が切れても空にならない', () => {
  const compound = model.compounds.find((item) => item.name && item.name.length > 20);
  assert.ok(compound);
  const text = R.truncateToWidth(compound.name, 120, 12);
  assert.ok(text.length > 0);
  assert.ok(text.endsWith('…'));
  assert.ok(R.estimateTextWidth(text, 12) <= 120 + 12);
});
