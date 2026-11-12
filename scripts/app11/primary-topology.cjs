/**
 * 有機反応マップ（app11）— 主要グラフの位相検証
 *
 * `site-src/app11/primary-topology.json` は開発時だけ NetworkX（Left-Right
 * Planarity Test）で生成する。このモジュールはその証明書を Node 側で独立に検証し、
 * 主要グラフの成分・面・補助成分の共面制約を生成パイプラインへ渡す。
 *
 * 検証は「証明書を信じる」のではなく、次を再計算する:
 * - 各頂点の巡回順が隣接集合と一致するか
 * - 各有向半辺がちょうど1回ずつ面に現れるか（無向辺は2回）
 * - 連結成分ごとに V - E + F = 2
 *
 * 非平面の証明書（K3,3 などの fixture）は座標生成へ進まずに失敗する。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const S = require('./source-data.cjs');

const TOPOLOGY_PATH = path.join(S.SRC, 'primary-topology.json');
const NONPLANAR_PATH = path.join(S.SRC, 'primary-topology.nonplanar.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildPrimaryGraph(source) {
  const primaries = source.reactions.filter((r) => source.priority.entries.get(r.id).tier === 'primary');
  const nodes = new Map();
  const edges = [];
  for (const reaction of primaries) {
    const rid = 'r:' + reaction.id;
    nodes.set(rid, { id: rid, kind: 'reaction', reactionId: reaction.id });
    for (const compound of uniqueEndpoints(reaction)) {
      const cid = 'c:' + compound;
      nodes.set(cid, { id: cid, kind: 'compound', compoundId: compound });
      edges.push([cid, rid]);
    }
  }
  const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const [a, b] of edges) {
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  return {
    nodes,
    edges,
    adjacency,
    primaryIds: primaries.map((r) => r.id).sort(),
    compoundIds: [...nodes.values()].filter((n) => n.kind === 'compound').map((n) => n.compoundId).sort()
  };
}

function uniqueEndpoints(reaction) {
  const out = [];
  for (const id of reaction.substrates.concat(reaction.products)) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function components(graph) {
  const seen = new Set();
  const out = [];
  for (const start of [...graph.nodes.keys()].sort()) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    const ids = [];
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const next of graph.adjacency.get(id) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    out.push(ids.sort());
  }
  out.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
  return out;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = a.slice().sort();
  const sb = b.slice().sort();
  return sa.every((value, i) => value === sb[i]);
}

/**
 * 巡回順から面を列挙する。rotation[v] の u の次を次の半辺とする。
 * 返り値の faces は頂点IDの配列（最後から最初へ戻る半辺を含む）。
 */
function traverseFaces(rotation, graph) {
  const seen = new Set();
  const faces = [];
  for (const start of [...graph.nodes.keys()].sort()) {
    for (const first of rotation[start] || []) {
      if (seen.has(start + '\u0000' + first)) continue;
      const face = [];
      let a = start;
      let b = first;
      let guard = 0;
      while (!seen.has(a + '\u0000' + b)) {
        seen.add(a + '\u0000' + b);
        face.push(a);
        const ring = rotation[b];
        if (!ring) throw new Error('巡回順に頂点がない: ' + b);
        const index = ring.indexOf(a);
        if (index < 0) throw new Error('半辺 ' + a + '→' + b + ' が巡回順にない');
        a = b;
        b = ring[(index + 1) % ring.length];
        if (++guard > 1000000) throw new Error('面の走査が終わらない');
      }
      faces.push(face);
    }
  }
  return faces;
}

