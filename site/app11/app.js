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

  var nodeIndex = {};
  var reactionIndex = {};
  var edgeIndex = {};
  var classNodeIndex = {};
  var classEdgeIndex = {};
  var classNodeById = {};
  var classLayer = null;
  var classMapData = D.classMap || null;
  if (classMapData) {
    classMapData.nodes.forEach(function (n) { classNodeById[n.id] = n; });
  }
  var activeEdgeLayer = null;
  var previewReaction = null;
  var view = { scale: 1, x: 0, y: 0 };
  var viewSize = { w: 1, h: 1 };
  var selected = null;
  var activeRegion = null;
  var returnFocus = null;
  var restoreAfterPointer = null;
  var suppressCompatFocus = false;
  var suppressClick = false;
  var animToken = 0;
  var lastLevel = -1;
  var positionFullValue = '';
  var positionLevelValue = '';
  var positionLiveText = '';
  var positionLiveTimer = 0;
  var POSITION_LIVE_DELAY = 500;

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

  function ensureArrowDefs() {
    if (svg.querySelector('#rp-arrow-primary')) return;
    var defs = el('defs');
    [['rp-arrow-primary', 'rp-primary', 7], ['rp-arrow-secondary', 'rp-secondary', 5.5], ['rp-arrow-class', 'rp-accent', 6]].forEach(function (spec) {
      var marker = el('marker', {
        id: spec[0],
        viewBox: '0 0 8 8',
        refX: '7.2',
        refY: '4',
        markerWidth: String(spec[2]),
        markerHeight: String(spec[2]),
        markerUnits: 'userSpaceOnUse',
        orient: 'auto'
      });
      marker.appendChild(el('path', { d: 'M0,0 L8,4 L0,8 z', style: 'fill:var(--' + spec[1] + ')' }));
      defs.appendChild(marker);
    });
    svg.insertBefore(defs, svg.firstChild);
  }

  function buildReactions() {
    ensureArrowDefs();
    var secondaryLayer = el('g', { 'class': 'rp-edges rp-edges--secondary' });
    var primaryLayer = el('g', { 'class': 'rp-edges rp-edges--primary' });
    var markerLayer = el('g', { 'class': 'rp-reactions' });
    D.reactions.forEach(function (r) {
      var tier = r.tier === 'primary' ? 'primary' : 'secondary';
      (r.edges || []).forEach(function (e) {
        var key = r.id + '|' + e.dir + '|' + e.id;
        var edgeTier = e.tier === 'primary' ? 'primary' : 'secondary';
        var points = e.dir === 'out' ? e.points.slice().reverse() : e.points;
        var path = el('path', {
          'class': 'rp-edge rp-edge--' + edgeTier,
          'data-from': e.dir === 'in' ? e.id : r.id,
          'data-to': e.dir === 'in' ? r.id : e.id,
          'data-edge': key,
          'data-reaction': r.id,
          'data-compound': e.id,
          'data-tier': edgeTier,
          'marker-end': 'url(#rp-arrow-' + edgeTier + ')',
          d: Core.routePath(points, e.gaps, e.bridges)
        });
        (edgeTier === 'primary' ? primaryLayer : secondaryLayer).appendChild(path);
        edgeIndex[key] = path;
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
      g.appendChild(el('circle', { 'class': 'rp-reaction__hit', cx: r.x, cy: r.y, r: 22 }));
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
    viewport.appendChild(secondaryLayer);
    viewport.appendChild(primaryLayer);
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
    classLayer.appendChild(el('rect', {
      'class': 'rp-classmap__frame',
      x: frame.x,
      y: frame.y,
      width: frame.w,
      height: frame.h,
      rx: 18
    }));
    var edgeLayer = el('g', { 'class': 'rp-classmap__edges', 'aria-hidden': 'true' });
    classMapData.edges.forEach(function (e) {
      var path = el('path', {
        'class': 'rp-classmap__edge',
        'data-class-edge': e.id,
        'data-from': e.from,
        'data-to': e.to,
        'marker-end': 'url(#rp-arrow-class)',
        d: Core.routePath(e.points, [], [])
      });
      edgeLayer.appendChild(path);
      classEdgeIndex[e.id] = path;
    });
    var labelLayer = el('g', { 'class': 'rp-classmap__labels', 'aria-hidden': 'true' });
    classMapData.edges.forEach(function (e) {
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
      labelLayer.appendChild(label);
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
    classLayer.appendChild(edgeLayer);
    classLayer.appendChild(labelLayer);
    classLayer.appendChild(nodeLayer);
    viewport.appendChild(classLayer);
  }

  function classNodeLabel(n) {
    return n.name + '。' + n.summary + '。' + n.scope;
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
      var hit = g.querySelector('.rp-reaction__hit');
      if (dot) dot.setAttribute('r', small ? '4' : '6');
      if (hit) hit.setAttribute('r', small ? '12' : '22');
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

  function updateOverlay(level) {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    var box = visibleBox();
    var placed = [];
    if (classMapData) {
      var frame = classMapData.frame;
      var titlePoint = Core.worldToScreen(view, frame.x + 28, frame.y + 24);
      if (titlePoint.x < box.right && titlePoint.y < box.bottom &&
        titlePoint.x + 240 > box.left && titlePoint.y + 40 > box.top) {
        var heading = document.createElement('div');
        heading.className = 'rp-overlay__classmap';
        heading.style.left = titlePoint.x + 'px';
        heading.style.top = titlePoint.y + 'px';
        heading.style.maxWidth = Math.min(340, Math.max(140, viewSize.w - titlePoint.x - 12)) + 'px';
        var strong = document.createElement('strong');
        strong.textContent = classMapData.title;
        var note = document.createElement('span');
        note.textContent = classMapData.note;
        heading.appendChild(strong);
        heading.appendChild(note);
        overlay.appendChild(heading);
        placed.push({ x: titlePoint.x, y: titlePoint.y, w: 250, h: 40 });
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
      }
    }
    var text;
    if (selected && selected.kind === 'class') {
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

  function openPositionPopover() {
    if (positionLiveTimer) {
      window.clearTimeout(positionLiveTimer);
      positionLiveTimer = 0;
    }
    fillPositionPopover();
    positionPopover.hidden = false;
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
    var target = Core.fitRect(classMapData.area, viewSize.w, viewSize.h, 14, 0, 1.2);
    animateTo(Core.clampPan(target, viewSize.w, viewSize.h, D.meta.canvas));
    if (focusFirst && classMapData.nodes.length && classNodeIndex[classMapData.nodes[0].id]) {
      classNodeIndex[classMapData.nodes[0].id].focus();
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

  function pointerList() {
    return Object.keys(pointers).map(function (k) { return pointers[k]; });
  }

  function mapPoint(e) {
    var rect = mapEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    if (e.target.closest && e.target.closest('.rp-legend,.rp-hint,.rp-classmap-jump')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var p = mapPoint(e);
    pointers[e.pointerId] = p;
    suppressClick = false;
    downEntity = e.target.closest ? e.target.closest('[data-kind]') : null;
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
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (activeRegion) clearRegionSelection();
    var p = mapPoint(e);
    var factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    animateTo(Core.zoomAt({ scale: view.scale, x: view.x, y: view.y }, factor, p.x, p.y));
  }

  function onKeydown(e) {
    if (!card.hidden) return;
    if (e.target === searchInput) return;
    var step = 70;
    var handled = true;
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
      case 'Enter': case ' ':
        if (e.target.getAttribute && e.target.getAttribute('data-kind')) {
          e.preventDefault();
          openFromElement(e.target);
        }
        break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  // キーボードでノードへ移動したとき、画面の外なら中央へ寄せる。
  function onFocusIn(e) {
    var target = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (!target) return;
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
          ? path.getAttribute('data-compound') === selected.id
          : selected.kind === 'reaction' && path.getAttribute('data-reaction') === selected.id;
      }
      if (active) path.classList.add('is-active');
      else path.classList.remove('is-active');
    });
  }

  function updateClassEdgeHighlight() {
    Object.keys(classEdgeIndex).forEach(function (key) {
      var path = classEdgeIndex[key];
      var active = !!selected && selected.kind === 'class' &&
        (path.getAttribute('data-from') === selected.id || path.getAttribute('data-to') === selected.id);
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
    (r.edges || []).forEach(function (e) {
      var points = e.dir === 'out' ? e.points.slice().reverse() : e.points;
      var tier = e.tier === 'primary' ? 'primary' : 'secondary';
      layer.appendChild(el('path', {
        'class': 'rp-edge-active',
        'data-reaction': r.id,
        'marker-end': 'url(#rp-arrow-' + tier + ')',
        d: Core.routePath(points, [], [])
      }));
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
    else html = reactionCard(id);
    if (!html) return;
    cardEyebrow.textContent = kind === 'compound' ? '物質' : kind === 'class' ? '一般図' : '反応';
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
      return '<ul class="rp-card__list">' + list.map(function (e) {
        return '<li>' + esc(edgeText(e)) + '</li>';
      }).join('') + '</ul>';
    };
    var html = '';
    html += '<h2 id="rp-card-title">' + esc(n.name) + '</h2>';
    html += '<p class="rp-card__note">官能基変換の一般図 — 分類の説明であり、個別物質の反応ではありません。</p>';
    html += '<p>' + stateBadge('confirmed') + ' <span class="rp-card__note">分類間の代表的な変換として、独立資料の各節で確認済み。個別反応 ' +
      D.meta.confirmedReactionCount + ' 件には加算しません。</span></p>';
    html += '<h3>一般適用範囲</h3><p>' + esc(n.scope) + '</p>';
    html += '<h3>例外・注意</h3><ul class="rp-card__list">' +
      n.exceptions.map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('') + '</ul>';
    html += '<h3>この分類へ進む変換（' + ins.length + ' 件）</h3>' + edgeList(ins);
    html += '<h3>この分類から進む変換（' + outs.length + ' 件）</h3>' + edgeList(outs);
    html += '<h3>資料</h3><p class="rp-card__note">' + n.sources.map(esc).join('／') + '</p>';
    html += '<p class="rp-card__note">資料のURL・本文・図は転載していません。一般化された反応事実は独立資料で確認済みで、未検証の別データではありません。</p>';
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

    html += '<div class="rp-common">';
    html += '<h3>共通の説明 — ' + esc(type.label) + '</h3>';
    html += '<p>' + esc(type.summary) + '</p>';
    if (type.schematic) {
      html += '<p class="rp-schematic">' + esc(type.schematic) + '</p>';
      html += '<span class="rp-figcap">模式図（原子団・結合の変化）。電子の動きを示す機構図は収録していません。</span>';
    }
    html += '</div>';

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
      setView(view, true);
    });
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(function () { measure(); setView(view, true); }).observe(mapEl);
      } catch (err) { errMsg(err && err.message); }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
