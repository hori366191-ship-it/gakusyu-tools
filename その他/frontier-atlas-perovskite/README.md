# ペロブスカイト／シリコン — タンデム太陽電池

FRONTIER ATLASのエネルギー・材料シリーズ用、新規ローカル教育展示です。既存アプリ、`site/`、ポータル、GAS、`site-worker` は変更していません。commit/pushも行っていません。

## 起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrから読み込みます。CDN・WebGLが利用できない場合、またはWebGLコンテキストを失った場合は、インラインSVGの2D模式図へ切り替わります。外部API、画像、3Dモデルファイル、バックエンド、認証は使いません。

## 操作

- 4モード：光の吸収 / 電荷分離 / 電流抽出 / 安定性と劣化
- 左の構成要素または3Dホットスポットで、ペロブスカイト・シリコン・ABX3結晶・輸送層・封止を選択
- 再生 / 一時停止、0.5× / 1× / 2×、ズーム、すべてリセット
- ドラッグまたは矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- `Space`で再生 / 一時停止、`R`でモード・スライダー・時刻・視点をすべてリセット
- モバイルでは右の解説パネルを開閉

`prefers-reduced-motion: reduce` では自動再生しません。ページ非表示時は描画を停止し、再表示時にフレーム時刻をリセットします。

## 学ぶ境界

- **実測**：特定デバイス・条件で測定された効率、物性、安定性。面積・期間・測定手順を確認します
- **研究**：材料、界面、デバイス、モジュールが試験・開発中の段階
- **実用化**：用途・保証条件が限定されて製品化される段階。シリコン単体の実績とタンデムを区別します
- **構想**：将来の低コスト・高効率・長寿命モジュールの設計・製造案

上側のwide-bandgapペロブスカイトは可視〜短波長、下側のシリコンは透過した長波長を主に吸収します。光がelectron-hole pairを作り、電子は上側の電子輸送層、正孔は下側の正孔輸送層へ分かれます。ここではmonolithic 2-terminal構成を模式化しています。

**研究セルの高効率は、モジュール寿命・量産歩留まり・実発電量と同じではありません。** MIT Newsは耐久性と大面積性能を課題として説明しています。NRELの研究情報とNature Energyの界面・再結合に関する一次論文も参照しています。

層厚、結晶、光子、キャリア、バンド図、効率、劣化は**教育用の近似**です。実測PCE、材料設計、デバイスシミュレーション、寿命、発電量を計算・予測しません。鉛を含む材料の環境管理、大面積均一性、イオン移動、界面反応も課題として扱います。企業の商用化発表は企業発表として区別します。

## モデル

- 保護ガラス、前面電極、電子輸送層、ペロブスカイト、正孔輸送層、相互接続、シリコン、裏面電極の分解積層
- 前面電極フィンガー48本、シリコン表面セル120個、相互接続24本
- ABX3模式結晶：Aサイト27、Bサイト27、Xサイト81
- 3D模式バンド図、エネルギー軸、電子遷移
- 青・緑・赤の入射光子48個、電子48個、正孔48個
- ペロブスカイト専用shader、結晶粒・キャリア・劣化の uniforms
- 劣化領域60個、封止エッジ24個
- PBRガラス・電極・シリコン・輸送材料、加法発光、専用shader
- `InstancedMesh`、2段階`LOD`、DPR上限、自動品質、Instanced数の品質別削減

統計は`MODEL_STATS`に定義しています。論理部品593（メッシュ30＋Instanced詳細563）、PBR系統5、shader 1、LOD 2段階です。LODの簡略代理メッシュは論理部品数から除外しています。

## 出典

- [NREL — Perovskite Solar Cells](https://nrel.gov/pv/perovskite-solar-cells.html)
- [MIT News — Explained: Why perovskites could take solar cells to new heights (2022)](https://news.mit.edu/2022/perovskites-solar-cells-explained-0715)
- [MIT News — Study unlocks nanoscale secrets for designing next-generation solar cells (2024)](https://news.mit.edu/2024/study-unlocks-nanoscale-secrets-tuning-perovskites-0228)
- [Nature Energy — Reduced recombination via tunable surface fields in perovskite thin films (2024)](https://www.nature.com/articles/s41560-024-01470-5)

研究機関の解説は基礎・課題整理、一次論文は特定の界面・再結合知見に使います。小型セルの記録とモジュールの長期実績を同一視しません。本ページは企業・研究機関の承認・推奨を示しません。

## ファイルと確認

- `index.html` / `app.css` — UI、レスポンシブ、モバイル折りたたみ、SVG fallback
- `app.mjs` — 再生・モード・選択・動的import・安全停止
- `content.mjs` — 研究段階、構成要素、課題、基本仕様、出典
- `state.mjs` — 純粋な教育用状態、光子・キャリア経路、吸収・劣化
- `model.mjs` — 多層タンデム、ABX3結晶、shader、Instancing、LOD
- `viewer.mjs` — カメラ、投影ラベル、DPR、自動品質、context loss
- `favicon.svg`
- `../../scripts/tests/frontier-perovskite.test.cjs`

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-perovskite.test.cjs
```

Nodeテストは状態・出典・HTML/CSS・モデル統計と生成/update契約を確認します。ブラウザでの最終操作・描画確認はtestサブエージェントの担当です。
