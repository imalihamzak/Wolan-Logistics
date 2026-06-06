import { useEffect, useMemo, useState } from "react";
import AppLoader, { LoaderGlyph, LoadingButtonContent } from "../components/AppLoader";
import { DriverDashboardSkeleton } from "../components/DashboardSkeletons";
import Header from "../components/Header";
import { CustomSelect } from "../components/ui/custom-select";
import GuidedEmptyState from "../components/GuidedEmptyState";
import SupportPanel from "../components/SupportPanel";
import WorkflowStepper from "../components/WorkflowStepper";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/api";
import { connectRealtimeSocket } from "../lib/realtime";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  BikeIcon,
  Building2Icon,
  CameraIcon,
  CarIcon,
  Clock3Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LocateFixedIcon,
  MapPinnedIcon,
  NavigationIcon,
  PhoneCallIcon,
  RefreshCwIcon,
  ScanLineIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TagIcon,
  TimerResetIcon,
  TruckIcon,
  UserCheckIcon,
  UsersIcon,
  WifiOffIcon,
  CircleAlertIcon,
  LockOpenIcon,
} from "lucide-react";

type RiderStatus = "available" | "on_delivery" | "break" | "offline";
type OrderStatus = "pending" | "picked_up" | "at_hub" | "out_for_delivery" | "delivered" | "failed" | "returned";
type VehicleType = "moto" | "voiture" | "velo";
type KycStatus = "not_submitted" | "pending" | "verified" | "rejected";
type RiderDocumentType = "id_card" | "license" | "rider_photo" | "bike_photo" | "bike_registration" | "insurance" | "other";
type RiderRestrictionType = "none" | "soft_block" | "hard_block" | "permanent_suspension" | "manual_suspension" | "security_freeze";
type RiderBondStatus = "pending" | "registered" | "approved" | "rejected" | "deposited" | "refunded" | "forfeited";
type RiderReinstatementState =
  | "operational"
  | "none"
  | "restricted"
  | "eligible_for_reinstatement"
  | "admin_review_required"
  | "permanent_review_required"
  | "reinstated";

type RiderDocument = {
  type: RiderDocumentType;
  url?: string | null;
  public_id?: string | null;
  verified?: boolean;
  uploaded_at?: string;
};

type DeviceBindingStatus = "unbound" | "bound" | "frozen";

type RiderDeviceBinding = {
  status?: DeviceBindingStatus;
  is_bound?: boolean;
  device_label?: string | null;
  platform?: string | null;
  bound_at?: string | null;
  last_seen_at?: string | null;
  last_ip?: string | null;
  frozen_at?: string | null;
  freeze_reason?: string | null;
  mismatch_device_label?: string | null;
  unbound_at?: string | null;
  unbind_reason?: string | null;
  device_id_fingerprint?: string | null;
  mismatch_device_fingerprint?: string | null;
};

type RiderDispatchMetrics = {
  performance_score?: number;
  priority_score?: number;
  acceptance_rate?: number;
  cancellation_ratio?: number;
  punctuality_rate?: number;
  customer_rating_score?: number;
  complaint_score?: number;
  gps_consistency_score?: number;
  proximity_score?: number;
  assignments_total?: number;
  accepted_assignments?: number;
  rejected_assignments?: number;
  expired_assignments?: number;
  complaint_count?: number;
  gps_divergence_count?: number;
  gps_fresh?: boolean;
  distance_km?: number | null;
  calculated_at?: string | null;
};

type RiderRestriction = {
  active?: boolean;
  type?: RiderRestrictionType;
  label?: string;
  reason?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  remaining_ms?: number;
  remaining_label?: string;
  reinstatement_state?: RiderReinstatementState;
  reinstatement_label?: string;
};

type RiderBondHistoryEntry = {
  action?: string;
  amount?: number;
  previous_status?: string | null;
  next_status?: string | null;
  reference?: string | null;
  note?: string | null;
  actor_role?: string | null;
  created_at?: string;
};

type RiderRecord = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  years_experience?: number;
  district?: string | null;
  division?: string | null;
  boda_stage?: string | null;
  stage_chairman_phone?: string | null;
  vehicle_type?: VehicleType | null;
  bike_plate: string;
  current_status: RiderStatus;
  gps_location?: { type?: string; coordinates?: [number, number] };
  current_cod?: number;
  performance_score?: number;
  dispatch_metrics?: RiderDispatchMetrics;
  total_deliveries?: number;
  successful_deliveries?: number;
  failed_deliveries?: number;
  returned_orders?: number;
  earnings?: number;
  pending_payout?: number;
  operational_balance?: SettlementBalance;
  hub_id?: string | {
    id?: string;
    _id?: string;
    name?: string;
    code?: string;
    city?: string;
    coordinates?: { latitude?: number; longitude?: number };
  };
  bond_amount?: number;
  bond_target_amount?: number;
  bond_status?: RiderBondStatus;
  bond_reference?: string | null;
  bond_verified_at?: string | null;
  bond_rejection_reason?: string | null;
  bond_history?: RiderBondHistoryEntry[];
  rating?: number;
  total_ratings?: number;
  is_active?: boolean;
  kyc_status?: KycStatus;
  kyc_rejection_reason?: string | null;
  policy_acceptances?: PolicyAcceptanceRecord[];
  all_documents_verified?: boolean;
  documents?: RiderDocument[];
  admin_verification_notes?: string | null;
  admin_verification_notes_at?: string | null;
  account_locked?: boolean;
  failed_login_attempts?: number;
  locked_reason?: string | null;
  device_binding?: RiderDeviceBinding;
  restriction?: RiderRestriction;
  restriction_type?: RiderRestrictionType | null;
  restriction_reason?: string | null;
  restriction_started_at?: string | null;
  restriction_expires_at?: string | null;
  restriction_reinstatement_state?: RiderReinstatementState | null;
  restriction_lifted_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  reinstated_at?: string | null;
  last_location_update?: string;
};

type PolicyAcceptanceRecord = {
  key: string;
  audience: "merchant" | "rider";
  title: string;
  version: string;
  file_name: string;
  accepted_at: string;
};

type PolicyDocument = {
  key: string;
  audience: "merchant" | "rider";
  title: string;
  version: string;
  file_name: string;
  required: boolean;
  file_available?: boolean;
  download_url?: string;
};

type OrderRecord = {
  id: string;
  order_id: string;
  rider_id?: string | { id?: string; _id?: string } | null;
  package_tracking_id: string;
  physical_tracker_id?: string | null;
  physical_tracker_linked_at?: string | null;
  rider_tracking_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  pickup_coordinates?: { type?: string; coordinates?: [number, number] } | { latitude?: number; longitude?: number } | null;
  dropoff_coordinates?: { type?: string; coordinates?: [number, number] } | { latitude?: number; longitude?: number } | null;
  item_description: string;
  declared_value: number;
  order_status: OrderStatus;
  delivery_zone: string;
  delivery_fee: number;
  pricing_currency?: string;
  pricing_distance_km?: number | null;
  pricing_duration_seconds?: number | null;
  pricing_source?: string | null;
  route_geometry?: { type?: "LineString"; coordinates?: number[][] } | null;
  pricing_tier_label?: string | null;
  service_level?: "standard" | "express";
  express_requested?: boolean;
  cod_amount: number;
  delivery_attempts?: number;
  assignment_response_status?: "pending" | "accepted" | "rejected" | "expired" | null;
  assignment_response_due_at?: string | null;
  handover_verified?: boolean;
  hub_scan_in?: string | null;
  failed_reason?: string | null;
  return_reason?: string | null;
  delivery_proof_upload_id?: string | null;
  return_proof_upload_id?: string | null;
  tracker_divergence_alert?: boolean;
  tracker_divergence_distance?: number;
  hub_id?: string | { id?: string; _id?: string } | null;
  dev_otp_code?: string | null;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  at_hub_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  returned_at?: string | null;
};

type EarningsSummary = {
  period?: { from?: string; to?: string };
  deliveries?: number;
  successful_deliveries?: number;
  failed_deliveries?: number;
  returned_orders?: number;
  gross_earnings?: number;
  cod_collected?: number;
  total_fines?: number;
  net_earnings?: number;
  pending_payout?: number;
  total_earnings?: number;
  rider_payout_share?: number;
  platform_share?: number;
  cod_operation_limit?: number;
};

type DailySummary = {
  date?: string;
  deliveries?: number;
  successful_deliveries?: number;
  failed_deliveries?: number;
  returned_orders?: number;
  gross_earnings?: number;
  earnings?: number;
  cod_collected?: number;
  fines?: number;
  bonus?: number;
  platform_share?: number;
  net_earnings?: number;
};

type IncidentRecord = {
  id?: string;
  _id?: string;
  type: string;
  description: string;
  location?: string | null;
  status?: "open" | "investigating" | "escalated" | "resolved" | "closed" | string;
  priority?: "normal" | "high" | "critical" | string;
  resolution?: string | null;
  escalated_at?: string | null;
  reported_at?: string;
  resolved_at?: string | null;
};

type SettlementStatus = "requested" | "approved" | "rejected" | "completed" | "cancelled";
type SettlementType = "withdrawal" | "cod_settlement";

type SettlementBalance = {
  current_cod?: number;
  pending_payout?: number;
  pending_fines?: number;
  available_withdrawal?: number;
  cod_operation_limit?: number;
  over_cod_limit?: boolean;
  can_receive_assignments?: boolean;
  can_request_withdrawal?: boolean;
  restriction_reason?: string | null;
};

