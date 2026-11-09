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
    module.exports = factory(require('./data.js'), require('./draw.js'));
  } else {
    root.OCCatalog = factory(root.OCData, root.OCDraw);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, R) {
  'use strict';

  if (!D || !R) throw new Error('OCCatalog: OCData と OCDraw が必要です');

  var CHAIN_CATEGORIES = ['alkane', 'unsat', 'alcohol', 'ether', 'aldehyde', 'ketone', 'carboxylic', 'ester', 'aromatic-amine'];
  var RING_CATEGORIES = ['aromatic', 'phenol', 'aromatic-other', 'cyclic'];
  var OTHER_CATEGORY_IDS = ['lipid', 'soap', 'sugar', 'amino', 'natural-polymer', 'synthetic-polymer', 'organic-salt'];
  var METALS = ['Na', 'K', 'Ag', 'Cu', 'Ca', 'Pb', 'Mg', 'Zn', 'Fe', 'Al', 'Ba', 'Li', 'Sn'];

  var CHAIN_FAMILIES = [
    { id: 'amine', label: 'アミン', note: 'Nに結合する炭化水素基の数で第一級〜第三級に分ける。' },
    { id: 'ether', label: 'エーテル', note: 'R–O–R′。総炭素数を2つのRに分けて数える。C–C結合を保つ表記ではない。' },
    { id: 'alcohol', label: 'アルコール（一価）', note: 'R–OH。O–Hの結合線は省略してOHとまとめて表す。一価アルコール。' },
    { id: 'polyol', label: '多価アルコール', note: '1分子に2個以上のOHをもつ。飽和/不飽和はC=C・C≡Cの有無で別に判定する。' },
    { id: 'carboxylic', label: 'カルボン酸', note: '–COOH。COOHの炭素も総炭素数に含める。' },
    { id: 'ester', label: 'エステル', note: '–COO–。カルボン酸とアルコールの脱水縮合でできる構造。' },
    { id: 'aldehyde', label: 'アルデヒド', note: '–CHO。末端のカルボニル基。' },
    { id: 'ketone', label: 'ケトン', note: 'C=Oが炭素鎖の途中にある。' },
    { id: 'nitrile', label: 'ニトリル', note: '–C≡N。CNの炭素も総炭素数に含める。' },
    { id: 'halogen', label: 'ハロゲン化物', note: 'Cl・Br・Iを炭素に結合した化合物。' },
    { id: 'alkene', label: 'アルケン', note: 'C=Cを1本以上もつ鎖式炭化水素。' },
    { id: 'alkyne', label: 'アルキン', note: 'C≡Cを1本以上もつ鎖式炭化水素。' },
    { id: 'alkane', label: 'アルカン', note: '単結合だけの鎖式炭化水素。' },
    { id: 'nitro', label: 'ニトロ化合物', note: '–NO₂を炭素に結合した化合物。' },
    { id: 'anhydride', label: 'カルボン酸無水物', note: '2分子のカルボン酸から水がとれた構造。' },
    { id: 'amino-alcohol', label: 'アミノアルコール（多官能）', note: 'アミノ基とヒドロキシ基を併せもつ。モノアミン R–NH₂ の一般式とは別に扱う。' }
  ];

  var CHAIN_FAMILY_LABEL = {};
  CHAIN_FAMILIES.forEach(function (f) { CHAIN_FAMILY_LABEL[f.id] = f.label; });

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
    'p-hydroxybenzoic-acid': true, 'm-hydroxybenzoic-acid': true, ibuprofen: true
  };

  // 登録済みの多置換ベンゼン（custom/condensed構造で subs 配列をもたないもの）。
  // 一置換生成の結果に混ぜないための明示リスト。
  var BENZENE_MULTI_IDS = {
    'p-divinylbenzene': true, guaiacol: true, 'sulfanilic-acid': true,
    '2-nitrobenzaldehyde': true, acetaminophen: true, sulfanilamide: true,
    '2,4,6-tribromophenol': true, 'p-hydroxybenzoic-acid': true,
    'm-hydroxybenzoic-acid': true, ibuprofen: true
  };

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
          RING_ROUTES[entry.id] = { mode: 'ring', system: rs.id, group: gid, focus: entry.id };
          rs.generated.push(entry.id);
        });
      });
    }
    rs.registeredSingle = [];
    rs.registeredMulti = [];
    rs.registeredOther = [];
  });

  var ringMembers = {};
  Object.keys(D.COMPOUNDS).forEach(function (id) {
    var c = D.COMPOUNDS[id];
    if (OTHER_CATEGORY_IDS.indexOf(c.category) !== -1) return;
    if (isMetalFormula(c.formula)) return;
    var isRing = RING_CATEGORIES.indexOf(c.category) !== -1 || hasRing(c.structure);
    if (!isRing) return;
    var system = ringSystemFor(id);
    if (!RING_SYSTEM_MAP[system]) system = 'complex-ring';
    if (!ringMembers[system]) ringMembers[system] = [];
    ringMembers[system].push(id);
    if (RING_ROUTES[id]) return;
    var s = c.structure;
    var subs = (s && s.subs) ? s.subs.length : ((s && s.groups) ? s.groups.length : 1);
    if (BENZENE_MULTI_IDS[id]) subs = 2;
    var entry = { mode: 'ring', system: system, group: null, focus: id };
    RING_ROUTES[id] = entry;
    if (system === 'benzene' || system === 'naphthalene') {
      if (subs >= 2) RING_SYSTEM_MAP[system].registeredMulti.push(id);
      else RING_SYSTEM_MAP[system].registeredSingle.push(id);
    } else {
      RING_SYSTEM_MAP[system].registeredOther.push(id);
    }
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
    { id: 'nucleotide', category: 'natural-polymer', label: 'ヌクレオチド', ids: ['atp'] },
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
      return { mode: 'chain', family: r.family, carbon: r.carbon, degree: r.degree, structure: structure, focus: id };
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
      if (r.mode === 'ring' && !r.system) missing.push({ id: id, reason: 'ring systemなし' });
      if (r.mode === 'other' && (!r.family || !r.category || r.category === 'other')) missing.push({ id: id, reason: 'other family/categoryなし' });
    });
    return { total: Object.keys(D.COMPOUNDS).length, modes: modes, missing: missing };
  }

  return {
    CHAIN_FAMILIES: CHAIN_FAMILIES,
    CHAIN_FAMILY_LABEL: CHAIN_FAMILY_LABEL,
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
    carbonOptions: carbonOptions,
    chainIds: chainIds,
    chainIdsFor: chainIdsFor,
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
