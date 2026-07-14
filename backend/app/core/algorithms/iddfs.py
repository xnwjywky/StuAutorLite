"""迭代加深 DFS — 限制深度逐层搜索，兼顾 BFS 最优与 DFS 内存"""
from .base import SearchAlgorithm


class IDDFS(SearchAlgorithm):
    name = "IDDFS"

    def search(self, maze, start, goal):
        max_possible = maze.width * maze.height
        visited_order = []

        for depth in range(max_possible):
            # DFS with depth limit; track visited in this pass only
            stack = [(start, 0, [start])]
            local_visited = {start}
            found_path = None

            while stack:
                pos, d, path = stack.pop()
                visited_order.append(pos)
                if pos == goal:
                    found_path = path
                    break
                if d < depth:
                    # 逆序压栈以保持与后端 DFS 一致的搜索方向
                    neighbors = maze.get_neighbors(*pos)
                    for nb in reversed(neighbors):
                        if nb not in local_visited:
                            local_visited.add(nb)
                            stack.append((nb, d + 1, path + [nb]))

            if found_path:
                return {
                    "success": True,
                    "path": [list(p) for p in found_path],
                    "visited_nodes": visited_order,
                    "expanded_nodes": len(visited_order),
                }

            # 如果当前深度没有发现任何新节点，说明已穷尽可达区域
            if len(local_visited) >= max_possible or depth >= max_possible - 1:
                break

        return {
            "success": False,
            "path": [],
            "visited_nodes": visited_order,
            "expanded_nodes": len(visited_order),
        }
