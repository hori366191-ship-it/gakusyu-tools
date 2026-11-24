/*!
 * site/shared/classroom-session.js
 * 教室セッション（Cloudflare Worker + D1）クライアント。
 *
 * 公開範囲:
 *  - Worker の HTMLRewriter が `<meta name="gakusyu-classroom-session" content="1">` を
 *    挿したページでのみ `window.GakusyuClassroomSession` を公開する。
 *  - マーカーが無い公開Pagesでは何もしない（グローバルを生やさない）。
 *
 * 契約（Worker 側と固定）:
 *  - POST (same-origin) /_classroom/probe    body: { target: 'app2' | 'pdfdrop' }
 *      -> { status: 'ok'|'noauth'|'notallowed'|'unreachable', isOwner, open, context }
 *  - POST (same-origin) /_classroom/{print|generate|translate}
 *      body: { request_id, rid, context, ...payload }
 *      -> { ok, rid, request_id, ... }
 *  - POST (navigation form) /_classroom/login  field: return_to
 *  - POST (navigation form) /_classroom/logout
 *
 * 方針:
 *  - セッション識別子（context）はメモリのみ。localStorage / sessionStorage / Cookie /
 *    URL へは保存しない（サーバが same-origin の HttpOnly Cookie で持つ）。
 *  - context を Cookie から読み出して組み立てない。probe が返した値か、呼び出し側が
 *    明示した値だけを使う。
 *  - 変更系は「1操作 = 1 POST」。再送しない。network / timeout / 502 / 解析失敗 /
 *    rid・request_id 不一致は `unknown: true`（適用されたかもしれない）。
 *  - 送信前に判明する失敗（context 無し等）は `unknown: false` かつ `predispatch: true`。
 *  - probe は表示専用。期限延長はしない（サーバ側も対象操作の成功時のみ延長する）。
 */
