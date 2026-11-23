/*!
 * site/app12/app.js — 学習プリント
 *
 * 役割:
 *  - 教材データ（materials.js）を A4 縦 1 ページ = 1 枚の「紙面」として描画する
 *  - 紙面は白、画面枠（ヘッダー・タブ・ボタン）だけがテーマ（標準/ポップ/フォレスト）に追従する
 *  - 印刷は window.print() と、許可されたユーザーだけが使える「教室タブレットで印刷」の2導線
 *  - 教室タブレット印刷は app9 と同じ shared/transport.js・PDFdrop API を使い、
 *    認証/権限確認・request_id 冪等・poll/origin/rid・結果不明時の再送禁止・上限制御を弱めない
 *  - sessionStorage は 'gakusyuPrint:' で名前空間を分け、app9（genko_*）と干渉しない
 *  - ログイン（id_token）は同一オリジンの localStorage を共有するので、アプリ間で既存ログインを引き継ぐ
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GakusyuPrint = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NS = 'gakusyuPrint:';
  var KEY_PENDING_UNTIL = NS + 'pdfPendingUntil';
  var KEY_PENDING_UNKNOWN = NS + 'pdfPendingUnknown';

  // PDFdrop（既存の site-pdfdrop / Worker）。app9 と同じ値を使い、新しい経路は作らない。
  var WORKER_BASE = 'https://gakusyu-tools-proxy.hori-shota.workers.dev';
  var DIRECT_PDFDROP_URL = 'https://script.google.com/a/macros/hori-shota.com/s/AKfycbwj7qTaMDmKGa-KTEEwa2jcP7wtZ8xh_rVMANzfwKapz5u8tThqjxc2pQsbN-lAWU5L7Q/exec';
  var WORKER_PDFDROP_URL = (WORKER_BASE && WORKER_BASE.indexOf('REPLACE') === -1 && WORKER_BASE.indexOf('workers.dev') !== -1)
    ? WORKER_BASE.replace(/\/+$/, '') + '/pdfdrop'
    : '';
  var CLASSROOM = {
    url: WORKER_PDFDROP_URL || DIRECT_PDFDROP_URL,
    token: 'e6135dfd707ab9a6916635fa'
  };

  // 時間軸SVGの座標系（12行すべて共通。現在は常に中央）。
  var TL = {
    w: 220,
    h: 46,
    x0: 10,
    x1: 210,
    nowX: 110,
    axisY: 31,
    labelY: 43,
    topY: 9,
    habitY: 9
  };
  var tlSeq = 0;

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }
  function r1(n) { return Math.round(n * 10) / 10; }
  function pct(v) { return TL.x0 + (TL.x1 - TL.x0) * (Number(v) || 0); }
  function win() { return typeof window !== 'undefined' ? window : null; }
  function docOf(node) {
    if (node && node.ownerDocument) return node.ownerDocument;
    var w = win();
    return w && w.document ? w.document : null;
  }

  // ---------------------------------------------------------------- 時間軸SVG
  // 点＝丸、期間＝斜線の帯、習慣＝櫛形の記号。形だけで読み分けられるようにする（色に頼らない）。
  function timelineLabel(tl) {
    tl = tl || {};
    var shapes = [];
    if (tl.block) shapes.push('斜線を入れた帯で期間を示す');
    if (typeof tl.point === 'number') shapes.push('丸い点でその時点を示す');
    if (typeof tl.habit === 'number') shapes.push('櫛形の記号でくり返し（習慣）を示す');
    return '時間軸: 過去・現在・未来。' + (shapes.length ? shapes.join('。') + '。' : '');
  }

  function axisMarkup() {
    var out = '<g class="lp-tl__axis" aria-hidden="true">'
      + '<line x1="' + TL.x0 + '" y1="' + TL.axisY + '" x2="' + TL.x1 + '" y2="' + TL.axisY + '"/>'
      + '<line x1="' + TL.x0 + '" y1="' + (TL.axisY - 9) + '" x2="' + TL.x0 + '" y2="' + TL.axisY + '"/>'
      + '<line x1="' + TL.nowX + '" y1="' + (TL.axisY - 7) + '" x2="' + TL.nowX + '" y2="' + TL.axisY + '"/>'
      + '<line x1="' + TL.x1 + '" y1="' + (TL.axisY - 9) + '" x2="' + TL.x1 + '" y2="' + TL.axisY + '"/>'
      + '</g>';
    out += '<g class="lp-tl__labels" aria-hidden="true">'
      + '<text x="' + TL.x0 + '" y="' + TL.labelY + '" text-anchor="middle">過去</text>'
      + '<text x="' + TL.nowX + '" y="' + TL.labelY + '" text-anchor="middle">現在</text>'
      + '<text x="' + TL.x1 + '" y="' + TL.labelY + '" text-anchor="middle">未来</text>'
      + '</g>';
    return out;
  }

  function blockPoints(block) {
    var x1 = pct(block.from);
    var x2 = pct(block.to);
    return r1(x1 - 4) + ',' + TL.axisY
      + ' ' + r1(x2) + ',' + TL.axisY
      + ' ' + r1(x2) + ',' + TL.topY
      + ' ' + r1(x1 - 4) + ',' + TL.topY;
  }

  function hatchMarkup(block) {
    var x1 = pct(block.from);
    var x2 = pct(block.to);
    var lines = '';
    for (var x = x1 - 12; x <= x2; x += 9) {
      lines += '<line x1="' + r1(x) + '" y1="' + TL.axisY + '" x2="' + r1(x + 14) + '" y2="' + TL.topY + '"/>';
    }
    return lines;
  }

  function habitMarkup(at) {
    var cx = pct(at);
    var half = 17;
    var step = (half * 2) / 6;
    var out = '<g class="lp-tl__habit" data-marker="habit" aria-hidden="true">'
      + '<line x1="' + r1(cx - half) + '" y1="' + TL.habitY + '" x2="' + r1(cx + half) + '" y2="' + TL.habitY + '"/>';
    for (var i = 0; i <= 6; i++) {
      var x = cx - half + step * i;
      out += '<line x1="' + r1(x) + '" y1="' + TL.habitY + '" x2="' + r1(x - 3.2) + '" y2="' + (TL.habitY + 6) + '"/>';
    }
    return out + '</g>';
  }

  function arcsMarkup(tl) {
    var start = (typeof tl.point === 'number' ? pct(tl.point) : TL.nowX) + 22;
    var end = TL.w + 8;
    return '<g class="lp-tl__arcs" aria-hidden="true">'
      + '<path d="M ' + r1(start) + ' 28 C ' + r1(start + 44) + ' 1, ' + r1(end - 34) + ' -3, ' + end + ' 17"/>'
      + '<path d="M ' + r1(start) + ' 29 C ' + r1(start + 44) + ' 14, ' + r1(end - 44) + ' 9, ' + end + ' 29"/>'
      + '</g>';
  }

  function timelineSvg(tl) {
    tl = tl || {};
    tlSeq += 1;
    var clipId = 'lp-tl-clip-' + tlSeq;
    var body = axisMarkup();
    if (tl.arcs) body += arcsMarkup(tl);
    if (tl.block) {
      body += '<defs><clipPath id="' + clipId + '"><polygon points="' + blockPoints(tl.block) + '"/></clipPath></defs>'
        + '<polygon class="lp-tl__period" points="' + blockPoints(tl.block) + '" data-marker="period"/>'
        + '<g class="lp-tl__hatch" clip-path="url(#' + clipId + ')" aria-hidden="true">' + hatchMarkup(tl.block) + '</g>';
    }
    if (typeof tl.habit === 'number') body += habitMarkup(tl.habit);
    if (typeof tl.point === 'number') {
      body += '<circle class="lp-tl__point" cx="' + r1(pct(tl.point)) + '" cy="' + TL.axisY + '" r="4" data-marker="point"/>';
    }
    return '<svg class="lp-tl" viewBox="0 0 ' + TL.w + ' ' + TL.h + '" role="img" aria-label="'
      + esc(timelineLabel(tl)) + '" focusable="false">' + body + '</svg>';
  }

  // ---------------------------------------------------------------- 紙面HTML
  function meaningsHtml(meanings) {
    var list = (meanings || []).map(function (m) {
      var marker = m.marker ? '<span class="lp-marker">' + esc(m.marker) + '</span>' : '';
      var note = m.note ? '<span class="lp-note">' + esc(m.note) + '</span>' : '';
      return '<li>' + marker + '<span class="lp-mbody"><span class="lp-mtext">' + esc(m.text)
        + '</span>' + note + '</span></li>';
    }).join('');
    return '<ul class="lp-meanings">' + list + '</ul>';
  }

  function rowHtml(row) {
    return '<tr data-tense="' + esc(row.id) + '">'
      + '<th scope="row" class="lp-c-name">'
      + '<span class="lp-c-name__t">' + esc(row.name) + '</span>'
      + '<span class="lp-c-name__f">' + esc(row.form) + '</span>'
      + '</th>'
      + '<td class="lp-c-time">' + timelineSvg(row.timeline) + '</td>'
      + '<td class="lp-c-mean">' + meaningsHtml(row.meanings) + '</td>'
      + '</tr>';
  }

  function tenseTableHtml(page) {
    var rows = page.rows || [];
    var out = '';
    var open = false;
    var current = '';
    function closeGroup() {
      if (open) { out += '</tbody>'; open = false; }
    }
    rows.forEach(function (row) {
      var key = Object.prototype.hasOwnProperty.call(GROUP_LABELS, row.group) ? row.group : '';
      if (key && key !== current) {
        // 過去／現在／未来の3ブロックを、白黒でも分かる太い区切り＋見出しで示す
        closeGroup();
        out += '<tbody class="lp-group-body">'
          + '<tr class="lp-group"><th scope="rowgroup" colspan="3">' + esc(GROUP_LABELS[key]) + '</th></tr>';
        open = true;
        current = key;
      } else if (!key && !open) {
        // group を持たない教材（テスト用fixture等）は見出し無しで並べる
        out += '<tbody>';
        open = true;
        current = '';
      }
      out += rowHtml(row);
    });
    closeGroup();
    return '<table class="lp-tense">'
      + '<colgroup><col class="lp-col-name"><col class="lp-col-time"><col class="lp-col-mean"></colgroup>'
      + '<thead><tr><th scope="col">時制</th><th scope="col">時間軸</th><th scope="col">意味</th></tr></thead>'
      + out + '</table>';
  }

  var GROUP_LABELS = { past: '過去', present: '現在', future: '未来' };

  // 点／斜線の帯／櫛形の凡例（色を使わず形で読み分ける）
  function legendSvg(kind) {
    var out = '<svg class="lp-legend__svg" viewBox="0 0 48 18" aria-hidden="true" focusable="false">';
    if (kind === 'point') {
      out += '<line x1="3" y1="14" x2="45" y2="14"/>'
        + '<circle class="is-point" cx="24" cy="14" r="3.4"/>';
    } else if (kind === 'period') {
      out += '<line x1="3" y1="14" x2="45" y2="14"/>'
        + '<polygon points="11,14 26,14 26,4 11,4"/>'
        + '<line x1="11" y1="14" x2="17" y2="4"/>'
        + '<line x1="18" y1="14" x2="24" y2="4"/>';
    } else {
      out += '<line x1="10" y1="6" x2="38" y2="6"/>';
      for (var i = 0; i <= 6; i++) {
        var x = 10 + i * (28 / 6);
        out += '<line x1="' + r1(x) + '" y1="6" x2="' + r1(x - 2.6) + '" y2="12"/>';
      }
    }
    return out + '</svg>';
  }

  function legendHtml() {
    var items = [
      ['point', '点：その時点'],
      ['period', '斜線の帯：期間'],
      ['habit', '櫛形：くり返し（習慣）']
    ];
    return '<div class="lp-legend">'
      + '<span class="lp-legend__title">時間軸の記号</span>'
      + items.map(function (item) {
        return '<span class="lp-legend__item">' + legendSvg(item[0])
          + '<span class="lp-legend__label">' + esc(item[1]) + '</span></span>';
      }).join('')
      + '<span class="lp-legend__note">pp＝過去分詞</span>'
      + '</div>';
  }

  function pageBodyHtml(page) {
    if (page.kind === 'tense-table') return tenseTableHtml(page);
    return '';
  }

  function pageHtml(page, material, index, total) {
    var no = index + 1;
    return '<article class="lp-sheet" data-page="' + no + '" data-material="' + esc(material.id) + '"'
      + ' aria-label="' + esc(material.title + ' ' + no + 'ページ目') + '">'
      + '<div class="lp-sheet__head">'
      + '<h2 class="lp-sheet__title">' + esc(material.title) + '</h2>'
      + (page.caption ? '<span class="lp-sheet__caption">' + esc(page.caption) + '</span>' : '')
      + '</div>'
      + '<div class="lp-sheet__body">'
      + (page.kind === 'tense-table' ? legendHtml() : '')
      + pageBodyHtml(page) + '</div>'
      + '<footer class="lp-sheet__foot"><span>' + esc(material.title) + '</span>'
      + '<span>' + no + ' / ' + total + '</span></footer>'
      + '</article>';
  }

  function materialHtml(material) {
    var pages = material.pages || [];
    return pages.map(function (page, i) { return pageHtml(page, material, i, pages.length); }).join('');
  }

  function safeId(value) {
    return String(value || '').replace(/[^A-Za-z0-9_-]/g, '-');
  }

  // タブのキーボード移動（WAI-ARIA tabs pattern: 左右・Home・End）
  function nextTabIndex(key, current, count) {
    if (!count || current < 0) return null;
    if (key === 'ArrowRight') return (current + 1) % count;
    if (key === 'ArrowLeft') return (current - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
  }

  function appMarkup(materials) {
    var tabs = materials.map(function (m, i) {
      var id = safeId(m.id);
      return '<button type="button" class="lp-tab" role="tab" id="lp-tab-' + id + '"'
        + ' aria-controls="lp-panel-' + id + '" aria-selected="' + (i === 0 ? 'true' : 'false') + '"'
        + ' tabindex="' + (i === 0 ? '0' : '-1') + '">' + esc(m.title) + '</button>';
    }).join('');
    var panels = materials.map(function (m, i) {
      var id = safeId(m.id);
      return '<section class="lp-panel" role="tabpanel" id="lp-panel-' + id + '"'
        + ' aria-labelledby="lp-tab-' + id + '" tabindex="0"' + (i === 0 ? '' : ' hidden') + '>'
        + materialHtml(m) + '</section>';
    }).join('');
    return '<div class="lp-tabs no-print" role="tablist" aria-label="教材の切り替え">' + tabs + '</div>'
      + '<div class="lp-toolbar no-print">'
      + '<button type="button" class="lp-btn lp-btn--primary" data-lp-print>印刷する</button>'
      + '<button type="button" class="lp-btn lp-btn--send" data-lp-classroom hidden>教室タブレットで印刷</button>'
      + '<p class="lp-status" data-lp-status role="status" aria-live="polite"></p>'
      + '</div>'
      + '<div class="lp-paper-wrap" data-lp-paper>' + panels + '</div>';
  }

  // ---------------------------------------------------------------- PDF（1教材 = 1PDF / 1ジョブ）
  var CDN = {
    html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'
  };

  // TESTABLE-PDFGEN-START
  function loadScriptOnce(src, cb) {
    var w = win();
    if (!w || !w.document) { cb(new Error('no document')); return; }
    w.__lpLoadedScripts = w.__lpLoadedScripts || {};
    if (w.__lpLoadedScripts[src]) { cb(); return; }
    var s = w.document.createElement('script');
    var done = false;
    var timer = null;
    function finish(err) {
      if (done) return;
      done = true;
      if (timer) { clearTimeout(timer); timer = null; }
      try { s.onload = null; s.onerror = null; } catch (e) {}
      if (err) { try { s.remove(); } catch (e) {} }
      cb(err);
    }
    s.src = src;
    s.onload = function () {
      w.__lpLoadedScripts[src] = true;
      finish();
    };
    s.onerror = function () { finish(new Error('load failed: ' + src)); };
    timer = setTimeout(function () { finish(new Error('load timeout: ' + src)); }, 20000);
    w.document.head.appendChild(s);
  }

  function libsReady() {
    var w = win();
    return !!(w && typeof w.html2canvas === 'function' && w.jspdf && typeof w.jspdf.jsPDF === 'function');
  }

  function ensurePdfLibs(cb) {
    if (libsReady()) { cb(); return; }
    loadScriptOnce(CDN.html2canvas, function (e1) {
      if (e1) { cb(e1); return; }
      loadScriptOnce(CDN.jspdf, cb);
    });
  }

  /**
   * 紙面（A4 1枚 = 1ページ）を順番どおりに1つのPDFへまとめる。
   * callbackはちょうど1回。zoomは必ず復元する。
   */
  function makePdf(sheets, cb) {
    var w = win();
    var list = Array.prototype.slice.call(sheets || []);
    if (!list.length) { cb(new Error('印刷するページがありません')); return; }
    var finished = false;
    var timer = null;
    var zooms = list.map(function (el) {
      try { return el.style.zoom || ''; } catch (e) { return ''; }
    });
    function restore() {
      list.forEach(function (el, i) {
        try { el.style.zoom = zooms[i]; } catch (e) {}
      });
    }
    function finish(err, pdf) {
      if (finished) return;
      finished = true;
      if (timer) { clearTimeout(timer); timer = null; }
      restore();
      cb(err, pdf);
    }
    // CDN/画像化が無応答でもボタンを永久disabledにしない
    timer = setTimeout(function () { finish(new Error('PDF生成がタイムアウトしました')); }, 90000);
    ensurePdfLibs(function (err) {
      if (finished) return;
      if (err) { finish(err); return; }
      if (!libsReady()) { finish(new Error('PDFライブラリを読み込めませんでした')); return; }
      for (var i = 0; i < list.length; i++) list[i].style.zoom = 1;
      var pdf;
      try {
        pdf = new w.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      } catch (e) { finish(e); return; }
      var index = 0;
      function next() {
        if (finished) return;
        if (index >= list.length) { finish(null, pdf); return; }
        var at = index;
        var rendering;
        try {
          rendering = w.html2canvas(list[at], { scale: 2, backgroundColor: '#ffffff', logging: false });
        } catch (e) { finish(e); return; }
        Promise.resolve(rendering).then(function (canvas) {
          if (finished) return;
          try {
            if (at > 0) pdf.addPage('a4', 'portrait');
            var imgH = Math.min(297, 210 * canvas.height / canvas.width);
            var imgW = imgH * canvas.width / canvas.height;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (210 - imgW) / 2, 0, imgW, imgH);
            index = at + 1;
            next();
          } catch (e) { finish(e); }
        }, function (e) { finish(e); });
      }
      next();
    });
  }
  // TESTABLE-PDFGEN-END

  // ---------------------------------------------------------------- PDFファイル名
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function asciiSlug(value) {
    var s = String(value === null || value === undefined ? '' : value)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s.slice(0, 32) || 'print';
  }
  function buildPdfName(material, pageCount, requestId, dateObj) {
    var d = (dateObj instanceof Date) ? dateObj : new Date();
    var tag = String(requestId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || String(Date.now());
    var slug = asciiSlug(material && (material.slug || material.id));
    return 'gakusyu-print_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
      + '_' + slug + '_p' + (pageCount || 1) + '_' + tag + '.pdf';
  }

  // ---------------------------------------------------------------- PDF容量
  // PDFdrop のサーバ上限（10MiB）は変えない。送信前にクライアント側でも止める。
  var PDF_MAX_BYTES = 10 * 1024 * 1024;
  function pdfByteLength(b64) {
    var s = String(b64 || '');
    var pad = s.slice(-2) === '==' ? 2 : (s.slice(-1) === '=' ? 1 : 0);
    return Math.max(0, Math.floor(s.length * 3 / 4) - pad);
  }
  function isPdfTooLarge(b64) {
    return pdfByteLength(b64) > PDF_MAX_BYTES;
  }

  // ---------------------------------------------------------------- 教室タブレット送信
  // app9 と同じ判定・同じ request_id の使い方。結果不明時は再送しない。
  function readPendingNumber(storage, key) {
    try { return parseInt((storage && storage.getItem(key)) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function readPendingFlag(storage, key) {
    try { return (storage && storage.getItem(key)) === '1'; } catch (e) { return false; }
  }

  // TESTABLE-PDF-START
  function createPdfSender(cfg) {
    cfg = cfg || {};
    var T = cfg.transport;
    var workerUrl = cfg.workerUrl || '';
    var directUrl = cfg.directUrl || '';
    var token = cfg.token || '';
    var storage = cfg.storage || null;
    var onStatus = typeof cfg.onStatus === 'function' ? cfg.onStatus : function () {};
    var getIdToken = typeof cfg.getIdToken === 'function'
      ? cfg.getIdToken
      : function () { return T ? T.getIdToken() : ''; };
    // タイマー/時計はテストで差し替えられるようにする（本番は既定のまま）
    var setT = typeof cfg.setTimeout === 'function'
      ? cfg.setTimeout
      : function (fn, ms) { return setTimeout(fn, ms); };
    var clearT = typeof cfg.clearTimeout === 'function'
      ? cfg.clearTimeout
      : function (id) { return clearTimeout(id); };
    var nowFn = typeof cfg.now === 'function' ? cfg.now : function () { return Date.now(); };

    var pendingUntil = readPendingNumber(storage, KEY_PENDING_UNTIL);
    var pendingUnknown = readPendingFlag(storage, KEY_PENDING_UNKNOWN);

    function persist() {
      try {
        if (storage) {
          storage.setItem(KEY_PENDING_UNTIL, String(pendingUntil));
          storage.setItem(KEY_PENDING_UNKNOWN, pendingUnknown ? '1' : '0');
        }
      } catch (e) {}
    }

    function send(b64, name, requestId, cb, sendOpts) {
      if (typeof requestId === 'function') { cb = requestId; requestId = ''; }
      sendOpts = sendOpts || {};
      var expectToken = typeof sendOpts.expectToken === 'string' ? sendOpts.expectToken : '';
      if (!T) { cb({ ok: false, error: '通信ヘルパーが読み込まれていません' }); return; }
      if (!requestId) requestId = T.newRequestId();
      if (!T.isRequestId(requestId)) { cb({ ok: false, error: '内部エラー: request_id が不正です' }); return; }
      // クリック時に確定した認証トークンの文脈でだけ送る（別アカウントのトークンで同ジョブを送らない）
      var nowToken = getIdToken() || '';
      if (!nowToken || (expectToken && nowToken !== expectToken)) {
        cb({ ok: false, auth: true, error: 'ログインが切り替わったため送信を中止しました。ポータルからログインし直してください。' });
        return;
      }
      var rid = T.newNonce();
      var done = false;
      var overallTimer = null;
      var pollTimer = null;
      var pollAttempt = 0;
      var silentStreak = 0;
      var postHadUnknown = false;
      var postInFlight = false;
      var authErrorSeen = false;
      var explicitPostError = '';

      function finish(res) {
        if (done) return;
        done = true;
        if (res && res.unknown) {
          pendingUntil = nowFn() + 60000;
          pendingUnknown = true;
          persist();
        } else if (res && res.ok) {
          pendingUnknown = false;
          pendingUntil = 0;
          persist();
        }
        if (overallTimer) { clearT(overallTimer); overallTimer = null; }
        if (pollTimer) { clearT(pollTimer); pollTimer = null; }
        cb(res);
      }
      function buildPayload() {
        var payload = { token: token, name: name, b64: b64, request_id: requestId };
        var idt = getIdToken();
        if (idt) payload.id_token = idt;
        return payload;
      }
      function postOnce(url, timeoutMs) {
        return T.postForm({
          url: url,
          payload: buildPayload(),
          rid: rid,
          kind: 'genko',
          timeoutMs: timeoutMs,
          requestIdRequired: true
        });
      }
      function startPostAttempts() {
        var urls = workerUrl ? [workerUrl, directUrl] : [directUrl];
        var idx = 0;
        var startedAt = nowFn();
        function next() {
          if (done) return;
          if (idx >= urls.length) { postInFlight = false; return; } // 応答不明のままpollで確認する
          var attemptToken = getIdToken() || '';
          if (!attemptToken || (expectToken && attemptToken !== expectToken)) {
            postInFlight = false;
            // 先行POSTの結果が不明なら auth と確定しない（保存済みの可能性を消さない）
            if (postHadUnknown) return;
            finish({ ok: false, auth: true, error: 'ログインの有効期限が切れたか、別のアカウントに切り替わったため送信を中止しました。ポータルからログインし直してください。' });
            return;
          }
          var url = urls[idx++];
          var remaining = 60000 - (nowFn() - startedAt);
          if (remaining <= 1000) { postInFlight = false; return; }
          postInFlight = true;
          postOnce(url, Math.min(30000, remaining)).then(function (res) {
            postInFlight = false;
            if (done) return;
            if (res && res.ok && res.data && typeof res.data === 'object') {
              if (res.data.ok === true) { finish({ ok: true, name: res.data.name || name }); return; }
              if (res.data.ok === false) {
                var msg = String(res.data.error || '');
                var code = String(res.data.code || '');
                if (/pending|processing|処理中|in_flight|unknown/i.test(msg) || /pending_unknown|in_flight|ledger_unavailable/i.test(code)) {
                  // 処理中/結果不明: 再送せずpollでの確定を待つ（二重印刷防止）
                  postHadUnknown = true;
                  return;
                }
                // 先行attemptが不明なら、後続の明示エラーで「未保存」と確定しない
                if (postHadUnknown) {
                  if (/bad token|not allowed|strict verification|auth/i.test(msg + ' ' + code)) authErrorSeen = true;
                  else explicitPostError = msg || code || '送信に失敗しました';
                  return;
                }
                if (/bad token|not allowed|strict verification|auth/i.test(msg + ' ' + code)) {
                  finish({ ok: false, auth: true, error: msg || '保存先の認証に失敗しました。ログインし直してください。' });
                  return;
                }
                finish({ ok: false, error: msg || '送信に失敗しました' });
                return;
              }
            }
            // 応答不明（timeout/5xx/JSONでない等） → 同一request_idのまま次のURLへ
            postHadUnknown = true;
            next();
          }, function () {
            postInFlight = false;
            if (done) return;
            postHadUnknown = true;
            next();
          });
        }
        next();
      }
      function pollUrl(base) {
        return base + '?poll=' + encodeURIComponent(name) + '&token=' + encodeURIComponent(token);
      }
      function scheduleNext(delay) {
        if (done) return;
        pollTimer = setT(runPoll, delay);
      }
      function runPoll() {
        pollTimer = null;
        if (done) return;
        if (pollAttempt >= 20) {
          if (authErrorSeen && !postHadUnknown && !postInFlight && !explicitPostError) {
            finish({ ok: false, auth: true, error: '保存先の認証に失敗しました。ログインし直してください。' });
          } else {
            finish({ ok: false, unknown: true, error: T.messages.unknownResult });
          }
          return;
        }
        if (silentStreak >= 3) {
          // JSONP失敗/無応答はauthではなく結果不明（POST保存済みの可能性を消さない）
          finish({ ok: false, unknown: true, error: T.messages.unknownResult });
          return;
        }
        pollAttempt += 1;
        var bases = workerUrl ? [workerUrl, directUrl] : [directUrl];
        var i = 0;
        function tryBase() {
          if (done) return;
          if (i >= bases.length) {
            silentStreak += 1;
            scheduleNext(1500);
            return;
          }
          var base = bases[i++];
          T.jsonp(pollUrl(base), { timeoutMs: 6000 }).then(function (jp) {
            if (done) return;
            if (jp.ok && jp.data && jp.data.genkoPoll) {
              if (jp.data.found && jp.data.name === name) { finish({ ok: true, name: name }); return; }
              var err = jp.data.error ? String(jp.data.error) : '';
              if (/bad token/i.test(err)) {
                authErrorSeen = true;
                if (i < bases.length) { tryBase(); return; }
                if (!postHadUnknown && !postInFlight) {
                  finish({ ok: false, auth: true, error: '保存先の認証に失敗しました。ログインし直してください。' });
                  return;
                }
                scheduleNext(3000);
                return;
              }
              if (/folder not configured/i.test(err)) {
                if (i < bases.length) { tryBase(); return; }
                if (postHadUnknown || postInFlight) {
                  explicitPostError = '保存先フォルダが未設定です（pdfdropのlast_errorを確認）';
                  scheduleNext(3000);
                  return;
                }
                finish({ ok: false, error: '保存先フォルダが未設定です（pdfdropのlast_errorを確認）' });
                return;
              }
              silentStreak = 0;
              scheduleNext(3000);
              return;
            }
            tryBase();
          });
        }
        tryBase();
      }

      onStatus('送信中(保存確認中…)');
      overallTimer = setT(function () {
        finish({ ok: false, unknown: true, error: T.messages.unknownResult });
      }, 60000);
      startPostAttempts();
      runPoll();
    }

    function probe(cb) {
      if (!T) { cb({ state: 'noauth' }); return; }
      T.probeAuth({
        workerUrl: workerUrl,
        directUrl: directUrl,
        token: token,
        totalMs: 22000
      }).then(function (res) {
        if (res.status === 'ok') { cb({ state: 'ok', isOwner: !!res.isOwner }); return; }
        if (res.status === 'notallowed') { cb({ state: 'notallowed', masked: res.masked }); return; }
        if (res.status === 'noauth') { cb({ state: 'noauth' }); return; }
        if (res.status === 'error') { cb({ state: 'error', message: res.message }); return; }
        cb({ state: 'unreachable' });
      });
    }

    return {
      send: send,
      probe: probe,
      persist: persist,
      isCoolingDown: function (nowMs) { return (nowMs || Date.now()) < pendingUntil; },
      hasUnknown: function () { return pendingUnknown; },
      pendingUntil: function () { return pendingUntil; },
      clearPending: function () { pendingUnknown = false; pendingUntil = 0; persist(); },
      // テストからのみ参照する（本番UIには出さない）
      _state: function () { return { pendingUntil: pendingUntil, pendingUnknown: pendingUnknown }; }
    };
  }
  // TESTABLE-PDF-END

  // ---------------------------------------------------------------- mount
  function readData() {
    var w = win();
    return (w && w.GakusyuPrintMaterials) || { materials: [] };
  }

  function mount(opts) {
    opts = opts || {};
    var host = opts.host;
    var data = opts.data || readData();
    var materials = (data && Array.isArray(data.materials)) ? data.materials : [];
    var doc = docOf(host);
    if (!host || !doc) return null;
    if (!materials.length) {
      host.textContent = '教材データを読み込めませんでした。ページを再読み込みしてください。';
      return null;
    }
    var w = win();
    var T = opts.transport !== undefined ? opts.transport : (w && w.GakusyuTransport);
    var storage = opts.storage !== undefined ? opts.storage : (function () {
      try { return w.sessionStorage || null; } catch (e) { return null; }
    })();

    host.innerHTML = appMarkup(materials);

    var tabs = Array.prototype.slice.call(host.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(host.querySelectorAll('[role="tabpanel"]'));
    var paperWrap = host.querySelector('[data-lp-paper]');
    var printBtn = host.querySelector('[data-lp-print]');
    var classroomBtn = host.querySelector('[data-lp-classroom]');
    var statusEl = host.querySelector('[data-lp-status]');
    var activeIndex = 0;

    function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

    function sheetsOf(index) {
      var panel = panels[index];
      return panel ? Array.prototype.slice.call(panel.querySelectorAll('.lp-sheet')) : [];
    }

    function fitSheets() {
      if (!paperWrap) return;
      var avail = paperWrap.clientWidth - 8;
      var base = 210 * 96 / 25.4;
      var zoom = avail > 0 ? Math.min(1, avail / base) : 1;
      sheetsOf(activeIndex).forEach(function (sheet) {
        sheet.style.zoom = zoom < 1 ? String(Math.round(zoom * 1000) / 1000) : '';
      });
    }

    function activate(index, focusTab) {
      if (index < 0 || index >= tabs.length) return;
      activeIndex = index;
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
      });
      panels.forEach(function (panel, i) { panel.hidden = i !== index; });
      fitSheets();
      if (focusTab) tabs[index].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activate(i, false); });
    });
    var tablist = host.querySelector('[role="tablist"]');
    if (tablist) {
      tablist.addEventListener('keydown', function (event) {
        var current = tabs.indexOf(event.target);
        if (current < 0) return;
        var next = nextTabIndex(event.key, current, tabs.length);
        if (next === null) return;
        event.preventDefault();
        activate(next, true);
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', function () {
        if (w && typeof w.print === 'function') w.print();
      });
    }

    // 認証ヘルプ（外部文字列を innerHTML に入れない）
    function showAuthHelp(msg) {
      if (!statusEl) return;
      statusEl.textContent = '';
      statusEl.appendChild(doc.createTextNode(msg || 'Google にログインされていない可能性があります。'));
      statusEl.appendChild(doc.createTextNode(' '));
      var link = doc.createElement('a');
      link.href = opts.portalHref || '../';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'ポータルの教室用ログインを開く';
      statusEl.appendChild(link);
      statusEl.appendChild(doc.createTextNode('（ログイン後にもう一度押してください）'));
    }

    var sender = createPdfSender({
      transport: T,
      workerUrl: WORKER_PDFDROP_URL,
      directUrl: DIRECT_PDFDROP_URL,
      token: CLASSROOM.token,
      storage: storage,
      onStatus: setStatus,
      getIdToken: function () { return T ? T.getIdToken() : ''; }
    });

    var authExpiredNotice = false;
    var visibilitySeq = 0;
    // 並行probeの古い結果で権限表示を巻き戻さない（最新の呼び出しだけ反映する）
    function updateClassroomVisibility() {
      visibilitySeq += 1;
      var seq = visibilitySeq;
      if (!classroomBtn) return;
      if (!CLASSROOM.url || !CLASSROOM.token) { classroomBtn.hidden = true; return; }
      if (w && w.location && w.location.protocol === 'file:') { classroomBtn.hidden = true; return; }
      if (!T || !T.probeAuth) { classroomBtn.hidden = true; return; }
      var hadToken = !!(T.peekIdToken && T.peekIdToken());
      sender.probe(function (pr) {
        if (seq !== visibilitySeq) return; // 新しい判定が始まっている
        if (pr.state === 'ok') {
          authExpiredNotice = false;
          classroomBtn.hidden = false;
          setStatus('');
        } else if (pr.state === 'notallowed') {
          classroomBtn.hidden = true;
          setStatus('教室外アカウントでは印刷できません');
        } else if (pr.state === 'error') {
          classroomBtn.hidden = true;
          showAuthHelp('ログイン情報を確認できませんでした。');
        } else if (pr.state === 'noauth' && (hadToken || authExpiredNotice)) {
          authExpiredNotice = true;
          classroomBtn.hidden = true;
          showAuthHelp('ログインの有効期限が切れています。');
        } else if (!authExpiredNotice) {
          classroomBtn.hidden = true;
          setStatus('');
        }
      });
    }

    // 送信中は教材タブを止め、クリック時点の教材だけを送る
    function setBusy(busy) {
      if (classroomBtn) classroomBtn.disabled = !!busy;
      tabs.forEach(function (tab) { tab.disabled = !!busy; });
    }

    if (classroomBtn) {
      classroomBtn.addEventListener('click', function () {
        if (classroomBtn.disabled) return;
        if (!T) { setStatus('通信ヘルパーが読み込まれていません。ページを再読み込みしてください。'); return; }
        if (sender.isCoolingDown()) {
          setStatus('前回の送信結果を確認中です。二重印刷を防ぐため、しばらく待って保存先を確認してください。');
          return;
        }
        if (sender.hasUnknown()) {
          var ok = w && typeof w.confirm === 'function'
            ? w.confirm('前回の送信結果がまだ確定していません。保存先を確認しましたか？\n確認できた場合のみ「OK」で新しく印刷します。')
            : false;
          if (!ok) {
            setStatus('前回の送信結果を確認してから、もう一度押してください。');
            return;
          }
          sender.clearPending();
        }
        classroomBtn.disabled = true;
        setStatus('認証確認中…');
        sender.probe(function (pr) {
          function release(msg) {
            setBusy(false);
            if (msg) setStatus(msg);
          }
          if (pr.state !== 'ok') {
            setBusy(false);
            if (pr.state === 'noauth') showAuthHelp('Google にログインされていない可能性があります。');
            else if (pr.state === 'notallowed') setStatus('送信失敗: このアカウント(' + (pr.masked || '不明') + ')は許可リストにありません');
            else if (pr.state === 'unreachable') setStatus('送信失敗: 認証サーバーに接続できませんでした。通信状態を確認して、もう一度お試しください。');
            else setStatus('送信失敗: ' + (pr.message || '不明なエラー'));
            return;
          }
          // 以降の送信は「クリック時に認証が通ったトークン」でのみ行う
          var clickToken = T.getIdToken() || '';
          if (!clickToken) { setBusy(false); showAuthHelp('ログインの有効期限が切れています。'); return; }
          // 生成中にタブが切り替わっても別教材を送らないよう、ここで教材とシートを確定する
          var material = materials[activeIndex];
          var sheets = sheetsOf(activeIndex).slice();
          if (!sheets.length) { setBusy(false); setStatus('送信できるページがありません。'); return; }
          setBusy(true);
          setStatus('PDFを生成中…');
          makePdf(sheets, function (err, pdf) {
            if (err) { release('PDF生成に失敗しました'); return; }
            if ((T.getIdToken() || '') !== clickToken) {
              release('ログインが切り替わったため送信を中止しました。ポータルからログインし直してください。');
              return;
            }
            var b64 = '';
            try { b64 = String(pdf.output('datauristring') || '').split(',')[1] || ''; }
            catch (e) { b64 = ''; }
            if (!b64) { release('PDFの出力に失敗しました'); return; }
            if (isPdfTooLarge(b64)) {
              release('PDFが大きすぎるため送信できません（上限10MB）。教材のページ数を減らしてください。');
              return;
            }
            setStatus('送信中…');
            var requestId = T.newRequestId();
            var name = buildPdfName(material, sheets.length, requestId);
            sender.send(b64, name, requestId, function (res) {
              if (res && res.ok) { release('送信完了: ' + (res.name || name)); return; }
              if (res && res.unknown) { release(T.messages.unknownResult); return; }
              if (res && res.auth) { setBusy(false); showAuthHelp(res.error); return; }
              var errText = String((res && res.error) || '');
              if (/not allowed|strict verification|token|auth/i.test(errText)) {
                setBusy(false);
                showAuthHelp('このアカウントでは送信できません。教室用アカウントでログインし直してください。');
                return;
              }
              release('送信失敗: ' + (errText || '不明なエラー'));
            }, { expectToken: clickToken });
          });
        });
      });
    }

    if (w && typeof w.addEventListener === 'function') w.addEventListener('resize', fitSheets);
    if (T && typeof T.onAuthChange === 'function') T.onAuthChange(function () { updateClassroomVisibility(); });
    if (T && T.configure) T.configure({ origins: [WORKER_BASE] });

    activate(0, false);
    updateClassroomVisibility();

    return {
      activate: activate,
      fitSheets: fitSheets,
      sender: sender,
      materials: materials,
      sheetsOf: sheetsOf,
      getActiveIndex: function () { return activeIndex; },
      setStatus: setStatus
    };
  }

  function boot() {
    var w = win();
    var d = w && w.document;
    if (!d) return null;
    var host = d.querySelector('[data-lp-app]');
    if (!host) return null;
    return mount({ host: host, data: readData() });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return {
    NS: NS,
    KEYS: { pendingUntil: KEY_PENDING_UNTIL, pendingUnknown: KEY_PENDING_UNKNOWN },
    classroom: CLASSROOM,
    workerUrl: WORKER_PDFDROP_URL,
    directUrl: DIRECT_PDFDROP_URL,
    timeline: TL,
    timelineSvg: timelineSvg,
    timelineLabel: timelineLabel,
    rowHtml: rowHtml,
    pageHtml: pageHtml,
    materialHtml: materialHtml,
    legendHtml: legendHtml,
    GROUP_LABELS: GROUP_LABELS,
    appMarkup: appMarkup,
    nextTabIndex: nextTabIndex,
    buildPdfName: buildPdfName,
    asciiSlug: asciiSlug,
    pdfByteLength: pdfByteLength,
    isPdfTooLarge: isPdfTooLarge,
    PDF_MAX_BYTES: PDF_MAX_BYTES,
    loadScriptOnce: loadScriptOnce,
    ensurePdfLibs: ensurePdfLibs,
    makePdf: makePdf,
    createPdfSender: createPdfSender,
    mount: mount,
    boot: boot,
    readData: readData
  };
});
