/** 阶段容器 — 统一步骤编号 + 标题 + Agent 状态提示，所有阶段复用 */
import type { ReactNode } from "react";

interface Props {
  step: number;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Agent 调用状态提示 */
  agent?: { text: string; ok: boolean } | null;
}

export default function StageContainer({ step, title, children, actions, agent }: Props) {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm flex items-center justify-center font-bold">{step}</span>
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
      </div>

      {/* Agent 状态提示 */}
      {agent && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 ${agent.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
          <span>{agent.ok ? "✅ 已使用 Agent 分析" : "⚠️ " + agent.text}</span>
        </div>
      )}

      <div className="space-y-4">{children}</div>

      {actions && (
        <div className="mt-8 flex items-center justify-between border-t pt-6">{actions}</div>
      )}
    </div>
  );
}
