"""MNIST 模型管理器 — 预训练模型缓存 + 用户模型持久化 + 图片推理

预训练模型（MiniCNN / StandardCNN / DeepCNN）：
  - 首次使用时后台串行训练并缓存到 data/models/*.pth
  - 后续启动直接加载，无需重新训练
  - _training_status 字典供 API 查询每模型状态
用户模型：
  - 训练完成后保存到 data/models/user_{session_id}.pth
  - 上传识别时按 session_id 加载

⚠️ 所有 torch 导入均为延迟导入（函数体内 import），确保本模块可在无 PyTorch 环境中被 import。
"""
from __future__ import annotations
import json
import logging
import threading

from app.config import DATA_DIR as _BACKEND_DATA_DIR
from app.core.mnist.architectures import build_model, get_architecture
from app.core.mnist.data_loader import MNIST_DATA_ROOT

PRETRAINED_IDS = ["minicnn", "standardcnn", "deepcnn"]

# 合法 model_id 白名单（P1-6：防止路径遍历，如 model_id="../../x" 拼出 _MODELS_DIR 之外）
ALLOWED_MODEL_IDS = frozenset(PRETRAINED_IDS + ["user"])

# P2：模型目录锚定 backend/data/models（不再相对 CWD）
_MODELS_DIR = _BACKEND_DATA_DIR / "models"
_MODELS_DIR.mkdir(parents=True, exist_ok=True)

# S-高-2：后台预训练状态持久化文件（进程重启不丢失训练进度/状态）
_STATUS_FILE = _MODELS_DIR / "pretrain_status.json"

_log = logging.getLogger("mnist.models")

# ── 模型元信息（供前端下拉框展示）──
_MODEL_META: dict[str, dict] = {
    "minicnn":     {"name": "MiniCNN",     "params": "32K",   "description": "1层卷积+1层全连接，极简CNN"},
    "standardcnn": {"name": "StandardCNN", "params": "422K",  "description": "2层卷积+Dropout，MNIST经典架构"},
    "deepcnn":     {"name": "DeepCNN",     "params": "871K",  "description": "4层卷积+Dropout，深层特征提取"},
    "user":        {"name": "我的训练模型", "params": "—",     "description": "用户自定义架构和超参数训练"},
}


