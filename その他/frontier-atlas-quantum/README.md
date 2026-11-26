# FRONTIER ATLAS — WILLOW / QEC

超伝導量子ビット、表面コード、希釈冷凍機を学ぶ新規ローカルアプリです。既存アプリ、`site/`、ポータル、GASは変更していません。ビルド・バックエンド・外部APIは不要です。

## 起動

ES Modulesとimport mapのため、`file://` ではなくHTTPサーバーで開きます。

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrから読み込みます。CDN失敗、WebGL未対応、context loss時はインラインSVGの2D模式図と解説を残します。

## 操作

- 5モード：重ね合わせ / 誤り注入 / 症例検出 / 訂正 / 論理量子ビット
- 再生 / 一時停止、0.5× / 1× / 2×、40秒ループ、タイムライン
- リセットで時刻・速度・視点・モードを初期化
- ドラッグ・矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- チップ、物理量子ビット、共鳴器、表面コード、冷凍機の5ホットスポット
- モバイル解説は折りたたみ、ブリーフィングは☰で開閉
- `Space`で再生切替、ヘルプは× / Esc / 背景クリックで閉じる

`prefers-reduced-motion: reduce` では自動再生せずモデル動作も静止させます。ページ非表示中は描画を止めます。

## 研究段階と正確さ

- **実測・実験**：Googleは2024年12月、105物理量子ビットのWillowと、3×3・5×5・7×7の符号量子ビット配列で論理誤りを低減した結果を発表しました。
- **実測・実験**：random circuit samplingはベンチマークです。Google自身も、既知の実用的な商用用途はまだ示されていないと説明しています。
- **研究・構想**：実用的な大規模フォールトトレラント量子計算には、多数の論理量子ビット、論理ゲート、継続的な復号が必要です。
- **物理量子ビット ≠ 論理量子ビット**：前者は実回路、後者は符号で保護された情報の単位です。

49サイトの配置、Bloch球、共鳴器、配線、誤り率、訂正時間は教育用近似です。Willowの完全な回路図や測定値の再現ではありません。

## モデルstats

- 主役の意味ある部品：**51**
- 宣言されたInstanced detail：**432**（データパッド・コンデンサ・接合・測定パッド・結合器・ワイヤボンド・制御線・端面接点・冷凍機ボルト・熱バイア・放射フィン）
- 表面コードサイト：**49**（データ25 / 測定24）
- PBR材質：**9系統以上**（シリコン、金、銅、アルミニウム、鋼、透明容器、発光サイト等）
- 専用shader：状態球フレネル、誤りパルス、背景
- パーティクル：**180**、LOD：**3段階**

## 品質・フォールバック

InstancedMesh、手動3段階LOD、DPR上限、フレーム時間に応じる自動品質、星のdraw range、`visibilitychange`、WebGL `contextlost`、CDN/WebGL失敗時のSVGフォールバックを実装しています。

## 出典

- [Google — Meet Willow, our state-of-the-art quantum chip](https://blog.google/technology/research/google-willow-quantum-chip/)
- [Nature — Quantum error correction below the surface code threshold](https://www.nature.com/articles/s41586-024-08449-y)
- [Google Research — Making quantum error correction work](https://research.google/blog/making-quantum-error-correction-work/)

本ページは企業・研究機関の承認・推奨を示しません。

## ファイル

`index.html` / `app.css` / `app.mjs` / `content.mjs` / `state.mjs` / `model.mjs` / `viewer.mjs` / `favicon.svg` / `README.md`

テストは `scripts/tests/frontier-quantum.test.cjs` に配置します。

## 確認コマンド

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-quantum.test.cjs
```

ブラウザでの最終操作・描画確認はtestサブエージェントの担当です。
