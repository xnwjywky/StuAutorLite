"""猜数字实验 API"""
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, GuessRun
from app.core.guessnumber.runner import GuessNumberRunner

router = APIRouter(prefix="/guessnumber", tags=["guessnumber"])
runner = GuessNumberRunner()


class GuessRunRequest(BaseModel):
    session_id: int
    strategies: list[str] = Field(default_factory=lambda: ["BINARY", "RANDOM", "LINEAR"])
    settings: dict = Field(default_factory=dict)


@router.post("/run")
def run_guess_experiment(req: GuessRunRequest, db: DbSession = Depends(get_db)):
    num_trials = max(1, min(req.settings.get("num_trials", 5), 20))
    lo, hi = req.settings.get("number_range", [1, 100])
    lo = max(1, min(lo, 1000))
    hi = max(lo + 1, min(hi, 10000))

    config = {
        "strategies": req.strategies,
        "number_range": [lo, hi],
        "num_trials": num_trials,
        "seed": req.settings.get("seed", 42),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"猜数字实验运行失败: {str(e)}")

    for r in result["runs"]:
        gr = GuessRun(
            session_id=req.session_id, batch_id=batch_id,
            strategy=r["strategy"], number_low=lo, number_high=hi,
            target=r["target"], trial=r["trial"], seed=r["seed"],
            guesses=r["guesses"], history_data=json.dumps(r["history"]),
            success=1 if r["success"] else 0, runtime_ms=r["runtime_ms"],
        )
        db.add(gr)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()

    return {
        "experiment_batch_id": batch_id,
        "status": result["status"],
        "summary": result["summary"],
        "total_runs": result["total_runs"],
        "runs": result["runs"],
    }


@router.get("/runs")
def list_guess_runs(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(GuessRun)
    if session_id:
        q = q.filter(GuessRun.session_id == session_id)
    return [_run_to_dict(r) for r in q.order_by(GuessRun.id.desc()).all()]


def _run_to_dict(r) -> dict:
    return {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "strategy": r.strategy, "target": r.target,
        "trial": r.trial, "guesses": r.guesses,
        "history": json.loads(r.history_data) if r.history_data else [],
        "success": bool(r.success), "runtime_ms": r.runtime_ms,
    }
