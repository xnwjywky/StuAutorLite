"""猜数字策略实验 — 二分查找 / 随机 / 线性扫描"""
from .runner import GuessNumberRunner

STRATEGIES = ["BINARY", "RANDOM", "LINEAR"]
STRATEGY_LABELS = {
    "BINARY": "二分查找", "RANDOM": "随机猜测", "LINEAR": "线性扫描",
}
