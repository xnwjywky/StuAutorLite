/** RL gridworld experiment state */
import { create } from "zustand";
import type { ResearchStage } from "../types";
import type { ReflectionQuestion } from "../api/service";

export interface RLWorkflowData {
  sessionId: number | null;
  taskId: string;
  currentStage: ResearchStage;

  rawQuestion: string; refinedQuestion: string; suggestedQuestions: string[];
  hypothesis: string;

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

  evalCompare: {
    world: any;
    compare_paths: Record<string, [number, number][]>;
    compare_decisions: Record<string, {step: number; state: [number,number]; action: number; q_values: number[]; best_action: number}[]>;
    q_snapshots: any[];
    train_rewards: Record<string, number[]>;
    train_success: Record<string, number[]>;
    summary: Record<string, any>;
    grid_size: number;
    num_episodes: number;
  } | null;

  studentAnalysis: string;
  aiAnalysis: { summary: string; key_findings: string[]; questions_for_student: string[] } | null;
  reflectionAnswers: Record<number, string>;
  reflectionQuestions: ReflectionQuestion[];
  reportMarkdown: string;
}

const defaults = (): RLWorkflowData => ({
  sessionId: null, taskId: "rl_gridworld", currentStage: "TASK_SELECTED",
  rawQuestion: "", refinedQuestion: "", suggestedQuestions: [],
  hypothesis: "",
  selectedAgents: [],
  gridSize: 8, numTraps: 3, numEpisodes: 2000,
  learningRate: 0.1, discount: 0.9, epsilon: 0.1,
  numTrials: 3, designCompleted: false,
  experimentResult: null, selectedTrial: 1,
  evalCompare: null,
  studentAnalysis: "", aiAnalysis: null,
  reflectionAnswers: {}, reflectionQuestions: [],
  reportMarkdown: "",
});

export const useRLStore = create<RLWorkflowData & {
  init: (id: number, taskId?: string) => void;
  setStage: (s: ResearchStage) => void;
  set: (p: Partial<RLWorkflowData>) => void;
  reset: () => void;
}>((set, get) => ({
  ...defaults(),
  init: (id, taskId = "rl_gridworld") => {
    // Always clear volatile results on entry; keep research question if same session
    const prev = get();
    set({
      ...defaults(), sessionId: id, taskId,
      // Preserve research question and hypothesis across re-renders of same session
      rawQuestion: id === prev.sessionId ? prev.rawQuestion : "",
      refinedQuestion: id === prev.sessionId ? prev.refinedQuestion : "",
    });
  },
  setStage: (s) => set({ currentStage: s }),
  set: (p) => set(p), reset: () => set(defaults()),
}));
