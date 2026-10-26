# AGENTS.md — 作業ガイド

このリポジトリはGoogle Apps Script(GAS)製の学習ツール群(塾向け)を管理する。

- **現行の正本は `site/` + `site-gas/` + `site-worker/`**。`apps/` は旧GAS版として `archive/apps-20260902/`（GitHub未追跡、Driveにもコピー）へ退避済みで、**現行 `apps/` は新URLへの単一リンク最小HTML（`target="_blank"`、GAS `sandbox` 対策）に置換済み。今後の機能改修は `site/` 側のみ**
- 詳細な仕様・権限・ガードの詳細は `仕様書_移行案.md` を正とする（`仕様書.md` はGAS版の凍結保存版。旧版の詳細が必要な場合は `archive/` を参照）

## プロジェクト構造

```
apps/      … 旧GAS版（最小リダイレクト・11本。新URL https://hori366191-ship-it.github.io/gakusyu-tools/ への単一リンクのみ、`target="_blank"`）
├── app1/   公式・暗記辞典   (scriptId: YOUR_SCRIPT_ID_app1)
├── app2/   英語長文 多読リーダー (scriptId: YOUR_SCRIPT_ID_app2)
├── app3/   正規分布シミュレーター (scriptId: YOUR_SCRIPT_ID_app3)
├── app4/   立体図形ビューア   (scriptId: YOUR_SCRIPT_ID_app4)
├── app5/   原子・周期表ツール (scriptId: YOUR_SCRIPT_ID_app5)
├── app6/   微分積分ビジュアライザー (scriptId: YOUR_SCRIPT_ID_app6)
├── app7/   月と星座シミュレーター (scriptId: YOUR_SCRIPT_ID_app7)
├── app8/   英文法ビジュアライザー (scriptId: YOUR_SCRIPT_ID_app8、デプロイ: AKfycbyuW_7Y4-VTF3zEudXis_ptWsa_YoQzl1Csu40pfWdl_0s5-w42pcM4LIMj6pz7-2ZcAQ)
├── app9/   原稿用紙作成 (scriptId: YOUR_SCRIPT_ID_app9、デプロイ: AKfycbxj4WNLi7qiQ9q1J1ynTDN1MiJ6IgVndQ0LHpOPFZObKSi88hIU6uOKMmCUUADQr2vs)
├── pdfdrop/ PDF受信アプリ (scriptId: YOUR_SCRIPT_ID_pdfdrop、デプロイ: AKfycbxP6klWI4L5wnTl2wTO5PmrDMf6z4Fmu3Qh3zFwfCf0KUa91idOINv6w8PxoY3Ke-oN、ポータル非掲載)
├── portal/ 学習ツール ポータル (scriptId: YOUR_SCRIPT_ID_portal)
└── その他/  実験・非公開アプリの開発場所
archive/ … 旧GAS退避（GitHub未追跡、Driveにもコピー） `archive/apps-20260902/` に11本の元コードを保存（`apps/` は上記最小HTMLに置換済み）
site/      … 新Pages版（正本・`hori366191-ship-it.github.io/gakusyu-tools/` で配信）
├── index.html, app1/, app2/, app3/..app9/, credits.html, debug-probe.html, favicon.svg
├── app1/bundle.json, app1/favicon.svg … app9/favicon.svg（各アプリ個別、SVGのみ）
├── credits.html … クレジット集約（フォント/ライブラリ/データ/Refero）
├── tokens/pop.css, themes/pop.css, themes/forest.css, themes/theme.js … テーマ機構（標準/ポップ/フォレスト切替、永続化はlocalStorage）
└── site-src/app1/content/*.md … 辞典の正本（`site/app1/bundle.json` の生成元）
site-gas/  … 新GAS2本（Pagesの不可視API）
├── site-pdfdrop/   (scriptId: YOUR_SCRIPT_ID_site-pdfdrop)
└── site-app2-backend/ (scriptId: YOUR_SCRIPT_ID_site-app2-backend)
site-worker/ … Cloudflare Workers プロキシ（site → GAS の中継・CORS付与）
├── worker.js, wrangler.toml
design-lab/ … デザイン実験工房（Pages非配信・`site` に影響を与えずに試作）
├── portal/, app1/..app9/ … `site/` の複製（Popテーマで常時表示）
├── tokens/pop.css … Refero抽出の生トークン（編集しない）
├── themes/pop.css … 塾適応版（ここだけを編集して試作）
├── font-lab.html … 和文フォント試着室（M PLUS 1 Code / BIZ UDGothic 等を比較）
└── favicon-pop.svg … 直角・左下影の試作アイコン（`site` 本流は標準faviconに統一）
```

