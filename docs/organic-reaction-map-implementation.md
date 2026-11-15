# 有機反応マップ（試験版）— 実装・検証メモ

> 2026-11-13 の主要バックボーン再設計（tier・平面性検証・太実線/補助点線）は
> `docs/app11-primary-backbone-redesign.md` を参照。本ファイルは v3 時点の記録。

- 版: 2026-11-10（初回実装、同日に反応データの独立検証を反映）／2026-11-12（反応ネットワーク配置に再設計）
- 対象: `site/app11/`（新規）、`site-src/app11/`（新規）、`scripts/app11/`（新規）、
  `scripts/tests/app11-reaction-map.test.cjs`（新規）、`site/app10/index.html` と
  `design-lab/app10-next/index.html`（右上リンクのみ）、`scripts/tests/app10-next.test.cjs`（正規化1行）
- 位置づけ: `docs/organic-reaction-map-requirements.md` の Must を満たす**試験版**。
  同書の「実装なし」は計画時点の境界であり、ユーザー承認のもとで実装・公開対象にした。
  元の要件書は変更していない。

## 1. 実装したもの

| 要件 | 実装 |
|---|---|
| 一枚の地図・俯瞰と拡大 | 単一 SVG キャンバス（10分野・427物質・確認済み反応86件）。ドラッグ／ピンチ／Ctrl+ホイール／ボタン／キーで移動・拡大 |
| 位置の安定 | 座標は `site-src/app11/layout.json` に固定。同じ入力なら再生成しても動かない。物質追加時は `optimize-layout.cjs` を再実行する |
| 分類の保持 | 分野パネルは廃止し、ノード上端の10色の帯・チップの色点・カードの分野名・色付き凡例で示す。チップは反応関連物質の範囲へフィットする |
| 分野横断の接続 | 分野をまたぐ反応は破線。色・線種は CSS 変数（3テーマで上書き）。経路は分断せず、浅い交差だけ小さな橋を付ける。選択中の反応は連続ストロークで上層表示する |
| semantic zoom | 倍率 `<0.5` / `0.5–1.0` / `≥1.0` の3段階。位置は動かさず、主要物質名 → 物質名 → 反応種別・条件の順に現れる。同じ倍率では常に同じ表示 |
| 全体へ戻る／現在位置 | 「全体表示」ボタン、キー `0`、`Home`。現在位置は最寄り物質の分野名・選択中の物質・倍率を常時表示 |
| 反応の追跡 | 反応カードに「この反応の端点を表示」ボタン。カード内の反応項目をホバー／フォーカスすると、その反応の辺だけを連続ストロークで上層表示する |
| フローティングカード | 同一ページの非モーダルカード。外側クリック・Escape・「閉じる」で閉じ、起点ノードへフォーカスを戻す |
| ビルダー遷移 | 物質カードに `../app10/index.html?...&focus=<id>` のリンク。`catalog.js` の `routeFor` とオフラインで照合し、対応が取れない物質はリンクを出さず「ビルダー収録外」と表示 |
| 反応詳細の2層 | 「共通の説明 — <反応種別>」（一般則＋模式図）と「この反応の個別情報」（基質・試薬・生成物・条件・例外）を別セクションに分離 |
| 双方向の追跡 | 物質カードに「この物質の製法」「この物質からの生成物」を件数付きで表示 |
| 状態の区別 | 確認済／未確認／収録外／該当しない の4区分。判断できないものは未確認。0件時は理由を区別して表示し「生成しない」と断定しない |
| 3テーマ | `site/themes/theme.js` の `data-theme` に追従。`site/app11/app.css` 内の `--rp-*` 変数を `html[data-theme="pop"/"forest"]` で上書き。forest は `themes/forest.css` の汎用 `header`（cream 背景・`!important`）と衝突するため、`.rp-header` に限定したセレクタで背景・h1・リンク色を上書きする（共通テーマファイルは変更しない） |
| reduced motion | `@media (prefers-reduced-motion: reduce)` と `matchMedia` 判定。移動アニメーションを即時切替にする |
| モバイル | 760px / 430px のブレークポイント。地図内だけ `touch-action: none`（外側のページスクロールは維持）。390px 幅で横溢れなし |
| アクセシブル一覧・検索 | 名称・示性式・ID で検索。全物質・確認済み反応の一覧を分野／種別ごとに置き、各項目から地図の該当位置へ移動してカードを開ける |

### 分類（本ツール独自）

第三者の系統図の区分・配置は参照していない。反応経路のつながりを優先して、次の10分野に独自設計した。

1. 炭化水素（ハロゲン置換体を含む）
2. 芳香族炭化水素
3. アルコール・エーテル
4. アルデヒド・ケトン・カルボン酸
5. エステル・油脂・セッケン
6. フェノール類・芳香族化合物
7. 窒素化合物
8. 糖類
9. アミノ酸・タンパク質
10. 高分子・材料

分野の割り当ては `site-src/app11/map.json` の `categoryRegions` と `regionOverrides` で決める。

## 2. データ生成（オフライン）

```powershell
node scripts/app11/optimize-layout.cjs          # site-src/app11/layout.json と routes.json を更新
node scripts/app11/optimize-layout.cjs --check  # 同じ入力から同じ出力になるか確認（不一致は exit 1）
node scripts/app11/build-map-data.cjs           # site/app11/data.js を更新
node scripts/app11/build-map-data.cjs --check   # 生成物が最新か確認（差分があれば終了コード1）
```

- `scripts/app11/build-map-data.cjs` は `site/app10/data.js` と `catalog.js` を **ビルド時だけ** 読み、
  物質名・示性式・分類・ID・`routeFor()` の経路だけを抽出する。
  `precursors` / `reactions` / `nature` などの自由文は取り込まない（回帰テストで検査）。
