"""贪心最佳优先 — 只看启发值，不保证最短路径"""
import heapq
from .base import SearchAlgorithm


class GreedyBestFirst(SearchAlgorithm):
    name = "GREEDY"

    def search(self, maze, start, goal):
        def h(pos):
            return abs(pos[0] - goal[0]) + abs(pos[1] - goal[1])

        pq = [(h(start), 0, start)]
        parent = {start: None}
        visited = {start}
        visited_order = []

        while pq:
            _, _, current = heapq.heappop(pq)
            visited_order.append(current)
            if current == goal:
                path = []
                node = goal
                while node != start:
                    path.append(list(node))
                    node = parent[node]
                path.append(list(start))
                path.reverse()
                return {
                    "success": True,
                    "path": path,
                    "visited_nodes": visited_order,
                    "expanded_nodes": len(visited_order),
                }

            for nb in maze.get_neighbors(*current):
                if nb not in visited:
                    visited.add(nb)
                    parent[nb] = current
                    heapq.heappush(pq, (h(nb), len(visited_order), nb))

        return {
            "success": False,
            "path": [],
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }
