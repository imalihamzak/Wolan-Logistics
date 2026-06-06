require('dotenv').config();

const mongoose = require('mongoose');

const Rider = require('../models/Rider');
const User = require('../models/User');
const { RIDER_REQUIRED_DOCUMENT_TYPES } = require('../constants/riderConstants');

const demoDocuments = [
  { type: 'id_card', url: 'https://placehold.co/900x600?text=Demo+National+ID', verified: true },
  { type: 'license', url: 'https://placehold.co/900x600?text=Demo+Driving+Permit', verified: true },
  { type: 'rider_photo', url: 'https://placehold.co/900x600?text=Demo+Rider+Photo', verified: true },
  { type: 'bike_photo', url: 'https://placehold.co/900x600?text=Demo+Bike+Photo', verified: true },
];

const mergeDemoDocuments = (documents = []) => {
  const byType = new Map((Array.isArray(documents) ? documents : []).map((document) => [document.type, document]));
  const now = new Date();

  return demoDocuments.map((document) => ({
    ...document,
    ...(byType.get(document.type) || {}),
    url: byType.get(document.type)?.url || document.url,
    verified: true,
    uploaded_at: byType.get(document.type)?.uploaded_at || now,
  }));
};

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({
    role: 'rider',
    $or: [
      { email: 'driver@wolan.test' },
      { phone: '+256700000002' },
      { full_name: 'Demo Driver' },
    ],
  });

  if (!user) {
    throw new Error('Demo rider user not found. Run npm run seed:demo first.');
  }

  const rider = await Rider.findOne({
    $or: [
      { user_id: user._id },
      { phone: '+256700000002' },
      { full_name: 'Demo Driver' },
    ],
  });

  if (!rider) {
    throw new Error('Demo rider profile not found. Run npm run seed:demo first.');
  }

  rider.documents = mergeDemoDocuments(rider.documents);
  rider.all_documents_verified = RIDER_REQUIRED_DOCUMENT_TYPES.every((type) =>
    rider.documents.some((document) => document.type === type && document.verified === true)
  );
  rider.kyc_status = 'verified';
  rider.stage_chairman_phone = rider.stage_chairman_phone || '+256700000006';
  rider.is_active = true;
  rider.current_status = rider.current_status === 'offline' ? 'available' : rider.current_status;
  rider.kyc_verified_at = rider.kyc_verified_at || new Date();

  user.kyc_status = 'verified';
  user.is_active = true;
  user.account_locked = false;
  user.failed_login_attempts = 0;
  user.locked_at = null;
  user.locked_reason = null;

  await user.save({ validateBeforeSave: false });
  await rider.save({ validateBeforeSave: false });

  console.log('Demo rider KYC repaired successfully.');
  console.log(`Documents: ${rider.documents.map((document) => `${document.type}:${document.verified ? 'verified' : 'pending'}`).join(', ')}`);
};

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
