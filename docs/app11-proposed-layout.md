# app11 通常配置案（normal-proposed）

通常表示の「新しい配置案」用データと generator。**切替は通常表示だけ**を対象にし、
アカデミック専用配置（`academic-data.js` / layout version 2）には触れない。
公開 UI には配置切替を出さず（`.rp-layout` は `hidden`）、切替は内部試作・テスト用の API として残る
（詳細は `docs/app11-layout-switch.md`）。

## ファイル（B 担当の専有範囲）

| ファイル | 役割 |
|---|---|
| `scripts/app11/proposed-network-layout.cjs` | geometry generator（決定的・DOM なし） |
| `scripts/app11/build-proposed-layout.cjs` | データ生成 / `--check` / 検証 / 現行比較 |
| `site/app11/proposal-contract.js` | 契約・facts ハッシュ・検証の共有 pure module（Node + ブラウザ） |
| `site/app11/proposed-layout-data.js` | 公開生成物（`window.RPMapLayoutProposal`） |
| `scripts/tests/app11-proposed-layout.test.cjs` | 契約・幾何・描画・決定性の回帰 |
| `docs/app11-proposed-layout.md` | この文書 |

正本は **generator**。中間 JSON は持たない（生成物は公開用の 1 ファイルだけ）。
`data.js` / `site-src/app11/layout.json` / `routes.json` / `academic-data.js` は読むだけで書き換えない。

## データ契約

```js
window.RPMapLayoutProposal = {
  version: 1,
  kind: 'normal-proposed',
  base: {
    normalVersion,          // data.js の meta.version
    compoundCount: 427,
    reactionCount: 162,
    reactionHash,           // 反応 facts（id/type/state/tier/substrates/products/conditions）
    nodeIdHash,             // 427 の ID 集合
    classMapHash            // 一般図 frame + 12 ノードの矩形
  },
  positions: { [compoundId]: { x, y, w, h } },                  // 全 427
  markers: { [reactionId]: { x, y, tier, label } },             // 全 162
  // label = { side:'E'|'W', type:{x,y}, cond:null, box:{x,y,w,h}, anchor:'center', leader?:[[x,y],...] }
  routes: { [key]: { reaction, dir, compound, tier, points:[[x,y],...], gaps:[], bridges:[] } }, // 全 375
  canvas: { x, y, w, h },
  regionFocus: { [regionId]: { x, y, w, h, connected } },
  stats, warnings
}
```

- 座標は 1/100 px。`label.type` は **box の中心**（通常表示の center 規約）。
- `points` は常に「物質 → 反応マーカー」の順。描画側（map-core.js）が入力/出力で反転する。
- 化学的な内容（equation / sources / 構造など）は複製しない。runtime は `data.js` の facts に
  `positions` / `markers` / `routes` だけを投影する。

## 契約検証（C の runtime と共通）

`site/app11/proposal-contract.js` を `index.html` で `app.js` より先に読み込む。

```js
var verdict = window.RPMapProposalContract.verifyProposal(window.RPMapLayoutProposal, D);
if (!verdict.ok) { /* 現在の配置のまま（fail-closed） */ }
```

- 返り値は `{ ok: true }` または `{ ok: false, reason: string }`。例外は投げない。
- `positions` / `markers` / `routes` は項目まで厳密に検査する:
  - `label.box` は `x/y/w/h` すべて有限・`w/h>0`（center 規約でも検査を省略しない）
  - `label.type` は有限点、`cond` は null または有限点、`anchor` は既知 enum
  - `label.leader` は 2 点以上の有限点列（`[x,y]` / `{x,y}` の両対応）、長さ **80px 以下**
    （short <=48 / extended 48..80 の区別は stats で行う）
  - `route` は key（reaction|dir|id）・reaction/dir/compound・tier（マーカーと一致）・
    2 点以上の有限点列・gaps/bridges を検査
- これらの変形はテストで reject を確認する（`scripts/tests/app11-proposed-layout.test.cjs` の mutation ケース）。
- ハッシュは FNV-1a 32bit（8 桁 hex）。academic-data.js の `base.nodeHash` と同じ実装で、
  幾何（x/y）を含めない facts の同一性だけを見る。
- `positions` 427・`markers` 162（全ラベル必須）・`routes` 375 の件数と ID も検証する。
- runtime はさらに各 route の `reaction` / `dir` / `compound` が `data.js` の edge と一致することを
  確認する（app.js の `proposedLayoutProblem`）。

