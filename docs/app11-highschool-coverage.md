# app11 高校化学カバレッジ台帳（source 契約）

## 目的

通常モード（427 物質 / 86 反応 / 81 保留）に対する**高校化学のカバレッジ不足**を、教育項目の正本
`site-src/app11/coverage-manifest.json` で機械検査できるようにする。あわせて、大学レベル
（academic）の反応を通常モードへ昇格させるための source 契約を `scripts/app11/source-data.cjs`
に追加する。通常 86 反応の検証・出力・件数は変更しない。

- 対象: `site-src/app11/reactions.json` / `species.json` / `route-priority.json` /
  `academic-reactions.json` / `coverage-manifest.json`
- 生成物（`site/app11/data.js` / `academic-data.js` / `layout.json` / `routes.json`）は
  別ワーカーが生成する。本台帳の検査は生成前でも `--source-only` で動く。
- ブラウザ操作・目視・スクリーンショットは行わない。

## 水準（level）

| level | 意味 | 検査 |
|---|---|---|
| `standard` | 通常モードで公開済みの確認済み反応 | 反応 ID が通常 86 に存在。sources 必須。academic-only では満たさない |
| `advanced` | 通常またはアカデミックモードで公開済み | 反応 ID がアカデミック反応に存在。sources 必須 |
| `held` | 具体的な根拠（教材の節・URL）を確認するまで保留 | 残る全保留を漏れなく覆う。`reason` に旧 holdReason を保持 |
| `missing-material` | 427 物質に存在しない物質・材料 | `compoundIds` が 427 に**存在しない**ことを検査。反応ノードは持たない |
| `card-only` | 専用ノード・式を持たず、既存カード/注記で扱う、または UI 未対応 | `pendingKind` または `cardRef` 必須。検出 UI 未対応は反応 ID を持たない |

`importantReview` は高校重要 47 項目（20 already academic / 27 both missing）の最終採用リストを
受領するまで `status: "pending-source-list"` とし、`items` を推測で埋めない。
`--check` はこの状態では失敗し、`--source-only` は警告に留める。

## coverage-manifest.json の形式

```jsonc
{
  "version": 1,
  "title": "…",
  "note": "…",
  "updated": "2026-11-17",
  "importantReview": {
    "status": "pending-source-list", // 受領後 "confirmed"
    "expectedCount": 47,
    "items": [{ "id": "standard-…", "level": "standard" }]
  },
  "levels": { "standard": "…", "advanced": "…", "held": "…", "missing-material": "…", "card-only": "…" },
  "sources": [
    { "id": "N-17.7", "book": "…", "section": "17.7", "title": "…", "url": "https://…", "checkedAt": "…" }
  ],
  "items": [
    {
      "id": "standard-ethanol-oxidation-ethanal",
      "label": "酸化: エタノール → エタナール",
      "level": "standard",
      "reactionIds": ["ethanol-oxidation-ethanal"],
      "legacyAcademicId": null,
      "compoundIds": [],
      "sources": ["N-17.7"],
      "requiresEquation": true,
      "requiresDrawing": false,
      "reason": "通常モードで公開済みの確認済み反応"
    }
  ]
}
```

- `items[].id` は一意。`level` は上表の 5 種類だけ。
- `sources` は `manifest.sources[].id` を参照し、`url` は公開教材 URL に限る。
- `missing-material` は `compoundIds` と `pendingKind`（例 `compound-addition`）を持ち、
  `reactionIds` は空。**無実装をカード済みと偽らない**。
- 検出反応（銀鏡・フェーリング・ヨードホルム）は `card-only` + `pendingKind: "detection-ui"`。
  専用 UI を実装するまで反応ノードを持たない。タンパク質加水分解の「アミノ酸の混合物」は
  既存カード注記（`cardRef: "protein-hydrolysis.productNote"`）として `card-only` に記録する。

## 通常反応の追加フィールド（source 契約）

通常の確認済み反応にだけ、次の任意フィールドを追加できる。既存 86 反応は未指定のままで、
`loadSource()` の投影にも項目を足さない（生成物の互換を維持）。

