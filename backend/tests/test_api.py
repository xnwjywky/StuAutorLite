"""测试所有 REST API 端点"""
import pytest


@pytest.mark.anyio
class TestHealthAPI:
    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_root(self, client):
        resp = await client.get("/")
        assert resp.status_code == 200
        assert "message" in resp.json()


@pytest.mark.anyio
class TestSessionAPI:
    async def test_create_and_list_sessions(self, client):
        # 创建
        resp = await client.post("/api/research/sessions/", json={"task_id": "maze_pathfinding"})
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["current_stage"] == "TASK_SELECTED"

        # 列出
        resp2 = await client.get("/api/research/sessions/")
        assert resp2.status_code == 200
        assert isinstance(resp2.json(), list)

    async def test_session_lifecycle(self, client):
        # 创建 → 获取 → 更新阶段 → 删除
        resp = await client.post("/api/research/sessions/", json={"task_id": "maze_pathfinding"})
        sid = resp.json()["id"]

        resp2 = await client.get(f"/api/research/sessions/{sid}")
        assert resp2.status_code == 200
        assert resp2.json()["current_stage"] == "TASK_SELECTED"

        resp3 = await client.put(f"/api/research/sessions/{sid}/stage?stage=HYPOTHESIS_WRITTEN")
        assert resp3.status_code == 200

        resp4 = await client.get(f"/api/research/sessions/{sid}/stages")
        assert resp4.status_code == 200

        resp5 = await client.delete(f"/api/research/sessions/{sid}")
        assert resp5.status_code == 200


@pytest.mark.anyio
class TestExperimentAPI:
    async def test_run_maze_experiment(self, client):
        # 先创建会话
        resp = await client.post("/api/research/sessions/", json={"task_id": "maze_pathfinding"})
        sid = resp.json()["id"]

        resp2 = await client.post("/api/experiments/run", json={
            "session_id": sid,
            "algorithms": ["BFS"],
            "settings": {"maze_size": [8, 8], "num_trials": 2, "obstacle_ratios": [0.2]},
        })
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["status"] == "COMPLETED"
        assert data["total_runs"] == 2
        assert len(data["runs"]) == 2

    async def test_run_classification_experiment(self, client):
        resp = await client.post("/api/research/sessions/", json={"task_id": "simple_classification"})
        sid = resp.json()["id"]

        resp2 = await client.post("/api/classify/run", json={
            "session_id": sid,
            "classifiers": ["KNN"],
            "settings": {"n_samples": 50, "noise_levels": [0.0], "num_trials": 2},
        })
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["status"] == "COMPLETED"
        assert data["total_runs"] == 2

    async def test_list_maze_runs(self, client):
        resp = await client.get("/api/experiments/runs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_classify_runs(self, client):
        resp = await client.get("/api/classify/runs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


@pytest.mark.anyio
class TestSecurityBounds:
    async def test_maze_bounds_enforced(self, client):
        """API 应拒绝过大的参数值。"""
        resp = await client.post("/api/research/sessions/", json={"task_id": "maze_pathfinding"})
        sid = resp.json()["id"]

        resp2 = await client.post("/api/experiments/run", json={
            "session_id": sid,
            "algorithms": ["BFS"],
            "settings": {"maze_size": [500, 500], "num_trials": 999, "obstacle_ratios": [0.2]},
        })
        # 应成功但迷宫大小被限制在 50 以内
        assert resp2.status_code == 200
        data = resp2.json()
        run = data["runs"][0]
        assert run["maze_size"][0] <= 50, f"迷宫宽度被限制: {run['maze_size']}"

    async def test_classify_bounds_enforced(self, client):
        resp = await client.post("/api/research/sessions/", json={"task_id": "simple_classification"})
        sid = resp.json()["id"]

        resp2 = await client.post("/api/classify/run", json={
            "session_id": sid,
            "classifiers": ["KNN"],
            "settings": {"n_samples": 50000, "num_trials": 999, "max_depth": 9999},
        })
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["total_runs"] <= 20  # num_trials 被限制

    async def test_invalid_session_id(self, client):
        resp = await client.get("/api/research/sessions/99999")
        assert resp.status_code in [200, 404]  # 取决于数据库内容

    async def test_question_endpoint(self, client):
        resp = await client.post("/api/research/sessions/", json={"task_id": "maze_pathfinding"})
        sid = resp.json()["id"]

        resp2 = await client.post("/api/research/questions/", json={
            "session_id": sid,
            "raw_question": "测试问题",
            "refined_question": "细化后的问题",
            "independent_variable": "var",
            "dependent_variables": ["a", "b"],
            "controlled_variables": ["c"],
        })
        assert resp2.status_code == 200

    async def test_save_hypothesis(self, client):
        resp = await client.post("/api/research/sessions/", json={"task_id": "maze_pathfinding"})
        sid = resp.json()["id"]

        resp2 = await client.post("/api/agents/save-hypothesis", json={
            "session_id": sid,
            "student_text": "我的假设",
        })
        assert resp2.status_code == 200
