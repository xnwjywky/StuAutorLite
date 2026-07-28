"""RL 实验 Runner — 批量运行，汇总统计 + 轨迹对比 + 策略演变快照

复用模式：与 sorting/runner.py 一致的结构。
"""
import time, copy
from .gridworld import GridWorld
from .agents import RLAgent, QLearningAgent, SARSAAgent

AGENTS = {"Q_LEARNING": QLearningAgent, "SARSA": SARSAAgent}

MAX_STEPS = 300  # 每局最大步数


def _snapshot_q(agent: RLAgent, size: int) -> list[list[dict]]:
    """将 Q 表导出为前端可渲染的 2D 网格快照。

    每格: {best_action: 0-3, max_q: float, q_values: [float×4]}
    """
    acts = [(-1, 0), (1, 0), (0, -1), (0, 1)]  # ← → ↑ ↓ (对应 gridworld.ACTIONS)
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            qs = [round(agent._q(y, x, a), 3) for a in range(4)]
            best = max(range(4), key=lambda a: qs[a])
            row.append({"best_action": best, "max_q": qs[best], "q_values": qs})
        rows.append(row)
    return rows


def _train_agent(
    aname: str, agent_cls, env: GridWorld, grid_size: int,
    num_episodes: int, lr: float, gamma: float, eps: float,
    snapshot_intervals: list[int] | None = None,
) -> dict:
    """训练一个 agent，可选在指定 episode 保存 Q 表快照。

    返回 {agent, train_rewards, train_success, test_path, test_reward,
           test_success, runtime_ms, q_snapshots}
    """
    t0 = time.perf_counter()
    train_rewards: list[float] = []
    train_success: list[int] = []
    snapshots: list[dict] = []
    snapshot_set = set(snapshot_intervals or [])

    agent = agent_cls(learning_rate=lr, discount=gamma, epsilon=eps)
    agent.init_episode(grid_size)

    for ep in range(num_episodes):
        # ε-退火: 前 20% 局用高探索率, 之后线性衰减到 eps/5
        progress = min(1.0, ep / max(num_episodes * 0.2, 1))
        agent.epsilon = eps * (1.0 - progress * 0.8)

        s = env.start
        total_r = 0.0
        success = 0

        a = agent.select_action(s)
        for _ in range(MAX_STEPS):
            s_next, r, done = env.step(s, a)
            total_r += r

            if aname == "Q_LEARNING":
                agent.update(s, a, r, s_next, done)
                a = agent.select_action(s_next) if not done else 0
            else:
                a_next = agent.select_action(s_next) if not done else 0
                agent.update(s, a, r, s_next, a_next, done)
                a = a_next

            s = s_next
            if done:
                if r > 0:
                    success = 1
                break

        train_rewards.append(round(total_r, 2))
        train_success.append(success)

        # 保存快照
        if ep in snapshot_set:
            snapshots.append({
                "episode": ep + 1,
                "cells": _snapshot_q(agent, grid_size),
                "epsilon": round(agent.epsilon, 3),
            })

    # 测试阶段（ε=0 纯贪婪）+ 记录每个 decision 的 Q 值
    saved_eps = agent.epsilon
    agent.epsilon = 0.0
    test_states: list[tuple[int, int]] = []
    test_decisions: list[dict] = []  # 每一步的状态/动作/Q值
    test_reward = 0.0
    test_success = False
    s = env.start
    test_states.append(s)
    visited_test: set[tuple[int, int]] = set()
    for step_i in range(MAX_STEPS):
        # 记录当前状态的所有 Q 值
        qs = [round(agent._q(s[1], s[0], a), 3) for a in range(4)]
        a = agent.best_action(s)
        test_decisions.append({
            "step": step_i + 1,
            "state": list(s),
            "action": a,
            "q_values": qs,
            "best_action": a,
        })
        s_next, r, done = env.step(s, a)
        test_states.append(s_next)
        test_reward += r
        s = s_next
        if s in visited_test:
            break
        visited_test.add(s)
        if done:
            test_success = r > 0
            break
    agent.epsilon = saved_eps

    runtime_ms = round((time.perf_counter() - t0) * 1000, 2)
    tail = min(100, num_episodes)
    recent_rewards = train_rewards[-tail:]
    recent_success = train_success[-tail:]

    return {
        "agent": aname,
        "train_rewards": train_rewards,
        "train_success": train_success,
        "avg_reward": round(sum(recent_rewards) / max(len(recent_rewards), 1), 2),
        "success_rate": round(sum(recent_success) / max(len(recent_success), 1), 3),
        "test_success": test_success,
        "test_reward": round(test_reward, 2),
        "test_path": [list(s) for s in test_states],
        "test_decisions": test_decisions,
        "runtime_ms": runtime_ms,
        "q_snapshots": snapshots,
    }


