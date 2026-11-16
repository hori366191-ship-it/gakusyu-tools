# app11 高校標準の反応追加 — レイアウト統合メモ

通常モードの反応を 86 → 162 件へ増やしたときの、配置・経路・検証の設計。
対象: `scripts/app11/optimize-layout.cjs` / `extension-layout.cjs` / `legacy-baseline.cjs` /
`build-map-data.cjs` / `build-academic-data.cjs` / `primary-topology.cjs`。

## 1. 凍結基準（legacy-baseline.json）

`site-src/app11/legacy-baseline.json` に、従来の次を固定している。

- 旧 86 反応の事実（type・基質・生成物・条件・出典・式 mode）
- 旧 101 接続物質の座標（`tier` / `region` / 寸法）
- 旧 207 経路の点列
- 旧 shelf と canvas

`node scripts/app11/make-legacy-baseline.cjs` で作り直す。通常の反応追加では実行しない。
`legacy-baseline.cjs` の `verifySource` / `verifyLayout` が、追加後の正本と出力を照合する。
棚にあった物質が新しい反応で接続された場合だけ、その座標移動と `tier` 変更を許す
（ただし棚の中に残すことは許さない）。旧 101 の座標・旧 207 の経路は 1px も動かさない。

## 2. 拡張配置（extension-layout.cjs）

新しい反応は、既存の接続済み端点（attachments）だけを anchor にして置く。

- 未接続（旧棚）の座標は候補評価に使わない
- 候補は attachments への距離の合計が小さい順に試す
- marker は `shelf.x - 260` より左に限定（旧棚の直前帯へ置かない）
- 棚から新たに接続した物質は marker の近くへ移す（`x + w <= shelf.x - 270`）
- 新規の線は既存線と交差してよい（新 primary / secondary は平面性証明の対象外）が、
  node / label / marker の貫通と同一直線の重なりは禁止
- 描画の paint gap を保つため、始点は境界から外向きの stub（14〜26px）を必ず持つ
- 既存ネットワークに接しない成分だけ、地図の下へまとめて pack する（maleic クラスタなど）

主要 50 反応の平面性証明は `primary-topology.json` のまま。追加の主要反応は
`legacyDigest`（旧 86 のみの priority hash）で照合し、証明書を作り直さない。

## 3. 生成と検証

```
node scripts/app11/optimize-layout.cjs            # layout.json / routes.json
node scripts/app11/optimize-layout.cjs --check    # 出力が最新か（凍結基準も照合）
node scripts/app11/build-map-data.cjs [--check]   # data.js / coverage-ids.js
node scripts/app11/build-academic-data.cjs [--check]
node scripts/app11/check-coverage.cjs --check
node --test scripts/tests/app11-normal-layout.test.cjs
```

`data.js` の `D.meta.dataNote` と `D.states.confirmed.note` は、旧来の
「独立資料の本文で確認済み」という一律表現をやめ、資料が示す個別例と一般則の適用、
適用範囲は各反応カードに示す、という中立表現にした（旧 86 の反応 record 自体は不変）。
`build-map-data.cjs` は `educationLevel` / `evidenceKind` / `scope` / `stepKind` /
`steps` / `legacyAcademicId` / `coverageIds` など任意メタデータを、存在するときだけ投影する。

## 4. 実測（確定 source: normal 162 / held 35 / academic 152）

- 通常: 反応 162、物質 427、辺 375、接続 158、棚 269、canvas 6052×3422
- 経路長: 1500px 超 4 本、2500px 超 3 本、最大 3658px（旧棚経由の長線は解消）
- 代表: `ethanol-sodium` のマーカーはエタノール中心から 124px、最長辺 161px
- 新規マーカーで x>=3900 は 6 件（いずれも `shelf.x - 260` より左のネットワーク側）
- 幾何: node / label / marker 貫通 0、marker 相互衝突 0、旧 primary の P–P 交差 0
- アカデミック: 152 反応、通常 162 マーカー/375 辺を専用座標で引き直し、学術経路 358

## 5. 残件・注意

- 新 primary / secondary 同士の交差は許容（非平面）。旧 primary の交差 0 だけを不変条件とする。
- 新規経路の `clearanceViolations` は旧 3 から増える（交差に伴うストローク間隔）。貫通 0 を優先した。
- 新規の弱連結成分を pack した領域は、地図下の専用帯（棚ではない）。共有物質は最初の配置を保持する。
- レイアウトを意図的に作り直す場合だけ `make-legacy-baseline.cjs` で基準を更新する。
