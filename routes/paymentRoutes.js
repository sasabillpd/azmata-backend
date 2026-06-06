const express = require('express');
const router = express.Router();
const db = require('../config/db');
const {
  confirmPayment, rejectPayment, getAllPayments, getPaymentDetail,
  uploadPayment, updateRefundRekening, confirmRefund
} = require('../controllers/paymentController');
const { protect, adminOnly, superAdminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.get('/',                          protect, adminOnly,      getAllPayments);
router.get('/:order_id',                 protect, adminOnly,      getPaymentDetail);
router.put('/:order_id/confirm',         protect, adminOnly,      confirmPayment);
router.put('/:order_id/reject',          protect, adminOnly,      upload.single('refund_proof'), rejectPayment);
router.put('/:order_id/confirm-refund',  protect, superAdminOnly, upload.single('refund_proof'), confirmRefund);
router.put('/:order_id/refund-rekening', protect,                 updateRefundRekening);

router.post('/:order_id/notif-rekening', protect, adminOnly, async (req, res) => {
  try {
    const [orders] = await db.query('SELECT user_id FROM orders WHERE id = ?', [req.params.order_id]);
    if (orders.length === 0) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });

    await db.query(
      `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES (?, ?, ?, ?, ?)`,
      [
        orders[0].user_id,
        req.params.order_id,
        'Mohon lengkapi nomor rekening',
        `Silakan isi nomor rekening bank kamu di halaman profil agar refund pesanan #${String(req.params.order_id).padStart(4, '0')} dapat segera diproses.`,
        'Menunggu',
      ]
    );
    res.json({ message: 'Notifikasi terkirim' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;