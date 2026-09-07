"""P-性能：运行明细留存清理单测。

使用独立的 :memory: SQLite（不触碰真实 backend/data/stuautor.db），
直接验证 prune_run_payloads 的裁空/幂等行为。
"""

import pytest
from sqlalchemy import create_engine, text


@pytest.fixture
def retention_engine(monkeypatch):
    import app.utils.retention as ret

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE experiment_runs ("
            "id INTEGER PRIMARY KEY, "
            "created_at TEXT DEFAULT '', "
            "path_data TEXT DEFAULT '', "
            "visited_data TEXT DEFAULT '', "
            "maze_data TEXT DEFAULT ''"
            ")"
        ))
        # 旧行（2020 << 60 天前）：明细应被裁剪置空
        conn.execute(text(
            "INSERT INTO experiment_runs (id, created_at, path_data, visited_data, maze_data) "
            "VALUES (1, '2020-01-01 00:00:00', '[1]', '[2]', '[]')"
        ))
        # 新行（2099 >> now）：明细必须保留
        conn.execute(text(
            "INSERT INTO experiment_runs (id, created_at, path_data, visited_data, maze_data) "
            "VALUES (2, '2099-01-01 00:00:00', '[9]', '[8]', '[]')"
        ))
    monkeypatch.setattr(ret, "engine", engine)
    return engine


def test_prune_blanks_old_heavy_columns_only(retention_engine):
    from app.utils.retention import prune_run_payloads

    cleared = prune_run_payloads(days=60, max_rows=10)
    assert cleared == 3  # 旧行 3 个非空大字段被置空

    with retention_engine.connect() as conn:
        old = tuple(conn.execute(text(
            "SELECT path_data, visited_data, maze_data FROM experiment_runs WHERE id=1"
        )).one())
        new = tuple(conn.execute(text(
            "SELECT path_data, visited_data, maze_data FROM experiment_runs WHERE id=2"
        )).one())
    assert old == ("", "", "")
    assert new == ("[9]", "[8]", "[]")  # 未过期行不动


def test_prune_idempotent(retention_engine):
    from app.utils.retention import prune_run_payloads

    assert prune_run_payloads(days=60, max_rows=10) == 3
    assert prune_run_payloads(days=60, max_rows=10) == 0  # 二次执行 0 改动


def test_prune_disabled_when_days_zero(retention_engine):
    from app.utils.retention import prune_run_payloads

    assert prune_run_payloads(days=0) == 0  # RUN_RETENTION_DAYS=0 关闭清理
