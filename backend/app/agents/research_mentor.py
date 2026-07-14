"""科研导师 Agent — 设计文档 §8.1 + §14.1"""

from .base_agent import BaseAgent


class ResearchMentor(BaseAgent):
    """引导学生提出并规范化研究问题"""

    name = "research_mentor"

    def respond(self, context: dict) -> dict:
        task = context.get("task", "迷宫寻路")
        interest = context.get("student_input", context.get("student_interest", ""))

        questions = self._generate_questions(task, interest)
        return {
            "suggested_questions": questions,
            "explanation": f"我把你的想法转化成了 {len(questions)} 个可实验验证的研究问题。每个问题都明确了自变量、因变量和控制变量。请选择你最感兴趣的一个。",
        }

    def _generate_questions(self, task: str, interest: str) -> list[str]:
        algo = self._extract_algo(interest) if interest else "A*"
        base = [
            f"在障碍物比例变化时，{algo} 的搜索节点数和运行时间如何变化？",
            "算法复杂度增加时，哪种搜索策略效率保持得更好？",
            "不同算法在保证找到最短路径的同时，搜索效率有何差异？",
        ]
        if interest and ("A*" in interest or "BFS" in interest):
            base = [
                f"{algo} 在不同障碍物比例的迷宫中，是否比其他算法搜索节点更少？",
                "迷宫复杂度增加时，各种算法的运行时间有什么变化？",
                "哪种算法在保证找到最短路径的同时，搜索效率最高？",
            ]
        return base

    def _extract_algo(self, text: str) -> str:
        for a in ["A*", "BFS", "DFS", "Random"]:
            if a in text:
                return a
        return "A*"
