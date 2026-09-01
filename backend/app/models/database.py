"""数据库模型 — 设计文档 §10"""

from sqlalchemy import create_engine, Column, Integer, String, Text, Float, DateTime, ForeignKey, func, inspect, text, event, Index
from sqlalchemy.orm import DeclarativeBase, sessionmaker, relationship

from app.config import settings, DATA_DIR

# P2：数据库路径锚定 backend/data/stuautor.db（由 config.database_url 提供绝对路径，
# 仍可用环境变量 DATABASE_URL 覆盖，docker-compose 传参同样生效）。
DATABASE_URL = settings.database_url
DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """SQLite 开启 WAL + busy_timeout，避免 MNIST 训练并发写表时报 database is locked"""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── 研究会话 ─────────────────────────────────────────────
class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_updated_at", "updated_at"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String(64), default="demo")
    task_id = Column(String(64), default="maze_pathfinding")
    title = Column(String(255), default="")
    status = Column(String(32), default="IN_PROGRESS")
    current_stage = Column(String(64), default="TASK_SELECTED")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    questions = relationship("Question", back_populates="session", cascade="all, delete-orphan")
    hypotheses = relationship("Hypothesis", back_populates="session", cascade="all, delete-orphan")
    designs = relationship("ExperimentDesign", back_populates="session", cascade="all, delete-orphan")
    runs = relationship("ExperimentRun", back_populates="session", cascade="all, delete-orphan")
    classify_runs = relationship("ClassifyRun", back_populates="session", cascade="all, delete-orphan")
    guess_runs = relationship("GuessRun", back_populates="session", cascade="all, delete-orphan")
    sorting_runs = relationship("SortingRun", back_populates="session", cascade="all, delete-orphan")
    string_search_runs = relationship("StringSearchRun", back_populates="session", cascade="all, delete-orphan")
    shape_recog_runs = relationship("ShapeRecogRun", back_populates="session", cascade="all, delete-orphan")
    digits_runs = relationship("DigitsRun", back_populates="session", cascade="all, delete-orphan")
    imagerecog_runs = relationship("ImageRecogRun", back_populates="session", cascade="all, delete-orphan")
    mnist_runs = relationship("MNISTRun", back_populates="session", cascade="all, delete-orphan")
    rl_runs = relationship("RLRun", back_populates="session", cascade="all, delete-orphan")
    analyses = relationship("AnalysisRecord", back_populates="session", cascade="all, delete-orphan")
    reports = relationship("ResearchReport", back_populates="session", cascade="all, delete-orphan")
    reflections = relationship("ReflectionQuestion", back_populates="session", cascade="all, delete-orphan")


