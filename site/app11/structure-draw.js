/*
 * 有機反応マップ（app11）— 構造式SVG描画の薄いアダプタ
 *
 * 描画・検証・表示計画の実装は site/shared/organic-structure.js（共有canonical）に置く。
 * このファイルは名前空間 RPStructure と、app11 のCSSクラス接頭辞
 * （rp-struct- / rp-eq-）だけを決める。ここへ描画ロジックを複製しないこと。
 *
 * app10 と同じ共有モジュールを使うため、両アプリの構造図・反応式は同じ座標・同じ
 * 結合から描かれる（接頭辞だけが異なる）。
 *
 * 読み込み順: ../shared/organic-structure.js → ./structure-draw.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/organic-structure.js'));
  } else {
    if (!root.GakusyuOrganicStructure) {
      throw new Error('site/shared/organic-structure.js を site/app11/structure-draw.js より先に読み込んでください。');
    }
    root.RPStructure = factory(root.GakusyuOrganicStructure);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (shared) {
  'use strict';
  if (!shared || typeof shared.createRenderer !== 'function') {
    throw new Error('共有構造モジュール GakusyuOrganicStructure.createRenderer が見つかりません。');
  }
  return shared.createRenderer({ structurePrefix: 'rp-struct-', equationPrefix: 'rp-eq-' });
});
