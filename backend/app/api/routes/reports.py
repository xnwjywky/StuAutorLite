"""报告生成与审稿 — 设计文档 §11.7-11.8"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from app.models.database import (
    get_db, ResearchReport, Session as SessionModel,
    Question, Hypothesis, ExperimentDesign, ExperimentRun, AnalysisRecord,
)
from app.models.schemas import ReportGenerateRequest, ReviewRequest
from app.services.report_generator import ReportGenerator
from app.agents.reviewer import Reviewer

router = APIRouter(prefix="/reports", tags=["reports"])
generator = ReportGenerator()
reviewer = Reviewer()


@router.post("/generate")
def generate_report(req: ReportGenerateRequest, db: DbSession = Depends(get_db)):
    # 收集会话数据
    session_data = _collect_session_data(req.session_id, db)

    markdown = generator.generate(session_data)

    report = ResearchReport(
        session_id=req.session_id,
        title=session_data.get("title", ""),
        content_markdown=markdown,
        version=1,
    )
    db.add(report)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "REPORT_GENERATED"
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "session_id": report.session_id,
        "title": report.title,
        "content_markdown": report.content_markdown,
        "version": report.version,
        "created_at": str(report.created_at),
    }


@router.post("/review")
def review_report(req: ReviewRequest, db: DbSession = Depends(get_db)):
    # 获取最新报告
    report = (
        db.query(ResearchReport)
        .filter(ResearchReport.session_id == req.session_id)
        .order_by(ResearchReport.id.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No report found. Generate one first.")

    # 检查报告内容质量
    has_hypothesis = db.query(Hypothesis).filter(Hypothesis.session_id == req.session_id).first() is not None
    has_data = db.query(ExperimentRun).filter(ExperimentRun.session_id == req.session_id).first() is not None
    has_reflection = bool(report.content_markdown and "反思" in report.content_markdown)

    result = reviewer.respond({
        "report": report.content_markdown,
        "has_hypothesis": has_hypothesis,
        "has_data": has_data,
        "has_reflection": has_reflection,
    })

    # 保存评分
    scores = result.get("scores", {})
    report.question_clarity = scores.get("question_clarity", 0)
    report.experiment_design = scores.get("experiment_design", 0)
    report.data_completeness = scores.get("data_completeness", 0)
    report.analysis_depth = scores.get("analysis_depth", 0)
    report.reflection_quality = scores.get("reflection_quality", 0)
    report.writing_clarity = scores.get("writing_clarity", 0)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "REVIEW_COMPLETED"
    db.commit()

    return result


@router.get("/")
def list_reports(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(ResearchReport)
    if session_id:
        q = q.filter(ResearchReport.session_id == session_id)
    return [_report_to_dict(r) for r in q.all()]


@router.get("/{report_id}")
def get_report(report_id: int, db: DbSession = Depends(get_db)):
    r = db.query(ResearchReport).filter(ResearchReport.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_to_dict(r)


# ── helpers ──────────────────────────────────────────────
def _collect_session_data(session_id: int, db: DbSession) -> dict:
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    q = db.query(Question).filter(Question.session_id == session_id).first()
    h = db.query(Hypothesis).filter(Hypothesis.session_id == session_id).first()
    d = db.query(ExperimentDesign).filter(ExperimentDesign.session_id == session_id).first()
    runs = db.query(ExperimentRun).filter(ExperimentRun.session_id == session_id).all()
    a = db.query(AnalysisRecord).filter(AnalysisRecord.session_id == session_id).first()

    # 汇总实验数据
    summary: dict[str, list] = {}
    for r in runs:
        summary.setdefault(r.algorithm, []).append({
            "success": bool(r.success),
            "path_length": r.path_length,
            "expanded_nodes": r.expanded_nodes,
            "runtime_ms": r.runtime_ms,
        })
    from app.core.metrics import compute_summary_by_algorithm
    summary_data = compute_summary_by_algorithm(
        [{**d, "algorithm": algo} for algo, items in summary.items() for d in items]
    ) if runs else {}

    return {
        "title": s.title if s else "",
        "raw_question": q.raw_question if q else "",
        "refined_question": q.refined_question if q else "",
        "hypothesis": h.student_text if h else "",
        "algorithms": json.loads(d.algorithms) if d and d.algorithms else [],
        "independent_variable": d.independent_variable if d else "",
        "controlled_settings": json.loads(d.controlled_settings) if d and d.controlled_settings else {},
        "metrics": json.loads(d.metrics) if d and d.metrics else [],
        "summary": summary_data,
        "student_analysis": a.student_analysis if a else "",
        "reflection": "",
        "conclusion": "",
    }


def _report_to_dict(r: ResearchReport) -> dict:
    return {
        "id": r.id,
        "session_id": r.session_id,
        "title": r.title,
        "content_markdown": r.content_markdown,
        "version": r.version,
        "review_score": {
            "question_clarity": r.question_clarity,
            "experiment_design": r.experiment_design,
            "data_completeness": r.data_completeness,
            "analysis_depth": r.analysis_depth,
            "reflection_quality": r.reflection_quality,
            "writing_clarity": r.writing_clarity,
        },
        "created_at": str(r.created_at),
    }
