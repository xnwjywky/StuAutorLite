/**
 * 图像分类研究工作台 — 9 阶段完整流程（镜像 Workbench.tsx）
 * 复用: Layout, FlowStepper, StageContainer, ChartPanel, AlgorithmCard
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import AlgorithmCard from "../components/AlgorithmCard";
import DecisionBoundary from "../components/DecisionBoundary";
import { useClassificationStore } from "../stores/classificationStore";
import {
  runClassificationExperiment,
  callMentor, callDataAnalyst, callReviewer, callGeneralLLM,
  hasAgentConfig, logAgentError,
  generateReflectionQuestions, getReflectionQuestions, saveReflectionAnswer,
  saveQuestion, saveAnalysis, analyzeResults,
  type ReflectionQuestion,
} from "../api/service";
import { archiveSession } from "./Archive";
import { updateProfileScores } from "./ProfilePage";
import type { ResearchStage, ClassifierType, ClassifyMetricType, DataPattern } from "../types";

// ═══════════════════════════════════════════════════════════
const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REFLECTION_COMPLETED",label: "反思改进" },
  { key: "REPORT_GENERATED",    label: "生成报告" },
  { key: "REVIEW_COMPLETED",    label: "获得审稿反馈" },
];

const QUESTION_TEMPLATES = [
  "训练数据越多，分类准确率一定越高吗？",
  "增加噪声对 KNN 和决策树谁的影响更大？",
  "决策树是不是总比随机猜测好？",
  "KNN 的 K 值越大越好还是越小越好？",
  "圆形数据和分堆数据，哪个更难分类？",
];
const REFLECTION_QUESTIONS = [
  "你的结果是否支持最初假设？为什么？",
  "哪种分类器在噪声较低的数据上表现最好？哪种最稳定？",
  "有没有出现意外结果？你如何解释？",
  "如果换成圆形数据，你的结论还会一样吗？",
  "你的实验有什么局限（例如数据量太小、只测试了一种分布）？",
];
const CLASSIFIERS: { key: ClassifierType; name: string; description: string; pros: string[]; cons: string[] }[] = [
  { key: "KNN", name: "KNN", description: "看邻居的标签来投票决定", pros: ["直观易懂","无需训练"], cons: ["数据量大时较慢","对噪声敏感"] },
  { key: "DECISION_TREE", name: "决策树", description: "像是一串 是/否 问题来归类", pros: ["可解释性强","处理非线性"], cons: ["容易过拟合","对数据变化敏感"] },
  { key: "RANDOM", name: "随机分类", description: "随便猜，用作对比 baseline", pros: ["简单直观","体现分类器价值"], cons: ["准确率低"] },
];

const CLASSIFIER_INFO: Record<string, { explanation: string; analogy: string; pros: string[]; cons: string[]; key_points: string[]; pseudocode?: string }> = {
  KNN: {
    explanation: `KNN 就像问邻居「你们都是什么类别？」——当你需要判断一个新数据的类别时，KNN 会找出离它最近的 K 个已知数据点，然后让它们投票决定。K 的取值会影响结果：K 太小容易被噪声干扰，K 太大会过于保守。`,
    analogy: "就像你想知道一个陌生人是什么性格，你会去问 TA 最亲近的几个朋友。如果 3 个朋友里有 2 个说 TA 很开朗，你就判断 TA 是开朗型。",
    pros: ["直观易懂，无需训练过程", "能处理任意形状的决策边界", "只有一个超参数 K"],
    cons: ["预测时需要计算所有训练数据的距离", "对噪声和异常值敏感", "K 值选择影响很大"],
    key_points: ["基于距离的最近邻投票", "K 值：小→灵活但易受噪声影响", "欧氏距离计算", "惰性学习器（无训练过程）"],
  },
  DECISION_TREE: {
    explanation: "决策树就像玩「20 问」游戏——通过一系列 是/否 问题逐步缩小范围。每个节点选择一个特征和一个阈值来分割数据，每次分割都让同类的数据更集中。树的深度越大，分割越精细，但也越容易过拟合。",
    analogy: "就像你用「超过 5 厘米吗？」和「是红色的吗？」两个问题逐步识别水果。问题顺序和阈值决定了你能多快找到正确答案。",
    pros: ["可解释性强——能看到每步的决策", "能自动发现特征间的非线性关系", "可视化后非常直观"],
    cons: ["容易过拟合（树太深会记住训练数据）", "对数据变化敏感", "只能做轴对齐的分割"],
    key_points: ["每层选最优特征+阈值进行分割", "使用 Gini 不纯度衡量分割质量", "max_depth 控制复杂度", "轴对齐的分割线"],
  },
  RANDOM: {
    explanation: "随机分类器完全没有学习能力——它只是随机猜测一个类别。它的作用是作为对照组 baseline，让我们看到有学习能力的分类器到底好多少。",
    analogy: "就像闭着眼睛扔硬币决定答案——不管数据长什么样，永远靠运气。",
    pros: ["简单直观", "帮助衡量其他分类器的价值"],
    cons: ["准确率接近随机水平（2分类约50%）", "毫无实用价值"],
    key_points: ["不接受任何训练", "预测完全随机", "用作弱 baseline 对照"],
  },
};
const METRICS: { key: ClassifyMetricType; label: string }[] = [
  { key: "accuracy", label: "准确率" }, { key: "precision", label: "精确率" },
  { key: "recall", label: "召回率" }, { key: "f1", label: "F1 分数" },
];
const SAMPLE_SIZES = [100, 200, 400];
const NOISE_LEVELS = [0.0, 0.05, 0.1, 0.2];
const PATTERNS: { key: DataPattern; label: string }[] = [
  { key: "blobs", label: "分堆数据" }, { key: "circles", label: "圆形数据" }, { key: "moons", label: "月牙数据" },
];
const TRAIN_RATIOS = [0.6, 0.7, 0.8];
const K_VALUES = [1, 3, 5, 7];
const MAX_DEPTHS = [2, 3, 4, 5, 99]; // 99 = unlimited

// ═══════ 通用 Agent 调用器（复用 Workbench.tsx 模式）═══════
type AgentCallResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(
  agentName: string, stage: string,
  fn: () => Promise<{ result?: unknown } | null>,
): Promise<AgentCallResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent（请在 ⚙️ Agent 配置页面添加 API Key）", agentName };
  try {
    const resp = await fn();
    const result = resp?.result as Record<string, unknown> | undefined;
    if (result?.error) { const msg = String(result.error); logAgentError(agentName, stage, msg); return { ok: false, error: msg, agentName }; }
    if (result && Object.keys(result).length > 0) return { ok: true, data: result };
    const err = `${agentName} 返回了空结果，已使用模板替代`; logAgentError(agentName, stage, err); return { ok: false, error: err, agentName };
  } catch (e: any) { const msg = `${agentName} 请求失败: ${e?.message || String(e)}`; logAgentError(agentName, stage, msg); return { ok: false, error: msg, agentName }; }
}

// ═══════════════════════════════════════════════════════════
export default function ClassificationWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useClassificationStore();
  useEffect(() => { const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id); }, [sessionId]);
  if (store.sessionId === null) return null;
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">图像分类算法研究</p>
          <FlowStepper steps={STEPS} current={store.currentStage} onStepClick={(s) => {
            if (s === "TASK_SELECTED") { store.setStage("TASK_SELECTED"); return; }
            const stageKeys = STEPS.map(st => st.key);
            if (!store.refinedQuestion) { store.setStage("TASK_SELECTED"); return; }
            if (stageKeys.indexOf(s) > stageKeys.indexOf("EXPERIMENT_DESIGNED") && !store.designCompleted) store.setStage("EXPERIMENT_DESIGNED");
            else store.setStage(s);
          }} />
        </aside>
        <div className="flex-1 overflow-auto bg-gray-50"><StageRouter /></div>
      </div>
    </Layout>
  );
}

function StageRouter() {
  const stage = useClassificationStore((s) => s.currentStage);
  switch (stage) {
    case "EXPERIMENT_DESIGNED": return <Stage4 />;
    case "EXPERIMENT_RUNNING":  return <Stage5 />;
    case "RESULT_ANALYZED":     return <Stage6 />;
    case "REFLECTION_COMPLETED":return <Stage7 />;
    case "REPORT_GENERATED":    return <Stage8 />;
    case "REVIEW_COMPLETED":    return <Stage9 />;
    default: return <TaskAndQuestion />;
  }
}

// ═══════ 统一任务选择 + 研究问题 + 流程预览 ═══════
function TaskAndQuestion() {
  const store = useClassificationStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const result = await callAgent("research_mentor", "研究问题", () =>
      callMentor({ task: "图像分类", student_input: store.rawQuestion, grade_level: "beginner" }));
    if (result.ok) store.set({ suggestedQuestions: (result.data as any).suggested_questions || [] });
    else { store.set({ suggestedQuestions: classifyFallback(store.rawQuestion) }); setMsg({ text: result.error, ok: false }); }
    setLoading(false);
  };

  const handleSelectQuestion = async (q: string) => {
    store.set({ refinedQuestion: q, rawQuestion: q });
    try { await saveQuestion({ session_id: store.sessionId!, raw_question: q, refined_question: q, independent_variable: "噪声水平", dependent_variables: ["准确率", "F1 分数"], controlled_variables: ["数据量", "数据分布"] }); } catch {}
  };

  const handleConfirm = () => {
    store.set({ designCompleted: false, experimentResult: null });
    store.setStage("EXPERIMENT_DESIGNED");
  };

  const selectedQ = store.refinedQuestion;
  const flowItems = selectedQ ? buildFlowPreview(store) : null;
  const hasSuggestions = store.suggestedQuestions.length > 0;

  return (
    <StageContainer step={1} title="选择研究任务" agent={msg}>
      <div className="card">
        <h3 className="font-semibold mb-2">🖼️ 图像分类算法研究</h3>
        <p className="text-sm text-gray-500">学习 KNN 和决策树如何对数据进行分类，研究数据量和噪声对分类效果的影响。</p>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">选择或输入你想研究的问题</h2>
        <div className="grid gap-2 mb-3">{QUESTION_TEMPLATES.map((t) => (
          <button key={t} onClick={() => handleSelectQuestion(t)}
            className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedQ === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>
        ))}</div>
        <textarea className="w-full min-h-[60px] p-3 border rounded-lg text-sm resize-y" placeholder="或用你自己的话描述：KNN 是不是比决策树更准确？"
          value={store.rawQuestion} onChange={(e) => store.set({ rawQuestion: e.target.value })} />
        <button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化"}</button>
        {hasSuggestions && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <h3 className="font-semibold text-gray-700 text-sm mb-2">AI 建议的研究问题（点击选择）</h3>
            <div className="space-y-1">{store.suggestedQuestions.map((q, i) => (
              <button key={i} onClick={() => handleSelectQuestion(q)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedQ === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-100"}`}>{q}</button>
            ))}</div>
          </div>
        )}
      </div>

      {selectedQ && (
        <>
          <div className="card border-blue-200 bg-blue-50/50">
            <h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题</h3>
            <p className="text-sm text-gray-800 font-medium">{selectedQ}</p>
          </div>
          {flowItems && (
            <div className="card border-green-100 bg-green-50/30">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">📋 研究流程预览</h3>
              <div className="space-y-2">{flowItems.map((item, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="w-24 text-gray-400 shrink-0">{item.stage}</span>
                  <span className="text-gray-600">{item.output}</span>
                </div>
              ))}</div>
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleConfirm}>确认 → 设计实验</button>
          </div>
        </>
      )}
    </StageContainer>
  );
}

function buildFlowPreview(store: ReturnType<typeof useClassificationStore.getState>) {
  return [
    { stage: "选择研究任务", output: "图像分类算法研究 — 对比不同分类器在 2D 数据上的表现" },
    { stage: "设计实验", output: `选择分类器 / 数据量(${store.nSamples}) / 噪声(${(store.noiseLevels[0]*100).toFixed(0)}%) / 重复 ${store.numTrials} 次` },
    { stage: "运行实验", output: `生成 2D 数据 → 分类器训练 → 渲染决策边界 → 分类测试数据` },
    { stage: "分析结果", output: `对比准确率、精确率、召回率、F1 → 验证假设` },
    { stage: "反思改进", output: "回答反思问题 → 发现实验局限 → 提出改进方案" },
    { stage: "生成报告", output: "自动生成包含数据表格的 Markdown 报告" },
    { stage: "获得审稿反馈", output: "AI 审稿人 6 维评分 + 修改建议" },
  ];
}
// ═══════ Stage 4 — 设计实验 ═══════
function Stage4() {
  const store = useClassificationStore();
  const [infoClf, setInfoClf] = useState<string | null>(null);
  const toggleClf = (c: typeof CLASSIFIERS[0]) => { const arr = store.selectedClassifiers; if (arr.includes(c.key)) { store.set({ selectedClassifiers: arr.filter((a) => a !== c.key) }); if (infoClf === c.key) setInfoClf(null); } else { store.set({ selectedClassifiers: [...arr, c.key] }); setInfoClf(c.key); } };
  const toggleMetric = (m: ClassifyMetricType) => { const arr = store.selectedMetrics; store.set({ selectedMetrics: arr.includes(m) ? arr.filter((x) => x !== m) : [...arr, m] }); };
  const info = infoClf ? CLASSIFIER_INFO[infoClf] ?? null : null;
  const depthLabel = (d: number) => d === 99 ? "不限" : String(d);

  return (
    <StageContainer step={4} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }}>下一步 → 运行实验</button></div>}>
      {/* 分类器选择 */}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">我要比较的分类器 {store.selectedClassifiers.length === 0 && <span className="text-xs font-normal text-gray-400">（请至少选择一个）</span>}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CLASSIFIERS.map((c) => <AlgorithmCard key={c.key} name={c.name} description={c.description} selected={store.selectedClassifiers.includes(c.key)} onToggle={() => toggleClf(c)} />)}
        </div>
      </div>

      {/* 分类器原理 */}
      {info && (
        <div className="card border-blue-200 bg-blue-50/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">{infoClf === "DECISION_TREE" ? "决策树" : infoClf} 算法原理</h2>
            <button onClick={() => setInfoClf(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <p className="text-sm text-gray-600 mb-3">{info.explanation}</p>
          <div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {info.analogy}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {info.key_points.map((p: string) => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {info.pros.map((p) => <span key={p} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ {p}</span>)}
            {info.cons.map((p) => <span key={p} className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠️ {p}</span>)}
          </div>
        </div>
      )}

      {/* 超参数 */}
      {store.selectedClassifiers.includes("KNN") && (
        <div className="card border-blue-100 bg-blue-50/30"><h3 className="font-semibold text-gray-700 mb-2 text-sm">🔢 KNN 的 K 值（看几个邻居）</h3><div className="flex gap-2">{K_VALUES.map((k) => <button key={k} onClick={() => store.set({ kValue: k })} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${store.kValue === k ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>K={k}</button>)}</div></div>
      )}
      {store.selectedClassifiers.includes("DECISION_TREE") && (
        <div className="card border-green-100 bg-green-50/30"><h3 className="font-semibold text-gray-700 mb-2 text-sm">🌳 决策树最大深度</h3><div className="flex gap-2">{MAX_DEPTHS.map((d) => <button key={d} onClick={() => store.set({ maxDepth: d })} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${store.maxDepth === d ? "bg-green-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>深度 {depthLabel(d)}</button>)}</div></div>
      )}

      {/* 数据参数 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数据量</h3><div className="space-y-1">{SAMPLE_SIZES.map((n) => <button key={n} onClick={() => store.set({ nSamples: n })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.nSamples === n ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{n} 个点</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">噪声水平</h3><div className="space-y-1">{NOISE_LEVELS.map((n) => <button key={n} onClick={() => store.set({ noiseLevels: [n] })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.noiseLevels[0] === n ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{(n * 100).toFixed(0)}%</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数据分布</h3><div className="space-y-1">{PATTERNS.map((p) => <button key={p.key} onClick={() => store.set({ patterns: [p.key] })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.patterns[0] === p.key ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{p.label}</button>)}</div></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">每次重复实验</h3><div className="space-y-1">{[1, 3, 5].map((t) => <button key={t} onClick={() => store.set({ numTrials: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">训练数据比例</h3><div className="space-y-1">{TRAIN_RATIOS.map((r) => <button key={r} onClick={() => store.set({ trainRatio: r })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.trainRatio === r ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{(r * 100).toFixed(0)}%</button>)}</div></div>
      </div>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-2 text-sm">我要观察的指标</h2><div className="flex flex-wrap gap-2">{METRICS.map((m) => <button key={m.key} onClick={() => toggleMetric(m.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${store.selectedMetrics.includes(m.key) ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"}`}>{m.label}</button>)}</div></div>
    </StageContainer>
  );
}

// ═══════ Stage 5 — 运行实验 ═══════
function Stage5() {
  const store = useClassificationStore();
  const [running, setRunning] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState(1);
  const [runError, setRunError] = useState<string | null>(null);

  const execRun = async () => {
    setRunning(true); setRunError(null);
    const clfs = store.selectedClassifiers.length > 0 ? store.selectedClassifiers : ["KNN", "DECISION_TREE", "RANDOM"];
    try {
      const settings: Record<string, unknown> = {
        n_samples: store.nSamples, noise_levels: store.noiseLevels, patterns: store.patterns,
        num_trials: store.numTrials, train_ratio: store.trainRatio,
        k_value: store.kValue, max_depth: store.maxDepth === 99 ? 10 : store.maxDepth,
        seed: (Date.now() % 9000) + 1000,
      };
      const data = await runClassificationExperiment({ session_id: store.sessionId!, classifiers: clfs, settings });
      store.set({ experimentResult: data as any, selectedRunIdx: 0 });
      setRunError(null);
    } catch (e: any) {
      setRunError(`后端请求失败: ${e?.message || String(e)}\n请确认后端已启动 (cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000)`);
    } finally { setRunning(false); }
  };

  useEffect(() => { if (!store.experimentResult) execRun(); }, []);

  const result = store.experimentResult;
  const displayRuns = result?.runs
    ? result.runs.filter((r: any) => r.trial === selectedTrial).sort((a: any, b: any) => String(a.classifier).localeCompare(String(b.classifier)))
    : [];

  return (
    <StageContainer step={5} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}>
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="font-semibold">实验配置</h2>
            <p className="text-sm text-gray-400">分类器：{store.selectedClassifiers.join("、") || "KNN、决策树、随机"} | {store.nSamples} 点 | 噪声 {(store.noiseLevels[0] * 100).toFixed(0)}% | {PATTERNS.find(p => p.key === store.patterns[0])?.label} | ×{store.numTrials} 次</p>
          </div>
          <button className="btn-primary text-lg px-6" onClick={execRun} disabled={running}>{running ? "⏳ 运行中..." : result ? "🔄 重新运行" : "▶ 开始实验"}</button>
        </div>
        {result && store.numTrials > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">切换组别：</span>
            {Array.from({ length: store.numTrials }, (_, i) => i + 1).map((t) => (
              <button key={t} onClick={() => setSelectedTrial(t)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedTrial === t ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>第{t}组</button>
            ))}
          </div>
        )}
      </div>

      {/* 后端错误提示 */}
      {runError && !result && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 mb-1">运行失败</p>
          <pre className="text-xs text-red-600 whitespace-pre-wrap">{runError}</pre>
        </div>
      )}

      {/* 各分类器决策边界（每个独立动画，与迷宫一致） */}
      {result && displayRuns.length > 0 && (
        <>
          {/* 决策边界说明 */}
          <div className="card border-blue-100 bg-blue-50/30">
            <h3 className="font-semibold text-sm text-gray-700 mb-1">📖 如何看懂下面的网格图？</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              彩色<strong>背景区域</strong> = 决策边界（分类器"认为"该区域属于哪个类别）。
              每个<strong>圆点</strong> = 一个数据样本（{store.nSamples}个），颜色 = <strong>真实类别</strong>。
              圆点颜色与背景一致 = 分类正确。右上角数字 = <strong>正确/总数</strong>。
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayRuns.map((r: any) => {
            // 使用后端返回的 n_train（与重排后的数据一致），前端 trainRatio 作为 fallback
            const nTrain = r.n_train ?? Math.floor((r.points?.length || 0) * store.trainRatio);
            const nTest = (r.points?.length || 0) - nTrain;
            const testLabels = (r.labels || []).slice(nTrain);
            const testPreds: number[] = r.predictions || [];
            const correct = testPreds.filter((p, i) => p === testLabels[i]).length;
            const computedAcc = nTest > 0 ? (correct / nTest * 100).toFixed(1) : "—";
            return (
            <div key={`${r.classifier}-${r.trial}`} className="card flex flex-col items-center">
              <h3 className="text-xs font-semibold mb-1.5">{r.classifier} #{r.trial} · 准确率 {computedAcc}%</h3>
              <DecisionBoundary
                key={`${r.classifier}-${r.trial}`}
                points={r.points}
                labels={r.labels}
                predictions={r.predictions}
                boundaryData={r.boundary_data}
                animate={true}
                nTrain={nTrain}
                hideTrainPoints={false}
                hideMisclass={true}
                hideWrongRegion={true}
              />
              <div className="text-[10px] text-gray-400 mt-1 text-center">
                精确率 {r.precision?.join("/")} · 召回率 {r.recall?.join("/")} · F1 {r.f1?.join("/")} · {r.runtime_ms}ms
              </div>
            </div>
          );})}
        </div>
        </>
      )}

    </StageContainer>
  );
}

// ═══════ Stages 6-9 (复用 Workbench.tsx 逻辑) ═══════
function Stage6() {
  const store = useClassificationStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true); setMsg(null);
    const result = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis, experiment_results: store.experimentResult?.summary || {} }));
    if (result.ok) store.set({ aiAnalysis: result.data as any });
    else {
      try { const r = await analyzeResults(store.sessionId!, store.hypothesis); store.set({ aiAnalysis: r }); } catch { store.set({ aiAnalysis: { summary: "请先运行实验获得数据。", key_findings: [], questions_for_student: ["你预测哪个分类器会更准确？"] } }); }
      setMsg({ text: result.error, ok: false });
    }
    setAnalyzing(false);
  };
  const handleSave = async () => { try { await saveAnalysis(store.sessionId!, store.studentAnalysis); } catch {} };

  return (
    <StageContainer step={6} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={() => { handleSave(); store.setStage("REFLECTION_COMPLETED"); }} disabled={!store.studentAnalysis.trim()}>保存分析 → 反思</button></div>}>
      {store.experimentResult && (
        <ChartPanel
          data={Object.entries(store.experimentResult.summary).map(([a, s]: any) => ({ classifier: a, accuracy: s.avg_accuracy * 100, precision: s.avg_precision * 100, recall: s.avg_recall * 100, f1: s.avg_f1 * 100 }))}
          xKey="classifier"
          bars={[
            { key: "accuracy", name: "准确率 (%)", color: "#3b82f6" },
            { key: "precision", name: "精确率 (%)", color: "#22c55e" },
            { key: "recall", name: "召回率 (%)", color: "#f59e0b" },
            { key: "f1", name: "F1 (%)", color: "#ef4444" },
          ]}
        />
      )}
      <div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮助你分析实验结果</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "分析中..." : "AI 分析结果"}</button></div>
      {store.aiAnalysis && <div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">📊 {store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings?.length > 0 && <ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f: string, i: number) => <li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">你可以思考：</p>{store.aiAnalysis.questions_for_student?.map((q: string, i: number) => <p key={i} className="text-sm text-gray-500">{i + 1}. {q}</p>)}</div></div>}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[120px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder="根据实验结果，写下你的发现：哪个分类器最好？数据分布对结果有什么影响？" value={store.studentAnalysis} onChange={(e) => store.set({ studentAnalysis: e.target.value })} /></div>
    </StageContainer>
  );
}

