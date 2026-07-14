/** 猜数字策略实验状态 — 聚焦算法学习 */
import { create } from "zustand";
import type { GuessStrategyType, ResearchStage } from "../types";

export interface GuessWorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;

  // Stage 2-3
  rawQuestion: string; refinedQuestion: string; suggestedQuestions: string[];
  hypothesis: string; aiHypothesisFeedback: string;

  // Stage 4 — 实验设计
  selectedStrategies: GuessStrategyType[];
  numberLow: number; numberHigh: number;
  numTrials: number;
  designCompleted: boolean;

  // Stage 5 — 运行实验
  experimentResult: {
    experiment_batch_id: string; status: string; total_runs: number;
    summary: Record<string, { avg_guesses: number; min_guesses: number; max_guesses: number; success_rate: number; avg_runtime_ms: number; count: number }>;
    runs: any[];
  } | null;
  selectedTrial: number;

  // Stage 6 — 分析 + 学习
  studentAnalysis: string;
  aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;

  // Stage 7 — 总结
  reportMarkdown: string;
}

const defaults = (): GuessWorkflowData => ({
  sessionId: null, taskId: "guess_number", currentStage: "TASK_SELECTED",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "", aiHypothesisFeedback: "",
  selectedStrategies: [] as GuessStrategyType[],
  numberLow: 1, numberHigh: 100, numTrials: 5, designCompleted: false,
  experimentResult: null, selectedTrial: 1,
  studentAnalysis: "", aiAnalysis: null,
  reportMarkdown: "",
});

interface Actions {
  init: (id: number, taskId?: string) => void;
  setStage: (s: ResearchStage) => void;
  set: (p: Partial<GuessWorkflowData>) => void;
  reset: () => void;
}

export const useGuessNumberStore = create<GuessWorkflowData & Actions>((set) => ({
  ...defaults(),
  init: (id, taskId = "guess_number") => set({ ...defaults(), sessionId: id, taskId }),
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p),
  reset: () => set(defaults()),
}));
