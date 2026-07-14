/**
 * 猜数字策略研究工作台 — 7 阶段简化流程，聚焦算法学习
 * 复用: Layout, FlowStepper, StageContainer, ChartPanel, AlgorithmCard
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import AlgorithmCard from "../components/AlgorithmCard";
import { useGuessNumberStore } from "../stores/guessNumberStore";
import {
  runGuessExperiment, saveQuestion, saveHypothesis, saveAnalysis,
  callMentor, callDataAnalyst, hasAgentConfig, logAgentError,
} from "../api/service";
import { archiveSession } from "./Archive";
import type { ResearchStage, GuessStrategyType } from "../types";

// ═══════════════════════════════════════════════════════════
const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "QUESTION_DEFINED",    label: "确定研究问题" },
  { key: "HYPOTHESIS_WRITTEN",  label: "写出实验假设" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REPORT_GENERATED",    label: "总结报告" },
];

const QUESTION_TEMPLATES = [
  "二分查找是不是总能最快找到目标？",
  "随机猜测和线性扫描哪个更高效？",
  "数字范围变大对哪种策略影响最小？",
  "为什么二分查找每次都能减少一半范围？",
];
const STRATEGIES: { key: GuessStrategyType; name: string; description: string; pros: string[]; cons: string[] }[] = [
  { key: "BINARY", name: "二分查找", description: "每次猜中间值，根据反馈缩小一半范围", pros: ["效率极高", "log₂N 复杂度"], cons: ["需要有序范围", "理解门槛较高"] },
  { key: "RANDOM", name: "随机猜测", description: "随机猜数字，可能很快也可能很慢", pros: ["简单直观", "不需要知识"], cons: ["极不稳定", "可能重复猜"] },
  { key: "LINEAR", name: "线性扫描", description: "从最小到最大逐个猜", pros: ["一定能找到", "最直接"], cons: ["最慢", "做了很多无用功"] },
];

const STRATEGY_INFO: Record<string, { explanation: string; analogy: string; pros: string[]; cons: string[]; key_points: string[]; pseudocode?: string }> = {
  BINARY: {
    explanation: "二分查找是一种极其高效的搜索策略。它每次猜整个范围的中间值，然后根据「大了」还是「小了」的反馈，立刻排除一半的候选数字。下一次只在新的一半范围里继续猜中间值。这样每次都能把范围减半，所以数字量翻倍只需要多猜一次。",
    analogy: "就像你在字典里查一个单词——你不会从第一页开始逐页翻，而是直接翻到中间，看这个单词应该在前面还是后面，然后在新的一半里继续翻。一本 1000 页的字典只需要翻 10 次就能找到任何词。",
    pros: ["速度极快：100 个数只需猜 7 次", "每次排除一半候选", "是能实现的最优策略"],
    cons: ["数据必须是有序排列的", "需要理解「中间值」的概念"],
    key_points: ["每次猜中间值缩小一半", "log₂(N) 复杂度", "利用反馈来排除候选", "100 个数 → 最多 7 次"],
    pseudocode:
`1. low = 范围最小值, high = 范围最大值
2. while low <= high:
    3. mid = (low + high) / 2    ← 取中间值
    4. if mid == 目标: 找到！
    5. if mid < 目标:
        6. low = mid + 1          ← 目标在右边
    7. else:
        8. high = mid - 1         ← 目标在左边`,
  },
  RANDOM: {
    explanation: "随机猜测没有策略——它每次随机选一个还没猜过的数字，直到猜中为止。因为没有利用任何反馈信息，纯粹靠运气。可能第 1 次就猜中，也可能要猜 100 次。",
    analogy: "就像抽奖——你每次随机抽一个号码，不关心之前的结果。运气好的话第一次就中，运气不好可能要等很久。",
    pros: ["简单，不需要任何准备", "不需要数据排序"],
    cons: ["极不稳定——最好 1 次，最坏 N 次", "平均需要 N/2 次", "没有利用任何反馈"],
    key_points: ["纯随机，不利用反馈", "O(N) 平均复杂度", "最好情况很幸运，最坏情况很糟糕", "体现「策略」的价值"],
  },
  LINEAR: {
    explanation: `线性扫描是最笨的方法——从 1 开始，依次猜 2、3、4... 直到猜中。它保证一定能找到，但完全忽略了「大了还是小了」的反馈信息，所以效率最低。`,
    analogy: "就像你在 100 页的书里逐页翻找一句话——你一定会找到，但如果这句话在第 99 页，你得翻 99 次。而二分查找只需要翻中间的页码就能快速定位。",
    pros: ["一定能找到目标", "简单到不需要思考"],
    cons: ["效率最低：100 个数要猜 100 次", "完全浪费了反馈信息", "不适合大数据量"],
    key_points: ["逐个检查，不利用反馈", "O(N) 复杂度", "最坏 N 次，平均 N/2 次", "帮助理解为什么需要策略"],
  },
};
const TRIALS = [1, 3, 5, 10];

type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(agentName: string, stage: string, fn: () => Promise<{ result?: unknown } | null>): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent", agentName };
  try {
    const resp = await fn();
    const result = resp?.result as Record<string, unknown> | undefined;
    if (result?.error) { logAgentError(agentName, stage, String(result.error)); return { ok: false, error: String(result.error), agentName }; }
    if (result && Object.keys(result).length > 0) return { ok: true, data: result };
    return { ok: false, error: `${agentName} 返回空结果`, agentName };
  } catch (e: any) { logAgentError(agentName, stage, e?.message || String(e)); return { ok: false, error: e?.message || String(e), agentName }; }
}

// ═══════════════════════════════════════════════════════════
export default function GuessNumberWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useGuessNumberStore();
  useEffect(() => { const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id); }, [sessionId]);
  if (store.sessionId === null) return null;
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">猜数字策略研究</p>
          <FlowStepper steps={STEPS} current={store.currentStage} onStepClick={(s) => {
            const keys = STEPS.map(st => st.key);
            if (keys.indexOf(s) > keys.indexOf("EXPERIMENT_DESIGNED") && !store.designCompleted) store.setStage("EXPERIMENT_DESIGNED");
            else store.setStage(s);
          }} />
        </aside>
        <div className="flex-1 overflow-auto bg-gray-50"><StageRouter /></div>
      </div>
    </Layout>
  );
}

function StageRouter() {
  const stage = useGuessNumberStore((s) => s.currentStage);
  switch (stage) {
    case "QUESTION_DEFINED":    return <Stage2 />;
    case "HYPOTHESIS_WRITTEN":  return <Stage3 />;
    case "EXPERIMENT_DESIGNED": return <Stage4 />;
    case "EXPERIMENT_RUNNING":  return <Stage5 />;
    case "RESULT_ANALYZED":     return <Stage6 />;
    case "REPORT_GENERATED":    return <Stage7 />;
    default: return (
      <StageContainer step={1} title="选择研究任务">
        <div className="card"><h3 className="font-semibold mb-2">🎯 猜数字策略研究</h3>
          <p className="text-sm text-gray-500 mb-4">研究二分查找、随机猜测、线性扫描三种策略，理解"算法效率"的真正含义。</p>
          <button className="btn-primary" onClick={() => useGuessNumberStore.getState().setStage("QUESTION_DEFINED")}>开始 → 确定研究问题</button>
        </div>
      </StageContainer>
    );
  }
}

// ═══════ Stage 2 — 研究问题 ═══════
function Stage2() {
  const store = useGuessNumberStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const result = await callAgent("research_mentor", "研究问题", () => callMentor({ task: "猜数字", student_input: store.rawQuestion, grade_level: "beginner" }));
    if (result.ok) store.set({ suggestedQuestions: (result.data as any).suggested_questions || [QUESTION_TEMPLATES[0]] });
    else { store.set({ suggestedQuestions: [QUESTION_TEMPLATES[0]] }); setMsg({ text: result.error, ok: false }); }
    setLoading(false);
  };

  return (
    <StageContainer step={2} title="确定研究问题" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={async () => { try { await saveQuestion({ session_id: store.sessionId!, raw_question: store.rawQuestion, refined_question: store.refinedQuestion, independent_variable: "策略类型", dependent_variables: ["猜测次数"], controlled_variables: ["数字范围"] }); } catch {} store.setStage("HYPOTHESIS_WRITTEN"); }} disabled={!store.refinedQuestion}>确认问题 → 写假设</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">可选问题模板</h2><div className="grid gap-2">{QUESTION_TEMPLATES.map((t) => <button key={t} onClick={() => store.set({ rawQuestion: t })} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${store.rawQuestion === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>)}</div></div>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">用你自己的话描述</h2><textarea className="w-full min-h-[80px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder="例如：二分查找是不是总比随机猜快？" value={store.rawQuestion} onChange={(e) => store.set({ rawQuestion: e.target.value })} /><button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化为研究问题"}</button></div>
      {store.suggestedQuestions.length > 0 && <div className="card border-gray-200 bg-gray-50"><h2 className="font-semibold text-gray-700 mb-3">AI 建议的研究问题（点击选择）</h2><div className="space-y-2">{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => store.set({ refinedQuestion: q })} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${store.refinedQuestion === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-100"}`}>{q}</button>)}</div></div>}
      {store.refinedQuestion && <div className="card border-blue-200 bg-blue-50/50"><h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题：</h3><p className="text-sm text-gray-800 font-medium">{store.refinedQuestion}</p></div>}
    </StageContainer>
  );
}

// ═══════ Stage 3 — 假设 ═══════
function Stage3() {
  const store = useGuessNumberStore();
  return (
    <StageContainer step={3} title="写出实验假设" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("QUESTION_DEFINED")}>← 上一步</button><button className="btn-primary" onClick={async () => { try { await saveHypothesis(store.sessionId!, store.hypothesis); } catch {} store.setStage("EXPERIMENT_DESIGNED"); }} disabled={!store.hypothesis.trim()}>下一步 → 设计实验</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的假设</h2><textarea className="w-full min-h-[120px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder="例如：我认为二分查找会比随机猜测少得多的次数找到目标，因为每次猜能排除一半。" value={store.hypothesis} onChange={(e) => store.set({ hypothesis: e.target.value })} /></div>
    </StageContainer>
  );
}

// ═══════ Stage 4 — 设计实验 ═══════
function Stage4() {
  const store = useGuessNumberStore();
  const [infoStr, setInfoStr] = useState<string | null>(null);
  const toggle = (s: typeof STRATEGIES[0]) => { const arr = store.selectedStrategies; if (arr.includes(s.key)) { store.set({ selectedStrategies: arr.filter((a) => a !== s.key) }); if (infoStr === s.key) setInfoStr(null); } else { store.set({ selectedStrategies: [...arr, s.key] }); setInfoStr(s.key); } };
  const info = infoStr ? STRATEGY_INFO[infoStr] ?? null : null;
  const nameMap: Record<string, string> = { BINARY: "二分查找", RANDOM: "随机猜测", LINEAR: "线性扫描" };
  return (
    <StageContainer step={4} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("HYPOTHESIS_WRITTEN")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }} disabled={store.selectedStrategies.length === 0}>下一步 → 运行实验</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">我要比较的策略 {store.selectedStrategies.length === 0 && <span className="text-xs font-normal text-gray-400">（请至少选择一个）</span>}</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{STRATEGIES.map((s) => <AlgorithmCard key={s.key} name={s.name} description={s.description} selected={store.selectedStrategies.includes(s.key)} onToggle={() => toggle(s)} />)}</div></div>

      {/* 策略原理 */}
      {info && (
        <div className="card border-blue-200 bg-blue-50/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">{nameMap[infoStr!] || infoStr} 策略原理</h2>
            <button onClick={() => setInfoStr(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <p className="text-sm text-gray-600 mb-3">{info.explanation}</p>
          <div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {info.analogy}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {info.key_points.map((p: string) => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}
          </div>
          {info.pseudocode && (
            <details className="text-xs mb-2">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 mb-1">▶ 伪代码</summary>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto text-[11px] leading-relaxed whitespace-pre font-mono">{info.pseudocode}</pre>
            </details>
          )}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {info.pros.map((p) => <span key={p} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✅ {p}</span>)}
            {info.cons.map((p) => <span key={p} className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠️ {p}</span>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数字范围</h3><div className="flex gap-2 items-center"><input type="number" value={store.numberLow} onChange={(e) => store.set({ numberLow: Math.max(1, Number(e.target.value)) })} className="w-20 p-1.5 border rounded text-sm" /><span className="text-gray-400">到</span><input type="number" value={store.numberHigh} onChange={(e) => store.set({ numberHigh: Math.max(store.numberLow + 1, Number(e.target.value)) })} className="w-20 p-1.5 border rounded text-sm" /></div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">重复次数</h3><div className="space-y-1">{TRIALS.map((t) => <button key={t} onClick={() => store.set({ numTrials: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
      </div>
    </StageContainer>
  );
}

// ═══════ Stage 5 — 运行实验 ═══════
function Stage5() {
  const store = useGuessNumberStore();
  const [running, setRunning] = useState(false);
  const [animFrame, setAnimFrame] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [animIter, setAnimIter] = useState(0);

  const execRun = async () => {
    setRunning(true); setAnimFrame(0); setAnimDone(false); setAnimIter(v => v + 1);
    const strs = store.selectedStrategies.length > 0 ? store.selectedStrategies : ["BINARY", "RANDOM", "LINEAR"];
    try {
      const data = await runGuessExperiment({ session_id: store.sessionId!, strategies: strs, settings: { num_trials: store.numTrials, number_range: [store.numberLow, store.numberHigh], seed: (Date.now() % 9000) + 1000 } });
      store.set({ experimentResult: data as any });
    } catch {
      store.set({ experimentResult: generateMock(store) });
    } finally { setRunning(false); }
  };

  useEffect(() => { if (!store.experimentResult) execRun(); }, []);

  // 动画：逐步显示猜测过程
  const result = store.experimentResult;
  const displayRuns = result?.runs ? result.runs.filter((r: any) => r.trial === store.selectedTrial) : [];
  const maxSteps = Math.max(...displayRuns.map((r: any) => r.history?.length || 0), 0);

  useEffect(() => {
    if (maxSteps === 0) { setAnimDone(true); return; }
    setAnimFrame(0); setAnimDone(false);
    const interval = setInterval(() => {
      setAnimFrame((prev) => {
        if (prev >= maxSteps) { clearInterval(interval); setAnimDone(true); return maxSteps; }
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [maxSteps, store.selectedTrial, animIter]);

  const handleReplay = () => setAnimIter(v => v + 1);

  return (
    <StageContainer step={5} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}>
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="font-semibold">实验配置</h2><p className="text-sm text-gray-400">策略：{store.selectedStrategies.join("、") || "二分、随机、线性"} | 范围 {store.numberLow}-{store.numberHigh} | ×{store.numTrials} 次</p></div>
          <div className="flex gap-2">
            <button className="btn-primary text-lg px-6" onClick={execRun} disabled={running}>{running ? "⏳ 运行中..." : result ? "🔄 重新运行" : "▶ 开始实验"}</button>
          </div>
        </div>
        {result && store.numTrials > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">切换回合：</span>
            {Array.from({ length: store.numTrials }, (_, i) => i + 1).map((t) => <button key={t} onClick={() => store.set({ selectedTrial: t })} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${store.selectedTrial === t ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>第{t}回</button>)}
          </div>
        )}
      </div>

      {/* 动画猜测过程 */}
      {displayRuns.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">第 {store.selectedTrial} 回合 · 目标数字：<span className="text-gray-900 font-bold text-lg">{displayRuns[0]?.target}</span></h3>
          {/* 进度条 */}
          {!animDone && <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4"><div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${maxSteps > 0 ? (animFrame / maxSteps * 100) : 0}%` }} /></div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayRuns.map((r: any) => {
              const label = r.strategy === "BINARY" ? "二分查找" : r.strategy === "RANDOM" ? "随机猜测" : "线性扫描";
              const shown = r.history?.slice(0, animFrame) || [];
              const done = animFrame >= (r.history?.length || 0);
              return (
                <div key={r.strategy} className={`rounded-lg p-3 transition-all ${done ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{label}</span>
                    {done ? <span className="text-xs text-green-600 font-medium">✅ {r.guesses} 次</span> : <span className="text-xs text-gray-400">猜了 {shown.length} 次</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {shown.map((g: number, i: number) => (
                      <span key={i} className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-mono font-bold transition-all ${g === r.target ? "bg-green-500 text-white scale-110" : "bg-white border border-gray-200 text-gray-600"}`}>{g}</span>
                    ))}
                    {!done && r.history?.[animFrame] !== undefined && (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-mono font-bold bg-blue-500 text-white animate-pulse">{r.history[animFrame]}</span>
                    )}
                  </div>
                  {done && <p className="text-[10px] text-gray-400 mt-2">共 {r.guesses} 步猜中目标 {r.target}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 重播按钮 */}
      {animDone && <div className="text-center"><button className="btn-secondary text-xs" onClick={handleReplay}>🔄 重播动画</button></div>}

      {/* 图表 */}
      {result && (
        <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ strategy: a, v: s.avg_guesses }))} singleMetric={{ key: "v", label: "平均猜测次数" }} xKey="strategy" />
      )}
    </StageContainer>
  );
}

// ═══════ Stage 6 — 分析结果 ═══════
function Stage6() {
  const store = useGuessNumberStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true); setMsg(null);
    const result = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis, experiment_results: store.experimentResult?.summary || {} }));
    if (!result.ok) setMsg({ text: result.error, ok: false });
    store.set({ aiAnalysis: result.ok ? result.data as any : { summary: "二分查找每次排除一半候选，猜测次数约 log₂(N)；随机和线性需要 O(N)。", key_findings: ["二分查找效率最高", "随机猜测不稳定", "线性扫描最慢但最简单"], questions_for_student: ["为什么二分查找比线性扫描快这么多？", "如果数字范围变成 1-10000，结果会怎样？"] } });
    setAnalyzing(false);
  };
  const handleSave = async () => { try { await saveAnalysis(store.sessionId!, store.studentAnalysis); } catch {} };

  return (
    <StageContainer step={6} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={() => { handleSave(); store.setStage("REPORT_GENERATED"); }} disabled={!store.studentAnalysis.trim()}>保存 → 总结报告</button></div>}>
      {store.experimentResult && (
        <ChartPanel data={Object.entries(store.experimentResult.summary).map(([a, s]: any) => ({ strategy: a, avg: s.avg_guesses, min: s.min_guesses, max: s.max_guesses }))} xKey="strategy"
          bars={[{ key: "avg", name: "平均次数", color: "#3b82f6" }, { key: "min", name: "最少次数", color: "#22c55e" }, { key: "max", name: "最多次数", color: "#ef4444" }]} />
      )}
      <div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮你分析实验结果</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "分析中..." : "AI 分析结果"}</button></div>
      {store.aiAnalysis && <div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">📊 {store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings?.length > 0 && <ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f, i) => <li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">你可以思考：</p>{store.aiAnalysis.questions_for_student?.map((q, i) => <p key={i} className="text-sm text-gray-500">{i + 1}. {q}</p>)}</div></div>}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[100px] p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" placeholder="根据实验结果写下你的发现：哪种策略最好？为什么二分查找这么快？" value={store.studentAnalysis} onChange={(e) => store.set({ studentAnalysis: e.target.value })} /></div>
    </StageContainer>
  );
}

