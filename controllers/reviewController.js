const db = require('../config/db');

// GET reviews by product_id
const getProductReviews = async (req, res) => {
  try {
    const [reviews] = await db.query(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.name as user_name, u.avatar as user_avatar
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.product_id]
    );

    const [stats] = await db.query(
      `SELECT 
        COUNT(*) as total,
        ROUND(AVG(rating), 1) as average,
        SUM(rating = 5) as star5,
        SUM(rating = 4) as star4,
        SUM(rating = 3) as star3,
        SUM(rating = 2) as star2,
        SUM(rating = 1) as star1
       FROM reviews WHERE product_id = ?`,
      [req.params.product_id]
    );

    res.json({ stats: stats[0], reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET top reviews bintang 5 terbaru (untuk landing page)
const getTopReviews = async (req, res) => {
  try {
    const [reviews] = await db.query(
      `SELECT r.comment, r.rating, r.created_at,
              u.name AS user_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.rating = 5
         AND r.comment IS NOT NULL
         AND r.comment != ''
       ORDER BY r.created_at DESC
       LIMIT 3`
    );

    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST review (hanya untuk order yang sudah Selesai)
const createReview = async (req, res) => {
  const { product_id, order_id, rating, comment } = req.body;
  const user_id = req.user.id;

  if (!product_id || !order_id || !rating) {
    return res.status(400).json({ message: 'product_id, order_id, dan rating wajib diisi' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating harus antara 1 dan 5' });
  }

  try {
    // Validasi: order harus milik user dan statusnya Selesai
    const [orders] = await db.query(
      `SELECT o.id FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = ? AND o.user_id = ? AND o.status = 'Selesai' AND oi.product_id = ?`,
      [order_id, user_id, product_id]
    );
    if (orders.length === 0) {
      return res.status(403).json({ message: 'Kamu hanya bisa mereview produk yang sudah dibeli dan selesai' });
    }

    // Cek duplikat
    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE user_id = ? AND product_id = ? AND order_id = ?',
      [user_id, product_id, order_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Kamu sudah memberikan review untuk produk ini' });
    }

    await db.query(
      'INSERT INTO reviews (user_id, product_id, order_id, rating, comment) VALUES (?,?,?,?,?)',
      [user_id, product_id, order_id, rating, comment || null]
    );

    res.status(201).json({ message: 'Review berhasil dikirim' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// CEK apakah user sudah review produk ini (dari order tertentu)
const checkReview = async (req, res) => {
  const user_id = req.user.id;
  const { product_id } = req.params;
  try {
    // Ambil order Selesai yang mengandung produk ini milik user
    const [orders] = await db.query(
      `SELECT o.id as order_id FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ? AND o.status = 'Selesai' AND oi.product_id = ?`,
      [user_id, product_id]
    );

    if (orders.length === 0) {
      return res.json({ can_review: false, order_id: null, already_reviewed: false });
    }

    // Cek apakah sudah pernah review di salah satu order itu
    const orderIds = orders.map(o => o.order_id);
    const [reviewed] = await db.query(
      `SELECT id FROM reviews WHERE user_id = ? AND product_id = ? AND order_id IN (${orderIds.map(() => '?').join(',')})`,
      [user_id, product_id, ...orderIds]
    );

    res.json({
      can_review: reviewed.length === 0,
      order_id: orders[0].order_id,
      already_reviewed: reviewed.length > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getProductReviews, getTopReviews, createReview, checkReview };