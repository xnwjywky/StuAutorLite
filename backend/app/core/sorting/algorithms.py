"""排序算法 — Bubble / Selection / Merge / Quick（纯 Python，无依赖）

每个算法的 solve() 返回完整步骤序列，供前端逐帧动画渲染。
"""
import random


def bubble_sort(arr: list[int]) -> dict:
    """冒泡排序 — 暴力比较交换 O(n²)"""
    a = arr[:]; n = len(a); steps = []; swaps = comps = 0
    for i in range(n):
        for j in range(n - i - 1):
            comps += 1
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]; swaps += 1
                steps.append({"type": "swap", "i": j, "j": j + 1, "arr": a[:]})
            else:
                steps.append({"type": "compare", "i": j, "j": j + 1, "arr": a[:]})
    return {"success": True, "swaps": swaps, "comparisons": comps, "steps": steps, "result": a}


def selection_sort(arr: list[int]) -> dict:
    """选择排序 — 每轮选最小元素交换 O(n²)"""
    a = arr[:]; n = len(a); steps = []; swaps = comps = 0
    for i in range(n):
        min_idx = i
        for j in range(i + 1, n):
            comps += 1
            if a[j] < a[min_idx]:
                min_idx = j
            steps.append({"type": "compare", "i": i, "j": j, "min": min_idx, "arr": a[:]})
        if min_idx != i:
            a[i], a[min_idx] = a[min_idx], a[i]; swaps += 1
            steps.append({"type": "swap", "i": i, "j": min_idx, "arr": a[:]})
    return {"success": True, "swaps": swaps, "comparisons": comps, "steps": steps, "result": a}


def _merge(a, left, mid, right, steps, counter):
    """归并排序辅助 — 合并两个有序子数组"""
    L = a[left:mid+1]; R = a[mid+1:right+1]
    i = j = 0; k = left; comps = swaps = 0
    while i < len(L) and j < len(R):
        comps += 1
        if L[i] <= R[j]:
            a[k] = L[i]; i += 1
        else:
            a[k] = R[j]; j += 1
        k += 1; counter["ops"] += 1
    while i < len(L): a[k] = L[i]; i += 1; k += 1; counter["ops"] += 1
    while j < len(R): a[k] = R[j]; j += 1; k += 1; counter["ops"] += 1
    steps.append({"type": "merge", "left": left, "right": right, "arr": a[:]})
    return comps


def _merge_sort(a, left, right, steps, counter):
    if left >= right: return 0
    mid = (left + right) // 2
    comps = 0
    comps += _merge_sort(a, left, mid, steps, counter)
    comps += _merge_sort(a, mid + 1, right, steps, counter)
    comps += _merge(a, left, mid, right, steps, counter)
    return comps


def merge_sort(arr: list[int]) -> dict:
    """归并排序 — 分治 O(n log n)"""
    a = arr[:]; steps = []; counter = {"ops": 0}
    steps.append({"type": "compare", "i": 0, "j": len(a)-1, "arr": a[:]})
    comps = _merge_sort(a, 0, len(a) - 1, steps, counter)
    return {"success": True, "swaps": counter["ops"], "comparisons": comps, "steps": steps, "result": a}


def _partition(a, low, high, steps, counter):
    pivot = a[high]; i = low - 1
    for j in range(low, high):
        counter["comps"] += 1
        steps.append({"type": "compare", "i": j, "j": high, "pivot": high, "arr": a[:]})
        if a[j] <= pivot:
            i += 1; a[i], a[j] = a[j], a[i]; counter["swaps"] += 1
            if i != j:
                steps.append({"type": "swap", "i": i, "j": j, "arr": a[:]})
    a[i+1], a[high] = a[high], a[i+1]; counter["swaps"] += 1
    steps.append({"type": "swap", "i": i+1, "j": high, "pivot_done": True, "arr": a[:]})
    return i + 1


def _quick_sort(a, low, high, steps, counter):
    if low < high:
        pi = _partition(a, low, high, steps, counter)
        _quick_sort(a, low, pi - 1, steps, counter)
        _quick_sort(a, pi + 1, high, steps, counter)


def quick_sort(arr: list[int]) -> dict:
    """快速排序 — 分治 + 轴点 O(n log n)"""
    a = arr[:]; steps = []; counter = {"comps": 0, "swaps": 0}
    steps.append({"type": "compare", "i": 0, "j": len(a)-1, "arr": a[:]})
    _quick_sort(a, 0, len(a) - 1, steps, counter)
    return {"success": True, "swaps": counter["swaps"], "comparisons": counter["comps"], "steps": steps, "result": a}


ALGORITHMS = {
    "BUBBLE": bubble_sort,
    "SELECTION": selection_sort,
    "MERGE": merge_sort,
    "QUICK": quick_sort,
}
