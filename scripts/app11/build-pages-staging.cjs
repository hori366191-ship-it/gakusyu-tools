#!/usr/bin/env node
/*
 * Pages 配信物のステージング生成（app11 公開統合）
 *
 * 入力: リポジトリの site/（ローカル開発用の完全版）
 * 出力: _pages/（GitHub Pages にアップロードするもの）
 *
 * 変換（決定論的）:
 *   1. site/ を丸ごとコピーする（app1 の bundle.json など、他の公開資産はそのまま）
 *   2. 公開に不要な 2D 試作用ファイルを配信物から外す
 *      - app11/academic-data.js        … 2D 用の座標入り学術データ
 *      - app11/proposed-layout-data.js … 非公開の代替レイアウト案（通常表示は使わない）
 *      - app11/proposal-contract.js    … その代替レイアウトの検証モジュール
 *   3. site/app11/index.html の「アカデミック」を 3D 画面（./3d/）へのリンクへ変換し、
 *      外したファイルの script タグを消し、旧アカデミックのディープリンクを 3D へ引き継ぐ
 *   4. site/app11/3d/academic-facts.js（座標なしの事実データ）を元データから再生成する
 *
 * ローカルの site/ は変更しない。リポジトリ内の旧学術データ・代替レイアウト・
 * ローカル実験・既存テストはそのまま使える。公開配信だけをこのスクリプトの出力に置き換える。
 *
 * 安全方針（破壊的操作をしない）:
 *   - 出力先が「存在しない」または「空のディレクトリ」のときだけ生成する。
 *     既存の非空ディレクトリは上書きしない（中身を消さない）。
 *   - リポジトリ直下・その祖先・site/ とその中・.git は出力先として拒否する。
 *     シンボリックリンクの出力先・経路も拒否する。
 *   - 実際の組み立ては出力先の兄弟に作った一時ディレクトリ（mkdtemp）で行い、
 *     検証が通ってから rename で出力先へ移す。失敗時は自分が作った一時ディレクトリ
 *     だけを片付ける（パスと名前を検証してから削除）。
 *
 * 使い方:
 *   node scripts/app11/build-pages-staging.cjs [--out _pages]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const DEFAULT_OUT = path.join(ROOT, '_pages');

const facts = require('./build-3d-academic-facts.cjs');

// 公開配信に含めない 2D 試作用ファイル（ローカルの site/app11 には残す）
const EXCLUDED_FILES = [
  path.join('app11', 'academic-data.js'),
  path.join('app11', 'proposed-layout-data.js'),
  path.join('app11', 'proposal-contract.js')
];

const ACADEMIC_BUTTON = /^[ \t]*<button[^>]*\bid="rp-mode-academic"[^>]*>アカデミック<\/button>\r?\n/m;
const REMOVED_SCRIPTS = [
  /^[ \t]*<script src="\.\/academic-data\.js"><\/script>\r?\n/m,
  /^[ \t]*<script src="\.\/proposal-contract\.js"><\/script>\r?\n/m,
  /^[ \t]*<script src="\.\/proposed-layout-data\.js"><\/script>\r?\n/m
];

// 公開 index に残るローカル script（順序も固定）
const PUBLIC_SCRIPTS = [
  'data.js',
  'reaction-groups.js',
  'map-core.js',
  'structure-draw.js',
  'app.js'
];

const ACADEMIC_LINK = [
  '          <!-- アカデミック（通常＋大学レベル）は 3D 画面で表示する。2D の学術配置は公開配信に含めない。 -->',
  '          <a class="rp-mode__btn" href="./3d/" title="通常＋大学レベルを3Dで表示します"',
  '            style="text-decoration:none;display:inline-flex;align-items:center">アカデミック</a>'
].join('\n');

const DEEP_LINK_SHIM = [
  '<script>',
  '/* 旧アカデミックのディープリンク（?mode=academic）は、公開 3D 画面（通常＋大学レベル）へ引き継ぐ。 */',
  '(function () {',
  '  try {',
  '    if (/[?&]mode=academic(?:[=&]|$)/.test(window.location.search)) window.location.replace(\'./3d/\');',
  '  } catch (error) { /* noop */ }',
  '})();',
  '</script>'
].join('\n');

function fail(message) {
  throw new Error('[build-pages-staging] ' + message);
}

