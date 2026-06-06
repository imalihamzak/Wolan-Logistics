require('dotenv').config();

const mongoose = require('mongoose');

const Hub = require('../models/Hub');
const Merchant = require('../models/Merchant');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const User = require('../models/User');
const { generateReferralCode, generateQrCode } = require('../services/merchantService');
const { createOrderRecord } = require('../services/orderService');
const {
  buildPolicyAcceptanceRecords,
  getRequiredPolicyKeys,
} = require('../constants/policyConstants');

const DEMO_PASSWORD = 'password123';
const DEMO_ASSIGNMENT_RESPONSE_WINDOW_MINUTES = Number(process.env.DEMO_ASSIGNMENT_RESPONSE_WINDOW_MINUTES || 30);
const demoRiderDocuments = () => ([
  { type: 'id_card', url: 'https://placehold.co/900x600?text=Demo+National+ID', verified: true, uploaded_at: new Date() },
  { type: 'license', url: 'https://placehold.co/900x600?text=Demo+Driving+Permit', verified: true, uploaded_at: new Date() },
  { type: 'rider_photo', url: 'https://placehold.co/900x600?text=Demo+Rider+Photo', verified: true, uploaded_at: new Date() },
  { type: 'bike_photo', url: 'https://placehold.co/900x600?text=Demo+Bike+Photo', verified: true, uploaded_at: new Date() },
]);
const ensureDemoRiderDocuments = (documents = []) => {
  const existing = Array.isArray(documents) ? documents : [];
  const byType = existing.reduce((accumulator, document) => {
    accumulator[document.type] = document;
    return accumulator;
  }, {});

  return demoRiderDocuments().map((document) => ({
    ...document,
    ...(byType[document.type] || {}),
    verified: true,
  }));
};

const buildDemoMerchantPolicyAcceptances = () => buildPolicyAcceptanceRecords({
  audience: 'merchant',
  acceptedKeys: getRequiredPolicyKeys('merchant'),
  req: {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'wolan-demo-seed' },
  },
});

const connect = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
};

const upsertUser = async ({ email, full_name, phone, role, hub_id }) => {
  let user = await User.findOne({ email }).select('+password');

  if (!user) {
    user = await User.create({
      full_name,
      email,
      phone,
      password: DEMO_PASSWORD,
      role,
      hub_id,
      is_active: true,
      kyc_status: role === 'rider' ? 'verified' : 'verified',
      account_locked: false,
      failed_login_attempts: 0,
    });
    return user;
  }

  user.full_name = full_name;
  user.phone = phone;
  user.password = DEMO_PASSWORD;
  user.role = role;
  user.hub_id = hub_id || user.hub_id || null;
  user.is_active = true;
  user.kyc_status = role === 'rider' ? 'verified' : 'verified';
  user.account_locked = false;
  user.failed_login_attempts = 0;
  user.locked_at = null;
  user.locked_reason = null;
  await user.save({ validateBeforeSave: false });
  return user;
};

