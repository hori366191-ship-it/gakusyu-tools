# CI テストの並列化（シャード分割）

## 背景

`.github/workflows/tests.yml` は以前、1 ジョブで `scripts/tests/*.test.cjs`（95 ファイル）を
すべて直列実行していた。2026-11-28 の実測では **12 分 24 秒**かかり、`Deploy` ワークフローは
先に完了しているのに `Tests` だけが待ち時間のボトルネックになっていた。

そこでテストを 8 個のシャードへ分割し、matrix で別ランナーに並列実行させる。
**テストの中身（`*.test.cjs`・fixtures・helpers）は一切変更していない。**

## 仕組み

- `scripts/tests/shard.cjs` がテストファイルを `total` 個のバケットへ配分する
  - 対象: `scripts/tests` 直下の `*.test.cjs`
  - 重み: `fs.statSync().size`（ファイルサイズを実行時間の近似として使用）
  - アルゴリズム: **サイズの大きい順に、その時点で合計サイズが最も小さいシャードへ**割り当てる貪欲法
  - 決定的: 同じファイル集合なら毎回同じ配分になる（負荷順ソートはコピーに対して行い、シャード番号は固定）
- ワークフローは `matrix.shard: [0..7]` で 8 並列、`fail-fast: false`（1 シャードの失敗で他を打ち切らない）
- 各ジョブは自分のシャード分だけを `node --test` に渡す

```
node --test $(node scripts/tests/shard.cjs ${{ matrix.shard }} 8)
```

`shard.cjs <index> <total>` は選択されたファイルパスをスペース区切りで 1 行出力するので、
シェルでそのまま `node --test` の引数にできる。

## ローカルでの確認方法

### 配分の検証（全ファイルがちょうど 1 回ずつ含まれるか）

```bash
node scripts/tests/shard.cjs --verify 8
# => OK (95 files / 8 shards, each exactly once)
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
  $files = (node scripts/tests/shard.cjs $_ 8) -split ' '
  $bytes = ($files | ForEach-Object { (Get-Item $_).Length } | Measure-Object -Sum).Sum
  "shard {0}: {1} files, {2} bytes" -f $_, $files.Count, $bytes
}
```

## 新しいテストを追加したとき

- `scripts/tests/` に `*.test.cjs` を置くだけでよい。`shard.cjs` が毎回ファイルを列挙するため、
  matrix やワークフローの編集は不要（自動追従）。
- 追加・削除でシャード間の配分は変わりうるが、常に「サイズ合計が最小のシャード」へ入るため偏りは小さい。
- **注意**: サイズが実行時間の近似なので、極端に重い（あるいはサイズの割に遅い）テストを 1 本追加すると
  そのシャードだけが遅くなる。その場合は当該テストを分割するか、テスト側で外部 I/O を減らすなどして
  実行時間そのものを下げる。`shard.cjs` の重み付けを変える場合は、テスト内容ではなく配分だけを変えること。

## 変えてはいけないこと

- テスト本体（`scripts/tests/*.test.cjs`）、assert、fixtures/helpers
- Node のバージョン（22）
- ワークフローのトリガー（`paths`）と権限（`permissions: contents: read`）
- 実行されるテストの集合（8 シャードの和集合＝全ファイル、重複なし）

## 実測比較

| 構成 | 実行時間 |
| --- | --- |
| 分割前（1 ジョブ・95 ファイル直列） | 12 分 24 秒（2026-11-28 実測） |
| 分割後（8 シャード並列） | 初回実行後に追記する |

シャードあたりの配分（2026-11-28 時点、95 ファイル）は 8〜14 ファイル・約 30 万バイトで、
サイズ合計の偏りは 2% 未満に収まっている。
