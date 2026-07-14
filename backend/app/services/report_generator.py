"""报告生成器 — 设计文档 §7.8"""


class ReportGenerator:
    """组装 Markdown 研究报告"""

    @staticmethod
    def generate(session_data: dict) -> str:
        """将会话数据拼装为 Markdown 格式报告"""
        lines = [
            f"# {session_data.get('title', '迷宫寻路算法比较研究')}",
            "",
            "## 1. 研究问题",
            "",
            session_data.get("refined_question", session_data.get("raw_question", "")),
            "",
            "## 2. 我的假设",
            "",
            session_data.get("hypothesis", ""),
            "",
            "## 3. 实验设计",
            "",
            f"- 对比算法：{', '.join(session_data.get('algorithms', []))}",
            f"- 自变量：{session_data.get('independent_variable', '')}",
            f"- 控制变量：{session_data.get('controlled_settings', '')}",
            f"- 评价指标：{', '.join(session_data.get('metrics', []))}",
            "",
            "## 4. 实验结果",
            "",
            _build_result_table(session_data.get("summary", {})),
            "",
            "## 5. 结果分析",
            "",
            session_data.get("student_analysis", ""),
            "",
            "## 6. 反思与改进",
            "",
            session_data.get("reflection", ""),
            "",
            "## 7. 总结",
            "",
            session_data.get("conclusion", ""),
        ]
        return "\n".join(lines)

    @staticmethod
    def export_pdf(markdown_content: str) -> bytes:
        """占位 — 后续可集成 weasyprint"""
        return markdown_content.encode("utf-8")


def _build_result_table(summary: dict) -> str:
    if not summary:
        return "（暂无实验数据）"

    header = "| 算法 | 成功率 | 平均路径长度 | 平均搜索节点数 | 平均运行时间 |"
    sep = "|---:|---:|---:|---:|---:|"
    rows = []
    for algo, stats in summary.items():
        rows.append(
            f"| {algo} "
            f"| {stats.get('success_rate', 0) * 100:.0f}% "
            f"| {stats.get('avg_path_length', '-')} "
            f"| {stats.get('avg_expanded_nodes', '-')} "
            f"| {stats.get('avg_runtime_ms', '-')}ms |"
        )
    return "\n".join([header, sep] + rows)
