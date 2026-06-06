const db = require('../config/db');
const { sendVoucherNotification } = require('./notificationController');

/* ── helper: konversi ISO date ke format MySQL YYYY-MM-DD ── */
const toMysqlDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : null;

/* ══════════════════════════════════════════
   GET /vouchers
   Admin: semua voucher
   User: hanya yang aktif & tampil_publik
         khusus_baru hanya untuk yang belum pernah order
══════════════════════════════════════════ */
exports.getAllVouchers = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const userId  = req.user?.id;

    const query = isAdmin
      ? `SELECT v.*,
           (v.kuota - COALESCE((SELECT COUNT(*) FROM orders o WHERE o.voucher_id = v.id AND o.status != 'Dibatalkan'), 0)) AS sisa_kuota
         FROM vouchers v ORDER BY v.created_at DESC`
      : `SELECT v.id, v.kode, v.tipe, v.nilai, v.min_belanja, v.kuota, v.expired_at,
           v.max_diskon, v.jam_mulai, v.jam_selesai, v.hari_berlaku, v.kategori_produk, v.khusus_baru,
           (v.kuota - COALESCE((SELECT COUNT(*) FROM orders o WHERE o.voucher_id = v.id AND o.status != 'Dibatalkan'), 0)) AS sisa_kuota
         FROM vouchers v
         WHERE v.aktif = 1
           AND v.tampil_publik = 1
           AND (v.expired_at IS NULL OR v.expired_at > NOW())
           AND (v.kuota IS NULL OR (
             v.kuota - COALESCE((SELECT COUNT(*) FROM orders o WHERE o.voucher_id = v.id AND o.status != 'Dibatalkan'), 0) > 0
           ))
           AND (
             v.khusus_baru = 0
             OR NOT EXISTS (
               SELECT 1 FROM orders o2
               WHERE o2.user_id = ? AND o2.status != 'Dibatalkan'
             )
           )
         ORDER BY v.created_at DESC`;

    const [rows] = await db.query(query, isAdmin ? [] : [userId]);
    res.json(rows);
  } catch (err) {
    console.error('getAllVouchers:', err);
    res.status(500).json({ message: 'Gagal mengambil data voucher' });
  }
};

/* ══════════════════════════════════════════
   POST /vouchers/validate
   Body: { kode, total_belanja }
══════════════════════════════════════════ */
exports.validateVoucher = async (req, res) => {
  const { kode, total_belanja } = req.body;
  const userId = req.user?.id;

  if (!kode) return res.status(400).json({ message: 'Kode voucher wajib diisi' });

  try {
    const [rows] = await db.query(
      `SELECT v.*,
         (v.kuota - COALESCE((SELECT COUNT(*) FROM orders o WHERE o.voucher_id = v.id AND o.status != 'Dibatalkan'), 0)) AS sisa_kuota
       FROM vouchers v WHERE v.kode = ?`,
      [kode.toUpperCase()]
    );

    if (!rows.length) return res.status(404).json({ message: 'Kode voucher tidak ditemukan' });

    const v = rows[0];

    if (!v.aktif)
      return res.status(400).json({ message: 'Voucher tidak aktif' });
    if (v.expired_at && new Date(v.expired_at) < new Date())
      return res.status(400).json({ message: 'Voucher sudah kedaluwarsa' });
    if (v.kuota !== null && v.sisa_kuota <= 0)
      return res.status(400).json({ message: 'Kuota voucher sudah habis' });

    const belanja = Number(total_belanja || 0);
    if (v.min_belanja && belanja < Number(v.min_belanja))
      return res.status(400).json({
        message: `Minimum belanja Rp ${Number(v.min_belanja).toLocaleString('id-ID')} untuk menggunakan voucher ini`,
      });

    if (v.jam_mulai && v.jam_selesai) {
      const now          = new Date();
      const [hMul, mMul] = v.jam_mulai.split(':').map(Number);
      const [hSel, mSel] = v.jam_selesai.split(':').map(Number);
      const totalMenit   = now.getHours() * 60 + now.getMinutes();
      const mulaiMenit   = hMul * 60 + mMul;
      const selesaiMenit = hSel * 60 + mSel;
      const inRange = mulaiMenit <= selesaiMenit
        ? totalMenit >= mulaiMenit && totalMenit <= selesaiMenit
        : totalMenit >= mulaiMenit || totalMenit <= selesaiMenit;
      if (!inRange)
        return res.status(400).json({
          message: `Voucher ini hanya berlaku pukul ${v.jam_mulai.slice(0,5)}–${v.jam_selesai.slice(0,5)}`,
        });
    }

    if (v.hari_berlaku) {
      const HARI        = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'];
      const hariIni     = HARI[new Date().getDay()];
      const hariBerlaku = v.hari_berlaku.split(',').map(h => h.trim().toLowerCase());
      if (!hariBerlaku.includes(hariIni))
        return res.status(400).json({
          message: `Voucher ini hanya berlaku pada hari: ${v.hari_berlaku}`,
        });
    }

    if (v.khusus_baru && userId) {
      const [history] = await db.query(
        `SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ? AND status != 'Dibatalkan'`,
        [userId]
      );
      if (history[0].cnt > 0)
        return res.status(400).json({ message: 'Voucher ini hanya untuk pembeli pertama kali' });
    }

    let diskon = v.tipe === 'persentase'
      ? Math.round(belanja * (Number(v.nilai) / 100))
      : Number(v.nilai);
    if (v.max_diskon && diskon > Number(v.max_diskon)) diskon = Number(v.max_diskon);
    diskon = Math.min(diskon, belanja);

    res.json({
      valid: true,
      voucher_id: v.id,
      kode: v.kode,
      tipe: v.tipe,
      nilai: v.nilai,
      max_diskon: v.max_diskon || null,
      diskon,
      message: `Voucher berhasil diterapkan! Hemat Rp ${Number(diskon).toLocaleString('id-ID')}`,
    });
  } catch (err) {
    console.error('validateVoucher:', err);
    res.status(500).json({ message: 'Gagal memvalidasi voucher' });
  }
};

