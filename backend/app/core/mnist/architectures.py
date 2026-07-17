"""MNIST 预设网络架构 — 4 种：MiniCNN / StandardCNN / DeepCNN / MLP

torch 导入延迟到 build_model() 内，确保模块可无 ML 依赖导入。
"""
from collections import OrderedDict

PRESET_ARCHITECTURES = [
    {
        "id": "minicnn",
        "name": "MiniCNN",
        "description": "极简卷积网络，1个卷积层+1个全连接层，适合入门理解CNN基本原理",
        "layers": [
            {"type": "Conv2d", "params": {"in_channels": 1, "out_channels": 16, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "MaxPool2d", "params": {"kernel_size": 2}},
            {"type": "Flatten"},
            {"type": "Linear", "params": {"in_features": 16 * 14 * 14, "out_features": 10}},
        ],
        "dimensions": "28×28×1 → 28×28×16 → 14×14×16 → 3136 → 10",
    },
    {
        "id": "standardcnn",
        "name": "StandardCNN",
        "description": "标准卷积网络，2层卷积+池化+Dropout，是MNIST最常用的结构",
        "layers": [
            {"type": "Conv2d", "params": {"in_channels": 1, "out_channels": 32, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "MaxPool2d", "params": {"kernel_size": 2}},
            {"type": "Conv2d", "params": {"in_channels": 32, "out_channels": 64, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "MaxPool2d", "params": {"kernel_size": 2}},
            {"type": "Flatten"},
            {"type": "Linear", "params": {"in_features": 64 * 7 * 7, "out_features": 128}},
            {"type": "ReLU"},
            {"type": "Dropout", "params": {"p": 0.25}},
            {"type": "Linear", "params": {"in_features": 128, "out_features": 10}},
        ],
        "dimensions": "28×28×1 → 28×28×32 → 14×14×32 → 14×14×64 → 7×7×64 → 3136 → 128 → 10",
    },
    {
        "id": "deepcnn",
        "name": "DeepCNN",
        "description": "较深的卷积网络，4层卷积，感受野更大，适合研究网络深度对性能的影响",
        "layers": [
            {"type": "Conv2d", "params": {"in_channels": 1, "out_channels": 32, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "Conv2d", "params": {"in_channels": 32, "out_channels": 32, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "MaxPool2d", "params": {"kernel_size": 2}},
            {"type": "Conv2d", "params": {"in_channels": 32, "out_channels": 64, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "Conv2d", "params": {"in_channels": 64, "out_channels": 64, "kernel_size": 3, "padding": 1}},
            {"type": "ReLU"},
            {"type": "MaxPool2d", "params": {"kernel_size": 2}},
            {"type": "Flatten"},
            {"type": "Linear", "params": {"in_features": 64 * 7 * 7, "out_features": 256}},
            {"type": "ReLU"},
            {"type": "Dropout", "params": {"p": 0.5}},
            {"type": "Linear", "params": {"in_features": 256, "out_features": 10}},
        ],
        "dimensions": "28×28×1 → 32×32 → 16×16 → 64×16 → 64×16 → 8×8 → 4096 → 256 → 10",
    },
    {
        "id": "mlp",
        "name": "MLP",
        "description": "纯全连接网络，没有卷积层，用于对比「CNN vs MLP」在图像任务上的差异",
        "layers": [
            {"type": "Flatten"},
            {"type": "Linear", "params": {"in_features": 784, "out_features": 512}},
            {"type": "ReLU"},
            {"type": "Linear", "params": {"in_features": 512, "out_features": 256}},
            {"type": "ReLU"},
            {"type": "Linear", "params": {"in_features": 256, "out_features": 10}},
        ],
        "dimensions": "784 → 512 → 256 → 10",
    },
]


def build_model(architecture: dict):
    """根据架构描述 dict 构建 PyTorch Sequential 模型。延迟导入 torch。"""
    import torch.nn as nn
    layers = []
    conv_count = 0
    relu_count = 0
    pool_count = 0
    fc_count = 0
    dropout_count = 0

    for layer_config in architecture.get("layers", []):
        lt = layer_config["type"]
        params = layer_config.get("params", {})

        if lt == "Conv2d":
            layers.append((f"conv_{conv_count}", nn.Conv2d(**params)))
            conv_count += 1
        elif lt == "ReLU":
            layers.append((f"relu_{relu_count}", nn.ReLU()))
            relu_count += 1
        elif lt == "MaxPool2d":
            layers.append((f"pool_{pool_count}", nn.MaxPool2d(**params)))
            pool_count += 1
        elif lt == "Flatten":
            layers.append(("flatten", nn.Flatten()))
        elif lt == "Linear":
            layers.append((f"fc_{fc_count}", nn.Linear(**params)))
            fc_count += 1
        elif lt == "Dropout":
            layers.append((f"dropout_{dropout_count}", nn.Dropout(**params)))
            dropout_count += 1

    return nn.Sequential(OrderedDict(layers))


def get_architecture(arch_id: str) -> dict | None:
    """根据 ID 获取预设架构。"""
    for arch in PRESET_ARCHITECTURES:
        if arch["id"] == arch_id:
            return arch
    return None
