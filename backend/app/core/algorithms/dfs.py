"""深度优先搜索 — 设计文档 §13.4"""

from .base import SearchAlgorithm


class DFS(SearchAlgorithm):
    name = "DFS"

    def search(self, maze, start, goal):
        stack = [start]
        visited = {start: None}
        visited_order: list[tuple[int, int]] = []

        while stack:
            current = stack.pop()
            visited_order.append(current)

            if current == goal:
                return self._build_result(True, visited, visited_order, start, goal)

            for nb in maze.get_neighbors(*current):
                if nb not in visited:
                    visited[nb] = current
                    stack.append(nb)

        return self._build_result(False, visited, visited_order, start, goal)

    def _build_result(self, success, visited, visited_order, start, goal):
        path = self._reconstruct_path(visited, start, goal) if success else []
        return {
            "success": success,
            "path": path,
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }

    @staticmethod
    def _reconstruct_path(visited, start, goal):
        path = []
        node = goal
        while node != start:
            path.append(list(node))
            node = visited[node]
        path.append(list(start))
        path.reverse()
        return path
