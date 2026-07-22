# Workflow

## Roles

- `admin`: full access.
- `purchasing`: buyer/procurement operations.
- `warehouse`: warehouse receiving, stock, vouchers.
- `requester`: owns purchase requests and quote confirmation.
- `pm`: scoped viewing/management by team.

## Main Procurement Flow

```text
Purchase request
  -> Buyer review
  -> Order created or request converted
  -> Buyer fills line prices, supplier, quotation, PR/master-contract info
  -> Buyer sends quote confirmation to requester
  -> Requester confirms or rejects
  -> Buyer orders from supplier / sends vendor confirmation email
  -> Contract/PO is created when required
  -> Warehouse or buyer marks received
  -> Items go to catalog/warehouse or direct handover
  -> Documents complete
  -> Payment
  -> Completed
```

## Order Statuses

Default workflow states in `server/src/db.js`:

| Code | Meaning | Actor |
|---|---|---|
| `new` | New | buyer |
| `in_progress` | In progress | buyer |
| `quoted` | Quoted | buyer |
| `pending_confirmation` | Waiting for requester quote confirmation | requester |
| `confirmed` | Requester confirmed | requester |
| `ordered` | Ordered from supplier | buyer |
| `received` | Received | warehouse/buyer |
| `warehoused` | Warehoused | warehouse |
| `documented` | Documents complete | buyer |
| `paid` | Paid | buyer |
| `completed` | Completed | buyer |
| `rejected` | Rejected | requester |
| `cancelled` | Cancelled | buyer |

Admin can manage active states through `/api/workflow`.

## Status Permission Rules

Implemented in `server/src/routes/orders.js`:

- `admin` / `purchasing`: any status.
- `requester`: only own order to `confirmed` or `rejected`.
- `warehouse`: only `received` or `warehoused`.

## Quote Confirmation

- `POST /api/orders/:id/send-quote`
  - Requires `admin` or `purchasing`.
  - Sets order status to `pending_confirmation`.
  - Creates a `quote_confirm` notification for requester.

- `POST /api/orders/:id/quote-response`
  - Requester owner or admin only.
  - `decision=confirm` => status `confirmed`.
  - `decision=reject` => status `in_progress`.
  - Resolves pending quote notification.
  - Notifies buyer who sent quote.

## Automation

File: `server/src/lib/orderAutomation.js`

Triggered after status changes and quote responses, plus scheduled sweep:

- Auto-create contract/PO when total amount >= 20,000,000 VND, supplier exists, and no existing contract.
- Route notifications:
  - `confirmed` => buyer task to place order.
  - `ordered` => warehouse task to prepare receiving.
  - `received` => warehouse task to warehouse if needed.
  - `warehoused` / `completed` => requester update.
- Status side effects:
  - `received` => fill `actual_date` if blank.
  - `warehoused` => fill `warehouse_status`.
  - `completed` => fill `handover_date` if blank.
- Scheduled sweep:
  - default every 15 minutes via `ORDER_AUTOMATION_INTERVAL_MINUTES`
  - creates missing contracts
  - creates due/overdue receiving reminders
  - creates upcoming payment reminders

Manual endpoint: `POST /api/orders/automation/run`.

## Warehouse Flow

- Push order line to catalog: `POST /api/orders/items/:itemId/to-catalog`
- Direct handover: `POST /api/orders/items/:itemId/handover`
- Create vouchers: `POST /api/warehouse/vouchers`
- `PNK` is inbound; `PXK` is outbound and checks stock before writing moves.
- `warehouse_stock` is rebuilt from `inventory_moves`.

## Order Status Derived From Lines

`order_items.progress` is normalized to `cho_bao_gia`, `dang_dat`, `da_nhan`, `da_giao`, `da_nhap_kho`, or `huy`.
After a line is added, edited, removed, progressed, cataloged, or handed over, the backend recalculates totals and derives the order status: all non-cancelled lines received/handed-over/warehoused => `received`; any active quotation line => `in_progress`; otherwise active placement or partial receipt => `ordered`; all lines cancelled => `cancelled`. Empty orders retain their manually selected status.
