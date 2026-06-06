// Detailed backend startup script with error handling
require('dotenv').config();

console.log('=== Wolan Backend Server Startup ===');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);
console.log('MongoDB URI configured:', !!process.env.MONGODB_URI);
console.log('JWT Secret configured:', !!process.env.JWT_SECRET);

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const User = require('./models/User');

async function startServer() {
  try {
    console.log('\n1. Connecting to database...');
    await connectDB();
    console.log('✓ Database connected successfully');
    
    console.log('\n2. Checking/Creating admin user...');
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('No users found. Creating default super_admin account...');
      const admin = await User.create({
        full_name: 'System Administrator',
        email: 'admin@wolan.com',
        password: 'password123',
        role: 'super_admin',
        is_active: true,
        last_login: new Date(),
      });
      console.log('✓ Default admin created: admin@wolan.com');
    } else {
      const admin = await User.findOne({ email: 'admin@wolan.com' });
      if (admin) {
        console.log('✓ Admin user exists:', admin.email, 'Active:', admin.is_active);
      } else {
        console.log('⚠ Admin user not found, but other users exist');
      }
    }
    
    console.log('\n3. Starting HTTP server...');
    const PORT = process.env.PORT || 10000;
    const server = http.createServer(app);
    
    server.listen(PORT, () => {
      console.log('\n🚀 SERVER STARTED SUCCESSFULLY!');
      console.log('=' .repeat(50));
      console.log(`📍 Server URL: http://localhost:${PORT}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔐 Auth Endpoint: http://localhost:${PORT}/api/v1/auth/login`);
      console.log('=' .repeat(50));
      console.log('\n📋 Login Credentials:');
      console.log('Email: admin@wolan.com');
      console.log('Password: password123');
      console.log('\n✅ Backend server is ready!');
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', err.message);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('\n❌ Failed to start server:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

startServer();
