# FRONTIER ATLAS — AIタンパク質構造予測

アミノ酸配列、拡散モデルによるデノイズ、二次構造、タンパク質–リガンド結合、タンパク質–DNA相互作用を、中央3D・右解説・モバイル下部シートで学ぶ新規ローカルアプリです。既存アプリやポータルは変更していません。

## 起動

静的ES Modulesのため、ローカルHTTPサーバーから開きます。

```powershell
python -m http.server 8000
# http://localhost:8000/その他/frontier-atlas-protein-ai/
```

`file://` ではES ModulesとPDBの`fetch`が制限されます。Three.js 0.180.0はjsDelivrのimport mapから読み込みます。CDN・WebGL・PDB読み込みが失敗した場合は、操作可能なインラインSVGの2D模式図へフォールバックします。

## 操作

- ドラッグ / 1本指：周回
- ホイール / ピンチ / `+` / `-`：ズーム
- 矢印キー：視点回転、`Home`：視点リセット
- `Space`：再生・一時停止、`R`：全リセット、`1`〜`5`：モード切替
- 速度：0.5× / 1× / 2×
- ホットスポット：視点フォーカスと根拠・限界の表示
- モバイル：`解説を開く`で下部シートを展開

## 表示モード

1. `sequence` — 拡張したアミノ酸鎖と側鎖
2. `denoise` — 専用Shader粒子と座標補間による教育用デノイズ
3. `fold` — PDBのHELIX / SHEET記録を使ったαヘリックス・βシート
4. `docking` — 自作リガンド9原子と5候補ポーズ
5. `interaction` — 自作DNA24塩基対と模式接触線

## データと証拠の区分

- **実測**：RCSB PDB `1CRN`（327重原子 / 46残基 / 1.5 Å）と`1UBQ`（602重原子 / 76残基 / 1.8 Å）の公開実験座標。`data/`にローカル保存し、実行時の外部データ取得は行いません。
- **研究**：AlphaFold 3の原子座標拡散モジュール、共同複合体予測、pLDDT / PAE / PDE、既知の限界。
- **実装**：PDBパーサ、InstancedMesh、PBR材質、Shader粒子、LOD、自動品質、キーボード・タッチ操作、2Dフォールバック。
- **教育用近似・構想**：折りたたみ補間、予測プロキシ、疑似pLDDTカラー、リガンド、ポケット、DNA配置、接触線。

「予測プロキシ」は実測PDB座標を近傍平均で滑らかにした表示用モデルです。AlphaFoldの予測でも、予測精度の実証でもありません。`compare`では実測原子をゴーストとして重ね、予測と実験の違いを説明します。

## モデル統計

2構造合計：

| 項目 | 値 |
|---|---:|
| 残基 | 122 |
| 重原子 | 929 |
| HELIX / βシート / ストランド | 4 / 2 / 7 |
| Instanced detail | 1,321 |
| Shader粒子 | 320 |
| PBR材質 | 6種 |
| LODオブジェクト | 4 |
| ホットスポット | 5 |

`instancedDetail`は原子・Cα・主鎖結合・リガンド候補・DNA塩基対・台座ディテールの表示用インスタンス数です。意味のある構造部品は40件以上あります。

## 品質・ failure safety

- DPR上限とピクセル総数制限、4段階の自動品質調整
- `prefers-reduced-motion`、`document.hidden`でアニメーション停止
- InstancedMesh、PDB二次構造の2段階LOD
- `webglcontextlost`で2Dへ切替
- WebGLRenderer生成失敗・CDN失敗・PDB失敗をアプリ層で捕捉

## テスト

```powershell
node --check その他/frontier-atlas-protein-ai/app.mjs
node --test scripts/tests/frontier-protein-ai.test.cjs
```

テストはcontent、state、PDB解析、モデル統計、HTML/CSS、操作・フォールバック契約をオフラインで確認します。ブラウザでの描画・操作確認は`test`サブエージェントの対象です。

## 出典

- Abramson et al., “Accurate structure prediction of biomolecular interactions with AlphaFold 3”, Nature (2024): https://www.nature.com/articles/s41586-024-07487-w
- Callaway, “AlphaFold database hits ‘next level’: the AI system now includes protein pairing”, Nature News (2026): https://www.nature.com/articles/d41586-026-00787-3
- RCSB PDB 1CRN: https://www.rcsb.org/structure/1CRN
- RCSB PDB 1UBQ: https://www.rcsb.org/structure/1UBQ

PDBデータの帰属表示は各PDBファイルのHEADER / REMARKにも保持しています。本アプリは企業・研究機関の承認・推奨を示しません。
