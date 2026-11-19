/**
 * app10 有機化学ビルダー — 選択タイルのテーマ別コントラスト回帰テスト
 *
 * 実行: node --test scripts/tests/app10-theme-contrast.test.cjs
 *
 * 外部API・ブラウザ・CDNには接続しない。tokens/*.css と app.css / themes/*.css を
 * 読み、実際のパレット値から選択中タイル（.oc-pick[aria-pressed="true"]）と
 * その子要素（.oc-fam__name / .oc-shape__none / .oc-pick__sub 82%）の
 * コントラスト比 4.5:1 以上を検証する。selected:hover も対象。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'site', 'app10');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function hexOf(css, name) {
  const m = new RegExp('--' + name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + ':\\s*(#[0-9a-fA-F]{6})\\b').exec(css);
  assert.ok(m, 'トークンが見つかりません: ' + name);
  return m[1].toLowerCase();
}

function rgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// CSS の opacity は背景との合成後の色で評価する（sRGB 空間）。
function composite(fg, bg, alpha) {
  const f = rgb(fg);
  const b = rgb(bg);
  const out = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function assertContrast(fg, bg, label, minimum) {
  const ratio = contrast(fg, bg);
  assert.ok(
    ratio >= (minimum || 4.5),
    label + ': ' + fg + ' on ' + bg + ' = ' + ratio.toFixed(2) + ':1（4.5:1 未満）'
  );
}

function ruleBody(css, selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, 'セレクタが見つかりません: ' + selector);
  const open = start + selector.length;
  const end = css.indexOf('}', open);
  assert.ok(end > open, 'ルール本体を閉じられません: ' + selector);
  return css.slice(open, end);
}

const appCss = fs.readFileSync(path.join(APP, 'app.css'), 'utf8');
const forestTheme = read('site/themes/forest.css');
const forestTokens = read('site/tokens/forest.css');
const popTheme = read('site/themes/pop.css');
const popTokens = read('site/tokens/pop.css');

const std = {
  panel: hexOf(appCss, 'oc-panel'),
  ink: hexOf(appCss, 'oc-ink'),
  muted: hexOf(appCss, 'oc-muted'),
  accentBg: hexOf(appCss, 'oc-accent-bg'),
  accentInk: hexOf(appCss, 'oc-accent-ink'),
  svgInk: hexOf(appCss, 'oc-svg-ink')
};

const forest = {
  ink: hexOf(forestTokens, 'color-forest-ink'),
  mint: hexOf(forestTokens, 'color-mint-veil'),
  sage: hexOf(forestTokens, 'color-sage-mist'),
  cream: hexOf(forestTokens, 'color-cream-paper'),
  charcoal: hexOf(forestTokens, 'color-charcoal')
};

const pop = {
  sky: hexOf(popTokens, 'color-sky-crayon'),
  ink: hexOf(popTokens, 'color-charcoal-ink'),
  cream: hexOf(popTokens, 'color-cream-paper'),
  white: hexOf(popTokens, 'color-frost-white')
};

test('[contrast] 標準テーマ: 選択タイルと子要素・selected:hover が 4.5:1 以上', () => {
  // 選択地は accent-bg、文字は accent-ink。
  assertContrast(std.accentInk, std.accentBg, 'selected text');
  // .oc-fam__name / .oc-ring-frag__name / .oc-shape__none は選択中 accent-ink。
  assertContrast(std.accentInk, std.accentBg, 'selected .oc-fam__name');
  assertContrast(std.accentInk, std.accentBg, 'selected .oc-shape__none');
  // .oc-pick__sub は color:inherit + opacity .82。
  assertContrast(composite(std.accentInk, std.accentBg, 0.82), std.accentBg, 'selected .oc-pick__sub (82%)');
  // selected:hover は --oc-panel 地（.oc-pick:hover が背景を上書き）。
  assertContrast(std.accentInk, std.panel, 'selected:hover .oc-fam__name');
  assertContrast(composite(std.accentInk, std.panel, 0.82), std.panel, 'selected:hover .oc-pick__sub (82%)');
  // 図（SVG）も選択地で読める。
  assertContrast(std.svgInk, std.accentBg, 'selected diagram');
  assertContrast(std.svgInk, std.panel, 'selected:hover diagram');

  assert.match(appCss, /\.oc-pick\[aria-pressed="true"\] \.oc-fam__name[\s\S]{0,200}color: var\(--oc-accent-ink\)/);
  assert.match(appCss, /\.oc-pick\[aria-pressed="true"\] \.oc-shape__none/);
});

test('[contrast] ポップテーマ: sky-crayon 選択地の子要素が 4.5:1 以上', () => {
  assertContrast(pop.ink, pop.sky, 'selected text');
  // 選択中は base の accent-ink（= charcoal-ink）へ寄せる。
  assertContrast(pop.ink, pop.sky, 'selected .oc-fam__name');
  assertContrast(pop.ink, pop.sky, 'selected .oc-shape__none');
  // 82% の sub は #222 へ濃くして 4.5:1 を確保。
  assertContrast(composite('#222222', pop.sky, 0.82), pop.sky, 'selected .oc-pick__sub (82%)');
  // selected:hover は cream-paper 地（pop の hover 背景）。
  assertContrast(pop.ink, pop.cream, 'selected:hover .oc-fam__name');
  assertContrast(composite('#222222', pop.cream, 0.82), pop.cream, 'selected:hover .oc-pick__sub (82%)');
  // 図（SVG）も選択地と hover 地で読める。
  assertContrast(pop.ink, pop.sky, 'selected diagram');
  assertContrast(pop.ink, pop.cream, 'selected:hover diagram');

  const selectedRule = ruleBody(popTheme, 'html[data-theme="pop"] .oc-pick[aria-pressed="true"]');
  assert.match(selectedRule, /background:\s*var\(--color-sky-crayon\)/);
  assert.match(selectedRule, /border-color:\s*var\(--color-charcoal-ink\)/);
  assert.match(popTheme, /html\[data-theme="pop"\] \.oc-pick\[aria-pressed="true"\] \.oc-pick__sub\s*\{\s*color:\s*#222;/);
});

test('[contrast] フォレストテーマ: 明るい mint 選択地 + forest ink が 4.5:1 以上', () => {
  // 選択地は mint-veil（forest-ink 背景ではない）。
  const selectedRule = ruleBody(forestTheme, 'html[data-theme="forest"] .oc-pick[aria-pressed="true"]');
  assert.match(selectedRule, /background:\s*var\(--color-mint-veil\)/);
  assert.doesNotMatch(selectedRule, /background:\s*var\(--color-forest-ink\)/);
  assert.match(selectedRule, /color:\s*var\(--color-forest-ink\)/);
  assert.match(selectedRule, /border-color:\s*var\(--color-forest-ink\)/);

  assertContrast(forest.ink, forest.mint, 'selected text');
  assertContrast(forest.ink, forest.mint, 'selected .oc-fam__name');
  assertContrast(forest.ink, forest.mint, 'selected .oc-shape__none');
  assertContrast(composite(forest.ink, forest.mint, 0.82), forest.mint, 'selected .oc-pick__sub (82%)');
  // selected:hover は mint を維持（sage に落とさない）。
  const selectedHover = ruleBody(forestTheme, 'html[data-theme="forest"] .oc-pick[aria-pressed="true"]:hover:not(:disabled)');
  assert.match(selectedHover, /background:\s*var\(--color-mint-veil\)/);
  assert.match(selectedHover, /color:\s*var\(--color-forest-ink\)/);
  assertContrast(forest.ink, forest.mint, 'selected:hover .oc-fam__name');
  assertContrast(composite(forest.ink, forest.mint, 0.82), forest.mint, 'selected:hover .oc-pick__sub (82%)');
  // forest-ink 背景だと図（--oc-svg-ink）が溶けるため、mint 地で読めることを確認。
  assertContrast(forest.ink, forest.mint, 'selected diagram');
  assertContrast(forest.ink, forest.mint, 'selected:hover diagram');

  // 通常 hover は sage のまま（テーマの見た目を維持）。
  const hoverRule = ruleBody(forestTheme, 'html[data-theme="forest"] .oc-pick:hover:not(:disabled)');
  assert.match(hoverRule, /background:\s*var\(--color-sage-mist\)/);

  // 選択の手掛かり（濃い枠 + 太字）が hover と別に残る。
  assert.match(forestTheme, /html\[data-theme="forest"\] \.oc-pick\[aria-pressed="true"\]:hover:not\(:disabled\)[\s\S]{0,220}border-color:\s*var\(--color-forest-ink\)/);
  assert.match(appCss, /\.oc-pick\[aria-pressed="true"\]\s*\{[^}]*font-weight:\s*800/);
});

test('[static] app.css は site と design-lab で byte 一致', () => {
  const production = fs.readFileSync(path.join(APP, 'app.css'));
  const lab = fs.readFileSync(path.join(ROOT, 'design-lab', 'app10-next', 'app.css'));
  assert.equal(production.equals(lab), true, 'app.css が site/app10 と design-lab/app10-next で byte 不一致');
});
