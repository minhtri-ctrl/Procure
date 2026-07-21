import { query } from '../db.js';
import { createNotification } from './notify.js';
import { createFromOrder } from '../routes/contracts.js';

const CONTRACT_REQUIRED_AMOUNT = 20000000;
const CONTRACT_STATUSES = new Set(['waiting', 'in_progress', 'quoted', 'confirmed', 'ordered', 'received', 'warehoused', 'documented', 'paid']);
const BUYER_ROLES = ['admin', 'purchasing'];
const WAREHOUSE_ROLES = ['warehouse'];

const fmtVnd = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0)) + 'đ';

async function activeEmailsByRoles(roles) {
  const rows = await query(
    `SELECT email FROM users WHERE is_active = 1 AND role IN (${roles.map(() => '?').join(',')})`,
    roles
  );
  return rows.map((r) => r.email).filter(Boolean);
}

async function notifyOnce(n) {
  if (!n.recipient_email) return false;
  const rows = await query(
    `SELECT id FROM notifications
     WHERE recipient_email = ? AND type = ? AND COALESCE(order_id,0) = COALESCE(?,0)
       AND title = ? AND created_at >= CURDATE()
     LIMIT 1`,
    [n.recipient_email, n.type || 'info', n.order_id || null, n.title]
  );
  if (rows.length) return false;
  await createNotification(n);
  return true;
}

async function notifyRole(roles, message) {
  const emails = await activeEmailsByRoles(roles);
  let created = 0;
  for (const email of emails) {
    if (await notifyOnce({ ...message, recipient_email: email })) created++;
  }
  return created;
}

async function loadOrder(orderId) {
  const rows = await query(
    `SELECT o.*, s.name AS supplier_name,
            (SELECT COUNT(*) FROM contracts c WHERE c.order_id = o.id) AS contract_count
     FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE o.id = ? AND o.deleted_at IS NULL`,
    [orderId]
  );
  return rows[0] || null;
}

async function maybeCreateContract(order, actorEmail) {
  const needsContract =
    order &&
    Number(order.total_amount || 0) >= CONTRACT_REQUIRED_AMOUNT &&
    order.supplier_id &&
    Number(order.contract_count || 0) === 0 &&
    !order.contract_no &&
    CONTRACT_STATUSES.has(order.status);
  if (!needsContract) return null;

  const out = await createFromOrder(order.id);
  await notifyRole(BUYER_ROLES, {
    type: 'automation_contract',
    title: `Đã tự tạo hợp đồng - ${order.order_code}`,
    body: `Đơn ${fmtVnd(order.total_amount)} đủ ngưỡng ${fmtVnd(CONTRACT_REQUIRED_AMOUNT)}. Hệ thống đã tạo ${out.type} ${out.contract_no}.`,
    order_id: order.id,
    link: '/contracts',
    created_by: actorEmail || 'automation',
  });
  return out;
}

async function routeStatusTask(order, fromStatus, toStatus, actorEmail) {
  if (!order || fromStatus === toStatus) return 0;
  const base = {
    order_id: order.id,
    link: `/orders/${order.id}`,
    created_by: actorEmail || 'automation',
  };

  if (toStatus === 'confirmed') {
    return notifyRole(BUYER_ROLES, {
      ...base,
      type: 'automation_task',
      title: `Requester đã xác nhận - ${order.order_code}`,
      body: `${order.project_name || 'Đơn hàng'} đã sẵn sàng để đặt hàng NCC.`,
    });
  }
  if (toStatus === 'ordered') {
    return notifyRole(WAREHOUSE_ROLES, {
      ...base,
      type: 'automation_task',
      title: `Chuẩn bị nhận hàng - ${order.order_code}`,
      body: `${order.project_name || 'Đơn hàng'} đã đặt NCC${order.expected_date ? `, dự kiến nhận ${String(order.expected_date).slice(0, 10)}` : ''}.`,
    });
  }
  if (toStatus === 'received') {
    return notifyRole(WAREHOUSE_ROLES, {
      ...base,
      type: 'automation_task',
      title: `Cần nhập kho - ${order.order_code}`,
      body: `${order.project_name || 'Đơn hàng'} đã nhận hàng. Vui lòng kiểm tra và nhập kho nếu cần.`,
    });
  }
  if (['warehoused', 'completed'].includes(toStatus) && order.requester_email) {
    const label = toStatus === 'completed' ? 'hoàn tất' : 'đã nhập kho';
    return (await notifyOnce({
      ...base,
      recipient_email: order.requester_email,
      type: 'automation_update',
      title: `Đơn ${label} - ${order.order_code}`,
      body: `${order.project_name || 'Đơn hàng'} ${label}.`,
    })) ? 1 : 0;
  }
  return 0;
}

