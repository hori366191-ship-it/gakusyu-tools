# CI テストの並列化（シャード分割）

## 背景

`.github/workflows/tests.yml` は以前、1 ジョブで `scripts/tests/*.test.cjs`（95 ファイル）を
すべて直列実行していた。2026-11-28 の実測では **12 分 24 秒**かかり、`Deploy` ワークフローは
先に完了しているのに `Tests` だけが待ち時間のボトルネックになっていた。

そこでテストを 8 個のシャードへ分割し、matrix で別ランナーに並列実行させる。
**テストの中身（`*.test.cjs`・fixtures・helpers）は一切変更していない。**

2026-11-28 の実測: 8 分割のみ（95 ファイル）の初回実行は **14 分 24 秒**で、直列より遅かった。
原因は app11 の重いテストが同じシャードに入り、他のテストから CPU を奪い合っていたこと。
ファイルサイズを重みにした配分では、実行時間の長さを表現できていなかった。

1 本ずつローカル実測したところ **20 秒の打ち切りで判定して 5 本**が該当した（下記「重い 5 本」）。
そこで 5 本を **`tests-app11-heavy.yml`（app11 関連の変更時だけ走る専用ワークフロー）** へ分離した。
通常の `Tests` は **90 ファイル**・8 シャードで走る（実測 **27 秒**）。全体は 95 ファイル ＝
通常 90 ＋ 重い 5 で、重複はない。

### 重い 5 本（ローカル実測、1 本ずつ実行）

| テスト | 実測 |
| --- | --- |
| `app11-academic-stoichiometry.test.cjs` | 536 秒（ビルドを 2 回。`scripts/app11/build-academic-data.cjs --check` 単体で 279 秒） |
| `app11-academic.test.cjs` | 20 秒超（打ち切り） |
| `app11-academic-layout.test.cjs` | 20 秒超（打ち切り） |
| `app11-proposed-layout.test.cjs` | 20 秒超（打ち切り） |
| `app11-reaction-map.test.cjs` | 20 秒超（打ち切り） |

5 本をまとめて CI（`Tests (app11 heavy)` 1 ジョブ）で実行した実測は **9 分 58 秒**（2026-11-28）。

### 通常側に残したテスト

`app11-grouped-paths-ui`（15 秒）・`transport`（11 秒）・`security-backends`（20 秒）は通常シャードに残す。

- `app11-grouped-paths-ui` は 15 秒で 1 本では短く、app11 以外の変更でも入力が変わらない
- `transport` / `security-backends` は app11 専用ではなく、共通基盤（site-gas / worker）の回帰なので
  通常側で常時走らせる必要がある
- いずれも 1 本では短く、同じシャードの他テストを著しく遅らせない

### なぜ安全か

5 本が検証しているのは app11 のデータ・出典・ビルド・反応マップ・レイアウトであり、app14 など他アプリの
変更では入力が変わらない。そのため通常 push で走らせなくても回帰検出力は落ちない。
逆に app11 系（`site/app11/**`・`site/app10/**`・`scripts/app11/**`・`site-src/app11/**`・
該当テスト・helpers・fixtures）を触ったときは必ず専用ワークフローで走る。
`workflow_dispatch` でも手動実行できる。

## 仕組み

- `scripts/tests/shard.cjs` がテストファイルを `total` 個のバケットへ配分する
  - 対象: `scripts/tests` 直下の `*.test.cjs` のうち `HEAVY_TESTS` を除いたもの（90 ファイル）
  - 重み: `fs.statSync().size`（ファイルサイズを実行時間の近似として使用）
  - アルゴリズム: **サイズの大きい順に、その時点で合計サイズが最も小さいシャードへ**割り当てる貪欲法
  - 決定的: 同じファイル集合なら毎回同じ配分になる（負荷順ソートはコピーに対して行い、シャード番号は固定）
- `HEAVY_TESTS`（`app11-academic` / `app11-academic-layout` / `app11-academic-stoichiometry` /
  `app11-proposed-layout` / `app11-reaction-map` の 5 本）は
  通常配分から除外し、`--heavy` でパスを出力する。専用ワークフローがこれを `node --test` に渡す
- ワークフローは `matrix.shard: [0..7]` で 8 並列、`fail-fast: false`（1 シャードの失敗で他を打ち切らない）
- 各ジョブは自分のシャード分だけを `node --test` に渡す

```
node --test $(node scripts/tests/shard.cjs ${{ matrix.shard }} 8)   # tests.yml（90 ファイル）
node --test $(node scripts/tests/shard.cjs --heavy)                 # tests-app11-heavy.yml（5 ファイル）
```

