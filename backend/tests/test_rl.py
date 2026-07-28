"""测试强化学习格子世界 — GridWorld / Q-learning / SARSA / Runner"""
import pytest
from app.core.rl import GridWorld, QLearningAgent, SARSAAgent, RLRunner


class TestGridWorld:
    def test_generate_valid(self):
        env = GridWorld(size=8, num_traps=3, seed=42)
        env.reset()
        d = env.to_dict()
        assert d["size"] == 8
        assert len(d["grid"]) == 8
        assert len(d["traps"]) == 3
        assert d["start"] == [0, 0]
        # 金币可达
        assert env._reachable()

    def test_reproducibility(self):
        env1 = GridWorld(size=8, seed=42)
        env1.reset()
        env2 = GridWorld(size=8, seed=42)
        env2.reset()
        assert env1.grid == env2.grid
        assert env1.gold == env2.gold
        assert env1.traps == env2.traps

    def test_step_out_of_bounds(self):
        env = GridWorld(size=6, num_traps=1, seed=42)
        env.reset()
        # 起点 (0,0)，向左走 (-1,0) 越界 → 原地不动 + 罚分
        s, r, done = env.step((0, 0), 2)  # action=2 是 ←
        assert s == (0, 0)  # 撞墙原地不动
        assert r == -1.0
        assert not done

    def test_step_gold(self):
        env = GridWorld(size=6, num_traps=0, seed=42)
        env.reset()
        # 找一个靠近金币的起始位置来测试
        env.grid = [["." for _ in range(6)] for _ in range(6)]
        env.gold = (2, 0)
        env.grid[0][2] = "G"
        env.start = (0, 0)
        s, r, done = env.step((1, 0), 3)  # 向右走到 (2, 0)
        assert r == 10.0
        assert done

    def test_to_dict_fields(self):
        env = GridWorld(size=5, seed=1)
        env.reset()
        d = env.to_dict()
        assert "grid" in d and "start" in d and "gold" in d and "traps" in d


class TestQLearningAgent:
    def test_init_and_select(self):
        agent = QLearningAgent(learning_rate=0.1, discount=0.9, epsilon=1.0)
        agent.init_episode(8)
        a = agent.select_action((0, 0))
        assert 0 <= a < 4

    def test_update_increases_q(self):
        agent = QLearningAgent(learning_rate=0.5, discount=0.9, epsilon=0)
        agent.init_episode(6)
        s, s_next = (0, 0), (0, 1)
        old = agent._q(0, 0, 1)  # action=1 (↓)
        agent.update(s, 1, 10.0, s_next, False)
        assert agent._q(0, 0, 1) > old

    def test_best_action_consistent(self):
        agent = QLearningAgent(epsilon=0)
        agent.init_episode(6)
        a = agent.best_action((2, 3))
        assert 0 <= a < 4


class TestSARSAAgent:
    def test_init_and_select(self):
        agent = SARSAAgent(epsilon=1.0)
        agent.init_episode(8)
        a = agent.select_action((1, 1))
        assert 0 <= a < 4

    def test_update_with_a_next(self):
        agent = SARSAAgent(learning_rate=0.5, discount=0.9, epsilon=0)
        agent.init_episode(6)
        s, s_next = (0, 0), (0, 1)
        old = agent._q(0, 0, 1)
        agent.update(s, 1, 5.0, s_next, 2, False)
        assert agent._q(0, 0, 1) > old


