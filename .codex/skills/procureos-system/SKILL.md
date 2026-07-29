---
name: procureos-system
description: ProcureOS Web codebase context pack for backend, frontend, workflow, automation, demo mode, database, and deployment tasks. Use when Codex is asked to modify, debug, explain, review, or extend the ProcureOS procurement web app in this repository, especially to avoid rereading the whole system.
---

# ProcureOS System

Use this skill as the first stop for ProcureOS Web tasks. Load only the reference file needed for the user's task, then inspect source files locally as needed.

## Quick Orientation

- App: procurement web system, Express API + React/Vite admin + MySQL.
- Workspace root: `C:\Users\minhtri.le_nvkd\Desktop\procureos-web`.
- Backend entry: `server/src/index.js`.
- Frontend entry: `admin/src/App.jsx`.
- DB schema: `server/db/schema.sql`; idempotent runtime migrations live in `server/src/db.js`.
- Demo mode: `.env` can set `DEMO_MODE=1` to serve in-memory sample data from `server/src/routes/demo.js`.
- Production UI build is served from `server/webui/spa.tpl`; root `postinstall` creates `admin/spa.html`, builds, then renames `server/webui/spa.html` to `spa.tpl`.

## Reference Routing

Read only the relevant reference:

- Architecture or "where is X?": `references/architecture.md`
- Procurement flow, statuses, roles, automation behavior: `references/workflow.md`
- API route map and expected response shapes: `references/api-map.md`
- Database/table relationships and migration notes: `references/data-model.md`
- Frontend pages/components and UI patterns: `references/frontend.md`
- Local demo, build, deploy, env, troubleshooting: `references/operations.md`
- Reusable agent profiles/prompts for sub-work: `references/agents.md`
- Common task recipes and validation commands: `references/task-recipes.md`

## Working Rules For This Repo

1. Prefer existing route/lib/page patterns over new frameworks.
2. Keep production MySQL behavior separate from `DEMO_MODE`.
3. Never package `DEMO_MODE=1` for a project that has a managed/production database: demo routes serve in-memory fixtures and hide (but do not delete) real data. `scripts/pack-deployment.ps1` must reject this unless an explicit disposable-demo override is requested.
4. When changing data returned by API routes, check the consuming frontend page for required field names.
5. When changing workflow/status behavior, update backend status logic, automation side effects, and any frontend status display together.
6. Do not commit generated `admin/spa.html`; it is intentionally temporary.
7. For production preview, ensure `server/webui/spa.tpl` exists after build.
8. Validate narrowly:
   - Backend syntax: `node --check <file>`
   - Frontend build: `node admin/gen-entry.js`, `npm --prefix admin run build`, then rename `server/webui/spa.html` to `spa.tpl`.
   - API smoke: `/api/health`, login, and the changed module endpoint.

## Common Pitfalls

- White screen usually means frontend runtime exception. Check browser console and API response shape first.
- Dashboard expects `total_orders`, `total_spend`, `pending_requests`, `supplier_count`, `by_status`, `by_team`, and `recent`.
- Express reads `spa.tpl` into memory at startup; restart server after rebuilding UI.
- Demo mode routes must be mounted before MySQL routes and must not call `initDb()`.
- `.env.example`/README may display mojibake in terminal, but source files are usable; avoid broad encoding churn.
