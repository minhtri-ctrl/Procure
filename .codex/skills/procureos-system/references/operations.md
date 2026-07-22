# Operations

## Local Demo Without MySQL

`.env` may contain:

```env
DEMO_MODE=1
PORT=8080
JWT_SECRET=procureos-local-demo-secret
ADMIN_EMAIL=admin@garena.vn
ADMIN_PASSWORD=admin123
ADMIN_NAME=Administrator
ALLOWED_DOMAIN=garena.vn
```

Demo route: `server/src/routes/demo.js`.

Demo mode behavior:

- Skips `initDb()`
- Mounts `/api` to in-memory route responses
- Serves production-built UI from `server/webui/spa.tpl`
- When creating or updating records with referenced IDs, hydrate UI display fields such as `team_name` and `supplier_name`; production SQL joins do this automatically, but demo fixtures/routes must do it explicitly.
- Demo order-line mutations must recalculate line/header totals, derive the order status, and expose `order_suppliers` just as the MySQL route does.

Demo login:

```text
admin@garena.vn / admin123
```

## Local MySQL Mode

Use `.env` DB settings:

```env
PORT=8080
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=...
DB_NAME=procureos
```

Or use:

```env
DATABASE_URL=mysql://user:password@host:3306/procureos
```

If `DATABASE_URL` is left as the sample value, it can override DB variables incorrectly.

## Build Production Preview

```powershell
node admin/gen-entry.js
npm --prefix admin run build
Move-Item -LiteralPath server\webui\spa.html -Destination server\webui\spa.tpl -Force
Remove-Item -LiteralPath admin\spa.html -Force
npm start
```

Root `postinstall` performs the same sequence during deploy.

## Run Server

```powershell
npm start
```

Health check:

```text
http://localhost:8080/api/health
```

## Demo Server Helper

`run-demo.cmd` starts the local demo server:

```cmd
cd /d C:\Users\minhtri.le_nvkd\Desktop\procureos-web
"C:\Program Files\nodejs\node.exe" server/src/index.js > demo-server.out.log 2> demo-server.err.log
```

On Windows in this environment, `Start-Process` can fail if both `Path` and `PATH` exist in process env. Workaround:

```powershell
[Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
Start-Process -FilePath '...\run-demo.cmd' -WindowStyle Hidden
```

Before restarting, get the exact listener PID with `netstat -ano | Select-String ':8080'`, stop that PID, then confirm `/api/health`. Starting a second server while the old listener remains alive silently leaves the old code serving localhost.

## Troubleshooting

White screen:

1. Check browser console.
2. Check API shape required by page.
3. Rebuild frontend.
4. Rename `spa.html` to `spa.tpl`.
5. Restart backend.

Build error `Could not resolve entry module "spa.html"`:

- Run `node admin/gen-entry.js` first.

Backend waits for MySQL when user wants demo:

- Confirm `.env` has `DEMO_MODE=1`.
- Confirm `server/src/index.js` skips `initDb()` when demo mode is true.

API health works but UI uses old bundle:

- Express read old `spa.tpl`; restart server after build.

## Deployment Notes

- Deploy runner can misclassify project as static HTML if `.html` remains in workspace.
- Do not commit `admin/spa.html`.
- Server listens on `PORT`, default `8080`.
- Root `package.json` must remain present for Node detection.
