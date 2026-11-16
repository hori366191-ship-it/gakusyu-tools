/*
 * 有機化学ビルダー — 構造式SVG描画の薄いアダプタ
 *
 * 描画・検証・表示計画の実装は site/shared/organic-structure.js（共有canonical）に置く。
 * このファイルは名前空間 OCDraw と、従来どおりの oc- / oc-eq- クラス接頭辞だけを決める。
 * ここへ描画ロジックを複製しないこと。
 *
 * 読み込み順: ../shared/organic-structure.js → ./draw.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/organic-structure.js'));
  } else {
    if (!root.GakusyuOrganicStructure) {
      throw new Error('site/shared/organic-structure.js を site/app10/draw.js より先に読み込んでください。');
    }
    root.OCDraw = factory(root.GakusyuOrganicStructure);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (shared) {
  'use strict';
  if (!shared || typeof shared.createRenderer !== 'function') {
    throw new Error('共有構造モジュール GakusyuOrganicStructure.createRenderer が見つかりません。');
  }
  // app10 は既存CSS・既存SVGのクラス名（oc- / oc-eq-）をそのまま使う。
  return shared.createRenderer({ structurePrefix: 'oc-', equationPrefix: 'oc-eq-' });
});
