// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Code.gs ― GAS 版 PDF 受信アプリ（site-pdfdrop）
// ・Pages の site/app9 から PDF(base64) を受け取り、共有フォルダへ保存する
// ・書込みは「共通トークン＋Google ID トークンの厳格検証＋ALLOWED_EMAILS」を必須にする
//   ALLOWED_EMAILS が空なら書込みは全拒否（fail closed）
// ・変更系 POST は request_id で冪等化（同一 request_id の再送は保存も日次カウントも再実行しない）
// ・日次上限は「保存前」にロック内で予約し、保存失敗時だけ同じキーを戻す
//
// 認証の設計（2026-10 改訂）:
// ・信頼するのは tokeninfo の HTTP 200 応答だけ。JWT デコード・email パラメータ・Session は使わない。
// ・必須: aud === GIS_CLIENT_ID / iss ∈ {accounts.google.com, https://accounts.google.com} /
//         exp > now / email_verified が true または 'true' / email が存在
// ・キャッシュキーは ID トークン全文の SHA256。保存値は {email, exp} のみで、ヒット時も exp を再確認し、TTL は exp 以下。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

var PROP_TOKEN = 'DROP_TOKEN';
var PROP_FOLDER_ID = 'DROP_FOLDER_ID';
var PROP_EMAILS = 'ALLOWED_EMAILS';
var PROP_MAX_DAY = 'MAX_PER_DAY';
var PROP_LAST_ERROR = 'LAST_ERROR';
var PROP_LAST_OK = 'LAST_OK';
var DEFAULT_MAX_DAY = 200;
var MAX_BYTES = 10 * 1024 * 1024;
var MAX_B64_CHARS = Math.ceil(MAX_BYTES / 3) * 4 + 16;
var MAX_BODY_CHARS = MAX_B64_CHARS + 8 * 1024;
var GIS_CLIENT_ID = '920000857743-91jfqq1q45hmnas1b25ebg0dqafo846i.apps.googleusercontent.com';
var TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
var AUTH_CACHE_PREFIX = 'pauth_tok_';
var AUTH_CACHE_MAX_TTL = 300;
var MAX_ID_TOKEN_LEN = 8192;
var IDEM_PREFIX = 'IDEM_';
var IDEM_MAX_ENTRIES = 200;          // 目安値（掃除は期限切れのみ。未期限 receipt は容量整理で消さない）
var IDEM_HARD_MAX_ENTRIES = 600;     // これを超えたら新規受付を拒否（副作用前に ledger_full）
var IDEM_BYTE_BUDGET = 320 * 1024;   // 新規 receipt 受付の上限（IDEM key+value の UTF-8 相当）
var IDEM_BYTE_CEILING = 495 * 1024;  // IDEM 全体の絶対上限
var PROP_TOTAL_CEILING = 500 * 1024 - 8 * 1024; // 全 properties（設定/DEV含む）合計の上限。設定変更用に8KiB残す
var IDEM_MAX_RECEIPT_BYTES = 1200;   // 1 receipt の key+value 上限
var IDEM_TTL_MS = 24 * 60 * 60 * 1000;
var IDEM_STALE_MS = 5 * 60 * 1000;
var REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
var RID_RE = /^[A-Za-z0-9_-]{8,128}$/;
var PARENT_ORIGIN_ALLOWLIST = [
  /^https:\/\/hori366191-ship-it\.github\.io$/,
  /^http:\/\/127\.0\.0\.1(:\d{2,5})?$/,
  /^http:\/\/localhost(:\d{2,5})?$/
];

function props_() {
  return PropertiesService.getScriptProperties();
}

function message_(err) {
  return String(err && err.message ? err.message : err);
}

function appError_(message, code, retryable) {
  var err = new Error(message);
  err.appCode = code || 'error';
  err.retryable = !!retryable;
  return err;
}

function sha256Hex_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function normalizeEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

function getToken_() {
  return props_().getProperty(PROP_TOKEN) || '';
}

function getFolderId_() {
  return props_().getProperty(PROP_FOLDER_ID) || '';
}

function getAllowedList_() {
  return String(props_().getProperty(PROP_EMAILS) || '')
    .split(/[,、\s]+/)
    .map(normalizeEmail_)
    .filter(function (v) { return v; });
}

function isAllowed_(email) {
  var list = getAllowedList_();
  if (!list.length) return false; // fail closed
  var target = normalizeEmail_(email);
  if (!target) return false;
  return list.indexOf(target) !== -1;
}

function getMaxDay_() {
  var n = parseInt(props_().getProperty(PROP_MAX_DAY) || '', 10);
  return isFinite(n) && n > 0 ? n : DEFAULT_MAX_DAY;
}

function maskEmail_(email) {
  var i = String(email || '').indexOf('@');
  if (i < 1) return '*';
  return String(email).slice(0, 2) + '***' + String(email).slice(i);
}

function withScriptLock_(fn, waitMs) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    locked = lock.tryLock(waitMs || 10000);
    if (!locked) throw appError_('混雑しています。少し待って再試行してください', 'lock_failed', true);
    return fn();
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e) {} }
  }
}

// ── ID トークン厳格検証 ─────────────────────────

function readAuthCache_(cacheKey, now) {
  try {
    var raw = CacheService.getScriptCache().get(cacheKey);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (!obj || !obj.email || !obj.exp) return null;
    var exp = Number(obj.exp);
    if (!isFinite(exp) || exp <= now) return { expired: true };
    return { email: normalizeEmail_(obj.email), exp: exp };
  } catch (e) {
    return null;
  }
}

