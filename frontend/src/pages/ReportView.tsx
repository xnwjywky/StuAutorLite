/** 研究报告 — 顶部导航预览页 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import { createSession } from "../api/service";

const DEFAULT_REPORT = [
  "# 迷宫寻路算法比较研究",
  "",
  "## 1. 研究问题",
  "在不同障碍物比例的迷宫中，A* 是否比 BFS 搜索节点更少、运行更快？",
  "",
  "## 2. 我的假设",
  "我认为 A* 会表现更好，因为它有方向感，优先朝终点方向搜索。",
  "",
  "## 3. 实验设计",
  "- 对比算法：BFS、DFS、A*、Random Walk",
  "- 迷宫大小：12×12",
  "- 障碍物比例：20%",
  "- 每组重复：5 次",
  "",
  "## 4. 实验结果",
  "| 算法 | 成功率 | 平均路径长度 | 平均搜索节点 | 平均运行时间 |",
  "|---|---:|---:|---:|---:|",
  "| BFS | 100% | 24.3 | 91.2 | 31ms |",
  "| DFS | 80% | 37.5 | 68.4 | 26ms |",
  "| A* | 100% | 24.3 | 42.7 | 18ms |",
  "| Random | 20% | 89.6 | 120 | 60ms |",
  "",
  "## 5. 结果分析",
  "A* 和 BFS 都找到了最短路径，但 A* 搜索节点仅为 BFS 的 47%。",
  "这说明启发函数有效缩小了搜索范围。",
  "",
  "## 6. 反思与改进",
  "实验只在一种障碍物比例下进行，后续可以对比不同比例的趋势。",
  "",
  "## 7. 总结",
  "A* 在本次实验中表现最优，兼顾了搜索效率和路径最优性。",
].join("\n");

export default function ReportView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const [content] = useState(DEFAULT_REPORT);

  // 如果有 sessionId，跳转到工作台
  if (sessionId) {
    navigate(`/workbench/${sessionId}`, { replace: true });
    return null;
  }

  const goWorkbench = async () => {
    try { const s = await createSession(); navigate(`/workbench/${(s as any).id ?? `demo-${Date.now()}`}`); }
    catch { navigate(`/workbench/demo-${Date.now()}`); }
  };

  return (
    <Layout>
      <StageContainer step={8} title="研究报告">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button>
              <button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-sm">AI 润色</button>
              <button className="btn-primary text-sm">导出 PDF</button>
            </div>
          </div>
          {preview ? (
            <div className="min-h-[400px] border rounded-lg p-4 bg-white">
              <pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm leading-relaxed">{content}</pre>
            </div>
          ) : (
            <textarea className="w-full min-h-[400px] p-4 border rounded-lg font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
              value={content} readOnly />
          )}
        </div>

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览报告。完整工作台可根据你的实验数据自动生成个性化报告。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
