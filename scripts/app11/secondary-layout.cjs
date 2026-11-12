/**
 * 有機反応マップ（app11）— 補助（secondary）の配置と配線
 *
 * 主要の配線を先に固定し、その空いた面・外側に補助を置く。
 * 主要線を横切らない候補を優先し、無理な場合だけ交差を残す（隠さない）。
 * 補助同士の交差は許容する（S–S）。補助ノード・ラベルは主要線の保護帯へ入れない。
 */
'use strict';

const G = require('./geometry.cjs');
const R = require('./priority-router.cjs');
const B = require('./backbone-layout.cjs');

function placeSecondary(scene, source) {
  const secondary = source.reactions.filter((r) => source.priority.entries.get(r.id).tier === 'secondary');
  const degree = B.totalDegrees(source);
  const primaryRoutes = scene.routes.filter((r) => r.tier === 'primary' && r.points);
  const primaryObstacles = R.makeObstacles(source, scene.compounds, scene.reactions, primaryRoutes, 'primary');
  const bounds = sceneBounds(scene);
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };

  // 1. 主要の接続点から補助グラフをたどり、反応点と補助物質を近接して置く。
  const placedReactions = new Set();
  const queue = secondary
    .filter((r) => unique(r.substrates.concat(r.products)).some((id) => scene.compounds.has(id)))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  while (queue.length) {
    const reaction = queue.shift();
    if (placedReactions.has(reaction.id)) continue;
    const endpoints = unique(reaction.substrates.concat(reaction.products));
    const attachments = endpoints.filter((id) => scene.compounds.has(id));
    if (!attachments.length) continue;
    const candidates = candidatePositions(attachments, scene.compounds, bounds, center);
    const chosen = chooseMarker(reaction, candidates, attachments, scene, primaryObstacles, bounds);
    scene.reactions.set(reaction.id, {
      x: chosen.x,
      y: chosen.y,
      tier: 'secondary',
      typeLabel: reaction.typeLabel,
      conditions: reaction.conditions
    });
    placedReactions.add(reaction.id);
    const unplaced = endpoints.filter((id) => !scene.compounds.has(id));
    placeFan(chosen, unplaced, attachments, scene, primaryObstacles, bounds, center, degree);
    for (const id of unplaced) {
      for (const next of secondary) {
        if (placedReactions.has(next.id)) continue;
        if (next.substrates.includes(id) || next.products.includes(id)) queue.push(next);
      }
    }
  }

  // 2. 主要の接続点を持たない補助成分は、外周の専用ベイにまとめる。
  const remaining = secondary.filter((r) => !placedReactions.has(r.id));
  const remainingSet = new Set(remaining.map((r) => r.id));
  const components = [];
  const seen = new Set();
  for (const reaction of remaining) {
    if (seen.has(reaction.id)) continue;
    const comp = [];
    const stack = [reaction];
    seen.add(reaction.id);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const id of unique(cur.substrates.concat(cur.products))) {
        for (const next of remaining) {
          if (seen.has(next.id) || !remainingSet.has(next.id)) continue;
          if (next.substrates.includes(id) || next.products.includes(id)) {
            seen.add(next.id);
            stack.push(next);
          }
        }
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1));
  let bayY = bounds.y + 120;
  for (const comp of components) {
    const bay = { x: bounds.x - 200, y: bayY };
    bayY += 220 + comp.length * 90;
    for (const reaction of comp.sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const point = findFreePosition(bay, { w: 40, h: 40 }, scene, primaryObstacles, bounds, center);
      scene.reactions.set(reaction.id, {
        x: point.x,
        y: point.y,
        tier: 'secondary',
        typeLabel: reaction.typeLabel,
        conditions: reaction.conditions
      });
      for (const id of unique(reaction.substrates.concat(reaction.products))) {
        if (scene.compounds.has(id)) continue;
        placeFan(point, [id], [], scene, primaryObstacles, bounds, center, degree);
      }
      bay.y += 120;
    }
  }

  // 2.5 補助は主要の外側の空きへ配置する（ラックは使わない）。
  // arrangeRack(scene, source, secondary, bounds);

  // 2.8 既知の衝突箇所の押し離しは行わない（局所移動が別の衝突を生むため）。
  // applySecondaryNudges(scene, bounds);

  // 2.9 反応点同士が近すぎる場合だけ押し離す。
  separateSecondaryMarkers(scene);

  // 2.9 孤立棚・外周の下端を少し詰める（キャンバス高さの頭打ち対策）。
  const bottomAdjust = [
    ['oleic-acid', -200, -100],
    ['sodium-oleate', -100, -380]
  ];
  for (const [id, dx, dy] of bottomAdjust) {
    const node = scene.compounds.get(id);
    if (!node) continue;
    const size = { w: node.w, h: node.h };
    const placed = findFreePosition(
      { x: node.x + node.w / 2 + dx, y: node.y + node.h / 2 + dy },
      size,
      scene,
      primaryObstacles,
      bounds,
      { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
      id
    );
    node.x = placed.x - size.w / 2;
    node.y = placed.y - size.h / 2;
  }

  // 3. 経路オブジェクトとポート。
  const usedPorts = new Map();
  for (const route of primaryRoutes) {
    if (!usedPorts.has(route.compoundId)) usedPorts.set(route.compoundId, []);
    usedPorts.get(route.compoundId).push(route.compoundPort);
  }
  for (const reaction of secondary) {
    for (const id of reaction.substrates) addRoute(scene, reaction, 'in', id);
    for (const id of reaction.products) addRoute(scene, reaction, 'out', id);
  }
  const secondaryRoutes = scene.routes.filter((r) => r.tier === 'secondary');
  for (const route of secondaryRoutes) {
    const node = scene.compounds.get(route.compoundId);
    const marker = scene.reactions.get(route.reactionId);
    route.compoundNode = node;
    route.compoundPort = chooseSecondaryPort(node, marker, usedPorts.get(route.compoundId) || [], primaryObstacles);
    if (!usedPorts.has(route.compoundId)) usedPorts.set(route.compoundId, []);
    usedPorts.get(route.compoundId).push(route.compoundPort);
  }
  assignSecondaryMarkerPorts(secondaryRoutes, scene.reactions, primaryRoutes);

  // 4. 補助ラベルは地図に出さない（カードで読む）。配線前に障害物へ入れない。
  // 5. 補助の配線。主要線・ノード・ラベルは避ける。補助同士の交差は許す。
  // 5. 補助の配線。主要線・ノード・ラベルは避ける。補助同士の交差は許す。
  routeSecondaryAll(scene, source, secondaryRoutes, primaryObstacles, bounds);
  relocateSecondaryMarkers(scene, source, secondaryRoutes, primaryObstacles, bounds);
  repairSecondaryOverlaps(scene, source, secondaryRoutes, primaryObstacles, bounds);
  return { primaryObstacles, secondaryRoutes };
}

