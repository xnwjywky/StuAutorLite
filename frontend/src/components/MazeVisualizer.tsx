/**
 * 迷宫可视化 — 动画回放 + 编辑器模式
 *
 * 动画模式：搜索阶段 → 路径追踪 → 完成
 * 编辑器模式：点击格子切换墙/空白（起点终点不变），外部通过 onGridChange 获取最新网格
 */
import { useRef, useEffect, useCallback } from "react";

const CELL = 20;
const COLORS = {
  empty:  "#ffffff", wall: "#1e293b", start: "#22c55e", goal: "#ef4444",
  visited: [0xba, 0xe6, 0xfd] as const, path: "#2563eb", pathHead: "#facc15", grid: "#e2e8f0",
  editorHover: "rgba(59,130,246,0.25)",
};

const BASE_INTERVAL_MS = 80;

interface Props {
  grid?: number[][];
  visited?: [number, number][];
  path?: [number, number][];
  runtimeMs?: number;
  algorithm?: string;
  editable?: boolean;
  onGridChange?: (grid: number[][]) => void;
}

function drawGrid(ctx: CanvasRenderingContext2D, grid: number[][]) {
  const h = grid.length, w = grid[0].length;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = grid[y][x] === 1 ? COLORS.wall : COLORS.empty;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      ctx.strokeStyle = COLORS.grid;
      ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
    }
}
function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
}
function drawVisitedCell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const [r, g, b] = COLORS.visited;
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
}
function drawEndpoints(ctx: CanvasRenderingContext2D, w: number, h: number) {
  drawCell(ctx, 0, 0, COLORS.start);
  drawCell(ctx, w - 1, h - 1, COLORS.goal);
}

export default function MazeVisualizer({ grid, visited = [], path = [], runtimeMs = 30, algorithm = "", editable, onGridChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef({ frame: 0, phase: "idle" as "idle" | "search" | "trace" | "done" });
  const gridRef = useRef(grid);

  const mazeGrid = grid ?? (() => { const g: number[][] = []; for (let y = 0; y < 12; y++) { g[y] = []; for (let x = 0; x < 12; x++) g[y][x] = (x === 0 && y === 0) || (x === 11 && y === 11) ? 0 : 0; } return g; })();
  useEffect(() => { gridRef.current = mazeGrid; }, [mazeGrid]);

  const h = mazeGrid.length, w = mazeGrid[0].length;
  const runtimeFactor = Math.max(0.3, Math.min(3, 30 / Math.max(runtimeMs, 1)));
  const visitedInterval = Math.max(5, BASE_INTERVAL_MS / runtimeFactor);
  const pathInterval = Math.max(15, visitedInterval * 2.5);

  const drawFrame = useCallback((frame: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = w * CELL; canvas.height = h * CELL;
    const g = gridRef.current || mazeGrid;
    drawGrid(ctx, g);
    const vc = Math.min(frame, visited.length);
    for (let i = 0; i < vc; i++) drawVisitedCell(ctx, visited[i][0], visited[i][1]);
    if (frame > visited.length) {
      const pf = frame - visited.length; const pc = Math.min(pf, path.length);
      for (let i = 0; i < pc - 1; i++) drawCell(ctx, path[i][0], path[i][1], COLORS.path);
      if (pc > 0) drawCell(ctx, path[pc - 1][0], path[pc - 1][1], COLORS.pathHead);
    }
    drawEndpoints(ctx, w, h);
  }, [w, h, visited, path, mazeGrid]);

  const runAnimation = useCallback(() => {
    const s = stateRef.current;
    const total = visited.length + path.length;
    if (total === 0) return;
    cancelAnimationFrame(animRef.current);
    s.frame = 0; s.phase = "search";
    const totalVisitedMs = visited.length * visitedInterval;
    const start = performance.now();
    function tick() {
      const el = performance.now() - start;
      if (el < totalVisitedMs) s.frame = Math.floor(el / visitedInterval);
      else s.frame = visited.length + Math.floor((el - totalVisitedMs) / pathInterval);
      if (s.frame >= total) { s.frame = total; s.phase = "done"; drawFrame(s.frame); return; }
      s.phase = el < totalVisitedMs ? "search" : "trace";
      drawFrame(s.frame);
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
  }, [visited, path, visitedInterval, pathInterval, drawFrame]);

  useEffect(() => {
    drawFrame(0);
    if (visited.length === 0 && path.length === 0) return;
    const timer = setTimeout(runAnimation, 200);
    return () => { clearTimeout(timer); cancelAnimationFrame(animRef.current); };
  }, [runAnimation, drawFrame, visited.length, path.length]);

  const handleReplay = () => { cancelAnimationFrame(animRef.current); drawFrame(0); setTimeout(runAnimation, 100); };

  // ── 编辑器模式 ──
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable || !onGridChange) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    // 不能编辑起点和终点
    if ((x === 0 && y === 0) || (x === w - 1 && y === h - 1)) return;
    const newGrid = (gridRef.current || mazeGrid).map((row: number[]) => [...row]);
    newGrid[y][x] = newGrid[y][x] === 1 ? 0 : 1;
    gridRef.current = newGrid;
    onGridChange(newGrid);
    // 重绘
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = w * CELL; canvas.height = h * CELL;
    cancelAnimationFrame(animRef.current);
    drawGrid(ctx, newGrid);
    drawEndpoints(ctx, w, h);
  }, [editable, onGridChange, w, h, mazeGrid]);

  const s = stateRef.current;
  const statusText =
    s.phase === "search" ? `🔍 搜索中... (${Math.min(s.frame, visited.length)}/${visited.length} 节点)` :
    s.phase === "trace" ? `🛤️ 追踪路径... (${s.frame - visited.length}/${path.length} 步)` :
    s.phase === "done" ? `✅ 完成 · ${visited.length} 节点 · ${path.length} 步 · ${runtimeMs}ms` :
    editable ? `✏️ 编辑模式：点击格子切换墙/空地` :
    `${algorithm} · ${visited.length} 节点 · ${path.length} 步 · ${runtimeMs}ms`;

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className={`border border-gray-200 rounded-lg shadow-sm ${editable ? "cursor-crosshair hover:shadow-md" : ""}`}
        style={{ width: w * CELL, height: h * CELL }}
        onClick={handleCanvasClick}
      />
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{statusText}</span>
        {visited.length + path.length > 0 && !editable && (
          <button onClick={handleReplay} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium transition-colors">🔄 重播</button>
        )}
      </div>
      <div className="flex gap-4 text-[10px] text-gray-400">
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.start }} />起点</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.goal }} />终点</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: `rgb(${COLORS.visited[0]},${COLORS.visited[1]},${COLORS.visited[2]})` }} />已搜索</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.path }} />最终路径</span>
        {editable && <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: COLORS.wall }} />障碍物</span>}
      </div>
    </div>
  );
}
