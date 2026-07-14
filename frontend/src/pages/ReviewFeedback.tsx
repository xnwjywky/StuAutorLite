/** 审稿反馈 — 顶部导航预览页 */
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import StageContainer from "../components/StageContainer";
import { createSession } from "../api/service";

const DIMS = [
  { key: "question_clarity", label: "问题清晰度", desc: "研究问题是否明确", score: 4 },
  { key: "experiment_design", label: "实验设计", desc: "是否控制变量、设置对比", score: 4 },
  { key: "data_completeness", label: "数据完整性", desc: "是否有足够实验结果", score: 3 },
  { key: "analysis_depth", label: "分析深度", desc: "是否解释了原因", score: 3 },
  { key: "reflection_quality", label: "反思质量", desc: "是否指出局限和改进", score: 4 },
  { key: "writing_clarity", label: "表达清晰度", desc: "报告是否结构清楚", score: 4 },
];

export default function ReviewFeedback() {
  const navigate = useNavigate();

  const goWorkbench = async () => {
    try { const s = await createSession(); navigate(`/workbench/${(s as any).id ?? `demo-${Date.now()}`}`); }
    catch { navigate(`/workbench/demo-${Date.now()}`); }
  };

  return (
    <Layout>
      <StageContainer step={9} title="审稿反馈">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">多维评分预览</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DIMS.map((d) => (
              <div key={d.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-gray-700">{d.label}</span>
                  <p className="text-xs text-gray-400">{d.desc}</p>
                </div>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map((n) => (
                    <span key={n} className={`text-sm ${n <= d.score ? "text-yellow-500" : "text-gray-200"}`}>★</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card border-green-100 bg-green-50/30">
          <h3 className="font-semibold text-sm text-green-700 mb-2">✅ 优点示例</h3>
          <p className="text-sm text-gray-600">• 研究问题清楚，能够比较多个算法<br/>• 能发现路径长度和搜索节点数之间的区别</p>
        </div>

        <div className="card text-center py-6 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">此处为预览。完整工作台支持 AI 审稿和个性化反馈。</p>
          <button className="btn-primary" onClick={goWorkbench}>在完整工作台中体验 →</button>
        </div>
      </StageContainer>
    </Layout>
  );
}
