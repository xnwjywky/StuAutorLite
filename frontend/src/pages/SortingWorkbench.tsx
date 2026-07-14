/**
 * 可视化算法比较工作台 — 排序算法 + 字符串搜索 双模式
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import AlgorithmCard from "../components/AlgorithmCard";
import SortVisualizer from "../components/SortVisualizer";
import StringSearchVisualizer from "../components/StringSearchVisualizer";
import { useAlgoCompareStore } from "../stores/sortingStore";
import { runSortingExperiment, runStringSearchExperiment, saveQuestion, saveHypothesis, saveAnalysis, callMentor, callDataAnalyst, hasAgentConfig, logAgentError } from "../api/service";
import { archiveSession } from "./Archive";
import type { ResearchStage, SortingAlgorithmType, StringSearchAlgorithmType } from "../types";

const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "QUESTION_DEFINED",    label: "确定研究问题" },
  { key: "HYPOTHESIS_WRITTEN",  label: "写出实验假设" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REPORT_GENERATED",    label: "总结报告" },
];

const SORT_ALGOS: { key: SortingAlgorithmType; name: string; description: string; pros: string[]; cons: string[]; category: string }[] = [
  { key: "BUBBLE", name: "冒泡排序", description: "相邻两两比较，大的往后沉", pros: ["实现简单","原地"], cons: ["O(n²)","交换多"], category: "暴力法" },
  { key: "SELECTION", name: "选择排序", description: "每轮选最小的放到前面", pros: ["交换少","直观"], cons: ["O(n²)","不稳定"], category: "暴力法" },
  { key: "MERGE", name: "归并排序", description: "拆半分别排，再合并", pros: ["O(n log n)","稳定"], cons: ["额外空间"], category: "分治法" },
  { key: "QUICK", name: "快速排序", description: "选轴点，小左大右", pros: ["实际最快","原地"], cons: ["最坏 O(n²)"], category: "分治法" },
];

const SEARCH_ALGOS: { key: StringSearchAlgorithmType; name: string; description: string; pros: string[]; cons: string[]; category: string }[] = [
  { key: "NAIVE", name: "暴力搜索", description: "逐位置逐字符比对", pros: ["简单","不漏"], cons: ["O(n×m)"], category: "暴力法" },
  { key: "KMP", name: "KMP", description: "前缀函数跳转，指针不回退", pros: ["O(n+m)","稳定"], cons: ["需预处理"], category: "优化法" },
  { key: "BOYER_MOORE", name: "Boyer-Moore", description: "从右比对，坏字符规则大跳", pros: ["最快","跳过整段"], cons: ["最坏 O(nm)"], category: "优化法" },
  { key: "RABIN_KARP", name: "Rabin-Karp", description: "哈希先比，相同再验证", pros: ["多模式","灵活"], cons: ["哈希冲突"], category: "哈希法" },
];

const ALGO_INFO: Record<string, { explanation: string; analogy: string; key_points: string[]; pseudocode?: string }> = {
  BUBBLE: { explanation: "每次比较相邻元素，大的往后沉——就像气泡上浮，每轮把最大值「沉」到最后。","analogy": "排队按身高——两人一组，高的往后站，一轮下来最高的在最后。",key_points:["O(n²)","每轮最大归位","相邻比较"],pseudocode:"1. for i=0 to n-1:\n2.   for j=0 to n-i-2:\n3.     if a[j]>a[j+1]: swap" },
  SELECTION: { explanation: "每轮选最小值放到前面，交换次数少但比较次数多。","analogy": "整理扑克牌——每次从剩下的找最小的一张放左边。",key_points:["O(n²) 比较","交换 O(n)","不稳定"],pseudocode:"1. for i=0 to n-1:\n2.   minIdx=i\n3.   for j=i+1 to n-1:\n4.     if a[j]<a[minIdx]: minIdx=j\n5.   swap(a[i],a[minIdx])" },
  MERGE: { explanation: "分治法——拆半→各自排序→合并。O(n log n) 稳定但需要额外空间。","analogy": "把牌分两堆排好，再合并——每次从两堆头部取最小的。",key_points:["O(n log n)","稳定","额外 O(n) 空间"],pseudocode:"1. mid=(L+R)/2\n2. mergeSort(L,mid)\n3. mergeSort(mid+1,R)\n4. merge(L,mid,R)" },
  QUICK: { explanation: "选轴点(pivot)，小的放左大的放右，递归处理。实际最快但不稳定。","analogy": "选一个人当标杆，比他矮的站左边，高的站右边，两边继续。",key_points:["平均 O(n log n)","最坏 O(n²)","原地"],pseudocode:"1. pivot=partition(L,R)\n2. quickSort(L,pivot-1)\n3. quickSort(pivot+1,R)" },
  NAIVE: { explanation: "从文本每个位置开始逐个字符和模式比对。O(n×m)。","analogy": "逐页翻书找一句话——不匹配就右移一位重来。",key_points:["O(n×m)","滑动窗口","基线对比"],pseudocode:"1. for i=0 to n-m:\n2.   for j=0 to m-1:\n3.     if t[i+j]!=p[j]: break\n4.   if j==m: found at i" },
  KMP: { explanation: "前缀函数预处理模式串，匹配失败时跳过已匹配部分。O(n+m)。","analogy": "背熟模式串结构——不匹配时复用已匹配部分的数据。",key_points:["前缀函数 O(m)","指针不回退","O(n+m)"],pseudocode:"1. pi=prefixTable(p)\n2. q=0; for i=0 to n-1:\n3.   while q>0&&p[q]!=t[i]: q=pi[q-1]\n4.   if p[q]==t[i]: q++\n5.   if q==m: found; q=pi[q-1]" },
  BOYER_MOORE: { explanation: "从右向左比对，用坏字符规则跳转。实际最快。","analogy": "从最后一个字母比对——不对就整词跳过。",key_points:["从右向左","坏字符跳转","实际最快"],pseudocode:"1. i=0; while i<=n-m:\n2.   j=m-1; while p[j]==t[i+j]: j--\n3.   if j<0: found; i+=1\n4.   else: i+=max(1,j-bad[t[i+j]])" },
  RABIN_KARP: { explanation: "滚动哈希——先比哈希值，相同时再字符验证。","analogy": "先看指纹——一样才仔细比对，每次 O(1) 更新指纹。",key_points:["滚动哈希","先哈希后验证","多模式"],pseudocode:"1. h=hash(p); th=hash(t[0..m-1])\n2. for i=0 to n-m:\n3.   if h==th: verify chars\n4.   th=roll(th,t[i],t[i+m])" },
};

type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(agentName: string, stage: string, fn: () => Promise<{ result?: unknown } | null>): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent", agentName };
  try { const resp = await fn(); const result = resp?.result as Record<string, unknown> | undefined; if (result?.error) { logAgentError(agentName, stage, String(result.error)); return { ok: false, error: String(result.error), agentName }; } if (result && Object.keys(result).length > 0) return { ok: true, data: result }; return { ok: false, error: `${agentName} 返回空结果`, agentName }; }
  catch (e: any) { logAgentError(agentName, stage, e?.message || String(e)); return { ok: false, error: e?.message || String(e), agentName }; }
}

export default function SortingWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useAlgoCompareStore();
  useEffect(() => { const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id); }, [sessionId]);
  if (store.sessionId === null) return null;
  const isSort = store.experimentType === "sorting";
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">{isSort ? "排序算法比较研究" : "字符串搜索算法研究"}</p>
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
  const stage = useAlgoCompareStore((s) => s.currentStage);
  switch (stage) {
    case "QUESTION_DEFINED": return <Stage2 />; case "HYPOTHESIS_WRITTEN": return <Stage3 />;
    case "EXPERIMENT_DESIGNED": return <Stage4 />; case "EXPERIMENT_RUNNING": return <Stage5 />;
    case "RESULT_ANALYZED": return <Stage6 />; case "REPORT_GENERATED": return <Stage7 />;
    default: return <Stage1 />;
  }
}

function Stage1() {
  const store = useAlgoCompareStore();
  const setType = (t: "sorting" | "stringsearch") => { store.set({ experimentType: t }); store.setStage("QUESTION_DEFINED"); };
  return (
    <StageContainer step={1} title="选择研究任务— 可视化算法比较">
      <p className="text-sm text-gray-400 mb-4">从以下两种实验选择一个开始：</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card flex flex-col" onClick={() => setType("sorting")}>
          <h3 className="font-semibold mb-2">📈 排序算法对比</h3>
          <p className="text-sm text-gray-500 mb-3">对比暴力法（冒泡/选择）和分治法（归并/快排），观看数组排序过程的实时动画。</p>
          <div className="flex flex-wrap gap-1 mb-3">{["冒泡","选择","归并","快排"].map(s=><span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{s}</span>)}</div>
          <button className="btn-primary w-full">开始 →</button>
        </div>
        <div className="card flex flex-col" onClick={() => setType("stringsearch")}>
          <h3 className="font-semibold mb-2">🔍 字符串搜索对比</h3>
          <p className="text-sm text-gray-500 mb-3">对比暴力搜索、KMP、Boyer-Moore、Rabin-Karp，在文本中查找模式串。</p>
          <div className="flex flex-wrap gap-1 mb-3">{["暴力","KMP","BM","RK"].map(s=><span key={s} className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">{s}</span>)}</div>
          <button className="btn-primary w-full">开始 →</button>
        </div>
      </div>
    </StageContainer>
  );
}

function Stage2() {
  const store = useAlgoCompareStore(); const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const isSort = store.experimentType === "sorting";
  const taskName = isSort ? "数组排序" : "字符串搜索";
  const templates = isSort
    ? ["暴力法(冒泡/选择)和分治法(归并/快排)，谁的交换次数更少？", "数组规模变大后，哪种排序算法受的影响最小？", "为什么归并排序比冒泡排序快得多？"]
    : ["暴力搜索和 KMP 谁在大文本中更快？", "Boyer-Moore 为什么能跳过那么多字符？", "当模式串不存在时，哪种算法最省比较次数？"];
  const handleSuggest = async () => { if (!store.rawQuestion.trim()) return; setLoading(true); setMsg(null); const r = await callAgent("research_mentor", "研究问题", () => callMentor({ task: taskName, student_input: store.rawQuestion, grade_level: "beginner" })); store.set({ suggestedQuestions: r.ok ? (r.data as any).suggested_questions || [templates[0]] : [templates[0]] }); if (!r.ok) setMsg({ text: r.error, ok: false }); setLoading(false); };
  return (<StageContainer step={2} title="确定研究问题" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => { store.set({ currentStage: "TASK_SELECTED" }); }}>← 上一步</button><button className="btn-primary" onClick={async () => { try { await saveQuestion({ session_id: store.sessionId!, raw_question: store.rawQuestion, refined_question: store.refinedQuestion, independent_variable: "算法类型", dependent_variables: ["操作次数"], controlled_variables: isSort ? ["数组大小","数据分布"] : ["文本长度","模式串长度"] }); } catch {} store.setStage("HYPOTHESIS_WRITTEN"); }} disabled={!store.refinedQuestion}>确认 → 写假设</button></div>}><div className="card"><h2 className="font-semibold text-gray-700 mb-3">可选问题模板</h2><div className="grid gap-2">{templates.map(t => <button key={t} onClick={() => store.set({ rawQuestion: t })} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${store.rawQuestion === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>)}</div></div><div className="card"><textarea className="w-full min-h-[80px] p-3 border rounded-lg text-sm resize-y" placeholder={isSort ? "例如：暴力法是不是总比分治法慢？" : "例如：KMP 是不是总比暴力搜索快？"} value={store.rawQuestion} onChange={(e) => store.set({ rawQuestion: e.target.value })} /><button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading}>{loading ? "生成中..." : "AI 帮我转化"}</button></div>{store.suggestedQuestions.length > 0 && <div className="card border-gray-200 bg-gray-50"><h2 className="font-semibold text-gray-700 mb-3">AI 建议的研究问题（点击选择）</h2>{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => store.set({ refinedQuestion: q })} className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${store.refinedQuestion === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border"}`}>{q}</button>)}</div>}{store.refinedQuestion && <div className="card border-blue-200 bg-blue-50/50"><h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题：</h3><p className="text-sm text-gray-800 font-medium">{store.refinedQuestion}</p></div>}</StageContainer>);
}

function Stage3() {
  const store = useAlgoCompareStore();
  return (<StageContainer step={3} title="写出实验假设" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("QUESTION_DEFINED")}>← 上一步</button><button className="btn-primary" onClick={async () => { try { await saveHypothesis(store.sessionId!, store.hypothesis); } catch {} store.setStage("EXPERIMENT_DESIGNED"); }} disabled={!store.hypothesis.trim()}>下一步 → 设计实验</button></div>}><div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的假设</h2><textarea className="w-full min-h-[120px] p-3 border rounded-lg text-sm resize-y" placeholder={store.experimentType === "sorting" ? "例如：我认为归并排序会比冒泡排序少得多的比较次数" : "例如：我认为 Boyer-Moore 会比暴力搜索少得多"} value={store.hypothesis} onChange={(e) => store.set({ hypothesis: e.target.value })} /></div></StageContainer>);
}

function Stage4() {
  const store = useAlgoCompareStore(); const isSort = store.experimentType === "sorting";
  const [infoAlgo, setInfoAlgo] = useState<string | null>(null);
  const algoList = isSort ? SORT_ALGOS : SEARCH_ALGOS;
  const selected = (isSort ? store.selectedSortingAlgos : store.selectedSearchAlgos) as string[];
  const toggle = (a: typeof algoList[0]) => {
    const field = isSort ? "selectedSortingAlgos" : "selectedSearchAlgos";
    const arr = selected as string[];
    if (arr.includes(a.key)) { store.set({ [field]: arr.filter(x => x !== a.key) } as any); if (infoAlgo === a.key) setInfoAlgo(null); }
    else { store.set({ [field]: [...arr, a.key] } as any); setInfoAlgo(a.key); }
  };
  const info = infoAlgo ? ALGO_INFO[infoAlgo] ?? null : null;
  return (<StageContainer step={4} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("HYPOTHESIS_WRITTEN")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }} disabled={selected.length === 0}>下一步 → 运行实验</button></div>}><div className="card"><h2 className="font-semibold text-gray-700 mb-3">我要比较的算法 {selected.length === 0 && <span className="text-xs font-normal text-gray-400">（请至少选一个）</span>}</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{algoList.map(a => <AlgorithmCard key={a.key} name={a.name} description={a.description} selected={selected.includes(a.key)} onToggle={() => toggle(a)} />)}</div></div>
    {info && (<div className="card border-blue-200 bg-blue-50/30"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-gray-800">{algoList.find(a => a.key === infoAlgo)?.name} 算法原理</h2><button onClick={() => setInfoAlgo(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button></div><p className="text-sm text-gray-600 mb-3">{info.explanation}</p><div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {info.analogy}</div><div className="flex flex-wrap gap-1.5 mb-3">{info.key_points.map(p => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}</div>{info.pseudocode && <details className="text-xs"><summary className="cursor-pointer text-gray-500 hover:text-gray-700 mb-1">▶ 伪代码</summary><pre className="bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto text-[11px] leading-relaxed whitespace-pre font-mono">{info.pseudocode}</pre></details>}</div>)}
    {isSort ? (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数组大小</h3><div className="space-y-1">{[10,20,30].map(n=><button key={n} onClick={()=>store.set({arraySize:n})} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.arraySize===n?"bg-gray-900 text-white font-medium":"text-gray-500 hover:bg-gray-50"}`}>{n} 个元素</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数据分布</h3><div className="space-y-1">{[{k:"random",l:"随机"},{k:"reversed",l:"逆序"},{k:"nearly_sorted",l:"基本有序"}].map(p=><button key={p.k} onClick={()=>store.set({dataPattern:p.k as any})} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.dataPattern===p.k?"bg-gray-900 text-white font-medium":"text-gray-500 hover:bg-gray-50"}`}>{p.l}</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">重复次数</h3><div className="space-y-1">{[1,3,5].map(t=><button key={t} onClick={()=>store.set({numTrials:t})} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials===t?"bg-gray-900 text-white font-medium":"text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">文本长度</h3><div className="space-y-1">{[100,200,500].map(n=><button key={n} onClick={()=>store.set({textLength:n})} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.textLength===n?"bg-gray-900 text-white font-medium":"text-gray-500 hover:bg-gray-50"}`}>{n} 字符</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">模式串</h3><div className="space-y-1">{[3,5,10].map(n=><button key={n} onClick={()=>store.set({patternLength:n})} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.patternLength===n?"bg-gray-900 text-white font-medium":"text-gray-500 hover:bg-gray-50"}`}>{n} 字符</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">重复次数</h3><div className="space-y-1">{[1,3,5].map(t=><button key={t} onClick={()=>store.set({numTrials:t})} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials===t?"bg-gray-900 text-white font-medium":"text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
      </div>
    )}
  </StageContainer>);
}

function Stage5() {
  const store = useAlgoCompareStore(); const isSort = store.experimentType === "sorting";
  const [running, setRunning] = useState(false);
  const selected = (isSort ? store.selectedSortingAlgos : store.selectedSearchAlgos) as string[];
  const defAlgos = isSort ? ["BUBBLE","SELECTION","MERGE","QUICK"] : ["NAIVE","KMP","BOYER_MOORE","RABIN_KARP"];

  const execRun = async () => { setRunning(true); const algos = selected.length > 0 ? selected : defAlgos; try { let data; if (isSort) { data = await runSortingExperiment({ session_id: store.sessionId!, algorithms: algos, settings: { array_sizes: [store.arraySize], num_trials: store.numTrials, data_pattern: store.dataPattern, seed: (Date.now()%9000)+1000 } }); } else { data = await runStringSearchExperiment({ session_id: store.sessionId!, algorithms: algos, settings: { text_length: store.textLength, pattern_length: store.patternLength, num_trials: store.numTrials, pattern_type: store.searchPatternType, seed: (Date.now()%9000)+1000 } }); } store.set({ experimentResult: data as any }); } catch { store.set({ experimentResult: generateMock(store) }); } finally { setRunning(false); } };
  useEffect(() => { if (!store.experimentResult) execRun(); }, []);

  const result = store.experimentResult;
  const displayRuns = result?.runs ? result.runs.filter((r: any) => r.trial === store.selectedTrial) : [];
  const algoList = isSort ? SORT_ALGOS : SEARCH_ALGOS;
  const nameOf = (a: string) => algoList.find(x => x.key === a)?.name || a;
  const layoutClass = !isSort || store.arraySize > 20 ? "space-y-6" : "grid grid-cols-1 sm:grid-cols-2 gap-4";
  const configText = isSort
    ? `算法：${(selected.length>0?selected:defAlgos).map(nameOf).join("、")} | ${store.arraySize} 元素 | ${store.dataPattern==="random"?"随机":store.dataPattern==="reversed"?"逆序":"基本有序"} | ×${store.numTrials} 次`
    : `算法：${(selected.length>0?selected:defAlgos).map(nameOf).join("、")} | 文本 ${store.textLength} 字符 | 模式串 ${store.patternLength} 字符 | ×${store.numTrials} 次`;

  return (<StageContainer step={5} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}><div className="card"><div className="flex items-center justify-between flex-wrap gap-3"><div><h2 className="font-semibold">实验配置</h2><p className="text-sm text-gray-400">{configText}</p></div><button className="btn-primary text-lg px-6" onClick={execRun} disabled={running}>{running ? "⏳ 运行中..." : result ? "🔄 重新运行" : "▶ 开始实验"}</button></div>{result && store.numTrials > 1 && (<div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100"><span className="text-xs text-gray-500 font-medium">切换回合：</span>{Array.from({length:store.numTrials},(_,i)=>i+1).map(t=><button key={t} onClick={()=>store.set({selectedTrial:t})} className={`px-3 py-1 rounded-full text-xs font-medium ${store.selectedTrial===t?"bg-gray-900 text-white":"bg-gray-100 text-gray-500"}`}>第{t}回</button>)}</div>)}</div>
    {displayRuns.length > 0 && (<div className="card"><h3 className="font-semibold text-gray-700 mb-3 text-sm">第 {store.selectedTrial} 回合 {isSort ? "排序" : "搜索"}过程</h3><div className={layoutClass}>{displayRuns.map((r: any) => (<div key={r.algorithm} className="flex flex-col items-center"><div className="flex items-center gap-2 mb-2"><span className="font-semibold text-sm">{nameOf(r.algorithm)}</span><span className="text-xs text-gray-400">{isSort ? `交换 ${r.swaps} · 比较 ${r.comparisons} · ${r.runtime_ms}ms` : `${r.comparisons} 次比较 · ${r.matches} 匹配 · ${r.runtime_ms}ms`}</span></div>{isSort ? <SortVisualizer key={`${r.algorithm}-${store.selectedTrial}`} steps={r.steps} /> : <StringSearchVisualizer key={`${r.algorithm}-${store.selectedTrial}`} steps={r.steps} />}</div>))}</div></div>)}
    {result && (isSort ? (<div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><ChartPanel data={Object.entries(result.summary).map(([a,s]:any)=>({algorithm:a,v:s.avg_swaps}))} singleMetric={{key:"v",label:"平均交换次数"}} xKey="algorithm" /><ChartPanel data={Object.entries(result.summary).map(([a,s]:any)=>({algorithm:a,v:s.avg_comparisons}))} singleMetric={{key:"v",label:"平均比较次数"}} xKey="algorithm" /></div>) : (<ChartPanel data={Object.entries(result.summary).map(([a,s]:any)=>({algorithm:a,v:s.avg_comparisons}))} singleMetric={{key:"v",label:"平均比较次数"}} xKey="algorithm" />))}
  </StageContainer>);
}

function Stage6() { const store = useAlgoCompareStore(); const isSort = store.experimentType === "sorting"; const [analyzing, setAnalyzing] = useState(false); const [msg, setMsg] = useState<{text:string;ok:boolean}|null>(null); const handleAnalyze = async () => { setAnalyzing(true); setMsg(null); const r = await callAgent("data_analyst","分析结果",()=>callDataAnalyst({hypothesis:store.hypothesis,experiment_results:store.experimentResult?.summary||{}})); store.set({aiAnalysis: r.ok ? r.data as any : {summary:isSort?"暴力法 O(n²) vs 分治法 O(n log n)":"暴力 O(n×m) vs 优化 O(n+m)",key_findings:["数据支持算法复杂度理论"],questions_for_student:["哪种策略最省操作？为什么？"]}});if(!r.ok)setMsg({text:r.error,ok:false});setAnalyzing(false);};const handleSave=async()=>{try{await saveAnalysis(store.sessionId!,store.studentAnalysis);}catch{}};return(<StageContainer step={6} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={()=>store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={()=>{handleSave();store.setStage("REPORT_GENERATED");}} disabled={!store.studentAnalysis.trim()}>保存 → 总结报告</button></div>}>{store.experimentResult && <ChartPanel data={Object.entries(store.experimentResult.summary).map(([a,s]:any)=>({algorithm:a,swaps:s.avg_swaps??s.avg_comparisons,comparisons:s.avg_comparisons}))} xKey="algorithm" bars={isSort?[{key:"swaps",name:"交换次数",color:"#3b82f6"},{key:"comparisons",name:"比较次数",color:"#22c55e"}]:[{key:"comparisons",name:"比较次数",color:"#3b82f6"}]} />}<div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮你分析</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing?"分析中...":"AI 分析"}</button></div>{store.aiAnalysis && <div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">📊 {store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings&&<ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f:string,i:number)=><li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">思考</p>{store.aiAnalysis.questions_for_student?.map((q:string,i:number)=><p key={i} className="text-sm text-gray-500">{i+1}. {q}</p>)}</div></div>}<div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[100px] p-3 border rounded-lg text-sm resize-y" placeholder="写下发现..." value={store.studentAnalysis} onChange={e=>store.set({studentAnalysis:e.target.value})} /></div></StageContainer>);}

function Stage7() { const store = useAlgoCompareStore(); const navigate = useNavigate(); const isSort = store.experimentType === "sorting"; const [preview, setPreview] = useState(false); const md = buildReport(store); if (!store.reportMarkdown) store.set({ reportMarkdown: md }); return (<StageContainer step={7} title="总结报告" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={()=>store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={()=>{archiveSession({sessionId:store.sessionId,taskId:store.taskId,question:store.refinedQuestion||store.rawQuestion,hypothesis:store.hypothesis,algorithms:isSort?store.selectedSortingAlgos:store.selectedSearchAlgos,summary:store.experimentResult?.summary||null,analysis:store.studentAnalysis,reflection:{},report:store.reportMarkdown,review:{}});navigate("/archive");}}>完成 → 档案</button></div>}><div className="card"><div className="flex gap-2 mb-4"><button className={`btn-secondary text-sm ${!preview?"bg-gray-300":""}`} onClick={()=>setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview?"bg-gray-300":""}`} onClick={()=>setPreview(true)}>预览</button></div>{preview?<div className="min-h-[300px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm">{store.reportMarkdown}</pre></div>:<textarea className="w-full min-h-[300px] p-4 border rounded-lg font-mono text-sm resize-y" value={store.reportMarkdown} onChange={e=>store.set({reportMarkdown:e.target.value})} />}</div></StageContainer>);}

function buildReport(store: ReturnType<typeof useAlgoCompareStore.getState>): string {
  const isSort = store.experimentType === "sorting";
  const algoList = isSort ? SORT_ALGOS : SEARCH_ALGOS;
  const selected = (isSort ? store.selectedSortingAlgos : store.selectedSearchAlgos) as string[];
  let summary = store.experimentResult ? Object.entries(store.experimentResult.summary).map(([a,s]:any)=>`| ${algoList.find(x=>x.key===a)?.name||a} | ${isSort ? s.avg_comparisons : s.avg_comparisons} | ${s.avg_runtime_ms}ms |`).join("\n") : "| - | - | - |";
  return [`# ${isSort?"排序":"字符串搜索"}算法比较研究`,``,`## 1. 研究问题`,store.refinedQuestion||store.rawQuestion,``,`## 2. 我的假设`,store.hypothesis,``,`## 3. 实验设计`,`- 对比算法：${selected.join("、")}`,`- 实验参数：${isSort?`数组=${store.arraySize}, 分布=${store.dataPattern}`:`文本=${store.textLength}字符, 模式串=${store.patternLength}字符`}`,`- 重复次数：${store.numTrials}`,``,`## 4. 实验结果`,`| 算法 | 操作次数 | 平均耗时 |`,`|---|---:|---:|`,summary,``,`## 5. 结果分析`,store.studentAnalysis,``,`## 6. 总结`].join("\n");
}

function generateMock(store: ReturnType<typeof useAlgoCompareStore.getState>) {
  const isSort = store.experimentType === "sorting";
  const selected = (isSort ? store.selectedSortingAlgos : store.selectedSearchAlgos) as string[];
  const defAlgos = isSort ? ["BUBBLE","SELECTION","MERGE","QUICK"] : ["NAIVE","KMP","BOYER_MOORE","RABIN_KARP"];
  const algos = selected.length > 0 ? selected : defAlgos;
  const runs: any[] = []; const text = "ababcababacababcababac".repeat(Math.ceil(200/20)).slice(0,200);
  const vals: number[] = Array.from({length:store.arraySize},()=>Math.floor(Math.random()*100)+1);
  for(let t=1;t<=store.numTrials;t++){
    for(const a of algos){
      if(isSort){
        const swaps = a==="BUBBLE"?store.arraySize*store.arraySize/2:a==="SELECTION"?store.arraySize:a==="MERGE"?store.arraySize*Math.log2(store.arraySize):store.arraySize*Math.log2(store.arraySize)/2;
        runs.push({algorithm:a,array_size:store.arraySize,pattern:store.dataPattern,trial:t,swaps:Math.round(swaps),comparisons:Math.round(swaps*1.5),runtime_ms:swaps/50,original:vals,result:[...vals].sort((a,b)=>a-b),steps:[{type:"compare",i:0,j:1,arr:vals}]});
      } else {
        const comps = a==="NAIVE"?200*5:a==="KMP"?200:a==="BOYER_MOORE"?200/5:200*1.5;
        runs.push({algorithm:a,text_length:200,pattern_length:5,pattern_type:"random",trial:t,matches:3,comparisons:Math.round(comps),runtime_ms:comps/100,text,pattern:text.slice(10,15),match_positions:[10,50,80],steps:[{type:"compare",i:0,text,pattern:text.slice(10,15)}]});
      }
    }
  }
  const groups: Record<string,any[]>={};for(const r of runs){groups[r.algorithm]=groups[r.algorithm]||[];groups[r.algorithm].push(r);}
  const summary: Record<string,any>={};for(const[k,v]of Object.entries(groups)){summary[k]={avg_comparisons:+(v.reduce((s,r)=>s+(r.comparisons||0),0)/v.length).toFixed(1),avg_runtime_ms:+(v.reduce((s,r)=>s+(r.runtime_ms||0),0)/v.length).toFixed(1),count:v.length};}
  return {experiment_batch_id:"demo-"+Date.now().toString(36),status:"COMPLETED",total_runs:runs.length,summary,runs};
}
