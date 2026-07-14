"""双向 BFS — 从起点和终点同时搜索，在中间会合"""
from collections import deque
from .base import SearchAlgorithm


class BidirectionalBFS(SearchAlgorithm):
    name = "BIDIRECTIONAL"

    def search(self, maze, start, goal):
        if start == goal:
            return {
                "success": True, "path": [list(start)],
                "visited_nodes": [start], "expanded_nodes": 1,
            }

        q_fwd = deque([start])
        q_bwd = deque([goal])
        parent_fwd = {start: None}
        parent_bwd = {goal: None}
        visited_fwd = {start}
        visited_bwd = {goal}
        visited_order = []

        def expand(q, parents, visited_self, visited_other):
            if not q:
                return None
            current = q.popleft()
            visited_order.append(current)
            if current in visited_other:
                return current  # meeting point
            for nb in maze.get_neighbors(*current):
                if nb not in visited_self:
                    visited_self.add(nb)
                    parents[nb] = current
                    q.append(nb)
            return None

        while q_fwd and q_bwd:
            meeting = expand(q_fwd, parent_fwd, visited_fwd, visited_bwd)
            if meeting:
                return self._build(True, meeting, parent_fwd, parent_bwd, start, goal, visited_order)
            meeting = expand(q_bwd, parent_bwd, visited_bwd, visited_fwd)
            if meeting:
                return self._build(True, meeting, parent_fwd, parent_bwd, start, goal, visited_order)

        return {
            "success": False, "path": [],
            "visited_nodes": visited_order, "expanded_nodes": len(visited_order),
        }

    def _build(self, success, meeting, pf, pb, start, goal, visited_order):
        path_fwd = []
        node = meeting
        while node != start:
            path_fwd.append(list(node))
            node = pf[node]
        path_fwd.append(list(start))
        path_fwd.reverse()

        path_bwd = []
        node = meeting
        while node != goal:
            node = pb[node]
            path_bwd.append(list(node))

        return {
            "success": success,
            "path": path_fwd + path_bwd,
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }
