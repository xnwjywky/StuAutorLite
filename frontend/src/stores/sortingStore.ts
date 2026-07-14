/** 可视化算法比较实验状态 — 排序 + 字符串搜索 */
import { create } from "zustand";
import type { SortingAlgorithmType, StringSearchAlgorithmType, ResearchStage } from "../types";

export interface AlgoCompareWorkflowData {
  sessionId: number | null; taskId: string; currentStage: ResearchStage;
  experimentType: "sorting" | "stringsearch";
  rawQuestion: string; refinedQuestion: string; suggestedQuestions: string[];
  hypothesis: string; aiHypothesisFeedback: string;
  // 排序
  selectedSortingAlgos: SortingAlgorithmType[]; arraySize: number; dataPattern: "random" | "reversed" | "nearly_sorted";
  // 字符串搜索
  selectedSearchAlgos: StringSearchAlgorithmType[]; textLength: number; patternLength: number; searchPatternType: "random" | "repeated" | "absent";
  // 共享
  numTrials: number; designCompleted: boolean;
  experimentResult: { experiment_batch_id: string; status: string; total_runs: number; summary: Record<string, any>; runs: any[] } | null;
  selectedTrial: number;
  studentAnalysis: string; aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reportMarkdown: string;
}

const defaults = (): AlgoCompareWorkflowData => ({
  sessionId: null, taskId: "visual_algo_compare", currentStage: "TASK_SELECTED",
  experimentType: "sorting",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "", aiHypothesisFeedback: "",
  selectedSortingAlgos: [], arraySize: 20, dataPattern: "random",
  selectedSearchAlgos: [], textLength: 200, patternLength: 5, searchPatternType: "random",
  numTrials: 5, designCompleted: false,
  experimentResult: null, selectedTrial: 1,
  studentAnalysis: "", aiAnalysis: null, reportMarkdown: "",
});

export const useAlgoCompareStore = create<AlgoCompareWorkflowData & {
  init: (id: number, taskId?: string) => void;
  setStage: (s: ResearchStage) => void;
  set: (p: Partial<AlgoCompareWorkflowData>) => void;
  reset: () => void;
}>((set) => ({
  ...defaults(),
  init: (id, taskId = "visual_algo_compare") => set({ ...defaults(), sessionId: id, taskId }),
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p), reset: () => set(defaults()),
}));
