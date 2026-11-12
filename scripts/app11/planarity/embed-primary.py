#!/usr/bin/env python3
"""app11 primary-topology.json の生成（開発時のみ）。

このスクリプトは Node の生成パイプライン（optimize-layout.cjs）からは呼ばない。
primary（route-priority.json の tier=primary）反応と、その全端点・全分枝からなる
2部グラフ G_P の平面性を NetworkX の Left-Right Planarity Test で判定し、
巡回順（rotation system）・面・連結成分・二重連結成分・補助成分の共面制約を
site-src/app11/primary-topology.json に固定する。

実行（リポジトリ直下）:
  py -3 -m venv .venv-app11
  .venv-app11\\Scripts\\python -m pip install -r scripts/app11/planarity/requirements.txt
  .venv-app11\\Scripts\\python scripts/app11/planarity/embed-primary.py

注意:
- NetworkX は開発時依存。ブラウザにも Node の実行時にも入れない。
- 生成物が変わったら入力 hash も変わる。optimize-layout / build-map-data は
  hash 不一致を安全停止として扱う。
- 非平面だった場合は primary-topology.json を書かず、Kuratowski 部分グラフを
  primary-topology.nonplanar.json に書いて exit 2 する（座標生成へ進まない）。
"""

import hashlib
import json
import sys
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "site-src" / "app11"
OUT = SRC / "primary-topology.json"
NONPLANAR = SRC / "primary-topology.nonplanar.json"
NETWORKX_VERSION = "3.6.1"


