/**
 * 有機反応マップ（app11）— オフライン配置最適化の入口
 *
 * 実行:
 *   node scripts/app11/optimize-layout.cjs          # site-src/app11/layout.json / routes.json を更新
 *   node scripts/app11/optimize-layout.cjs --check  # 同じ入力から同じ出力になるか確認（不一致は exit 1）
 *
 * 実体は network-layout.cjs。分類パネルではなく、反応ネットワークの力配置と
 * 可視グラフ配線で座標・マーカー・全点列を決める。閲覧時は再計算しない。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const S = require('./source-data.cjs');
const N = require('./network-layout.cjs');
const M = require('./metrics.cjs');
const F = require('./layout-format.cjs');

function planLayout() {
  return N.planNetworkLayout();
}

function renderLayout(layout) {
  return F.renderLayout(layout);
}

function renderRoutes(routes) {
  return F.renderRoutes(routes);
}

function main() {
  const check = process.argv.includes('--check');
  const { layout, routes, report } = planLayout();
  const layoutPath = path.join(S.SRC, 'layout.json');
  const routesPath = path.join(S.SRC, 'routes.json');
  if (check) {
    const currentLayout = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, 'utf8') : '';
    const currentRoutes = fs.existsSync(routesPath) ? fs.readFileSync(routesPath, 'utf8') : '';
    if (currentLayout !== renderLayout(layout) || currentRoutes !== renderRoutes(routes)) {
      console.error('layout.json / routes.json が最新ではありません: node scripts/app11/optimize-layout.cjs を実行してください。');
      process.exit(1);
    }
    console.log('app11 の配置・経路は最新です（辺 ' + report.edges.count +
      '、交差 ' + report.edges.crossings + '、無関係ノード貫通 ' + report.edges.nodePenetrations + '）。');
    return;
  }
  fs.writeFileSync(layoutPath, renderLayout(layout), 'utf8');
  fs.writeFileSync(routesPath, renderRoutes(routes), 'utf8');
  console.log('生成: site-src/app11/layout.json / routes.json');
  console.log(M.formatReport(report));
}

if (require.main === module) main();

module.exports = {
  planLayout,
  renderLayout,
  renderRoutes,
  SEED: N.SEED
};
