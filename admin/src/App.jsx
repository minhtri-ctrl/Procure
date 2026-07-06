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
import CompanySettings from './pages/CompanySettings.jsx';
import ImportData from './pages/ImportData.jsx';
import Requests from './pages/Requests.jsx';
import Products from './pages/Products.jsx';
import CrudPage from './pages/CrudPage.jsx';
import Users from './pages/Users.jsx';
import Warehouse from './pages/Warehouse.jsx';
import Emails from './pages/Emails.jsx';
import Contracts from './pages/Contracts.jsx';
import AIAssistant from './pages/AIAssistant.jsx';
import ItemBoard from './pages/ItemBoard.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import LabelSettings from './pages/LabelSettings.jsx';
import { NAV, SUPPLIER_COLUMNS, SUPPLIER_FIELDS, TEAM_COLUMNS, TEAM_FIELDS, CATEGORY_COLUMNS, CATEGORY_FIELDS } from './labelDefs.js';
import { useMeta } from './meta.jsx';

function Layout({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const { L } = useMeta();
  // Gom NAV thành các nhóm, lọc theo vai trò, bỏ nhóm rỗng.
  const groups = [];
  let cur = null;
  for (const it of NAV) {
    if (it.section) { cur = { key: it.key, title: L(it.key, it.label), items: [] }; groups.push(cur); }
    else if (cur && (!it.roles || it.roles.includes(user.role))) cur.items.push(it);
  }
  const visible = groups.filter((g) => g.items.length);
  const activeKey = visible.find((g) => g.items.some((i) => i.to === loc.pathname || (i.to !== '/' && loc.pathname.startsWith(i.to))))?.key;
  // Nhiều nhóm có thể mở cùng lúc — dùng Set thay vì 1 giá trị duy nhất (accordion).
  const [openGroups, setOpenGroups] = useState(() => new Set(visible.map((g) => g.key)));
  useEffect(() => {
    if (activeKey) setOpenGroups((prev) => (prev.has(activeKey) ? prev : new Set(prev).add(activeKey)));
  }, [activeKey]);
  const toggleGroup = (key) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1');
  useEffect(() => { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  const iconOf = (label) => label.split(' ')[0];

  return (
    <div className={`layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="brand-row">
          {!collapsed && <div className="brand">Procure<span>OS</span></div>}
          <button className="sidebar-toggle" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav>
          {visible.map((g) => (
            <div key={g.key}>
              {!collapsed && (
                <div className={`grp-hd${openGroups.has(g.key) ? ' open' : ''}`} onClick={() => toggleGroup(g.key)}>
                  <span>{g.title}</span><span className="chev">▶</span>
                </div>
              )}
              {(collapsed || openGroups.has(g.key)) && g.items.map((item) => {
                const label = L(item.key, item.label);
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} title={label} className={({ isActive }) => (isActive ? 'active' : '')}>
                    {collapsed ? iconOf(item.label) : label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="user">
          {!collapsed ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{user.name || user.email}</strong>
                <NotificationBell />
              </div>
              <div className="muted">{user.role}</div>
              <button className="btn-sm" onClick={logout}>Đăng xuất</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}><NotificationBell /></div>
              <button className="btn-sm" onClick={logout} title="Đăng xuất">⎋</button>
            </>
          )}
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
        <Route path="/item-board" element={['admin', 'purchasing'].includes(user.role) ? <ItemBoard /> : <Navigate to="/orders" replace />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/products" element={<Products />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/ai" element={<AIAssistant />} />
        <Route path="/suppliers" element={<CrudPage
          title="Nhà cung cấp" endpoint="/suppliers" canWrite={canWrite}
          importEndpoint="/suppliers/import"
          columns={SUPPLIER_COLUMNS}
          fields={SUPPLIER_FIELDS}
        />} />
        <Route path="/teams" element={<CrudPage
          title="Team" endpoint="/teams" canWrite={canWrite}
          columns={TEAM_COLUMNS}
          fields={TEAM_FIELDS}
        />} />
        <Route path="/categories" element={<CrudPage
          title="Loại hàng" endpoint="/categories" canWrite={canWrite}
          columns={CATEGORY_COLUMNS}
          fields={CATEGORY_FIELDS}
        />} />
        <Route path="/users" element={user.role === 'admin' ? <Users /> : <Navigate to="/" />} />
        <Route path="/admin/import" element={user.role === 'admin' ? <ImportData /> : <Navigate to="/" />} />
        <Route path="/admin/workflow" element={user.role === 'admin' ? <WorkflowConfig /> : <Navigate to="/" />} />
        <Route path="/admin/appearance" element={user.role === 'admin' ? <Appearance /> : <Navigate to="/" />} />
        <Route path="/admin/company" element={user.role === 'admin' ? <CompanySettings /> : <Navigate to="/" />} />
        <Route path="/admin/labels" element={user.role === 'admin' ? <LabelSettings /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
    </MetaProvider>
  );
}
