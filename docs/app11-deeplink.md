# app10 ↔ app11 深いリンク（反応経路マップで表示）

有機化学ビルダー（`site/app10`）の物質カードから、有機反応マップ（`site/app11`）の
同じ物質へ移動するための最小の連携。

## 仕組み

- `scripts/app11/build-map-data.cjs` が `site/app11/coverage-ids.js` を生成する。
  - `data.compounds`（反応経路マップに収録した全427物質）の ID を `true` で持つだけの UMD。
  - Node からは `module.exports`、ブラウザでは `window.RP_COVERED_COMPOUND_IDS`。
  - `--check` は `data.js` / `layout.json` / `routes.json` に加えてこの manifest も一致検査する。
- `site/app10/index.html` は `data.js` などの後に `../app11/coverage-ids.js` を読み、
  最後に `app.js` を読む。app10 は app11 の `data.js` を読み込まない。
- `site/app10/app.js` の物質カード footer は、manifest に載っている ID にだけ
  `<a href="<manifestのある場所>?focus=ID" target="_blank" rel="noopener">反応経路マップで表示 →</a>`
  を出す。family カード・材料カードには出さない。
  - `__proto__` / `constructor` など継承プロパティは `Object.prototype.hasOwnProperty.call` で除外。
  - manifest が読めない、または script が見つからない場合はリンクを出さない（fail-closed）。
  - リンク先の基準は manifest の `script src` から求めるため、`design-lab/app10-next`
    （`../../site/app11/coverage-ids.js`）から配信しても `site/app11` を指す。
- `site/app11/app.js` は初期表示で `?focus=ID` を1回だけ同期する。
  - 収録ID（`hasOwnProperty`）だけを受け付け、空・256文字超・未知ID・壊れた値は無視して俯瞰表示を維持。
  - `gotoEntity` は使わない（`scrollIntoView`・`animateTo`・起点へのフォーカス復帰を起こさない）。
    `entityTarget` でツールバー余白を除いた領域の中央へ置き、`selectNode` → `openCard` の順で開く。
  - 以後の `ResizeObserver` / `resize` は現在の `view` を保持する（fit へ巻き戻さない）。
  - `hashchange` などURL同期の新機能は持たない。

## 確認

```powershell
node scripts/app11/build-map-data.cjs --check
node --test scripts/tests/app11-deeplink.test.cjs
```
