"""GET /runs 列表接口分页 + 裁剪工具。

背景（实测）：/runs 列表曾全量返回巨型 JSON 且无分页/裁剪——`/api/stringsearch/runs`
单次 49.8MB/1.2s、classify 21MB/3.4s、experiments 14.8MB/3.8s，拖慢接口与前端。

方案：所有 `/runs` 统一改为分页信封：
    {"items": [...], "total": N, "limit": L, "offset": O}
- `limit` 默认 50（上限 200），`offset` 从 0 起；
- 默认只返回轻量“元数据”行（不包含 steps/path/predictions/viz 等大字段）；
  需要完整 payload 时显式传 `include_data=true`。
"""

from __future__ import annotations

_DEFAULT_LIMIT = 50
_MAX_LIMIT = 200
_MAX_OFFSET = 100000


def _clamp(value, default: int, lower: int, upper: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        v = default
    return max(lower, min(v, upper))


def paginate(query, limit, offset, serialize):
    """对已构造好过滤/排序的 ORM 查询分页，返回分页信封。

    Args:
        query: SQLAlchemy Query（含 filter + order_by）
        limit: 每页条数（Query 参数）
        offset: 偏移（Query 参数）
        serialize: 单行 → dict 的函数，如 `lambda r: _run_to_dict(r, include_data)`
    """
    limit = _clamp(limit, _DEFAULT_LIMIT, 1, _MAX_LIMIT)
    offset = _clamp(offset, 0, 0, _MAX_OFFSET)
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    return {
        "items": [serialize(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
