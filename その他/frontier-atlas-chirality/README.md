# FRONTIER ATLAS — MIRROR CHEMISTRY

鏡像異性体、キラル触媒、不斉合成、Soaiの自己触媒を学ぶ新規ローカルアプリです。既存アプリ、`site/`、ポータル、GASは変更していません。ビルド・バックエンド・外部APIは不要です。

## 起動

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。ES Modulesのため`file://`は使わず、HTTPサーバー経由にしてください。Three.js 0.180.0はjsDelivrから読み込み、CDN失敗・WebGL未対応・context loss時はSVGの2D模式図へフォールバックします。

## 操作

- 4モード：非キラル / 触媒結合 / 選択反応 / キラル生成物
- 再生 / 一時停止、0.5× / 1× / 2×、40秒ループ、タイムライン
- リセットで時刻・速度・視点・モードを初期化
- ドラッグ・矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- 鏡像体、触媒、リガンド、反応経路、生成物の5ホットスポット
- モバイル解説は折りたたみ、ブリーフィングは☰で開閉
- `Space`で再生切替、ヘルプは× / Esc / 背景クリックで閉じる

`prefers-reduced-motion: reduce` では自動再生せずモデル動作も静止させます。ページ非表示中は描画を止めます。

## 2026年ノーベル化学賞と研究段階

2026年10月7日の発表対象は、**「不斉有機合成における非線形効果と自己触媒」**です。

- **実用化**：キラル触媒による選択合成は、医薬品をはじめとする実用的な化学製造で使われています。
- **研究で確立**：Henri B. Kaganは1986年に不斉合成の非線形効果を発見しました。
- **基礎研究**：Kenso Soaiは1995年に自己触媒反応の可能性を報告し、2003年にきわめて強い鏡像選択性を実現しました。
- **研究**：生命のホモキラリティの普遍的な起源機構は、引き続き研究課題です。Soai反応の結果を生命起源の証明と同一視しません。

触媒表面、分子、遷移状態、障壁、ee、時間は教育用近似です。特定反応の構造・速度・エネルギー・実測値の再現ではありません。色は右手・左手の教育用記号で、CIPのR/S判定そのものではありません。

## モデルstats

- 主役の意味ある部品：**49**
- 宣言されたInstanced detail：**296**（活性サイト32、結合ポケット32、リガンド12、金属中心12、置換基36、支持層8、キラルリッジ24、分子原子64、分子結合60、支持ピン16）
- 鏡像分子： reactant / product 各2、原子は1分子16
- PBR材質：**9系統以上**（支持体、金属、活性サイト、リガンド、分子、結合等）
- 専用shader：鏡像面、反応障壁、背景
- パーティクル：**144**、LOD：**3段階**

## 品質・フォールバック

InstancedMesh、触媒の3段階LOD、DPR上限、自動品質、パーティクルdraw range、`visibilitychange`、WebGL `contextlost`、SVGフォールバックを実装しています。

## 出典

- [NobelPrize.org — Press release: Nobel Prize in Chemistry 2026](https://www.nobelprize.org/prizes/chemistry/2026/press-release/)
- [NobelPrize.org — Advanced information](https://www.nobelprize.org/prizes/chemistry/2026/advanced-information/)

本ページはノーベル賞・研究機関の承認・推奨を示しません。

## ファイル

`index.html` / `app.css` / `app.mjs` / `content.mjs` / `state.mjs` / `model.mjs` / `viewer.mjs` / `favicon.svg` / `README.md`

テストは `scripts/tests/frontier-chirality.test.cjs` に配置します。

## 確認コマンド

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-chirality.test.cjs
```

ブラウザでの最終操作・描画確認はtestサブエージェントの担当です。
