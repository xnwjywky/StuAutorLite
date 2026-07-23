"""RL 实验 Runner — 批量运行，汇总统计

复用模式：与 sorting/runner.py 一致的结构。
"""
import time
from .gridworld import GridWorld
from .agents import QLearningAgent, SARSAAgent

AGENTS = {"Q_LEARNING": QLearningAgent, "SARSA": SARSAAgent}

MAX_STEPS = 300  # 每局最大步数


class RLRunner:
    def run(self, config: dict) -> dict:
        """
        config:
            agents: list[str]   ["Q_LEARNING", "SARSA"]
            grid_size: int      5-12
            num_traps: int      0-8
            num_episodes: int   训练局数
            learning_rate: float
            discount: float
            epsilon: float
            num_trials: int     重复实验次数
            seed: int
        """
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
            # 同一 trial 下所有 agent 共享地图（公平对比）
            env = GridWorld(size=grid_size, num_traps=num_traps, seed=trial_seed)
            env.reset()
            world_dict = env.to_dict()

            for aname in agent_names:
                agent_cls = AGENTS[aname]
                t0 = time.perf_counter()

                # 训练阶段
                train_rewards: list[float] = []
                train_success: list[int] = []
                trained_agent = agent_cls(learning_rate=lr, discount=gamma, epsilon=eps)
                trained_agent.init_episode(grid_size)

                for ep in range(num_episodes):
                    # ε-退火: 前 20% 局用高探索率, 之后线性衰减到 eps/5
                    progress = min(1.0, ep / max(num_episodes * 0.2, 1))
                    trained_agent.epsilon = eps * (1.0 - progress * 0.8)

                    s = env.start
                    total_r = 0.0
                    success = 0

                    a = trained_agent.select_action(s)
                    for step_i in range(MAX_STEPS):
                        s_next, r, done = env.step(s, a)
                        total_r += r

                        if aname == "Q_LEARNING":
                            trained_agent.update(s, a, r, s_next, done)
                            a = trained_agent.select_action(s_next) if not done else 0
                        else:
                            a_next = (
                                trained_agent.select_action(s_next) if not done else 0
                            )
                            trained_agent.update(s, a, r, s_next, a_next, done)
                            a = a_next

                        s = s_next
                        if done:
                            if r > 0:
                                success = 1
                            break

                    train_rewards.append(round(total_r, 2))
                    train_success.append(success)

                # 测试阶段（纯贪婪，在训练地图上跑一遍看路径，不走随机探索）
                saved_eps = trained_agent.epsilon
                trained_agent.epsilon = 0.0
                test_states: list[tuple[int, int]] = []
                test_reward = 0.0
                test_success = False
                s = env.start
                test_states.append(s)
                visited_test: set[tuple[int, int]] = set()
                for _ in range(MAX_STEPS):
                    a = trained_agent.best_action(s)
                    s_next, r, done = env.step(s, a)
                    test_states.append(s_next)
                    test_reward += r
                    s = s_next
                    if s in visited_test:  # 检测到循环 → 失败
                        break
                    visited_test.add(s)
                    if done:
                        test_success = r > 0
                        break
                trained_agent.epsilon = saved_eps

                runtime_ms = round((time.perf_counter() - t0) * 1000, 2)

                # 选取最后 100 局计算指标
                tail = min(100, num_episodes)
                recent_rewards = train_rewards[-tail:]
                recent_success = train_success[-tail:]

                run = {
                    "agent": aname,
                    "grid_size": grid_size,
                    "num_traps": num_traps,
                    "num_episodes": num_episodes,
                    "learning_rate": lr,
                    "discount": gamma,
                    "epsilon": eps,
                    "trial": trial + 1,
                    "seed": trial_seed,
                    "train_rewards": train_rewards,
                    "train_success": train_success,
                    "avg_reward": round(sum(recent_rewards) / max(len(recent_rewards), 1), 2),
                    "success_rate": round(sum(recent_success) / max(len(recent_success), 1), 3),
                    "test_success": test_success,
                    "test_reward": round(test_reward, 2),
                    "test_path": [list(s) for s in test_states],
                    "world": world_dict,
                    "runtime_ms": runtime_ms,
                }
                all_runs.append(run)

        # 分组汇总
        groups: dict[str, list[dict]] = {}
        for r in all_runs:
            groups.setdefault(r["agent"], []).append(r)
        summary = {}
        for name, recs in groups.items():
            n = len(recs)
            summary[name] = {
                "avg_reward": round(sum(r["avg_reward"] for r in recs) / n, 2),
                "avg_success_rate": round(sum(r["success_rate"] for r in recs) / n, 3),
                "avg_test_success_rate": round(
                    sum(1 for r in recs if r["test_success"]) / n, 3
                ),
                "avg_runtime_ms": round(sum(r["runtime_ms"] for r in recs) / n, 2),
                "count": n,
            }

        return {
            "status": "COMPLETED",
            "runs": all_runs,
            "summary": summary,
            "total_runs": len(all_runs),
        }