| フィールド | 値 |
|---|---|
| `educationLevel` | `high-school-standard` / `high-school-extension` |
| `evidenceKind` | `source-illustrated-transformation` / `general-rule-application` |
| `scope` | 適用範囲の説明（非空） |
| `stepKind` | `direct` / `multi-step`（multi-step は `steps` 必須） |
| `steps` | 段階説明の配列（非空文字列） |
| `legacyAcademicId` | 移行元の `academic-*` ID。アカデミック側に行を残さない |
| `coverageIds` | 対応する `coverage-manifest` item の ID 配列 |
| `layoutGroup` | レイアウト区分（例 `high-school`）。priority の tier とは分離 |
| `history` | 旧 holdReason / 誤条件の保存。`{ kind, note?, date? }` の配列 |

- `general-rule-application` は「独立実験で確認済み」を意味しない。`scope` と `note` で
  実験未確認であることを明示する。
- 保留反応を確認済みへ直すときは旧 ID を維持し、`history` に旧 `holdReason` を残す。
- 通常へ移すアカデミック行は `academic-reactions.json` から削除し、`legacyAcademicId` で対応を保持する
  （normal + academic の二重描画禁止）。
- 既存 86 反応の `state` / `verification` / `equation` / priority tier は変更しない。

## 反応式（P）の検証

`projectEquation(raw, reaction, ctx, options)` は第 4 引数なしでは従来どおり
（P は `n` / `2n` と 1〜9 の整数）。`legacyAcademicId` を持つ通常反応だけ
`equationOptionsFor()` が次を有効にする。

- 係数記号: `n` / `m` / `p` / `d` / `dn` / `2n` / `3n` と 1〜99 の整数のみ。未知記号は fail-closed。
- 重合模式式には `explanation`（未定量であることの注記）を必須にする。
- 反復単位の本体（高分子・単量体）の外側係数は 1。`2n` / `dn` などは副生成物 species だけに許す。
- `variantKind` は `coexistence`（共存） / `competition`（競合）のみ。`variants` を必須にする。
- B / N の元素・電荷収支、T の構造変換、未知 compound / species の拒否は従来どおり。

## 検査

```powershell
node scripts/app11/check-coverage.cjs --source-only   # source と正本だけ（生成物が未更新でも可）
node scripts/app11/check-coverage.cjs --check         # 親の最終確認
node --test scripts/tests/app11-highschool-content.test.cjs
```

`--check` は上記に加えて次を検査する。

- 生成 `data.js`: 427 物質 / 通常反応数 / 保留数 / species が source と一致
- `layout.json`: 427 位置、通常 86 マーカー、反応に出る物質が棚（`tier: "isolated"`）に残らない
- `routes.json`: 通常反応の全 substrate の `in` 辺・全 product の `out` 辺、未知反応の辺なし
- `primary-topology.json`: `inputHash` が source の `priorityHash` と一致
- 生成 `academic-data.js`: アカデミック 152 反応、427 位置、通常経路（source の通常反応端点から算出）/
  学術経路（物質ノード端点だけを数え、species は除外）、warning 0
- 通常経路・学術経路の期待数は source の `substrates + products` から動的に計算する（旧 207 / 421 の固定値を残さない）。
  427 物質数と旧 86/101/207 の baseline 固定は意図どおり維持する。

反応 ID の重複は 0。同じ pair でも条件が異なり、`note` / `scope` に条件差の理由があれば許容する
（DMP 酸化と CuO 酸化など、条件別の重要例を落とさない）。同一 pair・同一条件は二重描画として失敗する。

## 現在の状態（2026-11-17）

- `standard` 162（既存 86 + 追加 5 + A26 + 昇格B20 + 昇格C6 + newD19）/ `held` 36（実保留 35 + 調査保留 1）/
  `advanced` 44（アカデミック 152 反応）/ `missing-material` 3 / `card-only` 6。
  ヨードホルムはアセトン・2-プロパノールの通常反応として収録済み。銀鏡・フェーリング・FeCl3・
  ニンヒドリン・ビウレット・タンパク質混合物は card-only（検出 UI 未対応または既存注記）として明示する。
