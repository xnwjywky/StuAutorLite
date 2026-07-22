"""Classification experiment runner — mirrors experiment_runner.py pattern."""
from .dataset import ClassificationDataset
from .knn import KNN
from .decision_tree import DecisionTree
from .random_classifier import RandomClassifier


def _get_classifier(name: str, k: int = 3, max_depth: int = 4):
    if name in ("KNN",):
        return KNN(k=k)
    if name in ("DECISION_TREE",):
        return DecisionTree(max_depth=max_depth)
    if name in ("RANDOM",):
        return RandomClassifier()
    return KNN(k=k)  # fallback


class ClassificationExperimentRunner:
    """Run batch classification experiments."""

    def run(self, config: dict) -> dict:
        """
        config:
            classifiers: list[str]        e.g. ["KNN", "DECISION_TREE", "RANDOM"]
            n_samples: int                default 200
            noise_levels: list[float]     e.g. [0.0, 0.1, 0.2]
            patterns: list[str]           e.g. ["blobs"]
            num_trials: int              default 5
            train_ratio: float           default 0.7
            k_value: int                 default 3
            max_depth: int               default 4
            seed: int                    default 42
        """
        classifier_names = config.get("classifiers", ["KNN", "DECISION_TREE", "RANDOM"])
        n_samples = config.get("n_samples", 200)
        noise_levels = config.get("noise_levels", [0.0])
        patterns = config.get("patterns", ["blobs"])
        num_trials = config.get("num_trials", 5)
        train_ratio = config.get("train_ratio", 0.7)
        k_value = config.get("k_value", 3)
        max_depth = config.get("max_depth", 4)
        base_seed = config.get("seed", 42)

        all_runs = []

        for noise in noise_levels:
            for pattern in patterns:
                for trial in range(num_trials):
                    seed = base_seed + trial * 100
                    ds = ClassificationDataset(
                        n_samples=n_samples, noise_level=noise,
                        pattern=pattern, n_classes=2, seed=seed
                    )
                    data = ds.generate()

                    for cname in classifier_names:
                        clf = _get_classifier(cname, k=k_value, max_depth=max_depth)
                        result = clf.solve(data, train_ratio=train_ratio)

                        run = {
                            "classifier": cname,
                            "n_samples": n_samples,
                            "noise_level": noise,
                            "pattern": pattern,
                            "trial": trial + 1,
                            "seed": seed,
                            "accuracy": result["accuracy"],
                            "precision": result["precision"],
                            "recall": result["recall"],
                            "f1": result["f1"],
                            "runtime_ms": result["runtime_ms"],
                            # 使用重排后的数据（训练点在前，测试点在后）
                            "points": result.get("points", data["points"]),
                            "labels": result.get("labels", data["labels"]),
                            "n_train": result.get("n_train", int(n_samples * train_ratio)),
                            "predictions": result["predictions"],
                            "boundary_data": result["boundary_data"],
                        }
                        all_runs.append(run)

        # Summary: average per classifier
        groups = {}
        for r in all_runs:
            groups.setdefault(r["classifier"], []).append(r)
        summary = {}
        for cname, recs in groups.items():
            n = len(recs)
            summary[cname] = {
                "avg_accuracy": round(sum(r["accuracy"] for r in recs) / n, 3),
                "avg_precision": round(sum(sum(r["precision"]) / len(r["precision"]) for r in recs) / n, 3) if recs[0]["precision"] else 0,
                "avg_recall": round(sum(sum(r["recall"]) / len(r["recall"]) for r in recs) / n, 3) if recs[0]["recall"] else 0,
                "avg_f1": round(sum(sum(r["f1"]) / len(r["f1"]) for r in recs) / n, 3) if recs[0]["f1"] else 0,
                "avg_runtime_ms": round(sum(r["runtime_ms"] for r in recs) / n, 1),
                "count": n,
            }

        return {
            "status": "COMPLETED",
            "runs": all_runs,
            "summary": summary,
            "total_runs": len(all_runs),
        }
