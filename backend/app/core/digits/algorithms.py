"""手写数字识别算法 — 复用 shaperecog 算法实现。

所有算法函数签名: (grids_train, labels_train, grid_test) -> label
直接复用 shaperecog.algorithms 中的实现，不重复编码。
仅 random_classify 需要覆盖为数字版本。
"""
import random
from app.core.shaperecog.algorithms import (
    template_match,
    pixel_knn_classify,
    feature_classify,
    decision_tree_classify,
    mlp_classify,
    cnn_classify,
)
from .digits import DIGITS


def _random_classify(_grids_train: list, _labels_train: list, _grid_test: list) -> int:
    """随机基线 — 数字版：从 0-9 中随机选择。"""
    return random.choice(DIGITS)


ALGORITHMS = {
    "TEMPLATE": template_match,
    "PIXEL_KNN": pixel_knn_classify,
    "FEATURE": feature_classify,
    "DECISION_TREE": decision_tree_classify,
    "MLP": mlp_classify,
    "CNN": cnn_classify,
    "RANDOM": _random_classify,
}

ALGO_LABELS = {
    "TEMPLATE": "模板匹配", "PIXEL_KNN": "像素KNN", "FEATURE": "特征分类",
    "DECISION_TREE": "决策树", "MLP": "MLP", "CNN": "小型CNN", "RANDOM": "随机基线",
}
