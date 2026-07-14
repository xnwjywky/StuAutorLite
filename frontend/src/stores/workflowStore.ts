/** 科研流程共享状态 — 9 阶段完整流程 */
import { create } from "zustand";
import type { AlgorithmType, MetricType, ResearchStage } from "../types";

// ── 每个阶段的数据 ─────────────────────────────────────
export interface WorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;

  // Stage 2 — 研究问题
  rawQuestion: string;
  refinedQuestion: string;
  independentVariable: string;
  dependentVariables: string[];
  controlledVariables: string[];
  suggestedQuestions: string[];

  // Stage 3 — 实验假设
  hypothesis: string;
  aiHypothesisFeedback: string;

  // Stage 4 — 实验设计
  selectedAlgorithms: AlgorithmType[];
  mazeSize: [number, number];
  obstacleRatios: number[];
  numTrials: number;
  selectedMetrics: MetricType[];
  designReview: { score: number; is_valid: boolean; feedback: string } | null;
  designCompleted: boolean; // 是否经过 Stage 4

  // Stage 5 — 运行实验
  experimentResult: {
    experiment_batch_id: string;
    status: string;
    total_runs: number;
    summary: Record<string, { success_rate: number; avg_path_length: number; avg_expanded_nodes: number; avg_runtime_ms: number }>;
    runs: any[];
  } | null;
  selectedRunIdx: number;

  // Stage 6 — 结果分析
  studentAnalysis: string;
  aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;

  // Stage 7 — 反思改进
  reflectionAnswers: Record<number, string>;

  // Stage 8 — 研究报告
  reportMarkdown: string;
  reportId: number | null;

  // Stage 9 — 审稿反馈
  reviewResult: {
    scores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    revision_suggestions: string[];
    review_questions: string[];
  } | null;
}

// ── 默认值 ─────────────────────────────────────────────
const defaults = (): WorkflowData => ({
  sessionId: null,
  taskId: "maze_pathfinding",
  currentStage: "TASK_SELECTED",
  rawQuestion: "",
  refinedQuestion: "",
  independentVariable: "obstacle_ratio",
  dependentVariables: ["expanded_nodes", "runtime_ms"],
  controlledVariables: ["maze_size"],
  suggestedQuestions: [],
  hypothesis: "",
  aiHypothesisFeedback: "",
  selectedAlgorithms: [] as AlgorithmType[],
  mazeSize: [12, 12],
  obstacleRatios: [0.2],
  numTrials: 5,
  selectedMetrics: ["expanded_nodes", "runtime", "path_length", "success_rate"],
  designReview: null,
  designCompleted: false,
  experimentResult: null,
  selectedRunIdx: 0,
  studentAnalysis: "",
  aiAnalysis: null,
  reflectionAnswers: {},
  reportMarkdown: "",
  reportId: null,
  reviewResult: null,
});

// ── Store ──────────────────────────────────────────────
interface WorkflowActions {
  init: (sessionId: number, taskId?: string) => void;
  setStage: (stage: ResearchStage) => void;
  set: (partial: Partial<WorkflowData>) => void;
  reset: () => void;
}

export const useWorkflowStore = create<WorkflowData & WorkflowActions>((set) => ({
  ...defaults(),

  init: (sessionId, taskId = "maze_pathfinding") =>
    set({ ...defaults(), sessionId, taskId }),

  setStage: (stage) => set({ currentStage: stage }),

  set: (partial) => set(partial),

  reset: () => set(defaults()),
}));

// ── 快捷 selectors ─────────────────────────────────────
export const useSessionId = () => useWorkflowStore((s) => s.sessionId);
export const useCurrentStage = () => useWorkflowStore((s) => s.currentStage);
