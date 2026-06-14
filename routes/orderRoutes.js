const express = require('express');
const router = express.Router();
const {
  createOrder, getAllOrders, getMyOrders,
  getOrderById, updateOrderStatus, cancelOrder
} = require('../controllers/orderController');
const { uploadPayment } = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.post('/',                protect, createOrder);
router.get('/',                 protect, getMyOrders);            // customer: pesanan sendiri
router.get('/admin/all',        protect, adminOnly, getAllOrders); // admin: semua pesanan
router.get('/my-orders',        protect, getMyOrders);
router.get('/:id',              protect, getOrderById);
router.put('/:id/status',       protect, adminOnly, updateOrderStatus);
router.put('/:id/cancel',       protect, cancelOrder);
router.post('/:id/payment',     protect, upload.array('bukti', 5), uploadPayment);
router.patch('/:id/confirm-received', authMiddleware, confirmReceived);

module.exports = router;