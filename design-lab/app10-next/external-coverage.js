/*
 * 有機化学ビルダー — 外部公開資料との照合台帳
 *
 * 目的: 「収録データの一覧」ではなく、外部資料に掲載された名称から出発して
 *       収録漏れを検出する。各行は 9 列（名称・種別・対応先・資料・節・取得日・
 *       短い根拠・ラベル・備考）をもち、外部説明の文章は転載しない。
 *       教材出典ページのURLは配信せず、source ID（s1〜s22）と資料名で示す。
 *
 * 種別:
 *   compound  … COMPOUNDS に収録した化合物
 *   alias     … 既存化合物の別名（検索で引ける）
 *   material  … セルロース等の材料名（同一分子を水増ししない）
 *   mixture   … 単一化合物でない混合物
 *   inorganic … 高校有機化学の対象外とした無機化合物
 *   class     … アミノ酸のような総称（個別化合物は別途収録）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OCExternal = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RETRIEVED = '2026-11-09';

  var SOURCES = {
    s1: {
      title: '実教出版 Web理科教材「セロビオース」',
      section: 'セロビオースの構造',
retrieved: RETRIEVED, level: '発展'
    },
    s2: {
      title: '啓林館 授業実践記録（化学）「エステルの合成・分解とヨードホルム反応」',
      section: 'エステルの合成・分解とヨードホルム反応',
retrieved: RETRIEVED, level: '探究'
    },
    s3: {
      title: '化学のグルメ アルカン一問一答',
      section: 'アルカンと塩素化メタン',
retrieved: RETRIEVED, level: '標準'
    },
    s4: {
      title: 'FromHimuka 飽和炭化水素',
      section: 'アルカンとハロゲン化物',
retrieved: RETRIEVED, level: '標準'
    },
    s5: {
      title: 'Try IT 酸無水物',
      section: '酢酸と無水酢酸',
retrieved: RETRIEVED, level: '標準'
    },
    s6: {
      title: 'Try IT アゾカップリング',
      section: 'ジアゾニウム塩とフェノールのカップリング',
retrieved: RETRIEVED, level: '発展'
    },
    s7: {
      title: 'Try IT DNAの構造',
      section: '核酸と塩基',
retrieved: RETRIEVED, level: '標準'
    },
    s8: {
      title: 'Try IT セルロースの性質',
      section: 'セルロースと加水分解',
retrieved: RETRIEVED, level: '標準'
    },
    s9: {
      title: 'Try IT ニンヒドリン反応',
      section: 'アミノ酸の検出',
retrieved: RETRIEVED, level: '標準'
    },
    s10: {
      title: 'Try IT 銅アンモニアレーヨン',
      section: 'セルロースの加工',
retrieved: RETRIEVED, level: '発展'
    },
    s11: {
      title: 'Try IT ビスコースレーヨン',
      section: 'ビスコース法',
retrieved: RETRIEVED, level: '発展'
    },
    s12: {
      title: 'Try IT 陽イオン交換樹脂',
      section: '陽イオン交換樹脂の構造',
retrieved: RETRIEVED, level: '発展'
    },
    s13: {
      title: 'Try IT 陰イオン交換樹脂',
      section: '陰イオン交換樹脂の構造',
retrieved: RETRIEVED, level: '発展'
    },
    s14: {
      title: 'examist タンパク質の分類',
      section: '単純・複合・誘導タンパク質',
retrieved: RETRIEVED, level: '発展'
    },
    s15: {
      title: 'yorikuwa タンパク質',
      section: 'タンパク質の種類',
retrieved: RETRIEVED, level: '発展'
    },
    s16: {
      title: '高校化学ラボ タンパク質',
      section: 'タンパク質の分類と代表例',
retrieved: RETRIEVED, level: '発展'
    },
    s17: {
      title: '大学化学 構造決定',
      section: '糖類・酸無水物の構造決定',
retrieved: RETRIEVED, level: '発展'
    },
    s18: {
      title: '日本化学会「高校化学における芳香族化合物の合成実験」',
      section: '化学と教育 68巻6号 pp.258-261',
retrieved: RETRIEVED, level: '探究'
    },
    s19: {
      title: '日本化学会「高校化学における染料と染色」',
      section: '化学と教育 68巻10号 pp.416-419',
retrieved: RETRIEVED, level: '探究'
    },
    s20: {
      title: '日本化学会「高分子らしさを体感する実験」',
      section: '化学と教育 68巻9号 pp.376-379',
retrieved: RETRIEVED, level: '探究'
    },
    s21: {
      title: '日本大学理工学部 学術講演会予稿集「解熱鎮痛剤として利用される芳香族化合物の性質を知る事後探求型実験」',
      section: '令和5年度 日本大学理工学部 学術講演会予稿集 A-3',
retrieved: RETRIEVED, level: '探究'
    }
  };

  function r(name, kind, ref, source, section, evidence, level, note) {
    return {
      name: name,
      kind: kind,
      ref: ref,
      source: source,
      section: section,
      date: RETRIEVED,
      evidence: evidence,
      level: level || SOURCES[source].level,
      note: note || ''
    };
  }

  var ROWS = [
    /* S1 実教出版 */
    r('セロビオース', 'compound', 'cellobiose', 's1', 'セロビオースの構造', 'β-グルコース2分子がβ-1,4結合した二糖として扱う。', '発展'),
    r('β-グルコース', 'alias', 'glucose', 's1', 'セロビオースの構造', 'セロビオースの構成糖としてβ-グルコースが示される。', '発展'),

    /* S2 啓林館 実験 */
    r('エタノール', 'alias', 'ethanol', 's2', 'エステルの合成・分解とヨードホルム反応', '実験試料としてエタノールが扱われる。', '探究'),
    r('酢酸', 'alias', 'acetic-acid', 's2', 'エステルの合成・分解とヨードホルム反応', '実験試料として酢酸が扱われる。', '探究'),
    r('酢酸エチル', 'alias', 'ethyl-acetate', 's2', 'エステルの合成・分解とヨードホルム反応', 'エステル化の生成物として酢酸エチルが扱われる。', '探究'),
    r('1-ペンタノール', 'alias', 'pentan-1-ol', 's2', 'エステルの合成・分解とヨードホルム反応', '酢酸とのエステル合成の例として1-ペンタノールが扱われる。', '探究', '既存のpentan-1-olの別名'),
    r('酢酸ナトリウム', 'compound', 'sodium-acetate', 's2', 'エステルの合成・分解とヨードホルム反応', 'けん化で酢酸ナトリウムが生じると説明される。', '探究'),
    r('ヨードホルム', 'compound', 'iodoform', 's2', 'エステルの合成・分解とヨードホルム反応', 'ヨードホルム反応の実験で扱われる。', '探究'),

    /* S3 化学のグルメ */
    r('メタン', 'alias', 'methane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC1として扱われる。'),
    r('エタン', 'alias', 'ethane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC2として扱われる。'),
    r('プロパン', 'alias', 'propane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC3として扱われる。'),
    r('ブタン', 'alias', 'butane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC4として扱われる。'),
    r('ペンタン', 'alias', 'pentane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC5として扱われる。'),
    r('ヘキサン', 'alias', 'hexane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC6として扱われる。'),
    r('ヘプタン', 'alias', 'heptane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC7として扱われる。'),
    r('オクタン', 'alias', 'octane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC8として扱われる。'),
    r('ノナン', 'alias', 'nonane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC9として扱われる。'),
    r('デカン', 'alias', 'decane', 's3', 'アルカンと塩素化メタン', 'アルカン一問一答のC10として扱われる。'),
    r('酢酸ナトリウム', 'compound', 'sodium-acetate', 's3', 'アルカンと塩素化メタン', 'メタンの実験室的製法で、酢酸ナトリウムCH3COONaとソーダ石灰の混合物を加熱すると説明される。', '標準', '資料本文の表記。酢酸Naは検索用の別名'),
    r('クロロメタン', 'alias', 'chloromethane', 's3', 'アルカンと塩素化メタン', 'メタンの水素1個を塩素に置換した名称として扱われる。'),
    r('ジクロロメタン', 'compound', 'dichloromethane', 's3', 'アルカンと塩素化メタン', '塩化メチレンとも呼ばれる塩素化メタンとして扱われる。'),
    r('トリクロロメタン', 'alias', 'chloroform', 's3', 'アルカンと塩素化メタン', 'クロロホルムの別名として扱われる。', '標準', '別名の正規化対象'),
    r('テトラクロロメタン', 'alias', 'carbon-tetrachloride', 's3', 'アルカンと塩素化メタン', '四塩化炭素の別名として扱われる。', '標準', '別名の正規化対象'),

    /* S4 FromHimuka */
    r('メタン', 'alias', 'methane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC1として扱われる。'),
    r('エタン', 'alias', 'ethane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC2として扱われる。'),
    r('プロパン', 'alias', 'propane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC3として扱われる。'),
    r('ブタン', 'alias', 'butane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC4として扱われる。'),
    r('ペンタン', 'alias', 'pentane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC5として扱われる。'),
    r('ヘキサン', 'alias', 'hexane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC6として扱われる。'),
    r('ヘプタン', 'alias', 'heptane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC7として扱われる。'),
    r('オクタン', 'alias', 'octane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC8として扱われる。'),
    r('ノナン', 'alias', 'nonane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC9として扱われる。'),
    r('デカン', 'alias', 'decane', 's4', 'アルカンとハロゲン化物', '飽和炭化水素のC10として扱われる。'),
    r('エイコサン', 'compound', 'eicosane', 's4', 'アルカンとハロゲン化物', '長鎖アルカンの例としてC20のエイコサンが扱われる。'),
    r('クロロメタン', 'alias', 'chloromethane', 's4', 'アルカンとハロゲン化物', '塩素化メタンの1種として扱われる。'),
    r('ジクロロメタン', 'compound', 'dichloromethane', 's4', 'アルカンとハロゲン化物', '塩素化メタンの1種として扱われる。'),
    r('トリクロロメタン', 'alias', 'chloroform', 's4', 'アルカンとハロゲン化物', '塩素化メタンの1種として扱われる。'),
    r('テトラクロロメタン', 'alias', 'carbon-tetrachloride', 's4', 'アルカンとハロゲン化物', '塩素化メタンの1種として扱われる。'),

    /* S5 酸無水物 */
    r('酢酸', 'alias', 'acetic-acid', 's5', '酢酸と無水酢酸', '酸無水物の原料となる酢酸として扱われる。'),
    r('無水酢酸', 'compound', 'acetic-anhydride', 's5', '酢酸と無水酢酸', '酢酸2分子の脱水で生じる酸無水物として扱われる。'),

    /* S6 アゾカップリング */
    r('塩化ベンゼンジアゾニウム', 'alias', 'benzenediazonium-chloride', 's6', 'ジアゾニウム塩とフェノールのカップリング', 'アニリンに亜硝酸ナトリウムと塩酸を作用させて得る塩として扱われる。'),
    r('ナトリウムフェノキシド', 'compound', 'sodium-phenoxide', 's6', 'ジアゾニウム塩とフェノールのカップリング', 'カップリングの相手としてナトリウムフェノキシドが扱われる。'),
    r('p-ヒドロキシアゾベンゼン', 'compound', 'p-hydroxyazobenzene', 's6', 'ジアゾニウム塩とフェノールのカップリング', 'カップリング生成物として扱われる。', '発展', 'p-フェニルアゾフェノールとも呼ぶ'),

    /* S7 DNA */
    r('DNA', 'compound', 'dna', 's7', '核酸と塩基', '核酸の一種としてDNAが扱われる。'),
    r('RNA', 'compound', 'rna', 's7', '核酸と塩基', '核酸の一種としてRNAが扱われる。'),
    r('リボース', 'alias', 'ribose', 's7', '核酸と塩基', 'RNAを構成する糖としてリボースが示される。'),
    r('デオキシリボース', 'alias', 'deoxyribose', 's7', '核酸と塩基', 'DNAを構成する糖としてデオキシリボースが示される。'),
    r('アデニン', 'compound', 'adenine', 's7', '核酸と塩基', 'DNA・RNAを構成する塩基としてアデニンが示される。'),
    r('グアニン', 'compound', 'guanine', 's7', '核酸と塩基', 'DNA・RNAを構成する塩基としてグアニンが示される。'),
    r('シトシン', 'compound', 'cytosine', 's7', '核酸と塩基', 'DNA・RNAを構成する塩基としてシトシンが示される。'),
    r('チミン', 'compound', 'thymine', 's7', '核酸と塩基', 'DNAを構成する塩基としてチミンが示される。'),
    r('ウラシル', 'compound', 'uracil', 's7', '核酸と塩基', 'RNAを構成する塩基としてウラシルが示される。'),

    /* S8 セルロース */
    r('セルロース', 'alias', 'cellulose', 's8', 'セルロースと加水分解', '多数のβ-グルコースが結合した多糖として扱われる。'),
    r('セロビオース', 'compound', 'cellobiose', 's8', 'セルロースと加水分解', 'セルロースの加水分解で生じる二糖として扱われる。'),
    r('グルコース', 'alias', 'glucose', 's8', 'セルロースと加水分解', 'セルロースの構成糖として扱われる。'),
    r('セルラーゼ', 'compound', 'cellulase', 's8', 'セルロースと加水分解', 'セルロースを分解する酵素として扱われる。'),
    r('セロビアーゼ', 'compound', 'cellobiase', 's8', 'セルロースと加水分解', 'セロビオースをグルコースに分解する酵素として扱われる。'),

    /* S9 ニンヒドリン */
    r('ニンヒドリン', 'compound', 'ninhydrin', 's9', 'アミノ酸の検出', 'アミノ酸の検出試薬として扱われる。'),
    r('アミノ酸', 'class', 'amino', 's9', 'アミノ酸の検出', 'アミノ酸という総称。個別の標準20アミノ酸は別途収録している。', '標準', '総称のため単一化合物にしない'),

    /* S10 銅アンモニアレーヨン */
    r('セルロース', 'alias', 'cellulose', 's10', 'セルロースの加工', '再生繊維の原料となるセルロースとして扱われる。', '発展'),
    r('レーヨン', 'material', 'rayon', 's10', 'セルロースの加工', 'セルロースを溶かして再生した繊維として説明される。', '発展', '分子はセルロースと同じ（化学的補足）'),
    r('セロハン', 'material', 'cellophane', 's10', 'セルロースの加工', '再生繊維の例としてセロハンが挙げられている。', '発展', '資料本文の表記。セロファンとも書く'),
    r('キュプラ', 'material', 'cupra', 's10', 'セルロースの加工', '銅アンモニアレーヨンはキュプラとも呼ばれると説明される。', '発展', '資料本文の表記。クプラも検索可能'),
    r('シュワイツァー試薬', 'inorganic', null, 's10', 'セルロースの加工', '水酸化銅(II)をアンモニア水に溶かした液体として説明される。有機化合物ではないため対象外。', '発展', '無機化合物として除外。資料本文の表記。シュヴァイツァーとも書く'),

    /* S11 ビスコース */
    r('ビスコースレーヨン', 'material', 'rayon', 's11', 'ビスコース法', 'ビスコース法で作る再生繊維として説明される。', '発展', '分子はセルロースと同じ（化学的補足）'),
    r('ビスコース', 'mixture', 'viscose', 's11', 'ビスコース法', 'セルロース・濃水酸化ナトリウム水溶液・二硫化炭素の混合物として説明される。', '発展', '単一化合物ではない混合物（化学的補足）'),
    r('セルロース', 'alias', 'cellulose', 's11', 'ビスコース法', 'ビスコースの原料となるセルロースとして扱われる。', '発展'),
    r('二硫化炭素', 'inorganic', null, 's11', 'ビスコース法', 'ビスコースの材料として二硫化炭素が示される。無機化合物のため対象外。', '発展', '無機化合物として除外。CS₂で表される（化学的補足）'),

    /* S12 陽イオン交換樹脂 */
    r('スチレン', 'alias', 'styrene', 's12', '陽イオン交換樹脂の構造', '陽イオン交換樹脂の共重合体を構成する物質として扱われる。', '発展'),
    r('p-ジビニルベンゼン', 'compound', 'p-divinylbenzene', 's12', '陽イオン交換樹脂の構造', '陽イオン交換樹脂の共重合体を構成する物質として扱われる。', '発展'),
    r('陽イオン交換樹脂', 'compound', 'cation-exchange-resin', 's12', '陽イオン交換樹脂の構造', 'スチレンとp-ジビニルベンゼンの共重合体に酸性の官能基を導入したものと説明される。', '発展'),

    /* S13 陰イオン交換樹脂 */
    r('陰イオン交換樹脂', 'compound', 'anion-exchange-resin', 's13', '陰イオン交換樹脂の構造', '中心のNにメチル基などがついた官能基をもつ樹脂として説明される。', '発展'),

    /* S14 タンパク質の分類 */
    r('インスリン', 'compound', 'insulin', 's14', '単純・複合・誘導タンパク質', '血糖値を下げるホルモンとして扱われる。', '発展'),
    r('ヘモグロビン', 'compound', 'hemoglobin', 's14', '単純・複合・誘導タンパク質', 'ヘムとタンパク質が結合した色素タンパク質として扱われる。', '発展'),
    r('ヘム', 'compound', 'heme', 's14', '単純・複合・誘導タンパク質', 'ヘモグロビンに含まれる色素（ヘム）として扱われる。', '発展', 'Fe錯体。組成はヘムbで固定'),
    r('アルブミン', 'compound', 'albumin', 's14', '単純・複合・誘導タンパク質', '単純タンパク質の分類表にアルブミンが示される。', '発展'),
    r('グロブリン', 'compound', 'globulin', 's14', '単純・複合・誘導タンパク質', '単純タンパク質の分類表にグロブリンが示される。', '発展'),
    r('グルテリン', 'compound', 'glutelin', 's14', '単純・複合・誘導タンパク質', '単純タンパク質の分類表にグルテリンが示される。', '発展'),
    r('ケラチン', 'compound', 'keratin', 's14', '単純・複合・誘導タンパク質', '線維状タンパク質の例として扱われる。', '発展'),
    r('コラーゲン', 'compound', 'collagen', 's14', '単純・複合・誘導タンパク質', 'タンパク質の分類表にコラーゲンが示される。', '発展'),
    r('フィブロイン', 'compound', 'fibroin', 's14', '単純・複合・誘導タンパク質', 'タンパク質の分類表にフィブロインが示される。', '発展'),
    r('ムチン', 'compound', 'mucin', 's14', '単純・複合・誘導タンパク質', 'タンパク質の分類表にムチンが示される。', '発展'),
    r('カゼイン', 'compound', 'casein', 's14', '単純・複合・誘導タンパク質', 'タンパク質の分類表にカゼインが示される。', '発展'),
    r('ニンヒドリン', 'compound', 'ninhydrin', 's14', '単純・複合・誘導タンパク質', 'タンパク質・アミノ酸の検出試薬として扱われる。', '発展'),

    /* S15 yorikuwa */
    r('アルブミン', 'compound', 'albumin', 's15', 'タンパク質の種類', 'タンパク質の分類例にアルブミンが挙げられる。', '発展'),
    r('グロブリン', 'compound', 'globulin', 's15', 'タンパク質の種類', 'タンパク質の分類例にグロブリンが挙げられる。', '発展'),
    r('ケラチン', 'compound', 'keratin', 's15', 'タンパク質の種類', '線維状タンパク質の例としてケラチンが挙げられる。', '発展'),
    r('コラーゲン', 'compound', 'collagen', 's15', 'タンパク質の種類', '線維状タンパク質の例としてコラーゲンが挙げられる。', '発展'),
    r('フィブロイン', 'compound', 'fibroin', 's15', 'タンパク質の種類', '線維状タンパク質の例としてフィブロインが挙げられる。', '発展'),
    r('グルテリン', 'compound', 'glutelin', 's15', 'タンパク質の種類', '単純タンパク質の例としてグルテリンが挙げられる。', '発展'),
    r('アミラーゼ', 'compound', 'amylase', 's15', 'タンパク質の種類', '単純タンパク質の例としてアミラーゼが挙げられる。', '発展'),
    r('カゼイン', 'compound', 'casein', 's15', 'タンパク質の種類', '複合タンパク質の例としてカゼインが挙げられる。', '発展'),
    r('ヘモグロビン', 'compound', 'hemoglobin', 's15', 'タンパク質の種類', '複合タンパク質の例としてヘモグロビンが挙げられる。', '発展'),

    /* S16 化学ラボ */
    r('アルブミン', 'compound', 'albumin', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例として扱われる。', '発展'),
    r('グロブリン', 'compound', 'globulin', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例として扱われる。', '発展'),
    r('ケラチン', 'compound', 'keratin', 's16', 'タンパク質の分類と代表例', '線維状タンパク質の例として扱われる。', '発展'),
    r('コラーゲン', 'compound', 'collagen', 's16', 'タンパク質の分類と代表例', '線維状タンパク質の例として扱われる。', '発展'),
    r('フィブロイン', 'compound', 'fibroin', 's16', 'タンパク質の分類と代表例', '線維状タンパク質の例として扱われる。', '発展'),
    r('グルテリン', 'compound', 'glutelin', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例としてグルテリンが挙げられる。', '発展'),
    r('カゼイン', 'compound', 'casein', 's16', 'タンパク質の分類と代表例', 'リンタンパク質の例として扱われる。', '発展'),
    r('ヘモグロビン', 'compound', 'hemoglobin', 's16', 'タンパク質の分類と代表例', '複合タンパク質の例として扱われる。', '発展'),
    r('ゼラチン', 'compound', 'gelatin', 's16', 'タンパク質の分類と代表例', 'コラーゲンを水と煮るとゼラチンが生じると説明される。', '発展'),
    r('ペプシン', 'compound', 'pepsin', 's16', 'タンパク質の分類と代表例', '胃液に含まれる酵素としてペプシンが扱われる。', '発展'),
    r('ヒストン', 'compound', 'histone', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例としてヒストンが挙げられる。', '発展'),
    r('プロタミン', 'compound', 'protamine', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例としてプロタミンが挙げられる。', '発展'),
    r('グルテニン', 'compound', 'glutenin', 's16', 'タンパク質の分類と代表例', '小麦に含まれるタンパク質としてグルテニンが示される。', '発展'),
    r('オリゼニン', 'compound', 'oryzenin', 's16', 'タンパク質の分類と代表例', '米に含まれるタンパク質としてオリゼニンが示される。', '発展'),
    r('グリアジン', 'compound', 'gliadin', 's16', 'タンパク質の分類と代表例', '小麦のプロラミンとして扱われる。', '発展'),
    r('ホルジニン', 'compound', 'hordein', 's16', 'タンパク質の分類と代表例', '大麦のプロラミンとして説明される。', '発展', '資料本文の表記。ホルデインとも書く'),
    r('グロビン', 'compound', 'globin', 's16', 'タンパク質の分類と代表例', 'ヘモグロビンのタンパク質部分として扱われる。', '発展'),
    r('サルミン', 'compound', 'salmine', 's16', 'タンパク質の分類と代表例', 'サケのプロタミンとして扱われる。', '発展'),
    r('ヘモシアニン', 'compound', 'hemocyanin', 's16', 'タンパク質の分類と代表例', '色素タンパク質の例としてヘモシアニンが挙げられる。', '発展'),

    /* S17 構造決定 */
    r('グルコース', 'alias', 'glucose', 's17', '糖類・酸無水物の構造決定', '単糖の例としてグルコースが挙げられている。', '発展'),
    r('ガラクトース', 'alias', 'galactose', 's17', '糖類・酸無水物の構造決定', '単糖の例としてガラクトースが挙げられている。', '発展'),
    r('フルクトース', 'alias', 'fructose', 's17', '糖類・酸無水物の構造決定', '単糖の例としてフルクトースが挙げられている。', '発展'),
    r('マルトース', 'alias', 'maltose', 's17', '糖類・酸無水物の構造決定', '還元性を示す二糖の例としてマルトースが挙げられている。', '発展'),
    r('セロビオース', 'compound', 'cellobiose', 's17', '糖類・酸無水物の構造決定', '還元性を示す二糖の例としてセロビオースが挙げられている。', '発展'),
    r('ラクトース', 'alias', 'lactose', 's17', '糖類・酸無水物の構造決定', '還元性を示す二糖の例としてラクトースが挙げられている。', '発展'),
    r('スクロース', 'alias', 'sucrose', 's17', '糖類・酸無水物の構造決定', 'フェーリング液を還元しない二糖の例としてスクロースが挙げられている。', '発展'),
    r('トレハロース', 'compound', 'trehalose', 's17', '糖類・酸無水物の構造決定', 'フェーリング液を還元しない二糖の例としてトレハロースが挙げられている。', '発展'),
    r('無水マレイン酸', 'compound', 'maleic-anhydride', 's17', '糖類・酸無水物の構造決定', '酸無水物の例として無水マレイン酸が挙げられている。', '発展'),
    r('無水フタル酸', 'compound', 'phthalic-anhydride', 's17', '糖類・酸無水物の構造決定', '酸無水物の例として無水フタル酸が挙げられている。', '発展'),

    /* S18 芳香族合成 */
    r('ベンゼンスルホン酸ナトリウム', 'compound', 'sodium-benzenesulfonate', 's18', '化学と教育 68巻6号', 'ベンゼンのスルホン化で生じ、飽和食塩水を加えると析出すると説明される。', '探究'),
    r('無水酢酸', 'compound', 'acetic-anhydride', 's18', '化学と教育 68巻6号', 'アセチルサリチル酸の合成に用いられる試薬として扱われる。', '探究'),
    r('ナトリウムフェノキシド', 'compound', 'sodium-phenoxide', 's18', '化学と教育 68巻6号', 'カップリング実験の課題で、ナトリウムフェノキシドの合成経路を考えさせる記載がある。', '探究'),
    r('p-ヒドロキシアゾベンゼン', 'compound', 'p-hydroxyazobenzene', 's18', '化学と教育 68巻6号', 'アゾカップリングの生成物として扱われる。', '探究'),

    /* S19 染料 */
    r('メチルオレンジ', 'alias', 'methyl-orange', 's19', '化学と教育 68巻10号', 'アゾ染料の一つとして合成され、酸塩基指示薬に使用できると説明される。', '探究'),
    r('2-ナフトール', 'alias', '2-naphthol', 's19', '化学と教育 68巻10号', 'ジアゾカップリングの相手物質として使用可能と説明される。', '探究'),
    r('レゾルシノール', 'alias', 'resorcinol', 's19', '化学と教育 68巻10号', 'ジアゾカップリングの相手物質として使用可能と説明される。', '探究'),
    r('グアヤコール', 'compound', 'guaiacol', 's19', '化学と教育 68巻10号', 'ジアゾカップリングの相手物質として使用可能と説明される。', '探究', '資料本文の表記。グアイアコールとも書く'),
    r('ジメチルアニリン', 'compound', 'n,n-dimethylaniline', 's19', '化学と教育 68巻10号', 'メチルオレンジの合成で、ジメチルアニリンを氷酢酸に溶かす試薬として扱われる。', '探究', '資料本文の表記。N,N-ジメチルアニリンとも書く'),
    r('スルファニル酸', 'compound', 'sulfanilic-acid', 's19', '化学と教育 68巻10号', 'メチルオレンジの合成原料として扱われる。', '探究'),
        r('アニリンブラック', 'material', 'aniline-black', 's19', '化学と教育 68巻10号', '硫酸酸性下で二クロム酸カリウムをアニリン塩酸塩に加えて酸化すると、黒色のアニリンブラックが生じると説明される。', '探究', 'ポリアニリン（導電性高分子）と同一の純物質とは断定しない'),
    r('インジゴ', 'compound', 'indigo', 's19', '化学と教育 68巻10号', '藍の主成分である色素として説明される。', '探究'),
    r('アリザリン', 'compound', 'alizarin', 's19', '化学と教育 68巻10号', 'アカネの根から得られる色素として説明される。', '探究'),
    r('シコニン', 'compound', 'shikonin', 's19', '化学と教育 68巻10号', 'ムラサキの根から得られる色素として説明される。', '探究'),
    r('カルミン酸', 'compound', 'carminic-acid', 's19', '化学と教育 68巻10号', 'コチニール虫から得られる色素として説明される。', '探究'),
    r('ジブロモインジゴ', 'compound', 'dibromoindigo', 's19', '化学と教育 68巻10号', 'アクキガイなどの貝の分泌腺から得られる色素として説明される。', '探究'),
    r('カルタミン', 'compound', 'carthamin', 's19', '化学と教育 68巻10号', 'ベニバナから得られる赤色色素として説明される。', '探究'),
    r('2-ニトロベンズアルデヒド', 'compound', '2-nitrobenzaldehyde', 's19', '化学と教育 68巻10号', 'インジゴ合成の直前物質として扱われる。', '探究'),
    r('クェルセチン', 'compound', 'quercetin', 's19', '化学と教育 68巻10号', 'タマネギの外皮の主成分としてクェルセチンが示される。', '探究', '資料本文の表記。ケルセチンとも書く'),

    /* S20 高分子 */
    r('アルギン酸', 'compound', 'alginic-acid', 's20', '化学と教育 68巻9号', '海藻に含まれる多糖として扱われる。', '探究'),
    r('アルギン酸ナトリウム', 'compound', 'sodium-alginate', 's20', '化学と教育 68巻9号', 'アルギン酸ゲルの合成に用いる試薬として扱われる。', '探究'),
    r('アジピン酸ジクロリド', 'compound', 'adipoyl-chloride', 's20', '化学と教育 68巻9号', 'ナイロン-6,6の原料として扱われる。', '探究'),
    r('6-アミノヘキサン酸', 'compound', '6-aminohexanoic-acid', 's20', '化学と教育 68巻9号', 'ナイロン-6の原料として扱われる。', '探究'),

    /* S21 解熱鎮痛剤 */
    r('アスピリン', 'alias', 'aspirin', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', 'アセチルサリチル酸として扱われる。', '探究'),
    r('サリチル酸メチル', 'alias', 'methyl-salicylate', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', '消炎鎮痛剤として扱われる。', '探究'),
    r('アセトアミノフェン', 'compound', 'acetaminophen', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', '解熱鎮痛薬として扱われる。', '探究'),
    r('イブプロフェン', 'compound', 'ibuprofen', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', '解熱鎮痛剤として扱われる。', '探究'),
    r('スルファニルアミド', 'compound', 'sulfanilamide', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', 'サルファ剤として扱われる。', '探究'),
    r('p-ヒドロキシ安息香酸', 'compound', 'p-hydroxybenzoic-acid', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', '塩化鉄(III)水溶液を加えても呈色しないフェノール類の例として挙げられている。', '探究', '呈色反応の比較対象としての記載'),
    r('m-ヒドロキシ安息香酸', 'compound', 'm-hydroxybenzoic-acid', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', '塩化鉄(III)水溶液を加えても呈色しないフェノール類の例として挙げられている。', '探究', '呈色反応の比較対象としての記載'),
    r('2,4,6-トリブロモフェノール', 'compound', '2,4,6-tribromophenol', 's21', '令和5年度 日本大学理工学部 学術講演会予稿集 A-3', '塩化鉄(III)水溶液を加えても呈色しないフェノール類の例として挙げられている。', '探究', '呈色反応の比較対象としての記載')
  ];

  var KINDS = ['compound', 'alias', 'material', 'mixture', 'inorganic', 'class'];
  var LEVELS = ['標準', '発展', '探究'];

  function resolveRow(row, data) {
    data = data || (typeof window !== 'undefined' ? window.OCData : null);
    if (!data) return { ok: false, reason: 'OCData がない' };
    if (row.kind === 'compound') {
      return data.COMPOUNDS[row.ref] ? { ok: true, type: 'compound' } : { ok: false, reason: '未収録ID: ' + row.ref };
    }
    if (row.kind === 'alias') {
      var target = data.aliasTarget(row.name);
      if (target !== row.ref) return { ok: false, reason: '別名の対応先が不一致: ' + target + ' != ' + row.ref };
      return data.COMPOUNDS[row.ref] ? { ok: true, type: 'alias' } : { ok: false, reason: '別名の対応先が未収録: ' + row.ref };
    }
    if (row.kind === 'material' || row.kind === 'mixture') {
      var m = data.materialByTerm(row.name);
      if (!m || m.id !== row.ref) return { ok: false, reason: '材料索引が不一致: ' + (m && m.id) };
      return { ok: true, type: row.kind, of: m.of };
    }
    if (row.kind === 'inorganic') {
      return row.ref == null ? { ok: true, type: 'inorganic' } : { ok: false, reason: '無機扱いにIDがある' };
    }
    if (row.kind === 'class') {
      var cat = data.categoryById(row.ref);
      return cat ? { ok: true, type: 'class' } : { ok: false, reason: '総称の参照先がない: ' + row.ref };
    }
    return { ok: false, reason: '未知の種別: ' + row.kind };
  }

  function audit(data) {
    var missing = [];
    var byKind = {};
    var byLevel = {};
    var bySource = {};
    var names = {};
    ROWS.forEach(function (row, i) {
      var res = resolveRow(row, data);
      if (!res.ok) missing.push({ index: i, name: row.name, kind: row.kind, ref: row.ref, source: row.source, reason: res.reason });
      if (!SOURCES[row.source]) missing.push({ index: i, name: row.name, reason: '資料IDが不正: ' + row.source });
      if (!row.section) missing.push({ index: i, name: row.name, reason: '節がない' });
      if (!row.evidence || row.evidence.length < 8) missing.push({ index: i, name: row.name, reason: '根拠が短い' });
      if (LEVELS.indexOf(row.level) === -1) missing.push({ index: i, name: row.name, reason: 'ラベルが不正: ' + row.level });
      if (row.date !== RETRIEVED) missing.push({ index: i, name: row.name, reason: '取得日が不正' });
      byKind[row.kind] = (byKind[row.kind] || 0) + 1;
      byLevel[row.level] = (byLevel[row.level] || 0) + 1;
      bySource[row.source] = (bySource[row.source] || 0) + 1;
      names[data && data.normalizeName ? data.normalizeName(row.name) : row.name] = true;
    });
    Object.keys(SOURCES).forEach(function (sid) {
      var s = SOURCES[sid];
      if (!s.title || !s.section || !s.retrieved) missing.push({ source: sid, reason: '資料メタデータ不足' });
      if (LEVELS.indexOf(s.level) === -1 || bySource[sid] == null) missing.push({ source: sid, reason: '資料のラベルまたは行がない' });
    });
    return {
      rows: ROWS.length,
      uniqueNames: Object.keys(names).length,
      sources: Object.keys(SOURCES).length,
      missing: missing,
      byKind: byKind,
      byLevel: byLevel,
      bySource: bySource
    };
  }

  var STATS = {
    rows: ROWS.length,
    uniqueNames: (function () {
      var seen = {};
      ROWS.forEach(function (row) { seen[row.name] = true; });
      return Object.keys(seen).length;
    })(),
    sources: Object.keys(SOURCES).length,
    byKind: (function () {
      var out = {};
      ROWS.forEach(function (row) { out[row.kind] = (out[row.kind] || 0) + 1; });
      return out;
    })(),
    byLevel: (function () {
      var out = {};
      ROWS.forEach(function (row) { out[row.level] = (out[row.level] || 0) + 1; });
      return out;
    })()
  };

  return {
    RETRIEVED: RETRIEVED,
    SOURCES: SOURCES,
    ROWS: ROWS,
    KINDS: KINDS,
    LEVELS: LEVELS,
    STATS: STATS,
    resolveRow: resolveRow,
    audit: audit
  };
});
