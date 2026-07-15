"""生成像素级几何图形 — 圆形/正方形/三角形，含可控噪声"""
import random, math

SHAPES = ["circle", "square", "triangle"]
SIZE = 16  # 16x16 像素网格


def generate_shape(shape: str, noise: float = 0.0, seed: int = 0) -> list[list[int]]:
    """返回 SIZE×SIZE 的二值网格 (0=背景, 1=图形)。noise=0 时为完美图形。"""
    rng = random.Random(seed)
    grid = [[0] * SIZE for _ in range(SIZE)]
    cx, cy = SIZE / 2 - 0.5, SIZE / 2 - 0.5
    radius = SIZE / 2 - 2

    if shape == "circle":
        for y in range(SIZE):
            for x in range(SIZE):
                dist = math.hypot(x - cx, y - cy)
                if abs(dist - radius) < 1.2:
                    grid[y][x] = 1
    elif shape == "square":
        margin = 2
        for y in range(margin, SIZE - margin):
            for x in range(margin, SIZE - margin):
                if (y == margin or y == SIZE - margin - 1 or x == margin or x == SIZE - margin - 1):
                    grid[y][x] = 1
    elif shape == "triangle":
        apex_x, apex_y = SIZE / 2 - 0.5, 1.5
        base_y = SIZE - 2.5
        half_base = SIZE / 2 - 1.5
        for y in range(SIZE):
            for x in range(SIZE):
                t = (y - apex_y) / (base_y - apex_y) if base_y != apex_y else 0
                if 0 <= t <= 1:
                    edge_x = apex_x + t * (x - apex_x)
                    left_x = apex_x - half_base * t
                    right_x = apex_x + half_base * t
                    edge_dist = min(abs(x - left_x), abs(x - right_x),
                                    abs(_point_to_line(x, y, apex_x, apex_y, apex_x + half_base, base_y)),
                                    abs(_point_to_line(x, y, apex_x, apex_y, apex_x - half_base, base_y)))
                    if edge_dist < 1.2 and left_x <= x <= right_x:
                        grid[y][x] = 1

    # 加噪声：随机翻转像素
    if noise > 0:
        for y in range(SIZE):
            for x in range(SIZE):
                if rng.random() < noise:
                    grid[y][x] = 1 - grid[y][x]

    return grid


def generate_dataset(n_samples: int = 100, noise: float = 0.0, seed: int = 42) -> dict:
    """生成数据集：随机形状 + 噪声。返回 {grids: list[list[list[int]]], labels: list[str], shapes: list[str]}"""
    rng = random.Random(seed)
    grids, labels = [], []
    for i in range(n_samples):
        shape = rng.choice(SHAPES)
        g = generate_shape(shape, noise, seed + i * 100)
        grids.append(g)
        labels.append(shape)
    return {"grids": grids, "labels": labels, "shape_names": SHAPES}


def _point_to_line(px, py, x1, y1, x2, y2):
    return abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / math.hypot(x2 - x1, y2 - y1)
