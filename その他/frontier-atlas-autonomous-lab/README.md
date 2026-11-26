# FRONTIER ATLAS — 自律型AIラボ

仮説・計画、ロボット実験、顕微鏡測定、データ解析、次の実験設計を、中央3D・右解説・モバイル下部シートで学ぶ新規ローカルアプリです。既存アプリやポータルは変更していません。

## 起動

```powershell
python -m http.server 8000
# http://localhost:8000/その他/frontier-atlas-autonomous-lab/
```

静的ES Modulesのため`file://`ではなくHTTPサーバーから開きます。Three.js 0.180.0はjsDelivrのimport mapから読み込みます。WebGL・CDNが使えない場合は、操作可能なインラインSVGの2D模式図へフォールバックします。

## 操作

- ドラッグ / 1本指：周回
- ホイール / ピンチ / `+` / `-`：ズーム
- 矢印キー：視点回転、`Home`：視点リセット
- `Space`：再生・一時停止、`R`：全リセット、`1`〜`5`：工程切替
- 速度：0.5× / 1× / 2×
- 自律度スライダー：0〜100%（5%刻み）
- ホットスポット：視点フォーカスと根拠・限界の表示
- モバイル：`解説を開く`で下部シートを展開

## 5工程

1. `hypothesis` — 仮説カードとAIコア
2. `experiment` — 6関節の模式アーム、ピペット、液滴
3. `measurement` — 顕微鏡ステージと走査光
4. `analysis` — 12本の解析バーとデータ粒子
5. `next-design` — 次の条件とプレート更新

自律度80%未満は人間レビューを挟む開ループ、80%以上は完全自律の構想として閉ループを表示します。80%は安全・信頼性・倫理の実証値ではなく、展示用のしきい値です。

## 証拠の区分

- **実測・報告**：Biomni論文の443問・10タスク・平均精度57%、公開スマートウォッチ解析、研究者が実施したクローニング手順、ロボット用コード生成など。
- **研究**：検索拡張計画、コード実行、能動学習、ベイズ最適化、装置較正、例外回復、過程評価。
- **実装**：Procedural Three.jsモデル、InstancedMesh、PBR材質、Shader液滴、LOD、自動品質、キーボード・タッチ操作、2Dフォールバック。
- **構想**：完全自律ラボ、安全判断・目標設定・研究倫理までをAIへ委ねる閉ループ。

このアプリはAIエージェントを実行せず、実ロボット・顕微鏡・試薬を制御しません。グラフ、液滴、走査線、色変化は決定的な教育用データです。

## モデル統計

| 項目 | 値 |
|---|---:|
| 意味のある部品 | 660 |
| Instanced detail | 435 |
| 96ウェル | 96 |
| バイアル / キャップ | 24 / 24 |
| AI回路ディテール | 95 |
| 液滴Shader粒子 | 220 |
| フローパーティクル | 30 |
| PBR材質 | 7種 |
| LODオブジェクト | 1 |
| ホットスポット | 5 |

`meaningfulParts`はウェル・液面・回路・粒子・関節・カードなどを含む表示用の部品数です。40件以上の要件を十分に満たします。

## 品質・ failure safety

- DPR上限とピクセル総数制限、4段階の自動品質調整
- `prefers-reduced-motion`、`document.hidden`でアニメーション停止
- InstancedMesh、AIコアの2段階LOD
- `webglcontextlost`で2Dへ切替
- WebGLRenderer生成失敗・CDN失敗をアプリ層で捕捉

## テスト

```powershell
node --check その他/frontier-atlas-autonomous-lab/app.mjs
node --test scripts/tests/frontier-autonomous-lab.test.cjs
```

テストはcontent、state、モデル統計、HTML/CSS、操作・フォールバック契約をオフラインで確認します。ブラウザでの描画・操作確認は`test`サブエージェントの対象です。

## 出典

- Huang et al., “Autonomous biomedical research with an artificial intelligence agent”, Science 393, eadz4351 (2026): https://www.science.org/doi/10.1126/science.adz4351
- Siemen et al., “A self-supervised robotic system for autonomous contact-based spatial mapping of semiconductor properties”, Science Advances (2025): https://www.science.org/doi/10.1126/sciadv.adw7071

本アプリは企業・研究機関の承認・推奨を示しません。
