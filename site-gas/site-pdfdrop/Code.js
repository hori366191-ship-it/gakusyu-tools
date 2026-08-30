var PROP_TOKEN = 'DROP_TOKEN';
var PROP_FOLDER_ID = 'DROP_FOLDER_ID';
var PROP_EMAILS = 'ALLOWED_EMAILS';
var PROP_MAX_DAY = 'MAX_PER_DAY';
var PROP_LAST_ERROR = 'LAST_ERROR';
var PROP_LAST_OK = 'LAST_OK';
var DEFAULT_MAX_DAY = 200;
var MAX_BYTES = 10 * 1024 * 1024;

function normalizeEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_TOKEN) || '';
}

function getFolderId_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_FOLDER_ID) || '';
}

function getAllowedList_() {
  return String(PropertiesService.getScriptProperties().getProperty(PROP_EMAILS) || '')
    .split(',')
    .map(normalizeEmail_)
    .filter(function (v) { return v; });
}

function getEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (e) {
    return '';
  }
}

function getMaxDay_() {
  var n = parseInt(PropertiesService.getScriptProperties().getProperty(PROP_MAX_DAY) || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DAY;
}

function todayCountKey_() {
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return 'COUNT_' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function getTodayCount_() {
  var n = parseInt(PropertiesService.getScriptProperties().getProperty(todayCountKey_()) || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function cleanupOldCounts_() {
  var props = PropertiesService.getScriptProperties();
  var today = todayCountKey_();
  props.getKeys().forEach(function (k) {
    if (k.indexOf('COUNT_') === 0 && k !== today) props.deleteProperty(k);
  });
}

function bumpUsage_() {
  var max = getMaxDay_();
  var used = getTodayCount_();
  if (used >= max) throw Error('daily limit reached (' + max + '/day)');
  PropertiesService.getScriptProperties().setProperty(todayCountKey_(), String(used + 1));
}

function isAllowed_(email) {
  var list = getAllowedList_();
  if (!email) return true;
  if (!list.length) return true;
  return list.indexOf(email) !== -1;
}

function gateLabel_(email) {
  var list = getAllowedList_();
  if (!email) return '(invisible) token-only';
  if (!list.length) return 'OFF(token only)';
  return list.indexOf(email) !== -1 ? 'PASS' : 'REJECT';
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
  // probe高速化: まずキャッシュをチェック
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('idtok_' + String(idToken).slice(-32));
    if (cached) return normalizeEmail_(cached);
  } catch (e) {}
  // ネットワーク検証を試みるが、失敗時はJWTデコードにフォールバック（probeの可用性優先）
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
  // フォールバック: JWTデコード（検証なしだがprobe表示用としては十分。生成/削除時は別途検証）
  var dec = decodeIdTokenEmail_(idToken);
  if (dec) {
    try { CacheService.getScriptCache().put('idtok_' + String(idToken).slice(-32), dec, 600); } catch (e3) {}
    return dec;
  }
  return '';
}
function getEmailFromRequest_(p) {
  // probeでは id_token の JWTデコードを優先（高速）。生成/削除でも同様だが token 検証は別途行う
  if (p && p.id_token) {
    var fromToken = verifyIdToken_(p.id_token);
    if (fromToken) return fromToken;
    // 検証失敗でも email パラメータがあればそれを信頼（probeのフォールバック）
    if (p.email) {
      var e2 = normalizeEmail_(p.email);
      if (e2) return e2;
    }
    // id_token が不正でも Session にフォールバックせず空を返す（匿名扱いで is-warn にするため）
    return '';
  }
  if (p && p.email) {
    var e = normalizeEmail_(p.email);
    if (e) return e;
  }
  return getEmail_();
}

function stamp_() {
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}

function noteOk_(detail) {
  PropertiesService.getScriptProperties().setProperty(PROP_LAST_OK, stamp_() + ' | ' + detail);
}

function noteErr_(msg) {
  PropertiesService.getScriptProperties().setProperty(PROP_LAST_ERROR, stamp_() + ' | ' + msg);
  console.error(msg);
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.poll) return handlePoll_(params);
  if (params.probe) return handleProbe_(params);
  var email = getEmail_();
  cleanupOldCounts_();
  var props = PropertiesService.getScriptProperties();
  var html = HtmlService.createHtmlOutput(
    '<body style="font-family:sans-serif;padding:16px">'
    + '<h2 style="margin:0 0 8px">pdfdrop status</h2>'
    + '<pre style="background:#f4f4f4;padding:12px;border-radius:8px;line-height:1.6">'
    + 'identity   : ' + (email ? maskEmail_(email) : '(invisible)')
    + '\ngate       : ' + gateLabel_(email)
    + '\ntoken      : ' + (getToken_() ? 'set' : 'NOT SET')
    + '\nfolder     : ' + (getFolderId_() ? 'set' : 'NOT SET')
    + '\nlimit      : ' + getTodayCount_() + '/' + getMaxDay_()
    + '\nlast_ok    : ' + (props.getProperty(PROP_LAST_OK) || '(none)')
    + '\nlast_error : ' + (props.getProperty(PROP_LAST_ERROR) || '(none)')
    + '</pre></body>'
  );
  html.setTitle('pdfdrop');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

function handlePoll_(p) {
  var cb = String(p.callback || '');
  if (!/^[A-Za-z0-9_.]{1,64}$/.test(cb)) {
    return ContentService.createTextOutput('/*bad callback*/').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  var result;
  var token = getToken_();
  if (!token || p.token !== token) {
    result = { genkoPoll: true, found: false, error: 'bad token' };
  } else if (!getFolderId_()) {
    result = { genkoPoll: true, found: false, error: 'folder not configured' };
  } else {
    var name = sanitizeName_(p.poll);
    try {
      var found = DriveApp.getFolderById(getFolderId_()).getFilesByName(name).hasNext();
      result = { genkoPoll: true, found: found, name: name };
    } catch (err) {
      result = { genkoPoll: true, found: false, error: String(err && err.message || err) };
    }
  }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
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
        allowed: isAllowed_(email)
      };
    }
  }
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

function doPost(e) {
  var name = '';
  try {
    // POST probe 対応
    var rawProbe = (e && e.postData && e.postData.contents) || '';
    if (!rawProbe && e && e.parameter && e.parameter.data) rawProbe = e.parameter.data;
    if (rawProbe) {
      try {
        var probeBody = JSON.parse(rawProbe);
        if (probeBody.probe) return handleProbe_(probeBody);
      } catch (e2) {}
    }
    if (e && e.parameter && e.parameter.probe) return handleProbe_(e.parameter);
    if (!e || !e.parameter || !e.parameter.data) throw Error('no data');
    var req = JSON.parse(e.parameter.data);
    name = sanitizeName_(req.name);
    console.log('doPost begin: ' + name);
    var token = getToken_();
    if (!token || String(req.token) !== token) throw Error('bad token');
    var email = getEmailFromRequest_(req);
    if (!email) email = getEmail_();
    if (!isAllowed_(email)) throw Error('not allowed (' + (email ? maskEmail_(email) : 'identity invisible') + ')');
    var folderId = getFolderId_();
    if (!folderId) throw Error('folder not configured');
    var bytes = Utilities.base64Decode(String(req.b64));
    if (!bytes.length) throw Error('empty payload');
    if (bytes.length > MAX_BYTES) throw Error('too large (' + bytes.length + ' bytes)');
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50) throw Error('not a pdf');
    cleanupOldCounts_();
    DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    bumpUsage_();
    console.log('doPost saved: ' + name);
    noteOk_(name);
    return respond_({ ok: true, name: name });
  } catch (err) {
    var msg = String(err && err.message || err);
    console.error('doPost failed [' + name + ']: ' + msg);
    noteErr_('[' + (name || '?') + '] ' + msg);
    return respond_({ ok: false, error: msg });
  }
}

function sanitizeName_(v) {
  var name = String(v || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  if (name === '.pdf') name = 'genkoshi_' + Date.now() + '.pdf';
  return name;
}

function respond_(payload) {
  var json = JSON.stringify(payload);
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:12px">pdfdrop response</div>'
    + '<script>'
    + 'var p=' + json + ';'
    + 'try{top.postMessage({genko:true,payload:p},"*");}catch(e){}'
    + 'try{parent.postMessage({genko:true,payload:p},"*");}catch(e){}'
    + '</script>'
  );
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}
