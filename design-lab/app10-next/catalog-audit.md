# 有機化学ビルダー 収録整理記録（重複監査）

最終更新: 2026-11-10

## 1. 整理前後の件数（実データ）

| 項目 | 整理前 | 整理後 | 差分 |
|---|---:|---:|---:|
| 化合物（COMPOUNDS） | 367 | 367 | 0（外部照合の367件を保持） |
| 骨格・個別選択（SKELETONS） | 300 | 277 | -23 |
| うち個別選択（locked） | 282 | 259 | -23 |
| うち組合せ骨格（nonlocked） | 18 | 18 | 0 |
| 置換基（GROUPS） | 8 | 11 | +3（br / i / cn） |
| 値のある組合せセル | 344 | 331 | -13 |
| 組合せ経路の総エントリ | 397 | 386 | -11 |
| 空セル（理由つき） | 82 | 126 | +44 |
| 外部照合行 / 資料 | 153 / 21 | 153 / 21 | 0 |

- 化合物IDは削除も改名もしていない。減ったのは「個別選択としての導線」だけで、物質データはすべて残っている。
- 空セルはすべて `UNSUPPORTED_REASONS` に理由（区分・具体例）をもつ。理由のない空セルは0件。

## 2. 11件の二重導線の原因と解消

原因: `INDIVIDUAL_SECTIONS` に、すでに `COMBOS` の骨格＋官能基から到達できる化合物を登録していた。
UIは個別選択（locked）と組合せ生成を別の導線として扱うため、同じ物質が2か所に現れていた。
化合物ID・構造・出典は正しく、データの重複ではなく「導線の重複」だった。

個別選択を削除した11件:

- メチルアミン（メタン＋−NH₂）
- エチルアミン（エタン＋−NH₂）
- プロピルアミン / イソプロピルアミン（プロパン＋−NH₂、2異性体）
- ブタン-1-アミン / ブタン-2-アミン / 2-メチルプロパン-1-アミン / 2-メチルプロパン-2-アミン（ブタン骨格＋−NH₂、4異性体）
- アクリル酸（エテン＋−COOH）
- メタクリル酸（プロペン＋−COOH）
- 塩化ビニル（エテン＋−Cl）

## 3. 組合せへ移したその他の物質

既存の骨格＋基で自然に表せるため、個別選択を削除して `COMBOS` に集約した。

- ニトロメタン: メタン＋−NO₂（C2以上のニトロアルカンは範囲外の理由を表示）
- 1-ナフトール / 2-ナフトール: ナフタレン＋−OH（2異性体を結果一覧で比較）
- ブロモエタン: エタン＋−Br
- 1-ブロモプロパン / 2-ブロモプロパン: プロパン＋−Br（2異性体）
- ヨードエタン: エタン＋−I
- アセトニトリル: メタン＋−CN
- プロパンニトリル: エタン＋−CN
- ブタンニトリル: プロパン＋−CN
- ベンゾニトリル: ベンゼン＋−CN
- アクリロニトリル: エテン＋−CN

これ以外に、同じ基で自然に参照できる既存物質は追加していない（ブロモメタン、ヨードメタン、ブロモベンゼン、ヨードベンゼンなどは化合物データ自体がないため、新物質は追加しない方針で見送り）。

## 4. 異性体の扱い（統合しないもの）

- 同じ骨格＋同じ基から得られる位置・骨格異性体は、`COMBOS` の配列に並べ、結果一覧で比較する。
  - 例: ブタン＋−OH の4種、プロパン＋−NH₂ の2種、ナフタレン＋−OH の2種。
- 異性体であることを理由に個別選択（`ind-...`）を残さない。今回削除した23件はすべてこの方針。
- 官能基異性体（例: エタノールとジメチルエーテル）は「同じ骨格＋同じ基」の異性体ではないため、結果一覧に混在させない。ジメチルエーテルは個別選択のまま残す。
- 幾何異性体（シス/トランス）・光学異性体（R/S）は、個別名称をもつ物質（マレイン酸/フマル酸、オレイン酸/エライジン酸など）を除き、従来どおり区別しない。

