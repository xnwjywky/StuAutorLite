import axios from "axios";

export function detectBaseUrl(): string {
  // 方案 B（LAN_ACCESS_SOLUTION.md §3，推荐）：统一走相对路径 + Vite 开发代理
  // （/api → 127.0.0.1:8000）。无论从 localhost 还是局域网 IP 访问页面，请求
  // 都是同源（先到 Vite 再转发），无需后端 CORS 放行、不依赖具体 IP。
  // 生产/特殊部署仍可用 VITE_API_BASE_URL 显式指定后端地址。
  const explicit = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "";
}

const BASE = detectBaseUrl();

// 后端共享访问密钥（P0-2）：配置了 VITE_APP_KEY 时所有请求带上 X-App-Key
const APP_KEY = (import.meta.env.VITE_APP_KEY ?? "").trim();

const apiClient = axios.create({
  baseURL: BASE,
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
    ...(APP_KEY ? { "X-App-Key": APP_KEY } : {}),
  },
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
      ...(APP_KEY ? { "X-App-Key": APP_KEY } : {}),
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
