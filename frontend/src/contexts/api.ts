import axios from "axios";

// Set VITE_API_URL in .env for the active backend base URL.
const normalizeConfiguredUrl = (value: string) => value
  .trim()
  .replace(/^https\/\//i, 'https://')
  .replace(/^http\/\//i, 'http://')
  .replace(/([^:/])\/+/g, '$1/');

const rawBaseURL = import.meta.env.VITE_API_URL || "/api/v1";
const API_BASE_URL = normalizeConfiguredUrl(rawBaseURL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;

