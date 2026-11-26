# FRONTIER ATLAS — HABITABLE WORLDS

分割鏡、coronagraph / starshade、系外惑星の直接撮影・分光を学ぶ静的3Dページです。`その他/frontier-atlas-hwo/` の新規アプリで、既存アプリ・ポータル・GAS・`site/` は変更していません。ビルド不要、外部API・バックエンドはありません。

## 起動

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。ES Modulesとimport mapのため `file://` は使わないでください。Three.js 0.180.0はjsDelivrから読み込み、CDN失敗・WebGL非対応・context loss時はインラインSVGと解説を残します。

## 操作

- 5モード: 分割鏡の展開 / 減光 / 直接撮影 / 分光 / 生命兆候
- 再生・一時停止、0.5× / 1× / 2×、45秒ループ、シーク、リセット
- ドラッグ・矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- `Space`で再生 / 停止、`R`でリセット
- 5ホットスポット、モバイル解説折りたたみ、reduced-motion対応
- 説明本文15px以上・補足12px以上・行間1.8以上をCSS変数で契約し、モバイル60dvh前後でスクロール維持

## 計画・構想であること

NASAのHWO公式ページは、Habitable Worlds Observatoryを推奨された大型宇宙望遠鏡の構想として紹介し、設計トレードを説明しています。**HWOは完成・稼働中の望遠鏡ではありません。** 模型の37枚の鏡、寸法、starshade・coronagraphの配置は教育用の比較模型で、確定設計ではありません。打ち上げ時期や生命の発見時期は断定しません。

直接撮影・分光には他望遠鏡での実測実績がありますが、HWO自身の観測実績とは分けて表示します。biosignatureは生命に関連し得る兆候の候補であり、生命の証明や検出発表ではありません。

## モデルstats

- 中央穴を避けた37枚の凹面一次鏡セグメント（教育用配置）
- セグメントごとの個別PBR材質・hexリム・裏板、111個のアクチュエータ、74個のヒンジ
- 二次鏡、3本の支持トラス、5層の太陽盾、coronagraphのレンズ・マスク・光学台
- 24枚のstarshadeペタル、主星、系外惑星、連続観測光路、分光器
- PBR: `MeshPhysicalMaterial`（鏡・太陽盾・レンズ）、`MeshStandardMaterial`（構造・惑星・機器）
- 専用shader: 主星コロナ、惑星大気フレネル
- 専用粒子: 観測光路を進む惑星光子
- `THREE.LOD`、品質別InstancedMesh count、DPR制限、自動品質
- mirror deployでは、主鏡・太陽盾・二次鏡トラス・starshadeが折りたたみ状態から展開

## 教育用近似・既知制約

角分離、明るさ、回折、鏡の位面誤差、展開時間を誇張・簡略化しています。37枚の配置と凹面曲率はHWOの確定設計ではなく、望遠鏡としての構造を認識するための教育用模型です。模式スペクトルは実測データではなく、H₂O・O₂・CH₄の候補ラインを説明用に並べたものです。starshadeとcoronagraphを同時に確定採用された方式として扱いません。惑星は特定天体ではなく、生命兆候の判断に必要な統計・非生物モデル・長期観測を完全には実装していません。

## 出典

- [NASA — Habitable Worlds Observatory](https://science.nasa.gov/astrophysics/programs/habitable-worlds-observatory)（2026年11月26日確認）
- [NASA HWO — Technology & Engineering](https://science.nasa.gov/astrophysics/programs/habitable-worlds-observatory/engineering/)

本ページはNASAの承認・推奨を示しません。

## ファイル

`index.html` / `app.css` — UI・2Dフォールバック  
`app.mjs` — 再生・UI・動的import  
`content.mjs` — モード・研究段階・出典  
`state.mjs` — 純粋な展開・減光・分光状態  
`model.mjs` — 分割鏡・starshade・惑星・分光模型  
`viewer.mjs` — Three.js描画・投影ラベル・自動品質  
`scripts/tests/frontier-hwo.test.cjs` — 回帰テスト

## 確認

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-hwo.test.cjs
```

最終ブラウザ操作・描画確認は別途testサブエージェントの担当です。
