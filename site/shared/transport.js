/*!
 * site/shared/transport.js
 * 学習ツール静的フロント共通の認証・通信ヘルパー（portal / app2 / app9 / debug-probe 用）
 *
 * 方針:
 *  - JSONP / iframe / fetch はすべて有限時間で必ず settle し、timer・script・iframe・form・listener を後始末する
 *  - iframe の postMessage は rid（暗号学的乱数）と origin allowlist と送信元 window 連鎖で検証する
 *  - 変更系 POST は request_id を必須にし、Worker→Direct の再送でも同じ値を使う
 *  - id_token の exp 判定はクライアントUX用。サーバ認証の代用にはしない
 */
(function (window) {
  'use strict';
  if (!window || window.GakusyuTransport) return;

  var TOKEN_KEY = 'gis_id_token';
  var EXP_SKEW_SEC = 30;
  var DEFAULT_EXTRA_ORIGINS = ['https://gakusyu-tools-proxy.hori-shota.workers.dev'];
  var DEFAULT_PAGES_ORIGIN = 'https://hori366191-ship-it.github.io';
  var GOOGLE_USER_CONTENT = 'googleusercontent.com';
  var extraOrigins = DEFAULT_EXTRA_ORIGINS.slice();
  var MESSAGES = {
    unknownResult: '処理中または通信が不安定なため、処理結果を確認できませんでした。連続で再送せず、しばらく待って履歴や保存先を確認してください。',
    loginRequired: 'Googleにログインしていないか、ログインの有効期限が切れています。ポータルの「教室用ログイン」からログインし直してください。'
  };

  function now() { return Date.now(); }
  function clampMs(value, dflt, min, max) {
    var v = Number(value);
    if (!isFinite(v) || v <= 0) v = dflt;
    var lo = min || 50, hi = max || 30000;
    return Math.max(lo, Math.min(hi, v));
  }
  function base36(n) {
    try { return Number(n).toString(36); } catch (e) { return String(n); }
  }
  function randomChars(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
  function cryptoObj() { try { return window.crypto || null; } catch (e) { return null; } }
  function randomBytes(size) {
    try {
      var c = cryptoObj();
      if (c && typeof c.getRandomValues === 'function') {
        var arr = new Uint8Array(size);
        c.getRandomValues(arr);
        return arr;
      }
    } catch (e) {}
    return null;
  }
  function bytesToBase64Url(bytes) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var has1 = i + 1 < bytes.length, has2 = i + 2 < bytes.length;
      var b1 = has1 ? bytes[i + 1] : 0;
      var b2 = has2 ? bytes[i + 2] : 0;
      out += chars.charAt(b0 >> 2);
      out += chars.charAt(((b0 & 3) << 4) | (b1 >> 4));
      out += has1 ? chars.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';
      out += has2 ? chars.charAt(b2 & 63) : '=';
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesToHex(bytes) {
    var hex = '0123456789abcdef';
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += hex.charAt(bytes[i] >> 4) + hex.charAt(bytes[i] & 15);
    return out;
  }

  // ---- 乱数（request_id / rid） ----
  function newRequestId() {
    try {
      var c = cryptoObj();
      if (c && typeof c.randomUUID === 'function') {
        var uuid = String(c.randomUUID());
        if (/^[A-Za-z0-9_-]{16,128}$/.test(uuid)) return uuid;
      }
    } catch (e) {}
    var bytes = randomBytes(16);
    if (bytes) return bytesToHex(bytes);
    return 'r' + base36(now()) + randomChars(20); // 最終フォールバック（crypto非対応環境）
  }
  function newNonce(size) {
    var bytes = randomBytes(size || 24);
    if (bytes) return bytesToBase64Url(bytes);
    return 'n' + base36(now()) + randomChars(24);
  }
  function isRequestId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value); }
  function isRid(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value); }

  // ---- id_token（クライアントUX判定のみ。サーバ認証の代用ではない） ----
  function getStorage() { try { return window.localStorage || null; } catch (e) { return null; } }
  function readStoredToken() {
    var s = getStorage();
    if (!s) return '';
    try { return String(s.getItem(TOKEN_KEY) || ''); } catch (e) { return ''; }
  }
  function base64UrlToJson(part) {
    var s = String(part || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = null;
    try { bin = window.atob ? window.atob(s) : null; } catch (e) { bin = null; }
    if (bin === null) return null;
    try { return JSON.parse(bin); } catch (e) {}
    try {
      var TD = window.TextDecoder;
      if (typeof TD === 'function') {
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
        return JSON.parse(new TD('utf-8').decode(bytes));
      }
    } catch (e2) {}
    return null;
  }
  function inspectToken(token, nowMs) {
    if (typeof token !== 'string' || !token) return { valid: false, reason: 'empty' };
    var parts = token.split('.');
    if (parts.length !== 3) return { valid: false, reason: 'malformed' };
    if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
      return { valid: false, reason: 'malformed' };
    }
    var header = base64UrlToJson(parts[0]);
    if (!header || typeof header !== 'object') return { valid: false, reason: 'bad_header' };
    var payload = base64UrlToJson(parts[1]);
    if (!payload || typeof payload !== 'object') return { valid: false, reason: 'bad_payload' };
    if (typeof payload.exp !== 'number' || !isFinite(payload.exp)) return { valid: false, reason: 'no_exp' };
    var t = (typeof nowMs === 'number' ? nowMs : now()) / 1000;
    if (payload.exp <= t + EXP_SKEW_SEC) return { valid: false, reason: 'expired', payload: payload };
    return {
      valid: true,
      payload: payload,
      email: typeof payload.email === 'string' ? payload.email : '',
      expiresAt: payload.exp * 1000
    };
  }
  function notifyAuthChange(reason) {
    try {
      if (typeof window.dispatchEvent !== 'function') return;
      var ev;
      if (typeof window.CustomEvent === 'function') {
        ev = new window.CustomEvent('gakusyu:authchange', { detail: { reason: reason || '' } });
      } else if (window.document && window.document.createEvent) {
        ev = window.document.createEvent('Event');
        ev.initEvent('gakusyu:authchange', false, false);
      }
      if (ev) window.dispatchEvent(ev);
    } catch (e) {}
  }
  function clearStoredToken(reason) {
    var s = getStorage();
    var had = false;
    if (s) {
      try { had = !!s.getItem(TOKEN_KEY); s.removeItem(TOKEN_KEY); } catch (e) {}
    }
    if (had) notifyAuthChange(reason || 'cleared');
  }
  function getIdToken() {
    var raw = readStoredToken();
    if (!raw) return '';
    var st = inspectToken(raw);
    if (!st.valid) {
      clearStoredToken(st.reason);
      return '';
    }
    return raw;
  }
  // 破棄せずに保存値を覗く（「期限切れだった」ことをUIで説明する用途のみ）
  function peekIdToken() { return readStoredToken(); }
  // 冪等操作のactor識別（UX用。サーバ認証の代用ではない）
  function actorKey(idToken, deviceId) {
    var st = inspectToken(idToken || '');
    if (st.valid) {
      var id = st.payload.sub || st.email || 'verified';
      return 'user:' + String(id).toLowerCase();
    }
    return 'anon:' + String(deviceId || '');
  }
  function setIdToken(token) {
    if (!token) { clearStoredToken('removed'); return ''; }
    var st = inspectToken(token);
    if (!st.valid) { clearStoredToken(st.reason); return ''; }
    var s = getStorage();
    if (!s) return token;
    var prev = '';
    try { prev = String(s.getItem(TOKEN_KEY) || ''); } catch (e) {}
    try { s.setItem(TOKEN_KEY, token); } catch (e) { return token; }
    if (prev !== token) notifyAuthChange('set');
    return token;
  }
  function clearIdToken() { clearStoredToken('removed'); }
  function onAuthChange(handler) {
    if (typeof handler !== 'function') return function () {};
    function onStorage(e) {
      try {
        if (e && e.key !== TOKEN_KEY && e.key !== null && e.key !== undefined) return;
        handler(getIdToken());
      } catch (err) {}
    }
    function onCustom() { try { handler(getIdToken()); } catch (err) {} }
    try { window.addEventListener('storage', onStorage); } catch (e) {}
    try { window.addEventListener('gakusyu:authchange', onCustom); } catch (e) {}
    return function () {
      try { window.removeEventListener('storage', onStorage); } catch (e) {}
      try { window.removeEventListener('gakusyu:authchange', onCustom); } catch (e) {}
    };
  }

  // ---- GIS（Google Identity Services）読込待ち（無限リトライしない） ----
  function hasGis() {
    try {
      return !!(window.google && window.google.accounts && window.google.accounts.id && typeof window.google.accounts.id.initialize === 'function');
    } catch (e) { return false; }
  }
  function waitForGis(opts) {
    opts = opts || {};
    var timeoutMs = clampMs(opts.timeoutMs, 8000, 500, 30000);
    var intervalMs = clampMs(opts.intervalMs, 300, 100, 2000);
    var start = now();
    return new Promise(function (resolve) {
      var timer = null;
      function tick() {
        if (hasGis()) { resolve(true); return; }
        var left = timeoutMs - (now() - start);
        if (left <= 0) { resolve(false); return; }
        timer = setTimeout(tick, Math.min(intervalMs, left));
      }
      tick();
    });
  }

  // ---- origin / source / message 検証 ----
  function parseUrl(value) {
    try {
      var U = window.URL || (typeof URL !== 'undefined' ? URL : null);
      if (!U) return null;
      return new U(String(value));
    } catch (e) { return null; }
  }
  function originOf(value) {
    var u = parseUrl(value);
    if (!u) return '';
    try {
      var o = String(u.origin || '');
      return o === 'null' ? '' : o;
    } catch (e) { return ''; }
  }
  function locationOrigin() { return originOf(window.location && window.location.href ? window.location.href : ''); }
  // backend の parent_origin allowlist（Pages / http loopback）に一致する時だけ送る。
  // 一致しない場合は未指定（旧互換 '*'）にして、応答がJSONに落ちるのを避ける。
  function parentOriginForBackend() {
    var o = locationOrigin();
    if (!o) return '';
    if (o === DEFAULT_PAGES_ORIGIN) return o;
    var u = parseUrl(o);
    if (u && String(u.protocol).toLowerCase() === 'http:' && isLocalDevHost(String(u.hostname).toLowerCase(), 'http:')) return o;
    return '';
  }
  function configure(opts) {
    opts = opts || {};
    var list = opts.origins || opts.extraOrigins;
    if (!list) return;
    if (!(list instanceof Array)) list = [list];
    for (var i = 0; i < list.length; i++) {
      var o = originOf(list[i]);
      if (o && extraOrigins.indexOf(o) === -1) extraOrigins.push(o);
    }
  }
  function isLocalDevHost(host, proto) {
    if (proto !== 'http:' && proto !== 'https:') return false;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  }
  function isAllowedOrigin(origin, allow) {
    if (typeof origin !== 'string' || !origin) return false;
    var u = parseUrl(origin);
    if (!u) return false;
    var normalized = '';
    try { normalized = String(u.origin || ''); } catch (e) { return false; }
    if (!normalized || normalized === 'null') return false;
    // パス・クエリ・userinfo付きは不可（完全一致のみ）
    if (normalized !== origin) return false;
    var host = String(u.hostname || '').toLowerCase();
    var proto = String(u.protocol || '').toLowerCase();
    if (proto === 'https:' && host === 'script.google.com') return true;
    if (proto === 'https:' && (host === GOOGLE_USER_CONTENT || host.slice(-(GOOGLE_USER_CONTENT.length + 1)) === '.' + GOOGLE_USER_CONTENT)) return true;
    if (extraOrigins.indexOf(normalized) !== -1) return true;
    if (allow) {
      if (!(allow instanceof Array)) allow = [allow];
      for (var i = 0; i < allow.length; i++) {
        if (originOf(allow[i]) === normalized) return true;
      }
    }
    if (isLocalDevHost(host, proto)) return true;
    return false;
  }
  function sourceReaches(source, iframe, maxDepth) {
    if (!source) return false;
    var target = null;
    try { target = iframe && iframe.contentWindow; } catch (e) { target = null; }
    if (!target) return false;
    if (source === target) return true;
    var cur = source;
    var depth = (typeof maxDepth === 'number' && maxDepth > 0) ? maxDepth : 4;
    for (var i = 0; i < depth; i++) {
      var parent = null;
      try { parent = cur.parent; } catch (e) { return false; }
      if (!parent || parent === cur) return false;
      if (parent === target) return true;
      cur = parent;
    }
    return false;
  }
  function ridMatches(rid, rids) {
    if (!rids) return false;
    if (typeof rids === 'string') return rid === rids;
    if (rids instanceof Array) return rids.indexOf(rid) !== -1;
    if (typeof rids.has === 'function') { try { return !!rids.has(rid); } catch (e) { return false; } }
    return false;
  }
  /**
   * 受信メッセージ検証。
   * opts: { iframe, rids, kinds, origins, maxDepth, requireRid }
   * 戻り値: {ok:true,kind,rid,payload,data} / {ok:false,reason}
   */
  function readMessage(event, opts) {
    opts = opts || {};
    if (!event || !event.data || typeof event.data !== 'object') return { ok: false, reason: 'nodata' };
    if (!event.source || event.source === window) return { ok: false, reason: 'selfsource' };
    if (opts.iframe && !sourceReaches(event.source, opts.iframe, opts.maxDepth)) return { ok: false, reason: 'source' };
    if (!isAllowedOrigin(event.origin, opts.origins)) return { ok: false, reason: 'origin' };
    var d = event.data;
    var kinds = opts.kinds || ['genkoProbe', 'genko'];
    var kind = '';
    for (var i = 0; i < kinds.length; i++) {
      if (d[kinds[i]] === true) { kind = kinds[i]; break; }
    }
    if (!kind) return { ok: false, reason: 'shape' };
    var rid = typeof d.rid === 'string' ? d.rid : '';
    if (opts.requireRid !== false) {
      if (!isRid(rid)) return { ok: false, reason: 'rid_shape' };
      if (!ridMatches(rid, opts.rids)) return { ok: false, reason: 'rid_mismatch' };
    }
    if (!Object.prototype.hasOwnProperty.call(d, 'payload') || d.payload === undefined) {
      return { ok: false, reason: 'payload' };
    }
    return { ok: true, kind: kind, rid: rid, payload: d.payload, data: d };
  }

  // ---- DOM後始末 ----
  function removeNode(node) {
    if (!node) return;
    try {
      if (typeof node.remove === 'function') { node.remove(); return; }
    } catch (e) {}
    try {
      if (node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
    } catch (e) {}
  }
  function appendQuery(url, query) {
    if (!query) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + query;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // PDFファイル名（request_id入り）。秒まで同じでもpollの同名誤成功を防ぐ
  function buildPdfName(n, l, requestId, dateObj) {
    var d = (dateObj instanceof Date) ? dateObj : new Date();
    var tag = String(requestId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 36) || String(now());
    return 'genkoshi_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
      + '_' + tag + '_' + n + 'x' + l + '.pdf';
  }
  function makeCallbackName() {
    return '__gkjsonp_' + base36(now()) + '_' + randomChars(10);
  }

  // ---- JSONP（timeout / onerror / 成功のすべてで必ず settle し後始末する） ----
  function jsonp(url, opts) {
    opts = opts || {};
    var timeoutMs = clampMs(opts.timeoutMs, 8000, 50);
    var start = now();
    var doc = window.document;
    if (!doc || typeof doc.createElement !== 'function' || !doc.head) {
      return Promise.resolve({ ok: false, error: 'nodoc', via: 'jsonp', ms: 0, rid: opts.rid || '' });
    }
    var cbName = opts.callbackName && /^[A-Za-z0-9_.]{1,64}$/.test(String(opts.callbackName)) ? String(opts.callbackName) : makeCallbackName();
    return new Promise(function (resolve) {
      var script = doc.createElement('script');
      var settled = false;
      var timer = null;
      function cleanup() {
        if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; }
        try { script.onerror = null; } catch (e) {}
        removeNode(script);
        try {
          if (Object.prototype.hasOwnProperty.call(window, cbName)) delete window[cbName];
          else window[cbName] = undefined;
        } catch (e) {
          try { window[cbName] = undefined; } catch (e2) {}
        }
      }
      function finish(res) {
        if (settled) return;
        settled = true;
        cleanup();
        res.via = 'jsonp';
        if (!res.rid) res.rid = opts.rid || '';
        res.ms = now() - start;
        resolve(res);
      }
      try {
        window[cbName] = function (data) {
          // JSONPはMessageEventではないため、応答にridが含まれる場合だけ照合する（GAS新契約）
          if (opts.rid && data && typeof data === 'object' && typeof data.rid === 'string' && data.rid !== opts.rid) {
            finish({ ok: false, error: 'rid_mismatch' });
            return;
          }
          finish({ ok: true, data: data });
        };
      }
      catch (e) { finish({ ok: false, error: 'callback_assign' }); return; }
      script.onerror = function () { finish({ ok: false, error: 'onerror' }); };
      timer = setTimeout(function () { finish({ ok: false, error: 'timeout' }); }, timeoutMs);
      script.src = appendQuery(url, 'callback=' + cbName + (opts.cacheBust === false ? '' : '&t=' + now()));
      try { doc.head.appendChild(script); }
      catch (e) { finish({ ok: false, error: 'append' }); }
    });
  }

  // ---- iframe GET（probe専用フォールバック。rid / parent_origin 付き） ----
  function getViaIframe(url, opts) {
    opts = opts || {};
    var doc = window.document;
    var rid = opts.rid || newNonce();
    var timeoutMs = clampMs(opts.timeoutMs, 5000, 50);
    var start = now();
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) {
      return Promise.resolve({ ok: false, error: 'nodoc', via: 'iframe', rid: rid, ms: 0 });
    }
    return new Promise(function (resolve) {
      var iframe = doc.createElement('iframe');
      iframe.style.display = 'none';
      try { if (iframe.setAttribute) iframe.setAttribute('aria-hidden', 'true'); } catch (e) {}
      var settled = false;
      var timer = null;
      function cleanup() {
        if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; }
        try { window.removeEventListener('message', onMsg); } catch (e) {}
        removeNode(iframe);
      }
      function finish(res) {
        if (settled) return;
        settled = true;
        cleanup();
        res.via = 'iframe';
        res.rid = rid;
        res.ms = now() - start;
        resolve(res);
      }
      function onMsg(ev) {
        var m = readMessage(ev, {
          iframe: iframe,
          rids: rid,
          kinds: opts.kinds || ['genkoProbe'],
          origins: opts.origins,
          maxDepth: opts.maxDepth
        });
        if (!m.ok) return;
        finish({ ok: true, data: m.payload, kind: m.kind });
      }
      try { window.addEventListener('message', onMsg); }
      catch (e) { finish({ ok: false, error: 'listener' }); return; }
      timer = setTimeout(function () { finish({ ok: false, error: 'timeout' }); }, timeoutMs);
      var parentOrigin = parentOriginForBackend();
      iframe.src = appendQuery(url, 'rid=' + encodeURIComponent(rid) + (parentOrigin ? '&parent_origin=' + encodeURIComponent(parentOrigin) : '') + '&t=' + now());
      try { doc.body.appendChild(iframe); }
      catch (e) { finish({ ok: false, error: 'append' }); }
    });
  }

  // ---- iframe POST（probe / PDF。message は rid + origin + source を検証） ----
  function postForm(opts) {
    opts = opts || {};
    var doc = window.document;
    var kind = opts.kind || 'genkoProbe';
    var payload = opts.payload;
    var rid = opts.rid || (payload && payload.rid) || newNonce();
    var timeoutMs = clampMs(opts.timeoutMs, 8000, 50);
    var start = now();
    if (!payload || typeof payload !== 'object') {
      return Promise.resolve({ ok: false, error: 'nopayload', via: 'post', rid: rid, ms: 0 });
    }
    if (opts.requestIdRequired !== false && kind === 'genko' && !isRequestId(payload.request_id)) {
      return Promise.resolve({ ok: false, error: 'request_id_required', via: 'post', rid: rid, ms: 0 });
    }
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) {
      return Promise.resolve({ ok: false, error: 'nodoc', via: 'post', rid: rid, ms: 0 });
    }
    if (opts.injectRid !== false && payload.rid === undefined) payload.rid = rid;
    var parentOrigin = parentOriginForBackend();
    if (payload.parent_origin === undefined && parentOrigin) payload.parent_origin = parentOrigin;
    return new Promise(function (resolve) {
      var iframe = doc.createElement('iframe');
      iframe.style.display = 'none';
      iframe.name = '__gkpost_' + base36(now()) + '_' + randomChars(8);
      var form = doc.createElement('form');
      form.method = 'POST';
      form.action = opts.url;
      form.target = iframe.name;
      var input = doc.createElement('input');
      input.type = 'hidden';
      input.name = opts.fieldName || 'data';
      try { input.value = JSON.stringify(payload); } catch (e) { input.value = ''; }
      form.appendChild(input);
      var settled = false;
      var timer = null;
      function cleanup() {
        if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; }
        try { window.removeEventListener('message', onMsg); } catch (e) {}
        removeNode(form);
        removeNode(iframe);
      }
      function finish(res) {
        if (settled) return;
        settled = true;
        cleanup();
        res.via = 'post';
        res.rid = rid;
        res.ms = now() - start;
        resolve(res);
      }
      function onMsg(ev) {
        var m = readMessage(ev, {
          iframe: iframe,
          rids: rid,
          kinds: [kind],
          origins: opts.origins,
          maxDepth: opts.maxDepth
        });
        if (!m.ok) return;
        finish({ ok: true, data: m.payload, kind: m.kind });
      }
      try { window.addEventListener('message', onMsg); }
      catch (e) { finish({ ok: false, error: 'listener' }); return; }
      timer = setTimeout(function () { finish({ ok: false, error: 'timeout' }); }, timeoutMs);
      try {
        doc.body.appendChild(iframe);
        doc.body.appendChild(form);
        form.submit();
      } catch (e) {
        finish({ ok: false, error: 'submit' });
      }
    });
  }

  /**
   * 同一 payload（=同一 request_id / rid）で複数URLへ順番にPOSTする。
   * Worker が応答しない場合の Direct 再送用。request_id 無しでは送信しない。
   */
  function postFormSequence(urls, opts) {
    opts = opts || {};
    var list = (urls || []).filter(Boolean);
    var payload = opts.payload || {};
    var rid = opts.rid || payload.rid || newNonce();
    if (opts.requestIdRequired !== false && !isRequestId(payload.request_id)) {
      return Promise.resolve({ ok: false, error: 'request_id_required', via: 'post', rid: rid, attempts: [] });
    }
    if (!list.length) return Promise.resolve({ ok: false, error: 'nourl', via: 'post', rid: rid, attempts: [] });
    var totalMs = clampMs(opts.totalMs, 15000, 500, 60000);
    var perMs = clampMs(opts.perAttemptMs, Math.min(9000, totalMs), 50, 30000);
    var deadline = now() + totalMs;
    var attempts = [];
    function step(i) {
      if (i >= list.length || deadline - now() <= 0) {
        return Promise.resolve({
          ok: false,
          error: i >= list.length ? 'unreachable' : 'timeout',
          unknown: attempts.every(function (a) { return !a.ok; }),
          via: 'post',
          rid: rid,
          attempts: attempts
        });
      }
      var remaining = deadline - now();
      return postForm({
        url: list[i],
        payload: payload,
        rid: rid,
        kind: opts.kind || 'genko',
        timeoutMs: Math.min(perMs, remaining),
        origins: opts.origins,
        maxDepth: opts.maxDepth,
        requestIdRequired: opts.requestIdRequired,
        fieldName: opts.fieldName,
        injectRid: opts.injectRid
      }).then(function (r) {
        r.url = list[i];
        attempts.push(r);
        if (r.ok) return { ok: true, data: r.data, via: r.via, rid: rid, url: r.url, attempts: attempts };
        return step(i + 1);
      });
    }
    return step(0);
  }

  // ---- fetch（AbortControllerで有限timeout、JSONパース失敗は明示エラー） ----
  function fetchJson(opts) {
    opts = opts || {};
    var urls = (opts.urls || []).filter(Boolean);
    var method = String(opts.method || 'GET').toUpperCase();
    if (!urls.length) return Promise.resolve({ ok: false, error: 'nourl', attempts: [] });
    if (typeof window.fetch !== 'function') return Promise.resolve({ ok: false, error: 'fetch_unavailable', attempts: [] });
    if (method !== 'GET' && opts.requestIdRequired !== false && !isRequestId(opts.requestId)) {
      return Promise.resolve({ ok: false, error: 'request_id_required', attempts: [] });
    }
    var body = opts.body;
    if (body && typeof body !== 'string') {
      try { body = JSON.stringify(body); }
      catch (e) { return Promise.resolve({ ok: false, error: 'body_serialize', attempts: [] }); }
    }
    var totalMs = clampMs(opts.totalMs, 15000, 500, 180000);
    var perMs = clampMs(opts.timeoutMs, Math.min(8000, totalMs), 50, 150000);
    var deadline = now() + totalMs;
    var attempts = [];
    var headers = opts.headers || {};
    var mutating = method !== 'GET' && method !== 'HEAD';
    var uncertain = false;
    function isUncertainAttempt(r) {
      if (!r) return true;
      if (!r.response) return true;
      if (r.error === 'invalid_json' || r.error === 'read_failed') return true;
      if (typeof r.status === 'number' && r.status >= 500) return true;
      return false;
    }
    function finalResult(last) {
      last = last || {};
      return {
        ok: false,
        unknown: mutating ? uncertain : attempts.every(function (a) { return !a.response; }),
        error: last.error || 'unreachable',
        detail: last.detail || '',
        status: last.status,
        data: last.data,
        url: last.url,
        attempts: attempts
      };
    }
    function once(url) {
      var remaining = deadline - now();
      if (remaining <= 0) {
        return Promise.resolve({ ok: false, error: 'timeout', url: url, unknown: true });
      }
      var limit = Math.min(perMs, remaining);
      var controller = null;
      try {
        if (typeof window.AbortController === 'function') controller = new window.AbortController();
      } catch (e) { controller = null; }
      var init = { method: method, headers: headers };
      if (opts.cache) init.cache = opts.cache;
      else if (method === 'GET') init.cache = 'no-store';
      if (body !== undefined && method !== 'GET' && method !== 'HEAD') init.body = body;
      if (controller) init.signal = controller.signal;
      return new Promise(function (resolve) {
        var settled = false;
        var timer = null;
        var aborted = false;
        function cleanup() { if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; } }
        function finish(res) {
          if (settled) return;
          settled = true;
          cleanup();
          res.url = url;
          resolve(res);
        }
        if (controller) {
          timer = setTimeout(function () {
            aborted = true;
            try { controller.abort(); } catch (e) {}
          }, limit);
        } else {
          timer = setTimeout(function () { finish({ ok: false, error: 'timeout', unknown: true }); }, limit);
        }
        var request;
        try { request = window.fetch(url, init); }
        catch (e) {
          finish({ ok: false, error: 'network', unknown: true, detail: String((e && e.message) || e) });
          return;
        }
        Promise.resolve(request).then(function (res) {
          if (settled) return;
          var status = res && res.status;
          var read;
          try { read = res.text(); } catch (e) { finish({ ok: false, status: status, response: true, error: 'read_failed', retryable: true }); return; }
          Promise.resolve(read).then(function (text) {
            if (settled) return;
            var data = null;
            var parseError = null;
            if (text) {
              try { data = JSON.parse(text); }
              catch (e) { parseError = String((e && e.message) || e); }
            }
            if (status < 200 || status >= 300) {
              finish({
                ok: false,
                status: status,
                response: true,
                error: 'http_' + status,
                retryable: status === 429 || status >= 500,
                detail: (data && data.error) ? String(data.error) : '',
                data: data || undefined
              });
              return;
            }
            if (parseError || data === null || typeof data !== 'object') {
              finish({ ok: false, status: status, response: true, error: 'invalid_json', retryable: true, detail: parseError || 'empty' });
              return;
            }
            finish({ ok: true, status: status, response: true, data: data });
          }, function () {
            finish({ ok: false, status: status, response: true, error: 'read_failed', retryable: true });
          });
        }, function (err) {
          if (settled) return;
          var name = err && err.name;
          if (aborted || name === 'AbortError') finish({ ok: false, error: 'timeout', unknown: true });
          else finish({ ok: false, error: 'network', unknown: true, detail: String((err && err.message) || err) });
        });
      });
    }
    function step(i) {
      if (i >= urls.length) {
        return Promise.resolve(finalResult(attempts[attempts.length - 1]));
      }
      if (deadline - now() <= 0) {
        return Promise.resolve(finalResult({ error: 'timeout', unknown: true }));
      }
      return once(urls[i]).then(function (r) {
        attempts.push(r);
        if (mutating && isUncertainAttempt(r)) uncertain = true;
        if (r.ok) {
          // 2xxでもbackendが ok:false なら成功ではない。先行attemptが不明なら不明を維持する。
          if (mutating && r.data && r.data.ok === false && uncertain) {
            return finalResult({
              error: String(r.data.error || r.error || 'error'),
              detail: String(r.data.code || ''),
              status: r.status,
              data: r.data,
              url: r.url
            });
          }
          return {
            ok: true, data: r.data, status: r.status, url: r.url,
            response: true, unknown: false, attempts: attempts
          };
        }
        if (r.response && !r.retryable) {
          if (mutating && uncertain) return finalResult(r);
          return {
            ok: false, error: r.error, detail: r.detail, status: r.status,
            response: true, unknown: false, url: r.url, attempts: attempts
          };
        }
        return step(i + 1);
      });
    }
    return step(0);
  }

  // ---- probe（POST優先 → JSONP → probe専用iframe。全体を単一の時間予算で有限化） ----
  var PROBE_TIMEOUTS = { post: 8000, jsonp: 8000, iframe: 5000 };
  function probeTimeouts(cfg) {
    var base = { post: PROBE_TIMEOUTS.post, jsonp: PROBE_TIMEOUTS.jsonp, iframe: PROBE_TIMEOUTS.iframe };
    var over = (cfg && cfg.timeouts) || {};
    for (var k in over) {
      if (Object.prototype.hasOwnProperty.call(over, k)) {
        var v = Number(over[k]);
        if (isFinite(v) && v > 0) base[k] = v;
      }
    }
    return base;
  }
  function probeClassify(hit, rid, start, attemptsLog) {
    var d = hit && hit.data;
    var out = {
      status: 'unreachable', data: d || null, via: (hit && hit.via) || 'none',
      label: (hit && hit.label) || '', rid: rid, ms: now() - start, attempts: attemptsLog
    };
    if (!d || d.genkoProbe !== true) return out;
    out.open = !!d.open;
    out.masked = d.masked || '';
    out.emailVisible = !!d.email_visible;
    if (d.ok === false) {
      out.status = d.error === 'noauth' ? 'noauth' : 'error';
      out.message = String(d.error || '');
    } else if (d.allowed !== true) {
      out.status = 'notallowed';
    } else {
      out.status = 'ok';
      out.isOwner = !!d.is_owner;
    }
    return out;
  }
  function probeAuth(cfg) {
    cfg = cfg || {};
    var token = cfg.token || '';
    var idToken = cfg.idToken !== undefined ? cfg.idToken : getIdToken();
    var workerUrl = cfg.workerUrl || '';
    var directUrl = cfg.directUrl || '';
    var targets = [];
    if (workerUrl) targets.push({ url: workerUrl, label: 'worker' });
    if (directUrl) targets.push({ url: directUrl, label: 'direct' });
    var totalMs = clampMs(cfg.totalMs, 20000, 1000, 30000);
    var start = now();
    var deadline = start + totalMs;
    var rid = cfg.rid || newNonce();
    var attemptsLog = [];
    var parentOrigin = parentOriginForBackend();
    if (!targets.length) {
      return Promise.resolve({ status: 'unreachable', reason: 'nourl', rid: rid, ms: 0, attempts: attemptsLog });
    }
    function query() {
      return 'probe=1&token=' + encodeURIComponent(token) + (idToken ? '&id_token=' + encodeURIComponent(idToken) : '');
    }
    function makePost(target) {
      return function (ms) {
        var payload = { probe: 1, token: token, rid: rid };
        if (parentOrigin) payload.parent_origin = parentOrigin;
        if (idToken) payload.id_token = idToken;
        return postForm({
          url: target.url, payload: payload, rid: rid, kind: 'genkoProbe',
          timeoutMs: ms, origins: cfg.origins, maxDepth: cfg.maxDepth, injectRid: false
        }).then(function (r) { r.label = target.label; r.via = 'post'; return r; });
      };
    }
    function makeJsonp(target) {
      return function (ms) {
        return jsonp(appendQuery(target.url, query()), { timeoutMs: ms, rid: rid })
          .then(function (r) { r.label = target.label; r.via = 'jsonp'; return r; });
      };
    }
    function makeIframe(target) {
      return function (ms) {
        return getViaIframe(appendQuery(target.url, query()), {
          timeoutMs: ms, rid: rid, kinds: ['genkoProbe'], origins: cfg.origins, maxDepth: cfg.maxDepth
        }).then(function (r) { r.label = target.label; r.via = 'iframe'; return r; });
      };
    }
    function runGroup(items) {
      if (!items.length) return Promise.resolve(null);
      var remaining = deadline - now();
      if (remaining < 150) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var pending = items.length;
        var finished = false;
        items.forEach(function (item) {
          var ms = Math.min(item.maxMs, remaining);
          item.run(ms).then(function (r) {
            attemptsLog.push(r);
            if (!finished && r && r.ok && r.data && r.data.genkoProbe === true) {
              finished = true;
              resolve(r);
              return;
            }
            pending--;
            if (pending <= 0 && !finished) { finished = true; resolve(null); }
          }, function (err) {
            attemptsLog.push({ ok: false, error: String((err && err.message) || err), via: item.via, label: item.label });
            pending--;
            if (pending <= 0 && !finished) { finished = true; resolve(null); }
          });
        });
      });
    }
    var pt = probeTimeouts(cfg);
    var first = targets[0];
    var second = targets[1] || null;
    var groupA = [
      { via: 'post', label: first.label, maxMs: pt.post, run: makePost(first) },
      { via: 'jsonp', label: first.label, maxMs: pt.jsonp, run: makeJsonp(first) }
    ];
    return runGroup(groupA).then(function (hit) {
      if (hit) return probeClassify(hit, rid, start, attemptsLog);
      var groupB = [];
      if (second) {
        groupB = [
          { via: 'post', label: second.label, maxMs: pt.post, run: makePost(second) },
          { via: 'jsonp', label: second.label, maxMs: pt.jsonp, run: makeJsonp(second) }
        ];
      }
      return runGroup(groupB).then(function (hit2) {
        if (hit2) return probeClassify(hit2, rid, start, attemptsLog);
        // iframe フォールバックは probe だけ（履歴JSON等には使わない）
        var iframeTarget = second || first;
        return runGroup([
          { via: 'iframe', label: iframeTarget.label, maxMs: pt.iframe, run: makeIframe(iframeTarget) }
        ]).then(function (hit3) {
          if (hit3) return probeClassify(hit3, rid, start, attemptsLog);
          return probeClassify(null, rid, start, attemptsLog);
        });
      });
    });
  }

  // ---- 小さな状態ユーティリティ（busy解除・最新リクエストのみ反映） ----
  function createBusyFlag() {
    var busy = false;
    return {
      tryEnter: function () { if (busy) return false; busy = true; return true; },
      leave: function () { busy = false; },
      isBusy: function () { return busy; }
    };
  }
  function createKeyedBusy() {
    var busy = Object.create(null);
    return {
      tryEnter: function (key) {
        var k = String(key == null ? '' : key);
        if (!k || busy[k]) return false;
        busy[k] = true;
        return true;
      },
      leave: function (key) {
        try { delete busy[String(key == null ? '' : key)]; } catch (e) {}
      },
      isBusy: function (key) {
        var k = String(key == null ? '' : key);
        return !!(k && busy[k]);
      }
    };
  }
  function createLatestOnly() {
    var seq = 0;
    return {
      begin: function () { seq += 1; return seq; },
      isLatest: function (n) { return n === seq; },
      current: function () { return seq; }
    };
  }

  window.GakusyuTransport = {
    // token
    TOKEN_KEY: TOKEN_KEY,
    getIdToken: getIdToken,
    peekIdToken: peekIdToken,
    actorKey: actorKey,
    setIdToken: setIdToken,
    clearIdToken: clearIdToken,
    inspectToken: inspectToken,
    onAuthChange: onAuthChange,
    // GIS
    hasGis: hasGis,
    waitForGis: waitForGis,
    // ids
    newRequestId: newRequestId,
    newNonce: newNonce,
    isRequestId: isRequestId,
    isRid: isRid,
    // message / origin
    configure: configure,
    isAllowedOrigin: isAllowedOrigin,
    sourceReaches: sourceReaches,
    readMessage: readMessage,
    // transport
    jsonp: jsonp,
    getViaIframe: getViaIframe,
    postForm: postForm,
    postFormSequence: postFormSequence,
    fetchJson: fetchJson,
    probeAuth: probeAuth,
    // utils
    appendQuery: appendQuery,
    buildPdfName: buildPdfName,
    parentOriginForBackend: parentOriginForBackend,
    createBusyFlag: createBusyFlag,
    createKeyedBusy: createKeyedBusy,
    createLatestOnly: createLatestOnly,
    messages: MESSAGES
  };
})(typeof window !== 'undefined' ? window : this);
