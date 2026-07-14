"""
多智能体网关 — 统一注册/调用 + LLM 优先 → 模板降级 + JSON 校验 + 日志
"""

import json
import re
import time
from app.utils.llm_client import LLMClient
from app.utils.logger import get_logger

logger = get_logger(__name__)

MAX_RETRIES = 1  # 只重试 1 次，减少无效 token 消耗


def _schema_to_prompt(schema: dict | None) -> str:
    """将 JSON Schema 转为 LLM 可理解的输出格式说明"""
    if not schema:
        return "Respond with valid JSON."
    required = schema.get("required", [])
    props = schema.get("properties", {})
    lines = ["Respond with ONLY the following JSON (no markdown, no extra text):", "{"]
    for i, key in enumerate(required):
        prop = props.get(key, {})
        desc = prop.get("description", "")
        ptype = prop.get("type", "string")
        if ptype == "array":
            sample = '["...", "..."]'
        elif ptype == "integer":
            sample = "3"
        elif ptype == "boolean":
            sample = "true"
        else:
            sample = '"..."'
        comma = "," if i < len(required) - 1 or len(props) > len(required) else ""
        lines.append(f'  "{key}": {sample}{comma}  // {desc}' if desc else f'  "{key}": {sample}{comma}')
    lines.append("}")
    return "\n".join(lines)


class AgentGateway:

    def __init__(self, llm: LLMClient | None = None):
        self.llm = llm
        self.agents: dict[str, object] = {}
        self._call_log: list[dict] = []

    def register(self, agent):
        name = getattr(agent, "name", type(agent).__name__.lower())
        self.agents[name] = agent

    def register_all(self, agents: list):
        for a in agents:
            self.register(a)

    # ── 主调用入口 ────────────────────────────────────────
    async def invoke(self, agent_name: str, context: dict) -> dict:
        agent = self.agents.get(agent_name)
        if agent is None:
            return {"error": f"Unknown agent '{agent_name}'"}

        log_entry = {"agent": agent_name, "input": context, "timestamp": time.time(), "method": "template", "retries": 0}
        last_error = ""

        if self.llm and hasattr(agent, "build_prompt"):
            prompt = agent.build_prompt(context)
            if prompt:
                # 检查未填充的占位符
                unfilled = re.findall(r"\{(\w+)\}", prompt)
                if unfilled:
                    logger.warning(f"Agent '{agent_name}' prompt has unfilled placeholders: {unfilled}")

                suffix = f"...(共 {len(prompt)} 字符)..." if len(prompt) > 400 else ""
                logger.info(f"Agent '{agent_name}' prompt: {prompt[:200]}{suffix}{prompt[-200:] if len(prompt) > 400 else ''}")
                logger.info(f"Agent '{agent_name}' → POST {self.llm.endpoint} model={self.llm.model}")

                schema = getattr(agent, "output_schema", None)
                schema_instruction = _schema_to_prompt(schema)
                system_msg = f"你是一个面向中小学生的人工智能教学助手。请始终使用中文回复。\n\n{schema_instruction}"

                for attempt in range(1, MAX_RETRIES + 1):
                    try:
                        raw = await self.llm.chat_json([
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": prompt},
                        ])
                        if raw and not raw.get("error"):
                            validated = self._validate_and_repair(agent, raw)
                            if validated:
                                log_entry["method"] = "llm"
                                log_entry["retries"] = attempt
                                log_entry["output"] = validated
                                self._call_log.append(log_entry)
                                logger.info(f"Agent '{agent_name}' → LLM OK (attempt {attempt})")
                                return validated

                        logger.warning(f"Agent '{agent_name}' LLM attempt {attempt} failed validation, retrying...")
                    except RuntimeError as e:
                        last_error = str(e)
                        logger.error(f"Agent '{agent_name}' LLM fatal: {last_error}")
                        break
                    except Exception as e:
                        last_error = str(e)
                        logger.warning(f"Agent '{agent_name}' LLM attempt {attempt} error: {e}")

                if last_error:
                    log_entry["output"] = {"error": last_error}
                    self._call_log.append(log_entry)
                    return {"error": f"LLM 调用失败: {last_error}"}

        # 降级到模板
        try:
            result = agent.respond(context)
            if result:
                log_entry["output"] = result
                self._call_log.append(log_entry)
                logger.info(f"Agent '{agent_name}' → template")
                return result
        except Exception as e:
            logger.error(f"Agent '{agent_name}' template failed: {e}")

        log_entry["output"] = {"error": f"Agent '{agent_name}' produced no result"}
        self._call_log.append(log_entry)
        return log_entry["output"]

    # ── 同步调用 ──────────────────────────────────────────
    def invoke_sync(self, agent_name: str, context: dict) -> dict:
        agent = self.agents.get(agent_name)
        if agent is None:
            return {"error": f"Unknown agent '{agent_name}'"}
        try:
            return agent.respond(context)
        except Exception as e:
            logger.error(f"Agent '{agent_name}' sync error: {e}")
            return {"error": str(e)}

    # ── 校验 + 修复 ───────────────────────────────────────
    def _validate_and_repair(self, agent, raw: dict) -> dict | None:
        schema = getattr(agent, "output_schema", None)
        if schema is None:
            return raw

        # 先尝试修复：从 LLM 的 free-text 字段提取结构化数据
        raw = _extract_from_free_text(raw, schema)

        try:
            import jsonschema
            jsonschema.validate(raw, schema)
            return raw
        except ImportError:
            if self._basic_validate(raw, schema):
                return raw
        except Exception:
            pass

        # 用 schema 补全缺失字段
        raw = _fill_defaults(raw, schema)
        if raw and all(k in raw for k in schema.get("required", [])):
            # 关键检查：required array 字段不能为空
            for key in schema.get("required", []):
                prop = schema["properties"].get(key, {})
                if prop.get("type") == "array" and not raw.get(key):
                    return None  # 重试
            return raw
        return None

    def _basic_validate(self, raw: dict, schema: dict) -> bool:
        return all(k in raw for k in schema.get("required", []))

    def get_call_log(self, limit: int = 50) -> list[dict]:
        return self._call_log[-limit:]

    def clear_log(self):
        self._call_log.clear()

    def set_llm(self, llm: LLMClient | None):
        self.llm = llm


