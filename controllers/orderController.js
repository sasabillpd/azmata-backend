const db = require('../config/db');
const { sendNotification } = require('./notificationController');

/* ── helper: tentuin berapa hari toleransi sebelum auto-confirm, sesuai wilayah ── */
const getAutoConfirmDays = (provinsi, kota) => {
  const p = (provinsi || '').toLowerCase();
  const k = (kota || '').toLowerCase();
  const PROVINSI_JAWA = ['jawa barat', 'jawa tengah', 'di yogyakarta', 'dki jakarta', 'banten'];
  if (p.includes('jawa timur')) {
    if (k.includes('pasuruan')) return 3;
    return 5;
  }
  if (PROVINSI_JAWA.some(j => p.includes(j))) return 7;
  return 10;
};

/* ── helper: auto-confirm order yang statusnya Dikirim & sudah lewat tenggat ── */
const checkAutoConfirm = async () => {
  try {
    const [dikirim] = await db.query(
      `SELECT id, shipped_at, shipping_province, shipping_city
       FROM orders WHERE status = 'Dikirim' AND shipped_at IS NOT NULL AND has_komplain = 0`
    );
    const now = new Date();
    for (const o of dikirim) {
      const days = getAutoConfirmDays(o.shipping_province, o.shipping_city);
      const deadline = new Date(o.shipped_at);
      deadline.setDate(deadline.getDate() + days);
      if (now >= deadline) {
        await db.query(
          "UPDATE orders SET status = 'Selesai', received_at = NOW() WHERE id = ?",
          [o.id]
        );
        await sendNotification(null, o.id, 'Selesai (otomatis)');
      }
    }
  } catch (err) {
    console.error('checkAutoConfirm error:', err);
  }
};

