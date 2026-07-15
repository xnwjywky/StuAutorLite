"""FastAPI 入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import sessions, questions, experiments, analysis, reports, agents, reflection, classify, guessnumber, sorting, stringsearch, shaperecog
from app.models.database import init_db
from app.config import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)

# CORS 中间件（开发阶段允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(sessions.router, prefix="/api")
app.include_router(questions.router, prefix="/api")
app.include_router(experiments.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(reflection.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(classify.router, prefix="/api")
app.include_router(guessnumber.router, prefix="/api")
app.include_router(sorting.router, prefix="/api")
app.include_router(stringsearch.router, prefix="/api")
app.include_router(shaperecog.router, prefix="/api")


@app.on_event("startup")
def on_startup():
    """应用启动时初始化数据库"""
    init_db()


@app.get("/")
def root():
    return {"message": f"Welcome to {settings.app_name} API"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
