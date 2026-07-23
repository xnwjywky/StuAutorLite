"""强化学习格子世界实验 API — 设计文档 §4.4"""
import json, uuid, logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, RLRun
from app.core.rl import RLRunner

router = APIRouter(prefix="/rl", tags=["rl"])
runner = RLRunner()

# RL 专用日志
_LOG_DIR = Path(__file__).resolve().parent.parent.parent.parent / "logs"
_rl_log = logging.getLogger("rl")
_rl_log.setLevel(logging.DEBUG)
if not _rl_log.handlers:
    _fh = logging.FileHandler(str(_LOG_DIR / "rl_errors.log"), encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    _rl_log.addHandler(_fh)


class RLRunRequest(BaseModel):
    session_id: int
    agents: list[str] = Field(default_factory=lambda: ["Q_LEARNING", "SARSA"])
    settings: dict = Field(default_factory=dict)


@router.post("/run")
def run_rl_experiment(req: RLRunRequest, db: DbSession = Depends(get_db)):
    """运行强化学习实验。"""
    _rl_log.info("RL run: session=%d agents=%s settings=%s", req.session_id, req.agents, req.settings)
    agents = req.agents
    settings = req.settings

    config = {
        "agents": agents,
        "grid_size": max(4, min(settings.get("grid_size", 8), 12)),
        "num_traps": max(0, min(settings.get("num_traps", 3), 8)),
        "num_episodes": max(100, min(settings.get("num_episodes", 2000), 5000)),
        "learning_rate": settings.get("learning_rate", 0.1),
        "discount": settings.get("discount", 0.9),
        "epsilon": settings.get("epsilon", 0.1),
        "num_trials": max(1, min(settings.get("num_trials", 3), 10)),
        "seed": settings.get("seed", 42),
    }

    batch_id = str(uuid.uuid4())[:8]
    session_id = req.session_id

    try:
        result = runner.run(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"RL 实验运行失败: {str(e)}")

    for r in result["runs"]:
        rl = RLRun(
            session_id=session_id, batch_id=batch_id,
            agent=r["agent"], grid_size=r["grid_size"],
            num_traps=r["num_traps"], num_episodes=r["num_episodes"],
            learning_rate=r["learning_rate"], discount=r["discount"],
            epsilon=r["epsilon"], trial=r["trial"], seed=r["seed"],
            train_rewards=json.dumps(r["train_rewards"]),
            train_success=json.dumps(r["train_success"]),
            avg_reward=r["avg_reward"], success_rate=r["success_rate"],
            test_success=1 if r["test_success"] else 0,
            test_reward=r["test_reward"],
            test_path=json.dumps(r["test_path"]),
            world_json=json.dumps(r["world"]),
            runtime_ms=r["runtime_ms"],
        )
        db.add(rl)

    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
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
def list_rl_runs(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(RLRun)
    if session_id:
        q = q.filter(RLRun.session_id == session_id)
    return [_run_to_dict(r) for r in q.order_by(RLRun.id.desc()).all()]


def _run_to_dict(r) -> dict:
    return {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "agent": r.agent, "grid_size": r.grid_size, "num_traps": r.num_traps,
        "num_episodes": r.num_episodes, "learning_rate": r.learning_rate,
        "discount": r.discount, "epsilon": r.epsilon,
        "trial": r.trial, "seed": r.seed,
        "train_rewards": json.loads(r.train_rewards) if r.train_rewards else [],
        "train_success": json.loads(r.train_success) if r.train_success else [],
        "avg_reward": r.avg_reward, "success_rate": r.success_rate,
        "test_success": bool(r.test_success), "test_reward": r.test_reward,
        "test_path": json.loads(r.test_path) if r.test_path else [],
        "world": json.loads(r.world_json) if r.world_json else {},
        "runtime_ms": r.runtime_ms,
        "created_at": str(r.created_at) if r.created_at else None,
    }
