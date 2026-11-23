# 星巡り：観測画像の変換

Python に Pillow と NumPy を入れ、リポジトリルートから実行します。

```console
python scripts/app13/build-textures.py --cache <取得元データの一時保存先>
python scripts/app13/build-textures.py --cache <取得元データの一時保存先> --planet venus
```

出力は `site/app13/textures/` に書き出します。取得元データは SHA-256 で照合します。

金星の `venus-cloud-infill.webp` は、ISAS/JAXA「あかつき」UVI の観測範囲を示したマップを参照に、OpenAI の画像生成で作った補完用画像です。このファイル自体は配信しません。ビルドで観測データを再投影し、観測値の信頼できる領域を保持したまま、外側だけを補完画像と合成します。生成処理そのものはビルド時に再実行しません。観測データの出典・ライセンス・加工内容は `site/credits.html#solar-venus` を参照してください。
