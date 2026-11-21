/**
 * app11 公開統合（2D 通常画面 + 3D アカデミック）のオフラインテスト
 *
 * 実行: node --test scripts/tests/app11-3d-public.test.cjs
 *
 * 対象:
 *   - scripts/app11/build-pages-staging.cjs（Pages 配信物の組み立て）
 *   - scripts/app11/build-3d-academic-facts.cjs（座標なし事実データ）
 *   - site/app11/3d/（公開 3D 画面）
 *   - site/app11/index.html（ローカル用。ステージングで公開用に変換される）
 *
 * ブラウザ・ネットワークは使わない。ステージングは一時ディレクトリへ生成する。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const APP = path.join(SITE, 'app11');
const THREE_D = path.join(APP, '3d');
const staging = require(path.join(ROOT, 'scripts', 'app11', 'build-pages-staging.cjs'));
const facts = require(path.join(ROOT, 'scripts', 'app11', 'build-3d-academic-facts.cjs'));

const D = require(path.join(APP, 'data.js'));
const G = require(path.join(APP, 'reaction-groups.js'));

let staged = null;
let outDir = null;

function buildOnce() {
  if (staged) return staged;
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app11-pages-'));
  staged = staging.buildStaging(path.join(outDir, 'pages'));
  return staged;
}

test.after(() => {
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

test('[facts] 座標なし・152 反応・詳細/索引の材料が揃う', () => {
  const F = require(path.join(THREE_D, 'academic-facts.js'));
  assert.equal(F.geometry, false);
  assert.equal(F.reactions.length, 152);
  assert.equal(F.meta.normalCounts.compoundCount, 427);
  assert.equal(F.meta.normalCounts.reactionCount, 162);
  assert.equal(F.meta.academicReactionCount, 152);
  assert.equal(F.meta.evidenceCount['general-rule-application'], 150);
  assert.equal(F.meta.evidenceCount['source-illustrated-transformation'], 2);
  assert.equal(F.meta.stepCount.direct, 90);
  assert.equal(F.meta.stepCount['multi-step'], 62);
  for (const reaction of F.reactions) {
    assert.equal(reaction.academic, true, reaction.id);
    for (const key of ['x', 'y', 'label', 'edges']) {
      assert.equal(Object.prototype.hasOwnProperty.call(reaction, key), false, reaction.id + ' の ' + key);
    }
    // detail.js / 索引が使う事実
    assert.ok(Array.isArray(reaction.substrates) && reaction.substrates.length, reaction.id);
    assert.ok(Array.isArray(reaction.products), reaction.id);
    assert.equal(typeof reaction.conditions, 'string', reaction.id);
    assert.ok(Array.isArray(reaction.sources) && reaction.sources.length, reaction.id);
    assert.ok(reaction.equation && Array.isArray(reaction.equation.left), reaction.id);
    assert.ok(Object.prototype.hasOwnProperty.call(F.types, reaction.type) || reaction.type, reaction.id);
  }
  // 逆向きは別 ID（データの向きを勝手に統合しない）
  const ids = new Set(F.reactions.map((r) => r.id));
  assert.ok(ids.has('academic-acid-chloride-adipic-acid-adipoyl-chloride'));
  assert.ok(ids.has('academic-acid-chloride-adipoyl-chloride-adipic-acid'));
});

test('[parity] 427 物質 / 通常 162 + 大学 152 / 合成 308 グループ', () => {
  const S = require(path.join(THREE_D, 'scene-model.js'));
  const F = require(path.join(THREE_D, 'academic-facts.js'));
  const model = S.createModel(D, F, G);
  const combined = model.stats('academic');
  assert.equal(combined.compounds, 427);
  assert.equal(combined.groups, 308);
  assert.equal(combined.academicGroups, 152);
  assert.equal(combined.mixedGroups, 0);
  assert.equal(F.meta.normalCounts.reactionCount + F.meta.academicReactionCount, 314);
  assert.equal(model.stats('normal').groups, 156);
  assert.equal(model.normalGroups.length + model.academicGroups.filter((g) => !g.hasNormal).length, 308);
});

test('[local] ローカルの 2D は従来どおり（学術データと旧ボタンが残る）', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="./academic-data.js"></script>'));
  assert.ok(html.includes('id="rp-mode-academic"'));
  assert.ok(fs.existsSync(path.join(APP, 'academic-data.js')), 'ローカル実験用の学術データは残す');
  // ローカルの学術モード（?mode=academic）の受け口は変更しない
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  assert.ok(js.includes('function readModeParam'));
  assert.ok(js.includes("if (academicEnabled && readModeParam("));
});

test('[staging] 公開 2D は通常表示のみ。アカデミックは 3D リンクへ変換される', () => {
  buildOnce();
  const pages = path.join(outDir, 'pages');
  const html = fs.readFileSync(path.join(pages, 'app11', 'index.html'), 'utf8');

  assert.equal(fs.existsSync(path.join(pages, 'app11', 'academic-data.js')), false);
  assert.equal(html.includes('academic-data.js'), false);
  assert.equal(html.includes('id="rp-mode-academic"'), false, '旧ボタン id を残さない');
  assert.ok(html.includes('href="./3d/"'), 'アカデミックは 3D へのリンク');
  assert.ok(html.includes('>アカデミック</a>'), 'ラベルは従来どおり');
  assert.ok(html.includes('id="rp-mode-normal"'));
  assert.ok(html.includes('aria-pressed="true"'), '通常ボタンは既定のまま');
  // 旧アカデミックのディープリンクは 3D へ引き継ぐ。
  assert.ok(/mode=academic/.test(html));
  assert.ok(html.includes("window.location.replace('./3d/')"));

  // 通常表示に必要な資産だけを読む（順序も維持）。
  // 非公開の代替レイアウト（proposal-contract.js / proposed-layout-data.js）は配信しない。
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'data.js',
    'reaction-groups.js',
    'map-core.js',
    'structure-draw.js',
    'app.js'
  ]);
  for (const name of ['proposal-contract.js', 'proposed-layout-data.js']) {
    assert.equal(html.includes(name), false, name + ' を参照しない');
    assert.equal(fs.existsSync(path.join(pages, 'app11', name)), false, name + ' を配信しない');
    assert.ok(fs.existsSync(path.join(APP, name)), name + ' はリポジトリに残す');
  }
  assert.ok(html.includes('../themes/theme.js'));
  assert.ok(html.includes('../credits.html'));

  // 学術データが無いことをエラー表示にしない（公開の学術入口は 3D）。
  const appJs = fs.readFileSync(path.join(pages, 'app11', 'app.js'), 'utf8');
  assert.equal(appJs.includes('アカデミックデータを読み込めないため'), false);
  assert.ok(appJs.includes('function initAcademicData'));
  // ローカルの app.js は変更しない（注記もそのまま）。
  assert.ok(
    fs.readFileSync(path.join(APP, 'app.js'), 'utf8').includes('アカデミックデータを読み込めないため')
  );
});

test('[staging] 他の公開資産と app1 bundle はそのまま含まれる', () => {
  buildOnce();
  const pages = path.join(outDir, 'pages');
  for (const rel of [
    ['index.html'],
    ['app10', 'index.html'],
    ['app10', 'app.js'],
    ['app11', 'coverage-ids.js'],
    ['app1', 'bundle.json'],
    ['shared', 'organic-structure.js'],
    ['themes', 'theme.js'],
    ['app11', 'reaction-groups.js']
  ]) {
    assert.ok(fs.existsSync(path.join(pages, ...rel)), rel.join('/'));
  }
});

test('[staging] 公開 3D は球ビューで常時合成、層切替 UI も design-lab 参照もない', () => {
  buildOnce();
  const pages = path.join(outDir, 'pages');
  const html = fs.readFileSync(path.join(pages, 'app11', '3d', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(pages, 'app11', '3d', 'sphere-app.js'), 'utf8');

  assert.ok(html.includes('src="./academic-facts.js"'));
  assert.equal(/<script[^>]+src="[^"]*academic-data\.js"/.test(html), false);
  assert.equal(html.includes('id="r3d-layer"'), false, '層切替の要素を持たない');
  assert.ok(html.includes('id="r3d-back"') && html.includes('href="../"'), '2D 通常画面への戻り');
  assert.ok(html.includes('2Dの全体マップ'));
  assert.equal(html.includes('design-lab'), false, '公開ページが設計ラボを参照している');
  assert.equal(html.includes('noindex'), false, '公開ページに noindex が残っている');

  assert.ok(js.includes("var LAYER = 'academic'"));
  assert.equal(/state\.layer\s*=\s*'normal'/.test(js), false);
  // 事実データが無ければ通常のみへ落とさず、フォールバックで止める（fail-closed）
  assert.ok(js.includes('大学レベルの追加反応データ（academic-facts.js）を読み込めませんでした。'));
  assert.ok(js.includes("if (!academicData || !Array.isArray(academicData.reactions)"));
});

test('[staging] 3D の全ファイルが配信物にあり、詳細の builder リンク先が正しい', () => {
  buildOnce();
  const pages = path.join(outDir, 'pages');
  for (const file of [
    'academic-facts.js', 'app3d.css', 'detail.js', 'detail.css', 'equation-fit.js',
    'index.html', 'interaction.js', 'projection.js', 'renderer.js', 'scene-model.js',
    'sphere-app.js', 'sphere-camera.js', 'sphere-dock.js', 'sphere-input.js',
    'sphere-layout.js', 'sphere-render.js', 'sphere-territory.js', 'sphere.css'
  ]) {
    assert.ok(fs.existsSync(path.join(pages, 'app11', '3d', file)), file);
  }
  // 旧 3D エンジンの app.js / layout3d.js は配信しない（scripts/legacy に保存）。
  for (const file of ['app.js', 'layout3d.js']) {
    assert.equal(fs.existsSync(path.join(pages, 'app11', '3d', file)), false, file);
  }
  const detail = fs.readFileSync(path.join(pages, 'app11', '3d', 'detail.js'), 'utf8');
  // site/app11/3d/ から site/app10/ へは 2 階層上。
  assert.ok(detail.includes("var BUILDER_SAFE_PREFIX = '../../app10/'"));
  // 旧パス（design-lab 前提の 3 階層）が残っていない
  assert.equal(detail.includes("'../../site/app10/'"), false);
  // 公開 3D の HTML/JS/CSS は design-lab を参照しない。
  for (const file of fs.readdirSync(path.join(pages, 'app11', '3d'))) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(pages, 'app11', '3d', file), 'utf8');
    assert.equal(text.includes('design-lab'), false, file + ' が design-lab を参照している');
  }
});

test('[determinism] ステージングは同じ入力から同じ成果物になる', () => {
  buildOnce();
  const first = path.join(outDir, 'pages');
  const second = path.join(outDir, 'pages-2');
  staging.buildStaging(second);
  for (const rel of [
    ['app11', 'index.html'],
    ['app11', '3d', 'index.html'],
    ['app11', '3d', 'sphere-app.js'],
    ['app11', '3d', 'academic-facts.js']
  ]) {
    assert.equal(
      fs.readFileSync(path.join(first, ...rel), 'utf8'),
      fs.readFileSync(path.join(second, ...rel), 'utf8'),
      rel.join('/')
    );
  }
});

test('[facts-check] コミット済み academic-facts.js は生成物と一致する', () => {
  const data = facts.build();
  assert.equal(fs.readFileSync(path.join(THREE_D, 'academic-facts.js'), 'utf8'), facts.render(data));
});

test('[workflow] Pages はステージングを _pages として配信し、site を直接配信しない', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(yml.includes('node scripts/app11/build-pages-staging.cjs --out _pages'));
  assert.ok(/path: _pages/.test(yml));
  assert.equal(/path: site\s*$/m.test(yml), false);
  // Node 22（tests.yml と同じ）で実行する。
  assert.ok(yml.includes("node-version: '22'"));
  // app1 の bundle 生成がステージングより前（順序維持）
  assert.ok(yml.indexOf('Build app1 bundle from MD') < yml.indexOf('Build Pages staging'));
  // ステージング生成スクリプトの変更でも Pages を再ビルドする。
  assert.ok(yml.includes("- 'scripts/app11/**'"));
});

/* ------------------------------------------------------------------
 * 出力先の安全（破壊的な上書きをしない）
 * ------------------------------------------------------------------ */

