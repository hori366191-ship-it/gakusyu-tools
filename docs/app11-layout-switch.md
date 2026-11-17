# app11 配置切替（現在の配置 / 新しい配置案）

対象: `site/app11/app.js` / `index.html` / `app.css`、`scripts/tests/app11-layout-switch-ui.test.cjs`、
`scripts/tests/app11-newlabelcsscontract.test.cjs`

## 画面

- ツールバーに「表示モード」（通常 / アカデミック）とは別のグループ「反応と物質の配置」を置く。
  - `#rp-layout-current`「現在の配置」（初期選択）
  - `#rp-layout-proposed`「新しい配置案」
- 初期は常に `current`。URL パラメータ・ブラウザ保存は使わない（現行の初期表示保証を変えない）。
- アカデミック表示は専用配置なので、配置ボタンは両方 `disabled`。理由は `title` と
  `aria-label`（「…（学術表示は専用配置）」）で示す。通常へ戻すと直前の選択を復元する。
- 切替時は選択中の物質・反応 ID、開いているカード、検索入力と検索結果の DOM を保つ。
  選択があれば新しい座標へ寄せ、無ければ `fitModeCanvasView()`（配置の canvas 全体）へ戻す。
  ホイールの累積目標と進行中の `animateTo` は切替前に捨てる。
- キーボード focus は、切替後に隠れるレイヤー（通常 / 配置案 / 学術）にあるときだけ地図へ移す
  （`moveFocusOutOfHiddenLayer()`）。表示され続けるレイヤーの focus は動かさない。

## 配置案データ

`site/app11/proposed-layout-data.js` が `window.RPMapLayoutProposal` を定義する（B 担当の事前生成物）。
契約・検証は共有 module `site/app11/proposal-contract.js`（`window.RPMapProposalContract`、Node では require）を使い、
app.js 側で実装を重複させない。

読み込み順:
`data.js` → `academic-data.js` → `proposal-contract.js` → `proposed-layout-data.js` → `map-core.js` →
`structure-draw.js` → `app.js`

```js
window.RPMapLayoutProposal = {
  version: 1,
  kind: 'normal-proposed',
  base: { normalVersion, compoundCount: 427, reactionCount: 162,
          reactionHash, nodeIdHash, classMapHash },
  positions: { [compoundId]: { x, y, w, h } },              // 427
  markers:   { [reactionId]: { x, y, tier, label: {
                 side, type: { x, y }, cond, box: { x, y, w, h },
                 anchor /* 'center' | 'start' | 'end' 任意 */,
                 leader /* [[x,y], …] 任意 */ } } },         // 162（全件ラベルあり）
  routes:    { 'rid|in|compoundId' | 'rid|out|compoundId':
                 { reaction, dir, compound, tier, points, gaps, bridges } }, // 375
  canvas, regionFocus, stats, warnings
};
```

化学データは複製しない。投影するのは座標・ラベル・経路だけで、`type` / `typeLabel` / `state` /
`equation` / `sources` は `data.js` の反応をそのまま共有する（`projectNormalReaction`）。

### 検証と fail-closed

`initProposedLayout()`（初期化時に検証のみ）→ `proposedLayoutProblem()` → `Contract.verifyProposal(P, D)`:

- `kind === 'normal-proposed'` / `version === 1`
- `base` が `Contract.buildBase(D)` と全一致（`normalVersion` / `compoundCount` / `reactionCount` /
  `reactionHash` / `nodeIdHash` / `classMapHash`。FNV-1a 32bit、座標を含まない facts のハッシュ）
- 427 `positions`（x / y / w / h が有限・正）、162 `markers`（全件 `label.type` と `label.box`）、
  375 `routes`（`points` 2 点以上）と件数一致、正の大きさの `canvas`
- 追加で app.js が各経路の端点 `reaction` / `dir` / `compound` を通常データの edge と照合

1 つでも欠ける・壊れている場合は `proposedEnabled = false` のまま、現在の配置で動き続ける
（`buildProposed()` も呼ばない）。`proposal-contract.js` 自体が読めない場合も有効化しない。

### 遅延構築

配置案の SVG は初回に「新しい配置案」を選んだときだけ `buildProposed()` で作る
（学術レイヤーの DOM と常時同時に持たない）。索引はすべて配置案用に分ける:
`proposedAll` / `proposedReactionIndex` / `proposedAllEdgeIndex` / `proposedConnectors` /
`proposedHitCandidates` / `proposedIncoming` / `proposedOutgoing`。
`activeLayout()` を通じて `activeCompoundById` / `activeCompounds` / `activeRegions` /
`activeReactions` / `active*Index` / `activeConnectors` / `activeHitCandidates` / `findReaction` /
`modeCanvas` / `syncNodeProjection` が同じ配置を参照する。パン・ズーム・当たり判定・
キーボード・現在位置・`?focus=` もすべて投影座標で動く。academic の `layout.version 2` 契約は不変。

