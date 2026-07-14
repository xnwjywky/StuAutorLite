/** 测试 workflowStore — 迷宫寻路 9 阶段状态管理 */
import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../workflowStore";

describe("workflowStore", () => {
  beforeEach(() => {
    useWorkflowStore.getState().reset();
  });

  it("初始化时所有字段为默认值", () => {
    useWorkflowStore.getState().init(42);
    const s = useWorkflowStore.getState();
    expect(s.sessionId).toBe(42);
    expect(s.taskId).toBe("maze_pathfinding");
    expect(s.currentStage).toBe("TASK_SELECTED");
    expect(s.selectedAlgorithms).toEqual([]);
    expect(s.mazeSize).toEqual([12, 12]);
    expect(s.obstacleRatios).toEqual([0.2]);
    expect(s.numTrials).toBe(5);
    expect(s.designCompleted).toBe(false);
    expect(s.experimentResult).toBeNull();
    expect(s.hypothesis).toBe("");
    expect(s.rawQuestion).toBe("");
  });

  it("setStage 更新当前阶段", () => {
    useWorkflowStore.getState().init(1);
    useWorkflowStore.getState().setStage("QUESTION_DEFINED");
    expect(useWorkflowStore.getState().currentStage).toBe("QUESTION_DEFINED");
  });

  it("set 部分合并字段", () => {
    useWorkflowStore.getState().init(1);
    useWorkflowStore.getState().set({ rawQuestion: "你好", hypothesis: "测试", mazeSize: [8, 8] });
    const s = useWorkflowStore.getState();
    expect(s.rawQuestion).toBe("你好");
    expect(s.hypothesis).toBe("测试");
    expect(s.mazeSize).toEqual([8, 8]);
    // 不受影响的字段保持默认值
    expect(s.numTrials).toBe(5);
  });

  it("reset 恢复所有默认值", () => {
    useWorkflowStore.getState().init(99);
    useWorkflowStore.getState().set({ rawQuestion: "xxx", designCompleted: true });
    useWorkflowStore.getState().reset();
    const s = useWorkflowStore.getState();
    expect(s.sessionId).toBeNull();
    expect(s.designCompleted).toBe(false);
    expect(s.rawQuestion).toBe("");
  });

  it("init 使用自定义 taskId", () => {
    useWorkflowStore.getState().init(1, "custom_task");
    expect(useWorkflowStore.getState().taskId).toBe("custom_task");
  });

  it("experimentResult 可设置和访问", () => {
    useWorkflowStore.getState().init(1);
    const mock = {
      experiment_batch_id: "abc",
      status: "COMPLETED",
      total_runs: 4,
      summary: { BFS: { success_rate: 1.0, avg_path_length: 24, avg_expanded_nodes: 50, avg_runtime_ms: 10 } },
      runs: [{ algorithm: "BFS", success: true, path_length: 24, expanded_nodes: 50, runtime_ms: 10, trial: 1 }],
    };
    useWorkflowStore.getState().set({ experimentResult: mock });
    expect(useWorkflowStore.getState().experimentResult?.total_runs).toBe(4);
  });
});
