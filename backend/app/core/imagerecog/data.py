"""
统一图像识别数据生成器 — 图形(shapes) + 经典手写数字(digits)

图形: 复用 shaperecog/shapes.py 的圆形/正方形/三角形生成
数字: 内置经典手写数字模板（16×16像素网格，3种书写风格）

经典数字模板参考 MNIST 风格设计，使用关键像素点坐标描边 + 膨胀生成。
"""
import random
import math

SIZE = 16  # 16×16 像素网格
SHAPES = ["circle", "square", "triangle"]
SHAPE_LABELS = {"circle": "圆形", "square": "正方形", "triangle": "三角形"}

# ── 图形生成（从 shaperecog 复用逻辑）─────────────────────

def _point_to_line(px, py, x1, y1, x2, y2):
    return abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / max(math.hypot(x2 - x1, y2 - y1), 1e-9)


def generate_shape(shape: str, noise: float = 0.0, seed: int = 0) -> list[list[int]]:
    """返回 SIZE×SIZE 的二值网格。"""
    rng = random.Random(seed)
    grid = [[0] * SIZE for _ in range(SIZE)]
    cx, cy = SIZE / 2 - 0.5, SIZE / 2 - 0.5
    radius = SIZE / 2 - 2

    if shape == "circle":
        for y in range(SIZE):
            for x in range(SIZE):
                if abs(math.hypot(x - cx, y - cy) - radius) < 1.2:
                    grid[y][x] = 1
    elif shape == "square":
        margin = 2
        for y in range(margin, SIZE - margin):
            for x in range(margin, SIZE - margin):
                if y == margin or y == SIZE - margin - 1 or x == margin or x == SIZE - margin - 1:
                    grid[y][x] = 1
    elif shape == "triangle":
        apex_x, apex_y = SIZE / 2 - 0.5, 1.5
        base_y = SIZE - 2.5
        half_base = SIZE / 2 - 1.5
        for y in range(SIZE):
            for x in range(SIZE):
                t = (y - apex_y) / max(base_y - apex_y, 1e-9)
                if 0 <= t <= 1:
                    left_x = apex_x - half_base * t
                    right_x = apex_x + half_base * t
                    edge_dist = min(abs(x - left_x), abs(x - right_x),
                                    abs(_point_to_line(x, y, apex_x, apex_y, apex_x + half_base, base_y)),
                                    abs(_point_to_line(x, y, apex_x, apex_y, apex_x - half_base, base_y)))
                    if edge_dist < 1.2 and left_x <= x <= right_x:
                        grid[y][x] = 1

    if noise > 0:
        for y in range(SIZE):
            for x in range(SIZE):
                if rng.random() < noise:
                    grid[y][x] = 1 - grid[y][x]
    return grid


def generate_shape_dataset(n_samples: int = 200, noise: float = 0.0, seed: int = 42) -> dict:
    """生成图形数据集：随机形状 + 噪声。"""
    rng = random.Random(seed)
    grids, labels = [], []
    for i in range(n_samples):
        shape = rng.choice(SHAPES)
        g = generate_shape(shape, noise, seed + i * 100)
        grids.append(g)
        labels.append(shape)
    return {"grids": grids, "labels": labels, "label_names": [SHAPE_LABELS[s] for s in SHAPES],
            "class_names": SHAPES, "n_classes": len(SHAPES)}


# ═══════════════════════════════════════════════════════════
# 经典手写数字模板（16×16, 3 种书写风格）
# ═══════════════════════════════════════════════════════════

# 每个数字模板定义为一组描边路径，每条路径是一个 (x,y) 坐标列表
# 坐标范围 0~15，经 _render_strokes 渲染成二值网格

