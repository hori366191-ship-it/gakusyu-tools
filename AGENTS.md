# AGENTS.md — 作業ガイド

このリポジトリはGoogle Apps Script(GAS)製の学習ツール群(塾向け)を管理する。

- 詳細な仕様は `仕様書.md` を参照

## プロジェクト構造

```
apps/
├── app1/   公式ビューア      (scriptId: YOUR_SCRIPT_ID_app1)
├── app2/   英語長文 多読リーダー (scriptId: YOUR_SCRIPT_ID_app2)
├── app3/   正規分布シミュレーター (scriptId: YOUR_SCRIPT_ID_app3)
├── app4/   立体図形ビューア   (scriptId: YOUR_SCRIPT_ID_app4)
├── app5/   原子・周期表ツール (scriptId: YOUR_SCRIPT_ID_app5)
├── app6/   微分積分ビジュアライザー (scriptId: YOUR_SCRIPT_ID_app6)
├── app7/   月の満ち欠けシミュレーター (scriptId: REPLACE_WITH_SCRIPT_ID)
└── portal/ 学習ツール ポータル (scriptId: YOUR_SCRIPT_ID_portal)
```

- 各フォルダに個別の `.clasp.json` を持つ(scriptId + rootDir ".")。**ルート直下に `.clasp.json` を作らないこと**(claspのclone/createはCWDに書き出すため、作成後に各フォルダへ移動する)

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

## 検証方法

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

- ポータルのカード追加: `apps/portal/index.html` の `.cards` 内にカード1ブロックを追加(リンクは`/a/`形式)
- 多読リーダー(app2)の権限(2026-08-16 変更): 閲覧=Googleアカウント全員 / AI生成=Script Properties `ALLOWED_EMAILS` / 削除=`OWNER_EMAIL`。デプロイのアクセス設定(「Googleアカウントでログイン」)とDrive共有(生成物フォルダ=全員閲覧+許可ユーザー編集、辞書2ファイル=全員閲覧)はUI/Driveで手動管理。変更時に `doGet()` の IS_ALLOWED/IS_OWNER 注入とサーバー側ガード(`generateText`/`deleteText`)を両方更新すること
- 変更後は必ずヘッドレス検証 → `clasp push` → ユーザーにUIでのデプロイ更新を依頼
- Gmailアカウント(REDACTED_EMAIL)の別アプリが存在するが、このリポジトリでは管理対象外(共有URLは`/a/*/`形式を使用)

### gitバックアップ(Drive同期)

- コミット時フック(`scripts/hooks/post-commit`、`core.hooksPath=scripts/hooks`)とTask Scheduler(毎日18時 `GitBackupGakusyuTool`、`StartWhenAvailable`有効=PC電源OFFで見逃した場合は次回ログオン時に即実行)で、`E:\hori-shotaDrive\開発\学習ツール` に `backup-YYYYMMDD-HHmm.bundle` を自動作成(最新30個保持)
- 手動実行: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1`
- 復元: `git clone "E:\hori-shotaDrive\開発\学習ツール\backup-<最新>.bundle" <復元先>`
- 注意: bundleはコミット済み履歴のみ。未コミット変更(例: `ロードマップ.md`)は含まれない
