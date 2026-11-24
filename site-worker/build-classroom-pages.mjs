#!/usr/bin/env node
/**
 * 教室タブレット用 Pages（Functions advanced mode）配布物を作る。
 *
 * 目的:
 *  - 正本は `site-worker/*.mjs`（classroom-worker / gateway / login / sessions）。
 *    ソースをリポジトリに複製せず、ビルド時だけ wrangler の esbuild で 1 ファイルに束ねる。
 *  - 出力は `site-worker/.pages-classroom/` 配下（git 管理外）。
 *
 * 出力:
 *  - .pages-classroom/dist/_worker.js   … 単一バンドル。ページ静的資産なし（全パスを Worker が処理）
 *  - .pages-classroom/wrangler.toml     … Pages 用設定。
 *      production の vars（CLASSROOM_ORIGIN）と D1 binding（CLASSROOM_DB）を明示する。
 *      `wrangler pages deploy` はこの設定を正本としてプロジェクト設定を置き換えるため、
 *      dashboard 側の同名 binding / var は残らない（実測）。preview セクションは空のまま。
 *      **secrets はこのファイルに書かない**（dashboard の暗号化 secret・production のみ）。
 *
 * D1 UUID の解決（値はログ・エラー・コミットへ出さない）:
 *   1. 環境変数 CLASSROOM_D1_DATABASE_ID
 *   2. site-worker 直下の git 管理外 TOML（wrangler.classroom-maintenance.toml /
 *      wrangler.classroom.toml）の database_id
 *   プレースホルダー・UUID 形式不正・複数・不一致は拒否する。
 *
 * なぜ isolated cwd か:
 *  - Wrangler 4.167 は `wrangler pages deploy --config X` を明示的に拒否する。
 *    実名 `wrangler.toml` と `dist` を 1 つのディレクトリに置き、そこを cwd にして deploy する。
 *
 * 使い方（リポジトリ直下）:
 *   node site-worker/build-classroom-pages.mjs           # ビルド + オフライン検証
 *   node site-worker/build-classroom-pages.mjs --no-verify
 *
 * その後（デプロイはこのスクリプトでは行わない）:
 *   cd site-worker\.pages-classroom
 *   npx wrangler pages deploy dist --project-name gakusyu-classroom --branch master
 *
 * wrangler の解決順:
 *   1. 環境変数 WRANGLER_JS（wrangler の bin/wrangler.js への絶対パス）
 *   2. site-worker から上方探索した node_modules/wrangler/bin/wrangler.js
 *   3. `npx wrangler`（ネットワーク取得の可能性あり）
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STAGING = path.join(ROOT, '.pages-classroom');
const BUILD = path.join(STAGING, '.bundle');
const DIST = path.join(STAGING, 'dist');
const PROJECT_NAME = 'gakusyu-classroom';
const COMPATIBILITY_DATE = '2024-08-01';
const CLASSROOM_ORIGIN = 'https://classroom.hori-shota.com';
const D1_DATABASE_NAME = 'gakusyu-classroom';
/** 実 UUID を出さないためのローカル設定（git 管理外）の候補。 */
const D1_LOCAL_CONFIGS = ['wrangler.classroom-maintenance.toml', 'wrangler.classroom.toml'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pagesWranglerToml(d1DatabaseId) {
  return `# 自動生成: site-worker/build-classroom-pages.mjs（編集しない・コミットしない）
#
# wrangler pages deploy はこの設定を正本としてプロジェクトの deployment_configs を書き換える。
# そのため production の vars / D1 binding はここで明示する（dashboard 側の同名設定は置き換わる）。
# secrets はここに書けない（dashboard の暗号化 secret のみ・production だけ）。
# preview 用の env/preview セクションは意図的に空のまま（preview へ binding を渡さない）。
name = "${PROJECT_NAME}"
pages_build_output_dir = "./dist"
compatibility_date = "${COMPATIBILITY_DATE}"

[env.production.vars]
CLASSROOM_ORIGIN = "${CLASSROOM_ORIGIN}"

[[env.production.d1_databases]]
binding = "CLASSROOM_DB"
database_name = "${D1_DATABASE_NAME}"
database_id = "${d1DatabaseId}"
`;
}

function log(message) {
  process.stdout.write(`[classroom-pages] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[classroom-pages] ERROR: ${message}\n`);
  process.exit(1);
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeD1Id(value) {
  const id = String(value || '').trim();
  if (!UUID_RE.test(id)) return null;
  // 全ゼロ（プレースホルダー）は実 ID ではない
  if (id === '00000000-0000-0000-0000-000000000000') return null;
  return id.toLowerCase();
}

/**
 * 実 D1 UUID を 1 つだけ解決する。**値をログ・エラーへ出さない**。
 * 優先順: env `CLASSROOM_D1_DATABASE_ID` → site-worker 直下の git 管理外 TOML の database_id。
 * 形式不正・プレースホルダー・複数・不一致は fail（値を表示しない）。
 */
function resolveD1DatabaseId() {
  const found = [];

  const fromEnv = process.env.CLASSROOM_D1_DATABASE_ID;
  if (fromEnv !== undefined && String(fromEnv).trim() !== '') {
    const id = normalizeD1Id(fromEnv);
    if (!id) fail('CLASSROOM_D1_DATABASE_ID が D1 の UUID 形式ではありません（値は表示しません）');
    // 明示指定が最優先（ローカル設定は読まない）
    return { id, source: 'env CLASSROOM_D1_DATABASE_ID' };
  }

  for (const name of D1_LOCAL_CONFIGS) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const values = [];
    for (const match of text.matchAll(/^[ \t]*database_id[ \t]*=[ \t]*"([^"]*)"[ \t]*$/gm)) {
      values.push(match[1]);
    }
    if (values.length === 0) continue;
    if (values.length > 1) {
      fail(`${name} に database_id が複数あります（1 つにしてください・値は表示しません）`);
    }
    const id = normalizeD1Id(values[0]);
    if (!id) {
      fail(`${name} の database_id が UUID 形式ではありません（プレースホルダー不可・値は表示しません）`);
    }
    found.push({ id, source: name });
  }

  if (found.length === 0) {
    fail(
      'D1 UUID が未解決です。CLASSROOM_D1_DATABASE_ID を設定するか、' +
        'site-worker/wrangler.classroom-maintenance.toml の database_id を記入してください',
    );
  }

  const unique = [...new Set(found.map((entry) => entry.id))];
  if (unique.length > 1) fail('D1 UUID の候補が複数あり食い違っています（値は表示しません）');
  return { id: unique[0], source: found[0].source };
}