- 高校重要 47 項目 = 新 A26 + 昇格 B20 + TNT 保留 1。`importantReview` は `confirmed`。
- 427 物質・既存 86 反応の facts / 式 / 条件 / priority tier は変更していない。
- 「全高校範囲を完全網羅」とは主張しない。検出反応の専用 UI、未収録物質、TNT・環化三量化などは
  held / card-only / missing-material として明示する。

## 2026-11-17 一括採用（A26 / B20 / C6 / D19）

- A26: held 26 件を `standard-*` coverage item として通常へ昇格（旧 holdReason は `history` に保存）。
- B20: 既存アカデミック 20 件を通常へ昇格。neutral な held ID を canonical にし、`legacyAcademicId` に
  旧 `academic-*` を保持。アカデミック正本からは該当 polymer 行を完全除去（二重描画なし）。
- C6: アカデミックの個別行 6 件を neutral ID（`academic-` を除いた ID）で通常へ昇格。
- D19: 新規 19 件を追加。D の環化三量化 1 件は検索抽出のみのため実装せず、`held-research-*` で理由を明示。
- A の type は既存 `map.types` に写像（例 `academic-carboxylation` → `carboxylation`）。
- 実件数: 通常 162 / 保留 35（+調査保留 1）/ アカデミック 152。
- `sourceAccess` は manifest `sources[].access` に `full-text` / `abstract` / `search-snippet` を明示し、
  検索抽出のみの資料を全文確認済みと偽らない。
- 品質注意:
  - ビニロンは主に同一鎖内 OH 対による環状アセタール。HCHO と水を各 x、未反応 OH を y、OH 総数を n とすると
    2x + y = n。全鎖間架橋・全 OH 消失を主張しない（P の `x` / `y` はホワイトリスト）。
  - セルロースの平均置換度 d は 0≤d≤3。アセチル化は無水酢酸 → 酢酸 `dn`（水ではない）、硝酸化は水 `dn`。
  - PVAc のけん化→PVA→酢酸塩の酸処理は NaOH・酸・塩を省略した P 模式正味式で、完全式と誤認させない。
  - 金属アセチリドは T の変換模式式（完全化学反応式ではない）。H₂ は生成しない。
  - ヨードホルム・CuO・トルエン酸化・酸無水物・フェノールフタレイン・ナイロン66 の模式収支は検証済み。

### 生成 metadata 説明の正本（layoutcoder 所有・本担当は編集しない）

- `scripts/app11/build-map-data.cjs`
  - `D.meta.dataNote`（約 577–579 行）: 旧「独立資料の各節で確認できたものだけ」。
  - `D.states.confirmed.note` と label `確認済`（約 583 行）: 旧「独立した資料で確認できた内容。」。
- これらは source の `reactions.json` から生成される定数ではなく build-map-data 内の固定文字列。
  正確化する場合は layoutcoder が同ファイルを修正し、`data.js` を再生成する。
- source 側の正本 `reactions.json` の `note` / `source.note` は、confirmed を
  「資料の個別例または一般則を根拠に採用し、個別本文での実験確認を一律に保証しない」へ修正済み。
- normal 新 76 件の内訳: **個別例 37 / 一般則 39**（`source-illustrated-transformation` / `general-rule-application`）。
  件数 162 normal / 152 academic は不変。

### ID 対応（old → new canonical）

- A26: held ID をそのまま canonical に採用（`ethanol-dehydration-ethene` など）。coverage item のみ `standard-*`。
- C6: `academic-` を除いた neutral ID を canonical に採用。
  - `academic-alkyne-hydration-ethyne-ethanal` → `alkyne-hydration-ethyne-ethanal`
  - `academic-diazonium-substitution-benzenediazonium-chloride-phenol` → `diazonium-substitution-benzenediazonium-chloride-phenol`
  - `academic-arene-hydrogenation-benzene-cyclohexane` → `arene-hydrogenation-benzene-cyclohexane`
  - `academic-aromatic-side-chain-oxidation-o-xylene-phthalic-acid` → `aromatic-side-chain-oxidation-o-xylene-phthalic-acid`
  - `academic-triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid` → `triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid`
  - `academic-triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid` → `triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid`