(function (root) {
  'use strict';

  var MARKER_SELECTOR = 'meta[name="gakusyu-classroom-session"][content="1"]';
  var PROBE_PATH = '/_classroom/probe';
  var LOGIN_PATH = '/_classroom/login';
  var LOGOUT_PATH = '/_classroom/logout';
  var OPERATION_PATHS = {
    print: '/_classroom/print',
    generate: '/_classroom/generate',
    translate: '/_classroom/translate'
  };
  // login 後の戻り先は許可したページだけ（open redirect 防止）
  var ALLOWED_RETURN_TO = ['/', '/app2/', '/app9/', '/app12/'];
  var TARGETS = ['app2', 'pdfdrop'];
  var PROBE_STATUSES = { ok: true, noauth: true, notallowed: true, unreachable: true };
  var PROBE_TIMEOUT_MS = 12000;
  // 生成は約90s、PDF は約30s が目安。timeoutMs で上書きできる。
  var MUTATE_TIMEOUTS = { print: 45000, generate: 120000, translate: 90000 };
  var MAX_TIMEOUT_MS = 180000;
  var MIN_TIMEOUT_MS = 500;
  var ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

  // ── 専用API（別coderがデプロイする固定origin）──
  // 既存の GitHub Pages / GAS / マーカー方式はそのまま。ここは
  // 「教室印刷・認証済み英語生成だけを30/90日保持する」追加の任意機能。
  var API_ORIGIN = 'https://gakusyu-classroom-auth.hori-shota.workers.dev';
  // 公開スイッチ（コード内フラグ）。false にすると追加APIは一切触らず、匿名UIも出さない。
  var API_PUBLISHED = true;
  var API_PATHS = {
    exchange: '/_classroom/popup-exchange',
    status: '/_classroom/status',
    logout: '/_classroom/logout',
    probe: '/_classroom/probe',
    print: '/_classroom/print',
    generate: '/_classroom/generate',
    translate: '/_classroom/translate'
  };
  // 非機密のオプトイン boolean だけを localStorage に置く（credential/context/code は置かない）
  var OPT_IN_KEY = 'gakusyu-classroom-persist';
  var ACTIVE_EVENT = 'gakusyu-classroom-session-active';
  var INACTIVE_EVENT = 'gakusyu-classroom-session-inactive';

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isId(value) {
    return typeof value === 'string' && ID_RE.test(value);
  }

  function isTarget(value) {
    return typeof value === 'string' && TARGETS.indexOf(value) !== -1;
  }

  function clampMs(value, dflt) {
    var v = Number(value);
    if (!isFinite(v) || v <= 0) return dflt;
    return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(v)));
  }

  /** marker が該当ページに挿されているか（無い/取得できない場合は false）。 */
  function hasMarker(win) {
    try {
      var doc = win && win.document;
      if (!doc || typeof doc.querySelector !== 'function') return false;
      return !!doc.querySelector(MARKER_SELECTOR);
    } catch (e) {
      return false;
    }
  }

  function createApi(win) {
    win = win || {};
    var memoryContext = null;

    function randomId() {
      var bytes = new Uint8Array(24);
      var c = win.crypto;
      if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
      } else {
        for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      }
      var out = '';
      for (var j = 0; j < bytes.length; j += 1) out += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
      return out;
    }

    /**
     * 同一オリジンへ JSON を 1 回だけ POST する。
     * 返り値: { ok, status, data, error, unknown }
     *  - redirect: 'error' なのでリダイレクト応答は network 失敗（unknown）として扱う。
     *  - 5xx は unknown、4xx は「適用されていない」既知失敗。
     */
    function postOnce(path, payload, timeoutMs) {
      var fetchFn = win && typeof win.fetch === 'function' ? win.fetch : null;
      if (!fetchFn) return Promise.resolve({ ok: false, error: 'fetch_unavailable', unknown: true });

      var body;
      try {
        body = JSON.stringify(payload);
      } catch (e) {
        return Promise.resolve({ ok: false, error: 'body_serialize', unknown: false, predispatch: true });
      }

      var init = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 認証はサーバが same-origin の HttpOnly Cookie で持つ
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        body: body
      };
      var controller = null;
      if (typeof win.AbortController === 'function') {
        try {
          controller = new win.AbortController();
        } catch (e) {
          controller = null;
        }
        if (controller) init.signal = controller.signal;
      }

      return new Promise(function (resolve) {
        var settled = false;
        var timer = null;
        function finish(result) {
          if (settled) return;
          settled = true;
          if (timer) {
            try { clearTimeout(timer); } catch (e) {}
            timer = null;
          }
          resolve(result);
        }
        timer = setTimeout(function () {
          if (controller) {
            try { controller.abort(); } catch (e) {}
          }
          finish({ ok: false, error: 'timeout', unknown: true });
        }, timeoutMs);

        var request;
        try {
          request = fetchFn.call(win, path, init);
        } catch (e) {
          finish({ ok: false, error: 'network', unknown: true });
          return;
        }

        Promise.resolve(request).then(function (res) {
          if (settled) return;
          var status = res && res.status;
          var textPromise;
          try {
            textPromise = res.text();
          } catch (e) {
            finish({ ok: false, status: status, error: 'read_failed', unknown: true });
            return;
          }
          Promise.resolve(textPromise).then(function (text) {
            if (settled) return;
            var data = null;
            var badJson = false;
            if (text) {
              try {
                data = JSON.parse(text);
              } catch (e) {
                badJson = true;
              }
            }
            if (status < 200 || status >= 300) {
              finish({
                ok: false,
                status: status,
                data: data || undefined,
                error: 'http_' + status,
                unknown: status >= 500
              });
              return;
            }
            if (badJson || !data || typeof data !== 'object') {
              finish({ ok: false, status: status, error: 'invalid_json', unknown: true });
              return;
            }
            finish({ ok: true, status: status, data: data, unknown: false });
          }, function () {
            finish({ ok: false, status: status, error: 'read_failed', unknown: true });
          });
        }, function (err) {
          if (settled) return;
          // redirect: 'error' は TypeError（network）として落ちる
          var name = err && err.name;
          finish({ ok: false, error: name === 'AbortError' ? 'timeout' : 'network', unknown: true });
        });
      });
    }

    function failedStatus(status, reason) {
      return { status: status, isOwner: false, open: false, context: null, error: reason, unknown: true };
    }

    return {
      marker: MARKER_SELECTOR,
      allowedReturnTo: ALLOWED_RETURN_TO.slice(),
      operations: Object.keys(OPERATION_PATHS),

      /**
       * 教室セッションの状態を 1 回だけ問い合わせる（表示専用・期限延長なし）。
       * 返り値: { status, isOwner, open, context } / 失敗時は status:'unreachable' + error
       */
      probe: function (target, opts) {
        opts = opts || {};
        if (!isTarget(target)) return Promise.resolve(failedStatus('unreachable', 'bad_target'));
        return postOnce(PROBE_PATH, { target: target }, clampMs(opts.timeoutMs, PROBE_TIMEOUT_MS)).then(function (r) {
          if (!r.ok) return failedStatus('unreachable', r.error);
          var d = r.data || {};
          var status = PROBE_STATUSES[d.status] === true ? d.status : 'unreachable';
          var context = typeof d.context === 'string' && d.context ? d.context : null;
          if (context) memoryContext = context; // メモリのみ（storage/URL/Cookie へは出さない）
          var out = {
            status: status,
            // 表示は fail closed: 許可(ok)以外では owner を立てない
            isOwner: status === 'ok' && d.isOwner === true,
            // app2 の匿名試行は GAS の open を引き継ぐ。ok 以外でも noauth/notallowed の
            // 明示応答に限り open を保持する（unreachable・不正 body・pdfdrop は false）。
            open:
              target === 'app2' &&
              (status === 'ok' || status === 'noauth' || status === 'notallowed') &&
              d.open === true,
            context: context
          };
          if (status === 'unreachable' && d.error) out.error = String(d.error);
          return out;
        });
      },

      /**
       * 変更系（print / generate / translate）を 1 回だけ POST する。
       * 返り値は T.fetchJson 互換の { ok, data, error?, unknown? } に
       * request_id / rid / status を添える。
       */
      mutate: function (operation, payload, opts) {
        opts = opts || {};
        var path = OPERATION_PATHS[operation];
        if (!path) {
          return Promise.resolve({ ok: false, error: 'unknown_operation', unknown: false, predispatch: true });
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return Promise.resolve({ ok: false, error: 'bad_payload', unknown: false, predispatch: true });
        }
        var context = typeof opts.context === 'string' && opts.context ? opts.context : memoryContext;
        if (!context) {
          // 送信前に判明する認証不足。Cookie から推測しない。
          return Promise.resolve({ ok: false, error: 'context_required', unknown: false, predispatch: true });
        }
        var requestId = isId(payload.request_id) ? payload.request_id : randomId();
        var rid = isId(opts.rid) ? opts.rid : (isId(payload.rid) ? payload.rid : randomId());

        // 検証済みの request_id / rid / context は必ずその値で送る（payload で上書きさせない）
        var body = {};
        for (var key in payload) {
          if (hasOwn(payload, key)) body[key] = payload[key];
        }
        body.request_id = requestId;
        body.rid = rid;
        body.context = context;

        var timeoutMs = clampMs(opts.timeoutMs, MUTATE_TIMEOUTS[operation]);
        return postOnce(path, body, timeoutMs).then(function (r) {
          if (!r.ok) {
            return {
              ok: false,
              error: r.error,
              status: r.status,
              data: r.data,
              unknown: r.unknown !== false,
              request_id: requestId,
              rid: rid
            };
          }
          var d = r.data || {};
          var verified = d.rid === rid && d.request_id === requestId;
          var unknown = verified ? d.unknown === true : true;
          if (d.ok === true && verified) {
            return {
              ok: true,
              data: d,
              unknown: unknown,
              status: r.status,
              request_id: requestId,
              rid: rid
            };
          }
          return {
            ok: false,
            error: verified ? String(d.error || 'server_error') : 'unverified_response',
            data: d,
            unknown: unknown,
            status: r.status,
            request_id: requestId,
            rid: rid
          };
        });
      },

      /** ログイン用 form（同一オリジン POST ナビゲーション）。returnTo は許可パスだけ。 */
      loginForm: function (returnTo, label) {
        var safe = ALLOWED_RETURN_TO.indexOf(returnTo) !== -1 ? returnTo : '/';
        return buildForm(win, LOGIN_PATH, [{ name: 'return_to', value: safe }], label || '教室用ログイン', 'login');
      },

      /** ログアウト用 form（同一オリジン POST ナビゲーション）。 */
      logoutForm: function (label) {
        return buildForm(win, LOGOUT_PATH, [], label || 'ログアウト', 'logout');
      },

      /** メモリ上の context（表示用。storage からは復元しない）。 */
      context: function () {
        return memoryContext;
      }
    };
  }

  /**
   * 専用API（cross-origin）クライアント。
   *  - 読み込みだけでは通信しない。オプトイン（localStorage の非機密boolean）がある時だけ
   *    status を 1 回読む（readonly・期限延長なし）。
   *  - popup-exchange には Google の code だけを送る。id_token 等は送らない/保存しない。
   *  - 変更系は 1操作=1 POST。再送・旧経路fallbackはしない。
   */
  function createRemoteApi(win) {
    win = win || {};
    var memoryContext = null;
    var activation = null;
    var active = false;

    function emit(name) {
      try {
        if (typeof win.dispatchEvent === 'function' && win.CustomEvent) {
          win.dispatchEvent(new win.CustomEvent(name));
        }
      } catch (e) {}
    }

    function store() {
      try { return win.localStorage || null; } catch (e) { return null; }
    }

    function hasOptIn() {
      var s = store();
      if (!s) return false;
      try { return s.getItem(OPT_IN_KEY) === '1'; } catch (e) { return false; }
    }

    function setOptIn(value) {
      var s = store();
      if (!s) return false;
      try {
        if (value) s.setItem(OPT_IN_KEY, '1');
        else s.removeItem(OPT_IN_KEY);
        return true;
      } catch (e) { return false; }
    }

    function markActive(value) {
      var next = value === true;
      if (active === next) return;
      active = next;
      try {
        if (next) win.__GakusyuClassroomActive = api;
        else if (win.__GakusyuClassroomActive === api) win.__GakusyuClassroomActive = null;
      } catch (e) {}
      emit(next ? ACTIVE_EVENT : INACTIVE_EVENT);
    }

    function randomId() {
      var bytes = new Uint8Array(24);
      var c = win.crypto;
      if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
      } else {
        for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      }
      var out = '';
      for (var j = 0; j < bytes.length; j += 1) out += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
      return out;
    }

    /** 固定originへJSONを1回だけPOSTする（Cookieはブラウザが持つ。JSからは読まない）。 */
    function postOnce(path, payload, timeoutMs) {
      var fetchFn = win && typeof win.fetch === 'function' ? win.fetch : null;
      if (!fetchFn) return Promise.resolve({ ok: false, error: 'fetch_unavailable', unknown: true });
      var body;
      try {
        body = JSON.stringify(payload || {});
      } catch (e) {
        return Promise.resolve({ ok: false, error: 'body_serialize', unknown: false, predispatch: true });
      }
      var init = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-requested-with': 'XmlHttpRequest'
        },
        // 専用APIの partitioned HttpOnly Cookie を使う（JSには出さない）
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        body: body
      };
      var controller = null;
      if (typeof win.AbortController === 'function') {
        try {
          controller = new win.AbortController();
        } catch (e) {
          controller = null;
        }
        if (controller) init.signal = controller.signal;
      }
      var url = API_ORIGIN + path;
      return new Promise(function (resolve) {
        var settled = false;
        var timer = null;
        function finish(result) {
          if (settled) return;
          settled = true;
          if (timer) {
            try { clearTimeout(timer); } catch (e) {}
            timer = null;
          }
          resolve(result);
        }
        timer = setTimeout(function () {
          if (controller) {
            try { controller.abort(); } catch (e) {}
          }
          finish({ ok: false, error: 'timeout', unknown: true });
        }, timeoutMs);
        var request;
        try {
          request = fetchFn.call(win, url, init);
        } catch (e) {
          finish({ ok: false, error: 'network', unknown: true });
          return;
        }
        Promise.resolve(request).then(function (res) {
          if (settled) return;
          var status = res && res.status;
          var textPromise;
          try {
            textPromise = res.text();
          } catch (e) {
            finish({ ok: false, status: status, error: 'read_failed', unknown: true });
            return;
          }
          Promise.resolve(textPromise).then(function (text) {
            if (settled) return;
            var data = null;
            var badJson = false;
            if (text) {
              try {
                data = JSON.parse(text);
              } catch (e) {
                badJson = true;
              }
            }
            if (status < 200 || status >= 300) {
              finish({ ok: false, status: status, data: data || undefined, error: 'http_' + status, unknown: status >= 500 });
              return;
            }
            if (badJson || !data || typeof data !== 'object') {
              finish({ ok: false, status: status, error: 'invalid_json', unknown: true });
              return;
            }
            finish({ ok: true, status: status, data: data, unknown: false });
          }, function () {
            finish({ ok: false, status: status, error: 'read_failed', unknown: true });
          });
        }, function (err) {
          if (settled) return;
          var name = err && err.name;
          finish({ ok: false, error: name === 'AbortError' ? 'timeout' : 'network', unknown: true });
        });
      });
    }

    function normalizeProbe(r) {
      if (!r.ok) return { status: 'unreachable', isOwner: false, open: false, context: null, error: r.error, unknown: true };
      var d = r.data || {};
      var status = PROBE_STATUSES[d.status] === true ? d.status : 'unreachable';
      var context = typeof d.context === 'string' && d.context ? d.context : null;
      if (context) memoryContext = context; // メモリのみ
      return {
        status: status,
        isOwner: status === 'ok' && d.isOwner === true,
        open: d.open === true,
        context: context
      };
    }

    function readStatus() {
      return postOnce(API_PATHS.status, {}, PROBE_TIMEOUT_MS).then(function (r) {
        if (!r.ok) return { ok: false, active: false, authenticated: false, known: false, unknown: true, error: r.error, status: r.status };
        var d = r.data || {};
        // 契約: { ok:true, authenticated:boolean }（active ではない）
        var authenticated = d.authenticated === true;
        return {
          ok: d.ok === true,
          active: authenticated,
          authenticated: authenticated,
          known: d.ok === true,
          unknown: false,
          status: r.status
        };
      });
    }

    /** status は 1 回だけ読み、結果を使い回す（表示・起動判定用。期限延長なし）。 */
    function statusOnce() {
      if (!activation) {
        activation = readStatus().then(function (st) {
          markActive(st.ok === true && st.active === true);
          return st;
        }, function () {
          return { ok: false, active: false, known: false, unknown: true, error: 'network' };
        });
      }
      return activation;
    }

    function confirmedContext() {
      return memoryContext;
    }

    /** GIS の公式 code client（ポップアップ）。user gesture から直接呼ぶ。 */
    function requestCode() {
      return new Promise(function (resolve, reject) {
        var g = win.google;
        var oauth2 = g && g.accounts && g.accounts.oauth2;
        var clientId = typeof win.GIS_CLIENT_ID === 'string' ? win.GIS_CLIENT_ID : '';
        if (!oauth2 || typeof oauth2.initCodeClient !== 'function' || !clientId) {
          reject({ code: 'unsupported' });
          return;
        }
        var settled = false;
        function done(fn, value) {
          if (settled) return;
          settled = true;
          fn(value);
        }
        try {
          var client = oauth2.initCodeClient({
            client_id: clientId,
            scope: 'openid email',
            ux_mode: 'popup',
            include_granted_scopes: false,
            callback: function (resp) {
              var code = resp && typeof resp.code === 'string' ? resp.code : '';
              if (code) done(resolve, code);
              else done(reject, { code: 'no_code' });
            },
            error_callback: function (err) {
              done(reject, { code: 'popup_failed', type: err && err.type });
            }
          });
          client.requestCode();
        } catch (e) {
          done(reject, { code: 'popup_failed' });
        }
      });
    }

    function exchange(code) {
      var value = typeof code === 'string' ? code : '';
      if (!value) return Promise.resolve({ ok: false, error: 'missing_code', unknown: false, predispatch: true });
      // code 以外は送らない（id_token / credential / URL / storage へ出さない）
      return postOnce(API_PATHS.exchange, { code: value }, PROBE_TIMEOUT_MS).then(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : null;
        if (r.ok && d && d.ok === true) return { ok: true, unknown: false };
        var out = {
          ok: false,
          error: (d && d.error) || r.error || 'exchange_failed',
          unknown: r.unknown === true,
          status: r.status
        };
        // refresh_token_missing のときだけサーバが従来GISへ戻る印を返す（自動送信はしない）
        if (d && d.fallback === 'legacy_gis') out.fallback = 'legacy_gis';
        return out;
      });
    }

    /** オプトイン → ポップアップ交換 → readonly status で Cookie を確認。 */
    function popupLogin() {
      return requestCode().then(function (code) {
        return exchange(code).then(function (ex) {
          if (!ex.ok) return ex;
          // 交換成功でも、Cookie が書けたかは status で確認する
          activation = null;
          return statusOnce().then(function (st) {
            if (st.ok === true && st.active === true) {
              setOptIn(true);
              return { ok: true, active: true };
            }
            return { ok: false, active: false, error: 'not_active', unknown: st.unknown === true };
          });
        });
      }, function (err) {
        return { ok: false, error: String((err && err.code) || 'popup_failed'), unknown: false };
      });
    }

    function mutateRemote(operation, payload, opts) {
      opts = opts || {};
      var path = API_PATHS[operation];
      if (!path || operation === 'exchange' || operation === 'status' || operation === 'logout' || operation === 'probe') {
        return Promise.resolve({ ok: false, error: 'unknown_operation', unknown: false, predispatch: true });
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return Promise.resolve({ ok: false, error: 'bad_payload', unknown: false, predispatch: true });
      }
      // context は probe / activate がメモリに確定した値、または呼び出し側の明示値だけ。
      // Cookie から読み出して組み立てない。無ければ送信せずに既知失敗を返す。
      var context = typeof opts.context === 'string' && opts.context ? opts.context : memoryContext;
      if (!context) {
        return Promise.resolve({ ok: false, error: 'context_required', unknown: false, predispatch: true });
      }
      var requestId = isId(payload.request_id) ? payload.request_id : randomId();
      var rid = isId(opts.rid) ? opts.rid : (isId(payload.rid) ? payload.rid : randomId());
      var body = {};
      for (var key in payload) {
        if (hasOwn(payload, key)) body[key] = payload[key];
      }
      body.request_id = requestId;
      body.rid = rid;
      // 検証済み context は必ずその値で送る（payload で上書きさせない）
      body.context = context;
      var timeoutMs = clampMs(opts.timeoutMs, MUTATE_TIMEOUTS[operation]);
      return postOnce(path, body, timeoutMs).then(function (r) {
        if (!r.ok) {
          return {
            ok: false, error: r.error, status: r.status, data: r.data,
            unknown: r.unknown !== false, request_id: requestId, rid: rid
          };
        }
        var d = r.data || {};
        var verified = d.rid === rid && d.request_id === requestId;
        var unknown = verified ? d.unknown === true : true;
        if (d.ok === true && verified) {
          return { ok: true, data: d, unknown: unknown, status: r.status, request_id: requestId, rid: rid };
        }
        return {
          ok: false,
          error: verified ? String(d.error || 'server_error') : 'unverified_response',
          data: d, unknown: unknown, status: r.status, request_id: requestId, rid: rid
        };
      });
    }

    var api = {
      apiMode: true,
      origin: API_ORIGIN,
      published: API_PUBLISHED,
      operations: ['print', 'generate', 'translate'],
      hasOptIn: hasOptIn,
      setOptIn: setOptIn,
      status: readStatus,
      statusOnce: statusOnce,
      popupLogin: popupLogin,
      logout: function () {
        return postOnce(API_PATHS.logout, {}, PROBE_TIMEOUT_MS).then(function (r) {
          var ok = r.ok && r.data && r.data.ok === true;
          if (ok) {
            setOptIn(false);
            activation = null;
            memoryContext = null;
            markActive(false);
            return { ok: true, unknown: false };
          }
          return { ok: false, unknown: r.unknown === true, error: (r.data && r.data.error) || r.error };
        });
      },
      probe: function (target, opts) {
        opts = opts || {};
        if (!isTarget(target)) return Promise.resolve({ status: 'unreachable', isOwner: false, open: false, context: null, unknown: true });
        return postOnce(API_PATHS.probe, { target: target }, clampMs(opts.timeoutMs, PROBE_TIMEOUT_MS)).then(normalizeProbe);
      },
      mutate: mutateRemote,
      activate: function (target) {
        return statusOnce().then(function (st) {
          if (!st.ok || st.active !== true) return { active: false, session: false, status: st };
          return api.probe(target).then(function (pr) {
            var session = pr.status === 'ok' && !!pr.context;
            return { active: true, session: session, probe: pr, context: pr.context };
          });
        });
      },
      context: function () { return memoryContext; },
      isActive: function () { return active; },
      // 画面側の互換（APIモードでは同一オリジンformは使わない）
      loginForm: function () { return null; },
      logoutForm: function () { return null; },
      newRid: randomId
    };
    return api;
  }

  /** form 要素を組み立てる（document が無い環境では null）。 */
  function buildForm(win, action, fields, label, kind) {
    var doc = win && win.document;
    if (!doc || typeof doc.createElement !== 'function') return null;
    var form = doc.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.className = 'classroom-session__form';
    try { form.setAttribute('data-gakusyu-classroom-form', kind); } catch (e) {}
    for (var i = 0; i < fields.length; i += 1) {
      var input = doc.createElement('input');
      input.type = 'hidden';
      input.name = fields[i].name;
      input.value = fields[i].value;
      form.appendChild(input);
    }
    var button = doc.createElement('button');
    button.type = 'submit';
    button.className = 'auth-banner__btn';
    button.textContent = label;
    form.appendChild(button);
    return form;
  }

  var exported = {
    createApi: createApi,
    createRemoteApi: createRemoteApi,
    hasMarker: hasMarker,
    MARKER_SELECTOR: MARKER_SELECTOR,
    ALLOWED_RETURN_TO: ALLOWED_RETURN_TO.slice(),
    OPERATION_PATHS: OPERATION_PATHS,
    PROBE_PATH: PROBE_PATH,
    LOGIN_PATH: LOGIN_PATH,
    LOGOUT_PATH: LOGOUT_PATH,
    API_ORIGIN: API_ORIGIN,
    API_PATHS: API_PATHS,
    API_PUBLISHED: API_PUBLISHED,
    OPT_IN_KEY: OPT_IN_KEY,
    ACTIVE_EVENT: ACTIVE_EVENT,
    INACTIVE_EVENT: INACTIVE_EVENT
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
    return;
  }

  var marked = root ? hasMarker(root) : false;
  // マーカー（教室Pages）がある場合は従来の同一オリジン方式だけを使う。
  if (marked) {
    root.GakusyuClassroomSession = createApi(root);
  } else if (API_PUBLISHED && root) {
    // 公開Pages: 専用APIを「任意オプトイン」でだけ使う。読み込み時は通信しない。
    var remote = createRemoteApi(root);
    root.GakusyuClassroomApi = remote;
    // 過去に「保持」を選んだ端末だけ、readonly status を1回確認する（匿名は無通信）。
    if (remote.hasOptIn()) remote.statusOnce();
  }
})(typeof window !== 'undefined' ? window : null);
