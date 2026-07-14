/**
 * 排序可视化 — Canvas 数组柱状图 + 逐帧动画
 */
import { useRef, useEffect, useState } from "react";

const BAR_W = 18; const GAP = 2; const BASE_H = 240;
const COLORS = { default: "#3b82f6", compare: "#f59e0b", swap: "#ef4444", sorted: "#22c55e", pivot: "#8b5cf6" };

interface Props {
  steps?: { type: string; i: number; j: number; min?: number; pivot?: number; pivot_done?: boolean; arr: number[] }[];
}

export default function SortVisualizer({ steps = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [done, setDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const maxVal = steps.length > 0 ? Math.max(...(steps[steps.length - 1]?.arr || [1])) : 1;
  const w = steps.length > 0 ? (steps[0]?.arr?.length || 1) * (BAR_W + GAP) - GAP + 60 : 400;
  const barH = (v: number) => (v / maxVal) * BASE_H;

  useEffect(() => {
    if (steps.length === 0) { setDone(true); return; }
    setFrame(0); setDone(false);
    const interval = setInterval(() => {
      setFrame((prev) => { if (prev >= steps.length) { clearInterval(interval); setDone(true); return steps.length; } return prev + 1; });
    }, 60);
    return () => clearInterval(interval);
  }, [steps.length, replayKey]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = w; canvas.height = BASE_H + 60;
    const arr = steps.length > 0 ? (steps[Math.min(frame, steps.length - 1)]?.arr || []) : [];
    const step = steps.length > 0 ? steps[Math.min(frame - 1, steps.length - 1)] : null;

    ctx.clearRect(0, 0, w, BASE_H + 60);
    arr.forEach((v, idx) => {
      const x = 30 + idx * (BAR_W + GAP);
      const h = barH(v); const y = BASE_H - h + 10;
      let color = COLORS.default;
      if (step && (idx === step.i || idx === step.j)) {
        color = step.type === "swap" ? COLORS.swap : COLORS.compare;
      }
      if (step && (step as any).pivot !== undefined && idx === (step as any).pivot) color = COLORS.pivot;
      if (step && (step as any).min !== undefined && idx === (step as any).min) color = COLORS.swap;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, BAR_W, h);
      ctx.fillStyle = "#6b7280";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(v), x + BAR_W / 2, y - 4);
    });
  }, [frame, steps, w, barH]);

  const handleReplay = () => setReplayKey(v => v + 1);
  const progress = steps.length > 0 ? Math.round(frame / steps.length * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="border border-gray-200 rounded-lg shadow-sm" style={{ width: w, height: BASE_H + 60 }} />
      {steps.length > 0 && <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {!done ? <span>步骤 {frame}/{steps.length}</span> : <span>✅ 完成</span>}
        {done && <button onClick={handleReplay} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium">🔄 重播</button>}
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.default }} />默认</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.compare }} />比较</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.swap }} />交换</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.pivot }} />轴点</span>
      </div>
    </div>
  );
}