function Stage7() {
  const store = useClassificationStore();
  const [questions, setQuestions] = useState<ReflectionQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);

  const loadQuestions = async () => {
    try {
      let qs: ReflectionQuestion[] | null = null;
      try { qs = await getReflectionQuestions(store.sessionId!); } catch {}
      if (!qs || qs.length === 0) {
        try { const generated = await generateReflectionQuestions(store.sessionId!); qs = generated.questions || []; } catch {}
      }
      if (qs && qs.length > 0) {
        setQuestions(qs);
        const am: Record<number, string> = {};
        for (const q of qs) { if (q.student_answer) am[q.id] = q.student_answer; }
        setAnswers(am);
        const storeAnswers: Record<number, string> = {}; qs.forEach((q, i) => { storeAnswers[i] = q.student_answer || ""; }); store.set({ reflectionAnswers: storeAnswers });
      }
    } catch {
      setQuestions(REFLECTION_QUESTIONS.map((q, i) => ({ id: -i - 1, session_id: store.sessionId!, question_text: q, category: "general", category_label: "通用", sort_order: i, is_selected: true, student_answer: store.reflectionAnswers[i] || "", ai_feedback: "", created_at: "" })));
    }
    setLoaded(true);
  };
  useEffect(() => { loadQuestions(); }, []);

  const handleBlur = async (qid: number, text: string) => {
    if (!text.trim()) return;
    const storeAnswers: Record<number, string> = {}; questions.forEach((q, i) => { storeAnswers[i] = q.id === qid ? text : (qid < 0 ? store.reflectionAnswers[-(qid + 1)] || "" : answers[q.id] || ""); }); store.set({ reflectionAnswers: storeAnswers });
    if (qid > 0) { try { await saveReflectionAnswer(qid, text); } catch {} }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => { const a = q.id < 0 ? store.reflectionAnswers[-(q.id + 1)] : answers[q.id]; return a?.trim(); });

  return (
    <StageContainer step={7} title="反思与改进" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("REPORT_GENERATED")} disabled={!allAnswered}>完成反思 → 生成报告</button></div>}>
      {!loaded && <div className="card text-center py-8"><p className="text-gray-400">正在生成反思问题...</p></div>}
      {questions.map((q, i) => {
        const qid = q.id; const ans = qid < 0 ? (store.reflectionAnswers[-(qid + 1)] || "") : (answers[qid] || "");
        return (
          <div key={qid} className="card">
            <h3 className="font-semibold text-gray-700 text-sm mb-2">{i + 1}. {q.question_text}</h3>
            <textarea className="w-full p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" rows={3} placeholder="写下你的想法，或点击下方模版快速填写..." value={ans}
              onChange={(e) => { if (qid < 0) store.set({ reflectionAnswers: { ...store.reflectionAnswers, [-(qid + 1)]: e.target.value } }); else setAnswers((a) => ({ ...a, [qid]: e.target.value })); }}
              onBlur={(e) => handleBlur(qid, e.target.value)} />
            {q.template_answers && q.template_answers.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-gray-400">📝 参考模版（点击填充）：</p>
                {q.template_answers.map((t: any, j: number) => {
                  const isActive = ans === t.text;
                  return (<button key={j} onClick={() => { if (qid < 0) store.set({ reflectionAnswers: { ...store.reflectionAnswers, [-(qid + 1)]: t.text } }); else { setAnswers((a) => ({ ...a, [qid]: t.text })); handleBlur(qid, t.text); } }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] leading-relaxed transition-all ${isActive ? "bg-blue-50 border border-blue-300" : "bg-gray-50 text-gray-500 hover:bg-blue-50/50 border border-gray-100"}`}>
                    {t.text.length > 80 ? t.text.slice(0, 80) + "…" : t.text}</button>);
                })}</div>)}
          </div>
        );
      })}
    </StageContainer>
  );
}

function Stage8() {
  const store = useClassificationStore();
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const reportMd = buildClassifyReport(store);
  const handleGenerate = async () => {
    setGenerating(true); setMsg(null);
    const result = await callAgent("通用LLM", "生成报告", () => callGeneralLLM({ report: reportMd }));
    store.set({ reportMarkdown: (result.ok ? (result.data as any)?.content_markdown || (result.data as any)?.polished : null) || reportMd });
    if (!result.ok) setMsg({ text: result.error, ok: false });
    setGenerating(false);
  };
  const handlePolish = async () => {
    if (!store.reportMarkdown || !hasAgentConfig()) return;
    setPolishing(true);
    const result = await callAgent("通用LLM", "报告润色", () => callGeneralLLM({ prompt: `请润色以下学生的研究报告，保留原始结构和关键数据，让语言更流畅清晰。使用中文回复。\n\n${store.reportMarkdown}`, messages: [{ role: "user", content: `请润色这篇研究报告：\n\n${store.reportMarkdown}` }] }));
    if (result.ok) { const t = (result.data as any)?.content_markdown || (result.data as any)?.polished || ""; if (t && t !== store.reportMarkdown) store.set({ reportMarkdown: t }); }
    setPolishing(false);
  };

  return (
    <StageContainer step={8} title="生成研究报告" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("REFLECTION_COMPLETED")}>← 上一步</button><div className="flex gap-2"><button className="btn-secondary" onClick={handleGenerate} disabled={generating}>{generating ? "生成中..." : store.reportMarkdown ? "🔄 重新生成" : "🤖 自动生成报告"}</button><button className="btn-primary" onClick={() => store.setStage("REVIEW_COMPLETED")} disabled={!store.reportMarkdown}>提交 → 审稿</button></div></div>}>
      {store.reportMarkdown ? (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2"><button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button></div>
            <button className="btn-secondary text-sm" onClick={handlePolish} disabled={polishing || !hasAgentConfig()}>{polishing ? "润色中..." : "🤖 AI 润色"}</button>
          </div>
          {preview ? <div className="min-h-[400px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm leading-relaxed">{store.reportMarkdown}</pre></div> : <textarea className="w-full min-h-[400px] p-4 border rounded-lg font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" value={store.reportMarkdown} onChange={(e) => store.set({ reportMarkdown: e.target.value })} />}
        </div>
      ) : <div className="card text-center py-12"><p className="text-gray-400 mb-4">系统将根据你前面的所有记录自动生成研究报告初稿</p><button className="btn-primary" onClick={handleGenerate} disabled={generating}>{generating ? "正在生成..." : "生成报告初稿"}</button></div>}
    </StageContainer>
  );
}

function Stage9() {
  const store = useClassificationStore();
  const [reviewing, setReviewing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const navigate = useNavigate();
  const DIMS = [{ key: "question_clarity", label: "问题清晰度", desc: "研究问题是否明确" }, { key: "experiment_design", label: "实验设计", desc: "是否控制变量、设置对比" }, { key: "data_completeness", label: "数据完整性", desc: "是否有足够实验结果" }, { key: "analysis_depth", label: "分析深度", desc: "是否解释了原因" }, { key: "reflection_quality", label: "反思质量", desc: "是否指出局限和改进" }, { key: "writing_clarity", label: "表达清晰度", desc: "报告是否结构清楚" }];

  const handleReview = async () => {
    setReviewing(true); setMsg(null);
    const ctx = { report: store.reportMarkdown, has_hypothesis: !!store.hypothesis.trim(), has_data: !!store.experimentResult };
    const result = await callAgent("reviewer", "审稿反馈", () => callReviewer(ctx));
    store.set({ reviewResult: (result.ok ? result.data : buildFallbackReview(store)) as any });
    if (!result.ok) setMsg({ text: result.error, ok: false });
    setReviewing(false);
  };
  const complete = () => {
    archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: store.selectedClassifiers, summary: store.experimentResult?.summary || null, analysis: store.studentAnalysis, reflection: store.reflectionAnswers, report: store.reportMarkdown, review: store.reviewResult?.scores || {} });
    updateProfileScores({ analysis: 0.2, design: 0.2 }); navigate("/archive");
  };

  const r = store.reviewResult;
  return (
    <StageContainer step={9} title="审稿反馈" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("REPORT_GENERATED")}>← 上一步</button><button className="btn-primary" onClick={complete}>完成研究 → 查看档案</button></div>}>
      {!r && <div className="card text-center py-8"><p className="text-gray-400 mb-4">让 AI 审稿人评价你的研究报告</p><button className="btn-primary" onClick={handleReview} disabled={reviewing}>{reviewing ? "审稿中..." : "开始审稿"}</button></div>}
      {r && <><div className="card"><h2 className="font-semibold text-gray-700 mb-4">多维评分</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{DIMS.map((d) => <div key={d.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"><div><span className="text-sm font-medium text-gray-700">{d.label}</span><p className="text-xs text-gray-400">{d.desc}</p></div><div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`text-sm ${n <= (r.scores[d.key] || 0) ? "text-yellow-500" : "text-gray-200"}`}>★</span>)}</div></div>)}</div></div>
        {r.strengths?.length > 0 && <div className="card border-green-100 bg-green-50/30"><h3 className="font-semibold text-sm text-green-700 mb-2">✅ 优点</h3><ul className="space-y-0.5">{r.strengths.map((s: string, i: number) => <li key={i} className="text-sm text-gray-600">• {s}</li>)}</ul></div>}
        {r.weaknesses?.length > 0 && <div className="card border-orange-100 bg-orange-50/30"><h3 className="font-semibold text-sm text-orange-700 mb-2">⚠️ 需要改进</h3><ul className="space-y-0.5">{r.weaknesses.map((w: string, i: number) => <li key={i} className="text-sm text-gray-600">• {w}</li>)}</ul></div>}
      </>}
    </StageContainer>
  );
}

// ═══════ Helpers ═══════
function classifyFallback(input: string): string[] {
  const qs: string[] = [];
  if (/KNN|邻居|距离/.test(input)) qs.push("KNN 在噪声较高时，K 值变大还是变小更好？");
  if (/决策树|树/.test(input)) qs.push("决策树的最大深度如何影响分类准确率？");
  qs.push("不同数据分布下，KNN 和决策树哪种分类器更稳定？", "增加噪声后，分类器的准确率会如何变化？");
  return qs.slice(0, 3);
}

function buildClassifyReport(store: ReturnType<typeof useClassificationStore.getState>): string {
  const reflectionText = REFLECTION_QUESTIONS.map((q, i) => `**${q}**\n\n${store.reflectionAnswers[i] || "（待补充）"}`).join("\n\n");
  const summary = store.experimentResult ? Object.entries(store.experimentResult.summary).map(([a, s]: any) => `| ${a} | ${(s.avg_accuracy * 100).toFixed(0)}% | ${(s.avg_precision * 100).toFixed(0)}% | ${(s.avg_recall * 100).toFixed(0)}% | ${(s.avg_f1 * 100).toFixed(0)}% |`).join("\n") : "| - | - | - | - | - |";
  return [`# 图像分类算法比较研究`, ``, `## 1. 研究问题`, ``, store.refinedQuestion || store.rawQuestion || "（待补充）", ``, `## 2. 我的假设`, ``, store.hypothesis || "（待补充）", ``, `## 3. 实验设计`, ``, `- 对比分类器：${store.selectedClassifiers.join("、")}`, `- 数据量：${store.nSamples} 个点`, `- 噪声水平：${(store.noiseLevels[0] * 100).toFixed(0)}%`, `- 数据分布：${store.patterns.join("、")}`, `- 重复次数：${store.numTrials} 次`, `- K 值：${store.kValue}，最大深度：${store.maxDepth === 99 ? "不限" : String(store.maxDepth)}`, ``, `## 4. 实验结果`, ``, `| 分类器 | 准确率 | 精确率 | 召回率 | F1 |`, `|---|---:|---:|---:|---:|`, summary, ``, `## 5. 结果分析`, ``, store.studentAnalysis || "（待补充）", ``, `## 6. 反思与改进`, ``, reflectionText, ``, `## 7. 总结`, ``, `（待补充）`].join("\n");
}
function buildFallbackReview(store: ReturnType<typeof useClassificationStore.getState>) {
  const s: Record<string, number> = {};
  s.question_clarity = (store.refinedQuestion || store.rawQuestion).length > 10 ? 4 : 2;
  s.experiment_design = store.selectedClassifiers.length >= 2 ? 4 : 3;
  s.data_completeness = store.experimentResult ? store.experimentResult.total_runs >= 3 ? 4 : 3 : 2;
  s.analysis_depth = store.studentAnalysis.trim().length > 20 ? 4 : 3;
  s.reflection_quality = Object.values(store.reflectionAnswers).filter((v) => v?.trim()).length >= 3 ? 4 : 3;
  s.writing_clarity = store.reportMarkdown.length > 200 ? 4 : 3;
  return { scores: s, strengths: ["完成了分类实验报告的基本结构"], weaknesses: ["可以增加更多重复实验次数"], revision_suggestions: ["用具体数据支撑你的结论", "补充实验的局限性和改进方向"], review_questions: ["你的结论是基于数据还是直觉？", "如果数据分布变了，结论还会一样吗？"] };
}

