# 教室セッション（長期ログイン）設計・運用手順書

状態: **実装済み・未デプロイ**（ローカル実装とテストまで。本番設定・本番デプロイは未実施）。
本書は文書のみで、コード・構成・デプロイは変更しない。

対象（`site-worker/`）:

| ファイル | 役割 |
| --- | --- |
| `classroom-worker.mjs` | 同一オリジン Worker のエントリ。配信・認証・後段中継・日次 purge |
| `classroom-gateway.mjs` | HTML/asset 配信、`/_classroom/probe\|print\|generate\|translate` の GAS 中継 |
| `classroom-login.mjs` | Google OIDC（PKCE）/ Cookie / refresh token 暗号化保存 |
| `classroom-sessions.mjs` | D1 セッション寿命・延長・失効・purge の実装（正） |
| `session-migrations/0001_classroom_sessions.sql` | `classroom_sessions` |
| `session-migrations/0002_classroom_oauth.sql` | `classroom_oauth_states` / `classroom_oauth_credentials` |
| `wrangler.classroom.toml.example` | 設定の見本（実ファイルは git に追加しない） |

関連: `AGENTS.md`（デプロイ・公開のルール、セキュリティ不変条件）、`site-worker/README.md`（既存 legacy プロキシ）。

---

## 1. 目的

教室の常連利用者（30日以上継続して使う生徒・教師）が、毎回 Google ログインをやり直さずに
印刷・教材生成を使えるようにする。あわせて次を守る。

- アイドル 30 日の **sliding** 延長。延長は「確認された対象操作の成功」だけで行う。
- 初回作成から **最大 90 日**の絶対上限（延長で超えない）。
- 管理者による失効（subject 単位）と、本人によるログアウト／削除（次回ログインで新しいセッション）。
- 既存の GitHub Pages 配信・既存 legacy Worker・既存 GAS の入口 URL を**一切変えない**。

## 2. スコープと不変条件

| 区分 | 内容 |
| --- | --- |
| 維持 | `site/`（GitHub Pages）の現行 URL、`site-worker/worker.js`（legacy プロキシ）の**コードと運用**、GAS の既存デプロイと `webApp.entryPointConfig` |
| 維持 | 匿名で見られる教材（中学歴史年表など）と**生徒用 QR の導線**は従来の公開 Pages のまま |
| 追加 | 長期利用者専用の**別 HTTPS origin**（例: `classroom.<zone>`）。そこだけがログイン必須 |
| 追加 | 同一オリジン Worker が、公開教材 Pages を**固定 upstream** として配信。HTML は後述の限定 allowlist のみ |
| 追加 | `site/` に、Worker が注入する**マーカーの有無で新 UI を切り替える**コードが増える（URL は不変） |
| 禁止 | 既存 Pages / legacy Worker のコード・ルート・`WORKER_BASE` の書換え |
| 禁止 | 既存デプロイのアクセス設定変更を CLI/API で行うこと（UI のみ）、新規デプロイの自動作成 |
| 禁止 | 本書・コード・ログ・シェル履歴・git への実 secret / 実ユーザー情報 / 実設定ファイルの記載 |

別 origin にする理由: Cookie のスコープを教室オリジンに閉じ込め、既存 Pages / legacy Worker の
挙動と衝突させない。既存入口は書き換えないため、ロールバックは「新 Worker を外す」だけで完結する。

## 3. 構成

```
[長期利用者] --HTTPS--> classroom-worker.mjs (classroom.<zone>, 同一オリジン)
                          |-- /                 -> portal（HTML allowlist）
                          |-- /app2, /app9, /app12 -> 上記3アプリの HTML のみ新オリジンで配信
                          |-- /<asset>          -> 静的 asset（拡張子 allowlist。HTML は上記のみ）
                          |-- /_classroom/login|callback|logout -> classroom-login.mjs
                          |-- /_classroom/probe|print|generate|translate -> GAS へ中継
                          '-- D1 CLASSROOM_DB -- session-migrations/  + Cron（UTC 日次 purge）
[既存] GitHub Pages (site/) / legacy Worker (gakusyu-tools-proxy) / GAS 2本 -- 変更なし
[その他教材・生徒用QR] -> 従来どおり公開 Pages（教室オリジンでは配信しない）
```

