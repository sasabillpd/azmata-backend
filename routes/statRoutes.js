const express = require('express');
const router = express.Router();
const { getPublicStats } = require('../controllers/statsController');

router.get('/', getPublicStats); // GET /api/stats

module.exports = router;