"""MNIST 训练 Runner — PyTorch 实现，epoch 级 SSE 流式输出

设备兼容：自动检测 GPU(CUDA/MPS) > NPU(Ascend) > CPU，优先使用加速设备。
"""
import time
import json


def _detect_device():
    """自动检测最佳可用设备：CUDA > MPS(macOS) > NPU(Ascend) > CPU"""
    import torch
    if torch.cuda.is_available():
        return torch.device("cuda")
    if (
        hasattr(torch, "backends")
        and hasattr(torch.backends, "mps")
        and torch.backends.mps.is_available()
    ):
        return torch.device("mps")
    try:
        if torch.npu.is_available():
            return torch.device("npu")
    except (AttributeError, RuntimeError):
        pass
    return torch.device("cpu")


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

    def run_stream(self, config: dict):
        try:
            import numpy as np
            import torch
            import torch.nn as nn
            from torch.utils.data import DataLoader, random_split
            from torchvision import datasets
        except ModuleNotFoundError as e:
            pkg = getattr(e, "name", str(e))
            yield {
                "type": "error",
                "message": f"缺少依赖包: {pkg}。请在 backend/.venv 中执行: pip install torch torchvision numpy",
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

        device = _detect_device()
        epochs = hp.get("epochs", 10)
        batch_size = hp.get("batch_size", 64)
        transform = self._get_transform()

        yield {
            "type": "train_start",
            "architecture": arch_config.get("name", "custom"),
            "hyperparameters": hp,
            "epochs": epochs,
            "device": str(device),
            "message": f"加载 MNIST 数据集... 设备: {device}",
        }

        try:
            full_dataset = datasets.MNIST(
                root="./data", train=True, download=True, transform=transform
            )
            test_dataset = datasets.MNIST(
                root="./data", train=False, download=True, transform=transform
            )
        except Exception as e:
            yield {"type": "error", "message": f"MNIST 数据加载失败: {str(e)}"}
            return

        train_size = int(0.9 * len(full_dataset))
        train_dataset, val_dataset = random_split(
            full_dataset, [train_size, len(full_dataset) - train_size]
        )

        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)

        try:
            model = build_model(arch_config).to(device)
        except Exception as e:
            yield {"type": "error", "message": f"模型构建失败: {str(e)}"}
            return

        optimizer = self._build_optimizer(model, hp)
        criterion = nn.CrossEntropyLoss()

        train_losses, train_accs = [], []
        val_losses, val_accs = [], []
        best_val_acc = 0.0
        best_epoch = 0
        start_time = time.time()

        for epoch in range(epochs):
            yield {
                "type": "epoch_start",
                "epoch": epoch + 1,
                "total_epochs": epochs,
                "message": f"Epoch {epoch + 1}/{epochs} 训练中...",
            }
            model.train()
            train_loss, train_correct, train_total = 0.0, 0, 0
            for data, target in train_loader:
                data, target = data.to(device), target.to(device)
                optimizer.zero_grad()
                output = model(data)
                loss = criterion(output, target)
                loss.backward()
                optimizer.step()
                train_loss += loss.item() * data.size(0)
                _, predicted = output.max(1)
                train_total += target.size(0)
                train_correct += predicted.eq(target).sum().item()

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
