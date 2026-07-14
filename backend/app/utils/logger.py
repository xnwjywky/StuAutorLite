"""日志工具 — 同时输出到控制台 + agent_errors.log 文件"""

import logging
import os
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "agent_errors.log"

_file_handler: logging.Handler | None = None


def _get_file_handler() -> logging.Handler:
    global _file_handler
    if _file_handler is None:
        _file_handler = logging.FileHandler(str(LOG_FILE), encoding="utf-8")
        _file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        _file_handler.setLevel(logging.DEBUG)
    return _file_handler


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    if not logger.handlers:
        # 控制台
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        logger.addHandler(sh)
        # 文件（持久化）
        logger.addHandler(_get_file_handler())
    return logger
