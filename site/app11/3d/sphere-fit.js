/*
 * app11/3d 球ビュー — 選択時の「必要な分だけズームアウト」
 *
 * 選択物質と、その直接の反応グループ全端点（基質＋生成物）の名前カードが、
 * ヘッダー・ツールバー・詳細パネルを除いた実測 usable 領域に収まるよう、
 * カメラを「今より外へ」だけ動かす。
 *
 * 方針:
 *   - ズームインはしない。既に収まっていれば距離をそのまま返す。
 *   - 球の中（inside）の見え方は変えない。位置・FOV はそのまま返し、
 *     裏側の端点は従来どおり縁の仮想カードに委ねる（報告のみ）。
 *   - 手動ズーム・ドラッグ・検索入力の挙動は変えない（選択時にだけ呼ぶ）。
 *   - カード実寸は renderer.js の cardMetrics をそのまま使う（別実装しない）。
 *   - 裏半球カリングはしない。renderer の選択描画と同じ全端点を評価する。
 *   - どうズームしても収まらない端点は従来どおり縁の仮想カードへ委ね、
 *     missedIds として報告する。
 *   - 距離の探索は単調性を前提にした有界の指数探索＋二分探索
 *     （反復回数は固定。解が無ければ現在のズームを維持する）。
 *
 * Node では require、ブラウザでは window.RP3DSphereFit。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./sphere-camera.js')(require('./projection.js')),
      require('./renderer.js')
    );
  } else {
    root.RP3DSphereFit = factory(root.RP3DProjection, root.RP3DRenderer);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, R) {
  'use strict';

  // カードの外側に確保する余白（px）。縁の仮想カードの edgeInset(10) と揃える。
  var FIT_PADDING = 8;
  var SEARCH_STEPS = 32;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  // 選択物質＋直接の反応グループ全端点（重複なし・データ順で決定的）。
  function collectSelectionIds(model, selectedId, layer) {
    var out = [];
    var seen = Object.create(null);
    if (!model || !selectedId || !model.byId || !model.byId[selectedId]) return out;
    function add(id) {
      if (!id || seen[id] || !model.byId[id]) return;
      seen[id] = true;
      out.push(id);
    }
    add(selectedId);
    var groups = typeof model.groupsForCompound === 'function'
      ? model.groupsForCompound(selectedId, layer)
      : [];
    groups.forEach(function (group) {
      (group.substrateIds || []).forEach(add);
      (group.productIds || []).forEach(add);
    });
    return out;
  }

  // renderer と同じ実寸でカードを測る（selected は選択カードの寸法）。
  function measureCards(model, ids, viewport, selectedId) {
    var out = [];
    ids.forEach(function (id) {
      var compound = model.byId[id];
      if (!compound) return;
      var metrics = R.cardMetrics(compound, viewport, id === selectedId);
      out.push({ id: id, width: metrics.width, height: metrics.height });
    });
    return out;
  }

  function paddingFor(usable, padding) {
    var p = padding == null ? FIT_PADDING : padding;
    var limit = Math.max(0, Math.min(usable.width, usable.height) / 2 - 1);
    return clamp(p, 0, limit);
  }

  function insideUsable(rect, usable, pad) {
    return rect.x >= usable.x + pad - 1e-6 &&
      rect.y >= usable.y + pad - 1e-6 &&
      rect.x + rect.width <= usable.x + usable.width - pad + 1e-6 &&
      rect.y + rect.height <= usable.y + usable.height - pad + 1e-6;
  }

  // そのカメラで各カードが usable 内に収まるか。投影できない（near より手前・
  // inside の背後）カードは inside=false（＝縁の仮想カード側）。
  function evaluate(camera, cards, points, viewport, usable, pad) {
    var basis = P.cameraBasis(camera);
    var members = [];
    var insideCount = 0;
    cards.forEach(function (card) {
      var point = points[card.id];
      var projected = point
        ? P.cameraViewWithBasis(camera, basis, point, viewport)
        : null;
      var member = { id: card.id, inside: false, projected: null, rect: null };
      if (projected && isFinite(projected.x) && isFinite(projected.y)) {
        var rect = {
          x: projected.x - card.width / 2,
          y: projected.y - card.height / 2,
          width: card.width,
          height: card.height
        };
        member.projected = { x: projected.x, y: projected.y };
        member.rect = rect;
        member.inside = insideUsable(rect, usable, pad);
      }
      if (member.inside) insideCount += 1;
      members.push(member);
    });
    return {
      members: members,
      insideCount: insideCount,
      total: members.length,
      allInside: insideCount === members.length
    };
  }

  function withDistance(camera, distance) {
    var next = P.cloneCamera(camera);
    next.distance = distance;
    return next;
  }

  function targetIdsOf(members) {
    var set = Object.create(null);
    var ids = [];
    members.forEach(function (member) {
      if (!member.inside) return;
      set[member.id] = true;
      ids.push(member.id);
    });
    return { set: set, ids: ids };
  }

  function missedIdsOf(members) {
    var ids = [];
    members.forEach(function (member) {
      if (!member.inside) ids.push(member.id);
    });
    return ids;
  }

  function fitsTarget(members, targetSet) {
    for (var i = 0; i < members.length; i++) {
      var member = members[i];
      if (targetSet[member.id] && !member.inside) return false;
    }
    return true;
  }

  // outside: 距離だけを増やす。球の外に留まる範囲でクランプ。
  function fitOutside(camera, cards, points, viewport, usable, pad, baseEval) {
    var radius = camera.radius;
    var range = P.outsideDistanceRange
      ? P.outsideDistanceRange(radius)
      : { min: radius, max: radius * 12 };
    var baseDistance = camera.distance;
    var maxDistance = range.max;
    var info = {
      mode: 'outside',
      count: cards.length,
      insideCount: baseEval.insideCount,
      targetCount: 0,
      missedIds: [],
      zoomedOut: false,
      limited: false,
      fitted: false,
      distance: baseDistance,
      fov: camera.fov
    };
    if (!(maxDistance > baseDistance + 1e-9)) {
      // 既に上限。これ以上は動かさない（縁の仮想カードに委ねる）。
      info.missedIds = missedIdsOf(baseEval.members);
      info.limited = info.missedIds.length > 0;
      return { camera: camera, info: info };
    }
    var maxEval = evaluate(withDistance(camera, maxDistance), cards, points, viewport, usable, pad);
    var target = targetIdsOf(maxEval.members);
    info.targetCount = target.ids.length;
    info.missedIds = missedIdsOf(maxEval.members);
    if (!target.ids.length) {
      info.limited = true;
      return { camera: camera, info: info };
    }
    if (fitsTarget(baseEval.members, target.set)) {
      // 収まる範囲はもう収まっている。ズームを変えない。
      info.limited = info.missedIds.length > 0;
      return { camera: camera, info: info };
    }
    var lo = baseDistance;
    var hi = maxDistance;
    for (var i = 0; i < SEARCH_STEPS; i++) {
      var mid = Math.sqrt(lo * hi);
      if (!(mid > lo + 1e-9) || !(mid < hi - 1e-9)) break;
      var midEval = evaluate(withDistance(camera, mid), cards, points, viewport, usable, pad);
      if (fitsTarget(midEval.members, target.set)) hi = mid;
      else lo = mid;
    }
    var next = withDistance(camera, hi);
    info.distance = hi;
    info.zoomedOut = hi > baseDistance + 1e-6;
    info.fitted = info.missedIds.length === 0;
    info.limited = info.missedIds.length > 0;
    return { camera: next, info: info };
  }

  // inside: 球の中の見え方（位置・FOV）は変えない。
  // 裏側の端点は従来どおり縁の仮想カードが受け持つ（ここでは報告だけ）。
  function insideReport(camera, cards, baseEval) {
    var missed = missedIdsOf(baseEval.members);
    return {
      camera: camera,
      info: {
        mode: 'inside',
        count: cards.length,
        insideCount: baseEval.insideCount,
        targetCount: baseEval.insideCount,
        missedIds: missed,
        zoomedOut: false,
        limited: missed.length > 0,
        fitted: missed.length === 0,
        unchanged: true,
        distance: 0,
        fov: camera.fov
      }
    };
  }

  // 選択の再フレーミング後に呼ぶ。options:
  //   model / selectedId / layer / layout / viewport / usableRect / padding
  // 戻り値: { camera, info }。camera は「今より内側へは動かない」カメラ。
  function fitSelectionCamera(camera, options) {
    options = options || {};
    var fallback = {
      camera: camera,
      info: {
        mode: camera ? camera.mode : null,
        count: 0,
        insideCount: 0,
        targetCount: 0,
        missedIds: [],
        zoomedOut: false,
        limited: false,
        fitted: true,
        distance: camera ? camera.distance : 0,
        fov: camera ? camera.fov : 0
      }
    };
    if (!camera || !options.model || !options.layout || !options.layout.points) return fallback;
    if (!options.selectedId) return fallback;
    var viewport = options.viewport;
    var usable = options.usableRect;
    if (!viewport || !usable || !(usable.width > 0) || !(usable.height > 0)) return fallback;
    var layer = options.layer === 'normal' ? 'normal' : 'academic';
    var ids = collectSelectionIds(options.model, options.selectedId, layer);
    var cards = measureCards(options.model, ids, viewport, options.selectedId);
    if (!cards.length) return fallback;
    var pad = paddingFor(usable, options.padding);
    var baseEval = evaluate(camera, cards, options.layout.points, viewport, usable, pad);
    var result;
    if (baseEval.allInside) {
      result = {
        camera: camera,
        info: {
          mode: camera.mode,
          count: cards.length,
          insideCount: baseEval.insideCount,
          targetCount: cards.length,
          missedIds: [],
          zoomedOut: false,
          limited: false,
          fitted: true,
          distance: camera.distance,
          fov: camera.fov
        }
      };
    } else if (camera.mode === 'inside') {
      result = insideReport(camera, cards, baseEval);
    } else {
      result = fitOutside(camera, cards, options.layout.points, viewport, usable, pad, baseEval);
    }
    result.info.pad = pad;
    return result;
  }

  return {
    FIT_PADDING: FIT_PADDING,
    SEARCH_STEPS: SEARCH_STEPS,
    collectSelectionIds: collectSelectionIds,
    measureCards: measureCards,
    paddingFor: paddingFor,
    insideUsable: insideUsable,
    evaluate: evaluate,
    fitSelectionCamera: fitSelectionCamera
  };
});
