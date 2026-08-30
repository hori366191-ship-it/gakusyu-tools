/**
 * gakusyu-tools proxy worker
 * github.io (site) -> script.google.com (GAS) のクロスサイトを同一サイト化し、
 * サードパーティCookieブロック/フィルタを回避しつつ ALLOWED_EMAILS 判定を維持する。
 *
 * Routes:
 *  /pdfdrop/*  -> site-pdfdrop  (YOUR_SCRIPT_ID...)
 *  /app2/*     -> site-app2-backend (YOUR_SCRIPT_ID...)
 *  前方一致で /pdfdrop?probe=1... や /app2?action=getSavedTexts... を中継
 *  クエリとメソッド・ボディはそのまま転送、CORSヘッダを付与して返す。
 */

const TARGETS = {
  pdfdrop: 'https://script.google.com/a/macros/hori-shota.com/s/AKfycbwj7qTaMDmKGa-KTEEwa2jcP7wtZ8xh_rVMANzfwKapz5u8tThqjxc2pQsbN-lAWU5L7Q/exec',
  app2: 'https://script.google.com/a/macros/hori-shota.com/s/AKfycbxj8qyLzCLC_13B4kKDPZSX2rtdHjjOd2l8DTNisFbBb0xmPzQ0QyVCyYGIuTl6u75i/exec',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    let targetBase = null;
    if (path.startsWith('/pdfdrop')) targetBase = TARGETS.pdfdrop;
    else if (path.startsWith('/app2')) targetBase = TARGETS.app2;
    else if (path === '/probe' || path === '/') {
      // デバッグ用: ?target=pdfdrop|app2 で指定可能
      const t = url.searchParams.get('target');
      if (t === 'pdfdrop') targetBase = TARGETS.pdfdrop;
      else if (t === 'app2') targetBase = TARGETS.app2;
      else targetBase = TARGETS.app2; // デフォルトは app2（portal用）
    }

    if (!targetBase) {
      return new Response('Not found. Use /pdfdrop or /app2', { status: 404, headers: corsHeaders() });
    }

    // GAS 側へ転送する URL を構築（/pdfdrop, /app2 の prefix を除き、クエリはそのまま）
    // 例: /pdfdrop?probe=1&token=... -> https://script.google.com/.../exec?probe=1&token=...
    //     /app2?action=getSavedTexts&token=... -> https://.../exec?action=...
    const search = url.search; // ?probe=1&token=...
    const targetUrl = targetBase + search;

    const method = request.method;
    const headers = {};
    // 必要なヘッダだけ転送
    const ct = request.headers.get('content-type');
    if (ct) headers['content-type'] = ct;

    let body = null;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await request.arrayBuffer();
      // 空ボディの場合は null に
      if (body && body.byteLength === 0) body = null;
    }

    let resp;
    try {
      resp = await fetch(targetUrl, {
        method: method,
        headers: headers,
        body: body,
        redirect: 'follow',
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'proxy fetch failed: ' + String(e && e.message || e) }), {
        status: 502,
        headers: { 'content-type': 'application/json', ...corsHeaders() },
      });
    }

    // レスポンスをそのまま返すが、CORSヘッダを付与
    // GAS の ContentService は javascript/json を返すが、Worker は透過的に中継
    const respHeaders = new Headers(resp.headers);
    for (const [k, v] of Object.entries(corsHeaders())) {
      respHeaders.set(k, v);
    }
    // X-Frame-Options を除去（iframe での postMessage を許可）
    respHeaders.delete('X-Frame-Options');
    respHeaders.delete('x-frame-options');

    const buf = await resp.arrayBuffer();
    return new Response(buf, {
      status: resp.status,
      headers: respHeaders,
    });
  },
};
