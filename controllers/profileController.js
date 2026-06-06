const db = require('../config/db');
const bcrypt = require('bcryptjs');

// GET profile sendiri
const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT id, name, email, phone, avatar, created_at, password_updated_at,
              bank_name, bank_account_number, bank_account_name
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.json(users[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE profile
const updateProfile = async (req, res) => {
  const { first_name, last_name, email, phone } = req.body;
  const name = `${first_name} ${last_name}`.trim();
  const avatar = req.file ? req.file.filename : null;

  try {
    if (avatar) {
      await db.query(
        'UPDATE users SET name = ?, email = ?, phone = ?, avatar = ? WHERE id = ?',
        [name, email, phone, avatar, req.user.id]
      );
    } else {
      await db.query(
        'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
        [name, email, phone, req.user.id]
      );
    }
    const [users] = await db.query(
      `SELECT id, name, email, phone, avatar, created_at, password_updated_at,
              bank_name, bank_account_number, bank_account_name
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.json({ message: 'Profil berhasil diperbarui', user: users[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE password
const updatePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  try {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];

    const match = await bcrypt.compare(current_password, user.password);
    if (!match) return res.status(400).json({ message: 'Sandi lama tidak sesuai' });

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password = ?, password_updated_at = NOW() WHERE id = ?',
      [hashed, req.user.id]
    );

    res.json({ message: 'Sandi berhasil diubah', password_updated_at: new Date() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET rekening bank
const getBankAccount = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT bank_name, bank_account_number, bank_account_name FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json(users[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE rekening bank
const updateBankAccount = async (req, res) => {
  const { bank_name, bank_account_number, bank_account_name } = req.body;

  if (!bank_name || !bank_account_number || !bank_account_name) {
    return res.status(400).json({ message: 'Semua field rekening wajib diisi' });
  }

  try {
    await db.query(
      'UPDATE users SET bank_name = ?, bank_account_number = ?, bank_account_name = ? WHERE id = ?',
      [bank_name, bank_account_number, bank_account_name, req.user.id]
    );
    res.json({ message: 'Rekening berhasil disimpan', bank_name, bank_account_number, bank_account_name });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getProfile, updateProfile, updatePassword, getBankAccount, updateBankAccount };