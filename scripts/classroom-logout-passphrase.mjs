#!/usr/bin/env node
/**
 * 教室ログアウト用の合言葉ハッシュをローカルで生成する（コミット・共有しない）。
 *
 * 使い方:
 *   node scripts/classroom-logout-passphrase.mjs
 *   （プロンプトで合言葉を入力し、Ctrl+Z / Ctrl+D で終了）
 *
 * 出力: pbkdf2-sha256$210000$<saltBase64url>$<hashBase64url>
 * - 合言葉は stdin からだけ読む（引数・ファイル・ログへ出さない）。
 * - 4 文字未満・制御文字・256 文字超は拒否。salt は 16 byte 乱数。
 * - 出力値は環境 secret `CLASSROOM_LOGOUT_PASSPHRASE_HASH` にだけ設定する。
 */

import { pbkdf2Sync, randomBytes } from 'node:crypto';

const MIN_LENGTH = 4;
const MAX_LENGTH = 256;
const ITERATIONS = 210000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

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

  const salt = randomBytes(SALT_BYTES);
  const hash = pbkdf2Sync(passphrase, salt, ITERATIONS, HASH_BYTES, 'sha256');
  process.stdout.write(
    `pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64url')}$${hash.toString('base64url')}\n`,
  );
}

main().catch(() => {
  // 入力・例外内容は出さない。
  process.stderr.write('failed to generate passphrase hash\n');
  process.exitCode = 1;
});