class TestRLRunner:
    def test_basic_run(self):
        runner = RLRunner()
        result = runner.run({
            "agents": ["Q_LEARNING", "SARSA"],
            "grid_size": 6, "num_traps": 2, "num_episodes": 100,
            "num_trials": 2, "seed": 42,
        })
        assert result["status"] == "COMPLETED"
        assert result["total_runs"] == 4  # 2 agents × 2 trials
        assert "Q_LEARNING" in result["summary"]
        assert "SARSA" in result["summary"]

    def test_single_agent(self):
        runner = RLRunner()
        result = runner.run({
            "agents": ["Q_LEARNING"], "grid_size": 5, "num_traps": 1,
            "num_episodes": 50, "num_trials": 1, "seed": 42,
        })
        assert result["total_runs"] == 1

    def test_world_seed_reproducibility(self):
        """同 seed 生成的世界应完全一致。"""
        env1 = GridWorld(size=8, num_traps=3, seed=42)
        env1.reset()
        env2 = GridWorld(size=8, num_traps=3, seed=42)
        env2.reset()
        assert env1.grid == env2.grid
        assert env1.gold == env2.gold
        assert env1.traps == env2.traps

    def test_run_fields_complete(self):
        runner = RLRunner()
        result = runner.run({
            "agents": ["Q_LEARNING"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 100, "num_trials": 1, "seed": 42,
        })
        r = result["runs"][0]
        for key in ("agent", "grid_size", "train_rewards", "train_success",
                     "avg_reward", "success_rate", "test_success", "test_reward",
                     "test_path", "world", "runtime_ms"):
            assert key in r, f"Missing key: {key}"
        assert len(r["train_rewards"]) == 100
        assert len(r["test_path"]) >= 1

    def test_summary_aggregation(self):
        runner = RLRunner()
        result = runner.run({
            "agents": ["Q_LEARNING", "SARSA"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 100, "num_trials": 3, "seed": 42,
        })
        for name in ("Q_LEARNING", "SARSA"):
            assert name in result["summary"]
            s = result["summary"][name]
            assert s["count"] == 3
            assert -10 <= s["avg_reward"] <= 10
            assert 0 <= s["avg_success_rate"] <= 1


class TestEvalCompare:
    """eval_compare 轨迹对比 + 策略快照"""

    def test_returns_all_keys(self):
        runner = RLRunner()
        result = runner.run_eval_compare({
            "agents": ["Q_LEARNING", "SARSA"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 100, "learning_rate": 0.1, "discount": 0.9,
            "epsilon": 0.1, "seed": 42,
        })
        for key in ("status", "world", "compare_paths", "compare_decisions",
                     "q_snapshots", "train_rewards", "train_success",
                     "summary", "grid_size", "num_episodes"):
            assert key in result, f"Missing key: {key}"
        assert result["status"] == "COMPLETED"

    def test_compare_decisions_structure(self):
        """验证每步决策包含 Q 值详情。"""
        runner = RLRunner()
        result = runner.run_eval_compare({
            "agents": ["Q_LEARNING"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 100, "seed": 42,
        })
        decs = result["compare_decisions"]["Q_LEARNING"]
        assert len(decs) > 0
        for d in decs:
            assert "step" in d
            assert "state" in d
            assert "action" in d
            assert "q_values" in d
            assert "best_action" in d
            assert len(d["q_values"]) == 4
            assert 0 <= d["action"] <= 3

    def test_compare_paths_both_agents(self):
        runner = RLRunner()
        result = runner.run_eval_compare({
            "agents": ["Q_LEARNING", "SARSA"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 100, "seed": 42,
        })
        for agent in ("Q_LEARNING", "SARSA"):
            assert agent in result["compare_paths"]
            path = result["compare_paths"][agent]
            assert len(path) >= 1
            assert all(len(p) == 2 for p in path)

    def test_q_snapshots_structure(self):
        runner = RLRunner()
        result = runner.run_eval_compare({
            "agents": ["Q_LEARNING", "SARSA"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 200, "seed": 42,
        })
        snaps = result["q_snapshots"]
        assert len(snaps) > 0, "Should have at least one snapshot"
        for snap in snaps:
            assert "episode" in snap
            assert "agent" in snap
            assert "cells" in snap
            assert "epsilon" in snap
            cells = snap["cells"]
            assert len(cells) == result["grid_size"]
            for row in cells:
                assert len(row) == result["grid_size"]
                for cell in row:
                    assert "best_action" in cell
                    assert "max_q" in cell
                    assert "q_values" in cell
                    assert 0 <= cell["best_action"] <= 3
                    assert len(cell["q_values"]) == 4

    def test_same_world_shared(self):
        """两个 agent 共享同一地图（同 seed 生成相同 world）。"""
        runner = RLRunner()
        result = runner.run_eval_compare({
            "agents": ["Q_LEARNING", "SARSA"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 50, "seed": 42,
        })
        world = result["world"]
        assert world["size"] == 6
        assert len(world["traps"]) == 2

    def test_epsilon_zero_eval(self):
        """eval 阶段 ε=0，确保纯贪婪路径无探索噪声。"""
        runner = RLRunner()
        result = runner.run_eval_compare({
            "agents": ["Q_LEARNING"], "grid_size": 6, "num_traps": 2,
            "num_episodes": 100, "seed": 42,
        })
        # 检查快照中最后的 epsilon 接近 0
        snaps = result["q_snapshots"]
        last_snap = snaps[-1]
        assert last_snap["epsilon"] < 0.12  # 训练末段 ε 已衰减
