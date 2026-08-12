"""多智能体交互接口 — 设计文档 §9.3 + §11"""

import asyncio

import httpx
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session as DbSession
from app.models.database import get_db, Hypothesis, Session as SessionModel
from app.models.schemas import AgentInvokeRequest, HypothesisCreate
from app.services.agent_gateway import get_gateway
from app.utils.llm_client import LLMClient

router = APIRouter(prefix="/agents", tags=["agents"])

# ── 本地推理服务探测（LOCAL_MODEL_INTEGRATION_PLAN）──
# 均为 OpenAI 兼容端点；本地服务默认无 API Key。
_LOCAL_ENDPOINTS = [
    {"name": "Ollama",    "tags_url": "http://127.0.0.1:11434/api/tags", "v1_base": "http://127.0.0.1:11434/v1"},
    {"name": "LM Studio", "tags_url": "http://127.0.0.1:1234/v1/models",  "v1_base": "http://127.0.0.1:1234/v1"},
    {"name": "vLLM",      "tags_url": "http://127.0.0.1:8000/v1/models",   "v1_base": "http://127.0.0.1:8000/v1"},
    {"name": "llama.cpp", "tags_url": "http://127.0.0.1:8080/v1/models",   "v1_base": "http://127.0.0.1:8080/v1"},
]

_LOCAL_HOST_HINTS = ("127.0.0.1", "localhost", "0.0.0.0")
# 本地无 key 时的占位值（非空即可，实际请求不带 Bearer 也无妨）
_LOCAL_NO_KEY = "local-no-key"


def _is_local_url(url: str | None) -> bool:
    """判断地址是否为本地回环地址（本地推理服务无 key 通路仅对这些地址放开）。"""
    return any(h in (url or "").lower() for h in _LOCAL_HOST_HINTS)


def _parse_local_models(data: dict) -> list[str]:
    """解析本地服务模型列表：Ollama 原生（models[].name）或 OpenAI 兼容（data[].id）。"""
    if isinstance(data, dict):
        if isinstance(data.get("models"), list):  # Ollama /api/tags
            return [str(m["name"]) for m in data["models"] if isinstance(m, dict) and m.get("name")]
        if isinstance(data.get("data"), list):    # OpenAI /v1/models
            return [str(m["id"]) for m in data["data"] if isinstance(m, dict) and m.get("id")]
    return []


async def _probe_local_service(client: httpx.AsyncClient, ep: dict) -> dict | None:
    """探测单个本地服务；不可达 / 超时 / 响应格式不符返回 None。"""
    try:
        resp = await client.get(ep["tags_url"])
        if resp.status_code != 200:
            return None
        models = _parse_local_models(resp.json())
        if not models:
            return None
        return {"name": ep["name"], "v1_base": ep["v1_base"], "models": models, "model_count": len(models)}
    except Exception:
        return None  # 服务未启动 / 连接拒绝 / 非 JSON


def _build_llm(
    x_api_key: str | None = None,
    x_api_base: str | None = None,
    x_api_model: str | None = None,
    x_api_provider: str | None = None,
) -> LLMClient | None:
    """从前端传来的 Header 中构建 LLM 客户端

    本地推理服务（Ollama / LM Studio / vLLM / llama.cpp）默认无 API Key，
    对本地回环地址放开 key 校验；公网地址仍强制要求 key。
    """
    if not x_api_base or not x_api_model:
        return None
    is_local = _is_local_url(x_api_base)
    if not x_api_key and not is_local:
        return None
    api_key = x_api_key or _LOCAL_NO_KEY  # 本地无 key 时用占位，满足下游非空校验
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

    return LLMClient(api_key, base, model, provider)


@router.get("/local-models")
async def detect_local_models():
    """探测本机已安装的本地推理服务及其模型列表（Agent 配置页一键连接）。"""
    async with httpx.AsyncClient(timeout=2.0) as client:  # 短超时，本机探测
        results = await asyncio.gather(*(_probe_local_service(client, ep) for ep in _LOCAL_ENDPOINTS))
    services = [r for r in results if r]
    return {"services": services, "found": len(services) > 0}


@router.get("/")
def list_agents():
    gw = get_gateway()
    return [{"name": name, "label": type(a).__name__} for name, a in gw.agents.items()]


@router.get("/usage")
def get_token_usage():
    """累计 token 使用量（跨重启持久化）"""
    return get_gateway().get_token_usage()


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
    gw = get_gateway()
    result = await gw.invoke(agent_name, req.context, llm=llm)
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
    gw = get_gateway()
    return {"agent_name": "research_mentor", "result": await gw.invoke("research_mentor", req.context, llm=_build_llm(x_api_key, x_api_base, x_api_model))}


@router.post("/experiment-designer/review")
async def experiment_designer_review(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway()
    return {"agent_name": "experiment_designer", "result": await gw.invoke("experiment_designer", req.context, llm=_build_llm(x_api_key, x_api_base, x_api_model))}


@router.post("/data-analyst/analyze")
async def data_analyst_analyze(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway()
    return {"agent_name": "data_analyst", "result": await gw.invoke("data_analyst", req.context, llm=_build_llm(x_api_key, x_api_base, x_api_model))}


@router.post("/reflection/reflect")
async def reflection_reflect(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway()
    return {"agent_name": "reflection", "result": await gw.invoke("reflection", req.context, llm=_build_llm(x_api_key, x_api_base, x_api_model))}


@router.post("/reviewer/review")
async def reviewer_review(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway()
    return {"agent_name": "reviewer", "result": await gw.invoke("reviewer", req.context, llm=_build_llm(x_api_key, x_api_base, x_api_model))}


@router.post("/algorithm-tutor/explain")
async def algorithm_tutor_explain(
    req: AgentInvokeRequest,
    x_api_key: str | None = Header(None),
    x_api_base: str | None = Header(None),
    x_api_model: str | None = Header(None),
):
    gw = get_gateway()
    return {"agent_name": "algorithm_tutor", "result": await gw.invoke("algorithm_tutor", req.context, llm=_build_llm(x_api_key, x_api_base, x_api_model))}


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
        get_gateway().record_usage(llm.last_usage, llm.model)
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
