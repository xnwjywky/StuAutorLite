"""指标计算器 — 设计文档 §6.4 + §13.7"""


def compute_metrics(results: list[dict]) -> dict:
    """
    从一组实验 run 结果中汇总统计。

    Args:
        results: list of {success, path_length, expanded_nodes, runtime_ms, ...}

    Returns:
        {success_rate, avg_path_length, avg_expanded_nodes, avg_runtime_ms, count}
    """
    if not results:
        return _empty_metrics()

    count = len(results)
    successes = sum(1 for r in results if r.get("success"))
    path_lengths = [r["path_length"] for r in results if r.get("success")]
    expanded = [r.get("expanded_nodes", 0) for r in results]
    runtimes = [r.get("runtime_ms", 0) for r in results]

    return {
        "success_rate": round(successes / count, 4),
        "avg_path_length": round(sum(path_lengths) / len(path_lengths), 2) if path_lengths else None,
        "avg_expanded_nodes": round(sum(expanded) / count, 2),
        "avg_runtime_ms": round(sum(runtimes) / count, 2),
        "count": count,
    }


def compute_summary_by_algorithm(
    runs: list[dict],
) -> dict[str, dict]:
    """按算法分组汇总"""
    groups: dict[str, list[dict]] = {}
    for r in runs:
        algo = r.get("algorithm", "unknown")
        groups.setdefault(algo, []).append(r)

    return {
        algo: compute_metrics(group_runs) for algo, group_runs in groups.items()
    }


def _empty_metrics() -> dict:
    return {
        "success_rate": 0.0,
        "avg_path_length": None,
        "avg_expanded_nodes": 0.0,
        "avg_runtime_ms": 0.0,
        "count": 0,
    }
