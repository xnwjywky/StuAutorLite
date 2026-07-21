import axios from "axios";

/** 当前页面的 origin；空字符串 = axios 使用同源请求（经 Vite proxy 转发 /api） */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const apiClient = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => config, (e) => Promise.reject(e));
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error("[API Error]", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;

/** 创建带 Agent LLM 配置 Header 的 axios 实例 */
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
