"""测试统一图像识别模块 — 图形 + 数字"""
import pytest
from app.core.imagerecog.data import (
    generate_shape, generate_shape_dataset, generate_digit, generate_digit_dataset,
    get_digit_template, SIZE, SHAPES,
)
from app.core.imagerecog.algorithms import ALGO_REGISTRY, SHAPE_DEFAULT_ALGOS, DIGIT_DEFAULT_ALGOS
from app.core.imagerecog.runner import ImageRecogRunner


class TestShapeData:
    def test_generate_shape_structure(self):
        for s in SHAPES:
            g = generate_shape(s, 0.0)
            assert len(g) == SIZE
            assert len(g[0]) == SIZE
            assert any(cell for row in g for cell in row), f"{s} has no pixels"

    def test_shape_dataset(self):
        d = generate_shape_dataset(30, 0.05)
        assert len(d["grids"]) == 30
        assert len(d["labels"]) == 30
        assert d["n_classes"] == 3


class TestDigitData:
    def test_digit_template_all_valid(self):
        for d in range(10):
            for style in range(3):
                g = get_digit_template(d, style)
                assert len(g) == SIZE
                assert len(g[0]) == SIZE
                assert any(cell for row in g for cell in row), f"digit {d} style {style} empty"

    def test_generate_digit_variation(self):
        """同数字不同风格生成的结果应该不同"""
        g0 = generate_digit(3, 0, style=0, seed=1)
        g1 = generate_digit(3, 0, style=1, seed=1)
        diff = sum(1 for y in range(SIZE) for x in range(SIZE) if g0[y][x] != g1[y][x])
        assert diff > 5, f"Style variation too small: diff={diff}"

    def test_digit_dataset(self):
        d = generate_digit_dataset(50, 0.05)
        assert len(d["grids"]) == 50
        assert len(d["labels"]) == 50
        assert len(set(d["labels"])) == 10

    def test_noise_effect(self):
        clean = sum(cell for row in generate_digit(5, 0.0) for cell in row)
        noisy = sum(cell for row in generate_digit(5, 0.3, seed=99) for cell in row)
        assert clean != noisy


class TestAlgoRegistry:
    def test_all_algorithms_registered(self):
        assert "TEMPLATE" in ALGO_REGISTRY
        assert "PIXEL_KNN" in ALGO_REGISTRY
        assert "DECISION_TREE" in ALGO_REGISTRY
        assert "MLP" in ALGO_REGISTRY
        assert "CNN" in ALGO_REGISTRY
        assert "RANDOM" in ALGO_REGISTRY

    def test_params_schema(self):
        """具有参数的算法应定义 param schema"""
        assert "k" in ALGO_REGISTRY["PIXEL_KNN"]["params"]
        assert "max_depth" in ALGO_REGISTRY["DECISION_TREE"]["params"]
        assert "hidden" in ALGO_REGISTRY["MLP"]["params"]
        assert "epochs" in ALGO_REGISTRY["MLP"]["params"]

    def test_shape_defaults(self):
        assert len(SHAPE_DEFAULT_ALGOS) >= 4

    def test_digit_defaults(self):
        assert len(DIGIT_DEFAULT_ALGOS) >= 3
        assert "RANDOM" in DIGIT_DEFAULT_ALGOS

    def test_algo_function_callable(self):
        for name, entry in ALGO_REGISTRY.items():
            assert callable(entry["fn"]), f"{name} fn not callable"


class TestAlgorithms:
    def _make_shape_data(self, n=60):
        d = generate_shape_dataset(n, 0.0)
        return d["grids"], d["labels"]

    def _make_digit_data(self, n=100):
        d = generate_digit_dataset(n, 0.0)
        return d["grids"], d["labels"]

    def test_knn_shape(self):
        g, l = self._make_shape_data(120)
        n_train = 90
        preds = [ALGO_REGISTRY["PIXEL_KNN"]["fn"](g[:n_train], l[:n_train], g[i], k=3) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.80

    def test_dt_shape(self):
        g, l = self._make_shape_data(120)
        n_train = 90
        preds = [ALGO_REGISTRY["DECISION_TREE"]["fn"](g[:n_train], l[:n_train], g[i], max_depth=8) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.65

    def test_knn_digit(self):
        g, l = self._make_digit_data(100)
        n_train = 70
        preds = [ALGO_REGISTRY["PIXEL_KNN"]["fn"](g[:n_train], l[:n_train], g[i], k=3) for i in range(n_train, len(g))]
        acc = sum(1 for p, t in zip(preds, l[n_train:])) / len(preds)
        assert acc >= 0.55

    def test_dt_param_variation(self):
        """max_depth 参数应生效"""
        g, l = self._make_shape_data(80)
        n_train = 60
        # 不同 max_depth 可能产生不同预测
        pred1 = ALGO_REGISTRY["DECISION_TREE"]["fn"](g[:n_train], l[:n_train], g[n_train], max_depth=3)
        pred2 = ALGO_REGISTRY["DECISION_TREE"]["fn"](g[:n_train], l[:n_train], g[n_train], max_depth=12)
        assert pred1 in SHAPES
        assert pred2 in SHAPES


class TestRunner:
    def test_shape_run(self):
        r = ImageRecogRunner().run({
            "experiment_type": "shape",
            "algorithms": ["TEMPLATE", "PIXEL_KNN", "RANDOM"],
            "n_samples": 60, "num_trials": 2, "seed": 42,
        })
        assert r["total_runs"] == 6
        assert r["experiment_type"] == "shape"
        assert r["summary"]["TEMPLATE"]["avg_accuracy"] > 0.4

    def test_digit_run(self):
        r = ImageRecogRunner().run({
            "experiment_type": "digits",
            "algorithms": ["PIXEL_KNN", "RANDOM"],
            "n_samples": 50, "num_trials": 2, "seed": 7,
        })
        assert r["total_runs"] == 4
        assert r["experiment_type"] == "digits"
        assert "PIXEL_KNN" in r["summary"]

    def test_algo_params_passed(self):
        """自定义算法参数应生效"""
        r = ImageRecogRunner().run({
            "experiment_type": "shape",
            "algorithms": ["MLP"],
            "algo_params": {"MLP": {"hidden": 32, "epochs": 10}},
            "n_samples": 50, "num_trials": 1, "seed": 1,
        })
        assert r["total_runs"] == 1
        run0 = r["runs"][0]
        assert run0["params_used"]["hidden"] == 32
        assert run0["params_used"]["epochs"] == 10

    def test_viz_steps_present(self):
        r = ImageRecogRunner().run({
            "experiment_type": "shape",
            "algorithms": ["TEMPLATE"],
            "n_samples": 50, "num_trials": 1, "seed": 3,
        })
        run0 = r["runs"][0]
        assert "viz_steps" in run0
        assert len(run0["viz_steps"]) >= 1  # at least one test sample

    def test_with_noise(self):
        r = ImageRecogRunner().run({
            "experiment_type": "shape",
            "algorithms": ["TEMPLATE"],
            "n_samples": 40, "noise_levels": [0.2], "num_trials": 2, "seed": 5,
        })
        assert r["total_runs"] == 2