- upstream は**定数**で固定（`https://hori366191-ship-it.github.io/gakusyu-tools/`）。任意 URL の
  プロキシにしない（SSRF / オープンプロキシ化の禁止）。GET/HEAD のみ、パスは allowlist。
- **HTML 配信はポータル / `app2` / `app9` / `app12` のみ**（`/`, `/index.html`, `/app2(/index.html)`,
  `/app9(/index.html)`, `/app12(/index.html)`）。それ以外の HTML は教室オリジンでは配信せず、
  公開 Pages へ 302 で戻す（Cookie は付けない）。これで「新 UI を出す範囲」を 4 画面に限定できる。
- 配信 HTML には `<meta name="gakusyu-classroom-session" content="1">` を注入する。`site/` 側は
  このマーカーの有無だけで新 UI を切り替える（**URL も legacy Worker も変更しない**）。
  マーカーが無い従来 Pages では従来 UI のまま。
- upstream は公開静的コンテンツなので、**教室 Cookie を upstream へ転送しない**。upstream の
  `Set-Cookie` も返さない。認証系レスポンスは no-store。
- 相対リンクは教室オリジン上で解決される。絶対リンク（`github.io` / GAS）は既存先を指す。
  この非対称は仕様として許容し、移行時にリンク棚卸しで確認する。

## 4. 認証

- Google OIDC **Authorization Code + PKCE(S256)**。`state` / `nonce` / 暗号化した `code_verifier` /
  `return_to` は D1 の `classroom_oauth_states` に 10 分で保存し、callback で一度だけ消費（`consumed_at`）。
  クライアント側の `state` は `__Host-classroom_oauth` Cookie（HttpOnly, 10 分）と照合する。
- スコープは `openid email`。`email_verified` が真のときだけ許可。ID token は Google `tokeninfo` で
  検証し、`iss` / `aud` / `exp` / `email_verified` を**すべて**満たす場合のみ通す。
- `/_classroom/login` は POST 同一オリジンのみ。戻り先 `return_to` は完全一致の許可リスト
  （`/`, `/app2/`, `/app9/`, `/app12/`）以外を `/` に落とす。
- 既存 GIS（Google Identity Services）の OAuth Client ID と**同じ `aud`** を使う。
  - redirect_uri は `https://<classroom-origin>/_classroom/callback` を**完全一致**で登録。
  - GIS を教室オリジンでも使う場合のみ、そのオリジンを「承認済み JavaScript 生成元」に追加する
    （追加は Google Cloud Console の UI。追加しない構成なら不要）。
- 認可コード交換・refresh token の利用は**サーバのみ**。ブラウザへ access/refresh token を渡さない。
- refresh token は `classroom_oauth_credentials` に AES-256-GCM で暗号化保存（AAD に subject、
  鍵は `CLASSROOM_ENCRYPTION_KEY` = 32 byte の base64url）。鍵バージョンをレコードに持たせ、
  ローテーション手順を別途用意する。
- **OAuth consent screen の testing（7日）について**: Google の仕様では testing 状態の refresh token は
  7 日で失効するが、公式ドキュメントは basic identity スコープ（`openid email` 等）のみ例外と明記して
  いる。したがって「本番公開（publish）が必須」と断定しない。ただし例外の適用可否・外部利用の可否は
  **実機で点検**する（7 日超の継続利用、失効時の再ログイン導線）。判定できない場合は本番公開申請を
  検討する。

### ログアウトと Google 側 grant の扱い

- **通常のログアウトは、この D1 の当該行の削除だけ**（`classroom_oauth_credentials` を
  `handle_hash` で削除し、セッションを失効させ Cookie を消す）。Google 側の grant 取消は呼ばない。
