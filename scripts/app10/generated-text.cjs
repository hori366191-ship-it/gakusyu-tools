/**
 * 生成物テキストの改行比較（pure）
 *
 * Windows の core.autocrlf=true では checkout 時に生成物が CRLF になる。
 * 生成器は常に LF で書き出すため、--check の比較だけ CRLF を LF に正規化する。
 * 内容そのものの差分（文字の追加・削除・変更）は従来どおり検出する。
 */
'use strict';

function normalizeEol(text) {
  return String(text == null ? '' : text).replace(/\r\n?/g, '\n');
}

function sameText(current, expected) {
  if (current == null) return false;
  return normalizeEol(current) === String(expected == null ? '' : expected);
}

module.exports = { normalizeEol, sameText };