## 5. 旧URL（個別選択）の移行

- `?skeleton=ind-<化合物ID>` の旧URLは、`COMBOS` から自動生成した正準経路（`CANONICAL_ROUTES` / `routeFor`）へ移行する。
- 移行時は元の化合物IDを `focus` として保持し、結果一覧の該当カードを強調・スクロールする。新しい画面やタブは増やさない。
- 対応する経路がないIDは、初期表示へ無言で落とさず「収録されていない」旨を画面に表示する。
- 台帳の「収録方式」リンクも `routeFor` を使い、削除済みの `ind-...` を直接リンクしない。

## 6. 重複整理の内容

- 別名 `p-ヒドロキシアゾベンゼン` の完全重複1件を削除（`p-フェニルアゾフェノール` は残す）。
- 外部資料の原文表記（例: クェルセチン）も検索語として保持し、原文名から収録IDへ引けることをテストで確認する。別名の完全重複は作らない。
- 材料synonymから自己名称4件を削除（レーヨン、セロファン、ビスコース、アニリンブラック）。材料名とsynonymの正規化重複は0件。
- 外部照合 s3 の「酢酸ナトリウム」を `alias` から `compound` に統一。s2 と s3 の2出典は正当な複数出典として残す。
- 汎用ボタン「炭素数 2 / 3 / 4」は分野ごとに化学的な意味が異なるため統合せず、「炭素数 2（アルカン）」「炭素数 2（アルケン）」「炭素数 2（アルキン）」のように分野名を明示した。
- 個別選択の左プレビューは「個別登録された物質です。構造式と説明は下の結果に表示します。」という短い案内だけにし、結果カードとの名称・構造図の二重表示をやめた。通常の骨格プレビューは維持する。

## 7. データ不変条件（テストで確認）

- 化合物ID・正規化名称・別名の完全一致重複・材料synonymの自己名称がない。
- `SKELETONS` のIDが一意で、locked選択のID束にnonlocked経路が混在しない。
- `COMBOS` の同一セル内で生成物が重複せず、全参照先が存在して検証に合格する。
- 同一graph・同一図の重複がない。分子式が同じだけでは同一とみなさない（異性体は構造で区別）。
- 複数経路（例: エタン）は同じ化合物IDに集約され、経路ごとに別IDを作らない。
- 新設した br / i / cn の空セルにも、範囲外の理由と具体例がある。
- 旧 `ind-...` URLの移行、lockedプレビューの非二重表示、台帳リンクの `routeFor` 使用を静的テストで確認する。

## 8. 出典・範囲の方針

- 化合物367件と外部照合153行・21資料は保持している。出典不足の行はない。
- 空セルは「通常の高校教材で扱う代表範囲に含めていない（範囲外）」と「化学的に成立しない」を区別する。今回の br / i / cn の空セルはすべて前者で、「成立しない」とは書かない。
- 外部資料に掲載されていることは、標準的に暗記する範囲であることを意味しない。資料側ラベル（標準／発展／探究）は従来どおり各行に残す。
- 件数はクレジットや台帳に固定値で書かず、台帳の自動集計を参照する。

## 9. 探し方版（419件）の更新 — 2026-11-09