class ModelManager:
    """单例管理器，负责预训练模型缓存、后台训练和用户模型持久化。"""

    _instance = None

    # ── 后台训练状态（类变量，跨请求共享）──
    _training_status: dict[str, str] = {}     # arch_id -> "cached" | "training" | "failed" | "not_available"
    _training_progress: dict[str, dict] = {}  # arch_id -> {"epoch": N, "total": M, "acc": float}
    _train_lock = threading.Lock()

    # P0-1（MNIST_ACCURACY_FIX）：进程级训练互斥——/run（用户训练）与后台预训练
    # 共用同一把锁，杜绝 torch CPU 多训练线程并发导致的数据竞争（loss 爆炸/卡 ln(10)）。
    _training_active = False
    _train_cond = threading.Condition(_train_lock)

    # P1（MNIST_ACCURACY_FIX）：预训练后台线程幂等标志——已在跑则不再重复启动
    _pretrain_running = False

    @classmethod
    def acquire_training(cls, timeout: float = 0.0) -> bool:
        """尝试获取全局训练互斥。

        - timeout=0：当前有训练在进行则立即返回 False（预训练用，礼貌跳过本轮）；
        - timeout>0：等待最多 timeout 秒，超时仍忙则返回 False（/run 端点用，返回 409）。
        成功获取后调用方必须用 finally 释放 release_training()。
        """
        with cls._train_cond:
            if cls._training_active:
                cls._train_cond.wait(timeout=timeout)
            if cls._training_active:
                return False
            cls._training_active = True
            return True

    @classmethod
    def release_training(cls):
        """释放全局训练互斥并唤醒等待者。"""
        with cls._train_cond:
            cls._training_active = False
            cls._train_cond.notify_all()

    def __init__(self):
        self._pretrained: dict[str, object] = {}   # arch_id -> model (on CPU)
        self._user_model_cache: dict[int, dict] = {}  # session_id -> {"state_dict":..., "arch_config":...}

        # 启动时恢复上次训练状态（S-高-2），再扫描文件系统补齐
        with ModelManager._train_lock:
            self._load_status()
            for aid in PRETRAINED_IDS:
                if aid not in ModelManager._training_status:
                    ModelManager._training_status[aid] = "cached" if self.is_pretrained_cached(aid) else "not_available"

    @classmethod
    def _persist_status(cls):
        """把训练状态/进度原子写盘（tmp + replace），供重启恢复与可观测。"""
        try:
            _STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "status": dict(cls._training_status),
                "progress": dict(cls._training_progress),
            }
            tmp = _STATUS_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(_STATUS_FILE)
        except Exception as e:
            _log.warning(f"预训练状态落盘失败: {e}")

    @classmethod
    def _load_status(cls):
        """恢复上次持久化的训练状态；上次 'training'（进程中断）标记为 'failed'。"""
        try:
            if not _STATUS_FILE.exists():
                return
            payload = json.loads(_STATUS_FILE.read_text(encoding="utf-8"))
            cls._training_status.update(payload.get("status", {}))
            cls._training_progress.update(payload.get("progress", {}))
            for aid, st in cls._training_status.items():
                if st == "training":
                    cls._training_status[aid] = "failed"  # 上次中断，可重入重训
        except Exception as e:
            _log.warning(f"预训练状态恢复失败: {e}")

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── 模型状态查询（供前端下拉框）──

    @classmethod
    def get_all_model_info(cls, session_id: int | None = None) -> list[dict]:
        """返回所有可用模型的状态信息列表（4 个）。
        状态来源优先级：_training_status（运行时） > 文件系统 > "not_available"。"""
        models = []
        mgr = cls.get_instance()
        for aid in PRETRAINED_IDS:
            meta = _MODEL_META.get(aid, {})
            # 先查运行时状态，再查文件系统兜底（确保重启后也能检测到已有模型）
            status = cls._training_status.get(aid)
            if status != "cached" and mgr.is_pretrained_cached(aid):
                status = "cached"
                cls._training_status[aid] = "cached"  # 同步回状态
            if not status:
                status = "not_available"
            progress = cls._training_progress.get(aid, {})
            models.append({
                "id": aid, "name": meta.get("name", aid),
                "params": meta.get("params", "—"),
                "description": meta.get("description", ""),
                "status": status,
                "selectable": status == "cached",
                "progress": progress.get("epoch", 0) if status == "training" else None,
                "progress_total": progress.get("total", 10) if status == "training" else None,
                "accuracy": progress.get("acc") if status == "cached" else None,
                "type": "pretrained",
            })
        # 用户模型 — 只查文件系统（每 session 独立，不用全局状态）
        user_status = "not_available"
        if session_id and cls.get_instance().has_user_model(int(session_id)):
            user_status = "cached"
        models.append({
            "id": "user", "name": "🧠 我的训练模型",
            "params": "—", "description": "用户自定义架构和超参数训练",
            "status": user_status,
            "selectable": user_status == "cached",
            "progress": None, "progress_total": None,
            "accuracy": None,
            "type": "user",
        })
        return models

    # ── 后台预训练 ──

    @classmethod
    def start_pretrain_background(cls, device: str = "cpu"):
        """在后台线程中串行训练所有缺失的预训练模型。非阻塞，立即返回。

        S-高-2：状态变更即时落盘（_persist_status），整体异常被捕获并标记
        failed，失败可观测、进程重启后状态可恢复、可重入重训。
        P0-1（MNIST_ACCURACY_FIX）：与 /run 共用全局训练互斥——若用户训练
        正在进行，本轮预训练礼貌跳过，杜绝 torch CPU 并发训练数据竞争。
        """
        mgr = cls.get_instance()

        # P1（MNIST_ACCURACY_FIX）：预训练幂等——已有后台预训练在跑则直接返回
        with cls._train_lock:
            if cls._pretrain_running:
                _log.info("后台预训练已在运行，跳过重复启动")
                return
            cls._pretrain_running = True

        def _train_all():
            try:
                if not cls.acquire_training(timeout=0.0):
                    _log.info("有用户训练正在进行，本轮预训练跳过")
                    return
                try:
                    _train_all_locked(mgr, device)
                finally:
                    cls.release_training()
            finally:
                with cls._train_lock:
                    cls._pretrain_running = False

        def _train_all_locked(mgr, device):
            _log.info(f"后台预训练启动 (device={device})...")
            for aid in PRETRAINED_IDS:
                if mgr.is_pretrained_cached(aid):
                    with cls._train_lock:
                        cls._training_status[aid] = "cached"
                    cls._persist_status()
                    _log.info(f"预训练模型 {aid} 已缓存，跳过")
                    continue

                with cls._train_lock:
                    cls._training_status[aid] = "training"
                    cls._training_progress[aid] = {"epoch": 0, "total": 10, "acc": None}
                cls._persist_status()

                try:
                    mgr._train_one_pretrained(aid, device=device, epochs=10)
                    with cls._train_lock:
                        cls._training_status[aid] = "cached"
                        cls._training_progress.pop(aid, None)
                except Exception as e:
                    with cls._train_lock:
                        cls._training_status[aid] = "failed"
                        cls._training_progress[aid] = {
                            "epoch": 0, "total": 10, "acc": None,
                            "error": str(e)[:200],
                        }
                    _log.error(f"预训练模型 {aid} 失败: {e}")
                cls._persist_status()
            _log.info("后台预训练结束")

        try:
            threading.Thread(target=_train_all, daemon=True).start()
        except Exception as e:
            # 线程创建失败（极端情况）：标记所有未就绪模型为 failed，可观测
            with cls._train_lock:
                for aid in PRETRAINED_IDS:
                    if not mgr.is_pretrained_cached(aid):
                        cls._training_status[aid] = "failed"
            cls._persist_status()
            _log.error(f"后台预训练线程启动失败: {e}")

    def _train_one_pretrained(self, arch_id: str, device: str = "cpu", epochs: int = 10):
        """训练单个预训练模型并保存。阻塞，在后台线程中调用。"""
        import torch
        import torch.nn as nn
        import numpy as np
        from torch.utils.data import DataLoader
        from torchvision import datasets, transforms

        arch = get_architecture(arch_id)
        if arch is None:
            raise ValueError(f"未知架构: {arch_id}")

        tf = transforms.Compose(
            [transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))]
        )
        train_ds = datasets.MNIST(root=str(MNIST_DATA_ROOT), train=True, download=True, transform=tf)
        train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)

        model = build_model(arch).to(device)
        optimizer = torch.optim.SGD(model.parameters(), lr=0.01, momentum=0.9)
        criterion = nn.CrossEntropyLoss()

        for epoch in range(epochs):
            model.train()
            total_loss, correct, total = 0.0, 0, 0
            for data, target in train_loader:
                data, target = data.to(device), target.to(device)
                optimizer.zero_grad()
                loss = criterion(model(data), target)
                loss.backward()
                optimizer.step()
                total_loss += loss.item() * data.size(0)
                # P2（MNIST_ACCURACY_FIX）：预测 forward 不需要梯度，包 no_grad 省计算图
                with torch.no_grad():
                    _, pred = model(data).max(1)
                correct += pred.eq(target).sum().item()
                total += target.size(0)

            acc = round(correct / total, 4)
            with ModelManager._train_lock:
                ModelManager._training_progress[arch_id] = {
                    "epoch": epoch + 1, "total": epochs, "acc": acc,
                }

        # 保存
        pth = _MODELS_DIR / f"{arch_id}.pth"
        model_cpu = model.cpu()
        torch.save(model_cpu.state_dict(), str(pth))
        self._pretrained[arch_id] = model_cpu
        model_cpu.eval()
        _log.info(f"预训练模型 {arch_id} 训练完成 → {pth}")

    # ── 预训练模型缓存 / 加载 ──

    def is_pretrained_cached(self, arch_id: str) -> bool:
        return (_MODELS_DIR / f"{arch_id}.pth").exists()

    def all_pretrained_cached(self) -> bool:
        return all(self.is_pretrained_cached(aid) for aid in PRETRAINED_IDS)

    def load_pretrained(self, arch_id: str, device: str = "cpu") -> "object | None":
        """加载缓存的预训练模型。

        P1-6：加载前校验 arch_id 在白名单内，且解析后的路径父目录必须为
        _MODELS_DIR（纵深防御，防路径遍历拼出任意 .pth）。
        """
        import torch
        import torch.nn as nn
        if arch_id not in ALLOWED_MODEL_IDS:
            _log.warning("非法 model_id（已拒绝）: %s", arch_id)
            return None
        pth = (_MODELS_DIR / f"{arch_id}.pth").resolve()
        if pth.parent != _MODELS_DIR.resolve() or not pth.exists():
            return None
        if arch_id in self._pretrained:
            return self._pretrained[arch_id].to(device)
        try:
            arch = get_architecture(arch_id)
            model = build_model(arch)
            state = torch.load(str(pth), map_location="cpu", weights_only=True)
            model.load_state_dict(state)
            model.eval()
            self._pretrained[arch_id] = model
            return model.to(device)
        except Exception as e:
            _log.error(f"加载预训练模型 {arch_id} 失败: {e}")
            return None

    # ── 用户模型 ──

    def save_user_model(self, session_id: int, state_dict: dict, arch_config: dict):
        """保存用户训练的模型权重和架构配置。

        P1-7：state_dict 单独存 `.pth`（纯权重，可用 weights_only 安全加载），
        arch_config 另存 JSON —— 不再打包成 pickle 对象，消除反序列化 RCE 风险。
        """
        import torch
        pth = _MODELS_DIR / f"user_{session_id}.pth"
        torch.save(state_dict, str(pth))
        cfg = _MODELS_DIR / f"user_{session_id}.arch.json"
        cfg.write_text(json.dumps(arch_config, ensure_ascii=False), encoding="utf-8")
        _log.info(f"用户模型 session={session_id} 已保存")

    def has_user_model(self, session_id: int) -> bool:
        return (_MODELS_DIR / f"user_{session_id}.pth").exists()

    def delete_user_model(self, session_id: int):
        """删除用户训练的模型文件（含配套架构配置）。"""
        pth = _MODELS_DIR / f"user_{session_id}.pth"
        if pth.exists():
            pth.unlink()
        cfg = _MODELS_DIR / f"user_{session_id}.arch.json"
        if cfg.exists():
            cfg.unlink()
        _log.info(f"用户模型 session={session_id} 已删除")

    def _load_user_arch_config(self, session_id: int) -> dict:
        """读取用户模型架构配置：优先 JSON；兼容旧格式（从 .pth 打包 dict 中取）。"""
        cfg = _MODELS_DIR / f"user_{session_id}.arch.json"
        if cfg.exists():
            try:
                return json.loads(cfg.read_text(encoding="utf-8"))
            except Exception as e:
                _log.warning(f"用户模型架构配置解析失败 session={session_id}: {e}")
        return {}

    def load_user_model(self, session_id: int, device: str = "cpu") -> nn.Module | None:
        """加载用户训练的模型。

        P1-7：仅以 `weights_only=True` 加载纯权重 state_dict（拒绝任意对象
        反序列化），架构配置从 JSON 读取；兼容旧打包格式时同样只走安全加载。
        """
        import torch
        pth = (_MODELS_DIR / f"user_{session_id}.pth").resolve()
        if pth.parent != _MODELS_DIR.resolve() or not pth.exists():
            return None
        try:
            arch_config = self._load_user_arch_config(session_id)
            if not arch_config:
                # 兼容旧格式：.pth 内打包 {"state_dict", "arch_config"}（weights_only 安全加载）
                data = torch.load(str(pth), map_location="cpu", weights_only=True)
                if isinstance(data, dict) and "state_dict" in data:
                    state_dict = data["state_dict"]
                    if not arch_config and isinstance(data.get("arch_config"), dict):
                        arch_config = data["arch_config"]
                else:
                    state_dict = data
            else:
                state_dict = torch.load(str(pth), map_location="cpu", weights_only=True)
            arch = get_architecture(arch_config.get("id", "standardcnn"))
            if arch is None:
                arch = get_architecture("standardcnn")
            model = build_model(arch)
            model.load_state_dict(state_dict)
            model.eval()
            return model.to(device)
        except Exception as e:
            _log.error(f"加载用户模型 session={session_id} 失败: {e}")
            return None

    # ── 加载指定模型（供统一推理接口使用）──

    def load_model_by_id(
        self, model_id: str, session_id: int | None, device: str = "cpu"
    ) -> nn.Module | None:
        """根据 model_id 加载模型：'minicnn'/'standardcnn'/'deepcnn' 或 'user'。

        P1-6：model_id 必须命中白名单（ALLOWED_MODEL_IDS），非法值直接拒绝，
        防止 "../../x" 类路径遍历探测任意 .pth。
        """
        if model_id not in ALLOWED_MODEL_IDS:
            _log.warning("非法 model_id（已拒绝）: %s", model_id)
            return None
        if model_id == "user":
            if session_id is None:
                return None
            return self.load_user_model(int(session_id), device=device)
        return self.load_pretrained(model_id, device=device)


