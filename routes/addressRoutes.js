const express = require('express');
const router = express.Router();
const {
  getMyAddresses, createAddress, updateAddress, deleteAddress, setPrimary
} = require('../controllers/addressController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',              protect, getMyAddresses);
router.post('/',             protect, createAddress);
router.put('/:id',           protect, updateAddress);
router.delete('/:id',        protect, deleteAddress);
router.put('/:id/primary',   protect, setPrimary);

module.exports = router;