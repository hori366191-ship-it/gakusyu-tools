# app11 操作系（ホイール拡大・現在位置フローティング・ヒント削除）

- 日付: 2026-11-15
- 対象: `site/app11/app.js`、`site/app11/map-core.js`、`site/app11/app.css`、
  `site/app11/index.html`、`scripts/tests/app11-wheel-position.test.cjs`（新規）、
  `scripts/tests/app11-reaction-map.test.cjs`（現在位置の静的テストを更新）、
  `scripts/tests/app11-hit-targets.test.cjs`（固定ハッシュを投影ごとに分割）
- 触っていない: 具体図427物質・86反応・反応経路・当たり判定18px・3テーマ・共通テーマ・
  他アプリ・GAS/Worker

## 1. ホイールで拡大縮小（修飾キー不要）

- `map-core.js` に純関数 `wheelZoomFactor(deltaY, deltaMode, viewH)` /
  `normalizeWheelDelta` を追加。
  - 1ノッチ = `deltaY` 100px = **1.35倍**（上方向で拡大・下方向で縮小）
  - `deltaMode=1`（行）は 3行 = 1ノッチ、`deltaMode=2`（ページ）は viewport 高さ = 1ページ
    （`mapEl.clientHeight`。取れないときは 800px）
  - トラックパッドの微小 delta は丸めず比例（`1.35^(delta/100)`）
  - 1イベントの変化は **3ノッチで頭打ち**（行・ページ単位の入力でも飛ばない）
  - `deltaY=0`・横方向だけの入力は倍率 1（=何もしない）
- `app.js` の `onWheel` は修飾キーを見ない。`Ctrl/Meta` を押していても同じ動作。
  `preventDefault` は **地図の上だけ**。`document` に wheel リスナーは追加しない。
- 現在位置・凡例・「一般図へ」・button/input/select/textarea の上では既定動作を優先し、
  zoom も `preventDefault` もしない。
- 拡大は **カーソル位置を軸**（`Core.zoomAt`）にし、`wheelZoom` に目標を累積する。
  毎イベント `animateTo` を再始動せず、`requestAnimationFrame` 1本で残差の40%ずつ詰める
  （短い比例補間）。連続入力でも途中の移動が消えない。
- 他の操作（パン・ピンチ・キー・ボタン・fit・resize）が入ると `cancelWheelZoom()` で
  目標を捨てる。`setView` を唯一の入口にして、ホイール補間中だけ `wheelApplying` で除外する。
  古い目標へ戻る「巻き戻り」は起きない。
- 拡大率の上下限（0.05〜3.0）に当たったらその位置で止まり、目標も動かさない。

## 2. 現在位置を地図の右下フローティングへ

- DOM を `.rp-toolbar__row` から `#rp-map` の内側（SVG と変換層の外）へ移した。
  toolbar 行は拡大縮小ボタンと検索だけになり、地図の上端が詰まる。
- CSS: `position: absolute; right: 12px; bottom: 12px; width/max-width: min(420px, 100% - 24px)`。
  2行固定（`height: 1.45em` + `overflow: hidden` + `text-overflow: ellipsis`）は維持。
  背景・枠・影はテーマ変数（`--rp-panel` / `--rp-line` / `--rp-shadow`）。
- 全文 popover は起点ボタンの兄弟のまま。**上向き**（`bottom: calc(100% + 6px); top: auto`）に開き、
  高さは JS（`syncPositionPopoverBox`）が `mapEl.clientHeight` から算出して
  map-panel の `overflow: hidden` で切られないようにする。`overflow: auto` +
  `overscroll-behavior: contain` で内部スクロール。
- 地図の `touch-action: none` は**祖先の制約**なので、popover 側の `touch-action` だけでは
  指スクロールは有効にならない。popover 内のドラッグは `onPopoverPointerDown/Move/Up` で
  `scrollTop` に変換し、地図のパン・ズームへ渡さない。`wheel` も `stopPropagation`。
- 開閉・Escape・外側タップ・フォーカス復帰・aria-live（500ms 後に1回）・textContent 差分更新は
  従来どおり。全文は選択・コピーできる。
- 「一般図へ」ボタンは `bottom: calc(12px + var(--rp-position-h, 50px) + 10px)`。
  `--rp-position-h` は `ResizeObserver` で現在位置の実高さを書き込むため、文字サイズを
  200% にしても重ならない。left/右の余白は現在位置の外側に置くので衝突しない。

## 3. ヒント行の削除

- `#rp-hint`（「ドラッグで移動、ピンチまたは Ctrl＋ホイールで…」）の DOM を削除。
  `.rp-hint` の CSS（モバイル含む）と `PHYSICAL_CONTROL_SELECTOR` / `onPointerDown` の
  参照も削除した。別の説明文への置き換えはしていない。

## 4. テスト

- `scripts/tests/app11-wheel-position.test.cjs`（新規12件）
  - 1ノッチ1.35（上/下）、微小 delta の比例・分割一致・単調、行/ページ正規化、3ノッチ上限、
    delta 0・横方向、カーソル基準の不動点、SCALE_MIN/MAX クランプ
  - `app.js` から `onWheel`/`wheelStep`/`cancelWheelZoom` を抽出して駆動: 5ノッチの累積
    （1.35^5、上限考慮）、逆方向で復帰、上限で停止、操作要素の上で無反応、preventDefault の範囲
  - 静的: `ctrlKey` を見ない・wheel リスナーは `mapEl` のみ・`document` へ追加しない・
    `animateTo` を呼ばない・現在位置を操作要素/キー操作から除外・popover の wheel/touch 隔離・
    `--rp-position-h` の実測・ヒント残存なし
- `app11-hit-targets.test.cjs`: `data.js` 全文ハッシュを
  **具体図の投影ハッシュ**（compounds/reactions/regions/types/states/meta から classMap 項目を除く）と
  **一般図の配置ハッシュ**（area/frame/12ノード座標/16変換 points・labelPos）へ分割した。
  注意枠 DOM のハッシュは不変。
- `app11-reaction-map.test.cjs`: 現在位置の静的テストを「地図内右下フローティング・
  2行固定・上向き popover・地図の内側で内部スクロール・モバイルは toolbar の並び順から外れた」
  へ更新した。

## 検証コマンド

```powershell
node scripts/app11/check-class-map-layout.cjs
node scripts/app11/build-map-data.cjs --check
node --test scripts/tests/app11-wheel-position.test.cjs
node --test scripts/tests/app11-*.test.cjs
```

実ブラウザ確認は `Temp/opencode/shot/app11-wheel-compact/run.cjs`（README 参照）。
ホイール（native/合成の行・ページ単位）、現在位置フローティング、popover の開閉・
ズーム/resize 中の clip 無し、実タッチでの popover 内部スクロール、toolbar/検索上の
キー・ホイール非奪取、320px の省略と2行固定（実在の長い物質名を一覧から選ぶ）、
一般図見出しの全倍率衝突0（分類ノード＋具体図の全物質ノード＋表示中の反応ラベル）を含む。
`NODE_PATH` を `...\shot\app11-generic-cards-after\deps\node_modules` に向けて実行する。
テーマのURLは `?theme=default|pop|forest`（`standard` は theme.js の有効キーではない）。
`--only=ellipsis` で長文fixtureだけを再確認でき、結果には `meta.sourceSha256` が入る。
