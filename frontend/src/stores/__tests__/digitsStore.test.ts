/** 测试 digitsStore */
import { describe, it, expect, beforeEach } from "vitest";
import { useDigitsStore } from "../digitsStore";

describe("digitsStore", () => {
  beforeEach(() => { useDigitsStore.getState().reset(); });

  it("初始化默认值", () => {
    useDigitsStore.getState().init(1);
    const s = useDigitsStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("digit_recognition");
    expect(s.nSamples).toBe(200);
    expect(s.noiseLevels).toEqual([0.0]);
    expect(s.selectedAlgorithms).toEqual([]);
  });

  it("set 更新算法选择", () => {
    useDigitsStore.getState().init(1);
    useDigitsStore.getState().set({ selectedAlgorithms: ["PIXEL_KNN", "CNN"] });
    expect(useDigitsStore.getState().selectedAlgorithms).toEqual(["PIXEL_KNN", "CNN"]);
  });

  it("experimentResult 可存储和读取", () => {
    useDigitsStore.getState().init(1);
    useDigitsStore.getState().set({ experimentResult: { experiment_batch_id: "x", status: "COMPLETED", total_runs: 4, summary: {}, runs: [] } });
    expect(useDigitsStore.getState().experimentResult?.total_runs).toBe(4);
  });

  it("reset 清空", () => { useDigitsStore.getState().init(99); useDigitsStore.getState().reset(); expect(useDigitsStore.getState().sessionId).toBeNull(); });
});
