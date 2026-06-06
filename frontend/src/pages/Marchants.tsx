import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLoader, { LoaderGlyph, LoadingButtonContent } from "../components/AppLoader";
import Header from "../components/Header";
import { CustomSelect } from "../components/ui/custom-select";
import api from "../lib/api";
import { connectRealtimeSocket } from "../lib/realtime";
import { toast } from "sonner";
import {
  PlusIcon,
  SearchIcon,
  QrCodeIcon,
  StarIcon,
  TrendingUpIcon,
  PackageIcon,
  PhoneIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  UsersIcon,
  ChevronRightIcon,
  AwardIcon,
  UserIcon,
  RefreshCwIcon,
  DollarSignIcon,
  CreditCardIcon,
  WalletIcon,
  LockOpenIcon,
  FileTextIcon,
  ExternalLinkIcon,
  DownloadIcon,
  AlertCircleIcon,
} from "lucide-react";

type MerchantKycStatus = "unverified" | "not_submitted" | "pending" | "pending_review" | "verified" | "rejected";
type MerchantKycDocumentUpload = {
  type: string;
  label: string;
  upload_id?: string | null;
  file_name?: string | null;
  url?: string | null;
  uploaded_at?: string | null;
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

const merchantKycDocumentLabels: Record<string, string> = {
  business_registration: "Business Registration",
  tax_certificate: "TIN / Tax Certificate",
  owner_id: "Owner National ID / Passport",
  shop_photo: "Shop Photo / Storefront",
};

const requiredMerchantKycDocumentTypes = Object.keys(merchantKycDocumentLabels);

type MerchantRecord = {
  id: string;
  merchant_name: string;
  shop_name: string;
  building_name: string;
  phone: string;
  email: string;
  address: string;
  referral_code: string;
  referred_by?: string;
  tier_level: "Starter" | "Active" | "Priority" | "Elite";
  escalation_status?: "none" | "open" | "in_progress" | "resolved" | "dismissed";
  escalation_priority?: "normal" | "high" | "urgent";
  escalation_reason?: string | null;
  escalation_sla_due_at?: string | null;
  escalation_opened_at?: string | null;
  escalation_resolved_at?: string | null;
  escalation_sla_breached?: boolean;
  escalation_action_trail?: Array<{
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    priority?: string | null;
    note?: string | null;
    actor_role?: string | null;
    created_at?: string;
    sla_due_at?: string | null;
  }>;
  total_deliveries: number;
  cod_balance: number;
  earnings: number;
  qr_code?: string;
  hub_id?: string;
  status: "pending" | "active" | "suspended";
  kyc_status?: MerchantKycStatus;
  kyc_rejection_reason?: string | null;
  kyc_submission?: {
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
  } | null;
  policy_acceptances?: PolicyAcceptanceRecord[];
  account_locked?: boolean;
  failed_login_attempts?: number;
  locked_reason?: string | null;
  last_login?: string;
  createdAt?: string;
};

type MerchantDashboard = {
  merchant: MerchantRecord;
  dashboard: {
    referralCount: number;
    tier_level: string;
    total_deliveries: number;
    cod_balance: number;
    earnings: number;
    referrals: { totalAmount: number; totalCount: number };
    cod: { totalAmount: number; totalCount: number };
    payouts: { totalAmount: number; totalCount: number };
    earnings_breakdown: { totalAmount: number; totalCount: number };
    recentTransactions: any[];
  };
};

type MerchantQrPreview = {
  merchant: MerchantRecord;
  qr_code: string;
  referral_code?: string;
  merchant_name?: string;
  shop_name?: string;
};

type CreateMerchantForm = {
  merchant_name: string;
  shop_name: string;
  building_name: string;
  phone: string;
  email: string;
  address: string;
  password: string;
  referred_by: string;
  tier_level: "Starter" | "Active" | "Priority" | "Elite";
  hub_id: string;
};

type MobileMerchantTab = "overview" | "legal" | "kyc" | "actions";

const mobileMerchantTabs: Array<{ id: MobileMerchantTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "legal", label: "Legal" },
  { id: "kyc", label: "KYC" },
  { id: "actions", label: "Actions" },
];

const levelConfig: Record<string, { label: string; classes: string; min: number }> = {
  Starter: { label: "Starter", classes: "text-muted-foreground bg-muted border-border", min: 0 },
  Active: { label: "Active", classes: "text-chart-2 bg-chart-2/10 border-chart-2/20", min: 10 },
  Priority: { label: "Priority", classes: "text-primary bg-primary/10 border-primary/20", min: 50 },
  Elite: { label: "Elite", classes: "text-warning bg-warning/10 border-warning/20", min: 200 },
};

const kycConfig: Record<string, { label: string; classes: string; textClass: string }> = {
  verified: { label: "KYC Verified", classes: "text-success bg-success/10 border-success/20", textClass: "text-success" },
  pending: { label: "Pending Review", classes: "text-primary bg-primary/10 border-primary/20", textClass: "text-primary" },
  pending_review: { label: "Pending Review", classes: "text-primary bg-primary/10 border-primary/20", textClass: "text-primary" },
  unverified: { label: "KYC Needed", classes: "text-warning bg-warning/10 border-warning/20", textClass: "text-warning" },
  not_submitted: { label: "KYC Needed", classes: "text-warning bg-warning/10 border-warning/20", textClass: "text-warning" },
  rejected: { label: "KYC Rejected", classes: "text-destructive bg-destructive/10 border-destructive/20", textClass: "text-destructive" },
};

const escalationConfig: Record<string, { label: string; classes: string }> = {
  none: { label: "No escalation", classes: "text-muted-foreground bg-muted border-border" },
  open: { label: "Open", classes: "text-warning bg-warning/10 border-warning/20" },
  in_progress: { label: "In progress", classes: "text-primary bg-primary/10 border-primary/20" },
  resolved: { label: "Resolved", classes: "text-success bg-success/10 border-success/20" },
  dismissed: { label: "Dismissed", classes: "text-muted-foreground bg-muted border-border" },
};

const priorityConfig: Record<string, { label: string; classes: string }> = {
  normal: { label: "Normal", classes: "text-muted-foreground bg-muted border-border" },
  high: { label: "High", classes: "text-warning bg-warning/10 border-warning/20" },
  urgent: { label: "Urgent", classes: "text-destructive bg-destructive/10 border-destructive/20" },
};

const getKycConfig = (status?: string | null) => kycConfig[status || "unverified"] || kycConfig.unverified;
const getEscalationConfig = (status?: string | null) => escalationConfig[status || "none"] || escalationConfig.none;
const getPriorityConfig = (priority?: string | null) => priorityConfig[priority || "normal"] || priorityConfig.normal;
const isQrDataUrl = (value?: string | null) => Boolean(value && /^data:image\/png;base64,/i.test(value));
const getMissingMerchantKycDocumentLabels = (merchant?: MerchantRecord | null) => {
  const uploadedTypes = new Set((merchant?.kyc_submission?.document_uploads || [])
    .filter((document) => document.upload_id)
    .map((document) => document.type));

  return requiredMerchantKycDocumentTypes
    .filter((type) => !uploadedTypes.has(type))
    .map((type) => merchantKycDocumentLabels[type]);
};

const getPreferredMerchantSelection = (items: MerchantRecord[]) => (
  items.find((merchant) => ["pending", "pending_review"].includes(merchant.kyc_status || ""))
  || items.find((merchant) => (merchant.kyc_status || "unverified") !== "verified")
  || items[0]
  || null
);

const formatUGX = (value: number | undefined | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US").format(Math.round(value));
};

const levelProgress = (level: string, orders: number) => {
  const levels = Object.values(levelConfig);
  const idx = levels.findIndex((l) => l.label === level);
  const next = levels[idx + 1];
  if (!next) return 100;
  const current = levels[idx].min;
  return Math.min(100, Math.round(((orders - current) / (next.min - current)) * 100));
};