- 反応は `site-src/app11/reactions.json`（本ツール独自データ）だけを根拠にする。
- 出力 `site/app11/data.js` は値だけの静的データで、実行時に `site/app10` を読み込まない。
- 配置は `site-src/app11/layout.json` と `routes.json` が正本。`optimize-layout.cjs` が
  物質の座標・反応マーカー・ラベル位置・全辺の点列を決め、`build-map-data.cjs` はそれを
  `data.js` に埋め込むだけにした。閲覧時に経路を再計算しない。
- 物質を追加したときは `node scripts/app11/optimize-layout.cjs` を再実行する。未再生成のまま
  `build-map-data.cjs` を実行すると、欠けている物質・反応・辺を名指しして停止する（黙って動かさない）。

## 3. 反応データの検証結果（2026-11-10）

- 公開データに載せるのは **`state: "confirmed"` の86反応だけ**。`state: "held"` の81反応は
  `site-src/app11/reactions.json` に保留として残し、`site/app11/data.js` には出力しない。
- 確認済みの反応には `verification`（資料名・節番号・節タイトル・URL・確認日）を内部記録として持ち、
  公開データには **資料名・節番号・確認日だけ** を `sources` として載せる。URL・本文抜粋・画像は公開しない。
- 反応カードには「確認済」と検証記録（例: `OpenStax Organic Chemistry (McMurry) 17.7（2026-11-10 確認）`）を表示する。
- 物質カードの0件表示は「この地図に収録した確認済みの反応の中には見つかっていない」とし、
  「生成しない」「不可能」とは表示しない。427物質はすべて残し、経路がない物質は未確認のまま扱う。
- 反応数と物質数は別項目として扱う（`meta.compoundCount` / `meta.confirmedReactionCount` /
  `meta.heldReactionCount`）。

### 検証に使った資料と節

資料: OpenStax『Organic Chemistry』（John McMurry）。以下の節本文を取得して確認した（確認日 2026-11-10）。
URL は内部記録（`reactions.json` の `source.sections`）にのみ保持する。

| 節 | 内容 | この地図で確認済みにした反応の例 |
|---|---|---|
| 7.7 | アルケンへの求電子付加 | エテン＋HBr→ブロモエタン、アルケン＋水（強酸触媒）→アルコール |
| 7.8 | マルコフニコフ則 | イソブテン＋HCl→2-クロロ-2-メチルプロパン（単一生成物）、水付加の配向 |
| 8.2 | アルケンへの X₂ 付加 | エテン＋Br₂→1,2-ジブロモエタン |
| 8.6 | アルケンの水素化 | エテン／プロペン→アルカン、トリオレイン→トリステアリン（油脂の水素化） |
| 8.10 | ラジカル付加と連鎖成長重合 | エテン→ポリエチレン、プロペン→ポリプロピレン、スチレン→ポリスチレン、塩化ビニル→PVC |
| 9.4 | アルキンの水和 | プロピン＋水（HgSO₄／硫酸）→アセトン（末端アルキンのメチルケトン） |
| 10.2 | アルカンのラジカルハロゲン化 | メタン＋Cl₂（紫外線）→クロロメタン（更なる塩素化で混合物） |
| 16.2 | 芳香族置換 | ベンゼン＋Cl₂／FeCl₃→クロロベンゼン、＋濃硝酸／硫酸→ニトロベンゼン、＋発煙硫酸→ベンゼンスルホン酸、ニトロベンゼンの還元→アニリン |
| 16.8 | 芳香族側鎖の酸化 | p-キシレン＋空気／Co(III)→テレフタル酸 |
| 17.2 | アルコール・フェノールの性質 | フェノール＋NaOH→フェノキシド、フェノキシド＋酸→フェノール |
| 17.4 | カルボニル化合物の還元 | アルデヒド／ケトン＋NaBH₄→アルコール |
| 17.6 | アルコールの反応 | 第三級アルコール＋HCl（0℃）→ハロゲン化物、第三級アルコールの脱水、カルボン酸＋アルコール（強酸触媒）→エステル |
| 17.7 | アルコールの酸化 | 第一級＋Dess–Martin→アルデヒド、第二級→ケトン、第一級＋KMnO₄（加熱）→カルボン酸 |
| 17.9 | フェノールの製法 | クロロベンゼン＋NaOH（高温・高圧）→フェノキシド、クメン→クメンヒドロペルオキシド→フェノール＋アセトン |
| 18.2 | エーテルの製法 | エタノール＋硫酸→ジエチルエーテル |
| 19.3 | アルデヒド・ケトンの酸化 | アルデヒド→カルボン酸、ケトンは酸化されにくい |
| 21.5 | 酸無水物の化学 | サリチル酸＋無水酢酸→アスピリン |
| 21.6 | エステルの化学 | エステルの加水分解・けん化（エチルプロピオナートの例） |
| 24.8 | 芳香族アミンの反応 | アニリン＋無水酢酸→アセトアニリド、ジアゾ化、ジアゾニウム塩とフェノールのカップリング（アゾ化合物。温度条件は記載しない） |
| 25.6 | 単糖の反応 | グルコース＋NaBH₄→ソルビトール、フルクトースの塩基性異性化→グルコース／マンノース |
| 25.8 | 二糖 | スクロースの加水分解→グルコース＋フルクトース、デンプン→マルトース |
| 25.9 | 多糖 | デンプンの酵素加水分解→グルコース |
| 26.4 | ペプチドとタンパク質 | ペプチド結合の形成、シスチン（ジスルフィド結合） |
| 26.5 | ペプチドの分析 | ペプチドの加水分解→アミノ酸 |
| 26.7 | ペプチド合成 | 保護基と縮合剤（DCC/EDC）が必要 |
| 27.2 | セッケン | 油脂のけん化、硬水の Ca・Mg 塩 |
| 31.1 | 連鎖成長重合 | スチレンのアニオン重合（ブチルリチウム） |
| 31.4 | 段階成長重合 | ナイロン66、ナイロン6（カプロラクタムの開環）、PET |

### 確認できず保留にしたもの（公開しない）

- 塩素化・脱水・水和などの一般反応のうち、資料に対応する個別例がないもの（エタン／プロパン／シクロヘキサンの塩素化、エタノールの酸触媒脱水、プロパン-2-オールの脱水など）。
- アルキンへの HX／X₂ の段階付加（資料の個別例がデータにない）。
- アセチレンの水和（末端アルキン一般の扱いから除外）。
- 温度・濃度を確認できなかった条件（ジエチルエーテルの140℃、ジアゾ化の0–5℃など）。条件は確認できた範囲だけを記載し、未確認の数値は書かない。
- 高校範囲を超える、または資料の節に対応がない反応（ニトロ化の異性体分離、フェノールフタレイン合成、ビスフェノールA、メチルオレンジ、コルベ・シュミット、尿素／メラミン／エポキシ／ポリカーボネート／アラミド／シリコーン／SBR などの高分子、発酵、異性化の一部）。
- エステル化は 17.6 の一般的な反応（カルボン酸＋アルコール＋強酸触媒）を、データにある個別の組合せに適用した。フェノールとのエステル化は個別例がないため保留。
- 資料で確認できた内容でも、この地図に収録物質がないため反応として表現していないものがある
  （アルドン酸・アルダル酸・糖のアセチル化物・グリコシド、2,4,6-トリブロモアニリン、ニンヒドリンの呈色、
  硬水の Ca・Mg 塩など）。物質を追加するときに反応も追加する。

## 4. 検証したこと

- `node --test scripts/tests/app11-reaction-map.test.cjs`（2026-11-12 に17件→25件へ更新、約25秒）
  - 427物質・必須294件の収録、app10 自由文を流用していないこと
  - 公開反応がすべて確認済みで、資料名・節・確認日をもつこと／保留を公開していないこと
  - 反応ID・種別・物質IDの整合、条件に実験手順・試薬量がないこと
  - 座標の重複なし、接続101件のネットワーク配置、孤立326件の外縁棚、分野の色index/focus
  - `routeFor` とビルダーリンク（`focus` 必須）の一致、対応なしはリンクしないこと
  - semantic zoom の境界、位置変換の可逆性、全体復帰・現在位置・検索
  - 0件理由の区別（未確認／収録外／該当しない）と断定回避
  - 3テーマ・reduced motion・390px 幅の規約、読込順・相対依存の存在
  - 生成物（`data.js` / `layout.json`）が最新であること
  - app10 右上リンクと design-lab の同期
- `node --test scripts/tests/app10-next.test.cjs`（93件）と
  `node --test scripts/tests/app10-organic.test.cjs`（83件）が通過（リンク追加の影響なし）。
- ヘッドレス（Chrome + puppeteer-core）でローカル配信を確認:
  初期表示・分野チップでの移動・実クリックでカードが開く・外側クリックと Escape で閉じて
  起点ノードへフォーカス復帰・検索からの一覧操作・反応カードの2層表示と検証記録・
  3テーマの描画・reduced motion 時の即時切替・390px 幅の横溢れなし（`scrollWidth - innerWidth = 0`）。
  コンソールエラーなし。

## 5. 未対応・注意

- 保留81反応の再検証。資料の節を追加して確認できたものだけ `state: "confirmed"` に変え、
  `node scripts/app11/build-map-data.cjs` を再実行する。
- 機構図（電子の動き）は収録しない。模式図のみで、UI 上もラベルで区別している。
- 状態の URL 反映・復元、印刷／PDF 全体図、ミニマップは未対応（要件の候補項目）。
- ポータル（`site/index.html`）へのカード追加は行っていない。`site/app11/` は Pages の配信対象に
  含まれるため、直接の URL では閲覧できる。
- `site-gas/`・`site-worker/`・`site/themes/`・`tokens/` は変更していない。

## 6. 反応ネットワーク配置への再設計（2026-11-12 改訂）

初回の「分野パネル＋スロット格子＋チャネル配線」は、分野の枠を維持するために
交差と分断が増え、全体縮小率も14%まで落ちた。分類パネルを廃止し、**反応に関与する
101物質と86反応を1つの2部グラフ**としてレイアウトする方式に変えた。孤立326物質は
右側のコンパクトな棚に置く（単一キャンバス・削除なし・重複なし）。

| ファイル | 役割 |
|---|---|
| `scripts/app11/network-layout.cjs` | 力配置・成分詰め・孤立棚・ラベル側・ポート・可視グラフ配線・橋 |
| `scripts/app11/geometry.cjs` | ラベル幅、矩形/線分交差、距離、折れ線、`labelLayout` など |
| `scripts/app11/metrics.cjs` | 改善前後を同じ計算で測る計測器（橋・浅い交差を含む） |
| `scripts/app11/layout-format.cjs` | `layout.json` / `routes.json` の正規形 |
| `scripts/app11/source-data.cjs` | app10 と reactions.json からの共通抽出 |
| `scripts/app11/build-map-data.cjs` | 生成物を `data.js` に埋め込むだけ（再計算しない） |

### 6.1 配置

- **力配置**: 物質（136×34）と反応（ラベル矩形を含む）をノードとし、反応-端点の辺を
  バネ、全ノード間に近距離斥力と矩形衝突を課す。固定seed 11011、900反復、決定的。
- **成分**: 13個の連結成分に分かれ、最大126ノード。成分ごとに配置してから、
  最大成分の右側に残りを詰める。
- **孤立物質**: 反応に関与しない326件を、右側の10列×33行の棚へ分野順・ID順に配置。
  反応ネットワークの通路に置かない。
- **分類**: 分野パネルは描かない。ノード上端の色帯（10色）、分野チップの色点、
  カード内の分野名、色付き凡例で保持する。チップは「その分野の反応関連物質＋反応ラベル」
  の範囲（`focus`）へフィットし、該当ノードの枠も強調する。
- **反応ラベル**: 入射辺の角度を見て、辺が来ない側（N/S/E/W）へ種別と条件を置く。
  ラベル同士・ノード・他マーカーとの矩形衝突を避ける。
- **ハブ**: 高次数の物質は1ノードのまま。周囲の反応は角度順にポートを分散し、
  適切な間隔で隣接させる。

### 6.2 配線

- ノードは辺の方向に応じて四辺へポートを分散。マーカーはラベルを避けた角度に
  円周ポートを置く。
- 直線がノード・ラベル・他マーカーに当たる辺だけ、可視グラフ（障害物の角＋端点）で
  最短の迂回経路を選ぶ。当たらない辺は直線のまま。
- 同一区間の重なりは、レーン（4〜20px）を変えた再配線で解消する。切れ目（gaps）は使わない。
- 交差は連続のまま描く。**浅い交差（25°未満）だけ**小さな橋（バンプ）を付ける。
  橋は辺を分断せず、`routePath` が小さな円弧として描く。
- 選択中の反応は、最上層に**切れ目・橋なしの連続ストローク**を重ねる。
  物質選択時は接続辺を太くし、カード内の反応項目のホバーでもその反応だけを上層表示する。
- 反応カードに「この反応の端点を表示」ボタンを置き、端点群＋マーカーをfitする。
  ラベルが読めない倍率になった場合は、ツールバーの「全体表示」で戻せる。

### 6.3 改善前後（同じ `metrics.cjs`）

> v3最終結果は **交差379**（`metrics.cjs`、共有ノードの32pxポート扇を除外する定義）。
> 残る4px未満の近接は **146**。回帰テストは修正前435件で、今回の追加後は `test` が確認する。
> 以下は `metrics.cjs` の値。

改善前は `scripts/tests/fixtures/app11-baseline/scene.json`（layout v1）を
`node scripts/app11/metrics.cjs --baseline` で測る。

| 指標 | 改善前 | 今回（ネットワーク配置） |
|---|---:|---:|
| 無関係ノード貫通 | 663 | **0** |
| 反応ラベル貫通 | 514 | **0** |
| 分野見出し貫通 | 23 | **0**（見出しパネルを廃止） |
| 他マーカー貫通 | 78 | **0** |
| マーカー衝突（物質/相互/ラベル-物質/ラベル-ラベル/ラベル-マーカー/見出し） | 56/14/168/68/52/2 | **0/0/0/0/0/0** |
| ノード重なり | 0 | 0 |
| 同一区間の連続重なり | 1区間 5.3px | **0** |
| 交差 | 902 | **379（−58%）** |
| 浅い交差（25°未満） | 197 | 75（**すべて橋あり**） |
| 切れ目（gaps）を使う辺 | — | **0** |
| 最も混雑した600px区画の交差 | 467 | **191（−59%）** |
| 最も混雑した400px区画の交差 | 255 | **160（−37%）** |
| 辺間クリアランス不足（4px未満） | 1,186 | 146（最小0.05px）**※0ではない** |
| 総辺長 | 105,652px | **43,261px（−59%）** |
| 曲がり（合計/平均/最大） | 0 / 0 / 0 | 242 / **1.17** / 9 |
| 全体fit（1236×475） | 約14%（旧v2） | **約24.5%** |

- 反応の事実・427物質・必須294・確認済86・ビルダーのfocus経路は変えていない。
- 全427物質が40px以上移動した（一度きりの再配置）。以後は `layout.json` が固定座標の正本。
- 交差は総数・最混雑区画とも大幅に減り、辺長も改善前より短い。折れは平均1.17で、
  直線に近い辺が多い。
- `clearance` 146件は残る。狭いラベル間・ノード間で4pxを確保できない箇所があり、
  必要なら斥力・衝突マージンを増やして再生成する。

**初回最適化（旧v2・不採用）との比較**

| 指標 | 旧v2（パネル＋チャネル配線） |
|---|---:|
| 交差 | 1,143 |
| 切れ目を使う辺 | 約147 |
| 総辺長 | 145,925px |
| 全体fit（1236×475） | 約14% |
| 曲がり平均 | 7.38 |
| 辺間クリアランス不足 | 219 |

旧v2はノード・ラベル貫通こそ0だったが、同一色の束・分断・縮小率で読解性を損なったため、
分類パネルを外してネットワーク配置へ作り直した。今回のv3は、旧v2比で交差−67%、
辺長−70%、切れ目0、全体fit約24.5%である。

### 6.4 生成と検証

```powershell
node scripts/app11/optimize-layout.cjs          # layout.json / routes.json
node scripts/app11/optimize-layout.cjs --check  # 同じ入力から完全一致するか
node scripts/app11/build-map-data.cjs           # data.js
node scripts/app11/build-map-data.cjs --check
node scripts/app11/metrics.cjs                  # 現在の計測
node scripts/app11/metrics.cjs --baseline       # v1 の計測
```

`node --test scripts/tests/app11-reaction-map.test.cjs`（25件、約25秒）:

