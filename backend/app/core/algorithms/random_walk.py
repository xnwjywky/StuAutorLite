"""随机游走 — 设计文档 §13.6"""

import random
from .base import SearchAlgorithm


class RandomWalk(SearchAlgorithm):
    name = "Random Walk"

    def __init__(self, max_steps: int = 500):
        self.max_steps = max_steps

    def search(self, maze, start, goal):
        current = start
        path: list[tuple[int, int]] = [current]
        visited_order: list[tuple[int, int]] = [current]

        for _ in range(self.max_steps):
            if current == goal:
                return {
                    "success": True,
                    "path": [list(p) for p in path],
                    "visited_nodes": visited_order,
                    "expanded_nodes": len(visited_order),
                }
            neighbors = maze.get_neighbors(*current)
            if not neighbors:
                break
            current = random.choice(neighbors)
            path.append(current)
            if current not in visited_order:
                visited_order.append(current)

        return {
            "success": False,
            "path": [list(p) for p in path],
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }
