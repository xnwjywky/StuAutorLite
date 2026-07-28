/**
 * MNIST 手写数字画板 — 280×280 Canvas，学生在白底上写黑字
 *
 * - 鼠标 + 触摸支持（mouseup 和 touchend 都会触发 onImageReady）
 * - disabled 状态下锁定交互（识别中不可编辑）
 * - 清除按钮
 * - 导出 28×28 PNG Blob
 */
import { useRef, useEffect, useState, useCallback } from "react";

const CANVAS_SIZE = 280;
const MNIST_SIZE = 28;
const SCALE = CANVAS_SIZE / MNIST_SIZE;
const BRUSH_RADIUS = 12;

interface Props {
  disabled?: boolean;
  onImageReady?: (blob: Blob | null) => void;
}

export default function MNISTDrawCanvas({ disabled = false, onImageReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const onImageReadyRef = useRef(onImageReady);
  onImageReadyRef.current = onImageReady;

  // ── 初始化白底 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  // ── 画线 ──
  const drawLine = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = BRUSH_RADIUS * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    setIsEmpty(false);
  }, []);

  // ── 坐标 ──
  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = CANVAS_SIZE / rect.width;
    const sy = CANVAS_SIZE / rect.height;
    if ("touches" in e) {
      const t = (e as TouchEvent).touches[0] || (e as TouchEvent).changedTouches[0];
      if (!t) return null;
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    const pos = getPos(e);
    if (pos) {
      lastPosRef.current = pos;
      drawLine(pos.x, pos.y, pos.x, pos.y);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || !drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (pos && lastPosRef.current) {
      drawLine(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y);
      lastPosRef.current = pos;
    }
  };

  // ═══ 关键修复: mouseup 和 touchend 都触发 onImageReady ═══
  const finishDrawing = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPosRef.current = null;
    onImageReadyRef.current?.(exportBlob());
  }, []);

  // ── 全局鼠标/触摸抬起（mouseup 出 canvas 也能结束）──
  useEffect(() => {
    const up = (_e: MouseEvent | TouchEvent) => {
      finishDrawing();
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, [finishDrawing]);

  // ── 导出 28×28 PNG Blob ──
  function exportBlob(): Blob | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const small = document.createElement("canvas");
    small.width = MNIST_SIZE;
    small.height = MNIST_SIZE;
    const sctx = small.getContext("2d");
    if (!sctx) return null;
    sctx.drawImage(canvas, 0, 0, MNIST_SIZE, MNIST_SIZE);
    const dataUrl = small.toDataURL("image/png");
    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ab], { type: "image/png" });
  }

  // ── 清除 ──
  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    setIsEmpty(true);
    onImageReadyRef.current?.(null);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
        <canvas
          ref={canvasRef}
          className={`border-2 rounded-xl touch-none select-none ${disabled ? "border-gray-200 opacity-60 cursor-not-allowed" : "border-gray-300 cursor-crosshair hover:border-blue-400"}`}
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={finishDrawing}
        />
        <svg className="absolute inset-0 pointer-events-none" width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ opacity: 0.08 }}>
          {Array.from({ length: MNIST_SIZE + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * SCALE} x2={CANVAS_SIZE} y2={i * SCALE} stroke="#999" strokeWidth={0.5} />
          )).concat(
            Array.from({ length: MNIST_SIZE + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * SCALE} y1={0} x2={i * SCALE} y2={CANVAS_SIZE} stroke="#999" strokeWidth={0.5} />
            ))
          )}
        </svg>
      </div>
      <div className="flex items-center gap-3">
        <button
          className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${disabled || isEmpty ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-red-200 text-red-600 hover:bg-red-50"}`}
          onClick={clear}
          disabled={disabled || isEmpty}
        >
          🗑️ 清除
        </button>
        {disabled && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <span className="w-2 h-2 border border-amber-400 border-t-transparent rounded-full animate-spin" />
            识别中，画板已锁定
          </span>
        )}
        {!disabled && isEmpty && (
          <span className="text-xs text-gray-400">在画板上写一个数字（0-9）</span>
        )}
        {!disabled && !isEmpty && (
          <span className="text-xs text-green-600">✓ 已书写，可以识别</span>
        )}
      </div>
    </div>
  );
}
