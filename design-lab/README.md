# design-lab — デザイン実験工房（Pages非配信・本流無改変）

> **ルール**: このフォルダは `site/` の本流に一切影響を与えない隔離実験場です。`site/` を直接編集せず、まずここで試し、あなたが「全アプリでイケてる」と判断してから `site/themes/` へ移植します。

## 位置づけ

- **正本**: `site/` + `site-gas/` + `site-worker/`（`AGENTS.md:1`）。`apps/` は旧GAS永久残置
- **実験場**: `design-lab/`（本フォルダ）。Pages配信しない（`.github/workflows/pages.yml` は `path: site` のみ）。`git` 管理はするが `site/` への自動反映はしない
- **最終移植**: `design-lab/themes/motherduck.css` が完成したら `site/themes/motherduck.css` へ手動コピーし、ポータルに切替UIを追加する（Phase 4）

```
site/                     # 正本（触らない）
design-lab/               # 実験場（ここだけ編集）
  portal/index.html       # site/index.html のコピー
  app1/index.html + bundle.json
  app3/ .. app9/          # 全アプリのコピー
  tokens/motherduck.css   # Refero抽出の生トークン（編集しない）
  themes/motherduck.css   # 塾適応版（ここを編集する）
  font-lab.html           # 和文フォント試着室
  assets/                 # 手描き風マスコットSVG等
```

## 使い方（ローカル確認）

```powershell
# リポジトリ直下で
python -m http.server 8000
# ブラウザで
http://localhost:8000/design-lab/portal/
http://localhost:8000/design-lab/font-lab.html
http://localhost:8000/design-lab/app3/
http://localhost:8000/design-lab/app8/
```

`site/` と見比べる場合は `http://localhost:8000/site/` を同時表示。

## 参考スタイル

- **MotherDuck — crayon-coded terminal on cream paper**（Refero Styles `2bd7363d-7aae-4b1f-9d5a-1edeb17ca567`）
- トークンは `tokens/motherduck.css` に全量保存。出典は `Inspired by MotherDuck via Refero Styles` と明記

## 編集ルール

1. `site/` を直接編集しない。必ず `design-lab/` で試す
2. 画像は自作SVGを `assets/` に置く（MotherDuckのアヒルを丸コピしない）
3. フォントは OFL の代替を使う（Aeonik Mono → `M PLUS 1 Code` 等）
4. `prefers-reduced-motion` では影の移動を無効化（`site/index.html:361` と同作法）

## Phase

- Phase 0: 足場（本README + 複製 + トークン）
- Phase 1: portalをMotherDuck化
- Phase 2: 全アプリへ横展開 + font-labで和文フォント選定
- Phase 3: あなたが「全アプリで良い」と判断するまで反復
- Phase 4: `site/themes/motherduck.css` へ移植し、ポータルに切替UIを追加（`localStorage` で `portal→app` 伝播）
