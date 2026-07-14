/** 研究问题 — 顶部导航预览页 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import { createSession } from "../api/service";

const TEMPLATES = [
  "迷宫越复杂，哪种算法表现最好？",
  "A* 一定比 BFS 更快吗？",
  "DFS 为什么有时候会绕很远？",
  "随机策略和搜索算法差距有多大？",
];

export default function QuestionForm() {
  const navigate = useNavigate();
  const [interest, setInterest] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleSuggest = () => {
    if (!interest.trim()) return;
    setSuggestions([
      `在不同障碍物比例的迷宫中，${interest.includes("A*") ? "A*" : "A*"} 是否比 BFS 搜索节点更少、运行更快？`,
      "迷宫复杂度增加时，各种算法的运行时间有什么变化？",
      "哪种算法在保证找到最短路径的同时，搜索效率最高？",
    ]);
  };

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
      <StageContainer step={2} title="确定研究问题">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">可选问题模板</h2>
          <div className="grid gap-2">
            {TEMPLATES.map((t) => (
              <button key={t} onClick={() => setInterest(t)}
                className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${interest === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">用你自己的话描述</h2>
          <textarea className="w-full min-h-[80px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
            placeholder='例如：A* 是不是一直比 BFS 好？' value={interest}
            onChange={(e) => setInterest(e.target.value)} />
          <button className="btn-primary mt-3" onClick={handleSuggest}>AI 帮我生成研究问题</button>
        </div>

        {suggestions.length > 0 && (
          <div className="card border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-700 mb-3">AI 建议</h2>
            <div className="space-y-2">
              {suggestions.map((q, i) => (
                <div key={i} className="bg-white px-3 py-2 rounded-lg text-sm text-gray-700 border border-gray-100">{q}</div>
              ))}
            </div>
          </div>
        )}

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览。前往完整工作台可保存问题并继续后续流程。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
