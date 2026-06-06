import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LoaderGlyph, LoadingButtonContent } from "../components/AppLoader";
import { OrdersDispatchSkeleton } from "../components/DashboardSkeletons";
import Header from "../components/Header";
import { CustomSelect } from "../components/ui/custom-select";
import { Skeleton } from "../components/ui/skeleton";
import GuidedEmptyState from "../components/GuidedEmptyState";
import WorkflowStepper from "../components/WorkflowStepper";
import api from "../lib/api";
import { connectRealtimeSocket } from "../lib/realtime";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  MapPinIcon,
  PackageIcon,
  TruckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  QrCodeIcon,
  PrinterIcon,
  RefreshCwIcon,
  ScanBarcodeIcon,
  UserIcon,
  DownloadIcon,
} from "lucide-react";

type OrderStatus = "pending" | "picked_up" | "at_hub" | "out_for_delivery" | "delivered" | "failed" | "returned";
type PackageSize = "small" | "medium" | "large" | "oversized";
type VehicleType = "moto" | "voiture" | "velo";

type MerchantRef = {
  id?: string;
  _id?: string;
  merchant_name?: string;
  shop_name?: string;
  phone?: string;
};

type RiderRef = {
  id?: string;
  _id?: string;
  full_name?: string;
  phone?: string;
};

type OrderRecord = {
  id: string;
  order_id: string;
  merchant_id: string | MerchantRef;
  rider_id: string | RiderRef | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  item_description: string;
  declared_value: number;
  package_size?: PackageSize;
  order_status: OrderStatus;
  pickup_key?: string;
  package_tracking_id: string;
  physical_tracker_id?: string | null;
  rider_tracking_id: string;
  hub_id?: string | { id?: string; _id?: string } | null;
  delivery_zone: string;
  delivery_fee: number;
  pricing_currency?: string;
  pricing_distance_km?: number | null;
  pricing_source?: string | null;
  pricing_tier_label?: string | null;
  service_level?: "standard" | "express";
  express_requested?: boolean;
  batch_id?: string | null;
  pickup_coordinates?: { type?: string; coordinates?: [number, number] } | null;
  dropoff_coordinates?: { type?: string; coordinates?: [number, number] } | null;
  cod_amount: number;
  assignment_response_status?: "pending" | "accepted" | "rejected" | "expired" | null;
  assignment_response_due_at?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
  handover_verified?: boolean;
  hub_scan_in?: string | null;
  failed_reason?: string | null;
  return_reason?: string | null;
  return_fee?: number | null;
  return_fee_currency?: string | null;
  return_fee_rule?: string | null;
  return_fee_recorded_at?: string | null;
  delivery_proof_upload_id?: string | null;
  return_proof_upload_id?: string | null;
  status_history?: Array<{ status: string; note?: string | null; updated_at?: string; updated_by_role?: string }>;
  activity_logs?: Array<{ action: string; note?: string | null; created_at?: string; actor_role?: string }>;
  manual_otp_override?: boolean;
  manual_otp_override_reason?: string | null;
  manual_otp_override_at?: string | null;
  assigned_at?: string;
  createdAt?: string;
  qr_code?: string;
  dev_otp_code?: string | null;
};

type MerchantRecord = {
  id: string;
  merchant_name: string;
  shop_name: string;
  phone: string;
  email: string;
  address?: string;
  hub_id?: string | { id?: string; _id?: string } | null;
  status?: string;
  kyc_status?: string;
  policy_acceptances?: Array<{ key?: string }>;
};

type RiderRecord = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  current_status: string;
  vehicle_type?: VehicleType | null;
  hub_id?: string;
};

type CreateOrderForm = {
  merchant_id: string;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  delivery_address: string;
  pickup_latitude: string;
  pickup_longitude: string;
  dropoff_latitude: string;
  dropoff_longitude: string;
  delivery_zone: string;
  batch_id: string;
  item_description: string;
  package_size: PackageSize;
  service_level: "standard" | "express";
  dispatch_mode: "create_only" | "auto_assign";
  declared_value: string;
  cod_amount: string;
};

type PricingEstimate = {
  delivery_fee: number;
  pricing_currency?: string;
  pricing_distance_km: number;
  pricing_source?: string;
  pricing_tier_label?: string;
  service_level?: "standard" | "express";
  express_requested?: boolean;
};

type MobileOrderTab = "summary" | "workflow" | "dispatch" | "history";

const statusFilters: { label: string; value: "all" | OrderStatus }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Picked Up", value: "picked_up" },
  { label: "At Hub", value: "at_hub" },
  { label: "Out for Delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Failed", value: "failed" },
  { label: "Returned", value: "returned" },
];

const statusConfig: Record<OrderStatus, { label: string; classes: string; icon: React.ElementType }> = {
  pending: { label: "Pending", classes: "text-muted-foreground bg-muted border-border", icon: ClockIcon },
  picked_up: { label: "Picked Up", classes: "text-chart-2 bg-chart-2/10 border-chart-2/20", icon: PackageIcon },
  at_hub: { label: "At Hub", classes: "text-warning bg-warning/10 border-warning/20", icon: PackageIcon },
  out_for_delivery: { label: "Out for Delivery", classes: "text-primary bg-primary/10 border-primary/20", icon: TruckIcon },
  delivered: { label: "Delivered", classes: "text-success bg-success/10 border-success/20", icon: CheckCircleIcon },
  failed: { label: "Failed", classes: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircleIcon },
  returned: { label: "Returned", classes: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircleIcon },
};

const zones = ["All Zones", "CBD", "Kawempe", "Ntinda", "Makindye", "Nakawa", "Rubaga"];

const packageSizeOptions: Array<{ label: string; value: PackageSize }> = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Oversized", value: "oversized" },
];

const createOrderSteps = [
  { label: "Merchant", helper: "Who sends it." },
  { label: "Customer", helper: "Receiver details." },
  { label: "Package", helper: "Size and zone." },
  { label: "Payment", helper: "COD and auto fee." },
  { label: "Dispatch", helper: "Manual or auto." },
];

const mobileOrderTabs: Array<{ id: MobileOrderTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "workflow", label: "Workflow" },
  { id: "dispatch", label: "Dispatch" },
  { id: "history", label: "History" },
];

const vehicleLabels: Record<VehicleType, string> = {
  moto: "Moto",
  voiture: "Voiture",
  velo: "Velo",
};

const compatibleVehiclesBySize: Record<PackageSize, VehicleType[]> = {
  small: ["velo", "moto", "voiture"],
  medium: ["moto", "voiture"],
  large: ["voiture"],
  oversized: ["voiture"],
};

const requiredMerchantPolicyKeys = [
  "merchant_shop_partnership_agreement",
  "merchant_delivery_policy_agreement",
  "merchant_insurance_policy",
];

const emptyForm = (): CreateOrderForm => ({
  merchant_id: "",
  customer_name: "",
  customer_phone: "",
  pickup_address: "",
  delivery_address: "",
  pickup_latitude: "",
  pickup_longitude: "",
  dropoff_latitude: "",
  dropoff_longitude: "",
  delivery_zone: "",
  batch_id: "",
  item_description: "",
  package_size: "medium",
  service_level: "standard",
  dispatch_mode: "create_only",
  declared_value: "0",
  cod_amount: "0",
});

const formatUGX = (value: number | undefined | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US").format(Math.round(value));
};

const readId = (value: string | { id?: string; _id?: string; value?: string } | null | undefined) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || value._id || value.value || null;
};

const hqDashboardRoles = ["super_admin", "director", "general_manager"];

const hasAllHubAccess = (role?: string | null) => hqDashboardRoles.includes(role || "");

const assignedHubIdsFor = (user?: any) => {
  const ids = [
    readId(user?.hub_id),
    ...(Array.isArray(user?.assigned_hub_ids) ? user.assigned_hub_ids.map(readId) : []),
  ].filter(Boolean) as string[];

  return [...new Set(ids)];
};

const canAccessHub = (user: any, hubId?: string | null) => {
  if (!user?.role || !hubId) return true;
  if (hasAllHubAccess(user.role)) return true;
  return assignedHubIdsFor(user).includes(hubId);
};

const merchantReadinessIssue = (merchant?: MerchantRecord | null, user?: any) => {
  if (!merchant) return null;

  if (merchant.status && merchant.status !== "active") {
    return "Merchant account must be active before creating orders.";
  }

  if (merchant.kyc_status && merchant.kyc_status !== "verified") {
    return "Merchant KYC must be verified before creating orders.";
  }

  if (Array.isArray(merchant.policy_acceptances)) {
    const acceptedKeys = new Set(merchant.policy_acceptances.map((acceptance) => acceptance.key).filter(Boolean));
    const missingPolicies = requiredMerchantPolicyKeys.filter((policyKey) => !acceptedKeys.has(policyKey));
    if (missingPolicies.length > 0) {
      return `Merchant legal agreements must be accepted before creating orders: ${missingPolicies.join(", ")}.`;
    }
  }

  const merchantHubId = readId(merchant.hub_id);
  if (user?.role && merchantHubId && !canAccessHub(user, merchantHubId)) {
    return "Merchant belongs to another hub. Staff users can only create orders inside their permitted hub scope.";
  }

  return null;
};

const readMerchantName = (merchant: OrderRecord["merchant_id"]) => {
  if (!merchant) return "Unassigned";
  if (typeof merchant === "string") return merchant;
  return merchant.shop_name || merchant.merchant_name || "Merchant";
};

const readRiderName = (rider: OrderRecord["rider_id"]) => {
  if (!rider) return "Unassigned";
  if (typeof rider === "string") return rider;
  return rider.full_name || "Rider";
};

const readRiderPhone = (rider: OrderRecord["rider_id"]) => {
  if (!rider || typeof rider === "string") return "—";
  return rider.phone || "—";
};

const packageSizeLabel = (value?: string | null) => (
  packageSizeOptions.find((item) => item.value === value)?.label || "Medium"
);

