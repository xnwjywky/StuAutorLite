"""图形识别算法 — Template Matching / Pixel KNN / Feature-based / Decision Tree / MLP / CNN / Random"""
import random, math
from .shapes import generate_shape, SHAPES, SIZE


def _grid_to_vector(grid: list[list[int]]) -> list[int]:
    return [cell for row in grid for cell in row]


def _match_score(a: list[list[int]], b: list[list[int]]) -> int:
    """计算两个网格的匹配像素数（越高越好）。"""
    score = 0
    for y in range(SIZE):
        for x in range(SIZE):
            if a[y][x] == b[y][x]:
                score += 1
    return score


def _extract_features(grid: list[list[int]]) -> list[float]:
    """提取简单几何特征：边缘像素数、宽高比、质心偏移、对称性。"""
    xs, ys, count = [], [], 0
    for y in range(SIZE):
        for x in range(SIZE):
            if grid[y][x]:
                xs.append(x); ys.append(y); count += 1
    if count == 0:
        return [0, 0, 0, 0]
    cx = sum(xs) / count
    cy = sum(ys) / count
    width = max(xs) - min(xs) + 1
    height = max(ys) - min(ys) + 1
    aspect = width / max(height, 1)
    center_offset = math.hypot(cx - SIZE / 2, cy - SIZE / 2) / SIZE
    # 对称性: 比较左右翻转后的匹配度
    sym = sum(1 for y in range(SIZE) for x in range(SIZE // 2) if grid[y][x] == grid[y][SIZE - 1 - x]) / max(SIZE * SIZE / 2, 1)
    density = count / (SIZE * SIZE)
    return [count / 100.0, aspect, center_offset, sym, density]


# ── 算法实现 ─────────────────────────────────────────────

def template_match(grids_train: list, labels_train: list, grid_test: list) -> str:
    """模板匹配：训练集中每个形状取一个干净模板，选匹配分数最高的。"""
    # 构建模板：各类别第一个样本作为模板
    templates = {}
    for g, l in zip(grids_train, labels_train):
        if l not in templates:
            templates[l] = g
        if len(templates) >= len(SHAPES):
            break
    best_label, best_score = "unknown", -1
    for label, tmpl in templates.items():
        s = _match_score(tmpl, grid_test)
        if s > best_score:
            best_score = s
            best_label = label
    return best_label


def pixel_knn_classify(grids_train: list, labels_train: list, grid_test: list) -> str:
    """Raw Pixel KNN: 扁平化网格，欧氏距离，K=3 投票。"""
    k = 3
    vec_test = _grid_to_vector(grid_test)
    dists = [(math.dist(vec_test, _grid_to_vector(g)), l) for g, l in zip(grids_train, labels_train)]
    dists.sort(key=lambda d: d[0])
    votes = {}
    for _, l in dists[:k]:
        votes[l] = votes.get(l, 0) + 1
    return max(votes, key=votes.get)


def feature_classify(grids_train: list, labels_train: list, grid_test: list) -> str:
    """基于特征: 提取几何特征 → KNN=3 分类。"""
    k = 3
    feat_train = [(l, _extract_features(g)) for g, l in zip(grids_train, labels_train)]
    feat_test = _extract_features(grid_test)
    dists = [(math.dist(ft, feat_test), l) for l, ft in feat_train]
    dists.sort(key=lambda d: d[0])
    votes = {}
    for _, l in dists[:k]:
        votes[l] = votes.get(l, 0) + 1
    return max(votes, key=votes.get)


def random_classify(_grids_train: list, _labels_train: list, _grid_test: list) -> str:
    """随机基线。"""
    return random.choice(SHAPES)


# ═══════════════════════════════════════════════════════════════
# 决策树分类器（纯 Python）
# ═══════════════════════════════════════════════════════════════

def _gini(y: list) -> float:
    """计算 Gini 不纯度。"""
    total = len(y)
    counts = {}
    for lbl in y:
        counts[lbl] = counts.get(lbl, 0) + 1
    return 1.0 - sum((c / total) ** 2 for c in counts.values())


def _build_tree(X: list, y: list, depth: int, max_depth: int, min_samples: int) -> dict:
    """递归构建决策树节点。"""
    # 终止条件：纯节点 / 深度达到上限 / 样本太少
    if depth >= max_depth or len(set(y)) == 1 or len(y) < min_samples:
        return {"leaf": True, "class": max(set(y), key=y.count)}

    n_features = len(X[0])
    best_gini = float("inf")
    best_feat, best_thresh = -1, 0
    best_left_idx = []

    # 随机选 sqrt(n_features) 个特征来加速
    feats = random.sample(range(n_features), max(1, int(n_features ** 0.5)))
    for f in feats:
        vals = sorted({xi[f] for xi in X})
        if len(vals) < 2:
            continue
        # 采样候选分裂点（加速）
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

    # 分裂
    left_X, left_y, right_X, right_y = [], [], [], []
    for xi, yi in zip(X, y):
        if xi[best_feat] <= best_thresh:
            left_X.append(xi); left_y.append(yi)
        else:
            right_X.append(xi); right_y.append(yi)

    return {
        "leaf": False,
        "feature": best_feat,
        "threshold": best_thresh,
        "class": max(set(y), key=y.count),
        "left": _build_tree(left_X, left_y, depth + 1, max_depth, min_samples),
        "right": _build_tree(right_X, right_y, depth + 1, max_depth, min_samples),
    }


def _tree_predict(node: dict, x: list) -> str:
    """决策树推理。"""
    while not node.get("leaf", False):
        if x[node["feature"]] <= node["threshold"]:
            node = node["left"]
        else:
            node = node["right"]
    return node["class"]


def decision_tree_classify(grids_train: list, labels_train: list, grid_test: list) -> str:
    """决策树: 像素向量 → Gini 分裂 → 投票分类。max_depth=8, sqrt 特征采样加速。"""
    vecs = [_grid_to_vector(g) for g in grids_train]
    vec_test = _grid_to_vector(grid_test)
    tree = _build_tree(vecs, labels_train, 0, max_depth=8, min_samples=3)
    return _tree_predict(tree, vec_test)


# ═══════════════════════════════════════════════════════════════
# MLP 分类器（纯 Python，单隐藏层）
# ═══════════════════════════════════════════════════════════════

def _relu(x):
    return max(0.0, x)


def _softmax(logits: list[float]) -> list[float]:
    mx = max(logits)
    exps = [math.exp(z - mx) for z in logits]
    total = sum(exps)
    return [e / total for e in exps]


def _mlp_train(X: list, y: list, hidden: int, lr: float, epochs: int, batch_size: int):
    """训练单隐藏层 MLP，返回权重。"""
    n_features = len(X[0])
    classes = sorted(set(y))
    n_classes = len(classes)
    cls_to_idx = {c: i for i, c in enumerate(classes)}

    # Xavier 初始化
    r1 = math.sqrt(6.0 / (n_features + hidden))
    w1 = [[random.uniform(-r1, r1) for _ in range(n_features)] for _ in range(hidden)]
    b1 = [0.0] * hidden
    r2 = math.sqrt(6.0 / (hidden + n_classes))
    w2 = [[random.uniform(-r2, r2) for _ in range(hidden)] for _ in range(n_classes)]
    b2 = [0.0] * n_classes

    n = len(X)
    for epoch in range(epochs):
        # Mini-batch SGD
        indices = list(range(n))
        random.shuffle(indices)
        for start in range(0, n, batch_size):
            batch_idx = indices[start:start + batch_size]
            # 累积梯度
            dw1 = [[0.0] * n_features for _ in range(hidden)]
            db1 = [0.0] * hidden
            dw2 = [[0.0] * hidden for _ in range(n_classes)]
            db2 = [0.0] * n_classes
            bs = len(batch_idx)

            for idx in batch_idx:
                xi = X[idx]
                # ── Forward ──
                h = [_relu(sum(w1[j][k] * xi[k] for k in range(n_features)) + b1[j]) for j in range(hidden)]
                logits = [sum(w2[c][j] * h[j] for j in range(hidden)) + b2[c] for c in range(n_classes)]
                probs = _softmax(logits)
                target = cls_to_idx[y[idx]]

                # ── Backward (cross-entropy) ──
                dz2 = [probs[c] - (1.0 if c == target else 0.0) for c in range(n_classes)]
                for c in range(n_classes):
                    for j in range(hidden):
                        dw2[c][j] += dz2[c] * h[j]
                    db2[c] += dz2[c]

                dh = [sum(dz2[c] * w2[c][j] for c in range(n_classes)) * (1.0 if h[j] > 0 else 0.0) for j in range(hidden)]
                for j in range(hidden):
                    for k in range(n_features):
                        dw1[j][k] += dh[j] * xi[k]
                    db1[j] += dh[j]

            # SGD update
            for j in range(hidden):
                for k in range(n_features):
                    w1[j][k] -= lr * dw1[j][k] / bs
                b1[j] -= lr * db1[j] / bs
            for c in range(n_classes):
                for j in range(hidden):
                    w2[c][j] -= lr * dw2[c][j] / bs
                b2[c] -= lr * db2[c] / bs

        # 学习率衰减
        lr *= 0.98

    return {"w1": w1, "b1": b1, "w2": w2, "b2": b2, "classes": classes, "hidden": hidden, "n_features": n_features}


def _mlp_predict(params: dict, x: list) -> str:
    """MLP 推理。"""
    w1, b1, w2, b2 = params["w1"], params["b1"], params["w2"], params["b2"]
    hidden = params["hidden"]
    h = [_relu(sum(w1[j][k] * x[k] for k in range(params["n_features"])) + b1[j]) for j in range(hidden)]
    logits = [sum(w2[c][j] * h[j] for j in range(hidden)) + b2[c] for c in range(len(params["classes"]))]
    probs = _softmax(logits)
    return params["classes"][max(range(len(probs)), key=lambda i: probs[i])]


def mlp_classify(grids_train: list, labels_train: list, grid_test: list) -> str:
    """MLP: 256→64→n_classes，ReLU + Softmax，交叉熵损失，30 epochs SGD。"""
    vecs = [_grid_to_vector(g) for g in grids_train]
    vec_test = _grid_to_vector(grid_test)
    params = _mlp_train(vecs, labels_train, hidden=64, lr=0.05, epochs=30, batch_size=16)
    return _mlp_predict(params, vec_test)


# ═══════════════════════════════════════════════════════════════
# 小型 CNN 分类器（纯 Python，1 Conv + Pool + FC）
# ═══════════════════════════════════════════════════════════════

def _conv2d(image: list[list[int]], kernel: list[list[float]], size: int) -> list[list[float]]:
    """2D 卷积（valid padding），输出 size-k+1 的特征图。"""
    k = len(kernel)
    out_size = size - k + 1
    out = [[0.0] * out_size for _ in range(out_size)]
    for y in range(out_size):
        for x in range(out_size):
            s = 0.0
            for ky in range(k):
                for kx in range(k):
                    s += image[y + ky][x + kx] * kernel[ky][kx]
            out[y][x] = s
    return out


def _maxpool2d(fmap: list[list[float]], pool: int) -> list[list[float]]:
    """2D MaxPooling。"""
    fm_size = len(fmap)
    out_size = fm_size // pool
    out = [[0.0] * out_size for _ in range(out_size)]
    for y in range(out_size):
        for x in range(out_size):
            mx = -1e9
            for py in range(pool):
                for px in range(pool):
                    mx = max(mx, fmap[y * pool + py][x * pool + px])
            out[y][x] = mx
    return out


def _cnn_train(grids: list, labels: list, lr: float, epochs: int):
    """训练小型 CNN：1 conv(3×3, 4 filters) → ReLU → 2×2 MaxPool → FC → Softmax。"""
    grid_size = len(grids[0])
    classes = sorted(set(labels))
    n_classes = len(classes)
    cls_to_idx = {c: i for i, c in enumerate(classes)}
    n_filters = 4
    k_size = 3
    pool = 2

    conv_out_size = grid_size - k_size + 1  # 14 for 16×16
    pool_out_size = conv_out_size // pool   # 7
    flat_size = n_filters * pool_out_size * pool_out_size  # 196

    # 初始化卷积核和 FC 权重
    r1 = math.sqrt(6.0 / (k_size * k_size + conv_out_size * conv_out_size))
    kernels = [[[random.uniform(-r1, r1) for _ in range(k_size)] for _ in range(k_size)] for _ in range(n_filters)]
    r2 = math.sqrt(6.0 / (flat_size + n_classes))
    fc_w = [[random.uniform(-r2, r2) for _ in range(flat_size)] for _ in range(n_classes)]
    fc_b = [0.0] * n_classes

    n = len(grids)
    for epoch in range(epochs):
        indices = list(range(n))
        random.shuffle(indices)
        correct = 0
        for idx in indices:
            grid = grids[idx]
            # ── Forward ──
            # Conv + ReLU
            fmaps = []
            for f in range(n_filters):
                fm = _conv2d(grid, kernels[f], grid_size)
                # ReLU in-place
                for y in range(conv_out_size):
                    for x in range(conv_out_size):
                        if fm[y][x] < 0:
                            fm[y][x] = 0.0
                fmaps.append(fm)

            # MaxPool
            pooled = []
            for fm in fmaps:
                pooled.append(_maxpool2d(fm, pool))

            # Flatten
            flat = []
            for fm in pooled:
                for row in fm:
                    flat.extend(row)

            # FC + Softmax
            logits = [sum(fc_w[c][i] * flat[i] for i in range(flat_size)) + fc_b[c] for c in range(n_classes)]
            probs = _softmax(logits)

            # ── Backward ──
            target = cls_to_idx[labels[idx]]
            dz = [probs[c] - (1.0 if c == target else 0.0) for c in range(n_classes)]

            # FC grad
            for c in range(n_classes):
                for i in range(flat_size):
                    fc_w[c][i] -= lr * dz[c] * flat[i]
                fc_b[c] -= lr * dz[c]

            # Back through flatten → pooled → conv
            d_flat = [sum(dz[c] * fc_w[c][i] for c in range(n_classes)) for i in range(flat_size)]

            # Reshape to pooled gradients
            d_pooled = []
            pos = 0
            for f in range(n_filters):
                pg = [[0.0] * pool_out_size for _ in range(pool_out_size)]
                for y in range(pool_out_size):
                    for x in range(pool_out_size):
                        pg[y][x] = d_flat[pos]
                        pos += 1
                d_pooled.append(pg)

            # Back through MaxPool (sub-gradient: pass to max position)
            d_conv = [[[0.0] * conv_out_size for _ in range(conv_out_size)] for _ in range(n_filters)]
            for f in range(n_filters):
                fm = fmaps[f]
                for y in range(pool_out_size):
                    for x in range(pool_out_size):
                        mx_val = -1e9
                        mx_py, mx_px = 0, 0
                        for py in range(pool):
                            for px in range(pool):
                                cy = y * pool + py
                                cx = x * pool + px
                                if fm[cy][cx] > mx_val:
                                    mx_val = fm[cy][cx]
                                    mx_py, mx_px = cy, cx
                        d_conv[f][mx_py][mx_px] = d_pooled[f][y][x]

            # Back through Conv to kernel grads
            for f in range(n_filters):
                for ky in range(k_size):
                    for kx in range(k_size):
                        grad = 0.0
                        for y in range(conv_out_size):
                            for x in range(conv_out_size):
                                if fmaps[f][y][x] > 0:  # ReLU grad
                                    grad += d_conv[f][y][x] * grid[y + ky][x + kx]
                        kernels[f][ky][kx] -= lr * grad

            if probs[target] > 0.5:
                correct += 1

        lr *= 0.96  # 衰减

    return {"kernels": kernels, "fc_w": fc_w, "fc_b": fc_b, "classes": classes,
            "n_filters": n_filters, "k_size": k_size, "pool": pool, "grid_size": grid_size}


def _cnn_predict(params: dict, grid: list[list[int]]) -> str:
    """CNN 推理。"""
    kernels = params["kernels"]
    fc_w, fc_b = params["fc_w"], params["fc_b"]
    n_filters = params["n_filters"]
    k_size = params["k_size"]
    pool = params["pool"]
    grid_size = params["grid_size"]
    conv_out_size = grid_size - k_size + 1
    pool_out_size = conv_out_size // pool
    n_classes = len(params["classes"])

    flat = []
    for f in range(n_filters):
        fm = _conv2d(grid, kernels[f], grid_size)
        for y in range(conv_out_size):
            for x in range(conv_out_size):
                if fm[y][x] < 0:
                    fm[y][x] = 0.0
        pooled = _maxpool2d(fm, pool)
        for row in pooled:
            flat.extend(row)

    flat_size = n_filters * pool_out_size * pool_out_size
    logits = [sum(fc_w[c][i] * flat[i] for i in range(flat_size)) + fc_b[c] for c in range(n_classes)]
    probs = _softmax(logits)
    return params["classes"][max(range(n_classes), key=lambda i: probs[i])]


def cnn_classify(grids_train: list, labels_train: list, grid_test: list) -> str:
    """小型CNN: 3×3 conv(4 filters) → ReLU → 2×2 MaxPool → FC → Softmax, 20 epochs SGD。"""
    params = _cnn_train(grids_train, labels_train, lr=0.03, epochs=20)
    return _cnn_predict(params, grid_test)


ALGORITHMS = {
    "TEMPLATE": template_match,
    "PIXEL_KNN": pixel_knn_classify,
    "FEATURE": feature_classify,
    "DECISION_TREE": decision_tree_classify,
    "MLP": mlp_classify,
    "CNN": cnn_classify,
    "RANDOM": random_classify,
}

ALGO_LABELS = {
    "TEMPLATE": "模板匹配", "PIXEL_KNN": "像素KNN", "FEATURE": "特征分类",
    "DECISION_TREE": "决策树", "MLP": "MLP", "CNN": "小型CNN", "RANDOM": "随机基线",
}
