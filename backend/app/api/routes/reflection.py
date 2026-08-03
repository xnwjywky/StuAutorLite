"""反思问题路由 — 题库生成 + 选择 + 回答 + AI 反馈"""

import json
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, ReflectionQuestion, Session as SessionModel
from app.models.schemas import ReflectionQuestionCreate, ReflectionAnswerSave
from app.api.routes.reflection_content import EXPERIMENT_CONFIGS, COMMON_QUESTIONS, COMMON_TEMPLATES

router = APIRouter(prefix="/reflection", tags=["reflection"])

DEFAULT_TASK_ID = "maze_pathfinding"
COMMON_CATEGORY = "common"
# 实验独有问题：这 4 类各抽 1 题（覆盖效率/成功率/局限/优化等），通用问题放最后
UNIQUE_CATEGORIES = ["hypothesis", "data", "limitation", "improvement"]

CATEGORY_LABELS = {
    "hypothesis": "假设与验证",
    "data":       "数据分析",
    "method":     "实验方法",
    "limitation": "实验局限",
    "improvement": "改进方向",
    "general":    "通用",
    "common":     "通用思考",
}


def _config_for_session(db: DbSession, session_id: int, task_id: str | None = None) -> tuple[dict, str | None, str]:
    """取该实验的反思配置（题库+模板）。
    返回 (config, mode, storage_key)：
    - task_id 可为 "task_id" 或 "task_id:mode"（子实验，如 visual_algo_compare:sorting）
    - storage_key 为存入 DB 的完整标识（含子模式），用于区分同一实验下的不同子实验
    优先使用显式传入的 task_id（前端 demo 会话没有真实 session，DB 查不到），否则查 session 表。"""
    if not task_id:
        s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if s and s.task_id:
            task_id = s.task_id
    task_id = task_id or DEFAULT_TASK_ID
    base, _, mode = task_id.partition(":")
    config = EXPERIMENT_CONFIGS.get(base) or EXPERIMENT_CONFIGS[DEFAULT_TASK_ID]
    return config, (mode or None), task_id


def _resolve_pools(config: dict, mode: str | None) -> tuple[dict, dict]:
    """取该模式下的问题/模板池；无子模式或子模式无专属内容时用基础池。"""
    if mode and mode in config.get("modes", {}):
        m = config["modes"][mode]
        return m.get("questions") or config["questions"], m.get("templates") or config["templates"]
    return config["questions"], config["templates"]


@router.post("/generate")
def generate_questions(req: ReflectionQuestionCreate, db: DbSession = Depends(get_db)):
    """生成反思问题：4 道实验独有 + 1 道通用（放最后），写入 DB。
    问题与模板回答按实验定制（task_id 显式传入优先，可带 :mode 区分子实验）。"""
    config, mode, storage_key = _config_for_session(db, req.session_id, getattr(req, "task_id", None))
    questions_pool, templates = _resolve_pools(config, mode)

    # 只清理本实验（同 storage_key）的旧题，避免误删同一 demo 会话下其他实验的问题
    db.query(ReflectionQuestion).filter(
        ReflectionQuestion.session_id == req.session_id,
        or_(
            ReflectionQuestion.task_id == storage_key,
            ReflectionQuestion.task_id == "",
            ReflectionQuestion.task_id.is_(None),
        ),
    ).delete(synchronize_session=False)

    rng = random.Random(req.session_id)
    to_write: list[tuple[str, str, list]] = []

    # 1) 实验独有问题：4 类各抽 1 题
    for cat in UNIQUE_CATEGORIES:
        pool = questions_pool.get(cat) or []
        if not pool:
            continue
        q = rng.sample(pool, min(1, len(pool)))[0]
        to_write.append((cat, q, templates.get(cat, [])))

    # 2) 通用问题：1 题放最后（不要太多）
    common_pool = COMMON_QUESTIONS.get(COMMON_CATEGORY, [])
    if common_pool:
        q = rng.sample(common_pool, min(1, len(common_pool)))[0]
        to_write.append((COMMON_CATEGORY, q, COMMON_TEMPLATES.get(COMMON_CATEGORY, [])))

    created: list[ReflectionQuestion] = []
    for order, (cat, q, tpls) in enumerate(to_write):
        rq = ReflectionQuestion(
            session_id=req.session_id,
            task_id=storage_key,
            question_text=q,
            category=cat,
            sort_order=order,
            is_selected=1,
            template_answers=json.dumps(tpls, ensure_ascii=False),
        )
        db.add(rq)
        created.append(rq)

    db.commit()
    return {"questions": [_serialize(q) for q in created], "total": len(created)}


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
        cfg, mode, _storage = _config_for_session(db, rq.session_id, rq.task_id)
        _questions, templates = _resolve_pools(cfg, mode)
        tpls = COMMON_TEMPLATES.get(rq.category, []) if rq.category == COMMON_CATEGORY else templates.get(rq.category, [])
        rq.template_answers = json.dumps(tpls, ensure_ascii=False)
    db.commit()
    return {"questions": [_serialize(q) for q in qs]}


@router.get("/questions")
def get_questions(session_id: int, task_id: str | None = None, db: DbSession = Depends(get_db)):
    """获取该 session 中属于指定实验的反思问题。
    多个实验共享同一 demo 会话（session_id 相同），必须按 task_id 区分，
    否则会读到其他实验生成的问题。"""
    q = db.query(ReflectionQuestion).filter(
        ReflectionQuestion.session_id == session_id,
        ReflectionQuestion.is_selected == 1,
    )
    if task_id:
        q = q.filter(ReflectionQuestion.task_id == task_id)
    qs = q.order_by(ReflectionQuestion.sort_order).all()
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


def _serialize(q: ReflectionQuestion) -> dict:
    return {
        "id": q.id,
        "session_id": q.session_id,
        "task_id": q.task_id or "",
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