async function applyStatusSideEffects(orderId, toStatus) {
  const patch = [];
  const params = [];
  if (toStatus === 'received') patch.push('actual_date = COALESCE(actual_date, CURDATE())');
  if (toStatus === 'warehoused') {
    patch.push('warehouse_status = COALESCE(warehouse_status, ?)');
    params.push('Đã nhập kho');
  }
  if (toStatus === 'completed') patch.push('handover_date = COALESCE(handover_date, CURDATE())');
  if (!patch.length) return false;
  await query(`UPDATE orders SET ${patch.join(', ')} WHERE id = ?`, [...params, orderId]);
  return true;
}

export async function runOrderAutomation(orderId, { fromStatus = null, toStatus = null, actorEmail = 'automation' } = {}) {
  if (toStatus) await applyStatusSideEffects(orderId, toStatus);
  const order = await loadOrder(orderId);
  if (!order) return { order_id: Number(orderId), skipped: true, reason: 'not_found' };

  const contract = await maybeCreateContract(order, actorEmail);
  const notifications = await routeStatusTask(order, fromStatus, toStatus || order.status, actorEmail);
  return {
    order_id: order.id,
    contract_created: contract || null,
    notifications_created: notifications,
  };
}

async function createDueReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const orders = await query(
    `SELECT o.*, COALESCE(s.payment_term_days, 14) AS payment_term_days
     FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE o.deleted_at IS NULL AND o.status NOT IN ('completed','cancelled','rejected')
     ORDER BY o.id DESC LIMIT 500`
  );

  let created = 0;
  for (const o of orders) {
    if (o.expected_date && !o.actual_date) {
      const exp = new Date(o.expected_date);
      exp.setHours(0, 0, 0, 0);
      const diff = Math.round((exp - today) / 86400000);
      if (diff < 0 || diff <= 3) {
        created += await notifyRole(BUYER_ROLES, {
          type: diff < 0 ? 'automation_overdue' : 'automation_due',
          title: `${diff < 0 ? 'Quá hạn nhận hàng' : 'Sắp đến hạn nhận hàng'} - ${o.order_code}`,
          body: `${o.project_name || 'Đơn hàng'}${o.expected_date ? `, hạn ${String(o.expected_date).slice(0, 10)}` : ''}.`,
          order_id: o.id,
          link: `/orders/${o.id}`,
          created_by: 'automation',
        });
      }
    }
    if (o.actual_date && !['paid', 'completed'].includes(o.status)) {
      const due = new Date(o.actual_date);
      due.setHours(0, 0, 0, 0);
      due.setDate(due.getDate() + Number(o.payment_term_days || 14));
      const diff = Math.round((due - today) / 86400000);
      if (diff >= 0 && diff <= 7) {
        created += await notifyRole(BUYER_ROLES, {
          type: 'automation_payment_due',
          title: `Sắp đến hạn thanh toán - ${o.order_code}`,
          body: `${o.project_name || 'Đơn hàng'} cần theo dõi chứng từ/thanh toán trước ${due.toISOString().slice(0, 10)}.`,
          order_id: o.id,
          link: `/orders/${o.id}`,
          created_by: 'automation',
        });
      }
    }
  }
  return created;
}

export async function runAutomationSweep() {
  const statuses = [...CONTRACT_STATUSES];
  const orders = await query(
    `SELECT o.id FROM orders o
     WHERE o.deleted_at IS NULL AND o.supplier_id IS NOT NULL AND o.total_amount >= ?
       AND o.status IN (${statuses.map(() => '?').join(',')})
       AND o.contract_no IS NULL
       AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.order_id = o.id)
     ORDER BY o.id DESC LIMIT 200`,
    [CONTRACT_REQUIRED_AMOUNT, ...statuses]
  );

  const order_results = [];
  for (const o of orders) {
    try {
      order_results.push(await runOrderAutomation(o.id));
    } catch (e) {
      order_results.push({ order_id: o.id, error: e.message });
    }
  }
  const reminders_created = await createDueReminders();
  return { ok: true, orders_scanned: orders.length, reminders_created, order_results };
}

let intervalHandle = null;

export function scheduleOrderAutomation() {
  if (intervalHandle) return;
  const minutes = Number(process.env.ORDER_AUTOMATION_INTERVAL_MINUTES || 15);
  console.log(`[automation] Order automation: mỗi ${minutes} phút.`);
  setTimeout(() => {
    runAutomationSweep().catch((e) => console.error('[automation] Lỗi lượt đầu:', e.message));
  }, 60_000);
  intervalHandle = setInterval(() => {
    runAutomationSweep().catch((e) => console.error('[automation] Lỗi lượt định kỳ:', e.message));
  }, minutes * 60_000);
}
