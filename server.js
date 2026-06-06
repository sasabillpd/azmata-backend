const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');


dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/products',      require('./routes/productRoutes'));
app.use('/api/orders',        require('./routes/orderRoutes'));
app.use('/api/payments',      require('./routes/paymentRoutes'));
app.use('/api/users',         require('./routes/userRoutes'));
app.use('/api/categories',    require('./routes/categoryRoutes'));
app.use('/api/reports',       require('./routes/reportRoutes'));
app.use('/api/addresses',     require('./routes/addressRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/profile',       require('./routes/profileRoutes'));
app.use('/api/wishlist',      require('./routes/wishlistRoutes'));
app.use('/api/reviews',       require('./routes/reviewRoutes'));
app.use('/api/stats',         require('./routes/statRoutes')); 
app.use('/api/vouchers',      require('./routes/voucherRoutes'));

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Azmata API berjalan ✅' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