`shard.cjs <index> <total>` は選択されたファイルパスをスペース区切りで 1 行出力するので、
シェルでそのまま `node --test` の引数にできる。

## ローカルでの確認方法

### 配分の検証（全ファイルがちょうど 1 回ずつ含まれるか）

```bash
node scripts/tests/shard.cjs --verify 8
# => OK (95 files / 8 shards + 5 heavy（別ワークフロー）, each exactly once)
```

`--verify` は「通常シャードの和集合 ＋ HEAVY ＝ 全ファイル、重複 0」を検証する。

### 重いテストだけ実行

```bash
node --test $(node scripts/tests/shard.cjs --heavy)
```

```powershell
# Windows PowerShell 5.1 は $(...) で配列にならないため分割して渡す
$files = (node scripts/tests/shard.cjs --heavy) -split ' '
node --test $files
```

### 1 シャードだけ実行（bash / macOS / Linux / Git Bash / CI）

```bash
node --test $(node scripts/tests/shard.cjs 0 8)
```

### Windows PowerShell 5.1（`$(...)` の展開が異なるため分割して渡す）

```powershell
$files = (node scripts/tests/shard.cjs 0 8) -split ' '
node --test $files
```

### 配分の偏りを見る

```powershell
0..7 | ForEach-Object {
  $files = @((node scripts/tests/shard.cjs $_ 8) -split ' ' | Where-Object { $_ -ne '' })
  $bytes = ($files | ForEach-Object { (Get-Item $_).Length } | Measure-Object -Sum).Sum
  "shard {0}: {1} files, {2} bytes" -f $_, $files.Count, $bytes
}
```

## 新しいテストを追加したとき

- `scripts/tests/` に `*.test.cjs` を置くだけでよい。`shard.cjs` が毎回ファイルを列挙するため、
  matrix やワークフローの編集は不要（自動追従）。
- 追加・削除でシャード間の配分は変わりうるが、常に「サイズ合計が最小のシャード」へ入るため偏りは小さい。
- **重いテスト（1 本あたり 20 秒超かかるもの）を追加したら**:
  1. `scripts/tests/shard.cjs` の `HEAVY_TESTS` にファイル名を追加する
  2. `.github/workflows/tests-app11-heavy.yml` の `paths` に、そのテストが読む
     `site/app*`・`scripts/app*`・`site-src/*` などの入力を追加する
     （`scripts/tests/app11-*.test.cjs` は glob で登録済みのため、app11 系テストのファイル追加は不要）
  - これをしないと、通常シャードに残って他のテストから CPU を奪い、8 分割全体が遅くなる
- サイズが実行時間の近似なので、HEAVY に入れるほどではないがサイズの割に遅いテストがある場合は、
  テスト側で外部 I/O を減らすなど実行時間そのものを下げる。`shard.cjs` の重み付けを変える場合は、
  テスト内容ではなく配分だけを変えること。

## 変えてはいけないこと

- テスト本体（`scripts/tests/*.test.cjs`）、assert、fixtures/helpers
- Node のバージョン（22）
- ワークフローのトリガー（`paths`）と権限（`permissions: contents: read`）
- 実行されるテストの集合（通常 8 シャードの和集合 ＋ HEAVY ＝ 全ファイル、重複なし）

## 実測比較

| 構成 | 実行時間 |
| --- | --- |
| 分割前（1 ジョブ・95 ファイル直列） | 12 分 24 秒（2026-11-28 実測） |
| 8 分割のみ（95 ファイル） | 14 分 24 秒（2026-11-28 実測、初回。重いテストが同じシャードで CPU を奪い合い悪化） |
| 8 分割（90 ファイル）＋重い 5 本を専用ワークフローへ分離（通常の `Tests`） | 27 秒（2026-11-28 実測） |
| 専用ワークフロー `Tests (app11 heavy)`（重い 5 本） | 9 分 58 秒（2026-11-28 実測、app11 / app10 / scripts/app11 の変更時のみ） |

ローカル実測（1 本ずつ）: `app11-academic-stoichiometry` 単体 536 秒、
`scripts/app11/build-academic-data.cjs --check` 単体 279 秒。

`--verify` 時点（通常シャード 90 ファイル）のシャード配分は **6〜13 ファイル**（6 / 9 / 11 / 12 / 13 ×4）、
サイズ合計は約 282.1 KB〜282.9 KB で偏りは 1% 未満に収まっている。
ファイル数は均等ではないが、サイズ（＝実行時間の近似）合計が揃うよう配分されている。
