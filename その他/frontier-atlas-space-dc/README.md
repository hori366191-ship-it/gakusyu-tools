# FRONTIER ATLAS — ORBITAL COMPUTE

宇宙図鑑の第2項目として制作した、宇宙データセンターの静的3D学習ページです。`その他/frontier-atlas/`（Starship）、`site/`、ポータル、GAS、既存アプリは変更していません。ビルド不要で、外部API・バックエンド・認証は使いません。

## ローカル起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。PowerShellでこのフォルダを作業ディレクトリにして実行してください。

```powershell
python -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrのCDNから読み込みます。CDN接続の失敗、WebGL未対応、WebGLコンテキスト喪失時は、インラインSVGの2D模式図と解説を残します。

## 操作

- `全体 / 発電 / 光通信 / 放熱 / 軌道上処理` の5モード
- 再生 / 一時停止、0.5× / 1× / 2×、48秒の教育用ループ
- ドラッグまたは矢印キーで周回、ホイールまたは `+` / `-` でズーム
- 太陽光パネル、AIチップ、光通信、ラジエーター、地球側受信のホットスポット
- 視点リセット、モバイルで開閉できる解説パネルと簡易ブリーフィング
- ヘルプは×、Esc、背景クリックで閉じ、閉じる前の再生状態を復元
- `Space` で再生 / 一時停止

`prefers-reduced-motion: reduce` では自動再生せず、モデル動作も静止させます。ページ非表示中は描画を止め、再表示時にフレーム時刻をリセットします。

## 研究段階の区別

- **軌道上計算は実証段階**: Starcloudは2025年11月にH100を搭載して打ち上げ、2025年12月に小型LLMの推論・学習を実施したと発表しています。
- **大規模宇宙データセンターは研究・構想**: Google Project Suncatcherのような太陽光発電衛星群、TPU、自由空間光通信を使う構想です。Starcloud-1の実証を大規模DCの完成として扱いません。
- 地上データセンターを完全に置き換えるのではなく、まず軌道上エッジ処理が現実的な用途です。

## 模型の注意点

- 地球表面はapp13のNASA Blue Marble: Next Generation（2004年7月）テクスチャを使用し、自作地表マップは廃止しました。デスクトップは4096px、モバイルは2048pxを選び、sRGBとanisotropyを設定します。
- 地球半径は28単位、中心は `[0, -24, -20]`、表面・雲の回転は固定しています。球体は128×64セグメント、大気は半径に比例するフレネル表現です。
- 主衛星は `[0, 20, 28]` 付近、中継衛星は5機・scale 2.8〜3.1・orbit radius 52〜63の複数傾斜軌道に配置し、全体カメラは95単位（モバイル98単位）離れた位置に設定しています。
- 雲は周期性のあるプロシージャルノイズ、大気・昼夜境界はシェーダーで描画します。CAD・ロゴは使用していません。
- 主衛星はMLIのひだ、スラスター、アンテナ、光学端子、放熱フィン、太陽電池グリッドを持つ詳細なMesh、周回衛星は11系統の共有ジオメトリInstancedMeshで構成しています。
- 太陽光、衛星間の光、地球へのダウンリンク、データパケット、赤外線熱粒子をアニメーションしています。太陽にはレンズフレア風グロー、背景にはプロシージャル星雲を追加しています。
- 真空では空冷できないため、赤外線で放熱する必要があります。熱の粒は放射を模式化したもので、空気や炎ではありません。
- 軌道・通信速度・温度・時間は実際の設計値ではありません。
- 説明本文は15px以上、補足は12px以上、行間は1.8以上を基本とし、モバイル解説パネルは60dvhを確保します。

## 出典

- [Google Research — Exploring a space-based, scalable AI infrastructure system design](https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/)
- [Starcloud — Starcloud-1](https://www.starcloud.com/starcloud-1)
- [Axiom Space — Orbital Data Center](https://www.axiomspace.com/orbital-data-center)
- [NASA Earth Observatory — Blue Marble: Next Generation, July 2004](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map#july) — Credit: NASA Earth Observatory（Reto Stöckli / NASA Goddard Space Flight Center）。app13用に縮小・WebP化した `earth-4096.webp` / `earth-2048.webp` を同梱。

本ページは企業・研究機関の承認・推奨を示しません。

## ファイル

- `index.html` / `app.css` — UI、レスポンシブ表示、2Dフォールバック
- `app.mjs` — 再生・シーク・UI・動的import・フォールバック
- `scene-state.mjs` — 純粋な軌道アニメーション状態計算
- `content.mjs` — モード、研究段階、比較、ホットスポット、出典
- `orbital-model.mjs` — 自作3Dモデル、InstancedMesh、光・熱パーティクル
- `orbital-viewer.mjs` — Three.js描画、カメラ、投影ラベル、自動品質
- `textures/earth-4096.webp` / `textures/earth-2048.webp` — app13からコピーしたNASA地球テクスチャ
- `scripts/tests/frontier-space-dc.test.cjs` — リポジトリ側の回帰テスト

## 確認コマンド

```powershell
# このフォルダを作業ディレクトリにして実行
node --check app.mjs
node --check content.mjs
node --check scene-state.mjs
node --check orbital-model.mjs
node --check orbital-viewer.mjs
node --test ../../scripts/tests/frontier-space-dc.test.cjs
```

ブラウザでの最終操作・描画確認は別途testサブエージェントの担当です。
