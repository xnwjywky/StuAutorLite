"""MNIST 模型管理器 — 预训练模型缓存 + 用户模型持久化 + 图片推理

预训练模型（MiniCNN / StandardCNN / DeepCNN）：
  - 首次使用时后台串行训练并缓存到 data/models/*.pth
  - 后续启动直接加载，无需重新训练
  - _training_status 字典供 API 查询每模型状态
用户模型：
  - 训练完成后保存到 data/models/user_{session_id}.pth
  - 上传识别时按 session_id 加载
"""
import torch
import torch.nn as nn
import logging
import threading
from pathlib import Path

from app.core.mnist.architectures import build_model, get_architecture, PRESET_ARCHITECTURES

PRETRAINED_IDS = ["minicnn", "standardcnn", "deepcnn"]

_MODELS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "models"
_MODELS_DIR.mkdir(parents=True, exist_ok=True)

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

    def __init__(self):
        self._pretrained: dict[str, nn.Module] = {}   # arch_id -> model (on CPU)
        self._user_model_cache: dict[int, dict] = {}  # session_id -> {"state_dict":..., "arch_config":...}

        # 启动时扫描文件系统初始化状态
        with ModelManager._train_lock:
            for aid in PRETRAINED_IDS:
                if aid not in ModelManager._training_status:
                    ModelManager._training_status[aid] = "cached" if self.is_pretrained_cached(aid) else "not_available"

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── 模型状态查询（供前端下拉框）──

    @classmethod
    def get_all_model_info(cls, session_id: int | None = None) -> list[dict]:
        """返回所有可用模型的状态信息列表（4 个）。"""
        models = []
        for aid in PRETRAINED_IDS:
            meta = _MODEL_META.get(aid, {})
            status = cls._training_status.get(aid, "not_available")
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
        """在后台线程中串行训练所有缺失的预训练模型。非阻塞，立即返回。"""
        mgr = cls.get_instance()

        def _train_all():
            _log.info(f"后台预训练启动 (device={device})...")
            for aid in PRETRAINED_IDS:
                if mgr.is_pretrained_cached(aid):
                    with cls._train_lock:
                        cls._training_status[aid] = "cached"
                    _log.info(f"预训练模型 {aid} 已缓存，跳过")
                    continue

                with cls._train_lock:
                    cls._training_status[aid] = "training"
                    cls._training_progress[aid] = {"epoch": 0, "total": 10, "acc": None}

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

        threading.Thread(target=_train_all, daemon=True).start()

    def _train_one_pretrained(self, arch_id: str, device: str = "cpu", epochs: int = 10):
        """训练单个预训练模型并保存。阻塞，在后台线程中调用。"""
        import numpy as np
        from torch.utils.data import DataLoader
        from torchvision import datasets, transforms

        arch = get_architecture(arch_id)
        if arch is None:
            raise ValueError(f"未知架构: {arch_id}")

        tf = transforms.Compose(
            [transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))]
        )
        train_ds = datasets.MNIST(root="./data", train=True, download=True, transform=tf)
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

    def load_pretrained(self, arch_id: str, device: str = "cpu") -> nn.Module | None:
        """加载缓存的预训练模型。"""
        pth = _MODELS_DIR / f"{arch_id}.pth"
        if not pth.exists():
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
        """保存用户训练的模型权重和架构配置。"""
        pth = _MODELS_DIR / f"user_{session_id}.pth"
        torch.save({"state_dict": state_dict, "arch_config": arch_config}, str(pth))
        _log.info(f"用户模型 session={session_id} 已保存")

    def has_user_model(self, session_id: int) -> bool:
        return (_MODELS_DIR / f"user_{session_id}.pth").exists()

    def delete_user_model(self, session_id: int):
        """删除用户训练的模型文件。"""
        pth = _MODELS_DIR / f"user_{session_id}.pth"
        if pth.exists():
            pth.unlink()
            _log.info(f"用户模型 session={session_id} 已删除")

    def load_user_model(self, session_id: int, device: str = "cpu") -> nn.Module | None:
        """加载用户训练的模型。"""
        pth = _MODELS_DIR / f"user_{session_id}.pth"
        if not pth.exists():
            return None
        try:
            data = torch.load(str(pth), map_location="cpu", weights_only=False)
            arch_config = data.get("arch_config", {"id": "standardcnn"})
            arch = get_architecture(arch_config.get("id", "standardcnn"))
            if arch is None:
                arch = get_architecture("standardcnn")
            model = build_model(arch)
            model.load_state_dict(data["state_dict"])
            model.eval()
            return model.to(device)
        except Exception as e:
            _log.error(f"加载用户模型 session={session_id} 失败: {e}")
            return None

    # ── 加载指定模型（供统一推理接口使用）──

    def load_model_by_id(
        self, model_id: str, session_id: int | None, device: str = "cpu"
    ) -> nn.Module | None:
        """根据 model_id 加载模型：'minicnn'/'standardcnn'/'deepcnn' 或 'user'。"""
        if model_id == "user":
            if session_id is None:
                return None
            return self.load_user_model(int(session_id), device=device)
        return self.load_pretrained(model_id, device=device)


# ── 图片推理工具 ──

def preprocess_upload_image(image_bytes: bytes, device: str = "cpu") -> "torch.Tensor | None":
    """上传图片字节 → MNIST 标准输入 tensor (1,1,28,28)。"""
    try:
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


def run_inference(model: nn.Module, image_tensor: "torch.Tensor") -> dict:
    """对单张图片运行推理，返回预测类别、置信度和各类别概率。"""
    device = image_tensor.device
    model.to(device).eval()
    with torch.no_grad():
        output = model(image_tensor)
        probs = torch.softmax(output, dim=1)
        pred = int(probs.argmax(dim=1).item())
        confidence = round(float(probs.max(dim=1).values.item()) * 100, 2)
        all_probs = [round(float(p) * 100, 2) for p in probs[0].tolist()]
    return {"predicted": pred, "confidence": confidence, "probabilities": all_probs}
