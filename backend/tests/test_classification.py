"""测试分类算法 — KNN, DecisionTree, RandomClassifier, dataset"""
import pytest
from app.core.classification.dataset import ClassificationDataset
from app.core.classification.knn import KNN
from app.core.classification.decision_tree import DecisionTree
from app.core.classification.random_classifier import RandomClassifier
from app.core.classification.runner import ClassificationExperimentRunner


class TestDataset:
    def test_blobs_generation(self):
        ds = ClassificationDataset(n_samples=100, noise_level=0.0, pattern="blobs", n_classes=2, seed=1)
        data = ds.generate()
        assert len(data["points"]) == 100
        assert len(data["labels"]) == 100
        assert set(data["labels"]) == {0, 1}
        assert data["class_names"] == ["类别 0", "类别 1"]

    def test_circles_generation(self):
        ds = ClassificationDataset(n_samples=80, noise_level=0.05, pattern="circles", n_classes=2, seed=2)
        data = ds.generate()
        assert len(data["points"]) == 80

    def test_moons_generation(self):
        ds = ClassificationDataset(n_samples=80, noise_level=0.05, pattern="moons", n_classes=2, seed=3)
        data = ds.generate()
        assert len(data["points"]) == 80

    def test_seeded_reproducibility(self):
        ds1 = ClassificationDataset(n_samples=50, pattern="blobs", seed=99)
        ds2 = ClassificationDataset(n_samples=50, pattern="blobs", seed=99)
        d1, d2 = ds1.generate(), ds2.generate()
        assert d1["points"] == d2["points"]


class TestKNN:
    def test_perfect_blobs(self):
        ds = ClassificationDataset(n_samples=200, noise_level=0.0, pattern="blobs", seed=1)
        data = ds.generate()
        clf = KNN(k=3)
        result = clf.solve(data)
        assert result["accuracy"] >= 0.95  # 无噪声 → 近乎完美

    def test_predict_returns_int(self):
        knn = KNN(k=1)
        knn.train([[0, 0], [10, 10]], [0, 1])
        assert knn.predict([0, 0]) == 0
        assert knn.predict([10, 10]) == 1


class TestDecisionTree:
    def test_perfect_blobs(self):
        ds = ClassificationDataset(n_samples=200, noise_level=0.0, pattern="blobs", seed=1)
        data = ds.generate()
        clf = DecisionTree(max_depth=4)
        result = clf.solve(data)
        assert result["accuracy"] >= 0.90

    def test_depth_limits(self):
        """浅树 vs 深树。"""
        ds = ClassificationDataset(n_samples=100, noise_level=0.1, pattern="moons", seed=1)
        data = ds.generate()
        shallow = DecisionTree(max_depth=2).solve(data)
        deep = DecisionTree(max_depth=5).solve(data)
        # 允许任何结果；仅验证运行通过
        assert shallow["accuracy"] >= 0.5
        assert deep["accuracy"] >= 0.5


class TestRandomClassifier:
    def test_accuracy_around_chance(self):
        ds = ClassificationDataset(n_samples=200, noise_level=0.0, pattern="blobs", seed=1)
        data = ds.generate()
        clf = RandomClassifier()
        result = clf.solve(data)
        # 2 分类 → 准确率应接近 50%
        assert 0.2 <= result["accuracy"] <= 0.8


class TestClassificationRunner:
    def test_basic_run(self):
        runner = ClassificationExperimentRunner()
        config = {
            "classifiers": ["KNN"],
            "n_samples": 100,
            "noise_levels": [0.0],
            "patterns": ["blobs"],
            "num_trials": 2,
            "train_ratio": 0.7,
            "seed": 42,
        }
        r = runner.run(config)
        assert r["status"] == "COMPLETED"
        assert r["total_runs"] == 2
        assert "KNN" in r["summary"]
        assert "avg_accuracy" in r["summary"]["KNN"]
        assert len(r["runs"]) == 2

    def test_boundary_data_present(self):
        runner = ClassificationExperimentRunner()
        config = {
            "classifiers": ["KNN"],
            "n_samples": 50,
            "noise_levels": [0.0],
            "patterns": ["blobs"],
            "num_trials": 1,
            "seed": 1,
        }
        r = runner.run(config)
        bd = r["runs"][0]["boundary_data"]
        assert bd["grid_shape"] == [50, 50]
        assert len(bd["grid_predictions"]) == 2500
