/** 运行实验 — 顶部导航预览页 */
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import MazeVisualizer from "../components/MazeVisualizer";
import { createSession } from "../api/service";

const DEMO_GRID = (() => {
  const w = 10, h = 10;
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      if ((x === 0 && y === 0) || (x === w - 1 && y === h - 1)) grid[y][x] = 0;
      else if (x === 5 && y >= 1 && y <= 7) grid[y][x] = 1;
      else if (y === 5 && x >= 2 && x <= 7) grid[y][x] = 1;
      else grid[y][x] = 0;
    }
  }
  return grid;
})();

const DEMO_PATH: [number, number][] = [
  [0,0],[0,1],[0,2],[0,3],[0,4],[1,4],[2,4],[3,4],[4,4],
  [4,5],[4,6],[5,6],[6,6],[7,6],[7,7],[7,8],[7,9],[8,9],[9,9],
];

const DEMO_VISITED: [number, number][] = (() => {
  const v: [number, number][] = [];
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++)
      if (DEMO_GRID[y][x] === 0) v.push([x, y]);
  return v;
})();

export default function ExperimentRun() {
  const navigate = useNavigate();

  const goWorkbench = async () => {
    try {
      const s = await createSession();
      const sid = (s as any).id ?? `demo-${Date.now()}`;
      navigate(`/workbench/${sid}`);
    } catch {
      navigate(`/workbench/demo-${Date.now()}`);
    }
  };

  return (
    <Layout>
      <StageContainer step={5} title="运行实验">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">预演动画 — A* 算法在 10×10 迷宫中的搜索过程</h2>
          <MazeVisualizer
            grid={DEMO_GRID}
            path={DEMO_PATH}
            visited={DEMO_VISITED}
            runtimeMs={18}
            algorithm="A* (预览)"
          />
        </div>

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览动画。完整工作台支持真实后端 API、算法选择、批量实验和结果表格。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