- 427物質・必須294・確認済86・分野横断55・ビルダー経路の不変
- 改善前後の同一計測（貫通・衝突・重なり0、交差50%未満、浅い交差の橋、gaps 0）
- ノードの非重複、孤立326件の棚、接続101件のネットワーク側配置
- 反応ラベルの側・中心座標、207辺の点列・橋、layout/routes/data の生成一致
- 固定seedの再生成完全一致、`routePath` の橋、390px幅の全体フィット
- 3テーマ・reduced motion・モバイル・キーボード・フォーカス・カードの既存規約

ブラウザでの実操作（パン・ズーム・カード・選択ストローク・テーマ・390px）は
`test` サブエージェントが担当する。この作業ではローカルの静的・幾何検証まで行い、
デプロイ・公開はしていない。

### 6.5 残課題

- 辺間クリアランス不足146件（最小0.05px）は0ではない。ラベル矩形とノードの間の
  狭い箇所が中心で、ラベル配置の局所探索を追加すれば減らせる。
- 交差379は目標（baselineの50%未満）を満たすが、まだ多い。特に成分をまたぐ長い辺は
  折れが増えやすい。
- 浅い交差75に橋を付けるため、データ上は75個の橋座標を持つ。選択ストロークで
  個別反応をたどれるが、全体俯瞰では交差の密度が残る。
- 反応ラベルは拡大時（level 2）に表示する。全体俯瞰では主要物質のラベルだけ。
- v3最終結果は交差379（`metrics.cjs`、共有ノード32px除外定義）。
  残る4px未満の近接は146件で、0ではない。回帰テストは修正前435件で、今回の追加後は `test` が確認する。
- 未選択時（物質・反応を選んでいない状態）は、次数の高いハブ周辺に反応・ラベルが密集しやすい。
  選択ストロークで個別反応は追えるが、全体俯瞰では混雑が残る。
- 保留81反応は未公開のまま（`site-src/app11/reactions.json` に保持し、`data.js` には出力しない）。
- `optimize-layout.cjs` は約8秒。データ更新時のみ実行する。

## 7. モバイル現在位置の折返し修正（2026-11-13）

- 現在位置は常に2行固定（1行目=現在位置の省略表示、2行目=詳細度の説明）。省略はCSSの
  `text-overflow: ellipsis` だけで行い、全文はDOMに残す。`Core.positionText` の引数・仕様は変えない。
- 全文は起点ボタンの下に絶対配置のpopoverで表示する。起点ボタンは通常フローのままなので、
  開閉してもtoolbarの高さと地図の上端は動かない。外側タップ／Escapeで閉じ、`aria-expanded` と
  フォーカスを起点へ戻す。長文は `max-width` / `max-height` / `overflow-wrap` で画面外へ出さない。
- 表示更新は `textContent` の差分のみ（毎フレームの `innerHTML` 差し替えをやめた）。`aria-live` は
  表示と分離し、パン・ズームが落ち着いてから500ms後に1回だけ通知する。
- 回帰: `node --test --test-name-pattern="\[(static|core|state)\]" scripts/tests/app11-reaction-map.test.cjs`。
  実操作（長短名・3種の説明・popover・390px幅）は `test` サブエージェントが確認する。

## connector 接続規則（2026-11-15 追加・未公開）

保存データを変えず、描画だけを「反応の丸」から「物質枠 → 線 → 物質枠」へ揃えた記録。
正本は `site/app11/map-core.js` の `CONNECTOR` / `reactionConnectors` / `classConnector`。

### 不変条件
- 207 辺 / 86 反応 / 一般図 16 変換、`data.js` の保存点列は変更しない。
- 主要は太線、補助は点線。PP（primary-primary）交差 0 を維持する。
- 一般図の座標・配置・16 タップ対象は変えない。

### 幾何
1. 保存点列の半径10（反応ハブ）は描画に使わず、ハブ中心で連続させる。
2. 物質側は rx=9 の角丸外周へ置く。角丸に入るポートは円弧上の点にする。
3. 1入力1出力で同一 tier はハブ中心を通る1本の連続 path。それ以外は分枝し、
   入力は矢印なし、出力だけ生成物向きの triangle を付ける。
4. 線端は butt。丸 cap の stroke/2 が枠や tip へはみ出さない。
5. 矢印は marker-end ではなく、shaft と分離した triangle を別 path で描く。
   shaft は triangle の底まで trim。triangle は primary 7 / secondary 5.5 / class 6、
   最終線分が短い場合は `min(nominal, max(4, full - 1.5))`。向きは最終線分の tangent。
6. `EDGE_GAP = 0.75`。ノード境界 stroke は concrete 1.2 / hub 1.6 / class 1.4 で
   **全 state 一定**にし、選択・hover・focus は stroke 色と drop-shadow halo で示す。
   これにより tip と source butt 端の実 gap は concrete/hub/class すべて 0.75。\n   path は 0.01 world 精度で出力するため、丸め誤差は拡大3倍でも < 0.02 CSS px。
   edge stroke の primary 3 / active 4.4 / secondary 破線は従来どおり。
   ただし中心点の gap だけでは斜め入射の butt 端面や triangle の翼が内側へ入るため、
    `enforcePaintClearance()` が source butt 端面全体・destination triangle 全3辺と shaft 全長を
    角丸矩形 SDF（線分は三分探索で最小化）で検査する。source は外向き法線方向へ必要最小だけ押し、
    destination はノード法線方向の局所 stub と必要最小の head 長で逃がす。
    `MAX_PAINT_STROKE` は secondary も active 4.4。SDF 基準は「角丸矩形中心線 - 実ノード stroke/2」に統一し、
    shaft はさらに線幅/2を一度だけ引く。生成時は `PAINT_SAFETY=0.01` を加え、path 出力は 0.01 world 精度。
    その結果 actual paint gap は全 source butt / triangle / shaft / class で 0.76 以上。

