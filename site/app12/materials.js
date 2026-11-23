/*!
 * site/app12/materials.js — 学習プリントの教材データ
 *
 * 教材はここにデータとして持つ（app.js は描画・印刷・PDF送信のみ）。
 *   material = {
 *     id, slug（PDFファイル名用のASCII）, title,
 *     pages: [ { id, kind, caption, ... } ], orientation: 'landscape'（横のみ・任意）
 *   kind: 'tense-table'（rows: [...]）／'irregular-verbs'（tables: [ { groups: [ { title, rows } ] } ]）
 *   }
 *
 * page は 1 つが A4 1 枚に対応する（明示的なページ区切り）。
 * material.orientation が 'landscape' の教材は A4 横 1 枚として描画する。
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

  // ---------------------------------------------------------------- 不規則動詞
  // design-lab/irregular-verbs/index.html の DATA / PRON をそのまま転記した。
  // 綴り・「/」併記・意味の「／」区切り・型は変えない（begin の発音も原本どおり）。
  //   pr: [原形, 過去形, 過去分詞] のカタカナ発音（目安）
  var IV_DATA = [
    { b: 'be (am/is/are)', p: 'was, were', pp: 'been', m: '～である、いる', t: 'その他', lv: 1, pr: ['ビー', 'ワズ, ワー', 'ビーン'] },
    { b: 'become', p: 'became', pp: 'become', m: '～になる', t: 'A-B-A', lv: 1, pr: ['ビカム', 'ビケイム', 'ビカム'] },
    { b: 'begin', p: 'began', pp: 'begun', m: '始める', t: 'A-B-C', lv: 1, pr: ['ビギン', 'ビギャン', 'ビガン'] },
    { b: 'break', p: 'broke', pp: 'broken', m: '壊す', t: 'A-B-C', lv: 1, pr: ['ブレイク', 'ブロウク', 'ブロウクン'] },
    { b: 'bring', p: 'brought', pp: 'brought', m: '持ってくる', t: 'A-B-B', lv: 1, pr: ['ブリング', 'ブロート', 'ブロート'] },
    { b: 'build', p: 'built', pp: 'built', m: '建てる', t: 'A-B-B', lv: 1, pr: ['ビルド', 'ビルト', 'ビルト'] },
    { b: 'buy', p: 'bought', pp: 'bought', m: '買う', t: 'A-B-B', lv: 1, pr: ['バイ', 'ボート', 'ボート'] },
    { b: 'catch', p: 'caught', pp: 'caught', m: '捕まえる', t: 'A-B-B', lv: 1, pr: ['キャッチ', 'コート', 'コート'] },
    { b: 'choose', p: 'chose', pp: 'chosen', m: '選ぶ', t: 'A-B-C', lv: 1, pr: ['チューズ', 'チョウズ', 'チョウズン'] },
    { b: 'come', p: 'came', pp: 'come', m: '来る', t: 'A-B-A', lv: 1, pr: ['カム', 'ケイム', 'カム'] },
    { b: 'cost', p: 'cost', pp: 'cost', m: '費用がかかる', t: 'A-A-A', lv: 1, pr: ['コスト', 'コスト', 'コスト'] },
    { b: 'cut', p: 'cut', pp: 'cut', m: '切る', t: 'A-A-A', lv: 1, pr: ['カット', 'カット', 'カット'] },
    { b: 'do (does)', p: 'did', pp: 'done', m: 'する', t: 'A-B-C', lv: 1, pr: ['ドゥー', 'ディドゥ', 'ダン'] },
    { b: 'draw', p: 'drew', pp: 'drawn', m: '描く', t: 'A-B-C', lv: 1, pr: ['ドロー', 'ドルー', 'ドローン'] },
    { b: 'drink', p: 'drank', pp: 'drunk', m: '飲む', t: 'A-B-C', lv: 1, pr: ['ドリンク', 'ドランク', 'ドランク'] },
    { b: 'drive', p: 'drove', pp: 'driven', m: '運転する', t: 'A-B-C', lv: 1, pr: ['ドライブ', 'ドロウブ', 'ドリブン'] },
    { b: 'eat', p: 'ate', pp: 'eaten', m: '食べる', t: 'A-B-C', lv: 1, pr: ['イート', 'エイト', 'イートゥン'] },
    { b: 'fall', p: 'fell', pp: 'fallen', m: '落ちる', t: 'A-B-C', lv: 1, pr: ['フォール', 'フェル', 'フォールン'] },
    { b: 'feel', p: 'felt', pp: 'felt', m: '感じる', t: 'A-B-B', lv: 1, pr: ['フィール', 'フェルト', 'フェルト'] },
    { b: 'fight', p: 'fought', pp: 'fought', m: '戦う', t: 'A-B-B', lv: 1, pr: ['ファイト', 'フォート', 'フォート'] },
    { b: 'find', p: 'found', pp: 'found', m: '見つける', t: 'A-B-B', lv: 1, pr: ['ファインド', 'ファウンド', 'ファウンド'] },
    { b: 'fly', p: 'flew', pp: 'flown', m: '飛ぶ', t: 'A-B-C', lv: 1, pr: ['フライ', 'フルー', 'フロウン'] },
    { b: 'forget', p: 'forgot', pp: 'forgotten', m: '忘れる', t: 'A-B-C', lv: 1, pr: ['フォーゲット', 'フォーガット', 'フォーガットゥン'] },
    { b: 'get', p: 'got', pp: 'got / gotten', m: '手に入れる', t: 'A-B-B / A-B-C', lv: 1, pr: ['ゲット', 'ガット', 'ガット'] },
    { b: 'give', p: 'gave', pp: 'given', m: '与える', t: 'A-B-C', lv: 1, pr: ['ギブ', 'ゲイブ', 'ギブン'] },
    { b: 'go', p: 'went', pp: 'gone', m: '行く', t: 'A-B-C', lv: 1, pr: ['ゴー', 'ウェント', 'ゴーン'] },
    { b: 'grow', p: 'grew', pp: 'grown', m: '育つ', t: 'A-B-C', lv: 1, pr: ['グロウ', 'グルー', 'グロウン'] },
    { b: 'have (has)', p: 'had', pp: 'had', m: '持っている', t: 'A-B-B', lv: 1, pr: ['ハブ', 'ハッド', 'ハッド'] },
    { b: 'hear', p: 'heard', pp: 'heard', m: '聞こえる', t: 'A-B-B', lv: 1, pr: ['ヒア', 'ハード', 'ハード'] },
    { b: 'hide', p: 'hid', pp: 'hidden', m: '隠す', t: 'A-B-C', lv: 1, pr: ['ハイド', 'ヒドゥ', 'ヒドゥン'] },
    { b: 'hit', p: 'hit', pp: 'hit', m: '打つ', t: 'A-A-A', lv: 1, pr: ['ヒット', 'ヒット', 'ヒット'] },
    { b: 'hold', p: 'held', pp: 'held', m: '持つ', t: 'A-B-B', lv: 1, pr: ['ホールド', 'ヘルド', 'ヘルド'] },
    { b: 'hurt', p: 'hurt', pp: 'hurt', m: '傷つける', t: 'A-A-A', lv: 1, pr: ['ハート', 'ハート', 'ハート'] },
    { b: 'keep', p: 'kept', pp: 'kept', m: '保つ', t: 'A-B-B', lv: 1, pr: ['キープ', 'ケプト', 'ケプト'] },
    { b: 'know', p: 'knew', pp: 'known', m: '知っている', t: 'A-B-C', lv: 1, pr: ['ノウ', 'ニュー', 'ノウン'] },
    { b: 'leave', p: 'left', pp: 'left', m: '去る', t: 'A-B-B', lv: 1, pr: ['リーブ', 'レフト', 'レフト'] },
    { b: 'lend', p: 'lent', pp: 'lent', m: '貸す', t: 'A-B-B', lv: 1, pr: ['レンド', 'レント', 'レント'] },
    { b: 'let', p: 'let', pp: 'let', m: 'させる', t: 'A-A-A', lv: 1, pr: ['レット', 'レット', 'レット'] },
    { b: 'lose', p: 'lost', pp: 'lost', m: '失う', t: 'A-B-B', lv: 1, pr: ['ルーズ', 'ロスト', 'ロスト'] },
    { b: 'make', p: 'made', pp: 'made', m: '作る', t: 'A-B-B', lv: 1, pr: ['メイク', 'メイド', 'メイド'] },
    { b: 'mean', p: 'meant', pp: 'meant', m: '意味する', t: 'A-B-B', lv: 1, pr: ['ミーン', 'メント', 'メント'] },
    { b: 'meet', p: 'met', pp: 'met', m: '会う', t: 'A-B-B', lv: 1, pr: ['ミート', 'メット', 'メット'] },
    { b: 'pay', p: 'paid', pp: 'paid', m: '払う', t: 'A-B-B', lv: 1, pr: ['ペイ', 'ペイド', 'ペイド'] },
    { b: 'put', p: 'put', pp: 'put', m: '置く', t: 'A-A-A', lv: 1, pr: ['プット', 'プット', 'プット'] },
    { b: 'read', p: 'read', pp: 'read', m: '読む', t: 'A-A-A', lv: 1, pr: ['リード', 'レッド', 'レッド'] },
    { b: 'ride', p: 'rode', pp: 'ridden', m: '乗る', t: 'A-B-C', lv: 1, pr: ['ライド', 'ロウド', 'リドゥン'] },
    { b: 'ring', p: 'rang', pp: 'rung', m: '鳴る', t: 'A-B-C', lv: 1, pr: ['リング', 'ラング', 'ラング'] },
    { b: 'rise', p: 'rose', pp: 'risen', m: '上がる', t: 'A-B-C', lv: 1, pr: ['ライズ', 'ロウズ', 'リズン'] },
    { b: 'run', p: 'ran', pp: 'run', m: '走る', t: 'A-B-A', lv: 1, pr: ['ラン', 'ラン', 'ラン'] },
    { b: 'say', p: 'said', pp: 'said', m: '言う', t: 'A-B-B', lv: 1, pr: ['セイ', 'セド', 'セド'] },
    { b: 'see', p: 'saw', pp: 'seen', m: '見る', t: 'A-B-C', lv: 1, pr: ['シー', 'ソー', 'シーン'] },
    { b: 'sell', p: 'sold', pp: 'sold', m: '売る', t: 'A-B-B', lv: 1, pr: ['セル', 'ソールド', 'ソールド'] },
    { b: 'send', p: 'sent', pp: 'sent', m: '送る', t: 'A-B-B', lv: 1, pr: ['センド', 'セント', 'セント'] },
    { b: 'set', p: 'set', pp: 'set', m: '設置する', t: 'A-A-A', lv: 1, pr: ['セット', 'セット', 'セット'] },
    { b: 'shine', p: 'shone / shined', pp: 'shone / shined', m: '輝く／磨く', t: 'A-B-B', lv: 1, pr: ['シャイン', 'ショウン', 'ショウン'] },
    { b: 'show', p: 'showed', pp: 'shown / showed', m: '見せる', t: 'A-B-C', lv: 1, pr: ['ショウ', 'ショウド', 'ショウン'] },
    { b: 'sing', p: 'sang', pp: 'sung', m: '歌う', t: 'A-B-C', lv: 1, pr: ['シング', 'サング', 'サング'] },
    { b: 'sit', p: 'sat', pp: 'sat', m: '座る', t: 'A-B-B', lv: 1, pr: ['シット', 'サット', 'サット'] },
    { b: 'sleep', p: 'slept', pp: 'slept', m: '眠る', t: 'A-B-B', lv: 1, pr: ['スリープ', 'スレプト', 'スレプト'] },
    { b: 'speak', p: 'spoke', pp: 'spoken', m: '話す', t: 'A-B-C', lv: 1, pr: ['スピーク', 'スポウク', 'スポウクン'] },
    { b: 'spend', p: 'spent', pp: 'spent', m: '使う', t: 'A-B-B', lv: 1, pr: ['スペンド', 'スペント', 'スペント'] },
    { b: 'stand', p: 'stood', pp: 'stood', m: '立つ', t: 'A-B-B', lv: 1, pr: ['スタンド', 'ストゥッド', 'ストゥッド'] },
    { b: 'steal', p: 'stole', pp: 'stolen', m: '盗む', t: 'A-B-C', lv: 1, pr: ['スティール', 'ストウル', 'ストウルン'] },
    { b: 'swim', p: 'swam', pp: 'swum', m: '泳ぐ', t: 'A-B-C', lv: 1, pr: ['スイム', 'スワム', 'スワム'] },
    { b: 'take', p: 'took', pp: 'taken', m: '取る', t: 'A-B-C', lv: 1, pr: ['テイク', 'トゥック', 'テイクン'] },
    { b: 'teach', p: 'taught', pp: 'taught', m: '教える', t: 'A-B-B', lv: 1, pr: ['ティーチ', 'トート', 'トート'] },
    { b: 'tell', p: 'told', pp: 'told', m: '話す', t: 'A-B-B', lv: 1, pr: ['テル', 'トールド', 'トールド'] },
    { b: 'think', p: 'thought', pp: 'thought', m: '考える', t: 'A-B-B', lv: 1, pr: ['シンク', 'ソート', 'ソート'] },
    { b: 'throw', p: 'threw', pp: 'thrown', m: '投げる', t: 'A-B-C', lv: 1, pr: ['スロウ', 'スルー', 'スロウン'] },
    { b: 'understand', p: 'understood', pp: 'understood', m: '理解する', t: 'A-B-B', lv: 1, pr: ['アンダスタンド', 'アンダストゥッド', 'アンダストゥッド'] },
    { b: 'wake', p: 'woke', pp: 'woken', m: '目を覚ます', t: 'A-B-C', lv: 1, pr: ['ウェイク', 'ウォウク', 'ウォウクン'] },
    { b: 'wear', p: 'wore', pp: 'worn', m: '着る', t: 'A-B-C', lv: 1, pr: ['ウェア', 'ウォア', 'ウォーン'] },
    { b: 'win', p: 'won', pp: 'won', m: '勝つ', t: 'A-B-B', lv: 1, pr: ['ウィン', 'ワン', 'ワン'] },
    { b: 'write', p: 'wrote', pp: 'written', m: '書く', t: 'A-B-C', lv: 1, pr: ['ライト', 'ロウト', 'リトゥン'] },
    { b: 'beat', p: 'beat', pp: 'beaten', m: '打ち負かす', t: 'A-A-B', lv: 2, pr: ['ビート', 'ビート', 'ビートゥン'] },
    { b: 'bite', p: 'bit', pp: 'bitten', m: 'かむ', t: 'A-B-C', lv: 2, pr: ['バイト', 'ビット', 'ビットゥン'] },
    { b: 'blow', p: 'blew', pp: 'blown', m: '吹く', t: 'A-B-C', lv: 2, pr: ['ブロウ', 'ブルー', 'ブロウン'] },
    { b: 'burn', p: 'burned / burnt', pp: 'burned / burnt', m: '燃える／燃やす', t: 'A-B-B', lv: 2, pr: ['バーン', 'バーンド', 'バーント'] },
    { b: 'burst', p: 'burst', pp: 'burst', m: '破裂する', t: 'A-A-A', lv: 2, pr: ['バースト', 'バースト', 'バースト'] },
    { b: 'deal', p: 'dealt', pp: 'dealt', m: '扱う', t: 'A-B-B', lv: 2, pr: ['ディール', 'デルト', 'デルト'] },
    { b: 'dig', p: 'dug', pp: 'dug', m: '掘る', t: 'A-B-B', lv: 2, pr: ['ディグ', 'ダグ', 'ダグ'] },
    { b: 'dream', p: 'dreamed / dreamt', pp: 'dreamed / dreamt', m: '夢を見る', t: 'A-B-B', lv: 2, pr: ['ドリーム', 'ドリームド', 'ドリームト'] },
    { b: 'feed', p: 'fed', pp: 'fed', m: '餌をやる', t: 'A-B-B', lv: 2, pr: ['フィード', 'フェド', 'フェド'] },
    { b: 'freeze', p: 'froze', pp: 'frozen', m: '凍る', t: 'A-B-C', lv: 2, pr: ['フリーズ', 'フロウズ', 'フロウズン'] },
    { b: 'hang', p: 'hung / hanged', pp: 'hung / hanged', m: '掛ける／絞首刑にする', t: 'A-B-B', lv: 2, pr: ['ハング', 'ハング', 'ハング'] },
    { b: 'lay', p: 'laid', pp: 'laid', m: '横たえる', t: 'A-B-B', lv: 2, pr: ['レイ', 'レイド', 'レイド'] },
    { b: 'lead', p: 'led', pp: 'led', m: '導く', t: 'A-B-B', lv: 2, pr: ['リード', 'レッド', 'レッド'] },
    { b: 'learn', p: 'learned / learnt', pp: 'learned / learnt', m: '学ぶ', t: 'A-B-B', lv: 2, pr: ['ラーン', 'ラーンド', 'ラーント'] },
    { b: 'lie', p: 'lay', pp: 'lain', m: '横になる', t: 'A-B-C', lv: 2, pr: ['ライ', 'レイ', 'レイン'] },
    { b: 'light', p: 'lit / lighted', pp: 'lit / lighted', m: '火をつける', t: 'A-B-B', lv: 2, pr: ['ライト', 'リット', 'リット'] },
    { b: 'mistake', p: 'mistook', pp: 'mistaken', m: '間違える', t: 'A-B-C', lv: 2, pr: ['ミステイク', 'ミストゥック', 'ミステイクン'] },
    { b: 'quit', p: 'quit', pp: 'quit', m: 'やめる', t: 'A-A-A', lv: 2, pr: ['クイット', 'クイット', 'クイット'] },
    { b: 'shake', p: 'shook', pp: 'shaken', m: '振る', t: 'A-B-C', lv: 2, pr: ['シェイク', 'シュック', 'シェイクン'] },
    { b: 'shoot', p: 'shot', pp: 'shot', m: '撃つ', t: 'A-B-B', lv: 2, pr: ['シュート', 'ショット', 'ショット'] },
    { b: 'shut', p: 'shut', pp: 'shut', m: '閉める', t: 'A-A-A', lv: 2, pr: ['シャット', 'シャット', 'シャット'] },
    { b: 'sink', p: 'sank', pp: 'sunk', m: '沈む', t: 'A-B-C', lv: 2, pr: ['シンク', 'サンク', 'サンク'] },
    { b: 'smell', p: 'smelled / smelt', pp: 'smelled / smelt', m: 'においがする／においをかぐ', t: 'A-B-B', lv: 2, pr: ['スメル', 'スメルド', 'スメルト'] },
    { b: 'spell', p: 'spelled / spelt', pp: 'spelled / spelt', m: 'つづる', t: 'A-B-B', lv: 2, pr: ['スペル', 'スペルド', 'スペルト'] },
    { b: 'spread', p: 'spread', pp: 'spread', m: '広げる', t: 'A-A-A', lv: 2, pr: ['スプレッド', 'スプレッド', 'スプレッド'] },
    { b: 'strike', p: 'struck', pp: 'struck', m: '打つ', t: 'A-B-B', lv: 2, pr: ['ストライク', 'ストゥラック', 'ストゥラック'] },
    { b: 'sweep', p: 'swept', pp: 'swept', m: '掃く', t: 'A-B-B', lv: 2, pr: ['スウィープ', 'スウェプト', 'スウェプト'] },
    { b: 'tear', p: 'tore', pp: 'torn', m: '裂く', t: 'A-B-C', lv: 2, pr: ['ティア', 'トア', 'トーン'] },
  ];

  var IV_TYPE_ORDER = ['A-A-A', 'A-B-A', 'A-B-B', 'A-B-C', 'A-A-B', 'その他'];
  var IV_TYPE_DESC = {
    'A-A-A': '3形同じ',
    'A-B-A': '原形＝過去分詞',
    'A-B-B': '過去形＝過去分詞',
    'A-B-C': '3形すべて異なる',
    'A-A-B': '原形＝過去形',
    'その他': '型に当てはまらない'
  };
  var IV_LEVELS = [{ id: 1, name: '基本' }, { id: 2, name: '発展' }];
  var IV_ROWS_PER_TABLE = 17;
  var IV_TABLES_PER_PAGE = 3;

  // 型が「A-B-B / A-B-C」のように複数ある語（get）は先頭の型でグループ分けする
  function ivTypeOf(item) { return String(item.t).split('/')[0].trim(); }
  function ivByBase(a, b) { return a.b < b.b ? -1 : (a.b > b.b ? 1 : 0); }

  // 基本→発展、型順（A-A-A→A-B-A→A-B-B→A-B-C→A-A-B→その他）、型内はアルファベット順
  function ivOrderedGroups() {
    var out = [];
    IV_LEVELS.forEach(function (lv) {
      IV_TYPE_ORDER.forEach(function (type) {
        var items = IV_DATA.filter(function (d) {
          return d.lv === lv.id && ivTypeOf(d) === type;
        }).sort(ivByBase);
        if (items.length) out.push({ level: lv.name, type: type, items: items });
      });
    });
    return out;
  }

  function ivGroupTitle(group, partText) {
    var head = group.level + ' ／ ' + group.type;
    if (IV_TYPE_DESC[group.type]) head += '　' + IV_TYPE_DESC[group.type];
    return head + partText;
  }

  // 17 行ずつ 6 表・3 表ずつ 2 ページへ流し込む（グループは表をまたいでよい）。
  // またいだグループは「（全N語・i/j）」「（続き・i/j）」で分割を示す。
  function buildIrregularVerbPages() {
    var groups = ivOrderedGroups();
    var tables = [];
    var gi = 0;
    var ii = 0;
    while (gi < groups.length) {
      var table = { groups: [] };
      var used = 0;
      while (used < IV_ROWS_PER_TABLE && gi < groups.length) {
        var group = groups[gi];
        var take = Math.min(IV_ROWS_PER_TABLE - used, group.items.length - ii);
        table.groups.push({ group: gi, from: ii, to: ii + take });
        used += take;
        ii += take;
        if (ii >= group.items.length) { gi += 1; ii = 0; }
      }
      tables.push(table);
    }

    // グループがいくつの表にまたがるか（表示順に連続している）
    var partCount = [];
    tables.forEach(function (table) {
      table.groups.forEach(function (part) {
        partCount[part.group] = (partCount[part.group] || 0) + 1;
      });
    });

    var partSeen = [];
    var no = 0;
    var built = tables.map(function (table, tableIndex) {
      var groupsInTable = table.groups.map(function (part) {
        var group = groups[part.group];
        partSeen[part.group] = (partSeen[part.group] || 0) + 1;
        var total = partCount[part.group];
        var partText = total > 1
          ? (partSeen[part.group] === 1
            ? '（全' + group.items.length + '語・1/' + total + '）'
            : '（続き・' + partSeen[part.group] + '/' + total + '）')
          : '（' + group.items.length + '語）';
        var rows = group.items.slice(part.from, part.to).map(function (item) {
          no += 1;
          return { no: no, b: item.b, p: item.p, pp: item.pp, m: item.m, pron: item.pr.slice() };
        });
        return { title: ivGroupTitle(group, partText), rows: rows };
      });
      return { id: 'table-' + (tableIndex + 1), groups: groupsInTable };
    });

    var totalPages = Math.ceil(built.length / IV_TABLES_PER_PAGE);
    var pages = [];
    for (var t = 0; t < built.length; t += IV_TABLES_PER_PAGE) {
      var tablesInPage = built.slice(t, t + IV_TABLES_PER_PAGE);
      var levels = [];
      tablesInPage.forEach(function (table) {
        (table.groups || []).forEach(function (grp) {
          var lv = grp.title.split(' ／ ')[0];
          if (levels.indexOf(lv) < 0) levels.push(lv);
        });
      });
      var pageNo = pages.length + 1;
      pages.push({
        id: 'irregular-' + pageNo,
        kind: 'irregular-verbs',
        caption: levels.join('・') + ' ' + pageNo + '/' + totalPages,
        tables: tablesInPage
      });
    }
    return pages;
  }

  root.GakusyuPrintMaterials = {
    version: 2,
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
      },
      {
        id: 'irregular-verbs',
        slug: 'irregular-verbs',
        title: '不規則動詞',
        orientation: 'landscape',
        legend: {
          title: '型の見方',
          items: [
            ['A-A-A', '3形同じ'],
            ['A-B-A', '原形＝過去分詞'],
            ['A-B-B', '過去形＝過去分詞'],
            ['A-B-C', '3形すべて異なる'],
            ['A-A-B', '原形＝過去形'],
            ['その他', '型に当てはまらない']
          ],
          note: 'カタカナは代表的な発音の目安（併記形は一方のみ／実際の発音と異なる場合あり）'
        },
        pages: buildIrregularVerbPages()
      }
    ]
  };
})(typeof self !== 'undefined' ? self : this);
