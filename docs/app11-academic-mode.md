# app11 アカデミックモード（大学レベルの追加反応）

## 目的

通常の有機反応マップ（427 物質 / 86 反応 / 81 保留）を一切変えず、既存 427 物質の ID だけを参照する
overlay として、大学レベルの一般則で説明できる反応を追加表示する。物質は追加しない。

- 通常データ `site/app11/data.js` / `site-src/app11/layout.json` / `routes.json` は不変。
- 追加データの正本は `site-src/app11/academic-reactions.json`。
- 生成物は `site/app11/academic-data.js`（`scripts/app11/build-academic-data.cjs`）。
- レイアウト（マーカー位置・経路）は `scripts/app11/academic-layout.cjs` が通常座標を読んで決定的に生成する。
  通常ノードの座標は動かさない（Phase 1 overlay）。

## 件数（2026-11-17 生成）

| 項目 | 値 |
|---|---|
| 通常の物質 / 確認済み反応 / 保留 | 427 / 86 / 81（不変） |
| アカデミック追加反応 | 178 |
| 合計（通常＋アカデミック） | 264 |
| 大学レベル区分 | `academic`（`tierLabel: 大学レベル`） |
| 根拠の種類 | 一般則の適用 169 / 資料が個別例として示す変換 9 |
| 段階 | 一段階（direct）113 / 多段階（multi-step）65 |
| 重合模式式（mode P） | 25 |
| 新たに接続した孤立物質 | 136 |
| 通常ネットワーク接続（既存） | 101（不変） |
| アカデミック合計の接続物質 | 237 |
| 残る未接続物質 | 190（326 − 136） |
| アカデミック反応だけの弱連結成分 | 13 |
| 端点（辺）総数 | 421 |
| 描画できた辺 | 421（全辺） |
| カードのみ（線を引かない辺） | 0 |
| 全辺が線にならない反応 | 0 |
| 描画済みの新規接続物質 | 136（source graph の新接続と一致） |
| 可視の学術辺を持つ物質（通常接続含む） | 198 |
| ラベル混雑の警告 | 14（ノード非衝突の safe 位置へ退避した記録） |

全辺が描けない反応も一覧・検索・カードからは開ける。無言で消さない。

## 通常 4 ハッシュ（不変）

`app11-hit-targets.test.cjs` の 4 つ（concrete / equation / class geometry / notice DOM）は
変更していない。アカデミックのテストは別ファイル `scripts/tests/app11-academic.test.cjs`。

## データ規約

- 反応 ID は `academic-*`。通常 86・保留 81 の ID と衝突させない。
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
```