const normalizeQrImageSource = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^(data:image\/|https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/png;base64,${trimmed.replace(/\s/g, "")}`;
  }
  return trimmed;
};

const isRiderCompatibleWithOrder = (rider: RiderRecord, order?: OrderRecord | null) => {
  const packageSize = order?.package_size || "medium";
  return Boolean(rider.vehicle_type && compatibleVehiclesBySize[packageSize].includes(rider.vehicle_type));
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

const extractRealtimeOrders = (payload: any): OrderRecord[] => {
  if (Array.isArray(payload?.orders)) {
    return payload.orders;
  }

  if (payload?.order) {
    return [payload.order];
  }

  return payload?.id ? [payload] : [];
};

export default function Orders() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [riders, setRiders] = useState<RiderRecord[]>([]);
  const [selectedZone, setSelectedZone] = useState("All Zones");
  const [selectedStatus, setSelectedStatus] = useState<(typeof statusFilters)[number]["value"]>("all");
  const [selectedMerchantFilter, setSelectedMerchantFilter] = useState("all");
  const [selectedRiderFilter, setSelectedRiderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [qrPreviewOrder, setQrPreviewOrder] = useState<OrderRecord | null>(null);
  const [mobileOrderTab, setMobileOrderTab] = useState<MobileOrderTab>("summary");
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateOrderForm>(emptyForm());
  const [pricingEstimate, setPricingEstimate] = useState<PricingEstimate | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [addressLookupLoading, setAddressLookupLoading] = useState<"pickup" | "dropoff" | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [manualRiderId, setManualRiderId] = useState("");
  const [hubScanCode, setHubScanCode] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [issueNote, setIssueNote] = useState("");
  const [manualOtpReason, setManualOtpReason] = useState("");

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : orders[0] ?? null),
    [orders, selectedOrderId]
  );
  const selectedCreateMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === createForm.merchant_id) ?? null,
    [createForm.merchant_id, merchants]
  );
  const selectedCreateMerchantIssue = merchantReadinessIssue(selectedCreateMerchant, user);
  const selectOrder = (orderId: string, tab: MobileOrderTab = "summary") => {
    setSelectedOrderId(orderId);
    setMobileOrderTab(tab);
  };
  const canUseManualOtpOverride = hasAllHubAccess(user?.role) || user?.role === "hub_manager";
  const manualOtpReady = Boolean(
    selectedOrder
    && canUseManualOtpOverride
    && selectedOrder.order_status === "out_for_delivery"
    && selectedOrder.handover_verified
    && selectedOrder.hub_scan_in
    && manualOtpReason.trim().length >= 5
    && proofFile
  );
  const hubScanDisabledReason = () => {
    if (!selectedOrder) return "Select an order before confirming hub scan-in.";
    if (actionLoading === `hub-scan-${selectedOrder.id}`) return "Hub scan-in is already being recorded.";
    if (selectedOrder.hub_scan_in) return "This order has already been scanned into the hub.";
    if (selectedOrder.order_status !== "picked_up") return "Hub scan-in is available only after pickup.";
    if (!selectedOrder.handover_verified) return "Merchant handover must be verified before hub scan-in.";
    return undefined;
  };
  const manualOtpDisabledReason = () => {
    if (!selectedOrder) return "Select an order before applying a manual OTP override.";
    if (!canUseManualOtpOverride) return "Only HQ admins and hub managers can apply a manual OTP override.";
    if (actionLoading === `manual-otp-${selectedOrder.id}`) return "Manual OTP override is already being applied.";
    if (selectedOrder.order_status !== "out_for_delivery") return "Manual OTP override is allowed only while the order is out for delivery.";
    if (!selectedOrder.handover_verified) return "Merchant handover must be verified before manual OTP override.";
    if (!selectedOrder.hub_scan_in) return "Hub scan-in must be complete before manual OTP override.";
    if (!proofFile) return "Attach a proof photo before applying a manual OTP override.";
    if (manualOtpReason.trim().length < 5) return "Enter an audit reason of at least 5 characters.";
    return undefined;
  };
  const autoAssignDisabledReason = () => {
    if (!selectedOrder) return "Select an order before auto-assigning a rider.";
    if (actionLoading === `assign-auto-${selectedOrder.id}`) return "Auto-assignment is already running.";
    if (selectedOrder.order_status !== "pending") return "Rider assignment is available only while the order is pending before pickup.";
    return undefined;
  };
  const manualAssignDisabledReason = () => {
    if (!selectedOrder) return "Select an order before applying manual assignment.";
    if (actionLoading === `assign-manual-${selectedOrder.id}`) return "Manual assignment is already being applied.";
    if (selectedOrder.order_status !== "pending") return "Manual rider assignment is available only while the order is pending before pickup.";
    if (!manualRiderId) return "Choose a compatible rider before applying manual assignment.";
    const rider = riders.find((item) => item.user_id === manualRiderId);
    if (rider && !isRiderCompatibleWithOrder(rider, selectedOrder)) return "Selected rider vehicle is not compatible with this package size.";
    return undefined;
  };
  const dispatchDisabledReason = () => {
    if (!selectedOrder) return "Select an order before dispatching it.";
    if (actionLoading === `status-${selectedOrder.id}-out_for_delivery`) return "Dispatch update is already being saved.";
    if (selectedOrder.order_status !== "at_hub") return "Order must be at hub before dispatch.";
    if (!selectedOrder.handover_verified) return "Merchant handover must be verified before dispatch.";
    if (!selectedOrder.hub_scan_in) return "Hub scan-in must be complete before dispatch.";
    return undefined;
  };
  const failedDisabledReason = () => {
    if (!selectedOrder) return "Select an order before marking it failed.";
    if (actionLoading === `failed-${selectedOrder.id}`) return "Failed status is already being saved.";
    if (!["pending", "picked_up", "at_hub", "out_for_delivery"].includes(selectedOrder.order_status)) return "This order status cannot be marked failed.";
    return undefined;
  };
  const returnedDisabledReason = () => {
    if (!selectedOrder) return "Select an order before returning it to merchant.";
    if (actionLoading === `returned-${selectedOrder.id}`) return "Return status is already being saved.";
    if (!["picked_up", "at_hub", "out_for_delivery", "failed"].includes(selectedOrder.order_status)) return "This order status cannot be returned to merchant.";
    return undefined;
  };
  const selectedOrderDisabledReason = (action: string) => selectedOrder ? undefined : `Select an order before using ${action}.`;

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const zoneMatch = selectedZone === "All Zones" || order.delivery_zone === selectedZone;
      const statusMatch = selectedStatus === "all" || order.order_status === selectedStatus;
      const merchantMatch = selectedMerchantFilter === "all" || readId(order.merchant_id) === selectedMerchantFilter;
      const riderId = readId(order.rider_id);
      const riderMatch = selectedRiderFilter === "all" || (selectedRiderFilter === "unassigned" ? !riderId : riderId === selectedRiderFilter);
      const searchText = search.trim().toLowerCase();
      const searchMatch =
        !searchText ||
        order.order_id.toLowerCase().includes(searchText) ||
        order.customer_name.toLowerCase().includes(searchText) ||
        readMerchantName(order.merchant_id).toLowerCase().includes(searchText) ||
        String(order.pickup_address || "").toLowerCase().includes(searchText) ||
        String(order.dropoff_address || "").toLowerCase().includes(searchText) ||
        order.delivery_address.toLowerCase().includes(searchText);

      return zoneMatch && statusMatch && merchantMatch && riderMatch && searchMatch;
    });
  }, [orders, search, selectedMerchantFilter, selectedRiderFilter, selectedStatus, selectedZone]);

  const fetchOrders = async () => {
    const { data } = await api.get("/auth/orders", {
      params: {
        limit: 100,
        ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
        ...(selectedZone !== "All Zones" ? { delivery_zone: selectedZone } : {}),
        ...(selectedZone !== "All Zones" ? { sort: "zone" } : {}),
      },
    });

    const orderItems = (data?.data?.orders || []) as OrderRecord[];
    setOrders(orderItems);
    setSelectedOrderId((currentId) => {
      if (currentId && orderItems.some((order) => order.id === currentId)) {
        return currentId;
      }

      return orderItems[0]?.id ?? null;
    });
  };

  const fetchMerchants = async () => {
    const { data } = await api.get("/auth/merchants", { params: { limit: 100 } });
    const merchantItems = (data?.data?.merchants || []) as MerchantRecord[];
    setMerchants(merchantItems);
  };

  const fetchRiders = async () => {
    const { data } = await api.get("/auth/riders", { params: { limit: 100, is_active: true } });
    const riderItems = (data?.data?.riders || []) as RiderRecord[];
    setRiders(riderItems);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchOrders(), fetchMerchants(), fetchRiders()]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load order dispatch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    void fetchOrders().catch((error: any) => {
      toast.error(error.response?.data?.message || "Failed to refresh filtered orders");
    });
  }, [selectedStatus, selectedZone]);

  useEffect(() => {
    setPricingEstimate(null);
  }, [
    createForm.pickup_address,
    createForm.delivery_address,
    createForm.pickup_latitude,
    createForm.pickup_longitude,
    createForm.dropoff_latitude,
    createForm.dropoff_longitude,
    createForm.service_level,
  ]);

  const buildCoordinatePair = (latitudeValue: string, longitudeValue: string) => {
    const hasLatitude = String(latitudeValue || "").trim().length > 0;
    const hasLongitude = String(longitudeValue || "").trim().length > 0;
    if (!hasLatitude && !hasLongitude) return null;
    return {
      latitude: Number(latitudeValue),
      longitude: Number(longitudeValue),
    };
  };

  const coordinatePairIsValid = (coordinates: { latitude: number; longitude: number } | null) => (
    !coordinates
    || (
      Number.isFinite(coordinates.latitude)
      && Number.isFinite(coordinates.longitude)
      && coordinates.latitude >= -90
      && coordinates.latitude <= 90
      && coordinates.longitude >= -180
      && coordinates.longitude <= 180
      && !(coordinates.latitude === 0 && coordinates.longitude === 0)
    )
  );

  const pricingCoordinatePayload = () => {
    const pickupCoordinates = buildCoordinatePair(createForm.pickup_latitude, createForm.pickup_longitude);
    const dropoffCoordinates = buildCoordinatePair(createForm.dropoff_latitude, createForm.dropoff_longitude);
    return {
      pickup_address: createForm.pickup_address,
      dropoff_address: createForm.delivery_address,
      delivery_address: createForm.delivery_address,
      ...(pickupCoordinates ? { pickup_coordinates: pickupCoordinates } : {}),
      ...(dropoffCoordinates ? { dropoff_coordinates: dropoffCoordinates } : {}),
      service_level: createForm.service_level,
    };
  };

  const hasValidPricingCoordinates = () => {
    const pickupCoordinates = buildCoordinatePair(createForm.pickup_latitude, createForm.pickup_longitude);
    const dropoffCoordinates = buildCoordinatePair(createForm.dropoff_latitude, createForm.dropoff_longitude);
    return Boolean(createForm.pickup_address.trim() && createForm.delivery_address.trim())
      && coordinatePairIsValid(pickupCoordinates)
      && coordinatePairIsValid(dropoffCoordinates);
  };

  const estimateOrderPricing = async () => {
    if (!hasValidPricingCoordinates()) {
      toast.error("Enter pickup and drop-off locations, and valid GPS coordinates only if you use the optional override");
      return null;
    }

    setPricingLoading(true);
    try {
      const { data } = await api.post("/auth/orders/pricing-estimate", pricingCoordinatePayload());
      const pricing = (data?.data?.pricing || data?.pricing) as PricingEstimate;
      setPricingEstimate(pricing);
      return pricing;
    } catch (error: any) {
      setPricingEstimate(null);
      toast.error(error.response?.data?.message || "Unable to calculate delivery fee");
      return null;
    } finally {
      setPricingLoading(false);
    }
  };

  const lookupOrderAddress = async (field: "pickup" | "dropoff") => {
    const query = field === "pickup" ? createForm.pickup_address : createForm.delivery_address;
    if (query.trim().length < 3) {
      toast.error(field === "pickup" ? "Enter a pickup location to look up" : "Enter a drop-off location to look up");
      return;
    }

    setAddressLookupLoading(field);
    try {
      const { data } = await api.get("/auth/maps/geocode", { params: { query, limit: 1 } });
      const result = data?.data?.results?.[0] || data?.results?.[0];
      if (!result) {
        toast.error("No map result found for this address");
        return;
      }

      setCreateForm((current) => ({
        ...current,
        ...(field === "pickup"
          ? {
            pickup_address: result.address || result.label || current.pickup_address,
            pickup_latitude: String(result.latitude),
            pickup_longitude: String(result.longitude),
          }
          : {
            delivery_address: result.address || result.label || current.delivery_address,
            dropoff_latitude: String(result.latitude),
            dropoff_longitude: String(result.longitude),
          }),
      }));
      setPricingEstimate(null);
      toast.success(`${field === "pickup" ? "Pickup" : "Drop-off"} GPS resolved from OpenRouteService`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to look up this address");
    } finally {
      setAddressLookupLoading(null);
    }
  };

  const ensurePricingEstimate = async () => pricingEstimate || estimateOrderPricing();

  useEffect(() => {
    const merchantId = new URLSearchParams(location.search).get("merchant");
    if (merchantId) {
      setSelectedMerchantFilter(merchantId);
    }
  }, [location.search]);

  useEffect(() => {
    setHubScanCode("");
    setManualOtpReason("");
  }, [selectedOrderId]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let disconnected = false;
    let socket: Awaited<ReturnType<typeof connectRealtimeSocket>> | null = null;

    const canApplyOrder = (order: OrderRecord) => {
      if (!order?.id) {
        return false;
      }

      if (hasAllHubAccess(user.role)) {
        return true;
      }

      const orderHubId = readId(order.hub_id);
      return canAccessHub(user, orderHubId);
    };

    const mergeOrder = (incomingOrder: OrderRecord) => {
      if (!canApplyOrder(incomingOrder)) {
        return;
      }

      setOrders((currentOrders) => {
        const exists = currentOrders.some((order) => order.id === incomingOrder.id);
        if (!exists) {
          return [incomingOrder, ...currentOrders];
        }

        return currentOrders.map((order) => (
          order.id === incomingOrder.id ? { ...order, ...incomingOrder } : order
        ));
      });

      setSelectedOrderId((currentId) => currentId || incomingOrder.id);
    };

    const handleOrderEvent = (payload: any) => {
      extractRealtimeOrders(payload).forEach(mergeOrder);
    };

    connectRealtimeSocket()
      .then((nextSocket) => {
        if (disconnected) {
          nextSocket.disconnect();
          return;
        }

        socket = nextSocket;
        assignedHubIdsFor(user).forEach((hubId) => socket?.emit("join:hub", hubId));
        orderRealtimeEvents.forEach((eventName) => socket?.on(eventName, handleOrderEvent));
      })
      .catch(() => {
        // Manual refresh still uses the backend source of truth if realtime transport is unavailable.
      });

    return () => {
      disconnected = true;
      if (socket) {
        orderRealtimeEvents.forEach((eventName) => socket?.off(eventName, handleOrderEvent));
        socket.disconnect();
      }
    };
  }, [user?.id, user?.hub_id, user?.role, user?.assigned_hub_ids]);

  const updateOrderStatus = async (orderId: string, status: OrderStatus, note?: string) => {
    setActionLoading(`status-${orderId}-${status}`);
    try {
      await api.patch(`/auth/orders/${orderId}/status`, { order_status: status, note });
      toast.success(`Order moved to ${statusConfig[status].label}`);
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Status update failed");
    } finally {
      setActionLoading(null);
    }
  };

  const autoAssignRider = async (orderId: string) => {
    setActionLoading(`assign-auto-${orderId}`);
    try {
      await api.patch(`/auth/orders/${orderId}/assign-rider`, { auto_assign: true });
      toast.success("Rider auto-assigned using dispatch logic");
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Auto-assign failed");
    } finally {
      setActionLoading(null);
    }
  };

  const manualAssignRider = async (orderId: string) => {
    if (!manualRiderId) {
      toast.error("Select a rider first");
      return;
    }

    setActionLoading(`assign-manual-${orderId}`);
    try {
      await api.patch(`/auth/orders/${orderId}/assign-rider`, { rider_id: manualRiderId });
      toast.success("Rider assignment updated");
      setManualRiderId("");
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Manual assignment failed");
    } finally {
      setActionLoading(null);
    }
  };

  const confirmHubScanIn = async (orderId: string) => {
    const scannedCode = hubScanCode.trim();
    if (!scannedCode) {
      toast.error("Scan or enter the package code first");
      return;
    }

    setActionLoading(`hub-scan-${orderId}`);
    try {
      await api.post(`/auth/orders/${orderId}/hub-scan-in`, {
        scanned_code: scannedCode,
      });
      toast.success("Package scanned into hub");
      setHubScanCode("");
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Hub scan-in failed");
    } finally {
      setActionLoading(null);
    }
  };

  const manualOtpOverride = async (orderId: string) => {
    const reason = manualOtpReason.trim();
    if (!canUseManualOtpOverride) {
      toast.error("Manual OTP override requires super admin or hub manager permission");
      return;
    }

    if (reason.length < 5) {
      toast.error("Enter a clear override reason first");
      return;
    }

    if (!proofFile) {
      toast.error("Attach a proof photo before manual OTP override");
      return;
    }

    setActionLoading(`manual-otp-${orderId}`);
    try {
      const order = orders.find((item) => item.id === orderId) ?? null;
      const proofUploadId = await uploadOrderProof(orderId, order, "manual OTP override");

      await api.post(`/auth/orders/${orderId}/manual-otp-override`, {
        reason,
        proof_upload_id: proofUploadId || undefined,
      });
      toast.success("Manual OTP override applied");
      setManualOtpReason("");
      setProofFile(null);
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Manual OTP override failed");
    } finally {
      setActionLoading(null);
    }
  };

  const closeNewOrderModal = () => {
    setShowNewOrder(false);
    setCreateStep(0);
    setPricingEstimate(null);
  };

  const validateCreateStep = (step = createStep) => {
    const requiredByStep: Record<number, Array<[keyof CreateOrderForm, string]>> = {
      0: [["merchant_id", "Merchant"]],
      1: [
        ["customer_name", "Customer name"],
        ["customer_phone", "Customer phone"],
        ["pickup_address", "Pickup location"],
        ["delivery_address", "Drop-off location"],
      ],
      2: [
        ["delivery_zone", "Delivery zone"],
        ["item_description", "Item description"],
      ],
    };

    const missingField = (requiredByStep[step] || []).find(([field]) => !String(createForm[field] || "").trim());
    if (missingField) {
      toast.error(`${missingField[1]} is required`);
      return false;
    }

    if (step === 2 && createForm.batch_id.trim() && createForm.batch_id.trim().length < 2) {
      toast.error("Batch group must be at least 2 characters");
      return false;
    }

    if (step === 0 && selectedCreateMerchantIssue) {
      toast.error(selectedCreateMerchantIssue);
      return false;
    }

    return true;
  };

  const continueCreateWizard = () => {
    if (!validateCreateStep()) {
      return;
    }

    if (createStep === 3 && !pricingEstimate) {
      void estimateOrderPricing().then((pricing) => {
        if (pricing) {
          setCreateStep((current) => Math.min(current + 1, createOrderSteps.length - 1));
        }
      });
      return;
    }

    setCreateStep((current) => Math.min(current + 1, createOrderSteps.length - 1));
  };

  const createOrder = async () => {
    const requiredFields: Array<[keyof CreateOrderForm, string]> = [
      ["merchant_id", "Merchant"],
      ["customer_name", "Customer name"],
      ["customer_phone", "Customer phone"],
      ["pickup_address", "Pickup location"],
      ["delivery_address", "Drop-off location"],
      ["delivery_zone", "Delivery zone"],
      ["item_description", "Item description"],
    ];
    const missingField = requiredFields.find(([field]) => !String(createForm[field] || "").trim());

    if (missingField) {
      toast.error(`${missingField[1]} is required`);
      return;
    }

    if (selectedCreateMerchantIssue) {
      toast.error(selectedCreateMerchantIssue);
      return;
    }

    if (createForm.batch_id.trim() && createForm.batch_id.trim().length < 2) {
      toast.error("Batch group must be at least 2 characters");
      return;
    }

    const pricing = await ensurePricingEstimate();
    if (!pricing) {
      return;
    }

    setActionLoading("create-order");

    try {
      const shouldAutoAssign = createForm.dispatch_mode === "auto_assign";
      const selectedMerchantHubId = readId(selectedCreateMerchant?.hub_id);
      const userHubIds = assignedHubIdsFor(user);
      const createHubId = selectedMerchantHubId || (userHubIds.length === 1 ? userHubIds[0] : undefined);
      const { data } = await api.post("/auth/orders", {
        merchant_id: createForm.merchant_id,
        customer_name: createForm.customer_name,
        customer_phone: createForm.customer_phone,
        pickup_address: createForm.pickup_address,
        dropoff_address: createForm.delivery_address,
        delivery_address: createForm.delivery_address,
        item_description: createForm.item_description,
        package_size: createForm.package_size,
        declared_value: Number(createForm.declared_value || 0),
        delivery_zone: createForm.delivery_zone,
        batch_id: createForm.batch_id.trim() || undefined,
        service_level: createForm.service_level,
        ...pricingCoordinatePayload(),
        cod_amount: Number(createForm.cod_amount || 0),
        hub_id: createHubId,
        auto_assign: shouldAutoAssign,
      });

      toast.success(shouldAutoAssign ? "Order created with auto-dispatch" : "Manual order created and ready for dispatch");
      closeNewOrderModal();
      setCreateForm(emptyForm());
      await fetchOrders();
      const createdOrderId = data?.data?.order?.id;
      if (createdOrderId) {
        setSelectedOrderId(createdOrderId);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Order creation failed");
    } finally {
      setActionLoading(null);
    }
  };

  const uploadOrderProof = async (orderId: string, order: OrderRecord | null | undefined, purpose: string) => {
    if (!proofFile) {
      toast.error(`Attach a proof photo before ${purpose}`);
      return null;
    }

    const formData = new FormData();
    formData.append("file", proofFile);
    formData.append("related_model", "Order");
    formData.append("related_id", orderId);

    const hubId = readId(order?.hub_id) || readId(user?.hub_id) || null;
    if (hubId) {
      formData.append("hub_id", hubId);
    }

    const { data } = await api.post("/auth/uploads/single", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const upload = data?.data?.upload;
    const uploadId = upload?._id || upload?.id;

    if (!uploadId) {
      throw new Error("Backend did not return an upload ID");
    }

    return uploadId as string;
  };

  const markFailed = async (orderId: string) => {
    setActionLoading(`failed-${orderId}`);
    try {
      const order = orders.find((item) => item.id === orderId) ?? null;
      const proofUploadId = await uploadOrderProof(orderId, order, "marking failed");
      if (!proofUploadId) {
        return;
      }

      await api.post(`/auth/orders/${orderId}/failed`, {
        reason: issueNote.trim() || "Customer unavailable",
        proof_upload_id: proofUploadId,
      });
      toast.success("Order marked failed");
      setProofFile(null);
      setIssueNote("");
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to mark order failed");
    } finally {
      setActionLoading(null);
    }
  };

  const markReturned = async (orderId: string) => {
    setActionLoading(`returned-${orderId}`);
    try {
      const order = orders.find((item) => item.id === orderId) ?? null;
      const proofUploadId = await uploadOrderProof(orderId, order, "returning the order");
      if (!proofUploadId) {
        return;
      }

      await api.post(`/auth/orders/${orderId}/return-to-merchant`, {
        reason: issueNote.trim() || "Returned to merchant",
        proof_upload_id: proofUploadId,
      });
      toast.success("Order returned");
      setProofFile(null);
      setIssueNote("");
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to return order");
    } finally {
      setActionLoading(null);
    }
  };

  const onRefreshClick = async () => {
    setActionLoading("refresh");
    await refreshAll();
    setActionLoading(null);
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedMerchantFilter("all");
    setSelectedRiderFilter("all");
    setSelectedZone("All Zones");
    setSelectedStatus("all");
    toast.success("Order filters cleared");
  };

  const printWaybill = () => {
    if (!selectedOrder) {
      toast.error("Select an order before printing a waybill");
      return;
    }

    const waybillWindow = window.open("", "_blank", "width=720,height=900");
    if (!waybillWindow) {
      toast.error("Allow popups to print the waybill");
      return;
    }

    const merchantName = readMerchantName(selectedOrder.merchant_id);
    const riderName = readRiderName(selectedOrder.rider_id);
    waybillWindow.document.write(`
      <html>
        <head>
          <title>Wolan Waybill ${selectedOrder.order_id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #21172f; }
            h1 { color: #4b0082; margin-bottom: 4px; }
            .box { border: 1px solid #e4d8ef; border-radius: 10px; padding: 14px; margin: 14px 0; }
            .label { color: #75647f; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
            .value { font-weight: 700; margin-top: 4px; }
          </style>
        </head>
        <body>
          <h1>Wolan Delivery Waybill</h1>
          <p>${selectedOrder.order_id}</p>
          <div class="box"><div class="label">Merchant</div><div class="value">${merchantName}</div></div>
          <div class="box"><div class="label">Customer</div><div class="value">${selectedOrder.customer_name} | ${selectedOrder.customer_phone}</div></div>
          <div class="box"><div class="label">Delivery Address</div><div class="value">${selectedOrder.delivery_address}</div></div>
          <div class="box"><div class="label">Package</div><div class="value">${selectedOrder.item_description} (${packageSizeLabel(selectedOrder.package_size)})</div></div>
          <div class="box"><div class="label">Rider</div><div class="value">${riderName}</div></div>
          <div class="box"><div class="label">Tracking</div><div class="value">${selectedOrder.package_tracking_id}</div></div>
          <div class="box"><div class="label">Pickup Key</div><div class="value">${selectedOrder.pickup_key || "----"}</div></div>
        </body>
      </html>
    `);
    waybillWindow.document.close();
    waybillWindow.focus();
    waybillWindow.print();
  };

  const viewOrderQr = (order = selectedOrder) => {
    if (!order) {
      toast.error("Select an order before viewing its QR code");
      return;
    }

    if (normalizeQrImageSource(order.qr_code)) {
      setQrPreviewOrder(order);
      return;
    }

    toast.info(`QR not returned by backend yet. Tracking ID: ${order.package_tracking_id}`);
  };

  const showInitialSkeleton = loading && orders.length === 0 && merchants.length === 0 && riders.length === 0;
  const qrPreviewSource = normalizeQrImageSource(qrPreviewOrder?.qr_code);
  const qrDownloadName = `${qrPreviewOrder?.order_id || qrPreviewOrder?.package_tracking_id || "wolan-order"}-qr.png`;

  return (
    <div data-cmp="Orders" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header title="Orders & Dispatch" subtitle="Create, assign, stage, and track orders in real time" />

      {showInitialSkeleton ? (
        <OrdersDispatchSkeleton />
      ) : (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card/50 sm:px-6 sm:py-4">
            <button
              onClick={() => {
                setCreateStep(0);
                setShowNewOrder(true);
              }}
              title="Open the guided order creation wizard."
              className="flex items-center gap-2 gradient-orange text-white text-xs font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity shadow-custom"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New Order
            </button>
            <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-2 sm:max-w-xs">
              <SearchIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none w-full"
                placeholder="Search by ID, merchant, customer"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <CustomSelect
              value={selectedMerchantFilter}
              onValueChange={setSelectedMerchantFilter}
              ariaLabel="Merchant filter"
              options={[
                { value: "all", label: "All merchants" },
                ...merchants.map((merchant) => ({
                  value: merchant.id,
                  label: merchant.shop_name || merchant.merchant_name,
                })),
              ]}
              triggerClassName="min-w-[150px] flex-1 rounded-lg bg-muted sm:flex-none"
            />
            <CustomSelect
              value={selectedRiderFilter}
              onValueChange={setSelectedRiderFilter}
              ariaLabel="Rider filter"
              options={[
                { value: "all", label: "All riders" },
                { value: "unassigned", label: "Unassigned" },
                ...riders.map((rider) => ({
                  value: rider.user_id,
                  label: rider.full_name,
                })),
              ]}
              triggerClassName="min-w-[150px] flex-1 rounded-lg bg-muted sm:flex-none"
            />
            <div className="flex gap-1.5 flex-wrap">
              {zones.map((zone) => (
                <button
                  key={zone}
                  onClick={() => setSelectedZone(zone)}
                  className={`text-[10px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                    selectedZone === zone ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {zone}
                </button>
              ))}
            </div>
            <button
              onClick={clearFilters}
              title="Clear search, status, merchant, rider, and zone filters"
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FilterIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRefreshClick}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {actionLoading === "refresh" ? <LoaderGlyph size="xs" label="Refreshing orders" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="responsive-table-frame flex items-center gap-1 border-b border-border px-4 py-3 sm:px-6">
            {statusFilters.map((statusItem) => (
              <button
                key={statusItem.value}
                onClick={() => setSelectedStatus(statusItem.value)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  selectedStatus === statusItem.value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {statusItem.label}
              </button>
            ))}
          </div>

          <div className="content-scroll flex-1 px-4 py-4 sm:px-6">
            <div className="space-y-3 xl:hidden">
              {loading && !showInitialSkeleton ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="rounded-xl border border-border bg-card p-4 shadow-custom">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Skeleton className="h-12 rounded-lg" />
                      <Skeleton className="h-12 rounded-lg" />
                    </div>
                  </div>
                ))
              ) : null}

              {!loading && filtered.length === 0 ? (
                <div className="rounded-xl border border-border bg-card px-4 py-6 shadow-custom">
                  <GuidedEmptyState
                    icon={PackageIcon}
                    title={orders.length === 0 ? "No orders yet" : "No orders match these filters"}
                    description={orders.length === 0 ? "Create a test order with the guided modal. It will auto-dispatch only after the backend accepts the order." : "Clear a filter or refresh the order list to continue testing dispatch."}
                  />
                </div>
              ) : null}

              {!loading && filtered.map((order) => {
                const currentStatus = statusConfig[order.order_status];
                const StatusIcon = currentStatus.icon;

                return (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => selectOrder(order.id)}
                    className={`w-full rounded-xl border bg-card p-3 text-left shadow-custom transition-colors ${
                      selectedOrderId === order.id ? "border-primary/45 bg-primary/5" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-primary">{order.order_id}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-foreground">{readMerchantName(order.merchant_id)}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{order.customer_name}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${currentStatus.classes}`}>
                        <StatusIcon className="h-3 w-3" />
                        {currentStatus.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="min-w-0 rounded-lg bg-muted px-2 py-2">
                        <p className="uppercase tracking-wider text-muted-foreground">Zone</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{order.delivery_zone || "-"}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-muted px-2 py-2">
                        <p className="uppercase tracking-wider text-muted-foreground">Rider</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{readRiderName(order.rider_id)}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-muted px-2 py-2">
                        <p className="uppercase tracking-wider text-muted-foreground">Fee</p>
                        <p className="mt-1 truncate font-semibold text-primary">UGX {formatUGX(order.delivery_fee)}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-muted px-2 py-2">
                        <p className="uppercase tracking-wider text-muted-foreground">Package</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{packageSizeLabel(order.package_size)}</p>
                      </div>
                      {order.batch_id ? (
                        <div className="min-w-0 rounded-lg bg-primary/10 px-2 py-2">
                          <p className="uppercase tracking-wider text-primary">Batch</p>
                          <p className="mt-1 truncate font-semibold text-primary">{order.batch_id}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
                      <span>{order.createdAt ? new Date(order.createdAt).toLocaleString() : "-"}</span>
                      <span className="font-semibold text-primary">Open details</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="responsive-table-frame hidden rounded-xl border border-border bg-card shadow-custom xl:block">
              <div
                className="grid min-w-[900px] text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border px-4 py-3"
                style={{ gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 0.9fr 0.7fr 0.6fr" }}
              >
                <span>Order ID</span>
                <span>Merchant → Customer</span>
                <span>Address</span>
                <span>Zone</span>
                <span>Rider</span>
                <span>Status</span>
                <span>Value</span>
                <span>Actions</span>
              </div>

              {loading && !showInitialSkeleton ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 5 }).map((_, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="grid min-w-[900px] items-center gap-4 px-4 py-3.5"
                      style={{ gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 0.9fr 0.7fr 0.6fr" }}
                    >
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-6 w-28 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <div className="flex gap-1.5">
                        <Skeleton className="h-7 w-7 rounded" />
                        <Skeleton className="h-7 w-7 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!loading && filtered.length === 0 ? (
                <div className="px-4 py-6">
                  <GuidedEmptyState
                    icon={PackageIcon}
                    title={orders.length === 0 ? "No orders yet" : "No orders match these filters"}
                    description={orders.length === 0 ? "Create a test order with the guided modal. It will auto-dispatch only after the backend accepts the order." : "Clear a filter or refresh the order list to continue testing dispatch."}
                  />
                </div>
              ) : null}

              {!loading && filtered.map((order) => {
                const currentStatus = statusConfig[order.order_status];
                const StatusIcon = currentStatus.icon;

                return (
                  <div
                    key={order.id}
                    onClick={() => selectOrder(order.id)}
                    className="grid min-w-[900px] items-center px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    style={{ gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 0.9fr 0.7fr 0.6fr" }}
                  >
                    <div>
                      <p className="text-xs font-bold text-primary">{order.order_id}</p>
                      <p className="text-[10px] text-muted-foreground">{order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground truncate">{readMerchantName(order.merchant_id)}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{order.customer_name}</p>
                    </div>
                    <div className="flex items-start gap-1">
                      <MapPinIcon className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-muted-foreground truncate">{order.delivery_address}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{order.delivery_zone}</span>
                    <p className="text-xs text-foreground">{readRiderName(order.rider_id)}</p>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border w-fit ${currentStatus.classes}`}>
                      <StatusIcon className="w-3 h-3" />
                      {currentStatus.label}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-foreground">UGX {formatUGX(order.declared_value)}</p>
                      <p className={`text-[10px] ${order.cod_amount > 0 ? "text-warning" : "text-muted-foreground"}`}>
                        {order.cod_amount > 0 ? `COD ${formatUGX(order.cod_amount)}` : "Prepaid"}
                      </p>
                      <p className="text-[10px] font-semibold text-primary">Fee {formatUGX(order.delivery_fee)}</p>
                      {order.batch_id ? <p className="text-[10px] text-muted-foreground">Batch {order.batch_id}</p> : null}
                      <p className="text-[10px] text-muted-foreground">{packageSizeLabel(order.package_size)} package</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          selectOrder(order.id);
                          navigate(`/live-map?order=${encodeURIComponent(order.id)}`);
                        }}
                        className="p-1.5 rounded bg-muted hover:bg-accent transition-colors"
                        title="Open this order on the live map"
                      >
                        <MapPinIcon className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          selectOrder(order.id);
                          viewOrderQr(order);
                        }}
                        className="p-1.5 rounded bg-muted hover:bg-accent transition-colors"
                        title="View order QR code"
                      >
                        <QrCodeIcon className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`hidden w-full min-w-0 flex-shrink-0 border-t border-border bg-card transition-all duration-300 xl:flex xl:w-96 xl:flex-col xl:border-l xl:border-t-0 ${selectedOrder ? "opacity-100" : "opacity-40"}`}>
          <div className="p-5 border-b border-border">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-primary">{selectedOrder?.order_id ?? "Select an order"}</p>
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${selectedOrder ? statusConfig[selectedOrder.order_status].classes : statusConfig.pending.classes}`}>
                {selectedOrder ? statusConfig[selectedOrder.order_status].label : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{selectedOrder?.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "—"}</p>
          </div>

          <div className="border-b border-border bg-card px-4 py-3">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
              {mobileOrderTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileOrderTab(tab.id)}
                  className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors ${
                    mobileOrderTab === tab.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <div className={mobileOrderTab === "summary" ? "flex flex-col gap-4" : "hidden"}>
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchant</p>
              <p className="text-xs font-semibold text-foreground">{selectedOrder ? readMerchantName(selectedOrder.merchant_id) : "—"}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
              <p className="text-xs font-semibold text-foreground">{selectedOrder?.customer_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{selectedOrder?.customer_phone ?? "—"}</p>
              <div className="flex items-start gap-1.5">
                <MapPinIcon className="w-3 h-3 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">{selectedOrder?.delivery_address ?? "—"}</p>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-3 flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tracking IDs</p>
              {selectedOrder?.batch_id ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PackageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">Batch Group</span>
                  </div>
                  <span className="max-w-[10rem] truncate text-xs font-bold text-primary">{selectedOrder.batch_id}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                <div className="flex items-center gap-2">
                  <QrCodeIcon className="w-3.5 h-3.5 text-warning" />
                  <span className="text-[10px] text-warning">Pickup Key</span>
                </div>
                <span className="font-mono text-lg font-black tracking-[0.25em] text-warning">{selectedOrder?.pickup_key ?? "----"}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TruckIcon className="w-3.5 h-3.5 text-chart-2" />
                  <span className="text-[10px] text-muted-foreground">Rider Tracking</span>
                </div>
                <span className="text-xs font-bold text-chart-2">{selectedOrder?.rider_tracking_id ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScanBarcodeIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] text-muted-foreground">Package Tracking</span>
                </div>
                <span className="text-xs font-bold text-primary">{selectedOrder?.package_tracking_id ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScanBarcodeIcon className="w-3.5 h-3.5 text-success" />
                  <span className="text-[10px] text-muted-foreground">Physical Tracker</span>
                </div>
                <span className="text-xs font-bold text-success">{selectedOrder?.physical_tracker_id ?? "Not linked"}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned Rider</p>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 gradient-blue rounded-full flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{readRiderName(selectedOrder?.rider_id ?? null)}</p>
                  <p className="text-[10px] text-muted-foreground">{readRiderPhone(selectedOrder?.rider_id ?? null)}</p>
                </div>
              </div>
            </div>

            </div>
            <div className={mobileOrderTab === "workflow" ? "flex flex-col gap-4" : "hidden"}>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignment Status</p>
              <p className="mt-1 text-xs font-semibold text-foreground">{selectedOrder?.assignment_response_status ?? "unassigned"}</p>
              <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
                <span>Due: {selectedOrder?.assignment_response_due_at ? new Date(selectedOrder.assignment_response_due_at).toLocaleString() : "-"}</span>
                <span>Accepted: {selectedOrder?.accepted_at ? new Date(selectedOrder.accepted_at).toLocaleString() : "-"}</span>
                <span>Rejected: {selectedOrder?.rejected_at ? new Date(selectedOrder.rejected_at).toLocaleString() : "-"}</span>
                <span>Handover: {selectedOrder?.handover_verified ? "Verified" : "Pending"}</span>
                <span>Hub scan-in: {selectedOrder?.hub_scan_in ? new Date(selectedOrder.hub_scan_in).toLocaleString() : "-"}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hub Scan-In</p>
              <p className={`mt-1 text-xs font-semibold ${selectedOrder?.hub_scan_in ? "text-success" : "text-warning"}`}>
                {selectedOrder?.hub_scan_in ? "Scanned into hub" : "Waiting for hub scan"}
              </p>
              <div className="mt-3 grid gap-2">
                <input
                  value={hubScanCode}
                  onChange={(event) => setHubScanCode(event.target.value)}
                  placeholder="Scan package, order, or rider tracking code"
                  className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                />
                <button
                  onClick={() => selectedOrder && confirmHubScanIn(selectedOrder.id)}
                  title={hubScanDisabledReason() || "Confirm that this package has been scanned into the hub."}
                  disabled={
                    !selectedOrder
                    || selectedOrder.order_status !== "picked_up"
                    || !selectedOrder.handover_verified
                    || Boolean(selectedOrder.hub_scan_in)
                    || actionLoading === `hub-scan-${selectedOrder.id}`
                  }
                  className="w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {selectedOrder && actionLoading === `hub-scan-${selectedOrder.id}` ? "Scanning..." : "Confirm Hub Scan-In"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-warning">Testing OTP</p>
              <p className="mt-1 text-sm font-bold text-warning">{selectedOrder?.dev_otp_code ?? "Hidden"}</p>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-primary">Manual OTP Override</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Super admin or hub manager only. Requires out-for-delivery status, verified handover, hub scan-in, proof photo, and an audit reason.
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${selectedOrder?.manual_otp_override ? "border-success/20 bg-success/10 text-success" : "border-border bg-card text-muted-foreground"}`}>
                  {selectedOrder?.manual_otp_override ? "Overridden" : "Locked"}
                </span>
              </div>
              {selectedOrder?.manual_otp_override ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {selectedOrder.manual_otp_override_reason || "Manual override recorded"} · {selectedOrder.manual_otp_override_at ? new Date(selectedOrder.manual_otp_override_at).toLocaleString() : "time not recorded"}
                </p>
              ) : null}
              <textarea
                value={manualOtpReason}
                onChange={(event) => setManualOtpReason(event.target.value)}
                rows={2}
                placeholder="Reason, e.g. customer phone unavailable but delivery was verified by supervisor"
                className="mt-3 w-full resize-none rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={() => selectedOrder && manualOtpOverride(selectedOrder.id)}
                title={manualOtpDisabledReason() || "Apply a permission-controlled manual OTP override with proof and audit reason."}
                disabled={!manualOtpReady || actionLoading === `manual-otp-${selectedOrder?.id}`}
                className="mt-2 w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {selectedOrder && actionLoading === `manual-otp-${selectedOrder.id}` ? "Applying override..." : "Apply Manual OTP Override"}
              </button>
              {!canUseManualOtpOverride ? (
                <p className="mt-2 text-[10px] text-warning">Your role can view this audit state but cannot apply an OTP override.</p>
              ) : null}
            </div>

            </div>
            <div className={mobileOrderTab === "dispatch" ? "flex flex-col gap-4" : "hidden"}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Order Value</span>
              <span className="text-xs font-bold text-foreground">UGX {formatUGX(selectedOrder?.declared_value)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Package Size</span>
              <span className="text-xs font-bold text-foreground">{packageSizeLabel(selectedOrder?.package_size)}</span>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>Pickup: <strong className="text-foreground">{selectedOrder?.pickup_address || "-"}</strong></p>
              <p className="mt-1">Drop-off: <strong className="text-foreground">{selectedOrder?.dropoff_address || selectedOrder?.delivery_address || "-"}</strong></p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Payment Type</span>
              <span className={`text-xs font-semibold ${selectedOrder?.cod_amount ? "text-warning" : "text-success"}`}>
                {selectedOrder?.cod_amount ? "COD" : "Prepaid"}
              </span>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-primary">Automatic Delivery Pricing</p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <span>Fee: <strong className="text-primary">UGX {formatUGX(selectedOrder?.delivery_fee)}</strong></span>
                <span>Distance: <strong className="text-foreground">{selectedOrder?.pricing_distance_km !== null && selectedOrder?.pricing_distance_km !== undefined ? `${selectedOrder.pricing_distance_km.toFixed(2)} KM` : "-"}</strong></span>
                <span>Tier: <strong className="text-foreground">{selectedOrder?.pricing_tier_label || "-"}</strong></span>
                <span>Service: <strong className="text-foreground">{selectedOrder?.service_level === "express" ? "Express 1-hour request" : "Standard"}</strong></span>
                {selectedOrder?.order_status === "returned" ? (
                  <span>Return fee: <strong className="text-warning">{selectedOrder.return_fee_currency || "UGX"} {formatUGX(selectedOrder.return_fee || 0)}</strong></span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <button
                onClick={() => selectedOrder && autoAssignRider(selectedOrder.id)}
                title={autoAssignDisabledReason() || "Ask the backend to assign a compatible available rider."}
                disabled={Boolean(autoAssignDisabledReason())}
                className="w-full gradient-orange text-white text-xs font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {selectedOrder && actionLoading === `assign-auto-${selectedOrder.id}` ? "Assigning..." : "Auto-Assign Rider"}
              </button>

              <CustomSelect
                value={manualRiderId}
                onValueChange={setManualRiderId}
                placeholder="Manual Rider Override"
                ariaLabel="Manual rider override"
                options={[
                  { value: "", label: "Manual Rider Override" },
                  ...riders.map((rider) => {
                  const compatible = isRiderCompatibleWithOrder(rider, selectedOrder);
                    return {
                      value: rider.user_id,
                      label: `${rider.full_name} (${rider.current_status}, ${rider.vehicle_type ? vehicleLabels[rider.vehicle_type] : "No vehicle"})${compatible ? "" : " - incompatible"}`,
                      description: compatible ? "Compatible for this package" : `Blocked for ${packageSizeLabel(selectedOrder?.package_size)} package`,
                      disabled: !compatible,
                    };
                  }),
                ]}
                triggerClassName="h-10 rounded-lg"
              />

              <button
                onClick={() => selectedOrder && manualAssignRider(selectedOrder.id)}
                title={manualAssignDisabledReason() || "Apply this compatible rider assignment through the backend."}
                disabled={Boolean(manualAssignDisabledReason())}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                <LoadingButtonContent
                  loading={Boolean(selectedOrder && actionLoading === `assign-manual-${selectedOrder.id}`)}
                  loadingLabel="Applying assignment"
                  label="Apply Manual Assignment"
                />
              </button>

              <button
                onClick={() => selectedOrder && updateOrderStatus(selectedOrder.id, "out_for_delivery", "Dispatched from admin panel")}
                title={dispatchDisabledReason() || "Dispatch this scanned package out for delivery."}
                disabled={
                  !selectedOrder
                  || selectedOrder.order_status !== "at_hub"
                  || !selectedOrder.handover_verified
                  || !selectedOrder.hub_scan_in
                  || actionLoading === `status-${selectedOrder.id}-out_for_delivery`
                }
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                Dispatch Out For Delivery
              </button>

              <label className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-2 text-[10px] text-muted-foreground">
                Proof photo for failed, return, or manual OTP override
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                  className="text-[10px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-white"
                />
                {proofFile ? <span>{proofFile.name}</span> : null}
              </label>
              <textarea
                value={issueNote}
                onChange={(event) => setIssueNote(event.target.value)}
                rows={3}
                placeholder="Failure or return note"
                className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none resize-none"
              />

              <button
                onClick={() => selectedOrder && markFailed(selectedOrder.id)}
                title={failedDisabledReason() || "Mark this order failed with the current proof/note context."}
                disabled={!selectedOrder || !["pending", "picked_up", "at_hub", "out_for_delivery"].includes(selectedOrder.order_status) || actionLoading === `failed-${selectedOrder.id}`}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                Mark Failed
              </button>

              <button
                onClick={() => selectedOrder && markReturned(selectedOrder.id)}
                title={returnedDisabledReason() || "Return this order to the merchant with the current proof/note context."}
                disabled={!selectedOrder || !["picked_up", "at_hub", "out_for_delivery", "failed"].includes(selectedOrder.order_status) || actionLoading === `returned-${selectedOrder.id}`}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                Return to Merchant
              </button>

            </div>
            </div>
            <div className={mobileOrderTab === "history" ? "flex flex-col gap-4" : "hidden"}>
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status Timeline</p>
                <div className="mt-2 flex flex-col gap-2">
                  {(selectedOrder?.status_history || []).slice().reverse().map((entry, index) => (
                    <div key={`${entry.status}-${index}`} className="border-l-2 border-primary/30 pl-3">
                      <p className="text-xs font-semibold text-foreground">{entry.status}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.note || "Status updated"}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "-"}</p>
                    </div>
                  ))}
                  {(!selectedOrder?.status_history || selectedOrder.status_history.length === 0) ? (
                    <p className="text-[10px] text-muted-foreground">No timeline entries yet.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Audit Trail</p>
                <div className="mt-2 flex flex-col gap-2">
                  {(selectedOrder?.activity_logs || []).slice().reverse().slice(0, 8).map((entry, index) => (
                    <div key={`${entry.action}-${index}`} className="border-l-2 border-warning/40 pl-3">
                      <p className="text-xs font-semibold text-foreground">{entry.action.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.note || "Action recorded"}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.actor_role || "system"} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</p>
                    </div>
                  ))}
                  {(!selectedOrder?.activity_logs || selectedOrder.activity_logs.length === 0) ? (
                    <p className="text-[10px] text-muted-foreground">No audit entries yet.</p>
                  ) : null}
                </div>
              </div>

              <button
                onClick={printWaybill}
                title={selectedOrderDisabledReason("waybill printing") || "Print the selected order waybill."}
                disabled={!selectedOrder}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PrinterIcon className="w-3.5 h-3.5" />
                Print Waybill
              </button>
              <button
                onClick={() => viewOrderQr()}
                title={selectedOrderDisabledReason("QR viewing") || "Open the selected order QR code."}
                disabled={!selectedOrder}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <QrCodeIcon className="w-3.5 h-3.5" />
                View QR Code
              </button>
            </div>
          </div>
        </div>

        {qrPreviewOrder ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Order QR Code</p>
                  <h3 className="mt-1 truncate text-lg font-black text-foreground">{qrPreviewOrder.order_id}</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{qrPreviewOrder.package_tracking_id || "No package tracking ID"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setQrPreviewOrder(null)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Close QR preview"
                >
                  <XCircleIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-white p-4">
                {qrPreviewSource ? (
                  <img
                    src={qrPreviewSource}
                    alt={`QR code for ${qrPreviewOrder.order_id}`}
                    className="mx-auto aspect-square w-full max-w-72 object-contain"
                  />
                ) : (
                  <GuidedEmptyState
                    icon={QrCodeIcon}
                    title="QR image unavailable"
                    description="The backend returned this order without a usable QR image."
                  />
                )}
              </div>

              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="rounded-xl bg-muted px-3 py-2">
                  <p className="uppercase tracking-wider">Pickup key</p>
                  <p className="mt-1 font-mono text-lg font-black tracking-[0.18em] text-warning">{qrPreviewOrder.pickup_key || "----"}</p>
                </div>
                <div className="rounded-xl bg-muted px-3 py-2">
                  <p className="uppercase tracking-wider">Customer</p>
                  <p className="mt-1 truncate font-semibold text-foreground">{qrPreviewOrder.customer_name}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setQrPreviewOrder(null)}
                  className="rounded-lg border border-border px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  Close
                </button>
                {qrPreviewSource ? (
                  <a
                    href={qrPreviewSource}
                    download={qrDownloadName}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Download QR
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="QR image is unavailable for this order."
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white opacity-50"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Download QR
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {selectedOrderId && selectedOrder ? (
          <div className="fixed inset-0 z-[90] flex flex-col bg-background xl:hidden">
            <div className="border-b border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrderId(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground"
                  aria-label="Back to orders"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-primary">{selectedOrder.order_id}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{readMerchantName(selectedOrder.merchant_id)} - {selectedOrder.customer_name}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusConfig[selectedOrder.order_status].classes}`}>
                  {statusConfig[selectedOrder.order_status].label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                {mobileOrderTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileOrderTab(tab.id)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors ${
                      mobileOrderTab === tab.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {mobileOrderTab === "summary" ? (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{selectedOrder.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.customer_phone}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{selectedOrder.delivery_address || selectedOrder.dropoff_address || "-"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pickup key</p>
                      <p className="mt-1 font-mono text-xl font-black tracking-[0.2em] text-warning">{selectedOrder.pickup_key ?? "----"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Package</p>
                      <p className="mt-1 text-sm font-bold text-foreground">{packageSizeLabel(selectedOrder.package_size)}</p>
                      <p className="text-[10px] text-muted-foreground">UGX {formatUGX(selectedOrder.declared_value)}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-primary">Automatic pricing</p>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      <span>Fee: <strong className="text-primary">UGX {formatUGX(selectedOrder.delivery_fee)}</strong></span>
                      <span>Distance: <strong className="text-foreground">{selectedOrder.pricing_distance_km !== null && selectedOrder.pricing_distance_km !== undefined ? `${selectedOrder.pricing_distance_km.toFixed(2)} KM` : "-"}</strong></span>
                      <span>Service: <strong className="text-foreground">{selectedOrder.service_level === "express" ? "Express 1-hour request" : "Standard"}</strong></span>
                      <span>Payment: <strong className={selectedOrder.cod_amount ? "text-warning" : "text-success"}>{selectedOrder.cod_amount ? `COD UGX ${formatUGX(selectedOrder.cod_amount)}` : "Prepaid"}</strong></span>
                      {selectedOrder.order_status === "returned" ? (
                        <span>Return fee: <strong className="text-warning">{selectedOrder.return_fee_currency || "UGX"} {formatUGX(selectedOrder.return_fee || 0)}</strong></span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tracking</p>
                    <div className="mt-2 grid gap-2 text-xs">
                      {selectedOrder.batch_id ? (
                        <span className="flex justify-between gap-3"><span className="text-muted-foreground">Batch</span><strong className="truncate text-primary">{selectedOrder.batch_id}</strong></span>
                      ) : null}
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Rider</span><strong className="truncate text-chart-2">{selectedOrder.rider_tracking_id ?? "-"}</strong></span>
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Package</span><strong className="truncate text-primary">{selectedOrder.package_tracking_id ?? "-"}</strong></span>
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Physical</span><strong className="truncate text-success">{selectedOrder.physical_tracker_id ?? "Not linked"}</strong></span>
                    </div>
                  </div>
                </div>
              ) : null}

              {mobileOrderTab === "workflow" ? (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned rider</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{readRiderName(selectedOrder.rider_id)}</p>
                    <p className="text-xs text-muted-foreground">{readRiderPhone(selectedOrder.rider_id)}</p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignment</p>
                    <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
                      <span>Status: <strong className="text-foreground">{selectedOrder.assignment_response_status ?? "unassigned"}</strong></span>
                      <span>Due: <strong className="text-foreground">{selectedOrder.assignment_response_due_at ? new Date(selectedOrder.assignment_response_due_at).toLocaleString() : "-"}</strong></span>
                      <span>Handover: <strong className={selectedOrder.handover_verified ? "text-success" : "text-warning"}>{selectedOrder.handover_verified ? "Verified" : "Pending"}</strong></span>
                      <span>Hub scan-in: <strong className={selectedOrder.hub_scan_in ? "text-success" : "text-warning"}>{selectedOrder.hub_scan_in ? new Date(selectedOrder.hub_scan_in).toLocaleString() : "Waiting"}</strong></span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hub scan-in</p>
                    <input
                      value={hubScanCode}
                      onChange={(event) => setHubScanCode(event.target.value)}
                      placeholder="Scan package, order, or rider tracking code"
                      className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
                    />
                    <button
                      onClick={() => confirmHubScanIn(selectedOrder.id)}
                      title={hubScanDisabledReason() || "Confirm that this package has been scanned into the hub."}
                      disabled={Boolean(hubScanDisabledReason())}
                      className="mt-2 w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {actionLoading === `hub-scan-${selectedOrder.id}` ? "Scanning..." : "Confirm Hub Scan-In"}
                    </button>
                  </div>

                  <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-warning">Testing OTP</p>
                    <p className="mt-1 text-sm font-bold text-warning">{selectedOrder.dev_otp_code ?? "Hidden"}</p>
                  </div>
                </div>
              ) : null}

              {mobileOrderTab === "dispatch" ? (
                <div className="grid gap-3">
                  <button
                    onClick={() => autoAssignRider(selectedOrder.id)}
                    title={autoAssignDisabledReason() || "Ask the backend to assign a compatible available rider."}
                    disabled={Boolean(autoAssignDisabledReason())}
                    className="rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {actionLoading === `assign-auto-${selectedOrder.id}` ? "Assigning..." : "Auto-Assign Rider"}
                  </button>

                  <CustomSelect
                    value={manualRiderId}
                    onValueChange={setManualRiderId}
                    placeholder="Manual Rider Override"
                    ariaLabel="Manual rider override"
                    options={[
                      { value: "", label: "Manual Rider Override" },
                      ...riders.map((rider) => {
                        const compatible = isRiderCompatibleWithOrder(rider, selectedOrder);
                        return {
                          value: rider.user_id,
                          label: `${rider.full_name} (${rider.current_status}, ${rider.vehicle_type ? vehicleLabels[rider.vehicle_type] : "No vehicle"})${compatible ? "" : " - incompatible"}`,
                          description: compatible ? "Compatible for this package" : `Blocked for ${packageSizeLabel(selectedOrder.package_size)} package`,
                          disabled: !compatible,
                        };
                      }),
                    ]}
                    triggerClassName="h-10 rounded-lg"
                  />

                  <button
                    onClick={() => manualAssignRider(selectedOrder.id)}
                    title={manualAssignDisabledReason() || "Apply this compatible rider assignment through the backend."}
                    disabled={Boolean(manualAssignDisabledReason())}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50"
                  >
                    <LoadingButtonContent
                      loading={actionLoading === `assign-manual-${selectedOrder.id}`}
                      loadingLabel="Applying assignment"
                      label="Apply Manual Assignment"
                    />
                  </button>

                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, "out_for_delivery", "Dispatched from admin panel")}
                    title={dispatchDisabledReason() || "Dispatch this scanned package out for delivery."}
                    disabled={Boolean(dispatchDisabledReason())}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50"
                  >
                    Dispatch Out For Delivery
                  </button>

                  <label className="rounded-xl border border-border bg-card p-3 text-[10px] text-muted-foreground">
                    Proof photo for failed, return, or manual OTP override
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                      className="mt-2 block w-full text-[10px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-white"
                    />
                    {proofFile ? <span className="mt-1 block truncate">{proofFile.name}</span> : null}
                  </label>

                  <textarea
                    value={issueNote}
                    onChange={(event) => setIssueNote(event.target.value)}
                    rows={2}
                    placeholder="Failure or return note"
                    className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => markFailed(selectedOrder.id)}
                      title={failedDisabledReason() || "Mark this order failed with the current proof/note context."}
                      disabled={Boolean(failedDisabledReason())}
                      className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive disabled:opacity-50"
                    >
                      Mark Failed
                    </button>
                    <button
                      onClick={() => markReturned(selectedOrder.id)}
                      title={returnedDisabledReason() || "Return this order to the merchant with the current proof/note context."}
                      disabled={Boolean(returnedDisabledReason())}
                      className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs font-semibold text-warning disabled:opacity-50"
                    >
                      Return
                    </button>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-primary">Manual OTP Override</p>
                    <textarea
                      value={manualOtpReason}
                      onChange={(event) => setManualOtpReason(event.target.value)}
                      rows={2}
                      placeholder="Audit reason"
                      className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
                    />
                    <button
                      onClick={() => manualOtpOverride(selectedOrder.id)}
                      title={manualOtpDisabledReason() || "Apply a permission-controlled manual OTP override with proof and audit reason."}
                      disabled={!manualOtpReady || actionLoading === `manual-otp-${selectedOrder.id}`}
                      className="mt-2 w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {actionLoading === `manual-otp-${selectedOrder.id}` ? "Applying..." : "Apply Manual OTP Override"}
                    </button>
                  </div>
                </div>
              ) : null}

              {mobileOrderTab === "history" ? (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status Timeline</p>
                    <div className="mt-2 grid gap-2">
                      {(selectedOrder.status_history || []).slice().reverse().map((entry, index) => (
                        <div key={`${entry.status}-${index}`} className="border-l-2 border-primary/30 pl-3">
                          <p className="text-xs font-semibold text-foreground">{entry.status}</p>
                          <p className="text-[10px] text-muted-foreground">{entry.note || "Status updated"}</p>
                          <p className="text-[10px] text-muted-foreground">{entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "-"}</p>
                        </div>
                      ))}
                      {(!selectedOrder.status_history || selectedOrder.status_history.length === 0) ? (
                        <p className="text-[10px] text-muted-foreground">No timeline entries yet.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Audit Trail</p>
                    <div className="mt-2 grid gap-2">
                      {(selectedOrder.activity_logs || []).slice().reverse().slice(0, 8).map((entry, index) => (
                        <div key={`${entry.action}-${index}`} className="border-l-2 border-warning/40 pl-3">
                          <p className="text-xs font-semibold text-foreground">{entry.action.replace(/_/g, " ")}</p>
                          <p className="text-[10px] text-muted-foreground">{entry.note || "Action recorded"}</p>
                          <p className="text-[10px] text-muted-foreground">{entry.actor_role || "system"} - {entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</p>
                        </div>
                      ))}
                      {(!selectedOrder.activity_logs || selectedOrder.activity_logs.length === 0) ? (
                        <p className="text-[10px] text-muted-foreground">No audit entries yet.</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border bg-card px-4 py-3">
              <button
                type="button"
                onClick={printWaybill}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-semibold text-foreground"
              >
                <PrinterIcon className="h-3.5 w-3.5" />
                Waybill
              </button>
              <button
                type="button"
                onClick={() => viewOrderQr(selectedOrder)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white"
              >
                <QrCodeIcon className="h-3.5 w-3.5" />
                QR Code
              </button>
            </div>
          </div>
        ) : null}
      </div>
      )}

      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-200 ${showNewOrder ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col gap-5 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 shadow-custom sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">Create New Order</h2>
            </div>
            <button onClick={closeNewOrderModal} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none" aria-label="Close create order modal">x</button>
          </div>

          <WorkflowStepper steps={createOrderSteps} currentStep={createStep} />

          <div className="min-h-[19rem] rounded-xl border border-border bg-background/70 p-4">
            {createStep === 0 ? (
              <div className="grid gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">Choose the merchant first so the order can attach to the correct account and hub context.</p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Merchant</span>
                  <CustomSelect
                    value={createForm.merchant_id}
                    onValueChange={(nextValue) => {
                      const merchant = merchants.find((item) => item.id === nextValue);
                      setCreateForm((current) => ({
                        ...current,
                        merchant_id: nextValue,
                        pickup_address: current.pickup_address || merchant?.address || "",
                      }));
                    }}
                    placeholder="Select merchant"
                    ariaLabel="Order merchant"
                    options={[
                      { value: "", label: "Select merchant" },
                      ...merchants.map((merchant) => {
                        const issue = merchantReadinessIssue(merchant, user);
                        return {
                          value: merchant.id,
                          label: issue ? `${merchant.shop_name || merchant.merchant_name} - blocked` : merchant.shop_name || merchant.merchant_name,
                          description: issue || "Ready for order creation",
                          disabled: Boolean(issue),
                        };
                      }),
                    ]}
                    triggerClassName="h-10 rounded-lg"
                  />
                </label>
                {selectedCreateMerchantIssue ? (
                  <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                    {selectedCreateMerchantIssue}
                  </div>
                ) : null}
              </div>
            ) : null}

            {createStep === 1 ? (
              <div className="grid gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">Pickup and drop-off locations drive the automatic Wolan KM-based delivery fee.</p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Customer Name</span>
                  <input value={createForm.customer_name} onChange={(event) => setCreateForm((current) => ({ ...current, customer_name: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Customer Phone</span>
                  <input value={createForm.customer_phone} onChange={(event) => setCreateForm((current) => ({ ...current, customer_phone: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Pickup Location</span>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input value={createForm.pickup_address} onChange={(event) => setCreateForm((current) => ({ ...current, pickup_address: event.target.value }))} placeholder="Merchant shop, hub, or pickup address" className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                    <button type="button" onClick={() => lookupOrderAddress("pickup")} disabled={addressLookupLoading !== null} title="Resolve this pickup address with OpenRouteService." className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50">
                      {addressLookupLoading === "pickup" ? "Looking..." : "Lookup"}
                    </button>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Drop-off Location</span>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input value={createForm.delivery_address} onChange={(event) => setCreateForm((current) => ({ ...current, delivery_address: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                    <button type="button" onClick={() => lookupOrderAddress("dropoff")} disabled={addressLookupLoading !== null} title="Resolve this drop-off address with OpenRouteService." className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50">
                      {addressLookupLoading === "dropoff" ? "Looking..." : "Lookup"}
                    </button>
                  </div>
                </label>
                <details className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-primary">
                    <span className="inline-flex items-center gap-2">
                      <MapPinIcon className="h-4 w-4" />
                      Optional GPS override
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">Map provider resolves blank fields</span>
                  </summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input inputMode="decimal" value={createForm.pickup_latitude} onChange={(event) => setCreateForm((current) => ({ ...current, pickup_latitude: event.target.value }))} placeholder="Pickup latitude" className="bg-input rounded-lg border border-border px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary" />
                    <input inputMode="decimal" value={createForm.pickup_longitude} onChange={(event) => setCreateForm((current) => ({ ...current, pickup_longitude: event.target.value }))} placeholder="Pickup longitude" className="bg-input rounded-lg border border-border px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary" />
                    <input inputMode="decimal" value={createForm.dropoff_latitude} onChange={(event) => setCreateForm((current) => ({ ...current, dropoff_latitude: event.target.value }))} placeholder="Drop-off latitude" className="bg-input rounded-lg border border-border px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary" />
                    <input inputMode="decimal" value={createForm.dropoff_longitude} onChange={(event) => setCreateForm((current) => ({ ...current, dropoff_longitude: event.target.value }))} placeholder="Drop-off longitude" className="bg-input rounded-lg border border-border px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary" />
                  </div>
                </details>
              </div>
            ) : null}

            {createStep === 2 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">Package size affects rider compatibility, so keep it explicit before auto-dispatch.</p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Zone</span>
                  <input value={createForm.delivery_zone} onChange={(event) => setCreateForm((current) => ({ ...current, delivery_zone: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Batch Group (Optional)</span>
                  <input value={createForm.batch_id} onChange={(event) => setCreateForm((current) => ({ ...current, batch_id: event.target.value }))} placeholder="Example: KLA-MORNING-01" className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Item Description</span>
                  <input value={createForm.item_description} onChange={(event) => setCreateForm((current) => ({ ...current, item_description: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Package Size</span>
                  <CustomSelect
                    value={createForm.package_size}
                    onValueChange={(nextValue) => setCreateForm((current) => ({ ...current, package_size: nextValue as PackageSize }))}
                    ariaLabel="Package size"
                    options={packageSizeOptions.map((size) => ({
                      value: size.value,
                      label: size.label,
                    }))}
                    triggerClassName="h-10 rounded-lg"
                  />
                </label>
              </div>
            ) : null}

            {createStep === 3 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">Delivery fee is backend-calculated from GPS distance. Admin and merchants cannot edit it manually.</p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Declared Value (UGX)</span>
                  <input type="number" min="0" value={createForm.declared_value} onChange={(event) => setCreateForm((current) => ({ ...current, declared_value: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">COD Amount (UGX)</span>
                  <input type="number" min="0" value={createForm.cod_amount} onChange={(event) => setCreateForm((current) => ({ ...current, cod_amount: event.target.value }))} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Service Level</span>
                  <CustomSelect
                    value={createForm.service_level}
                    onValueChange={(nextValue) => setCreateForm((current) => ({ ...current, service_level: nextValue as "standard" | "express" }))}
                    ariaLabel="Delivery service level"
                    options={[
                      { value: "standard", label: "Standard delivery" },
                      { value: "express", label: "Express delivery - 1 hour request" },
                    ]}
                    triggerClassName="h-10 rounded-lg"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Dispatch Mode</span>
                  <CustomSelect
                    value={createForm.dispatch_mode}
                    onValueChange={(nextValue) => setCreateForm((current) => ({ ...current, dispatch_mode: nextValue as CreateOrderForm["dispatch_mode"] }))}
                    ariaLabel="Dispatch mode"
                    options={[
                      { value: "create_only", label: "Create manual pending order", description: "Creates the order without assigning a rider." },
                      { value: "auto_assign", label: "Auto-assign nearest rider", description: "Backend chooses the best compatible available rider." },
                    ]}
                    triggerClassName="h-10 rounded-lg"
                  />
                </label>
                <button type="button" onClick={estimateOrderPricing} disabled={pricingLoading} className="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary disabled:opacity-50">
                  {pricingLoading ? <LoaderGlyph size="xs" label="Calculating delivery fee" /> : null}
                  Calculate delivery fee
                </button>
                <div className="rounded-xl border border-border bg-card px-3 py-3 sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Automatic Wolan pricing</p>
                  <p className="mt-1 text-lg font-black text-primary">UGX {formatUGX(pricingEstimate?.delivery_fee || 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pricingEstimate ? `${pricingEstimate.pricing_tier_label} | ${pricingEstimate.pricing_distance_km.toFixed(2)} KM | ${pricingEstimate.service_level === "express" ? "Express 1-hour request" : "Standard service"}` : "Enter pickup and drop-off locations, then calculate fee."}
                  </p>
                </div>
              </div>
            ) : null}

            {createStep === 4 ? (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="rounded-xl bg-muted px-3 py-2">Merchant: <span className="font-semibold text-foreground">{merchants.find((merchant) => merchant.id === createForm.merchant_id)?.shop_name || "Not selected"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Customer: <span className="font-semibold text-foreground">{createForm.customer_name || "-"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">Pickup: <span className="font-semibold text-foreground">{createForm.pickup_address || "-"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">Drop-off: <span className="font-semibold text-foreground">{createForm.delivery_address || "-"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">Route GPS: <span className="font-semibold text-foreground">{createForm.pickup_latitude && createForm.pickup_longitude && createForm.dropoff_latitude && createForm.dropoff_longitude ? `${createForm.pickup_latitude}, ${createForm.pickup_longitude} to ${createForm.dropoff_latitude}, ${createForm.dropoff_longitude}` : "Resolved automatically by the map provider"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Package: <span className="font-semibold text-foreground">{packageSizeLabel(createForm.package_size)}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Zone: <span className="font-semibold text-foreground">{createForm.delivery_zone || "-"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Batch: <span className="font-semibold text-foreground">{createForm.batch_id.trim() || "Single order"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Service: <span className="font-semibold text-foreground">{createForm.service_level === "express" ? "Express 1-hour request" : "Standard"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Dispatch: <span className="font-semibold text-foreground">{createForm.dispatch_mode === "auto_assign" ? "Auto-assign nearest rider" : "Manual pending order"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Distance: <span className="font-semibold text-foreground">{pricingEstimate ? `${pricingEstimate.pricing_distance_km.toFixed(2)} KM` : "-"}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">COD: <span className="font-semibold text-warning">UGX {formatUGX(Number(createForm.cod_amount || 0))}</span></div>
                <div className="rounded-xl bg-muted px-3 py-2">Fee: <span className="font-semibold text-primary">UGX {formatUGX(pricingEstimate?.delivery_fee || 0)}</span></div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
            <button onClick={closeNewOrderModal} className="rounded-lg bg-muted px-4 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent">Cancel</button>
            <button
              onClick={() => setCreateStep((current) => Math.max(current - 1, 0))}
              title={createStep === 0 ? "You are already on the first create-order step." : actionLoading === "create-order" ? "Order creation is being submitted." : "Go back to the previous create-order step."}
              disabled={createStep === 0 || actionLoading === "create-order"}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <ArrowLeftIcon className="mr-2 h-3.5 w-3.5" />
              Back
            </button>
            <button
              onClick={createStep === createOrderSteps.length - 1 ? createOrder : continueCreateWizard}
              title={actionLoading === "create-order" ? "Order creation is being submitted." : pricingLoading ? "Delivery fee is being calculated." : createStep === createOrderSteps.length - 1 && !pricingEstimate ? "Calculate the automatic delivery fee before creating this order." : selectedCreateMerchantIssue || (createStep === createOrderSteps.length - 1 ? (createForm.dispatch_mode === "auto_assign" ? "Create this order and ask the backend to auto-dispatch." : "Create this manual pending order for later dispatch.") : "Continue to the next create-order step.")}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
              disabled={actionLoading === "create-order" || pricingLoading || (createStep === createOrderSteps.length - 1 && (!pricingEstimate || Boolean(selectedCreateMerchantIssue)))}
            >
              {actionLoading === "create-order" || pricingLoading ? <LoaderGlyph size="xs" label="Saving order" /> : null}
              {createStep === createOrderSteps.length - 1 ? (createForm.dispatch_mode === "auto_assign" ? "Create & Auto-Assign" : "Create Manual Order") : "Continue"}
              {createStep === createOrderSteps.length - 1 ? null : <ArrowRightIcon className="ml-2 h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
