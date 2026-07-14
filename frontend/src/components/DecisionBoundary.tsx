/**
 * 决策边界可视化 — Canvas 渲染 2D 数据点 + 决策区域 + 误分类标记
 * 动画：首次挂载自动播放一次，完成后保持静态；点击重播才再次播放
 */
import { useRef, useEffect, useCallback, useState } from "react";

const CANVAS_SIZE = 440;
const POINT_R = 4;
const COLORS = {
  bg: "#ffffff",
  classFill: ["rgba(59,130,246,0.15)", "rgba(239,68,68,0.15)", "rgba(34,197,94,0.15)"],
  classStroke: ["#2563eb", "#dc2626", "#16a34a"],
  misclass: "#f59e0b", highlight: "#8b5cf6",
};

interface Props {
  points?: [number, number][];
  labels?: number[];
  predictions?: number[];
  boundaryData?: {
    grid_predictions: number[]; grid_shape: [number, number];
    x_range: [number, number]; y_range: [number, number];
  } | null;
  classNames?: string[];
  showBoundary?: boolean;
  animate?: boolean;
  nTrain?: number;
}

export default function DecisionBoundary({
  points = [], labels = [], predictions = [], boundaryData,
  classNames = ["类别 A", "类别 B"], showBoundary = true,
  animate = false, nTrain = 0,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [phase, setPhase] = useState<"idle" | "train" | "boundary" | "predict" | "done">("idle");
  const [replayKey, setReplayKey] = useState(0);
  const autoPlayedRef = useRef(false);   // 首次自动播放是否已完成
  const replayClickedRef = useRef(false); // 用户是否点击了重播

  // Computed once
  const transform = useRef<{ tx: (x: number) => number; ty: (y: number) => number }>({ tx: () => 0, ty: () => 0 });
  const boundaryRef = useRef({ gp: [] as number[], gs: [0, 0] as [number, number], bx: [0, 0] as [number, number], by: [0, 0] as [number, number], cw: 0, ch: 0 });

  const draw = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = CANVAS_SIZE; canvas.height = CANVAS_SIZE;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const { tx, ty } = transform.current;
    const { gp, gs, bx, by, cw, ch } = boundaryRef.current;
    const trainN = nTrain || Math.floor(points.length * 0.7);
    const testStart = trainN;
    const nClasses = Math.max(...labels, 0) + 1;

    if (points.length === 0) {
      ctx.fillStyle = "#9ca3af"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("暂无数据，请运行实验", CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      return;
    }

    // 1. Decision boundary layer
    if (showBoundary && gp.length > 0 && (!animate || frame >= 60)) {
      const maxCells = animate && frame < 100 ? Math.floor((frame - 60) / 40 * gp.length) : gp.length;
      const count = Math.min(gp.length, Math.max(0, maxCells));
      for (let idx = 0; idx < count; idx++) {
        const i = Math.floor(idx / gs[1]), j = idx % gs[1];
        const cls = gp[idx] ?? 0;
        const cx = tx(bx[0] + (bx[1] - bx[0]) * i / (gs[0] - 1)) - cw / 2;
        const cy = ty(by[1] - (by[1] - by[0]) * j / (gs[1] - 1)) - ch / 2;
        ctx.fillStyle = COLORS.classFill[cls % 3];
        ctx.fillRect(cx, cy, cw + 1, ch + 1);
      }
    }

    // 2. Training points
    const showTrainUntil = animate ? (frame < 40 ? Math.floor(frame / 40 * trainN) : trainN) : points.length;
    for (let i = 0; i < Math.min(trainN, showTrainUntil); i++) {
      const [px, py] = points[i]; const cx = tx(px); const cy = ty(py);
      ctx.beginPath(); ctx.arc(cx, cy, POINT_R, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.classStroke[labels[i] % 3];
      if (animate && i === Math.floor(showTrainUntil) - 1 && frame < 40) {
        ctx.strokeStyle = COLORS.highlight; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.fill();
    }

    // 3. Test / prediction points
    const predProgress = animate && frame >= 120 ? Math.min((frame - 120) / 60, 1) : 1;
    const showPredUntil = animate ? testStart + Math.floor((points.length - testStart) * predProgress) : points.length;
    for (let i = testStart; i < Math.min(points.length, showPredUntil); i++) {
      const [px, py] = points[i]; const cx = tx(px); const cy = ty(py);
      const trueCls = labels[i] ?? 0;
      const predCls = predictions[i - testStart] ?? trueCls;
      const misclassified = predCls !== trueCls;
      ctx.beginPath(); ctx.arc(cx, cy, POINT_R, 0, Math.PI * 2);
      if (misclassified) {
        ctx.fillStyle = COLORS.misclass;
        ctx.strokeStyle = COLORS.classStroke[trueCls % 3]; ctx.lineWidth = 2;
        ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = COLORS.classStroke[trueCls % 3];
        ctx.fill();
      }
    }

    // 4. Legend & stats
    const legendY = CANVAS_SIZE - 18; ctx.font = "11px sans-serif"; let lx = 30;
    for (let c = 0; c < nClasses; c++) { ctx.fillStyle = COLORS.classStroke[c % 3]; ctx.fillRect(lx, legendY - 6, 10, 10); ctx.fillStyle = "#374151"; ctx.textAlign = "left"; ctx.fillText(classNames[c] ?? `类别 ${c}`, lx + 14, legendY + 3); lx += 90; }
    ctx.beginPath(); ctx.arc(lx + 5, legendY - 1, POINT_R, 0, Math.PI * 2); ctx.fillStyle = COLORS.misclass; ctx.fill(); ctx.fillStyle = "#374151"; ctx.fillText("误分类", lx + 14, legendY + 3);

    if (predictions.length > 0) {
      const correct = predictions.filter((p, i) => p === labels[i]).length;
      ctx.font = "12px sans-serif"; ctx.fillStyle = "#374151"; ctx.textAlign = "right";
      ctx.fillText(`准确率: ${(correct / labels.length * 100).toFixed(1)}% (${correct}/${labels.length})`, CANVAS_SIZE - 30, 46);
    }
    ctx.font = "10px sans-serif"; ctx.fillStyle = "#9ca3af"; ctx.textAlign = "center";
    ctx.fillText("特征 x", CANVAS_SIZE / 2, CANVAS_SIZE - 2);
    ctx.save(); ctx.translate(10, CANVAS_SIZE / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("特征 y", 0, 0); ctx.restore();
  }, [points, labels, predictions, classNames, showBoundary, animate, nTrain]);

  // 预计算坐标和边界
  useEffect(() => {
    if (points.length === 0) return;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const xMin = Math.min(...xs) - 0.5, xMax = Math.max(...xs) + 0.5;
    const yMin = Math.min(...ys) - 0.5, yMax = Math.max(...ys) + 0.5;
    const pad = 30;
    const sx = (CANVAS_SIZE - pad * 2) / (xMax - xMin || 1);
    const sy = (CANVAS_SIZE - pad * 2) / (yMax - yMin || 1);
    transform.current = { tx: (x: number) => pad + (x - xMin) * sx, ty: (y: number) => pad + (yMax - y) * sy };
    if (boundaryData?.grid_predictions?.length) {
      boundaryRef.current = {
        gp: boundaryData.grid_predictions, gs: boundaryData.grid_shape,
        bx: boundaryData.x_range, by: boundaryData.y_range,
        cw: sx * (boundaryData.x_range[1] - boundaryData.x_range[0]) / boundaryData.grid_shape[0],
        ch: sy * (boundaryData.y_range[1] - boundaryData.y_range[0]) / boundaryData.grid_shape[1],
      };
    }
  }, [points, boundaryData]);

  // 动画循环
  const runAnim = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const DURATION = 4500;
    setPhase("train");
    function tick() {
      const elapsed = performance.now() - start;
      const progress = Math.min(elapsed / DURATION, 1);
      draw(Math.floor(progress * 180));
      if (elapsed < 600) setPhase("train");
      else if (elapsed < 2200) setPhase("boundary");
      else if (elapsed < 3800) setPhase("predict");
      else { setPhase("done"); autoPlayedRef.current = true; return; }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
  }, [draw]);

  // 控制自动播放和重播
  useEffect(() => {
    if (!animate) { draw(0xFFFF); setPhase("done"); return; }
    // 首次挂载：自动播放一次
    if (!autoPlayedRef.current && !replayClickedRef.current) {
      const timer = setTimeout(runAnim, 300);
      return () => { clearTimeout(timer); cancelAnimationFrame(animRef.current); };
    }
    // 用户点重播
    if (replayClickedRef.current) {
      replayClickedRef.current = false;
      autoPlayedRef.current = false;
      const timer = setTimeout(runAnim, 100);
      return () => { clearTimeout(timer); cancelAnimationFrame(animRef.current); };
    }
    // 已完成 → 保持最终帧
    draw(0xFFFF);
  }, [replayKey, animate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReplay = () => {
    cancelAnimationFrame(animRef.current);
    replayClickedRef.current = true;
    autoPlayedRef.current = false;
    setReplayKey(v => v + 1);
  };

  const statusText =
    phase === "train" ? "🔍 展示训练数据..." :
    phase === "boundary" ? "🧱 绘制决策边界..." :
    phase === "predict" ? "🎯 分类测试数据..." :
    phase === "done" ? "✅ 完成" : "";

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="border border-gray-200 rounded-lg shadow-sm"
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} />
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {animate && <span>{statusText}</span>}
        {animate && phase === "done" && (
          <button onClick={handleReplay} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium transition-colors">🔄 重播</button>
        )}
      </div>
      <div className="flex gap-4 text-[10px] text-gray-400">
        {classNames.map((name, i) => (
          <span key={name}><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.classStroke[i % 3] }} />{name}</span>
        ))}
        <span><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: COLORS.misclass }} />误分类</span>
        <span style={{ opacity: 0.6 }}><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.classFill[0] }} />决策区域</span>
      </div>
    </div>
  );
}
