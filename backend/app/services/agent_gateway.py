"""
多智能体网关 — 统一注册/调用 + LLM 优先 → 模板降级 + JSON 校验 + 日志
"""

import json
import os
import re
import time
import threading
from collections import deque
from pathlib import Path
from app.utils.llm_client import LLMClient
from app.utils.logger import get_logger

logger = get_logger(__name__)

MAX_RETRIES = 1  # 只重试 1 次，减少无效 token 消耗

# S-中-4：调用日志内存上限（进程级，防长时间运行无限增长）
_MAX_CALL_LOG = 200

# S-中-5：token 用量落盘节流间隔（秒）——避免每次调用都写盘
_USAGE_SAVE_INTERVAL = 30.0

# Token 用量持久化文件（backend/data/token_usage.json）
_USAGE_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "token_usage.json"


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

    def __init__(self):
        self.agents: dict[str, object] = {}
        self._call_log: deque = deque(maxlen=_MAX_CALL_LOG)  # S-中-4：自动截断，内存有上限
        # Token 用量累计（持久化到 JSON，重启不丢失；节流落盘，S-中-5）
        self._usage_lock = threading.Lock()   # 保护内存计数 + 最后落盘时间
        self._save_lock = threading.Lock()    # 串行化磁盘写（防并发写 .tmp 相互覆盖）
        self._last_usage_save: float = 0.0
        self._usage: dict = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "calls": 0,
            "model": "",
            "since": None,
        }
        self._load_usage()

    # ── Token 用量统计 ─────────────────────────────────────
    def record_usage(self, usage: dict | None, model: str = ""):
        """记录一次 LLM 调用消耗。usage 为 None 时只累计调用次数。

        S-中-5：内存实时累计（锁内更新），落盘改为节流（≥30s 一次）。
        P-性能修复：此前 `_last_usage_save` 从未在 record_usage 中推进，导致
        实际每次调用都落盘（高频文件 I/O）；且写盘读取计数时未持锁、与其它线程
        的更新形成读写竞态。现在：计数在锁内更新；触发落盘时才推进时间戳；
        磁盘写由 _save_usage 内部快照 + 写锁串行化。
        """
        with self._usage_lock:
            self._usage["calls"] += 1
            if model:
                self._usage["model"] = model
            if usage:
                self._usage["prompt_tokens"] += int(usage.get("prompt_tokens") or 0)
                self._usage["completion_tokens"] += int(usage.get("completion_tokens") or 0)
                self._usage["total_tokens"] += int(usage.get("total_tokens") or 0)
            if not self._usage["since"]:
                self._usage["since"] = time.time()
            now = time.time()
            should_save = (now - self._last_usage_save) >= _USAGE_SAVE_INTERVAL
            if should_save:
                self._last_usage_save = now  # 推进节流时间戳，避免每次都写
        if should_save:
            self._save_usage()

    def flush_usage(self):
        """立即落盘用量（进程退出时调用，S-中-5 兜底）。"""
        with self._usage_lock:
            self._last_usage_save = time.time()
        self._save_usage()

    def get_token_usage(self) -> dict:
        with self._usage_lock:
            return dict(self._usage)

    def _load_usage(self):
        try:
            if _USAGE_FILE.exists():
                data = json.loads(_USAGE_FILE.read_text(encoding="utf-8"))
                self._usage.update({k: data.get(k, v) for k, v in self._usage.items()})
        except Exception:
            logger.warning("token_usage.json 读取失败，使用内存计数")

    def _save_usage(self):
        # 先持用量锁做快照，再在写锁内落盘：写盘期间其它线程仍可更新内存计数，
        # 快照保证 json.dumps 不读到被并发改写到一半的 dict（旧实现的读写竞态）。
        with self._usage_lock:
            payload = dict(self._usage)
        try:
            _USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = _USAGE_FILE.with_suffix(".tmp")
            with self._save_lock:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                tmp.replace(_USAGE_FILE)
        except Exception:
            pass

    def register(self, agent):
        name = getattr(agent, "name", type(agent).__name__.lower())
        self.agents[name] = agent

    def register_all(self, agents: list):
        for a in agents:
            self.register(a)

    # ── 主调用入口 ────────────────────────────────────────
    async def invoke(self, agent_name: str, context: dict, llm: LLMClient | None = None) -> dict:
        """调用指定 agent。

        llm 显式传参（P0-1 修复）：不再读取/改写全局 self.llm，避免跨用户
        密钥串扰与异步竞态。llm 为 None 时直接走模板降级。
        """
        agent = self.agents.get(agent_name)
        if agent is None:
            return {"error": f"Unknown agent '{agent_name}'"}

        log_entry = {"agent": agent_name, "input": context, "timestamp": time.time(), "method": "template", "retries": 0}
        last_error = ""

        if llm and hasattr(agent, "build_prompt"):
            prompt = agent.build_prompt(context)
            if prompt:
                # 检查未填充的占位符
                unfilled = re.findall(r"\{(\w+)\}", prompt)
                if unfilled:
                    logger.warning(f"Agent '{agent_name}' prompt has unfilled placeholders: {unfilled}")

                suffix = f"...(共 {len(prompt)} 字符)..." if len(prompt) > 400 else ""
                logger.info(f"Agent '{agent_name}' prompt: {prompt[:200]}{suffix}{prompt[-200:] if len(prompt) > 400 else ''}")
                logger.info(f"Agent '{agent_name}' → POST {llm.endpoint} model={llm.model}")

                schema = getattr(agent, "output_schema", None)
                schema_instruction = _schema_to_prompt(schema)
                system_msg = f"你是一个面向中小学生的人工智能教学助手。请始终使用中文回复。\n\n{schema_instruction}"

                for attempt in range(1, MAX_RETRIES + 1):
                    try:
                        raw = await llm.chat_json([
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": prompt},
                        ])
                        # 无论 JSON 是否解析成功，HTTP 调用已消耗 token
                        self.record_usage(llm.last_usage, llm.model)
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
        # deque 不支持切片，先转 list 再取尾部（S-中-4）
        return list(self._call_log)[-limit:]

    def clear_log(self):
        self._call_log.clear()


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
    """获取全局 AgentGateway 单例。

    P0-1 修复：不再把传入的 llm 写入全局状态（`set_llm` 已移除）——
    LLM 客户端一律通过 `invoke(..., llm=llm)` 显式传参，避免跨用户密钥
    串扰与异步竞态。参数保留仅为兼容旧调用，实际忽略。
    """
    global _gateway
    if _gateway is None:
        _gateway = AgentGateway()
        import atexit
        atexit.register(_gateway.flush_usage)  # S-中-5：进程退出时落盘用量兜底
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
    return _gateway
