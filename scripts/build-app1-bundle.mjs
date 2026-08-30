#!/usr/bin/env node
/**
 * site-src/app1/content/*.md -> site/app1/bundle.json 生成スクリプト
 *
 * 仕様: site/app1/index.html:684 が fetch("./bundle.json") で取得する形式
 *   { files: [{id, name, content}], updatedAt: ISOString }
 *   id/name はファイル名そのまま（例: "# 数学I.md"）。表示は name.replace(/\.md$/,'')
 *   ソートは ja ロケールで name.localeCompare（apps/app1/Code.js:157 と同等）
 *
 * 使い方:
 *   node scripts/build-app1-bundle.mjs
 *   node scripts/build-app1-bundle.mjs --src site-src/app1/content --out site/app1/bundle.json
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const SRC = getArg('--src', 'site-src/app1/content');
const OUT = getArg('--out', 'site/app1/bundle.json');

if (!fs.existsSync(SRC)) {
  console.error(`[build-app1-bundle] src not found: ${SRC}`);
  process.exit(1);
}

const files = fs.readdirSync(SRC, { withFileTypes: true })
  .filter(d => d.isFile() && d.name.toLowerCase().endsWith('.md'))
  .map(d => d.name)
  .sort((a, b) => a.localeCompare(b, 'ja'));

if (files.length === 0) {
  console.warn(`[build-app1-bundle] no .md files in ${SRC}`);
}

const items = [];
for (const name of files) {
  const full = path.join(SRC, name);
  let content = fs.readFileSync(full, 'utf8');
  // BOM除去
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  // id はファイル名そのまま（現行名維持）。data-id属性で使われるため " を含む場合は置換
  const id = name;
  items.push({ id, name, content });
}

const bundle = {
  files: items,
  updatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle), 'utf8');

console.log(`[build-app1-bundle] ${items.length} files -> ${OUT}`);
console.log(`  updatedAt: ${bundle.updatedAt}`);
for (const f of items) {
  console.log(`  - ${f.name} (${f.content.length} chars, id=${JSON.stringify(f.id)})`);
}
console.log(`  total JSON size: ${fs.statSync(OUT).size} bytes`);
