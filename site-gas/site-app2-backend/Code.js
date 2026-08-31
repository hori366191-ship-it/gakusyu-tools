// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Code.gs ― GAS 版 英語長文多読リーダー
// ・サイト閲覧は Google アカウントがあれば誰でも可（デプロイ設定: 実行ユーザー=アクセスしているユーザー / アクセス=Google アカウントでログイン）
// ・AI 生成は許可ユーザーのみ（Script Properties: ALLOWED_EMAILS）
// ・生成物の削除はオーナーのみ（Script Properties: OWNER_EMAIL）
// ・AI 生成（Script Properties: OPENCODE_API_KEY）
// ・生成物は共有フォルダに保存（Script Properties: FOLDER_ID。未設定なら「生成済み長文」を自動作成）
// ・生成物フォルダ（FOLDER_ID）は全員に閲覧可 + 許可ユーザーに編集可で共有しておくこと
// ・辞書ファイル（DICTIONARY_ID / MAP_ID）は全員に閲覧可で共有しておくこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

var DICTIONARY_ID = '1J4_grvw-tZKV1BLqgVlCGb8A5Oa2hEdx';
var MAP_ID        = '13G_bvPbBaoFx-XC9qJAaJTBP66G_-EdK';
var FOLDER_NAME   = '生成済み長文';
var INDEX_FOLDER_NAME = '生成済み長文_index';
var INDEX_FILE_NAME   = 'tadoku-index.json';
var INDEX_CACHE_KEY   = 'tadoku_index_cache';
var INDEX_CACHE_TTL   = 60;
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

var PROP_TOKEN = 'DROP_TOKEN';

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_TOKEN) || '';
}
function getEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (e) {
    return '';
  }
}
function getAllowedList_() {
  return parseAllowedList_(PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .map(function (s) { return normalizeEmail_(s); });
}
function isAllowed_(email) {
  var list = getAllowedList_();
  if (!email) return false;
  if (!list.length) return true;
  return list.indexOf(normalizeEmail_(email)) !== -1;
}
function isAllowedUser_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  var allowedRaw = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '';
  if (!email) return false;
  var list = parseAllowedList_(allowedRaw).map(function (s) { return normalizeEmail_(s); });
  return list.length > 0 && list.indexOf(normalizeEmail_(email)) >= 0;
}
function isAllowedWithToken_(token, params) {
  if (!getToken_() || String(token) !== getToken_()) return false;
  var email = getEmailFromRequest_(params || {});
  return isAllowed_(email);
}

function isOwner_() {
  var email;
  try { email = normalizeEmail_(Session.getActiveUser().getEmail()); } catch (e) { return false; }
  if (!email) return false;
  var owner = normalizeEmail_(PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '');
  return !!owner && owner === email;
}
function isOwnerForEmail_(email) {
  var owner = normalizeEmail_(PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '');
  return !!owner && !!email && normalizeEmail_(email) === owner;
}
function maskEmail_(email) {
  var i = email.indexOf('@');
  if (i < 1) return '*';
  return email.slice(0, 2) + '***' + email.slice(i);
}
function decodeIdTokenEmail_(idToken) {
  if (!idToken) return '';
  try {
    var parts = String(idToken).split('.');
    if (parts.length !== 3) return '';
    var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    var json = Utilities.newBlob(Utilities.base64Decode(payload)).getDataAsString();
    var obj = JSON.parse(json);
    if (obj && obj.email) return normalizeEmail_(obj.email);
  } catch (e) {}
  return '';
}
function verifyIdToken_(idToken) {
  if (!idToken) return '';
  try {
    var cache = CacheService.getScriptCache();
    var key = 'idtok_' + String(idToken).slice(-32);
    var cached = cache.get(key);
    if (cached) return normalizeEmail_(cached);
  } catch (e) {}
  // 高速化: まずJWTデコードを試す（probe表示は検証なしでも可。生成/削除は呼び出し側で再検証）
  var decoded = decodeIdTokenEmail_(idToken);
  // ネットワーク検証を試みる（成功すればキャッシュ）
  try {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      if (data.email) {
        if (!data.email_verified || String(data.email_verified) === 'true' || data.email_verified === true) {
          var em = normalizeEmail_(data.email);
          try { CacheService.getScriptCache().put('idtok_' + String(idToken).slice(-32), em, 3600); } catch (e2) {}
          return em;
        }
      }
    }
  } catch (e) {}
  if (decoded) {
    try { CacheService.getScriptCache().put('idtok_' + String(idToken).slice(-32), decoded, 600); } catch (e3) {}
    return decoded;
  }
  return '';
}
function getEmailFromRequest_(p) {
  // GIS id_token または email パラメータがあればそれを優先（Cookie不要）
  if (p && p.email) {
    var e = normalizeEmail_(p.email);
    if (e) return e;
  }
  if (p && p.id_token) {
    var fromToken = verifyIdToken_(p.id_token);
    if (fromToken) return fromToken;
  }
  return getEmail_();
}

