"""迷宫生成器 — 设计文档 §13.1"""

import random


class MazeEnv:
    """二维网格迷宫环境"""

    WALL = 1
    EMPTY = 0

    def __init__(
        self,
        width: int = 12,
        height: int = 12,
        obstacle_ratio: float = 0.25,
        seed: int | None = None,
    ):
        self.width = width
        self.height = height
        self.obstacle_ratio = obstacle_ratio
        self.seed = seed
        self.grid: list[list[int]] = []
        self.start = (0, 0)
        self.goal = (width - 1, height - 1)

    # ── generate ──────────────────────────────────────────
    def generate(self) -> list[list[int]]:
        """生成迷宫网格，起点和终点始终可通行"""
        rng = random.Random(self.seed) if self.seed is not None else random.Random()

        self.grid = []
        for y in range(self.height):
            row: list[int] = []
            for x in range(self.width):
                if (x, y) == self.start or (x, y) == self.goal:
                    row.append(self.EMPTY)
                else:
                    row.append(self.WALL if rng.random() < self.obstacle_ratio else self.EMPTY)
            self.grid.append(row)

        # 确保起点和终点可达（简单 BFS 连通性检查，不通则重试最多 20 次）
        for _ in range(20):
            if self._is_reachable():
                break
            # 打通一条随机路径上的障碍物
            self._carve_passage(rng)
        return self.grid

    # ── helpers ───────────────────────────────────────────
    def is_valid_cell(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height and self.grid[y][x] == self.EMPTY

    def get_neighbors(self, x: int, y: int) -> list[tuple[int, int]]:
        """返回 (上, 下, 左, 右) 中可通行的邻居"""
        candidates = [(x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)]
        return [(nx, ny) for nx, ny in candidates if self.is_valid_cell(nx, ny)]

    def to_dict(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "grid": self.grid,
            "start": list(self.start),
            "goal": list(self.goal),
        }

    # ── internal ──────────────────────────────────────────
    def _is_reachable(self) -> bool:
        from collections import deque

        visited = [[False] * self.width for _ in range(self.height)]
        q = deque([self.start])
        visited[self.start[1]][self.start[0]] = True
        while q:
            cx, cy = q.popleft()
            if (cx, cy) == self.goal:
                return True
            for nx, ny in self.get_neighbors(cx, cy):
                if not visited[ny][nx]:
                    visited[ny][nx] = True
                    q.append((nx, ny))
        return False

    def _carve_passage(self, rng: random.Random) -> None:
        """随机打通一些墙以提高连通性"""
        for _ in range(max(self.width, self.height)):
            x = rng.randint(0, self.width - 1)
            y = rng.randint(0, self.height - 1)
            if (x, y) not in (self.start, self.goal):
                self.grid[y][x] = self.EMPTY
