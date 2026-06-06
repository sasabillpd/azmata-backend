const db = require('../config/db');
const cloudinary = require('cloudinary').v2;
const { sendNotification } = require('./notificationController');

const deleteFile = async (fileUrl) => {
  if (!fileUrl || !fileUrl.includes('cloudinary')) return;
  const publicId = fileUrl.split('/').pop().split('.')[0];
  await cloudinary.uploader.destroy(`azmata/${publicId}`);
};

const uploadPayment = async (req, res) => {
  const files = req.files?.length > 0 ? req.files : (req.file ? [req.file] : []);
  const order_id = req.params.id || req.body.order_id;

  if (!order_id || files.length === 0)
    return res.status(400).json({ message: 'Order ID dan bukti pembayaran wajib diisi' });

  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [order_id, req.user.id]
    );
    if (orders.length === 0)
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const [existing] = await db.query('SELECT * FROM payments WHERE order_id = ?', [order_id]);
    for (const old of existing) await deleteFile(old.proof_image);
    if (existing.length > 0)
      await db.query('DELETE FROM payments WHERE order_id = ?', [order_id]);

    for (const file of files) {
      await db.query(
        'INSERT INTO payments (order_id, proof_image, status) VALUES (?, ?, ?)',
        [order_id, file.path, 'Menunggu']
      );
    }

    await db.query("UPDATE orders SET status = 'Menunggu Konfirmasi' WHERE id = ?", [order_id]);
    await sendNotification(orders[0].user_id, order_id, 'Menunggu Konfirmasi');

    res.json({ message: 'Bukti pembayaran berhasil dikirim' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const confirmPayment = async (req, res) => {
  try {
    const [payments] = await db.query(
      'SELECT * FROM payments WHERE order_id = ?',
      [req.params.order_id]
    );
    if (payments.length === 0)
      return res.status(404).json({ message: 'Data pembayaran tidak ditemukan' });

    await db.query(
      "UPDATE payments SET status = 'Dikonfirmasi', confirmed_by = ?, confirmed_at = NOW() WHERE order_id = ?",
      [req.user.id, req.params.order_id]
    );
    await db.query("UPDATE orders SET status = 'Diproses' WHERE id = ?", [req.params.order_id]);

    const [orders] = await db.query('SELECT user_id FROM orders WHERE id = ?', [req.params.order_id]);
    if (orders.length > 0)
      await sendNotification(orders[0].user_id, req.params.order_id, 'Diproses');

    res.json({ message: 'Pembayaran dikonfirmasi, pesanan diproses' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const rejectPayment = async (req, res) => {
  const { reject_reason } = req.body;

  if (!reject_reason)
    return res.status(400).json({ message: 'Alasan penolakan wajib diisi' });

  try {
    const [orders] = await db.query(
      'SELECT user_id FROM orders WHERE id = ?',
      [req.params.order_id]
    );
    if (orders.length === 0)
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    const user_id = orders[0].user_id;

    const [users] = await db.query(
      'SELECT bank_name, bank_account_number, bank_account_name FROM users WHERE id = ?',
      [user_id]
    );
    const u = users[0];
    const refund_bank      = u?.bank_name           || null;
    const refund_rekening  = u?.bank_account_number || null;
    const refund_atas_nama = u?.bank_account_name   || null;

    const refund_status = refund_rekening
      ? 'Menunggu Konfirmasi Super Admin'
      : 'Menunggu Rekening';

    await db.query(
      `UPDATE payments SET
        status            = 'Ditolak',
        reject_reason     = ?,
        refund_bank       = ?,
        refund_rekening   = ?,
        refund_atas_nama  = ?,
        refund_status     = ?,
        refund_proof      = NULL,
        rejected_by       = ?,
        rejected_at       = NOW()
       WHERE order_id = ?`,
      [reject_reason, refund_bank, refund_rekening, refund_atas_nama, refund_status, req.user.id, req.params.order_id]
    );

    await db.query(
      "UPDATE orders SET status = 'Dibatalkan', cancel_reason = ? WHERE id = ?",
      [reject_reason, req.params.order_id]
    );

    if (refund_rekening) {
      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [user_id, req.params.order_id, 'Pembayaran ditolak — refund sedang diproses',
          `Pembayaran pesanan #${String(req.params.order_id).padStart(4, '0')} ditolak (${reject_reason}). Refund ke rekening ${refund_bank} ${refund_rekening} a.n. ${refund_atas_nama} sedang diproses.`,
          'Menunggu']
      );
    } else {
      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [user_id, req.params.order_id, 'Pembayaran ditolak — mohon lengkapi rekening bank',
          `Bukti pembayaran pesanan #${String(req.params.order_id).padStart(4, '0')} ditolak (${reject_reason}). Silakan lengkapi nomor rekening bank kamu di halaman profil.`,
          'Menunggu']
      );
    }

    res.json({ message: 'Pembayaran ditolak, pengajuan refund dikirim ke super admin', refund_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateRefundRekening = async (req, res) => {
  const { refund_bank, refund_rekening, refund_atas_nama } = req.body;
  const order_id = req.params.order_id;

  if (!refund_bank || !refund_rekening || !refund_atas_nama)
    return res.status(400).json({ message: 'Data rekening lengkap wajib diisi' });

  try {
    const [orders] = await db.query(
      "SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = 'Dibatalkan'",
      [order_id, req.user.id]
    );
    if (orders.length === 0)
      return res.status(404).json({ message: 'Pesanan tidak ditemukan atau tidak bisa diubah' });

    const [payments] = await db.query(
      "SELECT * FROM payments WHERE order_id = ? AND refund_status = 'Menunggu Rekening'",
      [order_id]
    );
    if (payments.length === 0)
      return res.status(400).json({ message: 'Pesanan ini tidak memerlukan pengisian rekening' });

    await db.query(
      `UPDATE payments SET refund_bank = ?, refund_rekening = ?, refund_atas_nama = ?, refund_status = 'Menunggu Konfirmasi Super Admin' WHERE order_id = ?`,
      [refund_bank, refund_rekening, refund_atas_nama, order_id]
    );

    await db.query(
      `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, order_id, 'Nomor rekening diterima',
        `Nomor rekening kamu untuk refund pesanan #${String(order_id).padStart(4, '0')} sudah kami terima.`,
        'Menunggu']
    );

    res.json({ message: 'Nomor rekening berhasil disimpan, refund akan segera diproses' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const confirmRefund = async (req, res) => {
  const order_id = req.params.order_id;
  const refund_proof = req.file?.path || null;
  const { pesan_penolakan } = req.body;

  if (!refund_proof && !pesan_penolakan)
    return res.status(400).json({ message: 'Upload bukti transfer atau isi pesan penolakan' });

  try {
    const [payments] = await db.query(
      "SELECT p.*, o.user_id FROM payments p JOIN orders o ON p.order_id = o.id WHERE p.order_id = ? AND p.refund_status = 'Menunggu Konfirmasi Super Admin'",
      [order_id]
    );
    if (payments.length === 0)
      return res.status(404).json({ message: 'Data refund tidak ditemukan atau sudah diproses' });

    const { user_id, refund_bank, refund_rekening, refund_atas_nama } = payments[0];

    if (refund_proof) {
      await deleteFile(payments[0].refund_proof);

      await db.query(
        `UPDATE payments SET refund_proof = ?, refund_status = 'Selesai', refund_confirmed_by = ?, refund_confirmed_at = NOW() WHERE order_id = ?`,
        [refund_proof, req.user.id, order_id]
      );

      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [user_id, order_id, 'Refund berhasil dikirim ✓',
          `Dana refund pesanan #${String(order_id).padStart(4, '0')} telah ditransfer ke rekening ${refund_bank} ${refund_rekening} a.n. ${refund_atas_nama}.`,
          'Selesai']
      );

      res.json({ message: 'Refund dikonfirmasi dan notifikasi dikirim ke customer' });
    } else {
      await db.query(
        `UPDATE payments SET refund_status = 'Ditolak', refund_confirmed_by = ?, refund_confirmed_at = NOW() WHERE order_id = ?`,
        [req.user.id, order_id]
      );

      await db.query(
        `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
        [user_id, order_id, 'Pengajuan refund ditolak', pesan_penolakan, 'Menunggu']
      );

      res.json({ message: 'Pesan penolakan refund dikirim ke customer' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getAllPayments = async (req, res) => {
  try {
    const { status, refund_status } = req.query;

    let query = `
      SELECT p.*,
             o.total_price, o.invoice_number, o.status as order_status,
             u.name as customer_name, u.email, u.phone,
             u.bank_name as u_bank_name,
             u.bank_account_number as u_bank_account_number,
             u.bank_account_name as u_bank_account_name,
             COALESCE(p.refund_bank, u.bank_name) as refund_bank,
             COALESCE(p.refund_rekening, u.bank_account_number) as refund_rekening,
             COALESCE(p.refund_atas_nama, u.bank_account_name) as refund_atas_nama
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (status)        { query += ' AND p.status = ?';        params.push(status); }
    if (refund_status) { query += ' AND p.refund_status = ?'; params.push(refund_status); }
    query += ' ORDER BY p.created_at DESC';

    const [payments] = await db.query(query, params);

    const needsUpgrade = payments.filter(p =>
      p.refund_status === 'Menunggu Rekening' && p.u_bank_account_number
    );
    if (needsUpgrade.length > 0) {
      await Promise.all(needsUpgrade.map(p =>
        db.query(
          `UPDATE payments SET refund_bank = ?, refund_rekening = ?, refund_atas_nama = ?, refund_status = 'Menunggu Konfirmasi Super Admin' WHERE order_id = ?`,
          [p.u_bank_name, p.u_bank_account_number, p.u_bank_account_name, p.order_id]
        )
      ));
      payments.forEach(p => {
        if (p.refund_status === 'Menunggu Rekening' && p.u_bank_account_number) {
          p.refund_status    = 'Menunggu Konfirmasi Super Admin';
          p.refund_bank      = p.u_bank_name;
          p.refund_rekening  = p.u_bank_account_number;
          p.refund_atas_nama = p.u_bank_account_name;
        }
      });
    }

    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getPaymentDetail = async (req, res) => {
  try {
    const [payments] = await db.query(
      `SELECT p.*, o.total_price, o.invoice_number, o.status as order_status,
              u.name as customer_name, u.email, u.phone,
              u.bank_name, u.bank_account_number, u.bank_account_name
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       JOIN users u ON o.user_id = u.id
       WHERE p.order_id = ?`,
      [req.params.order_id]
    );
    if (payments.length === 0)
      return res.status(404).json({ message: 'Data pembayaran tidak ditemukan' });
    res.json(payments[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  uploadPayment,
  confirmPayment,
  rejectPayment,
  updateRefundRekening,
  confirmRefund,
  getAllPayments,
  getPaymentDetail,
};