# FRONTIER ATLAS — Procedural / Blender Starship比較

既存の `その他/frontier-atlas/starship-model.mjs` と、Blenderで新規制作したStarshipを同じ尺度・同じカメラで比較するローカルページです。既存のStarship/RSI/宇宙DC、ポータル、GASは変更しません。

**教育用モデルであり、実機のCAD・設計図ではありません。**

## ローカル起動

比較ページは `../frontier-atlas/starship-model.mjs` を相対importするため、必ずリポジトリルートでHTTPサーバーを起動してください。

```powershell
python -m http.server 8080
```

ブラウザで `http://localhost:8080/その他/frontier-atlas-blender/` を開きます。Three.js 0.180.0はjsDelivrから読み込みます。

## Blenderモデルの生成

Blender 5.3.0の実行ファイルパスを指定して、リポジトリルートで実行します。外部add-on・画像テクスチャは不要です。

```powershell
& "C:\Path\to\blender.exe" --background --python "scripts/blender/build_starship.py"
```

出力先:

- `その他/frontier-atlas-blender/models/starship-blender.glb`
- `その他/frontier-atlas-blender/models/starship-blender.blend`

生成後はページを再読み込みしてください。GLBがない場合も左側は表示され、右側にHTTPエラーと生成コマンドの案内を表示します。

## 操作

- デスクトップは左右、モバイルは上下に2つのThree.jsキャンバスを配置
- ドラッグまたは矢印キーで周回、ホイールまたは `+` / `-` でズーム、2本指でピンチ
- カメラ同期ONなら片方の操作を両方へ反映。OFFで独立観察、ON復帰時は最後に操作した側をコピー
- 表示切替は全体 / フラップ / エンジン / 側面
- 三角形数・メッシュ数・材質数・ファイルサイズを各モデルに表示

## モデル仕様

- Super Heavy: 半径4.5m、基準高さ71m
- Starship上段: 半径4.5m、全高50m、ogive先端
- 合計全さ121m。BlenderのZ-upをglTF exporterでY-upへ変換し、Three.js側のY=71に上段を合わせる
- 後方フラップ2枚は±X、180°間隔
- 前方フラップ2枚は20° / 160°、140°間隔。ヒンジ軸を傾け、leeward側へ寄せる
- Super Heavy 33基、Starship 6基のエンジンベル
- グリッドフィン4枚、ホットステージリング
- 黒タイルは風前面半球のみ。Hexタイルはリンクインスタンスを作ってから1メッシュへマージ
- ステンレス / 黒タイル / ダークスチールのPBR材質とUVを保持
- フラップ・グリッドフィン・エンジン周辺にベベル

左側のファイルサイズは `starship-model.mjs` と `starship-model-spec.mjs` のJS合計です。右側はGLBファイルの実バイト数です。三角形数は現在版のInstancedMeshを含む描画メッシュを数えます。

## 確認コマンド

```powershell
node --check "その他/frontier-atlas-blender/app.mjs"
node --check "その他/frontier-atlas-blender/viewer.mjs"
node --test "scripts/tests/frontier-blender-compare.test.cjs"
```

ブラウザでの描画・操作確認とBlender実行は別途行います。