function routeSecondaryAll(scene, source, routes, primaryObstacles, bounds) {
  const secondaryObstacles = R.makeObstacles(source, scene.compounds, scene.reactions, [], 'secondary', { labels: true });
  const routingBounds = unionBounds(bounds, scene.compounds, scene.reactions);
  for (const route of routes) {
    const ownRects = secondaryObstacles.rects.filter((r) =>
      !(r.kind === 'node' && r.id === route.compoundId) &&
      !(r.kind === 'label' && r.id === route.reactionId) &&
      !(r.kind === 'label-cond' && r.id === route.reactionId));
    const ownDiscs = secondaryObstacles.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId));
    const obstacles = {
      rects: ownRects,
      discs: ownDiscs,
      segments: []
    };
    const direct = R.segmentClear(route.compoundPort, route.markerPort, obstacles, R.SECONDARY_PAD);
    const directCross = direct ? countPrimaryCrossings([route.compoundPort, route.markerPort], primaryObstacles.segments, route.compoundId) : Infinity;
    if (direct && directCross === 0) {
      route.points = [route.compoundPort, route.markerPort];
      route.fallback = false;
      continue;
    }
    let path = R.gridRoute(route.compoundPort, route.markerPort, obstacles, routingBounds, {
      primary: false,
      margin: 500,
      softSegments: primaryObstacles.segments
    });
    if (!path) path = bentPath(route.compoundPort, route.markerPort, obstacles);
    if (!path) path = routeAroundNodes(route.compoundPort, route.markerPort, obstacles);
    if (path) {
      const pathCross = countPrimaryCrossings(path, primaryObstacles.segments, route.compoundId);
      const directLen = Math.hypot(route.markerPort.x - route.compoundPort.x, route.markerPort.y - route.compoundPort.y);
      if (direct && pathCross >= directCross && G.polylineLength(path) > directLen * 1.6) {
        route.points = [route.compoundPort, route.markerPort];
        route.fallback = false;
      } else {
        route.points = R.simplifyPath(path, obstacles, R.SECONDARY_PAD);
        route.fallback = false;
      }
    } else {
      route.points = [route.compoundPort, route.markerPort];
      route.fallback = true;
    }
  }
}

function bentPath(start, end, obstacles) {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const candidates = [
    [{ x: end.x, y: start.y }],
    [{ x: start.x, y: end.y }],
    [{ x: mx, y: start.y }, { x: mx, y: end.y }],
    [{ x: start.x, y: my }, { x: end.x, y: my }]
  ];
  for (const vias of candidates) {
    const pts = [start].concat(vias, [end]);
    let ok = true;
    for (let i = 0; i < pts.length - 1; i++) {
      if (!R.segmentClear(pts[i], pts[i + 1], obstacles, R.SECONDARY_PAD)) {
        ok = false;
        break;
      }
    }
    if (ok) return pts;
  }
  return null;
}

function routeAroundNodes(start, end, obstacles) {
  const blockers = obstacles.rects.filter((r) =>
    r.kind === 'node' && G.segmentRect(start, end, G.inflate(r.rect, 4)));
  if (!blockers.length) return null;
  const candidates = [];
  for (const r of blockers) {
    const box = G.inflate(r.rect, 16);
    candidates.push(
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x, y: box.y + box.h },
      { x: box.x + box.w, y: box.y + box.h },
      { x: (box.x + box.x + box.w) / 2, y: box.y },
      { x: (box.x + box.x + box.w) / 2, y: box.y + box.h }
    );
  }
  const tryPath = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      if (!R.segmentClear(pts[i], pts[i + 1], obstacles, R.SECONDARY_PAD)) return false;
    }
    return true;
  };
  let best = null;
  for (const via of candidates) {
    const pts = [start, via, end];
    if (!tryPath(pts)) continue;
    const len = G.polylineLength(pts);
    if (!best || len < best.len) best = { pts, len };
  }
  if (best) return best.pts;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const pts = [start, candidates[i], candidates[j], end];
      if (!tryPath(pts)) continue;
      const len = G.polylineLength(pts);
      if (!best || len < best.len) best = { pts, len };
    }
  }
  return best ? best.pts : null;
}

