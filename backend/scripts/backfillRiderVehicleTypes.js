require('dotenv').config();

const mongoose = require('mongoose');

const Rider = require('../models/Rider');
const { RIDER_VEHICLE_TYPES } = require('../constants/riderConstants');

const DEFAULT_VEHICLE_TYPE = process.env.DEFAULT_RIDER_VEHICLE_TYPE || 'moto';

const connect = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
};

const run = async () => {
  if (!RIDER_VEHICLE_TYPES.includes(DEFAULT_VEHICLE_TYPE)) {
    throw new Error('DEFAULT_RIDER_VEHICLE_TYPE must be one of moto, voiture, velo');
  }

  await connect();

  const riders = await Rider.find({
    $or: [
      { vehicle_type: { $exists: false } },
      { vehicle_type: null },
      { vehicle_type: '' },
      { vehicle_type: { $nin: RIDER_VEHICLE_TYPES } },
    ],
  }).select('_id full_name phone vehicle_type');

  let updatedCount = 0;

  for (const rider of riders) {
    rider.vehicle_type = DEFAULT_VEHICLE_TYPE;
    // eslint-disable-next-line no-await-in-loop
    await rider.save();
    updatedCount += 1;
  }

  console.log(`Rider vehicle type backfill complete. Updated ${updatedCount} rider(s) to ${DEFAULT_VEHICLE_TYPE}.`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
