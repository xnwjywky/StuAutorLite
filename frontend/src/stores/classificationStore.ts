/** 图像分类实验状态 — 镜像 workflowStore.ts 模式 */
import { create } from "zustand";
import type { ClassifierType, ClassifyMetricType, DataPattern, ResearchStage } from "../types";

export interface ClassifyWorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;

  // Stage 2 — 研究问题
  rawQuestion: string;
  refinedQuestion: string;
  suggestedQuestions: string[];

  // Stage 3 — 实验假设
  hypothesis: string;
  aiHypothesisFeedback: string;

  // Stage 4 — 实验设计
  selectedClassifiers: ClassifierType[];
  nSamples: number;
  noiseLevels: number[];
  patterns: DataPattern[];
  numTrials: number;
  trainRatio: number;
  kValue: number;
  maxDepth: number;
  selectedMetrics: ClassifyMetricType[];
  designCompleted: boolean;

  // Stage 5 — 运行实验
  experimentResult: {
    experiment_batch_id: string;
    status: string;
    total_runs: number;
    summary: Record<string, { avg_accuracy: number; avg_precision: number; avg_recall: number; avg_f1: number; avg_runtime_ms: number; count: number }>;
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

  // Stage 9 — 审稿反馈
  reviewResult: {
    scores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    revision_suggestions: string[];
    review_questions: string[];
  } | null;
}

const defaults = (): ClassifyWorkflowData => ({
  sessionId: null,
  taskId: "simple_classification",
  currentStage: "TASK_SELECTED",
  rawQuestion: "",
  refinedQuestion: "",
  suggestedQuestions: [],
  hypothesis: "",
  aiHypothesisFeedback: "",
  selectedClassifiers: [] as ClassifierType[],
  nSamples: 200,
  noiseLevels: [0.0],
  patterns: ["blobs"],
  numTrials: 5,
  trainRatio: 0.7,
  kValue: 3,
  maxDepth: 4,
  selectedMetrics: ["accuracy", "f1"],
  designCompleted: false,
  experimentResult: null,
  selectedRunIdx: 0,
  studentAnalysis: "",
  aiAnalysis: null,
  reflectionAnswers: {},
  reportMarkdown: "",
  reviewResult: null,
});

interface ClassifyWorkflowActions {
  init: (sessionId: number, taskId?: string) => void;
  setStage: (stage: ResearchStage) => void;
  set: (partial: Partial<ClassifyWorkflowData>) => void;
  reset: () => void;
}

export const useClassificationStore = create<ClassifyWorkflowData & ClassifyWorkflowActions>((set) => ({
  ...defaults(),

  init: (sessionId, taskId = "simple_classification") =>
    set({ ...defaults(), sessionId, taskId }),

  setStage: (stage) => set({ currentStage: stage }),

  set: (partial) => set(partial),

  reset: () => set(defaults()),
}));
