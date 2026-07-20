"""MNIST 手写数字识别实验 API"""
import json, uuid, asyncio, logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, MNISTRun
from app.core.mnist.runner import MNISTRunner
from app.core.mnist.architectures import PRESET_ARCHITECTURES, get_architecture

router = APIRouter(prefix="/mnist", tags=["mnist"])
runner = MNISTRunner()

# ── 专用错误日志 ──
_LOG_DIR = Path(__file__).resolve().parent.parent.parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_mnist_log = logging.getLogger("mnist")
_mnist_log.setLevel(logging.DEBUG)
if not _mnist_log.handlers:
    _fh = logging.FileHandler(str(_LOG_DIR / "mnist_errors.log"), encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    _mnist_log.addHandler(_fh)

# ── 不在此处预检依赖（Git Bash/WSL 环境下 sys.executable 可能异常）。
# 依赖检查推迟到 runner.run_stream() 被调用时（有完整的 try/except 保护）。


class MNISTRunRequest(BaseModel):
    session_id: int
    architecture: dict = Field(default_factory=lambda: {"id": "standardcnn"})
    hyperparameters: dict = Field(default_factory=lambda: {
        "learning_rate": 0.01, "batch_size": 64, "epochs": 10,
        "optimizer": "SGD", "momentum": 0.9, "dropout": 0.25,
    })
    seed: int = 42


@router.get("/check")
def check_mnist_deps():
    """预检端点：验证 MNIST API 可用"""
    return {"deps_ok": True, "error": None, "python": __import__("sys").executable}


@router.get("/architectures")
def get_architectures():
    return {"architectures": PRESET_ARCHITECTURES}


@router.post("/run")
def run_mnist(req: MNISTRunRequest, db: DbSession = Depends(get_db)):
    config = {
        "architecture": req.architecture,
        "hyperparameters": req.hyperparameters,
        "seed": req.seed,
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = None
        for event in runner.run_stream(config):
            if event["type"] == "done":
                result = event
        if result is None:
            raise HTTPException(status_code=500, detail="训练未产生结果")
    except Exception as e:
        _mnist_log.error(f"训练失败: {str(e)}")
        raise HTTPException(status_code=400, detail=f"MNIST 训练失败: {str(e)}")

    r0 = result["runs"][0]
    run = MNISTRun(
        session_id=req.session_id, batch_id=batch_id,
        architecture_id=req.architecture.get("id", "custom"),
        architecture_json=json.dumps(req.architecture),
        hyperparams_json=json.dumps(req.hyperparameters),
        seed=req.seed,
        train_losses=json.dumps(r0["metrics"]["train_loss"]),
        train_accs=json.dumps(r0["metrics"]["train_acc"]),
        val_losses=json.dumps(r0["metrics"]["val_loss"]),
        val_accs=json.dumps(r0["metrics"]["val_acc"]),
        test_accuracy=result["summary"]["final_test_accuracy"],
        test_loss=r0["metrics"]["test_loss"],
        best_epoch=result["summary"]["best_epoch"],
        training_time=result["summary"]["training_time"],
        overfitting_score=result["summary"]["overfitting_score"],
        confusion_matrix=json.dumps(r0["confusion_matrix"]),
        runtime_ms=r0["runtime_ms"],
    )
    db.add(run)
    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "EXPERIMENT_RUNNING"
    db.commit()
    return {"experiment_batch_id": batch_id, **result}


@router.post("/run-stream")
async def run_mnist_stream(req: MNISTRunRequest):
    config = {
        "architecture": req.architecture,
        "hyperparameters": req.hyperparameters,
        "seed": req.seed,
    }

    async def event_stream():
        loop = asyncio.get_event_loop()
        gen = runner.run_stream(config)
        try:
            while True:
                event = await loop.run_in_executor(None, next, gen)
                payload = json.dumps(event, ensure_ascii=False, default=str)
                yield f"data: {payload}\n\n"
                if event["type"] == "error":
                    _mnist_log.error(f"Runner error: {event.get('message', 'unknown')}")
                if event["type"] in ("done", "error"):
                    break
        except StopIteration:
            pass
        except Exception as e:
            _mnist_log.error(f"SSE stream crashed: {str(e)}", exc_info=True)
            yield f"data: {json.dumps({'type':'error','message':f'训练异常: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/runs")
def list_runs(session_id: int | None = None, db: DbSession = Depends(get_db)):
    q = db.query(MNISTRun)
    if session_id:
        q = q.filter(MNISTRun.session_id == session_id)
    return [_run_to_dict(r) for r in q.order_by(MNISTRun.id.desc()).all()]


def _run_to_dict(r) -> dict:
    return {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "architecture_id": r.architecture_id,
        "architecture": json.loads(r.architecture_json) if r.architecture_json else {},
        "hyperparameters": json.loads(r.hyperparams_json) if r.hyperparams_json else {},
        "seed": r.seed,
        "metrics": {
            "train_loss": json.loads(r.train_losses) if r.train_losses else [],
            "train_acc": json.loads(r.train_accs) if r.train_accs else [],
            "val_loss": json.loads(r.val_losses) if r.val_losses else [],
            "val_acc": json.loads(r.val_accs) if r.val_accs else [],
            "test_loss": r.test_loss, "test_acc": r.test_accuracy,
        },
        "confusion_matrix": json.loads(r.confusion_matrix) if r.confusion_matrix else [],
        "test_accuracy": r.test_accuracy, "best_epoch": r.best_epoch,
        "training_time": r.training_time, "overfitting_score": r.overfitting_score,
        "runtime_ms": r.runtime_ms,
        "created_at": str(r.created_at) if r.created_at else None,
    }
