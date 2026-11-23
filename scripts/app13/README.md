# 星巡り：観測画像の変換

Python に Pillow と NumPy を入れ、リポジトリルートから実行します。

```console
python scripts/app13/build-textures.py --cache <取得元データの一時保存先>
python scripts/app13/build-textures.py --cache <取得元データの一時保存先> --planet venus
```

出力は `site/app13/textures/` に書き出します。取得元データは SHA-256 で照合します。

金星の `venus-cloud-infill.webp` は、ISAS/JAXA「あかつき」UVI の観測範囲を示したマップを参照に、OpenAI の画像生成で作った補完用画像です。このファイル自体は配信しません。ビルドで観測データを再投影し、観測値の信頼できる領域を保持したまま、外側だけを補完画像と合成します。生成処理そのものはビルド時に再実行しません。観測データの出典・ライセンス・加工内容は `site/credits.html#solar-venus` を参照してください。

## 衛星

```console
python scripts/app13/build-moon-textures.py --cache <取得元データの一時保存先>
python scripts/app13/build-moon-textures.py --cache <取得元データの一時保存先> --prepare <観測確認用の出力先>
```

前者は `site/app13/textures/moons/` に可逆WebPを出力します。後者は観測地図と採用範囲のマスクを出力し、生成素材は使いません。元画像はNASA・JPL等の公開製品をバイト単位で照合します。黒の欠測や使わない縁、判読できない低品質領域を除外する保守的なマスクであり、ミッションの全観測範囲を示すものではありません。

`moon-infill-1.webp` と `moon-infill-2.webp` は、観測地図を3列2行に並べ、欠損をマゼンタで示した参照画像を渡してOpenAIの画像生成モデルで編集した出力です。再生成をビルド時に行うものではありません。利用するマスの順序は `ATLAS_GROUPS` を参照してください。ネレイドはボイジャー2号の低解像度写真を参照に渡しましたが、実際の地形を読み取れないため、全面を生成の質感として扱います。それ以外では、生成側の色と明るさを隣接する観測画像に合わせて欠損範囲だけに合成し、採用した観測地図の画素は境界も含めて保持します。観察メモ用の `*-coverage.png` は合成に使うマスクと同じで、白が観測画像、黒がAI補完です。各画像の出典とクレジットは `site/app13/moon-maps.mjs` にあります。
