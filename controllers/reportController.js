const db = require('../config/db');

/* ══ LAPORAN PENJUALAN ══ */
const getLaporan = async (req, res) => {
  try {
    const { from, to } = req.query;

    let dateFilter = '';
    const params = [];

    if (from && to) {
      dateFilter = 'AND DATE(o.created_at) BETWEEN ? AND ?';
      params.push(from, to);
    }

    // Total pendapatan & pesanan
    const [summary] = await db.query(`
      SELECT 
        COUNT(o.id)                  AS total_pesanan,
        SUM(o.total_price)           AS total_pendapatan,
        COUNT(DISTINCT o.user_id)    AS total_pelanggan
      FROM orders o
      WHERE o.status = 'Selesai'
      ${dateFilter}
    `, params);

    // Pesanan per status — ikut filter tanggal
    const [byStatus] = await db.query(`
      SELECT status, COUNT(*) AS jumlah
      FROM orders o
      WHERE 1=1
      ${dateFilter}
      GROUP BY status
      ORDER BY jumlah DESC
    `, params);

    // Produk terlaris — ikut filter tanggal
    const [topProducts] = await db.query(`
      SELECT 
        p.name,
        c.name                          AS category_name,
        SUM(oi.quantity)                AS total_terjual,
        SUM(oi.quantity * oi.price)     AS total_pendapatan
      FROM order_items oi
      JOIN products  p  ON oi.product_id = p.id
      JOIN orders    o  ON oi.order_id   = o.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE o.status = 'Selesai'
      ${dateFilter}
      GROUP BY p.id
      ORDER BY total_terjual DESC
      LIMIT 5
    `, params);

    // Pendapatan per bulan / per hari (jika filter aktif)
    let byMonth;
    if (from && to) {
      [byMonth] = await db.query(`
        SELECT 
          DATE_FORMAT(MIN(created_at), '%a') AS hari,
          COUNT(*)                            AS jumlah_pesanan,
          SUM(total_price)                    AS pendapatan
        FROM orders
        WHERE status = 'Selesai'
          AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY bulan ASC
      `, [from, to]);
    } else {
      [byMonth] = await db.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') AS bulan,
          COUNT(*)                         AS jumlah_pesanan,
          SUM(total_price)                 AS pendapatan
        FROM orders
        WHERE status = 'Selesai'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY bulan
        ORDER BY bulan ASC
      `);
    }

    // Daftar pesanan detail — ikut filter tanggal
    const [orders] = await db.query(`
      SELECT 
        o.id,
        o.invoice_number,
        o.total_price,
        o.status,
        o.created_at,
        u.name   AS customer_name,
        u.email,
        p.status AS payment_status
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN payments p ON p.order_id = o.id
      WHERE 1=1 ${dateFilter}
      ORDER BY o.created_at DESC
      LIMIT 50
    `, params);

    res.json({ summary: summary[0], byStatus, topProducts, byMonth, orders });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ══ DASHBOARD STATS ══ */
const getDashboardStats = async (req, res) => {
  try {
    const [todayOrders] = await db.query(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE DATE(created_at) = CURDATE()
    `);

    const [pending] = await db.query(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE status = 'Menunggu Konfirmasi'
    `);

    const [monthRevenue] = await db.query(`
      SELECT COALESCE(SUM(total_price), 0) AS total
      FROM orders
      WHERE status = 'Selesai'
        AND MONTH(created_at) = MONTH(NOW())
        AND YEAR(created_at)  = YEAR(NOW())
    `);

    const [customers] = await db.query(`
      SELECT COUNT(*) AS count FROM users WHERE role = 'pelanggan'
    `);

    const [recentOrders] = await db.query(`
      SELECT o.id, o.invoice_number, o.total_price, o.status, o.created_at,
             u.name AS customer_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    const [lowStock] = await db.query(`
      SELECT id, name, stock, image
      FROM products
      WHERE stock < 5
      ORDER BY stock ASC
      LIMIT 5
    `);

    const [salesChart] = await db.query(`
      SELECT 
        DATE_FORMAT(MIN(created_at), '%a') AS hari,
        DATE(created_at)                   AS tanggal,
        COUNT(*)                           AS jumlah,
        COALESCE(SUM(total_price), 0)      AS pendapatan
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND status IN ('Selesai', 'Dikirim', 'Diproses')
      GROUP BY DATE(created_at)
      ORDER BY tanggal ASC
    `);

    res.json({
      stats: {
        todayOrders:  todayOrders[0].count,
        pending:      pending[0].count,
        monthRevenue: monthRevenue[0].total,
        customers:    customers[0].count,
      },
      recentOrders,
      lowStock,
      salesChart,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getLaporan, getDashboardStats };