// CREATE order baru
const createOrder = async (req, res) => {
  const { items, shipping_address, shipping_province, shipping_city, note, shipping_cost = 0, voucher_code } = req.body;
  const user_id = req.user.id;

  if (!items || items.length === 0 || !shipping_address) {
    return res.status(400).json({ message: 'Item dan alamat pengiriman wajib diisi' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let subtotal = 0;
    for (const item of items) {
      const [products] = await conn.query('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (products.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: `Produk ID ${item.product_id} tidak ditemukan` });
      }
      const product = products[0];
      if (product.stock < item.quantity) {
        await conn.rollback();
        return res.status(400).json({ message: `Stok ${product.name} tidak mencukupi` });
      }
      subtotal += product.price * item.quantity;
    }

    let discount_amount = 0;
    if (voucher_code) {
      const [vouchers] = await conn.query(
        `SELECT * FROM vouchers
         WHERE kode = ?
           AND aktif = 1
           AND (min_belanja IS NULL OR min_belanja <= ?)
           AND (expired_at IS NULL OR expired_at >= NOW())
           AND (kuota IS NULL OR kuota > 0)`,
        [voucher_code, subtotal]
      );
      if (vouchers.length === 0) {
        await conn.rollback();
        return res.status(400).json({ message: 'Kode voucher tidak valid atau sudah tidak berlaku' });
      }
      const v = vouchers[0];
      discount_amount = v.tipe === 'persentase'
        ? Math.round(subtotal * v.nilai / 100)
        : Number(v.nilai);
      discount_amount = Math.min(discount_amount, subtotal);
      await conn.query('UPDATE vouchers SET kuota = kuota - 1 WHERE id = ?', [v.id]);
    }

    const ongkir      = parseInt(shipping_cost) || 0;
    const total_price = subtotal + ongkir - discount_amount;

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (user_id, subtotal, shipping_cost, discount_amount, voucher_code, total_price, shipping_address, shipping_province, shipping_city, note)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [user_id, subtotal, ongkir, discount_amount, voucher_code || null, total_price, shipping_address, shipping_province || null, shipping_city || null, note || null]
    );
    const order_id = orderResult.insertId;

    for (const item of items) {
      const [products] = await conn.query('SELECT price FROM products WHERE id = ?', [item.product_id]);
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)',
        [order_id, item.product_id, item.quantity, products[0].price]
      );
      await conn.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    const today   = new Date();
    const yy      = String(today.getFullYear()).slice(2);
    const mm      = String(today.getMonth() + 1).padStart(2, '0');
    const dd      = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yy}-${mm}-${dd}`;

    const [countResult] = await conn.query(
      `SELECT COUNT(*) as cnt FROM orders
       WHERE DATE(created_at) = CURDATE()
         AND invoice_number LIKE ? FOR UPDATE`,
      [`INV-${dateStr}-%`]
    );
    const urutan         = String(countResult[0].cnt + 1).padStart(3, '0');
    const invoice_number = `INV-${dateStr}-${urutan}`;

    await conn.query('UPDATE orders SET invoice_number = ? WHERE id = ?', [invoice_number, order_id]);

    await conn.commit();
    res.status(201).json({
      message: 'Pesanan berhasil dibuat',
      order_id,
      invoice_number,
      subtotal,
      shipping_cost: ongkir,
      discount_amount,
      total_price,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET semua order (admin)
const getAllOrders = async (req, res) => {
  try {
    await checkAutoConfirm();

    const { status, date_from, date_to } = req.query;
    let query = `
      SELECT o.*, u.name as customer_name, u.email, u.phone
      FROM orders o JOIN users u ON o.user_id = u.id WHERE 1=1
    `;
    const params = [];

    if (status) {
      const statusList = status.split(',').map(s => s.trim());
      if (statusList.length === 1) {
        query += ' AND o.status = ?';
        params.push(statusList[0]);
      } else {
        query += ` AND o.status IN (${statusList.map(() => '?').join(',')})`;
        params.push(...statusList);
      }
    }

    if (date_from) { query += ' AND DATE(o.created_at) >= ?'; params.push(date_from); }
    if (date_to)   { query += ' AND DATE(o.created_at) <= ?'; params.push(date_to); }

    query += ' ORDER BY o.created_at DESC';
    const [orders] = await db.query(query, params);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET order milik pelanggan sendiri
// GET order milik pelanggan sendiri
const getMyOrders = async (req, res) => {
  try {
    await checkAutoConfirm();

    const [orders] = await db.query(
      `SELECT o.*,
              p.status        as payment_status,
              p.proof_image,
              p.reject_reason,
              p.refund_bank,
              p.refund_rekening,
              p.refund_atas_nama,
              p.refund_proof,
              p.refund_status
      FROM orders o
      LEFT JOIN payments p ON p.order_id = o.id
        AND p.id = (
          SELECT id FROM payments
          WHERE order_id = o.id
          ORDER BY created_at DESC
          LIMIT 1
        )
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    for (const order of orders) {
      const [items] = await db.query(
        `SELECT oi.*,
                pr.name as product_name,
                pi1.filename as image_1,
                pi2.filename as image_2,
                pi3.filename as image_3,
                pi4.filename as image_4
        FROM order_items oi
        JOIN products pr ON oi.product_id = pr.id
        LEFT JOIN product_images pi1 ON pi1.product_id = pr.id AND pi1.slot = 1
        LEFT JOIN product_images pi2 ON pi2.product_id = pr.id AND pi2.slot = 2
        LEFT JOIN product_images pi3 ON pi3.product_id = pr.id AND pi3.slot = 3
        LEFT JOIN product_images pi4 ON pi4.product_id = pr.id AND pi4.slot = 4
        WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET detail order by ID
const getOrderById = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, u.name as customer_name, u.email, u.phone
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (orders.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const order = orders[0];
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Akses ditolak' });
    }

    const [items] = await db.query(
      `SELECT oi.*,
              pr.name as product_name,
              pi1.filename as image_1
       FROM order_items oi
       JOIN products pr ON oi.product_id = pr.id
       LEFT JOIN product_images pi1 ON pi1.product_id = pr.id AND pi1.slot = 1
       WHERE oi.order_id = ?`,
      [req.params.id]
    );

    const [payments] = await db.query('SELECT * FROM payments WHERE order_id = ?', [req.params.id]);
    res.json({ ...order, items, payment: payments[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE status order (admin)
const updateOrderStatus = async (req, res) => {
  const { status, kurir, no_resi } = req.body; // ← tambah kurir & no_resi
  const validStatus = ['Menunggu Pembayaran','Menunggu Konfirmasi','Diproses','Dikirim','Selesai','Dibatalkan'];

  if (!validStatus.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  // Kalau status Dikirim, kurir dan no_resi wajib diisi
  if (status === 'Dikirim' && (!kurir || !no_resi)) {
    return res.status(400).json({ message: 'Nama kurir dan nomor resi wajib diisi untuk status Dikirim' });
  }

  try {
    const [existing] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    if (existing[0].status === 'Dibatalkan') {
      return res.status(400).json({ message: 'Pesanan yang sudah dibatalkan tidak dapat diubah statusnya' });
    }

    if (status === 'Dikirim') {
    await db.query(
      'UPDATE orders SET status = ?, kurir = ?, no_resi = ?, shipped_at = NOW() WHERE id = ?',
      [status, kurir.trim(), no_resi.trim(), req.params.id]
    );
    } else {
      await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);}

    // Kirim notifikasi — sertakan info resi kalau status Dikirim
    const notifMessage = status === 'Dikirim'
      ? `Dikirim|${kurir.trim()}|${no_resi.trim()}` // format khusus, parse di notificationController kalau perlu
      : status;

    await sendNotification(existing[0].user_id, req.params.id, notifMessage);

    res.json({ message: 'Status pesanan diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// CANCEL order oleh customer
const cancelOrder = async (req, res) => {
  const { reason, needs_refund } = req.body;
  const order_id = req.params.id;
  const user_id  = req.user.id;

  if (!reason) return res.status(400).json({ message: 'Alasan pembatalan wajib diisi' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(
      `SELECT o.*, p.id as payment_id
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
         AND p.id = (SELECT id FROM payments WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1)
       WHERE o.id = ? AND o.user_id = ?`,
      [order_id, user_id]
    );

    if (orders.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    const order = orders[0];
    const cancellable = ['Menunggu Pembayaran'];
    if (!cancellable.includes(order.status)) {
      await conn.rollback();
      return res.status(400).json({ message: 'Pesanan tidak dapat dibatalkan pada status ini' });
    }

    await conn.query(
      'UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?',
      ['Dibatalkan', reason, order_id]
    );

    const [items] = await conn.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?', [order_id]
    );
    for (const item of items) {
      await conn.query(
        'UPDATE products SET stock = stock + ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    if (needs_refund && order.payment_id) {
      const [users] = await conn.query(
        'SELECT bank_name, bank_account_number, bank_account_name FROM users WHERE id = ?',
        [user_id]
      );
      const u = users[0];

      await conn.query(
        `UPDATE payments SET
           status           = 'Ditolak',
           reject_reason    = ?,
           refund_status    = 'Menunggu Konfirmasi Super Admin',
           refund_bank      = ?,
           refund_rekening  = ?,
           refund_atas_nama = ?
         WHERE id = ?`,
        [
          `Dibatalkan oleh customer: ${reason}`,
          u?.bank_name || null,
          u?.bank_account_number || null,
          u?.bank_account_name || null,
          order.payment_id,
        ]
      );
    }

    await conn.commit();
    res.json({ message: 'Pesanan berhasil dibatalkan' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

// CONFIRM received — oleh customer
const confirmReceived = async (req, res) => {
  const order_id = req.params.id;
  const user_id  = req.user.id;

  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [order_id, user_id]
    );

    if (orders.length === 0)
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    if (orders[0].status !== 'Dikirim')
      return res.status(400).json({ message: 'Pesanan belum berstatus Dikirim' });

    await db.query(
      'UPDATE orders SET status = ?, received_at = NOW() WHERE id = ?',
      ['Selesai', order_id]
    );

    await sendNotification(user_id, order_id, 'Selesai');

    res.json({ message: 'Pesanan dikonfirmasi selesai' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// SUBMIT KOMPLAIN — oleh customer (status harus Dikirim)
const submitKomplain = async (req, res) => {
  const order_id = req.params.id;
  const user_id  = req.user.id;
  const { reason } = req.body;
  const foto = req.file?.path || null;

  if (!reason) return res.status(400).json({ message: 'Alasan komplain wajib diisi' });

  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [order_id, user_id]
    );
    if (orders.length === 0)
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const order = orders[0];
    if (order.status !== 'Dikirim')
      return res.status(400).json({ message: 'Komplain hanya bisa diajukan untuk pesanan berstatus Dikirim' });

    if (order.has_komplain)
      return res.status(400).json({ message: 'Pesanan ini sudah memiliki komplain yang sedang diproses' });

    await db.query(
      `UPDATE orders SET
        has_komplain    = 1,
        komplain_reason = ?,
        komplain_foto   = ?,
        komplain_at     = NOW(),
        komplain_status = 'Menunggu'
       WHERE id = ?`,
      [reason, foto, order_id]
    );

    // Notifikasi ke admin (pakai user_id null, biar semua admin bisa lihat — sesuaikan kalau sistem notif kamu beda)
    await db.query(
      `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
      [user_id, order_id, 'Komplain terkirim',
        `Komplain untuk pesanan #${String(order_id).padStart(4, '0')} sudah kami terima dan akan segera diproses.`,
        'Menunggu']
    );

    res.json({ message: 'Komplain berhasil dikirim, tim kami akan segera menindaklanjuti' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET semua komplain — admin
const getAllKomplain = async (req, res) => {
  try {
    const { status } = req.query; // Menunggu | Diproses | Selesai
    let query = `
      SELECT o.*, u.name as customer_name, u.email, u.phone
      FROM orders o JOIN users u ON o.user_id = u.id
      WHERE o.has_komplain = 1
    `;
    const params = [];
    if (status) { query += ' AND o.komplain_status = ?'; params.push(status); }
    query += ' ORDER BY o.komplain_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// RESOLVE komplain — admin
const resolveKomplain = async (req, res) => {
  const order_id = req.params.id;
  const { action, catatan } = req.body;

  if (!['refund', 'kirim_ulang', 'tolak'].includes(action))
    return res.status(400).json({ message: 'Aksi tidak valid' });

  try {
    const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    const order = orders[0];

    if (!order.has_komplain)
      return res.status(400).json({ message: 'Pesanan ini tidak memiliki komplain' });

    if (action === 'refund') {
      const [users] = await db.query(
        'SELECT bank_name, bank_account_number, bank_account_name FROM users WHERE id = ?',
        [order.user_id]
      );
      const u = users[0];
      const refund_bank      = u?.bank_name           || null;
      const refund_rekening  = u?.bank_account_number || null;
      const refund_atas_nama = u?.bank_account_name   || null;
      const refund_status = refund_rekening ? 'Menunggu Konfirmasi Super Admin' : 'Menunggu Rekening';

      await db.query(
        `UPDATE payments SET
          refund_bank = ?, refund_rekening = ?, refund_atas_nama = ?, refund_status = ?
         WHERE order_id = ?`,
        [refund_bank, refund_rekening, refund_atas_nama, refund_status, order_id]
      );

      await db.query(
        "UPDATE orders SET status = 'Dibatalkan', cancel_reason = ?, komplain_status = 'Selesai' WHERE id = ?",
        [`Komplain: ${order.komplain_reason}`, order_id]
      );

      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [order.user_id, order_id, 'Komplain disetujui — refund diproses',
          catatan || 'Komplain kamu disetujui, refund sedang diproses tim kami.', 'Menunggu']
      );

    } else if (action === 'kirim_ulang') {
      await db.query(
        "UPDATE orders SET komplain_status = 'Selesai', has_komplain = 0 WHERE id = ?",
        [order_id]
      );
      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [order.user_id, order_id, 'Komplain diproses — barang dikirim ulang',
          catatan || 'Tim kami akan mengirim ulang pesanan kamu.', 'Menunggu']
      );

    } else { // tolak
      await db.query(
        "UPDATE orders SET komplain_status = 'Selesai', has_komplain = 0 WHERE id = ?",
        [order_id]
      );
      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [order.user_id, order_id, 'Komplain ditolak',
          catatan || 'Setelah ditinjau, komplain kamu tidak dapat kami proses.', 'Menunggu']
      );
    }

    res.json({ message: 'Komplain berhasil ditindaklanjuti' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
module.exports = {
  createOrder, getAllOrders, getMyOrders, getOrderById, updateOrderStatus, cancelOrder, confirmReceived,
  submitKomplain, getAllKomplain, resolveKomplain,
};