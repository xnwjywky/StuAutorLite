/** API service — 封装所有后端 API 调用 */
import apiClient, { createAgentClient } from "./client";
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

export async function getSession(sessionId: number): Promise<ResearchSession> {
  return apiClient.get(`/api/research/sessions/${sessionId}`) as Promise<ResearchSession>;
}

export async function updateStage(sessionId: number, stage: string): Promise<{ current_stage: string }> {
  return apiClient.put(`/api/research/sessions/${sessionId}/stage?stage=${stage}`) as Promise<{ current_stage: string }>;
}

export async function getStages(sessionId: number): Promise<{ current_stage: string; stages: { key: string; label: string }[] }> {
  return apiClient.get(`/api/research/sessions/${sessionId}/stages`) as Promise<any>;
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
  return apiClient.post("/api/experiments/run", data) as Promise<any>;
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

/** 检查是否已配置任何 Agent */
export function hasAgentConfig(): boolean {
  try { const raw = localStorage.getItem("stuautor_agent_configs"); return !!raw && JSON.parse(raw).some((c: any) => c.apiKey); } catch { return false; }
}

// ── 反思问题 ────────────────────────────────────────────
export interface ReflectionQuestion {
  id: number; session_id: number; question_text: string;
  category: string; category_label: string; sort_order: number;
  is_selected: boolean; student_answer: string; ai_feedback: string; created_at: string;
}

export async function generateReflectionQuestions(sessionId: number): Promise<{ questions: ReflectionQuestion[]; total: number }> {
  return apiClient.post("/api/reflection/generate", { session_id: sessionId }) as Promise<any>;
}

export async function getReflectionQuestions(sessionId: number): Promise<ReflectionQuestion[]> {
  return apiClient.get(`/api/reflection/questions?session_id=${sessionId}`) as Promise<ReflectionQuestion[]>;
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
  return apiClient.post("/api/classify/run", data) as Promise<any>;
}

export async function listClassificationRuns(sessionId?: number): Promise<any[]> {
  return apiClient.get(`/api/classify/runs${sessionId ? `?session_id=${sessionId}` : ""}`) as Promise<any[]>;
}

// ── 猜数字实验 ──────────────────────────────────────────
export async function runGuessExperiment(data: {
  session_id: number; strategies: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").GuessResult & { runs: any[] }> {
  return apiClient.post("/api/guessnumber/run", data) as Promise<any>;
}

// ── 排序算法实验 ──────────────────────────────────────────
export async function runSortingExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").SortingResult & { runs: any[] }> {
  return apiClient.post("/api/sorting/run", data) as Promise<any>;
}

// ── 字符串搜索实验 ──────────────────────────────────────────
export async function runStringSearchExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").StringSearchResult & { runs: any[] }> {
  return apiClient.post("/api/stringsearch/run", data) as Promise<any>;
}

// ── 图形识别实验 ──────────────────────────────────────────
export async function runShapeRecogExperiment(data: {
  session_id: number; algorithms: string[]; settings: Record<string, unknown>;
}): Promise<import("../types").ShapeRecogResult & { runs: any[] }> {
  return apiClient.post("/api/shaperecog/run", data) as Promise<any>;
}
