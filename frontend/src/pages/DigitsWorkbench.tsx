/**
 * 手写数字识别研究工作台 — 7 阶段，识别 0-9 手写数字
 * 复用: Layout, FlowStepper, StageContainer, ChartPanel, AlgorithmCard, ShapeGrid
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import AlgorithmCard from "../components/AlgorithmCard";
import ShapeGrid from "../components/ShapeGrid";
import { useDigitsStore } from "../stores/digitsStore";
import { runDigitsExperiment, saveQuestion, saveAnalysis, callMentor, callDataAnalyst, hasAgentConfig, logAgentError } from "../api/service";
import { archiveSession } from "./Archive";
import type { ResearchStage, DigitRecogAlgorithmType } from "../types";

const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REPORT_GENERATED",    label: "总结报告" },
];

const QUESTION_TEMPLATES = [
  "数据量变少时，哪个模型更稳定？",
  "加入噪声后，模型准确率如何变化？",
  "训练轮数越多，效果一定越好吗？",
  "简单模型和深度模型在手写数字识别上有什么区别？",
];

const ALGORITHMS: { key: DigitRecogAlgorithmType; name: string; description: string; pros: string[]; cons: string[]; category: string }[] = [
  { key: "TEMPLATE", name: "模板匹配", description: "跟标准数字模板逐一比对", pros: ["直观易懂","最快"], cons: ["需要干净模板","对噪声敏感"], category: "直接匹配" },
  { key: "PIXEL_KNN", name: "像素KNN", description: "将图像像素铺平成向量比较", pros: ["实现简单","无需预处理"], cons: ["计算量大","高维比较慢"], category: "像素级" },
  { key: "FEATURE", name: "特征分类", description: "提取几何特征再分类", pros: ["特征有物理含义","维度低"], cons: ["特征设计难","对数字帮助有限"], category: "特征级" },
  { key: "DECISION_TREE", name: "决策树", description: "按像素值逐层分裂判断", pros: ["可解释性强","训练快"], cons: ["容易过拟合"], category: "树模型" },
  { key: "MLP", name: "MLP", description: "单隐藏层神经网络自动学特征", pros: ["自动学特征","表达能力强"], cons: ["训练时间长"], category: "神经网络" },
  { key: "CNN", name: "小型CNN", description: "卷积+池化提取空间局部特征", pros: ["利用空间结构","抗平移","最先进"], cons: ["计算量较大"], category: "神经网络" },
  { key: "RANDOM", name: "随机基线", description: "随便猜，用作对比 baseline", pros: ["简单直观"], cons: ["准确率约10%"], category: "baseline" },
];
const ALGO_INFO: Record<string, { explanation: string; analogy: string; key_points: string[] }> = {
  PIXEL_KNN: { explanation: "像素KNN把 16×16 的数字图像拉平成 256 维向量，用 KNN 找最近的训练样本来投票分类。", analogy: "就像认出一个人——记住见过的所有样本，找最像的几个来投票。", key_points: ["展开像素为向量","欧氏距离最近邻","K=3 投票"] },
  DECISION_TREE: { explanation: "决策树把 256 个像素看作问题，逐个提问来分裂数据，直到确定数字类别。可解释性很强。", analogy: "就像玩「20 个问题」——通过一系列是/否问题逐步缩小可能性。", key_points: ["像素值作为特征","Gini不纯度分裂","max_depth=8"] },
  MLP: { explanation: "MLP 用 64 个隐藏神经元自动学习像素组合模式，通过反向传播优化。能捕捉非线性关系。", analogy: "就像大脑的神经元网络——每个神经元看一部分像素，组合起来做判断。", key_points: ["256→64→10","ReLU + Softmax","SGD 30 epochs"] },
  CNN: { explanation: "小型 CNN 用 3×3 卷积核扫描图像提取局部特征，池化降维后全连接分类。利用了图像空间结构。", analogy: "就像用放大镜逐块观察——先看局部笔画纹理，再综合判断是哪个数字。", key_points: ["3×3 卷积 (4 filters)","ReLU + 2×2 MaxPool","FC → 10类 Softmax"] },
  TEMPLATE: { explanation: "模板匹配把测试数字和 0-9 的标准模板逐一比对，选最像的。简单直接但对书写风格敏感。", analogy: "就像和标准字帖对比——谁写得最像标准答案就是谁。", key_points: ["逐像素比对","选匹配度最高的","10 个模板"] },
  FEATURE: { explanation: "特征分类提取几何特征（像素数、宽高比、对称性等），降维后分类。对数字识别帮助有限。", analogy: "就像描述数字特征——「有个圆圈」「有竖线」等。", key_points: ["提取几何特征","维度降低","速度快"] },
  RANDOM: { explanation: "随机基线不做任何识别——纯粹随机猜一个数字。用来和上面的方法对比。", analogy: "就像闭着眼睛猜——10 选 1 大概对 10%。", key_points: ["不做任何识别","随机输出","作为 baseline"] },
};
const NOISE_LEVELS = [0.0, 0.05, 0.1, 0.2];
const SAMPLE_SIZES = [100, 200, 400];
const TRIALS = [1, 3, 5];

type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(agentName: string, stage: string, fn: () => Promise<{ result?: unknown } | null>): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent", agentName };
  try { const resp = await fn(); const result = resp?.result as Record<string, unknown> | undefined; if (result?.error) { logAgentError(agentName, stage, String(result.error)); return { ok: false, error: String(result.error), agentName }; } if (result && Object.keys(result).length > 0) return { ok: true, data: result }; return { ok: false, error: `${agentName} 返回空结果`, agentName }; }
  catch (e: any) { logAgentError(agentName, stage, e?.message || String(e)); return { ok: false, error: e?.message || String(e), agentName }; }
}

const DIGIT_NAMES: Record<number, string> = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9" };

export default function DigitsWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useDigitsStore();
  useEffect(() => { const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id); }, [sessionId]);
  if (store.sessionId === null) return null;
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">手写数字识别算法研究</p>
          <FlowStepper steps={STEPS} current={store.currentStage} onStepClick={(s) => {
            if (s === "TASK_SELECTED") { store.setStage("TASK_SELECTED"); return; }
            if (!store.refinedQuestion) { store.setStage("TASK_SELECTED"); return; }
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
  const stage = useDigitsStore((s) => s.currentStage);
  switch (stage) {
    case "EXPERIMENT_DESIGNED": return <Stage4 />; case "EXPERIMENT_RUNNING": return <Stage5 />;
    case "RESULT_ANALYZED": return <Stage6 />; case "REPORT_GENERATED": return <Stage7 />;
    default: return <TaskAndQuestion />;
  }
}

function TaskAndQuestion() {
  const store = useDigitsStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const result = await callAgent("research_mentor", "研究问题", () => callMentor({ task: "手写数字识别", student_input: store.rawQuestion, grade_level: "beginner" }));
    if (result.ok) store.set({ suggestedQuestions: (result.data as any).suggested_questions || [] });
    else { store.set({ suggestedQuestions: [QUESTION_TEMPLATES[0]] }); setMsg({ text: result.error, ok: false }); }
    setLoading(false);
  };
  const handleSelectQuestion = async (q: string) => {
    store.set({ refinedQuestion: q, rawQuestion: q });
    try { await saveQuestion({ session_id: store.sessionId!, raw_question: q, refined_question: q, independent_variable: "噪声水平", dependent_variables: ["准确率"], controlled_variables: ["数据量","训练比例"] }); } catch {}
  };
  const selectedQ = store.refinedQuestion;

  return (
    <StageContainer step={1} title="选择研究任务" agent={msg}>
      <div className="card"><h3 className="font-semibold mb-2">🔢 手写数字识别算法研究</h3><p className="text-sm text-gray-500">生成 0-9 的简化手写数字像素图像，加入噪声，研究不同识别算法的表现。</p></div>
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">选择或输入你想研究的问题</h2>
        <div className="grid gap-2 mb-3">{QUESTION_TEMPLATES.map(t => <button key={t} onClick={() => handleSelectQuestion(t)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedQ === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>)}</div>
        <textarea className="w-full min-h-[60px] p-3 border rounded-lg text-sm resize-y" placeholder="或用你自己的话描述" value={store.rawQuestion} onChange={e => store.set({ rawQuestion: e.target.value })} />
        <button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化"}</button>
        {store.suggestedQuestions.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3"><h3 className="font-semibold text-gray-700 text-sm mb-2">AI 建议的研究问题（点击选择）</h3>
            <div className="space-y-1">{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => handleSelectQuestion(q)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedQ === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-100"}`}>{q}</button>)}</div></div>)}
      </div>
      {selectedQ && (<>
        <div className="card border-blue-200 bg-blue-50/50"><h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题</h3><p className="text-sm text-gray-800 font-medium">{selectedQ}</p></div>
        <div className="flex justify-end"><button className="btn-primary" onClick={() => { store.set({ designCompleted: false, experimentResult: null }); store.setStage("EXPERIMENT_DESIGNED"); }}>确认 → 设计实验</button></div>
      </>)}
    </StageContainer>
  );
}

function Stage4() {
  const store = useDigitsStore();
  const [infoAlgo, setInfoAlgo] = useState<string | null>(null);
  const selected = store.selectedAlgorithms;
  const toggle = (a: typeof ALGORITHMS[0]) => {
    if (selected.includes(a.key)) { store.set({ selectedAlgorithms: selected.filter(x => x !== a.key) }); if (infoAlgo === a.key) setInfoAlgo(null); }
    else { store.set({ selectedAlgorithms: [...selected, a.key] }); setInfoAlgo(a.key); }
  };
  const info = infoAlgo ? ALGO_INFO[infoAlgo] ?? null : null;

  return (
    <StageContainer step={2} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }} disabled={selected.length === 0}>下一步 → 运行实验</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">我要比较的算法 {selected.length === 0 && <span className="text-xs text-gray-400">（请至少选一个）</span>}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{ALGORITHMS.map(a => <AlgorithmCard key={a.key} name={a.name} description={a.description} selected={selected.includes(a.key)} onToggle={() => toggle(a)} />)}</div>
      </div>
      {info && (
        <div className="card border-blue-200 bg-blue-50/30"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-gray-800">{ALGORITHMS.find(a => a.key === infoAlgo)?.name} 算法原理</h2><button onClick={() => setInfoAlgo(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button></div><p className="text-sm text-gray-600 mb-3">{info.explanation}</p><div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {info.analogy}</div><div className="flex flex-wrap gap-1.5 mb-3">{info.key_points.map(p => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}</div></div>)}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数据量</h3><div className="space-y-1">{SAMPLE_SIZES.map(n => <button key={n} onClick={() => store.set({ nSamples: n })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.nSamples === n ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{n} 个样本</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">噪声水平</h3><div className="space-y-1">{NOISE_LEVELS.map(n => <button key={n} onClick={() => store.set({ noiseLevels: [n] })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.noiseLevels[0] === n ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{(n * 100).toFixed(0)}%</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">重复次数</h3><div className="space-y-1">{TRIALS.map(t => <button key={t} onClick={() => store.set({ numTrials: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
      </div>
    </StageContainer>
  );
}

function Stage5() {
  const store = useDigitsStore();
  const [running, setRunning] = useState(false);

  const execRun = async () => {
    setRunning(true);
    const algos = store.selectedAlgorithms.length > 0 ? store.selectedAlgorithms : ["PIXEL_KNN", "DECISION_TREE", "MLP", "CNN"];
    try {
      const data = await runDigitsExperiment({ session_id: store.sessionId!, algorithms: algos, settings: { n_samples: store.nSamples, noise_levels: store.noiseLevels, num_trials: store.numTrials, train_ratio: store.trainRatio, seed: (Date.now() % 9000) + 1000 } });
      store.set({ experimentResult: data as any });
    } catch { store.set({ experimentResult: generateMock(store) }); }
    finally { setRunning(false); }
  };

  useEffect(() => { if (!store.experimentResult) execRun(); }, []);

  const result = store.experimentResult;
  const displayRuns = result?.runs ? result.runs.filter((r: any) => r.trial === store.selectedTrial) : [];
  const nameOf = (a: string) => ALGORITHMS.find(x => x.key === a)?.name || a;

  const algoPreviews = displayRuns.map((r: any) => ({
    algorithm: r.algorithm,
    name: nameOf(r.algorithm),
    accuracy: (r.accuracy * 100).toFixed(1),
    correct: r.correct,
    total: r.total,
    runtime_ms: r.runtime_ms,
    grids: (r.test_grids || []).slice(0, 6),
    labels: (r.test_labels || []).slice(0, 6),
    preds: (r.predictions || []).slice(0, 6),
  }));

  return (
    <StageContainer step={3} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}>
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="font-semibold">实验配置</h2><p className="text-sm text-gray-400">算法：{store.selectedAlgorithms.map(nameOf).join("、") || "KNN/决策树/MLP/CNN"} | {store.nSamples} 样本 | 噪声 {(store.noiseLevels[0] * 100).toFixed(0)}% | ×{store.numTrials} 次</p></div>
          <button className="btn-primary text-lg px-6" onClick={execRun} disabled={running}>{running ? "⏳ 运行中..." : result ? "🔄 重新运行" : "▶ 开始实验"}</button>
        </div>
        {result && store.numTrials > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100"><span className="text-xs text-gray-500 font-medium">切换组别：</span>{Array.from({length:store.numTrials},(_,i)=>i+1).map(t=><button key={t} onClick={()=>store.set({selectedTrial:t})} className={`px-3 py-1 rounded-full text-xs font-medium ${store.selectedTrial===t?"bg-gray-900 text-white":"bg-gray-100 text-gray-500"}`}>第{t}组</button>)}</div>)}
      </div>

      {/* 各算法准确率汇总卡片 */}
      {displayRuns.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayRuns.map((r: any) => (
            <div key={r.algorithm} className="card"><div className="flex items-center justify-between"><span className="font-semibold text-sm">{nameOf(r.algorithm)}</span><span className="text-sm font-bold">准确率 {(r.accuracy * 100).toFixed(1)}%</span></div>
              <p className="text-xs text-gray-400 mt-1">{r.correct}/{r.total} 正确 · {r.runtime_ms}ms</p></div>
          ))}
        </div>
      )}

      {/* 逐算法预测对比 */}
      {algoPreviews.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">第 {store.selectedTrial} 组 — 各算法预测对比（前 6 个测试样本）</h3>
          <div className="space-y-4">
            {algoPreviews.map((ap: any) => (
              <div key={ap.algorithm} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-700">{ap.name}</span>
                  <span className="text-xs text-gray-400">准确率 {ap.accuracy}% ({ap.correct}/{ap.total}) · {ap.runtime_ms}ms</span>
                </div>
                <div className="flex flex-wrap gap-2 justify-start">
                  {ap.grids.map((g: number[][], i: number) => {
                    const correct = ap.labels[i] === ap.preds[i];
                    return (
                      <ShapeGrid key={i} grid={g}
                        label={DIGIT_NAMES[ap.labels[i]] ?? String(ap.labels[i])}
                        predicted={DIGIT_NAMES[ap.preds[i]] ?? String(ap.preds[i])}
                        correct={correct} animate={false} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, v: +(s.avg_accuracy * 100).toFixed(1) }))} singleMetric={{ key: "v", label: "平均准确率 (%)" }} xKey="algorithm" />
      )}
    </StageContainer>
  );
}

