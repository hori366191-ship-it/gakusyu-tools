# app11 物質カードの構造図 — 実装・coverage記録

- 日付: 2026-11-14
- 対象: `site/app11/structure-draw.js`（新規・凍結コピー）、`site/app11/structure.css`（新規）、
  `site/app11/app.js`、`site/app11/index.html`、`site/app11/data.js`（生成物）、
  `scripts/app11/source-data.cjs`、`scripts/app11/build-map-data.cjs`、
  `scripts/tests/app11-structure.test.cjs`（新規）、既存 app11 テストの script 順更新
- 目的: 物質名タップの詳細カード冒頭にあった formula だけの行を、登録済み構造データによる
  構造図へ置き換える。式を構造式と偽装せず、一般分類カードには具体構造を入れない。

## コピー元と独立性

- `site/app11/structure-draw.js` は `site/app10/draw.js` の凍結コピー。
  - コピー元 commit: `9ef5e0999a73022ed0351303ad2d4944b80df16f`
  - コピー元 SHA256: `861e0fd9fed7593ed07e2adf0a9812168d9dda1130428b91fdd052ab3eeaf11d`
  - 変更: UMD 名前空間 `OCDraw` → `RPStructure`、CSS class `oc-` → `rp-struct-`。
  - 外部化学描画ライブラリへの依存なし。元ファイルに外部由来のライセンス表記はない
    （元の著作権・方針コメントは保持）。
- `index.html` の読み込み順は `data.js` → `map-core.js` → `structure-draw.js` → `app.js`。
  実行時に `site/app10/draw.js` や app10 の JS を読み込まない。
- 構造specは `source-data.cjs` で app10 の `COMPOUNDS` から次の項目だけを深いコピーで抽出する:
  `structure`, `figures`, `formulaVariable`, `formulaDisplay`, `formulaReference`。
  `precursors` / `reactions` / `nature` などの自由文は取り込まない。
- 構造spec（`structure` のみ）は約 89.6KB、複数図 `figures` は 2 物質分。生成後の `data.js` は
  既存の物質・反応・配置データを保持したまま、各 compound に構造項目を追加している。

## 表示区分（`RPStructure.structureView` の実表示基準）

| 区分 | 件数 | カードの見出し | 表示 |
|---|---:|---|---|
| dual | 298 | 構造式 | `plan.full` のSVG |
| atom-limit | 17 | 骨格式（水素原子省略） | 正本specから作った炭素骨格graph（H省略）。graphを作れない場合だけ「示性式（結合図未対応）」 |
| projection / multi | 6 | 投影式（multiは全図） | 投影式。multi は `plan.figures` をすべて表示 |
| triglyceride | 4 | 油脂の簡略図 | グリセリン骨格＋脂肪酸鎖の簡略図 |
| schematic | 58 | 模式図 | 模式図 |
| polymer | 39 | 繰り返し単位 | 繰り返し単位と重合度表記 |
| stereo + complex | 5 | 示性式（詳細構造なし） | `condensed` spec の示性式のみ。構造式と呼ばない |
| 合計 | 427 | — | — |

- 表示メタデータは `RPStructure.structureView(c)` が返す実際のspec種別で決める。
  `figurePlan` の `exception.type` だけで見出しを選ばない。atom-limit 17件は
  `condensedGraphFor` の graph / graphTooLarge、または既存graph specを結合価検証して
  骨格graph化する。単純な直鎖脂肪族（炭素部分グラフが1つのpath・非環・分岐なし）だけを
  対象に、path順の一定間隔で**一度だけ**全体配置する。飽和鎖は折れ線、不飽和鎖は
  全炭素を一列に並べ、炭素頂点とC=Cの `CH` ラベルを表示する。
  以前condensed表示だった14件（eicosane / 長鎖脂肪酸 / SDS / 脂肪酸ナトリウム塩）も
  すべて `data-kind=graph` の炭素結合図になり、`data-kind=condensed` ではない。
- 不飽和鎖の非環状C=Cは、正本specにシス/トランスの明示がない限り、両側の炭素置換基を
  同一直線にそろえて立体未指定とする。多重C=CでもC=Cごとの座標押し込みはせず、
  path全体の配置は1回だけ。sodium-oleate の左右鎖の外積は 0/0
  （以前は +2001.7 / -2001.7 の反対側）で、transを示唆しない。
- 元graph3（carminic-acid / carthamin / heme）は検証済みの描画座標をそのまま保持し、
  新しい正規化を適用しない。環のC=Cも変更しない。明示stereo/投影も対象外。
- 5件の詳細構造なしfallbackは「示性式（詳細構造なし）」、graphを作れない
  atom-limitだけ「示性式（結合図未対応）」と明記する。既存5件と同じ fallback 区分に統合する。
- `structure` が無い場合は formula を構造式として描画せず、「構造データが未整備です」と表示する。
- 一般分類（classMap）のカードには構造図を入れない。物質の構造は compoundCard だけに置く。
- 材料・family は単一固定分子として描画しない。polymer / schematic / triglyceride は
  それぞれ繰り返し単位・模式図・油脂の簡略図として区別する。

## レイアウト

- `renderCompound` は使わず、`renderStructure` のSVG単体をカード内に置く（app10の拡大ボタンは出さない）。
- 通常の図はカード幅に合わせて表示する。viewBox 幅が 460 を超える図は
  `--rp-struct-width` の自然幅でカード内横スクロールにし、縮小で文字を潰さない。
- `.rp-struct__canvas { overflow-x: auto; max-width: 100%; min-width: 0; }` で
  カード外への横溢出を閉じる。色は既存の `--rp-*` 変数だけを使い、3テーマに追従する。
- 骨格式のラベルは SVG text の panel 色 stroke（paint-order: stroke）で背景を持たせ、
  ラベル炭素の結合端点も文字矩形の外へ余白を取る。CH/Na などの文字と線の重なりを防ぐ。
- 反応カードの式表示（`subText → prodText`）と既存の反応・物質・一般図の配置は変更しない。
- カード外タッチでは pointerup で起点ノードへ focus を戻した直後の互換 mousedown を
  capture で1回だけ抑止する（非操作要素のみ）。a/button/input などの操作要素、
  PCの外側click、Escape、位置popoverの復帰は通常のイベント処理を維持する。
  focus復帰のための setTimeout ループは使わない。

## 検証

```powershell
node scripts/app11/build-map-data.cjs --check
node --test scripts/tests/app11-structure.test.cjs
node --test scripts/tests/app11-class-map.test.cjs
node --test scripts/tests/app11-reaction-map.test.cjs
```

- `app11-structure.test.cjs`: 15/15 pass
- app11 の構造・一般図・既存回帰の合計: 67/67 pass
  - 427物質の構造spec、既存 427/294/86 不変
  - figurePlan 区分と実表示区分 298/17/6/4/58/39/5、合計427
  - 骨格式17件が `data-kind=graph` の結合線を持ち、condensedへ落ちない
  - 17骨格の全辺長>epsilon、実SVG line長>0、座標一意、主成分接続、原子価、
    枝交差/非接続辺重なり/非接続原子-辺/ラベル衝突0
  - 元graph3の座標・接続・次数が正本graphと完全一致（normalize変更なし）
  - `structureView` / `renderStructure` が入力を変更せず、2回で同一（ringCenterもdeep copy）
  - 非環状C=Cは両側置換基の外積が反対符号にならず、E/transを示唆しない
  - 全427物質の `structureView` / `renderStructure` がSVGを返し、エラーSVGなし
  - 5件の fallback が condensed 示性式で、構造式と呼ばない
  - タッチ外tap後の互換mousedownで起点focusを守る（操作要素は除外）
  - `RPStructure` 名前空間、app10 JS 非依存、script 順
  - compoundCard の formula 行削除、classCard に構造なし
  - structure.css がテーマ変数だけを使い、横スクロールをカード内に閉じる
- `app11-class-map.test.cjs`: 13/13 pass（一般図12分類16変換、390px fit、anchor含む）
- `app11-reaction-map.test.cjs`: 39/39 pass（既存の配置・経路・件数・決定性）
- `build-map-data.cjs --check`: 一致（物質427・必須294・反応86）
- 反応86・207枝・`layout.json` / `routes.json` の priority hash は不変
  （`optimize-layout.cjs --check` も exit 0）。一般図12分類16変換も不変。

## 残課題

- ブラウザでの最終操作確認（カード内の構造図の実寸、長い図の横スクロール、3テーマ、
  390px、キーボード/Escape/フォーカス復帰、タッチ外tap後のフォーカス復帰）は
  `test` サブエージェントが行う。
- 2026-11-14 の最終test NG（atom-limit 14件の示性式誤ラベル、タッチ外tap後のfocus復帰）を修正した。
  atom-limit 17件は炭素骨格graph、5件の詳細構造なしは示性式fallbackへ整理し、
  タッチ後の互換mousedownは非操作要素だけ既定動作を止める。修正後の最終ブラウザ確認は再実行待ち。
- 2026-11-14 受入r3のNG（sodium-oleate のC=C周囲がtrans配置）を修正した。
  非環状C=Cは立体未指定として両側置換基を同一直線にし、炭素頂点とC=CのCHラベルを表示する。
  環C=Cと明示stereo（シス/トランス表記）は変更しない。
- 2026-11-14 受入r4のNG（linolenic-acid の炭素鎖が一点へ退化、carthamin/heme の
  枝・文字重なり）を修正した。座標押し込みをやめ、単純な直鎖pathだけを全体配置し、
  元graph3は座標を変更しない。全17骨格の辺長・接続・原子価・枝交差・ラベル衝突をunitで検査する。
- SVGの実フォント描画での見え方は上記操作確認に含める。
- 他作業の app10 / design-lab の変更、`scripts/app11/planarity/__pycache__` には触れていない。
  commit / push は未実施。
