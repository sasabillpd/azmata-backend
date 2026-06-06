const db = require('../config/db');

// GET semua alamat milik user
const getMyAddresses = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST tambah alamat baru
const createAddress = async (req, res) => {
  const {
    label, nama, telepon, alamat,
    kelurahan_name, kecamatan_name, kota_name,
    provinsi_name, kode_pos, catatan, is_primary
  } = req.body;

  if (!nama || !telepon || !alamat) {
    return res.status(400).json({ message: 'Nama, telepon, dan alamat wajib diisi' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (is_primary) {
      await conn.query(
        'UPDATE addresses SET is_primary = 0 WHERE user_id = ?',
        [req.user.id]
      );
    }

    const [existing] = await conn.query(
      'SELECT COUNT(*) as count FROM addresses WHERE user_id = ?',
      [req.user.id]
    );
    const autoPrimary = existing[0].count === 0 ? 1 : (is_primary ? 1 : 0);

    const [result] = await conn.query(
      `INSERT INTO addresses 
        (user_id, label, nama, telepon, alamat, kelurahan_name, kecamatan_name, kota_name, provinsi_name, kode_pos, catatan, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, label || '', nama, telepon, alamat,
       kelurahan_name || '', kecamatan_name || '', kota_name || '',
       provinsi_name || '', kode_pos || '', catatan || '', autoPrimary]
    );

    await conn.commit();

    const [newAddr] = await db.query('SELECT * FROM addresses WHERE id = ?', [result.insertId]);
    res.status(201).json(newAddr[0]);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

// PUT update alamat
const updateAddress = async (req, res) => {
  const {
    label, nama, telepon, alamat,
    kelurahan_name, kecamatan_name, kota_name,
    provinsi_name, kode_pos, catatan, is_primary
  } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Alamat tidak ditemukan' });
    }

    if (is_primary) {
      await conn.query(
        'UPDATE addresses SET is_primary = 0 WHERE user_id = ?',
        [req.user.id]
      );
    }

    await conn.query(
      `UPDATE addresses SET
        label=?, nama=?, telepon=?, alamat=?,
        kelurahan_name=?, kecamatan_name=?, kota_name=?,
        provinsi_name=?, kode_pos=?, catatan=?, is_primary=?
       WHERE id = ? AND user_id = ?`,
      [label || '', nama, telepon, alamat,
       kelurahan_name || '', kecamatan_name || '', kota_name || '',
       provinsi_name || '', kode_pos || '', catatan || '', is_primary ? 1 : 0,
       req.params.id, req.user.id]
    );

    await conn.commit();

    const [updated] = await db.query('SELECT * FROM addresses WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

// DELETE alamat
const deleteAddress = async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Alamat tidak ditemukan' });
    }
    await db.query('DELETE FROM addresses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Alamat dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PUT set alamat utama
const setPrimary = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Alamat tidak ditemukan' });
    }

    await conn.query('UPDATE addresses SET is_primary = 0 WHERE user_id = ?', [req.user.id]);
    await conn.query('UPDATE addresses SET is_primary = 1 WHERE id = ?', [req.params.id]);

    await conn.commit();
    res.json({ message: 'Alamat utama diperbarui' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

module.exports = { getMyAddresses, createAddress, updateAddress, deleteAddress, setPrimary };