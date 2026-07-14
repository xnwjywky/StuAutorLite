/** Agent LLM 配置 Store — 多配置共享，localStorage 持久化 */

import { create } from "zustand";

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export interface AgentConfig {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 协议类型：openai 用 /chat/completions + Bearer，anthropic 用 /v1/messages + x-api-key */
  provider: "openai" | "anthropic";
  /** 哪些 agent 使用此配置；空数组 = 所有 agent 共用 */
  agentNames: string[];
  createdAt: number;
}

export const AGENT_NAMES = [
  "research_mentor",
  "experiment_designer",
  "data_analyst",
  "reflection",
  "reviewer",
  "algorithm_tutor",
] as const;

// ═══════════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = "stuautor_agent_configs";

function loadConfigs(): AgentConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const configs: AgentConfig[] = JSON.parse(raw);
      for (const c of configs) {
        // migration: 旧配置缺少 provider
        if (!c.provider) (c as any).provider = "openai";
        // auto-detect: Anthropic URL 应使用 Anthropic 协议
        if ((c.baseUrl || "").includes("/anthropic")) {
          (c as any).provider = "anthropic";
        }
      }
      return configs;
    }
  } catch { /* ignore */ }
  return [];
}

function saveConfigs(configs: AgentConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

/** 对指定 agent 查找配置：先找专属配置，再找默认共享配置，都没有则返回 null */
export function getConfigForAgent(agentName: string): AgentConfig | null {
  const all = loadConfigs();
  // 1) 专属
  const dedicated = all.find((c) => c.agentNames.includes(agentName));
  if (dedicated) return dedicated;
  // 2) 共享（agentNames 为空）
  const shared = all.find((c) => c.agentNames.length === 0);
  if (shared) return shared;
  // 3) 第一个有 key 的
  return all.find((c) => c.apiKey) || null;
}

export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return key ? "****" : "";
  return key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 12)) + key.slice(-4);
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

interface ConfigState {
  configs: AgentConfig[];
  load: () => void;
  add: (c: Omit<AgentConfig, "id" | "createdAt">) => void;
  update: (id: string, partial: Partial<AgentConfig>) => void;
  remove: (id: string) => void;
  getForAgent: (name: string) => AgentConfig | null;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxx-xxxx-4xxx-yxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const useAgentConfigStore = create<ConfigState>((set, get) => ({
  configs: loadConfigs(),

  load: () => set({ configs: loadConfigs() }),

  add: (c) => {
    try {
      const configs = [...get().configs, { ...c, id: uuid(), createdAt: Date.now() }];
      saveConfigs(configs);
      set({ configs });
    } catch { /* localStorage 可能满或被禁用 */ }
  },

  update: (id, partial) => {
    try {
      const configs = get().configs.map((c) => (c.id === id ? { ...c, ...partial } : c));
      saveConfigs(configs);
      set({ configs });
    } catch {}
  },

  remove: (id) => {
    try {
      const configs = get().configs.filter((c) => c.id !== id);
      saveConfigs(configs);
      set({ configs });
    } catch {}
  },

  getForAgent: (name) => getConfigForAgent(name),
}));
