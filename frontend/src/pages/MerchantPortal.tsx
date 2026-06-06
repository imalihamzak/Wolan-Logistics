import { useEffect, useMemo, useState } from "react";
import AppLoader, { LoaderGlyph, LoadingButtonContent } from "../components/AppLoader";
import { MerchantDashboardSkeleton } from "../components/DashboardSkeletons";
import Header from "../components/Header";
import { CustomSelect } from "../components/ui/custom-select";
import GuidedEmptyState from "../components/GuidedEmptyState";
import SupportPanel from "../components/SupportPanel";
import WorkflowStepper from "../components/WorkflowStepper";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { connectRealtimeSocket } from "../lib/realtime";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MapPinIcon,
  PackageIcon,
  QrCodeIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  StoreIcon,
  TruckIcon,
  UploadCloudIcon,
  WalletIcon,
  XCircleIcon,
} from "lucide-react";

type OrderStatus = "pending" | "picked_up" | "at_hub" | "out_for_delivery" | "delivered" | "failed" | "returned";
type PackageSize = "small" | "medium" | "large" | "oversized";

type MerchantProfile = {
  id: string;
  merchant_name: string;
  shop_name: string;
  phone: string;
  email: string;
  address?: string | null;
  referral_code: string;
  tier_level: string;
  cod_balance: number;
  earnings: number;
  qr_code?: string | null;
  kyc_status?: MerchantKycStatus;
  kyc_rejection_reason?: string | null;
  kyc_submission?: MerchantKycSubmission | null;
  policy_acceptances?: PolicyAcceptanceRecord[];
  account_locked?: boolean;
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

type MerchantKycSubmission = {
  legal_business_name?: string | null;
  business_registration_number?: string | null;
  tin_number?: string | null;
  owner_full_name?: string | null;
  owner_id_number?: string | null;
  owner_phone?: string | null;
  document_links?: string[];
  document_uploads?: MerchantKycDocumentUpload[];
  document_notes?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  reviewed_at?: string | null;
};

type MerchantKycStatus = "unverified" | "not_submitted" | "pending" | "pending_review" | "verified" | "rejected";

type MerchantKycDocumentType = "business_registration" | "tax_certificate" | "owner_id" | "shop_photo";

type MerchantKycDocumentUpload = {
  type: MerchantKycDocumentType | string;
  label: string;
  upload_id?: string | null;
  file_name?: string | null;
  url?: string | null;
  uploaded_at?: string | null;
};

type MerchantKycForm = {
  legal_business_name: string;
  business_registration_number: string;
  tin_number: string;
  owner_full_name: string;
  owner_id_number: string;
  owner_phone: string;
  document_links: string;
  document_notes: string;
};

type MerchantDashboardPayload = {
  merchant: MerchantProfile;
  dashboard: {
    referralCount: number;
    total_deliveries: number;
    cod_balance: number;
    earnings: number;
  };
};

type OrderRecord = {
  id: string;
  order_id: string;
  merchant_id?: string | { id?: string; _id?: string } | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  item_description: string;
  package_size?: PackageSize;
  declared_value: number;
  cod_amount: number;
  delivery_fee: number;
  pricing_currency?: string;
  pricing_distance_km?: number | null;
  pricing_source?: string | null;
  pricing_tier_label?: string | null;
  service_level?: "standard" | "express";
  express_requested?: boolean;
  delivery_zone: string;
  order_status: OrderStatus;
  merchant_status?: string;
  merchant_status_key?: string;
  pickup_key?: string;
  package_tracking_id: string;
  rider_tracking_id: string;
  assignment_response_status?: "pending" | "accepted" | "rejected" | "expired" | null;
  handover_verified?: boolean;
  hub_scan_in?: string | null;
  status_history?: Array<{ status: string; note?: string | null; updated_at?: string; updated_by_role?: string }>;
  createdAt?: string;
};

type CreateOrderForm = {
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  delivery_address: string;
  pickup_latitude: string;
  pickup_longitude: string;
  dropoff_latitude: string;
  dropoff_longitude: string;
  item_description: string;
  package_size: PackageSize;
  service_level: "standard" | "express";
  delivery_zone: string;
  declared_value: string;
  cod_amount: string;
};

const emptyOrderForm = (): CreateOrderForm => ({
  customer_name: "",
  customer_phone: "",
  pickup_address: "",
  delivery_address: "",
  pickup_latitude: "",
  pickup_longitude: "",
  dropoff_latitude: "",
  dropoff_longitude: "",
  item_description: "",
  package_size: "medium",
  service_level: "standard",
  delivery_zone: "CBD",
  declared_value: "0",
  cod_amount: "0",
});

type PricingEstimate = {
  delivery_fee: number;
  pricing_currency?: string;
  pricing_distance_km: number;
  pricing_source?: string;
  pricing_tier_label?: string;
  service_level?: "standard" | "express";
  express_requested?: boolean;
};

const emptyKycForm = (): MerchantKycForm => ({
  legal_business_name: "",
  business_registration_number: "",
  tin_number: "",
  owner_full_name: "",
  owner_id_number: "",
  owner_phone: "",
  document_links: "",
  document_notes: "",
});

const statusConfig: Record<OrderStatus, { label: string; classes: string; icon: typeof ClockIcon }> = {
  pending: { label: "Pending", classes: "text-muted-foreground bg-muted border-border", icon: ClockIcon },
  picked_up: { label: "Picked Up", classes: "text-chart-2 bg-chart-2/10 border-chart-2/20", icon: PackageIcon },
  at_hub: { label: "At Hub", classes: "text-warning bg-warning/10 border-warning/20", icon: PackageIcon },
  out_for_delivery: { label: "Out for Delivery", classes: "text-primary bg-primary/10 border-primary/20", icon: TruckIcon },
  delivered: { label: "Delivered", classes: "text-success bg-success/10 border-success/20", icon: CheckCircleIcon },
  failed: { label: "Failed", classes: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircleIcon },
  returned: { label: "Returned", classes: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircleIcon },
};

const formatUGX = (value?: number | null) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));
const isQrDataUrl = (value?: string | null) => Boolean(value && /^data:image\/png;base64,/i.test(value));

const packageSizeOptions: Array<{ label: string; value: PackageSize }> = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Oversized", value: "oversized" },
];

const packageSizeLabel = (value?: string | null) => (
  packageSizeOptions.find((item) => item.value === value)?.label || "Medium"
);

const orderWizardSteps = [
  { label: "Customer", helper: "Who receives it." },
  { label: "Package", helper: "What is moving." },
  { label: "Payment", helper: "COD and auto fee." },
  { label: "Review", helper: "Confirm details." },
];

const merchantKycSteps = [
  { label: "Business", helper: "Registration details." },
  { label: "Owner", helper: "Identity contact." },
  { label: "Documents", helper: "Upload files." },
  { label: "Review", helper: "Submit to admin." },
];

const merchantKycDocumentOptions: Array<{ type: MerchantKycDocumentType; label: string; helper: string }> = [
  { type: "business_registration", label: "Business Registration", helper: "Certificate, trading license, or company registration." },
  { type: "tax_certificate", label: "TIN / Tax Certificate", helper: "Tax identity proof for payout and COD review." },
  { type: "owner_id", label: "Owner National ID / Passport", helper: "Owner identity document for admin verification." },
  { type: "shop_photo", label: "Shop Photo / Storefront", helper: "Photo or proof of physical business location." },
];

const kycStatusConfig: Record<MerchantKycStatus, { label: string; helper: string; classes: string; textClass: string }> = {
  unverified: {
    label: "Unverified",
    helper: "Upload documents to activate order creation.",
    classes: "border-warning/20 bg-warning/10 text-warning",
    textClass: "text-warning",
  },
  not_submitted: {
    label: "Unverified",
    helper: "Upload documents to activate order creation.",
    classes: "border-warning/20 bg-warning/10 text-warning",
    textClass: "text-warning",
  },
  pending: {
    label: "Pending Review",
    helper: "Submitted and waiting for admin review.",
    classes: "border-primary/20 bg-primary/10 text-primary",
    textClass: "text-primary",
  },
  pending_review: {
    label: "Pending Review",
    helper: "Submitted and waiting for admin review.",
    classes: "border-primary/20 bg-primary/10 text-primary",
    textClass: "text-primary",
  },
  verified: {
    label: "Approved",
    helper: "Merchant account is verified and operational.",
    classes: "border-success/20 bg-success/10 text-success",
    textClass: "text-success",
  },
  rejected: {
    label: "Rejected",
    helper: "Upload corrected documents and resubmit.",
    classes: "border-destructive/20 bg-destructive/10 text-destructive",
    textClass: "text-destructive",
  },
};

