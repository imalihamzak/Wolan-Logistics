import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { getDeviceSecurityHeaders } from "../lib/deviceSecurity";
import { useAuth } from "../contexts/AuthContext";
import { LoaderGlyph } from "../components/AppLoader";
import WorkflowStepper from "../components/WorkflowStepper";
import { Button } from "../components/ui/button";
import { CustomSelect } from "../components/ui/custom-select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  AppleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BikeIcon,
  CameraIcon,
  CarIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  TruckIcon,
  UploadCloudIcon,
} from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email").min(1, "Email required"),
  password: z.string().min(6, "Password too short").max(100),
});

type LoginForm = z.infer<typeof loginSchema>;
type AuthMode = "password" | "otp" | "register";
type OtpStep = "phone" | "code" | "details" | "vehicle";
type VehicleType = "moto" | "voiture" | "velo";
type DriverDocumentType = "id_card" | "license" | "rider_photo" | "bike_photo";
type PolicyAudience = "merchant" | "rider";

type PolicyDocument = {
  key: string;
  audience: PolicyAudience;
  title: string;
  version: string;
  file_name: string;
  required: boolean;
  file_available?: boolean;
  download_url?: string;
};

const countryOptions = [
  { code: "+256", country: "Uganda" },
  { code: "+92", country: "Pakistan" },
  { code: "+254", country: "Kenya" },
  { code: "+255", country: "Tanzania" },
  { code: "+250", country: "Rwanda" },
];

const emptyMerchantRegistration = {
  merchant_name: "",
  shop_name: "",
  building_name: "",
  email: "",
  password: "",
  address: "",
  referred_by: "",
};

const emptyDriverRegistration = {
  full_name: "",
  years_experience: "",
  district: "",
  division: "",
  boda_stage: "",
  stage_chairman_phone: "",
  vehicle_type: "",
  bike_plate: "",
  nin_number: "",
  next_of_kin_name: "",
  next_of_kin_phone: "",
  next_of_kin_relationship: "",
};

const emptyDriverDocumentFiles = (): Record<DriverDocumentType, File | null> => ({
  id_card: null,
  license: null,
  rider_photo: null,
  bike_photo: null,
});

const vehicleOptions: Array<{
  value: VehicleType;
  title: string;
  subtitle: string;
  description: string;
  Icon: typeof TruckIcon;
}> = [
  {
    value: "moto",
    title: "Moto",
    subtitle: "Boda Boda",
    description: "Fast motorcycle dispatch for standard parcels.",
    Icon: TruckIcon,
  },
  {
    value: "voiture",
    title: "Voiture",
    subtitle: "Car / Van",
    description: "Best for large or oversized customer packages.",
    Icon: CarIcon,
  },
  {
    value: "velo",
    title: "Velo",
    subtitle: "Bicycle",
    description: "Lightweight city delivery for small items.",
    Icon: BikeIcon,
  },
];

const driverDocumentOptions: Array<{
  type: DriverDocumentType;
  label: string;
  helper: string;
  required?: boolean;
}> = [
  { type: "id_card", label: "National ID / Passport", helper: "Camera or file", required: true },
  { type: "license", label: "Driving Permit", helper: "Camera or file", required: true },
  { type: "rider_photo", label: "Rider Photograph", helper: "Camera or file", required: true },
  { type: "bike_photo", label: "Bike Photograph", helper: "Camera or file", required: true },
];

const kampalaDistrictOptions = [
  { value: "Kampala", label: "Kampala" },
  { value: "Wakiso", label: "Wakiso" },
  { value: "Mukono", label: "Mukono" },
];

const kampalaDivisionOptions = [
  { value: "Central", label: "Central" },
  { value: "Kawempe", label: "Kawempe" },
  { value: "Makindye", label: "Makindye" },
  { value: "Nakawa", label: "Nakawa" },
  { value: "Rubaga", label: "Rubaga" },
  { value: "Other", label: "Other / Field stage" },
];

const extractPayload = (response: any) => response?.data?.data || response?.data || {};

const buildPhoneNumber = (countryCode: string, value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    return trimmed.replace(/\s+/g, "");
  }

  const digits = trimmed.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return `${countryCode}${digits}`;
};

const GoogleIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.74-.07-1.45-.19-2.14H12v4.05h5.38a4.6 4.6 0 0 1-1.99 3.02v2.52h3.23c1.89-1.74 2.98-4.31 2.98-7.45Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.42l-3.23-2.52c-.9.6-2.04.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H3.08v2.6A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.41 13.89A6 6 0 0 1 6.09 12c0-.66.11-1.29.32-1.89v-2.6H3.08A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.49l3.33-2.6Z" />
    <path fill="#EA4335" d="M12 5.99c1.47 0 2.79.51 3.82 1.5l2.87-2.87C16.95 3 14.7 2 12 2a10 10 0 0 0-8.92 5.51l3.33 2.6C7.2 7.75 9.4 5.99 12 5.99Z" />
  </svg>
);

const homeForAuthenticatedRole = (role?: string) => {
  if (role === "merchant") return "/merchant/dashboard";
  if (role === "rider") return "/driver/dashboard";
  if (["super_admin", "director", "general_manager"].includes(role || "")) return "/hq-dashboard";
  if (["coo", "regional_manager"].includes(role || "")) return "/regional-dashboard";
  if (["hub_manager", "ops_coordinator"].includes(role || "")) return "/hub-dashboard";
  return "/dashboard";
};

type PhoneInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  onCountryCodeChange: (value: string) => void;
  disabled?: boolean;
};

const PhoneInput = React.memo(function PhoneInput({
  id,
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  disabled = false,
}: PhoneInputProps) {
  return (
    <div className="grid grid-cols-[minmax(8.75rem,9.75rem)_minmax(0,1fr)] items-stretch gap-2 max-[380px]:grid-cols-1">
      <CustomSelect
        value={countryCode}
        onValueChange={onCountryCodeChange}
        disabled={disabled}
        disabledReason="Phone country code is locked while the request is processing."
        ariaLabel="Country calling code"
        options={countryOptions.map((country) => ({
          value: country.code,
          label: `${country.country} ${country.code}`,
        }))}
        triggerClassName="h-12 rounded-xl border border-border bg-background/80 text-sm font-medium shadow-none"
      />
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="700 000 000"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-12 rounded-xl border-border bg-background/80 shadow-none"
      />
    </div>
  );
});

