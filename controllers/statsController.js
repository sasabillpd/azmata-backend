const db = require('../config/db');

const getPublicStats = async (req, res) => {
  try {
    // Total pesanan selesai
    const [[orderRow]] = await db.query(
      `SELECT COUNT(*) as total FROM orders WHERE status = 'Selesai'`
    );

    // Total produk aktif (stok > 0)
    const [[productRow]] = await db.query(
      `SELECT COUNT(*) as total FROM products`
    );

    // Rata-rata rating global
    const [[ratingRow]] = await db.query(
      `SELECT ROUND(AVG(rating), 1) as average, COUNT(*) as total FROM reviews`
    );

    res.json({
      orders_completed: orderRow.total,
      products_total:   productRow.total,
      rating_average:   ratingRow.average ?? 0,
      rating_count:     ratingRow.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getPublicStats };