- **鎖式の選択モデル**: ①総炭素数＋構造条件、②化合物分類に分離。分類順は alkane / alkene / alkyne / halogen / alcohol / polyol / ether / aldehyde / ketone / carboxylic / anhydride / ester / amine / nitrile / nitro / amino-alcohol。初期値はアルカン・C2・飽和。①の変更で②のC・構造条件を書き換えず、①で0件の分類は表示しない。②が無効になった場合だけ分類を解除し、別分類を自動選択しない。炭素選択肢は全鎖式インデックスの和集合（C1〜C10・C20）。
- **環式の置換基プリセット**: 「追加なし」は骨格単体のみ（ベンゼン1件・ナフタレン1件）。登録済み単置換11件・多置換35件は、置換基1つ／同じ置換基を複数／異なる置換基組み合わせのプリセット、または「その他の登録済み化合物」で到達する。位置異性体（OH×2、CH₃×2、OH＋COOH、OH＋CH₃、OH＋NO₂等）は同じプリセット配列にまとめる。置換基の種類・数・位置は `structure.subs` と custom 用 `RING_SUBS` metadata で定義し、名称の部分一致では判定しない。`BENZENE_MULTI_IDS` の subs=2 代替値は廃止。
- **図の二重表示**: 293件を構造式＋簡略構造式で表示。graphは同一graphから水素明示図とCHn省略図を生成。ring-subは `subs` 位置metadataから対応置換基の原子グラフを生成。condensedは明示結合記号からgraphを組み、分子式一致を確認（124件）。例外は原子数閾値40（水素含む）・投影式・重合体・模式図・油脂・シス/トランス・複合芳香族/複合塩の基準で理由を表示し、台帳に件数を記録する。
- **文字の簡略構造式**: 共通カードUIに「簡略構造式: …」を表示。エタノール CH₃CH₂OH、プロピレングリコール CH₃CH(OH)CH₂OH、グリセリン HOCH₂CH(OH)CH₂OH をはじめ、graph/condensed/ring-sub metadataから作れるものは文字化する。投影式は立体を図が正本と注記し、重合体は繰返単位、模式図・油脂は一意式なしと明記する。
- **2026-11-09 不具合修正**: 派生graph32件の誤接続（trimethylamine N-C-C-C、tetrafluoroethyleneのF主鎖、caprolactam/melamineの環消失等）を修正。分岐・環・電荷・原子価を検証し、32件の構造signatureをunitで固定。ring-sub14件の結合線-非端点原子貫通をlayout回転/距離探索で解消。右②プレビューから骨格図を外し、骨格は①側へ移動。小分子塩はNa⁺等の対イオンを共有結合でつながない電荷分離graphにした。
- **レイアウト**: 上段①②と結果カードはPC・390×844・320幅でも2カラムを維持。カード内は構造式と簡略構造式を縦併記。図はタップ/Enterで拡大ダイアログ（Escape・フォーカス復帰・スクロール復元）。
- **検証**: `scripts/tests/app10-next.test.cjs` を59件に拡張。全419件のroute/preset、位置異性体プリセット、二重表示の原子数・分子式一致、例外理由、2カラムCSS、3テーマ相対パスを静的に確認する。`site/app10` と `site/themes` は変更していない。

## 10. 例外の全リスト（2026-11-09）

二重表示293・複数投影2・単一簡略124。単一簡略の内訳は次の通り（IDは `figureAudit().exceptions` と一致）。

- **原子数閾値（17）**: stearic-acid, oleic-acid, linoleic-acid, sodium-stearate, sds, palmitic-acid, linolenic-acid, sodium-palmitate, sodium-oleate, eicosane, carminic-acid, carthamin, heme, myristic-acid, arachidonic-acid, eicosapentaenoic-acid, docosahexaenoic-acid
- **投影式（6、うち2件は複数投影）**: glucose, fructose, galactose, mannose, ribose, deoxyribose
- **重合体（39）**: protein, natural-rubber, polyethylene, polypropylene, polystyrene, pvc, pet, nylon66, pva, pmma, pan, ptfe, pvac, pvdc, nylon6, phenol-resin, urea-resin, melamine-resin, epoxy-resin, silicone, polyurethane, sbr, br, chloroprene-rubber, pla, polycarbonate, sodium-polyacrylate, aramid, abs, nbr, iir, unsaturated-polyester, alkyd-resin, polyacetylene, polyaniline, cation-exchange-resin, anion-exchange-resin, alginic-acid, sodium-alginate
- **模式図・異性体総称（55）**: sucrose, maltose, lactose, starch, cellulose, glycogen, vinylon, amylopectin, dextrin, chitin, cellulose-acetate, cellulose-nitrate, dna, rna, cellobiose, trehalose, insulin, hemoglobin, albumin, globulin, glutelin, keratin, collagen, fibroin, mucin, casein, amylase, gelatin, pepsin, histone, protamine, glutenin, oryzenin, gliadin, hordein, globin, salmine, hemocyanin, cellulase, cellobiase, hexachlorocyclohexane, isomaltose, atp, atpase, zymase, maltase, sucrase, trypsin, protease, lipase, catalase, lactase, erepsin, urease, helicase
- **油脂（4）**: tristearin, tripalmitin, triolein, trilinolein
- **シス/トランス保持（3）**: maleic-acid, fumaric-acid, elaidic-acid
- **複合芳香族・複合塩/染料（2）**: las, methyl-orange

