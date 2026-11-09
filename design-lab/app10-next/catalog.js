/*
 * 有機化学ビルダー（app10-next）— 探し方の索引
 *
 * 3つの見方を、既存の登録データから導出する。
 *   鎖式   : 分子全体の総炭素数（官能基炭素を含む）＋化合物分類
 *   環式   : 固定した環（ベンゼン・ナフタレン・シクロアルカン等）＋置換基
 *   その他 : 糖・アミノ酸・脂質・天然高分子・合成高分子・材料のfamily
 *
 * このファイルは表示データを新しく作らない。data.js の COMPOUNDS / COMBOS /
 * SKELETONS / FAMILIES / MATERIALS を読み、検索経路だけを組み立てる。
 * 経路から漏れた化合物があれば other の「未分類」に入れ、可視化する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data.js'), require('./draw.js'), require('./chain-descriptor.js'));
  } else {
    root.OCCatalog = factory(root.OCData, root.OCDraw, root.OCChainDescriptor);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, R, X) {
  'use strict';

  if (!D || !R) throw new Error('OCCatalog: OCData と OCDraw が必要です');
  if (!X) throw new Error('OCCatalog: OCChainDescriptor が必要です');

  var CHAIN_CATEGORIES = ['alkane', 'unsat', 'alcohol', 'ether', 'aldehyde', 'ketone', 'carboxylic', 'ester', 'aromatic-amine'];
  var RING_CATEGORIES = ['aromatic', 'phenol', 'aromatic-other', 'cyclic'];
  var OTHER_CATEGORY_IDS = ['lipid', 'soap', 'sugar', 'amino', 'natural-polymer', 'synthetic-polymer', 'organic-salt'];
  var METALS = ['Na', 'K', 'Ag', 'Cu', 'Ca', 'Pb', 'Mg', 'Zn', 'Fe', 'Al', 'Ba', 'Li', 'Sn'];

  var CHAIN_FAMILIES = [
    { id: 'alkane', label: 'アルカン', note: '単結合だけの鎖式炭化水素。' },
    { id: 'alkene', label: 'アルケン', note: 'C=Cを1本以上もつ鎖式炭化水素。' },
    { id: 'alkyne', label: 'アルキン', note: 'C≡Cを1本以上もつ鎖式炭化水素。' },
    { id: 'halogen', label: 'ハロゲン化物', note: 'Cl・Br・Iを炭素に結合した化合物。' },
    { id: 'alcohol', label: 'アルコール（一価）', note: 'R–OH。O–Hの結合線は省略してOHとまとめて表す。一価アルコール。' },
    { id: 'polyol', label: '多価アルコール', note: '1分子に2個以上のOHをもつ。飽和/不飽和はC=C・C≡Cの有無で別に判定する。' },
    { id: 'ether', label: 'エーテル', note: 'R–O–R′。総炭素数を2つのRに分けて数える。C–C結合を保つ表記ではない。' },
    { id: 'aldehyde', label: 'アルデヒド', note: '–CHO。末端のカルボニル基。' },
    { id: 'ketone', label: 'ケトン', note: 'C=Oが炭素鎖の途中にある。' },
    { id: 'carboxylic', label: 'カルボン酸', note: '–COOH。COOHの炭素も総炭素数に含める。' },
    { id: 'anhydride', label: 'カルボン酸無水物', note: '2分子のカルボン酸から水がとれた構造。' },
    { id: 'ester', label: 'エステル', note: '–COO–。カルボン酸とアルコールの脱水縮合でできる構造。' },
    { id: 'amine', label: 'アミン', note: 'Nに結合する炭化水素基の数で第一級〜第三級に分ける。' },
    { id: 'nitrile', label: 'ニトリル', note: '–C≡N。CNの炭素も総炭素数に含める。' },
    { id: 'nitro', label: 'ニトロ化合物', note: '–NO₂を炭素に結合した化合物。' },
    { id: 'amino-alcohol', label: 'アミノアルコール（多官能）', note: 'アミノ基とヒドロキシ基を併せもつ。モノアミン R–NH₂ の一般式とは別に扱う。' }
  ];

  var CHAIN_FAMILY_LABEL = {};
  CHAIN_FAMILIES.forEach(function (f) { CHAIN_FAMILY_LABEL[f.id] = f.label; });

  // ②の選択カードは全16分類で「上段=簡単な官能基の形（大きく）/
  // 下段=分類名（小さく）」に統一する。選択カードでは C(=O) の括弧表記を
  // 使わず、CO と縮合して書く（詳しい右preview・結果図は実二重結合線で描く）。
  // アミンは −NH₂ だけを示すと第二・第三級を排除したと誤認するため「など」を添える。
  var CHAIN_FAMILY_PICK = {
    alkane: { main: 'C−C', sub: 'アルカン', note: '単結合だけの鎖式炭化水素。' },
    alkene: { main: 'C=C', sub: 'アルケン', note: 'C=Cを1本以上もつ鎖式炭化水素。' },
    alkyne: { main: 'C≡C', sub: 'アルキン', note: 'C≡Cを1本以上もつ鎖式炭化水素。' },
    halogen: { main: '−X', sub: 'ハロゲン化物', note: 'Cl・Br・Iを炭素に結合した化合物。' },
    alcohol: { main: '−OH', sub: 'アルコール', note: '一価アルコール。O–Hの結合線は省略してOHとまとめて表す。' },
    polyol: { main: '−OH ×2以上', sub: '多価アルコール', note: '1分子に2個以上のOHをもつ多価アルコール。' },
    ether: { main: '−O−', sub: 'エーテル', note: '炭素を2つのRに分けて数える。C–C結合を保つ表記ではない。' },
    aldehyde: { main: '−CHO', sub: 'アルデヒド', note: '末端のカルボニル基。R−C(=O)−H。' },
    ketone: { main: '−CO−', sub: 'ケトン', note: 'C=Oが炭素鎖の途中にある。' },
    carboxylic: { main: '−COOH', sub: 'カルボン酸', note: 'COOHの炭素は官能基側。炭化水素部分のC数とは別に数える。' },
    anhydride: { main: '−CO−O−CO−', sub: 'カルボン酸無水物', note: '2分子のカルボン酸から水がとれた構造。' },
    ester: { main: '−COO−', sub: 'エステル', note: 'カルボン酸とアルコールの脱水縮合でできる構造。' },
    amine: { main: '−NH₂ など', sub: 'アミン（1〜3級）', note: 'Nに結合する炭化水素基の数で第一級〜第三級に分ける。' },
    nitrile: { main: '−C≡N', sub: 'ニトリル', note: 'CNの炭素は官能基側。炭化水素部分のC数とは別に数える。' },
    nitro: { main: '−NO₂', sub: 'ニトロ化合物', note: 'ニトロ基を炭素に結合した化合物。' },
    'amino-alcohol': { main: '−OH ＋ −NH₂', sub: 'アミノアルコール', note: 'アミノ基とヒドロキシ基を併せもつ多官能化合物。' }
  };

  function chainFamilyPick(family, shape) {
    var pick = CHAIN_FAMILY_PICK[family] || { main: CHAIN_FAMILY_LABEL[family] || family, sub: '', note: '' };
    if (family === 'alkane' && shape) {
      var d = chainDescriptorById(shape);
      // C1のアルカンは C−C を要求しない（メタン CH₄）。
      if (d && d.partialC === 1) {
        return { main: 'CH₄', sub: pick.sub, note: '炭素1個のアルカン（メタン）。C−C結合はない。' };
      }
    }
    return { main: pick.main, sub: pick.sub, note: pick.note };
  }

  var AMINE_DEGREE = {
    methylamine: 1, ethylamine: 1, propylamine: 1, isopropylamine: 1,
    dimethylamine: 2, trimethylamine: 3, ethylmethylamine: 2,
    diethylamine: 2, triethylamine: 3,
    'butan-1-amine': 1, 'butan-2-amine': 1,
    '2-methylpropan-1-amine': 1, '2-methylpropan-2-amine': 1,
    'n-methylpropan-1-amine': 2, 'n-methylpropan-2-amine': 2,
    'n,n-dimethylethanamine': 3
  };

  function carbonCount(c) {
    if (!c || !c.formula) return null;
    var f = String(c.formula);
    var m = f.match(/(?:^|[^A-Za-z])C(\d*)/);
    if (!m) return null;
    return m[1] ? Number(m[1]) : 1;
  }

  function elementCount(formula, el) {
    var f = String(formula || '');
    var re = new RegExp(el + '(\\d*)', 'g');
    var total = 0;
    var m;
    while ((m = re.exec(f))) total += m[1] ? Number(m[1]) : 1;
    return total;
  }

  function nearestElement(text, index, dir) {
    for (var i = index + dir; i >= 0 && i < text.length; i += dir) {
      var ch = text[i];
      if (ch === 'H') continue;
      if (/[A-Z]/.test(ch)) return ch;
    }
    return '';
  }

  // C=C / C≡C だけを「不飽和炭化水素結合」とみなす。C=O は対象外。
  function hasCCMultipleBond(c) {
    if (!c || !c.structure) return false;
    var spec = c.structure;
    if (spec.doubleBonds && spec.doubleBonds.length) return true;
    if (spec.type === 'skeleton' || spec.type === 'sub' || spec.type === 'multi' || spec.type === 'custom') {
      try {
        var g = R.buildStructure(spec);
        for (var i = 0; i < g.bonds.length; i++) {
          var b = g.bonds[i];
          if (b.order >= 2 && g.atoms[b.a] && g.atoms[b.b] &&
            g.atoms[b.a].el === 'C' && g.atoms[b.b].el === 'C') return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    }
    if (spec.type === 'condensed') {
      var text = (spec.lines || []).join(' ');
      for (var j = 0; j < text.length; j++) {
        if (text[j] !== '=' && text[j] !== '≡') continue;
        var left = nearestElement(text, j, -1);
        var right = nearestElement(text, j, 1);
        if (left === 'C' && right === 'C') return true;
      }
    }
    return false;
  }

  function isMonohydricAlcohol(c) {
    if (!c || c.category !== 'alcohol') return false;
    return elementCount(c.formula, 'O') === 1;
  }

  function structureCondition(id) {
    var c = D.COMPOUNDS[id];
    return hasCCMultipleBond(c) ? 'unsaturated' : 'saturated';
  }

  function chainIdsFor(family, carbon, condition) {
    var ids = chainIds(family, carbon);
    if (!condition || condition === 'all') return ids;
    if (condition === 'unsaturated') {
      return ids.filter(function (id) { return hasCCMultipleBond(D.COMPOUNDS[id]); });
    }
    return ids.filter(function (id) {
      var c = D.COMPOUNDS[id];
      // 飽和/不飽和はC=C・C≡Cだけで判定する。OH数（一価/多価）は
      // family分類（alcohol / polyol）で分離し、飽和条件とは独立に扱う。
      return !hasCCMultipleBond(c);
    });
  }

  function isMetalFormula(formula) {
    var f = String(formula || '');
    return METALS.some(function (el) { return f.indexOf(el) !== -1; });
  }

  function bondAdjacency(graph) {
    var adj = [];
    var i;
    for (i = 0; i < graph.atoms.length; i++) adj.push([]);
    (graph.bonds || []).forEach(function (b) {
      if (!adj[b.a] || !adj[b.b]) return;
      adj[b.a].push(b.b);
      adj[b.b].push(b.a);
    });
    return adj;
  }

  function ringCount(spec) {
    if (!spec) return 0;
    if (spec.type === 'ring-sub') return 1;
    if (spec.type !== 'skeleton' && spec.type !== 'sub' && spec.type !== 'multi' && spec.type !== 'custom') return 0;
    var graph;
    try { graph = R.buildStructure(spec); } catch (e) { return 0; }
    var adj = bondAdjacency(graph);
    var seen = [];
    var components = 0;
    var i;
    for (i = 0; i < adj.length; i++) {
      if (seen[i]) continue;
      components++;
      var stack = [i];
      seen[i] = true;
      while (stack.length) {
        var v = stack.pop();
        adj[v].forEach(function (w) {
          if (!seen[w]) { seen[w] = true; stack.push(w); }
        });
      }
    }
    return (graph.bonds || []).length - graph.atoms.length + components;
  }

  function hasRing(spec) {
    return ringCount(spec) > 0;
  }

  function condensedText(c) {
    var s = c && c.structure;
    if (!s) return '';
    if (s.type === 'condensed') return (s.lines || []).join(' ');
    return '';
  }

  function isNitrile(c) {
    var text = condensedText(c) + ' ' + c.name + ' ' + c.id;
    return /C≡N|ニトリル|nitrile/i.test(text);
  }

  function chainFamily(c) {
    var cat = c.category;
    var text = condensedText(c) + ' ' + c.name + ' ' + c.id;
    if (cat === 'alcohol') {
      if (/N/.test(c.formula) && /OH|オール/.test(text)) return 'amino-alcohol';
      return isMonohydricAlcohol(c) ? 'alcohol' : 'polyol';
    }
    if (cat === 'ether' || cat === 'aldehyde' || cat === 'ketone' || cat === 'ester') return cat;
    if (cat === 'carboxylic') {
      if (/anhydride|無水/.test(text)) return 'anhydride';
      return 'carboxylic';
    }
    if (cat === 'alkane') {
      if (/Cl|Br|I/.test(c.formula)) return 'halogen';
      if (/N/.test(c.formula)) return 'nitro';
      return 'alkane';
    }
    if (cat === 'unsat') {
      if (/Cl|Br|I/.test(c.formula)) return 'halogen';
      if (/COOH|カルボン酸/.test(text)) return 'carboxylic';
      if (/CHO|アルデヒド|アール/.test(text)) return 'aldehyde';
      if (/OH|オール/.test(text)) return 'alcohol';
      if (/≡|アルキン|エチン|アセチレン|yne/.test(text)) return 'alkyne';
      return 'alkene';
    }
    if (cat === 'aromatic-amine') {
      if (isNitrile(c)) return 'nitrile';
      return 'amine';
    }
    return null;
  }

  /* ------------------------------------------------------------------
   * 環式: 固定骨格と置換基
   * ------------------------------------------------------------------ */
  var BENZENE_CUSTOM_IDS = {
    'p-divinylbenzene': true, guaiacol: true, 'n,n-dimethylaniline': true,
    'sulfanilic-acid': true, '2-nitrobenzaldehyde': true, acetaminophen: true,
    sulfanilamide: true, '2,4,6-tribromophenol': true,
    'p-hydroxybenzoic-acid': true, 'm-hydroxybenzoic-acid': true, ibuprofen: true,
    'phenoxide-ion': true
  };

  // ベンゼン環の置換基表示metadata。ring-sub構造の subs と custom構造の
  // data.js RING_SUBS を同じ形（key/label/count/positions）にそろえる。
  var RING_SUB_META = {
    OH: { label: 'OH', name: 'ヒドロキシ基', formula: '−O−H', simple: '−OH', attach: 'O', note: '環のHをOHで置き換える。フェノール類。' },
    CH3: { label: 'CH₃', name: 'メチル基', formula: '−CH₃', attach: 'C', note: '環のHをCH₃で置き換える。炭素が1つ増える。' },
    C2H5: { label: 'C₂H₅', name: 'エチル基', formula: '−CH₂−CH₃', attach: 'C', note: '環のHをエチル基で置き換える。' },
    'CH(CH3)2': { label: 'CH(CH₃)₂', name: 'イソプロピル基', formula: '−CH(CH₃)₂', attach: 'C', note: '環のHをイソプロピル基で置き換える。' },
    'CH=CH2': { label: 'CH=CH₂', name: 'ビニル基', formula: '−CH=CH₂', attach: 'C', note: '環のHをビニル基で置き換える。C=Cをもつ。' },
    Cl: { label: 'Cl', name: '塩素', formula: '−Cl', attach: 'Cl', note: '環のHを塩素原子で置き換える。' },
    Br: { label: 'Br', name: '臭素', formula: '−Br', attach: 'Br', note: '環のHを臭素原子で置き換える。' },
    I: { label: 'I', name: 'ヨウ素', formula: '−I', attach: 'I', note: '環のHをヨウ素原子で置き換える。' },
    COOH: { label: 'COOH', name: 'カルボキシ基', formula: '−C(=O)−O−H', simple: '−COOH', attach: 'C', note: '環のHをカルボキシ基で置き換える。安息香酸誘導体。' },
    CHO: { label: 'CHO', name: 'ホルミル基', formula: '−C(=O)−H', simple: '−CHO', attach: 'C', note: '環のHをホルミル基で置き換える。ベンズアルデヒド誘導体。' },
    NH2: { label: 'NH₂', name: 'アミノ基', formula: '−NH₂', attach: 'N', note: '環のHをアミノ基で置き換える。アニリン誘導体。' },
    NO2: { label: 'NO₂', name: 'ニトロ基', formula: '−NO₂', attach: 'N', note: '環のHをニトロ基で置き換える。' },
    CN: { label: 'CN', name: 'シアノ基', formula: '−C≡N', simple: '−C≡N', attach: 'C', note: '環のHをシアノ基で置き換える。ベンゾニトリル。' },
    OCH3: { label: 'OCH₃', name: 'メトキシ基', formula: '−O−CH₃', attach: 'O', note: '環のHをメトキシ基で置き換える。アニソール誘導体。' },
    OCOCH3: { label: 'OCOCH₃', name: 'アセトキシ基', formula: '−O−C(=O)−CH₃', simple: '−OCOCH₃', attach: 'O', note: '環のHをアセトキシ基で置き換える。エステル結合をもつ。' },
    COOCH3: { label: 'COOCH₃', name: 'メトキシカルボニル基', formula: '−C(=O)−O−CH₃', simple: '−COOCH₃', attach: 'C', note: '環のHをエステル基で置き換える。' },
    NHCOCH3: { label: 'NHCOCH₃', name: 'アセトアミド基', formula: '−NH−C(=O)−CH₃', simple: '−NHCOCH₃', attach: 'N', note: '環のHをアセトアミド基で置き換える。' },
    SO3H: { label: 'SO₃H', name: 'スルホ基', formula: '−SO₃H', attach: 'S', note: '環のHをスルホ基で置き換える。' },
    SO2NH2: { label: 'SO₂NH₂', name: 'スルホンアミド基', formula: '−SO₂NH₂', attach: 'S', note: '環のHをスルホンアミド基で置き換える。' },
    'N(CH3)2': { label: 'N(CH₃)₂', name: 'ジメチルアミノ基', formula: '−N(CH₃)₂', attach: 'N', note: '環のHをジメチルアミノ基で置き換える。' },
    CH2OH: { label: 'CH₂OH', name: 'ヒドロキシメチル基', formula: '−CH₂−OH', attach: 'C', note: '環のHをヒドロキシメチル基で置き換える。' },
    COCl: { label: 'COCl', name: 'クロロカルボニル基', formula: '−C(=O)−Cl', simple: '−COCl', attach: 'C', note: '環のHをクロロカルボニル基で置き換える。酸塩化物。' },
    SH: { label: 'SH', name: 'チオール基', formula: '−S−H', attach: 'S', note: '環のHをSHで置き換える。' },
    'O-': { label: 'O⁻', name: 'フェノキシドO⁻', formula: '−O⁻', simple: '−O⁻', attach: 'O', note: 'フェノールのH⁺が外れた環–O⁻。対イオンは含めず、塩とは区別する。' }
  };

  var GROUP_SUB_KEY = { oh: 'OH', cooh: 'COOH', nh2: 'NH2', cho: 'CHO', no2: 'NO2', ch3: 'CH3', cl: 'Cl', br: 'Br', i: 'I', cn: 'CN' };

  var RING_SKELETON_COMPOUND = {
    benzene: 'benzene', naphthalene: 'naphthalene', cyclopropane: 'cyclopropane',
    cyclobutane: 'cyclobutane', cyclopentane: 'cyclopentane', cyclohexane: 'cyclohexane',
    cyclohexene: 'cyclohexene', anthracene: 'anthracene'
  };

  function normalizeRingLabel(label) {
    return String(label == null ? '' : label)
      .replace(/[₀-₉]/g, function (ch) { return String('₀₁₂₃₄₅₆₇₈₉'.indexOf(ch)); })
      .replace(/⁺/g, '+').replace(/⁻/g, '-')
      .replace(/[—–−\s]/g, '');
  }

  function canonicalRingKey(label) {
    var s = normalizeRingLabel(label);
    if (s === 'CH2CH3' || s === 'C2H5') return 'C2H5';
    if (s === 'CH(CH3)2') return 'CH(CH3)2';
    if (s === 'NH3+Cl-') return 'NH3+Cl-';
    if (s === 'N2+Cl-') return 'N2+Cl-';
    return s;
  }

  function ringSubMeta(key) {
    return RING_SUB_META[key] || { label: key, name: key, formula: '−' + key, attach: '?', note: '登録済みの置換基。' };
  }

  function ringSubTotal(subs) {
    return (subs || []).reduce(function (n, s) { return n + (s.count || 1); }, 0);
  }

  function isAdvancedRingKey(key) {
    if (!key) return true;
    if (key === 'O-') return false; // フェノキシドO⁻は単独の専門presetへ
    if (/[+\-]/.test(key)) return true;
    if (/Na|Ag|Cu|Pb|Ca|Mg|Zn|Fe|Al|Ba|Li|Sn/.test(key)) return true;
    if (key === 'isobutyl' || key === 'CH(CH3)COOH') return true;
    return false;
  }

  function ringSubsFor(id) {
    var c = D.COMPOUNDS[id];
    if (!c || !c.structure) return null;
    var s = c.structure;
    var out = null;
    if (D.RING_SUBS && D.RING_SUBS[id]) {
      out = D.RING_SUBS[id].map(function (item) {
        var key = canonicalRingKey(item.key || item.label);
        return { key: key, label: item.label || ringSubMeta(key).label, count: item.count || 1, positions: (item.positions || []).slice() };
      });
    } else if (s.type === 'ring-sub' && s.subs && s.subs.length) {
      out = groupRingSubs(s.subs.map(function (x) { return { label: x.label, at: x.at }; }));
    } else if (s.type === 'sub' && (s.skeleton === 'benzene' || s.skeleton === 'naphthalene')) {
      var key = GROUP_SUB_KEY[s.group];
      if (key) out = [{ key: key, label: ringSubMeta(key).label, count: 1, positions: [(s.at || 0) + 1] }];
    } else if (s.type === 'multi' && (s.skeleton === 'benzene' || s.skeleton === 'naphthalene')) {
      out = groupRingSubs((s.groups || []).map(function (x) { return { label: GROUP_SUB_KEY[x.group] || x.group, at: x.at }; }));
    }
    if (!out || !out.length) return null;
    out.advanced = out.some(function (x) { return isAdvancedRingKey(x.key); });
    return out;
  }

  function groupRingSubs(list) {
    var map = {};
    var order = [];
    list.forEach(function (item) {
      var key = canonicalRingKey(item.label);
      if (!map[key]) {
        map[key] = { key: key, label: ringSubMeta(key).label, count: 0, positions: [] };
        order.push(key);
      }
      map[key].count += item.count || 1;
      map[key].positions.push((item.at == null ? 0 : item.at) + 1);
    });
    return order.map(function (key) { return map[key]; });
  }

  function ringPresetKey(subs) {
    return subs.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); })
      .map(function (s) { return s.key + 'x' + s.count; }).join('+');
  }

  function ringPresetLabel(subs) {
    if (subs.length === 1) return ringSubMeta(subs[0].key).label + (subs[0].count > 1 ? '×' + subs[0].count : '');
    return subs.map(function (s) { return ringSubMeta(s.key).label + (s.count > 1 ? '×' + s.count : ''); }).join(' + ');
  }

  function ringPresetKind(subs) {
    if (subs.length === 1) return subs[0].count > 1 ? 'same' : 'single';
    return 'combo';
  }

  // ②の環式カードも「上段=置換基fragment（大きく）/下段=置換基名（小さく）」。
  // 追加なしはベンゼン環の図を出さず、説明だけにする。
  function ringPresetCard(preset) {
    if (!preset || preset.kind === 'none') {
      return {
        kind: 'none',
        main: '追加なし',
        sub: '骨格単体のみ',
        types: 0,
        total: 0,
        note: '置換基を追加せず、固定した骨格そのものを表示します。'
      };
    }
    if (preset.kind === 'tray') {
      return {
        kind: 'tray',
        main: '登録済み',
        sub: 'その他の置換体',
        types: 0,
        total: preset.ids.length,
        note: '単純な置換基プリセットに分けない登録済み化合物です。'
      };
    }
    var mains = [];
    var names = [];
    preset.subs.forEach(function (s) {
      var meta = ringSubMeta(s.key);
      var count = s.count || 1;
      mains.push((meta.simple || meta.formula) + (count > 1 ? '×' + count : ''));
      names.push(meta.name + (count > 1 ? '×' + count : ''));
    });
    return {
      kind: 'subs',
      main: mains.join(' ＋ '),
      sub: names.join('＋'),
      types: preset.subs.length,
      total: ringSubTotal(preset.subs),
      note: '同じ置換基構成の位置異性体は、1つのカードの結果にまとめて表示します。'
    };
  }

  function ringPositionText(id) {
    var subs = ringSubsFor(id);
    if (!subs) return '';
    return subs.map(function (s) {
      return ringSubMeta(s.key).label + '（' + (s.positions || []).map(function (p) { return p + '位'; }).join(', ') + '）';
    }).join(' / ');
  }


  function ringSystemFor(id) {
    var c = D.COMPOUNDS[id];
    if (!c) return null;
    var s = c.structure;
    if (s.type === 'skeleton' || s.type === 'sub' || s.type === 'multi') {
      if (s.skeleton === 'benzene') return 'benzene';
      if (s.skeleton === 'naphthalene') return 'naphthalene';
      if (/^cyclopropane$/.test(s.skeleton)) return 'cyclopropane';
      if (/^cyclobutane$/.test(s.skeleton)) return 'cyclobutane';
      if (/^cyclopentane$/.test(s.skeleton)) return 'cyclopentane';
      if (/^cyclohexane$/.test(s.skeleton)) return 'cyclohexane';
      return 'complex-ring';
    }
    if (s.type === 'ring-sub') return 'benzene';
    if (id === '1-naphthol' || id === '2-naphthol') return 'naphthalene';
    if (id === 'anthracene') return 'anthracene';
    if (id === 'cyclohexene') return 'cyclohexene';
    if (id === 'chlorocyclohexane' || id === 'hexachlorocyclohexane') return 'cyclohexane';
    if (s.type === 'custom' || s.type === 'condensed' || s.type === 'schematic') {
      if (BENZENE_CUSTOM_IDS[id]) return 'benzene';
      if (id === 'benzene') return 'benzene';
      if (id === 'naphthalene') return 'naphthalene';
      return 'complex-ring';
    }
    return 'complex-ring';
  }

  var RING_SYSTEMS = [
    { id: 'benzene', label: 'ベンゼン環', note: '環の炭素数6を固定し、環のHを置換基で置き換える。', kind: 'aromatic', baseCarbon: 6, skeletonId: 'aromatic-benzene' },
    { id: 'naphthalene', label: 'ナフタレン環', note: '縮合二環（環の炭素数10）を固定する。', kind: 'aromatic', baseCarbon: 10, skeletonId: 'aromatic-naphthalene' },
    { id: 'cyclopropane', label: 'シクロプロパン環', note: '三員環を固定する。', kind: 'cyclo', baseCarbon: 3, skeletonId: 'cyclo-c3' },
    { id: 'cyclobutane', label: 'シクロブタン環', note: '四員環を固定する。', kind: 'cyclo', baseCarbon: 4, skeletonId: 'cyclo-c4' },
    { id: 'cyclopentane', label: 'シクロペンタン環', note: '五員環を固定する。', kind: 'cyclo', baseCarbon: 5, skeletonId: 'cyclo-c5' },
    { id: 'cyclohexane', label: 'シクロヘキサン環', note: '六員環を固定する。', kind: 'cyclo', baseCarbon: 6, skeletonId: 'cyclo-c6' },
    { id: 'cyclohexene', label: 'シクロヘキセン環', note: 'C=Cを1本もつ六員環を固定する。', kind: 'cyclo-unsat', baseCarbon: 6, skeletonId: null },
    { id: 'anthracene', label: 'アントラセン（三環縮合）', note: '三環縮合芳香族を固定する。', kind: 'aromatic-fused', baseCarbon: 14, skeletonId: null },
    { id: 'complex-ring', label: '複合芳香族・その他の環', note: '複数の環や複素環をもつ登録済み化合物。単純な一置換生成は行わない。', kind: 'complex', baseCarbon: null, skeletonId: null }
  ];

  var RING_SYSTEM_MAP = {};
  RING_SYSTEMS.forEach(function (r) { RING_SYSTEM_MAP[r.id] = r; });

  var RING_ROUTES = {};
  RING_SYSTEMS.forEach(function (rs) {
    rs.generated = [];
    rs.groups = [];
    if (rs.skeletonId && D.COMBOS[rs.skeletonId]) {
      Object.keys(D.COMBOS[rs.skeletonId]).forEach(function (gid) {
        var list = D.COMBOS[rs.skeletonId][gid] || [];
        if (!list.length) return;
        rs.groups.push(gid);
        list.forEach(function (entry) {
          if (RING_ROUTES[entry.id]) return;
          RING_ROUTES[entry.id] = { mode: 'ring', system: rs.id, preset: 'none', group: 'none', focus: entry.id };
          rs.generated.push(entry.id);
        });
      });
    }
    rs.registeredSingle = [];
    rs.registeredMulti = [];
    rs.registeredOther = [];
    rs.presets = [];
    rs.tray = [];
  });

  var ringMembers = {};
  Object.keys(D.COMPOUNDS).forEach(function (id) {
    var c = D.COMPOUNDS[id];
    if (OTHER_CATEGORY_IDS.indexOf(c.category) !== -1) return;
    if (isMetalFormula(c.formula)) return;
    var isRing = RING_CATEGORIES.indexOf(c.category) !== -1 || hasRing(c.structure);
    if (!isRing) return;
    var system = RING_ROUTES[id] ? RING_ROUTES[id].system : ringSystemFor(id);
    if (!RING_SYSTEM_MAP[system]) system = 'complex-ring';
    if (!ringMembers[system]) ringMembers[system] = [];
    ringMembers[system].push(id);
  });

  function buildRingPresets(rs, members) {
    var noneId = RING_SKELETON_COMPOUND[rs.id] || null;
    var presets = [{ id: 'none', kind: 'none', label: '追加なし', subs: [], ids: noneId && D.COMPOUNDS[noneId] ? [noneId] : [] }];
    var buckets = { single: [], same: [], combo: [] };
    var byKey = {};
    var tray = [];
    members.forEach(function (id) {
      if (id === noneId) return;
      var subs = ringSubsFor(id);
      if (!subs || subs.advanced) { tray.push(id); return; }
      var key = ringPresetKey(subs);
      if (!byKey[key]) {
        byKey[key] = {
          id: 'p-' + key.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          kind: ringPresetKind(subs), label: ringPresetLabel(subs), subs: subs, ids: []
        };
        buckets[byKey[key].kind].push(byKey[key]);
      }
      byKey[key].ids.push(id);
    });
    var singleRank = ['O-', 'OH', 'CH3', 'Cl', 'Br', 'I', 'COOH', 'NH2', 'CHO', 'NO2', 'CN', 'C2H5', 'CH(CH3)2', 'CH=CH2', 'SO3H', 'NHCOCH3', 'CH2OH', 'OCH3', 'OCOCH3', 'N(CH3)2'];
    function rank(subs) {
      var i = singleRank.indexOf(subs[0].key);
      return i === -1 ? 99 : i;
    }
    buckets.single.sort(function (a, b) { return rank(a.subs) - rank(b.subs) || (a.label < b.label ? -1 : 1); });
    buckets.same.sort(function (a, b) { return a.subs[0].count - b.subs[0].count || rank(a.subs) - rank(b.subs); });
    buckets.combo.sort(function (a, b) {
      return ringSubTotal(a.subs) - ringSubTotal(b.subs) || a.subs.length - b.subs.length || (a.label < b.label ? -1 : 1);
    });
    presets = presets.concat(buckets.single, buckets.same, buckets.combo);
    if (tray.length) {
      presets.push({ id: 'tray', kind: 'tray', label: 'その他の登録済み化合物', subs: [], ids: tray });
    }
    // 同じslugになった場合は接尾辞を付けて一意にする。
    var used = {};
    presets.forEach(function (p) {
      var base = p.id;
      var n = 2;
      while (used[p.id]) p.id = base + '_' + (n++);
      used[p.id] = true;
    });
    rs.tray = tray.slice();
    return presets;
  }

  RING_SYSTEMS.forEach(function (rs) {
    var members = ringMembers[rs.id] || [];
    members.forEach(function (id) {
      if (RING_ROUTES[id]) return;
      var subs = ringSubsFor(id);
      var total = subs ? ringSubTotal(subs) : 1;
      if (rs.id === 'benzene' || rs.id === 'naphthalene') {
        if (total >= 2) rs.registeredMulti.push(id);
        else rs.registeredSingle.push(id);
      } else {
        rs.registeredOther.push(id);
      }
    });
    rs.presets = buildRingPresets(rs, members);
    rs.presets.forEach(function (preset) {
      preset.ids.forEach(function (id) {
        RING_ROUTES[id] = { mode: 'ring', system: rs.id, preset: preset.id, group: preset.id, focus: id };
      });
    });
  });


  /* ------------------------------------------------------------------
   * その他: category / family
   * ------------------------------------------------------------------ */
  var STANDARD_AMINO_ACIDS = [
    'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'serine', 'threonine',
    'cysteine', 'methionine', 'aspartic-acid', 'glutamic-acid', 'asparagine',
    'glutamine', 'lysine', 'arginine', 'histidine', 'phenylalanine', 'tyrosine',
    'tryptophan', 'proline'
  ];
  var ENZYME_IDS = [
    'amylase', 'cellulase', 'cellobiase', 'pepsin', 'atpase', 'zymase', 'maltase',
    'sucrase', 'trypsin', 'protease', 'lipase', 'catalase', 'lactase', 'erepsin',
    'urease', 'helicase'
  ];
  var PROTEIN_IDS = [
    'protein', 'insulin', 'hemoglobin', 'albumin', 'globulin', 'glutelin', 'keratin',
    'collagen', 'fibroin', 'mucin', 'casein', 'gelatin', 'histone', 'protamine',
    'glutenin', 'oryzenin', 'gliadin', 'hordein', 'globin', 'salmine', 'hemocyanin'
  ];
  var PEPTIDE_IDS = ['glycylalanine', 'glycylglycine', 'alanylglycine', 'glutathione', 'aspartame'];
  var FATTY_ACID_IDS = ['stearic-acid', 'oleic-acid', 'linoleic-acid', 'palmitic-acid', 'linolenic-acid', 'elaidic-acid', 'lauric-acid', 'myristic-acid', 'arachidonic-acid', 'eicosapentaenoic-acid', 'docosahexaenoic-acid'];
  var TRIGLYCERIDE_IDS = ['tristearin', 'tripalmitin', 'triolein', 'trilinolein'];
  var SYNTHETIC_MONOMER_IDS = ['butadiene', 'isoprene', 'vinyl-chloride', 'vinylidene-chloride', 'chloroprene', 'acrylonitrile', 'vinyl-acetate', 'methyl-methacrylate', 'caprolactam', 'hexamethylenediamine', 'urea', 'melamine', 'tetrafluoroethylene', 'phosgene', 'epichlorohydrin', 'dimethyldichlorosilane'];
  var SYNTHETIC_RUBBER_IDS = ['sbr', 'br', 'chloroprene-rubber', 'nbr', 'iir'];
  var THERMOSET_IDS = ['phenol-resin', 'urea-resin', 'melamine-resin', 'epoxy-resin', 'silicone', 'polyurethane', 'unsaturated-polyester', 'alkyd-resin'];
  var ION_EXCHANGE_IDS = ['cation-exchange-resin', 'anion-exchange-resin'];
  var CONDUCTIVE_IDS = ['polyacetylene', 'polyaniline'];
  var FUNCTIONAL_POLYMER_IDS = ['aramid', 'abs', 'vinylon', 'polycarbonate', 'pla', 'sodium-polyacrylate'];
  var NATURAL_POLYSACCHARIDE_IDS = ['alginic-acid', 'sodium-alginate'];

  var OTHER_CATEGORIES = [
    { id: 'sugar', label: '糖類', note: '単糖・二糖・多糖・糖アルコールをfamilyで分ける。' },
    { id: 'amino', label: 'アミノ酸・タンパク質', note: 'アミノ酸・ペプチド・タンパク質・酵素を分ける。' },
    { id: 'lipid', label: '脂質', note: '脂肪酸・油脂・リン脂質を分ける。' },
    { id: 'soap', label: 'セッケン・界面活性剤', note: '脂肪酸塩と合成洗剤を混同しない。' },
    { id: 'natural-polymer', label: '天然高分子', note: '核酸・塩基・天然ゴム・天然多糖を分ける。' },
    { id: 'synthetic-polymer', label: '合成高分子', note: 'プラスチック・ゴム・熱硬化性樹脂・機能性高分子を分ける。' },
    { id: 'materials', label: '材料・混合物', note: '再生セルロース・フェノール樹脂前駆体・加硫ゴムなど、単一の純物質でない区分。' },
    { id: 'hydrocarbon-class', label: '炭化水素の級名', note: 'ペンテン・ヘキセン・ペンチン・ヘキシンのような級名を、代表例と区別して説明する。' },
    { id: 'organic-salt', label: '有機塩・金属塩', note: 'アルコキシド・カルボン酸塩・金属アセチリドを純物質カードと区別する。' },
    { id: 'dye-drug', label: '染料・医薬品', note: '複合芳香族の染料・医薬品。' }
  ];

  var OTHER_GROUPS = [
    { id: 'monosaccharide', category: 'sugar', label: '単糖', ids: ['glucose', 'fructose', 'galactose', 'mannose', 'ribose', 'deoxyribose'] },
    { id: 'disaccharide', category: 'sugar', label: '二糖', ids: ['sucrose', 'maltose', 'lactose', 'cellobiose', 'trehalose', 'isomaltose'] },
    { id: 'polysaccharide', category: 'sugar', label: '多糖', ids: ['starch', 'cellulose', 'glycogen', 'amylopectin', 'dextrin', 'chitin'] },
    { id: 'sugar-alcohol', category: 'sugar', label: '糖アルコール', ids: ['sorbitol'] },
    { id: 'cyclitol', category: 'sugar', label: '環状多価アルコール（シクリトール）', ids: ['inositol'] },
    { id: 'glycoside', category: 'sugar', label: '配糖体', ids: ['salicin'] },
    { id: 'cellulose-derivative', category: 'sugar', label: 'セルロース誘導体', ids: ['cellulose-acetate', 'cellulose-nitrate'] },

    { id: 'amino-acid', category: 'amino', label: 'アミノ酸', ids: STANDARD_AMINO_ACIDS.concat(['cystine', '6-aminohexanoic-acid']) },
    { id: 'peptide', category: 'amino', label: 'ペプチド', ids: PEPTIDE_IDS },
    { id: 'protein', category: 'amino', label: 'タンパク質', ids: PROTEIN_IDS },
    { id: 'enzyme', category: 'amino', label: '酵素', ids: ENZYME_IDS },
    { id: 'enzyme-classes', category: 'amino', label: '酵素の分類（名称mapping）', ids: [], familyIds: ['enzyme-dehydrogenase', 'enzyme-transferase', 'enzyme-phosphorylase', 'enzyme-hydrolase', 'enzyme-lyase', 'enzyme-decarboxylase', 'enzyme-isomerase', 'enzyme-cis-trans-isomerase', 'enzyme-ligase', 'enzyme-dna-ligase', 'enzyme-oxidoreductase'] },
    { id: 'amino-other', category: 'amino', label: 'その他の生体分子', ids: ['heme'] },

    { id: 'fatty-acid', category: 'lipid', label: '脂肪酸', ids: FATTY_ACID_IDS },
    { id: 'triglyceride', category: 'lipid', label: '油脂（トリグリセリド）', ids: TRIGLYCERIDE_IDS },
    { id: 'phospholipid', category: 'lipid', label: 'リン脂質（class・family）', ids: [], familyIds: ['phospholipid', 'phosphatidic-acid', 'phosphatidylcholine', 'phosphatidylethanolamine', 'phosphatidylserine', 'phosphatidylinositol'] },

    { id: 'fatty-acid-salt', category: 'soap', label: '脂肪酸塩（石けん）', ids: ['sodium-stearate', 'sodium-palmitate', 'sodium-oleate', 'sodium-laurate'] },
    { id: 'synthetic-detergent', category: 'soap', label: '合成洗剤', ids: ['sds', 'las'] },
    { id: 'alkyl-sulfate', category: 'soap', label: 'アルキル硫酸（class）', ids: [], familyIds: ['alkyl-sulfate'] },

    { id: 'nucleic-acid', category: 'natural-polymer', label: '核酸', ids: ['dna', 'rna'] },
    { id: 'nucleic-base', category: 'natural-polymer', label: '核酸塩基', ids: ['adenine', 'guanine', 'cytosine', 'thymine', 'uracil'] },
    { id: 'nucleotide', category: 'natural-polymer', label: 'ヌクレオチド・ヌクレオシド', ids: ['atp', 'adenosine', 'adp'] },
    { id: 'natural-rubber', category: 'natural-polymer', label: '天然ゴム', ids: ['natural-rubber'] },
    { id: 'natural-polysaccharide', category: 'natural-polymer', label: '天然多糖・その他', ids: NATURAL_POLYSACCHARIDE_IDS },

    { id: 'general-plastic', category: 'synthetic-polymer', label: '汎用プラスチック', ids: ['polyethylene', 'polypropylene', 'polystyrene', 'pvc', 'pet', 'nylon6', 'nylon66', 'pva', 'pmma', 'pan', 'ptfe', 'pvac', 'pvdc'] },
    { id: 'engineering-plastic', category: 'synthetic-polymer', label: '機能性・工学樹脂', ids: FUNCTIONAL_POLYMER_IDS },
    { id: 'synthetic-rubber', category: 'synthetic-polymer', label: '合成ゴム', ids: SYNTHETIC_RUBBER_IDS },
    { id: 'thermosetting', category: 'synthetic-polymer', label: '熱硬化性樹脂', ids: THERMOSET_IDS },
    { id: 'ion-exchange', category: 'synthetic-polymer', label: 'イオン交換樹脂', ids: ION_EXCHANGE_IDS },
    { id: 'conductive', category: 'synthetic-polymer', label: '導電性高分子', ids: CONDUCTIVE_IDS },
    { id: 'monomer', category: 'synthetic-polymer', label: '合成高分子の単量体', ids: SYNTHETIC_MONOMER_IDS },

    { id: 'regenerated-cellulose', category: 'materials', label: '再生セルロース', materialIds: ['rayon', 'cellophane', 'cupra', 'viscose'] },
    { id: 'cellulose-states', category: 'materials', label: 'セルロースの処理段階・置換度', ids: [], familyIds: ['cellulose-alkali', 'cellulose-xanthate-sodium', 'cellulose-acetate-ds2', 'cellulose-acetate-ds3', 'cellulose-nitrate-ds2', 'cellulose-nitrate-ds3'] },
    { id: 'phenol-resin-precursor', category: 'materials', label: 'フェノール樹脂前駆体', materialIds: ['novolac', 'resol'], familyIds: ['phenol-resin-novolac', 'phenol-resin-resol'] },
    { id: 'cellulose-material', category: 'materials', label: 'セルロース誘導体材料', materialIds: ['collodion', 'celluloid', 'cellulose-xanthate', 'alkali-cellulose', 'dinitrocellulose', 'diacetylcellulose'] },
    { id: 'lignin-family', category: 'materials', label: 'リグニン（天然芳香族高分子）', ids: [], familyIds: ['natural-polymer-lignin'], materialIds: ['lignin'] },
    { id: 'rubber-material', category: 'materials', label: 'ゴム材料', materialIds: ['ebonite', 'latex'] },
    { id: 'other-material', category: 'materials', label: 'その他の材料・試薬', materialIds: ['lignin', 'schweizer-reagent', 'aniline-black', 'salomethyl', 'glyptal', 'carbon-fiber', 'pulp', 'styrofoam', 'guncotton'] },
    { id: 'inorganic-material', category: 'materials', label: '無機（対象外）', materialIds: ['calcium-carbide', 'glass'] },

    { id: 'alkene-classes', category: 'hydrocarbon-class', label: 'アルケンの級名', ids: [], familyIds: ['pentene-class', 'hexene-class'] },
    { id: 'alkyne-classes', category: 'hydrocarbon-class', label: 'アルキンの級名', ids: [], familyIds: ['pentyne-class', 'hexyne-class'] },

    { id: 'alkoxide', category: 'organic-salt', label: 'アルコキシド', ids: ['sodium-methoxide', 'sodium-ethoxide'] },
    { id: 'carboxylate-salt', category: 'organic-salt', label: 'カルボン酸塩', ids: ['sodium-acetate', 'sodium-benzoate', 'sodium-salicylate', 'lead-ii-acetate', 'calcium-acetate'] },
    { id: 'acetylide', category: 'organic-salt', label: '金属アセチリド', ids: ['silver-acetylide', 'copper-i-acetylide'] },
    { id: 'phenoxide-sulfonate', category: 'organic-salt', label: 'フェノキシド・スルホン酸塩', ids: ['sodium-phenoxide', 'sodium-benzenesulfonate', 'disodium-salicylate'] },
    { id: 'quaternary-ammonium', category: 'organic-salt', label: '四級アンモニウム（陽イオン）', ids: ['choline'] },

    { id: 'dye', category: 'dye-drug', label: '染料', ids: ['methyl-orange'] }
  ];

  var OTHER_GROUP_MAP = {};
  OTHER_GROUPS.forEach(function (g) { OTHER_GROUP_MAP[g.id] = g; });

  var OTHER_ROUTES = {};
  OTHER_GROUPS.forEach(function (g) {
    (g.ids || []).forEach(function (id) {
      if (!D.COMPOUNDS[id]) return;
      if (OTHER_ROUTES[id]) return;
      OTHER_ROUTES[id] = { mode: 'other', category: g.category, family: g.id, focus: id };
    });
  });

  /* ------------------------------------------------------------------
   * 分類本体
   * ------------------------------------------------------------------ */
  var CLASSIFICATION = {};

  function classify(id) {
    if (CLASSIFICATION[id]) return CLASSIFICATION[id];
    var c = D.COMPOUNDS[id];
    if (!c) return null;
    var result;
    var variable = !!c.formulaVariable;
    var specType = c.structure && c.structure.type;
    var metal = isMetalFormula(c.formula);
    var text = condensedText(c) + ' ' + c.name + ' ' + c.id;

    if (OTHER_CATEGORY_IDS.indexOf(c.category) !== -1) {
      result = { id: id, mode: 'other', category: c.category, otherFamily: (OTHER_ROUTES[id] || {}).family || null };
      if (OTHER_ROUTES[id]) {
        result.category = OTHER_ROUTES[id].category;
        result.family = OTHER_ROUTES[id].family;
      }
    } else if (metal) {
      result = { id: id, mode: 'other', category: 'organic-salt', family: (OTHER_ROUTES[id] || {}).family || 'carboxylate-salt' };
      if (OTHER_ROUTES[id]) { result.category = OTHER_ROUTES[id].category; result.family = OTHER_ROUTES[id].family; }
    } else if (RING_CATEGORIES.indexOf(c.category) !== -1 || hasRing(c.structure)) {
      result = { id: id, mode: 'ring', system: ringSystemFor(id) };
      if (RING_ROUTES[id]) result = Object.assign({}, RING_ROUTES[id], { id: id, mode: 'ring' });
    } else if (CHAIN_CATEGORIES.indexOf(c.category) !== -1 && !variable && ['skeleton', 'sub', 'multi', 'condensed', 'custom'].indexOf(specType) !== -1) {
      var fam = chainFamily(c);
      var carbon = carbonCount(c);
      if (fam && carbon) {
        result = { id: id, mode: 'chain', family: fam, carbon: carbon };
        if (fam === 'amine') result.degree = AMINE_DEGREE[id] || null;
      }
    }

    if (!result) {
      // どこの経路にも入らないデータは隠さず、その他へ入れる。
      result = { id: id, mode: 'other', category: 'other', family: (OTHER_ROUTES[id] || {}).family || null };
    }
    CLASSIFICATION[id] = result;
    return result;
  }

  Object.keys(D.COMPOUNDS).forEach(classify);

  /* ------------------------------------------------------------------
   * 鎖式: 炭化水素部分デスクリプタ（新方式）
   * ------------------------------------------------------------------
   * 既存の総炭素数インデックス（CHAIN_INDEX）は旧URL・互換用に残し、
   * 新しい①は「官能基に結合する炭化水素部分」で絞り込む。
   */
  var CHAIN_IDS = Object.keys(CLASSIFICATION).filter(function (id) {
    return CLASSIFICATION[id].mode === 'chain';
  });
  var CHAIN_DESC = X.build(D, CHAIN_IDS, {
    familyOf: function (id) { return CLASSIFICATION[id].family; }
  });
  var CHAIN_DESCRIPTOR_BY_COMPOUND = CHAIN_DESC.byCompound;
  var CHAIN_DESCRIPTOR_BY_ID = CHAIN_DESC.byId;
  var CHAIN_DESCRIPTOR_LIST = CHAIN_DESC.list;

  function chainDescriptorFor(id) {
    return CHAIN_DESCRIPTOR_BY_COMPOUND[id] || null;
  }

  function chainDescriptorById(id) {
    return CHAIN_DESCRIPTOR_BY_ID[id] || null;
  }

  function chainPartialOptions() {
    var set = {};
    CHAIN_DESCRIPTOR_LIST.forEach(function (d) { set[d.partialC] = true; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function chainShapeOptions(partialC) {
    return CHAIN_DESCRIPTOR_LIST.filter(function (d) { return d.partialC === partialC; });
  }

  function chainDescriptorCompounds(shape) {
    var d = CHAIN_DESCRIPTOR_BY_ID[shape];
    return d ? d.compoundIds.slice() : [];
  }

  function chainFamiliesForDescriptor(shape) {
    var d = CHAIN_DESCRIPTOR_BY_ID[shape];
    if (!d) return [];
    var counts = {};
    d.compoundIds.forEach(function (id) {
      var r = CLASSIFICATION[id];
      if (!r) return;
      counts[r.family] = (counts[r.family] || 0) + 1;
    });
    return CHAIN_FAMILIES.filter(function (f) { return counts[f.id] > 0; }).map(function (f) {
      return { id: f.id, label: f.label, note: f.note, count: counts[f.id] };
    });
  }

  function chainIdsForDescriptor(shape, family) {
    var d = CHAIN_DESCRIPTOR_BY_ID[shape];
    if (!d) return [];
    var ids = d.compoundIds.filter(function (id) {
      return !family || (CLASSIFICATION[id] && CLASSIFICATION[id].family === family);
    });
    return ids.slice().sort(function (a, b) {
      var ra = chainRoleOrder(chainRoleFor(a));
      var rb = chainRoleOrder(chainRoleFor(b));
      if (ra !== rb) return ra - rb;
      var ca = carbonCount(D.COMPOUNDS[a]);
      var cb = carbonCount(D.COMPOUNDS[b]);
      if (ca !== cb) return ca - cb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
  }

  function chainDescriptorFamilyValid(shape, family) {
    return chainIdsForDescriptor(shape, family).length > 0;
  }

  function chainRoleFor(id) {
    var d = CHAIN_DESCRIPTOR_BY_COMPOUND[id];
    return d ? d.role : null;
  }

  function chainRoleLabel(role) {
    return X.roleLabel(role);
  }

  var ROLE_ORDER = {
    'amine-1': 1, 'amine-2': 2, 'amine-3': 3, 'amine-1-2': 4,
    monocarboxy: 1, dicarboxy: 2, 'hydroxy-acid': 3, 'hydroxy-polycarboxy': 4,
    'keto-acid': 5, 'acid-chloride': 6,
    monohalogen: 1, multihalogen: 2,
    monoester: 1, diester: 2, triester: 3
  };
  function chainRoleOrder(role) {
    return ROLE_ORDER[role] || 10;
  }

  function chainDescriptorRoles(shape, family) {
    var ids = chainIdsForDescriptor(shape, family);
    var map = {};
    var order = [];
    ids.forEach(function (id) {
      var role = chainRoleFor(id) || 'other';
      if (!map[role]) { map[role] = 0; order.push(role); }
      map[role]++;
    });
    order.sort(function (a, b) { return chainRoleOrder(a) - chainRoleOrder(b) || (a < b ? -1 : 1); });
    return order.map(function (role) {
      return { role: role, label: chainRoleLabel(role), count: map[role] };
    });
  }

  function chainDescriptorPreview(shape) {
    var d = CHAIN_DESCRIPTOR_BY_ID[shape];
    return d ? X.shapePreviewTiles(d) : [];
  }

  // ①の選択カード用。上段の図（文字式/2D構造）と下段の名前を返す。
  function chainShapeFigure(shape) {
    var d = CHAIN_DESCRIPTOR_BY_ID[shape];
    return d ? X.shapeFigure(d) : null;
  }

  function chainDescriptorLabel(shape) {
    var d = CHAIN_DESCRIPTOR_BY_ID[shape];
    return d ? d.label : '';
  }

  function chainDescriptorForPreview(shape) {
    return CHAIN_DESCRIPTOR_BY_ID[shape] || null;
  }

  function classifyAll() { return CLASSIFICATION; }

  function chainIndex() {
    var index = {};
    CHAIN_FAMILIES.forEach(function (f) { index[f.id] = {}; });
    Object.keys(CLASSIFICATION).forEach(function (id) {
      var r = CLASSIFICATION[id];
      if (r.mode !== 'chain') return;
      if (!index[r.family]) index[r.family] = {};
      if (!index[r.family][r.carbon]) index[r.family][r.carbon] = [];
      index[r.family][r.carbon].push(id);
    });
    return index;
  }

  var CHAIN_INDEX = chainIndex();

  function carbonOptions(family) {
    var table = CHAIN_INDEX[family] || {};
    return Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
  }

  // 総炭素数の選択肢は、分類（②）に依存させない。
  // すべての鎖式familyの炭素数の和集合を返す。
  function allCarbonOptions() {
    var set = {};
    Object.keys(CHAIN_INDEX).forEach(function (family) {
      Object.keys(CHAIN_INDEX[family]).forEach(function (c) { set[c] = true; });
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  // 現在の総炭素数＋構造条件で1件以上ある分類だけを返す。
  // 0件の分類は「非表示」とし、disabledでも別分類の自動選択もしない。
  function chainFamiliesFor(carbon, condition) {
    return CHAIN_FAMILIES.filter(function (f) {
      return chainIdsFor(f.id, carbon, condition).length > 0;
    });
  }

  function chainFamilyValid(family, carbon, condition) {
    return CHAIN_FAMILIES.some(function (f) { return f.id === family; }) &&
      chainIdsFor(family, carbon, condition).length > 0;
  }

  function chainIds(family, carbon) {
    return ((CHAIN_INDEX[family] || {})[carbon] || []).slice();
  }

  function otherMembers(groupId) {
    var g = OTHER_GROUP_MAP[groupId];
    return g ? (g.ids || []).filter(function (id) { return !!D.COMPOUNDS[id]; }) : [];
  }

  function otherFamilies(category) {
    return OTHER_GROUPS.filter(function (g) { return g.category === category; });
  }

  function routeFor(id) {
    if (RING_ROUTES[id]) return Object.assign({}, RING_ROUTES[id], { id: id });
    if (OTHER_ROUTES[id]) return Object.assign({}, OTHER_ROUTES[id], { id: id });
    var r = CLASSIFICATION[id];
    if (!r) return null;
    if (r.mode === 'chain') {
      var c = D.COMPOUNDS[id];
      var structure = hasCCMultipleBond(c) ? 'unsaturated' :
        (r.family === 'amino-alcohol' ? 'all' : 'saturated');
      var d = CHAIN_DESCRIPTOR_BY_COMPOUND[id];
      return {
        mode: 'chain',
        family: r.family,
        partialC: d ? d.partialC : null,
        shape: d ? d.descriptorId : null,
        descriptor: d ? d.descriptorId : null,
        totalCarbon: r.carbon,
        carbon: r.carbon,
        degree: r.degree,
        structure: structure,
        focus: id
      };
    }
    if (r.mode === 'ring') return { mode: 'ring', system: r.system, group: r.group || null, focus: id };
    return { mode: 'other', category: r.category, family: r.family, focus: id };
  }

  function searchIndex() {
    var out = [];
    Object.keys(D.COMPOUNDS).forEach(function (id) {
      var c = D.COMPOUNDS[id];
      var r = CLASSIFICATION[id];
      out.push({ type: 'compound', id: id, name: c.name, terms: [c.name, id, c.formula].concat(D.aliasesFor ? D.aliasesFor(id) : []), route: routeFor(id), mode: r ? r.mode : null });
    });
    D.MATERIALS.forEach(function (m) {
      out.push({ type: 'material', id: m.id, name: m.name, terms: [m.name].concat(m.synonyms || []), note: m.note });
    });
    D.FAMILIES.forEach(function (f) {
      out.push({ type: 'family', id: f.id, name: f.name, terms: [f.name, f.nameEn || ''].concat(f.synonyms || []), note: f.summary, family: f });
    });
    D.CATEGORIES.forEach(function (cat) {
      out.push({ type: 'category', id: cat.id, name: cat.name, terms: [cat.name, cat.id], note: cat.note });
    });
    OTHER_GROUPS.forEach(function (g) {
      out.push({ type: 'group', id: g.id, name: g.label, terms: [g.label, g.id], note: g.category, category: g.category });
    });
    return out;
  }

  var SEARCH_INDEX = searchIndex();

  function search(query) {
    var q = D.normalizeName(query || '');
    if (!q) return [];
    return SEARCH_INDEX.filter(function (row) {
      return row.terms.some(function (t) { return D.normalizeName(t).indexOf(q) !== -1; });
    });
  }

  function auditCoverage() {
    var modes = { chain: 0, ring: 0, other: 0 };
    var missing = [];
    Object.keys(D.COMPOUNDS).forEach(function (id) {
      var r = CLASSIFICATION[id];
      if (!r) { missing.push({ id: id, reason: '分類なし' }); return; }
      modes[r.mode]++;
      var route = routeFor(id);
      if (!route) missing.push({ id: id, reason: 'routeなし' });
      if (r.mode === 'chain' && (!r.family || !r.carbon)) missing.push({ id: id, reason: 'chainのfamily/carbonなし' });
      if (r.mode === 'chain' && (!CHAIN_DESCRIPTOR_BY_COMPOUND[id] || !CHAIN_DESCRIPTOR_BY_COMPOUND[id].descriptorKey)) {
        missing.push({ id: id, reason: 'chainの炭化水素部分デスクリプタなし' });
      }
      if (r.mode === 'ring' && !r.system) missing.push({ id: id, reason: 'ring systemなし' });
      if (r.mode === 'other' && (!r.family || !r.category || r.category === 'other')) missing.push({ id: id, reason: 'other family/categoryなし' });
    });
    return { total: Object.keys(D.COMPOUNDS).length, modes: modes, missing: missing };
  }

  return {
    CHAIN_FAMILIES: CHAIN_FAMILIES,
    CHAIN_FAMILY_LABEL: CHAIN_FAMILY_LABEL,
    chainFamilyPick: chainFamilyPick,
    CHAIN_INDEX: CHAIN_INDEX,
    AMINE_DEGREE: AMINE_DEGREE,
    RING_SYSTEMS: RING_SYSTEMS,
    RING_SYSTEM_MAP: RING_SYSTEM_MAP,
    RING_ROUTES: RING_ROUTES,
    OTHER_CATEGORIES: OTHER_CATEGORIES,
    OTHER_GROUPS: OTHER_GROUPS,
    OTHER_GROUP_MAP: OTHER_GROUP_MAP,
    OTHER_ROUTES: OTHER_ROUTES,
    CLASSIFICATION: CLASSIFICATION,
    classify: classify,
    classifyAll: classifyAll,
    routeFor: routeFor,
    carbonCount: carbonCount,
    CHAIN_DESCRIPTOR_BY_COMPOUND: CHAIN_DESCRIPTOR_BY_COMPOUND,
    CHAIN_DESCRIPTOR_BY_ID: CHAIN_DESCRIPTOR_BY_ID,
    CHAIN_DESCRIPTOR_LIST: CHAIN_DESCRIPTOR_LIST,
    CHAIN_DESCRIPTOR_WARNINGS: CHAIN_DESC.warnings,
    chainDescriptorFor: chainDescriptorFor,
    chainDescriptorById: chainDescriptorById,
    chainPartialOptions: chainPartialOptions,
    chainShapeOptions: chainShapeOptions,
    chainDescriptorCompounds: chainDescriptorCompounds,
    chainFamiliesForDescriptor: chainFamiliesForDescriptor,
    chainIdsForDescriptor: chainIdsForDescriptor,
    chainDescriptorFamilyValid: chainDescriptorFamilyValid,
    chainRoleFor: chainRoleFor,
    chainRoleLabel: chainRoleLabel,
    chainDescriptorRoles: chainDescriptorRoles,
    chainDescriptorPreview: chainDescriptorPreview,
    chainDescriptorLabel: chainDescriptorLabel,
    chainShapeFigure: chainShapeFigure,
    ringPresetCard: ringPresetCard,
    chainDescriptorForPreview: chainDescriptorForPreview,
    INITIAL_CHAIN_PARTIAL: 2,
    INITIAL_CHAIN_SHAPE: 'd-ethane-c2',
    carbonOptions: carbonOptions,
    allCarbonOptions: allCarbonOptions,
    chainFamiliesFor: chainFamiliesFor,
    chainFamilyValid: chainFamilyValid,
    chainIds: chainIds,
    chainIdsFor: chainIdsFor,
    ringSubsFor: ringSubsFor,
    ringSubMeta: ringSubMeta,
    ringPositionText: ringPositionText,
    hasCCMultipleBond: hasCCMultipleBond,
    isMonohydricAlcohol: isMonohydricAlcohol,
    structureCondition: structureCondition,
    otherMembers: otherMembers,
    otherFamilies: otherFamilies,
    ringCount: ringCount,
    hasRing: hasRing,
    searchIndex: searchIndex,
    search: search,
    auditCoverage: auditCoverage
  };
});
