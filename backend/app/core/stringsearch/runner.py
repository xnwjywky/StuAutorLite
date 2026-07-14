"""字符串搜索实验 Runner"""
import random
import time
from .algorithms import ALGORITHMS


class StringSearchRunner:
    def run(self, config: dict) -> dict:
        """
        config:
            algorithms: list[str]  e.g. ["NAIVE","KMP","BOYER_MOORE","RABIN_KARP"]
            text_length: int      default 500
            pattern_length: int   default 5
            num_trials: int       default 5
            pattern_type: str     "random" | "repeated" | "absent"
            seed: int
        """
        algo_names = config.get("algorithms", list(ALGORITHMS.keys()))
        text_len = max(10, min(config.get("text_length", 500), 5000))
        pat_len = max(2, min(config.get("pattern_length", 5), text_len // 2))
        num_trials = max(1, min(config.get("num_trials", 5), 10))
        pattern_type = config.get("pattern_type", "random")
        seed = config.get("seed", 42)
        rng = random.Random(seed)

        all_runs = []
        for trial in range(num_trials):
            trial_seed = seed + trial * 100
            lrng = random.Random(trial_seed)

            text = "".join(chr(ord('a') + lrng.randint(0, 25)) for _ in range(text_len))
            if pattern_type == "repeated":
                pattern = text[lrng.randint(0, text_len // 4):lrng.randint(0, text_len // 4) + pat_len]
            elif pattern_type == "absent":
                pattern = "x" * pat_len  # won't match random lowercase text
            else:
                start = lrng.randint(0, text_len - pat_len)
                pattern = text[start:start + pat_len]

            for name in algo_names:
                fn = ALGORITHMS.get(name)
                if not fn: continue
                t0 = time.perf_counter()
                result = fn(text, pattern)
                elapsed = round((time.perf_counter() - t0) * 1000, 2)

                all_runs.append({
                    "algorithm": name, "text_length": text_len,
                    "pattern_length": pat_len, "pattern_type": pattern_type,
                    "trial": trial + 1, "seed": trial_seed,
                    "matches": len(result["matches"]),
                    "comparisons": result["comparisons"],
                    "runtime_ms": elapsed,
                    "text": text, "pattern": pattern,
                    "match_positions": result["matches"],
                    "steps": result["steps"],
                })

        groups = {}
        for r in all_runs:
            groups.setdefault(r["algorithm"], []).append(r)
        summary = {}
        for name, recs in groups.items():
            n = len(recs)
            summary[name] = {
                "avg_comparisons": round(sum(r["comparisons"] for r in recs) / n, 1),
                "avg_matches": round(sum(r["matches"] for r in recs) / n, 1),
                "avg_runtime_ms": round(sum(r["runtime_ms"] for r in recs) / n, 2),
                "count": n,
            }

        return {"status": "COMPLETED", "runs": all_runs, "summary": summary, "total_runs": len(all_runs)}
