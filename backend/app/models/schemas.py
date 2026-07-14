"""Pydantic schemas — 设计文档 §10 + §11"""

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


class QuestionSuggestResponse(BaseModel):
    suggested_questions: list[str]


class QuestionResponse(BaseModel):
    id: int
    session_id: int
    raw_question: str
    refined_question: str
    independent_variable: str
    dependent_variables: list[str]
    controlled_variables: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 假设 ─────────────────────────────────────────────────
class HypothesisCreate(BaseModel):
    session_id: int
    student_text: str = ""


class HypothesisResponse(BaseModel):
    id: int
    session_id: int
    student_text: str
    ai_feedback: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 实验设计 ─────────────────────────────────────────────
class ExperimentDesignCreate(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=list)
    independent_variable: str = "obstacle_ratio"
    variable_values: list[float] = Field(default_factory=list)
    controlled_settings: dict = Field(default_factory=dict)
    metrics: list[str] = Field(default_factory=list)


class ExperimentDesignReviewResponse(BaseModel):
    score: int
    is_valid: bool
    feedback: str
    suggested_revision: dict = Field(default_factory=dict)


# ── 实验运行 ─────────────────────────────────────────────
class ExperimentRunRequest(BaseModel):
    session_id: int
    algorithms: list[str] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


class ExperimentSummaryResponse(BaseModel):
    experiment_batch_id: str
    status: str
    summary: dict
    total_runs: int
    runs: list[dict] = Field(default_factory=list)


# ── 分析 ─────────────────────────────────────────────────
class AnalysisCreate(BaseModel):
    session_id: int
    student_analysis: str = ""


class AnalysisAnalyzeRequest(BaseModel):
    session_id: int
    student_hypothesis: str = ""


class AnalysisResponse(BaseModel):
    id: int
    session_id: int
    student_analysis: str
    ai_feedback: str
    key_findings: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 报告 ─────────────────────────────────────────────────
class ReportGenerateRequest(BaseModel):
    session_id: int
    include_student_original_text: bool = True


class ReportResponse(BaseModel):
    id: int
    session_id: int
    title: str
    content_markdown: str
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 审稿 ─────────────────────────────────────────────────
class ReviewRequest(BaseModel):
    session_id: int


class ReviewScoresResponse(BaseModel):
    question_clarity: int = 0
    experiment_design: int = 0
    data_completeness: int = 0
    analysis_depth: int = 0
    reflection_quality: int = 0
    writing_clarity: int = 0


class ReviewResponse(BaseModel):
    scores: ReviewScoresResponse
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    revision_suggestions: list[str] = Field(default_factory=list)
    review_questions: list[str] = Field(default_factory=list)


# ── 反思问题 ─────────────────────────────────────────────
class ReflectionQuestionCreate(BaseModel):
    session_id: int

class ReflectionAnswerSave(BaseModel):
    student_answer: str = ""

class ReflectionQuestionResponse(BaseModel):
    id: int
    session_id: int
    question_text: str
    category: str = ""
    sort_order: int = 0
    is_selected: bool = False
    student_answer: str = ""
    ai_feedback: str = ""
    created_at: str = ""


# ── Agent 通用 ───────────────────────────────────────────
class AgentInvokeRequest(BaseModel):
    session_id: int
    context: dict = Field(default_factory=dict)


class AgentInvokeResponse(BaseModel):
    agent_name: str
    result: dict


# ── 图像分类实验 (§16.2) ──────────────────────────────────
class ClassifyRunRequest(BaseModel):
    session_id: int
    classifiers: list[str] = Field(default_factory=lambda: ["KNN", "DECISION_TREE", "RANDOM"])
    settings: dict = Field(default_factory=dict)