# ═══════════════════════════════════════════════════════════
# 修复工具
# ═══════════════════════════════════════════════════════════

def _extract_from_free_text(raw: dict, schema: dict) -> dict:
    """LLM 可能返回 {\"response\": \"1. xxx\\n2. yyy\"} 而不是 {\"suggested_questions\": [...]}
    尝试将常见的自由文本格式转换为结构化列表。"""
    result = dict(raw)
    required = schema.get("required", [])
    props = schema.get("properties", {})

    for key in required:
        if key in result and result[key]:
            continue

        # 1) 尝试 LLM 用中文键名代替了英文键
        key_aliases = {
            "suggested_questions": ["suggestions", "questions", "建议", "问题", "研究问题", "response", "responses"],
            "explanation": ["解释", "说明", "explain", "summary", "response"],
            "key_findings": ["findings", "发现", "结论", "主要发现", "response"],
            "strengths": ["优点", "优势", "strength", "好的方面", "response"],
            "weaknesses": ["缺点", "不足", "weakness", "需要改进", "改进建议", "response"],
            "revision_suggestions": ["修改建议", "suggestions", "建议", "response"],
            "questions_for_student": ["追问", "反思问题", "questions", "问题列表", "response"],
            "review_questions": ["审稿追问", "追问", "questions", "response"],
        }

        for alias in key_aliases.get(key, []):
            if alias in raw and raw[alias]:
                val = raw[alias]
                if isinstance(val, str):
                    result[key] = _text_to_list(val)
                elif isinstance(val, list):
                    result[key] = [str(x) for x in val]
                break

        # 2) 如果还是空，尝试从 score/feedback 文本中提取
        if key not in result or not result[key]:
            if key == "suggested_questions":
                # 从任意文本字段中提取编号列表
                for field in ["response", "text", "content", "output"] + list(raw.keys()):
                    if field in raw and isinstance(raw[field], str):
                        items = _text_to_list(raw[field])
                        if len(items) >= 2:
                            result[key] = items
                            break

    return result


def _text_to_list(text: str) -> list[str]:
    """从文本中提取编号列表 → 字符串列表"""
    lines = re.split(r"\n|\\n", text)
    items = []
    for line in lines:
        line = line.strip()
        if not line or len(line) < 5:
            continue
        if line in ("{", "}", "[", "]"):
            continue
        # 跳过非列表的纯叙述性文字（不以编号/选项/星号开头）
        if re.match(r"^[一-鿿\w]+[，。！？、]", line) and not re.match(r"^\d", line):
            if len(line) > 30:
                # 长句子可能是叙述，跳过
                continue
        # 提取内容：去掉数字前缀 / 选项前缀
        item = re.sub(r"^(?:\d+[\.\)、]\s*|选项\d+[：:]\s*|[-*•]\s*)", "", line).strip().rstrip(",")
        # 过滤明显不是问题/发现的内容
        if item and len(item) > 5:
            items.append(item)
    return items[:5]


def _fill_defaults(raw: dict, schema: dict) -> dict:
    result = dict(raw)
    props = schema.get("properties", {})
    for key in schema.get("required", []):
        if key not in result or not result[key]:
            prop = props.get(key, {})
            ptype = prop.get("type", "string")
            if ptype == "array":
                result[key] = []
            elif ptype == "integer":
                result[key] = 0
            elif ptype == "object":
                result[key] = {}
            else:
                result[key] = ""
    return result


# ═══════════════════════════════════════════════════════════
_gateway: AgentGateway | None = None


def get_gateway(llm: LLMClient | None = None) -> AgentGateway:
    global _gateway
    if _gateway is None:
        _gateway = AgentGateway(llm)
        from app.agents.research_mentor import ResearchMentor
        from app.agents.experiment_designer import ExperimentDesigner
        from app.agents.data_analyst import DataAnalyst
        from app.agents.reflection import ReflectionAgent
        from app.agents.reviewer import Reviewer
        from app.agents.algorithm_tutor import AlgorithmTutor
        _gateway.register_all([
            ResearchMentor(), ExperimentDesigner(), DataAnalyst(),
            ReflectionAgent(), Reviewer(), AlgorithmTutor(),
        ])
    if llm is not None:
        _gateway.set_llm(llm)
    return _gateway
