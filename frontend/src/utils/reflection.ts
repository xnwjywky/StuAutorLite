/** 反思回答兜底工具 — 报告生成时把空白/敷衍回答替换为该题模板答案，保证内容完整可评分 */
import type { ReflectionQuestion } from "../api/service";

/** 敷衍/无相关内容关键词（与后端 reflection_content.is_blank_answer 保持一致） */
const FILLERS = new Set([
  "无", "没有", "不知道", "不清楚", "不会", "没想好", "没想法", "随便", "无回答", "没回答",
  "暂无", "无内容", "没写", "不会写", "不知道怎么写", "忘了", "我忘了", "忘记了", "不记得",
  "none", "null", "n/a", "na",
]);

export function isBlankAnswer(text?: string): boolean {
  const t = (text || "").trim();
  if (!t || t.length < 4) return true;
  return FILLERS.has(t.toLowerCase());
}

export interface ReflectionEntry {
  q: string;
  a: string;
}

/** 逐题解析：空白/敷衍回答 → 确定性取该题模板答案（P2：不再随机，保证可复现）；
 * 模板按 score 升序（初步/较好/优秀），取第一条完整的低分模板最贴合"空白回答"；无模板 → placeholder */
export function buildReflectionEntries(
  refQs: (string | ReflectionQuestion)[],
  answers: Record<number, string>,
  placeholder = "（待补充）",
): ReflectionEntry[] {
  return refQs.map((item, i) => {
    const q = typeof item === "string" ? item : item.question_text;
    let a = (answers[i] || "").trim();
    if (isBlankAnswer(a)) {
      const tpls = typeof item === "string" ? [] : (item.template_answers || []);
      a = tpls.length > 0 ? tpls[0].text : placeholder;
    }
    return { q, a };
  });
}

/** 标准报告格式：`**问题**\n\n回答` */
export function buildReflectionText(
  refQs: (string | ReflectionQuestion)[],
  answers: Record<number, string>,
): string {
  return buildReflectionEntries(refQs, answers)
    .map(({ q, a }) => `**${q}**\n\n${a}`)
    .join("\n\n");
}
