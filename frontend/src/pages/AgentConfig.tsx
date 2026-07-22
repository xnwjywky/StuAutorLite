/**
 * Agent LLM 配置页
 *
 * - 支持多个配置：共享（所有 Agent 共用）或单独分配给特定 Agent
 * - API Key 默认屏蔽中间字符，仅显示前后各 4 位
 * - 配置持久化到 localStorage
 */
import { useState } from "react";
import Layout from "../components/Layout";
import {
  useAgentConfigStore,
  maskApiKey,
  AGENT_NAMES,
} from "../stores/agentConfigStore";

const AGENT_LABELS: Record<string, string> = {
  research_mentor: "科研导师",
  experiment_designer: "实验设计助手",
  data_analyst: "数据分析伙伴",
  reflection: "反思引导员",
  reviewer: "审稿人",
  algorithm_tutor: "算法讲解员",
};

export default function AgentConfigPage() {
  const { configs, add, remove, load } = useAgentConfigStore();
  const [adding, setAdding] = useState(false);
  const [unmasked, setUnmasked] = useState<Set<string>>(new Set());

  // ── 新配置表单 ──
  const [form, setForm] = useState({
    label: "test_key",
    apiKey: "",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-flash",
    agentNames: [] as string[],
  });

  const toggleUnmask = (id: string) => {
    setUnmasked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (!form.label.trim() || !form.apiKey.trim()) return;
    add({ ...form, provider: "openai" as const });
    setForm({ label: "test_key", apiKey: "", baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-flash", agentNames: [] });
    setAdding(false);
  };

  const toggleAgent = (name: string) => {
    setForm((f) => ({
      ...f,
      agentNames: f.agentNames.includes(name) ? f.agentNames.filter((n) => n !== name) : [...f.agentNames, name],
    }));
  };

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
              <p className="text-[10px] text-gray-400">协议由后端根据 Base URL 自动检测（deepseek/api.openai.com → OpenAI 协议，/anthropic → Anthropic 协议）</p>
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
              <button className="btn-primary" onClick={handleAdd} disabled={!form.label.trim() || !form.apiKey.trim()}>
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
          {configs.map((cfg) => (
            <div key={cfg.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-800 text-sm">{cfg.label}</h3>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {cfg.agentNames.length > 0 ? cfg.agentNames.map((n) => AGENT_LABELS[n] || n).join("、") : "全部 Agent 共用"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5 font-mono">
                    <p>🔑 {unmasked.has(cfg.id) ? cfg.apiKey : maskApiKey(cfg.apiKey)}
                      <button className="ml-2 text-gray-400 hover:text-gray-600 underline" onClick={() => toggleUnmask(cfg.id)}>
                        {unmasked.has(cfg.id) ? "隐藏" : "显示"}
                      </button>
                    </p>
                    <p>🌐 {cfg.baseUrl}</p>
                    <p>🤖 {cfg.model}</p>
                  </div>
                </div>
                <button className="text-red-400 hover:text-red-600 text-xs ml-4 shrink-0"
                  onClick={() => { remove(cfg.id); load(); }}>删除</button>
              </div>
            </div>
          ))}
        </div>

        {/* ── 说明 ── */}
        <div className="card mt-6 border-blue-100 bg-blue-50/30">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">说明</h3>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• API Key 仅存储在浏览器本地 localStorage，不会上传到服务器</li>
            <li>• 每次 Agent 调用时，前端将配置通过请求头发送给后端</li>
            <li>• 共享配置：不指定 Agent 则所有 Agent 共用同一个 Key</li>
            <li>• 专属配置：指定 Agent 后，只有该 Agent 使用此 Key</li>
            <li>• 查找优先级：专属配置 {'>'} 共享配置 {'>'} 第一个有效配置</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
