const mongoose = require('mongoose');

const { RIDER_DOCUMENT_TYPES, RIDER_VEHICLE_TYPES } = require('../constants/riderConstants');
const {
  RIDER_RESTRICTION_TYPES,
  RIDER_RESTRICTION_REINSTATEMENT_STATES,
} = require('../constants/riderRestrictionConstants');
const { RIDER_COD_OPERATION_LIMIT } = require('../constants/settlementConstants');
const { getRiderRestrictionSnapshot } = require('../utils/riderRestrictions');

const gpsLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },
  { _id: false }
);

const nextOfKinSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    relationship: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: RIDER_DOCUMENT_TYPES,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    public_id: {
      type: String,
      default: null,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    uploaded_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const bondHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['registered', 'approved', 'rejected', 'refunded', 'forfeited', 'adjusted'],
      required: true,
    },
    amount: {
      type: Number,
      default: 0,
    },
    previous_status: {
      type: String,
      default: null,
    },
    next_status: {
      type: String,
      default: null,
    },
    reference: {
      type: String,
      default: null,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actor_role: {
      type: String,
      default: null,
      trim: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  }
);

const deviceBindingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['unbound', 'bound', 'frozen'],
      default: 'unbound',
    },
    device_id_hash: {
      type: String,
      default: null,
      select: false,
    },
    device_label: {
      type: String,
      default: null,
      trim: true,
    },
    platform: {
      type: String,
      default: null,
      trim: true,
    },
    user_agent: {
      type: String,
      default: null,
      trim: true,
    },
    bound_at: {
      type: Date,
      default: null,
    },
    last_seen_at: {
      type: Date,
      default: null,
    },
    last_ip: {
      type: String,
      default: null,
      trim: true,
    },
    frozen_at: {
      type: Date,
      default: null,
    },
    freeze_reason: {
      type: String,
      default: null,
      trim: true,
    },
    mismatch_device_id_hash: {
      type: String,
      default: null,
      select: false,
    },
    mismatch_device_label: {
      type: String,
      default: null,
      trim: true,
    },
    unbound_at: {
      type: Date,
      default: null,
    },
    unbound_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    unbind_reason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const deviceBindingHistorySchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: ['bound', 'verified', 'frozen', 'unbound'],
      required: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actor_role: {
      type: String,
      default: 'system',
      trim: true,
    },
    device_id_hash: {
      type: String,
      default: null,
      select: false,
    },
    device_label: {
      type: String,
      default: null,
      trim: true,
    },
    platform: {
      type: String,
      default: null,
      trim: true,
    },
    ip_address: {
      type: String,
      default: null,
      trim: true,
    },
    occurred_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const restrictionHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['restricted', 'reinstated'],
      required: true,
    },
    type: {
      type: String,
      enum: [...RIDER_RESTRICTION_TYPES, 'none'],
      required: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
    },
    started_at: {
      type: Date,
      default: null,
    },
    expires_at: {
      type: Date,
      default: null,
    },
    lifted_at: {
      type: Date,
      default: null,
    },
    reinstatement_state: {
      type: String,
      enum: RIDER_RESTRICTION_REINSTATEMENT_STATES,
      default: 'none',
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actor_role: {
      type: String,
      default: 'system',
      trim: true,
    },
    occurred_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const fineSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'waived'],
      default: 'pending',
    },
    issued_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    issued_at: {
      type: Date,
      default: Date.now,
    },
    paid_at: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const incidentStatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['open', 'investigating', 'escalated', 'resolved', 'closed'],
      required: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actor_role: {
      type: String,
      default: 'system',
      trim: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['accident', 'theft', 'complaint', 'lost_package', 'damage', 'medical', 'other'],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      default: null,
    },
    reported_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'escalated', 'resolved', 'closed'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['normal', 'high', 'critical'],
      default: 'normal',
    },
    resolution: {
      type: String,
      default: null,
    },
    escalated_at: {
      type: Date,
      default: null,
    },
    escalated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status_history: {
      type: [incidentStatusHistorySchema],
      default: [],
    },
    reported_at: {
      type: Date,
      default: Date.now,
    },
    resolved_at: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const dailyEarningsSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    deliveries: {
      type: Number,
      default: 0,
    },
    successful_deliveries: {
      type: Number,
      default: 0,
    },
    failed_deliveries: {
      type: Number,
      default: 0,
    },
    returned_orders: {
      type: Number,
      default: 0,
    },
    total_distance: {
      type: Number,
      default: 0,
    },
    earnings: {
      type: Number,
      default: 0,
    },
    cod_collected: {
      type: Number,
      default: 0,
    },
    fines: {
      type: Number,
      default: 0,
    },
    bonus: {
      type: Number,
      default: 0,
    },
    net_earnings: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const dispatchMetricsSchema = new mongoose.Schema(
  {
    performance_score: { type: Number, default: 0, min: 0, max: 100 },
    priority_score: { type: Number, default: 0, min: 0, max: 100 },
    acceptance_rate: { type: Number, default: 0, min: 0, max: 100 },
    cancellation_ratio: { type: Number, default: 0, min: 0, max: 100 },
    punctuality_rate: { type: Number, default: 0, min: 0, max: 100 },
    customer_rating_score: { type: Number, default: 100, min: 0, max: 100 },
    complaint_score: { type: Number, default: 100, min: 0, max: 100 },
    gps_consistency_score: { type: Number, default: 0, min: 0, max: 100 },
    proximity_score: { type: Number, default: 0, min: 0, max: 100 },
    workload_score: { type: Number, default: 100, min: 0, max: 100 },
    zone_familiarity_score: { type: Number, default: 0, min: 0, max: 100 },
    assignments_total: { type: Number, default: 0 },
    accepted_assignments: { type: Number, default: 0 },
    rejected_assignments: { type: Number, default: 0 },
    expired_assignments: { type: Number, default: 0 },
    cancellation_events: { type: Number, default: 0 },
    punctual_deliveries: { type: Number, default: 0 },
    timed_deliveries: { type: Number, default: 0 },
    complaint_count: { type: Number, default: 0 },
    gps_divergence_count: { type: Number, default: 0 },
    gps_fresh: { type: Boolean, default: false },
    distance_km: { type: Number, default: null },
    active_assignments: { type: Number, default: 0 },
    window_days: { type: Number, default: 30 },
    calculated_at: { type: Date, default: null },
  },
  { _id: false }
);

const policyAcceptanceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      enum: ['merchant', 'rider'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: String,
      required: true,
      trim: true,
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
    },
    accepted_at: {
      type: Date,
      required: true,
    },
    accepted_ip: {
      type: String,
      default: null,
      trim: true,
    },
    accepted_user_agent: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const riderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    years_experience: {
      type: Number,
      default: 0,
      min: 0,
      max: 60,
    },
    district: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    division: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    boda_stage: {
      type: String,
      default: null,
      trim: true,
    },
    stage_chairman_phone: {
      type: String,
      default: null,
      trim: true,
    },
    vehicle_type: {
      type: String,
      enum: RIDER_VEHICLE_TYPES,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    bike_plate: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    nin_number: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    next_of_kin: {
      type: nextOfKinSchema,
      required: true,
    },
    bond_amount: {
      type: Number,
      default: 0,
    },
    bond_target_amount: {
      type: Number,
      default: 250000,
      min: 0,
    },
    bond_status: {
      type: String,
      enum: ['pending', 'registered', 'approved', 'rejected', 'deposited', 'refunded', 'forfeited'],
      default: 'pending',
    },
    bond_reference: {
      type: String,
      default: null,
      trim: true,
    },
    bond_verified_at: {
      type: Date,
      default: null,
    },
    bond_verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    bond_rejected_at: {
      type: Date,
      default: null,
    },
    bond_rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    bond_rejection_reason: {
      type: String,
      default: null,
      trim: true,
    },
    bond_history: {
      type: [bondHistorySchema],
      default: [],
    },
    current_status: {
      type: String,
      enum: ['available', 'on_delivery', 'break', 'offline'],
      default: 'offline',
      index: true,
    },
    gps_location: {
      type: gpsLocationSchema,
      default: { type: 'Point', coordinates: [0, 0] },
    },
    last_location_update: {
      type: Date,
      default: null,
    },
    current_cod: {
      type: Number,
      default: 0,
    },
    performance_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    dispatch_metrics: {
      type: dispatchMetricsSchema,
      default: () => ({}),
    },
    total_deliveries: {
      type: Number,
      default: 0,
    },
    successful_deliveries: {
      type: Number,
      default: 0,
    },
    failed_deliveries: {
      type: Number,
      default: 0,
    },
    returned_orders: {
      type: Number,
      default: 0,
    },
    total_distance: {
      type: Number,
      default: 0,
    },
    earnings: {
      type: Number,
      default: 0,
    },
    pending_payout: {
      type: Number,
      default: 0,
    },
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      index: true,
    },
    documents: {
      type: [documentSchema],
      default: [],
    },
    all_documents_verified: {
      type: Boolean,
      default: false,
    },
    kyc_status: {
      type: String,
      enum: ['not_submitted', 'pending', 'verified', 'rejected'],
      default: 'pending',
      index: true,
    },
    kyc_verified_at: {
      type: Date,
      default: null,
    },
    kyc_verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    kyc_rejection_reason: {
      type: String,
      default: null,
      trim: true,
    },
    policy_acceptances: {
      type: [policyAcceptanceSchema],
      default: [],
    },
    admin_verification_notes: {
      type: String,
      default: null,
      trim: true,
    },
    admin_verification_notes_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    admin_verification_notes_at: {
      type: Date,
      default: null,
    },
    device_binding: {
      type: deviceBindingSchema,
      default: () => ({ status: 'unbound' }),
    },
    device_binding_history: {
      type: [deviceBindingHistorySchema],
      default: [],
      select: false,
    },
    fines: {
      type: [fineSchema],
      default: [],
    },
    incidents: {
      type: [incidentSchema],
      default: [],
    },
    daily_earnings: {
      type: [dailyEarningsSchema],
      default: [],
    },
    rating: {
      type: Number,
      default: 5,
      min: 1,
      max: 5,
    },
    total_ratings: {
      type: Number,
      default: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    suspension_reason: {
      type: String,
      default: null,
      trim: true,
    },
    restriction_type: {
      type: String,
      enum: ['none', ...RIDER_RESTRICTION_TYPES],
      default: 'none',
      index: true,
    },
    restriction_reason: {
      type: String,
      default: null,
      trim: true,
    },
    restriction_started_at: {
      type: Date,
      default: null,
    },
    restriction_expires_at: {
      type: Date,
      default: null,
      index: true,
    },
    restriction_reinstatement_state: {
      type: String,
      enum: RIDER_RESTRICTION_REINSTATEMENT_STATES,
      default: 'none',
    },
    restriction_lifted_at: {
      type: Date,
      default: null,
    },
    restriction_lifted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    restriction_history: {
      type: [restrictionHistorySchema],
      default: [],
    },
    suspended_at: {
      type: Date,
      default: null,
    },
    suspended_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reinstated_at: {
      type: Date,
      default: null,
    },
    reinstated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    activation_date: {
      type: Date,
      default: Date.now,
    },
    last_delivery_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

riderSchema.index({ hub_id: 1, current_status: 1 });
riderSchema.index({ hub_id: 1, gps_location: '2dsphere' });
riderSchema.index({ 'daily_earnings.date': -1 });
riderSchema.index({ hub_id: 1, kyc_status: 1, is_active: 1 });
riderSchema.index({ 'device_binding.status': 1 });
riderSchema.index({ hub_id: 1, performance_score: -1 });
riderSchema.index({ restriction_type: 1, restriction_expires_at: 1 });

const maskDeviceHash = (hash) => (hash ? `${String(hash).slice(0, 8)}...${String(hash).slice(-6)}` : null);

const formatDeviceBinding = (binding = {}, includeInternal = false, history = []) => {
  const status = binding?.status || 'unbound';
  const payload = {
    status,
    is_bound: Boolean(binding?.device_id_hash) || ['bound', 'frozen'].includes(status),
    device_label: binding?.device_label || null,
    platform: binding?.platform || null,
    bound_at: binding?.bound_at || null,
    last_seen_at: binding?.last_seen_at || null,
    last_ip: includeInternal ? binding?.last_ip || null : null,
    frozen_at: binding?.frozen_at || null,
    freeze_reason: binding?.freeze_reason || null,
    mismatch_device_label: includeInternal ? binding?.mismatch_device_label || null : null,
    unbound_at: binding?.unbound_at || null,
    unbound_by: includeInternal ? binding?.unbound_by || null : null,
    unbind_reason: binding?.unbind_reason || null,
  };

  if (includeInternal) {
    payload.device_id_fingerprint = maskDeviceHash(binding?.device_id_hash);
    payload.mismatch_device_fingerprint = maskDeviceHash(binding?.mismatch_device_id_hash);
    payload.history = (history || []).slice(-10).map((event) => ({
      event: event.event,
      reason: event.reason,
      actor_id: event.actor_id,
      actor_role: event.actor_role,
      device_id_fingerprint: maskDeviceHash(event.device_id_hash),
      device_label: event.device_label,
      platform: event.platform,
      ip_address: event.ip_address,
      occurred_at: event.occurred_at,
    }));
  }

  return payload;
};

riderSchema.methods.toPublicJSON = function toPublicJSON(options = {}) {
  const user = this.user_id && typeof this.user_id === 'object' ? this.user_id : null;
  const includeInternal = Boolean(options.includeInternal);
  const restriction = getRiderRestrictionSnapshot(this);
  const exposedRestrictionType = this.restriction_type && this.restriction_type !== 'none'
    ? this.restriction_type
    : restriction.type;
  const exposedReinstatementState = this.restriction_reinstatement_state && this.restriction_reinstatement_state !== 'none'
    ? this.restriction_reinstatement_state
    : restriction.reinstatement_state;

  const payload = {
    id: this._id,
    user_id: user?._id || this.user_id,
    full_name: this.full_name,
    phone: this.phone,
    years_experience: this.years_experience,
    district: this.district,
    division: this.division,
    boda_stage: this.boda_stage,
    stage_chairman_phone: this.stage_chairman_phone,
    vehicle_type: this.vehicle_type,
    bike_plate: this.bike_plate,
    nin_number: this.nin_number,
    next_of_kin: this.next_of_kin,
    bond_amount: this.bond_amount,
    bond_target_amount: this.bond_target_amount,
    bond_status: this.bond_status,
    bond_reference: this.bond_reference,
    bond_verified_at: this.bond_verified_at,
    bond_verified_by: this.bond_verified_by,
    bond_rejected_at: this.bond_rejected_at,
    bond_rejected_by: this.bond_rejected_by,
    bond_rejection_reason: this.bond_rejection_reason,
    bond_history: (this.bond_history || []).map((entry) => ({
      action: entry.action,
      amount: entry.amount,
      previous_status: entry.previous_status,
      next_status: entry.next_status,
      reference: entry.reference,
      note: entry.note,
      actor_id: entry.actor_id,
      actor_role: entry.actor_role,
      created_at: entry.created_at,
    })),
    current_status: this.current_status,
    gps_location: this.gps_location,
    current_cod: this.current_cod,
    performance_score: this.performance_score,
    dispatch_metrics: this.dispatch_metrics,
    total_deliveries: this.total_deliveries,
    successful_deliveries: this.successful_deliveries,
    failed_deliveries: this.failed_deliveries,
    returned_orders: this.returned_orders,
    earnings: this.earnings,
    pending_payout: this.pending_payout,
    operational_balance: {
      current_cod: this.current_cod,
      pending_payout: this.pending_payout,
      cod_operation_limit: RIDER_COD_OPERATION_LIMIT,
      over_cod_limit: Number(this.current_cod || 0) >= RIDER_COD_OPERATION_LIMIT,
    },
    hub_id: this.hub_id,
    documents: this.documents,
    all_documents_verified: this.all_documents_verified,
    kyc_status: this.kyc_status,
    kyc_verified_at: this.kyc_verified_at,
    kyc_rejection_reason: this.kyc_rejection_reason,
    policy_acceptances: (this.policy_acceptances || []).map((acceptance) => ({
      key: acceptance.key,
      audience: acceptance.audience,
      title: acceptance.title,
      version: acceptance.version,
      file_name: acceptance.file_name,
      accepted_at: acceptance.accepted_at,
      accepted_ip: includeInternal ? acceptance.accepted_ip : undefined,
      accepted_user_agent: includeInternal ? acceptance.accepted_user_agent : undefined,
    })),
    incidents: (this.incidents || []).map((incident, index) => ({
      id: incident._id ? String(incident._id) : String(index),
      type: incident.type,
      description: incident.description,
      location: incident.location,
      reported_by: includeInternal ? incident.reported_by : undefined,
      status: incident.status,
      priority: incident.priority || 'normal',
      resolution: incident.resolution,
      escalated_at: incident.escalated_at,
      escalated_by: includeInternal ? incident.escalated_by : undefined,
      status_history: includeInternal ? (incident.status_history || []) : undefined,
      reported_at: incident.reported_at,
      resolved_at: incident.resolved_at,
    })),
    account_locked: Boolean(user?.account_locked),
    failed_login_attempts: user?.failed_login_attempts || 0,
    locked_at: user?.locked_at || null,
    locked_reason: user?.locked_reason || null,
    unlocked_at: user?.unlocked_at || null,
    device_binding: formatDeviceBinding(this.device_binding, includeInternal, this.device_binding_history),
    rating: this.rating,
    total_ratings: this.total_ratings,
    is_active: this.is_active,
    suspension_reason: this.suspension_reason,
    restriction,
    restriction_type: exposedRestrictionType,
    restriction_reason: this.restriction_reason || restriction.reason,
    restriction_started_at: this.restriction_started_at || restriction.started_at,
    restriction_expires_at: this.restriction_expires_at || restriction.expires_at,
    restriction_reinstatement_state: exposedReinstatementState,
    restriction_lifted_at: this.restriction_lifted_at,
    suspended_at: this.suspended_at,
    reinstated_at: this.reinstated_at,
    activation_date: this.activation_date,
    last_delivery_at: this.last_delivery_at,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };

  if (includeInternal) {
    payload.admin_verification_notes = this.admin_verification_notes;
    payload.admin_verification_notes_by = this.admin_verification_notes_by;
    payload.admin_verification_notes_at = this.admin_verification_notes_at;
    payload.restriction_history = (this.restriction_history || []).slice(-20);
  }

  return payload;
};

riderSchema.methods.toSummaryJSON = function toSummaryJSON() {
  const user = this.user_id && typeof this.user_id === 'object' ? this.user_id : null;
  const restriction = getRiderRestrictionSnapshot(this);
  const exposedRestrictionType = this.restriction_type && this.restriction_type !== 'none'
    ? this.restriction_type
    : restriction.type;
  const exposedReinstatementState = this.restriction_reinstatement_state && this.restriction_reinstatement_state !== 'none'
    ? this.restriction_reinstatement_state
    : restriction.reinstatement_state;

  return {
    id: this._id,
    full_name: this.full_name,
    phone: this.phone,
    years_experience: this.years_experience,
    district: this.district,
    division: this.division,
    boda_stage: this.boda_stage,
    stage_chairman_phone: this.stage_chairman_phone,
    vehicle_type: this.vehicle_type,
    bike_plate: this.bike_plate,
    bond_amount: this.bond_amount,
    bond_target_amount: this.bond_target_amount,
    bond_status: this.bond_status,
    bond_reference: this.bond_reference,
    bond_verified_at: this.bond_verified_at,
    bond_rejection_reason: this.bond_rejection_reason,
    bond_history: (this.bond_history || []).slice(-10),
    current_status: this.current_status,
    gps_location: this.gps_location,
    performance_score: this.performance_score,
    dispatch_metrics: this.dispatch_metrics,
    total_deliveries: this.total_deliveries,
    earnings: this.earnings,
    pending_payout: this.pending_payout,
    operational_balance: {
      current_cod: this.current_cod,
      pending_payout: this.pending_payout,
      cod_operation_limit: RIDER_COD_OPERATION_LIMIT,
      over_cod_limit: Number(this.current_cod || 0) >= RIDER_COD_OPERATION_LIMIT,
    },
    hub_id: this.hub_id,
    rating: this.rating,
    is_active: this.is_active,
    restriction,
    restriction_type: exposedRestrictionType,
    restriction_reason: this.restriction_reason || restriction.reason,
    restriction_expires_at: this.restriction_expires_at || restriction.expires_at,
    restriction_reinstatement_state: exposedReinstatementState,
    kyc_status: this.kyc_status,
    all_documents_verified: this.all_documents_verified,
    account_locked: Boolean(user?.account_locked),
    device_binding: formatDeviceBinding(this.device_binding, false, []),
  };
};

module.exports = mongoose.model('Rider', riderSchema);
