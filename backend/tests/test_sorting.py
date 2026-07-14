"""测试排序算法 — 冒泡 / 选择 / 归并 / 快排"""
import pytest
from app.core.sorting.algorithms import bubble_sort, selection_sort, merge_sort, quick_sort
from app.core.sorting.runner import SortingRunner


def _verify_sorted(result):
    assert result["result"] == sorted(result["result"])
    assert result["success"] is True


class TestBubbleSort:
    def test_basic(self):
        r = bubble_sort([3, 1, 2]); _verify_sorted(r)
        assert r["swaps"] >= 0

    def test_sorted(self):
        r = bubble_sort([1, 2, 3, 4]); _verify_sorted(r)
        assert r["swaps"] == 0

    def test_reversed(self):
        r = bubble_sort([5, 4, 3, 2, 1]); _verify_sorted(r)
        assert r["swaps"] > 0


class TestSelectionSort:
    def test_basic(self):
        r = selection_sort([3, 1, 2]); _verify_sorted(r)

    def test_single(self):
        r = selection_sort([1]); _verify_sorted(r)

    def test_reversed(self):
        r = selection_sort([5, 4, 3, 2, 1]); _verify_sorted(r)
        assert r["swaps"] <= 5


class TestMergeSort:
    def test_basic(self):
        r = merge_sort([3, 1, 2]); _verify_sorted(r)

    def test_large(self):
        import random
        arr = list(range(1, 51)); random.Random(42).shuffle(arr)
        r = merge_sort(arr); _verify_sorted(r)

    def test_sorted_already(self):
        r = merge_sort([1, 2, 3, 4, 5]); _verify_sorted(r)


class TestQuickSort:
    def test_basic(self):
        r = quick_sort([3, 1, 2]); _verify_sorted(r)

    def test_reversed(self):
        r = quick_sort([5, 4, 3, 2, 1]); _verify_sorted(r)

    def test_duplicates(self):
        r = quick_sort([3, 1, 3, 2, 1]); _verify_sorted(r)


class TestSortingRunner:
    def test_basic_run(self):
        runner = SortingRunner()
        r = runner.run({"algorithms": ["BUBBLE", "MERGE"], "array_sizes": [10], "num_trials": 2, "seed": 42})
        assert r["status"] == "COMPLETED"
        assert r["total_runs"] == 4
        assert "BUBBLE" in r["summary"]

    def test_merge_faster_than_bubble(self):
        runner = SortingRunner()
        r = runner.run({"algorithms": ["BUBBLE", "MERGE"], "array_sizes": [30], "num_trials": 2, "seed": 42})
        assert r["summary"]["MERGE"]["avg_comparisons"] < r["summary"]["BUBBLE"]["avg_comparisons"]

    def test_reversed_pattern(self):
        runner = SortingRunner()
        r = runner.run({"algorithms": ["BUBBLE"], "array_sizes": [10], "num_trials": 1, "data_pattern": "reversed", "seed": 1})
        assert r["runs"][0]["original"] == [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

    def test_steps_contain_arr(self):
        r = bubble_sort([3, 1, 2])
        assert len(r["steps"]) > 0
        for s in r["steps"]:
            assert "arr" in s
            assert s["type"] in ("compare", "swap")