def read_json(path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def endpoints(reaction):
    out = []
    for compound in reaction.get("substrates", []) + reaction.get("products", []):
        if compound not in out:
            out.append(compound)
    return out


def input_digest_lines(confirmed, priority):
    """Node 側（source-data.cjs）と同一の行形式。入力の意味だけを hash する。"""
    lines = []
    for reaction in confirmed:
        lines.append("R|" + "|".join([
            reaction["id"],
            str(reaction.get("type", "")),
            str(reaction.get("state") or "confirmed"),
            ",".join(reaction.get("substrates", [])),
            ",".join(reaction.get("products", [])),
        ]))
    for rid in sorted(priority):
        entry = priority[rid]
        lines.append("P|" + "|".join([rid, entry["tier"], entry.get("topic", "")]))
    return "\n".join(lines)


def build_inputs():
    reactions_doc = read_json(SRC / "reactions.json")
    priority_doc = read_json(SRC / "route-priority.json")
    default_state = reactions_doc.get("defaultState", "unverified")
    confirmed = [
        r for r in reactions_doc["reactions"]
        if (r.get("state") or default_state) == "confirmed"
    ]
    confirmed.sort(key=lambda r: r["id"])
    priority = priority_doc["reactions"]
    ids = {r["id"] for r in confirmed}
    missing = sorted(set(priority) - ids)
    unknown = sorted(ids - set(priority))
    if missing or unknown:
        raise SystemExit("priority と confirmed 反応のIDが一致しない: missing=%s unknown=%s" % (missing, unknown))
    tiers = {rid: entry["tier"] for rid, entry in priority.items()}
    if any(t not in ("primary", "secondary") for t in tiers.values()):
        raise SystemExit("tier は primary / secondary のいずれか")
    primary_ids = sorted(rid for rid, tier in tiers.items() if tier == "primary")
    input_hash = sha256(input_digest_lines(confirmed, priority))
    return reactions_doc, priority_doc, confirmed, tiers, primary_ids, input_hash


def graph_from(confirmed, tiers, ids_filter):
    graph = nx.Graph()
    for reaction in confirmed:
        if tiers[reaction["id"]] not in ids_filter:
            continue
        rid = "r:" + reaction["id"]
        graph.add_node(rid, kind="reaction")
        for compound in endpoints(reaction):
            cid = "c:" + compound
            graph.add_node(cid, kind="compound")
            graph.add_edge(cid, rid)
    return graph


def rotation_of(embedding):
    # PlanarEmbedding の get_data() は各頂点の半辺を巡回順で返す。
    # 頂点・隣接の順序を固定して JSON を決定的にする。
    data = embedding.get_data()
    rotation = {}
    for node in sorted(data):
        rotation[node] = list(data[node])
    return rotation


def traverse_faces(graph, rotation):
    faces = []
    seen = set()
    for start in sorted(graph.nodes()):
        for first in rotation[start]:
            if (start, first) in seen:
                continue
            face = []
            a, b = start, first
            guard = 0
            while (a, b) not in seen:
                seen.add((a, b))
                face.append(a)
                ring = rotation[b]
                idx = ring.index(a)
                a, b = b, ring[(idx + 1) % len(ring)]
                guard += 1
                if guard > 1_000_000:
                    raise SystemExit("face traversal did not terminate")
            faces.append(face)
    return faces


def verify(graph, rotation, faces):
    problems = []
    for node in graph.nodes():
        ring = rotation.get(node, [])
        if sorted(ring) != sorted(graph.neighbors(node)):
            problems.append({"node": node, "kind": "rotation-mismatch"})
        if len(set(ring)) != len(ring):
            problems.append({"node": node, "kind": "duplicate-neighbour"})
    edge_seen = {}
    for face in faces:
        for i, u in enumerate(face):
            v = face[(i + 1) % len(face)]
            key = tuple(sorted((u, v)))
            edge_seen[key] = edge_seen.get(key, 0) + 1
    for u, v in graph.edges():
        key = tuple(sorted((u, v)))
        if edge_seen.get(key, 0) != 2:
            problems.append({"edge": key, "kind": "face-half-edge-count", "count": edge_seen.get(key, 0)})
    # 連結成分ごとに V - E + F = 2（F はその成分の面数）。
    components = [sorted(c) for c in nx.connected_components(graph)]
    components.sort(key=lambda c: (-len(c), c[0]))
    face_component = []
    node_component = {}
    for i, comp in enumerate(components):
        for node in comp:
            node_component[node] = i
    for face in faces:
        face_component.append(node_component[face[0]])
    counts = []
    for i, comp in enumerate(components):
        v = len(comp)
        e = graph.subgraph(comp).number_of_edges()
        f = sum(1 for c in face_component if c == i)
        counts.append({"nodes": v, "edges": e, "faces": f, "euler": v - e + f})
        if v - e + f != 2:
            problems.append({"component": i, "kind": "euler", "value": v - e + f})
    return problems, components, counts


def secondary_components(confirmed, tiers, primary_ids):
    secondary = [r for r in confirmed if tiers[r["id"]] == "secondary"]
    graph = nx.Graph()
    for reaction in secondary:
        rid = "r:" + reaction["id"]
        graph.add_node(rid, kind="reaction")
        for compound in endpoints(reaction):
            cid = "c:" + compound
            graph.add_node(cid, kind="compound")
            graph.add_edge(cid, rid)
    primary_compounds = set()
    for reaction in confirmed:
        if tiers[reaction["id"]] != "primary":
            continue
        for compound in endpoints(reaction):
            primary_compounds.add("c:" + compound)
    out = []
    for component in sorted(nx.connected_components(graph), key=lambda c: (-len(c), sorted(c)[0])):
        nodes = sorted(component)
        attachments = sorted(n for n in nodes if n in primary_compounds)
        out.append({
            "nodes": nodes,
            "primaryAttachments": attachments,
        })
    return out


def main():
    reactions_doc, priority_doc, confirmed, tiers, primary_ids, input_hash = build_inputs()
    if len(primary_ids) != 50:
        print("warning: primary は %d 件（計画の候補は50件）" % len(primary_ids), file=sys.stderr)
    graph = graph_from(confirmed, tiers, {"primary"})
    is_planar, certificate = nx.check_planarity(graph, counterexample=True)
    compound_count = sum(1 for n in graph.nodes() if n.startswith("c:"))
    branch_count = graph.number_of_edges()
    print("G_P: nodes=%d (compounds=%d, reactions=%d), edges=%d, planar=%s" % (
        graph.number_of_nodes(), compound_count, graph.number_of_nodes() - compound_count,
        branch_count, is_planar))

    if not is_planar:
        nodes = sorted(certificate.nodes())
        edges = sorted(tuple(sorted(e)) for e in certificate.edges())
        report = {
            "meta": {
                "generatedBy": "scripts/app11/planarity/embed-primary.py",
                "networkx": NETWORKX_VERSION,
                "inputHash": input_hash,
                "planar": False,
                "primaryReactions": len(primary_ids),
                "primaryCompounds": compound_count,
                "primaryBranches": branch_count,
            },
            "counterexample": {
                "kind": "Kuratowski-subgraph",
                "nodes": nodes,
                "edges": edges,
                "note": "ノードは c:<compound-id> / r:<reaction-id>。座標生成は行わない。",
            },
        }
        NONPLANAR.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("NON-PLANAR: %s に反証を書き、終了する。" % NONPLANAR, file=sys.stderr)
        return 2

    rotation = rotation_of(certificate)
    faces = traverse_faces(graph, rotation)
    problems, components, counts = verify(graph, rotation, faces)
    if problems:
        print("certificate verification failed: %s" % problems, file=sys.stderr)
        return 3

    node_faces = {node: [] for node in graph.nodes()}
    for index, face in enumerate(faces):
        for node in face:
            node_faces[node].append(index)

    block_list = []
    for block in sorted(nx.biconnected_components(graph), key=lambda b: (-len(b), sorted(b)[0])):
        nodes = sorted(block)
        block_list.append(nodes)

    articulations = sorted(nx.articulation_points(graph))

    secondary = secondary_components(confirmed, tiers, primary_ids)
    for component in secondary:
        common = None
        for node in component["primaryAttachments"]:
            face_set = set(node_faces.get(node, []))
            common = face_set if common is None else common & face_set
        component["commonFaces"] = sorted(common) if common is not None else []
        component["cofacial"] = bool(component["commonFaces"]) if component["primaryAttachments"] else True

    # 主要グラフの面に接する補助成分の集計。
    feasible = sum(1 for c in secondary if c["cofacial"])
    report = {
        "meta": {
            "generatedBy": "scripts/app11/planarity/embed-primary.py",
            "networkx": NETWORKX_VERSION,
            "inputHash": input_hash,
            "priorityVersion": priority_doc.get("version"),
            "planar": True,
            "primaryReactions": len(primary_ids),
            "primaryCompounds": compound_count,
            "primaryBranches": branch_count,
            "nodes": graph.number_of_nodes(),
            "edges": graph.number_of_edges(),
            "components": len(components),
            "faces": len(faces),
            "secondaryComponents": len(secondary),
            "secondaryCofacial": feasible,
            "note": "rotation は PlanarEmbedding の巡回順。Node 側で Euler 公式と半辺重複を再検証する。",
        },
        "components": [
            {
                "id": i,
                "nodes": comp,
                "nodesCount": len(comp),
                "edges": graph.subgraph(comp).number_of_edges(),
                "faces": counts[i]["faces"],
                "euler": counts[i]["euler"],
            }
            for i, comp in enumerate(components)
        ],
        "blocks": block_list,
        "articulations": articulations,
        "rotation": rotation,
        "faces": faces,
        "nodeFaces": {node: sorted(f) for node, f in node_faces.items()},
        "secondary": secondary,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("生成: %s (faces=%d, secondary cofacial=%d/%d)" % (
        OUT, len(faces), feasible, len(secondary)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
