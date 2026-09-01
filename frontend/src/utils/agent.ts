/**
 * 通用 Agent 调用器 — 9 个工作台共享（P2：抽公共助手，消除 9 份几乎相同的 callAgent）。
 *
 * 能力：in-flight 防抖锁（防止学生重复点击导致多次 LLM 调用）+ 错误日志 + 统一降级结果。
 * 所有工作台应通过本模块调用 Agent，而不是各自实现一份。
 */
import { hasAgentConfig, logAgentError } from "../api/service";

export type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };

const _agentInFlight = new Set<string>();

export async function callAgent(
  agentName: string,
  stage: string,
  fn: () => Promise<{ result?: unknown } | null>,
): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) {
    return { ok: false, error: "未配置 Agent（请在 ⚙️ Agent 配置页面添加 API Key）", agentName };
  }
  const _key = `${agentName}:${stage}`;
  if (_agentInFlight.has(_key)) {
    return { ok: false, error: "该 Agent 正在处理中，请稍候", agentName };
  }
  _agentInFlight.add(_key);
  try {
    const resp = await fn();
    const result = resp?.result as Record<string, unknown> | undefined;
    // 后端返回了明确的错误信息（如 HTTP 404、API key 无效等）
    if (result?.error) {
      const msg = String(result.error);
      logAgentError(agentName, stage, msg);
      return { ok: false, error: msg, agentName };
    }
    if (result && Object.keys(result).length > 0) return { ok: true, data: result };
    const err = `${agentName} 返回了空结果，已使用模板替代`;
    logAgentError(agentName, stage, err);
    return { ok: false, error: err, agentName };
  } catch (e: any) {
    const msg = `${agentName} 请求失败: ${e?.message || String(e)}`;
    logAgentError(agentName, stage, msg);
    return { ok: false, error: msg, agentName };
  } finally {
    _agentInFlight.delete(_key);
  }
}