小分子のNa塩（酢酸Na・Naメトキシド・Naエトキシド・Naフェノキシド・安息香酸Na・ラウリン酸Na等）とCa/Pb/Ag/Cu塩は、金属regexで除外せず電荷分離graphで二重表示する。


## 11. 鎖式を「炭化水素部分」で探す方式 ? 2026-11-09

- **①の変更**: 鎖式①を「官能基に結合する炭化水素部分のC数＋骨格」へ変更し、総炭素数と飽和/不飽和の選択を廃止した。`chain-descriptor.js` が `data.js` の検証済みexact graph（build 80・condensedGraphFor 71・manual 3）から、カルボニルC（C=O）・ニトリルC（C≡N）をfunctional coreとして除外し、O/N/ハロゲン等を除いた炭素グラフの連結成分を親炭化水素として導出する。分子式・名称から炭素骨格を推定しない。
- **語彙**: 鎖式154件から実測47件の骨格デスクリプタ（位置異性体4組＋C0のH/直結）。exact tree canonicalは各頂点のelement/H/chargeと各edgeのbondorderを含み、root全頂点の最小符号で比較する。C2は「エタン由来 / エテン由来 / エチン由来 / メチル基×2 / H＋エチル基」。ブタ-1-エン / ブタ-2-エン、ブタ-1-イン / ブタ-2-イン、ペンタ-1-エン / ペンタ-2-エン、ペンタ-1-イン / ペンタ-2-インは結合位置が異なる別shape・別label。イソブテンも別。プロパン-1-オール / プロパン-2-オールは同じプロパン、ブタン-1-オール / ブタン-2-オールは同じブタン、2-メチルプロパン-1-オール / 2-メチルプロパン-2-オールは同じ2-メチルプロパン。
- **C数の独立照合**: 部分C数＝分子全体C－functional core C。全154件でgraphと分子式の両方から一致を確認。トリアセチンは総C9－カルボニルC3＝C6（プロパン骨格＋メチル基×3）であり、C3ではない。ピルビン酸C1、アジポイルクロリドC4、シュウ酸C0。
- **aldehydic Hの扱い**: カルボニルCに結合するHは、−CHOの固定HとR=Hを区別する。エタナール・プロパナールのCHO固定Hは①に数えず、①はメチル・エチル。ホルムアルデヒドはCHO固定H1以外のH1がR=Hなので①H。ギ酸・ギ酸エステルのcarbonyl C–HはR=Hとして①にH断片を残す。methyl+CHOとmethyl+COOHは同じ①メチル選択から②で選べる。
- **多官能25件**: 多価アルコール3・アミノアルコール1・ヒドロキシ酸1・ヒドロキシ多価カルボン酸3・ケト酸1・二価カルボン酸7・酸塩化物1・多ハロゲン化物7・トリエステル1。鎖式のまま維持し、`other` へ逃がさない。役割はgraphの官能基カウントから決め、結果カードのbadgeと②の複数role previewで区別する。シュウ酸（2COOH）とギ酸（1COOH）は同じC0でも分類内で別roleとして表示する。
- **UI**: ①は接続点にHを補った親炭化水素を成分ごとに分離して表示し、接続点を○で示す。②は一般の官能基fragmentと分類のみを表示し、①を書き換えない。①のC数変更で骨格が無効になった場合は骨格の形を解除し、勝手に別骨格へ飛ばさない。②が無効になった場合だけ分類を解除し、有効なら維持する。
- **結果2列**: 級・分子式・役割ごとの別グリッドを作らず、選択した全化合物カードを同じ2列グリッドに並べる。級・分子式・役割・分子全体C数はカード上部のbadgeに残す。奇数件の最後の1枚は半幅、1件だけの場合は妥当な幅とする。環式プリセット・その他familyも同じ方針。
- **URL**: `mode=chain&cpartial=<C>&shape=<descriptor>&family=<family>` を新形式とする。旧 `c`（総炭素数）＋`structure` 付きURLは、focusがあればfocusの正確なrouteを優先し、focusなしで一意なら新形式へ移行、複数なら先頭物質へ自動で飛ばさずnoticeを出して選び直す。旧 `d-butene-c4` / `d-butyne-c4` / `d-pentene-c5` / `d-pentyne-c5` のような誤統合shapeは削除し、focus付きならfocusの新shapeへ、focusなしならnoticeで選び直す。`skeleton=ind-...` 等の旧URL互換は維持する。
- **テスト**: `scripts/tests/app10-next.test.cjs` を67件に拡張。154件のexact graph・分子式・部分C数・31件mapping・4組の結合位置異性体分離・完全canonicalの原子順序不変性・−CHO固定Hとformate R=Hの分離・多官能25件role・全154件の①到達・全419件のroute/shape/partialC・旧URL移行・2列グリッドを静的に確認する。`site/app10` と `site/themes` は変更していない。

