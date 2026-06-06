const DEVICE_ID_KEY = "wolanTrustedDeviceId";
const DEVICE_COMPROMISED_KEY = "wolanDeviceCompromised";

type NativeDeviceSecurity = {
  deviceId?: string;
  device_id?: string;
  label?: string;
  deviceLabel?: string;
  platform?: string;
  rooted?: boolean;
  jailbroken?: boolean;
  compromised?: boolean;
};

const getWindowDeviceSecurity = (): NativeDeviceSecurity => {
  if (typeof window === "undefined") return {};
  const candidate = (window as any).WolanDeviceSecurity || (window as any).__WOLAN_DEVICE_SECURITY__ || {};
  return typeof candidate === "object" && candidate ? candidate : {};
};

const createUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getTrustedDeviceId = () => {
  const nativeSecurity = getWindowDeviceSecurity();
  const nativeDeviceId = nativeSecurity.deviceId || nativeSecurity.device_id;
  if (nativeDeviceId) return String(nativeDeviceId);

  if (typeof window === "undefined") return "server-rendered-device";

  const existingId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existingId) return existingId;

  const nextId = createUuid();
  window.localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
};

const getDeviceLabel = () => {
  const nativeSecurity = getWindowDeviceSecurity();
  if (nativeSecurity.label || nativeSecurity.deviceLabel) {
    return String(nativeSecurity.label || nativeSecurity.deviceLabel);
  }

  if (typeof navigator === "undefined") return "Wolan web device";
  const platform = navigator.platform || "Web";
  const language = navigator.language || "unknown locale";
  return `${platform} | ${language}`;
};

const getDevicePlatform = () => {
  const nativeSecurity = getWindowDeviceSecurity();
  if (nativeSecurity.platform) return String(nativeSecurity.platform);

  if (typeof navigator === "undefined") return "web";
  const userAgent = navigator.userAgent || "";
  if (/android/i.test(userAgent)) return "android-web";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios-web";
  return "web";
};

const getCompromisedSignals = () => {
  const nativeSecurity = getWindowDeviceSecurity();
  const localCompromised = typeof window !== "undefined" && window.localStorage.getItem(DEVICE_COMPROMISED_KEY) === "true";
  const rooted = Boolean(nativeSecurity.rooted);
  const jailbroken = Boolean(nativeSecurity.jailbroken);
  const compromised = Boolean(nativeSecurity.compromised) || localCompromised || rooted || jailbroken;

  return { rooted, jailbroken, compromised };
};

export const getDeviceSecurityHeaders = () => {
  const signals = getCompromisedSignals();

  return {
    "X-Wolan-Device-Id": getTrustedDeviceId(),
    "X-Wolan-Device-Label": getDeviceLabel(),
    "X-Wolan-Device-Platform": getDevicePlatform(),
    "X-Wolan-Device-Compromised": signals.compromised ? "true" : "false",
    "X-Wolan-Device-Rooted": signals.rooted ? "true" : "false",
    "X-Wolan-Device-Jailbroken": signals.jailbroken ? "true" : "false",
  };
};

