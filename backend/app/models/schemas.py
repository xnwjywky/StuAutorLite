"""Pydantic schemas — 设计文档 §10 + §11

注：DEAD_CODE_AUDIT 清理后仅保留活跃的 Request/Create 类与 SessionResponse；
死 Response 类（0 引用）与被路由本地类遮蔽的重复定义已移除。
"""

from datetime import datetime
from pydantic import BaseModel, Field


# ── 研究会话 ─────────────────────────────────────────────
class SessionCreate(BaseModel):
    student_id: str = "demo"
    task_id: str = "maze_pathfinding"
    title: str = ""


class SessionResponse(BaseModel):
    id: int
    student_id: str
    task_id: str
    title: str
    status: str
    current_stage: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── 研究问题 ─────────────────────────────────────────────
class QuestionCreate(BaseModel):
    session_id: int
    raw_question: str = ""
    refined_question: str = ""
    independent_variable: str = ""
    dependent_variables: list[str] = Field(default_factory=list)
    controlled_variables: list[str] = Field(default_factory=list)


class QuestionSuggestRequest(BaseModel):
    session_id: int
    task_id: str = "maze_pathfinding"
    student_interest: str = ""


# ── 假设 ─────────────────────────────────────────────────
class HypothesisCreate(BaseModel):
    session_id: int
    student_text: str = ""


# ── 实验设计 ─────────────────────────────────────────────
class ExperimentDesignCreate(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=list)
    independent_variable: str = "obstacle_ratio"
    variable_values: list[float] = Field(default_factory=list)
    controlled_settings: dict = Field(default_factory=dict)
    metrics: list[str] = Field(default_factory=list)


# ── 实验运行 ─────────────────────────────────────────────
class ExperimentRunRequest(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


# ── 分析 ─────────────────────────────────────────────────
class AnalysisCreate(BaseModel):
    session_id: int
    student_analysis: str = ""


class AnalysisAnalyzeRequest(BaseModel):
    session_id: int
    student_hypothesis: str = ""


# ── 报告 ─────────────────────────────────────────────────
class ReportGenerateRequest(BaseModel):
    session_id: int
    include_student_original_text: bool = True


# ── 审稿 ─────────────────────────────────────────────────
class ReviewRequest(BaseModel):
    session_id: int


# ── 反思问题 ─────────────────────────────────────────────
class ReflectionQuestionCreate(BaseModel):
    session_id: int
    # 显式指定实验类型（前端 demo 会话没有真实 session，DB 查不到 task_id）
    task_id: str | None = None


class ReflectionAnswerSave(BaseModel):
    student_answer: str = ""


# ── Agent 通用 ───────────────────────────────────────────
class AgentInvokeRequest(BaseModel):
    session_id: int
    context: dict = Field(default_factory=dict)


# ── 图像分类实验 (§16.2) ──────────────────────────────────
class ClassifyRunRequest(BaseModel):
    session_id: int
    classifiers: list[str] = Field(default_factory=lambda: ["KNN", "DECISION_TREE", "RANDOM"])
    settings: dict = Field(default_factory=dict)
