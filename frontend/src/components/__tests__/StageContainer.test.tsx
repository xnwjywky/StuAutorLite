/** 测试 StageContainer 组件 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StageContainer from "../StageContainer";

describe("StageContainer", () => {
  it("渲染步骤编号和标题", () => {
    render(<StageContainer step={3} title="设计实验"><p>内容</p></StageContainer>);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("设计实验")).toBeInTheDocument();
    expect(screen.getByText("内容")).toBeInTheDocument();
  });

  it("渲染操作区域", () => {
    render(<StageContainer step={1} title="测试" actions={<button>下一步</button>}><p>x</p></StageContainer>);
    expect(screen.getByText("下一步")).toBeInTheDocument();
  });

  it("渲染 Agent 成功横幅（绿色）", () => {
    const { container } = render(<StageContainer step={1} title="测试" agent={{ text: "分析完成", ok: true }}><p>x</p></StageContainer>);
    expect(container.textContent).toContain("已使用 Agent 分析");
    expect(container.textContent).toContain("✅");
  });

  it("渲染 Agent 错误横幅（黄色）", () => {
    const { container } = render(<StageContainer step={1} title="测试" agent={{ text: "请求失败", ok: false }}><p>x</p></StageContainer>);
    expect(container.textContent).toContain("请求失败");
    expect(container.textContent).toContain("⚠️");
  });

  it("无 agent 时不渲染横幅", () => {
    render(<StageContainer step={1} title="测试"><p>x</p></StageContainer>);
    expect(screen.queryByText(/AI/)).not.toBeInTheDocument();
  });
});
