"""反思问题路由 — 题库生成 + 选择 + 回答 + AI 反馈"""

import json
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, ReflectionQuestion, Session as SessionModel
from app.models.schemas import ReflectionQuestionCreate, ReflectionAnswerSave

router = APIRouter(prefix="/reflection", tags=["reflection"])

# 大题库（按类别分类），每类 5-8 题，共 ~25 题
QUESTION_POOL: dict[str, list[str]] = {
    "hypothesis": [
        "你的实验结果是否支持最初假设？哪些数据支持，哪些数据不支持？",
        "如果你的假设被推翻了，你觉得最可能的原因是什么？",
        "回顾你的假设 — 如果重新写一次，你会怎么修改？为什么？",
        "你的假设是基于什么理由提出的？直觉、经验还是已有知识？",
        "实验中是否有超出你预期的情况？它们对你的假设有什么影响？",
    ],
    "data": [
        "对比所有算法的数据，哪个指标最让你惊讶？",
        "数据中有没有异常值或波动很大的结果？你认为为什么会这样？",
        "你的实验重复次数够多吗？如果增加重复次数，你预期数据会怎样变化？",
        "如果只看成功率的数字，哪个算法最可靠？为什么？",
        "实验数据中各个算法在路径长度和搜索节点数之间有没有明显的 trade-off？",
        "如果你要向没做过实验的同学展示结果，你会选哪张图表？用它说明什么？",
    ],
    "method": [
        "你的实验设计中，哪个变量影响最大？有没有你忽略了的变量？",
        "如果换一种迷宫生成方式（比如用 DFS 挖迷宫而不是随机放墙），结果会一样吗？",
        "你选择的障碍物比例范围是否足够？极端情况（0% 或 60%）会怎样？",
        "实验中每个算法是否都在完全相同的条件下测试？有没有不公平的地方？",
        "如果只改变迷宫大小从 12×12 到 20×20，你最想看哪个算法的表现？",
    ],
    "limitation": [
        "你认为这个实验最大的局限性是什么？哪些结论不能推广到其他迷宫？",
        "实验结果是否适用于所有类型的迷宫，还是只适用于你测试的这种？",
        '实验数据能证明"因果关系"吗，还是只能说明"相关性"？',
        "有没有什么东西是你想在实验中测量但没有做到的？",
        "你的实验使用了固定大小的迷宫 — 这里有什么局限？",
    ],
    "improvement": [
        "如果重新设计这个实验，你最想改变什么？为什么？",
        "下一个实验你想研究什么问题？可以从已有结果的缺口出发。",
        "有没有其他算法（比如 Dijkstra、贪心搜索）你感兴趣也想测试的？",
        "如果要做一个展示板向全班展示你的研究发现，你会重点呈现什么？",
        '通过这次实验，你对"科学研究"这个过程有什么新的理解？',
        "如果让你给一个还没开始做的同学提建议，你会说什么？",
    ],
}

CATEGORY_LABELS = {
    "hypothesis": "假设与验证",
    "data":       "数据分析",
    "method":     "实验方法",
    "limitation": "实验局限",
    "improvement":"改进方向",
}


@router.post("/generate")
def generate_questions(req: ReflectionQuestionCreate, db: DbSession = Depends(get_db)):
    """为一个 session 生成反思问题：每类选 1 题，共 5 题，写入 DB"""
    # 先清理旧题
    db.query(ReflectionQuestion).filter(
        ReflectionQuestion.session_id == req.session_id
    ).delete()

    rng = random.Random(req.session_id)
    selected: list[ReflectionQuestion] = []
    order = 0

    for cat, questions in QUESTION_POOL.items():
        if not questions:
            continue
        chosen = rng.sample(questions, min(1, len(questions)))
        for q in chosen:
            rq = ReflectionQuestion(
                session_id=req.session_id,
                question_text=q,
                category=cat,
                sort_order=order,
                is_selected=1,
                template_answers=json.dumps(_gen_templates(q), ensure_ascii=False),
            )
            db.add(rq)
            selected.append(rq)
            order += 1

    db.commit()
    return {"questions": [_serialize(q) for q in selected], "total": len(selected)}


@router.post("/templates/generate")
def generate_templates_for_questions(session_id: int, db: DbSession = Depends(get_db)):
    """为已有反思问题（重新）生成模板答案。保留已有 student_answer 和 ai_feedback。"""
    qs = db.query(ReflectionQuestion).filter(
        ReflectionQuestion.session_id == session_id,
        ReflectionQuestion.is_selected == 1,
    ).all()
    if not qs:
        raise HTTPException(status_code=404, detail="没有找到该会话的反思问题")
    for rq in qs:
        rq.template_answers = json.dumps(_gen_templates(rq.question_text), ensure_ascii=False)
    db.commit()
    return {"questions": [_serialize(q) for q in qs]}


@router.get("/questions")
def get_questions(session_id: int, db: DbSession = Depends(get_db)):
    """获取该 session 所有被选中的反思问题"""
    qs = (
        db.query(ReflectionQuestion)
        .filter(
            ReflectionQuestion.session_id == session_id,
            ReflectionQuestion.is_selected == 1,
        )
        .order_by(ReflectionQuestion.sort_order)
        .all()
    )
    return [_serialize(q) for q in qs]


@router.put("/questions/{question_id}/answer")
def save_answer(
    question_id: int,
    req: ReflectionAnswerSave,
    db: DbSession = Depends(get_db),
):
    """保存学生对一个反思问题的回答，计算科研能力得分，生成 AI 反馈"""
    rq = db.query(ReflectionQuestion).filter(ReflectionQuestion.id == question_id).first()
    if not rq:
        raise HTTPException(status_code=404, detail="反思问题不存在")
    rq.student_answer = req.student_answer

    # 检测是否使用模板答案 → 直接用模板分数
    templates = json.loads(rq.template_answers) if rq.template_answers else []
    templ_score = None
    for t in templates:
        if t["text"] == req.student_answer:
            templ_score = t["score"]
            break
    if templ_score is not None:
        rq.reflection_score = templ_score
    else:
        # 启发式评分：基于长度和关键词
        ans = req.student_answer.strip()
        score = 1.0
        if len(ans) >= 30: score += 0.5
        if len(ans) >= 80: score += 0.5
        if len(ans) >= 200: score += 0.5
        if any(kw in ans for kw in ["因为", "所以", "原因", "导致"]): score += 0.5
        if any(kw in ans for kw in ["数据", "数字", "%", "ms", "节点", "路径", "准确率", "成功率"]): score += 0.5
        if any(kw in ans for kw in ["我认为", "我发现", "我理解", "我意识到"]): score += 0.5
        if any(kw in ans for kw in ["局限", "不足", "改进", "优化", "建议", "推广"]): score += 0.5
        rq.reflection_score = min(5.0, score)

    rq.ai_feedback = _generate_feedback(rq.question_text, req.student_answer)
    db.commit()
    db.refresh(rq)
    return _serialize(rq)


@router.put("/questions/{question_id}/feedback")
def regenerate_feedback(question_id: int, db: DbSession = Depends(get_db)):
    """重新生成 AI 启发式反馈"""
    rq = db.query(ReflectionQuestion).filter(ReflectionQuestion.id == question_id).first()
    if not rq:
        raise HTTPException(status_code=404, detail="反思问题不存在")
    rq.ai_feedback = _generate_feedback(rq.question_text, rq.student_answer or "")
    db.commit()
    db.refresh(rq)
    return _serialize(rq)


@router.post("/questions/regenerate")
def regenerate_questions(req: ReflectionQuestionCreate, db: DbSession = Depends(get_db)):
    """重新随机选题（覆盖旧题）"""
    return generate_questions(req, db)


def _generate_feedback(question: str, answer: str) -> str:
    """启发式 AI 反馈生成（模板方法，LLM 可用时替换）"""
    if not answer or len(answer.strip()) < 10:
        return ""

    length = len(answer)
    feedback_parts = []

    if length < 30:
        feedback_parts.append("你的回答比较简短，能不能再具体一点？比如引用实验中观察到的具体数字或现象。")

    if any(kw in answer for kw in ["因为", "所以", "原因", "导致", "如果"]):
        feedback_parts.append("很好，你给出了因果分析！" if length > 30 else "")
    else:
        feedback_parts.append('试着解释一下「为什么」——这样你的思考会更有深度。')

    if any(kw in answer for kw in ["数据", "实验", "结果", "图表", "成功率", "节点", "路径"]):
        feedback_parts.append("你引用了实验中的具体内容来支撑你的反思，这样做很好！")
    else:
        feedback_parts.append("可以尝试结合实验中观察到的具体数据或图表来支撑你的观点。")

    # 根据问题类别定制
    if "局限" in question or "不足" in question or "推广" in question:
        feedback_parts.append("想一想：你的结论在迷宫更大的时候是否仍然成立？")
    if "改进" in question or "重新" in question or "改变" in question:
        feedback_parts.append("如果让你实际做下一轮实验，你第一步会做什么？")

    filtered = [p for p in feedback_parts if p.strip()]
    return "。".join(filtered[:3]) + "。" if filtered else "继续深入思考，你会做得更好！"


