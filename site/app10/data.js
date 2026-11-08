/*
 * 有機化学ビルダー — 収録データ
 *
 * - 組合せ生成（炭素骨格 + 官能基）は、登録済みの化合物IDを引く方式。
 *   自動で構造を生成しないため、未収録の組合せは理由を表示する。
 * - 構造データと学習用データを分離する。
 * - 分子式は構造データから計算して照合する（draw.js の validate）。
 * - PubChem CID は分子式・構造の照合用。出典は SOURCES を参照。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OCData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 19分野（計画§6）
   * ------------------------------------------------------------------ */
  var CATEGORIES = [
    { id: 'alkane', name: '飽和炭化水素', en: 'Saturated hydrocarbons', note: 'アルカン（メタン〜ペンタンと骨格異性体）と、参考として塩素置換体を含む。' },
    { id: 'unsat', name: '不飽和炭化水素', en: 'Unsaturated hydrocarbons', note: 'アルケン・アルキン。二重結合・三重結合をもつ。' },
    { id: 'cyclic', name: '環状炭化水素', en: 'Cyclic hydrocarbons', note: 'シクロプロパン〜シクロヘキサン。' },
    { id: 'alcohol', name: 'アルコール', en: 'Alcohols', note: '−OH をもつ。C1〜C4 の構造異性体を収録。' },
    { id: 'ether', name: 'エーテル', en: 'Ethers', note: 'C−O−C 結合。ジメチルエーテル・ジエチルエーテル。' },
    { id: 'aldehyde', name: 'アルデヒド', en: 'Aldehydes', note: '−CHO をもつ。ホルムアルデヒドと C2〜C5 の異性体。' },
    { id: 'ketone', name: 'ケトン', en: 'Ketones', note: 'C=O を鎖の途中にもつ。アセトン・ブタン-2-オン。' },
    { id: 'carboxylic', name: 'カルボン酸', en: 'Carboxylic acids', note: '−COOH をもつ。C1〜C5 の異性体と安息香酸。' },
    { id: 'ester', name: 'エステル', en: 'Esters', note: '−COO− 結合。酢酸メチル・酢酸エチル。' },
    { id: 'aromatic', name: '芳香族炭化水素', en: 'Aromatic hydrocarbons', note: 'ベンゼン・トルエン・スチレン・ナフタレン。' },
    { id: 'phenol', name: 'フェノール類', en: 'Phenols', note: 'ベンゼン環に −OH をもつ。フェノール。' },
    { id: 'aromatic-amine', name: '芳香族アミン', en: 'Aromatic amines', note: 'アニリン。' },
    { id: 'aromatic-other', name: 'その他の芳香族化合物', en: 'Other aromatic compounds', note: 'ベンズアルデヒド・ニトロベンゼン・クロロベンゼン・サリチル酸・アスピリン。' },
    { id: 'lipid', name: '油脂・脂肪酸', en: 'Fats, oils and fatty acids', note: 'ステアリン酸・オレイン酸・リノール酸・トリステアリン。' },
    { id: 'soap', name: 'セッケン・合成洗剤', en: 'Soaps and synthetic detergents', note: 'ステアリン酸ナトリウム・ドデシル硫酸ナトリウム（SDS）。' },
    { id: 'sugar', name: '糖類', en: 'Sugars', note: 'グルコース・フルクトース・スクロース・マルトース・ラクトース・デンプン・セルロース・グリコーゲン。' },
    { id: 'amino', name: 'アミノ酸・ペプチド・タンパク質', en: 'Amino acids, peptides and proteins', note: 'グリシン・アラニン・フェニルアラニン・グリシルアラニン・タンパク質。' },
    { id: 'natural-polymer', name: '天然高分子化合物', en: 'Natural polymers', note: '天然ゴム。デンプン・セルロースは糖類、タンパク質はアミノ酸の分類に掲載。' },
    { id: 'synthetic-polymer', name: '合成高分子化合物', en: 'Synthetic polymers', note: 'ポリエチレン・ポリプロピレン・ポリスチレン・PVC・PET・ナイロン-6,6・PVA。' }
  ];

  /* ------------------------------------------------------------------
   * 官能基・置換基
   * ------------------------------------------------------------------ */
  var GROUPS = [
    { id: 'none', label: '追加なし', formula: '＋ なし', short: 'なし', description: '新しい官能基を追加せず、炭素骨格そのものを表示します。' },
    { id: 'oh', label: 'ヒドロキシ基', formula: '−OH', short: '−OH', description: '酸素と水素からなる基。アルコール・フェノール類に含まれます。' },
    { id: 'cooh', label: 'カルボキシ基', formula: '−COOH', short: '−COOH', description: 'カルボン酸の官能基。炭素を1つ含み、酸性を示します。' },
    { id: 'nh2', label: 'アミノ基', formula: '−NH₂', short: '−NH₂', description: '塩基性を示す基。芳香族アミン・アミノ酸に含まれます。' },
    { id: 'cho', label: 'ホルミル基', formula: '−CHO', short: '−CHO', description: 'アルデヒドの官能基。還元性を示します。' },
    { id: 'no2', label: 'ニトロ基', formula: '−NO₂', short: '−NO₂', description: '窒素と酸素からなる基。ニトロ化合物に含まれます。' },
    { id: 'ch3', label: 'メチル基', formula: '−CH₃', short: '−CH₃', description: '炭素を1つもつ置換基。炭素鎖を1つ延ばします。' },
    { id: 'cl', label: '塩素置換', formula: '−Cl', short: '−Cl', description: '水素を塩素原子で置き換えます。' }
  ];

  /* ------------------------------------------------------------------
   * 出典
   * ------------------------------------------------------------------ */
  var SOURCES = {
    textbook: {
      label: '高等学校「化学」教科書（各社）',
      note: '高校化学の標準的な名称・分類・構造式の表記を参照。特定の1冊からの転載ではない。',
      url: ''
    },
    mext: {
      label: '文部科学省 高等学校学習指導要領解説 理科編 理数編',
      note: '収録範囲（19分野）の基準。',
      url: 'https://www.mext.go.jp/a_menu/shotou/new-cs/1407074.htm'
    },
    pubchem: {
      label: 'PubChem（NIH）',
      note: '分子式・構造の照合。各化合物のCIDを台帳に記載。',
      url: 'https://pubchem.ncbi.nlm.nih.gov/'
    },
    nist: {
      label: 'NIST Chemistry WebBook',
      note: '沸点・物性値などの確認に使用。',
      url: 'https://webbook.nist.gov/chemistry/'
    },
    iupac: {
      label: 'IUPAC Gold Book',
      note: '命名・定義の確認。',
      url: 'https://goldbook.iupac.org/'
    },
    csj: {
      label: '日本化学会 化学便覧',
      note: '物性・反応の参考（図書館等で参照）。',
      url: 'https://www.csj.jp/'
    }
  };

  /* ------------------------------------------------------------------
   * 化合物データ
   * ------------------------------------------------------------------ */
  var COMPOUNDS = {};

  function comp(id, name, formula, category, structure, extra) {
    var base = {
      id: id,
      name: name,
      formula: formula,
      category: category,
      structure: structure,
      properties: '情報未登録',
      uses: '情報未登録',
      nature: '情報未登録',
      hazards: '',
      notes: '',
      sources: ['textbook', 'pubchem'],
      dataStatus: 'class',
      pubchem: null,
      verified: true
    };
    if (extra) Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
    COMPOUNDS[id] = base;
    return base;
  }

  function sub(id, name, formula, category, skeleton, at, group, extra) {
    var structure = { type: 'sub', skeleton: skeleton, at: at, group: group };
    if (extra && extra.mode) structure.mode = extra.mode;
    return comp(id, name, formula, category, structure, extra);
  }

  function skel(id, name, formula, category, skeleton, extra) {
    return comp(id, name, formula, category, { type: 'skeleton', skeleton: skeleton }, extra);
  }

  function proj(kind, sugar, composition, extra) {
    var s = {
      type: 'projection',
      kind: kind,
      sugar: sugar,
      composition: composition
    };
    if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
    return s;
  }

  function polymer(unit, unitFormula, formula, extra) {
    var s = { type: 'polymer', unit: unit, unitFormula: unitFormula, formula: formula };
    if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
    return s;
  }

  /* ---- 飽和炭化水素 ---- */
  skel('methane', 'メタン', 'CH4', 'alkane', 'methane', {
    properties: '無色・無臭の可燃性気体。水にほとんど溶けない。',
    uses: '天然ガスの主成分。家庭用・工業用燃料、水素やメタノールの原料。',
    nature: '天然ガス田、湿地、家畜の消化器官などで生成する。',
    hazards: '可燃性。空気と混合すると爆発範囲を形成する。',
    pubchem: 297, dataStatus: 'full'
  });
  skel('ethane', 'エタン', 'C2H6', 'alkane', 'ethane', {
    properties: '無色・無臭の可燃性気体。水にほとんど溶けない。',
    uses: 'エチレン、酢酸などの化学工業原料。天然ガスにも含まれる。',
    nature: '天然ガス・石油随伴ガスに含まれる。',
    hazards: '可燃性。',
    pubchem: 6324, dataStatus: 'full'
  });
  skel('propane', 'プロパン', 'C3H8', 'alkane', 'propane', {
    properties: '無色の可燃性気体。加圧で液化しやすい。',
    uses: 'LPG（液化石油ガス）として燃料に利用。',
    nature: '天然ガス・石油精製ガスに含まれる。',
    hazards: '可燃性。',
    pubchem: 6334, dataStatus: 'full'
  });
  skel('butane', 'ブタン', 'C4H10', 'alkane', 'butane', {
    properties: '無色の可燃性気体。常温・常圧では気体だが、加圧で液化する。',
    uses: 'ライター、カセットボンベ、LPG燃料。',
    nature: '天然ガス・石油に含まれる。',
    hazards: '可燃性。',
    pubchem: 7843, dataStatus: 'full'
  });
  skel('isobutane', '2-メチルプロパン（イソブタン）', 'C4H10', 'alkane', 'isobutane', {
    properties: '無色の可燃性気体。',
    uses: '冷媒（R-600a）、エアゾール噴射剤、燃料。',
    nature: '天然ガス・石油に含まれる。',
    hazards: '可燃性。',
    pubchem: 6360, dataStatus: 'full',
    notes: 'ブタンと分子式は同じだが、炭素骨格が異なる骨格異性体。'
  });
  skel('pentane', 'ペンタン', 'C5H12', 'alkane', 'pentane', {
    properties: '無色の可燃性液体。',
    uses: '溶媒、発泡剤、燃料の成分。',
    nature: '石油・天然ガスに含まれる。',
    hazards: '可燃性。',
    pubchem: 8003, dataStatus: 'class'
  });
  skel('isopentane', '2-メチルブタン（イソペンタン）', 'C5H12', 'alkane', 'isopentane', {
    properties: '無色の可燃性液体。',
    uses: '溶媒、発泡剤。',
    nature: '石油に含まれる。',
    hazards: '可燃性。',
    pubchem: 6556, dataStatus: 'class'
  });
  skel('neopentane', '2,2-ジメチルプロパン（ネオペンタン）', 'C5H12', 'alkane', 'neopentane', {
    properties: '室温で気体の可燃性物質（沸点約9.5℃）。',
    uses: '燃料、冷媒、発泡剤の原料。',
    nature: '石油に含まれる。',
    hazards: '可燃性。',
    pubchem: 10041, dataStatus: 'class'
  });

  /* ---- 不飽和炭化水素（アルケン） ---- */
  skel('ethene', 'エテン（エチレン）', 'C2H4', 'unsat', 'ethene', {
    properties: '無色の可燃性気体。',
    uses: 'ポリエチレン、エタノール、酸化エチレンなどの原料。植物ホルモン（果実の熟成）としても働く。',
    nature: '石油化学工業で製造。植物が生成する。',
    hazards: '可燃性。',
    pubchem: 6325, dataStatus: 'full'
  });
  skel('propene', 'プロペン（プロピレン）', 'C3H6', 'unsat', 'propene', {
    properties: '無色の可燃性気体。',
    uses: 'ポリプロピレン、アクリロニトリル、酸化プロピレンなどの原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 8252, dataStatus: 'full'
  });
  skel('but-1-ene', 'ブタ-1-エン（1-ブテン）', 'C4H8', 'unsat', 'but-1-ene', {
    properties: '無色の可燃性気体。',
    uses: 'ポリエチレン（共重合）、ブタジエンなどの原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 7844, dataStatus: 'class'
  });
  skel('but-2-ene', 'ブタ-2-エン（2-ブテン）', 'C4H8', 'unsat', 'but-2-ene', {
    properties: '無色の可燃性気体。シス形・トランス形の幾何異性体がある。',
    uses: 'ブタジエン、溶媒などの原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 62695, dataStatus: 'class',
    notes: '本版ではシス/トランスの幾何異性体を区別せず、構造異性体として1件表示します。'
  });
  skel('isobutene', '2-メチルプロペン（イソブテン）', 'C4H8', 'unsat', 'isobutene', {
    properties: '無色の可燃性気体。',
    uses: 'ブチルゴム、MTBE、ポリイソブチレンの原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 8255, dataStatus: 'class'
  });

  /* ---- 不飽和炭化水素（アルキン） ---- */
  skel('ethyne', 'エチン（アセチレン）', 'C2H2', 'unsat', 'ethyne', {
    properties: '無色の可燃性気体。独特のにおい。',
    uses: '酸素アセチレン炎による溶接・切断、塩化ビニルなどの原料。',
    nature: '炭化カルシウムと水から製造。天然にはほとんど存在しない。',
    hazards: '可燃性。高圧で分解爆発の危険がある。',
    pubchem: 6326, dataStatus: 'full'
  });
  skel('propyne', 'プロピン（メチルアセチレン）', 'C3H4', 'unsat', 'propyne', {
    properties: '無色の可燃性気体。',
    uses: '溶接・切断、化学原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 6335, dataStatus: 'class'
  });
  skel('but-1-yne', 'ブタ-1-イン（1-ブチン）', 'C4H6', 'unsat', 'but-1-yne', {
    properties: '無色の可燃性気体。',
    uses: '化学原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 7846, dataStatus: 'class'
  });
  skel('but-2-yne', 'ブタ-2-イン（2-ブチン）', 'C4H6', 'unsat', 'but-2-yne', {
    properties: '無色の可燃性液体。',
    uses: '化学原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 10419, dataStatus: 'class'
  });

  /* ---- 環状炭化水素 ---- */
  skel('cyclopropane', 'シクロプロパン', 'C3H6', 'cyclic', 'cyclopropane', {
    properties: '無色の可燃性気体。麻酔作用がある。',
    uses: 'かつて吸入麻酔薬として使用。現在は化学原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性・麻酔作用。',
    pubchem: 6351, dataStatus: 'class'
  });
  skel('cyclobutane', 'シクロブタン', 'C4H8', 'cyclic', 'cyclobutane', {
    properties: '無色の可燃性気体。',
    uses: '化学原料。',
    nature: '石油化学工業で製造。',
    hazards: '可燃性。',
    pubchem: 9250, dataStatus: 'class'
  });
  skel('cyclopentane', 'シクロペンタン', 'C5H10', 'cyclic', 'cyclopentane', {
    properties: '無色の可燃性液体。',
    uses: '溶媒、発泡剤、冷媒。',
    nature: '石油に含まれる。',
    hazards: '可燃性。',
    pubchem: 9253, dataStatus: 'class'
  });
  skel('cyclohexane', 'シクロヘキサン', 'C6H12', 'cyclic', 'cyclohexane', {
    properties: '無色の可燃性液体。',
    uses: 'ナイロン原料（シクロヘキサノン・アジピン酸）の原料、溶媒。',
    nature: '石油に含まれる。',
    hazards: '可燃性。',
    pubchem: 8078, dataStatus: 'full'
  });

  /* ---- 芳香族炭化水素 ---- */
  skel('benzene', 'ベンゼン', 'C6H6', 'aromatic', 'benzene', {
    properties: '無色の可燃性液体。特有のにおい。発がん性がある。',
    uses: 'スチレン、フェノール、シクロヘキサン、ナイロン原料など。',
    nature: '原油・石炭に含まれる。',
    hazards: '発がん性（IARC 1群）。換気に注意。',
    pubchem: 241, dataStatus: 'full',
    notes: '表示はケクレ式（交互の二重結合3本）。内部では芳香族性を別に扱う。'
  });
  skel('naphthalene', 'ナフタレン', 'C10H8', 'aromatic', 'naphthalene', {
    properties: '白色の結晶。昇華性があり、特有のにおい。',
    uses: '防虫剤（樟脳の代替）、フタル酸無水物の原料。',
    nature: '石炭タールに含まれる。',
    hazards: '可燃性。長期曝露で健康影響のおそれ。',
    pubchem: 931, dataStatus: 'class',
    notes: 'ベンゼン環2つが縮合した多環芳香族。'
  });

  /* ---- アルコール（C1〜C4 の構造異性体） ---- */
  sub('methanol', 'メタノール', 'CH4O', 'alcohol', 'methane', 0, 'oh', {
    properties: '無色の可燃性液体。水と任意の割合で混ざる。',
    uses: 'ホルムアルデヒド、溶剤、燃料。',
    nature: '工業的に合成。天然にも微量存在。',
    hazards: '飲用すると失明・死亡の危険がある。',
    pubchem: 887, dataStatus: 'full', mode: 'expanded'
  });
  sub('ethanol', 'エタノール', 'C2H6O', 'alcohol', 'ethane', 0, 'oh', {
    properties: '無色の可燃性液体。水と任意の割合で混ざる。',
    uses: '消毒、溶剤、飲料、燃料（バイオエタノール）。',
    nature: '糖のアルコール発酵で生成。酒類・発酵食品に含まれる。',
    hazards: '可燃性。飲酒は健康・法令上の制限がある。',
    pubchem: 702, dataStatus: 'full', mode: 'expanded'
  });
  sub('propan-1-ol', 'プロパン-1-オール（1-プロパノール）', 'C3H8O', 'alcohol', 'propane', 0, 'oh', {
    properties: '無色の可燃性液体。水に溶けやすい。',
    uses: '溶剤、印刷インキ、化粧品。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 1031, dataStatus: 'class'
  });
  sub('propan-2-ol', 'プロパン-2-オール（2-プロパノール）', 'C3H8O', 'alcohol', 'propane', 1, 'oh', {
    properties: '無色の可燃性液体。水に溶けやすい。',
    uses: '消毒（イソプロパノール）、洗浄剤、溶剤。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 3776, dataStatus: 'full'
  });
  sub('butan-1-ol', 'ブタン-1-オール（1-ブタノール）', 'C4H10O', 'alcohol', 'butane', 0, 'oh', {
    properties: '無色の可燃性液体。水にやや溶けにくい。',
    uses: '溶剤、可塑剤、香料原料。',
    nature: '発酵でも生成する。',
    hazards: '可燃性。',
    pubchem: 263, dataStatus: 'class'
  });
  sub('butan-2-ol', 'ブタン-2-オール（2-ブタノール）', 'C4H10O', 'alcohol', 'butane', 1, 'oh', {
    properties: '無色の可燃性液体。',
    uses: '溶剤、化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 6568, dataStatus: 'class'
  });
  sub('2-methylpropan-1-ol', '2-メチルプロパン-1-オール（イソブタノール）', 'C4H10O', 'alcohol', 'isobutane', 1, 'oh', {
    properties: '無色の可燃性液体。',
    uses: '溶剤、香料・樹脂原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 6560, dataStatus: 'class'
  });
  sub('2-methylpropan-2-ol', '2-メチルプロパン-2-オール（tert-ブタノール）', 'C4H10O', 'alcohol', 'isobutane', 0, 'oh', {
    properties: '常温で固体（融点約25℃）または液体。可燃性。',
    uses: '溶剤、化学合成原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 6386, dataStatus: 'class'
  });

  /* ---- カルボン酸（C1〜C5 の構造異性体） ---- */
  sub('acetic-acid', '酢酸（エタン酸）', 'C2H4O2', 'carboxylic', 'methane', 0, 'cooh', {
    properties: '無色の液体。刺激臭。水に溶け、弱酸性を示す。',
    uses: '食酢の酸味成分。酢酸ビニル・セルロースアセテートなどの原料。',
    nature: '酢酸菌による発酵で生成する。',
    hazards: '濃いものは腐食性。',
    pubchem: 176, dataStatus: 'full', mode: 'expanded'
  });
  sub('propionic-acid', 'プロピオン酸（プロパン酸）', 'C3H6O2', 'carboxylic', 'ethane', 0, 'cooh', {
    properties: '無色の液体。刺激臭。弱酸性。',
    uses: '保存料、除草剤、香料原料。',
    nature: '一部の発酵食品に含まれる。',
    hazards: '腐食性・刺激性。',
    pubchem: 1032, dataStatus: 'class'
  });
  sub('butanoic-acid', '酪酸（ブタン酸）', 'C4H8O2', 'carboxylic', 'propane', 0, 'cooh', {
    properties: '無色の液体。不快な酸臭。弱酸性。',
    uses: '香料（酪酸エステル）、化学原料。',
    nature: '発酵食品（チーズ・バター）に含まれる。',
    hazards: '腐食性・刺激性。',
    pubchem: 264, dataStatus: 'full'
  });
  sub('2-methylpropanoic-acid', '2-メチルプロパン酸（イソ酪酸）', 'C4H8O2', 'carboxylic', 'propane', 1, 'cooh', {
    properties: '無色の液体。刺激臭。',
    uses: 'エステル・香料原料。',
    nature: '植物などに存在する。',
    hazards: '腐食性・刺激性。',
    pubchem: 6590, dataStatus: 'class'
  });
  sub('pentanoic-acid', 'ペンタン酸（吉草酸）', 'C5H10O2', 'carboxylic', 'butane', 0, 'cooh', {
    properties: '無色の液体。不快なにおい。',
    uses: '香料・医薬品原料。',
    nature: '一部の植物に存在する。',
    hazards: '腐食性・刺激性。',
    pubchem: 7991, dataStatus: 'class'
  });
  sub('2-methylbutanoic-acid', '2-メチルブタン酸', 'C5H10O2', 'carboxylic', 'butane', 1, 'cooh', {
    properties: '無色の液体。',
    uses: '香料・化学原料。',
    nature: '情報未登録。',
    hazards: '腐食性・刺激性。',
    pubchem: 8314, dataStatus: 'minimal'
  });
  sub('3-methylbutanoic-acid', '3-メチルブタン酸（イソ吉草酸）', 'C5H10O2', 'carboxylic', 'isobutane', 1, 'cooh', {
    properties: '無色の液体。不快なにおい。',
    uses: '香料（イソ吉草酸エステル）原料。',
    nature: '一部の植物・発酵食品に存在する。',
    hazards: '腐食性・刺激性。',
    pubchem: 10430, dataStatus: 'class'
  });
  sub('2,2-dimethylpropanoic-acid', '2,2-ジメチルプロパン酸（ピバル酸）', 'C5H10O2', 'carboxylic', 'isobutane', 0, 'cooh', {
    properties: '白色の結晶。刺激臭。',
    uses: '有機合成原料。',
    nature: '情報未登録。',
    hazards: '腐食性・刺激性。',
    pubchem: 6417, dataStatus: 'minimal'
  });

  /* ---- アルデヒド（C2〜C5 の構造異性体） ---- */
  sub('ethanal', 'エタナール（アセトアルデヒド）', 'C2H4O', 'aldehyde', 'methane', 0, 'cho', {
    properties: '無色の液体。刺激臭。',
    uses: 'アセトン・酢酸・樹脂原料。',
    nature: 'アルコール発酵の中間体として生成する。',
    hazards: '可燃性・刺激性。',
    pubchem: 177, dataStatus: 'full', mode: 'expanded'
  });
  sub('propanal', 'プロパナール（プロピオンアルデヒド）', 'C3H6O', 'aldehyde', 'ethane', 0, 'cho', {
    properties: '無色の液体。刺激臭。',
    uses: '樹脂・香料原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 527, dataStatus: 'class'
  });
  sub('butanal', 'ブタナール（酪酸アルデヒド）', 'C4H8O', 'aldehyde', 'propane', 0, 'cho', {
    properties: '無色の液体。刺激臭。',
    uses: '樹脂・香料原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 261, dataStatus: 'class'
  });
  sub('2-methylpropanal', '2-メチルプロパナール（イソブチルアルデヒド）', 'C4H8O', 'aldehyde', 'propane', 1, 'cho', {
    properties: '無色の液体。',
    uses: '樹脂・香料原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 6561, dataStatus: 'class'
  });
  sub('pentanal', 'ペンタナール（吉草アルデヒド）', 'C5H10O', 'aldehyde', 'butane', 0, 'cho', {
    properties: '無色の液体。',
    uses: '香料・樹脂原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 8063, dataStatus: 'class'
  });
  sub('2-methylbutanal', '2-メチルブタナール', 'C5H10O', 'aldehyde', 'butane', 1, 'cho', {
    properties: '無色の液体。',
    uses: '香料原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 7284, dataStatus: 'minimal'
  });
  sub('3-methylbutanal', '3-メチルブタナール（イソ吉草アルデヒド）', 'C5H10O', 'aldehyde', 'isobutane', 1, 'cho', {
    properties: '無色の液体。',
    uses: '香料原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 11552, dataStatus: 'minimal'
  });
  sub('2,2-dimethylpropanal', '2,2-ジメチルプロパナール（ピバルアルデヒド）', 'C5H10O', 'aldehyde', 'isobutane', 0, 'cho', {
    properties: '無色の液体。',
    uses: '有機合成原料。',
    nature: '情報未登録。',
    hazards: '可燃性・刺激性。',
    pubchem: 12417, dataStatus: 'minimal'
  });

  /* ---- 塩素置換体（C1〜C4） ---- */
  sub('chloromethane', 'クロロメタン（塩化メチル）', 'CH3Cl', 'alkane', 'methane', 0, 'cl', {
    properties: '無色の可燃性気体。',
    uses: 'シリコーン樹脂原料、冷媒（旧）、溶剤。',
    nature: '工業的に合成。',
    hazards: '可燃性・毒性。',
    pubchem: 6327, dataStatus: 'class', subcategory: '塩素置換体', mode: 'expanded'
  });
  sub('chloroethane', 'クロロエタン（塩化エチル）', 'C2H5Cl', 'alkane', 'ethane', 0, 'cl', {
    properties: '無色の可燃性気体。',
    uses: '局所麻酔薬（歴史的）、化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性・毒性。',
    pubchem: 6337, dataStatus: 'class', subcategory: '塩素置換体', mode: 'expanded'
  });
  sub('1-chloropropane', '1-クロロプロパン', 'C3H7Cl', 'alkane', 'propane', 0, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '溶剤・化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 10899, dataStatus: 'class', subcategory: '塩素置換体'
  });
  sub('2-chloropropane', '2-クロロプロパン（イソプロピルクロリド）', 'C3H7Cl', 'alkane', 'propane', 1, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '溶剤・化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 6361, dataStatus: 'class', subcategory: '塩素置換体'
  });
  sub('1-chlorobutane', '1-クロロブタン', 'C4H9Cl', 'alkane', 'butane', 0, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '溶剤・化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 8005, dataStatus: 'class', subcategory: '塩素置換体'
  });
  sub('2-chlorobutane', '2-クロロブタン', 'C4H9Cl', 'alkane', 'butane', 1, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '溶剤・化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 6563, dataStatus: 'class', subcategory: '塩素置換体'
  });
  sub('1-chloro-2-methylpropane', '1-クロロ-2-メチルプロパン（イソブチルクロリド）', 'C4H9Cl', 'alkane', 'isobutane', 1, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 10554, dataStatus: 'minimal', subcategory: '塩素置換体'
  });
  sub('2-chloro-2-methylpropane', '2-クロロ-2-メチルプロパン（tert-ブチルクロリド）', 'C4H9Cl', 'alkane', 'isobutane', 0, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '化学原料。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 10486, dataStatus: 'minimal', subcategory: '塩素置換体'
  });

  /* ---- ベンゼン誘導体（組合せ生成） ---- */
  sub('phenol', 'フェノール', 'C6H6O', 'phenol', 'benzene', 0, 'oh', {
    properties: '無色の結晶。特有のにおい。弱酸性。皮膚を腐食する。',
    uses: 'フェノール樹脂、ビスフェノールA、ナイロン原料。',
    nature: '石炭タールに含まれる。工業的に合成。',
    hazards: '腐食性・有毒。',
    pubchem: 996, dataStatus: 'full', mode: 'expanded'
  });
  sub('benzoic-acid', '安息香酸（ベンゼンカルボン酸）', 'C7H6O2', 'carboxylic', 'benzene', 0, 'cooh', {
    properties: '白色の結晶。弱酸性。',
    uses: '食品保存料（安息香酸ナトリウム）、医薬品・香料原料。',
    nature: '一部の植物・果実に存在する。',
    hazards: '刺激性。',
    pubchem: 243, dataStatus: 'full', mode: 'expanded'
  });
  sub('aniline', 'アニリン（アミノベンゼン）', 'C6H7N', 'aromatic-amine', 'benzene', 0, 'nh2', {
    properties: '無色〜淡黄色の液体。弱塩基性。',
    uses: '染料、ゴム薬品、ポリウレタン原料。',
    nature: '石炭タールに含まれる。工業的に合成。',
    hazards: '有毒。血液障害のおそれ。',
    pubchem: 6115, dataStatus: 'full', mode: 'expanded'
  });
  sub('benzaldehyde', 'ベンズアルデヒド（安息香アルデヒド）', 'C7H6O', 'aromatic-other', 'benzene', 0, 'cho', {
    properties: '無色の液体。アーモンド様のにおい。',
    uses: '香料、染料・医薬品原料。',
    nature: '苦扁桃などの植物に存在する。',
    hazards: '可燃性・刺激性。',
    pubchem: 240, dataStatus: 'class', mode: 'expanded'
  });
  sub('nitrobenzene', 'ニトロベンゼン', 'C6H5NO2', 'aromatic-other', 'benzene', 0, 'no2', {
    properties: '淡黄色の液体。特有のにおい。',
    uses: 'アニリン、染料・爆薬原料。',
    nature: '工業的に合成。',
    hazards: '有毒。',
    pubchem: 7416, dataStatus: 'class', mode: 'expanded'
  });
  sub('toluene', 'トルエン（メチルベンゼン）', 'C7H8', 'aromatic', 'benzene', 0, 'ch3', {
    properties: '無色の可燃性液体。',
    uses: '溶剤、ガソリン添加剤、TNT・安息香酸原料。',
    nature: '原油・石炭タールに含まれる。',
    hazards: '可燃性・神経毒性。',
    pubchem: 1140, dataStatus: 'full', mode: 'expanded'
  });
  sub('chlorobenzene', 'クロロベンゼン', 'C6H5Cl', 'aromatic-other', 'benzene', 0, 'cl', {
    properties: '無色の可燃性液体。',
    uses: '溶剤、フェノール・染料原料。',
    nature: '工業的に合成。',
    hazards: '可燃性・刺激性。',
    pubchem: 7964, dataStatus: 'class', mode: 'expanded'
  });

  /* ---- エーテル ---- */
  comp('dimethyl-ether', 'ジメチルエーテル（メトキシメタン）', 'C2H6O', 'ether', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 100, y: 110, h: 3 },
      { el: 'O', x: 180, y: 110, h: 0 },
      { el: 'C', x: 260, y: 110, h: 3 }
    ],
    bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }],
    mode: 'condensed', width: 360, height: 220
  }, {
    properties: '無色の可燃性気体。',
    uses: 'エアゾール噴射剤、燃料、冷媒。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 8254, dataStatus: 'class'
  });
  comp('diethyl-ether', 'ジエチルエーテル（エトキシエタン）', 'C4H10O', 'ether', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 50, y: 110, h: 3 },
      { el: 'C', x: 115, y: 85, h: 2 },
      { el: 'O', x: 180, y: 110, h: 0 },
      { el: 'C', x: 245, y: 85, h: 2 },
      { el: 'C', x: 310, y: 110, h: 3 }
    ],
    bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }],
    mode: 'condensed', width: 380, height: 230
  }, {
    properties: '無色の揮発性液体。引火しやすい。',
    uses: '溶剤、かつて吸入麻酔薬として使用。',
    nature: '工業的に合成。',
    hazards: '引火性・麻酔作用。',
    pubchem: 3283, dataStatus: 'full'
  });

  /* ---- エステル ---- */
  comp('methyl-acetate', '酢酸メチル', 'C3H6O2', 'ester', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 60, y: 115, h: 3 },
      { el: 'C', x: 130, y: 90, h: 0 },
      { el: 'O', x: 130, y: 30, h: 0 },
      { el: 'O', x: 200, y: 115, h: 0 },
      { el: 'C', x: 270, y: 90, h: 3 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 },
      { a: 1, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }
    ],
    mode: 'condensed', width: 380, height: 230
  }, {
    properties: '無色の液体。果実様のにおい。',
    uses: '溶剤、香料、インキ。',
    nature: '工業的に合成。',
    hazards: '可燃性。',
    pubchem: 6584, dataStatus: 'class'
  });
  comp('ethyl-acetate', '酢酸エチル', 'C4H8O2', 'ester', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 45, y: 115, h: 3 },
      { el: 'C', x: 115, y: 90, h: 0 },
      { el: 'O', x: 115, y: 30, h: 0 },
      { el: 'O', x: 185, y: 115, h: 0 },
      { el: 'C', x: 255, y: 90, h: 2 },
      { el: 'C', x: 325, y: 115, h: 3 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 },
      { a: 1, b: 3, order: 1 }, { a: 3, b: 4, order: 1 },
      { a: 4, b: 5, order: 1 }
    ],
    mode: 'condensed', width: 400, height: 230
  }, {
    properties: '無色の液体。果実様のにおい。',
    uses: '溶剤、塗料、香料。',
    nature: '工業的に合成。発酵食品にも微量含まれる。',
    hazards: '可燃性。',
    pubchem: 8857, dataStatus: 'full'
  });

  /* ---- アルデヒド・ケトン（個別） ---- */
  comp('formaldehyde', 'ホルムアルデヒド（メタナール）', 'CH2O', 'aldehyde', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 180, y: 110, h: 2 },
      { el: 'O', x: 180, y: 45, h: 0 }
    ],
    bonds: [{ a: 0, b: 1, order: 2 }],
    mode: 'expanded', width: 360, height: 230
  }, {
    properties: '無色の刺激臭のある気体。水に溶けやすい。',
    uses: '尿素樹脂・メラミン樹脂原料、防腐・消毒、接着剤。',
    nature: '工業的に合成。生物の代謝でも生成する。',
    hazards: '有毒・発がん性。換気に注意。',
    pubchem: 712, dataStatus: 'full'
  });
  comp('acetone', 'アセトン（プロパン-2-オン）', 'C3H6O', 'ketone', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 110, y: 120, h: 3 },
      { el: 'C', x: 180, y: 95, h: 0 },
      { el: 'C', x: 250, y: 120, h: 3 },
      { el: 'O', x: 180, y: 35, h: 0 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 3, order: 2 }
    ],
    mode: 'condensed', width: 360, height: 240
  }, {
    properties: '無色の液体。特有のにおい。水と任意の割合で混ざる。',
    uses: '溶剤、アクリル樹脂原料、除光液。',
    nature: '工業的に合成。体内でも生成する。',
    hazards: '可燃性・刺激性。',
    pubchem: 180, dataStatus: 'full'
  });
  comp('butanone', 'ブタン-2-オン（メチルエチルケトン）', 'C4H8O', 'ketone', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 60, y: 120, h: 3 },
      { el: 'C', x: 130, y: 95, h: 0 },
      { el: 'O', x: 130, y: 35, h: 0 },
      { el: 'C', x: 200, y: 120, h: 2 },
      { el: 'C', x: 270, y: 95, h: 3 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 },
      { a: 1, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }
    ],
    mode: 'condensed', width: 380, height: 240
  }, {
    properties: '無色の液体。',
    uses: '溶剤、塗料、接着剤。',
    nature: '工業的に合成。',
    hazards: '可燃性・刺激性。',
    pubchem: 6569, dataStatus: 'class'
  });

  /* ---- カルボン酸（個別） ---- */
  comp('formic-acid', 'ギ酸（メタン酸）', 'CH2O2', 'carboxylic', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 170, y: 100, h: 1 },
      { el: 'O', x: 170, y: 40, h: 0 },
      { el: 'O', x: 240, y: 140, h: 1 }
    ],
    bonds: [{ a: 0, b: 1, order: 2 }, { a: 0, b: 2, order: 1 }],
    mode: 'expanded', width: 360, height: 240
  }, {
    properties: '無色の液体。刺激臭。弱酸性。',
    uses: '皮革処理、防腐剤、化学原料。',
    nature: 'アリ・ハチの毒液に含まれる。',
    hazards: '腐食性・刺激性。',
    pubchem: 284, dataStatus: 'class'
  });
  comp('oxalic-acid', 'シュウ酸（エタン二酸）', 'C2H2O4', 'carboxylic', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 110, y: 100, h: 0 },
      { el: 'C', x: 230, y: 100, h: 0 },
      { el: 'O', x: 110, y: 40, h: 0 },
      { el: 'O', x: 50, y: 150, h: 1 },
      { el: 'O', x: 230, y: 40, h: 0 },
      { el: 'O', x: 290, y: 150, h: 1 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 2 }, { a: 0, b: 3, order: 1 },
      { a: 1, b: 4, order: 2 }, { a: 1, b: 5, order: 1 }
    ],
    mode: 'condensed', width: 380, height: 240
  }, {
    properties: '無色の結晶。酸性。',
    uses: '漂白剤、錆取り、化学原料。',
    nature: 'ほうれん草・大黄などの植物に含まれる。',
    hazards: '有毒。',
    pubchem: 971, dataStatus: 'class'
  });

  /* ---- 芳香族化合物（個別） ---- */
  comp('styrene', 'スチレン（ビニルベンゼン）', 'C8H8', 'aromatic', {
    type: 'ring-sub',
    subs: [{ at: 0, label: 'CH=CH₂' }],
    composition: { C: 8, H: 8 }
  }, {
    properties: '無色の液体。特有のにおい。',
    uses: 'ポリスチレン、ABS樹脂、合成ゴム原料。',
    nature: '工業的に合成。',
    hazards: '可燃性・刺激性。発がん性評価に注意。',
    pubchem: 7501, dataStatus: 'class'
  });
  comp('salicylic-acid', 'サリチル酸（2-ヒドロキシ安息香酸）', 'C7H6O3', 'aromatic-other', {
    type: 'ring-sub',
    subs: [{ at: 0, label: 'OH' }, { at: 1, label: 'COOH' }],
    composition: { C: 7, H: 6, O: 3 }
  }, {
    properties: '白色の結晶。弱酸性。',
    uses: '医薬品（アスピリン）原料、防腐剤、化粧品。',
    nature: 'ヤナギの樹皮などに存在する。',
    hazards: '刺激性。',
    pubchem: 338, dataStatus: 'class'
  });
  comp('aspirin', 'アセチルサリチル酸（アスピリン）', 'C9H8O4', 'aromatic-other', {
    type: 'ring-sub',
    subs: [{ at: 0, label: 'COOH' }, { at: 1, label: 'OCOCH₃' }],
    composition: { C: 9, H: 8, O: 4 }
  }, {
    properties: '白色の結晶。',
    uses: '解熱鎮痛薬、抗血小板薬。',
    nature: '工業的に合成。',
    hazards: '胃腸障害・出血傾向。',
    pubchem: 2244, dataStatus: 'class'
  });

  /* ---- 油脂・脂肪酸 ---- */
  comp('stearic-acid', 'ステアリン酸（オクタデカン酸）', 'C18H36O2', 'lipid', {
    type: 'condensed',
    lines: ['CH₃(CH₂)₁₆COOH'],
    composition: { C: 18, H: 36, O: 2 }
  }, {
    properties: '白色の固体。水に溶けにくい。',
    uses: '石けん・ろうそく・化粧品原料。',
    nature: '動物性油脂・植物性油脂に含まれる。',
    hazards: '刺激性。',
    pubchem: 5281, dataStatus: 'full',
    notes: '飽和脂肪酸。高級脂肪酸の代表例。'
  });
  comp('oleic-acid', 'オレイン酸（シス-9-オクタデセン酸）', 'C18H34O2', 'lipid', {
    type: 'condensed',
    lines: ['CH₃(CH₂)₇CH=CH(CH₂)₇COOH'],
    composition: { C: 18, H: 34, O: 2 }
  }, {
    properties: '無色の液体。シス形の不飽和脂肪酸。',
    uses: '石けん・化粧品・食品。',
    nature: 'オリーブ油などに多く含まれる。',
    hazards: '刺激性。',
    pubchem: 445639, dataStatus: 'full',
    notes: 'シス形の不飽和脂肪酸。簡略構造式のため、二重結合の立体配置（シス形）は図では省略しています。'
  });
  comp('linoleic-acid', 'リノール酸（シス,シス-9,12-オクタデカジエン酸）', 'C18H32O2', 'lipid', {
    type: 'condensed',
    lines: ['CH₃(CH₂)₄CH=CHCH₂CH=CH(CH₂)₇COOH'],
    composition: { C: 18, H: 32, O: 2 }
  }, {
    properties: '無色の液体。必須脂肪酸。',
    uses: '食品・化粧品・塗料。',
    nature: '大豆油・ひまわり油などの植物油に含まれる。',
    hazards: '刺激性。',
    pubchem: 5280450, dataStatus: 'class',
    notes: '二重結合2つのシス形をもつ必須脂肪酸。簡略構造式のため、立体配置は図では省略しています。'
  });
  comp('tristearin', 'トリステアリン（ステアリン酸グリセリド）', 'C57H110O6', 'lipid', {
    type: 'triglyceride',
    composition: { C: 57, H: 110, O: 6 }
  }, {
    properties: '白色の固体。',
    uses: '食品・化粧品・石けん原料。',
    nature: '牛脂・豚脂などの動物性油脂に含まれる。',
    hazards: '情報未登録。',
    pubchem: 11146, dataStatus: 'class',
    notes: 'グリセリンとステアリン酸3分子からなる油脂（トリグリセリド）。'
  });

  /* ---- セッケン・合成洗剤 ---- */
  comp('sodium-stearate', 'ステアリン酸ナトリウム', 'C18H35NaO2', 'soap', {
    type: 'condensed',
    lines: ['C₁₇H₃₅—COO⁻Na⁺'],
    composition: { C: 18, H: 35, Na: 1, O: 2 }
  }, {
    properties: '白色の粉末。水に溶けて塩基性を示す。',
    uses: '石けんの主成分。',
    nature: '油脂のけん化で生成する。',
    hazards: '目・皮膚への刺激性。',
    pubchem: 2724691, dataStatus: 'full',
    notes: '高級脂肪酸のナトリウム塩。親水基と疎水基をもつ。'
  });
  comp('sds', 'ドデシル硫酸ナトリウム（SDS）', 'C12H25NaO4S', 'soap', {
    type: 'condensed',
    lines: ['CH₃(CH₂)₁₁—O—SO₃⁻Na⁺'],
    composition: { C: 12, H: 25, Na: 1, O: 4, S: 1 }
  }, {
    properties: '白色の粉末。水に溶けやすい。',
    uses: '合成洗剤、界面活性剤、電気泳動試薬。',
    nature: '工業的に合成。',
    hazards: '刺激性。',
    pubchem: 3423265, dataStatus: 'class',
    notes: '硫酸エステル型の合成界面活性剤。'
  });

  /* ---- 糖類 ---- */
  comp('glucose', 'グルコース（ブドウ糖）', 'C6H12O6', 'sugar', proj('fischer', 'glucose', { C: 6, H: 12, O: 6 }), {
    properties: '白色の結晶。水に溶けやすい。甘味がある。',
    uses: '生物のエネルギー源。食品・輸液・発酵原料。',
    nature: '果実・蜂蜜・デンプンの加水分解物に含まれる。',
    hazards: '',
    pubchem: 5793, dataStatus: 'full',
    notes: '鎖状と環状は互変異性の関係。α/βはアノマー（立体異性体）で、構造形態そのものが異なるわけではない。',
    figures: [
      {
        structure: proj('fischer', 'glucose', { C: 6, H: 12, O: 6 }, {
          stereo: { c2: 'right', c3: 'left', c4: 'right', c5: 'right' }
        }),
        label: '鎖状D-グルコース（フィッシャー投影式）',
        note: '構造形態: 鎖状'
      },
      {
        structure: proj('haworth', 'glucose', { C: 6, H: 12, O: 6 }, {
          anomer: 'alpha',
          stereo: { c1: 'down', c2: 'down', c3: 'up', c4: 'down', c5ch2oh: 'up' }
        }),
        label: 'α-D-グルコピラノース（ハース投影式）',
        note: '構造形態: 環状（αアノマー）'
      },
      {
        structure: proj('haworth', 'glucose', { C: 6, H: 12, O: 6 }, {
          anomer: 'beta',
          stereo: { c1: 'up', c2: 'down', c3: 'up', c4: 'down', c5ch2oh: 'up' }
        }),
        label: 'β-D-グルコピラノース（ハース投影式）',
        note: '構造形態: 環状（βアノマー）'
      }
    ]
  });
  comp('fructose', 'フルクトース（果糖）', 'C6H12O6', 'sugar', proj('fischer', 'fructose', { C: 6, H: 12, O: 6 }), {
    properties: '白色の結晶。水に溶けやすい。果糖は甘味が強い。',
    uses: '食品甘味料。果実・蜂蜜に含まれる。',
    nature: '果実・蜂蜜に含まれる。',
    hazards: '',
    pubchem: 2723872, dataStatus: 'class',
    notes: '本版では鎖状（フィッシャー投影式）のみ収録。環状フルクトフラノースの投影式は未収録。'
  });
  comp('sucrose', 'スクロース（ショ糖）', 'C12H22O11', 'sugar', {
    type: 'schematic',
    kind: 'sucrose',
    composition: { C: 12, H: 22, O: 11 }
  }, {
    properties: '白色の結晶。水に溶けやすい。',
    uses: '砂糖として食品に利用。',
    nature: 'サトウキビ・テンサイから得られる。',
    hazards: '',
    pubchem: 5988, dataStatus: 'full',
    notes: 'グルコースとフルクトースがα-1,2結合した二糖。図は構成糖の模式図で、立体配置の詳細は省略。'
  });
  comp('maltose', 'マルトース（麦芽糖）', 'C12H22O11', 'sugar', {
    type: 'schematic',
    kind: 'maltose',
    composition: { C: 12, H: 22, O: 11 }
  }, {
    properties: '白色の結晶。水に溶けやすい。',
    uses: '食品・発酵原料。',
    nature: 'デンプンの加水分解で生成。麦芽に含まれる。',
    hazards: '',
    pubchem: 439186, dataStatus: 'class',
    notes: 'グルコース2分子がα-1,4結合した二糖。図は構成糖の模式図。'
  });
  comp('lactose', 'ラクトース（乳糖）', 'C12H22O11', 'sugar', {
    type: 'schematic',
    kind: 'lactose',
    composition: { C: 12, H: 22, O: 11 }
  }, {
    properties: '白色の結晶。水に溶けにくい。',
    uses: '乳製品、医薬品賦形剤。',
    nature: '乳汁に含まれる。',
    hazards: '乳糖不耐症の原因になる。',
    pubchem: 6134, dataStatus: 'class',
    notes: 'ガラクトースとグルコースがβ-1,4結合した二糖。図は構成糖の模式図。'
  });
  comp('starch', 'デンプン（アミロース）', '(C6H10O5)n', 'sugar', {
    type: 'schematic',
    kind: 'starch',
    unitLabel: 'α-グルコース単位',
    linkLabel: 'α-1,4結合（アミロース）',
    composition: { C: 6, H: 10, O: 5 }
  }, {
    properties: '白色の粉末。水に溶けにくい。ヨウ素で青紫色。',
    uses: '食品・糊・発酵原料。',
    nature: '植物の貯蔵多糖。',
    hazards: '',
    dataStatus: 'full', sources: ['textbook'],
    notes: '多数のα-グルコースがα-1,4結合した高分子。図は繰り返し単位の模式図。'
  });
  comp('cellulose', 'セルロース', '(C6H10O5)n', 'sugar', {
    type: 'schematic',
    kind: 'cellulose',
    unitLabel: 'β-グルコース単位',
    linkLabel: 'β-1,4結合',
    composition: { C: 6, H: 10, O: 5 }
  }, {
    properties: '白色の繊維状固体。水に溶けない。',
    uses: '紙・綿・繊維・セルロース誘導体。',
    nature: '植物の細胞壁の主成分。',
    hazards: '',
    dataStatus: 'full', sources: ['textbook'],
    notes: '多数のβ-グルコースがβ-1,4結合した高分子。図は繰り返し単位の模式図。'
  });
  comp('glycogen', 'グリコーゲン', '(C6H10O5)n', 'sugar', {
    type: 'schematic',
    kind: 'glycogen',
    unitLabel: 'α-グルコース単位',
    linkLabel: 'α-1,4結合（分枝あり）',
    composition: { C: 6, H: 10, O: 5 }
  }, {
    properties: '白色の粉末。',
    uses: '食品・研究用。',
    nature: '動物の肝臓・筋肉に蓄えられる貯蔵多糖。',
    hazards: '',
    dataStatus: 'class', sources: ['textbook'],
    notes: 'α-グルコースが鎖状・分枝状につながった高分子。図は繰り返し単位の模式図。'
  });

  /* ---- アミノ酸・ペプチド・タンパク質 ---- */
  comp('glycine', 'グリシン', 'C2H5NO2', 'amino', {
    type: 'multi',
    skeleton: 'methane',
    groups: [
      { at: 0, group: 'nh2', angle: 210 },
      { at: 0, group: 'cooh', angle: 30 }
    ],
    mode: 'expanded'
  }, {
    properties: '白色の結晶。水に溶けやすい。両性を示す。',
    uses: '食品添加物、緩衝剤、化粧品、医薬品。',
    nature: 'タンパク質の構成アミノ酸。',
    hazards: '',
    pubchem: 750, dataStatus: 'full',
    notes: '側鎖Rが水素の最も簡単なアミノ酸。'
  });
  comp('alanine', 'アラニン', 'C3H7NO2', 'amino', {
    type: 'multi',
    skeleton: 'ethane',
    groups: [
      { at: 0, group: 'nh2', angle: 210 },
      { at: 0, group: 'cooh', angle: 30 }
    ],
    mode: 'condensed'
  }, {
    properties: '白色の結晶。水に溶けやすい。両性を示す。',
    uses: '食品添加物、医薬品原料。',
    nature: 'タンパク質の構成アミノ酸。',
    hazards: '',
    pubchem: 5950, dataStatus: 'class',
    notes: '側鎖Rがメチル基のアミノ酸。'
  });
  comp('phenylalanine', 'フェニルアラニン', 'C9H11NO2', 'amino', {
    type: 'condensed',
    lines: ['C₆H₅—CH₂—CH(NH₂)—COOH'],
    composition: { C: 9, H: 11, N: 1, O: 2 }
  }, {
    properties: '白色の結晶。水に溶けにくい。必須アミノ酸。',
    uses: '食品添加物（アスパルテーム原料）、医薬品。',
    nature: 'タンパク質の構成アミノ酸。',
    hazards: 'フェニルケトン尿症の人は摂取に注意。',
    pubchem: 6140, dataStatus: 'class',
    notes: '側鎖Rがベンジル基。簡略構造式で表示。'
  });
  comp('glycylalanine', 'グリシルアラニン', 'C5H10N2O3', 'amino', {
    type: 'condensed',
    lines: ['H₂N—CH₂—CO—NH—CH(CH₃)—COOH'],
    composition: { C: 5, H: 10, N: 2, O: 3 }
  }, {
    properties: '白色の固体。',
    uses: 'ペプチドの例。',
    nature: 'タンパク質の部分構造。',
    hazards: '',
    pubchem: 98153, dataStatus: 'class',
    notes: 'グリシンとアラニンがペプチド結合（—CO—NH—）でつながったジペプチド。簡略構造式。'
  });
  comp('protein', 'タンパク質（ポリペプチド）', 'R依存', 'amino', {
    type: 'polymer',
    unit: '—NH—CH(R)—CO—',
    formula: 'R依存',
    formulaReference: 'C2H3NO'
  }, {
    properties: '高分子。加水分解でアミノ酸を生じる。',
    uses: '食品・生体材料・医薬品。',
    nature: '生物体の主要成分。',
    hazards: '',
    dataStatus: 'class', sources: ['textbook'],
    formulaVariable: true,
    formulaReference: 'C2H3NO',
    formulaDisplay: 'R依存（R=H のとき (C₂H₃NO)ₙ）',
    notes: 'Rはアミノ酸側鎖。一般式はRに依存し、固定の分子式にはならない。R=Hのときポリグリシン。単一の分子ではなく、構成アミノ酸と重合度で分子が変わる。'
  });

  /* ---- 天然高分子 ---- */
  comp('natural-rubber', '天然ゴム（シス-1,4-ポリイソプレン）', '(C5H8)n', 'natural-polymer', {
    type: 'polymer',
    unit: '—CH₂—C(CH₃)=CH—CH₂—',
    unitFormula: 'C5H8',
    formula: '(C5H8)n'
  }, {
    properties: '弾性のある固体。',
    uses: 'タイヤ、ゴム製品。',
    nature: 'パラゴムノキの樹液（ラテックス）から得られる。',
    hazards: 'ラテックスアレルギーの原因になることがある。',
    dataStatus: 'class', sources: ['textbook'],
    notes: 'イソプレンがシス-1,4結合した高分子。図は繰り返し単位。'
  });

  /* ---- 合成高分子 ---- */
  comp('polyethylene', 'ポリエチレン', '(C2H4)n', 'synthetic-polymer', polymer('—CH₂—CH₂—', 'C2H4', '(C2H4)n'), {
    properties: '白色の固体。耐薬品性・電気絶縁性が高い。',
    uses: '袋・容器・フィルム・パイプ・電線被覆。',
    nature: 'エチレンの付加重合で製造。',
    hazards: '',
    dataStatus: 'full', sources: ['textbook'],
    notes: '付加重合。図は繰り返し単位。'
  });
  comp('polypropylene', 'ポリプロピレン', '(C3H6)n', 'synthetic-polymer', polymer('—CH₂—CH(CH₃)—', 'C3H6', '(C3H6)n'), {
    properties: '白色の固体。耐熱性・剛性が高い。',
    uses: '容器・繊維・自動車部品。',
    nature: 'プロピレンの付加重合で製造。',
    hazards: '',
    dataStatus: 'class', sources: ['textbook'],
    notes: '付加重合。図は繰り返し単位。'
  });
  comp('polystyrene', 'ポリスチレン', '(C8H8)n', 'synthetic-polymer', polymer('—CH₂—CH(C₆H₅)—', 'C8H8', '(C8H8)n'), {
    properties: '透明〜白色の固体。',
    uses: '発泡スチロール、容器、家電部品。',
    nature: 'スチレンの付加重合で製造。',
    hazards: '',
    dataStatus: 'class', sources: ['textbook'],
    notes: '付加重合。図は繰り返し単位。'
  });
  comp('pvc', 'ポリ塩化ビニル（PVC）', '(C2H3Cl)n', 'synthetic-polymer', polymer('—CH₂—CHCl—', 'C2H3Cl', '(C2H3Cl)n'), {
    properties: '白色の粉末。可塑剤で軟質にもなる。',
    uses: '塩ビ管、電線被覆、床材。',
    nature: '塩化ビニルの付加重合で製造。',
    hazards: '燃焼時に塩化水素を生じる。',
    dataStatus: 'class', sources: ['textbook'],
    notes: '付加重合。図は繰り返し単位。'
  });
  comp('pet', 'ポリエチレンテレフタラート（PET）', '(C10H8O4)n', 'synthetic-polymer', polymer('—O—CO—C₆H₄—CO—O—CH₂—CH₂—', 'C10H8O4', '(C10H8O4)n'), {
    properties: '白色の固体。透明性・強度が高い。',
    uses: 'ペットボトル、繊維（ポリエステル）。',
    nature: 'テレフタル酸とエチレングリコールの縮重合で製造。',
    hazards: '',
    dataStatus: 'full', sources: ['textbook'],
    notes: '縮重合。図は繰り返し単位。'
  });
  comp('nylon66', 'ナイロン-6,6', '(C12H22N2O2)n', 'synthetic-polymer', polymer('—NH—(CH₂)₆—NH—CO—(CH₂)₄—CO—', 'C12H22N2O2', '(C12H22N2O2)n'), {
    properties: '白色の固体。強靭で耐熱性がある。',
    uses: '繊維、歯車、部品。',
    nature: 'アジピン酸とヘキサメチレンジアミンの縮重合で製造。',
    hazards: '',
    dataStatus: 'full', sources: ['textbook'],
    notes: 'アミド結合（—CO—NH—）をもつ縮重合体。図は繰り返し単位。'
  });
  comp('pva', 'ポリビニルアルコール（PVA）', '(C2H4O)n', 'synthetic-polymer', polymer('—CH₂—CH(OH)—', 'C2H4O', '(C2H4O)n'), {
    properties: '白色の粉末。水に溶ける。',
    uses: '接着剤、フィルム、繊維。',
    nature: '酢酸ビニルの重合後、けん化して製造。',
    hazards: '',
    dataStatus: 'class', sources: ['textbook'],
    notes: '図は繰り返し単位。'
  });

  /* ------------------------------------------------------------------
   * 炭素骨格・化合物の選択リスト
   * ------------------------------------------------------------------ */
  var SKELETONS = [
    { id: 'alkane-c1', section: 'アルカン', label: '炭素数 1', tag: 'C1', ids: ['methane'] },
    { id: 'alkane-c2', section: 'アルカン', label: '炭素数 2', tag: 'C2', ids: ['ethane'] },
    { id: 'alkane-c3', section: 'アルカン', label: '炭素数 3', tag: 'C3', ids: ['propane'] },
    { id: 'alkane-c4', section: 'アルカン', label: '炭素数 4', tag: '2種類', ids: ['butane', 'isobutane'] },
    { id: 'alkane-c5', section: 'アルカン', label: '炭素数 5', tag: '3種類', ids: ['pentane', 'isopentane', 'neopentane'] },

    { id: 'alkene-c2', section: 'アルケン', label: '炭素数 2', tag: 'C2', ids: ['ethene'] },
    { id: 'alkene-c3', section: 'アルケン', label: '炭素数 3', tag: 'C3', ids: ['propene'] },
    { id: 'alkene-c4', section: 'アルケン', label: '炭素数 4', tag: '3種類', ids: ['but-1-ene', 'but-2-ene', 'isobutene'] },

    { id: 'alkyne-c2', section: 'アルキン', label: '炭素数 2', tag: 'C2', ids: ['ethyne'] },
    { id: 'alkyne-c3', section: 'アルキン', label: '炭素数 3', tag: 'C3', ids: ['propyne'] },
    { id: 'alkyne-c4', section: 'アルキン', label: '炭素数 4', tag: '2種類', ids: ['but-1-yne', 'but-2-yne'] },

    { id: 'cyclo-c3', section: '環状炭化水素', label: 'シクロプロパン', tag: 'C3', ids: ['cyclopropane'] },
    { id: 'cyclo-c4', section: '環状炭化水素', label: 'シクロブタン', tag: 'C4', ids: ['cyclobutane'] },
    { id: 'cyclo-c5', section: '環状炭化水素', label: 'シクロペンタン', tag: 'C5', ids: ['cyclopentane'] },
    { id: 'cyclo-c6', section: '環状炭化水素', label: 'シクロヘキサン', tag: 'C6', ids: ['cyclohexane'] },

    { id: 'aromatic-benzene', section: '芳香族炭化水素', label: 'ベンゼン', tag: 'C6', ids: ['benzene'] },
    { id: 'aromatic-naphthalene', section: '芳香族炭化水素', label: 'ナフタレン', tag: 'C10', ids: ['naphthalene'] },

    { id: 'ind-dimethyl-ether', section: 'エーテル・エステル', label: 'ジメチルエーテル', tag: '個別', ids: ['dimethyl-ether'], locked: true },
    { id: 'ind-diethyl-ether', section: 'エーテル・エステル', label: 'ジエチルエーテル', tag: '個別', ids: ['diethyl-ether'], locked: true },
    { id: 'ind-methyl-acetate', section: 'エーテル・エステル', label: '酢酸メチル', tag: '個別', ids: ['methyl-acetate'], locked: true },
    { id: 'ind-ethyl-acetate', section: 'エーテル・エステル', label: '酢酸エチル', tag: '個別', ids: ['ethyl-acetate'], locked: true },

    { id: 'ind-formaldehyde', section: 'アルデヒド・ケトン', label: 'ホルムアルデヒド', tag: '個別', ids: ['formaldehyde'], locked: true },
    { id: 'ind-acetone', section: 'アルデヒド・ケトン', label: 'アセトン', tag: '個別', ids: ['acetone'], locked: true },
    { id: 'ind-butanone', section: 'アルデヒド・ケトン', label: 'ブタン-2-オン', tag: '個別', ids: ['butanone'], locked: true },

    { id: 'ind-formic-acid', section: 'カルボン酸（個別）', label: 'ギ酸', tag: '個別', ids: ['formic-acid'], locked: true },
    { id: 'ind-oxalic-acid', section: 'カルボン酸（個別）', label: 'シュウ酸', tag: '個別', ids: ['oxalic-acid'], locked: true },

    { id: 'ind-styrene', section: '芳香族化合物（個別）', label: 'スチレン', tag: '個別', ids: ['styrene'], locked: true },
    { id: 'ind-salicylic-acid', section: '芳香族化合物（個別）', label: 'サリチル酸', tag: '個別', ids: ['salicylic-acid'], locked: true },
    { id: 'ind-aspirin', section: '芳香族化合物（個別）', label: 'アセチルサリチル酸', tag: '個別', ids: ['aspirin'], locked: true },

    { id: 'ind-stearic-acid', section: '油脂・脂肪酸', label: 'ステアリン酸', tag: '個別', ids: ['stearic-acid'], locked: true },
    { id: 'ind-oleic-acid', section: '油脂・脂肪酸', label: 'オレイン酸', tag: '個別', ids: ['oleic-acid'], locked: true },
    { id: 'ind-linoleic-acid', section: '油脂・脂肪酸', label: 'リノール酸', tag: '個別', ids: ['linoleic-acid'], locked: true },
    { id: 'ind-tristearin', section: '油脂・脂肪酸', label: 'トリステアリン', tag: '個別', ids: ['tristearin'], locked: true },

    { id: 'ind-sodium-stearate', section: 'セッケン・合成洗剤', label: 'ステアリン酸ナトリウム', tag: '個別', ids: ['sodium-stearate'], locked: true },
    { id: 'ind-sds', section: 'セッケン・合成洗剤', label: 'ドデシル硫酸ナトリウム', tag: '個別', ids: ['sds'], locked: true },

    { id: 'ind-glucose', section: '糖類', label: 'グルコース', tag: '個別', ids: ['glucose'], locked: true },
    { id: 'ind-fructose', section: '糖類', label: 'フルクトース', tag: '個別', ids: ['fructose'], locked: true },
    { id: 'ind-sucrose', section: '糖類', label: 'スクロース', tag: '個別', ids: ['sucrose'], locked: true },
    { id: 'ind-maltose', section: '糖類', label: 'マルトース', tag: '個別', ids: ['maltose'], locked: true },
    { id: 'ind-lactose', section: '糖類', label: 'ラクトース', tag: '個別', ids: ['lactose'], locked: true },
    { id: 'ind-starch', section: '糖類', label: 'デンプン', tag: '個別', ids: ['starch'], locked: true },
    { id: 'ind-cellulose', section: '糖類', label: 'セルロース', tag: '個別', ids: ['cellulose'], locked: true },
    { id: 'ind-glycogen', section: '糖類', label: 'グリコーゲン', tag: '個別', ids: ['glycogen'], locked: true },

    { id: 'ind-glycine', section: 'アミノ酸・ペプチド・タンパク質', label: 'グリシン', tag: '個別', ids: ['glycine'], locked: true },
    { id: 'ind-alanine', section: 'アミノ酸・ペプチド・タンパク質', label: 'アラニン', tag: '個別', ids: ['alanine'], locked: true },
    { id: 'ind-phenylalanine', section: 'アミノ酸・ペプチド・タンパク質', label: 'フェニルアラニン', tag: '個別', ids: ['phenylalanine'], locked: true },
    { id: 'ind-glycylalanine', section: 'アミノ酸・ペプチド・タンパク質', label: 'グリシルアラニン', tag: '個別', ids: ['glycylalanine'], locked: true },
    { id: 'ind-protein', section: 'アミノ酸・ペプチド・タンパク質', label: 'タンパク質', tag: '個別', ids: ['protein'], locked: true },

    { id: 'ind-natural-rubber', section: '天然高分子', label: '天然ゴム', tag: '個別', ids: ['natural-rubber'], locked: true },

    { id: 'ind-polyethylene', section: '合成高分子', label: 'ポリエチレン', tag: '個別', ids: ['polyethylene'], locked: true },
    { id: 'ind-polypropylene', section: '合成高分子', label: 'ポリプロピレン', tag: '個別', ids: ['polypropylene'], locked: true },
    { id: 'ind-polystyrene', section: '合成高分子', label: 'ポリスチレン', tag: '個別', ids: ['polystyrene'], locked: true },
    { id: 'ind-pvc', section: '合成高分子', label: 'ポリ塩化ビニル', tag: '個別', ids: ['pvc'], locked: true },
    { id: 'ind-pet', section: '合成高分子', label: 'PET', tag: '個別', ids: ['pet'], locked: true },
    { id: 'ind-nylon66', section: '合成高分子', label: 'ナイロン-6,6', tag: '個別', ids: ['nylon66'], locked: true },
    { id: 'ind-pva', section: '合成高分子', label: 'ポリビニルアルコール', tag: '個別', ids: ['pva'], locked: true }
  ];

  /* ------------------------------------------------------------------
   * 組合せ生成の登録表
   * ------------------------------------------------------------------ */
  var COMBOS = {
    'alkane-c1': {
      none: [{ id: 'methane', from: '' }],
      oh: [{ id: 'methanol', from: '' }],
      cooh: [{ id: 'acetic-acid', from: '' }],
      cho: [{ id: 'ethanal', from: '' }],
      ch3: [{ id: 'ethane', from: '' }],
      cl: [{ id: 'chloromethane', from: '' }]
    },
    'alkane-c2': {
      none: [{ id: 'ethane', from: '' }],
      oh: [{ id: 'ethanol', from: '' }],
      cooh: [{ id: 'propionic-acid', from: '' }],
      cho: [{ id: 'propanal', from: '' }],
      ch3: [{ id: 'propane', from: '' }],
      cl: [{ id: 'chloroethane', from: '' }]
    },
    'alkane-c3': {
      none: [{ id: 'propane', from: '' }],
      oh: [
        { id: 'propan-1-ol', from: 'プロパン' },
        { id: 'propan-2-ol', from: 'プロパン' }
      ],
      cooh: [
        { id: 'butanoic-acid', from: 'プロパン' },
        { id: '2-methylpropanoic-acid', from: 'プロパン' }
      ],
      cho: [
        { id: 'butanal', from: 'プロパン' },
        { id: '2-methylpropanal', from: 'プロパン' }
      ],
      ch3: [
        { id: 'butane', from: 'プロパン' },
        { id: 'isobutane', from: 'プロパン' }
      ],
      cl: [
        { id: '1-chloropropane', from: 'プロパン' },
        { id: '2-chloropropane', from: 'プロパン' }
      ]
    },
    'alkane-c4': {
      none: [
        { id: 'butane', from: '' },
        { id: 'isobutane', from: '' }
      ],
      oh: [
        { id: 'butan-1-ol', from: 'ブタン' },
        { id: 'butan-2-ol', from: 'ブタン' },
        { id: '2-methylpropan-1-ol', from: '2-メチルプロパン' },
        { id: '2-methylpropan-2-ol', from: '2-メチルプロパン' }
      ],
      cooh: [
        { id: 'pentanoic-acid', from: 'ブタン' },
        { id: '2-methylbutanoic-acid', from: 'ブタン' },
        { id: '3-methylbutanoic-acid', from: '2-メチルプロパン' },
        { id: '2,2-dimethylpropanoic-acid', from: '2-メチルプロパン' }
      ],
      cho: [
        { id: 'pentanal', from: 'ブタン' },
        { id: '2-methylbutanal', from: 'ブタン' },
        { id: '3-methylbutanal', from: '2-メチルプロパン' },
        { id: '2,2-dimethylpropanal', from: '2-メチルプロパン' }
      ],
      ch3: [
        { id: 'pentane', from: 'ブタン' },
        { id: 'isopentane', from: 'ブタン' },
        { id: 'neopentane', from: '2-メチルプロパン' }
      ],
      cl: [
        { id: '1-chlorobutane', from: 'ブタン' },
        { id: '2-chlorobutane', from: 'ブタン' },
        { id: '1-chloro-2-methylpropane', from: '2-メチルプロパン' },
        { id: '2-chloro-2-methylpropane', from: '2-メチルプロパン' }
      ]
    },
    'alkane-c5': {
      none: [
        { id: 'pentane', from: '' },
        { id: 'isopentane', from: '' },
        { id: 'neopentane', from: '' }
      ]
    },
    'alkene-c2': {
      none: [{ id: 'ethene', from: '' }],
      ch3: [{ id: 'propene', from: 'エテン' }]
    },
    'alkene-c3': {
      none: [{ id: 'propene', from: '' }],
      ch3: [
        { id: 'but-1-ene', from: 'プロペン' },
        { id: 'but-2-ene', from: 'プロペン' },
        { id: 'isobutene', from: 'プロペン' }
      ]
    },
    'alkene-c4': {
      none: [
        { id: 'but-1-ene', from: '' },
        { id: 'but-2-ene', from: '' },
        { id: 'isobutene', from: '' }
      ]
    },
    'alkyne-c2': {
      none: [{ id: 'ethyne', from: '' }],
      ch3: [{ id: 'propyne', from: 'エチン' }]
    },
    'alkyne-c3': {
      none: [{ id: 'propyne', from: '' }],
      ch3: [
        { id: 'but-1-yne', from: 'プロピン' },
        { id: 'but-2-yne', from: 'プロピン' }
      ]
    },
    'alkyne-c4': {
      none: [
        { id: 'but-1-yne', from: '' },
        { id: 'but-2-yne', from: '' }
      ]
    },
    'cyclo-c3': { none: [{ id: 'cyclopropane', from: '' }] },
    'cyclo-c4': { none: [{ id: 'cyclobutane', from: '' }] },
    'cyclo-c5': { none: [{ id: 'cyclopentane', from: '' }] },
    'cyclo-c6': { none: [{ id: 'cyclohexane', from: '' }] },
    'aromatic-benzene': {
      none: [{ id: 'benzene', from: '' }],
      oh: [{ id: 'phenol', from: 'ベンゼン' }],
      cooh: [{ id: 'benzoic-acid', from: 'ベンゼン' }],
      nh2: [{ id: 'aniline', from: 'ベンゼン' }],
      cho: [{ id: 'benzaldehyde', from: 'ベンゼン' }],
      no2: [{ id: 'nitrobenzene', from: 'ベンゼン' }],
      ch3: [{ id: 'toluene', from: 'ベンゼン' }],
      cl: [{ id: 'chlorobenzene', from: 'ベンゼン' }]
    },
    'aromatic-naphthalene': { none: [{ id: 'naphthalene', from: '' }] }
  };

  // 個別登録の化合物は「追加なし」だけ
  SKELETONS.forEach(function (s) {
    if (s.locked) COMBOS[s.id] = { none: s.ids.map(function (id) { return { id: id, from: '' }; }) };
  });

  /* ------------------------------------------------------------------
   * 未対応の理由
   * ------------------------------------------------------------------ */
  var UNSUPPORTED_SECTION = {
    alkane5: '炭素数5以上のアルカンは骨格のみ収録しています。置換生成は本版未収録です。',
    alkene: 'アルケンへの置換基生成は本版未収録です。付加反応の生成物も本版では扱っていません。',
    alkyne: 'アルキンへの置換基生成は本版未収録です。付加反応の生成物も本版では扱っていません。',
    cyclic: '環状炭化水素への置換基生成は本版未収録です。',
    naphthalene: 'ナフタレン誘導体の置換生成は本版未収録です。'
  };

  function unsupportedReason(skeletonId, groupId) {
    if (skeletonId === 'alkane-c5') return UNSUPPORTED_SECTION.alkane5;
    if (groupId === 'nh2' && /^alkane-/.test(skeletonId)) {
      return '脂肪族アミンは本版未収録です。アニリンとアミノ酸を「その他」に個別収録しています。';
    }
    if (groupId === 'no2' && /^alkane-/.test(skeletonId)) {
      return '脂肪族ニトロ化合物は本版未収録です。ニトロベンゼンはベンゼン＋−NO₂で表示できます。';
    }
    if (skeletonId === 'alkene-c4' && groupId === 'ch3') {
      return '炭素数4のアルケンへのメチル基付加は本版未収録です。C2・C3のアルケンでは表示できます。';
    }
    if (skeletonId === 'alkyne-c4' && groupId === 'ch3') {
      return '炭素数4のアルキンへのメチル基付加は本版未収録です。C2・C3のアルキンでは表示できます。';
    }
    if (/^alkene-/.test(skeletonId)) {
      return 'アルケンへのヒドロキシ基・カルボキシ基などの置換生成は本版未収録です。メチル基はC2・C3のアルケンで表示できます。';
    }
    if (/^alkyne-/.test(skeletonId)) {
      return 'アルキンへのヒドロキシ基・カルボキシ基などの置換生成は本版未収録です。メチル基はC2・C3のアルキンで表示できます。';
    }
    if (/^cyclo-/.test(skeletonId)) return UNSUPPORTED_SECTION.cyclic;
    if (skeletonId === 'aromatic-naphthalene') return UNSUPPORTED_SECTION.naphthalene;
    return 'この組み合わせは本版未収録です。収録台帳で対応範囲を確認してください。';
  }

  function skeletonById(id) {
    for (var i = 0; i < SKELETONS.length; i++) if (SKELETONS[i].id === id) return SKELETONS[i];
    return null;
  }

  function compoundById(id) {
    return COMPOUNDS[id] || null;
  }

  function categoryById(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  function groupById(id) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i];
    return null;
  }

  /* ------------------------------------------------------------------
   * 台帳用の未収録事項
   * ------------------------------------------------------------------ */
  var LEDGER_NOTES = [
    { title: 'エーテル・ケトン・エステル', detail: 'C−O−C、C=O、−COO− は単純な置換基と結合方法が異なるため、組合せ生成ではなく個別の化合物として登録しています。' },
    { title: '幾何異性体（シス/トランス）', detail: 'ブタ-2-エンなどにはシス/トランス異性体がありますが、本版では区別せず構造異性体として1件表示します。' },
    { title: '光学異性体（R/S）', detail: 'アミノ酸・乳酸などの光学異性体は本版の対象外です。' },
    { title: '多置換ベンゼン', detail: 'ベンゼン環への置換基は1つだけ生成します。o-/m-/p- の位置異性体は本版未収録です（サリチル酸・アスピリンは個別登録）。' },
    { title: 'C5以上の置換生成', detail: '炭素数5以上のアルカンは骨格のみ収録し、置換基との組合せ生成は行いません。' },
    { title: '付加反応の生成物', detail: 'エテン＋H₂O→エタノールなどの付加反応は、組合せ生成ではなく個別の化合物として扱っています。' },
    { title: '糖類の環状構造', detail: 'グルコースは鎖状・α・βの3形態を正確に描画します。フルクトースの環状構造は本版未収録、スクロース・マルトース・ラクトースは構成糖の模式図で表示します。' },
    { title: '高分子の立体構造・重合度', detail: '高分子は繰り返し単位と一般式で表示します。重合度nや立体規則性は特定しません。' },
    { title: 'タンパク質の一般式', detail: 'タンパク質は —[NH—CH(R)—CO]— の繰り返し単位をもち、分子式は側鎖Rと重合度に依存します。R=Hの場合の参考単位は C2H3NO です。' },
    { title: '核酸', detail: 'DNA・RNAは高校化学でも触れられますが、構造が複雑なため本版では収録していません。' }
  ];

  return {
    CATEGORIES: CATEGORIES,
    GROUPS: GROUPS,
    SKELETONS: SKELETONS,
    COMPOUNDS: COMPOUNDS,
    COMBOS: COMBOS,
    SOURCES: SOURCES,
    LEDGER_NOTES: LEDGER_NOTES,
    UNSUPPORTED_SECTION: UNSUPPORTED_SECTION,
    unsupportedReason: unsupportedReason,
    skeletonById: skeletonById,
    compoundById: compoundById,
    categoryById: categoryById,
    groupById: groupById
  };
});
