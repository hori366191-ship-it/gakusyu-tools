# 全固体電池 — 分解セル

FRONTIER ATLASのエネルギー・材料シリーズ用、新規ローカル教育展示です。既存アプリ、`site/`、ポータル、GAS、`site-worker` は変更していません。commit/pushも行っていません。

## 起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrから読み込みます。CDN・WebGLが利用できない場合、またはWebGLコンテキストを失った場合は、インラインSVGの2D分解図へ切り替わります。外部API、画像、3Dモデルファイル、バックエンド、認証は使いません。

## 操作

- 4モード：充電 / イオン移動 / 放電 / デンドライト比較
- 左の構成要素または3Dホットスポットで、正極・固体電解質・Li金属負極・集電体・デンドライトを選択
- 再生 / 一時停止、0.5× / 1× / 2×、ズーム、すべてリセット
- ドラッグまたは矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- `Space`で再生 / 一時停止、`R`でモード・スライダー・時刻・視点をすべてリセット
- モバイルでは右の解説パネルを開閉

`prefers-reduced-motion: reduce` では自動再生しません。ページ非表示時は描画を停止し、再表示時にフレーム時刻をリセットします。

## 学ぶ境界

- **実測**：一次論文で、特定の材料・セル・条件について測定された結果
- **研究**：材料、界面、製造プロセスが実験室・試験セルで開発中の段階
- **実用化**：用途・条件を限定して製品化・導入される段階
- **構想**：将来の高エネルギー密度全固体電池の設計案

Liイオンは固体電解質の中を、電子は外部回路を通ります。専用shaderの半透明電解質内を青いイオンが移動し、外部ワイヤーをオレンジの電子が移動します。充電と放電で方向が反転します。

固体電解質はデンドライトを必ず防ぐわけではありません。Liは細孔、粒界、割れ、界面反応、電子漏れ、応力集中などを通って進み、短絡につながる可能性があります。比較セルの「界面を制御」はリスクを下げる方策の模式表現で、安全保証ではありません。

Nature Communications 2024のLPS電解質論文では、約95%を境に連結細孔が閉じ、低電流密度の条件下で短絡が見られなかった領域が報告されています。これは材料・条件に依存する知見であり、スライダーのしきい値を普遍的な仕様として扱いません。

積層、層厚、粒子、イオン数、電流、伝導度、デンドライトの形、リスク指数は**教育用の近似**です。短絡確率、寿命、製品性能、実用化時期を計算・予測しません。企業発表は企業発表として明記し、査読論文の実測値と同一視しません。

## モデル

- 正極、固体電解質、Li金属負極、上下集電体の分解セル
- 正極活物質32個、導電ネットワーク24本、固体電解質サイト48個
- Li箔12層、負極表面の析出28個
- Liイオン96個、外部回路の電子32個
- 電解質専用shader、イオン伝導度と方向の uniforms
- 多孔質・弱界面の比較セル：7枝・28セグメントのデンドライト
- 界面制御の比較セル：24個の均一化した析出
- PBR金属・正極・界面・ケース、加法発光、専用shader
- `InstancedMesh`、2段階`LOD`、DPR上限、自動品質、Instanced数の品質別削減

統計は`MODEL_STATS`に定義しています。論理部品360（メッシュ56＋Instanced詳細304）、PBR系統5、shader 1、LOD 2段階です。LODの簡約代理メッシュは論理部品数から除外しています。

## 出典（一次論文）

- [Nature Energy — Critical interphase overpotential as a lithium dendrite-suppression criterion for all-solid-state lithium battery design (2023)](https://www.nature.com/articles/s41560-023-01231-w)
- [Nature Communications — Effect of solid-electrolyte pellet density on failure of solid-state batteries (2024)](https://www.nature.com/articles/s41467-024-45030-7)
- [Nature Communications — High-energy and durable lithium metal batteries using garnet-type solid electrolytes with tailored lithium-metal compatibility (2022)](https://www.nature.com/articles/s41467-022-29531-x)

論文の数値は特定構成・条件での結果であり、すべての全固体電池に適用される保証ではありません。本ページは企業・研究機関の承認・推奨を示しません。

## ファイルと確認

- `index.html` / `app.css` — UI、レスポンシブ、モバイル折りたたみ、SVG fallback
- `app.mjs` — 再生・モード・選択・動的import・安全停止
- `content.mjs` — 研究段階、構成要素、課題、基本仕様、一次論文
- `state.mjs` — 純粋な教育用状態、イオン経路、非単調な密度リスク
- `model.mjs` — 分解セル、shader、Instancing、LOD、デンドライト比較
- `viewer.mjs` — カメラ、投影ラベル、DPR、自動品質、context loss
- `favicon.svg`
- `../../scripts/tests/frontier-solid-battery.test.cjs`

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-solid-battery.test.cjs
```

Nodeテストは状態・方向・出典・HTML/CSS・モデル統計と生成/update契約を確認します。ブラウザでの最終操作・描画確認はtestサブエージェントの担当です。