- 各フォルダに個別の `.clasp.json` を持つ(scriptId + rootDir ".")。**ルート直下に `.clasp.json` を作らないこと**(claspのclone/createはCWDに書き出すため、作成後に各フォルダへ移動する)

### `その他/` フォルダについて

- ポータルサイトには載せず、GASにもプッシュしないアプリの開発場所
- コミットは行い、GitHubへもpushする(リポジトリ管理は通常どおり)
- clasp操作(`.clasp.json` 作成を含む)やポータルへのカード追加は不要。デプロイ・公開もしない
- 将来正式リリースする場合は `apps/appN/` へ移動し、scriptId発行・ポータル追加を行う

### `design-lab/` フォルダについて

- `site/` の本流デザインを一切変えずに試作するための隔離工房。Pages配信対象外（`.github/workflows/pages.yml` は `site/` のみを配信）
- `site/` を複製して `design-lab/portal/` / `design-lab/app1/` 等に配置し、`themes/pop.css` だけで見た目を上書きして検証。ローカルは `python -m http.server 8000` → `http://localhost:8000/design-lab/portal/` で確認
- 本流 `site/` のデフォルトは従来通り。テーマ切替が必要になった段階で `design-lab/themes/pop.css` → `site/themes/pop.css` へ移植し、`site/index.html` の切替UI（`localStorage` 永続化）で有効化する

### テーマ機構について

- 実装: `site/themes/theme.js`（`localStorage: gakusyu-theme` + `?theme=` パラメータ、同期的に `html[data-theme]` を立てる）+ `site/themes/pop.css`（`html[data-theme="pop"]` 時のみ上書き）+ `site/themes/forest.css` + `site/tokens/pop.css` `forest.css`（Refero抽出の生トークン）
- ポータル `site/index.html:382` の「標準 / ポップ / フォレスト」ボタンで切替。選択は `localStorage` に永続化され、次回も保持。`site/app*` は `head` で同じ `theme.js/css` を読み込むためポータルの選択が自動で引き継がれる（同一オリジンのため）
- faviconはPagesでは標準に統一（`site/favicon-pop.svg` は残置するが未参照）。`design-lab/` では直角・左下影の試作アイコンで確認
- **新規アプリ作成時の注意**: 既存テーマ（現状は `標準` / `ポップ` / `フォレスト`）すべての分のスタイルを作らなければいけないが、追加テーマ分の作成は最優先ではない。まずは標準テーマで動作させ、ポップ等の追加テーマは追って `design-lab` で試作→ `site/themes/*.css` へ移植する

## 作業コマンド

Windows PowerShell 5.1 環境。

- `clasp.cmd` を使う(`clasp.ps1` は実行ポリシーでブロックされるため **不可**)
- 操作は対象フォルダを workdir にして実行:

```powershell
clasp.cmd -A "<AUTH_FILE>" push -f                        # コードをアップロード(HEAD更新)
clasp.cmd -A "<AUTH_FILE>" version "release description"  # バージョン作成(immutable)
clasp.cmd -A "<AUTH_FILE>" deployments                    # デプロイ一覧確認
clasp.cmd -A "<AUTH_FILE>" login                          # 専用authの再認証(トークン失効時)
```