function verifyCertificate(graph, rotation) {
  const problems = [];
  for (const [node, neighbors] of graph.adjacency) {
    const ring = rotation[node];
    if (!ring) {
      problems.push({ kind: 'missing-node', node });
      continue;
    }
    if (!sameSet(ring, neighbors)) {
      problems.push({ kind: 'rotation-mismatch', node, ring, neighbors });
      continue;
    }
    if (new Set(ring).size !== ring.length) problems.push({ kind: 'duplicate-neighbour', node });
  }
  const faces = traverseFaces(rotation, graph);
  const halfEdgeCount = new Map();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? a + '\u0000' + b : b + '\u0000' + a;
      halfEdgeCount.set(key, (halfEdgeCount.get(key) || 0) + 1);
    }
  }
  for (const [a, b] of graph.edges) {
    const key = a < b ? a + '\u0000' + b : b + '\u0000' + a;
    const count = halfEdgeCount.get(key) || 0;
    if (count !== 2) problems.push({ kind: 'half-edge-count', a, b, count });
  }
  const comps = components(graph);
  const componentFaces = new Array(comps.length).fill(0);
  const componentIndex = new Map();
  comps.forEach((ids, index) => ids.forEach((id) => componentIndex.set(id, index)));
  for (const face of faces) {
    if (face.length) componentFaces[componentIndex.get(face[0])] += 1;
  }
  const euler = [];
  let cursor = 0;
  for (let i = 0; i < comps.length; i++) {
    let edges = 0;
    for (const [a, b] of graph.edges) {
      if (componentIndex.get(a) === i) edges++;
    }
    const v = comps[i].length;
    const f = componentFaces[i];
    euler.push({ nodes: v, edges, faces: f, value: v - edges + f });
    if (v - edges + f !== 2) problems.push({ kind: 'euler', component: i, value: v - edges + f });
    cursor += v;
  }
  return { ok: problems.length === 0, problems, faces, components: comps, euler, cursor };
}

function assertPlanarCertificate(certificate, graph, rotation) {
  const meta = certificate.meta || {};
  if (meta.planar === false) {
    const counter = certificate.counterexample || {};
    throw new Error('主要グラフが非平面と証明されている。座標生成へ進まない。' +
      '反証: ' + JSON.stringify({ nodes: counter.nodes || [], edges: counter.edges || [] }));
  }
  if (meta.planar !== true) throw new Error('平面性の証明書がない（meta.planar が true/false でない）');
  return verifyCertificate(graph, rotation);
}

function loadTopology(source) {
  if (!fs.existsSync(TOPOLOGY_PATH)) {
    if (fs.existsSync(NONPLANAR_PATH)) {
      const report = loadJson(NONPLANAR_PATH);
      throw new Error('主要グラフは非平面と記録されている。' + JSON.stringify(report.counterexample || {}));
    }
    throw new Error('site-src/app11/primary-topology.json がありません。' +
      'scripts/app11/planarity/requirements.txt の環境で embed-primary.py を実行してください。');
  }
  const certificate = loadJson(TOPOLOGY_PATH);
  if (certificate.meta.inputHash !== source.priorityHash) {
    throw new Error('primary-topology.json が priority/reactions と不一致（入力hash）。' +
      'embed-primary.py を再実行してください。');
  }
  const graph = buildPrimaryGraph(source);
  if (graph.nodes.size !== certificate.meta.nodes || graph.edges.length !== certificate.meta.edges) {
    throw new Error('primary-topology.json の頂点数/辺数が現データと一致しない。embed-primary.py を再実行してください。');
  }
  const rotation = certificate.rotation;
  const verified = assertPlanarCertificate(certificate, graph, rotation);
  if (verified.problems.length) {
    throw new Error('primary-topology.json の巡回順を検証できない: ' + JSON.stringify(verified.problems.slice(0, 5)));
  }
  return {
    certificate,
    graph,
    rotation,
    faces: verified.faces,
    components: verified.components,
    euler: verified.euler,
    blocks: certificate.blocks || [],
    articulations: certificate.articulations || [],
    secondary: certificate.secondary || [],
    nodeFaces: certificate.nodeFaces || {}
  };
}

/**
 * 補助成分の共面レポート。固定した主要埋め込みで、補助成分の接続点が
 * 共通の面に載るかだけを判定する（P–S ゼロの必要条件）。
 */
function secondaryCofacialReport(topology) {
  return topology.secondary.map((component, index) => ({
    index,
    nodes: component.nodes.length,
    attachments: component.primaryAttachments,
    commonFaces: component.commonFaces,
    cofacial: component.cofacial
  }));
}

module.exports = {
  TOPOLOGY_PATH,
  NONPLANAR_PATH,
  buildPrimaryGraph,
  components,
  traverseFaces,
  verifyCertificate,
  assertPlanarCertificate,
  loadTopology,
  secondaryCofacialReport
};
