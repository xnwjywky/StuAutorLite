/** vitest 测试环境初始化 */
import "@testing-library/jest-dom/vitest";

// 模拟 localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// 模拟 crypto.randomUUID
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2) },
  });
}

// 模拟 Canvas API（用于 MazeVisualizer / DecisionBoundary 测试）
HTMLCanvasElement.prototype.getContext = function (
  _contextId: string,
  _options?: any,
) {
  return {
    canvas: this as HTMLCanvasElement,
    clearRect: () => {},
    fillRect: () => {},
    fill: () => {},
    stroke: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    arc: () => {},
    moveTo: () => {},
    lineTo: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 8 }),
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: () => {},
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "" as CanvasTextAlign,
    textBaseline: "" as CanvasTextBaseline,
    lineWidth: 0,
    getImageData: () => ({ data: new Uint8ClampedArray(100), width: 10, height: 10 }),
  } as any;
};

// 模拟 requestAnimationFrame
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  return setTimeout(cb, 16) as unknown as number;
};
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);

// 模拟 ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;
