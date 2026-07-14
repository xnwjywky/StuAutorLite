"""结果分析路由 — 设计文档 §11.6"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, AnalysisRecord, ExperimentRun, Session as SessionModel, Hypothesis
from app.models.schemas import AnalysisCreate, AnalysisAnalyzeRequest
from app.agents.data_analyst import DataAnalyst

router = APIRouter(prefix="/analysis", tags=["analysis"])
analyst = DataAnalyst()


@router.post("/analyze")
def analyze_results(req: AnalysisAnalyzeRequest, db: DbSession = Depends(get_db)):
    # 读取实验数据
    runs = db.query(ExperimentRun).filter(
        ExperimentRun.session_id == req.session_id
    ).all()

    if not runs:
        return {"summary": "尚未运行实验，请先运行实验。", "key_findings": [], "questions_for_student": []}

    # 按算法汇总
    summary: dict[str, list[dict]] = {}
    for r in runs:
        summary.setdefault(r.algorithm, []).append({
            "success": bool(r.success),
            "path_length": r.path_length,
            "expanded_nodes": r.expanded_nodes,
            "runtime_ms": r.runtime_ms,
        })

    from app.core.metrics import compute_summary_by_algorithm
    summary_data = compute_summary_by_algorithm([
        {**d, "algorithm": algo}
        for algo, items in summary.items()
        for d in items
    ])

    # 分析
    result = analyst.respond({
        "summary": summary_data,
        "student_hypothesis": req.student_hypothesis,
    })
    return result


@router.post("/")
def save_analysis(req: AnalysisCreate, db: DbSession = Depends(get_db)):
    a = AnalysisRecord(
        session_id=req.session_id,
        student_analysis=req.student_analysis,
    )
    db.add(a)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "RESULT_ANALYZED"
    db.commit()
    db.refresh(a)
    return _serialize_analysis(a)


@router.get("/")
def list_analyses(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(AnalysisRecord)
    if session_id:
        q = q.filter(AnalysisRecord.session_id == session_id)
    return [_serialize_analysis(a) for a in q.all()]


def _serialize_analysis(a: AnalysisRecord) -> dict:
    return {
        "id": a.id,
        "session_id": a.session_id,
        "student_analysis": a.student_analysis,
        "ai_feedback": a.ai_feedback,
        "key_findings": json.loads(a.key_findings) if a.key_findings else [],
        "created_at": str(a.created_at),
    }
