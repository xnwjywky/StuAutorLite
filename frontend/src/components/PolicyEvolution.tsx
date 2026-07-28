/**
 * Policy evolution timeline — Q-table snapshots as heatmap + arrows + explanation.
 *
 * Each snapshot renders an arrow for the best action and background color
 * whose intensity reflects the max Q-value. Below the heatmaps, an auto-generated
 * explanation describes the policy differences between Q-learning and SARSA.
 */
import { useState, useMemo } from "react";

interface QCell {
  best_action: number;
  max_q: number;
  q_values: number[];
}

interface QSnapshot {
  episode: number;
  agent: string;
  epsilon: number;
  cells: QCell[][];
}

interface Props {
  snapshots: QSnapshot[];
  gridSize: number;
  /** Optional world info for richer explanations (trap/gold positions) */
  world?: { traps?: [number, number][]; gold?: [number, number] };
}

const ACTION_ARROWS = ["←", "→", "↑", "↓"];
const ACTION_NAMES = ["left", "right", "up", "down"];
const AGENT_COLORS: Record<string, string> = { Q_LEARNING: "#1565c0", SARSA: "#2e7d32" };

function cellColor(maxQ: number, agent: string, globalQRange: [number, number]): string {
  const [qMin, qMax] = globalQRange;
  const range = qMax - qMin || 1;
  const t = Math.max(0, Math.min(1, (maxQ - qMin) / range));
  const base = AGENT_COLORS[agent] || "#666";
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const rr = Math.round(r + (255 - r) * (1 - t) * 0.7);
  const gg = Math.round(g + (255 - g) * (1 - t) * 0.7);
  const bb = Math.round(b + (255 - b) * (1 - t) * 0.7);
  return `rgb(${rr},${gg},${bb})`;
}

// ═══════════════════════════════════════════════════════════════
// Policy analysis — generate natural-language explanation
// ═══════════════════════════════════════════════════════════════

interface PolicyExplanation {
  title: string;
  summary: string;
  differences: string[];
  notableCells: string[];
}

