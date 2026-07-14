/** 测试 agentConfigStore — Agent 配置管理与密钥安全 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAgentConfigStore, getConfigForAgent, maskApiKey, AGENT_NAMES } from "../agentConfigStore";

describe("agentConfigStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAgentConfigStore.getState().load();
  });

  it("初始时无配置", () => {
    expect(useAgentConfigStore.getState().configs).toEqual([]);
  });

  it("add 追加配置并持久化", () => {
    useAgentConfigStore.getState().add({
      label: "测试 Key",
      apiKey: "sk-test-12345678",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      provider: "openai" as const,
      agentNames: [],
    });
    expect(useAgentConfigStore.getState().configs).toHaveLength(1);
    expect(useAgentConfigStore.getState().configs[0].label).toBe("测试 Key");
    // 验证持久化
    const saved = JSON.parse(localStorage.getItem("stuautor_agent_configs")!);
    expect(saved).toHaveLength(1);
  });

  it("update 合并更新", () => {
    const id = crypto.randomUUID?.() ?? "test-1";
    (useAgentConfigStore.getState().configs as any) = [{
      id, label: "旧名称", apiKey: "sk-old", baseUrl: "", model: "", provider: "openai", agentNames: [], createdAt: Date.now(),
    }];
    useAgentConfigStore.getState().update(id, { label: "新名称" });
    expect(useAgentConfigStore.getState().configs[0].label).toBe("新名称");
  });

  it("remove 删除配置", () => {
    const id = "test-id-to-remove";
    (useAgentConfigStore.getState().configs as any) = [{
      id, label: "移除项", apiKey: "sk-x", baseUrl: "", model: "", provider: "openai", agentNames: [], createdAt: 1,
    }];
    useAgentConfigStore.getState().remove(id);
    expect(useAgentConfigStore.getState().configs).toHaveLength(0);
  });

  it("add 生成 id 和 createdAt", () => {
    useAgentConfigStore.getState().add({
      label: "测试", apiKey: "sk-test", baseUrl: "", model: "", provider: "openai" as const, agentNames: [],
    });
    const cfg = useAgentConfigStore.getState().configs[0];
    expect(cfg.id).toBeTruthy();
    expect(cfg.createdAt).toBeGreaterThan(0);
  });

  it("add 空字段也能保存成功", () => {
    useAgentConfigStore.getState().add({
      label: "最小配置", apiKey: "sk-min", baseUrl: "", model: "", provider: "openai" as const, agentNames: [],
    });
    expect(useAgentConfigStore.getState().configs).toHaveLength(1);
    expect(useAgentConfigStore.getState().configs[0].baseUrl).toBe("");
    expect(useAgentConfigStore.getState().configs[0].model).toBe("");
  });

  it("连续多次 add 正常保存", () => {
    for (let i = 0; i < 5; i++) {
      useAgentConfigStore.getState().add({
        label: `配置${i}`, apiKey: `sk-${i}`, baseUrl: "", model: "", provider: "openai" as const, agentNames: [],
      });
    }
    expect(useAgentConfigStore.getState().configs).toHaveLength(5);
    const saved = JSON.parse(localStorage.getItem("stuautor_agent_configs")!);
    expect(saved).toHaveLength(5);
  });

  it("load 从 localStorage 重新加载", () => {
    localStorage.setItem("stuautor_agent_configs", JSON.stringify([{
      id: "saved", label: "已保存", apiKey: "sk-saved", baseUrl: "", model: "", provider: "openai", agentNames: [], createdAt: 0,
    }]));
    useAgentConfigStore.getState().load();
    expect(useAgentConfigStore.getState().configs).toHaveLength(1);
    expect(useAgentConfigStore.getState().configs[0].label).toBe("已保存");
  });
});

describe("getConfigForAgent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("无配置时返回 null", () => {
    expect(getConfigForAgent("research_mentor")).toBeNull();
  });

  it("优先返回专属配置", () => {
    const cfg = { id: "1", label: "专属", apiKey: "sk-a", baseUrl: "http://x", model: "m", provider: "openai", agentNames: ["research_mentor"], createdAt: 0 };
    localStorage.setItem("stuautor_agent_configs", JSON.stringify([cfg]));
    const r = getConfigForAgent("research_mentor");
    expect(r?.label).toBe("专属");
  });
});

describe("maskApiKey", () => {
  it("遮盖中间字符", () => {
    const result = maskApiKey("sk-1234567890abcdef");
    expect(result).toMatch(/^sk-1.+cdef$/);  // 保留前后4位
  });
  it("短 key 处理", () => {
    const masked = maskApiKey("abc");
    // maskApiKey 对短 key 的处理
    expect(typeof masked).toBe("string");
    expect(masked.length).toBeGreaterThanOrEqual(3);
  });
  it("空字符串返回空", () => {
    expect(maskApiKey("")).toBe("");
  });
});

describe("AGENT_NAMES", () => {
  it("包含所有 6 个 Agent", () => {
    expect(AGENT_NAMES).toHaveLength(6);
    expect(AGENT_NAMES).toContain("research_mentor");
    expect(AGENT_NAMES).toContain("reviewer");
  });
});
