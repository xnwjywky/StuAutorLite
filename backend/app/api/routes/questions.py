"""研究问题路由 — 设计文档 §11.2-11.3"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, Question, Session as SessionModel
from app.models.schemas import QuestionCreate, QuestionSuggestRequest, QuestionResponse
from app.agents.research_mentor import ResearchMentor

router = APIRouter(prefix="/research/questions", tags=["questions"])
mentor = ResearchMentor()


@router.post("/suggest")
def suggest_questions(req: QuestionSuggestRequest):
    result = mentor.respond({
        "task": req.task_id,
        "student_interest": req.student_interest,
        "grade_level": "beginner",
    })
    return result


@router.post("/")
def create_question(req: QuestionCreate, db: DbSession = Depends(get_db)):
    q = Question(
        session_id=req.session_id,
        raw_question=req.raw_question,
        refined_question=req.refined_question,
        independent_variable=req.independent_variable,
        dependent_variables=json.dumps(req.dependent_variables),
        controlled_variables=json.dumps(req.controlled_variables),
    )
    db.add(q)
    # 更新会话 stage
    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "QUESTION_DEFINED"
    db.commit()
    db.refresh(q)
    return _serialize_question(q)


@router.get("/")
def list_questions(session_id: int | None = None, db: DbSession = Depends(get_db)):
    qs = db.query(Question)
    if session_id:
        qs = qs.filter(Question.session_id == session_id)
    return [_serialize_question(q) for q in qs.all()]


def _serialize_question(q: Question) -> dict:
    return {
        "id": q.id,
        "session_id": q.session_id,
        "raw_question": q.raw_question,
        "refined_question": q.refined_question,
        "independent_variable": q.independent_variable,
        "dependent_variables": json.loads(q.dependent_variables) if q.dependent_variables else [],
        "controlled_variables": json.loads(q.controlled_variables) if q.controlled_variables else [],
        "created_at": str(q.created_at),
    }
