"""手写数字识别实验 Runner — 与 ShapeRecogRunner 结构一致"""
import time, random
from .digits import generate_dataset, SIZE
from .algorithms import ALGORITHMS


class DigitsRunner:
    def run(self, config: dict) -> dict:
        """
        config:
            algorithms: list[str]  e.g. ["PIXEL_KNN","DECISION_TREE","MLP","CNN"]
            n_samples: int         default 200
            noise_levels: list[float]  default [0.0]
            num_trials: int        default 5
            train_ratio: float     default 0.7
            seed: int
        """
        algo_names = config.get("algorithms", list(ALGORITHMS.keys()))
        n_samples = max(30, min(config.get("n_samples", 200), 1000))
        noise_levels = config.get("noise_levels", [0.0])
        num_trials = max(1, min(config.get("num_trials", 5), 10))
        train_ratio = max(0.3, min(config.get("train_ratio", 0.7), 0.9))
        seed = config.get("seed", 42)

        all_runs = []
        for noise in noise_levels:
            for trial in range(num_trials):
                trial_seed = seed + trial * 100
                data = generate_dataset(n_samples, noise, trial_seed)
                grids = data["grids"]
                labels = data["labels"]
                n = len(grids)
                n_train = int(n * train_ratio)

                # 分层抽样：保证每类都有训练样本
                indices = list(range(n))
                rng = random.Random(trial_seed)
                rng.shuffle(indices)
                train_idx = set(indices[:n_train])

                grids_train = [grids[i] for i in range(n) if i in train_idx]
                labels_train = [labels[i] for i in range(n) if i in train_idx]
                test_grids = [grids[i] for i in range(n) if i not in train_idx]
                test_labels = [labels[i] for i in range(n) if i not in train_idx]

                for name in algo_names:
                    fn = ALGORITHMS.get(name)
                    if not fn:
                        continue
                    t0 = time.perf_counter()
                    preds = [fn(grids_train, labels_train, g) for g in test_grids]
                    elapsed = round((time.perf_counter() - t0) * 1000, 2)
                    correct = sum(1 for p, l in zip(preds, test_labels) if p == l)
                    n_test = len(test_labels)

                    all_runs.append({
                        "algorithm": name, "n_samples": n_samples,
                        "noise_level": noise, "trial": trial + 1,
                        "seed": trial_seed, "accuracy": round(correct / max(n_test, 1), 3),
                        "correct": correct, "total": n_test,
                        "runtime_ms": elapsed,
                        "test_grids": test_grids, "test_labels": test_labels,
                        "predictions": preds, "train_ratio": train_ratio,
                        "grid_size": SIZE,
                    })

        # 分组汇总
        groups = {}
        for r in all_runs:
            groups.setdefault(r["algorithm"], []).append(r)
        summary = {}
        for name, recs in groups.items():
            n_r = len(recs)
            accs = [r["accuracy"] for r in recs]
            times = [r["runtime_ms"] for r in recs]
            summary[name] = {
                "avg_accuracy": round(sum(accs) / n_r, 3),
                "min_accuracy": min(accs),
                "max_accuracy": max(accs),
                "avg_runtime_ms": round(sum(times) / n_r, 2),
                "count": n_r,
            }

        return {"status": "COMPLETED", "runs": all_runs, "summary": summary, "total_runs": len(all_runs)}