## 反応名ラベルのアンカー

`app.css` の `.rp-reaction__label { text-anchor: middle }` は SVG の presentation 属性より優先されるため、
アンカーは classes で与える（共通ルールは残し、通常配置の見た目を変えない）。

- `.rp-reaction__label--start` / `--end` / `--middle`（共通ルールより後ろで定義）
- 位置は `label.box` の対応する辺（`start` → `box.x`、`end` → `box.x + box.w`、
  `middle` → `label.type`）。box が無い旧データは `side === 'E' → type.x + 11` / `'W' → type.x - 11`
- `label.anchor`（`center` / `start` / `end`、`left` / `right` / `centre` も可）を最優先
- anchor 無し・box の中心が `label.type` と一致 → 現在の配置の 80 件は middle のまま
- anchor 無し・中心が一致しない（学術の旧スキーマ） → `side` から start / end を導き、box の辺に合わせる
- `label.leader`（`[[x,y], …]`）があれば同じ反応グループへ折れ線（`.rp-reaction__leader`）を足す。
  反応点の丸は復活させない。ラベルと同じ LOD で出し入れする（補助は LOD0/1 で非表示）。

反応名の文字は `typeLabel` のまま（化学名の変更ではない）。
高倍率の HTML 重ねラベルは `r.label` を持つ反応を対象外にするため、配置案（162 全件ラベル）では
二重表示しない。現在の配置の `label: null` 82 件は従来どおり重ねラベルが使える。

## 実データでの確認（ブラウザ無し）

`app11-layout-switch-ui.test.cjs` の `[real]` テストは、実ファイル（`data.js` / `proposed-layout-data.js` /
`proposal-contract.js` / `academic-data.js`）を読み、fake DOM + 実 `map-core` で確認する。

- `Contract.verifyProposal(P_REAL, D)` が `{ok:true}`、`P_REAL.base` が `Contract.buildBase(D)` と一致。
  base は facts のみ（id・分野・濃度・反応の種類/基質/生成物/条件）で、座標・ラベル・経路を全部変えても
  変わらない（A/B の再配置で P は陳腐化しない）。facts を変えれば検出する。
- `initProposedLayout()` が実 P を有効化し、162 反応を実座標へ投影（DOM は作らない）。
- fake DOM で 375 辺・162 マーカー・162 ヒット・162 ラベル・leader 実数、実座標のラベル位置。
- current ↔ proposed ↔ academic ↔ normal 復帰で物質位置・反応選択の座標・式/出典（canonical 共有）・
  375 辺キー・検索入力が一致。current は canonical と完全一致。
- 実 P の位置/マーカー/ラベル/経路/端点/base/version/canvas を壊すと fail-closed（current 維持）。

限界:

- ブラウザを使わないため、実フォントの glyph 幅・折返し・実際の重なりは保証しない（box 座標と
  text-anchor の契約一致まで）。目視・スクリーンショットは対象外。
- `leader` は A の生成点列をそのまま描く（端点が box から数 px 離れる場合も短縮・補間しない）。
  導線の見た目調整は生成側の責務。
- 回帰は全 761 件で Windows 11 実測 11 分 6 秒。CI（`.github/workflows/tests.yml`）の実行上限は
  timeout を避けるため 10 → 20 分へ延長した（テスト・assert・Node 版・トリガー・権限は不変、全検証維持）。


## 既知の残件

- `proposed-layout-data.js` は B の生成物。`app11-reaction-map` の依存存在チェックは免除しない
  （未生成なら fail。欠落時の runtime は fail-closed で現在の配置だけを使い、その挙動は
  `app11-layout-switch-ui.test.cjs` の fail-closed テストで別途保護する）。
- 既存テストの静的期待は本変更に合わせて更新済み（`app11-reaction-map` / `app11-class-map` /
  `app11-structure` の script 一覧、`app11-academic-layout-ui` の VM 抽出ハーネスと
  current/proposed 分岐、`app11-academic` の modeCanvas・通常配列の保護）。
- `data.js` / `academic-data.js` / `layout.json` の再生成一致テストは、生成スクリプト側の進行中変更により
  不一致になる場合がある（本 UI 変更とは独立。生成担当の確定後に再実行する）。
