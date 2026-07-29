# Task Recipes

## Change Order Workflow

Read:

- `workflow.md`
- `api-map.md`
- `frontend.md` if UI labels/controls change

Checklist:

1. Update backend permission/status logic in `server/src/routes/orders.js` if needed.
2. Update default states in `server/src/db.js` if adding default workflow entries.
3. Update automation in `server/src/lib/orderAutomation.js` if side effects change.
4. Update `admin/src/pages/OrderDetail.jsx` and status UI only if behavior is visible.
5. Update demo data/routes in `server/src/routes/demo.js`.
6. Validate backend syntax and frontend build.

## Add API Field Used By Frontend

Read:

- `api-map.md`
- `data-model.md` if field is persisted

Checklist:

1. Add field to SQL SELECT.
2. Add field to demo route response.
3. Add frontend guard/default if optional.
4. Smoke test endpoint.

## Add Database Column

Read:

- `data-model.md`

Checklist:

1. Add to `server/db/schema.sql`.
2. Add idempotent migration to `server/src/db.js`.
3. Add field to route pick-list if writable.
4. Add field to frontend form/table if user-facing.
5. Add demo-mode value if page depends on it.

## Debug White Screen

Read:

- `frontend.md`
- `operations.md`

Checklist:

1. Inspect browser console.
2. Identify page/component stack from minified or source-mapped trace.
3. Check expected API shape in page.
4. Fix response or add defensive guard.
5. Rebuild UI and rename `spa.html` to `spa.tpl`.
6. Restart backend.
7. Reload with cache-busting query string.

## Add Demo Data

Read:

- `operations.md`
- `api-map.md`

Checklist:

1. Add sample object to `server/src/routes/demo.js`.
2. Keep shape aligned with production endpoint and frontend page.
3. Avoid requiring MySQL or filesystem secrets.
4. Validate login, target page, target endpoint.

## Change Order Lines or Per-Order Suppliers

1. Preserve `computeLine`/`recalcTotal` for every line mutation.
2. Keep `syncOrderStatusFromItems` invoked after every line mutation and preserve manual status for an empty order.
3. Store order-specific supplier terms in `order_suppliers`; do not overwrite `suppliers` master data.
4. Mirror mutations in `server/src/routes/demo.js`.

## Change Order List Filters or Notifications

1. Keep `/orders` filters composable with search, status, role scope, and pagination.
2. Whitelist any selectable date column before it enters SQL.
3. Ensure notification panels are not clipped by sidebar overflow or a lower stacking context; check a narrow viewport as well as desktop.

## Batch quotation and attachment checklist

1. Keep each source file and supplier group separate; never auto-merge ambiguous supplier names.
2. System supplier selection wins over the AI source name. Create a new master supplier only from the Apply action.
3. Persist one attachment blob plus `order_quote_attachments` links after an order/item exists; test link deletion and demo parity.
4. Test Add vs explicit Update in Order Detail; AI must not overwrite an existing line automatically.

## Change work queues or supplier suggestions

1. Preserve individual line mutations and the existing bulk-progress confirmation.
2. Return BG metadata in both MySQL and demo item-list responses; retain `quotation_url` fallback.
3. Keep recommendations server-side and advisory. Test that applying one uses the normal line-update route and that no recommendation changes a supplier automatically.
4. For Orders UI, keep table default and make advanced filters collapsible; Kanban is read-only unless workflow rules are deliberately extended. Do not attach row-click editing to dense tables.

## Validate

Backend:

```powershell
node --check server\src\routes\orders.js
node --check server\src\lib\orderAutomation.js
node --check server\src\routes\demo.js
```

Frontend:

```powershell
node admin/gen-entry.js
npm --prefix admin run build
Move-Item server\webui\spa.html server\webui\spa.tpl -Force
Remove-Item admin\spa.html -Force
```

Smoke:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

## Change quotation extraction

1. Keep `/quotation-extractions/extract` server-side and role-protected; do not put an AI key or provider call in React.
2. Validate the strict review item shape (`item_name`, `quantity`, `unit_price`, `vat_percent`, `supplier_name`, `raw`) before returning it. For OpenAI Structured Outputs, keep `raw` a string/source excerpt rather than an open-ended object, because strict schemas require a closed property set.
3. Preserve a raw source excerpt and parser sheet/row (when available) so the user can compare before applying.
4. Update `CreateOrder.jsx` and `server/src/routes/demo.js` together; demo must identify parser/mock results and never create an order automatically.
5. Validate file signature and 5 MB limits for PDF/DOC/DOCX/PNG/JPEG/WEBP. Extract DOCX text server-side with `PizZip` before structured AI extraction; send legacy DOC as a typed AI file input and surface a clear Save-as-DOCX fallback if the provider rejects it. Send inline PDF content as `data:application/pdf;base64,...`; images use a typed data URL. Run `node --check server/src/lib/quotationExtraction.js`, `node --check server/src/routes/quotationExtraction.js`, frontend build, then smoke the endpoint with a CSV upload after demo login. Test a real PDF/image/Word only after a user-configured OpenAI key is confirmed; do not print the key.