- **既存デプロイのバージョン更新（version作成→既存デプロイへの切替）の標準手順と参考コマンドは「デプロイ・公開のルール」を参照**（コンソールCLI/APIが標準。本節では重複記載しない）
- トークン失効(`invalid_rapt` エラー)時: 今回使う**専用auth（`<AUTH_FILE>`）だけ**をバックアップ → `clasp.cmd -A "<AUTH_FILE>" login` → ブラウザで認証。**共有の `~/.clasprc.json` は変更しない**（他セッション・他作業の認証に影響させない）
- **日本語を含む引数をコマンドラインで渡さない**こと(PowerShell 5.1で文字化けし、JSONが壊れる)。`version` の説明もASCII（例: `"release description"`）にする。APIに渡すJSONは必ずファイルに書いて `--data-binary "@path"` で渡す

## ⚠️ デプロイ・公開のルール（禁止事項と標準手順）

公開・デプロイ手順の**正本はこの節**。`仕様書_移行案.md` 側は本節を参照する（二重管理しない）。

### 標準手順: 既存デプロイのバージョン更新（コンソールCLI/API）

- **既存デプロイのバージョン更新は、コンソールのCLI/APIで行うのを標準とする**。ユーザーから更新・公開を依頼された作業はその範囲内で本手順により実施してよい。**通常更新のたびに特別な承認やUI操作をユーザーへ求めない**
- GASエディタUIでの更新も、CLI/APIが使えない障害時の代替として可（従来のUI手順はそのまま使える）
- 更新のたびに次を守る:
  1. **更新前backup**: remote HEAD更新前の状態を退避し、git HEADと一致・無関係な変更がないことを確認。あわせて `deploymentConfig`（`scriptId` / `versionNumber` / `manifestFileName` / `description` のみ）と、Deployment側の `entryPoints` 全体（`webApp.entryPointConfig` の `access` / `executeAs` と入口URLを含む）を取得して保存する
  2. **immutableなversion作成と切替の分離**: versionは各デプロイ1つだけ作り、内容と manifest / source hash の整合を確認してから切り替える
  3. **既存 `deploymentId` を固定**: 既存 `deploymentConfig` は `versionNumber` 以外（`scriptId` / `manifestFileName` / `description`）を保持したまま更新し、Deployment側の `entryPoints` 全体 / 入口URL / `access` / `executeAs` が前後で不変であることを確認する。**新規デプロイを誤って作らない**
  4. **専用認証のみ使用**: `-A` 相当の専用authを使い、他セッションが使う共有認証は変更しない（認証ファイルのパス・トークン・実メールは記載しない）
  5. **更新後の検証**: version / source hash / Deployment側の `entryPoints` 全体（深い比較）/ 入口URL / `access` / `executeAs` を確認する
  6. **公式GETの複数経路で一致確認**: list・`fields` 違い・`prettyPrint`・no-cache 等で最新 version と `updateTime` が一致することを確認する。**staleな旧snapshotは成功判定に使わない**
  7. **結果不明・不一致なら再PUTしない**（安全停止）。復旧が必要な場合のみUIで行う
- **参考コマンド（clasp 3.3系）**: `clasp.cmd -A "<AUTH_FILE>" version "release description"` → `clasp.cmd -A "<AUTH_FILE>" redeploy <DEPLOYMENT_ID> -V <VERSION_NUMBER>`
  - 2026-10-26に実証したのは**同じApps Script APIをコンソールのNode runnerから呼ぶ更新**であり、上記claspコマンド自体は実行検証していない（claspの動作を検証済みとは扱わない）。APIを直接叩く場合も、既存 `deploymentConfig` は `versionNumber` だけを差し替えて他項目を保持し、Deployment側の `entryPoints`（`webApp.entryPointConfig` の `access` / `executeAs` を含む）は変更しない
  - CLI/API一般の安全性や過去404の解消を断定しない
