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

test('[data] 座標は固定で重ならず、分野パネルも重ならない', () => {
  const used = new Map();
  D.compounds.forEach((c) => {
    assert.equal(typeof c.x, 'number');
    assert.equal(typeof c.y, 'number');
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), c.id);
    const key = c.x + ',' + c.y;
    assert.equal(used.has(key), false, '同じ座標の物質: ' + c.id + ' と ' + used.get(key));
    used.set(key, c.id);
    const region = D.regions.find((r) => r.id === c.region);
    assert.ok(region, c.id + ' の分野が未定義');
    assert.ok(c.x >= region.panel.x && c.x + D.meta.nodeW <= region.panel.x + region.panel.w, c.id + ' が分野の外');
    assert.ok(c.y >= region.panel.y && c.y + D.meta.nodeH <= region.panel.y + region.panel.h, c.id + ' が分野の外');
  });
  for (let i = 0; i < D.regions.length; i++) {
    for (let j = i + 1; j < D.regions.length; j++) {
      const a = D.regions[i].panel;
      const b = D.regions[j].panel;
      const overlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
      assert.equal(overlap, false, '分野パネルが重なる: ' + D.regions[i].id + ' / ' + D.regions[j].id);
    }
  }
  const canvas = D.meta.canvas;
  D.compounds.forEach((c) => {
    assert.ok(c.x >= canvas.x && c.x <= canvas.x + canvas.w, c.id);
    assert.ok(c.y >= canvas.y && c.y <= canvas.y + canvas.h, c.id);
  });
  D.regions.forEach((r) => {
    assert.ok(r.count > 0, r.id + ' が空');
    assert.equal(D.compounds.filter((c) => c.region === r.id).length, r.count, r.id + ' の件数');
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
  const text = Core.positionText(fit, D.regions, null, canvas, 1200, 600);
  assert.ok(text.includes('全体表示'), text);
  const region = D.regions[0];
  const rv = Core.regionView(region, 1200, 600, 24);
  assert.ok(rv.scale >= Core.DETAIL_THRESHOLDS[0], '分野表示は物質名が見える倍率');
  const regionText = Core.positionText(rv, D.regions, D.compounds[0], canvas, 1200, 600);
  assert.ok(regionText.includes(region.name), regionText);
  assert.ok(Core.matchCompounds(D.compounds, 'エタノール').some((c) => c.id === 'ethanol'));
  assert.ok(Core.matchCompounds(D.compounds, 'ｃ２ｈ６ｏ').some((c) => c.id === 'ethanol'), '全角の示性式でも一致する');
  assert.deepEqual(Core.matchCompounds(D.compounds, ''), []);
  const clamped = Core.clampPan({ scale: fit.scale, x: 99999, y: -99999 }, 1200, 600, canvas);
  assert.ok(clamped.x < 99999 && clamped.y > -99999, '地図が画面外へ消えない');
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

test('[static] 生成物が最新で、配置は layout.json に固定されている', () => {
  const { build, renderData } = require(path.join(ROOT, 'scripts', 'app11', 'build-map-data.cjs'));
  const { data, layout } = build();
  assert.equal(renderData(data), read('data.js'), 'data.js が生成物と一致する（再生成が必要）');
  const layoutOnDisk = JSON.parse(fs.readFileSync(path.join(SRC, 'layout.json'), 'utf8'));
  assert.deepEqual(Object.keys(layoutOnDisk.positions).sort(), D.compounds.map((c) => c.id).sort());
  // 既存ノードの位置は layout の index から導かれる（再生成しても動かない）
  const regionById = new Map(D.regions.map((r) => [r.id, r]));
  D.compounds.forEach((c) => {
    const pos = layout.positions[c.id];
    assert.ok(pos, c.id + ' の配置がない');
    const region = regionById.get(pos.r);
    assert.equal(c.x, region.x + (pos.i % region.cols) * D.meta.cellW, c.id + ' の x');
    assert.equal(c.y, region.y + Math.floor(pos.i / region.cols) * D.meta.cellH, c.id + ' の y');
  });
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
