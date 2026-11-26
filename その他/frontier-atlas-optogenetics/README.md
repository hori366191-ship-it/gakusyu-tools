# FRONTIER ATLAS — OPTOGENETICS

生命科学図鑑の第1項目として制作した、光遺伝学の静的3D学習ページです。`その他/frontier-atlas/`（Starship）、`frontier-atlas-rsi/`、`frontier-atlas-space-dc/`、`site/`、ポータル、GAS、既存アプリは変更していません。ビルド不要で、外部API・バックエンド・認証は使いません。

## ローカル起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。PowerShellでこのフォルダを作業ディレクトリにして実行してください。

```powershell
python -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrのCDNから読み込みます。CDN接続の失敗、WebGL未対応、WebGLコンテキスト喪失時は、インラインSVGの2D模式図と解説を残します。

## 操作

- `光OFF / channel open / ion influx / action potential` の4モード
- 再生 / 一時停止、0.5× / 1× / 2×、20秒の教育用ループ
- タイムラインでシーク、光強度0〜100%の教育用入力
- ドラッグまたは矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- ソーマ、ChR2、光ファイバー、軸索・髄鞘、軸索終端の5ホットスポット
- 視点リセットと全状態リセット、モバイルで開閉できる解説パネル
- ヘルプは×、Esc、背景クリックで閉じ、閉じる前の再生状態を復元
- `Space`で再生 / 一時停止、`R`で視点リセット

`prefers-reduced-motion: reduce`では自動再生せず、モデル動作も静止させます。ページ非表示中は描画を止め、再表示時にフレーム時刻をリセットします。

## 研究段階の区別

- **実装・実測**: ChR2を標的細胞へ導入し、光で神経活動を制御する研究ツール。2005年の神経細胞、2007年の生きたマウス脳での実証を2026年ノーベル賞の一次情報が紹介。
- **研究中**: 記憶・感覚・行動に関わる神経回路の解明、視覚回復などのヒト研究・試行、遺伝子導入と光デリバリーの改善。
- **構想・未確立**: あらゆる脳深部を無侵襲で操る実装、安全性・持続性・特異性が解決済みという主張。教育模型を治療成績の証明として扱いません。

2026年ノーベル医学賞の受賞者は Karl Deisseroth、Peter Hegemann、Georg Nagel。業績は「light-gated ion channels and optogenetics」。本ページはノーベル財団・研究機関の承認・推奨を示しません。

## 模型の注意点

- ニューロン、ChR2の7本の膜貫通らせん、光ファイバー、髄鞘、終端はすべて自作のプロシージャル幾何学です。外部画像・CAD・GLTFは使いません。
- ChR2は青色光（約470 nmの例）で開口し、Na⁺やCa²⁺などの陽イオン流入を促します。イオン流入が必ず活動電位になるとは限らず、閾値や回路状態に依存します。
- 活動電位は電位依存性のNa⁺チャネルとK⁺チャネルが協働して生じます。ChR2は開始を光で助ける役割です。
- 髄鞘の節間渡り、光ビーム、イオン・活動電位の粒子は教育用近似です。実際の分子構造、電気生理、遺伝子導入、治療成績を再現しません。
- 光強度0%では、光に依存するチャネル開口・イオン流入・活動電位を抑止します。数値は実測の光量や発光強度ではありません。

## モデル stats

- Meaningful mesh objects: **113**
- InstancedMesh systems: **9**、最大インスタンス要素: **758**
- 樹状突起: **40本**（主枝10・分枝30）、髄鞘節: **11**、ChR2: **18**、膜貫通らせん: **126**
- ミトコンドリア: **42**、光パルス: **36**、イオン: **216**、活動電位粒子: **128**、シナプス小胞: **84**
- PBR材質インスタンス: **13**、専用ShaderMaterial: **1**、LODレベル: **2**

自動品質は4段階です。DPR上限は0.75 / 1.0 / 1.3 / 1.65、描画ピクセルは約160万pxに制限します。実測の形状・材質・物理を再現するスペックではありません。

## 出典

- [NobelPrize.org — The Nobel Prize in Physiology or Medicine 2026, Press release](https://www.nobelprize.org/prizes/medicine/2026/press-release/) — 2026年10月5日。2026年ノーベル医学賞の一次情報。

## ファイル

- `index.html` / `app.css` — UI、レスポンシブ表示、2Dフォールバック
- `app.mjs` — 再生・シーク・UI・動的import・フォールバック
- `state.mjs` — 純粋な光遺伝学状態計算
- `content.mjs` — モード、研究段階、ホットスポット、出典
- `model.mjs` — 自作3Dモデル、InstancedMesh、PBR、専用shader、LOD
- `viewer.mjs` — Three.js描画、カメラ、投影ラベル、自動品質
- `favicon.svg` / `README.md`
- `scripts/tests/frontier-optogenetics.test.cjs` — リポジトリ側の回帰テスト

## 確認コマンド

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-optogenetics.test.cjs
```

ブラウザでの最終操作・描画確認は別途testサブエージェントの担当です。
