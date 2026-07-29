# API Map

All endpoints are under `/api`. Most routes require JWT except login/register and health.

## Auth

- `POST /auth/login` => `{ token, user }`
- `POST /auth/register`
- `GET /auth/me`

## Dashboard

- `GET /dashboard`

Frontend `Dashboard.jsx` expects:

```js
{
  total_orders,
  total_spend,
  pending_requests,
  supplier_count,
  by_status: [{ status, count }],
  by_team: [{ team, spend }],
  recent: [{ order_code, project_name, supplier_name, status, total_amount }]
}
```

## Orders

- `GET /orders?q=&status=&date_field=request_date|expected_date|created_at&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
- `GET /orders/count`
- `GET /orders/export?format=xlsx|csv`
- `GET /orders/items/all`
- `GET /orders/:id`
- `POST /orders`
- `PUT /orders/:id`
- `PATCH /orders/:id/status`
- `GET /orders/:id/history`
- `POST /orders/:id/send-quote`
- `POST /orders/:id/quote-response`
- `DELETE /orders`
- `DELETE /orders/:id`
- `POST /orders/:id/restore`
- `POST /orders/:id/items`
- `GET /orders/:id/suppliers`
- `PUT /orders/:id/suppliers/:supplierId`
- `PUT /orders/items/:itemId`
- `DELETE /orders/items/:itemId`
- `PATCH /orders/items/:itemId/progress`
- `POST /orders/items/:itemId/to-catalog`
- `POST /orders/items/:itemId/handover`
- `POST /orders/items/supplier-suggestions` (admin/purchasing; advisory only, never updates a supplier). It returns ranked internal candidates with history/price evidence. With `AI_SUPPLIER_SUGGESTIONS=1` and allowed OpenAI configuration it returns `mode: ai-system`; otherwise `rule-based`/`demo-rule-based`. If no internal match exists, `external` reports the external-provider adapter state and never invents a supplier.
- `POST /orders/automation/run`

`GET /orders/:id` returns header plus `items`, `order_suppliers`, `history`, parsed `custom_fields`, and `quote_attachments` (filename, MIME type, upload time, linked item/supplier, URL). The supplier endpoint stores commercial terms specific to an order: payment method/time, contract number, Vendor link, and extensible `custom_fields`.

## Purchase Requests

- `GET /requests`
- `GET /requests/:id`
- `POST /requests`
- `PATCH /requests/:id/status`
- `POST /requests/:id/convert`
- `DELETE /requests`
- `DELETE /requests/:id`
- `POST /requests/:id/restore`

## Products

- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PUT /products/:id`
- `DELETE /products/:id`

## Warehouse

- `GET /warehouse/stock`
- `GET /warehouse/moves`
- `GET /warehouse/vouchers`
- `GET /warehouse/vouchers/:voucherNo/print`
- `GET /warehouse/skus?type=PNK|PXK`
- `GET /warehouse/stock-of?sku=&warehouse=`
- `POST /warehouse/vouchers`
- `DELETE /warehouse/vouchers/:voucherNo`
- `DELETE /warehouse/all`
- `POST /warehouse/rebuild`
- `GET /warehouse/export`
- `POST /warehouse/import`

## Contracts

- `GET /contracts`
- `GET /contracts/:id`
- `GET /contracts/:id/document`
- `GET /contracts/:id/docx`
- `POST /contracts/from-order`
- `POST /contracts/auto-run`
- `POST /contracts/template/:type`
- `PUT /contracts/:id`
- `DELETE /contracts/:id`

Contract creation logic is `createFromOrder` exported by `server/src/routes/contracts.js`.

## Emails

- `POST /emails/preview`
- `POST /emails/send`
- `GET /emails/logs`
- `GET /emails/logs/:id`
- `POST /emails/rating`
- `GET /emails/ratings`

## Settings / Metadata

- `/workflow`, `/workflow/all`, `/workflow/:id`
- `/settings/theme`
- `/settings/company`
- `/settings/smtp`
- `/settings/smtp/test`
- `/settings/labels`

## Notifications

- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

## Generic CRUD

Mounted by `crudRouter`:

- `/teams`
- `/categories`
- `/suppliers`
- `/signatories`

List response usually uses `{ data, total, page, limit }`.

## Demo Mode API

`server/src/routes/demo.js` mimics enough API surface for UI preview without DB. Keep shapes aligned with frontend pages.

In `DEMO_MODE`, `/ai/status` and `/ai/chat` use the configured OpenAI server-side API only when `AI_PROVIDER=openai`, `AI_API_KEY` is present, and `DEMO_ALLOW_EXTERNAL_AI=1`. Otherwise they return an explicitly labelled demo intent-router fallback; no key is returned to the browser.

## Quotation Extraction

- `POST /quotation-extractions/extract` (admin/purchasing only)
  - JSON body: `{ filename, data_base64 }`; maximum decoded size is 5 MB.
  - Supported input: `.xlsx`, `.xls`, `.csv`, `.pdf`, `.doc`, `.docx`, `.png`, `.jpg`/`.jpeg`, `.webp`, each up to 5 MB. PDF, Word, and images require a valid OpenAI configuration. DOCX text is extracted server-side before structured AI extraction; legacy DOC is submitted as an OpenAI file input.
  - Response contains `items` with `item_name`, `quantity`, `unit_price`, `vat_percent`, `supplier_name`, a `raw` source excerpt (plus parser sheet/row when applicable), `issues`, and `confidence`, plus `mode` (`ai`, `local-parser`, or `demo-parser`).
  - The endpoint only extracts/reviews data: it never creates an order. In `DEMO_MODE`, it uses the internal parser unless both a valid OpenAI configuration and `DEMO_ALLOW_EXTERNAL_AI=1` are present.

## Quotation batch and source attachments

- `POST /quotation-extractions/extract-batch` accepts up to 3 independent files as `{ files: [{ client_id, filename, data_base64 }] }`. Each file returns its own status, fingerprint, rows, and supplier-match result; one failure does not discard other files.
- `POST /quotation-extractions/compare` accepts the same independent batch and optional comparison weights. It returns validated per-item/per-quote cells, VAT totals, internal supplier history, warnings, and one advisory recommendation. It never persists source files or changes orders, suppliers, or lines; `mode` is `ai`, `rule-based`, or `demo-rule-based`.
- `GET|POST /quotation-extractions/orders/:orderId/attachments` lists or creates quotation-source links. POST stores one blob and accepts `links: [{ item_id, supplier_id, source_supplier_name }]`, keeping multi-NCC source files attached only to their explicit item/NCC pairs. Legacy `item_ids` remains accepted.
- `GET /quotation-extractions/orders/:orderId/attachments/:linkId/file?download=1` returns the original blob only when the link belongs to the requested order, preserving filename and MIME. Omit `download=1` for safe inline preview.
- `DELETE /quotation-extractions/orders/:orderId/attachments/:linkId` deletes one relation and removes the blob only when no relation remains.

## Order-line workspace additions

- `GET /orders/items/all` accepts `date_from`, `date_to`, `team_id`, `supplier_id`, `line_status`, `flag`, and returns line detail plus missing-data flags.
- `PATCH /orders/items/progress/bulk` updates up to 200 selected line items for admin/purchasing and re-syncs affected order statuses.
- `PUT /orders/:id/suppliers/:supplierId` accepts supplier-level `discount_type` (`percent` or `amount`) and `discount_value`; the API recalculates the supplier and order totals.
- `GET /orders/items/all` also returns `quote_file_count` and `quote_file_url` for direct BG access in the item work queue.