class RLRunner:
    def run(self, config: dict) -> dict:
        """批量实验 — 与原有接口兼容。"""
        return _run_batch(config)

    def run_eval_compare(self, config: dict) -> dict:
        """轨迹对比模式：同地图训练+评估，返回叠加路径 + Q 表快照。

        额外返回字段：
          - compare_paths: {agent: [x,y], ...}  两个 agent 的评估路径
          - q_snapshots: [{episode, agent, cells}]  策略演变快照
        """
        agent_names = [a for a in config.get("agents", ["Q_LEARNING", "SARSA"]) if a in AGENTS]
        if not agent_names:
            agent_names = ["Q_LEARNING", "SARSA"]

        grid_size = max(5, min(config.get("grid_size", 8), 12))
        num_traps = max(0, min(config.get("num_traps", 3), 8))
        num_episodes = max(100, min(config.get("num_episodes", 2000), 5000))
        lr = config.get("learning_rate", 0.1)
        gamma = config.get("discount", 0.9)
        eps = config.get("epsilon", 0.1)
        seed = config.get("seed", 42)

        # 生成快照时间点（均匀分布 5 个 + 最终）
        step = max(1, num_episodes // 5)
        snapshot_intervals = sorted(set(
            [step, step * 2, step * 3, step * 4, step * 5, num_episodes - 1]
        ))

        env = GridWorld(size=grid_size, num_traps=num_traps, seed=seed)
        env.reset()
        world_dict = env.to_dict()

        all_q_snapshots: list[dict] = []
        compare_paths: dict[str, list] = {}
        compare_decisions: dict[str, list] = {}  # 每步决策详情
        all_train = {}

        for aname in agent_names:
            agent_cls = AGENTS[aname]
            env_copy = GridWorld(size=grid_size, num_traps=num_traps, seed=seed)
            env_copy.reset()
            result = _train_agent(
                aname, agent_cls, env_copy, grid_size,
                num_episodes, lr, gamma, eps, snapshot_intervals,
            )
            all_train[aname] = result
            compare_paths[aname] = result["test_path"]
            compare_decisions[aname] = result.get("test_decisions", [])
            for snap in result["q_snapshots"]:
                snap["agent"] = aname
            all_q_snapshots.extend(result["q_snapshots"])

        # 按 episode 排序快照
        all_q_snapshots.sort(key=lambda s: (s["episode"], s["agent"]))

        # 组装摘要
        summary = {}
        for name, r in all_train.items():
            summary[name] = {
                "avg_reward": r["avg_reward"],
                "avg_success_rate": r["success_rate"],
                "test_success": r["test_success"],
                "test_reward": r["test_reward"],
                "runtime_ms": r["runtime_ms"],
            }

        return {
            "status": "COMPLETED",
            "world": world_dict,
            "compare_paths": compare_paths,
            "compare_decisions": compare_decisions,
            "q_snapshots": all_q_snapshots,
            "train_rewards": {k: v["train_rewards"] for k, v in all_train.items()},
            "train_success": {k: v["train_success"] for k, v in all_train.items()},
            "summary": summary,
            "grid_size": grid_size,
            "num_episodes": num_episodes,
            # Compatible batch-run format for individual test path display
            "runs": [
                {
                    "agent": name,
                    "grid_size": grid_size,
                    "num_traps": num_traps,
                    "num_episodes": num_episodes,
                    "learning_rate": lr, "discount": gamma, "epsilon": eps,
                    "trial": 1, "seed": seed,
                    "train_rewards": r["train_rewards"],
                    "train_success": r["train_success"],
                    "avg_reward": r["avg_reward"],
                    "success_rate": r["success_rate"],
                    "test_success": r["test_success"],
                    "test_reward": r["test_reward"],
                    "test_path": r["test_path"],
                    "world": world_dict,
                    "runtime_ms": r["runtime_ms"],
                }
                for name, r in all_train.items()
            ],
            "total_runs": len(all_train),
        }


def _run_batch(config: dict) -> dict:
    """原有批量实验逻辑。"""
    agent_names = [a for a in config.get("agents", ["Q_LEARNING", "SARSA"]) if a in AGENTS]
    if not agent_names:
        agent_names = ["Q_LEARNING", "SARSA"]

    grid_size = max(5, min(config.get("grid_size", 8), 12))
    num_traps = max(0, min(config.get("num_traps", 3), 8))
    num_episodes = max(10, min(config.get("num_episodes", 500), 2000))
    lr = config.get("learning_rate", 0.1)
    gamma = config.get("discount", 0.9)
    eps = config.get("epsilon", 0.1)
    num_trials = max(1, min(config.get("num_trials", 3), 10))
    seed = config.get("seed", 42)

    all_runs = []
    for trial in range(num_trials):
        trial_seed = seed + trial * 100
        env = GridWorld(size=grid_size, num_traps=num_traps, seed=trial_seed)
        env.reset()
        world_dict = env.to_dict()

        for aname in agent_names:
            agent_cls = AGENTS[aname]
            result = _train_agent(
                aname, agent_cls, env, grid_size,
                num_episodes, lr, gamma, eps,
            )
            run = {
                **result,
                "grid_size": grid_size, "num_traps": num_traps,
                "num_episodes": num_episodes, "learning_rate": lr,
                "discount": gamma, "epsilon": eps,
                "trial": trial + 1, "seed": trial_seed,
                "world": world_dict,
            }
            all_runs.append(run)

    groups: dict[str, list[dict]] = {}
    for r in all_runs:
        groups.setdefault(r["agent"], []).append(r)
    summary = {}
    for name, recs in groups.items():
        n = len(recs)
        summary[name] = {
            "avg_reward": round(sum(r["avg_reward"] for r in recs) / n, 2),
            "avg_success_rate": round(sum(r["success_rate"] for r in recs) / n, 3),
            "avg_test_success_rate": round(sum(1 for r in recs if r["test_success"]) / n, 3),
            "avg_runtime_ms": round(sum(r["runtime_ms"] for r in recs) / n, 2),
            "count": n,
        }

    return {
        "status": "COMPLETED",
        "runs": all_runs,
        "summary": summary,
        "total_runs": len(all_runs),
    }
