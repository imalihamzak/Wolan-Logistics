const RIDER_RESTRICTION_TYPES = ['soft_block', 'hard_block', 'permanent_suspension'];

const RIDER_RESTRICTION_TYPE_LABELS = {
  none: 'No Restriction',
  soft_block: 'Soft Block',
  hard_block: 'Hard Block',
  permanent_suspension: 'Permanent Suspension',
  manual_suspension: 'Manual Suspension',
  security_freeze: 'Security Freeze',
};

const RIDER_RESTRICTION_REINSTATEMENT_STATES = [
  'none',
  'restricted',
  'eligible_for_reinstatement',
  'admin_review_required',
  'permanent_review_required',
  'reinstated',
];

const RIDER_SOFT_BLOCK_MIN_HOURS = 12;
const RIDER_SOFT_BLOCK_MAX_HOURS = 48;
const RIDER_HARD_BLOCK_MIN_DAYS = 7;
const RIDER_HARD_BLOCK_MAX_DAYS = 30;

module.exports = {
  RIDER_RESTRICTION_TYPES,
  RIDER_RESTRICTION_TYPE_LABELS,
  RIDER_RESTRICTION_REINSTATEMENT_STATES,
  RIDER_SOFT_BLOCK_MIN_HOURS,
  RIDER_SOFT_BLOCK_MAX_HOURS,
  RIDER_HARD_BLOCK_MIN_DAYS,
  RIDER_HARD_BLOCK_MAX_DAYS,
};
