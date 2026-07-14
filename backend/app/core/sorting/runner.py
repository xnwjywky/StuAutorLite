"""排序实验 Runner — 生成随机数组 → 批量运行 → 汇总统计"""
import random
import time
from .algorithms import ALGORITHMS


class SortingRunner:
    def run(self, config: dict) -> dict:
        """
        config:
            algorithms: list[str]  e.g. ["BUBBLE","SELECTION","MERGE","QUICK"]
            array_sizes: list[int] default [20]
            num_trials: int        default 5
            data_pattern: str      "random" | "reversed" | "nearly_sorted"
            seed: int
        """
        algo_names = config.get("algorithms", list(ALGORITHMS.keys()))
        sizes = config.get("array_sizes", [20])
        num_trials = max(1, min(config.get("num_trials", 5), 10))
        pattern = config.get("data_pattern", "random")
        seed = config.get("seed", 42)
        rng = random.Random(seed)

        all_runs = []
        for size in sizes:
            for trial in range(num_trials):
                trial_seed = seed + trial * 100
                arr = _generate_array(size, pattern, trial_seed)

                for name in algo_names:
                    fn = ALGORITHMS.get(name)
                    if not fn: continue
                    t0 = time.perf_counter()
                    result = fn(arr)
                    elapsed = round((time.perf_counter() - t0) * 1000, 2)

                    all_runs.append({
                        "algorithm": name,
                        "array_size": size,
                        "pattern": pattern,
                        "trial": trial + 1,
                        "seed": trial_seed,
                        "swaps": result["swaps"],
                        "comparisons": result["comparisons"],
                        "runtime_ms": elapsed,
                        "original": arr[:],
                        "result": result["result"],
                        "steps": result["steps"],
                    })

        # 分组汇总
        groups = {}
        for r in all_runs:
            groups.setdefault(r["algorithm"], []).append(r)
        summary = {}
        for name, recs in groups.items():
            n = len(recs)
            summary[name] = {
                "avg_swaps": round(sum(r["swaps"] for r in recs) / n, 1),
                "avg_comparisons": round(sum(r["comparisons"] for r in recs) / n, 1),
                "avg_runtime_ms": round(sum(r["runtime_ms"] for r in recs) / n, 2),
                "count": n,
            }

        return {"status": "COMPLETED", "runs": all_runs, "summary": summary, "total_runs": len(all_runs)}


def _generate_array(size: int, pattern: str, seed: int) -> list[int]:
    rng = random.Random(seed)
    values = list(range(1, size + 1))
    if pattern == "reversed":
        return list(reversed(values))
    if pattern == "nearly_sorted":
        vals = list(values)
        for _ in range(max(1, size // 5)):
            i, j = rng.randint(0, size-1), rng.randint(0, size-1)
            vals[i], vals[j] = vals[j], vals[i]
        return vals
    rng.shuffle(values)
    return values
