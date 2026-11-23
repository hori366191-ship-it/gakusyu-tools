#!/usr/bin/env node
/**
 * scripts/app12/build-history-chronology.cjs
 *
 * 中学歴史年表の一次データ（Markdown）を、site/app12 の紙面用データへ変換する。
 *
 *   入力: site-src/app1/content/# 中学歴史年表.md
 *   出力: site/app12/history-chronology-data.js
 *
 * 出力は「既存の材料登録」（window.GakusyuPrintMaterials）へ push するだけで、
 * materials.js 側は書き換えない。手でコピーを作らないため、原稿を直したら
 * このスクリプトを実行する（テストが再生成結果との一致を強制する）。
 *
 * 実行: node scripts/app12/build-history-chronology.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'site-src', 'app1', 'content', '# 中学歴史年表.md');
const OUTPUT = path.join(ROOT, 'site', 'app12', 'history-data.js');

// 組版境界（1-based の列末）。A4縦4ページ・左右2段＝8列。
// 原稿の行数が変わったら、この境界とあわせて見直す（下で総数と照合する）。
const COLUMN_ENDS = [31, 58, 86, 115, 142, 170, 198, 226];
const COLUMNS_PER_PAGE = 2;

function parseMarkdown(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  let title = '';
  let note = '';
  const chapters = [];
  let current = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!title && /^#\s+/.test(trimmed) && !/^##/.test(trimmed)) {
      title = trimmed.replace(/^#\s+/, '').trim();
      return;
    }
    if (/^##\s+/.test(trimmed)) {
      current = { title: trimmed.replace(/^##\s+/, '').trim(), rows: [] };
      chapters.push(current);
      return;
    }
    if (/^\|/.test(trimmed)) {
      if (/^\|\s*-/.test(trimmed) || /^\|\s*西暦\s*\|/.test(trimmed)) return;
      const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.length !== 3 || !current) return;
      current.rows.push({ year: cells[0], event: cells[1], goro: cells[2] });
      return;
    }
    if (!note && /^\*\*.+\*\*$/.test(trimmed)) {
      note = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
    }
  });

  return { title, note, chapters };
}

function shortChapterTitle(title) {
  return String(title).replace(/^\d+\.\s*/, '');
}

function buildMaterial(source) {
  const parsed = parseMarkdown(source);
  const chapters = parsed.chapters;
  if (!parsed.title) throw new Error('見出し（# 中学歴史年表）が見つかりません');
  if (!chapters.length) throw new Error('章見出し（## ...）が見つかりません');

  const flat = [];
  chapters.forEach((chapter, chapterIndex) => {
    if (!chapter.rows.length) throw new Error('章に行がありません: ' + chapter.title);
    chapter.rows.forEach((row) => {
      flat.push({ chapterIndex, year: row.year, event: row.event, goro: row.goro });
    });
  });

  const expected = COLUMN_ENDS[COLUMN_ENDS.length - 1];
  if (flat.length !== expected) {
    throw new Error('原稿の行数が組版境界と一致しません: ' + flat.length + ' != ' + expected);
  }

  const started = {};
  const columns = [];
  let at = 0;
  let previousEnd = 0;
  COLUMN_ENDS.forEach((end, columnIndex) => {
    const slice = flat.slice(previousEnd, end);
    previousEnd = end;
    at = end;
    const blocks = [];
    let block = null;
    let blockChapter = -1;
    slice.forEach((row) => {
      if (!block || blockChapter !== row.chapterIndex) {
        blockChapter = row.chapterIndex;
        block = {
          chapter: chapters[row.chapterIndex].title,
          continued: !!started[row.chapterIndex],
          rows: []
        };
        started[row.chapterIndex] = true;
        blocks.push(block);
      }
      block.rows.push({ year: row.year, event: row.event, goro: row.goro });
    });
    columns.push({ id: 'col-' + (columnIndex + 1), blocks });
  });
  if (at !== flat.length) throw new Error('列の合計行数が原稿と一致しません');

  const pages = [];
  for (let i = 0; i < columns.length; i += COLUMNS_PER_PAGE) {
    const pageColumns = columns.slice(i, i + COLUMNS_PER_PAGE);
    const titles = [];
    pageColumns.forEach((column) => column.blocks.forEach((block) => {
      const label = shortChapterTitle(block.chapter);
      if (titles.indexOf(label) < 0) titles.push(label);
    }));
    const caption = titles.length > 1 ? titles[0] + '〜' + titles[titles.length - 1] : (titles[0] || '');
    pages.push({
      id: 'history-' + (pages.length + 1),
      kind: 'history-chronology',
      caption,
      columns: pageColumns
    });
  }

  return {
    id: 'history-chronology',
    slug: 'history-chronology',
    title: parsed.title,
    note: parsed.note,
    pages
  };
}

function render(material) {
  return '/*!\n'
    + ' * site/app12/history-data.js — 中学歴史年表（自動生成・手で編集しない）\n'
    + ' *\n'
    + ' * 生成: node scripts/app12/build-history-chronology.cjs\n'
    + ' * 原稿: site-src/app1/content/# 中学歴史年表.md\n'
    + ' *\n'
    + ' * materials.js より先に読み込み、app.js が教材一覧へ合成する。\n'
    + ' * この生成物が欠けても既存2教材はそのまま動く。\n'
    + ' */\n'
    + '(function (root) {\n'
    + "  'use strict';\n"
    + '  if (!root) return;\n'
    + '  root.GakusyuPrintHistoryMaterial = ' + JSON.stringify(material, null, 2).replace(/\n/g, '\n  ') + ';\n'
    + "})(typeof self !== 'undefined' ? self : this);\n";
}

function build() {
  return render(buildMaterial(fs.readFileSync(SOURCE, 'utf8')));
}

if (require.main === module) {
  const output = build();
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== output) {
    fs.writeFileSync(OUTPUT, output, 'utf8');
    process.stdout.write('generated: ' + path.relative(ROOT, OUTPUT) + '\n');
  } else {
    process.stdout.write('up to date: ' + path.relative(ROOT, OUTPUT) + '\n');
  }
}

module.exports = {
  SOURCE,
  OUTPUT,
  COLUMN_ENDS,
  parseMarkdown,
  buildMaterial,
  render,
  build
};
