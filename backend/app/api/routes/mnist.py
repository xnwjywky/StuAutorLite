"""MNIST 手写数字识别实验 API"""
import json, uuid, asyncio, logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, MNISTRun
from app.core.mnist.runner import MNISTRunner, _probe_hardware, _detect_device
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
    """预检端点：系统层探测硬件 + torch 层匹配设备，返回完整的设备诊断信息"""
    # 1. 系统层硬件探测（不依赖 torch）
    hw = _probe_hardware()
    detected = [k for k in ("cuda", "npu", "mps") if hw[k]["detected"]]

    # 2. 依赖检查
    deps = {"torch": False, "torchvision": False, "numpy": False}
    deps_errors: list[str] = []
    for pkg in ("torch", "torchvision", "numpy"):
        try:
            __import__(pkg)
            deps[pkg] = True
        except ImportError:
            deps_errors.append(pkg)

    # 3. torch 层设备匹配
    try:
        import torch
        device, diag = _detect_device()
        selected = diag["selected"]
        usable = diag["usable"]
        warnings = diag["warnings"]
        messages = diag["messages"]
        gpu_details = None
        if torch.cuda.is_available():
            gpu_details = {
                "name": torch.cuda.get_device_name(0),
                "count": torch.cuda.device_count(),
                "memory_total_mb": round(
                    torch.cuda.get_device_properties(0).total_memory / 1024 / 1024, 1
                ),
            }
        npu_details = None
        try:
            if hasattr(torch, "npu") and torch.npu.is_available():
                npu_details = {
                    "name": torch.npu.get_device_name(0),
                    "count": torch.npu.device_count(),
                }
        except Exception:
            pass
    except Exception:
        selected = "none"
        usable = []
        warnings = ["PyTorch 未安装或导入失败"] + deps_errors
        messages = warnings[:]
        gpu_details = None
        npu_details = None

    return {
        "deps_ok": len(deps_errors) == 0,
        "deps": deps,
        "deps_errors": deps_errors,
        "selected_device": selected,
        "usable_devices": usable,
        "detected_hardware": detected,
        "warnings": warnings,
        "messages": messages,
        "hardware_details": {
            k: {kk: vv for kk, vv in v.items()
                if kk in ("type", "label", "detected", "ready", "message", "install_hint")}
            for k, v in hw.items()
        },
        "gpu_details": gpu_details,
        "npu_details": npu_details,
    }


@router.get("/architectures")
def get_architectures():
    return {"architectures": PRESET_ARCHITECTURES}


@router.post("/run")
def run_mnist(req: MNISTRunRequest, db: DbSession = Depends(get_db)):
    config = {
        "architecture": req.architecture,
        "hyperparameters": req.hyperparameters,
        "seed": req.seed,
        "session_id": req.session_id,
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
        "session_id": req.session_id,
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


# ═══════ 上传图片识别 ═══════

@router.get("/model-status")
async def get_model_status(session_id: int | None = None):
    """返回所有可选识别模型的状态列表（供前端下拉框）。"""
    from app.core.mnist.model_manager import ModelManager

    models = ModelManager.get_all_model_info(session_id)
    _mnist_log.info(
        "model-status session=%s: %s",
        session_id,
        ", ".join(f"{m['id']}={m['status']}" for m in models),
    )
    return {"models": models}


@router.get("/start-pretrain")
async def start_pretrain_background():
    """启动后台预设模型串行预训练（非阻塞），缺失模型立即开始。
    通过 /model-status 轮询进度。"""
    from app.core.mnist.model_manager import ModelManager

    try:
        device_obj, _ = _detect_device()
        device_str = str(device_obj)
    except Exception:
        device_str = "cpu"

    ModelManager.start_pretrain_background(device=device_str)
    return {"started": True, "device": device_str}


@router.post("/infer")
async def infer_upload_image(
    file: UploadFile = File(...),
    session_id: int = Form(...),
    model_id: str = Form("standardcnn"),
):
    """上传手写数字图片，用指定模型识别。

    model_id: "minicnn" | "standardcnn" | "deepcnn" | "user"
    返回: {model_id, predicted, confidence, probabilities, model_name}
    """
    from app.core.mnist.model_manager import (
        ModelManager,
        preprocess_upload_image,
        run_inference,
    )

    mgr = ModelManager.get_instance()

    try:
        import torch
        device_obj, device_diag = _detect_device()
        device_str = str(device_obj)
    except Exception:
        device_str = "cpu"
        device_diag = {"warnings": []}

    # 1. 预处理图片
    image_bytes = await file.read()
    image_tensor = preprocess_upload_image(image_bytes, device=device_str)
    if image_tensor is None:
        raise HTTPException(status_code=400, detail="图片预处理失败，请确认上传的是手写数字图片")

    # 2. 加载指定模型
    model = mgr.load_model_by_id(model_id, session_id, device=device_str)
    if model is None:
        status = ModelManager._training_status.get(model_id, "not_available")
        if status == "training":
            raise HTTPException(status_code=409, detail=f"模型 {model_id} 正在训练中，请等待完成后再试")
        elif model_id == "user":
            raise HTTPException(status_code=404, detail="尚未训练用户模型，请先在训练监控区运行训练")
        else:
            raise HTTPException(status_code=404, detail=f"模型 {model_id} 未就绪（状态: {status}）")

    # 3. 推理
    result = run_inference(model, image_tensor)

    meta = {"minicnn": "MiniCNN", "standardcnn": "StandardCNN",
            "deepcnn": "DeepCNN", "user": "我的训练模型"}
    result["model_id"] = model_id
    result["model_name"] = meta.get(model_id, model_id)
    result["device"] = device_str

    return result


@router.get("/has-user-model")
def check_user_model(session_id: int):
    """检查是否有用户训练的模型可供识别。"""
    from app.core.mnist.model_manager import ModelManager
    return {
        "exists": ModelManager.get_instance().has_user_model(int(session_id)),
    }


@router.delete("/user-model")
def delete_user_model(session_id: int):
    """删除指定 session 的用户训练模型（页面退出时调用）。"""
    from app.core.mnist.model_manager import ModelManager
    mgr = ModelManager.get_instance()
    mgr.delete_user_model(int(session_id))
    return {"deleted": True, "session_id": session_id}


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
