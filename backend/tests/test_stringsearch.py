"""测试字符串搜索算法 — 暴力 / KMP / Boyer-Moore / Rabin-Karp"""
import pytest
from app.core.stringsearch.algorithms import naive_search, kmp_search, boyer_moore_search, rabin_karp_search
from app.core.stringsearch.runner import StringSearchRunner


class TestNaive:
    def test_basic(self): r = naive_search("abcabc", "abc"); assert r["matches"] == [0, 3]
    def test_no_match(self): r = naive_search("aaaa", "b"); assert r["matches"] == []
    def test_comparisons(self): r = naive_search("abcde", "abc"); assert r["comparisons"] >= 3
    def test_emits_found_steps(self):
        """匹配成功时 step 序列中包含 'found' 类型步骤。"""
        r = naive_search("abcabc", "abc"); steps = r["steps"]
        found_steps = [s for s in steps if s["type"] == "found"]
        assert len(found_steps) == 2  # 两处匹配
        assert found_steps[0]["i"] == 0
        assert found_steps[1]["i"] == 3


class TestKMP:
    def test_basic(self): r = kmp_search("abcabc", "abc"); assert r["matches"] == [0, 3]
    def test_no_match(self): r = kmp_search("aaaa", "b"); assert r["matches"] == []
    def test_overlapping(self): r = kmp_search("aaaaa", "aa"); assert r["matches"] == [0, 1, 2, 3]


class TestBoyerMoore:
    def test_basic(self): r = boyer_moore_search("abcabc", "abc"); assert 0 in r["matches"]
    def test_no_match(self): r = boyer_moore_search("aaaa", "b"); assert r["matches"] == []


class TestRabinKarp:
    def test_basic(self): r = rabin_karp_search("abcabc", "abc"); assert 0 in r["matches"]
    def test_no_match(self): r = rabin_karp_search("aaaa", "b"); assert r["matches"] == []
    def test_comparisons_count_hash(self):
        """哈希比对计入比较次数 — 200 字符文本约 ~200 次比较（哈希 + 逐字符验证）。"""
        r = StringSearchRunner().run({"algorithms": ["RABIN_KARP"], "text_length": 200, "num_trials": 1, "seed": 42})
        comps = r["summary"]["RABIN_KARP"]["avg_comparisons"]
        assert comps >= 150, f"Expected >=150 hash+verify comparisons for 200-char text, got {comps}"
    def test_emits_found_steps(self):
        """Rabin-Karp 匹配成功时 step 序列中包含 'found' 步骤。"""
        r = rabin_karp_search("abcabc", "abc"); steps = r["steps"]
        found_steps = [s for s in steps if s["type"] == "found"]
        assert len(found_steps) == 2


class TestStringSearchRunner:
    def test_basic_run(self):
        r = StringSearchRunner().run({"algorithms": ["NAIVE", "KMP"], "text_length": 100, "num_trials": 2, "seed": 42})
        assert r["total_runs"] == 4
        assert r["summary"]["KMP"]["avg_comparisons"] < r["summary"]["NAIVE"]["avg_comparisons"]

    def test_absent_pattern(self):
        r = StringSearchRunner().run({"algorithms": ["NAIVE"], "text_length": 100, "pattern_type": "absent", "num_trials": 1, "seed": 1})
        assert r["runs"][0]["matches"] == 0

    def test_reproducibility(self):
        r1 = StringSearchRunner().run({"algorithms": ["KMP"], "text_length": 100, "num_trials": 1, "seed": 42})
        r2 = StringSearchRunner().run({"algorithms": ["KMP"], "text_length": 100, "num_trials": 1, "seed": 42})
        assert r1["runs"][0]["text"] == r2["runs"][0]["text"]
