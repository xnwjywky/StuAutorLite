/** 测试 mnistStore */
import { describe, it, expect, beforeEach } from "vitest";
import { useMNISTStore, computeConfigFingerprint } from "../mnistStore";

describe("mnistStore", () => {
  beforeEach(() => { useMNISTStore.getState().reset(); });

  it("初始化默认值", () => {
    useMNISTStore.getState().init(1);
    const s = useMNISTStore.getState();
    expect(s.sessionId).toBe(1);
    expect(s.taskId).toBe("mnist_cnn");
    expect(s.selectedArchitecture).toBe("standardcnn");
    expect(s.hyperparameters.learningRate).toBe(0.01);
    expect(s.hyperparameters.epochs).toBe(10);
    expect(s.currentStage).toBe("TASK_SELECTED");
    expect(s.trainingCurve).toEqual([]);
    expect(s.experimentResult).toBeNull();
    expect(s.maxTestSamples).toBe(5000);
  });

  it("init 使用自定义 taskId", () => {
    useMNISTStore.getState().init(5, "custom");
    expect(useMNISTStore.getState().taskId).toBe("custom");
  });

  it("set 更新架构选择", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().set({ selectedArchitecture: "minicnn" });
    expect(useMNISTStore.getState().selectedArchitecture).toBe("minicnn");
  });

  it("set 更新超参数", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().set({ hyperparameters: { learningRate: 0.1, batchSize: 128, epochs: 20, optimizer: "Adam", momentum: 0, dropout: 0.5 } });
    const hp = useMNISTStore.getState().hyperparameters;
    expect(hp.learningRate).toBe(0.1);
    expect(hp.optimizer).toBe("Adam");
    expect(hp.dropout).toBe(0.5);
  });

  it("experimentResult 可存取", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().set({
      experimentResult: {
        experiment_batch_id: "abc", status: "COMPLETED",
        summary: { final_train_accuracy: 0.99, final_test_accuracy: 0.98, best_epoch: 5, best_val_accuracy: 0.985, training_time: 30, overfitting_score: 0.01 },
        runs: [],
      },
    });
    expect(useMNISTStore.getState().experimentResult?.summary.final_test_accuracy).toBe(0.98);
  });

  it("trainingCurve 可更新", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().set({
      trainingCurve: [{ epoch: 1, train_loss: 0.5, val_loss: 0.6, train_acc: 0.8, val_acc: 0.75 }],
      currentEpoch: 1,
      totalEpochs: 10,
      isTraining: true,
    });
    expect(useMNISTStore.getState().trainingCurve.length).toBe(1);
    expect(useMNISTStore.getState().isTraining).toBe(true);
  });

  it("reflectionAnswers 可读写", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().set({ reflectionAnswers: { 1: "回答1", 3: "回答3" } });
    expect(useMNISTStore.getState().reflectionAnswers[1]).toBe("回答1");
    expect(useMNISTStore.getState().reflectionAnswers[3]).toBe("回答3");
  });

  it("reset 清空所有数据", () => {
    useMNISTStore.getState().init(99);
    useMNISTStore.getState().reset();
    expect(useMNISTStore.getState().sessionId).toBeNull();
    expect(useMNISTStore.getState().selectedArchitecture).toBe("standardcnn");
  });

  // ── 幂等性测试（防止点击按钮后状态被重置） ──

  it("init 同一 sessionId 不重置已修改的 stage", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().setStage("EXPERIMENT_DESIGNED");
    useMNISTStore.getState().set({ refinedQuestion: "CNN 能识别数字吗？" });
    // 再次 init 同一 sessionId → 不应重置
    useMNISTStore.getState().init(1);
    expect(useMNISTStore.getState().currentStage).toBe("EXPERIMENT_DESIGNED");
    expect(useMNISTStore.getState().refinedQuestion).toBe("CNN 能识别数字吗？");
    expect(useMNISTStore.getState().sessionId).toBe(1);
  });

  it("init 同一 sessionId 不重置已选择的架构", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().set({ selectedArchitecture: "minicnn", hyperparameters: { learningRate: 0.001, batchSize: 32, epochs: 5, optimizer: "Adam", momentum: 0, dropout: 0 } });
    useMNISTStore.getState().init(1);
    expect(useMNISTStore.getState().selectedArchitecture).toBe("minicnn");
    expect(useMNISTStore.getState().hyperparameters.optimizer).toBe("Adam");
  });

  it("init 不同 sessionId 应完全重置", () => {
    useMNISTStore.getState().init(1);
    useMNISTStore.getState().setStage("EXPERIMENT_RUNNING");
    useMNISTStore.getState().set({ refinedQuestion: "test", selectedArchitecture: "minicnn" });
    // 切换到新 session → 应重置
    useMNISTStore.getState().init(2);
    expect(useMNISTStore.getState().currentStage).toBe("TASK_SELECTED");
    expect(useMNISTStore.getState().selectedArchitecture).toBe("standardcnn");
    expect(useMNISTStore.getState().sessionId).toBe(2);
  });

  // ── 配置指纹 ──
  it("init 时 resultFingerprint 为空", () => {
    useMNISTStore.getState().init(1);
    expect(useMNISTStore.getState().resultFingerprint).toBe("");
  });

  it("computeConfigFingerprint 同配置生成相同指纹", () => {
    const f1 = computeConfigFingerprint("standardcnn", { learningRate: 0.01, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 });
    const f2 = computeConfigFingerprint("standardcnn", { learningRate: 0.01, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 });
    expect(f1).toBe(f2);
  });

  it("computeConfigFingerprint 不同架构生成不同指纹", () => {
    const f1 = computeConfigFingerprint("standardcnn", { learningRate: 0.01, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 });
    const f2 = computeConfigFingerprint("minicnn", { learningRate: 0.01, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 });
    expect(f1).not.toBe(f2);
  });

  it("computeConfigFingerprint 不同超参生成不同指纹", () => {
    const f1 = computeConfigFingerprint("standardcnn", { learningRate: 0.01, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 });
    const f2 = computeConfigFingerprint("standardcnn", { learningRate: 0.1, batchSize: 64, epochs: 10, optimizer: "SGD", momentum: 0.9, dropout: 0.25 });
    expect(f1).not.toBe(f2);
  });
});