- 理由: Google の revoke は**そのユーザーの全端末・全セッションに影響**し得る。教室タブレットの
  1 台をログアウトしただけで他端末まで切る事故を避ける。
- **端末紛失・漏洩疑い・アカウント侵害疑いのときだけ**、別途「Google アカウントの
  サードパーティ製アプリのアクセス管理から取消」を案内する（管理側の運用手順として明記）。

### Cookie

| 属性 | 値 | 備考 |
| --- | --- | --- |
| 名前 | `__Host-classroom_session` | `__Host-` は Domain 不可・Path=/・Secure 必須 |
| 値 | 32 byte 乱数の hex（= セッションハンドル） | JWT ではない。DB には SHA-256 のみ保存 |
| HttpOnly / Secure | 必須 | JS から読めない |
| SameSite | `Lax` | トップレベル遷移の callback と両立。POST は同一オリジン検証 |
| Path / Domain | `/` / 指定なし | 教室オリジンに閉じる |
| Max-Age | 90 日固定 | **寿命判定は DB が権威**（30 日 idle / 90 日 cap）。Cookie の残存だけで有効とみなさない |

## 5. セッション寿命のルール

`classroom-sessions.mjs` の実装（正）に従う。

- 生成: 検証済み subject に対してのみ。`idle_expires_at = min(now+30d, absolute_expires_at)`、
  `absolute_expires_at = created_at + 90d`。
- 延長: 操作 `classroom-print` / `generate-text` のうち、**信頼された業務結果**が
  `{ ok: true }` かつ `replayed !== true` かつ `recovered !== true` のときだけ。
  SQL は `idle = MIN(absolute, MAX(idle, now + idle_ttl))` の原子更新。subject 一致も条件。
- 延長しないもの: probe / 画面表示 / 読み取り / 失敗 / replay / recovered / 対象外操作 /
  期限切れ・失効済み。
- 読み取りは D1 `first-primary`（read-your-writes）。失効直後の復活をレプリカ遅延で許さない。
- DB 障害は **fail closed**。呼び出し側は拒否に倒し、Cookie を延長・再発行しない。
- 本人ログアウト: credentials 行を削除し、セッション行を失効（tombstone）して Cookie を消す。
- 本人による削除: 当該ハンドルのセッション行を **`DELETE`**（credentials は CASCADE で同時削除）。
  **subject 単位の失効はしない**ので、次回ログインで新しいセッション（created_at リセット）になる。
- 管理者失効: subject 単位（第 8 章）。

## 6. 環境変数・secret

値は一切記載しない。実値は Cloudflare の secret として投入する。

| 種別 | 名前 | 内容 |
| --- | --- | --- |
| 平文 var | `CLASSROOM_ORIGIN` | 教室オリジン（`https://host` のみ。パス・末尾スラッシュ・ポート無し） |
| 平文 var（任意） | `CLASSROOM_CONTEXT_PEPPER` | context（非認証識別子）のハッシュに混ぜる固定文字列 |
| secret | `CLASSROOM_GOOGLE_CLIENT_ID` | 既存 GIS と同一 aud のクライアント ID |
| secret | `CLASSROOM_GOOGLE_CLIENT_SECRET` | 同上シークレット |
| secret | `CLASSROOM_ENCRYPTION_KEY` | 32 byte の base64url。AES-256-GCM 用 |
| secret | `CLASSROOM_APP2_TOKEN` | 既存 GAS app2 と同一値（実値は投入時のみ） |
| secret | `CLASSROOM_PDFDROP_TOKEN` | 既存 GAS pdfdrop と同一値 |
| binding | `CLASSROOM_DB` | D1。`migrations_dir = "session-migrations"` |

投入は `npx wrangler secret put <NAME> --config wrangler.classroom.toml`（標準入力）。`--var`・
コマンドライン引数・`wrangler.*.toml` への直書き・`echo <値> | ...`（履歴やプロセス一覧に残る）は避ける。