- **canaryによる実版切替テストは、通常更新の必須条件ではない**。次の場合に推奨する:
  - 更新方式・使用ツール・manifest が変わる場合
  - そのデプロイの初回運用時
  - 経路・権限など不明な条件が残る場合
  - canaryは**切替手順**の安全確認であり、`access` 変更自体をcanaryで許可する意味ではない（`access` 変更は下記のとおりUIの別作業）
- **契約変更を伴う更新**（認証・応答仕様の変更）は、`site-gas` 2本 → `site/`（Pages）→ 再ログイン/疎通確認 の順で行う

### 禁止事項

1. **新規デプロイ作成・アクセス設定変更はCLI/APIで行わない**（既存版のバージョン更新とは別作業）
   - 過去にclaspが作成・更新したデプロイが webAppエントリポイント(アクセス設定)を持たず、実行URLが **404** になった実測例がある（履歴。解消を断定しない）
   - アクセス設定自体は既存デプロイの版更新では書き換えられない。**GASエディタUIのみ**で設定できる
2. 公開URLの確認に `/dev` 形式を使わない(エディタ用)。`/exec` が公開用
3. **`site-worker/targets` のデプロイIDを旧GASに戻さない** — `site-worker/worker.js:13-16` の `AKfycbwj7q...` / `AKfycbxj8q...` は新GAS2本のID。旧 `AKfycbxP6...` / `AKfycbxvo...` に戻すと新 `site/` が全滅する
4. **認証フォールバック・旧公開面を再導入しない** — 未検証JWTや `aud`/`iss` 文字列一致だけの許可、`p.email` での認可、allowlist空の許可、旧HTML/旧RPC配信の復活は禁止（下記「セキュリティ不変条件」）
5. **セキュリティ修正に便乗した構造変更をしない** — 認証・公開面の修正は最小差分にとどめ、フォルダ構成・URL・全面リファクタを同時に変えない
6. **機密・個人情報を不用意に追記しない** — 実メールアドレスや生徒/保護者の情報などを docs・コード・ログに追加しない（既存の記載は履歴として維持）

## 🔐 セキュリティ不変条件（`site-gas` 2本）

`site-pdfdrop` / `site-app2-backend` の認証・公開面を変えるときは、以下を破らない。詳細は `仕様書_移行案.md` の 3.3〜3.5 / 8.3。

1. **検証**: `tokeninfo` 成功 + `aud`/`iss`/`exp`/`email_verified` を**すべて**満たす場合のみ許可。`iss` は `accounts.google.com` または `https://accounts.google.com` のみ。署名未検証JWTのデコードや `aud`/`iss` 一致だけのフォールバックは禁止。検証キャッシュのTTLは `exp` 以下
2. **認可**: `p.email` など未検証の値で probe の `allowed` を決めない。`ALLOWED_EMAILS` が空なら probe も `allowed:false`・書込みは全拒否（教室機能が閉じるため設定漏れ注意）
3. **公開面**: `doGet` / `doPost` 以外は末尾 `_` のprivate関数にする（`google.script.run` からの削除等の迂回を閉じる）。旧HTML/旧RPC配信は復活させない（probe/PDFの `HtmlService` 応答は可）
4. **状態・メッセージ**: 変更系は `request_id` で冪等化。PDF上限は保存前ロック予約（返却は保存呼出前など副作用ゼロ／未保存が確実な失敗のみ。保存呼出後の結果不明は枠と `in_flight` を維持し同IDの再保存を禁止）。AI匿名試行上限はAPI前に一括予約し以後の障害も消費。保存結果不明時はapp2も新AI生成を開始しない。台帳は初回永続化失敗で副作用を開始せず、TTL内receiptは満杯でも消さず容量超過を拒否、未知stateはfail-closed。moderationは明示OK以外保存しない。legacyは一回移行＋墓標。JSONP経路は `rid` と生成callback名を照合（`MessageEvent` なし）。postMessage経路（iframe POST/PDF）は `rid` + `parent_origin` を受け取り `rid` を返し、クライアントは `rid`/`event.origin`/`event.source` を検証、`parent_origin` は応答の宛先に使う
5. **期限切れ**: クライアントは `exp` 切れトークンを破棄して再ログインを要求する（`exp` 不問のUX回避は廃止）

