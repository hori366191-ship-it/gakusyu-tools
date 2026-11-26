# FRONTIER ATLAS — EMBODIED INTELLIGENCE

人型・四足ロボット、センサー、政策ネットワーク、バランス制御を学ぶ新規ローカルアプリです。既存アプリ、`site/`、ポータル、GASは変更していません。ビルド・バックエンド・外部APIは不要です。

## 起動

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。ES Modulesのため`file://`は使わず、HTTPサーバー経由にしてください。Three.js 0.180.0はjsDelivrから読み込み、CDN失敗・WebGL未対応・context loss時はSVGの2D模式図へフォールバックします。

## 操作

- 5モード：知覚 / 計画 / 運動制御 / バランス / 学習
- 再生 / 一時停止、0.5× / 1× / 2×、40秒ループ、タイムライン
- リセットで時刻・速度・視点・モードを初期化
- ドラッグ・矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- センサー、関節、政策、障害物、足裏の5ホットスポット
- モバイル解説は折りたたみ、ブリーフィングは☰で開閉
- `Space`で再生切替、ヘルプは× / Esc / 背景クリックで閉じる

`prefers-reduced-motion: reduce` では自動再生せずモデル動作も静止させます。ページ非表示中は描画を止めます。

## 現状と将来像

- **実装・製品**：Unitree G1やGo2のように、歩行・センシング・開発者向け制御を持つ実機があります。
- **研究・限定提供**：Google DeepMindは2025年9月、Gemini Robotics 1.5を選定パートナー向け、Gemini Robotics-ER 1.5を開発者向けに提供したと発表しました。
- **実装・限定用途**：検査、搬送、研究、デモなどには実装例があります。万能・無監督を意味しません。
- **研究**：未知の家庭や職場での普遍的な汎化、長いタスク、安全な人間共存は研究中です。

歩行、点群、政策ネットワーク、障害物、報酬は教育用近似です。実機の制御プログラム、安全性保証、学習データの再現ではありません。G1の23自由度以上の実機を、模型では主要12関節に簡略化しています。

## モデルstats

- 主役の意味ある部品：**66**
- 宣言されたInstanced detail：**398**（政策ノード26、政策エッジ84、センサーポイント180、ファスナー48、指関節30、障害物18、経路マーカー12）
- 身体：人型 + 四足、人型の主要**12関節**をアニメーション
- PBR材質：**10系統以上**（ポリマー、カーボン、アルミ、銅、ゴム、ガラス、発光材等）
- 専用shader：LiDAR走査面、政策信号、背景
- パーティクル：**220**、LOD：**3段階**

## 品質・フォールバック

InstancedMesh、政策ボードの3段階LOD、DPR上限、自動品質、センサーポイントのdraw range、`visibilitychange`、WebGL `contextlost`、SVGフォールバックを実装しています。

## 出典

- [Google DeepMind — Gemini Robotics 1.5 brings AI agents into the physical world](https://deepmind.google/discover/blog/gemini-robotics-15-brings-ai-agents-into-the-physical-world/)
- [Unitree — G1 Humanoid Robot](https://www.unitree.com/g1)
- [Unitree — Go2 Quadruped Robot](https://www.unitree.com/go2)

本ページは企業・研究機関の承認・推奨を示しません。

## ファイル

`index.html` / `app.css` / `app.mjs` / `content.mjs` / `state.mjs` / `model.mjs` / `viewer.mjs` / `favicon.svg` / `README.md`

テストは `scripts/tests/frontier-physical-ai.test.cjs` に配置します。

## 確認コマンド

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-physical-ai.test.cjs
```

ブラウザでの最終操作・描画確認はtestサブエージェントの担当です。
