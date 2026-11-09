/*
 * 有機化学ビルダー（app10-next）— 鎖式の炭化水素部分デスクリプタ
 *
 * 鎖式154化合物について、検証済みの構造グラフから
 *   「官能基に結合する炭化水素部分」の C 数・つながり方・分かれ方
 * を導出する。分子式や名称から炭素骨格を推定しない。
 *
 * 手順:
 *   1. data.js の構造（skeleton/sub/multi/custom は buildStructure、
 *      condensed は condensedGraphFor）から原子グラフを得る。
 *      簡略式でグラフ化できない maleic-acid / fumaric-acid / eicosane は
 *      このファイル内の検証済み manual graph を使う。
 *   2. カルボニル C（C=O）とニトリル C（C≡N）を functional core として除外する。
 *      OH をもつ炭素は炭化水素部分に残す。
 *   3. O/N/ハロゲンなどの官能基原子を除いた炭素グラフの連結成分を、
 *      官能基との接合部に H を補った親炭化水素として扱う。
 *   4. C–C の二重/三重結合は結合位置（edgeのbondorder）を含めて保持する。
 *      末端/内部の位置異性体を同一視しない（ブタ-1-エンとブタ-2-エンは別）。
 *      接続点にHを補うと同一の親になるもの（プロパン-1/2-オール）は同一。
 *   5. 成分の multiset を役割非依存で canonical dedupe し、①の語彙を抑える。
 *      ester の acyl/alkoxy などは①では分けない（結果カードで区別する）。
 *
 * カルボニルCに結合するHは、−CHOの固定HとR=Hを区別する。エタナール/
 * プロパナールのCHO固定Hは①に数えず、ホルムアルデヒドの残りH1、ギ酸・
 * ギ酸エステルのcarbonyl C–HはR=Hとして①のH断片に数える。
 *
 * 同じ canonical signature の衝突に備え、WL hash に加えて、element/H/charge
 * と各edge orderを含む木の完全canonical符号でも比較する（sameFragmentShape）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data.js'), require('./draw.js'));
  } else {
    root.OCChainDescriptor = factory(root.OCData, root.OCDraw);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, R) {
  'use strict';

  if (!D || !R) throw new Error('OCChainDescriptor: OCData と OCDraw が必要です');

  var GRAPH_TYPES = ['skeleton', 'sub', 'multi', 'custom'];
  var HALOGENS = ['F', 'Cl', 'Br', 'I'];
  var LINEAR_ALKANE_NAMES = [
    '', 'メタン', 'エタン', 'プロパン', 'ブタン', 'ペンタン', 'ヘキサン', 'ヘプタン',
    'オクタン', 'ノナン', 'デカン', 'ウンデカン', 'ドデカン', 'トリデカン',
    'テトラデカン', 'ペンタデカン', 'ヘキサデカン', 'ヘプタデカン', 'オクタデカン',
    'ノナデカン', 'エイコサン'
  ];

  var ROLE_LABELS = {
    alkane: 'アルカン',
    alkene: 'アルケン',
    alkyne: 'アルキン',
    monohalogen: '一ハロゲン化物',
    multihalogen: '多ハロゲン化物',
    alcohol: '一価アルコール',
    polyol: '多価アルコール',
    ether: 'エーテル',
    aldehyde: 'アルデヒド',
    ketone: 'ケトン',
    monocarboxy: '一価カルボン酸',
    dicarboxy: '二価カルボン酸（2COOH）',
    'hydroxy-acid': 'ヒドロキシ酸',
    'hydroxy-polycarboxy': 'ヒドロキシ多価カルボン酸',
    'keto-acid': 'ケト酸',
    'acid-chloride': '酸塩化物',
    anhydride: 'カルボン酸無水物',
    monoester: '一価エステル',
    triester: '三価エステル（トリエステル）',
    'amine-1': '第一級アミン',
    'amine-2': '第二級アミン',
    'amine-3': '第三級アミン',
    nitrile: 'ニトリル',
    nitro: 'ニトロ化合物',
    'amino-alcohol': 'アミノアルコール'
  };

  /* ------------------------------------------------------------------
   * 検証済み manual graph（簡略式のままだと原子数上限・cis/trans 表記で
   * condensedGraphFor が graph を返さない3件だけ）
   * ------------------------------------------------------------------ */
  function linearAlkaneGraph(n) {
    var atoms = [];
    var bonds = [];
    var i;
    for (i = 0; i < n; i++) {
      atoms.push({
        el: 'C',
        h: (i === 0 || i === n - 1) ? 3 : 2,
        x: 44 + i * 34,
        y: 100
      });
      if (i > 0) bonds.push({ a: i - 1, b: i, order: 1 });
    }
    return { atoms: atoms, bonds: bonds, mode: 'condensed', width: 88 + (n - 1) * 34, height: 200 };
  }

  function maleicGraph() {
    // HOOC–CH=CH–COOH。cis/trans は graph では区別しない（デスクリプタは
    // 親炭化水素の C2 エテンとして扱い、結果カード側で物質を区別する）。
    return {
      atoms: [
        { el: 'C', h: 0, x: 120, y: 100 },
        { el: 'O', h: 0, x: 120, y: 52 },
        { el: 'O', h: 1, x: 56, y: 100 },
        { el: 'C', h: 1, x: 190, y: 100 },
        { el: 'C', h: 1, x: 260, y: 100 },
        { el: 'C', h: 0, x: 330, y: 100 },
        { el: 'O', h: 0, x: 330, y: 52 },
        { el: 'O', h: 1, x: 394, y: 100 }
      ],
      bonds: [
        { a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }, { a: 0, b: 3, order: 1 },
        { a: 3, b: 4, order: 2 }, { a: 4, b: 5, order: 1 },
        { a: 5, b: 6, order: 2 }, { a: 5, b: 7, order: 1 }
      ],
      mode: 'condensed',
      width: 450,
      height: 200
    };
  }

  var MANUAL_GRAPHS = {
    'maleic-acid': maleicGraph(),
    'fumaric-acid': maleicGraph(),
    eicosane: linearAlkaneGraph(20)
  };

  function manualGraphFor(id) {
    return MANUAL_GRAPHS[id] || null;
  }

  var graphCache = {};
  function exactGraphFor(compoundOrId) {
    var c = typeof compoundOrId === 'string' ? D.COMPOUNDS[compoundOrId] : compoundOrId;
    if (!c) return { graph: null, source: 'none', reason: '化合物データがありません' };
    if (c.__ocGraphInfo) return c.__ocGraphInfo;
    var spec = c.structure;
    var result;
    if (!spec) {
      result = { graph: null, source: 'none', reason: '構造データがありません' };
    } else if (GRAPH_TYPES.indexOf(spec.type) !== -1) {
      try {
        result = { graph: R.buildStructure(spec), source: 'build' };
      } catch (e) {
        result = { graph: null, source: 'none', reason: e.message || '構造グラフを構築できません' };
      }
    } else if (spec.type === 'condensed') {
      var parsed = R.condensedGraphFor(c);
      if (parsed.graph) {
        result = { graph: parsed.graph, source: 'condensed' };
      } else {
        var manual = manualGraphFor(c.id);
        result = manual
          ? { graph: manual, source: 'manual' }
          : { graph: null, source: 'none', reason: parsed.reason || '簡略式から構造を作れません' };
      }
    } else {
      result = { graph: null, source: 'none', reason: '鎖式以外の構造形式です' };
    }
    graphCache[c.id] = result;
    return result;
  }

  /* ------------------------------------------------------------------
   * グラフの基本操作
   * ------------------------------------------------------------------ */
  function atomAdjacency(graph) {
    var adj = [];
    var i;
    for (i = 0; i < graph.atoms.length; i++) adj.push([]);
    (graph.bonds || []).forEach(function (b) {
      if (!adj[b.a] || !adj[b.b]) return;
      adj[b.a].push({ atom: b.b, order: b.order || 1 });
      adj[b.b].push({ atom: b.a, order: b.order || 1 });
    });
    return adj;
  }

  function isCarbonylOrNitrile(atom, neighbors) {
    if (!atom || atom.el !== 'C') return false;
    return neighbors.some(function (n) {
      return (n.el === 'O' && n.order === 2) || (n.el === 'N' && n.order === 3);
    });
  }

  function coreCarbonIndices(graph, adj) {
    var out = [];
    graph.atoms.forEach(function (a, i) {
      var ns = adj[i].map(function (n) {
        return { el: graph.atoms[n.atom].el, order: n.order };
      });
      if (isCarbonylOrNitrile(a, ns)) out.push(i);
    });
    return out;
  }

  function carbonComponents(graph, adj, coreSet) {
    var keep = function (i) {
      return graph.atoms[i] && graph.atoms[i].el === 'C' && !coreSet[i];
    };
    var seen = {};
    var comps = [];
    var i;
    for (i = 0; i < graph.atoms.length; i++) {
      if (!keep(i) || seen[i]) continue;
      var stack = [i];
      var comp = [];
      seen[i] = true;
      while (stack.length) {
        var v = stack.pop();
        comp.push(v);
        adj[v].forEach(function (e) {
          if (!keep(e.atom) || seen[e.atom]) return;
          if (graph.atoms[e.atom].el !== 'C') return;
          seen[e.atom] = true;
          stack.push(e.atom);
        });
      }
      comps.push(comp);
    }
    return comps;
  }

  function localAdjacency(comp, graph, adj, info) {
    var local = {};
    comp.forEach(function (v, i) { local[v] = i; });
    var neighbors = comp.map(function () { return []; });
    var labels = comp.map(function (v, i) {
      var a = graph.atoms[v];
      // 断片のHは「接続点にHを補った親炭化水素」のH数を使う。
      // 元graphのH数をそのまま使うと、同じ親でも置換位置で別形になる。
      var h = info && info.parentHydrogens ? info.parentHydrogens[i] : (a.h || 0);
      return a.el + ':' + h + ':' + (a.charge || '');
    });
    var edges = [];
    comp.forEach(function (v, li) {
      adj[v].forEach(function (e) {
        if (local[e.atom] == null) return;
        if (e.atom < v) return;
        var w = local[e.atom];
        neighbors[li].push({ to: w, order: e.order });
        neighbors[w].push({ to: li, order: e.order });
        edges.push({ a: li, b: w, order: e.order });
      });
    });
    return { edges: edges, neighbors: neighbors, labels: labels };
  }

  function treeCanonical(neighbors, labels, n) {
    function encode(v, parent) {
      var child = [];
      var list = neighbors[v] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].to === parent) continue;
        // 各edgeのbondorderを子コードの前に残す。位置異性体を同一視しない。
        child.push(list[i].order + encode(list[i].to, v));
      }
      child.sort();
      return '(' + labels[v] + ':' + child.join(',') + ')';
    }
    var best = null;
    for (var r = 0; r < n; r++) {
      var code = encode(r, -1);
      if (best === null || code < best) best = code;
    }
    return best || '()';
  }

  function hash32(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function wlHash(neighbors, labels, n) {
    var current = labels.slice();
    var i;
    for (var step = 0; step < n; step++) {
      var next = [];
      for (i = 0; i < n; i++) {
        var ns = [];
        (neighbors[i] || []).forEach(function (edge) {
          ns.push(edge.order + current[edge.to]);
        });
        ns.sort();
        next.push(hash32(current[i] + ':' + ns.join(',')));
      }
      current = next;
    }
    return current.slice().sort().join('.');
  }

  function componentShape(comp, graph, adj, info) {
    var local = localAdjacency(comp, graph, adj, info);
    var exact = treeCanonical(local.neighbors, local.labels, comp.length);
    var wl = wlHash(local.neighbors, local.labels, comp.length);
    return {
      skeleton: exact,
      wl: wl,
      carbonCount: comp.length,
      doubleBonds: info.doubleBonds,
      tripleBonds: info.tripleBonds,
      key: exact + '|' + info.doubleBonds + '|' + info.tripleBonds
    };
  }

  function componentInfo(comp, graph, adj, coreSet) {
    var set = {};
    comp.forEach(function (v) { set[v] = true; });
    var internal = [];
    var attachments = [];
    var attachmentAtoms = {};
    var orderSum = {};
    var d = 0;
    var t = 0;
    comp.forEach(function (v) { orderSum[v] = 0; });
    comp.forEach(function (v) {
      adj[v].forEach(function (e) {
        if (set[e.atom]) {
          orderSum[v] += e.order;
          if (v < e.atom) {
            internal.push({ a: v, b: e.atom, order: e.order });
            if (e.order === 2) d++;
            else if (e.order === 3) t++;
          }
          return;
        }
        var other = graph.atoms[e.atom];
        if (!other || other.el === 'H') return;
        attachments.push({
          atom: v,
          to: e.atom,
          el: other.el,
          order: e.order,
          core: !!(coreSet && coreSet[e.atom])
        });
        attachmentAtoms[v] = true;
      });
    });
    return {
      internal: internal,
      attachments: attachments,
      attachmentAtoms: Object.keys(attachmentAtoms).map(Number),
      doubleBonds: d,
      tripleBonds: t,
      carbonCount: comp.length,
      branchCount: comp.reduce(function (sum, v) {
        var degree = 0;
        adj[v].forEach(function (e) { if (set[e.atom]) degree++; });
        return sum + (degree >= 3 ? 1 : 0);
      }, 0),
      parentHydrogens: comp.map(function (v) { return 4 - orderSum[v]; })
    };
  }

  function buildParentIndex(data, ids) {
    var index = {};
    function register(shape, entry) {
      if (index[shape.key]) return;
      // 実在する親炭化水素の名称・IDをそのまま使う。ブタ-1-エンと
      // ブタ-2-エンを「ブテン」に丸めると結合位置が失われるため、
      // 不飽和の位置を含む名称を保持する。
      index[shape.key] = entry;
    }
    function addLinearAlkane(n) {
      var graph = linearAlkaneGraph(n);
      var adj = atomAdjacency(graph);
      var comp = [];
      for (var i = 0; i < n; i++) comp.push(i);
      var info = componentInfo(comp, graph, adj, {});
      var shape = componentShape(comp, graph, adj, info);
      register(shape, {
        id: n === 1 ? 'methane' : 'c' + n,
        token: n === 1 ? 'methane' : 'c' + n,
        parentName: LINEAR_ALKANE_NAMES[n] || ('C' + n + 'アルカン'),
        kind: 'generated',
        branchCount: info.branchCount
      });
    }
    ids.forEach(function (id) {
      var c = data.COMPOUNDS[id];
      var g = exactGraphFor(c);
      if (!g.graph) return;
      if (g.graph.atoms.some(function (a) { return a.el !== 'C' && a.el !== 'H'; })) return;
      var adj = atomAdjacency(g.graph);
      var core = coreCarbonIndices(g.graph, adj);
      if (core.length) return;
      var coreSet = {};
      core.forEach(function (i) { coreSet[i] = true; });
      var comps = carbonComponents(g.graph, adj, coreSet);
      if (comps.length !== 1) return;
      var comp = comps[0];
      var info = componentInfo(comp, g.graph, adj, coreSet);
      var shape = componentShape(comp, g.graph, adj, info);
      register(shape, {
        id: id,
        token: id,
        parentName: shortCompoundName(c),
        kind: 'compound',
        branchCount: info.branchCount
      });
    });
    for (var n = 1; n <= 20; n++) addLinearAlkane(n);
    return index;
  }

  function shortCompoundName(c) {
    var name = String(c.name || c.id);
    var m = name.match(/（([^）]+)）/);
    if (m && /^(イソ|ネオ)[^（）]*$/.test(m[1])) return m[1];
    return name.split('（')[0];
  }

  function parentForShape(shape, parentIndex) {
    if (parentIndex[shape.key]) return parentIndex[shape.key];
    var n = shape.carbonCount;
    var suffix = '';
    if (shape.doubleBonds) suffix += '・二重結合' + shape.doubleBonds;
    if (shape.tripleBonds) suffix += '・三重結合' + shape.tripleBonds;
    return {
      id: 'c' + n + (shape.doubleBonds ? 'd' + shape.doubleBonds : '') + (shape.tripleBonds ? 't' + shape.tripleBonds : ''),
      token: 'c' + n + (shape.doubleBonds ? 'd' + shape.doubleBonds : '') + (shape.tripleBonds ? 't' + shape.tripleBonds : ''),
      parentName: 'C' + n + '炭化水素' + suffix,
      kind: 'fallback'
    };
  }

  /* ------------------------------------------------------------------
   * 官能基の役割（graph から数える）
   * ------------------------------------------------------------------ */
  function analyzeGroups(graph, adj) {
    var atoms = graph.atoms;
    var carbonyl = 0;
    var nitrile = 0;
    var carboxyl = 0;
    var ester = 0;
    var acidChloride = 0;
    var aldehyde = 0;
    var ketone = 0;
    var anhydride = 0;
    var hydroxyl = 0;
    var ether = 0;
    var amineDegrees = { 1: 0, 2: 0, 3: 0 };
    var nitro = 0;
    var halogen = 0;
    var core = {};

    atoms.forEach(function (a, i) {
      if (a.el === 'C') {
        var ns = adj[i].map(function (n) {
          return { el: atoms[n.atom].el, order: n.order, atom: n.atom, h: atoms[n.atom].h || 0 };
        });
        var isCarbonyl = ns.some(function (n) { return n.el === 'O' && n.order === 2; });
        var isNitrile = ns.some(function (n) { return n.el === 'N' && n.order === 3; });
        if (isCarbonyl) { carbonyl++; core[i] = true; }
        if (isNitrile) { nitrile++; core[i] = true; }
        if (!isCarbonyl) return;
        var singleO = ns.filter(function (n) { return n.el === 'O' && n.order === 1; });
        var cl = ns.filter(function (n) { return n.el === 'Cl' && n.order === 1; });
        var hasH = (a.h || 0) > 0 || ns.some(function (n) { return n.el === 'H'; });
        if (cl.length) { acidChloride++; return; }
        if (singleO.length) {
          var isCarboxyl = singleO.some(function (n) { return n.h > 0; });
          var isAnhydride = singleO.some(function (n) {
            return adj[n.atom].some(function (x) {
              if (x.atom === i) return false;
              return atoms[x.atom].el === 'C' && adj[x.atom].some(function (y) {
                return atoms[y.atom].el === 'O' && y.order === 2;
              });
            });
          });
          var isEster = singleO.some(function (n) {
            return adj[n.atom].some(function (x) {
              return x.atom !== i && atoms[x.atom].el === 'C';
            });
          });
          if (isAnhydride) { anhydride++; return; }
          if (isCarboxyl) { carboxyl++; return; }
          if (isEster) { ester++; return; }
          return;
        }
        if (hasH) { aldehyde++; return; }
        ketone++;
      }
    });

    atoms.forEach(function (a, i) {
      if (a.el === 'O') {
        var bondedToCarbonyl = adj[i].some(function (n) {
          return atoms[n.atom].el === 'C' && adj[n.atom].some(function (x) {
            return atoms[x.atom].el === 'O' && x.order === 2;
          });
        });
        if (bondedToCarbonyl) return;
        if ((a.h || 0) > 0) { hydroxyl++; return; }
        var carbonNs = adj[i].filter(function (n) { return atoms[n.atom].el === 'C'; });
        if (carbonNs.length === 2) ether++;
      } else if (a.el === 'N') {
        var ns = adj[i].map(function (n) {
          return { el: atoms[n.atom].el, order: n.order };
        });
        if (ns.some(function (n) { return n.el === 'C' && n.order === 3; })) return;
        if (ns.some(function (n) { return n.el === 'O'; })) { nitro++; return; }
        var carbonCount = ns.filter(function (n) { return n.el === 'C'; }).length;
        if (carbonCount >= 1 && carbonCount <= 3) amineDegrees[carbonCount]++;
      } else if (HALOGENS.indexOf(a.el) !== -1) {
        halogen++;
      }
    });

    var coreCount = Object.keys(core).length;
    return {
      carbonyl: carbonyl,
      nitrile: nitrile,
      carboxyl: carboxyl,
      ester: ester,
      acidChloride: acidChloride,
      aldehyde: aldehyde,
      ketone: ketone,
      anhydride: anhydride,
      hydroxyl: hydroxyl,
      ether: ether,
      amineDegrees: amineDegrees,
      amine: amineDegrees[1] + amineDegrees[2] + amineDegrees[3],
      nitro: nitro,
      halogen: halogen,
      coreCount: coreCount,
      core: core
    };
  }

  function roleFor(family, groups) {
    if (family === 'carboxylic') {
      if (groups.acidChloride) return 'acid-chloride';
      if (groups.carboxyl >= 2 && groups.hydroxyl > 0) return 'hydroxy-polycarboxy';
      if (groups.carboxyl >= 2) return 'dicarboxy';
      if (groups.hydroxyl > 0) return 'hydroxy-acid';
      if (groups.ketone > 0) return 'keto-acid';
      return 'monocarboxy';
    }
    if (family === 'halogen') return groups.halogen > 1 ? 'multihalogen' : 'monohalogen';
    if (family === 'ester') return groups.ester >= 3 ? 'triester' : 'monoester';
    if (family === 'amine') {
      var deg = groups.amineDegrees[3] ? 3 : (groups.amineDegrees[2] ? 2 : 1);
      return 'amine-' + deg;
    }
    if (family === 'polyol') return 'polyol';
    if (family === 'amino-alcohol') return 'amino-alcohol';
    if (family === 'alcohol') return 'alcohol';
    return family;
  }

  function hasRHydrogenOnCore(graph, adj, coreIndices) {
    var rHydrogen = false;
    var aldehydeFixedH = 0;
    var details = [];
    coreIndices.forEach(function (i) {
      var a = graph.atoms[i];
      var ns = adj[i].map(function (n) {
        return { el: graph.atoms[n.atom].el, order: n.order, atom: n.atom, h: graph.atoms[n.atom].h || 0 };
      });
      var explicitH = ns.filter(function (n) { return n.el === 'H'; }).length;
      var hCount = (a.h || 0) + explicitH;
      var isCarbonyl = ns.some(function (n) { return n.el === 'O' && n.order === 2; });
      if (!hCount || !isCarbonyl) {
        details.push({ atom: i, type: isCarbonyl ? 'carbonyl-no-h' : 'nitrile', hydrogens: hCount, rHydrogens: 0, fixedHydrogens: 0 });
        return;
      }
      var singleO = ns.filter(function (n) { return n.el === 'O' && n.order === 1; });
      var cl = ns.filter(function (n) { return n.el === 'Cl' && n.order === 1; });
      var isAnhydride = singleO.some(function (n) {
        return adj[n.atom].some(function (x) {
          if (x.atom === i) return false;
          return graph.atoms[x.atom].el === 'C' && adj[x.atom].some(function (y) {
            return graph.atoms[y.atom].el === 'O' && y.order === 2;
          });
        });
      });
      var isCarboxyl = singleO.some(function (n) { return n.h > 0; });
      var isEster = singleO.some(function (n) {
        return adj[n.atom].some(function (x) {
          return x.atom !== i && graph.atoms[x.atom].el === 'C';
        });
      });
      var type = cl.length ? 'acid-chloride'
        : (isAnhydride ? 'anhydride'
          : (isCarboxyl ? 'carboxyl' : (isEster ? 'ester' : 'aldehyde')));
      var fixed = 0;
      var rH = 0;
      if (type === 'aldehyde') {
        // −CHO のHは官能基側。ホルムアルデヒドだけはCHO固定H1に加えて
        // 炭化水素基R=Hが1つあるので、①のH断片として数える。
        fixed = 1;
        rH = Math.max(0, hCount - 1);
      } else {
        // ギ酸・ギ酸エステルの carbonyl C–H は R=H。カルボン酸/エステルの
        // 酸性O–Hはcarbonyl Cに結合していないため、ここには入らない。
        rH = hCount;
      }
      if (rH > 0) rHydrogen = true;
      aldehydeFixedH += fixed;
      details.push({ atom: i, type: type, hydrogens: hCount, rHydrogens: rH, fixedHydrogens: fixed });
    });
    return {
      rHydrogen: rHydrogen,
      aldehydeFixedH: aldehydeFixedH,
      details: details
    };
  }


  function formulaCarbonCount(formula) {
    var m = String(formula || '').match(/(?:^|[^A-Za-z])C(\d*)/);
    if (!m) return null;
    return m[1] ? Number(m[1]) : 1;
  }

  /* ------------------------------------------------------------------
   * 断片の表示
   * ------------------------------------------------------------------ */
  function fragmentCarbonLabel(fragment) {
    if (fragment.isHydrogen) return 'H';
    if (fragment.carbonCount === 1) return 'メチル基';
    if (fragment.carbonCount === 2) {
      if (fragment.doubleBonds === 1) return 'ビニル基';
      if (fragment.tripleBonds === 1) return 'エチニル基';
      return 'エチル基';
    }
    return fragment.parentName + '骨格';
  }

  function isPositionalHydrocarbonLabel(fragment) {
    if (!fragment || !fragment.parentName) return false;
    if (!(fragment.doubleBonds || fragment.tripleBonds)) return false;
    return /[-−]\d+[-−]/.test(fragment.parentName);
  }

  function fragmentOriginLabel(fragment) {
    if (fragment.isHydrogen) return 'H';
    if (isPositionalHydrocarbonLabel(fragment)) return fragment.parentName;
    return fragment.parentName + '由来';
  }

  function buildDescriptorLabel(uniqueFragments) {
    if (!uniqueFragments.length) return '炭化水素基なし〈H〉';
    if (uniqueFragments.length === 1) {
      var f = uniqueFragments[0];
      if (f.isHydrogen) return '炭化水素基なし〈H〉';
      var single = f.carbonCount === 1 ? 'メチル基'
        : (f.carbonCount === 2 && f.doubleBonds === 1 ? 'エテン'
          : (f.carbonCount === 2 && f.tripleBonds === 1 ? 'エチン' : f.parentName));
      if (f.count > 1) return fragmentCarbonLabel(f) + '×' + f.count;
      if (f.carbonCount === 1) return 'メチル基（メタン由来）';
      if (f.carbonCount === 2 && f.doubleBonds === 1) return 'エテン由来';
      if (f.carbonCount === 2 && f.tripleBonds === 1) return 'エチン由来';
      if (isPositionalHydrocarbonLabel(f)) return f.parentName;
      return f.parentName + '由来';
    }
    var ordered = uniqueFragments.slice().sort(function (a, b) {
      if (a.isHydrogen !== b.isHydrogen) return a.isHydrogen ? -1 : 1;
      return b.carbonCount - a.carbonCount || (a.parentName < b.parentName ? -1 : 1);
    });
    return ordered.map(function (f) {
      var label = fragmentCarbonLabel(f);
      return label + (f.count > 1 ? '×' + f.count : '');
    }).join('＋');
  }

  function fragmentToken(fragment) {
    if (fragment.isHydrogen) return 'h';
    return fragment.token || fragment.parentId || ('c' + fragment.carbonCount);
  }

  function buildDescriptorId(uniqueFragments, partialC) {
    var counts = {};
    var order = [];
    uniqueFragments.forEach(function (f) {
      var token = fragmentToken(f);
      if (!counts[token]) { counts[token] = 0; order.push(token); }
      counts[token] += f.count || 1;
    });
    order.sort();
    return 'd-' + order.map(function (token) {
      return token + (counts[token] > 1 ? 'x' + counts[token] : '');
    }).join('+') + '-c' + partialC;
  }

  function sortKeyForDescriptor(d) {
    var f = d.uniqueFragments[0] || {};
    var hasH = d.uniqueFragments.some(function (x) { return x.isHydrogen; }) ? 1 : 0;
    var total = d.uniqueFragments.reduce(function (n, x) { return n + (x.count || 1); }, 0);
    var branch = 0;
    d.uniqueFragments.forEach(function (x) { branch = Math.max(branch, x.branchCount || 0); });
    var unsat = (f.doubleBonds ? 1 : 0) + (f.tripleBonds ? 2 : 0);
    return [
      total,
      hasH,
      branch,
      unsat,
      f.skeleton || '',
      d.id
    ];
  }

  function compareSortKey(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  /* ------------------------------------------------------------------
   * 断片のプレビュー（親炭化水素＋接続点）
   * ------------------------------------------------------------------ */
  function previewStructure(component) {
    var local = {};
    component.atoms.forEach(function (v, i) { local[v] = i; });
    var atoms = component.atoms.map(function (v, i) {
      var a = component.graph.atoms[v];
      return {
        el: 'C',
        h: component.info.parentHydrogens[i],
        x: typeof a.x === 'number' ? a.x : 44 + i * 44,
        y: typeof a.y === 'number' ? a.y : 100
      };
    });
    var bonds = component.info.internal.map(function (b) {
      return { a: local[b.a], b: local[b.b], order: b.order };
    });
    return {
      type: 'custom',
      atoms: atoms,
      bonds: bonds,
      mode: 'condensed',
      width: 380,
      height: 230
    };
  }

  /* ------------------------------------------------------------------
   * 本体
   * ------------------------------------------------------------------ */
  var state = {
    built: false,
    byCompound: {},
    byKey: {},
    byId: {},
    list: [],
    parentIndex: {},
    warnings: []
  };

  function build(data, ids, options) {
    options = options || {};
    var familyOf = options.familyOf || function () { return null; };
    var parentIndex = buildParentIndex(data, ids);
    var byCompound = {};
    var byKey = {};
    var byId = {};
    var list = [];
    var warnings = [];

    ids.forEach(function (id) {
      var c = data.COMPOUNDS[id];
      if (!c) { warnings.push(id + ': 化合物データなし'); return; }
      var graphInfo = exactGraphFor(c);
      if (!graphInfo.graph) {
        warnings.push(id + ': exact graph なし（' + graphInfo.reason + '）');
        return;
      }
      var graph = graphInfo.graph;
      var adj = atomAdjacency(graph);
      var coreIndices = coreCarbonIndices(graph, adj);
      var coreSet = {};
      coreIndices.forEach(function (i) { coreSet[i] = true; });
      var groups = analyzeGroups(graph, adj);
      var comps = carbonComponents(graph, adj, coreSet);
      var fragments = comps.map(function (comp) {
        var info = componentInfo(comp, graph, adj, coreSet);
        var shape = componentShape(comp, graph, adj, info);
        var parent = parentForShape(shape, parentIndex);
        return {
          key: shape.key,
          skeleton: shape.skeleton,
          wl: shape.wl,
          carbonCount: info.carbonCount,
          branchCount: info.branchCount,
          doubleBonds: info.doubleBonds,
          tripleBonds: info.tripleBonds,
          attachmentCount: info.attachmentAtoms.length,
          attachmentAtoms: info.attachmentAtoms,
          parentId: parent.id,
          token: parent.token || parent.id,
          parentName: parent.parentName,
          component: { atoms: comp, graph: graph, info: info }
        };
      });

      var coreHydrogen = hasRHydrogenOnCore(graph, adj, coreIndices);
      var useH = fragments.length === 0 || coreHydrogen.rHydrogen;
      if (useH) {
        fragments.push({
          key: 'H',
          skeleton: '',
          wl: '',
          carbonCount: 0,
          doubleBonds: 0,
          tripleBonds: 0,
          attachmentCount: 0,
          attachmentAtoms: [],
          parentId: null,
          parentName: 'H',
          isHydrogen: true,
          component: null
        });
      }

      var key = fragments.map(function (f) { return f.key; }).sort().join('*');
      var descriptor = byKey[key];
      if (!descriptor) {
        descriptor = {
          key: key,
          id: '',
          partialC: 0,
          uniqueFragments: [],
          occurrences: [],
          compoundIds: [],
          families: [],
          roles: [],
          bestFragments: {},
          label: '',
          sortKey: null
        };
        byKey[key] = descriptor;
        list.push(descriptor);
      }
      descriptor.compoundIds.push(id);
      descriptor.occurrences.push(fragments);

      var fragmentKeyCount = {};
      fragments.forEach(function (f) { fragmentKeyCount[f.key] = (fragmentKeyCount[f.key] || 0) + 1; });
      Object.keys(fragmentKeyCount).forEach(function (fkey) {
        var existing = descriptor.uniqueFragments.filter(function (f) { return f.key === fkey; })[0];
        var sample = fragments.filter(function (f) { return f.key === fkey; })[0];
        if (!existing) {
          existing = {
            key: sample.key,
            skeleton: sample.skeleton,
            wl: sample.wl,
            carbonCount: sample.carbonCount,
            branchCount: sample.branchCount,
            doubleBonds: sample.doubleBonds,
            tripleBonds: sample.tripleBonds,
            parentId: sample.parentId,
            token: sample.token,
            parentName: sample.parentName,
            isHydrogen: !!sample.isHydrogen,
            count: 0
          };
          descriptor.uniqueFragments.push(existing);
        }
        existing.count = fragmentKeyCount[fkey];
        var best = descriptor.bestFragments[fkey];
        if (!best || (sample.attachmentCount > best.attachmentCount)) {
          descriptor.bestFragments[fkey] = sample;
        }
      });

      var family = familyOf(id);
      var role = roleFor(family, groups);
      var totalC = graph.atoms.filter(function (a) { return a.el === 'C'; }).length;
      var formulaC = formulaCarbonCount(c.formula);
      var partialC = totalC - coreIndices.length;
      var independentPartial = formulaC == null ? null : formulaC - coreIndices.length;
      if (independentPartial !== null && independentPartial !== partialC) {
        warnings.push(id + ': 部分炭素数の不一致 graph=' + partialC + ' formula=' + independentPartial);
      }
      var formulaOk = false;
      try { formulaOk = R.formulaOfGraph(graph) === c.formula; } catch (e) { formulaOk = false; }
      if (!formulaOk) warnings.push(id + ': exact graph の分子式が登録と不一致');

      descriptor.partialC = partialC;
      byCompound[id] = {
        id: id,
        family: family,
        role: role,
        groups: groups,
        graphSource: graphInfo.source,
        coreC: coreIndices.length,
        coreHydrogen: coreHydrogen,
        totalC: totalC,
        partialC: partialC,
        independentPartial: independentPartial,
        formulaOk: formulaOk,
        fragments: fragments,
        descriptorKey: key
      };
      if (descriptor.families.indexOf(family) === -1) descriptor.families.push(family);
      if (descriptor.roles.indexOf(role) === -1) descriptor.roles.push(role);
    });

    list.forEach(function (descriptor) {
      descriptor.uniqueFragments.sort(function (a, b) {
        if (a.isHydrogen !== b.isHydrogen) return a.isHydrogen ? 1 : -1;
        return b.carbonCount - a.carbonCount || (a.parentName < b.parentName ? -1 : 1);
      });
      descriptor.id = buildDescriptorId(descriptor.uniqueFragments, descriptor.partialC);
      descriptor.label = buildDescriptorLabel(descriptor.uniqueFragments);
      descriptor.sortKey = sortKeyForDescriptor(descriptor);
      if (byId[descriptor.id]) warnings.push('デスクリプタIDが重複: ' + descriptor.id);
      byId[descriptor.id] = descriptor;
      descriptor.compoundIds.sort();
      descriptor.families.sort();
      descriptor.roles.sort();
    });
    list.sort(function (a, b) {
      return a.partialC - b.partialC || compareSortKey(a.sortKey, b.sortKey);
    });
    Object.keys(byCompound).forEach(function (id) {
      var d = byKey[byCompound[id].descriptorKey];
      if (!d) return;
      byCompound[id].descriptorId = d.id;
      byCompound[id].descriptorLabel = d.label;
    });

    state.built = true;
    state.byCompound = byCompound;
    state.byKey = byKey;
    state.byId = byId;
    state.list = list;
    state.parentIndex = parentIndex;
    state.warnings = warnings;

    return {
      byCompound: byCompound,
      byKey: byKey,
      byId: byId,
      list: list,
      parentIndex: parentIndex,
      warnings: warnings
    };
  }

  function ensureBuilt() {
    if (!state.built) throw new Error('OCChainDescriptor.build() を先に呼び出してください');
    return state;
  }

  function descriptorFor(id) {
    var s = ensureBuilt();
    return s.byCompound[id] || null;
  }

  function descriptorById(id) {
    var s = ensureBuilt();
    return s.byId[id] || null;
  }

  function descriptorByKey(key) {
    var s = ensureBuilt();
    return s.byKey[key] || null;
  }

  function descriptorList() {
    return ensureBuilt().list.slice();
  }

  function partialOptions() {
    var set = {};
    descriptorList().forEach(function (d) { set[d.partialC] = true; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function descriptorsForPartial(partialC) {
    return descriptorList().filter(function (d) { return d.partialC === partialC; });
  }

  function previewTiles(descriptor) {
    if (!descriptor) return [];
    var tiles = [];
    var ordered = descriptor.uniqueFragments.slice().sort(function (a, b) {
      if (a.isHydrogen !== b.isHydrogen) return a.isHydrogen ? -1 : 1;
      return b.carbonCount - a.carbonCount || (a.parentName < b.parentName ? -1 : 1);
    });
    ordered.forEach(function (f) {
      var count = f.count || 1;
      for (var i = 0; i < count; i++) {
        var best = descriptor.bestFragments[f.key];
        if (f.isHydrogen || !best || !best.component) {
          tiles.push({
            kind: 'hydrogen',
            label: 'H',
            parentName: 'H',
            count: count
          });
          continue;
        }
        var structure = previewStructure({
          atoms: best.component.atoms,
          graph: best.component.graph,
          info: best.component.info
        });
        var local = {};
        best.component.atoms.forEach(function (v, li) { local[v] = li; });
        var marks = best.component.info.attachmentAtoms.map(function (v) {
          var li = local[v];
          return {
            x: structure.atoms[li].x,
            y: structure.atoms[li].y
          };
        });
        tiles.push({
          kind: 'hydrocarbon',
          label: best.attachmentCount ? fragmentCarbonLabel(f) : f.parentName,
          origin: fragmentOriginLabel(f),
          parentName: f.parentName,
          structure: structure,
          marks: marks,
          attachmentCount: marks.length,
          count: count
        });
      }
    });
    return tiles;
  }

  function sameFragmentShape(a, b) {
    if (!a || !b) return false;
    if (a.wl !== b.wl) return false;
    if (a.doubleBonds !== b.doubleBonds || a.tripleBonds !== b.tripleBonds) return false;
    return a.skeleton === b.skeleton;
  }

  return {
    build: build,
    exactGraphFor: exactGraphFor,
    manualGraphFor: manualGraphFor,
    descriptorFor: descriptorFor,
    descriptorById: descriptorById,
    descriptorByKey: descriptorByKey,
    descriptorList: descriptorList,
    partialOptions: partialOptions,
    descriptorsForPartial: descriptorsForPartial,
    previewTiles: previewTiles,
    roleLabel: function (role) { return ROLE_LABELS[role] || role; },
    ROLE_LABELS: ROLE_LABELS,
    sameFragmentShape: sameFragmentShape,
    _internal: {
      atomAdjacency: atomAdjacency,
      coreCarbonIndices: coreCarbonIndices,
      carbonComponents: carbonComponents,
      componentInfo: componentInfo,
      componentShape: componentShape,
      analyzeGroups: analyzeGroups,
      hasRHydrogenOnCore: hasRHydrogenOnCore,
      roleFor: roleFor,
      treeCanonical: treeCanonical,
      wlHash: wlHash,
      formulaCarbonCount: formulaCarbonCount,
      linearAlkaneGraph: linearAlkaneGraph,
      shortCompoundName: shortCompoundName
    }
  };
});
