"""算法讲解 Agent — 设计文档 §8.2 + §18.3 P1"""

from .base_agent import BaseAgent

# 内置算法知识库（离线 fallback）
ALGO_KNOWLEDGE: dict[str, dict] = {
    "BFS": {
        "explanation": (
            "BFS 就像在池塘里扔一颗石子，水波一圈一圈向外扩散。"
            "它从起点开始，先检查所有距离为 1 的格子，再检查距离为 2 的格子……"
            "层层推进，直到找到终点。所以它找到的路径一定是最短的。"
        ),
        "analogy": "就像你在图书馆里一排一排地找一本特定的书，虽然慢但一定能找到，而且不会漏掉。",
        "pros": ["一定能找到最短路径", "结果稳定，每次结果都一样", "适合做基准对比"],
        "cons": ["搜索的节点很多", "迷宫很大时比较慢", "内存占用较大"],
        "key_points": ["层层搜索，先近后远", "保证最短路径", "适合不知道终点位置的场景"],
    },
    "DFS": {
        "explanation": (
            "DFS 就像一个人走在迷宫里，它会一直沿着一条路走下去，"
            "直到走不通了才回头换一条路。"
            "这种策略可能很快找到终点（如果运气好），但也可能绕很远的路。"
        ),
        "analogy": "就像你在森林里一直朝一个方向走，撞到墙就返回分岔点换方向，有时候能快速穿过去，有时候会绕一大圈。",
        "pros": ["有时能非常快地找到路径", "内存占用小"],
        "cons": ["不一定能找到最短路径", "结果不稳定，受搜索顺序影响大", "可能陷入很深的分支"],
        "key_points": ["一条路走到底", "不保证最短路径", "速度快但不稳定"],
    },
    "A*": {
        "explanation": (
            "A* 是一种聪明的搜索算法。它不仅考虑已经走了多远，"
            "还会估算离终点还有多远——就像人走路时会优先选择朝向终点的方向。"
            "这个估算叫做启发函数。"
            "因为它有方向感，所以通常比 BFS 搜索的格子更少。"
        ),
        "analogy": "就像你用导航软件，导航不仅知道你走了多远，还知道目的地在哪里，所以能给你更聪明的路线建议。",
        "pros": ["搜索效率高，搜索节点少", "保证最短路径（使用合适的启发函数）", "运行速度快"],
        "cons": ["依赖启发函数的质量", "如果启发函数不准，可能退化为 BFS"],
        "key_points": ["利用距离估计来引导搜索方向", "搜索节点少但结果好", "适合知道终点位置的场景"],
    },
    "RANDOM": {
        "explanation": (
            "随机策略没有策略——它每一步都随机选一个方向走。"
            "就像在迷宫里闭着眼睛乱走。大部分时候找不到终点，"
            "即使找到了路径也特别长。"
            "它的作用是作为对照组，让我们看到有策略的算法到底好多少。"
        ),
        "analogy": "就像抽奖——全靠运气，基本不靠谱，但可以用来对比其他算法的价值。",
        "pros": ["简单直观", "能让其他算法的优势一目了然"],
        "cons": ["成功率极低", "路径非常长", "不可靠"],
        "key_points": ["完全随机，没有策略", "用作对照的 baseline", "体现算法策略的价值"],
    },
}


class AlgorithmTutor(BaseAgent):
    """用通俗语言和类比解释算法原理"""

    name = "algorithm_tutor"

    def respond(self, context: dict) -> dict:
        algo = context.get("algorithm", "BFS")
        results = context.get("experiment_results", {})

        info = ALGO_KNOWLEDGE.get(algo, ALGO_KNOWLEDGE["BFS"])

        # 如果传入了该算法的实验结果，追加到解释中
        extra = ""
        if isinstance(results, dict) and algo in results:
            stats = results[algo]
            extra = (
                f"\n\n在这次实验中，{algo} 的成功率为 "
                f"{(stats.get('success_rate', 0) * 100):.0f}%，"
                f"平均搜索了 {stats.get('avg_expanded_nodes', 0):.0f} 个节点，"
                f"路径长度为 {stats.get('avg_path_length', 0)}，"
                f"运行时间 {stats.get('avg_runtime_ms', 0):.1f} ms。"
            )

        return {
            "explanation": info["explanation"] + extra,
            "key_points": info["key_points"],
            "analogy": info["analogy"],
            "pros": info["pros"],
            "cons": info["cons"],
        }
