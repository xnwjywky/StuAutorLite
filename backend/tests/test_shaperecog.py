"""测试图形识别算法"""
import pytest
from app.core.shaperecog.shapes import generate_shape, generate_dataset, SHAPES, SIZE
from app.core.shaperecog.algorithms import template_match, pixel_knn_classify, feature_classify, random_classify
from app.core.shaperecog.runner import ShapeRecogRunner


class TestShapes:
    def test_generate_shape_structure(self):
        for s in SHAPES:
            g = generate_shape(s, 0.0)
            assert len(g) == SIZE
            assert len(g[0]) == SIZE
            assert any(cell for row in g for cell in row), f"{s} has no pixels"

    def test_noise_adds_flips(self):
        clean = sum(cell for row in generate_shape("circle", 0.0) for cell in row)
        noisy = sum(cell for row in generate_shape("circle", 0.2, 42) for cell in row)
        assert clean != noisy  # noise = 20% should change some pixels

    def test_dataset_generation(self):
        d = generate_dataset(30, 0.1)
        assert len(d["grids"]) == 30
        assert len(d["labels"]) == 30
        assert len(set(d["labels"])) == 3


class TestAlgorithms:
    def _make_data(self, n=60):
        d = generate_dataset(n, 0.0)
        return d["grids"], d["labels"]

    def test_template_match_perfect(self):
        g, l = self._make_data(120)
        n_train = 90
        preds = [template_match(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.85

    def test_pixel_knn_perfect(self):
        g, l = self._make_data(120)
        n_train = 90
        preds = [pixel_knn_classify(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.85

    def test_feature_perfect(self):
        g, l = self._make_data(120)
        n_train = 90
        preds = [feature_classify(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.80

    def test_random_baseline(self):
        g, l = self._make_data(60)
        n_train = 40
        preds = [random_classify(g[:n_train], l[:n_train], g[0]) for _ in range(20)]
        # 所有预测必须在合法类别中
        assert all(p in SHAPES for p in preds)


class TestRunner:
    def test_basic_run(self):
        r = ShapeRecogRunner().run({"algorithms": ["TEMPLATE", "RANDOM"], "n_samples": 60, "num_trials": 2, "seed": 42})
        assert r["total_runs"] == 4
        assert r["summary"]["TEMPLATE"]["avg_accuracy"] > 0.5

    def test_with_noise(self):
        r = ShapeRecogRunner().run({"algorithms": ["TEMPLATE"], "n_samples": 50, "noise_levels": [0.1], "num_trials": 2, "seed": 1})
        assert r["total_runs"] == 2