export default function Login() {
  const { login: authLogin, loginWithOtp, registerWithPhone, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<AuthMode>("password");
  const [countryCode, setCountryCode] = React.useState("+256");
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [resendAfter, setResendAfter] = React.useState(0);
  const [registerPhone, setRegisterPhone] = React.useState("");
  const [registerOtp, setRegisterOtp] = React.useState("");
  const [registerStep, setRegisterStep] = React.useState<OtpStep>("phone");
  const [merchantDetailStep, setMerchantDetailStep] = React.useState(0);
  const [driverDetailStep, setDriverDetailStep] = React.useState(0);
  const [driverOnboardingStep, setDriverOnboardingStep] = React.useState(0);
  const [registrationToken, setRegistrationToken] = React.useState("");
  const [merchantRegistration, setMerchantRegistration] = React.useState(emptyMerchantRegistration);
  const [driverRegistration, setDriverRegistration] = React.useState(emptyDriverRegistration);
  const [driverDocumentFiles, setDriverDocumentFiles] = React.useState<Record<DriverDocumentType, File | null>>(emptyDriverDocumentFiles);
  const [createdDriverRider, setCreatedDriverRider] = React.useState<any>(null);
  const [policyDocuments, setPolicyDocuments] = React.useState<Record<PolicyAudience, PolicyDocument[]>>({ merchant: [], rider: [] });
  const [acceptedPolicies, setAcceptedPolicies] = React.useState<Record<PolicyAudience, string[]>>({ merchant: [], rider: [] });
  const [policyLoading, setPolicyLoading] = React.useState<Record<PolicyAudience, boolean>>({ merchant: false, rider: false });
  const [policyLoadError, setPolicyLoadError] = React.useState<Record<PolicyAudience, string | null>>({ merchant: null, rider: null });

  const isMerchantRegister = location.pathname === "/merchant/register";
  const isDriverRegister = location.pathname === "/driver/register";
  const isMerchantLogin = location.pathname === "/merchant-login" || isMerchantRegister;
  const isDriverLogin = location.pathname === "/driver-login" || isDriverRegister;
  const isAdminLogin = !isMerchantLogin && !isDriverLogin;
  const supportsPhoneAuth = isMerchantLogin || isDriverLogin;
  const showDemoAccess = import.meta.env.DEV;
  const buildDefaultProviderUrl = (path: string) => {
    const configuredBase = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");
    return /^https?:\/\//i.test(configuredBase)
      ? `${configuredBase}${path}`
      : `${configuredBase}${path}`;
  };
  const googleAuthUrl = import.meta.env.VITE_GOOGLE_AUTH_URL || buildDefaultProviderUrl("/auth/google");
  const appleAuthUrl = import.meta.env.VITE_APPLE_AUTH_URL || "";
  const accountType = isMerchantLogin ? "merchant" : "driver";
  const providerAccountType = isMerchantLogin ? "merchant" : isDriverLogin ? "driver" : "staff";
  const title = isMerchantRegister ? "Merchant signup" : isDriverRegister ? "Rider onboarding" : isMerchantLogin ? "Merchant access" : isDriverLogin ? "Driver access" : "Admin access";
  const subtitle = isMerchantRegister
    ? "Register the merchant account, verify phone OTP, then submit KYC for admin approval."
    : isDriverRegister
      ? "Independent rider registration for Kampala field testing."
    : isMerchantLogin
      ? "Create orders, verify handovers, and track delivery status."
    : isDriverLogin
      ? "Accept assignments, confirm custody, and complete delivery."
      : "Monitor operations, hubs, riders, and dispatch workflows.";
  const loginHighlights = isAdminLogin
    ? [
      { label: "Admin workspace", value: "Operations control" },
      { label: "Secure access", value: "Staff sign-in" },
      { label: "Live modules", value: "Orders and riders" },
    ]
    : [
      { label: "Guided login", value: "Clear entry points" },
      { label: "Default region", value: "Uganda +256" },
      { label: "Mobile first", value: "Step-based flows" },
    ];

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  React.useEffect(() => {
    if (!resendAfter) return undefined;

    const timer = window.setInterval(() => {
      setResendAfter((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendAfter]);

  React.useEffect(() => {
    setAuthMode(isMerchantRegister || isDriverRegister ? "register" : "password");
    setOtpSent(false);
    setOtp("");
    setPhone("");
    setRegisterPhone("");
    setRegisterOtp("");
    setRegisterStep("phone");
    setMerchantDetailStep(0);
    setDriverDetailStep(0);
    setDriverOnboardingStep(0);
    setRegistrationToken("");
    setMerchantRegistration(emptyMerchantRegistration);
    setDriverRegistration(emptyDriverRegistration);
    setDriverDocumentFiles(emptyDriverDocumentFiles());
    setCreatedDriverRider(null);
    setAcceptedPolicies({ merchant: [], rider: [] });
    setPolicyLoadError({ merchant: null, rider: null });
  }, [isDriverRegister, isMerchantRegister, location.pathname]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authError = params.get("auth_error");
    const oauthProvider = params.get("oauth");
    const oauthCode = params.get("oauth_code");

    if (authError) {
      toast.error(authError);
      params.delete("auth_error");
      navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
      return;
    }

    if (oauthProvider && oauthCode) {
      return;
    }

    if (oauthProvider) {
      toast.success(`${oauthProvider === "google" ? "Google" : "OAuth"} login successful`);
      params.delete("oauth");
      params.delete("account");
      params.delete("oauth_code");
      navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  React.useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const loginPaths = new Set([
      "/login",
      "/merchant-login",
      "/driver-login",
      "/merchant/register",
      "/driver/register",
    ]);

    if (loginPaths.has(location.pathname)) {
      navigate(homeForAuthenticatedRole(user.role), { replace: true });
    }
  }, [authLoading, location.pathname, navigate, user]);

  const fetchPolicies = React.useCallback(async (audience: PolicyAudience, options: { showToast?: boolean } = {}) => {
    setPolicyLoading((current) => ({ ...current, [audience]: true }));
    setPolicyLoadError((current) => ({ ...current, [audience]: null }));
    try {
      const { data } = await api.get("/auth/policies", { params: { audience } });
      const payload = extractPayload(data);
      setPolicyDocuments((current) => ({
        ...current,
        [audience]: payload.policies || [],
      }));
    } catch (error: any) {
      const message = error.response?.data?.message || "Policy documents could not be loaded. Confirm the backend is running and redeployed with the policy routes.";
      setPolicyLoadError((current) => ({ ...current, [audience]: message }));
      if (options.showToast) {
        toast.error(message);
      }
    } finally {
      setPolicyLoading((current) => ({ ...current, [audience]: false }));
    }
  }, []);

  React.useEffect(() => {
    if (!supportsPhoneAuth || authMode !== "register") {
      return;
    }

    fetchPolicies(isMerchantLogin ? "merchant" : "rider");
  }, [authMode, fetchPolicies, isMerchantLogin, supportsPhoneAuth]);

  const navigateHomePath = () => (isMerchantLogin ? "/merchant/dashboard" : isDriverLogin ? "/driver/dashboard" : "/dashboard");

  const navigateHome = () => {
    navigate(navigateHomePath());
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      await authLogin(data.email, data.password, isMerchantLogin ? "merchant" : isDriverLogin ? "driver" : "staff");
      toast.success("Welcome back");
      navigateHome();
    } catch (error) {
      toast.error("Invalid credentials or server error");
    } finally {
      setIsLoading(false);
    }
  };

  const continueWithProvider = (provider: "Google" | "Apple") => {
    const url = provider === "Google" ? googleAuthUrl : appleAuthUrl;
    if (!url) {
      toast.error(`${provider} login needs its production OAuth URL before it can be used.`);
      return;
    }

    const providerUrl = new URL(url, window.location.origin);
    providerUrl.searchParams.set("account", providerAccountType);
    providerUrl.searchParams.set("return_to", navigateHomePath());

    if (provider === "Google" && providerAccountType === "driver") {
      const deviceHeaders = getDeviceSecurityHeaders();
      providerUrl.searchParams.set("device_id", deviceHeaders["X-Wolan-Device-Id"]);
      providerUrl.searchParams.set("device_label", deviceHeaders["X-Wolan-Device-Label"]);
      providerUrl.searchParams.set("device_platform", deviceHeaders["X-Wolan-Device-Platform"]);
      providerUrl.searchParams.set("device_compromised", deviceHeaders["X-Wolan-Device-Compromised"]);
      providerUrl.searchParams.set("device_rooted", deviceHeaders["X-Wolan-Device-Rooted"]);
      providerUrl.searchParams.set("device_jailbroken", deviceHeaders["X-Wolan-Device-Jailbroken"]);
    }

    window.location.assign(providerUrl.toString());
  };

  const sendOtp = async (purpose: "login" | "register") => {
    const targetPhone = purpose === "login" ? buildPhoneNumber(countryCode, phone) : buildPhoneNumber(countryCode, registerPhone);
    if (targetPhone.replace(/[^0-9]/g, "").length < 9) {
      toast.error("Enter a valid phone number");
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = isMerchantLogin ? "/auth/merchants/send-otp" : "/auth/send-otp";
      const response = await api.post(endpoint, { phone: targetPhone, purpose });
      const payload = extractPayload(response);

      if (purpose === "login") {
        setOtpSent(true);
        setOtp(payload.otp || "");
      } else {
        if (!isDriverLogin) {
          setRegisterStep("code");
        }
        setRegisterOtp(payload.otp || "");
      }

      setResendAfter(Number(payload.resend_after_seconds || 60));
      toast.success("OTP sent");
    } catch (error: any) {
      const retry = error.response?.data?.errors?.retry_after_seconds;
      if (retry) {
        setResendAfter(Number(retry));
      }
      toast.error(error.response?.data?.message || "Unable to send OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtpLogin = async () => {
    if (!/^[0-9]{4}$/.test(otp)) {
      toast.error("Enter the 4-digit OTP");
      return;
    }

    setIsLoading(true);
    try {
      await loginWithOtp(buildPhoneNumber(countryCode, phone), otp, accountType);
      navigateHome();
    } catch (error: any) {
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyRegistrationOtp = async () => {
    if (!/^[0-9]{4}$/.test(registerOtp)) {
      toast.error("Enter the 4-digit OTP");
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = isMerchantLogin ? "/auth/merchants/verify-otp" : "/auth/verify-otp";
      const response = await api.post(endpoint, {
        phone: buildPhoneNumber(countryCode, registerPhone),
        otp: registerOtp,
        purpose: "register",
      });
      const payload = extractPayload(response);

      setRegistrationToken(payload.otp_verification_token || "");
      if (!isDriverLogin) {
        setRegisterStep("details");
      }
      toast.success("Phone verified");
    } catch (error: any) {
      setRegisterOtp("");
      toast.error(error.response?.data?.message || "Invalid OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const validateDriverOnboardingStep = (step = driverOnboardingStep) => {
    if (step === 0) {
      const requiredFields = [
        driverRegistration.full_name,
        driverRegistration.years_experience,
        driverRegistration.next_of_kin_name,
        driverRegistration.next_of_kin_phone,
        driverRegistration.next_of_kin_relationship,
      ];

      if (requiredFields.some((value) => !String(value || "").trim())) {
        toast.error("Complete rider details and next of kin first");
        return false;
      }

      const experience = Number(driverRegistration.years_experience);
      if (Number.isNaN(experience) || experience < 0 || experience > 60) {
        toast.error("Years of experience must be between 0 and 60");
        return false;
      }

      if (!registrationToken) {
        toast.error("Verify the rider phone OTP before continuing");
        return false;
      }
    }

    if (step === 1) {
      if (!driverRegistration.district || !driverRegistration.division || !driverRegistration.boda_stage.trim() || !driverRegistration.stage_chairman_phone.trim()) {
        toast.error("Select district, division, enter boda stage, and stage chairman phone");
        return false;
      }
    }

    if (step === 2) {
      if (!driverRegistration.vehicle_type) {
        toast.error("Select one vehicle type");
        return false;
      }
    }

    if (step === 3) {
      if (!driverRegistration.bike_plate.trim() || !driverRegistration.nin_number.trim()) {
        toast.error("Vehicle ID and NIN/passport are required for rider KYC");
        return false;
      }

      const missingRequiredDocument = driverDocumentOptions.find((doc) => doc.required && !driverDocumentFiles[doc.type]);
      if (missingRequiredDocument) {
        toast.error(`Upload ${missingRequiredDocument.label} using camera or file upload`);
        return false;
      }
    }

    if (step === 4 && !validatePolicyAgreements("rider")) {
      return false;
    }

    return true;
  };

  const continueDriverOnboarding = () => {
    if (!validateDriverOnboardingStep()) {
      return;
    }

    setDriverOnboardingStep((current) => Math.min(current + 1, 4));
  };

  const readId = (value: any) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.id || value._id || "";
  };

  const uploadDriverKycDocuments = async (rider: any) => {
    const riderId = readId(rider);
    const files = Object.entries(driverDocumentFiles)
      .filter((entry): entry is [DriverDocumentType, File] => Boolean(entry[1]));

    if (files.length === 0) {
      return;
    }

    if (!riderId) {
      throw new Error("Rider profile was created, but the backend did not return a rider ID for KYC upload");
    }

    for (const [documentType, file] of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("related_model", "Rider");
      formData.append("related_id", riderId);

      const { data } = await api.post("/auth/uploads/single", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const upload = data?.data?.upload;
      const uploadId = upload?._id || upload?.id;
      await api.post("/auth/riders/me/document", {
        document_type: documentType,
        url: upload?.public_path || upload?.file_path || uploadId,
        public_id: uploadId,
      });
    }
  };

  const submitRegistration = async () => {
    if (!registrationToken) {
      toast.error("Verify phone number first");
      return;
    }

    if (isDriverLogin && !validateDriverOnboardingStep(4)) {
      return;
    }

    if (isMerchantLogin && !validatePolicyAgreements("merchant")) {
      return;
    }

    setIsLoading(true);
    try {
      if (isMerchantLogin) {
        await registerWithPhone("merchant", {
          ...merchantRegistration,
          phone: buildPhoneNumber(countryCode, registerPhone),
          referred_by: merchantRegistration.referred_by || undefined,
          otp_verification_token: registrationToken,
          accepted_policy_keys: acceptedPolicies.merchant,
        });
        navigate("/merchant/kyc");
        return;
      } else {
        let riderForKyc = createdDriverRider;
        if (!riderForKyc) {
          const registration = await registerWithPhone("driver", {
            full_name: driverRegistration.full_name,
            phone: buildPhoneNumber(countryCode, registerPhone),
            years_experience: Number(driverRegistration.years_experience || 0),
            district: driverRegistration.district,
            division: driverRegistration.division,
            boda_stage: driverRegistration.boda_stage,
            stage_chairman_phone: driverRegistration.stage_chairman_phone,
            vehicle_type: driverRegistration.vehicle_type,
            bike_plate: driverRegistration.bike_plate,
            nin_number: driverRegistration.nin_number,
            next_of_kin: {
              name: driverRegistration.next_of_kin_name,
              phone: driverRegistration.next_of_kin_phone,
              relationship: driverRegistration.next_of_kin_relationship,
            },
            otp_verification_token: registrationToken,
            accepted_policy_keys: acceptedPolicies.rider,
          });
          riderForKyc = registration?.rider;
          setCreatedDriverRider(riderForKyc || null);
        }

        try {
          await uploadDriverKycDocuments(riderForKyc);
        } catch (uploadError: any) {
          toast.error(uploadError.response?.data?.message || uploadError.message || "Rider account was created, but KYC upload failed. Retry the upload before leaving this screen.");
          return;
        }
      }

      navigateHome();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const continueToVehicleSelection = () => {
    if (driverDetailStep === 0) {
      const identityFields = [
        driverRegistration.full_name,
        driverRegistration.bike_plate,
        driverRegistration.nin_number,
      ];

      if (identityFields.some((value) => !value.trim())) {
        toast.error("Complete driver identity details first");
        return;
      }

      setDriverDetailStep(1);
      return;
    }

    const emergencyFields = [
      driverRegistration.next_of_kin_name,
      driverRegistration.next_of_kin_phone,
      driverRegistration.next_of_kin_relationship,
    ];

    if (emergencyFields.some((value) => !value.trim())) {
      toast.error("Complete next of kin details first");
      return;
    }

    setRegisterStep("vehicle");
  };

  const continueMerchantRegistration = () => {
    if (merchantDetailStep === 0) {
      const businessFields = [
        merchantRegistration.merchant_name,
        merchantRegistration.shop_name,
        merchantRegistration.building_name,
        merchantRegistration.address,
      ];

      if (businessFields.some((value) => !value.trim())) {
        toast.error("Complete business details first");
        return;
      }

      setMerchantDetailStep(1);
      return;
    }

    if (merchantDetailStep === 1) {
      if (!merchantRegistration.email.trim() || !merchantRegistration.password.trim()) {
        toast.error("Complete merchant access details first");
        return;
      }

      setMerchantDetailStep(2);
      return;
    }

    if (merchantDetailStep === 2) {
      setMerchantDetailStep(3);
      return;
    }

    if (!merchantRegistration.email.trim() || !merchantRegistration.password.trim()) {
      toast.error("Complete merchant access details first");
      return;
    }

    if (!validatePolicyAgreements("merchant")) {
      return;
    }

    submitRegistration();
  };

  const registrationStepIndex = registerStep === "phone" ? 0 : registerStep === "code" ? 1 : registerStep === "details" ? 2 : 3;
  const registrationSteps = isDriverLogin
    ? [
      { label: "Phone", helper: "Use +256 by default." },
      { label: "OTP", helper: "Verify ownership." },
      { label: "Profile", helper: "Identity and kin." },
      { label: "Vehicle", helper: "Dispatch fit." },
    ]
    : [
      { label: "Phone", helper: "Use +256 by default." },
      { label: "OTP", helper: "Verify ownership." },
      { label: "Business", helper: "Shop details." },
    ];

  const merchantDetailsSteps = [
    { label: "Business", helper: "Shop identity." },
    { label: "Access", helper: "Email login." },
    { label: "Review", helper: "Create account." },
    { label: "Legal", helper: "Agreements." },
  ];

  const driverDetailsSteps = [
    { label: "Identity", helper: "Name and ID." },
    { label: "Emergency", helper: "Next of kin." },
    { label: "Vehicle", helper: "Dispatch fit." },
  ];

  const liveRiderOnboardingSteps = [
    { label: "Rider", helper: "OTP and kin." },
    { label: "Stage", helper: "Kampala base." },
    { label: "Vehicle", helper: "Dispatch fit." },
    { label: "KYC", helper: "Camera/file." },
    { label: "Legal", helper: "Agreements." },
  ];

  const modeButtonClass = (mode: AuthMode) => (
    `rounded-xl border px-3 py-3 text-left transition-all duration-200 ${
      authMode === mode
        ? "border-primary bg-primary text-primary-foreground shadow-custom"
        : "border-border bg-background/80 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
    }`
  );

  const policyDownloadHref = (policy: PolicyDocument) => {
    const configuredBase = String(api.defaults.baseURL || "/api/v1").replace(/\/$/, "");
    const path = policy.download_url || `/api/v1/auth/policies/${encodeURIComponent(policy.key)}/download`;
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    if (/^https?:\/\//i.test(configuredBase) && path.startsWith("/api/")) {
      const url = new URL(configuredBase);
      return `${url.origin}${path}`;
    }
    return path.startsWith("/api/") ? path : `${configuredBase}${path.startsWith("/") ? "" : "/"}${path}`;
  };

  const togglePolicyAcceptance = (audience: PolicyAudience, key: string) => {
    setAcceptedPolicies((current) => {
      const existing = current[audience];
      const next = existing.includes(key)
        ? existing.filter((item) => item !== key)
        : [...existing, key];
      return { ...current, [audience]: next };
    });
  };

  const hasAcceptedRequiredPolicies = (audience: PolicyAudience) => {
    const requiredPolicies = policyDocuments[audience].filter((policy) => policy.required);
    return requiredPolicies.length > 0
      && requiredPolicies.every((policy) => acceptedPolicies[audience].includes(policy.key));
  };

  const validatePolicyAgreements = (audience: PolicyAudience) => {
    if (policyLoading[audience]) {
      toast.error("Policy documents are still loading");
      return false;
    }

    if (policyDocuments[audience].filter((policy) => policy.required).length === 0) {
      toast.error(policyLoadError[audience] || "Required policy documents are unavailable. Refresh and try again.");
      return false;
    }

    const unavailablePolicies = policyDocuments[audience].filter((policy) => policy.required && policy.file_available === false);
    if (unavailablePolicies.length > 0) {
      toast.error("Required policy files are unavailable on the server. Redeploy the Policy folder before continuing.");
      return false;
    }

    if (!hasAcceptedRequiredPolicies(audience)) {
      toast.error("Read and accept all required legal agreements before continuing");
      return false;
    }

    return true;
  };

  const PolicyAgreementPanel = ({ audience }: { audience: PolicyAudience }) => {
    const policies = policyDocuments[audience];
    const accepted = acceptedPolicies[audience];
    const loading = policyLoading[audience];
    const loadError = policyLoadError[audience];
    const requiredCount = policies.filter((policy) => policy.required).length;
    const acceptedCount = policies.filter((policy) => policy.required && accepted.includes(policy.key)).length;

    if (loading) {
      return (
        <div className="grid gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
          ))}
        </div>
      );
    }

    if (policies.length === 0) {
      return (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {loadError || "Legal policy documents are not loaded yet."}
          <Button type="button" variant="outline" className="mt-3 h-10 w-full rounded-xl" onClick={() => fetchPolicies(audience, { showToast: true })}>
            Reload policy documents
          </Button>
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-foreground">Legal compliance</p>
              <p className="text-xs text-muted-foreground">
                {acceptedCount}/{requiredCount} required agreements accepted
              </p>
            </div>
            <ShieldCheckIcon className="h-5 w-5 text-primary" />
          </div>
        </div>

        {policies.map((policy) => {
          const checked = accepted.includes(policy.key);
          const unavailable = policy.file_available === false;
          return (
            <div
              key={policy.key}
              className={`rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                checked ? "border-primary bg-primary/10 shadow-custom" : unavailable ? "border-warning/30 bg-warning/10" : "border-border bg-background/80 hover:border-primary/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground">{policy.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Version {policy.version} · {policy.file_name}</p>
                </div>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
                  {checked ? <CheckCircle2Icon className="h-4 w-4" /> : null}
                </span>
              </div>
              {unavailable ? (
                <p className="mt-3 rounded-xl border border-warning/20 bg-background/70 px-3 py-2 text-xs font-semibold text-warning">
                  This required document file is missing on the server and cannot be accepted yet.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={policyDownloadHref(policy)}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={unavailable}
                  onClick={(event) => {
                    if (unavailable) {
                      event.preventDefault();
                      toast.error("This policy document file is not available on the server yet.");
                    }
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    unavailable
                      ? "cursor-not-allowed border-warning/20 bg-warning/10 text-warning"
                      : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                  }`}
                >
                  <FileTextIcon className="h-4 w-4" />
                  Open document
                </a>
                <button
                  type="button"
                  onClick={() => togglePolicyAcceptance(audience, policy.key)}
                  disabled={unavailable}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    checked
                      ? "bg-success text-white"
                      : "border border-border bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  {checked ? <CheckCircle2Icon className="h-4 w-4" /> : <ShieldCheckIcon className="h-4 w-4" />}
                  {checked ? "Accepted" : "Accept agreement"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (supportsPhoneAuth && isDriverLogin && authMode === "register") {
    const canGoBack = driverOnboardingStep > 0 && !isLoading;
    const submitLabel = isLoading ? "Submitting onboarding" : createdDriverRider ? "Retry KYC upload" : "Submit rider onboarding";

    return (
      <div className="flex min-h-dvh overflow-hidden bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
        <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 rounded-3xl border border-border bg-card px-4 py-3 shadow-custom sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-custom">
                <TruckIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Wolan Rider</p>
                <h1 className="truncate text-lg font-black text-foreground sm:text-2xl">Live rider onboarding</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/driver-login")}
              className="shrink-0 rounded-xl border border-border bg-background/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Sign in
            </button>
          </header>

          <section className="mt-3 flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-card shadow-custom">
            <div className="shrink-0 border-b border-border p-3 sm:p-4">
              <WorkflowStepper steps={liveRiderOnboardingSteps} currentStep={driverOnboardingStep} compactMobile />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
              {driverOnboardingStep === 0 ? (
                <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 sm:gap-3">
                  <Input placeholder="Full name" value={driverRegistration.full_name} onChange={(event) => setDriverRegistration((current) => ({ ...current, full_name: event.target.value }))} className="col-span-2 h-11 rounded-xl sm:h-12" />
                  <Input type="number" min="0" max="60" placeholder="Experience years" value={driverRegistration.years_experience} onChange={(event) => setDriverRegistration((current) => ({ ...current, years_experience: event.target.value }))} className="h-11 rounded-xl sm:h-12" />
                  <Input placeholder="Kin relationship" value={driverRegistration.next_of_kin_relationship} onChange={(event) => setDriverRegistration((current) => ({ ...current, next_of_kin_relationship: event.target.value }))} className="h-11 rounded-xl sm:h-12" />
                  <div className="col-span-2 space-y-1 sm:space-y-2">
                    <Label htmlFor="driver-register-phone">Phone number</Label>
                    <PhoneInput
                      id="driver-register-phone"
                      value={registerPhone}
                      onChange={setRegisterPhone}
                      countryCode={countryCode}
                      onCountryCodeChange={setCountryCode}
                      disabled={Boolean(registrationToken)}
                    />
                  </div>
                  <div className="col-span-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      placeholder={registrationToken ? "Phone verified" : "4-digit OTP"}
                      value={registrationToken ? "Verified" : registerOtp}
                      onChange={(event) => setRegisterOtp(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                      disabled={Boolean(registrationToken)}
                      className="h-12 rounded-xl font-mono tracking-[0.25em]"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:w-72">
                      <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => sendOtp("register")} disabled={isLoading || resendAfter > 0 || Boolean(registrationToken)} disabledReason={registrationToken ? "Phone is already verified." : isLoading ? "OTP request is processing." : `Wait ${resendAfter}s before requesting another OTP.`}>
                        {resendAfter > 0 ? `${resendAfter}s` : "Send OTP"}
                      </Button>
                      <Button type="button" className="h-12 rounded-xl bg-primary text-primary-foreground" onClick={verifyRegistrationOtp} disabled={isLoading || Boolean(registrationToken) || registerOtp.length !== 4} disabledReason={registrationToken ? "Phone is already verified." : isLoading ? "OTP verification is processing." : "Enter the complete 4-digit OTP."}>
                        Verify
                      </Button>
                    </div>
                  </div>
                  <Input placeholder="Next of kin name" value={driverRegistration.next_of_kin_name} onChange={(event) => setDriverRegistration((current) => ({ ...current, next_of_kin_name: event.target.value }))} className="h-11 rounded-xl sm:h-12" />
                  <Input type="tel" placeholder="Kin phone" value={driverRegistration.next_of_kin_phone} onChange={(event) => setDriverRegistration((current) => ({ ...current, next_of_kin_phone: event.target.value }))} className="h-11 rounded-xl sm:h-12" />
                </div>
              ) : null}

              {driverOnboardingStep === 1 ? (
                <div className="mx-auto grid w-full max-w-3xl gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CustomSelect
                      value={driverRegistration.district}
                      onValueChange={(value) => setDriverRegistration((current) => ({ ...current, district: value }))}
                      ariaLabel="District"
                      placeholder="District"
                      options={kampalaDistrictOptions}
                      triggerClassName="h-12 rounded-xl bg-background/80 text-sm"
                    />
                    <CustomSelect
                      value={driverRegistration.division}
                      onValueChange={(value) => setDriverRegistration((current) => ({ ...current, division: value }))}
                      ariaLabel="Division"
                      placeholder="Division"
                      options={kampalaDivisionOptions}
                      triggerClassName="h-12 rounded-xl bg-background/80 text-sm"
                    />
                  </div>
                  <div className="relative">
                    <MapPinIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Specific boda stage, e.g. Pioneer Mall stage" value={driverRegistration.boda_stage} onChange={(event) => setDriverRegistration((current) => ({ ...current, boda_stage: event.target.value }))} className="h-12 rounded-xl pl-10" />
                  </div>
                  <div className="relative">
                    <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="tel" placeholder="Stage chairman contact number" value={driverRegistration.stage_chairman_phone} onChange={(event) => setDriverRegistration((current) => ({ ...current, stage_chairman_phone: event.target.value }))} className="h-12 rounded-xl pl-10" />
                  </div>
                </div>
              ) : null}

              {driverOnboardingStep === 2 ? (
                <div className="mx-auto grid w-full max-w-3xl gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {vehicleOptions.map(({ value, title, subtitle, description, Icon }) => {
                      const selected = driverRegistration.vehicle_type === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setDriverRegistration((current) => ({ ...current, vehicle_type: value }))}
                          className={`relative rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                            selected ? "border-primary bg-primary/10 text-foreground shadow-custom" : "border-border bg-background/80 hover:bg-muted"
                          }`}
                        >
                          <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <p className="text-sm font-black">{title}</p>
                          <p className="text-xs font-semibold text-muted-foreground">{subtitle}</p>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
                          {selected ? <CheckCircle2Icon className="absolute right-3 top-3 h-5 w-5 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {driverOnboardingStep === 3 ? (
                <div className="mx-auto grid w-full max-w-3xl gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Vehicle plate / bicycle ID" value={driverRegistration.bike_plate} onChange={(event) => setDriverRegistration((current) => ({ ...current, bike_plate: event.target.value }))} className="h-12 rounded-xl" />
                    <Input placeholder="NIN / passport number" value={driverRegistration.nin_number} onChange={(event) => setDriverRegistration((current) => ({ ...current, nin_number: event.target.value }))} className="h-12 rounded-xl" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {driverDocumentOptions.map((doc) => {
                      const file = driverDocumentFiles[doc.type];
                      const inputId = `driver-doc-${doc.type}`;
                      return (
                        <div key={doc.type} className="rounded-2xl border border-border bg-background/80 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-foreground">{doc.label}{doc.required ? " *" : ""}</p>
                              <p className="truncate text-xs text-muted-foreground">{file?.name || doc.helper}</p>
                            </div>
                            <FileTextIcon className={`h-5 w-5 shrink-0 ${file ? "text-success" : "text-muted-foreground"}`} />
                          </div>
                          <input
                            id={inputId}
                            type="file"
                            accept="image/*,.pdf"
                            capture="environment"
                            className="hidden"
                            onChange={(event) => {
                              const nextFile = event.target.files?.[0] || null;
                              setDriverDocumentFiles((current) => ({ ...current, [doc.type]: nextFile }));
                            }}
                          />
                          <label htmlFor={inputId} className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
                            {file ? <CheckCircle2Icon className="h-4 w-4" /> : <CameraIcon className="h-4 w-4" />}
                            {file ? "Replace file" : "Camera / File upload"}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {driverOnboardingStep === 4 ? (
                <div className="mx-auto w-full max-w-3xl">
                  <PolicyAgreementPanel audience="rider" />
                </div>
              ) : null}
            </div>

            <footer className="grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-border p-3 sm:p-4">
              <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => setDriverOnboardingStep((current) => Math.max(current - 1, 0))} disabled={!canGoBack} disabledReason={driverOnboardingStep === 0 ? "You are already on the first rider onboarding page." : "Registration is being submitted."}>
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="button" className="h-12 rounded-xl bg-primary text-primary-foreground" onClick={driverOnboardingStep === 4 ? submitRegistration : continueDriverOnboarding} disabled={isLoading} disabledReason="Rider onboarding is being submitted.">
                {isLoading ? <LoaderGlyph size="sm" label="Submitting onboarding" /> : driverOnboardingStep === 4 ? <UploadCloudIcon className="mr-2 h-4 w-4" /> : null}
                {driverOnboardingStep === 4 ? submitLabel : "Continue"}
                {driverOnboardingStep === 4 ? null : <ArrowRightIcon className="ml-2 h-4 w-4" />}
              </Button>
            </footer>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-6xl flex-col justify-center gap-6 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,30rem)] lg:items-center">
        <section className="flex flex-col gap-8 rounded-3xl border border-border bg-card p-5 shadow-custom sm:p-7">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-custom">
                <TruckIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Wolan Delivery</p>
                <h1 className="text-2xl font-black text-foreground sm:text-3xl">{title}</h1>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {loginHighlights.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-bold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-custom sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Authentication</p>
              <h2 className="mt-1 text-lg font-black text-foreground">Choose how to continue</h2>
            </div>
            <ShieldCheckIcon className="h-5 w-5 text-primary" />
          </div>

          <div className="grid gap-2">
            <button type="button" title="Google OAuth entry point. Configure VITE_GOOGLE_AUTH_URL to activate sign-in." onClick={() => continueWithProvider("Google")} className="flex items-center justify-between rounded-2xl border border-border bg-background/80 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40">
              <span className="inline-flex items-center gap-3 text-sm font-bold text-foreground"><GoogleIcon className="h-5 w-5" /> Sign in with Google</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gmail</span>
            </button>
            <button type="button" title="Apple/iCloud entry point. Configure VITE_APPLE_AUTH_URL after Apple Developer setup." onClick={() => continueWithProvider("Apple")} className="flex items-center justify-between rounded-2xl border border-border bg-background/80 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40">
              <span className="inline-flex items-center gap-3 text-sm font-bold text-foreground"><AppleIcon className="h-5 w-5 text-foreground" /> Sign in with Apple</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">iCloud</span>
            </button>
          </div>

          <div className={`my-4 grid gap-2 ${supportsPhoneAuth ? "grid-cols-3" : "grid-cols-1"}`}>
            <button type="button" title="Use the current email and password login flow." onClick={() => setAuthMode("password")} className={modeButtonClass("password")}>
              <span className="block text-xs font-bold">Password</span>
              <span className="mt-1 block text-[10px] opacity-75">Email access</span>
            </button>
            {supportsPhoneAuth ? (
              <>
                <button type="button" title="Use the phone OTP flow with Uganda +256 selected by default." onClick={() => setAuthMode("otp")} className={modeButtonClass("otp")}>
                  <span className="block text-xs font-bold">Phone OTP</span>
                  <span className="mt-1 block text-[10px] opacity-75">+256 default</span>
                </button>
                <button type="button" title="Open the step-based merchant or driver onboarding flow." onClick={() => setAuthMode("register")} className={modeButtonClass("register")}>
                  <span className="block text-xs font-bold">Register</span>
                  <span className="mt-1 block text-[10px] opacity-75">Step setup</span>
                </button>
              </>
            ) : null}
          </div>

          {authMode === "password" ? (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs leading-relaxed text-primary">
                Use password login for active operational access. OAuth buttons require production provider URLs before redirect.
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={isMerchantLogin ? "merchant@wolan.test" : isDriverLogin ? "driver@wolan.test" : "admin@wolan.com"}
                  {...form.register("email")}
                  className="h-12 rounded-xl"
                />
                {form.formState.errors.email ? <p className="text-xs text-destructive">{form.formState.errors.email.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    {...form.register("password")}
                    className="h-12 rounded-xl pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.password ? <p className="text-xs text-destructive">{form.formState.errors.password.message}</p> : null}
              </div>
              <Button type="submit" className="h-12 w-full rounded-xl bg-primary text-primary-foreground transition-all duration-200 hover:-translate-y-0.5" disabled={isLoading} disabledReason="Sign-in is already in progress.">
                {isLoading ? <LoaderGlyph size="sm" label="Signing in" /> : null}
                {isLoading ? "Signing in securely" : "Sign in"}
              </Button>
              {isMerchantLogin ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    navigate("/merchant/register", { replace: true });
                  }}
                  className="w-full rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/10"
                >
                  New merchant? Create account and submit KYC
                </button>
              ) : null}
              {isDriverLogin ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    navigate("/driver/register", { replace: true });
                  }}
                  className="w-full rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/10"
                >
                  New rider? Start live onboarding
                </button>
              ) : null}
            </form>
          ) : null}

          {supportsPhoneAuth && authMode === "otp" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                Uganda is selected by default for Kampala operations. Enter the local number without the leading zero.
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={setPhone}
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                />
              </div>
              {otpSent ? (
                <div className="space-y-2">
                  <Label htmlFor="otp">OTP</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4-digit OTP"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.35em]"
                  />
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => sendOtp("login")} disabled={isLoading || resendAfter > 0} disabledReason={isLoading ? "OTP request is already in progress." : `Wait ${resendAfter}s before requesting another OTP.`}>
                  {isLoading ? <LoaderGlyph size="sm" label="Requesting OTP" /> : <PhoneIcon className="mr-2 h-4 w-4" />}
                  {resendAfter > 0 ? `Resend in ${resendAfter}s` : otpSent ? "Resend OTP" : "Send OTP"}
                </Button>
                <Button type="button" className="h-11 rounded-xl bg-primary text-primary-foreground" onClick={verifyOtpLogin} disabled={isLoading || !otpSent || otp.length !== 4} disabledReason={isLoading ? "OTP verification is already in progress." : !otpSent ? "Send an OTP before verifying." : "Enter the complete 4-digit OTP."}>
                  {isLoading ? <LoaderGlyph size="sm" label="Processing OTP" /> : null}
                  {isLoading ? "Processing OTP" : "Verify and sign in"}
                </Button>
              </div>
            </div>
          ) : null}

          {supportsPhoneAuth && authMode === "register" ? (
            <div className="space-y-4">
              <WorkflowStepper steps={registrationSteps} currentStep={registrationStepIndex} />

              {registerStep === "phone" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    Start with phone verification so OTP loops stay controlled before account details are collected.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-phone">Phone number</Label>
                    <PhoneInput
                      id="register-phone"
                      value={registerPhone}
                      onChange={setRegisterPhone}
                      countryCode={countryCode}
                      onCountryCodeChange={setCountryCode}
                    />
                  </div>
                  <Button type="button" className="h-11 w-full rounded-xl bg-primary text-primary-foreground" onClick={() => sendOtp("register")} disabled={isLoading || resendAfter > 0} disabledReason={isLoading ? "Registration OTP request is already in progress." : `Wait ${resendAfter}s before requesting another OTP.`}>
                    {isLoading ? <LoaderGlyph size="sm" label="Requesting registration OTP" /> : <SmartphoneIcon className="mr-2 h-4 w-4" />}
                    {resendAfter > 0 ? `Resend in ${resendAfter}s` : "Send registration OTP"}
                  </Button>
                </div>
              ) : null}

              {registerStep === "code" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-otp">OTP</Label>
                    <Input
                      id="register-otp"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="4-digit OTP"
                      value={registerOtp}
                      onChange={(event) => setRegisterOtp(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                      className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.35em]"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => sendOtp("register")} disabled={isLoading || resendAfter > 0} disabledReason={isLoading ? "Registration OTP request is already in progress." : `Wait ${resendAfter}s before requesting another OTP.`}>
                      {resendAfter > 0 ? `Resend in ${resendAfter}s` : "Resend OTP"}
                    </Button>
                    <Button type="button" className="h-11 rounded-xl bg-primary text-primary-foreground" onClick={verifyRegistrationOtp} disabled={isLoading || registerOtp.length !== 4} disabledReason={isLoading ? "Phone verification is already in progress." : "Enter the complete 4-digit registration OTP."}>
                      Verify phone
                    </Button>
                  </div>
                </div>
              ) : null}

              {registerStep === "details" && isMerchantLogin ? (
                <div className="space-y-4">
                  <WorkflowStepper steps={merchantDetailsSteps} currentStep={merchantDetailStep} />

                  {merchantDetailStep === 0 ? (
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        Add the shop identity first. Access credentials are collected on the next screen.
                      </div>
                      <Input placeholder="Merchant name" value={merchantRegistration.merchant_name} onChange={(event) => setMerchantRegistration((current) => ({ ...current, merchant_name: event.target.value }))} />
                      <Input placeholder="Shop name" value={merchantRegistration.shop_name} onChange={(event) => setMerchantRegistration((current) => ({ ...current, shop_name: event.target.value }))} />
                      <Input placeholder="Building name" value={merchantRegistration.building_name} onChange={(event) => setMerchantRegistration((current) => ({ ...current, building_name: event.target.value }))} />
                      <Input placeholder="Address" value={merchantRegistration.address} onChange={(event) => setMerchantRegistration((current) => ({ ...current, address: event.target.value }))} />
                    </div>
                  ) : null}

                  {merchantDetailStep === 1 ? (
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        This email and password become the fallback login while Google, Apple, and OTP providers are configured.
                      </div>
                      <Input type="email" placeholder="Email" value={merchantRegistration.email} onChange={(event) => setMerchantRegistration((current) => ({ ...current, email: event.target.value }))} />
                      <Input type="password" placeholder="Password" value={merchantRegistration.password} onChange={(event) => setMerchantRegistration((current) => ({ ...current, password: event.target.value }))} />
                      <Input placeholder="Referral code optional" value={merchantRegistration.referred_by} onChange={(event) => setMerchantRegistration((current) => ({ ...current, referred_by: event.target.value }))} />
                    </div>
                  ) : null}

                  {merchantDetailStep === 2 ? (
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                      <p className="text-sm font-bold text-foreground">Review merchant account</p>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <span>Shop: <strong className="text-foreground">{merchantRegistration.shop_name || "Not provided"}</strong></span>
                        <span>Phone: <strong className="text-foreground">{buildPhoneNumber(countryCode, registerPhone)}</strong></span>
                        <span>Email: <strong className="text-foreground">{merchantRegistration.email || "Not provided"}</strong></span>
                        <span>Referral: <strong className="text-foreground">{merchantRegistration.referred_by || "None"}</strong></span>
                      </div>
                    </div>
                  ) : null}

                  {merchantDetailStep === 3 ? (
                    <PolicyAgreementPanel audience="merchant" />
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setMerchantDetailStep((current) => Math.max(current - 1, 0))} disabled={isLoading || merchantDetailStep === 0} disabledReason={isLoading ? "Merchant registration is processing." : "You are already on the first merchant detail step."}>
                      <ArrowLeftIcon className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button type="button" className="h-11 rounded-xl bg-primary text-primary-foreground" onClick={continueMerchantRegistration} disabled={isLoading} disabledReason="Merchant registration is processing.">
                      {isLoading ? <LoaderGlyph size="sm" label="Creating merchant account" /> : null}
                      {merchantDetailStep < 3 ? "Continue" : "Create merchant account"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {registerStep === "details" && isDriverLogin ? (
                <div className="space-y-4">
                  <WorkflowStepper steps={driverDetailsSteps} currentStep={driverDetailStep} />

                  {driverDetailStep === 0 ? (
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        Confirm rider identity before collecting emergency contact and vehicle details.
                      </div>
                      <Input placeholder="Full name" value={driverRegistration.full_name} onChange={(event) => setDriverRegistration((current) => ({ ...current, full_name: event.target.value }))} />
                      <Input placeholder="Bike plate" value={driverRegistration.bike_plate} onChange={(event) => setDriverRegistration((current) => ({ ...current, bike_plate: event.target.value }))} />
                      <Input placeholder="NIN number" value={driverRegistration.nin_number} onChange={(event) => setDriverRegistration((current) => ({ ...current, nin_number: event.target.value }))} />
                    </div>
                  ) : null}

                  {driverDetailStep === 1 ? (
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        Next of kin information is required before vehicle selection and registration completion.
                      </div>
                      <Input placeholder="Next of kin name" value={driverRegistration.next_of_kin_name} onChange={(event) => setDriverRegistration((current) => ({ ...current, next_of_kin_name: event.target.value }))} />
                      <Input type="tel" placeholder="Next of kin phone" value={driverRegistration.next_of_kin_phone} onChange={(event) => setDriverRegistration((current) => ({ ...current, next_of_kin_phone: event.target.value }))} />
                      <Input placeholder="Next of kin relationship" value={driverRegistration.next_of_kin_relationship} onChange={(event) => setDriverRegistration((current) => ({ ...current, next_of_kin_relationship: event.target.value }))} />
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setDriverDetailStep((current) => Math.max(current - 1, 0))} disabled={isLoading || driverDetailStep === 0} disabledReason={isLoading ? "Driver registration is processing." : "You are already on the first driver detail step."}>
                      <ArrowLeftIcon className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button type="button" className="h-11 rounded-xl bg-primary text-primary-foreground" onClick={continueToVehicleSelection} disabled={isLoading} disabledReason="Driver registration is processing.">
                      {driverDetailStep === 0 ? "Continue" : "Continue to vehicle"}
                      <ArrowRightIcon className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {registerStep === "vehicle" && isDriverLogin ? (
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    Select one vehicle. Dispatch compatibility is enforced by the backend.
                  </div>
                  <div className="grid gap-2">
                    {vehicleOptions.map(({ value, title, subtitle, description, Icon }) => {
                      const selected = driverRegistration.vehicle_type === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setDriverRegistration((current) => ({ ...current, vehicle_type: value }))}
                          className={`relative rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                            selected ? "border-primary bg-primary/10 text-foreground shadow-custom" : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`rounded-xl border p-2 ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold">{title} <span className="font-medium text-muted-foreground">/ {subtitle}</span></p>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                            </div>
                          </div>
                          {selected ? <CheckCircle2Icon className="absolute right-3 top-3 h-4 w-4 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setRegisterStep("details")} disabled={isLoading} disabledReason="Driver registration is processing.">
                      <ArrowLeftIcon className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button type="button" className="h-11 rounded-xl bg-primary text-primary-foreground" onClick={submitRegistration} disabled={isLoading || !driverRegistration.vehicle_type} disabledReason={isLoading ? "Driver registration is processing." : "Select one vehicle type before creating the driver account."}>
                      {isLoading ? <LoaderGlyph size="sm" label="Creating driver account" /> : null}
                      Create driver account
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showDemoAccess ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/70 px-4 py-3">
              <div className="flex items-start gap-3">
                <SparklesIcon className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Demo access: {isMerchantLogin ? "merchant@wolan.test / password123" : isDriverLogin ? "driver@wolan.test / password123" : "admin@wolan.com / password123"}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
