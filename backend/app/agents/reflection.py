"""反思 Agent — 设计文档 §8.6 + §14.4"""

from .base_agent import BaseAgent


class ReflectionAgent(BaseAgent):
    """引导学生在实验后进行结构化反思"""

    name = "reflection"

    def respond(self, context: dict) -> dict:
        conclusion = context.get("student_conclusion", "")
        results = context.get("experiment_results", {})
        algorithms = context.get("algorithms", [])

        questions = self._build_questions(conclusion, algorithms)
        suggestions = self._build_suggestions(results)

        return {
            "questions": questions,
            "suggestions": suggestions,
            "reflection_prompt": (
                "很好，你已经有了初步反思。请继续思考实验的局限性和下一步改进方向。"
                if conclusion else
                "请花几分钟认真思考以上问题，把你的想法写下来——这些反思是你研究报告中最重要的部分。"
            ),
        }

    def _build_questions(self, conclusion: str, algorithms: list[str]) -> list[str]:
        qs = [
            "你的实验结果支持最初假设吗？为什么？请用数据说明。",
            "实验中是否出现了意料之外的结果？如果有，你如何解释？",
            "如果重新设计这个实验，你会改变哪些方面？为什么？",
        ]
        if conclusion:
            qs.insert(0, "你对自己的实验结论有多大把握？")
        if "RANDOM" in algorithms or "Random Walk" in algorithms:
            qs.append("随机策略的失败对你有什么启发？为什么有策略的算法更有效？")
        if len(algorithms) >= 3:
            qs.append("算法之间表现差异最大的地方是什么？这可能意味着什么？")
        return qs[:5]

    def _build_suggestions(self, results: dict) -> list[str]:
        suggestions = [
            "尝试改变迷宫大小（如 20×20），观察算法表现是否一致",
            "增加每个条件下的重复次数到 10 次，减少随机波动的影响",
            "尝试记录每个算法搜索过程的动画差异",
        ]
        if isinstance(results, dict) and len(results) > 1:
            worst = max(results.items(), key=lambda x: x[1].get("avg_expanded_nodes", 0) if isinstance(x[1], dict) else 0)
            suggestions.append(f"思考：{worst[0]} 为什么搜索了这么多节点？它的策略有什么问题？")
        return suggestions[:5]
