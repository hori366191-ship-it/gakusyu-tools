# app10 baseline fixture（35120ea）

旧 `site/app10`（公開版）の回帰テスト用固定コピーです。**編集禁止**。由来は次のとおりです。

- 基準コミット: `35120ea`
- 旧 `site/app10` tree: `0a39827e1d48d658bbb464ad16fad19b4f09e25b`
- 取得日: 2026-11-10
- 完全snapshot: `archive/site-app10-35120ea-20261110/`（未追跡）

旧 `scripts/tests/app10-organic.test.cjs` が読むアプリ資産のみを保持します。ポータル・テーマ・クレジットは現行 `site/` を読みます。`data.js` は367化合物、`FAMILIES` なしの旧版です。現在の `site/app10` はNEXT版（420化合物）へ置換済みのため、旧テストはこのfixtureを `readApp` 経由で参照します。

## SHA-256

```text
app.css               6f22f08eca4f9f59f5f6962826d4e635641bfe3061170f58fd5b85aa80439283
app.js                0bd825579327c8dfdd4a480650a5a6db851db8cf11cfb1a155631df037a859f7
catalog-audit.md      e61e99e667a451eeabb67c9f11efe317aac32b0e6bb249973e009e61bfc7418b
data.js               65ae2a3d7625990abadf5f9ec0e6e77688bc01f6f0f3703bf776151055b1ca15
draw.js               1cbad808672b666b83b0376034e3162697e11f88c99295ab172606cd6f4696a9
external-coverage.js  758348cc74a72ffde0ad51dc044cc6a9d1fd1000e9e4eb66853cccfcfaae12d5
favicon.svg           dbb8091ab2c66e429eda315c64f4d3ab78b3b6db24bddaf2a1a15a329918c4e9
index.html            6806979774748d504e4152bb5619cfe9ecf3f91923b1b0c3c67caf77a5066818
ledger.html           8fc1674ad16aef073aa142760caf73ddb045981049595f5bbd77a8b512dd4e32
ledger.js             d149509d7ba139bac1b7b6632187379709477cac3ec42aac545a55335cce5474
```
