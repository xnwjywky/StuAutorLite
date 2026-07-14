/** 测试 guessNumberStore */
import { describe, it, expect, beforeEach } from "vitest";
import { useGuessNumberStore } from "../guessNumberStore";

describe("guessNumberStore", () => {
  beforeEach(() => { useGuessNumberStore.getState().reset(); });

  it("初始化时设置默认值", () => {
    useGuessNumberStore.getState().init(1);
    const s = useGuessNumberStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("guess_number");
    expect(s.currentStage).toBe("TASK_SELECTED");
    expect(s.selectedStrategies).toEqual([]);
    expect(s.numberLow).toBe(1);
    expect(s.numberHigh).toBe(100);
    expect(s.numTrials).toBe(5);
    expect(s.experimentResult).toBeNull();
  });

  it("set 更新策略选择", () => {
    useGuessNumberStore.getState().init(1);
    useGuessNumberStore.getState().set({ selectedStrategies: ["BINARY", "RANDOM"] });
    expect(useGuessNumberStore.getState().selectedStrategies).toEqual(["BINARY", "RANDOM"]);
  });

  it("set 更新数字范围", () => {
    useGuessNumberStore.getState().init(1);
    useGuessNumberStore.getState().set({ numberLow: 10, numberHigh: 200 });
    expect(useGuessNumberStore.getState().numberLow).toBe(10);
    expect(useGuessNumberStore.getState().numberHigh).toBe(200);
  });

  it("experimentResult 可存储", () => {
    useGuessNumberStore.getState().init(1);
    useGuessNumberStore.getState().set({
      experimentResult: {
        experiment_batch_id: "x", status: "COMPLETED", total_runs: 3,
        summary: { BINARY: { avg_guesses: 5, min_guesses: 3, max_guesses: 7, success_rate: 1, avg_runtime_ms: 0, count: 3 } },
        runs: [{ strategy: "BINARY", guesses: 5, trial: 1 }],
      },
    });
    expect(useGuessNumberStore.getState().experimentResult?.total_runs).toBe(3);
  });

  it("reset 清空", () => {
    useGuessNumberStore.getState().init(99);
    useGuessNumberStore.getState().reset();
    expect(useGuessNumberStore.getState().sessionId).toBeNull();
    expect(useGuessNumberStore.getState().selectedStrategies).toEqual([]);
  });
});