/**
 * Web アプリ表示 — Pages静的版では直接HTMLは返さず、APIのみ。
 * 旧互換: index.html が存在すれば従来通り IS_ALLOWED 注入も行うが、Pagesからは ?probe 経由で判定する。
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.probe) return handleProbe_(params);
  if (params.action === 'getSavedTexts') {
    var token = params.token || '';
    var cb = params.callback || '';
    var isCb = /^[A-Za-z0-9_.]{1,64}$/.test(cb);
    // 過去の生成物は閲覧のみなので token さえ合えば誰でも取得可（isAllowed は生成/削除のみでチェック）
    if (!getToken_() || String(token) !== getToken_()) {
      var err = { ok: false, error: 'bad token' };
      return isCb ? ContentService.createTextOutput(cb + '(' + JSON.stringify(err) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(err);
    }
    try {
      var opts = {
        limit: params.limit,
        offset: params.offset,
        level: params.level
      };
      var result = getSavedTexts(opts);
      var ok = { ok: true, items: result.items, total: result.total, hasMore: result.hasMore, offset: result.offset, limit: result.limit };
      return isCb ? ContentService.createTextOutput(cb + '(' + JSON.stringify(ok) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(ok);
    } catch (err2) {
      var fail = { ok: false, error: String(err2 && err2.message || err2) };
      return isCb ? ContentService.createTextOutput(cb + '(' + JSON.stringify(fail) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(fail);
    }
  }
  if (params.action === 'migrateToIndex') {
    var tokM = params.token || '';
    var cbM = params.callback || '';
    var isCbM = /^[A-Za-z0-9_.]{1,64}$/.test(cbM);
    if (!isAllowedWithToken_(tokM, params)) {
      var errM = { ok: false, error: 'not allowed' };
      return isCbM ? ContentService.createTextOutput(cbM + '(' + JSON.stringify(errM) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(errM);
    }
    var emailM = getEmailFromRequest_(params);
    if (!isOwnerForEmail_(emailM)) {
      var errM2 = { ok: false, error: 'owner only' };
      return isCbM ? ContentService.createTextOutput(cbM + '(' + JSON.stringify(errM2) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(errM2);
    }
    try {
      var msg = migrateToIndex();
      var okM = { ok: true, result: msg };
      return isCbM ? ContentService.createTextOutput(cbM + '(' + JSON.stringify(okM) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(okM);
    } catch (errM3) {
      var failM = { ok: false, error: String(errM3 && errM3.message || errM3) };
      return isCbM ? ContentService.createTextOutput(cbM + '(' + JSON.stringify(failM) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT) : jsonOut_(failM);
    }
  }
  if (params.action === 'debugIndexInfo') {
    var tokD = params.token || '';
    if (!isAllowedWithToken_(tokD, params)) return jsonOut_({ ok: false, error: 'not allowed' });
    return jsonOut_({ ok: true, info: debugIndexInfo(), props: debugProps() });
  }
  if (params.action === 'getDICTIONARY') {
    var tok = params.token || '';
    if (!isAllowedWithToken_(tok) && tok !== '') return jsonOut_({ ok: false, error: 'not allowed' });
    return jsonOut_(getDICTIONARY());
  }
  if (params.action === 'getFormMap') {
    var tok2 = params.token || '';
    if (!isAllowedWithToken_(tok2) && tok2 !== '') return jsonOut_({ ok: false, error: 'not allowed' });
    return jsonOut_(getFormMap());
  }
  // 旧GAS互換: テンプレートがあれば従来通りHTMLを返す（Pages移行後は通常ここには来ない）
  try {
    var html = HtmlService.createTemplateFromFile('index').evaluate().getContent();
    var url = ScriptApp.getService().getUrl();
    html = html.replace("const GAS_APP_URL = '';", "const GAS_APP_URL = '" + url + "';");
    html = html.replace("const IS_ALLOWED = false;", "const IS_ALLOWED = " + (isAllowedUser_() ? 'true' : 'false') + ";");
    html = html.replace("const IS_OWNER = false;", "const IS_OWNER = " + (isOwner_() ? 'true' : 'false') + ";");
    return HtmlService.createHtmlOutput(html)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setTitle('英語長文多読リーダー')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, msg: 'site-app2-backend API' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleProbe_(p) {
  var token = getToken_();
  var result;
  if (!token || p.token !== token) {
    result = { genkoProbe: true, ok: false, error: 'bad token' };
  } else {
    var email = getEmailFromRequest_(p);
    if (!email) {
      result = { genkoProbe: true, ok: false, error: 'noauth' };
    } else {
      result = {
        genkoProbe: true,
        ok: true,
        email_visible: !!email,
        masked: maskEmail_(email),
        allowed: isAllowed_(email),
        is_owner: isOwnerForEmail_(email)
      };
    }
  }
  // iframe フォールバック用: callback 無しで HTML postMessage を返す（サードパーティCookieブロック対策）
  if (!p.callback) {
    var json = JSON.stringify(result);
    var html = HtmlService.createHtmlOutput(
      '<script>try{parent.postMessage({genkoProbe:true,payload:' + json + '},"*");}catch(e){}try{top.postMessage({genkoProbe:true,payload:' + json + '},"*");}catch(e){}</script>'
    );
    html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return html;
  }
  var cb = String(p.callback || '');
  if (!/^[A-Za-z0-9_.]{1,64}$/.test(cb)) {
    return ContentService.createTextOutput('/*bad callback*/').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

 /**
  * API POST（Pages静的版: TOKEN必須）
 *  - JSON: {token, action:'generateText', settings:{}}
 *  - 互換: e.parameter.data に JSON が入る pdfdrop 型 hidden iframe でも受ける
 */
  function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (!raw && e && e.parameter && e.parameter.data) raw = e.parameter.data;
    // id_token POST probe 対応: e.parameter に直接 probe/id_token がある場合
    var params = (e && e.parameter) || {};
    if (!raw && (params.probe || params.id_token)) {
      return handleProbe_(params);
    }
    if (!raw) return jsonOut_({ ok: false, error: 'リクエストボディが空です' });
    var body = {};
    try { body = JSON.parse(raw); } catch (err2) { return jsonOut_({ ok: false, error: 'JSON parse error' }); }
    // probe を POST JSON でも受け付ける（id_token 検証用）
    if (body.probe) {
      var pr = { token: body.token, id_token: body.id_token, callback: body.callback };
      return handleProbe_(pr);
    }
    var token = body.token || (e && e.parameter && e.parameter.token) || '';
    var idToken = body.id_token || (e && e.parameter && e.parameter.id_token) || '';
    var pForCheck = { id_token: idToken };
    if (!isAllowedWithToken_(token, pForCheck)) {
      var em = getEmailFromRequest_(pForCheck);
      return jsonOut_({ ok: false, error: 'not allowed' + (em ? ' (' + maskEmail_(em) + ')' : ' (invisible token bad?)') });
    }
    if (body.action === 'generateText') {
      var settings = body.settings || {};
      // 互換: フラット送信（level等がトップレベル）でも動作するようフォールバック
      if (!settings.level && body.level) {
        settings = {
          level: body.level,
          wordCount: body.wordCount,
          world: body.world,
          style: body.style,
          textType: body.textType,
          genre: body.genre,
          development: body.development,
          ending: body.ending,
          prompt: body.prompt
        };
      }
      return jsonOut_({ ok: true, item: generateTextWithToken_(settings, token, pForCheck) });
    }
    if (body.action === 'deleteText') {
      return jsonOut_({ ok: true, result: deleteTextWithToken_(body.payload || body, token, pForCheck) });
    }
    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'doPost error: ' + String(err && err.message ? err.message : err) });
  }
}
function generateTextWithToken_(settings, token, params) {
  if (!isAllowedWithToken_(token, params)) throw new Error('AI生成は許可されたアカウントのみ利用できます');
  return generateText(settings);
}
function deleteTextWithToken_(payload, token, params) {
  if (!isAllowedWithToken_(token, params)) throw new Error('not allowed');
  // 削除はオーナーのみ（GISのメールで判定）
  var email = getEmailFromRequest_(params || {});
  if (!isOwnerForEmail_(email)) throw new Error('削除はオーナーのみ実行できます');
  return deleteText(payload);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * AI で英語長文を生成し、Drive に保存して返す
 */
function generateText(settings) {
  if (!isAllowedUser_()) throw new Error('AI生成は許可されたアカウントのみ利用できます');
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

function getIndexFolder_() {
  var fid = PropertiesService.getScriptProperties().getProperty('INDEX_FOLDER_ID');
  if (fid) {
    try { return DriveApp.getFolderById(fid); } catch (e) {}
  }
  var it = DriveApp.getFoldersByName(INDEX_FOLDER_NAME);
  if (it.hasNext()) {
    var f = it.next();
    try { PropertiesService.getScriptProperties().setProperty('INDEX_FOLDER_ID', f.getId()); } catch (e2) {}
    return f;
  }
  var nf = DriveApp.createFolder(INDEX_FOLDER_NAME);
  try { PropertiesService.getScriptProperties().setProperty('INDEX_FOLDER_ID', nf.getId()); } catch (e3) {}
  return nf;
}

function getIndexFile_() {
  var fileId = PropertiesService.getScriptProperties().getProperty('INDEX_FILE_ID');
  if (fileId) {
    try { return DriveApp.getFileById(fileId); } catch (e) {}
  }
  var folder = getIndexFolder_();
  var it = folder.getFilesByName(INDEX_FILE_NAME);
  if (it.hasNext()) {
    var f = it.next();
    try { PropertiesService.getScriptProperties().setProperty('INDEX_FILE_ID', f.getId()); } catch (e2) {}
    return f;
  }
  var initial = { version: 1, updatedAt: new Date().toISOString(), items: [] };
  var file = folder.createFile(INDEX_FILE_NAME, JSON.stringify(initial), MimeType.PLAIN_TEXT);
  try { PropertiesService.getScriptProperties().setProperty('INDEX_FILE_ID', file.getId()); } catch (e3) {}
  return file;
}

function loadIndex_() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(INDEX_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  var file = getIndexFile_();
  var txt = file.getBlob().getDataAsString();
  var data;
  try { data = JSON.parse(txt); } catch (e) { data = { version: 1, updatedAt: new Date().toISOString(), items: [] }; }
  if (!data.items || !Array.isArray(data.items)) data.items = [];
  if (!data.version) data.version = 1;
  try { CacheService.getScriptCache().put(INDEX_CACHE_KEY, JSON.stringify(data), INDEX_CACHE_TTL); } catch (e2) {}
  return data;
}

function saveIndex_(data) {
  data.updatedAt = new Date().toISOString();
  if (!data.version) data.version = 1;
  var file = getIndexFile_();
  file.setContent(JSON.stringify(data));
  try { CacheService.getScriptCache().put(INDEX_CACHE_KEY, JSON.stringify(data), INDEX_CACHE_TTL); } catch (e) {}
  try { CacheService.getScriptCache().remove('tadoku_index_cache_legacy'); } catch (e2) {}
}

function getLegacyItems_() {
  var files = getFolder_().getFiles();
  var items = [];
  while (files.hasNext()) {
    var f = files.next();
    if (!f.getName().toLowerCase().endsWith('.json')) continue;
    try {
      var rec = JSON.parse(f.getBlob().getDataAsString());
      if (rec && rec.id) items.push(rec);
    } catch (e) {}
  }
  items.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
  return items;
}

function saveRecord_(record) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    locked = lock.tryLock(10000);
    if (!locked) throw new Error('保存が混雑しています。少し待って再試行してください');
    var data = loadIndex_();
    // 重複チェック（同IDがあれば上書きしない）
    var exists = data.items.some(function (it) { return it.id === record.id; });
    if (!exists) {
      data.items.unshift(record); // 新しい順（先頭）
      // 念のためソート（id降順）
      data.items.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
    }
    saveIndex_(data);
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e) {} }
  }
}