test('[safety] リポジトリ直下・祖先・site/・その中・.git を拒否する', () => {
  assert.throws(() => staging.buildStaging(ROOT), /リポジトリ直下/);
  assert.throws(() => staging.buildStaging(path.dirname(ROOT)), /祖先/);
  assert.throws(() => staging.buildStaging(SITE), /site\//);
  assert.throws(() => staging.buildStaging(path.join(SITE, 'app11', 'staging-safety')), /site\//);
  assert.throws(() => staging.buildStaging(path.join(ROOT, '.git', 'staging-safety')), /\.git/);
});

test('[safety] 既存の非空ディレクトリは消さずに拒否する', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app11-nonempty-'));
  const keep = path.join(dir, 'keep.txt');
  fs.writeFileSync(keep, 'parent data\n');
  try {
    assert.throws(() => staging.buildStaging(dir), /空ではない/);
    assert.ok(fs.existsSync(keep), '既存ファイルを消していない');
    assert.equal(fs.readFileSync(keep, 'utf8'), 'parent data\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('[safety] 空の既存ディレクトリには生成できる（rename で置き換え）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app11-empty-'));
  try {
    const result = staging.buildStaging(dir);
    assert.equal(result.out, path.resolve(dir));
    assert.ok(fs.existsSync(path.join(dir, 'app11', '3d', 'academic-facts.js')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('[safety] シンボリックリンクの出力先は拒否する（作成できる環境のみ）', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'app11-symlink-'));
  const real = path.join(base, 'real');
  const link = path.join(base, 'link');
  fs.mkdirSync(real);
  try {
    fs.symlinkSync(real, link, 'junction');
  } catch (error) {
    fs.rmSync(base, { recursive: true, force: true });
    t.skip('シンボリックリンクを作成できない環境');
    return;
  }
  try {
    assert.throws(() => staging.buildStaging(link), /シンボリックリンク/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
