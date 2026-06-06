const express = require('express');
const router  = express.Router();
const voucherController = require('../controllers/voucherController');
const { protect, adminOnly, superAdminOnly } = require('../middleware/authMiddleware');

// Validate — semua user yang login
router.post('/validate', protect, voucherController.validateVoucher);

// GET — semua admin bisa lihat
router.get('/', protect, voucherController.getAllVouchers);

// CUD — hanya super_admin
router.post('/',     protect, superAdminOnly, voucherController.createVoucher);
router.put('/:id',   protect, superAdminOnly, voucherController.updateVoucher);
router.delete('/:id',protect, superAdminOnly, voucherController.deleteVoucher);

module.exports = router;