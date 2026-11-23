/*!
 * site/app12/materials.js — 学習プリントの教材データ
 *
 * 教材はここにデータとして持つ（app.js は描画・印刷・PDF送信のみ）。
 *   material = {
 *     id, slug（PDFファイル名用のASCII）, title,
 *     pages: [ { id, kind: 'tense-table', caption, rows: [...] } ]
 *   }
 *
 * page は 1 つが A4 縦 1 枚に対応する（明示的なページ区切り）。
 *
 * 差し替えについて:
 *   window.GakusyuPrintMaterials が既に定義されている場合は上書きしない。
 *   そのため、テスト用ハーネス（scripts/tests/fixtures/app12/）のように
 *   このファイルより先に fixture を読み込ませると、本番の教材を増やさずに
 *   複数ページの PDF 生成を確認できる。本番用のデバッグ開口は持たない。
 */
(function (root) {
  'use strict';
  if (!root || root.GakusyuPrintMaterials) return;

  // 時間軸の位置は正規化座標（0 = 過去, 0.5 = 現在, 1 = 未来）。
  // 12 行すべてで同じ軸・同じ現在位置を使う。
  var PAST_POINT = 0.18;
  var NOW_POINT = 0.5;
  var FUTURE_POINT = 0.78;
  var PAST_BLOCK = { from: 0.15, to: 0.37 };
  var PAST_TO_NOW_BLOCK = { from: 0.15, to: 0.5 };
  var NOW_TO_FUTURE_BLOCK = { from: 0.5, to: 0.87 };

  // 意味は原本（時制のまとめノート）の文言をそのまま使う。
  // form のみ、大文字・小文字・分詞表記・have/has を比較しやすい形に正規化した。
  var TENSES = [
    {
      id: 'past-simple',
      group: 'past',
      name: '過去形',
      form: 'V-ed',
      timeline: { point: PAST_POINT, habit: 0.16, block: null, arcs: 2 },
      meanings: [
        { marker: null, text: '～していた（習慣など）', note: '' },
        { marker: null, text: '～した、～だった', note: '' }
      ]
    },
    {
      id: 'past-progressive',
      group: 'past',
      name: '過去進行形',
      form: 'was/were + V-ing',
      timeline: { point: PAST_POINT, habit: null, block: null, arcs: 0 },
      meanings: [
        { marker: null, text: 'そのとき～していた', note: '' }
      ]
    },
    {
      id: 'past-perfect',
      group: 'past',
      name: '過去完了形',
      form: 'had + pp',
      timeline: { point: null, habit: null, block: PAST_BLOCK, arcs: 0 },
      meanings: [
        { marker: '①', text: '～し続けていた（継続）', note: '※状態動詞' },
        { marker: '②', text: 'もう～していた（完了）', note: '' },
        { marker: '③', text: '～したことがあった（経験）', note: '' }
      ]
    },
    {
      id: 'past-perfect-progressive',
      group: 'past',
      name: '過去完了進行形',
      form: 'had been + V-ing',
      timeline: { point: null, habit: null, block: PAST_BLOCK, arcs: 0 },
      meanings: [
        { marker: null, text: '～し続けていた(継続)', note: '※動作動詞' }
      ]
    },
    {
      id: 'present-simple',
      group: 'present',
      name: '現在形',
      form: 'V',
      timeline: { point: NOW_POINT, habit: NOW_POINT, block: null, arcs: 2 },
      meanings: [
        { marker: null, text: '～している(習慣・不変の真理)', note: '' },
        { marker: null, text: '～である', note: '' }
      ]
    },
    {
      id: 'present-progressive',
      group: 'present',
      name: '現在進行形',
      form: 'be + V-ing',
      timeline: { point: NOW_POINT, habit: null, block: null, arcs: 0 },
      meanings: [
        { marker: null, text: '今、～している。', note: '' }
      ]
    },
    {
      id: 'present-perfect',
      group: 'present',
      name: '現在完了形',
      form: 'have/has + pp',
      timeline: { point: null, habit: null, block: PAST_TO_NOW_BLOCK, arcs: 0 },
      meanings: [
        { marker: '①', text: '～し続けている（継続）', note: '※状態動詞' },
        { marker: '②', text: 'もう～した（完了）', note: '' },
        { marker: '③', text: '～したことがある（経験）', note: '' }
      ]
    },
    {
      id: 'present-perfect-progressive',
      group: 'present',
      name: '現在完了進行形',
      form: 'have/has been + V-ing',
      timeline: { point: null, habit: null, block: PAST_TO_NOW_BLOCK, arcs: 0 },
      meanings: [
        { marker: null, text: '～し続けている(継続)', note: '※動作動詞' }
      ]
    },
    {
      id: 'future-simple',
      group: 'future',
      name: '未来形',
      form: 'will + V',
      timeline: { point: FUTURE_POINT, habit: FUTURE_POINT, block: null, arcs: 2 },
      meanings: [
        { marker: null, text: '～しているだろう(習慣)', note: '' },
        { marker: null, text: '～なっているだろう', note: '' }
      ]
    },
    {
      id: 'future-progressive',
      group: 'future',
      name: '未来進行形',
      form: 'will be + V-ing',
      timeline: { point: FUTURE_POINT, habit: null, block: null, arcs: 0 },
      meanings: [
        { marker: null, text: 'ある時に～しているだろう', note: '' }
      ]
    },
    {
      id: 'future-perfect',
      group: 'future',
      name: '未来完了形',
      form: 'will have + pp',
      timeline: { point: null, habit: null, block: NOW_TO_FUTURE_BLOCK, arcs: 0 },
      meanings: [
        { marker: '①', text: '～し続けているだろう（継続）', note: '※状態動詞' },
        { marker: '②', text: 'すでに～しているだろう（完了）', note: '' },
        { marker: '③', text: '～したことがあるであろう（経験）', note: '' }
      ]
    },
    {
      id: 'future-perfect-progressive',
      group: 'future',
      name: '未来完了進行形',
      form: 'will have been + V-ing',
      timeline: { point: null, habit: null, block: NOW_TO_FUTURE_BLOCK, arcs: 0 },
      meanings: [
        { marker: null, text: '～し続けているだろう(継続)', note: '※動作動詞' }
      ]
    }
  ];

  root.GakusyuPrintMaterials = {
    version: 1,
    materials: [
      {
        id: 'tense-notes',
        slug: 'tense-notes',
        title: '時制のまとめノート',
        pages: [
          {
            id: 'tenses',
            kind: 'tense-table',
            caption: '過去・現在・未来 × 4つの相',
            rows: TENSES
          }
        ]
      }
    ]
  };
})(typeof self !== 'undefined' ? self : this);