- B20: 既存 held ID を canonical にし、`legacyAcademicId` に旧 `academic-*` を保持。

| canonical (held ID) | legacyAcademicId |
|---|---|
| `sodium-phenoxide-carboxylation` | `academic-kolbe-schmitt` |
| `sodium-salicylate-acidification` | `academic-salicylic-acid` |
| `maltose-hydrolysis` | `academic-maltose-hydrolysis` |
| `lactose-hydrolysis` | `academic-lactose-hydrolysis` |
| `cellulose-hydrolysis` | `academic-cellulose-hydrolysis` |
| `cellulose-acetylation` | `academic-cellulose-acetate` |
| `cellulose-nitration` | `academic-cellulose-nitrate` |
| `tetrafluoroethylene-polymerization` | `academic-ptfe-polymer` |
| `vinyl-acetate-polymerization` | `academic-pvac-polymer` |
| `mma-polymerization` | `academic-pmma-polymer` |
| `acrylonitrile-polymerization` | `academic-pan-polymer` |
| `butadiene-polymerization` | `academic-polybutadiene` |
| `chloroprene-polymerization` | `academic-chloroprene-rubber-polymer` |
| `styrene-butadiene-copolymerization` | `academic-sbr` |
| `iir-copolymerization` | `academic-iir` |
| `pvac-hydrolysis` | `academic-pva` |
| `nylon6-from-aminoacid` | `academic-nylon6` |
| `urea-resin-condensation` | `academic-urea-resin` |
| `melamine-resin-condensation` | `academic-melamine-resin` |
| `phenol-resin-condensation` | `academic-phenol-resin` |

## 2026-11-17 追加採用: 高校代表条件 5 件

既存 86 の DMP 酸化・NaBH4 還元の条件は変えず、別経路として通常モードへ追加した。
いずれも基質・生成物は既存 427 物質の ID で、新しい物質ノードは追加していない。

| 反応 ID | 内容 | 式 | 根拠の種類 |
|---|---|---|---|
| `methanol-cuo-oxidation` | メタノール + CuO → ホルムアルデヒド + Cu + 水 | B / direct | source-illustrated-transformation |
| `ethanol-cuo-oxidation` | エタノール + CuO → エタナール + Cu + 水 | B / direct | general-rule-application |
| `propan-2-ol-cuo-oxidation` | プロパン-2-オール + CuO → アセトン + Cu + 水 | B / direct | general-rule-application |
| `ethanol-dichromate-oxidation-ethanal` | エタノール + [O] → エタナール + 水 | N / direct | source-illustrated-transformation |
| `ethanol-dichromate-oxidation-acetic-acid` | エタノール + 2[O] → 酢酸 + 水 | N / multi-step | source-illustrated-transformation |

- CuO は**酸化剤**であり触媒ではない。Cu が還元生成物、水が副生成物。
  反応グラフの有機基質・生成物だけをノードにし、CuO / Cu / 水は式用 species に置く。
- `CuO` species は分子の `Cu=O` として描かず、`Cu²⁺` と `O²⁻` のイオン/組成表示（結合なし）にした。
  `Cu` は単体、`[O]` は酸素 1 原子分の**形式当量**（実在する孤立酸素原子でも実試薬の構造でもない）。
  `mode: N` の元素収支では O として数えるが、式の説明に形式当量であることを明記する。
- 酸性二クロム酸塩は Na₂Cr₂O₇ を本文に合わせて示す（K₂Cr₂O₇ 等への具体化はしない）。
  Cr を含む完全な反応式は主張せず、`N`（正味の総括式）で示す。
- 出典: RSC Education「Oxidation of ethanol」、埼玉県立松山高等学校の公開記事（2011-06-30）。
  フェノールフタレイン・ナイロン66 の公開教材は市立札幌山の手支援学校。
  小石川中等教育学校の PDF は検索抽出のみで全文確認していないため補助扱いとし、採用の直接根拠にしない。
- CuO 触媒による脱水素（H₂ 生成）経路は今回未確認のため保留し、追加していない。
