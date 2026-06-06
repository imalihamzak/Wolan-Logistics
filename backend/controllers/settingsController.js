const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const OperationalSettings = require('../models/OperationalSettings');
const {
  CURRENCY_LABELS,
  CURRENCY_OPTIONS,
  DEFAULT_OPERATIONAL_SETTINGS,
  DISTANCE_UNIT_OPTIONS,
  TIMEZONE_OPTIONS,
} = require('../constants/operationalSettingsConstants');

const buildOptions = () => ({
  currencies: CURRENCY_OPTIONS.map((code) => ({
    code,
    label: CURRENCY_LABELS[code],
  })),
  timezones: TIMEZONE_OPTIONS,
  distance_units: DISTANCE_UNIT_OPTIONS,
});

const getOrCreateOperationalSettings = async () => {
  const settings = await OperationalSettings.findOneAndUpdate(
    { key: 'operations' },
    { $setOnInsert: DEFAULT_OPERATIONAL_SETTINGS },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return settings;
};

const getOperationalSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateOperationalSettings();

  return successResponse(res, 'Operational settings fetched successfully', {
    settings,
    options: buildOptions(),
  });
});

const updateOperationalSettings = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const settings = await getOrCreateOperationalSettings();

  Object.assign(settings, payload, {
    updated_by: req.user.id,
    updated_by_role: req.user.role,
  });

  await settings.save();

  return successResponse(res, 'Operational settings updated successfully', {
    settings,
    options: buildOptions(),
  });
});

module.exports = {
  getOperationalSettings,
  updateOperationalSettings,
};