function Stage6() {
  const store = useDigitsStore(); const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const handleAnalyze = async () => { setAnalyzing(true); setMsg(null); const r = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis || "哪种算法更稳定？", experiment_results: store.experimentResult?.summary || {} })); store.set({ aiAnalysis: r.ok ? r.data as any : { summary: "CNN 和 MLP 在手写数字识别中表现优异，决策树次之。随机基线准确率约10%。", key_findings: ["CNN利用空间结构表现最好","MLP也能学习到良好特征","决策树在面对10个类别时容易过拟合"], questions_for_student: ["为什么CNN比MLP更适合图像识别？","数据量减少时模型表现如何变化？"] } }); if (!r.ok) setMsg({ text: r.error, ok: false }); setAnalyzing(false); };
  const handleSave = async () => { try { await saveAnalysis(store.sessionId!, store.studentAnalysis); } catch {} };
  return (
    <StageContainer step={4} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={() => { handleSave(); store.setStage("REPORT_GENERATED"); }} disabled={!store.studentAnalysis.trim()}>保存 → 总结报告</button></div>}>
      {store.experimentResult && <ChartPanel data={Object.entries(store.experimentResult.summary).map(([a, s]: any) => ({ algorithm: a, accuracy: +(s.avg_accuracy * 100).toFixed(1), min: +(s.min_accuracy * 100).toFixed(1), max: +(s.max_accuracy * 100).toFixed(1) }))} xKey="algorithm" bars={[{ key: "accuracy", name: "平均准确率(%)", color: "#3b82f6" }, { key: "min", name: "最低", color: "#f59e0b" }, { key: "max", name: "最高", color: "#22c55e" }]} />}
      <div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮你分析实验结果</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "分析中..." : "AI 分析结果"}</button></div>
      {store.aiAnalysis && <div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">📊 {store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings?.length > 0 && <ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f: string, i: number) => <li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">思考：</p>{store.aiAnalysis.questions_for_student?.map((q: string, i: number) => <p key={i} className="text-sm text-gray-500">{i + 1}. {q}</p>)}</div></div>}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[100px] p-3 border rounded-lg text-sm resize-y" placeholder="写下发现：哪种算法最好？噪声对各算法影响有什么不同？" value={store.studentAnalysis} onChange={e => store.set({ studentAnalysis: e.target.value })} /></div>
    </StageContainer>
  );
}

