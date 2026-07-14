"""字符串搜索算法 — Naive / KMP / Boyer-Moore / Rabin-Karp

每个算法返回完整步骤序列供前端动画渲染。
"""
import time


def naive_search(text: str, pattern: str) -> dict:
    """暴力搜索 — 逐个位置比对 O(n×m)"""
    steps = []; comps = 0
    n, m = len(text), len(pattern)
    matches = []
    for i in range(n - m + 1):
        match = True
        for j in range(m):
            comps += 1
            steps.append({"type": "compare", "i": i, "j": j, "match": text[i + j] == pattern[j], "text": text, "pattern": pattern})
            if text[i + j] != pattern[j]:
                match = False; break
        if match: matches.append(i)
        steps.append({"type": "shift", "i": i, "text": text, "pattern": pattern})
    return {"success": True, "matches": matches, "comparisons": comps, "steps": steps}


def _kmp_prefix(pattern: str) -> list[int]:
    """计算 KMP 前缀函数（失效数组）"""
    m = len(pattern); pi = [0] * m
    k = 0
    for q in range(1, m):
        while k > 0 and pattern[k] != pattern[q]:
            k = pi[k - 1]
        if pattern[k] == pattern[q]:
            k += 1
        pi[q] = k
    return pi


def kmp_search(text: str, pattern: str) -> dict:
    """KMP — 前缀函数跳转 O(n+m)"""
    n, m = len(text), len(pattern); comps = 0
    pi = _kmp_prefix(pattern); steps = []; matches = []
    q = 0  # 已匹配字符数
    for i in range(n):
        while q > 0 and pattern[q] != text[i]:
            comps += 1
            steps.append({"type": "mismatch", "i": i, "q": q, "pi": pi[q-1], "text": text, "pattern": pattern})
            q = pi[q - 1]
        if pattern[q] == text[i]:
            comps += 1
            q += 1
            steps.append({"type": "match_char", "i": i, "q": q, "text": text, "pattern": pattern})
        if q == m:
            matches.append(i - m + 1)
            steps.append({"type": "found", "i": i - m + 1, "text": text, "pattern": pattern})
            q = pi[q - 1]
    return {"success": True, "matches": matches, "comparisons": comps, "steps": steps}


def _bad_char_table(pattern: str) -> dict:
    """Boyer-Moore 坏字符表"""
    table = {}
    for i, ch in enumerate(pattern):
        table[ch] = i
    return table


def boyer_moore_search(text: str, pattern: str) -> dict:
    """Boyer-Moore — 从右向左比对 + 坏字符跳转"""
    n, m = len(text), len(pattern); comps = 0
    bad_char = _bad_char_table(pattern); steps = []; matches = []
    i = 0
    while i <= n - m:
        j = m - 1
        while j >= 0 and pattern[j] == text[i + j]:
            comps += 1
            steps.append({"type": "compare_r", "i": i, "j": j, "match": True, "text": text, "pattern": pattern})
            j -= 1
        if j < 0:
            matches.append(i)
            steps.append({"type": "found", "i": i, "text": text, "pattern": pattern})
            i += 1
        else:
            comps += 1
            steps.append({"type": "mismatch_r", "i": i, "j": j, "text": text, "pattern": pattern})
            bc = bad_char.get(text[i + j], -1)
            shift = max(1, j - bc)
            steps.append({"type": "shift", "i": i, "by": shift, "text": text, "pattern": pattern})
            i += shift
    return {"success": True, "matches": matches, "comparisons": comps, "steps": steps}


def rabin_karp_search(text: str, pattern: str) -> dict:
    """Rabin-Karp — 滚动哈希 + 比对验证"""
    n, m = len(text), len(pattern); comps = 0
    steps = []; matches = []
    d, q = 256, 101  # 基数 + 素数模
    h = pow(d, m - 1, q)
    p_hash = 0; t_hash = 0
    for i in range(m):
        p_hash = (d * p_hash + ord(pattern[i])) % q
        t_hash = (d * t_hash + ord(text[i])) % q

    for i in range(n - m + 1):
        steps.append({"type": "hash_compare", "i": i, "p_hash": p_hash, "t_hash": t_hash, "text": text, "pattern": pattern})
        if p_hash == t_hash:
            match = True
            for j in range(m):
                comps += 1
                steps.append({"type": "verify", "i": i, "j": j, "match": text[i + j] == pattern[j], "text": text, "pattern": pattern})
                if text[i + j] != pattern[j]:
                    match = False; break
            if match: matches.append(i)
        if i < n - m:
            t_hash = (d * (t_hash - ord(text[i]) * h) + ord(text[i + m])) % q
            if t_hash < 0: t_hash += q
        steps.append({"type": "shift", "i": i, "text": text, "pattern": pattern})
    return {"success": True, "matches": matches, "comparisons": comps, "steps": steps}


ALGORITHMS = {
    "NAIVE": naive_search,
    "KMP": kmp_search,
    "BOYER_MOORE": boyer_moore_search,
    "RABIN_KARP": rabin_karp_search,
}
