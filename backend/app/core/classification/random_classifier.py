"""Random baseline classifier — predicts randomly for comparison."""
import random
from .base import Classifier


class RandomClassifier(Classifier):
    name = "RANDOM"

    def __init__(self):
        self._classes = []

    def train(self, X, y) -> None:
        self._classes = list(set(y))

    def predict(self, point: list[float]) -> int:
        return random.choice(self._classes)