## 生成・確認

```powershell
node scripts/app11/build-proposed-layout.cjs            # 生成
node scripts/app11/build-proposed-layout.cjs --check    # CI: 生成物が最新か（決定的比較）
node --test scripts/tests/app11-proposed-layout.test.cjs
```

`--check` は再生成した文字列とファイルを完全比較する（乱数・時刻なし。同じ入力なら同じ出力）。

## 配置の作り方（reaction zone 方式）

1. 旧 `layout.json` の座標は使わない。compound の初期値は「分野/連結成分」順の格子＋決定的 jitter。
2. **compound と reactionZone を同時に力配置**する。zone は marker（左）+ label（右）+ 上下右 24px の
   保護矩形（幅 = 文字幅 + 56、高さ 64）。zone は compound と 24px、zone 同士は 10px 以上離れるよう
   矩形分離する。これで label と marker の帰属が構成的に決まる。
3. marker は zone の左寄り、label は marker の 8px 右。label は box 中心を type に持つ center 規約。
   owner 専用 stub は zone 左の gate から marker へ入る。
4. 全 foreign route は他反応の label 保護矩形（label + 24px）を回避する。own route は自 zone の
   gate から marker へ入り、自 label 矩形は避ける。raw/actual の双方で hard 0 を保つ。
5. label solver / fallback / leader は使わない（全 162 が構成的に own 近傍）。最終 route を固定し、
   事後の全 reroute や far fallback は行わない。
6. 自己計測（metrics.cjs）と実 Core（.25 + triangle）で hard / semantic gate を確認する。

## 現行配置との比較（metrics.cjs）

| 指標 | 現行（layout v4） | 配置案 |
|---|---|---|
| 交差（異なる反応の枝） | 346 | **1281** |
| 総辺長 | 79,644 px | **116,953 px** |
| 辺長 median（primary） | 125.99 px | 267.85 px |
| 辺長 p95（secondary） | 860.36 px | 817.97 px |
| 最長辺 | 3,658.48 px | **1,275.50 px** |
| node / label / marker / endpoint 貫通 | 0 | **0** |
| node 重なり・marker/ラベル衝突 | 0 | **0** |
| 同一区間の重なり（overlapSegments） | 1 | 25 |
| ストローク clearance 不足 | 68 | 986 |

- 交差・総辺長・clearance は現行より増える。zone 回避で foreign route を label から遠ざけるための
  **比較案としての tradeoff**（最大辺長は現行より短い）。数値固定はせず再計測する。
## ラベル（reaction zone 構築）

- 全 162 ラベルを zone 内に構成的に配置する。solver state は使わない（direct 162 / unresolved 0 /
  fallback 0）。leader は 0。
- semantic gate（A 共通 helper: 実 Core .25 + triangle）:
  **異名逆転かつ leader 無し 0 / own>=25 かつ leader 無し 0 / invalid leader 0 /
  sameNameNearer 0 / strictMarginOnly 1**。
- 重点 5 の own/foreign（raw 計測）:

| 反応 | own | foreign |
|---|---|---|
| ethanol-dehydration-ethene（脱離） | 8.00 | 22.10 |
| ethyne-full-hydrogenation | 8.00 | 32.29 |
| acetic-acid-sodium-carbonate | 8.00 | 22.04 |
| ethanol-sodium | 8.00 | 32.60 |
| methanol-cuo-oxidation | 2.55 | 24.56 |

## 制約・不変条件

- 棚の参加者は現行と同じ **269**（未接続のみ）。接続 158 は棚に入れない（新規参加 0）。
- 一般図（class map）の 12 ノード + frame の矩形は**動かさない**。
- 旧 `layout.json` / `routes.json` / `data.js` / アカデミック関連は変更しない。
- アカデミック表示は従来どおり専用配置。切替対象は通常のみ。
- 提案データの欠落・不整合・base 不一致では runtime は現在の配置を維持する（fail-closed）。

## 残リスク

1. 交差 1281 / 総辺長 116,953 / clearance 986 / overlap 25 は現行（346 / 79,644 / 68 / 1）より多い。
   zone 回避で label の対応を構成的に守った結果の tradeoff で、「全線が短くなった」等の主張はしない。
2. 最長辺は 1,275.5（現行 3,658.48）に短縮。canvas は 6058×3555（現行 6052×3422）。
3. 生成は約 40〜60 秒（`--check` も同程度）。
