# AGENTS.md — 作業ガイド

このリポジトリはGoogle Apps Script(GAS)製の学習ツール群(塾向け)を管理する。

- **現行の正本は `site/` + `site-gas/` + `site-worker/`**。`apps/` は旧GAS版として永久残置するが、**今後の機能改修は `site/` 側のみを更新し `apps/` には手を加えない**
- 詳細な仕様・権限・ガードの詳細は `仕様書_移行案.md` を正とする（`仕様書.md` はGAS版の凍結保存版。旧版の詳細が必要な場合はそちらを参照）

## プロジェクト構造

```
apps/      … 旧GAS版（永久残置・11本・現行運用中）
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
site/      … 新Pages版（正本・`hori366191-ship-it.github.io/gakusyu-tools/` で配信）
├── index.html, app1/, app2/, app3/..app9/, debug-probe.html, favicon.svg
├── app1/bundle.json, app1/favicon.svg … app9/favicon.svg（各アプリ個別、SVGのみ）
├── tokens/pop.css, themes/pop.css, themes/theme.js … テーマ機構（標準/ポップ切替、永続化はlocalStorage）
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

- 実装: `site/themes/theme.js`（`localStorage: gakusyu-theme` + `?theme=` パラメータ、同期的に `html[data-theme]` を立てる）+ `site/themes/pop.css`（`html[data-theme="pop"]` 時のみ上書き）+ `site/tokens/pop.css`（Refero抽出の生トークン）
- ポータル `site/index.html:382` の「標準 / ポップ」ボタンで切替。選択は `localStorage` に永続化され、次回も保持。`site/app*` は `head` で同じ `theme.js/css` を読み込むためポータルの選択が自動で引き継がれる（同一オリジンのため）
- faviconはPagesでは標準に統一（`site/favicon-pop.svg` は残置するが未参照）。`design-lab/` では直角・左下影の試作アイコンで確認
- **新規アプリ作成時の注意**: 既存テーマ（現状は `標準` / `ポップ`）すべての分のスタイルを作らなければいけないが、追加テーマ分の作成は最優先ではない。まずは標準テーマで動作させ、ポップ等の追加テーマは追って `design-lab` で試作→ `site/themes/*.css` へ移植する

## 作業コマンド

Windows PowerShell 5.1 環境。

- `clasp.cmd` を使う(`clasp.ps1` は実行ポリシーでブロックされるため **不可**)
- 操作は対象フォルダを workdir にして実行:

```powershell
clasp.cmd push -f          # コードをアップロード(HEAD更新)
clasp.cmd version "説明"    # バージョン作成
clasp.cmd deployments      # デプロイ一覧確認
clasp.cmd login            # 再認証(トークン失効時)
```

- トークン失効(`invalid_rapt` エラー)時: `~/.clasprc.json` をリネーム退避 → `clasp.cmd login` → ブラウザで認証
- **日本語を含む引数をコマンドラインで渡さない**こと(PowerShell 5.1で文字化けし、JSONが壊れる)。APIに渡すJSONは必ずファイルに書いて `--data-binary "@path"` で渡す

## ⚠️ 絶対にやらないこと

1. **`clasp deploy` / `clasp redeploy` は禁止**
   - claspが作成・更新するデプロイは webAppエントリポイント(アクセス設定)を持たず、実行URLが **404** になる(実測済み)
   - アクセス設定の変更はApps Script APIからも不可。**GASエディタUIのみ**で設定できる
2. **デプロイの更新はUIで行う** — コード変更後は `clasp push` までを実施し、ユーザーに以下を依頼する:
   ```
   GASエディタ → デプロイ → デプロイを管理 → 編集(鉛筆) → バージョン「新しいバージョン」→ デプロイ
   ```
   (デプロイURLは不変。UI更新後の検証結果をユーザーに確認してもらう)
3. 公開URLの確認に `/dev` 形式を使わない(エディタ用)。`/exec` が公開用
4. **`site-worker/targets` のデプロイIDを旧GASに戻さない** — `site-worker/worker.js:13-16` の `AKfycbwj7q...` / `AKfycbxj8q...` は新GAS2本のID。旧 `AKfycbxP6...` / `AKfycbxvo...` に戻すと新 `site/` が全滅する

## 検証方法（site を含む）

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

- ポータルのカード追加: `apps/portal/index.html` の該当教科セクション(ツール/英語/数学/理科)の `.cards` 内にカード1ブロックを追加(リンクは`/a/`形式)。カードには教科色クラス(`subj--tool/eng/math/sci`)と学年タグ(`<span class="card__grade">`)を付与。新セクション追加時は `.sec--*`/`.subj--*` の色定義も追加すること
- 変更後は必ずヘッドレス検証 → `clasp push` → ユーザーにUIでのデプロイ更新を依頼
- 詳細な権限・ガード・トークン運用・トラブルシュートは `仕様書_移行案.md` を参照（旧GAS版の詳細は `仕様書.md` を参照）
- Gmailアカウント(別途管理)の別アプリが存在するが、このリポジトリでは管理対象外(共有URLは`/a/*/`形式を使用)

### gitバックアップ(Drive同期)

- コミット時フック(`scripts/hooks/post-commit`、`core.hooksPath=scripts/hooks`)とTask Scheduler(毎日18時 `GitBackupGakusyuTool`、`StartWhenAvailable`有効=PC電源OFFで見逃した場合は次回ログオン時に即実行)で、`E:\hori-shotaDrive\開発\学習ツール` に `backup-YYYYMMDD-HHmm.bundle` を自動作成(最新30個保持)
- 手動実行: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1`
- 復元: `git clone "E:\hori-shotaDrive\開発\学習ツール\backup-<最新>.bundle" <復元先>`
- 注意: bundleはコミット済み履歴のみ。未コミット変更(例: `site-src/app1/content/*.md` の未コミット編集)は含まれない
