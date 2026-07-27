/**
 * 后端连通性检测 — 自动探测后端地址，不可用时全局横幅提示
 *
 * 检测流程：
 *   1. 如果 VITE_API_BASE_URL 已配置 → 直接用
 *   2. 否则尝试 window.location.hostname:8000（局域网场景）
 *   3. 上述失败则走 Vite proxy /api/health（本地 localhost）
 */
import { useState, useEffect, useRef, useCallback } from "react";

interface HealthState {
  online: boolean;
  checking: boolean;
  lastError: string | null;
  /** 连续失败次数 */
  failCount: number;
  /** 当前使用的后端地址 */
  detectedUrl: string;
  /** 手动触发立即重试 */
  retryNow: () => void;
}

function candidateUrls(): string[] {
  const explicit = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const urls: string[] = [];
  if (explicit) urls.push(explicit);

  // 用当前页面 hostname + 后端端口 8000（局域网场景）
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    urls.push(`http://${host}:8000`);
  }

  // 兜底：空字符串 = 走 Vite proxy（本地开发）
  urls.push("");
  return urls;
}

export function useBackendHealth(): HealthState {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [detectedUrl, setDetectedUrl] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const mountedRef = useRef(true);
  const foundUrlRef = useRef<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);

    // 已找到可用 URL → 直接用
    const urls = foundUrlRef.current ? [foundUrlRef.current] : candidateUrls();

    for (const baseUrl of urls) {
      const healthUrl = baseUrl ? `${baseUrl}/api/health` : "/api/health";
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 5000);
        const resp = await fetch(healthUrl, { signal: ac.signal });
        clearTimeout(timer);

        if (!mountedRef.current) return;

        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const label = baseUrl || "Vite proxy";
          if (failCount > 0 || !online) {
            console.info(`[Backend] ✅ 已连接 (${label})`, data);
          }
          if (!foundUrlRef.current) {
            foundUrlRef.current = baseUrl;
            setDetectedUrl(label);
            console.info(`[Backend] 后端地址: ${label}`);
          }
          setOnline(true);
          setFailCount(0);
          setLastError(null);
          setChecking(false);
          return;
        }
      } catch (e: any) {
        // 尝试下一个 URL
        continue;
      }
    }

    // 所有 URL 都失败
    if (!mountedRef.current) return;
    setFailCount((c) => {
      const next = c + 1;
      if (next >= 2) setOnline(false);
      if (next === 2) console.warn("[Backend] ⚠️ 所有候选地址均不可用:", candidateUrls().join(", "));
      return next;
    });
    setLastError("后端不可达（已尝试所有候选地址）");
    setChecking(false);
  }, [online, failCount, retryKey]);

  useEffect(() => {
    mountedRef.current = true;
    const initialTimer = setTimeout(check, 1500);
    const interval = setInterval(check, 15000);
    return () => {
      mountedRef.current = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [check]);

  const retryNow = useCallback(() => {
    foundUrlRef.current = null;
    setRetryKey((k) => k + 1);
  }, []);

  return { online, checking, lastError, failCount, detectedUrl, retryNow };
}