const normalizeMerchantKycStatus = (status?: string | null): MerchantKycStatus => {
  if (status === "pending") return "pending_review";
  if (status === "not_submitted") return "unverified";
  if (status === "unverified" || status === "pending_review" || status === "verified" || status === "rejected") return status;
  return "unverified";
};

const merchantStatusClasses: Record<string, string> = {
  heading_to_hub: "text-primary",
  package_at_hub: "text-warning",
  out_for_delivery: "text-chart-2",
  delivered: "text-success",
  failed: "text-destructive",
  returned: "text-destructive",
  pending: "text-muted-foreground",
};

const readId = (value: string | { id?: string; _id?: string; value?: string } | null | undefined) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || value._id || value.value || null;
};

const getMerchantStatus = (order?: OrderRecord | null) => (
  order?.merchant_status || (order ? statusConfig[order.order_status].label : "Pending")
);

const getMerchantStatusClass = (order?: OrderRecord | null) => (
  merchantStatusClasses[order?.merchant_status_key || "pending"] || "text-muted-foreground"
);

type MerchantPortalScreen = "dashboard" | "orders" | "new-order" | "order-details" | "kyc" | "support";
type MerchantHomeView = "actions" | "orders" | "profile";
type MerchantOrderView = "handover" | "details" | "history";
type MerchantKycView = "status" | "documents";

interface MerchantPortalProps {
  screen?: MerchantPortalScreen;
}

