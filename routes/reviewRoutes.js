const express = require('express');
const router = express.Router();
const { getProductReviews, getTopReviews, createReview, checkReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

router.get('/top',                         getTopReviews);     // public — harus di atas /:param
router.get('/product/:product_id',         getProductReviews); // public
router.post('/',                    protect, createReview);
router.get('/check/:product_id',    protect, checkReview);

module.exports = router;