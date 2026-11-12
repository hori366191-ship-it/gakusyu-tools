# app11 主要バックボーン再設計 — 実装記録

- 日付: 2026-11-13
- 対象: `site-src/app11` / `scripts/app11` / `site/app11` / `scripts/tests`
- 比較基準: `cf4756dbb0bde2fd74b77aee42df8cc3c8676121`（layout v3）
- 状態: **実装・ローカル生成・unit/静的検証まで。commit / push / 公開は未実施。**
- 計画: `C:/Users/hori3/.opencode/plan/organic-reaction-map-primary-backbone-redesign.md`

## 1. 重要度（正本）

`site-src/app11/route-priority.json` を新設した。

- 公開確認済み 86 反応を全件明示。未設定・未知ID・保留反応の混入は読み込み時にエラー。
- `tier` は `primary` 50 / `secondary` 36。計画 §4.2 の ID 表をそのまま使用。
- `cross`（分野横断）は残し、`tier` の推定には使わない。
- 同一反応の全分枝は同じ tier。原料枝だけを補助へ落とすことはしない。
- 入力 hash（confirmed 反応 + priority の正規化行）:
  `a3c90d6744811642eba35586b872973c40a6dd4d3c69db1fffd6b299c1422fe2`
- `layout.json` / `routes.json` / `data.js` はこの hash を保持し、不一致なら生成を停止する。

## 2. 位相（平面性）の先行検証

`scripts/app11/planarity/embed-primary.py`（開発時のみ）で NetworkX 3.6.1 の
Left-Right Planarity Test を実行し、`site-src/app11/primary-topology.json` に
巡回順・面・成分・二重連結成分・補助成分の共面制約を固定した。

- 主要グラフ `G_P`: 115 頂点（物質 65 / 反応 50）、117 枝、**planar = true**。
- 連結成分 11、面 24。各成分で `V - E + F = 2` を Node 側でも再検証。
- 補助成分 7。固定埋め込みで **6/7 が共面**。
- 残る 1 成分（55 ノード）は接続点 7 つ
  （`acetic-acid`, `ethanal`, `ethanol`, `formic-acid`, `glycerol`, `methanol`, `triolein`）
  が同一面に載らず、**P–S ゼロはこの埋め込みでは実現できない**。
  このため P–S は例外的に残し、件数・位置を metrics に出す（隠さない）。
- 非平面 fixture `scripts/tests/fixtures/app11-topology-k33.json` は
  `assertPlanarCertificate` が「非平面」で停止することをテストする。
- NetworkX は Node / ブラウザの実行時依存ではない。CI は `node --test` のみで、
  保存済み証明書の検証（Euler・半辺重複・入力hash）を行う。再生成手順:
  ```powershell
  py -3 -m venv .venv-app11
  .venv-app11\Scripts\python -m pip install -r scripts/app11/planarity/requirements.txt
  .venv-app11\Scripts\python scripts/app11/planarity/embed-primary.py
  ```
  `.venv-app11/` は `.gitignore` 済み。

## 3. 配置・配線の方式

1. `backbone-layout.cjs`: 学習系列ごとの部品（脂肪族主幹・エステル、サリチル酸、
   芳香族 14 頂点環、クメン法、油脂、糖、ペプチド、高分子、孤立棚）を明示座標で配置。
   次数の多いハブだけ幅を広げる（136 / 176 / 194 / 212）。力配置の seed 調整はしない。
2. `priority-router.cjs`: 主要のポートを相手方向の巡回順に割り当て、まず直線で結ぶ。
   P–P が残る枝だけ格子 A* で迂回（`resolvePrimaryCrossings`）。
   主要ラベルは配線後に、辺・物質・他ラベルを避けて置く。
3. `secondary-layout.cjs`: 主要の外側・空いた面に補助を置く。補助だけの連結成分は
   主要接続点から BFS でたどり、反応点の周りに扇状に物質を置く。主要線を横切る枝は
   迂回し、無理な場合だけ交差として残す（`countPrimaryCrossings`）。
4. `optimize-layout.cjs`: 補助配置後に、主要枝が補助ノード・全ラベルを貫通していたら
   主要側を再配線（現在は主要を凍結）。最後に孤立 326 物質を右側の棚へ置き、
   `verifyAllRoutes` で全 207 枝の有限性・ノード/ラベル/反応点貫通を検査し、
   失敗時は layout/routes を書き出さず停止する。

### 3.1 障害物矩形の取り違え修正（root cause）

`makeObstacles` は `{kind, id, rect}` を返すが、`pointFree` / `segmentClear` /
`makeGrid` が要素を直接 `G.inflate` へ渡していたため、座標がすべて NaN になり
障害物判定が無効化されていた。`rectOfObstacle` で `rect` を取り出し、
非有限値を即エラーにする。これにより補助のノード/ラベル貫通が 0 になった。

- 補助の A* は主要辺を **hard wall にしない**。`softSegments` として
  セルコストだけ上げ、P–S 交差を許可しつつ回避を促す。
- 補助の直線 fallback は全経路検査を通った場合だけ採用する。
  未検査の direct fallback は使わない。

保存形式は v4。`positions` は物質ごとの `w/h/tier`、`reactions` と `routes.edges` は
`tier` を持つ。閲覧時の再配置はしない。

## 4. 計測結果（同じ priority）

`node scripts/app11/metrics.cjs` で計測。v3 は `scripts/tests/fixtures/app11-v3-primary-baseline.json`
（cf4756d の routes に現 priority を適用した集計）を基準にした。

| 項目 | v3 | 新案 |
|---|---:|---:|
| 主要枝 / 反応 | 117 / 50 | 117 / 50 |
| 補助枝 / 反応 | 90 / 36 | 90 / 36 |
| 主要総長 | 23,784 px | **17,267 px（-27.4%）** |
| 主要曲がり p95 / 最大 | 未計測（旧方式） | **0 / 0** |
| 主要迂回率 p95 | 未計測 | **1.00** |
| P–P 交差 | 404 中（v3 全体） | **0** |
| P–S 交差 | — | 18 |
| S–S 交差 | — | 20 |
| 主要ノード貫通 / ラベル貫通 | 0 / 0（v3 一律寸法） | **0 / 0** |
| 補助ノード貫通 / ラベル貫通 | 0 / 0（v3 一律寸法） | **0 / 0** |
| 反応点-物質の衝突 | 0（v3 一律寸法） | **0** |
| 反応点相互の衝突 | 0（v3 一律寸法） | **0** |
| ラベル-物質 / ラベル-ラベル | 0 / 0 | **0 / 0** |
| ノード重なり | 0（v3 一律寸法） | **0** |
| 同一区間の連続共有 | 0（v3 一律寸法） | **0** |
| 主要同士の clearance 不足 | — | **0** |
| S–S の clearance 不足 | — | 3（許容交差の近接） |
| 総辺長 | 43,261 px | 33,445 px |
| 実際の地図 1236×475 pad14 fit | **0.240**（v3） | **0.193**（約19.5%悪化、20%以内） |
| PC 1280×900 pad0 fit | 0.254 | 0.212 |
| mobile 390×844 fit | — | 0.060 |
| キャンバス | 5,033 × 1,852 | 6,052 × 2,314 |

補足:

- **ハード条件を満たした**: P–P 0、主要/補助のノード貫通 0、ラベル貫通 0、
  反応点-物質 0、反応点相互 0、ノード重なり 0、同一区間共有 0、主要同士の clearance 0。
- P–S 18 / S–S 20 はユーザー許可済みの交差。主要辺を hard wall にせず、
  grid A* の soft cost で回避している。件数・位置は `metrics.crossings.samples`。
- S–S の clearance 不足 3 は、許可された S–S 交差の近接。主要保護帯の違反は 0。
- 主要曲がり 0、補助曲がり p95 2。補助総長 16,178 px。主要優先の結果。
- 主要長は 27.4% 短縮で、25% 目標を上回る（17,267 px / v3 23,784 px）。
- 反応ラベルは主要だけ SVG。補助ラベルは高倍率（level 2）の HTML オーバーレイとカード。
- 矢印: 主要・補助とも `marker-end`。`out` 枝は点列を反転して生成物側へ向ける。
- 孤立棚は右側（12列×28行）。旧 v3 の実際の地図 fit 0.240 に対し 0.193 で、
  **20%以内**（約19.5%悪化、ぎりぎり）。同じ 1236×475 pad14 で比較した。
- v3 の旧記録（ノード重なり0・反応点衝突0）は**旧一律 136×34 寸法**で再現する。
  v1 fixture の 2 重なり/15 衝突は v3 の値ではなく、比較に使わない。

## 5. 画面

- 主要 = 太い実線（3px、`--rp-primary`）、補助 = 細い点線（1.1px、`stroke-dasharray: 6 5`）。
- 主要・補助とも `marker-end` の矢印を描く。`out` 枝は点列を反転して生成物のノード端へ向ける。
  矢印は `userSpaceOnUse` で、ズームしても消えない。
- `cross` は線種から切り離した。補助はすべて点線で、`cross` の有無に依存しない。
- LOD:
  - level 0/1 でも主要線は消さない（opacity 0.95/1）。
  - 補助線は level 0=0.16、1=0.34、2=0.62。非表示にして交差を減らす扱いはしない。
  - 主要の反応種別ラベルは level 0 から表示。補助ラベルは level 2 の HTML オーバーレイで
    衝突を避けて表示。条件は level 2 のみ。
  - 補助オーバーレイは、主要 SVG ラベルの実 DOM 矩形（`getBoundingClientRect`、stroke 半幅ぶん拡張）と
    ノードの実 stroke 矩形（同実測 + 4px + stroke 半幅 + 1.5px）を障害物にする。候補位置に置いた後に
    タグ自身の実寸を再測定し、衝突した候補は破棄して次の候補へ移る。全滅時は当該タグだけ抑制し、
    カードと focus は残す（全 overlay 0 にはしない）。
- 物質ごとの `w/h` を描画・当たり判定・fit・中央寄せに使用。
- 凡例を「主要経路（太い実線）/ 補助経路（細い点線）」へ変更。カードに tier を表示。
- 3テーマ・reduced motion・mobile・keyboard・カード外クリック/Escape・フォーカス復帰は
  既存の仕組みを維持（変更は tier 描画・矢印・補助ラベル overlay・個別寸法）。

## 6. 検証

- `node scripts/app11/optimize-layout.cjs --check`: 一致（決定的）。
- `node scripts/app11/build-map-data.cjs --check`: 一致。
- `node --test scripts/tests/app11-reaction-map.test.cjs`: **36/36 pass**。
  `[hard] 幾何ハード条件` も pass。
- 実描画（Chrome headless、3テーマ×1280×900/390×844×36補助反応×scale 1/1.5 = 432フレーム）:
  補助オーバーレイと主要 SVG ラベルの重複 **39 → 0**、ノード stroke + 4px pad 未達 **21 → 0**
  （実測 clearance 最小 4px 超）。overlay は全フレーム非空、総表示 1,521 インスタンス、
  対象反応のタグは全フレーム表示。主要ラベルと自マーカーの最小間隔は 13.9 world px（衝突 0）。
- 追加した回帰:
  - priority 全86件・主要50/補助36・hash 一致
  - 主要グラフ平面性・Euler・共面不能成分 1
  - K3,3 非平面 fixture の安全停止
  - tier 別 metrics（PP/PS/SS・長さ・曲がり・迂回率・ストローク clearance）
  - 主要太線/補助点線/LOD/個別寸法
  - 幾何ハード条件（全 0）
  - v3 一律寸法 baseline と v1 fixture の非混同
  - 主要ラベルの自マーカー余白・実測幅余裕
  - 共有ポート/同一反応外の主要実 path 交差 0
  - 補助 overlay の主要ラベル実 DOM・node 実 stroke 障害物と実寸再検査
- `verifyAllRoutes` が全 207 枝の有限性・障害物貫通を検査し、失敗時は書込み前に停止する。
- 実操作・スクリーンショット・3テーマ×PC/モバイルの最終確認は `test` サブエージェントの担当。
- 未確認: タッチ操作、テーマ切替の見た目。

## 7. 未達・判断が必要な点

1. **P–S 18 / S–S 20**。ユーザー許可済みの交差。P–S は主要辺を hard wall にせず
   soft cost で回避している。P–P は 0。
2. **S–S の clearance 不足 3**。許可された S–S 交差の近接で、主要保護帯の違反は 0。
3. **fit 0.193（1236×475 pad14）**。旧 v3 0.240 より約19.5%悪く、20%以内。
   PC 全画面 0.212 / mobile 0.060。ネットワーク幅 4,132 px の圧縮は未実施。
4. **橋なし**。残存 S–S は橋で区別していない（交差数も減らしていない）。
5. **補助ラベルは SVG に出さない**。高倍率（level 2）の HTML オーバーレイとカードで表示。
6. **主要ラベルは自由配置**。条件はカードへ移した。主要/補助の障害物貫通・重なり・
   同一区間共有・主要 clearance は 0 をテストで固定。

## 7.1 ハード条件の検証

`[hard] 幾何ハード条件` テストで、P–P 0、主要/補助ノード貫通 0、ラベル貫通 0、
反応点-物質 0、反応点相互 0、ノード重なり 0、同一区間共有 0、主要 clearance 0 を
assert する。unit assert は緩和していない。

## 8. 再生成・確認コマンド

```powershell
# 開発時依存（初回のみ）
py -3 -m venv .venv-app11
.venv-app11\Scripts\python -m pip install -r scripts/app11/planarity/requirements.txt
.venv-app11\Scripts\python scripts/app11/planarity/embed-primary.py

# 保存済み座標・経路・data.js
node scripts/app11/optimize-layout.cjs
node scripts/app11/build-map-data.cjs

# 決定性・正規形
node scripts/app11/optimize-layout.cjs --check
node scripts/app11/build-map-data.cjs --check

# 回帰
node --test scripts/tests/app11-reaction-map.test.cjs
```
