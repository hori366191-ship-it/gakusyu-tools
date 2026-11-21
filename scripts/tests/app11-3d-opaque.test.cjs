/**
 * app11/3d 球ビュー — 不透明パネル + 淡い境界の本番実装の検証
 * 実行: node --test scripts/tests/app11-3d-opaque.test.cjs
 *
 * ブラウザ・外部API・サーバ不要。次を検証する:
 *   1. 下部ツールバー / 選択パネルは不透明（#070b12・backdrop-filter なし）
 *   2. 正本 renderer.js の drawTerritory を実際にフェイク Canvas で呼び、
 *      分野境界が「グローなし・白寄りの青灰色の細線 + 近不透明の芯（2 回描き）」
 *      になり、塗りのパレットは従来どおりであること
 *   3. 選択中 / 分類フィルタ中の境界の濃さ（dimmed は芯だけ薄い / active は最も濃い）
 *   4. 選択カード(18)・マッチカード(8)・選択経路(9)・マーカー(16) のグローは残る
 *   5. design-lab の比較プレビューが本番の不透明化/解像度と二重適用しない
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PROD = path.join(ROOT, 'site', 'app11', '3d');
const CSS = path.join(PROD, 'app3d.css');
const RENDERER = path.join(PROD, 'renderer.js');
const LAB = path.join(ROOT, 'design-lab', 'app11-3d-opaque');

const read = (p) => fs.readFileSync(p, 'utf8');
const css = read(CSS).replace(/\r\n/g, '\n');
const rendererSrc = read(RENDERER);

/** CSS から1セレクタ分の宣言ブロックを取り出す（入れ子なし前提）。 */
function block(source, selector) {
  const start = source.indexOf(selector + ' {');
  assert.ok(start >= 0, `${selector} のブロックが見つからない`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

// ---------------- 1. CSS ----------------

test('ツールバーと選択パネルは不透明（#070b12・backdrop-filter なし）', () => {
  for (const sel of ['.r3d-toolbar', '.r3d-detail']) {
    const b = block(css, sel);
    const bg = (b.match(/background:\s*([^;]+);/) || [])[1];
    assert.ok(bg, `${sel} に background が無い`);
    assert.equal(bg.trim(), '#070b12', `${sel} の地色が不透明の等価値でない: ${bg}`);
    assert.match(b, /-webkit-backdrop-filter:\s*none;/, `${sel} に -webkit- 版が無い`);
    assert.match(b, /backdrop-filter:\s*none;/, `${sel} に backdrop-filter: none が無い`);
    assert.ok(!/backdrop-filter:\s*blur/i.test(b), `${sel} に blur が残っている`);
    assert.ok(!/background:\s*rgba?\(/.test(b), `${sel} に半透明地が残っている`);
  }
  // 選択パネルの影は従来どおり残す（不透明化で消さない）。
  assert.match(block(css, '.r3d-detail'), /box-shadow:/);
  // 3D の CSS 全体で backdrop-filter の blur を使わない。
  for (const file of fs.readdirSync(PROD)) {
    if (!file.endsWith('.css')) continue;
    const text = read(path.join(PROD, file));
    assert.equal(/backdrop-filter:\s*blur/i.test(text), false, `${file} に backdrop-filter: blur が残っている`);
  }
});

// ---------------- 2-4. 実際の drawTerritory ----------------

const R = require(RENDERER);

/** Canvas 2D の最小フェイク（stroke/fill の瞬間の状態を記録する）。 */
function makeFakeContext() {
  function FakeContext() {
    this.globalAlpha = 1;
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.lineCap = '';
    this.lineJoin = '';
    this.calls = [];
    this.blurWrites = [];
    this.strokes = [];
    this.fills = [];
    this._shadowColor = '';
    this._shadowBlur = 0;
  }
  for (const name of ['save', 'restore', 'beginPath', 'arc', 'clip', 'setLineDash',
    'moveTo', 'lineTo', 'closePath']) {
    FakeContext.prototype[name] = function () { this.calls.push(name); };
  }
  FakeContext.prototype.fill = function () {
    this.calls.push('fill');
    this.fills.push({ style: this.fillStyle, alpha: this.globalAlpha });
  };
  FakeContext.prototype.stroke = function () {
    this.calls.push('stroke');
    this.strokes.push({
      style: this.strokeStyle,
      width: this.lineWidth,
      alpha: this.globalAlpha,
      shadowBlur: this._shadowBlur
    });
  };
  Object.defineProperty(FakeContext.prototype, 'shadowColor', {
    configurable: true,
    get() { return this._shadowColor; },
    set(v) { this._shadowColor = String(v); }
  });
  Object.defineProperty(FakeContext.prototype, 'shadowBlur', {
    configurable: true,
    get() { return this._shadowBlur; },
    set(v) { this._shadowBlur = v; this.blurWrites.push(v); }
  });
  return new FakeContext();
}

const count = (list, name) => list.filter((x) => x === name).length;

/** 2 塗り・2 境界の最小フレーム（drawTerritory が実際に読む形）。 */
function territoryFrame(overrides) {
  return Object.assign({
    disc: { cx: 160, cy: 120, radius: 100 },
    activeRegion: null,
    dimmed: false,
    fills: [
      { regionId: 'hydrocarbon', points: [0, 0, 10, 0, 10, 10] },
      { regionId: 'aromatic', points: [0, 0, 6, 0, 6, 6] }
    ],
    borders: [
      { regionAId: 'hydrocarbon', regionBId: 'aromatic', points: [0, 0, 10, 10, 20, 20, 30, 30] },
      { regionAId: 'aromatic', regionBId: 'hydrocarbon', points: [0, 0, 4, 4] }
    ]
  }, overrides || {});
}

/** hex → 共有パレットと同じ 'rgb(r,g,b)' 表記。 */
function rgbOf(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

test('drawTerritory の実呼び出しで境界は 2 回描き（淡い縁→芯）になりグローは消える', () => {
  const ctx = makeFakeContext();
  const stats = R.drawTerritory(ctx, territoryFrame());

  assert.equal(stats.fills, 2);
  assert.equal(stats.borders, 2);
  assert.equal(count(ctx.calls, 'fill'), 2, '塗りが描かれていない');
  // 境界 2 本 × (外側の淡い縁 + 近不透明の芯) = 4 回の stroke。
  assert.equal(count(ctx.calls, 'stroke'), 4, '境界が 2 回描きになっていない');
  assert.equal(count(ctx.calls, 'arc'), 1);
  assert.equal(count(ctx.calls, 'clip'), 1);

  const rest = R.TERRITORY_STYLE.borderRest;
  for (let i = 0; i < ctx.strokes.length; i += 2) {
    const edge = ctx.strokes[i];
    const core = ctx.strokes[i + 1];
    assert.equal(edge.style, rest.color);
    assert.equal(edge.width, rest.edgeWidth);
    assert.equal(edge.alpha, rest.edgeAlpha);
    assert.equal(core.style, rest.color);
    assert.equal(core.width, rest.width, '芯が細い実線になっていない');
    assert.ok(core.alpha >= 0.8, `芯が近不透明でない: ${core.alpha}`);
    assert.ok(core.width <= 1.2, `芯が細くない: ${core.width}`);
    // 境界ではグローを使わない。
    assert.equal(edge.shadowBlur, 0, '外縁にグローが残っている');
    assert.equal(core.shadowBlur, 0, '芯にグローが残っている');
  }
  assert.equal(ctx.blurWrites.some((v) => v > 0), false,
    `境界で shadowBlur を立てている: ${ctx.blurWrites}`);
  // 色は「白寄り（各成分が高く、青が最も強い）」。
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rest.color);
  assert.ok(rgb, `色の形式が想定外: ${rest.color}`);
  const [r, g, b] = rgb.slice(1).map(Number);
  assert.ok(Math.min(r, g, b) >= 200, '白寄りでない');
  assert.ok(b >= g && g >= r, '青灰色の並びになっていない');
  // 描画後は後続の描画を汚さない（alpha を 1 に戻す）。
  assert.equal(ctx.globalAlpha, 1);
});

test('塗りは共有パレットのまま（境界の変更で塗りを変えない）', () => {
  const ctx = makeFakeContext();
  R.drawTerritory(ctx, territoryFrame());
  const palette = R.REGION_COLORS;
  assert.equal(ctx.fills[0].style, rgbOf(palette.hydrocarbon));
  assert.equal(ctx.fills[0].alpha, R.TERRITORY_STYLE.fillAlpha);
  assert.equal(ctx.fills[1].style, rgbOf(palette.aromatic));
});

test('選択中(dimmed)は縁を重ねず芯だけを薄くする', () => {
  const ctx = makeFakeContext();
  R.drawTerritory(ctx, territoryFrame({ dimmed: true }));
  const dimmed = R.TERRITORY_STYLE.borderDimmed;
  assert.equal(ctx.strokes.length, 2, 'dimmed は縁を重ねず芯だけのはず');
  for (const stroke of ctx.strokes) {
    assert.equal(stroke.style, dimmed.color);
    assert.equal(stroke.width, dimmed.width);
    assert.equal(stroke.alpha, dimmed.alpha);
    assert.ok(stroke.alpha < 0.4 && stroke.alpha > 0.2, `選択中の境界が薄すぎ/濃すぎ: ${stroke.alpha}`);
    assert.equal(stroke.shadowBlur, 0);
  }
  assert.ok(dimmed.alpha < R.TERRITORY_STYLE.borderRest.alpha, '選択中が通常時より薄くない');
  // 塗りも選択時は従来どおり薄くなる。
  assert.equal(ctx.fills[0].alpha, R.TERRITORY_STYLE.fillAlphaDimmed);
});

test('分類フィルタ中(active)は芯が最も濃く、外側の縁も残る', () => {
  const ctx = makeFakeContext();
  R.drawTerritory(ctx, territoryFrame({ activeRegion: 'hydrocarbon' }));
  const active = R.TERRITORY_STYLE.borderActive;
  assert.equal(ctx.strokes.length, 4);
  assert.equal(ctx.strokes[0].style, active.color);
  assert.equal(ctx.strokes[1].alpha, active.alpha);
  assert.equal(ctx.strokes[1].width, active.width);
  assert.ok(active.alpha > R.TERRITORY_STYLE.borderRest.alpha);
  assert.equal(ctx.fills[0].alpha, R.TERRITORY_STYLE.fillAlphaActive);
});

test('選択/マッチのグロー（選択カード18・マッチ8・選択経路9・マーカー16）は残っている', () => {
  // drawScene はテリトリー以外で従来どおり shadowBlur を使う。
  assert.match(rendererSrc, /ctx\.shadowBlur = node\.selected \? 18 : 8;/);
  assert.match(rendererSrc, /ctx\.shadowBlur = 9;/);
  assert.match(rendererSrc, /ctx\.shadowBlur = 16;/);
  // テリトリー側はグローの設定を持たない。
  assert.equal(/glowStyle/.test(rendererSrc), false, '境界に glowStyle が残っている');
  assert.equal(/90  *\*  *0\.3/.test(rendererSrc), false);
  const paint = R.territoryBorderPaint('hydrocarbon', 'aromatic', {});
  assert.equal('blur' in paint, false, '境界の paint に blur が残っている');
  assert.equal('glowStyle' in paint, false, '境界の paint に glowStyle が残っている');
});

// ---------------- 5. design-lab プレビューの二重適用防止 ----------------

test('比較プレビューは本番の不透明化・解像度を二重に適用しない', () => {
  // 本番ページは design-lab を参照しない。
  const page = read(path.join(PROD, 'index.html'));
  assert.equal(page.includes('design-lab'), false);
  if (!fs.existsSync(LAB)) return; // 実験フォルダが無くても本番は成立する
  const lab = read(path.join(LAB, 'index.html'));
  for (const banned of ['opaque.css', 'opaque-glow.js', 'opaque-resolution.js']) {
    assert.equal(lab.includes(banned), false, `プレビューが ${banned} を二重に読み込んでいる`);
  }
  // 本番の解像度モードはプレビュー側の devicePixelRatio 差し替えに依存しない。
  assert.equal(/Object\.defineProperty\(\s*window,\s*['"]devicePixelRatio/.test(lab), false,
    'プレビューが devicePixelRatio を差し替えている');
});
