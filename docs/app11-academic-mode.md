# app11 アカデミックモード（大学レベルの追加反応）

## 目的

通常の有機反応マップ（427 物質 / 86 反応 / 81 保留）のデータを一切変えず、既存 427 物質の ID だけを参照する
overlay として、大学レベルの一般則で説明できる反応を追加表示する。物質は追加しない。

- 通常データ `site/app11/data.js` / `site-src/app11/layout.json` / `routes.json` は不変。
- 追加データの正本は `site-src/app11/academic-reactions.json`。
- 生成物は `site/app11/academic-data.js`（`scripts/app11/build-academic-data.cjs`）。
- アカデミック表示は通常座標の複製ではなく、専用レイアウト（layout version 2）を持つ。
  `scripts/app11/academic-network-layout.cjs` が、通常 158 + 学術で新たに接続する 97 = 255 物質を
  1 つのネットワークとして配置し、通常 162 + 学術 152 = 314 反応マーカーを端点の近傍へ置き、
  通常 375 + 学術 358 = 733 辺をすべて引き直す。通常モードの座標・経路には書き戻さない。
- 未接続 172 物質だけは、class map（一般図、x>=4170）の外側の専用棚へ別に詰める。
- 辺の点列は最後に `scripts/app11/academic-crossing-relief.cjs` が交差の少ない候補へ差し替える
  （物質・マーカー・ラベル・事実は動かさない。詳細は「交差低減」）。

## 件数（2026-11-19 生成）

| 項目 | 値 |
|---|---|
| 通常の物質 / 確認済み反応 / 保留 | 427 / 162 / 35（不変） |
| アカデミック追加反応 | 152 |
| 合計（通常＋アカデミック） | 314 |
| 大学レベル区分 | `academic`（`tierLabel: 大学レベル`） |
| 根拠の種類 | 一般則の適用 150 / 資料が個別例として示す変換 2 |
| 段階 | 一段階（direct）90 / 多段階（multi-step）62 |
| 重合模式式（mode P） | 9 |
| 新たに接続した孤立物質 | 97 |
| 通常ネットワーク接続（既存） | 158（不変） |
| アカデミック合計の接続物質 | 255 |
| 残る未接続物質 | 172（専用棚へ） |
| アカデミック反応だけの弱連結成分 | 14 |
| 端点（辺）総数 | 733（通常 375 + 学術 358） |
| 描画できた辺 | 733（全辺） |
| カードのみ（線を引かない辺） | 0 |
| 全辺が線にならない反応 | 0 |
| 描画済みの新規接続物質 | 97 |
| マーカー・ラベルの衝突 | 0 |
| 経路のノード・ラベル・マーカー貫通 | 0 |
| ラベル混雑の警告 | 0（理論交差以外は hard fail） |

全辺が描けない反応も一覧・検索・カードからは開ける。無言で消さない。

## 専用レイアウト（layout version 2）

旧 overlay 方式では学術マーカーを通常の右棚へ固定していたため、端点からマーカーまでが
数百〜数千 px になり、総延長 541,480 px（p95 2,519 px、1000 px 以上 227 辺）だった。
専用レイアウトは全 733 辺を同じ座標系で引き直し、さらに交差低減で辺の点列だけを差し替える。

| 指標（全 733 辺） | 旧 overlay | 改修前の最終経路 | 現在 |
|---|---|---|---|
| 総延長 | 541,480.2 px | 298,560.12 px | **296,810.01 px**（旧比 −45.2%） |
| 中央値 | 503.6 px | 264.73 px | 263.58 px |
| p95 | 2,518.7 px | 1,164.69 px | **1,164.69 px**（旧比 −53.8%、改修前と同じ） |
| 最大 | 3,457.6 px | 2,853.25 px | 2,853.25 px |
| 1,000 px 以上の辺 | 227 | 57 | **56** |
| 交差（raw） | 5,043 | 6,111 | **5,607**（改修前比 −8.2%） |
| 交差（反応が異なる組のみ） | − | 6,094 | 5,592 |

「改修前の最終経路」は、ラベル再配置と学術 route 救済までを適用した最終データを、
現在と同じ定義で測り直した値（2026-11-19 実測）。それ以前に `stats.collisions.crossingPairs`
へ入っていた 5,755 は reroute 前の build 時点の値で、最終経路の交差ではなかった。
数値の意味を取り違えないよう、5,755 は比較に使わない（下記「交差の定義」）。

### 交差の定義（canonical）

- `stats.crossings.definition` / `stats.crossingRelief.definition` に文字列で残す。
- 数え方: **異なるルートキー同士の線分交差の総数**。同一ルートキー内は除外。
  同じ 2 辺が複数回交われば回数分だけ数える（raw）。同じ反応の別辺（`in` / `out`）同士も
  別ルートキーなので数える。
- 参考値 `stats.crossings.differentReaction` は、そのうち反応 ID が異なる組だけを数えたもの。
- 交差は非平面グラフなので 0 を要求しない。`stats.crossings.raw` =
  `stats.collisions.crossingPairs` は **最終経路から測り直した値**で、
  `scripts/app11/academic-crossing-relief.cjs` の `crossingReport()` と
  `scripts/tests/app11-academic-layout.test.cjs` の独立再計算が一致することをテストで確認する。

### 交差低減（crossing relief）

`scripts/app11/academic-crossing-relief.cjs`。ラベル再配置と route 救済の後、経路が確定する前段で実行する。
ラベル箱・マーカー・物質座標・事実は動かさず、**辺の点列だけ**を差し替える。

- 対象: 交差への関与が多い辺を交差数順に最大 250 本（2 パス目は上位 60 本、2 巡目は上位 120 本）、
  加えて長い辺の上位 10 本（`extraLongest`）。差し戻した辺は以後の巡目で対象にしない。
- 候補: 物質の 4 辺ポート × 探索余白 160 / 260 px を、他辺の線分を soft cost（近傍のみ）に
  した格子 A* で探索し、簡約した点列。端点は「物質境界のポート → マーカー中心」を厳守する。
- 受入条件: その辺の交差数が減ること。総延長は増やさない（伸ばす候補は 2%・最低 20 px 以内、
  1000 px 未満のまま、交差 10% 以上の減少、累積短縮の範囲内という 4 条件をすべて満たす場合だけ）。
  候補はノード（+2）・ラベル箱（+3）・他マーカー円（+1）を貫通せず、
  異なる typeLabel の線が自分の線より近くならないこと（leader 無しのラベルだけ判定）。
- 短縮パス: 交差を増やさず 3%（最低 20 px）以上短くなる候補だけを採る。
  ただし現データでは採用 0 件（元の A* 経路が既に短く、短縮候補は交差が増える）。
- ラベル・leader: ラベル箱は動かさない。leader を持つラベルは、経路確定後に
  `scripts/app11/academic-paint.cjs`（Core の実描画パイプライン）で終点を付け替え、
  実描画での leader 検証（始点は箱の境界・終点は自分の線・長さ ≤80 px・他線/ノード/ラベル/
  他 leader を横切らない）に通らなければ、その反応の辺を元へ戻す。leader を持たないラベルは、
  箱の貫通・持ち主線の喪失（`own` なし / 25 px 超）・異名の逆転を測って、壊す辺を元へ戻す。
- 結果は `stats.crossingRelief`（評価辺数・差し替え数・差し戻し数・巡目・before/after）に残す。
- 事実・物質・マーカー座標・class map・通常データは不変。決定的（乱数なし）。
- 実測（2026-11-19）: 評価 516 辺 / 差し替え 36 / 差し戻し 17 /
  交差 6,111 → **5,607**（raw、−8.2%）/ 総延長 298,560.12 → **296,810.01**（−1,750 px）/
  ge1000 57 → 56。p95・最長辺・ラベル（direct 195 / leader 111 / unresolved 8）は改修前と同じ。
- 既知の限界: 交差削減は 8.2% にとどまる。ラベルを解き直して箱を動かせば 20% 超も可能だが、
  その場合 `unresolved` が 8 → 11 件へ増え、リーダー/貫通の再検証も必要になるため採らない
  （既存の実描画ゲートとラベル品質を優先）。

- 接続 255 は決定的な力配置（固定 seed・固定順・空間ハッシュ）で圧縮し、物質矩形
  （136×34、8 px 間隔）の重なりを除去してから、反応マーカーを端点重心の近傍へ置く。
- マーカーは 4 辺ポート + 外向き stub から、格子 A* + 簡約で配線する。障害物は
  全 427 ノード・全 314 ラベル・全 314 マーカー円・class map（frame と 12 ノード）。
  ラベル・マーカー・ノードの貫通が 1 件でも残れば build は失敗する（hard fail）。
  build の最後に、**reroute 後の実ジオメトリで** hard collision と交差を測り直す。
- class map は通常 world 座標（frame x=4170, y=1600, 1470×590）のまま障害物として維持する。
- `regionFocus` は領域ごとの接続ノード範囲（接続の無い領域だけ棚の範囲）を返す。

### `A.layout` の契約（version 2）

```
version: 2
positions:     { all427Id: {x,y,w,h} }              // 接続255=ネットワーク / 未接続172=棚
normalMarkers: { 162id: {x,y,tier:primary|secondary,label:{side:E|W,type:{x,y},cond:null,box}} }
normalRoutes:  { 'rid|in|out|cid': {reaction,dir,compound,tier,points,gaps,bridges} } // 375
markers:       { 152id: 同上 }                      // tier: academic
routes:        { 358key: 同上 }                      // tier: academic
canvas:        { x,y,w,h }
regionFocus:   { regionId: {x,y,w,h,connected} }
stats:         旧/新比較・衝突件数・交差数（crossings: raw/differentReaction/definition, crossingRelief）
warnings:      []（理論交差以外は build 失敗）
```

