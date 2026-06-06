const express = require('express');
const router = express.Router();
const { getLaporan, getDashboardStats } = require('../controllers/reportController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, adminOnly, getDashboardStats);
router.get('/laporan',   protect, adminOnly, getLaporan);

module.exports = router;