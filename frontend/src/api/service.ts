/** API service — 封装所有后端 API 调用 */
import apiClient, { createAgentClient, detectBaseUrl } from "./client";
import { getConfigForAgent } from "../stores/agentConfigStore";
import type {
  ResearchSession, ResearchQuestion, Hypothesis,
  ExperimentSummary, AnalysisRecord,
  ResearchReport, ClassificationResult,
} from "../types";

// ── 会话 ────────────────────────────────────────────────
export async function createSession(taskId = "maze_pathfinding"): Promise<ResearchSession> {
  const resp = await apiClient.post("/api/research/sessions/", { task_id: taskId }) as ResearchSession;
  return resp;
}

// ── 研究问题 ────────────────────────────────────────────
export async function suggestQuestions(sessionId: number, interest: string): Promise<{ suggested_questions: string[] }> {
  return apiClient.post("/api/research/questions/suggest", {
    session_id: sessionId, task_id: "maze_pathfinding", student_interest: interest,
  }) as Promise<{ suggested_questions: string[] }>;
}

export async function saveQuestion(data: {
  session_id: number; raw_question: string; refined_question: string;
  independent_variable: string; dependent_variables: string[]; controlled_variables: string[];
}): Promise<ResearchQuestion> {
  return apiClient.post("/api/research/questions/", data) as Promise<ResearchQuestion>;
}

// ── 假设 ────────────────────────────────────────────────
export async function saveHypothesis(sessionId: number, studentText: string): Promise<Hypothesis> {
  return apiClient.post("/api/agents/save-hypothesis", {
    session_id: sessionId, student_text: studentText,
  }) as Promise<Hypothesis>;
}

// ── 实验设计 ────────────────────────────────────────────
export async function reviewDesign(design: Record<string, unknown>): Promise<{
  score: number; is_valid: boolean; feedback: string; suggested_revision: Record<string, number>;
}> {
  return apiClient.post("/api/experiments/design/review", design) as Promise<any>;
}

