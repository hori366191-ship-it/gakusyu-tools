# FRONTIER ATLAS — CRISPR / BASE EDITING

生命科学図鑑の第2項目として制作した、CRISPR-Cas9切断とベース編集の静的3D学習ページです。`その他/frontier-atlas/`（Starship）、`frontier-atlas-rsi/`、`frontier-atlas-space-dc/`、`frontier-atlas-optogenetics/`、`site/`、ポータル、GAS、既存アプリは変更していません。ビルド不要で、外部API・バックエンド・認証は使いません。

## ローカル起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。PowerShellでこのフォルダを作業ディレクトリにして実行してください。

```powershell
python -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrのCDNから読み込みます。CDN接続の失敗、WebGL未対応、WebGLコンテキスト喪失時は、インラインSVGの2D模式図と解説を残します。

## 操作

- `target recognition / cut vs base edit / repair / edited sequence` の4モード
- `Cas9切断 / ベース編集` の2経路切り替え
- 再生 / 一時停止、0.5× / 1× / 2×、24秒の教育用ループ、タイムラインでシーク
- ドラッグまたは矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- DNA、guide RNA、Cas9、脱アミナーゼ、修復・検証の5ホットスポット
- 視点リセットと全状態リセット、モバイルで開閉できる解説パネル
- ヘルプは×、Esc、背景クリックで閉じ、閉じる前の再生状態を復元
- `Space`で再生 / 一時停止、`R`で視点リセット

`prefers-reduced-motion: reduce`では自動再生せず、モデル動作も静止させます。ページ非表示中は描画を止め、再表示時にフレーム時刻をリセットします。

## 切断とベース編集の違い

| 経路 | 起きること | 修復・結果 | 主な課題 |
|---|---|---|---|
| Cas9切断 | HNH / RuvCが相補的な2本を切断し、二本鎖切断（DSB）を作る | NHEJ / HDRなどを利用。NHEJでは小さな挿入・欠失が生じる可能性 | オフターゲット、Indel、修復の多様性、デリバリー |
| ベース編集 | 不活性化Cas9に融合した脱アミナーゼが標的AをIを経てGへ変換。多くの場合、DSBは作らない | 複製・修復で相補鎖もCに変わり、A·T→G·Cが固定 | 編集窓、bystander、オフターゲット、部分編集、デリバリー |

ベース編集はあらゆる塩基置換に対応するわけではありません。利用できる変換、PAM、編集窓、近傍塩基、細胞状態を評価する必要があります。

## 研究段階と出典の区別

- **実装・実測**: guide RNAとCas9による配列認識、Cas9切断、A·T→G·Cなどのベース編集は実験的に実装されています。
- **研究中**: 狭い編集窓、bystander・オフターゲット低減、細胞・動物・ヒト研究での機能と安全性評価。
- **構想・未確立**: あらゆる塩基・長い配列を自由に置換するベース編集、副反応や長期的危険が完全にないという主張。

2025年のNature Communications論文はTadA-NW1による狭い編集窓とbystander低減の研究です。2026年のNature Biotechnology論文OptiPrimeは**プライム編集**の効率予測と修復（MMR）の研究であり、ベース編集の実測値として扱いません。

## 模型の注意点

- DNA二重らせん、32塩基対、guide RNA、Cas9、脱アミナーゼ、修復因子はすべて自作のプロシージャル幾何学です。外部画像・CAD・GLTFは使いません。
- 表示する `GCTAACGTACGTTAGCTAGC` は任意の20塩基教学配列で、疾患遺伝子ではありません。PAMは `AGG` の例です。
- ベース編集は9番目のA·TをG·Cへ変換します。切断経路は同じ位置の1塩基欠失の例で、NHEJの必然的な結果ではありません。
- 分子の形、らせんの回転数、編集窓、修復粒子、24秒の再生時間は教育用近似です。編集効率、オフターゲット頻度、治療成績を再現・予測しません。
- 本ページは実験プロトコル、ツール選定、安全性評価、規制上の判断を含みません。

## モデル stats

- Meaningful mesh objects: **40**
- InstancedMesh systems: **7**、最大インスタンス要素: **344**
- DNA塩基対: **32**、塩基半分: **64**、骨格チューブセグメント: **300**
- guide RNAヌクレオチド: **20**、タンパク質ドメイン: **18**、表面ディテール: **34**、修復粒子: **96**
- PBR材質インスタンス: **9**、専用ShaderMaterial: **1**、LODレベル: **2**

自動品質は4段階です。DPR上限は0.75 / 1.0 / 1.3 / 1.65、描画ピクセルは約160万pxに制限します。実測の分子構造・材質・編集動態を再現するスペックではありません。

## 出典

- [Nature Communications (2025) — A streamlined base editor engineering strategy to reduce bystander editing](https://www.nature.com/articles/s41467-025-63609-6)
- [Nature Biotechnology (2026) — Mechanistic machine learning for prediction of prime editing outcomes](https://www.nature.com/articles/s41587-026-03261-7)

## ファイル

- `index.html` / `app.css` — UI、レスポンシブ表示、2Dフォールバック
- `app.mjs` — 再生・シーク・UI・動的import・フォールバック
- `state.mjs` — 純粋なCRISPR状態計算
- `content.mjs` — モード、編集経路、研究段階、ホットスポット、出典
- `model.mjs` — 自作3Dモデル、InstancedMesh、PBR、専用shader、LOD
- `viewer.mjs` — Three.js描画、カメラ、投影ラベル、自動品質
- `favicon.svg` / `README.md`
- `scripts/tests/frontier-crispr.test.cjs` — リポジトリ側の回帰テスト

## 確認コマンド

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-crispr.test.cjs
```

ブラウザでの最終操作・描画確認は別途testサブエージェントの担当です。
