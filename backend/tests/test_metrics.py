"""测试 metrics 模块 — 统计与汇总计算"""
import pytest
from app.core.metrics import compute_summary_by_algorithm


class TestMetrics:
    def test_compute_summary_perfect_runs(self):
        runs = [
            {"algorithm": "BFS", "success": True, "path_length": 20, "expanded_nodes": 50, "runtime_ms": 10.0},
            {"algorithm": "BFS", "success": True, "path_length": 24, "expanded_nodes": 60, "runtime_ms": 12.0},
            {"algorithm": "BFS", "success": True, "path_length": 22, "expanded_nodes": 55, "runtime_ms": 11.0},
        ]
        summary = compute_summary_by_algorithm(runs)
        bfs = summary["BFS"]
        assert bfs["success_rate"] == 1.0
        assert bfs["avg_path_length"] == 22.0
        assert bfs["avg_expanded_nodes"] == 55.0
        assert bfs["avg_runtime_ms"] == 11.0

    def test_compute_summary_mixed_success(self):
        runs = [
            {"algorithm": "A*", "success": True, "path_length": 10, "expanded_nodes": 20, "runtime_ms": 5.0},
            {"algorithm": "A*", "success": False, "path_length": 0, "expanded_nodes": 30, "runtime_ms": 3.0},
            {"algorithm": "A*", "success": True, "path_length": 12, "expanded_nodes": 22, "runtime_ms": 6.0},
        ]
        summary = compute_summary_by_algorithm(runs)
        astar = summary["A*"]
        assert astar["success_rate"] == pytest.approx(2.0 / 3.0, 0.001)

    def test_compute_summary_multi_algo(self):
        runs = [
            {"algorithm": "BFS", "success": True, "path_length": 10, "expanded_nodes": 10, "runtime_ms": 1.0},
            {"algorithm": "DFS", "success": True, "path_length": 15, "expanded_nodes": 8, "runtime_ms": 0.8},
            {"algorithm": "BFS", "success": False, "path_length": 0, "expanded_nodes": 20, "runtime_ms": 2.0},
        ]
        summary = compute_summary_by_algorithm(runs)
        assert "BFS" in summary
        assert "DFS" in summary

    def test_empty_runs(self):
        summary = compute_summary_by_algorithm([])
        assert summary == {}
