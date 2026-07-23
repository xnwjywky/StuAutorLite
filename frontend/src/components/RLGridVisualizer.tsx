/**
 * 强化学习格子世界可视化 — 机器人找金币 🪙 避开陷阱 🕳️
 *
 * 视觉设计：与迷宫寻路明确区分 —— 绿色草地 + 栅栏障碍 + 深坑陷阱 + 金币目标
 * 格子大小根据地图尺寸动态缩放，大尺寸自动缩小以适配容器宽度。
 */
import { useRef, useEffect, useState } from "react";

function calcCellSize(gridSize: number) {
  return Math.max(22, Math.floor(360 / gridSize));
}

const PAD = 8;

// ── 颜色体系 ——
const BG_GRASS = "#e8f5e9";
const GRASS_LIGHT = "#c8e6c9";
const FENCE_BG = "#8d6e63";
const TRAP_BG = "#212121";
const GOLD_BG = "#f9a825";
const ROBOT_COLOR = "#1565c0";
const PATH_COLOR = "rgba(21,101,192,0.25)";

interface Props {
  world?: {
    grid?: string[][]; size?: number;
    start?: [number, number]; gold?: [number, number]; traps?: [number, number][];
  };
  path?: [number, number][];
}

export default function RLGridVisualizer({ world, path = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grid = world?.grid || [];
  const size = world?.size || grid.length || 8;
  const CS = calcCellSize(size);
  const canvasSize = size * CS + PAD * 2;

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    if (path.length === 0) { setDone(true); return; }
    setStep(0); setDone(false);
    const interval = setInterval(() => {
      setStep((prev) => {
        if (prev >= path.length - 1) { clearInterval(interval); setDone(true); return prev; }
        return prev + 1;
      });
    }, 350);
    return () => clearInterval(interval);
  }, [path.length, replayKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvasSize; canvas.height = canvasSize;
    const half = CS / 2;
    const qtr = Math.max(CS / 4, 3);

    // 背景草地
    ctx.fillStyle = BG_GRASS;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // 画格子
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = PAD + x * CS;
        const cy = PAD + y * CS;
        const cell = grid[y]?.[x] || ".";

        // 草地底色棋盘格
        ctx.fillStyle = (x + y) % 2 === 0 ? GRASS_LIGHT : BG_GRASS;
        ctx.fillRect(cx, cy, CS, CS);

        // 栅线
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx + 0.5, cy + 0.5, CS - 1, CS - 1);

        if (cell === "#") {
          // ── 栅栏障碍 🚧 ──
          ctx.fillStyle = FENCE_BG;
          ctx.fillRect(cx + 1, cy + 1, CS - 2, CS - 2);
          ctx.strokeStyle = "#5d4037";
          ctx.lineWidth = Math.max(1, CS / 20);
          for (let fy = cy + qtr; fy < cy + CS - qtr; fy += qtr) {
            ctx.beginPath();
            ctx.moveTo(cx + 2, fy);
            ctx.lineTo(cx + CS - 2, fy);
            ctx.stroke();
          }
          ctx.strokeStyle = "#4e342e";
          ctx.lineWidth = Math.max(1.5, CS / 14);
          ctx.beginPath();
          ctx.moveTo(cx + half, cy + 1);
          ctx.lineTo(cx + half, cy + CS - 1);
          ctx.stroke();

        } else if (cell === "G") {
          // ── 金币 🪙 ──
          const r = CS / 2.8;
          ctx.fillStyle = GOLD_BG;
          ctx.beginPath();
          ctx.arc(cx + half, cy + half, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#f57f17";
          ctx.lineWidth = Math.max(1.2, CS / 30);
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Math.max(10, CS/3)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("$", cx + half, cy + half);

        } else if (cell === "T") {
          // ── 深坑陷阱 🕳️ ──
          ctx.fillStyle = TRAP_BG;
          ctx.beginPath();
          ctx.arc(cx + half, cy + half, CS / 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#757575";
          ctx.lineWidth = Math.max(0.5, CS / 40);
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
            ctx.beginPath();
            ctx.moveTo(cx + half, cy + half);
            ctx.lineTo(
              cx + half + Math.cos(angle) * CS / 3.5,
              cy + half + Math.sin(angle) * CS / 3.5
            );
            ctx.stroke();
          }
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Math.max(8, CS/3.5)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("!", cx + half, cy + half);
        }
      }
    }

    // ── 画路径（半透明蓝色圆点）──
    const displayStep = done ? path.length - 1 : Math.max(0, step);
    const pathSet = new Set<string>();
    for (let i = 0; i <= displayStep; i++) {
      const [px, py] = path[i] || [0, 0];
      pathSet.add(`${px},${py}`);
    }
    for (const key of pathSet) {
      const [px, py] = key.split(",").map(Number);
      const cx = PAD + px * CS + half;
      const cy = PAD + py * CS + half;
      ctx.fillStyle = PATH_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, CS / 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 机器人当前位置 🤖 ──
    if (displayStep >= 0 && path.length > 0) {
      const lastIdx = Math.min(displayStep, path.length - 1);
      const [rx, ry] = path[lastIdx] || [0, 0];
      const rcx = PAD + rx * CS + half;
      const rcy = PAD + ry * CS + half;
      ctx.fillStyle = ROBOT_COLOR;
      ctx.beginPath();
      ctx.arc(rcx, rcy, CS / 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1, CS / 20);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(10, CS/2.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🤖", rcx, rcy + 1);
    }

    // ── 起点标记 ──
    if (path.length > 0) {
      const [sx, sy] = path[0];
      const scx = PAD + sx * CS + half;
      const scy = PAD + sy * CS + half;
      ctx.fillStyle = BG_GRASS;
      ctx.beginPath();
      ctx.arc(scx, scy, CS / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2e7d32";
      ctx.font = `bold ${Math.max(8, CS/4)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GO", scx, scy);
    }
  }, [step, done, grid, size, path, canvasSize, replayKey]);

  const handleReplay = () => setReplayKey((v) => v + 1);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="border-2 border-green-200 rounded-xl shadow-sm"
        style={{ width: canvasSize, height: canvasSize, maxWidth: "100%" }} />
      {path.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {!done ? <span>🤖 机器人移动中 {step + 1}/{path.length}</span> : <span>✅ 到达目标 ({path.length} 步)</span>}
          {done && <button onClick={handleReplay} className="px-3 py-1 bg-green-50 hover:bg-green-100 rounded-full text-xs font-medium text-green-700 border border-green-200">🔄 重播路径</button>}
        </div>
      )}
      <div className="flex gap-4 text-[10px] text-gray-400 flex-wrap">
        <span title="木头栅栏"><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: FENCE_BG }} />栅栏障碍</span>
        <span title="金币目标"><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: GOLD_BG }} />金币 $</span>
        <span title="深坑陷阱"><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: TRAP_BG }} />陷阱 !</span>
        <span title="机器人走过的路径"><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: PATH_COLOR }} />探索路径</span>
        <span title="机器人当前位置"><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: ROBOT_COLOR }} />🤖 机器人</span>
      </div>
    </div>
  );
}
