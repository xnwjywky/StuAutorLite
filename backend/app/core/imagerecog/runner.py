"""
统一图像识别实验 Runner — 两阶段架构：先训练（一次）→ 再逐噪声测试。

模型缓存：MLP/CNN 等慢算法只训练一次，后续噪声级别直接复用权重。
快速算法（KNN/DT/Template）不阻塞——它们"训练"是 O(1) 存数据。

SSE 事件流：
  start → [train_start → train_progress* → train_done]* (all algos in parallel-like order)
       → [noise_start → [test_batch* → algo_done]* → noise_done]* (serial by noise)
       → done
"""
import time
import random
from .data import generate_shape_dataset, generate_digit_dataset, SIZE
from .algorithms import ALGO_REGISTRY, SHAPE_DEFAULT_ALGOS, DIGIT_DEFAULT_ALGOS
from app.core.shaperecog.algorithms import (
    _grid_to_vector,
    _gini, _tree_predict,
    _mlp_train, _mlp_predict,
    _cnn_train, _cnn_predict,
)

# ── 模型缓存（实例级，单次实验内有效）─────────────────────

def _cache_key(algo_name: str, params: dict) -> str:
    items = sorted(params.items())
    return f"{algo_name}:{items}"


class ImageRecogRunner:
    def __init__(self):
        self._model_cache: dict[str, dict] = {}

    def run(self, config: dict) -> dict:
        results = []
        summary = None
        exp_type = ""
        for event in self.run_stream(config):
            if event["type"] == "done":
                results = event.get("all_runs", [])
                summary = event.get("summary", {})
                exp_type = event.get("experiment_type", "")
        return {
            "status": "COMPLETED", "experiment_type": exp_type,
            "runs": results, "summary": summary, "total_runs": len(results),
        }

    def run_stream(self, config: dict):
        """流式生成器 — 两阶段：先训所有算法 → 再逐噪声测试。"""
        exp_type = config.get("experiment_type", "shape")
        algo_names = config.get("algorithms") or (
            SHAPE_DEFAULT_ALGOS if exp_type == "shape" else DIGIT_DEFAULT_ALGOS
        )
        algo_params = config.get("algo_params", {})
        n_samples = max(30, min(config.get("n_samples", 200), 1000))
        noise_levels = config.get("noise_levels", [0.0])
        num_trials = max(1, min(config.get("num_trials", 5), 10))
        train_ratio = max(0.3, min(config.get("train_ratio", 0.7), 0.9))
        seed = config.get("seed", 42)

        all_runs = []
        total_algos = len(algo_names)
        total_noises = len(noise_levels)
        total_phases = total_algos + total_noises * total_algos

        yield {"type": "start", "total_algos": total_algos, "total_noises": total_noises,
               "algorithms": algo_names, "noise_levels": noise_levels}

        # ── 阶段0: 生成训练数据（所有噪声共用同一份训练集，noise=0）──
        # 训练数据用 noise=0 保证模型学到的是干净特征
        train_seed = seed + 9999
        if exp_type == "shape":
            train_data = generate_shape_dataset(n_samples, 0.0, train_seed)
        else:
            train_data = generate_digit_dataset(n_samples, 0.0, train_seed)

        all_grids = train_data["grids"]
        all_labels = train_data["labels"]
        n = len(all_grids)
        n_train = int(n * train_ratio)
        indices = list(range(n))
        rng = random.Random(train_seed)
        rng.shuffle(indices)
        train_idx = set(indices[:n_train])
        grids_train = [all_grids[i] for i in range(n) if i in train_idx]
        labels_train = [all_labels[i] for i in range(n) if i in train_idx]

        # ── 阶段1: 训练所有算法（快算法优先，慢算法在后）──
        phase_idx = 0
        model_params = {}

        # 排序：无训练成本的算法先执行（模板/KNN/特征/随机），有训练成本的（DT/MLP/CNN）在后
        FAST_ALGOS = {"TEMPLATE", "PIXEL_KNN", "FEATURE", "RANDOM"}
        ordered_names = sorted(algo_names, key=lambda n: (0 if n in FAST_ALGOS else 1))

        for ai, name in enumerate(ordered_names):
            entry = ALGO_REGISTRY.get(name)
            if not entry:
                continue
            params = {k: v["default"] for k, v in entry.get("params", {}).items()}
            params.update(algo_params.get(name, {}))
            ck = _cache_key(name, params)

            # 检查缓存
            if ck in self._model_cache:
                model_params[name] = self._model_cache[ck]
                yield {"type": "train_done", "algorithm": name, "cached": True,
                       "params": params, "phase_idx": phase_idx, "total_phases": total_phases,
                       "message": f"{name}: 模型已缓存，跳过训练"}
                phase_idx += 1
                continue

            yield {"type": "train_start", "algorithm": name, "params": params,
                   "phase_idx": phase_idx, "total_phases": total_phases,
                   "message": f"{name}: 开始训练..."}

            t0 = time.perf_counter()
            vecs_train = _grid_to_vector_flat(grids_train)

            # 按算法类型分发训练逻辑
            if name == "MLP":
                hidden = params.get("hidden", 64)
                epochs = params.get("epochs", 30)
                # 一次性训练，yield 进度事件（模拟 epoch 进度）
                yield {"type": "train_progress", "algorithm": name, "params": params,
                       "epoch": 0, "total_epochs": epochs,
                       "phase_idx": phase_idx, "total_phases": total_phases,
                       "message": f"{name}: 训练中... 0/{epochs}"}
                model = _mlp_train(vecs_train, labels_train, hidden=hidden,
                                   lr=0.05, epochs=epochs, batch_size=16)
                self._model_cache[ck] = model
                model_params[name] = model
                yield {"type": "train_progress", "algorithm": name, "params": params,
                       "epoch": epochs, "total_epochs": epochs,
                       "phase_idx": phase_idx, "total_phases": total_phases,
                       "message": f"{name}: 训练完成 {epochs}/{epochs}"}

            elif name == "CNN":
                epochs = params.get("epochs", 20)
                yield {"type": "train_progress", "algorithm": name, "params": params,
                       "epoch": 0, "total_epochs": epochs,
                       "phase_idx": phase_idx, "total_phases": total_phases,
                       "message": f"{name}: 训练中... 0/{epochs}"}
                model = _cnn_train(grids_train, labels_train, lr=0.03, epochs=epochs)
                self._model_cache[ck] = model
                model_params[name] = model
                yield {"type": "train_progress", "algorithm": name, "params": params,
                       "epoch": epochs, "total_epochs": epochs,
                       "phase_idx": phase_idx, "total_phases": total_phases,
                       "message": f"{name}: 训练完成 {epochs}/{epochs}"}

            elif name == "DECISION_TREE":
                md = params.get("max_depth", 8)
                tree = _build_tree_cached(vecs_train, labels_train, 0, md, 3)
                model = {"tree": tree}
                self._model_cache[ck] = model
                model_params[name] = model

            elif name == "PIXEL_KNN":
                k_val = params.get("k", 3)
                # KNN "训练"就是存数据
                model_params[name] = {"vecs": vecs_train, "labels": labels_train, "k": k_val}
                self._model_cache[ck] = model_params[name]

            elif name == "FEATURE":
                k_val_feat = params.get("k", 3)
                feats_train = [_extract_features_vec(g) for g in grids_train]
                model_params[name] = {"feats": feats_train, "labels": labels_train, "k": k_val_feat}

            elif name == "TEMPLATE":
                # 模板匹配：每类取第一个样本作为模板
                templates = {}
                for g, lbl in zip(grids_train, labels_train):
                    if lbl not in templates:
                        templates[lbl] = g
                    if len(templates) >= len(set(labels_train)):
                        break
                model_params[name] = {"templates": templates}

            elif name == "RANDOM":
                model_params[name] = {"classes": list(set(labels_train))}

            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            yield {"type": "train_done", "algorithm": name, "cached": False,
                   "params": params, "train_ms": elapsed,
                   "phase_idx": phase_idx, "total_phases": total_phases,
                   "message": f"{name}: 训练完成 ({elapsed}ms)"}
            phase_idx += 1

        # ── 阶段2: 逐噪声水平测试 ──
        for ni, noise in enumerate(noise_levels):
            yield {"type": "noise_start", "noise": noise, "noise_idx": ni,
                   "total_noises": total_noises,
                   "message": f"噪声 {(noise*100):.0f}% — 生成测试数据..."}

            for trial in range(num_trials):
                trial_seed = seed + ni * 100 + trial * 10
                if exp_type == "shape":
                    data = generate_shape_dataset(n_samples, noise, trial_seed)
                else:
                    data = generate_digit_dataset(n_samples, noise, trial_seed)

                grids = data["grids"]
                labels = data["labels"]
                n2 = len(grids)
                n_train2 = int(n2 * train_ratio)
                indices2 = list(range(n2))
                rng2 = random.Random(trial_seed)
                rng2.shuffle(indices2)
                train_idx2 = set(indices2[:n_train2])
                test_grids = [grids[i] for i in range(n2) if i not in train_idx2]
                test_labels = [labels[i] for i in range(n2) if i not in train_idx2]
                n_test = len(test_labels)
                n_test_viz = min(n_test, 12)

                # 对每个算法执行测试（快算法先完成，慢算法可能还在 yield 中就被后面的追上）
                for ai, name in enumerate(algo_names):
                    model = model_params.get(name)
                    if model is None:
                        continue

                    params = {k: v["default"] for k, v in ALGO_REGISTRY.get(name, {}).get("params", {}).items()}
                    params.update(algo_params.get(name, {}))

                    yield {"type": "algo_started", "algorithm": name,
                           "noise": noise, "noise_idx": ni, "trial": trial + 1,
                           "n_test": n_test, "phase_idx": phase_idx, "total_phases": total_phases,
                           "message": f"{name}: 开始测试 {n_test} 个样本..."}

                    t0 = time.perf_counter()
                    BATCH_SIZE = 8
                    preds = []

                    for bs in range(0, n_test, BATCH_SIZE):
                        be = min(bs + BATCH_SIZE, n_test)
                        batch_grids, batch_labels, batch_preds, batch_corrects = [], [], [], []
                        for idx in range(bs, be):
                            p = self._predict(name, model, test_grids[idx], params)
                            batch_preds.append(p)
                            preds.append(p)
                            if idx < n_test_viz:
                                batch_grids.append(test_grids[idx])
                                batch_labels.append(test_labels[idx])
                            batch_corrects.append(p == test_labels[idx])

                        yield {"type": "test_batch", "algorithm": name,
                               "noise": noise, "noise_idx": ni,
                               "trial": trial + 1,
                               "batch_grids": batch_grids,
                               "batch_labels": batch_labels,
                               "batch_preds": batch_preds[:len(batch_grids)],
                               "corrects": batch_corrects,
                               "tested_so_far": be, "total_test": n_test,
                               "phase_idx": phase_idx, "total_phases": total_phases,
                               "message": f"{name}: 测试 {be}/{n_test}..."}

                    elapsed = round((time.perf_counter() - t0) * 1000, 2)
                    correct = sum(1 for p, l in zip(preds, test_labels) if p == l)
                    viz_steps = [{"testIndex": i, "grid": test_grids[i],
                                  "trueLabel": test_labels[i], "predictedLabel": preds[i],
                                  "correct": preds[i] == test_labels[i]}
                                 for i in range(n_test_viz)]

                    run_record = {
                        "algorithm": name, "experiment_type": exp_type,
                        "n_samples": n_samples, "noise_level": noise,
                        "trial": trial + 1, "seed": trial_seed,
                        "accuracy": round(correct / max(n_test, 1), 3),
                        "correct": correct, "total": n_test,
                        "runtime_ms": elapsed, "test_grids": test_grids,
                        "test_labels": test_labels, "predictions": preds,
                        "train_ratio": train_ratio, "grid_size": SIZE,
                        "params_used": params, "viz_steps": viz_steps,
                        "n_classes": data.get("n_classes", len(data.get("class_names", []))),
                        "class_names": data.get("class_names", []),
                    }
                    all_runs.append(run_record)

                    yield {"type": "algo_done", "algorithm": name,
                           "accuracy": run_record["accuracy"],
                           "correct": correct, "total": n_test,
                           "runtime_ms": elapsed, "viz_steps": viz_steps,
                           "params_used": params, "noise": noise, "noise_idx": ni,
                           "trial": trial + 1,
                           "phase_idx": phase_idx, "total_phases": total_phases,
                           "message": f"{name}: ✓ 准确率 {(run_record['accuracy']*100):.1f}% ({correct}/{n_test}) · {elapsed}ms"}
                    phase_idx += 1

            # 该噪声水平全部算法完成
            noise_runs = [r for r in all_runs if r.get("noise_level") == noise]
            noise_groups = {}
            for r in noise_runs:
                noise_groups.setdefault(r["algorithm"], []).append(r)
            noise_summary = {}
            for aname, recs in noise_groups.items():
                accs = [r["accuracy"] for r in recs]
                times = [r["runtime_ms"] for r in recs]
                noise_summary[aname] = {
                    "avg_accuracy": round(sum(accs) / len(recs), 3),
                    "min_accuracy": min(accs), "max_accuracy": max(accs),
                    "avg_runtime_ms": round(sum(times) / len(recs), 2), "count": len(recs),
                }
            yield {"type": "noise_done", "noise": noise, "noise_idx": ni,
                   "runs": noise_runs, "summary": noise_summary, "total_runs": len(noise_runs),
                   "message": f"噪声 {(noise*100):.0f}% 完成 ✓"}

        # ── 最终汇总 ──
        groups = {}
        for r in all_runs:
            groups.setdefault(r["algorithm"], []).append(r)
        summary = {}
        for aname, recs in groups.items():
            accs = [r["accuracy"] for r in recs]
            times = [r["runtime_ms"] for r in recs]
            summary[aname] = {
                "avg_accuracy": round(sum(accs) / len(recs), 3),
                "min_accuracy": min(accs), "max_accuracy": max(accs),
                "avg_runtime_ms": round(sum(times) / len(recs), 2), "count": len(recs),
            }
        yield {"type": "done", "experiment_type": exp_type, "summary": summary,
               "total_runs": len(all_runs), "all_runs": all_runs,
               "message": f"全部完成！{len(groups)} 个算法，{total_noises} 组噪声。"}

    # ── 推理 ──────────────────────────────────────────────

    def _predict(self, name: str, model: dict, grid: list, params: dict):
        """用缓存的模型进行单样本推理。"""
        if name == "PIXEL_KNN":
            vec = _grid_to_vector_flat([grid])[0]
            dists = [(math_dist(vec, v), l) for v, l in zip(model["vecs"], model["labels"])]
            dists.sort(key=lambda d: d[0])
            k = params.get("k", model.get("k", 3))
            votes = {}
            for _, lbl in dists[:k]:
                votes[lbl] = votes.get(lbl, 0) + 1
            return max(votes, key=votes.get)

        elif name == "FEATURE":
            feat = _extract_features_vec(grid)
            dists = [(math_dist(feat, f), l) for f, l in zip(model["feats"], model["labels"])]
            dists.sort(key=lambda d: d[0])
            k = params.get("k", model.get("k", 3))
            votes = {}
            for _, lbl in dists[:k]:
                votes[lbl] = votes.get(lbl, 0) + 1
            return max(votes, key=votes.get)

        elif name == "DECISION_TREE":
            vec = _grid_to_vector_flat([grid])[0]
            return _tree_predict(model["tree"], vec)

        elif name == "TEMPLATE":
            best_label, best_score = "unknown", -1
            for lbl, tmpl in model["templates"].items():
                s = sum(1 for y in range(SIZE) for x in range(SIZE) if tmpl[y][x] == grid[y][x])
                if s > best_score:
                    best_score = s
                    best_label = lbl
            return best_label

        elif name == "MLP":
            vec = _grid_to_vector_flat([grid])[0]
            return _mlp_predict(model, vec)

        elif name == "CNN":
            return _cnn_predict(model, grid)

        elif name == "RANDOM":
            return random.choice(model["classes"])

        return "unknown"


