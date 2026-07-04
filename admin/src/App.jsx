import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Requests from './pages/Requests.jsx';
import Products from './pages/Products.jsx';
import CrudPage from './pages/CrudPage.jsx';
import Users from './pages/Users.jsx';
import Warehouse from './pages/Warehouse.jsx';
import Emails from './pages/Emails.jsx';
import Contracts from './pages/Contracts.jsx';
import AIAssistant from './pages/AIAssistant.jsx';

const NAV = [
  { section: 'Tổng quan' },
  { to: '/', label: '📊 Dashboard', end: true },
  { section: 'Nghiệp vụ' },
  { to: '/orders', label: '📦 Đơn hàng' },
  { to: '/requests', label: '📝 Yêu cầu mua' },
  { to: '/products', label: '🛒 Danh mục SP' },
  { to: '/warehouse', label: '🏬 Kho hàng' },
  { to: '/contracts', label: '📄 Hợp đồng' },
  { to: '/emails', label: '✉️ Email' },
  { to: '/ai', label: '🤖 Trợ lý AI' },
  { section: 'Danh mục' },
  { to: '/suppliers', label: '🏢 Nhà cung cấp' },
  { to: '/teams', label: '👥 Team' },
  { to: '/categories', label: '🏷️ Loại hàng' },
  { section: 'Hệ thống', roles: ['admin'] },
  { to: '/users', label: '🔑 Người dùng', roles: ['admin'] },
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Procure<span>OS</span></div>
        <nav>
          {NAV.map((item, i) =>
            item.section ? (
              (!item.roles || item.roles.includes(user.role)) && <div className="section" key={i}>{item.section}</div>
            ) : (
              (!item.roles || item.roles.includes(user.role)) && (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {item.label}
                </NavLink>
              )
            )
          )}
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
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
