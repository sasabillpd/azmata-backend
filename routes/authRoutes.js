const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register',         register);
router.post('/login',            login);
router.get('/profile',           protect, getProfile);
router.put('/profile',           protect, updateProfile);
router.post('/forgot-password',  forgotPassword);
router.post('/reset-password',   resetPassword);

module.exports = router;