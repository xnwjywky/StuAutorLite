/**
 * 字符串搜索可视化 — 长文本分段显示 + 模式串滑动比对
 */
import { useRef, useEffect, useState } from "react";

const CHAR_W = 16; const ROW_H = 22; const CHARS_PER_ROW = 20;
const COLORS = { match: "#22c55e", mismatch: "#ef4444", active: "#bae6fd", found: "#f59e0b", bg: "#fff", textBg: "#f8fafc" };

interface Props {
  steps?: { type: string; i: number; j?: number; q?: number; match?: boolean; text: string; pattern: string }[];
}

export default function StringSearchVisualizer({ steps = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [done, setDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const text = steps.length > 0 ? steps[0].text : "";
  const pattern = steps.length > 0 ? steps[0].pattern : "";
  const textRows = Math.ceil(text.length / CHARS_PER_ROW);
  const pad = 12;
  const textW = Math.min(text.length, CHARS_PER_ROW) * CHAR_W + pad * 2 + 10;
  const w = Math.max(360, textW);
  const h = (textRows + 2) * ROW_H + pad * 2 + 30;

  useEffect(() => {
    if (steps.length === 0) { setDone(true); return; }
    setFrame(0); setDone(false);
    const interval = setInterval(() => {
      setFrame((prev) => { if (prev >= steps.length) { clearInterval(interval); setDone(true); return steps.length; } return prev + 1; });
    }, 30);
    return () => clearInterval(interval);
  }, [steps.length, replayKey]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);

    const step = steps.length > 0 ? steps[Math.min(frame - 1, steps.length - 1)] : null;
    const curI = step?.i ?? 0;
    const foundPositions = new Set<number>();
    for (let f = 0; f < Math.min(frame, steps.length); f++) if (steps[f].type === "found") foundPositions.add(steps[f].i);

    // 每行绘制文本（分段）
    ctx.font = "bold 13px monospace";
    for (let row = 0; row < textRows; row++) {
      const start = row * CHARS_PER_ROW;
      const end = Math.min(start + CHARS_PER_ROW, text.length);
      for (let idx = start; idx < end; idx++) {
        const col = idx - start;
        const x = pad + 10 + col * CHAR_W;
        const y = 6 + row * ROW_H;
        let bg = COLORS.textBg;
        if (foundPositions.has(idx)) bg = COLORS.found;
        else if (step && step.type !== "found" && idx >= curI && idx < curI + pattern.length) bg = COLORS.active;
        else if (step && step.type === "found" && idx >= step.i && idx < step.i + pattern.length) bg = COLORS.found;
        ctx.fillStyle = bg; ctx.fillRect(x, y, CHAR_W, ROW_H - 1);
        ctx.fillStyle = foundPositions.has(idx) ? "#fff" : "#374151";
        ctx.fillText(text[idx], x + 1, y + ROW_H - 4);
      }
    }

    // 模式串滑动条
    if (step && step.type !== "found" && curI >= 0) {
      const patternCol = curI % CHARS_PER_ROW;
      const px = pad + 10 + patternCol * CHAR_W;
      const py = 6 + (textRows + 1) * ROW_H;
      ctx.font = "bold 13px monospace";
      for (let j = 0; j < pattern.length; j++) {
        const x = px + j * CHAR_W;
        let bg = COLORS.active;
        if (step.j !== undefined && j === step.j) bg = step.match || step.match === undefined ? COLORS.match : COLORS.mismatch;
        ctx.fillStyle = bg; ctx.fillRect(x, py, CHAR_W, ROW_H - 1);
        ctx.fillStyle = "#374151";
        ctx.fillText(pattern[j], x + 1, py + ROW_H - 4);
      }
    }

    // 统计
    ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`${Math.min(frame, steps.length)}/${steps.length} 步`, w - pad, h - 4);
    if (foundPositions.size > 0) {
      ctx.textAlign = "left";
      ctx.fillText(`找到 ${foundPositions.size} 处匹配`, pad + 10, h - 4);
    }
  }, [frame, steps, text, pattern, textRows, w, h]);

  const handleReplay = () => setReplayKey(v => v + 1);
  const progress = steps.length > 0 ? Math.round(frame / steps.length * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="border border-gray-200 rounded-lg shadow-sm" style={{ width: w, height: h }} />
      {steps.length > 0 && <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} /></div>}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {!done ? <span>搜索中...</span> : <span>✅ 完成</span>}
        {done && <button onClick={handleReplay} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium">🔄 重播</button>}
      </div>
      <div className="flex gap-3 text-[10px] text-gray-400">
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.active }} />比对中</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.match }} />匹配</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.mismatch }} />不匹配</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.found }} />找到</span>
      </div>
    </div>
  );
}
