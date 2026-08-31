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

デプロイ後に表示される `https://gakusyu-tools-proxy.hori-shota.workers.dev`（`hori-shota` サブドメインで本番稼働中、2026-08-31 時点 `YOUR_SCRIPT_ID_site-app2-backend... @18 / YOUR_SCRIPT_ID_site-pdfdrop... @18` に対応する `AKfycbxj8q... / AKfycbwj7q...`（`site-worker/worker.js:13-16` の `TARGETS`）が `site/index.html:594` / `site/app2:620` / `site/app9:304` / `site/debug-probe.html:57` の `WORKER_BASE` に設定済み。

## ルーティング

- `https://<worker>/pdfdrop?probe=1&token=...` → site-pdfdrop GAS
- `https://<worker>/app2?probe=1&token=...` → site-app2-backend GAS
- クエリ・メソッド・ボディは透過的に転送、CORSヘッダを付与

## ローカルテスト

```powershell
npx wrangler dev
# http://localhost:8787/pdfdrop?probe=1&token=... で確認
```
