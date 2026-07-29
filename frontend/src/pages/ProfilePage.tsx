/**
 * 科研能力画像
 *
 * 7 维度评分：问题提出 / 假设能力 / 实验设计 / 算法理解 / 数据分析 / 反思能力 / 表达能力
 * 每次完成研究会话后根据档案数据重新计算：
 * - 统计已完成的会话数、各 task 类型数、Review 平均分等
 * - 各维度分数 = 基础分（会话数）+ Review 加权 + task 多样性加权
 * - 总分不超过上限 5，档案越多分数越接近真实水平
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { loadArchives } from "./Archive";

const CAP = 5;

const DIMENSIONS = [
  { key: "question",   label: "问题提出", desc: "能否提出清楚问题",          hint: "是否能说清研究对象和比较目标" },
  { key: "hypothesis", label: "假设能力", desc: "能否提前预测结果",          hint: "是否能说明预测理由" },
  { key: "design",     label: "实验设计", desc: "能否设计公平实验",          hint: "是否控制变量、设置指标" },
  { key: "algorithm",  label: "算法理解", desc: "是否理解算法差异",          hint: "是否能解释算法优缺点" },
  { key: "analysis",   label: "数据分析", desc: "是否能读懂结果",            hint: "是否能从表格和图中发现规律" },
  { key: "reflection", label: "反思能力", desc: "是否能发现局限",            hint: "是否能提出改进实验" },
  { key: "expression", label: "表达能力", desc: "是否能写清报告",            hint: "报告结构是否完整" },
] as const;

const STORAGE_KEY = "stuautor_profile";
const TASK_LABELS: Record<string, string> = {
  maze: "迷宫寻路", classify: "图像分类", guess: "猜数字", sort: "排序算法",
  stringsearch: "字符串搜索", imagerecog: "图像识别", mnist_cnn: "MNIST CNN", rl_gridworld: "强化学习",
};

/** 从所有档案重新计算画像分数（每次进入页面或完成会话时调用） */
function computeScoresFromArchives(): Record<string, number> {
  const archives = loadArchives();
  const n = archives.length;
  if (n === 0) return {};

  // 收集统计
  const taskSet = new Set(archives.map(a => a.taskId));
  const avgReview = archives.reduce((sum, a) => sum + (a.avgReviewScore || 0), 0) / n;
  const hasAnalysis = archives.filter(a => (a.analysis || "").length > 10).length;
  const hasReflection = archives.filter(a => Object.keys(a.reflection || {}).length > 0).length;
  const hasHypothesis = archives.filter(a => (a.hypothesis || "").length > 5).length;
  const reportLengthSum = archives.reduce((sum, a) => sum + Math.min((a.report || "").length, 5000), 0) / Math.max(n, 1);

  // 基础分：每完成一个会话 +0.15，最多贡献 2.5 分
  const baseSession = Math.min(2.5, n * 0.15);
  // review 分：review 均分 / 5 * 1.0，最多 1.0 分
  const reviewBonus = Math.min(1.0, (avgReview / 5) * 1.0);
  // 多样性分：不同 task 类型数 * 0.3，最多 1.5 分
  const diversityBonus = Math.min(1.5, taskSet.size * 0.3);

  return {
    question:   clamp(baseSession + (n >= 1 ? 0.3 : 0)),
    hypothesis: clamp(baseSession + (hasHypothesis / Math.max(n, 1)) * 1.0),
    design:     clamp(baseSession + diversityBonus * 0.6 + reviewBonus * 0.8),
    algorithm:  clamp(baseSession + diversityBonus),
    analysis:   clamp(baseSession + (hasAnalysis / Math.max(n, 1)) * 1.0 + reviewBonus * 0.6),
    reflection: clamp(baseSession + (hasReflection / Math.max(n, 1)) * 1.2),
    expression: clamp(baseSession + (reportLengthSum / 2000) * 0.8 + reviewBonus * 0.5),
  };
}

function clamp(v: number) { return Math.min(CAP, Math.max(0, Math.round(v * 10) / 10)); }

