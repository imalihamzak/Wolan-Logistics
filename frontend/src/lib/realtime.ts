import { getDeviceSecurityHeaders } from "./deviceSecurity";

type SocketLike = {
  on: (eventName: string, handler: (payload: any) => void) => SocketLike;
  off: (eventName: string, handler: (payload: any) => void) => SocketLike;
  emit: (eventName: string, payload?: any) => SocketLike;
  disconnect: () => void;
};

type SocketFactory = (
  url: string,
  options?: {
    auth?: Record<string, any>;
    transports?: string[];
    withCredentials?: boolean;
  }
) => SocketLike;

declare global {
  interface Window {
    io?: SocketFactory;
  }
}

const normalizeConfiguredUrl = (value: string) => value
  .trim()
  .replace(/^https\/\//i, "https://")
  .replace(/^http\/\//i, "http://")
  .replace(/([^:/])\/+/g, "$1/");

const stripApiPath = (value: string) => normalizeConfiguredUrl(value).replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");

const getSocketOrigin = () => {
  const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (configuredSocketUrl) {
    return stripApiPath(configuredSocketUrl);
  }

  const configuredApiUrl = import.meta.env.VITE_API_URL;
  if (configuredApiUrl && /^https?:\/\//i.test(configuredApiUrl)) {
    return stripApiPath(configuredApiUrl);
  }

  return window.location.origin;
};

let socketClientLoader: Promise<SocketFactory> | null = null;

const loadSocketClient = async () => {
  if (window.io) {
    return window.io;
  }

  if (!socketClientLoader) {
    const socketOrigin = getSocketOrigin();
    socketClientLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${socketOrigin}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = () => {
        if (window.io) {
          resolve(window.io);
          return;
        }

        reject(new Error("Socket.IO client failed to load"));
      };
      script.onerror = () => {
        socketClientLoader = null;
        script.remove();
        reject(new Error("Socket.IO client failed to load"));
      };
      document.head.appendChild(script);
    });
  }

  return socketClientLoader;
};

export const connectRealtimeSocket = async () => {
  const io = await loadSocketClient();
  const token = localStorage.getItem("accessToken") || undefined;
  const deviceHeaders = getDeviceSecurityHeaders();

  return io(getSocketOrigin(), {
    auth: {
      token,
      device: {
        device_id: deviceHeaders["X-Wolan-Device-Id"],
        device_label: deviceHeaders["X-Wolan-Device-Label"],
        platform: deviceHeaders["X-Wolan-Device-Platform"],
        compromised: deviceHeaders["X-Wolan-Device-Compromised"] === "true",
        rooted: deviceHeaders["X-Wolan-Device-Rooted"] === "true",
        jailbroken: deviceHeaders["X-Wolan-Device-Jailbroken"] === "true",
      },
    },
    transports: ["websocket", "polling"],
    withCredentials: true,
  });
};
