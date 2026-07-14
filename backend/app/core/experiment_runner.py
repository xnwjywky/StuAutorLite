"""批量实验运行器 — 设计文档 §13 + §18.2"""

from .maze import MazeEnv
from .algorithms.bfs import BFS
from .algorithms.dfs import DFS
from .algorithms.astar import AStar
from .algorithms.random_walk import RandomWalk
from .algorithms.dijkstra import Dijkstra
from .algorithms.greedy import GreedyBestFirst
from .algorithms.bidirectional import BidirectionalBFS
from .algorithms.iddfs import IDDFS
from .metrics import compute_metrics, compute_summary_by_algorithm

ALGORITHMS = {
    "BFS": BFS(),
    "DFS": DFS(),
    "A*": AStar(),
    "RANDOM": RandomWalk(),
    "DIJKSTRA": Dijkstra(),
    "GREEDY": GreedyBestFirst(),
    "BIDIRECTIONAL": BidirectionalBFS(),
    "IDDFS": IDDFS(),
}


class ExperimentRunner:
    """批量运行迷宫搜索实验"""

    def run(self, config: dict) -> dict:
        """
        config 结构（对齐设计文档 §11.5）:
        {
            "maze_size": [12, 12],
            "obstacle_ratios": [0.1, 0.2, 0.3],
            "algorithms": ["BFS", "A*"],
            "num_trials": 5,
            "same_seed_for_algorithms": true,
            "seed": 42,
            "custom_mazes": {"1": [[0,0,...],...], "2": [[...],...]}  // 可选：预定义迷宫
        }
        """
        maze_w, maze_h = config.get("maze_size", [12, 12])
        obstacle_ratios = config.get("obstacle_ratios", [0.2])
        algo_names = config.get("algorithms", list(ALGORITHMS.keys()))
        num_trials = config.get("num_trials", 5)
        same_seed = config.get("same_seed_for_algorithms", True)
        base_seed = config.get("seed", 42)
        custom_mazes: dict[str, list[list[int]]] = config.get("custom_mazes", {})

        all_runs: list[dict] = []

        for ratio in obstacle_ratios:
            for trial in range(num_trials):
                trial_key = str(trial + 1)

                # 如果提供了自定义迷宫，使用它；否则生成新迷宫
                if trial_key in custom_mazes and custom_mazes[trial_key]:
                    grid_data = custom_mazes[trial_key]
                    maze = MazeEnv(len(grid_data[0]), len(grid_data), ratio, base_seed)
                    maze.grid = [row[:] for row in grid_data]
                    maze.start = (0, 0)
                    maze.goal = (len(grid_data[0]) - 1, len(grid_data) - 1)
                    seed = base_seed + trial  # 自定义迷宫仍保留 seed 用于记录
                else:
                    seed = base_seed + trial if same_seed else base_seed + trial * 100
                    maze = MazeEnv(maze_w, maze_h, ratio, seed)
                    maze.generate()

                for name in algo_names:
                    algo = ALGORITHMS.get(name)
                    if algo is None:
                        continue

                    result = algo.solve(maze, maze.start, maze.goal)
                    run_record = {
                        "algorithm": name,
                        "obstacle_ratio": ratio,
                        "maze_size": [maze_w, maze_h],
                        "trial": trial + 1,
                        "seed": seed,
                        "success": result["success"],
                        "path_length": len(result["path"]),
                        "expanded_nodes": result["expanded_nodes"],
                        "runtime_ms": result["runtime_ms"],
                        "path": result["path"],
                        "visited_nodes": result["visited_nodes"],
                        "maze_grid": maze.grid,
                    }
                    all_runs.append(run_record)

        # 汇总
        by_algo = compute_summary_by_algorithm(all_runs)
        summary = {algo: stats for algo, stats in by_algo.items()}

        return {
            "status": "COMPLETED",
            "runs": all_runs,
            "summary": summary,
            "total_runs": len(all_runs),
        }