## 12. 選択カード・①プレビュー・モバイル図の更新 — 2026-11-10

- **①選択カードの統一**: 全47shapeで「上段=簡単な構造／下段=名前」に統一。単一fragmentの名前は `メタン由来 / エタン由来 / プロパン由来 / エテン由来 / エチン由来 / ブタ-1-エン由来 / 2,2-ジメチルブタン由来` のように親炭化水素＋「由来」とし、`メチル基（メタン由来）` の混在を廃止。分岐骨格はIUPAC名を主表示し、`ネオヘキサン`（2,2-ジメチルブタン）などの慣用名は別名として詳細・検索で到達可能にした。物質レコードは追加・重複していない。
- **複数fragment**: `メチル基×2 / エチル基＋メチル基 / H＋プロピル基 / プロパン骨格＋メチル基×3` のように「○○基×n／○○基＋△△基」で統一。選択カードは `CH₃−　−CH₃` のように接続点のダッシュを中央のすき間へ向け、fragment間に結合線を描かない。`CH₃−CH₃`（エタン）と連結して見せない。n-/イソプロピルの片方と誤認する `プロピル基` 1語は単一fragmentの名前には使わない。
- **長い骨格の圧縮**: 短い直鎖は `CH₄ / CH₃−CH₃ / CH₃−CH₂−CH₃ / CH₂=CH₂ / CH≡CH` の文字式。長い直鎖は `CH₃(CH₂)₄CH₃ / CH₃(CH₂)₁₈CH₃` の繰返し（括弧は繰返しなので可）。分岐は文字括弧にせず、小さな2D構造図で枝を見せる。neohexane（2,2-ジメチルブタン）は中心CがHをもたない四級炭素、CH₃×4＋CH₂×1＋C–C 5本として図示する。C6の5異性体（ヘキサン / 2-メチルペンタン / 3-メチルペンタン / 2,2-ジメチルブタン / 2,3-ジメチルブタン）は別shape・別label・別図。
- **①プレビューは明示Hの構造式**: 選択カードとは別に、選択後の①プレビューはexact parent graphから原子・結合を描き、C6以下はHをすべて明示する（メタンCH₄の4H、エタンC₂H₆の6H、プロパンC₃H₈の8H、2,2-ジメチルブタンC₆H₁₄の14H）。C=C/C≡Cの位置はそのまま保持する（ブタ-2-インは内部三重結合）。文字式だけのfallbackは小さい親炭化水素では使わない。C7以上（ヘプタン〜エイコサン）だけは繰返し式に圧縮し、原子とHを全部は描いていない旨を注記する。複数fragmentはそれぞれの親graphを離して並べ、独立部分間に結合を描かない。接続点にHを補った親炭化水素であることと、実際の置換基・合成手順ではないことを保持する。
- **C0の分離**: 大項目を「炭化水素部分なし」に変更。`d-h-c0`（Hが結合：ギ酸・ホルムアルデヒドのR=H）と `d-direct-c0`（官能基どうしが直接結合：シュウ酸 HOOC–COOH）を別shapeにした。部分C数はどちらも0、通常のdescriptor IDは変更せず、oxalicだけ新descriptor。旧URLはfocus優先の移行とnoticeを維持する。H親図への一括偽装をしない。
- **②選択カード**: 全16鎖式分類で「上段=官能基の簡単な形／下段=分類名」に統一（−OH アルコール、−O− エーテル、−CHO アルデヒド、−CO− ケトン、−COOH カルボン酸、−COO− エステル、−C≡N ニトリル、−CO−O−CO− 無水物、−NO₂、−X、C−C/C=C/C≡C）。選択カードでは `C(=O)` の括弧表記を使わない。アミンは `−NH₂ など` とし、右previewで1〜3級の一般形を保持する。C1アルカンは `CH₄` と表示し、誤って2炭素を要求しない。右previewには実二重結合線の一般構造図を追加し、縮合COと区別する。
- **環式②**: 「上段=置換基fragment／下段=置換基名」に統一（例: `−OH / ヒドロキシ基`、`−COOH / カルボキシ基`）。複数置換基は `＋` で種類と数を示す。「追加なし」は `追加なし / 骨格単体のみ` と説明し、ベンゼン環の図を出さない（環の図は①の固定骨格側だけ）。
- **モバイル・図のフィット**: 全SVGへの `min-width: 400px` 強制を撤去し、SVGのviewBoxを原子・結合・H・電荷・文字幅・多重結合のずれを含む内容bboxに合わせた。ページ・カード・図枠のどこにも横スクロールを作らず、長い簡略式は化学単位（結合記号の後・括弧の終わり・次の炭素単位の前）で複数行に折り返す。複雑な図はカード内で全体を縮小し、既存の「拡大」ダイアログ（Escape・フォーカス復帰・スクロール復元）で読む。図の一部を `overflow:hidden` で切らない。
- **モードボタン**: 「鎖式／芳香族・環式／その他」は320px・390px・1280pxのいずれでも3列（`repeat(3, minmax(0, 1fr))`）。旧 `max-width: 900px` の1列化を撤去し、主ラベル大／補足小、折り返し可、min-height 44pxを維持する。①の左右2列と結果カードの2列は別レイアウトとして維持。
- **検証**: `scripts/tests/app10-next.test.cjs` を67件に拡張。全47shapeのcompactカードと①previewの分離、明示H数（C2H6の6H等）、四級炭素、C6異性体5種、C0のH/直結分離、②官能基カードと実二重結合線、環式カード、viewBoxと内容bboxの余白、min-width撤去、モード3列CSSを追加確認する。`site/app10`・`site/themes`・公開版は変更していない。

