# Architecture

## Purpose

ProcureOS Web is a procurement management app:

- Backend: Node.js, Express, MySQL via `mysql2/promise`
- Frontend: React 18 + Vite
- Auth: JWT
- Documents: DOCX templates and generated contract/PO HTML/DOCX
- Optional integrations: Google Sheets backup, SMTP email, AI provider

## Top-Level Layout

```text
procureos-web/
  package.json              Root start/postinstall for deployment
  .env                      Local env; may contain DEMO_MODE=1
  admin/                    React admin app
  server/                   Express backend, db schema, templates
  secrets/                  Local credentials, not for code changes
```

## Backend Layout

```text
server/src/index.js         Express app, route mounting, SPA serving
server/src/config.js        Env parsing, DB config, demoMode flag
server/src/db.js            MySQL pool, schema init, migrations, seeds
server/src/middleware/auth.js
server/src/routes/*.js      REST modules
server/src/lib/*.js         Shared domain logic and integrations
server/db/schema.sql        Base schema
server/db/seed.sql          Initial seed data
server/templates/*.docx     Contract/PO templates
```

## Frontend Layout

```text
admin/src/App.jsx           Routes, sidebar, layout
admin/src/api.js            Fetch wrapper, token handling
admin/src/auth.jsx          Auth provider
admin/src/meta.jsx          Workflow/theme/labels provider
admin/src/pages/*.jsx       Page-level modules
admin/src/components/*.jsx  Shared UI components
admin/src/labelDefs.js      Sidebar and configurable label manifest
admin/src/lineStatus.js     Line-item status normalization
```

## Route Mounting

`server/src/index.js` mounts:

- `/api/auth`
- `/api/teams`, `/api/categories`, `/api/suppliers`, `/api/signatories` via `crudRouter`
- `/api/products`, `/api/orders`, `/api/requests`, `/api/dashboard`
- `/api/users`, `/api/warehouse`, `/api/emails`, `/api/contracts`
- `/api/uploads`, `/api/ai`, `/api/workflow`, `/api/settings`
- `/api/import`, `/api/notifications`, `/api/backup`

When `config.demoMode` is true, `/api` is served by `server/src/routes/demo.js` and DB init is skipped.

## SPA Serving

- Express expects `server/webui/spa.tpl`.
- `admin/vite.config.js` builds to `../server/webui`.
- Root `postinstall` generates `admin/spa.html`, builds, removes entry, and renames `server/webui/spa.html` to `spa.tpl`.
- Restart server after rebuilding because `spa.tpl` is read into memory on startup.
