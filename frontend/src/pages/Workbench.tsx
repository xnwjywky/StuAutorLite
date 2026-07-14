/**
 * 研究工作台 — 左侧流程导航 + 右侧阶段内容
 *
 * Agent 调用规则（未配置 → 提示配置 → 使用模板）:
 *   Stage 2,3 → Research Mentor   | Stage 4 → Experiment Designer
 *   Stage 6   → Data Analyst       | Stage 7 → Reflection
 *   Stage 8   → 通用 LLM            | Stage 9 → Reviewer
 */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import MazeVisualizer from "../components/MazeVisualizer";
import ChartPanel from "../components/ChartPanel";
import AlgorithmCard, { ALGO_INFO } from "../components/AlgorithmCard";
import { useWorkflowStore } from "../stores/workflowStore";
import {
  saveQuestion, saveHypothesis,
  runExperiment, analyzeResults, saveAnalysis,
  callMentor, callDataAnalyst, callReviewer, callGeneralLLM,
  hasAgentConfig, logAgentError,
  generateReflectionQuestions, getReflectionQuestions, saveReflectionAnswer,
  type ReflectionQuestion,
} from "../api/service";
import { archiveSession } from "./Archive";
import { updateProfileScores } from "./ProfilePage";
import type { ResearchStage, AlgorithmType, MetricType } from "../types";

// ═══════════════════════════════════════════════════════════
const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "QUESTION_DEFINED",    label: "确定研究问题" },
  { key: "HYPOTHESIS_WRITTEN",  label: "写出实验假设" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REFLECTION_COMPLETED",label: "反思改进" },
  { key: "REPORT_GENERATED",    label: "生成报告" },
  { key: "REVIEW_COMPLETED",    label: "获得审稿反馈" },
];

const QUESTION_TEMPLATES = [
  "迷宫越复杂，哪种算法表现最好？",
  "A* 一定比 BFS 更快吗？",
  "DFS 为什么有时候会绕很远？",
  "随机策略和搜索算法差距有多大？",
  "增加障碍物会对哪些算法影响最大？",
];
const HYPOTHESIS_GUIDES = [
  "我认为 ______ 算法会表现更好，因为 ______。",
  "当迷宫变复杂时，我预测 ______。",
  "我认为搜索节点更少意味着 ______。",
];
const REFLECTION_QUESTIONS = [
  "你的结果是否支持最初假设？为什么？",
  "哪个算法表现最好？哪个最不稳定？",
  "有没有出现意外结果？你如何解释？",
  "如果重新设计实验，你会怎么改？",
  "你的实验有什么局限（例如迷宫太小、次数太少）？",
];
const ALGORITHMS: { key: AlgorithmType; name: string; description: string; pros: string[]; cons: string[] }[] = [
  { key: "BFS", name: "BFS", description: "一层一层找，通常能找到最短路径", pros: ["保证最短路径","结果稳定"], cons: ["搜索节点较多","大迷宫较慢"] },
  { key: "DFS", name: "DFS", description: "一条路走到底，不行再回头", pros: ["可能很快","内存占用小"], cons: ["不一定最短","结果不稳定"] },
  { key: "A*",  name: "A*",  description: "根据离终点的距离聪明地搜索", pros: ["搜索效率高","保证最短路径"], cons: ["依赖启发函数"] },
  { key: "DIJKSTRA", name: "Dijkstra", description: "跟 BFS 很像，但考虑了'代价'概念", pros: ["保证最短路径","支持权重图"], cons: ["在均匀网格上≈BFS"] },
  { key: "GREEDY", name: "贪心优先", description: "只看离终点多远，不管走了多少步", pros: ["搜索极快","直奔目标"], cons: ["不保证最短路径","可能绕远路"] },
  { key: "BIDIRECTIONAL", name: "双向 BFS", description: "同时从起点和终点搜索，中间会合", pros: ["搜索节点减半","保证最短路径"], cons: ["实现较复杂","两个方向需同步"] },
  { key: "RANDOM", name: "Random Walk", description: "随便走，用作对比 baseline", pros: ["简单直观","体现算法价值"], cons: ["成功率低","路径很长"] },
  { key: "IDDFS", name: "迭代加深 DFS", description: "限制深度的 DFS，逐步增加深度", pros: ["内存占用小","保证最短路径"], cons: ["重复搜索浅层节点","大迷宫慢"] },
];
const METRICS: { key: MetricType; label: string }[] = [
  { key: "success_rate", label: "成功率" }, { key: "path_length", label: "路径长度" },
  { key: "expanded_nodes", label: "搜索节点数" }, { key: "runtime", label: "运行时间" },
];
const MAZE_SIZES = ["8×8", "12×12", "16×16", "20×20"];
const OBSTACLE_RATIOS = [0.1, 0.2, 0.3, 0.4];
const TRIALS = [1, 3, 5, 10];

// ═══════ 通用 Agent 调用器 — 重试 + 日志 + 降级 ═══════
type AgentCallResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };

async function callAgent(
  agentName: string, stage: string,
  fn: () => Promise<{ result?: unknown } | null>,
): Promise<AgentCallResult<unknown>> {
  if (!hasAgentConfig()) {
    return { ok: false, error: "未配置 Agent（请在 ⚙️ Agent 配置页面添加 API Key）", agentName };
  }
  try {
    const resp = await fn();
    const result = resp?.result as Record<string, unknown> | undefined;
    // 后端返回了明确的错误信息（如 HTTP 404、API key 无效等）
    if (result?.error) {
      const msg = String(result.error);
      logAgentError(agentName, stage, msg);
      return { ok: false, error: msg, agentName };
    }
    if (result && Object.keys(result).length > 0) return { ok: true, data: result };
    const err = `${agentName} 返回了空结果，已使用模板替代`;
    logAgentError(agentName, stage, err);
    return { ok: false, error: err, agentName };
  } catch (e: any) {
    const msg = `${agentName} 请求失败: ${e?.message || String(e)}`;
    logAgentError(agentName, stage, msg);
    return { ok: false, error: msg, agentName };
  }
}

// ═══════════════════════════════════════════════════════════
export default function Workbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useWorkflowStore();
  useEffect(() => {
    const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id);
  }, [sessionId]);
  if (store.sessionId === null) return null;
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">迷宫寻路算法研究</p>
          <FlowStepper steps={STEPS} current={store.currentStage} onStepClick={(s) => {
            // Stages 5+ need Stage 4 first
            const stageKeys = STEPS.map(st => st.key);
            if (stageKeys.indexOf(s) > stageKeys.indexOf("EXPERIMENT_DESIGNED") && !store.designCompleted) {
              store.setStage("EXPERIMENT_DESIGNED");
            } else {
              store.setStage(s);
            }
          }} />
        </aside>
        <div className="flex-1 overflow-auto bg-gray-50"><StageRouter /></div>
      </div>
    </Layout>
  );
}