## 13. OCR確定不足の反映と現在420件 — 2026-11-10

- **化合物420件**: HEAD 419にフェノキシドイオン1件を追加した。`phenoxide-ion` は分子式C6H5O・表示C₆H₅O⁻・電荷-1で、ベンゼン–O⁻のexact graphをもつ。Naは含めず、`sodium-phenoxide`（C6H5NaO）は別entityとして維持する。graphは原子数・結合価・分子式検証に合格し、構造式＋簡略構造式の二重表示、`C₆H₅−O⁻` の文字併記をもつ。`IONIC_TEXT`（対イオン注記）には入れない。
- **properties/uses等**: フェノールの脱プロトン化・酸でフェノールに戻る反応を記録し、単一の純物質として沸点・融点・固体状態を捏造しない。sourceEvidenceはTry ITの頁・source ID・独自補足をもち、教材URL・本文抜粋・原画像URL・sha256は配信しない。未確認CIDは付けない。
- **環式route**: `BENZENE_CUSTOM_IDS` と `RING_SUBS` のO⁻ metadataで、ベンゼン環の専用preset `p-o_x1` へ配線した。「追加なし」にもtray（その他の登録済み化合物）にも混ぜず、登録済み単置換は12件・多置換35件。全420件のrouteが明示され、台帳検索からfocusカードへ到達する。
- **別名2件**: インベルターゼ→`sucrase`、トレオニン→`threonine` をALIASESへ重複なく追加。表示名は「スレオニン」を維持する。新規entityは追加しない。
- **family検索修正**: PCのsynonymsへ完全形「ホスファチジルコリン（レシチン）」、PAへ裸名「ホスファチジン酸」を追加し、`familyByTerm` と `C.search` の両方で引けるようにした。PA/PC/PEは既存FAMILIES 31にあり、新規family・新規化合物は追加しない。
- **リン脂質3 family**: formulaはnullのまま。sn-1,2位のアシル基R¹・R²、sn-3位のリン酸を説明し、ステアリン酸を唯一の固定鎖と誤認させない（membersから外し、代表例の一つと説明）。PCは工業的レシチンが混合物を指す場合を注記。原資料のP–OH/NH₂等の中性形と、新版の双性イオン形の違いは `provenanceNote` に分離した。一般構造はグリセロール骨格の結合線をもつcustom graphへ改善し、R¹/R²を残す（固定分子式の偽装なし）。

