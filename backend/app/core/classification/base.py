"""Abstract base class for classifiers — mirrors algorithms/base.py pattern."""
import time
from abc import ABC, abstractmethod


class Classifier(ABC):
    name: str = "base"

    def solve(self, data: dict, train_ratio: float = 0.7) -> dict:
        """Wrapper: train + evaluate on test set + generate decision boundary."""
        points = data["points"]
        labels = data["labels"]
        n = len(points)

        # Train/test split — 分层抽样 + 重排（训练点在前，测试点在后，与 Canvas 兼容）
        ratio = min(1.0, max(0.1, train_ratio))
        # 按类别分组
        class_indices: dict[int, list[int]] = {}
        for i, lbl in enumerate(labels):
            class_indices.setdefault(lbl, []).append(i)

        train_idx: list[int] = []
        test_idx: list[int] = []
        for lbl, idxs in class_indices.items():
            n_cls_train = max(1, int(len(idxs) * ratio))
            train_idx.extend(idxs[:n_cls_train])
            test_idx.extend(idxs[n_cls_train:])

        X_train = [points[i] for i in train_idx]
        y_train = [labels[i] for i in train_idx]
        X_test = [points[i] for i in test_idx]
        y_test = [labels[i] for i in test_idx]
        # 重排 points/labels：训练点在前，测试点在后（与 DecisionBoundary Canvas 的视觉效果一致）
        reordered_points = [points[i] for i in train_idx + test_idx]
        reordered_labels = [labels[i] for i in train_idx + test_idx]
        n_train = len(train_idx)
        if not X_test:
            X_test, y_test = X_train[:1], y_train[:1]

        t0 = time.perf_counter()
        self.train(X_train, y_train)
        predictions = [self.predict(p) for p in X_test]
        runtime_ms = round((time.perf_counter() - t0) * 1000, 2)

        # Per-class metrics
        classes = sorted(set(y_test))
        n_test = len(y_test)
        tp, fp, fn = {c: 0 for c in classes}, {c: 0 for c in classes}, {c: 0 for c in classes}
        correct = 0
        for pred, true in zip(predictions, y_test):
            if pred == true:
                correct += 1
                tp[true] += 1
            else:
                fp[pred] = fp.get(pred, 0) + 1
                fn[true] += 1

        precision = [round(tp[c] / max(tp[c] + fp[c], 1), 3) for c in classes]
        recall = [round(tp[c] / max(tp[c] + fn[c], 1), 3) for c in classes]
        f1 = [round(2 * p * r / max(p + r, 1e-9), 3) for p, r in zip(precision, recall)]

        # Decision boundary grid
        boundary = self._make_boundary(points)

        return {
            "success": True,
            "accuracy": round(correct / n_test, 3),
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "predictions": predictions,
            "boundary_data": boundary,
            "runtime_ms": runtime_ms,
            "algorithm": self.name,
            # 重排后的数据（训练点在前，测试点在后，与 Canvas 的顺序划分一致）
            "points": reordered_points,
            "labels": reordered_labels,
            "n_train": n_train,
        }

    def _make_boundary(self, points):
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        margin = 1.0
        x_min, x_max = min(xs) - margin, max(xs) + margin
        y_min, y_max = min(ys) - margin, max(ys) + margin
        gs = 50
        preds = []
        for i in range(gs):
            for j in range(gs):
                px = x_min + (x_max - x_min) * i / (gs - 1)
                py = y_min + (y_max - y_min) * j / (gs - 1)
                preds.append(self.predict([px, py]))
        return {
            "grid_predictions": preds,
            "grid_shape": [gs, gs],
            "x_range": [round(x_min, 2), round(x_max, 2)],
            "y_range": [round(y_min, 2), round(y_max, 2)],
        }

    @abstractmethod
    def train(self, X: list, y: list) -> None:
        ...

    @abstractmethod
    def predict(self, point: list[float]) -> int:
        ...
