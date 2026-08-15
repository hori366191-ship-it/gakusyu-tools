// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Code.gs ― GAS 版 英語長文多読リーダー
// ・特定の Google アカウントのみアクセス可（Script Properties: ALLOWED_EMAILS）
// ・AI 生成（Script Properties: OPENCODE_API_KEY）
// ・生成物は共有フォルダに保存（Script Properties: FOLDER_ID。未設定なら「生成済み長文」を自動作成）
// ・デプロイ設定: 実行ユーザー=アクセスしているユーザー / アクセス=Google アカウントでログイン
// ・辞書ファイル（DICTIONARY_ID / MAP_ID）は許可ユーザーに共有しておくこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

var DICTIONARY_ID = '13G_bvPbBaoFx-XC9qJAaJTBP66G_-EdK';
var MAP_ID        = '1J4_grvw-tZKV1BLqgVlCGb8A5Oa2hEdx';
var FOLDER_NAME   = '生成済み長文';
var API_BASE      = 'https://opencode.ai/zen/go/v1';
var MODEL         = 'deepseek-v4-flash';
var SYSTEM_PROMPT = 'あなたは英語教材の長文作成者です。日本語の指示に従い、英語の長文を1本作成してください。出力はタイトルと本文のみとし、マークダウン記法・注釈・解説・日本語の説明は一切含めないこと。';

var EIKEN_LEVELS = {
  "7級": { vocabulary: "約300語の超基礎語彙（数字・色・家族・動物・食べ物・曜日など、身近なものの名前）", grammar: "be動詞（am/is/are）、一般動詞の現在形（I like… / I have…）、簡単な現在進行形、簡単な命令文", forbidden: "過去形、未来表現、助動詞（can等）、比較、現在完了、受動態など、上級の時制・文法", sentenceLength: "1文3〜8語", note: "ほとんど1音節・2音節の短い単語を使う" },
  "6級": { vocabulary: "約450語の基礎語彙（学校・家・体・動作など、小学高学年レベルの身近な語）", grammar: "現在形・現在進行形、基本の過去形（規則変化を中心に不規則動詞の基本も可）、未来（will / be going to）、基本の命令文", forbidden: "助動詞（must等）、比較級・最上級、不定詞・動名詞、受動態、現在完了", sentenceLength: "1文4〜10語", note: "簡単な接続詞（and, but, because）でつなぐ文は可" },
  "5級": { vocabulary: "約600語（中学1年レベルの基礎語彙）", grammar: "現在形・過去形（規則・不規則の基本）・進行形・未来・命令形、助動詞（can, must）、比較級・最上級（基本）、簡単な接続詞（when, if, because）", forbidden: "不定詞・動名詞、受動態、現在完了、関係代名詞、仮定法、分詞", sentenceLength: "1文5〜12語", note: "中学1年生の教科書で読める範囲の語彙・文法に限る" },
  "4級": { vocabulary: "約1,300語（中学2年レベルの語彙）", grammar: "過去進行形、不定詞（to do）、動名詞（doing）、助動詞（should, may等）、比較・最上級の応用、感嘆文（How…! / What a…!）", forbidden: "受動態、現在完了、関係代名詞、分詞の形容詞的用法、仮定法、分詞構文", sentenceLength: "1文6〜14語", note: "中学2年生の教科書で読める範囲に限る" },
  "3級": { vocabulary: "約2,100語（中学卒業レベルの語彙）", grammar: "受動態、現在完了形（経験・継続・完了）、関係代名詞（who, which, that）、分詞の形容詞的用法（the running boy等）、間接疑問文", forbidden: "仮定法、分詞構文、過去完了、完了進行形、関係副詞、強調構文", sentenceLength: "1文8〜16語", note: "中学3年間で学習する範囲の語彙・文法に限る" },
  "準2級": { vocabulary: "約3,500語（高校中級レベルの語彙）", grammar: "仮定法過去（if I were…）、分詞構文（基礎）、過去完了形、完了進行形、関係副詞（when, where）、使役動詞（基礎）、比較表現の応用", forbidden: "仮定法過去完了、強調構文、倒置、無生物主語など高度な構文", sentenceLength: "1文10〜20語", note: "高校1〜2年で読める範囲の語彙・文法に限る" },
  "準2級プラス": { vocabulary: "約4,000語（準2級と2級の中間レベルの語彙）", grammar: "準2級の全項目＋形式主語It（It is 〜 to do…）、第4文型の応用、使役動詞の応用、分詞構文（応用）、受動態の応用", forbidden: "仮定法過去完了、倒置、強調構文、省略・挿入など複雑な構文", sentenceLength: "1文12〜22語", note: "高校上級レベル。2級の手前の橋渡しとして、語彙はやや豊富に" },
  "2級": { vocabulary: "約5,100語（高校卒業レベルの語彙。社会生活・時事・科学など幅広い題材の語を含む）", grammar: "仮定法過去完了、完了進行形、無生物主語、強調構文（It is 〜 that…）、倒置（初歩）、高度な分詞構文、比較の応用", forbidden: "省略・挿入・複雑な倒置など文語的な高度な構文", sentenceLength: "1文12〜25語", note: "高校卒業・大学入試レベル" },
  "準1級": { vocabulary: "約7,500語（大学中級レベルの語彙。アカデミックな語彙・抽象概念の語を含む）", grammar: "倒置、強調構文、省略・挿入など複雑な構文の運用、抽象的・学術的な表現、句動詞・慣用表現", forbidden: "文語的な古風な表現や極端に難解な文学語は避け、現代英語として自然であること", sentenceLength: "1文15〜35語", note: "難関大学入試レベル" },
  "1級": { vocabulary: "約10,000語以上（大学上級レベルの語彙。専門的な語彙・文学語・イディオムを含む）", grammar: "複雑な構文・イディオム・比喩表現・文語表現も可（現代の英語として自然な範囲で）", forbidden: "特に制限なし（ただし不自然に難解な表現ばかりにしないこと）", sentenceLength: "1文18〜45語", note: "英語圏の大学で専門的な学びができるレベル" }
};

