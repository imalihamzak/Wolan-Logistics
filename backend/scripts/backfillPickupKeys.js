require('dotenv').config();

const mongoose = require('mongoose');

const Order = require('../models/Order');

const connect = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
};

const run = async () => {
  await connect();

  const orders = await Order.find({
    $or: [
      { pickup_key: { $exists: false } },
      { pickup_key: null },
      { pickup_key: '' },
      { pickup_key: { $not: /^\d{4}$/ } },
    ],
  }).select('_id order_id pickup_key');

  let updatedCount = 0;

  for (const order of orders) {
    // eslint-disable-next-line no-await-in-loop
    const pickupKey = await Order.generatePickupKey({ excludeId: order._id });
    order.set('pickup_key', pickupKey, undefined, { overwriteImmutable: true });
    order.$locals.generatedPickupKey = true;
    // eslint-disable-next-line no-await-in-loop
    await order.save();
    updatedCount += 1;
  }

  console.log(`Pickup key backfill complete. Updated ${updatedCount} order(s).`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
