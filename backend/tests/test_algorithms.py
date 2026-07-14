"""测试所有搜索算法 — BFS, DFS, A*, RandomWalk"""
import pytest
from app.core.maze import MazeEnv
from app.core.algorithms.bfs import BFS
from app.core.algorithms.dfs import DFS
from app.core.algorithms.astar import AStar
from app.core.algorithms.random_walk import RandomWalk


def _make_maze(grid):
    """从二维列表创建 MazeEnv。"""
    env = MazeEnv(len(grid[0]), len(grid), 0.0, seed=1)
    env.grid = grid
    env.start = (0, 0)
    env.goal = (len(grid[0]) - 1, len(grid) - 1)
    return env


class TestBFS:
    def setup_method(self):
        self.algo = BFS()

    def test_bfs_finds_shortest_path_open(self):
        maze = _make_maze([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is True
        assert len(r["path"]) == 5  # (0,0)->(0,1)->(0,2)->(1,2)->(2,2)

    def test_bfs_no_path(self):
        maze = _make_maze([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is False

    def test_bfs_result_structure(self):
        maze = _make_maze([[0, 0], [0, 0]])
        r = self.algo.solve(maze, (0, 0), (1, 1))
        for key in ["success", "path", "visited_nodes", "expanded_nodes", "algorithm"]:
            assert key in r
        assert r["runtime_ms"] >= 0


class TestDFS:
    def setup_method(self):
        self.algo = DFS()

    def test_dfs_finds_path(self):
        maze = _make_maze([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is True

    def test_dfs_no_path(self):
        maze = _make_maze([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is False


class TestAStar:
    def test_astar_manhattan(self):
        algo = AStar(heuristic="manhattan")
        maze = _make_maze([[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
        r = algo.solve(maze, (0, 0), (3, 3))
        assert r["success"] is True

    def test_astar_euclidean(self):
        algo = AStar(heuristic="euclidean")
        maze = _make_maze([[0, 0, 0], [0, 1, 0], [0, 0, 0]])
        r = algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is True

    def test_astar_optimality(self):
        """A* 应找到最短路径。"""
        algo = AStar(heuristic="manhattan")
        maze = _make_maze([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
        r = algo.solve(maze, (0, 0), (3, 3))
        assert r["success"]
        assert len(r["path"]) == 7  # 4x4 的曼哈顿距离最短路 = 6 步 + 起点


class TestRandomWalk:
    def setup_method(self):
        self.algo = RandomWalk(max_steps=200)

    def test_random_walk_runs(self):
        maze = _make_maze([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert "success" in r
        assert r["runtime_ms"] >= 0
        assert len(r["path"]) > 0


class TestDijkstra:
    def setup_method(self):
        from app.core.algorithms.dijkstra import Dijkstra
        self.algo = Dijkstra()

    def test_dijkstra_finds_path(self):
        maze = _make_maze([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is True
        assert len(r["path"]) == 5

    def test_dijkstra_no_path(self):
        maze = _make_maze([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is False


class TestGreedy:
    def setup_method(self):
        from app.core.algorithms.greedy import GreedyBestFirst
        self.algo = GreedyBestFirst()

    def test_greedy_finds_path(self):
        maze = _make_maze([[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (3, 3))
        assert r["success"] is True

    def test_greedy_may_not_be_optimal(self):
        maze = _make_maze([
            [0, 0, 0, 0, 0], [0, 1, 1, 1, 0],
            [0, 0, 0, 0, 0], [0, 1, 1, 1, 0],
            [0, 0, 0, 0, 0],
        ])
        r = self.algo.solve(maze, (0, 0), (4, 4))
        assert r["success"] is True


class TestBidirectional:
    def setup_method(self):
        from app.core.algorithms.bidirectional import BidirectionalBFS
        self.algo = BidirectionalBFS()

    def test_bidirectional_finds_path(self):
        maze = _make_maze([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is True

    def test_bidirectional_self_loop(self):
        maze = _make_maze([[0]])
        r = self.algo.solve(maze, (0, 0), (0, 0))
        assert r["success"] is True

    def test_bidirectional_no_path(self):
        maze = _make_maze([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is False


class TestIDDFS:
    def setup_method(self):
        from app.core.algorithms.iddfs import IDDFS
        self.algo = IDDFS()

    def test_iddfs_finds_path(self):
        maze = _make_maze([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is True

    def test_iddfs_no_path(self):
        maze = _make_maze([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
        r = self.algo.solve(maze, (0, 0), (2, 2))
        assert r["success"] is False

    def test_iddfs_bigger_maze(self):
        grid = [[0] * 6 for _ in range(6)]
        maze = _make_maze(grid)
        r = self.algo.solve(maze, (0, 0), (5, 5))
        assert r["success"] is True
