# StuAutorLite — AI 科研体验平台

面向中小学生的 AI 辅助科研体验平台。通过多智能体引导、算法实验沙盒、可视化过程和自动反馈机制，帮助学生体验"提出问题 → 形成假设 → 设计实验 → 运行实验 → 分析结果 → 反思改进 → 生成报告 → 获得反馈"的科研全流程。

## 快速启动

```bash
# 1. 后端 (Python 3.12 + FastAPI)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. 前端 (Node.js + React 18 + Vite)
cd frontend
npm install
npm run dev

# 3. 运行测试
cd .. && python run_tests.py
```

前端 http://localhost:5173 | API 文档 http://localhost:8000/docs

> 局域网其他设备通过 `http://<本机IP>:5173` 访问；前端已配置 `host: "0.0.0.0"`。

## 实验任务

| 实验 | 算法/策略 | 路由 | 特点 |
|------|----------|------|------|
| 🧭 迷宫寻路 | BFS / DFS / A\* / Dijkstra / 贪心 / 双向BFS / IDDFS / RandomWalk | `/workbench/:id` | Canvas 搜索动画 + 迷宫编辑 |
| 🖼️ 图像分类 | KNN / 决策树 / 随机基线 | `/workbench-classify/:id` | 决策边界动画 + 2D 数据 |
| 🎯 猜数字 | 二分查找 / 随机 / 线性扫描 | `/workbench-guess/:id` | 步进式猜测动画 |
| 📈 可视化算法 | 冒泡/选择/归并/快排 + 暴力/KMP/BM/RK | `/workbench-sort/:id` | 排序柱状动画 + 字符串搜索 |
| 👁️ 图形识别 | 模板匹配 / 像素KNN / 特征分类 / 随机 | `/workbench-shape/:id` | 16×16 像素图形 + ShapeGrid 动画 |

所有实验共享 9 阶段研究流程（问题→假设→设计→运行→分析→反思→报告→审稿），配有 AI Agent 引导。

## AI Agent

6 个内置 Agent，LLM 优先调用 → 失败降级模板。支持 OpenAI / Anthropic / DeepSeek / 硅基流动。

- Research Mentor — 引导提出研究问题
- Experiment Designer — 检查实验公平性
- Data Analyst — 分析实验结果
- Algorithm Tutor — 解释算法原理
- Reflection — 引导反思局限
- Reviewer — 审稿评分

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite 5 + Tailwind CSS + Zustand + Recharts |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy + Pydantic |
| 数据库 | SQLite |
| 算法 | 纯 Python（无 NumPy/sklearn 依赖） |
| 测试 | pytest 106 用例 + vitest 67 用例 |

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── api/routes/        # REST API (10 模块, 40+ 端点)
│   │   ├── core/
│   │   │   ├── algorithms/    # 迷宫搜索算法 (8 个)
│   │   │   ├── classification/ # 分类器 + 2D 数据生成
│   │   │   ├── guessnumber/   # 猜数字策略
│   │   │   ├── sorting/       # 排序算法
│   │   │   ├── stringsearch/  # 字符串搜索算法
│   │   │   └── shaperecog/    # 图形识别算法
│   │   ├── agents/            # 6 AI Agent
│   │   ├── models/            # 数据库 ORM + Pydantic Schema
│   │   └── services/          # AgentGateway / ReportGenerator
│   └── tests/                 # pytest
├── frontend/
│   └── src/
│       ├── pages/             # 5 个工作台 + 首页
│       ├── components/        # 12 个共享组件
│       └── stores/            # 8 个 Zustand Store
└── run_tests.py               # 一键测试运行器
```

## License

MIT
