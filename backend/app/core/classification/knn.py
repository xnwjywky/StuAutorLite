"""K-Nearest Neighbors classifier."""
import math
from .base import Classifier


class KNN(Classifier):
    name = "KNN"

    def __init__(self, k: int = 3):
        self.k = k
        self._X = []
        self._y = []

    def train(self, X, y) -> None:
        self._X = X
        self._y = y

    def predict(self, point: list[float]) -> int:
        # Euclidean distances
        dists = [(math.dist(point, xi), i) for i, xi in enumerate(self._X)]
        dists.sort(key=lambda d: d[0])
        # Majority vote among k nearest
        k = min(self.k, len(dists))
        votes = {}
        for _, i in dists[:k]:
            lbl = self._y[i]
            votes[lbl] = votes.get(lbl, 0) + 1
        return max(votes, key=votes.get)