/**
 * 保存済み生成物の一覧（新しい順）— 統合ファイル版
 * opts: {limit, offset, level}  levelは「すべて」または級名（例: "3級"）
 * 旧フォルダの個別ファイルは migrateToIndex() 後に INDEX_FILE に集約される
 */
function getSavedTexts(opts) {
  opts = opts || {};
  var limit = parseInt(opts.limit, 10);
  var offset = parseInt(opts.offset, 10);
  if (isNaN(limit) || limit <= 0) limit = 0; // 0は全件（旧互換）
  if (isNaN(offset) || offset < 0) offset = 0;
  var level = opts.level ? String(opts.level).trim() : '';
  if (level === 'すべて' || level === '全て' || level === 'all') level = '';

  var data;
  try {
    data = loadIndex_();
  } catch (e) {
    data = { items: [] };
  }
  var items = data.items || [];
  // 旧データがまだ移行されていない場合はレガシーから読む（indexが空で旧にデータがある場合）
  // ついでに自動移行を試みる（初回のみ）
  if ((!items || items.length === 0) && !opts._skipLegacy) {
    try {
      var legacy = getLegacyItems_();
      if (legacy && legacy.length) {
        items = legacy;
        // 自動移行: indexが空なら旧データをindexへ保存（失敗しても読込は継続）
        try {
          var lock = LockService.getScriptLock();
          if (lock.tryLock(5000)) {
            try {
              var cur = loadIndex_();
              if (!cur.items || cur.items.length === 0) {
                cur.items = legacy;
                cur.version = 1;
                saveIndex_(cur);
                try { PropertiesService.getScriptProperties().setProperty('MIGRATED_AT', new Date().toISOString()); } catch (e3) {}
              }
            } finally { try { lock.releaseLock(); } catch (e4) {} }
          }
        } catch (e5) {}
      }
    } catch (e2) {}
  }
  // 級フィルタ
  if (level) {
    items = items.filter(function (it) {
      return it.settings && String(it.settings.level) === level;
    });
  }
  var total = items.length;
  // ソートは保存時に降順なので不要だが念のため
  // items.sort(function(a,b){return String(b.id).localeCompare(String(a.id));});
  if (limit > 0) {
    items = items.slice(offset, offset + limit);
  } else if (offset > 0) {
    items = items.slice(offset);
  }
  var hasMore = limit > 0 ? (offset + limit < total) : false;
  return { items: items, total: total, hasMore: hasMore, offset: offset, limit: limit };
}

