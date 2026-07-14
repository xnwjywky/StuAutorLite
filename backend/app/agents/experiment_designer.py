"""实验设计 Agent — 设计文档 §8.3 + §14.2"""

from .base_agent import BaseAgent


class ExperimentDesigner(BaseAgent):
    """检查实验设计的公平性和可执行性"""

    name = "experiment_designer"

    def respond(self, context: dict) -> dict:
        design = context.get("experiment_design", context)
        if isinstance(design, str):
            return {"score": 3, "is_valid": True, "feedback": "请提供结构化的实验设计信息。", "suggested_revision": {}}

        return self._review(design)

    def _review(self, design: dict) -> dict:
        algorithms = design.get("algorithms", [])
        num_trials = design.get("controlled_settings", {}).get("num_trials", 1)
        variable_values = design.get("variable_values", [])

        issues: list[str] = []
        suggestions: dict = {}

        if len(algorithms) < 2:
            issues.append("至少需要选择 2 个算法进行比较才能得出有意义的结论")
        if num_trials < 3:
            issues.append("重复次数较少（当前 {} 次），建议至少 5 次以减少随机性影响".format(num_trials))
            suggestions["num_trials"] = 5
        if len(variable_values) == 0:
            issues.append("请至少选择一个自变量值（如障碍物比例 20%）")
        if len(variable_values) > 3:
            issues.append("自变量值过多可能导致实验时间过长，建议控制在 3 个以内")

        if not issues:
            return {
                "score": 4,
                "is_valid": True,
                "feedback": "实验设计基本合理！你已经选择了对比算法、设置了控制变量，可以开始运行实验了。",
                "suggested_revision": {},
            }

        return {
            "score": max(1, 5 - len(issues)),
            "is_valid": all("必须" not in i for i in issues),
            "feedback": " ".join(issues),
            "suggested_revision": suggestions,
        }
