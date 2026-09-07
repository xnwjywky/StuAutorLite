"""运行明细留存清理 —— 控制 SQLite 体积（不删除整行，只裁剪过期明细大字段）。

背景（实测）：stuautor.db 已达 121MB 且无留存/清理策略；体积主要来自各 runs 表里
的 steps/path/grid/predictions 等 JSON 大字段（每次实验逐样本/逐步骤快照）。

策略（最小破坏）：
- 只把「超过保留期」的运行的明细大字段置空（''），保留整行与全部指标/元数据；
  研究报告、反思、分析等文本不受影响，仍可按需读取统计指标。
- 不删行：历史 runs 记录/计数仍完整，杜绝误删学生数据。
- 幂等：已被裁空的字段不会再次更新；每次启动后台执行一次即可。

保留期默认 RUN_RETENTION_DAYS=60 天，可用环境变量 RUN_RETENTION_DAYS 覆盖。
"""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.models.database import engine

logger = logging.getLogger("app.retention")
logger.setLevel(logging.DEBUG)

# 表名 → 可裁剪的明细大字段（JSON/Text，体积大头）。这些字段不影响统计元数据。
_RUN_TABLES: dict[str, list[str]] = {
    "experiment_runs": ["path_data", "visited_data", "maze_data"],
    "classify_runs": ["points_data", "labels_data", "predictions_data", "boundary_data"],
    "guess_runs": ["history_data"],
    "sorting_runs": ["original_data", "result_data", "steps_data"],
    "string_search_runs": ["text_data", "pattern_data", "match_positions", "steps_data"],
    "shape_recog_runs": ["test_grids_data", "test_labels_data", "predictions_data"],
    "digits_runs": ["test_grids_data", "test_labels_data", "predictions_data"],
    "imagerecog_runs": [
        "test_grids_data", "test_labels_data", "predictions_data", "viz_steps_data",
    ],
    "mnist_runs": [
        "train_losses", "train_accs", "val_losses", "val_accs", "confusion_matrix",
    ],
    "rl_runs": ["train_rewards", "train_success", "test_path", "world_json", "test_world_json"],
}


def prune_run_payloads(days: int = 60, max_rows: int = 50000) -> int:
    """把超过保留期（days）的运行明细大字段置空。

    返回被裁减过的单元格行数（幂等，重复执行返回 0）。单表处理量受 max_rows 保护，
    避免一次性大事务长时间锁库。
    """
    if days <= 0:
        return 0
    interval = f"-{int(days)} days"
    total = 0
    try:
        with engine.begin() as conn:
            # 需要 表存在 检查：inspect 每表
            from sqlalchemy import inspect
            tables = set(inspect(conn).get_table_names())
            for table, cols in _RUN_TABLES.items():
                if table not in tables:
                    continue
                for col in cols:
                    try:
                        # SQLite 的 UPDATE 不支持 LIMIT，用 id IN (子查询) 限批量，
                        # 避免一次性大事务长时间锁库（最旧的一批先清理）。
                        res = conn.execute(text(
                            f"UPDATE {table} SET {col} = '' "
                            f"WHERE id IN ("
                            f"  SELECT id FROM {table} "
                            f"  WHERE {col} != '' "
                            f"  AND created_at < datetime('now', :interval) "
                            f"  ORDER BY id ASC LIMIT :max_rows"
                            f")"
                        ), {"interval": interval, "max_rows": max_rows})
                        total += (res.rowcount or 0)
                    except Exception as e:  # 单列失败不影响其它列
                        logger.warning(f"留存清理跳过 {table}.{col}: {e}")
    except Exception as e:
        logger.warning(f"留存清理失败: {e}")
        return 0
    return total
