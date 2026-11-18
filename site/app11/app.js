/*
 * 有機反応マップ（試験版）— 画面の組み立てと操作
 *
 * - 単一の SVG キャンバスに、物質（四角）と反応（丸）を固定座標で置く。
 * - 右下には12分類だけの一般図を、既存の物質・反応とは別レイヤーで固定座標に置く。
 * - ズーム・パンしても位置関係は変えない。表示する要素だけを semantic zoom で切り替える。
 * - 詳細は同じページのフローティングカードで開く（外側クリックと Escape で閉じ、起点へフォーカスを戻す）。
 * - 実行時に site/app10 の実装は読み込まない。データは data.js の静的値だけを使う。
 */
(function () {
  'use strict';

  var D = window.RPMapData;
  var A = window.RPMapAcademic || null;
  // 通常配置案（normal-proposed）の契約・検証（B/D と共通の pure module）。
  var Contract = window.RPMapProposalContract || null;
  // 新しい配置案（通常表示の別配置）。事前生成データで、無い/壊れている場合は現在の配置だけを使う。
  var P = window.RPMapLayoutProposal || null;
  var Core = window.RPMapCore;
  var SD = window.RPStructure;
  // 同じ基質集合→生成物集合の反応を表示だけまとめる pure module。
  // 無い/壊れている場合は全反応をそのまま表示する（新機能が動いたとは扱わない）。
  var Groups = window.RPReactionGroups || null;
  if (!D || !Core) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var NODE_W = D.meta.nodeW;
  var NODE_H = D.meta.nodeH;

  function nodeW(c) { return c.w || NODE_W; }
  function nodeH(c) { return c.h || NODE_H; }

  var mapEl = document.getElementById('rp-map');
  var svg = document.getElementById('rp-svg');
  var viewport = document.getElementById('rp-viewport');
  var overlay = document.getElementById('rp-overlay');
  var card = document.getElementById('rp-card');
  var cardEyebrow = document.getElementById('rp-card-eyebrow');
  var cardDetail = document.getElementById('rp-card-detail');
  var cardClose = document.getElementById('rp-card-close');
  var searchInput = document.getElementById('rp-search');
  var positionEl = document.getElementById('rp-position');
  var positionTrigger = document.getElementById('rp-position-trigger');
  var positionText = document.getElementById('rp-position-text');
  var positionLevel = document.getElementById('rp-position-level');
  var positionPopover = document.getElementById('rp-position-popover');
  var positionFull = document.getElementById('rp-position-full');
  var positionFullNote = document.getElementById('rp-position-full-note');
  var positionLive = document.getElementById('rp-position-live');
  var chipsEl = document.getElementById('rp-chips');
  var toolbarEl = document.querySelector('.rp-toolbar');
  var aboutEl = document.getElementById('rp-about');
  var aboutButton = document.getElementById('rp-about-open');
  var aboutClose = document.getElementById('rp-about-close');
  var eqDialogEl = document.getElementById('rp-eq-dialog');
  var eqDialogTitle = document.getElementById('rp-eq-dialog-title');
  var eqDialogBody = document.getElementById('rp-eq-dialog-body');
  var eqDialogClose = document.getElementById('rp-eq-dialog-close');
  var searchStatus = document.getElementById('rp-search-status');
  var listAll = document.getElementById('rp-list-all');
  var listResults = document.getElementById('rp-list-results');
  var listStatus = document.getElementById('rp-list-status');
  var statesEl = document.getElementById('rp-states');
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var compoundById = {};
  D.compounds.forEach(function (c) { compoundById[c.id] = c; });
  var regionsById = {};
  D.regions.forEach(function (r) { regionsById[r.id] = r; });
  // 俯瞰で分野ごとに1つだけ物質名を出す。分野の中心に近い主要物質を選ぶ。
  // 中心は現在モードの分野矩形（学術では regionFocus）から取り、activeRegions() で作る。

  var incoming = {};
  var outgoing = {};
  D.reactions.forEach(function (r) {
    r.substrates.forEach(function (id) { (outgoing[id] || (outgoing[id] = [])).push(r); });
    r.products.forEach(function (id) { (incoming[id] || (incoming[id] = [])).push(r); });
  });

  // 反応線・一般図の変換線の当たり判定は、見た目の線を変えず画面ピクセルで 18px 幅
  // （半径 9px）を確保する。CSS の stroke-width:18 と必ず同じ値を使う。
  var HIT_WIDTH = Core.HIT_WIDTH;
  var HIT_RADIUS = HIT_WIDTH / 2;
  // 距離計算に使う折れ線の刻み（world）。実際の描画形状（shaft + triangle）をそのまま落とす。
  var HIT_SAMPLE_STEP = 2;

  var nodeIndex = {};
  var reactionIndex = {};
  var hitCandidates = [];
  var edgeIndex = {};
  var classNodeIndex = {};
  var classEdgeIndex = {};
  var classEdgePathIndex = {};
  var classNodeById = {};
  var classEdgeById = {};
  var classLayer = null;
  var normalMarkerLayer = null;
  var reactionConnectors = {};
  var classMapData = D.classMap || null;
  if (classMapData) {
    classMapData.nodes.forEach(function (n) { classNodeById[n.id] = n; });
    classMapData.edges.forEach(function (e) { classEdgeById[e.id] = e; });
  }
  var activeEdgeLayer = null;
  // アカデミック（大学レベルの追加反応＋専用配置）は通常データを書き換えない。
  // 学術表示では、通常 427 の座標を positions で投影した「学術配置」だけを描く。
  // 通常モードでは学術レイヤーを DOM（display:none）・当たり判定・キーボード移動・
  // カードのどれにも混ぜない。
  var mode = 'normal';
  var academic = null;
  var academicReactions = [];      // 追加 178（source 由来）
  var academicAll = [];            // 通常 86 投影 ＋ 追加 178 = 264
  var academicAllById = {};
  var academicReactionIndex = {};  // 学術モードの 264 マーカー
  var academicAllEdgeIndex = {};   // 学術モードの 628 辺
  var academicConnectors = {};     // 参加 reaction id -> connectors（学術 264）
  var academicHitCandidates = [];  // 学術 264 の当たり判定
  var academicIncoming = {};       // 学術 264 の incoming
  var academicOutgoing = {};       // 学術 264 の outgoing
  var academicEndpointIds = {};
  var academicDrawnIds = {};
  var academicNewlyConnectedIds = {};
  var academicLayer = null;
  var academicEnabled = false;
  var academicDisabledReason = '';
  // 通常表示の配置（現在 / 新しい配置案）。mode とは独立で、学術表示では専用配置を使う。
  // 切替のたびに projectedCache を作り直し、canonical な D は書き換えない。
  var layoutChoice = 'current';
  var proposed = null;             // 検証済みの配置案（academic と同じ positions/markers/routes 形）
  var proposedEnabled = false;
  var proposedDisabledReason = '';
  var proposedAll = [];            // 通常 162 を配置案へ投影した複製
  var proposedAllById = {};
  var proposedReactionIndex = {};
  var proposedAllEdgeIndex = {};
  var proposedConnectors = {};
  var proposedHitCandidates = [];
  var proposedIncoming = {};
  var proposedOutgoing = {};
  var proposedLayer = null;
  var proposedBuilt = false;       // 初回選択時に遅延構築する
  // 学術座標へ投影した複製（canonical な D.compounds は変更しない）。
  var projectedCache = null;
  var classHitCandidates = [];
  var previewReaction = null;
  // 反応の表示グループ（各モード・各配置で 1 回だけ作る）。null は従来表示へのフォールバック。
  var normalGrouping = null;
  var proposedGrouping = null;
  var academicGrouping = null;
  var view = { scale: 1, x: 0, y: 0 };
  var viewSize = { w: 1, h: 1 };
  var selected = null;
  var activeRegion = null;
  var returnFocus = null;
  var eqDialogOpener = null;
  var programmaticFocusTarget = null;
  // ポインタ操作（タップ・ドラッグ開始）に伴う focusin を、1回分だけ再センタリングから外す。
  // 実際に focus された要素を見て消費し、キーボード操作（keydown）でも必ず解除する。
  var pointerFocusGuard = false;
  var restoreAfterPointer = null;
  var suppressCompatFocus = false;
  var suppressClick = false;
  var animToken = 0;
  var lastLevel = -1;
  // ホイールの累積目標と補間用の状態。1イベントごとに animateTo を再始動すると
  // 途中の移動が消えるため、目標だけを更新し、rAF 1本で追従する。
  var wheelZoom = null;
  var wheelRaf = 0;
  var wheelApplying = false;
  // パン・ピンチのフレーム集約。pointermove は最新の表示状態だけを保持し、rAF 1本で
  // 1フレーム1回だけ transform を更新する（イベントごとの全再描画をしない）。
  // 途中のフレームは補助ラベルの追従だけを行い、重なり判定・現在位置の再計算は最終フレームへ回す。
  var gestureRaf = 0;
  var gesturePending = null;
  var gestureApplying = false;
  var gestureDirty = false;
  var insetPending = false;
  var WHEEL_FOLLOW = 0.4;
  var WHEEL_SETTLE_SCALE = 1e-4;
  var WHEEL_SETTLE_PX = 0.5;
  var positionFullValue = '';
  var positionLevelValue = '';
  var positionLiveText = '';
  var positionLiveTimer = 0;
  var POSITION_LIVE_DELAY = 500;
  // 右下フローティングの実寸（スクリーン座標の予約に使う）。syncPositionInset が更新する。
  var positionBox = { w: 0, h: 0 };
  var jumpBox = { w: 0, h: 0 };
  // 上部フローティング操作群が地図を覆う高さ。fit のときだけ上余白として予約する。
  var mapTopInset = 0;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function prefersReduce() {
    return !!(reduceQuery && reduceQuery.matches);
  }

  function errMsg(text) {
    if (window.console && console.warn) console.warn('[app11] ' + text);
  }

  /* ---------------- academic layout helpers (projection) ---------------- */

  // build-academic-data.cjs と同じ FNV-1a 32bit。通常ノードの座標・寸法だけで作る。
  function academicBaseHash(compounds) {
    var lines = compounds.map(function (c) {
      return c.id + ':' + c.x + ',' + c.y + ',' + (c.w == null ? '' : c.w) + ',' + (c.h == null ? '' : c.h);
    }).sort().join('\n');
    var hash = 0x811c9dc5;
    for (var i = 0; i < lines.length; i++) {
      hash ^= lines.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('0000000' + hash.toString(16)).slice(-8);
  }

  // 学術配置データの版。通常 427 の座標は data.js のまま残し、学術表示だけ投影する。
  var ACADEMIC_LAYOUT_VERSION = 2;

  // 通常の compound を学術座標へ投影した複製。canonical な c は変更しない。
  function projectCompound(c, pos) {
    if (!pos || !c) return c;
    var out = Object.assign({}, c, { x: pos.x, y: pos.y });
    if (pos.w != null) out.w = pos.w;
    if (pos.h != null) out.h = pos.h;
    return out;
  }

  // 通常の経路を学術配置の折れ線へ置き換える。元の edge は変更しない。
  function projectNormalRoute(rid, edge, routes) {
    var key = rid + '|' + edge.dir + '|' + edge.id;
    var route = routes ? routes[key] : null;
    return {
      dir: edge.dir,
      id: edge.id,
      tier: (route && route.tier) || edge.tier || 'secondary',
      points: (route && route.points) || edge.points,
      gaps: (route && route.gaps) || [],
      bridges: (route && route.bridges) || []
    };
  }

  // 通常 86 の反応を、学術マーカー・学術経路へ投影した複製。
  // state / tier / sources など化学的な内容は canonical のまま保持する。
  // 新しい配置案も同じ投影を使う（layoutName は 'academic' / 'proposed'）。
  function projectNormalReaction(r, layout, layoutName) {
    var markers = (layout && layout.normalMarkers) || {};
    var routes = (layout && layout.normalRoutes) || {};
    var m = markers[r.id];
    return Object.assign({}, r, {
      x: m ? m.x : r.x,
      y: m ? m.y : r.y,
      tier: (m && m.tier) || r.tier,
      label: (m && m.label) || r.label,
      edges: (r.edges || []).map(function (e) { return projectNormalRoute(r.id, e, routes); }),
      layout: layoutName || 'academic',
      normal: true,
      academic: false
    });
  }

  // 学術モードの 1 レイヤー分（通常 86 投影 ＋ 追加 178）。
  function buildAcademicAll(layout, normalReactions, extraReactions) {
    var all = normalReactions.map(function (r) { return projectNormalReaction(r, layout); });
    return all.concat(extraReactions);
  }

  function academicLayoutProblem(layout, compounds, reactions) {
    if (!layout || typeof layout !== 'object') return '配置データがありません。';
    if (layout.version !== ACADEMIC_LAYOUT_VERSION) {
      return '配置データの版が古いため、アカデミック表示を無効にしました。';
    }
    var positions = layout.positions;
    if (!positions || typeof positions !== 'object') return '位置データがありません。';
    for (var i = 0; i < compounds.length; i++) {
      var p = positions[compounds[i].id];
      if (!p || !isFinite(p.x) || !isFinite(p.y)) {
        return '位置データが欠けています: ' + compounds[i].id;
      }
    }
    var canvas = layout.canvas;
    if (!canvas || !isFinite(canvas.x) || !isFinite(canvas.y) || !(canvas.w > 0) || !(canvas.h > 0)) {
      return '学術表示の範囲がありません。';
    }
    var markers = layout.normalMarkers || {};
    var routes = layout.normalRoutes || {};
    for (var ri = 0; ri < reactions.length; ri++) {
      var r = reactions[ri];
      var m = markers[r.id];
      if (!m || !isFinite(m.x) || !isFinite(m.y)) return '通常反応のマーカーがありません: ' + r.id;
      if (!m.label || !m.label.type || !isFinite(m.label.type.x) || !isFinite(m.label.type.y)) {
        return '通常反応のラベルがありません: ' + r.id;
      }
      for (var ei = 0; ei < r.edges.length; ei++) {
        var e = r.edges[ei];
        var route = routes[r.id + '|' + e.dir + '|' + e.id];
        if (!route || !Array.isArray(route.points) || route.points.length < 2) {
          return '通常反応の経路がありません: ' + r.id + '|' + e.id;
        }
      }
    }
    return null;
  }

  // いま表示している配置。学術表示は専用配置、通常表示は選択中の配置（現在 / 新しい配置案）。
  // 無い場合は null（= data.js の canonical 座標をそのまま使う）。
  function activeLayout() {
    if (mode === 'academic') return academicEnabled ? academic : null;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposed;
    return null;
  }

  function activeLayoutName() {
    if (mode === 'academic') return 'current';
    return layoutChoice === 'proposed' && proposedEnabled ? 'proposed' : 'current';
  }

  function projectionKey() {
    return mode === 'academic' ? 'academic' : (activeLayoutName());
  }

  // 学術モードでは positions で投影した複製、通常モードでは canonical をそのまま返す。
  // どちらのモードでも D.compounds 自体は書き換えない。
  function activeCompoundById() {
    var key = projectionKey();
    if (projectedCache && projectedCache.key === key) return projectedCache.map;
    var layout = activeLayout();
    var map = {};
    var list = [];
    D.compounds.forEach(function (c) {
      var projected = layout ? projectCompound(c, layout.positions[c.id]) : c;
      map[c.id] = projected;
      list.push(projected);
    });
    projectedCache = { key: key, mode: mode, map: map, list: list, regions: null };
    return map;
  }

  function activeCompounds() {
    activeCompoundById();
    return projectedCache.list;
  }

  function compoundAt(id) {
    return activeCompoundById()[id] || null;
  }

  // 画面・当たり判定で使う現在モードの位置。
  function positionOf(id) {
    var c = compoundAt(id);
    return c ? { x: c.x, y: c.y, w: nodeW(c), h: nodeH(c) } : null;
  }

  // 分野の focus 矩形。学術表示・配置案では regionFocus を優先する。
  function activeRegions() {
    var layout = activeLayout();
    if (!layout) return D.regions;
    var regionFocus = layout.regionFocus || null;
    if (!regionFocus || !Object.keys(regionFocus).length) return D.regions;
    var key = projectionKey();
    if (projectedCache && projectedCache.key === key && projectedCache.regions) {
      return projectedCache.regions;
    }
    var list = D.regions.map(function (r) {
      var box = regionFocus[r.id];
      if (!box) return r;
      var out = Object.assign({}, r);
      out.focus = box;
      out.center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      return out;
    });
    if (projectedCache && projectedCache.key === key) projectedCache.regions = list;
    return list;
  }

  function activeRegionById(id) {
    var list = activeRegions();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function activeReactions() {
    if (mode === 'academic') return academicAll;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedAll;
    return D.reactions;
  }

  /* ---------------- reaction display groups ---------------- */

  // 同じ「基質ID集合 → 生成物ID集合」の反応を 1 表示にまとめる。
  // 失敗したら null を返し、呼び出し側は元の全反応を表示する（fail-safe）。
  function buildReactionGrouping(list) {
    if (typeof Groups === 'undefined' || !Groups || typeof Groups.build !== 'function') return null;
    if (!Array.isArray(list) || !list.length) return null;
    try {
      return Groups.build(list);
    } catch (err) {
      errMsg('反応グループを作れないため、従来どおり全反応を表示します: ' + (err && err.message));
      return null;
    }
  }

  // いま表示しているモード・配置のグループ。
  function activeGrouping() {
    if (mode === 'academic') return academicGrouping;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedGrouping;
    return normalGrouping;
  }

  // 代表だけの反応リスト（グループが無ければ全件）。built ごとに 1 回だけ作る。
  function displayReactionList(list, built) {
    if (!built) return list;
    if (!built.__displayReactions) {
      var byId = {};
      list.forEach(function (r) { byId[r.id] = r; });
      built.__displayReactions = built.representatives.map(function (id) { return byId[id]; })
        .filter(function (r) { return !!r; });
    }
    return built.__displayReactions;
  }

  function displayReactions() {
    return displayReactionList(activeReactions(), activeGrouping());
  }

  function displayGroupFor(reactionId) {
    var built = activeGrouping();
    if (!built || typeof Groups === 'undefined' || !Groups || typeof Groups.getGroup !== 'function') return null;
    return Groups.getGroup(built, reactionId);
  }

  // 元の反応 ID から、描画に使う代表 ID を返す。単独・不明なら元の ID。
  function displayIdFor(reactionId) {
    var group = displayGroupFor(reactionId);
    return group ? group.representativeId : reactionId;
  }

  function groupOfBuilt(built, reactionId) {
    if (!built || typeof Groups === 'undefined' || !Groups || typeof Groups.getGroup !== 'function') return null;
    return Groups.getGroup(built, reactionId);
  }

  function activeReactionIndex() {
    if (mode === 'academic') return academicReactionIndex;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedReactionIndex;
    return reactionIndex;
  }

  function activeEdgeIndex() {
    if (mode === 'academic') return academicAllEdgeIndex;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedAllEdgeIndex;
    return edgeIndex;
  }

  function activeConnectors() {
    if (mode === 'academic') return academicConnectors;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedConnectors;
    return reactionConnectors;
  }

  function activeHitCandidates() {
    if (mode === 'academic') return academicHitCandidates.concat(classHitCandidates);
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedHitCandidates.concat(classHitCandidates);
    return hitCandidates;
  }

  function activeIncoming(id) {
    if (mode === 'academic') return academicIncoming[id] || [];
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedIncoming[id] || [];
    return incoming[id] || [];
  }

  function activeOutgoing(id) {
    if (mode === 'academic') return academicOutgoing[id] || [];
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedOutgoing[id] || [];
    return outgoing[id] || [];
  }

  function typeFor(type) {
    if (D.types[type]) return D.types[type];
    if (academic && academic.types[type]) return academic.types[type];
    return null;
  }

  /* ---------------- academic layout build ---------------- */

  // 通常データ・学術配置データとの整合が取れない場合は、アカデミックを一切有効化しない
  // （fail-closed）。古い v1 overlay や positions の無いキャッシュへ黙って落ちない。
  function initAcademicData() {
    if (!A || !A.meta || !Array.isArray(A.reactions) || !A.reactions.length) {
      academicDisabledReason = 'アカデミックデータを読み込めないため、通常表示だけを使えます。';
      return false;
    }
    try {
      var base = A.base || {};
      if (base.normalVersion !== D.meta.version ||
        base.compoundCount !== D.compounds.length ||
        base.reactionCount !== D.reactions.length ||
        base.heldReactionCount !== D.meta.heldReactionCount ||
        base.nodeHash !== academicBaseHash(D.compounds)) {
        academicDisabledReason = 'academic-data.js が通常データと一致しないため、アカデミック表示を無効にしました。';
        errMsg(academicDisabledReason);
        return false;
      }
      var L = A.layout;
      var problem = academicLayoutProblem(L, D.compounds, D.reactions);
      if (problem) {
        academicDisabledReason = problem + ' アカデミック表示は使えません（通常表示はそのまま使えます）。';
        errMsg(problem);
        return false;
      }
      var markers = L.markers || {};
      var routes = L.routes || {};
      var normalIds = {};
      D.reactions.forEach(function (r) { normalIds[r.id] = true; });
      var seen = {};
      var list = A.reactions.map(function (raw) {
        if (!/^academic-[a-z0-9][a-z0-9-]*$/.test(raw.id)) throw new Error('academic id が不正: ' + raw.id);
        if (normalIds[raw.id] || seen[raw.id]) throw new Error('academic id が衝突: ' + raw.id);
        seen[raw.id] = true;
        var marker = markers[raw.id];
        if (!marker || !isFinite(marker.x) || !isFinite(marker.y) || !marker.label) {
          throw new Error('academic marker がない: ' + raw.id);
        }
        var subs = raw.substrates || [];
        var prods = raw.products || [];
        if (!subs.length) throw new Error('academic 基質がない: ' + raw.id);
        subs.concat(prods).forEach(function (id) {
          if (!compoundById[id]) throw new Error('academic の物質IDが未収録: ' + id);
        });
        var edges = [];
        // 描画できる経路が 1 本も無い反応は、カードだけの反応として扱う（無言の未描画はしない）。
        var push = function (dir, id) {
          var route = routes[raw.id + '|' + dir + '|' + id];
          if (!route || !Array.isArray(route.points) || route.points.length < 2) return;
          edges.push({ dir: dir, id: id, tier: 'academic', points: route.points, gaps: route.gaps || [], bridges: route.bridges || [] });
        };
        subs.forEach(function (id) { push('in', id); });
        prods.forEach(function (id) { push('out', id); });
        var regionSet = {};
        subs.concat(prods).forEach(function (id) { regionSet[compoundById[id].region] = true; });
        return {
          id: raw.id,
          type: raw.type,
          typeLabel: raw.typeLabel,
          state: raw.state || 'academic',
          academic: true,
          tier: 'academic',
          evidenceKind: raw.evidenceKind,
          stepKind: raw.stepKind,
          steps: raw.steps || [],
          scope: raw.scope || '',
          basedOnHeld: raw.basedOnHeld || null,
          substrates: subs,
          reagents: raw.reagents || [],
          products: prods,
          productNote: raw.productNote || '',
          conditions: raw.conditions || '',
          note: raw.note || '',
          sources: raw.sources || [],
          cross: Object.keys(regionSet).length > 1,
          x: marker.x,
          y: marker.y,
          label: marker.label,
          edges: edges,
          equation: raw.equation || null
        };
      });
      var all = buildAcademicAll(L, D.reactions, list);
      academic = {
        meta: A.meta,
        types: A.types || {},
        reactions: list,
        all: all,
        positions: L.positions,
        regionFocus: L.regionFocus || {},
        canvas: L.canvas,
        stats: L.stats || {},
        normalMarkers: L.normalMarkers || {},
        normalRoutes: L.normalRoutes || {},
        markers: markers,
        routes: routes
      };
      academicReactions = list;
      academicAll = all;
      if (typeof buildReactionGrouping === 'function') academicGrouping = buildReactionGrouping(academicAll);
      academicAll.forEach(function (r) {
        academicAllById[r.id] = r;
        r.products.forEach(function (id) { (academicIncoming[id] = academicIncoming[id] || []).push(r); });
        r.substrates.forEach(function (id) { (academicOutgoing[id] = academicOutgoing[id] || []).push(r); });
        r.substrates.concat(r.products).forEach(function (id) { academicEndpointIds[id] = true; });
        r.edges.forEach(function (e) { academicDrawnIds[e.id] = true; });
      });
      // 通常は孤立していたが、学術反応で新たにネットワークへ入る物質だけを別扱いにする。
      D.compounds.forEach(function (c) {
        if (c.incoming + c.outgoing !== 0) return;
        var ins = (academicIncoming[c.id] || []).length;
        var outs = (academicOutgoing[c.id] || []).length;
        if (ins + outs > 0) academicNewlyConnectedIds[c.id] = true;
      });
      var connectedCount = 0;
      D.compounds.forEach(function (c) {
        if ((academicIncoming[c.id] || []).length + (academicOutgoing[c.id] || []).length > 0) connectedCount++;
      });
      academic.connectedCount = connectedCount;
      academic.unconnectedCount = D.compounds.length - connectedCount;
      projectedCache = null;
      academicEnabled = true;
      return true;
    } catch (err) {
      errMsg('academic-data.js を読み込めないため、アカデミック表示を無効にします: ' + (err && err.message));
      academic = null;
      academicReactions = [];
      academicAll = [];
      academicGrouping = null;
      academicEnabled = false;
      academicDisabledReason = 'academic-data.js を読み込めないため、アカデミック表示を無効にしました。';
      return false;
    }
  }

  /* ---------------- reaction label placement ---------------- */

  // CSS `.rp-reaction__label { text-anchor: middle }` は SVG の presentation 属性より優先される。
  // そのためアンカーは classes（--start / --end / --middle）で与え、文字位置は label.box の
  // 対応する辺へ置く（アンカーと bbox を必ず一致させる）。box の中心が label.type と一致する
  // 現在の通常配置は middle のまま（従来の見た目を変えない）。
  var LABEL_EDGE_OFFSET = 11;

  function labelAnchorName(label) {
    var anchor = label && label.anchor;
    if (anchor === 'start' || anchor === 'end' || anchor === 'middle') return anchor;
    if (anchor === 'left') return 'start';
    if (anchor === 'right') return 'end';
    if (anchor === 'center' || anchor === 'centre') return 'middle';
    var box = label && label.box;
    var type = label && label.type;
    if (box && type &&
      Math.abs(box.x + box.w / 2 - type.x) <= 1 &&
      Math.abs(box.y + box.h / 2 - type.y) <= 1) {
      return 'middle';
    }
    if (label.side === 'E') return 'start';
    if (label.side === 'W') return 'end';
    return 'middle';
  }

  function labelPoint(label) {
    var anchor = labelAnchorName(label);
    var box = label.box;
    var type = label.type;
    if (anchor === 'middle') {
      return {
        x: type ? type.x : box.x + box.w / 2,
        y: type ? type.y : box.y + box.h / 2,
        anchor: anchor
      };
    }
    if (box) {
      return {
        x: anchor === 'start' ? box.x : box.x + box.w,
        y: box.y + box.h / 2,
        anchor: anchor
      };
    }
    if (anchor === 'start') return { x: type.x + LABEL_EDGE_OFFSET, y: type.y, anchor: anchor };
    return { x: type.x - LABEL_EDGE_OFFSET, y: type.y, anchor: anchor };
  }

  // 反応名（と条件）の text を作る。leader があれば同じ反応グループへ短い折れ線として足す
  // （同じ LOD で出し入れする。反応点の丸は復活させない）。
  function reactionLabelNodes(r, extraClass, labelText) {
    var nodes = [];
    if (!r.label || !r.label.type) return nodes;
    var text = labelText || r.typeLabel;
    var leader = r.label.leader;
    if (Array.isArray(leader)) {
      var points = leader.filter(function (pt) {
        return Array.isArray(pt) && pt.length > 1 && isFinite(pt[0]) && isFinite(pt[1]);
      });
      if (points.length > 1) {
        nodes.push(el('polyline', {
          'class': 'rp-reaction__leader',
          'data-reaction': r.id,
          points: points.map(function (pt) { return pt[0] + ',' + pt[1]; }).join(' ')
        }));
      }
    }
    var place = labelPoint(r.label);
    var label = el('text', {
      'class': 'rp-reaction__label' + (extraClass ? ' ' + extraClass : '') +
        ' rp-reaction__label--' + place.anchor,
      x: place.x,
      y: place.y
    });
    label.textContent = text;
    nodes.push(label);
    if (r.conditions && r.label.cond) {
      var cond = el('text', {
        'class': 'rp-reaction__label rp-reaction__label--cond',
        x: r.label.cond.x,
        y: r.label.cond.y,
        'text-anchor': 'middle'
      });
      cond.textContent = Core.shorten(r.conditions, 16);
      nodes.push(cond);
    }
    return nodes;
  }

  function buildAcademic() {
    if (!academicEnabled || !academicReactions.length) return;
    academicLayer = el('g', { 'class': 'rp-academic rp-academic-all', 'data-layout': 'academic', 'aria-hidden': 'true' });
    var secondaryLayer = el('g', { 'class': 'rp-edges rp-edges--secondary' });
    var primaryLayer = el('g', { 'class': 'rp-edges rp-edges--primary' });
    var hitLayer = el('g', { 'class': 'rp-edge-hits', 'aria-hidden': 'true' });
    var markerLayer = el('g', { 'class': 'rp-reactions' });
    var hitShapes = {};
    var hitOrder = {};
    // 学術配置の 427 物質で connector の当たり判定・端点を解く（canonical は使わない）。
    var projected = {};
    D.compounds.forEach(function (c) { projected[c.id] = projectCompound(c, academic.positions[c.id]); });

    academicAll.forEach(function (r) {
      var list = Core.reactionConnectors(r, {
        compoundById: projected,
        nodeW: NODE_W,
        nodeH: NODE_H
      });
      list.forEach(function (c) { c.rid = r.id; });
      academicConnectors[r.id] = list;
    });
    var all = [];
    Object.keys(academicConnectors).forEach(function (id) {
      all = all.concat(academicConnectors[id]);
    });
    Core.separateSharedPorts(all);
    Core.enforcePaintClearance(all);

    var grouping = (typeof academicGrouping !== 'undefined') ? academicGrouping : null;
    var reps = (typeof displayReactionList === 'function')
      ? displayReactionList(academicAll, grouping) : academicAll;
    reps.forEach(function (r, reactionOrder) {
      var group = (typeof groupOfBuilt === 'function') ? groupOfBuilt(grouping, r.id) : null;
      var memberIds = group ? group.memberIds : [r.id];
      var groupLabel = group ? group.typeLabel : r.typeLabel;
      var tier = r.tier === 'primary' ? 'primary' : r.tier === 'secondary' ? 'secondary' : 'academic';
      var edgeLayer = tier === 'primary' ? primaryLayer : secondaryLayer;
      var repPathByEndpoint = {};
      (academicConnectors[r.id] || []).forEach(function (c) {
        var shaftD = Core.routePath(c.shaft || c.points, c.gaps, c.bridges);
        var shaftPath = el('path', {
          'class': 'rp-edge rp-edge--' + tier,
          'data-from': c.dir === 'in' ? c.edgeId : r.id,
          'data-to': c.dir === 'in' ? r.id : c.edgeId,
          'data-edge': c.edgeKeys[0],
          'data-edges': c.edgeKeys.join(','),
          'data-reaction': r.id,
          'data-compound': c.compounds[0],
          'data-compounds': JSON.stringify(c.compounds),
          'data-tier': tier,
          d: shaftD
        });
        edgeLayer.appendChild(shaftPath);
        if (c.arrowHead) edgeLayer.appendChild(el('path', arrowHeadAttrs(c, tier)));
        c.edgeKeys.forEach(function (key) {
          academicAllEdgeIndex[key] = shaftPath;
          repPathByEndpoint[key.slice(r.id.length + 1)] = shaftPath;
        });
        var hitShape = connectorHitShape(c, shaftD);
        hitLayer.appendChild(el('path', {
          'class': 'rp-edge-hit',
          'data-kind': 'reaction',
          'data-id': r.id,
          'data-reaction': r.id,
          d: hitShape.d
        }));
        if (!hitShapes[r.id]) {
          hitShapes[r.id] = { lines: [], fills: [] };
          hitOrder[r.id] = reactionOrder;
        }
        hitShapes[r.id].lines = hitShapes[r.id].lines.concat(hitShape.lines);
        hitShapes[r.id].fills = hitShapes[r.id].fills.concat(hitShape.fills);
      });
      if (group) {
        memberIds.forEach(function (mid) {
          if (mid === r.id) return;
          (academicConnectors[mid] || []).forEach(function (c) {
            c.edgeKeys.forEach(function (key) {
              var alias = repPathByEndpoint[key.slice(mid.length + 1)];
              if (alias) academicAllEdgeIndex[key] = alias;
            });
          });
        });
      }

      var g = el('g', {
        'class': 'rp-reaction rp-reaction--' + tier + (r.academic || r.state === 'confirmed' ? '' : ' is-pending'),
        'data-kind': 'reaction',
        'data-id': r.id,
        'data-tier': tier,
        role: 'button',
        tabindex: '0',
        'aria-label': (typeof reactionAccessibleLabel === 'function' ? reactionAccessibleLabel(r, group) : reactionLabel(r))
      });
      g.appendChild(el('circle', { 'class': 'rp-reaction__dot', cx: r.x, cy: r.y, r: 6 }));
      reactionLabelNodes(r, r.academic ? 'rp-reaction__label--academic' : '', groupLabel).forEach(function (node) {
        g.appendChild(node);
      });
      markerLayer.appendChild(g);
      memberIds.forEach(function (mid) { academicReactionIndex[mid] = g; });
    });

    Object.keys(hitShapes).forEach(function (id) {
      var shape = hitShapes[id];
      academicHitCandidates.push(hitCandidate('reaction', id, hitOrder[id] || 0, { lines: shape.lines, fills: shape.fills }));
    });

    academicLayer.appendChild(secondaryLayer);
    academicLayer.appendChild(primaryLayer);
    academicLayer.appendChild(hitLayer);
    academicLayer.appendChild(markerLayer);
    // 通常ノード・一般図より下、通常の当たり判定より上に置く（通常時は CSS で非表示）。
    var normalMarkers = viewport.querySelector('.rp-reactions');
    if (normalMarkers) viewport.insertBefore(academicLayer, normalMarkers);
    else viewport.appendChild(academicLayer);
  }

  /* ---------------- 新しい配置案（通常表示の別配置） ---------------- */

  // 配置案の契約を検証する。版・base（通常データとのハッシュ）・427 positions・162 markers・
  // 375 routes・canvas は共通 module（proposal-contract.js）に任せ、ここでは経路の端点が
  // 通常データの edge（reaction / dir / compound）と一致することだけを足す。
  function proposedLayoutProblem(layout) {
    if (!Contract || typeof Contract.verifyProposal !== 'function') {
      return '配置案の検証器を読み込めないため、新しい配置案を使えません。';
    }
    var verdict = Contract.verifyProposal(layout, D);
    if (!verdict || !verdict.ok) {
      // 共通 module の返却形式（{ok:false, reason}）に合わせる。将来 problems 配列・message でも読む。
      var detail = (verdict && (verdict.reason || verdict.message ||
        (Array.isArray(verdict.problems) && verdict.problems.length ? verdict.problems[0] : ''))) ||
        '検証できません';
      return '配置案が通常データと一致しません（' + detail + '）。';
    }
    var routes = layout.routes || {};
    for (var ri = 0; ri < D.reactions.length; ri++) {
      var r = D.reactions[ri];
      for (var ei = 0; ei < r.edges.length; ei++) {
        var e = r.edges[ei];
        var route = routes[r.id + '|' + e.dir + '|' + e.id];
        if (!route) return '配置案の経路がありません: ' + r.id + '|' + e.id;
        if (route.reaction != null && route.reaction !== r.id) {
          return '配置案の経路の反応が一致しません: ' + r.id + '|' + e.id;
        }
        if (route.compound != null && route.compound !== e.id) {
          return '配置案の経路の端点が一致しません: ' + r.id + '|' + e.id;
        }
        if (route.dir != null && route.dir !== e.dir) {
          return '配置案の経路の向きが一致しません: ' + r.id + '|' + e.id;
        }
      }
    }
    return null;
  }

  // 壊れた・欠けた配置案では何も有効化しない（fail-closed）。現在の配置はそのまま使える。
  function initProposedLayout() {
    if (!P) {
      proposedDisabledReason = '配置案データを読み込めないため、現在の配置だけを使えます。';
      return false;
    }
    try {
      var problem = proposedLayoutProblem(P);
      if (problem) {
        proposedDisabledReason = problem + ' 新しい配置案は使えません（現在の配置はそのまま使えます）。';
        errMsg(problem);
        return false;
      }
      var markers = P.markers || {};
      var routes = P.routes || {};
      proposed = {
        version: P.version,
        positions: P.positions,
        regionFocus: P.regionFocus || {},
        canvas: P.canvas,
        normalMarkers: markers,
        normalRoutes: routes,
        markers: markers,
        routes: routes,
        stats: P.stats || {},
        warnings: P.warnings || []
      };
      // 反応の内容（state / type / 式 / 出典）は data.js のまま。座標とラベル・経路だけを投影する。
      proposedAll = D.reactions.map(function (r) { return projectNormalReaction(r, proposed, 'proposed'); });
      if (typeof buildReactionGrouping === 'function') proposedGrouping = buildReactionGrouping(proposedAll);
      proposedAll.forEach(function (r) {
        proposedAllById[r.id] = r;
        r.products.forEach(function (id) { (proposedIncoming[id] = proposedIncoming[id] || []).push(r); });
        r.substrates.forEach(function (id) { (proposedOutgoing[id] = proposedOutgoing[id] || []).push(r); });
      });
      projectedCache = null;
      proposedEnabled = true;
      return true;
    } catch (err) {
      errMsg('配置案データを読み込めないため、現在の配置だけを使います: ' + (err && err.message));
      proposed = null;
      proposedAll = [];
      proposedAllById = {};
      proposedGrouping = null;
      proposedEnabled = false;
      proposedDisabledReason = '配置案データを読み込めないため、新しい配置案を使えません。';
      return false;
    }
  }

  // 初回に「新しい配置案」を選んだときだけ DOM を作る（学術表示の 733 DOM と同時に持たない）。
  function buildProposed() {
    if (proposedBuilt || !proposedEnabled || !proposed) return;
    proposedLayer = el('g', { 'class': 'rp-proposed', 'data-layout': 'proposed', 'aria-hidden': 'true' });
    var secondaryLayer = el('g', { 'class': 'rp-edges rp-edges--secondary' });
    var primaryLayer = el('g', { 'class': 'rp-edges rp-edges--primary' });
    var hitLayer = el('g', { 'class': 'rp-edge-hits', 'aria-hidden': 'true' });
    var markerLayer = el('g', { 'class': 'rp-reactions' });
    var hitShapes = {};
    var hitOrder = {};

    var projected = {};
    D.compounds.forEach(function (c) { projected[c.id] = projectCompound(c, proposed.positions[c.id]); });

    proposedAll.forEach(function (r) {
      var list = Core.reactionConnectors(r, {
        compoundById: projected,
        nodeW: NODE_W,
        nodeH: NODE_H
      });
      list.forEach(function (c) { c.rid = r.id; });
      proposedConnectors[r.id] = list;
    });
    var all = [];
    Object.keys(proposedConnectors).forEach(function (id) {
      all = all.concat(proposedConnectors[id]);
    });
    Core.separateSharedPorts(all);
    Core.enforcePaintClearance(all);

    var grouping = (typeof proposedGrouping !== 'undefined') ? proposedGrouping : null;
    var reps = (typeof displayReactionList === 'function')
      ? displayReactionList(proposedAll, grouping) : proposedAll;
    reps.forEach(function (r, reactionOrder) {
      var group = (typeof groupOfBuilt === 'function') ? groupOfBuilt(grouping, r.id) : null;
      var memberIds = group ? group.memberIds : [r.id];
      var groupLabel = group ? group.typeLabel : r.typeLabel;
      var tier = r.tier === 'primary' ? 'primary' : 'secondary';
      var edgeLayer = tier === 'primary' ? primaryLayer : secondaryLayer;
      var repPathByEndpoint = {};
      (proposedConnectors[r.id] || []).forEach(function (c) {
        var edgeTier = c.tier === 'primary' ? 'primary' : 'secondary';
        var shaftD = Core.routePath(c.shaft || c.points, c.gaps, c.bridges);
        var shaftPath = el('path', {
          'class': 'rp-edge rp-edge--' + edgeTier,
          'data-from': c.dir === 'in' ? c.edgeId : r.id,
          'data-to': c.dir === 'in' ? r.id : c.edgeId,
          'data-edge': c.edgeKeys[0],
          'data-edges': c.edgeKeys.join(','),
          'data-reaction': r.id,
          'data-compound': c.compounds[0],
          'data-compounds': JSON.stringify(c.compounds),
          'data-tier': edgeTier,
          d: shaftD
        });
        edgeLayer.appendChild(shaftPath);
        if (c.arrowHead) edgeLayer.appendChild(el('path', arrowHeadAttrs(c, edgeTier)));
        c.edgeKeys.forEach(function (key) {
          proposedAllEdgeIndex[key] = shaftPath;
          repPathByEndpoint[key.slice(r.id.length + 1)] = shaftPath;
        });
        var hitShape = connectorHitShape(c, shaftD);
        hitLayer.appendChild(el('path', {
          'class': 'rp-edge-hit',
          'data-kind': 'reaction',
          'data-id': r.id,
          'data-reaction': r.id,
          d: hitShape.d
        }));
        if (!hitShapes[r.id]) {
          hitShapes[r.id] = { lines: [], fills: [] };
          hitOrder[r.id] = reactionOrder;
        }
        hitShapes[r.id].lines = hitShapes[r.id].lines.concat(hitShape.lines);
        hitShapes[r.id].fills = hitShapes[r.id].fills.concat(hitShape.fills);
      });
      if (group) {
        memberIds.forEach(function (mid) {
          if (mid === r.id) return;
          (proposedConnectors[mid] || []).forEach(function (c) {
            c.edgeKeys.forEach(function (key) {
              var alias = repPathByEndpoint[key.slice(mid.length + 1)];
              if (alias) proposedAllEdgeIndex[key] = alias;
            });
          });
        });
      }

      var g = el('g', {
        'class': 'rp-reaction rp-reaction--' + tier + (r.state === 'confirmed' ? '' : ' is-pending'),
        'data-kind': 'reaction',
        'data-id': r.id,
        'data-tier': tier,
        role: 'button',
        tabindex: '0',
        'aria-label': (typeof reactionAccessibleLabel === 'function' ? reactionAccessibleLabel(r, group) : reactionLabel(r))
      });
      g.appendChild(el('circle', { 'class': 'rp-reaction__dot', cx: r.x, cy: r.y, r: 6 }));
      reactionLabelNodes(r, '', groupLabel).forEach(function (node) { g.appendChild(node); });
      markerLayer.appendChild(g);
      memberIds.forEach(function (mid) { proposedReactionIndex[mid] = g; });
    });

    Object.keys(hitShapes).forEach(function (id) {
      var shape = hitShapes[id];
      proposedHitCandidates.push(hitCandidate('reaction', id, hitOrder[id] || 0,
        { lines: shape.lines, fills: shape.fills }));
    });

    proposedLayer.appendChild(secondaryLayer);
    proposedLayer.appendChild(primaryLayer);
    proposedLayer.appendChild(hitLayer);
    proposedLayer.appendChild(markerLayer);
    // 通常ノード・一般図より下、通常の当たり判定より上に置く（非表示中は CSS で隠す）。
    if (normalMarkerLayer) viewport.insertBefore(proposedLayer, normalMarkerLayer);
    else viewport.appendChild(proposedLayer);
    proposedBuilt = true;
  }

  function ensureProposedLayer() {
    if (proposedBuilt) return;
    buildProposed();
  }

  /* ---------------- 配置の切替（現在 / 新しい配置案） ---------------- */

  function layoutButton(name) {
    return document.getElementById('rp-layout-' + name);
  }

  // 学術表示は専用配置なので、配置ボタンは両方 disabled。title / aria-label でその理由を示す。
  function updateLayoutButtons() {
    var academicMode = mode === 'academic';
    var dedicated = '学術表示は専用配置です。';
    var current = layoutButton('current');
    var proposal = layoutButton('proposed');
    if (current) {
      var currentPressed = !academicMode && layoutChoice === 'current';
      current.setAttribute('aria-pressed', currentPressed ? 'true' : 'false');
      current.disabled = academicMode;
      current.setAttribute('aria-disabled', academicMode ? 'true' : 'false');
      current.title = academicMode ? dedicated : '通常表示の現在の配置を表示します。';
      if (academicMode) current.setAttribute('aria-label', '現在の配置（学術表示は専用配置）');
      else current.removeAttribute('aria-label');
    }
    if (proposal) {
      var proposalPressed = !academicMode && layoutChoice === 'proposed';
      proposal.setAttribute('aria-pressed', proposalPressed ? 'true' : 'false');
      proposal.disabled = academicMode || !proposedEnabled;
      proposal.setAttribute('aria-disabled', (academicMode || !proposedEnabled) ? 'true' : 'false');
      proposal.title = academicMode ? dedicated
        : proposedEnabled ? '通常表示の新しい配置案を表示します。'
          : (proposedDisabledReason || '新しい配置案を利用できません。');
      if (academicMode) proposal.setAttribute('aria-label', '新しい配置案（学術表示は専用配置）');
      else proposal.removeAttribute('aria-label');
    }
  }

  // 切替後、選択中の物質・反応があれば新しい位置へ寄せ、無ければ全体表示へ戻す。
  // ホイールの途中目標と進行中のアニメーションは切替前に捨てる（競合させない）。
  function focusAfterLayoutSwitch(logical) {
    if (logical && logical.kind === 'compound') {
      var c = compoundAt(logical.id);
      if (c) {
        animateTo(entityTarget({ x: c.x, y: c.y }, { w: nodeW(c), h: nodeH(c) }, Math.max(view.scale, 0.92)));
        return;
      }
    } else if (logical && logical.kind === 'reaction') {
      var r = findReaction(displayIdFor(logical.id));
      if (r) {
        animateTo(entityTarget({ x: r.x, y: r.y }, { w: 0, h: 0 }, Math.max(view.scale, 0.92)));
        return;
      }
    }
    animateTo(fitModeCanvasView());
  }

  // 切替後に隠れるレイヤーに focus が残るときだけ、地図へ focus を移す。
  // 表示され続けるレイヤー（または地図の外）の focus は動かさない（余分なフォーカス移動を作らない）。
  function moveFocusOutOfHiddenLayer() {
    var activeEl = document.activeElement;
    if (!activeEl || !activeEl.closest) return;
    var layer = activeEl.closest('.rp-academic') ? 'academic'
      : activeEl.closest('.rp-proposed') ? 'proposed'
        : activeEl.closest('.rp-layout-normal') ? 'current'
          : null;
    if (!layer) return;
    var visible = mode === 'academic' ? 'academic'
      : (layoutChoice === 'proposed' && proposedEnabled ? 'proposed' : 'current');
    if (layer === visible) return;
    if (mapEl.focus) {
      try { mapEl.focus({ preventScroll: true }); } catch (err) { errMsg(err && err.message); }
    }
  }

  // 配置の切替。モード（通常 / 学術）とは独立で、選択・カード・検索入力/結果は保つ。
  // 学術表示中は専用配置なので切り替えない（選択は layoutChoice に残し、通常へ戻すと復元する）。
  function setLayoutChoice(next) {
    var value = next === 'proposed' ? 'proposed' : 'current';
    if (mode === 'academic') return;
    if (value === 'proposed' && !proposedEnabled) return;
    if (value === layoutChoice) return;
    var logical = selected ? { kind: selected.kind, id: selected.id } : null;
    var cardOpen = !card.hidden;
    cancelWheelZoom();
    animToken += 1;
    closeEquationDialog(false);
    closePositionPopover(false);
    clearRegionSelection();
    layoutChoice = value;
    if (layoutChoice === 'proposed') ensureProposedLayer();
    projectedCache = null;
    svg.setAttribute('data-layout', layoutChoice);
    mapEl.setAttribute('data-layout', layoutChoice);
    // 切替後に隠れる層の focus だけ地図へ移す（表示される層の focus は動かさない）。
    moveFocusOutOfHiddenLayer();
    syncNodeProjection();
    syncModeLayers();
    updateLayoutButtons();
    updateMarkers(Core.detailLevel(view.scale));
    var keep = logical && modeHasEntity(logical.kind, logical.id);
    if (keep) {
      selectNode(logical.kind, logical.id);
      if (cardOpen) openCard(logical.kind, logical.id);
    } else if (cardOpen) {
      closeCard(false);
    }
    // 非表示になった層の要素をフォーカス復帰先に残さない。
    if (returnFocus && returnFocus.closest) {
      var hiddenNormal = !!returnFocus.closest('.rp-layout-normal') && layoutChoice === 'proposed';
      var hiddenProposed = !!returnFocus.closest('.rp-proposed') && layoutChoice !== 'proposed';
      if (hiddenNormal || hiddenProposed) returnFocus = null;
    }
    focusAfterLayoutSwitch(keep ? logical : null);
  }

  /* ---------------- build the canvas ---------------- */

  function nodeCenter(c) {
    return { x: c.x + nodeW(c) / 2, y: c.y + nodeH(c) / 2 };
  }

  // 矢印は marker-end ではなく、shaft と分離した triangle を描く。
  var ARROW_TIER = { primary: 'primary', secondary: 'secondary' };
  function arrowHeadAttrs(c, extraClass) {
    return {
      'class': 'rp-arrowhead rp-arrowhead--' + (extraClass || ARROW_TIER[c.tier] || 'primary'),
      d: Core.arrowHeadPath(c.arrowHead)
    };
  }

  function buildConnectors() {
    var all = [];
    D.reactions.forEach(function (r) {
      var list = Core.reactionConnectors(r, {
        compoundById: compoundById,
        nodeW: NODE_W,
        nodeH: NODE_H
      });
      list.forEach(function (c) { c.rid = r.id; });
      reactionConnectors[r.id] = list;
      all = all.concat(list);
    });
    // 同じ物質の同じ端点に集まる別反応の線だけ、描画端点を辺に沿って分ける。
    Core.separateSharedPorts(all);
    // 実際の paint 形状（butt端面・triangle全体）がノード外周+gapの外にあることを保証する。
    Core.enforcePaintClearance(all);
  }

  // path 文字列を、当たり判定の距離計算に使う折れ線（world 座標）へ落とす。
  function hitPolylines(d) {
    var subpaths = Core.samplePath(d, HIT_SAMPLE_STEP) || [];
    var out = [];
    subpaths.forEach(function (points) {
      if (points && points.length > 1) out.push(points);
    });
    return out;
  }

  // 透明ヒットの path 文字列と距離計算用の形状を、同じ connector から一度だけ作って共有する。
  // triangle は「描画と同じ頂点」の塗り多角形として持つ（内部は距離0）。
  function connectorHitShape(connector, shaftD) {
    if (connector.__hitShape) return connector.__hitShape;
    var head = connector.arrowHead;
    var hitD = head ? shaftD + ' ' + Core.arrowHeadPath(head) : shaftD;
    var shape = {
      d: hitD,
      lines: hitPolylines(hitD),
      fills: head ? [[head.tip, head.left, head.right]] : []
    };
    connector.__hitShape = shape;
    return shape;
  }

  function hitCandidate(kind, id, order, shape) {
    var box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    var expand = function (poly) {
      poly.forEach(function (p) {
        if (p.x < box.minX) box.minX = p.x;
        if (p.y < box.minY) box.minY = p.y;
        if (p.x > box.maxX) box.maxX = p.x;
        if (p.y > box.maxY) box.maxY = p.y;
      });
    };
    (shape.lines || []).forEach(expand);
    (shape.fills || []).forEach(expand);
    return { kind: kind, id: id, order: order || 0, lines: shape.lines, fills: shape.fills, box: box };
  }

  function buildReactions() {
    var secondaryLayer = el('g', { 'class': 'rp-edges rp-edges--secondary rp-layout-normal', 'data-layout': 'normal' });
    var primaryLayer = el('g', { 'class': 'rp-edges rp-edges--primary rp-layout-normal', 'data-layout': 'normal' });
    // 見えない当たり判定の層は、可視線の上・反応ラベル（marker）の下に置く。
    // 反応ラベルと物質ノードのタップは無条件で優先される（後から描くため）。
    var hitLayer = el('g', { 'class': 'rp-edge-hits rp-layout-normal', 'data-layout': 'normal', 'aria-hidden': 'true' });
    var markerLayer = el('g', { 'class': 'rp-reactions rp-layout-normal', 'data-layout': 'normal' });
    var hitShapes = {};
    var hitOrder = {};
    // 全 facts の connector は buildConnectors が計算済み。ここでは代表の線だけを描き、
    // 各 member の edge key（選択・強調用）は代表の同じ端点の path へ alias する。
    var grouping = (typeof normalGrouping !== 'undefined') ? normalGrouping : null;
    var reps = (typeof displayReactionList === 'function')
      ? displayReactionList(D.reactions, grouping) : D.reactions;
    reps.forEach(function (r, reactionOrder) {
      var group = (typeof groupOfBuilt === 'function') ? groupOfBuilt(grouping, r.id) : null;
      var memberIds = group ? group.memberIds : [r.id];
      var groupLabel = group ? group.typeLabel : r.typeLabel;
      var tier = r.tier === 'primary' ? 'primary' : 'secondary';
      var repPathByEndpoint = {};
      (reactionConnectors[r.id] || []).forEach(function (c) {
        var edgeTier = c.tier === 'primary' ? 'primary' : 'secondary';
        var shaftD = Core.routePath(c.shaft || c.points, c.gaps, c.bridges);
        var attrs = {
          'class': 'rp-edge rp-edge--' + edgeTier,
          'data-from': c.dir === 'in' ? c.edgeId : r.id,
          'data-to': c.dir === 'in' ? r.id : c.edgeId,
          'data-edge': c.edgeKeys[0],
          'data-edges': c.edgeKeys.join(','),
          'data-reaction': r.id,
          'data-compound': c.compounds[0],
          // ID 自体にカンマが入るため JSON 配列で厳密に保持する。
          'data-compounds': JSON.stringify(c.compounds),
          'data-tier': edgeTier,
          d: shaftD
        };
        var path = el('path', attrs);
        var targetLayer = edgeTier === 'primary' ? primaryLayer : secondaryLayer;
        targetLayer.appendChild(path);
        if (c.arrowHead) targetLayer.appendChild(el('path', arrowHeadAttrs(c)));
        c.edgeKeys.forEach(function (key) {
          edgeIndex[key] = path;
          repPathByEndpoint[key.slice(r.id.length + 1)] = path;
        });
        // 可視線と同じ形状（shaft + triangle）の透明な当たり判定を、枝ごとに1本ずつ置く。
        // 幅は CSS の 18px（画面ピクセル）で、拡大率が変わっても一定。
        var hitShape = connectorHitShape(c, shaftD);
        hitLayer.appendChild(el('path', {
          'class': 'rp-edge-hit',
          'data-kind': 'reaction',
          'data-id': r.id,
          'data-reaction': r.id,
          d: hitShape.d
        }));
        if (!hitShapes[r.id]) {
          hitShapes[r.id] = [];
          hitOrder[r.id] = reactionOrder;
        }
        hitShapes[r.id].push(hitShape);
      });
      // 非表示 member の edge key も代表の線へ alias する（強調・選択を壊さない）。
      if (group) {
        memberIds.forEach(function (mid) {
          if (mid === r.id) return;
          (reactionConnectors[mid] || []).forEach(function (c) {
            c.edgeKeys.forEach(function (key) {
              var alias = repPathByEndpoint[key.slice(mid.length + 1)];
              if (alias) edgeIndex[key] = alias;
            });
          });
        });
      }
      var g = el('g', {
        'class': 'rp-reaction rp-reaction--' + tier + (r.state === 'confirmed' ? '' : ' is-pending'),
        'data-kind': 'reaction',
        'data-id': r.id,
        'data-tier': tier,
        role: 'button',
        tabindex: '0',
        'aria-label': (typeof reactionAccessibleLabel === 'function' ? reactionAccessibleLabel(r, group) : reactionLabel(r))
      });
      g.appendChild(el('circle', { 'class': 'rp-reaction__dot', cx: r.x, cy: r.y, r: 6 }));
      reactionLabelNodes(r, '', groupLabel).forEach(function (node) { g.appendChild(node); });
      markerLayer.appendChild(g);
      // reactionIndex は member 全 ID から同じ DOM を引けるよう alias を維持する。
      memberIds.forEach(function (mid) { reactionIndex[mid] = g; });
    });
    Object.keys(hitShapes).forEach(function (id) {
      var lines = [];
      var fills = [];
      hitShapes[id].forEach(function (shape) {
        lines = lines.concat(shape.lines);
        fills = fills.concat(shape.fills);
      });
      hitCandidates.push(hitCandidate('reaction', id, hitOrder[id], { lines: lines, fills: fills }));
    });
    viewport.appendChild(secondaryLayer);
    viewport.appendChild(primaryLayer);
    viewport.appendChild(hitLayer);
    viewport.appendChild(markerLayer);
    normalMarkerLayer = markerLayer;
  }

  function buildNodes() {
    var nodeLayer = el('g', { 'class': 'rp-nodes' });
    D.compounds.forEach(function (c) {
      var g = el('g', {
        'class': 'rp-node' + (c.hub ? ' is-hub' : ''),
        'data-kind': 'compound',
        'data-id': c.id,
        'data-path-state': c.pathState,
        role: 'button',
        tabindex: '0',
        'aria-label': compoundLabel(c)
      });
      g.appendChild(el('rect', {
        'class': 'rp-node__box',
        x: c.x,
        y: c.y,
        width: nodeW(c),
        height: nodeH(c),
        rx: 9
      }));
      if (typeof c.regionIndex === 'number') {
        g.appendChild(el('rect', {
          'class': 'rp-node__band rp-c' + c.regionIndex,
          x: c.x + 8,
          y: c.y + 2.5,
          width: nodeW(c) - 16,
          height: 2.5,
          rx: 1.2
        }));
      }
      var text = el('text', {
        'class': 'rp-node__label',
        x: c.x + nodeW(c) / 2,
        y: c.y + nodeH(c) / 2 + 1,
        'text-anchor': 'middle'
      });
      text.textContent = c.label;
      g.appendChild(text);
      if (c.pathState !== 'covered' && c.pathState !== 'confirmed') {
        g.appendChild(el('circle', {
          'class': 'rp-node__badge',
          cx: c.x + nodeW(c) - 8,
          cy: c.y + 8,
          r: 3.2
        }));
      }
      nodeLayer.appendChild(g);
      nodeIndex[c.id] = g;
    });
    viewport.appendChild(nodeLayer);
  }

  // 学術表示・配置案では、ノードのグループを投影座標へ translate する。rect / band / text / badge は
  // 子要素のまま一緒に動くため、文字を描き直さない。通常へ戻すときは transform を外し、
  // 寸法も canonical から作り直すので累積誤差は出ない。
  function syncNodeProjection() {
    var layout = activeLayout();
    var positions = layout && layout.positions ? layout.positions : null;
    D.compounds.forEach(function (c) {
      var g = nodeIndex[c.id];
      if (!g) return;
      var pos = positions ? positions[c.id] : null;
      var tx = pos ? pos.x - c.x : 0;
      var ty = pos ? pos.y - c.y : 0;
      if (tx || ty) g.setAttribute('transform', 'translate(' + tx + ' ' + ty + ')');
      else g.removeAttribute('transform');
      var baseW = nodeW(c);
      var baseH = nodeH(c);
      var w = pos && pos.w != null ? pos.w : baseW;
      var h = pos && pos.h != null ? pos.h : baseH;
      var box = g.querySelector('.rp-node__box');
      if (box) {
        box.setAttribute('width', w);
        box.setAttribute('height', h);
      }
      var band = g.querySelector('.rp-node__band');
      if (band) band.setAttribute('width', w - 16);
      var text = g.querySelector('.rp-node__label');
      if (text) {
        text.setAttribute('x', c.x + w / 2);
        text.setAttribute('y', c.y + h / 2 + 1);
      }
      var badge = g.querySelector('.rp-node__badge');
      if (badge) badge.setAttribute('cx', c.x + w - 8);
    });
  }

  // 反応マーカー層のキーボード到達性だけを切り替える（見た目は CSS が data-mode で決める）。
  function setLayerInteractive(group, enabled) {
    if (!group || !group.querySelectorAll) return;
    group.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    var items = group.querySelectorAll('[data-kind][role="button"]');
    for (var i = 0; i < items.length; i++) {
      items[i].setAttribute('tabindex', enabled ? '0' : '-1');
    }
  }

  function syncModeLayers() {
    var acad = mode === 'academic' && academicEnabled;
    var prop = !acad && mode === 'normal' && layoutChoice === 'proposed' && proposedEnabled && proposedBuilt;
    if (academicLayer && academicLayer.style) academicLayer.style.display = acad ? '' : 'none';
    if (proposedLayer && proposedLayer.style) proposedLayer.style.display = prop ? '' : 'none';
    setLayerInteractive(academicLayer, acad);
    setLayerInteractive(proposedLayer, prop);
    setLayerInteractive(normalMarkerLayer, !acad && !prop);
  }

  // 俯瞰で分野ごとに1つだけ物質名を出す。学術モードでは regionFocus の中心で選び直す。
  function regionHubs() {
    var key = projectionKey();
    if (projectedCache && projectedCache.key === key && projectedCache.hubs) return projectedCache.hubs;
    var hubs = {};
    var regions = {};
    activeRegions().forEach(function (r) { regions[r.id] = r; });
    activeCompounds().forEach(function (c) {
      if (!c.hub) return;
      var region = regions[c.region];
      if (!region) return;
      var center = region.center || { x: 0, y: 0 };
      var dx = c.x + nodeW(c) / 2 - center.x;
      var dy = c.y + nodeH(c) / 2 - center.y;
      var distance = Math.hypot(dx, dy);
      if (!hubs[c.region] || distance < hubs[c.region].distance) {
        hubs[c.region] = { compound: c, distance: distance };
      }
    });
    if (projectedCache && projectedCache.key === key) projectedCache.hubs = hubs;
    return hubs;
  }

  // 12分類だけの一般図。既存の物質・反応とは別レイヤーに固定座標で描き、D.compounds / D.reactions には混ぜない。
  function buildClassMap() {
    if (!classMapData) return;
    classLayer = el('g', { 'class': 'rp-classmap', 'aria-label': classMapData.title });
    var frame = classMapData.frame;
    var frameEl = el('rect', {
      'class': 'rp-classmap__frame',
      x: frame.x,
      y: frame.y,
      width: frame.w,
      height: frame.h,
      rx: 18,
      'aria-hidden': 'true'
    });
    classLayer.appendChild(frameEl);
    // 見出しは図の一部として world 座標の枠内上帯に固定する。パン・ズームで図と一緒に動き、
    // 倍率に応じて文字も拡大縮小する（画面の空き場所を探して追従させない）。
    var capsuleX = frame.x + 28;
    var capsuleY = frame.y + 24;
    var caption = el('g', { 'class': 'rp-classmap__caption', 'aria-hidden': 'true' });
    caption.appendChild(el('rect', {
      'class': 'rp-classmap__caption-box',
      x: capsuleX,
      y: capsuleY,
      width: 250,
      height: 40,
      rx: 8
    }));
    var captionTitle = el('text', {
      'class': 'rp-classmap__caption-title',
      x: capsuleX + 8,
      y: capsuleY + 16
    });
    captionTitle.textContent = classMapData.title;
    caption.appendChild(captionTitle);
    var captionNote = el('text', {
      'class': 'rp-classmap__caption-note',
      x: capsuleX + 8,
      y: capsuleY + 32
    });
    captionNote.textContent = classMapData.note;
    caption.appendChild(captionNote);
    classLayer.appendChild(caption);
    // 変換線は装飾ではない。1本＝1フォーカス（tabindex）として、透明な太い当たり判定と
    // 同じ変換のラベルを1つのグループにまとめる。ノードより先に置き、重なった場合はノードを優先する。
    var edgeLayer = el('g', { 'class': 'rp-classmap__edges' });
    var classConnectorList = classMapData.edges.map(function (e) {
      return { e: e, cc: Core.classConnector(e, { nodeById: classNodeById }) };
    });
    Core.enforcePaintClearance(classConnectorList.map(function (item) { return item.cc; }));
    var classHitPoints = [];
    classConnectorList.forEach(function (item, classOrder) {
      // 一般図も同じ端点規則（角丸枠・butt cap・分離した triangle）で描く。座標・配置は変えない。
      var e = item.e;
      var cc = item.cc;
      var d = Core.routePath(cc.shaft || cc.points, [], []);
      // 具体図とまったく同じ規則（同じ shape を hit path と距離計算で共有）を使う。
      var hitShape = connectorHitShape(cc, d);
      classHitPoints.push(hitCandidate('class-edge', e.id, classOrder, hitShape));
      var group = el('g', {
        'class': 'rp-classmap__edge-group',
        'data-kind': 'class-edge',
        'data-id': e.id,
        role: 'button',
        tabindex: '0',
        'aria-label': classEdgeLabel(e)
      });
      group.appendChild(el('path', {
        'class': 'rp-classmap__edge-hit',
        'data-kind': 'class-edge',
        'data-id': e.id,
        'data-class-edge': e.id,
        d: hitShape.d
      }));
      var path = el('path', {
        'class': 'rp-classmap__edge',
        'data-class-edge': e.id,
        'data-from': e.from,
        'data-to': e.to,
        d: d
      });
      group.appendChild(path);
      if (cc.arrowHead) group.appendChild(el('path', {
        'class': 'rp-classmap__arrowhead',
        d: Core.arrowHeadPath(cc.arrowHead)
      }));
      var pos = e.labelPos;
      var label = el('text', {
        'class': 'rp-classmap__label',
        x: pos.x,
        y: pos.y,
        'text-anchor': pos.anchor
      });
      var first = el('tspan', { x: pos.x, y: pos.y });
      first.textContent = e.label;
      label.appendChild(first);
      if (e.conditions) {
        var second = el('tspan', { x: pos.x, y: pos.y + 12 });
        second.textContent = e.conditions;
        label.appendChild(second);
      }
      group.appendChild(label);
      edgeLayer.appendChild(group);
      classEdgeIndex[e.id] = group;
      classEdgePathIndex[e.id] = path;
    });
    var nodeLayer = el('g', { 'class': 'rp-classmap__nodes' });
    classMapData.nodes.forEach(function (n) {
      var g = el('g', {
        'class': 'rp-classmap__node',
        'data-kind': 'class',
        'data-id': n.id,
        role: 'button',
        tabindex: '0',
        'aria-label': classNodeLabel(n)
      });
      g.appendChild(el('rect', {
        'class': 'rp-classmap__node-box',
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 9
      }));
      var text = el('text', {
        'class': 'rp-classmap__node-label',
        x: n.x + n.w / 2,
        y: n.y + n.h / 2 + 1,
        'text-anchor': 'middle'
      });
      text.textContent = n.name;
      g.appendChild(text);
      nodeLayer.appendChild(g);
      classNodeIndex[n.id] = g;
    });
    hitCandidates = hitCandidates.concat(classHitPoints);
    classHitCandidates = classHitCandidates.concat(classHitPoints);
    classLayer.appendChild(edgeLayer);
    classLayer.appendChild(nodeLayer);
    viewport.appendChild(classLayer);
  }

  function classNodeLabel(n) {
    return n.name + '。' + n.summary + '。' + n.scope;
  }

  function classEdgeLabel(e) {
    var from = classNodeById[e.from];
    var to = classNodeById[e.to];
    return '一般変換 ' + (from ? from.name : e.from) + ' から ' + (to ? to.name : e.to) +
      '、' + e.label + '、条件 ' + e.conditions;
  }

  function compoundLabel(c) {
    var parts = [c.name, c.formula];
    if (c.pathState === 'unverified') parts.push('反応経路は未確認');
    if (c.pathState === 'out-of-scope') parts.push('反応経路は収録外');
    if (!c.builder.href) parts.push('ビルダー収録外');
    return parts.join('、');
  }

  function reactionLabel(r) {
    var subs = r.substrates.map(function (id) { return compoundById[id] ? compoundById[id].name : id; });
    var prods = r.products.length
      ? r.products.map(function (id) { return compoundById[id] ? compoundById[id].name : id; })
      : [r.productNote || '生成物の記載なし'];
    var text = '反応 ' + r.typeLabel + '、' + subs.join('と') + ' から ' + prods.join('と');
    if (r.conditions) text += '、条件 ' + r.conditions;
    if (r.tier === 'primary') text += '、主要経路';
    if (r.state !== 'confirmed') text += '、未確認';
    return text;
  }

  // グループ代表の読み上げ名。member ごとの条件はカード側に残す。
  function reactionAccessibleLabel(r, group) {
    var text = reactionLabel(r);
    if (group && group.size > 1) {
      text = '同じ基質と生成物の反応 ' + group.size + '件をまとめて表示。' +
        '代表 ' + r.typeLabel + '。' + text;
    }
    return text;
  }

  /* ---------------- transform ---------------- */

  function measure() {
    var rect = svg.getBoundingClientRect();
    viewSize.w = Math.max(1, rect.width || mapEl.clientWidth || 1);
    viewSize.h = Math.max(1, rect.height || mapEl.clientHeight || 1);
  }

  // 通常は modeCanvas() そのもの。学術表示・配置案は専用 canvas を返す。
  function modeCanvas() {
    var layout = activeLayout();
    return layout && layout.canvas ? layout.canvas : D.meta.canvas;
  }

  function fitTopInset() {
    return mapTopInset;
  }

  // 地図の上に浮かぶ操作群の実寸を測る。地図の SVG viewport は full サイズのままなので、
  // fit では「上を toolbar 分だけ狭めた領域」に収め、その中心へ下げる（座標の二重補正はしない）。
  // 小さすぎる画面で地図が消えないよう、予約は地図高の 42% までにする。
  function syncToolbarInset() {
    var inset = 0;
    if (toolbarEl) {
      var mapRect = mapEl.getBoundingClientRect();
      var toolbarRect = toolbarEl.getBoundingClientRect();
      if (toolbarRect && toolbarRect.height) inset = Math.round(toolbarRect.bottom - mapRect.top + 8);
    }
    var cap = Math.round((viewSize.h || 0) * 0.42);
    mapTopInset = Math.max(0, cap > 0 ? Math.min(inset, cap) : inset);
    mapEl.style.setProperty('--rp-toolbar-h', mapTopInset + 'px');
    return mapTopInset;
  }

  // 上の浮遊コントロール分を狭めた領域で求めた fit を、その領域の中心へ移す。
  // fitTransform / centerOn / regionView / fitRect は [0, innerH] の中央に置くので、
  // 実表示領域 [top, H] の中心 (H + top) / 2 へは top を足す（top/2 では H/2 に戻ってしまう）。
  function insetFitView(fit, top) {
    return { scale: fit.scale, x: fit.x, y: fit.y + top };
  }

  // 全体表示の fit。上部の操作群に重要部分が隠れない高さで合わせる。
  // innerH の下限 160 は、極端に低い画面でも倍率が潰れないための最小値。
  function fitCanvasView() {
    var top = fitTopInset();
    var innerH = Math.max(160, viewSize.h - top);
    var fit = Core.fitTransform(modeCanvas(), viewSize.w, innerH, 14);
    return insetFitView(fit, top);
  }

  // 学術表示・配置案の専用表示範囲は、通常 canvas を含み、はみ出した分だけ広い。
  // 通常（現在の配置）の fit / clamp / 座標は一切変えない。
  function fitModeCanvasView() {
    var layout = activeLayout();
    var canvas = layout && layout.canvas ? layout.canvas : D.meta.canvas;
    var top = fitTopInset();
    var innerH = Math.max(160, viewSize.h - top);
    return insetFitView(Core.fitTransform(canvas, viewSize.w, innerH, 14), top);
  }


  function regionTarget(region) {
    var top = fitTopInset();
    var innerH = Math.max(160, viewSize.h - top);
    return insetFitView(Core.regionView(region, viewSize.w, innerH, 24), top);
  }

  // 物質・反応を画面中央へ寄せる。中心は実表示領域の中央にする。
  function entityTarget(target, size, scale) {
    var top = fitTopInset();
    var innerH = Math.max(160, viewSize.h - top);
    return insetFitView(Core.centerOn(target, size, scale, viewSize.w, innerH), top);
  }

  function setView(next, clamp) {
    // ホイール以外の操作（パン・ピンチ・キー・ボタン・fit・resize）が入ったら、
    // 途中のホイール目標は捨てる。古い目標へ戻る「巻き戻り」を起こさない。
    if (!wheelApplying) cancelWheelZoom();
    // ジェスチャー外の操作は予約済みのジェスチャーフレームより新しい。古い座標で
    // この表示を上書きしないよう、予約を捨てる（ジェスチャー自身の適用中は除く）。
    if (!gestureApplying) {
      cancelGestureFrame();
    }
    applyView(next, clamp);
    // 指が押されたままなら、その指の位置を新しい表示の基準へ取り直す。
    // 以後の move はこの表示からの差分になり、新しい操作を打ち消さない。
    if (!gestureApplying && pointerList().length) rebaseGestureOrigins();
    render();
  }

  function applyView(next, clamp) {
    view = clamp ? Core.clampPan(next, viewSize.w, viewSize.h, modeCanvas()) : next;
  }

  function renderTransform() {
    viewport.setAttribute('transform', 'translate(' + view.x.toFixed(2) + ' ' + view.y.toFixed(2) + ') scale(' + view.scale.toFixed(4) + ')');
  }

  // 詳細度（LOD）の切り替え。変わったときだけ true を返し、呼び出し側が
  // マーカー・補助ラベルの作り直しを行う。ジェスチャー中は実寸を伴う
  // syncPositionInset を最終フレームまで遅らせる（deferInset）。
  function applyDetailLevel(level, deferInset) {
    if (lastLevel === level) return false;
    lastLevel = level;
    mapEl.setAttribute('data-level', String(level));
    mapEl.setAttribute('data-detail', Core.levelNote(level));
    updateMarkers(level);
    // 「一般図へ」の表示/非表示が変わると右下の予約寸法も変わる。
    // ジェスチャー中は実寸の測定を遅らせ、最終描画で1回だけ反映する。
    if (deferInset) insetPending = true;
    else {
      insetPending = false;
      syncPositionInset();
    }
    return true;
  }

  // 通常の描画。transform・LOD・補助ラベルの再配置・現在位置をまとめて更新する。
  // skipTransform は「最後に描いた transform のまま」のときに、同じ属性を
  // 書き直さず補助ラベル・現在位置だけ更新するためのもの。
  function render(options) {
    var skipTransform = !!(options && options.skipTransform);
    if (!skipTransform) renderTransform();
    var level = Core.detailLevel(view.scale);
    applyDetailLevel(level, false);
    // ジェスチャー中に LOD が変わって遅らせた実寸を、ここで1回だけ反映する。
    if (insetPending) {
      insetPending = false;
      syncPositionInset();
    }
    updateOverlay(level);
    updatePosition(level);
  }

  // ジェスチャー中（パン・ピンチ）の1フレーム。transform と、いま出ている補助ラベルの
  // 追従だけを行う。重なり判定・補助ラベルの作り直し・現在位置の再計算は最終フレームまで
  // 遅らせる。メイン SVG の LOD（マーカー）だけは必要に応じて切り替えるが、
  // 補助ラベルは LOD が変わっても作り直さない（そのまま追従させ、終了時に1回だけ再構築）。
  function renderGesture() {
    renderTransform();
    applyDetailLevel(Core.detailLevel(view.scale), true);
    trackOverlay();
  }

  function updateMarkers(level) {
    var small = level === 0;
    var index = activeReactionIndex();
    displayReactions().forEach(function (r) {
      var g = index[r.id];
      if (!g) return;
      var dot = g.querySelector('.rp-reaction__dot');
      if (dot) dot.setAttribute('r', small ? '4' : '6');
    });
  }

  function visibleBox() {
    return {
      left: 0,
      top: 0,
      right: viewSize.w,
      bottom: viewSize.h
    };
  }

  /* 一般図の見出しは buildClassMap が world 座標の枠内上帯へ描く。
     画面側で障害物を探したり、題名だけへ縮めたり、消したりはしない。 */

  function updateOverlay(level) {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    var box = visibleBox();
    var placed = [];
    if (level === 0 && view.scale >= 0.15) {
      var hubs = regionHubs();
      activeRegions().forEach(function (region) {
        var picked = hubs[region.id];
        if (!picked) return;
        var c = picked.compound;
        var center = nodeCenter(c);
        var screen = Core.worldToScreen(view, center.x, center.y);
        screen.y += 14;
        if (screen.x < box.left - 80 || screen.x > box.right + 80) return;
        if (screen.y < box.top - 30 || screen.y > box.bottom + 30) return;
        var width = c.label.length * 11 + 16;
        if (!tryPlace(placed, screen.x - width / 2, screen.y - 9, width, 18)) return;
        var tag = document.createElement('span');
        tag.className = 'rp-overlay__hub is-hub';
        tag.style.left = screen.x + 'px';
        tag.style.top = screen.y + 'px';
        tag.textContent = c.label;
        // ジェスチャー中に world 位置へ追従させるための基準（分野中心 + 下 14px）。
        tag.__rpAnchor = { x: center.x, y: center.y, ox: 0, oy: 14 };
        tag.__rpX = screen.x;
        tag.__rpY = screen.y;
        overlay.appendChild(tag);
      });
    }
    if (level >= 2) {
      // 補助ラベルは「ノードの実 stroke 矩形 + 4px 以上」と「主要 SVG ラベルの実 DOM 矩形」を避ける。
      // 数値誤差・丸め対策として 4px に +1.5px、主要ラベル外周にも 1.5px の安全余白を足す。
      var NODE_PAD = 4 + 0.6 * view.scale + 1.5; // stroke 半幅 + 希望4px + 数値余裕
      var LABEL_PAD = 1.5 * view.scale + 1; // paint-order の stroke 半幅 + 余裕
      var overlayBox = overlay.getBoundingClientRect();
      var toLocal = function (r) {
        return { x: r.left - overlayBox.left, y: r.top - overlayBox.top, w: r.width, h: r.height };
      };
      var overlaps = function (a, b) {
        return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      };
      var obstacles = [];
      // 主要 SVG ラベル（種別・条件）の実フォント矩形。text の getBBox ではなく画面実測を使う。
      // 表示中のモードの反応だけを測る（非表示レイヤーは実寸 0 で自然に除外される）。
      var labelIndex = activeReactionIndex();
      displayReactions().forEach(function (r) {
        if (!r.label) return;
        var g = labelIndex[r.id];
        if (!g) return;
        var texts = g.querySelectorAll('.rp-reaction__label');
        for (var ti = 0; ti < texts.length; ti++) {
          var lr = texts[ti].getBoundingClientRect();
          if (!lr.width || !lr.height) continue;
          var rect = toLocal(lr);
          obstacles.push({
            x: rect.x - LABEL_PAD,
            y: rect.y - LABEL_PAD,
            w: rect.w + LABEL_PAD * 2,
            h: rect.h + LABEL_PAD * 2
          });
        }
      });
      // ノードは stroke 幅・非 scale・丸めを含む実 DOM 矩形を測り、外側に 5.5px 取る。
      // 位置は現在モードの投影座標（学術では positions）で判定する。
      activeCompounds().forEach(function (c) {
        var p = Core.worldToScreen(view, c.x, c.y);
        if (p.x + nodeW(c) * view.scale < box.left - 60 || p.x > box.right + 60) return;
        if (p.y + nodeH(c) * view.scale < box.top - 60 || p.y > box.bottom + 60) return;
        var g = nodeIndex[c.id];
        if (!g) return;
        var elBox = g.querySelector('.rp-node__box');
        if (!elBox) return;
        var nr = elBox.getBoundingClientRect();
        if (!nr.width || !nr.height) return;
        var nrect = toLocal(nr);
        obstacles.push({
          x: nrect.x - NODE_PAD,
          y: nrect.y - NODE_PAD,
          w: nrect.w + NODE_PAD * 2,
          h: nrect.h + NODE_PAD * 2
        });
      });
      displayReactions().forEach(function (r) {
        if (r.tier !== 'secondary' || r.label) return;
        var screen = Core.worldToScreen(view, r.x, r.y);
        if (screen.x < box.left - 80 || screen.x > box.right + 80) return;
        if (screen.y < box.top - 40 || screen.y > box.bottom + 40) return;
        var approxW = r.typeLabel.length * 11 + 12;
        var offsets = [
          [0, -30], [0, 30], [-40, 0], [40, 0],
          [-32, -22], [32, -22], [-32, 22], [32, 22],
          [0, -48], [0, 48], [-60, 0], [60, 0]
        ];
        for (var oi = 0; oi < offsets.length; oi++) {
          var cx = screen.x + offsets[oi][0];
          var cy = screen.y + offsets[oi][1];
          var approx = { x: cx - approxW / 2, y: cy, w: approxW, h: 16 };
          var blocked = false;
          for (var bi = 0; bi < obstacles.length; bi++) {
            if (overlaps(approx, obstacles[bi])) { blocked = true; break; }
          }
          if (!blocked) {
            for (var pi = 0; pi < placed.length; pi++) {
              if (overlaps(approx, placed[pi])) { blocked = true; break; }
            }
          }
          if (blocked) continue;
          // 候補決定後に実 DOM 寸法を測り、障害物・既配置ラベルと再検査する。
          var tag = document.createElement('span');
          tag.className = 'rp-overlay__reaction rp-overlay__reaction--secondary';
          tag.style.left = cx + 'px';
          tag.style.top = cy + 'px';
          tag.style.visibility = 'hidden';
          tag.textContent = r.typeLabel;
          overlay.appendChild(tag);
          var tr = tag.getBoundingClientRect();
          var rect = toLocal(tr);
          var hit = false;
          if (!rect.w || !rect.h) hit = true;
          for (var hi = 0; !hit && hi < obstacles.length; hi++) {
            if (overlaps(rect, obstacles[hi])) hit = true;
          }
          for (var qi = 0; !hit && qi < placed.length; qi++) {
            if (overlaps(rect, placed[qi])) hit = true;
          }
          if (hit) {
            overlay.removeChild(tag);
            continue;
          }
          tag.style.visibility = '';
          // 反応マーカーからの画面オフセットを覚え、ジェスチャー中は同じ world 点へ
          // 追従させる（拡大しても同じ反応の近くに留まる）。
          tag.__rpAnchor = { x: r.x, y: r.y, ox: cx - screen.x, oy: cy - screen.y };
          tag.__rpX = cx;
          tag.__rpY = cy;
          placed.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
          break;
        }
      });
    }
  }

  // ジェスチャー中、いま出ている補助ラベルだけを world 位置へ追従させる。
  // 実寸の測り直し・重なり判定・要素の作り直しはしない（1フレーム内の位置更新だけ）。
  function trackOverlay() {
    var node = overlay.firstChild;
    while (node) {
      var a = node.__rpAnchor;
      if (a && node.style) {
        var s = Core.worldToScreen(view, a.x, a.y);
        var nx = s.x + a.ox;
        var ny = s.y + a.oy;
        if (node.__rpX !== nx || node.__rpY !== ny) {
          node.style.left = nx + 'px';
          node.style.top = ny + 'px';
          node.__rpX = nx;
          node.__rpY = ny;
        }
      }
      node = node.nextSibling;
    }
  }

  // 同じ倍率・同じ位置なら常に同じラベルが残るよう、分野順の貪欲法で重なりを避ける。
  function tryPlace(placed, x, y, w, h) {
    for (var i = 0; i < placed.length; i++) {
      var r = placed[i];
      if (x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h) return false;
    }
    placed.push({ x: x, y: y, w: w, h: h });
    return true;
  }

  function updatePosition(level) {
    var selectedInfo = null;
    if (selected) {
      if (selected.kind === 'compound') {
        selectedInfo = compoundById[selected.id];
      } else if (selected.kind === 'reaction') {
        var r = findReaction(selected.id);
        if (r) selectedInfo = { name: r.typeLabel + 'の反応' };
      } else if (selected.kind === 'class') {
        selectedInfo = { name: selected.name };
      } else if (selected.kind === 'class-edge') {
        selectedInfo = { name: selected.name };
      }
    }
    var text;
    if (selected && (selected.kind === 'class' || selected.kind === 'class-edge')) {
      text = '官能基変換の一般図 / ' + selected.name + '（' + Math.round(view.scale * 100) + '%）';
    } else {
      text = Core.positionText(view, activeRegions(), activeCompounds(), selectedInfo, modeCanvas(), viewSize.w, viewSize.h, activeRegion);
      var classText = Core.classMapPosition(view, classMapData, viewSize.w, viewSize.h);
      if (classText) text = classText;
    }
    var note = Core.levelNote(level);
    positionFullValue = text;
    positionLevelValue = note;
    // 毎フレームの innerHTML 差し替えをやめ、変わったときだけ textContent を更新する。
    if (positionText.textContent !== text) positionText.textContent = text;
    if (positionLevel.textContent !== note) positionLevel.textContent = note;
    if (!positionPopover.hidden) fillPositionPopover();
    // 連続するパン・ズームでは読み上げず、操作が落ち着いてから1回だけ通知する。
    if (positionPopover.hidden) schedulePositionLive(text, note);
  }

  function fillPositionPopover() {
    var full = '現在位置: ' + positionFullValue;
    var note = '表示: ' + positionLevelValue;
    if (positionFull.textContent !== full) positionFull.textContent = full;
    if (positionFullNote.textContent !== note) positionFullNote.textContent = note;
  }

  function schedulePositionLive(text, note) {
    if (positionLiveTimer) window.clearTimeout(positionLiveTimer);
    positionLiveTimer = window.setTimeout(function () {
      positionLiveTimer = 0;
      var message = '現在位置: ' + text + '。表示: ' + note;
      if (positionLiveText === message) return;
      positionLiveText = message;
      positionLive.textContent = message;
    }, POSITION_LIVE_DELAY);
  }

  // 全文popoverの高さは地図の高さに合わせる。map-panel は overflow: hidden なので、
  // 地図の外へはみ出す高さにしない（内部スクロールで全文を読む）。
  function syncPositionPopoverBox() {
    var mapH = mapEl.clientHeight || 0;
    var ownH = positionEl.offsetHeight || 0;
    var avail = mapH - ownH - 12 - 6 - 10;
    positionPopover.style.maxHeight = Math.max(96, Math.round(avail)) + 'px';
  }

  // 現在位置の高さを地図の右下余白として反映する。文字サイズを変えても
  // 「一般図へ」の導線が現在位置と重ならない。
  function syncPositionInset() {
    positionBox.w = Math.round(positionEl.offsetWidth || 0);
    positionBox.h = Math.round(positionEl.offsetHeight || 0);
    mapEl.style.setProperty('--rp-position-h', positionBox.h + 'px');
    // カード（body 直下の fixed）も現在位置の上に置けるよう、body 側にも同じ実寸を渡す。
    if (document.body && document.body.style) {
      document.body.style.setProperty('--rp-position-h', positionBox.h + 'px');
    }
    var jump = document.getElementById('rp-classmap-jump');
    if (jump && jump.offsetParent !== null) {
      jumpBox.w = Math.round(jump.offsetWidth || 0);
      jumpBox.h = Math.round(jump.offsetHeight || 0);
    } else {
      jumpBox.w = 0;
      jumpBox.h = 0;
    }
  }

  function openPositionPopover() {
    if (positionLiveTimer) {
      window.clearTimeout(positionLiveTimer);
      positionLiveTimer = 0;
    }
    fillPositionPopover();
    positionPopover.hidden = false;
    syncPositionPopoverBox();
    positionTrigger.setAttribute('aria-expanded', 'true');
    positionPopover.focus();
  }

  function closePositionPopover(restoreFocus) {
    if (positionPopover.hidden) return;
    var restore = restoreFocus && positionEl.contains(document.activeElement);
    positionPopover.hidden = true;
    positionTrigger.setAttribute('aria-expanded', 'false');
    if (restore) positionTrigger.focus();
  }

  // 地図の touch-action: none は祖先の制約なので、popover 側の touch-action だけでは
  // 指スクロールを有効にできない。popover 内のドラッグはここでスクロールへ変換する。
  var popoverDrag = null;

  function onPopoverPointerDown(e) {
    // マウスのドラッグは全文の選択に使う。指・ペンだけスクロールへ変換する。
    if (e.pointerType === 'mouse') return;
    if (positionPopover.scrollHeight <= positionPopover.clientHeight + 1) return;
    popoverDrag = { id: e.pointerId, y: e.clientY, top: positionPopover.scrollTop };
    if (positionPopover.setPointerCapture) {
      try { positionPopover.setPointerCapture(e.pointerId); } catch (err) { errMsg(err && err.message); }
    }
  }

  function onPopoverPointerMove(e) {
    if (!popoverDrag || popoverDrag.id !== e.pointerId) return;
    positionPopover.scrollTop = popoverDrag.top - (e.clientY - popoverDrag.y);
  }

  function onPopoverPointerUp(e) {
    if (!popoverDrag || popoverDrag.id !== e.pointerId) return;
    if (positionPopover.releasePointerCapture) {
      try { positionPopover.releasePointerCapture(e.pointerId); } catch (err) { errMsg(err && err.message); }
    }
    popoverDrag = null;
  }

  /* ---------------- interactions ---------------- */

  function zoomCenter(factor) {
    if (activeRegion) clearRegionSelection();
    var next = Core.zoomAt(view, factor, viewSize.w / 2, (viewSize.h + fitTopInset()) / 2);
    setView(next, true);
  }

  function resetView() {
    var fit = fitModeCanvasView();
    clearRegionSelection();
    clearSelection();
    animateTo(fit);
  }

  function focusClassMap(focusFirst) {
    if (!classMapData) return;
    clearRegionSelection();
    clearSelection();
    // 狭い画面でも外枠・注記が切れないよう、fit 倍率に下限を設けない。文字の読解は後から拡大する。
    // 見出しは枠内の world 座標に固定したので上帯は予約しない。上は浮遊する操作群の実寸、
    // 下は右下の現在位置と「一般図へ」の帯だけを予約し、fit した全図がフローティングに覆われないようにする。
    var posH = positionBox.h || 48;
    var jumpH = jumpBox.h || 0;
    var top = fitTopInset();
    function fitWithBottom(bottom) {
      var innerH = Math.max(140, viewSize.h - bottom - top);
      var fit = Core.fitRect(classMapData.area, viewSize.w, innerH, 14, 0, 1.2);
      return Core.clampPan(insetFitView(fit, top), viewSize.w, viewSize.h, modeCanvas());
    }
    var target = fitWithBottom(12 + posH + (jumpH ? jumpH + 10 : 0));
    // fit 後に詳細度が上がって導線が消える場合は、その分の予約を戻して図を大きく見せる。
    if (jumpH && Core.detailLevel(target.scale) > 0) target = fitWithBottom(12 + posH);
    animateTo(target);
    if (focusFirst && classMapData.nodes.length && classNodeIndex[classMapData.nodes[0].id]) {
      var first = classNodeIndex[classMapData.nodes[0].id];
      // 「一般図へ」直後のプログラムfocusは、直後の全体fitを維持する。
      // 発火済み・同一要素の場合は focusin が来ないため、抑制フラグを立てない。
      if (document.activeElement !== first) {
        programmaticFocusTarget = first;
        first.focus();
      }
    }
  }
  function animateTo(target) {
    if (prefersReduce()) {
      setView(target, true);
      return;
    }
    var start = { scale: view.scale, x: view.x, y: view.y };
    var token = ++animToken;
    var t0 = window.performance ? performance.now() : Date.now();
    var duration = 260;
    function step(now) {
      if (token !== animToken) return;
      var t = Math.min(1, ((now || Date.now()) - t0) / duration);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setView({
        scale: start.scale + (target.scale - start.scale) * e,
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e
      }, false);
      if (t < 1) requestAnimationFrame(step);
      else setView(target, true);
    }
    requestAnimationFrame(step);
  }

  var pointers = {};
  var panOrigin = null;
  var pinchOrigin = null;
  var downEntity = null;

  /* ホイールの拡大縮小。目標を累積し、短い比例補間で追従する（毎イベントの再始動をしない）。
     拡大率の上限・下限に当たったら、その位置で止めて行き過ぎを残さない。 */
  function cancelWheelZoom() {
    if (!wheelZoom && !wheelRaf) return;
    wheelZoom = null;
    if (wheelRaf) {
      window.cancelAnimationFrame(wheelRaf);
      wheelRaf = 0;
    }
  }

  function applyWheelView(next) {
    wheelApplying = true;
    try { setView(next, true); } finally { wheelApplying = false; }
  }

  function wheelStep() {
    wheelRaf = 0;
    var target = wheelZoom;
    if (!target) return;
    var ds = target.scale - view.scale;
    var dx = target.x - view.x;
    var dy = target.y - view.y;
    if (Math.abs(ds) < WHEEL_SETTLE_SCALE && Math.abs(dx) < WHEEL_SETTLE_PX && Math.abs(dy) < WHEEL_SETTLE_PX) {
      wheelZoom = null;
      applyWheelView(target);
      return;
    }
    applyWheelView({
      scale: view.scale + ds * WHEEL_FOLLOW,
      x: view.x + dx * WHEEL_FOLLOW,
      y: view.y + dy * WHEEL_FOLLOW
    });
    wheelRaf = window.requestAnimationFrame(wheelStep);
  }

  /* パン・ピンチのフレーム集約。
     pointermove は最新の状態だけを gesturePending へ置き、rAF 1本で1フレーム1回だけ反映する。
     連続する move が同じフレームに来ても、表示は最後の1回だけ更新される。 */
  function cancelGestureFrame() {
    if (gestureRaf) {
      window.cancelAnimationFrame(gestureRaf);
      gestureRaf = 0;
    }
    gesturePending = null;
  }

  function applyGestureView(next, clamp) {
    gesturePending = { view: next, clamp: clamp !== false };
    gestureDirty = true;
    if (!gestureRaf) gestureRaf = window.requestAnimationFrame(flushGestureFrame);
  }

  function applyPendingGesture() {
    var pending = gesturePending;
    gesturePending = null;
    if (!pending) return false;
    gestureApplying = true;
    try {
      applyView(pending.view, pending.clamp);
      renderGesture();
    } finally {
      gestureApplying = false;
    }
    return true;
  }

  // 予約済みの位置だけを確定し、描画はしない。ジェスチャーの最終終了で
  // 「位置の確定 → 通常描画1回」にまとめるために使う（transform の二重書きをしない）。
  function commitPendingGesture() {
    var pending = gesturePending;
    gesturePending = null;
    if (!pending) return false;
    applyView(pending.view, pending.clamp);
    return true;
  }

  function flushGestureFrame() {
    gestureRaf = 0;
    applyPendingGesture();
  }

  // ジェスチャーの終了・ポインタ構成の切り替わりでは、未実行の rAF を待たずに
  // 最後の移動を確定する（終点が1フレーム前へ戻らない）。
  function flushGestureNow() {
    if (gestureRaf) {
      window.cancelAnimationFrame(gestureRaf);
      gestureRaf = 0;
    }
    return applyPendingGesture();
  }

  // 押されている指の現在位置へ基準を取り直す。ジェスチャー中にキー・ボタン・
  // ホイールなど新しい表示が入っても、次の move がその表示を打ち消さない。
  function rebaseGestureOrigins() {
    var pts = pointerList();
    if (!pts.length) {
      panOrigin = null;
      pinchOrigin = null;
      return;
    }
    if (pts.length >= 2) {
      pinchOrigin = {
        distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        view: { scale: view.scale, x: view.x, y: view.y },
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      };
      panOrigin = null;
      return;
    }
    pinchOrigin = null;
    panOrigin = { x: pts[0].x, y: pts[0].y, view: { scale: view.scale, x: view.x, y: view.y } };
  }

  function pointerList() {
    return Object.keys(pointers).map(function (k) { return pointers[k]; });
  }

  function mapPoint(e) {
    var rect = mapEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // 反応・一般図の変換・物質のフォーカス可能な実体。透明ヒットは使わない。
  // 反応は現在モードの索引だけを返す（非表示の通常マーカーを先に返さない）。
  function entityElement(kind, id) {
    if (kind === 'reaction') return activeReactionIndex()[id] || null;
    if (kind === 'class-edge') return classEdgeIndex[id] || null;
    if (kind === 'class') return classNodeIndex[id] || null;
    return nodeIndex[id] || null;
  }

  // 画面18px（半径9px）の当たり判定が重なったとき、DOM順ではなく
  // 「タップ位置に最も近い可視線の形状」で反応を選ぶ。距離は画面ピクセル基準。
  function nearestHitAt(kind, point) {
    var scale = view.scale || 1;
    var radius = HIT_RADIUS / scale;
    var world = Core.screenToWorld(view, point.x, point.y);
    var list = [];
    var __cands = activeHitCandidates();
    for (var i = 0; i < __cands.length; i++) {
      var c = __cands[i];
      if (c.kind !== kind) continue;
      if (world.x < c.box.minX - radius || world.x > c.box.maxX + radius) continue;
      if (world.y < c.box.minY - radius || world.y > c.box.maxY + radius) continue;
      list.push(c);
    }
    return Core.nearestHit(list, world, radius);
  }

  // 透明ヒット（と、その下にある可視線）は「線」として幾何判定へ回す。
  var HIT_LINE_SELECTOR = '.rp-edge-hit,.rp-edge,.rp-classmap__edge-hit,.rp-classmap__edge';
  var PHYSICAL_NODE_SELECTOR = '.rp-node,.rp-classmap__node';
  var PHYSICAL_LABEL_SELECTOR = '.rp-reaction__label,.rp-node__label,.rp-classmap__label';
  var PHYSICAL_CONTROL_SELECTOR = '.rp-legend,.rp-classmap-jump,.rp-position,button,a[href],input,select,textarea';

  function hitLineTarget(target) {
    return target && target.closest ? target.closest(HIT_LINE_SELECTOR) : null;
  }

  // client 座標を要素のユーザー座標へ（SVG の isPointInFill 用）。
  function localPoint(element, clientX, clientY) {
    var ctm = element.getScreenCTM ? element.getScreenCTM() : null;
    if (!ctm || !ctm.inverse) return null;
    var inv = ctm.inverse();
    return {
      x: inv.a * clientX + inv.c * clientY + inv.e,
      y: inv.b * clientX + inv.d * clientY + inv.f
    };
  }

  // 実 point がその形状の内側か。SVG は塗り・輪郭を geometry で判定し、
  // drop-shadow / halo の見た目には引っ張られない。HTML は実矩形で判定する。
  function geometryContains(element, clientX, clientY) {
    if (!element) return false;
    if (element.isPointInFill && element.getScreenCTM) {
      var local = localPoint(element, clientX, clientY);
      if (!local) return false;
      try {
        if (element.isPointInFill(local)) return true;
        if (element.isPointInStroke && element.isPointInStroke(local)) return true;
      } catch (err) {
        errMsg(err && err.message);
      }
      return false;
    }
    var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function lineKindAndId(line) {
    var kind = line.getAttribute('data-kind');
    var id = line.getAttribute('data-id');
    if (kind) return { kind: kind, id: id };
    if (line.getAttribute('data-reaction')) return { kind: 'reaction', id: line.getAttribute('data-reaction') };
    if (line.getAttribute('data-class-edge')) return { kind: 'class-edge', id: line.getAttribute('data-class-edge') };
    var owner = line.closest ? line.closest('[data-kind]') : null;
    return owner ? { kind: owner.getAttribute('data-kind'), id: owner.getAttribute('data-id') } : null;
  }

  // pointer capture やタッチ補正で event.target が変わっても、実 client 座標だけから
  // 「物理的にその点にある描画」を拾い直す。document.elementsFromPoint は
  // capture / touch adjust の補正を受けない幾何クエリ。
  function physicalCandidates(clientX, clientY) {
    var list = [];
    if (!document.elementsFromPoint) return list;
    var stack = document.elementsFromPoint(clientX, clientY);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!el || !el.closest) continue;
      var control = el.closest(PHYSICAL_CONTROL_SELECTOR);
      if (control && geometryContains(control, clientX, clientY)) {
        list.push({ role: 'control', inside: true, el: control });
        continue;
      }
      var node = el.closest(PHYSICAL_NODE_SELECTOR);
      if (node) {
        var box = node.querySelector('.rp-node__box,.rp-classmap__node-box');
        var insideNode = geometryContains(box, clientX, clientY) || geometryContains(el, clientX, clientY);
        list.push({
          role: 'node',
          kind: node.getAttribute('data-kind'),
          id: node.getAttribute('data-id'),
          inside: insideNode,
          el: node
        });
        continue;
      }
      var label = el.closest(PHYSICAL_LABEL_SELECTOR);
      if (label) {
        var owner = label.closest('[data-kind]');
        list.push({
          role: 'label',
          kind: owner ? owner.getAttribute('data-kind') : null,
          id: owner ? owner.getAttribute('data-id') : null,
          inside: geometryContains(label, clientX, clientY),
          el: owner || label
        });
        continue;
      }
      var line = el.closest(HIT_LINE_SELECTOR);
      if (line) {
        var info = lineKindAndId(line);
        if (info && info.kind && info.id) {
          list.push({ role: 'line', kind: info.kind, id: info.id, inside: true, el: line });
        }
      }
    }
    return list;
  }

  function resolvePhysicalAt(clientX, clientY) {
    return Core.resolvePhysicalTarget(physicalCandidates(clientX, clientY));
  }

  // 透明ヒットがスタックに無いときの保険。全候補のうち距離0（矢印の塗り内部・線の上）だけ拾う。
  function nearestAnyAt(point) {
    var scale = view.scale || 1;
    var radius = HIT_RADIUS / scale;
    var world = Core.screenToWorld(view, point.x, point.y);
    var list = [];
    var __cands = activeHitCandidates();
    for (var i = 0; i < __cands.length; i++) {
      var c = __cands[i];
      if (world.x < c.box.minX - radius || world.x > c.box.maxX + radius) continue;
      if (world.y < c.box.minY - radius || world.y > c.box.maxY + radius) continue;
      list.push(c);
    }
    return Core.nearestHit(list, world, radius);
  }

  // タップ対象を決める。実座標の物理判定だけで決め、event.target の補正結果は使わない。
  // 物質・ラベルはその点が実形状/実 bbox の内側にあるときだけ優先し、線は最近傍で選ぶ。
  function pickDownEntity(e, point) {
    var decided = resolvePhysicalAt(e.clientX, e.clientY);
    if (decided.type === 'control') return null;
    if (decided.type === 'entity') return entityElement(decided.kind, decided.id) || null;
    var kind = decided.type === 'line' ? decided.kind : null;
    var id = decided.type === 'line' ? decided.id : null;
    var nearest;
    if (kind) {
      nearest = nearestHitAt(kind, point);
    } else {
      nearest = nearestAnyAt(point);
      // 背景のタップで近くの線を拾わない。塗り内部・線の上（距離0）だけ反応させる。
      if (nearest && nearest.distance > 1e-6) nearest = null;
    }
    var picked = Core.resolveHitTarget(kind ? { kind: kind, id: id } : null, true, nearest);
    if (!picked) return null;
    return entityElement(picked.kind, picked.id) || null;
  }

  function onPointerDown(e) {
    // 凡例・一般図への導線・現在位置などの通常のHTML操作要素は地図のパンに使わない。
    if (e.target.closest && e.target.closest(PHYSICAL_CONTROL_SELECTOR)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 直後に来る「ポインタ由来の focusin」を1回だけ再センタリングから外す。
    // （一般図の変換・反応の線・ラベルは tabindex を持つため、触るだけで focus が付く）
    pointerFocusGuard = true;
    cancelWheelZoom();
    // 直前のジェスチャーフレームが未実行なら、ここで確定してから基準点を取る。
    // （2本目の指が加わるときに、古い view をピンチ基準にしない）
    flushGestureNow();
    var p = mapPoint(e);
    if (!pointerList().length) gestureDirty = false;
    pointers[e.pointerId] = p;
    suppressClick = false;
    downEntity = pickDownEntity(e, p);
    panOrigin = { x: p.x, y: p.y, view: { scale: view.scale, x: view.x, y: view.y } };
    if (mapEl.setPointerCapture) {
      try { mapEl.setPointerCapture(e.pointerId); } catch (err) { errMsg(err && err.message); }
    }
    if (pointerList().length === 2) {
      var pts = pointerList();
      pinchOrigin = {
        distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        view: { scale: view.scale, x: view.x, y: view.y },
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      };
      suppressClick = true;
    }
    mapEl.classList.add('is-panning');
  }

  function onPointerMove(e) {
    if (!pointers[e.pointerId]) return;
    var p = mapPoint(e);
    pointers[e.pointerId] = p;
    if (pointerList().length >= 2 && pinchOrigin) {
      if (activeRegion) clearRegionSelection();
      var pts = pointerList();
      var distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      var factor = distance / pinchOrigin.distance;
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      var next = Core.zoomAt(pinchOrigin.view, factor, pinchOrigin.mid.x, pinchOrigin.mid.y);
      next.x += mid.x - pinchOrigin.mid.x;
      next.y += mid.y - pinchOrigin.mid.y;
      // 最新の状態だけを予約し、表示はフレームに1回だけ更新する。
      applyGestureView(next, true);
      suppressClick = true;
      return;
    }
    if (!panOrigin) return;
    var dx = p.x - panOrigin.x;
    var dy = p.y - panOrigin.y;
    // 4px 未満はタップのぶれとみなし、表示を動かさない（指を置いただけで数pxずれない）。
    // しきい値を超えてから従来どおりのパンを行う。
    if (!suppressClick) {
      if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return;
      suppressClick = true;
      if (activeRegion) clearRegionSelection();
    }
    applyGestureView({ scale: panOrigin.view.scale, x: panOrigin.view.x + dx, y: panOrigin.view.y + dy }, true);
  }

  // ポインタ終了の共通処理。up では未移動なら詳細を開き、cancel / capture 喪失では開かない。
  function endPointer(e, allowOpen) {
    if (!pointers[e.pointerId]) return;
    var last = pointerList().length === 1;
    var committed = false;
    if (last) {
      // 最終終了では、予約位置の確定だけを行い、ここでは描画しない。
      // 直後の通常描画1回にまとめる（transform の二重書きをしない）。
      committed = commitPendingGesture();
    } else {
      // まだ指が残る切り替わりでは、未実行の rAF を待たず最後の移動を確定する。
      // 軽量フレーム（transform と補助ラベルの追従）だけで、重なり判定はしない。
      flushGestureNow();
    }
    delete pointers[e.pointerId];
    if (mapEl.releasePointerCapture) {
      try { mapEl.releasePointerCapture(e.pointerId); } catch (err) { errMsg(err && err.message); }
    }
    if (!pointerList().length) {
      // キャンセル・capture 喪失では復帰予約を残さない（次の操作で古い起点を掴まない）。
      if (!allowOpen) restoreAfterPointer = null;
      // マウスは focusin が pointerup より前に済むため、取り残したフラグを次の操作へ持ち越さない。
      // タッチ・ペンは互換 mousedown の focus が pointerup の後に来るので、消費まで残す。
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') pointerFocusGuard = false;
      // ポインタを押した対象が物質・反応で、動いていなければ詳細を開く。
      // （ポインタキャプチャで click の宛先が変わることがあるため、pointerup で判定する）
      if (allowOpen && !suppressClick && downEntity) openFromElement(downEntity);
      panOrigin = null;
      pinchOrigin = null;
      downEntity = null;
      mapEl.classList.remove('is-panning');
      cancelGestureFrame();
      // ジェスチャーで表示が動いたときだけ、重なり判定・現在位置を1回だけ作り直す。
      // 予約位置をここで確定していなければ、transform は最後のフレームのままなので
      // 書き直さず、補助ラベルと現在位置だけを更新する。
      if (gestureDirty) {
        gestureDirty = false;
        render({ skipTransform: !committed });
      }
    } else {
      // ピンチ→1本指のパンへ。基準点は確定済みの view から取る（飛ばない）。
      // 3本以上から2本へ減ったときも、残った指で基準を取り直す。
      rebaseGestureOrigins();
    }
  }

  function onPointerUp(e) { endPointer(e, true); }

  function onPointerCancel(e) { endPointer(e, false); }

  function onLostPointerCapture(e) { endPointer(e, false); }

  function onWheel(e) {
    // 地図の上だけで、修飾キー無しのホイールを拡大縮小に使う。
    // 現在位置・凡例・ボタンなどの通常のHTML操作要素の上ではブラウザ既定（スクロール等）を優先し、
    // preventDefault も document へのリスナー追加もしない。
    if (e.target && e.target.closest && e.target.closest(PHYSICAL_CONTROL_SELECTOR)) return;
    var factor = Core.wheelZoomFactor(e.deltaY, e.deltaMode, mapEl.clientHeight);
    if (factor === 1) return; // delta 0・横方向だけの操作では拡大しない
    e.preventDefault();
    // ホイールは実行中のfit/ボタン拡大より優先する（途中で奪われない）。
    animToken += 1;
    if (activeRegion) clearRegionSelection();
    var p = mapPoint(e);
    var base = wheelZoom || { scale: view.scale, x: view.x, y: view.y };
    var next = Core.zoomAt(base, factor, p.x, p.y);
    if (next.scale === base.scale) {
      // 上限・下限に達している。追従中のrAFは止めず、目標も動かさない（古い目標へ戻さない）。
      if (!wheelRaf) wheelZoom = null;
      return;
    }
    // カーソル位置を軸にしたまま累積する（連続入力でも飛ばない）。
    wheelZoom = Core.clampPan(next, viewSize.w, viewSize.h, modeCanvas());
    if (!wheelRaf) wheelRaf = window.requestAnimationFrame(wheelStep);
  }

  function mapEntityFrom(target) {
    return target && target.closest ? target.closest('[data-kind]') : null;
  }

  // 通常のHTML操作要素は、地図のショートカットよりブラウザ既定の動作を優先する。
  // SVGの data-kind 要素（role=button を持つ）はここでは対象外にし、地図側で処理する。
  function isNativeKeyTarget(target) {
    if (!target || !target.closest) return false;
    if (target.isContentEditable) return true;
    return !!target.closest('a[href],button,input,select,textarea,summary,' +
      '[contenteditable=""],[contenteditable="true"],[role="button"]:not([data-kind])');
  }

  // Enter/Space は data-kind entity のときだけ open。通常要素は native activation に任せる。
  function keyIntent(key, entity) {
    if (key === 'Enter' || key === ' ') return entity ? 'open' : 'native';
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', '0', 'Home'].indexOf(key) !== -1) {
      return 'map';
    }
    return 'native';
  }

  function onKeydown(e) {
    if (!card.hidden) return;
    if (e.target === searchInput) return;
    // 現在位置（全文popover）の中では、地図のショートカットへ奪わない。
    if (positionEl && positionEl.contains(e.target)) return;
    var entity = mapEntityFrom(e.target);
    if (keyIntent(e.key, entity) === 'native') return;
    // button/input/link などの上では、矢印・ズーム・0 も地図へ奪わない。
    if (!entity && isNativeKeyTarget(e.target)) return;
    if (entity && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openFromElement(entity);
      return;
    }
    var step = 70;
    if (activeRegion && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', '0', 'Home'].indexOf(e.key) !== -1) {
      clearRegionSelection();
    }
    switch (e.key) {
      case 'ArrowLeft': setView({ scale: view.scale, x: view.x + step, y: view.y }, true); break;
      case 'ArrowRight': setView({ scale: view.scale, x: view.x - step, y: view.y }, true); break;
      case 'ArrowUp': setView({ scale: view.scale, x: view.x, y: view.y + step }, true); break;
      case 'ArrowDown': setView({ scale: view.scale, x: view.x, y: view.y - step }, true); break;
      case '+': case '=': zoomCenter(1.2); break;
      case '-': case '_': zoomCenter(1 / 1.2); break;
      case '0': case 'Home': resetView(); break;
      default: return;
    }
    e.preventDefault();
  }

  // キーボードでノードへ移動したとき、画面の外なら中央へ寄せる。
  function onFocusIn(e) {
    var target = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (!target) return;
    // ポインタ操作に伴う focusin は1回分だけ扱う（キーボード操作では立たない）。
    var fromPointer = pointerFocusGuard;
    pointerFocusGuard = false;
    // focusClassMap が全体fit直後に移したプログラムfocusだけ、画面外判定の再センタリングをしない。
    // 通常の Tab 移動（別のnode・別の機会）は従来どおり追随する。
    if (programmaticFocusTarget) {
      var pending = programmaticFocusTarget;
      programmaticFocusTarget = null;
      if (pending === target || (pending.contains && pending.contains(target))) return;
    }
    // ポインタで触っただけの実体（一般図の変換・物質・反応の線やラベル）は、
    // 指した場所をそのまま見せる。触っただけで中央へ寄せない。
    if (fromPointer) return;
    if (activeRegion) clearRegionSelection();
    var kind = target.getAttribute('data-kind');
    var id = target.getAttribute('data-id');
    if (kind === 'class') {
      var n = classNodeById[id];
      if (!n) return;
      var ns = Core.worldToScreen(view, n.x + n.w / 2, n.y + n.h / 2);
      var nmargin = 60;
      if (ns.x >= nmargin && ns.x <= viewSize.w - nmargin && ns.y >= nmargin && ns.y <= viewSize.h - nmargin) return;
      animateTo(Core.centerOn({ x: n.x, y: n.y }, { w: n.w, h: n.h }, view.scale, viewSize.w, viewSize.h));
      return;
    }
    if (kind === 'class-edge') {
      var ce = classEdgeById[id];
      if (!ce) return;
      var lp = ce.labelPos;
      var es = Core.worldToScreen(view, lp.x, lp.y);
      var emargin = 60;
      if (es.x >= emargin && es.x <= viewSize.w - emargin && es.y >= emargin && es.y <= viewSize.h - emargin) return;
      animateTo(Core.centerOn({ x: lp.x - 40, y: lp.y - 20 }, { w: 80, h: 40 }, view.scale, viewSize.w, viewSize.h));
      return;
    }
    var c = kind === 'compound' ? compoundAt(id) : findReaction(id);
    if (!c) return;
    var cx = kind === 'compound' ? c.x + nodeW(c) / 2 : c.x;
    var cy = kind === 'compound' ? c.y + nodeH(c) / 2 : c.y;
    var s = Core.worldToScreen(view, cx, cy);
    var margin = 60;
    if (s.x >= margin && s.x <= viewSize.w - margin && s.y >= margin && s.y <= viewSize.h - margin) return;
    if (kind === 'compound') {
      animateTo(Core.centerOn({ x: c.x, y: c.y }, { w: nodeW(c), h: nodeH(c) }, view.scale, viewSize.w, viewSize.h));
    } else {
      animateTo(Core.centerOn({ x: c.x - 20, y: c.y - 20 }, { w: 40, h: 40 }, view.scale, viewSize.w, viewSize.h));
    }
  }

  // 表示位置を変えずに focus する。カードを閉じたときの復帰・カード内の移動など、
  // 勝手に表示を動かしたくない場面で使う。onFocusIn の再センタリングは
  // programmaticFocusTarget で1回だけ抑え、ブラウザによるスクロールは preventScroll で止める。
  function focusWithoutRecentering(target) {
    if (!target || typeof target.focus !== 'function') return false;
    if (typeof document.contains === 'function' && !document.contains(target)) return false;
    if (document.activeElement === target) return false;
    // 地図上の実体（[data-kind]）だけが onFocusIn の再センタリング対象。カード内などは
    // フラグを立てない（立てたままにすると次の Tab の判定へ持ち越す）。
    var inMap = !!(target.closest && target.closest('[data-kind]'));
    if (inMap) programmaticFocusTarget = target;
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      errMsg(err && err.message);
      try { target.focus(); } catch (err2) { errMsg(err2 && err2.message); }
    }
    // focusin が来ないまま終わった（フォーカスできなかった）ときは、次の Tab へ持ち越さない。
    if (inMap && programmaticFocusTarget === target) programmaticFocusTarget = null;
    return true;
  }

  function openFromElement(target) {
    var kind = target.getAttribute('data-kind');
    var id = target.getAttribute('data-id');
    returnFocus = target;
    selectNode(kind, id);
    openCard(kind, id);
  }

  function fitReactionEndpoints(id) {
    var r = findReaction(displayIdFor(id));
    if (!r) return;
    clearRegionSelection();
    var ids = {};
    r.substrates.concat(r.products).forEach(function (cid) { ids[cid] = true; });
    var minX = r.x - 30;
    var minY = r.y - 30;
    var maxX = r.x + 30;
    var maxY = r.y + 30;
    Object.keys(ids).forEach(function (cid) {
      var c = compoundAt(cid);
      if (!c) return;
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + nodeW(c));
      maxY = Math.max(maxY, c.y + nodeH(c));
    });
    var target = Core.fitRect(
      { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) },
      viewSize.w, Math.max(160, viewSize.h - fitTopInset()), 44, 0.08, 1.5
    );
    animateTo(Core.clampPan(insetFitView(target, fitTopInset()), viewSize.w, viewSize.h, modeCanvas()));
  }

  function selectNode(kind, id) {
    clearRegionSelection();
    if (selected && selected.el) selected.el.classList.remove('is-selected');
    selected = null;
    previewReaction = null;
    if (kind === 'class') {
      var cn = classNodeById[id];
      var cel = classNodeIndex[id];
      if (cn && cel) {
        cel.classList.add('is-selected');
        selected = { kind: 'class', id: id, name: cn.name, el: cel };
      }
      clearReactionStroke();
      updateEdgeHighlight();
      updateClassEdgeHighlight();
      render();
      return;
    }
    if (kind === 'class-edge') {
      var ce = classEdgeById[id];
      var eel = classEdgeIndex[id];
      if (ce && eel) {
        var from = classNodeById[ce.from];
        var to = classNodeById[ce.to];
        eel.classList.add('is-selected');
        selected = {
          kind: 'class-edge',
          id: id,
          name: (from ? from.name : ce.from) + ' → ' + (to ? to.name : ce.to) + '（' + ce.label + '）',
          el: eel
        };
      }
      clearReactionStroke();
      updateEdgeHighlight();
      updateClassEdgeHighlight();
      render();
      return;
    }
    var elm = kind === 'compound' ? nodeIndex[id] : activeReactionIndex()[id];
    if (elm) {
      elm.classList.add('is-selected');
      selected = { kind: kind, id: id, el: elm };
    }
    if (selected && selected.kind === 'reaction') showReactionStroke(id);
    else clearReactionStroke();
    updateEdgeHighlight();
    updateClassEdgeHighlight();
    render();
  }

  function clearSelection() {
    if (selected && selected.el) selected.el.classList.remove('is-selected');
    selected = null;
    previewReaction = null;
    clearReactionStroke();
    updateEdgeHighlight();
    updateClassEdgeHighlight();
    render();
  }

  // 選択中の物質・反応につながる辺だけを強調する（読解の補助。位置は変えない）。
  function updateEdgeHighlight() {
    var index = activeEdgeIndex();
    Object.keys(index).forEach(function (key) {
      var path = index[key];
      var active = false;
      if (selected) {
        active = selected.kind === 'compound'
          ? Core.compoundList(path.getAttribute('data-compounds'), path.getAttribute('data-compound'))
            .indexOf(selected.id) !== -1
          : selected.kind === 'reaction' && path.getAttribute('data-reaction') === displayIdFor(selected.id);
      }
      if (active) path.classList.add('is-active');
      else path.classList.remove('is-active');
    });
  }

  function updateClassEdgeHighlight() {
    Object.keys(classEdgePathIndex).forEach(function (key) {
      var path = classEdgePathIndex[key];
      var active = false;
      if (selected && selected.kind === 'class-edge') {
        active = key === selected.id;
      } else if (selected && selected.kind === 'class') {
        active = path.getAttribute('data-from') === selected.id ||
          path.getAttribute('data-to') === selected.id;
      }
      if (active) path.classList.add('is-active');
      else path.classList.remove('is-active');
    });
  }

  function ensureActiveLayer() {
    if (activeEdgeLayer) return activeEdgeLayer;
    activeEdgeLayer = el('g', { 'class': 'rp-edges-active', 'aria-hidden': 'true' });
    viewport.appendChild(activeEdgeLayer);
    return activeEdgeLayer;
  }

  // 反応の辺を、切れ目・橋のない連続ストロークとして最上層に描く。
  function showReactionStroke(id) {
    var displayId = displayIdFor(id);
    var r = findReaction(displayId);
    var layer = ensureActiveLayer();
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!r) return;
    // 通常表示と同じ connector を使う。選択・プレビューで端点や矢印の向きを変えない。
    // グループの member を選んでも、描くのは代表の 1 本だけ（元の全件計算の形状）。
    (activeConnectors()[r.id] || []).forEach(function (c) {
      layer.appendChild(el('path', {
        'class': 'rp-edge-active',
        'data-reaction': r.id,
        d: Core.routePath(c.shaft || c.points, c.gaps, c.bridges)
      }));
      if (c.arrowHead) layer.appendChild(el('path', arrowHeadAttrs(c, 'active')));
    });
  }

  function clearReactionStroke() {
    if (!activeEdgeLayer) return;
    while (activeEdgeLayer.firstChild) activeEdgeLayer.removeChild(activeEdgeLayer.firstChild);
  }

  function restoreReactionStroke() {
    if (previewReaction) showReactionStroke(previewReaction);
    else if (selected && selected.kind === 'reaction') showReactionStroke(selected.id);
    else clearReactionStroke();
  }

  /* ---------------- card ---------------- */

  function openCard(kind, id) {
    // 別の実体へ移るときは、前の式の拡大ダイアログを残さない。
    closeEquationDialog(false);
    var html;
    if (kind === 'compound') html = compoundCard(id);
    else if (kind === 'class') html = classCard(id);
    else if (kind === 'class-edge') html = classEdgeCard(id);
    else html = reactionCard(id);
    if (!html) return;
    // カードは現在位置の上に出るため、全文popoverが背後に残らないよう閉じる。
    closePositionPopover(false);
    cardEyebrow.textContent = kind === 'compound' ? '物質'
      : kind === 'class' ? '一般図'
        : kind === 'class-edge' ? '一般図の変換' : '反応';
    cardDetail.innerHTML = html;
    card.hidden = false;
    var heading = cardDetail.querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      focusWithoutRecentering(heading);
    }
  }

  function closeCard(restore) {
    if (card.hidden) return;
    closeEquationDialog(false);
    card.hidden = true;
    previewReaction = null;
    cardDetail.innerHTML = '';
    restoreReactionStroke();
    if (restore !== false && returnFocus && document.contains(returnFocus)) {
      // 画面外の印（反応の線・ラベル）へ戻しても、表示は動かさない。
      // 地図の実体は再センタリングを抑えて focus する（戻せないときだけ通常の focus）。
      if (!focusWithoutRecentering(returnFocus)) returnFocus.focus();
    }
    returnFocus = null;
  }

  function regionName(id) {
    return regionsById[id] ? regionsById[id].name : id;
  }

  function stateBadge(state) {
    var label = D.states[state] ? D.states[state].label : state;
    return '<span class="rp-status rp-status--' + esc(state) + '">' + esc(label) + '</span>';
  }

  function structureFigure(spec, ariaLabel, caption, note) {
    if (!SD || !spec) return '';
    var svg;
    try {
      svg = SD.renderStructure(spec, ariaLabel);
    } catch (err) {
      return '<figure class="rp-struct rp-struct--fallback"><figcaption class="rp-struct__caption">' +
        esc(caption) + '</figcaption><p class="rp-struct__note">構造図を表示できませんでした。</p></figure>';
    }
    var vb = /viewBox="([^"]+)"/.exec(svg);
    var width = vb ? parseFloat(String(vb[1]).trim().split(/\s+/)[2]) : 0;
    var wide = width > 460;
    var fallback = caption.indexOf('示性式') === 0;
    var styleParts = [];
    if (wide) styleParts.push('--rp-struct-width:' + Math.ceil(width) + 'px');
    if (fallback && width) styleParts.push('--rp-struct-max:' + Math.ceil(width) + 'px');
    var style = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
    return '<figure class="rp-struct' + (wide ? ' rp-struct--wide' : '') +
      (fallback ? ' rp-struct--fallback' : '') + '">' +
      '<figcaption class="rp-struct__caption">' + esc(caption) + '</figcaption>' +
      '<div class="rp-struct__canvas"' + style + '>' + svg + '</div>' +
      (note ? '<p class="rp-struct__note">' + esc(note) + '</p>' : '') +
      '</figure>';
  }

  function structureFigureBlock(c) {
    if (!SD) {
      return '<p class="rp-struct-missing">構造データを読み込めないため、構造図を表示していません。式だけを構造式として表示することはありません。</p>';
    }
    var view;
    try {
      view = SD.structureView(c);
    } catch (err) {
      return '<p class="rp-struct-missing">構造データを確認できないため、構造図を表示していません。</p>';
    }
    if (!view || !view.figures || !view.figures.length) {
      return '<p class="rp-struct-missing">' + esc((view && view.caption) || '構造データ未整備') +
        ': ' + esc((view && view.note) || '構造データが未整備です。') + '</p>';
    }
    if (view.kind === 'projection' && view.figures.length > 1) {
      var figures = view.figures.map(function (fig) {
        var label = fig.label || view.caption;
        return structureFigure(fig.structure, c.name + 'の' + label, label, fig.note || '');
      }).join('');
      return '<div class="rp-struct-group"><p class="rp-struct__heading">' + esc(view.caption) + '</p>' + figures + '</div>';
    }
    return view.figures.map(function (fig) {
      var caption = fig.label || view.caption;
      return structureFigure(fig.structure, c.name + 'の' + caption, caption, fig.note || view.note || '');
    }).join('');
  }

  function structureDetailState(c) {
    if (!SD) return 'missing';
    var view;
    try { view = SD.structureView(c); } catch (err) { return 'missing'; }
    if (!view) return 'missing';
    if (view.kind === 'fallback') return 'fallback';
    if (view.kind === 'missing') return 'missing';
    return 'full';
  }

  function compoundCard(id) {
    var c = compoundById[id];
    if (!c) return '';
    var ins = activeIncoming(id).slice().sort(byTypeThenId);
    var outs = activeOutgoing(id).slice().sort(byTypeThenId);
    var academicLinked = mode === 'academic' && ins.length + outs.length > 0 &&
      ins.concat(outs).some(function (r) { return !!r.academic; });
    var region = regionsById[c.region];
    var detail = structureDetailState(c);
    var html = '';
    html += '<h2 id="rp-card-title">' + esc(c.name) + '</h2>';
    html += structureFigureBlock(c);
    var stateNote;
    if (c.recordState !== 'confirmed') stateNote = '独立資料での確認が済んでいません。';
    else if (detail === 'fallback') stateNote = '物質データは確認済み。詳細構造は未収録です。';
    else if (detail === 'missing') stateNote = '物質データは確認済み。構造データは未整備です。';
    else stateNote = '構造データは確認済み。';
    html += '<p>' + stateBadge(c.recordState) + ' <span class="rp-card__note">' + stateNote + '</span></p>';
    html += '<p class="rp-card__note">分野: ' + esc(regionName(c.region)) +
      (c.curriculum ? ' ／ 高校化学の必須物質リストに収録' : '') + '</p>';
    if (region && region.note) html += '<p class="rp-card__note">' + esc(region.note) + '</p>';
    html += '<dl class="rp-card__facts">' +
      '<div><dt>製法（入ってくる反応）</dt><dd>' + ins.length + ' 件</dd></div>' +
      '<div><dt>生成先（出ていく反応）</dt><dd>' + outs.length + ' 件</dd></div>' +
      '<div><dt>地図での分類</dt><dd>' + esc(regionName(c.region)) + '</dd></div>' +
      '</dl>';
    if (c.builder.href) {
      html += '<h3>ビルダーで開く</h3>';
      html += '<a class="rp-build-link" href="' + esc(c.builder.href) + '" target="_blank" rel="noopener">' +
        '有機化学ビルダーで開く（focus=' + esc(c.id) + '）</a>';
      html += '<p class="rp-card__note">同じ物質を、ビルダーの focus 指定で開きます。</p>';
    } else {
      html += '<h3>ビルダーで開く</h3>';
      html += '<p class="rp-empty">ビルダー収録外: この物質はビルダーの収録IDと対応していないため、リンクを表示しません。</p>';
    }
    html += '<h3>この物質の製法（' + ins.length + ' 件）</h3>';
    html += ins.length ? '<ul class="rp-card__links">' + ins.map(reactionButton).join('') + '</ul>'
      : '<p class="rp-empty">' + esc(Core.emptyReason(c.pathState, 'in', D.states)) + '</p>';
    html += '<h3>この物質からの生成物（' + outs.length + ' 件）</h3>';
    html += outs.length ? '<ul class="rp-card__links">' + outs.map(reactionButton).join('') + '</ul>'
      : '<p class="rp-empty">' + esc(Core.emptyReason(c.pathState, 'out', D.states)) + '</p>';
    if (c.pathState === 'covered' || (academicLinked && c.pathState !== 'out-of-scope')) {
      html += '<p class="rp-verification">反応経路: 製法 ' + ins.length + ' 件・生成先 ' + outs.length +
        ' 件を、収録した反応' + (academicLinked ? 'とアカデミック（大学レベル）の経路' : '') + 'から表示しています。</p>';
    } else {
      html += '<p class="rp-verification">反応経路の状態: ' +
        esc(D.states[c.pathState] ? D.states[c.pathState].label : c.pathState) + '。' +
        esc(D.states[c.pathState] ? D.states[c.pathState].note : '') + '</p>';
    }
    return html;
  }

  function rDefsList(defs) {
    if (!defs || !defs.length) return '';
    return '<ul class="rp-card__list rp-rdefs">' + defs.map(function (text) {
      return '<li>' + esc(text) + '</li>';
    }).join('') + '</ul>';
  }

  function classStructureFigure(n) {
    if (!SD) {
      return '<p class="rp-struct-missing">構造データを読み込めないため、一般構造を表示していません。</p>';
    }
    var caption = '一般構造（分類の共通骨格）';
    var html = structureFigure(n.structure, n.name + 'の一般構造', caption,
      '原子団と結合の変化を示す一般構造です。具体物質の構造ではありません。');
    if (!html) html = '<p class="rp-struct-missing">一般構造を表示できませんでした。</p>';
    html += '<h3>Rの定義</h3>' + rDefsList(n.rDefs);
    return html;
  }

  function classCard(id) {
    var n = classNodeById[id];
    if (!n) return '';
    var ins = classMapData.edges.filter(function (e) { return e.to === id; });
    var outs = classMapData.edges.filter(function (e) { return e.from === id; });
    var edgeText = function (e) {
      var from = classNodeById[e.from];
      var to = classNodeById[e.to];
      return (from ? from.name : e.from) + ' → ' + (to ? to.name : e.to) +
        '（' + e.label + '／' + e.conditions + '）';
    };
    var edgeList = function (list) {
      if (!list.length) return '<p class="rp-empty">この図に該当する変換はありません。</p>';
      return '<ul class="rp-card__links">' + list.map(function (e) {
        return '<li><button type="button" class="rp-link" data-kind="class-edge" data-id="' + esc(e.id) + '">' +
          esc(edgeText(e)) + '</button></li>';
      }).join('') + '</ul>';
    };
    var html = '';
    html += '<h2 id="rp-card-title">' + esc(n.name) + '</h2>';
    html += '<p class="rp-card__note">官能基変換の一般図 — 分類の説明であり、個別物質の反応ではありません。</p>';
    html += '<p>' + stateBadge('confirmed') + ' <span class="rp-card__note">分類間の代表的な変換として、独立資料の各節で確認済み。個別反応 ' +
      D.meta.confirmedReactionCount + ' 件には加算しません。</span></p>';
    html += '<h3>この分類の一般構造</h3>' + classStructureFigure(n);
    html += '<h3>一般適用範囲</h3><p>' + esc(n.scope) + '</p>';
    html += '<h3>例外・注意</h3><ul class="rp-card__list">' +
      n.exceptions.map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('') + '</ul>';
    html += '<h3>この分類へ進む変換（' + ins.length + ' 件）</h3>' + edgeList(ins);
    html += '<h3>この分類から進む変換（' + outs.length + ' 件）</h3>' + edgeList(outs);
    html += '<h3>資料</h3><p class="rp-card__note">' + n.sources.map(esc).join('／') + '</p>';
    html += '<p class="rp-card__note">資料のURL・本文・図は転載していません。一般化された反応事実は独立資料で確認済みで、未検証の別データではありません。適用は局所構造の一般化で、具体物質の反応ではありません。</p>';
    return html;
  }

  function equationHasFormal(eq) {
    var found = false;
    ['left', 'right'].forEach(function (side) {
      (eq[side] || []).forEach(function (item) {
        (item.structure.atoms || []).forEach(function (a) {
          if (a.label === '[O]' || a.label === '[H]') found = true;
        });
      });
    });
    return found;
  }

  // 反応物・生成物の custom spec を1枚の SVG に並べ、係数・＋・矢印を付ける。
  // 並べ方・寸法・矢印の上下の条件は structure-draw.js の共通実装
  // （renderEquation）を使い、一般図の16変換と同じ描画にそろえる。
  function buildEquationSvg(eq, ariaLabel) {
    return SD.renderEquation(eq, ariaLabel);
  }

  // 反応カード用。具体物質は一般図の骨格より背が高いため、行の高さを広げ、
  // 縮小率に下限を置いて文字を潰さない（1段に収まらない式は buildCardEquationSvg で2段に積む）。
  var REACTION_EQUATION_OPTS = { row: 200, maxWidth: 300, minScale: 0.55 };
  var REACTION_EQUATION_STACK_OPTS = { row: 200, maxWidth: 300, minScale: 0.55, stack: true };
  // 1段の自然幅がこれを超える式は、カード内で反応物・矢印・生成物の2段に積む。
  var EQUATION_STACK_MIN_WIDTH = 600;

  function buildReactionEquationSvg(eq, ariaLabel) {
    return SD.renderEquation(eq, ariaLabel, REACTION_EQUATION_OPTS);
  }

  function svgViewBoxWidth(svg) {
    var vb = /viewBox="([^"]+)"/.exec(svg);
    if (!vb) return 0;
    var parts = String(vb[1]).trim().split(/\s+/);
    var width = parseFloat(parts[2]);
    return isFinite(width) ? width : 0;
  }

  // カード内の式は1段に収まる短い式だけを1段で見せ、長い式は2段に積む。
  // 拡大ダイアログには、ここで選んだSVGをそのまま複製して渡す（段組みを戻さない）。
  function buildCardEquationSvg(eq, ariaLabel) {
    var svg = buildReactionEquationSvg(eq, ariaLabel);
    if (svgViewBoxWidth(svg) > EQUATION_STACK_MIN_WIDTH) {
      svg = SD.renderEquation(eq, ariaLabel, REACTION_EQUATION_STACK_OPTS);
    }
    return svg;
  }

  function buildGeneralEquationSvg(eq, ariaLabel) {
    var svg = buildEquationSvg(eq, ariaLabel);
    if (svgViewBoxWidth(svg) > EQUATION_STACK_MIN_WIDTH) {
      svg = SD.renderEquation(eq, ariaLabel, { stack: true });
    }
    return svg;
  }

  // 図の説明は figcaption と note に残し、図そのものはボタンにして
  // tap / Enter / Space で拡大ダイアログを開く。
  function equationFigureMarkup(svg, caption, note, openLabel) {
    return '<figure class="rp-struct rp-eq-fig">' +
      (caption ? '<figcaption class="rp-struct__caption">' + esc(caption) + '</figcaption>' : '') +
      '<button type="button" class="rp-eq-open" data-eq-open="1" aria-haspopup="dialog" aria-label="' +
      esc(openLabel) + '"><span class="rp-struct__canvas">' + svg + '</span></button>' +
      (note ? '<p class="rp-struct__note">' + esc(note) + '</p>' : '') +
      '</figure>';
  }

  function equationFigure(edge) {
    if (!SD) {
      return '<p class="rp-struct-missing">構造データを読み込めないため、一般反応式を表示していません。</p>';
    }
    var from = classNodeById[edge.from];
    var to = classNodeById[edge.to];
    var aria = '一般反応式（構造式）。' + (from ? from.name : edge.from) + 'から' +
      (to ? to.name : edge.to) + 'への' + edge.label;
    var svg;
    try {
      svg = buildGeneralEquationSvg(edge.equation, aria);
    } catch (err) {
      return '<figure class="rp-struct rp-struct--fallback"><figcaption class="rp-struct__caption">一般反応式（構造式）</figcaption>' +
        '<p class="rp-struct__note">一般反応式を表示できませんでした。</p></figure>';
    }
    return equationFigureMarkup(svg, '一般反応式（構造式）',
      '係数・副生成物・矢印を含む一般化した反応式です。具体物質の反応条件を示すものではありません。',
      '一般反応式を拡大');
  }

  function typeCommon(type) {
    if (!type) return '';
    var html = '<div class="rp-common">';
    html += '<h3>共通の説明 — ' + esc(type.label) + '</h3>';
    html += '<p>' + esc(type.summary) + '</p>';
    if (type.schematic) {
      html += '<p class="rp-schematic">' + esc(type.schematic) + '</p>';
      html += '<span class="rp-figcap">模式図（原子団・結合の変化）。電子の動きを示す機構図は収録していません。</span>';
    }
    html += '</div>';
    return html;
  }

  function classEdgeCard(id) {
    var e = classEdgeById[id];
    if (!e) return '';
    var from = classNodeById[e.from];
    var to = classNodeById[e.to];
    var type = D.types[e.type] || { label: e.label, summary: '', schematic: '' };
    var html = '';
    html += '<h2 id="rp-card-title">' + esc(e.label) + ': ' +
      esc(from ? from.name : e.from) + ' → ' + esc(to ? to.name : e.to) + '</h2>';
    html += '<p class="rp-card__note">官能基変換の一般図の1経路 — 分類間の一般化であり、個別物質の反応ではありません。</p>';
    html += '<p>' + stateBadge('confirmed') + ' <span class="rp-card__note">独立資料の各節で確認済み。個別反応 ' +
      D.meta.confirmedReactionCount + ' 件には加算しません。</span></p>';
    html += '<h3>一般反応式（構造式）</h3>' + equationFigure(e);
    html += '<h3>Rの定義（この式）</h3>' + rDefsList(e.rDefs);
    if (equationHasFormal(e.equation)) {
      html += '<p class="rp-card__note">式の [O]・[H] は酸化・還元の形式当量で、試薬の単原子を意味しません。電子の移動を示す機構図ではなく、結合変化を示す模式反応式です。</p>';
    }
    html += typeCommon(type);
    html += '<p class="rp-card__note">共通説明は同じ反応種別に共通する模式です。この変換の反応物・生成物・係数は、上の一般反応式を正とします。</p>';
    html += '<h3>この一般変換</h3><dl class="rp-dl">';
    html += '<div><dt>向き</dt><dd>' + esc(from ? from.name : e.from) + ' → ' + esc(to ? to.name : e.to) + '</dd></div>';
    html += '<div><dt>条件</dt><dd>' + esc(e.conditions) + '</dd></div>';
    html += '<div><dt>適用</dt><dd>一般図ではこの向きの代表的な変換として扱う。分類内のすべての物質に無条件で当てはまる変換ではない。</dd></div>';
    html += '<div><dt>注意</dt><dd>' + esc(e.note) + '</dd></div>';
    html += '</dl>';
    html += '<h3>資料</h3><p class="rp-card__note">' + e.sources.map(esc).join('／') + '</p>';
    html += '<p class="rp-card__note">資料のURL・本文・図は転載していません。適用は局所構造の一般化で、具体物質の反応ではありません。</p>';
    return html;
  }

  function byTypeThenId(a, b) {
    if (a.typeLabel !== b.typeLabel) return a.typeLabel < b.typeLabel ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  }

  function reactionButton(r) {
    return '<li><button type="button" class="rp-link" data-kind="reaction" data-id="' + esc(r.id) + '">' +
      esc(reactionSummary(r)) + '</button></li>';
  }

  function reactionSummary(r) {
    var subs = r.substrates.map(function (id) { return compoundById[id] ? compoundById[id].label : id; });
    var prods = r.products.length
      ? r.products.map(function (id) { return compoundById[id] ? compoundById[id].label : id; })
      : [r.productNote || '生成物の記載なし'];
    return r.typeLabel + ': ' + subs.join(' ＋ ') + ' → ' + prods.join(' ＋ ');
  }

  // ---- 反応カードの反応式（構造式） ----
  // B=完全な反応式 / N=正味の総括式 / T=構造変換図 / P=重合反応の模式式。
  // 反応式が未収録の反応は係数を推測せず、反応物と主生成物の構造だけを描く。
  var EQUATION_MODE_NOTES = {
    B: '係数・副生成物まで含む反応式です。元素収支は本ツールで計算しています。',
    N: '元素収支は合うが、塩の生成・中和・後処理などを省略した総括式です。',
    T: '反応物と生成物の構造だけを示す変換図です。試薬由来の生成物・プロトン源・保護基の脱着などは省略しており、完全な反応式ではありません。',
    P: '繰り返し単位 n で示す重合の模式式です。末端を省略しており、有限の鎖の完全な反応式ではありません。'
  };

  function compoundEquationItem(id, coef) {
    var c = compoundById[id];
    if (!c) return { coef: coef, name: id, structure: null, fallback: true };
    var spec = c.structure || null;
    var fallback = !spec;
    try {
      var view = SD.structureView(c);
      var fig = view && view.figures && view.figures[0];
      if (fig && fig.structure) spec = fig.structure;
      if (view && (view.kind === 'fallback' || view.kind === 'missing')) fallback = true;
    } catch (err) {
      // 構造ビューを作れない場合は登録specのまま描き、示性式の断りを付ける。
    }
    return { coef: coef, name: c.label || c.name || id, structure: spec, fallback: fallback };
  }

  function equationItemOf(item) {
    if (item.kind === 'species') {
      var sp = D.species && D.species[item.id];
      if (!sp) return { coef: item.coef, name: item.id, structure: null, fallback: true };
      return { coef: item.coef, name: sp.name || item.id, structure: sp.structure || null, fallback: !sp.structure };
    }
    if (item.kind === 'text') return { coef: item.coef, name: item.text, structure: null, fallback: true };
    return compoundEquationItem(item.id, item.coef);
  }

  function equationItems(list) {
    return (list || []).map(equationItemOf);
  }

  function derivedReactionEquation(r) {
    var left = r.substrates.map(function (id) { return compoundEquationItem(id, 1); });
    var right = r.products.length
      ? r.products.map(function (id) { return compoundEquationItem(id, 1); })
      : [{ coef: 1, name: r.productNote || '生成物の記載なし', structure: null, fallback: true }];
    return { arrow: 'to', above: '', below: '', left: left, right: right };
  }

  function itemsHaveFallback(items) {
    return (items || []).some(function (item) { return item.fallback; });
  }

  function reactionEquationPlan(r) {
    var eq = r.equation;
    if (!eq) {
      return {
        caption: '主な物質の変換（係数・副生成物省略）',
        note: '係数・副生成物を省略し、反応物と主生成物の構造だけを示します。完全な反応式ではありません。',
        sources: [],
        equations: [{ label: '', eq: derivedReactionEquation(r) }]
      };
    }
    var caption = eq.title || (eq.mode === 'N' ? '正味の反応式（総括）'
      : eq.mode === 'B' ? '反応式（構造式）'
        : eq.mode === 'P' ? '重合反応の模式式' : '構造変換図');
    var note = [eq.explanation, EQUATION_MODE_NOTES[eq.mode]].filter(Boolean).join(' ');
    var equations;
    if (eq.variants && eq.variants.length) {
      equations = eq.variants.map(function (variant) {
        return {
          label: variant.label,
          eq: {
            arrow: variant.arrow,
            above: eq.above,
            below: eq.below,
            left: equationItems(variant.left),
            right: equationItems(variant.right)
          }
        };
      });
    } else {
      equations = [{
        label: '',
        eq: {
          arrow: eq.arrow,
          above: eq.above,
          below: eq.below,
          left: equationItems(eq.left),
          right: equationItems(eq.right)
        }
      }];
    }
    return { caption: caption, note: note, sources: (eq.sources && eq.sources.length) ? eq.sources : (r.sources || []), equations: equations };
  }

  function equationFigureBlock(equation, caption, note, aria, openLabel) {
    var svg;
    try {
      svg = buildCardEquationSvg(equation, aria);
    } catch (err) {
      svg = '';
    }
    if (!svg) {
      return '<figure class="rp-struct rp-struct--fallback"><figcaption class="rp-struct__caption">' +
        esc(caption) + '</figcaption><p class="rp-struct__note">反応式を表示できませんでした。' +
        '根拠のない式を推定して表示することはありません。</p></figure>';
    }
    return equationFigureMarkup(svg, caption, note, openLabel || '反応式を拡大');
  }

  function reactionEquationFigure(r, ariaExtra) {
    if (!SD || !SD.renderEquation) {
      return '<p class="rp-struct-missing">構造データを読み込めないため、反応式を表示していません。</p>';
    }
    var plan = reactionEquationPlan(r);
    var note = plan.note;
    var anyFallback = plan.equations.some(function (entry) {
      return itemsHaveFallback(entry.eq.left) || itemsHaveFallback(entry.eq.right);
    });
    if (anyFallback) note += ' 示性式・名称で表示している項目があります（構造式ではありません）。';
    if (plan.sources && plan.sources.length) note += ' 式の根拠: ' + plan.sources.join('／');
    var ariaBase = '反応式（構造式）。' + r.substrates.map(compoundName).join('と') + 'から' +
      (r.products.length ? r.products.map(compoundName).join('と') : (r.productNote || '生成物')) + 'へ。' +
      (ariaExtra || '');
    return plan.equations.map(function (entry) {
      var caption = entry.label ? plan.caption + '（' + entry.label + '）' : plan.caption;
      var openLabel = ariaExtra ? '反応式を拡大。' + ariaBase + (entry.label || '') : '反応式を拡大';
      return equationFigureBlock(entry.eq, caption, note, ariaBase + (entry.label || ''), openLabel);
    }).join('');
  }

  function reactionEvidenceNote(r) {
    var note;
    if (r.evidenceKind === 'general-rule-application') {
      note = (r.academic ? '大学レベルの' : '高校化学の') +
        '一般則を既存の物質に適用した経路です。個別の実験で確認したものではありません。';
    } else if (r.evidenceKind === 'source-illustrated-transformation') {
      note = '資料が個別例として示す変換です。一般則を無条件に当てはめたものではありません。';
    } else {
      note = '独立資料の本文で確認済み。';
    }
    if (r.stepKind === 'multi-step') note += ' 多段階の総括として示し、中間体は物質として収録していません。';
    return note;
  }

  function reactionEducationLabel(level) {
    if (level === 'high-school-standard') return '高校標準';
    if (level === 'high-school-extension') return '高校発展';
    return '';
  }

  // 旧 86 は独立資料で確認済み。新 76 の一般則・資料個別例は「確認済」ではなく収録済として示す。
  // 表示文言はデータ（D.states）を正とし、sourceworker が label を用意すればそれに従う。
  function reactionStateBadge(r) {
    if (!r.academic && r.state === 'confirmed' &&
        (r.evidenceKind === 'general-rule-application' ||
          r.evidenceKind === 'source-illustrated-transformation')) {
      var states = D.states || {};
      var listed = states.listed || states.collected;
      var label = (listed && listed.label) ||
        (states.confirmed && states.confirmed.label && states.confirmed.label !== '確認済'
          ? states.confirmed.label : '') || '収録済';
      return '<span class="rp-status">' + esc(label) + '</span>';
    }
    return stateBadge(r.state);
  }

  function normalReactionCounts() {
    var counts = { confirmed: 0, general: 0, illustrated: 0 };
    D.reactions.forEach(function (r) {
      if (r.evidenceKind === 'general-rule-application') counts.general++;
      else if (r.evidenceKind === 'source-illustrated-transformation') counts.illustrated++;
      else counts.confirmed++;
    });
    return counts;
  }

  // 収録内訳（旧 86 = 資料で確認、新 76 = 資料が示す変換／一般則の適用）。内訳が無ければ空文字。
  function normalEvidenceBreakdown(sep) {
    var counts = normalReactionCounts();
    if (!counts.general && !counts.illustrated) return '';
    var parts = [];
    if (counts.confirmed) parts.push('資料で確認 ' + counts.confirmed);
    if (counts.illustrated) parts.push('資料が示す変換 ' + counts.illustrated);
    if (counts.general) parts.push('一般則の適用 ' + counts.general);
    return parts.join(sep || '／');
  }

  function normalReactionCountLabel() {
    var breakdown = normalEvidenceBreakdown(' ＋ ');
    if (!breakdown) return D.reactions.length + ' 件（すべて独立資料で確認済み）';
    return D.reactions.length + ' 件（' + breakdown + '）';
  }

  // 反応カード。単独は従来の 1 反応カード、複数 member は条件別のグループカード。
  function reactionCard(id) {
    var group = (typeof displayGroupFor === 'function') ? displayGroupFor(id) : null;
    if (!group || group.size <= 1) {
      var one = findReaction(id);
      return one ? reactionCardOne(one) : '';
    }
    return reactionCardGroup(group);
  }

  function reactionCardOne(r) {
    var type = typeFor(r.type) || { label: r.typeLabel, summary: '', schematic: '' };
    var subText = r.substrates.map(compoundName).join(' ＋ ');
    var prodText = r.products.length ? r.products.map(compoundName).join(' ＋ ') : (r.productNote || '生成物の記載なし');
    var subs = r.substrates.map(compoundInline).join(' ＋ ');
    var prods = r.products.length ? r.products.map(compoundInline).join(' ＋ ') : esc(r.productNote || '生成物の記載なし');
    var html = '';
    html += '<h2 id="rp-card-title">' + esc(type.label) + 'の反応</h2>';
    if (r.academic) {
      html += '<p class="rp-card__tier rp-card__tier--academic">' +
        (r.educationLevel === 'high-school-standard' ? '高校標準（大学レベルから移行）' : '大学レベル（アカデミック）') +
        (r.stepKind === 'multi-step' ? '／多段階の総括' : '／一段階（direct）') + '</p>';
    } else {
      var eduLabel = reactionEducationLabel(r.educationLevel);
      html += '<p class="rp-card__tier rp-card__tier--' + (r.tier === 'primary' ? 'primary' : 'secondary') + '">' +
        (r.tier === 'primary' ? '主要経路（太い実線）' : '補助経路（細い点線）') +
        (eduLabel ? '／' + eduLabel : '') + '</p>';
    }
    html += '<p class="rp-card__formula">' + esc(subText) + ' → ' + esc(prodText) + '</p>';
    if (r.academic) {
      html += '<p><span class="rp-status rp-status--academic">アカデミック</span> <span class="rp-card__note">' +
        reactionEvidenceNote(r) + '</span></p>';
    } else {
      html += '<p>' + reactionStateBadge(r) + ' <span class="rp-card__note">' +
        reactionEvidenceNote(r) + '</span></p>';
    }
    if (r.scope) {
      html += '<h3>適用範囲</h3><p>' + esc(r.scope) + '</p>';
    }
    if (r.stepKind === 'multi-step' && r.steps && r.steps.length) {
      html += '<h3>段階（総括）</h3><ol class="rp-card__list rp-academic-steps">' +
        r.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>' +
        '<p class="rp-card__note">地図の線は総括した経路で、中間体は物質として収録していません。</p>';
    }
    if (r.academic && r.basedOnHeld) {
      html += '<p class="rp-card__note">保留反応 ' + esc(r.basedOnHeld) +
        ' と同じ組合せを含むが、新しい出典で確認した内容として別に記録している。</p>';
    }
    html += '<p class="rp-card__actions"><button type="button" class="rp-btn rp-btn--wide" data-action="fit-reaction" data-id="' +
      esc(r.id) + '">この反応の端点を表示</button></p>';

    html += typeCommon(type);

    html += '<h3>この反応の個別情報</h3>';
    html += reactionEquationFigure(r);
    html += '<dl class="rp-dl">';
    html += '<div><dt>基質</dt><dd>' + subs + '</dd></div>';
    html += '<div><dt>試薬</dt><dd>' + (r.reagents.length ? esc(r.reagents.join('・')) : '個別の記載なし') + '</dd></div>';
    html += '<div><dt>生成物</dt><dd>' + prods +
      (r.productNote && r.products.length ? '<br><span class="rp-card__note">' + esc(r.productNote) + '</span>' : '') + '</dd></div>';
    html += '<div><dt>条件</dt><dd>' + (r.conditions ? esc(r.conditions) : '個別の記載なし') + '</dd></div>';
    html += '<div><dt>例外・注意</dt><dd>' + (r.note ? esc(r.note) : '個別の記載なし') + '</dd></div>';
    html += '<div><dt>分野</dt><dd>' + esc(regionSpan(r)) + '</dd></div>';
    html += '</dl>';
    html += '<p class="rp-verification">検証記録: ' +
      (r.sources.length ? esc(r.sources.join('／')) : '記録なし') + '。</p>';
    html += '<p class="rp-card__note">実験の実施手順・試薬量・濃度・装置の使い方は収録していません。</p>';
    return html;
  }

  // 複数 member のグループカード。1 つの h2 の下に、member ごとの式・試薬・条件・注意・
  // 出典・evidence・scope・教育レベルをすべて残す。共通の端点・型説明は 1 回だけ出す。
  function reactionMemberHeading(r) {
    var conditions = r.conditions ? String(r.conditions) : '';
    if (conditions && conditions.length <= 24) return conditions;
    if (r.reagents && r.reagents.length) return r.reagents[0];
    if (conditions) return conditions.slice(0, 22) + '…';
    return '条件の記載なし';
  }

  function reactionMemberMeta(r) {
    var html = '';
    if (r.academic) {
      html += '<p class="rp-card__tier rp-card__tier--academic">' +
        (r.educationLevel === 'high-school-standard' ? '高校標準（大学レベルから移行）' : '大学レベル（アカデミック）') +
        (r.stepKind === 'multi-step' ? '／多段階の総括' : '／一段階（direct）') + '</p>';
    } else {
      var eduLabel = reactionEducationLabel(r.educationLevel);
      html += '<p class="rp-card__tier rp-card__tier--' + (r.tier === 'primary' ? 'primary' : 'secondary') + '">' +
        (r.tier === 'primary' ? '主要経路（太い実線）' : '補助経路（細い点線）') +
        (eduLabel ? '／' + eduLabel : '') + '</p>';
    }
    if (r.academic) {
      html += '<p><span class="rp-status rp-status--academic">アカデミック</span> <span class="rp-card__note">' +
        reactionEvidenceNote(r) + '</span></p>';
    } else {
      html += '<p>' + reactionStateBadge(r) + ' <span class="rp-card__note">' +
        reactionEvidenceNote(r) + '</span></p>';
    }
    return html;
  }

  function reactionCardGroup(group) {
    var members = group.members || [];
    if (!members.length) return '';
    var rep = findReaction(group.representativeId) || members[0];
    var commonType = members.every(function (m) { return m.type === members[0].type; })
      ? (typeFor(members[0].type) || { label: members[0].typeLabel, summary: '', schematic: '' })
      : null;
    var subText = rep.substrates.map(compoundName).join(' ＋ ');
    var prodText = rep.products.length ? rep.products.map(compoundName).join(' ＋ ')
      : (rep.productNote || '生成物の記載なし');
    var html = '';
    html += '<h2 id="rp-card-title">' + esc('条件別の反応 ' + members.length + '件') + '</h2>';
    html += '<p class="rp-card__tier rp-card__tier--group">' + esc(group.typeLabel) +
      '／同じ基質と生成物の反応を、条件ごとにまとめています。</p>';
    html += '<p class="rp-card__formula">' + esc(subText) + ' → ' + esc(prodText) + '</p>';
    html += '<p class="rp-card__actions"><button type="button" class="rp-btn rp-btn--wide" data-action="fit-reaction" data-id="' +
      esc(group.representativeId) + '">この反応の端点を表示</button></p>';
    if (commonType) html += typeCommon(commonType);
    members.forEach(function (r) {
      html += '<section class="rp-card__group-member" data-reaction-id="' + esc(r.id) + '">';
      html += '<h3 class="rp-card__group-heading">' + esc(reactionMemberHeading(r)) + '</h3>';
      html += reactionMemberMeta(r);
      if (r.scope) html += '<p class="rp-card__note">適用範囲: ' + esc(r.scope) + '</p>';
      if (r.stepKind === 'multi-step' && r.steps && r.steps.length) {
        html += '<ol class="rp-card__list rp-academic-steps">' +
          r.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>';
      }
      if (r.academic && r.basedOnHeld) {
        html += '<p class="rp-card__note">保留反応 ' + esc(r.basedOnHeld) + ' と同じ組合せを含む。</p>';
      }
      html += reactionEquationFigure(r, '、条件 ' + reactionMemberHeading(r));
      html += '<dl class="rp-dl">';
      html += '<div><dt>試薬</dt><dd>' + (r.reagents.length ? esc(r.reagents.join('・')) : '個別の記載なし') + '</dd></div>';
      html += '<div><dt>生成物</dt><dd>' + (r.products.length ? r.products.map(compoundInline).join(' ＋ ') : esc(r.productNote || '生成物の記載なし')) +
        (r.productNote && r.products.length ? '<br><span class="rp-card__note">' + esc(r.productNote) + '</span>' : '') + '</dd></div>';
      html += '<div><dt>条件</dt><dd>' + (r.conditions ? esc(r.conditions) : '個別の記載なし') + '</dd></div>';
      html += '<div><dt>例外・注意</dt><dd>' + (r.note ? esc(r.note) : '個別の記載なし') + '</dd></div>';
      html += '<div><dt>分野</dt><dd>' + esc(regionSpan(r)) + '</dd></div>';
      html += '</dl>';
      html += '<p class="rp-verification">検証記録: ' +
        (r.sources.length ? esc(r.sources.join('／')) : '記録なし') + '。</p>';
      html += '</section>';
    });
    html += '<p class="rp-card__note">実験の実施手順・試薬量・濃度・装置の使い方は収録していません。</p>';
    return html;
  }

  function compoundInline(id) {
    var c = compoundById[id];
    if (!c) return esc(id);
    return '<button type="button" class="rp-link rp-link--inline" data-kind="compound" data-id="' + esc(id) + '">' + esc(c.label) + '</button>';
  }

  function compoundName(id) {
    return compoundById[id] ? compoundById[id].label : id;
  }

  function regionSpan(r) {
    var set = {};
    r.substrates.concat(r.products).forEach(function (id) {
      var c = compoundById[id];
      if (c) set[regionName(c.region)] = true;
    });
    var names = Object.keys(set);
    return names.length ? names.join(' → ') : '—';
  }

  /* ---------------- chips / lists ---------------- */

  function buildChips() {
    D.regions.forEach(function (region) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rp-chip';
      b.setAttribute('data-region', region.id);
      b.setAttribute('aria-pressed', 'false');
      var dot = document.createElement('span');
      dot.className = 'rp-chip__dot rp-c' + region.colorIndex;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(region.name));
      var count = document.createElement('span');
      count.className = 'rp-chip__count';
      count.textContent = region.count;
      b.appendChild(count);
      b.addEventListener('click', function () {
        // チップの閉包は分野IDだけを持ち、位置はクリック時のモードで引き直す。
        var active = activeRegionById(region.id) || region;
        var target = regionTarget(active);
        activeRegion = region.id;
        animateTo(Core.clampPan(target, viewSize.w, viewSize.h, modeCanvas()));
        setChipPressed(region.id);
        highlightRegion(region.id);
        clearSelection();
      });
      chipsEl.appendChild(b);
    });
  }

  function setChipPressed(id) {
    Array.prototype.forEach.call(chipsEl.querySelectorAll('.rp-chip'), function (chip) {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-region') === id ? 'true' : 'false');
    });
  }

  // 分野チップの選択を、ノードの枠線でも示す（レイアウトは動かさない）。
  function highlightRegion(id) {
    Object.keys(nodeIndex).forEach(function (key) {
      var c = compoundById[key];
      if (c && c.region === id) nodeIndex[key].classList.add('is-region');
      else nodeIndex[key].classList.remove('is-region');
    });
  }

  function clearRegionHighlight() {
    Object.keys(nodeIndex).forEach(function (key) {
      nodeIndex[key].classList.remove('is-region');
    });
  }

  // 明示的な分類選択（チップ）を解除する。パン・ズーム・物質/反応選択の前に呼ぶ。
  function clearRegionSelection() {
    activeRegion = null;
    setChipPressed(null);
    clearRegionHighlight();
  }

  function buildLists() {
    D.regions.forEach(function (region) {
      var members = D.compounds.filter(function (c) { return c.region === region.id; });
      if (!members.length) return;
      var group = document.createElement('section');
      group.className = 'rp-list__group';
      var h = document.createElement('h3');
      h.textContent = region.name;
      var count = document.createElement('span');
      count.textContent = members.length + ' 件';
      h.appendChild(count);
      group.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'rp-list__items';
      members.forEach(function (c) {
        ul.appendChild(compoundListItem(c));
      });
      group.appendChild(ul);
      listAll.appendChild(group);
    });

    var reactionGroup = document.createElement('section');
    reactionGroup.className = 'rp-list__group';
    var rh = document.createElement('h3');
    rh.textContent = '反応';
    var rcount = document.createElement('span');
    rcount.textContent = mode === 'academic'
      ? academicAll.length + ' 件（通常 ' + D.reactions.length + ' ＋ 大学レベル ' + academicReactions.length + '）'
      : normalReactionCountLabel();
    rh.appendChild(rcount);
    reactionGroup.appendChild(rh);
    var rul = document.createElement('ul');
    rul.className = 'rp-list__items';
    var sorted = activeReactions().slice().sort(byTypeThenId);
    sorted.forEach(function (r) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rp-item';
      b.setAttribute('data-kind', 'reaction');
      b.setAttribute('data-id', r.id);
      var name = document.createElement('span');
      name.className = 'rp-item__name';
      name.textContent = r.typeLabel + ': ' + r.substrates.map(function (id) {
        return compoundById[id] ? compoundById[id].label : id;
      }).join('＋') + ' → ' + (r.products.length ? r.products.map(function (id) {
        return compoundById[id] ? compoundById[id].label : id;
      }).join('＋') : (r.productNote || '生成物の記載なし'));
      var meta = document.createElement('span');
      meta.className = 'rp-item__meta';
      meta.textContent = r.conditions || '条件の記載なし';
      b.appendChild(name);
      b.appendChild(meta);
      b.addEventListener('click', function () { activateListEntity('reaction', r.id); });
      li.appendChild(b);
      rul.appendChild(li);
    });
    reactionGroup.appendChild(rul);
    listAll.appendChild(reactionGroup);
  }

  function compoundListItem(c) {
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rp-item';
    b.setAttribute('data-kind', 'compound');
    b.setAttribute('data-id', c.id);
    var name = document.createElement('span');
    name.className = 'rp-item__name';
    name.textContent = c.name;
    var ins = activeIncoming(c.id).length;
    var outs = activeOutgoing(c.id).length;
    var academicLinked = mode === 'academic' && c.incoming + c.outgoing === 0 && ins + outs > 0;
    if (academicLinked) {
      var acTag = document.createElement('span');
      acTag.className = 'rp-item__tag rp-item__tag--academic';
      acTag.textContent = '学術接続';
      name.appendChild(acTag);
    } else if (c.pathState !== 'covered' && c.pathState !== 'confirmed') {
      var tag = document.createElement('span');
      tag.className = 'rp-item__tag rp-item__tag--pending';
      tag.textContent = c.pathState === 'out-of-scope' ? '収録外' : '未確認';
      name.appendChild(tag);
    }
    var meta = document.createElement('span');
    meta.className = 'rp-item__meta';
    meta.innerHTML = esc(c.formula) + ' ／ 製法 <b>' + ins + '</b> ・ 生成先 <b>' + outs + '</b>';
    b.appendChild(name);
    b.appendChild(meta);
    b.addEventListener('click', function () { activateListEntity('compound', c.id); });
    li.appendChild(b);
    return li;
  }

  function gotoEntity(kind, id, trigger) {
    returnFocus = trigger || returnFocus;
    var c = kind === 'compound' ? compoundAt(id) : null;
    var r = kind === 'reaction' ? findReaction(displayIdFor(id)) : null;
    var target = c ? { x: c.x, y: c.y } : (r ? { x: r.x, y: r.y } : null);
    if (mapEl.scrollIntoView) {
      try { mapEl.scrollIntoView({ behavior: prefersReduce() ? 'auto' : 'smooth', block: 'center' }); } catch (err) { errMsg(err && err.message); }
    }
    if (target) {
      var size = c ? { w: nodeW(c), h: nodeH(c) } : { w: 0, h: 0 };
      var scale = Math.max(view.scale, 0.92);
      animateTo(entityTarget(target, size, scale));
    }
    selectNode(kind, id);
    openCard(kind, id);
  }

  /* ---------------- 反応式の拡大ダイアログ ---------------- */

  function clearEquationDialogBody() {
    if (!eqDialogBody) return;
    while (eqDialogBody.firstChild) eqDialogBody.removeChild(eqDialogBody.firstChild);
  }

  // カード内の図は自前の描画器が生成したSVG。同じDOMを複製し、idの重複だけを除く。
  function prepareEquationDialogSvg(source) {
    var clone = source.cloneNode(true);
    if (clone.removeAttribute) clone.removeAttribute('id');
    var withId = clone.querySelectorAll ? clone.querySelectorAll('[id]') : [];
    Array.prototype.forEach.call(withId, function (node) { node.removeAttribute('id'); });
    var vb = clone.getAttribute ? clone.getAttribute('viewBox') : '';
    var parts = vb ? String(vb).trim().split(/[\s,]+/) : [];
    var width = parseFloat(parts[2]);
    var height = parseFloat(parts[3]);
    if (isFinite(width) && isFinite(height) && width > 0 && height > 0) {
      clone.setAttribute('width', String(Math.ceil(width)));
      clone.setAttribute('height', String(Math.ceil(height)));
      // viewBox の自然寸法を固定し、dialog 側の width:auto が 300px へ落ちないようにする。
      if (clone.style) {
        clone.style.width = Math.ceil(width) + 'px';
        clone.style.height = Math.ceil(height) + 'px';
      }
    }
    return clone;
  }

  function equationFigureCaption(trigger) {
    var fig = trigger && trigger.closest ? trigger.closest('.rp-eq-fig') : null;
    var cap = fig && fig.querySelector ? fig.querySelector('.rp-struct__caption') : null;
    var text = cap && cap.textContent ? String(cap.textContent).trim() : '';
    return text || '反応式';
  }

  function openEquationDialog(trigger) {
    if (!eqDialogEl || !eqDialogBody || !trigger) return;
    var source = trigger.querySelector ? trigger.querySelector('.rp-struct__canvas svg') : null;
    if (!source) return;
    clearEquationDialogBody();
    eqDialogBody.appendChild(prepareEquationDialogSvg(source));
    if (eqDialogTitle) eqDialogTitle.textContent = equationFigureCaption(trigger);
    eqDialogOpener = trigger;
    // カードは残したまま、全文popoverだけを閉じる。
    closePositionPopover(false);
    if (typeof eqDialogEl.showModal === 'function') eqDialogEl.showModal();
    else eqDialogEl.setAttribute('open', '');
    if (eqDialogClose) eqDialogClose.focus();
  }

  // restoreFocus=false はカードを閉じる経路から呼ぶ。閉じたカード内の起点へは戻さない。
  function closeEquationDialog(restoreFocus) {
    var opener = eqDialogOpener;
    eqDialogOpener = null;
    if (eqDialogEl) {
      if (eqDialogEl.open && typeof eqDialogEl.close === 'function') eqDialogEl.close();
      else if (eqDialogEl.open) eqDialogEl.removeAttribute('open');
    }
    clearEquationDialogBody();
    if (restoreFocus !== false && opener && !card.hidden && document.contains(opener) && opener.focus) {
      opener.focus();
    }
  }

  // Esc・nativeの閉じ処理は close イベントで後始末し、起点へフォーカスを戻す。
  function onEquationDialogClose() {
    var opener = eqDialogOpener;
    eqDialogOpener = null;
    clearEquationDialogBody();
    if (opener && !card.hidden && document.contains(opener) && opener.focus) opener.focus();
  }

  // 「このアプリについて」はモーダルの dialog。開く前にカードと現在位置の全文を閉じる。
  function openAbout() {
    if (!aboutEl) return;
    closeEquationDialog(false);
    closeCard(false);
    closePositionPopover(false);
    if (typeof aboutEl.showModal === 'function') aboutEl.showModal();
    else aboutEl.setAttribute('open', '');
  }

  function closeAbout() {
    if (aboutEl && aboutEl.open) aboutEl.close();
  }

  // ダイアログ内の一覧から選んだときは、先にダイアログを閉じてから地図とカードへ移る。
  // 閉じた dialog 内のボタンをフォーカス復帰先にしないよう、起点はヘッダーの起動ボタンにする。
  function activateListEntity(kind, id) {
    closeAbout();
    gotoEntity(kind, id, aboutButton || searchInput);
  }

  function setSearchStatus(text) {
    if (!searchStatus) return;
    if (searchStatus.textContent !== text) searchStatus.textContent = text;
  }

  // 現在モードの反応だけを返す（学術モードでは通常 86 も学術座標へ投影した複製）。
  function findReaction(id) {
    if (mode === 'academic') return academicAllById[id] || null;
    if (layoutChoice === 'proposed' && proposedEnabled) return proposedAllById[id] || null;
    for (var i = 0; i < D.reactions.length; i++) if (D.reactions[i].id === id) return D.reactions[i];
    return null;
  }

  function applySearch(query) {
    var q = Core.normalize(query);
    Array.prototype.forEach.call(viewport.querySelectorAll('.rp-node'), function (n) {
      n.classList.remove('is-match');
    });
    if (!q) {
      listResults.hidden = true;
      listResults.innerHTML = '';
      listAll.hidden = false;
      listStatus.textContent = '';
      setSearchStatus('');
      return;
    }
    var found = Core.matchCompounds(D.compounds, query);
    found.forEach(function (c) {
      if (nodeIndex[c.id]) nodeIndex[c.id].classList.add('is-match');
    });
    listAll.hidden = true;
    listResults.hidden = false;
    listResults.innerHTML = '';
    listStatus.textContent = found.length + ' 件の物質が一致しました。';
    setSearchStatus(found.length ? found.length + ' 件' : '一致なし');
    if (!found.length) {
      listResults.innerHTML = '<p class="rp-empty">一致する物質がありません。名称・示性式・ID の一部で検索できます。</p>';
      return;
    }
    var group = document.createElement('section');
    group.className = 'rp-list__group';
    var h = document.createElement('h3');
    h.textContent = '検索結果';
    var count = document.createElement('span');
    count.textContent = found.length + ' 件';
    h.appendChild(count);
    group.appendChild(h);
    var ul = document.createElement('ul');
    ul.className = 'rp-list__items';
    found.slice(0, 60).forEach(function (c) { ul.appendChild(compoundListItem(c)); });
    group.appendChild(ul);
    listResults.appendChild(group);
  }

  function focusFirstResult() {
    // 検索結果の一覧はダイアログ内へ移した。Enter では（閉じている可能性のある）一覧ボタンへ
    // フォーカスせず、先頭の一致物質へ地図を移動してカードを開く。
    if (!Core.normalize(searchInput.value)) return;
    var found = Core.matchCompounds(D.compounds, searchInput.value);
    if (!found.length) {
      setSearchStatus('一致なし');
      return;
    }
    closeAbout();
    gotoEntity('compound', found[0].id, searchInput);
  }

  /* ---------------- 表示モード（通常 / アカデミック） ---------------- */

  function modeButton(modeId) {
    return document.getElementById('rp-mode-' + modeId);
  }

  function updateModeButtons() {
    var normal = modeButton('normal');
    var acad = modeButton('academic');
    if (normal) normal.setAttribute('aria-pressed', mode === 'normal' ? 'true' : 'false');
    if (acad) {
      acad.setAttribute('aria-pressed', mode === 'academic' ? 'true' : 'false');
      acad.disabled = !academicEnabled;
      acad.setAttribute('aria-disabled', academicEnabled ? 'false' : 'true');
      acad.title = academicEnabled
        ? '通常 ' + D.meta.compoundCount + ' 物質を学術配置で表示し、大学レベルの追加 ' +
          academicReactions.length + ' 反応も表示します。'
        : (academicDisabledReason || 'アカデミックデータが未収録、または通常データと整合しません。');
    }
  }

  // 通常の data-path-state 属性は書き換えない。学術で新たに接続したノードだけ class を足す。
  // 未接続のままの物質（棚）は badge を維持する。
  function applyAcademicNodeStates() {
    Object.keys(nodeIndex).forEach(function (id) {
      var g = nodeIndex[id];
      var c = compoundById[id];
      if (!g || !c) return;
      if (mode === 'academic' && academicNewlyConnectedIds[id]) {
        g.classList.add('is-academic-linked');
        g.setAttribute('aria-label', c.name + '、' + c.formula + '、アカデミック反応で接続');
      } else {
        g.classList.remove('is-academic-linked');
        g.setAttribute('aria-label', compoundLabel(c));
      }
    });
  }

  function academicSummaryText() {
    if (!academic) return '';
    var stats = academic.stats || {};
    var newlyConnected = Object.keys(academicNewlyConnectedIds).length;
    var connected = stats.connectedCount != null ? stats.connectedCount : academic.connectedCount;
    var unconnected = stats.unconnectedCount != null ? stats.unconnectedCount : academic.unconnectedCount;
    return 'アカデミック表示: 通常 ' + D.reactions.length + ' 反応を学術配置へ置き直し、大学レベルの追加反応 ' +
      academicReactions.length + ' 件を加えた全 ' + academicAll.length + ' 反応を表示します（一般則の適用 ' +
      (academic.meta.evidenceCount || {})['general-rule-application'] + ' 件、資料が個別例として示す変換 ' +
      (academic.meta.evidenceCount || {})['source-illustrated-transformation'] + ' 件、多段階 ' +
      ((academic.meta.stepCount || {})['multi-step'] || 0) + ' 件）。新たに接続した物質 ' + newlyConnected +
      ' 件を含め、接続 ' + connected + ' 物質・未接続 ' + unconnected +
      ' 物質（外縁の棚）です。通常の物質 ' + D.meta.compoundCount + ' 件・収録反応 ' +
      D.meta.reactionCount + ' 件の内容は変更していません。';
  }


  function updateAcademicNotice() {
    var note = document.getElementById('rp-academic-note');
    var scope = document.getElementById('rp-academic-scope');
    if (!note) return;
    if (!academicEnabled || mode !== 'academic') {
      if (!academicEnabled && academicDisabledReason) {
        // 古いキャッシュ等で学術配置が無い場合は、黙って v1 overlay を使わず理由を示す。
        note.hidden = false;
        if (note.textContent !== academicDisabledReason) note.textContent = academicDisabledReason;
      } else {
        note.hidden = true;
        note.textContent = '';
      }
      if (scope) { scope.hidden = true; scope.textContent = ''; }
      return;
    }
    note.hidden = false;
    var text = academicSummaryText();
    if (note.textContent !== text) note.textContent = text;
    if (scope) {
      scope.hidden = false;
      var scopeText = 'アカデミック表示では、通常は孤立していた物質のうち学術反応でつながったものを「学術接続」として示します。' +
        '未接続の物質は ' + (academic.unconnectedCount == null ? 0 : academic.unconnectedCount) + ' 件で、これは「生成しない」という意味ではありません。';
      if (scope.textContent !== scopeText) scope.textContent = scopeText;
    }
  }

  function refreshLists() {
    while (listAll.firstChild) listAll.removeChild(listAll.firstChild);
    buildLists();
    applySearch(searchInput.value || '');
  }

  // 現在モードに実体があるか（切替後に選択・カードを残せるかの判定）。
  function modeHasEntity(kind, id) {
    if (!kind || !id) return false;
    if (kind === 'compound') return !!compoundById[id];
    if (kind === 'reaction') return !!activeReactionIndex()[id];
    return kind === 'class' || kind === 'class-edge';
  }

  // モード切替。選択・カードの「論理的な対象」は可能な限り保ち、
  // 実体の座標だけを切替後のモードで引き直す（通常 86 と物質は同じ反応・物質のまま）。
  function setMode(next, opts) {
    var options = opts || {};
    if (next === 'academic' && !academicEnabled) return;
    if (next === mode) {
      if (next !== 'academic') return;
      next = 'normal';
    }
    var logical = selected ? { kind: selected.kind, id: selected.id } : null;
    var cardOpen = !card.hidden;
    // 途中のホイール目標・進行中の fit を捨てる（切替後に古い目標へ戻らない）。
    cancelWheelZoom();
    animToken += 1;
    closeEquationDialog(false);
    closePositionPopover(false);
    clearRegionSelection();
    mode = next;
    svg.setAttribute('data-mode', mode);
    mapEl.setAttribute('data-mode', mode);
    // 学術表示では専用配置を使う。通常へ戻すと layoutChoice の選択がそのまま復元される。
    var layoutName = mode === 'academic' ? 'current' : activeLayoutName();
    svg.setAttribute('data-layout', layoutName);
    mapEl.setAttribute('data-layout', layoutName);
    if (mode === 'normal' && layoutChoice === 'proposed') ensureProposedLayer();
    // 切替後に隠れる層（通常・配置案・学術）の focus だけ地図へ移す。
    moveFocusOutOfHiddenLayer();
    syncNodeProjection();
    syncModeLayers();
    searchInput.value = '';
    applySearch('');
    clearSelection();
    refreshLists();
    applyAcademicNodeStates();
    updateModeButtons();
    updateLayoutButtons();
    updateAcademicNotice();
    updateMarkers(Core.detailLevel(view.scale));
    // 同じ物質・同じ通常反応なら、切替後の座標で選択と詳細を保つ。学術だけの反応は閉じる。
    var keep = logical && modeHasEntity(logical.kind, logical.id);
    if (keep) {
      selectNode(logical.kind, logical.id);
      if (cardOpen) openCard(logical.kind, logical.id);
    } else if (cardOpen) {
      closeCard(false);
    }
    if (returnFocus && returnFocus.closest) {
      var hiddenNormal = !!returnFocus.closest('.rp-layout-normal') && mode === 'academic';
      var hiddenAcademic = !!returnFocus.closest('.rp-academic') && mode !== 'academic';
      if (hiddenNormal || hiddenAcademic) returnFocus = null;
    }
    if (options.fit !== false) animateTo(fitModeCanvasView());
    else render();
  }

  function readModeParam(search) {
    var raw = String(search == null ? '' : search);
    var value;
    try {
      value = new URLSearchParams(raw.charAt(0) === '?' ? raw.slice(1) : raw).get('mode');
    } catch (err) {
      return null;
    }
    return value === 'academic' ? 'academic' : null;
  }

  /* ---------------- initial render ---------------- */

  function buildNotice() {
    var summary = '物質 ' + D.meta.compoundCount + ' 件（うち高校化学の必須 ' + D.meta.requiredCount +
      ' 件）を収録。反応に関与する ' + D.meta.connectedCount + ' 物質と収録反応 ' +
      D.meta.reactionCount + ' 件' + (normalEvidenceBreakdown() ? '（' + normalEvidenceBreakdown() + '）' : '') +
      'を1つのネットワークとして配置し、残り ' +
      D.meta.isolatedCount + ' 物質は外縁の棚に表示しています。';
    var note = '確認できなかった反応 ' + D.meta.heldReactionCount +
      ' 件は公開データに含めていません。孤立ノードは、確認済みの経路が見つかっていないことを示し、「生成しない」という意味ではありません。' +
      (D.classMap ? ' ' + D.meta.classMapNote : '');
    var summaryEl = document.getElementById('rp-data-summary');
    var noteEl = document.getElementById('rp-data-note');
    if (summaryEl) summaryEl.textContent = summary;
    if (noteEl) noteEl.textContent = note;
    var status = document.getElementById('rp-data-status');
    if (status) {
      status.textContent = 'データ版 ' + D.meta.version + ' ／ 物質 ' + D.meta.compoundCount +
        ' 件 ／ 収録反応 ' + D.meta.reactionCount + ' 件（非公開の保留 ' +
        D.meta.heldReactionCount + ' 件）';
    }
    var scopeEl = document.getElementById('rp-scope-note');
    if (scopeEl) scopeEl.textContent = D.meta.scopeNote;
    var classNoteEl = document.getElementById('rp-classmap-note');
    if (classNoteEl && D.classMap) {
      classNoteEl.textContent = D.meta.classMapNote + ' 資料: ' + D.classMap.sourceBook +
        ' の各節（' + D.classMap.verifiedAt + ' 確認）。';
    }
    var dataEl = document.getElementById('rp-data-note-long');
    if (dataEl) {
      dataEl.textContent = D.meta.dataNote + ' 反応の根拠は ' + D.meta.sourceBook +
        ' の各節本文などを用い、資料名と確認日（' + D.meta.verifiedAt + '）を各反応のカードに記録しています。';
    }
  }

  function buildStates() {
    Object.keys(D.states).forEach(function (key) {
      var row = document.createElement('div');
      var dt = document.createElement('dt');
      dt.textContent = D.states[key].label;
      var dd = document.createElement('dd');
      dd.textContent = D.states[key].note;
      row.appendChild(dt);
      row.appendChild(dd);
      statesEl.appendChild(row);
    });
  }

  function buildRegionLegend() {
    var legendEl = document.getElementById('rp-region-legend');
    if (!legendEl) return;
    D.regions.forEach(function (region) {
      var li = document.createElement('li');
      var dot = document.createElement('span');
      dot.className = 'rp-region-legend__dot rp-c' + region.colorIndex;
      var name = document.createElement('span');
      name.textContent = region.name;
      var count = document.createElement('span');
      count.className = 'rp-region-legend__count';
      count.textContent = region.count;
      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(count);
      legendEl.appendChild(li);
    });
  }

  /* ---------------- 初期フォーカス（有機化学ビルダーからの深いリンク） ---------------- */

  // ?focus=ID は、ビルダーのカードから「反応経路マップで表示」で来たときだけ使う。
  // 壊れた値・長すぎる値は無視し、現在の俯瞰表示を維持する（fail-closed）。
  var FOCUS_PARAM_MAX = 256;

  function readFocusParam(search) {
    var raw = String(search == null ? '' : search);
    var focus;
    try {
      focus = new URLSearchParams(raw.charAt(0) === '?' ? raw.slice(1) : raw).get('focus');
    } catch (err) {
      return null;
    }
    if (focus == null) return null;
    if (!focus.length || focus.length > FOCUS_PARAM_MAX) return null;
    return focus;
  }

  // 反応経路マップに収録済みの物質IDだけを受け付ける（__proto__ / constructor 等を除外）。
  function ownsCompoundId(id) {
    return typeof id === 'string' &&
      Object.prototype.hasOwnProperty.call(compoundById, id);
  }

  // 初期表示の同期は、gotoEntity を使わない。scrollIntoView・アニメーション・起点への
  // フォーカス復帰を起こさず、表示位置を直接決めてカードを開く（起点の trigger は無い）。
  function applyInitialFocus() {
    var id = readFocusParam(window.location ? window.location.search : '');
    if (!id || !ownsCompoundId(id)) return false;
    var c = compoundAt(id);
    var scale = Math.max(view.scale, 0.92);
    setView(entityTarget({ x: c.x, y: c.y }, { w: nodeW(c), h: nodeH(c) }, scale), true);
    selectNode('compound', id);
    returnFocus = null;
    openCard('compound', id);
    return true;
  }

  function init() {
    measure();
    buildConnectors();
    normalGrouping = buildReactionGrouping(D.reactions);
    buildReactions();
    initAcademicData();
    buildAcademic();
    // 新しい配置案は検証だけ行い、DOM は初回選択時に作る（学術 DOM と同時に持たない）。
    initProposedLayout();
    buildNodes();
    buildClassMap();
    ensureActiveLayer();
    buildChips();
    buildLists();
    buildNotice();
    buildStates();
    buildRegionLegend();
    // チップを並べた後の実際のツールバー高さで、最初の全体表示を合わせる。
    syncToolbarInset();
    setView(fitCanvasView(), false);

    // 表示モード。既定は通常。URL の ?mode=academic は有効な学術データがあるときだけ受け付ける。
    svg.setAttribute('data-mode', 'normal');
    mapEl.setAttribute('data-mode', 'normal');
    // 配置は既定で現在の配置（ブラウザ保存・URL へは保存しない）。
    layoutChoice = 'current';
    svg.setAttribute('data-layout', 'current');
    mapEl.setAttribute('data-layout', 'current');
    var normalModeButton = modeButton('normal');
    var academicModeButton = modeButton('academic');
    if (normalModeButton) normalModeButton.addEventListener('click', function () { setMode('normal'); });
    if (academicModeButton) {
      academicModeButton.addEventListener('click', function () { setMode('academic'); });
    }
    var currentLayoutButton = layoutButton('current');
    var proposedLayoutButton = layoutButton('proposed');
    if (currentLayoutButton) {
      currentLayoutButton.addEventListener('click', function () { setLayoutChoice('current'); });
    }
    if (proposedLayoutButton) {
      proposedLayoutButton.addEventListener('click', function () { setLayoutChoice('proposed'); });
    }
    updateModeButtons();
    updateLayoutButtons();
    updateAcademicNotice();
    if (academicEnabled && readModeParam(window.location ? window.location.search : '') === 'academic') {
      // ?mode=academic は先にモードを決め、その学術座標で ?focus= を同期する。
      setMode('academic', { fit: false });
      setView(fitModeCanvasView(), false);
    } else {
      syncNodeProjection();
      syncModeLayers();
    }

    mapEl.addEventListener('pointerdown', onPointerDown);
    mapEl.addEventListener('pointermove', onPointerMove);
    mapEl.addEventListener('pointerup', onPointerUp);
    mapEl.addEventListener('pointercancel', onPointerCancel);
    // ブラウザ都合で capture が失われても、押下状態を残さず最後の位置で確定する。
    mapEl.addEventListener('lostpointercapture', onLostPointerCapture);
    svg.addEventListener('focusin', onFocusIn);
    mapEl.addEventListener('wheel', onWheel, { passive: false });
    mapEl.addEventListener('keydown', onKeydown);
    mapEl.addEventListener('dblclick', function (e) {
      // 実体（線・矢印・ラベル・物質・一般図）の上のダブルクリックは、地図を拡大しない。
      // 1回目のクリックで開いたカードの操作をそのまま優先する（応答を遅らせない）。
      // pointer capture で dblclick.target が #rp-map に変わっても、実座標で判定し直す。
      if (e.target.closest && e.target.closest('.rp-position')) return;
      var decided = resolvePhysicalAt(e.clientX, e.clientY);
      var isEntity = decided.type === 'entity' || decided.type === 'line';
      var isControl = decided.type === 'control';
      if (Core.dblclickAction(isEntity, isControl) !== 'zoom') return;
      if (activeRegion) clearRegionSelection();
      var p = mapPoint(e);
      animateTo(Core.zoomAt({ scale: view.scale, x: view.x, y: view.y }, 1.6, p.x, p.y));
    });

    document.getElementById('rp-zoom-in').addEventListener('click', function () { zoomCenter(1.25); });
    document.getElementById('rp-zoom-out').addEventListener('click', function () { zoomCenter(1 / 1.25); });
    document.getElementById('rp-reset').addEventListener('click', resetView);
    var classJump = document.getElementById('rp-classmap-jump');
    if (classJump) {
      if (!classMapData) classJump.hidden = true;
      else classJump.addEventListener('click', function (e) { focusClassMap(e.detail === 0); });
    }
    if (aboutButton && aboutEl) aboutButton.addEventListener('click', openAbout);
    if (aboutClose && aboutEl) aboutClose.addEventListener('click', function () { closeAbout(); });
    cardClose.addEventListener('click', function () { closeCard(true); });
    if (eqDialogEl) {
      eqDialogEl.addEventListener('close', onEquationDialogClose);
      if (eqDialogClose) {
        eqDialogClose.addEventListener('click', function () { closeEquationDialog(true); });
      }
    }
    positionTrigger.addEventListener('click', function () {
      if (positionPopover.hidden) openPositionPopover();
      else closePositionPopover(true);
    });

    cardDetail.addEventListener('click', function (e) {
      // 式の拡大は、カード内の他の操作（反応・物質リンク）より先に処理する。
      var eqTrigger = e.target.closest ? e.target.closest('[data-eq-open]') : null;
      if (eqTrigger) {
        e.preventDefault();
        openEquationDialog(eqTrigger);
        return;
      }
      var action = e.target.closest ? e.target.closest('button[data-action="fit-reaction"]') : null;
      if (action) {
        e.preventDefault();
        fitReactionEndpoints(action.getAttribute('data-id'));
        return;
      }
      var target = e.target.closest ? e.target.closest('button[data-kind]') : null;
      if (!target) return;
      var kind = target.getAttribute('data-kind');
      var id = target.getAttribute('data-id');
      selectNode(kind, id);
      openCard(kind, id);
    });

    // カード内の反応項目をなぞると、その反応の辺だけを連続ストロークで上層表示する。
    function previewFromEvent(e) {
      var btn = e.target.closest ? e.target.closest('button[data-kind="reaction"]') : null;
      if (!btn) return;
      previewReaction = btn.getAttribute('data-id');
      showReactionStroke(previewReaction);
    }
    function endPreview(e) {
      var btn = e.target.closest ? e.target.closest('button[data-kind="reaction"]') : null;
      if (!btn) return;
      previewReaction = null;
      restoreReactionStroke();
    }
    cardDetail.addEventListener('pointerover', previewFromEvent);
    cardDetail.addEventListener('pointerout', endPreview);
    cardDetail.addEventListener('focusin', previewFromEvent);
    cardDetail.addEventListener('focusout', endPreview);

    // カード外のクリックで閉じる（カード内の操作は閉じない）
    document.addEventListener('pointerdown', function () { suppressCompatFocus = false; }, true);
    document.addEventListener('pointerdown', function (e) {
      if (card.hidden) return;
      // 拡大ダイアログはモーダル。背景のカードを外側クリックで閉じない。
      if (eqDialogEl && eqDialogEl.open) return;
      if (card.contains(e.target)) return;
      // クリック自体でフォーカスが動くため、復帰は pointerup の後に行う
      prepareCardFocusRestore();
    }, true);

    // カード外を押した時点では閉じるだけにし、起点への復帰は pointerup の後へ回す
    // （押下自体のフォーカス移動に奪われないように）。
    function prepareCardFocusRestore() {
      restoreAfterPointer = returnFocus;
      closeCard(false);
    }

    // 押した場所が実体（物質・反応・一般図）なら、直後の pointerup で新しいカードが開き、
    // その見出しへフォーカスが移る。この場合に前の起点へ戻すと、古い（画面外のこともある）
    // 印へ表示が飛ぶため戻さない。何も無い場所を押して閉じたときだけ起点へ戻す。
    function onDocumentPointerUpRestoreFocus(e) {
      var target = restoreAfterPointer;
      restoreAfterPointer = null;
      if (!target || !document.contains(target)) return;
      if (!card.hidden) return;
      if (downEntity) return;
      // 戻すときも表示位置・スクロールは動かさない。
      if (!focusWithoutRecentering(target)) target.focus();
      // タッチの互換mousedownは pointerup の後に来てフォーカスをBODYへ戻す。
      // 次の1回だけ、非操作要素へのmousedown既定動作を止めて起点focusを保つ。
      if (e.pointerType === 'touch' || e.pointerType === 'pen') suppressCompatFocus = true;
    }

    document.addEventListener('pointerup', onDocumentPointerUpRestoreFocus, true);

    document.addEventListener('mousedown', function (e) {
      if (!suppressCompatFocus) return;
      suppressCompatFocus = false;
      var interactive = e.target && e.target.closest
        ? e.target.closest('a,button,input,select,textarea,summary,[tabindex],[contenteditable],[role="button"]')
        : null;
      if (interactive) return;
      e.preventDefault();
    }, true);

    // 現在位置の全文popoverも、外側のクリックで閉じる（popover内の操作では閉じない）
    document.addEventListener('pointerdown', function (e) {
      if (positionPopover.hidden) return;
      if (positionEl.contains(e.target)) return;
      closePositionPopover(false);
    }, true);

    // 全文popoverは地図の上に浮かぶ。中のスクロールと選択を地図のパン・ズームから守る。
    // （wheel は mapEl のリスナーへ渡さない。指スクロールは祖先の touch-action: none のため自前で行う）
    positionPopover.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
    positionPopover.addEventListener('pointerdown', onPopoverPointerDown);
    positionPopover.addEventListener('pointermove', onPopoverPointerMove);
    positionPopover.addEventListener('pointerup', onPopoverPointerUp);
    positionPopover.addEventListener('pointercancel', onPopoverPointerUp);

    // キーボード操作では、ポインタ由来の focusin 抑制を持ち越さない（Tab の追随を妨げない）。
    function onDocumentKeydown(e) {
      pointerFocusGuard = false;
      if (e.key === 'Escape') {
        // ダイアログの Escape は native の閉じ処理に任せる（フォーカスも native が戻す）。
        if (eqDialogEl && eqDialogEl.open) return;
        if (aboutEl && aboutEl.open) return;
        if (!positionPopover.hidden) {
          e.preventDefault();
          closePositionPopover(true);
          return;
        }
        if (!card.hidden) {
          e.preventDefault();
          closeCard(true);
        }
      }
    }
    document.addEventListener('keydown', onDocumentKeydown);

    searchInput.addEventListener('input', function () { applySearch(searchInput.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        focusFirstResult();
      }
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applySearch('');
      }
    });

    window.addEventListener('resize', function () {
      // 画面幅が変わったら、古い寸法の拡大表示は閉じる（次のtapで開き直す）。
      if (eqDialogEl && eqDialogEl.open) closeEquationDialog(false);
      measure();
      syncToolbarInset();
      syncPositionInset();
      if (!positionPopover.hidden) syncPositionPopoverBox();
      setView(view, true);
    });
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(function () {
          measure();
          syncToolbarInset();
          syncPositionInset();
          if (!positionPopover.hidden) syncPositionPopoverBox();
          setView(view, true);
        }).observe(mapEl);
        // 文字サイズや2行の折返しが変わっても、「一般図へ」の導線との重なりを作らない。
        new ResizeObserver(function () { syncPositionInset(); }).observe(positionEl);
        // 浮遊する操作群の折り返しが変わったら、fit 用の上余白だけを測り直す（現在の表示は動かさない）。
        if (toolbarEl) new ResizeObserver(function () { syncToolbarInset(); }).observe(toolbarEl);
      } catch (err) { errMsg(err && err.message); }
    }
    syncToolbarInset();
    syncPositionInset();
    // 寸法の実測が終わった後で、?focus= の物質へ1回だけ同期する。
    // 以後の ResizeObserver は現在の view を保持する（fit へ巻き戻さない）。
    applyInitialFocus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
