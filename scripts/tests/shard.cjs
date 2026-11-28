#!/usr/bin/env node
// テストファイルを N 個のシャードへ、実行時間が偏らないよう貪欲に配分する。
//
// 使い方:
//   node scripts/tests/shard.cjs <index> <total>    # index は 0 始まり。ファイルパスを空白区切りで1行出力
//   node scripts/tests/shard.cjs --verify <total>   # 全ファイルがちょうど1回ずつ含まれるか検証
//
// 配分方法: ファイルサイズを実行時間の近似として、サイズの大きい順に
// 「現在の合計サイズが最も小さいシャード」へ割り当てる（決定的）。
// シャード番号は固定なので、ファイルを追加しても既存の割当は概ね維持される。

'use strict';

const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;

function fail(code, message) {
  process.stderr.write(message + '\n');
  process.exit(code);
}

function listTestFiles() {
  let entries;
  try {
    entries = fs.readdirSync(TESTS_DIR, { withFileTypes: true });
  } catch (err) {
    fail(3, `テストディレクトリを読めません: ${TESTS_DIR} (${err.message})`);
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.test.cjs'))
    .map((e) => e.name)
    .sort();

  if (files.length === 0) {
    fail(3, `テストファイルが見つかりません: ${TESTS_DIR}/*.test.cjs`);
  }

  return files.map((name) => {
    const abs = path.join(TESTS_DIR, name);
    const size = fs.statSync(abs).size;
    return { name, abs, size };
  });
}

// 決定的な貪欲配分。負荷順ソートはコピーに対して行い、元の並びは変えない。
function assign(files, total) {
  const order = files
    .map((f, i) => ({ ...f, i }))
    .sort((a, b) => (b.size - a.size) || a.name.localeCompare(b.name));

  const buckets = Array.from({ length: total }, () => ({ load: 0, files: [] }));
  for (const f of order) {
    let target = 0;
    for (let i = 1; i < total; i++) {
      if (buckets[i].load < buckets[target].load) target = i;
    }
    buckets[target].load += f.size;
    buckets[target].files.push(f);
  }

  // 出力順を安定させる（サイズ順ではなく名前順）
  for (const b of buckets) b.files.sort((a, b2) => a.name.localeCompare(b2.name));
  return buckets;
}

function displayPath(file) {
  const rel = path.relative(process.cwd(), file.abs);
  const normalized = rel.split(path.sep).join('/');
  return normalized.startsWith('..') ? `scripts/tests/${file.name}` : normalized;
}

function parseTotal(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    fail(2, `total は 1 以上の整数で指定してください: ${raw}`);
  }
  return n;
}

function main(argv) {
  if (argv[0] === '--verify') {
    if (argv.length !== 2) fail(2, '使い方: node scripts/tests/shard.cjs --verify <total>');
    const total = parseTotal(argv[1]);
    const files = listTestFiles();
    const buckets = assign(files, total);

    const seen = new Map();
    for (let s = 0; s < total; s++) {
      for (const f of buckets[s].files) {
        seen.set(f.name, (seen.get(f.name) || 0) + 1);
      }
    }
    const duplicates = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
    const missing = files.filter((f) => !seen.has(f.name)).map((f) => f.name);
    const assigned = buckets.reduce((sum, b) => sum + b.files.length, 0);

    if (duplicates.length || missing.length || assigned !== files.length) {
      console.log('NG');
      if (duplicates.length) console.log(`  重複: ${duplicates.join(', ')}`);
      if (missing.length) console.log(`  未割当: ${missing.join(', ')}`);
      if (assigned !== files.length) console.log(`  割当数 ${assigned} != ファイル数 ${files.length}`);
      process.exit(1);
    }
    console.log(`OK (${files.length} files / ${total} shards, each exactly once)`);
    return;
  }

  if (argv.length !== 2) {
    fail(2, '使い方: node scripts/tests/shard.cjs <index> <total> | --verify <total>');
  }

  const index = Number(argv[0]);
  if (!Number.isInteger(index) || index < 0) {
    fail(2, `index は 0 以上の整数で指定してください: ${argv[0]}`);
  }
  const total = parseTotal(argv[1]);
  if (index >= total) {
    fail(2, `index (${index}) は total (${total}) より小さくしてください`);
  }

  const files = listTestFiles();
  const buckets = assign(files, total);
  console.log(buckets[index].files.map(displayPath).join(' '));
}

main(process.argv.slice(2));