export default function MerchantPortal({ screen = "dashboard" }: MerchantPortalProps) {
  const { user, fetchUser } = useAuth();
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [dashboard, setDashboard] = useState<MerchantDashboardPayload | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateOrderForm>(emptyOrderForm());
  const [kycForm, setKycForm] = useState<MerchantKycForm>(emptyKycForm());
  const [merchantDocumentFiles, setMerchantDocumentFiles] = useState<Partial<Record<MerchantKycDocumentType, File>>>({});
  const [orderStep, setOrderStep] = useState(0);
  const [kycStep, setKycStep] = useState(0);
  const [pickupKeyInput, setPickupKeyInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailFetchAttempted, setDetailFetchAttempted] = useState<string | null>(null);
  const [merchantPolicies, setMerchantPolicies] = useState<PolicyDocument[]>([]);
  const [pricingEstimate, setPricingEstimate] = useState<PricingEstimate | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [addressLookupLoading, setAddressLookupLoading] = useState<"pickup" | "dropoff" | null>(null);
  const [merchantHomeView, setMerchantHomeView] = useState<MerchantHomeView>("actions");
  const [merchantOrderView, setMerchantOrderView] = useState<MerchantOrderView>("handover");
  const [merchantKycView, setMerchantKycView] = useState<MerchantKycView>("status");

  const selectedOrder = useMemo(
    () => {
      const routedOrder = orderId
        ? orders.find((order) => order.id === orderId || order.order_id === orderId)
        : null;
      if (orderId) {
        return routedOrder ?? null;
      }

      return selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : orders[0] ?? null;
    },
    [orderId, orders, selectedOrderId]
  );
  const merchant = dashboard?.merchant;
  const merchantId = merchant?.id || user?.id || null;
  const merchantKycStatus = normalizeMerchantKycStatus(merchant?.kyc_status || user?.kyc_status);
  const merchantKycConfig = kycStatusConfig[merchantKycStatus];
  const merchantPolicyAcceptances = merchant?.policy_acceptances || [];
  const merchantRequiredPolicies = merchantPolicies.filter((policy) => policy.required);
  const merchantUnavailableRequiredPolicies = merchantRequiredPolicies.filter((policy) => policy.file_available === false);
  const merchantLegalComplete = merchantPolicies.length > 0
    ? merchantRequiredPolicies
      .every((policy) => merchantPolicyAcceptances.some((acceptance) => (
        acceptance.key === policy.key
        && acceptance.version === policy.version
        && acceptance.file_name === policy.file_name
      )))
    : merchantPolicyAcceptances.length >= 3;
  const merchantCanCreateOrders = merchantKycStatus === "verified";
  const merchantKycEditable = merchantKycStatus !== "verified";
  const submittedDocumentUploads = merchant?.kyc_submission?.document_uploads || [];
  const missingRequiredMerchantKycDocuments = () => merchantKycDocumentOptions
    .filter((option) => !submittedDocumentUploads.some((document) => document.type === option.type && document.upload_id) && !merchantDocumentFiles[option.type])
    .map((option) => option.label);
  const orderBackDisabledReason = () => {
    if (actionLoading === "create-order") return "Order creation is being submitted.";
    if (orderStep === 0) return "You are already on the first order step.";
    return undefined;
  };
  const createOrderDisabledReason = () => {
    if (actionLoading === "create-order") return "Order creation is being submitted.";
    if (pricingLoading) return "Delivery fee is being calculated.";
    if (orderStep === orderWizardSteps.length - 1 && merchantUnavailableRequiredPolicies.length > 0) return "Required merchant policy files are unavailable on the server.";
    if (orderStep === orderWizardSteps.length - 1 && !merchantLegalComplete) return "Merchant legal agreements must be accepted before creating orders.";
    if (orderStep === orderWizardSteps.length - 1 && !merchantCanCreateOrders) return "Merchant KYC must be verified before creating orders.";
    if (orderStep === orderWizardSteps.length - 1 && !pricingEstimate) return "Calculate the automatic delivery fee before creating the order.";
    return undefined;
  };
  const orderReadinessItems = [
    {
      label: "Merchant KYC verified",
      complete: merchantCanCreateOrders,
      helper: merchantCanCreateOrders ? "Approved" : merchantKycConfig.label,
    },
    {
      label: "Legal agreements accepted",
      complete: merchantLegalComplete && merchantUnavailableRequiredPolicies.length === 0,
      helper: merchantUnavailableRequiredPolicies.length > 0
        ? "Policy files unavailable"
        : merchantLegalComplete ? "Accepted" : "Required",
    },
    {
      label: "Automatic pricing calculated",
      complete: Boolean(pricingEstimate),
      helper: pricingEstimate
        ? `${pricingEstimate.pricing_tier_label} | ${pricingEstimate.pricing_distance_km.toFixed(2)} KM`
        : "Calculate before review",
    },
  ];
  const handoverDisabledReason = () => {
    if (!selectedOrder) return "Select an order before confirming handover.";
    if (actionLoading === "confirm-handover") return "Handover confirmation is being submitted.";
    if (selectedOrder.order_status !== "pending") return "Handover confirmation is allowed only while the order is pending pickup.";
    if (selectedOrder.assignment_response_status !== "accepted") return "Rider must accept the assignment before merchant handover.";
    return undefined;
  };

  useEffect(() => {
    if (screen === "kyc" && merchantKycStatus === "rejected") {
      setMerchantKycView("documents");
    }
  }, [merchantKycStatus, screen]);

  useEffect(() => {
    setPricingEstimate(null);
  }, [
    form.pickup_address,
    form.delivery_address,
    form.pickup_latitude,
    form.pickup_longitude,
    form.dropoff_latitude,
    form.dropoff_longitude,
    form.service_level,
  ]);

  const loadMerchantWorkspace = async () => {
    setLoading(true);
    try {
      const [dashboardResponse, ordersResponse] = await Promise.all([
        api.get("/auth/merchants/dashboard"),
        api.get("/auth/orders", { params: { limit: 50 } }),
      ]);

      const dashboardData = dashboardResponse.data?.data as MerchantDashboardPayload;
      const orderItems = (ordersResponse.data?.data?.orders || []) as OrderRecord[];

      setDashboard(dashboardData);
      setOrders(orderItems);
      setSelectedOrderId((current) => current && orderItems.some((order) => order.id === current) ? current : orderItems[0]?.id ?? null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to load merchant workspace");
    } finally {
      setLoading(false);
    }
  };

  const updateMerchantQrInDashboard = (payload: any) => {
    if (!isQrDataUrl(payload?.qr_code)) {
      toast.error("Merchant QR code could not be generated");
      return false;
    }

    setDashboard((current) => current ? {
      ...current,
      merchant: {
        ...current.merchant,
        qr_code: payload.qr_code,
        referral_code: payload.referral_code || current.merchant.referral_code,
        shop_name: payload.shop_name || current.merchant.shop_name,
        merchant_name: payload.merchant_name || current.merchant.merchant_name,
      },
    } : current);
    return true;
  };

  const refreshMerchantQrCode = async (force = false) => {
    setActionLoading(force ? "qr-regenerate" : "qr-refresh");
    try {
      const { data } = force
        ? await api.post("/auth/merchants/qr-code")
        : await api.get("/auth/merchants/qr-code");
      if (updateMerchantQrInDashboard(data?.data)) {
        toast.success(force ? "Merchant QR code regenerated" : "Merchant QR code loaded");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to load merchant QR code");
    } finally {
      setActionLoading(null);
    }
  };

  const downloadMerchantQrCode = () => {
    if (!isQrDataUrl(merchant?.qr_code)) {
      toast.error("Load the merchant QR code before downloading");
      return;
    }

    const link = window.document.createElement("a");
    link.href = merchant.qr_code as string;
    link.download = `${merchant.shop_name || merchant.merchant_name || "merchant"}-qr.png`.replace(/[^a-z0-9_.-]+/gi, "-");
    link.rel = "noopener noreferrer";
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const loadMerchantPolicies = async () => {
    try {
      const { data } = await api.get("/auth/policies", { params: { audience: "merchant" } });
      setMerchantPolicies(data?.data?.policies || data?.policies || []);
    } catch (error) {
      setMerchantPolicies([]);
    }
  };

  useEffect(() => {
    loadMerchantPolicies();
  }, []);

  useEffect(() => {
    setPricingEstimate(null);
  }, [
    form.pickup_address,
    form.delivery_address,
    form.pickup_latitude,
    form.pickup_longitude,
    form.dropoff_latitude,
    form.dropoff_longitude,
    form.service_level,
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
    const pickupCoordinates = buildCoordinatePair(form.pickup_latitude, form.pickup_longitude);
    const dropoffCoordinates = buildCoordinatePair(form.dropoff_latitude, form.dropoff_longitude);
    return {
      pickup_address: form.pickup_address,
      dropoff_address: form.delivery_address,
      delivery_address: form.delivery_address,
      ...(pickupCoordinates ? { pickup_coordinates: pickupCoordinates } : {}),
      ...(dropoffCoordinates ? { dropoff_coordinates: dropoffCoordinates } : {}),
      service_level: form.service_level,
    };
  };

  const hasValidPricingCoordinates = () => {
    const pickupCoordinates = buildCoordinatePair(form.pickup_latitude, form.pickup_longitude);
    const dropoffCoordinates = buildCoordinatePair(form.dropoff_latitude, form.dropoff_longitude);
    return Boolean(form.pickup_address.trim() && form.delivery_address.trim())
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
    const query = field === "pickup" ? form.pickup_address : form.delivery_address;
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

      setForm((current) => ({
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

  const acceptMerchantPolicies = async () => {
    const requiredPolicyKeys = merchantRequiredPolicies.map((policy) => policy.key);
    if (requiredPolicyKeys.length === 0) {
      toast.error("Merchant policy documents are not loaded yet");
      return;
    }
    if (merchantUnavailableRequiredPolicies.length > 0) {
      toast.error("Required merchant policy files are unavailable on the server. Redeploy the Policy folder first.");
      return;
    }

    setActionLoading("accept-policies");
    try {
      await api.post("/auth/policies/accept", { accepted_policy_keys: requiredPolicyKeys });
      toast.success("Merchant legal agreements accepted");
      await Promise.all([loadMerchantWorkspace(), fetchUser()]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Policy acceptance failed");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    loadMerchantWorkspace();
  }, []);

  useEffect(() => {
    if (!merchant) {
      return;
    }

    setForm((current) => (
      current.pickup_address
        ? current
        : { ...current, pickup_address: merchant.address || merchant.shop_name || "" }
    ));

    const submission = merchant.kyc_submission;
    setKycForm({
      legal_business_name: submission?.legal_business_name || merchant.merchant_name || "",
      business_registration_number: submission?.business_registration_number || "",
      tin_number: submission?.tin_number || "",
      owner_full_name: submission?.owner_full_name || merchant.merchant_name || "",
      owner_id_number: submission?.owner_id_number || "",
      owner_phone: submission?.owner_phone || merchant.phone || "",
      document_links: (submission?.document_links || []).join("\n"),
      document_notes: submission?.document_notes || "",
    });
  }, [merchant?.id, merchant?.kyc_submission?.updated_at]);

  useEffect(() => {
    if (screen === "kyc" && merchantKycStatus === "rejected") {
      setKycStep(2);
    }
  }, [merchantKycStatus, screen]);

  useEffect(() => {
    setPickupKeyInput("");
  }, [selectedOrderId, orderId]);

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
    if (screen !== "order-details" || !orderId || loading || orderDetailLoading || detailFetchAttempted === orderId) {
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
        // The detail screen shows a not-found state if the backend does not return this order.
      })
      .finally(() => {
        setOrderDetailLoading(false);
      });
  }, [detailFetchAttempted, loading, orderDetailLoading, orderId, orders, screen]);

  useEffect(() => {
    if (!merchantId) {
      return;
    }

    let disconnected = false;
    let socket: Awaited<ReturnType<typeof connectRealtimeSocket>> | null = null;

    const applyOrderUpdate = (incoming: OrderRecord) => {
      if (!incoming?.id) {
        return;
      }

      const incomingMerchantId = readId(incoming.merchant_id);
      if (incomingMerchantId && incomingMerchantId !== merchantId) {
        return;
      }

      setOrders((currentOrders) => {
        const exists = currentOrders.some((order) => order.id === incoming.id);
        if (!exists) {
          return [incoming, ...currentOrders];
        }

        return currentOrders.map((order) => (order.id === incoming.id ? { ...order, ...incoming } : order));
      });

      setSelectedOrderId((currentId) => currentId || incoming.id);
    };

    const handleOrderEvent = (payload: any) => {
      const payloadOrders = Array.isArray(payload?.orders) ? payload.orders : null;
      if (payloadOrders) {
        payloadOrders.forEach(applyOrderUpdate);
        return;
      }

      applyOrderUpdate((payload?.order || payload) as OrderRecord);
    };

    const handleKycEvent = (payload: any) => {
      const updatedMerchant = payload?.merchant || payload;
      if (!updatedMerchant?.id && !updatedMerchant?._id) {
        return;
      }

      const updatedMerchantId = updatedMerchant.id || updatedMerchant._id;
      if (updatedMerchantId !== merchantId) {
        return;
      }

      setDashboard((current) => current ? {
        ...current,
        merchant: {
          ...current.merchant,
          ...updatedMerchant,
          id: updatedMerchant.id || updatedMerchant._id || current.merchant.id,
        },
      } : current);
      fetchUser();
    };

    const eventNames = [
      "order:created",
      "merchant:order-status-updated",
      "order:pickup-agent-assigned",
      "order:assigned",
      "order:rider-accepted",
      "order:assignment-responded",
      "order:hub-scanned-in",
      "order:package-at-hub",
      "order:status-updated",
      "order:otp-verified",
      "order:failed",
      "order:returned",
    ];
    const kycEventNames = [
      "merchant:kyc-updated",
      "merchant:kyc-submitted",
      "merchant:kyc-approved",
      "merchant:kyc-rejected",
    ];

    connectRealtimeSocket()
      .then((nextSocket) => {
        if (disconnected) {
          nextSocket.disconnect();
          return;
        }

        socket = nextSocket;
        socket.emit("join:merchant", merchantId);
        orders.forEach((order) => socket?.emit("subscribe:order", order.id));
        eventNames.forEach((eventName) => socket?.on(eventName, handleOrderEvent));
        kycEventNames.forEach((eventName) => socket?.on(eventName, handleKycEvent));
      })
      .catch(() => {
        // The API remains the source of truth through normal refresh if live transport is unavailable.
      });

    return () => {
      disconnected = true;
      if (socket) {
        eventNames.forEach((eventName) => socket?.off(eventName, handleOrderEvent));
        kycEventNames.forEach((eventName) => socket?.off(eventName, handleKycEvent));
        socket.disconnect();
      }
    };
  }, [merchantId]);

  const createOrder = async () => {
    if (!merchantLegalComplete) {
      toast.error("Merchant legal agreements must be accepted before creating orders");
      return;
    }

    if (!merchantCanCreateOrders) {
      toast.error("Merchant KYC must be verified before creating orders");
      return;
    }

    if (!form.customer_name || !form.customer_phone || !form.pickup_address || !form.delivery_address || !form.item_description || !form.delivery_zone) {
      toast.error("Fill all required order fields");
      return;
    }

    const pricing = await ensurePricingEstimate();
    if (!pricing) {
      return;
    }

    setActionLoading("create-order");
    try {
      const { data } = await api.post("/auth/orders", {
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        pickup_address: form.pickup_address,
        dropoff_address: form.delivery_address,
        delivery_address: form.delivery_address,
        item_description: form.item_description,
        package_size: form.package_size,
        delivery_zone: form.delivery_zone,
        service_level: form.service_level,
        ...pricingCoordinatePayload(),
        declared_value: Number(form.declared_value || 0),
        cod_amount: Number(form.cod_amount || 0),
        hub_id: readId(user?.hub_id) || undefined,
      });

      toast.success("Order created");
      setForm({ ...emptyOrderForm(), pickup_address: merchant?.address || merchant?.shop_name || "" });
      setOrderStep(0);
      await loadMerchantWorkspace();
      const createdOrderId = data?.data?.order?.id;
      if (createdOrderId) {
        setSelectedOrderId(createdOrderId);
        navigate(`/merchant/orders/${createdOrderId}`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Order creation failed");
    } finally {
      setActionLoading(null);
    }
  };

  const validateOrderStep = (step = orderStep) => {
    const requiredByStep: Record<number, Array<[keyof CreateOrderForm, string]>> = {
      0: [
        ["customer_name", "Customer name"],
        ["customer_phone", "Customer phone"],
        ["pickup_address", "Pickup location"],
        ["delivery_address", "Drop-off location"],
      ],
      1: [
        ["item_description", "Item description"],
        ["delivery_zone", "Delivery zone"],
      ],
    };

    const missingField = (requiredByStep[step] || []).find(([field]) => !String(form[field] || "").trim());
    if (missingField) {
      toast.error(`${missingField[1]} is required`);
      return false;
    }

    return true;
  };

  const continueOrderWizard = () => {
    if (!validateOrderStep()) {
      return;
    }

    if (orderStep === 2 && !pricingEstimate) {
      void estimateOrderPricing().then((pricing) => {
        if (pricing) {
          setOrderStep((current) => Math.min(current + 1, orderWizardSteps.length - 1));
        }
      });
      return;
    }

    setOrderStep((current) => Math.min(current + 1, orderWizardSteps.length - 1));
  };

  const confirmHandover = async () => {
    if (!selectedOrder) {
      toast.error("Select an order first");
      return;
    }

    const pickupKey = pickupKeyInput.trim();
    if (!/^\d{4}$/.test(pickupKey)) {
      toast.error("Pickup key must be exactly 4 digits");
      return;
    }

    setActionLoading("confirm-handover");
    try {
      await api.post(`/auth/orders/${selectedOrder.id}/confirm-handover`, {
        pickup_key: pickupKey,
      });

      toast.success("Handover confirmed");
      const currentOrderId = selectedOrder.id;
      setPickupKeyInput("");
      await loadMerchantWorkspace();
      setSelectedOrderId(currentOrderId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Handover confirmation failed");
    } finally {
      setActionLoading(null);
    }
  };

  const existingMerchantKycDocument = (type: MerchantKycDocumentType) => (
    submittedDocumentUploads.find((document) => document.type === type) || null
  );

  const openMerchantKycDocument = async (document: MerchantKycDocumentUpload | null, label: string) => {
    if (!document) {
      toast.error(`${label} is not uploaded yet`);
      return;
    }

    if (!document.upload_id) {
      if (document.url?.startsWith("http")) {
        window.open(document.url, "_blank", "noopener,noreferrer");
        return;
      }

      toast.error(`${label} cannot be opened because the upload reference is missing`);
      return;
    }

    const previewWindow = window.open("", "_blank", "noopener,noreferrer");
    try {
      const response = await api.get(`/auth/uploads/${String(document.upload_id)}`, { responseType: "blob" });
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

  const uploadMerchantKycDocuments = async () => {
    if (!merchant?.id) {
      throw new Error("Merchant profile is not loaded yet");
    }

    const nextUploads = merchantKycDocumentOptions
      .map((option) => submittedDocumentUploads.find((document) => document.type === option.type && document.upload_id))
      .filter((document): document is MerchantKycDocumentUpload => Boolean(document))
      .filter((document) => !merchantDocumentFiles[document.type as MerchantKycDocumentType]);
    const files = Object.entries(merchantDocumentFiles)
      .filter((entry): entry is [MerchantKycDocumentType, File] => Boolean(entry[1]));

    for (const [documentType, file] of files) {
      const option = merchantKycDocumentOptions.find((item) => item.type === documentType);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("related_model", "Merchant");
      formData.append("related_id", merchant.id);

      const { data } = await api.post("/auth/uploads/single", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const upload = data?.data?.upload;
      const uploadId = upload?._id || upload?.id;
      if (!uploadId) {
        throw new Error(`${option?.label || documentType} uploaded, but the backend did not return an upload ID`);
      }

      nextUploads.push({
        type: documentType,
        label: option?.label || documentType,
        upload_id: uploadId,
        file_name: upload.file_name || file.name,
        url: upload.public_path || upload.file_path || uploadId,
        uploaded_at: new Date().toISOString(),
      });
    }

    return nextUploads;
  };

  const validateKycStep = (step = kycStep) => {
    const requiredByStep: Record<number, Array<[keyof MerchantKycForm, string]>> = {
      0: [
        ["legal_business_name", "Legal business name"],
        ["business_registration_number", "Business registration number"],
        ["tin_number", "TIN number"],
      ],
      1: [
        ["owner_full_name", "Owner full name"],
        ["owner_id_number", "Owner ID number"],
        ["owner_phone", "Owner phone"],
      ],
      2: [],
    };

    const missingField = (requiredByStep[step] || []).find(([field]) => !String(kycForm[field] || "").trim());
    if (missingField) {
      toast.error(`${missingField[1]} is required`);
      return false;
    }

    const missingDocuments = step === 2 ? missingRequiredMerchantKycDocuments() : [];
    if (missingDocuments.length > 0) {
      toast.error(`Upload required documents: ${missingDocuments.join(", ")}`);
      return false;
    }

    return true;
  };

  const continueKycWizard = () => {
    if (!validateKycStep()) {
      return;
    }

    setKycStep((current) => Math.min(current + 1, merchantKycSteps.length - 1));
  };

  const submitMerchantKyc = async () => {
    if (!merchantKycEditable) {
      toast.error("Verified KYC is locked. Contact admin for changes.");
      return;
    }

    if (![0, 1, 2].every((step) => validateKycStep(step))) {
      return;
    }

    setActionLoading("submit-kyc");
    try {
      const documentUploads = await uploadMerchantKycDocuments();
      await api.patch("/auth/merchants/me/kyc", {
        legal_business_name: kycForm.legal_business_name,
        business_registration_number: kycForm.business_registration_number,
        tin_number: kycForm.tin_number,
        owner_full_name: kycForm.owner_full_name,
        owner_id_number: kycForm.owner_id_number,
        owner_phone: kycForm.owner_phone,
        document_links: kycForm.document_links
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
        document_uploads: documentUploads,
        document_notes: kycForm.document_notes || undefined,
      });

      toast.success("Merchant KYC submitted for admin review");
      setMerchantDocumentFiles({});
      await Promise.all([loadMerchantWorkspace(), fetchUser()]);
      setKycStep(3);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "KYC submission failed");
    } finally {
      setActionLoading(null);
    }
  };

  const screenTitle: Record<MerchantPortalScreen, string> = {
    dashboard: "Merchant Dashboard",
    orders: "Merchant Orders",
    "new-order": "Create Order",
    "order-details": "Order Details",
    kyc: "Merchant KYC",
    support: "Merchant Support",
  };

  const pageShellClass = "content-scroll flex-1 px-3 py-3 sm:px-6 sm:py-5";
  const segmentedButtonClass = (active: boolean) => `rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
    active ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
  }`;

  const kycBanner = merchant && (!merchantLegalComplete || !merchantCanCreateOrders) ? (
    <div className="grid gap-3">
      {!merchantLegalComplete ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          <span>
            Merchant legal agreements are required before order creation. Open the KYC portal to review and accept the current policy documents.
          </span>
          <Link to="/merchant/kyc" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
            Complete Legal Review
          </Link>
        </div>
      ) : null}
      {!merchantCanCreateOrders ? (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${merchantKycStatus === "rejected" ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-warning/20 bg-warning/10 text-warning"}`}>
          <span>
            {merchantKycStatus === "rejected"
              ? `Merchant verification was rejected: ${merchant.kyc_rejection_reason || "Admin requested corrected documents."}`
              : `${merchantKycConfig.label}: ${merchantKycConfig.helper} Order creation remains blocked until approval.`}
          </span>
          <Link to="/merchant/kyc" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
            Complete Verification Now
          </Link>
        </div>
      ) : null}
    </div>
  ) : null;

  const statsGrid = (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        { label: "Total deliveries", value: String(dashboard?.dashboard.total_deliveries ?? 0), icon: PackageIcon, tone: "text-primary" },
        { label: "COD balance", value: `UGX ${formatUGX(dashboard?.dashboard.cod_balance)}`, icon: WalletIcon, tone: "text-warning" },
        { label: "Earnings", value: `UGX ${formatUGX(dashboard?.dashboard.earnings)}`, icon: CheckCircleIcon, tone: "text-success" },
        { label: "Referrals", value: String(dashboard?.dashboard.referralCount ?? 0), icon: StoreIcon, tone: "text-chart-2" },
      ].map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-3 shadow-custom sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
              <Icon className={`h-4 w-4 ${stat.tone}`} />
            </div>
            <p className={`mt-2 text-base font-bold sm:text-xl ${stat.tone}`}>{stat.value}</p>
          </div>
        );
      })}
    </div>
  );

  const merchantProfileCard = (
    <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchant QR</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">{merchant?.shop_name ?? "Merchant"}</h2>
          <p className="text-xs text-muted-foreground">{merchant?.referral_code ?? "No referral code"}</p>
        </div>
        <QrCodeIcon className="h-5 w-5 text-primary" />
      </div>
      {isQrDataUrl(merchant?.qr_code) ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
          <img src={merchant?.qr_code || ""} alt="Merchant QR" className="h-40 w-40 max-w-full rounded-lg border border-border bg-white p-2" />
          <div className="grid content-center gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Referral Code</p>
              <p className="mt-1 font-mono text-sm font-black text-primary">{merchant?.referral_code || "-"}</p>
            </div>
            <button type="button" onClick={downloadMerchantQrCode} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white">
              <DownloadIcon className="h-3.5 w-3.5" />
              Download QR
            </button>
            <button type="button" onClick={() => refreshMerchantQrCode(true)} disabled={actionLoading === "qr-regenerate"} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50">
              <RefreshCwIcon className="h-3.5 w-3.5" />
              <LoadingButtonContent loading={actionLoading === "qr-regenerate"} label="Regenerate QR" loadingLabel="Regenerating" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-warning/20 bg-warning/10 p-3 text-xs text-warning">
          <p className="font-semibold">Merchant QR has not loaded yet.</p>
          <button type="button" onClick={() => refreshMerchantQrCode(false)} disabled={actionLoading === "qr-refresh"} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
            <QrCodeIcon className="h-3.5 w-3.5" />
            <LoadingButtonContent loading={actionLoading === "qr-refresh"} label="Generate / Load QR" loadingLabel="Loading QR" />
          </button>
        </div>
      )}
      <div className="mt-4 grid gap-2 text-xs">
        <div className="rounded-lg bg-muted px-3 py-2">Tier: <span className="font-semibold text-foreground">{merchant?.tier_level ?? "Starter"}</span></div>
        <Link
          to="/merchant/kyc"
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-primary/5 ${merchantKycConfig.classes}`}
          title="Open merchant KYC verification portal"
        >
          <span>KYC Status</span>
          <span className="inline-flex items-center gap-1 font-semibold">
            {merchantCanCreateOrders ? <ShieldCheckIcon className="h-3.5 w-3.5" /> : <AlertCircleIcon className="h-3.5 w-3.5" />}
            {merchantKycConfig.label}
          </span>
        </Link>
        <div className="rounded-lg bg-muted px-3 py-2">COD: <span className="font-semibold text-warning">UGX {formatUGX(merchant?.cod_balance)}</span></div>
      </div>
    </div>
  );

  const kycTimeline = [
    {
      label: "Submitted",
      helper: merchant?.kyc_submission?.submitted_at
        ? new Date(merchant.kyc_submission.submitted_at).toLocaleString()
        : "Waiting for documents",
      active: Boolean(merchant?.kyc_submission?.submitted_at),
      complete: ["pending_review", "verified", "rejected"].includes(merchantKycStatus),
    },
    {
      label: "Under Review",
      helper: merchantKycStatus === "pending_review"
        ? "Admin review in progress"
        : merchantKycStatus === "verified" || merchantKycStatus === "rejected"
          ? "Review completed"
          : "Starts after submission",
      active: merchantKycStatus === "pending_review",
      complete: merchantKycStatus === "verified" || merchantKycStatus === "rejected",
    },
    {
      label: "Approved",
      helper: merchantKycStatus === "verified" ? "Account unlocked" : "Required before order creation",
      active: merchantKycStatus === "verified",
      complete: merchantKycStatus === "verified",
    },
  ];

  const kycStatusPanel = (
    <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchant verification</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Signup and KYC readiness</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Submit business identity once. Admin approval unlocks operational order creation.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${merchantKycConfig.classes}`}>
          {merchantKycStatus === "verified" ? <ShieldCheckIcon className="h-3.5 w-3.5" /> : <AlertCircleIcon className="h-3.5 w-3.5" />}
          {merchantKycConfig.label}
        </span>
      </div>

      {merchant?.kyc_rejection_reason ? (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-semibold">Rejected document handling</p>
          <p className="mt-1">{merchant.kyc_rejection_reason}</p>
          <button
            type="button"
            onClick={() => {
              setMerchantKycView("documents");
              setKycStep(2);
            }}
            className="mt-3 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-white"
          >
            Upload corrected documents now
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {kycTimeline.map((step, index) => (
          <div key={step.label} className={`rounded-xl border px-4 py-3 ${step.complete || step.active ? "border-primary/20 bg-primary/10" : "border-border bg-muted/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step.complete ? "bg-success text-white" : step.active ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                {step.complete ? <CheckCircleIcon className="h-4 w-4" /> : index + 1}
              </span>
              {index < kycTimeline.length - 1 ? <ArrowRightIcon className="hidden h-4 w-4 text-muted-foreground sm:block" /> : null}
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">{step.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background/70 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Legal agreements</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {merchantLegalComplete ? `${merchantPolicyAcceptances.length} accepted` : "Required before public operations"}
            </p>
          </div>
          <ShieldCheckIcon className={`h-5 w-5 ${merchantLegalComplete ? "text-success" : "text-warning"}`} />
        </div>
        {merchantLegalComplete ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {merchantPolicyAcceptances.map((agreement) => (
              <div key={agreement.key} className="rounded-lg bg-muted px-3 py-2">
                <p className="truncate text-xs font-semibold text-foreground">{agreement.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Version {agreement.version} | {agreement.accepted_at ? new Date(agreement.accepted_at).toLocaleString() : "Accepted"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-warning/20 bg-warning/10 p-3">
            <p className="text-xs leading-relaxed text-warning">
              This account must accept the current merchant policy documents before order creation can continue.
            </p>
            <div className="mt-3 grid gap-2">
              {merchantPolicies.map((policy) => (
                <a
                  key={policy.key}
                  href={policyDownloadHref(policy)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (policy.file_available === false) {
                      event.preventDefault();
                      toast.error("This policy document file is not available on the server yet.");
                    }
                  }}
                  className={`inline-flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    policy.file_available === false
                      ? "cursor-not-allowed border-warning/20 bg-warning/10 text-warning"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className="truncate">{policy.title}</span>
                  <ExternalLinkIcon className={`h-3.5 w-3.5 shrink-0 ${policy.file_available === false ? "text-warning" : "text-primary"}`} />
                </a>
              ))}
            </div>
            <button
              type="button"
              onClick={acceptMerchantPolicies}
              disabled={actionLoading === "accept-policies" || merchantPolicies.length === 0 || merchantUnavailableRequiredPolicies.length > 0}
              title={merchantPolicies.length === 0 ? "Policy documents are still loading or unavailable." : merchantUnavailableRequiredPolicies.length > 0 ? "Required policy files are unavailable on the server." : "Accept the current merchant legal agreements."}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {actionLoading === "accept-policies" ? <LoaderGlyph size="xs" label="Accepting agreements" /> : <ShieldCheckIcon className="h-3.5 w-3.5" />}
              Accept required agreements
            </button>
          </div>
        )}
      </div>

      {merchant?.kyc_submission?.submitted_at ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted px-3 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted</p>
            <p className="mt-1 text-xs font-semibold text-foreground">{new Date(merchant.kyc_submission.submitted_at).toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-muted px-3 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</p>
            <p className="mt-1 text-xs font-semibold text-foreground">{merchant.kyc_submission.updated_at ? new Date(merchant.kyc_submission.updated_at).toLocaleString() : "-"}</p>
          </div>
          <div className="rounded-xl bg-muted px-3 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin review</p>
            <p className="mt-1 text-xs font-semibold text-foreground">{merchant.kyc_submission.reviewed_at ? new Date(merchant.kyc_submission.reviewed_at).toLocaleString() : "Waiting"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );

  const kycInputClass = "rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
  const kycFormPanel = (
    <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
      <WorkflowStepper steps={merchantKycSteps} currentStep={kycStep} />

      <div className="mt-4 min-h-[20rem] rounded-xl border border-border bg-background/70 p-4">
        {kycStep === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-3 text-xs leading-relaxed text-primary sm:col-span-2">
              Use the registered business identity that should appear on operational records.
            </div>
            <input disabled={!merchantKycEditable} value={kycForm.legal_business_name} onChange={(event) => setKycForm((current) => ({ ...current, legal_business_name: event.target.value }))} placeholder="Legal business name" className={kycInputClass} />
            <input disabled={!merchantKycEditable} value={kycForm.business_registration_number} onChange={(event) => setKycForm((current) => ({ ...current, business_registration_number: event.target.value }))} placeholder="Business registration number" className={kycInputClass} />
            <input disabled={!merchantKycEditable} value={kycForm.tin_number} onChange={(event) => setKycForm((current) => ({ ...current, tin_number: event.target.value }))} placeholder="TIN number" className={kycInputClass} />
          </div>
        ) : null}

        {kycStep === 1 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-3 text-xs leading-relaxed text-primary sm:col-span-2">
              Owner details are reviewed by admin before the account can create deliveries.
            </div>
            <input disabled={!merchantKycEditable} value={kycForm.owner_full_name} onChange={(event) => setKycForm((current) => ({ ...current, owner_full_name: event.target.value }))} placeholder="Owner full name" className={kycInputClass} />
            <input disabled={!merchantKycEditable} value={kycForm.owner_id_number} onChange={(event) => setKycForm((current) => ({ ...current, owner_id_number: event.target.value }))} placeholder="Owner national ID / passport" className={kycInputClass} />
            <input disabled={!merchantKycEditable} value={kycForm.owner_phone} onChange={(event) => setKycForm((current) => ({ ...current, owner_phone: event.target.value }))} placeholder="Owner phone number" className={kycInputClass} />
          </div>
        ) : null}

        {kycStep === 2 ? (
          <div className="grid gap-3">
            <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-3 text-xs leading-relaxed text-primary">
              <CameraIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Upload business proof for admin review. Rejected documents can be replaced immediately and resubmitted.</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {merchantKycDocumentOptions.map((option) => {
                const existingDocument = existingMerchantKycDocument(option.type);
                const existingDocumentIsUploaded = Boolean(existingDocument?.upload_id);
                const selectedFile = merchantDocumentFiles[option.type];
                return (
                  <div key={option.type} className={`rounded-xl border p-4 ${selectedFile || existingDocumentIsUploaded ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.helper}</p>
                      </div>
                      {selectedFile || existingDocumentIsUploaded ? (
                        <CheckCircleIcon className="h-5 w-5 shrink-0 text-success" />
                      ) : (
                        <FileTextIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {selectedFile ? selectedFile.name : existingDocumentIsUploaded ? existingDocument?.file_name || "Uploaded file ready" : "Upload required"}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white ${!merchantKycEditable ? "pointer-events-none opacity-50" : ""}`}>
                        <UploadCloudIcon className="h-3.5 w-3.5" />
                        {existingDocumentIsUploaded || selectedFile ? "Replace" : "Upload"}
                        <input
                          type="file"
                          disabled={!merchantKycEditable}
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            setMerchantDocumentFiles((current) => ({ ...current, [option.type]: file }));
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => openMerchantKycDocument(existingDocument, option.label)}
                        disabled={!existingDocument}
                        title={existingDocument ? `Open ${option.label}` : `${option.label} has not been uploaded yet.`}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ExternalLinkIcon className="h-3.5 w-3.5" />
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <textarea disabled={!merchantKycEditable} value={kycForm.document_links} onChange={(event) => setKycForm((current) => ({ ...current, document_links: event.target.value }))} rows={4} placeholder="Document links, one per line" className={`${kycInputClass} resize-none`} />
            <textarea disabled={!merchantKycEditable} value={kycForm.document_notes} onChange={(event) => setKycForm((current) => ({ ...current, document_notes: event.target.value }))} rows={4} placeholder="Document notes, file references, or admin review context" className={`${kycInputClass} resize-none`} />
          </div>
        ) : null}

        {kycStep === 3 ? (
          <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
            {[
              ["Legal business", kycForm.legal_business_name],
              ["Registration", kycForm.business_registration_number],
              ["TIN", kycForm.tin_number],
              ["Owner", kycForm.owner_full_name],
              ["Owner ID", kycForm.owner_id_number],
              ["Owner phone", kycForm.owner_phone],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-muted px-3 py-2">
                {label}: <span className="font-semibold text-foreground">{value || "-"}</span>
              </div>
            ))}
            <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">
              Documents: <span className="font-semibold text-foreground">
                {[
                  ...submittedDocumentUploads.map((document) => document.file_name || document.label),
                  ...Object.values(merchantDocumentFiles).filter(Boolean).map((file) => file?.name),
                ].filter(Boolean).join(", ") || kycForm.document_links.trim() || kycForm.document_notes.trim() || "-"}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr]">
        <button type="button" onClick={() => setKycStep((current) => Math.max(current - 1, 0))} disabled={actionLoading === "submit-kyc" || kycStep === 0} title={kycStep === 0 ? "You are already on the first KYC step." : "Go back to the previous KYC step."} className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={kycStep === merchantKycSteps.length - 1 ? submitMerchantKyc : continueKycWizard}
          disabled={actionLoading === "submit-kyc" || !merchantKycEditable}
          title={!merchantKycEditable ? "Verified merchant KYC is locked. Contact admin for changes." : kycStep === merchantKycSteps.length - 1 ? "Submit merchant KYC for admin review." : "Continue to the next KYC step."}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50"
        >
          {actionLoading === "submit-kyc" ? <LoaderGlyph size="sm" label="Submitting KYC" /> : kycStep === merchantKycSteps.length - 1 ? <SendIcon className="mr-2 h-4 w-4" /> : null}
          {merchantKycStatus === "verified" ? "KYC Verified" : kycStep === merchantKycSteps.length - 1 ? (merchantKycStatus === "rejected" ? "Resubmit KYC" : "Submit KYC") : "Continue"}
          {kycStep === merchantKycSteps.length - 1 ? null : <ArrowRightIcon className="ml-2 h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  const orderList = (limit?: number) => (
    <div className="rounded-xl border border-border bg-card shadow-custom">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">Merchant Orders</h2>
          <p className="text-xs text-muted-foreground">Live backend orders with merchant-facing statuses</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/merchant/orders/new" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
            New Order
          </Link>
          <button onClick={loadMerchantWorkspace} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
            <RefreshCwIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="p-5">
          <AppLoader variant="inline" label="Loading orders" subtitle="Fetching merchant order status and pricing records." />
        </div>
      ) : null}
      {!loading && orders.length === 0 ? (
        <div className="p-5">
          <GuidedEmptyState
            icon={PackageIcon}
            title="Create your first delivery"
            description="Open the new order screen. The pickup key and live merchant status will appear in order details after creation."
          />
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {orders.slice(0, limit ?? orders.length).map((order) => {
          const config = statusConfig[order.order_status];
          const Icon = config.icon;
          return (
            <button
              key={order.id}
              onClick={() => navigate(`/merchant/orders/${order.id}`)}
              className={`grid w-full grid-cols-1 gap-3 px-5 py-4 text-left hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] ${selectedOrder?.id === order.id ? "bg-primary/5" : ""}`}
            >
              <div className="min-w-0">
                <p className={`text-sm font-black ${getMerchantStatusClass(order)}`}>{getMerchantStatus(order)}</p>
                <p className="text-sm font-semibold text-primary">{order.order_id}</p>
                <p className="break-words text-xs text-muted-foreground">{order.customer_name} | {order.delivery_address}</p>
                <p className="mt-1 text-xs font-semibold text-primary">Delivery fee UGX {formatUGX(order.delivery_fee)}</p>
              </div>
              <span className={`inline-flex items-center gap-1 justify-self-start rounded-full border px-2 py-1 text-[10px] font-semibold sm:justify-self-auto ${config.classes}`}>
                <Icon className="h-3 w-3" />
                {config.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const createOrderPanel = (
    <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Create Order</p>
          <h2 className="text-lg font-bold text-foreground">New customer delivery</h2>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          New
        </span>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {orderReadinessItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border px-3 py-2 ${
              item.complete
                ? "border-success/25 bg-success/10"
                : "border-warning/25 bg-warning/10"
            }`}
          >
            <div className="flex items-center gap-2">
              {item.complete ? <CheckCircleIcon className="h-3.5 w-3.5 text-success" /> : <AlertCircleIcon className="h-3.5 w-3.5 text-warning" />}
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">{item.label}</p>
            </div>
            <p className={`mt-1 text-xs font-semibold ${item.complete ? "text-success" : "text-warning"}`}>{item.helper}</p>
          </div>
        ))}
      </div>
      <WorkflowStepper steps={orderWizardSteps} currentStep={orderStep} />

      <div className="mt-4 min-h-[18rem] rounded-xl border border-border bg-background/70 p-4">
        {orderStep === 0 ? (
          <div className="grid gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">Start with pickup and drop-off locations. Delivery fee is calculated from GPS distance.</p>
            <input value={form.customer_name} onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))} placeholder="Customer name" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
            <input value={form.customer_phone} onChange={(event) => setForm((current) => ({ ...current, customer_phone: event.target.value }))} placeholder="Customer phone" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input value={form.pickup_address} onChange={(event) => setForm((current) => ({ ...current, pickup_address: event.target.value }))} placeholder="Pickup location / shop address" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              <button type="button" onClick={() => lookupOrderAddress("pickup")} disabled={addressLookupLoading !== null} title="Resolve this pickup address with OpenRouteService." className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50">
                {addressLookupLoading === "pickup" ? "Looking..." : "Lookup"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input value={form.delivery_address} onChange={(event) => setForm((current) => ({ ...current, delivery_address: event.target.value }))} placeholder="Drop-off location / customer address" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              <button type="button" onClick={() => lookupOrderAddress("dropoff")} disabled={addressLookupLoading !== null} title="Resolve this drop-off address with OpenRouteService." className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50">
                {addressLookupLoading === "dropoff" ? "Looking..." : "Lookup"}
              </button>
            </div>
            <details className="rounded-xl border border-primary/15 bg-primary/5 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-primary">
                <span className="inline-flex items-center gap-2">
                  <MapPinIcon className="h-4 w-4" />
                  Optional GPS override
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">Map provider resolves blank fields</span>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input inputMode="decimal" value={form.pickup_latitude} onChange={(event) => setForm((current) => ({ ...current, pickup_latitude: event.target.value }))} placeholder="Pickup latitude e.g. 0.31360" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                <input inputMode="decimal" value={form.pickup_longitude} onChange={(event) => setForm((current) => ({ ...current, pickup_longitude: event.target.value }))} placeholder="Pickup longitude e.g. 32.58110" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                <input inputMode="decimal" value={form.dropoff_latitude} onChange={(event) => setForm((current) => ({ ...current, dropoff_latitude: event.target.value }))} placeholder="Drop-off latitude e.g. 0.34760" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
                <input inputMode="decimal" value={form.dropoff_longitude} onChange={(event) => setForm((current) => ({ ...current, dropoff_longitude: event.target.value }))} placeholder="Drop-off longitude e.g. 32.58250" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
            </details>
          </div>
        ) : null}

        {orderStep === 1 ? (
          <div className="grid gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">Package size controls dispatch compatibility. Larger packages should be reviewed before rider assignment.</p>
            <input value={form.item_description} onChange={(event) => setForm((current) => ({ ...current, item_description: event.target.value }))} placeholder="Item description" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
            <CustomSelect
              value={form.package_size}
              onValueChange={(nextValue) => setForm((current) => ({ ...current, package_size: nextValue as PackageSize }))}
              ariaLabel="Package size"
              options={packageSizeOptions.map((size) => ({
                value: size.value,
                label: `Package size: ${size.label}`,
              }))}
              triggerClassName="h-11 rounded-lg bg-background/80 text-sm"
            />
            <input value={form.delivery_zone} onChange={(event) => setForm((current) => ({ ...current, delivery_zone: event.target.value }))} placeholder="Delivery zone" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
          </div>
        ) : null}

        {orderStep === 2 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">Delivery fee is automatic. The merchant cannot manually enter or edit Wolan's KM-based pricing.</div>
            <input type="number" min="0" value={form.declared_value} onChange={(event) => setForm((current) => ({ ...current, declared_value: event.target.value }))} placeholder="Declared value" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
            <input type="number" min="0" value={form.cod_amount} onChange={(event) => setForm((current) => ({ ...current, cod_amount: event.target.value }))} placeholder="COD amount" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
            <CustomSelect
              value={form.service_level}
              onValueChange={(nextValue) => setForm((current) => ({ ...current, service_level: nextValue as "standard" | "express" }))}
              ariaLabel="Delivery service level"
              options={[
                { value: "standard", label: "Standard delivery" },
                { value: "express", label: "Express delivery - 1 hour request" },
              ]}
              triggerClassName="h-11 rounded-lg bg-background/80 text-sm"
            />
            <button type="button" onClick={estimateOrderPricing} disabled={pricingLoading} className="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary disabled:opacity-50">
              {pricingLoading ? <LoaderGlyph size="sm" label="Calculating delivery fee" /> : null}
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

        {orderStep === 3 ? (
          <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="rounded-xl bg-muted px-3 py-2">Customer: <span className="font-semibold text-foreground">{form.customer_name || "-"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">Phone: <span className="font-semibold text-foreground">{form.customer_phone || "-"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">Pickup: <span className="font-semibold text-foreground">{form.pickup_address || "-"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">Drop-off: <span className="font-semibold text-foreground">{form.delivery_address || "-"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2 sm:col-span-2">Route GPS: <span className="font-semibold text-foreground">{form.pickup_latitude && form.pickup_longitude && form.dropoff_latitude && form.dropoff_longitude ? `${form.pickup_latitude}, ${form.pickup_longitude} to ${form.dropoff_latitude}, ${form.dropoff_longitude}` : "Resolved automatically by the map provider"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">Package: <span className="font-semibold text-foreground">{packageSizeLabel(form.package_size)}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">Zone: <span className="font-semibold text-foreground">{form.delivery_zone || "-"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">Service: <span className="font-semibold text-foreground">{form.service_level === "express" ? "Express 1-hour request" : "Standard"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">Distance: <span className="font-semibold text-foreground">{pricingEstimate ? `${pricingEstimate.pricing_distance_km.toFixed(2)} KM` : "-"}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">COD: <span className="font-semibold text-warning">UGX {formatUGX(Number(form.cod_amount || 0))}</span></div>
            <div className="rounded-xl bg-muted px-3 py-2">Fee: <span className="font-semibold text-primary">UGX {formatUGX(pricingEstimate?.delivery_fee || 0)}</span></div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr]">
        <button type="button" title={orderBackDisabledReason() || "Go back to the previous order step."} onClick={() => setOrderStep((current) => Math.max(current - 1, 0))} disabled={orderStep === 0 || actionLoading === "create-order"} className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </button>
        <button type="button" title={createOrderDisabledReason() || (orderStep === orderWizardSteps.length - 1 ? "Create this order and open its detail page." : "Continue to the next order step.")} onClick={orderStep === orderWizardSteps.length - 1 ? createOrder : continueOrderWizard} disabled={actionLoading === "create-order" || (orderStep === orderWizardSteps.length - 1 && (!merchantCanCreateOrders || !merchantLegalComplete || merchantUnavailableRequiredPolicies.length > 0 || !pricingEstimate || pricingLoading))} className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50">
          {actionLoading === "create-order" ? <LoaderGlyph size="sm" label="Creating order" /> : null}
          {orderStep === orderWizardSteps.length - 1 ? "Create Order" : "Continue"}
          {orderStep === orderWizardSteps.length - 1 ? null : <ArrowRightIcon className="ml-2 h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  const orderDetailsPanel = selectedOrder ? (
    <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Order Details</p>
          <h2 className={`mt-1 text-xl font-black ${getMerchantStatusClass(selectedOrder)}`}>{getMerchantStatus(selectedOrder)}</h2>
          <p className="mt-1 text-sm font-semibold text-foreground">{selectedOrder.order_id}</p>
        </div>
        <Link to="/merchant/orders" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">All Orders</Link>
      </div>
      <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-warning">Pickup Key</p>
        <p className="mt-1 font-mono text-3xl font-black tracking-[0.25em] text-warning">{selectedOrder.pickup_key ?? "----"}</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
        {[
          { value: "handover" as const, label: "Handover" },
          { value: "details" as const, label: "Details" },
          { value: "history" as const, label: "History" },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMerchantOrderView(tab.value)}
            className={segmentedButtonClass(merchantOrderView === tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {merchantOrderView === "handover" ? (
        <div className="mt-3 rounded-xl border border-border bg-muted px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Handover Confirmation</p>
              <p className={`mt-1 text-xs font-semibold ${selectedOrder.handover_verified ? "text-success" : "text-warning"}`}>
                {selectedOrder.handover_verified ? "Verified" : "Pending"}
              </p>
            </div>
            <CheckCircleIcon className={`h-4 w-4 ${selectedOrder.handover_verified ? "text-success" : "text-warning"}`} />
          </div>
          {!selectedOrder.handover_verified ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={pickupKeyInput} onChange={(event) => setPickupKeyInput(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="4-digit pickup key" className="rounded-lg border border-border bg-background/80 px-3 py-2.5 font-mono text-sm tracking-[0.2em] text-foreground outline-none" />
              <button onClick={confirmHandover} title={handoverDisabledReason() || "Confirm handover using the 4-digit pickup key."} disabled={!selectedOrder || selectedOrder.order_status !== "pending" || selectedOrder.assignment_response_status !== "accepted" || actionLoading === "confirm-handover"} className="rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                <LoadingButtonContent loading={actionLoading === "confirm-handover"} label="Confirm Handover" loadingLabel="Confirming handover" />
              </button>
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-card px-3 py-2">Assignment: <span className="font-semibold text-foreground">{selectedOrder.assignment_response_status ?? "unassigned"}</span></div>
            <div className="rounded-lg bg-card px-3 py-2">Hub scan: <span className="font-semibold text-foreground">{selectedOrder.hub_scan_in ? "Complete" : "Pending"}</span></div>
            <div className="rounded-lg bg-card px-3 py-2">Status: <span className="font-semibold text-foreground">{statusConfig[selectedOrder.order_status].label}</span></div>
          </div>
        </div>
      ) : null}
      {merchantOrderView === "details" ? (
        <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-lg bg-muted px-3 py-2">Customer: <span className="font-semibold text-foreground">{selectedOrder.customer_name}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Phone: <span className="font-semibold text-foreground">{selectedOrder.customer_phone}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2 sm:col-span-2">Pickup: <span className="font-semibold text-foreground">{selectedOrder.pickup_address || "-"}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2 sm:col-span-2">Drop-off: <span className="font-semibold text-foreground">{selectedOrder.dropoff_address || selectedOrder.delivery_address}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Package: <span className="break-all font-semibold text-foreground">{selectedOrder.package_tracking_id ?? "-"}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Package size: <span className="font-semibold text-foreground">{packageSizeLabel(selectedOrder.package_size)}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Rider tracking: <span className="break-all font-semibold text-foreground">{selectedOrder.rider_tracking_id ?? "-"}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Hub scan: <span className="font-semibold text-foreground">{selectedOrder.hub_scan_in ? new Date(selectedOrder.hub_scan_in).toLocaleString() : "Pending"}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">COD: <span className="font-semibold text-warning">UGX {formatUGX(selectedOrder.cod_amount)}</span></div>
          <div className="rounded-lg bg-primary/10 px-3 py-2">Delivery fee: <span className="font-semibold text-primary">UGX {formatUGX(selectedOrder.delivery_fee)}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Distance: <span className="font-semibold text-foreground">{selectedOrder.pricing_distance_km !== null && selectedOrder.pricing_distance_km !== undefined ? `${selectedOrder.pricing_distance_km.toFixed(2)} KM` : "-"}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Pricing tier: <span className="font-semibold text-foreground">{selectedOrder.pricing_tier_label || "-"}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2">Service: <span className="font-semibold text-foreground">{selectedOrder.service_level === "express" ? "Express 1-hour request" : "Standard"}</span></div>
        </div>
      ) : null}
      {merchantOrderView === "history" ? (
        <div className="mt-4 space-y-2">
          {(selectedOrder.status_history || []).length === 0 ? (
            <p className="rounded-lg border border-border bg-background/70 px-3 py-3 text-xs text-muted-foreground">No status history has been recorded yet.</p>
          ) : null}
          {(selectedOrder.status_history || []).slice().reverse().slice(0, 8).map((entry, index) => (
            <div key={`${entry.status}-${index}`} className="rounded-lg border border-border bg-background/70 px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{entry.status}</p>
              <p className="text-[10px] text-muted-foreground">{entry.note || "Status updated"} | {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "-"}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  ) : orderDetailLoading ? (
    <AppLoader
      variant="panel"
      label="Loading order details"
      subtitle="Checking the backend for this merchant order before showing the action screen."
    />
  ) : (
    <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
      <GuidedEmptyState icon={PackageIcon} title="Order not found" description="Open the merchant orders screen and choose a valid order from the backend list." />
      <Link to="/merchant/orders" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Back to Orders</Link>
    </div>
  );

  const content = (() => {
    if (screen === "dashboard") {
      return (
        <div className="viewport-safe space-y-4">
          {kycBanner}
          {statsGrid}
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
            {[
              { value: "actions" as const, label: "Actions" },
              { value: "orders" as const, label: "Orders" },
              { value: "profile" as const, label: "Profile" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setMerchantHomeView(tab.value)}
                className={segmentedButtonClass(merchantHomeView === tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {merchantHomeView === "actions" ? (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Next action</p>
              <h2 className="mt-2 text-xl font-bold text-foreground">Create and monitor deliveries from dedicated screens.</h2>
              <p className="mt-2 text-sm text-muted-foreground">Use one task screen at a time: create an order, review active orders, or open verification.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Link to="/merchant/orders/new" className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white">Create Order</Link>
                <Link to="/merchant/orders" className="rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-semibold text-foreground">View Orders</Link>
                {!merchantCanCreateOrders ? (
                  <Link to="/merchant/kyc" className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-card px-4 py-2 text-sm font-semibold text-primary">
                    <FileTextIcon className="h-4 w-4" />
                    Submit KYC
                  </Link>
                ) : (
                  <Link to="/merchant/support" className="rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-semibold text-foreground">Support</Link>
                )}
              </div>
            </div>
          ) : null}
          {merchantHomeView === "orders" ? orderList(5) : null}
          {merchantHomeView === "profile" ? <div className="w-full">{merchantProfileCard}</div> : null}
        </div>
      );
    }

    if (screen === "orders") {
      return <div className="viewport-safe space-y-6">{kycBanner}{orderList()}</div>;
    }

    if (screen === "new-order") {
      return <div className="viewport-safe w-full space-y-6">{kycBanner}{createOrderPanel}</div>;
    }

    if (screen === "order-details") {
      return <div className="viewport-safe w-full space-y-6">{orderDetailsPanel}</div>;
    }

    if (screen === "kyc") {
      return (
        <div className="viewport-safe w-full space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
            {[
              { value: "status" as const, label: "Review Status" },
              { value: "documents" as const, label: merchantKycStatus === "rejected" ? "Correct Documents" : "Submit Documents" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setMerchantKycView(tab.value)}
                className={segmentedButtonClass(merchantKycView === tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {merchantKycView === "status" ? kycStatusPanel : kycFormPanel}
        </div>
      );
    }

    return (
      <div className="viewport-safe w-full space-y-6">
        <SupportPanel title="Merchant support" />
      </div>
    );
  })();

  return (
    <div data-cmp="MerchantPortal" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header title={screenTitle[screen]} subtitle={merchant ? `${merchant.shop_name} | ${merchant.tier_level}` : "Orders, COD, QR, and referrals"} />

      {loading && !dashboard ? (
        <MerchantDashboardSkeleton />
      ) : (
      <div className={pageShellClass}>{content}</div>
      )}
    </div>
  );
}
