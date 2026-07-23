"""强化学习智能体 — Q-learning + SARSA

核心设计原则（面向中小学生）：
- 状态 = 格子坐标 (x, y)，Q 表直接用 (y, x, a) 三维存储
- 简洁的 ε-greedy 探索策略
- Q-learning: 用 max_a' Q(s', a') 更新（off-policy）
- SARSA: 用实际选取的 a' 更新（on-policy）
"""
import random


class RLAgent:
    """RL 智能体基类。"""

    name: str = "base"

    def __init__(self, learning_rate: float = 0.1, discount: float = 0.9, epsilon: float = 0.1):
        self.lr = max(0.001, min(learning_rate, 1.0))
        self.gamma = max(0.0, min(discount, 1.0))
        self.epsilon = max(0.0, min(epsilon, 1.0))
        self.Q: dict[tuple[int, int, int], float] = {}  # (y, x, a) → value
        self.size = 8
        self.n_actions = 4

    def init_episode(self, size: int):
        """每局开始前设置地图大小。"""
        self.size = size

    def _q(self, y: int, x: int, a: int) -> float:
        return self.Q.get((y, x, a), 0.0)

    def _set_q(self, y: int, x: int, a: int, v: float):
        self.Q[(y, x, a)] = v

    def select_action(self, state: tuple[int, int]) -> int:
        """ε-greedy: 以 ε 概率随机探索，否则选 Q 值最高的动作。"""
        x, y = state
        if random.random() < self.epsilon:
            return random.randrange(self.n_actions)
        # 取 Q 值最大的动作（ties 随机 break）
        best_val = float("-inf")
        best = 0
        for a in range(self.n_actions):
            v = self._q(y, x, a)
            if v > best_val or (v == best_val and random.random() < 0.5):
                best_val = v
                best = a
        return best

    def best_action(self, state: tuple[int, int]) -> int:
        """纯贪婪选择（测试时使用）。"""
        x, y = state
        best_val = float("-inf")
        best = 0
        for a in range(self.n_actions):
            v = self._q(y, x, a)
            if v > best_val:
                best_val = v
                best = a
        return best


class QLearningAgent(RLAgent):
    """Q-learning: off-policy，用 max_a' Q(s', a') 计算目标值。"""

    name = "Q-learning"

    def update(self, s: tuple[int, int], a: int, r: float, s_next: tuple[int, int], done: bool):
        x, y = s
        nx, ny = s_next
        old = self._q(y, x, a)
        max_next = 0.0 if done else max(self._q(ny, nx, a2) for a2 in range(self.n_actions))
        target = r + self.gamma * max_next
        self._set_q(y, x, a, old + self.lr * (target - old))


class SARSAAgent(RLAgent):
    """SARSA: on-policy，用实际选取的 a' 计算目标值。"""

    name = "SARSA"

    def update(
        self, s: tuple[int, int], a: int, r: float, s_next: tuple[int, int],
        a_next: int, done: bool,
    ):
        x, y = s
        nx, ny = s_next
        old = self._q(y, x, a)
        q_next = 0.0 if done else self._q(ny, nx, a_next)
        target = r + self.gamma * q_next
        self._set_q(y, x, a, old + self.lr * (target - old))