const emptyForm = (): CreateMerchantForm => ({
  merchant_name: "",
  shop_name: "",
  building_name: "",
  phone: "",
  email: "",
  address: "",
  password: "",
  referred_by: "",
  tier_level: "Starter",
  hub_id: "",
});

export default function Merchants() {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [selected, setSelected] = useState<MerchantRecord | null>(null);
  const [qrPreview, setQrPreview] = useState<MerchantQrPreview | null>(null);
  const [mobileMerchantOpen, setMobileMerchantOpen] = useState(false);
  const [mobileMerchantTab, setMobileMerchantTab] = useState<MobileMerchantTab>("overview");
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateMerchantForm>(emptyForm());
  const [dashboard, setDashboard] = useState<MerchantDashboard | null>(null);
  const [escalationQueue, setEscalationQueue] = useState<MerchantRecord[]>([]);
  const [escalationNote, setEscalationNote] = useState("");
  const [escalationPriority, setEscalationPriority] = useState<"normal" | "high" | "urgent">("high");
  const [escalationSlaHours, setEscalationSlaHours] = useState("12");
  const [kycRejectReason, setKycRejectReason] = useState("");
  const [merchantPolicies, setMerchantPolicies] = useState<PolicyDocument[]>([]);
  const selectedPolicyAcceptances = selected?.policy_acceptances || [];
  const selectedMerchantRequiredPolicies = merchantPolicies.filter((policy) => policy.required);
  const selectedMerchantUnavailablePolicies = selectedMerchantRequiredPolicies.filter((policy) => policy.file_available === false);
  const selectedMerchantLegalComplete = merchantPolicies.length > 0
    ? selectedMerchantRequiredPolicies.every((policy) => selectedPolicyAcceptances.some((acceptance) => (
      acceptance.key === policy.key
      && acceptance.version === policy.version
      && acceptance.file_name === policy.file_name
    )))
    : selectedPolicyAcceptances.length >= 3;
  const selectMerchant = (merchant: MerchantRecord, tab: MobileMerchantTab = "overview") => {
    setSelected(merchant);
    setMobileMerchantTab(tab);
    setMobileMerchantOpen(true);
  };
  const downloadQrCode = (qrCode: string, name: string) => {
    if (!isQrDataUrl(qrCode)) {
      toast.error("QR code image is not available yet");
      return;
    }

    const link = window.document.createElement("a");
    link.href = qrCode;
    link.download = `${name || "merchant"}-qr.png`.replace(/[^a-z0-9_.-]+/gi, "-");
    link.rel = "noopener noreferrer";
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const policyDownloadHref = (policy: PolicyDocument, forceDownload = false) => {
    const configuredBase = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");
    const rawPath = policy.download_url || `/api/v1/auth/policies/${encodeURIComponent(policy.key)}/download`;
    const path = forceDownload
      ? `${rawPath}${rawPath.includes("?") ? "&" : "?"}download=1`
      : rawPath;
    if (/^https?:\/\//i.test(path)) return path;
    if (/^https?:\/\//i.test(configuredBase) && path.startsWith("/api/")) {
      const url = new URL(configuredBase);
      return `${url.origin}${path}`;
    }
    return path.startsWith("/api/") ? path : `${configuredBase}${path.startsWith("/") ? "" : "/"}${path}`;
  };
  const openMerchantPolicyDocument = (policy: PolicyDocument) => {
    if (policy.file_available === false) {
      toast.error("This merchant policy document file is not available on the server yet.");
      return;
    }
    const directUrl = new URL(policyDownloadHref(policy), window.location.origin);
    const isLocalDocument = ["localhost", "127.0.0.1", "::1"].includes(directUrl.hostname);
    const openUrl = isLocalDocument
      ? directUrl.href
      : `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(directUrl.href)}`;
    window.open(openUrl, "_blank", "noopener,noreferrer");
  };
  const downloadMerchantPolicyDocument = (policy: PolicyDocument) => {
    if (policy.file_available === false) {
      toast.error("This merchant policy document file is not available on the server yet.");
      return;
    }

    const link = window.document.createElement("a");
    link.href = policyDownloadHref(policy, true);
    link.download = policy.file_name || `${policy.key}.docx`;
    link.rel = "noopener noreferrer";
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const escalationDisabledReason = (status: NonNullable<MerchantRecord["escalation_status"]>) => {
    if (!selected) return "Select a merchant before changing escalation status.";
    if (actionLoading === `escalation-${selected.id}-${status}`) return "Escalation update is already being saved.";
    if (["open", "in_progress"].includes(status) && selected.tier_level !== "Elite") return "Only Elite merchants can enter the escalation queue.";
    if (["resolved", "dismissed"].includes(status) && !["open", "in_progress"].includes(selected.escalation_status || "none")) return "Open or move the escalation to in progress before closing it.";
    return undefined;
  };
  const merchantKycDisabledReason = (kycStatus: NonNullable<MerchantRecord["kyc_status"]>) => {
    if (!selected) return "Select a merchant before updating KYC.";
    if (actionLoading === `kyc-${selected.id}`) return "Merchant KYC update is already being saved.";
    if (selected.kyc_status === kycStatus) return `Merchant KYC is already ${kycStatus}.`;
    if (kycStatus === "verified" && !selected.kyc_submission?.submitted_at) return "Merchant must submit KYC details before admin approval.";
    if (kycStatus === "rejected" && !selected.kyc_submission?.submitted_at) return "Merchant must submit KYC details before rejection.";
    const missingDocuments = kycStatus === "verified" ? getMissingMerchantKycDocumentLabels(selected) : [];
    if (missingDocuments.length > 0) return `Approval blocked until required uploads are attached: ${missingDocuments.join(", ")}.`;
    if (kycStatus === "rejected" && kycRejectReason.trim().length < 3) return "Write a clear rejection reason before rejecting merchant KYC.";
    return undefined;
  };
  const merchantActionDisabledReason = (action: "unlock" | "qr" | "tier" | "status" | "orders" | "create") => {
    if (action === "create") {
      if (actionLoading === "create-merchant") return "Merchant creation is already being submitted.";
      return undefined;
    }
    if (!selected) return "Select a merchant before using this action.";
    if (action === "unlock") {
      if (actionLoading === `unlock-${selected.id}`) return "Account unlock is already being saved.";
      if (!selected.account_locked) return "This merchant account is not locked.";
    }
    if (action === "qr" && actionLoading === `qr-${selected.id}`) return "Merchant QR code is already loading.";
    if ((action === "tier" || action === "status") && actionLoading === `update-${selected.id}`) return "Merchant update is already being saved.";
    return undefined;
  };

  const filtered = useMemo(() => {
    return merchants.filter((m) => {
      const matchSearch =
        m.merchant_name.toLowerCase().includes(search.toLowerCase()) ||
        m.shop_name.toLowerCase().includes(search.toLowerCase()) ||
        m.phone.includes(search) ||
        m.email.toLowerCase().includes(search.toLowerCase());
      const matchLevel = selectedLevel === "All" || m.tier_level === selectedLevel;
      return matchSearch && matchLevel;
    });
  }, [merchants, search, selectedLevel]);

  const fetchMerchants = async () => {
    const { data } = await api.get("/auth/merchants", { params: { limit: 100 } });
    const merchantItems = (data?.data?.merchants || []) as MerchantRecord[];
    setMerchants(merchantItems);
    setSelected((current) => (
      current
        ? merchantItems.find((merchant) => merchant.id === current.id) ?? getPreferredMerchantSelection(merchantItems)
        : getPreferredMerchantSelection(merchantItems)
    ));
  };

  const fetchEscalationQueue = async () => {
    const { data } = await api.get("/auth/merchants/escalations/queue");
    setEscalationQueue((data?.data?.merchants || []) as MerchantRecord[]);
  };

  const fetchMerchantDashboard = async (merchantId: string) => {
    const { data } = await api.get(`/auth/merchants/${merchantId}/dashboard`);
    const dashboardData = data?.data as MerchantDashboard;
    setDashboard(dashboardData);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchMerchants(), fetchEscalationQueue()]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load merchants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (filtered.length === 0) {
      setSelected(null);
      return;
    }

    setSelected((current) => (
      current && filtered.some((merchant) => merchant.id === current.id)
        ? current
        : getPreferredMerchantSelection(filtered)
    ));
  }, [filtered, loading]);

  useEffect(() => {
    const loadMerchantPolicies = async () => {
      try {
        const { data } = await api.get("/auth/policies", { params: { audience: "merchant" } });
        setMerchantPolicies(data?.data?.policies || data?.policies || []);
      } catch (error) {
        setMerchantPolicies([]);
      }
    };

    loadMerchantPolicies();
  }, []);

  useEffect(() => {
    let disconnected = false;
    let socket: Awaited<ReturnType<typeof connectRealtimeSocket>> | null = null;

    const eventNames = [
      "merchant:kyc-updated",
      "merchant:kyc-submitted",
      "merchant:kyc-approved",
      "merchant:kyc-rejected",
    ];
    const handleMerchantKycEvent = (payload: any) => {
      const updatedMerchant = payload?.merchant || payload;
      const merchantId = updatedMerchant?.id || updatedMerchant?._id;
      if (!merchantId) {
        refreshAll();
        return;
      }

      const normalizedMerchant = { ...updatedMerchant, id: merchantId } as MerchantRecord;
      setMerchants((current) => {
        const exists = current.some((merchant) => merchant.id === merchantId);
        return exists
          ? current.map((merchant) => (merchant.id === merchantId ? { ...merchant, ...normalizedMerchant } : merchant))
          : [normalizedMerchant, ...current];
      });
      setSelected((current) => current?.id === merchantId ? { ...current, ...normalizedMerchant } : current);

      if (selected?.id === merchantId) {
        fetchMerchantDashboard(merchantId);
      }
    };

    connectRealtimeSocket()
      .then((nextSocket) => {
        if (disconnected) {
          nextSocket.disconnect();
          return;
        }

        socket = nextSocket;
        eventNames.forEach((eventName) => socket?.on(eventName, handleMerchantKycEvent));
      })
      .catch(() => {
        // Normal API refresh remains the fallback if live transport is unavailable.
      });

    return () => {
      disconnected = true;
      if (socket) {
        eventNames.forEach((eventName) => socket?.off(eventName, handleMerchantKycEvent));
        socket.disconnect();
      }
    };
  }, [selected?.id]);

  useEffect(() => {
    if (selected) {
      fetchMerchantDashboard(selected.id);
      setEscalationPriority(selected.escalation_priority || "high");
      setEscalationSlaHours(selected.escalation_priority === "urgent" ? "4" : selected.escalation_priority === "normal" ? "24" : "12");
    } else {
      setDashboard(null);
    }
    setEscalationNote("");
    setKycRejectReason("");
  }, [selected]);

  const createMerchant = async () => {
    if (
      !createForm.merchant_name ||
      !createForm.shop_name ||
      !createForm.building_name ||
      !createForm.phone ||
      !createForm.email ||
      !createForm.address ||
      !createForm.password
    ) {
      toast.error("Please fill in all required merchant fields");
      return;
    }

    if (createForm.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setActionLoading("create-merchant");

    try {
      await api.post("/auth/merchants", {
        merchant_name: createForm.merchant_name,
        shop_name: createForm.shop_name,
        building_name: createForm.building_name,
        phone: createForm.phone,
        email: createForm.email,
        address: createForm.address,
        password: createForm.password,
        referred_by: createForm.referred_by || undefined,
        tier_level: createForm.tier_level || "Starter",
      });

      toast.success("Merchant created successfully");
      setShowAdd(false);
      setCreateForm(emptyForm());
      await Promise.all([fetchMerchants(), fetchEscalationQueue()]);
    } catch (error: any) {
      const backendMessage = error.response?.data?.message;
      const backendErrors = error.response?.data?.errors;
      const errorMessages = Array.isArray(backendErrors)
        ? backendErrors
        : typeof backendErrors === 'string'
          ? [backendErrors]
          : [];

      if (errorMessages.length > 0) {
        toast.error(errorMessages.join(', '));
      } else {
        toast.error(backendMessage || "Merchant creation failed");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const updateMerchant = async (merchantId: string, updates: Partial<MerchantRecord>) => {
    setActionLoading(`update-${merchantId}`);
    try {
      await api.patch(`/auth/merchants/${merchantId}`, updates);
      toast.success("Merchant updated");
      await Promise.all([fetchMerchants(), fetchEscalationQueue()]);
      if (selected?.id === merchantId) {
        await fetchMerchantDashboard(merchantId);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Update failed");
    } finally {
      setActionLoading(null);
    }
  };

  const updateMerchantKyc = async (merchantId: string, kycStatus: NonNullable<MerchantRecord["kyc_status"]>) => {
    const disabledReason = merchantKycDisabledReason(kycStatus);
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }

    setActionLoading(`kyc-${merchantId}`);
    try {
      await api.patch(`/auth/merchants/${merchantId}/kyc`, {
        kyc_status: kycStatus,
        reason: kycStatus === "rejected" ? kycRejectReason.trim() : undefined,
      });
      toast.success(kycStatus === "verified" ? "Merchant KYC approved and account unlocked" : "Merchant KYC rejected with reason");
      setKycRejectReason("");
      await Promise.all([fetchMerchants(), fetchEscalationQueue(), fetchMerchantDashboard(merchantId)]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "KYC update failed");
    } finally {
      setActionLoading(null);
    }
  };

  const safeDocumentFileName = (value: string) => value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "merchant-kyc-document";

  const fetchMerchantKycDocumentBlob = async (kycDocument: MerchantKycDocumentUpload, label: string) => {
    if (!kycDocument.upload_id) {
      throw new Error(`${label} cannot be loaded because the upload reference is missing.`);
    }

    const response = await api.get(`/auth/uploads/${String(kycDocument.upload_id)}`, { responseType: "blob" });
    const contentType = String(response.headers?.["content-type"] || "application/octet-stream");
    const blob = response.data instanceof Blob && response.data.type
      ? response.data
      : new Blob([response.data], { type: contentType });
    return blob;
  };

  const triggerBlobFileAction = (blob: Blob, fileName: string, mode: "open" | "download") => {
    const objectUrl = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = objectUrl;

    if (mode === "download") {
      link.download = safeDocumentFileName(fileName);
    } else {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }

    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  };

  const openMerchantKycDocument = async (kycDocument: MerchantKycDocumentUpload | null, label: string) => {
    if (!kycDocument) {
      toast.error(`${label} is not uploaded yet`);
      return;
    }

    if (!kycDocument.upload_id) {
      if (kycDocument.url?.startsWith("http")) {
        window.open(kycDocument.url, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error(`${label} cannot be opened because the upload reference is missing`);
      return;
    }

    try {
      const blob = await fetchMerchantKycDocumentBlob(kycDocument, label);
      triggerBlobFileAction(blob, kycDocument.file_name || label, "open");
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || `Unable to open ${label}`);
    }
  };

  const downloadMerchantKycDocument = async (kycDocument: MerchantKycDocumentUpload | null, label: string) => {
    if (!kycDocument) {
      toast.error(`${label} is not uploaded yet`);
      return;
    }

    if (!kycDocument.upload_id) {
      if (kycDocument.url?.startsWith("http")) {
        const link = window.document.createElement("a");
        link.href = kycDocument.url;
        link.download = safeDocumentFileName(kycDocument.file_name || label);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      toast.error(`${label} cannot be downloaded because the upload reference is missing`);
      return;
    }

    try {
      const blob = await fetchMerchantKycDocumentBlob(kycDocument, label);
      triggerBlobFileAction(blob, kycDocument.file_name || label, "download");
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || `Unable to download ${label}`);
    }
  };

  const unlockMerchant = async (merchantId: string) => {
    setActionLoading(`unlock-${merchantId}`);
    try {
      await api.patch(`/auth/merchants/${merchantId}/unlock`);
      toast.success("Merchant account unlocked");
      await Promise.all([fetchMerchants(), fetchEscalationQueue()]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unlock failed");
    } finally {
      setActionLoading(null);
    }
  };

  const updateEscalation = async (status: NonNullable<MerchantRecord["escalation_status"]>) => {
    if (!selected) {
      toast.error("Select a merchant first");
      return;
    }

    if (["open", "in_progress"].includes(status) && selected.tier_level !== "Elite") {
      toast.error("Only Elite merchants can enter the escalation queue");
      return;
    }

    const note = escalationNote.trim();
    if (status !== "none" && note.length < 3) {
      toast.error("Write an escalation note first");
      return;
    }

    setActionLoading(`escalation-${selected.id}-${status}`);
    try {
      await api.patch(`/auth/merchants/${selected.id}/escalation`, {
        escalation_status: status,
        escalation_priority: escalationPriority,
        reason: status === "open" ? note : undefined,
        note,
        sla_hours: ["open", "in_progress"].includes(status) ? Number(escalationSlaHours || 12) : undefined,
      });
      toast.success("Elite escalation updated");
      setEscalationNote("");
      await Promise.all([fetchMerchants(), fetchEscalationQueue(), fetchMerchantDashboard(selected.id)]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Escalation update failed");
    } finally {
      setActionLoading(null);
    }
  };

  const viewQrCode = async (merchantId: string) => {
    setActionLoading(`qr-${merchantId}`);
    try {
      const { data } = await api.get(`/auth/merchants/${merchantId}/qr-code`);
      const qrData = data?.data;
      if (isQrDataUrl(qrData?.qr_code)) {
        const baseMerchant = merchants.find((merchant) => merchant.id === merchantId) || selected;
        const updatedMerchant = {
          ...(baseMerchant || {}),
          id: merchantId,
          qr_code: qrData.qr_code,
          referral_code: qrData.referral_code || baseMerchant?.referral_code,
          shop_name: qrData.shop_name || baseMerchant?.shop_name,
          merchant_name: qrData.merchant_name || baseMerchant?.merchant_name,
        } as MerchantRecord;

        setMerchants((current) => current.map((merchant) => (
          merchant.id === merchantId ? { ...merchant, ...updatedMerchant } : merchant
        )));
        setSelected((current) => current?.id === merchantId ? { ...current, ...updatedMerchant } : current);
        setQrPreview({
          merchant: updatedMerchant,
          qr_code: qrData.qr_code,
          referral_code: qrData.referral_code,
          merchant_name: qrData.merchant_name,
          shop_name: qrData.shop_name,
        });
      } else {
        toast.error("QR code could not be generated for this merchant");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "QR code fetch failed");
    } finally {
      setActionLoading(null);
    }
  };

  const regenerateQrCode = async (merchantId: string) => {
    setActionLoading(`qr-regenerate-${merchantId}`);
    try {
      const { data } = await api.post(`/auth/merchants/${merchantId}/qr-code`);
      const qrData = data?.data;
      if (!isQrDataUrl(qrData?.qr_code)) {
        toast.error("QR code regeneration did not return a valid image");
        return;
      }

      const baseMerchant = merchants.find((merchant) => merchant.id === merchantId) || selected;
      const updatedMerchant = {
        ...(baseMerchant || {}),
        id: merchantId,
        qr_code: qrData.qr_code,
        referral_code: qrData.referral_code || baseMerchant?.referral_code,
        shop_name: qrData.shop_name || baseMerchant?.shop_name,
        merchant_name: qrData.merchant_name || baseMerchant?.merchant_name,
      } as MerchantRecord;

      setMerchants((current) => current.map((merchant) => (
        merchant.id === merchantId ? { ...merchant, ...updatedMerchant } : merchant
      )));
      setSelected((current) => current?.id === merchantId ? { ...current, ...updatedMerchant } : current);
      setQrPreview({
        merchant: updatedMerchant,
        qr_code: qrData.qr_code,
        referral_code: qrData.referral_code,
        merchant_name: qrData.merchant_name,
        shop_name: qrData.shop_name,
      });
      toast.success("Merchant QR code regenerated");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "QR code regeneration failed");
    } finally {
      setActionLoading(null);
    }
  };

  const onRefreshClick = async () => {
    setActionLoading("refresh");
    await refreshAll();
    setActionLoading(null);
  };

  const summaryStats = useMemo(() => {
    const totalMerchants = merchants.length;
    const eliteCount = merchants.filter((m) => m.tier_level === "Elite").length;
    const priorityCount = merchants.filter((m) => m.tier_level === "Priority").length;
    const pendingKycCount = merchants.filter((m) => (m.kyc_status || "unverified") !== "verified").length;
    const activeEscalations = merchants.filter((m) => ["open", "in_progress"].includes(m.escalation_status || "none")).length;
    const totalCodPending = merchants.reduce((sum, m) => sum + (m.cod_balance || 0), 0);
    const totalReferrals = merchants.reduce((sum, m) => sum + (dashboard?.dashboard?.referralCount || 0), 0);

    return [
      { label: "Total Merchants", value: totalMerchants.toString(), color: "text-foreground" },
      { label: "Elite Tier", value: eliteCount.toString(), color: "text-warning" },
      { label: "Priority Tier", value: priorityCount.toString(), color: "text-primary" },
      { label: "Elite Escalations", value: activeEscalations.toString(), color: activeEscalations ? "text-warning" : "text-muted-foreground" },
      { label: "KYC Pending", value: pendingKycCount.toString(), color: "text-destructive" },
      { label: "Total COD Pending", value: `${formatUGX(totalCodPending)} UGX`, color: "text-destructive" },
      { label: "M2M Referrals", value: totalReferrals.toString(), color: "text-success" },
    ];
  }, [merchants, dashboard]);

  return (
    <div data-cmp="Merchants" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header title="Merchants" subtitle={`${merchants.length} registered merchants · M2M referral system active`} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card/50 sm:px-6 sm:py-4">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 gradient-orange text-white text-xs font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity shadow-custom"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Merchant
            </button>
            <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-2 sm:max-w-xs">
              <SearchIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none w-full"
                placeholder="Search merchants..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {["All", "Starter", "Active", "Priority", "Elite"].map((level) => (
              <button
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  selectedLevel === level ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {level}
              </button>
            ))}
            <button
              onClick={onRefreshClick}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {actionLoading === "refresh" ? <LoaderGlyph size="xs" label="Refreshing merchants" /> : <RefreshCwIcon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="hidden gap-3 px-4 py-4 sm:px-6 md:grid md:grid-cols-2 xl:grid-cols-4">
            {summaryStats.map((stat) => (
              <div key={stat.label} className="bg-card rounded-xl border border-border px-4 py-3 shadow-custom">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="hidden px-4 pb-4 sm:px-6 md:block">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-custom">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Priority queue</p>
                  <h2 className="mt-1 text-sm font-bold text-foreground">Elite merchant escalations</h2>
                </div>
                <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
                  {escalationQueue.length} active
                </span>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {escalationQueue.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background/70 p-3 text-xs text-muted-foreground lg:col-span-3">
                    No active Elite escalations. Open an escalation from an Elite merchant profile when support intervention is needed.
                  </div>
                ) : escalationQueue.slice(0, 6).map((merchant) => (
                  <button
                    key={merchant.id}
                    onClick={() => selectMerchant(merchant)}
                    className="rounded-xl border border-border bg-background/70 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">{merchant.shop_name}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{merchant.escalation_reason || "Escalation open"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getPriorityConfig(merchant.escalation_priority).classes}`}>
                        {getPriorityConfig(merchant.escalation_priority).label}
                      </span>
                    </div>
                    <p className={`mt-2 text-[10px] font-semibold ${merchant.escalation_sla_breached ? "text-destructive" : "text-muted-foreground"}`}>
                      SLA {merchant.escalation_sla_due_at ? new Date(merchant.escalation_sla_due_at).toLocaleString() : "not set"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="content-scroll flex-1 px-4 py-4 sm:px-6 md:pt-0">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {loading ? (
                <AppLoader variant="panel" label="Loading merchants" subtitle="Fetching merchant KYC, tier, and COD records." className="col-span-full" />
              ) : null}

              {!loading && filtered.length === 0 ? (
                <div className="w-full px-4 py-6 text-sm text-muted-foreground">No merchants match current filters.</div>
              ) : null}

              {filtered.map((m) => {
                const lc = levelConfig[m.tier_level];
                const progress = levelProgress(m.tier_level, m.total_deliveries);
                return (
                  <div
                    key={m.id}
                    onClick={() => selectMerchant(m)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectMerchant(m);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected?.id === m.id}
                    title={`Open ${m.shop_name} merchant details and KYC review`}
                    className={`w-full bg-card rounded-xl border shadow-custom cursor-pointer hover:border-primary/30 transition-all p-4 flex flex-col gap-3 ${
                      selected?.id === m.id ? "border-primary/50 wolan-glow" : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 gradient-orange rounded-xl flex items-center justify-center text-white text-sm font-bold">
                          {m.shop_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{m.shop_name}</p>
                          <p className="text-[10px] text-muted-foreground">{m.merchant_name}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border flex-shrink-0 ${lc.classes}`}>
                        {m.tier_level}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${getKycConfig(m.kyc_status).classes}`}>
                        {getKycConfig(m.kyc_status).label}
                      </span>
                      {m.account_locked ? (
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
                          Locked
                        </span>
                      ) : null}
                      {["open", "in_progress"].includes(m.escalation_status || "none") ? (
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${m.escalation_sla_breached ? "border-destructive/20 bg-destructive/10 text-destructive" : getEscalationConfig(m.escalation_status).classes}`}>
                          {m.escalation_sla_breached ? "SLA Breach" : getEscalationConfig(m.escalation_status).label}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{m.total_deliveries}</p>
                        <p className="text-[10px] text-muted-foreground">All Time</p>
                      </div>
                      <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-primary">{dashboard?.dashboard?.referralCount || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Referrals</p>
                      </div>
                      <div className="flex-1 bg-muted rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-success">{dashboard?.dashboard?.cod?.totalCount || 0}</p>
                        <p className="text-[10px] text-muted-foreground">COD Orders</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground">Level Progress</span>
                        <span className="text-[10px] font-bold text-foreground">{progress}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-700 ${
                            m.tier_level === "Elite" ? "gradient-orange" : m.tier_level === "Priority" ? "gradient-blue" : "gradient-green"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Wallet Balance</p>
                        <p className="text-xs font-bold text-success">{formatUGX(m.earnings)} UGX</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Pending COD</p>
                        <p className={`text-xs font-bold ${m.cod_balance > 0 ? "text-warning" : "text-muted-foreground"}`}>
                          {formatUGX(m.cod_balance)} UGX
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
                      <div className="flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" />
                        {m.address}
                      </div>
                      <div className="flex items-center gap-1">
                        <PhoneIcon className="w-3 h-3" />
                        {m.phone}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="hidden w-full min-w-0 flex-shrink-0 border-t border-border bg-card xl:flex xl:w-96 xl:flex-col xl:border-l xl:border-t-0">
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 gradient-orange rounded-xl flex items-center justify-center text-white font-bold">
                {selected?.shop_name.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "—"}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{selected?.shop_name ?? "Select a merchant"}</p>
                <p className="text-xs text-muted-foreground">{selected?.id ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${levelConfig[selected?.tier_level ?? "Starter"]?.classes}`}>
                {selected?.tier_level ?? "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">Joined {selected?.createdAt ? new Date(selected.createdAt).toLocaleDateString() : "—"}</span>
            </div>
          </div>

          <div className="border-b border-border bg-card px-4 py-3">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
              {mobileMerchantTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileMerchantTab(tab.id)}
                  className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors ${
                    mobileMerchantTab === tab.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <div className={mobileMerchantTab === "overview" ? "flex flex-col gap-4" : "hidden"}>
            {[
              { icon: UserIcon, label: "Owner", value: selected?.merchant_name },
              { icon: PhoneIcon, label: "Phone", value: selected?.phone },
              { icon: MapPinIcon, label: "Address", value: selected?.address },
              { icon: PackageIcon, label: "Total Deliveries", value: String(selected?.total_deliveries ?? "—") },
              { icon: ShieldCheckIcon, label: "KYC Status", value: getKycConfig(selected?.kyc_status).label },
              { icon: UsersIcon, label: "M2M Referrals", value: String(dashboard?.dashboard?.referralCount ?? "—") },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className="text-xs font-medium text-foreground">{item.value ?? "—"}</p>
                  </div>
                </div>
              );
            })}

            <div className="bg-muted rounded-xl p-3 flex flex-col gap-2 mt-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Financial Overview</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Wallet Balance</span>
                <span className="text-xs font-bold text-success">{formatUGX(selected?.earnings)} UGX</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pending COD</span>
                <span className={`text-xs font-bold ${selected?.cod_balance ? "text-warning" : "text-muted-foreground"}`}>
                  {formatUGX(selected?.cod_balance)} UGX
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">COD Status</span>
                <span className={`text-xs font-semibold ${selected?.cod_balance ? "text-primary" : "text-muted-foreground"}`}>
                  {selected?.cod_balance ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>

            </div>
            <div className={mobileMerchantTab === "legal" ? "flex flex-col gap-4" : "hidden"}>
            <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-muted p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Legal Agreements</p>
                  <p className="mt-1 truncate text-xs font-semibold text-foreground">
                    {selectedMerchantLegalComplete ? `${selectedPolicyAcceptances.length} current agreements accepted` : "Required merchant agreements pending"}
                  </p>
                </div>
                <ShieldCheckIcon className={`h-4 w-4 ${selectedMerchantLegalComplete ? "text-success" : "text-warning"}`} />
              </div>
              {selectedMerchantLegalComplete ? (
                <div className="mt-3 grid min-w-0 max-w-full gap-2 overflow-hidden">
                  {selectedPolicyAcceptances.map((agreement) => (
                    <div key={agreement.key} className="min-w-0 max-w-full overflow-hidden rounded-lg bg-background/70 px-3 py-2">
                      <p className="block w-full max-w-full truncate text-xs font-semibold text-foreground" title={agreement.title}>{agreement.title}</p>
                      <p className="mt-1 max-w-full break-words text-[10px] leading-snug text-muted-foreground">
                        Version {agreement.version} | {agreement.accepted_at ? new Date(agreement.accepted_at).toLocaleString() : "Accepted"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-warning/20 bg-warning/10 p-3">
                  <p className="text-[11px] leading-relaxed text-warning">
                    Merchant operations stay blocked until the merchant accepts the current policy documents from their KYC portal.
                  </p>
                  <div className="mt-2 grid min-w-0 gap-2">
                    {merchantPolicies.map((policy) => (
                      <div
                        key={policy.key}
                        title={policy.title}
                        className={`flex min-w-0 w-full max-w-full items-center justify-between gap-2 overflow-hidden rounded-md border px-2.5 py-2 text-[11px] font-semibold ${
                          policy.file_available === false
                            ? "cursor-not-allowed border-warning/20 bg-background/70 text-warning"
                            : "border-border bg-background/70 text-foreground"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{policy.title}</span>
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openMerchantPolicyDocument(policy)}
                            disabled={policy.file_available === false}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            title={policy.file_available === false ? "This policy file is missing on the server." : `Open ${policy.title}`}
                            aria-label={`Open ${policy.title}`}
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMerchantPolicyDocument(policy)}
                            disabled={policy.file_available === false}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            title={policy.file_available === false ? "This policy file is missing on the server." : `Download ${policy.title}`}
                            aria-label={`Download ${policy.title}`}
                          >
                            <DownloadIcon className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedMerchantUnavailablePolicies.length > 0 ? (
                    <p className="mt-2 text-[10px] font-semibold text-warning">Required policy files are missing on the server.</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-primary">Elite Escalation</p>
                  <p className="mt-1 text-xs text-muted-foreground">Priority queue, SLA flag, and admin action trail.</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${selected?.escalation_sla_breached ? "border-destructive/20 bg-destructive/10 text-destructive" : getEscalationConfig(selected?.escalation_status).classes}`}>
                  {selected?.escalation_sla_breached ? "SLA Breach" : getEscalationConfig(selected?.escalation_status).label}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[10px] text-muted-foreground">
                <span>Priority: <strong className="text-foreground">{getPriorityConfig(selected?.escalation_priority).label}</strong></span>
                <span>SLA: <strong className={selected?.escalation_sla_breached ? "text-destructive" : "text-foreground"}>{selected?.escalation_sla_due_at ? new Date(selected.escalation_sla_due_at).toLocaleString() : "Not set"}</strong></span>
                <span>Reason: <strong className="text-foreground">{selected?.escalation_reason || "None"}</strong></span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CustomSelect
                  value={escalationPriority}
                  onValueChange={(nextValue) => setEscalationPriority(nextValue as "normal" | "high" | "urgent")}
                  ariaLabel="Escalation priority"
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "High" },
                    { value: "urgent", label: "Urgent" },
                  ]}
                  triggerClassName="h-10 rounded-lg bg-background/80 py-2"
                />
                <input
                  value={escalationSlaHours}
                  onChange={(event) => setEscalationSlaHours(event.target.value)}
                  type="number"
                  min={1}
                  max={168}
                  className="rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
                  placeholder="SLA hours"
                />
              </div>
              <textarea
                value={escalationNote}
                onChange={(event) => setEscalationNote(event.target.value)}
                rows={2}
                placeholder={selected?.tier_level === "Elite" ? "Escalation reason or admin action note" : "Upgrade merchant to Elite before opening an escalation"}
                className="mt-2 w-full resize-none rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateEscalation("open")}
                  title={escalationDisabledReason("open") || "Open this Elite merchant escalation with SLA tracking."}
                  disabled={!selected || selected.tier_level !== "Elite" || actionLoading === `escalation-${selected.id}-open`}
                  className="rounded-lg bg-warning px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Open
                </button>
                <button
                  onClick={() => updateEscalation("in_progress")}
                  title={escalationDisabledReason("in_progress") || "Move this Elite escalation into active handling."}
                  disabled={!selected || selected.tier_level !== "Elite" || actionLoading === `escalation-${selected.id}-in_progress`}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  In Progress
                </button>
                <button
                  onClick={() => updateEscalation("resolved")}
                  title={escalationDisabledReason("resolved") || "Resolve this active Elite escalation."}
                  disabled={!selected || !["open", "in_progress"].includes(selected.escalation_status || "none") || actionLoading === `escalation-${selected.id}-resolved`}
                  className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Resolve
                </button>
                <button
                  onClick={() => updateEscalation("dismissed")}
                  title={escalationDisabledReason("dismissed") || "Dismiss this active Elite escalation."}
                  disabled={!selected || !["open", "in_progress"].includes(selected.escalation_status || "none") || actionLoading === `escalation-${selected.id}-dismissed`}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-background/70 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Action trail</p>
                <div className="mt-2 flex flex-col gap-2">
                  {(selected?.escalation_action_trail || []).slice().reverse().slice(0, 5).map((entry, index) => (
                    <div key={`${entry.action}-${index}`} className="border-l-2 border-primary/30 pl-2">
                      <p className="text-[10px] font-semibold text-foreground">{entry.from_status || "none"} -&gt; {entry.to_status || "none"} · {entry.priority || "normal"}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.note || "Escalation action recorded"}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.actor_role || "admin"} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</p>
                    </div>
                  ))}
                  {(!selected?.escalation_action_trail || selected.escalation_action_trail.length === 0) ? (
                    <p className="text-[10px] text-muted-foreground">No escalation actions yet.</p>
                  ) : null}
                </div>
              </div>
            </div>

            </div>
            <div className={mobileMerchantTab === "kyc" ? "flex flex-col gap-4" : "hidden"}>
            <div className="rounded-xl border border-border bg-muted p-3">
              <div className="flex items-center gap-2">
                {(selected?.kyc_status || "unverified") === "verified" ? (
                  <ShieldCheckIcon className="h-4 w-4 text-success" />
                ) : (
                  <ShieldAlertIcon className="h-4 w-4 text-warning" />
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Security and KYC</p>
                  <p className={`text-xs font-semibold ${getKycConfig(selected?.kyc_status).textClass}`}>
                    {getKycConfig(selected?.kyc_status).label}
                  </p>
                </div>
              </div>
              {selected?.account_locked ? (
                <p className="mt-2 text-xs text-destructive">{selected.locked_reason || "Account is locked after failed login attempts."}</p>
              ) : null}
              {selected?.kyc_rejection_reason ? (
                <p className="mt-2 text-xs text-destructive">{selected.kyc_rejection_reason}</p>
              ) : null}
              <div className="mt-3 rounded-lg border border-border bg-background/70 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted KYC details</p>
                {selected?.kyc_submission?.submitted_at ? (
                  <div className="mt-2 grid gap-2 text-[10px] text-muted-foreground">
                    <span>Legal business: <strong className="text-foreground">{selected.kyc_submission.legal_business_name || "-"}</strong></span>
                    <span>Registration: <strong className="text-foreground">{selected.kyc_submission.business_registration_number || "-"}</strong></span>
                    <span>TIN: <strong className="text-foreground">{selected.kyc_submission.tin_number || "-"}</strong></span>
                    <span>Owner: <strong className="text-foreground">{selected.kyc_submission.owner_full_name || "-"}</strong></span>
                    <span>Owner ID: <strong className="text-foreground">{selected.kyc_submission.owner_id_number || "-"}</strong></span>
                    <span>Owner phone: <strong className="text-foreground">{selected.kyc_submission.owner_phone || "-"}</strong></span>
                    <span>Submitted: <strong className="text-foreground">{new Date(selected.kyc_submission.submitted_at).toLocaleString()}</strong></span>
                    <span>Reviewed: <strong className="text-foreground">{selected.kyc_submission.reviewed_at ? new Date(selected.kyc_submission.reviewed_at).toLocaleString() : "Waiting"}</strong></span>
                    <div className="grid min-w-0 gap-2">
                      <span className="font-semibold text-foreground">Uploaded documents</span>
                      {requiredMerchantKycDocumentTypes.map((documentType) => {
                        const kycDocument = selected.kyc_submission?.document_uploads?.find((item) => item.type === documentType) || null;
                        const documentLabel = merchantKycDocumentLabels[documentType];
                        const hasUpload = Boolean(kycDocument?.upload_id || kycDocument?.url?.startsWith("http"));
                        return (
                          <div
                            key={documentType}
                            className={`flex min-w-0 w-full max-w-full items-center justify-between gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-left text-[10px] font-semibold ${
                              hasUpload ? "border-border bg-card text-foreground" : "border-warning/20 bg-warning/5 text-warning"
                            }`}
                            title={hasUpload ? `${documentLabel} is ready to open or download.` : `${documentLabel} is missing.`}
                          >
                            <span className="inline-flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                              {hasUpload ? <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-primary" /> : <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 text-warning" />}
                              <span className="min-w-0 flex-1 truncate">{documentLabel}</span>
                            </span>
                            {hasUpload ? (
                              <span className="inline-flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openMerchantKycDocument(kycDocument, documentLabel)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                                  title={`Open ${documentLabel}`}
                                  aria-label={`Open ${documentLabel}`}
                                >
                                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadMerchantKycDocument(kycDocument, documentLabel)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                                  title={`Download ${documentLabel}`}
                                  aria-label={`Download ${documentLabel}`}
                                >
                                  <DownloadIcon className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-md border border-warning/20 bg-warning/10 px-2 py-1 text-[9px] text-warning">Missing</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selected.kyc_submission.document_links?.length ? (
                      <span className="break-all">Documents: <strong className="text-foreground">{selected.kyc_submission.document_links.join(", ")}</strong></span>
                    ) : null}
                    {selected.kyc_submission.document_notes ? (
                      <span>Notes: <strong className="text-foreground">{selected.kyc_submission.document_notes}</strong></span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">No merchant-submitted KYC details yet. Approval remains blocked until the merchant submits the KYC screen.</p>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-destructive">Rejection reason</p>
                <textarea
                  value={kycRejectReason}
                  onChange={(event) => setKycRejectReason(event.target.value)}
                  rows={3}
                  placeholder="Explain exactly what the merchant must fix before resubmitting documents"
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-foreground outline-none focus:border-destructive"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Required only when rejecting. This reason is shown to the merchant and upload is re-enabled immediately.</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => selected && updateMerchantKyc(selected.id, "verified")}
                  title={merchantKycDisabledReason("verified") || "Approve this merchant KYC and unlock operational access immediately."}
                  disabled={Boolean(merchantKycDisabledReason("verified"))}
                  className="min-w-0 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Verify / Approve
                </button>
                <button
                  onClick={() => selected && updateMerchantKyc(selected.id, "rejected")}
                  title={merchantKycDisabledReason("rejected") || "Reject this merchant KYC."}
                  disabled={Boolean(merchantKycDisabledReason("rejected"))}
                  className="min-w-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                >
                  Reject KYC
                </button>
                <button
                  onClick={() => selected && unlockMerchant(selected.id)}
                  title={merchantActionDisabledReason("unlock") || "Unlock this merchant account after admin review."}
                  disabled={!selected || !selected.account_locked || actionLoading === `unlock-${selected.id}`}
                  className="col-span-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  <LockOpenIcon className="h-3.5 w-3.5" />
                  Unlock Account
                </button>
              </div>
            </div>

            </div>
            <div className={mobileMerchantTab === "actions" ? "flex flex-col gap-4" : "hidden"}>
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <button
                onClick={() => selected && viewQrCode(selected.id)}
                title={merchantActionDisabledReason("qr") || "Load and display this merchant QR code from the backend."}
                disabled={!selected || actionLoading === `qr-${selected.id}`}
                className="w-full gradient-orange text-white text-xs font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <LoadingButtonContent loading={Boolean(selected && actionLoading === `qr-${selected.id}`)} label="View QR Code" loadingLabel="Loading QR" />
              </button>
              <button
                onClick={() => selected && updateMerchant(selected.id, { tier_level: selected.tier_level === "Elite" ? "Priority" : "Elite" })}
                title={merchantActionDisabledReason("tier") || "Toggle this merchant between Priority and Elite tier."}
                disabled={!selected || actionLoading === `update-${selected.id}`}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                Upgrade Level
              </button>
              <button
                onClick={() => selected && updateMerchant(selected.id, { status: selected.status === "active" ? "suspended" : "active" })}
                title={merchantActionDisabledReason("status") || "Suspend or activate this merchant account."}
                disabled={!selected || actionLoading === `update-${selected.id}`}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                {selected?.status === "active" ? "Suspend Account" : "Activate Account"}
              </button>
              <button
                onClick={() => {
                  if (!selected) {
                    toast.error("Select a merchant first");
                    return;
                  }
                  navigate(`/orders?merchant=${encodeURIComponent(selected.id)}`);
                }}
                title={merchantActionDisabledReason("orders") || "Open this merchant's filtered order list."}
                disabled={!selected}
                className="w-full bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
                View Orders
              </button>
            </div>
            </div>
          </div>
        </div>

        {mobileMerchantOpen && selected ? (
          <div className="fixed inset-0 z-[90] flex flex-col bg-background xl:hidden">
            <div className="border-b border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMobileMerchantOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground"
                  aria-label="Back to merchants"
                >
                  <ChevronRightIcon className="h-4 w-4 rotate-180" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">{selected.shop_name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{selected.merchant_name} - {selected.phone}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${getKycConfig(selected.kyc_status).classes}`}>
                  {getKycConfig(selected.kyc_status).label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                {mobileMerchantTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileMerchantTab(tab.id)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-colors ${
                      mobileMerchantTab === tab.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {mobileMerchantTab === "overview" ? (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchant profile</p>
                    <div className="mt-2 grid gap-2 text-xs">
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Owner</span><strong className="truncate text-foreground">{selected.merchant_name}</strong></span>
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Phone</span><strong className="truncate text-foreground">{selected.phone}</strong></span>
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Tier</span><strong className="truncate text-primary">{selected.tier_level}</strong></span>
                      <span className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><strong className="truncate text-foreground">{selected.status}</strong></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deliveries</p>
                      <p className="mt-1 text-xl font-black text-foreground">{selected.total_deliveries}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Referrals</p>
                      <p className="mt-1 text-xl font-black text-primary">{dashboard?.dashboard?.referralCount || 0}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Wallet</p>
                      <p className="mt-1 text-sm font-black text-success">{formatUGX(selected.earnings)} UGX</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending COD</p>
                      <p className={`mt-1 text-sm font-black ${selected.cod_balance ? "text-warning" : "text-muted-foreground"}`}>{formatUGX(selected.cod_balance)} UGX</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Address</p>
                    <p className="mt-1 text-xs text-foreground">{selected.address || "-"}</p>
                  </div>
                </div>
              ) : null}

              {mobileMerchantTab === "legal" ? (
                <div className="grid gap-3">
                  <div className={`rounded-xl border p-3 ${selectedMerchantLegalComplete ? "border-success/20 bg-success/10" : "border-warning/20 bg-warning/10"}`}>
                    <p className={`text-[10px] uppercase tracking-wider ${selectedMerchantLegalComplete ? "text-success" : "text-warning"}`}>Legal agreements</p>
                    <p className="mt-1 text-xs font-semibold text-foreground">
                      {selectedMerchantLegalComplete ? `${selectedPolicyAcceptances.length} current agreements accepted` : "Required merchant agreements pending"}
                    </p>
                  </div>

                  {selectedMerchantLegalComplete ? (
                    selectedPolicyAcceptances.map((agreement) => (
                      <div key={agreement.key} className="rounded-xl border border-border bg-card p-3">
                        <p className="truncate text-xs font-semibold text-foreground">{agreement.title}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">Version {agreement.version} - {agreement.accepted_at ? new Date(agreement.accepted_at).toLocaleString() : "Accepted"}</p>
                      </div>
                    ))
                  ) : (
                    merchantPolicies.map((policy) => (
                      <div key={policy.key} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{policy.title}</span>
                        <span className="inline-flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => openMerchantPolicyDocument(policy)}
                            disabled={policy.file_available === false}
                            className="h-8 w-8 rounded-lg border border-border text-muted-foreground disabled:opacity-50"
                            aria-label={`Open ${policy.title}`}
                          >
                            <ExternalLinkIcon className="mx-auto h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMerchantPolicyDocument(policy)}
                            disabled={policy.file_available === false}
                            className="h-8 w-8 rounded-lg border border-border text-muted-foreground disabled:opacity-50"
                            aria-label={`Download ${policy.title}`}
                          >
                            <DownloadIcon className="mx-auto h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {mobileMerchantTab === "kyc" ? (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">KYC status</p>
                    <p className={`mt-1 text-sm font-bold ${getKycConfig(selected.kyc_status).textClass}`}>{getKycConfig(selected.kyc_status).label}</p>
                    {selected.kyc_rejection_reason ? <p className="mt-2 text-xs text-destructive">{selected.kyc_rejection_reason}</p> : null}
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted details</p>
                    {selected.kyc_submission?.submitted_at ? (
                      <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
                        <span>Legal business: <strong className="text-foreground">{selected.kyc_submission.legal_business_name || "-"}</strong></span>
                        <span>Registration: <strong className="text-foreground">{selected.kyc_submission.business_registration_number || "-"}</strong></span>
                        <span>TIN: <strong className="text-foreground">{selected.kyc_submission.tin_number || "-"}</strong></span>
                        <span>Owner: <strong className="text-foreground">{selected.kyc_submission.owner_full_name || "-"}</strong></span>
                        <span>Owner phone: <strong className="text-foreground">{selected.kyc_submission.owner_phone || "-"}</strong></span>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No merchant-submitted KYC details yet.</p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    {requiredMerchantKycDocumentTypes.map((documentType) => {
                      const kycDocument = selected.kyc_submission?.document_uploads?.find((item) => item.type === documentType) || null;
                      const documentLabel = merchantKycDocumentLabels[documentType];
                      const hasUpload = Boolean(kycDocument?.upload_id || kycDocument?.url?.startsWith("http"));
                      return (
                        <div key={documentType} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${hasUpload ? "border-border bg-card" : "border-warning/20 bg-warning/5"}`}>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{documentLabel}</span>
                          {hasUpload ? (
                            <span className="inline-flex shrink-0 gap-1">
                              <button type="button" onClick={() => openMerchantKycDocument(kycDocument, documentLabel)} className="h-8 w-8 rounded-lg border border-border text-muted-foreground" aria-label={`Open ${documentLabel}`}>
                                <ExternalLinkIcon className="mx-auto h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => downloadMerchantKycDocument(kycDocument, documentLabel)} className="h-8 w-8 rounded-lg border border-border text-muted-foreground" aria-label={`Download ${documentLabel}`}>
                                <DownloadIcon className="mx-auto h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : (
                            <span className="rounded-md border border-warning/20 bg-warning/10 px-2 py-1 text-[9px] text-warning">Missing</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-destructive">Rejection reason</p>
                    <textarea
                      value={kycRejectReason}
                      onChange={(event) => setKycRejectReason(event.target.value)}
                      rows={2}
                      placeholder="Explain exactly what the merchant must fix"
                      className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
                    />
                  </div>
                </div>
              ) : null}

              {mobileMerchantTab === "actions" ? (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateMerchantKyc(selected.id, "verified")}
                      title={merchantKycDisabledReason("verified") || "Approve this merchant KYC and unlock operational access immediately."}
                      disabled={Boolean(merchantKycDisabledReason("verified"))}
                      className="rounded-lg bg-success px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Verify
                    </button>
                    <button
                      onClick={() => updateMerchantKyc(selected.id, "rejected")}
                      title={merchantKycDisabledReason("rejected") || "Reject this merchant KYC."}
                      disabled={Boolean(merchantKycDisabledReason("rejected"))}
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>

                  <button onClick={() => viewQrCode(selected.id)} disabled={actionLoading === `qr-${selected.id}`} className="rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                    <LoadingButtonContent loading={actionLoading === `qr-${selected.id}`} label="View QR Code" loadingLabel="Loading QR" />
                  </button>
                  <button onClick={() => updateMerchant(selected.id, { tier_level: selected.tier_level === "Elite" ? "Priority" : "Elite" })} disabled={actionLoading === `update-${selected.id}`} className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50">
                    Toggle Priority / Elite
                  </button>
                  <button onClick={() => updateMerchant(selected.id, { status: selected.status === "active" ? "suspended" : "active" })} disabled={actionLoading === `update-${selected.id}`} className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50">
                    {selected.status === "active" ? "Suspend Account" : "Activate Account"}
                  </button>
                  <button onClick={() => unlockMerchant(selected.id)} disabled={!selected.account_locked || actionLoading === `unlock-${selected.id}`} className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50">
                    Unlock Account
                  </button>
                  <button onClick={() => navigate(`/orders?merchant=${encodeURIComponent(selected.id)}`)} className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-foreground">
                    View Orders
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {qrPreview ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 py-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-custom">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary">Merchant QR</p>
                <h2 className="mt-1 truncate text-lg font-black text-foreground">{qrPreview.shop_name || qrPreview.merchant.shop_name}</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">{qrPreview.merchant_name || qrPreview.merchant.merchant_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                aria-label="Close QR preview"
              >
                x
              </button>
            </div>

            <div className="mt-5 grid place-items-center rounded-2xl border border-border bg-white p-5">
              <img src={qrPreview.qr_code} alt={`QR code for ${qrPreview.shop_name || qrPreview.merchant.shop_name}`} className="h-56 w-56 max-w-full object-contain" />
            </div>

            <div className="mt-4 grid gap-2 text-xs">
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merchant ID</p>
                <p className="mt-1 break-all font-semibold text-foreground">{qrPreview.merchant.id}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Referral Code</p>
                <p className="mt-1 font-mono text-sm font-black text-primary">{qrPreview.referral_code || qrPreview.merchant.referral_code || "-"}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => downloadQrCode(qrPreview.qr_code, qrPreview.shop_name || qrPreview.merchant.shop_name || qrPreview.merchant.id)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-white"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Download QR
              </button>
              <button
                type="button"
                onClick={() => regenerateQrCode(qrPreview.merchant.id)}
                disabled={actionLoading === `qr-regenerate-${qrPreview.merchant.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                <RefreshCwIcon className="h-3.5 w-3.5" />
                <LoadingButtonContent loading={actionLoading === `qr-regenerate-${qrPreview.merchant.id}`} label="Regenerate" loadingLabel="Regenerating" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-4 backdrop-blur-sm transition-opacity duration-200 ${showAdd ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-custom sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">Add New Merchant</h2>
            </div>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">✕</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Business Name</label>
              <input
                value={createForm.merchant_name}
                onChange={(event) => setCreateForm((current) => ({ ...current, merchant_name: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Shop Name</label>
              <input
                value={createForm.shop_name}
                onChange={(event) => setCreateForm((current) => ({ ...current, shop_name: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Building Name</label>
              <input
                value={createForm.building_name}
                onChange={(event) => setCreateForm((current) => ({ ...current, building_name: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Phone Number</label>
              <input
                value={createForm.phone}
                onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Address</label>
              <input
                value={createForm.address}
                onChange={(event) => setCreateForm((current) => ({ ...current, address: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Password</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Referral Code (Optional)</label>
              <input
                value={createForm.referred_by}
                onChange={(event) => setCreateForm((current) => ({ ...current, referred_by: event.target.value }))}
                className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Starting Level</label>
              <CustomSelect
                value={createForm.tier_level}
                onValueChange={(nextValue) => setCreateForm((current) => ({ ...current, tier_level: nextValue as CreateMerchantForm['tier_level'] }))}
                ariaLabel="Merchant starting level"
                options={[
                  { value: "Starter", label: "Starter" },
                  { value: "Active", label: "Active" },
                  { value: "Priority", label: "Priority" },
                  { value: "Elite", label: "Elite" },
                ]}
                triggerClassName="h-10 rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-muted text-foreground text-xs font-medium py-2.5 rounded-lg hover:bg-accent transition-colors">Cancel</button>
            <button
              onClick={createMerchant}
              title={merchantActionDisabledReason("create") || "Create this merchant through the backend."}
              className="flex-1 gradient-orange text-white text-xs font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              disabled={actionLoading === "create-merchant"}
            >
              <LoadingButtonContent loading={actionLoading === "create-merchant"} label="Register Merchant" loadingLabel="Creating merchant" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
