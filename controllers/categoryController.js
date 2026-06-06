const db = require('../config/db');

// GET semua kategori + jumlah produk
const getCategories = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, COUNT(p.id) as total
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getCategories };