function StageRouter() {
  const stage = useWorkflowStore((s) => s.currentStage);
  switch (stage) {
    case "QUESTION_DEFINED":    return <Stage2 />;
    case "HYPOTHESIS_WRITTEN":  return <Stage3 />;
    case "EXPERIMENT_DESIGNED": return <Stage4 />;
    case "EXPERIMENT_RUNNING":  return <Stage5 />;
    case "RESULT_ANALYZED":     return <Stage6 />;
    case "REFLECTION_COMPLETED":return <Stage7 />;
    case "REPORT_GENERATED":    return <Stage8 />;
    case "REVIEW_COMPLETED":    return <Stage9 />;
    default: return (
      <StageContainer step={1} title="选择研究任务">
        <div className="card"><h3 className="font-semibold mb-2">🧭 迷宫寻路算法研究</h3><p className="text-sm text-gray-500 mb-4">你将研究 BFS、DFS、A* 和 Random Walk 四种算法在不同迷宫中的表现。</p>
        <button className="btn-primary" onClick={() => useWorkflowStore.getState().setStage("QUESTION_DEFINED")}>开始 → 确定研究问题</button></div>
      </StageContainer>
    );
  }
}

// ═══════ Stage 2 — Research Mentor Agent ═══════
function Stage2() {
  const store = useWorkflowStore();
  const [loading, setLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [questionExplain, setQuestionExplain] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const result = await callAgent("research_mentor", "研究问题", () =>
      callMentor({ task: "迷宫寻路", student_input: store.rawQuestion, grade_level: "beginner" }),
    );
    if (result.ok) store.set({ suggestedQuestions: (result.data as any).suggested_questions || [] });
    else {
      store.set({ suggestedQuestions: suggestFallback(store.rawQuestion) });
      setMsg({ text: result.error, ok: false });
    }
    setLoading(false);
  };

  // 选中问题后，用 LLM 解释问题中的概念
  const handleSelectQuestion = async (q: string) => {
    store.set({ refinedQuestion: q, independentVariable: "", dependentVariables: [], controlledVariables: [] });
    setExplainLoading(true);
    setQuestionExplain("");
    const result = await callAgent("通用LLM", "问题解释", () => callGeneralLLM({
      prompt: `你是一个面向中小学生的科研学习助手。学生对以下研究问题不太理解，请用通俗易懂的中文解释：

1. 这个问题在研究什么？
2. 问题中提到的算法（如 BFS、DFS、A*、Random Walk）分别是什么？
3. 可以怎样通过实验来回答这个问题？
4. 实验结果能说明什么？

研究问题：${q}

请用简短清晰的中文回答，适合中小学生阅读。`,
      messages: [{ role: "user", content: `请解释这个研究问题：${q}` }],
    }));
    if (result.ok) {
      const text = (result.data as any)?.content_markdown || (result.data as any)?.polished || "";
      setQuestionExplain(text);
    } else {
      // 降级：本地模板解释
      const algoExplain = q.match(/BFS|DFS|A\*|Random Walk|A\*/g)?.join("、") || "搜索算法";
      setQuestionExplain(`这个问题研究的是"${algoExplain}"在迷宫寻路中的表现差异。你可以通过对比不同算法的搜索节点数、运行时间和成功率来找到答案。实验结果能帮你理解哪种策略在特定条件下更高效。`);
    }
    setExplainLoading(false);
  };

  const handleConfirm = async () => {
    try { await saveQuestion({ session_id: store.sessionId!, raw_question: store.rawQuestion, refined_question: store.refinedQuestion, independent_variable: "障碍物比例", dependent_variables: ["搜索节点数","运行时间","成功率"], controlled_variables: ["迷宫大小","起点终点"] }); } catch {}
    store.setStage("HYPOTHESIS_WRITTEN");
  };

  return (
    <StageContainer step={2} title="确定研究问题" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={handleConfirm} disabled={!store.refinedQuestion}>确认问题 → 写假设</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">可选问题模板</h2><div className="grid gap-2">{QUESTION_TEMPLATES.map((t) => <button key={t} onClick={() => store.set({ rawQuestion: t })} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${store.rawQuestion === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>)}</div></div>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">用你自己的话描述</h2><textarea className="w-full min-h-[80px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder='例如：A* 是不是一直比 BFS 好？' value={store.rawQuestion} onChange={(e) => store.set({ rawQuestion: e.target.value })} /><button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化为研究问题"}</button></div>
      {store.suggestedQuestions.length > 0 && <div className="card border-gray-200 bg-gray-50"><h2 className="font-semibold text-gray-700 mb-3">AI 建议的研究问题（点击选择）</h2><div className="space-y-2">{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => handleSelectQuestion(q)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${store.refinedQuestion === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-100"}`}>{q}</button>)}</div></div>}
      {store.refinedQuestion && (
        <div className="card border-blue-200 bg-blue-50/50">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题：</h3>
          <p className="text-sm text-gray-800 font-medium mb-3">{store.refinedQuestion}</p>
          {explainLoading && <p className="text-xs text-gray-400">AI 正在解释这个问题...</p>}
          {questionExplain && <div className="border-t border-blue-100 pt-3 mt-2"><h4 className="text-xs font-medium text-gray-600 mb-1">📖 问题解读</h4><div className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{questionExplain}</div></div>}
        </div>
      )}
    </StageContainer>
  );
}

// ═══════ Stage 3 — Research Mentor Agent ═══════
function Stage3() {
  const store = useWorkflowStore();
  const [saved, setSaved] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 仅保存数据，不触发 AI
  const handleGoNext = async () => {
    try { await saveHypothesis(store.sessionId!, store.hypothesis); } catch {}
    store.setStage("EXPERIMENT_DESIGNED");
  };

  // 保存 + 触发 AI 追问
  const handleSaveAndAsk = async () => {
    if (!store.hypothesis.trim()) return;
    try { await saveHypothesis(store.sessionId!, store.hypothesis); } catch {}
    setSaved(true);
    setAiThinking(true);
    const result = await callAgent("research_mentor", "实验假设", () =>
      callMentor({ task: "迷宫寻路", student_input: `学生对实验的预测：${store.hypothesis}`, grade_level: "beginner" }),
    );
    if (result.ok) {
      const qs = (result.data as any).suggested_questions || [];
      store.set({ aiHypothesisFeedback: qs[0] || makeHypothesisFeedback(store.hypothesis) });
    } else {
      store.set({ aiHypothesisFeedback: makeHypothesisFeedback(store.hypothesis) });
      setMsg({ text: result.error, ok: false });
    }
    setAiThinking(false);
  };

  return (
    <StageContainer step={3} title="写出实验假设" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("QUESTION_DEFINED")}>← 上一步</button><button className="btn-primary" onClick={handleGoNext} disabled={!store.hypothesis.trim()}>下一步 → 设计实验</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">句式引导</h2><p className="text-sm text-gray-500 mb-3">在实验之前，先预测结果。选择或参考以下句式：</p><div className="space-y-2">{HYPOTHESIS_GUIDES.map((g) => <button key={g} onClick={() => store.set({ hypothesis: store.hypothesis ? store.hypothesis + "\n" + g : g })} className="block w-full text-left px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">{g}</button>)}</div></div>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的假设</h2><textarea className="w-full min-h-[120px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder="例如：我认为 A* 会比 BFS 更快，因为 A* 会优先朝终点方向搜索。" value={store.hypothesis} onChange={(e) => { store.set({ hypothesis: e.target.value }); setSaved(false); }} /><div className="flex items-center justify-between mt-3"><p className="text-sm text-gray-400">写清楚预测"谁更好"和"为什么"</p><button className="btn-secondary" onClick={handleSaveAndAsk} disabled={!store.hypothesis.trim() || aiThinking}>{aiThinking ? "分析中..." : saved ? "✓ 已保存" : "💬 让 AI 追问"}</button></div></div>
      {aiThinking && <div className="card border-yellow-100 bg-yellow-50/30"><p className="text-sm text-gray-500 flex items-center gap-2"><span className="inline-block w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />AI 正在分析你的假设，请稍候...</p></div>}
      {store.aiHypothesisFeedback && !aiThinking && <div className="card border-yellow-200 bg-yellow-50"><h3 className="font-semibold text-sm text-gray-700 mb-2">AI 追问</h3><p className="text-sm text-gray-600">{store.aiHypothesisFeedback}</p></div>}
    </StageContainer>
  );
}

// ═══════ Stage 4 — 设计实验（算法原理侧边显示、隐藏 AI 检查）═══════
function Stage4() {
  const store = useWorkflowStore();
  const [infoAlgo, setInfoAlgo] = useState<string | null>(null);

  const toggle = (algo: typeof ALGORITHMS[0]) => {
    const field = "selectedAlgorithms" as const;
    const arr = store[field];
    if (arr.includes(algo.key)) {
      store.set({ [field]: arr.filter((a) => a !== algo.key) });
      if (infoAlgo === algo.key) setInfoAlgo(null);
    } else {
      store.set({ [field]: [...arr, algo.key] });
      setInfoAlgo(algo.key);
    }
  };
  const toggleMetric = (m: MetricType) => { const arr = store.selectedMetrics; store.set({ selectedMetrics: arr.includes(m) ? arr.filter((x) => x !== m) : [...arr, m] }); };

  const infoAlgoKey = infoAlgo === "ASTAR" ? "A*" : infoAlgo;
  const info = infoAlgoKey ? ALGO_INFO[infoAlgoKey] ?? null : null;

  return (
    <StageContainer step={4} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("HYPOTHESIS_WRITTEN")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }}>下一步 → 运行实验</button></div>}>
      {/* ── 算法选择 ── */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">我要比较的算法 {store.selectedAlgorithms.length === 0 && <span className="text-xs font-normal text-gray-400">（请至少选择一个）</span>}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALGORITHMS.map((a) => (
              <AlgorithmCard key={a.key} name={a.name} description={a.description}
                selected={store.selectedAlgorithms.includes(a.key)}
                onToggle={() => toggle(a)} />
            ))}
        </div>
      </div>

      {/* ── 下方：最后选中算法的原理 ── */}
      {info && (
        <div className="card border-blue-200 bg-blue-50/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">{infoAlgoKey} 算法原理</h2>
            <button onClick={() => setInfoAlgo(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <p className="text-sm text-gray-600 mb-3">{info.explanation}</p>
          <div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {info.analogy}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {info.key_points.map((p: string) => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}
          </div>
          {info.pseudocode && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 mb-1">▶ 伪代码</summary>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto text-[11px] leading-relaxed whitespace-pre font-mono">{info.pseudocode}</pre>
            </details>
          )}
        </div>
      )}

      {/* ── 参数配置 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">迷宫大小</h3><div className="space-y-1">{MAZE_SIZES.map((s) => { const [w, h] = s.split("×").map(Number); return <button key={s} onClick={() => store.set({ mazeSize: [w as number, h as number] })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.mazeSize[0] === w ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{s}</button>; })}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">障碍物比例</h3><div className="space-y-1">{OBSTACLE_RATIOS.map((r) => <button key={r} onClick={() => store.set({ obstacleRatios: [r] })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.obstacleRatios[0] === r ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{(r * 100).toFixed(0)}%</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">每组重复次数</h3><div className="space-y-1">{TRIALS.map((t) => <button key={t} onClick={() => store.set({ numTrials: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
      </div>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-2 text-sm">我要观察的指标</h2><div className="flex flex-wrap gap-2">{METRICS.map((m) => <button key={m.key} onClick={() => toggleMetric(m.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${store.selectedMetrics.includes(m.key) ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"}`}>{m.label}</button>)}</div></div>
    </StageContainer>
  );
}

// ═══════ Stage 5 — 运行实验（迷宫网格 + 图表 + 编辑器 + 组别切换）═══════
function Stage5() {
  const store = useWorkflowStore();
  const [running, setRunning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState(1);
  // ref 作为 edits 唯一数据源，避免 React 闭包过期
  //   isEdited: 该组是否被手动编辑过（持久标记，重新运行后仍保留）
  //   staleEdit: 编辑后尚未重新计算路径（完成编辑/重新运行后清除）
  const editsRef = useRef<Record<number, { grid: number[][]; isEdited: boolean; staleEdit: boolean }>>({});
  const [editsV, setEditsV] = useState(0); // 仅触发重绘
  const autoRunRef = useRef(false);

  const setEdit = (trial: number, grid: number[][]) => {
    editsRef.current = { ...editsRef.current, [trial]: { grid, isEdited: true, staleEdit: true } };
    setEditsV((v) => v + 1);
  };

  const execRun = async (lockedMazes?: Record<string, number[][]>) => {
    setRunning(true);
    setEditMode(false);
    const algos = store.selectedAlgorithms.length > 0 ? store.selectedAlgorithms : ["BFS", "DFS", "A*", "RANDOM"];
    try {
      const settings: Record<string, unknown> = { maze_size: store.mazeSize, obstacle_ratios: store.obstacleRatios, num_trials: store.numTrials, same_seed_for_algorithms: true, seed: (Date.now() % 9000) + 1000 };
      if (lockedMazes && Object.keys(lockedMazes).length > 0) settings.custom_mazes = lockedMazes;
      const data = await runExperiment({ session_id: store.sessionId!, algorithms: algos, settings });
      store.set({ experimentResult: data as any, selectedRunIdx: 0 });
      const fresh: Record<number, number[][]> = {};
      for (const r of (data as any).runs || []) {
        if (r.maze_grid && !fresh[r.trial]) fresh[r.trial] = r.maze_grid;
      }
      const next: Record<number, { grid: number[][]; isEdited: boolean; staleEdit: boolean }> = {};
      for (let t = 1; t <= store.numTrials; t++) {
        if (fresh[t]) {
          const wasEdited = !!(lockedMazes && String(t) in lockedMazes);
          next[t] = { grid: fresh[t], isEdited: wasEdited, staleEdit: false };
        }
      }
      editsRef.current = next;
      setEditsV((v) => v + 1);
    } catch {
      const [w, h] = store.mazeSize; const ratio = store.obstacleRatios[0] ?? 0.25;
      const runs: any[] = []; const summary: Record<string, any> = {};
      for (const algo of algos) {
        const mock = generateMockRun(w, h, ratio, algo, 42 + algos.indexOf(algo), store.numTrials, lockedMazes);
        runs.push(...mock.runs); summary[algo] = mock.stats;
      }
      const fresh: Record<number, number[][]> = {};
      for (const r of runs) { if (r.maze_grid && !fresh[r.trial]) fresh[r.trial] = r.maze_grid; }
      store.set({ experimentResult: { experiment_batch_id: "demo-" + Date.now().toString(36), status: "COMPLETED", total_runs: runs.length, summary, runs }, selectedRunIdx: 0 });
      const next: Record<number, { grid: number[][]; isEdited: boolean; staleEdit: boolean }> = {};
      for (let t = 1; t <= store.numTrials; t++) {
        if (fresh[t]) {
          const wasEdited = !!(lockedMazes && String(t) in lockedMazes);
          next[t] = { grid: fresh[t], isEdited: wasEdited, staleEdit: false };
        }
      }
      editsRef.current = next;
      setEditsV((v) => v + 1);
    } finally { setRunning(false); }
  };

  // 直接从 ref 读取锁定列表，无闭包过期风险
  const doReRun = () => {
    const locked: Record<string, number[][]> = {};
    const cur = editsRef.current;
    for (let t = 1; t <= store.numTrials; t++) {
      if (cur[t]?.isEdited) locked[String(t)] = cur[t].grid;
    }
    execRun(Object.keys(locked).length > 0 ? locked : undefined);
  };

  const handleToggleEdit = () => {
    if (editMode) {
      // 仅当有新的未重新计算的编辑时才触发重新运行
      const hasStaleEdits = Object.values(editsRef.current).some((e) => e?.staleEdit);
      if (hasStaleEdits) { doReRun(); return; }
    }
    setEditMode(!editMode);
  };

  // 首次进入 + 无实验结果时自动生成；已有数据直接展示
  useEffect(() => {
    if (!autoRunRef.current && !store.experimentResult) {
      autoRunRef.current = true;
      execRun();
    }
  }, [store.experimentResult]);

  const result = store.experimentResult;

  const displayRuns = result?.runs
    ? result.runs.filter((r: any) => r.trial === selectedTrial).sort((a: any, b: any) => String(a.algorithm).localeCompare(String(b.algorithm)))
    : [];

  const [mw, mh] = store.mazeSize;
  const curRef = editsRef.current[selectedTrial];
  const curEditGrid = curRef?.isEdited ? curRef.grid : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void editsV; // consumed for re-render

  return (
    <StageContainer step={5} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}>
      {/* ── 运行面板 ── */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">实验配置</h2>
            <p className="text-sm text-gray-400">算法：{store.selectedAlgorithms.join("、") || "BFS、DFS、A*、RANDOM"} | {mw}×{mh} | 障碍物 {((store.obstacleRatios[0] ?? 0.2) * 100).toFixed(0)}% | ×{store.numTrials} 次</p>
          </div>
          <div className="flex gap-2">
            {result && (
              <button className={`btn-secondary text-sm ${editMode ? "bg-gray-300" : ""}`} onClick={handleToggleEdit} disabled={running}>
                {editMode ? "✓ 完成编辑" : "✏️ 编辑迷宫"}
              </button>
            )}
            <button className="btn-primary text-lg px-6" onClick={() => { result ? doReRun() : execRun(); }} disabled={running}>
              {running ? "⏳ 运行中..." : result ? "🔄 重新运行" : "▶ 开始实验"}
            </button>
          </div>
        </div>
        {editMode && <p className="text-xs text-blue-600 mt-2">点击格子切换墙壁/空地（起点🟢终点🔴不可编辑）。点「完成编辑」用编辑后的迷宫重新计算。</p>}

        {/* ── 组别切换 ── */}
        {result && store.numTrials > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">切换组别：</span>
            {Array.from({ length: store.numTrials }, (_, i) => i + 1).map((t) => (
              <button key={t} onClick={() => setSelectedTrial(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedTrial === t ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                第{t}组 {editsRef.current[t]?.isEdited ? "✏️ 已编辑" : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 迷宫网格 ── */}
      {result && displayRuns.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayRuns.map((r: any) => {
            const grid = editMode && curEditGrid ? curEditGrid : r.maze_grid;
            const isStaleEdit = !editMode && !!(curRef?.staleEdit);
            return (
              <div key={`${r.algorithm}-${r.trial}`} className="card flex flex-col items-center">
                <h3 className="text-xs font-semibold mb-1.5">{r.algorithm} #{r.trial} {r.success ? "✅" : "❌"}</h3>
                <MazeVisualizer
                  key={`${r.algorithm}-${r.trial}-${editMode ? 1 : 0}`}
                  grid={grid}
                  path={editMode || isStaleEdit ? [] : r.path}
                  visited={editMode || isStaleEdit ? [] : r.visited_nodes}
                  runtimeMs={r.runtime_ms ?? 30}
                  editable={editMode}
                  onGridChange={(g) => setEdit(selectedTrial, g)}
                />
                {!editMode && !isStaleEdit && (
                  <div className="text-[10px] text-gray-400 mt-1 text-center">路径 {r.path_length} · 节点 {r.expanded_nodes} · {r.runtime_ms}ms</div>
                )}
                {isStaleEdit && (
                  <div className="text-[10px] text-amber-500 mt-1 text-center">⚠️ 已编辑 — 点击「重新运行」用新迷宫重新计算</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 图表 ── */}
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {store.selectedMetrics.includes("success_rate") && (
            <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, v: +(s.success_rate * 100).toFixed(1) }))} singleMetric={{ key: "v", label: "成功率 (%)" }} />
          )}
          {store.selectedMetrics.includes("path_length") && (
            <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, v: s.avg_path_length ?? 0 }))} singleMetric={{ key: "v", label: "平均路径长度" }} />
          )}
          {store.selectedMetrics.includes("expanded_nodes") && (
            <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, v: s.avg_expanded_nodes }))} singleMetric={{ key: "v", label: "平均搜索节点数" }} />
          )}
          {store.selectedMetrics.includes("runtime") && (
            <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, v: s.avg_runtime_ms }))} singleMetric={{ key: "v", label: "平均运行时间 (ms)" }} />
          )}
        </div>
      )}
    </StageContainer>
  );
}

