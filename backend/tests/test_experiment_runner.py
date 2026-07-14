"""测试 ExperimentRunner — 批量运行与汇总统计"""
import pytest
from app.core.experiment_runner import ExperimentRunner


class TestExperimentRunner:
    def setup_method(self):
        self.runner = ExperimentRunner()

    def test_basic_run(self):
        config = {
            "maze_size": [8, 8],
            "obstacle_ratios": [0.2],
            "algorithms": ["BFS"],
            "num_trials": 2,
            "seed": 42,
        }
        r = self.runner.run(config)
        assert r["status"] == "COMPLETED"
        assert r["total_runs"] == 2  # 1 ratio * 2 trials * 1 algo
        assert len(r["runs"]) == 2
        for run in r["runs"]:
            assert run["algorithm"] == "BFS"
            assert run["maze_size"] == [8, 8]
            assert "path" in run
            assert "visited_nodes" in run
            assert "maze_grid" in run

    def test_multi_algorithm_multi_ratio(self):
        config = {
            "maze_size": [8, 8],
            "obstacle_ratios": [0.1, 0.2],
            "algorithms": ["BFS", "DFS"],
            "num_trials": 2,
            "seed": 42,
        }
        r = self.runner.run(config)
        assert r["total_runs"] == 8  # 2 ratios * 2 trials * 2 algos
        assert "BFS" in r["summary"]
        assert "DFS" in r["summary"]
        assert "success_rate" in r["summary"]["BFS"]
        assert r["summary"]["BFS"]["count"] == 4

    def test_custom_mazes(self):
        """自定义迷宫必须直接使用，不重新生成。"""
        custom = {"1": [[0, 0], [0, 0]], "2": [[0, 1], [0, 0]]}
        config = {
            "maze_size": [2, 2],
            "obstacle_ratios": [0.5],
            "algorithms": ["BFS"],
            "num_trials": 2,
            "seed": 42,
            "custom_mazes": custom,
        }
        r = self.runner.run(config)
        assert r["total_runs"] == 2
        # 第 1 组无墙
        assert r["runs"][0]["maze_grid"] == custom["1"]
        # 第 2 组有墙
        assert r["runs"][1]["maze_grid"] == custom["2"]

    def test_summary_accuracy(self):
        config = {
            "maze_size": [12, 12],
            "obstacle_ratios": [0.2],
            "algorithms": ["BFS", "A*"],
            "num_trials": 5,
            "seed": 42,
        }
        r = self.runner.run(config)
        summary = r["summary"]
        assert 0.0 <= summary["BFS"]["success_rate"] <= 1.0
        assert summary["BFS"]["avg_path_length"] > 0
        assert summary["BFS"]["avg_expanded_nodes"] > 0
        assert summary["BFS"]["avg_runtime_ms"] >= 0

    def test_edge_case_single_trial(self):
        config = {
            "maze_size": [4, 4],
            "obstacle_ratios": [0.0],
            "algorithms": ["BFS"],
            "num_trials": 1,
            "seed": 1,
        }
        r = self.runner.run(config)
        assert r["total_runs"] == 1
        assert r["runs"][0]["success"] is True  # 无障碍物时必成功
