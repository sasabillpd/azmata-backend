const db = require('../config/db');

// GET wishlist milik user
const getWishlist = async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT w.id, w.product_id, p.name, p.price, p.category_id,
              pi1.filename as image_1,
              pi2.filename as image_2,
              pi3.filename as image_3,
              pi4.filename as image_4
       FROM wishlists w
       JOIN products p ON w.product_id = p.id
       LEFT JOIN product_images pi1 ON pi1.product_id = p.id AND pi1.slot = 1
       LEFT JOIN product_images pi2 ON pi2.product_id = p.id AND pi2.slot = 2
       LEFT JOIN product_images pi3 ON pi3.product_id = p.id AND pi3.slot = 3
       LEFT JOIN product_images pi4 ON pi4.product_id = p.id AND pi4.slot = 4
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// TOGGLE wishlist (add kalau belum ada, delete kalau sudah ada)
const toggleWishlist = async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ message: 'product_id wajib diisi' });

  try {
    const [existing] = await db.query(
      'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
      [req.user.id, product_id]
    );

    if (existing.length > 0) {
      await db.query('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, product_id]);
      return res.json({ wished: false, message: 'Dihapus dari favorit' });
    } else {
      await db.query('INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)', [req.user.id, product_id]);
      return res.json({ wished: true, message: 'Ditambahkan ke favorit' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE wishlist by product_id
const removeWishlist = async (req, res) => {
  try {
    await db.query('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.product_id]);
    res.json({ message: 'Dihapus dari favorit' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// CEK apakah produk ada di wishlist
const checkWishlist = async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
      [req.user.id, req.params.product_id]
    );
    res.json({ wished: existing.length > 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getWishlist, toggleWishlist, removeWishlist, checkWishlist };