// ═══════ Stage 6 — Data Analyst Agent ═══════
function Stage6() {
  const store = useWorkflowStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true); setMsg(null);
    const result = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis, experiment_results: store.experimentResult?.summary || {} }));
    if (result.ok) store.set({ aiAnalysis: result.data as any });
    else {
      try { const r = await analyzeResults(store.sessionId!, store.hypothesis); store.set({ aiAnalysis: r }); } catch { store.set({ aiAnalysis: { summary: "请先运行实验获得数据。", key_findings: [], questions_for_student: ["你预测哪个算法会最快？"] } }); }
      setMsg({ text: result.error, ok: false });
    }
    setAnalyzing(false);
  };
  const handleSave = async () => { try { await saveAnalysis(store.sessionId!, store.studentAnalysis); } catch {} };
  const result = store.experimentResult;
  return (
    <StageContainer step={6} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={() => { handleSave(); store.setStage("REFLECTION_COMPLETED"); }} disabled={!store.studentAnalysis.trim()}>保存分析 → 反思</button></div>}>
      {result && <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, success_rate: s.success_rate * 100, path_length: s.avg_path_length ?? 0, expanded_nodes: s.avg_expanded_nodes, runtime_ms: s.avg_runtime_ms }))} />}
      <div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮助你分析实验结果</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "分析中..." : "AI 分析结果"}</button></div>
      {store.aiAnalysis && <div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">📊 {store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings?.length > 0 && <ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f: string, i: number) => <li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">你可以思考：</p>{store.aiAnalysis.questions_for_student?.map((q: string, i: number) => <p key={i} className="text-sm text-gray-500">{i + 1}. {q}</p>)}</div></div>}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[120px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder="根据实验结果，写下你的发现和解释：哪个算法最好？为什么？数据支持你的假设吗？" value={store.studentAnalysis} onChange={(e) => store.set({ studentAnalysis: e.target.value })} /></div>
    </StageContainer>
  );
}