## 14. OCR二pass統合監査・動画未確認の記録 — 2026-11-10

- `ocr-audit.js` / `ocr-audit.json` を追加した。1399件・1398 unique画像、二pass統合ok 1347・empty 51・error 0、page-map 1399行。selected passはoriginal 883・flattened 515。raw OCR text全文はrepoへ保存しない。
- 51 emptyは原画像目視済み（構造/反応のみ36・模式図/アイコン8・写真6・注記1）。化合物名のOCR失敗は0件。
- 766候補（片仮名249・漢字403・式114）を分類し、未採用passの追加188語（280出現）・相違1941行を保存。漢字403は語と文脈による分類のみで、全代表原画像の目視はしていない。
- 419件lookupのfamily漏れ3件（PA/PC/PE）は、既存FAMILIES 31の一般構造・説明を確認して検索・表記の修正へ訂正した。新規追加ではない。
- 確定反映はフェノキシドイオン1 entity、別名2件、PC完全形/PA裸名の検索修正。source ID・実IDを `CONFIRMED_ADDITIONS` / `FAMILY_LOOKUP_CORRECTIONS` に記録した。
- 625語監査の履歴（META.finalCompounds=419）は保持し、現在420件と区別する。既存README/台帳の419を無条件に書き換えない。
- 動画127本は本文未照合。`pIdeL8PT2DM` の公開文字起こしは通常UIでも0 segment、`get_transcript` はHTTP 400（FAILED_PRECONDITION）、0 segment。再取得・迂回はせず、トークン・Cookie・ヘッダーも記録しない（証拠ID `media-audit-evidence-20261109`）。
- 台帳に「OCR二pass統合監査」sectionを追加し、確定項目・family訂正・限界を表示する。全1399画像を「化学完全読取済」とは表示しない。

## 15. 表示整理（点線circle削除・C0 full-row・文言削減・②2列） — 2026-11-10

