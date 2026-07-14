"""研究会话 CRUD — 设计文档 §11.1"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.models.database import get_db, Session as SessionModel
from app.models.schemas import SessionCreate, SessionResponse
from app.services.workflow import STAGES

router = APIRouter(prefix="/research/sessions", tags=["sessions"])


@router.get("/")
def list_sessions(db: DbSession = Depends(get_db)):
    return db.query(SessionModel).order_by(SessionModel.updated_at.desc()).all()


@router.post("/", response_model=SessionResponse)
def create_session(req: SessionCreate, db: DbSession = Depends(get_db)):
    session = SessionModel(
        student_id=req.student_id,
        task_id=req.task_id,
        title=req.title or _default_title(req.task_id),
        current_stage="TASK_SELECTED",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}")
def get_session(session_id: int, db: DbSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize_session(s)


@router.get("/{session_id}/stages")
def get_stages(session_id: int, db: DbSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    from app.services.workflow import STAGE_LABELS
    return {
        "current_stage": s.current_stage,
        "stages": [{"key": k, "label": STAGE_LABELS.get(k, k)} for k in STAGES],
    }


@router.put("/{session_id}/stage")
def update_stage(session_id: int, stage: str, db: DbSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if stage not in STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {stage}")
    s.current_stage = stage
    if stage == "REVIEW_COMPLETED":
        s.status = "COMPLETED"
    db.commit()
    return {"current_stage": s.current_stage}


@router.delete("/{session_id}")
def delete_session(session_id: int, db: DbSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(s)
    db.commit()
    return {"deleted": session_id}


# ── helpers ──────────────────────────────────────────────
def _default_title(task_id: str) -> str:
    return {"maze_pathfinding": "迷宫寻路算法比较研究"}.get(task_id, "新研究")

def _serialize_session(s: SessionModel) -> dict:
    return {
        "id": s.id,
        "student_id": s.student_id,
        "task_id": s.task_id,
        "title": s.title,
        "status": s.status,
        "current_stage": s.current_stage,
        "created_at": str(s.created_at),
        "updated_at": str(s.updated_at),
    }
