"""Agent 输出 JSON Schema — 设计文档 §20.4"""

# ── Research Mentor 输出结构 ──────────────────────────────
RESEARCH_MENTOR_OUTPUT = {
    "type": "object",
    "required": ["suggested_questions"],
    "properties": {
        "suggested_questions": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 3,
            "description": "2-3 个可实验的研究问题",
        },
        "explanation": {
            "type": "string",
            "description": "对问题转化的简短解释，面向学生",
        },
    },
}

# ── Experiment Designer 输出结构 ──────────────────────────
EXPERIMENT_DESIGNER_OUTPUT = {
    "type": "object",
    "required": ["score", "is_valid", "feedback"],
    "properties": {
        "score": {
            "type": "integer",
            "minimum": 1,
            "maximum": 5,
            "description": "实验设计评分",
        },
        "is_valid": {
            "type": "boolean",
            "description": "是否可以运行",
        },
        "feedback": {
            "type": "string",
            "description": "面向学生的简短解释",
        },
        "suggested_revision": {
            "type": "object",
            "description": "修改建议（键值对）",
        },
    },
}

# ── Data Analyst 输出结构 ─────────────────────────────────
DATA_ANALYST_OUTPUT = {
    "type": "object",
    "required": ["summary", "key_findings", "questions_for_student"],
    "properties": {
        "summary": {
            "type": "string",
            "description": "最明显的结果总结",
        },
        "key_findings": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 5,
        },
        "questions_for_student": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 3,
        },
        "comparison_with_hypothesis": {
            "type": "string",
            "description": "结果与假设的对比说明",
        },
    },
}

# ── Reflection 输出结构 ───────────────────────────────────
REFLECTION_OUTPUT = {
    "type": "object",
    "required": ["questions", "suggestions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": 6,
        },
        "suggestions": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 5,
        },
        "reflection_prompt": {
            "type": "string",
        },
    },
}

# ── Reviewer 输出结构 ─────────────────────────────────────
REVIEWER_OUTPUT = {
    "type": "object",
    "required": ["scores", "strengths", "weaknesses", "revision_suggestions"],
    "properties": {
        "scores": {
            "type": "object",
            "required": [
                "question_clarity",
                "experiment_design",
                "data_completeness",
                "analysis_depth",
                "reflection_quality",
                "writing_clarity",
            ],
            "properties": {
                "question_clarity":    {"type": "integer", "minimum": 1, "maximum": 5},
                "experiment_design":   {"type": "integer", "minimum": 1, "maximum": 5},
                "data_completeness":   {"type": "integer", "minimum": 1, "maximum": 5},
                "analysis_depth":      {"type": "integer", "minimum": 1, "maximum": 5},
                "reflection_quality":  {"type": "integer", "minimum": 1, "maximum": 5},
                "writing_clarity":     {"type": "integer", "minimum": 1, "maximum": 5},
            },
        },
        "strengths":            {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "weaknesses":           {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "revision_suggestions": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "review_questions":     {"type": "array", "items": {"type": "string"}, "maxItems": 3},
    },
}

# ── Algorithm Tutor 输出结构 ──────────────────────────────
ALGORITHM_TUTOR_OUTPUT = {
    "type": "object",
    "required": ["explanation", "key_points"],
    "properties": {
        "explanation": {
            "type": "string",
            "description": "通俗算法解释",
        },
        "key_points": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 5,
            "description": "关键概念总结",
        },
        "analogy": {
            "type": "string",
            "description": "类比说明",
        },
    },
}

# ── 注册表 ────────────────────────────────────────────────
OUTPUT_SCHEMAS = {
    "research_mentor":      RESEARCH_MENTOR_OUTPUT,
    "experiment_designer":  EXPERIMENT_DESIGNER_OUTPUT,
    "data_analyst":         DATA_ANALYST_OUTPUT,
    "reflection":           REFLECTION_OUTPUT,
    "reviewer":             REVIEWER_OUTPUT,
    "algorithm_tutor":      ALGORITHM_TUTOR_OUTPUT,
}
