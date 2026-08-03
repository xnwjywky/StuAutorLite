"""测试反思问题生成 — 各实验专属题库（4 独有 + 1 通用）+ 模板回答（≤2 填空、按评分分层）"""
import pytest

from app.api.routes.reflection_content import EXPERIMENT_CONFIGS, COMMON_QUESTIONS
from app.api.routes.reflection import CATEGORY_LABELS, COMMON_CATEGORY


@pytest.mark.anyio
class TestReflectionGeneration:
    """不同实验应生成对应实验专属的反思问题与模板"""

    TASKS = [
        "maze_pathfinding",
        "simple_classification",
        "guess_number",
        "visual_algo_compare",
        "shape_recognition",
        "digit_recognition",
        "image_recognition",
        "rl_gridworld",
        "mnist_cnn",
    ]

    async def _gen_for_task(self, client, task_id: str, session_id: int | None = None) -> list[dict]:
        """创建真实 session 或使用显式 task_id（demo 会话）生成问题"""
        if session_id is None:
            s = await client.post("/api/research/sessions/", json={"task_id": task_id})
            assert s.status_code == 200
            session_id = s.json()["id"]
        r = await client.post("/api/reflection/generate", json={"session_id": session_id, "task_id": task_id})
        assert r.status_code == 200
        return r.json()["questions"]

    @pytest.mark.parametrize("task_id", TASKS)
    async def test_experiment_specific_questions(self, client, task_id):
        """前 4 题来自该实验题库，最后一题是通用问题"""
        cfg = EXPERIMENT_CONFIGS[task_id]
        pool = {q for cat in cfg["questions"].values() for q in cat}
        common_pool = {q for qs in COMMON_QUESTIONS.values() for q in qs}
        qs = await self._gen_for_task(client, task_id)

        assert len(qs) == 5
        for q in qs[:4]:
            assert q["question_text"] in pool, f"{task_id} 生成了不属于该实验题库的问题: {q['question_text']}"
            assert q["category_label"] == CATEGORY_LABELS.get(q["category"], q["category"])
        assert qs[-1]["question_text"] in common_pool, "最后一题应为通用问题"
        assert qs[-1]["category_label"] == CATEGORY_LABELS[COMMON_CATEGORY]

    @pytest.mark.parametrize("task_id", TASKS)
    async def test_templates_tiered_and_short(self, client, task_id):
        """模板需按科研能力得分分层（2.0/3.5/5.0），填空 ≤2 个"""
        qs = await self._gen_for_task(client, task_id)

        for q in qs:
            assert len(q["template_answers"]) == 3
            scores = sorted(t["score"] for t in q["template_answers"])
            assert scores == [2.0, 3.5, 5.0], f"{task_id} 模板评分分层错误: {scores}"
            for t in q["template_answers"]:
                assert t["text"].count("____") <= 2, f"{task_id} 模板填空超过 2 个: {t['text']}"
                assert t["level"] in ("初步", "较好", "优秀")
                assert t["text"].strip()

    async def test_maze_and_rl_questions_differ(self, client):
        """迷宫与 RL 的问题应明显不同（强相关于各自实验）"""
        maze = await self._gen_for_task(client, "maze_pathfinding")
        rl = await self._gen_for_task(client, "rl_gridworld")
        maze_texts = {q["question_text"] for q in maze}
        rl_texts = {q["question_text"] for q in rl}
        # 独有问题部分（前 4 题）应不同，且 RL 问题包含 RL 专有术语
        maze_unique = {q["question_text"] for q in maze[:4]}
        rl_unique = {q["question_text"] for q in rl[:4]}
        assert maze_unique != rl_unique
        assert any("Q" in t or "SARSA" in t or "ε" in t or "强化" in t for t in rl_unique)

    async def test_demo_session_with_explicit_task_id(self, client):
        """demo 会话（无真实 session）显式传 task_id 应生成对应实验的问题"""
        rl = await self._gen_for_task(client, "rl_gridworld", session_id=-1)
        cfg = EXPERIMENT_CONFIGS["rl_gridworld"]
        pool = {q for cat in cfg["questions"].values() for q in cat}
        assert len(rl) == 5
        assert all(q["question_text"] in pool for q in rl[:4])

    async def test_unknown_task_falls_back_to_maze(self, client):
        """未知 task_id 应降级到迷宫题库（独有部分）"""
        qs = await self._gen_for_task(client, "unknown_task_xyz")
        pool = {q for cat in EXPERIMENT_CONFIGS["maze_pathfinding"]["questions"].values() for q in cat}
        assert all(q["question_text"] in pool for q in qs[:4])

    @pytest.mark.parametrize("composite", [
        "visual_algo_compare:sorting",
        "visual_algo_compare:stringsearch",
        "image_recognition:shape",
        "image_recognition:digits",
    ])
    async def test_submode_specific_questions(self, client, db, composite):
        """双模式实验的子模式应生成各自专属的问题（4 独有 + 1 通用）"""
        base, _, mode = composite.partition(":")
        cfg = EXPERIMENT_CONFIGS[base]
        mpool = {q for cat in cfg["modes"][mode]["questions"].values() for q in cat}
        common_pool = {q for qs in COMMON_QUESTIONS.values() for q in qs}
        qs = await self._gen_for_task(client, composite)
        assert len(qs) == 5
        assert all(q["question_text"] in mpool for q in qs[:4])
        assert qs[-1]["question_text"] in common_pool
        assert qs[0]["task_id"] == composite

    async def test_submodes_questions_differ(self, client, db):
        """排序与字符串、图形与数字的问题应不同且互不串扰"""
        sorting = await self._gen_for_task(client, "visual_algo_compare:sorting")
        search = await self._gen_for_task(client, "visual_algo_compare:stringsearch")
        assert {q["question_text"] for q in sorting[:4]} != {q["question_text"] for q in search[:4]}

        shape = await self._gen_for_task(client, "image_recognition:shape")
        digits = await self._gen_for_task(client, "image_recognition:digits")
        assert {q["question_text"] for q in shape[:4]} != {q["question_text"] for q in digits[:4]}

        # 互不读取：sorting 的读取不返回 stringsearch 的问题
        sorting_read = await client.get("/api/reflection/questions?session_id=-1&task_id=visual_algo_compare:sorting")
        search_read = await client.get("/api/reflection/questions?session_id=-1&task_id=visual_algo_compare:stringsearch")
        assert all(q["task_id"] == "visual_algo_compare:sorting" for q in sorting_read.json())
        assert all(q["task_id"] == "visual_algo_compare:stringsearch" for q in search_read.json())

    async def test_demo_session_cross_experiment_isolation(self, client, db):
        """同一 demo 会话（session_id=-1）下，不同实验的问题不得串扰"""
        from app.models.database import ReflectionQuestion
        # 清理该共享会话的历史数据，保证测试隔离（demo 会话复用 -1）
        db.query(ReflectionQuestion).filter(ReflectionQuestion.session_id == -1).delete()
        db.commit()

        # 猜数字先生成
        c1 = await client.post("/api/reflection/generate", json={"session_id": -1, "task_id": "guess_number"})
        assert c1.status_code == 200
        # 迷宫读取：应返回空，而不是猜数字的问题
        maze_read = await client.get("/api/reflection/questions?session_id=-1&task_id=maze_pathfinding")
        assert maze_read.json() == []
        # 迷宫再生成自己的问题
        c2 = await client.post("/api/reflection/generate", json={"session_id": -1, "task_id": "maze_pathfinding"})
        assert c2.status_code == 200
        maze_qs = await client.get("/api/reflection/questions?session_id=-1&task_id=maze_pathfinding")
        assert len(maze_qs.json()) == 5
        assert maze_qs.json()[0]["task_id"] == "maze_pathfinding"
        # 猜数字的问题应被保留（不误删其他实验）
        guess_qs = await client.get("/api/reflection/questions?session_id=-1&task_id=guess_number")
        assert len(guess_qs.json()) == 5
        assert guess_qs.json()[0]["task_id"] == "guess_number"
