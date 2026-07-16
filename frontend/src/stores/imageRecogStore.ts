/** 统一图像识别实验状态 — 图形识别 + 手写数字识别 */
import { create } from "zustand";
import type { ResearchStage } from "../types";

export type ImageRecogExperimentType = "shape" | "digits";

export interface ImageRecogWorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;
  experimentType: ImageRecogExperimentType;

  // 研究问题
  rawQuestion: string;
  refinedQuestion: string;
  suggestedQuestions: string[];
  hypothesis: string;

  // 算法选择 + 各算法参数
  selectedAlgos: string[];
  algoParams: Record<string, Record<string, number>>;

  // 实验参数
  nSamples: number;
  noiseLevel: number;            // 单个噪声水平
  numTrials: number;
  trainRatio: number;
  designCompleted: boolean;

  // 实验结果
  experimentResult: {
    experiment_batch_id: string; experiment_type: string;
    status: string; total_runs: number;
    summary: Record<string, any>; runs: any[];
  } | null;

  // 当前查看的 trial
  selectedTrial: number;

  // 分析 + 报告
  studentAnalysis: string;
  aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reportMarkdown: string;
}

const defaults = (): ImageRecogWorkflowData => ({
  sessionId: null, taskId: "image_recognition", currentStage: "TASK_SELECTED",
  experimentType: "shape",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "",
  selectedAlgos: [], algoParams: {},
  nSamples: 200, noiseLevel: 0.0, numTrials: 5, trainRatio: 0.7,
  designCompleted: false,
  experimentResult: null,
  selectedTrial: 1,
  studentAnalysis: "", aiAnalysis: null, reportMarkdown: "",
});

export const useImageRecogStore = create<ImageRecogWorkflowData & {
  init: (id: number, taskId?: string) => void;
  setStage: (s: ResearchStage) => void;
  set: (p: Partial<ImageRecogWorkflowData>) => void;
  reset: () => void;
  switchMode: (t: ImageRecogExperimentType) => void;
  /** 进入新阶段时清理中间状态 */
  cleanup: () => void;
}>((set, get) => ({
  ...defaults(),
  init: (id, taskId = "image_recognition") => set({ ...defaults(), sessionId: id, taskId }),
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p),
  reset: () => set(defaults()),
  switchMode: (t) => {
    set({
      experimentType: t,
      selectedAlgos: get().experimentType !== t ? [] : get().selectedAlgos,
      algoParams: {},
      designCompleted: false,
      experimentResult: null,
    });
  },
  cleanup: () => set({ experimentResult: null }),
}));

/** 获取某算法的默认参数 */
export function getDefaultAlgoParams(algoKey: string): Record<string, number> {
  const registry: Record<string, Record<string, number>> = {
    PIXEL_KNN: { k: 3 },
    FEATURE: { k: 3 },
    DECISION_TREE: { max_depth: 8 },
    MLP: { hidden: 64, epochs: 30 },
    CNN: { filters: 4, epochs: 20 },
  };
  return registry[algoKey] || {};
}