/* ---------------- 出力先の安全確認 ---------------- */

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function isSameOrInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isAncestorOf(maybeAncestor, target) {
  const rel = path.relative(path.resolve(maybeAncestor), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function assertNoSymlink(pathname, label) {
  const stat = lstatOrNull(pathname);
  if (stat && stat.isSymbolicLink()) fail(label + ' がシンボリックリンク: ' + pathname);
}

// 出力先の既存の祖先にシンボリックリンクが混ざっていないか（書き抜け防止）。
function assertNoSymlinkComponents(dir) {
  let current = path.resolve(dir);
  for (;;) {
    assertNoSymlink(current, 'パス');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function assertSafeOut(out) {
  const target = path.resolve(out);
  if (target === path.resolve(ROOT)) fail('リポジトリ直下を出力先にはできない');
  if (isAncestorOf(target, ROOT)) fail('リポジトリの祖先を出力先にはできない: ' + target);
  if (isSameOrInside(target, SITE)) fail('site/ とその中を出力先にはできない: ' + target);
  if (isSameOrInside(target, path.join(ROOT, '.git'))) fail('.git を出力先にはできない');

  assertNoSymlink(target, '出力先');
  const existing = lstatOrNull(target);
  if (existing) {
    if (!existing.isDirectory()) fail('出力先がディレクトリではない: ' + target);
    if (fs.readdirSync(target).length) {
      fail('出力先が空ではない（既存の中身は消さない）: ' + target);
    }
  }
  assertNoSymlinkComponents(path.dirname(target));
  return target;
}

// 自分が mkdtemp で作った一時ディレクトリだけを片付ける。
function removeOwnTemp(tempDir, parent) {
  const resolved = path.resolve(tempDir);
  if (path.dirname(resolved) !== path.resolve(parent)) return;
  if (path.basename(resolved).indexOf('.staging-') === -1) return;
  const stat = lstatOrNull(resolved);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return;
  fs.rmSync(resolved, { recursive: true, force: true });
}

/* ---------------- 変換 ---------------- */

// 自前の再帰コピー（決定的な順序・シンボリックリンクは辿らない）。
// Node の fs.cpSync はこの環境で落ちるため使わない。
function copyTree(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) fail('コピー元にシンボリックリンクがある: ' + source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    const entries = fs.readdirSync(source).sort();
    for (const name of entries) {
      copyTree(path.join(source, name), path.join(destination, name));
    }
    return;
  }
  if (!stat.isFile()) fail('コピーできない種類のファイル: ' + source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copySite(destination) {
  copyTree(SITE, destination);
}

function dropExcluded(out) {
  for (const rel of EXCLUDED_FILES) {
    const file = path.join(out, rel);
    if (!fs.existsSync(file)) fail('除外対象が見つからない: ' + rel);
    fs.unlinkSync(file);
  }
}

function convertIndex(out) {
  const file = path.join(out, 'app11', 'index.html');
  if (!fs.existsSync(file)) fail('app11/index.html がない');
  let html = fs.readFileSync(file, 'utf8');

  if (!ACADEMIC_BUTTON.test(html)) fail('app11/index.html のアカデミックボタンを見つけられない');
  html = html.replace(ACADEMIC_BUTTON, ACADEMIC_LINK + '\n');

  for (const pattern of REMOVED_SCRIPTS) {
    if (!pattern.test(html)) fail('app11/index.html の script タグを見つけられない: ' + pattern);
    html = html.replace(pattern, '');
  }

  // 旧アカデミックのディープリンク互換。head の早い位置で 3D へ送る。
  html = html.replace('</head>', DEEP_LINK_SHIM + '\n</head>');
  fs.writeFileSync(file, html);
}

// 公開配信には 2D の学術配置データを入れない。app.js の「読み込めない」注記だけを消す。
// （通常表示のコード・操作・見た目は変えない。ローカルの app.js は変更しない。）
const DISABLED_REASON = "academicDisabledReason = 'アカデミックデータを読み込めないため、通常表示だけを使えます。';";

function convertAppJs(out) {
  const file = path.join(out, 'app11', 'app.js');
  const js = fs.readFileSync(file, 'utf8');
  if (js.indexOf(DISABLED_REASON) === -1) fail('app11/app.js の学術データ未読込メッセージを見つけられない');
  const patched = js.replace(DISABLED_REASON, "academicDisabledReason = '';");
  if (patched === js) fail('app11/app.js の注記を消せない');
  fs.writeFileSync(file, patched);
}

function writeFacts(out) {
  const data = facts.build();
  fs.mkdirSync(path.join(out, 'app11', '3d'), { recursive: true });
  fs.writeFileSync(path.join(out, 'app11', '3d', 'academic-facts.js'), facts.render(data));
  return data;
}

/* ---------------- 生成物の検証 ---------------- */

function readStaged(out, rel) {
  return fs.readFileSync(path.join(out, rel), 'utf8');
}

function verify(out, data) {
  // 除外した 2D 試作用ファイルは配信物に存在しない（ローカルには残す）。
  for (const rel of EXCLUDED_FILES) {
    if (fs.existsSync(path.join(out, rel))) fail('配信物に ' + rel + ' が残っている');
    if (!fs.existsSync(path.join(SITE, rel))) fail('ローカルの ' + rel + ' を消してしまっている');
  }
  const index = readStaged(out, path.join('app11', 'index.html'));
  for (const name of ['academic-data.js', 'proposed-layout-data.js', 'proposal-contract.js']) {
    if (index.includes(name)) fail('公開 index.html が ' + name + ' を参照している');
  }
  if (index.includes('id="rp-mode-academic"')) fail('公開 index.html に旧アカデミックボタンの id が残っている');
  if (!index.includes('href="./3d/"')) fail('公開 index.html に 3D へのリンクがない');
  if (!index.includes('mode=academic')) fail('旧アカデミックのディープリンク互換がない');

  const scripts = [...index.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  if (JSON.stringify(scripts) !== JSON.stringify(PUBLIC_SCRIPTS)) {
    fail('公開 index.html の script 並びが想定外: ' + scripts.join(', '));
  }

  // 2D 学術データが無いことを「エラー」として見せない（公開の学術入口は 3D）。
  const appJs = readStaged(out, path.join('app11', 'app.js'));
  if (appJs.includes('アカデミックデータを読み込めないため')) {
    fail('公開 app.js に学術データ未読込の注記が残っている');
  }
  if (!appJs.includes('function initAcademicData')) fail('公開 app.js の通常表示コードが壊れている');
  // 代替レイアウトが無くても通常表示が壊れない（app.js は null ガードを持つ）。
  if (!appJs.includes('var P = window.RPMapLayoutProposal || null;')) {
    fail('公開 app.js の代替レイアウトの null ガードが失われている');
  }

  const threeD = readStaged(out, path.join('app11', '3d', 'index.html'));
  const threeDjs = readStaged(out, path.join('app11', '3d', 'sphere-app.js'));
  if (!threeD.includes('src="./academic-facts.js"')) fail('3D が academic-facts.js を読んでいない');
  if (/<script[^>]+src="[^"]*academic-data\.js"/.test(threeD)) {
    fail('3D が academic-data.js を script で参照している');
  }
  if (!threeD.includes('src="./sphere-app.js"')) fail('3D が球ビューの app を読んでいない');
  if (threeD.indexOf('./academic-facts.js') > threeD.indexOf('./sphere-app.js')) fail('3D の script 読み込み順が不正');
  if (!threeD.includes('href="../"')) fail('3D から 2D 通常画面への戻りリンクがない');
  if (threeD.includes('id="r3d-layer"')) fail('3D に層切替 UI が残っている');
  if (threeD.includes('academic-facts.js') && /\.\.\/\.\.\/site\//.test(threeD)) {
    fail('3D が設計ラボ前提の相対パスを参照している');
  }

  // 球ビューは通常＋大学を常時合成し、事実データが無ければ fail-closed。
  if (!threeDjs.includes("var LAYER = 'academic'")) fail('3D が通常＋大学の固定層になっていない');
  if (/state\.layer\s*=\s*'normal'/.test(threeDjs)) fail('3D の層が通常で初期化されている');
  if (!threeDjs.includes('大学レベルの追加反応データ（academic-facts.js）を読み込めませんでした。')) {
    fail('3D の学術データ未読込メッセージがない');
  }
  if (!threeDjs.includes('if (!academicData || !Array.isArray(academicData.reactions)')) {
    fail('3D が学術データ未読込時に fail-closed でない');
  }

  // 事実データ（座標なし）のパリティ
  const staged = require(path.join(out, 'app11', '3d', 'academic-facts.js'));
  if (staged.geometry !== false) fail('academic-facts.js に geometry フラグがない');
  if (staged.reactions.length !== facts.EXPECTED.academicReactions) fail('大学レベル反応数が一致しない');
  if (data.reactions.length !== staged.reactions.length) fail('生成した反応数と配信物が一致しない');
  for (const reaction of staged.reactions) {
    for (const key of ['x', 'y', 'label', 'edges']) {
      if (Object.prototype.hasOwnProperty.call(reaction, key)) {
        fail('academic-facts.js の ' + reaction.id + ' に ' + key + ' が残っている');
      }
    }
    if (!reaction.conditions && !reaction.note) fail('academic-facts.js に詳細本文の材料がない: ' + reaction.id);
    if (!reaction.equation) fail('academic-facts.js に反応式がない: ' + reaction.id);
  }

  // 3D の全ファイルが配信物にある
  for (const file of [
    'academic-facts.js', 'app3d.css', 'detail.js', 'detail.css', 'equation-fit.js',
    'index.html', 'interaction.js', 'projection.js', 'renderer.js', 'scene-model.js',
    'sphere-app.js', 'sphere-camera.js', 'sphere-dock.js', 'sphere-input.js',
    'sphere-layout.js', 'sphere-render.js', 'sphere-resolution.js', 'sphere-territory.js', 'sphere.css'
  ]) {
    if (!fs.existsSync(path.join(out, 'app11', '3d', file))) fail('3D のファイルがない: ' + file);
  }

  // 配信物の 3D は設計ラボ（design-lab）を参照しない。
  for (const file of fs.readdirSync(path.join(out, 'app11', '3d'))) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    const text = fs.readFileSync(path.join(out, 'app11', '3d', file), 'utf8');
    if (text.includes('design-lab')) fail('3D の ' + file + ' が design-lab を参照している');
  }

  // 427 物質 / 反応 314（通常 162 + 大学 152）/ グループ 308 のパリティ。
  const stagedData = require(path.join(out, 'app11', 'data.js'));
  const stagedFacts = require(path.join(out, 'app11', '3d', 'academic-facts.js'));
  const stagedGroups = require(path.join(out, 'app11', 'reaction-groups.js'));
  const stagedModel = require(path.join(out, 'app11', '3d', 'scene-model.js')).createModel(
    stagedData, stagedFacts, stagedGroups
  );
  const stagedStats = stagedModel.stats('academic');
  if (stagedStats.compounds !== 427) fail('配信物の物質数が 427 でない: ' + stagedStats.compounds);
  if (stagedStats.groups !== 308) fail('配信物の反応グループ数が 308 でない: ' + stagedStats.groups);
  if (stagedStats.academicGroups !== 152) fail('配信物の大学レベル反応数が 152 でない');
  if (stagedFacts.meta.normalCounts.reactionCount !== 162) fail('配信物の通常反応数が 162 でない');

  // 他の公開資産はそのまま
  for (const rel of [
    ['app10', 'index.html'],
    ['app10', 'app.js'],
    ['app1', 'bundle.json'],
    ['shared', 'organic-structure.js'],
    ['themes', 'theme.js'],
    ['index.html']
  ]) {
    if (!fs.existsSync(path.join(out, ...rel))) fail('公開資産が欠けている: ' + rel.join('/'));
  }
}

/* ---------------- 組み立て ---------------- */

function buildStaging(out) {
  const target = assertSafeOut(out || DEFAULT_OUT);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  assertNoSymlinkComponents(parent);

  // 作業用コンテナを作り、その中の新しいディレクトリへ組み立てる
  // （既存ディレクトリへの cpSync を避け、出力先へは最後に rename する）。
  const container = fs.mkdtempSync(path.join(parent, '.' + path.basename(target) + '.staging-'));
  const tempDir = path.join(container, 'out');
  let committed = false;
  try {
    copySite(tempDir);
    dropExcluded(tempDir);
    convertIndex(tempDir);
    convertAppJs(tempDir);
    const data = writeFacts(tempDir);
    verify(tempDir, data);

    // 空のディレクトリだけを外して rename（既存の中身は消さない）。
    if (lstatOrNull(target)) fs.rmdirSync(target);
    fs.renameSync(tempDir, target);
    committed = true;
    return { out: target, reactions: data.reactions.length };
  } finally {
    if (committed) {
      // 作業用コンテナは空になっているので、それだけを外す。
      if (lstatOrNull(container)) fs.rmdirSync(container);
    } else {
      removeOwnTemp(container, parent);
    }
  }
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex === -1 ? DEFAULT_OUT : path.resolve(process.argv[outIndex + 1] || '');
  if (outIndex !== -1 && !process.argv[outIndex + 1]) fail('--out にパスが必要');
  const result = buildStaging(out);
  console.log('staged ' + path.relative(ROOT, result.out) + '（大学レベル反応 ' + result.reactions +
    ' 件、2D 学術・代替レイアウト関連は除外）');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = { buildStaging, assertSafeOut, ROOT, SITE, DEFAULT_OUT };
