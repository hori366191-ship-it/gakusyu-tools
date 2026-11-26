# FRONTIER ATLAS — BEYOND EARTH

Starshipの打ち上げから火星の居住構想までを学ぶ、静的3Dのローカル展示ページです。`その他/frontier-atlas-mars/` の新規アプリで、既存アプリ・ポータル・GAS・`site/` は変更していません。ビルド不要、外部API・バックエンドはありません。

## 起動

```powershell
# このフォルダを作業ディレクトリにして実行
python -m http.server 8080
```

`http://localhost:8080/` を開きます。ES Modulesとimport mapのため `file://` は使わないでください。Three.js 0.180.0はjsDelivrから読み込み、CDN失敗・WebGL非対応・context loss時はインラインSVGと解説を残します。

## 操作

- 6モード: 打ち上げ / 地球―火星遷移 / 大気突入 / 着陸 / ISRU / 居住棟
- 再生・一時停止、0.5× / 1× / 2×、48秒の教育用ループ、シーク、リセット
- ドラッグ・矢印キーで周回、ホイール・ピンチ・`+` / `-`でズーム
- `Space`で再生 / 停止、`R`でリセット
- 5ホットスポット、モバイル解説折りたたみ、reduced-motion対応
- 説明本文15px以上・補足12px以上・行間1.8以上をCSS変数で契約し、モバイル60dvh前後でスクロール維持

## 実績・構想の区別

- **火星の無人探査・着陸・MOXIE実証**: NASAの実績。Perseveranceは大気のCO₂から酸素を生成する実証を行いました。
- **SpaceX Starship火星構想**: 企業が示す開発・構想。本ページは打ち上げ・再利用・給油・着陸・定住の完成を実績として扱いません。
- **有人火星到達・定住**: 未実現の構想。実現時期・人数・自給率を断定しません。
- **NASA Artemis**: 月探査プログラム。月面運用の知見を将来の有人火星ミッションの基盤にするとNASAは説明しますが、月と火星の環境は同一ではありません。

## モデルstats

- 既存 `../frontier-atlas/starship-model.mjs` の `createStarshipModel()` を再利用
- 722個の熱シールドタイル、booster 33基・upper stage 6基のエンジン
- 前後フラップ4枚、グリッドフィン4枚、分離リング、タンク・配管・ payload bay
- 180個の地形岩、120個の植物instances、310個の噴流粒子、専用の突入プラズマ・塵・資源粒子
- 居住モジュール、ISRUタンク・採掘塔・配管、太陽電池、植物工場は従来モデルを維持
- PBR: `MeshPhysicalMaterial`（ガラス・太陽電池）、`MeshStandardMaterial`（ステンレス・炭素・レゴリス・植物）
- 専用shader: 地球、火星大気、突入プラズマ
- 固定スケールのStarship rigで形状を変形させず、booster分離・推力・着陸高度のみを更新
- `THREE.LOD`、品質別InstancedMesh count、DPR制限、自動品質

## 教育用近似・既知制約

公式CADではありません。再利用したStarship模型も教育用で、距離・時間・速度・熱・推力・塵・資源量・植物成長を誇張・簡略化しています。地球―火星間は実際の遷移軌道ではなく直線の模式表現です。MOXIEの小規模実証を、定住規模のISRU実用化と混同しません。植物工場の閉鎖循環、放射線、低重力、長期保守、心理面を完全にはシミュレーションしていません。

## 出典

- [SpaceX — Humanspaceflight: Mars](https://www.spacex.com/humansspaceflight/mars)
- [NASA — Artemis](https://www.nasa.gov/humans-in-space/artemis/)（2026年11月26日確認）
- [NASA — Mars 2020 Perseverance / MOXIE](https://science.nasa.gov/mission/mars-2020-perseverance/)（2026年11月26日確認）

本ページはSpaceX・NASAの承認・推奨を示しません。

## ファイル

`index.html` / `app.css` — UI・2Dフォールバック  
`app.mjs` — 再生・UI・動的import  
`content.mjs` — モード・研究段階・出典  
`state.mjs` — 純粋な飛行・着陸・ISRU状態  
`model.mjs` — Starship・惑星・地形・居住構想  
`viewer.mjs` — Three.js描画・投影ラベル・自動品質  
`scripts/tests/frontier-mars.test.cjs` — 回帰テスト

## 確認

```powershell
node --check app.mjs
node --check content.mjs
node --check state.mjs
node --check model.mjs
node --check viewer.mjs
node --test ../../scripts/tests/frontier-mars.test.cjs
```

最終ブラウザ操作・描画確認は別途testサブエージェントの担当です。