// ── 运行实验 ────────────────────────────────────────────
export async function runExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<ExperimentSummary & { runs: any[] }> {
  return apiClient.post("/api/experiments/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── 分析 ────────────────────────────────────────────────
export async function analyzeResults(sessionId: number, hypothesis: string): Promise<{
  summary: string; key_findings: string[]; questions_for_student: string[];
}> {
  return apiClient.post("/api/analysis/analyze", {
    session_id: sessionId, student_hypothesis: hypothesis,
  }) as Promise<any>;
}

export async function saveAnalysis(sessionId: number, text: string): Promise<AnalysisRecord> {
  return apiClient.post("/api/analysis/", {
    session_id: sessionId, student_analysis: text,
  }) as Promise<AnalysisRecord>;
}

// ── 报告 ────────────────────────────────────────────────
export async function generateReport(sessionId: number): Promise<ResearchReport> {
  return apiClient.post("/api/reports/generate", { session_id: sessionId }) as Promise<ResearchReport>;
}

export async function reviewReport(sessionId: number): Promise<{
  scores: Record<string, number>; strengths: string[]; weaknesses: string[];
  revision_suggestions: string[]; review_questions: string[];
}> {
  return apiClient.post("/api/reports/review", { session_id: sessionId }) as Promise<any>;
}

// ═══════════════════════════════════════════════════════════
// Agent LLM 调用（带用户配置的 API Key Header）
// ═══════════════════════════════════════════════════════════

type AgentResult<T = Record<string, unknown>> = { agent_name: string; result: T };

function buildClient(agentName: string) {
  const cfg = getConfigForAgent(agentName);
  if (!cfg?.apiKey) return null;
  return createAgentClient(cfg);
}

export async function invokeAgent(agentName: string, context: Record<string, unknown>) {
  const client = buildClient(agentName);
  if (!client) return null;
  const resp: any = await client.post(`/api/agents/${agentName}/invoke`, { session_id: -1, context });
  return resp as AgentResult;
}

export async function callMentor(context: Record<string, unknown>) {
  const client = buildClient("research_mentor");
  if (!client) return null;
  const resp: any = await client.post("/api/agents/research-mentor/suggest", { session_id: -1, context });
  return resp as AgentResult<{ suggested_questions: string[]; explanation: string }>;
}

export async function callExperimentDesigner(context: Record<string, unknown>) {
  const client = buildClient("experiment_designer");
  if (!client) return null;
  const resp: any = await client.post("/api/agents/experiment-designer/review", { session_id: -1, context });
  return resp as AgentResult<{ score: number; is_valid: boolean; feedback: string; suggested_revision: Record<string, unknown> }>;
}

export async function callDataAnalyst(context: Record<string, unknown>) {
  const client = buildClient("data_analyst");
  if (!client) return null;
  const resp: any = await client.post("/api/agents/data-analyst/analyze", { session_id: -1, context });
  return resp as AgentResult<{ summary: string; key_findings: string[]; questions_for_student: string[]; comparison_with_hypothesis: string }>;
}

export async function callReflection(context: Record<string, unknown>) {
  const client = buildClient("reflection");
  if (!client) return null;
  const resp: any = await client.post("/api/agents/reflection/reflect", { session_id: -1, context });
  return resp as AgentResult<{ questions: string[]; suggestions: string[] }>;
}

export async function callReviewer(context: Record<string, unknown>) {
  const client = buildClient("reviewer");
  if (!client) return null;
  const resp: any = await client.post("/api/agents/reviewer/review", { session_id: -1, context });
  return resp as AgentResult<{
    scores: Record<string, number>; strengths: string[]; weaknesses: string[];
    revision_suggestions: string[]; review_questions: string[];
  }>;
}

/** 通用 LLM 调用（Stage 8 报告润色），使用第一个可用配置 */
export async function callGeneralLLM(context: Record<string, unknown>) {
  const client = buildClient("reviewer") || buildClient("data_analyst");
  if (!client) return null;
  const resp: any = await client.post("/api/agents/general/chat", { session_id: -1, context: { prompt: buildReportPolishPrompt(context), messages: [{ role: "user", content: buildReportPolishPrompt(context) }] } });
  return resp as AgentResult<{ content_markdown?: string; polished?: string }>;
}

function buildReportPolishPrompt(ctx: Record<string, unknown>): string {
  return `请根据以下学生研究报告内容，帮助润色语言使其更流畅清晰，但保留学生的原始思考和关键回答。直接返回润色后的完整 Markdown 报告。\n\n${JSON.stringify(ctx)}`;
}

/** 检查是否存在已启用的 Agent 配置（P1-5：key 存 sessionStorage，与 store 保持一致） */
export function hasAgentConfig(): boolean {
  try { const raw = sessionStorage.getItem("stuautor_agent_configs"); return !!raw && JSON.parse(raw).some((c: any) => c.apiKey && c.enabled !== false); } catch { return false; }
}

/** Token 使用量统计（累计 LLM 调用消耗） */
export async function getTokenUsage(): Promise<{
  prompt_tokens: number; completion_tokens: number; total_tokens: number;
  calls: number; model: string; since: number | null;
}> {
  return apiClient.get("/api/agents/usage") as Promise<any>;
}

// ── 反思问题 ────────────────────────────────────────────
export interface ReflectionQuestion {
  id: number; session_id: number; question_text: string;
  category: string; category_label: string; sort_order: number;
  is_selected: boolean; student_answer: string; ai_feedback: string;
  template_answers?: { text: string; score: number; level: string }[];
  reflection_score?: number;
  created_at: string;
}

export async function generateReflectionQuestions(sessionId: number, taskId?: string): Promise<{ questions: ReflectionQuestion[]; total: number }> {
  return apiClient.post("/api/reflection/generate", { session_id: sessionId, task_id: taskId }) as Promise<any>;
}

export async function getReflectionQuestions(sessionId: number, taskId?: string): Promise<ReflectionQuestion[]> {
  const task = taskId ? `&task_id=${encodeURIComponent(taskId)}` : "";
  return apiClient.get(`/api/reflection/questions?session_id=${sessionId}${task}`) as Promise<ReflectionQuestion[]>;
}

export async function saveReflectionAnswer(questionId: number, studentAnswer: string): Promise<ReflectionQuestion> {
  return apiClient.put(`/api/reflection/questions/${questionId}/answer`, { student_answer: studentAnswer }) as Promise<ReflectionQuestion>;
}

/** Agent 错误日志 */
export function logAgentError(agentName: string, stage: string, error: unknown) {
  const entry = { agent: agentName, stage, error: String(error), time: new Date().toISOString() };
  try {
    const logs = JSON.parse(localStorage.getItem("stuautor_agent_errors") || "[]");
    logs.unshift(entry);
    if (logs.length > 100) logs.length = 100;
    localStorage.setItem("stuautor_agent_errors", JSON.stringify(logs));
  } catch {}
  console.error(`[Agent Error] ${agentName} @ ${stage}:`, error);
}

// ── 图像分类实验 (§16.2) ────────────────────────────────
export async function runClassificationExperiment(data: {
  session_id: number; classifiers: string[]; settings: Record<string, unknown>;
}): Promise<ClassificationResult & { runs: any[] }> {
  return apiClient.post("/api/classify/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── 猜数字实验 ──────────────────────────────────────────
export async function runGuessExperiment(data: {
  session_id: number; strategies: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").GuessResult & { runs: any[] }> {
  return apiClient.post("/api/guessnumber/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── 排序算法实验 ──────────────────────────────────────────
export async function runSortingExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").SortingResult & { runs: any[] }> {
  return apiClient.post("/api/sorting/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── 字符串搜索实验 ──────────────────────────────────────────
export async function runStringSearchExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").StringSearchResult & { runs: any[] }> {
  return apiClient.post("/api/stringsearch/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── 图形识别实验 ──────────────────────────────────────────
export async function runShapeRecogExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").ShapeRecogResult & { runs: any[] }> {
  return apiClient.post("/api/shaperecog/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── 手写数字识别实验 ──────────────────────────────────────────
export async function runDigitsExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").DigitRecogResult & { runs: any[] }> {
  return apiClient.post("/api/digits/run", data, { timeout: 600000 }) as Promise<any>;
}

// ── MNIST 手写数字识别实验 ────────────────────────────────────
/** MNIST 数据准备状态（MNIST_DOWNLOAD_NONBLOCKING：下载在后台，前端据此展示横幅） */
export async function getMnistDataStatus(): Promise<{
  ready: boolean; downloading: boolean; error: string | null;
  progress: string; retry_count: number;
}> {
  return apiClient.get("/api/mnist/data-status") as Promise<any>;
}

/** 手动触发 MNIST 数据重新下载（下载失败后点"重试"调用） */
export async function retryMnistData(): Promise<{ ok: boolean; message: string; status: any }> {
  return apiClient.post("/api/mnist/data-retry") as Promise<any>;
}

// ── 统一图像识别实验（合并图形+数字） ──────────────────────────
export async function runImageRecogExperiment(data: {
  session_id: number; experiment_type: string; algorithms: string[];
  algo_params?: Record<string, Record<string, number>>; settings: Record<string, unknown>;
}): Promise<import("../types").ImageRecogResult & { runs: any[] }> {
  return apiClient.post("/api/imagerecog/run", data, { timeout: 600000 }) as Promise<any>;
}

/** SSE 流式运行 — 返回 ReadableStream 用于实时进度。
 * signal（可选）：调用方 AbortController.signal，中止时透传给底层 fetch 并静默退出
 * （P-性能：imagerecog SSE abort 未透传 bug 修复——不传 signal 时前端取消请求，
 * 后端/底层 fetch 感知不到，仍继续空转计算）。 */
export async function runImageRecogStream(
  data: {
    session_id: number; experiment_type: string; algorithms: string[];
    algo_params?: Record<string, Record<string, number>>; settings: Record<string, unknown>;
  },
  onEvent: (event: any) => void,
  onError: (err: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = detectBaseUrl();
  // P0-2：裸 fetch 不像 axios 那样带 X-App-Key，启用鉴权时需手动补头，否则 401
  const appKey = (import.meta.env.VITE_APP_KEY ?? "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (appKey) headers["X-App-Key"] = appKey;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const resp = await fetch(`${baseUrl}/api/imagerecog/run-stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    reader = resp.body?.getReader() ?? null;
    if (!reader) throw new Error("无法读取响应流");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          try {
            const event = JSON.parse(trimmed.slice(6));
            onEvent(event);
            if (event.type === "done" || event.type === "error") return;
          } catch {}
        }
      }
    }
  } catch (e) {
    // AbortController.abort() 触发的 AbortError 属于主动取消：静默返回，不报错
    if (e instanceof DOMException && e.name === "AbortError") return;
    onError(e as Error);
  } finally {
    // 中止/完成时关闭底层流，及时释放连接（取消请求时让后端感知断开）
    if (reader) await reader.cancel().catch(() => {});
  }
}
