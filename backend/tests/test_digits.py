"""测试手写数字识别模块"""
import pytest
from app.core.digits.digits import generate_digit, generate_dataset, DIGITS, SIZE
from app.core.digits.algorithms import ALGORITHMS
from app.core.digits.runner import DigitsRunner


class TestDigits:
    def test_generate_digit_structure(self):
        for d in DIGITS:
            g = generate_digit(d, 0.0)
            assert len(g) == SIZE
            assert len(g[0]) == SIZE
            assert any(cell for row in g for cell in row), f"digit {d} has no pixels"

    def test_all_digits_different(self):
        """不同数字的模板应该可以区分（绝大多数对不同）。"""
        templates = {d: generate_digit(d, 0.0) for d in DIGITS}
        distinct_pairs = 0
        similar_pairs = []
        for d1 in DIGITS:
            for d2 in DIGITS:
                if d1 < d2:
                    diff = sum(1 for y in range(SIZE) for x in range(SIZE)
                               if templates[d1][y][x] != templates[d2][y][x])
                    if diff > 0:
                        distinct_pairs += 1
                    else:
                        similar_pairs.append((d1, d2))
        # 45 对中至少 40 对应该有像素差异
        assert distinct_pairs >= 40, f"Only {distinct_pairs}/45 pairs are distinct. Identical pairs: {similar_pairs}"

    def test_noise_adds_flips(self):
        clean = sum(cell for row in generate_digit(3, 0.0) for cell in row)
        noisy = sum(cell for row in generate_digit(3, 0.2, 42) for cell in row)
        assert clean != noisy

    def test_dataset_generation(self):
        d = generate_dataset(50, 0.05)
        assert len(d["grids"]) == 50
        assert len(d["labels"]) == 50
        assert len(set(d["labels"])) == 10  # 0-9 all present


class TestDigitAlgorithms:
    def _make_data(self, n=100):
        d = generate_dataset(n, 0.0)
        return d["grids"], d["labels"]

    def test_knn_digit(self):
        g, l = self._make_data(100)
        n_train = 70
        knn = ALGORITHMS["PIXEL_KNN"]
        preds = [knn(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.60, f"KNN accuracy={acc:.2f} below 0.60"

    def test_decision_tree_digit(self):
        g, l = self._make_data(100)
        n_train = 70
        dt = ALGORITHMS["DECISION_TREE"]
        preds = [dt(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.50, f"DT accuracy={acc:.2f} below 0.50"

    def test_mlp_digit(self):
        g, l = self._make_data(100)
        n_train = 70
        mlp = ALGORITHMS["MLP"]
        preds = [mlp(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.60, f"MLP accuracy={acc:.2f} below 0.60"

    def test_cnn_digit(self):
        g, l = self._make_data(100)
        n_train = 70
        cnn = ALGORITHMS["CNN"]
        preds = [cnn(g[:n_train], l[:n_train], g[i]) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.60, f"CNN accuracy={acc:.2f} below 0.60"

    def test_all_output_valid(self):
        """所有算法的输出都必须是 0-9 的合法数字"""
        g, l = self._make_data(60)
        n_train = 40
        for name, fn in ALGORITHMS.items():
            pred = fn(g[:n_train], l[:n_train], g[n_train])
            assert pred in DIGITS, f"{name} returned invalid digit: {pred}"

    def test_random_baseline(self):
        g, l = self._make_data(60)
        n_train = 40
        rnd = ALGORITHMS["RANDOM"]
        preds = [rnd(g[:n_train], l[:n_train], g[0]) for _ in range(20)]
        assert all(p in DIGITS for p in preds)


class TestDigitsRunner:
    def test_basic_run(self):
        r = DigitsRunner().run({
            "algorithms": ["PIXEL_KNN", "RANDOM", "DECISION_TREE"],
            "n_samples": 50, "num_trials": 2, "seed": 42,
        })
        assert r["total_runs"] == 6
        assert r["summary"]["PIXEL_KNN"]["avg_accuracy"] > 0.3

    def test_with_noise(self):
        r = DigitsRunner().run({
            "algorithms": ["PIXEL_KNN"],
            "n_samples": 40, "noise_levels": [0.1], "num_trials": 2, "seed": 1,
        })
        assert r["total_runs"] == 2

    def test_all_algorithms(self):
        """Runner 应支持所有算法"""
        r = DigitsRunner().run({
            "algorithms": ["PIXEL_KNN", "DECISION_TREE", "MLP", "CNN", "RANDOM"],
            "n_samples": 50, "num_trials": 1, "seed": 7,
        })
        assert r["total_runs"] == 5
        for algo in ["PIXEL_KNN", "DECISION_TREE", "MLP", "CNN", "RANDOM"]:
            assert algo in r["summary"]
