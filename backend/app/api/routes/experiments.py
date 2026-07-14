"""实验配置与运行 — 设计文档 §11.4-11.5"""

import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, ExperimentDesign, ExperimentRun, Session as SessionModel
from app.models.schemas import ExperimentDesignCreate, ExperimentRunRequest
from app.core.experiment_runner import ExperimentRunner
from app.agents.experiment_designer import ExperimentDesigner

router = APIRouter(prefix="/experiments", tags=["experiments"])
runner = ExperimentRunner()
designer = ExperimentDesigner()


# ── 实验设计 ─────────────────────────────────────────────
@router.post("/design")
def save_design(req: ExperimentDesignCreate, db: DbSession = Depends(get_db)):
    d = ExperimentDesign(
        session_id=req.session_id,
        algorithms=json.dumps(req.algorithms),
        independent_variable=req.independent_variable,
        variable_values=json.dumps(req.variable_values),
        controlled_settings=json.dumps(req.controlled_settings),
        metrics=json.dumps(req.metrics),
    )
    # AI 检查
    review = designer.respond({"design": req.model_dump()})
    d.ai_score = review.get("score", 0)
    d.ai_comment = review.get("feedback", "")

    db.add(d)

    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "EXPERIMENT_DESIGNED"
    db.commit()
    db.refresh(d)
    return {**_design_to_dict(d), "ai_review": review}


@router.post("/design/review")
def review_design(req: ExperimentDesignCreate):
    return designer.respond({"design": req.model_dump()})


# ── 运行实验 ─────────────────────────────────────────────
@router.post("/run")
def run_experiment(req: ExperimentRunRequest, db: DbSession = Depends(get_db)):
    # 输入界限保护，防止资源滥用
    mw, mh = req.settings.get("maze_size", [12, 12])
    mw = max(4, min(mw, 50)); mh = max(4, min(mh, 50))
    num_trials = max(1, min(req.settings.get("num_trials", 5), 20))
    obstacle_ratios = [max(0.0, min(r, 0.6)) for r in req.settings.get("obstacle_ratios", [0.2])]
    config = {
        "maze_size": [mw, mh],
        "obstacle_ratios": obstacle_ratios,
        "algorithms": req.algorithms,
        "num_trials": num_trials,
        "same_seed_for_algorithms": req.settings.get("same_seed_for_algorithms", True),
        "seed": req.settings.get("seed", 42),
        "custom_mazes": req.settings.get("custom_mazes", {}),
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"实验运行失败: {str(e)}")

    # 持久化每个 run
    for r in result["runs"]:
        er = ExperimentRun(
            session_id=req.session_id,
            batch_id=batch_id,
            algorithm=r["algorithm"],
            obstacle_ratio=r["obstacle_ratio"],
            maze_size=str(r["maze_size"]),
            trial=r["trial"],
            seed=r["seed"],
            success=1 if r["success"] else 0,
            path_length=r["path_length"],
            expanded_nodes=r["expanded_nodes"],
            runtime_ms=r["runtime_ms"],
            path_data=json.dumps(r.get("path", [])),
            visited_data=json.dumps(r.get("visited_nodes", [])),
            maze_data=json.dumps(r.get("maze_grid", [])),
        )
        db.add(er)

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
def list_runs(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(ExperimentRun)
    if session_id:
        q = q.filter(ExperimentRun.session_id == session_id)
    return [_run_to_dict(r) for r in q.order_by(ExperimentRun.id.desc()).all()]


# ── helpers ──────────────────────────────────────────────
def _design_to_dict(d: ExperimentDesign) -> dict:
    return {
        "id": d.id,
        "session_id": d.session_id,
        "algorithms": json.loads(d.algorithms) if d.algorithms else [],
        "independent_variable": d.independent_variable,
        "variable_values": json.loads(d.variable_values) if d.variable_values else [],
        "controlled_settings": json.loads(d.controlled_settings) if d.controlled_settings else {},
        "metrics": json.loads(d.metrics) if d.metrics else [],
        "ai_score": d.ai_score,
        "ai_comment": d.ai_comment,
    }


def _run_to_dict(r: ExperimentRun) -> dict:
    return {
        "id": r.id,
        "session_id": r.session_id,
        "batch_id": r.batch_id,
        "algorithm": r.algorithm,
        "obstacle_ratio": r.obstacle_ratio,
        "trial": r.trial,
        "success": bool(r.success),
        "path_length": r.path_length,
        "expanded_nodes": r.expanded_nodes,
        "runtime_ms": r.runtime_ms,
        "path": json.loads(r.path_data) if r.path_data else [],
        "visited_nodes": json.loads(r.visited_data) if r.visited_data else [],
        "maze_grid": json.loads(r.maze_data) if r.maze_data else [],
    }