### 近接ポート
`separateSharedPorts()` が保存点列を変えず、描画端点だけを分ける。
- `PORT_CLUSTER = 12` 以内を同じ cluster にし、出て行く向き（隣接点）順に
  `PORT_SPACING = 7` で角丸輪郭上へ置く。
- 同一反応内の合流（反応ハブ）は対象外。
- 受入ラスタで重なりが確認された次の2組を解消:
  acetic-acid-glycerol-esterification × tripalmitin-saponification、
  glycerol-oleic-esterification × glycerol-stearic-esterification。

### 選択・プレビュー
`buildConnectors()` の connector を通常・選択・プレビューで共有する。
`showReactionStroke()` は同じ `shaft` / `arrowHead` を active レイヤーへ描くだけで、
保存点列から別 geometry を作らない。

### カンマ入りID
`data-compounds` は JSON 配列。`Core.compoundList()` で復元し、`split(',')` は使わない
（例: `1,2-dibromoethane`）。`connectorMatchesCompound()` で全 427 ID の highlight を検証する。

### 検査
`node --test scripts/tests/app11-connectors.test.cjs`
- 207/86/16 不変、角丸・斜め・short stub・multi・reactant only・選択共通化
- 実描画 path sampling の PP0、node/label 貫通 0（stroke halo + arrow 外形）、
- 実 paint 形状の source butt 端面・triangle 全3辺・shaft 全長 gap >= 0.75（斜めbutt / 受入NG triangle 4件を含む）
- 実 paint 形状の source butt 端面・triangle 全頂点 gap >= 0.75（斜めbutt / 受入NG triangle 4件を含む）
- 一般図16、カンマID、全427 ID の highlight 往復、短い最終線分の triangle
- 3テーマ/mobile/エラー表示は test サブエージェントで最終確認

## 反応線の当たり判定と注意枠の位置（2026-11-15 追加・未公開）

ユーザー承認済みの2点を実装した記録。公開（デプロイ反映）はまだ行っていない。

### 対象と不変条件
- 対象は `site/app11/app.js` / `app.css` / `index.html` / `map-core.js` と `scripts/tests/app11-*.cjs`、`docs/` のみ。
- `structure-draw.js`、`data.js`（427物質・294必須・86反応・保留81・一般図12分類16変換）は変更しない。
  端点半径・paint 形状・`enforcePaintClearance` など既存の geometry 計算も変えない。
- 可視線（`.rp-edge`）の幅・色・点線・端点、一般図の座標・配置・16タブは変更前と同一。

### 1. 反応の具体図も一般図と同じ「見えない画面18px幅」で開く
- 反応マーカーの円ヒット（`.rp-reaction__hit`、r=12/22）を廃止した。円は元々 `fill: transparent` で、
  ラベルの無い36反応はこの円だけがタップ対象だったため、代わりに線そのものへ当たり判定を移した。
- `buildReactions()` が connector（158枝）ごとに `path.rp-edge-hit` を1本置く。`d` は可視線と同じ
  `routePath(shaft, gaps, bridges)` に `Core.arrowHeadPath()` の triangle を足したもので、線も矢印も覆う。
- 定義は一般図の `.rp-classmap__edge-hit` と共有: `fill:none / stroke:transparent / stroke-width:18 /
  round cap・join / pointer-events:stroke / vector-effect:non-scaling-stroke`。幅は `HIT_WIDTH = Core.HIT_WIDTH = 18`。
- LOD で無効化しない（旧 `.rp-map[data-level="0"] .rp-reaction__hit{display:none}` は削除）。
  低倍率でも線から開け、届かない密集は拡大・一覧・ラベルで到達する。

### 2. 重なった18pxヒットは DOM 順ではなく最近傍の可視線で決める
- 18px（半径9px）の帯は近接する反応同士で重なるため、`elementsFromPoint` の順（DOM 順）では
  遠い長い枝を誤選択する。`onPointerDown` は触れたヒットから `nearestHitAt(kind, point)` を引き、
  `Core.nearestHit()` が「タップ位置と可視線形状（shaft + triangle の折れ線）の画面距離」で選ぶ。
- 距離は画面ピクセル基準（world 距離 ÷ `view.scale`、半径 = `9 / scale`）。8px は選び、10px は選ばない。
- 同じ反応 ID の複数枝は同じ反応（最短距離を採用）。同距離の別反応は `data.js` の反応順（order）で安定化。
- `Core.resolveHitTarget()`: 反応ラベル・物質ノード・一般図ノードの直接タップは無条件で優先し、
  透明ヒットのときだけ最近傍へ置き換える。開く対象・`returnFocus` はヒット path ではなく
  `reactionIndex[id]`（role=button / tabindex=0 / aria-label）のフォーカス可能な実体へ戻す。
- DOM 描画順は「可視線 → 透明ヒット → 反応ラベル（マーカー）→ 物質ノード」。透明ヒットに tabindex は足さず、
  フォーカス可能な反応は従来どおり86個。パン（>4px）とピンチは従来どおり click を抑止する。

### 3. 「試験版です」注意枠を地図の直後へ移動
- `index.html` の `#rp-data-notice` ブロックを、`.rp-wrap` 先頭（地図の上）から `.rp-map-panel` の直後・
  物質一覧の前へ移動した。DOM 全文（`rp-data-summary` / `rp-data-note` / 文章）は移動前と同一で、
  `buildNotice()` も変更していない（427物質・保留81などの文言は `data.js` の meta から生成）。
- 地図の上に注意枠は残さない。`.rp-notice` の margin を `14px 0` にし、`.rp-map-panel + .rp-notice` で
  上マージン14pxを明示（密着させない）。現在位置や popover、フォーカス挙動は変更なし。

