"""测试猜数字算法 — 二分查找 / 随机 / 线性"""
import pytest
from app.core.guessnumber.runner import (
    _binary_guess, _random_guess, _linear_guess, GuessNumberRunner
)


class TestBinaryGuess:
    def test_finds_target(self):
        _, steps = _binary_guess(50, 1, 100)
        assert steps <= 7  # log2(100) ≈ 7

    def test_low_boundary(self):
        hist, _ = _binary_guess(1, 1, 100)
        assert hist[-1] == 1

    def test_high_boundary(self):
        hist, _ = _binary_guess(100, 1, 100)
        assert hist[-1] == 100

    def test_exact_steps_for_100(self):
        # 二分查找 1-100 范围最多 7 步
        for target in [1, 4, 25, 50, 75, 99, 100]:
            _, steps = _binary_guess(target, 1, 100)
            assert steps <= 7, f"target={target}"


class TestLinearGuess:
    def test_linear_finds(self):
        hist, steps = _linear_guess(42, 1, 100)
        assert steps == 42
        assert hist[-1] == 42


class TestRandomGuess:
    def test_random_finds_eventually(self):
        hist, steps = _random_guess(50, 1, 100)
        assert hist[-1] == 50
        assert steps <= 200


class TestGuessNumberRunner:
    def test_basic_run(self):
        r = GuessNumberRunner().run({
            "strategies": ["BINARY", "RANDOM", "LINEAR"],
            "number_range": [1, 100], "num_trials": 3, "seed": 42,
        })
        assert r["status"] == "COMPLETED"
        assert r["total_runs"] == 9
        assert "BINARY" in r["summary"]
        assert r["summary"]["BINARY"]["avg_guesses"] <= 7

    def test_binary_fastest(self):
        r = GuessNumberRunner().run({
            "strategies": ["BINARY", "LINEAR"],
            "number_range": [1, 100], "num_trials": 5, "seed": 42,
        })
        assert r["summary"]["BINARY"]["avg_guesses"] < r["summary"]["LINEAR"]["avg_guesses"]

    def test_seed_reproducibility(self):
        r1 = GuessNumberRunner().run({
            "strategies": ["BINARY"], "num_trials": 3, "seed": 42,
        })
        r2 = GuessNumberRunner().run({
            "strategies": ["BINARY"], "num_trials": 3, "seed": 42,
        })
        assert r1["runs"][0]["target"] == r2["runs"][0]["target"]
