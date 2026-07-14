/** 测试 AlgorithmCard 组件 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AlgorithmCard, { ALGO_INFO } from "../AlgorithmCard";

describe("AlgorithmCard", () => {
  it("渲染名称和描述", () => {
    render(<AlgorithmCard name="BFS" description="广度优先搜索" />);
    expect(screen.getByText("BFS")).toBeInTheDocument();
    expect(screen.getByText("广度优先搜索")).toBeInTheDocument();
  });

  it("未选中时显示提示", () => {
    render(<AlgorithmCard name="DFS" description="深度优先搜索" selected={false} />);
    expect(screen.getByText("点击选择")).toBeInTheDocument();
  });

  it("选中时显示已选择徽章", () => {
    render(<AlgorithmCard name="A*" description="A星搜索" selected={true} />);
    expect(screen.getByText("已选择")).toBeInTheDocument();
  });

  it("点击触发 onToggle", () => {
    const fn = vi.fn();
    const { container } = render(<AlgorithmCard name="BFS" description="test" onToggle={fn} />);
    fireEvent.click(container.firstElementChild!);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("无 onToggle 时点击不报错", () => {
    const { container } = render(<AlgorithmCard name="BFS" description="test" />);
    expect(() => fireEvent.click(container.firstElementChild!)).not.toThrow();
  });
});

describe("ALGO_INFO", () => {
  it("包含全部 4 种算法", () => {
    expect(ALGO_INFO).toHaveProperty("BFS");
    expect(ALGO_INFO).toHaveProperty("DFS");
    expect(ALGO_INFO).toHaveProperty("A*");
    expect(ALGO_INFO).toHaveProperty("RANDOM");
  });

  it("每个条目包含所需字段", () => {
    for (const algo of ["BFS", "DFS", "A*", "RANDOM"] as const) {
      const info = ALGO_INFO[algo];
      expect(info.explanation).toBeTruthy();
      expect(info.analogy).toBeTruthy();
      expect(info.pseudocode).toBeTruthy();
      expect(Array.isArray(info.key_points)).toBe(true);
      expect(info.key_points.length).toBeGreaterThan(0);
    }
  });
});
