/** 共享反思改进环节 — 按实验出题 + 可点击填充的参考模版（默认不选中任何模板） */
import { useEffect, useRef, useState } from "react";
import StageContainer from "./StageContainer";
import { getReflectionQuestions, generateReflectionQuestions, saveReflectionAnswer } from "../api/service";
import type { ReflectionQuestion } from "../api/service";

const DEFAULT_FALLBACK = [
  "你的结果是否支持最初假设？为什么？",
  "哪个算法表现最好？哪个最不稳定？",
  "有没有出现意外结果？你如何解释？",
  "如果重新设计实验，你会怎么改？",
  "你的实验有什么局限？",
];

interface ReflectionStageProps {
  sessionId: number;
  /** 实验标识（task_id），用于后端生成对应实验的专属问题；demo 会话无真实 session 时必须有 */
  taskId?: string;
  /** store 中的反思回答，键为问题索引（0-4） */
  reflectionAnswers: Record<number, string>;
  /** 回答变化时写回 store（键为问题索引） */
  onChange: (answers: Record<number, string>) => void;
  /** 离线/后端不可用时的本地降级问题（需与实验强相关） */
  fallbackQuestions?: string[];
  /** 载入完整问题对象（含模板答案），供报告生成引用（数组顺序 = 问题顺序） */
  onQuestions?: (qs: ReflectionQuestion[]) => void;
  onBack: () => void;
  onNext: () => void;
  step?: number;
  nextLabel?: string;
}

/** 由 questions + 本地 answers 重建"按索引"的 store 记录 */
function toIndexed(
  qs: ReflectionQuestion[],
  realAnswers: Record<number, string>,
  fallbackAnswers: Record<number, string>,
): Record<number, string> {
  const res: Record<number, string> = {};
  qs.forEach((q, i) => {
    const a = q.id < 0 ? (fallbackAnswers[-(q.id + 1)] || "") : (realAnswers[q.id] || "");
    res[i] = a;
  });
  return res;
}

export default function ReflectionStage({
  sessionId, taskId, reflectionAnswers, onChange, fallbackQuestions = DEFAULT_FALLBACK,
  onQuestions, onBack, onNext, step = 5, nextLabel = "完成反思 → 生成报告",
}: ReflectionStageProps) {
  const [questions, setQuestions] = useState<ReflectionQuestion[]>([]);
  const [realAnswers, setRealAnswers] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onQuestionsRef = useRef(onQuestions);
  onQuestionsRef.current = onQuestions;

  const useFallback = () => {
    const texts = fallbackQuestions.length > 0 ? fallbackQuestions : DEFAULT_FALLBACK;
    const fqs: ReflectionQuestion[] = texts.map((q, i) => ({
      id: -i - 1, session_id: sessionId, question_text: q, category: "general",
      category_label: "通用", sort_order: i, is_selected: true,
      student_answer: reflectionAnswers[i] || "", ai_feedback: "", template_answers: [], created_at: "",
    }));
    setQuestions(fqs);
    onQuestionsRef.current?.(fqs);
    const fa: Record<number, string> = {};
    fqs.forEach((q, i) => { fa[q.id] = reflectionAnswers[i] || ""; });
    setRealAnswers(fa);
    onChange(toIndexed(fqs, fa, reflectionAnswers));
  };

  const loadQuestions = async () => {
    try {
      let qs: ReflectionQuestion[] | null = null;
      try { qs = await getReflectionQuestions(sessionId, taskId); } catch { /* API 不可用 */ }
      if (!qs || qs.length === 0) {
        try { const generated = await generateReflectionQuestions(sessionId, taskId); qs = generated.questions || []; } catch { /* 降级 */ }
      }
      if (qs && qs.length > 0) {
        setQuestions(qs);
        onQuestionsRef.current?.(qs);
        const am: Record<number, string> = {};
        for (const q of qs) { if (q.student_answer) am[q.id] = q.student_answer; }
        setRealAnswers(am);
        onChange(toIndexed(qs, am, reflectionAnswers));
      } else {
        useFallback();
      }
    } catch {
      useFallback();
    }
    setLoaded(true);
  };

  useEffect(() => { loadQuestions(); }, []);

  const handleBlur = async (qid: number, text: string) => {
    if (!text.trim()) return;
    onChange(toIndexed(questions, realAnswers, { ...reflectionAnswers, [-(qid + 1)]: text }));
    // 回答保存到后端用于科研能力评分（不展示 AI 反馈）
    if (qid > 0) {
      try { await saveReflectionAnswer(qid, text); } catch { /* 静默 */ }
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => {
    const a = q.id < 0 ? reflectionAnswers[-(q.id + 1)] : realAnswers[q.id];
    return a?.trim();
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const generated = await generateReflectionQuestions(sessionId, taskId);
      if (generated.questions?.length > 0) {
        setQuestions(generated.questions);
        onQuestionsRef.current?.(generated.questions);
        setRealAnswers({});
        onChange({}); // 清空 store 中旧索引回答，避免新题错配旧答案
      } else {
        useFallback();
      }
    } catch {
      useFallback();
    }
    setRefreshing(false);
  };

  return (
    <StageContainer step={step} title="反思与改进" actions={<div className="flex gap-3 w-full justify-between"><button className="btn-secondary" onClick={onBack}>← 上一步</button><button className="btn-primary" onClick={onNext} disabled={!allAnswered}>{nextLabel}</button></div>}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">回顾研究过程，回答以下问题。完成后即可生成研究报告。</p>
        <button className="btn-secondary text-xs" onClick={handleRefresh} disabled={refreshing}>{refreshing ? "生成中..." : "🔄 换一组问题"}</button>
      </div>

      {!loaded && <div className="card text-center py-8"><p className="text-gray-400">正在生成反思问题...</p></div>}

      {questions.map((q, i) => {
        const qid = q.id;
        const ans = qid < 0 ? (reflectionAnswers[-(qid + 1)] || "") : (realAnswers[qid] || "");
        return (
          <div key={qid} className="card">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200 flex-shrink-0">{q.category_label || "通用"}</span>
              <h3 className="font-semibold text-gray-700 text-sm">{i + 1}. {q.question_text}</h3>
            </div>
            <textarea
              className="w-full p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
              rows={3}
              placeholder="写下你的想法，或点击下方模版快速填写..."
              value={ans}
              onChange={(e) => {
                const v = e.target.value;
                if (qid < 0) {
                  onChange(toIndexed(questions, realAnswers, { ...reflectionAnswers, [-(qid + 1)]: v }));
                } else {
                  setRealAnswers((a) => ({ ...a, [qid]: v }));
                }
              }}
              onBlur={(e) => handleBlur(qid, e.target.value)}
            />
            {/* 模板回答按钮 — 默认不选中，点击后填充 */}
            {q.template_answers && q.template_answers.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-gray-400">📝 参考模版（点击填充）：</p>
                {q.template_answers.map((t: any, j: number) => {
                  const isActive = ans === t.text;
                  return (
                    <button key={j}
                      onClick={() => {
                        if (qid < 0) {
                          onChange(toIndexed(questions, realAnswers, { ...reflectionAnswers, [-(qid + 1)]: t.text }));
                        } else {
                          setRealAnswers((a) => ({ ...a, [qid]: t.text }));
                          handleBlur(qid, t.text);
                        }
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] leading-relaxed transition-all ${isActive ? "bg-blue-50 border border-blue-300" : "bg-white text-gray-500 hover:bg-blue-50/50 border border-gray-200"}`}>
                      {t.text.length > 80 ? t.text.slice(0, 80) + "…" : t.text}
                    </button>
                  );
                })}
              </div>
            )}
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
