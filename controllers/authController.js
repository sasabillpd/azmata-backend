const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendResetEmail } = require('../services/emailService');

// REGISTER
const register = async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nama, email, dan password wajib diisi' });
  }
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, phone, address) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, phone || null, address || null]
    );
    res.status(201).json({
      message: 'Registrasi berhasil',
      user: { id: result.insertId, name, email, role: 'pelanggan' }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi' });
  }
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      message: 'Login berhasil',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar || null }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET PROFILE
const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }
    res.json(users[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE PROFILE
const updateProfile = async (req, res) => {
  const { name, phone, address } = req.body;
  try {
    await db.query(
      'UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?',
      [name, phone, address, req.user.id]
    );
    res.json({ message: 'Profil berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// FORGOT PASSWORD
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email wajib diisi' });
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.json({ message: 'Jika email terdaftar, instruksi reset akan dikirim' });
    }
    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
    await db.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [email, token, expires]
    );
    await sendResetEmail(email, token, user.name);
    res.json({ message: 'Jika email terdaftar, instruksi reset akan dikirim' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Gagal mengirim email reset' });
  }
};

// RESET PASSWORD
const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'Token dan password baru wajib diisi' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password minimal 8 karakter' });
  }
  try {
    const [resets] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    if (resets.length === 0) {
      return res.status(400).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
    }
    const { email } = resets[0];
    const hashed = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE email = ?', [hashed, email]);
    await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
    res.json({ message: 'Kata sandi berhasil direset' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, getProfile, updateProfile, forgotPassword, resetPassword };