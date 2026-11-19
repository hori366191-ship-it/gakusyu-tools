/**
 * app11-3d ページ構成の静的テスト（ブラウザを起動しない）
 *
 * 実行: node --test scripts/tests/app11-3d-page.test.cjs
 *
 * 対象: site/app11/3d/index.html / app.js / app3d.css / README.md
 *   - 共有データの読み込み順
 *   - 外部 CDN・Three.js に依存しない
 *   - 固定ダークテーマが .r3d に閉じている
 *   - アイドル時の連続アニメーションがない
 *   - フォールバック・実URL・非公開の記載
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11', '3d');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'app3d.css'), 'utf8');
const readme = fs.readFileSync(path.join(APP, 'README.md'), 'utf8');
const R3D = require(path.join(APP, 'renderer.js'));
const DATA = require(path.join(ROOT, 'site', 'app11', 'data.js'));

function scriptSources(source) {
  const out = [];
  const re = /<script[^>]+src="([^"]+)"/g;
  let match;
  while ((match = re.exec(source))) out.push(match[1]);
  return out;
}

test('[files] 必要なファイルが存在する', () => {
  const files = [
    'index.html', 'app3d.css', 'projection.js', 'layout3d.js', 'scene-model.js',
    'renderer.js', 'interaction.js', 'app.js', 'README.md'
  ];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(APP, file)), file);
  }
});

test('[load-order] 共有データ → 共有構造 → 試作モジュールの順で読む', () => {
  const srcs = scriptSources(html);
  const expected = [
    '../../shared/organic-structure.js',
    '../data.js',
    './academic-facts.js',
    '../reaction-groups.js',
    './projection.js',
    './layout3d.js',
    './scene-model.js',
    './renderer.js',
    './interaction.js',
    './detail.js',
    './app.js'
  ];
  assert.deepEqual(srcs, expected);
});

test('[detail] 詳細本文は専用 div へ委譲し、app がタイトル・閉じる・フォーカスを持つ', () => {
  assert.ok(html.includes('id="r3d-detail-body"'));
  assert.ok(html.indexOf('./detail.css') > html.indexOf('./app3d.css'), 'detail.css は app3d.css の後');
  assert.ok(js.includes('RP3DDetail.renderBody'));
  assert.ok(js.includes("$('r3d-clear')"));
  assert.ok(js.includes('r3d-detail-focus'));
  // 詳細本文のフォールバック（detail.js 未読込でも壊れない）
  assert.ok(js.includes('renderRoutesFallback'));
});

test('[offline] 外部CDN・Three.js・fetch に依存しない', () => {
  assert.equal(/https?:\/\//.test(scriptSources(html).join(' ')), false);
  assert.equal(/three(\.min)?\.js/i.test(html), false);
  assert.equal(/\bfetch\s*\(/.test(js), false);
  assert.equal(/import\s+/.test(js), false);
});

test('[fallback] Canvas 2D が使えない場合のHTML一覧がある', () => {
  assert.ok(html.includes('id="r3d-fallback"'));
  assert.ok(html.includes('3D表示を開始できませんでした'));
  assert.ok(html.includes('r3d-fallback-search'));
  assert.ok(js.includes('canvas.getContext(\'2d\')'));
  assert.ok(js.includes('showFallback'));
});

test('[dark] 固定ダークテーマが .r3d に閉じ、全体テーマを読み込まない', () => {
  assert.ok(css.includes('.r3d-body'));
  assert.ok(css.includes('background: #05070c'));
  assert.equal(/themes\/(pop|forest)\.css/.test(html), false);
  assert.equal(/<body[^>]*data-theme/.test(html), false);
  // 公開ページなので noindex は付けない。
  assert.equal(html.includes('noindex'), false);
});

test('[touch] 1本指の既定は回転で、移動トグルを明示したときだけパン', () => {
  assert.ok(html.includes('id="r3d-touch-move"'));
  assert.ok(html.includes('id="r3d-touch-rotate"'));
  assert.ok(html.includes('aria-label="1本指ドラッグの操作"'));
  // HTML の初期状態も回転が押された状態
  assert.ok(/id="r3d-touch-rotate"\s+aria-pressed="true"/.test(html));
  assert.ok(/id="r3d-touch-move"\s+aria-pressed="false"/.test(html));
  // 実際の初期ロジックも回転
  assert.ok(js.includes("touchMode: 'rotate'"));
  assert.ok(js.includes('I.touchMode(mode)'));
  assert.ok(js.includes("I.oneFingerMode(event.pointerType, state.touchMode, event)"));
  assert.ok(js.includes("setTouchMode('rotate')"));
  // 2本指のひねりでは回転しない
  assert.ok(js.includes('2 本指のひねりでは回転しない'));
});

test('[lock] 選択/単一検索のフォーカス固定が全入力へ配線されている', () => {
  assert.ok(js.includes("enterCameraLock('selection', id, true)"));
  assert.ok(js.includes("enterCameraLock('search'"));
  assert.ok(js.includes('function exitCameraLock'));
  // wheel: lock 中はカーソルアンカーを使わず pivot ズーム
  const wheelStart = js.indexOf('function onWheel');
  const wheelEnd = js.indexOf('function onDoubleClick');
  const wheelBody = js.slice(wheelStart, wheelEnd);
  assert.ok(wheelBody.includes('if (state.lock)'));
  assert.ok(wheelBody.includes('zoomBy(factor)'));
  assert.ok(wheelBody.includes('zoomCameraAtScreen'));
  // pan 入力（ドラッグ・キーボード・ピンチ中点）を止める
  assert.ok(js.includes('if (state.lock) return;'));
  assert.ok(js.includes('if (state.lock) break;'));
  assert.ok(js.includes("state.lock && event.pointerType === 'touch'"));
  // 1本指移動トグルは lock 中 disabled / 解除で復元（選んでいたモードへ）
  assert.ok(js.includes('els.touchMove.disabled = locked'));
  assert.ok(js.includes("state.touchMode === 'move' ? 'true' : 'false'"));
  assert.ok(js.includes("state.touchMode === 'rotate' ? 'true' : 'false'"));
  // clear / reset で解除（camera は戻さない = update を呼ばない）
  const clearStart = js.indexOf('function clearSelection');
  const clearEnd = js.indexOf('function focusSelected');
  const clearBody = js.slice(clearStart, clearEnd);
  assert.ok(clearBody.includes('exitCameraLock()'));
  assert.equal(clearBody.includes('centerCameraOnPoint'), false);
  const resetStart = js.indexOf('function resetView');
  const resetEnd = js.indexOf('function setLayer');
  assert.ok(js.slice(resetStart, resetEnd).includes('exitCameraLock()'));
  // 解除時に camera を書き換えない（向き・倍率・位置のスナップなし）
  const exitStart = js.indexOf('function exitCameraLock');
  const exitEnd = js.indexOf('function queueOrbit', exitStart);
  const exitBody = js.slice(exitStart, exitEnd);
  assert.equal(/state\.camera\s*=/.test(exitBody), false);
  assert.ok(exitBody.includes('syncTouchModeUi'));
});

test('[startup] 起動は最大ズーム、R/0/初期位置は同じ初期化へ滑らかに戻る', () => {
  assert.ok(js.includes('function makeStartup'));
  assert.ok(js.includes('P.startupCamera(layout.list, layout.center'));
  // 初回ロードはアニメーションせず、そのまま初期ポーズ
  assert.ok(js.includes('state.camera = makeStartup()'));
  // 全体表示ボタンは廃止し、初期位置ボタンにした
  assert.ok(html.includes('id="r3d-reset"'));
  assert.ok(html.includes('初期位置'));
  assert.equal(html.includes('全体表示 <kbd>R</kbd>'), false);
  // resetView は同じ initializer を target にし、reset 遷移で滑らかに戻す
  const resetStart = js.indexOf('function resetView');
  const resetEnd = js.indexOf('function setLayer', resetStart);
  const resetBody = js.slice(resetStart, resetEnd);
  assert.ok(resetBody.includes('var target = makeStartup()'));
  assert.ok(resetBody.includes("startCameraTransition('reset', target, 0, TRANSITION_RESET_MS, false)"));
  assert.ok(resetBody.includes('prefersReducedMotion()'));
  assert.equal(resetBody.includes('P.fitCamera'), false);
  assert.equal(js.includes('function makeHome'), false);
  // リサイズ時の処理にカメラ距離の再設定がない
  const resizeStart = js.indexOf('function onResize');
  const resizeEnd = js.indexOf("window.addEventListener('resize'", resizeStart);
  const resizeBody = js.slice(resizeStart, resizeEnd);
  assert.equal(/state\.camera\s*=/.test(resizeBody), false);
});

test('[transition] プレビュー→イージングを既存 rAF で回し、入力中断規則がある', () => {
  assert.ok(js.includes('TRANSITION_PREVIEW_MS = 130'));
  assert.ok(js.includes('TRANSITION_EASE_MS = 430'));
  assert.ok(js.includes('TRANSITION_RESET_MS = 520'));
  assert.ok(js.includes('function applyCameraTransition'));
  assert.ok(js.includes('function interruptFreeTransition'));
  assert.ok(js.includes("state.transition.kind === 'reset'"));
  assert.ok(js.includes('if (state.transition) requestRender()'));
  assert.ok(js.includes('P.interpolateCamera'));
  // 選択・単一検索はアニメーション付きで固定、reduced-motion では即時
  assert.ok(js.includes("enterCameraLock('selection', id, true)"));
  assert.ok(js.includes("enterCameraLock('search', id, true)"));
  assert.ok(js.includes('animate && !prefersReducedMotion()'));
  // 遷移中の明示回転/ズームはキューし、着地後に適用
  assert.ok(js.includes('function queueOrbit'));
  assert.ok(js.includes('function queueZoom'));
  assert.ok(js.includes('function flushPendingInput'));
  // 解除・リセット・新選択は遷移を止める/置き換える
  assert.ok(js.includes('function cancelCameraTransition'));
  const exitStart = js.indexOf('function exitCameraLock');
  const exitEnd = js.indexOf('function queueOrbit', exitStart);
  assert.ok(js.slice(exitStart, exitEnd).includes('cancelCameraTransition()'));
  // 検索入力中の連発防止（単一一致が変わったときだけ遅延して固定）
  assert.ok(js.includes('function scheduleSearchLock'));
  assert.ok(js.includes('scheduleSearchLock(220)'));
  assert.ok(js.includes('cancelSearchLockTimer'));
  assert.equal(/setInterval/.test(js), false);
  // rAF はコアレス描画とキーパンの 2 箇所のまま
  assert.equal((js.match(/requestAnimationFrame/g) || []).length, 2);
});

test('[lock] 単一の実一致だけを一時 pivot にし、複数/なしでは固定しない', () => {
  const start = js.indexOf('function syncSearchLock');
  const end = js.indexOf('function resetSearchState', start);
  const body = js.slice(start, end);
  assert.ok(body.includes('model.search(query, 2)'));
  assert.ok(body.includes('matches.length === 1'));
  assert.ok(body.includes("enterCameraLock('search', id, true)"));
  // 検索ロックは選択・詳細を開かない
  assert.equal(body.includes('select('), false);
  assert.equal(body.includes('renderDetail'), false);
  assert.ok(js.includes('syncSearchLock();'));
  // 検索結果の明示選択は既存 select（全選択モード）へ
  assert.ok(js.includes('select(result.id, { focus: false })'));
});

test('[focus] 選択時は検索表示を閉じ、選択解除で全表示へ戻る配線がある', () => {
  assert.ok(js.includes('function resetSearchState'));
  assert.ok(js.includes('resetSearchState();\n    state.selectedId = id;'));
  assert.ok(js.includes('resetSearchState();\n    state.selectedId = null;'));
  // 選択中に入力したら選択を解除して通常検索へ
  assert.ok(/if \(state\.selectedId\) \{\s*exitCameraLock\(\);\s*state\.selectedId = null;/.test(js));
});

test('[wheel] ホイールはカーソルの実座標をアンカーにズームする（中央固定ではない）', () => {
  const start = js.indexOf('function onWheel');
  const end = js.indexOf('function onDoubleClick');
  const body = js.slice(start, end);
  assert.ok(body.includes('pointerPosition(event)'));
  assert.ok(body.includes('zoomCameraAtScreen'));
  assert.ok(body.includes('pickScene(state.plan'));
  assert.ok(body.includes('cancelKeyboardPan'));
  // 選択を変えない
  assert.equal(body.includes('select('), false);
});

test('[perf] 通常経路の可視下限とバッチ描画（1本ごとの save/restore なし）', () => {
  const renderer = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8');
  assert.ok(renderer.includes('edgePaint'));
  assert.ok(renderer.includes('EDGE_DEPTH_ALPHA'));
  assert.ok(renderer.includes('EDGE_ORDINARY_ALPHA'));
  assert.ok(renderer.includes('strokeSegments(ctx, batch.edges)'));
  // drawScene 内の save/restore は構造式の面だけ（2 組）
  const drawStart = renderer.indexOf('function drawScene');
  const drawEnd = renderer.indexOf('// 実際に描いた順の逆');
  const body = renderer.slice(drawStart, drawEnd);
  const saves = body.match(/\.save\(\)/g) || [];
  const restores = body.match(/\.restore\(\)/g) || [];
  assert.ok(saves.length <= 2, `save が多すぎる: ${saves.length}`);
  assert.equal(saves.length, restores.length);
});

test('[motion] rAF はコアレス描画とキーボードパンの 2 箇所だけで、アイドル時ループがない', () => {
  const matches = js.match(/requestAnimationFrame/g) || [];
  assert.equal(matches.length, 2);
  assert.equal(/setInterval/.test(js), false);
  assert.equal(/requestAnimationFrame\s*\(\s*function\s+loop/.test(js), false);
  // キーボードパンは active の間だけ次フレームを予約する
  assert.ok(js.includes('if (delta.active) startPanFrame()'));
  assert.ok(js.includes('function cancelKeyboardPan'));
  assert.ok(js.includes("window.addEventListener('blur', cancelKeyboardPan)"));
  assert.ok(js.includes('prefersReducedMotion'));
  assert.ok(js.includes('createKeyboardPan'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('animation: none !important'));
});

test('[camera] 明示的なジャンプは reset / focus だけ', () => {
  assert.ok(js.includes('function resetView'));
  assert.ok(js.includes('function focusSelected'));
  // 自動でフォーカスするタイマーがない
  assert.equal(/setTimeout\([^)]*focusSelected/.test(js), false);
});

test('[legend] 凡例は D.regions の並びと描画パレットを単一の色定義から使う', () => {
  const items = R3D.legendItems(DATA.regions);
  assert.equal(items.length, DATA.regions.length + 1);
  assert.deepEqual(items.slice(0, -1).map((item) => item.id), DATA.regions.map((region) => region.id));
  for (const item of items.slice(0, -1)) {
    assert.equal(item.color, R3D.REGION_COLORS[item.id]);
    assert.equal(item.color, R3D.regionColor(item.id));
  }
  // 実データの region はすべてパレットに載っている（未知色・フォールバックを使わない）
  const palette = new Set(Object.keys(R3D.REGION_COLORS));
  for (const compound of DATA.compounds) {
    assert.ok(palette.has(compound.region), compound.id + ' の region がパレットにない');
  }
  const route = items[items.length - 1];
  assert.equal(route.route, true);
  assert.equal(route.normal, R3D.ROUTE_INK.normal);
  assert.equal(route.academic, R3D.ROUTE_INK.academic);
});

test('[legend] 下部ツールバー内に凡例があり、旧カウント表示は残らない', () => {
  const controls = html.indexOf('id="r3d-controls"');
  const legend = html.indexOf('id="r3d-legend"');
  const detail = html.indexOf('id="r3d-detail"');
  assert.ok(controls > -1 && legend > controls && legend < detail);
  assert.ok(html.includes('id="r3d-legend-list"'));
  assert.ok(html.includes('role="group"'));
  assert.equal(/r3d-stats/.test(html + js + css), false);
  assert.equal(js.includes('表示カード'), false);
  assert.ok(js.includes('R.legendItems(regions'));
  assert.ok(js.includes('region: state.region'));
  assert.ok(js.includes('function toggleRegion'));
  assert.ok(js.includes("setAttribute('aria-pressed'"));
  // 分類切替はカメラ・選択・フォーカス固定を触らない
  const start = js.indexOf('function applyRegion');
  const end = js.indexOf('function buildLegend', start);
  const body = js.slice(start, end);
  assert.equal(/state\.camera\s*=/.test(body), false);
  assert.equal(body.includes('enterCameraLock'), false);
  assert.equal(body.includes('exitCameraLock'), false);
  assert.ok(body.includes('syncRegionUi'));
  assert.ok(body.includes('requestRender'));
  // 狭い画面では既定で閉じ、ツールバーを潰さない
  assert.ok(js.includes("matchMedia('(max-width: 820px)')"));
  assert.ok(js.includes('legend.open = false'));
  assert.ok(css.includes('@media (max-width: 820px)'));
  assert.ok(css.includes('.r3d-legend { flex-basis: 100%'));
  // 凡例の高さを確定してから起動カメラを測る（ツールバー矩形が中心計算の除外領域）
  assert.ok(js.indexOf('buildLegend(normalData.regions)') < js.indexOf('state.camera = makeStartup()'));
});

test('[legend] 凡例の開閉でツールバーの実測矩形が変わったら固定中心を追従する', () => {
  // toggle ハンドラ内で maybeRecenter() を呼ぶ（凡例を開くとツールバーが背高になり、
  // 使える領域が変わるため）。カメラを直接動かすのではなく、リサイズと同じ経路に任せる。
  const start = js.indexOf("legend.addEventListener('toggle'");
  assert.ok(start > -1);
  const body = js.slice(start, js.indexOf('});', start) + 3);
  assert.ok(body.includes('maybeRecenter()'));
  assert.equal(/state\.camera\s*=/.test(body), false);
  // ヘッダの折り返し・ツールバーの高さ変化も ResizeObserver で拾う。
  assert.ok(js.includes('observer.observe(els.head)'));
  assert.ok(js.includes('observer.observe(els.toolbar)'));
});

test('[url] README に公開URLとローカル確認手順がある', () => {
  assert.ok(readme.includes('https://hori366191-ship-it.github.io/gakusyu-tools/app11/3d/'));
  assert.ok(readme.includes('http://localhost:8000/site/app11/3d/'));
  assert.ok(readme.includes('python -m http.server 8000'));
});

test('[controls] 検索・未接続・操作説明の要素があり、層切替は無い', () => {
  for (const id of ['r3d-search', 'r3d-unconnected', 'r3d-reset', 'r3d-focus', 'r3d-help', 'r3d-back']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('role="combobox"'));
  // 公開版は通常＋大学の常時合成。層切替の UI を持たない。
  assert.equal(html.includes('r3d-layer'), false);
  assert.ok(html.includes('href="../"'));
});

test('[shared] 3D は site/app11 の宣言データだけを読み、academic の x/y を使わない', () => {
  const layout = fs.readFileSync(path.join(APP, 'layout3d.js'), 'utf8');
  assert.ok(layout.includes("compound.x"));
  assert.ok(layout.includes("compound.y"));
  // layout3d は academic データを引数に取らない
  assert.equal(/academicData|academic\.reactions|academic\.layout/.test(layout), false);
  const model = fs.readFileSync(path.join(APP, 'scene-model.js'), 'utf8');
  assert.equal(/reaction\.x|reaction\.y/.test(model), false);
});
