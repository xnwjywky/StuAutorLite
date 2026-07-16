// ========== 研究会话 ==========
export interface ResearchSession {
  id?: number;
  session_id: string;
  student_id: string;
  task_id: string;
  title: string;
  status: "IN_PROGRESS" | "COMPLETED";
  current_stage: ResearchStage;
  created_at: string;
  updated_at: string;
}

export type ResearchStage =
  | "TASK_SELECTED"
  | "QUESTION_DEFINED"
  | "HYPOTHESIS_WRITTEN"
  | "EXPERIMENT_DESIGNED"
  | "EXPERIMENT_RUNNING"
  | "RESULT_ANALYZED"
  | "REFLECTION_COMPLETED"
  | "REPORT_GENERATED"
  | "REVIEW_COMPLETED";

// ========== 研究问题 ==========
export interface ResearchQuestion {
  question_id: string;
  session_id: string;
  raw_question: string;
  refined_question: string;
  variables: {
    independent_variable: string;
    dependent_variables: string[];
    controlled_variables: string[];
  };
  created_at: string;
}

// ========== 实验假设 ==========
export interface Hypothesis {
  hypothesis_id: string;
  session_id: string;
  student_text: string;
  ai_feedback: string;
  created_at: string;
}

// ========== 实验设计 ==========
export interface ExperimentDesign {
  design_id: string;
  session_id: string;
  algorithms: AlgorithmType[];
  independent_variable: string;
  variable_values: number[];
  controlled_settings: {
    maze_size: [number, number];
    num_trials: number;
    same_seed_for_algorithms: boolean;
  };
  metrics: MetricType[];
  ai_review: {
    score: number;
    comment: string;
  };
}

export type AlgorithmType = "BFS" | "DFS" | "A*" | "ASTAR" | "RANDOM" | "DIJKSTRA" | "GREEDY" | "BIDIRECTIONAL" | "IDDFS";
export type MetricType =
  | "success_rate"
  | "path_length"
  | "expanded_nodes"
  | "runtime";

// ========== 实验运行 ==========
export interface ExperimentRun {
  run_id: string;
  session_id: string;
  design_id: string;
  algorithm: AlgorithmType;
  parameters: ExperimentParams;
  result: ExperimentResult;
  visualization: VisualizationData;
  created_at: string;
}

export interface ExperimentParams {
  maze_size: [number, number];
  obstacle_ratio: number;
  heuristic?: "manhattan" | "euclidean";
  seed: number;
}

export interface ExperimentResult {
  success: boolean;
  path_length: number;
  expanded_nodes: number;
  runtime_ms: number;
  optimal: boolean;
}

export interface VisualizationData {
  maze_grid: number[][];
  path: [number, number][];
  visited_nodes: [number, number][];
}

// ========== 实验汇总 ==========
export interface ExperimentSummary {
  experiment_batch_id: string;
  status: "COMPLETED" | "RUNNING" | "FAILED";
  summary: Record<AlgorithmType, AlgorithmStats>;
}

export interface AlgorithmStats {
  success_rate: number;
  avg_path_length: number;
  avg_expanded_nodes: number;
  avg_runtime_ms: number;
}

// ========== 分析记录 ==========
export interface AnalysisRecord {
  analysis_id: string;
  session_id: string;
  student_analysis: string;
  ai_feedback: string;
  key_findings: string[];
  created_at: string;
}

// ========== 研究报告 ==========
export interface ResearchReport {
  report_id: string;
  session_id: string;
  title: string;
  content_markdown: string;
  version: number;
  review_score: ReviewScores;
  created_at: string;
}

export interface ReviewScores {
  [key: string]: number;
  question_clarity: number;
  experiment_design: number;
  data_completeness: number;
  analysis_depth: number;
  reflection_quality: number;
  writing_clarity: number;
}

// ========== 学生画像 ==========
export interface StudentProfile {
  student_id: string;
  nickname: string;
  grade_level: "elementary" | "middle" | "high";
  difficulty_level: "beginner" | "intermediate" | "advanced";
  created_at: string;
  updated_at: string;
}

// ========== API 通用响应 ==========
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

// ========== 图像分类实验 (§16.2) ==========
export type ClassifierType = "KNN" | "DECISION_TREE" | "RANDOM";
export type ClassifyMetricType = "accuracy" | "precision" | "recall" | "f1";
export type DataPattern = "blobs" | "circles" | "moons";

export interface ClassificationResult {
  experiment_batch_id: string;
  status: "COMPLETED" | "FAILED";
  total_runs: number;
  summary: Record<string, ClassifierStats>;
  runs: ClassificationRun[];
}

export interface ClassifierStats {
  avg_accuracy: number;
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  avg_runtime_ms: number;
  count: number;
}

export interface ClassificationRun {
  classifier: string;
  n_samples: number;
  noise_level: number;
  pattern: string;
  trial: number;
  seed: number;
  accuracy: number;
  precision: number[];
  recall: number[];
  f1: number[];
  runtime_ms: number;
  points: [number, number][];
  labels: number[];
  predictions: number[];
  boundary_data: {
    grid_predictions: number[];
    grid_shape: [number, number];
    x_range: [number, number];
    y_range: [number, number];
  };
}

