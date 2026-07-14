"""Decision Tree classifier with Gini impurity — pure Python."""
from .base import Classifier


class DecisionTree(Classifier):
    name = "DECISION_TREE"

    def __init__(self, max_depth: int = 4):
        self.max_depth = max_depth
        self._root = None

    def train(self, X, y) -> None:
        self._root = self._build(X, y, depth=0)

    def predict(self, point: list[float]) -> int:
        node = self._root
        while node["left"] is not None:
            if point[node["feature"]] <= node["threshold"]:
                node = node["left"]
            else:
                node = node["right"]
        return node["class"]

    def _build(self, X, y, depth):
        # Stop conditions
        if depth >= self.max_depth or len(set(y)) == 1 or len(y) < 4:
            return {"feature": -1, "threshold": 0, "left": None, "right": None,
                    "class": max(set(y), key=y.count)}

        # Find best split by Gini impurity
        n_features = len(X[0]) if X else 2
        best_gini = float("inf")
        best_feat, best_thresh, best_idx = -1, 0, 0

        for f in range(n_features):
            vals = sorted(set(xi[f] for xi in X))
            for i in range(len(vals) - 1):
                th = (vals[i] + vals[i + 1]) / 2
                left_mask = [xi[f] <= th for xi in X]
                left_y = [y[j] for j in range(len(y)) if left_mask[j]]
                right_y = [y[j] for j in range(len(y)) if not left_mask[j]]
                if not left_y or not right_y:
                    continue
                gini = self._gini(left_y) * len(left_y) + self._gini(right_y) * len(right_y)
                if gini < best_gini:
                    best_gini = gini
                    best_feat = f
                    best_thresh = th

        if best_feat == -1:
            return {"feature": -1, "threshold": 0, "left": None, "right": None,
                    "class": max(set(y), key=y.count)}

        # Split data
        left_X, left_y = [], []
        right_X, right_y = [], []
        for xi, yi in zip(X, y):
            if xi[best_feat] <= best_thresh:
                left_X.append(xi)
                left_y.append(yi)
            else:
                right_X.append(xi)
                right_y.append(yi)

        return {
            "feature": best_feat,
            "threshold": best_thresh,
            "left": self._build(left_X, left_y, depth + 1),
            "right": self._build(right_X, right_y, depth + 1),
            "class": max(set(y), key=y.count),
        }

    @staticmethod
    def _gini(y):
        total = len(y)
        counts = {}
        for lbl in y:
            counts[lbl] = counts.get(lbl, 0) + 1
        return 1.0 - sum((c / total) ** 2 for c in counts.values())
