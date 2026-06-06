const express = require('express');
const router = express.Router();
const {
  getProfile, updateProfile, updatePassword,
  getBankAccount, updateBankAccount
} = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.get('/',           protect, getProfile);
router.put('/',           protect, upload.single('avatar'), updateProfile);
router.put('/password',   protect, updatePassword);
router.get('/bank',       protect, getBankAccount);
router.put('/bank',       protect, updateBankAccount);

module.exports = router;