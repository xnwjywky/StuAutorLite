"""图形识别算法 — Template Matching / Pixel KNN / Feature-based / Random"""
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


ALGORITHMS = {
    "TEMPLATE": template_match,
    "PIXEL_KNN": pixel_knn_classify,
    "FEATURE": feature_classify,
    "RANDOM": random_classify,
}

ALGO_LABELS = {
    "TEMPLATE": "模板匹配", "PIXEL_KNN": "像素KNN", "FEATURE": "特征分类", "RANDOM": "随机基线",
}
