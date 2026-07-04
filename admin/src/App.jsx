import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { MetaProvider } from './meta.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import CreateOrder from './pages/CreateOrder.jsx';
import WorkflowConfig from './pages/WorkflowConfig.jsx';
import Appearance from './pages/Appearance.jsx';
import ImportData from './pages/ImportData.jsx';
import Requests from './pages/Requests.jsx';
import Products from './pages/Products.jsx';
import CrudPage from './pages/CrudPage.jsx';
import Users from './pages/Users.jsx';
import Warehouse from './pages/Warehouse.jsx';
import Emails from './pages/Emails.jsx';
import Contracts from './pages/Contracts.jsx';
import AIAssistant from './pages/AIAssistant.jsx';

const ALL = ['admin', 'purchasing', 'warehouse', 'requester', 'pm'];
const OPS = ['admin', 'purchasing']; // buyer/admin thao tác
const NAV = [
  { section: 'Tổng quan', roles: OPS },
  { to: '/', label: '📊 Dashboard', end: true, roles: OPS },
  { section: 'Nghiệp vụ', roles: ALL },
  { to: '/orders', label: '📦 Đơn hàng', roles: ['admin', 'purchasing', 'pm', 'requester'] },
  { to: '/requests', label: '📝 Yêu cầu mua', roles: ['admin', 'purchasing', 'pm', 'requester'] },
  { to: '/products', label: '🛒 Danh mục SP', roles: OPS },
  { to: '/warehouse', label: '🏬 Kho hàng', roles: ['admin', 'purchasing', 'warehouse'] },
  { to: '/contracts', label: '📄 Hợp đồng', roles: OPS },
  { to: '/emails', label: '✉️ Email', roles: OPS },
  { to: '/ai', label: '🤖 Trợ lý AI', roles: OPS },
  { section: 'Danh mục', roles: OPS },
  { to: '/suppliers', label: '🏢 Nhà cung cấp', roles: OPS },
  { to: '/teams', label: '👥 Team', roles: OPS },
  { to: '/categories', label: '🏷️ Loại hàng', roles: OPS },
  { section: 'Hệ thống', roles: ['admin'] },
  { to: '/users', label: '🔑 Người dùng', roles: ['admin'] },
  { to: '/admin/import', label: '⬆️ Nhập dữ liệu', roles: ['admin'] },
  { to: '/admin/workflow', label: '🔀 Cấu hình Workflow', roles: ['admin'] },
  { to: '/admin/appearance', label: '🎨 Giao diện', roles: ['admin'] },
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  // Gom NAV thành các nhóm, lọc theo vai trò, bỏ nhóm rỗng.
  const groups = [];
  let cur = null;
  for (const it of NAV) {
    if (it.section) { cur = { title: it.section, items: [] }; groups.push(cur); }
    else if (cur && (!it.roles || it.roles.includes(user.role))) cur.items.push(it);
  }
  const visible = groups.filter((g) => g.items.length);
  const activeTitle = visible.find((g) => g.items.some((i) => i.to === loc.pathname || (i.to !== '/' && loc.pathname.startsWith(i.to))))?.title;
  const [open, setOpen] = useState(activeTitle || visible[0]?.title);
  useEffect(() => { if (activeTitle) setOpen(activeTitle); }, [activeTitle]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Procure<span>OS</span></div>
        <nav>
          {visible.map((g) => (
            <div key={g.title}>
              <div className={`grp-hd${open === g.title ? ' open' : ''}`} onClick={() => setOpen(open === g.title ? null : g.title)}>
                <span>{g.title}</span><span className="chev">▶</span>
              </div>
              {open === g.title && g.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="user">
          <div><strong>{user.name || user.email}</strong></div>
          <div className="muted">{user.role}</div>
          <button className="btn-sm" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center-msg">Đang tải…</div>;
  if (!user) return loc.pathname === '/login' ? <Login /> : <Navigate to="/login" replace />;
  if (loc.pathname === '/login') return <Navigate to="/" replace />;

  const canWrite = ['admin', 'purchasing'].includes(user.role);
  return (
    <MetaProvider>
    <Layout>
      <Routes>
        <Route path="/" element={['admin', 'purchasing'].includes(user.role) ? <Dashboard /> : <Navigate to="/orders" replace />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/new" element={<CreateOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/products" element={<Products />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/ai" element={<AIAssistant />} />
        <Route path="/suppliers" element={<CrudPage
          title="Nhà cung cấp" endpoint="/suppliers" canWrite={canWrite}
          columns={[
            { key: 'name', label: 'Tên NCC' },
            { key: 'vendor_no', label: 'Mã NCC' },
            { key: 'contact_name', label: 'Liên hệ' },
            { key: 'contact_email', label: 'Email' },
            { key: 'payment_term_days', label: 'Công nợ (ngày)' },
          ]}
          fields={[
            { key: 'name', label: 'Tên NCC', required: true },
            { key: 'vendor_no', label: 'Mã NCC' },
            { key: 'tax_code', label: 'Mã số thuế' },
            { key: 'contact_name', label: 'Người liên hệ' },
            { key: 'contact_email', label: 'Email' },
            { key: 'contact_phone', label: 'Điện thoại' },
            { key: 'address', label: 'Địa chỉ' },
            { key: 'payment_term_days', label: 'Công nợ (ngày)', type: 'number' },
            { key: 'representative', label: 'Người đại diện ký' },
          ]}
        />} />
        <Route path="/teams" element={<CrudPage
          title="Team" endpoint="/teams" canWrite={canWrite}
          columns={[
            { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên team' },
            { key: 'lead_name', label: 'Trưởng nhóm' }, { key: 'lead_title', label: 'Chức vụ' },
          ]}
          fields={[
            { key: 'code', label: 'Mã team', required: true },
            { key: 'name', label: 'Tên team' },
            { key: 'lead_name', label: 'Trưởng nhóm' },
            { key: 'lead_title', label: 'Chức vụ' },
          ]}
        />} />
        <Route path="/categories" element={<CrudPage
          title="Loại hàng" endpoint="/categories" canWrite={canWrite}
          columns={[
            { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên loại' }, { key: 'abbr', label: 'Viết tắt' },
          ]}
          fields={[
            { key: 'code', label: 'Mã loại', required: true },
            { key: 'name', label: 'Tên loại', required: true },
            { key: 'abbr', label: 'Viết tắt' },
          ]}
        />} />
        <Route path="/users" element={user.role === 'admin' ? <Users /> : <Navigate to="/" />} />
        <Route path="/admin/import" element={user.role === 'admin' ? <ImportData /> : <Navigate to="/" />} />
        <Route path="/admin/workflow" element={user.role === 'admin' ? <WorkflowConfig /> : <Navigate to="/" />} />
        <Route path="/admin/appearance" element={user.role === 'admin' ? <Appearance /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
    </MetaProvider>
  );
}