// ═══════ Stage 7 — 总结报告 ═══════
function Stage7() {
  const store = useGuessNumberStore();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const md = buildReport(store);
  if (!store.reportMarkdown) store.set({ reportMarkdown: md });

  const complete = () => {
    archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: store.selectedStrategies, summary: store.experimentResult?.summary || null, analysis: store.studentAnalysis, reflection: {}, report: store.reportMarkdown, review: {} });
    navigate("/archive");
  };

  return (
    <StageContainer step={7} title="总结报告" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={complete}>完成研究 → 查看档案</button></div>}>
      <div className="card">
        <div className="flex gap-2 mb-4"><button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="min-h-[300px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm leading-relaxed">{store.reportMarkdown}</pre></div> : <textarea className="w-full min-h-[300px] p-4 border rounded-lg font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300" value={store.reportMarkdown} onChange={(e) => store.set({ reportMarkdown: e.target.value })} />}
      </div>
    </StageContainer>
  );
}

// ═══════ Helpers ═══════
function buildReport(store: ReturnType<typeof useGuessNumberStore.getState>): string {
  const summary = store.experimentResult ? Object.entries(store.experimentResult.summary).map(([a, s]: any) => `| ${a === "BINARY" ? "二分查找" : a === "RANDOM" ? "随机猜测" : "线性扫描"} | ${s.avg_guesses} | ${s.min_guesses} | ${s.max_guesses} | ${(s.success_rate * 100).toFixed(0)}% |`).join("\n") : "| - | - | - | - | - |";
  return [`# 猜数字策略比较研究`, ``, `## 1. 研究问题`, store.refinedQuestion || store.rawQuestion, ``, `## 2. 我的假设`, store.hypothesis, ``, `## 3. 实验设计`, `- 对比策略：${store.selectedStrategies.join("、")}`, `- 数字范围：${store.numberLow}-${store.numberHigh}`, `- 重复次数：${store.numTrials}`, ``, `## 4. 实验结果`, `| 策略 | 平均次数 | 最少次数 | 最多次数 | 成功率 |`, `|---|---:|---:|---:|---:|`, summary, ``, `## 5. 我的分析 & 学到的知识`, store.studentAnalysis, ``, `## 6. 总结`].join("\n");
}