`base.nodeHash` は従来どおり通常 `data.js` のノード座標だけから作る（`positions` は含めない）。
ラベル箱と描画アンカーは `E: type.x + 11 = box.x` / `W: type.x - 11 = box.x + box.w` で一致する。

## 通常 4 ハッシュ（不変）

`app11-hit-targets.test.cjs` の 4 つ（concrete / equation / class geometry / notice DOM）は
変更していない。アカデミックのテストは別ファイル `scripts/tests/app11-academic.test.cjs`。

## データ規約

- 反応 ID は `academic-*`。通常 162・保留 35 の ID と衝突させない。
- `substrates` / `products` は既存 427 の ID のみ。新しい物質ノードは追加しない。
- `verification`（正本では `sourceIds`）と `scope` は必須。URL は正本だけに保持し、
  公開 `academic-data.js` には資料名・節・確認日だけを出す。
- `evidenceKind`
  - `general-rule-application`: 大学レベルの一般則の適用。個別実験の確認ではない。
  - `source-illustrated-transformation`: 資料が個別例として示す変換。実験再現を主張しない。
- `stepKind`: `direct` / `multi-step`。`multi-step` は `steps` の説明を必須にし、
  カードに段階を表示する。地図の線は総括経路で、中間体は物質として収録しない。
- 保留反応と同じ組合せを扱う場合は `basedOnHeld` を付け、通常データの確認日より後の
  新しい根拠（2026-11-17）を必須にする（保留の state・出典は変更しない）。
- 既存の確認済み反応と同一の組合せ・同一条件は登録できない。条件が異なる場合は `note` で理由を示す。
- 式は B / N / T を通常の `projectEquation` で検証する。重合模式式（P）だけ、
  アカデミック専用の係数ホワイトリスト（`n` / `m` / `p` / `d` / `2n` / `3n` と 1〜99）を使う。
  通常の P は `n` / `2n` のまま（通常データ・通常検証は不変）。
- 共重合・ネットワーク・可変置換は、組成比・架橋密度・置換度を固定値で捏造しない。
  - 3 単量体（ABS）は独立記号 `m` / `n` / `p`、樹脂は `n` / `m`、セルロース誘導体は可変置換 `d`。
    セルロース鎖と試薬・副生成物は `dn`（置換度 d × 繰返し n）、高分子項の外側係数は 1。
  - SBR は butadiene `m` / styrene `n`、NBR は butadiene `m` / acrylonitrile `n` と、
    既存 polymer 構造の繰返し記号に一致させる。
  - エポキシ前駆体は原料比を固定せず、HCl の係数も固定しない（生成は説明に留める）。
  - 高分子項の外側係数は 1（繰り返しは構造側の `_n`）。混合生成物は variants で生成物ごとに図示し、
    graph の products は 2 件のまま、比率・全生成物は主張しない。
- 条件はグループ単位で検証する。アルキン水和は Hg²⁺ 水和とヒドロホウ素化を別グループに分け、
  アルケン水和は酸触媒水和（direct）に統一する。
- 出典は対応する節だけに紐づける（付加重合に step-growth、aramid に PVA 問題を付けない）。

## UI

- ツールバーに「通常」「アカデミック」の 2 ボタン（`aria-pressed`、既定は通常）。
- `?mode=academic` は有効な学術データがあるときだけ受け付ける。localStorage には保存しない。
- アカデミック層は `display` で切り替え、通常モードでは当たり判定・Tab 移動・検索・カードに混ぜない。
- 学術反応で新たに接続したノードだけ `is-academic-linked` を付け、通常の `data-path-state` は書き換えない。
- 通常の注意枠の文言は不変。アカデミック用の説明は別要素（`rp-academic-note` / `rp-academic-scope`）に出す。

## 生成・検証

```
node scripts/app11/build-academic-data.cjs
node scripts/app11/build-academic-data.cjs --check
node --test scripts/tests/app11-academic.test.cjs
node --test scripts/tests/app11-academic-layout.test.cjs
```

- `app11-academic-layout.test.cjs` は専用レイアウトの幾何を検査する。全 427 座標 ID、接続 255 / 棚 172、
  新規 97 の移動、通常 162 マーカー + 375 経路、学術 152 マーカー + 358 経路、
  全 314 ラベルの衝突 0、全 733 辺の貫通 0、旧 baseline 比の総延長半減、決定的再生成を確認する。
  交差は最終経路から独立に数え直し、`stats.crossings` / `stats.collisions.crossingPairs` と一致し、
  旧 gate 5,799 と改修前実測 6,111 の 6% 低減の両方を満たすことを確認する。
- 旧 overlay の実測値は `scripts/tests/fixtures/app11-academic-layout-baseline.json` に数値だけ保持する。
