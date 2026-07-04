import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initDb } from './db.js';
import { crudRouter } from './routes/crud.js';
import authRoutes from './routes/auth.js';
import ordersRoutes from './routes/orders.js';
import requestsRoutes from './routes/requests.js';
import productsRoutes from './routes/products.js';
import dashboardRoutes from './routes/dashboard.js';
import usersRoutes from './routes/users.js';
import warehouseRoutes from './routes/warehouse.js';
import emailsRoutes from './routes/emails.js';
import contractsRoutes from './routes/contracts.js';
import uploadsRoutes from './routes/uploads.js';
import aiRoutes from './routes/ai.js';
import workflowRoutes from './routes/workflow.js';
import settingsRoutes from './routes/settings.js';
import importRoutes from './routes/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'procureos', time: new Date().toISOString() }));

// Auth
app.use('/api/auth', authRoutes);

// Master data (CRUD generic)
app.use('/api/teams', crudRouter({
  table: 'teams',
  fields: ['code', 'name', 'lead_name', 'lead_title', 'is_active'],
  searchCols: ['code', 'name'],
}));
app.use('/api/categories', crudRouter({
  table: 'categories',
  fields: ['code', 'name', 'abbr', 'abbr2', 'is_active'],
  searchCols: ['code', 'name'],
}));
app.use('/api/suppliers', crudRouter({
  table: 'suppliers',
  fields: ['name', 'vendor_no', 'master_contract', 'tax_code', 'address', 'contact_name', 'contact_phone', 'contact_email', 'payment_term_days', 'representative', 'is_active'],
  searchCols: ['name', 'vendor_no', 'contact_name'],
}));

// Modules
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/import', importRoutes);

// Phục vụ admin build (SPA) từ server/webui.
// File entry được lưu dưới dạng spa.tpl (KHÔNG phải .html) để deploy runner của
// nền tảng không phân loại project là STATIC_HTML mà chạy đúng server Node.
const adminDist = path.join(__dirname, '..', 'webui');
const spaFile = path.join(adminDist, 'spa.tpl');
if (fs.existsSync(spaFile)) {
  const spaHtml = fs.readFileSync(spaFile);
  app.use(express.static(adminDist, { index: false }));
  app.get(/^(?!\/api).*/, (req, res) => res.type('html').send(spaHtml));
} else {
  app.get('/', (req, res) => res.json({ service: 'ProcureOS API', note: 'Admin UI chưa được build vào server/webui' }));
}

// Error handler
app.use((err, req, res, next) => {
  console.error('[error]', err.code || '', err.sqlMessage || err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.sqlMessage || err.message || 'Lỗi máy chủ' });
});

initDb()
  .then(() => {
    app.listen(config.port, () => console.log(`[server] ProcureOS chạy tại cổng ${config.port}`));
  })
  .catch((e) => {
    console.error('[server] Không khởi tạo được DB:', e.message);
    // Vẫn chạy server để /api/health hoạt động, giúp debug deploy.
    app.listen(config.port, () => console.log(`[server] chạy (DB lỗi) tại cổng ${config.port}`));
  });
