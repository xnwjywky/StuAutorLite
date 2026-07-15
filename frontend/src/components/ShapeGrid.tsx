/**
 * 像素图形可视化 — Canvas 渲染 16×16 二值网格
 * 0=白色背景, 1=蓝色填充（带 animation 逐个显示）
 */
import { useRef, useEffect, useState } from "react";

const CELL = 18; const GRID = 16;
const SIZE = GRID * CELL;

interface Props {
  grid?: number[][];
  label?: string;
  predicted?: string;
  correct?: boolean | null;
  animate?: boolean;
}

export default function ShapeGrid({ grid, label, predicted, correct, animate = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animFrame, setAnimFrame] = useState(animate ? 0 : GRID * GRID);

  useEffect(() => {
    if (!animate) { setAnimFrame(GRID * GRID); return; }
    setAnimFrame(0);
    const interval = setInterval(() => {
      setAnimFrame(prev => { if (prev >= GRID * GRID) { clearInterval(interval); return prev; } return prev + 2; });
    }, 10);
    return () => clearInterval(interval);
  }, [animate, grid]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = SIZE; canvas.height = SIZE;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SIZE, SIZE);

    if (!grid) return;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const idx = y * GRID + x;
        if (idx >= animFrame) { ctx.fillStyle = "#eee"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); ctx.strokeStyle = "#ddd"; ctx.strokeRect(x * CELL, y * CELL, CELL, CELL); continue; }
        ctx.fillStyle = grid[y]?.[x] ? "#3b82f6" : "#fff";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.strokeStyle = "#e2e8f0"; ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }, [grid, animFrame]);

  const cn = correct === true ? "text-green-600" : correct === false ? "text-red-500" : "";
  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} className="border border-gray-200 rounded" style={{ width: SIZE, height: SIZE }} />
      <div className={`text-[10px] text-center ${cn}`}>
        {label && <span>真实: {label}</span>}
        {predicted && <span className="ml-2">预测: {predicted}</span>}
        {correct === false && <span className="ml-1">✗</span>}
        {correct === true && <span className="ml-1">✓</span>}
      </div>
    </div>
  );
}
