const db = require('../config/db');

// GET notifikasi milik user yang login
const getMyNotifications = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PUT mark all as read
const markAllRead = async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ message: 'Semua notifikasi ditandai sudah dibaca' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper: kirim notifikasi order (dipanggil dari orderController)
const sendNotification = async (user_id, order_id, status) => {
  const messages = {
    'Menunggu Konfirmasi': { title: 'Pembayaran diterima',    message: 'Bukti pembayaranmu sedang diverifikasi oleh admin.' },
    'Diproses':            { title: 'Pesanan diproses',       message: 'Pembayaranmu dikonfirmasi! Pesananmu sedang disiapkan.' },
    'Dikirim':             { title: 'Pesanan dikirim 🚚',     message: 'Pesananmu sudah dalam perjalanan menuju alamatmu.' },
    'Selesai':             { title: 'Pesanan selesai ✅',     message: 'Pesananmu telah selesai. Terima kasih sudah belanja di Azmata Cookies!' },
    'Dibatalkan':          { title: 'Pesanan dibatalkan',     message: 'Pesananmu telah dibatalkan. Hubungi kami jika ada pertanyaan.' },
    'Menunggu Pembayaran': { title: 'Pembayaran ditolak',     message: 'Bukti pembayaranmu ditolak. Silakan upload ulang bukti transfer yang valid.' },
  };

  const notif = messages[status];
  if (!notif) return;

  try {
    await db.query(
      `INSERT INTO notifications (user_id, order_id, title, message, status)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, order_id, notif.title, notif.message, status]
    );
  } catch (err) {
    console.error('Gagal kirim notifikasi:', err);
  }
};

// Helper: kirim notifikasi voucher baru ke user yang relevan
// - voucher biasa   → semua user
// - khusus_baru = 1 → hanya user yang belum pernah order
const sendVoucherNotification = async (voucher) => {
  try {
    const userQuery = voucher.khusus_baru
      ? `SELECT id FROM users
         WHERE role = 'user'
           AND NOT EXISTS (
             SELECT 1 FROM orders o
             WHERE o.user_id = users.id AND o.status != 'Dibatalkan'
           )`
      : `SELECT id FROM users WHERE role = 'user'`;

    const [users] = await db.query(userQuery);
    if (!users.length) return;

    const nilaiText = voucher.tipe === 'persentase'
      ? `${voucher.nilai}%`
      : 'Rp ' + Number(voucher.nilai).toLocaleString('id-ID');

    const minText = voucher.min_belanja > 0
      ? ` dengan minimum belanja Rp ${Number(voucher.min_belanja).toLocaleString('id-ID')}`
      : '';

    const expText = voucher.expired_at
      ? ` Berlaku hingga ${new Date(voucher.expired_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : '';

    const baruText = voucher.khusus_baru ? ' Khusus pembeli pertama!' : '';

    const title   = `🎟️ Voucher baru: ${voucher.kode}`;
    const message = `Dapatkan diskon ${nilaiText}${minText} menggunakan kode ${voucher.kode}.${expText}${baruText} Gunakan sekarang di checkout!`;

    const values = users.map(u => [u.id, null, title, message, 'voucher']);
    await db.query(
      `INSERT INTO notifications (user_id, order_id, title, message, status) VALUES ?`,
      [values]
    );

    console.log(`✅ Notifikasi voucher ${voucher.kode} dikirim ke ${users.length} user${voucher.khusus_baru ? ' (pembeli baru)' : ''}`);
  } catch (err) {
    console.error('Gagal kirim notifikasi voucher:', err);
  }
};

module.exports = { getMyNotifications, markAllRead, sendNotification, sendVoucherNotification };