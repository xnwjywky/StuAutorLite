/** 测试 rlStore — 强化学习格子世界 */
import { describe, it, expect, beforeEach } from "vitest";
import { useRLStore } from "../rlStore";

describe("rlStore", () => {
  beforeEach(() => { useRLStore.getState().reset(); });

  it("初始化默认值", () => {
    useRLStore.getState().init(1);
    const s = useRLStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("rl_gridworld");
    expect(s.currentStage).toBe("TASK_SELECTED");
    expect(s.selectedAgents).toEqual(["Q_LEARNING", "SARSA"]);
    expect(s.gridSize).toBe(8);
    expect(s.numTraps).toBe(3);
    expect(s.numEpisodes).toBe(500);
    expect(s.learningRate).toBe(0.1);
    expect(s.discount).toBe(0.9);
    expect(s.epsilon).toBe(0.1);
    expect(s.numTrials).toBe(3);
    expect(s.designCompleted).toBe(false);
    expect(s.experimentResult).toBeNull();
  });

  it("set 更新参数", () => {
    useRLStore.getState().init(1);
    useRLStore.getState().set({ gridSize: 10, numTraps: 5, epsilon: 0.3 });
    const s = useRLStore.getState();
    expect(s.gridSize).toBe(10);
    expect(s.numTraps).toBe(5);
    expect(s.epsilon).toBe(0.3);
  });

  it("setStage 切换阶段", () => {
    useRLStore.getState().init(1);
    useRLStore.getState().setStage("EXPERIMENT_DESIGNED");
    expect(useRLStore.getState().currentStage).toBe("EXPERIMENT_DESIGNED");
    useRLStore.getState().setStage("EXPERIMENT_RUNNING");
    expect(useRLStore.getState().currentStage).toBe("EXPERIMENT_RUNNING");
  });

  it("experimentResult 可存储和读取", () => {
    useRLStore.getState().init(1);
    const mockResult = { experiment_batch_id: "abc", status: "COMPLETED", total_runs: 2, summary: {}, runs: [] };
    useRLStore.getState().set({ experimentResult: mockResult });
    expect(useRLStore.getState().experimentResult?.total_runs).toBe(2);
  });

  it("reset 清空所有数据", () => {
    useRLStore.getState().init(99);
    useRLStore.getState().set({ selectedAgents: ["Q_LEARNING"], gridSize: 12 });
    useRLStore.getState().reset();
    expect(useRLStore.getState().sessionId).toBeNull();
    expect(useRLStore.getState().selectedAgents).toEqual(["Q_LEARNING", "SARSA"]);
    expect(useRLStore.getState().gridSize).toBe(8);
  });

  it("多 agent 切换", () => {
    useRLStore.getState().init(1);
    useRLStore.getState().set({ selectedAgents: ["Q_LEARNING"] });
    expect(useRLStore.getState().selectedAgents).toEqual(["Q_LEARNING"]);
    useRLStore.getState().set({ selectedAgents: ["SARSA"] });
    expect(useRLStore.getState().selectedAgents).toEqual(["SARSA"]);
    useRLStore.getState().set({ selectedAgents: [] });
    expect(useRLStore.getState().selectedAgents).toEqual([]);
  });
});
