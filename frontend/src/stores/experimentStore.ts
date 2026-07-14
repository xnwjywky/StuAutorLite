import { create } from "zustand";
import type {
  ExperimentDesign,
  ExperimentSummary,
  AlgorithmType,
  MetricType,
} from "../types";

interface ExperimentState {
  design: ExperimentDesign | null;
  summary: ExperimentSummary | null;
  isRunning: boolean;

  // Actions
  setDesign: (design: ExperimentDesign) => void;
  setSummary: (summary: ExperimentSummary) => void;
  setRunning: (running: boolean) => void;
  toggleAlgorithm: (algo: AlgorithmType) => void;
  toggleMetric: (metric: MetricType) => void;
  resetExperiment: () => void;
}

export const useExperimentStore = create<ExperimentState>((set) => ({
  design: null,
  summary: null,
  isRunning: false,

  setDesign: (design) => set({ design }),
  setSummary: (summary) => set({ summary }),
  setRunning: (isRunning) => set({ isRunning }),

  toggleAlgorithm: (algo) =>
    set((state) => {
      if (!state.design) return state;
      const algorithms = state.design.algorithms.includes(algo)
        ? state.design.algorithms.filter((a) => a !== algo)
        : [...state.design.algorithms, algo];
      return { design: { ...state.design, algorithms } };
    }),

  toggleMetric: (metric) =>
    set((state) => {
      if (!state.design) return state;
      const metrics = state.design.metrics.includes(metric)
        ? state.design.metrics.filter((m) => m !== metric)
        : [...state.design.metrics, metric];
      return { design: { ...state.design, metrics } };
    }),

  resetExperiment: () => set({ design: null, summary: null, isRunning: false }),
}));
