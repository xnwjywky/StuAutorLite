"""审稿 Agent — 设计文档 §8.7 + §14.5"""

from .base_agent import BaseAgent


class Reviewer(BaseAgent):
    """六维评价报告，给出优缺和改进建议"""

    name = "reviewer"

    def respond(self, context: dict) -> dict:
        report = context.get("report", "")
        has_hypothesis = context.get("has_hypothesis", False)
        has_data = context.get("has_data", False)
        has_reflection = context.get("has_reflection", False)
        report_len = len(report or "")

        return self._evaluate(report_len, has_hypothesis, has_data, has_reflection)

    def _evaluate(self, length: int, has_h: bool, has_d: bool, has_r: bool) -> dict:
        scores = {
            "question_clarity":   self._score(length > 50, 3, 4),
            "experiment_design":  self._score(has_d, 3, 4),
            "data_completeness":  self._score(has_d, 2, 4),
            "analysis_depth":     self._score(length > 300, 3, 4),
            "reflection_quality": self._score(has_r, 2, 4),
            "writing_clarity":    self._score(length > 200, 3, 4),
        }

        strengths = []
        weaknesses = []

        if length > 200:
            strengths.append("报告结构完整，包含了研究问题、实验设计和结果分析")
        else:
            weaknesses.append("报告内容偏少，建议补充更多实验结果和详细分析")
            strengths.append("开始了研究报告的撰写，这是一个好的起点")

        if has_h:
            strengths.append("能够提前做出假设，然后再用数据验证，体现了科学思维")
        else:
            weaknesses.append("缺少实验假设部分，建议先写出预测再验证")

        if has_d:
            strengths.append("收集了实验数据来支撑你的结论")
        else:
            weaknesses.append("缺少实验数据展示，结论缺乏数据支撑")

        if has_r:
            strengths.append("对自己的研究进行了反思，能够看到实验的局限性")
        else:
            weaknesses.append("可以补充对实验局限性的思考和下一步改进方向")

        return {
            "scores": scores,
            "strengths": strengths or ["你开始了研究报告的撰写，这是科学探索的第一步"],
            "weaknesses": weaknesses,
            "revision_suggestions": [
                "用表格或图表展示实验数据，让结果更直观",
                "补充实验的局限性和改进方向",
                "尝试用数据解释为什么某些算法表现更好",
                "增加实验重复次数，让结论更可靠",
            ],
            "review_questions": [
                "你的结论是基于数据还是直觉？",
                "如果你要告诉另一个同学你的发现，你会怎么说？",
                "如果迷宫再大一倍，你认为哪个算法最受影响？",
            ],
        }

    def _score(self, condition: bool, low: int, high: int) -> int:
        return high if condition else low
