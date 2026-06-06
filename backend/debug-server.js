require('dotenv').config();

console.log('=== DEBUG SERVER STARTUP ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

const http = require('http');
const mongoose = require('mongoose');

async function startDebugServer() {
  try {
    // Test database connection
    console.log('\n1. Testing database connection...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Database connected');
    
    // Test user model
    const User = require('./models/User');
    const admin = await User.findOne({ email: 'admin@wolan.com' });
    console.log('✅ Admin user found:', !!admin);
    if (admin) {
      console.log('   Email:', admin.email);
      console.log('   Role:', admin.role);
      console.log('   Active:', admin.is_active);
    }
    
    // Create simple test server
    const server = http.createServer((req, res) => {
      console.log('Request:', req.method, req.url);
      
      if (req.url === '/api/v1/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Server is running' }));
      } else if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            console.log('Login attempt:', data.email);
            
            const user = await User.findOne({ email: data.email }).select('+password');
            if (!user) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Invalid credentials' }));
              return;
            }
            
            const isMatch = await user.matchPassword(data.password);
            if (!isMatch) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Invalid credentials' }));
              return;
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              message: 'Login successful',
              user: { email: user.email, role: user.role }
            }));
          } catch (error) {
            console.error('Login error:', error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Server error' }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not found' }));
      }
    });
    
    const PORT = process.env.PORT || 10000;
    server.listen(PORT, () => {
      console.log('\n🚀 DEBUG SERVER RUNNING!');
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔐 Login: http://localhost:${PORT}/api/v1/auth/login`);
      console.log('\n✅ Ready to test authentication!');
    });
    
    server.on('error', (err) => {
      console.error('❌ Server error:', err.message);
    });
    
  } catch (error) {
    console.error('❌ Startup error:', error.message);
    console.error('Stack:', error.stack);
  }
}

startDebugServer();
