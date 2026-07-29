/**
 * 强化学习格子世界研究工作台 — 5 阶段（设计文档 §4.4）
 * 流程: 选择任务 → 设计实验 → 运行实验 → 分析结果 → 总结报告
 */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import RLGridVisualizer, { ComparePath } from "../components/RLGridVisualizer";
import { useRLStore } from "../stores/rlStore";
import { callMentor, callDataAnalyst, hasAgentConfig, logAgentError } from "../api/service";
import { detectBaseUrl } from "../api/client";
import { archiveSession } from "./Archive";
import { renderMarkdown } from "../utils/markdown";
import type { ResearchStage } from "../types";

const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REPORT_GENERATED",    label: "总结报告" },
];

const QUESTION_TEMPLATES = [
  "探索率 ε 对 Q-learning 学习速度有什么影响？",
  "如果陷阱惩罚太大，机器人会不会不敢靠近目标？",
  "SARSA 和 Q-learning 在陷阱多的环境中谁更安全？",
  "折扣因子 γ 较小（只看近期）时，机器人能学会找金币吗？",
];

const AGENT_LIST = [
  { key: "Q_LEARNING", name: "Q-learning", desc: "Off-policy — 用最优未来动作值更新，更激进", pros: ["收敛快","偏向最优策略"], cons: ["可能忽略风险"] },
  { key: "SARSA", name: "SARSA", desc: "On-policy — 用实际选取的动作更新，更保守安全", pros: ["安全稳健","考虑探索风险"], cons: ["收敛稍慢"] },
];

const RL_INFO: Record<string, { explanation: string; analogy: string; key_points: string[] }> = {
  Q_LEARNING: {
    explanation: "Q-learning 是一种 off-policy 的强化学习算法。更新 Q 值时，用 s' 状态下所有可能动作中 Q 值最大的那个来计算目标值，不考虑实际会选哪个动作。因此它更激进，偏向学习最优策略。",
    analogy: "像学习下棋时，复盘每一个局面都假设自己接下来会走最优的一步——即使当时没那么走。",
    key_points: ["Off-policy", "贪心目标值 max Q(s',a')", "更激进，收敛快"],
  },
  SARSA: {
    explanation: "SARSA 是一种 on-policy 的强化学习算法。更新 Q 值时用实际选取的下一个动作 a' 来计算目标值（包括探索时的随机选择）。因此它更保守，考虑到了探索过程中的风险。",
    analogy: "像一边走路一边记录——踩到坑了就把这条路标为危险，不假设自己以后会绕开。",
    key_points: ["On-policy", "实际动作 Q(s',a')", "更保守，安全稳健"],
  },
};

const GRID_SIZES = [6, 8, 10];
const TRAP_COUNTS = [1, 3, 5];
const EPISODES = [500, 1000, 2000];
const LEARNING_RATES = [0.01, 0.1, 0.3];
const DISCOUNTS = [0.5, 0.9, 0.99];
const EPSILONS = [0.01, 0.1, 0.3];
const TRIALS = [1, 3, 5];

type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(agentName: string, stage: string, fn: () => Promise<{ result?: unknown } | null>): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent", agentName };
  try { const resp = await fn(); const result = resp?.result as Record<string, unknown> | undefined; if (result?.error) { logAgentError(agentName, stage, String(result.error)); return { ok: false, error: String(result.error), agentName }; } if (result && Object.keys(result).length > 0) return { ok: true, data: result }; return { ok: false, error: `${agentName} 返回空结果`, agentName }; }
  catch (e: any) { logAgentError(agentName, stage, e?.message || String(e)); return { ok: false, error: e?.message || String(e), agentName }; }
}