function targetedSecondaryRepair(scene, source, routes, primaryObstacles, bounds) {
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  for (let pass = 0; pass < 3; pass++) {
    const obstacles = R.makeObstacles(source, scene.compounds, scene.reactions, [], 'secondary', { labels: true });
    let moves = 0;
    for (const route of routes) {
      if (moves >= 3) break;
      let blocker = null;
      let blockerType = null;
      for (const seg of G.polylineSegments(route.points || [])) {
        for (const rect of obstacles.rects) {
          if (rect.kind === 'node' && rect.id === route.compoundId) continue;
          if (!G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) continue;
          blocker = { id: rect.id, rect: rect.rect, kind: rect.kind };
          blockerType = rect.kind;
          break;
        }
        if (blocker) break;
      }
      if (!blocker) continue;
      const marker = scene.reactions.get(route.reactionId);
      let target = null;
      let isMarker = false;
      if (blockerType === 'node') {
        const node = scene.compounds.get(blocker.id);
        if (node && node.tier === 'secondary') target = node;
        else if (route.compoundNode && route.compoundNode.tier === 'secondary') target = route.compoundNode;
        else if (marker && marker.tier === 'secondary') { target = marker; isMarker = true; }
      } else {
        if (route.compoundNode && route.compoundNode.tier === 'secondary') target = route.compoundNode;
        else if (marker && marker.tier === 'secondary') { target = marker; isMarker = true; }
      }
      if (!target) continue;
      const tc = isMarker ? { x: target.x, y: target.y } : R.centerOf(target);
      const bc = blockerType === 'node'
        ? R.centerOf(scene.compounds.get(blocker.id))
        : { x: blocker.rect.x + blocker.rect.w / 2, y: blocker.rect.y + blocker.rect.h / 2 };
      let ux = tc.x - bc.x;
      let uy = tc.y - bc.y;
      let ul = Math.hypot(ux, uy);
      if (ul < 1e-6) { ux = 1; uy = 0; ul = 1; }
      ux /= ul; uy /= ul;
      const size = isMarker ? { w: 24, h: 24 } : { w: target.w, h: target.h };
      for (const dist of [80, 120, 160]) {
        const candidate = { x: tc.x + ux * dist, y: tc.y + uy * dist };
        if (candidate.x < bounds.x - 120 || candidate.x > bounds.x + bounds.w + 120 ||
          candidate.y < bounds.y - 120 || candidate.y > bounds.y + bounds.h + 120) continue;
        const placed = findFreePosition(candidate, size, scene, primaryObstacles, bounds, center, isMarker ? null : (route.compoundNode === target ? route.compoundId : blocker.id));
        if (Math.hypot(placed.x - tc.x, placed.y - tc.y) < 40) continue;
        if (isMarker) {
          target.x = placed.x;
          target.y = placed.y;
        } else {
          scene.compounds.set(route.compoundNode === target ? route.compoundId : blocker.id, {
            x: placed.x - size.w / 2,
            y: placed.y - size.h / 2,
            w: size.w,
            h: size.h,
            tier: 'secondary'
          });
        }
        moves++;
        break;
      }
      if (moves) break;
    }
    // 反応点同士の近接も押し離す。
    const markers = [...scene.reactions.values()].filter((r) => r.tier === 'secondary');
    for (let i = 0; i < markers.length && moves < 5; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        if (Math.hypot(markers[i].x - markers[j].x, markers[i].y - markers[j].y) >= 26) continue;
        const dx = markers[j].x - markers[i].x || 1;
        const dy = markers[j].y - markers[i].y || 1;
        const len = Math.hypot(dx, dy) || 1;
        markers[j].x += (dx / len) * 30;
        markers[j].y += (dy / len) * 30;
        moves++;
        break;
      }
    }
    if (!moves) break;
    const usedPorts = new Map();
    for (const route of scene.routes.filter((r) => r.tier === 'primary')) {
      if (!usedPorts.has(route.compoundId)) usedPorts.set(route.compoundId, []);
      usedPorts.get(route.compoundId).push(route.compoundPort);
    }
    for (const route of routes) {
      const node = scene.compounds.get(route.compoundId);
      const marker = scene.reactions.get(route.reactionId);
      route.compoundNode = node;
      route.compoundPort = chooseSecondaryPort(node, marker, usedPorts.get(route.compoundId) || [], primaryObstacles);
      if (!usedPorts.has(route.compoundId)) usedPorts.set(route.compoundId, []);
      usedPorts.get(route.compoundId).push(route.compoundPort);
    }
    assignSecondaryMarkerPorts(routes, scene.reactions, scene.routes.filter((r) => r.tier === 'primary'));
    routeSecondaryAll(scene, source, routes, primaryObstacles, bounds);
  }
}

function relocateSecondaryMarkers(scene, source, routes, primaryObstacles, bounds) {
  const byReaction = new Map();
  for (const route of routes) {
    if (!byReaction.has(route.reactionId)) byReaction.set(route.reactionId, []);
    byReaction.get(route.reactionId).push(route);
  }
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (const [rid, group] of byReaction) {
      const obstacles = R.makeObstacles(source, scene.compounds, scene.reactions, [], 'secondary', { labels: true });
      if (countRouteHitsFor(group, obstacles) === 0) continue;
      const marker = scene.reactions.get(rid);
      const reaction = source.reactions.find((r) => r.id === rid);
      const endpoints = unique(reaction.substrates.concat(reaction.products));
      const secondaryEndpoints = [];
      let improved = false;
      for (const id of secondaryEndpoints) {
        const node = scene.compounds.get(id);
        const savedNode = { x: node.x, y: node.y, w: node.w, h: node.h };
        let best = null;
        let bestScore = Infinity;
        for (let ai = 0; ai < 24; ai++) {
          const angle = (ai / 24) * Math.PI * 2;
          for (const dist of [80, 120, 160, 200, 260]) {
            const cx = savedNode.x + savedNode.w / 2 + Math.cos(angle) * dist;
            const cy = savedNode.y + savedNode.h / 2 + Math.sin(angle) * dist;
            const rect = G.rect(cx - savedNode.w / 2, cy - savedNode.h / 2, savedNode.w, savedNode.h);
            if (!rectFree(rect, primaryObstacles, 8)) continue;
            if (collides({ x: cx, y: cy }, savedNode, scene.compounds, id)) continue;
            scene.compounds.set(id, { x: rect.x, y: rect.y, w: savedNode.w, h: savedNode.h, tier: 'secondary' });
            for (const route of group) {
              if (route.compoundId !== id) continue;
              route.compoundNode = scene.compounds.get(id);
              route.compoundPort = chooseSecondaryPort(route.compoundNode, marker, [], primaryObstacles);
            }
            routeSecondaryAll(scene, source, group, primaryObstacles, bounds);
            const hits = countRouteHitsFor(group, obstacles);
            const len = group.reduce((sum, r) => sum + G.polylineLength(r.points || []), 0);
            const score = hits * 1e9 + len;
            if (score < bestScore) {
              bestScore = score;
              best = { x: rect.x, y: rect.y };
            }
            scene.compounds.set(id, savedNode);
          }
        }
        if (best) {
          scene.compounds.set(id, { x: best.x, y: best.y, w: savedNode.w, h: savedNode.h, tier: 'secondary' });
          for (const route of group) {
            if (route.compoundId !== id) continue;
            route.compoundNode = scene.compounds.get(id);
            route.compoundPort = chooseSecondaryPort(route.compoundNode, marker, [], primaryObstacles);
          }
          routeSecondaryAll(scene, source, group, primaryObstacles, bounds);
          improved = true;
          break;
        }
        scene.compounds.set(id, savedNode);
        for (const route of group) {
          if (route.compoundId !== id) continue;
          route.compoundNode = scene.compounds.get(id);
          route.compoundPort = chooseSecondaryPort(route.compoundNode, marker, [], primaryObstacles);
        }
        routeSecondaryAll(scene, source, group, primaryObstacles, bounds);
      }
      if (improved) {
        changed++;
        continue;
      }
      const saved = { x: marker.x, y: marker.y };
      let best = null;
      let bestScore = Infinity;
      for (let ai = 0; ai < 24; ai++) {
        const angle = (ai / 24) * Math.PI * 2;
        for (const dist of [30, 60, 90, 120, 160, 200, 240]) {
          const candidate = { x: saved.x + Math.cos(angle) * dist, y: saved.y + Math.sin(angle) * dist };
          const placed = findFreePosition(candidate, { w: 24, h: 24 }, scene, primaryObstacles, bounds, center, null);
          if (Math.hypot(placed.x - saved.x, placed.y - saved.y) > dist + 40) continue;
          marker.x = placed.x;
          marker.y = placed.y;
          assignMarkerPortsFor(group, marker, scene.routes.filter((r) => r.tier === 'primary'));
          routeSecondaryAll(scene, source, group, primaryObstacles, bounds);
          const hits = countRouteHitsFor(group, obstacles);
          const len = group.reduce((sum, r) => sum + G.polylineLength(r.points || []), 0);
          const score = hits * 1e9 + len;
          if (score < bestScore) {
            bestScore = score;
            best = { x: marker.x, y: marker.y };
          }
        }
      }
      if (best) {
        marker.x = best.x;
        marker.y = best.y;
        assignMarkerPortsFor(group, marker, scene.routes.filter((r) => r.tier === 'primary'));
        routeSecondaryAll(scene, source, group, primaryObstacles, bounds);
        // マーカー移動で他の経路の通過判定も変わるため、全補助を再検証・再配線する。
        routeSecondaryAll(scene, source, routes, primaryObstacles, bounds);
        changed++;
      } else {
        marker.x = saved.x;
        marker.y = saved.y;
      }
    }
    if (!changed) break;
  }
}

