/** 测试 agentConfigStore — Agent 配置管理与密钥安全 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useAgentConfigStore,
  getConfigForAgent,
  maskApiKey,
  AGENT_NAMES,
  loadCustomLocalUrl,
  saveCustomLocalUrl,
} from "../agentConfigStore";
import apiClient from "../../api/client";

vi.mock("../../api/client", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockPost = vi.mocked(apiClient.post);

describe("agentConfigStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
    const saved = JSON.parse(sessionStorage.getItem("stuautor_agent_configs")!);
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
    const saved = JSON.parse(sessionStorage.getItem("stuautor_agent_configs")!);
    expect(saved).toHaveLength(5);
  });

  it("load 从 sessionStorage 重新加载", () => {
    sessionStorage.setItem("stuautor_agent_configs", JSON.stringify([{
      id: "saved", label: "已保存", apiKey: "sk-saved", baseUrl: "", model: "", provider: "openai", agentNames: [], createdAt: 0,
    }]));
    useAgentConfigStore.getState().load();
    expect(useAgentConfigStore.getState().configs).toHaveLength(1);
    expect(useAgentConfigStore.getState().configs[0].label).toBe("已保存");
  });
});

describe("getConfigForAgent", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("无配置时返回 null", () => {
    expect(getConfigForAgent("research_mentor")).toBeNull();
  });

  it("优先返回专属配置", () => {
    const cfg = { id: "1", label: "专属", apiKey: "sk-a", baseUrl: "http://x", model: "m", provider: "openai", agentNames: ["research_mentor"], createdAt: 0 };
    sessionStorage.setItem("stuautor_agent_configs", JSON.stringify([cfg]));
    const r = getConfigForAgent("research_mentor");
    expect(r?.label).toBe("专属");
  });

  it("停用的配置不会被选中（全部停用返回 null）", () => {
    const cfg = { id: "1", label: "停用", apiKey: "sk-a", baseUrl: "http://x", model: "m", provider: "openai", agentNames: [], enabled: false, createdAt: 0 };
    sessionStorage.setItem("stuautor_agent_configs", JSON.stringify([cfg]));
    expect(getConfigForAgent("research_mentor")).toBeNull();
  });

  it("启用项被选中时忽略已停用配置", () => {
    const disabled = { id: "1", label: "停用", apiKey: "sk-a", baseUrl: "http://x", model: "m", provider: "openai", agentNames: [], enabled: false, createdAt: 0 };
    const active = { id: "2", label: "启用", apiKey: "sk-b", baseUrl: "http://y", model: "m2", provider: "openai", agentNames: [], enabled: true, createdAt: 0 };
    sessionStorage.setItem("stuautor_agent_configs", JSON.stringify([disabled, active]));
    const r = getConfigForAgent("research_mentor");
    expect(r?.label).toBe("启用");
  });

  it("旧配置缺少 enabled 视为启用（向后兼容）", () => {
    const cfg = { id: "1", label: "旧配置", apiKey: "sk-a", baseUrl: "http://x", model: "m", provider: "openai", agentNames: [], createdAt: 0 };
    sessionStorage.setItem("stuautor_agent_configs", JSON.stringify([cfg]));
    expect(getConfigForAgent("research_mentor")?.label).toBe("旧配置");
  });
});

describe("enabled 单选与停用", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAgentConfigStore.getState().load();
  });

  function addCfg(label: string) {
    useAgentConfigStore.getState().add({
      label, apiKey: "sk-" + label, baseUrl: "http://x", model: "m", provider: "openai" as const, agentNames: [],
    });
    const c = useAgentConfigStore.getState().configs.find((x) => x.label === label)!;
    return c.id;
  }

  it("add 默认 enabled=true", () => {
    addCfg("a");
    expect(useAgentConfigStore.getState().configs[0].enabled).toBe(true);
  });

  it("activate 单选：启用一个并停用其他", () => {
    const idA = addCfg("a");
    const idB = addCfg("b");
    useAgentConfigStore.getState().activate(idB);
    const cs = useAgentConfigStore.getState().configs;
    expect(cs.find((c) => c.id === idB)?.enabled).toBe(true);
    expect(cs.find((c) => c.id === idA)?.enabled).toBe(false);
  });

  it("deactivateAll 停用全部（都不使用）", () => {
    addCfg("a");
    addCfg("b");
    useAgentConfigStore.getState().deactivateAll();
    expect(useAgentConfigStore.getState().configs.every((c) => c.enabled === false)).toBe(true);
    // 持久化后 getConfigForAgent 返回 null
    expect(getConfigForAgent("research_mentor")).toBeNull();
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

describe("probeCustom 自定义地址探测", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPost.mockReset();
    useAgentConfigStore.getState().load();
    useAgentConfigStore.setState({ customServices: [], probingCustom: false });
  });

  it("探测成功时填充 customServices 并返回 found=true", async () => {
    mockPost.mockResolvedValue({
      found: true,
      services: [{
        name: "自定义服务",
        v1_base: "http://127.0.0.1:11435/v1",
        models: ["qwen2.5:7b"],
        model_count: 1,
      }],
    });
    const r = await useAgentConfigStore.getState().probeCustom("http://127.0.0.1:11435");
    expect(r.found).toBe(true);
    expect(mockPost).toHaveBeenCalledWith("/api/agents/local-models/probe", { url: "http://127.0.0.1:11435" });
    expect(useAgentConfigStore.getState().customServices).toHaveLength(1);
    expect(useAgentConfigStore.getState().customServices[0].v1_base).toBe("http://127.0.0.1:11435/v1");
    expect(useAgentConfigStore.getState().probingCustom).toBe(false);
  });

  it("探测失败（后端返回 error）时清空结果并返回错误", async () => {
    mockPost.mockResolvedValue({ found: false, services: [], error: "未探测到可用模型" });
    const r = await useAgentConfigStore.getState().probeCustom("http://127.0.0.1:9999");
    expect(r.found).toBe(false);
    expect(r.error).toBe("未探测到可用模型");
    expect(useAgentConfigStore.getState().customServices).toEqual([]);
  });

  it("探测异常（请求失败）时清空结果并返回通用错误", async () => {
    mockPost.mockRejectedValue(new Error("Network Error"));
    const r = await useAgentConfigStore.getState().probeCustom("http://127.0.0.1:11435");
    expect(r.found).toBe(false);
    expect(r.error).toContain("Network Error");
    expect(useAgentConfigStore.getState().customServices).toEqual([]);
    expect(useAgentConfigStore.getState().probingCustom).toBe(false);
  });

  it("clearCustom 清空自定义结果", () => {
    useAgentConfigStore.setState({
      customServices: [{ name: "自定义服务", v1_base: "http://x/v1", models: ["m"], model_count: 1 }],
    });
    useAgentConfigStore.getState().clearCustom();
    expect(useAgentConfigStore.getState().customServices).toEqual([]);
  });
});

describe("自定义本地模型地址持久化", () => {
  beforeEach(() => sessionStorage.clear());

  it("save 后 load 能取回", () => {
    expect(loadCustomLocalUrl()).toBe("");
    saveCustomLocalUrl("http://127.0.0.1:11435");
    expect(loadCustomLocalUrl()).toBe("http://127.0.0.1:11435");
  });

  it("sessionStorage 清空后 load 返回空串", () => {
    saveCustomLocalUrl("http://127.0.0.1:11435");
    sessionStorage.clear();
    expect(loadCustomLocalUrl()).toBe("");
  });
});
