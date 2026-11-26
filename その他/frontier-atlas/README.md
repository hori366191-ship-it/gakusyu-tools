# FRONTIER ATLAS — Starship

宇宙図鑑の第1項目として制作した、Starshipの静的3D学習ページです。公開サイト・ポータル・GAS・既存アプリは変更していません。将来16項目まで増やせるよう、`content.mjs` に項目・段階・仕様・ホットスポットを分離しています。現時点の収録項目はStarshipのみです。

## ローカル起動

ES Modulesとimport mapを使うため、`file://` ではなくHTTPサーバーで開きます。PowerShellでこのフォルダを作業ディレクトリにして実行してください。

```powershell
python -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。Three.js 0.180.0はjsDelivrのCDNから読み込みます。CDNに接続できない場合やWebGLが使えない場合は、インラインSVGの2D模式図と解説を残します。

## 操作

- 再生 / 一時停止、0.5× / 1× / 2×、シーク、リセット
- ドラッグまたは矢印キーで周回、ホイールまたは `+` / `-` でズーム
- 上部の「観察」ボタンでドロワーを開き、「全体」「エンジン」「ホットステージング」「フラップ」「断面」「分解」「視点を戻す」を使う
- HTMLラベルのホットスポットでエンジン・タンク・分離リング・フラップ・ペイロードにフォーカス
- 下部transport内の追跡ボタンで自動・両方・上段・下段を選択。分離前は無効
- 自動追跡は統合機体 → 下段帰還 → 上段軌道/帰還 → 最終的な上下段保持の順に切り替え
- 段階ボタンで移動すると自動追跡に戻り、手動選択は自動へ戻すかリセットするまで保持
- モバイルでは下部の解説パネルを開閉

`prefers-reduced-motion: reduce` では自動再生しません。ページが非表示の間は描画を止め、再表示時にフレーム時刻をリセットします。

## モデルの注意点

- 全高約121m・直径約9mを基準にした独自のプロシージャルモデルです。
- SpaceXの画像・CAD・ロゴは使用していません。
- Super Heavyに33基、Starshipに6基のRaptorを目安に配置しています。エンジン数・ベル形状・タイル・タンク配置・フラップなどは世代や仕様で変わるため、実機を厳密に再現したものではありません。
- フラップは後方2枚＋前方2枚の計4枚。後方は左右の±X（180°間隔）、前方は20°と160°（140°間隔）です。前方は薄く小ぶりで胴体に近く、leeward側へ寄せ、ヒンジ軸を傾けています。ヒンジ・補強板・エアロカバー・放電ワイヤも同じ軸に簡易追加しています。
- 黒い耐熱タイルは風前面の半球だけに限り、裏面は裸のステンレスを見せます。フラップの耐熱面は黒いままです。
- ペイロードは上昇・分離・帰還中は格納し、軌道stageでのみベイ扉を開いて太陽翼を展開します。帰還前に再格納します。簡易PEZディスペンサーも胴体内に収まります。
- グリッドフィンは掃き出されたラティス形状、エンジンは内周・取り付けリング付きの教育用近似です。
- 分離高度はブースターbaseで320〜360モデル単位に引き上げました。実際の高度ではなく、発射台と地球の曲線を見せるための圧縮表現です。
- 地球は半径1000モデル単位の静止した巨大球として描き、大気圏も地球半径に比例させています。地形・星空・camera farもこの規模に合わせています。
- タンクの色、ペイロードの箱・太陽翼、発射台・塔は学習用のシンボルです。
- ミッションは発進・上昇・ホットステージング・下段帰還・軌道・上段帰還の6段階です。
- 帰還は横移動 → 高い位置で直立 → 垂直降下 → アーム閉鎖 → エンジン停止の順です。地面着陸ではなく、タワーの下段用/上段用アームで保持します。
- 下段のアームキャッチには飛行試験例があります。上段の帰還・アームキャッチと、最終的に上下段を並べて保持する状態は開発・構想として描画しています。
- 地球の上面は発射台地面よりわずかに下に置き、中央が平らで外周ほど球面へつながる地形メッシュが覆います。`GROUND_Y` と安全マージンを共有し、回転中の機体最下端が地面を下回らないよう制約します。
- アニメーションは順序を学ぶ短い教育用モンタージュです。実際の高度・飛行時間・重力・流体・軌道計算ではありません。
- 「飛行試験で確認されたこと」と「計画・構想」を分けて表示しています。

## 出典

- [SpaceX — Starship](https://www.spacex.com/vehicles/starship)
- [SpaceX — Updates](https://www.spacex.com/updates)
- 地球テクスチャ： [NASA Blue Marble: Next Generation, July 2004](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map#july) — NASA Earth Observatory（Reto Stöckli / NASA Goddard Space Flight Center）。`site/app13/textures/` のWebPを本ページへコピーし、高品質時は4096px、モバイル/軽量時は2048px版を使用します。

本ページはSpaceX・NASAの承認・推奨を示しません。

## ファイル

- `index.html` / `app.css` — UI、レスポンシブ表示、2Dフォールバック
- `app.mjs` — 再生・シーク・UI・動的import・フォールバック
- `mission-state.mjs` — 純粋なミッション状態計算
- `content.mjs` — 図鑑項目、段階、仕様、解説、出典
- `starship-model-spec.mjs` — フラップ・タイル・ペイロードの純粋なモデル仕様
- `starship-model.mjs` — 自作3Dモデル、InstancedMeshタイル、エンジン・排気
- `starship-viewer.mjs` — Three.js描画、カメラ、投影ラベル、自動品質
- `textures/earth-4096.webp` / `earth-2048.webp` — app13からコピーしたNASA Blue Marble地図
- `scripts/tests/frontier-starship.test.cjs` — 状態計算とHTML/CSS契約の回帰テスト（リポジトリ側）

## 確認コマンド

```powershell
# このフォルダを作業ディレクトリにして実行
node --check app.mjs
node --check content.mjs
node --check mission-state.mjs
node --check starship-model-spec.mjs
node --check starship-model.mjs
node --check starship-viewer.mjs
node --test ../../scripts/tests/frontier-starship.test.cjs
```

ブラウザでの最終操作・描画確認は別のtestサブエージェントの担当です。
