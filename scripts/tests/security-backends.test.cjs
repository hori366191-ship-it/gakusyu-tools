'use strict';
/**
 * scripts/tests/security-backends.test.cjs
 *
 * site-gas/site-app2-backend/Code.js と site-gas/site-pdfdrop/Code.js の
 * 認証 / 認可 / 冪等性 / 上限 / moderation / legacy 移行 の回帰テスト。
 *
 * ・外部 API・GAS 実行・実 Drive は一切呼ばない（すべて vm 上の fake）
 * ・実行: node scripts/tests/security-backends.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const APP2_PATH = path.join(ROOT, 'site-gas', 'site-app2-backend', 'Code.js');
const PDFDROP_PATH = path.join(ROOT, 'site-gas', 'site-pdfdrop', 'Code.js');
const APP2_SRC = fs.readFileSync(APP2_PATH, 'utf8');
const PDFDROP_SRC = fs.readFileSync(PDFDROP_PATH, 'utf8');

const TOKEN = 'test-token-0123456789';
const CLIENT_ID = '920000857743-91jfqq1q45hmnas1b25ebg0dqafo846i.apps.googleusercontent.com';
const TEACHER = 'teacher@example.com';
const STUDENT = 'student@example.com';

// ────────────────────────────── fakes ──────────────────────────────

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function formatDate(date, tz, fmt) {
  const offsetMinutes = tz === 'Asia/Tokyo' ? 9 * 60 : 0;
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const map = {
    yyyy: String(shifted.getUTCFullYear()),
    MM: p(shifted.getUTCMonth() + 1),
    dd: p(shifted.getUTCDate()),
    HH: p(shifted.getUTCHours()),
    mm: p(shifted.getUTCMinutes()),
    ss: p(shifted.getUTCSeconds()),
  };
  return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss/g, (m) => map[m]);
}

function signedBytes(buf) {
  return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
}

function makeBlob(data, mime, name) {
  let buf;
  if (typeof data === 'string') buf = Buffer.from(data, 'utf8');
  else buf = Buffer.from(Array.from(data).map((b) => (b < 0 ? b + 256 : b)));
  return {
    _buf: buf,
    _mime: mime || 'text/plain',
    _name: name || '',
    getDataAsString() { return buf.toString('utf8'); },
    getBytes() { return signedBytes(buf); },
    getName() { return this._name; },
    getMimeType() { return this._mime; },
  };
}

function makeOutput(text) {
  return {
    _text: String(text),
    _mime: 'text/plain',
    setMimeType(m) { this._mime = m; return this; },
    getContent() { return this._text; },
    getMimeType() { return this._mime; },
  };
}

function makeHtml(html) {
  return {
    _html: String(html),
    setTitle() { return this; },
    setXFrameOptionsMode() { return this; },
    setSandboxMode() { return this; },
    getContent() { return this._html; },
  };
}

function createDrive() {
  const folders = new Map();
  const files = new Map();
  let seq = 0;
  const nextId = (p) => p + (++seq);

  function iterator(items) {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  }
  function makeFile(obj) {
    return {
      getId: () => obj.id,
      getName: () => obj.name,
      getBlob: () => makeBlob(obj.content, obj.mime, obj.name),
      setContent: (c) => { obj.content = String(c); return this; },
      setTrashed: (v) => { obj.trashed = !!v; return this; },
      setDescription: (d) => { obj.description = String(d); return this; },
      getDescription: () => String(obj.description || ''),
    };
  }
  function makeFolder(obj) {
    return {
      getId: () => obj.id,
      getName: () => obj.name,
      getFilesByName(name) {
        return iterator(Array.from(files.values())
          .filter((f) => f.folderId === obj.id && !f.trashed && f.name === name)
          .map(makeFile));
      },
      getFiles() {
        return iterator(Array.from(files.values())
          .filter((f) => f.folderId === obj.id && !f.trashed)
          .map(makeFile));
      },
      getFoldersByName(name) {
        return iterator(Array.from(folders.values())
          .filter((f) => f.parentId === obj.id && f.name === name)
          .map(makeFolder));
      },
      createFile(a, b, c) {
        if (this.failCreateFile || drive.failNextCreateFile) {
          drive.failNextCreateFile = false;
          throw new Error('drive quota exceeded (simulated)');
        }
        let name, content, mime;
        if (a && typeof a === 'object' && typeof a.getDataAsString === 'function') {
          name = a.getName() || 'blob.pdf';
          content = a._buf.toString('utf8');
          mime = a.getMimeType();
        } else {
          name = String(a);
          content = String(b == null ? '' : b);
          mime = c || 'text/plain';
        }
        const f = { id: nextId('file'), name, content, mime, folderId: obj.id, trashed: false };
        files.set(f.id, f);
        return makeFile(f);
      },
      createFolder(name) {
        return makeFolder(drive.createFolderObj(name, obj.id));
      },
    };
  }

  const drive = {
    failNextCreateFile: false,
    createFolderObj(name, parentId) {
      const f = { id: nextId('folder'), name, parentId: parentId || null };
      folders.set(f.id, f);
      return makeFolder(f);
    },
    api: {
      getFoldersByName(name) {
        return iterator(Array.from(folders.values()).filter((f) => f.name === name && !f.parentId).map(makeFolder));
      },
      createFolder(name) {
        return drive.createFolderObj(name, null);
      },
      getFolderById(id) {
        const f = folders.get(id);
        if (!f) throw new Error('folder not found: ' + id);
        return makeFolder(f);
      },
      getFileById(id) {
        const f = files.get(id);
        if (!f) throw new Error('file not found: ' + id);
        return makeFile(f);
      },
    },
    // test helpers
    ensureFolder(name) {
      const found = Array.from(folders.values()).find((f) => f.name === name && !f.parentId);
      if (found) return found.id;
      return drive.createFolderObj(name, null).getId();
    },
    addFile(folderName, name, content) {
      const folderId = drive.ensureFolder(folderName);
      const f = { id: nextId('file'), name, content: String(content), mime: 'text/plain', folderId, trashed: false };
      files.set(f.id, f);
      return f;
    },
    files() {
      return Array.from(files.values());
    },
    activeFiles() {
      return Array.from(files.values()).filter((f) => !f.trashed);
    },
    findByName(name) {
      return Array.from(files.values()).find((f) => f.name === name && !f.trashed) || null;
    },
    setContentByName(name, content) {
      const f = drive.findByName(name);
      if (!f) throw new Error('file not found: ' + name);
      f.content = String(content);
      return f;
    },
  };
  return drive;
}

function createNet() {
  const tokeninfo = new Map();
  const ai = [];
  const calls = [];

  function response(code, text) {
    return { getResponseCode: () => code, getContentText: () => text };
  }

  return {
    tokeninfo,
    ai,
    calls,
    handler(url, opts) {
      calls.push({ url: String(url), opts: opts || {} });
      const u = String(url);
      if (u.indexOf('https://oauth2.googleapis.com/tokeninfo') === 0) {
        const token = decodeURIComponent(u.split('id_token=')[1] || '');
        const resp = tokeninfo.get(token);
        if (!resp) return response(400, '{"error":"invalid_token"}');
        if (resp.throw) throw new Error('network down');
        return response(resp.code || 200, typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body));
      }
      if (u.indexOf('https://ollama.com/api/chat') === 0) {
        const next = ai.length ? ai.shift() : { code: 500, body: { error: 'no queued ai response' } };
        if (next.throw) throw new Error('ai network down');
        return response(next.code || 200, typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
      }
      return response(404, '{}');
    },
    aiCalls() {
      return calls.filter((c) => c.url.indexOf('https://ollama.com/api/chat') === 0).length;
    },
    tokeninfoCalls() {
      return calls.filter((c) => c.url.indexOf('https://oauth2.googleapis.com/tokeninfo') === 0).length;
    },
    registerToken(token, claims) {
      const now = Math.floor(Date.now() / 1000);
      tokeninfo.set(token, {
        code: 200,
        body: Object.assign({
          aud: CLIENT_ID,
          iss: 'https://accounts.google.com',
          exp: now + 3600,
          email_verified: 'true',
        }, claims || {}),
      });
    },
    registerRaw(token, resp) {
      tokeninfo.set(token, resp);
    },
  };
}

function createRuntime(source, initialProps, file) {
  const props = new Map(Object.entries(initialProps || {}));
  const cache = new Map();
  const drive = createDrive();
  const net = createNet();
  const decode = { calls: 0 };
  const logs = [];
  const byteLen = (s) => Buffer.byteLength(String(s), 'utf8');
  const limits = { propsBytes: Infinity };
  let propsBytes = 0;
  for (const [k, v] of props) propsBytes += byteLen(k) + byteLen(v);

  const utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF-8' },
    computeDigest(alg, value) {
      return signedBytes(crypto.createHash('sha256').update(String(value), 'utf8').digest());
    },
    base64Decode(input) {
      decode.calls += 1;
      const cleaned = String(input).replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) throw new Error('bad base64');
      return signedBytes(Buffer.from(cleaned, 'base64'));
    },
    base64Encode(data) {
      return Buffer.from(Array.from(data).map((b) => (b < 0 ? b + 256 : b))).toString('base64');
    },
    newBlob: makeBlob,
    getUuid: () => crypto.randomUUID(),
    formatDate,
  };

  const sandbox = {
    console: {
      log: (...a) => logs.push(a.join(' ')),
      warn: (...a) => logs.push(a.join(' ')),
      error: (...a) => logs.push(a.join(' ')),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => {
          const key = String(k);
          const val = String(v);
          const old = props.has(key) ? props.get(key) : null;
          const delta = byteLen(key) + byteLen(val) - (old === null ? 0 : byteLen(key) + byteLen(old));
          if (propsBytes + delta > limits.propsBytes) {
            throw new Error('simulated properties quota exceeded (500KB)');
          }
          propsBytes += delta;
          props.set(key, val);
        },
        deleteProperty: (k) => {
          const key = String(k);
          if (!props.has(key)) return;
          propsBytes -= byteLen(key) + byteLen(props.get(key));
          props.delete(key);
        },
        getKeys: () => Array.from(props.keys()),
        getProperties: () => {
          const out = {};
          for (const [k, v] of props) out[k] = v;
          return out;
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          const e = cache.get(k);
          if (!e) return null;
          if (typeof e.exp === 'number' && e.exp <= Date.now()) { cache.delete(k); return null; }
          return e.v;
        },
        put: (k, v, ttl) => {
          const sec = Number(ttl) || 0;
          cache.set(k, { v: String(v), ttl: sec, storedAt: Date.now(), exp: Date.now() + sec * 1000 });
        },
        remove: (k) => { cache.delete(k); },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    UrlFetchApp: { fetch: (url, opts) => net.handler(url, opts) },
    Utilities: utilities,
    Session: {
      getActiveUser: () => ({ getEmail: () => '' }),
      getScriptTimeZone: () => 'Asia/Tokyo',
    },
    DriveApp: drive.api,
    ContentService: {
      createTextOutput: makeOutput,
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript', PLAIN_TEXT: 'text/plain' },
    },
    HtmlService: {
      createHtmlOutput: makeHtml,
      XFrameOptionsMode: { ALLOWALL: 1 },
      SandboxMode: { IFRAME: 2 },
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://example.invalid/exec' }) },
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: file });

  return {
    ctx: sandbox,
    props,
    cache,
    drive,
    net,
    decode,
    logs,
    setPropsByteLimit(limit) { limits.propsBytes = Number(limit) || Infinity; },
    propsByteUsage() { return propsBytes; },
    get(params) {
      return parseOutput(sandbox.doGet({ parameter: params || {} }));
    },
    postJson(body) {
      return parseOutput(sandbox.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } }));
    },
    postForm(body) {
      const raw = JSON.stringify(body);
      return parseOutput(sandbox.doPost({
        parameter: { data: raw },
        postData: { contents: 'data=' + encodeURIComponent(raw) },
      }));
    },
    postRaw(raw, extraParams) {
      return parseOutput(sandbox.doPost({ parameter: extraParams || {}, postData: { contents: raw } }));
    },
    postParams(params, raw) {
      return parseOutput(sandbox.doPost({ parameter: params || {}, postData: { contents: raw || '' } }));
    },
  };
}

function parseOutput(out) {
  const isHtml = !!(out && out._html !== undefined);
  const text = out && typeof out.getContent === 'function' ? out.getContent() : String(out);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // JSONP（callback({...})）も JSON として読む
    const m = /^[A-Za-z_$][A-Za-z0-9_$.]*\(([\s\S]*)\)\s*$/.exec(String(text).trim());
    if (m) { try { json = JSON.parse(m[1]); } catch (e2) { json = null; } }
  }
  return { text, json, isHtml, mime: out && out._mime, out };
}

// ────────────────────────────── helpers ──────────────────────────────

function rid(seed) {
  const base = seed ? String(seed) : crypto.randomUUID().replace(/-/g, '');
  return (base + '0123456789abcdef0123456789abcdef').slice(0, 32);
}

function forgedJwt(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return enc({ alg: 'none', typ: 'JWT' }) + '.' + enc(claims) + '.' + 'sig';
}

function chatReply(content, extra) {
  return {
    code: 200,
    body: Object.assign({
      model: 'gemma4:31b',
      created_at: '2026-10-27T00:00:00Z',
      message: { role: 'assistant', content: String(content) },
      done: true,
      done_reason: 'stop',
    }, extra || {}),
  };
}
function genOk(text) {
  return chatReply(text || 'A Cat Story\n\nA cat sat on a mat. The cat was happy.');
}
function modOk() {
  return chatReply('OK');
}
function modNg(reason) {
  return chatReply('NG:' + (reason || 'inappropriate'));
}

const BASE_SETTINGS = {
  level: '3級',
  wordCount: 300,
  world: '学校',
  style: '説明文',
  textType: '物語',
  genre: '日常',
  development: '起承転結',
  ending: 'ハッピーエンド',
  keywords: ['cat'],
  prompt: '',
};

const RECORD_TEXT = 'A Cat Story\n\nA cat sat on a mat. The cat was happy.';

function setupApp2(opts) {
  opts = opts || {};
  const rt = createRuntime(APP2_SRC, Object.assign({
    DROP_TOKEN: TOKEN,
    ALLOWED_EMAILS: TEACHER,
    OWNER_EMAIL: TEACHER,
    OLLAMA_API_KEY: 'test-key',
    OPEN_GENERATE: 'false',
  }, opts.props || {}), APP2_PATH);
  return rt;
}

function setupPdfdrop(opts) {
  opts = opts || {};
  return createRuntime(PDFDROP_SRC, Object.assign({
    DROP_TOKEN: TOKEN,
    ALLOWED_EMAILS: TEACHER,
  }, opts.props || {}), PDFDROP_PATH);
}

function tokenFor(rt, email, extra) {
  const token = 'idt-' + sha256Hex(email + '|' + Math.random()).slice(0, 24);
  rt.net.registerToken(token, Object.assign({ email }, extra || {}));
  return token;
}

function genBody(rt, overrides) {
  return Object.assign({
    action: 'generateText',
    token: TOKEN,
    id_token: tokenFor(rt, TEACHER),
    request_id: rid(),
    settings: Object.assign({}, BASE_SETTINGS),
    device_id: 'd-abcdefgh1234567',
  }, overrides || {});
}

function todayCountKey() {
  return 'COUNT_' + formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function genStateCount(rt) {
  const raw = rt.props.get('GEN_STATE') || '';
  const m = /^(\d{8}):(\d+)$/.exec(raw);
  return m ? Number(m[2]) : 0;
}

function savedCount(rt) {
  const f = rt.drive.findByName('tadoku-index.json');
  if (!f) return 0;
  return (JSON.parse(f.content).items || []).length;
}

// ────────────────────────────── app2: 認証 ──────────────────────────────

test('app2 probe: 署名未検証JWT（tokeninfo未登録）は noauth', () => {
  const rt = setupApp2();
  const jwt = forgedJwt({ email: TEACHER, aud: CLIENT_ID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true });
  const res = rt.get({ probe: '1', token: TOKEN, id_token: jwt, callback: '__cb' });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error, 'noauth');
  assert.equal(res.json.allowed, undefined);
  assert.ok(res.text.indexOf(TEACHER) === -1, 'probe 応答にメール全文を含めない');
});

test('app2 probe: 正規トークンは ok と masked を返す', () => {
  const rt = setupApp2();
  const token = tokenFor(rt, TEACHER);
  const res = rt.get({ probe: '1', token: TOKEN, id_token: token, callback: '__cb' });
  assert.equal(res.json.ok, true);
  assert.equal(res.json.allowed, true);
  assert.equal(res.json.is_owner, true);
  assert.equal(res.json.masked, 'te***@example.com');
});

test('app2 probe: 期限切れ / aud 相違 / iss 相違 / email_verified false / email欠落 は拒否', () => {
  const cases = [
    { exp: Math.floor(Date.now() / 1000) - 10, email: TEACHER },
    { aud: 'other-client', email: TEACHER },
    { iss: 'https://evil.example.com', email: TEACHER },
    { email_verified: 'false', email: TEACHER },
    { email_verified: false, email: TEACHER },
    { email: '' },
  ];
  for (const claims of cases) {
    const rt = setupApp2();
    const token = 'tok-' + sha256Hex(JSON.stringify(claims)).slice(0, 20);
    rt.net.registerToken(token, claims);
    const res = rt.get({ probe: '1', token: TOKEN, id_token: token, callback: '__cb' });
    assert.equal(res.json.ok, false, 'reject: ' + JSON.stringify(claims));
    assert.equal(res.json.error, 'noauth');
  }
});

test('app2 probe: email パラメータだけでは認可されない', () => {
  const rt = setupApp2();
  const res = rt.get({ probe: '1', token: TOKEN, email: TEACHER, callback: '__cb' });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error, 'noauth');
});

test('app2 probe: tokeninfo 例外 / 400 / 500 は拒否', () => {
  for (const resp of [{ throw: true }, { code: 400, body: '{"error":"invalid"}' }, { code: 500, body: '{}' }, { code: 200, body: 'not-json' }]) {
    const rt = setupApp2();
    const token = 'tok-' + sha256Hex(JSON.stringify(resp)).slice(0, 20);
    rt.net.registerRaw(token, resp);
    const res = rt.get({ probe: '1', token: TOKEN, id_token: token, callback: '__cb' });
    assert.equal(res.json.ok, false, 'reject: ' + JSON.stringify(resp));
  }
});

test('app2 認証キャッシュ: 同一トークンは再照会しない / 別トークンは照会 / TTLはexp以下 / 期限切れキャッシュは再検証', () => {
  const rt = setupApp2();
  const token = tokenFor(rt, TEACHER);
  const exp = Math.floor(Date.now() / 1000) + 3600;

  rt.get({ probe: '1', token: TOKEN, id_token: token, callback: '__cb' });
  assert.equal(rt.net.tokeninfoCalls(), 1);
  rt.get({ probe: '1', token: TOKEN, id_token: token, callback: '__cb' });
  assert.equal(rt.net.tokeninfoCalls(), 1, '同一トークンはキャッシュヒット');

  const entries = Array.from(rt.cache.entries()).filter(([k]) => k.indexOf('gauth_tok_') === 0);
  assert.equal(entries.length, 1);
  const cached = JSON.parse(entries[0][1].v);
  assert.equal(cached.email, TEACHER);
  assert.ok(cached.exp <= exp, 'exp を保存している');
  assert.ok(entries[0][1].ttl > 0 && entries[0][1].ttl <= exp - Math.floor(Date.now() / 1000) + 1, 'TTL は exp 以下');

  // 別トークンは別キー（未登録なので拒否され、照会が増える）
  const other = forgedJwt({ email: TEACHER });
  const res = rt.get({ probe: '1', token: TOKEN, id_token: other, callback: '__cb' });
  assert.equal(res.json.ok, false);
  assert.equal(rt.net.tokeninfoCalls(), 2);

  // キャッシュ期限切れ（exp が過去）はキャッシュヒットにせず拒否
  const expiredKey = 'gauth_tok_' + sha256Hex(token);
  rt.cache.set(expiredKey, { v: JSON.stringify({ email: TEACHER, exp: Math.floor(Date.now() / 1000) - 5 }), ttl: 60, exp: Date.now() + 60000 });
  const before = rt.net.tokeninfoCalls();
  const res2 = rt.get({ probe: '1', token: TOKEN, id_token: token, callback: '__cb' });
  assert.equal(res2.json.ok, false, 'exp 切れキャッシュは拒否');
  assert.equal(rt.net.tokeninfoCalls(), before, '期限切れキャッシュでは再照会しない（安全側で拒否）');
});

// ────────────────────────────── app2: 公開面 / 入力 ──────────────────────────────

test('app2: doGet/doPost 以外は private（末尾 _）で、旧HTML配信が無い', () => {
  const names = [...APP2_SRC.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]);
  const publicNames = names.filter((n) => !/_$/.test(n));
  assert.deepEqual(publicNames.sort(), ['doGet', 'doPost']);
  assert.equal(APP2_SRC.indexOf('createTemplateFromFile'), -1);
  assert.equal(APP2_SRC.indexOf('google.script.run'), -1);

  const pdfNames = [...PDFDROP_SRC.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]);
  assert.deepEqual(pdfNames.filter((n) => !/_$/.test(n)).sort(), ['doGet', 'doPost']);
});

test('app2: 共通トークン未設定・不一致は書込み拒否（AI呼出なし）', () => {
  const rt = setupApp2();
  const res = rt.postJson(genBody(rt, { token: 'wrong-token-000000' }));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'bad_token');
  assert.equal(rt.net.aiCalls(), 0);
});

test('app2: ALLOWED_EMAILS 空は書込み拒否（OPEN_GENERATE=false）', () => {
  const rt = setupApp2({ props: { ALLOWED_EMAILS: '' } });
  const res = rt.postJson(genBody(rt));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'not_allowed');
  assert.equal(rt.net.aiCalls(), 0);
});

test('app2: request_id 欠落・不正は拒否', () => {
  const rt = setupApp2();
  const res = rt.postJson(genBody(rt, { request_id: '' }));
  assert.equal(res.json.code, 'request_id_required');
  const res2 = rt.postJson(genBody(rt, { request_id: 'short' }));
  assert.equal(res2.json.code, 'request_id_required');
  assert.equal(rt.net.aiCalls(), 0);
});

test('app2: 入力検証（level / 語数 / prompt長 / キーワード）は API 前に拒否', () => {
  const rt = setupApp2();
  const bad = [
    { level: '99級' },
    { wordCount: 99999 },
    { prompt: 'x'.repeat(2000) },
    { keywords: Array.from({ length: 20 }, (_, i) => 'kw' + i) },
  ];
  for (const over of bad) {
    const res = rt.postJson(genBody(rt, { settings: Object.assign({}, BASE_SETTINGS, over) }));
    assert.equal(res.json.ok, false, 'reject: ' + JSON.stringify(over).slice(0, 60));
    assert.equal(res.json.code, 'invalid_settings');
  }
  assert.equal(rt.net.aiCalls(), 0);
  assert.equal(genStateCount(rt), 0, '無効入力では枠を消費しない');
});

test('app2: 匿名生成は form-urlencoded でも通り、AI 2回（生成+審査）で保存される', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  const res = rt.postForm(genBody(rt, { id_token: '' }));
  assert.equal(res.json.ok, true);
  assert.ok(res.json.item.id.startsWith('tadoku-'));
  assert.equal(rt.net.aiCalls(), 2);
  assert.equal(genStateCount(rt), 1);
});

test('app2: 同一 request_id の再送は AI も回数も増やさず同じ record を返す', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const requestId = rid('resend');
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  const first = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(first.json.ok, true);
  const id = first.json.item.id;
  const aiAfterFirst = rt.net.aiCalls();

  const second = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(second.json.ok, true);
  assert.equal(second.json.replayed, true);
  assert.equal(second.json.item.id, id);
  assert.equal(second.json.item.title, 'A Cat Story', '保存済みタイトルを返す');
  assert.equal(second.json.item.text, 'A cat sat on a mat. The cat was happy.', '保存済み本文を返す');
  assert.equal(rt.net.aiCalls(), aiAfterFirst, 'AI を再実行しない');
  assert.equal(genStateCount(rt), 1, '回数を再加算しない');
  assert.equal(rt.drive.activeFiles().filter((f) => f.name === 'tadoku-index.json').length, 1);
});

test('app2: 同一 request_id で内容が違えば conflict（AI呼出なし）', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const requestId = rid('conflict');
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt.postJson(genBody(rt, { request_id: requestId })).json.ok, true);
  const aiBefore = rt.net.aiCalls();
  const res = rt.postJson(genBody(rt, {
    request_id: requestId,
    settings: Object.assign({}, BASE_SETTINGS, { wordCount: 500 }),
  }));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'request_id_conflict');
  assert.equal(rt.net.aiCalls(), aiBefore);
});

test('app2: 端末上限は API 前に予約され、超過時は AI を呼ばない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true', MAX_GEN_PER_DEVICE: '2' } });
  for (let i = 0; i < 2; i++) {
    rt.net.ai.push(genOk(RECORD_TEXT), modOk());
    const ok = rt.postJson(genBody(rt, { id_token: '' }));
    assert.equal(ok.json.ok, true, 'attempt ' + i);
  }
  const aiBefore = rt.net.aiCalls();
  const res = rt.postJson(genBody(rt, { id_token: '' }));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'cap_reached');
  assert.equal(rt.net.aiCalls(), aiBefore, '上限超過では AI を呼ばない');
  assert.equal(genStateCount(rt), 2);
});

test('app2: 許可ユーザーは匿名の試行上限の対象外', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true', MAX_GEN_PER_DEVICE: '1', MAX_GEN_PER_DAY: '1' } });
  for (let i = 0; i < 3; i++) {
    rt.net.ai.push(genOk(RECORD_TEXT), modOk());
    const res = rt.postJson(genBody(rt)); // 正規トークン（許可ユーザー）
    assert.equal(res.json.ok, true, 'allowed user attempt ' + i);
  }
  assert.equal(genStateCount(rt), 0, '匿名枠は消費しない');
});

test('app2: 生成障害でも試行枠は消費され、同一 request_id の再送で復帰する', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const requestId = rid('failgen');
  rt.net.ai.push({ code: 500, body: { error: { message: 'upstream error' } } });
  const failed = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(failed.json.ok, false);
  assert.equal(failed.json.code, 'ai_http_error');
  assert.equal(genStateCount(rt), 1, '失敗しても枠は消費（費用保護）');

  // failed 状態は同一 request_id で再実行できる
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  const ok = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(ok.json.ok, true, JSON.stringify(ok.json));
  assert.equal(genStateCount(rt), 2);

  // 完了後は同一 request_id を再送しても再実行しない
  const aiAfter = rt.net.aiCalls();
  const again = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(again.json.replayed, true);
  assert.equal(rt.net.aiCalls(), aiAfter);
  assert.equal(genStateCount(rt), 2);
});

test('app2: 台帳 in_flight は retryable / stale は pending（副作用を再実行しない）', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const deviceId = 'd-abcdefgh1234567';
  const requestId = rid('ledger');
  const actor = 'anon:' + deviceId;
  const payloadHash = sha256Hex('generateText\n' + JSON.stringify({
    level: '3級', wordCount: 300, world: '学校', style: '説明文', textType: '物語',
    genre: '日常', development: '起承転結', ending: 'ハッピーエンド', keywords: ['cat'], prompt: '',
  }));
  const key = rt.ctx.ledgerKey_(actor, 'generateText', requestId);

  // 進行中（updatedAt = 現在）
  rt.props.set(key, JSON.stringify({
    requestId, actor, action: 'generateText', payloadHash,
    state: 'in_flight', createdAt: Date.now(), updatedAt: Date.now(), attempts: 1,
  }));
  const busy = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(busy.json.code, 'in_flight');
  assert.equal(busy.json.retryable, true);
  assert.equal(rt.net.aiCalls(), 0, '進行中は AI を呼ばない');

  // 処理途中で落ちた疑い（5分以上経過）→ 保守的に pending（再実行しない）
  rt.props.set(key, JSON.stringify({
    requestId, actor, action: 'generateText', payloadHash,
    state: 'in_flight', createdAt: Date.now() - 600000, updatedAt: Date.now() - 600000, attempts: 1,
  }));
  const stale = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(stale.json.code, 'pending_unknown');
  assert.equal(stale.json.retryable, true);
  assert.equal(rt.net.aiCalls(), 0, 'stale でも勝手に再実行しない');
  assert.equal(genStateCount(rt), 0, '再実行しないので枠も増えない');

  // 未知 state も new に落とさない
  rt.props.set(key, JSON.stringify({
    requestId, actor, action: 'generateText', payloadHash,
    state: 'pending_unknown', createdAt: Date.now(), updatedAt: Date.now(), attempts: 1,
  }));
  const weird = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' }));
  assert.equal(weird.json.code, 'pending_unknown');
  assert.equal(rt.net.aiCalls(), 0, '未知 state でも実行しない');
});

test('app2: moderation が 503 なら保存ゼロ（再生成もしない）', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push(genOk(RECORD_TEXT), { code: 503, body: { error: { message: 'unavailable' } } });
  const res = rt.postJson(genBody(rt, { id_token: '' }));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'moderation_unavailable');
  assert.equal(rt.net.aiCalls(), 2, '生成1回 + 審査1回のみ');
  assert.equal(savedCount(rt), 0, '保存ゼロ');
});

test('app2: moderation が JSON 異常 / 打ち切り / 判定不能 でも保存しない', () => {
  for (const mod of [
    { code: 200, body: 'not-json' },
    { code: 200, body: { message: { role: 'assistant', content: 'OK' }, done: false } },
    chatReply('MAYBE'),
  ]) {
    const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
    rt.net.ai.push(genOk(RECORD_TEXT), mod);
    const res = rt.postJson(genBody(rt, { id_token: '' }));
    assert.equal(res.json.ok, false, JSON.stringify(mod).slice(0, 80));
    assert.equal(res.json.code, 'moderation_unavailable');
    assert.equal(rt.net.aiCalls(), 2, '審査不能では再生成しない');
    assert.equal(savedCount(rt), 0);
  }
});

test('app2: NG のときだけ1回再生成し、2回目OKなら保存する', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push(genOk(RECORD_TEXT), modNg('sexual'), genOk(RECORD_TEXT), modOk());
  const res = rt.postJson(genBody(rt));
  assert.equal(res.json.ok, true);
  assert.equal(rt.net.aiCalls(), 4);
});

test('app2: NG が2回続けば保存しない（再生成は1回まで）', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push(genOk(RECORD_TEXT), modNg('sexual'), genOk(RECORD_TEXT), modNg('sexual'));
  const res = rt.postJson(genBody(rt));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'moderation_rejected');
  assert.equal(rt.net.aiCalls(), 4);
});

test('app2: Ollama へ system/user を分離して送り、審査本文を system に混ぜない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  rt.postJson(genBody(rt));
  const aiCall = rt.net.calls.filter((c) => c.url.indexOf('https://ollama.com/api/chat') === 0)[1];
  const payload = JSON.parse(aiCall.opts.payload);
  assert.equal(payload.model, 'gemma4:31b');
  assert.equal(payload.stream, false, 'stream=false で message.content を読む');
  assert.equal(payload.think, false, '思考を無効化する');
  assert.equal(payload.format, undefined, 'Cloud 非対応の format を送らない');
  const sys = payload.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const usr = payload.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  assert.ok(usr.indexOf('審査対象データ') !== -1, '本文は user 側');
  assert.equal(sys.indexOf('A cat sat on a mat'), -1, '本文を system に混ぜない');
});

// ────────────────────────────── app2: Ollama / 対訳 ──────────────────────────────

const TRANS_TEXT = 'Mr. Smith went to Tokyo. He said, "Hello!" Then he left.\n\nThe next day, he came back.';
function seedRecord(rt, text, id) {
  const record = {
    id: id || 'tadoku-1700000001000',
    createdAt: '2025-01-01T00:00:00.000Z',
    settings: { level: '3級' },
    title: 'Sample Story',
    text: text == null ? TRANS_TEXT : text,
  };
  rt.ctx.saveRecord_(record);
  return record;
}
function trItems(spans, ja) {
  return spans.map((s, i) => ({ id: s.id, ja: ja ? ja(s, i) : ('これは' + (i + 1) + '番目の訳です') }));
}
function trReply(rt, text, ja) {
  const spans = rt.ctx.buildSentenceSpans_(text == null ? TRANS_TEXT : text);
  return chatReply(JSON.stringify({ items: trItems(spans, ja) }));
}
function trBody(rt, recordId, over) {
  return Object.assign({
    action: 'translateText',
    token: TOKEN,
    id_token: tokenFor(rt, TEACHER),
    record_id: recordId,
    mode: 'create',
    request_id: rid('tr'),
    device_id: 'd-abcdefgh1234567',
  }, over || {});
}
function trFile(rt, id) {
  return rt.drive.findByName('tadoku-trans-' + id + '.json');
}
function translatedFileCount(rt) {
  return rt.drive.activeFiles().filter((f) => f.name.indexOf('tadoku-trans-') === 0).length;
}

test('app2: OLLAMA_API_KEY のみを使い、ZEN/OPENCODE へ暗黙フォールバックしない', () => {
  const rt = setupApp2({ props: { OLLAMA_API_KEY: '', ZEN_API_KEY: 'zen-key', OPENCODE_API_KEY: 'oc-key' } });
  const res = rt.postJson(genBody(rt));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'api_key_missing');
  assert.equal(rt.net.aiCalls(), 0, '鍵が無ければ AI を呼ばない');

  const rt2 = setupApp2({ props: { OLLAMA_API_KEY: 'ollama-key' } });
  rt2.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt2.postJson(genBody(rt2)).json.ok, true);
  const call = rt2.net.calls.filter((c) => c.url.indexOf('https://ollama.com/api/chat') === 0)[0];
  assert.equal(call.opts.headers.Authorization, 'Bearer ollama-key');
});

test('app2: Ollama の HTTP失敗 / 非JSON / 切断 / 打ち切り / 空 は保存しない', () => {
  const cases = [
    { name: 'http500', nexts: [{ code: 500, body: { error: 'down' } }], code: 'ai_http_error', calls: 1 },
    { name: 'badjson', nexts: [{ code: 200, body: 'not-json' }], code: 'ai_bad_json', calls: 1 },
    { name: 'done-false', nexts: [{ code: 200, body: { message: { role: 'assistant', content: 'A Cat Story\n\nA cat.' }, done: false } }], code: 'ai_incomplete', calls: 1 },
    { name: 'length', nexts: [chatReply('A Cat Story\n\nA cat.', { done_reason: 'length' })], code: 'ai_incomplete', calls: 1 },
    { name: 'empty', nexts: [chatReply('   ')], code: 'ai_empty', calls: 1 },
  ];
  for (const c of cases) {
    const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
    rt.net.ai.push(...c.nexts);
    const res = rt.postJson(genBody(rt));
    assert.equal(res.json.ok, false, c.name);
    assert.equal(res.json.code, c.code, c.name);
    assert.equal(rt.net.aiCalls(), c.calls, c.name);
    assert.equal(savedCount(rt), 0, c.name + ': 保存しない');
  }
});

test('app2: think 非対応の 400 は think を外して1回だけ再試行する', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push({ code: 400, body: { error: 'think is not supported by this model' } }, genOk(RECORD_TEXT), modOk());
  const res = rt.postJson(genBody(rt));
  assert.equal(res.json.ok, true, JSON.stringify(res.json));
  const calls = rt.net.calls.filter((c) => c.url.indexOf('https://ollama.com/api/chat') === 0);
  assert.equal(calls.length, 3, '400 + 再試行 + 審査');
  assert.equal(JSON.parse(calls[0].opts.payload).think, false);
  assert.equal(JSON.parse(calls[1].opts.payload).think, undefined, '再試行では think を送らない');
});

test('app2 translate: get は未作成なら LLM なしで translation_missing を返す', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  const res = rt.postJson({
    action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    record_id: rec.id, mode: 'get',
  });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'translation_missing');
  assert.equal(res.json.can_create, true);
  assert.equal(rt.net.aiCalls(), 0);

  // 匿名生成が閉じていれば匿名に新規LLM実行を許可しない
  const anon = rt.postJson({ action: 'translateText', token: TOKEN, record_id: rec.id, mode: 'get' });
  assert.equal(anon.json.code, 'translation_missing');
  assert.equal(anon.json.can_create, false);

  const badMode = rt.postJson({ action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER), record_id: rec.id, mode: 'bogus' });
  assert.equal(badMode.json.code, 'invalid_mode');
  assert.equal(rt.net.aiCalls(), 0);
});

test('app2 translate: 作成は LLM 2回（翻訳+審査）で別JSONに保存し、取得は LLM なしで再利用', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  const spans = rt.ctx.buildSentenceSpans_(TRANS_TEXT);
  rt.net.ai.push(trReply(rt, TRANS_TEXT), modOk());
  const created = rt.postJson(trBody(rt, rec.id));
  assert.equal(created.json.ok, true, JSON.stringify(created.json));
  const tr = created.json.translation;
  assert.equal(tr.record_id, rec.id);
  assert.equal(tr.model, 'gemma4:31b');
  assert.equal(tr.source_hash, rt.ctx.sourceHashOf_(TRANS_TEXT));
  assert.equal(tr.items.length, spans.length);
  assert.equal(tr.spans.map((s) => s.start).join(','), spans.map((s) => s.start).join(','));
  assert.equal(tr.spans.map((s) => s.end).join(','), spans.map((s) => s.end).join(','));
  assert.equal(rt.net.aiCalls(), 2);

  const file = trFile(rt, rec.id);
  assert.ok(file, '別JSONに保存する');
  const saved = JSON.parse(file.content);
  assert.equal(saved.version, 1);
  assert.equal(saved.lang, 'ja');
  assert.equal(saved.moderation, 'ok');
  assert.equal(saved.createdAt.length > 0, true);
  const index = JSON.parse(rt.drive.findByName('tadoku-index.json').content);
  assert.equal(index.items.length, 1);
  assert.equal(index.items[0].translation, undefined, 'index を肥大させない');

  const got = rt.postJson({
    action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    record_id: rec.id, mode: 'get',
  });
  assert.equal(got.json.ok, true);
  assert.equal(got.json.replayed, true);
  assert.deepEqual(got.json.translation.items.map((i) => i.ja), tr.items.map((i) => i.ja));
  assert.equal(rt.net.aiCalls(), 2, '既存訳の取得は LLM なし');
});

test('app2 translate: 同一 request_id の再送は LLM・保存を増やさない / 別 record は conflict', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  const requestId = rid('trreplay');
  rt.net.ai.push(trReply(rt, TRANS_TEXT), modOk());
  assert.equal(rt.postJson(trBody(rt, rec.id, { request_id: requestId })).json.ok, true);
  const aiAfter = rt.net.aiCalls();
  const filesAfter = translatedFileCount(rt);

  const again = rt.postJson(trBody(rt, rec.id, { request_id: requestId }));
  assert.equal(again.json.ok, true);
  assert.equal(again.json.replayed, true);
  assert.equal(rt.net.aiCalls(), aiAfter);
  assert.equal(translatedFileCount(rt), filesAfter);

  const other = seedRecord(rt, 'Another story. It is short.', 'tadoku-1700000002000');
  const conflict = rt.postJson(trBody(rt, other.id, { request_id: requestId }));
  assert.equal(conflict.json.code, 'request_id_conflict');
  assert.equal(rt.net.aiCalls(), aiAfter);
});

test('app2 translate: 同一 record の並行作成は予約で直列化し、stale は pending（LLM を呼ばない）', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  const key = rt.ctx.transReserveKey_(rec.id);
  const sourceHash = rt.ctx.sourceHashOf_(TRANS_TEXT);

  rt.props.set(key, JSON.stringify({ r: rid('trbusy'), h: sourceHash, t: Date.now() }));
  const busy = rt.postJson(trBody(rt, rec.id, { request_id: rid('trnew') }));
  assert.equal(busy.json.code, 'in_flight');
  assert.equal(busy.json.retryable, true);
  assert.equal(rt.net.aiCalls(), 0);
  assert.equal(rt.ctx.countLiveLedgerEntries_(), 0, '実行しない新規 receipt は残さない');

  rt.props.set(key, JSON.stringify({ r: rid('trstale'), h: sourceHash, t: Date.now() - 360000 }));
  const stale = rt.postJson(trBody(rt, rec.id, { request_id: rid('trnew2') }));
  assert.equal(stale.json.code, 'translation_recovery_required', '停止した処理は自動再実行しない');
  assert.equal(stale.json.retryable, false);
  assert.equal(rt.net.aiCalls(), 0);
  assert.equal(JSON.parse(rt.props.get(key)).u, 1, '送信不明として永続化する');
});

test('app2 translate: 不正JSON/件数/未知ID/重複/空/異常長/英語のみ/中国語疑い は保存しない', () => {
  const spanProbe = setupApp2();
  const spans = spanProbe.ctx.buildSentenceSpans_(TRANS_TEXT);
  const okItems = trItems(spans);
  const cases = [
    ['not-json', 'これはJSONではない'],
    ['count', JSON.stringify({ items: [okItems[0]] })],
    ['unknown-id', JSON.stringify({ items: okItems.map((it, i) => ({ id: 'x' + i, ja: it.ja })) })],
    ['duplicate-id', JSON.stringify({ items: okItems.map(() => ({ id: spans[0].id, ja: 'これは訳です' })) })],
    ['empty', JSON.stringify({ items: okItems.map((it) => ({ id: it.id, ja: '   ' })) })],
    ['too-long', JSON.stringify({ items: okItems.map((it) => ({ id: it.id, ja: 'あ'.repeat(4001) })) })],
    ['english', JSON.stringify({ items: okItems.map((it, i) => ({ id: it.id, ja: i === 0 ? 'This is English.' : it.ja })) })],
    ['chinese', JSON.stringify({ items: okItems.map((it, i) => ({ id: it.id, ja: i === 0 ? '这个学生说的是中文。' : it.ja })) })],
  ];
  for (const [name, content] of cases) {
    const rt = setupApp2();
    const rec = seedRecord(rt);
    rt.net.ai.push(chatReply(content));
    const res = rt.postJson(trBody(rt, rec.id));
    assert.equal(res.json.ok, false, name);
    assert.equal(res.json.code, 'translation_invalid', name + ': ' + JSON.stringify(res.json).slice(0, 160));
    assert.equal(rt.net.aiCalls(), 1, name + ': 検証失敗では審査に進まない');
    assert.equal(translatedFileCount(rt), 0, name + ': 保存しない');
    assert.equal(savedCount(rt), 1, name + ': index は不変');
  }
});

test('app2 translate: 文分割は省略語・小数・会話の省略・段落を壊さず原文を完全復元する', () => {
  const rt = setupApp2();
  const text = 'Mr. Smith paid 3.14 dollars. He said, "Wait... What?"\n\nDr. J. K. Rowling wrote it (e.g. novels). The end.';
  const spans = rt.ctx.buildSentenceSpans_(text);
  const pieces = spans.map((s) => text.slice(s.start, s.end));
  assert.equal(pieces.join(''), text, '原文を完全復元できる');
  assert.equal(spans[0].start, 0);
  assert.equal(spans[spans.length - 1].end, text.length);
  assert.equal(pieces.some((p) => p.trim() === 'Mr.'), false, 'Mr. で切らない');
  assert.equal(pieces.some((p) => p.trim() === 'Dr.'), false, 'Dr. で切らない');
  assert.equal(pieces.some((p) => /3\.$/.test(p.trim())), false, '小数で切らない');
  assert.equal(pieces.some((p) => /Wait\.\.\.$/.test(p.trim())), false, '会話中の省略記号で切らない');
  const quoted = rt.ctx.buildSentenceSpans_('\t"Really? No." She left.');
  const quotedPieces = quoted.map((s) => '\t"Really? No." She left.'.slice(s.start, s.end));
  assert.equal(quotedPieces[0].trim(), '"Really? No."', '引用符内の ? で切らない');
  assert.equal(quotedPieces.map((p) => p.trim()).join(''), '"Really? No."She left.', '引用符内を1単位にする');
  // 段落の空行は直前の span に含める（原文の空白を落とさない）
  assert.ok(pieces.some((p) => p.indexOf('\n\n') !== -1));

  // 末尾が空白だけでも連結は原文と一致する
  const tail = rt.ctx.buildSentenceSpans_('One two.  ');
  assert.equal(tail.map((s) => 'One two.  '.slice(s.start, s.end)).join(''), 'One two.  ');
});

test('app2 translate: 保存不明の予約はTTL後も別request_idで再AIせず、保存済みなら回復する', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true', MAX_GEN_PER_DEVICE: '5' } });
  const rec = seedRecord(rt);
  const key = rt.ctx.transReserveKey_(rec.id);
  const sourceHash = rt.ctx.sourceHashOf_(TRANS_TEXT);

  // 保存不明（u:1）。10分超でも自動解除しない
  rt.props.set(key, JSON.stringify({ r: rid('unknown'), h: sourceHash, t: Date.now() - 11 * 60 * 1000, u: 1 }));
  rt.ctx.countLiveLedgerEntries_();
  assert.ok(rt.props.get(key), '台帳スナップショットでも消さない');
  const res = rt.postJson(trBody(rt, rec.id, { id_token: '', request_id: rid('newid') }));
  assert.equal(res.json.code, 'translation_recovery_required');
  assert.equal(res.json.retryable, false);
  assert.equal(rt.net.aiCalls(), 0, '別request_idでもAIを呼ばない');
  assert.equal(genStateCount(rt), 0, 'quotaを消費しない');
  assert.equal(rt.ctx.countLiveLedgerEntries_(), 0, '未実行のreceiptを残さない');
  assert.ok(rt.props.get(key), '予約は残す');
  const blockedGet = rt.postJson({
    action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    record_id: rec.id, mode: 'get',
  });
  assert.equal(blockedGet.json.code, 'translation_recovery_required', '取得でも管理者確認を要求');
  assert.equal(rt.net.aiCalls(), 0);

  // 通常の in_flight が古い場合も永続 unknown に固定する（TTL後でも再AIしない）
  const rt2 = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const rec2 = seedRecord(rt2);
  const key2 = rt2.ctx.transReserveKey_(rec2.id);
  rt2.props.set(key2, JSON.stringify({ r: rid('stale'), h: rt2.ctx.sourceHashOf_(TRANS_TEXT), t: Date.now() - 11 * 60 * 1000 }));
  const stale = rt2.postJson(trBody(rt2, rec2.id, { id_token: '', request_id: rid('newid2') }));
  assert.equal(stale.json.code, 'translation_recovery_required');
  assert.equal(rt2.net.aiCalls(), 0);
  assert.equal(rt2.ctx.countLiveLedgerEntries_(), 0, '未実行のreceiptを残さない');
  assert.equal(JSON.parse(rt2.props.get(key2)).u, 1);

  // 保存ファイルが確定していれば get で回復し、予約を解放する（LLMなし）
  const spans = rt2.ctx.buildSentenceSpans_(TRANS_TEXT);
  const obj = rt2.ctx.buildTranslationObject_(rec2, spans, spans.map((s, i) => 'これは訳' + i));
  rt2.drive.addFile('生成済み長文_index', 'tadoku-trans-' + rec2.id + '.json', JSON.stringify(obj));
  const got = rt2.postJson({ action: 'translateText', token: TOKEN, id_token: tokenFor(rt2, TEACHER), record_id: rec2.id, mode: 'get' });
  assert.equal(got.json.ok, true, JSON.stringify(got.json));
  assert.equal(got.json.translation.items.length, spans.length);
  assert.equal(rt2.props.get(key2), undefined, '保存確定で予約を解放');
  assert.equal(rt2.net.aiCalls(), 0, '回復はLLMなし');
});

test('app2 translate: 常用漢字（健康/保健室）や漢字だけの長い語を中国語扱いしない', () => {
  const rt = setupApp2();
  assert.equal(rt.ctx.looksLikeChineseOnly_('健康'), false);
  assert.equal(rt.ctx.looksLikeChineseOnly_('保健室'), false);
  assert.equal(rt.ctx.looksLikeChineseOnly_('健康診断の結果'), false);
  assert.equal(rt.ctx.looksLikeChineseOnly_('国際連合安全保障理事会'), false);
  assert.equal(rt.ctx.looksLikeChineseOnly_('这个学生说的是中文。'), true, '簡体字は拒否');
  assert.equal(rt.ctx.looksLikeChineseOnly_('她说这是健康的'), true, 'かな無しの簡体字文は拒否');

  // 保存経路でも正常な日本語として通る（健康・保健室・漢字だけの長い語）
  const rec = seedRecord(rt);
  rt.net.ai.push(
    trReply(rt, TRANS_TEXT, (s, i) => ['健康', '保健室', '国際連合安全保障理事会', 'これは訳です'][i] || 'これは訳です'),
    modOk()
  );
  const res = rt.postJson(trBody(rt, rec.id));
  assert.equal(res.json.ok, true, JSON.stringify(res.json));
  assert.equal(res.json.translation.items[0].ja, '健康');
  assert.equal(res.json.translation.items[1].ja, '保健室');
  assert.equal(res.json.translation.items[2].ja, '国際連合安全保障理事会');
});

test('app2 translate: 文分割の確定失敗は台帳・予約・quota前に拒否する', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const rec = seedRecord(rt, 'A cat sat. '.repeat(401), 'tadoku-1700000003000');
  const res = rt.postJson(trBody(rt, rec.id, { id_token: '' }));
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'translation_too_long');
  assert.equal(rt.net.aiCalls(), 0);
  assert.equal(genStateCount(rt), 0, 'quotaを消費しない');
  assert.equal(rt.ctx.countLiveLedgerEntries_(), 0, '台帳にreceiptを残さない');
  assert.equal(rt.props.get(rt.ctx.transReserveKey_(rec.id)), undefined, '予約を残さない');
});

test('app2 translate: 翻訳 moderation が NG / 503 / 判定不能 なら保存しない', () => {
  const cases = [
    { name: 'ng', mod: modNg('sexual') },
    { name: 'http503', mod: { code: 503, body: { error: 'down' } } },
    { name: 'unrecognized', mod: chatReply('MAYBE') },
  ];
  for (const c of cases) {
    const rt = setupApp2();
    const rec = seedRecord(rt);
    rt.net.ai.push(trReply(rt, TRANS_TEXT), c.mod);
    const res = rt.postJson(trBody(rt, rec.id));
    assert.equal(res.json.ok, false, c.name);
    assert.ok(
      res.json.code === 'moderation_rejected' || res.json.code === 'moderation_unavailable',
      c.name + ': ' + res.json.code
    );
    assert.equal(rt.net.aiCalls(), 2, c.name);
    assert.equal(translatedFileCount(rt), 0, c.name + ': 保存しない');
  }
});

test('app2 translate: 匿名は OPEN_GENERATE=false で作成不可 / true は API 前に枠を消費し失敗も消費', () => {
  const closed = setupApp2();
  const recClosed = seedRecord(closed);
  const denied = closed.postJson(trBody(closed, recClosed.id, { id_token: '' }));
  assert.equal(denied.json.code, 'not_allowed');
  assert.equal(closed.net.aiCalls(), 0);
  assert.ok(!closed.props.get('GEN_STATE'), '枠を消費しない');

  const open = setupApp2({ props: { OPEN_GENERATE: 'true', MAX_GEN_PER_DEVICE: '2' } });
  const rec = seedRecord(open);
  open.net.ai.push({ code: 500, body: { error: 'down' } });
  const failed = open.postJson(trBody(open, rec.id, { id_token: '' }));
  assert.equal(failed.json.ok, false);
  assert.equal(genStateCount(open), 1, '失敗しても枠は消費（費用保護）');

  open.net.ai.push(trReply(open, TRANS_TEXT), modOk());
  const ok = open.postJson(trBody(open, rec.id, { id_token: '', request_id: failed.json.request_id }));
  assert.equal(ok.json.ok, true, JSON.stringify(ok.json));
  assert.equal(genStateCount(open), 2);
});

test('app2 translate: 保存済み訳が破損・sourceHash不一致なら translation_corrupt（再生成なし）', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  const folderId = rt.drive.ensureFolder('生成済み長文_index');
  rt.drive.addFile('生成済み長文_index', 'tadoku-trans-' + rec.id + '.json', '{broken json');
  const get = rt.postJson({ action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER), record_id: rec.id, mode: 'get' });
  assert.equal(get.json.code, 'translation_corrupt');
  assert.equal(rt.net.aiCalls(), 0);

  const create = rt.postJson(trBody(rt, rec.id));
  assert.equal(create.json.code, 'translation_corrupt');
  assert.equal(rt.net.aiCalls(), 0, '破損訳は黙って再生成しない');

  // sourceHash 不一致も破損扱い
  const rt2 = setupApp2();
  const rec2 = seedRecord(rt2);
  const spans = rt2.ctx.buildSentenceSpans_(TRANS_TEXT);
  const obj = rt2.ctx.buildTranslationObject_(rec2, spans, spans.map((s, i) => 'これは訳' + i));
  obj.sourceHash = 'deadbeef';
  rt2.drive.addFile('生成済み長文_index', 'tadoku-trans-' + rec2.id + '.json', JSON.stringify(obj));
  const mismatch = rt2.postJson({ action: 'translateText', token: TOKEN, id_token: tokenFor(rt2, TEACHER), record_id: rec2.id, mode: 'get' });
  assert.equal(mismatch.json.code, 'translation_corrupt');
  assert.equal(rt2.net.aiCalls(), 0);
});

test('app2 translate: クライアントの本文・訳は使わず、record 本文だけを翻訳する', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  rt.net.ai.push(trReply(rt, TRANS_TEXT), modOk());
  const res = rt.postJson(trBody(rt, rec.id, { text: 'CLIENT INJECTED TEXT', ja: '偽の訳', translation: { items: [] } }));
  assert.equal(res.json.ok, true);
  const transCall = rt.net.calls.filter((c) => c.url.indexOf('https://ollama.com/api/chat') === 0)[0];
  const payload = JSON.parse(transCall.opts.payload);
  const user = payload.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  assert.ok(user.indexOf(TRANS_TEXT) !== -1, 'サーバー保有本文を使う');
  assert.equal(user.indexOf('CLIENT INJECTED TEXT'), -1, 'クライアント本文を使わない');
});

test('app2 translate: 保存結果不明は永続unknownで別IDも再実行せず、保存済みなら回復する', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const rec = seedRecord(rt);
  const requestId = rid('truncertain');
  rt.net.ai.push(trReply(rt, TRANS_TEXT), modOk());
  rt.drive.failNextCreateFile = true;
  const res = rt.postJson(trBody(rt, rec.id, { request_id: requestId }));
  assert.equal(res.json.code, 'translation_recovery_required');
  assert.equal(res.json.retryable, false);
  const key = rt.ctx.ledgerKey_('user:' + TEACHER, 'translateText', requestId);
  assert.equal(JSON.parse(rt.props.get(key)).state, 'in_flight', 'in_flight を維持');
  const reserveKey = rt.ctx.transReserveKey_(rec.id);
  assert.equal(JSON.parse(rt.props.get(reserveKey)).u, 1, '永続unknownにする');
  const aiAfter = rt.net.aiCalls();

  const again = rt.postJson(trBody(rt, rec.id, { request_id: requestId }));
  assert.equal(again.json.code, 'in_flight');
  const other = rt.postJson(trBody(rt, rec.id));
  assert.equal(other.json.code, 'translation_recovery_required', '別IDでも再実行しない');
  assert.equal(rt.net.aiCalls(), aiAfter);

  // TTL（10分）を過ぎても自動解除されず、別IDで AI を呼ばない
  const cur = JSON.parse(rt.props.get(reserveKey));
  cur.t = Date.now() - 11 * 60 * 1000;
  rt.props.set(reserveKey, JSON.stringify(cur));
  const later = rt.postJson(trBody(rt, rec.id));
  assert.equal(later.json.code, 'translation_recovery_required');
  assert.equal(rt.net.aiCalls(), aiAfter);
  assert.ok(rt.props.get(reserveKey), '予約を残す');

  // 保存ファイルが存在すれば回復（LLMなし・予約解放）
  const spans = rt.ctx.buildSentenceSpans_(TRANS_TEXT);
  const obj = rt.ctx.buildTranslationObject_(rec, spans, spans.map((s, i) => 'これは訳' + i));
  rt.drive.addFile('生成済み長文_index', 'tadoku-trans-' + rec.id + '.json', JSON.stringify(obj));
  const got = rt.postJson({ action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER), record_id: rec.id, mode: 'get' });
  assert.equal(got.json.ok, true, JSON.stringify(got.json));
  assert.equal(rt.props.get(reserveKey), undefined, '保存確定で予約を解放');
  assert.equal(rt.net.aiCalls(), aiAfter);
});

test('app2 translate: 削除すると訳ファイルも消え、翻訳取得は record_unavailable', () => {
  const rt = setupApp2();
  const rec = seedRecord(rt);
  rt.net.ai.push(trReply(rt, TRANS_TEXT), modOk());
  assert.equal(rt.postJson(trBody(rt, rec.id)).json.ok, true);
  assert.ok(trFile(rt, rec.id));
  // 保存不明の予約が残っていても、record 削除時に片付ける
  const reserveKey = rt.ctx.transReserveKey_(rec.id);
  rt.props.set(reserveKey, JSON.stringify({ r: rid('left'), h: rt.ctx.sourceHashOf_(TRANS_TEXT), t: Date.now(), u: 1 }));

  const del = rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    request_id: rid('trdel'), id: rec.id,
  });
  assert.equal(del.json.ok, true, JSON.stringify(del.json));
  assert.equal(trFile(rt, rec.id), null, '訳ファイルはゴミ箱へ');
  assert.equal(rt.props.get(reserveKey), undefined, '予約も片付ける');

  const got = rt.postJson({ action: 'translateText', token: TOKEN, id_token: tokenFor(rt, TEACHER), record_id: rec.id, mode: 'get' });
  assert.equal(got.json.code, 'record_unavailable');
  assert.equal(rt.net.aiCalls(), 2, '削除で再生成しない');
});


function setupApp2WithLegacy(opts) {
  const rt = setupApp2(opts);
  const folderId = rt.drive.ensureFolder('生成済み長文');
  rt.props.set('FOLDER_ID', folderId);
  rt.drive.addFile('生成済み長文', 'tadoku-1700000000000.json', JSON.stringify({
    id: 'tadoku-1700000000000',
    createdAt: '2023-11-14T00:00:00.000Z',
    settings: { level: '3級' },
    title: 'Legacy Story',
    text: 'legacy body',
  }));
  return rt;
}

test('app2: 旧データは1回だけ移行され、削除後は墓標により復活しない', () => {
  const rt = setupApp2WithLegacy();
  const first = rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' });
  assert.equal(first.json.ok, true);
  assert.equal(first.json.total, 1, '旧データが読める');
  assert.equal(rt.props.get('MIGRATION_STATE'), 'done');

  // 削除（オーナー）
  const delBody = {
    action: 'deleteText',
    token: TOKEN,
    id_token: tokenFor(rt, TEACHER),
    request_id: rid('del1'),
    id: 'tadoku-1700000000000',
  };
  const del = rt.postJson(delBody);
  assert.equal(del.json.ok, true, JSON.stringify(del.json));
  assert.equal(del.json.result, true);

  const index = JSON.parse(rt.drive.findByName('tadoku-index.json').content);
  assert.deepEqual(index.items, []);
  assert.deepEqual(index.deletedIds, ['tadoku-1700000000000'], '墓標を永続化');
  assert.ok(!rt.drive.files().some((f) => f.name === 'tadoku-1700000000000.json' && !f.trashed), 'legacy ファイルはゴミ箱へ');

  // 一覧は空のまま（移行し直さない）
  const after = rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' });
  assert.equal(after.json.total, 0);

  // 手動 migrate も skip（空一覧でも再移行しない）
  const mig = rt.get({ action: 'migrateToIndex', token: TOKEN, id_token: tokenFor(rt, TEACHER), callback: '__cb' });
  assert.equal(mig.json.ok, true);
  assert.equal(mig.json.result, 'already migrated, skip');

  // 強制再移行でも墓標を尊重
  rt.ctx.forceMigrateToIndex_();
  const index2 = JSON.parse(rt.drive.findByName('tadoku-index.json').content);
  assert.deepEqual(index2.items, [], '強制移行でも削除済みは復活しない');
  assert.deepEqual(index2.deletedIds, ['tadoku-1700000000000']);
});

test('app2: 既に削除済みの id を再送しても成功（冪等）', () => {
  const rt = setupApp2WithLegacy();
  rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' });
  rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    request_id: rid('del-a'), id: 'tadoku-1700000000000',
  });
  const again = rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    request_id: rid('del-b'), id: 'tadoku-1700000000000',
  });
  assert.equal(again.json.ok, true);
  assert.equal(again.json.result, true);
});

test('app2: 削除はオーナーのみ（許可ユーザーでも不可）', () => {
  const rt = setupApp2WithLegacy({ props: { ALLOWED_EMAILS: TEACHER + ',' + STUDENT } });
  rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' });
  const res = rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, STUDENT),
    request_id: rid('del-student'), id: 'tadoku-1700000000000',
  });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'owner_only');
  assert.ok(rt.drive.activeFiles().some((f) => f.name === 'tadoku-1700000000000.json'), '削除されない');
});

test('app2: index 破損は空配列で上書きせず明示エラー', () => {
  const rt = setupApp2();
  rt.ctx.loadIndex_(); // index を生成
  const indexFile = rt.drive.findByName('tadoku-index.json');
  indexFile.content = '{broken json';
  rt.cache.clear();

  const res = rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'index_corrupted');
  assert.equal(rt.drive.findByName('tadoku-index.json').content, '{broken json', '破損ファイルを上書きしない');

  const del = rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    request_id: rid('del-corrupt'), id: 'tadoku-1700000000000',
  });
  assert.equal(del.json.ok, false);
  assert.equal(del.json.code, 'index_corrupted');
});

test('app2: debug はオーナー限定で ALLOWED_EMAILS を返さない', () => {
  const rt = setupApp2();
  const student = rt.get({ action: 'debugIndexInfo', token: TOKEN, id_token: tokenFor(rt, STUDENT), callback: '__cb' });
  assert.equal(student.json.ok, false);
  assert.equal(student.json.code, 'owner_only');

  const owner = rt.get({ action: 'debugIndexInfo', token: TOKEN, id_token: tokenFor(rt, TEACHER) });
  assert.equal(owner.json.ok, true);
  assert.equal(owner.text.indexOf(TEACHER), -1, '生PIIを返さない');
  assert.ok(owner.text.indexOf('allowed_count') !== -1);
});

test('app2: 辞書キー未設定は拒否', () => {
  const rt = setupApp2();
  const res = rt.get({ action: 'getDICTIONARY', token: TOKEN });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.code, 'not_configured');
});

test('app2: getSavedTexts は共通トークンのみで読める（公開read）', () => {
  const rt = setupApp2();
  const ok = rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' });
  assert.equal(ok.json.ok, true);
  const ng = rt.get({ action: 'getSavedTexts', token: 'nope', callback: '__cb' });
  assert.equal(ng.json.ok, false);
});

// ────────────────────────────── app2: postMessage 契約 ──────────────────────────────

test('app2 probe: postMessage は {genkoProbe, rid, payload} で targetOrigin を検証する', () => {
  const rt = setupApp2();
  const token = tokenFor(rt, TEACHER);
  const myRid = 'r-' + 'a'.repeat(16);

  const html = rt.postParams({
    probe: '1', token: TOKEN, id_token: token, rid: myRid,
    parent_origin: 'https://hori366191-ship-it.github.io',
  });
  assert.equal(html.isHtml, true);
  const m = /var m=(\{.*?\});/.exec(html.text);
  assert.ok(m, 'postMessage payload がある');
  const msg = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
  assert.equal(msg.genkoProbe, true);
  assert.equal(msg.rid, myRid);
  assert.equal(msg.payload.masked, 'te***@example.com');
  assert.ok(html.text.indexOf('"https://hori366191-ship-it.github.io"') !== -1, 'allowlist の origin を targetOrigin に使う');

  // 不正 origin は postMessage せず JSON
  const bad = rt.postParams({
    probe: '1', token: TOKEN, id_token: token, rid: myRid,
    parent_origin: 'https://evil.example.com',
  });
  assert.equal(bad.isHtml, false);
  assert.equal(bad.json.ok, true);

  // 開発 origin は許可
  const dev = rt.postParams({
    probe: '1', token: TOKEN, id_token: token, rid: myRid,
    parent_origin: 'http://127.0.0.1:8000',
  });
  assert.equal(dev.isHtml, true);
  assert.ok(dev.text.indexOf('"http://127.0.0.1:8000"') !== -1);
});

test('app2: form の data= 内の rid / parent_origin を読み、解析失敗でも rid を echo する', () => {
  const rt = setupApp2();
  const token = tokenFor(rt, TEACHER);
  const myRid = 'r-' + 'b'.repeat(16);

  const ok = rt.postForm({
    probe: 1, token: TOKEN, id_token: token, rid: myRid,
    parent_origin: 'https://hori366191-ship-it.github.io',
  });
  assert.equal(ok.isHtml, true);
  assert.ok(ok.text.indexOf('"' + myRid + '"') !== -1);

  const broken = rt.postForm({ probe: 1, rid: myRid }).text; // 正常系（比較用）
  assert.ok(broken.length > 0);

  // JSON として壊れた本文でも、raw から rid を拾って echo する
  const raw = 'data=' + encodeURIComponent('{"probe":1,"rid":"' + myRid + '","token":"' + TOKEN + '"');
  const res = rt.postRaw(raw);
  assert.equal(res.isHtml, true);
  assert.ok(res.text.indexOf('"' + myRid + '"') !== -1, 'parse 失敗でも rid を echo');
  const msg = /var m=(\{.*?\});/.exec(res.text);
  const body = JSON.parse(msg[1].replace(/\\u003c/g, '<'));
  assert.equal(body.rid, myRid);
  assert.equal(body.payload.code, 'bad_json');
});

// ────────────────────────────── pdfdrop: 認証 / 上限 / 冪等 ──────────────────────────────

const PDF_BYTES = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n';
const PDF_B64 = Buffer.from(PDF_BYTES, 'utf8').toString('base64');
const PDF_B64_ALT = Buffer.from(PDF_BYTES + '%alt', 'utf8').toString('base64');

function pdfBody(rt, overrides) {
  return Object.assign({
    token: TOKEN,
    id_token: tokenFor(rt, TEACHER),
    request_id: rid(),
    name: 'genkoshi_test.pdf',
    b64: PDF_B64,
    rid: 'r-' + 'c'.repeat(16),
    parent_origin: 'https://hori366191-ship-it.github.io',
  }, overrides || {});
}

test('pdfdrop: 正常保存（form data）で file が1つ・日次1・rid echo', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const res = rt.postForm(pdfBody(rt));
  assert.equal(res.isHtml, true);
  const msg = JSON.parse(/var m=(\{.*?\});/.exec(res.text)[1].replace(/\\u003c/g, '<'));
  assert.equal(msg.genko, true);
  assert.equal(msg.rid, 'r-' + 'c'.repeat(16));
  assert.equal(msg.payload.ok, true);
  const saved = rt.drive.files().filter((f) => f.name === 'genkoshi_test.pdf' && !f.trashed);
  assert.equal(saved.length, 1);
  assert.equal(rt.props.get(todayCountKey()), '1');
});

test('pdfdrop: ALLOWED_EMAILS 空は拒否（保存も予約もしない）', () => {
  const rt = setupPdfdrop({ props: { ALLOWED_EMAILS: '' } });
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const res = rt.postForm(pdfBody(rt));
  const msg = JSON.parse(/var m=(\{.*?\});/.exec(res.text)[1].replace(/\\u003c/g, '<'));
  assert.equal(msg.payload.ok, false);
  assert.equal(msg.payload.code, 'not_allowed');
  assert.equal(rt.drive.files().filter((f) => f.name === 'genkoshi_test.pdf').length, 0);
  assert.equal(rt.props.get(todayCountKey()) || '0', '0');
});

test('pdfdrop: request_id 欠落は保存しない', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const res = rt.postForm(pdfBody(rt, { request_id: '' }));
  const msg = JSON.parse(/var m=(\{.*?\});/.exec(res.text)[1].replace(/\\u003c/g, '<'));
  assert.equal(msg.payload.code, 'request_id_required');
  assert.equal(rt.drive.files().filter((f) => !f.name.startsWith('tadoku-index')).length, 0);
  assert.equal(rt.props.get(todayCountKey()) || '0', '0');
});

test('pdfdrop: 同一 request_id 再送は保存もカウントもしない / 内容相違は conflict', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const requestId = rid('pdf');
  const first = rt.postForm(pdfBody(rt, { request_id: requestId }));
  assert.equal(JSON.parse(/var m=(\{.*?\});/.exec(first.text)[1]).payload.ok, true);
  const second = rt.postForm(pdfBody(rt, { request_id: requestId }));
  const secondPayload = JSON.parse(/var m=(\{.*?\});/.exec(second.text)[1]).payload;
  assert.equal(secondPayload.ok, true);
  assert.equal(secondPayload.replayed, true);
  assert.equal(rt.drive.files().filter((f) => f.name === 'genkoshi_test.pdf' && !f.trashed).length, 1);
  assert.equal(rt.props.get(todayCountKey()), '1');

  const conflict = rt.postForm(pdfBody(rt, { request_id: requestId, b64: PDF_B64_ALT }));
  const conflictPayload = JSON.parse(/var m=(\{.*?\});/.exec(conflict.text)[1]).payload;
  assert.equal(conflictPayload.ok, false);
  assert.equal(conflictPayload.code, 'request_id_conflict');
  assert.equal(rt.drive.files().filter((f) => f.name === 'genkoshi_test.pdf' && !f.trashed).length, 1);
});

test('pdfdrop: 日次上限は保存前に拒否（保存ゼロ・カウント不変）', () => {
  const rt = setupPdfdrop({ props: { MAX_PER_DAY: '1' } });
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const ok = rt.postForm(pdfBody(rt));
  assert.equal(JSON.parse(/var m=(\{.*?\});/.exec(ok.text)[1]).payload.ok, true);

  const over = rt.postForm(pdfBody(rt));
  const payload = JSON.parse(/var m=(\{.*?\});/.exec(over.text)[1]).payload;
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'daily_limit');
  assert.equal(rt.drive.files().filter((f) => f.name === 'genkoshi_test.pdf' && !f.trashed).length, 1);
  assert.equal(rt.props.get(todayCountKey()), '1');
});

test('pdfdrop: 保存呼出し後の例外は結果不明として枠と in_flight を維持し、再送で二重保存しない', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const requestId = rid('pdf-fail');
  rt.drive.failNextCreateFile = true;

  const failed = rt.postForm(pdfBody(rt, { request_id: requestId }));
  const failedPayload = JSON.parse(/var m=(\{.*?\});/.exec(failed.text)[1]).payload;
  assert.equal(failedPayload.ok, false);
  assert.equal(failedPayload.code, 'pending_unknown', '保存結果不明は pending_unknown');
  assert.equal(failedPayload.retryable, true);
  assert.equal(rt.props.get(todayCountKey()), '1', '枠は戻さない（結果不明）');
  assert.equal(rt.drive.files().filter((f) => !f.name.startsWith('tadoku-index')).length, 0);

  const retried = rt.postForm(pdfBody(rt, { request_id: requestId }));
  const retriedPayload = JSON.parse(/var m=(\{.*?\});/.exec(retried.text)[1]).payload;
  assert.equal(retriedPayload.ok, false, '自動再保存しない');
  assert.equal(retriedPayload.code, 'in_flight');
  assert.equal(rt.props.get(todayCountKey()), '1', '再送でも枠は増減しない');
  assert.equal(rt.drive.files().filter((f) => !f.name.startsWith('tadoku-index')).length, 0);
});

test('pdfdrop: 保存コミット後に応答が失われても二重保存せず、再送で二重保存しない', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const requestId = rid('pdf-commit');
  const original = rt.ctx.DriveApp.getFolderById;
  rt.ctx.DriveApp.getFolderById = (id) => {
    const folder = original(id);
    const create = folder.createFile;
    folder.createFile = function (...args) {
      const f = create.apply(folder, args);
      throw new Error('response lost after committed create');
    };
    return folder;
  };

  const first = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { request_id: requestId })).text)[1]).payload;
  assert.equal(first.ok, false);
  assert.equal(first.code, 'pending_unknown');
  assert.equal(rt.props.get(todayCountKey()), '1');
  assert.equal(pdfFileCount(rt), 1);

  // 直近の in_flight では自動再保存しない
  const immediate = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { request_id: requestId })).text)[1]).payload;
  assert.equal(immediate.ok, false);
  assert.equal(immediate.code, 'in_flight');
  assert.equal(pdfFileCount(rt), 1);

  // stale にしても、request_id メタデータが無いファイルは「成功」と断定しない
  const key = rt.ctx.ledgerKey_('user:' + TEACHER, 'pdfdrop', requestId);
  const receipt = JSON.parse(rt.props.get(key));
  receipt.updatedAt = Date.now() - Number(rt.ctx.IDEM_STALE_MS) - 1000;
  rt.props.set(key, JSON.stringify(receipt));

  const stale = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { request_id: requestId })).text)[1]).payload;
  assert.equal(stale.ok, false, 'メタデータ不在は誤成功にしない');
  assert.equal(stale.code, 'pending_unknown');
  assert.equal(pdfFileCount(rt), 1);
  assert.equal(rt.props.get(todayCountKey()), '1', '枠も増えない');
});

test('pdfdrop: request_id メタデータが一致する保存済みファイルだけ stale 復旧で done にする', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const requestId = rid('pdf-recover');
  const name = 'genkoshi_test.pdf';
  const size = Buffer.from(PDF_BYTES, 'utf8').length;

  // 保存済みファイル（request_id メタデータ付き）と、その attempt の stale in_flight receipt
  const saved = rt.drive.addFile('受信PDF', name, PDF_BYTES);
  saved.mime = 'application/pdf';
  saved.description = 'request_id=' + requestId + ';size=' + size;

  const key = rt.ctx.ledgerKey_('user:' + TEACHER, 'pdfdrop', requestId);
  rt.props.set(key, JSON.stringify({
    requestId, actor: 'user:' + TEACHER, action: 'pdfdrop',
    payloadHash: rt.ctx.sha256Hex_('pdfdrop\n' + PDF_B64 + '\n' + name),
    state: 'in_flight', createdAt: Date.now() - 600000, updatedAt: Date.now() - 600000,
    attempts: 1, expectedName: name, expectedSize: size,
  }));

  const res = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { request_id: requestId })).text)[1]).payload;
  assert.equal(res.ok, true);
  assert.equal(res.recovered, true);
  assert.equal(pdfFileCount(rt), 1, '再保存しない');
  assert.equal(rt.props.get(todayCountKey()) || '0', '0', '新しい予約もしない');
  assert.equal(JSON.parse(rt.props.get(key)).state, 'done');
});

test('app2: request_id が一致する保存済み record は stale 復旧で done にする', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const requestId = rid('rec-recover');
  const settings = {
    level: '3級', wordCount: 300, world: '学校', style: '説明文', textType: '物語',
    genre: '日常', development: '起承転結', ending: 'ハッピーエンド', keywords: ['cat'], prompt: '',
  };
  // 保存済み record（request_id 付き）を index に置く
  rt.ctx.saveRecord_({
    id: 'tadoku-1790000000000-aaaaaaaaaaaa',
    createdAt: '2026-01-01T00:00:00.000Z',
    request_id: requestId,
    settings: settings,
    title: 'Recovered Story',
    text: 'recovered body',
  });
  const key = rt.ctx.ledgerKey_('anon:d-abcdefgh1234567', 'generateText', requestId);
  rt.props.set(key, JSON.stringify({
    requestId, actor: 'anon:d-abcdefgh1234567', action: 'generateText',
    payloadHash: sha256Hex('generateText\n' + JSON.stringify(settings)),
    state: 'in_flight', createdAt: Date.now() - 600000, updatedAt: Date.now() - 600000, attempts: 1,
  }));

  const res = rt.postJson(genBody(rt, { request_id: requestId, id_token: '' })).json;
  assert.equal(res.ok, true);
  assert.equal(res.recovered, true);
  assert.equal(res.item.title, 'Recovered Story');
  assert.equal(rt.net.aiCalls(), 0, 'AI を再実行しない');
  assert.equal(genStateCount(rt), 0, '匿名枠も消費しない');
});

test('pdfdrop: %PDF- 以外・サイズ超過・base64不正は保存前に拒否', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));

  const notPdf = Buffer.from('%PDX-1.4\nhello', 'utf8').toString('base64');
  const badSig = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { b64: notPdf })).text)[1]).payload;
  assert.equal(badSig.code, 'bad_pdf');

  const decodeBefore = rt.decode.calls;
  const huge = 'A'.repeat(14 * 1024 * 1024);
  const tooLarge = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { b64: huge })).text)[1]).payload;
  assert.ok(tooLarge.code === 'too_large' || tooLarge.code === 'payload_too_large', 'サイズ超過は拒否: ' + tooLarge.code);
  assert.equal(rt.decode.calls, decodeBefore, 'デコード前にサイズ制限する');

  const badB64 = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { b64: '!!!!notbase64!!!!' })).text)[1]).payload;
  assert.equal(badB64.code, 'bad_base64');

  assert.equal(rt.drive.files().filter((f) => !f.name.startsWith('tadoku-index')).length, 0);
  assert.equal(rt.props.get(todayCountKey()) || '0', '0');
});

test('pdfdrop probe: 厳格検証と rid echo、失敗応答にも rid', () => {
  const rt = setupPdfdrop();
  const token = tokenFor(rt, TEACHER);
  const res = rt.get({ probe: '1', token: TOKEN, id_token: token, rid: 'r-' + 'd'.repeat(16), callback: '__cb' });
  assert.equal(res.json.ok, true);
  assert.equal(res.json.allowed, true);
  assert.equal(res.json.rid, 'r-' + 'd'.repeat(16));

  const forged = rt.get({ probe: '1', token: TOKEN, id_token: forgedJwt({ email: TEACHER, aud: CLIENT_ID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true }), rid: 'r-' + 'e'.repeat(16), callback: '__cb' });
  assert.equal(forged.json.ok, false);
  assert.equal(forged.json.error, 'noauth');

  const failHtml = rt.postParams({ token: 'bad', rid: 'r-' + 'f'.repeat(16) }, '{"action":"x"}');
  assert.equal(failHtml.isHtml, true);
  const failMsg = JSON.parse(/var m=(\{.*?\});/.exec(failHtml.text)[1]);
  assert.equal(failMsg.rid, 'r-' + 'f'.repeat(16), '失敗応答でも rid を echo');
  assert.equal(failMsg.payload.code, 'bad_token');
});

test('pdfdrop: parent_origin 不正は JSON 応答（postMessage しない）', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const res = rt.postForm(pdfBody(rt, { parent_origin: 'https://evil.example.com' }));
  assert.equal(res.isHtml, false);
  assert.equal(res.json.ok, true);
});

// ────────────────────────────── 静的な不変条件 ──────────────────────────────

test('両バックエンド: 未検証JWTフォールバック・email パラメータ認可・bumpUsage が残っていない', () => {
  for (const src of [APP2_SRC, PDFDROP_SRC]) {
    assert.equal(src.indexOf('decodeIdTokenEmail_'), -1, 'JWT デコード補助が残っていない');
    assert.equal(src.indexOf('bumpUsage_'), -1, '後置のカウントが残っていない');
    assert.ok(src.indexOf('tokeninfo') !== -1);
    assert.ok(src.indexOf('email_verified') !== -1);
  }
  assert.equal(APP2_SRC.indexOf('p.email'), -1);
  assert.equal(PDFDROP_SRC.indexOf('p.email'), -1);
});

// ────────────────────────────── 台帳・保存の安全境界（独立検証の回帰） ──────────────────────────────

function patchPropsWrites(rt, shouldFail) {
  const base = rt.ctx.PropertiesService.getScriptProperties();
  const realSet = base.setProperty;
  base.setProperty = (k, v) => {
    if (shouldFail(k, v)) throw new Error('injected properties failure');
    return realSet(k, v);
  };
  rt.ctx.PropertiesService.getScriptProperties = () => base;
}

function patchCachePutFailure(rt) {
  const base = rt.ctx.CacheService.getScriptCache();
  base.put = () => { throw new Error('injected cache put failure'); };
  rt.ctx.CacheService.getScriptCache = () => base;
}

function seedLedger(rt, count, state) {
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    rt.props.set('IDEM_seed' + String(i).padStart(44, '0'), JSON.stringify({
      requestId: 'seed' + i, actor: 'user:seed', action: 'op', payloadHash: 'h',
      state: state || 'in_flight', createdAt: now, updatedAt: now, attempts: 1,
    }));
  }
}

function pdfFileCount(rt) {
  return rt.drive.activeFiles().filter((f) => f.mime === 'application/pdf').length;
}

const BACKENDS = [
  {
    name: 'app2',
    setup() { return setupApp2({ props: { OPEN_GENERATE: 'true' } }); },
    body(rt, overrides) { return genBody(rt, overrides); },
    send(rt, body) { return rt.postJson(body).json; },
    prep(rt) { rt.net.ai.push(genOk(RECORD_TEXT), modOk()); },
    sideEffects(rt) { return savedCount(rt); },
    ai(rt) { return rt.net.aiCalls(); },
    isOk(res) { return res.ok === true && !!res.item; },
  },
  {
    name: 'pdfdrop',
    setup() {
      const rt = setupPdfdrop();
      rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
      return rt;
    },
    body(rt, overrides) { return pdfBody(rt, overrides); },
    send(rt, body) {
      return rt.postJson(Object.assign({}, body, { parent_origin: 'https://invalid.example' })).json;
    },
    prep() {},
    sideEffects(rt) { return pdfFileCount(rt); },
    ai() { return 0; },
    isOk(res) { return res.ok === true && !!res.name; },
  },
];

for (const be of BACKENDS) {
  test(be.name + ': 台帳が200件を超えても期限内の done receipt を消さず、再送は done を返す', () => {
    const rt = be.setup();
    const c = rt.ctx;
    const first = c.beginIdempotent_('user:a', 'op', 'first', 'h');
    c.finishIdempotentDone_(first.key, first.entry, { id: 'saved' });
    const stored = JSON.parse(rt.props.get(first.key));
    stored.updatedAt = Date.now() - 1000;
    rt.props.set(first.key, JSON.stringify(stored));

    for (let i = 0; i < Number(c.IDEM_MAX_ENTRIES); i++) {
      assert.equal(c.beginIdempotent_('user:a', 'op', 'next' + i, 'h').state, 'new');
    }
    assert.ok(rt.props.has(first.key), '容量整理で期限内 receipt を削除しない');
    assert.equal(c.beginIdempotent_('user:a', 'op', 'first', 'h').state, 'done');
  });

  test(be.name + ': 台帳の初回永続化に失敗したら副作用を一切開始しない', () => {
    const rt = be.setup();
    patchPropsWrites(rt, (k) => k.indexOf(rt.ctx.IDEM_PREFIX) === 0);
    be.prep(rt);
    const body = be.body(rt);
    const res = be.send(rt, body);
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ledger_unavailable');
    assert.equal(be.sideEffects(rt), 0, '保存しない');
    assert.equal(be.ai(rt), 0, 'AI を呼ばない');
  });

  test(be.name + ': 同じ request_id を別 actor が使うと拒否し二重実行しない', () => {
    const rt = be.setup();
    rt.props.set('ALLOWED_EMAILS', TEACHER + ',' + STUDENT);
    const body = be.body(rt);
    be.prep(rt);
    assert.equal(be.isOk(be.send(rt, body)), true);
    const aiAfter = be.ai(rt);
    const res = be.send(rt, Object.assign({}, body, { id_token: tokenFor(rt, STUDENT) }));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'request_id_conflict');
    assert.equal(be.sideEffects(rt), 1, '二重保存しない');
    assert.equal(be.ai(rt), aiAfter, 'AI を再実行しない');
  });

  test(be.name + ': done 書込み失敗時は in_flight を残し、再送で二重実行しない', () => {
    const rt = be.setup();
    patchPropsWrites(rt, (k, v) => {
      if (k.indexOf(rt.ctx.IDEM_PREFIX) !== 0) return false;
      try { return JSON.parse(v).state === 'done'; } catch (e) { return false; }
    });
    const body = be.body(rt);
    be.prep(rt);
    assert.equal(be.isOk(be.send(rt, body)), true);
    const aiAfter = be.ai(rt);
    const replay = be.send(rt, body);
    assert.equal(replay.ok, false);
    assert.equal(replay.code, 'in_flight');
    assert.equal(be.sideEffects(rt), 1, '二重保存しない');
    assert.equal(be.ai(rt), aiAfter, 'AI を再実行しない');
  });

  test(be.name + ': 未知 state / stale in_flight は new に落とさず再実行しない', () => {
    const rt = be.setup();
    const c = rt.ctx;
    const key = c.ledgerKey_('user:a', 'op', 'same');
    rt.props.set(key, JSON.stringify({ state: 'pending_unknown', payloadHash: 'h', updatedAt: Date.now() }));
    assert.equal(c.beginIdempotent_('user:a', 'op', 'same', 'h').state, 'unknown');
    rt.props.set(key, JSON.stringify({
      state: 'in_flight', payloadHash: 'h',
      updatedAt: Date.now() - Number(c.IDEM_STALE_MS) - 1,
    }));
    assert.equal(c.beginIdempotent_('user:a', 'op', 'same', 'h').state, 'unknown');
    rt.props.set(key, '{broken receipt');
    assert.equal(c.beginIdempotent_('user:a', 'op', 'same', 'h').state, 'unknown');
    assert.equal(be.ai(rt), 0);
    assert.equal(be.sideEffects(rt), 0);
  });

  test(be.name + ': 台帳が上限に達したら副作用前に ledger_full で拒否する', () => {
    const rt = be.setup();
    seedLedger(rt, Number(rt.ctx.IDEM_HARD_MAX_ENTRIES), 'in_flight');
    be.prep(rt);
    const res = be.send(rt, be.body(rt));
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ledger_full');
    assert.equal(res.retryable, true);
    assert.equal(be.sideEffects(rt), 0);
    assert.equal(be.ai(rt), 0);
  });
}

test('app2: index 書込みの応答喪失で重複 record を作らず、同IDで AI を再実行しない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const body = genBody(rt, { id_token: '' });
  rt.ctx.getIndexFile_(); // index を先に作る
  const original = rt.ctx.getIndexFile_;
  let fail = true;
  rt.ctx.getIndexFile_ = () => {
    const f = original();
    const set = f.setContent;
    f.setContent = (value) => {
      set(value);
      if (fail) { fail = false; throw new Error('response lost after committed index write'); }
    };
    return f;
  };
  rt.net.ai.push(genOk(RECORD_TEXT), modOk(), genOk(RECORD_TEXT), modOk());

  const first = rt.postJson(body).json;
  assert.equal(first.ok, false);
  assert.equal(first.code, 'pending_unknown', '保存結果不明は成功にしない');
  assert.equal(savedCount(rt), 1, '保存自体は成立している');

  const aiAfter = rt.net.aiCalls();
  const second = rt.postJson(body).json;
  assert.equal(second.ok, false);
  assert.equal(second.code, 'in_flight', '直近 in_flight は照合も再実行もしない');
  assert.equal(rt.net.aiCalls(), aiAfter, '同IDで AI を再実行しない');
  assert.equal(savedCount(rt), 1, '別 record を作らない');
});

test('app2: done 再送時に index が読めなければ空本文の成功にしない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const body = genBody(rt, { id_token: '' });
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt.postJson(body).json.ok, true);

  rt.drive.setContentByName('tadoku-index.json', '{broken');
  rt.cache.clear();
  const aiAfter = rt.net.aiCalls();
  const replay = rt.postJson(body).json;
  assert.equal(replay.ok, false);
  assert.equal(replay.code, 'index_corrupted');
  assert.equal(replay.item, undefined, '空本文の成功を返さない');
  assert.equal(rt.net.aiCalls(), aiAfter);
  assert.equal(rt.drive.findByName('tadoku-index.json').content, '{broken', '破損 index を上書きしない');
});

test('app2: 保存後に削除された record は再生成せず record_unavailable を返す', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const body = genBody(rt, { id_token: '' });
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  const first = rt.postJson(body).json;
  assert.equal(first.ok, true);

  const del = rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    request_id: rid('del-rec'), id: first.item.id,
  }).json;
  assert.equal(del.ok, true);
  assert.equal(savedCount(rt), 0);

  const aiAfter = rt.net.aiCalls();
  const replay = rt.postJson(body).json;
  assert.equal(replay.ok, false);
  assert.equal(replay.code, 'record_unavailable');
  assert.equal(rt.net.aiCalls(), aiAfter, '再生成しない');
  assert.equal(savedCount(rt), 0, '復活させない');
});

test('app2: index の古いキャッシュを正本にせず、キャッシュ更新失敗でも直前の保存/削除を失わない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.props.set('FOLDER_ID', rt.drive.ensureFolder('生成済み長文'));
  const indexName = 'tadoku-index.json';

  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt.postJson(genBody(rt, { id_token: '' })).json.ok, true);
  const a = JSON.parse(rt.drive.findByName(indexName).content).items[0];

  // 別実行が保存した B（Drive 正本にだけ存在し、キャッシュは A のまま＝stale）
  const b = {
    id: 'tadoku-1790000000000-bbbbbbbbbbbb',
    createdAt: '2026-01-01T00:00:00.000Z',
    request_id: 'external-save',
    settings: { level: '3級' },
    title: 'External Story',
    text: 'external body',
  };
  rt.drive.setContentByName(indexName, JSON.stringify({
    version: 1, updatedAt: new Date().toISOString(), items: [b, a], deletedIds: [],
  }));

  // 以降キャッシュ更新は失敗する（旧キャッシュは破棄されるべき）
  patchCachePutFailure(rt);

  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt.postJson(genBody(rt, { id_token: '' })).json.ok, true);
  let saved = JSON.parse(rt.drive.findByName(indexName).content);
  assert.equal(saved.items.length, 3, 'A/B/C が揃う');
  assert.ok(saved.items.some((x) => x.id === b.id), '外部保存分 B を stale キャッシュで消さない');

  const del = rt.postJson({
    action: 'deleteText', token: TOKEN, id_token: tokenFor(rt, TEACHER),
    request_id: rid('cache-del'), id: a.id,
  }).json;
  assert.equal(del.ok, true);
  saved = JSON.parse(rt.drive.findByName(indexName).content);
  assert.equal(saved.items.length, 2);
  assert.ok(saved.items.some((x) => x.id === b.id), '削除でも B を失わない');
  assert.ok(saved.deletedIds.indexOf(a.id) !== -1);
  assert.equal(rt.cache.has('tadoku_index_cache'), false, '更新に失敗した古いキャッシュは破棄する');
});

test('app2: 匿名の quota 拒否を大量送信しても台帳を埋めず、許可ユーザーの新規操作を妨げない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true', MAX_GEN_PER_DEVICE: '1', MAX_GEN_PER_DAY: '2' } });

  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt.postJson(genBody(rt, { id_token: '' })).json.ok, true);

  for (let i = 0; i < 250; i++) {
    const res = rt.postJson(genBody(rt, { id_token: '', request_id: rid('spam' + i) }));
    assert.equal(res.json.code, 'cap_reached', '匿名は上限で拒否');
  }
  assert.ok(rt.ctx.countLiveLedgerEntries_() < 10, '副作用ゼロの拒否で台帳を消費しない');

  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  const teacher = rt.postJson(genBody(rt));
  assert.equal(teacher.json.ok, true, '許可ユーザーは台帳で締め出されない: ' + JSON.stringify(teacher.json).slice(0, 120));
});

test('app2: 上限カウンタの書込み失敗は部分カウントを残さず明示エラーにする', () => {
  // GEN_STATE の書込み失敗 → 端末カウントも進めない
  const rt1 = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  patchPropsWrites(rt1, (k) => k === 'GEN_STATE');
  rt1.net.ai.push(genOk(RECORD_TEXT), modOk());
  const res1 = rt1.postJson(genBody(rt1, { id_token: '' })).json;
  assert.equal(res1.ok, false);
  assert.equal(res1.code, 'quota_write_failed');
  assert.equal(rt1.net.aiCalls(), 0);
  assert.equal(rt1.props.has('DEV_d-abcdefgh1234567'), false, '端末カウントを部分更新しない');
  assert.equal(rt1.ctx.countLiveLedgerEntries_(), 0, '副作用ゼロの attempt は台帳を残さない');

  // 端末カウントの書込み失敗 → 全体カウントだけ進む（安全側）が生成はしない
  const rt2 = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  patchPropsWrites(rt2, (k) => k.indexOf('DEV_') === 0);
  rt2.net.ai.push(genOk(RECORD_TEXT), modOk());
  const res2 = rt2.postJson(genBody(rt2, { id_token: '' })).json;
  assert.equal(res2.ok, false);
  assert.equal(res2.code, 'quota_write_failed');
  assert.equal(rt2.net.aiCalls(), 0);
  assert.equal(genStateCount(rt2), 1, '全体カウントは安全側に進む');
  assert.equal(savedCount(rt2), 0);
});

test('app2: GEN_STATE が壊れていても 0 に戻して上限を素通りさせない', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  const broken = 'x'.repeat(9000);
  rt.props.set('GEN_STATE', broken);
  const res = rt.postJson(genBody(rt, { id_token: '' })).json;
  assert.equal(res.ok, false);
  assert.equal(res.code, 'quota_state_invalid');
  assert.equal(rt.net.aiCalls(), 0);
  assert.equal(savedCount(rt), 0);
  assert.equal(rt.props.get('GEN_STATE'), broken, '壊れた値を勝手に上書きしない');
});

// ────────────────────────────── M1 / L1 追加境界 ──────────────────────────────

test('app2: level に constructor / toString / __proto__ 等を指定しても拒否する（L1）', () => {
  const rt = setupApp2();
  for (const level of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype']) {
    const res = rt.postJson(genBody(rt, { settings: Object.assign({}, BASE_SETTINGS, { level }) })).json;
    assert.equal(res.ok, false, level);
    assert.equal(res.code, 'invalid_settings', level);
  }
  assert.equal(rt.net.aiCalls(), 0);
});

test('app2: 長いタイトルでも record は上限内、台帳 receipt は最小参照だけ（M1）', () => {
  const rt = setupApp2();
  rt.setPropsByteLimit(500 * 1024);
  const longTitle = ('A\u{1F600}').repeat(5000); // サロゲートペアを含む長大タイトル

  for (let i = 0; i < 60; i++) {
    rt.net.ai.push(genOk(longTitle + '\n\nshort body'), modOk());
    const res = rt.postJson(genBody(rt, { request_id: rid('long' + i) })).json;
    assert.equal(res.ok, true, JSON.stringify(res).slice(0, 160));
    assert.ok(res.item.title.length <= 160, 'record.title は上限内');
  }

  const saved = JSON.parse(rt.drive.findByName('tadoku-index.json').content).items;
  assert.equal(saved.length, 60);
  for (const it of saved) {
    assert.ok(it.title.length <= 160);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(it.title), '孤立サロゲートを作らない');
    assert.ok(it.text.length < 100, '本文はそのまま（タイトルだけ制限）');
  }

  assert.ok(rt.ctx.ledgerUsage_().bytes < 40 * 1024, 'done receipt に title 等の大きい値を入れない');
  const receipts = Array.from(rt.props.entries()).filter(([k]) => k.indexOf('IDEM_') === 0);
  assert.equal(receipts.length, 60);
  assert.ok(receipts.every(([, v]) => v.length < 1024), 'receipt 1件は小さい');

  // 正本 properties は枯渇していない（通常の設定書込みが通る）
  rt.ctx.PropertiesService.getScriptProperties().setProperty('PROBE_WRITE', 'ok');
  assert.equal(rt.props.get('PROBE_WRITE'), 'ok');
  assert.ok(rt.propsByteUsage() < 500 * 1024);
});

test('app2: 長いタイトルを大量生成しても properties を食い尽くさない', () => {
  const rt = setupApp2();
  rt.setPropsByteLimit(500 * 1024);
  const longTitle = ('T\u{1F600}').repeat(8000);
  let okCount = 0;
  let refused = null;
  for (let i = 0; i < 200; i++) {
    rt.net.ai.push(genOk(longTitle + '\n\nbody'), modOk());
    const res = rt.postJson(genBody(rt, { request_id: rid('bulk' + i) })).json;
    if (res.ok) { okCount++; continue; }
    refused = res;
    break;
  }
  if (refused) {
    assert.equal(refused.code, 'ledger_full', JSON.stringify(refused).slice(0, 160));
  }
  assert.ok(okCount > 0);
  assert.ok(rt.ctx.ledgerUsage_().bytes <= rt.ctx.IDEM_BYTE_BUDGET, '台帳は予算内に収まる');
  // サービス上限（500KB）に達しておらず、設定の書込みがまだ通る
  rt.ctx.PropertiesService.getScriptProperties().setProperty('PROBE_WRITE2', 'ok');
  assert.equal(rt.props.get('PROBE_WRITE2'), 'ok');
  assert.ok(rt.propsByteUsage() < 500 * 1024);
});

for (const be of BACKENDS) {
  test(be.name + ': 台帳の総バイト予算超過は ledger_full で拒否し properties を食い尽くさない', () => {
    const rt = be.setup();
    rt.setPropsByteLimit(500 * 1024);
    const now = Date.now();
    const bigValue = JSON.stringify({
      requestId: 'x', actor: 'a', action: 'op', payloadHash: 'h',
      state: 'in_flight', createdAt: now, updatedAt: now, attempts: 1, error: 'e'.repeat(7000),
    });
    for (let i = 0; i < 50; i++) rt.props.set('IDEM_big' + String(i).padStart(4, '0'), bigValue); // 約7.3KB×50≒365KB

    const longId = 'r'.repeat(96) + '0123456789abcdef'; // 112文字（最大級）
    const longActor = 'user:' + 'a'.repeat(100) + '@example.com';
    const res = rt.ctx.beginIdempotent_(longActor, 'op', longId, 'h');
    assert.equal(res.state, 'ledger_full');
    // 正本 properties には余裕が残る（config 書込みが通る）
    rt.ctx.PropertiesService.getScriptProperties().setProperty('GEN_STATE', '20261025:0');
    assert.ok(rt.propsByteUsage() < 500 * 1024);
  });
}

test('app2: 公開 getSavedTexts は内部 request_id を返さない（保存 record には残す）', () => {
  const rt = setupApp2({ props: { OPEN_GENERATE: 'true' } });
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  assert.equal(rt.postJson(genBody(rt, { id_token: '' })).json.ok, true);

  const list = rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' }).json;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].request_id, undefined, '公開返却に内部IDを出さない');
  assert.ok(list.items[0].title);

  const stored = JSON.parse(rt.drive.findByName('tadoku-index.json').content).items[0];
  assert.ok(stored.request_id, '保存 record には残す（stale 照合用）');
});

test('app2: 過大な raw body は JSON.parse 前に拒否する', () => {
  const rt = setupApp2();
  const huge = JSON.stringify({
    action: 'generateText', token: TOKEN, request_id: rid('huge'),
    settings: Object.assign({}, BASE_SETTINGS, { prompt: 'x'.repeat(40000) }),
  });
  assert.ok(huge.length > 24 * 1024);
  const res = rt.postRaw(huge).json;
  assert.equal(res.code, 'payload_too_large');
  assert.equal(rt.net.aiCalls(), 0);

  const resForm = rt.postForm({
    action: 'generateText', token: TOKEN, request_id: rid('huge2'),
    settings: Object.assign({}, BASE_SETTINGS, { prompt: 'y'.repeat(40000) }),
  }).json;
  assert.equal(resForm.code, 'payload_too_large');
  assert.equal(rt.net.aiCalls(), 0);
});

test('pdfdrop: 過大 body は parse 前に拒否しつつ 10MB 級 PDF は許容する', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  const requiredFor10MB = Math.ceil((10 * 1024 * 1024) / 3) * 4;
  assert.ok(rt.ctx.MAX_BODY_CHARS > requiredFor10MB, '10MB PDF の base64 が収まる上限');

  const oversized = 'data=' + 'A'.repeat(rt.ctx.MAX_BODY_CHARS * 3 + 8192);
  const res = rt.postRaw(oversized).json;
  assert.equal(res.code, 'payload_too_large');
  assert.equal(pdfFileCount(rt), 0);

  // 100KB の正規 PDF は通る
  const body = Buffer.concat([Buffer.from(PDF_BYTES, 'utf8'), Buffer.alloc(100 * 1024, 0x20)]);
  const res2 = rt.postJson(Object.assign({}, pdfBody(rt), {
    b64: body.toString('base64'), parent_origin: 'https://invalid.example',
  })).json;
  assert.equal(res2.ok, true, JSON.stringify(res2).slice(0, 160));
  assert.equal(pdfFileCount(rt), 1);
});

test('pdfdrop: 公開 status は生の last_error / last_ok を表示しない', () => {
  const rt = setupPdfdrop();
  rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
  rt.props.set('LAST_ERROR', 'secret internal detail');
  rt.props.set('LAST_OK', 'secret ok detail');
  const res = rt.get({});
  assert.equal(res.isHtml, true);
  assert.equal(res.text.indexOf('secret internal detail'), -1);
  assert.equal(res.text.indexOf('secret ok detail'), -1);
  assert.ok(res.text.indexOf('ready') !== -1, '簡易 health のみ');
});

// ────────────────────────────── 最終独立検証の回帰（予算・clone・metadata） ──────────────────────────────

function stalePdfReceipt(rt, requestId, name, size) {
  const key = rt.ctx.ledgerKey_('user:' + TEACHER, 'pdfdrop', requestId);
  rt.props.set(key, JSON.stringify({
    actor: 'user:' + TEACHER, action: 'pdfdrop',
    payloadHash: rt.ctx.sha256Hex_('pdfdrop\n' + PDF_B64 + '\n' + name).slice(0, 32),
    state: 'in_flight', updatedAt: Date.now() - Number(rt.ctx.IDEM_STALE_MS) - 1000,
    attempts: 1, expectedName: name, expectedSize: size,
  }));
  return key;
}

for (const be of BACKENDS) {
  test(be.name + ': 600件の in_flight を最大バイトの失敗で完了しても台帳は上限内・config 4KB 書込み可能', () => {
    const rt = be.setup();
    rt.setPropsByteLimit(500 * 1024);
    const c = rt.ctx;
    const entries = [];
    for (let i = 0; i < 600; i++) {
      const b = c.beginIdempotent_(
        'user:' + TEACHER,
        be.name === 'app2' ? 'generateText' : 'pdfdrop',
        rid('maxfail' + i),
        'f'.repeat(64),
        be.name === 'app2' ? '' : 'a'.repeat(116) + '.pdf',
        be.name === 'app2' ? null : 8000000
      );
      if (b.state !== 'new') break;
      entries.push(b);
    }
    assert.equal(entries.length, 600, '600件の in_flight を作れる（receipts=' + entries.length + '）');

    let errorText = '界'.repeat(50000);
    if (be.name === 'app2') {
      rt.net.ai.push({ code: 503, body: { error: { message: errorText } } });
      try {
        c.generatePassage_(BASE_SETTINGS);
        assert.fail('provider should fail');
      } catch (e) {
        errorText = e.message;
      }
    }
    for (const b of entries) {
      assert.equal(c.finishIdempotentFailed_(b.key, b.entry, errorText), true, '予算内で全件 failed を書ける');
    }
    assert.ok(c.ledgerUsage_().bytes <= c.IDEM_BYTE_CEILING, 'ledger=' + c.ledgerUsage_().bytes);
    assert.equal(c.countLiveLedgerEntries_(), 600, 'receipt を勝手に消さない');

    // 正本 properties にはまだ余裕（4KB の設定更新が通る）
    rt.ctx.PropertiesService.getScriptProperties().setProperty('CONFIG_4KB', 'c'.repeat(4096));
    assert.equal(rt.props.get('CONFIG_4KB').length, 4096);

    // 既存 receipt は重複防止のまま（done に戻らない）
    const stored = JSON.parse(rt.props.get(entries[0].key));
    assert.equal(stored.state, 'failed');
    assert.equal(stored.error.length, 200);
  });

  test(be.name + ': 極端に長い actor / request_id は副作用前に ledger_full で拒否', () => {
    const rt = be.setup();
    const c = rt.ctx;
    rt.setPropsByteLimit(500 * 1024);
    const res = c.beginIdempotent_('user:' + 'a'.repeat(400000), 'op', 'r'.repeat(400000), 'h');
    assert.equal(res.state, 'ledger_full');
    assert.equal(c.countLiveLedgerEntries_(), 0);
    assert.equal(be.ai(rt), 0);
    assert.equal(be.sideEffects(rt), 0);
  });

  test(be.name + ': config80KiB+DEV20KiB 環境でも 600 in_flight 完了ストレス後に config 4KiB を追加できる', () => {
    const rt = be.setup();
    rt.setPropsByteLimit(500 * 1024);
    const api = rt.ctx.PropertiesService.getScriptProperties();
    const c = rt.ctx;

    // 既存設定 80KiB ＋ DEV 相当 20KiB
    api.setProperty('CONFIG_BIG', 'c'.repeat(80 * 1024));
    for (let i = 0; i < 100; i++) api.setProperty('DEV_seed' + i, 'd'.repeat(200));
    const baseBytes = rt.propsByteUsage();

    // 600 件の in_flight
    const entries = [];
    for (let i = 0; i < 600; i++) {
      const b = c.beginIdempotent_(
        'user:' + TEACHER,
        be.name === 'app2' ? 'generateText' : 'pdfdrop',
        rid('cfgstress' + i),
        'f'.repeat(64),
        be.name === 'app2' ? '' : 'a'.repeat(116) + '.pdf',
        be.name === 'app2' ? null : 8000000
      );
      assert.equal(b.state, 'new', 'receipt ' + i);
      entries.push(b);
    }

    // 最悪の 200 文字エラーで全件 finish（上限に達した分は拒否され in_flight のまま）
    let errorText = '界'.repeat(50000);
    if (be.name === 'app2') {
      rt.net.ai.push({ code: 503, body: { error: { message: errorText } } });
      try { c.generatePassage_(BASE_SETTINGS); assert.fail('provider should fail'); } catch (e) { errorText = e.message; }
    }
    let written = 0;
    let refused = 0;
    for (const b of entries) {
      if (c.finishIdempotentFailed_(b.key, b.entry, errorText)) written++;
      else refused++;
    }
    assert.ok(written > 0, '少なくとも一部は書ける');
    assert.equal(written + refused, 600);

    // 全 properties は予算内（Service 500KiB に達していない）
    assert.ok(rt.propsByteUsage() <= c.PROP_TOTAL_CEILING, 'global=' + rt.propsByteUsage());
    assert.ok(rt.propsByteUsage() <= 500 * 1024 - 4096, '4KiB 追加分が残っている');

    // ストレス後でも config 4KiB を追加できる
    api.setProperty('CONFIG_ADD_4KB', 'x'.repeat(4096));
    assert.equal(rt.props.get('CONFIG_ADD_4KB').length, 4096);

    // receipt は勝手に消さず、ユーザ設定も消さない
    assert.equal(c.countLiveLedgerEntries_(), 600);
    assert.equal(rt.props.get('CONFIG_BIG').length, 80 * 1024);
    assert.ok(rt.propsByteUsage() > baseBytes);

    // 再送しても副作用ゼロ（重複防止維持）
    const aiBefore = be.ai(rt);
    const after = be.send(rt, be.body(rt));
    assert.equal(after.code, 'ledger_full');
    assert.equal(be.ai(rt), aiBefore);
  });
}

test('app2: 初回生成の返却 item にも内部 request_id を含めない（再送・一覧も同様）', () => {
  const rt = setupApp2();
  rt.net.ai.push(genOk(RECORD_TEXT), modOk());
  const body = genBody(rt);
  const first = rt.postJson(body).json;
  assert.equal(first.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(first.item, 'request_id'), false, '初回から公開しない');

  const replay = rt.postJson(body).json;
  assert.equal(replay.replayed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(replay.item, 'request_id'), false, '再送でも公開しない');

  const list = rt.get({ action: 'getSavedTexts', token: TOKEN, callback: '__cb' }).json;
  assert.equal(Object.prototype.hasOwnProperty.call(list.items[0], 'request_id'), false, '一覧でも公開しない');

  const stored = JSON.parse(rt.drive.findByName('tadoku-index.json').content).items[0];
  assert.ok(stored.request_id, '保存 record には残す（復旧照合用）');
});

test('pdfdrop: 復旧メタデータは request_id / size の完全一致のみ許可する', () => {
  const name = 'genkoshi_test.pdf';
  const size = Buffer.from(PDF_BYTES, 'utf8').length;
  const cases = [
    { label: 'suffix', desc: (id) => 'request_id=' + id + '-other;size=' + size, expect: false },
    { label: 'prefix', desc: (id) => 'request_id=prefix-' + id + ';size=' + size, expect: false },
    { label: 'duplicate', desc: (id) => 'request_id=' + id + ';request_id=' + id + ';size=' + size, expect: false },
    { label: 'size-extra-digit', desc: (id) => 'request_id=' + id + ';size=' + size + '9', expect: false },
    { label: 'size-mismatch', desc: (id) => 'request_id=' + id + ';size=' + (size + 1), expect: false },
    { label: 'size-leading-zero', desc: (id) => 'request_id=' + id + ';size=0' + size, expect: false },
    { label: 'request-id-only', desc: (id) => 'request_id=' + id, expect: false },
    { label: 'no-metadata', desc: () => '', expect: false },
    { label: 'exact', desc: (id) => 'request_id=' + id + ';size=' + size, expect: true },
    { label: 'exact-with-extras', desc: (id) => 'x=1;request_id=' + id + ';size=' + size + ';y=2', expect: true },
  ];

  for (const cse of cases) {
    const rt = setupPdfdrop();
    rt.props.set('DROP_FOLDER_ID', rt.drive.ensureFolder('受信PDF'));
    const requestId = rid('meta');
    const f = rt.drive.addFile('受信PDF', name, PDF_BYTES);
    f.mime = 'application/pdf';
    f.description = cse.desc(requestId);
    stalePdfReceipt(rt, requestId, name, size);

    const res = JSON.parse(/var m=(\{.*?\});/.exec(rt.postForm(pdfBody(rt, { request_id: requestId })).text)[1]).payload;
    assert.equal(res.ok, cse.expect, cse.label + ' -> ' + res.code);
    assert.equal(pdfFileCount(rt), 1, cse.label + ': 再保存しない');
    if (cse.expect) assert.equal(res.recovered, true, cse.label);
    else assert.equal(res.code, 'pending_unknown', cse.label);
  }
});