function persistScores(s: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const scores = useMemo(() => {
    const computed = computeScoresFromArchives();
    persistScores(computed);  // sync to localStorage
    return computed;
  }, []);
  const hasData = Object.values(scores).some((s) => s > 0);
  const avg = hasData ? (Object.values(scores).reduce((a, b) => a + b, 0) / 7) : 0;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">科研能力画像</h1>
          <p className="mt-2 text-gray-500">系统根据你的研究表现持续更新各项能力评分</p>
        </div>

        {!hasData ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">🧠</div>
            <p className="text-gray-400 text-lg mb-2">还没有能力数据</p>
            <p className="text-gray-400 mb-6 text-sm max-w-md mx-auto">完成至少一次完整的科研流程后，系统将根据你的表现自动生成科研能力画像。</p>
            <button className="btn-primary" onClick={() => navigate("/")}>开始第一次研究 →</button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 整体评分卡片 */}
            <div className="card flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-gray-900 flex items-center justify-center text-white shrink-0">
                <div className="text-center"><span className="text-3xl font-bold">{avg.toFixed(1)}</span><p className="text-[10px] opacity-60">/5</p></div>
              </div>
              <div>
                <h2 className="font-semibold text-gray-800 text-lg">综合科研能力</h2>
                <p className="text-sm text-gray-400 mt-1">完成研究后自动更新</p>
              </div>
            </div>

            {/* 雷达图 */}
            <div className="card">
              <h2 className="font-semibold text-gray-700 mb-4">能力雷达图</h2>
              <div className="flex justify-center overflow-x-auto">
                <RadarChart scores={scores} dimensions={DIMENSIONS as any} />
              </div>
            </div>

            {/* 各维度详情 */}
            <h2 className="font-semibold text-gray-700">各维度详情</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DIMENSIONS.map((d) => {
                const s = scores[d.key] || 0;
                return (
                  <div key={d.key} className="card">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium text-gray-800 text-sm">{d.label}</h3>
                        <p className="text-xs text-gray-400">{d.desc}</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0 ml-3">
                        {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`text-sm ${n <= s ? "text-yellow-500" : "text-gray-200"}`}>★</span>)}
                      </div>
                    </div>
                    {/* 进度条 */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                      <div className="bg-yellow-500 h-1.5 rounded-full transition-all" style={{ width: `${(s / 5) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-300">{d.hint}</p>
                  </div>
                );
              })}
            </div>

            {/* 统计信息 */}
            {(() => {
              const archives = loadArchives();
              const n = archives.length;
              const tasks = [...new Set(archives.map(a => TASK_LABELS[a.taskId] || a.taskId))];
              const avgReview = n > 0 ? (archives.reduce((s, a) => s + (a.avgReviewScore || 0), 0) / n).toFixed(1) : "0";
              return (
                <div className="card border-blue-100 bg-blue-50/30">
                  <h3 className="font-semibold text-sm text-gray-700 mb-2">画像计算依据</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="text-center"><p className="text-2xl font-bold text-gray-800">{n}</p><p className="text-[10px] text-gray-400">完成实验</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-gray-800">{tasks.length}</p><p className="text-[10px] text-gray-400">任务类型</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-gray-800">{avgReview}</p><p className="text-[10px] text-gray-400">平均审稿分</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-gray-800">{Math.min(CAP, (n * 0.15 + tasks.length * 0.3 + Number(avgReview) / 5 * 1.0)).toFixed(1)}</p><p className="text-[10px] text-gray-400">评分上限参考</p></div>
                  </div>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>• 每次完成实验累计基础分（{n} × 0.15 = {(n * 0.15).toFixed(1)}，上限 2.5）</li>
                    <li>• 尝试不同任务类型加分（{tasks.length} 种 × 0.3 = {(tasks.length * 0.3).toFixed(1)}，上限 1.5）</li>
                    <li>• Review 评分加权（均分 {avgReview}/5，上限 1.0）</li>
                    <li>• 各维度不超过上限 {CAP} 分，当前综合均分 {avg.toFixed(1)}/5</li>
                  </ul>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════
// SVG 雷达图 — 响应式宽高
// ═══════════════════════════════════════════════════════════

function RadarChart({ scores, dimensions }: { scores: Record<string, number>; dimensions: { key: string; label: string }[] }) {
  const n = dimensions.length;
  const S = 520, cx = S / 2, cy = S / 2, r = 150;
  const angleStep = (2 * Math.PI) / n;
  const offset = -Math.PI / 2;

  const xy = (i: number, val: number) => {
    const a = offset + i * angleStep;
    return { x: cx + (val / 5) * r * Math.cos(a), y: cy + (val / 5) * r * Math.sin(a) };
  };

  const gridLevels = [1, 2, 3, 4, 5];
  const pts = dimensions.map((d, i) => xy(i, scores[d.key] || 0));
  const dataPath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[500px] h-auto">
      {/* 网格 */}
      {gridLevels.map((lv) => {
        const gpts = dimensions.map((_, i) => xy(i, lv));
        const gp = gpts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
        return <path key={lv} d={gp} fill="none" stroke="#e5e7eb" strokeWidth="1" />;
      })}
      {/* 轴线 */}
      {dimensions.map((_, i) => { const o = xy(i, 5); return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#e5e7eb" strokeWidth="0.5" />; })}
      {/* 数据 */}
      <path d={dataPath} fill="rgba(37, 99, 235, 0.12)" stroke="#2563eb" strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#2563eb" />)}
      {/* 标签 — 放在网格边界外 */}
      {dimensions.map((d, i) => {
        const labelP = xy(i, 6.2);
        const anchor = labelP.x < cx - 40 ? "end" : labelP.x > cx + 40 ? "start" : "middle";
        return <text key={i} x={labelP.x} y={labelP.y} textAnchor={anchor} dominantBaseline="middle" className="fill-gray-700" fontSize="14" fontWeight="500" fontFamily="system-ui, sans-serif">{d.label}</text>;
      })}
      {/* 中心 */}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-gray-400" fontSize="12" fontFamily="system-ui, sans-serif">
        {Object.values(scores).reduce((a, b) => a + b, 0) / dimensions.length < 0.3 ? "暂无" : `${(Object.values(scores).reduce((a, b) => a + b, 0) / dimensions.length).toFixed(1)}/5`}
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
export function updateProfileScores(_delta?: Record<string, number>) {
  const computed = computeScoresFromArchives();
  persistScores(computed);
}