/**
 * 保存済み生成物の削除（payload: { id: "tadoku-..." }）— 統合ファイル版
 * 権限チェックは呼び出し元（deleteTextWithToken_ または旧 google.script.run の isOwner_）で行うため、ここでは行わない
 */
function deleteText(payload) {
  var id = (payload && payload.id) || '';
  if (!/^tadoku-\d+$/.test(id)) throw new Error('対象が見つかりません');
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    locked = lock.tryLock(10000);
    if (!locked) throw new Error('削除が混雑しています。少し待って再試行してください');
    var data = loadIndex_();
    var idx = -1;
    for (var i = 0; i < data.items.length; i++) {
      if (data.items[i].id === id) { idx = i; break; }
    }
    if (idx === -1) {
      // 旧個別ファイルに残っている可能性（移行前データ）— 旧フォルダも探す
      try {
        var files = getFolder_().getFilesByName(id + '.json');
        if (files.hasNext()) {
          files.next().setTrashed(true);
          return true;
        }
      } catch (e2) {}
      throw new Error('対象が見つかりません');
    }
    data.items.splice(idx, 1);
    saveIndex_(data);
    return true;
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e) {} }
  }
}

/**
 * 旧個別ファイルから統合ファイルへの移行（手動実行）
 * GASエディタで migrateToIndex() を実行。INDEX_FILE が空の場合のみ旧ファイルをコピー
 */
