/**
 * MNIST 手写数字识别研究工作台 — 7 阶段，PyTorch CNN 训练
 *
 * 流程: 选择任务 → 设计实验 → 运行实验 → 分析结果 → 反思改进 → 生成报告 → 审稿反馈
 */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Layout from "../components/Layout";
import FlowStepper from "../components/FlowStepper";
import StageContainer from "../components/StageContainer";
import TrainingCurve from "../components/TrainingCurve";
import { useMNISTStore, computeConfigFingerprint } from "../stores/mnistStore";
import { saveQuestion, saveAnalysis, callMentor, callDataAnalyst, hasAgentConfig, logAgentError } from "../api/service";
import { archiveSession } from "./Archive";
import type { ResearchStage } from "../types";

const STEPS: { key: ResearchStage; label: string }[] = [
  { key: "TASK_SELECTED",        label: "选择研究任务" },
  { key: "EXPERIMENT_DESIGNED",  label: "设计实验" },
  { key: "EXPERIMENT_RUNNING",   label: "运行实验" },
  { key: "RESULT_ANALYZED",      label: "分析结果" },
  { key: "REFLECTION_COMPLETED", label: "反思改进" },
  { key: "REPORT_GENERATED",     label: "生成报告" },
  { key: "REVIEW_COMPLETED",     label: "审稿反馈" },
];

const QUESTION_TEMPLATES = [
  "增加卷积层数量能否提升手写数字识别准确率？",
  "学习率过大或过小对模型训练有什么影响？",
  "Dropout 如何影响模型的泛化能力？",
  "不同优化器（SGD vs Adam）在 CNN 训练中的表现有何差异？",
  "CNN 和纯 MLP 在图像任务上有多大差距？",
];

const ARCHITECTURES = [
  { id: "minicnn", name: "MiniCNN", desc: "1层卷积+1层全连接，32K参数", params: "32K" },
  { id: "standardcnn", name: "StandardCNN", desc: "2层卷积+Dropout，422K参数", params: "422K" },
  { id: "deepcnn", name: "DeepCNN", desc: "4层卷积+Dropout，871K参数", params: "871K" },
  { id: "mlp", name: "MLP", desc: "纯全连接网络，536K参数", params: "536K" },
];

const ARCH_INFO: Record<string, { explanation: string; analogy: string; key_points: string[] }> = {
  minicnn: {
    explanation: "MiniCNN 是最简单的卷积神经网络——只有1层卷积提取特征，然后直接全连接分类。虽然简单但已经能学到数字的基本笔画特征，适合入门理解 CNN 的工作原理。32K 参数意味着模型很小，训练非常快。",
    analogy: "就像用一个放大镜看数字——只看一次整体特征（边、角），然后直接判断是几。简单但有效！",
    key_points: ["1层卷积(16核)", "MaxPool降维", "极简32K参数", "训练最快"],
  },
  standardcnn: {
    explanation: "StandardCNN 是 MNIST 最常用的标准结构——2层卷积逐层提取从简单到复杂的特征，配合 Dropout 防止过拟合。422K 参数在速度与精度之间取得了很好的平衡，通常能达到 98%+ 的准确率。",
    analogy: "先用粗放大镜看大致轮廓（第1层卷积），再用细放大镜看细节笔画（第2层卷积），最后综合判断。",
    key_points: ["2层卷积(32→64核)", "Dropout防过拟合", "422K参数", "MNIST最优选"],
  },
  deepcnn: {
    explanation: "DeepCNN 是较深的卷积网络，4层卷积可以学到更复杂的特征组合。871K 参数让模型有更强的表达能力，但也更容易过拟合——所以用了更大的 Dropout(0.5) 来防止。适合研究网络深度对性能的影响。",
    analogy: "用四个不同倍率的放大镜逐层观察——每个放大镜提取不同层次的特征，信息更丰富但也更容易被噪声干扰。",
    key_points: ["4层卷积", "大Dropout(0.5)", "871K参数", "感受野更大"],
  },
  mlp: {
    explanation: "MLP 是全连接网络——没有卷积层，直接把 28×28=784 个像素拉平成一维向量输入。无法利用图像的空间结构（相邻像素的关系），所以同参数量下通常不如 CNN。用来对比「CNN 为什么更适合图像」。",
    analogy: "不看图像的整体结构，而是把 784 个像素当成 784 个独立的数字——完全不知道哪些像素是相邻的。",
    key_points: ["纯全连接", "无卷积/池化", "536K参数", "图像任务对比基准"],
  },
};

const HYPER_OPTIONS = {
  learningRate: [0.001, 0.01, 0.1] as number[],
  batchSize: [32, 64, 128] as number[],
  epochs: [5, 10, 20] as number[],
  optimizer: ["SGD", "Adam", "RMSprop"] as string[],
  dropout: [0, 0.25, 0.5] as number[],
};

const ARCH_LAYERS: Record<string, { layers: { type: string; detail: string }[]; dimensions: string }> = {
  minicnn: {
    layers: [
      { type: "Conv2d", detail: "1→16, 3×3" }, { type: "ReLU", detail: "激活" },
      { type: "MaxPool", detail: "2×2" }, { type: "Flatten", detail: "展开" },
      { type: "Linear", detail: "3136→10" },
    ],
    dimensions: "28×28×1 → 28×28×16 → 14×14×16 → 3136 → 10",
  },
  standardcnn: {
    layers: [
      { type: "Conv2d", detail: "1→32, 3×3" }, { type: "ReLU", detail: "激活" },
      { type: "MaxPool", detail: "2×2" }, { type: "Conv2d", detail: "32→64, 3×3" },
      { type: "ReLU", detail: "激活" }, { type: "MaxPool", detail: "2×2" },
      { type: "Flatten", detail: "展开" }, { type: "Linear", detail: "3136→128" },
      { type: "ReLU", detail: "激活" }, { type: "Dropout", detail: "p=0.25" },
      { type: "Linear", detail: "128→10" },
    ],
    dimensions: "28×28×1 → 28×28×32 → 14×14×32 → 14×14×64 → 7×7×64 → 3136 → 128 → 10",
  },
  deepcnn: {
    layers: [
      { type: "Conv2d", detail: "1→32, 3×3" }, { type: "ReLU", detail: "激活" },
      { type: "Conv2d", detail: "32→32, 3×3" }, { type: "ReLU", detail: "激活" },
      { type: "MaxPool", detail: "2×2" },
      { type: "Conv2d", detail: "32→64, 3×3" }, { type: "ReLU", detail: "激活" },
      { type: "Conv2d", detail: "64→64, 3×3" }, { type: "ReLU", detail: "激活" },
      { type: "MaxPool", detail: "2×2" }, { type: "Flatten", detail: "展开" },
      { type: "Linear", detail: "4096→256" }, { type: "ReLU", detail: "激活" },
      { type: "Dropout", detail: "p=0.5" }, { type: "Linear", detail: "256→10" },
    ],
    dimensions: "28×28×1 → 32×32 → 16×16 → 64×16 → 64×16 → 8×8 → 4096 → 256 → 10",
  },
  mlp: {
    layers: [
      { type: "Flatten", detail: "展开" },
      { type: "Linear", detail: "784→512" }, { type: "ReLU", detail: "激活" },
      { type: "Linear", detail: "512→256" }, { type: "ReLU", detail: "激活" },
      { type: "Linear", detail: "256→10" },
    ],
    dimensions: "784 → 512 → 256 → 10",
  },
};