function assignMarkerPortsFor(routes, marker, primaryRoutes) {
  const primaryAngles = [];
  for (const route of primaryRoutes) {
    if (route.reactionId === marker.id) continue;
  }
  const list = routes.slice().sort((a, b) => {
    const ca = R.centerOf(a.compoundNode);
    const cb = R.centerOf(b.compoundNode);
    return Math.atan2(ca.y - marker.y, ca.x - marker.x) - Math.atan2(cb.y - marker.y, cb.x - marker.x) || (a.key < b.key ? -1 : 1);
  });
  for (let i = 0; i < list.length; i++) {
    const route = list[i];
    const c = R.centerOf(route.compoundNode);
    let angle = Math.atan2(c.y - marker.y, c.x - marker.x);
    route.markerPort = {
      x: marker.x + Math.cos(angle) * G.MARKER_PORT_R,
      y: marker.y + Math.sin(angle) * G.MARKER_PORT_R
    };
    route.markerAngle = angle;
  }
}

function countRouteHitsFor(routes, obstacles) {
  let hits = 0;
  for (const route of routes) {
    for (const seg of G.polylineSegments(route.points || [])) {
      for (const rect of obstacles.rects) {
        if (rect.kind === 'node' && rect.id === route.compoundId) continue;
        if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) hits++;
      }
    }
  }
  return hits;
}

function repairSecondaryGeometry(scene, source, routes, primaryObstacles, bounds) {
  for (let pass = 0; pass < 2; pass++) {
    const obstacles = R.makeObstacles(source, scene.compounds, scene.reactions, [], 'secondary', { labels: true });
    let moved = 0;
    const seen = new Set();
    for (const route of routes) {
      for (const seg of G.polylineSegments(route.points || [])) {
        for (const rect of obstacles.rects) {
          if (rect.kind !== 'node' || rect.id === route.compoundId) continue;
          if (!G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) continue;
          const blocking = scene.compounds.get(rect.id);
          if (!blocking) continue;
          const key = route.key + '|' + rect.id;
          if (seen.has(key)) continue;
          seen.add(key);
          let target = null;
          let targetIsMarker = false;
          if (blocking.tier === 'secondary') {
            target = blocking;
          } else if (route.compoundNode && route.compoundNode.tier === 'secondary') {
            target = route.compoundNode;
          } else {
            const marker = scene.reactions.get(route.reactionId);
            if (marker && marker.tier === 'secondary') {
              target = marker;
              targetIsMarker = true;
            }
          }
          if (!target) continue;
          const targetCenter = targetIsMarker ? { x: target.x, y: target.y } : R.centerOf(target);
          const blockerCenter = R.centerOf(blocking);
          let ux = targetCenter.x - blockerCenter.x;
          let uy = targetCenter.y - blockerCenter.y;
          let ul = Math.hypot(ux, uy);
          if (ul < 1e-6) {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const len = Math.hypot(dx, dy) || 1;
            ux = -dy / len;
            uy = dx / len;
            ul = 1;
          }
          ux /= ul;
          uy /= ul;
          const size = targetIsMarker ? { w: 24, h: 24 } : { w: target.w, h: target.h };
          const options = [];
          for (const dist of [50, 80, 120, 170]) {
            options.push({ x: targetCenter.x + ux * dist, y: targetCenter.y + uy * dist });
            options.push({ x: targetCenter.x + ux * dist * 0.6 - uy * dist * 0.8, y: targetCenter.y + uy * dist * 0.6 + ux * dist * 0.8 });
            options.push({ x: targetCenter.x + ux * dist * 0.6 + uy * dist * 0.8, y: targetCenter.y + uy * dist * 0.6 - ux * dist * 0.8 });
          }
          for (const candidate of options) {
            const ignoreId = targetIsMarker ? null : (route.compoundNode === target ? route.compoundId : rect.id);
            const placed = findFreePosition(candidate, size, scene, primaryObstacles, bounds, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }, ignoreId);
            if (Math.hypot(placed.x - targetCenter.x, placed.y - targetCenter.y) < 4) continue;
            if (targetIsMarker) {
              target.x = placed.x;
              target.y = placed.y;
            } else {
              scene.compounds.set(route.compoundNode === target ? route.compoundId : rect.id, {
                x: placed.x - size.w / 2,
                y: placed.y - size.h / 2,
                w: size.w,
                h: size.h,
                tier: 'secondary'
              });
            }
            moved++;
            break;
          }
        }
      }
    }
    if (!moved) break;
    // ノードを動かしたら、ポートを割り直して全補助を再配線する。
    const usedPorts = new Map();
    for (const route of scene.routes.filter((r) => r.tier === 'primary')) {
      if (!usedPorts.has(route.compoundId)) usedPorts.set(route.compoundId, []);
      usedPorts.get(route.compoundId).push(route.compoundPort);
    }
    for (const route of routes) {
      const node = scene.compounds.get(route.compoundId);
      const marker = scene.reactions.get(route.reactionId);
      route.compoundNode = node;
      route.compoundPort = chooseSecondaryPort(node, marker, usedPorts.get(route.compoundId) || [], primaryObstacles);
      if (!usedPorts.has(route.compoundId)) usedPorts.set(route.compoundId, []);
      usedPorts.get(route.compoundId).push(route.compoundPort);
    }
    assignSecondaryMarkerPorts(routes, scene.reactions, scene.routes.filter((r) => r.tier === 'primary'));
    routeSecondaryAll(scene, source, routes, primaryObstacles, bounds);
  }
}

