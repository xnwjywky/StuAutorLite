"""MNIST 手写数字识别实验 API"""
import json, uuid, asyncio, logging
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DbSession
from pydantic import BaseModel, Field
from app.models.database import get_db, Session as SessionModel, MNISTRun
from app.core.mnist.runner import MNISTRunner, _probe_hardware, _detect_device
from app.core.mnist.architectures import PRESET_ARCHITECTURES, get_architecture
from app.utils.heavy import run_heavy, get_heavy_executor
from app.utils.logger import get_file_handler
from app.utils.pagination import paginate

router = APIRouter(prefix="/mnist", tags=["mnist"])
runner = MNISTRunner()

# ── 专用错误日志（P-性能：轮转 handler，防 mnist_errors.log 无限增长）──
_mnist_log = logging.getLogger("mnist")
_mnist_log.setLevel(logging.DEBUG)
if not _mnist_log.handlers:
    _mnist_log.addHandler(get_file_handler("mnist_errors.log", fmt="%(asctime)s [%(levelname)s] %(message)s"))


def _run_mnist_blocking(config: dict) -> dict | None:
    """在重型执行器中同步跑完整个训练，返回 'done' 事件（/run 使用；
    SSE 走 /run-stream 逐事件 offload，不在此函数内）。"""
    for event in runner.run_stream(config):
        if event["type"] == "done":
            return event
    return None


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
    # 架构信息是静态的，不依赖数据；附加数据状态供前端展示"数据准备中"
    from app.core.mnist.data_loader import get_data_status
    return {"architectures": PRESET_ARCHITECTURES, "data_status": get_data_status()}


def _require_data_ready():
    """数据未就绪时抛出 503（不抢占训练锁）；就绪返回 None。

    供 /run、/run-stream、/infer 等依赖 MNIST 数据集的端点调用。
    """
    from app.core.mnist.data_loader import is_data_ready, get_data_status

    if is_data_ready():
        return
    st = get_data_status()
    detail = "MNIST 数据准备中" if st["downloading"] else "MNIST 数据未就绪"
    if st["error"]:
        detail = f"MNIST 数据下载失败：{st['error']}，请重试"
    raise HTTPException(
        status_code=503,
        detail={"message": detail, "data_status": st, "retry_after": 10},
    )


@router.get("/data-status")
def get_mnist_data_status():
    """MNIST 数据准备状态（供前端横幅/轮询展示）。"""
    from app.core.mnist.data_loader import get_data_status
    return get_data_status()


@router.post("/data-retry")
async def retry_mnist_download():
    """手动触发 MNIST 数据重新下载（下载失败后用户点"重试"调此端点）。"""
    from app.core.mnist.data_loader import ensure_mnist_data_async, get_data_status, is_data_ready

    if is_data_ready():
        return {"ok": True, "message": "数据已就绪", "status": get_data_status()}
    # 异步触发下载，不阻塞响应（ensure 内部有并发锁，重复触发安全）
    asyncio.create_task(ensure_mnist_data_async())
    return {"ok": True, "message": "已触发重新下载", "status": get_data_status()}


