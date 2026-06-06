const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// GET semua kategori
router.get('/', async (req, res) => {
  try {
    const [categories] = await db.query(`
      SELECT 
        c.id, 
        c.name, 
        c.description,
        COUNT(p.id) as total
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id, c.name, c.description
    `);

    res.json(categories);
  } catch (err) {
    console.error(err); // 🔥 WAJIB biar keliatan error asli
    res.status(500).json({ message: 'Server error' });
  }
});

// POST kategori baru (admin)
router.post('/', protect, adminOnly, async (req, res) => {
  const { name, description } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    res.status(201).json({ message: 'Kategori ditambahkan', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;