function repairSecondaryOverlaps(scene, source, routes, primaryObstacles, bounds) {
  const routingBounds = unionBounds(bounds, scene.compounds, scene.reactions);
  for (let pass = 0; pass < 6; pass++) {
    const obstacles = R.makeObstacles(source, scene.compounds, scene.reactions, [], 'secondary', { labels: true });
    const pairs = [];
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const A = routes[i];
        const B = routes[j];
        if (A.reactionId === B.reactionId) continue;
        const shared = A.compoundId === B.compoundId;
        let hit = false;
        for (const sa of G.polylineSegments(A.points || [])) {
          for (const sb of G.polylineSegments(B.points || [])) {
            const ov = G.collinearOverlap(sa.a, sa.b, sb.a, sb.b);
            if (ov <= 2) continue;
            if (shared && (Math.hypot(sa.a.x - A.points[0].x, sa.a.y - A.points[0].y) < 10 ||
              Math.hypot(sb.a.x - B.points[0].x, sb.a.y - B.points[0].y) < 10)) continue;
            hit = true;
            break;
          }
          if (hit) break;
        }
        if (hit) pairs.push([A, B]);
      }
    }
    if (!pairs.length) return;
    let fixed = 0;
    for (const [A, B] of pairs) {
      for (const route of [B, A]) {
        const other = route === A ? B : A;
        const saved = route.points;
        const offset = offsetRoute(route, other, obstacles);
        if (offset) {
          route.points = offset;
          fixed++;
          break;
        }
        const ownRects = obstacles.rects.filter((r) =>
          !(r.kind === 'node' && r.id === route.compoundId) &&
          !(r.kind === 'label' && r.id === route.reactionId) &&
          !(r.kind === 'label-cond' && r.id === route.reactionId));
        const ownDiscs = obstacles.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId));
        const laneSegments = primaryObstacles.segments.filter((s) => s.route.compoundId !== route.compoundId)
          .concat(G.polylineSegments(other.points || []).map((s) => ({ a: s.a, b: s.b, pad: 3 })));
        const path = R.gridRoute(route.compoundPort, route.markerPort, { rects: ownRects, discs: ownDiscs, segments: laneSegments }, routingBounds, { primary: false, margin: 500 });
        if (path) {
          route.points = R.simplifyPath(path, { rects: ownRects, discs: ownDiscs, segments: laneSegments }, R.SECONDARY_PAD);
          fixed++;
          break;
        }
        route.points = saved;
      }
    }
    if (!fixed) return;
  }
}

function offsetRoute(route, other, obstacles) {
  if (!route.points || route.points.length !== 2) return null;
  const a = route.points[0];
  const b = route.points[1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ex = {
    rects: obstacles.rects.filter((r) =>
      !(r.kind === 'node' && r.id === route.compoundId) &&
      !(r.kind === 'label' && r.id === route.reactionId) &&
      !(r.kind === 'label-cond' && r.id === route.reactionId)),
    discs: obstacles.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId)),
    segments: (obstacles.segments || []).filter((s) => s.route && s.route.reactionId !== route.reactionId)
  };
  for (const off of [6, -6, 10, -10, 14, -14, 18, -18]) {
    const pts = [
      a,
      { x: a.x + nx * off, y: a.y + ny * off },
      { x: b.x + nx * off, y: b.y + ny * off },
      b
    ];
    let ok = true;
    for (let i = 0; i < pts.length - 1; i++) {
      if (!R.segmentClear(pts[i], pts[i + 1], ex, R.SECONDARY_PAD)) {
        ok = false;
        break;
      }
    }
    if (ok) return pts;
  }
  return null;
}

function countRouteHits(route, obstacles) {
  let hits = 0;
  for (const seg of G.polylineSegments(route.points || [])) {
    for (const rect of obstacles.rects) {
      if (rect.kind === 'node' && rect.id === route.compoundId) continue;
      if (rect.kind === 'label' && rect.id === route.reactionId) continue;
      if (rect.kind === 'label-cond' && rect.id === route.reactionId) continue;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) hits++;
    }
  }
  return hits;
}

function repairSecondaryRoutes(scene, source, routes, primaryObstacles, routingBounds) {
  const all = R.makeObstacles(source, scene.compounds, scene.reactions, scene.routes.filter((r) => r.tier === 'primary' && r.points), 'secondary');
  const expanded = { x: routingBounds.x - 200, y: routingBounds.y - 200, w: routingBounds.w + 400, h: routingBounds.h + 400 };
  for (const route of routes) {
    const before = countRouteHits(route, all);
    if (!before) continue;
    const saved = route.points;
    const own = {
      rects: all.rects.filter((r) => !(r.kind === 'node' && r.id === route.compoundId) &&
        !(r.kind === 'label' && r.id === route.reactionId) &&
        !(r.kind === 'label-cond' && r.id === route.reactionId)),
      discs: all.discs.filter((d) => !(d.kind === 'marker' && d.id === route.reactionId)),
      segments: primaryObstacles.segments.filter((s) => s.route.compoundId !== route.compoundId)
    };
    const path = R.gridRoute(route.compoundPort, route.markerPort, own, expanded, { primary: false });
    if (!path) continue;
    route.points = R.simplifyPath(path, own, R.SECONDARY_PAD);
    const after = countRouteHits(route, all);
    if (after >= before) route.points = saved;
  }
}

function separateSecondaryMarkers(scene) {
  const markers = [...scene.reactions.values()].filter((r) => r.tier === 'secondary');
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      const a = markers[i];
      const b = markers[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 26) continue;
      const len = d || 1;
      b.x += (dx / len) * 30;
      b.y += (dy / len) * 30;
    }
  }
}

function applySecondaryNudges(scene, bounds) {
  const nodes = {
    'methyl-acetate': [260, -70],
    '3-methylbutan-1-ol': [-90, 190],
    'isoamyl-acetate': [150, 100],
    'sodium-oleate': [-170, 140],
    'propionic-acid': [140, -90],
    'sodium-palmitate': [-90, 190]
  };
  for (const [id, [dx, dy]] of Object.entries(nodes)) {
    const node = scene.compounds.get(id);
    if (!node || node.tier !== 'secondary') continue;
    node.x += dx;
    node.y += dy;
  }
  const markers = {
    'acetic-acid-glycerol-esterification': [150, 100],
    'formic-acid-methanol-esterification': [-100, -100],
    'propionic-acid-methanol-esterification': [90, -120],
    'ethyl-propionate-saponification': [-80, 60],
    'tripalmitin-saponification': [40, -60]
  };
  for (const [id, [dx, dy]] of Object.entries(markers)) {
    const marker = scene.reactions.get(id);
    if (!marker || marker.tier !== 'secondary') continue;
    marker.x += dx;
    marker.y += dy;
    marker.labelBoxes = null;
  }
}

