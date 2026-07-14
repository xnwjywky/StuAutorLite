/** 测试 classificationStore — 图像分类工作流状态管理 */
import { describe, it, expect, beforeEach } from "vitest";
import { useClassificationStore } from "../classificationStore";

describe("classificationStore", () => {
  beforeEach(() => {
    useClassificationStore.getState().reset();
  });

  it("初始化时包含分类器默认值", () => {
    useClassificationStore.getState().init(1);
    const s = useClassificationStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("simple_classification");
    expect(s.currentStage).toBe("TASK_SELECTED");
    expect(s.selectedClassifiers).toEqual([]);
    expect(s.nSamples).toBe(200);
    expect(s.noiseLevels).toEqual([0.0]);
    expect(s.patterns).toEqual(["blobs"]);
    expect(s.numTrials).toBe(5);
    expect(s.trainRatio).toBe(0.7);
    expect(s.kValue).toBe(3);
    expect(s.maxDepth).toBe(4);
    expect(s.selectedMetrics).toEqual(["accuracy", "f1"]);
    expect(s.designCompleted).toBe(false);
  });

  it("set 更新分类器选择", () => {
    useClassificationStore.getState().init(1);
    useClassificationStore.getState().set({ selectedClassifiers: ["KNN", "DECISION_TREE"] });
    expect(useClassificationStore.getState().selectedClassifiers).toEqual(["KNN", "DECISION_TREE"]);
  });

  it("set 更新超参数", () => {
    useClassificationStore.getState().init(1);
    useClassificationStore.getState().set({ kValue: 7, maxDepth: 5, nSamples: 400 });
    const s = useClassificationStore.getState();
    expect(s.kValue).toBe(7);
    expect(s.maxDepth).toBe(5);
    expect(s.nSamples).toBe(400);
  });

  it("init 后 reset 清空所有数据", () => {
    useClassificationStore.getState().init(99);
    useClassificationStore.getState().set({ hypothesis: "测试假设" });
    useClassificationStore.getState().reset();
    expect(useClassificationStore.getState().sessionId).toBeNull();
    expect(useClassificationStore.getState().hypothesis).toBe("");
  });

  it("stage 流转正确", () => {
    useClassificationStore.getState().init(1);
    useClassificationStore.getState().setStage("QUESTION_DEFINED");
    expect(useClassificationStore.getState().currentStage).toBe("QUESTION_DEFINED");
    useClassificationStore.getState().setStage("HYPOTHESIS_WRITTEN");
    expect(useClassificationStore.getState().currentStage).toBe("HYPOTHESIS_WRITTEN");
  });
});
