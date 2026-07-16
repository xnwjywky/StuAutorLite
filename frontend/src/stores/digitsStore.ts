/** 手写数字识别实验状态 */
import { create } from "zustand";
import type { DigitRecogAlgorithmType, ResearchStage } from "../types";

export interface DigitsWorkflowData {
  sessionId: number | null; taskId: string; currentStage: ResearchStage;
  experimentType: "handwritten_digits";
  rawQuestion: string; refinedQuestion: string; suggestedQuestions: string[];
  hypothesis: string;
  selectedAlgorithms: DigitRecogAlgorithmType[]; nSamples: number; noiseLevels: number[];
  numTrials: number; trainRatio: number; designCompleted: boolean;
  experimentResult: { experiment_batch_id: string; status: string; total_runs: number; summary: Record<string, any>; runs: any[] } | null;
  selectedTrial: number;
  studentAnalysis: string; aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reportMarkdown: string;
}

const defaults = (): DigitsWorkflowData => ({
  sessionId: null, taskId: "digit_recognition", currentStage: "TASK_SELECTED",
  experimentType: "handwritten_digits",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "",
  selectedAlgorithms: [], nSamples: 200, noiseLevels: [0.0],
  numTrials: 5, trainRatio: 0.7, designCompleted: false,
  experimentResult: null, selectedTrial: 1,
  studentAnalysis: "", aiAnalysis: null, reportMarkdown: "",
});

export const useDigitsStore = create<DigitsWorkflowData & {
  init: (id: number, taskId?: string) => void; setStage: (s: ResearchStage) => void;
  set: (p: Partial<DigitsWorkflowData>) => void; reset: () => void;
}>((set) => ({
  ...defaults(),
  init: (id, taskId = "digit_recognition") => set({ ...defaults(), sessionId: id, taskId }),
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p), reset: () => set(defaults()),
}));