const LAYER_COLORS: Record<string, string> = {
  Conv2d: "bg-blue-100 text-blue-700 border-blue-300",
  ReLU: "bg-green-50 text-green-600 border-green-200",
  MaxPool: "bg-orange-50 text-orange-600 border-orange-200",
  Flatten: "bg-gray-100 text-gray-500 border-gray-300",
  Linear: "bg-purple-50 text-purple-600 border-purple-200",
  Dropout: "bg-red-50 text-red-500 border-red-200",
};

type AgentResult<T> = { ok: true; data: T } | { ok: false; error: string; agentName: string };
async function callAgent(agentName: string, stage: string, fn: () => Promise<{ result?: unknown } | null>): Promise<AgentResult<unknown>> {
  if (!hasAgentConfig()) return { ok: false, error: "未配置 Agent", agentName };
  try { const resp = await fn(); const result = resp?.result as Record<string, unknown> | undefined; if (result?.error) { logAgentError(agentName, stage, String(result.error)); return { ok: false, error: String(result.error), agentName }; } if (result && Object.keys(result).length > 0) return { ok: true, data: result }; return { ok: false, error: `${agentName} 返回空结果`, agentName }; }
  catch (e: any) { logAgentError(agentName, stage, e?.message || String(e)); return { ok: false, error: e?.message || String(e), agentName }; }
}

// ═══════════════════════════════════════════════════════════

export default function MNISTWorkbench() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const store = useMNISTStore();
  const initDoneRef = useRef(false);
  const mountStateRef = useRef(location.state);

  // 幂等初始化
  useEffect(() => {
    if (initDoneRef.current) return;
    const id = Number(sessionId);
    if (Number.isNaN(id)) return;
    initDoneRef.current = true;
    store.init(id, "mnist_cnn");
    const navState = (mountStateRef.current || {}) as Record<string, unknown>;
    if (navState.refinedQuestion) {
      store.set({ refinedQuestion: navState.refinedQuestion as string, rawQuestion: (navState.rawQuestion || navState.refinedQuestion) as string });
      store.setStage((navState.startStage || "EXPERIMENT_DESIGNED") as ResearchStage);
    }
  }, [sessionId]);

  if (store.sessionId === null) return null;
  return (
    <Layout>
      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 mb-2">研究工作台</h1>
          <p className="text-xs text-gray-400 mb-4">MNIST 手写数字识别研究</p>
          <FlowStepper steps={STEPS} current={store.currentStage} onStepClick={(s) => {
            if (s === "TASK_SELECTED") { store.setStage("TASK_SELECTED"); return; }
            if (!store.refinedQuestion) { store.setStage("TASK_SELECTED"); return; }
            const keys = STEPS.map(st => st.key);
            if (keys.indexOf(s) > keys.indexOf("EXPERIMENT_DESIGNED") && !store.experimentResult) store.setStage("EXPERIMENT_DESIGNED");
            else store.setStage(s);
          }} />
        </aside>
        <div className="flex-1 overflow-auto bg-gray-50"><StageRouter /></div>
      </div>
    </Layout>
  );
}

function StageRouter() {
  const stage = useMNISTStore((s) => s.currentStage);
  switch (stage) {
    case "EXPERIMENT_DESIGNED": return <Stage2 />;
    case "EXPERIMENT_RUNNING": return <Stage3 />;
    case "RESULT_ANALYZED": return <Stage4 />;
    case "REFLECTION_COMPLETED": return <Stage5 />;
    case "REPORT_GENERATED": return <Stage6 />;
    case "REVIEW_COMPLETED": return <Stage7 />;
    default: return <Stage1 />;
  }
}

// ═══════ Stage1 ═══════

function Stage1() {
  const store = useMNISTStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSuggest = async () => {
    if (!store.rawQuestion.trim()) return;
    setLoading(true); setMsg(null);
    const r = await callAgent("research_mentor", "研究问题", () => callMentor({ task: "MNIST手写数字识别", student_input: store.rawQuestion, grade_level: "beginner" }));
    if (r.ok) store.set({ suggestedQuestions: (r.data as any).suggested_questions || [QUESTION_TEMPLATES[0]] });
    else { store.set({ suggestedQuestions: [QUESTION_TEMPLATES[0]] }); setMsg({ text: r.error, ok: false }); }
    setLoading(false);
  };
  const handleSelect = async (q: string) => {
    store.set({ refinedQuestion: q, rawQuestion: q });
    try { await saveQuestion({ session_id: store.sessionId!, raw_question: q, refined_question: q, independent_variable: "网络架构/超参数", dependent_variables: ["准确率"], controlled_variables: ["数据集", "随机种子"] }); } catch {}
  };
  const selectedQ = store.refinedQuestion;

  return (
    <StageContainer step={1} title="选择研究任务" agent={msg}>
      <div className="card"><h3 className="font-semibold mb-2">🧠 MNIST 手写数字识别研究</h3><p className="text-sm text-gray-500">使用真实 MNIST 数据集（28×28 灰度图，60000 训练 + 10000 测试），选择 CNN 网络架构和超参数进行训练实验。</p></div>
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">选择或输入你想研究的问题</h2>
        <div className="grid gap-2 mb-3">{QUESTION_TEMPLATES.map(t => <button key={t} onClick={() => handleSelect(t)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedQ === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{t}</button>)}</div>
        <textarea className="w-full min-h-[60px] p-3 border rounded-lg text-sm resize-y" placeholder="或用你自己的话描述..." value={store.rawQuestion} onChange={e => store.set({ rawQuestion: e.target.value })} />
        <button className="btn-primary mt-3" onClick={handleSuggest} disabled={loading || !store.rawQuestion.trim()}>{loading ? "生成中..." : "AI 帮我转化"}</button>
        {store.suggestedQuestions.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3"><h3 className="font-semibold text-gray-700 text-sm mb-2">AI 建议的研究问题（点击选择）</h3>
            <div className="space-y-1">{store.suggestedQuestions.map((q, i) => <button key={i} onClick={() => handleSelect(q)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedQ === q ? "bg-gray-900 text-white font-medium" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-100"}`}>{q}</button>)}</div></div>)}
      </div>
      {selectedQ && (<>
        <div className="card border-blue-200 bg-blue-50/50"><h3 className="font-semibold text-sm text-gray-700 mb-2">你的研究问题</h3><p className="text-sm text-gray-800 font-medium">{selectedQ}</p></div>
        <div className="flex justify-end"><button className="btn-primary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>确认 → 设计实验</button></div>
      </>)}
    </StageContainer>
  );
}

// ═══════ Stage2 ═══════

function Stage2() {
  const store = useMNISTStore();
  const hp = store.hyperparameters;
  const updateHp = (k: string, v: any) => store.set({ hyperparameters: { ...hp, [k]: v } });
  const archInfo = ARCH_LAYERS[store.selectedArchitecture] || ARCH_LAYERS.standardcnn;

  return (
    <StageContainer step={2} title="设计实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("TASK_SELECTED")}>← 上一步</button><button className="btn-primary" onClick={() => { store.set({ resultFingerprint: computeConfigFingerprint(store.selectedArchitecture, store.hyperparameters) }); store.setStage("EXPERIMENT_RUNNING"); }}>下一步 → 运行实验</button></div>}>
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">网络架构设计器</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {ARCHITECTURES.map(a => (
            <button key={a.id} onClick={() => store.set({ selectedArchitecture: a.id })} className={`text-left px-3 py-2 rounded-lg text-xs border transition-all ${store.selectedArchitecture === a.id ? "border-gray-900 bg-gray-900 text-white font-medium" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"}`}>
              <div className="font-semibold">{a.name}</div><div className="text-[10px] opacity-70">{a.params} 参数</div>
            </button>
          ))}
        </div>
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 mb-3">
          <h3 className="text-xs font-medium text-gray-500 mb-2">{ARCHITECTURES.find(a => a.id === store.selectedArchitecture)?.name || "StandardCNN"} — 层级结构</h3>
          <div className="flex flex-wrap items-center gap-1">
            {archInfo.layers.map((l, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                <div className={`px-2 py-1 rounded-md text-[10px] font-medium border ${LAYER_COLORS[l.type] || "bg-gray-100 text-gray-500 border-gray-200"}`} title={l.detail}>
                  <div>{l.type}</div><div className="opacity-70">{l.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-400 bg-gray-100 rounded-lg p-2 font-mono">维度: {archInfo.dimensions}</div>
      </div>

      {/* 架构原理说明 */}
      {(() => {
        const ai = ARCH_INFO[store.selectedArchitecture];
        if (!ai) return null;
        return (
          <div className="card border-blue-200 bg-blue-50/30">
            <h2 className="font-semibold text-gray-800 mb-2">{ARCHITECTURES.find(a => a.id === store.selectedArchitecture)?.name} 原理</h2>
            <p className="text-sm text-gray-600 mb-3">{ai.explanation}</p>
            <div className="text-xs text-gray-500 mb-3 p-2 bg-white rounded-lg border border-blue-100">💡 {ai.analogy}</div>
            <div className="flex flex-wrap gap-1.5">
              {ai.key_points.map(p => <span key={p} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p}</span>)}
            </div>
          </div>
        );
      })()}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-3">超参数设置</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ["学习率", "learningRate", HYPER_OPTIONS.learningRate],
            ["批次大小", "batchSize", HYPER_OPTIONS.batchSize],
            ["训练轮数", "epochs", HYPER_OPTIONS.epochs],
            ["优化器", "optimizer", HYPER_OPTIONS.optimizer],
            ["Dropout", "dropout", HYPER_OPTIONS.dropout],
          ].map(([label, key, vals]) => (
            <div key={key as string}>
              <h3 className="text-xs font-medium text-gray-500 mb-2">{label as string}</h3>
              <div className="space-y-1">{(vals as any[]).map((v: any) => <button key={v} onClick={() => updateHp(key as string, v)} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${(hp as any)[key as string] === v ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{v}</button>)}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <h3 className="text-xs font-medium text-gray-500 mb-2">测试样本数</h3>
            <div className="space-y-1">
              {[1000, 5000, 10000].map(v => <button key={v} onClick={() => store.set({ maxTestSamples: v })} className={`block w-full text-left px-3 py-1.5 rounded text-sm ${store.maxTestSamples === v ? "bg-gray-900 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}>{v >= 10000 ? "全部" : v.toLocaleString()}</button>)}
            </div>
          </div>
        </div>
      </div>
    </StageContainer>
  );
}

// ═══════ Stage3 ═══════

function Stage3() {
  const store = useMNISTStore();
  const [running, setRunning] = useState(false);
  const [phaseText, setPhaseText] = useState("");
  const [epochLog, setEpochLog] = useState<string[]>([]);
  const [curveData, setCurveData] = useState<{ epoch: number; train_loss: number; val_loss: number; train_acc: number; val_acc: number }[]>([]);
  const [curEpoch, setCurEpoch] = useState(0);
  const [totEpochs, setTotEpochs] = useState(0);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [device, setDevice] = useState<string>("");            // CPU / CUDA / NPU / MPS
  const [deviceUtil, setDeviceUtil] = useState(0);              // 0-100 使用率（来自真实设备采样）
  const [deviceUtilLabel, setDeviceUtilLabel] = useState("");   // "compute" | "memory" | ""
  const [deviceWarnings, setDeviceWarnings] = useState<string[]>([]);  // 设备诊断警告
  const [deviceMessages, setDeviceMessages] = useState<string[]>([]);  // 设备诊断消息
  const [recogDemo, setRecogDemo] = useState<{ samples: any[]; accuracy: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const curveRef = useRef<typeof curveData>([]);
  const doneRef = useRef(false);

  const result = store.experimentResult;
  const archName = ARCHITECTURES.find(a => a.id === store.selectedArchitecture)?.name || store.selectedArchitecture;
  const hp = store.hyperparameters;
  const displayCurve = curveData.length > 0 ? curveData : store.trainingCurve;

  // 卸载时 abort
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // 进入 Stage3 时检查缓存
  useEffect(() => {
    const currentFp = computeConfigFingerprint(store.selectedArchitecture, store.hyperparameters);
    if (store.resultFingerprint === currentFp && store.experimentResult) {
      // 配置未变 → 恢复已有结果
      setCurveData(store.trainingCurve);
      setCurEpoch(store.trainingCurve.length > 0 ? store.trainingCurve[store.trainingCurve.length - 1].epoch : 0);
      setTotEpochs(store.hyperparameters.epochs);
      doneRef.current = true;
    } else if (store.experimentResult && store.resultFingerprint !== currentFp) {
      // 配置已变 → 清除
      store.set({ experimentResult: null, trainingCurve: [], resultFingerprint: "" });
      setCurveData([]);
    }
  }, []);

  /** 同步设置 running 并立即启动训练 */
  const startTraining = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setRunning(true);
    setCurveData([]);
    setCurEpoch(0);
    setTotEpochs(0);
    setEpochLog([]);
    setErrorDetail(null);
    setRecogDemo(null);
    setPhaseText("正在连接后端服务...");
    curveRef.current = [];
    store.set({ isTraining: true });
    // 异步启动（不 await，让 UI 先渲染）
    doTrain();
  };

  const doTrain = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
      const body = { session_id: store.sessionId!, architecture: { id: store.selectedArchitecture }, hyperparameters: { learning_rate: hp.learningRate, batch_size: hp.batchSize, epochs: hp.epochs, optimizer: hp.optimizer, momentum: hp.momentum, dropout: hp.dropout }, max_test_samples: store.maxTestSamples };

      let resp: Response;
      try {
        resp = await fetch(`${baseUrl}/api/mnist/run-stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setPhaseText(`无法连接到后端服务 (${baseUrl})`);
        setErrorDetail(`无法连接到后端服务 (${baseUrl})\n请确认: 1) 后端已启动 2) 后端 .venv 中已安装 torch torchvision numpy`);
        return;
      }

      if (!resp.ok) {
        let errBody = ""; try { errBody = await resp.text(); } catch {}
        setPhaseText(`后端返回错误 HTTP ${resp.status}`);
        setErrorDetail(errBody.slice(0, 500) || `HTTP ${resp.status}`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { setPhaseText("无法读取响应流"); return; }

      setPhaseText("正在加载 MNIST 数据集（首次约 10MB，请耐心等待）...");
      const decoder = new TextDecoder(); let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n"); buffer = parts.pop() || "";
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data: ")) continue;
          let event: any;
          try { event = JSON.parse(trimmed.slice(6)); } catch (e) { buffer = trimmed + "\n\n" + buffer; continue; }

          switch (event.type) {
            case "device_info":
              // 后端设备检测诊断信息（最先到达）
              setDevice(event.selected || event.device || "CPU");
              setDeviceUtil(0);
              setDeviceWarnings(event.warnings || []);
              setDeviceMessages(event.messages || []);
              break;
            case "train_start": setTotEpochs(event.epochs); setDevice(event.device || "CPU"); setDeviceUtil(0); setPhaseText(event.message || "加载数据中..."); break;
            case "epoch_start": setCurEpoch(event.epoch || 1); break;
            case "epoch_end": {
              const ep = { epoch: event.epoch, train_loss: event.train_loss, val_loss: event.val_loss, train_acc: event.train_acc, val_acc: event.val_acc };
              curveRef.current = [...curveRef.current, ep]; setCurveData([...curveRef.current]);
              setCurEpoch(event.epoch);
              setEpochLog(prev => [...prev.slice(-20), `[Epoch ${event.epoch}/${event.total_epochs}] train_loss: ${event.train_loss.toFixed(4)}  train_acc: ${(event.train_acc*100).toFixed(1)}%  val_acc: ${(event.val_acc*100).toFixed(1)}%`]);
              break;
            }
            case "device_util":
              // 真实设备使用率（后端采样）：优先显示计算利用率，其次内存利用率
              if (event.compute_util != null) {
                setDeviceUtil(Math.round(event.compute_util));
                setDeviceUtilLabel("compute");
              } else if (event.memory_util != null) {
                setDeviceUtil(Math.round(event.memory_util));
                setDeviceUtilLabel("memory");
              }
              break;
            case "train_done": setPhaseText(event.message || `训练完成! 测试准确率 ${((event.test_acc||0)*100).toFixed(1)}%`); break;
            case "done":
              setPhaseText(event.message || "实验完成");
              store.set({
                experimentResult: { experiment_batch_id: Date.now().toString(36), status: event.status, summary: event.summary, runs: event.runs },
                trainingCurve: curveRef.current,
                resultFingerprint: computeConfigFingerprint(store.selectedArchitecture, store.hyperparameters),
                trainingCompletedAt: Date.now(),
              });
              break;
            case "recog_demo": setRecogDemo({ samples: event.samples || [], accuracy: event.accuracy || "" }); break;
            case "error": setPhaseText(`训练错误: ${event.message}`); setErrorDetail(event.message); break;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") { setPhaseText(`请求失败: ${err.message}`); setErrorDetail(err.message); }
    } finally {
      setRunning(false); store.set({ isTraining: false });
    }
  };

  return (
    <StageContainer step={3} title="运行实验" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_DESIGNED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("RESULT_ANALYZED")} disabled={!result}>查看结果 → 分析</button></div>}>
      {/* 配置卡片 */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="font-semibold">训练监控</h2><p className="text-sm text-gray-400">{archName} | lr={hp.learningRate} bs={hp.batchSize} epochs={hp.epochs} opt={hp.optimizer}</p></div>
          <button className="btn-primary text-lg px-6"
            onClick={startTraining}
            disabled={running || !!result}>
            {running ? "⏳ 训练中..." : result ? "✓ 训练已完成" : "▶ 开始训练"}
          </button>
        </div>
        {/* epoch 进度条 — 有数据后显示 */}
        {totEpochs > 0 && (
          <div className="mt-3"><div className="w-full bg-gray-200 rounded-full h-2.5"><div className="h-2.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.round(Math.max(curEpoch, 0) / totEpochs * 100)}%` }} /></div></div>
        )}
      </div>

      {/* 训练曲线 + 设备使用率 */}
      {(running || result) && (
        <div className="card">
          {/* 设备诊断警告（NPU 硬件已检测但 torch-npu 缺失等） */}
          {deviceWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              {deviceWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 leading-relaxed">{w}</p>
              ))}
            </div>
          )}
          {/* 设备诊断消息（选用的设备、安装提示等） */}
          {deviceMessages.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mb-3">
              {deviceMessages.map((m, i) => (
                <p key={i} className="text-[11px] text-blue-600 leading-relaxed">{m}</p>
              ))}
            </div>
          )}
          {/* 设备使用率条（后端实时采样，非 epoch 进度） */}
          {device && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-medium text-gray-500 uppercase w-12">{device}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-500"
                  style={{ width: `${running || result ? deviceUtil : 0}%` }} />
              </div>
              <span className="text-[10px] text-gray-400 w-10 text-right">
                {running || result ? `${deviceUtil}%` : "—"}
              </span>
              {deviceUtilLabel && (
                <span className="text-[9px] text-gray-300">
                  {deviceUtilLabel === "compute" ? "算力" : "显存"}
                </span>
              )}
            </div>
          )}
          {/* 训练中标注 */}
          {running && (
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-blue-600 font-medium">
                {totEpochs > 0 ? `Epoch ${curEpoch}/${totEpochs}` : "准备训练数据..."}
              </span>
            </div>
          )}
          <TrainingCurve data={displayCurve} currentEpoch={curEpoch} totalEpochs={totEpochs || store.hyperparameters.epochs} />
        </div>
      )}

      {/* 状态文字 + epoch 日志 */}
      {(running || result || errorDetail) && (
        <div className="card">
          {/* 只在首尾阶段显示提示文字，训练中 epoch 信息已在上方展示 */}
          {phaseText && totEpochs === 0 && !errorDetail && <p className="text-sm font-medium mb-2 flex items-center gap-2 text-blue-600">{running && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}{phaseText}</p>}
          {errorDetail && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3"><p className="text-sm text-red-700 font-medium mb-1">训练遇到问题</p><pre className="text-xs text-red-600 whitespace-pre-wrap max-h-32 overflow-y-auto">{errorDetail}</pre></div>}
          {epochLog.length > 0 && <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-[11px] font-mono max-h-48 overflow-y-auto space-y-0.5">{epochLog.map((l, i) => <div key={i}>{l}</div>)}</div>}
          {running && epochLog.length === 0 && !errorDetail && (
            <div className="text-center py-4 text-gray-400">
              <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-1.5" />
              <p className="text-xs">等待服务器响应...</p>
            </div>
          )}
        </div>
      )}

      {/* 结果汇总 */}
      {result && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[["测试准确率", `${(result.summary.final_test_accuracy * 100).toFixed(1)}%`], ["训练准确率", `${(result.summary.final_train_accuracy * 100).toFixed(1)}%`], ["最佳 Epoch", `${result.summary.best_epoch}`], ["训练时间", `${result.summary.training_time}s`]].map(([label, value]) => <div key={label} className="card text-center"><p className="text-[10px] text-gray-400">{label}</p><p className="text-lg font-bold text-gray-800">{value}</p></div>)}
        </div>
      )}

      {/* ── 识别演示 ── */}
      {recogDemo && <RecogDemo samples={recogDemo.samples} accuracy={recogDemo.accuracy} />}

      {/* ── 上传手写数字图片识别 ── */}
      <UploadInfer />
    </StageContainer>
  );
}

/** 上传手写数字图片 + 下拉选择模型 + 开始/停止识别 */
function UploadInfer() {
  const store = useMNISTStore();

  // ── 上传状态 ──
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 模型选择 ──
  interface ModelOption {
    id: string; name: string; params: string; description: string;
    status: string; selectable: boolean; progress: number | null;
    progress_total: number | null; accuracy: number | null; type: string;
  }
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loadingModels, setLoadingModels] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSelectedRef = useRef(false);       // 首次自动选中后置 true，防止轮询覆盖用户选择

  // ── 识别状态 ──
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);
  const inferAbortRef = useRef<AbortController | null>(null);

  const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const inferResult = store.uploadInference;

  // ── 挂载时：轮询模型状态（预训练由后端 on_startup 触发）──
  useEffect(() => {
    const fetchModels = () => {
      const sid = store.sessionId ?? undefined;
      const qs = sid ? `?session_id=${sid}` : "";
      fetch(`${baseUrl}/api/mnist/model-status${qs}`)
        .then(r => r.json())
        .then(data => {
          const ml: ModelOption[] = data.models || [];
          setModels(ml);
          setLoadingModels(false);
          // 首次自动选中第一个就绪模型（仅一次，之后由用户手动选择）
          if (!autoSelectedRef.current) {
            const firstReady = ml.find(m => m.selectable);
            if (firstReady) {
              setSelectedModel(firstReady.id);
              autoSelectedRef.current = true;
            }
          }
        })
        .catch(() => setLoadingModels(false));
    };

    // 立即查询 + 之后每 2 秒轮询
    fetchModels();
    pollingRef.current = setInterval(fetchModels, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [store.sessionId]);
  // 训练完成后立即刷新列表 + 自动选中用户模型
  useEffect(() => {
    if (!store.trainingCompletedAt) return;
    const sid = store.sessionId ?? undefined;
    const qs = sid ? `?session_id=${sid}` : "";
    fetch(`${baseUrl}/api/mnist/model-status${qs}`)
      .then(r => r.json())
      .then(data => {
        const ml: ModelOption[] = data.models || [];
        setModels(ml);
        const userM = ml.find(m => m.id === "user" && m.selectable);
        if (userM) setSelectedModel("user");
      })
      .catch(() => {});
  }, [store.trainingCompletedAt]);

  // ── 文件处理 ──
  const handleFile = (f: File | null) => {
    if (!f || inferring) return;
    setFile(f); setInferError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  // ── 识别 ──
  const doInfer = async () => {
    if (!file || !store.sessionId || !selectedModel) return;
    setInferring(true); setInferError(null);
    const ac = new AbortController();
    inferAbortRef.current = ac;
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("session_id", String(store.sessionId));
      form.append("model_id", selectedModel);
      const resp = await fetch(`${baseUrl}/api/mnist/infer`, {
        method: "POST", body: form, signal: ac.signal,
      });
      if (!resp.ok) {
        const txt = await resp.text();
        let err = txt.slice(0, 300);
        try { const j = JSON.parse(txt); err = j.detail || err; } catch {}
        setInferError(err);
        return;
      }
      const data = await resp.json();
      store.set({
        uploadInference: {
          fileName: file.name,
          modelId: data.model_id || selectedModel,
          modelName: data.model_name || selectedModel,
          predicted: data.predicted,
          confidence: data.confidence,
          probabilities: data.probabilities || [],
        },
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setInferError(e?.message || "请求失败");
    } finally {
      setInferring(false);
      inferAbortRef.current = null;
    }
  };

  const stopInfer = () => {
    if (inferAbortRef.current) { inferAbortRef.current.abort(); inferAbortRef.current = null; }
    setInferring(false);
  };

  // ── 下拉框渲染 ──
  const selModelInfo = models.find(m => m.id === selectedModel);
  const statusLabel = (m: ModelOption): { text: string; cls: string } => {
    switch (m.status) {
      case "cached": return { text: `✅ ${m.accuracy != null ? `测试准确率 ${(m.accuracy * 100).toFixed(1)}%` : "就绪"}`, cls: "text-green-600" };
      case "training": return { text: `⏳ 训练中 ${m.progress}/${m.progress_total || "?"}`, cls: "text-amber-600" };
      case "failed": return { text: "❌ 训练失败", cls: "text-red-500" };
      default: return { text: "未就绪", cls: "text-gray-400" };
    }
  };

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-700 mb-3">📤 上传手写数字图片识别</h2>

      {/* ── 模型选择下拉框 ── */}
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">选择识别模型</label>
        <div className="relative">
          <select
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            disabled={inferring || models.length === 0}
          >
            {loadingModels && <option value="">加载模型状态中...</option>}
            {!loadingModels && models.length === 0 && <option value="">未检测到可用模型</option>}
            {models.map(m => {
              const st = statusLabel(m);
              return (
                <option key={m.id} value={m.id} disabled={!m.selectable}>
                  {m.name} ({m.params}参数) — {st.text}
                </option>
              );
            })}
          </select>
        </div>
        {/* 选中模型详情 */}
        {selModelInfo && (
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400">
            <span>{selModelInfo.description}</span>
            <span className={statusLabel(selModelInfo).cls}>{statusLabel(selModelInfo).text}</span>
            {selModelInfo.status === "training" && (
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-amber-600">后台训练中…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 上传区 ── */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors mb-3 ${
          inferring
            ? "border-gray-200 bg-gray-50 cursor-not-allowed"
            : "border-gray-300 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30"
        }`}
        onClick={() => { if (!inferring) fileRef.current?.click(); }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (!inferring) handleFile(e.dataTransfer.files?.[0] ?? null); }}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => handleFile(e.target.files?.[0] ?? null)} disabled={inferring} />
        {preview ? (
          <div className="flex justify-center">
            <img src={preview} alt="预览" className="max-h-32 rounded-lg border border-gray-200" />
          </div>
        ) : (
          <p className="text-sm text-gray-400">点击或拖拽上传手写数字图片</p>
        )}
      </div>
      {file && <p className="text-[10px] text-gray-400 mb-3 text-center">{file.name} ({Math.round(file.size / 1024)} KB)</p>}

      {/* ── 开始/停止识别按钮 ── */}
      <div className="mb-3">
        {!inferring ? (
          <button
            className="btn-primary w-full"
            disabled={!file || !selectedModel || !selModelInfo?.selectable}
            onClick={doInfer}
          >
            🔍 开始识别
          </button>
        ) : (
          <button className="btn-secondary w-full text-red-600 border-red-200 hover:bg-red-50" onClick={stopInfer}>
            ⏹️ 停止识别
          </button>
        )}
      </div>

      {/* ── 错误 ── */}
      {inferError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <p className="text-xs text-red-700">{inferError}</p>
        </div>
      )}

      {/* ── 识别结果 ── */}
      {inferResult && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <p className="text-[10px] text-gray-500 mb-1">
            {inferResult.modelName} · {inferResult.fileName}
          </p>
          <p className="text-5xl font-bold text-green-700 mb-1">{inferResult.predicted}</p>
          <p className="text-xs text-green-500">置信度 {inferResult.confidence}%</p>
          {/* 各类别概率条 */}
          <div className="mt-3 grid grid-cols-10 gap-1">
            {inferResult.probabilities.map((p, i) => (
              <div key={i} className="text-center">
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-0.5" style={{ minWidth: 20 }}>
                  <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(p, 100)}%` }} />
                </div>
                <span className={`text-[9px] ${p === Math.max(...inferResult.probabilities) ? "font-bold text-blue-600" : "text-gray-400"}`}>{i}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════ Stage4 ═══════

function Stage4() {
  const store = useMNISTStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const result = store.experimentResult;
  const run = result?.runs?.[0];
  const device = run?.device || "cpu";
  const archName = ARCHITECTURES.find(a => a.id === store.selectedArchitecture)?.name || store.selectedArchitecture;
  const overfitScore = (result?.summary?.overfitting_score ?? 0) * 100;

  const handleAnalyze = async () => {
    setAnalyzing(true); setMsg(null);
    const r = await callAgent("data_analyst", "分析结果", () => callDataAnalyst({ hypothesis: store.hypothesis || "CNN 能有效识别手写数字", experiment_results: result?.summary || {} }));
    store.set({ aiAnalysis: r.ok ? r.data as any : { summary: `最终测试准确率 ${((result?.summary?.final_test_accuracy ?? 0) * 100).toFixed(1)}%，模型${(result?.summary?.overfitting_score ?? 0) < 0.03 ? "泛化良好" : "存在一定过拟合"}。`, key_findings: [`训练准确率 ${((result?.summary?.final_train_accuracy ?? 0) * 100).toFixed(1)}%`, `最佳验证准确率在第 ${result?.summary?.best_epoch ?? '-'} 轮`, `过拟合程度 ${((result?.summary?.overfitting_score ?? 0) * 100).toFixed(1)}%`], questions_for_student: ["训练准确率高于测试准确率说明了什么？", "如果增加Dropout比例会怎样？", "为什么CNN比MLP更适合图像？"] } });
    if (!r.ok) setMsg({ text: r.error, ok: false }); setAnalyzing(false);
  };
  const handleSave = async () => { try { await saveAnalysis(store.sessionId!, store.studentAnalysis); } catch {} };

  return (
    <StageContainer step={4} title="分析结果" agent={msg} actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("EXPERIMENT_RUNNING")}>← 上一步</button><button className="btn-primary" onClick={() => { handleSave(); store.setStage("REFLECTION_COMPLETED"); }} disabled={!store.studentAnalysis.trim()}>保存 → 反思改进</button></div>}>
      {result && (
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">准确率对比</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              ["训练准确率", `${(result.summary.final_train_accuracy * 100).toFixed(1)}%`, "bg-blue-50 text-blue-700"],
              ["测试准确率", `${(result.summary.final_test_accuracy * 100).toFixed(1)}%`, "bg-green-50 text-green-700"],
              ["验证准确率", `${(result.summary.best_val_accuracy * 100).toFixed(1)}%`, "bg-purple-50 text-purple-700"],
              ["过拟合程度", `${overfitScore.toFixed(1)}%`, overfitScore < 2 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"],
            ].map(([l, v, cls]) => (
              <div key={l as string} className={`rounded-lg p-3 text-center ${cls}`}><p className="text-[10px] opacity-70">{l as string}</p><p className="text-xl font-bold">{v as string}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["最佳Epoch", String(result.summary.best_epoch)], ["训练时间", `${result.summary.training_time}s`], ["运行设备", device.toUpperCase()], ["网络架构", archName]].map(([l, v]) => <div key={l as string} className="card text-center"><p className="text-[10px] text-gray-400">{l as string}</p><p className="text-sm font-bold text-gray-700">{v as string}</p></div>)}
          </div>
        </div>
      )}
      {store.trainingCurve.length > 0 && <TrainingCurve data={store.trainingCurve} />}
      <div className="flex items-center justify-between"><span className="text-sm text-gray-400">让 AI 帮你分析实验结果</span><button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "分析中..." : "AI 分析结果"}</button></div>
      {store.aiAnalysis && <div className="card border-blue-100 bg-blue-50/30"><p className="font-medium text-gray-800 mb-3">{store.aiAnalysis.summary}</p>{store.aiAnalysis.key_findings?.length > 0 && <ul className="mb-3 space-y-0.5">{store.aiAnalysis.key_findings.map((f: string, i: number) => <li key={i} className="text-sm text-gray-600">• {f}</li>)}</ul>}<div className="border-t border-blue-100 pt-3"><p className="text-sm font-medium text-gray-700 mb-1">思考：</p>{store.aiAnalysis.questions_for_student?.map((q: string, i: number) => <p key={i} className="text-sm text-gray-500">{i + 1}. {q}</p>)}</div></div>}
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">你的分析</h2><textarea className="w-full min-h-[100px] p-3 border rounded-lg text-sm resize-y" placeholder="写下发现：哪种架构最好？超参数如何影响结果？" value={store.studentAnalysis} onChange={e => store.set({ studentAnalysis: e.target.value })} /></div>
    </StageContainer>
  );
}

// ═══════ Stage5 ═══════

const REFLECTION_QUESTIONS = [
  { id: 1, q: "你的实验结果是否支持最初的假设？为什么？", category: "假设验证" },
  { id: 2, q: "训练准确率高于测试准确率说明了什么？如何缓解？", category: "模型分析" },
  { id: 3, q: "如果学习率增大10倍，你预测会发生什么？", category: "超参数影响" },
  { id: 4, q: "增加一个卷积层是否一定能提升准确率？为什么？", category: "网络结构" },
  { id: 5, q: "如果要进一步提升准确率，你会尝试什么方法？", category: "改进方向" },
];

function Stage5() {
  const store = useMNISTStore();
  return (
    <StageContainer step={5} title="反思改进" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("RESULT_ANALYZED")}>← 上一步</button><button className="btn-primary" onClick={() => store.setStage("REPORT_GENERATED")}>下一步 → 生成报告</button></div>}>
      <div className="card"><h2 className="font-semibold text-gray-700 mb-3">反思问题</h2><p className="text-xs text-gray-400 mb-4">回答以下问题，深入思考你的实验</p>
        <div className="space-y-4">{REFLECTION_QUESTIONS.map(rq => (
          <div key={rq.id}><label className="text-sm font-medium text-gray-700 mb-1 block">{rq.id}. {rq.q} <span className="text-[10px] text-gray-400">({rq.category})</span></label>
            <textarea className="w-full p-2 border rounded-lg text-sm resize-y min-h-[60px]" placeholder="写下你的思考..." value={store.reflectionAnswers[rq.id] || ""} onChange={e => store.set({ reflectionAnswers: { ...store.reflectionAnswers, [rq.id]: e.target.value } })} /></div>
        ))}</div>
      </div>
    </StageContainer>
  );
}

// ═══════ Stage6 ═══════

function Stage6() {
  const store = useMNISTStore(); const navigate = useNavigate(); const [preview, setPreview] = useState(false);
  const result = store.experimentResult;
  const archName = ARCHITECTURES.find(a => a.id === store.selectedArchitecture)?.name || store.selectedArchitecture;
  const hp = store.hyperparameters;
  if (!store.reportMarkdown) {
    store.set({ reportMarkdown: [
        "# MNIST 手写数字识别研究报告", "", "## 1. 研究问题", store.refinedQuestion || store.rawQuestion, "",
        "## 2. 我的假设", store.hypothesis, "", "## 3. 实验设计",
        `- 网络架构: ${archName} (${store.selectedArchitecture})`, `- 学习率: ${hp.learningRate}  |  批次大小: ${hp.batchSize}  |  训练轮数: ${hp.epochs}`, `- 优化器: ${hp.optimizer}  |  Momentum: ${hp.momentum}  |  Dropout: ${hp.dropout}`, "",
        "## 4. 实验结果", result ? [`| 指标 | 值 |`, `|---|---|`, `| 最终训练准确率 | ${(result.summary.final_train_accuracy * 100).toFixed(1)}% |`, `| 最终测试准确率 | ${(result.summary.final_test_accuracy * 100).toFixed(1)}% |`, `| 最佳测试准确率 | ${(result.summary.best_val_accuracy * 100).toFixed(1)}% (第${result.summary.best_epoch}轮) |`, `| 训练时间 | ${result.summary.training_time}秒 |`, `| 过拟合程度 | ${(result.summary.overfitting_score * 100).toFixed(1)}% |`].join("\n") : "暂无数据", "",
        "## 5. 我的分析", store.studentAnalysis, "", "## 6. 反思与改进",
        ...REFLECTION_QUESTIONS.map(rq => `- **${rq.q}**\n  ${store.reflectionAnswers[rq.id] || "(未回答)"}\n`), "## 7. 总结",
      ].join("\n") });
  }
  return (
    <StageContainer step={6} title="生成报告" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("REFLECTION_COMPLETED")}>← 上一步</button><button className="btn-primary" onClick={() => { archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: [store.selectedArchitecture], summary: result?.summary || null, analysis: store.studentAnalysis, reflection: store.reflectionAnswers, report: store.reportMarkdown, review: null }); navigate("/archive"); }}>完成 → 档案</button></div>}>
      <div className="card"><div className="flex gap-2 mb-4"><button className={`btn-secondary text-sm ${!preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(false)}>编辑</button><button className={`btn-secondary text-sm ${preview ? "bg-gray-300" : ""}`} onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="min-h-[300px] border rounded-lg p-4 bg-white"><pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm">{store.reportMarkdown}</pre></div> : <textarea className="w-full min-h-[300px] p-4 border rounded-lg font-mono text-sm resize-y" value={store.reportMarkdown} onChange={e => store.set({ reportMarkdown: e.target.value })} />}
      </div>
    </StageContainer>
  );
}

// ═══════ Stage7 ═══════

function Stage7() {
  const store = useMNISTStore(); const navigate = useNavigate();
  const result = store.experimentResult;
  const acc = (result?.summary?.final_test_accuracy ?? 0) * 100;
  const overfit = (result?.summary?.overfitting_score ?? 0) * 100;
  const grade = acc >= 98 ? "A" : acc >= 95 ? "B" : acc >= 90 ? "C" : "D";
  const hasReflection = Object.values(store.reflectionAnswers).some(v => v?.trim());
  const hasAnalysis = store.studentAnalysis.trim().length > 0;
  const reportLen = (store.reportMarkdown || "").length;
  const scores = { question_clarity: reportLen > 50 ? 5 : reportLen > 20 ? 4 : 3, network_design: store.selectedArchitecture.includes("cnn") ? 5 : 4, hyperparam_tuning: 4, analysis_depth: hasAnalysis ? 5 : 3, reflection_quality: hasReflection ? 5 : 3, report_completeness: reportLen > 300 ? 5 : reportLen > 150 ? 4 : 3 };
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const strengths: string[] = []; const weaknesses: string[] = [];
  if (acc >= 98) strengths.push(`模型准确率达到 ${acc.toFixed(1)}%，表现优秀！`);
  else if (acc >= 95) strengths.push(`模型准确率 ${acc.toFixed(1)}%，达到良好水平`);
  if (overfit < 2) strengths.push("模型泛化能力好，过拟合程度低");
  else weaknesses.push(`存在过拟合（差距 ${overfit.toFixed(1)}%），建议增加 Dropout 或减少网络层数`);
  if (store.selectedArchitecture.includes("cnn")) strengths.push("正确使用了卷积神经网络处理图像数据");
  if (hasAnalysis) strengths.push("使用实验数据支撑结论"); else weaknesses.push("缺少数据展示，结论缺乏说服力");
  if (hasReflection) strengths.push("对实验进行了反思"); else weaknesses.push("建议反思实验的局限性和改进方向");

  return (
    <StageContainer step={7} title="审稿反馈" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={() => store.setStage("REPORT_GENERATED")}>← 上一步</button><button className="btn-primary" onClick={() => { archiveSession({ sessionId: store.sessionId, taskId: store.taskId, question: store.refinedQuestion || store.rawQuestion, hypothesis: store.hypothesis, algorithms: [store.selectedArchitecture], summary: result?.summary || null, analysis: store.studentAnalysis, reflection: store.reflectionAnswers, report: store.reportMarkdown, review: scores }); navigate("/archive"); }}>完成 → 档案</button></div>}>
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center"><p className="text-3xl font-bold text-gray-800">{totalScore}</p><p className="text-xs text-gray-400 mt-1">总分 / 30</p></div>
        <div className="card text-center"><p className="text-3xl font-bold text-blue-600">{grade}</p><p className="text-xs text-gray-400 mt-1">综合评级</p></div>
        <div className="card text-center"><p className="text-3xl font-bold text-green-600">{acc.toFixed(1)}%</p><p className="text-xs text-gray-400 mt-1">测试准确率</p></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.entries(scores).map(([k, v]) => { const labels: Record<string, string> = { question_clarity: "问题清晰度", network_design: "网络设计", hyperparam_tuning: "超参数调优", analysis_depth: "分析深度", reflection_quality: "反思质量", report_completeness: "报告完整度" }; return <div key={k} className="card"><div className="flex justify-between items-center"><span className="text-xs text-gray-500">{labels[k] || k}</span><span className="text-sm font-bold text-gray-800">{v}/5</span></div><div className="w-full bg-gray-200 rounded-full h-1 mt-1"><div className="h-1 rounded-full bg-blue-500" style={{ width: `${v / 5 * 100}%` }} /></div></div>; })}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card border-green-100 bg-green-50/30"><h3 className="font-semibold text-green-700 text-sm mb-2">优势</h3><ul className="space-y-1">{strengths.map((s, i) => <li key={i} className="text-sm text-green-600">• {s}</li>)}</ul></div>
        <div className="card border-amber-100 bg-amber-50/30"><h3 className="font-semibold text-amber-700 text-sm mb-2">改进建议</h3><ul className="space-y-1">{weaknesses.map((s, i) => <li key={i} className="text-sm text-amber-600">• {s}</li>)}</ul></div>
      </div>
      <div className="card"><h3 className="font-semibold text-gray-700 text-sm mb-2">思考题</h3>{["如果将学习率提高10倍，你认为训练会发生什么变化？", "为什么卷积神经网络比全连接网络更适合图像任务？", "如果数据集增加噪声，你预测哪个网络结构更稳健？", "你如何解释训练准确率和测试准确率之间的差距？"].map((q, i) => <p key={i} className="text-sm text-gray-600 mt-1">{i + 1}. {q}</p>)}</div>
    </StageContainer>
  );
}

// ── 模型识别验证（Canvas 逐行扫描动画） ──

function RecogDemo({ samples }: { samples: any[]; accuracy?: string }) {
  const [frame, setFrame] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const CELL = 6; const SIZE = 28 * CELL;
  const totalFrames = samples.length * 60;
  const done = frame >= totalFrames;

  useEffect(() => {
    if (samples.length === 0) return;
    const interval = setInterval(() => {
      setFrame(prev => {
        if (prev >= totalFrames) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [samples.length, totalFrames]);

  // 动画完成后锁定在最后一个样本（扫描完成 + 结果显示）
  const curIdx = done ? samples.length - 1 : Math.min(Math.floor(frame / 60), samples.length - 1);
  const animPhase = done ? 40 : frame % 60;  // done 后锁定在 showResult 阶段
  const scanLines = done ? 28 : Math.min(Math.round(animPhase / 25 * 28), 28);
  const showResult = done || animPhase >= 26;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = SIZE; canvas.height = SIZE;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SIZE, SIZE);

    const sample = samples[curIdx];
    if (!sample?.image) return;

    const img = sample.image;
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        if (y >= scanLines) {
          ctx.fillStyle = "#f5f5f5"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          ctx.strokeStyle = "#eee"; ctx.lineWidth = 0.5;
          ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
          continue;
        }
        const v = Array.isArray(img[y]) ? img[y][x] : (img[y * 28 + x] ?? 0);
        if (typeof v !== "number") continue;
        const gray = Math.round((1 - v) * 255);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.fillRect(x * CELL, y * CELL, CELL + 0.5, CELL + 0.5);
      }
    }

    if (showResult) {
      const color = sample.correct ? "#22c55e" : "#ef4444";
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
    }
  }, [frame, samples, curIdx, scanLines, showResult]);

  const sample = samples[curIdx];
  const correctCount = samples.filter((s: any) => s.correct).length;

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-700 mb-1">模型识别验证</h2>
      <p className="text-xs text-gray-400 mb-3">用训练好的模型识别 8 个真实 MNIST 测试样本，验证模型效果</p>
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center">
          <canvas ref={canvasRef} style={{ width: SIZE, height: SIZE, imageRendering: "pixelated" }} className="rounded-lg border border-gray-200" />
        </div>
        <div className="flex-1 text-sm space-y-1.5">
          <p className="text-gray-500">
            识别进度: <span className="font-medium text-gray-700">{Math.min(curIdx + 1, samples.length)}/{samples.length}</span>
          </p>
          {showResult && sample && (
            <p>
              真实数字: <span className="font-bold text-gray-800 text-lg">{sample.true_label}</span>
              <span className="mx-2 text-gray-300">→</span>
              模型预测: <span className={`font-bold text-lg ${sample.correct ? "text-green-600" : "text-red-600"}`}>{sample.predicted_label}</span>
              <span className={`ml-1 text-sm ${sample.correct ? "text-green-500" : "text-red-500"}`}>{sample.correct ? "✓ 正确" : "✗ 错误"}</span>
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            模型识别准确率: {correctCount}/{samples.length} ({((correctCount / samples.length) * 100).toFixed(0)}%)
          </p>
        </div>
      </div>
    </div>
  );
}