// ═══════ Stage 7 — Reflection：题库 + 回答 + AI 反思反馈 ═══════
function Stage7() {
  const store = useWorkflowStore();
  const [questions, setQuestions] = useState<ReflectionQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, string>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 加载问题
  const loadQuestions = async () => {
    try {
      let qs: ReflectionQuestion[] | null = null;
      try { qs = await getReflectionQuestions(store.sessionId!); } catch { /* API 不可用 */ }
      if (!qs || qs.length === 0) {
        try {
          const generated = await generateReflectionQuestions(store.sessionId!);
          qs = generated.questions || [];
        } catch { /* 降级 */ }
      }
      if (qs && qs.length > 0) {
        setQuestions(qs);
        const am: Record<number, string> = {}; const fm: Record<number, string> = {};
        for (const q of qs) { if (q.student_answer) am[q.id] = q.student_answer; if (q.ai_feedback) fm[q.id] = q.ai_feedback; }
        setAnswers(am); setFeedbacks(fm);
        const storeAnswers: Record<number, string> = {};
        qs.forEach((q, i) => { storeAnswers[i] = q.student_answer || ""; });
        store.set({ reflectionAnswers: storeAnswers });
      }
    } catch {
      // 降级为本地模板
      setQuestions(REFLECTION_QUESTIONS.map((q, i) => ({
        id: -i - 1, session_id: store.sessionId!, question_text: q,
        category: "general", category_label: "通用", sort_order: i,
        is_selected: true, student_answer: store.reflectionAnswers[i] || "", ai_feedback: "", created_at: "",
      })));
    }
    setLoaded(true);
  };

  useEffect(() => { loadQuestions(); }, []);

  // 失焦时保存回答 + 获取 AI 反馈
  const handleBlur = async (qid: number, text: string) => {
    if (!text.trim()) return;
    setSavingIds((s) => new Set([...s, qid]));
    // 同步到 store
    const storeAnswers: Record<number, string> = {};
    questions.forEach((q, i) => { storeAnswers[i] = q.id === qid ? text : (qid < 0 ? store.reflectionAnswers[-(qid + 1)] || "" : answers[q.id] || ""); });
    store.set({ reflectionAnswers: storeAnswers });

    if (qid > 0) {
      // 有真实 DB ID：通过后端保存 + 获取 AI 反馈
      try {
        const updated = await saveReflectionAnswer(qid, text);
        setFeedbacks((f) => ({ ...f, [qid]: updated.ai_feedback || "" }));
      } catch {
        // API 调用失败，不显示反馈
      }
    } else {
      // 降级模式（qid < 0）：无后端，不生成反馈
    }
    setSavingIds((s) => { const ns = new Set(s); ns.delete(qid); return ns; });
  };

  const allAnswered = questions.length > 0 && questions.every((q) => {
    const a = q.id < 0 ? store.reflectionAnswers[-(q.id + 1)] : answers[q.id];
    return a?.trim();
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const generated = await generateReflectionQuestions(store.sessionId!);
      if (generated.questions?.length > 0) {
        setQuestions(generated.questions);
        setAnswers({}); setFeedbacks({});
      }
    } catch {
      // 本地降级：随机打乱
      const shuffled = [...REFLECTION_QUESTIONS].sort(() => Math.random() - 0.5);
      setQuestions(shuffled.map((q, i) => ({
        id: -i - 1, session_id: store.sessionId!, question_text: q,
        category: "general", category_label: "通用", sort_order: i,
        is_selected: true, student_answer: "", ai_feedback: "", created_at: "",
      })));
      setAnswers({}); setFeedbacks({});
    }
    setRefreshing(false);
  };

  return (
    <StageContainer step={7} title="反思与改进" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("REPORT_GENERATED")} disabled={!allAnswered}>完成反思 → 生成报告</button></div>}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">回顾研究过程，回答以下问题。回答后 AI 会给出启发式反馈。</p>
        <button className="btn-secondary text-xs" onClick={handleRefresh} disabled={refreshing}>{refreshing ? "生成中..." : "🔄 换一组问题"}</button>
      </div>

      {!loaded && <div className="card text-center py-8"><p className="text-gray-400">正在生成反思问题...</p></div>}

      {questions.map((q, i) => {
        const qid = q.id;
        const ans = qid < 0 ? (store.reflectionAnswers[-(qid + 1)] || "") : (answers[qid] || "");
        const fb = feedbacks[qid] || "";        const saving = savingIds.has(qid);
        return (
          <div key={qid} className="card">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">{q.category_label || "通用"}</span>
              <h3 className="font-semibold text-gray-700 text-sm">{i + 1}. {q.question_text}</h3>
            </div>
            <textarea
              className="w-full p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
              rows={3}
              placeholder="写下你的想法..."
              value={ans}
              onChange={(e) => {
                if (qid < 0) {
                  store.set({ reflectionAnswers: { ...store.reflectionAnswers, [-(qid + 1)]: e.target.value } });
                } else {
                  setAnswers((a) => ({ ...a, [qid]: e.target.value }));
                }
              }}
              onBlur={(e) => handleBlur(qid, e.target.value)}
            />
            {saving && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />处理中...</p>}
            {fb && <p className="text-xs text-blue-600 mt-2 p-2 bg-blue-50 rounded-lg">💡 {fb}</p>}
          </div>
        );
      })}

      {loaded && allAnswered && (
        <div className="card border-green-200 bg-green-50/30">
          <p className="text-sm text-green-700">✓ 所有反思问题已回答，可以进入下一步生成研究报告。</p>
        </div>
      )}
    </StageContainer>
  );
}

