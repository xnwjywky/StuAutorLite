/**
 * 统一图像识别研究工作台 — 图形识别 + 手写数字识别 双模式
 *
 * 模式: experimentType="shape" → 识别圆形/正方形/三角形 (3类)
 *       experimentType="digits" → 识别经典手写数字 0-9 (10类)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import ChartPanel from "../components/ChartPanel";
import AlgorithmCard from "../components/AlgorithmCard";
import ImageRecogVisualizer from "../components/ImageRecogVisualizer";
import type { VisualizerStep } from "../components/ImageRecogVisualizer";
import { useImageRecogStore, getDefaultAlgoParams } from "../stores/imageRecogStore";
import { runImageRecogStream, saveQuestion, saveAnalysis, callMentor, callDataAnalyst, hasAgentConfig, logAgentError } from "../api/service";
import { archiveSession } from "./Archive";
import type { ResearchStage } from "../types";

const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",       label: "选择研究任务" },
  { key: "EXPERIMENT_DESIGNED", label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",  label: "运行实验" },
  { key: "RESULT_ANALYZED",     label: "分析结果" },
  { key: "REPORT_GENERATED",    label: "总结报告" },
];

// ── 图形识别算法 ——
const SHAPE_ALGOS = [
  { key: "TEMPLATE", name: "模板匹配", desc: "与标准模板逐像素比对", category: "直接匹配", params: [] as {key:string;label:string;default:number;min:number;max:number;step:number}[] },
  { key: "PIXEL_KNN", name: "像素KNN", desc: "扁平化256维向量→K=3投票", category: "像素级", params: [{key:"k",label:"K值",default:3,min:1,max:9,step:2}] },
  { key: "FEATURE", name: "特征分类", desc: "提取几何特征再KNN分类", category: "特征级", params: [{key:"k",label:"K值",default:3,min:1,max:9,step:2}] },
  { key: "DECISION_TREE", name: "决策树", desc: "Gini不纯度逐层分裂像素", category: "树模型", params: [{key:"max_depth",label:"最大深度",default:8,min:3,max:16,step:1}] },
  { key: "MLP", name: "MLP", desc: "256→64→n类, ReLU+Softmax", category: "神经网络", params: [{key:"hidden",label:"隐藏神经元",default:64,min:32,max:128,step:32},{key:"epochs",label:"训练轮数",default:30,min:10,max:50,step:10}] },
  { key: "CNN", name: "小型CNN", desc: "3×3卷积(4f)→池化→FC", category: "神经网络", params: [{key:"filters",label:"卷积核数",default:4,min:2,max:8,step:2},{key:"epochs",label:"训练轮数",default:20,min:10,max:40,step:10}] },
  { key: "RANDOM", name: "随机基线", desc: "随便猜，baseline对比", category: "baseline", params: [] },
];

// ── 数字识别算法 ——
const DIGIT_ALGOS = [
  { key: "PIXEL_KNN", name: "像素KNN", desc: "256维向量→K=3投票", category: "像素级", params: [{key:"k",label:"K值",default:3,min:1,max:9,step:2}] },
  { key: "DECISION_TREE", name: "决策树", desc: "Gini不纯度逐层分裂", category: "树模型", params: [{key:"max_depth",label:"最大深度",default:8,min:3,max:16,step:1}] },
  { key: "MLP", name: "MLP", desc: "256→64→10, 30 epochs", category: "神经网络", params: [{key:"hidden",label:"隐藏神经元",default:64,min:32,max:128,step:32},{key:"epochs",label:"训练轮数",default:30,min:10,max:50,step:10}] },
  { key: "CNN", name: "小型CNN", desc: "3×3卷积(4f)→池化→FC", category: "神经网络", params: [{key:"filters",label:"卷积核数",default:4,min:2,max:8,step:2},{key:"epochs",label:"训练轮数",default:20,min:10,max:40,step:10}] },
  { key: "RANDOM", name: "随机基线", desc: "10选1随机猜", category: "baseline", params: [] },
];

const ALGO_INFO: Record<string, { explanation: string; analogy: string; key_points: string[]; pseudocode?: string }> = {
  TEMPLATE: { explanation: "把测试图形和已有的标准模板逐像素比对，选匹配度最高的作为答案。简单直接但依赖模板质量，对噪声敏感。", analogy: "就像拿照片和标准证件照对比——跟谁最像就是谁。", key_points: ["逐像素比对","O(n) 比较","需要干净模板"] },
  PIXEL_KNN: { explanation: "把16×16图像展开为256维向量，用K近邻投票分类。比模板匹配灵活但计算量大。", analogy: "记住见过的所有样本，找最像的几个来投票。", key_points: ["欧氏距离","K=3 投票","高维计算量大"], pseudocode: "1. 展开网格为向量\n2. 计算到每个训练样本的距离\n3. 取最近K个\n4. 多数投票" },
  FEATURE: { explanation: "提取几何特征（像素数、宽高比、对称性等）后KNN分类，256维→5维。快但可能丢失细节。", analogy: "描述一个人「高个子、圆脸」而不是看照片。", key_points: ["降维加速","特征有物理含义","对数字识别帮助有限"] },
  DECISION_TREE: { explanation: "把256个像素看作256个问题，逐层分裂数据直到确定类别。可解释性很强，能看到每一步的决策依据。", analogy: "玩「20个问题」游戏——每个问题都是『这个像素亮吗？』，一步步缩小可能性。", key_points: ["Gini不纯度分裂","max_depth控制","可解释性强"], pseudocode: "1. for each feature:\n2.   for each split point:\n3.     计算左右子节点Gini\n4.   选最小Gini的分裂\n5. 递归构建子树" },
  MLP: { explanation: "单隐藏层64神经元，通过反向传播自动学习像素组合模式。能捕捉非线性关系但训练较慢。", analogy: "大脑的神经网络——每个神经元看部分像素，组合起来做判断。", key_points: ["256→64→n类","ReLU+Softmax","SGD梯度下降"], pseudocode: "1. Forward: x→W1→ReLU→W2→Softmax→probs\n2. Loss: -log(probs[true_class])\n3. Backward: 计算梯度\n4. Update: W -= lr * grad\n5. 重复30 epochs" },
  CNN: { explanation: "3×3卷积核扫描图像提取局部特征（边、角等）→池化降维→全连接分类。利用了图像的空间结构，是图像识别领域最核心的方法。", analogy: "用放大镜逐块观察——先看局部笔画纹理，再综合判断是哪个形状/数字。", key_points: ["3×3 卷积4核","2×2 MaxPool","利用空间结构"], pseudocode: "1. Conv2D: 3×3 kernel → 14×14×4\n2. ReLU\n3. MaxPool 2×2 → 7×7×4\n4. Flatten → 196维\n5. FC → Softmax" },
  RANDOM: { explanation: "不做任何识别，纯粹随机输出一个类别作为对比基线。用来衡量其他算法到底好多少。", analogy: "闭着眼睛猜——3类约33%准确率，10类约10%。", key_points: ["不做识别","随机输出","baseline对比"] },
};

const SHAPE_NAMES: Record<string, string> = { circle: "圆形", square: "正方形", triangle: "三角形" };
const NOISE_LEVELS = [0.0, 0.05, 0.1, 0.2];
const SAMPLE_SIZES = [100, 200, 400];
const TRIALS = [1, 3, 5];

// ── Agent 调用 ──
type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(agentName: string, stage: string, fn: () => Promise<{ result?: unknown } | null>): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent", agentName };
  try { const resp = await fn(); const result = resp?.result as Record<string, unknown> | undefined; if (result?.error) { logAgentError(agentName, stage, String(result.error)); return { ok: false, error: String(result.error), agentName }; } if (result && Object.keys(result).length > 0) return { ok: true, data: result }; return { ok: false, error: `${agentName} 返回空结果`, agentName }; }
  catch (e: any) { logAgentError(agentName, stage, e?.message || String(e)); return { ok: false, error: e?.message || String(e), agentName }; }
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

export default function ImageRecogWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const store = useImageRecogStore();
  useEffect(() => { const id = Number(sessionId); store.init(Number.isNaN(id) ? -1 : id); }, [sessionId]);
  if (store.sessionId === null) return null;
  const isShape = store.experimentType === "shape";
  const isMNIST = store.experimentType === "mnist";
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">{isMNIST ? "MNIST 手写数字识别" : isShape ? "图形识别算法研究" : "手写数字识别算法研究"}</p>
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
  const stage = useImageRecogStore((s) => s.currentStage);
  switch (stage) {
    case "EXPERIMENT_DESIGNED": return <Stage4 />; case "EXPERIMENT_RUNNING": return <Stage5 />;
    case "RESULT_ANALYZED": return <Stage6 />; case "REPORT_GENERATED": return <Stage7 />;
    default: return <Stage1 />;
  }
}

// ═══════ Stage1: 任务选择 ═══════

function Stage1() {
  const store = useImageRecogStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const navigate = useNavigate();
  const isShape = store.experimentType === "shape";
  const isMNIST = store.experimentType === "mnist";
  const taskName = isMNIST ? "MNIST手写数字识别" : "图形识别";

  const templates = isMNIST
    ? ["增加卷积层数量能否提升手写数字识别准确率？", "学习率过大或过小对模型训练有什么影响？", "Dropout 如何影响模型的泛化能力？", "不同优化器（SGD vs Adam）在 CNN 训练中的表现有何差异？"]
    : ["增加噪声后，哪种识别方法最稳定？", "模板匹配和像素KNN谁更准确？", "简单方法和神经网络方法有什么区别？"];

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const result = await callAgent("research_mentor", "研究问题", () => callMentor({ task: taskName, student_input: store.rawQuestion, grade_level: "beginner" }));
    if (result.ok) store.set({ suggestedQuestions: (result.data as any).suggested_questions || [templates[0]] });
    else { store.set({ suggestedQuestions: [templates[0]] }); setMsg({ text: result.error, ok: false }); }
    setLoading(false);
  };

  const handleSelectQuestion = async (q: string) => {
    store.set({ refinedQuestion: q, rawQuestion: q });
    try { await saveQuestion({ session_id: store.sessionId!, raw_question: q, refined_question: q, independent_variable: isMNIST ? "网络架构/超参数" : "噪声水平", dependent_variables: ["准确率"], controlled_variables: isMNIST ? ["数据集", "随机种子"] : ["数据量", "训练比例"] }); } catch {}
  };

  const handleConfirm = () => {
    if (isMNIST) {
      // 携带已选的研究问题，让 MNISTWorkbench 直接跳到 Stage2
      navigate(`/workbench-mnist/${store.sessionId}`, {
        state: { refinedQuestion: store.refinedQuestion, rawQuestion: store.rawQuestion, startStage: "EXPERIMENT_DESIGNED" },
      });
      return;
    }
    store.set({ designCompleted: false, experimentResult: null });
    store.setStage("EXPERIMENT_DESIGNED");
  };

  const selectedQ = store.refinedQuestion;

  return (
    <StageContainer step={1} title="选择研究任务" agent={msg}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className={`card flex flex-col cursor-pointer transition-all ${isShape ? "ring-2 ring-blue-500 bg-blue-50/50" : "hover:shadow-md hover:bg-gray-50/30"}`}
          onClick={() => store.switchMode("shape")}>
          <h3 className="font-semibold mb-1">形状识别</h3>
          <p className="text-xs text-gray-500 mb-2">像素化圆形、正方形、三角形（3类），对比7种算法。</p>
          <div className="flex flex-wrap gap-1">{["模板匹配","KNN","特征","决策树","MLP","CNN","随机"].map(n=><span key={n} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{n}</span>)}</div>
          {isShape && <span className="text-[10px] text-blue-400 mt-2">✓ 当前选择</span>}
        </div>
        <div className={`card flex flex-col cursor-pointer transition-all ${isMNIST ? "ring-2 ring-purple-500 bg-purple-50/50" : "hover:shadow-md hover:bg-gray-50/30"}`}
          onClick={() => store.switchMode("mnist")}>
          <h3 className="font-semibold mb-1">🧠 MNIST 手写数字识别</h3>
          <p className="text-xs text-gray-500 mb-2">真实 PyTorch CNN 训练 MNIST 28×28 手写数字，4种预设架构，实时训练曲线监控。</p>
          <div className="flex flex-wrap gap-1">{["CNN","PyTorch","MNIST","深度学习"].map(n=><span key={n} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{n}</span>)}</div>
          {isMNIST && <span className="text-[10px] text-purple-400 mt-2">✓ 当前选择</span>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">选择或输入你想研究的问题</h2>
        <div className="grid gap-2 mb-3">{templates.map((t) => (
          <button key={t} onClick={() => handleSelectQuestion(t)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedQ === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>
        ))}</div>
        <textarea className="w-full min-h-[60px] p-3 border rounded-lg text-sm resize-y" placeholder="或用你自己的话描述..." value={store.rawQuestion} onChange={e => store.set({ rawQuestion: e.target.value })} />
        <button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化"}</button>
        {store.suggestedQuestions.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3"><h3 className="font-semibold text-gray-700 text-sm mb-2">AI 建议的研究问题（点击选择）</h3>
            <div className="space-y-1">{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => handleSelectQuestion(q)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedQ === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-100"}`}>{q}</button>)}</div></div>)}
      </div>

      {selectedQ && (<>
        <div className="card border-blue-200 bg-blue-50/50"><h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题</h3><p className="text-sm text-gray-800 font-medium">{selectedQ}</p></div>
        <div className="flex justify-end"><button className="btn-primary" onClick={handleConfirm}>{isMNIST ? "确认 → 进入 MNIST 实验" : "确认 → 设计实验"}</button></div>
      </>)}
    </StageContainer>
  );
}

// ═══════ Stage4: 设计实验（算法 + 解释说明 + 参数） ═══════

function Stage4() {
  const store = useImageRecogStore();
  const isShape = store.experimentType === "shape";
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [expandedParam, setExpandedParam] = useState<string | null>(null);

  const algoList = isShape ? SHAPE_ALGOS : DIGIT_ALGOS;
  const selected = store.selectedAlgos;

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      store.set({ selectedAlgos: selected.filter(x => x !== key) });
      if (expandedParam === key) setExpandedParam(null);
      if (expandedInfo === key) setExpandedInfo(null);
    } else {
      store.set({ selectedAlgos: [...selected, key] });
      const defaults = getDefaultAlgoParams(key);
      if (Object.keys(defaults).length > 0) {
        const current = { ...store.algoParams };
        if (!current[key]) current[key] = defaults;
        store.set({ algoParams: current });
      }
    }
  };

  return (
    <StageContainer step={2} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ designCompleted: true, experimentResult: null }); store.setStage("EXPERIMENT_RUNNING"); }} disabled={selected.length === 0}>下一步 → 运行实验</button></div>}>
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">
          选择要比较的算法 <span className="text-xs font-normal text-gray-400">（点击查看详细原理）</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {algoList.map(a => {
            const isSel = selected.includes(a.key);
            const info = ALGO_INFO[a.key];
            return (
              <div key={a.key}>
                <AlgorithmCard name={a.name} description={a.desc} selected={isSel} onToggle={() => toggle(a.key)} />

                {/* 选中后：显示算法解释说明（内联） */}
                {isSel && info && (
                  <div className="mt-1.5 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-600 leading-relaxed">{info.explanation}</p>
                      <button onClick={() => setExpandedInfo(expandedInfo === a.key ? null : a.key)}
                        className="text-[10px] text-blue-500 hover:text-blue-700 whitespace-nowrap shrink-0 mt-0.5">
                        {expandedInfo === a.key ? "收起 ▲" : "更多 ▼"}
                      </button>
                    </div>

                    {/* 展开后显示：类比 + 关键点 + 伪代码 */}
                    {expandedInfo === a.key && (
                      <div className="mt-2 pt-2 border-t border-blue-100">
                        <div className="text-[11px] text-gray-500 mb-2">💡 {info.analogy}</div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {info.key_points.map(p => <span key={p} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{p}</span>)}
                        </div>
                        {info.pseudocode && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-gray-400 hover:text-gray-600">▶ 伪代码</summary>
                            <pre className="bg-gray-900 text-green-400 p-2 rounded mt-1 overflow-x-auto text-[10px] leading-relaxed whitespace-pre font-mono">{info.pseudocode}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 参数面板 */}
                {isSel && a.params.length > 0 && (
                  <div className="mt-1 px-1">
                    <button onClick={() => setExpandedParam(expandedParam === a.key ? null : a.key)}
                      className="text-[10px] text-gray-400 hover:text-gray-600">
                      {expandedParam === a.key ? "收起参数 ▲" : "调整参数 ▼"}
                    </button>
                    {expandedParam === a.key && (
                      <div className="mt-1.5 p-2 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                        {a.params.map(p => {
                          const curVal = store.algoParams[a.key]?.[p.key] ?? p.default;
                          return (
                            <div key={p.key} className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500 w-20">{p.label}</span>
                              <input type="range" min={p.min} max={p.max} step={p.step} value={curVal}
                                onChange={e => store.set({ algoParams: { ...store.algoParams, [a.key]: { ...store.algoParams[a.key], [p.key]: Number(e.target.value) } } })}
                                className="flex-1 h-1 accent-blue-500" />
                              <span className="text-[11px] font-mono text-gray-700 w-8 text-right">{curVal}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">数据量</h3><div className="space-y-1">{SAMPLE_SIZES.map(n => <button key={n} onClick={() => store.set({ nSamples: n })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.nSamples === n ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{n} 个样本</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">噪声水平</h3><div className="space-y-1">{NOISE_LEVELS.map(n => <button key={n} onClick={() => store.set({ noiseLevel: n })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.noiseLevel === n ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{(n * 100).toFixed(0)}%</button>)}</div></div>
        <div className="card"><h3 className="font-semibold text-gray-700 mb-2 text-sm">重复次数</h3><div className="space-y-1">{TRIALS.map(t => <button key={t} onClick={() => store.set({ numTrials: t })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.numTrials === t ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{t} 次</button>)}</div></div>
      </div>
    </StageContainer>
  );
}

// ═══════ Stage5: 运行实验（训练→测试→结果） ═══════

interface AlgoProgress {
  algoKey: string;
  phase: "waiting" | "training" | "trained" | "testing" | "done";
  tested: number; total: number;
  trainEpoch?: number; trainTotal?: number;
  params: Record<string, number>;
  accuracy?: number;
  runtimeMs?: number;
  vizSteps?: VisualizerStep[];
  message: string;
}

function Stage5() {
  const store = useImageRecogStore();
  const isShape = store.experimentType === "shape";
  const [running, setRunning] = useState(false);
  const [phaseText, setPhaseText] = useState("");
  const [trainPhase, setTrainPhase] = useState(true);
  const [algoProgress, setAlgoProgress] = useState<Map<string, AlgoProgress>>(new Map());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const progressRef = useRef<Map<string, AlgoProgress>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const algoList = isShape ? SHAPE_ALGOS : DIGIT_ALGOS;
  const selected = store.selectedAlgos;
  const defaultAlgos = isShape ? ["TEMPLATE","PIXEL_KNN","DECISION_TREE","MLP","CNN","RANDOM"] : ["PIXEL_KNN","DECISION_TREE","MLP","CNN","RANDOM"];
  const nameOf = (a: string) => algoList.find(x => x.key === a)?.name || a;
  const labelNames: Record<string, string> = isShape
    ? SHAPE_NAMES
    : Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), String(i)]));

  const noisePct = (store.noiseLevel * 100).toFixed(0);

  const doCleanup = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setRunning(false); setPhaseText(""); setTrainPhase(true);
    progressRef.current = new Map(); setAlgoProgress(new Map());
    setErrorMsg(null);
  }, []);

  useEffect(() => { return () => { doCleanup(); store.cleanup(); }; }, []);

  const execRun = async () => {
    doCleanup();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true); setTrainPhase(true);
    const algos = selected.length > 0 ? selected : defaultAlgos;

    const initMap = new Map<string, AlgoProgress>();
    for (const a of algos) initMap.set(a, { algoKey: a, phase: "waiting", tested: 0, total: 0, params: {}, message: "等待中..." });
    progressRef.current = new Map(initMap);
    setAlgoProgress(new Map(initMap));

    const syncProgress = () => setAlgoProgress(new Map(progressRef.current));

    try {
      await runImageRecogStream({
        session_id: store.sessionId!,
        experiment_type: store.experimentType,
        algorithms: algos,
        algo_params: store.algoParams,
        settings: { n_samples: store.nSamples, noise_levels: [store.noiseLevel], num_trials: store.numTrials, train_ratio: store.trainRatio, seed: (Date.now() % 9000) + 1000 },
      }, (event: any) => {
        if (ac.signal.aborted) return;
        const ap = progressRef.current;
        const c = ap.get(event.algorithm);
        switch (event.type) {
          case "train_start":
            if (c) ap.set(event.algorithm, { ...c, phase: "training", params: event.params || c.params, trainTotal: event.total_epochs, trainEpoch: 0, message: event.message || c.message });
            setPhaseText(event.message || `${nameOf(event.algorithm)}: 开始训练`);
            break;
          case "train_progress":
            if (c) { ap.set(event.algorithm, { ...c, phase: "training", trainEpoch: event.epoch, trainTotal: event.total_epochs, message: event.message || c.message }); setPhaseText(event.message || `${nameOf(event.algorithm)}: epoch ${event.epoch}/${event.total_epochs}`); }
            break;
          case "train_done":
            if (c) ap.set(event.algorithm, { ...c, phase: "trained", message: event.message || c.message, params: event.params || c.params });
            break;
          case "noise_start":
            setTrainPhase(false);
            setPhaseText(event.message || `噪声 ${noisePct}%: 开始测试...`);
            break;
          case "algo_started":
            if (c) ap.set(event.algorithm, { ...c, phase: "testing", tested: 0, total: event.n_test || 0, message: event.message || c.message });
            break;
          case "test_batch":
            if (c) ap.set(event.algorithm, { ...c, phase: "testing", tested: event.tested_so_far, total: event.total_test, message: event.message || c.message });
            break;
          case "algo_done":
            if (c) ap.set(event.algorithm, { ...c, phase: "done", tested: event.total, total: event.total, accuracy: event.accuracy, runtimeMs: event.runtime_ms, vizSteps: event.viz_steps, message: event.message || c.message });
            break;
          case "done":
            setPhaseText(event.message || "实验完成");
            store.set({ experimentResult: { experiment_batch_id: Date.now().toString(36), experiment_type: store.experimentType, status: "COMPLETED", total_runs: event.total_runs || 0, summary: event.summary || {}, runs: event.all_runs || [] } });
            break;
          case "error":
            setErrorMsg(event.message);
            break;
        }
        syncProgress();
      }, (err) => { if (!ac.signal.aborted) setErrorMsg(err.message); });
    } catch {
      // silent
    } finally {
      if (!ac.signal.aborted) setRunning(false);
    }
  };

  useEffect(() => { if (!store.experimentResult && !running) execRun(); }, []);

  const result = store.experimentResult;
  const displayRuns: any[] = result?.runs ? result.runs.filter((r: any) => (r.trial ?? 1) === store.selectedTrial) : [];
  const progressArr = Array.from(algoProgress.values());
  const trainingCount = progressArr.filter(ap => ap.phase === "training" || ap.phase === "trained").length;
  const doneCount = progressArr.filter(ap => ap.phase === "done").length;
  const totalCount = progressArr.length;
  const algoNames = (selected.length > 0 ? selected : defaultAlgos).map(nameOf).join("、");

  return (
    <StageContainer step={3} title="运行实验" actions={
      <div className="flex gap-3 w-full justify-between">
        <button className="btn-secondary" onClick={() => { doCleanup(); store.cleanup(); store.setStage("EXPERIMENT_DESIGNED"); }}>← 上一步</button>
        <button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button>
      </div>
    }>
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="font-semibold">实验配置</h2><p className="text-sm text-gray-400">算法：{algoNames} | {store.nSamples} 样本 | 噪声 {noisePct}% | ×{store.numTrials} 次</p></div>
          <button className="btn-primary text-lg px-6" onClick={execRun} disabled={running}>
            {running ? (trainPhase ? "⏳ 训练中..." : "⏳ 测试中...") : result ? "🔄 重新运行" : "▶ 开始实验"}
          </button>
        </div>
        {result && store.numTrials > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100"><span className="text-xs text-gray-500 font-medium">切换组别：</span>{Array.from({ length: store.numTrials }, (_, i) => i + 1).map(t => <button key={t} onClick={() => store.set({ selectedTrial: t })} className={`px-3 py-1 rounded-full text-xs font-medium ${store.selectedTrial === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>第{t}组</button>)}</div>)}
      </div>

      {/* ── 训练阶段 ── */}
      {trainPhase && running && progressArr.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/30">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            阶段 1/2: 训练模型 · 已完成 {trainingCount}/{totalCount}
          </h3>
          {phaseText && <p className="text-sm text-amber-700 font-medium mb-4 px-3 py-2 bg-amber-50 rounded-lg">{phaseText}</p>}
          <div className="space-y-2.5">
            {progressArr.map((ap) => {
              const icon = ap.phase === "trained" ? "✓" : ap.phase === "training" ? "⚙" : "○";
              const cls = ap.phase === "trained" ? "text-green-600 border-green-200 bg-green-50/30" : ap.phase === "training" ? "text-amber-600 border-amber-200 bg-amber-50/30" : "text-gray-400 border-gray-100";
              const pct = ap.trainTotal ? Math.round((ap.trainEpoch || 0) / (ap.trainTotal || 1) * 100) : 0;
              return (
                <div key={ap.algoKey} className={`border rounded-lg p-2.5 ${cls}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{icon} {nameOf(ap.algoKey)}</span>
                    <span className="text-xs text-gray-400">{ap.phase === "trained" ? "已训练" : ap.phase === "training" ? `epoch ${ap.trainEpoch || 0}/${ap.trainTotal || "?"}` : "等待..."}</span>
                  </div>
                  {ap.phase === "training" && (ap.trainTotal || 0) > 0 && (
                    <div className="w-full bg-amber-100 rounded-full h-1.5 mt-1.5"><div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 测试阶段 ── */}
      {!trainPhase && running && progressArr.length > 0 && (
        <div className="card border-blue-200 bg-white">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            阶段 2/2: 噪声 {noisePct}% — 测试中 · 完成 {doneCount}/{totalCount} 算法
          </h3>
          {phaseText && <p className="text-sm text-blue-600 font-medium mb-4 px-3 py-2 bg-blue-50 rounded-lg">{phaseText}</p>}
          <div className="space-y-2.5">
            {progressArr.map((ap) => {
              const icon = ap.phase === "done" ? "✓" : ap.phase === "testing" ? "🔍" : "○";
              const cls = ap.phase === "done" ? "text-green-600 border-green-200 bg-green-50/30" : ap.phase === "testing" ? "text-blue-600 border-blue-200 bg-blue-50/20" : "text-gray-400 border-gray-100";
              const pct = ap.total > 0 ? Math.round(ap.tested / ap.total * 100) : 0;
              return (
                <div key={ap.algoKey} className={`border rounded-lg p-2.5 ${cls}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{icon} {nameOf(ap.algoKey)}</span>
                    <span className="text-xs text-gray-400">{ap.phase === "testing" ? `测试 ${ap.tested}/${ap.total} (${pct}%)` : ap.phase === "done" ? `准确率 ${((ap.accuracy||0)*100).toFixed(1)}% · ${ap.runtimeMs}ms` : "等待测试"}</span>
                  </div>
                  {ap.total > 0 && (<div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5"><div className={`h-1.5 rounded-full transition-all ${ap.phase === "done" ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></div>)}
                </div>
              );
            })}
          </div>
          {errorMsg && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{errorMsg}</div>}
        </div>
      )}

      {/* ── 结果展示 ── */}
      {!running && result && (
        <div className="space-y-4">
          {displayRuns.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">第 {store.selectedTrial} 组 — 各算法逐样本预测过程（噪声 {noisePct}%）</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {displayRuns.map((r: any) => (
                  <ImageRecogVisualizer key={`${r.algorithm}-${store.selectedTrial}`} steps={(r.viz_steps || []) as VisualizerStep[]} algorithmName={nameOf(r.algorithm)} labelNames={labelNames} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayRuns.map((r: any) => (
              <div key={r.algorithm} className="card">
                <div className="flex items-center justify-between"><span className="font-semibold text-sm">{nameOf(r.algorithm)}</span><span className="text-sm font-bold text-green-600">✓ 准确率 {(r.accuracy * 100).toFixed(1)}%</span></div>
                <p className="text-xs text-gray-400 mt-1">{r.correct}/{r.total} 正确 · {r.runtime_ms}ms</p>
                {r.params_used && Object.keys(r.params_used).length > 0 && <div className="flex gap-1 mt-1 flex-wrap">{Object.entries(r.params_used).map(([k, v]) => <span key={k} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{k}={String(v)}</span>)}</div>}
              </div>
            ))}
          </div>

          {result && Object.keys(result.summary).length > 0 && (
            <ChartPanel data={Object.entries(result.summary).map(([a, s]: any) => ({ algorithm: a, v: +(s.avg_accuracy * 100).toFixed(1) }))} singleMetric={{ key: "v", label: "平均准确率 (%)" }} xKey="algorithm" />
          )}
        </div>
      )}
    </StageContainer>
  );
}

// ═══════ Stage6: 分析结果 ═══════

function Stage6() {
  const store = useImageRecogStore(); const isShape = store.experimentType === "shape";
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const handleAnalyze = async () => {
    setAnalyzing(true); setMsg(null);
    const r = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis || "哪种算法更稳定？", experiment_results: store.experimentResult?.summary || {} }));
    store.set({ aiAnalysis: r.ok ? r.data as any : { summary: isShape ? "模板匹配在低噪声时最准，噪声增加后CNN和MLP更稳定。" : "CNN和MLP在手写数字识别中表现最优，决策树次之。", key_findings: isShape ? ["模板匹配对噪声敏感", "CNN利用空间结构更鲁棒", "特征分类维度低速度快"] : ["CNN表现最好", "MLP也能学到良好特征", "决策树面对10类容易过拟合"], questions_for_student: isShape ? ["为什么CNN比模板匹配更抗噪声？"] : ["为什么CNN比MLP更适合图像识别？"] } });
    if (!r.ok) setMsg({ text: r.error, ok: false }); setAnalyzing(false);
  };
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

// ═══════ Stage7: 总结报告 ═══════

function Stage7() {
  const store = useImageRecogStore(); const navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const md = buildReport(store); if (!store.reportMarkdown) store.set({ reportMarkdown: md });
  return (
    <StageContainer step={5} title="总结报告" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={() => { archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: store.selectedAlgos, summary: store.experimentResult?.summary || null, analysis: store.studentAnalysis, reflection: {}, report: store.reportMarkdown, review: {} }); navigate("/archive"); }}>完成研究 → 档案</button></div>}>
      <div className="card"><div className="flex gap-2 mb-4"><button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="min-h-[300px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm">{store.reportMarkdown}</pre></div> : <textarea className="w-full min-h-[300px] p-4 border rounded-lg font-mono text-sm resize-y" value={store.reportMarkdown} onChange={e => store.set({ reportMarkdown: e.target.value })} />}
      </div>
    </StageContainer>
  );
}

function buildReport(store: ReturnType<typeof useImageRecogStore.getState>): string {
  const isShape = store.experimentType === "shape";
  const algoList = isShape ? SHAPE_ALGOS : DIGIT_ALGOS;
  const summary = store.experimentResult ? Object.entries(store.experimentResult.summary).map(([a, s]: any) => `| ${algoList.find(x => x.key === a)?.name || a} | ${(s.avg_accuracy * 100).toFixed(1)}% | ${s.avg_runtime_ms}ms |`).join("\n") : "| - | - | - |";
  return [`# ${isShape ? "图形" : "手写数字"}识别算法比较研究`, "", `## 1. 研究问题`, store.refinedQuestion || store.rawQuestion, "", `## 2. 实验设计`, `- 对比算法：${store.selectedAlgos.join("、")}`, `- 数据量：${store.nSamples}`, `- 噪声水平：${(store.noiseLevel * 100).toFixed(0)}%`, `- 重复次数：${store.numTrials}`, "", `## 3. 实验结果`, `| 算法 | 平均准确率 | 平均耗时 |`, `|---|---:|---:|`, summary, "", `## 4. 结果分析`, store.studentAnalysis, "", `## 5. 总结`].join("\n");
}
