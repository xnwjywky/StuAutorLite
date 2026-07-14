interface AlgorithmCardProps {
  name: string;
  description: string;
  selected?: boolean;
  onToggle?: () => void;
}

export default function AlgorithmCard({ name, description, selected = false, onToggle }: AlgorithmCardProps) {
  return (
    <div
      className={`card cursor-pointer transition-all ${selected ? "ring-2 ring-gray-500 bg-gray-50/50" : "hover:shadow-md hover:bg-gray-50/30"}`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800">{name}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full transition-colors pointer-events-none ${selected ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-500"}`}
        >{selected ? "已选择" : "点击选择"}</span>
      </div>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

/** 预存算法知识 — 来自后端 AlgorithmTutor Agent ALGO_KNOWLEDGE */
export const ALGO_INFO: Record<string, { explanation: string; analogy: string; pros: string[]; cons: string[]; key_points: string[]; pseudocode?: string }> = {
  BFS: {
    explanation: "BFS 就像在池塘里扔一颗石子，水波一圈一圈向外扩散。它从起点开始，先检查所有距离为 1 的格子，再检查距离为 2 的格子……层层推进，直到找到终点。所以它找到的路径一定是最短的。",
    analogy: "就像你在图书馆里一排一排地找一本特定的书，虽然慢但一定能找到，而且不会漏掉。",
    pros: ["一定能找到最短路径", "结果稳定，每次结果都一样", "适合做基准对比"],
    cons: ["搜索的节点很多", "迷宫很大时比较慢", "内存占用较大"],
    key_points: ["层层搜索，先近后远", "保证最短路径", "时间复杂度 O(V+E)"],
    pseudocode:
`1. 创建队列 Q，将起点入队
2. 标记起点为已访问
3. while Q 不为空:
    4. 取出队首节点 u
    5. if u == 终点: 返回路径
    6. for u 的每个邻居 v:
        7. if v 未被访问:
            8. 标记 v 为已访问
            9. v 的父节点设为 u
            10. 将 v 入队
11. 回溯父节点得到路径`,
  },
  DFS: {
    explanation: "DFS 就像一个人走在迷宫里，它会一直沿着一条路走下去，直到走不通了才回头换一条路。这种策略可能很快找到终点（如果运气好），但也可能绕很远的路。",
    analogy: "就像你在森林里一直朝一个方向走，撞到墙就返回分岔点换方向，有时候能快速穿过去，有时候会绕一大圈。",
    pros: ["有时能非常快地找到路径", "内存占用小"],
    cons: ["不一定能找到最短路径", "结果不稳定，受搜索顺序影响大"],
    key_points: ["一条路走到底", "不保证最短路径", "时间复杂度 O(V+E)"],
    pseudocode:
`1. 创建栈 S，将起点压入
2. 标记起点为已访问
3. while S 不为空:
    4. 弹出栈顶节点 u
    5. if u == 终点: 返回路径
    6. for u 的每个邻居 v:
        7. if v 未被访问:
            8. 标记 v 为已访问
            9. v 的父节点设为 u
            10. 将 v 压入栈`,
  },
  "A*": {
    explanation: "A* 是一种聪明的搜索算法。它不仅考虑已经走了多远，还会估算离终点还有多远——就像人会优先选择朝向终点的方向。这个估算叫做启发函数。因为它有方向感，所以通常比 BFS 搜索的格子更少。",
    analogy: "就像你用导航软件，导航不仅知道你走了多远，还知道目的地在哪里，所以能给你更聪明的路线建议。",
    pros: ["搜索效率高，搜索节点少", "保证最短路径（使用合适的启发函数）", "运行速度快"],
    cons: ["依赖启发函数的质量", "如果启发函数不准，可能退化为 BFS"],
    key_points: ["利用距离估计来引导搜索", "f(n) = g(n) + h(n)", "h(n) 启发函数影响效率"],
    pseudocode:
`1. 创建优先队列 PQ，将起点加入
2. g[起点] = 0
3. while PQ 不为空:
    4. 取出 f 值最小的节点 u
    5. if u == 终点: 返回路径
    6. for u 的每个邻居 v:
        7. tentative_g = g[u] + 1
        8. if tentative_g < g[v]:
            9. g[v] = tentative_g
            10. f[v] = g[v] + h(v, 终点)   ← h 是启发函数
            11. 将 v 加入 PQ`,
  },
  RANDOM: {
    explanation: "随机策略没有策略——它每一步都随机选一个方向走。就像在迷宫里闭着眼睛乱走。它的作用是作为对照组，让我们看到有策略的算法到底好多少。",
    analogy: "就像抽奖——全靠运气，基本不靠谱，但可以用来对比其他算法的价值。",
    pros: ["简单直观", "能让其他算法的优势一目了然"],
    cons: ["成功率极低", "路径非常长", "不可靠"],
    key_points: ["完全随机选择方向", "没有策略和方向感", "用作弱 baseline"],
    pseudocode:
`1. current = 起点
2. for step = 1 to max_steps:
    3. if current == 终点: 返回路径
    4. 随机选择一个邻居
    5. current = 选择的邻居
6. 未找到终点（失败）`,
  },
  DIJKSTRA: {
    explanation: "Dijkstra 算法像 BFS 的哥哥——它不仅考虑走多远，还给每条路径标上「代价」。在均匀网格中所有格子代价相同，所以效果和 BFS 一样。但如果是「有坡度」的地图（不同格子代价不同），Dijkstra 就会自动避开高代价的格子，找到代价最低的路径。",
    analogy: "就像你选上班路线——不只是看距离，还会考虑堵不堵车、要不要爬坡。最短的不一定最轻松，Dijkstra 帮你找最轻松的。",
    pros: ["保证代价最低的路径", "支持每条边权重不同", "是很多路由算法的基础"],
    cons: ["均匀网格上和 BFS 一样", "需要优先队列"],
    key_points: ["统一代价搜索", "贪心地扩展代价最小的节点", "f(n) = g(n) 无启发", "Dijkstra → A* 的前身"],
    pseudocode:
`1. 创建优先队列 PQ，将起点加入 (cost=0)
2. cost[起点] = 0
3. while PQ 不为空:
    4. 取出 cost 最小的节点 u
    5. if u == 终点: 返回路径
    6. for u 的每个邻居 v:
        7. new_cost = cost[u] + 1
        8. if new_cost < cost[v]:
            9. cost[v] = new_cost
            10. v 的父节点 = u
            11. 将 v 加入 PQ`,
  },
  GREEDY: {
    explanation: "贪心算法只看「离终点还有多远」，完全不考虑已经走了多少步。它总是往离终点最近的方向冲——就像一个人只看终点方向不看路。在简单迷宫里可能很快，但在复杂迷宫（如 U 型）里可能先冲进去发现是死路再绕回来，结果走了很远。",
    analogy: "就像你爬山时只盯着山顶的方向冲——有时能快速登顶，但如果前面是悬崖，就要绕一大圈。A* 比它聪明就是因为 A* 不光看离山顶多远，还看自己已经爬了多久。",
    pros: ["搜索节点极少", "在开阔地形中极快", "思路简单直观"],
    cons: ["不保证最短路径", "复杂迷宫中可能绕远", "没有全局观"],
    key_points: ["只看启发值 h(n)", "忽略已走路程 g(n)", "最快但不一定最短路", "对比 A* 理解 g(n) 的价值"],
    pseudocode:
`1. 创建优先队列 PQ，将起点加入 (h值)
2. 标记起点为已访问
3. while PQ 不为空:
    4. 取出 h 值最小的节点 u
    5. if u == 终点: 返回路径
    6. for u 的每个邻居 v:
        7. if v 未被访问:
            8. 标记 v 已访问
            9. 将 v 加入 PQ (按 h(v))`,
  },
  BIDIRECTIONAL: {
    explanation: "双向 BFS 同时从起点和终点出发，两个搜索前沿像两个水波一样向外扩散，当它们在中间相遇时就找到了路径。因为两边各搜一半距离，总搜索量减半。但它必须确保两边「同步」推进，否则一边搜完了另一边还没动，效率反而变差。",
    analogy: "就像两个人分别从迷宫入口和出口同时往中间走，约好在中间碰面。比起一个人走完全程，两个人各走一半当然更快。",
    pros: ["搜索节点大幅减少", "保证最短路径", "对大迷宫效果显著"],
    cons: ["需要维护两个搜索前沿", "实现比单向 BFS 复杂", "两个方向必须同步"],
    key_points: ["起点+终点同时扩散", "相遇点重建完整路径", "约减少一半搜索量", "最佳加速方案之一"],
    pseudocode:
`1. 创建两个队列: Q_start, Q_goal
2. 两个 visited 集合 + parent 字典
3. while 两个队列都不为空:
    4. 从起点方向扩展一层
    5. if 新节点在对方 visited 中: 找到交点
    6. 从终点方向扩展一层
    7. if 新节点在对方 visited 中: 找到交点
8. 从交点分别回溯到起点和终点`,
  },
  IDDFS: {
    explanation: "迭代加深 DFS 的想法很巧妙：DFS 太深可能导致不最优，BFS 内存太大，那就折中——先限制深度 0 搜一次，没找到就深度 1 再搜一次，深度 2……这样既像 BFS 一样能找到最短路径，又像 DFS 一样省内存。代价是浅层节点会被重复搜索。",
    analogy: "就像你在停车场找车——先看离你 1 排的范围，没找到就看 2 排，再看 3 排……虽然每次都要重新看近处的车位，但保证你用的脑容量（内存）不多。",
    pros: ["内存占用极小", "保证最短路径", "适合内存受限场景"],
    cons: ["重复搜索同一区域", "深度大时非常慢", "不适合超大迷宫"],
    key_points: ["DFS + 深度限制循环", "内存 O(d)，时间 O(b^d)", "渐进加深保证最优", "折中 BFS/DFS 优劣"],
    pseudocode:
`1. for depth = 0, 1, 2, ...:
    2. 用 DFS 搜索，但深度不超过 depth
    3. if 找到终点: 返回路径
    4. if 当前深度无法找到新节点: 退出
    5. depth++ 增加深度限制，重新搜索`,
  },
};
