"""测试 MazeEnv — 迷宫生成与连通性"""
import pytest
from app.core.maze import MazeEnv


class TestMazeEnv:
    def test_generate_creates_valid_maze(self):
        env = MazeEnv(12, 12, 0.2, seed=42)
        env.generate()
        assert env.grid is not None
        assert len(env.grid) == 12
        assert len(env.grid[0]) == 12
        assert env.start == (0, 0)
        assert env.goal == (11, 11)
        assert env.grid[0][0] == 0  # 起点为空
        assert env.grid[11][11] == 0  # 终点为空

    def test_maze_has_path_from_start_to_goal(self):
        """所有生成的迷宫都必须保证起点到终点可达。"""
        for seed in range(20):
            env = MazeEnv(10, 10, 0.3, seed=seed)
            env.generate()
            # 用 BFS 验证可达性
            from collections import deque
            q = deque([(0, 0)])
            visited = {(0, 0)}
            while q:
                x, y = q.popleft()
                if (x, y) == (9, 9):
                    break
                for nb in env.get_neighbors(x, y):
                    if nb not in visited:
                        visited.add(nb)
                        q.append(nb)
            assert (9, 9) in visited, f"Seed {seed}: 迷宫不连通"

    def test_different_seeds_produce_different_mazes(self):
        """不同种子应生成不同迷宫。"""
        env1 = MazeEnv(8, 8, 0.2, seed=1)
        env1.generate()
        env2 = MazeEnv(8, 8, 0.2, seed=2)
        env2.generate()
        diff = sum(
            1 for y in range(8) for x in range(8)
            if env1.grid[y][x] != env2.grid[y][x]
        )
        assert diff > 0, "相同种子应生成相同迷宫；不同种子应不同"

    def test_same_seed_produces_same_maze(self):
        env1 = MazeEnv(8, 8, 0.2, seed=99)
        env1.generate()
        env2 = MazeEnv(8, 8, 0.2, seed=99)
        env2.generate()
        assert env1.grid == env2.grid

    def test_obstacle_ratio_affects_wall_count(self):
        env_low = MazeEnv(12, 12, 0.05, seed=1)
        env_low.generate()
        env_high = MazeEnv(12, 12, 0.35, seed=1)
        env_high.generate()
        low_walls = sum(row.count(1) for row in env_low.grid)
        high_walls = sum(row.count(1) for row in env_high.grid)
        assert high_walls > low_walls, "高障碍物比例应产生更多墙"

    def test_boundary_sizes(self):
        """边界尺寸测试。"""
        for size in [4, 8, 20, 30]:
            env = MazeEnv(size, size, 0.15, seed=1)
            env.generate()
            assert env.grid[0][0] == 0
            assert env.grid[size - 1][size - 1] == 0

    def test_manual_grid_assignment(self):
        """直接设置网格（用于自定义迷宫场景）。"""
        env = MazeEnv(3, 3, 0.0, seed=1)
        env.grid = [[0, 1, 0], [0, 0, 0], [0, 1, 0]]
        assert env.grid[1][1] == 0
        neighbors = env.get_neighbors(1, 1)
        assert len(neighbors) > 0
