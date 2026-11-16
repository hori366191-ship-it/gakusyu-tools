/**
 * 有機反応マップ（app11）— 既存レイアウトの凍結基準を作る
 *
 * 実行:
 *   node scripts/app11/make-legacy-baseline.cjs
 *
 * layout.json / routes.json / primary-topology.json と正本から
 * site-src/app11/legacy-baseline.json を作る。通常の反応追加では実行しない。
 * レイアウトを意図的に作り直したときだけ、新しい基準として更新する。
 */
'use strict';

const fs = require('node:fs');
const L = require('./legacy-baseline.cjs');

function main() {
  const baseline = L.buildBaseline();
  fs.writeFileSync(L.BASELINE_PATH, JSON.stringify(baseline) + '\n', 'utf8');
  console.log('生成: site-src/app11/legacy-baseline.json');
  console.log('凍結: 反応 ' + baseline.counts.reactions +
    '（主要 ' + baseline.counts.primaryReactions + ' / 補助 ' + baseline.counts.secondaryReactions +
    '、保留 ' + baseline.counts.heldReactions + '）' +
    '・物質 ' + baseline.counts.compounds + '（接続 ' + baseline.counts.connected +
    ' / 孤立 ' + baseline.counts.isolated + '）・経路 ' + baseline.counts.edges);
}

if (require.main === module) main();

module.exports = { main };