@router.post("/run")
async def run_mnist(req: MNISTRunRequest, db: DbSession = Depends(get_db)):
    """同步返回完整训练结果。

    P-性能：训练是 torch CPU 密集（可数分钟）。原 sync def 会让 FastAPI 用默认
    线程池（~40 worker）的 worker 全程跑训练，长时间饿死其它同步请求。改为 async def：
    训练经 run_heavy 交给专用重型执行器（3 worker），等待期间事件循环与默认线程池
    保持空闲；CPU 结束才回到事件循环线程做轻量 DB 落库。
    """
    from app.core.mnist.model_manager import ModelManager

    # MNIST_DOWNLOAD_NONBLOCKING：数据未就绪立即 503，不占训练锁
    _require_data_ready()

    # P0-1（MNIST_ACCURACY_FIX）：全局训练互斥——等待其它训练（含后台预训练）
    # 完成，最多 30s；否则返回 409。杜绝 torch CPU 并发训练数据竞争。
    if not await asyncio.to_thread(ModelManager.acquire_training, 30.0):
        raise HTTPException(status_code=409, detail="已有训练正在进行，请稍后再试")

    config = {
        "architecture": req.architecture,
        "hyperparameters": req.hyperparameters,
        "seed": req.seed,
        "session_id": req.session_id,
    }
    batch_id = str(uuid.uuid4())[:8]
    try:
        result = await run_heavy(_run_mnist_blocking, config)
        if result is None:
            raise HTTPException(status_code=500, detail="训练未产生结果")
    except HTTPException:
        raise
    except Exception as e:
        _mnist_log.error(f"训练失败: {str(e)}")
        raise HTTPException(status_code=400, detail=f"MNIST 训练失败: {str(e)}")
    finally:
        await asyncio.to_thread(ModelManager.release_training)

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
async def run_mnist_stream(req: MNISTRunRequest, request: Request):
    from app.core.mnist.model_manager import ModelManager

    # MNIST_DOWNLOAD_NONBLOCKING：数据未就绪时推送 data_pending 事件后正常关闭流，
    # 不占用训练锁（前端据此展示"数据准备中"横幅并轮询 /data-status）
    from app.core.mnist.data_loader import is_data_ready, get_data_status

    if not is_data_ready():
        st = get_data_status()

        async def _data_not_ready_stream():
            yield f"data: {json.dumps({'type': 'data_pending', 'message': 'MNIST 数据准备中，请稍候', 'status': st}, ensure_ascii=False)}\n\n"
            if st["downloading"]:
                await asyncio.sleep(1)
                yield f"data: {json.dumps({'type': 'data_pending', 'status': get_data_status()}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'aborted': True}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            _data_not_ready_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    _mnist_log.info(
        "SSE stream start: session=%d arch=%s epochs=%d",
        req.session_id, req.architecture.get("id", "?"), req.hyperparameters.get("epochs", 10),
    )
    config = {
        "architecture": req.architecture,
        "hyperparameters": req.hyperparameters,
        "seed": req.seed,
        "session_id": req.session_id,
    }

    async def event_stream():
        loop = asyncio.get_event_loop()
        # P0-1（MNIST_ACCURACY_FIX）：前端实际训练走本端点（SSE），必须与后台预训练
        # 共用全局互斥——忙时等待最多 30s，仍忙则以 error 事件告知。锁覆盖整个事件流
        # （SSE 惰性生成，训练在迭代时执行），finally 保证正常/异常/断开都释放。
        if not await loop.run_in_executor(get_heavy_executor(), ModelManager.acquire_training, 30.0):
            yield f"data: {json.dumps({'type':'error','message':'已有训练正在进行，请稍后再试'}, ensure_ascii=False)}\n\n"
            return
        # 新训练干净启动：清掉可能残留的取消事件（上次退出时若没有在跑的训练，
        # /cancel 置位的事件不会被任何 event_stream 清理），否则首 batch 即被误判"已取消"
        from app.core.mnist.runner import clear_cancel

        clear_cancel()
        try:
            gen = runner.run_stream(config)
            while True:
                # 客户端断开检测：中途退出（刷新/返回上一步）时及时中止并释放锁，
                # 避免下次进入训练时 acquire 等待旧锁超时导致"卡死"
                if await request.is_disconnected():
                    _mnist_log.info("SSE client disconnected, aborting training")
                    break
                # P-性能：每个 next(gen) 执行一批训练（torch CPU 密集），改走专用
                # 重型执行器而非默认线程池，避免长时间占用 FastAPI ~40 默认 worker。
                event = await loop.run_in_executor(get_heavy_executor(), next, gen)
                payload = json.dumps(event, ensure_ascii=False, default=str)
                yield f"data: {payload}\n\n"
                if event["type"] == "error":
                    _mnist_log.error(f"Runner error: {event.get('message', 'unknown')}")
                if event["type"] in ("done", "error"):
                    break
        except StopIteration:
            _mnist_log.info("SSE stream: generator exhausted normally")
        except Exception as e:
            _mnist_log.error(f"SSE stream crashed: {e}", exc_info=True)
            yield f"data: {json.dumps({'type':'error','message':f'训练异常: {str(e)[:500]}'}, ensure_ascii=False)}\n\n"
        finally:
            # 清理取消事件并同步释放互斥锁（不能 await：SSE 生成器被 aclose
            # 抛 GeneratorExit 时禁止 await，否则 release 不执行 → 锁泄漏，
            # 表现为"已有训练正在进行，请稍后再试"一直卡住）
            from app.core.mnist.runner import clear_cancel

            clear_cancel()
            ModelManager.release_training()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/cancel")