function migrateToIndex() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ロック取得失敗');
  try {
    var data = loadIndex_();
    if (data.items && data.items.length > 0) {
      return 'index already has ' + data.items.length + ' items, skip. To force, clear index first.';
    }
    var legacy = getLegacyItems_();
    data.items = legacy;
    data.version = 1;
    saveIndex_(data);
    try { PropertiesService.getScriptProperties().setProperty('MIGRATED_AT', new Date().toISOString()); } catch (e) {}
    try { CacheService.getScriptCache().remove(INDEX_CACHE_KEY); } catch (e2) {}
    return 'migrated ' + legacy.length + ' items from legacy folder to index';
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function forceMigrateToIndex_() {
  // 強制再移行（indexを上書き）
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ロック取得失敗');
  try {
    var legacy = getLegacyItems_();
    var data = { version: 1, updatedAt: new Date().toISOString(), items: legacy };
    saveIndex_(data);
    try { PropertiesService.getScriptProperties().setProperty('MIGRATED_AT', new Date().toISOString()); } catch (e) {}
    return 'force migrated ' + legacy.length + ' items';
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
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
function debugProps(){return JSON.stringify({FOLDER_ID: PropertiesService.getScriptProperties().getProperty('FOLDER_ID'), INDEX_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('INDEX_FOLDER_ID'), INDEX_FILE_ID: PropertiesService.getScriptProperties().getProperty('INDEX_FILE_ID'), MIGRATED_AT: PropertiesService.getScriptProperties().getProperty('MIGRATED_AT'), ALLOWED_EMAILS: PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS')});}
function debugIndexInfo(){ var d=loadIndex_(); return JSON.stringify({total:(d.items||[]).length, updatedAt:d.updatedAt, version:d.version, sample:(d.items||[]).slice(0,2).map(function(x){return {id:x.id, level:x.settings&&x.settings.level, title:x.title};})});}
