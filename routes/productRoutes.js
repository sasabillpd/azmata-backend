const express = require('express');
const router = express.Router();
const {
  getAllProducts, getProductById,
  createProduct, updateProduct, deleteProduct
} = require('../controllers/productController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const uploadFields = upload.fields([
  { name: 'image_0', maxCount: 1 },
  { name: 'image_1', maxCount: 1 },
  { name: 'image_2', maxCount: 1 },
  { name: 'image_3', maxCount: 1 },
]);

router.get('/',       getAllProducts);
router.get('/:id',    getProductById);
router.post('/',      protect, adminOnly, uploadFields, createProduct);
router.put('/:id',    protect, adminOnly, uploadFields, updateProduct);
router.delete('/:id', protect, adminOnly, deleteProduct);

module.exports = router;