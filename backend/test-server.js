require('dotenv').config();

console.log('=== Testing Server Startup ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

try {
  const mongoose = require('mongoose');
  console.log('✓ Mongoose loaded');
  
  const connectDB = async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined');
    }
    
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✓ MongoDB connected');
  };
  
  connectDB().then(async () => {
    const User = require('./models/User');
    console.log('✓ User model loaded');
    
    // Check if admin exists
    const admin = await User.findOne({ email: 'admin@wolan.com' });
    if (admin) {
      console.log('✓ Admin user exists:', admin.email, admin.role);
    } else {
      console.log('✗ Admin user not found, creating...');
      const newAdmin = await User.create({
        full_name: 'System Administrator',
        email: 'admin@wolan.com',
        password: 'password123',
        role: 'super_admin',
        is_active: true,
        phone: '+1234567890'
      });
      console.log('✓ Admin user created:', newAdmin.email);
    }
    
    await mongoose.disconnect();
    console.log('✓ Test completed successfully');
    process.exit(0);
  }).catch(err => {
    console.error('✗ Error:', err.message);
    process.exit(1);
  });
  
} catch (err) {
  console.error('✗ Initialization error:', err.message);
  process.exit(1);
}
