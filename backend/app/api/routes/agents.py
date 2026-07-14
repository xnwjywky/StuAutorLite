"""多智能体交互接口 — 设计文档 §9.3 + §11"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, Hypothesis, Session as SessionModel
from app.models.schemas import AgentInvokeRequest, HypothesisCreate
from app.services.agent_gateway import get_gateway
from app.utils.llm_client import LLMClient

router = APIRouter(prefix="/agents", tags=["agents"])


def _build_llm(
    x_api_key: str | None = None,
    x_api_base: str | None = None,
    x_api_model: str | None = None,
    x_api_provider: str | None = None,
) -> LLMClient | None:
    """从前端传来的 Header 中构建 LLM 客户端"""
    if not x_api_key or not x_api_base or not x_api_model:
        return None
    base = x_api_base
    model = x_api_model
    provider = x_api_provider or "openai"
    base_lower = base.lower()

    # DeepSeek / 硅基流动等使用 OpenAI 兼容协议，强制设为 openai
    if any(kw in base_lower for kw in ("deepseek", "siliconflow")):
        provider = "openai"
        model = model.lower()  # DeepSeek 要求小写 short name
        # 归一化 base URL：去掉 /anthropic 后缀，替换为 /v1
        if "/anthropic" in base_lower:
            base = base.replace("/anthropic", "/v1")
        elif not base.endswith("/v1") and "/v1" not in base_lower:
            base = base.rstrip("/") + "/v1"
    elif "openai" in base_lower:
        provider = "openai"
    elif "/anthropic" in base_lower or provider == "anthropic":
        provider = "anthropic"

    return LLMClient(x_api_key, base, model, provider)


@router.get("/")
def list_agents():
    gw = get_gateway()
    return [{"name": name, "label": type(a).__name__} for name, a in gw.agents.items()]


@router.post("/{agent_name}/invoke")
async def invoke_agent(
    agent_name: str,
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
    x_api_provider: str | None = Header(None),
):
    llm = _build_llm(x_api_key, x_api_base, x_api_model, x_api_provider)
    gw = get_gateway(llm)
    result = await gw.invoke(agent_name, req.context)
    return {"agent_name": agent_name, "result": result}


@router.post("/{agent_name}/invoke-sync")
def invoke_agent_sync(agent_name: str, req: AgentInvokeRequest):
    return {"agent_name": agent_name, "result": get_gateway().invoke_sync(agent_name, req.context)}


@router.post("/research-mentor/suggest")
async def mentor_suggest(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway(_build_llm(x_api_key, x_api_base, x_api_model))
    return {"agent_name": "research_mentor", "result": await gw.invoke("research_mentor", req.context)}


@router.post("/experiment-designer/review")
async def experiment_designer_review(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway(_build_llm(x_api_key, x_api_base, x_api_model))
    return {"agent_name": "experiment_designer", "result": await gw.invoke("experiment_designer", req.context)}


@router.post("/data-analyst/analyze")
async def data_analyst_analyze(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway(_build_llm(x_api_key, x_api_base, x_api_model))
    return {"agent_name": "data_analyst", "result": await gw.invoke("data_analyst", req.context)}


@router.post("/reflection/reflect")
async def reflection_reflect(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway(_build_llm(x_api_key, x_api_base, x_api_model))
    return {"agent_name": "reflection", "result": await gw.invoke("reflection", req.context)}


@router.post("/reviewer/review")
async def reviewer_review(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway(_build_llm(x_api_key, x_api_base, x_api_model))
    return {"agent_name": "reviewer", "result": await gw.invoke("reviewer", req.context)}


@router.post("/algorithm-tutor/explain")
async def algorithm_tutor_explain(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway(_build_llm(x_api_key, x_api_base, x_api_model))
    return {"agent_name": "algorithm_tutor", "result": await gw.invoke("algorithm_tutor", req.context)}


@router.post("/general/chat")
async def general_chat(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    """通用 LLM 调用（Stage 8 报告润色等）"""
    llm = _build_llm(x_api_key, x_api_base, x_api_model)
    if not llm:
        return {"agent_name": "general_llm", "result": {"error": "No API key configured"}}
    messages = req.context.get("messages", [
        {"role": "user", "content": req.context.get("prompt", "")}
    ])
    try:
        raw = await llm.chat(messages, temperature=0.5)
        content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
        # 尝试把结果整理成可用的 JSON
        return {"agent_name": "general_llm", "result": {"content_markdown": content, "polished": content}}
    except Exception as e:
        return {"agent_name": "general_llm", "result": {"error": str(e)}}


@router.get("/history")
def get_agent_history(limit: int = 50):
    return get_gateway().get_call_log(limit)


@router.post("/save-hypothesis")
def save_hypothesis(req: HypothesisCreate, db: DbSession = Depends(get_db)):
    h = Hypothesis(session_id=req.session_id, student_text=req.student_text)
    db.add(h)
    s = db.query(SessionModel).filter(SessionModel.id == req.session_id).first()
    if s:
        s.current_stage = "HYPOTHESIS_WRITTEN"
    db.commit()
    db.refresh(h)
    return {"id": h.id, "session_id": h.session_id, "student_text": h.student_text, "ai_feedback": h.ai_feedback, "created_at": str(h.created_at)}
