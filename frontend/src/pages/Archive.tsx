/** 研究档案 — 展示已完成的研究会话 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

interface ArchivedSession {
  id: string;
  title: string;
  taskId: string;
  completedAt: string;
  question: string;
  hypothesis: string;
  algorithms: string[];
  summary: Record<string, { success_rate: number; avg_expanded_nodes: number; avg_runtime_ms: number }> | null;
  analysis: string;
  reflection: Record<number, string>;
  report: string;
  review: Record<string, number> | null;
  avgReviewScore: number;
}

const STORAGE_KEY = "stuautor_archives";

function loadArchives(): ArchivedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** 将 Workbench 完成的会话保存到档案 */
export function archiveSession(data: {
  sessionId: number | null;
  taskId: string;
  question: string;
  hypothesis: string;
  algorithms: string[];
  summary: Record<string, any> | null;
  analysis: string;
  reflection: Record<number, string>;
  report: string;
  review: Record<string, number> | null;
}) {
  const archives = loadArchives();
  const avgScore = data.review
    ? Object.values(data.review).reduce((a, b) => a + b, 0) / Object.values(data.review).length
    : 0;
  archives.unshift({
    id: crypto.randomUUID(),
    title: data.question ? data.question.slice(0, 40) + (data.question.length > 40 ? "..." : "") : "迷宫寻路算法比较研究",
    taskId: data.taskId,
    completedAt: new Date().toISOString(),
    question: data.question,
    hypothesis: data.hypothesis,
    algorithms: data.algorithms,
    summary: data.summary as any,
    analysis: data.analysis,
    reflection: data.reflection,
    report: data.report,
    review: data.review,
    avgReviewScore: Math.round(avgScore * 10) / 10,
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(archives));
  return archives;
}

export { loadArchives };

// ═══════════════════════════════════════════════════════════
// 页面
// ═══════════════════════════════════════════════════════════

const REFLECTION_QUESTIONS = [
  "你的结果是否支持最初假设？为什么？",
  "哪个算法表现最好？哪个最不稳定？",
  "有没有出现意外结果？你如何解释？",
  "如果重新设计实验，你会怎么改？",
  "你的实验有什么局限（例如迷宫太小、次数太少）？",
];

export default function Archive() {
  const navigate = useNavigate();
  const archives = useMemo(() => loadArchives(), []);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (archives.length === 0) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">研究档案</h1>
            <button className="btn-primary" onClick={() => navigate("/")}>开始新研究</button>
          </div>
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">📂</div>
            <p className="text-gray-400 text-lg mb-2">还没有完成任何研究</p>
            <p className="text-gray-400 mb-6 text-sm">完成一次完整的科研流程后，报告将保存在这里</p>
            <button className="btn-primary" onClick={() => navigate("/")}>开始你的第一次研究 →</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">研究档案</h1>
            <p className="mt-1 text-gray-400 text-sm">共 {archives.length} 项已完成的研究</p>
          </div>
          <button className="btn-primary" onClick={() => navigate("/")}>开始新研究</button>
        </div>

        <div className="space-y-4">
          {archives.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800">{a.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{new Date(a.completedAt).toLocaleDateString("zh-CN")}</span>
                    <span>算法：{a.algorithms.join("、")}</span>
                    {a.avgReviewScore > 0 && (
                      <span className="text-yellow-600">★ {a.avgReviewScore}/5</span>
                    )}
                  </div>
                </div>
                <span className="text-gray-300 text-sm shrink-0 ml-4">{expanded === a.id ? "收起 ▲" : "展开 ▼"}</span>
              </div>

              {expanded === a.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 text-sm text-gray-600">
                  {a.question && (
                    <div>
                      <span className="font-medium text-gray-700">研究问题：</span>
                      {a.question}
                    </div>
                  )}
                  {a.hypothesis && (
                    <div>
                      <span className="font-medium text-gray-700">假设：</span>
                      {a.hypothesis}
                    </div>
                  )}
                  {a.summary && (
                    <div>
                      <span className="font-medium text-gray-700">实验结果：</span>
                      <div className="mt-1 overflow-x-auto">
                        <table className="text-xs border-collapse">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="pr-3 py-1 text-left">算法</th>
                              <th className="pr-3 py-1">成功率</th>
                              <th className="pr-3 py-1">平均节点</th>
                              <th className="pr-3 py-1">平均耗时</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(a.summary).map(([algo, stats]) => (
                              <tr key={algo}>
                                <td className="pr-3 py-0.5 font-medium">{algo}</td>
                                <td className="pr-3 py-0.5">{(stats.success_rate * 100).toFixed(0)}%</td>
                                <td className="pr-3 py-0.5">{stats.avg_expanded_nodes.toFixed(0)}</td>
                                <td className="pr-3 py-0.5">{stats.avg_runtime_ms.toFixed(1)}ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {a.analysis && (
                    <div>
                      <span className="font-medium text-gray-700">我的分析：</span>
                      {a.analysis}
                    </div>
                  )}
                  {Object.keys(a.reflection).length > 0 && (
                    <div>
                      <span className="font-medium text-gray-700">反思：</span>
                      {REFLECTION_QUESTIONS.map((q, i) => {
                        const ans = a.reflection[i];
                        if (!ans?.trim()) return null;
                        return (
                          <div key={i} className="mt-1 ml-2 text-xs">
                            <span className="text-gray-400">{q}</span>
                            <p className="text-gray-600 mt-0.5">{ans}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {a.review && (
                    <div>
                      <span className="font-medium text-gray-700">审稿评分：</span>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {Object.entries(a.review).map(([k, v]) => (
                          <span key={k} className="text-xs bg-gray-50 px-2 py-1 rounded">
                            {k}: {"★".repeat(v)}{"☆".repeat(5 - v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 报告全文预览 */}
                  {a.report && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <span className="font-medium text-gray-700 text-sm">报告全文：</span>
                      <pre className="mt-1 text-xs text-gray-500 whitespace-pre-wrap max-h-64 overflow-y-auto bg-gray-50 p-3 rounded-lg">{a.report}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
