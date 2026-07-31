/**
 * MNISTDrawCanvas component tests
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import MNISTDrawCanvas from "../MNISTDrawCanvas";

// Mock canvas API — jsdom doesn't fully support Canvas 2D
const mockCtx = {
  fillStyle: "",
  fillRect: vi.fn(),
  strokeStyle: "",
  lineWidth: 0,
  lineCap: "",
  lineJoin: "",
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  drawImage: vi.fn(),
};

beforeAll(() => {
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string, _opts?: any) => {
    const el = origCreate(tag);
    if (tag === "canvas") {
      (el as any).getContext = vi.fn(() => mockCtx);
      (el as HTMLCanvasElement).toDataURL = vi.fn(() => "data:image/png;base64,test") as any;
    }
    return el;
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx as any) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,test") as any;
});

describe("MNISTDrawCanvas", () => {
  it("renders canvas element", () => {
    const { container } = render(<MNISTDrawCanvas />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
  });

  it("renders clear button", () => {
    const { getByText } = render(<MNISTDrawCanvas />);
    expect(getByText(/清除/)).toBeTruthy();
  });

  it("clear button disabled when canvas empty", () => {
    const { getByText } = render(<MNISTDrawCanvas />);
    const btn = getByText(/清除/);
    expect(btn).toBeDisabled();
  });

  it("shows locked message when disabled", () => {
    const { getByText } = render(<MNISTDrawCanvas disabled={true} />);
    expect(getByText(/画板已锁定/)).toBeTruthy();
  });

  it("drawing hint shown when empty and not disabled", () => {
    const { getByText } = render(<MNISTDrawCanvas />);
    expect(getByText(/在画板上写一个数字/)).toBeTruthy();
  });

  it("mousedown starts drawing", () => {
    const { container } = render(<MNISTDrawCanvas />);
    const canvas = container.querySelector("canvas")!;
    fireEvent.mouseDown(canvas, { clientX: 140, clientY: 140 });
    expect(mockCtx.beginPath).toHaveBeenCalled();
  });

  it("calls onImageReady on touchend after drawing", () => {
    const onReady = vi.fn();
    const { container } = render(<MNISTDrawCanvas onImageReady={onReady} />);
    const canvas = container.querySelector("canvas")!;
    fireEvent.touchStart(canvas, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(canvas, { touches: [{ clientX: 120, clientY: 120 }] });
    fireEvent.touchEnd(canvas);
    expect(onReady).toHaveBeenCalled();
  });

  it("calls onImageReady on mouseup after drawing", () => {
    const onReady = vi.fn();
    const { container } = render(<MNISTDrawCanvas onImageReady={onReady} />);
    const canvas = container.querySelector("canvas")!;
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 120 });
    fireEvent.mouseUp(canvas);
    expect(onReady).toHaveBeenCalled();
  });

  it("canvas is locked when disabled (no mousedown drawing)", () => {
    const { container } = render(<MNISTDrawCanvas disabled={true} />);
    const canvas = container.querySelector("canvas")!;
    mockCtx.beginPath.mockClear();
    fireEvent.mouseDown(canvas, { clientX: 140, clientY: 140 });
    // Should NOT draw when disabled
    expect(mockCtx.beginPath).not.toHaveBeenCalled();
  });
});