// ═══════ Stage 8 — 通用 LLM ═══════
function Stage8() {
  const store = useWorkflowStore();
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleGenerate = async () => {
    setGenerating(true); setMsg(null);
    const result = await callAgent("通用LLM", "生成报告", () => callGeneralLLM({ report: buildReportMd(store) }));
    store.set({ reportMarkdown: (result.ok ? (result.data as any)?.content_markdown || (result.data as any)?.polished : null) || buildReportMd(store) });
    if (!result.ok) setMsg({ text: result.error, ok: false });
    setGenerating(false);
  };

  return (
    <StageContainer step={8} title="生成研究报告" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("REFLECTION_COMPLETED")}>← 上一步</button><div className="flex gap-2"><button className="btn-secondary" onClick={handleGenerate} disabled={generating}>{generating ? "生成中..." : store.reportMarkdown ? "🔄 重新生成" : "🤖 自动生成报告"}</button><button className="btn-primary" onClick={() => store.setStage("REVIEW_COMPLETED")} disabled={!store.reportMarkdown}>提交 → 审稿</button></div></div>}>
      {store.reportMarkdown ? <ReportEditor /> : <div className="card text-center py-12"><p className="text-gray-400 mb-4">系统将根据你前面的所有记录自动生成研究报告初稿</p><button className="btn-primary" onClick={handleGenerate} disabled={generating}>{generating ? "正在生成..." : "生成报告初稿"}</button><p className="text-xs text-gray-300 mt-3">报告中需要保留学生自己的关键回答，AI 帮助润色</p></div>}
    </StageContainer>
  );
}