**必ず `--config wrangler.classroom.toml` を付け、新専用 Worker だけを対象にする**
（`--config` を省くと既存 `wrangler.toml` = `gakusyu-tools-proxy` 側に secret が入る）。

**実設定ファイルは git に追加しない**: `wrangler.classroom.toml.example` をコピーして作る
`wrangler.classroom.toml`（`.dev.vars` 等も）はコミットしない。追跡されていないことを確認する。

## 7. D1 スキーマ

`0001` + `0002` の 2 本で構成（適用は `migrations_dir = "session-migrations"`）。

- `classroom_sessions`: `handle_hash`(PK, SHA-256 hex), `subject`, `created_at`,
  `idle_ttl_seconds`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`。
  `subject` 索引、期限索引あり。時刻はすべて epoch 秒。
- `classroom_oauth_states`: `state_hash`(PK) / `nonce_hash` / 暗号化した `verifier_*` / `return_to` /
  `expires_at` / `consumed_at`。10 分で失効、一度だけ消費。
- `classroom_oauth_credentials`: `handle_hash`(PK) → `classroom_sessions` に
  `ON DELETE CASCADE`。暗号化した id_token / refresh token（cipher/iv/tag）、`subject`、
  `scope`、期限、`revoked_at`。平文トークン・`email` は保存しない（同一性は subject のみ）。
- 追加 migration は `0003_*.sql` として足し、既存ファイルは書き換えない。

## 8. 失効・Purge の運用手順

前提: 対象 subject（Google の検証済み `sub`）は**別経路**で特定する（メール照会・本人申告・
既存の管理者手順など）。本書・シェル履歴・リポジトリ・チャットに実値を残さない。

1. 対象 subject を別経路で特定し、**値を表示しない**形で一時ファイルに書く（エディタから保存。
   `echo` / コマンドライン直書きは履歴に残るため禁止）。
2. 失効を適用する。**主方式は行削除**:
   `DELETE FROM classroom_sessions WHERE subject = ?`（`classroom_oauth_credentials` は CASCADE で
   同時削除）。行が無ければ同じハンドルは復活しない（Cookie が残っても `read` が null）。
   監査上「失効の事実」を残したい場合のみ tombstone（`revoked_at = unixepoch()`）とし、
   日次 purge で物理削除する。
3. 第一候補の実行場所は Cloudflare ダッシュボードの D1 クエリ画面（パラメータ入力。履歴に残らない）。
   CLI を使う場合は `--file` 経由にとどめ、値をコマンドラインへ埋め込まない。
4. 件数を確認（0 件なら対象特定をやり直す。勝手に別条件へ広げない）。
5. 一時ファイルを削除。記録には「日時・件数・対象の特定経路」のみを残す。
6. purge: Cron Trigger（`0 18 * * *` UTC = 日次）で `purgeExpired()` を実行。期限切れ・失効済みの
   セッション行を物理削除し、credentials も CASCADE で消える。OAuth state の期限切れ掃除は
   ログイン開始時に行う。失敗時は次回に持ち越し（fail closed）。

## 9. ローカル確認と本番設定・デプロイの区別

**「動作確認済み」と言えるのは Node テストと Chromium 確認まで**。`wrangler dev` も remote も
Cloudflare への設定・デプロイも未実施。

| 段階 | 内容 | 状態 |
| --- | --- | --- |
| L1 検証 | Node テスト（in-memory SQLite / D1 スタブ + 擬似 fetch で Google・GAS をモック）と `scripts/tests` | 実施済み（ローカル） |
| L2 検証 | Chromium（ヘッドレス）でマーカー有無の UI 切替・印刷導線を確認 | 実施済み（ローカル） |
| L3 検証 | `wrangler dev --config wrangler.classroom.toml` / D1 remote | **未実施** |
| P1 本番設定 | D1 作成・`migrations apply`（remote）・secret 投入・`routes` 設定 | **未実施** |
| P2 GAS | app2 の `classroom_guard` / `require_allowed` 最小変更を既存デプロイ版更新で反映 | **未実施（手順4。Worker 公開前）** |
| P3 Pages | マーカー切替コードの配信（URL 不変。マーカー無しは従来 UI） | コード実装済み・配信は手順5 |
| P4 Worker | 新 Worker の限定公開（既存 legacy Worker とは別デプロイ） | **未実施（手順6）** |

本番手順:

1. `wrangler.classroom.toml.example` を `wrangler.classroom.toml` にコピー（**git 追加しない**）。
   `CLASSROOM_ORIGIN` を実オリジンへ。以下の wrangler 操作は**すべて `--config wrangler.classroom.toml`
   を付ける**（付け忘れると既存 `gakusyu-tools-proxy` 側を触る）。
   `npx wrangler d1 create <db> --config wrangler.classroom.toml` → `database_id` を記入。
2. `npx wrangler d1 migrations apply CLASSROOM_DB --config wrangler.classroom.toml`
   （まず `--local` → remote）。`migrations list --config ...` で 0001/0002 を確認。
3. secret を投入（第 6 章。`--config wrangler.classroom.toml` 必須）。
   `wrangler secret list --config wrangler.classroom.toml` で**名前だけ**確認。
4. 先に GAS app2 の `classroom_guard` / `require_allowed` 最小変更を反映する（**この順が必須**。
   未反映だと preview で生成・印刷が拒否される）。
   - `AGENTS.md` の標準手順: 事前 backup → immutable version 作成 → 既存 `deploymentConfig` の
     `versionNumber` のみ差替 → `entryPoints`/`access`/`executeAs` 不変確認 → 複数経路 GET で一致確認。
   - 新規デプロイ作成・アクセス設定変更は **UI のみ**。不明・不一致なら再 PUT しない（安全停止）。
   - `site-pdfdrop` は**今回はコード変更なし**（トークンは secret として同一値を保つだけ）。
5. Pages のマーカー切替コードを配信する（既存 URL・legacy Worker は不変。マーカー無しは従来 UI）。
6. 新 Worker をプレビュー用ホストで限定公開する。**OAuth クライアント（redirect_uri / consent）、
   GAS guard、テストアカウントの承認が済んでから**。テストアカウント 1 件で login → callback →
   印刷/生成 → 延長 → logout → 再ログインを確認。失敗系（state 不一致、redirect_uri 不一致、
   `email_verified` 偽、DB 停止、replay/recovered で延長されない）も確認。
7. 長期利用者にだけ教室オリジンを案内する。既存 Pages / legacy Worker / GAS の入口 URL は
   書き換えない（ブックマーク・QR・ポータルの既存リンクはそのまま動く）。

## 10. ロールバック

- 新 Worker のルート（教室ホスト）を外す、または Worker を unpublish する。既存 Pages /
  legacy Worker / GAS（app2 の guard 含む）は**そのままで動く**。新規デプロイを消すだけで復帰。
- Cookie は教室オリジンに閉じているため、既存オリジンへ残存・干渉しない。
- D1 は保持（再公開時に再利用）。全員を切る必要がある場合のみ第 8 章の手順を使い、DB を消さない。
- GAS app2 の guard 変更が原因の不具合は、既存デプロイの版を戻すのではなく、AGENTS の手順で
  版更新をやり直す（`access` 設定には触れない）。

## 11. ログ・秘匿

- Cloudflare の Worker / security ログに credential を出さない。Authorization ヘッダ、
  `Set-Cookie`、code / token / subject / メールアドレスをログに残さない。
- アプリ側のログは「イベント種別・結果・エラーコード」まで（purge は件数のみ）。
  subject は必要時のみ短縮ハッシュ。
- エラー応答は固定文言（`503` 等）。OIDC のエラー詳細を UI にそのまま出さない。
- `wrangler tail` を常用しない。調査時も出力を保存・共有しない。

## 12. 公開前セキュリティ・チェックリスト

- [ ] Cookie が `__Host-` / HttpOnly / Secure / SameSite=Lax / Path=/、JS から不可視。寿命判定は DB 権威
- [ ] state / nonce / PKCE 検証、`email_verified` 必須、`return_to` 許可リスト
- [ ] 教室オリジンに CORS ワイルドカードなし。POST（login/logout）は同一オリジン検証
- [ ] upstream 固定・HTML allowlist（portal/app2/app9/app12）・GET/HEAD のみ・Cookie 非転送・`Set-Cookie` 除去
- [ ] 認証系レスポンスは no-store。HTML に secret / token を埋め込まない
- [ ] D1 障害時 fail closed。延長は成功結果のみ（replay/recovered 除外）
- [ ] 90 日 cap が SQL で担保されている（`MIN(absolute, ...)`）
- [ ] 失効後 Cookie で `/` 配信は見られるが、印刷・生成は拒否される（匿名扱いに落ちる）
- [ ] 通常ログアウトが Google 側 revoke を呼ばない（他端末を巻き込まない）
- [ ] secret / `wrangler.classroom.toml` / `.dev.vars` が git・ログ・履歴に無い。secret は専用 Worker のみ（`--config` 忘れで既存 Worker に入れていない）
- [ ] レート制限（`/_classroom/login` と callback）で乱用を抑止
- [ ] 既存 `worker.js` / `TARGETS` / `wrangler.toml` の diff がゼロ

## 13. 匿名閲覧が変わらないことの検証

公開判断の前に、**教室オリジンではない既存経路**で確認する（Cookie を持たない状態）。

1. 匿名 GET: `https://hori366191-ship-it.github.io/gakusyu-tools/`、`/app12/`（中学歴史年表の
   印刷プレビュー）、主要 `appN` 数点が 200 で、ログインへリダイレクトされないこと。
