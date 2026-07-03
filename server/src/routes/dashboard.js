import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { wrap } from '../util.js';

const router = Router();
router.use(authRequired);

router.get('/', wrap(async (req, res) => {
  const [[orders], [spend], byStatus, byTeam, byMonth, [reqs], recent] = await Promise.all([
    query('SELECT COUNT(*) AS total_orders FROM orders'),
    query('SELECT COALESCE(SUM(total_amount),0) AS total_spend FROM orders WHERE status <> "cancelled"'),
    query('SELECT status, COUNT(*) AS count FROM orders GROUP BY status'),
    query(`SELECT t.name AS team, COALESCE(SUM(o.total_amount),0) AS spend
           FROM orders o LEFT JOIN teams t ON t.id=o.team_id GROUP BY o.team_id ORDER BY spend DESC LIMIT 10`),
    query(`SELECT DATE_FORMAT(request_date, '%Y-%m') AS month, COALESCE(SUM(total_amount),0) AS spend
           FROM orders WHERE request_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6`),
    query('SELECT COUNT(*) AS pending_requests FROM purchase_requests WHERE status = "new"'),
    query(`SELECT o.order_code, o.project_name, o.status, o.total_amount, o.updated_at, s.name AS supplier_name
           FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id ORDER BY o.updated_at DESC LIMIT 8`),
  ]);

  res.json({
    total_orders: orders.total_orders,
    total_spend: Number(spend.total_spend),
    pending_requests: reqs.pending_requests,
    supplier_count: (await query('SELECT COUNT(*) AS c FROM suppliers'))[0].c,
    product_count: (await query('SELECT COUNT(*) AS c FROM products'))[0].c,
    by_status: byStatus,
    by_team: byTeam,
    by_month: byMonth.reverse(),
    recent,
  });
}));

export default router;
