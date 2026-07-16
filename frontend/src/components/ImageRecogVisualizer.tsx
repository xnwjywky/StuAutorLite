/**
 * 图像识别可视化动画 — Canvas 逐个样本展示预测结果
 *
 * 动画流程：
 * 1. 逐行扫描式绘制像素网格（每帧 2 行）
 * 2. 显示真实标签 → 预测标签
 * 3. 绿色边框(✓) 或 红色边框(✗)
 * 4. 停顿后切换下一个样本
 */
import { useRef, useEffect, useState, useCallback } from "react";

const CELL = 14;
const GRID = 16;
const SIZE = GRID * CELL;
const SCAN_SPEED = 3; // 每帧扫描的行数
const PAUSE_FRAMES = 30; // 预测结果停留帧数

export interface VisualizerStep {
  testIndex: number;
  grid: number[][];
  trueLabel: string | number;
  predictedLabel: string | number;
  correct: boolean;
}

interface Props {
  steps?: VisualizerStep[];
  /** 算法名称（显示在标题） */
  algorithmName?: string;
  /** 标签名映射 */
  labelNames?: Record<string | number, string>;
}

export default function ImageRecogVisualizer({ steps = [], algorithmName, labelNames = {} }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [done, setDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  // 计算总帧数：每个样本 = SCAN_BATCH + PAUSE, 扫描需要 ceil(GRID/SCAN_SPEED) 帧
  const SCAN_BATCH = Math.ceil(GRID / SCAN_SPEED);
  const TOTAL_PER_SAMPLE = SCAN_BATCH + PAUSE_FRAMES;
  const totalFrames = steps.length * TOTAL_PER_SAMPLE;

  useEffect(() => {
    if (steps.length === 0) { setDone(true); return; }
    setFrame(0); setDone(false);
    const interval = setInterval(() => {
      setFrame(prev => {
        if (prev >= totalFrames) { clearInterval(interval); setDone(true); return totalFrames; }
        return prev + 1;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [steps.length, totalFrames, replayKey]);

  const labelOf = useCallback((v: string | number) =>
    (labelNames[String(v)] ?? labelNames[v] ?? String(v)),
    [labelNames]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cardW = SIZE + 24;
    const cardH = SIZE + 64;
    canvas.width = cardW;
    canvas.height = cardH;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cardW, cardH);

    if (steps.length === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("无样本数据", cardW / 2, cardH / 2);
      return;
    }

    const sampleIdx = Math.min(Math.floor(frame / TOTAL_PER_SAMPLE), steps.length - 1);
    const step = steps[sampleIdx];
    if (!step) return;

    const frameInSample = frame - sampleIdx * TOTAL_PER_SAMPLE;
    const scanLines = Math.min(frameInSample * SCAN_SPEED, GRID);

    const ox = 12;
    const oy = 12;

    // ── 逐行绘制像素网格 ──
    const grid = step.grid;
    if (grid && grid.length > 0) {
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          if (y >= scanLines) {
            // 尚未扫描到的行，画为浅灰
            ctx.fillStyle = "#f0f0f0";
            ctx.fillRect(ox + x * CELL, oy + y * CELL, CELL, CELL);
            ctx.strokeStyle = "#e5e5e5";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(ox + x * CELL, oy + y * CELL, CELL, CELL);
            continue;
          }
          // 已扫描到的像素
          const v = grid[y]?.[x] ?? 0;
          ctx.fillStyle = v ? "#3b82f6" : "#ffffff";
          ctx.fillRect(ox + x * CELL, oy + y * CELL, CELL, CELL);
          ctx.strokeStyle = "#d1d5db";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(ox + x * CELL, oy + y * CELL, CELL, CELL);
        }
      }
    }

    // ── 结果阶段（扫描完成 + 等待期） ──
    if (scanLines >= GRID && frameInSample >= SCAN_BATCH) {
      const showPrediction = frameInSample >= SCAN_BATCH + 8;

      // 边框颜色
      const borderColor = step.correct ? "#22c55e" : "#ef4444";
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(ox - 1, oy - 1, SIZE + 2, SIZE + 2);

      // 标签区域
      const labelY = oy + SIZE + 12;
      ctx.fillStyle = "#374151";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";

      // 真实标签（始终显示）
      ctx.fillStyle = "#6b7280";
      ctx.fillText(`真实: ${labelOf(step.trueLabel)}`, cardW / 2, labelY);

      // 预测结果显示
      if (showPrediction) {
        ctx.fillStyle = borderColor;
        ctx.font = "bold 12px sans-serif";
        const resultIcon = step.correct ? "✓" : "✗";
        ctx.fillText(`预测: ${labelOf(step.predictedLabel)} ${resultIcon}`, cardW / 2, labelY + 18);
      }
    }

    // ── 样本进度指示器 ──
    if (steps.length > 1) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${sampleIdx + 1}/${steps.length}`, cardW / 2, cardH - 6);
    }
  }, [frame, steps, labelOf, TOTAL_PER_SAMPLE, SCAN_BATCH]);

  const handleReplay = () => setReplayKey(v => v + 1);

  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} className="rounded-lg shadow-sm"
        style={{ width: SIZE + 24, height: SIZE + 64 }} />
      <div className="flex items-center gap-2 mt-1">
        {algorithmName && <span className="text-xs font-medium text-gray-600">{algorithmName}</span>}
        <span className="text-[10px] text-gray-400">
          {done ? "完成" : `播放中 ${Math.round(frame / totalFrames * 100)}%`}
        </span>
        <button onClick={handleReplay}
          className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors">
          {done ? "重播" : "重置"}
        </button>
      </div>
    </div>
  );
}
