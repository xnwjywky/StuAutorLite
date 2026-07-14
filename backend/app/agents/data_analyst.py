"""数据分析 Agent — 设计文档 §8.5 + §14.3"""

from .base_agent import BaseAgent


class DataAnalyst(BaseAgent):
    """分析实验结果，对比学生假设，引导深入思考"""

    name = "data_analyst"

    def respond(self, context: dict) -> dict:
        summary_data = context.get("experiment_results", context.get("summary", {}))
        hypothesis = context.get("hypothesis", "")

        if not summary_data:
            return {
                "summary": "暂无实验数据可供分析。请先运行实验。",
                "key_findings": [],
                "questions_for_student": ["你预测哪个算法会表现最好？为什么？"],
                "comparison_with_hypothesis": "",
            }

        findings = self._analyze(summary_data)
        qs = self._generate_questions(summary_data)

        return {
            "summary": self._build_summary(summary_data),
            "key_findings": findings,
            "questions_for_student": qs,
            "comparison_with_hypothesis": self._compare_hypothesis(summary_data, hypothesis),
        }

    # ── private ───────────────────────────────────────────

    def _analyze(self, data: dict) -> list[str]:
        findings: list[str] = []
        entries = [(k, v) for k, v in data.items() if isinstance(v, dict)]

        # 找最优
        best_nodes = min(entries, key=lambda x: x[1].get("avg_expanded_nodes", 1e9), default=None)
        best_time = min(entries, key=lambda x: x[1].get("avg_runtime_ms", 1e9), default=None)
        best_path = min(entries, key=lambda x: x[1].get("avg_path_length") or 1e9, default=None)

        if best_nodes:
            findings.append(f"{best_nodes[0]} 搜索节点数最少（{best_nodes[1].get('avg_expanded_nodes', 0):.0f}），说明搜索效率最高")
        if best_time and best_time[0] != best_nodes[0]:
            findings.append(f"{best_time[0]} 运行速度最快（{best_time[1].get('avg_runtime_ms', 0):.1f} ms）")

        # A* vs BFS
        a_data = data.get("A*", {})
        b_data = data.get("BFS", {})
        if a_data and b_data:
            a_exp = a_data.get("avg_expanded_nodes", 0)
            b_exp = b_data.get("avg_expanded_nodes", 0)
            if a_exp < b_exp:
                findings.append(f"A* 搜索节点（{a_exp:.0f}）仅为 BFS（{b_exp:.0f}）的 {a_exp / max(b_exp, 1) * 100:.0f}%，启发函数大幅缩小了搜索范围")

        # 成功率
        for algo, stats in entries:
            sr = stats.get("success_rate", 1)
            if sr < 0.5:
                findings.append(f"{algo} 成功率仅 {sr * 100:.0f}%，说明该策略在此条件下不可靠")
            elif 0.5 <= sr < 1:
                findings.append(f"{algo} 成功率 {sr * 100:.0f}%，结果不够稳定")

        return findings[:5] or ["实验数据已生成，请查看图表对比不同算法的表现"]

    def _generate_questions(self, data: dict) -> list[str]:
        return [
            "你的假设是否得到了数据支持？哪些地方支持，哪些不支持？",
            "如果改变迷宫障碍物比例，你认为结果会有什么变化？",
            "启发函数对 A* 的优势贡献有多大？你能设计实验验证吗？",
        ]

    def _build_summary(self, data: dict) -> str:
        entries = list(data.items())
        if not entries:
            return "暂无数据"
        best = min(entries, key=lambda x: x[1].get("avg_expanded_nodes", 1e9) if isinstance(x[1], dict) else 1e9)
        return (
            f"实验完成，共分析 {len(entries)} 个算法。"
            f"整体来看，{best[0]} 搜索效率最高，"
            f"平均探索 {best[1].get('avg_expanded_nodes', 0):.0f} 个节点。"
        )

    def _compare_hypothesis(self, data: dict, hypothesis: str) -> str:
        if not hypothesis:
            return ""
        # 简单启发式检查假设中提到的算法
        mentioned = [a for a in data if a in hypothesis]
        if not mentioned:
            return f"你的假设提到了某些算法，但当前数据中没有相关结果。请确认实验已运行了假设中涉及的算法。"
        # 检查假设提到的算法是否表现最优
        best = min(data.items(), key=lambda x: x[1].get("avg_expanded_nodes", 1e9) if isinstance(x[1], dict) else 1e9)
        if best[0] in mentioned:
            return f"你的假设提到了 {', '.join(mentioned)}，其中 {best[0]} 确实是搜索效率最优的算法——数据支持你的假设。"
        return f"你的假设认为 {', '.join(mentioned)} 表现更好，但数据显示 {best[0]} 搜索节点更少。建议重新审视你的假设依据。"