# ── 辅助函数 ─────────────────────────────────────────────

def _grid_to_vector_flat(grids: list[list[list[int]]]) -> list[list[int]]:
    return [[cell for row in g for cell in row] for g in grids]


def math_dist(a: list, b: list) -> float:
    return sum((ai - bi) ** 2 for ai, bi in zip(a, b)) ** 0.5


def _extract_features_vec(grid: list[list[int]]) -> list[float]:
    """提取几何特征向量（与 shaperecog 一致）。"""
    xs, ys, count = [], [], 0
    for y in range(SIZE):
        for x in range(SIZE):
            if grid[y][x]:
                xs.append(x); ys.append(y); count += 1
    if count == 0:
        return [0.0, 0.0, 0.0, 0.0, 0.0]
    cx = sum(xs) / count
    cy = sum(ys) / count
    width = max(xs) - min(xs) + 1
    height = max(ys) - min(ys) + 1
    aspect = width / max(height, 1)
    center_offset = math_dist([cx, cy], [SIZE / 2, SIZE / 2]) / SIZE
    sym = sum(1 for y in range(SIZE) for x in range(SIZE // 2)
              if grid[y][x] == grid[y][SIZE - 1 - x]) / max(SIZE * SIZE / 2, 1)
    density = count / (SIZE * SIZE)
    return [count / 100.0, aspect, center_offset, sym, density]


def _build_tree_cached(X, y, depth, max_depth, min_samples):
    """构建决策树（与 shaperecog 一致）。"""
    if depth >= max_depth or len(set(y)) == 1 or len(y) < min_samples:
        return {"leaf": True, "class": max(set(y), key=y.count)}
    n_features = len(X[0])
    best_gini = float("inf")
    best_feat, best_thresh = -1, 0
    feats = random.sample(range(n_features), max(1, int(n_features ** 0.5)))
    for f in feats:
        vals = sorted({xi[f] for xi in X})
        if len(vals) < 2:
            continue
        step = max(1, len(vals) // 20)
        for vi in range(0, len(vals) - 1, step):
            th = (vals[vi] + vals[vi + 1]) / 2
            left_y, right_y = [], []
            for xi, yi in zip(X, y):
                (left_y if xi[f] <= th else right_y).append(yi)
            if not left_y or not right_y:
                continue
            g = _gini(left_y) * len(left_y) + _gini(right_y) * len(right_y)
            if g < best_gini:
                best_gini = g
                best_feat = f
                best_thresh = th
    if best_feat == -1:
        return {"leaf": True, "class": max(set(y), key=y.count)}
    left_X, left_y, right_X, right_y = [], [], [], []
    for xi, yi in zip(X, y):
        (left_X if xi[best_feat] <= best_thresh else right_X).append(xi)
        (left_y if xi[best_feat] <= best_thresh else right_y).append(yi)
    return {"leaf": False, "feature": best_feat, "threshold": best_thresh,
            "class": max(set(y), key=y.count),
            "left": _build_tree_cached(left_X, left_y, depth + 1, max_depth, min_samples),
            "right": _build_tree_cached(right_X, right_y, depth + 1, max_depth, min_samples)}
