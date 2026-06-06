const db = require('../config/db');
const cloudinary = require('cloudinary').v2;

// GET semua produk
const getAllProducts = async (req, res) => {
  try {
    const { category, search, sort } = req.query;

    let query = `
      SELECT p.*, c.name as category_name,
        pi1.filename as image_1,
        pi2.filename as image_2,
        pi3.filename as image_3,
        pi4.filename as image_4
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images pi1 ON pi1.product_id = p.id AND pi1.slot = 1
      LEFT JOIN product_images pi2 ON pi2.product_id = p.id AND pi2.slot = 2
      LEFT JOIN product_images pi3 ON pi3.product_id = p.id AND pi3.slot = 3
      LEFT JOIN product_images pi4 ON pi4.product_id = p.id AND pi4.slot = 4
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND p.name LIKE ?';
      params.push(`%${search}%`);
    }

    if (category && category !== 'all') {
      query += ' AND p.category_id = ?';
      params.push(category);
    }

    if (sort === 'harga_asc') {
      query += ' ORDER BY p.price ASC';
    } else if (sort === 'harga_desc') {
      query += ' ORDER BY p.price DESC';
    } else {
      query += ' ORDER BY p.created_at DESC';
    }

    const [products] = await db.query(query, params);
    res.json({ total: products.length, data: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET produk by ID
const getProductById = async (req, res) => {
  try {
    const [products] = await db.query(
      `SELECT p.*, c.name as category_name,
        pi1.filename as image_1,
        pi2.filename as image_2,
        pi3.filename as image_3,
        pi4.filename as image_4
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN product_images pi1 ON pi1.product_id = p.id AND pi1.slot = 1
       LEFT JOIN product_images pi2 ON pi2.product_id = p.id AND pi2.slot = 2
       LEFT JOIN product_images pi3 ON pi3.product_id = p.id AND pi3.slot = 3
       LEFT JOIN product_images pi4 ON pi4.product_id = p.id AND pi4.slot = 4
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (products.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }
    res.json(products[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper: simpan/update gambar per slot
const upsertImage = async (productId, slot, fileUrl) => {
  const [existing] = await db.query(
    'SELECT * FROM product_images WHERE product_id = ? AND slot = ?',
    [productId, slot]
  );
  if (existing.length > 0) {
    // Hapus file lama dari Cloudinary
    const oldUrl = existing[0].filename;
    if (oldUrl && oldUrl.includes('cloudinary')) {
      const publicId = oldUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`azmata/${publicId}`);
    }
    await db.query(
      'UPDATE product_images SET filename = ? WHERE product_id = ? AND slot = ?',
      [fileUrl, productId, slot]
    );
  } else {
    await db.query(
      'INSERT INTO product_images (product_id, slot, filename) VALUES (?, ?, ?)',
      [productId, slot, fileUrl]
    );
  }
};

// CREATE produk
const createProduct = async (req, res) => {
  const { name, description, price, stock, category_id } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO products (name, description, price, stock, category_id) VALUES (?,?,?,?,?)',
      [name, description, price, stock || 0, category_id || null]
    );
    const productId = result.insertId;

    for (let i = 0; i < 4; i++) {
      const file = req.files?.[`image_${i}`]?.[0];
      if (file) {
        await upsertImage(productId, i + 1, file.path);
      }
    }

    res.status(201).json({ message: 'Produk berhasil ditambahkan', id: productId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE produk
const updateProduct = async (req, res) => {
  const { name, description, price, stock, category_id } = req.body;

  try {
    const [existing] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }

    await db.query(
      'UPDATE products SET name=?, description=?, price=?, stock=?, category_id=? WHERE id=?',
      [name, description, price, stock, category_id || null, req.params.id]
    );

    for (let i = 0; i < 4; i++) {
      const file = req.files?.[`image_${i}`]?.[0];
      if (file) {
        await upsertImage(req.params.id, i + 1, file.path);
      }
    }

    res.json({ message: 'Produk berhasil diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE produk
const deleteProduct = async (req, res) => {
  try {
    const [existing] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }

    const [images] = await db.query(
      'SELECT filename FROM product_images WHERE product_id = ?',
      [req.params.id]
    );
    for (const img of images) {
      if (img.filename && img.filename.includes('cloudinary')) {
        const publicId = img.filename.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`azmata/${publicId}`);
      }
    }

    await db.query('DELETE FROM product_images WHERE product_id = ?', [req.params.id]);
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);

    res.json({ message: 'Produk berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct };