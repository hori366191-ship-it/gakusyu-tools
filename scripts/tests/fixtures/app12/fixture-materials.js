/*!
 * scripts/tests/fixtures/app12/fixture-materials.js
 *
 * ブラウザ側の複数ページPDF確認用のダミー教材（本番配信しない）。
 * 本番の materials.js は window.GakusyuPrintMaterials が既にある場合は上書きしないので、
 * このファイルを先に読み込めば本番教材を増やさずに 3 ページ構成を再現できる。
 */
(function (root) {
  'use strict';
  if (!root) return;
  var row = function (id, name, form, point) {
    return {
      id: id,
      name: name,
      form: form,
      timeline: { point: point, habit: null, block: null, arcs: 0 },
      meanings: [{ marker: null, text: 'テスト用の意味（' + name + '）', note: '' }]
    };
  };
  root.GakusyuPrintMaterials = {
    version: 1,
    fixture: true,
    materials: [
      {
        id: 'fixture-three-pages',
        slug: 'fixture-three-pages',
        title: 'テスト用プリント（3ページ）',
        pages: [
          { id: 'f1', kind: 'tense-table', caption: '1ページ目', rows: [row('f1-a', 'テスト1', 'V-ed', 0.18), row('f1-b', 'テスト2', 'V', 0.5)] },
          { id: 'f2', kind: 'tense-table', caption: '2ページ目', rows: [row('f2-a', 'テスト3', 'be + V-ing', 0.18), row('f2-b', 'テスト4', 'will + V', 0.78)] },
          { id: 'f3', kind: 'tense-table', caption: '3ページ目', rows: [row('f3-a', 'テスト5', 'had + pp', 0.5), row('f3-b', 'テスト6', 'have/has + pp', 0.5)] }
        ]
      }
    ]
  };
})(typeof self !== 'undefined' ? self : this);
