"""Dijkstra 算法 — 统一代价搜索，保证最短路径"""
import heapq
from .base import SearchAlgorithm


class Dijkstra(SearchAlgorithm):
    name = "DIJKSTRA"

    def search(self, maze, start, goal):
        pq = [(0, 0, start)]  # (cost, tiebreaker, pos)
        parent = {start: None}
        cost = {start: 0}
        visited_order = []

        while pq:
            c, _, current = heapq.heappop(pq)
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
                new_cost = c + 1  # uniform grid → all edges cost 1
                if nb not in cost or new_cost < cost[nb]:
                    cost[nb] = new_cost
                    parent[nb] = current
                    heapq.heappush(pq, (new_cost, len(visited_order), nb))

        return {
            "success": False,
            "path": [],
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }
