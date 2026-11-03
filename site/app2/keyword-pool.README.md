# keyword-pool.json（app2「🎲 ランダムに3語」の候補データ）

- 用途: `site/app2/index.html` の「🎲 ランダムに3語」が使う候補。Pages が同じ origin で配信する。
- 出自: **教室向けに手選定した300語**。辞書データの転載ではない。アプリが backend から取得する `INV`（語→日本語定義）とは独立で、NGSL / Wiktionary / WordNet 由来でもない。意味・例文は持たない。
- `band` は難易度の目安（`basic` ≒ 7〜6級、`middle` ≒ 5〜4〜3級、`advanced` ≒ 準2〜1級）。**英検・CEFR の公式判定ではない**。
- `category` は選定用の分野（actions / animals / feelings / food / items / nature / people / places / school / travel）。3語は必ず異なるカテゴリから選ぶ。

## スキーマ

```json
{
  "version": 1,
  "source": "classroom-handpicked",
  "note": "…",
  "words": [{ "word": "cat", "band": "basic", "category": "animals" }]
}
```

## 検証（`rkValidatePool`）

1件でも不正なら全体を拒否する（fail-closed）。`version` 不一致、`words` 非配列、`word` が小文字 a-z の3〜20字でない、未知の `band` / `category`、正規化後の重複、3語未満、3カテゴリ未満、欠けた band は読み込み失敗として扱い、既存のキーワード入力は変更しない。

## 実行時の扱い

- 成功したプールだけメモリにキャッシュする。HTTP・JSON・検証の失敗はキャッシュせず、次の押下で再取得する。
- 取得は約10秒で打ち切る（`AbortController` + `Promise.race`）。timeout・通信失敗時も既存のキーワード入力は変更しない。
- 追加・変更時は重複、文字種、長さ、カテゴリ数、各 band の存在を上の検証に合わせる。

## 既存辞書（INV）との照合メモ

- 2026-11-03 の test 報告: 300語中293語が既存 INV に収録。未収録は amphibian, wallet, gadget, utensil, homework, suitcase, itinerary の7語。
- 未収録は不具合ではなく、教室向け手選定の300語を維持するもの。辞書からの転載ではない。