- ①の選択カード・プレビューから炭素の点線circleと○凡例を撤去した。marks/attachmentCountは内部mapping・テスト用に保持し、SVGへ描画しない。
- C0「炭化水素部分なし」だけを炭素gridのfull-rowにし、他のCボタンの列数は維持。C0の副ラベルを廃止し、ラベル1本にした。C0のH/官能基直結の区別は内部・プレビュー・選択ラベルで維持する。炭素数カードは320px/390pxでも6列以上（`#carbon-list`）とし、実在するC1〜C10・C20だけを表示する（C11〜19のdummyなし）。モバイルはgap/paddingを詰め、44pxタップ高とC20ラベルが収まるfont clampを使う。
- 上部長通知を1文へ短縮し、パネル見出しの6 micro、①/②の重複foot、結果の重複note、図の読み方・一覧設計の常時説明を削除した。「数え方・図について」の折畳み（初期は閉じる）にC0・アルデヒド・図の説明を残す。
- 鎖式②の化合物分類カード、①の骨格カード、環式②の置換基preset行は、320px/390pxでも最低2列。①shapeはモバイル2列以上、desktopは `auto-fit` で余裕に応じて多列（固定2列ではない）。対象は `#chain-family-list` / `#chain-shape-list` / `.oc-preset-row` に限定し、その他モードのfamily一覧へは波及させない。カードはmin-width 0・折返し・化学単位境界の改行を維持し、文字極小化や横overflowで解決しない。
- 検証方法の長文は台帳の「収録・検証の詳細」へ移し、メインはリンクのみ。実合成・実験手順ではない注意はfooterに1か所。hazards/SDS・模式図/投影式/一般式可変/情報未登録/データ不備の安全停止は残す。
- **検証**: `scripts/tests/app10-next.test.cjs` を72件に拡張。420件route、フェノキシドイオンのNa非含有graph・専用preset・二重表示、別名2件、family完全名検索、3 familyの固定式なし、OCR metadata、②2列CSS、C0 full-row、点線circle撤去、文言の詳細折畳み、公開core assetのローカル絶対パス0を追加確認する。実カードrectでの2列確認は `test` サブエージェントが行う。`site/app10`・`site/themes` は変更していない。

## 14. 独立PubChem確認7物質と現在427件 — 2026-11-10

- 化合物は **427件**（鎖式157・環式82・その他188）。鎖式デスクリプタは **47件** のまま。内訳は `dimethyl-oxalate`（CID 11120, C4H6O4, diester, 既存shape `d-methanex2-c2`）、`diphenyl-oxalate`（CID 18475, C14H10O4, 2環custom graph, `complex-ring` tray）、`salicin`（CID 439503, C13H18O7, 配糖体）、`1,3-dibromopropane`（CID 8001, C3H6Br2, `d-propane-c3`）、`diethylenetriamine`（CID 8111, C4H13N3, 第一級N2＋第二級N1, `d-ethanex2-c4`）、`adenosine`（CID 60961, C10H13N5O4, リン酸0）、`adp`（CID 6022, C10H15N5O10P2, 中性酸形P2・電荷0）。
- 7物質はOCR 420の候補分類とは別に、PubChem APIでCID・分子式・接続・形式電荷0を独立確認した。`ocr-audit.js` の `INDEPENDENT_ADDITIONS` に7件を分離し、`history.ocrBaselineCompounds=420` と `history.currentCompounds=427` を区別する。過去の419/420/1398/1399は履歴として書き換えない。
- `salicin` / `adenosine` / `adp` は模式図＋identity/stereo metadata。糖の立体中心（salicin 5、adenosine/adp 4）は図では描き分けず、全立体を描いたとは主張しない。`adenosine` はP0、`adp` はP2・電荷0で、ATPのP3/4-表示は変更しない。
- roleは `dimethyl-oxalate=diester`、`diethylenetriamine=amine-1-2` を追加し、一価エステル・第二級アミンだけに丸めない。未知のschematic kindは多糖3環fallbackへ落とさず `data-unsupported-schematic="1"` で停止する。
- 旧`migration-backup/` 8ファイルはリポジトリ外の承認済み退避先へSHA-256一致を確認して移し、現tracked treeから除いた。gitの過去commit履歴には原文・差分が残るため、完全消去は主張しない。
