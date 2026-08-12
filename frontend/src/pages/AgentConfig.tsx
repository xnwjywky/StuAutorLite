/**
 * Agent LLM 配置页
 *
 * - 支持多个配置：共享（所有 Agent 共用）或单独分配给特定 Agent
 * - API Key 始终掩码显示（不提供明文查看按钮）
 * - 多配置时可选启用特定一个或全部停用（停用后 Agent 回退到内置模板）
 * - 配置持久化到 sessionStorage
 */
import { useState } from "react";
import Layout from "../components/Layout";
import {
  useAgentConfigStore,
  maskApiKey,
  AGENT_NAMES,
  isLocalBaseUrl,
  loadCustomLocalUrl,
  saveCustomLocalUrl,
} from "../stores/agentConfigStore";

const AGENT_LABELS: Record<string, string> = {
  research_mentor: "科研导师",
  experiment_designer: "实验设计助手",
  data_analyst: "数据分析伙伴",
  reflection: "反思引导员",
  reviewer: "审稿人",
  algorithm_tutor: "算法讲解员",
};

/** 常用服务商预设：一键填充 Base URL 与模型 */
const PRESETS: { label: string; baseUrl: string; model: string }[] = [
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-flash" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
];

export default function AgentConfigPage() {
  const { configs, add, remove, load, activate, deactivateAll, localServices, customServices, probingCustom, probeCustom, clearCustom } = useAgentConfigStore();
  const [adding, setAdding] = useState(false);
  const [customUrl, setCustomUrl] = useState<string>(loadCustomLocalUrl);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  // ── 新配置表单 ──
  const [form, setForm] = useState({
    label: "test_key",
    apiKey: "",
    baseUrl: PRESETS[0].baseUrl,
    model: PRESETS[0].model,
    agentNames: [] as string[],
  });

  const handleProbe = async () => {
    const url = customUrl.trim();
    if (!url || probingCustom) return;
    saveCustomLocalUrl(url);
    setProbeError(null);
    setProbeMsg(null);
    const r = await probeCustom(url);
    if (r.found) {
      setProbeMsg("✅ 已探测到本地模型，点击下方模型填入配置");
    } else {
      setProbeError(r.error || "未探测到可用模型");
    }
  };

  const handleAdd = () => {
    const isLocal = isLocalBaseUrl(form.baseUrl);
    if (!form.label.trim() || (!form.apiKey.trim() && !isLocal)) return;
    add({ ...form, apiKey: form.apiKey || "local", provider: "openai" as const, source: isLocal ? "local" as const : "cloud" as const });
    setForm({ label: "test_key", apiKey: "", baseUrl: PRESETS[0].baseUrl, model: PRESETS[0].model, agentNames: [] });
    setAdding(false);
  };

  const toggleAgent = (name: string) => {
    setForm((f) => ({
      ...f,
      agentNames: f.agentNames.includes(name) ? f.agentNames.filter((n) => n !== name) : [...f.agentNames, name],
    }));
  };

  const activeCount = configs.filter((c) => c.enabled !== false).length;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Agent 配置</h1>
            <p className="mt-2 text-gray-500 text-sm">配置 LLM API Key 和请求地址，Agent 将使用这些配置调用大模型进行评分和反馈</p>
          </div>
          <button className="btn-primary" onClick={() => setAdding(true)}>+ 添加配置</button>
        </div>

        {/* ── 本地模型检测结果（仅检测到本地服务时显示）── */}
        {localServices && localServices.length > 0 && (
          <div className="card mb-6 border-green-100 bg-green-50/20">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">🟢 检测到本地模型服务（点击模型填入配置）</h3>
            {localServices.map((svc) => (
              <div key={svc.name} className="mb-3 last:mb-0">
                <p className="text-xs text-gray-500 mb-1">{svc.name} · {svc.model_count} 个模型 · {svc.v1_base}</p>
                <div className="flex flex-wrap gap-1.5">
                  {svc.models.map((m) => (
                    <button key={m} type="button"
                      onClick={() => {
                        setForm({
                          label: `${svc.name}-${m}`,
                          apiKey: "",
                          baseUrl: svc.v1_base,
                          model: m,
                          agentNames: [],
                        });
                        setAdding(true);
                      }}
                      className="px-2 py-0.5 rounded-full text-[11px] border border-green-200 text-green-700 hover:bg-green-100">
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-gray-400 mt-3">本地服务默认无 API Key，保存后即自动填入占位 Key 并标记为「本地」配置</p>
          </div>
        )}

        {/* ── 自定义本地模型地址 ── */}
        <div className="card mb-6 border-amber-100 bg-amber-50/20">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">📍 自定义本地模型地址</h3>
          <p className="text-[11px] text-gray-500 mb-3">
            默认探测仅覆盖 Ollama(11434) / LM Studio(1234) / vLLM(8000) / llama.cpp(8080)。
            若你的服务在其他端口或另一台机器，在此填写地址后点「检测」（支持 Ollama /api/tags 与 OpenAI /v1/models 两种协议）。
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-300"
              placeholder="例如 http://127.0.0.1:11435 或 http://192.168.1.20:8080"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleProbe(); }}
            />
            <button
              className="btn-secondary text-xs"
              onClick={handleProbe}
              disabled={!customUrl.trim() || probingCustom}
            >
              {probingCustom ? "检测中…" : "检测"}
            </button>
          </div>
          {probeError && <p className="text-xs text-red-500 mt-2">⚠️ {probeError}</p>}
          {probeMsg && !probeError && <p className="text-xs text-green-600 mt-2">{probeMsg}</p>}
        </div>

        {/* ── 自定义地址探测结果（仅探测到模型时显示）── */}
        {customServices.length > 0 && (
          <div className="card mb-6 border-amber-200 bg-amber-50/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-gray-700">📍 自定义地址探测结果（点击模型填入配置）</h3>
              <button className="text-xs text-gray-400 hover:text-gray-600" onClick={clearCustom}>清除</button>
            </div>
            {customServices.map((svc) => (
              <div key={svc.v1_base} className="mb-3 last:mb-0">
                <p className="text-xs text-gray-500 mb-1">{svc.name} · {svc.model_count} 个模型 · {svc.v1_base}</p>
                <div className="flex flex-wrap gap-1.5">
                  {svc.models.map((m) => (
                    <button key={m} type="button"
                      onClick={() => {
                        setForm({
                          label: `${svc.name}-${m}`,
                          apiKey: "",
                          baseUrl: svc.v1_base,
                          model: m,
                          agentNames: [],
                        });
                        setAdding(true);
                      }}
                      className="px-2 py-0.5 rounded-full text-[11px] border border-amber-300 text-amber-700 hover:bg-amber-100">
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 添加配置表单 ── */}
        {adding && (
          <div className="card mb-6 border-primary-200 bg-primary-50/20">
            <h2 className="font-semibold text-gray-800 mb-4">新配置</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">配置名称</label>
                <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder="例如：我的 OpenAI Key" value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">API Key</label>
                <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder="sk-..." value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">API Base URL</label>
                  <input className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="https://api.deepseek.com/v1 或 https://api.openai.com/v1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">模型名称</label>
                  <input className="w-full mt-1 px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="例如 deepseek-v4-flash 或 gpt-4o" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-gray-400 mr-1">快捷填充：</span>
                {PRESETS.map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => setForm((f) => ({ ...f, baseUrl: p.baseUrl, model: p.model }))}
                    className="px-2 py-0.5 rounded-full text-[11px] border border-gray-200 text-gray-500 hover:bg-gray-100">
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400">协议由后端根据 Base URL 自动检测（deepseek/siliconflow → OpenAI 协议，/anthropic → Anthropic 协议）</p>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  分配给 Agent（不选 = 所有 Agent 共用）
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AGENT_NAMES.map((name) => (
                    <button key={name} onClick={() => toggleAgent(name)}
                      className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                        form.agentNames.includes(name) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}>
                      {AGENT_LABELS[name]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setAdding(false)}>取消</button>
              <button className="btn-primary" onClick={handleAdd} disabled={!form.label.trim() || (!form.apiKey.trim() && !isLocalBaseUrl(form.baseUrl))}>
                保存配置
              </button>
            </div>
          </div>
        )}

        {/* ── 已有配置列表 ── */}
        {configs.length === 0 && !adding && (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-gray-400 mb-4">还没有任何 Agent 配置</p>
            <p className="text-gray-300 text-xs mb-4">添加 LLM API Key 后，Agent 将自动调用大模型进行评估和反馈</p>
            <button className="btn-primary" onClick={() => setAdding(true)}>+ 添加第一个配置</button>
          </div>
        )}

        <div className="space-y-3">
          {configs.map((cfg) => {
            const isActive = cfg.enabled !== false;
            return (
              <div key={cfg.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <button
                        onClick={() => (isActive ? deactivateAll() : activate(cfg.id))}
                        title={isActive ? "点击停用此配置" : "启用此配置（同时停用其他配置）"}
                        aria-pressed={isActive}
                        className={`flex items-center gap-1.5 text-xs shrink-0 px-2 py-0.5 rounded-full transition-colors ${
                          isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}
                      >
                        <span className={`inline-block w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-gray-300"}`} />
                        {isActive ? "使用中" : "未启用"}
                      </button>
                      <h3 className="font-semibold text-gray-800 text-sm">{cfg.label}</h3>
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {cfg.agentNames.length > 0 ? cfg.agentNames.map((n) => AGENT_LABELS[n] || n).join("、") : "全部 Agent 共用"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5 font-mono">
                      <p>🔑 {cfg.source === "local" ? "本地（无需 Key）" : maskApiKey(cfg.apiKey)}</p>
                      <p>🌐 {cfg.baseUrl}</p>
                      <p>🤖 {cfg.model}</p>
                    </div>
                  </div>
                  <button className="text-red-400 hover:text-red-600 text-xs ml-4 shrink-0"
                    onClick={() => { remove(cfg.id); load(); }}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
        {configs.length > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            {activeCount > 0 ? `当前启用 ${activeCount} 个配置（Agent 调用按 专属 > 共享 > 首个启用 顺序取用）` : "当前未启用任何配置，Agent 将回退到内置模板，不调用 LLM"}
          </p>
        )}

        {/* ── 说明 ── */}
        <div className="card mt-6 border-blue-100 bg-blue-50/30">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">说明</h3>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• API Key 保存在浏览器会话存储（sessionStorage）中，关闭标签页即清除；列表仅显示掩码，不提供明文查看</li>
            <li>• 每次 Agent 调用时，前端将启用的配置（含 API Key）通过请求头发送给后端，用于调用你配置的模型服务商</li>
            <li>• 多配置时点绿色「使用中」按钮切换启用项，或再次点击停用全部（都不使用 → Agent 回退模板）</li>
            <li>• 请勿在公共电脑保存密钥；不要将 Key 分享给他人</li>
            <li>• 共享配置：不指定 Agent 则所有 Agent 共用同一个 Key；专属配置：指定 Agent 后，只有该 Agent 使用此 Key</li>
            <li>• 快捷填充支持 DeepSeek、OpenAI 两种常用服务商</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
