/** 测试 algoCompare store — 排序 + 字符串搜索 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAlgoCompareStore } from "../sortingStore";

describe("algoCompareStore", () => {
  beforeEach(() => { useAlgoCompareStore.getState().reset(); });

  it("初始化默认值（排序模式）", () => {
    useAlgoCompareStore.getState().init(1);
    const s = useAlgoCompareStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("visual_algo_compare");
    expect(s.experimentType).toBe("sorting");
    expect(s.arraySize).toBe(20);
    expect(s.numTrials).toBe(5);
    expect(s.dataPattern).toBe("random");
    expect(s.selectedSortingAlgos).toEqual([]);
    expect(s.experimentResult).toBeNull();
  });

  it("切换为字符串搜索模式", () => {
    useAlgoCompareStore.getState().init(1);
    useAlgoCompareStore.getState().set({ experimentType: "stringsearch" });
    expect(useAlgoCompareStore.getState().experimentType).toBe("stringsearch");
    expect(useAlgoCompareStore.getState().textLength).toBe(200);
    expect(useAlgoCompareStore.getState().patternLength).toBe(5);
  });

  it("set 更新排序算法选择", () => {
    useAlgoCompareStore.getState().init(1);
    useAlgoCompareStore.getState().set({ selectedSortingAlgos: ["BUBBLE", "MERGE"] });
    expect(useAlgoCompareStore.getState().selectedSortingAlgos).toEqual(["BUBBLE", "MERGE"]);
  });

  it("set 更新搜索算法选择", () => {
    useAlgoCompareStore.getState().init(1);
    useAlgoCompareStore.getState().set({ selectedSearchAlgos: ["KMP", "BOYER_MOORE"] });
    expect(useAlgoCompareStore.getState().selectedSearchAlgos).toEqual(["KMP", "BOYER_MOORE"]);
  });

  it("experimentResult 可存储", () => {
    useAlgoCompareStore.getState().init(1);
    useAlgoCompareStore.getState().set({ experimentResult: { experiment_batch_id: "x", status: "COMPLETED", total_runs: 4, summary: {}, runs: [] } });
    expect(useAlgoCompareStore.getState().experimentResult?.total_runs).toBe(4);
  });

  it("reset 清空所有数据", () => {
    useAlgoCompareStore.getState().init(99);
    useAlgoCompareStore.getState().reset();
    expect(useAlgoCompareStore.getState().sessionId).toBeNull();
    expect(useAlgoCompareStore.getState().selectedSortingAlgos).toEqual([]);
    expect(useAlgoCompareStore.getState().selectedSearchAlgos).toEqual([]);
  });
});