// ═══════════════════════════════════════════════════════════
export default function RLWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useRLStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => { const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id); }, [sessionId]);
  if (store.sessionId === null) return null;

  return (
    <Layout>
      <div className="flex relative" style={{ minHeight: "calc(100vh - 56px)" }}>
        {sidebarOpen && (
        <aside className="w-48 bg-white border-r border-gray-200 p-3 flex-shrink-0">
          <h1 className="text-base font-bold text-gray-800 mb-1">研究工作台</h1>
          <p className="text-[10px] text-gray-400 mb-3">🤖 强化学习格子世界</p>
          <FlowStepper steps={STEPS} current={store.currentStage} onStepClick={(s) => {
            if (s === "TASK_SELECTED") { store.setStage("TASK_SELECTED"); return; }
            const keys = STEPS.map(st => st.key);
            if (!store.refinedQuestion) { store.setStage("TASK_SELECTED"); return; }
            if (keys.indexOf(s) > keys.indexOf("EXPERIMENT_DESIGNED") && !store.designCompleted) store.setStage("EXPERIMENT_DESIGNED");
            else store.setStage(s);
          }} />
        </aside>
        )}
        <div className="flex-1 overflow-auto bg-gray-50">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="sticky top-2 left-2 z-10 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-100 hover:border-gray-300 transition-colors shadow-sm"
            title={sidebarOpen ? "折叠侧栏 → 显示区拉宽" : "展开侧栏"}
          >
            <span className="text-[10px] text-gray-400">{sidebarOpen ? "◀" : "▶"}</span>
          </button>
          <StageRouter />
        </div>
      </div>
    </Layout>
  );
}

function StageRouter() {
  const stage = useRLStore((s) => s.currentStage);
  switch (stage) {
    case "EXPERIMENT_DESIGNED": return <Stage2 />; case "EXPERIMENT_RUNNING": return <Stage3 />;
    case "RESULT_ANALYZED": return <Stage4 />; case "REPORT_GENERATED": return <Stage5 />;
    default: return <Stage1 />;
  }
}

// ═══════ Stage1 ═══════
function Stage1() {
  const store = useRLStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const r = await callAgent("research_mentor", "研究问题", () =>
      callMentor({ task: "强化学习—机器人找金币", student_input: store.rawQuestion, grade_level: "beginner" }));
    if (r.ok) store.set({ suggestedQuestions: (r.data as any).suggested_questions || [QUESTION_TEMPLATES[0]] });
    else { store.set({ suggestedQuestions: [QUESTION_TEMPLATES[0]] }); setMsg({ text: r.error, ok: false }); }
    setLoading(false);
  };
  const selectedQ = store.refinedQuestion;
  const flowItems = selectedQ ? [
    { stage: "选择研究任务", output: "强化学习格子世界 — Q-learning vs SARSA" },
    { stage: "设计实验", output: `地图 ${store.gridSize}×${store.gridSize} / ${store.numTraps}陷阱 / 训练 ${store.numEpisodes}局` },
    { stage: "运行实验", output: "智能体训练 → 测试 → 路径展示" },
    { stage: "分析结果", output: "成功率 / 平均奖励 / 训练曲线" },
    { stage: "总结报告", output: "自动生成实验报告" },
  ] : null;

  return (
    <StageContainer step={1} title="选择研究任务" agent={msg}>
      <div className="card"><h3 className="font-semibold mb-2">🤖 强化学习格子世界</h3><p className="text-sm text-gray-500">机器人在格子世界中移动，需要找到金币 💰 并避开陷阱 💀。通过 Q-learning 和 SARSA 对比 on-policy 与 off-policy 的差异。</p></div>
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">选择或输入你想研究的问题</h2>
        <div className="grid gap-2 mb-3">{QUESTION_TEMPLATES.map(t => (
          <button key={t} onClick={() => store.set({ refinedQuestion: t, rawQuestion: t })} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedQ === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>
        ))}</div>
        <textarea className="w-full min-h-[60px] p-3 border rounded-lg text-sm resize-y" placeholder="或用你自己的话描述..." value={store.rawQuestion} onChange={e => store.set({ rawQuestion: e.target.value })} />
        <button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化"}</button>
        {store.suggestedQuestions.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3"><h3 className="font-semibold text-gray-700 text-sm mb-2">AI 建议的研究问题</h3>
            <div className="space-y-1">{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => store.set({ refinedQuestion: q, rawQuestion: q })} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedQ === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border"}`}>{q}</button>)}</div></div>)}
      </div>
      {selectedQ && (<>
        {flowItems && (<div className="card border-green-100 bg-green-50/30"><h3 className="font-semibold text-sm text-gray-700 mb-3">📋 研究流程预览</h3><div className="space-y-2">{flowItems.map((item, i) => (<div key={i} className="flex gap-3 text-xs"><span className="w-24 text-gray-400 shrink-0">{item.stage}</span><span className="text-gray-600">{item.output}</span></div>))}</div></div>)}
        <div className="flex justify-end"><button className="btn-primary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>确认 → 设计实验</button></div>
      </>)}
    </StageContainer>
  );
}