function authCacheTtl_(exp, now) {
  var remain = exp - now;
  if (!(remain > 0)) return 0;
  return Math.min(AUTH_CACHE_MAX_TTL, remain);
}

/**
 * Google ID トークンの厳格検証。
 * 信頼するのは tokeninfo の HTTP 200 応答だけ（例外・400・500 は必ず拒否）。
 * 戻り値: { ok:true, email, exp } または { ok:false, error }
 */
function verifyIdTokenStrict_(idToken) {
  var token = String(idToken || '');
  if (!token) return { ok: false, error: 'missing id_token' };
  if (token.length > MAX_ID_TOKEN_LEN) return { ok: false, error: 'id_token too long' };
  var now = Math.floor(Date.now() / 1000);
  var cacheKey = AUTH_CACHE_PREFIX + sha256Hex_(token);
  var cached = readAuthCache_(cacheKey, now);
  if (cached && cached.email) return { ok: true, email: cached.email, exp: cached.exp };
  if (cached && cached.expired) {
    try { CacheService.getScriptCache().remove(cacheKey); } catch (e0) {}
    return { ok: false, error: 'token expired' };
  }
  var res;
  try {
    res = UrlFetchApp.fetch(TOKENINFO_ENDPOINT + encodeURIComponent(token), { muteHttpExceptions: true, followRedirects: false });
  } catch (e1) {
    return { ok: false, error: 'tokeninfo unreachable' };
  }
  var code = 0;
  try { code = res.getResponseCode(); } catch (e2) { code = 0; }
  if (code !== 200) return { ok: false, error: 'tokeninfo http ' + code };
  var data;
  try {
    data = JSON.parse(res.getContentText());
  } catch (e3) {
    return { ok: false, error: 'tokeninfo json' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'tokeninfo payload' };
  if (String(data.aud || '') !== GIS_CLIENT_ID) return { ok: false, error: 'aud mismatch' };
  var iss = String(data.iss || '');
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') return { ok: false, error: 'iss mismatch' };
  var exp = parseInt(data.exp, 10);
  if (!isFinite(exp) || exp <= now) return { ok: false, error: 'token expired' };
  var verified = data.email_verified;
  if (!(verified === true || String(verified).toLowerCase() === 'true')) return { ok: false, error: 'email unverified' };
  var email = normalizeEmail_(data.email || '');
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: false, error: 'email missing' };
  var ttl = authCacheTtl_(exp, now);
  if (ttl > 0) {
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify({ email: email, exp: exp }), ttl);
    } catch (e4) {}
  }
  return { ok: true, email: email, exp: exp };
}

// ── リクエスト解析（生JSON / form-urlencoded の data= の両対応） ──

function parseJsonRequestText_(text, maxChars) {
  var s = String(text || '');
  if (!s.replace(/\s/g, '')) return { body: null, error: '' };
  var limit = Number(maxChars) > 0 ? Number(maxChars) : MAX_BODY_CHARS;
  var t = s.trim();
  if (t.charAt(0) === '{') {
    if (t.length > limit) return { body: null, error: 'payload_too_large' };
    try {
      var obj = JSON.parse(t);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return { body: obj, error: '' };
    } catch (e) {}
    return { body: null, error: 'JSON parse error' };
  }
  var m = /(?:^|&)data=([^&]*)/.exec(t);
  if (m) {
    if (String(m[1]).length > limit * 3 + 4096) return { body: null, error: 'payload_too_large' };
    var decoded = '';
    try { decoded = decodeURIComponent(String(m[1]).replace(/\+/g, ' ')); } catch (e2) { decoded = ''; }
    if (decoded) {
      if (decoded.length > limit) return { body: null, error: 'payload_too_large' };
      try {
        var obj2 = JSON.parse(decoded);
        if (obj2 && typeof obj2 === 'object' && !Array.isArray(obj2)) return { body: obj2, error: '' };
      } catch (e3) {}
    }
    return { body: null, error: 'JSON parse error' };
  }
  return { body: null, error: 'JSON parse error' };
}

function readJsonRequest_(e, maxChars) {
  var params = (e && e.parameter) || {};
  var rawBody = String((e && e.postData && e.postData.contents) || '');
  var candidates = [];
  if (typeof params.data === 'string' && params.data) candidates.push(params.data);
  if (rawBody) candidates.push(rawBody);
  var lastError = '';
  for (var i = 0; i < candidates.length; i++) {
    var parsed = parseJsonRequestText_(candidates[i], maxChars);
    if (parsed.body) return { body: parsed.body, error: '', raw: candidates[i] };
    if (parsed.error) lastError = parsed.error;
    if (parsed.error === 'payload_too_large') {
      return { body: null, error: 'payload_too_large', raw: candidates[i] };
    }
  }
  return {
    body: null,
    error: lastError || 'empty body',
    raw: candidates.length ? candidates[candidates.length - 1] : ''
  };
}

function extractHintFromRaw_(text, key) {
  var s = String(text || '');
  if (!s) return '';
  if (s.indexOf('data=') !== -1) {
    var m0 = /(?:^|&)data=([^&]*)/.exec(s);
    if (m0) {
      try { s = decodeURIComponent(String(m0[1]).replace(/\+/g, ' ')); } catch (e0) {}
    }
  }
  if (key === 'rid') {
    var m = /"rid"\s*:\s*"([A-Za-z0-9_-]{8,128})"/.exec(s);
    return m ? m[1] : '';
  }
  if (key === 'parent_origin') {
    var m2 = /"parent_origin"\s*:\s*"([A-Za-z0-9.\-:\/]{1,120})"/.exec(s);
    return m2 ? m2[1] : '';
  }
  return '';
}

