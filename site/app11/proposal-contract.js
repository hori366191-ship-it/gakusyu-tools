/*
 * 有機反応マップ（app11）— 通常配置案（normal-proposed）の契約と検証
 *
 * このファイルは scripts/app11/build-proposed-layout.cjs（生成）、
 * scripts/tests/app11-proposed-layout.test.cjs（回帰）、
 * 実行時（C 担当の app.js / index.html）の三箇所で同じ関数を使うための共有 pure module。
 * 依存なし・DOM なし・乱数なし。Node では require、ブラウザでは window.RPMapProposalContract。
 *
 * ハッシュは FNV-1a 32bit（8桁 hex）。academic-data.js の base.nodeHash と同じ実装で、
 * 幾何（x/y）を除いた facts の同一性だけを見る。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPMapProposalContract = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KIND = 'normal-proposed';
  var VERSION = 1;
  var HASH_ALGORITHM = 'fnv1a32';

  function fnv1a(text) {
    var hash = 0x811c9dc5;
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('0000000' + hash.toString(16)).slice(-8);
  }

  function compoundRect(c) {
    var w = c.w == null ? '' : c.w;
    var h = c.h == null ? '' : c.h;
    return w + ',' + h;
  }

  // 物質の facts。座標は含めない（座標は配置案が持つ）。
  function nodeFactsLines(compounds) {
    return compounds
      .map(function (c) {
        return [c.id, c.region, c.regionIndex, compoundRect(c), c.incoming || 0, c.outgoing || 0].join('|');
      })
      .sort();
  }

  // 反応の facts。マーカー座標・ラベル・edges（経路）は含めない。
  function reactionFactsLines(reactions) {
    return reactions
      .map(function (r) {
        return JSON.stringify([
          r.id,
          r.type,
          r.state,
          r.tier,
          r.substrates || [],
          r.products || [],
          r.conditions || ''
        ]);
      })
      .sort();
  }

  function classMapLines(classMap) {
    if (!classMap) return [];
    var lines = [];
    var f = classMap.frame;
    lines.push('frame|' + [f ? f.x : '', f ? f.y : '', f ? f.w : '', f ? f.h : ''].join(','));
    (classMap.nodes || []).forEach(function (n) {
      lines.push([n.id, n.x, n.y, n.w, n.h].join('|'));
    });
    return lines.sort();
  }

  function buildBase(D) {
    if (!D || !D.compounds || !D.reactions) throw new Error('proposal-contract: D が不正');
    return {
      normalVersion: D.meta ? D.meta.version : '',
      compoundCount: D.compounds.length,
      reactionCount: D.reactions.length,
      reactionHash: fnv1a(reactionFactsLines(D.reactions).join('\n')),
      nodeIdHash: fnv1a(D.compounds.map(function (c) { return c.id; }).sort().join('\n')),
      classMapHash: fnv1a(classMapLines(D.classMap).join('\n'))
    };
  }

  function sameBase(a, b) {
    if (!a || !b) return false;
    return a.normalVersion === b.normalVersion &&
      a.compoundCount === b.compoundCount &&
      a.reactionCount === b.reactionCount &&
      a.reactionHash === b.reactionHash &&
      a.nodeIdHash === b.nodeIdHash &&
      a.classMapHash === b.classMapHash;
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // 点は {x,y} だけを許す（label の type/cond/leader 用）。
  function isFinitePoint(p) {
    return !!p && typeof p === 'object' && isFiniteNumber(p.x) && isFiniteNumber(p.y);
  }

  // 経路の点は [x,y] でも {x,y} でもよい（保存形式の互換）。
  function isFiniteRoutePoint(p) {
    if (Array.isArray(p)) return p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]);
    return isFinitePoint(p);
  }

  var LABEL_ANCHORS = {
    start: true, end: true, middle: true,
    left: true, right: true, center: true, centre: true
  };
  var LABEL_SIDES = { E: true, W: true, N: true, S: true };
  var TIERS = { primary: true, secondary: true };

  // label は must の全項目を厳密に検査する（center 規約でも検査を省略しない）。
  function leaderLength(leader) {
    var total = 0;
    for (var i = 0; i < leader.length - 1; i++) {
      var a = leader[i];
      var b = leader[i + 1];
      var ax = Array.isArray(a) ? a[0] : a.x;
      var ay = Array.isArray(a) ? a[1] : a.y;
      var bx = Array.isArray(b) ? b[0] : b.x;
      var by = Array.isArray(b) ? b[1] : b.y;
      total += Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    }
    return total;
  }

  function verifyLabel(label, reactionId) {
    if (!label || typeof label !== 'object') return 'ラベルがない';
    if (!LABEL_SIDES[label.side]) return 'label.side が不正';
    var box = label.box;
    if (!box || typeof box !== 'object') return 'label.box がない';
    if (!isFiniteNumber(box.x) || !isFiniteNumber(box.y) ||
      !isFiniteNumber(box.w) || !isFiniteNumber(box.h) || !(box.w > 0) || !(box.h > 0)) {
      return 'label.box が不正';
    }
    if (!isFinitePoint(label.type)) return 'label.type が不正';
    if (label.cond != null && !isFinitePoint(label.cond)) return 'label.cond が不正';
    if (label.anchor != null && !LABEL_ANCHORS[label.anchor]) return 'label.anchor が不正';
    if (label.leader != null) {
      if (!Array.isArray(label.leader) || label.leader.length < 2) return 'label.leader の点列が不正';
      for (var i = 0; i < label.leader.length; i++) {
        if (!isFiniteRoutePoint(label.leader[i])) return 'label.leader に非有限点';
      }
      if (leaderLength(label.leader) > 80 + 1e-6) return 'label.leader が長すぎる（80px 超）';
    }
    return null;
  }

  function verifyRoute(route, key, reaction, markerTier) {
    if (!route || typeof route !== 'object') return 'route がない';
    if (route.reaction !== reaction.id) return 'route.reaction が一致しない';
    if (route.compound == null || typeof route.compound !== 'string') return 'route.compound がない';
    if (route.dir !== 'in' && route.dir !== 'out') return 'route.dir が不正';
    var keyParts = String(key).split('|');
    if (keyParts.length !== 3 || keyParts[0] !== route.reaction || keyParts[1] !== route.dir) {
      return 'route の key が一致しない';
    }
    if (!TIERS[route.tier]) return 'route.tier が不正';
    if (route.tier !== markerTier) return 'route.tier がマーカーと一致しない';
    if (!Array.isArray(route.points) || route.points.length < 2) return 'route.points が不正';
    for (var i = 0; i < route.points.length; i++) {
      if (!isFiniteRoutePoint(route.points[i])) return 'route.points に非有限点';
    }
    var extras = [['gaps', route.gaps], ['bridges', route.bridges]];
    for (var e = 0; e < extras.length; e++) {
      var list = extras[e][1];
      if (list == null) continue;
      if (!Array.isArray(list)) return 'route.' + extras[e][0] + ' が配列でない';
      for (var j = 0; j < list.length; j++) {
        if (!isFiniteRoutePoint(list[j])) return 'route.' + extras[e][0] + ' に非有限点';
      }
    }
    return null;
  }

  // 生成物の配置案が、いまの通常データに対して使えるかを fail-closed で判定する。
  // 返り値は { ok: true } か { ok: false, reason: '...' }。例外は投げない。
  function verifyProposal(proposal, D) {
    var fail = function (reason) { return { ok: false, reason: reason }; };
    if (!proposal || typeof proposal !== 'object') return fail('proposal-data がない');
    if (proposal.kind !== KIND) return fail('種別が normal-proposed ではない');
    if (proposal.version !== VERSION) return fail('提案データの版が未対応: ' + proposal.version);
    if (!D || !D.compounds || !D.reactions) return fail('通常データがない');
    if (!sameBase(proposal.base, buildBase(D))) return fail('提案データが通常データと一致しない');

    var positions = proposal.positions;
    if (!positions || typeof positions !== 'object') return fail('positions がない');
    var ids = Object.keys(positions);
    if (ids.length !== D.compounds.length) return fail('positions の件数が違う: ' + ids.length);
    for (var i = 0; i < D.compounds.length; i++) {
      var p = positions[D.compounds[i].id];
      if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y) ||
        !isFiniteNumber(p.w) || !isFiniteNumber(p.h) || !(p.w > 0) || !(p.h > 0)) {
        return fail('positions が欠落/不正: ' + D.compounds[i].id);
      }
    }

    var markers = proposal.markers;
    if (!markers || typeof markers !== 'object') return fail('markers がない');
    if (Object.keys(markers).length !== D.reactions.length) {
      return fail('markers の件数が違う: ' + Object.keys(markers).length);
    }
    var routes = proposal.routes;
    if (!routes || typeof routes !== 'object') return fail('routes がない');

    var expectedRoutes = 0;
    for (var ri = 0; ri < D.reactions.length; ri++) {
      var r = D.reactions[ri];
      var m = markers[r.id];
      if (!m || !isFiniteNumber(m.x) || !isFiniteNumber(m.y)) return fail('marker が欠落/不正: ' + r.id);
      var routeTier = m.tier;
      if (!TIERS[routeTier] || routeTier !== r.tier) return fail('marker.tier が通常データと一致しない: ' + r.id);
      var labelProblem = verifyLabel(m.label, r.id);
      if (labelProblem) return fail('全162ラベルが必要（' + r.id + ': ' + labelProblem + '）');
      for (var ei = 0; ei < r.edges.length; ei++) {
        var key = r.id + '|' + r.edges[ei].dir + '|' + r.edges[ei].id;
        expectedRoutes++;
        if (!routes[key]) return fail('route が欠落: ' + key);
        var routeProblem = verifyRoute(routes[key], key, r, routeTier);
        if (routeProblem) return fail('route が不正（' + key + ': ' + routeProblem + '）');
      }
    }
    if (Object.keys(routes).length !== expectedRoutes) {
      return fail('routes の件数が違う: ' + Object.keys(routes).length + ' / ' + expectedRoutes);
    }

    var canvas = proposal.canvas;
    if (!canvas || !isFiniteNumber(canvas.x) || !isFiniteNumber(canvas.y) ||
      !isFiniteNumber(canvas.w) || !isFiniteNumber(canvas.h) || !(canvas.w > 0) || !(canvas.h > 0)) {
      return fail('canvas がない');
    }
    if (proposal.regionFocus != null) {
      if (typeof proposal.regionFocus !== 'object') return fail('regionFocus が不正');
      var regionIds = Object.keys(proposal.regionFocus);
      for (var gi = 0; gi < regionIds.length; gi++) {
        var f = proposal.regionFocus[regionIds[gi]];
        if (!f || !isFiniteNumber(f.x) || !isFiniteNumber(f.y) ||
          !isFiniteNumber(f.w) || !isFiniteNumber(f.h) || !(f.w > 0) || !(f.h > 0)) {
          return fail('regionFocus が不正: ' + regionIds[gi]);
        }
      }
    }
    return { ok: true };
  }

  return {
    KIND: KIND,
    VERSION: VERSION,
    HASH_ALGORITHM: HASH_ALGORITHM,
    fnv1a: fnv1a,
    nodeFactsLines: nodeFactsLines,
    reactionFactsLines: reactionFactsLines,
    classMapLines: classMapLines,
    buildBase: buildBase,
    sameBase: sameBase,
    verifyProposal: verifyProposal
  };
});
