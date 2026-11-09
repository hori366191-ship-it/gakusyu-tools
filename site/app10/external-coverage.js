/*
 * 有機化学ビルダー — 外部公開資料との照合台帳
 *
 * 目的: 「収録データの一覧」ではなく、外部資料に掲載された名称から出発して
 *       収録漏れを検出する。各行は 9 列（名称・種別・対応先・資料・節・取得日・
 *       短い根拠・ラベル・備考）をもち、外部説明の文章は転載しない。
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
      url: 'https://www.jikkyo.co.jp/web_ni_link/science2/jmol/cellobiose.html',
      title: '実教出版 Web理科教材「セロビオース」',
      section: 'セロビオースの構造',
      domain: 'www.jikkyo.co.jp', retrieved: RETRIEVED, level: '発展'
    },
    s2: {
      url: 'https://www.shinko-keirin.co.jp/keirinkan/tea/kou/jissen/kagaku/201306/index.html',
      title: '啓林館 高校理科実験「有機化合物の性質」',
      section: '有機化合物の性質を調べる実験',
      domain: 'www.shinko-keirin.co.jp', retrieved: RETRIEVED, level: '探究'
    },
    s3: {
      url: 'https://kimika.net/iy2arukan.html',
      title: 'kimika.net アルカン一問一答',
      section: 'アルカンと塩素化メタン',
      domain: 'kimika.net', retrieved: RETRIEVED, level: '標準'
    },
    s4: {
      url: 'https://fromhimuka.com/chemistry/429.html',
      title: 'FromHimuka 飽和炭化水素',
      section: 'アルカンとハロゲン化物',
      domain: 'fromhimuka.com', retrieved: RETRIEVED, level: '標準'
    },
    s5: {
      url: 'https://www.try-it.jp/chapters-9788/sections-9894/lessons-9945/point-2/',
      title: 'Try IT 酸無水物',
      section: '酢酸と無水酢酸',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '標準'
    },
    s6: {
      url: 'https://www.try-it.jp/chapters-9788/sections-9987/lessons-10077/',
      title: 'Try IT アゾカップリング',
      section: 'ジアゾニウム塩とフェノールのカップリング',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '発展'
    },
    s7: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10233/point-2/',
      title: 'Try IT DNAの構造',
      section: '核酸と塩基',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '標準'
    },
    s8: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10156/point-2/',
      title: 'Try IT セルロースの性質',
      section: 'セルロースと加水分解',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '標準'
    },
    s9: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10191/',
      title: 'Try IT ニンヒドリン反応',
      section: 'アミノ酸の検出',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '標準'
    },
    s10: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/',
      title: 'Try IT 銅アンモニアレーヨン',
      section: 'セルロースの加工',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '発展'
    },
    s11: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/point-2/',
      title: 'Try IT ビスコースレーヨン',
      section: 'ビスコース法',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '発展'
    },
    s12: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10240/lessons-10267/',
      title: 'Try IT 陽イオン交換樹脂',
      section: '陽イオン交換樹脂の構造',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '発展'
    },
    s13: {
      url: 'https://www.try-it.jp/chapters-10095/sections-10240/lessons-10267/point-2/',
      title: 'Try IT 陰イオン交換樹脂',
      section: '陰イオン交換樹脂の構造',
      domain: 'www.try-it.jp', retrieved: RETRIEVED, level: '発展'
    },
    s14: {
      url: 'https://examist.jp/chemistry/natural-polymer/protein/',
      title: 'examist タンパク質の分類',
      section: '単純・複合・誘導タンパク質',
      domain: 'examist.jp', retrieved: RETRIEVED, level: '発展'
    },
    s15: {
      url: 'https://ch.yorikuwa.com/c6417/',
      title: 'yorikuwa タンパク質',
      section: 'タンパク質の種類',
      domain: 'ch.yorikuwa.com', retrieved: RETRIEVED, level: '発展'
    },
    s16: {
      url: 'https://kagakulab.com/protein',
      title: '化学ラボ タンパク質',
      section: 'タンパク質の分類と代表例',
      domain: 'kagakulab.com', retrieved: RETRIEVED, level: '発展'
    },
    s17: {
      url: 'https://daigaku-kagaku.com/2024/06/06/what-you-need-to-know-to-make-structural-decisions/',
      title: '大学化学 構造決定',
      section: '糖類・酸無水物の構造決定',
      domain: 'daigaku-kagaku.com', retrieved: RETRIEVED, level: '発展'
    },
    s18: {
      url: 'https://www.jstage.jst.go.jp/article/kakyoshi/68/6/68_258/_pdf',
      title: '日本化学会「高校化学における芳香族化合物の合成実験」',
      section: '化学と教育 68巻6号 pp.258-261',
      domain: 'www.jstage.jst.go.jp', retrieved: RETRIEVED, level: '探究'
    },
    s19: {
      url: 'https://www.jstage.jst.go.jp/article/kakyoshi/68/10/68_416/_pdf',
      title: '日本化学会「高校化学における染料と染色」',
      section: '化学と教育 68巻10号 pp.416-419',
      domain: 'www.jstage.jst.go.jp', retrieved: RETRIEVED, level: '探究'
    },
    s20: {
      url: 'https://students.csj.jp/wp-content/uploads/2021/09/ky68-376-newkoza.pdf',
      title: '日本化学会「高分子らしさを体感する実験」',
      section: '化学と教育 68巻9号 pp.376-379',
      domain: 'students.csj.jp', retrieved: RETRIEVED, level: '探究'
    },
    s21: {
      url: 'https://www.cst.nihon-u.ac.jp/research/gakujutu/67/pdf/A-3.pdf',
      title: '日本大学 高校教員実践「解熱鎮痛剤」',
      section: '令和5年度 理科教育研究発表会 A-3',
      domain: 'www.cst.nihon-u.ac.jp', retrieved: RETRIEVED, level: '探究'
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
    r('β-グルコース', 'alias', 'glucose', 's1', 'セロビオースの構造', 'セロビオースの構成糖としてβ-D-グルコースが示される。', '発展'),

    /* S2 啓林館 実験 */
    r('エタノール', 'alias', 'ethanol', 's2', '有機化合物の性質', '実験試料としてエタノールが扱われる。', '探究'),
    r('酢酸', 'alias', 'acetic-acid', 's2', '有機化合物の性質', '実験試料として酢酸が扱われる。', '探究'),
    r('酢酸エチル', 'alias', 'ethyl-acetate', 's2', '有機化合物の性質', 'エステル化の生成物として酢酸エチルが扱われる。', '探究'),
    r('1-ペンタノール', 'alias', 'pentan-1-ol', 's2', '有機化合物の性質', 'C5アルコールの例として1-ペンタノールが扱われる。', '探究', '既存のpentan-1-olの別名'),
    r('酢酸ナトリウム', 'compound', 'sodium-acetate', 's2', '有機化合物の性質', '酢酸のナトリウム塩として扱われる。', '探究'),
    r('ヨードホルム', 'compound', 'iodoform', 's2', '有機化合物の性質', 'ヨードホルム反応の生成物として扱われる。', '探究'),

    /* S3 kimika.net */
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
    r('酢酸Na', 'alias', 'sodium-acetate', 's3', 'アルカンと塩素化メタン', '塩の表記として酢酸Naが用いられる。', '標準', '別名の正規化対象'),
    r('クロロメタン', 'alias', 'chloromethane', 's3', 'アルカンと塩素化メタン', '塩素化メタンのC1として扱われる。'),
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
    r('塩化ベンゼンジアゾニウム', 'alias', 'benzenediazonium-chloride', 's6', 'ジアゾニウム塩とフェノールのカップリング', 'アニリンのジアゾ化で生じるジアゾニウム塩として扱われる。'),
    r('ナトリウムフェノキシド', 'compound', 'sodium-phenoxide', 's6', 'ジアゾニウム塩とフェノールのカップリング', 'フェノールのナトリウム塩としてカップリングに用いられる。'),
    r('p-ヒドロキシアゾベンゼン', 'compound', 'p-hydroxyazobenzene', 's6', 'ジアゾニウム塩とフェノールのカップリング', 'カップリング生成物として扱われる。', '発展', 'p-フェニルアゾフェノールとも呼ぶ'),

    /* S7 DNA */
    r('DNA', 'compound', 'dna', 's7', '核酸と塩基', '二本鎖のデオキシリボ核酸として扱われる。'),
    r('RNA', 'compound', 'rna', 's7', '核酸と塩基', '一本鎖のリボ核酸として扱われる。'),
    r('リボース', 'alias', 'ribose', 's7', '核酸と塩基', 'RNAの構成糖として扱われる。'),
    r('デオキシリボース', 'alias', 'deoxyribose', 's7', '核酸と塩基', 'DNAの構成糖として扱われる。'),
    r('アデニン', 'compound', 'adenine', 's7', '核酸と塩基', 'DNA・RNAのプリン塩基として扱われる。'),
    r('グアニン', 'compound', 'guanine', 's7', '核酸と塩基', 'DNA・RNAのプリン塩基として扱われる。'),
    r('シトシン', 'compound', 'cytosine', 's7', '核酸と塩基', 'DNA・RNAのピリミジン塩基として扱われる。'),
    r('チミン', 'compound', 'thymine', 's7', '核酸と塩基', 'DNAのピリミジン塩基として扱われる。'),
    r('ウラシル', 'compound', 'uracil', 's7', '核酸と塩基', 'RNAのピリミジン塩基として扱われる。'),

    /* S8 セルロース */
    r('セルロース', 'alias', 'cellulose', 's8', 'セルロースと加水分解', 'β-グルコースがβ-1,4結合した多糖として扱われる。'),
    r('セロビオース', 'compound', 'cellobiose', 's8', 'セルロースと加水分解', 'セルロースの加水分解で生じる二糖として扱われる。'),
    r('グルコース', 'alias', 'glucose', 's8', 'セルロースと加水分解', 'セルロースの構成糖として扱われる。'),
    r('セルラーゼ', 'compound', 'cellulase', 's8', 'セルロースと加水分解', 'セルロースを分解する酵素として扱われる。'),
    r('セロビアーゼ', 'compound', 'cellobiase', 's8', 'セルロースと加水分解', 'セロビオースをグルコースに分解する酵素として扱われる。'),

    /* S9 ニンヒドリン */
    r('ニンヒドリン', 'compound', 'ninhydrin', 's9', 'アミノ酸の検出', 'アミノ酸の検出試薬として扱われる。'),
    r('アミノ酸', 'class', 'amino', 's9', 'アミノ酸の検出', 'アミノ酸という総称。個別の標準20アミノ酸は別途収録している。', '標準', '総称のため単一化合物にしない'),

    /* S10 銅アンモニアレーヨン */
    r('セルロース', 'alias', 'cellulose', 's10', 'セルロースの加工', '再生繊維の原料となるセルロースとして扱われる。', '発展'),
    r('レーヨン', 'material', 'rayon', 's10', 'セルロースの加工', 'セルロースを再生した繊維。分子はセルロースと同じ。', '発展'),
    r('セロファン', 'material', 'cellophane', 's10', 'セルロースの加工', 'セルロースを再生したフィルム。分子はセルロースと同じ。', '発展'),
    r('クプラ', 'material', 'cupra', 's10', 'セルロースの加工', '銅アンモニア法による再生繊維（キュプラ）。', '発展'),
    r('シュヴァイツァー試薬', 'inorganic', null, 's10', 'セルロースの加工', '銅アンモニア溶液である無機試薬。有機化合物ではないため対象外。', '発展', '無機化合物として除外'),

    /* S11 ビスコース */
    r('ビスコースレーヨン', 'material', 'rayon', 's11', 'ビスコース法', 'ビスコース法で作る再生繊維。分子はセルロースと同じ。', '発展'),
    r('ビスコース', 'mixture', 'viscose', 's11', 'ビスコース法', 'セルロースを二硫化炭素と水酸化ナトリウムで処理した溶液で、混合物。', '発展'),
    r('セルロース', 'alias', 'cellulose', 's11', 'ビスコース法', 'ビスコースの原料となるセルロースとして扱われる。', '発展'),
    r('二硫化炭素', 'inorganic', null, 's11', 'ビスコース法', 'CS₂で表される無機化合物。有機化合物ではないため対象外。', '発展', '無機化合物として除外'),

    /* S12 陽イオン交換樹脂 */
    r('スチレン', 'alias', 'styrene', 's12', '陽イオン交換樹脂の構造', '交換樹脂の骨格を作る単量体として扱われる。', '発展'),
    r('p-ジビニルベンゼン', 'compound', 'p-divinylbenzene', 's12', '陽イオン交換樹脂の構造', '架橋剤として共重合させる単量体として扱われる。', '発展'),
    r('陽イオン交換樹脂', 'compound', 'cation-exchange-resin', 's12', '陽イオン交換樹脂の構造', 'スルホン酸基をもつ架橋ポリスチレン系樹脂として扱われる。', '発展'),

    /* S13 陰イオン交換樹脂 */
    r('陰イオン交換樹脂', 'compound', 'anion-exchange-resin', 's13', '陰イオン交換樹脂の構造', '四級アンモニウム基をもつ架橋ポリスチレン系樹脂として扱われる。', '発展'),

    /* S14 タンパク質の分類 */
    r('インスリン', 'compound', 'insulin', 's14', '単純・複合・誘導タンパク質', 'ペプチドホルモンの例として扱われる。', '発展'),
    r('ヘモグロビン', 'compound', 'hemoglobin', 's14', '単純・複合・誘導タンパク質', '鉄を含む複合タンパク質の例として扱われる。', '発展'),
    r('ヘム', 'compound', 'heme', 's14', '単純・複合・誘導タンパク質', 'ヘモグロビンの補欠分子族（ヘムb）として扱われる。', '発展', 'Fe錯体。組成はヘムbで固定'),
    r('アルブミン', 'compound', 'albumin', 's14', '単純・複合・誘導タンパク質', '水溶性の単純タンパク質の例として扱われる。', '発展'),
    r('グロブリン', 'compound', 'globulin', 's14', '単純・複合・誘導タンパク質', '塩溶性の単純タンパク質の例として扱われる。', '発展'),
    r('グルテリン', 'compound', 'glutelin', 's14', '単純・複合・誘導タンパク質', '植物性の貯蔵タンパク質の例として扱われる。', '発展'),
    r('ケラチン', 'compound', 'keratin', 's14', '単純・複合・誘導タンパク質', '線維状タンパク質の例として扱われる。', '発展'),
    r('コラーゲン', 'compound', 'collagen', 's14', '単純・複合・誘導タンパク質', '結合組織の線維状タンパク質として扱われる。', '発展'),
    r('フィブロイン', 'compound', 'fibroin', 's14', '単純・複合・誘導タンパク質', '絹の主成分として扱われる。', '発展'),
    r('ムチン', 'compound', 'mucin', 's14', '単純・複合・誘導タンパク質', '粘液に含まれる糖タンパク質として扱われる。', '発展'),
    r('カゼイン', 'compound', 'casein', 's14', '単純・複合・誘導タンパク質', '乳汁に含まれるリンタンパク質として扱われる。', '発展'),
    r('ニンヒドリン', 'compound', 'ninhydrin', 's14', '単純・複合・誘導タンパク質', 'タンパク質・アミノ酸の検出試薬として扱われる。', '発展'),

    /* S15 yorikuwa */
    r('アルブミン', 'compound', 'albumin', 's15', 'タンパク質の種類', '水溶性タンパク質として扱われる。', '発展'),
    r('グロブリン', 'compound', 'globulin', 's15', 'タンパク質の種類', '塩溶性タンパク質として扱われる。', '発展'),
    r('ケラチン', 'compound', 'keratin', 's15', 'タンパク質の種類', '毛髪・爪などの線維状タンパク質として扱われる。', '発展'),
    r('コラーゲン', 'compound', 'collagen', 's15', 'タンパク質の種類', '皮膚・骨などの線維状タンパク質として扱われる。', '発展'),
    r('フィブロイン', 'compound', 'fibroin', 's15', 'タンパク質の種類', '絹の主成分として扱われる。', '発展'),
    r('グルテリン', 'compound', 'glutelin', 's15', 'タンパク質の種類', '植物種子の貯蔵タンパク質として扱われる。', '発展'),
    r('アミラーゼ', 'compound', 'amylase', 's15', 'タンパク質の種類', 'デンプン分解酵素として扱われる。', '発展'),
    r('カゼイン', 'compound', 'casein', 's15', 'タンパク質の種類', '乳汁の主タンパク質として扱われる。', '発展'),
    r('ヘモグロビン', 'compound', 'hemoglobin', 's15', 'タンパク質の種類', '酸素運搬タンパク質として扱われる。', '発展'),

    /* S16 化学ラボ */
    r('アルブミン', 'compound', 'albumin', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例として扱われる。', '発展'),
    r('グロブリン', 'compound', 'globulin', 's16', 'タンパク質の分類と代表例', '単純タンパク質の例として扱われる。', '発展'),
    r('ケラチン', 'compound', 'keratin', 's16', 'タンパク質の分類と代表例', '線維状タンパク質の例として扱われる。', '発展'),
    r('コラーゲン', 'compound', 'collagen', 's16', 'タンパク質の分類と代表例', '線維状タンパク質の例として扱われる。', '発展'),
    r('フィブロイン', 'compound', 'fibroin', 's16', 'タンパク質の分類と代表例', '線維状タンパク質の例として扱われる。', '発展'),
    r('グルテリン', 'compound', 'glutelin', 's16', 'タンパク質の分類と代表例', '植物性タンパク質の例として扱われる。', '発展'),
    r('アミラーゼ', 'compound', 'amylase', 's16', 'タンパク質の分類と代表例', '酵素タンパク質の例として扱われる。', '発展'),
    r('カゼイン', 'compound', 'casein', 's16', 'タンパク質の分類と代表例', 'リンタンパク質の例として扱われる。', '発展'),
    r('ヘモグロビン', 'compound', 'hemoglobin', 's16', 'タンパク質の分類と代表例', '複合タンパク質の例として扱われる。', '発展'),
    r('ゼラチン', 'compound', 'gelatin', 's16', 'タンパク質の分類と代表例', 'コラーゲンの誘導タンパク質として扱われる。', '発展'),
    r('ペプシン', 'compound', 'pepsin', 's16', 'タンパク質の分類と代表例', '胃液のタンパク質分解酵素として扱われる。', '発展'),
    r('ヒストン', 'compound', 'histone', 's16', 'タンパク質の分類と代表例', '塩基性タンパク質の例として扱われる。', '発展'),
    r('プロタミン', 'compound', 'protamine', 's16', 'タンパク質の分類と代表例', '塩基性タンパク質の例として扱われる。', '発展'),
    r('グルテニン', 'compound', 'glutenin', 's16', 'タンパク質の分類と代表例', '小麦の貯蔵タンパク質として扱われる。', '発展'),
    r('オリゼニン', 'compound', 'oryzenin', 's16', 'タンパク質の分類と代表例', '米の貯蔵タンパク質として扱われる。', '発展'),
    r('グリアジン', 'compound', 'gliadin', 's16', 'タンパク質の分類と代表例', '小麦のプロラミンとして扱われる。', '発展'),
    r('ホルデイン', 'compound', 'hordein', 's16', 'タンパク質の分類と代表例', '大麦のプロラミンとして扱われる。', '発展'),
    r('グロビン', 'compound', 'globin', 's16', 'タンパク質の分類と代表例', 'ヘモグロビンのタンパク質部分として扱われる。', '発展'),
    r('サルミン', 'compound', 'salmine', 's16', 'タンパク質の分類と代表例', 'サケのプロタミンとして扱われる。', '発展'),
    r('ヘモシアニン', 'compound', 'hemocyanin', 's16', 'タンパク質の分類と代表例', '銅含有の酸素運搬タンパク質として扱われる。', '発展'),

    /* S17 構造決定 */
    r('グルコース', 'alias', 'glucose', 's17', '糖類・酸無水物の構造決定', '単糖の構造決定で扱われる。', '発展'),
    r('ガラクトース', 'alias', 'galactose', 's17', '糖類・酸無水物の構造決定', '単糖の構造決定で扱われる。', '発展'),
    r('フルクトース', 'alias', 'fructose', 's17', '糖類・酸無水物の構造決定', '単糖の構造決定で扱われる。', '発展'),
    r('マルトース', 'alias', 'maltose', 's17', '糖類・酸無水物の構造決定', '二糖の構造決定で扱われる。', '発展'),
    r('セロビオース', 'compound', 'cellobiose', 's17', '糖類・酸無水物の構造決定', 'β-1,4結合の二糖として扱われる。', '発展'),
    r('ラクトース', 'alias', 'lactose', 's17', '糖類・酸無水物の構造決定', '二糖の構造決定で扱われる。', '発展'),
    r('スクロース', 'alias', 'sucrose', 's17', '糖類・酸無水物の構造決定', '二糖の構造決定で扱われる。', '発展'),
    r('トレハロース', 'compound', 'trehalose', 's17', '糖類・酸無水物の構造決定', 'α,α-1,1結合の二糖として扱われる。', '発展'),
    r('無水マレイン酸', 'compound', 'maleic-anhydride', 's17', '糖類・酸無水物の構造決定', '環状酸無水物として扱われる。', '発展'),
    r('無水フタル酸', 'compound', 'phthalic-anhydride', 's17', '糖類・酸無水物の構造決定', 'フタル酸の酸無水物として扱われる。', '発展'),

    /* S18 芳香族合成 */
    r('ベンゼンスルホン酸ナトリウム', 'compound', 'sodium-benzenesulfonate', 's18', '化学と教育 68巻6号', 'ベンゼンのスルホン化と中和で得る塩として扱われる。', '探究'),
    r('無水酢酸', 'compound', 'acetic-anhydride', 's18', '化学と教育 68巻6号', 'アセチル化剤として扱われる。', '探究'),
    r('ナトリウムフェノキシド', 'compound', 'sodium-phenoxide', 's18', '化学と教育 68巻6号', 'コルベ・シュミット反応の中間体として扱われる。', '探究'),
    r('p-ヒドロキシアゾベンゼン', 'compound', 'p-hydroxyazobenzene', 's18', '化学と教育 68巻6号', 'アゾカップリングの生成物として扱われる。', '探究'),

    /* S19 染料 */
    r('メチルオレンジ', 'alias', 'methyl-orange', 's19', '化学と教育 68巻10号', 'アゾ染料・pH指示薬として扱われる。', '探究'),
    r('2-ナフトール', 'alias', '2-naphthol', 's19', '化学と教育 68巻10号', 'ナフトール系カップリング成分として扱われる。', '探究'),
    r('レゾルシノール', 'alias', 'resorcinol', 's19', '化学と教育 68巻10号', 'ジヒドロキシベンゼンの異性体として扱われる。', '探究'),
    r('グアイアコール', 'compound', 'guaiacol', 's19', '化学と教育 68巻10号', '2-メトキシフェノールとして扱われる。', '探究'),
    r('N,N-ジメチルアニリン', 'compound', 'n,n-dimethylaniline', 's19', '化学と教育 68巻10号', 'アゾ染料のカップリング成分として扱われる。', '探究'),
    r('スルファニル酸', 'compound', 'sulfanilic-acid', 's19', '化学と教育 68巻10号', 'アゾ染料の中間体として扱われる。', '探究'),
    r('ポリアニリン', 'alias', 'polyaniline', 's19', '化学と教育 68巻10号', '導電性高分子として扱われる。', '探究'),
    r('アニリンブラック', 'material', 'aniline-black', 's19', '化学と教育 68巻10号', 'アニリン酸化重合で得られる黒色混合物。ポリアニリンと同一の純物質とはみなさない。', '探究'),
    r('インジゴ', 'compound', 'indigo', 's19', '化学と教育 68巻10号', '藍の主色素として扱われる。', '探究'),
    r('アリザリン', 'compound', 'alizarin', 's19', '化学と教育 68巻10号', 'アカネの色素として扱われる。', '探究'),
    r('シコニン', 'compound', 'shikonin', 's19', '化学と教育 68巻10号', 'ムラサキの色素として扱われる。', '探究'),
    r('カルミン酸', 'compound', 'carminic-acid', 's19', '化学と教育 68巻10号', 'コチニールの色素として扱われる。', '探究'),
    r('ジブロモインジゴ', 'compound', 'dibromoindigo', 's19', '化学と教育 68巻10号', '貝紫の色素として扱われる。', '探究'),
    r('カルタミン', 'compound', 'carthamin', 's19', '化学と教育 68巻10号', 'ベニバナの赤色色素として扱われる。', '探究'),
    r('2-ニトロベンズアルデヒド', 'compound', '2-nitrobenzaldehyde', 's19', '化学と教育 68巻10号', '染料合成の中間体として扱われる。', '探究'),
    r('ケルセチン', 'compound', 'quercetin', 's19', '化学と教育 68巻10号', 'フラボノイド色素として扱われる。', '探究'),

    /* S20 高分子 */
    r('アルギン酸', 'compound', 'alginic-acid', 's20', '化学と教育 68巻9号', '褐藻の多糖として扱われる。', '探究'),
    r('アルギン酸ナトリウム', 'compound', 'sodium-alginate', 's20', '化学と教育 68巻9号', 'アルギン酸のナトリウム塩として扱われる。', '探究'),
    r('アジピン酸ジクロリド', 'compound', 'adipoyl-chloride', 's20', '化学と教育 68巻9号', 'ナイロン-6,6の原料として扱われる。', '探究'),
    r('6-アミノヘキサン酸', 'compound', '6-aminohexanoic-acid', 's20', '化学と教育 68巻9号', 'ナイロン-6の原料として扱われる。', '探究'),

    /* S21 解熱鎮痛剤 */
    r('アスピリン', 'alias', 'aspirin', 's21', '令和5年度 理科教育研究発表会 A-3', 'アセチルサリチル酸として扱われる。', '探究'),
    r('サリチル酸メチル', 'alias', 'methyl-salicylate', 's21', '令和5年度 理科教育研究発表会 A-3', 'サリチル酸のメチルエステルとして扱われる。', '探究'),
    r('アセトアミノフェン', 'compound', 'acetaminophen', 's21', '令和5年度 理科教育研究発表会 A-3', '解熱鎮痛薬として扱われる。', '探究'),
    r('イブプロフェン', 'compound', 'ibuprofen', 's21', '令和5年度 理科教育研究発表会 A-3', '非ステロイド性抗炎症薬として扱われる。', '探究'),
    r('スルファニルアミド', 'compound', 'sulfanilamide', 's21', '令和5年度 理科教育研究発表会 A-3', 'サルファ薬の基本骨格として扱われる。', '探究'),
    r('p-ヒドロキシ安息香酸', 'compound', 'p-hydroxybenzoic-acid', 's21', '令和5年度 理科教育研究発表会 A-3', 'パラベンの原料として扱われる。', '探究'),
    r('m-ヒドロキシ安息香酸', 'compound', 'm-hydroxybenzoic-acid', 's21', '令和5年度 理科教育研究発表会 A-3', 'ヒドロキシ安息香酸の異性体として扱われる。', '探究'),
    r('2,4,6-トリブロモフェノール', 'compound', '2,4,6-tribromophenol', 's21', '令和5年度 理科教育研究発表会 A-3', 'フェノールの臭素化で得られる化合物として扱われる。', '探究')
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
      if (!/^https?:\/\//.test(s.url || '')) missing.push({ source: sid, reason: 'URLが不正' });
      if (!s.title || !s.section || !s.domain || !s.retrieved) missing.push({ source: sid, reason: '資料メタデータ不足' });
      if (LEVELS.indexOf(s.level) === -1 || bySource[sid] == null) missing.push({ source: sid, reason: '資料のラベルまたは行がない' });
      try {
        var host = new URL(s.url).hostname;
        if (host !== s.domain) missing.push({ source: sid, reason: 'domain不一致: ' + host + ' != ' + s.domain });
      } catch (e) { missing.push({ source: sid, reason: 'URLを解析できない' }); }
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