function normalizeRid_(v) {
  var s = String(v || '').trim();
  return RID_RE.test(s) ? s : '';
}

function normalizeRequestId_(v) {
  var s = String(v || '').trim();
  return REQUEST_ID_RE.test(s) ? s : '';
}

function resolveParentOrigin_(value) {
  var s = String(value == null ? '' : value).trim();
  if (!s) return { state: 'missing', origin: '' };
  if (!/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(s)) return { state: 'rejected', origin: '' };
  for (var i = 0; i < PARENT_ORIGIN_ALLOWLIST.length; i++) {
    if (PARENT_ORIGIN_ALLOWLIST[i].test(s)) return { state: 'ok', origin: s };
  }
  return { state: 'rejected', origin: '' };
}

function safeJsonForHtml_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function isValidCallback_(cb) {
  return /^[A-Za-z_$][A-Za-z0-9_$]{0,63}(\.[A-Za-z_$][A-Za-z0-9_$]{0,63}){0,3}$/.test(String(cb || ''));
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * iframe フォールバック用の postMessage 応答 HTML。
 * 契約: {genko:true, rid, payload}。失敗時も rid を必ず含める。
 * targetOrigin は検証済み parent_origin（allowlist のみ）。未指定時は従来互換で '*'。
 */
function postMessageOutput_(kind, rid, payload, parent) {
  var message = {
    genkoProbe: kind === 'probe',
    genko: kind === 'pdf',
    rid: rid || '',
    payload: payload
  };
  var target = (parent && parent.state === 'ok') ? JSON.stringify(parent.origin) : '"*"';
  var js = 'var m=' + safeJsonForHtml_(message) + ';'
    + 'try{top.postMessage(m,' + target + ');}catch(e){}'
    + 'try{parent.postMessage(m,' + target + ');}catch(e){}';
  var html = HtmlService.createHtmlOutput('<script>' + js + '</script>');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

// ── 冪等台帳（request_id） ─────────────────────────

function ledgerKey_(actor, action, requestId) {
  // request_id は論理操作に固有。actor/action は保存値と照合し、別 actor の使い回しは conflict。
  return IDEM_PREFIX + sha256Hex_('ledger\n' + String(requestId)).slice(0, 48);
}

/**
 * 戻り値: entry / null（無し・期限切れ） / {state:'corrupt'} / {state:'unavailable'}
 * 期限切れのみ削除し、TTL 内の receipt は絶対に消さない。
 */
function readLedgerEntry_(key) {
  var raw;
  try { raw = props_().getProperty(key); }
  catch (e0) { return { state: 'unavailable' }; }
  if (raw == null || raw === '') return null;
  var entry;
  try { entry = JSON.parse(raw); } catch (e) { return { state: 'corrupt' }; }
  if (!entry || typeof entry !== 'object' || typeof entry.state !== 'string' || !entry.state) {
    return { state: 'corrupt' };
  }
  var updatedAt = Number(entry.updatedAt);
  if (!isFinite(updatedAt) || updatedAt <= 0) return { state: 'corrupt' };
  if (Date.now() - updatedAt > IDEM_TTL_MS) {
    try { props_().deleteProperty(key); } catch (e2) {}
    return null;
  }
  return entry;
}

/** 期限切れだけを掃除し、件数・IDEM バイト数・対象キー・全 properties 合計を返す（getProperties 1回） */
function ledgerSnapshot_(targetKey) {
  var p = props_();
  var all = null;
  try { all = p.getProperties ? p.getProperties() : null; } catch (e0) { all = null; }
  var now = Date.now();
  var count = 0;
  var total = 0;
  var oldBytes = 0;
  var globalTotal = 0;
  if (all && typeof all === 'object') {
    for (var k in all) {
      if (!Object.prototype.hasOwnProperty.call(all, k)) continue;
      var value = String(all[k] == null ? '' : all[k]);
      var bytes = utf8Bytes_(k) + utf8Bytes_(value);
      if (k.indexOf(IDEM_PREFIX) !== 0) {
        globalTotal += bytes; // 設定・DEV など非IDEMも総量に含める
        continue;
      }
      var entry = null;
      try { entry = JSON.parse(value); } catch (e1) { entry = null; }
      var at = entry && Number(entry.updatedAt);
      if (entry && isFinite(at) && at > 0 && (now - at > IDEM_TTL_MS)) {
        try { p.deleteProperty(k); } catch (e2) {}
        continue;
      }
      count++;
      total += bytes;
      globalTotal += bytes;
      if (targetKey && k === targetKey) oldBytes = bytes;
    }
  } else {
    var keys = [];
    try { keys = p.getKeys(); } catch (e3) { keys = []; }
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var raw = null;
      try { raw = p.getProperty(key); } catch (e4) { raw = null; }
      if (raw == null) continue;
      var bytes2 = utf8Bytes_(key) + utf8Bytes_(raw);
      if (key.indexOf(IDEM_PREFIX) !== 0) {
        globalTotal += bytes2;
        continue;
      }
      var entry2 = null;
      try { entry2 = JSON.parse(raw); } catch (e5) { entry2 = null; }
      var at2 = entry2 && Number(entry2.updatedAt);
      if (entry2 && isFinite(at2) && at2 > 0 && (now - at2 > IDEM_TTL_MS)) {
        try { p.deleteProperty(key); } catch (e6) {}
        continue;
      }
      count++;
      total += bytes2;
      globalTotal += bytes2;
      if (targetKey && key === targetKey) oldBytes = bytes2;
    }
  }
  return { count: count, total: total, oldBytes: oldBytes, globalTotal: globalTotal };
}

function countLiveLedgerEntries_() {
  return ledgerSnapshot_(null).count;
}

function ledgerUsage_() {
  var snap = ledgerSnapshot_(null);
  return { count: snap.count, bytes: snap.total };
}

function utf8Bytes_(s) {
  var str = String(s == null ? '' : s);
  if (/^[\x00-\x7F]*$/.test(str)) return str.length;
  try {
    return Utilities.newBlob(str).getBytes().length;
  } catch (e) {
    return str.length * 3;
  }
}

/** 保存用に receipt を最小化（requestId/createdAt を保存せず、hash は32桁、failed は復旧metadataを落とす） */
function compactReceipt_(entry) {
  var out = {};
  out.actor = String(entry.actor || '');
  out.action = String(entry.action || '');
  out.payloadHash = String(entry.payloadHash || '').slice(0, 32);
  out.state = String(entry.state || '');
  out.updatedAt = Number(entry.updatedAt) || Date.now();
  out.attempts = Math.max(1, Number(entry.attempts) || 1);
  if (out.state !== 'failed') {
    if (entry.expectedName) out.expectedName = String(entry.expectedName).slice(0, 128);
    if (entry.expectedSize != null) out.expectedSize = Number(entry.expectedSize) || 0;
  }
  if (entry.result) out.result = entry.result;
  if (out.state === 'failed' && entry.error) out.error = String(entry.error).slice(0, 200);
  return out;
}

/**
 * receipt の書込み（新規・更新の両方）。key+value の UTF-8 バイト予算を毎回適用する。
 * 予算超過時は何も書かず false（既存値を維持し、receipt は消さない）。
 */
function writeLedgerReceipt_(key, entry) {
  var compact = compactReceipt_(entry);
  compact.updatedAt = Date.now();
  var value = JSON.stringify(compact);
  var newBytes = utf8Bytes_(key) + utf8Bytes_(value);
  if (newBytes > IDEM_MAX_RECEIPT_BYTES) return { ok: false, reason: 'receipt_too_large' };
  var snap = ledgerSnapshot_(key);
  if (snap.total - snap.oldBytes + newBytes > IDEM_BYTE_CEILING) {
    return { ok: false, reason: 'ledger_ceiling' };
  }
  // 設定・DEV を含む全 properties 合計でも上限を超えないこと（設定変更用の余裕を必ず残す）
  if (snap.globalTotal - snap.oldBytes + newBytes > PROP_TOTAL_CEILING) {
    return { ok: false, reason: 'ledger_ceiling' };
  }
  try {
    props_().setProperty(key, value);
  } catch (e) {
    return { ok: false, reason: 'write_failed' };
  }
  return { ok: true, value: value, bytes: newBytes };
}

/**
 * state: new（実行可）/ done / busy（in_flight）/ unknown（stale・未知 state・破損）/
 *        conflict（同一IDの別操作）/ ledger_full / unavailable
 */
function beginIdempotent_(actor, action, requestId, payloadHash, expectedName, expectedSize) {
  var key = ledgerKey_(actor, action, requestId);
  var hashKey = String(payloadHash || '').slice(0, 32);
  var actorKey = String(actor || '');
  return withScriptLock_(function () {
    var entry;
    try { entry = readLedgerEntry_(key); }
    catch (e0) { return { state: 'unavailable', key: key }; }
    if (entry && entry.state === 'unavailable') return { state: 'unavailable', key: key };
    if (entry && entry.state === 'corrupt') return { state: 'unknown', key: key };

    if (entry) {
      if (entry.actor != null && String(entry.actor) !== actorKey) return { state: 'conflict', key: key };
      if (entry.action != null && String(entry.action) !== String(action)) return { state: 'conflict', key: key };
      if (String(entry.payloadHash || '').slice(0, 32) !== hashKey) return { state: 'conflict', key: key };
      var state = String(entry.state || '');
      if (state === 'done') return { state: 'done', key: key, entry: entry };
      if (state === 'in_flight') {
        var age = Date.now() - Number(entry.updatedAt || 0);
        if (isFinite(age) && age < IDEM_STALE_MS) return { state: 'busy', key: key, entry: entry };
        return { state: 'unknown', key: key, entry: entry };
      }
      if (state === 'failed') {
        var retry = {
          actor: actorKey, action: action, payloadHash: hashKey,
          state: 'in_flight', updatedAt: Date.now(),
          attempts: (Number(entry.attempts) || 1) + 1,
          expectedName: entry.expectedName || expectedName || '',
          expectedSize: entry.expectedSize != null ? entry.expectedSize : (expectedSize != null ? expectedSize : null)
        };
        var retryWrite = writeLedgerReceipt_(key, retry);
        if (!retryWrite.ok) return { state: retryWrite.reason === 'ledger_ceiling' ? 'ledger_full' : 'unavailable', key: key };
        var retryVerify;
        try { retryVerify = readLedgerEntry_(key); } catch (e1) { retryVerify = null; }
        if (!retryVerify || retryVerify.state !== 'in_flight') return { state: 'unavailable', key: key };
        return { state: 'new', key: key, entry: retryVerify };
      }
      return { state: 'unknown', key: key, entry: entry };
    }

    var fresh = {
      actor: actorKey, action: action, payloadHash: hashKey,
      state: 'in_flight', updatedAt: Date.now(), attempts: 1,
      expectedName: expectedName || '',
      expectedSize: expectedSize != null ? expectedSize : null
    };
    var compact = compactReceipt_(fresh);
    var estimate = utf8Bytes_(key) + utf8Bytes_(JSON.stringify(compact));
    var snap = ledgerSnapshot_(key);
    if (snap.count >= IDEM_HARD_MAX_ENTRIES) return { state: 'ledger_full', key: key };
    if (snap.total + estimate > IDEM_BYTE_BUDGET) return { state: 'ledger_full', key: key };
    if (snap.globalTotal + estimate > PROP_TOTAL_CEILING) return { state: 'ledger_full', key: key };

    var wrote = writeLedgerReceipt_(key, fresh);
    if (!wrote.ok) {
      return { state: wrote.reason === 'ledger_ceiling' ? 'ledger_full' : 'unavailable', key: key };
    }

    var verify;
    try { verify = readLedgerEntry_(key); } catch (e2) { verify = null; }
    if (!verify || verify.state !== 'in_flight') return { state: 'unavailable', key: key };
    return { state: 'new', key: key, entry: verify };
  });
}

/** 成功の記録。予算・容量で拒否された場合は既存の in_flight を残す。 */
function finishIdempotentDone_(key, entry, result) {
  if (!entry) return false;
  var done = {};
  for (var k in entry) {
    if (Object.prototype.hasOwnProperty.call(entry, k)) done[k] = entry[k];
  }
  done.state = 'done';
  done.result = result || {};
  delete done.error;
  var written;
  try {
    written = withScriptLock_(function () { return writeLedgerReceipt_(key, done); }, 5000);
  } catch (e) {
    return false;
  }
  return !!(written && written.ok);
}

/** 失敗の記録。**副作用が確実に未実行**のときだけ呼ぶこと。 */
function finishIdempotentFailed_(key, entry, errMessage) {
  if (!entry) return false;
  var failed = {};
  for (var k in entry) {
    if (Object.prototype.hasOwnProperty.call(entry, k)) failed[k] = entry[k];
  }
  failed.state = 'failed';
  failed.error = String(errMessage || '').slice(0, 200);
  delete failed.result;
  var written;
  try {
    written = withScriptLock_(function () { return writeLedgerReceipt_(key, failed); }, 5000);
  } catch (e) {
    return false;
  }
  return !!(written && written.ok);
}

/** 副作用ゼロで終わった「今回の新規 attempt」だけを取り消す（台帳容量の枯渇防止） */
function abortIdempotent_(key, entry) {
  if (!key || !entry) return false;
  if (entry.state !== 'in_flight') return false;
  if (Number(entry.attempts || 1) !== 1) return false;
  try {
    return withScriptLock_(function () {
      var cur;
      try { cur = readLedgerEntry_(key); } catch (e0) { return false; }
      if (!cur || cur.state !== 'in_flight') return false;
      if (Number(cur.attempts || 1) !== 1) return false;
      if (String(cur.payloadHash || '') !== String(entry.payloadHash || '')) return false;
      try { props_().deleteProperty(key); } catch (e1) { return false; }
      return true;
    }, 5000);
  } catch (e2) {
    return false;
  }
}

// ── 日次上限（保存前予約・失敗時のみ戻し） ─────────────

function todayCountKey_() {
  var tz = 'Asia/Tokyo';
  try { tz = Session.getScriptTimeZone() || 'Asia/Tokyo'; } catch (e) {}
  return 'COUNT_' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function getTodayCount_() {
  var n = parseInt(props_().getProperty(todayCountKey_()) || '0', 10);
  return isFinite(n) ? n : 0;
}

function cleanupOldCounts_() {
  var p = props_();
  var today = todayCountKey_();
  p.getKeys().forEach(function (k) {
    if (k.indexOf('COUNT_') === 0 && k !== today) {
      try { p.deleteProperty(k); } catch (e) {}
    }
  });
}

/**
 * 保存前に日次枠を 1 つ予約する。上限超過・書込み失敗・lock 失敗は例外（＝保存しない）。
 * 予約したキーを返し、戻すときは必ずこのキーだけを対象にする。
 */
function reserveDailyQuota_() {
  return withScriptLock_(function () {
    var p = props_();
    cleanupOldCounts_();
    var key = todayCountKey_();
    var max = getMaxDay_();
    var used = parseInt(p.getProperty(key) || '0', 10);
    if (!isFinite(used) || used < 0) used = 0;
    if (used >= max) throw appError_('daily limit reached (' + max + '/day)', 'daily_limit');
    var next = String(used + 1);
    if (next.length > 512) throw appError_('日次カウンタが不正です', 'quota_state_invalid');
    try {
      p.setProperty(key, next);
    } catch (e1) {
      // 予約が永続化できていない場合は保存しない（部分カウントを残さない）
      throw appError_('日次カウンタを更新できないため保存しませんでした', 'quota_write_failed', true);
    }
    return { key: key };
  });
}

/** 保存失敗時だけ、予約したキーを 1 つ戻す（日付を跨いでも当日分を誤って減らさない） */
function refundDailyQuota_(reservation) {
  if (!reservation || !reservation.key) return;
  try {
    withScriptLock_(function () {
      var p = props_();
      var raw = p.getProperty(reservation.key);
      if (raw == null) return; // 既に清掃済み（日付跨ぎ）
      var used = parseInt(raw, 10);
      if (!isFinite(used) || used <= 0) return;
      p.setProperty(reservation.key, String(used - 1));
    });
  } catch (e) {}
}

// ── 表示・ログ ────────────────────────────────

function stamp_() {
  var tz = 'Asia/Tokyo';
  try { tz = Session.getScriptTimeZone() || 'Asia/Tokyo'; } catch (e) {}
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}

function noteOk_(detail) {
  try { props_().setProperty(PROP_LAST_OK, stamp_() + ' | ' + detail); } catch (e) {}
}

function noteErr_(msg) {
  try { props_().setProperty(PROP_LAST_ERROR, stamp_() + ' | ' + msg); } catch (e) {}
  try { console.error(msg); } catch (e2) {}
}

function gateLabel_() {
  var list = getAllowedList_();
  return list.length ? 'ON (' + list.length + ' accounts)' : 'OFF (writes denied)';
}

// ── Web アプリ ────────────────────────────────

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.poll) return handlePoll_(params);
  if (params.probe) return handleProbe_(params);
  // 公開 status は簡易 health のみ（last_ok / last_error の生文言は出さない）
  var html = HtmlService.createHtmlOutput(
    '<body style="font-family:sans-serif;padding:16px">'
    + '<h2 style="margin:0 0 8px">pdfdrop</h2>'
    + '<pre style="background:#f4f4f4;padding:12px;border-radius:8px;line-height:1.6">'
    + 'status     : ' + (getToken_() && getFolderId_() ? 'ready' : 'not configured')
    + '\ngate       : ' + gateLabel_()
    + '\nlimit      : ' + getTodayCount_() + '/' + getMaxDay_()
    + '</pre></body>'
  );
  html.setTitle('pdfdrop');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

/** 保存確認 poll。name（クライアントが送ったファイル名）で存在確認する。 */
function handlePoll_(p) {
  var cb = String(p.callback || '');
  var rid = normalizeRid_(p.rid);
  var result;
  var token = getToken_();
  if (!token || String(p.token || '') !== token) {
    result = { genkoPoll: true, found: false, error: 'bad token' };
  } else if (!getFolderId_()) {
    result = { genkoPoll: true, found: false, error: 'folder not configured' };
  } else {
    var name = sanitizeName_(p.poll);
    try {
      var found = DriveApp.getFolderById(getFolderId_()).getFilesByName(name).hasNext();
      result = { genkoPoll: true, found: found, name: name };
    } catch (err) {
      result = { genkoPoll: true, found: false, error: message_(err) };
    }
  }
  if (rid) result.rid = rid;
  if (!cb) return jsonOut_(result);
  if (!isValidCallback_(cb)) {
    return ContentService.createTextOutput('/*bad callback*/').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** 表示用 probe。身元は tokeninfo の厳格検証結果のみ。rid を必ず返す。 */
function handleProbe_(p) {
  p = p || {};
  var rid = normalizeRid_(p.rid);
  var parent = resolveParentOrigin_(p.parent_origin);
  var token = getToken_();
  var result;
  if (!token || String(p.token || '') !== token) {
    result = { genkoProbe: true, ok: false, error: 'bad token' };
  } else {
    var auth = verifyIdTokenStrict_(p.id_token);
    if (!auth.ok) {
      result = { genkoProbe: true, ok: false, error: 'noauth' };
    } else {
      result = {
        genkoProbe: true,
        ok: true,
        email_visible: true,
        masked: maskEmail_(auth.email),
        allowed: isAllowed_(auth.email)
      };
    }
  }
  if (rid) result.rid = rid;
  var cb = String(p.callback || '');
  if (cb) {
    if (!isValidCallback_(cb)) {
      return ContentService.createTextOutput('/*bad callback*/').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (parent.state === 'rejected') return jsonOut_(result);
  return postMessageOutput_('probe', rid, result, parent);
}

/**
 * PDF 保存 POST。本文は生 JSON と form-urlencoded の data= の両対応。
 * 順序: 共通トークン → 厳格検証 → ALLOWED_EMAILS → folder → request_id → 入力検証 → 冪等台帳 → 日次予約 → 保存。
 */
function doPost(e) {
  var params = (e && e.parameter) || {};
  var parsed = readJsonRequest_(e, MAX_BODY_CHARS);
  var body = parsed.body;
  var rid = normalizeRid_(params.rid) || extractHintFromRaw_(parsed.raw, 'rid');
  var ledgerKey = '';
  var ledgerEntry = null;
  var requestId = '';
  var name = '';

  try {
    if (!body) {
      if (parsed.error === 'payload_too_large') {
        return failureOutput_(params, parsed.raw, rid, { ok: false, error: 'payload too large', code: 'payload_too_large' });
      }
      if (params.probe || params.id_token) return handleProbe_(params);
      if (!String(parsed.raw || '').replace(/\s/g, '')) {
        return failureOutput_(params, parsed.raw, rid, { ok: false, error: 'no data', code: 'empty_body' });
      }
      return failureOutput_(params, parsed.raw, rid, { ok: false, error: 'JSON parse error', code: 'bad_json' });
    }
    if (!body.rid && params.rid) body.rid = params.rid;
    if (!body.parent_origin && params.parent_origin) body.parent_origin = params.parent_origin;
    if (body.probe) return handleProbe_(body);

    if (String(parsed.raw || '').length > MAX_BODY_CHARS) {
      throw appError_('payload too large', 'payload_too_large');
    }

    // 共通トークンは変更系の先頭で必須（未設定も拒否）
    var expected = getToken_();
    if (!expected) throw appError_('token not configured', 'token_not_configured');
    if (String(body.token || params.token || '') !== expected) throw appError_('bad token', 'bad_token');

    // 厳格検証（JWT デコード・email パラメータ・Session は使わない）
    var auth = verifyIdTokenStrict_(body.id_token || params.id_token || '');
    if (!auth.ok) throw appError_('not allowed (strict verification failed: ' + auth.error + ')', 'not_allowed');
    if (!isAllowed_(auth.email)) throw appError_('not allowed (' + maskEmail_(auth.email) + ')', 'not_allowed');

    var folderId = getFolderId_();
    if (!folderId) throw appError_('folder not configured', 'not_configured');

    requestId = normalizeRequestId_(body.request_id);
    if (!requestId) throw appError_('request_id が必要です', 'request_id_required');

    name = sanitizeName_(body.name);
    var b64 = typeof body.b64 === 'string' ? body.b64 : '';
    if (!b64) throw appError_('empty payload', 'empty_payload');
    if (b64.length > MAX_B64_CHARS) throw appError_('too large', 'too_large'); // デコード前にサイズ制限
    if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw appError_('invalid base64', 'bad_base64');

    var actor = 'user:' + auth.email;
    var payloadHash = sha256Hex_('pdfdrop\n' + b64 + '\n' + String(body.name || ''));
    // base64 から復号後サイズを先に見積もる（復旧時のメタデータ照合に使う）
    var expectedSize = (function () {
      var s = String(b64).replace(/\s+/g, '');
      var pad = (s.slice(-2) === '==') ? 2 : (s.slice(-1) === '=' ? 1 : 0);
      return Math.floor(s.length * 3 / 4) - pad;
    })();
    var begun = beginIdempotent_(actor, 'pdfdrop', requestId, payloadHash, name, expectedSize);
    if (begun.state === 'done') {
      var doneResult = (begun.entry && begun.entry.result) || {};
      return respond_(body, rid, {
        ok: true,
        name: doneResult.name || name,
        request_id: requestId,
        replayed: true
      });
    }
    if (begun.state === 'busy') {
      // 直近 in_flight: 実行中かもしれないので照合も再保存もしない
      throw appError_('同じ操作を処理中です。少し待って再送してください', 'in_flight', true);
    }
    if (begun.state === 'unknown') {
      // 保存だけ終わっている可能性を「名前の存在」で照合して回復する（存在＝成功の証拠。
      // 不在は未保存の証拠にしない）。自動再保存は絶対にしない。
      var expectedName = (begun.entry && begun.entry.expectedName) || name;
      var recoveredName = findSavedByName_(
        expectedName,
        requestId,
        begun.entry && begun.entry.expectedSize != null ? begun.entry.expectedSize : null
      );
      if (recoveredName) {
        finishIdempotentDone_(begun.key, begun.entry, { name: recoveredName });
        return respond_(body, rid, {
          ok: true,
          name: recoveredName,
          request_id: requestId,
          replayed: true,
          recovered: true
        });
      }
      throw appError_('保存結果を確認できませんでした。まず保存済みファイルをご確認ください（同じ request_id で再送しても二重保存はしません）', 'pending_unknown', true);
    }
    if (begun.state === 'conflict') throw appError_('同じ request_id が別の操作・別の内容で使われました', 'request_id_conflict');
    if (begun.state === 'ledger_full') throw appError_('処理台帳が満杯のため受け付けられません。時間をおいて再試行してください', 'ledger_full', true);
    if (begun.state === 'unavailable') throw appError_('処理台帳を記録できないため実行しませんでした', 'ledger_unavailable', true);
    ledgerKey = begun.key;
    ledgerEntry = begun.entry;

    var bytes;
    try {
      bytes = Utilities.base64Decode(String(b64).replace(/\s+/g, ''));
    } catch (eDecode) {
      abortIdempotent_(ledgerKey, ledgerEntry); // 副作用ゼロ
      ledgerKey = ''; ledgerEntry = null;
      throw appError_('invalid base64', 'bad_base64');
    }
    if (!bytes || !bytes.length) {
      abortIdempotent_(ledgerKey, ledgerEntry);
      ledgerKey = ''; ledgerEntry = null;
      throw appError_('empty payload', 'empty_payload');
    }
    if (bytes.length > MAX_BYTES) {
      abortIdempotent_(ledgerKey, ledgerEntry);
      ledgerKey = ''; ledgerEntry = null;
      throw appError_('too large (' + bytes.length + ' bytes)', 'too_large');
    }
    if (!isPdfBytes_(bytes)) {
      abortIdempotent_(ledgerKey, ledgerEntry);
      ledgerKey = ''; ledgerEntry = null;
      throw appError_('not a pdf', 'bad_pdf');
    }

    // 日次枠は保存前にロック内で予約。ここまで副作用ゼロなので、失敗時は receipt を戻す。
    var reservation;
    try {
      reservation = reserveDailyQuota_();
    } catch (errQuota) {
      abortIdempotent_(ledgerKey, ledgerEntry);
      ledgerKey = ''; ledgerEntry = null;
      throw errQuota;
    }

    // フォルダ取得は createFile より前なので「確実に未保存」。ここだけ refund してよい。
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (errFolder) {
      refundDailyQuota_(reservation);
      abortIdempotent_(ledgerKey, ledgerEntry);
      ledgerKey = ''; ledgerEntry = null;
      throw appError_('保存先フォルダを開けませんでした', 'folder_unavailable', true);
    }

    // createFile を呼び始めた後は、成功したか判別できない → 予約も in_flight も維持する
    var created;
    try {
      created = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    } catch (errSave) {
      throw appError_('保存結果を確認できませんでした（' + message_(errSave) + '）', 'save_uncertain', true);
    }
    // 復旧照合のためのメタデータ（request_id とサイズ）。失敗しても保存自体は成立している。
    try { created.setDescription('request_id=' + requestId + ';size=' + bytes.length); } catch (eDesc) {}

    noteOk_(name);
    finishIdempotentDone_(ledgerKey, ledgerEntry, { name: name });
    return respond_(body, rid, { ok: true, name: name, request_id: requestId });
  } catch (err) {
    var msg = message_(err);
    var code = (err && err.appCode) || 'error';
    var uncertain = (code === 'save_uncertain');
    // 保存結果不明は failed にしない（in_flight を維持し、同IDの再保存を禁止）
    if (ledgerKey && ledgerEntry && !uncertain) finishIdempotentFailed_(ledgerKey, ledgerEntry, msg);
    noteErr_('[' + (name || '?') + '] ' + msg);
    var payload = {
      ok: false,
      error: uncertain
        ? '保存結果を確認できませんでした。まず保存済みファイルをご確認ください（同じ request_id で再送しても二重保存はしません）。'
        : msg,
      code: uncertain ? 'pending_unknown' : code,
      retryable: uncertain ? true : !!(err && err.retryable)
    };
    if (requestId) payload.request_id = requestId;
    return respond_(body || {}, rid, payload);
  }
}

/**
 * Drive の説明（key=value;key=value）を厳密に parse する。
 * ・`;` 区切りの key=value のみ
 * ・同一キーの重複は不正（null を入れて以後一致しない）
 */
function parseDescriptionMeta_(desc) {
  var out = {};
  var parts = String(desc || '').split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var eq = part.indexOf('=');
    if (eq < 1) continue;
    var k = part.slice(0, eq).trim();
    var v = part.slice(eq + 1).trim();
    if (!k) continue;
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      out[k] = null; // 重複は無効
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** 期待する保存名のファイルが「この request_id の保存結果」であることを厳密確認して返す */
function findSavedByName_(name, requestId, size) {
  try {
    var it = DriveApp.getFolderById(getFolderId_()).getFilesByName(name);
    while (it.hasNext()) {
      var f = it.next();
      if (String(f.getName()) !== String(name)) continue;
      var desc = '';
      try { desc = String(f.getDescription() || ''); } catch (eDesc) { desc = ''; }
      var meta = parseDescriptionMeta_(desc);
      // request_id は完全一致のみ（prefix/suffix・重複・欠落は不可）
      if (!Object.prototype.hasOwnProperty.call(meta, 'request_id')) continue;
      if (meta.request_id !== String(requestId)) continue;
      if (size != null) {
        if (!Object.prototype.hasOwnProperty.call(meta, 'size')) continue;
        if (!/^\d{1,12}$/.test(String(meta.size))) continue;
        if (String(Number(size)) !== String(meta.size)) continue;
      }
      return String(name);
    }
  } catch (e) {}
  return '';
}

/**
 * 解析失敗などで body が無い場合の応答。probe/PDF の iframe クライアントには postMessage で返し、
 * それ以外は JSON。rid は常に echo する。
 */
function failureOutput_(params, raw, rid, payload) {
  var sample = String(raw || '');
  if (sample.indexOf('data=') !== -1) {
    var m0 = /(?:^|&)data=([^&]*)/.exec(sample);
    if (m0) {
      try { sample = decodeURIComponent(String(m0[1]).replace(/\+/g, ' ')); } catch (e0) {}
    }
  }
  var kind = '';
  if (params.probe) kind = 'probe';
  else if (/"probe"\s*:/.test(sample)) kind = 'probe';
  else if (/"b64"\s*:/.test(sample)) kind = 'pdf';
  if (!kind) return jsonOut_(payload);
  var parent = resolveParentOrigin_(params.parent_origin || extractHintFromRaw_(raw, 'parent_origin'));
  if (parent.state === 'rejected') return jsonOut_(payload);
  return postMessageOutput_(kind, rid, payload, parent);
}

function isPdfBytes_(bytes) {
  var magic = [0x25, 0x50, 0x44, 0x46, 0x2D]; // %PDF-
  if (!bytes || bytes.length < magic.length) return false;
  for (var i = 0; i < magic.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    if (b !== magic[i]) return false;
  }
  return true;
}

function sanitizeName_(v) {
  var name = String(v || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  if (name === '.pdf') name = 'genkoshi_' + requestIdSuffix_() + '.pdf';
  return name;
}

function requestIdSuffix_() {
  return String(Date.now()) + '_' + sha256Hex_(Utilities.getUuid() + '|' + Date.now()).slice(0, 8);
}

/** PDF 応答。失敗時も rid を必ず echo する。 */
function respond_(req, rid, payload) {
  var echoRid = rid || normalizeRid_(req && req.rid);
  payload.rid = echoRid;
  var parent = resolveParentOrigin_(req && req.parent_origin);
  if (parent.state === 'rejected') return jsonOut_(payload);
  return postMessageOutput_('pdf', echoRid, payload, parent);
}
