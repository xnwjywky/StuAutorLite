import axios from "axios";

export function detectBaseUrl(): string {
  const explicit = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:8000`;
  }
  return "";
}

const BASE = detectBaseUrl();

const apiClient = axios.create({
  baseURL: BASE,
  timeout: 12000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(
  (config) => {
    const fullUrl = `${config.baseURL || ""}${config.url || ""}`;
    console.debug("[API]", config.method?.toUpperCase(), fullUrl);
    return config;
  },
  (e) => Promise.reject(e),
);
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const url = error.config?.url || "";
    const detail = error.response?.data?.detail || error.response?.data || error.message;
    console.error(`[API Error] ${url} → ${detail}`);
    return Promise.reject(error);
  }
);

export default apiClient;

export function createAgentClient(cfg: { apiKey: string; baseUrl: string; model: string; provider?: string }) {
  const client = axios.create({
    baseURL: BASE,
    timeout: 120000,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
      "X-API-Base": cfg.baseUrl,
      "X-API-Model": cfg.model,
      "X-API-Provider": cfg.provider || "openai",
    },
  });
  client.interceptors.response.use(
    (response) => response.data,
    (error) => {
      console.error("[Agent API Error]", error.response?.data || error.message);
      return Promise.reject(error);
    }
  );
  return client;
}
