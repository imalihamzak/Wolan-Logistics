require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

console.log('=== STARTING WORKING SERVER ===');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'CONFIGURED' : 'NOT CONFIGURED');
console.log('PORT: 3000');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Health endpoint
app.get('/api/v1/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', message: 'Working server running' });
});

// Login endpoint
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    console.log('Login request received:', req.body.email);
    
    const User = require('./models/User');
    const user = await User.findOne({ email: req.body.email }).select('+password');
    
    if (!user) {
      console.log('User not found:', req.body.email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const isMatch = await user.matchPassword(req.body.password);
    if (!isMatch) {
      console.log('Password mismatch for:', req.body.email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    if (!user.is_active) {
      console.log('User inactive:', req.body.email);
      return res.status(403).json({ message: 'Account is inactive' });
    }
    
    console.log('Login successful:', req.body.email);
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        full_name: user.full_name
      }
    });
    
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start server with retry logic
const startServer = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Check/create admin user
    const User = require('./models/User');
    let admin = await User.findOne({ email: 'admin@wolan.com' });
    
    if (!admin) {
      console.log('Creating admin user...');
      admin = await User.create({
        full_name: 'System Administrator',
        email: 'admin@wolan.com',
        password: 'password123',
        role: 'super_admin',
        is_active: true,
        phone: '+1234567890'
      });
      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user exists:', admin.email, 'Active:', admin.is_active);
    }
    
    const PORT = 3000;
    const server = app.listen(PORT, () => {
      console.log('\n🚀 SERVER SUCCESSFULLY STARTED!');
      console.log('=' .repeat(50));
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔐 Login: http://localhost:${PORT}/api/v1/auth/login`);
      console.log('=' .repeat(50));
      console.log('\n📋 Ready for login testing!');
      console.log('Email: admin@wolan.com');
      console.log('Password: password123');
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`❌ Port ${PORT} is in use, trying ${PORT + 1}...`);
        setTimeout(() => startServerOnPort(PORT + 1), 1000);
      } else {
        console.error('❌ Server error:', err.message);
      }
    });
    
  } catch (error) {
    console.error('❌ Startup error:', error.message);
    console.error('Stack:', error.stack);
  }
};

const startServerOnPort = (port) => {
  const server = app.listen(port, () => {
    console.log(`🚀 Server started on port ${port}`);
    console.log(`📍 URL: http://localhost:${port}`);
  });
};

startServer();
