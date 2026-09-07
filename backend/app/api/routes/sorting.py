"""排序算法实验 API"""
import json, uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, SortingRun
from app.core.sorting.runner import SortingRunner
from app.utils.pagination import paginate

router = APIRouter(prefix="/sorting", tags=["sorting"])
runner = SortingRunner()


class SortingRunRequest(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=lambda: ["BUBBLE", "SELECTION", "MERGE", "QUICK"])
    settings: dict = Field(default_factory=dict)


@router.post("/run")
def run_sorting(req: SortingRunRequest, db: DbSession = Depends(get_db)):
    sizes = [max(5, min(s, 100)) for s in req.settings.get("array_sizes", [20])]
    num_trials = max(1, min(req.settings.get("num_trials", 5), 10))
    config = {
        "algorithms": req.algorithms,
        "array_sizes": sizes,
        "num_trials": num_trials,
        "data_pattern": req.settings.get("data_pattern", "random"),
        "seed": req.settings.get("seed", 42),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"排序实验运行失败: {str(e)}")

    for r in result["runs"]:
        sr = SortingRun(
            session_id=req.session_id, batch_id=batch_id,
            algorithm=r["algorithm"], array_size=r["array_size"],
            pattern=r["pattern"], trial=r["trial"], seed=r["seed"],
            swaps=r["swaps"], comparisons=r["comparisons"],
            runtime_ms=r["runtime_ms"],
            original_data=json.dumps(r["original"]),
            result_data=json.dumps(r["result"]),
            steps_data=json.dumps(r["steps"]),
        )
        db.add(sr)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s: s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()

    return {
        "experiment_batch_id": batch_id, "status": result["status"],
        "summary": result["summary"], "total_runs": result["total_runs"],
        "runs": result["runs"],
    }


@router.get("/runs")
def list_sorting_runs(session_id: int | None = None, include_data: bool = False,
                      limit: int = 50, offset: int = 0, db: DbSession = Depends(get_db)):
    """列表接口分页 + 裁剪（P-性能）：默认不携带 original/result/steps 大字段
    （除非 include_data=true），limit/offset 分页（默认 50 条/页，上限 200）。"""
    q = db.query(SortingRun)
    if session_id:
        q = q.filter(SortingRun.session_id == session_id)
    return paginate(
        q.order_by(SortingRun.id.desc()), limit, offset,
        lambda r: _run_to_dict(r, include_data=include_data),
    )


def _run_to_dict(r, include_data: bool = False) -> dict:
    d = {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "algorithm": r.algorithm, "array_size": r.array_size,
        "pattern": r.pattern, "trial": r.trial, "seed": r.seed,
        "swaps": r.swaps, "comparisons": r.comparisons, "runtime_ms": r.runtime_ms,
        "created_at": str(r.created_at) if r.created_at else None,
    }
    if include_data:
        d["original"] = json.loads(r.original_data) if r.original_data else []
        d["result"] = json.loads(r.result_data) if r.result_data else []
        d["steps"] = json.loads(r.steps_data) if r.steps_data else []
    return d
