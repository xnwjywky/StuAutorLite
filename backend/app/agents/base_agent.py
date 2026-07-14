"""Agent 抽象基类 — 设计文档 §8 + §14"""

from abc import ABC, abstractmethod


class BaseAgent(ABC):
    """所有 Agent 的基类

    Attributes:
        name: Agent 标识名（对应 gateway 注册 key）
        prompt_template: LLM prompt 模板（来自 prompts/），{} 占位符格式
        output_schema: JSON Schema dict，用于校验 LLM 输出（来自 schemas/）
    """

    name: str = "base"
    prompt_template: str = ""
    output_schema: dict | None = None

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # 自动导入 prompt 和 schema
        try:
            from .prompts import PROMPTS
            from .schemas import OUTPUT_SCHEMAS
            key = cls.name
            if key in PROMPTS:
                cls.prompt_template = PROMPTS[key]
            if key in OUTPUT_SCHEMAS:
                cls.output_schema = OUTPUT_SCHEMAS[key]
        except ImportError:
            pass

    @abstractmethod
    def respond(self, context: dict) -> dict:
        """模板驱动的响应（不依赖 LLM 的降级实现）

        每个 Agent 必须实现此方法，作为 LLM 不可用时的 fallback。
        当 LLM 可用时，Gateway 优先使用 LLM + prompt_template 生成响应。
        """
        ...

    def build_prompt(self, context: dict) -> str:
        """用 context 填充 prompt_template。KeyError 时记录缺失字段并尽量替换。"""
        if not self.prompt_template:
            return ""
        try:
            return self.prompt_template.format(**context)
        except KeyError as e:
            import logging
            logger = logging.getLogger(__name__)
            # 找出模板中需要的字段 vs context 提供的字段
            import re
            needed = set(re.findall(r"\{(\w+)\}", self.prompt_template))
            missing = needed - set(context.keys())
            extra = set(context.keys()) - needed
            logger.warning(
                f"Agent '{self.name}' prompt format failed: missing keys={missing}, "
                f"unused keys={extra}. Template placeholders={needed}, context keys={set(context.keys())}"
            )
            # 兜底：用 safe substitution 尽量填
            result = self.prompt_template
            for key, val in context.items():
                result = result.replace("{" + key + "}", str(val))
            return result
