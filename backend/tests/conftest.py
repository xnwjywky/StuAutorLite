"""pytest 公共配置：--runslow 选项 + slow 测试默认跳过。

背景：MNIST 真实训练等测试耗时很长（甚至需要下载数据），会导致
`pytest` 全量运行长时间占用资源（用户反馈"有些测试要运行很久"）。
方案：
- 默认运行：跳过所有 `@pytest.mark.slow` 测试（快速回归，秒级完成）；
- 显式运行慢测试：`pytest --runslow`（此时仍受 pytest.ini 全局 timeout 保护）。
"""
from __future__ import annotations

import pytest


def pytest_addoption(parser):
    parser.addoption(
        "--runslow",
        action="store_true",
        default=False,
        help="运行标记为 slow 的测试（真实训练/网络下载类），默认跳过",
    )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--runslow"):
        return  # 显式要求跑慢测试：全部运行
    skip_slow = pytest.mark.skip(reason="slow 测试（真实训练/网络），用 --runslow 显式运行")
    for item in items:
        if "slow" in item.keywords:
            item.add_marker(skip_slow)
