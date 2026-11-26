# 核融合 — 詳細トカマク

FRONTIER ATLASのエネルギー・材料シリーズ用、新規ローカル教育展示です。既存アプリ、`site/`、ポータル、GAS、`site-worker` は変更していません。commit/pushも行っていません。

## 起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrから読み込みます。CDN・WebGLが利用できない場合、またはWebGLコンテキストを失った場合は、インラインSVGの2D模式図へ切り替わります。外部API、画像、3Dモデルファイル、バックエンド、認証は使いません。

## 操作

- 5モード：加熱 / 磁場閉じ込め / 融合反応 / ブランケット熱 / 発電への構想
- 左の構成要素または3Dホットスポットで、真空容器・コイル・プラズマ・ダイバータ・ブランケットを選択
- 再生 / 一時停止、0.5× / 1× / 2×、ズーム、すべてリセット
- ドラッグまたは矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- `Space`で再生 / 一時停止、`R`でモード・スライダー・時刻・視点をすべてリセット
- モバイルでは右の解説パネルを開閉

`prefers-reduced-motion: reduce` では自動再生しません。ページ非表示時は描画を停止し、再表示時にフレーム時刻をリセットします。

## 学ぶ境界

- **実測**：実際の実験・装置で測られた値
- **研究**：ITERや試験装置で検証中の技術
- **実用化**：社会で使われている技術。ITER型融合発電はここに含めません
- **構想**：DEMOや将来発電所の設計案

ITERは発電所ではなく、燃焼プラズマと熱除去などを研究する装置です。ITERでは融合熱を冷却系へ排出し、蒸気・タービン・発電機は将来発電所の構想です。したがってITERからの実測発電は0 MWです。

公開設計値の融合出力500 MWとプラズマ加熱入力50 MWから、プラズマQ=10が目指されます。Q=10は電力量比や発電効率ではありません。プラズマ温度は融合条件の一つであり、発電量そのものではありません。

形状、コイル数、粒子数、色、スライダー、温度・Q・出力は**教育用の近似**です。実際のITERの工学的寸法、熱流束、材料寿命、燃料循環、経済性、建設日程を再現・予測しません。

## モデル

- 24分割の真空容器、12ポート、48補強リブ
- 18組toroidalコイル、6組poloidalコイル、14巻き中央ソレノイド
- 専用shaderのプラズマtorus、64個の磁場トレーサー
- 4基の中性粒子ビーム注入系
- 12カセットのダイバータ、48冷却フィン
- 18モジュールのブランケット、冷却チャンネル
- 112個までの中性子、36個までの熱パルス
- 発電モードでのみ現れる半透明の「将来構想」パーツ
- PBR金属・セラミック・ガラス、加法発光、専用shader
- `InstancedMesh`、2段階`LOD`、DPR上限、自動品質、Instanced数の品質別削減

統計は`MODEL_STATS`に定義しています。論理部品507（メッシュ173＋Instanced詳細334）、PBR系統5、shader 1、LOD 2段階です。LODの簡略代理メッシュは論理部品数から除外しています。遠距離では詳細部品を簡略シルエットへ切り替えます。

## 出典

- [ITER — On The Road to ITER](https://www.iter.org/project/road-iter)
- [ITER — Making it work](https://www.iter.org/fusion-energy/making-it-work)

ITERの説明では、融合エネルギーの約80%を中性子が運び、ITERの熱は冷却水で回収・冷却されること、将来発電所では蒸気・タービン・発電機へつなぐ構想であることを参照しています。本ページはITERの承認・推奨を示しません。

## ファイルと確認

- `index.html` / `app.css` — UI、レスポンシブ、モバイル折りたたみ、SVG fallback
- `app.mjs` — 再生・モード・選択・動的import・安全停止
- `content.mjs` — 研究段階、構成要素、課題、基本仕様、出典
- `state.mjs` — 純粋な教育用状態、位相、torus座標、中性子経路
- `model.mjs` — プロシージャル3D、shader、Instancing、LOD
- `viewer.mjs` — カメラ、投影ラベル、DPR、自動品質、context loss
- `favicon.svg`
- `../../scripts/tests/frontier-fusion.test.cjs`

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-fusion.test.cjs
```

Nodeテストは状態・出典・HTML/CSS・モデル統計と生成/update契約を確認します。ブラウザでの最終操作・描画確認はtestサブエージェントの担当です。