function analyzePolicy(
  snaps: QSnapshot[],
  gridSize: number,
  world?: Props["world"],
): PolicyExplanation {
  if (snaps.length === 0) return { title: "", summary: "No data", differences: [], notableCells: [] };

  const ep = snaps[0].episode;
  const eps = snaps[0].epsilon;

  // Phase label
  let phase = "early (exploratory)";
  if (eps < 0.03) phase = "late (converged)";
  else if (eps < 0.08) phase = "middle (decaying exploration)";

  const title = `Episode ${ep} — ${phase}, ε=${eps.toFixed(3)}`;

  // Count action distributions
  const actionCounts: Record<string, Record<number, number>> = {};
  for (const snap of snaps) {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const row of snap.cells) {
      for (const cell of row) {
        counts[cell.best_action] = (counts[cell.best_action] || 0) + 1;
      }
    }
    actionCounts[snap.agent] = counts;
  }

  // Detect dominant direction per agent
  const getDominantDir = (counts: Record<number, number>) => {
    const max = Math.max(...Object.values(counts));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (max / total < 0.3) return "balanced (no dominant direction)";
    const dir = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const dirName = ACTION_NAMES[Number(dir[0])];
    return `predominantly ${dirName} (${Math.round(max / total * 100)}% of cells)`;
  };

  const differences: string[] = [];
  if (snaps.length >= 2) {
    const a = snaps[0], b = snaps[1];
    const aDom = getDominantDir(actionCounts[a.agent]);
    const bDom = getDominantDir(actionCounts[b.agent]);
    differences.push(`${a.agent === "Q_LEARNING" ? "Q-learning" : "SARSA"}: ${aDom}`);
    differences.push(`${b.agent === "Q_LEARNING" ? "Q-learning" : "SARSA"}: ${bDom}`);

    // Compare Q-value magnitudes
    let aTotalQ = 0, bTotalQ = 0, aCellCount = 0, bCellCount = 0;
    for (const row of a.cells) for (const c of row) { aTotalQ += Math.abs(c.max_q); aCellCount++; }
    for (const row of b.cells) for (const c of row) { bTotalQ += Math.abs(c.max_q); bCellCount++; }
    const aAvg = aTotalQ / aCellCount;
    const bAvg = bTotalQ / bCellCount;

    if (aAvg > bAvg * 1.3) {
      differences.push(`Q-learning has stronger Q-values (avg ${aAvg.toFixed(2)} vs ${bAvg.toFixed(2)}) — it optimistically assumes the best possible future, inflating values along perceived shortcuts.`);
    } else if (bAvg > aAvg * 1.3) {
      differences.push(`SARSA has stronger Q-values (avg ${bAvg.toFixed(2)} vs ${aAvg.toFixed(2)}) — it penalizes risky cells more because it accounts for actual exploration choices.`);
    }
  }

  // Analyze cells near world features
  const notableCells: string[] = [];
  if (world) {
    for (const snap of snaps) {
      const agentName = snap.agent === "Q_LEARNING" ? "Q-learning" : "SARSA";
      // Check cells adjacent to traps
      for (const [tx, ty] of (world.traps || []) as [number, number][]) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
          const nx = tx + dx, ny = ty + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            const cell = snap.cells[ny]?.[nx];
            if (cell) {
              const pointsTowardsTrap = (cell.best_action === 1 && dx === -1) || (cell.best_action === 0 && dx === 1) ||
                (cell.best_action === 3 && dy === -1) || (cell.best_action === 2 && dy === 1);
              if (pointsTowardsTrap && cell.max_q > 0.5) {
                notableCells.push(`${agentName} at (${nx},${ny}) still points toward a trap — off-policy optimism ignoring exploration risk.`);
              }
              const pointsAway = (cell.best_action === 0 && dx === -1) || (cell.best_action === 1 && dx === 1) ||
                (cell.best_action === 2 && dy === -1) || (cell.best_action === 3 && dy === 1);
              if (pointsAway && cell.max_q > 1) {
                notableCells.push(`${agentName} at (${nx},${ny}) actively avoids the trap — on-policy experience of negative reward made this direction dominant.`);
              }
            }
          }
        }
      }
    }
  }

  // Limit notable cells
  const uniqueNotable = [...new Set(notableCells)].slice(0, 4);

  // Summary
  const summary = snaps.length === 1
    ? `Single agent policy at episode ${ep}. ${getDominantDir(actionCounts[snaps[0].agent])}. Epsilon=${eps.toFixed(3)} means the agent ${eps > 0.05 ? "still explores randomly ~" + Math.round(eps * 100) + "% of the time" : "mostly exploits what it has learned"}.`
    : `Comparing Q-learning (off-policy) vs SARSA (on-policy) at episode ${ep}. ` +
      (eps > 0.05
        ? `With epsilon=${eps.toFixed(3)}, both agents still explore, but their Q-value updates already show divergence: Q-learning optimistically assumes optimal future moves (ignoring exploration risk), while SARSA updates based on actual moves taken (penalizing dangerous exploration).`
        : `With epsilon near 0, both agents exploit learned policies. Their behavioral differences are now crystallized: Q-learning takes the bold shortcut, SARSA takes the safe detour.`);

  return { title, summary, differences, notableCells: uniqueNotable };
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function PolicyEvolution({ snapshots, gridSize, world }: Props) {
  const allQ: number[] = [];
  for (const snap of snapshots) {
    for (const row of snap.cells) {
      for (const cell of row) {
        allQ.push(cell.max_q);
      }
    }
  }
  const qMin = allQ.length > 0 ? Math.min(...allQ) : 0;
  const qMax = allQ.length > 0 ? Math.max(...allQ) : 1;

  const byEpisode = new Map<number, QSnapshot[]>();
  for (const s of snapshots) {
    const list = byEpisode.get(s.episode) || [];
    list.push(s);
    byEpisode.set(s.episode, list);
  }
  const episodes = [...byEpisode.keys()].sort((a, b) => a - b);

  const [selectedEp, setSelectedEp] = useState(episodes[0] || 0);
  const currentSnaps = byEpisode.get(selectedEp) || [];

  const explanation = useMemo(
    () => analyzePolicy(currentSnaps, gridSize, world),
    [currentSnaps, gridSize, world],
  );

  const cellPixel = Math.max(18, Math.floor(280 / gridSize));

  return (
    <div className="flex flex-col gap-3">
      {/* Episode selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Episode:</span>
        {episodes.map(ep => (
          <button
            key={ep}
            onClick={() => setSelectedEp(ep)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedEp === ep ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {ep}
          </button>
        ))}
      </div>

      {/* Side-by-side heatmaps */}
      <div className="flex gap-4 flex-wrap justify-center">
        {currentSnaps.map(snap => (
          <div key={snap.agent} className="flex flex-col items-center gap-1">
            <span className="text-xs font-medium" style={{ color: AGENT_COLORS[snap.agent] }}>
              {snap.agent === "Q_LEARNING" ? "Q-learning" : "SARSA"}
              <span className="text-gray-400 ml-1">{'ε'}={snap.epsilon.toFixed(2)}</span>
            </span>
            <div
              className="grid border border-gray-200 rounded overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${gridSize}, ${cellPixel}px)` }}
            >
              {snap.cells.map((row, y) =>
                row.map((cell, x) => (
                  <div
                    key={`${y}-${x}`}
                    className="flex items-center justify-center font-bold border-r border-b border-gray-100/50"
                    style={{
                      width: cellPixel,
                      height: cellPixel,
                      backgroundColor: cellColor(cell.max_q, snap.agent, [qMin, qMax]),
                      fontSize: Math.max(10, cellPixel * 0.55),
                      color: cell.max_q > (qMin + qMax) / 2 ? "#fff" : "#333",
                    }}
                    title={`Q=[${cell.q_values.map(v=>v.toFixed(2)).join(",")}] best=${ACTION_ARROWS[cell.best_action]}`}
                  >
                    {ACTION_ARROWS[cell.best_action]}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Phase timeline labels */}
      <div className="flex justify-between text-[10px] text-gray-400 px-2">
        <span>Early (high { 'ε'})</span>
        <span>Middle ({'ε'} decays)</span>
        <span>Late ({'ε'} {'→'} 0)</span>
      </div>

      {/* ── Policy explanation ── */}
      <div className="bg-white border border-blue-100 rounded-lg p-3 text-xs leading-relaxed">
        <h4 className="font-semibold text-gray-700 mb-1.5">{explanation.title}</h4>
        <p className="text-gray-600 mb-2">{explanation.summary}</p>

        {explanation.differences.length > 0 && (
          <ul className="mb-2 space-y-0.5">
            {explanation.differences.map((d, i) => (
              <li key={i} className="text-gray-500 flex items-start gap-1.5">
                <span className="mt-0.5">{'•'}</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}

        {explanation.notableCells.length > 0 && (
          <div className="border-t border-gray-100 pt-2 mt-2">
            <span className="font-medium text-gray-600">Notable observations:</span>
            <ul className="mt-1 space-y-0.5">
              {explanation.notableCells.map((n, i) => (
                <li key={i} className="text-gray-500 flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">{'⚠'}</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
