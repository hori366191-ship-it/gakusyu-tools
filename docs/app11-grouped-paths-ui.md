# app11 反応グループ表示（runtime 統合）

`site/app11/reaction-groups.js`（pure module、`window.RPReactionGroups`）を使い、
同じ「基質ID集合 → 生成物ID集合」の反応を **表示だけ** 1 つの代表にまとめる。

- グループ判定・代表・`反応 N件` の規則は `docs/app11-reaction-groups.md` が正本。ここは runtime 側の契約。
- `data.js` / `academic-data.js` / `proposed-layout-data.js` / `site-src/app11/*` は変更しない。
- 座標・経路・ラベル位置・反応式・出典は再計算しない。代表の既存 geometry / label.box / leader をそのまま使う。

## 読み込み順

`index.html`: `data.js` → `academic-data.js` → `proposal-contract.js` → `proposed-layout-data.js`
→ **`reaction-groups.js`** → `map-core.js` → `structure-draw.js` → `app.js`。

`reaction-groups.js` が無い・`build` が失敗した場合、`normalGrouping` などは `null` になり、
従来どおり全反応を表示する（fail-safe）。新機能が動いたとは扱わない。

## 表示の層

- `activeReactions()` / `findReaction()` / `incoming` / `outgoing` / カード / 一覧は **元の facts 全件**（162 / 314）のまま。
- `activeGrouping()` が現在のモード・配置の `Groups.build` 結果を返す。
- `displayReactions()` が代表の反応だけを返す。DOM・透明ヒット・SVG ラベル・HTML 補助ラベルはこれだけを対象にする。
- `displayIdFor(memberId)` が代表 ID を返す。単独グループは元 ID のまま。
- `activeReactionIndex()` / `activeEdgeIndex()` は **元 ID の alias を維持**する。
  - `reactionIndex[memberId]` は代表 DOM を返す（選択・キーボード・focus・`entityElement`）。
  - `edgeIndex[memberEdgeKey]` は代表の同じ端点の path を返す（強調）。
  - `Object.keys(reactionIndex)` は 162 / 314 のまま。DOM の数は 156 / 156 / 308。

### 線と当たり判定

`Core.reactionConnectors` → `Core.separateSharedPorts` → `Core.enforcePaintClearance` は
**全元反応** に対して従来どおり実行する。描画・透明ヒット・HTML 補助ラベルだけを代表に絞る。
代表の線は元全件で clearance した後の connector をそのまま使う（事前 filter で再計算しない）。

### 代表への追従

非代表 member を選んでも、`selected.id` は **元の member ID のまま**。

- 選択・`entityElement`・keyboard focus: `activeReactionIndex()[memberId]` → 代表 DOM
- `showReactionStroke(memberId)`: 代表 ID の connector を 1 本だけ描く
- `fitReactionEndpoints` / `focusAfterLayoutSwitch` / `gotoEntity`: 代表の座標へカメラ移動
- `updateEdgeHighlight`: 選択 ID を代表へ解決して path を強調
- モード・配置切替: 元 ID の選択・カード・検索を保つ（`modeHasEntity` は alias で真）

## ラベル・実表示数

| 表示 | facts | グループ DOM | SVG ラベル | 透明ヒット | 索引 |
|---|---:|---:|---:|---:|---:|
| current | 162 | 156 | 75 | 156 | 162 |
| proposed | 162 | 156 | 156 | 156 | 162 |
| academic | 314 | 308 | 308 | 308 | 314 |

- current の SVG ラベルは primary の代表 75（`ethanol-oxidation-acetic` グループは両 member とも
  secondary・ラベル無しのため、グループとしてラベルを出さない）。
- グループの地図ラベルは `group.typeLabel`。全 member の typeLabel が共通なら元名のみ（例「酸化」）を使い、
  末尾に件数注記は追加しない。typeLabel が混在する将来ケースでは、元名に代えて「反応 N件」を用いる。
  いずれの場合も地図に件数注記を出さない（aria-label には含める）。
- `updateOverlay` の補助ラベルも代表だけを対象にし、非表示 member の重複ラベルを残さない。

## カード

`reactionCard(id)` は dispatcher。

- `group.size <= 1`: 従来の `reactionCardOne(r)`（マークアップ不変）。
- `group.size > 1`: `reactionCardGroup(group)`。
  - `h2#rp-card-title` は 1 つだけ（「条件別の反応 N件」）。
  - 共通の基質→生成物、共通端点ボタン、共通 `typeCommon` は 1 回だけ。
  - member ごとに `<section class="rp-card__group-member" data-reaction-id="…">` を置き、
    h3 条件（長い場合は代表試薬）、個別の反応式、試薬・生成物・副生成物・条件・注意・分野・出典、
    evidence、scope、教育レベル、多段階の段階をすべて保持する。
  - 各式は `data-eq-open` の opener を持ち、既存の native dialog で個別に拡大できる。
    opener の aria-label は条件を含めて member ごとに区別する。

物質カードの incoming / outgoing、一覧の反応項目は facts 全件へのアクセスを保ち、
member から開いても同じグループカードになる。

## テスト

```powershell
node --test scripts/tests/app11-grouped-paths-ui.test.cjs
```

実データ（D / P / A）・実 `map-core`・fake DOM で、156 / 156 / 308 の DOM、75 / 156 / 308 のラベル、
代表のみのヒット、元 ID 索引、非代表選択→代表 stroke・座標、グループカードの節と個別式 opener、
単独カードの従来性、データ不変を確認する。既存の幾何 gate（`scripts/app11/metrics.cjs` 等）は
個別 162 反応の geometry を引き続き評価し、この表示グループとは別の層として扱う。
