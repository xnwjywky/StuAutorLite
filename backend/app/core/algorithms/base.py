"""搜索算法抽象基类 — 设计文档 §13.2"""

import time
from abc import ABC, abstractmethod


class SearchAlgorithm(ABC):
    """统一接口：solve(maze, start, goal) → 结构化结果"""

    name: str = "base"

    def solve(self, maze, start: tuple[int, int], goal: tuple[int, int]) -> dict:
        """包装 search()，自动计时并返回统一结构"""
        t0 = time.perf_counter()
        result = self.search(maze, start, goal)
        result.setdefault("runtime_ms", round((time.perf_counter() - t0) * 1000, 2))
        result.setdefault("algorithm", self.name)
        return result

    @abstractmethod
    def search(self, maze, start: tuple[int, int], goal: tuple[int, int]) -> dict:
        """子类实现：返回 {success, path, visited_nodes, expanded_nodes}"""
        ...
