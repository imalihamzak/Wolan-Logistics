require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', message: 'Simple server running' });
});

// Login endpoint
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    console.log('Login attempt for:', req.body.email);
    
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

// Start server
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    const PORT = 3000; // Use port 3000 to avoid conflicts
    app.listen(PORT, () => {
      console.log(`🚀 Simple server running on port ${PORT}`);
      console.log(`📍 Health: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔐 Login: http://localhost:${PORT}/api/v1/auth/login`);
      console.log('\n📋 Login Credentials:');
      console.log('Email: admin@wolan.com');
      console.log('Password: password123');
    });
    
  } catch (error) {
    console.error('❌ Server startup error:', error.message);
  }
};

startServer();
