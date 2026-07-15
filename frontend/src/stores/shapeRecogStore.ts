/** 图形识别实验状态 */
import { create } from "zustand";
import type { ShapeRecogAlgorithmType, ResearchStage } from "../types";

export interface ShapeRecogWorkflowData {
  sessionId: number | null; taskId: string; currentStage: ResearchStage;
  experimentType: "pixel_shapes";  // 扩展预留
  rawQuestion: string; refinedQuestion: string; suggestedQuestions: string[];
  hypothesis: string;
  selectedAlgorithms: ShapeRecogAlgorithmType[]; nSamples: number; noiseLevels: number[];
  numTrials: number; trainRatio: number; designCompleted: boolean;
  experimentResult: { experiment_batch_id: string; status: string; total_runs: number; summary: Record<string, any>; runs: any[] } | null;
  selectedTrial: number;
  studentAnalysis: string; aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reportMarkdown: string;
}

const defaults = (): ShapeRecogWorkflowData => ({
  sessionId: null, taskId: "shape_recognition", currentStage: "TASK_SELECTED",
  experimentType: "pixel_shapes",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "",
  selectedAlgorithms: [], nSamples: 200, noiseLevels: [0.0],
  numTrials: 5, trainRatio: 0.7, designCompleted: false,
  experimentResult: null, selectedTrial: 1,
  studentAnalysis: "", aiAnalysis: null, reportMarkdown: "",
});

export const useShapeRecogStore = create<ShapeRecogWorkflowData & {
  init: (id: number, taskId?: string) => void; setStage: (s: ResearchStage) => void;
  set: (p: Partial<ShapeRecogWorkflowData>) => void; reset: () => void;
}>((set) => ({
  ...defaults(),
  init: (id, taskId = "shape_recognition") => set({ ...defaults(), sessionId: id, taskId }),
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p), reset: () => set(defaults()),
}));