// ═══════ Stage2 ═══════
function Stage2() {
  const store = useRLStore();
  const [infoAgent, setInfoAgent] = useState<string | null>(null);
  const toggle = (a: typeof AGENT_LIST[0]) => {
    const arr = store.selectedAgents;
    if (arr.includes(a.key)) { store.set({ selectedAgents: arr.filter(x => x !== a.key) }); if (infoAgent === a.key) setInfoAgent(null); }
    else { store.set({ selectedAgents: [...arr, a.key] }); setInfoAgent(a.key); }
  };
  const info = infoAgent ? RL_INFO[infoAgent] ?? null : null;

  return (
    <StageContainer step={2} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }} disabled={store.selectedAgents.length === 0}>下一步 → 运行实验</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">我要比较的算法 {store.selectedAgents.length === 0 && <span className="text-xs font-normal text-gray-400">（请至少选一个）</span>}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {AGENT_LIST.map(a => (
            <button key={a.key} onClick={() => toggle(a)} className={`text-left px-4 py-3 rounded-lg text-sm border transition-all ${store.selectedAgents.includes(a.key) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"}`}>
              <div className="font-semibold">{a.name}</div><div className="text-xs opacity-70 mt-0.5">{a.desc}</div>
            </button>
          ))}
        </div>
      </div>
      {info && (
        <div className="card border-blue-200 bg-blue-50/30"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-gray-800">{infoAgent === "Q_LEARNING" ? "Q-learning" : "SARSA"} 原理</h2><button onClick={() => setInfoAgent(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button></div><p className="text-sm text-gray-600 mb-3">{info.explanation}</p><div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {info.analogy}</div><div className="flex flex-wrap gap-1.5">{info.key_points.map(p => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}</div></div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">地图大小</h3><div className="space-y-1">{GRID_SIZES.map(s => <button key={s} onClick={() => store.set({ gridSize: s })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.gridSize === s ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{s}×{s}</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">陷阱数量</h3><div className="space-y-1">{TRAP_COUNTS.map(t => <button key={t} onClick={() => store.set({ numTraps: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTraps === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 个</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">训练局数</h3><div className="space-y-1">{EPISODES.map(e => <button key={e} onClick={() => store.set({ numEpisodes: e })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numEpisodes === e ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{e}</button>)}</div></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">学习率 α</h3><div className="space-y-1">{LEARNING_RATES.map(lr => <button key={lr} onClick={() => store.set({ learningRate: lr })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.learningRate === lr ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{lr}</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">折扣因子 γ</h3><div className="space-y-1">{DISCOUNTS.map(d => <button key={d} onClick={() => store.set({ discount: d })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.discount === d ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{d}</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">探索率 ε</h3><div className="space-y-1">{EPSILONS.map(e => <button key={e} onClick={() => store.set({ epsilon: e })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.epsilon === e ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{e}</button>)}</div></div>
      </div>
      <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">重复实验</h3><div className="space-y-1">{TRIALS.map(t => <button key={t} onClick={() => store.set({ numTrials: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
    </StageContainer>
  );
}

// ═══════ Stage3 ═══════
function Stage3() {
  const store = useRLStore();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const execRun = async () => {
    setRunning(true); setRunError(null);
    try {
      const baseUrl = detectBaseUrl();
      const resp = await fetch(`${baseUrl}/api/rl/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: store.sessionId!, agents: store.selectedAgents,
          settings: { grid_size: store.gridSize, num_traps: store.numTraps, num_episodes: store.numEpisodes, learning_rate: store.learningRate, discount: store.discount, epsilon: store.epsilon, num_trials: store.numTrials, seed: (Date.now() % 9000) + 1000 },
        }),
      });
      if (!resp.ok) { const t = await resp.text(); setRunError(t.slice(0, 500)); return; }
      const data = await resp.json();
      store.set({ experimentResult: data, selectedTrial: 1 });
    } catch (e: any) { setRunError(`请求失败: ${e?.message}`); }
    finally { setRunning(false); }
  };

  useEffect(() => { if (!store.experimentResult) execRun(); }, []);

  const result = store.experimentResult;
  // Filter runs by selected trial — works because batch /api/rl/run tags each run with trial 1..N
  const displayRuns = result?.runs ? result.runs.filter((r: any) => r.trial === store.selectedTrial) : [];
  const nameOf = (a: string) => AGENT_LIST.find(x => x.key === a)?.name || a;

  // Build dual-path overlay from current trial's runs
  const comparePaths: ComparePath[] = displayRuns.map((r: any) => ({ agent: r.agent, path: r.test_path || [] }));
  const world = displayRuns[0]?.world;

  return (
    <StageContainer step={3} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}>
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="font-semibold">实验配置</h2><p className="text-sm text-gray-400">{store.selectedAgents.map(nameOf).join("、")} | {store.gridSize}×{store.gridSize} | {store.numTraps}陷阱 | {store.numEpisodes}局 | α={store.learningRate} γ={store.discount} ε={store.epsilon} | ×{store.numTrials}</p></div>
          <div className="flex gap-2">
            <button className="btn-primary text-lg px-6" onClick={execRun} disabled={running}>{running ? "⏳ 训练中..." : result ? "🔄 重新运行" : "▶ 开始实验"}</button>
          </div>
        </div>
        {result && store.numTrials > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-medium">切换组别：</span>
            {Array.from({ length: store.numTrials }, (_, i) => i + 1).map(t => (
              <button key={t} onClick={() => store.set({ selectedTrial: t })} className={`px-3 py-1 rounded-full text-xs font-medium ${store.selectedTrial === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>第{t}组</button>
            ))}
          </div>
        )}
      </div>

      {runError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="text-sm font-medium text-red-700 mb-1">运行失败</p><pre className="text-xs text-red-600 whitespace-pre-wrap">{runError}</pre></div>
      )}

      {/* ── 测试路径：双路径叠加 + 决策动画面板 ── */}
      {displayRuns.length > 0 && (
        <DualPathPanel
          world={world}
          comparePaths={comparePaths}
          runs={displayRuns}
          trial={store.selectedTrial}
          nameOf={nameOf}
        />
      )}

      {/* ── 公式说明 + 训练结果解读 ── */}
      {result && displayRuns.length > 0 && (
        <RLExplanation alpha={store.learningRate} gamma={store.discount} epsilon={store.epsilon} />
      )}
    </StageContainer>
  );
}

// ═════════════════════════════════════════════════
// 双路径面板：叠加轨迹动画 + 每步决策 Q 值详情
// ═════════════════════════════════════════════════

const ACTION_LABELS = ["←", "→", "↑", "↓"];
const AGENT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Q_LEARNING: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300" },
  SARSA: { bg: "bg-green-50", text: "text-green-700", border: "border-green-300" },
};

function DualPathPanel({ world, comparePaths, runs, trial, nameOf }: {
  world: any;
  comparePaths: ComparePath[];
  runs: any[];
  trial: number;
  nameOf: (a: string) => string;
}) {
  const maxSteps = comparePaths.length > 0
    ? Math.min(...comparePaths.map(cp => cp.path.length - 1))
    : 0;

  const [animStep, setAnimStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset on trial/data change
  const dataKey = `${trial}-${comparePaths.map(c => c.path.length).join(",")}`;
  const dataKeyRef = useRef(dataKey);
  useEffect(() => {
    if (dataKeyRef.current !== dataKey) { dataKeyRef.current = dataKey; setAnimStep(0); setPlaying(true); }
  }, [dataKey]);

  // Animation timer
  useEffect(() => {
    if (playing && maxSteps > 0) {
      const ms = Math.round(500 / speed);
      timerRef.current = setInterval(() => {
        setAnimStep(prev => {
          if (prev >= maxSteps) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }, ms);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, speed, maxSteps]);

  const togglePlay = () => {
    if (animStep >= maxSteps) setAnimStep(0);
    setPlaying(p => !p);
  };

  // Collect per-step decisions for current step from each agent's test_decisions
  const curDecisions = runs.map((r: any) => {
    const decs = r.test_decisions || [];
    const d = decs[Math.min(animStep, decs.length - 1)];
    return d ? { agent: r.agent, ...d } : null;
  }).filter(Boolean);

  return (
    <div className="card overflow-x-auto">
      <h3 className="font-semibold text-gray-700 mb-1 text-sm">第 {trial} 组 — 测试路径</h3>
      <p className="text-xs text-gray-400 mb-3">
        Q-learning (蓝色实线) vs SARSA (绿色虚线)，从同一起点出发，逐步展示每步决策。
      </p>

      <div className="flex gap-4 flex-wrap items-start">
        {/* ── 双路径叠加 Canvas ── */}
        <RLGridVisualizer world={world} comparePaths={comparePaths} animatedStep={animStep} hideLegend />

        {/* ── 控制 + 决策面板 ── */}
        <div className="flex-1 min-w-[240px] max-w-sm">
          {/* 播放控制 */}
          <div className="flex items-center gap-2 mb-3">
            <button onClick={togglePlay} className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 min-w-[56px]">
              {playing ? "⏸ 暂停" : "▶ 播放"}
            </button>
            <button onClick={() => { setPlaying(false); setAnimStep(0); }} className="px-2.5 py-1.5 rounded-full text-xs border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">
              ⏮ 重置
            </button>
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-full px-2 py-1 bg-white">
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
            </select>
          </div>

          {/* 步数滑块 */}
          <div className="mb-3">
            <input type="range" min={0} max={maxSteps} value={animStep}
              onChange={e => { setPlaying(false); setAnimStep(Number(e.target.value)); }}
              className="w-full h-1.5 accent-blue-600" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>Step {animStep}/{maxSteps}</span>
              <span>{animStep === maxSteps ? "✅ 完成" : ""}</span>
            </div>
          </div>

          {/* ── 每步决策详情 + 原因解释 ── */}
          {curDecisions.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-medium text-gray-500">第 {animStep + 1} 步决策</span>
              {curDecisions.map((d: any) => {
                const style = AGENT_STYLES[d.agent] || AGENT_STYLES.Q_LEARNING;
                const allQs = d.q_values || [];
                const bestIdx = d.best_action ?? 0;
                const chosenIdx = d.action ?? 0;
                const maxAbsQ = allQs.length > 0 ? Math.max(...allQs.map((v: number) => Math.abs(v))) : 1;
                return (
                  <div key={d.agent} className={`border rounded-lg p-2.5 ${style.bg} ${style.border}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-semibold ${style.text}`}>{nameOf(d.agent)}</span>
                      <span className="text-[10px] text-gray-500">
                        ({d.state?.[0]},{d.state?.[1]}) → <b>{ACTION_LABELS[chosenIdx]}</b>
                      </span>
                    </div>
                    {/* Q 值条 */}
                    <div className="space-y-0.5">
                      {allQs.map((v: number, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px]">
                          <span className={`w-4 text-right font-mono ${i === bestIdx ? "font-bold" : "text-gray-400"}`}>
                            {ACTION_LABELS[i]}
                          </span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${i === bestIdx ? (d.agent === "Q_LEARNING" ? "bg-blue-500" : "bg-green-500") : "bg-gray-400"}`}
                              style={{ width: `${maxAbsQ > 0 ? Math.max(3, Math.abs(v) / maxAbsQ * 100) : 0}%` }}
                            />
                          </div>
                          <span className={`w-11 text-right font-mono ${i === bestIdx ? "font-bold " + style.text : "text-gray-400"}`}>
                            {v >= 0 ? "+" : ""}{v.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 结果摘要 */}
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
            {runs.map((r: any) => (
              <div key={r.agent} className="text-center text-[10px]">
                <span className="font-semibold">{nameOf(r.agent)}</span>
                <span className="text-gray-400 ml-1">
                  {r.test_success ? "✅" : "❌"} {r.test_reward} 奖励 · {Math.round(r.runtime_ms)}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════
// 训练结果解释 + 奖励计算公式
// ═════════════════════════════════════════════════

function RLExplanation({ alpha, gamma, epsilon }: {
  alpha: number; gamma: number; epsilon: number;
}) {
  return (
    <div className="space-y-4">
      {/* ── Q-learning vs SARSA 公式对比 ── */}
      <div className="card border-purple-100 bg-purple-50/20">
        <h3 className="font-semibold text-gray-700 mb-2 text-sm">🔢 Q-learning vs SARSA — 更新规则差异</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <p className="font-bold text-blue-700 mb-1">Q-learning (Off-policy)</p>
            <p className="font-mono text-gray-600 mb-1">Q(s,a) ← Q(s,a) + α·[ r + γ·<span className="text-blue-600 font-bold">max Q(s',a')</span> − Q(s,a) ]</p>
            <p className="text-gray-400 mt-1">更新用<span className="font-semibold text-blue-600">最优未来动作的 Q 值</span>计算目标，假设下一步一定选最优动作，不考虑探索时的随机选择。因此更<span className="font-semibold text-blue-600">激进</span>，敢于贴边走捷径。</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-green-100">
            <p className="font-bold text-green-700 mb-1">SARSA (On-policy)</p>
            <p className="font-mono text-gray-600 mb-1">Q(s,a) ← Q(s,a) + α·[ r + γ·<span className="text-green-600 font-bold">Q(s',a')</span> − Q(s,a) ]</p>
            <p className="text-gray-400 mt-1">更新用<span className="font-semibold text-green-600">实际选取的下一步动作的 Q 值</span>计算目标，考虑到探索中的随机选择可能带来的风险。因此更<span className="font-semibold text-green-600">保守</span>，会主动绕开陷阱。</p>
          </div>
        </div>
        <div className="mt-2 bg-white rounded-lg p-2 text-[11px] text-gray-500 grid grid-cols-3 gap-2 text-center">
          <div><span className="block text-gray-400">当前参数</span><b>α={alpha}</b> <span className="text-gray-300">学习率</span></div>
          <div><span className="block text-gray-400">当前参数</span><b>γ={gamma}</b> <span className="text-gray-300">折扣因子</span></div>
          <div><span className="block text-gray-400">当前参数</span><b>ε={epsilon}</b> <span className="text-gray-300">探索率</span></div>
        </div>
      </div>
    </div>
  );
}

// ═══════ Stage4 ═══════
function Stage4() {
  const store = useRLStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true); setMsg(null);
    const r = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis || "Q-learning vs SARSA 在格子世界中的表现", experiment_results: store.experimentResult?.summary || {} }));
    store.set({ aiAnalysis: r.ok ? r.data as any : { summary: "Q-learning 通常收敛更快，SARSA 在陷阱多时更安全。", key_findings: [], questions_for_student: ["哪种算法成功率更高？为什么？"] } });
    if (!r.ok) setMsg({ text: r.error, ok: false }); setAnalyzing(false);
  };

  return (
    <StageContainer step={4} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("REPORT_GENERATED")} disabled={!store.studentAnalysis.trim()}>保存 → 总结报告</button></div>}>
      {store.experimentResult && (
        <ChartPanel data={Object.entries(store.experimentResult.summary).map(([a, s]: any) => ({ agent: a, success: +(s.avg_success_rate * 100).toFixed(0), reward: s.avg_reward }))}
          xKey="agent" bars={[{ key: "success", name: "成功率 (%)", color: "#3b82f6" }, { key: "reward", name: "平均奖励", color: "#22c55e" }]} />
      )}
      <div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮你分析</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "分析中..." : "AI 分析"}</button></div>
      {store.aiAnalysis && (<div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">📊 {store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings?.length > 0 && <ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f: string, i: number) => <li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">思考</p>{store.aiAnalysis.questions_for_student?.map((q: string, i: number) => <p key={i} className="text-sm text-gray-500">{i + 1}. {q}</p>)}</div></div>)}
      {/* ── 本次训练结果解读 ── */}
      {store.experimentResult && (() => {
        const rlRuns = (store.experimentResult.runs || []).filter((r: any) => r.trial === store.selectedTrial);
        if (rlRuns.length === 0) return null;
        const nameOf = (a: string) => AGENT_LIST.find(x => x.key === a)?.name || a;
        return (
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">📊 本次训练结果解读</h3>
            <p className="text-xs text-gray-500 mb-2">
              在 {store.gridSize}×{store.gridSize} 地图中训练 {store.numEpisodes} 局，共 {store.numTraps} 个陷阱。
            </p>
            <div className="space-y-2 text-xs">
              {rlRuns.map((r: any) => {
                const isQL = r.agent === "Q_LEARNING";
                const succRate = (r.success_rate * 100).toFixed(0);
                const avgR = r.avg_reward;
                return (
                  <div key={r.agent} className={`rounded-lg p-3 border ${isQL ? "border-blue-100 bg-blue-50/20" : "border-green-100 bg-green-50/20"}`}>
                    <p className="font-semibold mb-1" style={{ color: isQL ? "#1565c0" : "#2e7d32" }}>
                      {nameOf(r.agent)}：{r.test_success ? "✅ 成功到达金币" : "❌ 未到达金币"}
                      <span className="ml-2 font-normal text-gray-400">（{succRate}% 成功率 · 均奖励 {avgR} · {r.runtime_ms}ms）</span>
                    </p>
                    <p className="text-gray-500">
                      {isQL
                        ? `Q-learning 用 max Q(s',a') 更新，假设最优未来。在 ε 衰减后，它倾向于选择 Q 值最高的方向——即使旁边有陷阱也敢于贴边走捷径（因为"最优假设"忽略了探索风险）。${succRate}% 的成功率说明它${Number(succRate) > 80 ? "在大多数情况能避开陷阱" : "有时会因为激进策略掉入陷阱"}。`
                        : `SARSA 用实际动作的 Q(s',a') 更新，把探索中选到坏动作的风险也算进去了。所以在陷阱附近，SARSA 的 Q 值更新会"记住"掉坑的教训，主动绕行。${succRate}% 的成功率说明它${Number(succRate) > 80 ? "的保守策略有效避开了陷阱" : "即使保守也未能完全避开（可能需要更多训练或调整参数）"}。`
                      }
                    </p>
                    <p className="text-gray-400 mt-1">
                      {isQL
                        ? avgR > 0 ? `平均奖励为正（${avgR}），说明大多数 episode 成功到达金币拿到 +10 奖励。` : `平均奖励为负（${avgR}），说明探索阶段频繁掉陷阱（-10）拉低了整体回报。`
                        : avgR > 0 ? `平均奖励为正（${avgR}），保守策略虽然路径较长但稳定获取金币。` : `平均奖励为负（${avgR}），在复杂环境中即使是保守策略也需要更多训练才能稳定。`
                      }
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[100px] p-3 border rounded-lg text-sm resize-y" placeholder="写下发现..." value={store.studentAnalysis} onChange={e => store.set({ studentAnalysis: e.target.value })} /></div>
    </StageContainer>
  );
}

// ═══════ Stage5 ═══════
function Stage5() {
  const store = useRLStore(); const navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const result = store.experimentResult;

  if (!store.reportMarkdown) {
    const summary = result ? Object.entries(result.summary).map(([a, s]: any) => `| ${AGENT_LIST.find(x => x.key === a)?.name || a} | ${(s.avg_success_rate * 100).toFixed(0)}% | ${s.avg_reward} |`).join("\n") : "| - | - | - |";
    store.set({ reportMarkdown: [
      "# 强化学习格子世界 — 机器人找金币研究", "", "## 1. 研究问题", store.refinedQuestion || store.rawQuestion, "",
      "## 2. 我的假设", store.hypothesis, "", "## 3. 实验设计",
      `- 对比算法：${store.selectedAgents.join("、")}`, `- 地图：${store.gridSize}×${store.gridSize}，陷阱：${store.numTraps}个`,
      `- 训练局数：${store.numEpisodes}，学习率：${store.learningRate}`,
      `- 折扣因子：${store.discount}，探索率：${store.epsilon}`,
      `- 重复：${store.numTrials} 次`, "",
      "## 4. 实验结果", "| 算法 | 成功率 | 平均奖励 |", "|---|---|---|", summary, "",
      "## 5. 我的分析", store.studentAnalysis, "", "## 6. 总结",
    ].join("\n") });
  }

  return (
    <StageContainer step={5} title="总结报告" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={() => { archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: store.selectedAgents, summary: result?.summary || null, analysis: store.studentAnalysis, reflection: {}, report: store.reportMarkdown, review: {} }); navigate("/archive"); }}>完成 → 档案</button></div>}>
      <div className="card"><div className="flex gap-2 mb-4"><button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="min-h-[300px] border rounded-lg p-4 bg-white">{renderMarkdown(store.reportMarkdown)}</div> : <textarea className="w-full min-h-[300px] p-4 border rounded-lg font-mono text-sm resize-y" value={store.reportMarkdown} onChange={e => store.set({ reportMarkdown: e.target.value })} />}
      </div>
    </StageContainer>
  );
}
