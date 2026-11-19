/*
 * app11-3d — 表示計画と Canvas 2D 描画
 *
 * 設計:
 *   - 3D 座標は projection.js が透視投影する（基底は 1 回だけ計算して使い回す）。
 *   - カードは「投影点を中心にした画面軸平行の矩形」で、3D で傾けない。
 *   - 重なりは「間引かない」。カードは不透明で、奥（z 大）から手前（z 小）へ描く。
 *     手前のカードが実際に重なった範囲だけを上書きする（真の不透明オクルージョン）。
 *     カードの枚数上限で重なりを隠すことはしない。
 *   - 文字は奥行きで消さない（可読最小サイズを維持）。遠近は点の大きさ・線の濃さ・
 *     カードの塗り色で表す。選択カードだけは最後に描き、常に読める。
 *   - エッジはスタイル（選択/通常/大学/減光）ごとにまとめて 1 回の stroke にする。
 *     1 本ごとの save/restore はしない。破線（大学）もスタイル単位で 1 回だけ設定。
 *   - 描画は入力・選択・リサイズのときだけ。アイドル時の rAF ループはない。
 *
 * Node では require、ブラウザでは window.RP3DRenderer。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./projection.js'));
  } else {
    root.RP3DRenderer = factory(root.RP3DProjection);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  var REGION_COLORS = {
    hydrocarbon: '#ff9159',
    aromatic: '#ffd166',
    'alcohol-ether': '#5fe0c0',
    carbonyl: '#7fb2ff',
    'ester-lipid': '#c792ea',
    'phenol-aromatic': '#ff7ab6',
    nitrogen: '#a3e66e',
    sugar: '#ffe066',
    amino: '#68d8ff',
    polymer: '#b6c0d2'
  };
  var FALLBACK_COLOR = '#9aa8bb';
  // 経路ハイライトの共通色。通常はアンバー、大学レベルはシアン。
  // detail.css のグループ左アクセント／大学バッジと同じ値に揃える。
  var ROUTE_INK = { normal: '#ffd166', academic: '#48e4ff' };

  // 奥行きバケット。不透明のまま色だけ変える（半透明にすると重なりの遮蔽が崩れる）。
  var CARD_FILLS = ['#0b111b', '#0a0f18', '#090d15', '#080c13', '#070a11', '#060910'];
  var CARD_INKS = ['#f2f6ff', '#e3eaf5', '#d3dcea', '#c2ccdc', '#b1bccd', '#a2aec0'];

  function regionColor(regionId) {
    return REGION_COLORS[regionId] || FALLBACK_COLOR;
  }

  // 下部凡例の内容。D.regions の並びをそのまま使い、色は描画と同じパレットから
  // 引く（凡例とカードの色がずれない）。最後に経路色を 1 項目だけ足す。
  function legendItems(regions) {
    var items = [];
    (regions || []).forEach(function (region) {
      if (!region || !region.id) return;
      items.push({
        id: region.id,
        name: region.name || region.id,
        color: regionColor(region.id)
      });
    });
    items.push({
      id: 'route',
      route: true,
      normal: ROUTE_INK.normal,
      academic: ROUTE_INK.academic
    });
    return items;
  }

  function isCjk(ch) {
    var code = ch.codePointAt(0);
    return code > 0x2e7f;
  }

  function estimateTextWidth(text, fontSize) {
    var width = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      width += isCjk(ch) ? fontSize : fontSize * 0.58;
    }
    return width;
  }

  function truncateToWidth(text, maxWidth, fontSize) {
    if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
    var ellipsis = '…';
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var next = out + text.charAt(i);
      if (estimateTextWidth(next + ellipsis, fontSize) > maxWidth) break;
      out = next;
    }
    return out ? out + ellipsis : ellipsis;
  }

  function rectsOverlap(a, b, gap) {
    var g = gap || 0;
    return !(a.x + a.width + g <= b.x ||
      b.x + b.width + g <= a.x ||
      a.y + a.height + g <= b.y ||
      b.y + b.height + g <= a.y);
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  function rectsIntersect(a, b, margin) {
    var m = margin == null ? 0 : margin;
    return !(a.x + a.width + m <= b.x ||
      b.x + b.width + m <= a.x ||
      a.y + a.height + m <= b.y ||
      b.y + b.height + m <= a.y);
  }

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function depthBucket(depth) {
    return clamp(Math.round(depth * (CARD_FILLS.length - 1)), 0, CARD_FILLS.length - 1);
  }

  // 奥行き 0（手前）で 1.15 倍、1（奥）で 0.55 倍。
  function depthSizeFactor(depth) {
    return 1.15 - 0.6 * depth;
  }

  function depthAlpha(depth, near, far) {
    return (near == null ? 0.95 : near) + ((far == null ? 0.32 : far) - (near == null ? 0.95 : near)) * depth;
  }

  function planScene(options) {
    var model = options.model;
    var layout = options.layout;
    var camera = options.camera;
    var viewport = options.viewport;
    var layer = options.layer === 'academic' ? 'academic' : 'normal';
    var query = options.query || '';
    var selectedId = options.selectedId || null;
    var showUnconnectedOnly = !!options.showUnconnectedOnly;
    var region = options.region || null;
    var regionActive = !!region;
    var exclusions = Array.isArray(options.exclusions) ? options.exclusions : [];
    var margin = options.margin == null ? 180 : options.margin;
    var structurePlaneOptions = options.structurePlane || null;
    // カメラ移動のフェーズ。preview/travel 中は「分離表示」をまだ出さず、
    // 直前の全体文脈に焦点（選択・一致・直接ネットワーク）だけを重ねる。
    // 'fade' は着地後、カメラを固定したまま無関係の物質・経路だけを
    // focusFade（0→1）で徐々に消す。既定（'final'）は従来どおりの最終表示。
    var focusPhase = options.focusPhase === 'preview' || options.focusPhase === 'travel' ||
      options.focusPhase === 'fade'
      ? options.focusPhase
      : 'final';
    var fadeActive = focusPhase === 'fade';
    var fadeProgress = fadeActive
      ? clamp(options.focusFade == null ? 0 : options.focusFade, 0, 1)
      : 0;
    var fadeAlpha = 1 - fadeProgress;
    var transit = focusPhase === 'preview' || focusPhase === 'travel';
    var focusPivotId = (transit || fadeActive) ? (selectedId || options.focusPivotId || null) : null;
    var transitSelection = transit && !!selectedId;
    // 着地後の減光では「最終表示に残るもの」は今の見え方のまま置き、
    // 最終表示で消えるものだけを fade 付きで残す（着地の瞬間に切り替えない）。
    var fadeSelection = fadeActive && !!selectedId;

    var basis = P.cameraBasis(camera);
    var q = model.normalizeText(query);
    var searchActive = q !== '';
    var searchResults = searchActive ? model.search(query, 60) : [];
    var matchIds = Object.create(null);
    searchResults.forEach(function (result) { matchIds[result.id] = result.score; });

    var selectedGroups = selectedId ? model.groupsForCompound(selectedId, layer) : [];
    var selectedGroupIds = Object.create(null);
    var neighborIds = Object.create(null);
    // 選択中は「選択物質 + 直接関係する反応グループの全端点」だけを表示する。
    // 多端点の反応は参加する端点をすべて残す。無関係は完全に隠す（点も出さない）。
    // ただしカメラ移動中（preview/travel）は隠さず、直接ネットワークだけ強調する。
    var focalIds = null;
    if (selectedId) {
      selectedGroups.forEach(function (group) {
        selectedGroupIds[group.id] = true;
        group.substrateIds.concat(group.productIds).forEach(function (id) {
          if (id === selectedId) return;
          neighborIds[id] = true;
        });
      });
      if (!transitSelection && !fadeSelection) {
        focalIds = Object.create(null);
        focalIds[selectedId] = true;
        Object.keys(neighborIds).forEach(function (id) { focalIds[id] = true; });
      }
    }

    // 移動中に強調する範囲（選択 or 単一検索の pivot + 直接関係グループの全端点）。
    var focusIds = Object.create(null);
    var focusGroupIds = Object.create(null);
    if (focusPivotId) {
      focusIds[focusPivotId] = true;
      model.groupsForCompound(focusPivotId, layer).forEach(function (group) {
        focusGroupIds[group.id] = true;
        group.substrateIds.concat(group.productIds).forEach(function (id) {
          focusIds[id] = true;
        });
      });
    }

    // 検索時は「一致物質」に加えて、可視層の反応で直接つながる基質・生成物も
    // 文脈カードとして残す（推移的な波及はしない）。選択中はその近傍も同様。
    var contextIds = Object.create(null);
    function addContext(id) {
      if (!id || id === selectedId || matchIds[id]) return;
      contextIds[id] = true;
    }
    var searchGroupIds = Object.create(null);
    // 選択中は検索より選択グラフを優先する（他の一致が残っていても広げない）。
    if (searchActive && !selectedId && !transitSelection) {
      searchResults.forEach(function (result) {
        model.groupsForCompound(result.id, layer).forEach(function (group) {
          searchGroupIds[group.id] = true;
          group.substrateIds.concat(group.productIds).forEach(addContext);
        });
      });
    }

    var connected = model.connectedIds(layer);
    // 分類フィルタ。周囲の経路は、グループの全端点（基質＋生成物）が同じ分類に
    // 揃っているときだけ描く。一部の端点だけ見せて、反応の相手を誤解させない。
    var regionGroupCache = Object.create(null);
    function groupCompleteInRegion(groupId) {
      if (!regionActive) return true;
      if (regionGroupCache[groupId] !== undefined) return regionGroupCache[groupId];
      var group = model.groupById && model.groupById[groupId];
      var ok = !!group;
      if (group) {
        var ids = (group.substrateIds || []).concat(group.productIds || []);
        for (var k = 0; k < ids.length; k++) {
          var member = model.byId[ids[k]];
          if (!member || member.region !== region) { ok = false; break; }
        }
      }
      regionGroupCache[groupId] = ok;
      return ok;
    }
    var projections = Object.create(null);
    var candidates = [];
    var zNear = Infinity;
    var zFar = -Infinity;

    function isExcluded(x, y) {
      for (var i = 0; i < exclusions.length; i++) {
        if (pointInRect(x, y, exclusions[i])) return true;
      }
      return false;
    }

    for (var i = 0; i < model.compounds.length; i++) {
      var compound = model.compounds[i];
      // 選択中は無関係の物質を投影前から除外する（暗い点もヒット対象も残さない）。
      if (focalIds && !focalIds[compound.id]) continue;
      // 分類フィルタ中は分類外を完全に隠す。ただし検索の一致・文脈と、
      // 選択遷移中の関係物質は分類外でも残す（選択・検索が優先）。
      if (!focalIds && regionActive && compound.region !== region) {
        var keepOutside = (searchActive && (!!matchIds[compound.id] || !!contextIds[compound.id])) ||
          ((transitSelection || fadeSelection) && !!focusIds[compound.id]);
        if (!keepOutside) continue;
      }
      var point = layout.points[compound.id];
      if (!point) continue;
      var projected = P.cameraViewWithBasis(camera, basis, point, viewport);
      projections[compound.id] = projected;
      if (!projected) continue;
      if (projected.x < -margin || projected.x > viewport.width + margin ||
        projected.y < -margin || projected.y > viewport.height + margin) continue;

      if (projected.z < zNear) zNear = projected.z;
      if (projected.z > zFar) zFar = projected.z;

      var isSelected = compound.id === selectedId;
      var isMatch = !!matchIds[compound.id];
      var isContext = !focalIds && !!contextIds[compound.id] && !isMatch && !isSelected;
      var isConnected = !!connected[compound.id];
      var isNeighbor = !!neighborIds[compound.id];
      var isLinked = (transitSelection || fadeSelection) && !isSelected && !!focusIds[compound.id];
      // 着地後の減光で最終表示から消える物質（選択・直接ネットワーク以外）。
      var isFading = fadeSelection && !isSelected && !focusIds[compound.id];
      // 移動中の選択では無関係を減光しない（直前の全体文脈のまま）。
      var dimmed = !focalIds && !transitSelection && !fadeSelection &&
        ((searchActive && !isMatch && !isContext) || (showUnconnectedOnly && isConnected));
      var priority;
      if (isSelected) priority = 0;
      else if (focalIds) priority = 2;
      else if (searchActive && !transitSelection) priority = isMatch ? 1 : (isContext ? 2 : 99);
      else if (showUnconnectedOnly && isConnected) priority = 99;
      else if (isNeighbor || isLinked) priority = 2;
      else if (compound.hub) priority = 3;
      else if (compound.tier === 'primary') priority = 4;
      else if (isConnected) priority = 5;
      else priority = 6;

      // パネルに完全に隠れる中心は、カードも点も出さない（ピックもさせない）。
      if (isExcluded(projected.x, projected.y)) continue;

      candidates.push({
        id: compound.id,
        compound: compound,
        point: point,
        projected: projected,
        x: projected.x,
        y: projected.y,
        z: projected.z,
        priority: priority,
        selected: isSelected,
        match: isMatch,
        context: isContext,
        neighbor: isNeighbor,
        linked: isLinked,
        fade: isFading,
        connected: isConnected,
        dimmed: dimmed,
        regionColor: regionColor(compound.region)
      });
    }

    var zSpan = zFar > zNear ? (zFar - zNear) : 1;
    function depthOf(z) {
      return clamp((z - zNear) / zSpan, 0, 1);
    }

    var cards = [];
    var markers = [];
    var maxLabelWidth = Math.max(110, Math.min(230, viewport.width * 0.22));
    var viewRect = { x: -8, y: -8, width: viewport.width + 16, height: viewport.height + 16 };

    for (var ci = 0; ci < candidates.length; ci++) {
      var candidate = candidates[ci];
      var depth = depthOf(candidate.z);
      if (candidate.priority >= 99) {
        markers.push(makeMarker(candidate, depth));
        continue;
      }
      var fontSize = candidate.selected ? 13 : 12;
      var text = truncateToWidth(candidate.compound.label || candidate.compound.name, maxLabelWidth, fontSize);
      var textWidth = estimateTextWidth(text, fontSize);
      var width = Math.max(46, textWidth + (candidate.selected ? 24 : 18));
      var height = candidate.selected ? 28 : (candidate.compound.hub ? 26 : 24);
      var rect = {
        x: candidate.x - width / 2,
        y: candidate.y - height / 2,
        width: width,
        height: height
      };
      // 重なりは許す（間引かない）。画面外へ完全に出た矩形だけ落とす。
      if (!rectsIntersect(rect, viewRect, 0)) {
        markers.push(makeMarker(candidate, depth));
        continue;
      }
      var bucket = depthBucket(depth);
      cards.push(Object.assign({}, candidate, {
        text: text,
        fontSize: fontSize,
        width: width,
        height: height,
        rect: rect,
        card: true,
        depth: depth,
        depthBucket: bucket,
        fill: CARD_FILLS[bucket],
        ink: CARD_INKS[bucket]
      }));
    }

    function makeMarker(entry, depth) {
      var base = entry.selected ? 6 : (entry.compound.hub ? 4.4 : 3.2);
      return Object.assign({}, entry, {
        card: false,
        depth: depth,
        depthBucket: depthBucket(depth),
        radius: base * depthSizeFactor(depth)
      });
    }

    // 奥（z 大）から手前（z 小）へ。選択カードだけは最後＝最前面（可読性優先）。
    var nodes = cards.concat(markers);
    nodes.sort(function (a, b) {
      if (a.selected !== b.selected) return a.selected ? 1 : -1;
      if (b.z !== a.z) return b.z - a.z;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    var edgeList = model.edgesForLayer(layer);
    if (focalIds) {
      // 選択中は関係グループのエッジだけ。無関係の経路は完全に消す。
      edgeList = edgeList.filter(function (edge) { return !!selectedGroupIds[edge.groupId]; });
    } else if (regionActive && !searchActive) {
      // 周囲は「全端点が同じ分類」のグループだけ。選択遷移中は選択の関係グループも
      // 分類外へ伸びてよい（着地後は focalIds 側で選択グラフだけになる）。
      edgeList = edgeList.filter(function (edge) {
        if (groupCompleteInRegion(edge.groupId)) return true;
        return (transitSelection || fadeSelection) && !!focusGroupIds[edge.groupId];
      });
    }
    var edges = [];
    var culledEdges = 0;
    var clipRect = { x: -60, y: -60, width: viewport.width + 120, height: viewport.height + 120 };
    for (var ei = 0; ei < edgeList.length; ei++) {
      var edge = edgeList[ei];
      var from = projections[edge.from];
      var to = projections[edge.to];
      if (!from || !to) { culledEdges++; continue; }
      if (from.x < -margin && to.x < -margin) { culledEdges++; continue; }
      if (from.y < -margin && to.y < -margin) { culledEdges++; continue; }
      if (from.x > viewport.width + margin && to.x > viewport.width + margin) { culledEdges++; continue; }
      if (from.y > viewport.height + margin && to.y > viewport.height + margin) { culledEdges++; continue; }
      var clipped = P.clipSegment(from.x, from.y, to.x, to.y, clipRect);
      if (!clipped) { culledEdges++; continue; }
      var selectedEdge = !!selectedGroupIds[edge.groupId] ||
        ((transit || fadeSelection) && !!focusGroupIds[edge.groupId]);
      var searchLink = !!searchGroupIds[edge.groupId];
      var edgeFade = fadeSelection && !selectedEdge;
      // 単一検索の着地後は、移動中に強調した経路を「通常の線の上のハイライト」として
      // 徐々に薄くする（無関係の点・経路は最終検索表示のまま残す）。
      var highlightFade = fadeActive && !fadeSelection && !!focusGroupIds[edge.groupId];
      var avgZ = (from.z + to.z) / 2;
      edges.push({
        id: edge.id,
        groupId: edge.groupId,
        from: edge.from,
        to: edge.to,
        x1: clipped.x1,
        y1: clipped.y1,
        x2: clipped.x2,
        y2: clipped.y2,
        z1: from.z,
        z2: to.z,
        z: avgZ,
        depth: depthOf(avgZ),
        selected: selectedEdge,
        searchLink: searchLink,
        academic: edge.academicOnly,
        fade: edgeFade,
        highlightFade: highlightFade,
        // 検索文脈の経路は、選択中でも消さない（他の経路だけ減光する）。
        // 移動中は無関係の経路も直前の見え方のまま残す。
        dimmed: !transit && !fadeSelection && !!selectedId && !selectedEdge && !searchLink,
        typeLabel: edge.typeLabel
      });
    }

    var anySelected = !!selectedId && !transitSelection;
    var batchesById = Object.create(null);
    var batches = [];
    for (var bi = 0; bi < edges.length; bi++) {
      var item = edges[bi];
      var key;
      if (item.fade) key = item.academic ? 'academic' : 'normal';
      else if (item.selected) key = item.academic ? 'sel-academic' : 'sel-normal';
      else if (item.searchLink) key = item.academic ? 'academic' : 'normal';
      else if (item.academic) key = anySelected ? 'academic-dim' : 'academic';
      else key = anySelected ? 'normal-dim' : 'normal';
      // 奥行きで濃さを変えるため 3 バンドに分ける（スタイル単位のバッチは保つ）。
      // 減光中の経路は通常スタイルのまま、フレーム共通の alpha を掛ける専用バッチへ。
      var band = item.depth < 1 / 3 ? 0 : (item.depth < 2 / 3 ? 1 : 2);
      var batchKey = key + '|' + band + (item.fade ? '|fade' : '');
      if (!batchesById[batchKey]) {
        batchesById[batchKey] = { key: key, band: band, fade: !!item.fade, highlight: false, edges: [] };
        batches.push(batchesById[batchKey]);
      }
      batchesById[batchKey].edges.push(item);
      if (item.highlightFade) {
        // 検索の着地後だけ、強調を通常線の上に重ねて薄くしていく（1 バッチに集約）。
        var highlightKey = (item.academic ? 'sel-academic' : 'sel-normal') + '|' + band + '|hl';
        if (!batchesById[highlightKey]) {
          batchesById[highlightKey] = {
            key: item.academic ? 'sel-academic' : 'sel-normal',
            band: band,
            fade: false,
            highlight: true,
            edges: []
          };
          batches.push(batchesById[highlightKey]);
        }
        batchesById[highlightKey].edges.push(item);
      }
    }

    var floorSegments = buildFloorGrid(layout, camera, basis, viewport);
    var structurePlane = null;
    if (selectedId && structurePlaneOptions && structurePlaneOptions.sprite) {
      structurePlane = buildStructurePlane(structurePlaneOptions, layout.points[selectedId], camera, basis, viewport);
    }

    return {
      layer: layer,
      query: query,
      searchActive: searchActive,
      selectedId: selectedId,
      region: region,
      focusPhase: focusPhase,
      focusPivotId: focusPivotId,
      fadeProgress: fadeProgress,
      fadeAlpha: fadeActive ? fadeAlpha : 1,
      focusIds: focusIds,
      focusGroupIds: focusGroupIds,
      selectedGroupIds: selectedGroupIds,
      matchIds: matchIds,
      connectedIds: connected,
      viewport: viewport,
      camera: camera,
      depthRange: { near: zNear, far: zFar },
      edges: edges,
      edgeBatches: batches,
      floorSegments: floorSegments,
      structurePlane: structurePlane,
      cards: cards,
      markers: markers,
      nodes: nodes,
      projections: projections,
      labelCount: cards.length,
      markerCount: markers.length,
      stats: {
        cards: cards.length,
        markers: markers.length,
        nodes: nodes.length,
        edges: edges.length,
        culledEdges: culledEdges,
        edgeBatches: batches.length,
        floorSegments: floorSegments.length
      },
      animate: false
    };
  }

  // 床の薄いグリッド。ワールド平面（Y 一定）を投影するので奥行きの手掛かりになる。
  function buildFloorGrid(layout, camera, basis, viewport) {
    var b = layout.bounds;
    if (!b) return [];
    var y = b.min.y - 1.8;
    var padX = Math.max(6, b.width * 0.06);
    var padZ = Math.max(6, b.depth * 0.06);
    var x0 = b.min.x - padX;
    var x1 = b.max.x + padX;
    var z0 = b.min.z - padZ;
    var z1 = b.max.z + padZ;
    var lines = clamp(Math.round(Math.max(b.width, b.depth) / 9), 6, 18);
    var clipRect = { x: -40, y: -40, width: viewport.width + 80, height: viewport.height + 80 };
    var out = [];
    function add(ax, az, bx, bz) {
      var pa = P.cameraViewWithBasis(camera, basis, { x: ax, y: y, z: az }, viewport);
      var pb = P.cameraViewWithBasis(camera, basis, { x: bx, y: y, z: bz }, viewport);
      if (!pa || !pb) return;
      var c = P.clipSegment(pa.x, pa.y, pb.x, pb.y, clipRect);
      if (c) out.push(c);
    }
    for (var i = 0; i <= lines; i++) {
      var t = i / lines;
      var x = x0 + (x1 - x0) * t;
      var z = z0 + (z1 - z0) * t;
      add(x, z0, x, z1);
      add(x0, z, x1, z);
    }
    return out;
  }

  // 選択物質の正規構造式（SVG をラスタ化したもの）を、ワールド位置に結び付いた
  // 少し傾いた平面として置く。結合の 3D 座標は発明しない（画像 1 枚を貼るだけ）。
  function buildStructurePlane(options, point, camera, basis, viewport) {
    var sprite = options.sprite;
    var spriteW = sprite.width || 1;
    var spriteH = sprite.height || 1;
    var perPx = P.worldPerPixel(camera, viewport);
    var screenWidth = options.screenWidth == null ? 190 : options.screenWidth;
    var planeW = screenWidth * perPx;
    var planeH = planeW * (spriteH / spriteW);
    var tilt = 16 * P.DEG;
    var v = P.normalize(P.add(P.mul(basis.up, Math.cos(tilt)), P.mul(basis.forward, Math.sin(tilt))));
    var u = basis.right;
    var center = P.add(point, P.mul(basis.up, planeH * 0.85));
    var hw = planeW / 2;
    var hh = planeH / 2;
    function corner(su, sv) {
      return P.add(center, P.add(P.mul(u, su * hw), P.mul(v, sv * hh)));
    }
    var worldCorners = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
    var corners = [];
    for (var i = 0; i < worldCorners.length; i++) {
      var p = P.cameraViewWithBasis(camera, basis, worldCorners[i], viewport);
      if (!p) return null;
      corners.push({ x: p.x, y: p.y, z: p.z });
    }
    return {
      sprite: sprite,
      spriteWidth: spriteW,
      spriteHeight: spriteH,
      corners: corners
    };
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  var FONT_STACK = "'Yu Gothic UI','Hiragino Sans','Noto Sans JP',system-ui,sans-serif";

  function gradientFor(ctx, plan, paper) {
    var key = plan.viewport.width + 'x' + plan.viewport.height + '|' + paper;
    var cache = ctx.__r3dGradient;
    if (!cache || cache.key !== key) {
      var grad = ctx.createRadialGradient(
        plan.viewport.width * 0.45, plan.viewport.height * 0.42, 10,
        plan.viewport.width * 0.5, plan.viewport.height * 0.5, Math.max(plan.viewport.width, plan.viewport.height) * 0.78
      );
      grad.addColorStop(0, 'rgba(22,33,52,0.7)');
      grad.addColorStop(0.55, 'rgba(8,12,20,0.55)');
      grad.addColorStop(1, 'rgba(3,5,9,0.96)');
      cache = { key: key, grad: grad };
      ctx.__r3dGradient = cache;
    }
    return cache.grad;
  }

  // 通常経路の可視性の下限。奥行きで薄くしても「追えなくなる」ところまで落とさない。
  var EDGE_DEPTH_ALPHA = [1, 0.86, 0.74];
  var EDGE_DEPTH_WIDTH = [1, 0.96, 0.92];
  var EDGE_ORDINARY_ALPHA = { normal: 0.27, academic: 0.34 };
  var EDGE_DIMMED_ALPHA = { normal: 0.13, academic: 0.17 };
  var EDGE_SELECTED_ALPHA = 0.95;
  var EDGE_SELECTED_WIDTH = 2.6;

  // バッチ 1 つ分の実際の線スタイル。DOM なしの純関数（テスト対象）。
  function edgePaint(key, band, theme) {
    theme = theme || {};
    var anySelected = key.indexOf('sel-') === 0;
    var academic = key.indexOf('academic') >= 0;
    var dim = key.indexOf('-dim') >= 0;
    var selectedInk = theme.selectedInk || ROUTE_INK.normal;
    var academicInk = theme.academicInk || ROUTE_INK.academic;
    var level = band == null ? 0 : Math.max(0, Math.min(2, band));
    if (anySelected) {
      return {
        stroke: academic ? academicInk : selectedInk,
        alpha: EDGE_SELECTED_ALPHA,
        width: EDGE_SELECTED_WIDTH,
        dash: null,
        glow: academic ? academicInk : selectedInk
      };
    }
    var palette = dim ? EDGE_DIMMED_ALPHA : EDGE_ORDINARY_ALPHA;
    return {
      stroke: academic ? 'rgba(72,228,255,1)' : 'rgba(150,175,205,1)',
      alpha: palette[academic ? 'academic' : 'normal'] * EDGE_DEPTH_ALPHA[level],
      width: (academic ? 1.35 : 1.15) * EDGE_DEPTH_WIDTH[level],
      dash: academic ? [5, 7] : null,
      glow: null
    };
  }

  var edgeBatchStyle = edgePaint;

  function strokeSegments(ctx, segments) {
    ctx.beginPath();
    for (var i = 0; i < segments.length; i++) {
      var e = segments[i];
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
    }
    ctx.stroke();
  }

  function arrowHead(ctx, x1, y1, x2, y2, t, size, color) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 18) return;
    var ux = dx / len;
    var uy = dy / len;
    var mx = x1 + dx * t;
    var my = y1 + dy * t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(mx - ux * size - uy * size * 0.55, my - uy * size + ux * size * 0.55);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx - ux * size + uy * size * 0.55, my - uy * size - ux * size * 0.55);
    ctx.stroke();
  }

  function drawStructurePlane(ctx, plane) {
    var c = plane.corners;
    var tl = c[0];
    var tr = c[1];
    var bl = c[3];
    var w = plane.spriteWidth;
    var h = plane.spriteHeight;
    var a = (tr.x - tl.x) / w;
    var b = (tr.y - tl.y) / w;
    var cc = (bl.x - tl.x) / h;
    var d = (bl.y - tl.y) / h;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.translate(tl.x, tl.y);
    ctx.transform(a, b, cc, d, 0, 0);
    ctx.drawImage(plane.sprite, 0, 0, w, h);
    ctx.restore();
    // 枠（薄い）。
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#7fb2ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawScene(ctx, plan, theme) {
    theme = theme || {};
    var ink = theme.ink || '#f2f6ff';
    var paper = theme.paper || '#05070c';
    var selectedInk = theme.selectedInk || ROUTE_INK.normal;
    var academicInk = theme.academicInk || ROUTE_INK.academic;
    var fadeAlpha = plan.fadeAlpha == null ? 1 : plan.fadeAlpha;
    var stats = { drawCalls: 0, edgeBatches: 0, edgeSegments: 0, cards: 0, markers: 0, floorSegments: 0 };

    ctx.clearRect(0, 0, plan.viewport.width, plan.viewport.height);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, plan.viewport.width, plan.viewport.height);
    stats.drawCalls += 1;

    ctx.fillStyle = gradientFor(ctx, plan, paper);
    ctx.fillRect(0, 0, plan.viewport.width, plan.viewport.height);
    stats.drawCalls += 1;

    // 床グリッド（1 パス）。
    if (plan.floorSegments.length) {
      ctx.strokeStyle = 'rgba(96,132,176,0.11)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      strokeSegments(ctx, plan.floorSegments);
      stats.floorSegments = plan.floorSegments.length;
      stats.drawCalls += 1;
    }

    // エッジはスタイルごとにバッチ描画。1 本ずつの save/restore はしない。
    for (var bi = 0; bi < plan.edgeBatches.length; bi++) {
      var batch = plan.edgeBatches[bi];
      var style = edgeBatchStyle(batch.key, batch.band, theme);
      // 減光中の無関係経路と、着地後に薄れる検索ハイライトは共通のフレーム値で落とす。
      ctx.globalAlpha = (batch.fade || batch.highlight) ? style.alpha * fadeAlpha : style.alpha;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width;
      ctx.lineCap = 'round';
      ctx.setLineDash(style.dash || []);
      if (style.glow) {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = 9;
      } else {
        ctx.shadowBlur = 0;
      }
      strokeSegments(ctx, batch.edges);
      stats.edgeBatches += 1;
      stats.edgeSegments += batch.edges.length;
      stats.drawCalls += 1;
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // 選択経路の矢印（選択時のみ・本数は少ない）。
    if (plan.selectedId) {
      for (var ai = 0; ai < plan.edges.length; ai++) {
        var selectedEdge = plan.edges[ai];
        if (!selectedEdge.selected) continue;
        arrowHead(ctx, selectedEdge.x1, selectedEdge.y1, selectedEdge.x2, selectedEdge.y2, 0.62, 7,
          selectedEdge.academic ? academicInk : selectedInk);
        stats.drawCalls += 1;
      }
    }

    // 構造式の面（ワールド位置に固定。ノードより奥に描く）。
    if (plan.structurePlane) {
      drawStructurePlane(ctx, plan.structurePlane);
      stats.drawCalls += 1;
    }

    // ノードは奥から手前へ。カードは不透明で、重なった範囲だけを上書きする。
    // save/restore は使わず、スタイルを直接切り替える。
    for (var ni = 0; ni < plan.nodes.length; ni++) {
      var node = plan.nodes[ni];
      if (node.card) {
        var shadow = node.selected ? selectedInk : (node.match ? academicInk : null);
        if (shadow) {
          ctx.shadowColor = shadow;
          ctx.shadowBlur = node.selected ? 18 : 8;
        } else {
          ctx.shadowBlur = 0;
        }
        roundRectPath(ctx, node.rect.x, node.rect.y, node.rect.width, node.rect.height, 7);
        ctx.globalAlpha = node.fade ? fadeAlpha : 1;
        ctx.fillStyle = node.selected ? '#202b3d' : node.fill;
        ctx.fill();
        ctx.lineWidth = node.selected ? 2 : (node.match ? 1.8 : ((node.context || node.linked) ? 1.3 : 1));
        ctx.strokeStyle = node.selected
          ? selectedInk
          : (node.match ? academicInk : ((node.context || node.linked) ? '#b6c8dd' : node.regionColor));
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = node.selected ? '#fff8e6' : node.ink;
        ctx.font = (node.selected ? '700 ' : '600 ') + node.fontSize + 'px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.text, node.x, node.y + 0.5);
        stats.cards += 1;
        stats.drawCalls += 3;
      } else {
        var markerAlpha = node.dimmed ? 0.14 : depthAlpha(node.depth, 0.92, 0.4);
        ctx.globalAlpha = node.fade ? markerAlpha * fadeAlpha : markerAlpha;
        ctx.fillStyle = node.selected ? selectedInk : node.regionColor;
        if (node.selected) {
          ctx.shadowColor = selectedInk;
          ctx.shadowBlur = 16;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (node.connected) {
          var markerRing = node.dimmed ? 0.2 : depthAlpha(node.depth, 0.6, 0.22);
          ctx.globalAlpha = node.fade ? markerRing * fadeAlpha : markerRing;
          ctx.strokeStyle = 'rgba(230,240,255,0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        stats.markers += 1;
        stats.drawCalls += 1;
      }
    }

    plan.drawStats = stats;
    return stats;
  }

  // 実際に描いた順の逆（手前から）に当たり判定する。重なりは手前が勝つ。
  function pickScene(plan, x, y) {
    for (var i = plan.nodes.length - 1; i >= 0; i--) {
      var node = plan.nodes[i];
      // 消えていく背景（着地後の減光対象）はヒットさせない。
      if (node.fade) continue;
      if (node.card) {
        if (pointInRect(x, y, node.rect)) return node.id;
        continue;
      }
      var dx = x - node.x;
      var dy = y - node.y;
      var radius = Math.max(7, node.radius + 4);
      if (dx * dx + dy * dy <= radius * radius) return node.id;
    }
    return null;
  }

  return {
    REGION_COLORS: REGION_COLORS,
    ROUTE_INK: ROUTE_INK,
    EDGE_ORDINARY_ALPHA: EDGE_ORDINARY_ALPHA,
    EDGE_DIMMED_ALPHA: EDGE_DIMMED_ALPHA,
    edgePaint: edgePaint,
    regionColor: regionColor,
    legendItems: legendItems,
    estimateTextWidth: estimateTextWidth,
    truncateToWidth: truncateToWidth,
    rectsOverlap: rectsOverlap,
    planScene: planScene,
    drawScene: drawScene,
    pickScene: pickScene
  };
});