_DIGIT_TEMPLATES = {
    0: [
        # 风格1: 标准椭圆零
        [(3,8), (3,4), (5,2), (8,1), (11,2), (13,4), (13,8), (13,12), (11,14), (8,15), (5,14), (3,12), (3,8)],
        # 风格2: 略扁椭圆零
        [(3,7), (4,4), (7,2), (10,2), (13,4), (14,7), (13,10), (10,12), (7,12), (4,10), (3,7)],
        # 风格3: 右上倾斜椭圆零
        [(2,7), (3,3), (6,1), (10,1), (13,3), (14,7), (13,11), (10,13), (6,13), (3,11), (2,7)],
    ],
    1: [
        # 风格1: 直竖线一
        [(6,2), (6,13), (5,14), (7,14)],
        # 风格2: 略斜竖线+顶部短横
        [(5,2), (8,2), (7,2), (7,14), (6,14), (8,14)],
        # 风格3: 细长竖线+底部横钩
        [(7,1), (7,13), (7,14), (5,13)],
    ],
    2: [
        # 风格1: 标准Z形二
        [(3,3), (5,2), (9,2), (12,3), (12,5), (10,7), (7,9), (4,11), (3,13), (5,14), (9,14), (12,13)],
        # 风格2: 圆角Z形二
        [(4,3), (7,2), (11,3), (12,5), (10,7), (7,9), (4,11), (3,12), (4,14), (8,14), (12,13)],
        # 风格3: 底部横线较长二
        [(3,2), (7,2), (11,3), (13,4), (11,7), (7,8), (4,9), (3,11), (2,13), (3,14), (8,14), (13,13)],
    ],
    3: [
        # 风格1: 双弧线三(像B)
        [(3,3), (6,2), (10,2), (12,4), (11,6), (8,7), (6,7), (8,7), (11,8), (12,10), (10,12), (7,13), (4,13), (3,12)],
        # 风格2: 尖角三
        [(3,2), (7,2), (11,3), (10,6), (7,7), (4,7), (8,7), (11,8), (12,10), (10,13), (6,14), (3,13)],
        # 风格3: 圆角三
        [(4,3), (7,1), (11,3), (12,5), (10,7), (7,7), (4,7), (8,7), (11,8), (12,10), (9,13), (5,14), (3,12)],
    ],
    4: [
        # 风格1: 开口四（顶部开口+右下竖）
        [(4,2), (4,7), (4,10), (3,10), (11,7), (11,10), (11,14), (10,14)],
        # 风格2: 闭口四（三角形）
        [(5,2), (5,6), (3,7), (4,8), (5,8), (12,8), (12,7), (13,8), (5,8), (5,14), (4,14)],
        # 风格3: 窄四
        [(3,2), (3,6), (3,8), (10,6), (10,8), (10,14), (9,14)],
    ],
    5: [
        # 风格1: 标准五
        [(4,2), (11,2), (11,3), (4,3), (4,6), (4,8), (7,9), (10,10), (11,12), (9,14), (5,14), (3,13)],
        # 风格2: 顶部短横五
        [(5,2), (10,2), (10,3), (4,3), (4,5), (5,8), (8,9), (11,11), (11,13), (8,14), (4,14), (3,12)],
        # 风格3: 连笔五
        [(3,2), (12,3), (12,4), (4,4), (4,7), (6,9), (9,10), (12,12), (11,14), (7,14), (3,13), (3,12)],
    ],
    6: [
        # 风格1: 大圈六
        [(6,2), (10,3), (12,5), (12,8), (12,11), (10,13), (7,14), (4,13), (3,10), (3,7), (4,5), (7,3)],
        # 风格2: 小圈六
        [(7,3), (9,3), (11,5), (11,8), (11,11), (9,13), (7,14), (5,13), (4,11), (4,8), (4,6), (6,4)],
        # 风格3: 斜六
        [(5,1), (9,2), (12,5), (12,9), (11,12), (8,14), (5,13), (3,11), (3,7), (4,4), (7,2)],
    ],
    7: [
        # 风格1: 标准七+中横
        [(2,2), (13,2), (12,3), (10,4), (8,6), (7,9), (6,12), (6,14)],
        # 风格2: 纯斜线七
        [(2,3), (5,2), (12,3), (13,2), (11,6), (9,10), (7,12), (5,14)],
        # 风格3: 顶部波浪七
        [(3,2), (7,3), (10,2), (13,3), (12,4), (10,6), (8,9), (7,11), (6,14)],
    ],
    8: [
        # 风格1: 双圈八（上下两个椭圆）
        [(6,2), (9,2), (11,4), (11,6), (9,8), (6,8), (4,6), (4,4), (6,2),
         (6,8), (9,8), (11,10), (11,12), (9,14), (6,14), (4,12), (4,10), (6,8)],
        # 风格2: 倾斜八
        [(5,1), (9,2), (12,4), (11,7), (8,8), (4,8), (7,9), (11,10), (12,12), (10,14), (6,14), (4,12)],
        # 风格3: 连笔八(∞形)
        [(7,2), (11,3), (12,6), (11,8), (8,8), (5,8), (4,10), (4,12), (6,14), (10,13), (12,11)],
    ],
    9: [
        # 风格1: 标准九（反六）
        [(12,2), (9,3), (7,5), (6,8), (6,11), (8,13), (11,14), (13,12), (13,9), (12,7), (9,5)],
        # 风格2: 直竖九
        [(10,1), (11,1), (11,5), (12,3), (9,3), (7,5), (6,7), (6,11), (8,13), (11,14), (13,13)],
        # 风格3: 小圈九
        [(10,3), (8,3), (6,5), (5,8), (5,11), (7,13), (10,14), (12,13), (13,10), (12,7), (10,5)],
    ],
}

