"""Synthetic 2D classification dataset — pure Python, no numpy needed."""
import math
import random as _random


class ClassificationDataset:
    """Generate 2D data for classification experiments. 3 patterns: blobs, circles, moons."""

    def __init__(self, n_samples=200, noise_level=0.05, pattern="blobs", n_classes=2, seed=None):
        self.n_samples = n_samples
        self.noise_level = noise_level
        self.pattern = pattern
        self.n_classes = max(2, min(n_classes, 3))
        self.seed = seed

    def generate(self) -> dict:
        rng = _random.Random(self.seed) if self.seed is not None else _random.Random()

        if self.pattern == "circles":
            points, labels = self._make_circles(rng)
        elif self.pattern == "moons":
            points, labels = self._make_moons(rng)
        else:
            points, labels = self._make_blobs(rng)

        return {
            "points": points,
            "labels": labels,
            "class_names": [f"类别 {i}" for i in range(self.n_classes)],
            "feature_names": ["特征 x", "特征 y"],
        }

    def _make_blobs(self, rng):
        """Gaussian clusters centered at predefined locations."""
        centers = {2: [(2, 2), (6, 6)], 3: [(2, 2), (6, 6), (4, 8)]}
        pts_per_class = self.n_samples // self.n_classes
        points, labels = [], []

        for c in range(self.n_classes):
            cx, cy = centers[self.n_classes][c]
            for _ in range(pts_per_class):
                x = cx + self._gauss(rng) * (1 + self.noise_level * 8)
                y = cy + self._gauss(rng) * (1 + self.noise_level * 8)
                points.append([round(x, 4), round(y, 4)])
                labels.append(c)

        return points, labels

    def _make_circles(self, rng):
        """Two concentric circles, inner=class 0, outer=class 1."""
        pts_per_class = self.n_samples // 2
        points, labels = [], []

        for c, radius in enumerate([2, 5]):
            for _ in range(pts_per_class):
                angle = rng.random() * 2 * math.pi
                r = radius + self._gauss(rng) * self.noise_level * 6
                x = r * math.cos(angle)
                y = r * math.sin(angle)
                points.append([round(x, 4), round(y, 4)])
                labels.append(c)

        return points, labels

    def _make_moons(self, rng):
        """Two interleaving half-moon shapes, class 0 bottom, class 1 top."""
        pts_per_class = self.n_samples // 2
        points, labels = [], []

        for c, offset in enumerate([0, math.pi]):
            for _ in range(pts_per_class):
                angle = rng.random() * math.pi
                x = 5 * math.cos(angle) + c * 3
                y = 5 * math.sin(angle) + offset * 0.6
                x += self._gauss(rng) * self.noise_level * 3
                y += self._gauss(rng) * self.noise_level * 3
                points.append([round(x, 4), round(y, 4)])
                labels.append(c)

        return points, labels

    @staticmethod
    def _gauss(rng):
        """Box-Muller transform for normal distribution."""
        u1 = max(rng.random(), 1e-9)
        u2 = rng.random()
        return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
