# ProcureOS Web

Hệ thống quản lý mua hàng (procurement) — chuyển đổi từ bản Google Apps Script + Google Sheets sang web app thật với **MySQL**, **REST API (Node.js/Express)** và **trang admin (React)**.

## Kiến trúc

```
procureos-web/
├── server/            Backend Node.js + Express + MySQL (mysql2)
│   ├── db/
│   │   ├── schema.sql   Cấu trúc database (map 17 sheet → bảng chuẩn hóa)
│   │   └── seed.sql     Dữ liệu mẫu
│   ├── src/
│   │   ├── index.js     Điểm vào (mount API + phục vụ admin build)
│   │   ├── config.js    Cấu hình từ ENV
│   │   ├── db.js        Pool + auto-migrate + seed + tạo admin
│   │   ├── middleware/  JWT auth + phân quyền
│   │   └── routes/      auth, orders, requests, products, suppliers, teams, categories, users, dashboard
│   └── public/          (sinh ra khi build admin)
├── admin/             Frontend React (Vite)
│   └── src/pages/       Login, Dashboard, Orders, Requests, Products, CrudPage, Users
├── Dockerfile         Build admin + chạy server trong 1 container
└── .env.example
```

## Mô hình dữ liệu (MySQL)

| Bảng | Nguồn (Google Sheet) | Mô tả |
|------|----------------------|-------|
| `users` | (mới) | Tài khoản + phân quyền (admin/purchasing/warehouse/requester) |
| `teams` | DM_TEAM | Phòng/nhóm |
| `suppliers` | DM_NCC + HDNT | Nhà cung cấp + điều khoản công nợ |
| `categories` | DM_TU_DIEN_LOAI | Loại hàng |
| `products` | HANG_NHAP | Danh mục SKU |
| `orders` / `order_items` | DATA | Đơn hàng (header) + dòng hàng |
| `purchase_requests` / `request_items` | Request | Yêu cầu mua + dòng |
| `contracts` | (từ DATA) | Hợp đồng |
| `email_logs` | LỊCH SỬ GỬI ĐƠN | Nhật ký email |
| `ratings` | Điểm đánh giá | Đánh giá NCC |
| `warehouse_stock` / `inventory_moves` | HANG_TON / XNT / PNK / PXK | Tồn kho + xuất nhập |
| `settings` | BOT | Tham số hệ thống |
| `catalog_access_log` | CATALOG_ACCESS_LOG | Log truy cập catalog |

## Chạy local

```bash
# 1. Backend
cd server
cp ../.env.example .env      # sửa thông tin MySQL
npm install
npm start                    # tự tạo bảng + seed + admin lần đầu

# 2. Admin (dev, hot reload, proxy /api → :8080)
cd admin
npm install
npm run dev                  # http://localhost:5173
```

Build production: `cd admin && npm run build` → xuất ra `server/public`, rồi `cd server && npm start` phục vụ cả UI lẫn API tại một cổng.

## Tài khoản mặc định

Tạo tự động lần đầu khi bảng `users` trống:
- Email: `admin@garena.vn` (đổi qua `ADMIN_EMAIL`)
- Mật khẩu: `admin123` (đổi qua `ADMIN_PASSWORD`) — **nhớ đổi sau khi deploy**

## Deploy (demo.ffol4.vn / Demo System)

🔗 **Bản chạy thật:** https://procureos.demo.ffol4.vn — đăng nhập `admin@garena.vn` / `admin123` (đổi ngay sau khi dùng).

Quy trình:
1. Tạo project + managed MySQL trên Demo System (DATABASE_URL được inject tự động).
2. `import_repo` từ GitHub → `deploy`. Schema + seed + admin chạy tự động lúc khởi động.

