#!/usr/bin/env node
/**
 * 教室ログアウト用の合言葉ハッシュをローカルで生成する（コミット・共有しない）。
 *
 * 使い方:
 *   node scripts/classroom-logout-passphrase.mjs
 *   （合言葉を stdin で入力し、Ctrl+Z / Ctrl+D で終了）
 *
 * 出力: sha256$<hex64>
 * - 合言葉は stdin からだけ読む（引数・ファイル・ログへ出さない）。
 * - 4 文字未満・制御文字・256 文字超は拒否。
 * - PBKDF2 は使わない（現行の保存形式は SHA-256）。
 */

import { createHash } from 'node:crypto';

const MIN_LENGTH = 4;
const MAX_LENGTH = 256;

async function readStdin() {
  let value = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) value += chunk;
  // 末尾の改行 1 個だけ除く（合言葉自体の空白は変えない）。
  return value.replace(/\r?\n$/, '');
}

async function main() {
  const passphrase = await readStdin();
  if (
    typeof passphrase !== 'string' ||
    passphrase.length < MIN_LENGTH ||
    passphrase.length > MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(passphrase)
  ) {
    process.stderr.write('passphrase must be 4 to 256 characters without control characters\n');
    process.exitCode = 1;
    return;
  }

  const hash = createHash('sha256').update(passphrase, 'utf8').digest('hex');
  process.stdout.write(`sha256$${hash}\n`);
}

main().catch(() => {
  // 入力・例外内容は出さない。
  process.stderr.write('failed to generate passphrase hash\n');
  process.exitCode = 1;
});