# ── 研究问题 ─────────────────────────────────────────────
class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (Index("ix_questions_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    raw_question = Column(Text, default="")
    refined_question = Column(Text, default="")
    independent_variable = Column(String(128), default="")
    dependent_variables = Column(Text, default="")   # JSON list string
    controlled_variables = Column(Text, default="")  # JSON list string
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="questions")


# ── 假设 ─────────────────────────────────────────────────
class Hypothesis(Base):
    __tablename__ = "hypotheses"
    __table_args__ = (Index("ix_hypotheses_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    student_text = Column(Text, default="")
    ai_feedback = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="hypotheses")


# ── 实验设计 ─────────────────────────────────────────────
class ExperimentDesign(Base):
    __tablename__ = "experiment_designs"
    __table_args__ = (Index("ix_experiment_designs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    algorithms = Column(Text, default="")            # JSON list
    independent_variable = Column(String(128), default="obstacle_ratio")
    variable_values = Column(Text, default="")       # JSON list
    controlled_settings = Column(Text, default="")   # JSON object
    metrics = Column(Text, default="")               # JSON list
    ai_score = Column(Integer, default=0)
    ai_comment = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="designs")


# ── 实验运行 ─────────────────────────────────────────────
class ExperimentRun(Base):
    __tablename__ = "experiment_runs"
    __table_args__ = (Index("ix_experiment_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    algorithm = Column(String(32), nullable=False)
    obstacle_ratio = Column(Float, default=0.2)
    maze_size = Column(String(64), default="[12,12]")
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    success = Column(Integer, default=0)             # 0/1
    path_length = Column(Integer, default=0)
    expanded_nodes = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    path_data = Column(Text, default="")             # JSON
    visited_data = Column(Text, default="")          # JSON
    maze_data = Column(Text, default="")             # JSON
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="runs")


# ── 分析记录 ─────────────────────────────────────────────
class AnalysisRecord(Base):
    __tablename__ = "analysis_records"
    __table_args__ = (Index("ix_analysis_records_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    student_analysis = Column(Text, default="")
    ai_feedback = Column(Text, default="")
    key_findings = Column(Text, default="")          # JSON list
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="analyses")


# ── 研究报告 ─────────────────────────────────────────────
class ResearchReport(Base):
    __tablename__ = "reports"
    __table_args__ = (Index("ix_reports_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    title = Column(String(255), default="")
    content_markdown = Column(Text, default="")
    version = Column(Integer, default=1)
    question_clarity = Column(Integer, default=0)
    experiment_design = Column(Integer, default=0)
    data_completeness = Column(Integer, default=0)
    analysis_depth = Column(Integer, default=0)
    reflection_quality = Column(Integer, default=0)
    writing_clarity = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="reports")


# ── 反思问题 ─────────────────────────────────────────────
class ReflectionQuestion(Base):
    """每次实验的反思问题池 — 设计文档 §12.7"""
    __tablename__ = "reflection_questions"
    __table_args__ = (Index("ix_reflection_questions_session_task", "session_id", "task_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    task_id = Column(String(64), default="")              # 所属实验类型，用于区分同一 demo 会话下不同实验的问题
    question_text = Column(Text, nullable=False)
    category = Column(String(64), default="general")      # 类别：hypothesis/data/method/limitation/improvement
    sort_order = Column(Integer, default=0)               # 展示顺序
    is_selected = Column(Integer, default=0)              # 是否选中展示给学生 (0/1)
    student_answer = Column(Text, default="")             # 学生回答
    ai_feedback = Column(Text, default="")                # AI 启发式反馈
    template_answers = Column(Text, default="")           # JSON: [{"text":"...","score":1.0,"level":"初步"},...]
    reflection_score = Column(Float, default=0)           # 该题的科研能力得分 (0-5)
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="reflections")


# ── 图像分类实验运行 (§16.2) ─────────────────────────────
class ClassifyRun(Base):
    __tablename__ = "classify_runs"
    __table_args__ = (Index("ix_classify_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    classifier = Column(String(32), nullable=False)
    n_samples = Column(Integer, default=200)
    noise_level = Column(Float, default=0.0)
    pattern = Column(String(32), default="blobs")
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    accuracy = Column(Float, default=0)
    precision_data = Column(Text, default="")       # JSON list
    recall_data = Column(Text, default="")          # JSON list
    f1_data = Column(Text, default="")              # JSON list
    runtime_ms = Column(Float, default=0)
    points_data = Column(Text, default="")          # JSON [[x,y],...]
    labels_data = Column(Text, default="")          # JSON [0,1,...]
    predictions_data = Column(Text, default="")     # JSON [0,1,...]
    boundary_data = Column(Text, default="")        # JSON {grid_predictions, grid_shape, x_range, y_range}
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="classify_runs")


# ── 猜数字实验运行 ─────────────────────────────────────────
class GuessRun(Base):
    __tablename__ = "guess_runs"
    __table_args__ = (Index("ix_guess_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    strategy = Column(String(32), nullable=False)
    number_low = Column(Integer, default=1)
    number_high = Column(Integer, default=100)
    target = Column(Integer, default=50)
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    guesses = Column(Integer, default=0)
    history_data = Column(Text, default="")          # JSON list of guesses
    success = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="guess_runs")


# ── 排序算法实验运行 ──────────────────────────────────────
class SortingRun(Base):
    __tablename__ = "sorting_runs"
    __table_args__ = (Index("ix_sorting_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    algorithm = Column(String(32), nullable=False)
    array_size = Column(Integer, default=20)
    pattern = Column(String(32), default="random")
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    swaps = Column(Integer, default=0)
    comparisons = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    original_data = Column(Text, default="")
    result_data = Column(Text, default="")
    steps_data = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="sorting_runs")


# ── 字符串搜索实验运行 ────────────────────────────────────
class StringSearchRun(Base):
    __tablename__ = "string_search_runs"
    __table_args__ = (Index("ix_string_search_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    algorithm = Column(String(32), nullable=False)
    text_length = Column(Integer, default=500)
    pattern_length = Column(Integer, default=5)
    pattern_type = Column(String(32), default="random")
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    matches = Column(Integer, default=0)
    comparisons = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    text_data = Column(Text, default="")
    pattern_data = Column(Text, default="")
    match_positions = Column(Text, default="")
    steps_data = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="string_search_runs")


# ── 图形识别实验运行 ──────────────────────────────────────
class ShapeRecogRun(Base):
    __tablename__ = "shape_recog_runs"
    __table_args__ = (Index("ix_shape_recog_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    algorithm = Column(String(32), nullable=False)
    n_samples = Column(Integer, default=200)
    noise_level = Column(Float, default=0.0)
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    accuracy = Column(Float, default=0)
    correct = Column(Integer, default=0)
    total = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    train_ratio = Column(Float, default=0.7)
    test_grids_data = Column(Text, default="")
    test_labels_data = Column(Text, default="")
    predictions_data = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="shape_recog_runs")



# ── 手写数字识别实验运行 ──────────────────────────────────
class DigitsRun(Base):
    __tablename__ = "digits_runs"
    __table_args__ = (Index("ix_digits_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    algorithm = Column(String(32), nullable=False)
    n_samples = Column(Integer, default=200)
    noise_level = Column(Float, default=0.0)
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    accuracy = Column(Float, default=0)
    correct = Column(Integer, default=0)
    total = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    train_ratio = Column(Float, default=0.7)
    test_grids_data = Column(Text, default="")
    test_labels_data = Column(Text, default="")
    predictions_data = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="digits_runs")


# ── 统一图像识别实验运行（§16.2 合并模块）──────────────────
class ImageRecogRun(Base):
    __tablename__ = "imagerecog_runs"
    __table_args__ = (Index("ix_imagerecog_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    experiment_type = Column(String(16), default="shape")  # "shape" | "digits"
    algorithm = Column(String(32), nullable=False)
    n_samples = Column(Integer, default=200)
    noise_level = Column(Float, default=0.0)
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    accuracy = Column(Float, default=0)
    correct = Column(Integer, default=0)
    total = Column(Integer, default=0)
    runtime_ms = Column(Float, default=0)
    train_ratio = Column(Float, default=0.7)
    params_used = Column(Text, default="")          # JSON: {hidden: 64, epochs: 30, ...}
    test_grids_data = Column(Text, default="")       # JSON: [[[0,1,...],...],...]
    test_labels_data = Column(Text, default="")      # JSON: ["circle","square",...] or [0,1,3,...]
    predictions_data = Column(Text, default="")      # JSON: same as above
    viz_steps_data = Column(Text, default="")        # JSON: [{testIndex,grid,trueLabel,predictedLabel,correct},...]
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="imagerecog_runs")


# ── MNIST 手写数字识别实验运行 ────────────────────────────
class MNISTRun(Base):
    __tablename__ = "mnist_runs"
    __table_args__ = (Index("ix_mnist_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    architecture_id = Column(String(64), default="standardcnn")
    architecture_json = Column(Text, default="")       # JSON
    hyperparams_json = Column(Text, default="")         # JSON
    seed = Column(Integer, default=42)
    train_losses = Column(Text, default="")             # JSON array
    train_accs = Column(Text, default="")               # JSON array
    val_losses = Column(Text, default="")               # JSON array
    val_accs = Column(Text, default="")                 # JSON array
    test_accuracy = Column(Float, default=0)
    test_loss = Column(Float, default=0)
    best_epoch = Column(Integer, default=0)
    training_time = Column(Float, default=0)
    overfitting_score = Column(Float, default=0)
    confusion_matrix = Column(Text, default="")         # JSON 10×10
    runtime_ms = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="mnist_runs")


# ── 强化学习格子世界实验运行 ────────────────────────────
class RLRun(Base):
    __tablename__ = "rl_runs"
    __table_args__ = (Index("ix_rl_runs_session_id", "session_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    batch_id = Column(String(64), default="")
    agent = Column(String(32), nullable=False)
    grid_size = Column(Integer, default=8)
    num_traps = Column(Integer, default=3)
    num_episodes = Column(Integer, default=500)
    learning_rate = Column(Float, default=0.1)
    discount = Column(Float, default=0.9)
    epsilon = Column(Float, default=0.1)
    trial = Column(Integer, default=1)
    seed = Column(Integer, default=0)
    train_rewards = Column(Text, default="")
    train_success = Column(Text, default="")
    avg_reward = Column(Float, default=0)
    success_rate = Column(Float, default=0)
    test_success = Column(Integer, default=0)
    test_reward = Column(Float, default=0)
    test_path = Column(Text, default="")
    world_json = Column(Text, default="")
    test_world_json = Column(Text, default="")
    runtime_ms = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="rl_runs")


# ── 初始化 ───────────────────────────────────────────────
def get_db():
    """Dependency: 获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_reflection_task_id()
    _migrate_indexes()


# P2：高频查询列索引（与各模型 __table_args__ 保持一致）。
# create_all 不会给已存在的旧库补索引，这里用幂等 CREATE INDEX IF NOT EXISTS 迁移。
_INDEX_SQL = [
    "CREATE INDEX IF NOT EXISTS ix_sessions_updated_at ON sessions (updated_at)",
    "CREATE INDEX IF NOT EXISTS ix_questions_session_id ON questions (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_hypotheses_session_id ON hypotheses (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_experiment_designs_session_id ON experiment_designs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_experiment_runs_session_id ON experiment_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_analysis_records_session_id ON analysis_records (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_reports_session_id ON reports (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_reflection_questions_session_task ON reflection_questions (session_id, task_id)",
    "CREATE INDEX IF NOT EXISTS ix_classify_runs_session_id ON classify_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_guess_runs_session_id ON guess_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_sorting_runs_session_id ON sorting_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_string_search_runs_session_id ON string_search_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_shape_recog_runs_session_id ON shape_recog_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_digits_runs_session_id ON digits_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_imagerecog_runs_session_id ON imagerecog_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_mnist_runs_session_id ON mnist_runs (session_id)",
    "CREATE INDEX IF NOT EXISTS ix_rl_runs_session_id ON rl_runs (session_id)",
]


def _migrate_indexes():
    """为已有数据库补充高频查询列索引（幂等，缺失表自动跳过）。"""
    try:
        with engine.begin() as conn:
            for stmt in _INDEX_SQL:
                conn.execute(text(stmt))
    except Exception:
        pass


def _migrate_reflection_task_id():
    """为已有数据库的 reflection_questions 表补充 task_id 列（旧库升级，幂等）。"""
    try:
        if "reflection_questions" in inspect(engine).get_table_names():
            cols = {c["name"] for c in inspect(engine).get_columns("reflection_questions")}
            if "task_id" not in cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE reflection_questions ADD COLUMN task_id VARCHAR(64) DEFAULT ''"))
    except Exception:
        pass