function arrangeRack(scene, source, secondary, primaryBounds) {
  const primaryCompounds = new Set();
  for (const [id, node] of scene.compounds) {
    if (node.tier === 'primary') primaryCompounds.add(id);
  }
  const nodes = new Set();
  for (const reaction of secondary) {
    nodes.add(reaction.id);
    for (const id of unique(reaction.substrates.concat(reaction.products))) {
      if (!primaryCompounds.has(id)) nodes.add(id);
    }
  }
  const adjacency = new Map([...nodes].map((id) => [id, []]));
  const connect = (a, b) => {
    if (!adjacency.has(a) || !adjacency.has(b)) return;
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  };
  for (const reaction of secondary) {
    for (const id of unique(reaction.substrates.concat(reaction.products))) {
      if (!primaryCompounds.has(id)) connect(reaction.id, id);
    }
  }
  const components = [];
  const seen = new Set();
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop();
      comp.push(id);
      for (const next of adjacency.get(id) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));

  const CELL_X = 240;
  const CELL_Y = 120;
  const primaryRight = primaryBounds.x + primaryBounds.w;
  let colX = primaryRight + 170;
  let colY = primaryBounds.y;
  let colW = 0;
  for (const comp of components) {
    const n = comp.length;
    const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.5)));
    const rows = Math.ceil(n / cols);
    const blockW = cols * CELL_X;
    const blockH = rows * CELL_Y;
    if (colY > primaryBounds.y && colY + blockH > primaryBounds.y + primaryBounds.h) {
      colX += colW + 120;
      colY = primaryBounds.y;
      colW = 0;
    }
    const order = bfsOrder(comp, adjacency, secondary);
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = colX + col * CELL_X + CELL_X / 2;
      const cy = colY + row * CELL_Y + CELL_Y / 2;
      if (scene.compounds.has(id)) {
        const size = B.sizeFor(id, B.totalDegrees(source));
        scene.compounds.set(id, {
          x: cx - size.w / 2,
          y: cy - size.h / 2,
          w: size.w,
          h: size.h,
          tier: 'secondary'
        });
      } else if (scene.reactions.has(id)) {
        const marker = scene.reactions.get(id);
        marker.x = cx;
        marker.y = cy;
        marker.labelBoxes = null;
      } else {
        // 反応点がまだ無い場合は作る。
        const reaction = secondary.find((r) => r.id === id);
        if (reaction) {
          scene.reactions.set(id, {
            x: cx,
            y: cy,
            tier: 'secondary',
            typeLabel: reaction.typeLabel,
            conditions: reaction.conditions
          });
        }
      }
    }
    colY += blockH + 90;
    colW = Math.max(colW, blockW);
  }
  return { x: colX, y: primaryBounds.y, w: colW, h: colY - primaryBounds.y };
}

function bfsOrder(comp, adjacency, secondary) {
  const reactionIds = new Set(secondary.map((r) => r.id));
  const start = comp.find((id) => reactionIds.has(id) && (adjacency.get(id) || []).length > 0) ||
    comp.find((id) => reactionIds.has(id)) || comp[0];
  const order = [];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adjacency.get(id) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  for (const id of comp) if (!seen.has(id)) order.push(id);
  return order;
}

function addRoute(scene, reaction, dir, compoundId) {
  const key = reaction.id + '|' + dir + '|' + compoundId;
  if (scene.routes.some((r) => r.key === key)) return;
  scene.routes.push({
    key,
    reactionId: reaction.id,
    compoundId,
    dir,
    tier: 'secondary',
    points: null,
    gaps: [],
    bridges: []
  });
}

function unique(list) {
  const out = [];
  for (const v of list) if (!out.includes(v)) out.push(v);
  return out;
}

