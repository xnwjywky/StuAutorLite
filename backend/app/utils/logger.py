"""日志工具 — 控制台 + 轮转文件（按大小，避免日志无限增长）。

背景（实测）：app.log 无轮转，曾长到 6.5MB（每次请求都写）；agent/mnist/rl
日志同样用裸 FileHandler 无上限。这里统一改为 RotatingFileHandler（默认单文件
5MB × 5 份），并按文件名缓存 handler，保证多 logger 写同一文件共享同一 handler
（否则多个 handler 同时轮转同一文件会互相打架）。
"""

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

_DEFAULT_FMT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

# filename → RotatingFileHandler（进程内共享）
_file_handlers: dict[str, RotatingFileHandler] = {}
_console_handler: logging.Handler | None = None


def get_file_handler(
    filename: str = "agent_errors.log",
    fmt: str = _DEFAULT_FMT,
    max_bytes: int = 5 * 1024 * 1024,
    backup_count: int = 5,
) -> logging.Handler:
    """返回写 backend/logs/<filename> 的轮转 handler（同文件进程内单例）。

    超过 max_bytes 自动轮转为 <filename>.1 ~ .<backup_count>，旧文件不删不占内存。
    """
    key = f"{filename}|{fmt}|{max_bytes}|{backup_count}"
    handler = _file_handlers.get(key)
    if handler is None:
        handler = RotatingFileHandler(
            str(LOG_DIR / filename),
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter(fmt))
        handler.setLevel(logging.DEBUG)
        _file_handlers[key] = handler
    return handler


def get_console_handler() -> logging.Handler:
    """返回进程级单例控制台 handler（避免每建一个 logger 就重复加 StreamHandler）。"""
    global _console_handler
    if _console_handler is None:
        _console_handler = logging.StreamHandler()
        _console_handler.setFormatter(logging.Formatter(_DEFAULT_FMT))
        _console_handler.setLevel(logging.DEBUG)
    return _console_handler


def get_logger(name: str) -> logging.Logger:
    """创建同时输出到控制台 + agent_errors.log 的 logger。"""
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    if not logger.handlers:
        logger.addHandler(get_console_handler())
        logger.addHandler(get_file_handler("agent_errors.log"))
    return logger
