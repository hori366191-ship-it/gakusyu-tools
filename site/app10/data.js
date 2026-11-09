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
    { id: 'alkane', name: '飽和炭化水素', en: 'Saturated hydrocarbons', note: 'アルカン（メタン〜ヘキサンと骨格異性体）と、塩素・臭素・ヨウ素置換体、ニトロアルカンを含む。' },
    { id: 'unsat', name: '不飽和炭化水素', en: 'Unsaturated hydrocarbons', note: 'アルケン・アルキン。アルケンの水素置換で得られるエノール・ハロゲン化物も含む。' },
    { id: 'cyclic', name: '環状炭化水素', en: 'Cyclic hydrocarbons', note: 'シクロプロパン〜シクロヘキサン。' },
    { id: 'alcohol', name: 'アルコール', en: 'Alcohols', note: '−OH をもつ。C1〜C5 の構造異性体と、エチレングリコール・グリセリンなどの多価アルコールを含む。' },
    { id: 'ether', name: 'エーテル', en: 'Ethers', note: 'C−O−C 結合。C2〜C4 のエーテル異性体を収録。' },
    { id: 'aldehyde', name: 'アルデヒド', en: 'Aldehydes', note: '−CHO をもつ。ホルムアルデヒドと C2〜C5 の異性体、アクロレインを含む。' },
    { id: 'ketone', name: 'ケトン', en: 'Ketones', note: 'C=O を鎖の途中にもつ。アセトン・ブタン-2-オン。' },
    { id: 'carboxylic', name: 'カルボン酸', en: 'Carboxylic acids', note: '−COOH をもつ。C1〜C5 の異性体、不飽和酸・ジカルボン酸・ヒドロキシ酸・高級脂肪酸を含む。' },
    { id: 'ester', name: 'エステル', en: 'Esters', note: '−COO− 結合。ギ酸・酢酸・プロピオン酸のエステル、香料エステル、サリチル酸メチルを含む。' },
    { id: 'aromatic', name: '芳香族炭化水素', en: 'Aromatic hydrocarbons', note: 'ベンゼン・トルエン・スチレン・ナフタレン・キシレン・エチルベンゼン・クメン。' },
    { id: 'phenol', name: 'フェノール類', en: 'Phenols', note: 'ベンゼン環に −OH をもつ。フェノール・クレゾール・ジヒドロキシベンゼン・ナフトール・ピクリン酸。' },
    { id: 'aromatic-amine', name: 'アミン（芳香族・脂肪族）', en: 'Amines', note: 'アニリンとその塩、脂肪族アミン、ニトリルを含む。' },
    { id: 'aromatic-other', name: 'その他の芳香族化合物', en: 'Other aromatic compounds', note: 'ベンズアルデヒド・ニトロベンゼン・ニトロトルエン・TNT・スルホン酸・アセトアニリド・ジアゾニウム塩・アゾ染料・フェノールフタレイン・ビスフェノールA。' },
    { id: 'lipid', name: '油脂・脂肪酸', en: 'Fats, oils and fatty acids', note: 'ステアリン酸・パルミチン酸・オレイン酸・リノール酸・リノレン酸・エライジン酸と、トリグリセリド。' },
    { id: 'soap', name: 'セッケン・合成洗剤', en: 'Soaps and synthetic detergents', note: '高級脂肪酸のナトリウム塩、ドデシル硫酸ナトリウム（SDS）、直鎖アルキルベンゼンスルホン酸ナトリウム（LAS）。' },
    { id: 'sugar', name: '糖類', en: 'Sugars', note: '単糖（グルコース・フルクトース・ガラクトース・マンノース・リボース・デオキシリボース）、二糖、多糖、糖アルコール、セルロース誘導体。' },
    { id: 'amino', name: 'アミノ酸・ペプチド・タンパク質', en: 'Amino acids, peptides and proteins', note: '標準20アミノ酸・シスチン・代表的なペプチド・タンパク質。' },
    { id: 'natural-polymer', name: '天然高分子化合物', en: 'Natural polymers', note: '天然ゴム、DNA、RNA。デンプン・セルロース・タンパク質は各分類にも掲載。' },
    { id: 'synthetic-polymer', name: '合成高分子化合物', en: 'Synthetic polymers', note: '付加重合体・縮重合体・共重合体・熱硬化性樹脂・合成ゴム・導電性高分子・単量体を含む。' }
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
      note: '分子式・構造の照合。CIDを確認できた化合物は台帳に記載し、未確認のCIDは記載しない。',
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
    },
    s1: {
      label: '実教出版 Web理科教材「セロビオース」',
      note: 'セロビオースをβ-グルコース2分子の二糖として扱う。',
      url: 'https://www.jikkyo.co.jp/web_ni_link/science2/jmol/cellobiose.html'
    },
    s2: {
      label: '啓林館 高校理科実験「有機化合物の性質」',
      note: 'エタノール・酢酸・酢酸エチル・1-ペンタノール・酢酸ナトリウム・ヨードホルムを扱う実験ページ。',
      url: 'https://www.shinko-keirin.co.jp/keirinkan/tea/kou/jissen/kagaku/201306/index.html'
    },
    s3: {
      label: 'kimika.net アルカン一問一答',
      note: 'メタン〜デカンと塩素化メタン4種を扱う。',
      url: 'https://kimika.net/iy2arukan.html'
    },
    s4: {
      label: 'FromHimuka 飽和炭化水素',
      note: 'メタン〜デカン、エイコサン、塩素化メタン4種を扱う。',
      url: 'https://fromhimuka.com/chemistry/429.html'
    },
    s5: {
      label: 'Try IT 酸無水物',
      note: '酢酸と無水酢酸の関係を扱う。',
      url: 'https://www.try-it.jp/chapters-9788/sections-9894/lessons-9945/point-2/'
    },
    s6: {
      label: 'Try IT アゾカップリング',
      note: '塩化ベンゼンジアゾニウムとナトリウムフェノキシドのカップリングを扱う。',
      url: 'https://www.try-it.jp/chapters-9788/sections-9987/lessons-10077/'
    },
    s7: {
      label: 'Try IT DNAの構造',
      note: 'DNA・RNAと塩基A/G/C/T/U、リボース・デオキシリボースを扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10233/point-2/'
    },
    s8: {
      label: 'Try IT セルロースの性質',
      note: 'セルロース・セロビオース・グルコース・セルラーゼ・セロビアーゼを扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10156/point-2/'
    },
    s9: {
      label: 'Try IT ニンヒドリン反応',
      note: 'ニンヒドリンによるアミノ酸の検出を扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10191/'
    },
    s10: {
      label: 'Try IT 銅アンモニアレーヨン',
      note: 'セルロースからレーヨン・セロファン・キュプラへの加工を扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/'
    },
    s11: {
      label: 'Try IT ビスコースレーヨン',
      note: 'ビスコース法と二硫化炭素を扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/point-2/'
    },
    s12: {
      label: 'Try IT 陽イオン交換樹脂',
      note: 'スチレンとp-ジビニルベンゼンからなる陽イオン交換樹脂を扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10240/lessons-10267/'
    },
    s13: {
      label: 'Try IT 陰イオン交換樹脂',
      note: '陰イオン交換樹脂の構造と交換反応を扱う。',
      url: 'https://www.try-it.jp/chapters-10095/sections-10240/lessons-10267/point-2/'
    },
    s14: {
      label: 'examist タンパク質の分類',
      note: '単純タンパク質・複合タンパク質・誘導タンパク質の分類を扱う。',
      url: 'https://examist.jp/chemistry/natural-polymer/protein/'
    },
    s15: {
      label: 'yorikuwa タンパク質',
      note: 'アルブミン・グロブリン・ケラチン・コラーゲン・フィブロイン・グルテリン・アミラーゼ・カゼイン・ヘモグロビンを扱う。',
      url: 'https://ch.yorikuwa.com/c6417/'
    },
    s16: {
      label: '化学ラボ タンパク質',
      note: 'タンパク質の分類と代表例を扱う。',
      url: 'https://kagakulab.com/protein'
    },
    s17: {
      label: '大学化学 構造決定',
      note: '糖類・酸無水物の構造決定を扱う。',
      url: 'https://daigaku-kagaku.com/2024/06/06/what-you-need-to-know-to-make-structural-decisions/'
    },
    s18: {
      label: '日本化学会「高校化学における芳香族化合物の合成実験」',
      note: '化学と教育 68巻6号 pp.258-261。',
      url: 'https://www.jstage.jst.go.jp/article/kakyoshi/68/6/68_258/_pdf'
    },
    s19: {
      label: '日本化学会「高校化学における染料と染色」',
      note: '化学と教育 68巻10号 pp.416-419。',
      url: 'https://www.jstage.jst.go.jp/article/kakyoshi/68/10/68_416/_pdf'
    },
    s20: {
      label: '日本化学会「高分子らしさを体感する実験」',
      note: '化学と教育 68巻9号 pp.376-379。',
      url: 'https://students.csj.jp/wp-content/uploads/2021/09/ky68-376-newkoza.pdf'
    },
    s21: {
      label: '日本大学 高校教員実践「解熱鎮痛剤」',
      note: '令和5年度 理科教育研究発表会 A-3。',
      url: 'https://www.cst.nihon-u.ac.jp/research/gakujutu/67/pdf/A-3.pdf'
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
      precursors: '',
      reactions: '',
      sources: ['textbook'],
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

  // 外部の公開構造データ（PubChem 2D）から作成した原子・結合の配列を、
  // draw.js の custom 構造へ変換する。原子は [元素, x, y, 水素数, 電荷?, 原子価検証除外?]。
  function customGraph(atoms, bonds, width, height) {
    return {
      type: 'custom',
      atoms: atoms.map(function (a) {
        var o = { el: a[0], x: a[1], y: a[2], h: a[3] || 0 };
        if (a[4]) o.charge = a[4];
        if (a[5]) o.skipValence = true;
        return o;
      }),
      bonds: bonds.map(function (b) { return { a: b[0], b: b[1], order: b[2] || 1 }; }),
      mode: 'condensed',
      width: width || 460,
      height: height || 340
    };
  }

  var SUBSCRIPT_MAP = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    'ₙ': 'n', '⁺': '', '⁻': '', '⁰': '', '¹': '', '²': '', '³': ''
  };

  // 簡略構造式の文字列から組成を独立に計算する。
  // 例: 'CH₃(CH₂)₁₆COOH' -> {C:18,H:36,O:2}
  // R や重合度 n を含む可変組成は null（自動検証しない）。
  function compositionFromCondensedText(text) {
    var s = String(text == null ? '' : text);
    // 日本語の注記（（シス形）など）を除去
    s = s.replace(/（[^）]*）/g, '');
    s = s.replace(/\([^)]*[\u3040-\u30ff\u4e00-\u9fff][^)]*\)/g, '');
    var buf = '';
    for (var ci = 0; ci < s.length; ci++) {
      var ch = s.charAt(ci);
      buf += (SUBSCRIPT_MAP[ch] != null ? SUBSCRIPT_MAP[ch] : ch);
    }
    s = buf;
    // 結合線・電荷・区切りを除去（元素記号と括弧・数字だけを残す）
    s = s.replace(/[—–\-−=≡/\\+\s,，、。′]/g, '');
    s = s.replace(/^\d+/, ''); // 1-ナフトール等の位置番号
    if (!s) return null;
    var i = 0;
    var stack = [{}];
    function add(el, n) {
      stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + n;
    }
    function merge(group, mult) {
      Object.keys(group).forEach(function (el) {
        add(el, group[el] * mult);
      });
    }
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === '(') {
        stack.push({});
        i++;
      } else if (ch === ')') {
        if (stack.length < 2) return null;
        var group = stack.pop();
        i++;
        var num = '';
        while (i < s.length && /\d/.test(s.charAt(i))) { num += s.charAt(i); i++; }
        merge(group, num ? parseInt(num, 10) : 1);
      } else if (/[A-Z]/.test(ch)) {
        var el = ch;
        i++;
        if (i < s.length && /[a-z]/.test(s.charAt(i))) {
          el += s.charAt(i);
          i++;
        }
        var count = '';
        while (i < s.length && /\d/.test(s.charAt(i))) { count += s.charAt(i); i++; }
        add(el, count ? parseInt(count, 10) : 1);
      } else if (/[a-z]/.test(ch)) {
        // n, m, x, R などの可変記号は独立検証できない
        return null;
      } else if (/\d/.test(ch)) {
        return null;
      } else {
        return null;
      }
    }
    if (stack.length !== 1) return null;
    var out = stack[0];
    return Object.keys(out).length ? out : null;
  }

  function compositionFromCondensedLines(lines) {
    var total = {};
    (lines || []).forEach(function (line) {
      var part = compositionFromCondensedText(line);
      if (!part) { total = null; return; }
      if (!total) return;
      Object.keys(part).forEach(function (el) {
        total[el] = (total[el] || 0) + part[el];
      });
    });
    return total;
  }

  function compositionFromRingSub(subs) {
    var positions = {};
    var counts = { C: 6, H: 6 };
    var ok = true;
    (subs || []).forEach(function (sub) {
      if (!sub || sub.at == null || sub.at < 0 || sub.at > 5 || positions[sub.at]) { ok = false; return; }
      positions[sub.at] = true;
      counts.H -= 1;
      var part = compositionFromCondensedText(sub.label);
      if (!part) { ok = false; return; }
      Object.keys(part).forEach(function (el) {
        counts[el] = (counts[el] || 0) + part[el];
      });
    });
    return ok ? counts : null;
  }

  function cond(id, name, formula, category, lines, extra) {
    var e = extra || {};
    if (!e.sources) e.sources = ['textbook'];
    var structure = { type: 'condensed', lines: lines, composition: compositionFromCondensedLines(lines) };
    if (e.structureExtra) {
      Object.keys(e.structureExtra).forEach(function (k) { structure[k] = e.structureExtra[k]; });
      delete e.structureExtra;
    }
    return comp(id, name, formula, category, structure, e);
  }

  function ringSub(id, name, formula, category, subs, extra) {
    var e = extra || {};
    if (!e.sources) e.sources = ['textbook'];
    return comp(id, name, formula, category, {
      type: 'ring-sub',
      subs: subs,
      composition: compositionFromRingSub(subs)
    }, e);
  }

  function poly(id, name, formula, unit, unitFormula, category, extra) {
    var e = extra || {};
    if (!e.sources) e.sources = ['textbook'];
    return comp(id, name, formula, category, polymer(unit, unitFormula, formula), e);
  }

  function ringBond(a, b, order, cx, cy) {
    return { a: a, b: b, order: order, ring: true, ringCenter: { x: cx, y: cy } };
  }

  // ナフタレン環（10炭素）の指定位置に OH を置いた構造。
  // 位置1は原子1、位置2は原子2に対応する。
  function naphtholStructure(position) {
    var xy = [
      [180, 95], [130, 67], [80, 95], [80, 165], [130, 193], [180, 165],
      [230, 193], [280, 165], [280, 95], [230, 67]
    ];
    var hs = [0, 1, 1, 1, 1, 0, 1, 1, 1, 1];
    var atoms = xy.map(function (p, i) {
      return { el: 'C', x: p[0], y: p[1], h: hs[i], ring: true };
    });
    var idx = position === 1 ? 1 : 2;
    atoms[idx].h = 0;
    var oxy = position === 1 ? { x: 95, y: 36 } : { x: 45, y: 70 };
    atoms.push({ el: 'O', x: oxy.x, y: oxy.y, h: 1 });
    var bonds = [
      ringBond(0, 1, 2, 130, 127), ringBond(1, 2, 1, 130, 127), ringBond(2, 3, 2, 130, 127),
      ringBond(3, 4, 1, 130, 127), ringBond(4, 5, 2, 130, 127), ringBond(5, 0, 1, 130, 127),
      ringBond(0, 9, 1, 230, 127), ringBond(9, 8, 2, 230, 127), ringBond(8, 7, 1, 230, 127),
      ringBond(7, 6, 2, 230, 127), ringBond(6, 5, 1, 230, 127),
      { a: idx, b: 10, order: 1 }
    ];
    return { type: 'custom', atoms: atoms, bonds: bonds, mode: 'condensed', width: 420, height: 320 };
  }

  // フェノールフタレインのラクトン環を含む構造。
  // 中央のsp3炭素に2つの4-ヒドロキシフェニル基とフタリド環が結合する。
  function phenolphthaleinStructure() {
    var atoms = [
      { el: 'C', x: 152, y: 105, h: 0, ring: true },
      { el: 'C', x: 126, y: 60, h: 1, ring: true },
      { el: 'C', x: 74, y: 60, h: 1, ring: true },
      { el: 'C', x: 48, y: 105, h: 0, ring: true },
      { el: 'C', x: 74, y: 150, h: 1, ring: true },
      { el: 'C', x: 126, y: 150, h: 1, ring: true },
      { el: 'C', x: 152, y: 245, h: 0, ring: true },
      { el: 'C', x: 126, y: 200, h: 1, ring: true },
      { el: 'C', x: 74, y: 200, h: 1, ring: true },
      { el: 'C', x: 48, y: 245, h: 0, ring: true },
      { el: 'C', x: 74, y: 290, h: 1, ring: true },
      { el: 'C', x: 126, y: 290, h: 1, ring: true },
      { el: 'C', x: 293, y: 140, h: 0, ring: true },
      { el: 'C', x: 319, y: 95, h: 0, ring: true },
      { el: 'C', x: 371, y: 95, h: 1, ring: true },
      { el: 'C', x: 397, y: 140, h: 1, ring: true },
      { el: 'C', x: 371, y: 185, h: 1, ring: true },
      { el: 'C', x: 319, y: 185, h: 1, ring: true },
      { el: 'C', x: 225, y: 175, h: 0 },
      { el: 'C', x: 300, y: 60, h: 0 },
      { el: 'O', x: 250, y: 105, h: 0 },
      { el: 'O', x: 300, y: 10, h: 0 },
      { el: 'O', x: 20, y: 105, h: 1 },
      { el: 'O', x: 20, y: 245, h: 1 }
    ];
    var bonds = [
      ringBond(0, 1, 1, 100, 105), ringBond(1, 2, 2, 100, 105), ringBond(2, 3, 1, 100, 105),
      ringBond(3, 4, 2, 100, 105), ringBond(4, 5, 1, 100, 105), ringBond(5, 0, 2, 100, 105),
      ringBond(6, 7, 1, 100, 245), ringBond(7, 8, 2, 100, 245), ringBond(8, 9, 1, 100, 245),
      ringBond(9, 10, 2, 100, 245), ringBond(10, 11, 1, 100, 245), ringBond(11, 6, 2, 100, 245),
      ringBond(12, 13, 2, 345, 140), ringBond(13, 14, 1, 345, 140), ringBond(14, 15, 2, 345, 140),
      ringBond(15, 16, 1, 345, 140), ringBond(16, 17, 2, 345, 140), ringBond(17, 12, 1, 345, 140),
      { a: 18, b: 0, order: 1 }, { a: 18, b: 6, order: 1 }, { a: 18, b: 12, order: 1 },
      { a: 18, b: 20, order: 1 },
      { a: 19, b: 13, order: 1 }, { a: 19, b: 20, order: 1 }, { a: 19, b: 21, order: 2 },
      { a: 22, b: 3, order: 1 }, { a: 23, b: 9, order: 1 }
    ];
    return { type: 'custom', atoms: atoms, bonds: bonds, mode: 'condensed', width: 460, height: 340 };
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
    nature: '一部の植物・発酵食品に存在する。',
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
    nature: '工業的に合成。',
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
    nature: 'アルコール発酵や糖の加熱分解で生成する。',
    hazards: '可燃性・刺激性。',
    pubchem: 527, dataStatus: 'class'
  });
  sub('butanal', 'ブタナール（酪酸アルデヒド）', 'C4H8O', 'aldehyde', 'propane', 0, 'cho', {
    properties: '無色の液体。刺激臭。',
    uses: '樹脂・香料原料。',
    nature: '発酵食品・植物に存在する。',
    hazards: '可燃性・刺激性。',
    pubchem: 261, dataStatus: 'class'
  });
  sub('2-methylpropanal', '2-メチルプロパナール（イソブチルアルデヒド）', 'C4H8O', 'aldehyde', 'propane', 1, 'cho', {
    properties: '無色の液体。',
    uses: '樹脂・香料原料。',
    nature: '工業的に合成。',
    hazards: '可燃性・刺激性。',
    pubchem: 6561, dataStatus: 'class'
  });
  sub('pentanal', 'ペンタナール（吉草アルデヒド）', 'C5H10O', 'aldehyde', 'butane', 0, 'cho', {
    properties: '無色の液体。',
    uses: '香料・樹脂原料。',
    nature: '植物・発酵食品に存在する。',
    hazards: '可燃性・刺激性。',
    pubchem: 8063, dataStatus: 'class'
  });
  sub('2-methylbutanal', '2-メチルブタナール', 'C5H10O', 'aldehyde', 'butane', 1, 'cho', {
    properties: '無色の液体。',
    uses: '香料原料。',
    nature: '一部の植物・発酵食品に存在する。',
    hazards: '可燃性・刺激性。',
    pubchem: 7284, dataStatus: 'minimal'
  });
  sub('3-methylbutanal', '3-メチルブタナール（イソ吉草アルデヒド）', 'C5H10O', 'aldehyde', 'isobutane', 1, 'cho', {
    properties: '無色の液体。',
    uses: '香料原料。',
    nature: '発酵食品・植物に存在する。',
    hazards: '可燃性・刺激性。',
    pubchem: 11552, dataStatus: 'minimal'
  });
  sub('2,2-dimethylpropanal', '2,2-ジメチルプロパナール（ピバルアルデヒド）', 'C5H10O', 'aldehyde', 'isobutane', 0, 'cho', {
    properties: '無色の液体。',
    uses: '有機合成原料。',
    nature: '工業的に合成。',
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
    hazards: '通常の取扱いでは強い危険性は知られていない。',
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
    notes: '鎖状（フィッシャー投影式）とα/β-フルクトフラノース（ハース投影式）を収録。鎖状と環状は互変異性の関係。',
    figures: [
      {
        structure: proj('fischer', 'fructose', { C: 6, H: 12, O: 6 }, {
          ketose: true, stereo: { c3: 'left', c4: 'right', c5: 'right' }
        }),
        label: '鎖状D-フルクトース（フィッシャー投影式）',
        note: '構造形態: 鎖状（ケトース）'
      },
      {
        structure: proj('haworth', 'fructose', { C: 6, H: 12, O: 6 }, {
          ring: 'furanose', anomer: 'alpha',
          stereo: { c1ch2oh: 'up', c2: 'down', c3: 'up', c4: 'down', c5ch2oh: 'up' }
        }),
        label: 'α-D-フルクトフラノース（ハース投影式）',
        note: '構造形態: 環状（αアノマー）'
      },
      {
        structure: proj('haworth', 'fructose', { C: 6, H: 12, O: 6 }, {
          ring: 'furanose', anomer: 'beta',
          stereo: { c1ch2oh: 'down', c2: 'up', c3: 'up', c4: 'down', c5ch2oh: 'up' }
        }),
        label: 'β-D-フルクトフラノース（ハース投影式）',
        note: '構造形態: 環状（βアノマー）'
      }
    ]
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
    notes: 'グルコースとフルクトースがα-1,2結合した二糖。図は糖環を六員環で簡略化した模式図で、フルクトースは実際には五員環（フラノース）だが図では六員環で表す。立体配置の詳細は省略。'
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
    notes: 'グルコース2分子がα-1,4結合した二糖。図は糖環を六員環で簡略化した模式図。'
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
    notes: 'ガラクトースとグルコースがβ-1,4結合した二糖。図は糖環を六員環で簡略化した模式図。'
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
      { at: 0, group: 'cooh', angle: 90 }
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
    notes: '図は繰り返し単位。ビニロンはPVAを部分ホルマール化した別物質。'
  });
  comp('vinylon', 'ビニロン（部分ホルマール化ポリビニルアルコール）', '組成依存', 'synthetic-polymer', {
    type: 'schematic', kind: 'vinylon', composition: null
  }, {
    properties: '白色の繊維。水に不溶。',
    uses: '衣料・漁網・ロープ・タイヤコード。',
    nature: 'ポリビニルアルコール（PVA）をホルムアルデヒドで部分ホルマール化して製造。',
    hazards: '可燃性。',
    formulaVariable: true,
    formulaDisplay: '組成依存（ホルマール化度に依存。アセタール環と残存OHをもち、水不溶性）',
    notes: 'PVAのOHの一部をホルムアルデヒドでアセタール化した繊維。アセタール環と残存OHをもち、ホルマール化度が高いと水に溶けにくくなる。PVAとは別物質。',
    subcategory: 'ビニロン',
    precursors: 'ポリビニルアルコールとホルムアルデヒドのアセタール化。',
    reactions: 'ホルマール化でアセタール環を形成。残存OHが親水性を保つ。',
    dataStatus: 'class', sources: ['textbook']
  });

  /* ==================================================================
   * 追加収録（高校化学の標準範囲の体系化）
   * ================================================================== */

  /* ---- 多価アルコール・ヒドロキシ酸 ---- */
  comp('ethylene-glycol', 'エチレングリコール（エタン-1,2-ジオール）', 'C2H6O2', 'alcohol', {
    type: 'custom',
    atoms: [
      { el: 'O', x: 60, y: 110, h: 1 },
      { el: 'C', x: 120, y: 90, h: 2 },
      { el: 'C', x: 200, y: 90, h: 2 },
      { el: 'O', x: 260, y: 110, h: 1 }
    ],
    bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 1 }],
    mode: 'condensed', width: 360, height: 230
  }, {
    properties: '無色・無臭の粘性液体。水と任意の割合で混ざる。',
    uses: '不凍液、冷却水、PET・ポリエステル原料。',
    nature: '工業的に合成。',
    hazards: '飲用すると有毒。',
    subcategory: '多価アルコール',
    precursors: 'エチレン＋水（工業的には酸化エチレンの水和）',
    reactions: '二価アルコール。酸化でグリコール酸・シュウ酸へ。PETの縮重合原料。',
    dataStatus: 'class'
  });
  comp('glycerol', 'グリセリン（プロパン-1,2,3-トリオール）', 'C3H8O3', 'alcohol', {
    type: 'custom',
    atoms: [
      { el: 'O', x: 55, y: 130, h: 1 },
      { el: 'C', x: 110, y: 105, h: 2 },
      { el: 'C', x: 175, y: 135, h: 1 },
      { el: 'O', x: 175, y: 65, h: 1 },
      { el: 'C', x: 240, y: 105, h: 2 },
      { el: 'O', x: 295, y: 130, h: 1 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 1 },
      { a: 2, b: 4, order: 1 }, { a: 4, b: 5, order: 1 }
    ],
    mode: 'condensed', width: 380, height: 250
  }, {
    properties: '無色・無臭の粘性液体。水・エタノールと混ざる。',
    uses: '保湿剤、医薬品・化粧品、食品添加物、ニトログリセリン原料。',
    nature: '油脂のけん化（加水分解）で得られる。',
    hazards: '刺激性は低いが、大量摂取で下痢。',
    subcategory: '多価アルコール',
    precursors: '油脂のけん化副生物。プロピレンから工業合成も。',
    reactions: '三価アルコール。硝酸エステル化でニトログリセリン、脂肪酸とエステル化で油脂。',
    dataStatus: 'full'
  });
  comp('propylene-glycol', 'プロピレングリコール（プロパン-1,2-ジオール）', 'C3H8O2', 'alcohol', {
    type: 'custom',
    atoms: [
      { el: 'C', x: 50, y: 130, h: 3 },
      { el: 'C', x: 115, y: 100, h: 1 },
      { el: 'O', x: 115, y: 40, h: 1 },
      { el: 'C', x: 180, y: 130, h: 2 },
      { el: 'O', x: 245, y: 155, h: 1 }
    ],
    bonds: [
      { a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 },
      { a: 1, b: 3, order: 1 }, { a: 3, b: 4, order: 1 }
    ],
    mode: 'condensed', width: 360, height: 230
  }, {
    properties: '無色・無臭の粘性液体。水と混ざる。',
    uses: '食品添加物、保湿剤、不凍液、医薬品溶剤。',
    nature: '工業的に合成。',
    hazards: '大量摂取で代謝性アシドーシスのおそれ。',
    subcategory: '多価アルコール',
    precursors: 'プロピレンオキシドの水和。',
    reactions: '二価アルコール。酸化で乳酸・ピルビン酸へ。',
    dataStatus: 'class'
  });
  cond('lactic-acid', '乳酸（2-ヒドロキシプロパン酸）', 'C3H6O3', 'carboxylic', ['CH₃—CH(OH)—COOH'], {
    properties: '無色〜淡黄色の粘性液体。水に溶ける。',
    uses: '食品の酸味料・保存料、化粧品、ポリ乳酸（PLA）原料。',
    nature: '乳酸菌による発酵で生成。筋肉中にも生じる。',
    hazards: '濃厚液は刺激性。',
    subcategory: 'ヒドロキシ酸',
    precursors: 'グルコースの乳酸発酵、またはプロピレングリコールの酸化。',
    reactions: 'ヒドロキシ酸。分子内脱水でラクチド、縮重合でポリ乳酸。',
    dataStatus: 'full'
  });

  /* ---- C5 アルコール（8種類） ---- */
  sub('pentan-1-ol', 'ペンタン-1-オール（1-ペンタノール）', 'C5H12O', 'alcohol', 'pentane', 0, 'oh', {
    properties: '無色の液体。水にやや溶けにくい。', uses: '溶剤、香料原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('pentan-2-ol', 'ペンタン-2-オール（2-ペンタノール）', 'C5H12O', 'alcohol', 'pentane', 1, 'oh', {
    properties: '無色の液体。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('pentan-3-ol', 'ペンタン-3-オール（3-ペンタノール）', 'C5H12O', 'alcohol', 'pentane', 2, 'oh', {
    properties: '無色の液体。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('2-methylbutan-1-ol', '2-メチルブタン-1-オール', 'C5H12O', 'alcohol', 'isopentane', 0, 'oh', {
    properties: '無色の液体。', uses: '溶剤、香料原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('2-methylbutan-2-ol', '2-メチルブタン-2-オール（tert-アミルアルコール）', 'C5H12O', 'alcohol', 'isopentane', 1, 'oh', {
    properties: '無色の液体。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('3-methylbutan-1-ol', '3-メチルブタン-1-オール（イソアミルアルコール）', 'C5H12O', 'alcohol', 'isopentane', 3, 'oh', {
    properties: '無色の液体。果実様のにおい。', uses: '酢酸イソアミルなどの香料原料、溶剤。',
    nature: '発酵液中に微量存在。', hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('3-methylbutan-2-ol', '3-メチルブタン-2-オール', 'C5H12O', 'alcohol', 'isopentane', 2, 'oh', {
    properties: '無色の液体。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  sub('2,2-dimethylpropan-1-ol', '2,2-ジメチルプロパン-1-オール（ネオペンチルアルコール）', 'C5H12O', 'alcohol', 'neopentane', 1, 'oh', {
    properties: '白色の固体。昇華性がある。', uses: '香料・樹脂原料、可塑剤。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });

  /* ---- C6 アルカン（5種類） ---- */
  skel('hexane', 'ヘキサン', 'C6H14', 'alkane', 'hexane', {
    properties: '無色の可燃性液体。水にほとんど溶けない。', uses: '溶媒、食用油の抽出、燃料。',
    nature: '石油に含まれる。', hazards: '可燃性・神経毒性。', dataStatus: 'class'
  });
  skel('2-methylpentane', '2-メチルペンタン（イソヘキサン）', 'C6H14', 'alkane', '2-methylpentane', {
    properties: '無色の可燃性液体。', uses: '溶媒、燃料成分。', nature: '石油に含まれる。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  skel('3-methylpentane', '3-メチルペンタン', 'C6H14', 'alkane', '3-methylpentane', {
    properties: '無色の可燃性液体。', uses: '溶媒、燃料成分。', nature: '石油に含まれる。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  skel('2,2-dimethylbutane', '2,2-ジメチルブタン（ネオヘキサン）', 'C6H14', 'alkane', '2,2-dimethylbutane', {
    properties: '無色の可燃性液体。', uses: '燃料、溶媒。', nature: '石油に含まれる。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  skel('2,3-dimethylbutane', '2,3-ジメチルブタン（ジイソプロピル）', 'C6H14', 'alkane', '2,3-dimethylbutane', {
    properties: '無色の可燃性液体。', uses: '燃料、溶媒。', nature: '石油に含まれる。',
    hazards: '可燃性。', dataStatus: 'class'
  });

  /* ---- エーテル異性体 ---- */
  cond('methoxyethane', 'メトキシエタン（メチルエチルエーテル）', 'C3H8O', 'ether', ['CH₃—O—CH₂—CH₃'], {
    properties: '無色の揮発性液体。引火しやすい。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '引火性・麻酔作用。', dataStatus: 'class'
  });
  cond('1-methoxypropane', '1-メトキシプロパン（メチルプロピルエーテル）', 'C4H10O', 'ether', ['CH₃—O—CH₂—CH₂—CH₃'], {
    properties: '無色の揮発性液体。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '引火性。', dataStatus: 'class'
  });
  cond('2-methoxypropane', '2-メトキシプロパン（メチルイソプロピルエーテル）', 'C4H10O', 'ether', ['CH₃—O—CH(CH₃)₂'], {
    properties: '無色の揮発性液体。', uses: '溶剤、化学原料。', nature: '工業的に合成。',
    hazards: '引火性。', dataStatus: 'class'
  });

  /* ---- 脂肪族アミン・ニトリル・ニトロ化合物・ハロゲン化物 ---- */
  cond('methylamine', 'メチルアミン（メタンアミン）', 'CH5N', 'aromatic-amine', ['CH₃—NH₂'], {
    properties: '無色の気体。アンモニア様のにおい。水に溶け、塩基性。', uses: '医薬・農薬・染料原料。',
    nature: '工業的に合成。', hazards: '可燃性・腐食性・刺激性。', subcategory: '脂肪族アミン',
    precursors: 'メタノールとアンモニアの反応。', reactions: '弱塩基。酸と塩をつくる。', dataStatus: 'class'
  });
  cond('ethylamine', 'エチルアミン（エタンアミン）', 'C2H7N', 'aromatic-amine', ['CH₃—CH₂—NH₂'], {
    properties: '無色の液体。アンモニア様のにおい。塩基性。', uses: '医薬・農薬・染料原料。',
    nature: '工業的に合成。', hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン',
    precursors: 'エタノールとアンモニアの反応。', reactions: '弱塩基。酸と塩をつくる。', dataStatus: 'class'
  });
  cond('propylamine', 'プロピルアミン（プロパン-1-アミン）', 'C3H9N', 'aromatic-amine', ['CH₃—CH₂—CH₂—NH₂'], {
    properties: '無色の液体。塩基性。', uses: '医薬・農薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('isopropylamine', 'イソプロピルアミン（プロパン-2-アミン）', 'C3H9N', 'aromatic-amine', ['(CH₃)₂CH—NH₂'], {
    properties: '無色の液体。塩基性。', uses: '医薬・農薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('dimethylamine', 'ジメチルアミン', 'C2H7N', 'aromatic-amine', ['CH₃—NH—CH₃'], {
    properties: '無色の気体。塩基性。', uses: '医薬・農薬・界面活性剤原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('trimethylamine', 'トリメチルアミン', 'C3H9N', 'aromatic-amine', ['N(CH₃)₃'], {
    properties: '無色の気体。魚臭がある。塩基性。', uses: '化学原料、魚臭の原因物質。', nature: '魚類の腐敗で生成。',
    hazards: '可燃性・刺激性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('diethylamine', 'ジエチルアミン', 'C4H11N', 'aromatic-amine', ['(C₂H₅)₂NH'], {
    properties: '無色の液体。塩基性。', uses: '医薬・農薬・ゴム薬品原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('triethylamine', 'トリエチルアミン', 'C6H15N', 'aromatic-amine', ['N(C₂H₅)₃'], {
    properties: '無色の液体。塩基性。', uses: '有機合成の塩基、触媒。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('butan-1-amine', 'ブタン-1-アミン（n-ブチルアミン）', 'C4H11N', 'aromatic-amine', ['CH₃—CH₂—CH₂—CH₂—NH₂'], {
    properties: '無色の液体。塩基性。', uses: '医薬・農薬・ゴム薬品原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('butan-2-amine', 'ブタン-2-アミン（sec-ブチルアミン）', 'C4H11N', 'aromatic-amine', ['CH₃—CH₂—CH(NH₂)—CH₃'], {
    properties: '無色の液体。塩基性。', uses: '医薬・農薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('2-methylpropan-1-amine', '2-メチルプロパン-1-アミン（イソブチルアミン）', 'C4H11N', 'aromatic-amine', ['(CH₃)₂CH—CH₂—NH₂'], {
    properties: '無色の液体。塩基性。', uses: '医薬・農薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('2-methylpropan-2-amine', '2-メチルプロパン-2-アミン（tert-ブチルアミン）', 'C4H11N', 'aromatic-amine', ['(CH₃)₃C—NH₂'], {
    properties: '無色の液体。塩基性。', uses: '医薬・ゴム薬品原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('n-methylpropan-1-amine', 'N-メチルプロパン-1-アミン', 'C4H11N', 'aromatic-amine', ['CH₃—NH—CH₂—CH₂—CH₃'], {
    properties: '無色の液体。塩基性。', uses: '化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('n-methylpropan-2-amine', 'N-メチルプロパン-2-アミン', 'C4H11N', 'aromatic-amine', ['CH₃—NH—CH(CH₃)₂'], {
    properties: '無色の液体。塩基性。', uses: '化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('n,n-dimethylethanamine', 'N,N-ジメチルエタンアミン', 'C4H11N', 'aromatic-amine', ['(CH₃)₂N—CH₂—CH₃'], {
    properties: '無色の液体。塩基性。', uses: '化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・腐食性。', subcategory: '脂肪族アミン', dataStatus: 'class'
  });
  cond('nitromethane', 'ニトロメタン', 'CH3NO2', 'alkane', ['CH₃—NO₂'], {
    properties: '無色の液体。やや甘いにおい。', uses: '溶剤、燃料添加剤、爆薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・爆発性。', subcategory: 'ニトロ化合物', dataStatus: 'class'
  });
  cond('acetonitrile', 'アセトニトリル（エタンニトリル）', 'C2H3N', 'aromatic-amine', ['CH₃—C≡N'], {
    properties: '無色の液体。ややエーテル様のにおい。', uses: '溶媒、HPLC移動相、医薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・有毒。', subcategory: 'ニトリル', dataStatus: 'class'
  });
  cond('propanenitrile', 'プロパンニトリル（プロピオニトリル）', 'C3H5N', 'aromatic-amine', ['CH₃—CH₂—C≡N'], {
    properties: '無色の液体。', uses: '溶媒、化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・有毒。', subcategory: 'ニトリル', dataStatus: 'class'
  });
  cond('butanenitrile', 'ブタンニトリル（ブチロニトリル）', 'C4H7N', 'aromatic-amine', ['CH₃—CH₂—CH₂—C≡N'], {
    properties: '無色の液体。', uses: '溶媒、化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・有毒。', subcategory: 'ニトリル', dataStatus: 'class'
  });
  cond('benzonitrile', 'ベンゾニトリル（シアノベンゼン）', 'C7H5N', 'aromatic-other', ['C₆H₅—C≡N'], {
    properties: '無色の液体。アーモンド様のにおい。', uses: '医薬・染料原料、溶媒。', nature: '工業的に合成。',
    hazards: '有毒。', subcategory: 'ニトリル', dataStatus: 'class'
  });
  cond('bromoethane', 'ブロモエタン（臭化エチル）', 'C2H5Br', 'alkane', ['CH₃—CH₂—Br'], {
    properties: '無色の液体。', uses: '有機合成原料、冷媒（旧）。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: 'ハロゲン化物', dataStatus: 'class'
  });
  cond('1-bromopropane', '1-ブロモプロパン', 'C3H7Br', 'alkane', ['CH₃—CH₂—CH₂—Br'], {
    properties: '無色の液体。', uses: '有機合成原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: 'ハロゲン化物', dataStatus: 'class'
  });
  cond('2-bromopropane', '2-ブロモプロパン（イソプロピルブロミド）', 'C3H7Br', 'alkane', ['(CH₃)₂CH—Br'], {
    properties: '無色の液体。', uses: '有機合成原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: 'ハロゲン化物', dataStatus: 'class'
  });
  cond('iodoethane', 'ヨードエタン（ヨウ化エチル）', 'C2H5I', 'alkane', ['CH₃—CH₂—I'], {
    properties: '無色〜淡黄色の液体。光で分解しやすい。', uses: '有機合成原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: 'ハロゲン化物', dataStatus: 'class'
  });

  /* ---- 不飽和カルボン酸・ジカルボン酸・ヒドロキシ酸 ---- */
  cond('acrylic-acid', 'アクリル酸（プロペン酸）', 'C3H4O2', 'carboxylic', ['CH₂=CH—COOH'], {
    properties: '無色の液体。刺激臭。水に溶ける。', uses: 'アクリル樹脂・高吸水性ポリマー原料。',
    nature: '工業的に合成。', hazards: '腐食性・可燃性。', precursors: 'プロペンの酸化。',
    reactions: '付加重合でポリアクリル酸。', dataStatus: 'class'
  });
  cond('methacrylic-acid', 'メタクリル酸（2-メチルプロペン酸）', 'C4H6O2', 'carboxylic', ['CH₂=C(CH₃)—COOH'], {
    properties: '無色の液体。刺激臭。', uses: 'PMMA・塗料原料。', nature: '工業的に合成。',
    hazards: '腐食性・可燃性。', precursors: 'アセトンとシアン化水素から。',
    reactions: '付加重合でポリメタクリル酸メチル。', dataStatus: 'class'
  });
  cond('maleic-acid', 'マレイン酸（シス-ブテン二酸）', 'C4H4O4', 'carboxylic', ['HOOC—CH=CH—COOH（シス形）'], {
    properties: '白色の結晶。水に溶ける。', uses: '不飽和ポリエステル樹脂原料。', nature: '工業的に合成。',
    hazards: '刺激性。', notes: 'シス形。加熱で無水マレイン酸になる。',
    precursors: 'ベンゼンまたはブタンの酸化。', reactions: '異性化でフマル酸、付加で無水マレイン酸。', dataStatus: 'class'
  });
  cond('fumaric-acid', 'フマル酸（トランス-ブテン二酸）', 'C4H4O4', 'carboxylic', ['HOOC—CH=CH—COOH（トランス形）'], {
    properties: '白色の結晶。水に溶けにくい。', uses: '食品添加物、不飽和ポリエステル原料。', nature: '植物・カビに存在。',
    hazards: '刺激性。', notes: 'トランス形。マレイン酸の幾何異性体。',
    precursors: 'マレイン酸の異性化。', reactions: '付加重合・エステル化。', dataStatus: 'class'
  });
  cond('malonic-acid', 'マロン酸（プロパン二酸）', 'C3H4O4', 'carboxylic', ['HOOC—CH₂—COOH'], {
    properties: '白色の結晶。水に溶ける。', uses: '医薬・香料原料。', nature: '一部の植物に存在。',
    hazards: '刺激性。', dataStatus: 'class'
  });
  cond('succinic-acid', 'コハク酸（ブタン二酸）', 'C4H6O4', 'carboxylic', ['HOOC—(CH₂)₂—COOH'], {
    properties: '白色の結晶。', uses: '食品添加物、医薬・樹脂原料。', nature: '琥珀・発酵食品に存在。',
    hazards: '刺激性。', dataStatus: 'class'
  });
  cond('glutaric-acid', 'グルタル酸（ペンタン二酸）', 'C5H8O4', 'carboxylic', ['HOOC—(CH₂)₃—COOH'], {
    properties: '白色の結晶。', uses: 'ポリエステル・医薬原料。', nature: '工業的に合成。',
    hazards: '刺激性。', dataStatus: 'class'
  });
  cond('adipic-acid', 'アジピン酸（ヘキサン二酸）', 'C6H10O4', 'carboxylic', ['HOOC—(CH₂)₄—COOH'], {
    properties: '白色の結晶。', uses: 'ナイロン-6,6の原料。', nature: '工業的に合成。',
    hazards: '刺激性。', precursors: 'シクロヘキサンの酸化。', reactions: 'ヘキサメチレンジアミンと縮重合。', dataStatus: 'full'
  });
  cond('tartaric-acid', '酒石酸（2,3-ジヒドロキシブタン二酸）', 'C4H6O6', 'carboxylic', ['HOOC—CH(OH)—CH(OH)—COOH'], {
    properties: '白色の結晶。水に溶ける。', uses: '食品添加物、医薬品、光学分割剤。', nature: 'ぶどう酒の酒石に含まれる。',
    hazards: '刺激性。', notes: '不斉炭素をもつ。光学異性体がある。', dataStatus: 'class'
  });
  cond('citric-acid', 'クエン酸（2-ヒドロキシプロパン-1,2,3-トリカルボン酸）', 'C6H8O7', 'carboxylic', ['HOOC—CH₂—C(OH)(COOH)—CH₂—COOH'], {
    properties: '白色の結晶。水に溶ける。酸味がある。', uses: '食品の酸味料、清涼飲料、洗浄剤。', nature: '柑橘類に含まれる。',
    hazards: '濃厚液は刺激性。', notes: '三価カルボン酸。', dataStatus: 'full'
  });
  cond('pyruvic-acid', 'ピルビン酸（2-オキソプロパン酸）', 'C3H4O3', 'carboxylic', ['CH₃—CO—COOH'], {
    properties: '無色の液体。刺激臭。', uses: '生化学研究、食品・医薬原料。', nature: '解糖系の中間体。',
    hazards: '腐食性・刺激性。', dataStatus: 'class'
  });
  cond('palmitic-acid', 'パルミチン酸（ヘキサデカン酸）', 'C16H32O2', 'lipid', ['CH₃(CH₂)₁₄COOH'], {
    properties: '白色の固体。水に溶けにくい。', uses: '石けん・化粧品・食品原料。', nature: 'パーム油・動物性油脂に含まれる。',
    hazards: '刺激性。', notes: '飽和脂肪酸。', dataStatus: 'full'
  });
  cond('linolenic-acid', 'リノレン酸（9,12,15-オクタデカトリエン酸）', 'C18H30O2', 'lipid', ['HOOC(CH₂)₇CH=CHCH₂CH=CHCH₂CH=CHCH₂CH₃'], {
    properties: '無色の液体。必須脂肪酸。', uses: '食品・化粧品・塗料。', nature: 'えごま油・亜麻仁油に含まれる。',
    hazards: '酸化しやすい。', notes: '二重結合3つの不飽和脂肪酸。立体配置は簡略式では省略。', dataStatus: 'class'
  });
  cond('elaidic-acid', 'エライジン酸（トランス-9-オクタデセン酸）', 'C18H34O2', 'lipid', ['CH₃(CH₂)₇CH=CH(CH₂)₇COOH（トランス形）'], {
    properties: '白色の固体。', uses: '研究用、工業原料。', nature: '部分水素添加油脂に含まれる。',
    hazards: '刺激性。', notes: 'オレイン酸のトランス異性体。', dataStatus: 'class'
  });
  ringSub('phthalic-acid', 'フタル酸（ベンゼン-1,2-ジカルボン酸）', 'C8H6O4', 'aromatic-other', [
    { at: 0, label: 'COOH' }, { at: 1, label: 'COOH' }
  ], {
    properties: '白色の結晶。', uses: '可塑剤・ポリエステル原料。', nature: '工業的に合成。',
    hazards: '刺激性。', notes: 'o-体。加熱で無水フタル酸。', dataStatus: 'class'
  });
  ringSub('isophthalic-acid', 'イソフタル酸（ベンゼン-1,3-ジカルボン酸）', 'C8H6O4', 'aromatic-other', [
    { at: 0, label: 'COOH' }, { at: 2, label: 'COOH' }
  ], {
    properties: '白色の結晶。', uses: 'PET共重合・樹脂原料。', nature: '工業的に合成。',
    hazards: '刺激性。', notes: 'm-体。', dataStatus: 'class'
  });
  ringSub('terephthalic-acid', 'テレフタル酸（ベンゼン-1,4-ジカルボン酸）', 'C8H6O4', 'aromatic-other', [
    { at: 0, label: 'COOH' }, { at: 3, label: 'COOH' }
  ], {
    properties: '白色の結晶。水に溶けにくい。', uses: 'PETの原料。', nature: '工業的に合成。',
    hazards: '刺激性。', notes: 'p-体。', precursors: 'p-キシレンの酸化。', reactions: 'エチレングリコールと縮重合でPET。', dataStatus: 'full'
  });

  /* ---- エステル ---- */
  cond('methyl-formate', 'ギ酸メチル（メタン酸メチル）', 'C2H4O2', 'ester', ['H—COO—CH₃'], {
    properties: '無色の液体。揮発性。', uses: '溶剤、香料、ホルムアミド原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  cond('ethyl-formate', 'ギ酸エチル（メタン酸エチル）', 'C3H6O2', 'ester', ['H—COO—CH₂—CH₃'], {
    properties: '無色の液体。果実様のにおい。', uses: '香料、溶剤、医薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  cond('propyl-formate', 'ギ酸プロピル（メタン酸プロピル）', 'C4H8O2', 'ester', ['H—COO—CH₂—CH₂—CH₃'], {
    properties: '無色の液体。', uses: '香料、溶剤。', nature: '工業的に合成。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  cond('methyl-propionate', 'プロピオン酸メチル（プロパン酸メチル）', 'C4H8O2', 'ester', ['CH₃—CH₂—COO—CH₃'], {
    properties: '無色の液体。果実様のにおい。', uses: '香料、溶剤。', nature: '工業的に合成。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  cond('ethyl-propionate', 'プロピオン酸エチル（プロパン酸エチル）', 'C5H10O2', 'ester', ['CH₃—CH₂—COO—CH₂—CH₃'], {
    properties: '無色の液体。果実様のにおい。', uses: '香料、溶剤。', nature: '工業的に合成。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  cond('isoamyl-acetate', '酢酸イソアミル', 'C7H14O2', 'ester', ['CH₃—COO—CH₂—CH₂—CH(CH₃)₂'], {
    properties: '無色の液体。バナナ様のにおい。', uses: '香料（食品・化粧品）、溶剤。', nature: '果実に微量含まれる。',
    hazards: '可燃性。', dataStatus: 'full'
  });
  ringSub('methyl-salicylate', 'サリチル酸メチル（2-ヒドロキシ安息香酸メチル）', 'C8H8O3', 'ester', [
    { at: 0, label: 'OH' }, { at: 1, label: 'COOCH₃' }
  ], {
    properties: '無色の液体。冬緑油様のにおい。', uses: '消炎鎮痛剤（外用）、香料、日焼け止め。',
    nature: '冬緑（ガルテリア）油に含まれる。', hazards: '刺激性。', dataStatus: 'class'
  });
  cond('ethyl-butyrate', '酪酸エチル（ブタン酸エチル）', 'C6H12O2', 'ester', ['CH₃—CH₂—CH₂—COO—CH₂—CH₃'], {
    properties: '無色の液体。果実様のにおい。', uses: '香料、溶剤。', nature: '果実・発酵食品に含まれる。',
    hazards: '可燃性。', dataStatus: 'class'
  });
  cond('butyl-acetate', '酢酸ブチル', 'C6H12O2', 'ester', ['CH₃—COO—CH₂—CH₂—CH₂—CH₃'], {
    properties: '無色の液体。果実様のにおい。', uses: '塗料・インキの溶剤、香料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', dataStatus: 'class'
  });
  cond('triacetin', 'トリアセチン（グリセリン三酢酸エステル）', 'C9H14O6', 'ester', ['CH₂(OCOCH₃)—CH(OCOCH₃)—CH₂(OCOCH₃)'], {
    properties: '無色の液体。', uses: '可塑剤、香料、医薬品添加物。', nature: '工業的に合成。',
    hazards: '可燃性。', dataStatus: 'class'
  });

  /* ---- 油脂・セッケン ---- */
  comp('tripalmitin', 'トリパルミチン（パルミチン酸グリセリド）', 'C51H98O6', 'lipid', {
    type: 'triglyceride',
    chains: ['C₁₅H₃₁', 'C₁₅H₃₁', 'C₁₅H₃₁'],
    composition: { C: 51, H: 98, O: 6 }
  }, {
    properties: '白色の固体。', uses: '食品・化粧品・石けん原料。', nature: 'パーム油・動物性油脂に含まれる。',
    hazards: '通常の取扱いでは強い危険性は知られていない。', notes: 'グリセリンとパルミチン酸3分子からなるトリグリセリド。',
    dataStatus: 'class'
  });
  comp('triolein', 'トリオレイン（オレイン酸グリセリド）', 'C57H104O6', 'lipid', {
    type: 'triglyceride',
    chains: ['C₁₇H₃₃', 'C₁₇H₃₃', 'C₁₇H₃₃'],
    composition: { C: 57, H: 104, O: 6 }
  }, {
    properties: '淡黄色の液体。', uses: 'オリーブ油の主成分、食品・石けん原料。', nature: 'オリーブ油・菜種油に多い。',
    hazards: '通常の取扱いでは強い危険性は知られていない。', notes: 'グリセリンとオレイン酸3分子からなるトリグリセリド。各鎖にシス二重結合1つ。',
    dataStatus: 'class'
  });
  comp('trilinolein', 'トリリノレイン（リノール酸グリセリド）', 'C57H98O6', 'lipid', {
    type: 'triglyceride',
    chains: ['C₁₇H₃₁', 'C₁₇H₃₁', 'C₁₇H₃₁'],
    composition: { C: 57, H: 98, O: 6 }
  }, {
    properties: '淡黄色の液体。酸化されやすい。', uses: '食品・塗料原料。', nature: '大豆油・ひまわり油に多い。',
    hazards: '通常の取扱いでは強い危険性は知られていない。', notes: 'グリセリンとリノール酸3分子からなるトリグリセリド。各鎖にシス二重結合2つ。',
    dataStatus: 'class'
  });
  cond('sodium-palmitate', 'パルミチン酸ナトリウム', 'C16H31NaO2', 'soap', ['C₁₅H₃₁—COO⁻Na⁺'], {
    properties: '白色の粉末。水に溶けて塩基性。', uses: '石けんの主成分。', nature: 'パルミチン酸のけん化で生成。',
    hazards: '刺激性。', notes: '高級脂肪酸のナトリウム塩。', dataStatus: 'class'
  });
  cond('sodium-oleate', 'オレイン酸ナトリウム', 'C18H33NaO2', 'soap', ['C₁₇H₃₃—COO⁻Na⁺'], {
    properties: '白色〜淡黄色の粉末。', uses: '石けん・化粧品原料。', nature: 'オレイン酸のけん化で生成。',
    hazards: '刺激性。', notes: '不飽和高級脂肪酸のナトリウム塩。', dataStatus: 'class'
  });
  cond('sodium-laurate', 'ラウリン酸ナトリウム', 'C12H23NaO2', 'soap', ['C₁₁H₂₃—COO⁻Na⁺'], {
    properties: '白色の粉末。', uses: '石けん・洗浄剤原料。', nature: 'やし油・パーム核油のけん化で生成。',
    hazards: '刺激性。', dataStatus: 'class'
  });
  cond('las', '直鎖アルキルベンゼンスルホン酸ナトリウム（LAS）', 'C18H29NaO3S', 'soap', ['CH₃(CH₂)₁₁—C₆H₄—SO₃⁻Na⁺'], {
    properties: '白色〜淡黄色の粉末。水に溶けやすい。', uses: '合成洗剤の主成分。', nature: '工業的に合成。',
    hazards: '刺激性。', notes: '直鎖アルキルベンゼンスルホン酸塩。生分解性は分岐型より高い。', dataStatus: 'class'
  });

  /* ---- 芳香族炭化水素・フェノール類・その他 ---- */
  ringSub('o-xylene', 'o-キシレン（1,2-ジメチルベンゼン）', 'C8H10', 'aromatic', [
    { at: 0, label: 'CH₃' }, { at: 1, label: 'CH₃' }
  ], { properties: '無色の液体。', uses: 'フタル酸原料、溶剤。', nature: '石油・石炭タールに含まれる。', hazards: '可燃性・神経毒性。', notes: 'o-体。', dataStatus: 'class' });
  ringSub('m-xylene', 'm-キシレン（1,3-ジメチルベンゼン）', 'C8H10', 'aromatic', [
    { at: 0, label: 'CH₃' }, { at: 2, label: 'CH₃' }
  ], { properties: '無色の液体。', uses: 'イソフタル酸原料、溶剤。', nature: '石油・石炭タールに含まれる。', hazards: '可燃性・神経毒性。', notes: 'm-体。', dataStatus: 'class' });
  ringSub('p-xylene', 'p-キシレン（1,4-ジメチルベンゼン）', 'C8H10', 'aromatic', [
    { at: 0, label: 'CH₃' }, { at: 3, label: 'CH₃' }
  ], { properties: '白色の結晶。', uses: 'テレフタル酸原料。', nature: '石油・石炭タールに含まれる。', hazards: '可燃性・神経毒性。', notes: 'p-体。', dataStatus: 'class' });
  ringSub('ethylbenzene', 'エチルベンゼン', 'C8H10', 'aromatic', [
    { at: 0, label: 'CH₂CH₃' }
  ], { properties: '無色の液体。', uses: 'スチレン原料。', nature: '石油に含まれる。', hazards: '可燃性・刺激性。', dataStatus: 'class' });
  ringSub('cumene', 'クメン（イソプロピルベンゼン）', 'C9H12', 'aromatic', [
    { at: 0, label: 'CH(CH₃)₂' }
  ], { properties: '無色の液体。', uses: 'フェノール・アセトン原料（クメン法）。', nature: '石油に含まれる。', hazards: '可燃性・刺激性。', dataStatus: 'class' });
  ringSub('o-cresol', 'o-クレゾール（2-メチルフェノール）', 'C7H8O', 'phenol', [
    { at: 0, label: 'OH' }, { at: 1, label: 'CH₃' }
  ], { properties: '無色の結晶。フェノール様のにおい。', uses: '樹脂・農薬・消毒剤原料。', nature: '石炭タールに含まれる。', hazards: '腐食性・有毒。', notes: 'o-体。', dataStatus: 'class' });
  ringSub('m-cresol', 'm-クレゾール（3-メチルフェノール）', 'C7H8O', 'phenol', [
    { at: 0, label: 'OH' }, { at: 2, label: 'CH₃' }
  ], { properties: '無色の液体。', uses: '樹脂・農薬原料。', nature: '石炭タールに含まれる。', hazards: '腐食性・有毒。', notes: 'm-体。', dataStatus: 'class' });
  ringSub('p-cresol', 'p-クレゾール（4-メチルフェノール）', 'C7H8O', 'phenol', [
    { at: 0, label: 'OH' }, { at: 3, label: 'CH₃' }
  ], { properties: '白色の結晶。', uses: '樹脂・酸化防止剤原料。', nature: '石炭タールに含まれる。', hazards: '腐食性・有毒。', notes: 'p-体。', dataStatus: 'class' });
  ringSub('catechol', 'カテコール（ベンゼン-1,2-ジオール）', 'C6H6O2', 'phenol', [
    { at: 0, label: 'OH' }, { at: 1, label: 'OH' }
  ], { properties: '白色の結晶。', uses: '写真現像薬、医薬・香料原料。', nature: '一部の植物に存在。', hazards: '有毒・刺激性。', notes: 'o-体。', dataStatus: 'class' });
  ringSub('resorcinol', 'レゾルシノール（ベンゼン-1,3-ジオール）', 'C6H6O2', 'phenol', [
    { at: 0, label: 'OH' }, { at: 2, label: 'OH' }
  ], { properties: '白色の結晶。', uses: '接着剤・染料・医薬原料。', nature: '工業的に合成。', hazards: '刺激性。', notes: 'm-体。', dataStatus: 'class' });
  ringSub('hydroquinone', 'ヒドロキノン（ベンゼン-1,4-ジオール）', 'C6H6O2', 'phenol', [
    { at: 0, label: 'OH' }, { at: 3, label: 'OH' }
  ], { properties: '白色の結晶。', uses: '写真現像薬、酸化防止剤、化粧品。', nature: '一部の植物に存在。', hazards: '刺激性・有毒。', notes: 'p-体。', dataStatus: 'class' });
  comp('1-naphthol', '1-ナフトール（α-ナフトール）', 'C10H8O', 'phenol', naphtholStructure(1), {
    properties: '白色の結晶。フェノール様のにおい。', uses: '染料・農薬原料。', nature: '石炭タールに含まれる。',
    hazards: '有毒・刺激性。', notes: 'ナフタレン環の1位にOH。', dataStatus: 'class'
  });
  comp('2-naphthol', '2-ナフトール（β-ナフトール）', 'C10H8O', 'phenol', naphtholStructure(2), {
    properties: '白色の結晶。', uses: '染料・医薬原料。', nature: '石炭タールに含まれる。',
    hazards: '有毒・刺激性。', notes: 'ナフタレン環の2位にOH。', dataStatus: 'class'
  });
  ringSub('o-nitrotoluene', 'o-ニトロトルエン（2-ニトロトルエン）', 'C7H7NO2', 'aromatic-other', [
    { at: 0, label: 'CH₃' }, { at: 1, label: 'NO₂' }
  ], { properties: '淡黄色の液体。', uses: '染料・爆薬原料。', nature: '工業的に合成。', hazards: '有毒・可燃性。', notes: 'o-体。', dataStatus: 'class' });
  ringSub('m-nitrotoluene', 'm-ニトロトルエン（3-ニトロトルエン）', 'C7H7NO2', 'aromatic-other', [
    { at: 0, label: 'CH₃' }, { at: 2, label: 'NO₂' }
  ], { properties: '淡黄色の液体。', uses: '染料・爆薬原料。', nature: '工業的に合成。', hazards: '有毒・可燃性。', notes: 'm-体。', dataStatus: 'class' });
  ringSub('p-nitrotoluene', 'p-ニトロトルエン（4-ニトロトルエン）', 'C7H7NO2', 'aromatic-other', [
    { at: 0, label: 'CH₃' }, { at: 3, label: 'NO₂' }
  ], { properties: '淡黄色の結晶。', uses: '染料・爆薬原料。', nature: '工業的に合成。', hazards: '有毒・可燃性。', notes: 'p-体。', dataStatus: 'class' });
  ringSub('tnt', '2,4,6-トリニトロトルエン（TNT）', 'C7H5N3O6', 'aromatic-other', [
    { at: 0, label: 'CH₃' }, { at: 1, label: 'NO₂' }, { at: 3, label: 'NO₂' }, { at: 5, label: 'NO₂' }
  ], { properties: '淡黄色の結晶。', uses: '爆薬。', nature: '工業的に合成。', hazards: '爆発性・有毒。', notes: 'トルエンの2,4,6位にニトロ基。', dataStatus: 'class' });
  ringSub('picric-acid', 'ピクリン酸（2,4,6-トリニトロフェノール）', 'C6H3N3O7', 'phenol', [
    { at: 0, label: 'OH' }, { at: 1, label: 'NO₂' }, { at: 3, label: 'NO₂' }, { at: 5, label: 'NO₂' }
  ], { properties: '黄色の結晶。強い酸性。', uses: '爆薬・染料・試薬。', nature: '工業的に合成。', hazards: '爆発性・有毒。', notes: 'フェノールの2,4,6位にニトロ基。', dataStatus: 'class' });
  ringSub('benzenesulfonic-acid', 'ベンゼンスルホン酸', 'C6H6O3S', 'aromatic-other', [
    { at: 0, label: 'SO₃H' }
  ], { properties: '無色の粘性液体。強酸性。', uses: '染料・界面活性剤・医薬原料。', nature: '工業的に合成。', hazards: '腐食性。', dataStatus: 'class' });
  ringSub('acetanilide', 'アセトアニリド', 'C8H9NO', 'aromatic-other', [
    { at: 0, label: 'NHCOCH₃' }
  ], { properties: '白色の結晶。', uses: '解熱鎮痛薬（歴史的）、ゴム薬品。', nature: '工業的に合成。', hazards: '有毒。', notes: 'アニリンのアセチル化物。', dataStatus: 'class' });
  ringSub('aniline-hydrochloride', 'アニリン塩酸塩（塩化アニリニウム）', 'C6H8ClN', 'aromatic-amine', [
    { at: 0, label: 'NH₃⁺Cl⁻' }
  ], { properties: '白色の結晶。水に溶ける。', uses: '染料中間体、分析試薬。', nature: 'アニリンと塩酸から生成。', hazards: '有毒・刺激性。', notes: 'アニリンの塩。', dataStatus: 'class' });
  ringSub('benzenediazonium-chloride', '塩化ベンゼンジアゾニウム', 'C6H5ClN2', 'aromatic-other', [
    { at: 0, label: 'N₂⁺Cl⁻' }
  ], { properties: '無色の結晶。水に溶け、低温で不安定。', uses: 'アゾ染料の中間体。', nature: 'アニリンのジアゾ化で生成。', hazards: '爆発性・有毒。', notes: 'ジアゾニウム塩。0〜5℃で扱う。', dataStatus: 'class' });
  cond('methyl-orange', 'メチルオレンジ（アゾ染料）', 'C14H14N3NaO3S', 'aromatic-other', ['(CH₃)₂N—C₆H₄—N=N—C₆H₄—SO₃⁻Na⁺'], {
    properties: '橙色の粉末。水に溶ける。pH指示薬。', uses: 'pH指示薬、染料。', nature: '工業的に合成。',
    hazards: '刺激性。', notes: 'アゾ結合（—N=N—）をもつアゾ染料。酸性で赤、塩基性で黄。', dataStatus: 'class'
  });
  comp('phenolphthalein', 'フェノールフタレイン', 'C20H14O4', 'aromatic-other', phenolphthaleinStructure(), {
    properties: '白色の粉末。水に溶けにくい。pH指示薬。', uses: '中和滴定の指示薬、下剤（歴史的）。',
    nature: '工業的に合成。', hazards: '刺激性。',
    notes: 'ラクトン環をもつ。酸性で無色、塩基性で赤紫色。中央のsp³炭素に2つの4-ヒドロキシフェニル基とフタリド環が結合する。',
    dataStatus: 'class'
  });
  cond('bisphenol-a', 'ビスフェノールA（BPA）', 'C15H16O2', 'aromatic-other', ['HO—C₆H₄—C(CH₃)₂—C₆H₄—OH'], {
    properties: '白色の結晶。', uses: 'ポリカーボネート・エポキシ樹脂原料。', nature: '工業的に合成。',
    hazards: '内分泌かく乱作用が議論される。', notes: 'フェノールとアセトンから合成。', dataStatus: 'class'
  });
  ringSub('benzyl-alcohol', 'ベンジルアルコール（ベンゼンメタノール）', 'C7H8O', 'aromatic-other', [
    { at: 0, label: 'CH₂OH' }
  ], { properties: '無色の液体。', uses: '香料・防腐剤・溶剤。', nature: '一部の植物に存在。', hazards: '刺激性。', dataStatus: 'class' });
  ringSub('anisole', 'アニソール（メトキシベンゼン）', 'C7H8O', 'aromatic-other', [
    { at: 0, label: 'OCH₃' }
  ], { properties: '無色の液体。', uses: '香料・溶剤・医薬原料。', nature: '一部の植物に存在。', hazards: '可燃性。', dataStatus: 'class' });

  /* ---- アミノ酸（標準20種）・ペプチド ---- */
  cond('valine', 'バリン', 'C5H11NO2', 'amino', ['H₂N—CH(CH(CH₃)₂)—COOH'], {
    properties: '白色の結晶。水にやや溶けにくい。必須アミノ酸。', uses: '食品・医薬品・飼料添加物。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖Rがイソプロピル基。', dataStatus: 'class'
  });
  cond('leucine', 'ロイシン', 'C6H13NO2', 'amino', ['H₂N—CH(CH₂CH(CH₃)₂)—COOH'], {
    properties: '白色の結晶。必須アミノ酸。', uses: '食品・医薬品・飼料添加物。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖Rがイソブチル基。', dataStatus: 'class'
  });
  cond('isoleucine', 'イソロイシン', 'C6H13NO2', 'amino', ['H₂N—CH(CH(CH₃)CH₂CH₃)—COOH'], {
    properties: '白色の結晶。必須アミノ酸。', uses: '食品・医薬品・飼料添加物。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖Rがsec-ブチル基。ロイシンの異性体。', dataStatus: 'class'
  });
  cond('serine', 'セリン', 'C3H7NO3', 'amino', ['H₂N—CH(CH₂OH)—COOH'], {
    properties: '白色の結晶。水に溶けやすい。', uses: '食品・医薬品・化粧品原料。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にヒドロキシ基をもつ。', dataStatus: 'class'
  });
  cond('threonine', 'スレオニン', 'C4H9NO3', 'amino', ['H₂N—CH(CH(OH)CH₃)—COOH'], {
    properties: '白色の結晶。必須アミノ酸。', uses: '食品・医薬品・飼料添加物。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にヒドロキシ基をもつ。不斉炭素が2つ。', dataStatus: 'class'
  });
  cond('cysteine', 'システイン', 'C3H7NO2S', 'amino', ['H₂N—CH(CH₂SH)—COOH'], {
    properties: '白色の結晶。', uses: '食品・医薬品・化粧品原料。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にチオール基（—SH）をもつ。', dataStatus: 'class'
  });
  cond('methionine', 'メチオニン', 'C5H11NO2S', 'amino', ['H₂N—CH(CH₂CH₂SCH₃)—COOH'], {
    properties: '白色の結晶。必須アミノ酸。', uses: '食品・飼料添加物・医薬品。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にチオエーテル結合をもつ。', dataStatus: 'class'
  });
  cond('aspartic-acid', 'アスパラギン酸', 'C4H7NO4', 'amino', ['HOOC—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。酸性アミノ酸。', uses: '食品添加物・医薬品・化粧品。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にカルボキシ基をもつ。', dataStatus: 'class'
  });
  cond('glutamic-acid', 'グルタミン酸', 'C5H9NO4', 'amino', ['HOOC—CH₂—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。うま味成分。', uses: '調味料（グルタミン酸ナトリウム）、医薬品。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にカルボキシ基をもつ。', dataStatus: 'full'
  });
  cond('asparagine', 'アスパラギン', 'C4H8N2O3', 'amino', ['H₂N—CO—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。', uses: '医薬品・食品原料。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖がアミド基。', dataStatus: 'class'
  });
  cond('glutamine', 'グルタミン', 'C5H10N2O3', 'amino', ['H₂N—CO—CH₂—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。', uses: '医薬品・食品・培養基。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖がアミド基。', dataStatus: 'class'
  });
  cond('lysine', 'リシン', 'C6H14N2O2', 'amino', ['H₂N—(CH₂)₄—CH(NH₂)—COOH'], {
    properties: '白色の結晶。塩基性アミノ酸。必須アミノ酸。', uses: '食品・飼料添加物・医薬品。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にアミノ基をもつ。', dataStatus: 'class'
  });
  cond('arginine', 'アルギニン', 'C6H14N4O2', 'amino', ['H₂N—C(=NH)—NH—(CH₂)₃—CH(NH₂)—COOH'], {
    properties: '白色の結晶。塩基性アミノ酸。', uses: '食品・医薬品・飼料添加物。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にグアニジノ基をもつ。', dataStatus: 'class'
  });
  cond('histidine', 'ヒスチジン', 'C6H9N3O2', 'amino', ['C₃H₃N₂—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。塩基性アミノ酸。', uses: '医薬品・食品原料。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にイミダゾール環をもつ。', dataStatus: 'class'
  });
  cond('tyrosine', 'チロシン', 'C9H11NO3', 'amino', ['HO—C₆H₄—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。水に溶けにくい。', uses: '医薬品・食品原料。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にフェノール性OHをもつ。', dataStatus: 'class'
  });
  cond('tryptophan', 'トリプトファン', 'C11H12N2O2', 'amino', ['C₈H₆N—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。必須アミノ酸。', uses: '医薬品・食品・飼料添加物。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖にインドール環をもつ。', dataStatus: 'class'
  });
  cond('proline', 'プロリン', 'C5H9NO2', 'amino', ['HN(CH₂CH₂CH₂)CH—COOH'], {
    properties: '白色の結晶。環状アミノ酸。', uses: '医薬品・食品原料。',
    nature: 'タンパク質の構成アミノ酸。', hazards: '', notes: '側鎖が環状（ピロリジン環）で、アミノ基が環に含まれる。', dataStatus: 'class'
  });
  cond('cystine', 'シスチン', 'C6H12N2O4S2', 'amino', ['HOOC—CH(NH₂)—CH₂—S—S—CH₂—CH(NH₂)—COOH'], {
    properties: '白色の結晶。水に溶けにくい。', uses: '医薬品・化粧品原料。',
    nature: 'タンパク質中でシステイン同士がジスルフィド結合したもの。', hazards: '',
    notes: '2分子のシステインが—S—S—結合でつながったアミノ酸。', dataStatus: 'class'
  });
  cond('glycylglycine', 'グリシルグリシン', 'C4H8N2O3', 'amino', ['H₂N—CH₂—CO—NH—CH₂—COOH'], {
    properties: '白色の固体。', uses: 'ペプチドの例、緩衝剤。',
    nature: 'タンパク質の部分構造。', hazards: '', notes: 'グリシン2分子がペプチド結合したジペプチド。', dataStatus: 'class'
  });
  cond('alanylglycine', 'アラニルグリシン', 'C5H10N2O3', 'amino', ['H₂N—CH(CH₃)—CO—NH—CH₂—COOH'], {
    properties: '白色の固体。', uses: 'ペプチドの例。',
    nature: 'タンパク質の部分構造。', hazards: '', notes: 'アラニンとグリシンがペプチド結合したジペプチド。', dataStatus: 'class'
  });
  cond('glutathione', 'グルタチオン', 'C10H17N3O6S', 'amino', ['H₂N—CH(COOH)—CH₂—CH₂—CO—NH—CH(CH₂SH)—CO—NH—CH₂—COOH'], {
    properties: '白色の固体。水に溶ける。', uses: '抗酸化剤・医薬品・化粧品原料。',
    nature: '生体内の抗酸化物質。', hazards: '', notes: 'グルタミン酸・システイン・グリシンからなるトリペプチド。', dataStatus: 'class'
  });
  cond('aspartame', 'アスパルテーム', 'C14H18N2O5', 'amino', ['HOOC—CH(NH₂)—CH₂—CO—NH—CH(CH₂C₆H₅)—COOCH₃'], {
    properties: '白色の結晶。強い甘味。', uses: '人工甘味料。',
    nature: '工業的に合成。', hazards: 'フェニルケトン尿症の人は摂取に注意。', notes: 'アスパラギン酸とフェニルアラニンのジペプチドメチルエステル。', dataStatus: 'class'
  });

  /* ---- 糖類（追加） ---- */
  comp('galactose', 'ガラクトース', 'C6H12O6', 'sugar', proj('fischer', 'galactose', { C: 6, H: 12, O: 6 }), {
    properties: '白色の結晶。水に溶けやすい。', uses: '乳製品・医薬品原料。',
    nature: '乳糖の構成糖。', hazards: '', notes: 'D-ガラクトースのフィッシャー投影式。C2=右、C3=左、C4=左、C5=右。', dataStatus: 'class'
  });
  comp('mannose', 'マンノース', 'C6H12O6', 'sugar', proj('fischer', 'mannose', { C: 6, H: 12, O: 6 }), {
    properties: '白色の結晶。水に溶けやすい。', uses: '研究用・医薬品原料。',
    nature: '植物の多糖に含まれる。', hazards: '', notes: 'D-マンノースのフィッシャー投影式。C2=左、C3=左、C4=右、C5=右。', dataStatus: 'class'
  });
  comp('ribose', 'リボース', 'C5H10O5', 'sugar', proj('fischer', 'ribose', { C: 5, H: 10, O: 5 }), {
    properties: '白色の結晶。水に溶けやすい。', uses: 'RNAの構成糖、医薬・食品原料。',
    nature: 'RNAに含まれる。', hazards: '', notes: 'D-リボースのフィッシャー投影式。C2・C3・C4のOHはすべて右。', dataStatus: 'class'
  });
  comp('deoxyribose', 'デオキシリボース', 'C5H10O4', 'sugar', proj('fischer', 'deoxyribose', { C: 5, H: 10, O: 4 }), {
    properties: '白色の結晶。', uses: 'DNAの構成糖。',
    nature: 'DNAに含まれる。', hazards: '', notes: 'D-2-デオキシリボースのフィッシャー投影式。C2はデオキシ（Hが2つ）、C3・C4のOHは右。', dataStatus: 'class'
  });
  cond('sorbitol', 'ソルビトール（グルシトール）', 'C6H14O6', 'sugar', ['HOCH₂—(CHOH)₄—CH₂OH'], {
    properties: '白色の結晶。水に溶けやすい。甘味がある。', uses: '食品甘味料・保湿剤・医薬品。',
    nature: '果実に含まれる。', hazards: '大量摂取で下痢。', notes: 'グルコースの還元で得られる糖アルコール。', dataStatus: 'class'
  });
  comp('amylopectin', 'アミロペクチン', '(C6H10O5)n', 'sugar', {
    type: 'schematic', kind: 'amylopectin', unitLabel: 'α-グルコース単位',
    linkLabel: 'α-1,4結合＋α-1,6分岐', composition: { C: 6, H: 10, O: 5 }
  }, {
    properties: '白色の粉末。水に溶けにくい。ヨウ素で赤紫色。', uses: '食品・糊・発酵原料。',
    nature: '植物の貯蔵多糖（デンプンの主成分）。', hazards: '', notes: 'α-グルコースが分枝状につながった高分子。図は繰り返し単位の模式図。', dataStatus: 'class'
  });
  comp('dextrin', 'デキストリン', '(C6H10O5)n', 'sugar', {
    type: 'schematic', kind: 'dextrin', unitLabel: 'α-グルコース単位',
    linkLabel: 'α-1,4結合（短鎖）', composition: { C: 6, H: 10, O: 5 }
  }, {
    properties: '白色〜淡黄色の粉末。水に溶けやすい。', uses: '食品・糊・医薬品賦形剤。',
    nature: 'デンプンの部分加水分解で生成。', hazards: '', notes: 'デンプンより重合度が小さい多糖。図は繰り返し単位の模式図。', dataStatus: 'class'
  });
  comp('chitin', 'キチン', '(C8H13NO5)n', 'sugar', {
    type: 'schematic', kind: 'chitin', unitLabel: 'N-アセチルグルコサミン単位',
    linkLabel: 'β-1,4結合', composition: { C: 8, H: 13, N: 1, O: 5 }
  }, {
    properties: '白色の固体。水に溶けない。', uses: '食品・化粧品・医療材料・キトサン原料。',
    nature: '甲殻類の外骨格・昆虫のクチクラ・菌類の細胞壁に含まれる。', hazards: '',
    notes: 'N-アセチルグルコサミンがβ-1,4結合した天然高分子。図は繰り返し単位の模式図。', dataStatus: 'class'
  });
  comp('cellulose-acetate', 'セルロースアセテート（酢酸セルロース）', '組成依存', 'sugar', {
    type: 'schematic', kind: 'cellulose-acetate', unitLabel: 'セルロースアセテート単位',
    linkLabel: '置換度 x に依存', composition: null
  }, {
    properties: '白色の固体。置換度により溶媒への溶解性が変わる。', uses: '繊維・フィルム・写真フィルム・タバコのフィルター。',
    nature: 'セルロースのアセチル化で得られる。', hazards: '可燃性。',
    formulaVariable: true, formulaDisplay: '組成依存（セルロース単位のアセチル化度 x に依存。トリアセテートで (C₁₂H₁₆O₈)ₙ）',
    notes: 'セルロースのOHをアセチル化した誘導体。置換度により分子式が変わるため固定式では表さない。', dataStatus: 'class'
  });
  comp('cellulose-nitrate', 'セルロースナイトレート（ニトロセルロース）', '組成依存', 'sugar', {
    type: 'schematic', kind: 'cellulose-nitrate', unitLabel: 'ニトロセルロース単位',
    linkLabel: 'ニトロ化度に依存', composition: null
  }, {
    properties: '白色の固体。ニトロ化度が高いものは爆発性。', uses: '塗料・フィルム・火薬（ニトロ化度による）。',
    nature: 'セルロースのニトロ化で得られる。', hazards: '爆発性・可燃性。',
    formulaVariable: true, formulaDisplay: '組成依存（ニトロ化度に依存。トリニトロセルロースで (C₆H₇N₃O₁₁)ₙ）',
    notes: 'セルロースのOHを硝酸エステル化した誘導体。置換度により分子式が変わるため固定式では表さない。', dataStatus: 'class'
  });

  /* ---- 核酸 ---- */
  comp('dna', 'DNA（デオキシリボ核酸）', '組成依存', 'natural-polymer', {
    type: 'schematic', kind: 'dna', composition: null
  }, {
    properties: '白色の繊維状固体。水に溶けにくい。', uses: '遺伝情報の保持・研究用。',
    nature: '生物の細胞核・ミトコンドリアなどに存在。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（デオキシリボース—リン酸鎖＋塩基A/T/G/C、重合度に依存）',
    notes: 'デオキシリボースとリン酸が交互につながる二本鎖高分子。塩基配列と重合度で分子が変わるため固定式では表さない。図は模式図。', dataStatus: 'class'
  });
  comp('rna', 'RNA（リボ核酸）', '組成依存', 'natural-polymer', {
    type: 'schematic', kind: 'rna', composition: null
  }, {
    properties: '白色の固体。水に溶けやすい。', uses: '遺伝情報の伝達・タンパク質合成・研究用。',
    nature: '生物の細胞質・核などに存在。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（リボース—リン酸鎖＋塩基A/U/G/C、重合度に依存）',
    notes: 'リボースとリン酸が交互につながる高分子。塩基配列と重合度で分子が変わるため固定式では表さない。図は模式図。', dataStatus: 'class'
  });

  /* ---- 合成高分子の単量体 ---- */
  cond('butadiene', '1,3-ブタジエン', 'C4H6', 'synthetic-polymer', ['CH₂=CH—CH=CH₂'], {
    properties: '無色の可燃性気体。', uses: 'SBR・BR・ABS樹脂の単量体。', nature: '石油化学工業で製造。',
    hazards: '可燃性・発がん性評価。', subcategory: '単量体', precursors: 'ブタン・ブテンの脱水素。',
    reactions: '付加重合でポリブタジエン、スチレンと共重合でSBR。', dataStatus: 'class'
  });
  cond('isoprene', 'イソプレン（2-メチル-1,3-ブタジエン）', 'C5H8', 'synthetic-polymer', ['CH₂=C(CH₃)—CH=CH₂'], {
    properties: '無色の可燃性液体。', uses: '合成イソプレンゴム・天然ゴムの構成単位。', nature: '天然ゴムの構成単位。',
    hazards: '可燃性・刺激性。', subcategory: '単量体', reactions: '付加重合でポリイソプレン。', dataStatus: 'class'
  });
  cond('vinyl-chloride', '塩化ビニル（クロロエテン）', 'C2H3Cl', 'synthetic-polymer', ['CH₂=CHCl'], {
    properties: '無色の可燃性気体。', uses: 'PVCの単量体。', nature: '石油化学工業で製造。',
    hazards: '発がん性・可燃性。', subcategory: '単量体', precursors: 'エチレンと塩素から。',
    reactions: '付加重合でポリ塩化ビニル。', dataStatus: 'full'
  });
  cond('vinylidene-chloride', '塩化ビニリデン（1,1-ジクロロエテン）', 'C2H2Cl2', 'synthetic-polymer', ['CH₂=CCl₂'], {
    properties: '無色の液体。', uses: 'PVDCの単量体。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: '単量体', reactions: '付加重合でポリ塩化ビニリデン。', dataStatus: 'class'
  });
  cond('chloroprene', 'クロロプレン（2-クロロ-1,3-ブタジエン）', 'C4H5Cl', 'synthetic-polymer', ['CH₂=C(Cl)—CH=CH₂'], {
    properties: '無色の液体。', uses: 'クロロプレンゴムの単量体。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: '単量体', reactions: '付加重合でクロロプレンゴム。', dataStatus: 'class'
  });
  cond('acrylonitrile', 'アクリロニトリル', 'C3H3N', 'synthetic-polymer', ['CH₂=CH—C≡N'], {
    properties: '無色の液体。', uses: 'PAN・ABS樹脂の単量体。', nature: '工業的に合成。',
    hazards: '可燃性・有毒。', subcategory: '単量体', reactions: '付加重合でポリアクリロニトリル。', dataStatus: 'class'
  });
  cond('vinyl-acetate', '酢酸ビニル', 'C4H6O2', 'synthetic-polymer', ['CH₃COO—CH=CH₂'], {
    properties: '無色の液体。', uses: 'PVAc・PVAの原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: '単量体', reactions: '付加重合でポリ酢酸ビニル、けん化でPVA。', dataStatus: 'class'
  });
  cond('methyl-methacrylate', 'メタクリル酸メチル（MMA）', 'C5H8O2', 'synthetic-polymer', ['CH₂=C(CH₃)—COOCH₃'], {
    properties: '無色の液体。', uses: 'PMMAの単量体。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: '単量体', reactions: '付加重合でポリメタクリル酸メチル。', dataStatus: 'class'
  });
  cond('caprolactam', 'ε-カプロラクタム', 'C6H11NO', 'synthetic-polymer', ['HN—(CH₂)₅—CO（環状アミド）'], {
    properties: '白色の結晶。吸湿性。', uses: 'ナイロン-6の単量体。', nature: '工業的に合成。',
    hazards: '刺激性。', subcategory: '単量体', reactions: '開環重合でナイロン-6。', dataStatus: 'class'
  });
  cond('hexamethylenediamine', 'ヘキサメチレンジアミン', 'C6H16N2', 'synthetic-polymer', ['H₂N—(CH₂)₆—NH₂'], {
    properties: '白色の結晶。塩基性。', uses: 'ナイロン-6,6の原料。', nature: '工業的に合成。',
    hazards: '腐食性・刺激性。', subcategory: '単量体', reactions: 'アジピン酸と縮重合でナイロン-6,6。', dataStatus: 'class'
  });
  cond('urea', '尿素', 'CH4N2O', 'synthetic-polymer', ['H₂N—CO—NH₂'], {
    properties: '白色の結晶。水に溶けやすい。', uses: '肥料・尿素樹脂原料・医薬品。',
    nature: '動物の尿中に含まれる。工業的に合成。', hazards: '', subcategory: '単量体',
    precursors: 'アンモニアと二酸化炭素から。', reactions: 'ホルムアルデヒドと縮重合で尿素樹脂。', dataStatus: 'full'
  });
  cond('melamine', 'メラミン', 'C3H6N6', 'synthetic-polymer', ['C₃N₃(NH₂)₃（トリアジン環）'], {
    properties: '白色の結晶。水に溶けにくい。', uses: 'メラミン樹脂原料・肥料。',
    nature: '工業的に合成。', hazards: '刺激性。', subcategory: '単量体',
    precursors: '尿素から合成。', reactions: 'ホルムアルデヒドと縮重合でメラミン樹脂。', dataStatus: 'class'
  });
  cond('tetrafluoroethylene', 'テトラフルオロエチレン', 'C2F4', 'synthetic-polymer', ['CF₂=CF₂'], {
    properties: '無色の気体。', uses: 'PTFEの単量体。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', subcategory: '単量体', reactions: '付加重合でポリテトラフルオロエチレン。', dataStatus: 'class'
  });
  cond('phosgene', 'ホスゲン（塩化カルボニル）', 'CCl2O', 'synthetic-polymer', ['COCl₂'], {
    properties: '無色の気体。刺激臭。', uses: 'ポリカーボネート・ポリウレタン原料。', nature: '工業的に合成。',
    hazards: '強い毒性・腐食性。', subcategory: '単量体', dataStatus: 'class'
  });

  /* ---- 合成高分子（追加） ---- */
  poly('pmma', 'ポリメタクリル酸メチル（PMMA）', '(C5H8O2)n', '—CH₂—C(CH₃)(COOCH₃)—', 'C5H8O2', 'synthetic-polymer', {
    properties: '透明な固体。耐候性が高い。', uses: 'アクリル板・レンズ・看板。', nature: 'メタクリル酸メチルの付加重合で製造。',
    hazards: '', notes: '付加重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('pan', 'ポリアクリロニトリル（PAN）', '(C3H3N)n', '—CH₂—CH(CN)—', 'C3H3N', 'synthetic-polymer', {
    properties: '白色の固体。', uses: 'アクリル繊維・炭素繊維原料。', nature: 'アクリロニトリルの付加重合で製造。',
    hazards: '', notes: '付加重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('ptfe', 'ポリテトラフルオロエチレン（PTFE）', '(C2F4)n', '—CF₂—CF₂—', 'C2F4', 'synthetic-polymer', {
    properties: '白色の固体。耐熱性・耐薬品性・撥水性が高い。', uses: 'フライパンコート・シール材・電線被覆。',
    nature: 'テトラフルオロエチレンの付加重合で製造。', hazards: '高温分解で有害ガス。', notes: '付加重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('pvac', 'ポリ酢酸ビニル（PVAc）', '(C4H6O2)n', '—CH₂—CH(OCOCH₃)—', 'C4H6O2', 'synthetic-polymer', {
    properties: '白色の固体。接着性が高い。', uses: '接着剤・塗料・紙加工。', nature: '酢酸ビニルの付加重合で製造。',
    hazards: '', notes: '付加重合。けん化でPVAになる。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('pvdc', 'ポリ塩化ビニリデン（PVDC）', '(C2H2Cl2)n', '—CH₂—CCl₂—', 'C2H2Cl2', 'synthetic-polymer', {
    properties: '白色の固体。酸素・水蒸気バリア性が高い。', uses: '食品包装フィルム。', nature: '塩化ビニリデンの付加重合で製造。',
    hazards: '燃焼時に塩化水素。', notes: '付加重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('nylon6', 'ナイロン-6', '(C6H11NO)n', '—NH—(CH₂)₅—CO—', 'C6H11NO', 'synthetic-polymer', {
    properties: '白色の固体。強靭で耐熱性がある。', uses: '繊維・歯車・フィルム。', nature: 'ε-カプロラクタムの開環重合で製造。',
    hazards: '', notes: 'アミド結合をもつ縮重合体。図は繰り返し単位。', dataStatus: 'class'
  });
  comp('phenol-resin', 'フェノール樹脂（フェノール-ホルムアルデヒド樹脂）', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—C₆H₃(OH)—CH₂—', unitFormula: 'C7H6O', formula: '組成依存'
  }, {
    properties: '褐色の固体。耐熱性・電気絶縁性が高い。', uses: '電気部品・接着剤・食器。',
    nature: 'フェノールとホルムアルデヒドの縮重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（架橋度に依存。繰り返し単位の参考は C₇H₆O）',
    notes: '熱硬化性樹脂。架橋度により分子式が変わるため固定式では表さない。図は繰り返し単位。', dataStatus: 'class'
  });
  comp('urea-resin', '尿素樹脂（ユリア樹脂）', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—NH—CO—NH—CH₂—', unitFormula: 'C2H4N2O', formula: '組成依存'
  }, {
    properties: '無色〜白色の固体。', uses: '接着剤・食器・化粧板。',
    nature: '尿素とホルムアルデヒドの縮重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（架橋度に依存。繰り返し単位の参考は C₂H₄N₂O）',
    notes: '熱硬化性樹脂。架橋度により分子式が変わるため固定式では表さない。図は繰り返し単位。', dataStatus: 'class'
  });
  comp('melamine-resin', 'メラミン樹脂', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—C₃N₃(NH₂)₂—CH₂—', formula: '組成依存'
  }, {
    properties: '無色〜白色の固体。耐熱性・耐水性が高い。', uses: '食器・化粧板・接着剤。',
    nature: 'メラミンとホルムアルデヒドの縮重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（メラミン—ホルムアルデヒド縮合物、架橋度に依存）',
    notes: '熱硬化性樹脂。架橋度により分子式が変わるため固定式では表さない。図は繰り返し単位の模式。', dataStatus: 'class'
  });
  comp('epoxy-resin', 'エポキシ樹脂', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—O—C₆H₄—C(CH₃)₂—C₆H₄—O—CH₂—CH(OH)—CH₂—', formula: '組成依存'
  }, {
    properties: '粘性液体〜固体。硬化剤で硬化する。', uses: '接着剤・塗料・電子部品封止。',
    nature: 'ビスフェノールAとエピクロロヒドリンの縮重合で製造。', hazards: '硬化前は刺激性。',
    formulaVariable: true, formulaDisplay: '組成依存（ビスフェノールA骨格と架橋度に依存）',
    notes: '熱硬化性樹脂。架橋度により分子式が変わるため固定式では表さない。図は繰り返し単位の模式。', dataStatus: 'class'
  });
  poly('silicone', 'シリコーン（ポリジメチルシロキサン）', '(C2H6OSi)n', '—Si(CH₃)₂—O—', 'C2H6OSi', 'synthetic-polymer', {
    properties: '無色の油状〜ゴム状固体。耐熱性・撥水性が高い。', uses: 'シリコーン油・ゴム・コーティング。',
    nature: 'ジメチルジクロロシランの加水分解・縮重合で製造。', hazards: '', notes: 'ケイ素—酸素結合をもつ高分子。図は繰り返し単位。', dataStatus: 'class'
  });
  comp('polyurethane', 'ポリウレタン', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—O—R′—O—CO—NH—R—NH—CO—', formula: '組成依存'
  }, {
    properties: '弾性のある固体〜発泡体。', uses: '断熱材・クッション・塗料・接着剤。',
    nature: 'ジイソシアネートとポリオールの重付加（付加重合）で製造。', hazards: '原料イソシアネートは刺激性。',
    formulaVariable: true, formulaDisplay: '組成依存（ジイソシアネートのRとポリオールのR′、架橋度に依存）',
    notes: 'ウレタン結合（—NH—CO—O—）をもつ高分子。原料により分子式が変わるため固定式では表さない。', dataStatus: 'class'
  });
  comp('sbr', 'スチレン-ブタジエンゴム（SBR）', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—(CH₂—CH=CH—CH₂)ₘ—(CH₂—CH(C₆H₅))ₙ—', formula: '組成依存'
  }, {
    properties: '弾性のある固体。', uses: 'タイヤ・ゴム製品。',
    nature: 'スチレンとブタジエンの共重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（(C₈H₈)ₘ(C₄H₆)ₙ、共重合比に依存）',
    notes: '共重合体。組成比により分子式が変わるため固定式では表さない。図は繰り返し単位の模式。', dataStatus: 'class'
  });
  poly('br', 'ポリブタジエン（BR）', '(C4H6)n', '—CH₂—CH=CH—CH₂—', 'C4H6', 'synthetic-polymer', {
    properties: '弾性のある固体。', uses: 'タイヤ・ゴム製品。', nature: 'ブタジエンの付加重合で製造。',
    hazards: '', notes: '付加重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('chloroprene-rubber', 'クロロプレンゴム（CR）', '(C4H5Cl)n', '—CH₂—C(Cl)=CH—CH₂—', 'C4H5Cl', 'synthetic-polymer', {
    properties: '弾性のある固体。耐油性・耐候性が高い。', uses: 'ホース・ベルト・粘着剤。',
    nature: 'クロロプレンの付加重合で製造。', hazards: '', notes: '付加重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('pla', 'ポリ乳酸（PLA）', '(C3H4O2)n', '—O—CH(CH₃)—CO—', 'C3H4O2', 'synthetic-polymer', {
    properties: '白色の固体。生分解性。', uses: '包装材・繊維・3Dプリント材料。',
    nature: '乳酸の縮重合またはラクチドの開環重合で製造。', hazards: '', notes: '縮重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('polycarbonate', 'ポリカーボネート（PC）', '(C16H14O3)n', '—O—C₆H₄—C(CH₃)₂—C₆H₄—O—CO—', 'C16H14O3', 'synthetic-polymer', {
    properties: '透明な固体。衝撃強度が高い。', uses: 'CD・レンズ・建材・電子部品。',
    nature: 'ビスフェノールAとホスゲンの縮重合で製造。', hazards: '', notes: '縮重合。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('sodium-polyacrylate', 'ポリアクリル酸ナトリウム', '(C3H3NaO2)n', '—CH₂—CH(COO⁻Na⁺)—', 'C3H3NaO2', 'synthetic-polymer', {
    properties: '白色の粉末。水を吸収して膨潤する。', uses: '紙おむつ・吸水材・増粘剤。',
    nature: 'アクリル酸の重合後、中和して製造。', hazards: '', notes: '高吸水性ポリマー。図は繰り返し単位。', dataStatus: 'class'
  });
  poly('aramid', 'アラミド繊維（ケブラー）', '(C14H10N2O2)n', '—NH—C₆H₄—NH—CO—C₆H₄—CO—', 'C14H10N2O2', 'synthetic-polymer', {
    properties: '黄色の繊維。高強度・耐熱性。', uses: '防弾衣・タイヤコード・複合材料。',
    nature: 'p-フェニレンジアミンとテレフタル酸の縮重合で製造。', hazards: '', notes: '芳香族ポリアミド。図は繰り返し単位。', dataStatus: 'class'
  });
  comp('abs', 'ABS樹脂（アクリロニトリル-ブタジエン-スチレン共重合体）', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—(C₃H₃N)ₓ—(C₄H₆)ᵧ—(C₈H₈)ᵣ—', formula: '組成依存'
  }, {
    properties: '白色〜淡黄色の固体。衝撃強度・成形性が高い。', uses: '家電外装・玩具・自動車部品。',
    nature: 'アクリロニトリル・ブタジエン・スチレンの共重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（(C₃H₃N)ₓ(C₄H₆)ᵧ(C₈H₈)ᵣ、共重合比に依存）',
    notes: '3成分共重合体。組成比により分子式が変わるため固定式では表さない。図は繰り返し単位の模式。', dataStatus: 'class'
  });
  comp('nbr', 'ニトリルゴム（NBR、アクリロニトリル-ブタジエン共重合体）', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—(CH₂—CH=CH—CH₂)ₘ—(CH₂—CH(CN))ₙ—', formula: '組成依存'
  }, {
    properties: '淡黄色の弾性体。耐油性が高い。', uses: 'ホース・ガスケット・手袋。',
    nature: 'アクリロニトリルとブタジエンの共重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（(C₄H₆)ₘ(C₃H₃N)ₙ、共重合比に依存）',
    notes: '共重合体。組成比により分子式が変わるため固定式では表さない。図は繰り返し単位の模式。',
    subcategory: '合成ゴム', dataStatus: 'class'
  });
  comp('iir', 'ブチルゴム（IIR、イソブチレン-イソプレン共重合体）', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—(CH₂—C(CH₃)₂)ₘ—(CH₂—C(CH₃)=CH—CH₂)ₙ—', formula: '組成依存'
  }, {
    properties: '弾性体。気体透過性が低い。', uses: 'タイヤ内張り・チューブ・シーリング材。',
    nature: 'イソブチレンと少量のイソプレンの共重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（(C₄H₈)ₘ(C₅H₈)ₙ、共重合比に依存）',
    notes: '共重合体。二重結合が加硫点になる。組成比により分子式が変わるため固定式では表さない。',
    subcategory: '合成ゴム', dataStatus: 'class'
  });
  comp('unsaturated-polyester', '不飽和ポリエステル樹脂', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—O—CH₂—CH(CH₃)—O—CO—CH=CH—CO—', formula: '組成依存'
  }, {
    properties: '粘性液体。スチレンで架橋すると硬質固体。', uses: 'FRP・塗料・接着剤。',
    nature: '不飽和二カルボン酸とジオールの縮重合で製造。', hazards: 'スチレンは可燃性・刺激性。',
    formulaVariable: true, formulaDisplay: '組成依存（不飽和ポリエステル；スチレン架橋と縮合度に依存）',
    notes: '主鎖に二重結合をもつ縮重合体。スチレンで架橋して硬化する。固定の分子式では表さない。',
    subcategory: '熱硬化性樹脂', dataStatus: 'class'
  });
  comp('alkyd-resin', 'アルキド樹脂', '組成依存', 'synthetic-polymer', {
    type: 'polymer', unit: '—O—CH₂—CH(OCO—R)—CH₂—O—CO—C₆H₄—CO—', formula: '組成依存'
  }, {
    properties: '粘性液体〜固体。塗膜性が高い。', uses: '塗料・ワニス・接着剤。',
    nature: '多価アルコール・多塩基酸・脂肪酸の縮重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（アルキド樹脂；脂肪酸Rと縮合度に依存）',
    notes: 'グリセリン・フタル酸・脂肪酸の縮重合体。脂肪酸Rにより組成が変わるため固定式では表さない。',
    subcategory: '熱硬化性樹脂', dataStatus: 'class'
  });
  comp('polyacetylene', 'ポリアセチレン', '(C2H2)n', 'synthetic-polymer', {
    type: 'polymer', unit: '—CH=CH—', unitFormula: 'C2H2', formula: '(C2H2)n'
  }, {
    properties: '黒色の固体。ドープにより導電性を示す。', uses: '導電性材料・研究用。',
    nature: 'アセチレンの重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（(C₂H₂)ₙ；ドープ状態で組成変化）',
    notes: '共役二重結合をもつ導電性高分子。ドープ状態で電導度が変わるため固定式では表さない。',
    subcategory: '導電性高分子', dataStatus: 'class'
  });
  comp('polyaniline', 'ポリアニリン（導電性高分子）', '(C6H5N)n', 'synthetic-polymer', {
    type: 'polymer', unit: '—C₆H₄—NH—', unitFormula: 'C6H5N', formula: '(C6H5N)n'
  }, {
    properties: '黒色〜緑色の固体。ドープで導電性。', uses: '帯電防止材・センサー・電池材料。',
    nature: 'アニリンの酸化重合で製造。', hazards: '',
    formulaVariable: true, formulaDisplay: '組成依存（(C₆H₅N)ₙ；ドープ状態で組成変化）',
    notes: 'アニリン単位が連なった導電性高分子。ドープ状態で組成・色・電導度が変わる。',
    subcategory: '導電性高分子', dataStatus: 'class'
  });
  cond('epichlorohydrin', 'エピクロロヒドリン', 'C3H5ClO', 'synthetic-polymer', ['CH₂—CH(O)—CH₂Cl（エポキシ環）'], {
    properties: '無色の液体。刺激臭。', uses: 'エポキシ樹脂・合成グリセリンの原料。',
    nature: 'プロペンからアリルクロリドを経て工業合成。', hazards: '有毒・発がん性評価・可燃性。',
    subcategory: '単量体', precursors: 'プロペンからアリルクロリドを経て合成。',
    reactions: 'エポキシ樹脂原料、開環付加。', dataStatus: 'class'
  });
  ringSub('p-phenylenediamine', 'p-フェニレンジアミン（ベンゼン-1,4-ジアミン）', 'C6H8N2', 'aromatic-amine', [
    { at: 0, label: 'NH₂' }, { at: 3, label: 'NH₂' }
  ], {
    properties: '白色〜淡赤色の結晶。塩基性。', uses: 'アラミド繊維・染料・ゴム薬品原料。',
    nature: 'p-ニトロアニリンの還元などで製造。', hazards: '有毒・刺激性。',
    subcategory: '芳香族アミン', precursors: 'p-ニトロアニリンの還元など。',
    reactions: 'アラミドの縮重合原料。', dataStatus: 'class'
  });
  cond('dimethyldichlorosilane', 'ジメチルジクロロシラン', 'C2H6Cl2Si', 'synthetic-polymer', ['(CH₃)₂SiCl₂'], {
    properties: '無色の液体。加水分解しやすい。', uses: 'シリコーン油・ゴムの原料。',
    nature: 'ケイ素と塩化メチルの直接反応で製造。', hazards: '腐食性・可燃性。',
    subcategory: '単量体', precursors: 'ケイ素と塩化メチルから合成。',
    reactions: '加水分解・縮重合でシリコーン。', dataStatus: 'class'
  });

  /* ------------------------------------------------------------------
   * 外部公開資料で名称を確認した発展・探究項目
   * 出典は SOURCES s1〜s21。構造は PubChem の2D構造を custom 形式へ変換し、
   * 分子式・結合価を validate で照合している（CIDは各項目に記載）。
   * ------------------------------------------------------------------ */
  cond('heptane', 'ヘプタン', 'C7H16', 'alkane', ['CH₃(CH₂)₅CH₃'], { sources: ['s3', 's4'], properties: '無色の液体。水にほとんど溶けない。', uses: '溶媒、燃料、オクタン価の基準物質。', nature: '石油に含まれる。', notes: '', precursors: '石油の分留で得られる。', reactions: '燃焼、ラジカル置換。', dataStatus: 'full' });
  cond('octane', 'オクタン', 'C8H18', 'alkane', ['CH₃(CH₂)₆CH₃'], { sources: ['s3', 's4'], properties: '無色の液体。水にほとんど溶けない。', uses: 'ガソリンの成分、溶媒。', nature: '石油に含まれる。', notes: '', precursors: '石油の分留・接触改質で得られる。', reactions: '燃焼、異性化、ラジカル置換。', dataStatus: 'full' });
  cond('nonane', 'ノナン', 'C9H20', 'alkane', ['CH₃(CH₂)₇CH₃'], { sources: ['s3', 's4'], properties: '無色の液体。水にほとんど溶けない。', uses: '溶媒、燃料。', nature: '石油に含まれる。', notes: '', precursors: '石油の分留で得られる。', reactions: '燃焼、ラジカル置換。', dataStatus: 'full' });
  cond('decane', 'デカン', 'C10H22', 'alkane', ['CH₃(CH₂)₈CH₃'], { sources: ['s3', 's4'], properties: '無色の液体。水にほとんど溶けない。', uses: '溶媒、燃料、標準物質。', nature: '石油に含まれる。', notes: '', precursors: '石油の分留で得られる。', reactions: '燃焼、ラジカル置換。', dataStatus: 'full' });
  cond('eicosane', 'エイコサン', 'C20H42', 'alkane', ['CH₃(CH₂)₁₈CH₃'], { sources: ['s4'], properties: '白色の固体。水にほとんど溶けない。', uses: '研究用標準物質、相変化材料。', nature: '石油の高沸点留分に含まれる。', notes: '', precursors: '石油の分留、または長鎖アルコールの還元で得られる。', reactions: '燃焼、ラジカル置換。', dataStatus: 'class' });
  cond('sodium-acetate', '酢酸ナトリウム', 'C2H3NaO2', 'carboxylic', ['CH₃COO⁻Na⁺'], { sources: ['s2', 's3'], properties: '白色の固体。水に溶けやすい。', uses: '緩衝液、食品添加物、加熱によるメタン発生の実験。', nature: '酢酸と水酸化ナトリウムの中和で生成する。', notes: '', precursors: '酢酸と水酸化ナトリウム（または炭酸ナトリウム）の中和で製造。', reactions: '中和、ソーダ石灰と加熱すると脱炭酸してメタンを生じる。', dataStatus: 'full', pubchem: 31372 });
  cond('sodium-phenoxide', 'ナトリウムフェノキシド（フェノキシドナトリウム）', 'C6H5NaO', 'phenol', ['C₆H₅O⁻Na⁺'], { sources: ['s6', 's18'], properties: '白色〜淡黄色の固体。水に溶けやすい。', uses: 'サリチル酸合成（コルベ・シュミット反応）の中間体、有機合成試薬。', nature: 'フェノールと水酸化ナトリウムの中和で生成する。', notes: '', precursors: 'フェノールと水酸化ナトリウム水溶液から生成。', reactions: '二酸化炭素と加熱するとサリチル酸ナトリウム、酸でフェノールに戻る。', dataStatus: 'full' });
  cond('sodium-benzenesulfonate', 'ベンゼンスルホン酸ナトリウム', 'C6H5NaO3S', 'aromatic-other', ['C₆H₅SO₃⁻Na⁺'], { sources: ['s18'], properties: '白色の固体。水に溶けやすい。', uses: 'フェノール合成（アルカリ融解）の中間体、界面活性剤の原料。', nature: 'ベンゼンのスルホン化後、中和して得られる。', notes: '', precursors: 'ベンゼンを濃硫酸でスルホン化し、水酸化ナトリウムで中和。', reactions: '水酸化ナトリウムと高温で融解するとフェノールを生じる。', dataStatus: 'full', pubchem: 517327 });
  comp('acetic-anhydride', '無水酢酸', 'C4H6O3', 'carboxylic', customGraph([["O",230,86,0],["O",133,254,0],["O",327,254,0],["C",133,142,0],["C",327,142,0],["C",36,86,3],["C",424,86,3]], [[0,3,1],[0,4,1],[1,3,2],[2,4,2],[3,5,1],[4,6,1]], 460, 340), { sources: ['s5', 's18'], properties: '無色の液体。刺激臭がある。', uses: 'アセチル化剤、アスピリン・酢酸セルロースの合成。', nature: '酢酸2分子の脱水縮合で生成する酸無水物。', hazards: '腐食性・催涙性。', notes: '', precursors: '酢酸の脱水、またはケテンと酢酸の反応で製造。', reactions: '加水分解で酢酸、アルコール・アミンをアセチル化。', dataStatus: 'full', pubchem: 7918, subcategory: '酸無水物' });
  comp('maleic-anhydride', '無水マレイン酸', 'C4H2O3', 'carboxylic', customGraph([["O",230,254.8,0],["O",424,224.1,0],["O",36,224.1,0],["C",285.1,85.2,1],["C",174.9,85.2,1],["C",319.2,190,0],["C",140.8,190,0]], [[0,5,1],[0,6,1],[1,5,2],[2,6,2],[3,4,2],[3,5,1],[4,6,1]], 460, 340), { sources: ['s17'], properties: '白色の針状結晶。刺激臭がある。', uses: '不飽和ポリエステル・アルキド樹脂の原料。', nature: 'マレイン酸の分子内脱水で生成する5員環酸無水物。', hazards: '腐食性・刺激性。', notes: '', precursors: 'ベンゼンまたはブタンの酸化で得たマレイン酸を脱水。', reactions: '加水分解でマレイン酸、付加・共重合。', dataStatus: 'full', pubchem: 7923, subcategory: '酸無水物' });
  comp('phthalic-anhydride', '無水フタル酸', 'C8H4O3', 'carboxylic', customGraph([["O",354.5,170,0],["O",333.7,304,0],["O",333.7,36,0],["C",237.7,208.2,0],["C",237.7,131.8,0],["C",171.6,246.3,1],["C",171.6,93.7,1],["C",310,231.4,0],["C",310,108.6,0],["C",105.5,208.2,1],["C",105.5,131.8,1]], [[0,7,1],[0,8,1],[1,7,2],[2,8,2],[3,4,1],[3,5,2],[3,7,1],[4,6,2],[4,8,1],[5,9,1],[6,10,1],[9,10,2]], 460, 340), { sources: ['s17', 's18'], properties: '白色の結晶。昇華性がある。', uses: '可塑剤、ポリエステル、フェノールフタレインの原料。', nature: 'フタル酸の分子内脱水で生成する酸無水物。', hazards: '刺激性。', notes: '', precursors: 'o-キシレンまたはナフタレンの酸化で得たフタル酸を脱水。', reactions: '加水分解でフタル酸、フェノールと縮合してフェノールフタレイン。', dataStatus: 'full', pubchem: 6811, subcategory: '酸無水物' });
  comp('cellobiose', 'セロビオース', 'C12H22O11', 'sugar', { type: 'schematic', kind: 'cellobiose', composition: { C: 12, H: 22, O: 11 } }, { sources: ['s1', 's8'], properties: '白色の結晶。水に溶けやすい。', uses: 'セルロースの加水分解生成物、還元性の二糖。', nature: 'セルロースの部分加水分解で生成する。', notes: '', precursors: 'セルロースをセルラーゼで加水分解すると生成する。', reactions: '加水分解でβ-D-グルコース2分子、還元性を示す。', dataStatus: 'full', subcategory: '二糖', formulaVariable: false, pubchem: 439178 });
  comp('trehalose', 'トレハロース', 'C12H22O11', 'sugar', { type: 'schematic', kind: 'trehalose', composition: { C: 12, H: 22, O: 11 } }, { sources: ['s17'], properties: '白色の結晶。水に溶けやすい。', uses: '食品の保湿剤、保護剤。', nature: '菌類・昆虫・植物などに含まれる非還元性の二糖。', notes: '', precursors: 'デンプンから酵素法で製造される。', reactions: '加水分解でα-D-グルコース2分子、非還元性。', dataStatus: 'full', subcategory: '二糖', formulaVariable: false, pubchem: 7427 });
  comp('ninhydrin', 'ニンヒドリン', 'C9H6O4', 'aromatic-other', customGraph([["O",385.4,214.9,1],["O",385.4,125.1,1],["O",302.8,36,0],["O",302.8,304,0],["C",323.6,170,0],["C",206.8,131.8,0],["C",206.8,208.2,0],["C",279.1,108.6,0],["C",279.1,231.4,0],["C",140.7,93.7,1],["C",140.7,246.3,1],["C",74.6,131.8,1],["C",74.6,208.2,1]], [[0,4,1],[1,4,1],[2,7,2],[3,8,2],[4,7,1],[4,8,1],[5,6,1],[5,7,1],[5,9,2],[6,8,1],[6,10,2],[9,11,1],[10,12,1],[11,12,2]], 460, 340), { sources: ['s9', 's14'], properties: '白色〜淡黄色の結晶。水にやや溶ける。', uses: 'アミノ酸・タンパク質の検出試薬、指紋検出。', nature: 'インダン-1,2,3-トリオンの水和物。', notes: '', precursors: 'インダンから酸化・加水分解を経て合成。', reactions: 'アミノ酸と加熱するとルーエマン紫を生成する。', dataStatus: 'full', pubchem: 10236, subcategory: '試薬' });
  comp('p-hydroxyazobenzene', 'p-ヒドロキシアゾベンゼン（p-フェニルアゾフェノール）', 'C12H10N2O', 'aromatic-other', customGraph([["O",214.5,304,1],["N",214.5,161.1,0],["N",245.5,143.2,0],["C",214.5,196.8,0],["C",245.5,107.5,0],["C",183.6,214.7,1],["C",245.5,214.7,1],["C",214.5,268.3,0],["C",183.6,250.4,1],["C",245.5,250.4,1],["C",276.4,89.6,1],["C",214.5,89.6,1],["C",276.4,53.9,1],["C",214.5,53.9,1],["C",245.5,36,1]], [[0,7,1],[1,2,2],[1,3,1],[2,4,1],[3,5,2],[3,6,1],[4,10,2],[4,11,1],[5,8,1],[6,9,2],[7,8,2],[7,9,1],[10,12,1],[11,13,2],[12,14,2],[13,14,1]], 460, 340), { sources: ['s6', 's18'], properties: '橙色の固体。水に溶けにくい。', uses: 'アゾ染料、pH指示薬の研究。', nature: 'ベンゼンジアゾニウム塩とフェノキシドのカップリングで生成する。', notes: '', precursors: '塩化ベンゼンジアゾニウムとナトリウムフェノキシドをカップリング。', reactions: '還元でアニリンとp-アミノフェノール、pHで色が変わる。', dataStatus: 'full', pubchem: 15529, subcategory: 'アゾ染料' });
  comp('p-divinylbenzene', 'p-ジビニルベンゼン', 'C10H10', 'aromatic', customGraph([["C",230,223.6,0],["C",230,116.4,0],["C",183.6,196.8,1],["C",183.6,143.2,1],["C",276.4,196.8,1],["C",276.4,143.2,1],["C",230,277.2,1],["C",230,62.8,1],["C",183.6,304,2],["C",276.4,36,2]], [[0,2,2],[0,4,1],[0,6,1],[1,3,2],[1,5,1],[1,7,1],[2,3,1],[4,5,2],[6,8,2],[7,9,2]], 460, 340), { sources: ['s12'], properties: '無色の液体。重合しやすい。', uses: 'スチレンの架橋剤、イオン交換樹脂の原料。', nature: 'ベンゼン環にビニル基が2つ結合した化合物。', hazards: '可燃性・刺激性。', notes: '', precursors: 'ジエチルベンゼンの脱水素などで製造。', reactions: 'ラジカル共重合で架橋ポリスチレンを形成。', dataStatus: 'full', pubchem: 66041, subcategory: '架橋剤' });
  comp('guaiacol', 'グアイアコール（2-メトキシフェノール）', 'C7H8O2', 'phenol', customGraph([["O",263.2,74.3,0],["O",130.5,150.9,1],["C",263.2,150.9,0],["C",196.8,189.1,0],["C",329.5,189.1,1],["C",196.8,265.7,1],["C",329.5,265.7,1],["C",263.2,304,1],["C",329.5,36,3]], [[0,2,1],[0,8,1],[1,3,1],[2,3,1],[2,4,2],[3,5,2],[4,6,1],[5,7,1],[6,7,2]], 460, 340), { sources: ['s19'], properties: '無色〜淡黄色の液体。特異な香気がある。', uses: '香料、医薬品原料、染料の中間体。', nature: '木材の乾留タールに含まれる。', hazards: '刺激性。', notes: '', precursors: '木材タールから分離、またはカテコールのメチル化で製造。', reactions: '酸化、エステル化、求電子置換。', dataStatus: 'full', pubchem: 460 });
  comp('n,n-dimethylaniline', 'N,N-ジメチルアニリン', 'C8H11N', 'aromatic-amine', customGraph([["N",230,74.3,0],["C",230,150.9,0],["C",296.3,189.1,1],["C",163.7,189.1,1],["C",296.3,36,3],["C",163.7,36,3],["C",296.3,265.7,1],["C",163.7,265.7,1],["C",230,304,1]], [[0,1,1],[0,4,1],[0,5,1],[1,2,2],[1,3,1],[2,6,1],[3,7,2],[6,8,2],[7,8,1]], 460, 340), { sources: ['s19'], properties: '淡黄色の液体。特異な臭気がある。', uses: 'アゾ染料のカップリング成分、有機合成試薬。', nature: 'アニリンのN-メチル化で生成する三級アミン。', hazards: '有毒・刺激性。', notes: '', precursors: 'アニリンとメタノールの気相メチル化などで製造。', reactions: 'ジアゾカップリング、酸化、中和。', dataStatus: 'full', pubchem: 949 });
  comp('sulfanilic-acid', 'スルファニル酸（p-アミノベンゼンスルホン酸）', 'C6H7NO3S', 'aromatic-other', customGraph([["S",230,89.6,0],["O",230,36,1],["O",283.6,89.6,0],["O",176.4,89.6,0],["N",230,304,2],["C",230,143.2,0],["C",183.6,170,1],["C",276.4,170,1],["C",230,250.4,0],["C",183.6,223.6,1],["C",276.4,223.6,1]], [[0,1,1],[0,2,2],[0,3,2],[0,5,1],[4,8,1],[5,6,2],[5,7,1],[6,9,1],[7,10,2],[8,9,2],[8,10,1]], 460, 340), { sources: ['s19'], properties: '白色の結晶。水にやや溶けにくい。', uses: 'アゾ染料の中間体、分析試薬。', nature: 'アニリンのスルホン化で生成する両性の化合物。', notes: '', precursors: 'アニリンを濃硫酸と加熱してスルホン化。', reactions: 'ジアゾ化、中和、アゾカップリング。', dataStatus: 'full', pubchem: 8479, subcategory: 'スルホン酸' });
  comp('2-nitrobenzaldehyde', '2-ニトロベンズアルデヒド', 'C7H5NO3', 'aromatic-other', customGraph([["O",362.6,36,0,"-"],["O",230,36,0],["O",97.4,189.1,0],["N",296.3,74.3,0,"+"],["C",296.3,150.9,0],["C",230,189.1,0],["C",362.6,189.1,1],["C",230,265.7,1],["C",362.6,265.7,1],["C",296.3,304,1],["C",163.7,150.9,1]], [[0,3,1],[1,3,2],[2,10,2],[3,4,1],[4,5,1],[4,6,2],[5,7,2],[5,10,1],[6,8,1],[7,9,1],[8,9,2]], 460, 340), { sources: ['s19'], properties: '淡黄色の結晶。', uses: '有機合成中間体、光反応の研究。', nature: 'ベンズアルデヒドのo-位にニトロ基をもつ化合物。', notes: '', precursors: 'o-ニトロトルエンの酸化、またはベンズアルデヒドのニトロ化で製造。', reactions: '酸化で2-ニトロ安息香酸、還元でアミノ体。', dataStatus: 'full', pubchem: 11101 });
  comp('indigo', 'インジゴ', 'C16H10N2O2', 'aromatic-other', customGraph([["O",190.1,99,1],["O",269.9,99,0],["N",174.1,231,1],["N",285.9,231,0],["C",204.2,189.5,0],["C",125.3,163.7,0],["C",125.3,215.3,0],["C",255.8,189.5,0],["C",174.1,148,0],["C",334.7,163.7,0],["C",285.9,148,0],["C",334.7,215.3,0],["C",80.7,137.9,1],["C",80.7,241,1],["C",379.3,137.9,1],["C",379.3,241,1],["C",36,163.7,1],["C",36,215.3,1],["C",424,163.7,1],["C",424,215.3,1]], [[0,8,1],[1,10,2],[2,4,1],[2,6,1],[3,7,2],[3,11,1],[4,7,1],[4,8,2],[5,6,1],[5,8,1],[5,12,2],[6,13,2],[7,10,1],[9,10,1],[9,11,1],[9,14,2],[11,15,2],[12,16,1],[13,17,1],[14,18,1],[15,19,1],[16,17,2],[18,19,2]], 460, 340), { sources: ['s19'], properties: '濃青色の固体。水にほとんど溶けない。', uses: '藍染めの染料、建染染料。', nature: '藍（タデアイなど）に含まれる色素。', notes: '', precursors: '植物から抽出、またはアニリンなどを原料に合成。', reactions: '還元で水溶性のロイコ体、酸化でインジゴに戻る。', dataStatus: 'full', pubchem: 10215, subcategory: '染料' });
  comp('alizarin', 'アリザリン', 'C14H8O4', 'aromatic-other', customGraph([["O",312.4,43.7,1],["O",202.9,45.8,0],["O",202.9,296.3,0],["O",424,106.9,1],["C",257.2,139.8,0],["C",257.2,202.4,0],["C",148.7,139.8,0],["C",148.7,202.4,0],["C",202.9,108.5,0],["C",202.9,233.7,0],["C",313.2,106.3,0],["C",313.2,235.9,1],["C",92.7,106.3,1],["C",92.7,235.9,1],["C",369.9,138.5,0],["C",369.9,203.7,1],["C",36,138.5,1],["C",36,203.7,1]], [[0,10,1],[1,8,2],[2,9,2],[3,14,1],[4,5,2],[4,8,1],[4,10,1],[5,9,1],[5,11,1],[6,7,1],[6,8,1],[6,12,2],[7,9,1],[7,13,2],[10,14,2],[11,15,2],[12,16,1],[13,17,1],[14,15,1],[16,17,2]], 460, 340), { sources: ['s19'], properties: '橙赤色の結晶。水に溶けにくい。', uses: '媒染染料、分析試薬。', nature: 'アカネの根に含まれるアントラキノン色素。', notes: '', precursors: 'アカネから抽出、またはアントラキノンの水酸化で合成。', reactions: '金属イオンとキレートを形成、スルホン化。', dataStatus: 'full', pubchem: 6293, subcategory: '染料' });
  comp('shikonin', 'シコニン', 'C16H16O5', 'aromatic-other', customGraph([["O",207,268.7,1],["O",292.4,268.7,0],["O",378.7,270.4,1],["O",292.4,71.3,0],["O",378.7,69.6,1],["C",207,219.4,1],["C",249.7,194.7,0],["C",164.2,194.7,2],["C",335.2,194.7,0],["C",292.4,219.4,0],["C",335.2,145.3,0],["C",249.7,145.3,1],["C",292.4,120.6,0],["C",121.5,219.4,1],["C",379.3,221.1,0],["C",379.3,118.9,0],["C",78.7,194.7,0],["C",424,195.7,1],["C",424,144.3,1],["C",36,219.4,3],["C",78.7,145.3,3]], [[0,5,1],[1,9,2],[2,14,1],[3,12,2],[4,15,1],[5,6,1],[5,7,1],[6,9,1],[6,11,2],[7,13,1],[8,9,1],[8,10,1],[8,14,2],[10,12,1],[10,15,2],[11,12,1],[13,16,2],[14,17,1],[15,18,1],[16,19,1],[16,20,1],[17,18,2]], 460, 340), { sources: ['s19'], properties: '紫紅色の固体。', uses: '紫根染めの染料、研究用試薬。', nature: 'ムラサキの根に含まれるナフトキノン色素。', notes: '', precursors: 'ムラサキの根から抽出。', reactions: '酸化還元、金属キレート。', dataStatus: 'full', pubchem: 479503, subcategory: '染料' });
  comp('carminic-acid', 'カルミン酸', 'C22H20O13', 'aromatic-other', customGraph([["O",328,132.2,0],["O",360.3,224.2,1],["O",424,187.1,1],["O",423.7,113.4,1],["O",391.6,58.2,1],["O",262.5,131.8,1],["O",328.2,244.5,1],["O",262.5,281.8,1],["O",198.1,133.1,0],["O",198.1,280.5,0],["O",68,244.5,1],["O",36,187.3,1],["O",68.1,132.2,0],["C",328.2,169,1],["C",360.2,187.3,1],["C",392,168.8,1],["C",391.9,131.9,1],["C",359.9,113.6,1],["C",296.3,187.6,0],["C",359.7,76.8,2],["C",262.9,168.7,0],["C",296.3,226,0],["C",230,188.4,0],["C",230,225.2,0],["C",262.9,244.9,0],["C",198.1,169.9,0],["C",166.2,188.4,0],["C",198.1,243.6,0],["C",166.2,225.2,0],["C",133.2,168.7,0],["C",133.2,244.9,1],["C",99.8,187.6,0],["C",99.8,226,0],["C",133.7,131.8,3],["C",68,169,0]], [[0,13,1],[0,17,1],[1,14,1],[2,15,1],[3,16,1],[4,19,1],[5,20,1],[6,21,1],[7,24,1],[8,25,2],[9,27,2],[10,32,1],[11,34,1],[12,34,2],[13,14,1],[13,18,1],[14,15,1],[15,16,1],[16,17,1],[17,19,1],[18,20,2],[18,21,1],[20,22,1],[21,24,2],[22,23,2],[22,25,1],[23,24,1],[23,27,1],[25,26,1],[26,28,1],[26,29,2],[27,28,1],[28,30,2],[29,31,1],[29,33,1],[30,32,1],[31,32,2],[31,34,1]], 460, 340), { sources: ['s19'], properties: '赤色の固体。水にやや溶ける。', uses: '食品・化粧品の赤色色素、媒染染料。', nature: 'コチニールカイガラムシから得られるアントラキノン色素。', notes: '', precursors: 'コチニールから抽出。', reactions: '金属キレート（媒染）、酸化。', dataStatus: 'full', pubchem: 10255083, subcategory: '染料' });
  comp('dibromoindigo', 'ジブロモインジゴ（6,6′-ジブロモインジゴ）', 'C16H8Br2N2O2', 'aromatic-other', customGraph([["Br",36,227.7,0],["Br",424,227.7,0],["O",197.6,112.3,1],["O",262.4,112.3,0],["N",184.6,219.6,1],["N",275.4,219.6,0],["C",209,185.8,0],["C",144.9,164.9,0],["C",144.9,206.8,0],["C",251,185.8,0],["C",184.6,152.1,0],["C",315.1,164.9,0],["C",275.4,152.1,0],["C",315.1,206.8,0],["C",108.6,143.9,1],["C",108.6,227.7,1],["C",351.4,143.9,1],["C",351.4,227.7,1],["C",72.3,164.9,1],["C",72.3,206.8,0],["C",387.7,164.9,1],["C",387.7,206.8,0]], [[0,19,1],[1,21,1],[2,10,1],[3,12,2],[4,6,1],[4,8,1],[5,9,2],[5,13,1],[6,9,1],[6,10,2],[7,8,2],[7,10,1],[7,14,1],[8,15,1],[9,12,1],[11,12,1],[11,13,2],[11,16,1],[13,17,1],[14,18,2],[15,19,2],[16,20,2],[17,21,2],[18,19,1],[20,21,1]], 460, 340), { sources: ['s19'], properties: '紫色の固体。水にほとんど溶けない。', uses: '古代紫（ティルス紫）の色素。', nature: 'ムラサキガイなどの分泌物に含まれる色素。', notes: '', precursors: '貝から抽出、またはインジゴの臭素化で合成。', reactions: '還元・酸化（建染染料）。', dataStatus: 'full', pubchem: 177057, subcategory: '染料' });
  comp('carthamin', 'カルタミン', 'C43H42O22', 'aromatic-other', customGraph([["O",284.6,95.4,0],["O",193.5,251.2,0],["O",227.4,75.6,1],["O",250,229.6,1],["O",238.9,95.4,1],["O",250.3,36,1],["O",228.5,221.8,1],["O",257.9,274.6,1],["O",296,36,1],["O",222.9,304,1],["O",210.7,115.2,1],["O",289.9,115.2,1],["O",176.7,239.4,1],["O",330.3,55.8,1],["O",158.5,280.5,1],["O",237.4,188.5,0],["O",258.1,182.4,0],["O",162.9,161.4,0],["O",289.9,183.8,0],["O",139.5,225.9,0],["O",408.7,115.2,1],["O",51.3,120.8,1],["C",261.7,95.4,1],["C",211,236.5,1],["C",250.3,75.6,1],["C",232.5,244.3,1],["C",250.3,115.2,0],["C",261.7,55.8,1],["C",207,213.9,0],["C",236.5,266.8,1],["C",284.6,55.8,1],["C",296,75.6,1],["C",218.9,281.5,1],["C",197.5,273.7,1],["C",230.5,126.6,0],["C",270.1,126.6,0],["C",214.9,192.5,0],["C",184.5,217.9,0],["C",318.9,75.6,2],["C",179.9,288.4,2],["C",230.5,149.5,0],["C",200.2,174.9,0],["C",270.1,149.5,0],["C",169.8,200.4,0],["C",208,153.5,1],["C",250.3,160.9,0],["C",177.6,178.9,0],["C",289.9,160.9,0],["C",147.3,204.4,0],["C",309.7,149.5,1],["C",132.6,186.9,1],["C",329.5,160.9,1],["C",110.1,190.8,1],["C",349.3,149.5,0],["C",95.4,173.3,0],["C",349.3,126.6,1],["C",369.1,160.9,1],["C",103.2,151.8,1],["C",72.9,177.3,1],["C",369.1,115.2,1],["C",388.9,149.5,1],["C",88.5,134.3,1],["C",58.2,159.8,1],["C",388.9,126.6,0],["C",66,138.3,0]], [[0,22,1],[0,31,1],[1,23,1],[1,33,1],[2,24,1],[3,25,1],[4,26,1],[5,27,1],[6,28,1],[7,29,1],[8,30,1],[9,32,1],[10,34,1],[11,35,1],[12,37,1],[13,38,1],[14,39,1],[15,36,2],[16,45,2],[17,46,2],[18,47,2],[19,48,2],[20,63,1],[21,64,1],[22,24,1],[22,26,1],[23,25,1],[23,28,1],[24,27,1],[25,29,1],[26,34,1],[26,35,1],[27,30,1],[28,36,1],[28,37,1],[29,32,1],[30,31,1],[31,38,1],[32,33,1],[33,39,1],[34,40,2],[35,42,2],[36,41,1],[37,43,2],[40,44,1],[40,45,1],[41,44,2],[41,46,1],[42,45,1],[42,47,1],[43,46,1],[43,48,1],[47,49,1],[48,50,1],[49,51,2],[50,52,2],[51,53,1],[52,54,1],[53,55,2],[53,56,1],[54,57,2],[54,58,1],[55,59,1],[56,60,2],[57,61,1],[58,62,2],[59,63,2],[60,63,1],[61,64,2],[62,64,1]], 460, 340), { sources: ['s19'], properties: '紅色の固体。水にやや溶けにくい。', uses: 'ベニバナの赤色色素、染料。', nature: 'ベニバナの花に含まれる色素。', notes: '', precursors: 'ベニバナから抽出。', reactions: '加水分解、酸化で退色。', dataStatus: 'full', pubchem: 135565560, subcategory: '染料' });
  comp('quercetin', 'ケルセチン', 'C15H10O7', 'aromatic-other', customGraph([["O",210.6,182.9,0],["O",294.5,86.1,1],["O",126,36,1],["O",210.6,37.7,0],["O",39.7,184.1,1],["O",336.4,304,1],["O",420.3,255.6,1],["C",168.7,110.3,0],["C",168.7,158.7,0],["C",252.6,158.7,0],["C",294.5,182.9,0],["C",252.6,110.3,0],["C",210.6,86.1,0],["C",125.4,84.4,0],["C",125.4,184.6,1],["C",81.5,159.7,0],["C",294.5,231.4,1],["C",81.5,109.3,1],["C",336.4,158.7,1],["C",336.4,255.6,0],["C",378.4,182.9,1],["C",378.4,231.4,0]], [[0,8,1],[0,9,1],[1,11,1],[2,13,1],[3,12,2],[4,15,1],[5,19,1],[6,21,1],[7,8,1],[7,12,1],[7,13,2],[8,14,2],[9,10,1],[9,11,2],[10,16,2],[10,18,1],[11,12,1],[13,17,1],[14,15,1],[15,17,2],[16,19,1],[18,20,2],[19,21,2],[20,21,1]], 460, 340), { sources: ['s19'], properties: '黄色の結晶。水に溶けにくい。', uses: '天然色素、抗酸化物質の研究。', nature: 'タマネギの皮・ソバなどに含まれるフラボノイド。', notes: '', precursors: '植物から抽出、またはルチンの加水分解で得られる。', reactions: '酸化、金属キレート、配糖化。', dataStatus: 'full', pubchem: 5280343, subcategory: 'フラボノイド' });
  comp('acetaminophen', 'アセトアミノフェン', 'C8H9NO2', 'aromatic-other', customGraph([["O",208.9,304,1],["O",293.3,109.1,0],["N",208.9,109.1,1],["C",208.9,157.8,0],["C",251.1,182.2,1],["C",166.7,182.2,1],["C",251.1,230.9,1],["C",166.7,230.9,1],["C",208.9,255.3,0],["C",251.1,84.7,0],["C",251.1,36,3]], [[0,8,1],[1,9,2],[2,3,1],[2,9,1],[3,4,2],[3,5,1],[4,6,1],[5,7,2],[6,8,2],[7,8,1],[9,10,1]], 460, 340), { sources: ['s21'], properties: '白色の結晶。水にやや溶けにくい。', uses: '解熱鎮痛薬。', nature: 'p-アミノフェノールのアセチル化で生成する。', notes: '', precursors: 'p-アミノフェノールを無水酢酸でアセチル化。', reactions: '加水分解でp-アミノフェノールと酢酸。', dataStatus: 'full', pubchem: 1983, subcategory: '医薬品' });
  comp('ibuprofen', 'イブプロフェン', 'C13H18O2', 'carboxylic', customGraph([["O",263.2,36,1],["O",296.3,93.4,0],["C",196.8,265.7,1],["C",230,246.6,2],["C",230,208.3,0],["C",230,131.7,0],["C",230,93.4,1],["C",196.8,304,3],["C",163.7,246.6,3],["C",263.2,189.1,1],["C",196.8,189.1,1],["C",263.2,150.9,1],["C",196.8,150.9,1],["C",196.8,74.3,3],["C",263.2,74.3,0]], [[0,14,1],[1,14,2],[2,3,1],[2,7,1],[2,8,1],[3,4,1],[4,9,2],[4,10,1],[5,6,1],[5,11,2],[5,12,1],[6,13,1],[6,14,1],[9,11,1],[10,12,2]], 460, 340), { sources: ['s21'], properties: '白色の結晶。水に溶けにくい。', uses: '非ステロイド性抗炎症薬・解熱鎮痛薬。', nature: 'イソブチルベンゼン誘導体のカルボン酸。', notes: '', precursors: 'イソブチルベンゼンの酸化などを経て工業合成。', reactions: '中和、エステル化。', dataStatus: 'full', pubchem: 3672, subcategory: '医薬品' });
  comp('sulfanilamide', 'スルファニルアミド', 'C6H8N2O2S', 'aromatic-other', customGraph([["S",230,89.6,0],["O",283.6,89.6,0],["O",176.4,89.6,0],["N",230,36,2],["N",230,304,2],["C",230,143.2,0],["C",183.6,170,1],["C",276.4,170,1],["C",230,250.4,0],["C",183.6,223.6,1],["C",276.4,223.6,1]], [[0,1,2],[0,2,2],[0,3,1],[0,5,1],[4,8,1],[5,6,2],[5,7,1],[6,9,1],[7,10,2],[8,9,2],[8,10,1]], 460, 340), { sources: ['s21'], properties: '白色の結晶。水にやや溶けにくい。', uses: 'サルファ薬の基本骨格、抗菌薬の研究。', nature: 'p-アミノベンゼンスルホンアミド。', notes: '', precursors: 'p-アセトアミノベンゼンスルホニルクロリドのアミノ化後、加水分解。', reactions: 'ジアゾ化、アセチル化、加水分解。', dataStatus: 'full', pubchem: 5333, subcategory: '医薬品' });
  comp('p-hydroxybenzoic-acid', 'p-ヒドロキシ安息香酸', 'C7H6O3', 'carboxylic', customGraph([["O",230,304,1],["O",281.6,36,1],["O",178.4,36,0],["C",230,125.3,0],["C",281.6,155.1,1],["C",178.4,155.1,1],["C",230,244.4,0],["C",281.6,214.7,1],["C",178.4,214.7,1],["C",230,65.8,0]], [[0,6,1],[1,9,1],[2,9,2],[3,4,2],[3,5,1],[3,9,1],[4,7,1],[5,8,2],[6,7,2],[6,8,1]], 460, 340), { sources: ['s21'], properties: '白色の結晶。水にやや溶けにくい。', uses: '防腐剤（パラベン）の原料、有機合成中間体。', nature: 'ベンゼン環のp-位にヒドロキシ基とカルボキシ基をもつ。', notes: '', precursors: 'p-クレゾールの酸化、またはフェノールのカルボキシル化で製造。', reactions: 'エステル化でパラベン、中和。', dataStatus: 'full', pubchem: 135 });
  comp('m-hydroxybenzoic-acid', 'm-ヒドロキシ安息香酸', 'C7H6O3', 'carboxylic', customGraph([["O",130.5,304,1],["O",329.5,36,1],["O",196.8,36,0],["C",263.2,150.9,0],["C",196.8,189.1,1],["C",329.5,189.1,1],["C",196.8,265.7,0],["C",329.5,265.7,1],["C",263.2,304,1],["C",263.2,74.3,0]], [[0,6,1],[1,9,1],[2,9,2],[3,4,2],[3,5,1],[3,9,1],[4,6,1],[5,7,2],[6,8,2],[7,8,1]], 460, 340), { sources: ['s21'], properties: '白色の結晶。水にやや溶けにくい。', uses: '有機合成中間体、異性体の比較。', nature: 'ベンゼン環のm-位にヒドロキシ基とカルボキシ基をもつ。', notes: '', precursors: 'm-アミノ安息香酸の加水分解などで製造。', reactions: 'エステル化、中和。', dataStatus: 'full', pubchem: 7420 });
  comp('2,4,6-tribromophenol', '2,4,6-トリブロモフェノール', 'C6H3Br3O', 'phenol', customGraph([["Br",346,103,0],["Br",114,103,0],["Br",230,304,0],["O",230,36,1],["C",230,103,0],["C",288,136.5,0],["C",172,136.5,0],["C",288,203.5,1],["C",172,203.5,1],["C",230,237,0]], [[0,5,1],[1,6,1],[2,9,1],[3,4,1],[4,5,2],[4,6,1],[5,7,1],[6,8,2],[7,9,2],[8,9,1]], 460, 340), { sources: ['s21'], properties: '白色〜淡黄色の固体。水に溶けにくい。', uses: '難燃剤、防腐剤、有機合成中間体。', nature: 'フェノールの臭素化で生成する。', hazards: '刺激性。', notes: '', precursors: 'フェノールと臭素の反応で製造。', reactions: '脱臭素化、エーテル化。', dataStatus: 'full', pubchem: 1483 });
  comp('adipoyl-chloride', 'アジピン酸ジクロリド', 'C6H8Cl2O2', 'carboxylic', customGraph([["Cl",36,154,0],["Cl",424,186,0],["O",91.4,250,0],["O",368.6,90,0],["C",202.3,186,2],["C",257.7,154,2],["C",146.9,154,2],["C",313.1,186,2],["C",91.4,186,0],["C",368.6,154,0]], [[0,8,1],[1,9,1],[2,8,2],[3,9,2],[4,5,1],[4,6,1],[5,7,1],[6,8,1],[7,9,1]], 460, 340), { sources: ['s20'], properties: '無色の液体。刺激臭がある。', uses: 'ナイロン-6,6の原料。', nature: 'アジピン酸の二酸塩化物。', hazards: '腐食性・催涙性。', notes: '', precursors: 'アジピン酸と塩化チオニルなどの反応で製造。', reactions: 'アミンと縮合してアミド結合を形成。', dataStatus: 'full', pubchem: 61034, subcategory: '酸塩化物' });
  comp('6-aminohexanoic-acid', '6-アミノヘキサン酸', 'C6H13NO2', 'amino', customGraph([["O",36,122,1],["O",91.4,218,0],["N",424,154,2],["C",257.7,122,2],["C",202.3,154,2],["C",313.1,154,2],["C",146.9,122,2],["C",368.6,122,2],["C",91.4,154,0]], [[0,8,1],[1,8,2],[2,7,1],[3,4,1],[3,5,1],[4,6,1],[5,7,1],[6,8,1]], 460, 340), { sources: ['s20'], properties: '白色の結晶。水に溶けやすい。', uses: 'ナイロン-6の原料、生分解性ポリマーの研究。', nature: 'アミノ基とカルボキシ基を両端にもつ。', notes: '', precursors: 'シクロヘキサノンオキシムの転位などで得たカプロラクタムの加水分解で生成。', reactions: '縮重合でナイロン-6、分子内でラクタム化。', dataStatus: 'full', pubchem: 564, subcategory: 'アミノ酸' });
  comp('adenine', 'アデニン', 'C5H5N5', 'natural-polymer', customGraph([["N",323.6,142.8,1],["N",323.6,286.6,0],["N",161.7,304,0],["N",84.3,170,0],["N",161.7,36,2],["C",239,170,0],["C",239,259.3,0],["C",161.7,125.3,0],["C",375.7,214.7,1],["C",84.3,259.3,1]], [[0,5,1],[0,8,1],[1,6,1],[1,8,2],[2,6,2],[2,9,1],[3,7,1],[3,9,2],[4,7,1],[5,6,1],[5,7,2]], 460, 340), { sources: ['s7'], properties: '白色の固体。水にやや溶けにくい。', uses: '核酸塩基、生化学的研究。', nature: 'DNA・RNAのプリン塩基。', notes: '', precursors: '核酸の加水分解で得られる。', reactions: '水素結合、メチル化。', dataStatus: 'full', pubchem: 190, subcategory: '核酸塩基' });
  comp('guanine', 'グアニン', 'C5H5N5O', 'natural-polymer', customGraph([["O",200.4,36,0],["N",362.2,142.8,1],["N",123,170,1],["N",200.4,304,0],["N",362.2,286.6,0],["N",45.6,304,2],["C",277.7,170,0],["C",277.7,259.3,0],["C",200.4,125.3,0],["C",123,259.3,0],["C",414.4,214.7,1]], [[0,8,2],[1,6,1],[1,10,1],[2,8,1],[2,9,1],[3,7,1],[3,9,2],[4,7,1],[4,10,2],[5,9,1],[6,7,2],[6,8,1]], 460, 340), { sources: ['s7'], properties: '白色の固体。水に溶けにくい。', uses: '核酸塩基、生化学的研究。', nature: 'DNA・RNAのプリン塩基。', notes: '', precursors: '核酸の加水分解で得られる。', reactions: '水素結合、酸化。', dataStatus: 'full', pubchem: 135398634, subcategory: '核酸塩基' });
  comp('cytosine', 'シトシン', 'C4H5N3O', 'natural-polymer', customGraph([["O",424,282,0],["N",230,282,1],["N",36,282,2],["N",327,114,0],["C",133,226,0],["C",133,114,1],["C",327,226,0],["C",230,58,1]], [[0,6,2],[1,4,1],[1,6,1],[2,4,1],[3,6,1],[3,7,2],[4,5,2],[5,7,1]], 460, 340), { sources: ['s7'], properties: '白色の固体。水にやや溶ける。', uses: '核酸塩基、生化学的研究。', nature: 'DNA・RNAのピリミジン塩基。', notes: '', precursors: '核酸の加水分解で得られる。', reactions: '水素結合、脱アミノ化でウラシル。', dataStatus: 'full', pubchem: 597, subcategory: '核酸塩基' });
  comp('thymine', 'チミン', 'C5H6N2O2', 'natural-polymer', customGraph([["O",36,282,0],["O",424,282,0],["N",230,282,1],["N",327,114,1],["C",133,114,0],["C",133,226,0],["C",230,58,1],["C",36,58,3],["C",327,226,0]], [[0,5,2],[1,8,2],[2,5,1],[2,8,1],[3,6,1],[3,8,1],[4,5,1],[4,6,2],[4,7,1]], 460, 340), { sources: ['s7'], properties: '白色の固体。水にやや溶けにくい。', uses: 'DNAの塩基、生化学的研究。', nature: 'DNAのピリミジン塩基。', notes: '', precursors: 'DNAの加水分解で得られる。', reactions: '水素結合、光二量化。', dataStatus: 'full', pubchem: 1135, subcategory: '核酸塩基' });
  comp('uracil', 'ウラシル', 'C4H4N2O2', 'natural-polymer', customGraph([["O",424,282,0],["O",36,282,0],["N",230,282,1],["N",327,114,1],["C",327,226,0],["C",133,226,0],["C",230,58,1],["C",133,114,1]], [[0,4,2],[1,5,2],[2,4,1],[2,5,1],[3,4,1],[3,6,1],[5,7,1],[6,7,2]], 460, 340), { sources: ['s7'], properties: '白色の固体。水にやや溶ける。', uses: 'RNAの塩基、生化学的研究。', nature: 'RNAのピリミジン塩基。', notes: '', precursors: 'RNAの加水分解で得られる。', reactions: '水素結合、メチル化でチミン。', dataStatus: 'full', pubchem: 1174, subcategory: '核酸塩基' });
  comp('heme', 'ヘム（ヘムb）', 'C34H32FeN4O4', 'amino', customGraph([["Fe",250.5,149.6,0,"+",1],["O",230.5,304,1],["O",94.2,171.7,1],["O",195.6,278.6,0],["O",120.3,206,0],["N",251.4,181.3,0,"-",1],["N",215.9,149,0,0,1],["N",286.8,149,0,0,1],["N",250.6,116.6,0,"-",1],["C",232.5,196.2,0],["C",202.5,167.1,0],["C",270.3,195.5,0],["C",202.5,130.8,0],["C",301,166.3,0],["C",231.7,101.7,0],["C",270.3,100.9,0],["C",300.2,130,0],["C",209.6,189.1,1],["C",239.6,218.3,0],["C",179.7,160.8,0],["C",293.9,189.1,1],["C",208.8,108,1],["C",263.2,218.3,0],["C",179.7,137.1,0],["C",293.1,108,1],["C",323.1,160,0],["C",262.4,78.8,0],["C",238.8,78.8,0],["C",323.1,136.4,0],["C",224.9,238.4,2],["C",159.9,175.8,2],["C",275.6,239.8,3],["C",159.9,122.1,3],["C",342.9,175,3],["C",276.7,58.5,3],["C",224,58.8,1],["C",342.9,121.3,1],["C",235,261.1,2],["C",136.9,166.2,2],["C",234,36,2],["C",365.8,130.9,2],["C",220.4,281.3,0],["C",117.1,181.3,0]], [[0,5,6],[0,6,6],[0,7,6],[0,8,6],[1,41,1],[2,42,1],[3,41,2],[4,42,2],[5,9,1],[5,11,1],[6,10,2],[6,12,1],[7,13,2],[7,16,1],[8,14,1],[8,15,1],[9,17,2],[9,18,1],[10,17,1],[10,19,1],[11,20,2],[11,22,1],[12,21,2],[12,23,1],[13,20,1],[13,25,1],[14,21,1],[14,27,2],[15,24,1],[15,26,2],[16,24,2],[16,28,1],[18,22,2],[18,29,1],[19,23,2],[19,30,1],[22,31,1],[23,32,1],[25,28,2],[25,33,1],[26,27,1],[26,34,1],[27,35,1],[28,36,1],[29,37,1],[30,38,1],[35,39,2],[36,40,2],[37,41,1],[38,42,1]], 460, 340), { sources: ['s14', 's16'], properties: '暗赤色の固体。水に溶けにくい。', uses: 'ヘモグロビン・ミオグロビンの補欠分子族、酸素運搬。', nature: 'プロトポルフィリンIXに鉄(II)が配位した錯体。', notes: '', precursors: '生合成ではグリシンとコハク酸からポルフィリン環を経て生成。', reactions: '酸素の配位、酸化還元（Fe²⁺/Fe³⁺）。', dataStatus: 'full', pubchem: 4973, subcategory: '補欠分子族' });
  comp('dichloromethane', 'ジクロロメタン（塩化メチレン）', 'CH2Cl2', 'alkane', customGraph([["Cl",424,114,0],["Cl",36,114,0],["C",230,226,2]], [[0,2,1],[1,2,1]], 460, 340), { sources: ['s3', 's4'], properties: '無色の液体。特異な臭気がある。', uses: '溶媒、抽出剤。', nature: 'メタンの塩素化で生成する。', hazards: '刺激性・発がん性の懸念。', notes: '', precursors: 'メタンの塩素化、またはクロロメタンの塩素化で製造。', reactions: '加水分解、求核置換。', dataStatus: 'full', pubchem: 6344 });
  comp('chloroform', 'トリクロロメタン（クロロホルム）', 'CHCl3', 'alkane', customGraph([["Cl",384.7,36,0],["Cl",75.3,36,0],["Cl",230,304,0],["C",230,125.3,1]], [[0,3,1],[1,3,1],[2,3,1]], 460, 340), { sources: ['s3', 's4'], properties: '無色の液体。甘い臭気がある。', uses: '溶媒、かつての麻酔薬。', nature: 'メタンの塩素化で生成する。', hazards: '麻酔性・肝毒性。', notes: '', precursors: 'メタンの塩素化、またはアセトンの塩素化で製造。', reactions: '光分解でホスゲン、求核置換。', dataStatus: 'full', pubchem: 6212 });
  comp('carbon-tetrachloride', 'テトラクロロメタン（四塩化炭素）', 'CCl4', 'alkane', customGraph([["Cl",364,92.6,0],["Cl",96,247.4,0],["Cl",152.6,36,0],["Cl",307.4,304,0],["C",230,170,0]], [[0,4,1],[1,4,1],[2,4,1],[3,4,1]], 460, 340), { sources: ['s3', 's4'], properties: '無色の液体。水にほとんど溶けない。', uses: 'かつての溶媒・消火剤。', nature: 'メタンの完全塩素化で生成する。', hazards: 'オゾン層破壊・肝毒性。', notes: '', precursors: 'メタンの塩素化、または二硫化炭素と塩素の反応で製造。', reactions: '高温で分解、ラジカル反応。', dataStatus: 'full', pubchem: 5943 });
  comp('iodoform', 'ヨードホルム（トリヨードメタン）', 'CHI3', 'alkane', customGraph([["I",384.7,36,0],["I",75.3,36,0],["I",230,304,0],["C",230,125.3,1]], [[0,3,1],[1,3,1],[2,3,1]], 460, 340), { sources: ['s2'], properties: '黄色の結晶。特異な臭気がある。', uses: 'ヨードホルム反応の生成物、消毒薬。', nature: 'メチルケトン類のヨードホルム反応で生成する。', hazards: '刺激性。', notes: '', precursors: 'エタノールやアセトンにヨウ素と水酸化ナトリウムを作用させると生成。', reactions: '分解でヨウ素を生じる、求核置換。', dataStatus: 'full', pubchem: 6374 });
  comp('insulin', 'インスリン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-insulin', unitLabel: 'インスリン（ペプチドホルモン）' }, { sources: ['s14'], properties: '白色の粉末。水に溶けやすい。', uses: '血糖降下薬、糖尿病の治療。', nature: '膵臓ランゲルハンス島β細胞で分泌されるペプチドホルモン。', notes: '', precursors: '膵臓で生合成される。', reactions: '受容体に結合して血糖を低下させる。', dataStatus: 'class', subcategory: 'ホルモン', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('hemoglobin', 'ヘモグロビン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-hemoglobin', unitLabel: 'ヘモグロビン（鉄含有複合タンパク質）' }, { sources: ['s14', 's15'], properties: '赤色の固体。水に溶ける。', uses: '酸素運搬、血液の色素。', nature: '赤血球に含まれる鉄含有複合タンパク質。', notes: '', precursors: '骨髄の赤血球系細胞で生合成。', reactions: '酸素・二酸化炭素の結合、酸化。', dataStatus: 'class', subcategory: '複合タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('albumin', 'アルブミン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-albumin', unitLabel: 'アルブミン（単純タンパク質）' }, { sources: ['s14', 's15'], properties: '白色の固体。水に溶けやすい。', uses: '血漿膠質浸透圧の維持、卵白の主成分。', nature: '血清・卵白などに含まれる水溶性の単純タンパク質。', notes: '', precursors: '肝臓（血清アルブミン）や卵管（卵白アルブミン）で生合成。', reactions: '変性、加水分解。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('globulin', 'グロブリン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-globulin', unitLabel: 'グロブリン（単純タンパク質）' }, { sources: ['s14', 's15'], properties: '白色の固体。水に溶けにくく、塩溶液に溶ける。', uses: '免疫（抗体）、血漿タンパク質。', nature: '血清などに含まれる塩溶性の単純タンパク質。', notes: '', precursors: '肝臓・免疫細胞で生合成。', reactions: '塩析、変性、抗原抗体反応。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('glutelin', 'グルテリン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-glutelin', unitLabel: 'グルテリン（植物性単純タンパク質）' }, { sources: ['s14', 's15'], properties: '白色の固体。水・塩溶液に溶けにくい。', uses: '植物種子の貯蔵タンパク質。', nature: 'イネ科植物の種子に含まれる貯蔵タンパク質。', notes: '', precursors: '種子で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('keratin', 'ケラチン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-keratin', unitLabel: 'ケラチン（線維状タンパク質）' }, { sources: ['s14', 's15'], properties: '白色の固体。水に溶けにくい。', uses: '毛髪・爪・角・羽毛の構成成分。', nature: '上皮細胞に含まれる線維状タンパク質。', notes: '', precursors: '皮膚・毛包で生合成。', reactions: 'シスチン結合、変性、還元。', dataStatus: 'class', subcategory: '線維状タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('collagen', 'コラーゲン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-collagen', unitLabel: 'コラーゲン（線維状タンパク質）' }, { sources: ['s14', 's15'], properties: '白色の固体。水に溶けにくい。', uses: '皮膚・腱・骨の支持組織、ゼラチンの原料。', nature: '動物の結合組織に含まれる線維状タンパク質。', notes: '', precursors: '線維芽細胞で生合成。', reactions: '加熱でゼラチン、加水分解。', dataStatus: 'class', subcategory: '線維状タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('fibroin', 'フィブロイン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-fibroin', unitLabel: 'フィブロイン（絹の主成分）' }, { sources: ['s14', 's15'], properties: '白色の固体。水に溶けにくい。', uses: '絹糸の主成分、生体材料。', nature: 'カイコの絹糸に含まれる線維状タンパク質。', notes: '', precursors: 'カイコの絹糸腺で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '線維状タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('mucin', 'ムチン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-mucin', unitLabel: 'ムチン（糖タンパク質）' }, { sources: ['s14'], properties: '粘稠な液体。水に分散する。', uses: '粘液の主成分、潤滑・保護。', nature: '動物の粘液に含まれる糖タンパク質。', notes: '', precursors: '上皮細胞で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '複合タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('casein', 'カゼイン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-casein', unitLabel: 'カゼイン（リンタンパク質）' }, { sources: ['s14', 's15'], properties: '白色の固体。水に溶けにくい。', uses: '乳汁の主タンパク質、食品・接着剤の原料。', nature: '乳汁に含まれるリンを含む複合タンパク質。', notes: '', precursors: '乳腺で生合成。', reactions: '酸で凝固、加水分解。', dataStatus: 'class', subcategory: '複合タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('amylase', 'アミラーゼ', '組成依存', 'amino', { type: 'schematic', kind: 'protein-amylase', unitLabel: 'アミラーゼ（デンプン分解酵素）' }, { sources: ['s15'], properties: '白色の粉末。水に溶けやすい。', uses: 'デンプンの糖化、消化。', nature: '唾液・膵液などに含まれる加水分解酵素。', notes: '', precursors: '唾液腺・膵臓で生合成。', reactions: 'デンプンを加水分解してマルトースなどを生じる。', dataStatus: 'class', subcategory: '酵素', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('gelatin', 'ゼラチン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-gelatin', unitLabel: 'ゼラチン（コラーゲン誘導体）' }, { sources: ['s16'], properties: '淡黄色の固体。温水に溶ける。', uses: '食品・医薬品・写真材料。', nature: 'コラーゲンを加熱・加水分解して得られる誘導タンパク質。', notes: '', precursors: 'コラーゲンの熱変性・加水分解で製造。', reactions: 'ゲル化、加水分解。', dataStatus: 'class', subcategory: '誘導タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('pepsin', 'ペプシン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-pepsin', unitLabel: 'ペプシン（タンパク質分解酵素）' }, { sources: ['s16'], properties: '白色の粉末。酸性で働く。', uses: '胃内でのタンパク質消化。', nature: '胃液に含まれるタンパク質分解酵素。', notes: '', precursors: '胃主細胞が分泌するペプシノーゲンから生成。', reactions: 'タンパク質を加水分解してペプチドを生じる。', dataStatus: 'class', subcategory: '酵素', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('histone', 'ヒストン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-histone', unitLabel: 'ヒストン（塩基性タンパク質）' }, { sources: ['s16'], properties: '白色の固体。水に溶けやすい。', uses: 'クロマチンの構成、DNAの折りたたみ。', nature: '細胞核でDNAに結合する塩基性タンパク質。', notes: '', precursors: '細胞核で生合成。', reactions: 'DNAとの静電結合、アセチル化・メチル化。', dataStatus: 'class', subcategory: '核タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('protamine', 'プロタミン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-protamine', unitLabel: 'プロタミン（塩基性タンパク質）' }, { sources: ['s16'], properties: '白色の固体。水に溶けやすい。', uses: '精子DNAの凝縮、医薬品（インスリン製剤）の添加物。', nature: '精子に含まれるアルギニンに富む塩基性タンパク質。', notes: '', precursors: '精細胞で生合成。', reactions: 'DNAとの静電結合、加水分解。', dataStatus: 'class', subcategory: '核タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('glutenin', 'グルテニン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-glutenin', unitLabel: 'グルテニン（小麦の貯蔵タンパク質）' }, { sources: ['s16'], properties: '白色の固体。水に溶けにくい。', uses: '小麦粉の粘弾性（グルテン）の構成成分。', nature: '小麦の胚乳に含まれる貯蔵タンパク質。', notes: '', precursors: '小麦の種子で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('oryzenin', 'オリゼニン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-oryzenin', unitLabel: 'オリゼニン（米の貯蔵タンパク質）' }, { sources: ['s16'], properties: '白色の固体。水に溶けにくい。', uses: '米の主な貯蔵タンパク質。', nature: '米の胚乳に含まれるグルテリン型の貯蔵タンパク質。', notes: '', precursors: 'イネの種子で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('gliadin', 'グリアジン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-gliadin', unitLabel: 'グリアジン（小麦のプロラミン）' }, { sources: ['s16'], properties: '白色の固体。アルコールに溶ける。', uses: '小麦グルテンの構成成分。', nature: '小麦の胚乳に含まれるプロラミン型の貯蔵タンパク質。', notes: '', precursors: '小麦の種子で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('hordein', 'ホルデイン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-hordein', unitLabel: 'ホルデイン（大麦のプロラミン）' }, { sources: ['s16'], properties: '白色の固体。アルコールに溶ける。', uses: '大麦の貯蔵タンパク質。', nature: '大麦の胚乳に含まれるプロラミン型の貯蔵タンパク質。', notes: '', precursors: '大麦の種子で生合成。', reactions: '加水分解、変性。', dataStatus: 'class', subcategory: '単純タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('globin', 'グロビン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-globin', unitLabel: 'グロビン（ヘモグロビンのタンパク質部分）' }, { sources: ['s16'], properties: '白色の固体。水に溶けやすい。', uses: 'ヘモグロビンのタンパク質部分。', nature: 'ヘモグロビンを構成する球状タンパク質。', notes: '', precursors: '赤血球系細胞で生合成。', reactions: 'ヘムとの結合、酸素結合。', dataStatus: 'class', subcategory: '複合タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('salmine', 'サルミン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-salmine', unitLabel: 'サルミン（サケのプロタミン）' }, { sources: ['s16'], properties: '白色の固体。水に溶けやすい。', uses: 'サケ精子のDNA結合タンパク質。', nature: 'サケの精子に含まれるプロタミン。', notes: '', precursors: '精細胞で生合成。', reactions: 'DNAとの静電結合、加水分解。', dataStatus: 'class', subcategory: '核タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('hemocyanin', 'ヘモシアニン', '組成依存', 'amino', { type: 'schematic', kind: 'protein-hemocyanin', unitLabel: 'ヘモシアニン（銅含有酸素運搬タンパク質）' }, { sources: ['s16'], properties: '青色の液体。水に溶ける。', uses: '軟体動物・節足動物の酸素運搬。', nature: '軟体動物・節足動物の血リンパに含まれる銅含有タンパク質。', notes: '', precursors: '血リンパ中で生合成。', reactions: '酸素の結合、酸化還元。', dataStatus: 'class', subcategory: '複合タンパク質', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('cellulase', 'セルラーゼ', '組成依存', 'amino', { type: 'schematic', kind: 'protein-cellulase', unitLabel: 'セルラーゼ（セルロース分解酵素）' }, { sources: ['s8'], properties: '白色の粉末。水に溶けやすい。', uses: 'セルロースの糖化、洗剤・バイオ燃料の研究。', nature: '微生物・植物などが生産する加水分解酵素。', notes: '', precursors: '微生物などで生合成。', reactions: 'セルロースのβ-1,4結合を加水分解。', dataStatus: 'class', subcategory: '酵素', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('cellobiase', 'セロビアーゼ（β-グルコシダーゼ）', '組成依存', 'amino', { type: 'schematic', kind: 'protein-cellobiase', unitLabel: 'セロビアーゼ（二糖分解酵素）' }, { sources: ['s8'], properties: '白色の粉末。水に溶けやすい。', uses: 'セロビオースの糖化。', nature: 'セロビオースを加水分解する酵素。', notes: '', precursors: '微生物などで生合成。', reactions: 'セロビオースをβ-D-グルコース2分子に加水分解。', dataStatus: 'class', subcategory: '酵素', formulaVariable: true, formulaDisplay: '組成依存（アミノ酸配列・重合度に依存）' });
  comp('cation-exchange-resin', '陽イオン交換樹脂', '(C8H7NaO3S)n', 'synthetic-polymer', { type: 'polymer', unit: '—CH₂—CH(C₆H₄SO₃⁻Na⁺)—', unitFormula: 'C8H7NaO3S', formula: '(C8H7NaO3S)n' }, { sources: ['s12'], properties: '淡黄色〜褐色の球状固体。水に膨潤する。', uses: '水の軟化、イオンの分離・精製。', nature: 'スチレンとp-ジビニルベンゼンの共重合体にスルホン酸基を導入した樹脂。', notes: '', precursors: 'スチレンとp-ジビニルベンゼンを共重合し、濃硫酸でスルホン化。', reactions: '陽イオン交換（Na⁺とCa²⁺など）、再生。', dataStatus: 'class', subcategory: 'イオン交換樹脂', formulaVariable: true, formulaDisplay: '組成依存（C8H7NaO3S を繰り返し単位とする重合体）' });
  comp('anion-exchange-resin', '陰イオン交換樹脂', '(C12H18ClN)n', 'synthetic-polymer', { type: 'polymer', unit: '—CH₂—CH(C₆H₄CH₂N⁺(CH₃)₃Cl⁻)—', unitFormula: 'C12H18ClN', formula: '(C12H18ClN)n' }, { sources: ['s13'], properties: '淡黄色〜褐色の球状固体。水に膨潤する。', uses: '水の脱塩、イオンの分離・精製。', nature: 'スチレンとp-ジビニルベンゼンの共重合体に四級アンモニウム基を導入した樹脂。', notes: '', precursors: 'スチレンとp-ジビニルベンゼンを共重合し、クロロメチル化後、三級アミンで四級化。', reactions: '陰イオン交換（Cl⁻とSO₄²⁻など）、再生。', dataStatus: 'class', subcategory: 'イオン交換樹脂', formulaVariable: true, formulaDisplay: '組成依存（C12H18ClN を繰り返し単位とする重合体）' });
  comp('alginic-acid', 'アルギン酸', '(C6H8O6)n', 'natural-polymer', { type: 'polymer', unit: '—C₆H₈O₆—', unitFormula: 'C6H8O6', formula: '(C6H8O6)n' }, { sources: ['s20'], properties: '白色〜淡黄色の粉末。水に溶けにくい。', uses: '増粘剤、食品添加物、生体材料。', nature: '褐藻の細胞壁に含まれるウロン酸の多糖。', notes: '', precursors: '褐藻から抽出。', reactions: '中和でアルギン酸塩、カルシウムイオンでゲル化。', dataStatus: 'class', subcategory: '多糖', formulaVariable: true, formulaDisplay: '組成依存（C6H8O6 を繰り返し単位とする重合体）' });
  comp('sodium-alginate', 'アルギン酸ナトリウム', '(C6H7NaO6)n', 'natural-polymer', { type: 'polymer', unit: '—C₆H₇NaO₆—', unitFormula: 'C6H7NaO6', formula: '(C6H7NaO6)n' }, { sources: ['s20'], properties: '白色〜淡黄色の粉末。水に溶けやすい。', uses: '増粘剤、食品添加物、医用材料。', nature: 'アルギン酸のナトリウム塩。', notes: '', precursors: 'アルギン酸を水酸化ナトリウムで中和して製造。', reactions: 'カルシウムイオンでゲル化、酸でアルギン酸。', dataStatus: 'class', subcategory: '多糖', formulaVariable: true, formulaDisplay: '組成依存（C6H7NaO6 を繰り返し単位とする重合体）' });

  /* ------------------------------------------------------------------
   * 別名・材料索引
   * 名称そのものとは別に、資料や教科書で使われる呼称を検索できるようにする。
   * 同じ分子を水増ししないため、材料・混合物は COMPOUNDS に追加しない。
   * ------------------------------------------------------------------ */
  var ALIASES = [
    { term: '1-ペンタノール', target: 'pentan-1-ol' },
    { term: '酢酸Na', target: 'sodium-acetate' },
    { term: '酢酸ナトリウム', target: 'sodium-acetate' },
    { term: '塩化メチレン', target: 'dichloromethane' },
    { term: 'ジクロロメタン', target: 'dichloromethane' },
    { term: 'クロロホルム', target: 'chloroform' },
    { term: 'トリクロロメタン', target: 'chloroform' },
    { term: '四塩化炭素', target: 'carbon-tetrachloride' },
    { term: 'テトラクロロメタン', target: 'carbon-tetrachloride' },
    { term: 'ナトリウムフェノキシド', target: 'sodium-phenoxide' },
    { term: 'フェノキシドナトリウム', target: 'sodium-phenoxide' },
    { term: 'p-フェニルアゾフェノール', target: 'p-hydroxyazobenzene' },
    { term: 'p-ヒドロキシアゾベンゼン', target: 'p-hydroxyazobenzene' },
    { term: '無水酢酸', target: 'acetic-anhydride' },
    { term: '無水マレイン酸', target: 'maleic-anhydride' },
    { term: '無水フタル酸', target: 'phthalic-anhydride' },
    { term: 'セロビオース', target: 'cellobiose' },
    { term: 'トレハロース', target: 'trehalose' },
    { term: 'β-D-グルコース', target: 'glucose' },
    { term: 'β-グルコース', target: 'glucose' },
    { term: 'α-D-グルコース', target: 'glucose' },
    { term: 'グルコース', target: 'glucose' },
    { term: 'リボース', target: 'ribose' },
    { term: 'デオキシリボース', target: 'deoxyribose' },
    { term: 'ガラクトース', target: 'galactose' },
    { term: 'フルクトース', target: 'fructose' },
    { term: 'マルトース', target: 'maltose' },
    { term: 'ラクトース', target: 'lactose' },
    { term: 'スクロース', target: 'sucrose' },
    { term: 'セルロース', target: 'cellulose' },
    { term: 'セルラーゼ', target: 'cellulase' },
    { term: 'セロビアーゼ', target: 'cellobiase' },
    { term: 'ニンヒドリン', target: 'ninhydrin' },
    { term: 'スチレン', target: 'styrene' },
    { term: 'p-ジビニルベンゼン', target: 'p-divinylbenzene' },
    { term: '陽イオン交換樹脂', target: 'cation-exchange-resin' },
    { term: '陰イオン交換樹脂', target: 'anion-exchange-resin' },
    { term: 'インスリン', target: 'insulin' },
    { term: 'ヘモグロビン', target: 'hemoglobin' },
    { term: 'ヘム', target: 'heme' },
    { term: 'アルブミン', target: 'albumin' },
    { term: 'グロブリン', target: 'globulin' },
    { term: 'グルテリン', target: 'glutelin' },
    { term: 'ケラチン', target: 'keratin' },
    { term: 'コラーゲン', target: 'collagen' },
    { term: 'フィブロイン', target: 'fibroin' },
    { term: 'ムチン', target: 'mucin' },
    { term: 'カゼイン', target: 'casein' },
    { term: 'アミラーゼ', target: 'amylase' },
    { term: 'ゼラチン', target: 'gelatin' },
    { term: 'ペプシン', target: 'pepsin' },
    { term: 'ヒストン', target: 'histone' },
    { term: 'プロタミン', target: 'protamine' },
    { term: 'グルテニン', target: 'glutenin' },
    { term: 'オリゼニン', target: 'oryzenin' },
    { term: 'グリアジン', target: 'gliadin' },
    { term: 'ホルデイン', target: 'hordein' },
    { term: 'グロビン', target: 'globin' },
    { term: 'サルミン', target: 'salmine' },
    { term: 'ヘモシアニン', target: 'hemocyanin' },
    { term: 'アデニン', target: 'adenine' },
    { term: 'グアニン', target: 'guanine' },
    { term: 'シトシン', target: 'cytosine' },
    { term: 'チミン', target: 'thymine' },
    { term: 'ウラシル', target: 'uracil' },
    { term: 'メチルオレンジ', target: 'methyl-orange' },
    { term: '2-ナフトール', target: '2-naphthol' },
    { term: 'レゾルシノール', target: 'resorcinol' },
    { term: 'グアイアコール', target: 'guaiacol' },
    { term: 'N,N-ジメチルアニリン', target: 'n,n-dimethylaniline' },
    { term: 'スルファニル酸', target: 'sulfanilic-acid' },
    { term: 'ポリアニリン', target: 'polyaniline' },
    { term: 'インジゴ', target: 'indigo' },
    { term: 'アリザリン', target: 'alizarin' },
    { term: 'シコニン', target: 'shikonin' },
    { term: 'カルミン酸', target: 'carminic-acid' },
    { term: 'ジブロモインジゴ', target: 'dibromoindigo' },
    { term: 'カルタミン', target: 'carthamin' },
    { term: '2-ニトロベンズアルデヒド', target: '2-nitrobenzaldehyde' },
    { term: 'ケルセチン', target: 'quercetin' },
    { term: 'アルギン酸', target: 'alginic-acid' },
    { term: 'アルギン酸ナトリウム', target: 'sodium-alginate' },
    { term: 'アジピン酸ジクロリド', target: 'adipoyl-chloride' },
    { term: '6-アミノヘキサン酸', target: '6-aminohexanoic-acid' },
    { term: 'アスピリン', target: 'aspirin' },
    { term: 'サリチル酸メチル', target: 'methyl-salicylate' },
    { term: 'アセトアミノフェン', target: 'acetaminophen' },
    { term: 'イブプロフェン', target: 'ibuprofen' },
    { term: 'スルファニルアミド', target: 'sulfanilamide' },
    { term: 'p-ヒドロキシ安息香酸', target: 'p-hydroxybenzoic-acid' },
    { term: 'm-ヒドロキシ安息香酸', target: 'm-hydroxybenzoic-acid' },
    { term: '2,4,6-トリブロモフェノール', target: '2,4,6-tribromophenol' },
    { term: '塩化ベンゼンジアゾニウム', target: 'benzenediazonium-chloride' },
    { term: '酢酸エチル', target: 'ethyl-acetate' },
    { term: 'エタノール', target: 'ethanol' },
    { term: '酢酸', target: 'acetic-acid' },
    { term: 'メタン', target: 'methane' },
    { term: 'エタン', target: 'ethane' },
    { term: 'プロパン', target: 'propane' },
    { term: 'ブタン', target: 'butane' },
    { term: 'ペンタン', target: 'pentane' },
    { term: 'ヘキサン', target: 'hexane' },
    { term: 'ヘプタン', target: 'heptane' },
    { term: 'オクタン', target: 'octane' },
    { term: 'ノナン', target: 'nonane' },
    { term: 'デカン', target: 'decane' },
    { term: 'エイコサン', target: 'eicosane' },
    { term: 'クロロメタン', target: 'chloromethane' },
    { term: 'ヨードホルム', target: 'iodoform' },
    { term: 'ベンゼンスルホン酸ナトリウム', target: 'sodium-benzenesulfonate' },
    { term: 'p-ヒドロキシアゾベンゼン', target: 'p-hydroxyazobenzene' },
    { term: 'DNA', target: 'dna' },
    { term: 'RNA', target: 'rna' },
    { term: 'ribose', target: 'ribose' },
    { term: 'deoxyribose', target: 'deoxyribose' },
    { term: 'adenine', target: 'adenine' },
    { term: 'guanine', target: 'guanine' },
    { term: 'cytosine', target: 'cytosine' },
    { term: 'thymine', target: 'thymine' },
    { term: 'uracil', target: 'uracil' },
    { term: 'cellulose', target: 'cellulose' },
    { term: 'cellobiose', target: 'cellobiose' },
    { term: 'glucose', target: 'glucose' },
    { term: 'cellulase', target: 'cellulase' },
    { term: 'cellobiase', target: 'cellobiase' },
    { term: 'ninhydrin', target: 'ninhydrin' },
    { term: 'insulin', target: 'insulin' },
    { term: 'hemoglobin', target: 'hemoglobin' },
    { term: 'heme', target: 'heme' },
    { term: 'albumin', target: 'albumin' },
    { term: 'globulin', target: 'globulin' },
    { term: 'glutelin', target: 'glutelin' },
    { term: 'keratin', target: 'keratin' },
    { term: 'collagen', target: 'collagen' },
    { term: 'fibroin', target: 'fibroin' },
    { term: 'mucin', target: 'mucin' },
    { term: 'casein', target: 'casein' },
    { term: 'amylase', target: 'amylase' },
    { term: 'gelatin', target: 'gelatin' },
    { term: 'pepsin', target: 'pepsin' },
    { term: 'histone', target: 'histone' },
    { term: 'protamine', target: 'protamine' },
    { term: 'glutenin', target: 'glutenin' },
    { term: 'oryzenin', target: 'oryzenin' },
    { term: 'gliadin', target: 'gliadin' },
    { term: 'hordein', target: 'hordein' },
    { term: 'globin', target: 'globin' },
    { term: 'salmine', target: 'salmine' },
    { term: 'hemocyanin', target: 'hemocyanin' },
    { term: 'styrene', target: 'styrene' },
    { term: 'p-divinylbenzene', target: 'p-divinylbenzene' },
    { term: 'cation-exchange-resin', target: 'cation-exchange-resin' },
    { term: 'anion-exchange-resin', target: 'anion-exchange-resin' },
    { term: 'indigo', target: 'indigo' },
    { term: 'alizarin', target: 'alizarin' },
    { term: 'shikonin', target: 'shikonin' },
    { term: 'carminic acid', target: 'carminic-acid' },
    { term: 'dibromoindigo', target: 'dibromoindigo' },
    { term: 'carthamin', target: 'carthamin' },
    { term: 'quercetin', target: 'quercetin' },
    { term: 'acetaminophen', target: 'acetaminophen' },
    { term: 'ibuprofen', target: 'ibuprofen' },
    { term: 'sulfanilamide', target: 'sulfanilamide' },
    { term: 'aspirin', target: 'aspirin' },
    { term: 'methyl salicylate', target: 'methyl-salicylate' },
    { term: 'p-hydroxybenzoic acid', target: 'p-hydroxybenzoic-acid' },
    { term: 'm-hydroxybenzoic acid', target: 'm-hydroxybenzoic-acid' },
    { term: '2,4,6-tribromophenol', target: '2,4,6-tribromophenol' },
    { term: 'alginic acid', target: 'alginic-acid' },
    { term: 'sodium alginate', target: 'sodium-alginate' },
    { term: 'adipoyl chloride', target: 'adipoyl-chloride' },
    { term: '6-aminohexanoic acid', target: '6-aminohexanoic-acid' },
    { term: 'maleic anhydride', target: 'maleic-anhydride' },
    { term: 'phthalic anhydride', target: 'phthalic-anhydride' },
    { term: 'acetic anhydride', target: 'acetic-anhydride' },
    { term: 'trehalose', target: 'trehalose' },
    { term: 'lactose', target: 'lactose' },
    { term: 'maltose', target: 'maltose' },
    { term: 'sucrose', target: 'sucrose' },
    { term: 'galactose', target: 'galactose' },
    { term: 'fructose', target: 'fructose' },
    { term: 'methyl orange', target: 'methyl-orange' },
    { term: '2-naphthol', target: '2-naphthol' },
    { term: 'resorcinol', target: 'resorcinol' },
    { term: 'guaiacol', target: 'guaiacol' },
    { term: 'N,N-dimethylaniline', target: 'n,n-dimethylaniline' },
    { term: 'sulfanilic acid', target: 'sulfanilic-acid' },
    { term: 'polyaniline', target: 'polyaniline' }
  ];

  var MATERIALS = [
    {
      id: 'rayon', name: 'レーヨン', kind: 'material', of: 'cellulose',
      note: 'セルロースを溶かして再成形した再生繊維。分子そのものはセルロースで、繊維の形態が異なる。',
      synonyms: ['レーヨン', 'ビスコースレーヨン', '再生セルロース']
    },
    {
      id: 'cellophane', name: 'セロファン', kind: 'material', of: 'cellulose',
      note: 'セルロースを再生して作る透明なフィルム。分子そのものはセルロース。',
      synonyms: ['セロファン']
    },
    {
      id: 'cupra', name: '銅アンモニアレーヨン（キュプラ）', kind: 'material', of: 'cellulose',
      note: '銅アンモニア溶液に溶かしたセルロースを再生した繊維。分子そのものはセルロース。',
      synonyms: ['銅アンモニアレーヨン', 'キュプラ', 'クプラ', 'cupra']
    },
    {
      id: 'viscose', name: 'ビスコース', kind: 'mixture', of: null,
      note: 'セルロースを二硫化炭素と水酸化ナトリウムで処理した粘稠な溶液で、単一の化合物ではない。',
      synonyms: ['ビスコース', 'ビスコース溶液']
    },
    {
      id: 'aniline-black', name: 'アニリンブラック', kind: 'material', of: 'polyaniline',
      note: 'アニリンの酸化重合で得られる黒色の混合物。ポリアニリンを主成分とするが、同一の純物質ではない。',
      synonyms: ['アニリンブラック', 'アニリン黒']
    }
  ];

  function normalizeName(text) {
    var s = String(text == null ? '' : text);
    try { s = s.normalize('NFKC'); } catch (e) {}
    return s.toLowerCase()
      .replace(/[\s\-‐‑–—−_・,，、.。:：;；/／\\|｜'"“”‘’()（）\[\]［］{}｛｝]/g, '');
  }

  var ALIAS_MAP = {};
  ALIASES.forEach(function (a) {
    var key = normalizeName(a.term);
    if (!ALIAS_MAP[key]) ALIAS_MAP[key] = { term: a.term, target: a.target };
  });

  function aliasTarget(term) {
    var hit = ALIAS_MAP[normalizeName(term)];
    return hit ? hit.target : null;
  }

  function aliasesFor(id) {
    return ALIASES.filter(function (a) { return a.target === id; }).map(function (a) { return a.term; });
  }

  function materialsFor(id) {
    return MATERIALS.filter(function (m) { return m.of === id; });
  }

  function materialByTerm(term) {
    var key = normalizeName(term);
    for (var i = 0; i < MATERIALS.length; i++) {
      var m = MATERIALS[i];
      var names = [m.name].concat(m.synonyms || []);
      for (var j = 0; j < names.length; j++) {
        if (normalizeName(names[j]) === key) return m;
      }
    }
    return null;
  }

  function searchTermsFor(id) {
    var terms = aliasesFor(id);
    materialsFor(id).forEach(function (m) {
      terms = terms.concat([m.name], m.synonyms || []);
    });
    var seen = {};
    return terms.filter(function (t) {
      var key = normalizeName(t);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  var SKELETONS = [
    { id: 'alkane-c1', section: 'アルカン', label: '炭素数 1', tag: 'C1', ids: ['methane'] },
    { id: 'alkane-c2', section: 'アルカン', label: '炭素数 2', tag: 'C2', ids: ['ethane'] },
    { id: 'alkane-c3', section: 'アルカン', label: '炭素数 3', tag: 'C3', ids: ['propane'] },
    { id: 'alkane-c4', section: 'アルカン', label: '炭素数 4', tag: '2種類', ids: ['butane', 'isobutane'] },
    { id: 'alkane-c5', section: 'アルカン', label: '炭素数 5', tag: '3種類', ids: ['pentane', 'isopentane', 'neopentane'] },
    { id: 'alkane-c6', section: 'アルカン', label: '炭素数 6', tag: '5種類', ids: ['hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane'] },

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

  // 個別登録の化合物（組合せ生成の対象外）を左リストに追加する。
  var INDIVIDUAL_SECTIONS = [
    { section: '多価アルコール・ヒドロキシ酸', ids: ['ethylene-glycol', 'glycerol', 'propylene-glycol', 'lactic-acid'] },
    { section: 'エーテル（追加）', ids: ['methoxyethane', '1-methoxypropane', '2-methoxypropane'] },
    { section: 'アミン・ニトリル・ハロゲン化物', ids: [
      'methylamine', 'ethylamine', 'propylamine', 'isopropylamine', 'dimethylamine', 'trimethylamine',
      'diethylamine', 'triethylamine', 'butan-1-amine', 'butan-2-amine', '2-methylpropan-1-amine',
      '2-methylpropan-2-amine', 'n-methylpropan-1-amine', 'n-methylpropan-2-amine', 'n,n-dimethylethanamine',
      'nitromethane', 'acetonitrile', 'propanenitrile', 'butanenitrile',
      'benzonitrile', 'bromoethane', '1-bromopropane', '2-bromopropane', 'iodoethane'
    ] },
    { section: 'カルボン酸（追加）', ids: [
      'acrylic-acid', 'methacrylic-acid', 'maleic-acid', 'fumaric-acid', 'malonic-acid', 'succinic-acid',
      'glutaric-acid', 'adipic-acid', 'tartaric-acid', 'citric-acid', 'pyruvic-acid', 'palmitic-acid',
      'linolenic-acid', 'elaidic-acid', 'phthalic-acid', 'isophthalic-acid', 'terephthalic-acid'
    ] },
    { section: 'エステル（追加）', ids: [
      'methyl-formate', 'ethyl-formate', 'propyl-formate', 'methyl-propionate', 'ethyl-propionate',
      'isoamyl-acetate', 'methyl-salicylate', 'ethyl-butyrate', 'butyl-acetate', 'triacetin'
    ] },
    { section: '油脂・脂肪酸（追加）', ids: ['tripalmitin', 'triolein', 'trilinolein'] },
    { section: 'セッケン・合成洗剤（追加）', ids: ['sodium-palmitate', 'sodium-oleate', 'sodium-laurate', 'las'] },
    { section: '芳香族化合物（追加）', ids: [
      'o-xylene', 'm-xylene', 'p-xylene', 'ethylbenzene', 'cumene',
      'o-cresol', 'm-cresol', 'p-cresol', 'catechol', 'resorcinol', 'hydroquinone',
      '1-naphthol', '2-naphthol', 'o-nitrotoluene', 'm-nitrotoluene', 'p-nitrotoluene',
      'tnt', 'picric-acid', 'benzenesulfonic-acid', 'acetanilide', 'aniline-hydrochloride',
      'benzenediazonium-chloride', 'methyl-orange', 'phenolphthalein', 'bisphenol-a',
      'benzyl-alcohol', 'anisole'
    ] },
    { section: 'アミノ酸（追加）', ids: [
      'valine', 'leucine', 'isoleucine', 'serine', 'threonine', 'cysteine', 'methionine',
      'aspartic-acid', 'glutamic-acid', 'asparagine', 'glutamine', 'lysine', 'arginine',
      'histidine', 'tyrosine', 'tryptophan', 'proline', 'cystine', 'glycylglycine',
      'alanylglycine', 'glutathione', 'aspartame'
    ] },
    { section: '糖類（追加）', ids: [
      'galactose', 'mannose', 'ribose', 'deoxyribose', 'sorbitol', 'amylopectin',
      'dextrin', 'chitin', 'cellulose-acetate', 'cellulose-nitrate'
    ] },
    { section: '核酸', ids: ['dna', 'rna'] },
    { section: '合成高分子の単量体', ids: [
      'butadiene', 'isoprene', 'vinyl-chloride', 'vinylidene-chloride', 'chloroprene',
      'acrylonitrile', 'vinyl-acetate', 'methyl-methacrylate', 'caprolactam',
      'hexamethylenediamine', 'urea', 'melamine', 'tetrafluoroethylene', 'phosgene',
      'epichlorohydrin', 'p-phenylenediamine', 'dimethyldichlorosilane'
    ] },
    { section: '合成高分子（追加）', ids: [
      'pmma', 'pan', 'ptfe', 'pvac', 'pvdc', 'nylon6', 'phenol-resin', 'urea-resin',
      'melamine-resin', 'epoxy-resin', 'silicone', 'polyurethane', 'sbr', 'br',
      'chloroprene-rubber', 'pla', 'polycarbonate', 'sodium-polyacrylate', 'aramid', 'abs',
      'vinylon', 'nbr', 'iir', 'unsaturated-polyester', 'alkyd-resin', 'polyacetylene', 'polyaniline'
    ] },
    { section: '外部照合: アルカン・ハロゲン化物・酸無水物・糖', ids: [
      'heptane', 'octane', 'nonane', 'decane', 'eicosane',
      'dichloromethane', 'chloroform', 'carbon-tetrachloride', 'iodoform',
      'sodium-acetate', 'sodium-phenoxide', 'sodium-benzenesulfonate',
      'acetic-anhydride', 'maleic-anhydride', 'phthalic-anhydride',
      'cellobiose', 'trehalose', 'p-divinylbenzene'
    ] },
    { section: '外部照合: 核酸塩基・タンパク質・酵素', ids: [
      'adenine', 'guanine', 'cytosine', 'thymine', 'uracil', 'heme',
      'insulin', 'hemoglobin', 'albumin', 'globulin', 'glutelin', 'keratin', 'collagen',
      'fibroin', 'mucin', 'casein', 'amylase', 'gelatin', 'pepsin', 'histone', 'protamine',
      'glutenin', 'oryzenin', 'gliadin', 'hordein', 'globin', 'salmine', 'hemocyanin',
      'cellulase', 'cellobiase'
    ] },
    { section: '外部照合: 染料・医薬品・材料', ids: [
      'ninhydrin', 'p-hydroxyazobenzene', 'guaiacol', 'n,n-dimethylaniline', 'sulfanilic-acid',
      '2-nitrobenzaldehyde', 'indigo', 'alizarin', 'shikonin', 'carminic-acid', 'dibromoindigo',
      'carthamin', 'quercetin', 'acetaminophen', 'ibuprofen', 'sulfanilamide',
      'p-hydroxybenzoic-acid', 'm-hydroxybenzoic-acid', '2,4,6-tribromophenol',
      'adipoyl-chloride', '6-aminohexanoic-acid', 'cation-exchange-resin', 'anion-exchange-resin',
      'alginic-acid', 'sodium-alginate'
    ] }
  ];
  INDIVIDUAL_SECTIONS.forEach(function (group) {
    group.ids.forEach(function (id) {
      var key = 'ind-' + id;
      if (!COMPOUNDS[id]) return;
      if (SKELETONS.some(function (s) { return s.id === key; })) return;
      SKELETONS.push({
        id: key, section: group.section, label: COMPOUNDS[id].name, tag: '個別', ids: [id], locked: true
      });
    });
  });

  /* ---- アルケンの水素置換で得られる化合物（付加反応とは区別） ---- */
  cond('ethenol', 'エテノール（ビニルアルコール）', 'C2H4O', 'unsat', ['CH₂=CH—OH'], {
    properties: '常温では不安定なエノール。直ちにアセトアルデヒドへ異性化する。',
    uses: '基礎研究用。単離・保存は困難。', nature: '工業的には単離されない。',
    hazards: '可燃性・刺激性。', notes: 'エテンの水素をOHで置換した構造。エノールはケト形（アセトアルデヒド）との互変異性で不安定。付加反応で得られるエタノールとは異なる。PVAは酢酸ビニルの重合後にけん化して製造され、エテノールを単量体として重合するものではない。',
    reactions: '互変異性でアセトアルデヒド。単離・重合には適さない。', dataStatus: 'class'
  });
  cond('allyl-alcohol', 'アリルアルコール（プロパ-2-エン-1-オール）', 'C3H6O', 'unsat', ['CH₂=CH—CH₂OH'], {
    properties: '無色の液体。刺激臭。', uses: '樹脂・医薬・農薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・有毒。', notes: 'プロペンのメチル基の水素をOHで置換した構造。', dataStatus: 'class'
  });
  cond('prop-1-en-1-ol', 'プロパ-1-エン-1-オール', 'C3H6O', 'unsat', ['CH₃—CH=CH—OH'], {
    properties: '不安定なエノール。プロパナールへ異性化する。', uses: '基礎研究用。',
    nature: '単離されにくい。', hazards: '可燃性。', notes: 'プロペンの末端ビニル炭素（CH₂）の水素をOHで置換したエノール。', dataStatus: 'class'
  });
  cond('prop-1-en-2-ol', 'プロパ-1-エン-2-オール（イソプロペニルアルコール）', 'C3H6O', 'unsat', ['CH₂=C(OH)—CH₃'], {
    properties: '不安定なエノール。アセトンへ異性化する。', uses: '基礎研究用。',
    nature: '単離されにくい。', hazards: '可燃性。', notes: 'プロペンの中央炭素の水素をOHで置換したエノール。', dataStatus: 'class'
  });
  cond('1-chloropropene', '1-クロロプロペン', 'C3H5Cl', 'unsat', ['CH₃—CH=CHCl'], {
    properties: '無色の液体。', uses: '化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', notes: 'プロペンの末端ビニル炭素（CH₂）の水素をClで置換した構造。', dataStatus: 'class'
  });
  cond('2-chloropropene', '2-クロロプロペン', 'C3H5Cl', 'unsat', ['CH₂=CCl—CH₃'], {
    properties: '無色の液体。', uses: '化学原料。', nature: '工業的に合成。',
    hazards: '可燃性・刺激性。', notes: 'プロペンの中央炭素の水素をClで置換した構造。', dataStatus: 'class'
  });
  cond('3-chloropropene', '3-クロロプロペン（アリルクロリド）', 'C3H5Cl', 'unsat', ['CH₂=CH—CH₂Cl'], {
    properties: '無色の液体。刺激臭。', uses: '樹脂・農薬原料。', nature: '工業的に合成。',
    hazards: '可燃性・有毒。', notes: 'プロペンのメチル基の水素をClで置換した構造。', dataStatus: 'class'
  });
  cond('acrolein', 'アクロレイン（プロペナール）', 'C3H4O', 'unsat', ['CH₂=CH—CHO'], {
    properties: '無色の液体。強い刺激臭。', uses: '樹脂・医薬原料。', nature: '油脂の加熱分解でも生成。',
    hazards: '有毒・催涙性。', notes: 'エテンの水素をホルミル基で置換した構造。', dataStatus: 'class'
  });
  cond('but-3-enoic-acid', 'ブタ-3-エン酸', 'C4H6O2', 'unsat', ['CH₂=CH—CH₂—COOH'], {
    properties: '無色の液体。', uses: '化学原料。', nature: '工業的に合成。',
    hazards: '腐食性・刺激性。', notes: 'プロペンの末端ビニル炭素（CH₂）の水素をCOOHで置換した構造。', dataStatus: 'class'
  });
  cond('crotonic-acid', 'クロトン酸（ブタ-2-エン酸）', 'C4H6O2', 'unsat', ['CH₃—CH=CH—COOH'], {
    properties: '白色の結晶。', uses: '樹脂・医薬原料。', nature: '一部の植物に存在。',
    hazards: '腐食性・刺激性。', notes: 'プロペンの末端ビニル炭素（CH₂）の水素をCOOHで置換した構造。', dataStatus: 'class'
  });

  var COMBOS = {
    'alkane-c1': {
      none: [{ id: 'methane', from: '' }],
      oh: [{ id: 'methanol', from: '' }],
      cooh: [{ id: 'acetic-acid', from: '' }],
      cho: [{ id: 'ethanal', from: '' }],
      ch3: [{ id: 'ethane', from: '' }],
      cl: [{ id: 'chloromethane', from: '' }],
      nh2: [{ id: 'methylamine', from: '' }]
    },
    'alkane-c2': {
      none: [{ id: 'ethane', from: '' }],
      oh: [{ id: 'ethanol', from: '' }],
      cooh: [{ id: 'propionic-acid', from: '' }],
      cho: [{ id: 'propanal', from: '' }],
      ch3: [{ id: 'propane', from: '' }],
      cl: [{ id: 'chloroethane', from: '' }],
      nh2: [{ id: 'ethylamine', from: '' }]
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
      ],
      nh2: [
        { id: 'propylamine', from: 'プロパン' },
        { id: 'isopropylamine', from: 'プロパン' }
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
      ],
      nh2: [
        { id: 'butan-1-amine', from: 'ブタン' },
        { id: 'butan-2-amine', from: 'ブタン' },
        { id: '2-methylpropan-1-amine', from: '2-メチルプロパン' },
        { id: '2-methylpropan-2-amine', from: '2-メチルプロパン' }
      ]
    },
    'alkane-c5': {
      none: [
        { id: 'pentane', from: '' },
        { id: 'isopentane', from: '' },
        { id: 'neopentane', from: '' }
      ],
      oh: [
        { id: 'pentan-1-ol', from: 'ペンタン' },
        { id: 'pentan-2-ol', from: 'ペンタン' },
        { id: 'pentan-3-ol', from: 'ペンタン' },
        { id: '2-methylbutan-1-ol', from: '2-メチルブタン' },
        { id: '2-methylbutan-2-ol', from: '2-メチルブタン' },
        { id: '3-methylbutan-1-ol', from: '2-メチルブタン' },
        { id: '3-methylbutan-2-ol', from: '2-メチルブタン' },
        { id: '2,2-dimethylpropan-1-ol', from: '2,2-ジメチルプロパン' }
      ],
      ch3: [
        { id: 'hexane', from: 'ペンタン' },
        { id: '2-methylpentane', from: 'ペンタン' },
        { id: '3-methylpentane', from: 'ペンタン' },
        { id: '2,2-dimethylbutane', from: '2-メチルブタン' },
        { id: '2,3-dimethylbutane', from: '2-メチルブタン' }
      ]
    },
    'alkane-c6': {
      none: [
        { id: 'hexane', from: '' },
        { id: '2-methylpentane', from: '' },
        { id: '3-methylpentane', from: '' },
        { id: '2,2-dimethylbutane', from: '' },
        { id: '2,3-dimethylbutane', from: '' }
      ]
    },
    'alkene-c2': {
      none: [{ id: 'ethene', from: '' }],
      oh: [{ id: 'ethenol', from: 'エテン' }],
      cooh: [{ id: 'acrylic-acid', from: 'エテン' }],
      cho: [{ id: 'acrolein', from: 'エテン' }],
      ch3: [{ id: 'propene', from: 'エテン' }],
      cl: [{ id: 'vinyl-chloride', from: 'エテン' }]
    },
    'alkene-c3': {
      none: [{ id: 'propene', from: '' }],
      oh: [
        { id: 'allyl-alcohol', from: 'プロペン' },
        { id: 'prop-1-en-1-ol', from: 'プロペン' },
        { id: 'prop-1-en-2-ol', from: 'プロペン' }
      ],
      cooh: [
        { id: 'but-3-enoic-acid', from: 'プロペン' },
        { id: 'crotonic-acid', from: 'プロペン' },
        { id: 'methacrylic-acid', from: 'プロペン' }
      ],
      ch3: [
        { id: 'but-1-ene', from: 'プロペン' },
        { id: 'but-2-ene', from: 'プロペン' },
        { id: 'isobutene', from: 'プロペン' }
      ],
      cl: [
        { id: '1-chloropropene', from: 'プロペン' },
        { id: '2-chloropropene', from: 'プロペン' },
        { id: '3-chloropropene', from: 'プロペン' }
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
   * 未対応の理由（空の組合せを「範囲外」と「成立しない」に分類）
   * ------------------------------------------------------------------ */
  var REASON_RULES = [
    { test: function (s, g) { return /^alkane-c[1-5]$/.test(s) && g === 'no2'; },
      type: 'out-of-scope',
      reason: '高校の教科書ではニトロアルカンの置換生成を扱いません。参考としてニトロメタンを個別収録しています。ニトロベンゼンはベンゼン＋−NO₂で表示できます。',
      examples: ['ニトロメタン（個別収録）', 'ニトロベンゼン'] },
    { test: function (s, g) { return s === 'alkane-c5' && g === 'nh2'; },
      type: 'out-of-scope',
      reason: 'C5脂肪族アミンの異性体列挙は高校の標準範囲外です。脂肪族アミンはC1〜C4の代表例を収録しています。',
      examples: ['メチルアミン', 'エチルアミン', 'ブタン-1-アミン'] },
    { test: function (s, g) { return s === 'alkane-c5' && g === 'cooh'; },
      type: 'out-of-scope',
      reason: 'C5アルカンから生成するC6カルボン酸の異性体列挙は高校の標準範囲外です。C1〜C5のカルボン酸を収録しています。',
      examples: ['ペンタン酸', '2-メチルブタン酸'] },
    { test: function (s, g) { return s === 'alkane-c5' && g === 'cho'; },
      type: 'out-of-scope',
      reason: 'C5アルカンから生成するC6アルデヒドの異性体列挙は高校の標準範囲外です。C1〜C5のアルデヒドを収録しています。',
      examples: ['ペンタナール', '2-メチルブタナール'] },
    { test: function (s, g) { return s === 'alkane-c5' && g === 'cl'; },
      type: 'out-of-scope',
      reason: 'C5アルカンの塩素置換体の異性体列挙は高校の標準範囲外です。塩素置換体はC1〜C4の代表例を収録しています。',
      examples: ['1-クロロブタン', '2-クロロブタン'] },
    { test: function (s, g) { return s === 'alkane-c6'; },
      type: 'out-of-scope',
      reason: 'C6アルカンは骨格異性体5種のみを収録しています。C6アルカンの置換体の異性体列挙は高校の標準範囲外です。',
      examples: ['ヘキサン', '2-メチルペンタン'] },
    { test: function (s, g) { return /^alkene-c[23]$/.test(s) && (g === 'nh2' || g === 'no2'); },
      type: 'out-of-scope',
      reason: 'エナミン（ビニルアミン）やニトロアルケンは高校の標準範囲外です。アルケンでは−OH・−Cl・−COOH・−CHO・−CH₃の水素置換を収録しています。',
      examples: ['エテノール', '塩化ビニル', 'アクリル酸'] },
    { test: function (s, g) { return s === 'alkene-c3' && g === 'cho'; },
      type: 'out-of-scope',
      reason: 'C4不飽和アルデヒドの異性体列挙は高校の標準範囲外です。アクロレイン（エテン＋−CHO）は収録しています。',
      examples: ['アクロレイン'] },
    { test: function (s, g) { return /^alkene-c4$/.test(s); },
      type: 'out-of-scope',
      reason: 'C4アルケンの置換体の異性体列挙は高校の標準範囲外です。アルケンの水素置換はC2・C3の代表例を収録しています。',
      examples: ['エテノール', 'アリルアルコール', '塩化ビニル'] },
    { test: function (s, g) { return /^alkyne-/.test(s); },
      type: 'out-of-scope',
      reason: 'アルキンへの置換基生成は高校の標準範囲外です。アルキンは骨格のみを収録し、付加反応の生成物は組合せ生成に混在させていません。',
      examples: ['エチン', 'プロピン'] },
    { test: function (s, g) { return /^cyclo-/.test(s); },
      type: 'out-of-scope',
      reason: '環状炭化水素の置換体（シクロヘキサノールなど）の異性体列挙は高校の標準範囲外です。環状炭化水素は骨格のみを収録しています。',
      examples: ['シクロヘキサン'] },
    { test: function (s, g) { return s === 'aromatic-naphthalene'; },
      type: 'out-of-scope',
      reason: 'ナフタレン誘導体の位置異性体の生成は高校の標準範囲外です。1-ナフトール・2-ナフトールは個別に収録しています。',
      examples: ['1-ナフトール', '2-ナフトール'] }
  ];

  var UNSUPPORTED_REASONS = {};
  SKELETONS.forEach(function (sk) {
    if (sk.locked) return;
    GROUPS.forEach(function (g) {
      if (g.id === 'none') return;
      var list = (COMBOS[sk.id] || {})[g.id] || [];
      if (list.length) return;
      var rule = null;
      for (var i = 0; i < REASON_RULES.length; i++) {
        if (REASON_RULES[i].test(sk.id, g.id)) { rule = REASON_RULES[i]; break; }
      }
      if (!rule) return;
      UNSUPPORTED_REASONS[sk.id + '|' + g.id] = {
        skeleton: sk.id,
        group: g.id,
        type: rule.type,
        reason: rule.reason,
        examples: rule.examples || []
      };
    });
  });

  function unsupportedReason(skeletonId, groupId) {
    var entry = UNSUPPORTED_REASONS[skeletonId + '|' + groupId];
    return entry ? entry.reason : null;
  }

  function unsupportedEntry(skeletonId, groupId) {
    return UNSUPPORTED_REASONS[skeletonId + '|' + groupId] || null;
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
   * 収録カバレッジ（教科書・主要入試の標準範囲のチェックリスト）
   * ------------------------------------------------------------------ */
  var COVERAGE = [
    { id: 'alkanes', label: 'アルカン（C1〜C6・骨格異性体）', source: 'textbook', items: [
      'methane', 'ethane', 'propane', 'butane', 'isobutane', 'pentane', 'isopentane', 'neopentane',
      'hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane'
    ] },
    { id: 'unsaturates', label: 'アルケン・アルキン（水素置換生成物を含む）', source: 'textbook', items: [
      'ethene', 'propene', 'but-1-ene', 'but-2-ene', 'isobutene', 'ethyne', 'propyne', 'but-1-yne', 'but-2-yne',
      'ethenol', 'allyl-alcohol', 'prop-1-en-1-ol', 'prop-1-en-2-ol',
      '1-chloropropene', '2-chloropropene', '3-chloropropene', 'acrolein',
      'but-3-enoic-acid', 'crotonic-acid'
    ] },
    { id: 'cyclics', label: '環状炭化水素', source: 'textbook', items: [
      'cyclopropane', 'cyclobutane', 'cyclopentane', 'cyclohexane'
    ] },
    { id: 'aromatic-hydrocarbons', label: '芳香族炭化水素', source: 'textbook', items: [
      'benzene', 'naphthalene', 'toluene', 'styrene', 'ethylbenzene', 'cumene',
      'o-xylene', 'm-xylene', 'p-xylene'
    ] },
    { id: 'alcohols', label: 'アルコール・多価アルコール', source: 'textbook', items: [
      'methanol', 'ethanol', 'propan-1-ol', 'propan-2-ol', 'butan-1-ol', 'butan-2-ol',
      '2-methylpropan-1-ol', '2-methylpropan-2-ol', 'pentan-1-ol', 'pentan-2-ol', 'pentan-3-ol',
      '2-methylbutan-1-ol', '2-methylbutan-2-ol', '3-methylbutan-1-ol', '3-methylbutan-2-ol',
      '2,2-dimethylpropan-1-ol', 'ethylene-glycol', 'glycerol', 'propylene-glycol'
    ] },
    { id: 'ethers', label: 'エーテル', source: 'textbook', items: [
      'dimethyl-ether', 'diethyl-ether', 'methoxyethane', '1-methoxypropane', '2-methoxypropane'
    ] },
    { id: 'aldehydes-ketones', label: 'アルデヒド・ケトン', source: 'textbook', items: [
      'formaldehyde', 'ethanal', 'propanal', 'butanal', '2-methylpropanal', 'pentanal',
      '2-methylbutanal', '3-methylbutanal', '2,2-dimethylpropanal', 'acetone', 'butanone', 'acrolein'
    ] },
    { id: 'carboxylic-acids', label: 'カルボン酸（脂肪族・芳香族・不飽和）', source: 'textbook', items: [
      'formic-acid', 'acetic-acid', 'propionic-acid', 'butanoic-acid', '2-methylpropanoic-acid',
      'pentanoic-acid', '2-methylbutanoic-acid', '3-methylbutanoic-acid', '2,2-dimethylpropanoic-acid',
      'oxalic-acid', 'acrylic-acid', 'methacrylic-acid', 'maleic-acid', 'fumaric-acid',
      'malonic-acid', 'succinic-acid', 'glutaric-acid', 'adipic-acid', 'lactic-acid',
      'tartaric-acid', 'citric-acid', 'pyruvic-acid', 'benzoic-acid', 'salicylic-acid',
      'phthalic-acid', 'isophthalic-acid', 'terephthalic-acid', 'palmitic-acid', 'stearic-acid',
      'oleic-acid', 'linoleic-acid', 'linolenic-acid', 'elaidic-acid'
    ] },
    { id: 'esters', label: 'エステル', source: 'textbook', items: [
      'methyl-formate', 'ethyl-formate', 'propyl-formate', 'methyl-acetate', 'ethyl-acetate',
      'methyl-propionate', 'ethyl-propionate', 'isoamyl-acetate', 'methyl-salicylate',
      'ethyl-butyrate', 'butyl-acetate', 'triacetin', 'aspirin'
    ] },
    { id: 'lipids-soaps', label: '油脂・脂肪酸・セッケン・合成洗剤', source: 'textbook', items: [
      'tristearin', 'tripalmitin', 'triolein', 'trilinolein', 'sodium-stearate',
      'sodium-palmitate', 'sodium-oleate', 'sodium-laurate', 'sds', 'las'
    ] },
    { id: 'aromatic-others', label: 'フェノール類・芳香族アミン・その他の芳香族', source: 'textbook', items: [
      'phenol', 'o-cresol', 'm-cresol', 'p-cresol', 'catechol', 'resorcinol', 'hydroquinone',
      '1-naphthol', '2-naphthol', 'aniline', 'aniline-hydrochloride', 'acetanilide',
      'benzenediazonium-chloride', 'nitrobenzene', 'o-nitrotoluene', 'm-nitrotoluene',
      'p-nitrotoluene', 'tnt', 'picric-acid', 'benzenesulfonic-acid', 'benzaldehyde',
      'chlorobenzene', 'methyl-orange', 'phenolphthalein', 'bisphenol-a', 'benzyl-alcohol', 'anisole'
    ] },
    { id: 'sugars', label: '糖類（単糖・二糖・多糖・糖アルコール）', source: 'textbook', items: [
      'glucose', 'fructose', 'galactose', 'mannose', 'ribose', 'deoxyribose', 'sucrose',
      'maltose', 'lactose', 'starch', 'amylopectin', 'dextrin', 'cellulose', 'glycogen',
      'chitin', 'sorbitol', 'cellulose-acetate', 'cellulose-nitrate'
    ] },
    { id: 'amino-acids', label: '標準20アミノ酸・ペプチド・タンパク質', source: 'textbook', items: [
      'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'serine', 'threonine',
      'cysteine', 'methionine', 'aspartic-acid', 'glutamic-acid', 'asparagine', 'glutamine',
      'lysine', 'arginine', 'histidine', 'phenylalanine', 'tyrosine', 'tryptophan', 'proline',
      'cystine', 'glycylalanine', 'glycylglycine', 'alanylglycine', 'glutathione', 'aspartame', 'protein'
    ] },
    { id: 'nucleic-acids', label: '核酸', source: 'textbook', items: ['dna', 'rna'] },
    { id: 'halides', label: 'ハロゲン化物', source: 'textbook', items: [
      'chloromethane', 'chloroethane', '1-chloropropane', '2-chloropropane',
      '1-chlorobutane', '2-chlorobutane', '1-chloro-2-methylpropane', '2-chloro-2-methylpropane',
      'bromoethane', '1-bromopropane', '2-bromopropane', 'iodoethane',
      'vinyl-chloride', 'vinylidene-chloride', 'chloroprene'
    ] },
    { id: 'amines-nitriles', label: 'アミン・ニトリル・ニトロ化合物', source: 'textbook', items: [
      'methylamine', 'ethylamine', 'propylamine', 'isopropylamine', 'dimethylamine',
      'trimethylamine', 'diethylamine', 'triethylamine', 'butan-1-amine', 'butan-2-amine',
      '2-methylpropan-1-amine', '2-methylpropan-2-amine', 'n-methylpropan-1-amine',
      'n-methylpropan-2-amine', 'n,n-dimethylethanamine', 'nitromethane',
      'acetonitrile', 'propanenitrile', 'butanenitrile', 'benzonitrile', 'acrylonitrile'
    ] },
    { id: 'monomers', label: '合成高分子の単量体', source: 'textbook', items: [
      'ethene', 'propene', 'styrene', 'butadiene', 'isoprene', 'vinyl-chloride',
      'vinylidene-chloride', 'chloroprene', 'acrylonitrile', 'vinyl-acetate',
      'methyl-methacrylate', 'caprolactam', 'hexamethylenediamine', 'urea', 'melamine',
      'tetrafluoroethylene', 'phosgene', 'bisphenol-a', 'terephthalic-acid', 'ethylene-glycol', 'lactic-acid',
      'epichlorohydrin', 'p-phenylenediamine', 'dimethyldichlorosilane'
    ] },
    { id: 'synthetic-polymers', label: '合成高分子', source: 'textbook', items: [
      'polyethylene', 'polypropylene', 'polystyrene', 'pvc', 'pet', 'nylon66', 'pva', 'vinylon',
      'pmma', 'pan', 'ptfe', 'pvac', 'pvdc', 'nylon6', 'phenol-resin', 'urea-resin',
      'melamine-resin', 'epoxy-resin', 'silicone', 'polyurethane', 'sbr', 'br',
      'chloroprene-rubber', 'pla', 'polycarbonate', 'sodium-polyacrylate', 'aramid', 'abs',
      'nbr', 'iir', 'unsaturated-polyester', 'alkyd-resin', 'polyacetylene', 'polyaniline'
    ] },
    { id: 'natural-polymers', label: '天然高分子', source: 'textbook', items: [
      'natural-rubber', 'protein', 'starch', 'cellulose', 'chitin', 'dna', 'rna'
    ] }
  ];

  var COVERAGE_META = {
    note: 'このチェックリストは、高校「化学」の教科書と主要入試で扱う標準的な物質・同族体・異性体・高分子を分野ごとに整理したものです。件数の多さではなく、各項目が実際に登録され、構造検証と出典情報をもつことを確認します。',
    scope: '標準的な教科書で扱う範囲を目安とし、主要入試は公開された出題範囲の傾向を参考にしています。特定の問題集からの転載ではなく、入試に出うるすべての物質を網羅したとは主張しません。',
    exclusions: '空の組合せは「高校化学の範囲外」または「化学的に成立しない」に分類し、理由と具体例を台帳に表示します。登録済みデータの検証失敗は範囲外ではなくデータ不備として扱います。'
  };

  // カバレッジとは独立に固定した「高校化学の必須物質」リスト。
  // データから自動生成せず、収録漏れ検出の基準として使う。
  var REQUIRED_CURRICULUM = [
    'methane', 'ethane', 'propane', 'butane', 'isobutane', 'pentane', 'isopentane', 'neopentane',
    'hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane',
    'ethene', 'propene', 'but-1-ene', 'but-2-ene', 'isobutene',
    'ethyne', 'propyne', 'but-1-yne', 'but-2-yne',
    'cyclopropane', 'cyclobutane', 'cyclopentane', 'cyclohexane',
    'benzene', 'naphthalene', 'toluene', 'styrene', 'ethylbenzene', 'cumene',
    'o-xylene', 'm-xylene', 'p-xylene',
    'methanol', 'ethanol', 'propan-1-ol', 'propan-2-ol', 'butan-1-ol', 'butan-2-ol',
    '2-methylpropan-1-ol', '2-methylpropan-2-ol', 'pentan-1-ol', 'pentan-2-ol', 'pentan-3-ol',
    '2-methylbutan-1-ol', '2-methylbutan-2-ol', '3-methylbutan-1-ol', '3-methylbutan-2-ol',
    '2,2-dimethylpropan-1-ol', 'ethylene-glycol', 'glycerol', 'propylene-glycol',
    'dimethyl-ether', 'diethyl-ether', 'methoxyethane', '1-methoxypropane', '2-methoxypropane',
    'formaldehyde', 'ethanal', 'propanal', 'butanal', '2-methylpropanal', 'pentanal',
    '2-methylbutanal', '3-methylbutanal', '2,2-dimethylpropanal', 'acetone', 'butanone', 'acrolein',
    'formic-acid', 'acetic-acid', 'propionic-acid', 'butanoic-acid', '2-methylpropanoic-acid',
    'pentanoic-acid', '2-methylbutanoic-acid', '3-methylbutanoic-acid', '2,2-dimethylpropanoic-acid',
    'oxalic-acid', 'lactic-acid', 'acrylic-acid', 'methacrylic-acid', 'maleic-acid', 'fumaric-acid',
    'malonic-acid', 'succinic-acid', 'glutaric-acid', 'adipic-acid', 'tartaric-acid', 'citric-acid',
    'pyruvic-acid', 'benzoic-acid', 'salicylic-acid', 'phthalic-acid', 'isophthalic-acid',
    'terephthalic-acid', 'palmitic-acid', 'stearic-acid', 'oleic-acid', 'linoleic-acid',
    'linolenic-acid', 'elaidic-acid',
    'methyl-formate', 'ethyl-formate', 'propyl-formate', 'methyl-acetate', 'ethyl-acetate',
    'methyl-propionate', 'ethyl-propionate', 'isoamyl-acetate', 'methyl-salicylate',
    'ethyl-butyrate', 'butyl-acetate', 'triacetin', 'aspirin',
    'tristearin', 'tripalmitin', 'triolein', 'trilinolein', 'sodium-stearate', 'sodium-palmitate',
    'sodium-oleate', 'sodium-laurate', 'sds', 'las',
    'phenol', 'aniline', 'benzaldehyde', 'nitrobenzene', 'chlorobenzene',
    'o-cresol', 'm-cresol', 'p-cresol', 'catechol', 'resorcinol', 'hydroquinone',
    '1-naphthol', '2-naphthol', 'o-nitrotoluene', 'm-nitrotoluene', 'p-nitrotoluene',
    'tnt', 'picric-acid', 'benzenesulfonic-acid', 'acetanilide', 'aniline-hydrochloride',
    'benzenediazonium-chloride', 'methyl-orange', 'phenolphthalein', 'bisphenol-a',
    'benzyl-alcohol', 'anisole',
    'glucose', 'fructose', 'galactose', 'mannose', 'ribose', 'deoxyribose', 'sucrose', 'maltose',
    'lactose', 'starch', 'amylopectin', 'dextrin', 'cellulose', 'glycogen', 'chitin', 'sorbitol',
    'cellulose-acetate', 'cellulose-nitrate',
    'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'serine', 'threonine', 'cysteine',
    'methionine', 'aspartic-acid', 'glutamic-acid', 'asparagine', 'glutamine', 'lysine',
    'arginine', 'histidine', 'phenylalanine', 'tyrosine', 'tryptophan', 'proline',
    'cystine', 'glycylalanine', 'glycylglycine', 'alanylglycine', 'glutathione', 'aspartame', 'protein',
    'dna', 'rna',
    'chloromethane', 'chloroethane', '1-chloropropane', '2-chloropropane', '1-chlorobutane',
    '2-chlorobutane', '1-chloro-2-methylpropane', '2-chloro-2-methylpropane', 'bromoethane',
    '1-bromopropane', '2-bromopropane', 'iodoethane', 'vinyl-chloride', 'vinylidene-chloride', 'chloroprene',
    'methylamine', 'ethylamine', 'propylamine', 'isopropylamine', 'dimethylamine', 'trimethylamine',
    'diethylamine', 'triethylamine', 'butan-1-amine', 'butan-2-amine', '2-methylpropan-1-amine',
    '2-methylpropan-2-amine', 'n-methylpropan-1-amine', 'n-methylpropan-2-amine',
    'n,n-dimethylethanamine', 'nitromethane', 'acetonitrile', 'propanenitrile', 'butanenitrile',
    'benzonitrile', 'acrylonitrile', 'p-phenylenediamine',
    'butadiene', 'isoprene', 'vinyl-acetate', 'methyl-methacrylate', 'caprolactam',
    'hexamethylenediamine', 'urea', 'melamine', 'tetrafluoroethylene', 'phosgene',
    'epichlorohydrin', 'dimethyldichlorosilane',
    'polyethylene', 'polypropylene', 'polystyrene', 'pvc', 'pet', 'nylon66', 'pva', 'vinylon',
    'pmma', 'pan', 'ptfe', 'pvac', 'pvdc', 'nylon6', 'phenol-resin', 'urea-resin', 'melamine-resin',
    'epoxy-resin', 'silicone', 'polyurethane', 'sbr', 'br', 'chloroprene-rubber', 'pla',
    'polycarbonate', 'sodium-polyacrylate', 'aramid', 'abs', 'nbr', 'iir', 'unsaturated-polyester',
    'alkyd-resin', 'polyacetylene', 'polyaniline', 'natural-rubber',
    'ethenol', 'allyl-alcohol', 'prop-1-en-1-ol', 'prop-1-en-2-ol',
    '1-chloropropene', '2-chloropropene', '3-chloropropene', 'but-3-enoic-acid', 'crotonic-acid'
  ];

  var COVERAGE_STATS = (function () {
    var seen = {};
    var total = 0;
    var missing = [];
    COVERAGE.forEach(function (group) {
      group.items.forEach(function (id) {
        total++;
        if (!COMPOUNDS[id]) missing.push(id);
        seen[id] = true;
      });
    });
    var unique = Object.keys(seen).length;
    var compounds = Object.keys(COMPOUNDS);
    var uncovered = compounds.filter(function (id) { return !seen[id]; });
    return {
      groups: COVERAGE.length,
      totalItems: total,
      uniqueItems: unique,
      duplicateItems: total - unique,
      compoundCount: compounds.length,
      missing: missing,
      uncovered: uncovered
    };
  })();

  /* ------------------------------------------------------------------
   * 解説の補完（個別に確認できる主要反応・前駆体だけを明示する）
   * カテゴリ単位の一律コピーは行わない。
   * ------------------------------------------------------------------ */
  var REACTION_INFO = {};
  function setInfo(ids, precursors, reactions) {
    ids.forEach(function (id) {
      if (!REACTION_INFO[id]) REACTION_INFO[id] = {};
      if (precursors) REACTION_INFO[id].precursors = precursors;
      if (reactions) REACTION_INFO[id].reactions = reactions;
    });
  }

  setInfo([
    'methane', 'ethane', 'propane', 'butane', 'isobutane', 'pentane', 'isopentane', 'neopentane',
    'hexane', '2-methylpentane', '3-methylpentane', '2,2-dimethylbutane', '2,3-dimethylbutane'
  ], '天然ガス・石油に含まれる。', '燃焼、塩素化・臭素化などのラジカル置換。');
  setInfo([
    'ethene', 'propene', 'but-1-ene', 'but-2-ene', 'isobutene'
  ], '石油化学工業で製造（接触分解・脱水素など）。', '付加反応、付加重合。');
  setInfo([
    'ethyne', 'propyne', 'but-1-yne', 'but-2-yne'
  ], 'エチンは炭化カルシウムと水から、他のアルキンは石油化学工業で製造。', '付加反応、燃焼。');
  setInfo([
    'cyclopropane', 'cyclobutane', 'cyclopentane', 'cyclohexane'
  ], '石油に含まれる、または工業的に合成。', '燃焼、置換反応。小員環は付加反応も起こす。');
  setInfo([
    'benzene', 'naphthalene', 'toluene'
  ], '石油・石炭タールに含まれる、または工業合成。', '求電子置換（ニトロ化・スルホン化など）、付加反応。');
  setInfo(['styrene'], 'エチレンとベンゼンからエチルベンゼンを経て製造。', '付加重合でポリスチレン。');
  setInfo(['ethylbenzene'], 'ベンゼンとエチレンのアルキル化で製造。', '脱水素でスチレンを生成。');
  setInfo(['cumene'], 'ベンゼンとプロペンのアルキル化で製造。', '酸化でフェノールとアセトン（クメン法）。');
  setInfo([
    'o-xylene', 'm-xylene', 'p-xylene'
  ], '石油の接触改質・石炭タールから得られる。', '酸化でフタル酸類を生成。');

  setInfo(['methanol'], '天然ガス・石炭から合成ガス（CO＋H₂）を経て工業合成。発酵では得られない。', '酸化でホルムアルデヒド、脱水・エステル化。');
  setInfo(['ethanol'], '糖の発酵、またはエチレンの水和で製造。', '酸化、脱水、エステル化。');
  setInfo([
    'propan-1-ol', 'propan-2-ol', 'butan-1-ol', 'butan-2-ol', '2-methylpropan-1-ol',
    '2-methylpropan-2-ol', 'pentan-1-ol', 'pentan-2-ol', 'pentan-3-ol',
    '2-methylbutan-1-ol', '2-methylbutan-2-ol', '3-methylbutan-1-ol', '3-methylbutan-2-ol',
    '2,2-dimethylpropan-1-ol'
  ], 'アルケンの水和、またはカルボニル化合物の還元・水素化で製造。', '酸化、脱水、エステル化。');

  setInfo(['dimethyl-ether'], 'メタノールの脱水縮合で製造。', '可燃性、酸による開裂。');
  setInfo(['diethyl-ether'], 'エタノールの脱水縮合で製造。', '過酸化物の生成、酸による開裂。');
  setInfo([
    'methoxyethane', '1-methoxypropane', '2-methoxypropane'
  ], 'アルコールの脱水縮合、またはウィリアムソン合成で製造。', '酸による開裂、過酸化物の生成に注意。');

  setInfo(['formaldehyde'], 'メタノールの酸化・脱水素で製造。', '還元でメタノール、酸化でギ酸、求核付加。');
  setInfo(['ethanal'], 'エタノールの酸化、またはエチレンの酸化で製造。', '還元、酸化、アセタール化。');
  setInfo([
    'propanal', 'butanal', '2-methylpropanal', 'pentanal', '2-methylbutanal',
    '3-methylbutanal', '2,2-dimethylpropanal'
  ], 'アルコールの酸化、またはアルケンのヒドロホルミル化で製造。', '還元、酸化、求核付加。');
  setInfo(['acrolein'], 'プロペンの酸化で製造。', '求核付加、付加重合。');
  setInfo(['acetone'], 'クメン法（フェノール製造の副生物）、またはプロペンの酸化で製造。', '還元、求核付加、縮合。');
  setInfo(['butanone'], 'ブテンの水和・酸化、または2-ブタノールの酸化で製造。', '還元、求核付加。');

  setInfo(['formic-acid'], '一酸化炭素と水酸化ナトリウムから、またはメタノールの酸化で製造。', '還元、酸化、エステル化。');
  setInfo(['acetic-acid'], 'メタノールのカルボニル化、またはエタノールの酸化で製造。', '中和、エステル化、酢酸ビニル合成。');
  setInfo([
    'propionic-acid', 'butanoic-acid', '2-methylpropanoic-acid', 'pentanoic-acid',
    '2-methylbutanoic-acid', '3-methylbutanoic-acid', '2,2-dimethylpropanoic-acid'
  ], 'アルデヒドの酸化、または工業合成。', '中和、エステル化。');
  setInfo(['oxalic-acid'], 'ギ酸ナトリウムの熱分解などで製造。', '中和、還元、金属イオンとの錯形成。');
  setInfo(['lactic-acid'], '糖の乳酸発酵、またはプロピレングリコールの酸化で製造。', '縮重合でポリ乳酸、酸化。');
  setInfo(['acrylic-acid'], 'プロペンの酸化で製造。', '付加重合、エステル化。');
  setInfo(['methacrylic-acid'], 'アセトンとシアン化水素からメタクリル酸を経て製造。', '付加重合、エステル化。');
  setInfo(['maleic-acid', 'fumaric-acid'], 'ベンゼンまたはブタンの酸化で製造。', '異性化、付加、重合。');
  setInfo(['malonic-acid', 'succinic-acid', 'glutaric-acid'], 'ジカルボン酸の工業合成。', 'エステル化、縮重合。');
  setInfo(['adipic-acid'], 'シクロヘキサンの酸化で製造。', 'ヘキサメチレンジアミンと縮重合してナイロン-6,6。');
  setInfo(['tartaric-acid'], '酒石から得る、または工業合成。', '中和、エステル化、光学分割。');
  setInfo(['citric-acid'], '柑橘類から得る、または糖の発酵で製造。', '中和、金属イオンとのキレート形成。');
  setInfo(['pyruvic-acid'], '乳酸の酸化、または生化学的代謝で生成。', '還元、アミノ基転移。');
  setInfo([
    'palmitic-acid', 'stearic-acid', 'oleic-acid', 'linoleic-acid', 'linolenic-acid', 'elaidic-acid'
  ], '油脂の加水分解で得られる。', '中和（セッケン）、エステル化、不飽和酸は水素添加。');
  setInfo(['benzoic-acid'], 'トルエンの酸化で製造。', '中和、エステル化、安息香酸ナトリウム。');
  setInfo(['salicylic-acid'], 'フェノールのカルボキシル化（コルベ・シュミット反応）で製造。', 'アセチル化でアスピリン、エステル化。');
  setInfo(['phthalic-acid', 'isophthalic-acid', 'terephthalic-acid'], 'キシレンの酸化などで製造。', 'エステル化・縮重合（PET等）。');

  setInfo([
    'methyl-formate', 'ethyl-formate', 'propyl-formate'
  ], 'ギ酸とアルコールのエステル化で製造。', '加水分解、エステル交換。');
  setInfo(['methyl-acetate', 'ethyl-acetate'], '酢酸とアルコールのエステル化で製造。', '加水分解、エステル交換。');
  setInfo(['methyl-propionate', 'ethyl-propionate'], 'プロピオン酸とアルコールのエステル化で製造。', '加水分解。');
  setInfo(['isoamyl-acetate'], '酢酸とイソアミルアルコールのエステル化で製造。', '加水分解（香料）。');
  setInfo(['methyl-salicylate'], 'サリチル酸とメタノールのエステル化で製造。', '加水分解、外用消炎作用。');
  setInfo(['ethyl-butyrate', 'butyl-acetate', 'triacetin'], 'カルボン酸とアルコールのエステル化で製造。', '加水分解、エステル交換。');
  setInfo(['aspirin'], 'サリチル酸のアセチル化で製造。', '加水分解でサリチル酸と酢酸。');

  setInfo([
    'tristearin', 'tripalmitin', 'triolein', 'trilinolein'
  ], 'グリセリンと脂肪酸のエステル化で生成（油脂の主成分）。', 'けん化でセッケンとグリセリン、不飽和鎖は水素添加。');
  setInfo([
    'sodium-stearate', 'sodium-palmitate', 'sodium-oleate', 'sodium-laurate'
  ], '油脂のけん化、または脂肪酸の中和で製造。', '加水分解、ミセル形成。');
  setInfo(['sds'], 'ドデカノールの硫酸エステル化後、中和して製造。', '加水分解、界面活性。');
  setInfo(['las'], '直鎖アルキルベンゼンのスルホン化後、中和して製造。', '加水分解、生分解。');

  setInfo(['phenol'], 'クメン法、または石炭タールから得られる。', '中和、求電子置換、縮合（フェノール樹脂）。');
  setInfo(['aniline'], 'ニトロベンゼンの還元で製造。', '中和、ジアゾ化、縮合。');
  setInfo(['benzaldehyde'], 'トルエンの酸化などで製造。', '酸化で安息香酸、還元でベンジルアルコール。');
  setInfo(['nitrobenzene'], 'ベンゼンのニトロ化で製造。', '還元でアニリン。');
  setInfo(['chlorobenzene'], 'ベンゼンの塩素化で製造。', '求電子置換、加水分解。');
  setInfo([
    'o-cresol', 'm-cresol', 'p-cresol'
  ], '石炭タールから得る、またはフェノールのメチル化で製造。', '酸化、縮合。');
  setInfo(['catechol', 'resorcinol', 'hydroquinone'], 'フェノールの酸化・ジヒドロキシ化などで製造。', '酸化還元、縮合。');
  setInfo(['1-naphthol', '2-naphthol'], 'ナフタレンのスルホン化・アルカリ融解などで製造。', '中和、アゾカップリング（染料）。');
  setInfo([
    'o-nitrotoluene', 'm-nitrotoluene', 'p-nitrotoluene'
  ], 'トルエンのニトロ化で製造。', '還元でトルイジン、酸化。');
  setInfo(['tnt'], 'トルエンのニトロ化で製造。', '還元、爆発。');
  setInfo(['picric-acid'], 'フェノールのニトロ化で製造。', '中和、爆発。');
  setInfo(['benzenesulfonic-acid'], 'ベンゼンのスルホン化で製造。', '中和、アルカリ融解でフェノール。');
  setInfo(['acetanilide'], 'アニリンのアセチル化で製造。', '加水分解でアニリン。');
  setInfo(['aniline-hydrochloride'], 'アニリンと塩酸の中和で生成。', '中和、ジアゾ化。');
  setInfo(['benzenediazonium-chloride'], 'アニリンのジアゾ化（亜硝酸ナトリウム＋塩酸）で生成。', 'アゾカップリング、加水分解。');
  setInfo(['methyl-orange'], 'ジアゾニウム塩とN,N-ジメチルアニリンのアゾカップリングで製造。', 'pH指示薬、還元。');
  setInfo(['phenolphthalein'], 'フェノールと無水フタル酸の縮合で製造。', 'ラクトン開環による変色。');
  setInfo(['bisphenol-a'], 'フェノールとアセトンの縮合で製造。', 'エポキシ樹脂・ポリカーボネート原料。');
  setInfo(['benzyl-alcohol'], 'ベンズアルデヒドの還元、またはベンジルクロリドの加水分解で製造。', '酸化でベンズアルデヒド。');
  setInfo(['anisole'], 'フェノールのメチル化で製造。', '求電子置換、酸による開裂。');

  setInfo(['glucose'], 'デンプンの加水分解、または光合成で生成。', '酸化、還元、発酵、環状化。');
  setInfo(['fructose'], 'スクロースの加水分解、またはグルコースの異性化で生成。', '還元、発酵。');
  setInfo(['galactose', 'mannose', 'ribose', 'deoxyribose'], '多糖・核酸の加水分解で得られる。', '還元、異性化。');
  setInfo(['sucrose'], 'サトウキビ・テンサイから抽出。', '加水分解でグルコースとフルクトース（転化糖）。');
  setInfo(['maltose'], 'デンプンの加水分解で生成。', '加水分解でグルコース。');
  setInfo(['lactose'], '乳汁に含まれる。', '加水分解でガラクトースとグルコース。');
  setInfo(['starch'], '植物の光合成で生成。', '加水分解でマルトース・グルコース、ヨウ素反応。');
  setInfo(['amylopectin'], '植物の光合成で生成（デンプンの主成分）。', '加水分解でグルコース。');
  setInfo(['dextrin'], 'デンプンの部分加水分解で生成。', '加水分解でグルコース。');
  setInfo(['cellulose'], '植物の細胞壁で生合成。', '加水分解、エステル化（アセテート・ナイトレート）。');
  setInfo(['glycogen'], '動物の肝臓・筋肉で生合成。', '加水分解でグルコース。');
  setInfo(['chitin'], '甲殻類・昆虫・菌類で生合成。', '加水分解、脱アセチル化でキトサン。');
  setInfo(['sorbitol'], 'グルコースの還元で製造。', '酸化、エステル化。');
  setInfo(['cellulose-acetate'], 'セルロースのアセチル化で製造。', '加水分解（脱アセチル化）、アセチル化度の調整。');
  setInfo(['cellulose-nitrate'], 'セルロースのニトロ化で製造。', '燃焼・爆発、加水分解。');

  setInfo([
    'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'serine', 'threonine',
    'cysteine', 'methionine', 'aspartic-acid', 'glutamic-acid', 'asparagine', 'glutamine',
    'lysine', 'arginine', 'histidine', 'phenylalanine', 'tyrosine', 'tryptophan', 'proline'
  ], 'タンパク質の加水分解で得られる。', 'アミノ基・カルボキシ基の反応、ペプチド結合。');
  setInfo(['cystine'], '2分子のシステインの酸化（ジスルフィド結合）で生成。', '還元でシステイン、ジスルフィド結合。');
  setInfo(['glycylalanine', 'glycylglycine', 'alanylglycine'], 'アミノ酸のペプチド結合（縮合）で合成。', '加水分解でアミノ酸。');
  setInfo(['glutathione'], 'グルタミン酸・システイン・グリシンから生合成。', '酸化還元（ジスルフィド結合）。');
  setInfo(['aspartame'], 'アスパラギン酸とフェニルアラニンの縮合・エステル化で製造。', '加水分解。');
  setInfo(['protein'], 'アミノ酸のペプチド結合による生合成。', '加水分解でアミノ酸、変性。');
  setInfo(['dna', 'rna'], 'ヌクレオチドの重合（生合成）。', '加水分解でヌクレオチド、変性。');

  setInfo(['ethene'], '石油化学工業で製造。', '付加重合でポリエチレン、水和でエタノール。');
  setInfo(['propene'], '石油化学工業で製造。', '付加重合でポリプロピレン、酸化でアクリル酸。');
  setInfo(['butadiene'], 'ブタン・ブテンの脱水素で製造。', '付加重合でポリブタジエン、スチレンと共重合でSBR。');
  setInfo(['isoprene'], '石油の接触分解・イソペンタンの脱水素などで製造。天然ゴムの構成単位。', '付加重合でポリイソプレン。');
  setInfo(['vinyl-chloride'], 'エチレンの塩素化・脱塩化水素、またはアセチレンと塩化水素から製造。', '付加重合でPVC。');
  setInfo(['vinylidene-chloride'], 'トリクロロエタンの脱塩化水素などで製造。', '付加重合でPVDC。');
  setInfo(['chloroprene'], 'ブタジエンの塩素化・脱塩化水素で製造。', '付加重合でクロロプレンゴム。');
  setInfo(['acrylonitrile'], 'プロペンのアンモ酸化で製造。', '付加重合・共重合（PAN、ABS）。');
  setInfo(['vinyl-acetate'], 'エチレンと酢酸のアセトキシ化で製造。', '付加重合でPVAc、けん化でPVA。');
  setInfo(['methyl-methacrylate'], 'アセトンとシアン化水素からメタクリル酸を経てエステル化。', '付加重合でPMMA。');
  setInfo(['caprolactam'], 'シクロヘキサノンから合成。', '開環重合でナイロン-6。');
  setInfo(['hexamethylenediamine'], 'アジピン酸から合成。', 'アジピン酸と縮重合してナイロン-6,6。');
  setInfo(['urea'], 'アンモニアと二酸化炭素から合成。', '加水分解、尿素樹脂の原料。');
  setInfo(['melamine'], '尿素から合成。', 'メラミン樹脂の原料。');
  setInfo(['tetrafluoroethylene'], 'クロロジフルオロメタンの熱分解などで製造。', '付加重合でPTFE。');
  setInfo(['phosgene'], '一酸化炭素と塩素から工業合成。', 'ポリカーボネート・ポリウレタンの原料；アミン・アルコールと反応。');
  setInfo(['epichlorohydrin'], 'プロペンからアリルクロリドを経て合成。', 'エポキシ樹脂原料、開環付加。');
  setInfo(['p-phenylenediamine'], 'p-ニトロアニリンの還元などで製造。', 'アラミドの縮重合原料。');
  setInfo(['dimethyldichlorosilane'], 'ケイ素と塩化メチルから合成。', '加水分解・縮重合でシリコーン。');

  setInfo(['polyethylene'], 'エチレンの付加重合で製造。', '燃焼；通常の加水分解は受けない。');
  setInfo(['polypropylene'], 'プロペンの付加重合で製造。', '燃焼、酸化劣化。');
  setInfo(['polystyrene'], 'スチレンの付加重合で製造。', '燃焼、解重合。');
  setInfo(['pvc'], '塩化ビニルの付加重合で製造。', '脱塩化水素、燃焼時に塩化水素。');
  setInfo(['pet'], 'テレフタル酸とエチレングリコールの縮重合で製造。', '加水分解（解重合）、エステル交換。');
  setInfo(['nylon66'], 'アジピン酸とヘキサメチレンジアミンの縮重合で製造。', '加水分解（アミド結合）。');
  setInfo(['pva'], '酢酸ビニルの重合後、けん化して製造。', 'けん化、アセタール化（ビニロン）。');
  setInfo(['vinylon'], 'ポリビニルアルコールとホルムアルデヒドのアセタール化で製造。', 'ホルマール化でアセタール環を形成。');
  setInfo(['pmma'], 'メタクリル酸メチルの付加重合で製造。', '燃焼、解重合。');
  setInfo(['pan'], 'アクリロニトリルの付加重合で製造。', '炭素化で炭素繊維。');
  setInfo(['ptfe'], 'テトラフルオロエチレンの付加重合で製造。', '高温分解で有害ガス。');
  setInfo(['pvac'], '酢酸ビニルの付加重合で製造。', 'けん化でPVA、加水分解。');
  setInfo(['pvdc'], '塩化ビニリデンの付加重合で製造。', '脱塩化水素。');
  setInfo(['nylon6'], 'ε-カプロラクタムの開環重合で製造。', '加水分解（アミド結合）。');
  setInfo(['phenol-resin'], 'フェノールとホルムアルデヒドの縮重合で製造。', '架橋・熱硬化。');
  setInfo(['urea-resin'], '尿素とホルムアルデヒドの縮重合で製造。', '架橋・熱硬化、加水分解。');
  setInfo(['melamine-resin'], 'メラミンとホルムアルデヒドの縮重合で製造。', '架橋・熱硬化。');
  setInfo(['epoxy-resin'], 'ビスフェノールAとエピクロロヒドリンの縮重合で製造。', '硬化剤による架橋。');
  setInfo(['silicone'], 'ジメチルジクロロシランの加水分解・縮重合で製造。', '架橋、耐熱性。');
  setInfo(['polyurethane'], 'ジイソシアネートとポリオールの重付加（付加重合）で製造。', '加水分解、架橋。');
  setInfo(['sbr'], 'スチレンとブタジエンの共重合で製造。', '加硫、酸化劣化。');
  setInfo(['br'], 'ブタジエンの付加重合で製造。', '加硫、酸化劣化。');
  setInfo(['chloroprene-rubber'], 'クロロプレンの付加重合で製造。', '加硫、耐油性。');
  setInfo(['pla'], '乳酸の縮重合、またはラクチドの開環重合で製造。', '加水分解で乳酸（生分解）。');
  setInfo(['polycarbonate'], 'ビスフェノールAとホスゲン（または炭酸ジエステル）の縮重合で製造。', '加水分解、光劣化。');
  setInfo(['sodium-polyacrylate'], 'アクリル酸の重合後、中和して製造。', '吸水・膨潤、中和。');
  setInfo(['aramid'], 'p-フェニレンジアミンとテレフタル酸の縮重合で製造。', '加水分解、高強度。');
  setInfo(['abs'], 'アクリロニトリル・ブタジエン・スチレンの共重合で製造。', '燃焼、耐衝撃。');
  setInfo(['nbr'], 'アクリロニトリルとブタジエンの共重合で製造。', '加硫、耐油性。');
  setInfo(['iir'], 'イソブチレンと少量のイソプレンの共重合で製造。', '加硫、低気体透過性。');
  setInfo(['unsaturated-polyester'], '不飽和二カルボン酸とジオールの縮重合で製造。', 'スチレン架橋で硬化。');
  setInfo(['alkyd-resin'], '多価アルコール・多塩基酸・脂肪酸の縮重合で製造。', '酸化重合・架橋で塗膜化。');
  setInfo(['polyacetylene'], 'アセチレンの重合で製造。', 'ドープで導電性、酸化劣化。');
  setInfo(['polyaniline'], 'アニリンの酸化重合で製造。', 'ドープで導電性、酸化還元。');
  setInfo(['natural-rubber'], 'パラゴムノキのラテックスから得られる。イソプレンのシス-1,4-重合体。', '加硫、酸化劣化。');

  setInfo(['chloromethane'], 'メタノールと塩化水素の反応、またはメタンの塩素化で製造。', '求核置換（加水分解・アンモニア・シアン化物）、脱ハロゲン化水素。');
  setInfo([
    'chloroethane', '1-chloropropane', '2-chloropropane', '1-chlorobutane', '2-chlorobutane',
    '1-chloro-2-methylpropane', '2-chloro-2-methylpropane', 'bromoethane', '1-bromopropane',
    '2-bromopropane', 'iodoethane'
  ], 'アルコールとハロゲン化水素の反応、またはアルカンのハロゲン化で製造。', '求核置換（加水分解・アンモニア・シアン化物）、脱ハロゲン化水素。');
  setInfo([
    'propylamine', 'isopropylamine', 'dimethylamine', 'trimethylamine', 'diethylamine',
    'triethylamine', 'butan-1-amine', 'butan-2-amine', '2-methylpropan-1-amine',
    '2-methylpropan-2-amine', 'n-methylpropan-1-amine', 'n-methylpropan-2-amine',
    'n,n-dimethylethanamine'
  ], 'アンモニアのアルキル化、またはニトリルの還元で製造。', '中和、アシル化、アルキル化。');
  setInfo(['nitromethane'], 'メタンのニトロ化、または亜硝酸塩とハロゲン化物の反応で製造。', '還元でメチルアミン、弱酸性。');
  setInfo([
    'acetonitrile', 'propanenitrile', 'butanenitrile', 'benzonitrile'
  ], 'アンモ酸化、またはハロゲン化物とシアン化物の反応で製造。', '加水分解でカルボン酸、還元でアミン。');
  setInfo(['ethenol'], 'エテンの水素をOHで置換した構造としてのみ存在（工業的には単離されない）。', '互変異性でアセトアルデヒド。');
  setInfo(['allyl-alcohol'], 'アリルクロリドの加水分解、またはプロペンの酸化で製造。', '酸化でアクロレイン、エステル化。');
  setInfo(['prop-1-en-1-ol', 'prop-1-en-2-ol'], 'プロペンの水素をOHで置換したエノール（単離されにくい）。', '互変異性でカルボニル化合物。');
  setInfo(['1-chloropropene', '2-chloropropene', '3-chloropropene'], 'プロペンの水素をClで置換した構造（工業的には付加・脱離経由）。', '求核置換、脱塩化水素。');
  setInfo(['but-3-enoic-acid', 'crotonic-acid'], 'プロペンの水素をCOOHで置換した不飽和酸（工業的には酸化・脱水）。', '付加、重合、エステル化。');

  Object.keys(REACTION_INFO).forEach(function (id) {
    var c = COMPOUNDS[id];
    if (!c) return;
    if (!c.precursors) c.precursors = REACTION_INFO[id].precursors;
    if (!c.reactions) c.reactions = REACTION_INFO[id].reactions;
  });

  var LEDGER_NOTES = [
    { title: '組合せ生成の意味（水素置換のみ）', detail: '炭素骨格＋官能基の組合せは、骨格のC−H結合を置換する生成だけを扱います。水の付加（エテン＋H₂O→エタノール）や付加反応の生成物は混在させず、必要に応じて個別化合物として登録しています。アルケンのC−Hを−OHや−Clで置換したエノール・塩化ビニル等は、付加物とは別の物質として収録しています。' },
    { title: '空の組合せの理由', detail: '空の組合せは「高校化学の範囲外」と「化学的に成立しない」の2分類だけを使います。範囲外には具体例と、教科書で扱う範囲の目安を添えています。登録済み化合物の検証失敗は範囲外にせず、データ不備として表示を止めます。' },
    { title: 'アルカン・アルコールの範囲', detail: 'アルカンはC1〜C6の骨格異性体を収録し、C5アルコールは8種すべてを収録しました。C6アルカンの置換体など、異性体列挙が教科書の標準範囲を超えるものは範囲外としています。' },
    { title: '幾何異性体（シス/トランス）', detail: 'ブタ-2-エンなどはシス/トランスを区別せず構造異性体として1件表示します。一方、マレイン酸/フマル酸、オレイン酸/エライジン酸は個別化合物として収録し、名称と構造式で区別しています。' },
    { title: '光学異性体（R/S）', detail: 'アミノ酸・乳酸などの光学異性体は原則として区別しません。糖類はフィッシャー投影式のOH配置をデータとして保持し、D-グルコース・D-ガラクトース・D-マンノース・D-リボース・D-デオキシリボースを区別します。' },
    { title: '多置換ベンゼン', detail: '組合せ生成ではベンゼン環の単置換体だけを生成します。キシレン・クレゾール・ジヒドロキシベンゼン・ニトロトルエン・TNT・ピクリン酸などは、o-/m-/p- を含めて個別化合物として収録しています。' },
    { title: '糖類の環状構造', detail: 'グルコースは鎖状・α・βの3形態、フルクトースは鎖状・α/β-フルクトフラノースの3形態を収録しました。ガラクトース・マンノース・リボース・デオキシリボースはフィッシャー投影式で収録し、スクロース・マルトース・ラクトース・多糖は構成糖の模式図で表示します。' },
    { title: '高分子の可変組成', detail: '付加重合体は繰り返し単位の一般式で表示します。フェノール樹脂・尿素樹脂・メラミン樹脂・エポキシ樹脂・ポリウレタン・SBR・ABS・タンパク質・DNA/RNA・セルロース誘導体は、架橋度・共重合比・置換度・塩基配列で組成が変わるため、固定の分子式を偽らず「組成依存」と表示します。' },
    { title: '高分子の立体構造・重合度', detail: '高分子は繰り返し単位と一般式で表示し、重合度nや立体規則性は特定しません。天然ゴムはシス-1,4-ポリイソプレンとして表示します。' },
    { title: 'タンパク質・アミノ酸', detail: '標準20アミノ酸とシスチン、代表的なジペプチド・トリペプチドを収録しました。タンパク質は —[NH—CH(R)—CO]— の繰り返し単位をもち、分子式は側鎖Rと重合度に依存します。R=Hの場合の参考単位は C2H3NO です。' },
    { title: '核酸', detail: 'DNA・RNAは糖—リン酸鎖と塩基対の模式図で収録し、塩基配列・重合度に依存する可変組成として扱います。具体的な塩基配列や高次構造は固定しません。' },
    { title: 'ビニロン', detail: 'ビニロンはポリビニルアルコール（PVA）をホルムアルデヒドで部分ホルマール化した別物質です。アセタール環と残存OHをもち、水に不溶です。PVAとは別に収録し、固定の分子式ではなくホルマール化度に依存する可変組成として表示します。' },
    { title: 'PubChem CIDの扱い', detail: '既存収録分のCIDは分子式・構造の照合に使ったものを記載しています。追加収録分には、CIDを確認していない物質を推測で記載していません。CIDがない物質は教科書出典と構造検証の結果を台帳に示します。' },
    { title: '合成ゴム・熱硬化性樹脂・導電性高分子', detail: 'NBR・IIR・不飽和ポリエステル・アルキド樹脂・ポリアセチレン・ポリアニリンを追加しました。共重合比・架橋度・ドープ状態で組成が変わるため、固定の分子式では表さず「組成依存」と表示します。' },
    { title: '収録カバレッジの確認', detail: 'COVERAGE のチェックリストで、アルカン・アルケン・アルキン・環状・芳香族・アルコール・エーテル・アルデヒド・ケトン・カルボン酸・エステル・油脂・セッケン・糖類・アミノ酸・核酸・単量体・合成高分子・天然高分子の各項目を確認します。件数だけでは網羅を主張しません。' },
    { title: '外部公開資料との照合', detail: '実教出版・啓林館・Try IT・大学化学・日本化学会『化学と教育』などの公開資料に掲載された名称を、外部照合台帳（external-coverage.js）に記録しました。資料に掲載されていることは標準的に暗記する範囲であることを意味しないため、各行に標準・発展・探究のラベルを付けています。照合は名称から収録ID・別名・材料索引・無機対象外への対応を確認するもので、外部説明の文章は転載していません。' },
    { title: '別名・材料索引', detail: '「1-ペンタノール」「酢酸Na」「塩化メチレン」「クロロホルム」「四塩化炭素」「p-フェニルアゾフェノール」などの別名を検索できるようにしました。レーヨン・セロファン・キュプラはセルロースの材料名、ビスコースは混合物、アニリンブラックはポリアニリンを主成分とする混合物として扱い、同じ分子を別化合物として水増ししていません。' },
    { title: '発展・探究で追加した化合物', detail: 'ヘプタン〜デカン・エイコサン、核酸塩基、染料、医薬品、タンパク質・酵素などを追加しました。これらは標準カバレッジとは別の外部照合台帳で管理し、標準項目と混同しません。タンパク質・酵素はアミノ酸配列と重合度で組成が変わるため、固定の分子式を主張せず模式図で表示します。' }
  ];

  return {
    CATEGORIES: CATEGORIES,
    GROUPS: GROUPS,
    SKELETONS: SKELETONS,
    COMPOUNDS: COMPOUNDS,
    COMBOS: COMBOS,
    SOURCES: SOURCES,
    LEDGER_NOTES: LEDGER_NOTES,
    COVERAGE: COVERAGE,
    COVERAGE_META: COVERAGE_META,
    COVERAGE_STATS: COVERAGE_STATS,
    REQUIRED_CURRICULUM: REQUIRED_CURRICULUM,
    ALIASES: ALIASES,
    MATERIALS: MATERIALS,
    normalizeName: normalizeName,
    aliasTarget: aliasTarget,
    aliasesFor: aliasesFor,
    materialsFor: materialsFor,
    materialByTerm: materialByTerm,
    searchTermsFor: searchTermsFor,
    UNSUPPORTED_REASONS: UNSUPPORTED_REASONS,
    unsupportedReason: unsupportedReason,
    unsupportedEntry: unsupportedEntry,
    skeletonById: skeletonById,
    compoundById: compoundById,
    categoryById: categoryById,
    groupById: groupById
  };
});
