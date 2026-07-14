"""A* 搜索 — 设计文档 §13.5"""

import heapq
from .base import SearchAlgorithm


class AStar(SearchAlgorithm):
    name = "A*"

    def __init__(self, heuristic: str = "manhattan"):
        self.heuristic = heuristic

    def search(self, maze, start, goal):
        def h(pos):
            if self.heuristic == "euclidean":
                return ((pos[0] - goal[0]) ** 2 + (pos[1] - goal[1]) ** 2) ** 0.5
            return abs(pos[0] - goal[0]) + abs(pos[1] - goal[1])

        g = {start: 0}
        parent = {start: None}
        visited_order: list[tuple[int, int]] = []
        open_set = [(h(start), 0, start)]  # (f, tiebreaker, pos)

        while open_set:
            _, _, current = heapq.heappop(open_set)
            visited_order.append(current)

            if current == goal:
                return self._build_result(True, parent, visited_order, start, goal, g)

            for nb in maze.get_neighbors(*current):
                tentative = g[current] + 1
                if nb not in g or tentative < g[nb]:
                    g[nb] = tentative
                    parent[nb] = current
                    heapq.heappush(open_set, (tentative + h(nb), len(visited_order), nb))

        return self._build_result(False, parent, visited_order, start, goal, g)

    def _build_result(self, success, parent, visited_order, start, goal, g):
        path = self._reconstruct_path(parent, start, goal) if success else []
        return {
            "success": success,
            "path": path,
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }

    @staticmethod
    def _reconstruct_path(parent, start, goal):
        path = []
        node = goal
        while node != start:
            path.append(list(node))
            node = parent[node]
        path.append(list(start))
        path.reverse()
        return path
