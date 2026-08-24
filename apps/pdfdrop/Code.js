var PROP_TOKEN = 'DROP_TOKEN';
var PROP_FOLDER_ID = 'DROP_FOLDER_ID';
var PROP_EMAILS = 'ALLOWED_EMAILS';
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
  return normalizeEmail_(Session.getActiveUser().getEmail());
}

function isAllowed_(email) {
  var list = getAllowedList_();
  if (!list.length) return true;
  return list.indexOf(email) !== -1;
}

function doGet() {
  var email = getEmail_();
  var list = getAllowedList_();
  var gate = list.length ? (isAllowed_(email) ? 'PASS' : 'REJECT') : 'OFF';
  var html = HtmlService.createHtmlOutput(
    '<body style="font-family:sans-serif;padding:16px">'
    + '<h2 style="margin:0 0 8px">pdfdrop status</h2>'
    + '<pre style="background:#f4f4f4;padding:12px;border-radius:8px;line-height:1.6">'
    + 'identity  : ' + (email ? maskEmail_(email) : '(invisible)')
    + '\nemail gate: ' + gate
    + '\ntoken     : ' + (getToken_() ? 'set' : 'NOT SET')
    + '\nfolder    : ' + (getFolderId_() ? 'set' : 'NOT SET')
    + '</pre></body>'
  );
  html.setTitle('pdfdrop');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

function doPost(e) {
  try {
    if (!e || !e.parameter || !e.parameter.data) throw Error('no data');
    var req = JSON.parse(e.parameter.data);
    var token = getToken_();
    if (!token || String(req.token) !== token) throw Error('bad token');
    var email = getEmail_();
    if (!isAllowed_(email)) throw Error('not allowed' + (email ? '' : ' (identity invisible)'));
    var folderId = getFolderId_();
    if (!folderId) throw Error('folder not configured');
    var bytes = Utilities.base64Decode(String(req.b64));
    if (!bytes.length) throw Error('empty payload');
    if (bytes.length > MAX_BYTES) throw Error('too large');
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50) throw Error('not a pdf');
    var name = sanitizeName_(req.name);
    DriveApp.getFolderById(folderId).createBlob(Utilities.newBlob(bytes, 'application/pdf', name));
    return respond_({ ok: true, name: name });
  } catch (err) {
    return respond_({ ok: false, error: String(err && err.message || err) });
  }
}

function sanitizeName_(v) {
  var name = String(v || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  if (name === '.pdf') name = 'genkoshi_' + Date.now() + '.pdf';
  return name;
}

function maskEmail_(email) {
  var i = email.indexOf('@');
  if (i < 1) return '*';
  return email.slice(0, 2) + '***' + email.slice(i);
}

function respond_(payload) {
  return HtmlService.createHtmlOutput(
    '<script>parent.postMessage({genko:true,payload:' + JSON.stringify(payload) + '},"*");</script>'
  );
}
