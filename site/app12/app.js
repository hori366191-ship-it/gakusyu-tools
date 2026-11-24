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

  // 長期セッション統合（../shared/classroom-session.js）が読み込まれている時だけ使うゲートウェイ。
  // 公開Pages等で未読み込み（window.GakusyuClassroomSession が無い）場合は、
  // 従来の id_token + Worker/Direct 経路・従来の文言・従来のprobeをそのまま使う（挙動を変えない）。
  // ゲートウェイ経路が有効なときは旧経路へは絶対にfallbackしない（二重印刷を防ぐ）。
  var LOGIN_PATH = '/app12/';
  var LOGIN_LABEL = '教室用アカウントでログイン';
  function classroomSession() {
    var w = win();
    // マーカー方式（教室Pages）を優先。公開Pagesでは「保持」を選び、statusで有効と
    // 確認できた専用APIクライアントだけを使う（未オプトイン・期限切れは従来経路のまま）。
    var s = (w && w.GakusyuClassroomSession) || (w && w.__GakusyuClassroomActive);
    if (!s || typeof s !== 'object') return null;
    if (typeof s.probe !== 'function' || typeof s.mutate !== 'function') return null;
    return s;
  }

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

  var MSG_TOKEN_EXPIRED = 'ログインの有効期限が切れています。';
  // pdfdropだけが noauth を返す場合（ポータルのapp2判定は通る）は「期限切れ」と言い切らない。
  // サーバの内部文字列（bad token等）は出さず、保存トークンの状態だけで文言を選ぶ。
  var MSG_PDFDROP_NOAUTH = '印刷先の認証を確認できませんでした。少し待って再試行するか、教室用アカウントでログインし直してください。';
  function noauthHelpMessage(T) {
    // 長期セッション統合（cookie認証）では、ローカルのid_tokenの状態で文言を決めない
    if (classroomSession()) return MSG_PDFDROP_NOAUTH;
    var raw = (T && typeof T.peekIdToken === 'function') ? T.peekIdToken() : '';
    var st = null;
    try { st = (T && typeof T.inspectToken === 'function') ? T.inspectToken(raw) : null; } catch (e) { st = null; }
    return (st && st.valid) ? MSG_PDFDROP_NOAUTH : MSG_TOKEN_EXPIRED;
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

  // 期間の帯は「開始時点は特定しない」ため左の縦線を描かない。
  // 上辺＋右の縦線（終端）だけを開いた path で描き、斜線は clipPath で内側だけに切る。
  function blockPoints(block) {
    var x1 = pct(block.from);
    var x2 = pct(block.to);
    return r1(x1 - 4) + ',' + TL.axisY
      + ' ' + r1(x2) + ',' + TL.axisY
      + ' ' + r1(x2) + ',' + TL.topY
      + ' ' + r1(x1 - 4) + ',' + TL.topY;
  }

  function blockOutline(block) {
    var x1 = pct(block.from);
    var x2 = pct(block.to);
    return 'M ' + r1(x1 - 4) + ' ' + TL.topY
      + ' H ' + r1(x2)
      + ' V ' + TL.axisY;
  }

  function hatchMarkup(block) {
    var x1 = pct(block.from);
    var x2 = pct(block.to);
    var lines = '';
    for (var x = x1 - 4; x <= x2; x += 9) {
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

  // 単純形の2本の弧は、上＝櫛形（くり返し）・下＝点（その時点）の
  // それぞれの記号から描き始める。終端は図の内側に収め、未来形でも
  // 急に切れない滑らかな放物線（二次ベジェ）にする。
  var ARC_END_X = TL.w - 8;
  var ARC_UPPER_END_Y = TL.topY + 5;
  var ARC_LOWER_END_Y = TL.axisY - 6;

  function arcAnchors(tl) {
    var habitAt = typeof tl.habit === 'number' ? tl.habit : tl.point;
    var pointAt = typeof tl.point === 'number' ? tl.point : tl.habit;
    return {
      upper: { x: r1(pct(habitAt) + 20), y: TL.habitY + 2 },
      lower: { x: r1(pct(pointAt) + 6), y: TL.axisY - 3 }
    };
  }

  function arcsMarkup(tl) {
    var a = arcAnchors(tl);
    function curve(from, ctrlY, endY) {
      return 'M ' + r1(from.x) + ' ' + r1(from.y)
        + ' Q ' + r1((from.x + ARC_END_X) / 2) + ' ' + r1(ctrlY)
        + ' ' + ARC_END_X + ' ' + r1(endY);
    }
    return '<g class="lp-tl__arcs" aria-hidden="true">'
      + '<path d="' + curve(a.upper, TL.topY - 6, ARC_UPPER_END_Y) + '"/>'
      + '<path d="' + curve(a.lower, TL.axisY - 12, ARC_LOWER_END_Y) + '"/>'
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
        + '<path class="lp-tl__period" d="' + blockOutline(tl.block) + '" data-marker="period"/>'
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
      // 紙面の期間の帯と同じ慣例: 上辺＋右の縦線だけを描き、左端は開く
      out += '<line x1="3" y1="14" x2="45" y2="14"/>'
        + '<path d="M 11 4 H 26 V 14"/>'
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

  // ---- 不規則動詞（A4横・1ページ3表） ----
  // 語は太字、カタカナ発音は語の下に左揃え・細字で置く。
  function ivCellHtml(word, pron) {
    return '<span class="lp-iv-cell">'
      + '<span class="lp-iv-word">' + esc(word) + '</span>'
      + (pron ? '<span class="lp-iv-pron">' + esc(pron) + '</span>' : '')
      + '</span>';
  }

  function ivRowHtml(row) {
    var pron = row.pron || [];
    return '<tr>'
      + '<td class="lp-iv-no">' + esc(row.no) + '</td>'
      + '<th scope="row">' + ivCellHtml(row.b, pron[0]) + '</th>'
      + '<td>' + ivCellHtml(row.p, pron[1]) + '</td>'
      + '<td>' + ivCellHtml(row.pp, pron[2]) + '</td>'
      + '<td class="lp-iv-mean">' + esc(row.m) + '</td>'
      + '</tr>';
  }

  // 列見出し表と各カードで同じ幅を使い、桁を揃える（#5% / 3形 各24.5% / 意味21.5%）
  var IV_COLGROUP = '<colgroup><col class="lp-iv-col-no"><col class="lp-iv-col-form"><col class="lp-iv-col-form">'
    + '<col class="lp-iv-col-form"><col class="lp-iv-col-mean"></colgroup>';

  // 列見出しは1列に1回だけ（外周線なし・下線だけの帯）
  function ivHeadHtml() {
    return '<table class="lp-iv-headtbl">' + IV_COLGROUP
      + '<caption class="lp-iv-sr">列の見出し</caption>'
      + '<thead><tr><th scope="col">#</th><th scope="col">原形</th><th scope="col">過去形</th>'
      + '<th scope="col">過去分詞</th><th scope="col">意味</th></tr></thead>'
      + '</table>';
  }

  // 型グループ1つ＝角丸カード1枚（theadなし・見出し行＋データ行）
  function ivCardHtml(group) {
    return '<div class="lp-iv-card"><table class="lp-iv-cardtbl">' + IV_COLGROUP
      + '<tbody>'
      + '<tr class="lp-iv-grp"><th colspan="5" scope="colgroup">' + esc(group.title) + '</th></tr>'
      + (group.rows || []).map(ivRowHtml).join('')
      + '</tbody></table></div>';
  }

  // 1列分＝列見出し＋型グループごとのカードを縦積み（カード間は外側の白余白）
  function ivTableHtml(table) {
    var groups = (table && table.groups) || [];
    return '<div class="lp-iv-col">' + ivHeadHtml() + groups.map(ivCardHtml).join('') + '</div>';
  }

  function irregularTablesHtml(page) {
    var tables = (page && page.tables) || [];
    return '<div class="lp-iv-grid">' + tables.map(ivTableHtml).join('') + '</div>';
  }

  // 型の見方とカタカナの注記（1ページ目だけ）
  function irregularLegendHtml(material) {
    var legend = (material && material.legend) || null;
    if (!legend) return '';
    var items = (legend.items || []).map(function (item) {
      return '<span class="lp-iv-legend__item">'
        + '<span class="lp-iv-legend__key">' + esc(item[0]) + '</span>' + esc(item[1]) + '</span>';
    }).join('');
    return '<div class="lp-iv-legend">'
      + '<span class="lp-iv-legend__title">' + esc(legend.title || '') + '</span>'
      + items
      + (legend.note ? '<span class="lp-iv-legend__note">' + esc(legend.note) + '</span>' : '')
      + '</div>';
  }

  // ---- 中学歴史年表（A4縦・1ページ2段。西暦15% / 出来事43% / 語呂合わせ42%） ----
  // 段（列）は章の続きでも見出しを出し、「（続き）」で同一章であることを示す。
  function historyColumnHtml(column) {
    var blocks = (column && column.blocks) || [];
    var body = blocks.map(function (block) {
      var heading = esc(block.chapter) + (block.continued ? '（続き）' : '');
      var rows = (block.rows || []).map(function (row) {
        return '<tr><th scope="row" class="lp-hc-year">' + esc(row.year) + '</th>'
          + '<td class="lp-hc-event">' + esc(row.event) + '</td>'
          + '<td class="lp-hc-goro">' + esc(row.goro) + '</td></tr>';
      }).join('');
      return '<tbody><tr class="lp-hc-chapter"><th colspan="3" scope="colgroup">' + heading + '</th></tr>'
        + rows + '</tbody>';
    }).join('');
    return '<div class="lp-hc-col"><table class="lp-hc-tbl">'
      + '<colgroup><col class="lp-hc-col-year"><col class="lp-hc-col-event"><col class="lp-hc-col-goro"></colgroup>'
      + '<thead><tr><th scope="col">西暦</th><th scope="col">出来事</th><th scope="col">語呂合わせ</th></tr></thead>'
      + body + '</table></div>';
  }

  function historyColumnsHtml(page) {
    var columns = (page && page.columns) || [];
    return '<div class="lp-hc-grid">' + columns.map(historyColumnHtml).join('') + '</div>';
  }

  function pageBodyHtml(page) {
    if (page.kind === 'tense-table') return tenseTableHtml(page);
    if (page.kind === 'irregular-verbs') return irregularTablesHtml(page);
    if (page.kind === 'history-chronology') return historyColumnsHtml(page);
    return '';
  }

  function pageHtml(page, material, index, total) {
    var no = index + 1;
    var landscape = material.orientation === 'landscape';
    var history = page.kind === 'history-chronology';
    return '<article class="lp-sheet' + (landscape ? ' lp-sheet--landscape' : '')
      + (history ? ' lp-sheet--history' : '') + '" data-page="' + no + '"'
      + ' data-material="' + esc(material.id) + '"'
      + (landscape ? ' data-orientation="landscape"' : '')
      + ' aria-label="' + esc(material.title + ' ' + no + 'ページ目') + '">'
      + '<div class="lp-sheet__head">'
      + '<h2 class="lp-sheet__title">' + esc(material.title) + '</h2>'
      + (page.caption ? '<span class="lp-sheet__caption">' + esc(page.caption) + '</span>' : '')
      + '</div>'
      + '<div class="lp-sheet__body">'
      + (page.kind === 'tense-table' ? legendHtml() : '')
      + (page.kind === 'irregular-verbs' && index === 0 ? irregularLegendHtml(material) : '')
      + (history && index === 0 && material.note ? '<p class="lp-hc-note">' + esc(material.note) + '</p>' : '')
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

  // ---------------------------------------------------------------- 紙面の向き（@page）
  // 印刷の用紙サイズは教材の向きに合わせて1か所で差し替える（縦=A4 portrait / 横=A4 landscape）。
  // app.css 側には固定の @page を置かない。
  var PAGE_SIZE_STYLE_ID = 'lp-page-size';
  function setPrintPageSize(orientation) {
    var d = docOf(null);
    if (!d || !d.head) return;
    var el = d.getElementById(PAGE_SIZE_STYLE_ID);
    if (!el) {
      el = d.createElement('style');
      el.id = PAGE_SIZE_STYLE_ID;
      d.head.appendChild(el);
    }
    var css = '@page{size:' + (orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait') + ';margin:0}';
    if (el.textContent !== css) el.textContent = css;
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
   * orientation: 'landscape' のときA4横で出力する（省略時は従来どおりA4縦）。
   */
  function makePdf(sheets, cb, orientation) {
    var w = win();
    var list = Array.prototype.slice.call(sheets || []);
    if (!list.length) { cb(new Error('印刷するページがありません')); return; }
    var landscape = orientation === 'landscape';
    var jsPdfOrientation = landscape ? 'landscape' : 'portrait';
    var pageW = landscape ? 297 : 210;
    var pageH = landscape ? 210 : 297;
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
        pdf = new w.jspdf.jsPDF({ orientation: jsPdfOrientation, unit: 'mm', format: 'a4' });
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
            if (at > 0) pdf.addPage('a4', jsPdfOrientation);
            var imgH = Math.min(pageH, pageW * canvas.height / canvas.width);
            var imgW = imgH * canvas.width / canvas.height;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - imgW) / 2, 0, imgW, imgH);
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
    // 長期セッション統合が有効かは送信のたびに解決する（無ければ従来経路）
    var getSession = typeof cfg.getSession === 'function'
      ? cfg.getSession
      : function () { return cfg.session || null; };
    function resolveGateway() {
      var gw = null;
      try { gw = getSession(); } catch (e) { gw = null; }
      if (!gw || typeof gw.mutate !== 'function' || typeof gw.probe !== 'function') return null;
      return gw;
    }
    // 直前にprobeで確定した context（メモリのみ。localStorage/sessionStorageには保存しない）
    var probeContext = null;

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
      // ゲートウェイ（長期セッション統合）が有効なら、旧POST/poll経路へは一切流さない。
      // 旧経路へのfallbackは二重印刷になるため禁止（1回だけ送る）。
      var gw = resolveGateway();
      if (gw) { sendViaGateway(gw); return; }
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
      // ゲートウェイ送信（shared/classroom-session.js）。
      //  - 1リクエストだけ送る（再送なし）。応答不明は unknown として終了し、pollも旧経路も使わない。
      //  - 認証はセッション側の cookie が持ち、JS/localStorage には保存しない。
      //  - context は「PDF生成直前のprobe」で確定した値をそのまま渡し、Worker側で照合させる。
      function sendViaGateway(gw) {
        var rid = '';
        try { rid = (typeof gw.newRid === 'function') ? gw.newRid() : T.newNonce(); } catch (e) { rid = ''; }
        var opts = { rid: rid, timeoutMs: 30000 };
        var ctx = (sendOpts.context !== undefined) ? sendOpts.context : probeContext;
        if (ctx !== undefined && ctx !== null) opts.context = ctx;
        var payload = { b64: b64, name: name, request_id: requestId };
        var promise = null;
        onStatus('送信中…');
        try { promise = gw.mutate('print', payload, opts); } catch (e) { promise = null; }
        if (!promise || typeof promise.then !== 'function') {
          finish({ ok: false, unknown: true, error: T.messages.unknownResult });
          return;
        }
        promise.then(applyGatewayResult, function () {
          finish({ ok: false, unknown: true, error: T.messages.unknownResult });
        });
      }

      // classroom-session.js の戻り値（T.fetchJson互換）を既存の finish 形へ写像する。
      //  - unknown:true   → 適用されたかもしれない（cooldown/pending を残す）
      //  - predispatch    → 送信前に判明した失敗（保存されていない。cooldownを残さない）
      function applyGatewayResult(res) {
        if (!res || typeof res !== 'object') {
          finish({ ok: false, unknown: true, error: T.messages.unknownResult });
          return;
        }
        var data = (res.data && typeof res.data === 'object') ? res.data : null;
        var msg = String(res.error || (data && data.error) || '');
        var code = String((data && data.code) || '');
        var tags = msg + ' ' + code;
        if (res.predispatch === true) {
          // context不足など送信前の失敗。保存はされていないので二重印刷の心配はない。
          if (/context|auth|session|login/i.test(tags)) {
            finish({ ok: false, auth: true, error: msg || 'ログインが必要です。ログインし直してください。' });
            return;
          }
          finish({ ok: false, error: msg || '送信に失敗しました' });
          return;
        }
        // 結果不明（timeout/5xx/解析失敗/rid・request_id不一致/サーバがunknownを返した）
        if (res.unknown === true || (data && data.unknown === true)) {
          finish({ ok: false, unknown: true, error: T.messages.unknownResult });
          return;
        }
        if (res.ok === true && data && data.ok === true) {
          finish({ ok: true, name: data.name || name });
          return;
        }
        if (data && data.ok === false) {
          if (/pending|processing|処理中|in_flight|unknown/i.test(tags) || /pending_unknown|in_flight|ledger_unavailable/i.test(code)) {
            finish({ ok: false, unknown: true, error: T.messages.unknownResult });
            return;
          }
          // アカウント切替/権限は Worker 側の context 照合で拒否される
          if (/bad token|not allowed|not_allowed|strict verification|auth|context|session/i.test(tags)) {
            finish({ ok: false, auth: true, error: msg || '保存先の認証に失敗しました。ログインし直してください。' });
            return;
          }
          finish({ ok: false, error: msg || '送信に失敗しました' });
          return;
        }
        // HTTPエラー等（4xxはサーバが「適用していない」と返した既知失敗）
        if (res.ok === false) {
          if (/bad token|not allowed|not_allowed|auth|context|session/i.test(tags)) {
            finish({ ok: false, auth: true, error: msg || '保存先の認証に失敗しました。ログインし直してください。' });
            return;
          }
          finish({ ok: false, error: msg || '送信に失敗しました' });
          return;
        }
        finish({ ok: false, unknown: true, error: T.messages.unknownResult });
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
      var gw = resolveGateway();
      if (gw) { probeViaGateway(gw, cb); return; }
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

    // ゲートウェイの probe は status だけを返し、context はセッションモジュールのメモリに残る。
    // ここでは「PDF生成直前に確定した文脈」だけを覚えておく（保存はしない）。
    function probeViaGateway(gw, cb) {
      var promise = null;
      try { promise = gw.probe('pdfdrop'); } catch (e) { promise = null; }
      if (!promise || typeof promise.then !== 'function') { cb({ state: 'unreachable' }); return; }
      promise.then(function (res) {
        if (res && res.context !== undefined) probeContext = res.context;
        else if (res && res.ctx !== undefined) probeContext = res.ctx;
        var status = res && res.status;
        if (status === 'ok') { cb({ state: 'ok', isOwner: !!(res && res.isOwner) }); return; }
        if (status === 'notallowed') { cb({ state: 'notallowed', masked: res && res.masked }); return; }
        if (status === 'noauth') { cb({ state: 'noauth' }); return; }
        if (status === 'error') { cb({ state: 'error', message: res && res.message }); return; }
        cb({ state: 'unreachable' });
      }, function () { cb({ state: 'unreachable' }); });
    }

    return {
      send: send,
      probe: probe,
      persist: persist,
      isCoolingDown: function (nowMs) { return (nowMs || Date.now()) < pendingUntil; },
      hasUnknown: function () { return pendingUnknown; },
      pendingUntil: function () { return pendingUntil; },
      clearPending: function () { pendingUnknown = false; pendingUntil = 0; persist(); },
      // probeで確定した文脈（メモリのみ）
      getContext: function () { return probeContext; },
      // テストからのみ参照する（本番UIには出さない）
      _state: function () { return { pendingUntil: pendingUntil, pendingUnknown: pendingUnknown }; }
    };
  }
  // TESTABLE-PDF-END

  // ---------------------------------------------------------------- mount
  function readData() {
    var w = win();
    var data = (w && w.GakusyuPrintMaterials) || { materials: [] };
    var history = w && w.GakusyuPrintHistoryMaterial;
    if (!history || data.fixture || !Array.isArray(data.materials)) return data;
    var i;
    for (i = 0; i < data.materials.length; i++) {
      if (data.materials[i] && data.materials[i].id === history.id) return data;
    }
    var merged = {};
    for (var key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) merged[key] = data[key];
    }
    merged.materials = data.materials.concat([history]);
    return merged;
  }

  // 教室ボタンの表示判定（純粋関数。UIとテストで共有する）。
  // 長期セッション統合の同一オリジンでは localStorage に id_token を持たないため、
  // hadToken では noauth を判定できない。長期originは noauth なら常にログインフォームを出す。
  // 戻り値: { hidden, status（null=触らない）, help（null=触らない）, authExpired（true/false/undefined=触らない） }
  var NOTALLOWED_TEXT = '教室外アカウントでは印刷できません';
  function classroomVisibility(pr, opts) {
    opts = opts || {};
    var longTerm = !!opts.longTerm;
    var noauthMessage = opts.noauthMessage !== undefined ? opts.noauthMessage : '';
    var state = pr && pr.state;
    if (state === 'ok') return { hidden: false, status: '', help: null, authExpired: false };
    if (state === 'notallowed') {
      // 長期originでは、アカウント切替のための同一オリジンログインフォームも一緒に出す
      if (longTerm) return { hidden: true, status: null, help: NOTALLOWED_TEXT + '。', authExpired: undefined };
      return { hidden: true, status: NOTALLOWED_TEXT, help: null, authExpired: undefined };
    }
    if (state === 'error') return { hidden: true, status: null, help: 'ログイン情報を確認できませんでした。', authExpired: undefined };
    if (state === 'noauth') {
      if (longTerm || opts.hadToken || opts.authExpiredNotice) {
        return { hidden: true, status: null, help: noauthMessage, authExpired: true };
      }
      return { hidden: true, status: '', help: null, authExpired: undefined };
    }
    if (!opts.authExpiredNotice) return { hidden: true, status: '', help: null, authExpired: undefined };
    return { hidden: true, status: null, help: null, authExpired: undefined };
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
      // 紙面の向きに応じた基準幅（縦210mm / 横297mm）で画面表示だけを縮小する
      sheetsOf(activeIndex).forEach(function (sheet) {
        var landscape = sheet.getAttribute('data-orientation') === 'landscape';
        var base = (landscape ? 297 : 210) * 96 / 25.4;
        var zoom = avail > 0 ? Math.min(1, avail / base) : 1;
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
      setPrintPageSize(materials[index] && materials[index].orientation);
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
    // 長期セッション統合が有効なら shared/classroom-session.js のログインフォームを使う。
    function appendLoginForm(msg) {
      if (!statusEl) return false;
      var gw = classroomSession();
      if (!gw || typeof gw.loginForm !== 'function') return false;
      var form = null;
      try { form = gw.loginForm(LOGIN_PATH, LOGIN_LABEL); } catch (e) { form = null; }
      if (!form) return false;
      var nodes = [];
      if (form.nodeType) nodes = [form];
      else if (typeof form !== 'string' && typeof form.length === 'number') {
        for (var i = 0; i < form.length; i += 1) { if (form[i] && form[i].nodeType) nodes.push(form[i]); }
      }
      if (!nodes.length && typeof form !== 'string') return false;
      statusEl.textContent = '';
      if (msg) {
        statusEl.appendChild(doc.createTextNode(msg));
        statusEl.appendChild(doc.createTextNode(' '));
      }
      if (typeof form === 'string') statusEl.appendChild(doc.createTextNode(form));
      nodes.forEach(function (node) { statusEl.appendChild(node); });
      return true;
    }

    function showAuthHelp(msg) {
      if (!statusEl) return;
      if (appendLoginForm(msg)) return;
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
      getSession: classroomSession,
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
      if (!T || (!T.probeAuth && !classroomSession())) { classroomBtn.hidden = true; return; }
      var hadToken = !!(T.peekIdToken && T.peekIdToken());
      // 長期セッション統合の同一オリジンでは id_token を localStorage に持たない
      var longTerm = !!classroomSession();
      sender.probe(function (pr) {
        if (seq !== visibilitySeq) return; // 新しい判定が始まっている
        var view = classroomVisibility(pr, {
          longTerm: longTerm,
          hadToken: hadToken,
          authExpiredNotice: authExpiredNotice,
          noauthMessage: noauthHelpMessage(T)
        });
        classroomBtn.hidden = view.hidden;
        if (view.authExpired === true) authExpiredNotice = true;
        else if (view.authExpired === false) authExpiredNotice = false;
        if (view.status !== null) setStatus(view.status);
        if (view.help !== null) showAuthHelp(view.help);
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
            if (pr.state === 'noauth') showAuthHelp(noauthHelpMessage(T));
            else if (pr.state === 'notallowed') setStatus('送信失敗: このアカウント(' + (pr.masked || '不明') + ')は許可リストにありません');
            else if (pr.state === 'unreachable') setStatus('送信失敗: 認証サーバーに接続できませんでした。通信状態を確認して、もう一度お試しください。');
            else setStatus('送信失敗: ' + (pr.message || '不明なエラー'));
            return;
          }
          // 以降の送信は「クリック時に認証が通ったトークン」でのみ行う。
          // 長期セッション統合が有効なときは cookie 認証（id_token を JS に持たない）ので比較しない。
          var gw = classroomSession();
          var clickToken = '';
          if (!gw) {
            clickToken = T.getIdToken() || '';
            if (!clickToken) { setBusy(false); showAuthHelp(MSG_TOKEN_EXPIRED); return; }
          }
          // 生成中にタブが切り替わっても別教材を送らないよう、ここで教材とシートを確定する
          var material = materials[activeIndex];
          var sheets = sheetsOf(activeIndex).slice();
          if (!sheets.length) { setBusy(false); setStatus('送信できるページがありません。'); return; }
          setBusy(true);
          setStatus('PDFを生成中…');
          makePdf(sheets, function (err, pdf) {
            if (err) { release('PDF生成に失敗しました'); return; }
            if (!gw) {
              if ((T.getIdToken() || '') !== clickToken) {
                release('ログインが切り替わったため送信を中止しました。ポータルからログインし直してください。');
                return;
              }
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
          }, material.orientation);
        });
      });
    }

    if (w && typeof w.addEventListener === 'function') w.addEventListener('resize', fitSheets);
    if (w && typeof w.addEventListener === 'function') {
      w.addEventListener('gakusyu-classroom-session-active', function () { updateClassroomVisibility(); });
      w.addEventListener('gakusyu-classroom-session-inactive', function () { updateClassroomVisibility(); });
    }
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
    arcAnchors: arcAnchors,
    rowHtml: rowHtml,
    pageHtml: pageHtml,
    materialHtml: materialHtml,
    legendHtml: legendHtml,
    irregularLegendHtml: irregularLegendHtml,
    setPrintPageSize: setPrintPageSize,
    PAGE_SIZE_STYLE_ID: PAGE_SIZE_STYLE_ID,
    GROUP_LABELS: GROUP_LABELS,
    appMarkup: appMarkup,
    nextTabIndex: nextTabIndex,
    buildPdfName: buildPdfName,
    asciiSlug: asciiSlug,
    pdfByteLength: pdfByteLength,
    isPdfTooLarge: isPdfTooLarge,
    PDF_MAX_BYTES: PDF_MAX_BYTES,
    noauthHelpMessage: noauthHelpMessage,
    classroomVisibility: classroomVisibility,
    loadScriptOnce: loadScriptOnce,
    ensurePdfLibs: ensurePdfLibs,
    makePdf: makePdf,
    createPdfSender: createPdfSender,
    mount: mount,
    boot: boot,
    readData: readData
  };
});
