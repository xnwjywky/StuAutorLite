"""猜数字 Runner — 简单策略对比，无需复杂数据生成"""
import time
import random


def _binary_guess(target: int, low: int = 1, high: int = 100) -> tuple[list[int], int]:
    """二分查找。返回 (猜测序列, 步数)。"""
    lo, hi = low, high
    history = []
    while lo <= hi:
        mid = (lo + hi) // 2
        history.append(mid)
        if mid == target:
            return history, len(history)
        if mid < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return history, len(history)


def _random_guess(target: int, low: int = 1, high: int = 100, max_steps: int = 200) -> tuple[list[int], int]:
    """随机猜测。"""
    history = []
    tried = set()
    for _ in range(max_steps):
        g = random.randint(low, high)
        while g in tried:
            g = random.randint(low, high)
        tried.add(g)
        history.append(g)
        if g == target:
            return history, len(history)
    return history, len(history)


def _linear_guess(target: int, low: int = 1, high: int = 100) -> tuple[list[int], int]:
    """线性扫描：从 low 开始逐个猜。"""
    history = []
    for g in range(low, high + 1):
        history.append(g)
        if g == target:
            return history, len(history)
    return history, len(history)


STRATEGIES = {
    "BINARY": _binary_guess,
    "RANDOM": _random_guess,
    "LINEAR": _linear_guess,
}


class GuessNumberRunner:
    """运行猜数字批量实验"""

    def run(self, config: dict) -> dict:
        """
        config:
            strategies: list[str]       e.g. ["BINARY", "RANDOM", "LINEAR"]
            number_range: [int, int]   default [1, 100]
            num_trials: int            default 5
            seed: int                  default 42
        """
        strategies = config.get("strategies", ["BINARY", "RANDOM", "LINEAR"])
        lo, hi = config.get("number_range", [1, 100])
        num_trials = max(1, min(config.get("num_trials", 5), 20))
        seed = config.get("seed", 42)

        rng = random.Random(seed)
        all_runs = []

        for trial in range(num_trials):
            target = rng.randint(lo, hi)
            for name in strategies:
                t0 = time.perf_counter()
                history, steps = STRATEGIES[name](target, lo, hi)
                elapsed = round((time.perf_counter() - t0) * 1000, 2)
                all_runs.append({
                    "strategy": name,
                    "number_range": [lo, hi],
                    "target": target,
                    "trial": trial + 1,
                    "seed": seed,
                    "guesses": steps,
                    "history": history,
                    "success": history[-1] == target,
                    "runtime_ms": elapsed,
                })

        # Summary per strategy
        groups = {}
        for r in all_runs:
            groups.setdefault(r["strategy"], []).append(r)

        summary = {}
        for name, recs in groups.items():
            n = len(recs)
            guesses_list = [r["guesses"] for r in recs]
            summary[name] = {
                "avg_guesses": round(sum(guesses_list) / n, 1),
                "min_guesses": min(guesses_list),
                "max_guesses": max(guesses_list),
                "success_rate": sum(r["success"] for r in recs) / n,
                "avg_runtime_ms": round(sum(r["runtime_ms"] for r in recs) / n, 2),
                "count": n,
            }

        return {
            "status": "COMPLETED",
            "runs": all_runs,
            "summary": summary,
            "total_runs": len(all_runs),
        }