function findWranglerJs() {
  const fromEnv = process.env.WRANGLER_JS;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  let dir = ROOT;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function wranglerCommand() {
  const js = findWranglerJs();
  if (js) return { cmd: process.execPath, baseArgs: [js], label: js };
  if (process.platform === 'win32') {
    // 引数は ASCII のみ（パスは cwd で渡す）。日本語パスをコマンドラインへ載せない。
    return {
      cmd: process.env.ComSpec || 'cmd.exe',
      baseArgs: ['/d', '/s', '/c', 'npx wrangler'],
      label: 'npx wrangler (may download)',
    };
  }
  return { cmd: 'npx', baseArgs: ['wrangler'], label: 'npx wrangler (may download)' };
}

function runWrangler(args) {
  const { cmd, baseArgs, label } = wranglerCommand();
  const result = spawnSync(cmd, [...baseArgs, ...args], {
    cwd: BUILD,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
  if (result.error) fail(`wrangler (${label}) 起動失敗: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`wrangler (${label}) が失敗しました (exit ${result.status})\n${detail}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) fail(`検証に失敗: ${message}`);
}

async function verifyWorker() {
  const workerUrl = pathToFileURL(path.join(DIST, '_worker.js')).href + '?v=' + Date.now();
  const mod = await import(workerUrl);
  const worker = mod.default;
  assert(worker && typeof worker.fetch === 'function', 'default.fetch が無い');

  const ORIGIN = 'https://classroom.hori-shota.com';
  const d1 = {
    prepare() {
      throw new Error('d1 stub must not be queried during these checks');
    },
  };
  const configured = { CLASSROOM_ORIGIN: ORIGIN, CLASSROOM_DB: d1 };

  const noCookie = (response, label) => {
    assert(!response.headers.get('set-cookie'), `${label}: Set-Cookie を返している`);
  };

  // 1) 設定不足は fail closed（503）
  let res = await worker.fetch(new Request(ORIGIN + '/'), {});
  assert(res.status === 503, `未設定で 503 にならない (${res.status})`);
  noCookie(res, 'unset');

  res = await worker.fetch(new Request(ORIGIN + '/'), { CLASSROOM_ORIGIN: ORIGIN });
  assert(res.status === 503, `D1 未設定で 503 にならない (${res.status})`);

  // 2) pages.dev / preview / 別ホストは 404（exact origin guard）
  for (const host of [
    'https://gakusyu-classroom.pages.dev/',
    'https://a1b2c3d4.gakusyu-classroom.pages.dev/',
    'https://classroom.hori-shota.com.example.com/',
  ]) {
    res = await worker.fetch(new Request(host), configured);
    assert(res.status === 404, `${host} が 404 にならない (${res.status})`);
    noCookie(res, host);
  }

  // 3) 認証ルートも pages.dev では 404（OAuth 設定が無くても origin guard が先）
  res = await worker.fetch(
    new Request('https://gakusyu-classroom.pages.dev/_classroom/login', {
      method: 'POST',
      headers: { origin: 'https://gakusyu-classroom.pages.dev' },
    }),
    configured,
  );
  assert(res.status === 404, `pages.dev の login が 404 にならない (${res.status})`);
  noCookie(res, 'pages.dev login');

  // 4) 正しい origin でも Google OAuth 設定が無ければ login は 503（cookie を出さない）
  res = await worker.fetch(
    new Request(ORIGIN + '/_classroom/login', {
      method: 'POST',
      headers: { origin: ORIGIN },
    }),
    configured,
  );
  assert(res.status === 503, `OAuth 未設定の login が 503 にならない (${res.status})`);
  noCookie(res, 'login unconfigured');

  log('verify ok: fail-closed 503 / exact origin guard 404 / 認証 cookie 非発行');
}

async function main() {
  const noVerify = process.argv.includes('--no-verify');

  // D1 UUID は先に解決する（不正・未設定なら束ねる前に止める。値をログへ出さない）。
  const { id: d1DatabaseId, source: d1Source } = resolveD1DatabaseId();

  resetDir(STAGING);
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(BUILD, { recursive: true });
  log(`d1: production binding CLASSROOM_DB (source: ${d1Source})`);

  // 1. 1 ファイルに束ねる（ソースは複製しない。relative import で classroom-worker.mjs を参照）
  fs.writeFileSync(
    path.join(BUILD, 'entry.mjs'),
    "export { default } from '../../classroom-worker.mjs';\n",
    'utf8',
  );
  fs.writeFileSync(
    path.join(BUILD, 'wrangler.toml'),
    [
      '# ビルド専用（生成物）',
      'name = "gakusyu-classroom-bundle"',
      'main = "entry.mjs"',
      `compatibility_date = "${COMPATIBILITY_DATE}"`,
      'workers_dev = false',
      '',
    ].join('\n'),
    'utf8',
  );

  log('bundling (wrangler deploy --dry-run --outdir)');
  runWrangler(['deploy', '--dry-run', '--config', 'wrangler.toml', '--outdir', 'out']);

  const bundlePath = path.join(BUILD, 'out', 'entry.js');
  assert(fs.existsSync(bundlePath), 'バンドル出力 out/entry.js が見つからない');

  // sourcemap は配布物に含めない（サーバ側ソースを公開しない）。
  // map を捨てるので、参照コメントも残さない（壊れた参照を持たせない）。
  const bundled = fs
    .readFileSync(bundlePath, 'utf8')
    .replace(/\n?\/\/# sourceMappingURL=.*\s*$/u, '\n');
  fs.writeFileSync(path.join(DIST, '_worker.js'), bundled, 'utf8');

  // 2. Pages 用設定（production の vars / D1 を明示。preview は空）
  fs.writeFileSync(path.join(STAGING, 'wrangler.toml'), pagesWranglerToml(d1DatabaseId), 'utf8');

  // 3. 静的資産ゼロ・全パス Functions を保証
  const distEntries = fs.readdirSync(DIST).sort();
  assert(
    distEntries.length === 1 && distEntries[0] === '_worker.js',
    `dist は _worker.js のみであること（実際: ${distEntries.join(', ') || '空'}）`,
  );
  assert(!fs.existsSync(path.join(DIST, '_routes.json')), 'dist に _routes.json を置かない');
  assert(!fs.existsSync(path.join(DIST, 'index.html')), 'dist に index.html を置かない');

  fs.rmSync(BUILD, { recursive: true, force: true });

  const bytes = fs.statSync(path.join(DIST, '_worker.js')).size;
  log(`built: site-worker/.pages-classroom/dist/_worker.js (${bytes} bytes)`);
  log(`config: site-worker/.pages-classroom/wrangler.toml (${PROJECT_NAME})`);

  if (!noVerify) await verifyWorker();

  log('next (deploy は手動・未実施):');
  log(`  cd site-worker\\.pages-classroom`);
  log(`  npx wrangler pages deploy dist --project-name ${PROJECT_NAME} --branch master`);
}

main().catch((error) => fail(error && error.stack ? error.stack : String(error)));
