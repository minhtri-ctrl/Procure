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

## AI quotation extraction

The server accepts Excel/XLSX/CSV, PDF, Word DOC/DOCX, PNG/JPG/JPEG, and WEBP quotation files up to 5 MB. PDF/image/Word extraction uses OpenAI only on the server. DOCX text is extracted from the Office document package first and then sent as bounded text for structured extraction; legacy DOC is sent as an OpenAI file input. `DEMO_MODE=1` uses the internal spreadsheet parser unless an administrator explicitly sets `DEMO_ALLOW_EXTERNAL_AI=1` together with a valid OpenAI configuration; the UI identifies local results as demo/parser results.

For production AI-assisted normalization, configure server environment variables (never expose them to the React app):

```env
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL=gpt-4o-mini
# Optional: stronger model used only for quotation extraction
QUOTATION_AI_MODEL=gpt-4o
DEMO_ALLOW_EXTERNAL_AI=0
```

Only `AI_PROVIDER=openai` with a nonempty key enables the external AI call. In demo mode, it additionally requires `DEMO_ALLOW_EXTERNAL_AI=1`. The extraction adapter sends bounded raw spreadsheet rows, DOCX text, or a PDF/image/legacy-DOC input to OpenAI with a strict JSON schema for item, quantity, price, VAT%, supplier, and a source excerpt string. Inline PDF and Word file input are serialized as typed data URLs. Without AI configuration, ProcureOS uses the local parser for spreadsheets and rejects PDF/images/Word clearly. If a legacy DOC is rejected by the AI provider, save it as DOCX and upload again.

Batch review limits are 3 files / 12 MB total, while each file remains capped at 5 MB. In DEMO_MODE, supplier creation still goes through `/suppliers` only after Apply; no secret is exposed to the browser.

The supplier-suggestion demo is deterministic `demo-rule-based` ranking from in-memory purchase history. It is advisory only and never changes a line supplier until a user applies the suggestion.

## AI supplier recommendation

Supplier recommendation first ranks bounded data already in ProcureOS: matching item names, purchase count, average/min/max price, most recent purchase, active state, and master-contract metadata. It never creates or changes a supplier automatically.

```env
AI_SUPPLIER_SUGGESTIONS=1
SUPPLIER_EXTERNAL_SEARCH_PROVIDER=
```

`AI_SUPPLIER_SUGGESTIONS=1` also requires `AI_PROVIDER=openai`, `AI_API_KEY`, and `DEMO_ALLOW_EXTERNAL_AI=1` in demo mode. Without this opt-in the system uses a clearly labelled rule-based internal ranking. If no internal match exists and no external provider adapter is implemented, the response says external search is not configured; it must never fabricate an outside supplier.

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
- Both GitHub Import and ZIP Upload in Demo System replace the project workspace. Never upload a ZIP containing only `.env`: it removes `package.json` and the application source, so it cannot deploy.
- Before packaging a project with a managed/production database, require `DEMO_MODE=0` (or omit it). `DEMO_MODE=1` mounts in-memory demo routes and makes live MySQL data appear to disappear; it does not delete that data. `scripts/pack-deployment.ps1` now rejects this setting unless `-AllowDemoMode` is passed for a disposable demo project.
- For a private server configuration, copy `deployment-ai.env.template` to a local `.env`, enter the key only on the local machine, then package **the full source tree plus `.env` at the ZIP root**. Run `powershell -ExecutionPolicy Bypass -File scripts\pack-deployment.ps1` to create `procureos-deployment.zip`; upload that one full ZIP and press Deploy. Do not GitHub-import again afterward, because the import replaces the `.env` in the workspace.
- Never add a real key to `.env.example`, Git, a GitHub import, or a screenshot. The ZIP is a private deployment artifact and must not be committed or shared.
- Server listens on `PORT`, default `8080`.
- Root `package.json` must remain present for Node detection.
- Before a major UI change, create a named Git snapshot commit/branch. Deploy only after syntax/build/API smoke passes; the demo production flow deploys from the configured GitHub repository and must not be guessed if access/configuration is absent.

## Quote comparison mode

`/quotation-extractions/compare` reuses the same server-side extraction limits as quotation review. Without a valid OpenAI configuration (or in demo mode without `DEMO_ALLOW_EXTERNAL_AI=1`), it returns a clearly labelled `rule-based` or `demo-rule-based` comparison; no source document is sent to an external provider.
