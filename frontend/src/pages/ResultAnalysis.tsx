/** 结果分析 — 顶部导航预览页 */
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import { createSession } from "../api/service";

const DEMO = [
  { algorithm: "BFS", success_rate: 100, path_length: 24.3, expanded_nodes: 91.2, runtime_ms: 31 },
  { algorithm: "DFS", success_rate: 80, path_length: 37.5, expanded_nodes: 68.4, runtime_ms: 26 },
  { algorithm: "A*", success_rate: 100, path_length: 24.3, expanded_nodes: 42.7, runtime_ms: 18 },
  { algorithm: "RANDOM", success_rate: 20, path_length: 89.6, expanded_nodes: 120, runtime_ms: 60 },
];

export default function ResultAnalysis() {
  const navigate = useNavigate();

  const goWorkbench = async () => {
    try { const s = await createSession(); navigate(`/workbench/${(s as any).id ?? `demo-${Date.now()}`}`); }
    catch { navigate(`/workbench/demo-${Date.now()}`); }
  };

  return (
    <Layout>
      <StageContainer step={6} title="分析结果">
        <ChartPanel data={DEMO} />

        <div className="card border-blue-100 bg-blue-50/30">
          <p className="font-medium text-gray-800 mb-3">📊 AI 分析摘要</p>
          <p className="text-sm text-gray-600 mb-3">A* 和 BFS 都能找到最短路径，但 A* 搜索节点仅为 BFS 的 47%，启发函数有效缩小了搜索范围。Random Walk 成功率仅 20%，体现了策略的价值。</p>
          <div className="border-t border-blue-100 pt-3">
            <p className="text-sm text-gray-500">1. 你的假设是否得到了数据支持？</p>
            <p className="text-sm text-gray-500">2. 为什么 A* 能用更少的节点找到相同路径？</p>
          </div>
        </div>

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览。完整工作台支持真实实验数据分析和保存。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
