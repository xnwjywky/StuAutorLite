/** MNIST 手写数字识别实验状态 */
import { create } from "zustand";
import type { ResearchStage } from "../types";

export interface MNISTWorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;

  // 研究问题
  rawQuestion: string;
  refinedQuestion: string;
  suggestedQuestions: string[];
  hypothesis: string;

  // 网络架构 + 超参数
  selectedArchitecture: string;
  hyperparameters: {
    learningRate: number;
    batchSize: number;
    epochs: number;
    optimizer: string;
    momentum: number;
    dropout: number;
  };
  maxTestSamples: number;  // 测试样本数量上限

  // 训练进度
  trainingCurve: { epoch: number; train_loss: number; val_loss: number; train_acc: number; val_acc: number }[];
  currentEpoch: number;
  totalEpochs: number;
  isTraining: boolean;

  // 实验结果
  experimentResult: {
    experiment_batch_id: string;
    status: string;
    summary: {
      final_train_accuracy: number; final_test_accuracy: number;
      best_epoch: number; best_val_accuracy: number;
      training_time: number; overfitting_score: number;
    };
    runs: any[];
  } | null;

  /** 产生当前结果时的配置指纹。进入 Stage3 时对比，相同则复用缓存。 */
  resultFingerprint: string;

  // 分析 + 报告
  studentAnalysis: string;
  reflectionAnswers: Record<number, string>;
  aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reportMarkdown: string;
}

const DEFAULT_HP = { learningRate: 0.01, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 };

const defaults = (): MNISTWorkflowData => ({
  sessionId: null, taskId: "mnist_cnn", currentStage: "TASK_SELECTED",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "",
  selectedArchitecture: "standardcnn", hyperparameters: { ...DEFAULT_HP },
  maxTestSamples: 5000,
  trainingCurve: [], currentEpoch: 0, totalEpochs: 0, isTraining: false,
  experimentResult: null, resultFingerprint: "",
  studentAnalysis: "", reflectionAnswers: {},
  aiAnalysis: null, reportMarkdown: "",
});

export const useMNISTStore = create<MNISTWorkflowData & {
  init: (id: number, taskId?: string) => void;
  setStage: (s: ResearchStage) => void;
  set: (p: Partial<MNISTWorkflowData>) => void;
  reset: () => void;
}>((set, get) => ({
  ...defaults(),
  init: (id, taskId = "mnist_cnn") => {
    // 只在 sessionId 变化或首次初始化时重置状态，避免重复 init 覆盖已有进度
    if (get().sessionId === id) return;
    set({ ...defaults(), sessionId: id, taskId });
  },
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p),
  reset: () => set(defaults()),
}));

/** 计算当前架构+超参数的配置指纹 */
export function computeConfigFingerprint(arch: string, hp: MNISTWorkflowData["hyperparameters"]): string {
  return `${arch}|${JSON.stringify(hp)}`;
}
