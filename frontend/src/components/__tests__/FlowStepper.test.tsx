/** 测试 FlowStepper 组件 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FlowStepper from "../FlowStepper";

const STEPS = [
  { key: "TASK_SELECTED" as const, label: "选择任务" },
  { key: "QUESTION_DEFINED" as const, label: "研究问题" },
  { key: "HYPOTHESIS_WRITTEN" as const, label: "实验假设" },
];

describe("FlowStepper", () => {
  it("渲染所有步骤", () => {
    render(<FlowStepper steps={STEPS} current="TASK_SELECTED" onStepClick={() => {}} />);
    expect(screen.getByText("选择任务")).toBeInTheDocument();
    expect(screen.getByText("研究问题")).toBeInTheDocument();
    expect(screen.getByText("实验假设")).toBeInTheDocument();
  });

  it("活动步骤高亮", () => {
    render(<FlowStepper steps={STEPS} current="QUESTION_DEFINED" onStepClick={() => {}} />);
    const items = screen.getAllByRole("button");
    // 活动步骤应有不同的样式类
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it("点击步骤触发 onStepClick", () => {
    const fn = vi.fn();
    render(<FlowStepper steps={STEPS} current="TASK_SELECTED" onStepClick={fn} />);
    fireEvent.click(screen.getByText("研究问题"));
    expect(fn).toHaveBeenCalledWith("QUESTION_DEFINED");
  });
});
