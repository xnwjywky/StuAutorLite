"""LLM API 调用封装 — 支持 OpenAI 和 Anthropic 协议"""

import json
import httpx
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Anthropic Messages API 中 user 消息只能与 assistant 交替出现，
# 且必须以 user 开头。连续两个 user 需要合并。
def _merge_consecutive_user(messages: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for m in messages:
        if merged and merged[-1]["role"] == "user" and m["role"] == "user":
            merged[-1]["content"] = str(merged[-1]["content"]) + "\n" + str(m["content"])
        else:
            merged.append(dict(m))
    return merged


class LLMClient:
    """支持两种协议：
    - provider="openai":    POST {base_url}/chat/completions  + Bearer token
    - provider="anthropic": POST {base_url}/v1/messages       + x-api-key header
    """

    def __init__(self, api_key: str, base_url: str, model: str, provider: str = "openai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.provider = provider

        if provider == "anthropic":
            self.endpoint = f"{self.base_url}/v1/messages"
        else:
            # OpenAI 兼容：直接 base_url/chat/completions
            self.endpoint = f"{self.base_url}/chat/completions"

    async def chat(self, messages: list[dict], **kwargs) -> dict:
        if not self.api_key:
            return {"choices": [{"message": {"content": "{}"}}]}

        if self.provider == "anthropic":
            return await self._chat_anthropic(messages, **kwargs)
        return await self._chat_openai(messages, **kwargs)

    async def _chat_openai(self, messages: list[dict], **kwargs) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": self.model, "messages": messages, **kwargs},
            )
            return self._handle_response(resp)

    async def _chat_anthropic(self, messages: list[dict], **kwargs) -> dict:
        # Anthropic Messages API 格式
        # 分离 system 消息，其余转为 Anthropic content 格式
        system_prompt = ""
        anthropic_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_prompt += str(m["content"]) + "\n"
            elif m["role"] in ("user", "assistant"):
                anthropic_msgs.append({"role": m["role"], "content": str(m["content"])})

        # Anthropic 要求 user/assistant 交替且 user 开头
        anthropic_msgs = _merge_consecutive_user(anthropic_msgs)
        if not anthropic_msgs or anthropic_msgs[0]["role"] != "user":
            anthropic_msgs.insert(0, {"role": "user", "content": "Hello"})

        body: dict = {
            "model": self.model,
            "messages": anthropic_msgs,
            "max_tokens": kwargs.get("max_tokens", 4096),
        }
        if system_prompt.strip():
            body["system"] = system_prompt.strip()

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                self.endpoint,
                headers={
                    "x-api-key": self.api_key,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
            return self._handle_response(resp)

    def _handle_response(self, resp: httpx.Response) -> dict:
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = resp.text[:500] if resp.text else "no body"
            msg = f"HTTP {resp.status_code} from {self.endpoint}: {detail}"
            logger.error(msg)
            raise RuntimeError(msg) from e

        data = resp.json()
        # Anthropic 响应 → 统一转成 OpenAI choices 格式
        if self.provider == "anthropic":
            content = ""
            for block in data.get("content", []):
                if block.get("type") == "text":
                    content += block["text"]
            return {"choices": [{"message": {"content": content}}]}
        return data

    async def chat_json(self, messages: list[dict]) -> dict:
        raw = await self.chat(messages, temperature=0.3)
        content = raw.get("choices", [{}])[0].get("message", {}).get("content", "{}")

        # 尝试多种方式提取 JSON
        candidate = content.strip()

        # 1) 去掉 markdown 代码块包裹
        import re
        fence = re.match(r"```(?:json)?\s*\n([\s\S]*?)\n```\s*$", candidate)
        if fence:
            candidate = fence.group(1).strip()

        # 2) 直接解析
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

        # 3) 提取第一个 {} 块
        match = re.search(r"\{[\s\S]*\}", candidate)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
            # 4) 修复常见 JSON 错误：尾随逗号、单引号
            try:
                fixed = re.sub(r",\s*}", "}", match.group())
                fixed = re.sub(r",\s*\]", "]", fixed)
                fixed = fixed.replace("'", '"')
                return json.loads(fixed)
            except (json.JSONDecodeError, ValueError):
                pass

        logger.warning(f"Could not parse JSON — content preview: {candidate[:300]}")
        return {}
