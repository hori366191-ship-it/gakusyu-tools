# app11 反応ラベル配置ソルバ（共通 API）

有機反応マップ（`site/app11`）の反応ラベル `typeLabel` を、**自分の配線の近く**に置き、
**他の反応の線に近すぎる誤対応**をなくすためのオフライン・ソルバ。
通常モード・アカデミック配置・B の新しい通常配置案（proposal）で同じモジュールを使う。

- 実装: `scripts/app11/reaction-label-layout.cjs`（純関数・DOM 非依存）
- 計測/生成アダプタ: `scripts/app11/label-quality.cjs`（`site/app11/map-core.js` の
  `reactionConnectors → separateSharedPorts → enforcePaintClearance → routePath` を
  そのまま使い、実際に描かれる線を評価する）
- テスト: `scripts/tests/app11-label-layout.test.cjs`
- 生成: `optimize-layout.cjs` / `build-academic-data.cjs` のラベル後処理から呼ぶ

乱数・時刻・seed は使わない。同じ入力なら同じ出力になる。

---

## 1. 入力契約（plain JSON）

```js
solveLabels({
  compounds: { [id]: { x, y, w, h } },              // 物質ノード矩形（左上原点）
  reactions: { [id]: { x, y, tier, typeLabel,
                       conditions, substrates, products } },
  edges:     { [key]: { reaction, compound, dir, tier,
                        points: [[x,y], ...] } },     // 保存済み経路（stored）
  lines:     { [reactionId]: [ [{x,y}, ...], ... ] } // 実際に描かれる線（drawn / 任意）
  labels:    { [id]: { box:{x,y,w,h}, side, leader? } }, // 現配置（任意。無ければ新規）
  blockers:  [ { x, y, w, h, id? } ]                 // 追加障害物（一般図など・任意）
}, {
  targets: [reactionId],   // 省略時は labels のキー
  priority: [reactionId],  // 先に解く代表ラベル
  typeH: 16,               // 通常 16 / アカデミック 18
  width: (text) => px,     // ラベル幅。通常/アカデミックで式が違う
  repairPasses: 1
})
```

`lines` が無い場合は `edges` から折れ線を作って代用する。`lines` と `edges` は
**両方**評価対象になる（stored と drawn の union）。

## 2. 出力契約

```js
{
  labels: {
    [id]: {
      side: 'E' | 'W',           // 情報用（描画は box と anchor に従う）
      type: { x, y },            // box の中心（anchor='center' 統一）
      box:  { x, y, w, h },      // 実描画矩形（唯一の正）
      cond: null,
      leader: null | [[x,y], ...] // 短い引き出し線（必要なときだけ）
    }
  },
  metrics: {
    [id]: { state:'direct'|'leader'|'unresolved',
            ownerDistance, foreignDistance, margin,
            leaderLength, originDistance, changed, reason }
  },
  summary: { targets, direct, leader, unresolved, changed }
}
```

生成側アダプタ（`label-quality.cjs`）は上に `anchor: 'center'` を付けて保存する。
C（描画）は `label.anchor` 優先で box から start/end/middle を決め、`leader` は
同一 reaction group・同一 LOD の polyline として描く。旧 E/W アンカー規約への
変換は行わない（二重解釈しない）。

---

## 3. アルゴリズム

1. **候補生成**: 自線（stored+drawn）を 20px 間隔 + 25/50/75% + 端点でサンプルし、
   各点の左右・上下へ gap 4/8/12 の水平ラベル矩形を作る（横長ラベルが別の自線区間に
   近づくケースも拾う）。直接置けない場合だけ、粗いアンカーから 8 方向 × 半径
   16〜64 の **leader** 候補（長さ ≤48）を作る。
2. **ハード制約**: `box` は
   - 全物質ノード（pad 3）と重ならない
   - 既に置いた他ラベル（pad 3）と重ならない
   - 全マーカー（pad 3）と重ならない
   - **全描画線（自線を含む）から 4px 以上**離れる
   - 追加障害物（一般図ノード・枠）と重ならない
   leader は文字・他線・ノードと交差しない。
   どうしても 1 つも通らない場合だけ、線余白を段階的に緩める（代表ラベルは
   最後に厳密 4px 候補へ戻す。緩和した事実は `unresolved` として残す）。
3. **スコア（辞書式・最小化）**:
   1. `violation = max(0, 8 - (foreign - own))`（異名線への誤対応）
   2. `own`（自線距離）
   3. leader の有無（leader なしを優先）
   4. 元位置からの距離（無用な移動を避ける）
4. **順序**: `priority` → 既存 margin が小さい順 → id。greedy のあと局所 repair を
   `repairPasses` 回。最後にラベル同士の重なりだけは必ず 0 に整合する。
5. **凍結**: 既存ラベルが要改善条件（`own ≥ 25`、または `own ≥ 12` かつ
   `own-foreign ≥ 5`）に該当しなければ動かさない。該当ラベルだけを候補探索する。

### 品質の測り方

- `own` / `foreign` は **ラベル矩形と線分の最短距離**（角・線分の両方）。
- 実際に描かれる線は Node でも `site/app11/map-core.js` を require して同じ関数で作る
  （端点スナップ・共有ポート分離・paint clearance 後）。保存経路と union して評価する。
- `margin = foreign - own`。目標は `own ≤ 12` かつ `margin ≥ 8`。

---

## 4. 通常モード（162 反応 / ラベル 80・null 82）

`optimize-layout.cjs` の `planExtensionLayout` が、位置・マーカー・経路を確定した
**後**にラベルだけを後処理する。物質座標・マーカー・保存経路・tier・facts は不変。

### 代表（ユーザー報告 + 強5件）

強5件（正式）は ethanol-dehydration-ethene / ethyne-full-hydrogenation /
acetic-acid-sodium-carbonate / ethanol-sodium / methanol-cuo-oxidation。
ethanol-cuo-oxidation はユーザー例（ethanol 系3件）であり強5には含めない。

| 反応 | before own | before foreign | after own | after foreign | state |
|---|---:|---:|---:|---:|---|
| ethanol-dehydration-ethene | 73.71 | 6.42 | 4.48 | 23.56 | direct |
| ethyne-full-hydrogenation | 69.43 | 16.25 | 6.21 | 46.48 | direct |
| acetic-acid-sodium-carbonate | 59.36 | 6.51 | 4.88 | 25.01 | direct |
| ethanol-sodium | 60.48 | 12.20 | 2.71 | 6.47 | **leader** |
| methanol-cuo-oxidation | 43.17 | 19.98 | 6.58 | 79.05 | direct |
| （参考）ethanol-cuo-oxidation | 48.65 | 6.56 | 6.17 | 19.88 | direct |
| （参考）ethene-hydration | 23.54 | 10.92 | 7.55 | 26.31 | direct |

**ethanol-sodium** は `margin 3.76 (<8)` だが、`own 2.71 < foreign 6.47` で自線の方が近い。
ラベル境界 (1135.52,423.70) から自線 (1135.52,420.99) への **長さ2.71の leader** が
有効（終点は自線距離0.00、開始点から他の線まで42.63、他線/ノード/他ラベル横断0）で、
`state: 'leader'` として関連付けを明示する。strict direct（margin≥8）とは別カテゴリ。

### 要改善候補（親共有の固定26 ID。基準 own ≥ 25 または own ≥ 12 かつ own-foreign ≥ 5）

before は HEAD 時点、after は現行。**own は実際に描画される Core path（shaft + arrow 塗り、sample 0.25）**で測定し、
保存経路は障害物としてのみ使う。26 ID をそのまま網羅する。

| 反応 | before own | before foreign | after own | after foreign | leader | 状態 |
|---|---:|---:|---:|---:|---|---|
| ethanol-dehydration-ethene | 74.86 | 6.42 | 5.76 | 22.25 | - | direct |
| ethyne-full-hydrogenation | 72.61 | 16.25 | 1.22 | 21.72 | - | direct |
| acetic-acid-sodium-carbonate | 59.24 | 6.51 | 4.89 | 25.01 | - | direct |
| ethanol-sodium | 60.48 | 12.20 | 3.13 | 1.15 | 3.1 | leader |
| methanol-cuo-oxidation | 43.17 | 19.98 | 6.58 | 81.29 | - | direct |
| glucose-fermentation | 48.38 | 26.69 | 4.17 | 25.53 | - | direct |
| methyl-salicylate-hydrolysis | 16.81 | 0.00 | 11.80 | 16.29 | 23.4 | leader |
| ethene-hydration | 23.54 | 10.92 | 7.55 | 23.51 | - | direct |
| ethanol-cuo-oxidation | 56.71 | 6.56 | 7.83 | 20.29 | - | direct |
| benzoic-acid-neutralization | 68.53 | 2.34 | 5.11 | 26.46 | - | direct |
| propan-2-ol-cuo-oxidation | 78.91 | 51.46 | 10.73 | 27.13 | - | direct |
| triolein-hydrogenation | 17.80 | 7.98 | 7.21 | 12.53 | 7.6 | leader |
| polyacetylene-polymerization | 26.27 | 17.97 | 3.75 | 19.27 | - | direct |
| chlorobenzene-dow-phenol | 23.16 | 14.86 | 7.22 | 23.43 | - | direct |
| caprolactam-ring-opening | 12.71 | 4.92 | 4.13 | 40.04 | - | direct |
| salicylic-acid-methyl-esterification | 16.69 | 10.48 | 16.69 | 10.48 | 28.7 | leader |
| ethyne-hydrogen-bromide | 41.07 | 35.94 | 8.00 | 16.87 | - | direct |
| sodium-acetate-decarboxylation | 80.28 | 70.38 | 4.03 | 26.72 | - | direct |
| phenol-nitration | 35.94 | 35.00 | 35.94 | 35.00 | 45.0 | leader |
| phenol-phthalein | 36.26 | 37.82 | 4.36 | 48.07 | - | direct |
| ethyne-partial-hydrogenation | 27.60 | 32.79 | 7.44 | 22.45 | - | direct |
| stearic-acid-neutralization | 62.79 | 71.98 | 4.61 | 30.24 | - | direct |
| ethylbenzene-dehydrogenation | 64.60 | 75.10 | 6.13 | 29.84 | - | direct |
| benzene-chlorine-addition | 27.57 | 47.67 | 5.79 | 28.79 | - | direct |
| sodium-phenoxide-acidification | 25.06 | 51.52 | 7.20 | 46.14 | - | direct |
| acetic-acid-anhydride | 40.57 | 67.58 | 4.36 | 30.21 | - | direct |

- 26 ID は **21件 direct / 5件 leader**（実 `label.leader` 配列を全26 IDで数え直した値）。真の逆転（own > foreign）で leader 無しの残件は 0。
- leader は実際に描画される Core path へ接続（終点距離 ≈0、arrow 塗り含む）。長さ ≤80、
  他線/ノード/他ラベル/他 leader 横断 0。近隣2〜3ラベルの局所 repair を先に行い、
  必要時のみ L字/2bend leader。
- 全80では **direct 58 / leader 22 / unresolved 0**。strict 未達22はすべて leader 有効。
- 旧 80 ラベル・null 82・マーカー 162・経路 375・物質 427 は不変。旧 86 facts / 旧 101 接続物質 /
  旧 207 経路も不変（`verifySource` / `verifyLayout` 0件）。ラベル重なり0・線/ノード/マーカー貫通0。

### 未解決の厳密分類（通常）

strict 目標（own≤12 かつ margin≥8）を満たさない 22 件は、すべて有効 leader を持つ（unresolved 0）:

| 分類 | 件数 | 内容 |
|---|---:|---|
| (1) 真の逆転 / own≥25 | 6 | aspirin-hydrolysis, ethanol-sodium, glycine-alanine-peptide, phenol-nitration, phthalic-acid-anhydride, salicylic-acid-methyl-esterification |
| (2) margin のみ不足 | 6 | own≤12 かつ own<foreign だが margin<8 |
| (3) 同一反応系・共有線 | 10 | 最近接 foreign が owner と物質を共有 |

**真の逆転で leader の無いラベルは 0件**。leader は state 文字列ではなく、
実 Core paint への接続・長さ≤80・他要素横断0 をテストで独立検証する。

---

## 5. アカデミック配置（314 ラベル）

`build-academic-data.cjs` は `academic-network-layout.buildLayout` の直後
（マーカー座標・経路を確定した後）に `applyAcademicLabelLayout` を呼ぶ。
`placed.markers` / `placed.normalMarkers` の `label` だけを差し替える。
一般図ノード・枠は `blockers` として渡す。

直近の生成結果（determinism check 済み）:

- targets 314 / **direct 195 / leader 111 / unresolved 8** / 変更 4（spacing 1.06 + helper 精密化後）
- strict 目標（own≤12 かつ margin≥8）を満たさない 136件の内訳:
  - 真の逆転 57件
  - `own ≥ 25` 2件
  - `own ≤ 12` かつ `own < foreign` で margin のみ不足 67件
  - その他（共有線・近接）
- 状態 unresolved は 27件。うち **真の逆転かつ leader 無しは 22件**（leader 経路がノード/線/他ラベルで閉塞）
- 109件は leader（通常≤48、救済時≤80）で自線へ接続して関連付けを明示（他線/ノード/他ラベル横断0、実 Core paint 検証）。
  旧配置は marker から 26px に置く設計で「自線 12px 以内」を満たしにくいため、
  strict 未達の多さをそのまま「不具合」とは扱わない。
- アカデミックの `stats.collisions`（ラベル重複・ラベル-ノード・ラベル-経路貫通）は
  生成後も 0 のまま（ソルバのハード制約が同じ条件を守る）。

---

## 6. 再生成

```powershell
node scripts/app11/optimize-layout.cjs        # layout.json / routes.json
node scripts/app11/build-map-data.cjs         # data.js / coverage-ids.js
node scripts/app11/build-academic-data.cjs    # academic-data.js
node scripts/app11/optimize-layout.cjs --check
node scripts/app11/build-academic-data.cjs --check
```

- `optimize-layout.cjs` はラベル後処理の summary を標準出力に出す。
- `scripts/tests/app11-label-layout.test.cjs` は固定26 ID 全件について、
  strict direct（own≤12 かつ margin≥8）または **実 leader geometry**
  （境界start / 自visible line endpoint≈0 / ≤80 / 他線・ノード・他ラベル・他leader横断0）
  を検証し、真の逆転で leader 無しを許さない。全80のラベル重なり0・線貫通0・
  旧positions/routes/facts 不変も同時に固定する。
- 時間目安: `optimize-layout` 約 100 秒（うちラベル後処理 約 3 秒）、
  `build-academic-data` 約 25〜30 秒（うちラベル後処理 約 15〜18 秒）。
  候補は空間インデックスで絞り、最終採用ラベルだけ実描画線で厳密測定する。

## 7. B（新通常配置 proposal）での再利用

- B の proposal 生成データは `{ compounds, reactions, edges, lines, labels }` の形で
  そのまま `solveLabels` に渡せる。`targets` に proposal の 162 反応を指定する。
- B の配置は `lines` を渡すのが望ましい（`label-quality.buildDrawnLines` で作れる）。
  無くても `edges` から代用する。
- `leader` を描画する場合も同じ LOD・同一 reaction group に限定する（C 実装済み）。
- 重なり 36 / clearance 450 などの密集課題は、B 側の候補空間を広げた後に
  本ソルバを後 pass する前提。solver の API は変えない。

### B `label-route-repair.cjs` 連携メモ（親判断: academic のみ局所 foreign route 救済可）

- 通常 current の保存 routes は変更禁止。アカデミックの「真の逆転かつ leader 無し」だけ、
  親承認の範囲で foreign route の局所 reroute を許可する。
- 対象抽出は `label-quality.cjs` の次の純関数で行う（nodepositions / facts は固定）:

```js
const A = require('./site/app11/academic-data.js');
const CM = require('./site-src/app11/class-map.json');
const Q = require('./scripts/app11/label-quality.cjs');

const geometry = Q.academicRepairGeometry(A.layout, CM, {}); // labels/lines/edges/reactions/compounds/blockers
const targets = Q.collectRepairTargets(geometry);
// targets[i] = {
//   id, box, anchor, type, ownerDistance, foreignDistance, margin,
//   foreignId, inversion, far,
//   ownerRouteKeys: [...], foreignRouteKeys: [...]   // この key だけ局所 reroute
// }
```

- `collectRepairTargets` は「strict 未達かつ (own > foreign または own ≥ 25)、leader 無し」だけを返す。
  直近の academic では **21件**。B helper は `foreignRouteKeys` の経路だけを、
  `compounds`（物質矩形）と `blockers`（一般図ノード・枠）を固定したまま局所的に引き直し、
  ラベル box と交差しない位置へ逃がす。
- B helper の API が決まったら `build-academic-data.cjs` のラベル後処理後に呼び、
  再測定・必要なら再 solve して最終 `academic-data.js` を確定する（A が統合担当）。
- B helper・B の build 側は A は編集しない（API は親経由で共有）。

### B helper 統合結果（academic 後 pass）

- build-academic-data.cjs が applyAcademicLabelLayout の後に label-route-repair.repair を呼び、
  protect[id].corridor = [label境界点, actualOwnerNearest] を渡す。
- 最終: 1st pass targets 12 / changed 34 / 2nd pass（searchMargin56・corridorClearance4・cell3）で **残 0**。
  **不正 leader 0 / label-line 貫通 0 / 異名 inversion leader無し 0 / far leader無し 0 / 同名近接 0**。
- own route・ノード座標・facts・class map は不変。normal の data.js / layout.json / routes.json は凍結（hash 不変）。
- reroute 後は stats.after の長さ系（count/total/mean/median/p95/max/ge1000）を実測へ再集計し、
  academic-layout の metrics と一致させる。
- ラベル: **direct 195 / leader 111 / unresolved 8**。学校重点5（acid-chloride / carboxylation /
  ethanal-reduction / acetic-acid-butanol / reductive-amination）はすべて解消。
- helper 修正: 保護 box は paint 帯（+2）とし clearance は corridor 側で担保、衝突 segment の
  連続 subchain を A* で置換（内部 waypoint 非固定）、corridor 端点まで探索範囲拡張、
  `corridorClearance` オプション（既定=clearance）で leader 用 corridor のみ 4px に分離。
  first segment は長さ≤18 のみ stub 固定、end cell block は `end-blocked` 理由で明示。
  自ノード内部へ入る reroute は拒否（new-node-penetration）。


### spacing 採用（学術専用）とテスト閾値の tradeoff

- academic-network-layout.buildLayout(opts) に spacing / netGrow を追加（build 側の既定は 1.06）。
  force 半径・ばね長・marker RADII をスケールし、NET を右最大120px/下最大 (spacing-1)*900px 拡張。
  通常 optimize-layout は opts を渡さないため global 影響なし。
- 学術 combined total: **旧出力 275,828 → 最終出力 298,560（298560.12）**（+約8.2%、spacing 1.06 と
  searchMargin / route 救済による出力そのものの差）。旧テスト上限 297,814.11 を
  **746.01px（0.250%）** 超過したため、上限だけを親承認の最小値で
  `const limit = BASELINE.combined.total * 0.55;` → **`* 0.5515`**（298,626.33）へ最終更新（C 所有）。
  上限差 0.250% は cap の余裕の話で、出力差 +8.2% とは別物として扱う。
  他閾値は充足: p95 1,164.69 ≤ 1,511、max 2,853.25 ≤ 3,457.6、ge1000 57 ≤ 113、
  academic.total 146,164.96 ≤ 254,017、crossingPairs 5,755 ≤ 5,799。hard 0（penetration / paintgap /
  fieldbounds）と不変 hash（D 55e806… / 旧86 coords・routes・labels）は据置。

### 交差数 5,755 の訂正（2026-11-19）

上の `crossingPairs 5,755` は **reroute 前の build 時点**（`academic-network-layout.cjs` の
`collisionStats`）の値で、ラベル再配置と学術 route 救済で辺を差し替えた後の値ではなかった。
最終データを同じ定義（異なるルートキー同士の線分交差・raw）で測り直すと **6,111**（反応が異なる組のみ
6,094）で、実際は 5,799 の gate を超えていた。gate を緩めずに直すため、
`scripts/app11/academic-crossing-relief.cjs` で辺の点列だけを交差の少ない候補へ差し替え、
build の最後に最終経路から hard collision と交差を測り直すようにした。

- 交差: 6,111 → **5,607**（raw、−8.2%）／反応違い 6,094 → 5,592。旧 gate 5,799 は据え置き、
  改修前実測比 6% 減の追加 gate（≤ 5,744）も満たす。
- 総延長: 298,560.12 → **296,810.01**（増やさない）。p95 1,164.69（同じ）、最長辺 2,853.25（同じ）、
  ge1000 57 → 56。
- ラベル: direct 195 / leader 111 / **unresolved 8（改修前と同じ）**。leader は実描画（Core paint）で
  再検証し、直せない反応の辺は元へ戻すため、不正 leader・異名逆転・遠距離 leader 無しは 0 を維持。
- ラベルを解き直して箱を動かす方式なら交差 4,821 まで下がるが、`unresolved` が 11 件へ増えるため採らない
  （既存ゲートとラベル品質を優先）。

- 代わりに実 visible label 対応ゲートを強化: leader は実 Core paint（shaft+arrow 塗り, sample 0.25）へ
  終点≈0・≤80・foreign/node/label/leader 横断0。通常26 ID と全80で独立検証、不正 leader 0。

### 実 visible ラベルゲートの metric 定義（同名/異名の分離）

- owner/foreign 距離は **Core の actual paint**（`reactionConnectors → separateSharedPorts →
  enforcePaintClearance → routePath → samplePath(0.25)` ＋ arrow triangle 塗り）のみで測る。保存 raw は使わない。
- **inversionDifferentNameNoLeader（必須 fail）**: `own > foreign + 0.25` かつ foreign 反応の `typeLabel` が
  owner と異なり、valid leader が無い。名前は空白除去後の完全一致で同一判定。
- **sameNameNearer（補助分類・fail にしない）**: `own > foreign + 0.25` だが foreign が同名 typeLabel。
  同名反応同士の線が近いのは誤対応と断定しない。
- **farNoLeader（必須 fail、名前不問）**: `own >= 25` かつ valid leader 無し。
- **invalidLeader（必須 fail、名前不問）**: 境界start・actual paint 終点・≤80・foreign/node/label/leader 横断のいずれか違反。
- **strictMarginOnly（補助）**: own≤12 かつ own<foreign で margin<8。fail 条件にしない。
- 直近 academic: labels 314 / invalidLeader 0 / **inversionDifferentNameNoLeader 0** /
  sameNameNearer 0 / farNoLeader 0 / strictMarginOnly 20（補助）。
- テスト helper: scripts/tests/helpers/app11-visible-geometry.cjs（A所有・require専用・B read-only 可）。
  合成 unit で「同名近接=補助のみ / 異名近接=fail / 同名でも own>=25=far fail」を固定。

### H 修正待ちの閉塞要因（in-memory 実測・出力不変）

- ethanol-sodium（異名・far）: label box x1942.83..2014.83 / y779.06..797.06、own nearest (2040.16,791.76)、
  corridor 長 25.33。corridor は x≈2030 の縦線束（ethene-hydration / ethanol-dehydration-ethene /
  academic-alkyne-hydroboration / academic-nitrile-sn2 / academic-sn2-hydrolysis）と距離0で交差し、
  straight・L字・2bend すべて foreign min 0.00。own 左側に十分な空きがなく（右は butanone ノード x2093〜）、
  leader ≤80 では接続不能。**corridor 単位の正確帯（capsule）で各 foreign を局所 detour するか、
  reroute 後の label 再 solve が必要**。
- glycerol-stearic-esterification（異名）: own 線の一部 y=1660 が
  methanol-oxidation-formaldehyde / acetic-acid-glycerol-esterification / glycerol-palmitic-esterification /
  propene-polymerization / pvac-hydrolysis / methanol-cuo-oxidation と**同一直線上で重なる**。
  own 点 (1905,1660) は foreign 距離0で、端点が foreign 上に載るため leader が常に cross 判定。
  own 上には foreign 距離>0.6 の自由点が 71/943 あるが、直線/L 経路が y=1660 の線束を横断する。
  **capsule 判定＋自由な own 点への 2bend、または重複 foreign の reroute** が必要。
- どちらも ID 手動座標ではなく、helper の capsule/exact 帯・多重交差反復・stub 判定修正後に
  「corridor 交差 foreign のみ」を局所 reroute する想定。current の spacing 1.06 は維持。