# ── 模板渲染 ──────────────────────────────────────────────

def _thicken(grid: list[list[int]]) -> list[list[int]]:
    """对已有笔画做 4-邻域膨胀 1px（不加对角线，保持笔画形状）。"""
    out = [[0] * SIZE for _ in range(SIZE)]
    for y in range(SIZE):
        for x in range(SIZE):
            if grid[y][x]:
                out[y][x] = 1
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < SIZE and 0 <= nx < SIZE:
                        out[ny][nx] = 1
    return out


def _render_strokes(points_list: list[list[tuple]], thickness: int = 1) -> list[list[int]]:
    """将一组描边路径渲染为二值网格。"""
    g = [[0] * SIZE for _ in range(SIZE)]
    for path in points_list:
        for i in range(len(path) - 1):
            x0, y0 = path[i]
            x1, y1 = path[i + 1]
            dx = abs(x1 - x0)
            dy = abs(y1 - y0)
            sx = 1 if x0 < x1 else -1
            sy = 1 if y0 < y1 else -1
            err = dx - dy
            while True:
                if 0 <= x0 < SIZE and 0 <= y0 < SIZE:
                    g[y0][x0] = 1
                if x0 == x1 and y0 == y1:
                    break
                e2 = 2 * err
                if e2 > -dy:
                    err -= dy
                    x0 += sx
                if e2 < dx:
                    err += dx
                    y0 += sy
    # 多轮膨胀达到目标粗细
    for _ in range(thickness):
        g = _thicken(g)
    return g


# ── 公开 API ──────────────────────────────────────────────

def get_digit_template(digit: int, style: int = 0, thickness: int = 1) -> list[list[int]]:
    """获取数字 digit (0-9) 的预定义模板，style=0/1/2 切换书写风格。"""
    paths = _DIGIT_TEMPLATES[digit][style % len(_DIGIT_TEMPLATES[digit])]
    return _render_strokes([paths], thickness)


def generate_digit(digit: int, noise: float = 0.0, style: int = -1, seed: int = 0) -> list[list[int]]:
    """
    生成手写数字的 16×16 二值网格。
    - digit: 0-9
    - noise: 椒盐噪声比例
    - style: 书写风格 0/1/2, -1 随机
    - seed: 随机种子
    """
    rng = random.Random(seed)
    if style < 0:
        style = rng.randint(0, 2)
    thickness = rng.randint(0, 2)  # 线宽变化 1/2/3px
    grid = get_digit_template(digit, style, thickness + 1)

    # 随机位移 δ ∈ [-1, 1]
    dx = rng.randint(-1, 1)
    dy = rng.randint(-1, 1)
    if dx != 0 or dy != 0:
        shifted = [[0] * SIZE for _ in range(SIZE)]
        for y in range(SIZE):
            for x in range(SIZE):
                if grid[y][x]:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < SIZE and 0 <= nx < SIZE:
                        shifted[ny][nx] = 1
        grid = shifted

    # 椒盐噪声
    if noise > 0:
        for y in range(SIZE):
            for x in range(SIZE):
                if rng.random() < noise:
                    grid[y][x] = 1 - grid[y][x]

    return grid


def generate_digit_dataset(n_samples: int = 200, noise: float = 0.0, seed: int = 42) -> dict:
    """生成手写数字数据集。0-9 均匀分布，多种书写风格随机混合。"""
    rng = random.Random(seed)
    grids, labels = [], []
    for i in range(n_samples):
        digit = i % 10  # 均匀分布
        g = generate_digit(digit, noise, style=rng.randint(0, 2), seed=seed + i * 100)
        grids.append(g)
        labels.append(digit)
    # 洗牌
    indices = list(range(n_samples))
    rng.shuffle(indices)
    grids = [grids[i] for i in indices]
    labels = [labels[i] for i in indices]
    return {"grids": grids, "labels": labels, "label_names": [str(i) for i in range(10)],
            "class_names": list(range(10)), "n_classes": 10}