Lưu ý quan trọng về nền tảng Demo System (buildpack, KHÔNG dùng Dockerfile):
- Nền tảng tự nhận diện loại project. Nếu workspace (sau khi build) còn **bất kỳ file `.html`** nào (ngoài `node_modules`) → nó phân loại **STATIC_HTML** và chỉ chạy `npx serve`, bỏ qua server Node. Vì vậy admin build ra `server/webui/` và file entry được đổi đuôi thành `spa.tpl` (Express đọc và trả về HTML).
- Cần `package.json` + `package-lock.json` ở **thư mục gốc** để nhận diện Node.
- Container chạy `NODE_ENV=production` → phải cài devDependencies của admin bằng `--include=dev` (vite).
- App phải nghe cổng **8080** (đã đặt mặc định).

## API chính

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/login` | Đăng nhập |
| GET | `/api/dashboard` | Số liệu tổng quan |
| GET/POST/PUT/DELETE | `/api/orders` | Đơn hàng (+ `/items`, `/status`) |
| GET/POST/PUT/DELETE | `/api/requests` | Yêu cầu mua (+ `/convert`, `/status`) |
| GET/POST/PUT/DELETE | `/api/products` | Danh mục SP |
| GET/POST/PUT/DELETE | `/api/suppliers` `/teams` `/categories` | Danh mục |
| GET/POST/PUT/DELETE | `/api/users` | Quản lý user (admin) |

## Phạm vi hiện tại

Đã hoàn thiện: nền tảng DB đầy đủ (17 bảng), auth/phân quyền, dashboard, danh mục sản phẩm/NCC/team/loại hàng, quản lý người dùng và các module nghiệp vụ:

- **Đơn hàng** — CRUD + dòng hàng + đổi trạng thái.
- **Yêu cầu mua** — CRUD + duyệt + chuyển YC → đơn hàng.
- **Kho hàng** — phiếu nhập (PNK) / xuất (PXK) đánh số `PNK/PXK-YYMM-NNNN` (mốc ngày 25), kiểm tra đủ tồn khi xuất, sổ Xuất–Nhập–Tồn với TON lũy kế, dựng lại tồn kho (HANG_TON). Bám `warehouse_addon.js`.
- **Email** — 4 loại (Xác nhận NCC, Bàn giao, Khảo sát, Thông báo nhập kho) với tiêu đề/nội dung tiếng Việt, sinh số PO `PO-{NCC}-{YYYY}-{seq}`, ghi **LỊCH SỬ GỬI ĐƠN**, thu thập & tính điểm **đánh giá** trung bình. Bám `MainMerged.js`. *(Nền tảng demo không có SMTP nên "gửi" = ghi nhận lịch sử + soạn sẵn nội dung.)*
- **Hợp đồng** — tự chọn **DDH/HĐ** theo hợp đồng khung của NCC, sinh **văn bản hợp đồng HTML** (thay Google Docs) kèm bảng hàng, tổng tiền và **đọc số thành chữ**, auto-create cho đơn ≥ 20 triệu. Bám `procureCreateContractFromTemplate` + `ProcureOS_Automation.js`.
- **Trợ lý AI** — chat với **7 công cụ (function calling)** đọc dữ liệu thật: thống kê, tìm/chi tiết đơn, NCC, tồn kho, báo cáo, schema. Hỗ trợ **Claude** (mặc định) và **OpenAI** qua biến môi trường `AI_API_KEY`/`AI_PROVIDER`/`AI_MODEL`; **không có key vẫn chạy** nhờ bộ định tuyến ý định (intent router). Bám `procureAskAI`.
- **Ảnh sản phẩm** — upload ảnh (lưu bền trong DB bảng `attachments`), phục vụ qua `/api/uploads/:id`, hiển thị thumbnail. Bám `procureUploadImageByRow`/`procureClearImageByRow`.

Chưa port (giai đoạn sau): gửi email SMTP thật, tạo Google Docs/Drive thật, in phiếu kho PDF.

### Bật LLM thật cho Trợ lý AI

Đặt biến môi trường khi deploy (mặc định dùng intent router, không cần key):
- `AI_PROVIDER=anthropic` · `AI_API_KEY=sk-ant-...` · `AI_MODEL=claude-sonnet-5` (khuyến nghị)
- hoặc `AI_PROVIDER=openai` · `AI_API_KEY=sk-...` · `AI_MODEL=gpt-4o-mini`