function generateMock(store: ReturnType<typeof useGuessNumberStore.getState>) {
  const strs = store.selectedStrategies.length > 0 ? store.selectedStrategies : ["BINARY", "RANDOM", "LINEAR"];
  const runs: any[] = [];
  const targets = [42, 73, 15, 88, 5].slice(0, store.numTrials);
  for (let t = 0; t < store.numTrials; t++) {
    const tg = targets[t];
    for (const s of strs) {
      const g = s === "BINARY" ? Math.ceil(Math.log2(store.numberHigh - store.numberLow + 1)) : s === "RANDOM" ? Math.floor((store.numberHigh - store.numberLow + 1) * (0.3 + Math.random() * 0.4)) : tg - store.numberLow + 1;
      runs.push({ strategy: s, target: tg, trial: t + 1, guesses: g, history: [g], success: true, runtime_ms: 0 });
    }
  }
  const groups: Record<string, any[]> = {}; for (const r of runs) { groups[r.strategy] = groups[r.strategy] || []; groups[r.strategy].push(r); }
  const summary: Record<string, any> = {};
  for (const [k, v] of Object.entries(groups)) {
    summary[k] = { avg_guesses: +(v.reduce((s, r) => s + r.guesses, 0) / v.length).toFixed(1), min_guesses: Math.min(...v.map(r => r.guesses)), max_guesses: Math.max(...v.map(r => r.guesses)), success_rate: 1, avg_runtime_ms: 0, count: v.length };
  }
  return { experiment_batch_id: "demo-" + Date.now().toString(36), status: "COMPLETED", total_runs: runs.length, summary, runs };
}
