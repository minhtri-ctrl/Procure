# Frontend

## Structure

- `admin/src/App.jsx`: authenticated layout, sidebar, route map.
- `admin/src/api.js`: fetch wrapper with JWT.
- `admin/src/auth.jsx`: login/register/me provider.
- `admin/src/meta.jsx`: workflow states, theme, UI labels.
- `admin/src/styles.css`: global styles.
- `admin/src/pages/*`: page modules.
- `admin/src/components/*`: shared controls.
- `admin/src/labelDefs.js`: nav, CRUD columns, configurable label manifest.

## Main Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `Dashboard.jsx` | KPIs, status counts, team spend, recent orders |
| `/requests` | `Requests.jsx` | Purchase requests and conversion |
| `/orders` | `Orders.jsx` | Order list |
| `/orders/new` | `CreateOrder.jsx` | Manual order creation |
| `/orders/:id` | `OrderDetail.jsx` | Header, status, line edit, quote response |
| `/item-board` | `ItemBoard.jsx` | Buyer line-item board |
| `/products` | `Products.jsx` | SKU catalog |
| `/warehouse` | `Warehouse.jsx` | Stock, moves, vouchers |
| `/contracts` | `Contracts.jsx` | Contract list/create/templates |
| `/emails` | `Emails.jsx` | Preview/send/logs/ratings |
| `/ai` | `AIAssistant.jsx` | AI assistant |
| `/suppliers`, `/teams`, `/categories` | `CrudPage.jsx` | Master-data CRUD |
| `/users` | `Users.jsx` | User admin |
| `/admin/workflow` | `WorkflowConfig.jsx` | Workflow states |
| `/admin/appearance` | `Appearance.jsx` | Theme |
| `/admin/company` | `CompanySettings.jsx` | Company/signatories/SMTP |
| `/admin/labels` | `LabelSettings.jsx` | UI label overrides |

## API Wrapper

`api.js` prefixes `/api`, JSON-encodes bodies, attaches `Bearer` token, redirects to `/login` on `401`.

Use:

```js
api.get('/orders')
api.post('/orders', payload)
api.put('/orders/1', payload)
api.patch('/orders/1/status', payload)
api.del('/orders/1')
```

## Metadata Provider

`MetaProvider` loads:

- `/workflow` into `states`
- `/settings/theme` into CSS variables
- `/settings/labels` into label overrides

Status display uses `StatusBadge`, which calls `useMeta().byCode(code)`.

## Dashboard Contract

`Dashboard.jsx` expects:

- `total_orders`
- `total_spend`
- `pending_requests`
- `supplier_count`
- `by_status`
- `by_team`
- `recent`

Guard arrays before `.map()` when touching dashboards or demo routes.

## Existing UI Patterns

- Use existing `.card`, `.grid`, `.topbar`, `.table-wrap`, `.field`, `.row`, `.btn-sm`, `.btn-primary`, `.btn-danger`.
- Use `Modal.jsx` for create/edit forms.
- Use `SupplierSelect.jsx` for supplier selection.
- `OrderDetail.jsx` can add a line directly and opens a per-order supplier modal from the supplier chips. Header edit contains `qdnb_link`; payment fields are per-order-supplier rather than header fields.
- `Orders.jsx` supports combined search/status/date filtering. Date field choices are request date, expected receiving date, and created date.
- `NotificationBell.jsx` is an accessible popover with click-outside and Escape closing. Its panel must stay above sidebar/main stacking contexts and switch to a viewport-fixed panel on mobile.
- Keep CRUD pages using generic `CrudPage` when possible.
- Avoid broad redesign unless explicitly requested.

## Build Notes

Development:

```powershell
npm --prefix admin run dev
```

Production preview:

```powershell
node admin/gen-entry.js
npm --prefix admin run build
Move-Item server\webui\spa.html server\webui\spa.tpl -Force
Remove-Item admin\spa.html -Force
```

Restart backend after rebuild because it caches `spa.tpl` at startup.