# ── 图片推理工具 ──

def preprocess_upload_image(image_bytes: bytes, device: str = "cpu"):
    """上传图片字节 → MNIST 标准输入 tensor (1,1,28,28)。"""
    try:
        import torch
        from PIL import Image
        import io
        import numpy as np

        img = Image.open(io.BytesIO(image_bytes)).convert("L")
        img = img.resize((28, 28), Image.LANCZOS)
        arr = np.array(img, dtype=np.float32)

        if arr.mean() > 127:
            arr = 255.0 - arr

        arr = arr / 255.0
        arr = (arr - 0.1307) / 0.3081
        tensor = torch.tensor(arr).unsqueeze(0).unsqueeze(0)
        return tensor.to(device)
    except Exception as e:
        _log.error(f"图片预处理失败: {e}")
        return None


def run_inference(model, image_tensor) -> dict:
    """对单张图片运行推理，返回预测类别、置信度和各类别概率。"""
    import torch
    device = image_tensor.device
    model.to(device).eval()
    with torch.no_grad():
        output = model(image_tensor)
        probs = torch.softmax(output, dim=1)
        pred = int(probs.argmax(dim=1).item())
        confidence = round(float(probs.max(dim=1).values.item()) * 100, 2)
        all_probs = [round(float(p) * 100, 2) for p in probs[0].tolist()]
    return {"predicted": pred, "confidence": confidence, "probabilities": all_probs}