def cancel_training():
    """取消当前训练：前端退出运行实验页时调用，置位取消事件。

    训练循环每 batch 检查该事件，尽快中止并释放全局互斥锁，
    避免"已有训练正在进行，请稍后再试"一直卡住后续使用。
    """
    from app.core.mnist.runner import request_cancel, clear_cancel

    request_cancel()
    # 取消事件由下一次 /run-stream 的 finally 清理（clear_cancel），
    # 这里不清理，保证已开始的训练能感知到取消。
    return {"cancelled": True}


@router.get("/runs")
def list_runs(session_id: int | None = None, include_data: bool = False,
              limit: int = 50, offset: int = 0, db: DbSession = Depends(get_db)):
    """列表接口分页 + 裁剪（P-性能）：默认不携带各 epoch 曲线与混淆矩阵等大字段
    （除非 include_data=true），limit/offset 分页（默认 50 条/页，上限 200）。"""
    q = db.query(MNISTRun)
    if session_id:
        q = q.filter(MNISTRun.session_id == session_id)
    return paginate(
        q.order_by(MNISTRun.id.desc()), limit, offset,
        lambda r: _run_to_dict(r, include_data=include_data),
    )


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
    # MNIST_DOWNLOAD_NONBLOCKING：数据未就绪时 503，前端提示"图片识别暂不可用"
    _require_data_ready()

    from app.core.mnist.model_manager import (
        ALLOWED_MODEL_IDS,
        ModelManager,
        preprocess_upload_image,
        run_inference,
    )

    # P1-6：model_id 白名单校验（防路径遍历），非法值直接 400
    if model_id not in ALLOWED_MODEL_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"非法的 model_id（允许: {', '.join(sorted(ALLOWED_MODEL_IDS))}）",
        )

    mgr = ModelManager.get_instance()

    try:
        import torch
        device_obj, device_diag = _detect_device()
        device_str = str(device_obj)
    except Exception:
        device_str = "cpu"
        device_diag = {"warnings": []}

    # 1. 预处理图片（S-中-3：限制上传大小，防内存压力）
    MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB
    image_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="图片过大（上限 5MB）")
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


def _run_to_dict(r, include_data: bool = False) -> dict:
    d = {
        "id": r.id, "session_id": r.session_id, "batch_id": r.batch_id,
        "architecture_id": r.architecture_id,
        "architecture": json.loads(r.architecture_json) if r.architecture_json else {},
        "hyperparameters": json.loads(r.hyperparams_json) if r.hyperparams_json else {},
        "seed": r.seed,
        # 标量指标始终返回；epoch 曲线与混淆矩阵属于明细大字段，默认裁剪
        "metrics": {
            "test_loss": r.test_loss, "test_acc": r.test_accuracy,
        },
        "test_accuracy": r.test_accuracy, "best_epoch": r.best_epoch,
        "training_time": r.training_time, "overfitting_score": r.overfitting_score,
        "runtime_ms": r.runtime_ms,
        "created_at": str(r.created_at) if r.created_at else None,
    }
    if include_data:
        d["metrics"].update({
            "train_loss": json.loads(r.train_losses) if r.train_losses else [],
            "train_acc": json.loads(r.train_accs) if r.train_accs else [],
            "val_loss": json.loads(r.val_losses) if r.val_losses else [],
            "val_acc": json.loads(r.val_accs) if r.val_accs else [],
        })
        d["confusion_matrix"] = json.loads(r.confusion_matrix) if r.confusion_matrix else []
    return d
