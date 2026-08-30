# site-worker — Cloudflare Workers プロキシ

`site/` (github.io) → `script.google.com` (GAS) のクロスサイトを同一サイト化し、
教室タブレットのフィルタ / サードパーティCookieブロックを回避する。

## デプロイ

```powershell
# 初回のみログイン
npx wrangler login

# デプロイ（site-worker を workdir に）
npx wrangler deploy
# または
wrangler deploy
```

デプロイ後に表示される `https://gakusyu-tools-proxy.<subdomain>.workers.dev` を
`site/index.html` 等の `PROBE_URL` / `SITE_BACKEND_URL` / `CLASSROOM.url` に設定する。

## ルーティング

- `https://<worker>/pdfdrop?probe=1&token=...` → site-pdfdrop GAS
- `https://<worker>/app2?probe=1&token=...` → site-app2-backend GAS
- クエリ・メソッド・ボディは透過的に転送、CORSヘッダを付与

## ローカルテスト

```powershell
npx wrangler dev
# http://localhost:8787/pdfdrop?probe=1&token=... で確認
```
