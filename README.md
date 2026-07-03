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

1. Tạo project + managed MySQL trên Demo System.
2. Đặt biến môi trường `DATABASE_URL` (hoặc DB_*), `JWT_SECRET`.
3. Deploy bằng Dockerfile — schema/seed chạy tự động khi khởi động.

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

Đã hoàn thiện: nền tảng DB đầy đủ (17 bảng), auth/phân quyền, dashboard, 2 module lõi **Đơn hàng** & **Yêu cầu mua** + danh mục sản phẩm/NCC/team/loại hàng, quản lý người dùng.

Chưa port (giai đoạn sau): gửi email tự động, kho (nhập/xuất/tồn UI), hợp đồng từ template, trợ lý AI, upload ảnh sản phẩm.