2. 応答に `Set-Cookie` が無いこと。教室オリジンの Cookie が既存オリジンへ送られないこと
   （DevTools の Application → Cookies でオリジン別に確認）。
3. 既存 legacy Worker の疎通（`/app2?probe=1&token=…` 相当。トークンは secret として扱い、
   コマンド履歴に残さない）が従来どおり CORS 付きで返ること。
4. 公開前後で主要ページの内容ハッシュ（または見出し・文字数）を比較し、差分が無いこと。
5. HTML allowlist 外の教材と生徒用 QR が、従来の公開 Pages で従来どおり開けること。
6. 教室オリジン側でも、未ログインで `/` と allowlist 内の 4 画面が**閲覧できる**こと
   （印刷・生成だけがログイン必須）。この境界は仕様として明記する。

## 14. 未確定・確認待ち

- OAuth consent screen の testing 例外（basic identity のみ）が実運用で成立するか。
  **実機で 7 日超の継続利用と失効時導線を点検**し、必要なら本番公開を検討。
- 教室ホスト名（`classroom.<zone>`）と Cloudflare ゾーン設定、`routes` の確定。
- 90 日 cap 到達時の UX（再ログイン案内の文言・導線）。
- 既存 Pages 内の絶対リンクの扱い（許容 or 将来的な相対化）。
- `site/` のマーカー連動 UI は実装済み（`site/shared/classroom-session.js` ほか）。マーカーが無い
  従来 Pages では従来 UI のままで、URL・legacy Worker は不変。

## 15. 参考

- `site-worker/classroom-worker.mjs` — エントリ・日次 purge
- `site-worker/classroom-gateway.mjs` — HTML allowlist・マーカー注入・GAS 中継
- `site-worker/classroom-login.mjs` — OIDC（PKCE）/ Cookie / refresh token 暗号化
- `site-worker/classroom-sessions.mjs` — 寿命・延長・失効・purge（正）
- `site-worker/wrangler.classroom.toml.example` — 設定見本（実ファイルは git 追加しない）
- `AGENTS.md` — デプロイ・公開のルール、セキュリティ不変条件
