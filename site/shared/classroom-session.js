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
    hasMarker: hasMarker,
    MARKER_SELECTOR: MARKER_SELECTOR,
    ALLOWED_RETURN_TO: ALLOWED_RETURN_TO.slice(),
    OPERATION_PATHS: OPERATION_PATHS,
    PROBE_PATH: PROBE_PATH,
    LOGIN_PATH: LOGIN_PATH,
    LOGOUT_PATH: LOGOUT_PATH
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
    return;
  }

  // ブラウザ: マーカーが挿されたページでのみ公開する（公開Pagesは無変更）
  if (hasMarker(root)) {
    root.GakusyuClassroomSession = createApi(root);
  }
})(typeof window !== 'undefined' ? window : null);