function sceneBounds(scene) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const node of scene.compounds.values()) {
    add(node.x, node.y);
    add(node.x + node.w, node.y + node.h);
  }
  for (const r of scene.reactions.values()) {
    add(r.x - 16, r.y - 16);
    add(r.x + 16, r.y + 16);
    if (r.labelBoxes) {
      add(r.labelBoxes.type.x, r.labelBoxes.type.y);
      add(r.labelBoxes.type.x + r.labelBoxes.type.w, r.labelBoxes.type.y + r.labelBoxes.type.h);
      if (r.labelBoxes.cond) {
        add(r.labelBoxes.cond.x, r.labelBoxes.cond.y);
        add(r.labelBoxes.cond.x + r.labelBoxes.cond.w, r.labelBoxes.cond.y + r.labelBoxes.cond.h);
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function unionBounds(base, compounds, reactions) {
  let minX = base.x;
  let minY = base.y;
  let maxX = base.x + base.w;
  let maxY = base.y + base.h;
  for (const node of compounds.values()) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  for (const r of reactions.values()) {
    minX = Math.min(minX, r.x - 40);
    minY = Math.min(minY, r.y - 40);
    maxX = Math.max(maxX, r.x + 40);
    maxY = Math.max(maxY, r.y + 40);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function candidatePositions(attachments, compounds, bounds, center) {
  const out = [];
  const add = (p) => {
    if (out.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 36)) return;
    out.push(p);
  };
  for (const id of attachments) {
    const node = compounds.get(id);
    if (!node) continue;
    const c = R.centerOf(node);
    for (let ai = 0; ai < 16; ai++) {
      const angle = (ai / 16) * Math.PI * 2;
      for (const r of [120, 200, 300, 420]) {
        add({ x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r });
      }
    }
  }
  // 外周リング上の候補（局所候補が全部だめな場合の逃げ道）。
  const pad = 90;
  const left = bounds.x - pad;
  const right = bounds.x + bounds.w + pad;
  const top = bounds.y - pad;
  const bottom = bounds.y + bounds.h + pad;
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    add({
      x: (left + right) / 2 + Math.cos(angle) * ((right - left) / 2),
      y: (top + bottom) / 2 + Math.sin(angle) * ((bottom - top) / 2)
    });
  }
  return out;
}

function chooseMarker(reaction, candidates, attachments, scene, primaryObstacles, bounds) {
  let best = null;
  let bestScore = Infinity;
  const allNodeRects = [...scene.compounds.entries()].map(([id, node]) => ({ id, rect: G.rect(node.x, node.y, node.w, node.h) }));
  for (const candidate of candidates) {
    if (!rectFree(G.rect(candidate.x - 10, candidate.y - 10, 20, 20), primaryObstacles, 8)) continue;
    if (tooCloseToSecondary(candidate, scene.reactions)) continue;
    let score = 0;
    let crossings = 0;
    let penetrations = 0;
    let nonDirect = 0;
    let total = 0;
    for (const id of attachments) {
      const node = scene.compounds.get(id);
      if (!node) continue;
      const port = provisionalPort(node, candidate);
      const obstacles = {
        rects: allNodeRects.filter((r) => r.id !== id).map((r) => ({ kind: 'node', id: r.id, rect: r.rect }))
          .concat(primaryObstacles.rects.filter((r) => r.kind !== 'node')),
        discs: primaryObstacles.discs.filter((d) => d.id !== reaction.id),
        segments: []
      };
      let path;
      if (R.segmentClear(port, candidate, obstacles, R.SECONDARY_PAD)) {
        path = [port, candidate];
      } else {
        nonDirect++;
        path = R.gridRoute(port, candidate, obstacles, bounds, { primary: false, margin: 500 }) || [port, candidate];
      }
      crossings += countPrimaryCrossings(path, primaryObstacles.segments, id);
      penetrations += countPenetrations(path, obstacles, id, reaction.id);
      total += G.polylineLength(path);
      total += Math.hypot(port.x - candidate.x, port.y - candidate.y) * 0.1;
    }
    score = crossings * 1e9 + penetrations * 1e8 + nonDirect * 1e7 + total;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best) {
    const node = attachments.length ? scene.compounds.get(attachments[0]) : null;
    const c = node ? R.centerOf(node) : { x: bounds.x - 120, y: bounds.y + 120 };
    best = { x: c.x - 120, y: c.y };
  }
  return best;
}

function tooCloseToSecondary(point, reactions) {
  for (const r of reactions.values()) {
    if (r.tier !== 'secondary') continue;
    if (Math.hypot(point.x - r.x, point.y - r.y) < 64) return true;
  }
  return false;
}

function provisionalPort(node, target) {
  const c = R.centerOf(node);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? node.x + node.w : node.x, y: c.y };
  return { x: c.x, y: dy >= 0 ? node.y + node.h : node.y };
}

function countPenetrations(points, obstacles, ownCompound, ownReaction) {
  let count = 0;
  for (const seg of G.polylineSegments(points)) {
    for (const rect of obstacles.rects) {
      if (rect.kind === 'node' && rect.id === ownCompound) continue;
      if (rect.kind === 'label' && rect.id === ownReaction) continue;
      if (rect.kind === 'label-cond' && rect.id === ownReaction) continue;
      if (G.segmentRect(seg.a, seg.b, G.inflate(rect.rect, -0.5))) count++;
    }
  }
  return count;
}

function countPrimaryCrossings(points, segments, ownCompound) {
  let crossings = 0;
  const ownStart = points[0];
  for (const seg of G.polylineSegments(points)) {
    for (const other of segments) {
      const hit = G.segSegIntersection(seg.a, seg.b, other.a, other.b);
      if (!hit) continue;
      if (other.route && other.route.compoundId === ownCompound &&
        Math.hypot(hit.x - ownStart.x, hit.y - ownStart.y) < 18) continue;
      crossings++;
    }
  }
  return crossings;
}

function placeFan(marker, ids, attachments, scene, primaryObstacles, bounds, center, degree) {
  if (!ids.length) return;
  let base = Math.atan2(marker.y - center.y, marker.x - center.x);
  if (attachments.length) {
    const pts = attachments.map((id) => R.centerOf(scene.compounds.get(id))).filter(Boolean);
    if (pts.length) {
      const avg = {
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        y: pts.reduce((s, p) => s + p.y, 0) / pts.length
      };
      base = Math.atan2(marker.y - avg.y, marker.x - avg.x);
    }
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (scene.compounds.has(id)) continue;
    const size = B.sizeFor(id, degree);
    let placed = null;
    const offsets = [0, 0.7, -0.7, 1.3, -1.3];
    const radii = [130, 180, 240, 300, 360];
    for (const radius of radii) {
      for (const off of offsets) {
        const angle = base + off;
        const candidate = {
          x: marker.x + Math.cos(angle) * (radius + (i % 2) * 30),
          y: marker.y + Math.sin(angle) * (radius + (i % 2) * 30)
        };
        const rect = G.rect(candidate.x - size.w / 2, candidate.y - size.h / 2, size.w, size.h);
        if (!rectFree(rect, primaryObstacles, 10)) continue;
        if (collides(candidate, size, scene.compounds)) continue;
        placed = candidate;
        break;
      }
      if (placed) break;
    }
    if (!placed) placed = findFreePosition({ x: marker.x + 110, y: marker.y + 30 }, size, scene, primaryObstacles, bounds, center);
    scene.compounds.set(id, {
      x: placed.x - size.w / 2,
      y: placed.y - size.h / 2,
      w: size.w,
      h: size.h,
      tier: 'secondary'
    });
  }
}

function findFreePosition(avg, size, scene, primaryObstacles, bounds, center, ignoreId) {
  const out = outward(avg, center);
  const candidates = [
    { x: avg.x + out.x * 90, y: avg.y + out.y * 90 },
    { x: avg.x + out.x * 140, y: avg.y + out.y * 140 },
    { x: avg.x + out.x * 190, y: avg.y + out.y * 190 }
  ];
  // 主要の外側へ押し出す。
  const outside = pushOutside(avg, bounds, 60);
  candidates.push(outside);
  for (let k = 0; k < 60; k++) {
    const angle = (k / 12) * Math.PI * 2;
    const r = 90 + Math.floor(k / 12) * 50;
    candidates.push({ x: outside.x + Math.cos(angle) * r, y: outside.y + Math.sin(angle) * r });
  }
  for (const c of candidates) {
    const rect = G.rect(c.x - size.w / 2, c.y - size.h / 2, size.w, size.h);
    if (!rectFree(rect, primaryObstacles, 10)) continue;
    if (collides(c, size, scene.compounds, ignoreId)) continue;
    return c;
  }
  return outside;
}

function rectFree(rect, obstacles, pad) {
  for (const r of obstacles.rects) {
    if (G.rectsOverlap(rect, G.inflate(r.rect, pad))) return false;
  }
  for (const d of obstacles.discs) {
    if (G.distPointRect(d, rect) < d.r + pad) return false;
  }
  for (const seg of obstacles.segments || []) {
    if (segRectDistance(seg.a, seg.b, rect) < (seg.pad == null ? 10 : Math.max(10, seg.pad))) return false;
  }
  return true;
}

function segRectDistance(a, b, rect) {
  if (G.segmentRect(a, b, rect)) return 0;
  let min = Math.min(G.distPointRect(a, rect), G.distPointRect(b, rect));
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h }
  ];
  for (const c of corners) min = Math.min(min, G.distPointSeg(c, a, b));
  return min;
}