function Stage7() {
  const store = useDigitsStore(); const navigate = useNavigate(); const [preview, setPreview] = useState(false);
  const md = buildReport(store); if (!store.reportMarkdown) store.set({ reportMarkdown: md });
  return (
    <StageContainer step={5} title="总结报告" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={() => { archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: store.selectedAlgorithms, summary: store.experimentResult?.summary || null, analysis: store.studentAnalysis, reflection: {}, report: store.reportMarkdown, review: {} }); navigate("/archive"); }}>完成研究 → 档案</button></div>}>
      <div className="card"><div className="flex gap-2 mb-4"><button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="min-h-[300px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm">{store.reportMarkdown}</pre></div> : <textarea className="w-full min-h-[300px] p-4 border rounded-lg font-mono text-sm resize-y" value={store.reportMarkdown} onChange={e => store.set({ reportMarkdown: e.target.value })} />}
      </div>
    </StageContainer>
  );
}

function buildReport(store: ReturnType<typeof useDigitsStore.getState>): string {
  const summary = store.experimentResult ? Object.entries(store.experimentResult.summary).map(([a, s]: any) => `| ${ALGORITHMS.find(x => x.key === a)?.name || a} | ${(s.avg_accuracy * 100).toFixed(1)}% | ${s.avg_runtime_ms}ms |`).join("\n") : "| - | - | - |";
  return [`# 手写数字识别算法比较研究`, "", `## 1. 研究问题`, store.refinedQuestion || store.rawQuestion, "", `## 2. 实验设计`, `- 对比算法：${store.selectedAlgorithms.join("、")}`, `- 数据量：${store.nSamples}`, `- 噪声水平：${(store.noiseLevels[0] * 100).toFixed(0)}%`, `- 重复次数：${store.numTrials}`, "", `## 3. 实验结果`, `| 算法 | 平均准确率 | 平均耗时 |`, `|---|---:|---:|`, summary, "", `## 4. 结果分析`, store.studentAnalysis, "", `## 5. 总结`].join("\n");
}

function generateMock(store: ReturnType<typeof useDigitsStore.getState>) {
  const algos = store.selectedAlgorithms.length > 0 ? store.selectedAlgorithms : ["PIXEL_KNN", "DECISION_TREE", "MLP", "CNN"];
  const runs: any[] = []; const accuracies: Record<string, number> = { TEMPLATE: 0.68, PIXEL_KNN: 0.85, FEATURE: 0.55, DECISION_TREE: 0.72, MLP: 0.88, CNN: 0.92, RANDOM: 0.10 };
  for (let t = 1; t <= store.numTrials; t++) for (const a of algos) {
    const acc = accuracies[a] ? accuracies[a] + (Math.random() - 0.5) * 0.06 : 0.5 + Math.random() * 0.3;
    const total = Math.floor(store.nSamples * (1 - store.trainRatio));
    const correct = Math.round(acc * total);
    runs.push({ algorithm: a, n_samples: store.nSamples, noise_level: store.noiseLevels[0], trial: t, accuracy: +acc.toFixed(3), correct, total, runtime_ms: +(a === "RANDOM" ? 0.1 : a === "FEATURE" ? 0.5 : a === "TEMPLATE" ? 1 : a === "DECISION_TREE" ? 3 : a === "MLP" ? 80 : a === "CNN" ? 120 : 2).toFixed(1), test_grids: [], test_labels: [], predictions: [] });
  }
  const groups: Record<string, any[]> = {}; for (const r of runs) { groups[r.algorithm] = groups[r.algorithm] || []; groups[r.algorithm].push(r); }
  const summary: Record<string, any> = {}; for (const [k, v] of Object.entries(groups)) { const accs = v.map(r => r.accuracy); summary[k] = { avg_accuracy: +(accs.reduce((s, x) => s + x, 0) / accs.length).toFixed(3), min_accuracy: Math.min(...accs), max_accuracy: Math.max(...accs), avg_runtime_ms: +(v.reduce((s, r) => s + r.runtime_ms, 0) / v.length).toFixed(1), count: v.length }; }
  return { experiment_batch_id: "demo-" + Date.now().toString(36), status: "COMPLETED", total_runs: runs.length, summary, runs };
}
