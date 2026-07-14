"""科研流程编排 — 设计文档 §9.2"""

STAGES = [
    "TASK_SELECTED",
    "QUESTION_DEFINED",
    "HYPOTHESIS_WRITTEN",
    "EXPERIMENT_DESIGNED",
    "EXPERIMENT_RUNNING",
    "RESULT_ANALYZED",
    "REFLECTION_COMPLETED",
    "REPORT_GENERATED",
    "REVIEW_COMPLETED",
]


class WorkflowOrchestrator:
    """科研流程状态机"""

    @staticmethod
    def next_stage(current: str) -> str | None:
        try:
            idx = STAGES.index(current)
            return STAGES[idx + 1] if idx + 1 < len(STAGES) else None
        except ValueError:
            return None

    @staticmethod
    def prev_stage(current: str) -> str | None:
        try:
            idx = STAGES.index(current)
            return STAGES[idx - 1] if idx > 0 else None
        except ValueError:
            return None

    @staticmethod
    def get_all_stages() -> list[dict]:
        return [{"key": s, "label": STAGE_LABELS.get(s, s)} for s in STAGES]


STAGE_LABELS = {
    "TASK_SELECTED": "选择研究任务",
    "QUESTION_DEFINED": "确定研究问题",
    "HYPOTHESIS_WRITTEN": "写出实验假设",
    "EXPERIMENT_DESIGNED": "设计实验",
    "EXPERIMENT_RUNNING": "运行实验",
    "RESULT_ANALYZED": "分析结果",
    "REFLECTION_COMPLETED": "反思改进",
    "REPORT_GENERATED": "生成报告",
    "REVIEW_COMPLETED": "获得审稿反馈",
}
