"""图形识别实验 API"""
import json, uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, ShapeRecogRun
from app.core.shaperecog.runner import ShapeRecogRunner

router = APIRouter(prefix="/shaperecog", tags=["shaperecog"])
runner = ShapeRecogRunner()


class ShapeRecogRunRequest(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=lambda: ["TEMPLATE", "PIXEL_KNN", "FEATURE", "RANDOM"])
    settings: dict = Field(default_factory=dict)


@router.post("/run")
def run_shape_recog(req: ShapeRecogRunRequest, db: DbSession = Depends(get_db)):
    n_samples = max(30, min(req.settings.get("n_samples", 200), 1000))
    noise_levels = [max(0.0, min(n, 0.5)) for n in req.settings.get("noise_levels", [0.0])]
    num_trials = max(1, min(req.settings.get("num_trials", 5), 10))
    config = {
        "algorithms": req.algorithms, "n_samples": n_samples,
        "noise_levels": noise_levels, "num_trials": num_trials,
        "train_ratio": max(0.3, min(req.settings.get("train_ratio", 0.7), 0.9)),
        "seed": req.settings.get("seed", 42),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图形识别实验运行失败: {str(e)}")

    for r in result["runs"]:
        sr = ShapeRecogRun(
            session_id=req.session_id, batch_id=batch_id,
            algorithm=r["algorithm"], n_samples=r["n_samples"],
            noise_level=r["noise_level"], trial=r["trial"], seed=r["seed"],
            accuracy=r["accuracy"], correct=r["correct"], total=r["total"],
            runtime_ms=r["runtime_ms"], train_ratio=r["train_ratio"],
            test_grids_data=json.dumps(r["test_grids"]),
            test_labels_data=json.dumps(r["test_labels"]),
            predictions_data=json.dumps(r["predictions"]),
        )
        db.add(sr)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()

    return {"experiment_batch_id": batch_id, "status": result["status"], "summary": result["summary"], "total_runs": result["total_runs"], "runs": result["runs"]}


@router.get("/runs")
def list_runs(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(ShapeRecogRun)
    if session_id:
        q = q.filter(ShapeRecogRun.session_id == session_id)
    return [_run_to_dict(r) for r in q.order_by(ShapeRecogRun.id.desc()).all()]


def _run_to_dict(r) -> dict:
    return {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "algorithm": r.algorithm, "n_samples": r.n_samples,
        "noise_level": r.noise_level, "trial": r.trial, "seed": r.seed,
        "accuracy": r.accuracy, "correct": r.correct, "total": r.total,
        "runtime_ms": r.runtime_ms, "train_ratio": r.train_ratio,
        "test_grids": json.loads(r.test_grids_data) if r.test_grids_data else [],
        "test_labels": json.loads(r.test_labels_data) if r.test_labels_data else [],
        "predictions": json.loads(r.predictions_data) if r.predictions_data else [],
    }
