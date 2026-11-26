# FRONTIER ATLAS — NEUTRINO ICE

南極氷のIceCube検出器から再構成までを学ぶ、静的3Dのローカル展示ページです。`その他/` 配下の新規アプリで、既存アプリ・ポータル・GAS・`site/` は変更していません。ビルド不要、外部API・バックエンド・認証は使いません。

## 起動

ES Modulesとimport mapを使うため `file://` ではなくHTTPサーバーで開きます。

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrから読み込みます。CDN失敗・WebGL非対応・context loss時は、インラインSVGの2D模式図と全解説を残します。

## 操作

- 5モード: ニュートリノ通過 / 相互作用 / Cherenkov光 / センサー応答 / 再構成
- 再生・一時停止、0.5× / 1× / 2×、42秒の教育用ループ、シーク、リセット
- ドラッグ・矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- `Space`で再生 / 停止、`R`でリセット
- 5つのホットスポットでモデルへフォーカス
- モバイルでは解説パネルを開閉、`prefers-reduced-motion`では自動再生しません
- 説明本文15px以上・補足12px以上・行間1.8以上をCSS変数で契約し、モバイル60dvh前後でスクロール維持

## 観測事実と未解明

2026年ノーベル物理学賞のプレスリリースは、Francis HalzenのIceCubeへの決定的な貢献と高エネルギー天体ニュートリノの発見を対象としています。IceCubeは約1 km³の氷に、86本のケーブルと5,160個の氷中DOMを備えます。一方、個々の起源天体や宇宙の粒子加速機構の全体像は未解明です。将来のIceCube-Gen2は研究・計画であり、本模型の稼働中検出器と混同しません。

## モデルstats

- 86本の意味のある深度ケーブル構造（表示品質で本数を削減）
- 5,160個を上限とするInstancedMeshのDOM光検出器
- 600個を上限とするケーブル固定具のInstancedMesh
- 氷層、地球断面、観測所、相互作用頂点、Cherenkovコーン、再構成矢印
- PBR: `MeshPhysicalMaterial`（氷・DOM）、`MeshStandardMaterial`（ケーブル・金属・岩石）
- 専用shader: Cherenkovコーン、地球断面の発光ライン
- 専用粒子: 二次粒子カスケード、Cherenkov光子
- `THREE.LOD` + 品質別InstancedMesh count + DPR制限 + フレーム計測による自動品質

## 教育用近似・既知制約

実機のCAD・配置・寸法・エネルギー・時間・検出確率を再現していません。86本・60個という基本仕様は本文に残しつつ、3D表示は負荷を抑えるため本数と深度方向の間隔を簡略化しています。Cherenkov光の粒・開き角・ニュートリノの太さは誇張です。DOMの点灯は光の検出を示し、ニュートリノそのものの直接検出ではありません。方向再構成は教育用の矢印で、実際の統計的手法や誤差評価を完全には実装していません。

## 出典

- [Nobel Prize in Physics 2026 — Press release](https://www.nobelprize.org/prizes/physics/2026/press-release/)（2026年10月6日、2026年11月26日確認）
- [IceCube — Quick Facts](https://icecube.wisc.edu/about-us/facts/)（2026年11月26日確認）
- [IceCube Neutrino Observatory](https://icecube.wisc.edu/)

本ページはNobelPrize.org・IceCubeの承認・推奨を示しません。

## ファイル

`index.html` / `app.css` — UI・2Dフォールバック  
`app.mjs` — 再生・UI・動的import・フォールバック  
`content.mjs` — モード・ホットスポット・研究段階・出典  
`state.mjs` — 純粋な教育用状態計算  
`model.mjs` — プロシージャル3Dモデル・Instancing・LOD  
`viewer.mjs` — Three.js描画・カメラ・自動品質  
`scripts/tests/frontier-neutrino.test.cjs` — リポジトリ側の回帰テスト

## 確認

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-neutrino.test.cjs
```

ブラウザでの最終描画・操作確認は別途testサブエージェントの担当です。
