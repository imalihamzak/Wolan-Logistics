require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@wolan.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists:');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
      console.log('Active:', existingAdmin.is_active);
      console.log('Last login:', existingAdmin.last_login);
      return;
    }

    // Create admin user
    const adminUser = await User.create({
      full_name: 'System Administrator',
      email: 'admin@wolan.com',
      password: 'password123',
      role: 'super_admin',
      is_active: true,
      phone: '+1234567890'
    });

    console.log('Admin user created successfully:');
    console.log('Email: admin@wolan.com');
    console.log('Password: password123');
    console.log('Role: super_admin');
    console.log('User ID:', adminUser._id);

  } catch (error) {
    console.error('Error creating admin user:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdminUser();