function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty('OPENCODE_API_KEY');
}

function normalizeEmail_(addr) {
  addr = String(addr || '').trim().toLowerCase();
  if (/@gmail\.com$|@googlemail\.com$/.test(addr)) {
    return addr.split('@')[0].replace(/\./g, '') + '@gmail.com';
  }
  return addr;
}

function parseAllowedList_(raw) {
  return String(raw || '').split(/[,、\s]+/).map(function (s) {
    return s.replace(/^["']+|["']+$/g, '');
  }).filter(function (s) { return s; });
}

function isAllowedUser_() {
  var email = Session.getActiveUser().getEmail();
  var allowedRaw = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '';
  if (!email) return false;
  var list = parseAllowedList_(allowedRaw).map(function (s) { return normalizeEmail_(s); });
  return list.length > 0 && list.indexOf(normalizeEmail_(email)) >= 0;
}

/**
 * Web アプリ表示（アクセス制限付き）
 */
function doGet() {
  if (!isAllowedUser_()) {
    var denied = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>アクセス不可</title></head>' +
      '<body style="font-family:sans-serif;text-align:center;padding-top:80px;color:#444;">' +
      '<h1>アクセスが許可されていません</h1>' +
      '<p>このアプリは特定の Google アカウントのみ利用できます。</p>' +
      '<p>ログイン中のアカウントを確認してください。</p></body></html>';
    return HtmlService.createHtmlOutput(denied)
      .setTitle('アクセス不可')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var html = HtmlService.createTemplateFromFile('index').evaluate().getContent();
  var url = ScriptApp.getService().getUrl();
  html = html.replace("const GAS_APP_URL = '';", "const GAS_APP_URL = '" + url + "';");
  return HtmlService.createHtmlOutput(html)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setTitle('英語長文多読リーダー')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * generateText をウェブアプリ POST で受け付ける（予備。クライアントは google.script.run を使用）
 */
function doPost(e) {
  try {
    if (!isAllowedUser_()) {
      return jsonOut_({ ok: false, error: 'アクセスが許可されていません' });
    }
    var raw = (e && e.postData && e.postData.contents) || '';
    if (!raw) return jsonOut_({ ok: false, error: 'リクエストボディが空です' });
    var body = JSON.parse(raw);
    if (body.action === 'generateText') {
      return jsonOut_({ ok: true, item: generateText(body.settings || {}) });
    }
    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'doPost error: ' + String(err && err.message ? err.message : err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * AI で英語長文を生成し、Drive に保存して返す
 */
function generateText(settings) {
  var key = getApiKey_();
  if (!key) throw new Error('OPENCODE_API_KEY が設定されていません');
  var retryHint = '重要な指示：思考プロセス・ユーザーへの言及・指示の書き写し・見出しの転記を出力に含めてはならない。必ずタイトル（1行目）・空行・本文のみを出力すること。前回の応答は形式違反のため無効とする。';
  var content = '';
  for (var attempt = 0; attempt < 3; attempt++) {
    var payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: attempt === 0 ? SYSTEM_PROMPT : SYSTEM_PROMPT + ' ' + retryHint },
        { role: 'user', content: buildPrompt_(settings) }
      ],
      temperature: 0.9,
      max_tokens: 4096,
      reasoning_effort: 'none'
    };
    var res = UrlFetchApp.fetch(API_BASE + '/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var data = JSON.parse(res.getContentText());
    if (res.getResponseCode() >= 400) {
      var detail = (data.error && (data.error.message || JSON.stringify(data.error))) || ('HTTP ' + res.getResponseCode());
      throw new Error('AI API エラー: ' + detail);
    }
    var msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
    content = String(msg.content || msg.reasoning_content || '').replace(/```[\s\S]*?```/gm, '').trim();
    if (content && !looksLikeThinking_(content)) break;
    content = '';
  }
  if (!content) throw new Error('AI の応答が異常でした。もう一度お試しください。');
  var t = splitTitle_(content);
  var record = {
    id: 'tadoku-' + Date.now(),
    createdAt: new Date().toISOString(),
    settings: settings,
    title: t.title,
    text: t.text
  };
  saveRecord_(record);
  return record;
}

function looksLikeThinking_(t) {
  return /^(the user wants|let me|i need to|i will|i should|okay,?|ok,|certainly|understood|alright|note:|ご要望|わかりました|了解|はい、|まず|はい)/i.test(t)
    || t.indexOf('- Difficulty:') >= 0
    || t.indexOf('【難易度】') >= 0
    || t.indexOf('【レベル定義】') >= 0;
}

function buildPrompt_(s) {
  var lines = [
    '以下の条件で英語の長文を1本作成してください。',
    '',
    '【難易度】英検' + s.level + 'レベルの語彙・文法（その級の学習者が無理なく読めるレベルに合わせること）',
    '【語数】約' + s.wordCount + '語（±10%以内に収めること。最後に本文の単語数を数え、この範囲に収まるよう調整すること）',
    '【世界設定】' + s.world,
    '【文体】' + s.style + '（現代の自然な英語で書くこと）',
    '【文の種類】' + s.textType,
    '【ジャンル】' + s.genre,
    '【展開】' + s.development,
    '【終わり方】' + s.ending,
    s.prompt ? '【追加指示】' + s.prompt : '【追加指示】なし'
  ];
  var def = EIKEN_LEVELS[s.level];
  if (def) {
    lines = lines.concat([
      '',
      '【レベル定義】（英検' + s.level + '。以下の定義を厳守すること）',
      '- 語彙：' + def.vocabulary,
      '- 使える文法：' + def.grammar,
      '- 使えない文法：' + (def.forbidden || 'なし'),
      '- 一文の長さ：' + def.sentenceLength,
      '- 注意：' + (def.note || '特になし'),
      '上記の定義を超える語彙・文法・文長は使わないこと。この定義が最も優先される。'
    ]);
  }
  lines = lines.concat([
    '',
    '【出力形式】',
    '1行目にタイトル（英語）を書く。',
    '2行目は空行。',
    '3行目以降に本文を書く。',
    '上記以外の出力は禁止。'
  ]);
  return lines.join('\n');
}

function splitTitle_(content) {
  var lines = content.split('\n');
  var title = '';
  var body = '';
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) continue;
    if (!title) { title = t; continue; }
    body = lines.slice(i).join('\n').trim();
    break;
  }
  if (!body) return { title: '', text: content.trim() };
  return { title: title, text: body };
}

function getFolder_() {
  var folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) { /* 設定されたIDが無効な場合は従来の動作にフォールバック */ }
  }
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function saveRecord_(record) {
  getFolder_().createFile(record.id + '.json', JSON.stringify(record), 'application/json');
}

/**
 * 保存済み生成物の一覧（新しい順）
 */
function getSavedTexts() {
  var files = getFolder_().getFiles();
  var items = [];
  while (files.hasNext()) {
    var f = files.next();
    if (!f.getName().toLowerCase().endsWith('.json')) continue;
    try {
      var rec = JSON.parse(f.getBlob().getDataAsString());
      if (rec && rec.id) items.push(rec);
    } catch (e) { /* 壊れたファイルは無視 */ }
  }
  items.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
  return { items: items };
}

/**
 * 保存済み生成物の削除（payload: { id: "tadoku-..." }）
 */
function deleteText(payload) {
  var id = (payload && payload.id) || '';
  if (!/^tadoku-\d+$/.test(id)) throw new Error('対象が見つかりません');
  var files = getFolder_().getFilesByName(id + '.json');
  if (!files.hasNext()) throw new Error('対象が見つかりません');
  files.next().setTrashed(true);
  return true;
}

/**
 * 辞書 JSON（Drive）
 */
function getDICTIONARY() {
  return JSON.parse(DriveApp.getFileById(DICTIONARY_ID).getBlob().getDataAsString());
}

/**
 * 語形正規化表 JSON（Drive）
 */
function getFormMap() {
  return JSON.parse(DriveApp.getFileById(MAP_ID).getBlob().getDataAsString());
}
