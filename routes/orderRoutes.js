const express = require('express');
const router = express.Router();
const {
  createOrder, getAllOrders, getMyOrders,
  getOrderById, updateOrderStatus, cancelOrder, confirmReceived,
  submitKomplain, getAllKomplain, resolveKomplain,
} = require('../controllers/orderController');
const { uploadPayment } = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.post('/',                protect, createOrder);
router.get('/',                 protect, getMyOrders);
router.get('/admin/all',        protect, adminOnly, getAllOrders);
router.get('/admin/komplain',   protect, adminOnly, getAllKomplain);
router.get('/my-orders',        protect, getMyOrders);
router.get('/:id',              protect, getOrderById);
router.put('/:id/status',       protect, adminOnly, updateOrderStatus);
router.put('/:id/cancel',       protect, cancelOrder);
router.post('/:id/payment',     protect, upload.array('bukti', 5), uploadPayment);
router.patch('/:id/confirm-received', protect, confirmReceived);
router.post('/:id/komplain',       protect, upload.single('foto'), submitKomplain);
router.put('/:id/komplain/resolve', protect, adminOnly, resolveKomplain);

module.exports = router;