// ========== 猜数字策略 (§16.2) ==========
export type GuessStrategyType = "BINARY" | "RANDOM" | "LINEAR";

export interface GuessResult {
  experiment_batch_id: string;
  status: string;
  total_runs: number;
  summary: Record<string, { avg_guesses: number; min_guesses: number; max_guesses: number; success_rate: number; avg_runtime_ms: number; count: number }>;
  runs: GuessRun[];
}

export interface GuessRun {
  strategy: string;
  target: number;
  trial: number;
  guesses: number;
  history: number[];
  success: boolean;
  runtime_ms: number;
}

// ========== 排序算法可视化实验 ==========
export type SortingAlgorithmType = "BUBBLE" | "SELECTION" | "MERGE" | "QUICK";

export interface SortingStep { type: "compare" | "swap" | "merge"; i: number; j: number; min?: number; pivot?: number; left?: number; right?: number; arr: number[]; }

export interface SortingRun {
  algorithm: string; array_size: number; pattern: string; trial: number; seed: number;
  swaps: number; comparisons: number; runtime_ms: number;
  original: number[]; result: number[]; steps: SortingStep[];
}

export interface SortingResult {
  experiment_batch_id: string; status: string; total_runs: number;
  summary: Record<string, { avg_swaps: number; avg_comparisons: number; avg_runtime_ms: number; count: number }>;
  runs: SortingRun[];
}

// ========== 字符串搜索实验 ==========
export type StringSearchAlgorithmType = "NAIVE" | "KMP" | "BOYER_MOORE" | "RABIN_KARP";
export interface StringSearchStep { type: string; i: number; j?: number; q?: number; pi?: number; match?: boolean; text: string; pattern: string; }
export interface StringSearchRun {
  algorithm: string; text_length: number; pattern_length: number; pattern_type: string; trial: number;
  matches: number; comparisons: number; runtime_ms: number;
  text: string; pattern: string; match_positions: number[]; steps: StringSearchStep[];
}
export interface StringSearchResult {
  experiment_batch_id: string; status: string; total_runs: number;
  summary: Record<string, { avg_comparisons: number; avg_matches: number; avg_runtime_ms: number; count: number }>;
  runs: StringSearchRun[];
}

// ========== 图形识别实验 ==========
export type ShapeRecogAlgorithmType = "TEMPLATE" | "PIXEL_KNN" | "FEATURE" | "DECISION_TREE" | "MLP" | "CNN" | "RANDOM";

export interface ShapeRecogRun {
  algorithm: string; n_samples: number; noise_level: number; trial: number;
  accuracy: number; correct: number; total: number; runtime_ms: number;
  test_grids: number[][][]; test_labels: string[]; predictions: string[];
}

export interface ShapeRecogResult {
  experiment_batch_id: string; status: string; total_runs: number;
  summary: Record<string, { avg_accuracy: number; min_accuracy: number; max_accuracy: number; avg_runtime_ms: number; count: number }>;
  runs: ShapeRecogRun[];
}

// ========== 手写数字识别实验 ==========
export type DigitRecogAlgorithmType = "TEMPLATE" | "PIXEL_KNN" | "FEATURE" | "DECISION_TREE" | "MLP" | "CNN" | "RANDOM";

export interface DigitRecogRun {
  algorithm: string; n_samples: number; noise_level: number; trial: number;
  accuracy: number; correct: number; total: number; runtime_ms: number;
  test_grids: number[][][]; test_labels: number[]; predictions: number[];
}

export interface DigitRecogResult {
  experiment_batch_id: string; status: string; total_runs: number;
  summary: Record<string, { avg_accuracy: number; min_accuracy: number; max_accuracy: number; avg_runtime_ms: number; count: number }>;
  runs: DigitRecogRun[];
}

// ========== 统一图像识别实验（合并图形+数字） ==========
export type ImageRecogExperimentType = "shape" | "digits";

export interface ImageRecogVisualizerStep {
  testIndex: number; grid: number[][];
  trueLabel: string | number; predictedLabel: string | number; correct: boolean;
}

export interface ImageRecogRun {
  algorithm: string; experiment_type: string; n_samples: number;
  noise_level: number; trial: number; accuracy: number; correct: number; total: number;
  runtime_ms: number; train_ratio: number;
  params_used: Record<string, number>;
  test_grids: number[][][]; test_labels: (string | number)[]; predictions: (string | number)[];
  viz_steps: ImageRecogVisualizerStep[];
}

export interface ImageRecogResult {
  experiment_batch_id: string; experiment_type: string;
  status: string; total_runs: number;
  summary: Record<string, { avg_accuracy: number; min_accuracy: number; max_accuracy: number; avg_runtime_ms: number; count: number }>;
  runs: ImageRecogRun[];
}