def _gen_templates(question: str) -> list[dict]:
    """为反思问题生成 3 个模板回答（分值 2/3.5/5），对应初步/较好/优秀水平。"""
    templates = {
        "hypothesis": [
            {"text": "实验结果基本支持我的假设。", "score": 2.0, "level": "初步"},
            {"text": "实验数据支持了我的假设。例如 [某算法] 的 [指标] 达到了 [数值]，比 [对比算法] 的 [数值] 高了 [比例]。", "score": 3.5, "level": "较好"},
            {"text": "实验结果部分支持了我的假设。具体来说，[算法A] 在 [条件X] 下确实优于 [算法B]（数据：[中引用的具体数值]），但在 [条件Y] 下情况相反。这可能是因为 [自己的推测原因]。所以我的假设需要修正为：[修正后的表述]。", "score": 5.0, "level": "优秀"},
        ],
        "data": [
            {"text": "数据看起来还行，[某算法] 比其他的好一些。", "score": 2.0, "level": "初步"},
            {"text": "最让我意外的是 [某算法] 的 [指标] 数据。在 [某条件] 下它的 [指标] 是 [数值]，而 [对比算法] 是 [数值]。", "score": 3.5, "level": "较好"},
            {"text": "从数据中我发现了一个反直觉的现象：[描述现象，引用具体数据]。最初我以为 [原以为的原因]，但深入分析后发现 [真正可能的原因]。这让我重新思考了 [涉及的核心概念]。", "score": 5.0, "level": "优秀"},
        ],
        "method": [
            {"text": "实验设计基本合理，我控制了一些变量。", "score": 2.0, "level": "初步"},
            {"text": "我设置了 [自变量] 作为变化因素，控制了 [控制变量]。但回想起来，[某个未控制的变量] 可能也影响了结果，因为它 [原因]。", "score": 3.5, "level": "较好"},
            {"text": "我的实验设计采用了 [实验设计类型]。自变量是 [具体列举]，控制变量包括 [列举]。但我注意到一个潜在的混淆因素：[具体说明]。如果改进设计，我会 [具体改进方案]，这样可以更精确地分离出 [目标变量] 的影响。", "score": 5.0, "level": "优秀"},
        ],
        "limitation": [
            {"text": "实验有一些局限，比如数据可能不够多。", "score": 2.0, "level": "初步"},
            {"text": "这个实验最大的局限在于 [具体的局限性]。比如我只测试了 [具体范围]，不能直接推广到 [更大/不同] 的情况。另外 [另一个局限]。", "score": 3.5, "level": "较好"},
            {"text": "实验有几个重要的局限性：1) [局限性一：如样本量/参数范围]；2) [局限性二：如实验环境的简化]；3) [局限性三：如指标选择的片面性]。这些意味着我的结论主要适用于 [适用范围]，而不能推广到 [不适用场景]。未来可以通过 [改进方向] 来弥补这些不足。", "score": 5.0, "level": "优秀"},
        ],
        "improvement": [
            {"text": "下次可以做更多实验，换不同的参数试试。", "score": 2.0, "level": "初步"},
            {"text": "如果重做实验，我会 [改什么]，因为从数据中发现 [问题/现象]。另外我还想试试 [新算法/新参数]，看看 [新的研究方向]。", "score": 3.5, "level": "较好"},
            {"text": "基于这次实验的发现，我计划从两个方向改进：1) 实验层面：[具体改进措施+理由]；2) 研究方向层面：[提出的新研究问题]。这个新问题的价值在于 [说明为什么值得研究]。如果让我给新同学建议，我会说：[具体的建议]。", "score": 5.0, "level": "优秀"},
        ],
        "general": [
            {"text": "通过这次实验我学到了一些东西。", "score": 2.0, "level": "初步"},
            {"text": "我对 [某个概念/算法] 有了更深的理解。实验中 [引用的发现] 让我意识到 [学到的道理]。", "score": 3.5, "level": "较好"},
            {"text": "这次实验让我从 [原以为的] 转变为 [现在理解的]。对我来说最重要的发现是 [核心发现]，它改变了我对 [核心概念] 的看法。我意识到科学的本质是 [个人的科学认知提升]。", "score": 5.0, "level": "优秀"},
        ],
    }
    cat = "general"
    for kw, c in [("假设", "hypothesis"), ("数据", "data"), ("方法", "method"),
                   ("局限", "limitation"), ("改进", "improvement"), ("改变", "improvement"),
                   ("重新", "improvement"), ("推广", "limitation"), ("不足", "limitation")]:
        if kw in question:
            cat = c; break
    return templates.get(cat, templates["general"])


def _serialize(q: ReflectionQuestion) -> dict:
    return {
        "id": q.id,
        "session_id": q.session_id,
        "question_text": q.question_text,
        "category": q.category,
        "category_label": CATEGORY_LABELS.get(q.category, q.category),
        "sort_order": q.sort_order,
        "is_selected": bool(q.is_selected),
        "student_answer": q.student_answer or "",
        "ai_feedback": q.ai_feedback or "",
        "template_answers": json.loads(q.template_answers) if q.template_answers else [],
        "reflection_score": q.reflection_score or 0,
        "created_at": str(q.created_at) if q.created_at else "",
    }
