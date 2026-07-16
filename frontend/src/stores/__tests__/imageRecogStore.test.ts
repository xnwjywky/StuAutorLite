/** 测试 imageRecogStore */
import { describe, it, expect, beforeEach } from "vitest";
import { useImageRecogStore, getDefaultAlgoParams } from "../imageRecogStore";

describe("imageRecogStore", () => {
  beforeEach(() => { useImageRecogStore.getState().reset(); });

  it("初始化默认值 — 图形模式", () => {
    useImageRecogStore.getState().init(1);
    const s = useImageRecogStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("image_recognition");
    expect(s.experimentType).toBe("shape");
    expect(s.nSamples).toBe(200);
    expect(s.noiseLevel).toBe(0.0);
    expect(s.selectedAlgos).toEqual([]);
    expect(s.algoParams).toEqual({});
    expect(s.experimentResult).toBeNull();
  });

  it("init 使用自定义 taskId", () => {
    useImageRecogStore.getState().init(5, "custom_task");
    expect(useImageRecogStore.getState().taskId).toBe("custom_task");
  });

  it("set 更新算法选择和参数", () => {
    useImageRecogStore.getState().init(1);
    useImageRecogStore.getState().set({ selectedAlgos: ["MLP", "CNN"], algoParams: { MLP: { hidden: 64, epochs: 30 } } });
    const s = useImageRecogStore.getState();
    expect(s.selectedAlgos).toEqual(["MLP", "CNN"]);
    expect(s.algoParams["MLP"].hidden).toBe(64);
  });

  it("set 更新噪声水平", () => {
    useImageRecogStore.getState().init(1);
    useImageRecogStore.getState().set({ noiseLevel: 0.1 });
    expect(useImageRecogStore.getState().noiseLevel).toBe(0.1);
  });

  it("switchMode 切换到数字模式并清空算法和结果", () => {
    useImageRecogStore.getState().init(1);
    useImageRecogStore.getState().set({ selectedAlgos: ["TEMPLATE", "MLP"], experimentResult: { experiment_batch_id: "x", experiment_type: "shape", status: "OK", total_runs: 1, summary: {}, runs: [] } as any });
    useImageRecogStore.getState().switchMode("digits");
    const s = useImageRecogStore.getState();
    expect(s.experimentType).toBe("digits");
    expect(s.selectedAlgos).toEqual([]);
    expect(s.experimentResult).toBeNull();
  });

  it("experimentResult 可存取", () => {
    useImageRecogStore.getState().init(1);
    useImageRecogStore.getState().set({ experimentResult: { experiment_batch_id: "abc", experiment_type: "shape", status: "COMPLETED", total_runs: 3, summary: {}, runs: [] } });
    expect(useImageRecogStore.getState().experimentResult?.total_runs).toBe(3);
  });

  it("cleanup 清空实验结果", () => {
    useImageRecogStore.getState().init(1);
    useImageRecogStore.getState().set({ experimentResult: {} as any });
    useImageRecogStore.getState().cleanup();
    expect(useImageRecogStore.getState().experimentResult).toBeNull();
  });

  it("reset 清空所有数据", () => {
    useImageRecogStore.getState().init(99);
    useImageRecogStore.getState().reset();
    expect(useImageRecogStore.getState().sessionId).toBeNull();
  });
});

describe("getDefaultAlgoParams", () => {
  it("返回 KNN 的默认参数", () => { expect(getDefaultAlgoParams("PIXEL_KNN")).toEqual({ k: 3 }); });
  it("返回 MLP 的默认参数", () => { const p = getDefaultAlgoParams("MLP"); expect(p.hidden).toBe(64); expect(p.epochs).toBe(30); });
  it("返回 CNN 的默认参数", () => { const p = getDefaultAlgoParams("CNN"); expect(p.filters).toBe(4); expect(p.epochs).toBe(20); });
  it("未知算法返回空对象", () => { expect(getDefaultAlgoParams("UNKNOWN")).toEqual({}); });
});
