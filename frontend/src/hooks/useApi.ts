import { useState, useCallback } from "react";
import apiClient from "../api/client";

/**
 * 通用 API 请求 Hook
 * 适用于按钮触发的 POST/PUT/DELETE 请求
 */
export function useApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async (method: "get" | "post" | "put" | "delete", url: string, body?: unknown) => {
      setLoading(true);
      setError(null);
      try {
        const config = body !== undefined ? body : {};
        const response =
          method === "get" || method === "delete"
            ? await apiClient[method](url)
            : await apiClient[method](url, config);
        setData(response as T);
        return response as T;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "请求失败";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { data, loading, error, request };
}
