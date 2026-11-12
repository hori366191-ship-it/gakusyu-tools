/**
 * 有機反応マップ（試験版・site/app11）の再発防止テスト
 *
 * 実行: node --test scripts/tests/app11-reaction-map.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。生成データ（data.js）と表示計算（map-core.js）を
 * Node で読み込み、収録範囲・固定座標・状態区分・ビルダー経路・独立性・3テーマ・
 * 操作の配線を静的に確認する。実際のクリック操作は test サブエージェントが担当する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app11');
const APP10 = path.join(ROOT, 'site', 'app10');
const SRC = path.join(ROOT, 'site-src', 'app11');
const LAB = path.join(ROOT, 'design-lab', 'app10-next');

const D = require(path.join(APP, 'data.js'));
const Core = require(path.join(APP, 'map-core.js'));
const A10 = require(path.join(APP10, 'data.js'));
const C10 = require(path.join(APP10, 'catalog.js'));
const G = require(path.join(ROOT, 'scripts', 'app11', 'geometry.cjs'));
const Met = require(path.join(ROOT, 'scripts', 'app11', 'metrics.cjs'));
const Opt = require(path.join(ROOT, 'scripts', 'app11', 'optimize-layout.cjs'));
const { spawnSync } = require('node:child_process');

function read(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function param(href, key) {
  const url = new URL(href, 'https://example.invalid/site/app11/index.html');
  return url.searchParams.get(key);
}

function themeBlock(css, theme) {
  const m = css.match(new RegExp('html\\[data-theme="' + theme + '"\\]\\s*\\{([\\s\\S]*?)\\}'));
  return m ? m[1] : '';
}

function cssValue(block, name) {
  const m = block.match(new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*([^;]+);'));
  return m ? m[1].trim() : '';
}

function channel(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  return 0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16));
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function blendWhite(hex, alpha) {
  const mix = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - alpha) + 255 * alpha);
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return '#' + to2(mix(1)) + to2(mix(3)) + to2(mix(5));
}

test('[data] 全物質と高校必須294件を独立静的データとして収録する', () => {
  assert.equal(D.meta.compoundCount, 427, 'app10 の全化合物を含む');
  assert.equal(D.compounds.length, 427);
  assert.equal(D.meta.requiredCount, 294);
  const ids = new Set(D.compounds.map((c) => c.id));
  const required = A10.REQUIRED_CURRICULUM.filter((id, i, arr) => arr.indexOf(id) === i);
  assert.equal(required.length, 294);
  const missing = required.filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], '必須物質がすべて独立データにある');
  assert.equal(D.compounds.filter((c) => c.curriculum).length, 294, '必須フラグの件数も一致する');
  // 反応を持たない物質も収録してよいが、不可能扱いしない（未確認か収録外）
  const isolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0);
  assert.ok(isolated.length > 0, '孤立ノードも収録する');
  isolated.forEach((c) => {
    assert.equal(c.pathState, 'unverified', c.id + ' は未確認として残す（収録外・不可能にしない）');
  });
});

test('[data] 反応は独自データで、app10 の自由文（precursors/reactions）を流用しない', () => {
  const dataText = read('data.js');
  const sample = [];
  Object.keys(A10.COMPOUNDS).forEach((id) => {
    const c = A10.COMPOUNDS[id];
    if (c.precursors && c.precursors.length > 8) sample.push(c.precursors);
    if (c.reactions && c.reactions.length > 8) sample.push(c.reactions);
    if (c.nature && c.nature.length > 8) sample.push(c.nature);
  });
  assert.ok(sample.length > 100, '比較対象の自由文が取れている');
  const leaked = sample.filter((text) => dataText.includes(text));
  assert.deepEqual(leaked.slice(0, 5), [], 'app10 の自由文が data.js に含まれない');
  assert.equal(dataText.includes('"precursors"'), false, '前駆体の自由文フィールドを持たない');
  assert.equal(dataText.includes('"reactions": "'), false, '反応メモの自由文フィールドを持たない');
});

test('[data] 公開する反応は確認済みだけで、検証記録に節と日付をもつ', () => {
  const typeIds = Object.keys(D.types);
  const compoundIds = new Set(D.compounds.map((c) => c.id));
  const seen = new Set();
  assert.equal(D.reactions.length, D.meta.reactionCount);
  assert.equal(D.meta.confirmedReactionCount, D.reactions.length);
  assert.ok(D.meta.heldReactionCount > 0, '保留にした反応がある');
  D.reactions.forEach((r) => {
    assert.equal(seen.has(r.id), false, '反応IDが重複: ' + r.id);
    seen.add(r.id);
    assert.ok(typeIds.includes(r.type), r.id + ' の種別が未定義');
    assert.ok(r.substrates.length > 0, r.id + ' に基質がない');
    r.substrates.concat(r.products).forEach((id) => {
      assert.ok(compoundIds.has(id), r.id + ' の物質IDが未収録: ' + id);
    });
    if (!r.products.length) assert.ok(r.productNote, r.id + ' は生成物の説明が必要');
    assert.ok(r.conditions.length > 0, r.id + ' に条件の記載がない');
    assert.equal(r.state, 'confirmed', r.id + ' は確認済みだけを公開する');
    assert.ok(Array.isArray(r.sources) && r.sources.length > 0, r.id + ' に検証記録がない');
    r.sources.forEach((s) => {
      assert.ok(s.includes(D.meta.sourceBook), r.id + ' の資料名: ' + s);
      assert.ok(/\d+\.\d+/.test(s), r.id + ' の節番号: ' + s);
      assert.ok(s.includes('2026-11-10'), r.id + ' の確認日: ' + s);
    });
    assert.equal(Object.prototype.hasOwnProperty.call(r, 'verification'), false, '内部用の検証記録を公開しない');
  });
  // 実験書化を避ける: 試薬量・濃度・具体操作・装置名を書かない
  const forbidden = /(mL|ml|mol\/L|g\/L|滴|試験管|ビーカー|フラスコ|加熱板|スポイト|濃度\s*\d)/;
  D.reactions.forEach((r) => {
    const text = [r.conditions, r.note, r.productNote].join(' ');
    assert.equal(forbidden.test(text), false, r.id + ' に実験手順・試薬量の記載がある: ' + text);
  });
  // 確認できなかった反応は公開データに含めない
  const dataText = read('data.js');
  const source = JSON.parse(fs.readFileSync(path.join(SRC, 'reactions.json'), 'utf8'));
  const held = source.reactions.filter((r) => r.state !== 'confirmed');
  assert.ok(held.length > 0, '保留の反応が正本にある');
  held.forEach((r) => {
    assert.equal(D.reactions.some((x) => x.id === r.id), false, '保留を公開しない: ' + r.id);
  });
  assert.equal(D.meta.heldReactionCount, held.length);
  // 公開データに外部URL・本文抜粋を載せない
  assert.equal(dataText.includes('https://'), false, 'data.js に外部URLを含めない');
  assert.equal(dataText.includes('openstax.org'), false, 'data.js に資料URLを含めない');
});

test('[data] 座標は固定で重ならず、孤立物質は外縁の棚に収まる', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
  assert.equal(layout.version, 3);
  assert.equal(layout.regions.some((r) => r.panel), false, '分野パネルで囲わない');
  // 全ノードが重ならない
  const rects = D.compounds.map((c) => ({ id: c.id, x: c.x, y: c.y, w: D.meta.nodeW, h: D.meta.nodeH }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
      assert.equal(overlap, false, 'ノードが重なる: ' + a.id + ' / ' + b.id);
    }
  }
  const canvas = D.meta.canvas;
  D.compounds.forEach((c) => {
    assert.ok(c.x >= canvas.x && c.x + D.meta.nodeW <= canvas.x + canvas.w, c.id + ' の x');
    assert.ok(c.y >= canvas.y && c.y + D.meta.nodeH <= canvas.y + canvas.h, c.id + ' の y');
  });
  // 孤立326件は棚の中、接続101件は棚の外
  const shelf = layout.shelf;
  assert.equal(shelf.count, D.compounds.filter((c) => c.incoming + c.outgoing === 0).length);
  assert.equal(shelf.count, 326);
  const isolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0);
  const connected = D.compounds.filter((c) => c.incoming + c.outgoing > 0);
  assert.equal(connected.length, 101);
  isolated.forEach((c) => {
    assert.ok(c.x >= shelf.x - 1 && c.x <= shelf.x + shelf.cols * 152, c.id + ' が棚の外');
    assert.ok(c.y >= shelf.y - 1 && c.y <= shelf.y + shelf.rows * 54, c.id + ' が棚の外');
  });
  connected.forEach((c) => {
    assert.ok(c.x < shelf.x - 20, c.id + ' は棚の外のネットワーク側');
  });
  // 分野の focus は、その分野の反応関連物質を含む
  D.regions.forEach((region) => {
    const members = region.members.map((id) => D.compounds.find((c) => c.id === id));
    const linked = members.filter((c) => c.incoming + c.outgoing > 0);
    assert.ok(region.focus.w > 0 && region.focus.h > 0, region.id + ' の focus');
    (linked.length ? linked : members).forEach((c) => {
      assert.ok(c.x + D.meta.nodeW / 2 >= region.focus.x && c.x + D.meta.nodeW / 2 <= region.focus.x + region.focus.w,
        region.id + ' の focus に ' + c.id + ' が入る');
      assert.ok(c.y + D.meta.nodeH / 2 >= region.focus.y && c.y + D.meta.nodeH / 2 <= region.focus.y + region.focus.h,
        region.id + ' の focus に ' + c.id + ' が入る');
    });
  });
});

test('[data] 分野横断の反応を区別し、反応マーカーは固定座標に置く', () => {
  let cross = 0;
  D.reactions.forEach((r) => {
    const regions = new Set();
    r.substrates.concat(r.products).forEach((id) => {
      const c = D.compounds.find((x) => x.id === id);
      regions.add(c.region);
    });
    assert.equal(r.cross, regions.size > 1, r.id + ' の分野横断フラグ');
    if (r.cross) cross++;
    assert.ok(typeof r.x === 'number' && typeof r.y === 'number', r.id + ' のマーカー座標');
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), r.id);
    assert.ok(r.x >= D.meta.canvas.x && r.x <= D.meta.canvas.x + D.meta.canvas.w, r.id);
    assert.ok(r.y >= D.meta.canvas.y && r.y <= D.meta.canvas.y + D.meta.canvas.h, r.id);
    assert.ok(r.typeLabel.length > 0, r.id);
  });
  assert.ok(cross > 20, '分野横断の反応が十分にある');
  assert.ok(D.meta.reactionCount - cross > 20, '同一分野内の反応もある');
});

test('[builder] ビルダー経路は routeFor と一致し、focus を必ず含む', () => {
  let linked = 0;
  D.compounds.forEach((c) => {
    const route = C10.routeFor(c.id);
    if (!route) {
      assert.equal(c.builder.href, null, c.id + ' は経路がないのでリンクしない');
      return;
    }
    linked++;
    assert.ok(c.builder.href, c.id + ' のリンクがない');
    assert.ok(c.builder.href.startsWith('../app10/index.html?'), c.id + ' の遷移先');
    assert.equal(param(c.builder.href, 'mode'), route.mode, c.id + ' の mode');
    assert.equal(param(c.builder.href, 'focus'), c.id, c.id + ' の focus');
    if (route.mode === 'chain') {
      assert.equal(param(c.builder.href, 'family'), route.family);
      assert.equal(param(c.builder.href, 'cpartial'), String(route.partialC));
      if (route.shape) assert.equal(param(c.builder.href, 'shape'), route.shape);
    } else if (route.mode === 'ring') {
      assert.equal(param(c.builder.href, 'system'), route.system);
      const preset = route.preset || route.group;
      if (preset) assert.equal(param(c.builder.href, 'preset'), preset);
    } else {
      assert.equal(param(c.builder.href, 'category'), route.category);
      if (route.family) assert.equal(param(c.builder.href, 'family'), route.family);
    }
    assert.ok(A10.COMPOUNDS[c.id], c.id + ' がビルダーの収録IDにある');
  });
  assert.equal(linked, D.compounds.length, '全物質にビルダー経路がある');
  // 実行時に app10 を読み込まない
  for (const file of ['index.html', 'app.js', 'map-core.js']) {
    const text = file.endsWith('.html') ? read(file) : read(file);
    assert.equal(/<script[^>]+\.\.\/app10\//.test(text), false, file + ' が app10 のスクリプトを読み込む');
    assert.equal(text.includes("require('./data.js')"), false, file + ' が app10 を require する');
  }
});

test('[core] semantic zoom は倍率だけで決まり、位置を変えない', () => {
  assert.deepEqual(Core.DETAIL_THRESHOLDS, [0.5, 1.0]);
  assert.equal(Core.detailLevel(0.1), 0);
  assert.equal(Core.detailLevel(0.4999), 0);
  assert.equal(Core.detailLevel(0.5), 1);
  assert.equal(Core.detailLevel(0.9999), 1);
  assert.equal(Core.detailLevel(1.0), 2);
  assert.equal(Core.detailLevel(2.4), 2);
  // 同じ倍率なら常に同じ段階（乱数・ランダム間引きをしない）
  for (let i = 0; i < 5; i++) assert.equal(Core.detailLevel(0.73), Core.detailLevel(0.73));
  const canvas = D.meta.canvas;
  const fit = Core.fitTransform(canvas, 1200, 600, 14);
  const level = Core.detailLevel(fit.scale);
  assert.ok(level === 0 || level === 1, '初期表示は詳細を出しすぎない');
  // 変換は座標を書き換えない（同じ入力なら同じ出力）
  const a = Core.worldToScreen(fit, 100, 200);
  const b = Core.worldToScreen({ scale: fit.scale, x: fit.x, y: fit.y }, 100, 200);
  assert.deepEqual(a, b);
  const back = Core.screenToWorld(fit, a.x, a.y);
  assert.ok(Math.abs(back.x - 100) < 1e-6 && Math.abs(back.y - 200) < 1e-6);
});

test('[core] 全体復帰・現在位置・分野移動・検索の計算', () => {
  const canvas = D.meta.canvas;
  const fit = Core.fitTransform(canvas, 1200, 600, 14);
  assert.equal(Core.isOverview(fit, canvas, 1200, 600), true);
  const zoomed = Core.zoomAt(fit, 2, 600, 300);
  assert.equal(Core.isOverview(zoomed, canvas, 1200, 600), false);
  const text = Core.positionText(fit, D.regions, D.compounds, null, canvas, 1200, 600);
  assert.ok(text.includes('全体表示'), text);
  const region = D.regions[0];
  const rv = Core.regionView(region, 1200, 600, 24);
  assert.ok(rv.scale >= 0.08, '分野表示の倍率');
  const regionText = Core.positionText(rv, D.regions, D.compounds, D.compounds[0], canvas, 1200, 600);
  assert.ok(D.regions.some((r) => regionText.includes(r.name)), regionText);
  assert.ok(Core.matchCompounds(D.compounds, 'エタノール').some((c) => c.id === 'ethanol'));
  assert.ok(Core.matchCompounds(D.compounds, 'ｃ２ｈ６ｏ').some((c) => c.id === 'ethanol'), '全角の示性式でも一致する');
  assert.deepEqual(Core.matchCompounds(D.compounds, ''), []);
  const clamped = Core.clampPan({ scale: fit.scale, x: 99999, y: -99999 }, 1200, 600, canvas);
  assert.ok(clamped.x < 99999 && clamped.y > -99999, '地図が画面外へ消えない');
});

test('[state] 分類選択と現在位置の表示・解除が一貫している', () => {
  const canvas = D.meta.canvas;
  const fit = Core.fitTransform(canvas, 1200, 600, 14);
  const alcohol = D.regions.find((r) => r.id === 'alcohol-ether');
  const explicit = Core.positionText(fit, D.regions, D.compounds, null, canvas, 1200, 600, 'alcohol-ether');
  assert.ok(explicit.includes(alcohol.name), explicit);
  assert.equal(explicit.includes('全体表示'), false, '明示選択は全体表示より優先');
  const withSelection = Core.positionText(fit, D.regions, D.compounds, { name: '付加の反応' }, canvas, 1200, 600, 'alcohol-ether');
  assert.ok(withSelection.includes(alcohol.name), withSelection);
  assert.ok(withSelection.includes('付加の反応'), withSelection);
  // 明示選択がなければ、画面中央の最寄り物質の分野へフォールバックする
  const fallback = Core.positionText(fit, D.regions, D.compounds, null, canvas, 1200, 600, null);
  assert.ok(fallback.includes('全体表示'), fallback);

  // アプリ側: チップ選択は activeRegion に保持し、パン/ズーム/物質・反応選択で解除する
  const js = read('app.js');
  assert.ok(js.includes('var activeRegion = null;'));
  assert.ok(js.includes('activeRegion = region.id;'));
  assert.ok(js.includes('function clearRegionSelection()'));
  assert.ok(js.includes('viewSize.w, viewSize.h, activeRegion)'), '現在位置に選択分類を渡す');
  assert.ok(js.includes('if (activeRegion) clearRegionSelection()'), 'パン・ズーム・フォーカスで解除');
  assert.ok(js.includes('clearRegionSelection();\n    if (selected && selected.el)'), '物質/反応選択の前に解除');
});

test('[core] 0件の理由を未確認・収録外・不可能で区別する', () => {
  const unverifiedIn = Core.emptyReason('unverified', 'in', D.states);
  const unverifiedOut = Core.emptyReason('unverified', 'out', D.states);
  const outOfScope = Core.emptyReason('out-of-scope', 'in', D.states);
  const impossible = Core.emptyReason('impossible', 'in', D.states);
  assert.ok(unverifiedIn.startsWith('未確認'));
  assert.ok(unverifiedOut.startsWith('未確認'));
  assert.ok(outOfScope.startsWith('収録外'));
  assert.ok(impossible.startsWith('該当しない'));
  assert.notEqual(unverifiedIn, outOfScope);
  assert.ok(unverifiedIn.includes('「生成しない」という意味ではありません'));
  assert.equal(/生成しない。/.test(unverifiedIn), false, '断定しない');
  // 実データでは、経路がない物質はすべて未確認として残す
  assert.ok(D.compounds.some((c) => c.pathState === 'unverified'));
  assert.equal(D.compounds.filter((c) => c.pathState === 'out-of-scope').length, 0);
  assert.equal(D.compounds.filter((c) => c.pathState === 'impossible').length, 0);
});

test('[data] 状態区分の語彙が揃い、未確認を不可能として扱わない', () => {
  assert.deepEqual(Object.keys(D.states).sort(), ['confirmed', 'impossible', 'outOfScope', 'unverified']);
  assert.equal(D.states.unverified.label, '未確認');
  assert.equal(D.states.outOfScope.label, '収録外');
  const text = read('data.js') + read('app.js') + read('map-core.js');
  const claims = text.match(/生成しない[^」]/g) || [];
  assert.deepEqual(claims, [], '未確認を「生成しない」と断定していない');
  assert.equal(D.meta.confirmedReactionCount, D.reactions.filter((r) => r.state === 'confirmed').length);
  // 確認数と物質収録数を区別して持つ
  assert.equal(D.meta.compoundCount, 427);
  assert.ok(D.meta.confirmedReactionCount < D.meta.compoundCount, '反応数と物質数を混同しない');
  assert.equal(D.meta.reactionCount, D.meta.confirmedReactionCount);
  assert.ok(D.meta.heldReactionCount > 0);
  assert.equal(read('app.js').includes('unverifiedReactionCount'), false, '旧・未確認件数の表示を残さない');
});

test('[static] index.html は読込順・テーマ・クレジット・一覧の導線をもつ', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['data.js', 'map-core.js', 'app.js']);
  assert.ok(html.includes('../themes/theme.js'));
  assert.ok(html.includes('../themes/pop.css'));
  assert.ok(html.includes('../themes/forest.css'));
  assert.ok(html.includes('../credits.html'));
  assert.ok(html.includes('favicon.svg'));
  assert.ok(html.includes('id="rp-list"'), 'アクセシブルな一覧');
  assert.ok(html.includes('id="rp-search"'), '名称検索');
  assert.ok(html.includes('id="rp-reset"'), '全体表示へ1操作');
  assert.ok(html.includes('id="rp-position"'), '現在位置');
  assert.ok(html.includes('id="rp-card"') && html.includes('role="dialog"'), '同一ページのカード');
  assert.ok(html.includes('aria-modal="false"'), '非モーダルのカード');
  assert.ok(html.includes('試験版'), '試験版であることを示す');
  assert.ok(html.includes('prefers-reduced-motion') === false);
  assert.ok(html.includes('操作手順'), '実験手順を扱わない注意');
  // 相対依存がすべて存在する
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|#|mailto:|data:)/.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    assert.equal(fs.existsSync(path.resolve(APP, clean)), true, '依存がない: ' + ref);
  }
});

test('[static] カードは共通説明と個別情報を分離し、キーボード操作とフォーカス復帰をもつ', () => {
  const js = read('app.js');
  assert.ok(js.includes('共通の説明'), '共通説明の見出し');
  assert.ok(js.includes('この反応の個別情報'), '個別情報の見出し');
  assert.ok(js.includes('rp-common'), '共通説明のスタイル分離');
  assert.ok(js.includes('模式図'), '模式図のラベル');
  assert.ok(js.includes('機構図は収録していません'), '機構図と混在させない');
  assert.ok(js.includes("e.key === 'Escape'"), 'Escape で閉じる');
  assert.ok(js.includes("document.addEventListener('pointerdown'"), 'カード外クリックで閉じる');
  assert.ok(js.includes('card.contains(e.target)'), 'カード内の操作では閉じない');
  assert.ok(js.includes('returnFocus'), '起点へフォーカスを戻す');
  assert.ok(js.includes('returnFocus.focus()'));
  assert.ok(js.includes("case 'Enter'"), 'Enter で開く');
  assert.ok(js.includes("case 'ArrowLeft'") && js.includes("case 'ArrowRight'"), '矢印キーで移動');
  assert.ok(js.includes("case '+'") && js.includes("case '-'"), 'キーで拡大縮小');
  assert.ok(js.includes("case '0'"), 'キーで全体表示');
  assert.ok(js.includes("tabindex: '0'"), 'ノードをキーボードで選べる');
  assert.ok(js.includes('role: ' + "'button'") || js.includes("role: 'button'"));
  assert.ok(js.includes('aria-label'), 'スクリーンリーダー向けの名前');
  assert.ok(js.includes('実戦') === false);
  // 双方向の追跡
  assert.ok(js.includes('この物質の製法'), '製法の一覧');
  assert.ok(js.includes('この物質からの生成物'), '生成先の一覧');
  assert.ok(js.includes('Core.emptyReason'), '0件の理由を区別する');
  assert.ok(js.includes('ビルダー収録外'), '対応が取れない物質はリンクを出さない');
  assert.ok(js.includes('独立資料の本文で確認済み'), '反応カードに確認済みを明示する');
  assert.ok(js.includes('r.sources.join'), '検証記録（資料名・節・確認日）を表示する');
  assert.equal(js.includes('未確認（独立資料での確認前）'), false, '未確認の反応を公開する前提の文言を残さない');
});

test('[static] 3テーマ・reduced motion・390px幅の規約に従う', () => {
  const css = read('app.css');
  const blocks = css.split('html[data-theme="pop"]')[1] || '';
  const forest = css.split('html[data-theme="forest"]')[1] || '';
  assert.ok(blocks.length > 200, 'pop テーマの変数上書き');
  assert.ok(forest.length > 200, 'forest テーマの変数上書き');
  for (const key of ['--rp-bg', '--rp-node', '--rp-cross', '--rp-region-line', '--rp-map-bg']) {
    assert.ok(css.includes(key + ':'), '既定テーマに ' + key);
    assert.ok(blocks.includes(key + ':'), 'pop に ' + key);
    assert.ok(forest.includes(key + ':'), 'forest に ' + key);
  }
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  const js = read('app.js');
  assert.ok(js.includes('prefers-reduced-motion'), 'JS でも reduced motion を判定する');
  assert.ok(js.includes('prefersReduce()'), 'アニメーションを無効化できる');
  assert.ok(css.includes('@media (max-width: 760px)'));
  assert.ok(css.includes('@media (max-width: 430px)'));
  assert.ok(css.includes('overflow-x: hidden'));
  assert.ok(css.includes('touch-action: none'), '地図内のパン操作');
  assert.equal(/min-width:\s*(?:[4-9]\d{2,}|\d{4,})px/.test(css), false, '固定の広い min-width を置かない');
  // テーマ切替UIは新設しない（theme.js に追従するだけ）
  assert.equal(read('index.html').includes('setGakusyuTheme'), false);
});

test('[static] forest のヘッダーは共通テーマの汎用 header と衝突せず、文字が読める', () => {
  const css = read('app.css');
  const block = themeBlock(css, 'forest');
  const bg = cssValue(block, '--rp-header-bg');
  const ink = cssValue(block, '--rp-header-ink');
  const stops = [...bg.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
  assert.ok(stops.length >= 2, 'forest のヘッダーは濃い緑のグラデーション: ' + bg);
  assert.match(ink, /^#[0-9a-f]{6}$/i, 'forest のヘッダー文字色: ' + ink);
  // ヘッダー文字（h1・サブタイトル）はグラデーションの両端で 4.5:1 以上
  stops.forEach((stop) => {
    const ratio = contrastRatio(ink, stop);
    assert.ok(ratio >= 4.5, 'forest のヘッダー文字と背景のコントラスト不足: ' + stop + ' = ' + ratio.toFixed(2));
  });
  // リンクは白 12% の半透明背景をもつため、明るい側の端でも読めること
  const linkBg = blendWhite(stops[stops.length - 1], 0.12);
  const linkRatio = contrastRatio(ink, linkBg);
  assert.ok(linkRatio >= 4.5, 'forest のヘッダーリンクのコントラスト不足: ' + linkRatio.toFixed(2));
  // 共通テーマ（themes/forest.css）は変更せず、アプリ側の限定セレクタで上書きする
  const forestTheme = fs.readFileSync(path.join(ROOT, 'site', 'themes', 'forest.css'), 'utf8');
  assert.match(
    forestTheme,
    /html\[data-theme="forest"\] header\s*\{[^}]*background:\s*var\(--color-cream-paper\)\s*!important/,
    '共通テーマの汎用 header ルール（前提）が残っている'
  );
  assert.match(
    css,
    /html\[data-theme="forest"\] \.rp-header\s*\{[^}]*background:\s*var\(--rp-header-bg\)\s*!important/,
    'forest のヘッダー背景をアプリ側で上書きする'
  );
  assert.match(
    css,
    /html\[data-theme="forest"\] \.rp-header h1\s*\{[^}]*color:\s*var\(--rp-header-ink\)\s*!important/,
    'forest の h1 色をアプリ側で上書きする'
  );
  assert.match(
    css,
    /html\[data-theme="forest"\] \.rp-header__link\s*\{[^}]*color:\s*var\(--rp-header-ink\)\s*!important/,
    'forest のヘッダーリンク色をアプリ側で上書きする'
  );
  assert.equal(
    /html\[data-theme="forest"\] header\s*\{/.test(css),
    false,
    '共通テーマのセレクタをコピーしない（.rp-header に限定する）'
  );
});

test('[static] 生成物が最新で、座標・マーカー・経路は layout.json / routes.json に固定されている', () => {
  const { build, renderData } = require(path.join(ROOT, 'scripts', 'app11', 'build-map-data.cjs'));
  const F = require(path.join(ROOT, 'scripts', 'app11', 'layout-format.cjs'));
  assert.equal(renderData(build()), read('data.js'), 'data.js が生成物と一致する（再生成が必要）');
  const layoutPath = path.join(SRC, 'layout.json');
  const routesPath = path.join(SRC, 'routes.json');
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  assert.equal(fs.readFileSync(layoutPath, 'utf8'), F.renderLayout(layout), 'layout.json が正規形');
  assert.equal(fs.readFileSync(routesPath, 'utf8'), F.renderRoutes(routes), 'routes.json が正規形');
  assert.equal(layout.version, 3);
  assert.equal(routes.version, 3);

  // ノードの座標は layout.json の x/y そのもの（閲覧時に再計算しない）
  assert.deepEqual(Object.keys(layout.positions).sort(), D.compounds.map((c) => c.id).sort());
  D.compounds.forEach((c) => {
    const pos = layout.positions[c.id];
    assert.equal(c.x, pos.x, c.id + ' の x');
    assert.equal(c.y, pos.y, c.id + ' の y');
    assert.equal(c.region, pos.r, c.id + ' の分野');
  });

  // 分野はパネルではなく、色 index・focus 範囲・members を持つ
  assert.equal(layout.regions.some((r) => r.panel), false, '分野パネルを持たない');
  D.regions.forEach((region) => {
    const lr = layout.regions.find((x) => x.id === region.id);
    assert.ok(lr, region.id + ' が layout にある');
    assert.equal(lr.colorIndex, region.colorIndex, region.id + ' の色 index');
    assert.equal(lr.members.length, region.count, region.id + ' の所属数');
    const members = D.compounds.filter((c) => c.region === region.id);
    assert.deepEqual(members.map((c) => c.id).sort(), lr.members.slice().sort(), region.id + ' の所属');
    assert.deepEqual(region.focus, lr.focus, region.id + ' の focus');
    assert.deepEqual(region.center, lr.center, region.id + ' の中心');
  });

  // 全反応に、基質・生成物の順に対応する経路がある
  let edgeCount = 0;
  D.reactions.forEach((r) => {
    const expected = r.substrates.map((id) => 'in:' + id).concat(r.products.map((id) => 'out:' + id));
    const actual = (r.edges || []).map((e) => e.dir + ':' + e.id);
    assert.deepEqual(actual, expected, r.id + ' の辺の対応');
    r.edges.forEach((e) => {
      edgeCount++;
      const key = r.id + '|' + e.dir + '|' + e.id;
      assert.ok(routes.edges[key], key + ' が routes.json にある');
      assert.deepEqual(routes.edges[key].points, e.points, key + ' の点列');
      assert.deepEqual(routes.edges[key].gaps, e.gaps, key + ' の切れ目');
      assert.deepEqual(routes.edges[key].bridges, e.bridges, key + ' の橋');
      assert.ok(e.points.length >= 2, key + ' の点数');
      e.points.forEach((p) => {
        assert.ok(p[0] >= D.meta.canvas.x && p[0] <= D.meta.canvas.x + D.meta.canvas.w, key + ' の x');
        assert.ok(p[1] >= D.meta.canvas.y && p[1] <= D.meta.canvas.y + D.meta.canvas.h, key + ' の y');
      });
    });
  });
  assert.equal(edgeCount, 207, '207 辺');
  assert.equal(Object.keys(routes.edges).length, 207);
  // 反応ラベルは保存済みの中心座標を使う
  D.reactions.forEach((r) => {
    assert.deepEqual(r.label, layout.reactions[r.id].label, r.id + ' のラベル位置');
    assert.ok(['N', 'S', 'E', 'W'].includes(r.label.side), r.id + ' のラベル側');
  });
  // 分断（gaps）に頼らず、浅い交差だけ橋を持つ
  const edges = Object.values(routes.edges);
  assert.equal(edges.every((e) => e.gaps.length === 0), true, '経路を分断しない');
  assert.ok(edges.some((e) => e.bridges.length > 0), '浅い交差に橋がある');
});

test('[static] 分野ごとに主要物質があり、ラベルは地図に収まる長さ', () => {
  const byRegion = new Map();
  D.compounds.forEach((c) => {
    assert.ok(c.label.length > 0 && c.label.length <= 12, c.id + ' のラベル: ' + c.label);
    if (c.hub) {
      const list = byRegion.get(c.region) || [];
      list.push(c.id);
      byRegion.set(c.region, list);
    }
  });
  D.regions.forEach((r) => {
    assert.ok(byRegion.has(r.id), r.id + ' に主要物質がない');
  });
  assert.ok(D.compounds.filter((c) => c.hub).length >= 20 && D.compounds.filter((c) => c.hub).length <= 40);
});

test('[static] app10 は右上の収録台帳と同じ領域に試験版へのリンクをもつ', () => {
  const prod = fs.readFileSync(path.join(APP10, 'index.html'), 'utf8');
  assert.ok(prod.includes('href="../app11/"'), '本番 app10 の導線');
  assert.ok(prod.includes('反応経路マップ（試験版）'));
  const linkBlock = prod.split('oc-header__links')[1].split('</div>')[0];
  assert.ok(linkBlock.includes('./ledger.html'), '収録台帳と同じ領域');
  assert.ok(linkBlock.includes('../app11/'), '収録台帳と同じ領域に地図リンク');
  // design-lab は本番と正規化後に一致する
  const lab = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
  const normalized = lab
    .split('../../site/themes/').join('../themes/')
    .split('../../site/app11/').join('../app11/')
    .split('../../site/credits.html').join('../credits.html');
  assert.equal(normalized, prod, 'design-lab/app10-next/index.html が本番と一致する');
  assert.ok(lab.includes('href="../../site/app11/"'), 'design-lab 側の相対パス');
});

test('[static] ポータル・GAS・Worker・テーマには触れていない（独立性）', () => {
  const files = ['index.html', 'app.css', 'data.js', 'map-core.js', 'app.js', 'favicon.svg'];
  files.forEach((file) => assert.equal(fs.existsSync(path.join(APP, file)), true, file + ' がある'));
  const dataText = read('data.js');
  assert.equal(dataText.includes('oc-'), false, 'app10 のクラス名を流用しない');
  assert.equal(dataText.includes('OCCatalog'), false);
  assert.equal(read('app.js').includes('OCData'), false);
  assert.equal(read('app.js').includes('OCCatalog'), false);
});

test('[metrics] 改善前後を同じ計測器で比較し、貫通・衝突・重なりを解消する', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
  const routes = JSON.parse(fs.readFileSync(path.join(SRC, 'routes.json'), 'utf8'));
  const before = Met.measure(Met.sceneFromBaseline());
  const after = Met.measure(Met.sceneFromLayout(layout, routes));

  // 改善前は、辺が無関係なノード・ラベルを貫通し、マーカーが衝突していた
  assert.ok(before.edges.nodePenetrations > 100, '改善前のノード貫通: ' + before.edges.nodePenetrations);
  assert.ok(before.edges.labelPenetrations > 100, '改善前のラベル貫通: ' + before.edges.labelPenetrations);
  assert.ok(before.markers.nodeCollisions > 0, '改善前のマーカー-物質衝突');
  assert.ok(before.markers.markerCollisions > 0, '改善前のマーカー相互衝突');

  // 改善後: 無関係ノード・ラベル・他マーカーの貫通 0、マーカー衝突 0
  assert.equal(after.edges.nodePenetrations, 0);
  assert.equal(after.edges.endpointPenetrations, 0);
  assert.equal(after.edges.labelPenetrations, 0);
  assert.equal(after.edges.titlePenetrations, 0);
  assert.equal(after.edges.markerPenetrations, 0);
  assert.equal(after.markers.nodeCollisions, 0);
  assert.equal(after.markers.markerCollisions, 0);
  assert.equal(after.markers.labelNodeCollisions, 0);
  assert.equal(after.markers.labelLabelCollisions, 0);
  assert.equal(after.markers.labelMarkerCollisions, 0);
  assert.equal(after.markers.labelTitleCollisions, 0);
  assert.equal(after.nodes.overlaps, 0);
  // 同一区間の連続共有 0（切れ目に頼らない）
  assert.equal(after.edges.overlapSegments, 0);
  assert.equal(after.edges.overlapSegmentsRaw, 0);
  // 経路の分断は使わず、浅い交差だけ橋で区別する
  assert.equal(after.edges.crossingsWithoutGap, 0);
  assert.equal(after.edges.unbridgedAcute, 0);
  assert.ok(after.edges.bridgedCrossings > 0, '浅い交差に橋がある');
  assert.ok(after.edges.crossings < before.edges.crossings * 0.5,
    '交差 ' + after.edges.crossings + ' は改善前 ' + before.edges.crossings + ' の50%未満');
  // 辺間クリアランスは改善前より減っている
  assert.ok(after.edges.clearanceViolations < before.edges.clearanceViolations,
    after.edges.clearanceViolations + ' < ' + before.edges.clearanceViolations);
  // 外周へ逃がすだけにせず、辺長も改善前より短い
  assert.ok(after.edges.totalLength < before.edges.totalLength,
    '総辺長 ' + after.edges.totalLength + ' / 改善前 ' + before.edges.totalLength);
  assert.ok(after.edges.avgBends <= 3, '平均曲がり ' + after.edges.avgBends);
  assert.ok(after.edges.maxBends <= 15, '最大曲がり ' + after.edges.maxBends);
  // 全体fitが14%より大きい（主要ラベルが見える）
  const fit = Core.fitTransform(D.meta.canvas, 1236, 475, 14);
  assert.ok(fit.scale >= 0.2, '全体scale ' + fit.scale);
});

test('[placement] 接続に基づいて物質を動かし、孤立物質を反応網の通路から離す', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
  const routes = JSON.parse(fs.readFileSync(path.join(SRC, 'routes.json'), 'utf8'));
  const baseline = new Map(Met.sceneFromBaseline().compounds.map((c) => [c.id, c]));

  let moved = 0;
  D.compounds.forEach((c) => {
    const before = baseline.get(c.id);
    if (Math.hypot(c.x - before.x, c.y - before.y) > 40) moved++;
  });
  assert.ok(moved >= 300, '40px 以上動いた物質: ' + moved + ' / ' + D.compounds.length);

  // 反応ネットワークとして、ハブの隣に反応が置かれている
  assert.equal(layout.regions.length, 10);
  assert.deepEqual(layout.regions.map((r) => r.colorIndex).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const hubs = D.compounds.filter((c) => c.hub && c.incoming + c.outgoing > 0);
  hubs.forEach((c) => {
    const incident = D.reactions.filter((r) => r.substrates.includes(c.id) || r.products.includes(c.id));
    const nearestReaction = Math.min(...incident.map((r) => Math.hypot(r.x - (c.x + D.meta.nodeW / 2), r.y - (c.y + D.meta.nodeH / 2))));
    assert.ok(nearestReaction < 360, c.id + ' の最寄り反応 ' + nearestReaction.toFixed(0) + 'px');
  });
  // 反応と端点の距離（直線）は、旧・外周方式より短い
  let sum = 0;
  let edges = 0;
  D.reactions.forEach((r) => {
    r.edges.forEach((e) => {
      const c = D.compounds.find((x) => x.id === e.id);
      const d = Math.hypot(r.x - (c.x + D.meta.nodeW / 2), r.y - (c.y + D.meta.nodeH / 2));
      sum += d;
      edges++;
    });
  });
  assert.ok(sum / edges < 260, '反応-端点の平均距離 ' + (sum / edges).toFixed(1) + 'px');

  // 孤立物質の中心から最寄りの辺までの距離が、反応をもつ物質より大きい
  const routePoints = Object.keys(routes.edges).map((key) => routes.edges[key].points.map((p) => ({ x: p[0], y: p[1] })));
  const nearest = (c) => {
    let min = Infinity;
    const center = { x: c.x + D.meta.nodeW / 2, y: c.y + D.meta.nodeH / 2 };
    for (const points of routePoints) min = Math.min(min, G.distPointPolyline(center, points));
    return min;
  };
  const isolated = D.compounds.filter((c) => c.incoming + c.outgoing === 0);
  const connected = D.compounds.filter((c) => c.incoming + c.outgoing > 0);
  const mean = (list) => list.reduce((sum, c) => sum + nearest(c), 0) / list.length;
  const isolatedMean = mean(isolated);
  const connectedMean = mean(connected);
  assert.ok(isolatedMean > connectedMean * 1.15,
    '孤立 ' + isolatedMean.toFixed(1) + 'px / 接続 ' + connectedMean.toFixed(1) + 'px');
});

test('[invariant] 反応の事実・物質数・必須数・ビルダー経路は変えない', () => {
  assert.equal(D.meta.compoundCount, 427);
  assert.equal(D.meta.requiredCount, 294);
  assert.equal(D.meta.confirmedReactionCount, 86);
  assert.equal(D.meta.reactionCount, 86);
  assert.equal(D.reactions.filter((r) => r.cross).length, 55);

  const source = JSON.parse(fs.readFileSync(path.join(SRC, 'reactions.json'), 'utf8'));
  const confirmed = new Map(source.reactions.filter((r) => r.state === 'confirmed').map((r) => [r.id, r]));
  assert.equal(confirmed.size, 86);
  D.reactions.forEach((r) => {
    const raw = confirmed.get(r.id);
    assert.ok(raw, r.id + ' が正本にある');
    assert.deepEqual(r.substrates, raw.substrates, r.id + ' の基質');
    assert.deepEqual(r.products, raw.products, r.id + ' の生成物');
    assert.deepEqual(r.reagents, raw.reagents || [], r.id + ' の試薬');
    assert.equal(r.conditions, raw.conditions, r.id + ' の条件');
    assert.equal(r.type, raw.type, r.id + ' の種別');
    assert.equal(r.edges.length, raw.substrates.length + raw.products.length, r.id + ' の辺数');
  });

  // 必須物質の集合も変えない
  const required = A10.REQUIRED_CURRICULUM.filter((id, i, arr) => arr.indexOf(id) === i);
  const current = new Set(D.compounds.filter((c) => c.curriculum).map((c) => c.id));
  assert.equal(required.length, 294);
  assert.deepEqual(required.filter((id) => !current.has(id)), []);
});

test('[determinism] 同じ入力から同じ配置・経路を再生成できる', () => {
  const one = Opt.planLayout();
  const two = Opt.planLayout();
  assert.equal(one.layout.version, 3);
  assert.equal(one.layout.seed, 11011);
  assert.equal(Opt.renderLayout(one.layout), Opt.renderLayout(two.layout), 'layout が決定的');
  assert.equal(Opt.renderRoutes(one.routes), Opt.renderRoutes(two.routes), 'routes が決定的');

  // 生成物（layout.json / routes.json）が、同じ実装から完全一致で再生成できる
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'app11', 'optimize-layout.cjs'), '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600000
  });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
});

test('[core] 保存済み経路の切れ目と、390px幅での全体フィット', () => {
  const gapPath = Core.routePath([[0, 0], [100, 0]], [[50, 0]]);
  assert.equal((gapPath.match(/M/g) || []).length, 2, '切れ目で 2 本のサブパスになる');
  assert.ok(gapPath.includes('L47'), '切れ目の手前で止まる: ' + gapPath);
  assert.ok(gapPath.includes('M53'), '切れ目の後ろから再開する: ' + gapPath);
  const plain = Core.routePath([[0, 0], [10, 0]], []);
  assert.equal((plain.match(/M/g) || []).length, 1);
  const bridgePath = Core.routePath([[0, 0], [100, 0]], [], [[50, 0]]);
  assert.equal((bridgePath.match(/M/g) || []).length, 1, '橋は辺を分断しない');
  assert.ok(bridgePath.includes('Q'), '橋は小さな円弧で描く: ' + bridgePath);
  // 旧 SCALE_MIN 0.12 では 390px 幅で全体が入らなかった。0.05 へ下げてフィットを保証する。
  assert.equal(Core.SCALE_MIN, 0.05);
  const fit = Core.fitTransform(D.meta.canvas, 366, 354, 14);
  assert.ok(fit.scale >= Core.SCALE_MIN);
  assert.ok(D.meta.canvas.w * fit.scale <= 366 + 1, '横に収まる');
  assert.ok(D.meta.canvas.h * fit.scale <= 354 + 1, '縦に収まる');
});

test('[static] 選択した物質・反応の辺を強調する（読解補助・最小限）', () => {
  const js = read('app.js');
  const css = read('app.css');
  assert.ok(js.includes('Core.routePath'), '保存済み点列からパスを作る');
  assert.ok(js.includes('updateEdgeHighlight'), '選択時の辺強調');
  assert.ok(js.includes("path.getAttribute('data-compound')"), '物質の接続辺');
  assert.ok(js.includes("path.getAttribute('data-reaction')"), '反応の接続辺');
  assert.ok(css.includes('.rp-edge.is-active'), '強調スタイル');
  assert.ok(js.includes('showReactionStroke'), '反応選択の連続ストローク');
  assert.ok(js.includes('rp-edge-active'), '上層の連続ストローク');
  assert.ok(js.includes('previewFromEvent'), 'カード内の反応ホバー');
  assert.ok(js.includes('fitReactionEndpoints'), '反応の端点をfit');
  assert.ok(js.includes('data-action="fit-reaction"'), '端点表示ボタン');
  assert.ok(js.includes('buildRegionLegend'), '分野色の凡例');
  assert.ok(js.includes('activeRegion'), '明示的な分類選択の状態');
  assert.ok(js.includes('clearRegionSelection'), '分類選択の解除');
  assert.ok(js.includes('activeRegion) clearRegionSelection()'), 'パン等で分類選択を解除');
  assert.ok(js.includes('viewSize.w, viewSize.h, activeRegion)'), '現在位置に明示選択を渡す');
  assert.ok(css.includes('.rp-node__band'), 'ノードの分野色帯');
  assert.ok(css.includes('.rp-edges-active'), '上層レイヤ');
  assert.ok(js.includes('Core.routePath(e.points, e.gaps, e.bridges)'), '保存済み橋を使う');
});