### 4. 検査
- `node --test scripts/tests/app11-hit-targets.test.cjs`（新規12件）: 半径9pxの厳密性（8px選択 / 10px非選択）、
  実在の近接ペア `ethanol-oxidation-ethanal` と `ethanal-reduction` の最近傍選択、同一反応の枝の重複排除、
  同距離 tie の安定性、カンマ入り ID、拡大0.2〜3倍での画面px換算、ラベル・ノード優先、
  18px 共有定義、描画順、data.js / 注意枠 DOM の全文ハッシュ不変、注意枠の順序と margin。
- 既存: `app11-connectors`（22件）の円ヒット前提の assert を、18px 幅・円廃止・フォーカス維持へ更新。
  `app11-class-map` 19件 / `app11-structure` 15件 は変更なしで通過。
- ヘッドレスChrome（1280×900 / 390×844）でのスモーク: 反応線158本・反応マーカー86個（tabindex付き）・
  一般図の変換16・物質427のままで、線の中ほど20点のタップがすべて期待どおりの反応を開いた。
  近接ペア（fit倍率で線間 1.3px）でも `ethanol-oxidation-ethanal` を正しく選択。矢印のtriangle内タップ、
  反応ラベルの直タップ、物質ノードの直タップ（線より優先）、>4pxのドラッグで開かないこと、
  低倍率（fit後さらに縮小）での線タップ、一般図の変換タップ、カードを閉じた後のフォーカス復帰
  （`data-kind="reaction"` の実体へ戻る）、390px で横はみ出し0・注意枠が地図の直後14px、
  コンソールエラー0 を確認した。

### 未確認・残課題
- 実機タッチ（指）での精度と、18px 帯が密集する箇所での選び分けは `test` サブエージェントの最終確認に回す。
- `app11-reaction-map` 39件は通過。実行中に別作業が `site/app10` / `design-lab/app10-next` を編集中で
  一時的に1件落ちたが、単独・再実行では通過しており、app11 側の変更とは無関係。
- デプロイ・公開は未実施（本番公開候補のまま）。

## final UI test の NG 3種の修正（2026-11-15 追加・未公開）

最終 UI テスト（`Temp/opencode/shot/app11-hit-notice-final/REPORT.md`）で見つかった3種だけを修正した。
具体図の色・幅・端点・geometry、`data.js`、一般図の配置、注意枠の DOM/文言は変更していない。

### 1. 一般図の候補選択が DOM 順依存だった
- 原因: `pickDownEntity()` が「解決後の `[data-kind]` 要素」の classList で線ヒットを判定していたため、
  一般図では常にグループ（`.rp-classmap__edge-group`）が返り、`isHitPath=false` のまま DOM 順の先頭が勝っていた。
- 修正: 触れた要素側から `HIT_LINE_SELECTOR`（`.rp-edge-hit / .rp-edge / .rp-classmap__edge-hit /
  .rp-classmap__edge`）で線ヒットを取り、反応・一般図の両方で同じ `nearestHitAt()` を通す。
  一般図の透明ヒット自身へ `data-kind="class-edge"` / `data-id` を付与し、無い場合は `closest('[data-kind]')` で補う。
  一般図のラベル（テキスト）は線ヒットに該当しないため、従来どおり直接ヒットとして無条件優先。
- 実測: fit 倍率 0.1993 で `alkene-alkane`（距離0）と `primary-alcohol-alkene`（5.447px）が重なる点を
  実マウスでクリックし `alkene-alkane` を選択（修正前は DOM 順で別の変換）。候補順を反転しても同じ結果。

### 2. 矢印 triangle の内部が距離0で評価されていなかった
- 原因: 距離判定が「輪郭の折れ線」だけで、しかも `samplePath` は `Z` の閉じ辺を落とすため三角形の1辺が未計測。
  塗りの内部（重心）は輪郭から 1〜2px 離れており、近くを通る別反応の線（1px 未満）に負けていた。
- 修正: 矢印を「描画と同じ頂点（`tip/left/right`）」の塗り多角形として距離計算に持ち、
  内部は ray casting（`Core.pointInPolygon`）で距離0、輪郭は3辺すべてを測る。
  hit path の `d` と距離用 geometry は `connector.__hitShape` に一度だけ作って共有する（一般図も同じ関数）。
- 同距離0のときは線を優先し、最後は反応順（order）で安定化。同じ反応の複数枝は同じ反応。
- 実測: 見えている triangle 重心 71/71 が自分の反応を選択（`tripalmitin-saponification` /
  `aspirin-hydrolysis` / `ethyl-acetate-hydrolysis` を含む）。覆われている27点は対象外（final UI test と同じ扱い）。

### 3. 線のダブルクリックで拡大とカードが同時に起きていた
- 原因: `dblclick` が無条件に地図を拡大し、クリックで開いたカードと競合していた。
- 修正: `Core.dblclickAction(isEntity, isControl)` を追加し、実体（線・矢印・ラベル・物質・一般図）と
  操作要素（凡例・ヒント・一般図ジャンプ）の上では拡大しない。背景だけ従来どおり拡大し、カードは開かない。
  単一クリックの応答（カード即時オープン）は遅延させない。ヒント文にはダブルクリックの記載がないため変更なし。
- 実測: 線・ラベル・ノードの dblclick で倍率不変（0.1993 のまま）。背景 dblclick は 0.1993→0.3188。
  線の連続2クリックも倍率不変でカードのみ開く。

### 4. 回帰
- `node --test scripts/tests/app11-hit-targets.test.cjs`（19件）: 幅18pxの厳密性（8px選択 / 10px非選択）、
  world→screen の半径一致（曲線含む・0.2/1/3倍）、一般図の候補順反転で同一選択、実在の近接ペア、
  三角形の内部/辺/外側近点/重なり、全 triangle 重心が自分の反応、dblclick の対象別判定、
  `data.js` と注意枠 DOM のハッシュ不変、描画順、LOD 非無効化。