const run = async () => {
  await connect();

  const hub = await Hub.findOneAndUpdate(
    { code: 'KLA-01' },
    {
      name: 'Pioneer Mall Hub',
      code: 'KLA-01',
      address: 'Pioneer Mall, Kampala',
      city: 'Kampala',
      state: 'Central',
      country: 'Uganda',
      zone: 'CBD',
      contact_phone: '+256700000000',
      contact_email: 'hub.kla01@wolan.test',
      is_active: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const admin = await upsertUser({
    full_name: 'System Administrator',
    email: 'admin@wolan.com',
    phone: '+256700000001',
    role: 'super_admin',
    hub_id: hub._id,
  });

  const riderUser = await upsertUser({
    full_name: 'Demo Driver',
    email: 'driver@wolan.test',
    phone: '+256700000002',
    role: 'rider',
    hub_id: hub._id,
  });

  let rider = await Rider.findOne({ user_id: riderUser._id });
  if (!rider) {
    rider = await Rider.create({
      user_id: riderUser._id,
      full_name: riderUser.full_name,
      phone: riderUser.phone,
      years_experience: 3,
      district: 'Kampala',
      division: 'Central',
      boda_stage: 'Pioneer Mall Stage',
      stage_chairman_phone: '+256700000006',
      vehicle_type: 'moto',
      bike_plate: 'DEM-001',
      nin_number: 'DEMONIN001',
      next_of_kin: {
        name: 'Demo Kin',
        phone: '+256700000003',
        relationship: 'Sibling',
      },
      bond_amount: 250000,
      bond_target_amount: 250000,
      bond_status: 'approved',
      bond_reference: 'DEMO-BOND-001',
      bond_verified_at: new Date(),
      bond_verified_by: admin._id,
      bond_history: [{
        action: 'approved',
        amount: 250000,
        previous_status: 'registered',
        next_status: 'approved',
        reference: 'DEMO-BOND-001',
        note: 'Demo security bond approved for operational testing.',
        actor_id: admin._id,
        actor_role: 'super_admin',
        created_at: new Date(),
      }],
      current_status: 'available',
      gps_location: { type: 'Point', coordinates: [32.5825, 0.3476] },
      last_location_update: new Date(),
      hub_id: hub._id,
      is_active: true,
      kyc_status: 'verified',
      all_documents_verified: true,
      documents: ensureDemoRiderDocuments(),
      admin_verification_notes: 'Demo rider documents reviewed and approved for operational testing.',
      admin_verification_notes_by: admin._id,
      admin_verification_notes_at: new Date(),
      kyc_verified_at: new Date(),
      kyc_verified_by: admin._id,
      activation_date: new Date(),
    });
  } else {
    rider.current_status = 'available';
    rider.vehicle_type = rider.vehicle_type || 'moto';
    rider.years_experience = rider.years_experience || 3;
    rider.district = rider.district || 'Kampala';
    rider.division = rider.division || 'Central';
    rider.boda_stage = rider.boda_stage || 'Pioneer Mall Stage';
    rider.stage_chairman_phone = rider.stage_chairman_phone || '+256700000006';
    rider.hub_id = hub._id;
    rider.bond_target_amount = rider.bond_target_amount || 250000;
    rider.bond_amount = Number(rider.bond_amount || 0) >= 250000 ? rider.bond_amount : 250000;
    rider.bond_status = ['approved', 'registered', 'rejected'].includes(rider.bond_status) ? rider.bond_status : 'approved';
    rider.bond_reference = rider.bond_reference || 'DEMO-BOND-001';
    rider.bond_verified_at = rider.bond_verified_at || new Date();
    rider.bond_verified_by = rider.bond_verified_by || admin._id;
    if (!Array.isArray(rider.bond_history) || rider.bond_history.length === 0) {
      rider.bond_history = [{
        action: 'approved',
        amount: 250000,
        previous_status: 'registered',
        next_status: 'approved',
        reference: 'DEMO-BOND-001',
        note: 'Demo security bond approved for operational testing.',
        actor_id: admin._id,
        actor_role: 'super_admin',
        created_at: new Date(),
      }];
    }
    rider.is_active = true;
    rider.kyc_status = 'verified';
    rider.all_documents_verified = true;
    rider.documents = ensureDemoRiderDocuments(rider.documents);
    rider.admin_verification_notes = rider.admin_verification_notes || 'Demo rider documents reviewed and approved for operational testing.';
    rider.admin_verification_notes_by = rider.admin_verification_notes_by || admin._id;
    rider.admin_verification_notes_at = rider.admin_verification_notes_at || new Date();
    rider.kyc_verified_at = rider.kyc_verified_at || new Date();
    rider.kyc_verified_by = rider.kyc_verified_by || admin._id;
    rider.suspension_reason = null;
    rider.gps_location = { type: 'Point', coordinates: [32.5825, 0.3476] };
    rider.last_location_update = new Date();
    await rider.save();
  }

  let merchant = await Merchant.findOne({ email: 'merchant@wolan.test' }).select('+password');
  if (!merchant) {
    merchant = await Merchant.create({
      merchant_name: 'Demo Merchant',
      shop_name: 'Demo Shop',
      building_name: 'Pioneer Mall',
      phone: '+256700000004',
      email: 'merchant@wolan.test',
      password: DEMO_PASSWORD,
      address: 'Pioneer Mall, Kampala',
      referral_code: await generateReferralCode('Demo Merchant', 'merchant@wolan.test'),
      tier_level: 'Starter',
      hub_id: hub._id,
      status: 'active',
      kyc_status: 'verified',
      account_locked: false,
      failed_login_attempts: 0,
      kyc_verified_at: new Date(),
      policy_acceptances: buildDemoMerchantPolicyAcceptances(),
    });
    merchant.qr_code = await generateQrCode(merchant);
    await merchant.save({ validateBeforeSave: false });
  } else {
    merchant.hub_id = hub._id;
    merchant.password = DEMO_PASSWORD;
    merchant.status = 'active';
    merchant.kyc_status = 'verified';
    merchant.account_locked = false;
    merchant.failed_login_attempts = 0;
    merchant.locked_at = null;
    merchant.locked_reason = null;
    merchant.kyc_verified_at = merchant.kyc_verified_at || new Date();
    merchant.policy_acceptances = buildDemoMerchantPolicyAcceptances();
    if (!/^data:image\/png;base64,/i.test(String(merchant.qr_code || ''))) {
      merchant.qr_code = await generateQrCode(merchant);
    }
    await merchant.save({ validateBeforeSave: false });
  }

  const existingTestOrder = await Order.findOne({
    merchant_id: merchant._id,
    customer_phone: '+256700000005',
    order_status: 'pending',
  }).select('+otp_code');

  let order = existingTestOrder;
  if (!order) {
    order = await createOrderRecord({
      payload: {
        merchant_id: merchant._id,
        rider_id: riderUser._id,
        customer_name: 'Demo Customer',
        customer_phone: '+256700000005',
        pickup_address: 'Pioneer Mall Hub, Kampala CBD',
        dropoff_address: 'Kampala Road, CBD',
        delivery_address: 'Kampala Road, CBD',
        item_description: 'Demo test package',
        declared_value: 50000,
        hub_id: hub._id,
        delivery_zone: 'CBD',
        pickup_coordinates: { latitude: 0.3136, longitude: 32.5811 },
        dropoff_coordinates: { latitude: 0.3476, longitude: 32.5825 },
        service_level: 'standard',
        cod_amount: 25000,
      },
      actor: {
        id: admin._id,
        role: 'super_admin',
        hub_id: hub._id,
      },
    });
  } else {
    order.rider_id = riderUser._id;
    order.hub_id = hub._id;
    order.assignment_response_status = 'pending';
    order.accepted_at = null;
    order.rejected_at = null;
    order.rejected_reason = null;
    if (!order.otp_code) {
      order.otp_code = String(Math.floor(1000 + Math.random() * 9000));
    }
  }

  order.rider_id = riderUser._id;
  order.hub_id = hub._id;
  order.order_status = 'pending';
  order.assignment_response_status = 'pending';
  order.assignment_response_due_at = new Date(Date.now() + DEMO_ASSIGNMENT_RESPONSE_WINDOW_MINUTES * 60 * 1000);
  order.assigned_at = new Date();
  order.accepted_at = null;
  order.rejected_at = null;
  order.rejected_reason = null;
  order.custody_confirmed_at = null;
  order.custody_scan_payload = null;
  order.physical_tracker_id = null;
  order.physical_tracker_linked_at = null;
  order.picked_up_at = null;
  order.at_hub_at = null;
  order.out_for_delivery_at = null;
  order.delivered_at = null;
  order.failed_at = null;
  order.returned_at = null;
  if (!order.pickup_key) {
    const pickupKey = await Order.generatePickupKey({ excludeId: order._id });
    order.set('pickup_key', pickupKey, undefined, { overwriteImmutable: true });
    order.$locals.generatedPickupKey = true;
  }
  order.handover_verified = false;
  order.hub_scan_in = null;
  order.failed_reason = null;
  order.return_reason = null;
  order.delivery_proof_upload_id = null;
  order.delivery_proof_uploaded_at = null;
  order.return_proof_upload_id = null;
  order.return_proof_uploaded_at = null;
  order.otp_verified_at = null;
  order.otp_code = order.otp_code || String(Math.floor(1000 + Math.random() * 9000));
  await order.save({ validateBeforeSave: false });

  console.log('Demo data ready');
  console.log('Admin:    admin@wolan.com / password123');
  console.log('Merchant: merchant@wolan.test / password123');
  console.log('Driver:   driver@wolan.test / password123');
  console.log(`Hub:      ${hub.name} (${hub.code})`);
  console.log(`Order:    ${order.order_id}`);
  console.log(`OTP:      ${order.otp_code || 'Already delivered/cleared'}`);
  console.log(`Accept by: ${order.assignment_response_due_at.toISOString()} (${DEMO_ASSIGNMENT_RESPONSE_WINDOW_MINUTES} minute demo window)`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
