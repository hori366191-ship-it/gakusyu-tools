/*
 * 有機化学ビルダー — 全章索引の名称対応・監査記録
 *
 * 65件の要判断事項を、化合物・材料/混合物・family/class・無機対象外へ明示的に対応づける。
 * 原文引用は短い根拠に限り、全文転載はしない。supplement は教材原文ではなく収録判断用の化学的補足。
 * 画像の全OCR・動画の視聴/文字起こしは未完了であり、完了とは主張しない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OCIndexAudit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DATA = {
    "RETRIEVED": "2026-11-09",
    "NOTE": "findings.json の65件を、化合物・材料/混合物・family/class・無機対象外のいずれかへ明示的に対応づけた監査記録。supplement は教材原文の引用ではなく、収録判断のための化学的補足である。",
    "SUMMARY": {
      "findings": 65,
      "byResolution": {
        "compound": 40,
        "family": 9,
        "material": 13,
        "variant": 2,
        "inorganic": 1
      },
      "byKind": {
        "small-molecule": 20,
        "enzyme-family": 9,
        "acetylide-salt": 2,
        "organic-salt": 5,
        "homolog-class": 4,
        "lipid-family": 4,
        "polymer-family": 1,
        "polymer-derivative": 4,
        "polymer-mixture": 2,
        "polymer-subtype": 1,
        "enzyme-mixture": 2,
        "enzyme-class": 1,
        "material": 3,
        "mixture": 1,
        "inorganic-reagent-mixture": 2,
        "class": 1,
        "organic-salt-reagent": 1,
        "inorganic-reagent": 1,
        "source-name-caution": 1
      },
      "registered": 64,
      "excludedInorganic": 1
    },
    "LIMITS": [
      "教材本文の全画像OCR・全動画の視聴/文字起こしは未完了であり、完了とは主張しない。",
      "65件は外部本文から抽出した要判断事項であり、高校化学の全物質を網羅する一覧ではない。",
      "引用は短い根拠に限り、教材本文の全文転載は行わない。",
      "脂肪酸の二重結合位置・幾何は教材の表だけでは未特定のため、公的な一般構造に基づいて補足し、その旨をsupplementに明記した。",
      "酵素・リン脂質・材料・混合物は単一の固定分子式をもたないため、模式図・family・materialとして区別し、純物質カードに偽装しない。"
    ],
    "FINDINGS": [
      {
        "term": "1,2-ジブロモエタン",
        "kind": "small-molecule",
        "identity": "BrCH2CH2Br",
        "proposedId": "1,2-dibromoethane",
        "existingIds": [],
        "ref": "1,2-dibromoethane",
        "resolution": "compound",
        "supplement": "臭素付加の生成物。エタンの一臭素置換（ブロモエタン）とは別構造。",
        "proposal": "臭素付加の生成物として炭化水素の反応経路へ集約。単なる一臭素置換とは区別。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9868/point-2/",
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9868/practice-3/",
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9876/question-2/"
        ],
        "quote": "と 臭素 を反応させます。 すると、 1,2-ジブロモエタン という物質ができます。 1,2-ジブロモエタンの構造を見てみると、エチレンに臭素が2つくっついていることがわかりますね。 「ジ」が「２」、「ブロモ」が「臭素」を表し"
      },
      {
        "term": "p-ジクロロベンゼン",
        "kind": "small-molecule",
        "identity": "p-C6H4Cl2",
        "proposedId": "p-dichlorobenzene",
        "existingIds": [],
        "ref": "p-dichlorobenzene",
        "resolution": "compound",
        "supplement": "芳香環のパラ二置換。クロロベンゼン（一置換）とは別構造。",
        "proposal": "芳香環の塩素置換数と位置の切替へ集約。chlorobenzeneとは別構造。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10000/point-2/"
        ],
        "quote": "ることもあります。 クロロベンゼンをハロゲン化するとp-ジクロロベンゼン 先ほどできたクロロベンゼンには、まだまだ水素が残っています。 ということは、 さらに置換反応を進める ことができそうですね。 すると、次のようになります"
      },
      {
        "term": "ATP",
        "kind": "small-molecule",
        "identity": "アデノシン三リン酸; 本文はATP表記のみ",
        "proposedId": "atp",
        "existingIds": [],
        "ref": "atp",
        "resolution": "compound",
        "supplement": "アデノシン三リン酸。アデニン—リボース—三リン酸のヌクレオチドで、生理的pHでは4価陰イオン。本文は酵素作用の対象としてATP表記のみ。",
        "proposal": "ヌクレオチドのリン酸数切替に集約。本文では酵素作用の対象として登場。",
        "urls": [
          "https://kimika.net/y2koso.html"
        ],
        "quote": "［腸液］ リパーゼ 油脂→高級脂肪酸+グリセリン［すい液］ ATPアーゼ ATPのリン酸結合を加水分解 ウレアーゼ 尿素→アンモニア+二酸化炭素 セルラーゼ セルロース→セロビオース （草食動物の腸内） セロビアーゼ セロビオース→グル"
      },
      {
        "term": "ATPアーゼ",
        "kind": "enzyme-family",
        "identity": "ATPのリン酸結合を加水分解する酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "atpase",
        "resolution": "compound",
        "supplement": "ATPのリン酸結合を加水分解する酵素の総称。種・配列は未指定で、単一の固定分子式にしない。",
        "proposal": "proteinの酵素例とヌクレオチド反応へ集約。",
        "urls": [
          "https://kimika.net/y2koso.html"
        ],
        "quote": "［腸液］ リパーゼ 油脂→高級脂肪酸+グリセリン［すい液］ ATPアーゼ ATPのリン酸結合を加水分解 ウレアーゼ 尿素→アンモニア+二酸化炭素 セルラーゼ セルロース→セロビオース （草食動物の腸内） セロビアーゼ セロビオース→グルコース"
      },
      {
        "term": "銀アセチリド",
        "kind": "acetylide-salt",
        "identity": "Ag2C2; 金属アセチリド",
        "proposedId": "silver-acetylide",
        "existingIds": [],
        "ref": "silver-acetylide",
        "resolution": "compound",
        "supplement": "Ag2C2の金属アセチリド。アセチレンの検出反応で生じる塩として扱い、有機単分子とは区別する。",
        "proposal": "アセチレンの検出反応生成物へ集約。塩として記録し有機単分子とは区別。",
        "urls": [
          "https://kimika.net/y1arukin.html"
        ],
        "quote": "溶液（[Ag(NH 3 ) 2 ] ＋ ）を加えることによる銀アセチリド白色沈殿の生成 ex2）アルキンにアンモニア性塩化銅(Ⅰ)水溶液（[Cu(NH 3 ) 4 ] ＋ ）を加えることによる銅(Ⅰ)アセチリド赤色沈殿の生成 アルキン（アセチ"
      },
      {
        "term": "銅(Ⅰ)アセチリド",
        "kind": "acetylide-salt",
        "identity": "Cu2C2; 金属アセチリド",
        "proposedId": "copper-i-acetylide",
        "existingIds": [],
        "ref": "copper-i-acetylide",
        "resolution": "compound",
        "supplement": "Cu2C2の金属アセチリド。塩として記録し、有機単分子とは区別する。",
        "proposal": "同上。教材記載の錯イオン式自体の正しさは本調査の証明対象外。",
        "urls": [
          "https://kimika.net/y1arukin.html"
        ],
        "quote": "溶液（[Cu(NH 3 ) 4 ] ＋ ）を加えることによる銅(Ⅰ)アセチリド赤色沈殿の生成 アルキン（アセチレン）の製法 アセチレンを実験室内でつくる際は、炭化カルシウムCaC 2 （カーバイド）に水H 2 Oを加える。 \\[ \\mathrm{C"
      },
      {
        "term": "ジブロモエチレン",
        "kind": "small-molecule",
        "identity": "BrCH=CHBr; E/Z本文未指定",
        "proposedId": "1,2-dibromoethene",
        "existingIds": [],
        "ref": "1,2-dibromoethene",
        "resolution": "compound",
        "supplement": "アセチレンへの臭素付加（1段階）の中間体。E/Zは教材本文で未指定。",
        "proposal": "アルキン臭素付加の中間体。alkene-c2|brの説明は多置換代表例を一律排除しない。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9883/"
        ],
        "quote": "チレン です。 アセチレンに臭素を付加させると、 1,2-ジブロモエチレン という物質ができます。 臭素原子が２つくっついていることがわかりますね。 そして、三重結合が二重結合になっていますね。 しかし、二重結合があるということは、 もう"
      },
      {
        "term": "1,1,2,2-テトラブロモエタン",
        "kind": "small-molecule",
        "identity": "CHBr2CHBr2",
        "proposedId": "1,1,2,2-tetrabromoethane",
        "existingIds": [],
        "ref": "1,1,2,2-tetrabromoethane",
        "resolution": "compound",
        "supplement": "アセチレンへの2段階臭素付加の最終生成物。",
        "proposal": "アルキンの二段階付加に集約。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9883/"
        ],
        "quote": "うになります。 最終的にできた物質は、 1,1,2,2-テトラブロモエタン というものです。 このようにアルキンは、アルケン同様、 付加反応しやすい 物質です。 さらに、アルキンの付加反応は ２段階で進む ということを押さえて"
      },
      {
        "term": "ヘキサクロロシクロヘキサン",
        "kind": "small-molecule",
        "identity": "C6H6Cl6; cyclo-(CHCl)6; 立体異性体未指定",
        "proposedId": "hexachlorocyclohexane",
        "existingIds": [],
        "ref": "hexachlorocyclohexane",
        "resolution": "compound",
        "supplement": "ベンゼンへの塩素付加で生じるC6H6Cl6の1,2,3,4,5,6-六置換体。α・β・γ等は立体異性体であり、本項は特定異性体を固定しない。代表例γ体（リンデン）があるがγ体そのものとは断定しない。",
        "proposal": "ベンゼン塩素付加の生成物。芳香環を維持するクロロベンゼンと混同しない。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10008/point-2/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10008/practice-3/",
          "https://kimika.net/benzen.html"
        ],
        "quote": "が促進されているわけです。 ベンゼンに塩素付加でヘキサクロロシクロヘキサン もう一つ、ベンゼンの付加反応を見てみましょう。 今回は、ベンゼンに 塩素 を付加させます。 やはり、炭素間の不飽和結合が開いて、そこに"
      },
      {
        "term": "クメンヒドロペルオキシド",
        "kind": "small-molecule",
        "identity": "C6H5C(CH3)2OOH",
        "proposedId": "cumene-hydroperoxide",
        "existingIds": [],
        "ref": "cumene-hydroperoxide",
        "resolution": "compound",
        "supplement": "クメン法の中間体。酸分解でフェノールとアセトンを与える。",
        "proposal": "クメン法の反応経路へ集約。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10027/point-2/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10027/practice-3/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10035/"
        ],
        "quote": "るイメージです。 それによってできるのが、 クメンヒドロペルオキシド という物質です。 最後に、このクメンヒドロペルオキシドを分解すると、右下のようになります。 ベンゼン環と「C」、「O」と「O」の結合が切れて、ダルマ落としのようにな"
      },
      {
        "term": "ナトリウムメトキシド",
        "kind": "organic-salt",
        "identity": "CH3O- Na+",
        "proposedId": "sodium-methoxide",
        "existingIds": [],
        "ref": "sodium-methoxide",
        "resolution": "compound",
        "supplement": "メタノールのO—HをNaで置換した塩。メタノールそのものではない。",
        "proposal": "メタノールのOH→ONaの塩化状態として集約。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10023/point-2/"
        ],
        "quote": "通点 に注目していきます。 メタノール＋ナトリウム⇒ナトリウムメトキシド まず、アルコールの性質を思い出しましょう。 メタノール と単体の ナトリウム を反応させると、次のようになります。 ヒドロキシ基の「"
      },
      {
        "term": "ナトリウムエトキシド",
        "kind": "organic-salt",
        "identity": "C2H5O- Na+",
        "proposedId": "sodium-ethoxide",
        "existingIds": [],
        "ref": "sodium-ethoxide",
        "resolution": "compound",
        "supplement": "エタノールのO—HをNaで置換した塩。エタノールそのものではない。",
        "proposal": "エタノールのOH→ONaの塩化状態として集約。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9894/lessons-9903/point-2/",
          "https://www.try-it.jp/chapters-9788/sections-9894/lessons-9903/practice-3/",
          "https://kimika.net/aru-ete.html"
        ],
        "quote": "の -OH が -ONa に変わっています。 このとき、 ナトリウムエトキシド という物質が発生することになります。 つまり、ナトリウムエトキシドは、ナトリウムアルコキシドの一種だと言えますね。 アルコールの反応としては、 ア"
      },
      {
        "term": "安息香酸ナトリウム",
        "kind": "organic-salt",
        "identity": "C6H5COO- Na+",
        "proposedId": "sodium-benzoate",
        "existingIds": [],
        "ref": "sodium-benzoate",
        "resolution": "compound",
        "supplement": "安息香酸のナトリウム塩。安息香酸本体とは別レコード。",
        "proposal": "benzoic-acidの塩状態として集約。benzoic-acid自体の既収録とは別判定。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10092/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10038/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10084/"
        ],
        "quote": "るイメージでしたね。 これで 安息香酸 を 安息香酸ナトリウム として分離できました。 エーテル層に残っているのは、ニトロベンゼンとフェノールです。 水酸化ナトリウム水溶液でフェノールを分離 最後に、 水酸化ナ"
      },
      {
        "term": "サリチル酸ナトリウム",
        "kind": "organic-salt",
        "identity": "o-HOC6H4COO- Na+",
        "proposedId": "sodium-salicylate",
        "existingIds": [],
        "ref": "sodium-salicylate",
        "resolution": "compound",
        "supplement": "サリチル酸のナトリウム塩。コルベ・シュミット反応の中間体。",
        "proposal": "salicylic-acidの塩状態・製法へ集約。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10046/point-2/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-10046/practice-3/",
          "https://kimika.net/houkokarubon.html"
        ],
        "quote": "製法 を見ていきましょう。 ナトリウムフェノキシド⇒サリチル酸ナトリウム 最初に用意するのは、 ナトリウムフェノキシド です。 これはフェノールの「H」が「Na」に置き換わった物質ですね。 これに対して、 高"
      },
      {
        "term": "テレフタル酸ジクロリド",
        "kind": "small-molecule",
        "identity": "p-ClCO-C6H4-COCl",
        "proposedId": "terephthaloyl-chloride",
        "existingIds": [],
        "ref": "terephthaloyl-chloride",
        "resolution": "compound",
        "supplement": "テレフタル酸の二酸塩化物。アラミドの単量体。アジピン酸ジクロリドとは別構造。",
        "proposal": "aramidの単量体として集約。adipoyl-chlorideは別構造で対応不可。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10245/point-2/"
        ],
        "quote": "物質を用意しました。 今回の単量体は、 テレフタル酸ジクロリド と p-フェニレンジアミン ですね。 ポイントは、どちらもベンゼン環をもつ 芳香族化合物 であることです。 この２つが重合すると、次のようになります。"
      },
      {
        "term": "アントラセン",
        "kind": "small-molecule",
        "identity": "C14H10; 直線状三環縮合芳香族",
        "proposedId": "anthracene",
        "existingIds": [],
        "ref": "anthracene",
        "resolution": "compound",
        "supplement": "三環縮合芳香族。ナフタレンやフェナントレンと同一視しない。",
        "proposal": "芳香族縮合環の選択へ集約。naphthaleneを同一物扱いしない。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-9992/point-2/",
          "https://www.try-it.jp/chapters-9788/sections-9987/lessons-9992/practice-3/",
          "https://kimika.net/benzen.html"
        ],
        "quote": "剤などに利用されています。 ベンゼンが３つくっついてアントラセン ３つ目は、左下の物質です。 こちらは、 ベンゼンが３つ 結合したような構造になっています。 この物質のことを、 アントラセン といいま"
      },
      {
        "term": "シクロヘキセン",
        "kind": "small-molecule",
        "identity": "C6H10; 六員環にC=C一本",
        "proposedId": "cyclohexene",
        "existingIds": [],
        "ref": "cyclohexene",
        "resolution": "compound",
        "supplement": "六員環にC=Cを1本もつ環状アルケン。シクロヘキサンとは別。",
        "proposal": "環状骨格の不飽和状態へ集約。cyclohexaneとは別。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9789/lessons-9794/point-2/"
        ],
        "quote": "す。 例としては、シクロヘキサンなどの シクロアルカン 、シクロヘキセンなどの シクロアルケン があげられます。 シクロアルカン の場合、炭素原子間の結合は すべて単結合 ですね。 この点は、アルカンと同じです。 しかし、"
      },
      {
        "term": "ペンテン",
        "kind": "homolog-class",
        "identity": "C5H10鎖式モノアルケン; 位置・分岐未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "pentene-class",
        "resolution": "family",
        "supplement": "C5H10鎖式モノアルケンの級名。位置・分岐は未指定で、ペンタ-1-エン/ペンタ-2-エンは代表例であり級名全体と同一ではない。",
        "proposal": "alkene-c4|ch3はC5アルケン代表への入口にできるが本文は1-ペンテンの特定証拠ではない。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9860/",
          "https://kimika.net/y1aruken.html"
        ],
        "quote": "⇒ プロペン ブタン ⇒ ブテン ペンタン ⇒ ペンテン ヘキサン ⇒ ヘキセン"
      },
      {
        "term": "ヘキセン",
        "kind": "homolog-class",
        "identity": "C6H12鎖式モノアルケン; 位置・分岐未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "hexene-class",
        "resolution": "family",
        "supplement": "C6H12鎖式モノアルケンの級名。位置・分岐は未指定。代表例を級名全体と同一視しない。",
        "proposal": "C6アルケン級の名称対応。全異性体収録を要請する証拠ではない。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9860/",
          "https://kimika.net/y1aruken.html"
        ],
        "quote": "⇒ ブテン ペンタン ⇒ ペンテン ヘキサン ⇒ ヘキセン"
      },
      {
        "term": "ペンチン",
        "kind": "homolog-class",
        "identity": "C5H8鎖式モノアルキン; 位置・分岐未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "pentyne-class",
        "resolution": "family",
        "supplement": "C5H8鎖式モノアルキンの級名。位置・分岐は未指定。ペンタ-1-イン/ペンタ-2-インは代表例。",
        "proposal": "alkyne-c4|ch3への級名対応は必要。特定位置異性体の証拠とは区別。",
        "urls": [
          "https://kimika.net/y1arukin.html"
        ],
        "quote": "レン 4 C 4 H 6 ブチン なし 5 C 5 H 8 ペンチン なし 6 C 6 H 10 ヘキシン なし アルカンの一般名は アルカン の語尾「〜アン（ane）」を「〜イン（yne）」にしたものである。 慣用名とはルールに基づかな"
      },
      {
        "term": "ヘキシン",
        "kind": "homolog-class",
        "identity": "C6H10鎖式モノアルキン; 位置・分岐未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "hexyne-class",
        "resolution": "family",
        "supplement": "C6H10鎖式モノアルキンの級名。位置・分岐は未指定。",
        "proposal": "C6アルキン級の名称対応。",
        "urls": [
          "https://kimika.net/y1arukin.html"
        ],
        "quote": "5 C 5 H 8 ペンチン なし 6 C 6 H 10 ヘキシン なし アルカンの一般名は アルカン の語尾「〜アン（ane）」を「〜イン（yne）」にしたものである。 慣用名とはルールに基づかない特殊な名称で、一般に暗記する必要があ"
      },
      {
        "term": "ジエチルケトン",
        "kind": "small-molecule",
        "identity": "CH3CH2COCH2CH3",
        "proposedId": "pentan-3-one",
        "existingIds": [],
        "ref": "pentan-3-one",
        "resolution": "compound",
        "supplement": "慣用名ジエチルケトン＝ペンタン-3-オン。ブタノンとは別構造。",
        "proposal": "ケトンの炭素骨格拡張へ集約。butanoneは別構造。",
        "urls": [
          "https://kimika.net/aru-keto.html"
        ],
        "quote": "の前に”ジ”をつける。 ①は両側にエチル基が付いているので「ジエチルケトン」、②は左側にエチル基、右側にメチル基が付いているので「エチルメチルケトン」になる。 「ジメチルケトン」だけは例外として「アセトン」という慣用名でよばれます。 ケトンの製"
      },
      {
        "term": "オルトニトロフェノール",
        "kind": "small-molecule",
        "identity": "o-HOC6H4NO2",
        "proposedId": "o-nitrophenol",
        "existingIds": [],
        "ref": "o-nitrophenol",
        "resolution": "compound",
        "supplement": "フェノールのオルト位ニトロ化体。ピクリン酸とは置換数が異なる。",
        "proposal": "フェノールのニトロ置換異性体に集約。picric-acidは別構造。",
        "urls": [
          "https://kimika.net/fenol.html"
        ],
        "quote": "フェノール が得られる。（-OHは電子供与性の官能基なので、オルトニトロフェノール・パラニトロフェノールが主生成物） これをさらに続けると 2.4.6-トリニトロフェノール （ ピクリン酸 ）の黄色沈殿が得られる。 ピクリン酸は水に溶けて弱酸性を示す。"
      },
      {
        "term": "パラニトロフェノール",
        "kind": "small-molecule",
        "identity": "p-HOC6H4NO2",
        "proposedId": "p-nitrophenol",
        "existingIds": [],
        "ref": "p-nitrophenol",
        "resolution": "compound",
        "supplement": "フェノールのパラ位ニトロ化体。オルト体とは位置異性体。",
        "proposal": "同上。",
        "urls": [
          "https://kimika.net/fenol.html"
        ],
        "quote": "（-OHは電子供与性の官能基なので、オルトニトロフェノール・パラニトロフェノールが主生成物） これをさらに続けると 2.4.6-トリニトロフェノール （ ピクリン酸 ）の黄色沈殿が得られる。 ピクリン酸は水に溶けて弱酸性を示す。 フェノールの反応④（"
      },
      {
        "term": "リンゴ酸",
        "kind": "small-molecule",
        "identity": "HOOCCH(OH)CH2COOH; 光学形未指定",
        "proposedId": "malic-acid",
        "existingIds": [],
        "ref": "malic-acid",
        "resolution": "compound",
        "supplement": "ヒドロキシジカルボン酸。光学形は教材本文で未指定。",
        "proposal": "ヒドロキシジカルボン酸の組合せへ集約。",
        "urls": [
          "https://kimika.net/karu-esu.html"
        ],
        "quote": "ン酸 安息香酸 フタル酸 テレフタル酸 ヒドロキシ酸 乳酸 リンゴ酸 カルボン酸は古来より知られていたものが多く、慣用名でよばれることが多い。上記のものはいずれも重要なカルボン酸なので名前と構造式を対応させて必ず覚えておこう。 鎖式炭化水"
      },
      {
        "term": "イソマルトース",
        "kind": "small-molecule",
        "identity": "2グルコースのα(1→6)二糖",
        "proposedId": "isomaltose",
        "existingIds": [],
        "ref": "isomaltose",
        "resolution": "compound",
        "supplement": "グルコース2分子のα(1→6)二糖。マルトースのα(1→4)とは結合位置が異なる。",
        "proposal": "糖の結合位置切替へ集約。maltoseのα(1→4)と別。",
        "urls": [
          "https://kimika.net/t3tantou.html",
          "https://kimika.net/y2nito.html"
        ],
        "quote": "単糖② 二糖 α-グルコース α-グルコース マルトース イソマルトース トレハロース β-グルコース β-グルコース セロビオース β-ガラクトース β-グルコース ラクトース α-グルコース β-フルクトース スクロース 二糖それぞれの詳"
      },
      {
        "term": "ラウリン酸",
        "kind": "small-molecule",
        "identity": "CH3(CH2)10COOH",
        "proposedId": "lauric-acid",
        "existingIds": [],
        "ref": "lauric-acid",
        "resolution": "compound",
        "supplement": "C12の飽和脂肪酸。ラウリン酸ナトリウム（塩）とは別レコード。",
        "proposal": "高級脂肪酸の鎖長切替へ。sodium-laurateはNa塩であり同一ではない。",
        "urls": [
          "https://kimika.net/y2fattyacid.html"
        ],
        "quote": "炭素数 名称 示性式 分子量 C=Cの数 融点（℃） 12 ラウリン酸 C 11 H 23 COOH 200 0 44 14 ミリスチン酸 C 13 H 27 COOH 228 0 54 16 パルミチン酸 C 15 H 31 COOH 2"
      },
      {
        "term": "ミリスチン酸",
        "kind": "small-molecule",
        "identity": "CH3(CH2)12COOH",
        "proposedId": "myristic-acid",
        "existingIds": [],
        "ref": "myristic-acid",
        "resolution": "compound",
        "supplement": "C14の飽和脂肪酸。",
        "proposal": "高級脂肪酸の鎖長切替へ。",
        "urls": [
          "https://kimika.net/y2fattyacid.html"
        ],
        "quote": "ン酸 C 11 H 23 COOH 200 0 44 14 ミリスチン酸 C 13 H 27 COOH 228 0 54 16 パルミチン酸 C 15 H 31 COOH 256 0 63 18 ステアリン酸 C 17 H 35 COOH 2"
      },
      {
        "term": "アラキドン酸",
        "kind": "small-molecule",
        "identity": "C20H32O2; 20:4; 本文の表だけでは二重結合位置と幾何は未特定",
        "proposedId": "arachidonic-acid",
        "existingIds": [],
        "ref": "arachidonic-acid",
        "resolution": "compound",
        "supplement": "20:4の高度不飽和脂肪酸。公的構造に基づき全シス-5,8,11,14位の二重結合として収録。教材の表だけでは位置・幾何を特定していないため、位置は別出典の一般構造に基づく。",
        "proposal": "脂肪酸鎖長・不飽和数に集約。位置・幾何は別出典確認が必要。",
        "urls": [
          "https://kimika.net/y2fattyacid.html"
        ],
        "quote": "酸 C 17 H 29 COOH 278 3 -11 20 アラキドン酸 C 19 H 31 COOH 304 4 -50 20 エイコサペンタエン酸 C 19 H 29 COOH 302 5 -54 22 ドコサヘキサエン酸 C 21 H"
      },
      {
        "term": "エイコサペンタエン酸",
        "kind": "small-molecule",
        "identity": "C20H30O2; 20:5; 本文の表だけでは二重結合位置と幾何は未特定",
        "proposedId": "eicosapentaenoic-acid",
        "existingIds": [],
        "ref": "eicosapentaenoic-acid",
        "resolution": "compound",
        "supplement": "20:5の高度不飽和脂肪酸。全シス-5,8,11,14,17位。",
        "proposal": "同上。",
        "urls": [
          "https://kimika.net/y2fattyacid.html"
        ],
        "quote": "酸 C 19 H 31 COOH 304 4 -50 20 エイコサペンタエン酸 C 19 H 29 COOH 302 5 -54 22 ドコサヘキサエン酸 C 21 H 31 COOH 328 6 -44 高級脂肪酸の融点 高級脂肪酸の融点について"
      },
      {
        "term": "ドコサヘキサエン酸",
        "kind": "small-molecule",
        "identity": "C22H32O2; 22:6; 本文の表だけでは二重結合位置と幾何は未特定",
        "proposedId": "docosahexaenoic-acid",
        "existingIds": [],
        "ref": "docosahexaenoic-acid",
        "resolution": "compound",
        "supplement": "22:6の高度不飽和脂肪酸。全シス-4,7,10,13,16,19位。",
        "proposal": "同上。",
        "urls": [
          "https://kimika.net/y2fattyacid.html"
        ],
        "quote": "酸 C 19 H 29 COOH 302 5 -54 22 ドコサヘキサエン酸 C 21 H 31 COOH 328 6 -44 高級脂肪酸の融点 高級脂肪酸の融点について解説する。 飽和脂肪酸の場合 飽和脂肪酸は 炭素数が増加するにつれて融点が上"
      },
      {
        "term": "ホスファチジルコリン",
        "kind": "lipid-family",
        "identity": "グリセロリン脂質PC; アシル鎖未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "phosphatidylcholine",
        "resolution": "family",
        "supplement": "グリセロリン脂質PC。アシル鎖未指定で単一分子式に固定しない。レシチンとも呼ぶ。",
        "proposal": "脂質の頭部基・脂肪酸組合せとして扱い単一分子カードに固定しない。",
        "urls": [
          "https://kimika.net/y2phospholipids.html"
        ],
        "quote": "}); リン脂質の構造 代表的なリン脂質の構造を次に示す。 ホスファチジルコリン（レシチン） ホスファチジル エタノールアミン ホスファチジル セリン ホスファチジル イノシトール リン脂質の性質 代表的なリン脂質の性質は次の通りである。 ●リン脂質"
      },
      {
        "term": "ホスファチジル エタノールアミン",
        "kind": "lipid-family",
        "identity": "グリセロリン脂質PE; アシル鎖未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "phosphatidylethanolamine",
        "resolution": "family",
        "supplement": "グリセロリン脂質PE。エタノールアミン単体の収録根拠ではない。",
        "proposal": "エタノールアミン単体の収録根拠ではない。",
        "urls": [
          "https://kimika.net/y2phospholipids.html"
        ],
        "quote": "ン脂質の構造を次に示す。 ホスファチジルコリン（レシチン） ホスファチジル エタノールアミン ホスファチジル セリン ホスファチジル イノシトール リン脂質の性質 代表的なリン脂質の性質は次の通りである。 ●リン脂質の性質 界面活性剤としてはたらく 脂質二重層/"
      },
      {
        "term": "ホスファチジル セリン",
        "kind": "lipid-family",
        "identity": "グリセロリン脂質PS; アシル鎖未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "phosphatidylserine",
        "resolution": "family",
        "supplement": "グリセロリン脂質PS。セリン単体の収録根拠ではない。",
        "proposal": "serine単体の既収録で本脂質を収録済にしない。",
        "urls": [
          "https://kimika.net/y2phospholipids.html"
        ],
        "quote": "チジルコリン（レシチン） ホスファチジル エタノールアミン ホスファチジル セリン ホスファチジル イノシトール リン脂質の性質 代表的なリン脂質の性質は次の通りである。 ●リン脂質の性質 界面活性剤としてはたらく 脂質二重層/生体膜を形成する ❶ 界"
      },
      {
        "term": "ホスファチジル イノシトール",
        "kind": "lipid-family",
        "identity": "グリセロリン脂質PI; アシル鎖未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "phosphatidylinositol",
        "resolution": "family",
        "supplement": "グリセロリン脂質PI。イノシトール単体の収録根拠ではない。",
        "proposal": "イノシトール単体の収録根拠ではない。",
        "urls": [
          "https://kimika.net/y2phospholipids.html"
        ],
        "quote": "ホスファチジル エタノールアミン ホスファチジル セリン ホスファチジル イノシトール リン脂質の性質 代表的なリン脂質の性質は次の通りである。 ●リン脂質の性質 界面活性剤としてはたらく 脂質二重層/生体膜を形成する ❶ 界面活性剤としてはたらく リン脂"
      },
      {
        "term": "リグニン",
        "kind": "polymer-family",
        "identity": "非一意な天然芳香族高分子",
        "proposedId": null,
        "existingIds": [],
        "ref": "lignin",
        "resolution": "material",
        "supplement": "木材パルプから除去される天然芳香族高分子。セルロースそのものではない。",
        "proposal": "セルロース原料処理の材料説明に集約。",
        "urls": [
          "https://kimika.net/y2rayon.html"
        ],
        "quote": "いて解説しています。 レーヨンとは 主に木材などから不純物のリグニンなどを取り除いて得られるセルロース（“パルプ”とよばれる）は、繊維としては非常に短く、そのまま衣料に用いることは困難である。 したがって、このセルロースに化学的な処理を施"
      },
      {
        "term": "セルロースキサントゲン酸ナトリウム",
        "kind": "polymer-derivative",
        "identity": "Cell-O-C(=S)S- Na+; 置換度未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "cellulose-xanthate",
        "resolution": "material",
        "supplement": "セルロースのキサントゲン酸エステル塩。置換度は一定でなく、ビスコース溶液とも区別する。",
        "proposal": "cellulose→viscoseの反応段階へ集約。viscose溶液自体と区別。",
        "urls": [
          "https://kimika.net/y2cellulosemelt.html",
          "https://kimika.net/y2rayon.html"
        ],
        "quote": "硫化炭素（CS 2 ）を加えると、黄〜黄赤色のゼリー状物質（セルロースキサントゲン酸ナトリウム）が得られる。 これを希NaOH水溶液に溶かすと、透明感のある赤褐色で粘性をもつコロイド溶液（ビスコース）となる（セルロースは溶けた！）。 【新課程対応】化学の計算ドリル"
      },
      {
        "term": "アルカリセルロース",
        "kind": "polymer-derivative",
        "identity": "セルロースのNaOH処理物; 単一構造に固定しない",
        "proposedId": null,
        "existingIds": [],
        "ref": "alkali-cellulose",
        "resolution": "material",
        "supplement": "セルロースの濃NaOH処理物。単一構造に固定しない。",
        "proposal": "celluloseの処理状態へ集約。",
        "urls": [
          "https://kimika.net/y2cellulosemelt.html",
          "https://kimika.net/y2rayon.html"
        ],
        "quote": "用いる方法 セルロースを濃NaOH水溶液に入れると、半透明のアルカリセルロースとなる。 これに適切な処理を施したのち、ニ硫化炭素（CS 2 ）を加えると、黄〜黄赤色のゼリー状物質（セルロースキサントゲン酸ナトリウム）が得られる。 これを希NaOH水"
      },
      {
        "term": "ジニトロセルロース",
        "kind": "polymer-derivative",
        "identity": "セルロース繰返し単位中OH二箇所の硝酸エステル化",
        "proposedId": null,
        "existingIds": [
          "cellulose-nitrate"
        ],
        "ref": "dinitrocellulose",
        "resolution": "variant",
        "supplement": "セルロース繰り返し単位のOH2箇所を硝酸エステル化したもの。セルロースナイトレート（置換度可変）の一種だが同一構造扱いしない。",
        "proposal": "同族モデルは既存だが置換度差を明示。完全同一構造扱いは不可。",
        "urls": [
          "https://kimika.net/y2cellulosecompound.html"
        ],
        "quote": "セルロース 、-OH2つが-O-NO 2 に変化したものを ジニトロセルロース という。 ニトロセルロースの用途 ニトロセルロースのうち、トリニトロセルロースは綿火薬の原料として、ジニトロセルロースはセルロイドや半透膜の一種であるコロジオン膜の原料"
      },
      {
        "term": "ジアセチルセルロース",
        "kind": "polymer-derivative",
        "identity": "セルロース繰返し単位中OH二箇所の酢酸エステル化",
        "proposedId": null,
        "existingIds": [
          "cellulose-acetate"
        ],
        "ref": "diacetylcellulose",
        "resolution": "variant",
        "supplement": "セルロース繰り返し単位のOH2箇所を酢酸エステル化したもの。セルロースアセテート（置換度可変）の一種だが同一構造扱いしない。",
        "proposal": "同上。",
        "urls": [
          "https://kimika.net/y2cellulosecompound.html"
        ],
        "quote": "] 次に、トリアセチルセルロースを一部だけ加水分解すると、 ジアセチルセルロース ができる。 \\[ \\begin{align}&\\mathrm{[C_{6}H_{7}O_{2}(OCOCH_{3})_{3}]_{n}+nH_{2}O }\\\\ &\\ma"
      },
      {
        "term": "ノボラック",
        "kind": "polymer-mixture",
        "identity": "酸触媒フェノール樹脂前駆体; 分布をもつ",
        "proposedId": null,
        "existingIds": [],
        "ref": "novolac",
        "resolution": "material",
        "supplement": "酸触媒で得るフェノール樹脂前駆体。分子量分布をもち、硬化後の樹脂と同一物扱いしない。",
        "proposal": "phenol-resinの反応中間段階へ集約。硬化後と同一物扱いしない。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10257/point-2/",
          "https://kimika.net/y2bakelite.html"
        ],
        "quote": "目状構造 になっているわけです。 中間生成物は、ノボラックかレゾール それでは、反応前と反応後の状態を確認できたところで、変化の様子を見てみましょう。 確かに、フェノールとホルムアルデヒドからフェ"
      },
      {
        "term": "レゾール",
        "kind": "polymer-mixture",
        "identity": "塩基触媒フェノール樹脂前駆体; 分布をもつ",
        "proposedId": null,
        "existingIds": [],
        "ref": "resol",
        "resolution": "material",
        "supplement": "塩基触媒で得るフェノール樹脂前駆体。加熱で架橋する。ノボラックとは別段階。",
        "proposal": "同上。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10257/point-2/",
          "https://kimika.net/y2bakelite.html"
        ],
        "quote": "なっているわけです。 中間生成物は、ノボラックかレゾール それでは、反応前と反応後の状態を確認できたところで、変化の様子を見てみましょう。 確かに、フェノールとホルムアルデヒドからフェノール樹脂"
      },
      {
        "term": "グリプタル樹脂",
        "kind": "polymer-subtype",
        "identity": "フタル酸とグリセリンに由来するアルキド樹脂",
        "proposedId": null,
        "existingIds": [
          "alkyd-resin"
        ],
        "ref": "glyptal",
        "resolution": "material",
        "supplement": "フタル酸とグリセリンに由来するアルキド樹脂の一種。一般のアルキド樹脂と同一視しない。",
        "proposal": "既存の一般アルキド樹脂の具体例として名称・反応対応を追加する候補。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10257/point-2/",
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10261/",
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10261/practice-2/"
        ],
        "quote": "次の表にあるように、フェノール樹脂・尿素樹脂・メラミン樹脂・グリプタル樹脂といった種類があります。 今回は、代表的な フェノール樹脂 の構造に注目していきます。 フェノール樹脂は、 フライパンの取っ手 などに使われている物質で"
      },
      {
        "term": "チマーゼ",
        "kind": "enzyme-mixture",
        "identity": "アルコール発酵を進める酵素群; 一意配列なし",
        "proposedId": null,
        "existingIds": [],
        "ref": "zymase",
        "resolution": "compound",
        "supplement": "酵母のアルコール発酵を進める酵素群。単一酵素・単一配列ではない。",
        "proposal": "proteinの酵素群と反応注記へ集約。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10133/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10133/point-2/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10137/question-2/"
        ],
        "quote": "き、エタノールと二酸化炭素ができていますね。 この物質は チマーゼ と呼ばれる 酵素 です。 ところでみなさんは、酵素という言葉を聞いたことはありますか？ 酵素とは、生体内ではたらく触媒のことをいい、酵母とよばれる微生"
      },
      {
        "term": "マルターゼ",
        "kind": "enzyme-family",
        "identity": "マルトース加水分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "maltase",
        "resolution": "compound",
        "supplement": "マルトース加水分解酵素。基質と生成物を明示し、単一固定分子式にしない。",
        "proposal": "protein/糖分解反応へ集約。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10140/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10144/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10152/point-2/"
        ],
        "quote": "と呼ばれることもあります。 マルトースの消化酵素は、マルターゼ また、マルトースは マルターゼ という 消化酵素 によって分解されます。 このように、消化酵素と消化酵素がはたらく物質は、名前が似ていることが多いです。"
      },
      {
        "term": "スクラーゼ",
        "kind": "enzyme-family",
        "identity": "スクロース加水分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "sucrase",
        "resolution": "compound",
        "supplement": "スクロース加水分解酵素。インベルターゼとも呼ばれる。",
        "proposal": "同上。教材でインベルターゼを併記。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10144/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10144/point-2/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10168/question-2/"
        ],
        "quote": "と呼ばれる場合もあります。 スクロースの消化酵素はスクラーゼ また、スクロースは スクラーゼ と呼ばれる酵素によって分解されます。 マルトースの消化酵素が マルターゼ であったように、名前がよく似ていますね。"
      },
      {
        "term": "トリプシン",
        "kind": "enzyme-family",
        "identity": "タンパク質加水分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "trypsin",
        "resolution": "compound",
        "supplement": "タンパク質加水分解酵素。ペプシンとは別の酵素。",
        "proposal": "proteinの酵素例に集約。pepsinとは別。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10225/point-2/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10225/practice-3/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10237/"
        ],
        "quote": "曲線がかかれていますね。 これらは、ペプシン・アミラーゼ・トリプシンの３つの酵素を表しています。 まずは、ペプシンの曲線に注目しましょう。 反応速度のときと同じように、山なりの曲線になっていますね。 pHが低いときには"
      },
      {
        "term": "プロテアーゼ",
        "kind": "enzyme-class",
        "identity": "タンパク質分解酵素の総称",
        "proposedId": null,
        "existingIds": [],
        "ref": "protease",
        "resolution": "compound",
        "supplement": "タンパク質分解酵素の総称。個別酵素ではなくクラスとして収録。",
        "proposal": "既存proteinの酵素分類へ。単一物追加不要。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10221/practice-3/"
        ],
        "quote": "酵素とは、生体内の触媒 (1)です。 プロテアーゼのように、生体内に存在して化学反応を起こりやすくする 触媒 を何というか聞かれています。 生体内ではたらく触媒を、 酵素 といいましたね。 酵素は特定の基質にし"
      },
      {
        "term": "リパーゼ",
        "kind": "enzyme-family",
        "identity": "油脂加水分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "lipase",
        "resolution": "compound",
        "supplement": "油脂加水分解酵素。油脂→高級脂肪酸＋グリセリンの反応を触媒する。",
        "proposal": "油脂の加水分解とproteinの酵素例へ。",
        "urls": [
          "https://kimika.net/y2fats.html",
          "https://kimika.net/y2koso.html"
        ],
        "quote": "（計算問題・ヨウ素価との違いなど） ❹ 加水分解 油脂は酵素リパーゼによって加水分解され、 グリセリン と 脂肪酸 になる。 ❺ 酸化・乾燥 油脂の構成脂肪酸中にC=Cが含まれていると空気中のO 2 の酸化を受ける。 この変化において、油"
      },
      {
        "term": "カタラーゼ",
        "kind": "enzyme-family",
        "identity": "過酸化水素分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "catalase",
        "resolution": "compound",
        "supplement": "過酸化水素分解酵素。2H2O2→2H2O+O2を触媒する。",
        "proposal": "proteinの酵素例へ。",
        "urls": [
          "https://kimika.net/y2koso.html"
        ],
        "quote": "す。 分類 酵素 触媒する反応や働き［所在］ 酸化還元酵素 カタラーゼ 2H 2 O 2 →2H 2 O+O 2 ［血液］ デヒドロゲナーゼ H原子を奪って酸化する 転移酵素 （トランスフェラーゼ） ホスホリラーゼ リン酸化する 過リン酸分"
      },
      {
        "term": "ラクターゼ",
        "kind": "enzyme-family",
        "identity": "ラクトース加水分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "lactase",
        "resolution": "compound",
        "supplement": "ラクトース加水分解酵素。グルコースとガラクトースを生じる。",
        "proposal": "糖分解反応へ。",
        "urls": [
          "https://kimika.net/y2koso.html",
          "https://kimika.net/y2nito.html"
        ],
        "quote": "スクラーゼ （インベルターゼ） スクロース→転化糖［腸液］ ラクターゼ ラクトース→グルコース+ガラクトース ペプシン タンパク質→ペプチド［胃液］ トリプシン タンパク質→ペプチド［すい液］ エレプシン ペプチド→アミノ酸［腸液］ リパー"
      },
      {
        "term": "エレプシン",
        "kind": "enzyme-mixture",
        "identity": "ペプチドをアミノ酸に分解する酵素群",
        "proposedId": null,
        "existingIds": [],
        "ref": "erepsin",
        "resolution": "compound",
        "supplement": "ペプチドをアミノ酸に分解する酵素群。単一酵素ではない。",
        "proposal": "proteinの分解反応へ。",
        "urls": [
          "https://kimika.net/y2koso.html"
        ],
        "quote": "プチド［胃液］ トリプシン タンパク質→ペプチド［すい液］ エレプシン ペプチド→アミノ酸［腸液］ リパーゼ 油脂→高級脂肪酸+グリセリン［すい液］ ATPアーゼ ATPのリン酸結合を加水分解 ウレアーゼ 尿素→アンモニア+二酸化炭素 セル"
      },
      {
        "term": "ウレアーゼ",
        "kind": "enzyme-family",
        "identity": "尿素加水分解酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "urease",
        "resolution": "compound",
        "supplement": "尿素加水分解酵素。尿素→アンモニア＋二酸化炭素を触媒する。",
        "proposal": "ureaの反応とproteinへ。",
        "urls": [
          "https://kimika.net/y2koso.html"
        ],
        "quote": "リン［すい液］ ATPアーゼ ATPのリン酸結合を加水分解 ウレアーゼ 尿素→アンモニア+二酸化炭素 セルラーゼ セルロース→セロビオース （草食動物の腸内） セロビアーゼ セロビオース→グルコース （草食動物の腸内） 脱離酵素 （リアーゼ"
      },
      {
        "term": "ヘリカーゼ",
        "kind": "enzyme-family",
        "identity": "DNA二重鎖をほどく酵素; 種・配列未指定",
        "proposedId": null,
        "existingIds": [],
        "ref": "helicase",
        "resolution": "compound",
        "supplement": "DNA二重鎖をほどく酵素。種・配列は未指定。",
        "proposal": "dnaの反応説明へ。",
        "urls": [
          "https://kimika.net/y2spiral.html"
        ],
        "quote": "。 二重らせん構造のほどき方 DNAの二重らせん構造はDNAヘリカーゼという 酵素 によってほどかれる。 タンパク質合成の際に重要となるので必ず覚えておこう。 【新課程対応】化学の計算ドリル大好評発売中！ 高校化学・化学基礎の計算問題が苦手"
      },
      {
        "term": "コロジオン",
        "kind": "material",
        "identity": "本文はコロジオン膜として言及",
        "proposedId": null,
        "existingIds": [
          "cellulose-nitrate"
        ],
        "ref": "collodion",
        "resolution": "material",
        "supplement": "ジニトロセルロースを溶剤に溶かした膜材料。硝酸セルロースの置換度依存で、単一化合物とみなさない。",
        "proposal": "硝酸セルロースの用途・材料へ。単一化合物とみなさない。",
        "urls": [
          "https://kimika.net/y2cellulosecompound.html"
        ],
        "quote": "料として、ジニトロセルロースはセルロイドや半透膜の一種であるコロジオン膜の原料として用いられる。 ニトロセルロース 用途 トリニトロセルロース 綿火薬の原料 ジニトロセルロース セルロイド、コロジオン膜（半透膜の一種）の原料 (adsbyg"
      },
      {
        "term": "エボナイト",
        "kind": "material",
        "identity": "多量硫黄で加硫した硬質ゴム",
        "proposedId": null,
        "existingIds": [
          "natural-rubber"
        ],
        "ref": "ebonite",
        "resolution": "material",
        "supplement": "天然ゴムに多量の硫黄を加えて長時間加硫した硬質ゴム。加硫状態の材料。",
        "proposal": "加硫状態・材料別名として集約。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10271/point-2/",
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10271/practice-3/",
          "https://kimika.net/y2addition.html"
        ],
        "quote": "久性に優れた 弾性ゴム となります。 弾性ゴム⇒エボナイト さらに、硫黄を数十％加えて長時間加熱してみましょう。 このとき、黒色で硬く、プラスチック状の物質が得られます。 この物質のことを、 エボナイト と呼びま"
      },
      {
        "term": "ラテックス",
        "kind": "mixture",
        "identity": "ゴム樹液の乳液",
        "proposedId": null,
        "existingIds": [
          "natural-rubber"
        ],
        "ref": "latex",
        "resolution": "material",
        "supplement": "ゴム樹液の乳液。天然ゴムの純物質名ではない。",
        "proposal": "原料混合物として材料索引へ。純粋な天然ゴムの別名にはしない。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10240/lessons-10271/",
          "https://kimika.net/y2addition.html"
        ],
        "quote": "このような ゴムの木 の樹皮に傷をつけると、ラテックスと呼ばれる白い乳液が得られます。 これに酢酸などを加えて凝固させ、乾燥させます。 こうしてできた物質を、 天然ゴム（生ゴム） といいます。 合成ゴムは、天"
      },
      {
        "term": "シュワイツァー試薬",
        "kind": "inorganic-reagent-mixture",
        "identity": "銅(II)水酸化物のアンモニア溶液",
        "proposedId": null,
        "existingIds": [],
        "ref": "schweizer-reagent",
        "resolution": "material",
        "supplement": "銅(II)水酸化物のアンモニア溶液。セルロースを溶かす試薬で、単一化合物ではない。",
        "proposal": "再生セルロースの試薬注記へ。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/point-2/",
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10164/practice-3/"
        ],
        "quote": "といいます。 銅アンモニアレーヨン（キュプラ）は、シュワイツァー試薬から得られる 再生繊維の一種である 銅アンモニアレーヨン を紹介していきます。 まずは、図のイメージを確認していきます。"
      },
      {
        "term": "シュバイツァー試薬",
        "kind": "inorganic-reagent-mixture",
        "identity": "同試薬の表記異形",
        "proposedId": null,
        "existingIds": [],
        "ref": "schweizer-reagent",
        "resolution": "material",
        "supplement": "シュワイツァー試薬の表記異形。同一の試薬として正規化する。",
        "proposal": "上記と名称正規化。",
        "urls": [
          "https://kimika.net/y2cellulosemelt.html",
          "https://kimika.net/y2rayon.html",
          "https://kimika.net/y2tato.html"
        ],
        "quote": "ush({}); はじめに 【プロ講師解説】このページでは『シュバイツァー試薬や二硫化炭素を用いてセルロースを溶かす方法』について解説しています。 セルロースを溶かす方法 セルロースを溶かす方法には『シュバイツァー試薬を用いる方法』と『水酸化ナトリ"
      },
      {
        "term": "アルキル硫酸",
        "kind": "class",
        "identity": "ROSO3H; R未指定",
        "proposedId": null,
        "existingIds": [
          "sds"
        ],
        "ref": "alkyl-sulfate",
        "resolution": "family",
        "supplement": "ROSO3H（R未指定）の界面活性剤クラス。SDSは代表的な塩の一つで、クラス全体と同一視しない。",
        "proposal": "SDSは代表的塩の例。クラス全体と同一物にはしない。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9894/lessons-9980/"
        ],
        "quote": "、 アルキルベンゼンスルホン酸 といいます。 ちなみに、 アルキル硫酸 という物質の場合もありますが、構造や性質はあまり変わりません。 この内容をまとめましょう。 「合成洗剤」は、 アルキルベンゼンスルホン酸やアルキル"
      },
      {
        "term": "酢酸鉛",
        "kind": "organic-salt-reagent",
        "identity": "Pb(CH3COO)2",
        "proposedId": "lead-ii-acetate",
        "existingIds": [],
        "ref": "lead-ii-acetate",
        "resolution": "compound",
        "supplement": "酢酸の鉛(II)塩。タンパク質の硫黄検出試薬。無機試薬ではなく有機酸塩として扱う。",
        "proposal": "有機酸塩の検出試薬。無機試薬と誤分類せず酢酸の塩状態へ集約。",
        "urls": [
          "https://www.try-it.jp/chapters-10095/sections-10116/lessons-10214/",
          "https://www.try-it.jp/chapters-9788/sections-9789/lessons-9813/point-2/",
          "https://kimika.net/y1gensocheck.html"
        ],
        "quote": "ントプロテイン反応 といいます。 硫黄の検出は、酢酸鉛による黒色沈殿 次に注目するのは、 硫黄を含むアミノ酸 の検出方法です。 硫黄を含むアミノ酸としては、メチオニンやシステインがありましたね。 このようなア"
      },
      {
        "term": "酢酸カルシウム",
        "kind": "organic-salt",
        "identity": "Ca(CH3COO)2",
        "proposedId": "calcium-acetate",
        "existingIds": [],
        "ref": "calcium-acetate",
        "resolution": "compound",
        "supplement": "酢酸のカルシウム塩。乾留でアセトンを生じる。",
        "proposal": "酢酸塩の状態とアセトン製法へ集約。",
        "urls": [
          "https://kimika.net/aru-keto.html",
          "https://kimika.net/karu-esu.html"
        ],
        "quote": "アルコールの酸化 アルケンの酸化 クメン法（アセトンのみ） 酢酸カルシウムの乾留（アセトンのみ） ❶ 第2級アルコールの酸化 第2級アルコールを酸化すると、ケトンが生成する。 ❷ アルケンの酸化 アルケン を酸化すると2つのケトンが生成する。"
      },
      {
        "term": "炭化カルシウム",
        "kind": "inorganic-reagent",
        "identity": "CaC2",
        "proposedId": null,
        "existingIds": [],
        "ref": null,
        "resolution": "inorganic",
        "supplement": "CaC2の無機化合物。有機化学ビルダーの化合物カードにはせず、アセチレン製法の無機試薬として明示的に対象外へ分類する。",
        "proposal": "アセチレンの製法試薬に集約。",
        "urls": [
          "https://www.try-it.jp/chapters-9788/sections-9832/lessons-9879/point-2/",
          "https://kimika.net/y1arukin.html"
        ],
        "quote": "ンの製法 を確認していきます。 アセチレンの製法は、炭化カルシウム＋水 アセチレンをつくるには、 炭化カルシウムCaC 2 という物質を用意します。 炭化カルシウムは、 カーバイド とも呼ばれます。 特徴的な物質なので、"
      },
      {
        "term": "セルロイド",
        "kind": "material",
        "identity": "硝酸セルロース由来材料",
        "proposedId": null,
        "existingIds": [
          "cellulose-nitrate"
        ],
        "ref": "celluloid",
        "resolution": "material",
        "supplement": "ジニトロセルロースに樟脳を混ぜた熱可塑性材料。純物質ではない。",
        "proposal": "用途・材料へ集約。",
        "urls": [
          "https://kimika.net/y2cellulosecompound.html"
        ],
        "quote": "リニトロセルロースは綿火薬の原料として、ジニトロセルロースはセルロイドや半透膜の一種であるコロジオン膜の原料として用いられる。 ニトロセルロース 用途 トリニトロセルロース 綿火薬の原料 ジニトロセルロース セルロイド、コロジオン膜（半透膜"
      },
      {
        "term": "サロメチール",
        "kind": "source-name-caution",
        "identity": "当該教材はサリチル酸メチルと等号で併記",
        "proposedId": null,
        "existingIds": [
          "methyl-salicylate"
        ],
        "ref": "salomethyl",
        "resolution": "material",
        "supplement": "サリチル酸メチルを配合した外用鎮痛薬の商品名。純物質の別名として扱わない。",
        "proposal": "商品名・製剤名との区別を別途確認。無条件に純物質別名登録しない。",
        "urls": [
          "https://kimika.net/houkokarubon.html"
        ],
        "quote": "化」が起こる。 このとき生成される サリチル酸メチル （＝ サロメチール ）は特異臭をもつ油状の液体で、消炎鎮痛作用をもつので外用塗布薬などとして用いられる。 カルボン酸の反応について詳しくは次のページを参照のこと。 参考： カルボン酸・エス"
      }
    ]
  };
  DATA.audit = audit;
  function audit(data) {
    var missing = [];
    var byResolution = {};
    DATA.FINDINGS.forEach(function (r, i) {
      byResolution[r.resolution] = (byResolution[r.resolution] || 0) + 1;
      if (!r.urls || !r.urls.length) missing.push({ index: i, term: r.term, reason: 'source_urlなし' });
      if (!r.quote || r.quote.length < 8) missing.push({ index: i, term: r.term, reason: '本文根拠が短い' });
      if (!r.supplement) missing.push({ index: i, term: r.term, reason: '化学的補足なし' });
      if (r.resolution === 'compound' && !(data && data.COMPOUNDS[r.ref])) missing.push({ index: i, term: r.term, reason: '化合物IDなし: ' + r.ref });
      if (r.resolution === 'material' && !(data && data.materialById && data.materialById(r.ref))) missing.push({ index: i, term: r.term, reason: '材料IDなし: ' + r.ref });
      if (r.resolution === 'variant' && !(data && data.materialById && data.materialById(r.ref))) missing.push({ index: i, term: r.term, reason: '置換度variant IDなし: ' + r.ref });
      if (r.resolution === 'family' && !(data && data.familyById && data.familyById(r.ref))) missing.push({ index: i, term: r.term, reason: 'family IDなし: ' + r.ref });
      if (r.resolution === 'inorganic' && r.ref != null) missing.push({ index: i, term: r.term, reason: '無機対象外にIDがある' });
    });
    return { findings: DATA.FINDINGS.length, byResolution: byResolution, missing: missing };
  }
  DATA.audit = audit;
  return DATA;
});