type SettlementRecord = {
  id: string;
  reference: string;
  rider_id?: string | { id?: string; _id?: string; full_name?: string; phone?: string } | null;
  type: SettlementType;
  status: SettlementStatus;
  amount: number;
  payout_amount?: number;
  cod_amount?: number;
  method?: string;
  account_name?: string | null;
  account_phone?: string | null;
  note?: string | null;
  admin_note?: string | null;
  rejection_reason?: string | null;
  completion_reference?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  completed_at?: string | null;
  status_history?: Array<{
    status: SettlementStatus;
    note?: string | null;
    actor_role?: string | null;
    created_at?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

const driverStatuses: { label: string; value: RiderStatus }[] = [
  { label: "Available", value: "available" },
  { label: "On Delivery", value: "on_delivery" },
  { label: "Break", value: "break" },
  { label: "Offline", value: "offline" },
];

const vehicleOptions: Array<{ label: string; value: VehicleType; Icon: typeof TruckIcon }> = [
  { label: "Moto / Boda Boda", value: "moto", Icon: TruckIcon },
  { label: "Voiture / Car/Van", value: "voiture", Icon: CarIcon },
  { label: "Velo / Bicycle", value: "velo", Icon: BikeIcon },
];

const vehicleLabel = (value?: string | null) => (
  vehicleOptions.find((item) => item.value === value)?.label || "Not set"
);

const readOrderPoint = (value: OrderRecord["pickup_coordinates"] | OrderRecord["dropoff_coordinates"]) => {
  if (!value || typeof value !== "object") return null;

  if ("coordinates" in value && Array.isArray(value.coordinates)) {
    const [longitude, latitude] = value.coordinates.map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }

  const latitude = Number((value as { latitude?: number }).latitude);
  const longitude = Number((value as { longitude?: number }).longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

const buildOrderMapUrl = (order?: OrderRecord | null, vehicleType?: VehicleType | null) => {
  if (!order) return null;
  const pickup = readOrderPoint(order.pickup_coordinates);
  const dropoff = readOrderPoint(order.dropoff_coordinates);
  const engine = vehicleType === "velo" ? "fossgis_osrm_bike" : "fossgis_osrm_car";

  if (pickup && dropoff) {
    return `https://www.openstreetmap.org/directions?engine=${engine}&route=${pickup.latitude},${pickup.longitude};${dropoff.latitude},${dropoff.longitude}`;
  }

  if (order.delivery_address) {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(order.delivery_address)}`;
  }

  return null;
};

const kycConfig: Record<KycStatus, { label: string; classes: string; textClass: string }> = {
  verified: { label: "KYC Verified", classes: "border-success/20 bg-success/10 text-success", textClass: "text-success" },
  pending: { label: "Pending Verification", classes: "border-warning/20 bg-warning/10 text-warning", textClass: "text-warning" },
  not_submitted: { label: "KYC Needed", classes: "border-border bg-muted text-muted-foreground", textClass: "text-muted-foreground" },
  rejected: { label: "KYC Rejected", classes: "border-destructive/20 bg-destructive/10 text-destructive", textClass: "text-destructive" },
};

const getKycConfig = (status?: string | null) => kycConfig[(status as KycStatus) || "pending"] || kycConfig.pending;

const requiredRiderDocuments: Array<{ type: RiderDocumentType; label: string }> = [
  { type: "id_card", label: "National ID / Passport" },
  { type: "license", label: "Driving Permit" },
  { type: "rider_photo", label: "Rider Photograph" },
  { type: "bike_photo", label: "Bike Photograph" },
];

const findRiderDocument = (rider: RiderRecord | null | undefined, type: RiderDocumentType) =>
  rider?.documents?.find((document) => document.type === type) || null;

const hasAllRequiredRiderDocuments = (rider: RiderRecord | null | undefined) =>
  requiredRiderDocuments.every((document) => Boolean(findRiderDocument(rider, document.type)));

const objectIdPattern = /^[a-f\d]{24}$/i;
const hasStoredRiderDocumentReference = (document: RiderDocument | null | undefined) =>
  Boolean(document?.public_id && objectIdPattern.test(String(document.public_id)));

const isRiderDocumentReviewable = (document: RiderDocument | null | undefined) => Boolean(
  hasStoredRiderDocumentReference(document)
  || (typeof document?.url === "string" && /^https?:\/\//i.test(document.url))
);

const hasAllRequiredRiderDocumentsReviewable = (rider: RiderRecord | null | undefined) =>
  requiredRiderDocuments.every((document) => hasStoredRiderDocumentReference(findRiderDocument(rider, document.type)));

const incidentTypes = [
  { label: "Accident", value: "accident" },
  { label: "Theft", value: "theft" },
  { label: "Mechanical failure", value: "damage" },
  { label: "Police stop", value: "complaint" },
  { label: "Other", value: "other" },
];

const deliverySetupSteps = [
  { label: "Assignment", helper: "Accept or reject." },
  { label: "Handover", helper: "Merchant key." },
  { label: "Pickup", helper: "Custody confirmed." },
  { label: "Hub Scan", helper: "Hub manager." },
  { label: "Delivery", helper: "Navigate out." },
  { label: "Finish", helper: "OTP or issue." },
];

const activeStatuses: OrderStatus[] = ["pending", "picked_up", "at_hub", "out_for_delivery"];

const formatCurrency = (value: number | undefined | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${new Intl.NumberFormat("en-US").format(Math.round(value))} UGX`;
};

const formatCompactCurrency = (value: number | undefined | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  if (Math.abs(value) >= 1000000) {
    return `${Math.round(value / 100000) / 10}M UGX`;
  }

  if (Math.abs(value) >= 1000) {
    return `${Math.round(value / 1000)}K UGX`;
  }

  return `${Math.round(value)} UGX`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const SECURITY_BOND_AMOUNT = 250000;

const bondStatusConfig: Record<RiderBondStatus, { label: string; classes: string; textClass: string }> = {
  pending: {
    label: "Pending",
    classes: "border-warning/20 bg-warning/10 text-warning",
    textClass: "text-warning",
  },
  registered: {
    label: "Registered",
    classes: "border-primary/20 bg-primary/10 text-primary",
    textClass: "text-primary",
  },
  approved: {
    label: "Approved",
    classes: "border-success/20 bg-success/10 text-success",
    textClass: "text-success",
  },
  rejected: {
    label: "Rejected",
    classes: "border-destructive/20 bg-destructive/10 text-destructive",
    textClass: "text-destructive",
  },
  deposited: {
    label: "Approved / Deposited",
    classes: "border-success/20 bg-success/10 text-success",
    textClass: "text-success",
  },
  refunded: {
    label: "Refunded",
    classes: "border-muted bg-muted text-muted-foreground",
    textClass: "text-muted-foreground",
  },
  forfeited: {
    label: "Forfeited",
    classes: "border-destructive/20 bg-destructive/10 text-destructive",
    textClass: "text-destructive",
  },
};

const getBondConfig = (status?: string | null) => (
  bondStatusConfig[(status || "pending") as RiderBondStatus] || bondStatusConfig.pending
);

const distanceKm = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) => {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatCountdown = (dueAt?: string | null, assignedAt?: string | null) => {
  let deadline = dueAt ? new Date(dueAt).getTime() : Number.NaN;

  if (Number.isNaN(deadline) && assignedAt) {
    deadline = new Date(assignedAt).getTime() + 5 * 60 * 1000;
  }

  if (Number.isNaN(deadline)) {
    return "05:00";
  }

  const remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
};

const restrictionTypeOptions = [
  { value: "soft_block", label: "Soft Block (12-48 hours)" },
  { value: "hard_block", label: "Hard Block (7-30 days)" },
  { value: "permanent_suspension", label: "Permanent Suspension" },
];

const restrictionTypeLabels: Record<RiderRestrictionType, string> = {
  none: "No Restriction",
  soft_block: "Soft Block",
  hard_block: "Hard Block",
  permanent_suspension: "Permanent Suspension",
  manual_suspension: "Manual Suspension",
  security_freeze: "Security Freeze",
};

const formatRestrictionCountdown = (remainingMs?: number | null) => {
  const safeRemaining = Math.max(0, Number(remainingMs || 0));

  if (!safeRemaining) {
    return "00:00:00";
  }

  const totalSeconds = Math.ceil(safeRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const getRiderRestriction = (rider: RiderRecord | null | undefined, nowMs = Date.now()): RiderRestriction => {
  const type = rider?.restriction?.type || rider?.restriction_type || (!rider?.is_active && rider?.suspension_reason ? "manual_suspension" : "none");
  const reason = rider?.restriction?.reason || rider?.restriction_reason || rider?.suspension_reason || null;
  const startedAt = rider?.restriction?.started_at || rider?.restriction_started_at || rider?.suspended_at || null;
  const expiresAt = rider?.restriction?.expires_at || rider?.restriction_expires_at || null;
  const expiresTime = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  const active = rider?.restriction?.active ?? (rider?.is_active === false);
  const remainingMs = Number.isFinite(expiresTime) ? Math.max(0, expiresTime - nowMs) : rider?.restriction?.remaining_ms ?? 0;
  const label = rider?.restriction?.label || restrictionTypeLabels[type as RiderRestrictionType] || "Restriction";
  let reinstatementState: RiderReinstatementState = rider?.restriction?.reinstatement_state || rider?.restriction_reinstatement_state || "none";
  let reinstatementLabel = rider?.restriction?.reinstatement_label || "No active restriction";

  if (active) {
    if (type === "permanent_suspension") {
      reinstatementState = "permanent_review_required";
      reinstatementLabel = "Permanent suspension remains until admin reinstatement.";
    } else if ((type === "soft_block" || type === "hard_block") && Number.isFinite(expiresTime)) {
      if (remainingMs > 0) {
        reinstatementState = "restricted";
        reinstatementLabel = `Reinstatement locked for ${formatRestrictionCountdown(remainingMs)}.`;
      } else {
        reinstatementState = "eligible_for_reinstatement";
        reinstatementLabel = "Penalty window ended; admin reinstatement is available.";
      }
    } else if (type === "security_freeze") {
      reinstatementState = "admin_review_required";
      reinstatementLabel = "Device security review and admin unbinding are required.";
    } else {
      reinstatementState = "admin_review_required";
      reinstatementLabel = "Admin review is required before reinstatement.";
    }
  }

  return {
    active,
    type: type as RiderRestrictionType,
    label,
    reason,
    started_at: startedAt,
    expires_at: expiresAt,
    remaining_ms: remainingMs,
    remaining_label: formatRestrictionCountdown(remainingMs),
    reinstatement_state: reinstatementState,
    reinstatement_label: reinstatementLabel,
  };
};

const hasGpsFix = (rider?: RiderRecord | null) => Boolean(rider?.gps_location?.coordinates?.some((coordinate) => coordinate !== 0));

const formatScore = (value?: number | null) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "Not scored";

const extractApiData = <T,>(response: { data?: { data?: T } } | null) => response?.data?.data;

const readId = (value: string | { id?: string; _id?: string } | null | undefined) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || value._id || null;
};

const getOrderHubId = (order?: OrderRecord | null) => {
  return readId(order?.hub_id);
};

const orderRealtimeEvents = [
  "order:created",
  "order:batch-created",
  "merchant:order-status-updated",
  "order:pickup-agent-assigned",
  "order:assigned",
  "order:rider-accepted",
  "order:assignment-responded",
  "order:handover-verified",
  "order:custody-confirmed",
  "order:hub-scanned-in",
  "order:package-at-hub",
  "order:status-updated",
  "order:otp-verified",
  "order:failed",
  "order:returned",
];

const settlementRealtimeEvents = [
  "rider:settlement-requested",
  "rider:settlement-updated",
  "rider:settlement-completed",
];

const extractRealtimeOrders = (payload: any): OrderRecord[] => {
  if (Array.isArray(payload?.orders)) {
    return payload.orders;
  }

  if (payload?.order) {
    return [payload.order];
  }

  return payload?.id ? [payload] : [];
};

type DriverScreen = "admin" | "dashboard" | "orders" | "order-details" | "wallet" | "profile" | "support";
type DriverDashboardView = "status" | "orders" | "wallet";
type DriverOrderActionView = "setup" | "actions" | "incident";
type DriverWalletView = "summary" | "request" | "history";
type AdminRiderView = "overview" | "kyc" | "security" | "orders" | "finance" | "support";

interface DriversProps {
  screen?: DriverScreen;
}

export default function Drivers({ screen = "admin" }: DriversProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { orderId } = useParams();
  const isRiderAccount = user?.role === "rider";
  const canSwitchRiders = Boolean(user && !isRiderAccount);

  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [selectedRider, setSelectedRider] = useState<RiderRecord | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<EarningsSummary | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [settlementBalance, setSettlementBalance] = useState<SettlementBalance | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState(incidentTypes[0].value);
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentAdminNote, setIncidentAdminNote] = useState("");
  const [withdrawalDraft, setWithdrawalDraft] = useState({ amount: "", account_phone: "", note: "" });
  const [codSettlementDraft, setCodSettlementDraft] = useState({ amount: "", note: "" });
  const [settlementActionDraft, setSettlementActionDraft] = useState({ admin_note: "", completion_reference: "" });
  const [vehicleTypeDraft, setVehicleTypeDraft] = useState<VehicleType>("moto");
  const [profileDraft, setProfileDraft] = useState({ full_name: "", phone: "", bike_plate: "", stage_chairman_phone: "" });
  const [bondDraft, setBondDraft] = useState({ amount: String(SECURITY_BOND_AMOUNT), reference: "", note: "" });
  const [adminVerificationNotes, setAdminVerificationNotes] = useState("");
  const [deviceUnbindReason, setDeviceUnbindReason] = useState("");
  const [restrictionDraft, setRestrictionDraft] = useState({
    type: "soft_block" as Extract<RiderRestrictionType, "soft_block" | "hard_block" | "permanent_suspension">,
    duration: "12",
    reason: "",
  });
  const [gpsTrackingEnabled, setGpsTrackingEnabled] = useState(true);
  const [otpValue, setOtpValue] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [trackerCode, setTrackerCode] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailFetchAttempted, setDetailFetchAttempted] = useState<string | null>(null);
  const [riderPolicies, setRiderPolicies] = useState<PolicyDocument[]>([]);
  const [now, setNow] = useState(Date.now());
  const [driverDashboardView, setDriverDashboardView] = useState<DriverDashboardView>("status");
  const [driverOrderActionView, setDriverOrderActionView] = useState<DriverOrderActionView>("setup");
  const [driverWalletView, setDriverWalletView] = useState<DriverWalletView>("summary");
  const [adminRiderView, setAdminRiderView] = useState<AdminRiderView>("overview");

  const driverSegmentedButtonClass = (active: boolean) => `rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
    active ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
  }`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadRiderPolicies = async () => {
    try {
      const { data } = await api.get("/auth/policies", { params: { audience: "rider" } });
      setRiderPolicies(data?.data?.policies || data?.policies || []);
    } catch (error) {
      setRiderPolicies([]);
    }
  };

  useEffect(() => {
    loadRiderPolicies();
  }, []);

  const policyDownloadHref = (policy: PolicyDocument) => {
    const configuredBase = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");
    const path = policy.download_url || `/api/v1/auth/policies/${encodeURIComponent(policy.key)}/download`;
    if (/^https?:\/\//i.test(path)) return path;
    if (/^https?:\/\//i.test(configuredBase) && path.startsWith("/api/")) {
      const url = new URL(configuredBase);
      return `${url.origin}${path}`;
    }
    return path.startsWith("/api/") ? path : `${configuredBase}${path.startsWith("/") ? "" : "/"}${path}`;
  };

  const acceptRiderPolicies = async () => {
    const requiredPolicyKeys = riderRequiredPolicies.map((policy) => policy.key);
    if (requiredPolicyKeys.length === 0) {
      toast.error("Rider policy documents are not loaded yet");
      return;
    }
    if (riderUnavailableRequiredPolicies.length > 0) {
      toast.error("Required rider policy files are unavailable on the server. Redeploy the Policy folder first.");
      return;
    }

    setActionLoading("accept-policies");
    try {
      const { data } = await api.post("/auth/policies/accept", { accepted_policy_keys: requiredPolicyKeys });
      const updatedRider = data?.data?.rider || data?.rider;
      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }
      toast.success("Rider legal agreements accepted");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Policy acceptance failed");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const loadRoster = async () => {
      setPageLoading(true);
      setErrorMessage(null);

      try {
        if (isRiderAccount) {
          const riderResponse = await api.get('/auth/riders/me');
          const rider = extractApiData<{ rider?: RiderRecord }>(riderResponse)?.rider ?? null;

          if (!cancelled) {
            setRiders(rider ? [rider] : []);
            setSelectedRider(rider);
          }
          return;
        }

        const riderResponse = await api.get('/auth/riders', {
          params: {
            limit: 25,
            ...(user.hub_id ? { hub_id: user.hub_id } : {}),
          },
        });

        const roster = extractApiData<{ riders?: RiderRecord[] }>(riderResponse)?.riders ?? [];

        if (!cancelled) {
          setRiders(roster);
          setSelectedRider(roster[0] ?? null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(error.response?.data?.message || 'Failed to load rider workspace');
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    };

    loadRoster();

    return () => {
      cancelled = true;
    };
  }, [isRiderAccount, user]);

  useEffect(() => {
    if (!selectedRider || !user) {
      return;
    }

    let cancelled = false;

    const loadSelectedRiderData = async () => {
      setDetailLoading(true);
      setErrorMessage(null);

      try {
        const riderQueryId = getRiderQueryId();
        const [ordersResponse, earningsResponse, dailySummaryResponse, incidentsResponse, settlementsResponse] = await Promise.all([
          api.get('/auth/orders', {
            params: {
              limit: 50,
              rider_id: riderQueryId,
            },
          }),
          api.get(isRiderAccount ? '/auth/riders/me/earnings' : `/auth/riders/${selectedRider.id}/earnings`),
          isRiderAccount ? api.get('/auth/riders/me/daily-summary') : Promise.resolve(null),
          isRiderAccount ? api.get('/auth/riders/me/incidents') : api.get(`/auth/riders/${selectedRider.id}/incidents`),
          api.get('/auth/riders/settlements', {
            params: {
              limit: 25,
              ...(isRiderAccount ? {} : { rider_id: selectedRider.id }),
            },
          }),
        ]);

        const orderItems = extractApiData<{ orders?: OrderRecord[] }>(ordersResponse)?.orders ?? [];
        const nextEarnings = extractApiData<{ summary?: EarningsSummary }>(earningsResponse)?.summary ?? null;
        const nextDailySummary = dailySummaryResponse
          ? extractApiData<{ summary?: DailySummary }>(dailySummaryResponse)?.summary ?? null
          : null;
        const nextIncidents = incidentsResponse
          ? extractApiData<{ incidents?: IncidentRecord[] }>(incidentsResponse)?.incidents ?? []
          : [];
        const settlementData = extractApiData<{ settlements?: SettlementRecord[]; balance?: SettlementBalance }>(settlementsResponse);

        if (!cancelled) {
          setOrders(orderItems);
          setEarningsSummary(nextEarnings);
          setDailySummary(nextDailySummary);
          setIncidents(nextIncidents);
          setSettlements(settlementData?.settlements ?? []);
          setSettlementBalance(settlementData?.balance ?? null);
          setSelectedOrderId((currentOrderId) => {
            if (currentOrderId && orderItems.some((order) => order.id === currentOrderId)) {
              return currentOrderId;
            }

            return (orderItems.find((order) => activeStatuses.includes(order.order_status)) ?? orderItems[0] ?? null)?.id ?? null;
          });
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(error.response?.data?.message || 'Failed to load rider details');
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    loadSelectedRiderData();

    return () => {
      cancelled = true;
    };
  }, [isRiderAccount, selectedRider, user]);

  useEffect(() => {
    if (selectedRider && !gpsTrackingEnabled) {
      setGpsTrackingEnabled(hasGpsFix(selectedRider));
    }
  }, [selectedRider, gpsTrackingEnabled]);

  useEffect(() => {
    if (selectedRider?.vehicle_type) {
      setVehicleTypeDraft(selectedRider.vehicle_type);
    }

    if (selectedRider) {
      setProfileDraft({
        full_name: selectedRider.full_name || "",
        phone: selectedRider.phone || "",
        bike_plate: selectedRider.bike_plate || "",
        stage_chairman_phone: selectedRider.stage_chairman_phone || "",
      });
      setBondDraft({
        amount: String(Math.round(selectedRider.bond_amount ?? selectedRider.bond_target_amount ?? SECURITY_BOND_AMOUNT)),
        reference: selectedRider.bond_reference || "",
        note: "",
      });
      setAdminVerificationNotes(selectedRider.admin_verification_notes || "");
      setDeviceUnbindReason("");
      setRestrictionDraft({
        type: "soft_block",
        duration: "12",
        reason: "",
      });
      setWithdrawalDraft({
        amount: "",
        account_phone: selectedRider.phone || "",
        note: "",
      });
      setCodSettlementDraft({
        amount: selectedRider.current_cod ? String(Math.round(selectedRider.current_cod)) : "",
        note: "COD handed over to hub/admin",
      });
    }
  }, [selectedRider]);

  useEffect(() => {
    setOtpValue("");
    setProofFile(null);
    setTrackerCode("");
  }, [selectedOrderId]);

  const activeOrders = useMemo(() => orders.filter((order) => activeStatuses.includes(order.order_status)), [orders]);
  const selectedOrder = useMemo(
    () => {
      const routedOrder = orderId
        ? orders.find((order) => order.id === orderId || order.order_id === orderId)
        : null;
      if (orderId) {
        return routedOrder ?? null;
      }

      return selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : activeOrders[0] ?? orders[0] ?? null;
    },
    [activeOrders, orderId, orders, selectedOrderId]
  );

  useEffect(() => {
    if (!orderId || !orders.length) {
      return;
    }

    const routedOrder = orders.find((order) => order.id === orderId || order.order_id === orderId);
    if (routedOrder) {
      setSelectedOrderId(routedOrder.id);
    }
  }, [orderId, orders]);

  useEffect(() => {
    if (screen !== "order-details" || !orderId || detailLoading || orderDetailLoading || detailFetchAttempted === orderId) {
      return;
    }

    const existingOrder = orders.find((order) => order.id === orderId || order.order_id === orderId);
    if (existingOrder) {
      return;
    }

    setDetailFetchAttempted(orderId);
    setOrderDetailLoading(true);
    api.get(`/auth/orders/${orderId}`)
      .then(({ data }) => {
        const fetchedOrder = data?.data?.order as OrderRecord | undefined;
        if (!fetchedOrder?.id) {
          return;
        }

        setOrders((currentOrders) => {
          const exists = currentOrders.some((order) => order.id === fetchedOrder.id);
          return exists
            ? currentOrders.map((order) => (order.id === fetchedOrder.id ? fetchedOrder : order))
            : [fetchedOrder, ...currentOrders];
        });
        setSelectedOrderId(fetchedOrder.id);
      })
      .catch(() => {
        // The order action screen shows a not-selected state if this deep link is invalid.
      })
      .finally(() => {
        setOrderDetailLoading(false);
      });
  }, [detailFetchAttempted, detailLoading, orderDetailLoading, orderId, orders, screen]);
  const riderKycStatus = (selectedRider?.kyc_status || "pending") as KycStatus;
  const allRequiredKycDocumentsUploaded = hasAllRequiredRiderDocuments(selectedRider);
  const allRequiredKycDocumentsReviewable = hasAllRequiredRiderDocumentsReviewable(selectedRider);
  const riderKycComplete = Boolean(
    riderKycStatus === "verified"
    && selectedRider?.all_documents_verified === true
    && selectedRider?.stage_chairman_phone?.trim()
    && allRequiredKycDocumentsUploaded
  );
  const riderBaseCanOperate = Boolean(
    selectedRider?.is_active
    && !selectedRider?.account_locked
    && riderKycComplete
  );
  const adminVerificationNotesReady = adminVerificationNotes.trim().length >= 3;
  const codCarried = settlementBalance?.current_cod ?? selectedRider?.current_cod ?? 0;
  const pendingPayout = settlementBalance?.pending_payout ?? earningsSummary?.pending_payout ?? selectedRider?.pending_payout ?? 0;
  const pendingFines = settlementBalance?.pending_fines ?? 0;
  const availableWithdrawal = settlementBalance?.available_withdrawal ?? Math.max(0, pendingPayout - pendingFines);
  const codOperationLimit = settlementBalance?.cod_operation_limit ?? selectedRider?.operational_balance?.cod_operation_limit ?? 1000000;
  const overCodLimit = settlementBalance?.over_cod_limit ?? codCarried >= codOperationLimit;
  const bondTargetAmount = selectedRider?.bond_target_amount ?? SECURITY_BOND_AMOUNT;
  const bondAmount = selectedRider?.bond_amount ?? 0;
  const bondStatus = (selectedRider?.bond_status || "pending") as RiderBondStatus;
  const bondConfig = getBondConfig(bondStatus);
  const bondHistory = selectedRider?.bond_history || [];
  const riderRestriction = getRiderRestriction(selectedRider, now);
  const riderPolicyAcceptances = selectedRider?.policy_acceptances || [];
  const riderRequiredPolicies = riderPolicies.filter((policy) => policy.required);
  const riderUnavailableRequiredPolicies = riderRequiredPolicies.filter((policy) => policy.file_available === false);
  const riderLegalComplete = riderPolicies.length > 0
    ? riderRequiredPolicies
      .every((policy) => riderPolicyAcceptances.some((acceptance) => (
        acceptance.key === policy.key
        && acceptance.version === policy.version
        && acceptance.file_name === policy.file_name
      )))
    : riderPolicyAcceptances.length >= 2;
  const riderCanOperate = riderBaseCanOperate && riderLegalComplete;
  const riderRestrictionActive = Boolean(riderRestriction.active);
  const riderRestrictionCountdown = formatRestrictionCountdown(riderRestriction.remaining_ms);
  const riderRestrictionTone = riderRestriction.type === "permanent_suspension" || riderRestriction.type === "security_freeze"
    ? "border-destructive/25 bg-destructive/10 text-destructive"
    : riderRestriction.reinstatement_state === "eligible_for_reinstatement"
      ? "border-success/25 bg-success/10 text-success"
      : "border-warning/25 bg-warning/10 text-warning";
  const riderCanReceiveAssignments = riderCanOperate && !overCodLimit;
  const selectedOrderStatus = selectedOrder?.order_status;
  const assignmentAccepted = selectedOrder?.assignment_response_status === 'accepted';
  const assignmentExpired = Boolean(
    selectedOrder?.assignment_response_status === 'expired'
    || (selectedOrder?.assignment_response_due_at && new Date(selectedOrder.assignment_response_due_at).getTime() <= now)
  );
  const canAcceptOrder = riderCanReceiveAssignments && isRiderAccount && selectedOrderStatus === 'pending' && selectedOrder?.assignment_response_status === 'pending' && !assignmentExpired;
  const canRejectAssignment = riderCanOperate && isRiderAccount && selectedOrderStatus === 'pending' && selectedOrder?.assignment_response_status === 'pending' && !assignmentExpired;
  const canConfirmPickup = riderCanReceiveAssignments && isRiderAccount && selectedOrderStatus === 'pending' && assignmentAccepted && Boolean(selectedOrder?.handover_verified);
  const canMarkAtHub = false;
  const canStartDelivery = riderCanReceiveAssignments && isRiderAccount && selectedOrderStatus === 'at_hub' && Boolean(selectedOrder?.handover_verified && selectedOrder?.hub_scan_in);
  const canMarkDelivered = riderCanOperate
    && isRiderAccount
    && selectedOrderStatus === 'out_for_delivery'
    && Boolean(selectedOrder?.handover_verified && selectedOrder?.hub_scan_in)
    && /^\d{4}$/.test(otpValue.trim());
  const canMarkFailed = riderCanOperate && isRiderAccount && selectedOrder ? selectedOrder.order_status === 'out_for_delivery' && !canRejectAssignment : false;
  const canReturnOrder = riderCanOperate && isRiderAccount && selectedOrder ? ['picked_up', 'at_hub', 'out_for_delivery', 'failed'].includes(selectedOrder.order_status) : false;
  const canLinkTracker = Boolean(riderCanOperate && isRiderAccount && selectedOrder && assignmentAccepted && ['pending', 'picked_up', 'at_hub'].includes(selectedOrder.order_status));
  const deliverySetupStep = useMemo(() => {
    if (!selectedOrder) {
      return 0;
    }

    if (['delivered', 'failed', 'returned'].includes(selectedOrder.order_status)) {
      return 5;
    }

    if (selectedOrder.assignment_response_status !== 'accepted') {
      return 0;
    }

    if (!selectedOrder.handover_verified) {
      return 1;
    }

    if (selectedOrder.order_status === 'pending') {
      return 2;
    }

    if (selectedOrder.order_status === 'picked_up' && !selectedOrder.hub_scan_in) {
      return 3;
    }

    if (selectedOrder.order_status === 'at_hub') {
      return 4;
    }

    if (selectedOrder.order_status === 'out_for_delivery') {
      return 5;
    }

    return 0;
  }, [selectedOrder]);
  const deliverySetupGuidance = useMemo(() => {
    if (!selectedOrder) {
      return "No assigned order is selected. Ask admin to assign a pending order or select one from Active orders.";
    }

    if (selectedOrder.assignment_response_status === 'pending') {
      return assignmentExpired
        ? "The assignment window has expired. Ask admin to reassign the order before continuing."
        : "Accept or reject the assignment before the timer expires.";
    }

    if (selectedOrder.assignment_response_status === 'rejected') {
      return "This assignment was rejected. Admin must reassign the order to continue.";
    }

    if (!selectedOrder.handover_verified) {
      return "Wait for the merchant to verify the pickup key. Pickup stays locked until handover is verified.";
    }

    if (selectedOrder.order_status === 'pending') {
      return "Merchant handover is verified. Confirm pickup to move the package into rider custody.";
    }

    if (selectedOrder.order_status === 'picked_up' && !selectedOrder.hub_scan_in) {
      return "Hub manager scan-in is required before this order can move to delivery.";
    }

    if (selectedOrder.order_status === 'at_hub') {
      return "The package is scanned into hub. Start delivery when ready to leave for the customer.";
    }

    if (selectedOrder.order_status === 'out_for_delivery') {
      return "Use the customer OTP to complete delivery, or attach proof and mark failed if needed.";
    }

    return "This order is closed or returned. Select another active order to continue.";
  }, [assignmentExpired, selectedOrder]);

  useEffect(() => {
    const currentRiderUserId = isRiderAccount ? user?.id : selectedRider?.user_id || selectedRider?.id;
    if (!user || (isRiderAccount && !currentRiderUserId)) {
      return;
    }

    let disconnected = false;
    let socket: Awaited<ReturnType<typeof connectRealtimeSocket>> | null = null;

    const mergeRelevantOrder = (incomingOrder: OrderRecord) => {
      if (!incomingOrder?.id) {
        return;
      }

      const incomingRiderId = readId(incomingOrder.rider_id);
      const belongsToCurrentRider = incomingRiderId === currentRiderUserId;

      setOrders((currentOrders) => {
        const existingOrder = currentOrders.find((order) => order.id === incomingOrder.id);

        if (!belongsToCurrentRider) {
          return existingOrder
            ? currentOrders.filter((order) => order.id !== incomingOrder.id)
            : currentOrders;
        }

        if (!existingOrder) {
          return [incomingOrder, ...currentOrders];
        }

        return currentOrders.map((order) => (
          order.id === incomingOrder.id ? { ...order, ...incomingOrder } : order
        ));
      });

      setSelectedOrderId((currentOrderId) => {
        if (!belongsToCurrentRider) {
          return currentOrderId === incomingOrder.id ? null : currentOrderId;
        }

        return currentOrderId || incomingOrder.id;
      });
    };

    const handleOrderEvent = (payload: any) => {
      extractRealtimeOrders(payload).forEach(mergeRelevantOrder);
    };

    const handleRiderUpdate = (payload: Partial<RiderRecord> & { rider_id?: string; user_id?: string }) => {
      const payloadProfileId = readId(payload.id || payload.rider_id);
      const payloadUserId = readId(payload.user_id);
      const matchesSelected = Boolean(
        (payloadProfileId && payloadProfileId === selectedRider?.id)
        || (payloadUserId && payloadUserId === selectedRider?.user_id)
        || (payloadUserId && payloadUserId === user.id)
      );

      if (isRiderAccount && !matchesSelected) {
        return;
      }

      const hasRosterShape = Boolean(payload.full_name && payload.phone && (payloadProfileId || payload.id));

      setSelectedRider((currentRider) => {
        if (currentRider && matchesSelected) {
          return { ...currentRider, ...payload, id: payloadProfileId || currentRider.id } as RiderRecord;
        }

        if (!currentRider && hasRosterShape) {
          return { ...payload, id: payloadProfileId || String(payload.id) } as RiderRecord;
        }

        return currentRider;
      });
      setRiders((currentRiders) => currentRiders.map((rider) => (
        rider.id === payloadProfileId || rider.user_id === payloadUserId
          ? { ...rider, ...payload, id: payloadProfileId || rider.id } as RiderRecord
          : rider
      )).concat(
        !isRiderAccount
        && hasRosterShape
        && !currentRiders.some((rider) => rider.id === payloadProfileId || rider.user_id === payloadUserId)
          ? [{ ...payload, id: payloadProfileId || String(payload.id) } as RiderRecord]
          : []
      ));
    };

    const handleSettlementEvent = (payload: { settlement?: SettlementRecord; rider?: RiderRecord; balance?: SettlementBalance }) => {
      const settlement = payload?.settlement;
      const riderId = payload?.rider?.id || readId(settlement?.rider_id);
      const riderUserId = payload?.rider?.user_id;

      if (riderId !== selectedRider?.id && riderUserId !== selectedRider?.user_id && riderUserId !== user.id) {
        return;
      }

      if (settlement?.id) {
        setSettlements((current) => {
          const exists = current.some((item) => item.id === settlement.id);
          return exists
            ? current.map((item) => (item.id === settlement.id ? settlement : item))
            : [settlement, ...current];
        });
      }

      if (payload.balance) {
        setSettlementBalance(payload.balance);
      }

      if (payload.rider) {
        setSelectedRider((currentRider) => (currentRider ? { ...currentRider, ...payload.rider } : currentRider));
      }
    };

    connectRealtimeSocket()
      .then((nextSocket) => {
        if (disconnected) {
          nextSocket.disconnect();
          return;
        }

        socket = nextSocket;
        if (user.hub_id) {
          socket.emit("join:hub", user.hub_id);
        }
        if (currentRiderUserId) {
          socket.emit("join:rider", currentRiderUserId);
        }
        orderRealtimeEvents.forEach((eventName) => socket?.on(eventName, handleOrderEvent));
        settlementRealtimeEvents.forEach((eventName) => socket?.on(eventName, handleSettlementEvent));
        socket.on("rider:status-updated", handleRiderUpdate);
        socket.on("rider:registered", handleRiderUpdate);
        socket.on("rider:vehicle-updated", handleRiderUpdate);
        socket.on("rider:profile-updated", handleRiderUpdate);
        socket.on("rider:location-updated", handleRiderUpdate);
        socket.on("rider:kyc-updated", handleRiderUpdate);
        socket.on("rider:kyc-documents-updated", handleRiderUpdate);
        socket.on("rider:bond-updated", handleRiderUpdate);
        socket.on("rider:device-binding-updated", handleRiderUpdate);
        socket.on("rider:operational-state-updated", handleRiderUpdate);
      })
      .catch(() => {
        // Manual refresh still uses backend state if realtime transport is unavailable.
      });

    return () => {
      disconnected = true;
      if (socket) {
        orderRealtimeEvents.forEach((eventName) => socket?.off(eventName, handleOrderEvent));
        settlementRealtimeEvents.forEach((eventName) => socket?.off(eventName, handleSettlementEvent));
        socket.off("rider:status-updated", handleRiderUpdate);
        socket.off("rider:registered", handleRiderUpdate);
        socket.off("rider:vehicle-updated", handleRiderUpdate);
        socket.off("rider:profile-updated", handleRiderUpdate);
        socket.off("rider:location-updated", handleRiderUpdate);
        socket.off("rider:kyc-updated", handleRiderUpdate);
        socket.off("rider:kyc-documents-updated", handleRiderUpdate);
        socket.off("rider:bond-updated", handleRiderUpdate);
        socket.off("rider:device-binding-updated", handleRiderUpdate);
        socket.off("rider:operational-state-updated", handleRiderUpdate);
        socket.disconnect();
      }
    };
  }, [user?.id, user?.hub_id, isRiderAccount, selectedRider?.id, selectedRider?.user_id]);

  const status = selectedRider?.current_status ?? 'offline';
  const statusLabel = driverStatuses.find((item) => item.value === status)?.label ?? 'Offline';
  const orderCountdown = formatCountdown(selectedOrder?.assignment_response_due_at, selectedOrder?.assigned_at);
  const gpsWarning = !gpsTrackingEnabled || status === 'offline';
  const todayEarnings = dailySummary?.net_earnings ?? earningsSummary?.net_earnings ?? selectedRider?.earnings ?? 0;
  const openIncidents = incidents.filter((incident) => !incident.status || ['open', 'investigating', 'escalated'].includes(incident.status));
  const settlementBase = earningsSummary?.gross_earnings ?? dailySummary?.gross_earnings ?? selectedRider?.earnings ?? 0;
  const riderSettlementShare = earningsSummary?.rider_payout_share ?? dailySummary?.earnings ?? settlementBase * 0.7;
  const platformSettlementShare = earningsSummary?.platform_share ?? dailySummary?.platform_share ?? settlementBase * 0.3;
  const activeWithdrawal = settlements.find((settlement) => settlement.type === 'withdrawal' && ['requested', 'approved'].includes(settlement.status));
  const canRequestWithdrawal = isRiderAccount && riderCanOperate && !overCodLimit && availableWithdrawal > 0 && !activeWithdrawal;
  const deviceBinding = selectedRider?.device_binding;
  const deviceBindingStatus = deviceBinding?.status || "unbound";
  const deviceBindingActive = Boolean(deviceBinding?.is_bound || deviceBindingStatus === "bound" || deviceBindingStatus === "frozen");
  const trackerAlerts = activeOrders.filter((order) => order.tracker_divergence_alert || !order.physical_tracker_id).length;
  const statusTone = useMemo(() => {
    switch (status) {
      case 'available':
        return 'bg-success/10 text-success border-success/20';
      case 'on_delivery':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'break':
        return 'bg-warning/10 text-warning border-warning/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  }, [status]);

  const dashboardStats = [
    { label: 'Active deliveries', value: String(activeOrders.length).padStart(2, '0'), tone: 'text-primary' },
    { label: 'Tracker alerts', value: String(trackerAlerts).padStart(2, '0'), tone: 'text-destructive' },
    { label: 'COD carried', value: formatCompactCurrency(codCarried), tone: 'text-warning' },
    { label: 'Today earned', value: formatCompactCurrency(todayEarnings), tone: 'text-success' },
  ];

  const adminRiderTabs: { value: AdminRiderView; label: string; hint: string }[] = [
    { value: "overview", label: "Overview", hint: "Identity, profile, GPS" },
    { value: "kyc", label: "KYC", hint: "Docs and approval" },
    { value: "security", label: "Security", hint: "Restrictions, device" },
    { value: "orders", label: "Orders", hint: `${activeOrders.length} active` },
    { value: "finance", label: "Finance", hint: formatCompactCurrency(codCarried) },
    { value: "support", label: "Support", hint: `${openIncidents.length} open` },
  ];

  const earningsBreakdown = [
    { label: 'Operational COD balance', value: formatCurrency(codCarried) },
    { label: 'Gross earnings', value: formatCurrency(settlementBase) },
    { label: 'Pending payout', value: formatCurrency(pendingPayout) },
    { label: 'Available withdrawal', value: formatCurrency(availableWithdrawal) },
    { label: 'Pending fines hold', value: formatCurrency(pendingFines) },
    { label: 'Fines / deductions', value: formatCurrency(earningsSummary?.total_fines ?? dailySummary?.fines ?? 0) },
    { label: 'Net earnings', value: formatCurrency(earningsSummary?.net_earnings ?? dailySummary?.net_earnings ?? selectedRider?.earnings ?? 0) },
    { label: 'Rider settlement share (70%)', value: formatCurrency(riderSettlementShare) },
    { label: 'Platform settlement share (30%)', value: formatCurrency(platformSettlementShare) },
  ];

  const riderDetailsLine = selectedRider
    ? `${selectedRider.full_name} - ${selectedRider.phone} - ${vehicleLabel(selectedRider.vehicle_type)} - ${selectedRider.bike_plate}`
    : 'No rider selected';
  const profileDraftChanged = Boolean(selectedRider && (
    profileDraft.full_name !== (selectedRider.full_name || "")
    || profileDraft.phone !== (selectedRider.phone || "")
    || profileDraft.bike_plate !== (selectedRider.bike_plate || "")
    || profileDraft.stage_chairman_phone !== (selectedRider.stage_chairman_phone || "")
  ));
  const selectedHub = typeof selectedRider?.hub_id === 'object' ? selectedRider.hub_id : null;
  const dispatchMetrics = selectedRider?.dispatch_metrics;
  const selectedHubLabel = selectedHub
    ? [selectedHub.name, selectedHub.code, selectedHub.city].filter(Boolean).join(' | ')
    : readId(selectedRider?.hub_id) || 'No hub assigned';
  const gpsCoordinates = selectedRider?.gps_location?.coordinates;
  const gpsLabel = gpsCoordinates && hasGpsFix(selectedRider)
    ? `${gpsCoordinates[1]?.toFixed(5)}, ${gpsCoordinates[0]?.toFixed(5)}`
    : 'No GPS fix';
  const hubCoordinates = selectedHub?.coordinates;
  const proximityLabel = gpsCoordinates
    && hasGpsFix(selectedRider)
    && Number.isFinite(Number(hubCoordinates?.latitude))
    && Number.isFinite(Number(hubCoordinates?.longitude))
    ? `${distanceKm(
      { latitude: Number(hubCoordinates?.latitude), longitude: Number(hubCoordinates?.longitude) },
      { latitude: Number(gpsCoordinates[1]), longitude: Number(gpsCoordinates[0]) }
    ).toFixed(1)} km from hub`
    : 'Hub proximity unavailable';
  const riderOperationBlockReason = () => {
    if (!selectedRider) return "No rider account is selected.";
    if (selectedRider.account_locked) return "Account is locked. Admin must unlock it before operations continue.";
    if (!selectedRider.is_active) {
      const reason = riderRestriction.reason ? ` Reason: ${riderRestriction.reason}.` : "";
      const countdown = riderRestriction.expires_at && riderRestriction.remaining_ms ? ` Countdown: ${riderRestrictionCountdown}.` : "";
      return `${riderRestriction.label || "Restriction"} is active.${reason}${countdown} ${riderRestriction.reinstatement_label || "Admin reinstatement is required."}`;
    }
    if (riderKycStatus !== "verified") return "Rider KYC must be verified before operations continue.";
    if (!selectedRider.stage_chairman_phone?.trim()) return "Stage chairman contact number is required before operations continue.";
    if (!allRequiredKycDocumentsUploaded) return "All required rider KYC documents must be uploaded before operations continue.";
    if (selectedRider.all_documents_verified !== true) return "Admin must verify all required rider KYC documents before operations continue.";
    if (riderUnavailableRequiredPolicies.length > 0) return "Required rider policy files are unavailable on the server.";
    if (!riderLegalComplete) return "Rider legal agreements must be accepted before operations continue.";
    return undefined;
  };
  const riderStatusDisabledReason = (nextStatus: RiderStatus) => {
    if (actionLoading === "status") return "Rider status update is already being saved.";
    const blockReason = riderOperationBlockReason();
    if (isRiderAccount && blockReason && nextStatus !== "offline") return blockReason;
    if (overCodLimit && ["available", "on_delivery"].includes(nextStatus)) return `COD balance is at or above ${formatCurrency(codOperationLimit)}. Record COD settlement before going available or on delivery.`;
    return undefined;
  };
  const orderActionDisabledReason = (action: "accept" | "reject" | "pickup" | "at_hub" | "start_delivery" | "delivered" | "failed" | "return" | "tracker_link" | "tracker_gps") => {
    if (!selectedOrder) return "Select an assigned order before using this action.";
    if (!isRiderAccount) return "Delivery actions are available only from the rider account.";
    const blockReason = riderOperationBlockReason();
    if (blockReason) return blockReason;
    if (action === "tracker_gps" && actionLoading === "tracker-gps") return "Package tracker GPS sync is already running.";
    if (action === "tracker_link" && actionLoading === "tracker-link") return "Tracker link is already being saved.";
    if (action === "accept") {
      if (actionLoading === "assignment-accept") return "Assignment acceptance is already being saved.";
      if (overCodLimit) return `COD balance is at or above ${formatCurrency(codOperationLimit)}. New assignments are blocked.`;
      if (selectedOrder.order_status !== "pending") return "Only pending assignments can be accepted.";
      if (selectedOrder.assignment_response_status !== "pending") return "This assignment is no longer pending.";
      if (assignmentExpired) return "Assignment response window expired. Ask admin to reassign the order.";
    }
    if (action === "reject") {
      if (actionLoading === "assignment-reject") return "Assignment rejection is already being saved.";
      if (selectedOrder.order_status !== "pending") return "Only pending assignments can be rejected.";
      if (selectedOrder.assignment_response_status !== "pending") return "This assignment is no longer pending.";
      if (assignmentExpired) return "Assignment response window expired. Ask admin to reassign the order.";
    }
    if (action === "pickup") {
      if (actionLoading === "order-picked_up") return "Pickup confirmation is already being saved.";
      if (overCodLimit) return `COD balance is at or above ${formatCurrency(codOperationLimit)}. Record COD settlement before pickup.`;
      if (selectedOrder.order_status !== "pending") return "Pickup is available only while the order is pending.";
      if (selectedOrder.assignment_response_status !== "accepted") return "Accept the assignment before pickup.";
      if (!selectedOrder.handover_verified) return "Merchant pickup-key handover must be verified before pickup.";
    }
    if (action === "at_hub") return "Hub scan-in is controlled by the hub manager. Drivers cannot bypass this step.";
    if (action === "start_delivery") {
      if (actionLoading === "order-out_for_delivery") return "Delivery start is already being saved.";
      if (overCodLimit) return `COD balance is at or above ${formatCurrency(codOperationLimit)}. Record COD settlement before starting delivery.`;
      if (selectedOrder.order_status !== "at_hub") return "Order must be at hub before starting delivery.";
      if (!selectedOrder.handover_verified) return "Merchant handover must be verified first.";
      if (!selectedOrder.hub_scan_in) return "Hub scan-in must be complete before starting delivery.";
    }
    if (action === "delivered") {
      if (actionLoading === "order-delivered") return "Delivery completion is already being saved.";
      if (selectedOrder.order_status !== "out_for_delivery") return "Order must be out for delivery before completion.";
      if (!selectedOrder.handover_verified || !selectedOrder.hub_scan_in) return "Verified handover and hub scan-in are required before completion.";
      if (!otpValue.trim()) return "Enter the customer's 4-digit delivery OTP before completing this order.";
      if (!/^\d{4}$/.test(otpValue.trim())) return "Delivery OTP must be exactly 4 digits.";
    }
    if (action === "failed") {
      if (actionLoading === "order-failed") return "Failed status is already being saved.";
      if (canRejectAssignment) return "Reject the pending assignment instead of marking the order failed.";
      if (selectedOrder.order_status !== "out_for_delivery") return "Start delivery before marking a failed delivery.";
    }
    if (action === "return") {
      if (actionLoading === "order-returned") return "Return status is already being saved.";
      if (!["picked_up", "at_hub", "out_for_delivery", "failed"].includes(selectedOrder.order_status)) return "This order status cannot be returned to merchant.";
    }
    if (action === "tracker_link") {
      if (selectedOrder.assignment_response_status !== "accepted") return "Accept the assignment before linking a package tracker.";
      if (!["pending", "picked_up", "at_hub"].includes(selectedOrder.order_status)) return "Tracker linking is available only before final delivery.";
    }
    return undefined;
  };
  const withdrawalDisabledReason = () => {
    if (actionLoading === "withdrawal-request") return "Withdrawal request is already being submitted.";
    if (!isRiderAccount) return "Withdrawal requests are submitted from the rider account.";
    const blockReason = riderOperationBlockReason();
    if (blockReason) return blockReason;
    if (overCodLimit) return `COD balance is at or above ${formatCurrency(codOperationLimit)}. Settle COD before withdrawal.`;
    if (availableWithdrawal <= 0) return "No available payout balance after fines and holds.";
    if (activeWithdrawal) return "A withdrawal is already requested or approved.";
    return undefined;
  };
  const adminActionDisabledReason = (type: "profile" | "vehicle" | "kyc_verified" | "kyc_rejected" | "restrict" | "reinstate" | "unlock" | "cod" | "device_unbind") => {
    if (!selectedRider) return "Select a rider before using this admin action.";
    if (type === "profile") {
      if (actionLoading === "profile") return "Operational profile is already being saved.";
      if (!profileDraftChanged) return "Change a profile field before saving.";
    }
    if (type === "vehicle") {
      if (actionLoading === "vehicle") return "Vehicle type is already being saved.";
      if (vehicleTypeDraft === selectedRider.vehicle_type) return "Choose a different vehicle type before saving.";
    }
    if (type === "kyc_verified") {
      if (actionLoading === "kyc") return "KYC update is already being saved.";
      if (selectedRider.kyc_status === "verified") return "Rider KYC is already verified.";
      if (!selectedRider.stage_chairman_phone) return "Stage chairman contact number is required before approval.";
      if (!allRequiredKycDocumentsUploaded) return "All required rider documents must be uploaded before approval.";
      if (!allRequiredKycDocumentsReviewable) return "All required rider documents must be stored uploads before approval.";
      if (!adminVerificationNotesReady) return "Add internal admin verification notes before approval.";
    }
    if (type === "kyc_rejected") {
      if (actionLoading === "kyc") return "KYC update is already being saved.";
      if (selectedRider.kyc_status === "rejected") return "Rider KYC is already rejected.";
      if (!adminVerificationNotesReady) return "Add internal admin verification notes before rejection.";
    }
    if (type === "restrict") {
      if (actionLoading === "operational-state") return "Rider restriction is already being saved.";
      if (!selectedRider.is_active) return "This rider already has an active restriction.";
      if (restrictionDraft.reason.trim().length < 3) return "Enter a clear restriction reason before applying a penalty.";
      if (restrictionDraft.reason.trim().length > 300) return "Restriction reason must be 300 characters or less.";
      const duration = Number(restrictionDraft.duration);
      if (restrictionDraft.type === "soft_block" && (!Number.isInteger(duration) || duration < 12 || duration > 48)) return "Soft block duration must be a whole number between 12 and 48 hours.";
      if (restrictionDraft.type === "hard_block" && (!Number.isInteger(duration) || duration < 7 || duration > 30)) return "Hard block duration must be a whole number between 7 and 30 days.";
    }
    if (type === "reinstate") {
      if (actionLoading === "operational-state") return "Rider reinstatement is already being saved.";
      if (selectedRider.is_active) return "This rider is already active.";
      if (riderRestriction.type === "security_freeze") return "Device security freezes must be cleared through the device unbind workflow.";
      if (["soft_block", "hard_block"].includes(String(riderRestriction.type)) && Number(riderRestriction.remaining_ms || 0) > 0) {
        return `${riderRestriction.label} cannot be reinstated until ${riderRestrictionCountdown} ends.`;
      }
    }
    if (type === "unlock") {
      if (actionLoading === "unlock") return "Account unlock is already being saved.";
      if (!selectedRider.account_locked) return "This rider account is not locked.";
    }
    if (type === "device_unbind") {
      if (actionLoading === "device-unbind") return "Device unbinding is already being saved.";
      if (!deviceBindingActive) return "No rider device is currently bound or frozen.";
      if (deviceUnbindReason.trim().length < 3) return "Add an admin reason before unbinding this rider device.";
    }
    if (type === "cod") {
      if (actionLoading === "cod-settlement") return "COD settlement is already being recorded.";
      if (codCarried <= 0) return "There is no carried COD balance to settle.";
    }
    return undefined;
  };
  const bondActionDisabledReason = (action: "register" | "approve" | "reject") => {
    if (!selectedRider) return "Select a rider before using bond management.";
    if (isRiderAccount) return "Security bond management is available from admin rider management.";
    if (actionLoading?.startsWith("bond-")) return "Security bond update is already being saved.";

    const draftAmountProvided = bondDraft.amount.trim().length > 0;
    const draftAmount = Number(bondDraft.amount);
    if ((action === "register" || draftAmountProvided) && (!Number.isFinite(draftAmount) || draftAmount <= 0)) {
      return "Enter a valid security bond amount.";
    }

    if (action === "register") {
      if (bondStatus === "approved" || bondStatus === "deposited") return "This rider bond is already approved.";
    }

    if (action === "approve") {
      if (bondStatus === "approved" || bondStatus === "deposited") return "This rider bond is already approved.";
      if (bondStatus !== "registered") return "Register this rider bond before approval.";
      if (bondAmount < bondTargetAmount && (!draftAmountProvided || !Number.isFinite(draftAmount) || draftAmount < bondTargetAmount)) {
        return `Security bond must be at least ${formatCurrency(bondTargetAmount)} before approval.`;
      }
    }

    if (action === "reject") {
      if (bondStatus === "rejected") return "This rider bond is already rejected.";
      if (bondStatus !== "registered") return "Register this rider bond before rejection.";
      if (bondDraft.note.trim().length < 3) return "Enter a rejection reason or admin note before rejecting.";
    }

    return undefined;
  };
  const settlementActionDisabledReason = (settlement: SettlementRecord, status: SettlementStatus) => {
    if (actionLoading === `settlement-${settlement.id}-${status}`) return "Settlement action is already being saved.";
    if (settlement.type === "withdrawal" && ["approved", "completed"].includes(status) && overCodLimit) {
      return `COD balance is at or above ${formatCurrency(codOperationLimit)}. Record COD settlement before approving or completing withdrawal.`;
    }
    if (status === "approved" && settlement.status !== "requested") return "Only requested withdrawals can be approved.";
    if (status === "completed" && settlement.status !== "approved") return "Approve the withdrawal before marking it completed.";
    if (status === "rejected" && !["requested", "approved"].includes(settlement.status)) return "Only requested or approved withdrawals can be rejected.";
    return undefined;
  };

  const workspaceSubtitle = pageLoading
    ? 'Loading rider state from backend'
    : selectedRider
      ? `${selectedRider.full_name} | ${selectedRider.phone} | ${vehicleLabel(selectedRider.vehicle_type)} | ${selectedRider.current_status}`
      : canSwitchRiders
        ? 'No active riders found for this hub'
        : 'No rider profile found for this account';

  const getRiderQueryId = () => (isRiderAccount ? undefined : selectedRider?.user_id || selectedRider?.id);

  const refreshSelectedRider = async () => {
    if (!selectedRider) {
      return;
    }

    const riderQueryId = getRiderQueryId();

    try {
      setDetailLoading(true);
      const [ordersResponse, earningsResponse, dailySummaryResponse, incidentsResponse, settlementsResponse] = await Promise.all([
        api.get('/auth/orders', {
          params: {
            limit: 50,
            rider_id: riderQueryId,
          },
        }),
        api.get(isRiderAccount ? '/auth/riders/me/earnings' : `/auth/riders/${selectedRider.id}/earnings`),
        isRiderAccount ? api.get('/auth/riders/me/daily-summary') : Promise.resolve(null),
        isRiderAccount ? api.get('/auth/riders/me/incidents') : api.get(`/auth/riders/${selectedRider.id}/incidents`),
        api.get('/auth/riders/settlements', {
          params: {
            limit: 25,
            ...(isRiderAccount ? {} : { rider_id: selectedRider.id }),
          },
        }),
      ]);

      const orderItems = extractApiData<{ orders?: OrderRecord[] }>(ordersResponse)?.orders ?? [];
      const nextEarnings = extractApiData<{ summary?: EarningsSummary }>(earningsResponse)?.summary ?? null;
      const nextDailySummary = dailySummaryResponse
        ? extractApiData<{ summary?: DailySummary }>(dailySummaryResponse)?.summary ?? null
        : null;
      const nextIncidents = incidentsResponse
        ? extractApiData<{ incidents?: IncidentRecord[] }>(incidentsResponse)?.incidents ?? []
        : [];
      const settlementData = extractApiData<{ settlements?: SettlementRecord[]; balance?: SettlementBalance }>(settlementsResponse);

      setOrders(orderItems);
      setEarningsSummary(nextEarnings);
      setDailySummary(nextDailySummary);
      setIncidents(nextIncidents);
      setSettlements(settlementData?.settlements ?? []);
      setSettlementBalance(settlementData?.balance ?? null);
      setSelectedOrderId((currentOrderId) => {
        if (currentOrderId && orderItems.some((order) => order.id === currentOrderId)) {
          return currentOrderId;
        }

        return (orderItems.find((order) => activeStatuses.includes(order.order_status)) ?? orderItems[0] ?? null)?.id ?? null;
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to refresh rider data');
    } finally {
      setDetailLoading(false);
    }
  };

  const updateRiderStatus = async (nextStatus: RiderStatus) => {
    if (!selectedRider) {
      return;
    }

    const endpoint = isRiderAccount ? '/auth/riders/me/status' : `/auth/riders/${selectedRider.id}/status`;

    setActionLoading('status');
    try {
      const response = isRiderAccount
        ? await api.post(endpoint, { current_status: nextStatus })
        : await api.patch(endpoint, { current_status: nextStatus });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }

      toast.success('Rider status updated');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update rider status');
    } finally {
      setActionLoading(null);
    }
  };

  const updateRiderVehicle = async () => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    setActionLoading('vehicle');
    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/vehicle-type`, {
        vehicle_type: vehicleTypeDraft,
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }

      toast.success('Vehicle type updated');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update vehicle type');
    } finally {
      setActionLoading(null);
    }
  };

  const updateOperationalProfile = async () => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    if (!profileDraft.full_name.trim() || !profileDraft.phone.trim() || !profileDraft.bike_plate.trim() || !profileDraft.stage_chairman_phone.trim()) {
      toast.error('Name, phone, plate, and stage chairman phone are required');
      return;
    }

    setActionLoading('profile');
    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/operational-profile`, {
        full_name: profileDraft.full_name.trim(),
        phone: profileDraft.phone.trim(),
        bike_plate: profileDraft.bike_plate.trim().toUpperCase(),
        stage_chairman_phone: profileDraft.stage_chairman_phone.trim(),
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }

      toast.success('Operational profile updated');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update operational profile');
    } finally {
      setActionLoading(null);
    }
  };

  const openRiderDocument = async (document: RiderDocument | null, label: string) => {
    if (!document) {
      toast.error(`${label} is not uploaded yet`);
      return;
    }

    if (!document.public_id) {
      if (document.url?.startsWith("http")) {
        window.open(document.url, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error(`${label} cannot be opened because the upload reference is missing`);
      return;
    }

    const previewWindow = window.open("", "_blank", "noopener,noreferrer");
    try {
      const response = await api.get(`/auth/uploads/${String(document.public_id)}`, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(response.data);
      if (previewWindow) {
        previewWindow.location.href = objectUrl;
      } else {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error: any) {
      previewWindow?.close();
      toast.error(error.response?.data?.message || `Unable to open ${label}`);
    }
  };

  const updateRiderKyc = async (kycStatus: KycStatus) => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    const disabledReason = adminActionDisabledReason(kycStatus === 'verified' ? 'kyc_verified' : 'kyc_rejected');
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }

    setActionLoading('kyc');
    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/kyc`, {
        kyc_status: kycStatus,
        reason: kycStatus === 'rejected' ? 'Rejected by admin review' : undefined,
        admin_verification_notes: adminVerificationNotes.trim(),
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }

      toast.success('Rider KYC updated');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update KYC');
    } finally {
      setActionLoading(null);
    }
  };

  const updateRiderOperationalState = async (isActive: boolean) => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    const disabledReason = adminActionDisabledReason(isActive ? "reinstate" : "restrict");
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }

    const restrictionPayload = !isActive
      ? {
        restriction_type: restrictionDraft.type,
        reason: restrictionDraft.reason.trim(),
        ...(restrictionDraft.type === "soft_block" ? { duration_hours: Number(restrictionDraft.duration) } : {}),
        ...(restrictionDraft.type === "hard_block" ? { duration_days: Number(restrictionDraft.duration) } : {}),
      }
      : {
        reason: "Rider reinstated after admin restriction review",
      };

    setActionLoading('operational-state');
    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/operational-state`, {
        is_active: isActive,
        ...restrictionPayload,
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }

      toast.success(isActive ? 'Rider reinstated' : `${restrictionTypeLabels[restrictionDraft.type]} applied`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update rider state');
    } finally {
      setActionLoading(null);
    }
  };

  const unlockRiderAccount = async () => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    setActionLoading('unlock');
    try {
      await api.patch(`/auth/users/${readId(selectedRider.user_id)}/unlock`);
      toast.success('Rider login account unlocked');
      setSelectedRider((current) => current ? { ...current, account_locked: false, failed_login_attempts: 0, locked_reason: null } : current);
      setRiders((current) => current.map((rider) => (
        rider.id === selectedRider.id ? { ...rider, account_locked: false, failed_login_attempts: 0, locked_reason: null } : rider
      )));
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to unlock rider account');
    } finally {
      setActionLoading(null);
    }
  };

  const unbindRiderDevice = async () => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    const disabledReason = adminActionDisabledReason("device_unbind");
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }

    setActionLoading("device-unbind");
    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/device-binding/unbind`, {
        reason: deviceUnbindReason.trim(),
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
      }

      setDeviceUnbindReason("");
      toast.success("Rider device binding cleared");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to unbind rider device");
    } finally {
      setActionLoading(null);
    }
  };

  const updateRiderBond = async (action: "register" | "approve" | "reject") => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    const disabledReason = bondActionDisabledReason(action);
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }

    const draftAmount = bondDraft.amount.trim() ? Number(bondDraft.amount) : undefined;

    setActionLoading(`bond-${action}`);
    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/bond`, {
        action,
        bond_amount: draftAmount !== undefined && Number.isFinite(draftAmount) ? draftAmount : undefined,
        reference: bondDraft.reference.trim() || undefined,
        note: bondDraft.note.trim() || undefined,
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;

      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
        setBondDraft({
          amount: String(Math.round(updatedRider.bond_amount ?? updatedRider.bond_target_amount ?? SECURITY_BOND_AMOUNT)),
          reference: updatedRider.bond_reference || "",
          note: "",
        });
      }

      toast.success(action === "approve" ? "Rider security bond approved" : action === "reject" ? "Rider security bond rejected" : "Rider security bond registered");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to update rider security bond");
    } finally {
      setActionLoading(null);
    }
  };

  const syncGpsLocation = async () => {
    if (!isRiderAccount) {
      toast.info('GPS updates are only writable from the rider account');
      return;
    }

    if (!riderCanOperate) {
      toast.error('Rider must be active, KYC verified, and unlocked before GPS can be synced');
      return;
    }

    if (!navigator.geolocation) {
      toast.error('Browser geolocation is not available');
      return;
    }

    setActionLoading('gps');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await api.post('/auth/riders/me/location', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });

          const nextRider = extractApiData<{ gps_location?: RiderRecord['gps_location']; last_location_update?: string }>(response);

          setSelectedRider((current) => current
            ? {
              ...current,
              gps_location: nextRider?.gps_location ?? current.gps_location,
              last_location_update: nextRider?.last_location_update ?? new Date().toISOString(),
            }
            : current);
          setGpsTrackingEnabled(true);
          toast.success('GPS location synced');
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Unable to update GPS location');
        } finally {
          setActionLoading(null);
        }
      },
      () => {
        toast.error('Unable to read current location');
        setActionLoading(null);
      }
    );
  };

  const uploadProofFile = async (purpose: string) => {
    if (!selectedOrder) {
      return null;
    }

    if (!proofFile) {
      toast.error(`Attach a proof photo before ${purpose}`);
      return null;
    }

    const formData = new FormData();
    formData.append('file', proofFile);
    formData.append('related_model', 'Order');
    formData.append('related_id', selectedOrder.id);

    const hubId = getOrderHubId(selectedOrder) || readId(selectedRider?.hub_id) || user?.hub_id;
    if (hubId) {
      formData.append('hub_id', hubId);
    }

    const response = await api.post('/auth/uploads/single', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const upload = extractApiData<{ upload?: { _id?: string; id?: string } }>(response)?.upload;
    const uploadId = upload?._id || upload?.id;

    if (!uploadId) {
      throw new Error('Backend did not return an upload ID');
    }

    return uploadId;
  };

  const acceptOrderAssignment = async () => {
    if (!selectedOrder) {
      return;
    }

    setActionLoading('assignment-accept');

    try {
      await api.post(`/auth/orders/${selectedOrder.id}/respond`, { action: 'accept' });
      toast.success('Order assignment accepted');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to accept assignment');
    } finally {
      setActionLoading(null);
    }
  };

  const rejectOrderAssignment = async () => {
    if (!selectedOrder) {
      return;
    }

    setActionLoading('assignment-reject');

    try {
      await api.post(`/auth/orders/${selectedOrder.id}/respond`, {
        action: 'reject',
        reason: incidentDescription.trim() || 'Rider rejected assignment',
      });
      toast.success('Order assignment rejected');
      setIncidentDescription('');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to reject assignment');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmPickupCustody = async () => {
    if (!selectedOrder) {
      return;
    }

    if (!selectedOrder.handover_verified) {
      toast.error('Merchant pickup key confirmation is required before pickup');
      return;
    }

    const scannedCode = selectedOrder.package_tracking_id || selectedOrder.order_id;

    setActionLoading('order-picked_up');

    try {
      await api.post(`/auth/orders/${selectedOrder.id}/confirm-custody`, {
        scanned_code: scannedCode,
      });
      toast.success('Package custody confirmed');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to confirm custody');
    } finally {
      setActionLoading(null);
    }
  };

  const linkPackageTracker = async () => {
    if (!selectedOrder) {
      return;
    }

    if (!isRiderAccount) {
      toast.info('Physical tracker scanning is writable from the rider account');
      return;
    }

    if (!trackerCode.trim()) {
      toast.error('Enter or scan the physical tracker tag first');
      return;
    }

    setActionLoading('tracker-link');

    try {
      await api.post(`/auth/riders/orders/${selectedOrder.id}/scan-package-tracker`, {
        tracker_id: trackerCode.trim(),
      });
      toast.success('Physical tracker linked');
      setTrackerCode('');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to link tracker');
    } finally {
      setActionLoading(null);
    }
  };

  const syncPackageTrackerLocation = async () => {
    if (!selectedOrder) {
      return;
    }

    if (!isRiderAccount) {
      toast.info('Tracker GPS updates are writable from the rider account');
      return;
    }

    if (!riderCanOperate) {
      toast.error('Rider must be active, KYC verified, and unlocked before tracker GPS can be synced');
      return;
    }

    if (!navigator.geolocation) {
      toast.error('Browser geolocation is not available');
      return;
    }

    setActionLoading('tracker-gps');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.post(`/auth/riders/orders/${selectedOrder.id}/tracker-location`, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          toast.success('Package tracker location synced');
          await refreshSelectedRider();
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Unable to sync package tracker location');
        } finally {
          setActionLoading(null);
        }
      },
      () => {
        toast.error('Unable to read current location');
        setActionLoading(null);
      }
    );
  };

  const updateOrderStatus = async (nextStatus: Exclude<OrderStatus, 'delivered'> | 'delivered') => {
    if (!selectedOrder) {
      return;
    }

    if (nextStatus === 'at_hub') {
      toast.error('Hub manager scan-in is required before marking this order at hub');
      return;
    }

    const endpoint = nextStatus === 'delivered'
      ? `/auth/orders/${selectedOrder.id}/verify-otp`
      : `/auth/orders/${selectedOrder.id}/status`;

    setActionLoading(`order-${nextStatus}`);

    try {
      if (nextStatus === 'delivered') {
        if (!otpValue.trim()) {
          toast.error('Enter the 4-digit delivery OTP first');
          return;
        }

        if (!/^\d{4}$/.test(otpValue.trim())) {
          toast.error('OTP must be exactly 4 digits');
          return;
        }

        const proofUploadId = await uploadProofFile('completing the delivery');
        if (!proofUploadId) {
          return;
        }

        await api.post(endpoint, {
          otp_code: otpValue.trim(),
          proof_upload_id: proofUploadId,
        });
      } else {
        await api.patch(endpoint, { order_status: nextStatus, note: `Driver moved order to ${nextStatus}` });
      }

      toast.success('Order updated');
      setOtpValue('');
      setProofFile(null);
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update order');
    } finally {
      setActionLoading(null);
    }
  };

  const markOrderFailed = async () => {
    if (!selectedOrder) {
      return;
    }

    setActionLoading('order-failed');

    try {
      const proofUploadId = await uploadProofFile('marking the delivery failed');
      if (!proofUploadId) {
        return;
      }

      await api.post(`/auth/orders/${selectedOrder.id}/failed`, {
        reason: incidentDescription.trim() || 'Customer unavailable during delivery',
        proof_upload_id: proofUploadId,
      });

      toast.success('Order marked as failed');
      setProofFile(null);
      setIncidentDescription('');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to mark order failed');
    } finally {
      setActionLoading(null);
    }
  };

  const returnOrderToMerchant = async () => {
    if (!selectedOrder) {
      return;
    }

    setActionLoading('order-returned');

    try {
      const proofUploadId = await uploadProofFile('returning the package');
      if (!proofUploadId) {
        return;
      }

      await api.post(`/auth/orders/${selectedOrder.id}/return-to-merchant`, {
        reason: incidentDescription.trim() || 'Package returned to merchant',
        proof_upload_id: proofUploadId,
      });

      toast.success('Order returned to merchant');
      setProofFile(null);
      setIncidentDescription('');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to return order');
    } finally {
      setActionLoading(null);
    }
  };

  const submitIncident = async () => {
    if (!isRiderAccount) {
      toast.info('Incident reporting is writable from the rider account');
      return;
    }

    if (!incidentDescription.trim()) {
      toast.error('Write a short incident description first');
      return;
    }

    setActionLoading('incident');

    try {
      await api.post('/auth/riders/me/incident', {
        type: incidentType,
        description: incidentDescription.trim(),
        location: selectedOrder?.delivery_address ?? selectedRider?.full_name ?? null,
      });

      toast.success('Incident reported');
      setIncidentDescription('');
      await refreshSelectedRider();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to report incident');
    } finally {
      setActionLoading(null);
    }
  };

  const updateIncidentWorkflow = async (
    incident: IncidentRecord,
    nextStatus: "investigating" | "escalated" | "resolved" | "closed",
    index: number
  ) => {
    if (!selectedRider || isRiderAccount) {
      toast.info('Incident escalation is handled from the admin rider profile');
      return;
    }

    const note = incidentAdminNote.trim();
    if (note.length < 3) {
      toast.error('Add an admin note before updating the incident workflow');
      return;
    }

    const incidentId = incident.id || incident._id || String(index);
    setActionLoading(`incident-${incidentId}-${nextStatus}`);

    try {
      const response = await api.patch(`/auth/riders/${selectedRider.id}/incident/${incidentId}/status`, {
        status: nextStatus,
        resolution: note,
      });
      const updatedRider = extractApiData<{ rider?: RiderRecord }>(response)?.rider ?? null;
      if (updatedRider) {
        setSelectedRider(updatedRider);
        setRiders((current) => current.map((rider) => (rider.id === updatedRider.id ? updatedRider : rider)));
        setIncidents((updatedRider as RiderRecord & { incidents?: IncidentRecord[] }).incidents || incidents);
      }
      setIncidentAdminNote('');
      await refreshSelectedRider();
      toast.success(`Incident marked ${nextStatus.replace(/_/g, ' ')}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update incident workflow');
    } finally {
      setActionLoading(null);
    }
  };

  const requestWithdrawal = async () => {
    if (!isRiderAccount) {
      toast.info('Withdrawal requests are submitted from the rider account');
      return;
    }

    const amount = Number(withdrawalDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid withdrawal amount');
      return;
    }

    if (amount > availableWithdrawal) {
      toast.error('Withdrawal amount cannot exceed available payout after fines');
      return;
    }

    if (!canRequestWithdrawal) {
      toast.error(activeWithdrawal ? 'A withdrawal is already pending or approved' : 'Withdrawal is blocked until rider balance rules are cleared');
      return;
    }

    setActionLoading('withdrawal-request');
    try {
      const response = await api.post('/auth/riders/me/withdrawals', {
        amount,
        method: 'mobile_money',
        account_phone: withdrawalDraft.account_phone.trim() || selectedRider?.phone,
        note: withdrawalDraft.note.trim() || undefined,
      });
      const data = extractApiData<{ settlement?: SettlementRecord; rider?: RiderRecord; balance?: SettlementBalance }>(response);

      if (data?.settlement) {
        setSettlements((current) => [data.settlement as SettlementRecord, ...current]);
      }
      if (data?.rider) {
        setSelectedRider(data.rider);
      }
      if (data?.balance) {
        setSettlementBalance(data.balance);
      }

      setWithdrawalDraft((current) => ({ ...current, amount: "", note: "" }));
      toast.success('Withdrawal request submitted');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to request withdrawal');
    } finally {
      setActionLoading(null);
    }
  };

  const updateSettlementStatus = async (settlement: SettlementRecord, status: SettlementStatus) => {
    if (isRiderAccount) {
      return;
    }

    const loadingKey = `settlement-${settlement.id}-${status}`;
    setActionLoading(loadingKey);

    try {
      const response = await api.patch(`/auth/riders/settlements/${settlement.id}/status`, {
        status,
        admin_note: settlementActionDraft.admin_note.trim()
          || (status === 'completed' ? 'Payout completed by admin' : status === 'approved' ? 'Approved for payout' : undefined),
        completion_reference: status === 'completed' ? settlementActionDraft.completion_reference.trim() || undefined : undefined,
        rejection_reason: status === 'rejected'
          ? settlementActionDraft.admin_note.trim() || 'Rejected by admin review'
          : undefined,
      });
      const data = extractApiData<{ settlement?: SettlementRecord; rider?: RiderRecord; balance?: SettlementBalance }>(response);

      if (data?.settlement) {
        setSettlements((current) => current.map((item) => (item.id === data.settlement?.id ? data.settlement as SettlementRecord : item)));
      }
      if (data?.rider) {
        setSelectedRider(data.rider);
        setRiders((current) => current.map((rider) => (rider.id === data.rider?.id ? data.rider as RiderRecord : rider)));
      }
      if (data?.balance) {
        setSettlementBalance(data.balance);
      }

      toast.success(`Settlement ${status}`);
      setSettlementActionDraft({ admin_note: "", completion_reference: "" });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to update settlement');
    } finally {
      setActionLoading(null);
    }
  };

  const recordCodSettlement = async () => {
    if (!selectedRider || isRiderAccount) {
      return;
    }

    const amount = Number(codSettlementDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid COD settlement amount');
      return;
    }

    if (amount > codCarried) {
      toast.error('COD settlement amount cannot exceed carried COD');
      return;
    }

    setActionLoading('cod-settlement');
    try {
      const response = await api.post(`/auth/riders/${selectedRider.id}/cod-settlement`, {
        amount,
        method: 'cash',
        note: codSettlementDraft.note.trim() || 'COD handed over to hub/admin',
      });
      const data = extractApiData<{ settlement?: SettlementRecord; rider?: RiderRecord; balance?: SettlementBalance }>(response);

      if (data?.settlement) {
        setSettlements((current) => [data.settlement as SettlementRecord, ...current]);
      }
      if (data?.rider) {
        setSelectedRider(data.rider);
        setRiders((current) => current.map((rider) => (rider.id === data.rider?.id ? data.rider as RiderRecord : rider)));
      }
      if (data?.balance) {
        setSettlementBalance(data.balance);
      }

      setCodSettlementDraft({ amount: "", note: "COD handed over to hub/admin" });
      toast.success('COD settlement recorded');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Unable to record COD settlement');
    } finally {
      setActionLoading(null);
    }
  };

  const riderRoomTitle = canSwitchRiders ? 'Hub driver workspace' : 'Rider workspace';
  const driverScreenTitle: Record<Exclude<DriverScreen, "admin">, string> = {
    dashboard: "Driver Dashboard",
    orders: "Driver Orders",
    "order-details": "Delivery Action",
    wallet: "Driver Wallet",
    profile: "Driver Profile",
    support: "Driver Support",
  };

  const riderRestrictionNotice = selectedRider && riderRestrictionActive ? (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${riderRestrictionTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{riderRestriction.label}</p>
          <p className="mt-1 leading-relaxed">
            {riderRestriction.reason || "Restriction reason is pending admin note."}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-current/20 bg-background/60 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Remaining</p>
          <p className="mt-1 font-mono text-base font-bold">{riderRestriction.expires_at ? riderRestrictionCountdown : "Permanent"}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-current/15 bg-background/50 px-3 py-2">
          <p className="uppercase tracking-[0.16em] opacity-70">Started</p>
          <p className="mt-1 font-semibold">{formatDateTime(riderRestriction.started_at)}</p>
        </div>
        <div className="rounded-xl border border-current/15 bg-background/50 px-3 py-2">
          <p className="uppercase tracking-[0.16em] opacity-70">Ends</p>
          <p className="mt-1 font-semibold">{riderRestriction.expires_at ? formatDateTime(riderRestriction.expires_at) : "No expiry"}</p>
        </div>
        <div className="rounded-xl border border-current/15 bg-background/50 px-3 py-2">
          <p className="uppercase tracking-[0.16em] opacity-70">Reinstatement</p>
          <p className="mt-1 font-semibold">{riderRestriction.reinstatement_label}</p>
        </div>
      </div>
    </div>
  ) : null;

  const driverAlerts = (
    <>
      {errorMessage ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {riderRestrictionNotice}

      {selectedRider && !riderCanOperate && !riderRestrictionActive ? (
        <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          Driver operations are locked until admin verifies KYC, reinstates the rider if suspended, and unlocks login after failed attempts.
        </div>
      ) : null}

      {selectedRider && overCodLimit ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          COD limit reached. New assignments, rider availability, and withdrawals stay blocked until admin records COD settlement below {formatCurrency(codOperationLimit)}.
        </div>
      ) : null}

      {!pageLoading && !selectedRider ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-custom">
          The backend did not return a rider profile for this account. Log in with a rider account or create rider records in the backend to populate this workspace.
        </div>
      ) : null}
    </>
  );

  const driverStatsGrid = (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {dashboardStats.map((stat) => (
        <div key={stat.label} className="bg-card border border-border rounded-2xl p-3 shadow-custom sm:p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
          <p className={`mt-2 text-lg font-bold sm:text-2xl ${stat.tone}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );

  const driverProfilePanel = (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rider account and status</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Live backend rider state</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Real rider identity, KYC, hub assignment, GPS, and dispatch actions from the backend.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>
          <UserCheckIcon className="h-3.5 w-3.5" />
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10">
                <SmartphoneIcon className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p>Authenticated rider</p>
                <p className="mt-0.5 text-xs font-normal text-muted-foreground">Identity and compliance snapshot</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getKycConfig(selectedRider?.kyc_status).classes}`}>
              {getKycConfig(selectedRider?.kyc_status).label}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-2 min-[1800px]:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider?.phone ?? '—'}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Experience</p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider?.years_experience ?? 0} yrs</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stage</p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{[selectedRider?.district, selectedRider?.division, selectedRider?.boda_stage].filter(Boolean).join(" / ") || "—"}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stage Chairman</p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider?.stage_chairman_phone || "-"}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vehicle</p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{vehicleLabel(selectedRider?.vehicle_type)}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">KYC</p>
              <p className={`mt-1 text-sm font-semibold ${getKycConfig(selectedRider?.kyc_status).textClass}`}>
                {getKycConfig(selectedRider?.kyc_status).label}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Plate</p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider?.bike_plate ?? '—'}</p>
            </div>
          </div>
          <div className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-3 text-xs leading-relaxed ${riderCanReceiveAssignments ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}>
            {riderCanReceiveAssignments ? <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="min-w-0">
              {riderCanReceiveAssignments
                  ? 'Rider profile is operational and within COD balance limits.'
                  : overCodLimit
                    ? 'Operations are blocked until COD settlement brings the rider below the limit.'
                    : riderOperationBlockReason() || 'Operations are blocked until KYC is verified, legal agreements are accepted, the account is active, and login is unlocked.'}
            </span>
          </div>
          {riderRestrictionActive ? (
            <div className={`mt-3 rounded-xl border px-3 py-3 text-xs leading-relaxed ${riderRestrictionTone}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2 font-bold">
                  <TimerResetIcon className="h-4 w-4 shrink-0" />
                  <span>{riderRestriction.label}</span>
                </span>
                <span className="font-mono font-bold">{riderRestriction.expires_at ? riderRestrictionCountdown : 'Permanent'}</span>
              </div>
              <p className="mt-2">{riderRestriction.reason || 'Restriction reason is pending admin note.'}</p>
              <p className="mt-1 font-semibold">{riderRestriction.reinstatement_label}</p>
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-border bg-card px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Legal compliance</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {riderLegalComplete ? `${riderPolicyAcceptances.length} current rider agreements accepted` : "Required rider agreements pending"}
                </p>
              </div>
              <ShieldCheckIcon className={`h-5 w-5 ${riderLegalComplete ? "text-success" : "text-warning"}`} />
            </div>
            {riderLegalComplete ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {riderPolicyAcceptances.map((agreement) => (
                  <div key={agreement.key} className="rounded-lg bg-muted px-3 py-2">
                    <p className="truncate text-xs font-semibold text-foreground">{agreement.title}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Version {agreement.version} | {agreement.accepted_at ? formatDateTime(agreement.accepted_at) : "Accepted"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-warning/20 bg-warning/10 p-3">
                <p className="text-xs leading-relaxed text-warning">
                  Rider operations stay locked until the current rider legal documents are accepted.
                </p>
                <div className="mt-3 grid gap-2">
                  {riderPolicies.map((policy) => (
                    <a
                      key={policy.key}
                      href={policyDownloadHref(policy)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        if (policy.file_available === false) {
                          event.preventDefault();
                          toast.error("This rider policy document file is not available on the server yet.");
                        }
                      }}
                      className={`inline-flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        policy.file_available === false
                          ? "cursor-not-allowed border-warning/20 bg-background/70 text-warning"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      <span className="truncate">{policy.title}</span>
                      <ExternalLinkIcon className={`h-3.5 w-3.5 shrink-0 ${policy.file_available === false ? "text-warning" : "text-primary"}`} />
                    </a>
                  ))}
                </div>
                {isRiderAccount ? (
                  <button
                    type="button"
                    onClick={acceptRiderPolicies}
                    disabled={actionLoading === "accept-policies" || riderPolicies.length === 0 || riderUnavailableRequiredPolicies.length > 0}
                    title={riderPolicies.length === 0 ? "Rider policy documents are still loading or unavailable." : riderUnavailableRequiredPolicies.length > 0 ? "Required rider policy files are unavailable on the server." : "Accept the current rider legal agreements."}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <LoadingButtonContent
                      loading={actionLoading === "accept-policies"}
                      loadingLabel="Accepting agreements"
                      label="Accept required agreements"
                      icon={<ShieldCheckIcon className="h-3.5 w-3.5" />}
                    />
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">The rider must accept these agreements from the rider account.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10">
                <LocateFixedIcon className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p>Status and GPS</p>
                <p className="mt-0.5 text-xs font-normal text-muted-foreground">Availability, hub, and live location</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${gpsTrackingEnabled ? 'border-success/20 bg-success/10 text-success' : 'border-destructive/20 bg-destructive/10 text-destructive'}`}>
              {gpsTrackingEnabled ? 'Tracking live' : 'GPS inactive'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-2 min-[1800px]:grid-cols-4">
            {driverStatuses.map((item) => (
              <button
                key={item.value}
                onClick={() => updateRiderStatus(item.value)}
                title={riderStatusDisabledReason(item.value) || `Set rider status to ${item.label}.`}
                disabled={actionLoading === 'status' || Boolean(riderStatusDisabledReason(item.value))}
                className={`min-h-10 rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-colors ${
                  status === item.value ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
                } disabled:opacity-50`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hub</p>
              <p className="mt-1 break-words font-semibold leading-snug text-foreground">{selectedHubLabel}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">GPS proximity</p>
              <p className="mt-1 break-words font-semibold leading-snug text-foreground">{proximityLabel}</p>
              <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">{gpsLabel} | Updated {formatDateTime(selectedRider?.last_location_update)}</p>
            </div>
          </div>
          <button
            onClick={syncGpsLocation}
            title={actionLoading === 'gps' ? 'GPS sync is already running.' : 'Sync rider GPS with the backend.'}
            className={`mt-3 w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${
              gpsTrackingEnabled ? 'border-success/20 bg-success/10 text-success' : 'border-destructive/20 bg-destructive/10 text-destructive'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2">
                {gpsTrackingEnabled ? <ShieldCheckIcon className="h-4 w-4 shrink-0" /> : <WifiOffIcon className="h-4 w-4 shrink-0" />}
                <span className="min-w-0">{gpsTrackingEnabled ? 'GPS tracker active' : 'GPS tracker inactive'}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                {actionLoading === 'gps' ? <LoaderGlyph size="xs" label="Syncing GPS" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
                {gpsTrackingEnabled ? 'Tracking live' : 'Sync location'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {gpsWarning ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
          <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">GPS is inactive or the rider is offline, so the alert banner stays on.</span>
        </div>
      ) : null}
    </div>
  );

  const driverDashboardStatusPanel = (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rider command status</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Ready state and next move</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use dedicated screens for full profile, order actions, wallet, and support.</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>
          <UserCheckIcon className="h-3.5 w-3.5" />
          {statusLabel}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
          <p className="text-muted-foreground">Vehicle</p>
          <p className="mt-1 font-semibold text-foreground">{vehicleLabel(selectedRider?.vehicle_type)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
          <p className="text-muted-foreground">KYC</p>
          <p className={`mt-1 font-semibold ${getKycConfig(selectedRider?.kyc_status).textClass}`}>{getKycConfig(selectedRider?.kyc_status).label}</p>
        </div>
        <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
          <p className="text-muted-foreground">Hub</p>
          <p className="mt-1 line-clamp-2 font-semibold text-foreground">{selectedHubLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
          <p className="text-muted-foreground">GPS</p>
          <p className={`mt-1 font-semibold ${gpsTrackingEnabled ? "text-success" : "text-destructive"}`}>{gpsTrackingEnabled ? "Live" : "Inactive"}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {driverStatuses.map((item) => (
          <button
            key={item.value}
            onClick={() => updateRiderStatus(item.value)}
            title={riderStatusDisabledReason(item.value) || `Set rider status to ${item.label}.`}
            disabled={actionLoading === 'status' || Boolean(riderStatusDisabledReason(item.value))}
            className={`min-h-10 rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-colors ${
              status === item.value ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
            } disabled:opacity-50`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-3 text-xs leading-relaxed ${riderCanReceiveAssignments ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}>
        {riderCanReceiveAssignments ? <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="min-w-0">
          {riderCanReceiveAssignments
            ? 'Rider profile is operational and within COD balance limits.'
            : overCodLimit
              ? 'Operations are blocked until COD settlement brings the rider below the limit.'
              : riderOperationBlockReason() || 'Operations are blocked until KYC is verified, legal agreements are accepted, the account is active, and login is unlocked.'}
        </span>
      </div>
    </div>
  );

  const driverOrdersPanel = (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock3Icon className="h-4 w-4 text-primary" />
          Assigned orders
        </div>
        <button onClick={refreshSelectedRider} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">
          Refresh
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {detailLoading ? (
          <AppLoader
            variant="inline"
            label="Loading rider orders"
            subtitle="Fetching assigned orders and rider data."
          />
        ) : null}
        {!detailLoading && activeOrders.length === 0 ? (
          <GuidedEmptyState
            icon={NavigationIcon}
            title="No active assigned orders"
            description="Refresh after admin assigns a pending order. If you are using demo data, seed it again and accept the assignment before its timer expires."
          />
        ) : null}
        {activeOrders.map((order) => (
          <button
            key={order.id}
            onClick={() => {
              setSelectedOrderId(order.id);
              navigate(`/driver/orders/${order.id}`);
            }}
            className={`w-full rounded-2xl border p-4 text-left transition-colors ${
              selectedOrder?.id === order.id ? 'border-primary bg-primary/5' : 'border-border bg-background/70 hover:border-primary/30'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{order.order_id}</p>
                <p className="break-words text-xs text-muted-foreground">{order.customer_name} - {order.delivery_address}</p>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                {order.delivery_zone}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4 text-xs">
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Value</p>
                <p className="font-semibold text-foreground">{formatCurrency(order.declared_value)}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">COD</p>
                <p className="font-semibold text-foreground">{formatCurrency(order.cod_amount)}</p>
              </div>
              <div className="rounded-xl bg-primary/10 px-3 py-2">
                <p className="text-primary">Fee</p>
                <p className="font-semibold text-primary">{formatCurrency(order.delivery_fee)}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Tracker</p>
                <p className="break-all font-semibold text-foreground">{order.physical_tracker_id || order.package_tracking_id || '—'}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const driverOrderActionPanel = selectedOrder ? (
    <div className="w-full space-y-4">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-custom sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Focused delivery action</p>
            <h3 className="mt-1 break-words text-lg font-bold text-foreground">{selectedOrder.order_id}</h3>
            <p className="mt-1 break-words text-xs text-muted-foreground">{selectedOrder.customer_name} | {selectedOrder.delivery_address}</p>
          </div>
          <span className="rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
            {selectedOrder.assignment_response_status === 'pending' ? `Accept in ${orderCountdown}` : deliverySetupSteps[deliverySetupStep]?.label}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
          {[
            { value: "setup" as const, label: "Setup" },
            { value: "actions" as const, label: "Actions" },
            { value: "incident" as const, label: "Incident" },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setDriverOrderActionView(tab.value)}
              className={driverSegmentedButtonClass(driverOrderActionView === tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className={driverOrderActionView === "setup" ? "space-y-6" : "hidden"}>
        <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Delivery setup</p>
              <h3 className="mt-2 text-lg font-bold text-foreground">Current required action</h3>
            </div>
            <span className="rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
              {selectedOrder.assignment_response_status === 'pending' ? `Accept in ${orderCountdown}` : deliverySetupSteps[deliverySetupStep]?.label}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <WorkflowStepper steps={deliverySetupSteps} currentStep={deliverySetupStep} />
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Guided next step</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{deliverySetupGuidance}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Package tracker scan</p>
              <h3 className="mt-2 text-lg font-bold text-foreground">Hub QR + tracker tag</h3>
            </div>
            <ScanLineIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2Icon className="h-4 w-4 text-primary" />
              Hub custody scan
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              <TagIcon className="h-4 w-4" />
              Package ID: {selectedOrder.package_tracking_id ?? '—'}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <ScanLineIcon className="h-4 w-4 text-primary" />
              Physical tag: {selectedOrder.physical_tracker_id ?? 'Not linked'}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={trackerCode} onChange={(event) => setTrackerCode(event.target.value.toUpperCase())} placeholder="Physical tracker tag" className="rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none" />
              <button onClick={linkPackageTracker} title={orderActionDisabledReason("tracker_link") || "Link a physical tracker tag to this package."} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={!canLinkTracker || actionLoading === 'tracker-link'}>
                <LoadingButtonContent loading={actionLoading === 'tracker-link'} loadingLabel="Linking tracker" label="Link tracker" />
              </button>
            </div>
            <button onClick={syncPackageTrackerLocation} title={orderActionDisabledReason("tracker_gps") || "Sync this package tracker location with the backend."} className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50" disabled={!selectedOrder || !isRiderAccount || !riderCanOperate || actionLoading === 'tracker-gps'}>
              <LoadingButtonContent loading={actionLoading === 'tracker-gps'} loadingLabel="Syncing tracker GPS" label="Sync tracker GPS" />
            </button>
          </div>
        </div>
      </section>

      <section className={driverOrderActionView === "setup" ? "hidden" : "space-y-6"}>
        <div className={`${driverOrderActionView === "actions" ? "block" : "hidden"} bg-card border border-border rounded-3xl p-5 shadow-custom`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Order actions</p>
              <h3 className="mt-2 text-lg font-bold text-foreground">Customer proof and delivery tools</h3>
            </div>
            <PhoneCallIcon className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedOrder.customer_name}</p>
                <p className="break-words text-xs text-muted-foreground">{selectedOrder.customer_phone}</p>
              </div>
              {selectedOrder.customer_phone ? (
                <a href={`tel:${selectedOrder.customer_phone}`} title="Call this customer." className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  Call customer
                </a>
              ) : (
                <button title="Customer phone is missing on this order." className="shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground" disabled>
                  Call customer
                </button>
              )}
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Package value</p>
                <p className="font-semibold text-foreground">{formatCurrency(selectedOrder.declared_value)}</p>
              </div>
              <div className="rounded-xl bg-primary/10 px-3 py-2">
                <p className="text-primary">Delivery fee</p>
                <p className="font-semibold text-primary">{formatCurrency(selectedOrder.delivery_fee)}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Distance</p>
                <p className="font-semibold text-foreground">{selectedOrder.pricing_distance_km !== null && selectedOrder.pricing_distance_km !== undefined ? `${selectedOrder.pricing_distance_km.toFixed(2)} KM` : 'Unavailable'}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Service</p>
                <p className="font-semibold text-foreground">{selectedOrder.service_level === 'express' ? 'Express 1-hour request' : 'Standard'}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Tracker</p>
                <p className="break-all font-semibold text-foreground">{selectedOrder.physical_tracker_id || selectedOrder.package_tracking_id || '—'}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Assignment</p>
                <p className="font-semibold text-foreground">{selectedOrder.assignment_response_status ?? 'unassigned'}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Handover</p>
                <p className={`font-semibold ${selectedOrder.handover_verified ? 'text-success' : 'text-warning'}`}>{selectedOrder.handover_verified ? 'Verified' : 'Waiting merchant'}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Hub scan-in</p>
                <p className={`font-semibold ${selectedOrder.hub_scan_in ? 'text-success' : 'text-warning'}`}>{selectedOrder.hub_scan_in ? new Date(selectedOrder.hub_scan_in).toLocaleString() : 'Required'}</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-muted-foreground">Testing OTP</p>
                <p className="font-semibold text-foreground">{selectedOrder.dev_otp_code ?? 'Hidden'}</p>
              </div>
            </div>

            <label className="block rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
              <span className="mb-2 block font-semibold text-foreground">Proof photo</span>
              <input type="file" accept="image/*" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} className="block w-full min-w-0 text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
              {proofFile ? <span className="mt-2 block break-all">{proofFile.name}</span> : null}
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={acceptOrderAssignment} title={orderActionDisabledReason("accept") || "Accept this pending rider assignment."} className="rounded-xl bg-success px-3 py-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!selectedOrder || !canAcceptOrder || actionLoading === 'assignment-accept'}>
                <LoadingButtonContent loading={actionLoading === 'assignment-accept'} loadingLabel="Accepting" label="Accept" />
              </button>
              <button onClick={rejectOrderAssignment} title={orderActionDisabledReason("reject") || "Reject this pending rider assignment."} className="rounded-xl bg-destructive px-3 py-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!selectedOrder || !canRejectAssignment || actionLoading === 'assignment-reject'}>
                <LoadingButtonContent loading={actionLoading === 'assignment-reject'} loadingLabel="Rejecting" label="Reject" />
              </button>
              <button onClick={confirmPickupCustody} title={orderActionDisabledReason("pickup") || "Confirm pickup after merchant handover is verified."} className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50" disabled={!selectedOrder || !canConfirmPickup || actionLoading === 'order-picked_up'}>
                <LoadingButtonContent loading={actionLoading === 'order-picked_up'} loadingLabel="Confirming pickup" label="Confirm Pickup" />
              </button>
              <button onClick={() => updateOrderStatus('at_hub')} title={orderActionDisabledReason("at_hub") || "Mark the package as scanned at hub when allowed."} className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50" disabled={!selectedOrder || !canMarkAtHub || actionLoading === 'order-at_hub'}>
                <LoadingButtonContent loading={actionLoading === 'order-at_hub'} loadingLabel="Updating hub status" label="At Hub" />
              </button>
              <button onClick={() => updateOrderStatus('out_for_delivery')} title={orderActionDisabledReason("start_delivery") || "Start delivery after hub scan-in is complete."} className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50" disabled={!selectedOrder || !canStartDelivery || actionLoading === 'order-out_for_delivery'}>
                <LoadingButtonContent loading={actionLoading === 'order-out_for_delivery'} loadingLabel="Starting delivery" label="Start Delivery" />
              </button>
              <button onClick={markOrderFailed} title={orderActionDisabledReason("failed") || "Mark failed with proof when the customer is unavailable or delivery cannot be completed."} className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-xs font-semibold text-destructive disabled:opacity-50" disabled={!selectedOrder || !canMarkFailed || actionLoading === 'order-failed'}>
                <LoadingButtonContent loading={actionLoading === 'order-failed'} loadingLabel="Marking failed" label="Failed Delivery" />
              </button>
              {buildOrderMapUrl(selectedOrder, selectedRider?.vehicle_type) ? (
                <a href={buildOrderMapUrl(selectedOrder, selectedRider?.vehicle_type) || undefined} title="Open this delivery route in OpenStreetMap." target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-card px-3 py-3 text-center text-xs font-semibold text-foreground">
                  Open map
                </a>
              ) : (
                <button title="Delivery address is missing, so map navigation cannot open." className="rounded-xl border border-border bg-muted px-3 py-3 text-center text-xs font-semibold text-muted-foreground" disabled>
                  Open map
                </button>
              )}
            </div>

            <button onClick={returnOrderToMerchant} title={orderActionDisabledReason("return") || "Return this order to merchant."} className="w-full rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-xs font-semibold text-warning disabled:opacity-50" disabled={!selectedOrder || !canReturnOrder || actionLoading === 'order-returned'}>
              <LoadingButtonContent loading={actionLoading === 'order-returned'} loadingLabel="Returning order" label="Return to Merchant" />
            </button>

            <div className="grid gap-2 sm:grid-cols-2">
              <input value={otpValue} onChange={(event) => setOtpValue(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit OTP" inputMode="numeric" maxLength={4} className="rounded-xl border border-border bg-background/80 px-3 py-3 text-xs text-foreground outline-none" />
              <button onClick={() => updateOrderStatus('delivered')} title={orderActionDisabledReason("delivered") || "Verify customer OTP and complete delivery."} className="rounded-xl bg-primary px-3 py-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!selectedOrder || !canMarkDelivered || actionLoading === 'order-delivered'}>
                <LoadingButtonContent loading={actionLoading === 'order-delivered'} loadingLabel="Verifying OTP" label="Verify OTP" />
              </button>
            </div>
          </div>
        </div>

        <div className={`${driverOrderActionView === "incident" ? "block" : "hidden"} bg-card border border-border rounded-3xl p-5 shadow-custom`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CameraIcon className="h-4 w-4 text-primary" />
            Incident reporting
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {incidentTypes.map((type) => (
              <button key={type.value} onClick={() => setIncidentType(type.value)} className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${incidentType === type.value ? 'border-destructive bg-destructive text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                {type.label}
              </button>
            ))}
          </div>
          <textarea value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} rows={4} placeholder="Describe what happened, where it happened, and what support is needed." className="mt-4 w-full rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm text-foreground outline-none resize-none" />
          <button onClick={submitIncident} title={actionLoading === 'incident' ? "Incident report is already being submitted." : "Submit this incident report to the backend."} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm font-medium text-foreground disabled:opacity-50" disabled={actionLoading === 'incident'}>
            <span className="inline-flex items-center gap-2">
              <LoadingButtonContent loading={actionLoading === 'incident'} loadingLabel="Reporting incident" label="Report incident" icon={<AlertTriangleIcon className="h-4 w-4 text-warning" />} />
            </span>
            <TimerResetIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </section>
      </div>
    </div>
  ) : orderDetailLoading ? (
    <AppLoader
      variant="panel"
      label="Loading delivery action"
      subtitle="Checking the backend for this driver assignment before enabling delivery actions."
    />
  ) : (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-custom">
      <GuidedEmptyState icon={TruckIcon} title="No assigned order selected" description="Open the driver orders screen and choose an active assignment before using delivery actions." />
      <Link to="/driver/orders" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Back to Orders</Link>
    </div>
  );

  const driverWalletPanel = (
    <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CreditCardIcon className="h-4 w-4 text-primary" />
        Earnings and payments
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
        {[
          { value: "summary" as const, label: "Summary" },
          { value: "request" as const, label: "Request" },
          { value: "history" as const, label: "History" },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setDriverWalletView(tab.value)}
            className={driverSegmentedButtonClass(driverWalletView === tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {driverWalletView === "summary" ? (
        <>
          <div className="mt-4 space-y-3">
            {earningsBreakdown.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border bg-background/70 px-4 py-3">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="text-sm font-semibold text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${overCodLimit ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'border-success/20 bg-success/10 text-success'}`}>
            {overCodLimit
              ? `COD balance is at or above the ${formatCurrency(codOperationLimit)} operational limit. New assignments and withdrawals are blocked by backend rules.`
              : `COD balance is below the ${formatCurrency(codOperationLimit)} operational limit.`}
          </div>
        </>
      ) : null}

      {driverWalletView === "request" ? (
      <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Withdrawal request</p>
            <p className="mt-1 text-sm text-muted-foreground">Request payout from the current pending rider balance.</p>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
            {activeWithdrawal ? activeWithdrawal.status : 'Ready'}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <input value={withdrawalDraft.amount} onChange={(event) => setWithdrawalDraft((current) => ({ ...current, amount: event.target.value.replace(/[^\d.]/g, '') }))} placeholder="Amount" inputMode="decimal" className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none" />
          <input value={withdrawalDraft.account_phone} onChange={(event) => setWithdrawalDraft((current) => ({ ...current, account_phone: event.target.value }))} placeholder="Mobile money phone" className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none" />
        </div>
        <textarea value={withdrawalDraft.note} onChange={(event) => setWithdrawalDraft((current) => ({ ...current, note: event.target.value }))} rows={2} placeholder="Optional note" className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none resize-none" />
        <button onClick={requestWithdrawal} title={withdrawalDisabledReason() || "Submit this rider withdrawal request to the backend."} disabled={!canRequestWithdrawal || actionLoading === 'withdrawal-request'} className="mt-3 w-full rounded-xl bg-primary px-3 py-3 text-xs font-semibold text-white disabled:opacity-50">
          <LoadingButtonContent loading={actionLoading === 'withdrawal-request'} loadingLabel="Submitting request" label="Request withdrawal" />
        </button>
      </div>
      ) : null}

      {driverWalletView === "history" ? (
      <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Payout status history</p>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{settlements.length} records</span>
        </div>
        <div className="mt-3 space-y-2">
          {settlements.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">No withdrawal or COD settlement records yet.</p>
          ) : null}
          {settlements.slice(0, 8).map((settlement) => (
            <div key={settlement.id} className="rounded-xl border border-border bg-card px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{settlement.reference}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {settlement.type === 'withdrawal' ? 'Withdrawal' : 'COD settlement'} | {formatDateTime(settlement.createdAt)}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${settlement.status === 'completed' ? 'border-success/20 bg-success/10 text-success' : settlement.status === 'rejected' ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'border-warning/20 bg-warning/10 text-warning'}`}>
                  {settlement.status}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-semibold text-foreground">{formatCurrency(settlement.amount)}</p>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-muted-foreground">Method</p>
                  <p className="font-semibold text-foreground">{settlement.method || '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      ) : null}
    </div>
  );

  const driverSupportPanel = (
    <div className="w-full space-y-6">
      <SupportPanel title="Driver support" />
      <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Incident report</p>
            <h3 className="mt-2 text-lg font-bold text-foreground">Report operational issue</h3>
            <p className="mt-1 text-sm text-muted-foreground">Send accident, theft, package, customer, or roadside issues to admin review.</p>
          </div>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
            {openIncidents.length} open
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {incidentTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setIncidentType(type.value)}
              className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                incidentType === type.value
                  ? 'border-destructive bg-destructive text-white'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
        <textarea
          value={incidentDescription}
          onChange={(event) => setIncidentDescription(event.target.value)}
          rows={4}
          placeholder="Describe what happened, where it happened, and what support is needed."
          className="mt-4 w-full resize-none rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          onClick={submitIncident}
          title={actionLoading === 'incident' ? "Incident report is already being submitted." : "Submit this incident report to admin support."}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={actionLoading === 'incident'}
        >
          <LoadingButtonContent loading={actionLoading === 'incident'} loadingLabel="Reporting incident" label="Report incident" icon={<AlertTriangleIcon className="h-4 w-4" />} />
        </button>
      </div>
      <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TruckIcon className="h-4 w-4 text-primary" />
          Live rider snapshot
        </div>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Status updates are sent to <span className="font-medium text-foreground">/auth/riders</span></li>
          <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Order actions use <span className="font-medium text-foreground">/auth/orders</span> and backend OTP verification</li>
          <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Active orders are filtered from the real assigned order list</li>
        </ul>
        {incidents.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Recent incidents</p>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{openIncidents.length} open</span>
            </div>
            <div className="mt-3 space-y-2">
              {incidents.slice(0, 3).map((incident, index) => (
                <div key={`${incident.type}-${index}`} className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-foreground uppercase">{incident.type}</span>
                    <span className="text-muted-foreground">{incident.status ?? 'open'}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{incident.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(incident.reported_at)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs text-muted-foreground">
            No incident reports submitted yet.
          </div>
        )}
      </div>
    </div>
  );

  if (isRiderAccount && screen !== "admin") {
    const driverContent = (() => {
      if (screen === "dashboard") {
        return (
          <div className="space-y-4">
            {driverStatsGrid}
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
              {[
                { value: "status" as const, label: "Status" },
                { value: "orders" as const, label: "Orders" },
                { value: "wallet" as const, label: "Wallet" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setDriverDashboardView(tab.value)}
                  className={driverSegmentedButtonClass(driverDashboardView === tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {driverDashboardView === "status" ? (
              <div className="space-y-4">
                {driverDashboardStatusPanel}
                <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Next action</p>
                  <h2 className="mt-2 text-xl font-bold text-foreground">Open a focused rider screen.</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <Link to="/driver/orders" className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white">Open Orders</Link>
                    <Link to="/driver/wallet" className="rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-semibold text-foreground">Wallet</Link>
                    <Link to="/driver/profile" className="rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-semibold text-foreground">Profile</Link>
                  </div>
                </div>
              </div>
            ) : null}
            {driverDashboardView === "orders" ? driverOrdersPanel : null}
            {driverDashboardView === "wallet" ? driverWalletPanel : null}
          </div>
        );
      }

      if (screen === "orders") {
        return <div className="w-full">{driverOrdersPanel}</div>;
      }

      if (screen === "order-details") {
        return driverOrderActionPanel;
      }

      if (screen === "wallet") {
        return <div className="w-full">{driverWalletPanel}</div>;
      }

      if (screen === "profile") {
        return <div className="w-full">{driverProfilePanel}</div>;
      }

      return driverSupportPanel;
    })();

    return (
      <div data-cmp="Drivers" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
        <Header title={driverScreenTitle[screen]} subtitle={workspaceSubtitle} />

        {pageLoading ? (
          <DriverDashboardSkeleton />
        ) : (
          <div className="content-scroll flex-1 bg-linear-to-br from-background via-card/30 to-primary/5">
            <div className="viewport-safe space-y-4 px-3 py-3 sm:px-6 sm:py-5">
              {driverAlerts}
              {driverContent}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-cmp="Drivers" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header
        title={riderRoomTitle}
        subtitle={workspaceSubtitle}
      />

      {pageLoading ? (
        <DriverDashboardSkeleton />
      ) : (
      <div className="content-scroll flex-1 bg-linear-to-br from-background via-card/30 to-primary/5">
        <div className="viewport-safe space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          {errorMessage ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {riderRestrictionNotice}

          {selectedRider && !riderCanOperate && !riderRestrictionActive ? (
            <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
              Driver operations are locked until admin verifies KYC, reinstates the rider if suspended, and unlocks login after failed attempts.
            </div>
          ) : null}

          {selectedRider && overCodLimit ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              COD limit reached. New assignments, rider availability, and withdrawals stay blocked until admin records COD settlement below {formatCurrency(codOperationLimit)}.
            </div>
          ) : null}

          {!pageLoading && !selectedRider ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-custom">
              The backend did not return a rider profile for this account. Log in with a rider account or create rider records in the backend to populate this workspace.
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-4">
            {dashboardStats.map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 shadow-custom">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                <p className={`mt-2 text-2xl font-bold ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {canSwitchRiders && riders.length > 0 ? (
            <div className="bg-card border border-border rounded-3xl p-4 shadow-custom">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Driver roster</p>
                  <h2 className="mt-1 text-lg font-bold text-foreground">Select the rider to inspect</h2>
                </div>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" />
                  {riders.length} active riders
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {riders.map((rider) => (
                  <button
                    key={rider.id}
                    onClick={() => setSelectedRider(rider)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      selectedRider?.id === rider.id
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="block">{rider.full_name}</span>
                    <span className={`mt-0.5 block text-[10px] ${selectedRider?.id === rider.id ? 'text-white/75' : 'text-muted-foreground'}`}>
                      {vehicleLabel(rider.vehicle_type)}
                    </span>
                    <span className={`mt-0.5 block text-[10px] ${selectedRider?.id === rider.id ? 'text-white/75' : getKycConfig(rider.kyc_status).textClass}`}>
                      {rider.is_active === false ? (getRiderRestriction(rider, now).label || 'Restricted') : getKycConfig(rider.kyc_status).label}
                      {rider.account_locked ? ' | Locked' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-border bg-card p-2 shadow-custom">
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {adminRiderTabs.map((tab) => {
                const active = adminRiderView === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setAdminRiderView(tab.value)}
                    className={`min-h-14 rounded-2xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-border bg-background/70 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    <span className="block text-xs font-bold">{tab.label}</span>
                    <span className={`mt-1 block text-[10px] ${active ? "text-white/75" : "text-muted-foreground"}`}>{tab.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`grid min-w-0 gap-6 ${adminRiderView === "orders" ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : ""}`}>
            <section className={`min-w-0 space-y-6 ${adminRiderView === "support" ? "hidden" : ""}`}>
              <div className={`bg-card border border-border rounded-3xl p-5 shadow-custom ${["overview", "kyc", "security"].includes(adminRiderView) ? "" : "hidden"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rider account and status</p>
                    <h2 className="mt-2 text-xl font-bold text-foreground">Live backend rider state</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      Real rider identity, KYC, hub assignment, GPS, and dispatch actions from the backend.
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>
                    <UserCheckIcon className="h-3.5 w-3.5" />
                    {statusLabel}
                  </span>
                </div>

                {canSwitchRiders && selectedRider ? (
                  <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Selected rider</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{riderDetailsLine}</p>
                      </div>
                      <span className="rounded-full border border-border px-3 py-1 text-[10px] text-muted-foreground">
                        Rider ID {selectedRider.id}
                      </span>
                    </div>
                    <div className={`mt-4 rounded-2xl border border-border bg-card p-3 ${adminRiderView === "overview" ? "" : "hidden"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Performance-based dispatch</p>
                          <p className="mt-1 text-xs text-muted-foreground">Backend score used for auto-dispatch priority, proximity, and rejection penalties.</p>
                        </div>
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          Priority {formatScore(dispatchMetrics?.priority_score)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          { label: 'Performance', value: formatScore(selectedRider.performance_score ?? dispatchMetrics?.performance_score) },
                          { label: 'Acceptance', value: formatScore(dispatchMetrics?.acceptance_rate) },
                          { label: 'Cancellation', value: formatScore(dispatchMetrics?.cancellation_ratio) },
                          { label: 'Punctuality', value: formatScore(dispatchMetrics?.punctuality_rate) },
                          { label: 'Rating', value: formatScore(dispatchMetrics?.customer_rating_score) },
                          { label: 'Complaints', value: formatScore(dispatchMetrics?.complaint_score) },
                          { label: 'GPS consistency', value: formatScore(dispatchMetrics?.gps_consistency_score) },
                          { label: 'Distance', value: dispatchMetrics?.distance_km !== null && dispatchMetrics?.distance_km !== undefined ? `${dispatchMetrics.distance_km.toFixed(2)} km` : proximityLabel },
                        ].map((metric) => (
                          <div key={metric.label} className="rounded-xl border border-border bg-background/80 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{metric.value}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[10px] text-muted-foreground">
                        Attempts {dispatchMetrics?.assignments_total ?? 0} | Accepted {dispatchMetrics?.accepted_assignments ?? 0} | Rejected {dispatchMetrics?.rejected_assignments ?? 0} | Expired {dispatchMetrics?.expired_assignments ?? 0} | Updated {formatDateTime(dispatchMetrics?.calculated_at)}
                      </p>
                    </div>

                    <div className={`mt-4 rounded-2xl border border-border bg-card p-3 ${adminRiderView === "overview" ? "" : "hidden"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Operational profile</p>
                          <p className="mt-1 text-xs text-muted-foreground">Admin-only edits for dispatch identity and contact details.</p>
                        </div>
                        <button
                          onClick={updateOperationalProfile}
                          title={adminActionDisabledReason("profile") || "Save this rider operational profile through the backend."}
                          disabled={actionLoading === 'profile' || !profileDraftChanged}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                        >
                          <LoadingButtonContent loading={actionLoading === 'profile'} loadingLabel="Saving profile" label="Save Profile" />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <input
                          value={profileDraft.full_name}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, full_name: event.target.value }))}
                          placeholder="Rider name"
                          className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                        />
                        <input
                          value={profileDraft.phone}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="Phone"
                          className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                        />
                        <input
                          value={profileDraft.bike_plate}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, bike_plate: event.target.value.toUpperCase() }))}
                          placeholder="Vehicle plate"
                          className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                        />
                        <input
                          value={profileDraft.stage_chairman_phone}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, stage_chairman_phone: event.target.value }))}
                          placeholder="Stage chairman phone"
                          className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                        />
                      </div>
                    </div>
                    <div className={`mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] ${adminRiderView === "overview" ? "" : "hidden"}`}>
                      <CustomSelect
                        value={vehicleTypeDraft}
                        onValueChange={(nextValue) => setVehicleTypeDraft(nextValue as VehicleType)}
                        ariaLabel="Rider vehicle type"
                        options={vehicleOptions.map((vehicle) => ({
                          value: vehicle.value,
                          label: vehicle.label,
                        }))}
                        triggerClassName="h-10 rounded-lg bg-card py-2"
                      />
                      <button
                        onClick={updateRiderVehicle}
                        title={adminActionDisabledReason("vehicle") || "Update this rider vehicle type through the backend."}
                        disabled={actionLoading === 'vehicle' || vehicleTypeDraft === selectedRider.vehicle_type}
                        className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
                      >
                        <LoadingButtonContent loading={actionLoading === 'vehicle'} loadingLabel="Saving vehicle" label="Update Vehicle" />
                      </button>
                    </div>
                    <div className={`mt-4 grid gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2 ${["kyc", "security"].includes(adminRiderView) ? "" : "hidden"}`}>
                      <div className={adminRiderView === "kyc" ? "" : "hidden"}>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">KYC state</p>
                        <p className={`mt-1 text-sm font-semibold ${getKycConfig(selectedRider.kyc_status).textClass}`}>
                          {getKycConfig(selectedRider.kyc_status).label}
                        </p>
                        {selectedRider.kyc_rejection_reason ? (
                          <p className="mt-1 text-xs text-destructive">{selectedRider.kyc_rejection_reason}</p>
                        ) : null}
                      </div>
                      <div className={adminRiderView === "kyc" ? "" : "hidden"}>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Review readiness</p>
                        <p className={`mt-1 text-sm font-semibold ${allRequiredKycDocumentsUploaded ? 'text-success' : 'text-warning'}`}>
                          {allRequiredKycDocumentsUploaded && allRequiredKycDocumentsReviewable
                            ? 'All required documents ready for approval'
                            : allRequiredKycDocumentsUploaded
                              ? 'Documents uploaded but stored upload review is incomplete'
                              : 'Missing required documents'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Rider stays blocked from dispatch until KYC is approved.
                        </p>
                      </div>
                      <div className={`sm:col-span-2 rounded-xl border border-border bg-background/70 px-3 py-3 ${adminRiderView === "kyc" ? "" : "hidden"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Legal compliance</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {riderLegalComplete ? `${riderPolicyAcceptances.length} current rider agreements accepted` : "Required rider agreements pending"}
                            </p>
                          </div>
                          <ShieldCheckIcon className={`h-5 w-5 ${riderLegalComplete ? "text-success" : "text-warning"}`} />
                        </div>
                        {riderLegalComplete ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {riderPolicyAcceptances.map((agreement) => (
                              <div key={agreement.key} className="rounded-lg bg-muted px-3 py-2">
                                <p className="truncate text-xs font-semibold text-foreground">{agreement.title}</p>
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  Version {agreement.version} | {agreement.accepted_at ? formatDateTime(agreement.accepted_at) : "Accepted"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-xl border border-warning/20 bg-warning/10 p-3">
                            <p className="text-xs leading-relaxed text-warning">
                              This rider cannot be dispatched until the current legal agreements are accepted.
                            </p>
                            <div className="mt-3 grid gap-2">
                              {riderPolicies.map((policy) => (
                                <a
                                  key={policy.key}
                                  href={policyDownloadHref(policy)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => {
                                    if (policy.file_available === false) {
                                      event.preventDefault();
                                      toast.error("This rider policy document file is not available on the server yet.");
                                    }
                                  }}
                                  className={`inline-flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                                    policy.file_available === false
                                      ? "cursor-not-allowed border-warning/20 bg-background/70 text-warning"
                                      : "border-border bg-card text-foreground"
                                  }`}
                                >
                                  <span className="truncate">{policy.title}</span>
                                  <ExternalLinkIcon className={`h-3.5 w-3.5 shrink-0 ${policy.file_available === false ? "text-warning" : "text-primary"}`} />
                                </a>
                              ))}
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">Acceptance must be completed from the rider account before operational access unlocks.</p>
                          </div>
                        )}
                      </div>
                      <div className={`sm:col-span-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4 ${adminRiderView === "kyc" ? "" : "hidden"}`}>
                        {requiredRiderDocuments.map((requiredDocument) => {
                          const document = findRiderDocument(selectedRider, requiredDocument.type);
                          const uploaded = Boolean(document);
                          const reviewable = isRiderDocumentReviewable(document);
                          const storedUpload = hasStoredRiderDocumentReference(document);
                          return (
                            <div key={requiredDocument.type} className={`rounded-xl border p-3 ${uploaded ? 'border-success/20 bg-success/10' : 'border-warning/20 bg-warning/10'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold text-foreground">{requiredDocument.label}</p>
                                  <p className={`mt-1 text-[10px] font-semibold ${uploaded ? 'text-success' : 'text-warning'}`}>
                                    {uploaded ? (document?.verified ? 'Verified' : storedUpload ? 'Uploaded for review' : reviewable ? 'External link only' : 'Upload reference missing') : 'Missing'}
                                  </p>
                                </div>
                                <FileTextIcon className={`h-4 w-4 shrink-0 ${uploaded ? 'text-success' : 'text-warning'}`} />
                              </div>
                              <button
                                type="button"
                                onClick={() => openRiderDocument(document, requiredDocument.label)}
                                disabled={!reviewable}
                                title={reviewable ? `Open ${requiredDocument.label} for inspection.` : `${requiredDocument.label} is not uploaded or cannot be opened yet.`}
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <ExternalLinkIcon className="h-3.5 w-3.5" />
                                Open
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className={`sm:col-span-2 ${adminRiderView === "kyc" ? "" : "hidden"}`}>
                        <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground" htmlFor="admin-verification-notes">
                          Internal Admin Verification Notes
                        </label>
                        <textarea
                          id="admin-verification-notes"
                          value={adminVerificationNotes}
                          onChange={(event) => setAdminVerificationNotes(event.target.value)}
                          placeholder="Record what was checked before approving or rejecting this rider."
                          className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                        />
                        {selectedRider.admin_verification_notes_at ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">Last note saved {formatDateTime(selectedRider.admin_verification_notes_at)}</p>
                        ) : null}
                      </div>
                      <div className={`sm:col-span-2 grid grid-cols-2 gap-2 ${adminRiderView === "kyc" ? "" : "hidden"}`}>
                        <button
                          onClick={() => updateRiderKyc('verified')}
                          title={adminActionDisabledReason("kyc_verified") || "Approve this rider KYC and unlock operational access if other checks pass."}
                          disabled={Boolean(adminActionDisabledReason("kyc_verified"))}
                          className="min-w-0 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Verify / Approve
                        </button>
                        <button
                          onClick={() => updateRiderKyc('rejected')}
                          title={adminActionDisabledReason("kyc_rejected") || "Reject this rider KYC."}
                          disabled={Boolean(adminActionDisabledReason("kyc_rejected"))}
                          className="min-w-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                        >
                          Reject KYC
                        </button>
                      </div>
                      <div className={`sm:col-span-2 rounded-2xl border border-border bg-background/80 p-3 ${adminRiderView === "security" ? "" : "hidden"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground">Penalty & Restriction Engine</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              Apply reason-based soft blocks, hard blocks, or permanent suspensions. Rider login remains available so the restriction reason and countdown are visible in the app.
                            </p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${riderRestrictionActive ? riderRestrictionTone : 'border-success/20 bg-success/10 text-success'}`}>
                            {riderRestrictionActive ? riderRestriction.label : 'Operational'}
                          </span>
                        </div>

                        {riderRestrictionActive ? (
                          <div className={`mt-3 rounded-xl border px-3 py-3 text-xs ${riderRestrictionTone}`}>
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div>
                                <p className="uppercase tracking-[0.16em] opacity-75">Reason</p>
                                <p className="mt-1 font-semibold">{riderRestriction.reason || 'No reason recorded'}</p>
                              </div>
                              <div>
                                <p className="uppercase tracking-[0.16em] opacity-75">Remaining</p>
                                <p className="mt-1 font-mono font-bold">{riderRestriction.expires_at ? riderRestrictionCountdown : 'Permanent'}</p>
                              </div>
                              <div>
                                <p className="uppercase tracking-[0.16em] opacity-75">State</p>
                                <p className="mt-1 font-semibold">{riderRestriction.reinstatement_label}</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem]">
                            <CustomSelect
                              value={restrictionDraft.type}
                              onValueChange={(value) => setRestrictionDraft((current) => ({
                                ...current,
                                type: value as typeof restrictionDraft.type,
                                duration: value === 'hard_block' ? '7' : value === 'soft_block' ? '12' : '',
                              }))}
                              options={restrictionTypeOptions}
                              placeholder="Select penalty type"
                              ariaLabel="Restriction type"
                              size="sm"
                              triggerClassName="bg-card"
                            />
                            <input
                              type="number"
                              step={1}
                              min={restrictionDraft.type === 'hard_block' ? 7 : restrictionDraft.type === 'soft_block' ? 12 : undefined}
                              max={restrictionDraft.type === 'hard_block' ? 30 : restrictionDraft.type === 'soft_block' ? 48 : undefined}
                              value={restrictionDraft.duration}
                              onChange={(event) => setRestrictionDraft((current) => ({ ...current, duration: event.target.value }))}
                              disabled={restrictionDraft.type === 'permanent_suspension'}
                              placeholder={restrictionDraft.type === 'hard_block' ? 'Days' : restrictionDraft.type === 'soft_block' ? 'Hours' : 'No expiry'}
                              title={restrictionDraft.type === 'hard_block' ? 'Hard block duration: 7-30 days.' : restrictionDraft.type === 'soft_block' ? 'Soft block duration: 12-48 hours.' : 'Permanent suspensions do not expire.'}
                              className="min-h-9 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary disabled:opacity-60"
                            />
                            <textarea
                              value={restrictionDraft.reason}
                              onChange={(event) => setRestrictionDraft((current) => ({ ...current, reason: event.target.value }))}
                              placeholder="Restriction reason shown to rider and saved for admin audit"
                              className="min-h-20 resize-y rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary lg:col-span-2"
                            />
                          </div>
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            onClick={() => updateRiderOperationalState(false)}
                            title={adminActionDisabledReason("restrict") || "Apply this restriction through the backend."}
                            disabled={Boolean(adminActionDisabledReason("restrict"))}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                          >
                            <ShieldAlertIcon className="h-3.5 w-3.5" />
                            Apply Restriction
                          </button>
                          <button
                            onClick={() => updateRiderOperationalState(true)}
                            title={adminActionDisabledReason("reinstate") || "Reinstate this rider after the penalty window or review is complete."}
                            disabled={Boolean(adminActionDisabledReason("reinstate"))}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs font-semibold text-success disabled:opacity-50"
                          >
                            <ShieldCheckIcon className="h-3.5 w-3.5" />
                            Reinstate Rider
                          </button>
                          <button
                            onClick={unlockRiderAccount}
                            title={adminActionDisabledReason("unlock") || "Unlock this rider login after review."}
                            disabled={!selectedRider.account_locked || actionLoading === 'unlock'}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50 sm:col-span-2"
                          >
                            <LockOpenIcon className="h-3.5 w-3.5" />
                            Unlock Login
                          </button>
                        </div>
                      </div>
                      <div className={`sm:col-span-2 rounded-2xl border border-border bg-background/80 p-3 ${adminRiderView === "security" ? "" : "hidden"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                              <CreditCardIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground">Security Bond Management</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Register, approve, reject, and audit the required rider bond.</p>
                            </div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${bondConfig.classes}`}>
                            {bondConfig.label}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Required Bond</p>
                            <p className="mt-1 text-sm font-bold text-foreground">{formatCurrency(bondTargetAmount)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Registered Balance</p>
                            <p className={`mt-1 text-sm font-bold ${bondAmount >= bondTargetAmount ? "text-success" : "text-warning"}`}>{formatCurrency(bondAmount)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reference</p>
                            <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider.bond_reference || "-"}</p>
                          </div>
                        </div>

                        {selectedRider.bond_rejection_reason ? (
                          <div className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <span className="font-semibold">Last rejection:</span> {selectedRider.bond_rejection_reason}
                          </div>
                        ) : null}

                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Bond amount (UGX)
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={bondDraft.amount}
                              onChange={(event) => setBondDraft((current) => ({ ...current, amount: event.target.value }))}
                              className="mt-1 min-h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary"
                            />
                          </label>
                          <label className="text-xs font-semibold text-muted-foreground">
                            Payment/reference number
                            <input
                              type="text"
                              value={bondDraft.reference}
                              onChange={(event) => setBondDraft((current) => ({ ...current, reference: event.target.value }))}
                              placeholder="Receipt, cashbook, Mobile Money ref"
                              className="mt-1 min-h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                            />
                          </label>
                          <label className="text-xs font-semibold text-muted-foreground lg:col-span-2">
                            Admin note / rejection reason
                            <textarea
                              value={bondDraft.note}
                              onChange={(event) => setBondDraft((current) => ({ ...current, note: event.target.value }))}
                              placeholder="Record verification note, receipt check, or rejection reason."
                              className="mt-1 min-h-20 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                            />
                          </label>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <button
                            onClick={() => updateRiderBond("register")}
                            title={bondActionDisabledReason("register") || "Register this security bond for admin verification."}
                            disabled={Boolean(bondActionDisabledReason("register"))}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
                          >
                            Register Bond
                          </button>
                          <button
                            onClick={() => updateRiderBond("approve")}
                            title={bondActionDisabledReason("approve") || "Approve the verified rider security bond."}
                            disabled={Boolean(bondActionDisabledReason("approve"))}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs font-semibold text-success disabled:opacity-50"
                          >
                            Approve Bond
                          </button>
                          <button
                            onClick={() => updateRiderBond("reject")}
                            title={bondActionDisabledReason("reject") || "Reject this rider bond verification with the admin note."}
                            disabled={Boolean(bondActionDisabledReason("reject"))}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                          >
                            Reject Bond
                          </button>
                        </div>

                        <div className="mt-4 rounded-xl border border-border bg-card p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-foreground">Bond history</p>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{bondHistory.length} records</span>
                          </div>
                          {bondHistory.length === 0 ? (
                            <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">No security bond actions have been recorded yet.</p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {bondHistory.slice().reverse().slice(0, 6).map((entry, index) => (
                                <div key={`${entry.created_at || index}-${entry.action || "bond"}`} className="rounded-lg border border-border bg-background px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold capitalize text-foreground">{String(entry.action || "bond").replace(/_/g, " ")}</p>
                                    <p className="text-[10px] text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                                  </div>
                                  <p className="mt-1 text-xs font-semibold text-primary">{formatCurrency(entry.amount || 0)}</p>
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    {(entry.previous_status || "-")} to {(entry.next_status || "-")}
                                    {entry.actor_role ? ` | ${entry.actor_role}` : ""}
                                    {entry.reference ? ` | Ref ${entry.reference}` : ""}
                                  </p>
                                  {entry.note ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{entry.note}</p> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`sm:col-span-2 rounded-2xl border p-3 ${adminRiderView === "security" ? "" : "hidden"} ${deviceBindingStatus === "frozen" ? "border-destructive/30 bg-destructive/10" : "border-border bg-background/80"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${deviceBindingStatus === "frozen" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/10 text-primary"}`}>
                              {deviceBindingStatus === "frozen" ? <ShieldAlertIcon className="h-4 w-4" /> : <SmartphoneIcon className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground">Device Binding & Anti-Fraud</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Verified riders are locked to one trusted device.</p>
                            </div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            deviceBindingStatus === "frozen"
                              ? "border-destructive/20 bg-destructive/10 text-destructive"
                              : deviceBindingStatus === "bound"
                                ? "border-success/20 bg-success/10 text-success"
                                : "border-warning/20 bg-warning/10 text-warning"
                          }`}>
                            {deviceBindingStatus === "frozen" ? "Frozen" : deviceBindingStatus === "bound" ? "Bound" : "Unbound"}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Device</p>
                            <p className="mt-1 break-words text-xs font-semibold text-foreground">{deviceBinding?.device_label || "Not bound yet"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Platform</p>
                            <p className="mt-1 break-words text-xs font-semibold text-foreground">{deviceBinding?.platform || "-"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last seen</p>
                            <p className="mt-1 break-words text-xs font-semibold text-foreground">{deviceBinding?.last_seen_at ? formatDateTime(deviceBinding.last_seen_at) : "-"}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fingerprint</p>
                            <p className="mt-1 break-words font-mono text-xs font-semibold text-foreground">{deviceBinding?.device_id_fingerprint || "-"}</p>
                          </div>
                        </div>
                        {deviceBinding?.freeze_reason ? (
                          <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                            {deviceBinding.freeze_reason}
                          </p>
                        ) : null}
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <input
                            type="text"
                            value={deviceUnbindReason}
                            onChange={(event) => setDeviceUnbindReason(event.target.value)}
                            placeholder="Admin reason for device unbinding"
                            className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                          />
                          <button
                            onClick={unbindRiderDevice}
                            title={adminActionDisabledReason("device_unbind") || "Clear this rider device binding after admin verification."}
                            disabled={Boolean(adminActionDisabledReason("device_unbind"))}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
                          >
                            <LockOpenIcon className="h-3.5 w-3.5" />
                            Unbind Device
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className={`mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${adminRiderView === "overview" ? "" : "hidden"}`}>
                  <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10">
                          <SmartphoneIcon className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0">
                          <p>Authenticated rider</p>
                          <p className="mt-0.5 text-xs font-normal text-muted-foreground">Identity and compliance snapshot</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getKycConfig(selectedRider?.kyc_status).classes}`}>
                        {getKycConfig(selectedRider?.kyc_status).label}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-2 min-[1800px]:grid-cols-4">
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                        <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider?.phone ?? '—'}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vehicle</p>
                        <p className="mt-1 break-words text-sm font-semibold text-foreground">{vehicleLabel(selectedRider?.vehicle_type)}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">KYC</p>
                        <p className={`mt-1 text-sm font-semibold ${getKycConfig(selectedRider?.kyc_status).textClass}`}>
                          {getKycConfig(selectedRider?.kyc_status).label}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Plate</p>
                        <p className="mt-1 break-words text-sm font-semibold text-foreground">{selectedRider?.bike_plate ?? '—'}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Security Bond</p>
                        <p className={`mt-1 break-words text-sm font-semibold ${bondConfig.textClass}`}>{bondConfig.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatCurrency(bondAmount)} / {formatCurrency(bondTargetAmount)}</p>
                      </div>
                    </div>
                    <div className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-3 text-xs leading-relaxed ${riderCanReceiveAssignments ? 'border-success/20 bg-success/10 text-success' : 'border-warning/20 bg-warning/10 text-warning'}`}>
                      {riderCanReceiveAssignments ? <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span className="min-w-0">
                        {riderCanReceiveAssignments
                          ? 'Rider profile is operational and within COD balance limits.'
                          : overCodLimit
                            ? 'Operations are blocked until COD settlement brings the rider below the limit.'
                            : riderOperationBlockReason() || 'Operations are blocked until KYC is verified, legal agreements are accepted, the account is active, and login is unlocked.'}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10">
                          <LocateFixedIcon className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0">
                          <p>Status and GPS</p>
                          <p className="mt-0.5 text-xs font-normal text-muted-foreground">Availability, hub, and live location</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${gpsTrackingEnabled ? 'border-success/20 bg-success/10 text-success' : 'border-destructive/20 bg-destructive/10 text-destructive'}`}>
                        {gpsTrackingEnabled ? 'Tracking live' : 'GPS inactive'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-2 min-[1800px]:grid-cols-4">
                      {driverStatuses.map((item) => (
                        <button
                          key={item.value}
                          onClick={() => updateRiderStatus(item.value)}
                          title={riderStatusDisabledReason(item.value) || `Set rider status to ${item.label}.`}
                          disabled={actionLoading === 'status' || Boolean(riderStatusDisabledReason(item.value))}
                          className={`min-h-10 rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-colors ${
                            status === item.value ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
                          } disabled:opacity-50`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hub</p>
                        <p className="mt-1 break-words font-semibold leading-snug text-foreground">{selectedHubLabel}</p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">GPS proximity</p>
                        <p className="mt-1 break-words font-semibold leading-snug text-foreground">{proximityLabel}</p>
                        <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">{gpsLabel} | Updated {formatDateTime(selectedRider?.last_location_update)}</p>
                      </div>
                    </div>
                    <button
                      onClick={syncGpsLocation}
                      title={actionLoading === 'gps' ? 'GPS sync is already running.' : 'Sync rider GPS with the backend.'}
                      className={`mt-3 w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${
                        gpsTrackingEnabled ? 'border-success/20 bg-success/10 text-success' : 'border-destructive/20 bg-destructive/10 text-destructive'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {gpsTrackingEnabled ? <ShieldCheckIcon className="h-4 w-4 shrink-0" /> : <WifiOffIcon className="h-4 w-4 shrink-0" />}
                          <span className="min-w-0">{gpsTrackingEnabled ? 'GPS tracker active' : 'GPS tracker inactive'}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                          {actionLoading === 'gps' ? <LoaderGlyph size="xs" label="Syncing GPS" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
                          {gpsTrackingEnabled ? 'Tracking live' : 'Sync location'}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {adminRiderView === "overview" && gpsWarning ? (
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
                    <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">GPS is inactive or the rider is offline, so the alert banner stays on.</span>
                  </div>
                ) : null}
              </div>

              <div className={`grid gap-6 xl:grid-cols-2 ${adminRiderView === "orders" ? "" : "hidden"}`}>
                <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Delivery setup</p>
                      <h3 className="mt-2 text-lg font-bold text-foreground">Current required action</h3>
                    </div>
                    <span className="rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                      {selectedOrder?.assignment_response_status === 'pending' ? `Accept in ${orderCountdown}` : selectedOrder ? deliverySetupSteps[deliverySetupStep]?.label : 'No assignment'}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <WorkflowStepper steps={deliverySetupSteps} currentStep={deliverySetupStep} />
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Guided next step</p>
                      <p className="mt-2 text-sm leading-relaxed text-foreground">{deliverySetupGuidance}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-3xl p-5 shadow-custom">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Package tracker scan</p>
                      <h3 className="mt-2 text-lg font-bold text-foreground">Hub QR + tracker tag</h3>
                    </div>
                    <ScanLineIcon className="h-5 w-5 text-primary" />
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-border bg-background/70 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Building2Icon className="h-4 w-4 text-primary" />
                        Hub custody scan
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedOrder
                          ? 'This order is now linked to the backend tracker fields and status history.'
                          : 'Select an order to inspect tracker fields and delivery state.'}
                      </p>
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
                        <TagIcon className="h-4 w-4" />
                        Package ID: {selectedOrder?.package_tracking_id ?? '—'}
                      </div>
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                        <ScanLineIcon className="h-4 w-4 text-primary" />
                        Physical tag: {selectedOrder?.physical_tracker_id ?? 'Not linked'}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={trackerCode}
                          onChange={(event) => setTrackerCode(event.target.value.toUpperCase())}
                          placeholder="Physical tracker tag"
                          className="rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                        />
                        <button
                          onClick={linkPackageTracker}
                          title={orderActionDisabledReason("tracker_link") || "Link a physical tracker tag to this package."}
                          className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          disabled={!canLinkTracker || actionLoading === 'tracker-link'}
                        >
                          <LoadingButtonContent loading={actionLoading === 'tracker-link'} loadingLabel="Linking tracker" label="Link tracker" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background/70 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <MapPinnedIcon className="h-4 w-4 text-primary" />
                        Divergence alert
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Tracker GPS can be synced from the rider web session for testing; backend compares it against the rider GPS fix.
                      </p>
                      <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                        selectedOrder?.tracker_divergence_alert
                          ? 'border-destructive/20 bg-destructive/10 text-destructive'
                          : 'border-success/20 bg-success/10 text-success'
                      }`}>
                        Divergence: {selectedOrder?.tracker_divergence_alert ? `${selectedOrder.tracker_divergence_distance ?? 0}m` : 'Clear'}
                      </div>
                      <button
                        onClick={syncPackageTrackerLocation}
                        title={orderActionDisabledReason("tracker_gps") || "Sync this package tracker location with the backend."}
                        className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                        disabled={!selectedOrder || !isRiderAccount || !riderCanOperate || actionLoading === 'tracker-gps'}
                      >
                        <LoadingButtonContent loading={actionLoading === 'tracker-gps'} loadingLabel="Syncing tracker GPS" label="Sync tracker GPS" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`grid gap-6 xl:grid-cols-2 ${["orders", "finance"].includes(adminRiderView) ? "" : "hidden"}`}>
                <div className={`bg-card border border-border rounded-3xl p-5 shadow-custom ${adminRiderView === "finance" ? "" : "hidden"}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CreditCardIcon className="h-4 w-4 text-primary" />
                    Earnings and payments
                  </div>
                  <div className="mt-4 space-y-3">
                    {earningsBreakdown.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border bg-background/70 px-4 py-3">
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <span className="text-sm font-semibold text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${overCodLimit ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'border-success/20 bg-success/10 text-success'}`}>
                    {overCodLimit
                      ? `COD balance is at or above the ${formatCurrency(codOperationLimit)} operational limit. New assignments and withdrawals are blocked by backend rules.`
                      : `COD balance is below the ${formatCurrency(codOperationLimit)} operational limit.`}
                  </div>

                  {isRiderAccount ? (
                    <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Withdrawal request</p>
                          <p className="mt-1 text-sm text-muted-foreground">Request payout from the current pending rider balance.</p>
                        </div>
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                          {activeWithdrawal ? activeWithdrawal.status : 'Ready'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <input
                          value={withdrawalDraft.amount}
                          onChange={(event) => setWithdrawalDraft((current) => ({ ...current, amount: event.target.value.replace(/[^\d.]/g, '') }))}
                          placeholder="Amount"
                          inputMode="decimal"
                          className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none"
                        />
                        <input
                          value={withdrawalDraft.account_phone}
                          onChange={(event) => setWithdrawalDraft((current) => ({ ...current, account_phone: event.target.value }))}
                          placeholder="Mobile money phone"
                          className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none"
                        />
                      </div>
                      <textarea
                        value={withdrawalDraft.note}
                        onChange={(event) => setWithdrawalDraft((current) => ({ ...current, note: event.target.value }))}
                        rows={2}
                        placeholder="Optional note"
                        className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none resize-none"
                      />
                      <button
                        onClick={requestWithdrawal}
                        title={withdrawalDisabledReason() || "Submit this rider withdrawal request to the backend."}
                        disabled={!canRequestWithdrawal || actionLoading === 'withdrawal-request'}
                        className="mt-3 w-full rounded-xl bg-primary px-3 py-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <LoadingButtonContent loading={actionLoading === 'withdrawal-request'} loadingLabel="Submitting request" label="Request withdrawal" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">COD settlement</p>
                          <p className="mt-1 text-sm text-muted-foreground">Record cash/COD handover and reduce rider operational balance.</p>
                        </div>
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                          {formatCurrency(codCarried)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          value={codSettlementDraft.amount}
                          onChange={(event) => setCodSettlementDraft((current) => ({ ...current, amount: event.target.value.replace(/[^\d.]/g, '') }))}
                          placeholder="COD amount"
                          inputMode="decimal"
                          className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none"
                        />
                        <button
                          onClick={recordCodSettlement}
                          title={adminActionDisabledReason("cod") || "Record this COD settlement and reduce rider carried COD."}
                          disabled={!selectedRider || codCarried <= 0 || actionLoading === 'cod-settlement'}
                          className="rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {actionLoading === 'cod-settlement' ? 'Recording...' : 'Record COD'}
                        </button>
                      </div>
                      <input
                        value={codSettlementDraft.note}
                        onChange={(event) => setCodSettlementDraft((current) => ({ ...current, note: event.target.value }))}
                        placeholder="Settlement note"
                        className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none"
                      />
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Payout status history</p>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{settlements.length} records</span>
                    </div>
                    {!isRiderAccount ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input
                          value={settlementActionDraft.admin_note}
                          onChange={(event) => setSettlementActionDraft((current) => ({ ...current, admin_note: event.target.value }))}
                          placeholder="Admin note / rejection reason"
                          className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none"
                        />
                        <input
                          value={settlementActionDraft.completion_reference}
                          onChange={(event) => setSettlementActionDraft((current) => ({ ...current, completion_reference: event.target.value.toUpperCase() }))}
                          placeholder="Completion reference"
                          className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-foreground outline-none"
                        />
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {settlements.length === 0 ? (
                        <p className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                          No withdrawal or COD settlement records yet.
                        </p>
                      ) : null}
                      {settlements.slice(0, 6).map((settlement) => (
                        <div key={settlement.id} className="rounded-xl border border-border bg-card px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground">{settlement.reference}</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                {settlement.type === 'withdrawal' ? 'Withdrawal' : 'COD settlement'} | {formatDateTime(settlement.createdAt)}
                              </p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                              settlement.status === 'completed'
                                ? 'border-success/20 bg-success/10 text-success'
                                : settlement.status === 'rejected'
                                  ? 'border-destructive/20 bg-destructive/10 text-destructive'
                                  : 'border-warning/20 bg-warning/10 text-warning'
                            }`}>
                              {settlement.status}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-lg bg-muted px-3 py-2">
                              <p className="text-muted-foreground">Amount</p>
                              <p className="font-semibold text-foreground">{formatCurrency(settlement.amount)}</p>
                            </div>
                            <div className="rounded-lg bg-muted px-3 py-2">
                              <p className="text-muted-foreground">Method</p>
                              <p className="font-semibold text-foreground">{settlement.method || '—'}</p>
                            </div>
                          </div>
                          {settlement.rejection_reason || settlement.admin_note || settlement.completion_reference ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {settlement.rejection_reason || settlement.admin_note || settlement.completion_reference}
                            </p>
                          ) : null}
                          {settlement.status_history?.length ? (
                            <div className="mt-2 space-y-1 border-t border-border pt-2">
                              {settlement.status_history.slice(-3).map((entry, index) => (
                                <p key={`${settlement.id}-${entry.status}-${index}`} className="text-[10px] text-muted-foreground">
                                  {entry.status} by {entry.actor_role || 'system'} at {formatDateTime(entry.created_at)}
                                  {entry.note ? ` - ${entry.note}` : ''}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          {!isRiderAccount && settlement.type === 'withdrawal' && ['requested', 'approved'].includes(settlement.status) ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <button
                                onClick={() => updateSettlementStatus(settlement, 'approved')}
                                title={settlementActionDisabledReason(settlement, 'approved') || "Approve this withdrawal request."}
                                disabled={Boolean(settlementActionDisabledReason(settlement, 'approved'))}
                                className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => updateSettlementStatus(settlement, 'completed')}
                                title={settlementActionDisabledReason(settlement, 'completed') || "Mark this approved withdrawal as completed."}
                                disabled={Boolean(settlementActionDisabledReason(settlement, 'completed'))}
                                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => updateSettlementStatus(settlement, 'rejected')}
                                title={settlementActionDisabledReason(settlement, 'rejected') || "Reject this withdrawal request with the admin note."}
                                disabled={Boolean(settlementActionDisabledReason(settlement, 'rejected'))}
                                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`bg-card border border-border rounded-3xl p-5 shadow-custom ${adminRiderView === "orders" ? "" : "hidden"}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clock3Icon className="h-4 w-4 text-primary" />
                    Active orders
                  </div>
                  <div className="mt-4 space-y-3">
                    {detailLoading ? (
                      <AppLoader
                        variant="inline"
                        label="Loading rider orders"
                        subtitle="Fetching assigned orders and rider data."
                      />
                    ) : null}
                    {!detailLoading && activeOrders.length === 0 ? (
                      <GuidedEmptyState
                        icon={NavigationIcon}
                        title="No active assigned orders"
                        description="Refresh after admin assigns a pending order. If you are using demo data, seed it again and accept the assignment before its timer expires."
                      />
                    ) : null}
                    {activeOrders.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                          selectedOrder?.id === order.id ? 'border-primary bg-primary/5' : 'border-border bg-background/70 hover:border-primary/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{order.order_id}</p>
                            <p className="break-words text-xs text-muted-foreground">{order.customer_name} - {order.delivery_address}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                            {order.delivery_zone}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4 text-xs">
                          <div className="rounded-xl bg-muted px-3 py-2">
                            <p className="text-muted-foreground">Value</p>
                            <p className="font-semibold text-foreground">{formatCurrency(order.declared_value)}</p>
                          </div>
                          <div className="rounded-xl bg-muted px-3 py-2">
                            <p className="text-muted-foreground">COD</p>
                            <p className="font-semibold text-foreground">{formatCurrency(order.cod_amount)}</p>
                          </div>
                          <div className="rounded-xl bg-primary/10 px-3 py-2">
                            <p className="text-primary">Fee</p>
                            <p className="font-semibold text-primary">{formatCurrency(order.delivery_fee)}</p>
                          </div>
                          <div className="rounded-xl bg-muted px-3 py-2">
                            <p className="text-muted-foreground">Tracker</p>
                            <p className="break-all font-semibold text-foreground">{order.physical_tracker_id || order.package_tracking_id || '—'}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <aside className={`min-w-0 space-y-6 ${["orders", "support"].includes(adminRiderView) ? "" : "hidden"}`}>
              <div className={`bg-card border border-border rounded-3xl p-5 shadow-custom ${adminRiderView === "orders" ? "" : "hidden"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Order actions</p>
                    <h3 className="mt-2 text-lg font-bold text-foreground">Customer proof and delivery tools</h3>
                  </div>
                  <PhoneCallIcon className="h-5 w-5 text-primary" />
                </div>

                <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4 space-y-3">
                  {!selectedOrder ? (
                    <GuidedEmptyState
                      icon={TruckIcon}
                      title="No assigned order selected"
                      description="Ask admin to assign this rider a pending order, or pick an active assignment from the list before using delivery actions."
                    />
                  ) : null}

                  <div className="rounded-xl border border-border bg-card p-3" title={deliverySetupGuidance}>
                    <WorkflowStepper steps={deliverySetupSteps} currentStep={deliverySetupStep} />
                    <p className="mt-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
                      {deliverySetupGuidance}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{selectedOrder?.customer_name ?? 'No order selected'}</p>
                      <p className="break-words text-xs text-muted-foreground">{selectedOrder?.customer_phone ?? '—'}</p>
                    </div>
                    {selectedOrder?.customer_phone ? (
                      <a
                        href={`tel:${selectedOrder.customer_phone}`}
                        title="Call this customer."
                        className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        Call customer
                      </a>
                    ) : (
                      <button title="Customer phone is missing on this order." className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary" disabled>
                        Call customer
                      </button>
                    )}
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Package value</p>
                      <p className="font-semibold text-foreground">{formatCurrency(selectedOrder?.declared_value)}</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 px-3 py-2">
                      <p className="text-primary">Delivery fee</p>
                      <p className="font-semibold text-primary">{formatCurrency(selectedOrder?.delivery_fee)}</p>
                    </div>
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Distance</p>
                      <p className="font-semibold text-foreground">{selectedOrder?.pricing_distance_km !== null && selectedOrder?.pricing_distance_km !== undefined ? `${selectedOrder.pricing_distance_km.toFixed(2)} KM` : 'Unavailable'}</p>
                    </div>
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Service</p>
                      <p className="font-semibold text-foreground">{selectedOrder?.service_level === 'express' ? 'Express 1-hour request' : 'Standard'}</p>
                    </div>
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Tracker</p>
                      <p className="break-all font-semibold text-foreground">{selectedOrder?.physical_tracker_id || selectedOrder?.package_tracking_id || '—'}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Assignment</p>
                      <p className="font-semibold text-foreground">{selectedOrder?.assignment_response_status ?? 'unassigned'}</p>
                    </div>
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Handover</p>
                      <p className={`font-semibold ${selectedOrder?.handover_verified ? 'text-success' : 'text-warning'}`}>
                        {selectedOrder?.handover_verified ? 'Verified' : 'Waiting merchant'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Hub scan-in</p>
                      <p className={`font-semibold ${selectedOrder?.hub_scan_in ? 'text-success' : 'text-warning'}`}>
                        {selectedOrder?.hub_scan_in ? new Date(selectedOrder.hub_scan_in).toLocaleString() : 'Required'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Testing OTP</p>
                      <p className="font-semibold text-foreground">{selectedOrder?.dev_otp_code ?? 'Hidden'}</p>
                    </div>
                  </div>

                  <label className="block rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                    <span className="mb-2 block font-semibold text-foreground">Proof photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                      className="block w-full min-w-0 text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    {proofFile ? <span className="mt-2 block break-all">{proofFile.name}</span> : null}
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={acceptOrderAssignment}
                      title={orderActionDisabledReason("accept") || "Accept this pending rider assignment."}
                      className="rounded-xl bg-success px-3 py-3 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!selectedOrder || !canAcceptOrder || actionLoading === 'assignment-accept'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'assignment-accept'} loadingLabel="Accepting" label="Accept" />
                    </button>
                    <button
                      onClick={rejectOrderAssignment}
                      title={orderActionDisabledReason("reject") || "Reject this pending rider assignment."}
                      className="rounded-xl bg-destructive px-3 py-3 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!selectedOrder || !canRejectAssignment || actionLoading === 'assignment-reject'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'assignment-reject'} loadingLabel="Rejecting" label="Reject" />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={confirmPickupCustody}
                      title={orderActionDisabledReason("pickup") || "Confirm pickup after merchant handover is verified."}
                      className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50"
                      disabled={!selectedOrder || !canConfirmPickup || actionLoading === 'order-picked_up'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'order-picked_up'} loadingLabel="Confirming pickup" label="Confirm Pickup" />
                    </button>
                    <button
                      onClick={() => updateOrderStatus('at_hub')}
                      title={orderActionDisabledReason("at_hub")}
                      className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50"
                      disabled={!selectedOrder || !canMarkAtHub || actionLoading === 'order-at_hub'}
                    >
                      Hub Scan Required
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => updateOrderStatus('out_for_delivery')}
                      title={orderActionDisabledReason("start_delivery") || "Start delivery after hub scan-in is complete."}
                      className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50"
                      disabled={!selectedOrder || !canStartDelivery || actionLoading === 'order-out_for_delivery'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'order-out_for_delivery'} loadingLabel="Starting delivery" label="Start Delivery" />
                    </button>
                    <button
                      onClick={markOrderFailed}
                      title={orderActionDisabledReason("failed") || "Mark failed with proof when the customer is unavailable or delivery cannot be completed."}
                      className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-xs font-semibold text-destructive disabled:opacity-50"
                      disabled={!selectedOrder || !canMarkFailed || actionLoading === 'order-failed'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'order-failed'} loadingLabel="Marking failed" label="Failed Delivery" />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {buildOrderMapUrl(selectedOrder, selectedRider?.vehicle_type) ? (
                      <a
                        href={buildOrderMapUrl(selectedOrder, selectedRider?.vehicle_type) || undefined}
                        title="Open this delivery route in OpenStreetMap."
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground text-center"
                      >
                        Open map
                      </a>
                    ) : (
                      <button
                        title="Delivery address is missing, so map navigation cannot open."
                        className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground opacity-50"
                        disabled
                      >
                        Open map
                      </button>
                    )}
                    <button
                      onClick={() => updateOrderStatus('delivered')}
                      title={orderActionDisabledReason("delivered") || "Verify customer OTP and complete delivery."}
                      className="rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground disabled:opacity-50"
                      disabled={!selectedOrder || !canMarkDelivered || actionLoading === 'order-delivered'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'order-delivered'} loadingLabel="Verifying OTP" label="Mark via OTP" />
                    </button>
                  </div>

                  <button
                    onClick={returnOrderToMerchant}
                    title={orderActionDisabledReason("return") || "Return this order to merchant."}
                    className="w-full rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-xs font-semibold text-warning disabled:opacity-50"
                    disabled={!selectedOrder || !canReturnOrder || actionLoading === 'order-returned'}
                  >
                    <LoadingButtonContent loading={actionLoading === 'order-returned'} loadingLabel="Returning order" label="Return to Merchant" />
                  </button>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={otpValue}
                      onChange={(event) => setOtpValue(event.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="4-digit OTP"
                      inputMode="numeric"
                      maxLength={4}
                      className="rounded-xl border border-border bg-background/80 px-3 py-3 text-xs text-foreground outline-none"
                    />
                    <button
                      onClick={() => updateOrderStatus('delivered')}
                      title={orderActionDisabledReason("delivered") || "Verify customer OTP and complete delivery."}
                      className="rounded-xl bg-primary px-3 py-3 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!selectedOrder || !canMarkDelivered || actionLoading === 'order-delivered'}
                    >
                      <LoadingButtonContent loading={actionLoading === 'order-delivered'} loadingLabel="Verifying OTP" label="Verify OTP" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
                    If the customer is unavailable, use reject or failed delivery and attach an incident note below.
                  </div>
                </div>
              </div>

              <div className={`bg-card border border-border rounded-3xl p-5 shadow-custom ${adminRiderView === "orders" ? "" : "hidden"}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CameraIcon className="h-4 w-4 text-primary" />
                  Incident reporting
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Report accident, theft, mechanical failure, or police stop. Rider sessions can push this directly to the backend.</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {incidentTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setIncidentType(type.value)}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        incidentType === type.value ? 'border-destructive bg-destructive text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  <textarea
                    value={incidentDescription}
                    onChange={(event) => setIncidentDescription(event.target.value)}
                    rows={4}
                    placeholder="Describe what happened, where it happened, and what support is needed."
                    className="w-full rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm text-foreground outline-none resize-none"
                  />

                  <button
                    onClick={submitIncident}
                    title={actionLoading === 'incident' ? "Incident report is already being submitted." : "Submit this incident report to the backend."}
                    className="flex w-full items-center justify-between rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm font-medium text-foreground disabled:opacity-50"
                    disabled={actionLoading === 'incident'}
                  >
                    <span className="inline-flex items-center gap-2">
                      <LoadingButtonContent loading={actionLoading === 'incident'} loadingLabel="Reporting incident" label="Report incident" icon={<AlertTriangleIcon className="h-4 w-4 text-warning" />} />
                    </span>
                    <TimerResetIcon className="h-4 w-4 text-muted-foreground" />
                  </button>

                </div>
              </div>

              <div className={adminRiderView === "support" ? "" : "hidden"}>
                <SupportPanel compact title="Driver support" />
              </div>

              <div className={`bg-card border border-border rounded-3xl p-5 shadow-custom ${adminRiderView === "support" ? "" : "hidden"}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TruckIcon className="h-4 w-4 text-primary" />
                  Live rider snapshot
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Status updates are now sent to <span className="font-medium text-foreground">/auth/riders</span></li>
                  <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Order actions use <span className="font-medium text-foreground">/auth/orders</span> and backend OTP verification</li>
                  <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Active orders are filtered from the real assigned order list</li>
                  <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Earnings cards use the backend summary payload</li>
                  <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" /> Incidents are persisted when the rider account is active</li>
                </ul>

                {incidents.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Recent incidents</p>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{openIncidents.length} open</span>
                    </div>
                    {!isRiderAccount ? (
                      <textarea
                        value={incidentAdminNote}
                        onChange={(event) => setIncidentAdminNote(event.target.value)}
                        rows={3}
                        placeholder="Admin escalation / resolution note"
                        className="mt-3 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                      />
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {incidents.map((incident, index) => (
                        <div key={`${incident.type}-${index}`} className="rounded-xl border border-border bg-card px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-foreground uppercase">{incident.type}</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                incident.priority === 'critical'
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : incident.priority === 'high'
                                    ? 'border-warning/30 bg-warning/10 text-warning'
                                    : 'border-border bg-muted text-muted-foreground'
                              }`}>
                                {incident.priority ?? 'normal'}
                              </span>
                              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{incident.status ?? 'open'}</span>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{incident.description}</p>
                          {incident.location ? <p className="mt-1 text-[10px] text-muted-foreground">Location: {incident.location}</p> : null}
                          <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(incident.reported_at)}</p>
                          {incident.resolution ? <p className="mt-1 rounded-lg bg-muted px-2 py-1 text-[10px] text-muted-foreground">Admin note: {incident.resolution}</p> : null}
                          {!isRiderAccount && incident.status !== 'closed' ? (
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              {(incident.status === 'resolved'
                                ? [{ status: 'closed' as const, label: 'Close' }]
                                : [
                                  { status: 'investigating' as const, label: 'Investigate' },
                                  { status: 'escalated' as const, label: 'Escalate' },
                                  { status: 'resolved' as const, label: 'Resolve' },
                                ]).map((action) => {
                                const actionKey = `incident-${incident.id || incident._id || index}-${action.status}`;
                                return (
                                  <button
                                    key={action.status}
                                    type="button"
                                    onClick={() => updateIncidentWorkflow(incident, action.status, index)}
                                    disabled={actionLoading === actionKey}
                                    title={incidentAdminNote.trim().length < 3 ? 'Add an admin note before updating this incident.' : `Mark incident as ${action.status}.`}
                                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/30 disabled:opacity-50"
                                  >
                                    <LoadingButtonContent loading={actionLoading === actionKey} loadingLabel={action.label} label={action.label} />
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs text-muted-foreground">
                    No rider incident reports have been submitted yet.
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
