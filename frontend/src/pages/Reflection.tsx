/** 反思改进 — 顶部导航预览页 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import { createSession } from "../api/service";

const QUESTIONS = [
  "你的结果是否支持最初假设？为什么？",
  "哪个算法表现最好？哪个最不稳定？",
  "有没有出现意外结果？你如何解释？",
  "如果重新设计实验，你会怎么改？",
  "你的实验有什么局限？",
];

export default function Reflection() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const goWorkbench = async () => {
    try { const s = await createSession(); navigate(`/workbench/${(s as any).id ?? `demo-${Date.now()}`}`); }
    catch { navigate(`/workbench/demo-${Date.now()}`); }
  };

  return (
    <Layout>
      <StageContainer step={7} title="反思与改进">
        <p className="text-sm text-gray-500">回顾整个研究过程，回答以下问题。这些反思是研究报告中最重要的部分。</p>
        {QUESTIONS.map((q, i) => (
          <div key={i} className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">{i + 1}. {q}</h3>
            <textarea className="w-full p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" rows={2}
              placeholder="写下你的想法..." value={answers[i] || ""}
              onChange={(e) => setAnswers((p) => ({ ...p, [i]: e.target.value }))} />
          </div>
        ))}

        <div className="card border-yellow-200 bg-yellow-50">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">AI 追问</h3>
          <p className="text-sm text-gray-600">你的结论是基于数据还是直觉？如果启发函数不准确，A* 还会表现好吗？这可以成为下一轮研究的问题。</p>
        </div>

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览。完整工作台可保存反思并自动生成研究报告。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
