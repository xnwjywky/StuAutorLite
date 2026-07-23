/** 强化学习格子世界实验状态 */
import { create } from "zustand";
import type { ResearchStage } from "../types";

export interface RLWorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;

  rawQuestion: string; refinedQuestion: string; suggestedQuestions: string[];
  hypothesis: string;

  // 实验参数
  selectedAgents: string[];
  gridSize: number;
  numTraps: number;
  numEpisodes: number;
  learningRate: number;
  discount: number;
  epsilon: number;
  numTrials: number;
  designCompleted: boolean;

  experimentResult: {
    experiment_batch_id: string; status: string; total_runs: number;
    summary: Record<string, any>; runs: any[];
  } | null;
  selectedTrial: number;

  studentAnalysis: string;
  aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reportMarkdown: string;
}

const defaults = (): RLWorkflowData => ({
  sessionId: null, taskId: "rl_gridworld", currentStage: "TASK_SELECTED",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "",
  selectedAgents: ["Q_LEARNING", "SARSA"],
  gridSize: 8, numTraps: 3, numEpisodes: 2000,
  learningRate: 0.1, discount: 0.9, epsilon: 0.1,
  numTrials: 3, designCompleted: false,
  experimentResult: null, selectedTrial: 1,
  studentAnalysis: "", aiAnalysis: null, reportMarkdown: "",
});

export const useRLStore = create<RLWorkflowData & {
  init: (id: number, taskId?: string) => void;
  setStage: (s: ResearchStage) => void;
  set: (p: Partial<RLWorkflowData>) => void;
  reset: () => void;
}>((set) => ({
  ...defaults(),
  init: (id, taskId = "rl_gridworld") => set({ ...defaults(), sessionId: id, taskId }),
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p), reset: () => set(defaults()),
}));
