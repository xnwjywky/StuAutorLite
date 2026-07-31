/**
 * RL grid world visualizer — single-path animation + dual-path static/animated compare.
 *
 * Single-path:  animated robot traversal with replay.
 * Dual-path static:  comparePaths without animatedStep renders full paths.
 * Dual-path animated: comparePaths + animatedStep=N renders up to step N for both agents
 *   simultaneously on the same grid (different colors, solid vs dashed).
 */
import { useRef, useEffect, useState } from "react";

function calcCellSize(gridSize: number) {
  return Math.max(28, Math.floor(520 / gridSize));
}

const PAD = 8;

const BG_GRASS = "#e8f5e9";
const GRASS_LIGHT = "#c8e6c9";
const FENCE_BG = "#8d6e63";
const TRAP_BG = "#212121";
const GOLD_BG = "#f9a825";
const ROBOT_COLOR = "#1565c0";
const PATH_COLOR = "rgba(21,101,192,0.25)";

const DUAL = [
  { stroke: "#1565c0", fill: "rgba(21,101,192,0.20)", dash: [],  label: "Q-learning", emoji: "Q" },
  { stroke: "#2e7d32", fill: "rgba(46,125,50,0.20)",  dash: [6, 3], label: "SARSA",      emoji: "S" },
];

export interface ComparePath {
  agent: string;
  path: [number, number][];
}

/** Per-step decision: Q-values for all 4 actions at each position */
export interface StepDecision {
  step: number;
  state: [number, number];
  action: number;
  q_values: number[];
  best_action: number;
}

interface Props {
  world?: {
    grid?: string[][]; size?: number;
    start?: [number, number]; gold?: [number, number]; traps?: [number, number][];
  };
  path?: [number, number][];

  // ── Dual-path compare mode ──
  comparePaths?: ComparePath[];
  /** Which step to render (0 = start positions only, N = render up to step N).
   *  Omit or set to -1 for static full-path render. */
  animatedStep?: number;
  hideLegend?: boolean;
}

const ACTION_ARROWS = ["←", "→", "↑", "↓"];

