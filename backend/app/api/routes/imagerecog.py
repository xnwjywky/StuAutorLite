"""统一图像识别实验 API — POST /api/imagerecog/run, /run-stream, GET /api/imagerecog/runs"""
import json, uuid, asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, ImageRecogRun
from app.core.imagerecog.runner import ImageRecogRunner

router = APIRouter(prefix="/imagerecog", tags=["imagerecog"])
runner = ImageRecogRunner()


class ImageRecogRunRequest(BaseModel):
    session_id: int
    experiment_type: str = "shape"  # "shape" | "digits"
    algorithms: list[str] = Field(default_factory=lambda: ["TEMPLATE", "PIXEL_KNN", "DECISION_TREE", "MLP", "CNN", "RANDOM"])
    algo_params: dict = Field(default_factory=dict)  # {MLP: {hidden: 64, epochs: 30}, ...}
    settings: dict = Field(default_factory=dict)  # {n_samples, noise_levels, num_trials, ...}


@router.post("/run")
def run_imagerecog(req: ImageRecogRunRequest, db: DbSession = Depends(get_db)):
    exp_type = req.experiment_type if req.experiment_type in ("shape", "digits") else "shape"
    n_samples = max(30, min(req.settings.get("n_samples", 200), 1000))
    noise_levels = [max(0.0, min(n, 0.5)) for n in req.settings.get("noise_levels", [0.0])]
    num_trials = max(1, min(req.settings.get("num_trials", 5), 10))
    config = {
        "experiment_type": exp_type,
        "algorithms": req.algorithms,
        "algo_params": req.algo_params,
        "n_samples": n_samples,
        "noise_levels": noise_levels,
        "num_trials": num_trials,
        "train_ratio": max(0.3, min(req.settings.get("train_ratio", 0.7), 0.9)),
        "seed": req.settings.get("seed", 42),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图像识别实验运行失败: {str(e)}")

    for r in result["runs"]:
        run = ImageRecogRun(
            session_id=req.session_id,
            batch_id=batch_id,
            experiment_type=exp_type,
            algorithm=r["algorithm"],
            n_samples=r["n_samples"],
            noise_level=r["noise_level"],
            trial=r["trial"],
            seed=r["seed"],
            accuracy=r["accuracy"],
            correct=r["correct"],
            total=r["total"],
            runtime_ms=r["runtime_ms"],
            train_ratio=r["train_ratio"],
            params_used=json.dumps(r.get("params_used", {})),
            test_grids_data=json.dumps(r["test_grids"]),
            test_labels_data=json.dumps(r["test_labels"]),
            predictions_data=json.dumps(r["predictions"]),
            viz_steps_data=json.dumps(r.get("viz_steps", [])),
        )
        db.add(run)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()

    return {
        "experiment_batch_id": batch_id,
        "experiment_type": exp_type,
        "status": result["status"],
        "summary": result["summary"],
        "total_runs": result["total_runs"],
        "runs": result["runs"],
    }


@router.post("/run-stream")
async def run_imagerecog_stream(req: ImageRecogRunRequest):
    """SSE 流式端点 — 实时推送实验进度（含像素网格预览）"""
    exp_type = req.experiment_type if req.experiment_type in ("shape", "digits") else "shape"
    n_samples = max(30, min(req.settings.get("n_samples", 200), 1000))
    noise_levels = [max(0.0, min(n, 0.5)) for n in req.settings.get("noise_levels", [0.0])]
    num_trials = max(1, min(req.settings.get("num_trials", 5), 10))
    config = {
        "experiment_type": exp_type,
        "algorithms": req.algorithms,
        "algo_params": req.algo_params,
        "n_samples": n_samples,
        "noise_levels": noise_levels,
        "num_trials": num_trials,
        "train_ratio": max(0.3, min(req.settings.get("train_ratio", 0.7), 0.9)),
        "seed": req.settings.get("seed", 42),
    }

    async def event_stream():
        loop = asyncio.get_event_loop()
        gen = runner.run_stream(config)
        try:
            while True:
                event = await loop.run_in_executor(None, next, gen)
                # event 中的 grid 数据可能很大，序列化为 JSON
                payload = json.dumps(event, ensure_ascii=False, default=str)
                yield f"data: {payload}\n\n"
                if event["type"] == "done":
                    break
        except StopIteration:
            pass
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/runs")
def list_runs(session_id: int | None = None, experiment_type: str | None = None,
              db: DbSession = Depends(get_db)):
    q = db.query(ImageRecogRun)
    if session_id:
        q = q.filter(ImageRecogRun.session_id == session_id)
    if experiment_type:
        q = q.filter(ImageRecogRun.experiment_type == experiment_type)
    return [_run_to_dict(r) for r in q.order_by(ImageRecogRun.id.desc()).all()]


def _run_to_dict(r) -> dict:
    return {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "experiment_type": r.experiment_type,
        "algorithm": r.algorithm, "n_samples": r.n_samples,
        "noise_level": r.noise_level, "trial": r.trial, "seed": r.seed,
        "accuracy": r.accuracy, "correct": r.correct, "total": r.total,
        "runtime_ms": r.runtime_ms, "train_ratio": r.train_ratio,
        "params_used": json.loads(r.params_used) if r.params_used else {},
        "test_grids": json.loads(r.test_grids_data) if r.test_grids_data else [],
        "test_labels": json.loads(r.test_labels_data) if r.test_labels_data else [],
        "predictions": json.loads(r.predictions_data) if r.predictions_data else [],
        "viz_steps": json.loads(r.viz_steps_data) if r.viz_steps_data else [],
    }
