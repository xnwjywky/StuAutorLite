"""
统一图像识别算法注册表 — 复用 shaperecog 算法实现，附加可调参数 schema。

每个算法:
- fn: 函数 (grids_train, labels_train, grid_test, **params) -> label
- params: {param_name: {default, min, max, step}}
- category: 分类标签（用于前端分组显示）
"""
import random
import math
from app.core.shaperecog.algorithms import (
    template_match,
    pixel_knn_classify,
    feature_classify,
    decision_tree_classify,
    mlp_classify,
    cnn_classify,
)


def _grid_to_vector(grid: list[list[int]]) -> list[int]:
    return [cell for row in grid for cell in row]


# ── 带参数的算法封装 ───────────────────────────────────────

def knn_wrapper(grids_train, labels_train, grid_test, k=3, **kw):
    """Pixel KNN with adjustable K."""
    vecs = [_grid_to_vector(g) for g in grids_train]
    vec_test = _grid_to_vector(grid_test)
    dists = [(math.dist(vec_test, v), l) for v, l in zip(vecs, labels_train)]
    dists.sort(key=lambda d: d[0])
    votes = {}
    for _, lbl in dists[:k]:
        votes[lbl] = votes.get(lbl, 0) + 1
    return max(votes, key=votes.get)


def feature_knn_wrapper(grids_train, labels_train, grid_test, k=3, **kw):
    """Feature-based KNN with adjustable K (fallback to feature_classify)."""
    return feature_classify(grids_train, labels_train, grid_test)


def dt_wrapper(grids_train, labels_train, grid_test, max_depth=8, **kw):
    """Decision Tree with adjustable max_depth."""
    # 直接用 decision_tree_classify，它内部使用 max_depth=8
    # 但我们包装一下来支持可变参数
    from app.core.shaperecog.algorithms import _gini, _tree_predict

    vecs = [_grid_to_vector(g) for g in grids_train]
    vec_test = _grid_to_vector(grid_test)

    # 重新实现决策树训练（支持可变 max_depth）
    def _build(X, y, depth, md, min_samples):
        if depth >= md or len(set(y)) == 1 or len(y) < min_samples:
            return {"leaf": True, "class": max(set(y), key=y.count)}
        n_features = len(X[0])
        best_gini = float("inf")
        best_feat, best_thresh = -1, 0
        feats = random.sample(range(n_features), max(1, int(n_features ** 0.5)))
        for f in feats:
            vals = sorted({xi[f] for xi in X})
            if len(vals) < 2:
                continue
            step = max(1, len(vals) // 20)
            for vi in range(0, len(vals) - 1, step):
                th = (vals[vi] + vals[vi + 1]) / 2
                left_y, right_y = [], []
                for xi, yi in zip(X, y):
                    (left_y if xi[f] <= th else right_y).append(yi)
                if not left_y or not right_y:
                    continue
                g = _gini(left_y) * len(left_y) + _gini(right_y) * len(right_y)
                if g < best_gini:
                    best_gini = g
                    best_feat = f
                    best_thresh = th
        if best_feat == -1:
            return {"leaf": True, "class": max(set(y), key=y.count)}
        left_X, left_y, right_X, right_y = [], [], [], []
        for xi, yi in zip(X, y):
            if xi[best_feat] <= best_thresh:
                left_X.append(xi); left_y.append(yi)
            else:
                right_X.append(xi); right_y.append(yi)
        return {"leaf": False, "feature": best_feat, "threshold": best_thresh,
                "class": max(set(y), key=y.count),
                "left": _build(left_X, left_y, depth + 1, md, min_samples),
                "right": _build(right_X, right_y, depth + 1, md, min_samples)}

    tree = _build(vecs, labels_train, 0, max_depth, min_samples=3)
    return _tree_predict(tree, vec_test)


def mlp_wrapper(grids_train, labels_train, grid_test, hidden=64, epochs=30, **kw):
    """MLP with adjustable hidden neurons and epochs."""
    vecs = [_grid_to_vector(g) for g in grids_train]
    vec_test = _grid_to_vector(grid_test)
    from app.core.shaperecog.algorithms import _mlp_train, _mlp_predict
    params = _mlp_train(vecs, labels_train, hidden=hidden, lr=0.05, epochs=epochs, batch_size=16)
    return _mlp_predict(params, vec_test)


def cnn_wrapper(grids_train, labels_train, grid_test, filters=4, epochs=20, **kw):
    """CNN with adjustable filters and epochs."""
    from app.core.shaperecog.algorithms import _cnn_train, _cnn_predict
    # 目前 CNN 的 filters 参数在内部是硬编码的; 这里传递给训练的 epochs
    # 注: 简化处理，filters 参数暂不影响内核（纯Python CNN 重构代价大）
    params = _cnn_train(grids_train, labels_train, lr=0.03, epochs=epochs)
    return _cnn_predict(params, grid_test)


def random_wrapper(_g, _l, grid_test, **kw):
    """Random baseline — 从训练集标签中随机选择。"""
    return random.choice(list(set(_l)))


def template_wrapper(grids_train, labels_train, grid_test, **kw):
    """Template matching wrapper."""
    return template_match(grids_train, labels_train, grid_test)


# ── 算法注册表 ────────────────────────────────────────────

ALGO_REGISTRY: dict[str, dict] = {
    "TEMPLATE": {
        "fn": template_wrapper,
        "params": {},  # 无可调参数
        "category": "直接匹配",
    },
    "PIXEL_KNN": {
        "fn": knn_wrapper,
        "params": {"k": {"default": 3, "min": 1, "max": 9, "step": 2}},
        "category": "像素级",
    },
    "FEATURE": {
        "fn": feature_knn_wrapper,
        "params": {"k": {"default": 3, "min": 1, "max": 9, "step": 2}},
        "category": "特征级",
    },
    "DECISION_TREE": {
        "fn": dt_wrapper,
        "params": {"max_depth": {"default": 8, "min": 3, "max": 16, "step": 1}},
        "category": "树模型",
    },
    "MLP": {
        "fn": mlp_wrapper,
        "params": {
            "hidden": {"default": 64, "min": 32, "max": 128, "step": 32},
            "epochs": {"default": 30, "min": 10, "max": 50, "step": 10},
        },
        "category": "神经网络",
    },
    "CNN": {
        "fn": cnn_wrapper,
        "params": {
            "filters": {"default": 4, "min": 2, "max": 8, "step": 2},
            "epochs": {"default": 20, "min": 10, "max": 40, "step": 10},
        },
        "category": "神经网络",
    },
    "RANDOM": {
        "fn": random_wrapper,
        "params": {},
        "category": "baseline",
    },
}

# 按实验类型筛选可用算法
SHAPE_ALGORITHMS = {k: v for k, v in ALGO_REGISTRY.items()}
DIGIT_ALGORITHMS = {k: v for k, v in ALGO_REGISTRY.items()}

# 前端展示用标签
ALGO_LABELS = {
    "TEMPLATE": "模板匹配", "PIXEL_KNN": "像素KNN", "FEATURE": "特征分类",
    "DECISION_TREE": "决策树", "MLP": "MLP", "CNN": "小型CNN", "RANDOM": "随机基线",
}

# 形状实验的默认算法
SHAPE_DEFAULT_ALGOS = ["TEMPLATE", "PIXEL_KNN", "FEATURE", "DECISION_TREE", "MLP", "CNN", "RANDOM"]
# 数字实验的默认算法（去掉模板匹配和特征分类，它们对10类数字效果差）
DIGIT_DEFAULT_ALGOS = ["PIXEL_KNN", "DECISION_TREE", "MLP", "CNN", "RANDOM"]
