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
- `POST /orders/automation/run`

`GET /orders/:id` returns header plus `items`, `order_suppliers`, `history`, and parsed `custom_fields`. The supplier endpoint stores commercial terms specific to an order: payment method/time, contract number, Vendor link, and extensible `custom_fields`.

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
