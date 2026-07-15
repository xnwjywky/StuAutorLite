/** 测试 shapeRecogStore */
import { describe, it, expect, beforeEach } from "vitest";
import { useShapeRecogStore } from "../shapeRecogStore";

describe("shapeRecogStore", () => {
  beforeEach(() => { useShapeRecogStore.getState().reset(); });

  it("初始化默认值", () => {
    useShapeRecogStore.getState().init(1);
    const s = useShapeRecogStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("shape_recognition");
    expect(s.nSamples).toBe(200);
    expect(s.noiseLevels).toEqual([0.0]);
    expect(s.selectedAlgorithms).toEqual([]);
  });

  it("set 更新算法选择", () => {
    useShapeRecogStore.getState().init(1);
    useShapeRecogStore.getState().set({ selectedAlgorithms: ["TEMPLATE", "FEATURE"] });
    expect(useShapeRecogStore.getState().selectedAlgorithms).toEqual(["TEMPLATE", "FEATURE"]);
  });

  it("experimentResult 可存储和读取", () => {
    useShapeRecogStore.getState().init(1);
    useShapeRecogStore.getState().set({ experimentResult: { experiment_batch_id: "x", status: "COMPLETED", total_runs: 4, summary: {}, runs: [] } });
    expect(useShapeRecogStore.getState().experimentResult?.total_runs).toBe(4);
  });

  it("reset 清空", () => { useShapeRecogStore.getState().init(99); useShapeRecogStore.getState().reset(); expect(useShapeRecogStore.getState().sessionId).toBeNull(); });
});
