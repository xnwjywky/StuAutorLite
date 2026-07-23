"""格子世界环境 — 设计文档 §4.4

机器人在 N×N 格子中寻找金币，避开陷阱。每步有 4 个动作（上下左右）。
奖励：金币 +10、陷阱 -10、空地 -0.1（鼓励最短路径）、超步数 -5。
复用 MazeEnv 的网格生成算法生成随机障碍物。
"""
import random


class GridWorld:
    """强化学习格子世界。"""

    ACTIONS = [(0, -1, "↑"), (0, 1, "↓"), (-1, 0, "←"), (1, 0, "→")]  # (dx, dy, name)

    def __init__(
        self,
        size: int = 8,
        num_traps: int = 3,
        obstacle_ratio: float = 0.15,
        seed: int | None = None,
    ):
        self.size = size
        self.num_traps = num_traps
        self.obstacle_ratio = obstacle_ratio
        self.seed = seed
        self.rng = random.Random(seed) if seed is not None else random.Random()

        self.grid: list[list[str]] = []  # "."=空地, "#"=障碍, "G"=金币, "T"=陷阱
        self.start = (0, 0)
        self.gold = (size - 1, size - 1)
        self.traps: list[tuple[int, int]] = []

    def reset(self) -> tuple[int, int]:
        """生成新地图并返回起始位置。"""
        self._generate()
        return self.start

    def step(self, state: tuple[int, int], action: int) -> tuple[tuple[int, int], float, bool]:
        """执行动作，返回 (新状态, 奖励, 是否终止)。"""
        dx, dy, _ = self.ACTIONS[action]
        nx, ny = state[0] + dx, state[1] + dy

        # 撞墙或障碍物：原地不动，轻罚
        if not (0 <= nx < self.size and 0 <= ny < self.size):
            return state, -1.0, False
        if self.grid[ny][nx] == "#":
            return state, -1.0, False

        cell = self.grid[ny][nx]
        if cell == "G":
            return (nx, ny), 10.0, True
        if cell == "T":
            return (nx, ny), -10.0, True
        return (nx, ny), -0.1, False

    def to_dict(self) -> dict:
        return {
            "size": self.size,
            "grid": self.grid,
            "start": list(self.start),
            "gold": list(self.gold),
            "traps": [list(t) for t in self.traps],
        }

    # ── 内部 ──

    def _generate(self):
        """生成随机地图：确保障碍物不阻塞通路。"""
        # 先清空
        self.grid = [["." for _ in range(self.size)] for _ in range(self.size)]

        # 放金币（右下区域随机）
        gx = self.rng.randint(self.size // 2, self.size - 1)
        gy = self.rng.randint(self.size // 2, self.size - 1)
        self.gold = (gx, gy)
        self.grid[gy][gx] = "G"

        # 放陷阱（避开起点和金币）
        self.traps = []
        candidates = [
            (x, y)
            for x in range(self.size)
            for y in range(self.size)
            if (x, y) != self.start and (x, y) != self.gold and (x, y) != (0, 0)
        ]
        self.rng.shuffle(candidates)
        for x, y in candidates[:self.num_traps]:
            self.traps.append((x, y))
            self.grid[y][x] = "T"

        # 放置障碍物
        for x in range(self.size):
            for y in range(self.size):
                if self.grid[y][x] == "." and self.rng.random() < self.obstacle_ratio:
                    if (x, y) not in (self.start, self.gold) and (x, y) not in self.traps:
                        self.grid[y][x] = "#"

        # 确保连通性：BFS 从起点出发能到达金币
        if not self._reachable():
            self._carve_path()

    def _reachable(self) -> bool:
        """BFS 连通性检查（避免循环导入，内联实现）。"""
        from collections import deque

        visited = [[False] * self.size for _ in range(self.size)]
        q = deque([self.start])
        visited[self.start[1]][self.start[0]] = True
        while q:
            cx, cy = q.popleft()
            if (cx, cy) == self.gold:
                return True
            for dx, dy, _ in self.ACTIONS:
                nx, ny = cx + dx, cy + dy
                if (
                    0 <= nx < self.size
                    and 0 <= ny < self.size
                    and not visited[ny][nx]
                    and self.grid[ny][nx] != "#"
                ):
                    visited[ny][nx] = True
                    q.append((nx, ny))
        return False

    def _carve_path(self):
        """不连通时随机打通一些墙。"""
        for _ in range(self.size * 2):
            x = self.rng.randint(0, self.size - 1)
            y = self.rng.randint(0, self.size - 1)
            if self.grid[y][x] == "#":
                self.grid[y][x] = "."
