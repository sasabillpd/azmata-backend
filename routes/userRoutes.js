const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, adminOnly, superAdminOnly } = require('../middleware/authMiddleware');

// GET semua user — admin & super_admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, phone, address, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET user by ID — admin & super_admin
router.get('/:id', protect, adminOnly, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json(users[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH update role — hanya super_admin
router.patch('/:id/role', protect, superAdminOnly, async (req, res) => {
  const { role } = req.body;
  const allowedRoles = ['pelanggan', 'admin', 'super_admin'];

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Role tidak valid' });
  }

  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: 'Tidak bisa ubah role diri sendiri' });
  }

  try {
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'Role berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE user — hanya super_admin
router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: 'Tidak bisa hapus akun sendiri' });
  }

  try {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (users.length === 0 || users[0].role === 'super_admin') {
      return res.status(400).json({ message: 'User tidak ditemukan atau tidak bisa dihapus' });
    }

    const id = req.params.id;

    await db.query('DELETE FROM notifications WHERE user_id = ?', [id]);
    await db.query('DELETE FROM reviews WHERE user_id = ?', [id]);
    await db.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)', [id]);
    await db.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)', [id]);
    await db.query('DELETE FROM orders WHERE user_id = ?', [id]);
    await db.query('DELETE FROM addresses WHERE user_id = ?', [id]);
    await db.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;