export default function RLGridVisualizer({ world, path = [], comparePaths, animatedStep, hideLegend }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grid = world?.grid || [];
  const size = world?.size || grid.length || 8;
  const CS = calcCellSize(size);
  const canvasSize = size * CS + PAD * 2;
  const isCompare = comparePaths && comparePaths.length > 0;
  const isAnimated = isCompare && animatedStep !== undefined && animatedStep >= 0;

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  // Single-path animation timer
  useEffect(() => {
    if (isCompare || path.length === 0) { setDone(true); return; }
    setStep(0); setDone(false);
    const iv = setInterval(() => {
      setStep((prev) => {
        if (prev >= path.length - 1) { clearInterval(iv); setDone(true); return prev; }
        return prev + 1;
      });
    }, 350);
    return () => clearInterval(iv);
  }, [path.length, replayKey, isCompare]);

  // ── Render ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvasSize; canvas.height = canvasSize;
    const half = CS / 2;
    const qtr = Math.max(CS / 4, 3);

    // Background
    ctx.fillStyle = BG_GRASS;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // ── Draw grid cells ──
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = PAD + x * CS, cy = PAD + y * CS;
        const cell = grid[y]?.[x] || ".";
        ctx.fillStyle = (x + y) % 2 === 0 ? GRASS_LIGHT : BG_GRASS;
        ctx.fillRect(cx, cy, CS, CS);
        ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 0.5;
        ctx.strokeRect(cx + 0.5, cy + 0.5, CS - 1, CS - 1);

        if (cell === "#") {
          ctx.fillStyle = FENCE_BG; ctx.fillRect(cx + 1, cy + 1, CS - 2, CS - 2);
          ctx.strokeStyle = "#5d4037"; ctx.lineWidth = Math.max(1, CS / 20);
          for (let fy = cy + qtr; fy < cy + CS - qtr; fy += qtr) {
            ctx.beginPath(); ctx.moveTo(cx + 2, fy); ctx.lineTo(cx + CS - 2, fy); ctx.stroke();
          }
          ctx.strokeStyle = "#4e342e"; ctx.lineWidth = Math.max(1.5, CS / 14);
          ctx.beginPath(); ctx.moveTo(cx + half, cy + 1); ctx.lineTo(cx + half, cy + CS - 1); ctx.stroke();
        } else if (cell === "G") {
          ctx.fillStyle = GOLD_BG; ctx.beginPath();
          ctx.arc(cx + half, cy + half, CS / 2.8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#f57f17"; ctx.lineWidth = Math.max(1.2, CS / 30); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(10, CS/3)}px sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", cx + half, cy + half);
        } else if (cell === "T") {
          ctx.fillStyle = TRAP_BG; ctx.beginPath();
          ctx.arc(cx + half, cy + half, CS / 2.8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#757575"; ctx.lineWidth = Math.max(0.5, CS / 40);
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
            ctx.beginPath(); ctx.moveTo(cx + half, cy + half);
            ctx.lineTo(cx + half + Math.cos(a) * CS / 3.5, cy + half + Math.sin(a) * CS / 3.5); ctx.stroke();
          }
          ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(8, CS/3.5)}px sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", cx + half, cy + half);
        }
      }
    }

    // ── Draw paths ──
    if (isCompare) {
      comparePaths!.forEach((cp, ci) => {
        const style = DUAL[ci % DUAL.length];
        const cpath = cp.path;
        // How many steps to show
        const maxI = isAnimated ? Math.min(animatedStep!, cpath.length - 1) : cpath.length - 1;
        if (maxI < 0) return;

        // Filled circles for visited cells
        const seen = new Set<string>();
        for (let i = 0; i <= maxI; i++) {
          const [px, py] = cpath[i];
          seen.add(`${px},${py}`);
        }
        for (const key of seen) {
          const [px, py] = key.split(",").map(Number);
          ctx.fillStyle = style.fill;
          ctx.beginPath(); ctx.arc(PAD + px * CS + half, PAD + py * CS + half, CS / 4.5, 0, Math.PI * 2); ctx.fill();
        }
        // Connecting lines
        if (maxI > 0) {
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = Math.max(1.5, CS / 16);
          ctx.setLineDash(style.dash);
          ctx.beginPath();
          ctx.moveTo(PAD + cpath[0][0] * CS + half, PAD + cpath[0][1] * CS + half);
          for (let i = 1; i <= maxI; i++) {
            ctx.lineTo(PAD + cpath[i][0] * CS + half, PAD + cpath[i][1] * CS + half);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Current position marker (last rendered step)
        const [lx, ly] = cpath[maxI];
        ctx.fillStyle = style.stroke;
        ctx.beginPath();
        ctx.arc(PAD + lx * CS + half, PAD + ly * CS + half, CS / 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, CS / 20); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(9, CS/3.5)}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(style.emoji, PAD + lx * CS + half, PAD + ly * CS + half + 1);

        // Action arrow at current position
        if (isAnimated && maxI > 0) {
          const [px, py] = cpath[maxI];
          const [prevPx, prevPy] = cpath[maxI - 1];
          const dx = px - prevPx, dy = py - prevPy;
          const aIdx = dx === -1 ? 0 : dx === 1 ? 1 : dy === -1 ? 2 : 3;
          const arrow = ACTION_ARROWS[aIdx];
          // Show arrow slightly offset from center
          ctx.fillStyle = style.stroke;
          ctx.font = `bold ${Math.max(14, CS/2.2)}px sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(arrow, PAD + px * CS + half, PAD + py * CS + half - 2);
        }
      });

      // Shared start marker
      const firstPath = comparePaths![0]?.path;
      if (firstPath && firstPath.length > 0) {
        const [sx, sy] = firstPath[0];
        ctx.fillStyle = BG_GRASS; ctx.beginPath();
        ctx.arc(PAD + sx * CS + half, PAD + sy * CS + half, CS / 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2e7d32";
        ctx.font = `bold ${Math.max(8, CS/4)}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("GO", PAD + sx * CS + half, PAD + sy * CS + half);
      }
    } else {
      // ── Single-path animated ──
      const displayStep = done ? path.length - 1 : Math.max(0, step);
      const pathSet = new Set<string>();
      for (let i = 0; i <= displayStep; i++) {
        const [px, py] = path[i] || [0, 0];
        pathSet.add(`${px},${py}`);
      }
      for (const key of pathSet) {
        const [px, py] = key.split(",").map(Number);
        ctx.fillStyle = PATH_COLOR;
        ctx.beginPath(); ctx.arc(PAD + px * CS + half, PAD + py * CS + half, CS / 4.5, 0, Math.PI * 2); ctx.fill();
      }
      if (displayStep >= 0 && path.length > 0) {
        const lastIdx = Math.min(displayStep, path.length - 1);
        const [rx, ry] = path[lastIdx] || [0, 0];
        const rcx = PAD + rx * CS + half, rcy = PAD + ry * CS + half;
        ctx.fillStyle = ROBOT_COLOR; ctx.beginPath(); ctx.arc(rcx, rcy, CS / 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, CS / 20); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(10, CS/2.5)}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🤖", rcx, rcy + 1);
      }
      if (path.length > 0) {
        const [sx, sy] = path[0];
        const scx = PAD + sx * CS + half, scy = PAD + sy * CS + half;
        ctx.fillStyle = BG_GRASS; ctx.beginPath(); ctx.arc(scx, scy, CS / 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2e7d32";
        ctx.font = `bold ${Math.max(8, CS/4)}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GO", scx, scy);
      }
    }
  }, [step, done, grid, size, path, comparePaths, animatedStep, isCompare, isAnimated, canvasSize, replayKey]);

  const handleReplay = () => setReplayKey((v) => v + 1);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="border-2 border-green-200 rounded-xl shadow-sm"
        style={{ width: canvasSize, height: canvasSize, maxWidth: "100%" }} />
      {!isCompare && path.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {!done ? <span>Moving {step + 1}/{path.length}</span> : <span>Reached goal ({path.length} steps)</span>}
          {done && <button onClick={handleReplay} className="px-3 py-1 bg-green-50 hover:bg-green-100 rounded-full text-xs font-medium text-green-700 border border-green-200">Replay</button>}
        </div>
      )}
      {!hideLegend && (
        <div className="flex gap-4 text-[10px] text-gray-400 flex-wrap">
          {isCompare ? (
            DUAL.slice(0, comparePaths?.length).map((d, i) => (
              <span key={d.label}>
                <span className="inline-block w-4 h-0.5 mr-1 align-middle"
                  style={{ background: d.stroke, borderTop: d.dash.length ? `2px dashed ${d.stroke}` : `2px solid ${d.stroke}` }} />
                {comparePaths?.[i]?.agent || d.label}
              </span>
            ))
          ) : (
            <>
              <span><span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle" style={{ background: FENCE_BG }} />Fence</span>
              <span><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: GOLD_BG }} />Gold</span>
              <span><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: TRAP_BG }} />Trap</span>
              <span><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: PATH_COLOR }} />Path</span>
              <span><span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: ROBOT_COLOR }} />Robot</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
