# app11-3d-opaque — 3D球ビュー「不透明パネル + 淡い境界 + 操作中だけ低解像度」（design-lab専用）

かつて `site/app11/3d/` を変えずに比較していた実験プレビューです。
**2026-11-22 に同じ内容が正本 `site/app11/3d/` へネイティブ実装された**ため、
ここは「正本の表示をそのまま比較する入口」だけを残しています（Pages 非配信）。

## 開き方（リポジトリ直下で簡易サーバを1本立てる）

```powershell
python -m http.server 8000
```

| 目的 | URL |
|---|---|
| 正本（不透明パネル + 淡い境界 + 操作中だけ低解像度） | `http://localhost:8000/site/app11/3d/` |
| 同じ見た目で解像度低下だけ無効 | `http://localhost:8000/site/app11/3d/?res=full` |
| reduced-motion でも解像度低下を明示的に有効化 | `http://localhost:8000/site/app11/3d/?res=cap` |
| このフォルダ経由（`?res=...` はそのまま引き継ぐ） | `http://localhost:8000/design-lab/app11-3d-opaque/` |

2 タブ並べれば、既定（操作中だけ低解像度）と `?res=full` を
**同一ページ・同一アセット**で比較できます。パネル・凡例・境界は両方同じです。

## 差分はここだけ

- `index.html`: `site/app11/3d/index.html` のコピー。`<base href="../../site/app11/3d/">` と
  `<title>` のサフィックスだけが違う。ローカルの CSS / JS は**読み込まない**
  （不透明化・境界・解像度は正本の `app3d.css` / `renderer.js` / `sphere-resolution.js` が行う）。

## 残置ファイル（現在は未使用・参照用）

`opaque.css` / `opaque-glow.js` / `opaque-resolution.js` は、正本へ移植する前の
実験実装です。正本が同じ挙動をネイティブに持つため、**どこからも読み込んでいません**
（二重適用・モンキーパッチの再混入を避けるため、`index.html` には追加しないこと）。

- 当時の方式: `window.devicePixelRatio` と Canvas 2D の `shadowBlur` を実行時に包む
- 現在の方式: `viewport()` の dpr を `sphere-resolution.js` の `dprFor()` で 1 か所だけ決め、
  境界は `renderer.js` が 2 回描き（淡い縁 → 芯）で描く。パッチは使わない。

## 回帰テスト

```powershell
node --test scripts/tests/app11-3d-opaque.test.cjs
node --test scripts/tests/app11-3d-resolution.test.cjs
```

前者は `app3d.css` の不透明パネルと、実際の `R.drawTerritory` の境界描画を検証します。
後者は解像度ポリシー、操作終了後のフル解像度復帰、`?res=` / reduced-motion を検証します。
