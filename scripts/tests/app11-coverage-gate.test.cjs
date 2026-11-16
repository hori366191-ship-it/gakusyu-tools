/**
 * app11 最終カバレッジゲート（生成物を含む）
 *
 * 実行: node --test scripts/tests/app11-coverage-gate.test.cjs
 *
 * `check-coverage.cjs --check` を spawn し、source だけでなく生成 data.js /
 * academic-data.js / layout.json / routes.json / 通常・学術の route 数まで
 * 一致していることを CI で保証する。
 *
 * 生成物（layout / build 出力）が古い間は失敗する。source 実装中は
 * app11-highschool-content.test.cjs の source-only 検査を使い、最終生成後に
 * このテストを通す。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

test('coverage --check（生成物込み）が通る', () => {
  const result = spawnSync(process.execPath, ['scripts/app11/check-coverage.cjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
});
