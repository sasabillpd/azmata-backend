const express = require('express');
const router = express.Router();
const { getWishlist, toggleWishlist, removeWishlist, checkWishlist } = require('../controllers/wishlistController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',                        protect, getWishlist);
router.post('/toggle',                 protect, toggleWishlist);
router.delete('/:product_id',          protect, removeWishlist);
router.get('/check/:product_id',       protect, checkWishlist);

module.exports = router;