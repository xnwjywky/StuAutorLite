"""字符串搜索实验 API"""
import json, uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, StringSearchRun
from app.core.stringsearch.runner import StringSearchRunner

router = APIRouter(prefix="/stringsearch", tags=["stringsearch"])
runner = StringSearchRunner()


class StringSearchRunRequest(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=lambda: ["NAIVE", "KMP", "BOYER_MOORE", "RABIN_KARP"])
    settings: dict = Field(default_factory=dict)


@router.post("/run")
def run_string_search(req: StringSearchRunRequest, db: DbSession = Depends(get_db)):
    text_len = max(10, min(req.settings.get("text_length", 500), 5000))
    pat_len = max(2, min(req.settings.get("pattern_length", 5), text_len // 2))
    config = {
        "algorithms": req.algorithms,
        "text_length": text_len, "pattern_length": pat_len,
        "num_trials": max(1, min(req.settings.get("num_trials", 5), 10)),
        "pattern_type": req.settings.get("pattern_type", "random"),
        "seed": req.settings.get("seed", 42),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"字符串搜索实验运行失败: {str(e)}")

    for r in result["runs"]:
        sr = StringSearchRun(
            session_id=req.session_id, batch_id=batch_id,
            algorithm=r["algorithm"], text_length=r["text_length"],
            pattern_length=r["pattern_length"], pattern_type=r["pattern_type"],
            trial=r["trial"], seed=r["seed"],
            matches=r["matches"], comparisons=r["comparisons"],
            runtime_ms=r["runtime_ms"],
            text_data=r["text"], pattern_data=r["pattern"],
            match_positions=json.dumps(r["match_positions"]),
            steps_data=json.dumps(r["steps"]),
        )
        db.add(sr)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s: s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()

    return {"experiment_batch_id": batch_id, "status": result["status"], "summary": result["summary"], "total_runs": result["total_runs"], "runs": result["runs"]}


@router.get("/runs")
def list_runs(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(StringSearchRun)
    if session_id: q = q.filter(StringSearchRun.session_id == session_id)
    return [_run_to_dict(r) for r in q.order_by(StringSearchRun.id.desc()).all()]


def _run_to_dict(r) -> dict:
    return {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "algorithm": r.algorithm, "text_length": r.text_length,
        "pattern_length": r.pattern_length, "pattern_type": r.pattern_type,
        "trial": r.trial, "seed": r.seed,
        "matches": r.matches, "comparisons": r.comparisons, "runtime_ms": r.runtime_ms,
        "text": r.text_data, "pattern": r.pattern_data,
        "match_positions": json.loads(r.match_positions) if r.match_positions else [],
        "steps": json.loads(r.steps_data) if r.steps_data else [],
    }