/* ══════════════════════════════════════════
   POST /vouchers  (super_admin only)
══════════════════════════════════════════ */
exports.createVoucher = async (req, res) => {
  const {
    kode, tipe, nilai, min_belanja, kuota, expired_at, aktif, tampil_publik,
    max_diskon, jam_mulai, jam_selesai, hari_berlaku, kategori_produk, khusus_baru,
  } = req.body;

  if (!kode || !tipe || !nilai)
    return res.status(400).json({ message: 'Kode, tipe, dan nilai wajib diisi' });
  if (!['persentase', 'nominal'].includes(tipe))
    return res.status(400).json({ message: 'Tipe harus persentase atau nominal' });
  if (tipe === 'persentase' && (Number(nilai) <= 0 || Number(nilai) > 100))
    return res.status(400).json({ message: 'Persentase harus antara 1–100' });
  if (jam_mulai && !jam_selesai)
    return res.status(400).json({ message: 'Jam selesai wajib diisi jika jam mulai diisi' });
  if (jam_selesai && !jam_mulai)
    return res.status(400).json({ message: 'Jam mulai wajib diisi jika jam selesai diisi' });

  try {
    const [exist] = await db.query('SELECT id FROM vouchers WHERE kode = ?', [kode.toUpperCase()]);
    if (exist.length) return res.status(409).json({ message: 'Kode voucher sudah digunakan' });

    const isAktif  = aktif        !== undefined ? (aktif        ? 1 : 0) : 1;
    const isPublik = tampil_publik ? 1 : 0;
    const isBaru   = khusus_baru  ? 1 : 0;

    const [result] = await db.query(
      `INSERT INTO vouchers
         (kode, tipe, nilai, min_belanja, kuota, expired_at, aktif, tampil_publik,
          max_diskon, jam_mulai, jam_selesai, hari_berlaku, kategori_produk, khusus_baru)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kode.toUpperCase(), tipe, Number(nilai),
        min_belanja     ? Number(min_belanja)  : null,
        kuota           ? Number(kuota)        : null,
        toMysqlDate(expired_at),
        isAktif, isPublik,
        max_diskon      ? Number(max_diskon)   : null,
        jam_mulai       || null,
        jam_selesai     || null,
        hari_berlaku    || null,
        kategori_produk || null,
        isBaru,
      ]
    );

    if (isAktif && isPublik) {
      await sendVoucherNotification({
        kode: kode.toUpperCase(), tipe, nilai: Number(nilai),
        min_belanja: min_belanja ? Number(min_belanja) : 0,
        expired_at: expired_at || null,
        khusus_baru: isBaru,
      });
    }

    res.status(201).json({ message: 'Voucher berhasil dibuat', id: result.insertId });
  } catch (err) {
    console.error('createVoucher:', err);
    res.status(500).json({ message: 'Gagal membuat voucher' });
  }
};

/* ══════════════════════════════════════════
   PUT /vouchers/:id  (super_admin only)
══════════════════════════════════════════ */
exports.updateVoucher = async (req, res) => {
  const { id } = req.params;
  const {
    kode, tipe, nilai, min_belanja, kuota, expired_at, aktif, tampil_publik,
    max_diskon, jam_mulai, jam_selesai, hari_berlaku, kategori_produk, khusus_baru,
  } = req.body;

  try {
    const [exist] = await db.query('SELECT id FROM vouchers WHERE id = ?', [id]);
    if (!exist.length) return res.status(404).json({ message: 'Voucher tidak ditemukan' });

    if (kode) {
      const [dup] = await db.query('SELECT id FROM vouchers WHERE kode = ? AND id != ?', [kode.toUpperCase(), id]);
      if (dup.length) return res.status(409).json({ message: 'Kode voucher sudah digunakan' });
    }

    await db.query(
      `UPDATE vouchers SET
        kode            = COALESCE(?, kode),
        tipe            = COALESCE(?, tipe),
        nilai           = COALESCE(?, nilai),
        min_belanja     = ?,
        kuota           = ?,
        expired_at      = ?,
        aktif           = COALESCE(?, aktif),
        tampil_publik   = COALESCE(?, tampil_publik),
        max_diskon      = ?,
        jam_mulai       = ?,
        jam_selesai     = ?,
        hari_berlaku    = ?,
        kategori_produk = ?,
        khusus_baru     = COALESCE(?, khusus_baru)
       WHERE id = ?`,
      [
        kode            ? kode.toUpperCase()                                      : null,
        tipe            || null,
        nilai           !== undefined ? Number(nilai)                             : null,
        min_belanja     !== undefined ? (min_belanja    ? Number(min_belanja)     : null) : undefined,
        kuota           !== undefined ? (kuota          ? Number(kuota)           : null) : undefined,
        expired_at      !== undefined ? toMysqlDate(expired_at)                  : undefined,
        aktif           !== undefined ? (aktif          ? 1 : 0)                 : null,
        tampil_publik   !== undefined ? (tampil_publik  ? 1 : 0)                 : null,
        max_diskon      !== undefined ? (max_diskon     ? Number(max_diskon)      : null) : undefined,
        jam_mulai       !== undefined ? (jam_mulai      || null)                  : undefined,
        jam_selesai     !== undefined ? (jam_selesai    || null)                  : undefined,
        hari_berlaku    !== undefined ? (hari_berlaku   || null)                  : undefined,
        kategori_produk !== undefined ? (kategori_produk || null)                 : undefined,
        khusus_baru     !== undefined ? (khusus_baru    ? 1 : 0)                 : null,
        id,
      ]
    );

    res.json({ message: 'Voucher berhasil diperbarui' });
  } catch (err) {
    console.error('updateVoucher:', err);
    res.status(500).json({ message: 'Gagal memperbarui voucher' });
  }
};

/* ══════════════════════════════════════════
   DELETE /vouchers/:id  (super_admin only)
══════════════════════════════════════════ */
exports.deleteVoucher = async (req, res) => {
  const { id } = req.params;
  try {
    const [exist] = await db.query('SELECT id FROM vouchers WHERE id = ?', [id]);
    if (!exist.length) return res.status(404).json({ message: 'Voucher tidak ditemukan' });

    const [used] = await db.query(
      `SELECT COUNT(*) AS cnt FROM orders WHERE voucher_id = ? AND status != 'Dibatalkan'`, [id]
    );
    if (used[0].cnt > 0)
      return res.status(400).json({
        message: 'Voucher sudah pernah digunakan dan tidak bisa dihapus. Nonaktifkan saja.',
      });

    await db.query('DELETE FROM vouchers WHERE id = ?', [id]);
    res.json({ message: 'Voucher berhasil dihapus' });
  } catch (err) {
    console.error('deleteVoucher:', err);
    res.status(500).json({ message: 'Gagal menghapus voucher' });
  }
};