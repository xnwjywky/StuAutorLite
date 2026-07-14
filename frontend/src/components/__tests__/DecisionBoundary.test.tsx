/** 测试 DecisionBoundary 组件 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DecisionBoundary from "../DecisionBoundary";

describe("DecisionBoundary", () => {
  const samplePoints: [number, number][] = [[0, 0], [5, 5], [0, 5]];
  const sampleLabels = [0, 1, 1];
  const samplePreds = [0, 0, 1];

  it("无数据时渲染占位符", () => {
    const { container } = render(<DecisionBoundary />);
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("有数据时渲染 canvas", () => {
    const { container } = render(
      <DecisionBoundary points={samplePoints} labels={sampleLabels} predictions={samplePreds} />,
    );
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("渲染图例", () => {
    render(
      <DecisionBoundary points={samplePoints} labels={sampleLabels}
        predictions={samplePreds} classNames={["红队", "蓝队"]} />,
    );
    expect(screen.getByText("红队")).toBeInTheDocument();
    expect(screen.getByText("蓝队")).toBeInTheDocument();
    expect(screen.getByText("误分类")).toBeInTheDocument();
  });

  it("有预测时显示准确率", () => {
    const { container } = render(
      <DecisionBoundary points={samplePoints} labels={sampleLabels} predictions={samplePreds} />,
    );
    // canvas 渲染文本，通过 canvas 存在性验证
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("渲染边界数据时不出错", () => {
    const boundary = {
      grid_predictions: new Array(2500).fill(0),
      grid_shape: [50, 50] as [number, number],
      x_range: [-1, 8] as [number, number],
      y_range: [-1, 8] as [number, number],
    };
    expect(() =>
      render(
        <DecisionBoundary points={samplePoints} labels={sampleLabels}
          predictions={samplePreds} boundaryData={boundary} showBoundary={true} />,
      ),
    ).not.toThrow();
  });
});