function pushOutside(point, bounds, pad) {
  const left = bounds.x - pad;
  const right = bounds.x + bounds.w + pad;
  const top = bounds.y - pad;
  const bottom = bounds.y + bounds.h + pad;
  if (point.x < left || point.x > right || point.y < top || point.y > bottom) return point;
  const dl = point.x - left;
  const dr = right - point.x;
  const dt = point.y - top;
  const db = bottom - point.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: left, y: point.y };
  if (m === dr) return { x: right, y: point.y };
  if (m === dt) return { x: point.x, y: top };
  return { x: point.x, y: bottom };
}

function outward(point, center) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function collides(point, size, compounds, ignoreId) {
  const rect = G.rect(point.x - size.w / 2, point.y - size.h / 2, size.w, size.h);
  for (const [id, node] of compounds) {
    if (id === ignoreId) continue;
    if (node.tier !== 'secondary' && node.tier !== 'primary') continue;
    if (G.rectsOverlap(rect, G.rect(node.x, node.y, node.w, node.h), 12)) return true;
  }
  return false;
}

function chooseSecondaryPort(node, marker, used, primaryObstacles) {
  const center = R.centerOf(node);
  const dx = marker.x - center.x;
  const dy = marker.y - center.y;
  const primarySide = R.sideOf(dx, dy);
  const sides = [primarySide, 'right', 'bottom', 'left', 'top'].filter((s, i, arr) => arr.indexOf(s) === i);
  let fallback = null;
  for (const side of sides) {
    let t;
    if (side === 'left' || side === 'right') {
      const sx = side === 'left' ? node.x : node.x + node.w;
      t = (center.y + (Math.abs(dx) > 1e-9 ? (dy / dx) * (sx - center.x) : 0) - node.y - 6) / Math.max(1, node.h - 12);
    } else {
      const sy = side === 'top' ? node.y : node.y + node.h;
      t = (center.x + (Math.abs(dy) > 1e-9 ? (dx / dy) * (sy - center.y) : 0) - node.x - 6) / Math.max(1, node.w - 12);
    }
    const base = G.clamp(t, 0.08, 0.92);
    for (const d of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.5, -0.5]) {
      const point = R.sidePoint(node, side, G.clamp(base + d, 0.05, 0.95));
      if (!fallback) fallback = point;
      if (used.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 11)) continue;
      if (!R.pointFree(point, primaryObstacles, R.SECONDARY_PAD)) continue;
      return point;
    }
  }
  return fallback;
}

function assignSecondaryMarkerPorts(routes, reactions, primaryRoutes) {
  const primaryAngles = new Map();
  for (const route of primaryRoutes) {
    if (typeof route.markerAngle !== 'number') continue;
    if (!primaryAngles.has(route.reactionId)) primaryAngles.set(route.reactionId, []);
    primaryAngles.get(route.reactionId).push(route.markerAngle);
  }
  const byReaction = new Map();
  for (const route of routes) {
    if (!byReaction.has(route.reactionId)) byReaction.set(route.reactionId, []);
    byReaction.get(route.reactionId).push(route);
  }
  for (const [rid, list] of byReaction) {
    const marker = reactions.get(rid);
    const used = (primaryAngles.get(rid) || []).slice();
    const desired = list.map((route) => {
      const c = R.centerOf(route.compoundNode);
      return { route, angle: Math.atan2(c.y - marker.y, c.x - marker.x) };
    });
    desired.sort((a, b) => a.angle - b.angle || (a.route.key < b.route.key ? -1 : 1));
    for (const item of desired) {
      let angle = item.angle;
      for (let k = 0; k < 40; k++) {
        if (used.every((u) => Math.abs(normalAngle(angle - u)) >= 0.34)) break;
        angle += 0.07;
      }
      used.push(angle);
      item.route.markerPort = {
        x: marker.x + Math.cos(angle) * G.MARKER_PORT_R,
        y: marker.y + Math.sin(angle) * G.MARKER_PORT_R
      };
      item.route.markerAngle = angle;
    }
  }
}

function normalAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function placeSecondaryLabels(secondary, scene, source) {
  const placed = [];
  for (const reaction of secondary) {
    const marker = scene.reactions.get(reaction.id);
    const ends = [];
    for (const id of unique(reaction.substrates.concat(reaction.products))) {
      const node = scene.compounds.get(id);
      if (node) ends.push(R.centerOf(node));
    }
    const centroid = ends.length
      ? { x: ends.reduce((s, p) => s + p.x, 0) / ends.length, y: ends.reduce((s, p) => s + p.y, 0) / ends.length }
      : { x: marker.x, y: marker.y };
    const outwardAngle = Math.atan2(marker.y - centroid.y, marker.x - centroid.x);
    const normals = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI };
    let best = null;
    let bestScore = Infinity;
    for (const side of ['N', 'S', 'E', 'W']) {
      for (const extra of [0, 12, 24, 36, 48]) {
        const box = R.labelLayoutAt(marker, reaction, side, extra);
        let score = extra * 0.3;
        let diff = Math.abs(normalAngle(normals[side] - outwardAngle));
        score += (1 - diff / Math.PI) * 3;
        for (const node of scene.compounds.values()) {
          if (G.rectsOverlap(G.inflate(box.type, 3), G.rect(node.x, node.y, node.w, node.h)) ||
            (box.cond && G.rectsOverlap(G.inflate(box.cond, 3), G.rect(node.x, node.y, node.w, node.h)))) score += 1000;
        }
        for (const other of placed) {
          if (G.rectsOverlap(G.inflate(box.type, 2), G.inflate(other.box.type, 2))) score += 1000;
        }
        for (const other of scene.reactions.values()) {
          if (other === marker) continue;
          if (G.distPointRect({ x: other.x, y: other.y }, box.type) < 14) score += 200;
        }
        for (const route of scene.routes) {
          if (!route.points) continue;
          for (const seg of G.polylineSegments(route.points)) {
            if (G.segmentRect(seg.a, seg.b, box.type)) {
              score += route.reactionId === reaction.id ? 4000 : route.tier === 'primary' ? 800 : 120;
            }
          }
        }
        if (score < bestScore) {
          bestScore = score;
          best = { side, box };
        }
      }
    }
    marker.labelSide = best.side;
    marker.labelBoxes = best.box;
    placed.push({ id: reaction.id, box: best.box });
  }
}

module.exports = {
  placeSecondary,
  candidatePositions,
  chooseMarker,
  countPrimaryCrossings
};
