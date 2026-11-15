# app11 全画面レイアウトと「このアプリについて」ダイアログ

対象: `site/app11/index.html` / `app.css` / `app.js`（データ・地図 geometry は変更しない）

## レイアウト

- `body.rp-app` は `display: grid` / `grid-template-rows: auto minmax(0, 1fr)`。
  高さは `100vh`（fallback）→ `100dvh`、`overflow: hidden` でページ自体はスクロールしない。
- ヘッダーは1段の最小構成（brandmark・タイトル＋試験版・既存リンク・「このアプリについて」）。
- `main.rp-wrap` は余白なしの flex。`section.rp-map-panel` は枠・角丸・影なしで残り領域を取り、
  `#rp-map` が `flex: 1 1 auto; min-height: 0` で残り全幅・全高を使う。地図の下に常設の情報は置かない。
- safe-area は body の padding とヘッダーの `env(safe-area-inset-top)` で確保する。

## 浮遊ツールバーと fit の上余白

- ツールバーは `#rp-map` の外（パネル直下）に置いた絶対配置の浮遊操作群。
  検索・拡大縮小は1行、分野チップは横スクロール。地図の pointer / wheel / key ハンドラには含めない。
- `syncToolbarInset()` がツールバーの実寸を測り、`mapTopInset`（地図高の42%が上限）を更新する。
  `ResizeObserver` で折り返しの変化にも追従する（現在の表示は動かさない）。
- 全体表示・分野チップ・検索/一覧からの移動・反応の端点表示・一般図の fit は、上を `mapTopInset`
  だけ狭めた領域で計算し、結果を `mapTopInset` だけ下へずらす。`map-core` の
  `fitTransform` / `centerOn` / `regionView` / `fitRect` は `[0, innerH]` の中央へ置くため、
  実表示領域 `[top, H]` の中心 `(H + top) / 2` へは `top` を足す（`top/2` では `H/2` に戻る）。
  一般図は下帯も予約するので `innerH = H - top - bottom` とし、同様に `top` を足す。
  SVG viewport は full サイズのままなので、ワールド座標の変換を二重に補正しない。
  `innerH` の下限 160px は、極端に低い画面で倍率が潰れないための最小値（この場合も中心は
  `innerH/2 + top` で、実表示領域より少し下寄りになる）。
  ユーザーのパン・ズームは制限しない。
- 現在位置（右下）と「一般図へ」の導線、popover の内部スクロールは従来どおり。
  フローティングカードは現在位置の上に置き、下の位置ボタンを覆わない。

## 「このアプリについて」ダイアログ

- 注意枠・物質一覧・状態/データ説明・フッターは `<dialog class="rp-about" id="rp-about">` へ移動。
  文言と ID（`rp-data-notice` / `rp-list` / `rp-info` / `rp-footer` ほか）は移動前のまま。
- 開くときは `showModal()`。Escape・フォーカストラップ・フォーカス復帰は native の動作に任せ、
  document の Escape 処理はダイアログが開いている間は何もしない（地図のキー操作も奪わない）。
- 開く前にカードと現在位置の popover を閉じる。本文はダイアログ内部でスクロールし、backdrop を敷く。
- 一覧から選ぶとダイアログを閉じてから地図移動とカード表示を行う。カードを閉じたときの
  フォーカス復帰先は、閉じたダイアログ内のボタンではなくヘッダーの起動ボタン。
- 検索の Enter はダイアログ内の一覧ボタンへフォーカスせず、先頭の一致物質へ移動してカードを開く。
  0件のときは検索欄の小さな `role="status"` に「一致なし」とだけ出す。
- スキップリンクは「地図へ」（`href="#rp-map"`、地図は `tabindex="-1"`）。

## 自動テスト

```
node --test scripts/tests/app11-*.test.cjs
```

- `app11-fullscreen.test.cjs`: グリッド/高さ/パネル余白なし、常設下部情報なし、dialog の
  showModal→close・フォーカス復帰、一覧→カードで閉じた dialog に focus しないこと、
  検索 Enter、ツールバー実寸の上限、fit が実表示領域の中心 `(H+top)/2` に来ること（Core の
  実関数で投影して検証）、分野・物質の移動も同じ中心になること。
- `app11-hit-targets.test.cjs`: 注意枠の文言ハッシュを保ったまま dialog 内へ移動したこと。
- `app11-class-map.test.cjs`: 一般図 fit が上余白を予約し、下帯と合わせて収めること。

## 未実施

ブラウザでの目視確認・操作確認・スクリーンショットは未実施（自動テストのみ）。