## 検証方法（site を含む）

### オフラインテスト（`scripts/tests`）

- 認証・冪等性・上限・moderation・legacy の回帰は、`scripts/tests` 配下の Node 回帰テストでオフライン検証する（外部API・Drive・GAS実行を呼ばず、fake/スタブで検証）
- アプリ起動・操作確認と最終回帰テストは `test` サブエージェントが担当。coder は構文/静的確認に加え、実装した unit テストの自己確認まで可（既存の委譲ルールに従う）
- 本番GAS/Driveの実データを操作する確認は、別途ユーザーの合意を得てから行う（テストの一環として無断で実行しない）

### site-worker プロキシの検証

```powershell
# ローカル
npx wrangler dev --port 8787
curl.exe -i "http://localhost:8787/app2?probe=1&token=e6135dfd707ab9a6916635fa&callback=cb"
curl.exe -i -X OPTIONS "http://localhost:8787/app2?probe=1&token=..."
# 本番
curl.exe -i "https://gakusyu-tools-proxy.hori-shota.workers.dev/app2?probe=1&token=e6135dfd707ab9a6916635fa&callback=cb"
curl.exe -i "https://gakusyu-tools-proxy.hori-shota.workers.dev/pdfdrop?probe=1&token=e6135dfd707ab9a6916635fa&callback=cb"
# 期待: Access-Control-Allow-Origin: * と cb({...genkoProbe:true...})、X-Frame-Optionsなし
# id_token付き（ALLOWED_EMAILS）では cb({"genkoProbe":true,"ok":true,"allowed":true})、匿名は cb({"genkoProbe":true,"ok":false,"error":"noauth"})
```

### 匿名アクセスの確認(curl)

```powershell
curl.exe -s -L -o NUL -w "%{http_code} -> %{url_effective}`n" "https://script.google.com/macros/s/<デプロイID>/exec"
```

- 200 + 実行URLのまま → 正常(誰でもアクセス可)
- `accounts.google.com` へのリダイレクト → ログイン必須
- 404 → デプロイのエントリポイント消失(clasp操作の痕跡を疑う)

### ヘッドレス描画確認(puppeteer-core + Chrome)

- 検証用セットアップ: `C:\Users\hori3\AppData\Local\Temp\opencode\shot\`(puppeteer-coreインストール済み)
- `chrome.exe` パス: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- アプリの実HTMLはネストiframeの中にある。**`page.frames()` から `name === 'userHtmlFrame'` のフレームを探して `evaluate()` する**
- スクリーンショットのタイミング: 静的 `--screenshot` は白紙になりがち。`networkidle2` + 実時間待機(8〜15秒)が必要
- ピクセル解析: `System.Drawing.Bitmap` で領域平均RGB・色クラス・差分(アニメーション確認)を判定

### ログイン必須アプリ(app2など)の検証

- プロファイルのコピーは**アプリバインド暗号化(ABE)によりログインセッションが使えない**(実測済み)。Cookie自体はコピーされるが復号不能でサインイン画面になる
- Chrome起動中は実プロファイルを `userDataDir` に指定できない(ロックエラー)
- 対応: ユーザーにChromeを閉じてもらって実プロファイル + `--profile-directory=Default` で実行するか、ユーザーに手動確認を依頼する

### 確認すべきサイズ

- デスクトップ: 1280x900 / モバイル: 390x844(横はみ出し `scrollWidth - innerWidth > 0` をチェック)

## URLルール(多ログイン対策)

- Apps Script Webアプリは**複数Googleアカウント同時ログインでエラー**(`/u/N` がURLに付与され「現在、ファイルを開くことができません」)になる既知問題
- 回避策: **`/a/`形式URL**を使用する
  - Workspaceアカウント(hori-shota.com): `https://script.google.com/a/macros/hori-shota.com/s/<デプロイID>/exec`
  - Gmailアカウント: `https://script.google.com/a/*/macros/s/<デプロイID>/exec`(ワイルドカード形式。`/a/gmail.com/`は多ログインで不安定)
