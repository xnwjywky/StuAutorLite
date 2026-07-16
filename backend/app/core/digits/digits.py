"""手写数字像素数据生成器 — 简化 0-9 数字模板 + 可控噪声"""
import random, math

DIGITS = list(range(10))
SIZE = 16  # 16×16 像素网格
LABELS_CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

# ── 数字笔画模板（16×16 网格上的关键点描边） ──────────────────

def _stroke(grid, points, val=1):
    """在 grid 上用 Bresenham 连线描边。"""
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        while True:
            if 0 <= x0 < SIZE and 0 <= y0 < SIZE:
                grid[y0][x0] = val
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy


def _digit_template(d: int) -> list[list[int]]:
    """返回数字 d 的干净模板（16×16 二值网格）。"""
    g = [[0] * SIZE for _ in range(SIZE)]
    m = 3  # margin
    r = SIZE - 1 - m  # right/bottom
    mid_x = SIZE // 2
    mid_y = SIZE // 2

    if d == 0:    # 椭圆零 — 使用数学椭圆，避免与9混淆
        cx, cy = SIZE / 2 - 0.5, SIZE / 2 - 0.5
        rx, ry = SIZE / 2 - 3, SIZE / 2 - 2.5
        for y in range(SIZE):
            for x in range(SIZE):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    g[y][x] = 1
        # 挖空内部（只保留轮廓）
        for y in range(SIZE):
            for x in range(SIZE):
                if ((x - cx) / (rx - 2)) ** 2 + ((y - cy) / (ry - 2)) ** 2 <= 1.0:
                    g[y][x] = 0
    elif d == 1:  # 竖线一
        _stroke(g, [(mid_x, m), (mid_x, r)])
    elif d == 2:  # Z 形二
        _stroke(g, [(m, m), (r, m), (m, r), (r, r)])
    elif d == 3:  # 两个弯三
        _stroke(g, [(m, m), (r, m), (mid_x, mid_y), (r, r), (m, r)])
    elif d == 4:  # 交叉四
        _stroke(g, [(m, m), (m, mid_y), (r, mid_y)])
        _stroke(g, [(r, m), (r, r)])
    elif d == 5:  # 弯钩五 — 顶横 + 左竖 + 中横 + 右下竖
        _stroke(g, [(m, m), (r, m)])                # 顶横
        _stroke(g, [(m, m), (m, mid_y)])            # 左竖（上半）
        _stroke(g, [(m, mid_y), (r - 1, mid_y)])    # 中横
        _stroke(g, [(r, mid_y), (r, r)])            # 右竖（下半）
        _stroke(g, [(r, r), (m, r)])                # 底横
    elif d == 6:  # 圆圈六 — 大圈 + 内横线
        _stroke(g, [(r, m), (m, m), (m, r), (r, r), (r, m)])  # 完整外圈
        _stroke(g, [(m + 2, mid_y), (r - 2, mid_y)])           # 内横线（区分5的关键）
    elif d == 7:  # 斜线七
        _stroke(g, [(m, m), (r, m), (mid_x, r)])
    elif d == 8:  # 双圈八 — 上圈 + 下圈
        _stroke(g, [(m + 1, m + 1), (r - 1, m + 1), (r - 1, mid_y - 1), (m + 1, mid_y - 1), (m + 1, m + 1)])
        _stroke(g, [(m + 1, mid_y + 1), (r - 1, mid_y + 1), (r - 1, r - 1), (m + 1, r - 1), (m + 1, mid_y + 1)])
    elif d == 9:  # 反六九 — 大圈 + 右下竖
        _stroke(g, [(m, r), (r, r), (r, m), (m, m), (m, r)])  # 完整外圈
        _stroke(g, [(r, m), (r, mid_y)])                        # 右下竖（区分6的关键）

    # 加粗：十字膨胀 1px（不包含对角线，保持笔画更清晰）
    thickened = [[0] * SIZE for _ in range(SIZE)]
    for y in range(SIZE):
        for x in range(SIZE):
            if g[y][x]:
                thickened[y][x] = 1
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < SIZE and 0 <= nx < SIZE:
                        thickened[ny][nx] = 1
    return thickened


# ── 公开 API ────────────────────────────────────────────────

def generate_digit(digit: int, noise: float = 0.0, seed: int = 0) -> list[list[int]]:
    """返回 SIZE×SIZE 的二值网格。digit=0..9, noise=0 时为模板。"""
    rng = random.Random(seed)
    grid = _digit_template(digit)

    # 位移抖动: 整体平移 0~2px
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

    # 加噪声：随机翻转像素
    if noise > 0:
        for y in range(SIZE):
            for x in range(SIZE):
                if rng.random() < noise:
                    grid[y][x] = 1 - grid[y][x]

    return grid


def generate_dataset(n_samples: int = 200, noise: float = 0.0, seed: int = 42) -> dict:
    """生成数字数据集。返回 {grids, labels, digit_names}。"""
    rng = random.Random(seed)
    grids, labels = [], []
    for i in range(n_samples):
        d = i % 10  # 均匀分布
        g = generate_digit(d, noise, seed + i * 100)
        grids.append(g)
        labels.append(d)
    # 洗牌
    indices = list(range(n_samples))
    rng.shuffle(indices)
    grids = [grids[i] for i in indices]
    labels = [labels[i] for i in indices]
    return {"grids": grids, "labels": labels, "digit_names": [str(i) for i in range(10)]}
