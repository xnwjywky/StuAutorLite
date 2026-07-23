"""MNIST 训练 Runner — PyTorch 实现，epoch 级 SSE 流式输出

设备检测策略（两层）：
  1. 系统层探测（nvidia-smi / npu-smi / /dev/davinci / uname）→ 知道物理硬件
  2. PyTorch 层匹配（torch.cuda / torch.mps / torch.npu）→ 确认驱动和库就绪

优先级：CUDA > MPS(Apple) > NPU(Ascend) > CPU
若检测到 NPU 硬件但 torch-npu 未安装，会明确提示安装命令。

所有训练相关日志写入 backend/logs/mnist_errors.log。
"""
import time
import json
import subprocess
import platform
import os
import logging
from pathlib import Path

# ── 训练专用日志（仅写文件，不输出到控制台）──
_LOG_DIR = Path(__file__).resolve().parent.parent.parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_train_log = logging.getLogger("mnist.train")
_train_log.setLevel(logging.DEBUG)
if not _train_log.handlers:
    _fh = logging.FileHandler(str(_LOG_DIR / "mnist_errors.log"), encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    _train_log.addHandler(_fh)
    # 不再输出到 StreamHandler — 训练日志量大，会淹没 uvicorn 控制台
    _train_log.propagate = False  # 也不向 root logger 传播


def _probe_hardware() -> dict:
    """系统层探测：不依赖 torch，直接检查 nvidia-smi / npu-smi / /dev/davinci。
    返回各加速器的检测状态、消息和安装提示。"""
    hw: dict = {
        "cuda": {"type": "cuda", "label": "NVIDIA GPU", "detected": False, "ready": False,
                 "message": "", "install_hint": ""},
        "npu":  {"type": "npu",  "label": "华为昇腾 NPU", "detected": False, "ready": False,
                 "message": "", "install_hint": ""},
        "mps":  {"type": "mps",  "label": "Apple MPS", "detected": False, "ready": False,
                 "message": "", "install_hint": ""},
        "cpu":  {"type": "cpu",  "label": "CPU", "detected": True, "ready": True,
                 "message": "CPU 始终可用", "install_hint": ""},
    }

    # ── 探测 NVIDIA GPU ──
    try:
        r = subprocess.run(
            ["nvidia-smi", "-L"], capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0 and "GPU" in r.stdout:
            gpu_lines = [l for l in r.stdout.splitlines() if l.strip().startswith("GPU")]
            hw["cuda"]["detected"] = True
            hw["cuda"]["message"] = f"检测到 {len(gpu_lines)} 个 NVIDIA GPU"
            hw["cuda"]["install_hint"] = (
                "pip install torch --index-url https://download.pytorch.org/whl/cu121"
            )
    except Exception:
        pass

    # ── 探测华为昇腾 NPU ──
    npu_detected = False
    try:
        r = subprocess.run(
            ["npu-smi", "info", "-l"], capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            npu_detected = True
    except Exception:
        pass
    if not npu_detected:
        try:
            davinci = list(Path("/dev").glob("davinci*"))
            if davinci:
                npu_detected = True
        except Exception:
            pass
    if npu_detected:
        hw["npu"]["detected"] = True
        hw["npu"]["message"] = "检测到华为昇腾 NPU 硬件"
        hw["npu"]["install_hint"] = (
            "请安装 torch-npu（Ascend 版 PyTorch），参考: "
            "https://gitee.com/ascend/pytorch"
        )

    # ── 探测 Apple MPS ──
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        hw["mps"]["detected"] = True
        hw["mps"]["message"] = "检测到 Apple Silicon (MPS 可用)"

    return hw


def _pick_idle_npu() -> int:
    """检测多卡 NPU 中空闲率最高的卡，返回卡索引（0-based）。
    通过 npu-smi info 解析各卡的 AI Core 使用率，选最低值。
    失败时返回 0（使用默认卡）。"""
    try:
        r = subprocess.run(
            ["npu-smi", "info", "-t", "usg", "-i", "-1"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode != 0:
            return 0
        # npu-smi 输出格式类似：NPU ID | AI Core(%) | ...
        # 解析每行中的数字
        import re
        usages: list[tuple[int, float]] = []
        for line in r.stdout.splitlines():
            # 匹配 "0" 或 "0   10" 这类 NPU ID + 使用率
            m = re.match(r"\s*(\d+)\s+(\d+)", line)
            if m:
                npu_id = int(m.group(1))
                usage = float(m.group(2))
                usages.append((npu_id, usage))
        if not usages:
            return 0
        # 选使用率最低的卡
        usages.sort(key=lambda x: x[1])
        best_id = usages[0][0]
        _train_log.info(f"NPU 空闲检测: 各卡使用率={[(i, f'{u:.0f}%') for i,u in usages]} → 选用 npu:{best_id}")
        return best_id
    except Exception:
        return 0


def _detect_device():
    """自动检测最佳可用设备并返回诊断信息。
    返回: (torch.device, diagnostic_dict)

    diagnostic_dict 包含:
      - hardware: _probe_hardware() 的原始结果
      - detected: 系统层探测到的加速器列表
      - selected: 最终选用的设备类型字符串
      - usable: torch 层确认可用的加速器列表
      - warnings: 诊断警告（如"有 NPU 硬件但缺 torch-npu"）
      - messages: 完整状态消息列表
    """
    import torch

    hw = _probe_hardware()
    detected = [k for k in ("cuda", "npu", "mps") if hw[k]["detected"]]
    usable: list[str] = []
    warnings: list[str] = []
    messages: list[str] = []

    # ── 1. CUDA ──
    cuda_ok = torch.cuda.is_available()
    if cuda_ok:
        usable.append("cuda")
        hw["cuda"]["ready"] = True
        name = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else "GPU"
        messages.append(f"✓ CUDA 可用 — {name}")
        device = torch.device("cuda")
    else:
        if hw["cuda"]["detected"]:
            warnings.append(
                f"检测到 NVIDIA GPU 硬件但 PyTorch CUDA 不可用。"
                f"请确认已安装 CUDA 版 PyTorch: {hw['cuda']['install_hint']}"
            )
        # ── 2. MPS (macOS) ──
        mps_ok = (
            hasattr(torch, "backends")
            and hasattr(torch.backends, "mps")
            and torch.backends.mps.is_available()
        )
        if mps_ok:
            usable.append("mps")
            hw["mps"]["ready"] = True
            messages.append("✓ Apple MPS 可用")
            device = torch.device("mps")
        else:
                    # ── 3. NPU (Ascend) ──
            # 先尝试导入 torch_npu 来注册 NPU 后端（Ascend 系统必需此步骤）
            try:
                import torch_npu
            except ImportError:
                pass
            npu_ok = False
            try:
                if hasattr(torch, "npu") and torch.npu.is_available():
                    npu_ok = True
            except Exception:
                pass
            if npu_ok:
                usable.append("npu")
                hw["npu"]["ready"] = True
                # 多卡 NPU：检测空闲卡，优先使用使用率最低的
                npu_idx = _pick_idle_npu()
                device = torch.device(f"npu:{npu_idx}")
                try:
                    name = torch.npu.get_device_name(npu_idx)
                except Exception:
                    name = f"Ascend NPU #{npu_idx}"
                messages.append(f"✓ 华为昇腾 NPU 可用 — {name} (npu:{npu_idx})")
            else:
                # ── 4. CPU（兜底）+ 诊断 ──
                if hw["npu"]["detected"]:
                    warnings.append(
                        f"⚠️ 检测到华为昇腾 NPU 硬件，但 torch-npu 未安装或不可用。"
                        f"{hw['npu']['install_hint']}"
                    )
                if hw["cuda"]["detected"] and not cuda_ok:
                    pass  # CUDA 警告已在上面添加
                if not detected:
                    messages.append("未检测到 GPU/NPU 加速器")
                messages.append("使用 CPU 进行训练")
                device = torch.device("cpu")

    diag = {
        "hardware": hw,
        "detected": detected,
        "selected": device.type,
        "usable": usable,
        "warnings": warnings,
        "messages": messages,
    }
    return device, diag


class MNISTRunner:
    def __init__(self):
        self._transform = None

    def _get_transform(self):
        if self._transform is None:
            from torchvision import transforms

            self._transform = transforms.Compose(
                [transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))]
            )
        return self._transform

    @staticmethod
    def _build_optimizer(model, hp: dict):
        import torch.optim as optim

        opt_type = hp.get("optimizer", "SGD").upper()
        lr = hp.get("learning_rate", 0.01)
        if opt_type == "ADAM":
            return optim.Adam(model.parameters(), lr=lr)
        elif opt_type == "RMSPROP":
            return optim.RMSprop(model.parameters(), lr=lr)
        else:
            return optim.SGD(
                model.parameters(), lr=lr, momentum=hp.get("momentum", 0.9)
            )

    @staticmethod
    def _sample_device_utilization(device) -> dict:
        """采集真实设备使用率（内存 + 计算），跨 CUDA/NPU/MPS/CPU 兼容。
        返回 dict 含 memory_util/compute_util 等字段，采集失败返回 {}。"""
        import torch

        result: dict = {}
        try:
            if device.type == "cuda":
                # ── CUDA: 内置内存统计 + nvidia-smi 计算利用率（若可用）──
                allocated = torch.cuda.memory_allocated(device)
                total = torch.cuda.get_device_properties(device).total_memory
                result["memory_util"] = round(allocated / total * 100, 1)
                result["memory_allocated_mb"] = round(allocated / 1024 / 1024, 1)
                result["memory_total_mb"] = round(total / 1024 / 1024, 1)

                # 尝试通过 nvidia-smi 获取 GPU 计算利用率（首次调用较慢，约 50ms）
                if not hasattr(MNISTRunner, "_nvsmi_ok"):
                    try:
                        import subprocess
                        r = subprocess.run(
                            ["nvidia-smi", "--query-gpu=utilization.gpu",
                             "--format=csv,noheader,nounits",
                             f"--id={device.index or 0}"],
                            capture_output=True, text=True, timeout=2,
                        )
                        MNISTRunner._nvsmi_ok = (r.returncode == 0)
                    except Exception:
                        MNISTRunner._nvsmi_ok = False

                if MNISTRunner._nvsmi_ok:
                    try:
                        import subprocess
                        r = subprocess.run(
                            ["nvidia-smi", "--query-gpu=utilization.gpu",
                             "--format=csv,noheader,nounits",
                             f"--id={device.index or 0}"],
                            capture_output=True, text=True, timeout=1,
                        )
                        if r.returncode == 0:
                            result["compute_util"] = float(r.stdout.strip())
                    except Exception:
                        pass

            elif device.type == "npu":
                # ── NPU (华为 Ascend): torch.npu 内存统计 ──
                try:
                    # 确保 torch_npu 已导入（直接调用时可能尚未导入）
                    try:
                        import torch_npu
                    except ImportError:
                        pass
                    allocated = torch.npu.memory_allocated(device)
                    total = torch.npu.get_device_properties(device).total_memory
                    result["memory_util"] = round(allocated / total * 100, 1)
                    result["memory_allocated_mb"] = round(allocated / 1024 / 1024, 1)
                    result["memory_total_mb"] = round(total / 1024 / 1024, 1)
                except Exception:
                    pass

                # 尝试通过 npu-smi 获取 NPU 计算利用率
                if not hasattr(MNISTRunner, "_npu_smi_ok"):
                    try:
                        import subprocess
                        r = subprocess.run(
                            ["npu-smi", "info", "-t", "usg", "-i", "0"],
                            capture_output=True, text=True, timeout=2,
                        )
                        MNISTRunner._npu_smi_ok = (r.returncode == 0)
                    except Exception:
                        MNISTRunner._npu_smi_ok = False

                if MNISTRunner._npu_smi_ok:
                    try:
                        import subprocess
                        r = subprocess.run(
                            ["npu-smi", "info", "-t", "usg", "-i", "0"],
                            capture_output=True, text=True, timeout=1,
                        )
                        if r.returncode == 0:
                            import re
                            m = re.search(r"(\d+)", r.stdout)
                            if m:
                                result["compute_util"] = float(m.group(1))
                    except Exception:
                        pass

            elif device.type == "mps":
                # ── Apple MPS: 内存统计 ──
                try:
                    allocated = torch.mps.current_allocated_memory()
                    driver = torch.mps.driver_allocated_memory()
                    if driver > 0:
                        result["memory_util"] = round(allocated / driver * 100, 1)
                        result["memory_allocated_mb"] = round(allocated / 1024 / 1024, 1)
                except Exception:
                    pass

            elif device.type == "cpu":
                # ── CPU: psutil 计算利用率 ──
                try:
                    import psutil
                    result["compute_util"] = round(psutil.cpu_percent(interval=0.0), 1)
                except Exception:
                    pass

        except Exception:
            pass

        return result

    def run_stream(self, config: dict):
        try:
            import numpy as np
            import torch
            # 在 NPU (Ascend) 系统上，必须先导入 torch_npu 注册后端，
            # 否则 torch.nn / torch.cuda 等子模块可能无法正常工作
            try:
                import torch_npu
            except ImportError:
                pass
            import torch.nn as nn
            from torch.utils.data import DataLoader, random_split
            from torchvision import datasets
        except ModuleNotFoundError as e:
            pkg = getattr(e, "name", str(e))
            # 即使 torch 未安装，也探测一下系统硬件给出更精准的安装建议
            hw = _probe_hardware()
            detected = [k for k in ("cuda", "npu", "mps") if hw[k]["detected"]]
            hints: list[str] = []
            if "npu" in detected:
                hints.append(hw["npu"]["install_hint"])
            if "cuda" in detected:
                hints.append(hw["cuda"]["install_hint"])
            hint_text = "。".join(hints) if hints else "请在 backend/.venv 中执行: pip install torch torchvision numpy"

            yield {
                "type": "device_info",
                "device": "none",
                "selected": "none",
                "detected": detected,
                "usable": [],
                "warnings": [f"缺少依赖包: {pkg}"],
                "messages": [f"缺少依赖包: {pkg}。{hint_text}"],
                "hardware": {
                    k: {kk: vv for kk, vv in v.items() if kk in ("type", "label", "detected", "ready", "message", "install_hint")}
                    for k, v in hw.items()
                },
            }
            yield {
                "type": "error",
                "message": f"缺少依赖包: {pkg}。{hint_text}",
            }
            return

        from app.core.mnist.architectures import build_model, get_architecture

        arch_config = config.get("architecture", {})
        arch_id = arch_config.get("id") if isinstance(arch_config, dict) else None
        if arch_id:
            arch_config = get_architecture(arch_id)
            if arch_config is None:
                yield {"type": "error", "message": f"未知架构: {arch_id}"}
                return

        hp = config.get("hyperparameters", {})
        seed = config.get("seed", 42)
        max_test_samples = config.get("max_test_samples", 10000)

        torch.manual_seed(seed)
        np.random.seed(seed)

        device, device_diag = _detect_device()
        epochs = hp.get("epochs", 10)
        batch_size = hp.get("batch_size", 64)
        transform = self._get_transform()

        _train_log.info("=" * 50)
        _train_log.info(f"训练启动: arch={arch_config.get('name','?')} epochs={epochs} batch={batch_size}")
        _train_log.info(f"设备检测: selected={device_diag['selected']} detected={device_diag['detected']} usable={device_diag['usable']}")
        _train_log.info(f"设备警告: {device_diag['warnings']}")
        _train_log.info(f"设备消息: {device_diag['messages']}")

        # ── NPU 诊断：打印 torch_npu 版本和可用设备数 ──
        if device.type == "npu":
            _train_log.info(f"NPU 模式激活，device={device}")
            try:
                _train_log.info(
                    f"NPU device_count={torch.npu.device_count()}, "
                    f"device_name={torch.npu.get_device_name(0) if torch.npu.device_count()>0 else 'N/A'}"
                )
            except Exception as e:
                _train_log.error(f"NPU 设备查询失败: {e}")

        # ── 设备诊断信息 ──
        yield {
            "type": "device_info",
            "device": str(device),
            "selected": device_diag["selected"],
            "detected": device_diag["detected"],
            "usable": device_diag["usable"],
            "warnings": device_diag["warnings"],
            "messages": device_diag["messages"],
            "hardware": {
                k: {kk: vv for kk, vv in v.items() if kk in ("type", "label", "detected", "ready", "message", "install_hint")}
                for k, v in device_diag["hardware"].items()
            },
        }

        yield {
            "type": "train_start",
            "architecture": arch_config.get("name", "custom"),
            "hyperparameters": hp,
            "epochs": epochs,
            "device": str(device),
            "message": f"加载 MNIST 数据集... 设备: {device}",
        }

        # 初始设备使用率
        init_util = MNISTRunner._sample_device_utilization(device)
        if init_util:
            yield {"type": "device_util", "epoch": 0, "total_epochs": epochs,
                   "device": str(device), **init_util}
            _train_log.info(f"初始设备使用率: {init_util}")

        # ── 数据加载 ──
        _train_log.info("加载 MNIST 数据集...")
        try:
            full_dataset = datasets.MNIST(
                root="./data", train=True, download=True, transform=transform
            )
            test_dataset = datasets.MNIST(
                root="./data", train=False, download=True, transform=transform
            )
            _train_log.info(f"数据集加载完成: train={len(full_dataset)}, test={len(test_dataset)}")
        except Exception as e:
            _train_log.error(f"MNIST 数据加载失败: {e}", exc_info=True)
            yield {"type": "error", "message": f"MNIST 数据加载失败: {str(e)}"}
            return

        train_size = int(0.9 * len(full_dataset))
        train_dataset, val_dataset = random_split(
            full_dataset, [train_size, len(full_dataset) - train_size]
        )

        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)

        # ── 模型构建 + 移动到设备 ──
        _train_log.info(f"构建模型 {arch_config.get('name','?')} → 移动到 {device}...")
        try:
            model = build_model(arch_config)
            _train_log.info(f"模型构建完成, 参数量: {sum(p.numel() for p in model.parameters())}")
            model = model.to(device)
            _train_log.info(f"模型已移动到 {device}")
        except Exception as e:
            _train_log.error(f"模型构建/移动到设备失败: {e}", exc_info=True)
            yield {"type": "error", "message": f"模型构建失败: {str(e)}。设备={device}，请确认 torch 已正确安装并支持该设备。"}
            return

        # ── 训练整段包裹在 try/except 中，捕获 NPU 运行时错误 ──
        try:
            optimizer = self._build_optimizer(model, hp)
            criterion = nn.CrossEntropyLoss()

            train_losses, train_accs = [], []
            val_losses, val_accs = [], []
            best_val_acc = 0.0
            best_epoch = 0
            start_time = time.time()

            _train_log.info(f"开始训练循环 epochs={epochs}...")
            for epoch in range(epochs):
                yield {
                    "type": "epoch_start",
                    "epoch": epoch + 1,
                    "total_epochs": epochs,
                    "message": f"Epoch {epoch + 1}/{epochs} 训练中...",
                }
                model.train()
                train_loss, train_correct, train_total = 0.0, 0, 0
                total_batches = len(train_loader)
                last_progress_time = time.time()
                for batch_idx, (data, target) in enumerate(train_loader):
                    try:
                        data, target = data.to(device), target.to(device)
                    except Exception as e:
                        _train_log.error(f"Epoch {epoch+1} batch {batch_idx}: data.to({device}) 失败: {e}")
                        raise
                    optimizer.zero_grad()
                    output = model(data)
                    loss = criterion(output, target)
                    loss.backward()
                    optimizer.step()
                    train_loss += loss.item() * data.size(0)
                    _, predicted = output.max(1)
                    train_total += target.size(0)
                    train_correct += predicted.eq(target).sum().item()

                    # 每 ~200 batch 或 2 秒发送一次进度，避免前端以为卡住
                    if batch_idx > 0 and (
                        batch_idx % 200 == 0
                        or time.time() - last_progress_time > 2.0
                    ):
                        yield {
                            "type": "batch_progress",
                            "epoch": epoch + 1,
                            "total_epochs": epochs,
                            "batch": batch_idx,
                            "total_batches": total_batches,
                            "current_loss": round(loss.item(), 4),
                            "current_acc": round(
                                train_correct / train_total, 4
                            ) if train_total > 0 else 0,
                        }
                        last_progress_time = time.time()

                    if epoch == 0 and batch_idx == 0:
                        _train_log.info(
                            f"第一个 batch 完成: device={device}, "
                            f"data.device={data.device}, loss={loss.item():.4f}"
                        )

                train_loss_avg = train_loss / train_total
                train_acc_avg = train_correct / train_total

                model.eval()
                val_loss, val_correct, val_total = 0.0, 0, 0
                with torch.no_grad():
                    for data, target in val_loader:
                        data, target = data.to(device), target.to(device)
                        output = model(data)
                        val_loss += criterion(output, target).item() * data.size(0)
                        _, predicted = output.max(1)
                        val_total += target.size(0)
                        val_correct += predicted.eq(target).sum().item()

                val_loss_avg = val_loss / val_total
                val_acc_avg = val_correct / val_total
                train_losses.append(round(train_loss_avg, 4))
                train_accs.append(round(train_acc_avg, 4))
                val_losses.append(round(val_loss_avg, 4))
                val_accs.append(round(val_acc_avg, 4))

                if val_acc_avg > best_val_acc:
                    best_val_acc = val_acc_avg
                    best_epoch = epoch + 1
                    best_model_state = {
                        k: v.cpu().clone() for k, v in model.state_dict().items()
                    }

                yield {
                    "type": "epoch_end", "epoch": epoch + 1, "total_epochs": epochs,
                    "train_loss": round(train_loss_avg, 4), "train_acc": round(train_acc_avg, 4),
                    "val_loss": round(val_loss_avg, 4), "val_acc": round(val_acc_avg, 4),
                    "message": (
                        f"Epoch {epoch+1}/{epochs}: train_loss={train_loss_avg:.4f} "
                        f"train_acc={train_acc_avg*100:.1f}% val_acc={val_acc_avg*100:.1f}%"
                    ),
                }
                # 每 epoch 后采样真实设备使用率
                dev_util = MNISTRunner._sample_device_utilization(device)
                if dev_util:
                    yield {"type": "device_util", "epoch": epoch + 1,
                           "total_epochs": epochs, "device": str(device), **dev_util}

        except Exception as e:
            _train_log.error(f"训练循环崩溃: {e}", exc_info=True)
            yield {
                "type": "error",
                "message": (
                    f"训练异常 (设备={device}): {str(e)[:300]}。"
                    f"请检查 backend/logs/mnist_errors.log 查看完整堆栈。"
                ),
            }
            return

        # ── 最终测试：混淆矩阵 + 错误案例 ──
        if best_epoch > 0:
            model.load_state_dict(best_model_state)
        model.eval()
        test_correct, test_total, test_loss = 0, 0, 0.0
        confusion = np.zeros((10, 10), dtype=int)
        error_cases: list[dict] = []
        error_by_label: dict[int, list[dict]] = {d: [] for d in range(10)}
        sample_count = 0

        with torch.no_grad():
            for data, target in test_loader:
                if sample_count >= max_test_samples:
                    break
                data, target = data.to(device), target.to(device)
                output = model(data)
                test_loss += criterion(output, target).item() * data.size(0)
                _, predicted = output.max(1)
                test_total += target.size(0)
                test_correct += predicted.eq(target).sum().item()
                for i, (t, p) in enumerate(
                    zip(target.cpu().numpy(), predicted.cpu().numpy())
                ):
                    confusion[t, p] += 1
                    sample_count += 1
                    if t != p and len(error_by_label[int(t)]) < 3:
                        error_by_label[int(t)].append(
                            {
                                "true_label": int(t),
                                "predicted_label": int(p),
                                "image": data[i].cpu().squeeze().tolist(),
                            }
                        )
                    if sample_count >= max_test_samples:
                        break

        # 合并错误案例，每个数字最多3个
        for d in range(10):
            error_cases.extend(error_by_label[d])

        test_acc = test_correct / test_total
        overfitting = train_accs[-1] - test_acc
        training_time = round(time.time() - start_time, 1)

        _train_log.info(
            f"训练完成: test_acc={test_acc*100:.1f}% overfitting={overfitting*100:.1f}% "
            f"time={training_time}s best_epoch={best_epoch}"
        )

        yield {
            "type": "train_done",
            "test_acc": round(test_acc, 4),
            "test_loss": round(test_loss / test_total, 4),
            "best_epoch": best_epoch,
            "best_val_acc": round(best_val_acc, 4),
            "overfitting_score": round(overfitting, 4),
            "training_time": training_time,
            "message": f"训练完成! 测试准确率 {test_acc*100:.1f}% (最佳epoch: {best_epoch})",
        }
        # 训练完成后的设备使用率快照
        done_util = MNISTRunner._sample_device_utilization(device)
        if done_util:
            yield {"type": "device_util", "epoch": epochs, "total_epochs": epochs,
                   "device": str(device), **done_util}

        # ── 识别演示：随机选 8 个测试样本 ──
        demo_samples = []
        rng_demo = __import__("random").Random(seed + 555)
        demo_indices = rng_demo.sample(range(len(test_dataset)), min(8, len(test_dataset)))
        for idx in demo_indices:
            img, lbl = test_dataset[idx]
            with __import__("torch").no_grad():
                out = model(img.unsqueeze(0).to(device))
                _, pred = out.max(1)
            demo_samples.append({
                "image": img.squeeze().tolist(),
                "true_label": int(lbl),
                "predicted_label": int(pred.item()),
                "correct": int(lbl) == int(pred.item()),
            })
        yield {
            "type": "recog_demo",
            "samples": demo_samples,
            "accuracy": f"{sum(1 for s in demo_samples if s['correct'])}/{len(demo_samples)}",
            "message": f"识别演示: {sum(1 for s in demo_samples if s['correct'])}/{len(demo_samples)} 正确",
        }

        # ── 保存用户训练模型（必须在 done 事件之前，因为 SSE 收到 done 后会退出循环）──
        session_id = config.get("session_id")
        if session_id and best_epoch > 0 and best_model_state:
            try:
                from app.core.mnist.model_manager import ModelManager
                ModelManager.get_instance().save_user_model(
                    int(session_id), best_model_state, arch_config
                )
                _train_log.info(f"用户模型已保存 session={session_id}")
            except Exception as e:
                _train_log.error(f"保存用户模型失败 session={session_id}: {e}", exc_info=True)

        result = {
            "status": "COMPLETED",
            "summary": {
                "final_train_accuracy": round(train_accs[-1], 3),
                "final_test_accuracy": round(test_acc, 3),
                "best_epoch": best_epoch,
                "best_val_accuracy": round(best_val_acc, 3),
                "training_time": training_time,
                "overfitting_score": round(overfitting, 3),
            },
            "runs": [
                {
                    "run_id": f"mnist-{seed}",
                    "seed": seed,
                    "architecture": arch_config,
                    "hyperparameters": hp,
                    "device": str(device),
                    "metrics": {
                        "train_loss": train_losses,
                        "train_acc": train_accs,
                        "val_loss": val_losses,
                        "val_acc": val_accs,
                        "test_loss": round(test_loss / test_total, 4),
                        "test_acc": round(test_acc, 4),
                    },
                    "confusion_matrix": confusion.tolist(),
                    "error_cases": error_cases,
                    "runtime_ms": round(training_time * 1000),
                }
            ],
            "total_runs": 1,
        }
        yield {
            "type": "done",
            **result,
            "message": f"实验完成! 最终测试准确率: {test_acc*100:.1f}%",
        }
