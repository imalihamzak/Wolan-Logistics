require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function quickFix() {
  try {
    console.log('🔧 Quick Authentication Fix');
    console.log('==========================');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Check/create admin user
    const admin = await User.findOne({ email: 'admin@wolan.com' });
    
    if (!admin) {
      console.log('👤 Creating admin user...');
      const newAdmin = await User.create({
        full_name: 'System Administrator',
        email: 'admin@wolan.com',
        password: 'password123',
        role: 'super_admin',
        is_active: true,
        phone: '+1234567890'
      });
      console.log('✅ Admin user created:', newAdmin.email);
    } else {
      console.log('✅ Admin user exists:', admin.email);
      console.log('   Role:', admin.role);
      console.log('   Active:', admin.is_active);
    }
    
    await mongoose.disconnect();
    console.log('\n🎯 Next Steps:');
    console.log('1. Start backend: node server.js');
    console.log('2. Start frontend: cd ../frontend && npm run dev');
    console.log('3. Login at: http://localhost:5173/login');
    console.log('   Email: admin@wolan.com');
    console.log('   Password: password123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

quickFix();