- `/a/`形式の取得: 平形式URLをブラウザで開くとアドレスバーが`/a/`形式にリダイレクトされるのでそれをコピー(または手動組み立て)
- ポータル(index.html)内のリンクは全て`/a/`形式 + `target="_blank"` にすること

## 既知の問題・制限

| 問題 | 内容 | 対応 |
|---|---|---|
| 多ログインエラー | 複数アカウントログイン中は`/u/N`が付与されWebアプリが開けない | `/a/`形式URLで共有 |
| Google Sites埋め込み不可 | URLタブ埋め込みはDrive URLに変換され、埋め込みコードはサンドボックスでApps Scriptが動作しない | Sites不使用。ポータル(リンク方式)に集約 |
| X-Frame-Options | HtmlOutputは**デフォルトSAMEORIGIN**。iframe埋め込みに失敗する | `doGet()`で `setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` を明示 |
| デプロイのアクセス設定 | clasp/APIからは設定・変更不可 | エディタUIで実施 |
| PowerShell文字化け | PS5.1は日本語を含むネイティブ引数が壊れる | JSONはファイル経由で渡す |
| ヘッドレス描画タイミング | 静的`--screenshot`はApps Scriptの描画を待てず白紙 | puppeteer + 実時間待機 |

## 運用メモ

- ポータルのカード追加: `site/index.html` の該当教科セクション(ツール/英語/数学/理科)の `.cards` 内にカード1ブロックを追加(リンクはPages相対 `./appN/` + `target="_blank"`)。カードには教科色クラス(`subj--tool/eng/math/sci`)と学年タグ(`<span class="card__grade">`)を付与。新セクション追加時は `.sec--*`/`.subj--*` の色定義も追加すること（旧 `apps/portal` は最小リダイレクト済みのため追加不要）
- 変更後は必ずヘッドレス検証 → `clasp push`（`site-gas` のみ）→ 既存デプロイの版更新（**コンソールCLI/APIが標準**。上記「デプロイ・公開のルール」の標準手順を守る。UIは障害時の代替）。`apps/` は最小リダイレクトのため通常は `site/` のみ
- **セキュリティ修正の記録**: コード修正・ローカル検証、GAS HEADへの `clasp push`、公開デプロイ更新（コンソールCLI/API、または障害時のUI）を区別して記録する。公開確認（metadata・実疎通）まで「本番反映済」と書かない（`仕様書_移行案.md` 8.3 に日付と範囲を追記）
- 詳細な権限・ガード・トークン運用・トラブルシュートは `仕様書_移行案.md` を参照（旧GAS版の詳細は `仕様書.md` を参照）
- Gmailアカウント(別途管理)の別アプリが存在するが、このリポジトリでは管理対象外(共有URLは`/a/*/`形式を使用)

### gitバックアップ(Drive同期)

- コミット時フック(`scripts/hooks/post-commit`、`core.hooksPath=scripts/hooks`)とTask Scheduler(毎日18時 `GitBackupGakusyuTool`、`StartWhenAvailable`有効=PC電源OFFで見逃した場合は次回ログオン時に即実行)で、`E:\hori-shotaDrive\開発\学習ツール` に `backup-YYYYMMDD-HHmm.bundle` を自動作成(最新30個保持)
- 手動実行: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1`
- 復元: `git clone "E:\hori-shotaDrive\開発\学習ツール\backup-<最新>.bundle" <復元先>`
- 注意: bundleはコミット済み履歴のみ。未コミット変更(例: `site-src/app1/content/*.md` の未コミット編集)は含まれない