- 既存: `app11-connectors` 22 / `app11-class-map` 19 / `app11-reaction-map` 39 / `app11-structure` 15 すべて pass。
- 具体図の再確認: 158枝の線中央タップが fit で 158/158 正解、拡大後も可視 63/63 正解。
  ラベル/ノードの直接タップ、ドラッグ非オープン、低倍率、一般図キーボード、390px（はみ出し0・注意枠14px）も維持。

### 未確認・申し送り
- 最終受け入れ（3テーマ×2サイズ×4倍率の全マトリクス、指タッチの再ターゲット）は `test` サブエージェントが再実行する。
- 実機の指タッチは Chromium の touch adjustment で近傍の意味要素へ寄ることがあり、クリック精度の保証とは別扱い。
- 並行作業の app10 変更（staged）には触れていない。commit / push / デプロイは未実施。

## 実座標（physical）での当たり解決へ統一（2026-11-15 追加・未公開）

再テスト（`Temp/opencode/shot/app11-hit-notice-fixed/REPORT.md`）の残り2種は、どちらも
「`event.target` を信じていた」ことが原因だった。共通の解決に置き換えた。

### 原因
1. 実体のダブルクリック: `mapEl.setPointerCapture()` により `dblclick.target` が `#rp-map` に付け替えられ、
   `event.target` だけを見る判定では「背景」と誤認して拡大していた（カードも同時に開く）。
2. 390px の指タッチ: Chromium の touch adjustment で `pointerdown.target` が近傍の `rp-node__box` に変わり、
   物理点は矢印の塗り内部でそのノードの外側なのに、補正後の target を優先して別の物質を開いていた。

### 解法（共通化）
- `resolvePhysicalAt(clientX, clientY)` を追加し、**pointerdown と dblclick の両方**で `event.target` ではなく
  実 client 座標から決め直す。`document.elementsFromPoint()` は pointer capture / touch adjustment の
  補正を受けない幾何クエリなので、その候補列（描画順＝上から）を `Core.resolvePhysicalTarget()` に渡す。
- 候補は「実 point がその形状の内側か」を必ず検証する。SVG は `isPointInFill()` / `isPointInStroke()`、
  テキストは実 `getBoundingClientRect()`。物質ノードは `rx=9` の塗り／輪郭で判定するため、
  drop-shadow / hover halo の見た目とは混同しない。内側でない候補（`inside:false`）は捨てる。
- 優先順は描画順のまま: 物理的に内側の **ノード／ラベルが最優先**、次に **線**（透明ヒット or 可視線）、
  操作要素（凡例・ヒント・一般図ジャンプ・button 等）は実 point がその中にあるときだけ control として維持。
- 線は従来どおり `nearestHitAt()`（画面18px＝半径9px、矢印 triangle 内部は距離0）で最近傍を選ぶ。
  線が候補列に無い場合も、全候補のうち距離0（塗り内部・線の上）だけを拾うフォールバックを持つ。
  背景タップで近くの線を拾わないよう、距離>0 は採用しない。
- dblclick は同じ resolver を実座標で再評価し、`entity`/`line` なら **拡大しない（カード操作のみ）**、
  `background` なら **拡大のみ（カードなし）**、`control` なら何もしない。capture で target が
  `#rp-map` に変わっても誤って背景扱いにしない。`downEntity` 保存・>4px パン抑止・ピンチ抑止は変更なし。

### 検証（実測）
- 旧NG1（entity ダブルクリック）: **実マウスの本物の dblclick**（`count:2`）で、線・ラベル・ノードの
  いずれも倍率 0.1993 のまま（拡大なし）でカードが開く。このとき `dblclick.target` は実際に `rp-map`。
  背景の dblclick は 0.1993→0.3188 でカードは開かない。連続2クリックも倍率不変＋カードのみ。
- 旧NG2（指タッチの取り違え）: 390px・CDP native touch で矢印重心をタップ。`pointerdown.target` は
  **`rp-node__box`（acetic-acid）に補正されている**のに、選択は `ethyl-acetate-hydrolysis`（物理点の矢印）。
  `tripalmitin-saponification` / `aspirin-hydrolysis` / `ethyl-acetate-hydrolysis` の 3件 × 倍率1・1.5 で 6/6 正解。
- 回帰: 具体図158枝の線中央タップ fit 158/158・拡大後 63/63、一般図の近接（0 vs 5.447px）で距離0を選択、
  可視 triangle 重心 71/71 が自分の反応、ノード直タップ優先、>4px ドラッグ非オープン、低倍率、
  一般図キーボード、390px（はみ出し0・注意枠14px）、コンソールエラー0。
- 単体: `app11-hit-targets` 23件（+4: 物理候補解決、旧NG triangle の枠外検証、dblclick の retarget 相当、
  `event.target` 非依存の静的検査）、`app11-connectors` 22 / `app11-class-map` 19 / `app11-reaction-map` 39 /
  `app11-structure` 15 すべて pass。

### 不変
- 可視線の幅・色・破線・端点・矢印・geometry、`data.js`、一般図の配置、注意枠の DOM/文言は変更なし。
  当たり判定は画面18px（半径9px）のまま。フォーカス可能な反応86・hit のタブストップ0 も維持。

### 申し送り
- 3テーマ×2サイズ×4倍率の全マトリクスと実機の指タッチは `test` サブエージェントが再実行する。
- `elementsFromPoint` は主要ブラウザで利用可。未対応環境では従来の `elementFromPoint` 相当にフォールバックし、
  その場合は物理候補が1件だけになる。
- 並行作業の app10 変更には触れていない。commit / push / デプロイは未実施。
