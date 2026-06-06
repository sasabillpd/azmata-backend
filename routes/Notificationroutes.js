const express = require('express');
const router = express.Router();
const { getMyNotifications, markAllRead } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',          protect, getMyNotifications);
router.put('/read-all',  protect, markAllRead);

module.exports = router;