function ReportEditor() {
  const store = useWorkflowStore();
  const [preview, setPreview] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polishMsg, setPolishMsg] = useState("");
  const aiAvailable = hasAgentConfig();

  const handlePolish = async () => {
    if (!store.reportMarkdown || !aiAvailable) return;
    setPolishing(true); setPolishMsg("");
    const result = await callAgent("通用LLM", "报告润色", () => callGeneralLLM({
      prompt: `请润色以下学生的研究报告，保留原始结构和关键数据，让语言更流畅清晰。使用中文回复，直接返回润色后的完整 Markdown。\n\n${store.reportMarkdown}`,
      messages: [{ role: "user", content: `请润色这篇研究报告，使用中文：\n\n${store.reportMarkdown}` }],
    }));
    if (result.ok) {
      const polished = (result.data as any)?.content_markdown || (result.data as any)?.polished || "";
      if (polished && polished !== store.reportMarkdown) {
        store.set({ reportMarkdown: polished });
        setPolishMsg("✅ 报告已润色完成");
      } else {
        setPolishMsg("⚠️ AI 返回了空内容，请重试");
      }
    } else {
      setPolishMsg(`⚠️ ${result.error || "AI 服务连接失败"}`);
    }
    setPolishing(false);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button>
          <button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button>
        </div>
        <button
          className={`btn-secondary text-sm ${!aiAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
          onClick={handlePolish}
          disabled={polishing || !aiAvailable}
          title={!aiAvailable ? "请先在 Agent 配置页面添加 API Key" : ""}
        >{polishing ? "润色中..." : "🤖 AI 润色"}</button>
      </div>
      {polishMsg && <p className={`text-xs mb-3 ${polishMsg.startsWith("✅") ? "text-green-600" : "text-amber-600"}`}>{polishMsg}</p>}
      {preview
        ? <div className="min-h-[400px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm leading-relaxed">{store.reportMarkdown}</pre></div>
        : <textarea className="w-full min-h-[400px] p-4 border rounded-lg font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" value={store.reportMarkdown} onChange={(e) => store.set({ reportMarkdown: e.target.value })} />
      }
    </div>
  );
}

// ═══════ Stage 9 — Reviewer Agent ═══════
function Stage9() {
  const store = useWorkflowStore();
  const [reviewing, setReviewing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const navigate = useNavigate();
  const DIMS = [
    { key: "question_clarity", label: "问题清晰度", desc: "研究问题是否明确" },
    { key: "experiment_design", label: "实验设计", desc: "是否控制变量、设置对比" },
    { key: "data_completeness", label: "数据完整性", desc: "是否有足够实验结果" },
    { key: "analysis_depth", label: "分析深度", desc: "是否解释了原因" },
    { key: "reflection_quality", label: "反思质量", desc: "是否指出局限和改进" },
    { key: "writing_clarity", label: "表达清晰度", desc: "报告是否结构清楚" },
  ];

  const handleReview = async () => {
    setReviewing(true); setMsg(null);
    const ctx = { report: store.reportMarkdown, has_hypothesis: !!store.hypothesis.trim(), has_data: !!store.experimentResult, has_reflection: Object.values(store.reflectionAnswers).some((v) => v?.trim()) };
    const result = await callAgent("reviewer", "审稿反馈", () => callReviewer(ctx));
    if (result.ok) {
      store.set({ reviewResult: result.data as any });
    } else {
      // 降级：根据学生实际完成情况综合评分
      const fallback = buildFallbackReview(store);
      store.set({ reviewResult: fallback });
      setMsg({ text: result.error, ok: false });
    }
    setReviewing(false);
  };

  const complete = () => {
    const scores = store.reviewResult?.scores || {};
    archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: store.selectedAlgorithms, summary: store.experimentResult?.summary || null, analysis: store.studentAnalysis, reflection: store.reflectionAnswers, report: store.reportMarkdown, review: scores });
    const d: Record<string, number> = {};
    if (store.refinedQuestion.trim()) d.question = 0.5; if (store.hypothesis.trim()) d.hypothesis = 0.3;
    if (store.selectedAlgorithms.length >= 2) d.design = 0.4; if (store.selectedAlgorithms.length >= 3) d.algorithm = 0.3;
    if (store.studentAnalysis.trim()) d.analysis = 0.4; if (Object.values(store.reflectionAnswers).some((v) => v?.trim())) d.reflection = 0.3;
    if (store.reportMarkdown.length > 200) d.expression = 0.4;
    const add = (k: string, v: number) => { d[k] = Math.min(5, Math.round(((d[k] || 0) + v) * 10) / 10); };
    if (scores.question_clarity) add("question", scores.question_clarity * 0.2);
    if (scores.experiment_design) add("design", scores.experiment_design * 0.2);
    if (scores.analysis_depth) add("analysis", scores.analysis_depth * 0.2);
    if (scores.reflection_quality) add("reflection", scores.reflection_quality * 0.2);
    updateProfileScores(d); navigate("/archive");
  };

  const r = store.reviewResult;
  return (
    <StageContainer step={9} title="审稿反馈" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("REPORT_GENERATED")}>← 上一步</button><button className="btn-primary" onClick={complete}>完成研究 → 查看档案</button></div>}>
      {!r && <div className="card text-center py-8"><p className="text-gray-400 mb-4">让 AI 审稿人评价你的研究报告</p><button className="btn-primary" onClick={handleReview} disabled={reviewing}>{reviewing ? "审稿中..." : "开始审稿"}</button></div>}
      {r && <><div className="card"><h2 className="font-semibold text-gray-700 mb-4">多维评分</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{DIMS.map((d) => <div key={d.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"><div><span className="text-sm font-medium text-gray-700">{d.label}</span><p className="text-xs text-gray-400">{d.desc}</p></div><StarRating score={r.scores[d.key] || 0} /></div>)}</div></div>
        {r.strengths?.length > 0 && <div className="card border-green-100 bg-green-50/30"><h3 className="font-semibold text-sm text-green-700 mb-2">✅ 优点</h3><ul className="space-y-0.5">{r.strengths.map((s: string, i: number) => <li key={i} className="text-sm text-gray-600">• {s}</li>)}</ul></div>}
        {r.weaknesses?.length > 0 && <div className="card border-orange-100 bg-orange-50/30"><h3 className="font-semibold text-sm text-orange-700 mb-2">⚠️ 需要改进</h3><ul className="space-y-0.5">{r.weaknesses.map((w: string, i: number) => <li key={i} className="text-sm text-gray-600">• {w}</li>)}</ul></div>}
        {r.revision_suggestions?.length > 0 && <div className="card border-blue-100 bg-blue-50/30"><h3 className="font-semibold text-sm text-blue-700 mb-2">📝 修改建议</h3><ol className="list-decimal list-inside space-y-0.5">{r.revision_suggestions.map((s: string, i: number) => <li key={i} className="text-sm text-gray-600">{s}</li>)}</ol></div>}
        {r.review_questions?.length > 0 && <div className="card border-yellow-100 bg-yellow-50/30"><h3 className="font-semibold text-sm text-yellow-700 mb-2">🤔 审稿人追问</h3>{r.review_questions.map((q: string, i: number) => <p key={i} className="text-sm text-gray-600">{i + 1}. {q}</p>)}</div>}
      </>}
    </StageContainer>
  );
}

function StarRating({ score }: { score: number }) { return <div className="flex gap-0.5">{[1,2,3,4,5].map((n) => <span key={n} className={`text-sm ${n <= score ? "text-yellow-500" : "text-gray-200"}`}>★</span>)}</div>; }

function buildFallbackReview(store: ReturnType<typeof useWorkflowStore.getState>) {
  const s: Record<string, number> = {};
  // 基于学生实际完成情况评分
  s.question_clarity   = (store.refinedQuestion || store.rawQuestion).length > 10 ? 4 : 2;
  s.experiment_design  = store.selectedAlgorithms.length >= 2 ? 4 : store.selectedAlgorithms.length === 1 ? 3 : 1;
  s.data_completeness  = store.experimentResult ? store.experimentResult.total_runs >= 4 ? 4 : 3 : 1;
  s.analysis_depth     = store.studentAnalysis.trim().length > 30 ? 4 : store.studentAnalysis.trim().length > 0 ? 3 : 1;
  s.reflection_quality = Object.values(store.reflectionAnswers).filter((v) => v?.trim()).length >= 3 ? 4 : Object.values(store.reflectionAnswers).some((v) => v?.trim()) ? 3 : 2;
  s.writing_clarity    = store.reportMarkdown.length > 300 ? 4 : store.reportMarkdown.length > 100 ? 3 : 2;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (s.question_clarity >= 4) strengths.push("研究问题表述清晰");
  else weaknesses.push("研究问题可以描述得更具体");
  if (s.experiment_design >= 4) strengths.push("选择了合适的算法进行对比实验");
  else weaknesses.push("建议对比至少 2 种算法");
  if (s.data_completeness >= 4) strengths.push("收集了足够的实验数据");
  else weaknesses.push("实验数据偏少，可以增加重复次数");
  if (s.analysis_depth >= 4) strengths.push("对实验结果进行了有深度的分析");
  else weaknesses.push("分析可以更深入，尝试解释数据背后的原因");
  if (s.reflection_quality >= 4) strengths.push("认真反思了实验的局限性和改进方向");
  else weaknesses.push("对实验局限性的反思可以更多一些");
  if (s.writing_clarity >= 4) strengths.push("报告结构完整，表达清晰");

  return {
    scores: s,
    strengths: strengths.length > 0 ? strengths : ["完成了科研报告的基本结构"],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["继续完善各部分内容"],
    revision_suggestions: ["用具体数据支撑你的结论", "补充实验的局限性和改进方向", "尝试用图表展示关键数据对比"],
    review_questions: ["你的结论是基于数据还是直觉？", "如果迷宫再大一倍，哪个算法最受影响？"],
  };
}

// ═══════ helpers ═══════
function suggestFallback(input: string): string[] {
  const qs: string[] = [];
  if (/快|慢|速度|时间/.test(input)) qs.push(`在不同障碍物比例的迷宫中，${pickAlgo(input)} 的运行时间是否比 BFS 更短？`);
  if (/路径|最短|步数|距离/.test(input)) qs.push(`迷宫复杂度增加时，${pickAlgo(input)} 是否仍能找到最短路径？`);
  if (/成功|失败|找到|到达/.test(input)) qs.push(`障碍物比例超过多少时，各算法的成功率会显著下降？`);
  if (/节点|搜索|效率/.test(input)) qs.push(`${pickAlgo(input)} 的搜索效率（搜索节点数）在什么条件下最优？`);
  if (/比较|对比|哪个|最好|变化/.test(input)) qs.push(`在迷宫大小和障碍物比例同时变化时，哪种算法表现最稳定？`);
  if (qs.length < 2) qs.push(`在不同障碍物比例的迷宫中，${pickAlgo(input)} 是否比 BFS 搜索节点更少、运行更快？`, "迷宫复杂度增加时，各种算法的运行时间有什么变化？");
  return qs.slice(0, 3);
}
function pickAlgo(s: string): string { for (const a of ["A*","BFS","DFS","Random"]) if (s.includes(a)) return a; return "A*"; }
function makeHypothesisFeedback(t: string): string {
  const w = /因为|原因|由于/.test(t), m = /路径|步数|节点|时间|速率|毫秒|快|慢|短|长/.test(t);
  if (!w && !m) return "你的假设说了谁会更好，但没解释为什么。能补充一下你的理由吗？比如：A* 更快是因为它会朝终点方向搜索。";
  if (!m) return "你说的理由很有道理！能不能进一步说明，你打算用什么指标来判断'好'？是路径更短、运行更快，还是搜索节点更少？";
  return "很好的假设！你提到了具体指标。想一想：如果障碍物比例增大，你的预测还会成立吗？";
}
function buildReportMd(store: ReturnType<typeof useWorkflowStore.getState>): string {
  const reflectionText = REFLECTION_QUESTIONS.map((q, i) => `**${q}**\n\n${store.reflectionAnswers[i] || "（待补充）"}`).join("\n\n");
  const algoSummary = store.experimentResult ? Object.entries(store.experimentResult.summary).map(([a, s]: any) => `| ${a} | ${(s.success_rate * 100).toFixed(0)}% | ${s.avg_path_length ?? "-"} | ${s.avg_expanded_nodes} | ${s.avg_runtime_ms}ms |`).join("\n") : "| - | - | - | - | - |";
  return [`# 迷宫寻路算法比较研究`, ``, `## 1. 研究问题`, ``, store.refinedQuestion || store.rawQuestion || "（待补充）", ``, `## 2. 我的假设`, ``, store.hypothesis || "（待补充）", ``, `## 3. 实验设计`, ``, `- 对比算法：${store.selectedAlgorithms.join("、")}`, `- 迷宫大小：${store.mazeSize[0]}×${store.mazeSize[1]}`, `- 障碍物比例：${store.obstacleRatios.map((r) => (r * 100).toFixed(0) + "%").join("、")}`, `- 每组重复：${store.numTrials} 次`, `- 评价指标：${store.selectedMetrics.join("、")}`, ``, `## 4. 实验结果`, ``, `| 算法 | 成功率 | 平均路径长度 | 平均搜索节点 | 平均运行时间 |`, `|---|---:|---:|---:|---:|`, algoSummary, ``, `## 5. 结果分析`, ``, store.studentAnalysis || "（待补充）", ``, `## 6. 反思与改进`, ``, reflectionText, ``, `## 7. 总结`, ``, `（待补充）`].join("\n");
}

// ═══════ 本地迷宫模拟 ═══════
function generateMockRun(w: number, h: number, ratio: number, algo: string, seed: number, trials: number, customMazes?: Record<string, number[][]>) {
  const rng = seededRandom(seed); const runs: any[] = []; let tp = 0, tn = 0, tm = 0, sc = 0;
  for (let t = 0; t < trials; t++) {
    const trialKey = String(t + 1);
    const customGrid = customMazes?.[trialKey];
    const useCustom = !!customGrid && customGrid.length > 0 && customGrid[0]?.length > 0;
    const grid: number[][] = useCustom
      ? customGrid.map((row: number[]) => [...row])
      : (() => { const g: number[][] = []; for (let y = 0; y < h; y++) { g[y] = []; for (let x = 0; x < w; x++) g[y][x] = (x === 0 && y === 0) || (x === w - 1 && y === h - 1) ? 0 : rng() < ratio ? 1 : 0; } return g; })();
    const path: [number, number][] = [[0, 0]], visited: [number, number][] = [[0, 0]], vset = new Set(["0,0"]); let cx = 0, cy = 0, step = 0, ok = false;
    while (step < (algo === "RANDOM" ? 500 : w * h * 2)) {
      if (cx === w - 1 && cy === h - 1) { ok = true; break; }
      const nb: [number, number][] = []; for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] === 0) nb.push([nx, ny]); }
      if (!nb.length) break;
      let next: [number, number]; if (algo === "RANDOM") next = nb[Math.floor(rng() * nb.length)]; else if (algo === "DFS" || algo === "IDDFS") next = nb[nb.length - 1];
      else { nb.sort((a, b) => { const da = Math.abs(a[0] - (w - 1)) + Math.abs(a[1] - (h - 1)), db = Math.abs(b[0] - (w - 1)) + Math.abs(b[1] - (h - 1)); return (algo === "A*" || algo === "GREEDY" || algo === "DIJKSTRA" || algo === "BIDIRECTIONAL") ? da - db : db - da; }); next = nb[0]; }
      cx = next[0]; cy = next[1]; path.push([cx, cy]); const k = `${cx},${cy}`; if (!vset.has(k)) { vset.add(k); visited.push([cx, cy]); } step++;
    }
    if (!ok && algo === "RANDOM") ok = rng() < 0.2; else if (!ok) ok = rng() < 0.85;
    const pl = ok ? path.findIndex(([px, py]) => px === w - 1 && py === h - 1) + 1 : path.length;
    const nc = visited.length + (algo === "BFS" || algo === "DIJKSTRA" ? Math.floor(w * h * 0.4) : algo === "A*" ? Math.floor(w * h * 0.25) : algo === "GREEDY" ? Math.floor(w * h * 0.15) : algo === "BIDIRECTIONAL" ? Math.floor(w * h * 0.2) : algo === "IDDFS" ? Math.floor(w * h * 0.35) : algo === "DFS" ? Math.floor(w * h * 0.3) : Math.floor(w * h * 0.5));
    if (ok) sc++; tp += pl; tn += nc; tm += algo === "A*" ? 0.5 + rng() * 2 : algo === "GREEDY" ? 0.3 + rng() * 1 : algo === "BIDIRECTIONAL" ? 0.5 + rng() * 1.5 : algo === "BFS" || algo === "DIJKSTRA" ? 1 + rng() * 3 : algo === "IDDFS" ? 1.5 + rng() * 4 : algo === "DFS" ? 0.8 + rng() * 2.5 : 2 + rng() * 5;
    runs.push({ algorithm: algo, obstacle_ratio: ratio, maze_size: [w, h], trial: t + 1, seed, success: ok, path_length: pl, expanded_nodes: nc, runtime_ms: +(algo === "A*" ? 0.5 + rng() * 2 : algo === "GREEDY" ? 0.3 + rng() * 1 : algo === "BIDIRECTIONAL" ? 0.5 + rng() * 1.5 : algo === "BFS" || algo === "DIJKSTRA" ? 1 + rng() * 3 : algo === "IDDFS" ? 1.5 + rng() * 4 : algo === "DFS" ? 0.8 + rng() * 2.5 : 2 + rng() * 5).toFixed(2), path: path.slice(0, pl), visited_nodes: visited.slice(0, nc), maze_grid: grid });
  }
  return { runs, stats: { success_rate: +(sc / trials).toFixed(2), avg_path_length: +(tp / trials).toFixed(1), avg_expanded_nodes: +(tn / trials).toFixed(1), avg_runtime_ms: +(tm / trials).toFixed(1) } };
}
function seededRandom(seed: number) { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; }; }
