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
  var Core = window.RPMapCore;
  var SD = window.RPStructure;
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
  var regionHub = {};
  D.compounds.forEach(function (c) {
    if (!c.hub) return;
    var region = regionsById[c.region];
    if (!region) return;
    var center = region.center || { x: 0, y: 0 };
    var dx = c.x + nodeW(c) / 2 - center.x;
    var dy = c.y + nodeH(c) / 2 - center.y;
    var distance = Math.hypot(dx, dy);
    if (!regionHub[c.region] || distance < regionHub[c.region].distance) {
      regionHub[c.region] = { compound: c, distance: distance };
    }
  });

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
  var reactionConnectors = {};
  var classMapData = D.classMap || null;
  if (classMapData) {
    classMapData.nodes.forEach(function (n) { classNodeById[n.id] = n; });
    classMapData.edges.forEach(function (e) { classEdgeById[e.id] = e; });
  }
  var activeEdgeLayer = null;
  var previewReaction = null;
  var view = { scale: 1, x: 0, y: 0 };
  var viewSize = { w: 1, h: 1 };
  var selected = null;
  var activeRegion = null;
  var returnFocus = null;
  var programmaticFocusTarget = null;
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
    var secondaryLayer = el('g', { 'class': 'rp-edges rp-edges--secondary' });
    var primaryLayer = el('g', { 'class': 'rp-edges rp-edges--primary' });
    // 見えない当たり判定の層は、可視線の上・反応ラベル（marker）の下に置く。
    // 反応ラベルと物質ノードのタップは無条件で優先される（後から描くため）。
    var hitLayer = el('g', { 'class': 'rp-edge-hits', 'aria-hidden': 'true' });
    var markerLayer = el('g', { 'class': 'rp-reactions' });
    var hitShapes = {};
    var hitOrder = {};
    D.reactions.forEach(function (r, reactionOrder) {
      var tier = r.tier === 'primary' ? 'primary' : 'secondary';
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
        c.edgeKeys.forEach(function (key) { edgeIndex[key] = path; });
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
      var g = el('g', {
        'class': 'rp-reaction rp-reaction--' + tier + (r.state === 'confirmed' ? '' : ' is-pending'),
        'data-kind': 'reaction',
        'data-id': r.id,
        'data-tier': tier,
        role: 'button',
        tabindex: '0',
        'aria-label': reactionLabel(r)
      });
      g.appendChild(el('circle', { 'class': 'rp-reaction__dot', cx: r.x, cy: r.y, r: 6 }));
      if (r.label) {
        var label = el('text', {
          'class': 'rp-reaction__label',
          x: r.label.type.x,
          y: r.label.type.y,
          'text-anchor': 'middle'
        });
        label.textContent = r.typeLabel;
        g.appendChild(label);
        if (r.conditions && r.label.cond) {
          var cond = el('text', {
            'class': 'rp-reaction__label rp-reaction__label--cond',
            x: r.label.cond.x,
            y: r.label.cond.y,
            'text-anchor': 'middle'
          });
          cond.textContent = Core.shorten(r.conditions, 16);
          g.appendChild(cond);
        }
      }
      markerLayer.appendChild(g);
      reactionIndex[r.id] = g;
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

  /* ---------------- transform ---------------- */

  function measure() {
    var rect = svg.getBoundingClientRect();
    viewSize.w = Math.max(1, rect.width || mapEl.clientWidth || 1);
    viewSize.h = Math.max(1, rect.height || mapEl.clientHeight || 1);
  }

  function setView(next, clamp) {
    // ホイール以外の操作（パン・ピンチ・キー・ボタン・fit・resize）が入ったら、
    // 途中のホイール目標は捨てる。古い目標へ戻る「巻き戻り」を起こさない。
    if (!wheelApplying) cancelWheelZoom();
    view = clamp ? Core.clampPan(next, viewSize.w, viewSize.h, D.meta.canvas) : next;
    render();
  }

  function render() {
    viewport.setAttribute('transform', 'translate(' + view.x.toFixed(2) + ' ' + view.y.toFixed(2) + ') scale(' + view.scale.toFixed(4) + ')');
    var level = Core.detailLevel(view.scale);
    if (lastLevel !== level) {
      lastLevel = level;
      mapEl.setAttribute('data-level', String(level));
      mapEl.setAttribute('data-detail', Core.levelNote(level));
      updateMarkers(level);
      // 「一般図へ」の表示/非表示が変わると右下の予約寸法も変わる。
      syncPositionInset();
    }
    updateOverlay(level);
    updatePosition(level);
  }

  function updateMarkers(level) {
    var small = level === 0;
    D.reactions.forEach(function (r) {
      var g = reactionIndex[r.id];
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

  /* 一般図の見出し（HTML overlay）。ノードの上に重ねない。
     分類ノード・具体図の全物質・表示中の反応ラベル・現在位置・「一般図へ」と重ならない
     スクリーン位置を探し、無ければ題名だけの小さな見出し、それでも無ければ出さない。 */
  var captionMetrics = { key: '', w: 0, h: 0 };
  // 反応ラベルの world bbox（拡大率に依存しない）。表示中のときだけ測って使い回す。
  var reactionLabelWorld = null;

  function ensureReactionLabelBoxes() {
    if (reactionLabelWorld) return reactionLabelWorld;
    var boxes = {};
    try {
      D.reactions.forEach(function (r) {
        var g = reactionIndex[r.id];
        if (!g) return;
        var texts = g.querySelectorAll('.rp-reaction__label');
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        for (var i = 0; i < texts.length; i += 1) {
          var b = texts[i].getBBox();
          if (!b.width || !b.height) continue;
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        }
        if (minX === Infinity) return;
        boxes[r.id] = {
          x: minX,
          y: minY,
          w: Math.max(1, maxX - minX),
          h: Math.max(1, maxY - minY)
        };
      });
    } catch (err) {
      return null;
    }
    if (!Object.keys(boxes).length) return null; // 低倍率でラベルが隠れている間は測れない
    reactionLabelWorld = boxes;
    return boxes;
  }

  function classMapCaptionSize(heading, key) {
    if (captionMetrics.key === key) return { w: captionMetrics.w, h: captionMetrics.h };
    var w = heading.offsetWidth;
    var h = heading.offsetHeight;
    if (w > 0 && h > 0) captionMetrics = { key: key, w: w, h: h };
    return { w: w, h: h };
  }

  function rectHit(a, b, pad) {
    var p = typeof pad === 'number' ? pad : 1;
    return a.x < b.x + b.w + p && b.x < a.x + a.w + p &&
      a.y < b.y + b.h + p && b.y < a.y + a.h + p;
  }

  // 見出しを置けない障害物（いま画面に見えているものだけ）を集める。
  function captionBlockers(box) {
    var list = [];
    function add(x, y, w, h) {
      if (!(w > 0 && h > 0)) return;
      if (x > box.right || y > box.bottom || x + w < box.left || y + h < box.top) return;
      list.push({ x: x, y: y, w: w, h: h });
    }
    if (classMapData) {
      classMapData.nodes.forEach(function (n) {
        var p = Core.worldToScreen(view, n.x, n.y);
        add(p.x, p.y, n.w * view.scale, n.h * view.scale);
      });
    }
    // 具体図の物質（427件）。表示中のものだけ、ラベルがはみ出す分を少し広げる。
    var padPx = 4;
    D.compounds.forEach(function (c) {
      var p = Core.worldToScreen(view, c.x, c.y);
      add(p.x - padPx, p.y - padPx, nodeW(c) * view.scale + padPx * 2, nodeH(c) * view.scale + padPx * 2);
    });
    // 反応ラベルは低倍率では非表示。表示されるときだけ、world bbox を画面へ写す。
    if (Core.detailLevel(view.scale) > 0) {
      var labels = ensureReactionLabelBoxes();
      if (labels) {
        Object.keys(labels).forEach(function (id) {
          var b = labels[id];
          var p = Core.worldToScreen(view, b.x, b.y);
          add(p.x - 2, p.y - 2, b.w * view.scale + 4, b.h * view.scale + 4);
        });
      }
    }
    if (positionBox.w && positionBox.h) {
      add(viewSize.w - 12 - positionBox.w, viewSize.h - 12 - positionBox.h, positionBox.w, positionBox.h);
    }
    if (jumpBox.w && jumpBox.h) {
      add(viewSize.w - 12 - jumpBox.w,
        viewSize.h - (12 + (positionBox.h || 0) + 10) - jumpBox.h, jumpBox.w, jumpBox.h);
    }
    return list;
  }

  function classMapCaptionSlot(frameScreen, size, box, blockersIn) {
    if (!(size.w > 0 && size.h > 0)) return null;
    var blockers = blockersIn || captionBlockers(box);
    var right = frameScreen.x + frameScreen.w;
    var bottom = frameScreen.y + frameScreen.h;
    var raw = [
      { x: frameScreen.x + 8, y: frameScreen.y - size.h - 6 },
      { x: frameScreen.x + 8, y: bottom + 6 },
      { x: frameScreen.x + 8, y: frameScreen.y + 8 },
      { x: right - size.w - 8, y: frameScreen.y + 8 },
      { x: frameScreen.x + 8, y: bottom - size.h - 8 },
      { x: right - size.w - 8, y: bottom - size.h - 8 },
      { x: frameScreen.x + 8, y: frameScreen.y + frameScreen.h * 0.35 },
      { x: right - size.w - 8, y: frameScreen.y + frameScreen.h * 0.35 },
      { x: frameScreen.x + 8, y: frameScreen.y + frameScreen.h * 0.62 },
      { x: right - size.w - 8, y: frameScreen.y + frameScreen.h * 0.62 },
      { x: 8, y: 8 },
      { x: viewSize.w - size.w - 8, y: 8 },
      { x: 8, y: viewSize.h - size.h - 8 },
      { x: viewSize.w - size.w - 8, y: viewSize.h - size.h - 8 }
    ];
    for (var i = 0; i < raw.length; i += 1) {
      var x = Math.round(Math.min(Math.max(raw[i].x, 4), viewSize.w - 4 - size.w));
      var y = Math.round(raw[i].y);
      var rect = { x: x, y: y, w: size.w, h: size.h };
      if (rect.x < 4 || rect.y < 4 || rect.x + rect.w > viewSize.w - 4 || rect.y + rect.h > viewSize.h - 4) continue;
      var blocked = false;
      for (var b = 0; b < blockers.length && !blocked; b += 1) {
        if (rectHit(rect, blockers[b])) blocked = true;
      }
      if (!blocked) return rect;
    }
    return null;
  }

  function updateOverlay(level) {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    var box = visibleBox();
    var placed = [];
    if (classMapData) {
      var frame = classMapData.frame;
      var frameScreen = {
        x: view.x + frame.x * view.scale,
        y: view.y + frame.y * view.scale,
        w: frame.w * view.scale,
        h: frame.h * view.scale
      };
      if (frameScreen.x < box.right && frameScreen.y < box.bottom &&
        frameScreen.x + frameScreen.w > box.left && frameScreen.y + frameScreen.h > box.top) {
        var heading = document.createElement('div');
        heading.className = 'rp-overlay__classmap';
        var maxWidth = Math.min(340, Math.max(160, viewSize.w - 24));
        heading.style.maxWidth = maxWidth + 'px';
        heading.style.visibility = 'hidden';
        var strong = document.createElement('strong');
        strong.textContent = classMapData.title;
        var note = document.createElement('span');
        note.textContent = classMapData.note;
        heading.appendChild(strong);
        heading.appendChild(note);
        overlay.appendChild(heading);
        var themeKey = document.documentElement.getAttribute('data-theme') || 'default';
        var size = classMapCaptionSize(heading, maxWidth + '|' + themeKey);
        var blockers = captionBlockers(box);
        var slot = classMapCaptionSlot(frameScreen, size, box, blockers);
        if (!slot) {
          // 全2行が入らないときは題名だけの小さな見出し（副説明はデータ欄・カードにある）。
          heading.removeChild(note);
          heading.classList.add('is-title-only');
          size = classMapCaptionSize(heading, maxWidth + '|title|' + themeKey);
          slot = classMapCaptionSlot(frameScreen, size, box, blockers);
        }
        if (slot) {
          heading.style.left = slot.x + 'px';
          heading.style.top = slot.y + 'px';
          heading.style.visibility = '';
          placed.push({ x: slot.x, y: slot.y, w: slot.w, h: slot.h });
        } else {
          // どの位置でも既存のノード・ラベルに重なる場合だけ出さない。
          // 識別は現在位置の「官能基変換の一般図」表示と「一般図へ」の導線が担う。
          heading.style.display = 'none';
        }
      }
    }
    if (level === 0 && view.scale >= 0.15) {
      D.regions.forEach(function (region) {
        var picked = regionHub[region.id];
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
      D.reactions.forEach(function (r) {
        if (!r.label) return;
        var g = reactionIndex[r.id];
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
      D.compounds.forEach(function (c) {
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
      D.reactions.forEach(function (r) {
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
          placed.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
          break;
        }
      });
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
      text = Core.positionText(view, D.regions, D.compounds, selectedInfo, D.meta.canvas, viewSize.w, viewSize.h, activeRegion);
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
    var next = Core.zoomAt(view, factor, viewSize.w / 2, viewSize.h / 2);
    setView(next, true);
  }

  function resetView() {
    var fit = Core.fitTransform(D.meta.canvas, viewSize.w, viewSize.h, 14);
    clearRegionSelection();
    clearSelection();
    animateTo(fit);
  }

  function focusClassMap(focusFirst) {
    if (!classMapData) return;
    clearRegionSelection();
    clearSelection();
    // 狭い画面でも外枠・注記が切れないよう、fit 倍率に下限を設けない。文字の読解は後から拡大する。
    // 上は一般図の見出し（HTML overlay）、下は右下の現在位置と「一般図へ」の帯を予約し、
    // fit した全図と注記がフローティングに覆われないようにする。
    var reserveTop = (captionMetrics.h >= 20 ? captionMetrics.h : 40) + 12;
    var posH = positionBox.h || 48;
    var jumpH = jumpBox.h || 0;
    function fitWithBottom(bottom) {
      var innerH = Math.max(140, viewSize.h - reserveTop - bottom);
      var box = Core.fitRect(classMapData.area, viewSize.w, innerH, 14, 0, 1.2);
      box.y += reserveTop;
      return Core.clampPan(box, viewSize.w, viewSize.h, D.meta.canvas);
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

  function pointerList() {
    return Object.keys(pointers).map(function (k) { return pointers[k]; });
  }

  function mapPoint(e) {
    var rect = mapEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // 反応・一般図の変換・物質のフォーカス可能な実体。透明ヒットは使わない。
  function entityElement(kind, id) {
    if (kind === 'reaction') return reactionIndex[id] || null;
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
    for (var i = 0; i < hitCandidates.length; i++) {
      var c = hitCandidates[i];
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
    for (var i = 0; i < hitCandidates.length; i++) {
      var c = hitCandidates[i];
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
    cancelWheelZoom();
    var p = mapPoint(e);
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
      setView(next, true);
      suppressClick = true;
      return;
    }
    if (!panOrigin) return;
    var dx = p.x - panOrigin.x;
    var dy = p.y - panOrigin.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      suppressClick = true;
      if (activeRegion) clearRegionSelection();
    }
    setView({ scale: panOrigin.view.scale, x: panOrigin.view.x + dx, y: panOrigin.view.y + dy }, true);
  }

  function onPointerUp(e) {
    delete pointers[e.pointerId];
    if (mapEl.releasePointerCapture) {
      try { mapEl.releasePointerCapture(e.pointerId); } catch (err) { errMsg(err && err.message); }
    }
    if (!pointerList().length) {
      // ポインタを押した対象が物質・反応で、動いていなければ詳細を開く。
      // （ポインタキャプチャで click の宛先が変わることがあるため、pointerup で判定する）
      if (!suppressClick && downEntity) openFromElement(downEntity);
      panOrigin = null;
      pinchOrigin = null;
      downEntity = null;
      mapEl.classList.remove('is-panning');
    } else if (pointerList().length === 1) {
      pinchOrigin = null;
      var p = pointerList()[0];
      panOrigin = { x: p.x, y: p.y, view: { scale: view.scale, x: view.x, y: view.y } };
    }
  }

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
    wheelZoom = Core.clampPan(next, viewSize.w, viewSize.h, D.meta.canvas);
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
    // focusClassMap が全体fit直後に移したプログラムfocusだけ、画面外判定の再センタリングをしない。
    // 通常の Tab 移動（別のnode・別の機会）は従来どおり追随する。
    if (programmaticFocusTarget) {
      var pending = programmaticFocusTarget;
      programmaticFocusTarget = null;
      if (pending === target || (pending.contains && pending.contains(target))) return;
    }
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
    var c = kind === 'compound' ? compoundById[id] : findReaction(id);
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

  function openFromElement(target) {
    var kind = target.getAttribute('data-kind');
    var id = target.getAttribute('data-id');
    returnFocus = target;
    selectNode(kind, id);
    openCard(kind, id);
  }

  function fitReactionEndpoints(id) {
    var r = findReaction(id);
    if (!r) return;
    clearRegionSelection();
    var ids = {};
    r.substrates.concat(r.products).forEach(function (cid) { ids[cid] = true; });
    var minX = r.x - 30;
    var minY = r.y - 30;
    var maxX = r.x + 30;
    var maxY = r.y + 30;
    Object.keys(ids).forEach(function (cid) {
      var c = compoundById[cid];
      if (!c) return;
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + nodeW(c));
      maxY = Math.max(maxY, c.y + nodeH(c));
    });
    var target = Core.fitRect(
      { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) },
      viewSize.w, viewSize.h, 44, 0.08, 1.5
    );
    animateTo(Core.clampPan(target, viewSize.w, viewSize.h, D.meta.canvas));
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
    var elm = kind === 'compound' ? nodeIndex[id] : reactionIndex[id];
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
    Object.keys(edgeIndex).forEach(function (key) {
      var path = edgeIndex[key];
      var active = false;
      if (selected) {
        active = selected.kind === 'compound'
          ? Core.compoundList(path.getAttribute('data-compounds'), path.getAttribute('data-compound'))
            .indexOf(selected.id) !== -1
          : selected.kind === 'reaction' && path.getAttribute('data-reaction') === selected.id;
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
    var r = findReaction(id);
    var layer = ensureActiveLayer();
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!r) return;
    // 通常表示と同じ connector を使う。選択・プレビューで端点や矢印の向きを変えない。
    (reactionConnectors[r.id] || []).forEach(function (c) {
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
    var html;
    if (kind === 'compound') html = compoundCard(id);
    else if (kind === 'class') html = classCard(id);
    else if (kind === 'class-edge') html = classEdgeCard(id);
    else html = reactionCard(id);
    if (!html) return;
    cardEyebrow.textContent = kind === 'compound' ? '物質'
      : kind === 'class' ? '一般図'
        : kind === 'class-edge' ? '一般図の変換' : '反応';
    cardDetail.innerHTML = html;
    card.hidden = false;
    var heading = cardDetail.querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  }

  function closeCard(restore) {
    if (card.hidden) return;
    card.hidden = true;
    previewReaction = null;
    cardDetail.innerHTML = '';
    restoreReactionStroke();
    if (restore !== false && returnFocus && document.contains(returnFocus)) {
      returnFocus.focus();
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
    var ins = (incoming[id] || []).slice().sort(byTypeThenId);
    var outs = (outgoing[id] || []).slice().sort(byTypeThenId);
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
    if (c.pathState === 'covered') {
      html += '<p class="rp-verification">反応経路: 製法 ' + ins.length + ' 件・生成先 ' + outs.length +
        ' 件を、確認済みの反応から表示しています。</p>';
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

  function equationSpeciesSvg(item) {
    var svg = SD.renderStructure(item.structure, '一般構造');
    var geo = SD.svgGeometry(svg);
    if (!geo) throw new Error('一般構造の寸法を読めません');
    var inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    return { geo: geo, inner: inner };
  }

  // 反応物・生成物の custom spec を1枚の SVG に並べ、係数・＋・矢印を付ける。
  // 各構造は既存 renderStructure の出力（viewBox と内容）を平行移動・縮小して使う。
  function buildEquationSvg(eq, ariaLabel) {
    var ROW = 120;
    var PAD = 16;
    var itemGap = 10;
    var plusGap = 26;
    var arrowW = 64;
    var sides = [eq.left || [], eq.right || []];
    var prepared = sides.map(function (items) {
      return items.map(function (item) {
        var drawn = equationSpeciesSvg(item);
        var scale = Math.min(1.2, ROW / Math.max(1, drawn.geo.height));
        var width = drawn.geo.width * scale;
        if (width > 250) {
          scale *= 250 / width;
          width = 250;
        }
        return {
          coef: item.coef,
          inner: drawn.inner,
          geo: drawn.geo,
          scale: scale,
          width: width
        };
      });
    });

    var cursor = PAD;
    var placed = [];
    var ops = [];
    prepared.forEach(function (items, sideIndex) {
      var sidePlaced = [];
      items.forEach(function (item, i) {
        if (i > 0) {
          ops.push({ type: 'plus', x: cursor + plusGap / 2 });
          cursor += plusGap;
        }
        var coefW = item.coef > 1 ? 18 : 0;
        var x = cursor;
        var sx = x + coefW;
        var top = (ROW - item.geo.height * item.scale) / 2 + PAD;
        placed.push({ item: item, x: sx, y: top });
        sidePlaced.push({ item: item, x: sx, coefX: x + coefW / 2 });
        cursor += coefW + item.width + itemGap;
      });
      prepared[sideIndex] = sidePlaced;
      if (sideIndex === 0) {
        ops.push({ type: 'arrow', x: cursor + arrowW / 2, arrow: eq.arrow });
        cursor += arrowW;
      }
    });
    var width = Math.max(180, cursor - itemGap + PAD);
    var height = ROW + PAD * 2;
    var out = '<svg class="rp-struct-svg rp-eq-svg" viewBox="0 0 ' + width.toFixed(1) + ' ' + height.toFixed(1) +
      '" role="img" aria-label="' + esc(ariaLabel) + '" preserveAspectRatio="xMidYMid meet">';
    out += '<g class="rp-eq-species">';
    placed.forEach(function (p) {
      var item = p.item;
      out += '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') scale(' +
        item.scale.toFixed(4) + ') translate(' + (-item.geo.x).toFixed(1) + ' ' + (-item.geo.y).toFixed(1) + ')">' +
        item.inner + '</g>';
    });
    out += '</g>';
    prepared.forEach(function (items) {
      items.forEach(function (p) {
        if (p.item.coef > 1) {
          out += '<text x="' + (p.coefX || p.x).toFixed(1) + '" y="' + (height / 2 + 7).toFixed(1) +
            '" text-anchor="middle" class="rp-eq-coef">' + esc(p.item.coef) + '</text>';
        }
      });
    });
    var midY = height / 2;
    ops.forEach(function (op) {
      if (op.type === 'plus') {
        out += '<text x="' + op.x.toFixed(1) + '" y="' + midY.toFixed(1) +
          '" text-anchor="middle" dominant-baseline="middle" class="rp-eq-op">＋</text>';
        return;
      }
      if (op.arrow === 'equilibrium') {
        out += '<g class="rp-eq-arrow"><path class="rp-eq-arrow-line" d="M' + (op.x - 22).toFixed(1) + ',' + (midY - 4).toFixed(1) +
          ' L' + (op.x + 22).toFixed(1) + ',' + (midY - 4).toFixed(1) +
          ' M' + (op.x + 22).toFixed(1) + ',' + (midY + 4).toFixed(1) +
          ' L' + (op.x - 22).toFixed(1) + ',' + (midY + 4).toFixed(1) + '"/>' +
          '<path class="rp-eq-arrow-line" d="M' + (op.x + 22).toFixed(1) + ',' + (midY - 4).toFixed(1) +
          ' L' + (op.x + 14).toFixed(1) + ',' + (midY - 9).toFixed(1) +
          ' M' + (op.x + 22).toFixed(1) + ',' + (midY - 4).toFixed(1) +
          ' L' + (op.x + 14).toFixed(1) + ',' + (midY + 1).toFixed(1) +
          ' M' + (op.x - 22).toFixed(1) + ',' + (midY + 4).toFixed(1) +
          ' L' + (op.x - 14).toFixed(1) + ',' + (midY - 1).toFixed(1) +
          ' M' + (op.x - 22).toFixed(1) + ',' + (midY + 4).toFixed(1) +
          ' L' + (op.x - 14).toFixed(1) + ',' + (midY + 9).toFixed(1) + '"/></g>';
        return;
      }
      out += '<g class="rp-eq-arrow"><path class="rp-eq-arrow-line" d="M' + (op.x - 24).toFixed(1) + ',' + midY.toFixed(1) +
        ' L' + (op.x + 20).toFixed(1) + ',' + midY.toFixed(1) + '"/>' +
        '<path class="rp-eq-arrow-head" d="M' + (op.x + 24).toFixed(1) + ',' + midY.toFixed(1) +
        ' L' + (op.x + 14).toFixed(1) + ',' + (midY - 7).toFixed(1) +
        ' L' + (op.x + 14).toFixed(1) + ',' + (midY + 7).toFixed(1) + ' Z"/></g>';
    });
    out += '</svg>';
    return out;
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
      svg = buildEquationSvg(edge.equation, aria);
    } catch (err) {
      return '<figure class="rp-struct rp-struct--fallback"><figcaption class="rp-struct__caption">一般反応式（構造式）</figcaption>' +
        '<p class="rp-struct__note">一般反応式を表示できませんでした。</p></figure>';
    }
    var vb = /viewBox="([^"]+)"/.exec(svg);
    var width = vb ? parseFloat(String(vb[1]).trim().split(/\s+/)[2]) : 0;
    var wide = width > 460;
    var style = wide ? ' style="--rp-struct-width:' + Math.ceil(width) + 'px"' : '';
    return '<figure class="rp-struct' + (wide ? ' rp-struct--wide' : '') + '">' +
      '<figcaption class="rp-struct__caption">一般反応式（構造式）</figcaption>' +
      '<div class="rp-struct__canvas"' + style + '>' + svg + '</div>' +
      '<p class="rp-struct__note">係数・副生成物・矢印を含む一般化した反応式です。具体物質の反応条件を示すものではありません。</p>' +
      '</figure>';
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

  function reactionCard(id) {
    var r = null;
    for (var i = 0; i < D.reactions.length; i++) if (D.reactions[i].id === id) r = D.reactions[i];
    if (!r) return '';
    var type = D.types[r.type] || { label: r.typeLabel, summary: '', schematic: '' };
    var subText = r.substrates.map(compoundName).join(' ＋ ');
    var prodText = r.products.length ? r.products.map(compoundName).join(' ＋ ') : (r.productNote || '生成物の記載なし');
    var subs = r.substrates.map(compoundInline).join(' ＋ ');
    var prods = r.products.length ? r.products.map(compoundInline).join(' ＋ ') : esc(r.productNote || '生成物の記載なし');
    var html = '';
    html += '<h2 id="rp-card-title">' + esc(type.label) + 'の反応</h2>';
    html += '<p class="rp-card__tier rp-card__tier--' + (r.tier === 'primary' ? 'primary' : 'secondary') + '">' +
      (r.tier === 'primary' ? '主要経路（太い実線）' : '補助経路（細い点線）') + '</p>';
    html += '<p class="rp-card__formula">' + esc(subText) + ' → ' + esc(prodText) + '</p>';
    html += '<p>' + stateBadge(r.state) + ' <span class="rp-card__note">' +
      '独立資料の本文で確認済み。' + '</span></p>';
    html += '<p class="rp-card__actions"><button type="button" class="rp-btn rp-btn--wide" data-action="fit-reaction" data-id="' +
      esc(r.id) + '">この反応の端点を表示</button></p>';

    html += typeCommon(type);

    html += '<h3>この反応の個別情報</h3>';
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
        var target = Core.regionView(region, viewSize.w, viewSize.h, 24);
        activeRegion = region.id;
        animateTo(Core.clampPan(target, viewSize.w, viewSize.h, D.meta.canvas));
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
    rcount.textContent = D.reactions.length + ' 件（すべて独立資料で確認済み）';
    rh.appendChild(rcount);
    reactionGroup.appendChild(rh);
    var rul = document.createElement('ul');
    rul.className = 'rp-list__items';
    var sorted = D.reactions.slice().sort(byTypeThenId);
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
      b.addEventListener('click', function () { gotoEntity('reaction', r.id, b); });
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
    if (c.pathState !== 'covered' && c.pathState !== 'confirmed') {
      var tag = document.createElement('span');
      tag.className = 'rp-item__tag rp-item__tag--pending';
      tag.textContent = c.pathState === 'out-of-scope' ? '収録外' : '未確認';
      name.appendChild(tag);
    }
    var meta = document.createElement('span');
    meta.className = 'rp-item__meta';
    meta.innerHTML = esc(c.formula) + ' ／ 製法 <b>' + c.incoming + '</b> ・ 生成先 <b>' + c.outgoing + '</b>';
    b.appendChild(name);
    b.appendChild(meta);
    b.addEventListener('click', function () { gotoEntity('compound', c.id, b); });
    li.appendChild(b);
    return li;
  }

  function gotoEntity(kind, id, trigger) {
    returnFocus = trigger || returnFocus;
    var c = kind === 'compound' ? compoundById[id] : null;
    var r = kind === 'reaction' ? findReaction(id) : null;
    var target = c ? { x: c.x, y: c.y } : (r ? { x: r.x, y: r.y } : null);
    if (mapEl.scrollIntoView) {
      try { mapEl.scrollIntoView({ behavior: prefersReduce() ? 'auto' : 'smooth', block: 'center' }); } catch (err) { errMsg(err && err.message); }
    }
    if (target) {
      var size = c ? { w: nodeW(c), h: nodeH(c) } : { w: 0, h: 0 };
      var scale = Math.max(view.scale, 0.92);
      animateTo(Core.centerOn(target, size, scale, viewSize.w, viewSize.h));
    }
    selectNode(kind, id);
    openCard(kind, id);
  }

  function findReaction(id) {
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
    var first = listResults.querySelector('button.rp-item') || listAll.querySelector('button.rp-item');
    if (first) first.focus();
  }

  /* ---------------- initial render ---------------- */

  function buildNotice() {
    var summary = '物質 ' + D.meta.compoundCount + ' 件（うち高校化学の必須 ' + D.meta.requiredCount +
      ' 件）を収録。反応に関与する ' + D.meta.connectedCount + ' 物質と確認済み反応 ' +
      D.meta.confirmedReactionCount + ' 件を1つのネットワークとして配置し、残り ' +
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
        ' 件 ／ 確認済み反応 ' + D.meta.confirmedReactionCount + ' 件（非公開の保留 ' +
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
      dataEl.textContent = D.meta.dataNote + ' 反応の確認には ' + D.meta.sourceBook +
        ' の各節本文を用い、節番号と確認日（' + D.meta.verifiedAt + '）を各反応のカードに記録しています。';
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

  function init() {
    measure();
    buildConnectors();
    buildReactions();
    buildNodes();
    buildClassMap();
    ensureActiveLayer();
    buildChips();
    buildLists();
    buildNotice();
    buildStates();
    buildRegionLegend();
    setView(Core.fitTransform(D.meta.canvas, viewSize.w, viewSize.h, 14), false);

    mapEl.addEventListener('pointerdown', onPointerDown);
    mapEl.addEventListener('pointermove', onPointerMove);
    mapEl.addEventListener('pointerup', onPointerUp);
    mapEl.addEventListener('pointercancel', onPointerUp);
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
    cardClose.addEventListener('click', function () { closeCard(true); });
    positionTrigger.addEventListener('click', function () {
      if (positionPopover.hidden) openPositionPopover();
      else closePositionPopover(true);
    });

    cardDetail.addEventListener('click', function (e) {
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
      if (card.contains(e.target)) return;
      // クリック自体でフォーカスが動くため、復帰は pointerup の後に行う
      restoreAfterPointer = returnFocus;
      closeCard(false);
    }, true);

    document.addEventListener('pointerup', function (e) {
      var target = restoreAfterPointer;
      restoreAfterPointer = null;
      if (!target || !document.contains(target)) return;
      if (!card.hidden) return;
      target.focus();
      // タッチの互換mousedownは pointerup の後に来てフォーカスをBODYへ戻す。
      // 次の1回だけ、非操作要素へのmousedown既定動作を止めて起点focusを保つ。
      if (e.pointerType === 'touch' || e.pointerType === 'pen') suppressCompatFocus = true;
    }, true);

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

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
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
    });

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
      measure();
      syncPositionInset();
      if (!positionPopover.hidden) syncPositionPopoverBox();
      setView(view, true);
    });
    // webfont の読み込みで文字幅が変わると、反応ラベルの測り直しが必要になる。
    if (document.fonts && document.fonts.addEventListener) {
      try {
        document.fonts.addEventListener('loadingdone', function () {
          reactionLabelWorld = null;
          render();
        });
      } catch (err) { errMsg(err && err.message); }
    }
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(function () {
          measure();
          syncPositionInset();
          if (!positionPopover.hidden) syncPositionPopoverBox();
          setView(view, true);
        }).observe(mapEl);
        // 文字サイズや2行の折返しが変わっても、「一般図へ」の導線との重なりを作らない。
        new ResizeObserver(function () { syncPositionInset(); }).observe(positionEl);
      } catch (err) { errMsg(err && err.message); }
    }
    syncPositionInset();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
