/** 实验假设 — 顶部导航预览页 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import { createSession } from "../api/service";

const GUIDES = [
  "我认为 ______ 算法会表现更好，因为 ______。",
  "当迷宫变复杂时，我预测 ______。",
  "我认为搜索节点更少意味着 ______。",
];

export default function HypothesisForm() {
  const navigate = useNavigate();
  const [hypothesis, setHypothesis] = useState("");

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
      <StageContainer step={3} title="写出实验假设">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">句式引导</h2>
          <p className="text-sm text-gray-500 mb-3">在实验之前先预测结果。参考以下句式：</p>
          <div className="space-y-2">
            {GUIDES.map((g) => (
              <button key={g} onClick={() => setHypothesis((p) => p ? p + "\n" + g : g)}
                className="block w-full text-left px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{g}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">你的假设</h2>
          <textarea className="w-full min-h-[120px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
            placeholder="例如：我认为 A* 会比 BFS 更快，因为 A* 会优先朝终点方向搜索。"
            value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
        </div>

        {hypothesis.trim() && (
          <div className="card border-yellow-200 bg-yellow-50">
            <h3 className="font-semibold text-sm text-gray-700 mb-2">AI 追问</h3>
            <p className="text-sm text-gray-600">你说"表现更好"——具体是指路径更短、运行更快，还是搜索节点更少？不同的算法可能在这些方面各有优劣。</p>
          </div>
        )}

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览。前往完整工作台可保存假设并继续实验。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
